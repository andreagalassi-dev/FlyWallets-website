// Regression tests for the second independent review: verified-email gate by router (not path), refresh-token
// families vs logout, scalar-only input validation (no 5xx), "tomorrow" snapshots, recurring limits, RLS on
// categories.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, pool, appPool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const { withUserContext } = require("../src/config/db");
const { sha256 } = require("../src/utils/security");
const { processDue } = require("../src/services/recurringService");
const env = require("../src/config/env");

let ready;
before(async (t) => {
  ready = await dbSuite(t);
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const DAY = 86400000;
const isoDay = (ms = Date.now()) => new Date(ms).toISOString().slice(0, 10);
const cookieValue = (res, name) =>
  (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${name}=`))?.slice(name.length + 1).split(";")[0];
const newAccount = async (agent, initial_balance = 100) => {
  const res = await agent.post("/api/accounts/manual").send({ account_name: `R ${Math.random()}`, account_type: "checking", initial_balance });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.account;
};

// ---------- 1. verified-email gate is decided by the router, whatever the path casing ----------

test("verified-email gate cannot be bypassed with path casing or trailing slashes", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("gatecase");
  const original = env.requireVerifiedEmail;
  const writes = [
    ["post", "/API/ACCOUNTS/manual", { account_name: "A", account_type: "cash" }],
    ["post", "/Api/Accounts/Manual/", { account_name: "A", account_type: "cash" }],
    ["post", "/api/Transactions", {}],
    ["post", "/api/transactions/", {}],
    ["post", "/API/GOALS/", { goal_name: "g", target_amount: 1 }],
    ["post", "/api/CATEGORIES", { category_name: "c", category_type: "expense" }],
    ["post", "/api/Budgets", {}],
    ["post", "/api/RECURRING/", {}],
    ["post", "/API/DATA/import/transactions", {}],
  ];
  try {
    env.requireVerifiedEmail = true;
    for (const [m, path, body] of writes) {
      const r = await agent[m](path).send(body);
      assert.equal(r.status, 403, `${m} ${path} -> ${r.status}`);
      assert.equal(r.body.code, "EMAIL_NOT_VERIFIED");
    }
    // ungated routers stay open, reads stay open
    assert.equal((await agent.get("/API/DASHBOARD")).status, 200);
    assert.equal((await agent.post("/Api/Ai/categorize").send({ description: "Esselunga" })).status, 200);
    assert.equal((await agent.get("/API/ACCOUNTS/")).status, 200);

    env.requireVerifiedEmail = false;
    assert.equal((await agent.post("/API/ACCOUNTS/manual").send({ account_name: "B", account_type: "cash" })).status, 201);
    assert.equal((await agent.post("/api/Goals/").send({ goal_name: "g", target_amount: 1 })).status, 201);
  } finally {
    env.requireVerifiedEmail = original;
  }
});

// ---------- 2. refresh-token families ----------

test("after refresh + logout, the rotated token is dead even inside the grace window", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId } = await registerUser("famlogout");
  const t1 = cookieValue(res, "refresh_token");
  const r = await agent.post("/api/auth/refresh-token"); // T1 -> T2
  const t2 = cookieValue(r, "refresh_token");
  assert.ok(t2);
  assert.equal((await agent.post("/api/auth/logout")).status, 200);

  for (const tok of [t1, t2]) {
    const replay = await request(app).post("/api/auth/refresh-token").set("Cookie", `refresh_token=${tok}`);
    assert.equal(replay.status, 403);
    assert.equal(cookieValue(replay, "access_token"), undefined, "no access token minted");
  }
  assert.equal((await pool.query("SELECT COUNT(*)::int n FROM sessions WHERE user_id = $1", [userId])).rows[0].n, 0);
});

test("logout with a stale (rotated) cookie revokes the whole family, other logins survive", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId, email } = await registerUser("famstale");
  const t1 = cookieValue(res, "refresh_token");
  await agent.post("/api/auth/refresh-token"); // T1 -> T2 (agent now holds T2)
  const other = request.agent(app);
  assert.equal((await other.post("/api/auth/login").send({ email, password: "Test1234!" })).status, 200);

  await request(app).post("/api/auth/logout").set("Cookie", `refresh_token=${t1}`);
  assert.equal((await agent.post("/api/auth/refresh-token")).status, 403, "T2 belongs to the logged-out family");
  assert.equal((await other.post("/api/auth/refresh-token")).status, 200, "an independent login is untouched");

  const fams = await pool.query("SELECT COUNT(DISTINCT family_id)::int n FROM sessions WHERE user_id = $1", [userId]);
  assert.equal(fams.rows[0].n, 1);
});

test("grace window requires a live head: rotated token after the head was revoked is refused", async (t) => {
  if (!ready) return t.skip();
  const { agent, res } = await registerUser("famhead");
  const t1 = cookieValue(res, "refresh_token");
  const t2 = cookieValue(await agent.post("/api/auth/refresh-token"), "refresh_token");
  await pool.query("DELETE FROM sessions WHERE session_token = $1", [sha256(t2)]); // head gone, T1 still in grace
  const replay = await request(app).post("/api/auth/refresh-token").set("Cookie", `refresh_token=${t1}`);
  assert.equal(replay.status, 403);
  assert.equal(cookieValue(replay, "access_token"), undefined);
});

// ---------- 3. scalar-only validation: nothing reaches PostgreSQL as an array / object / NUL ----------

test("fuzz: arrays, objects, NUL bytes, huge numbers and non-JSON bodies never cause a 5xx", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("fuzz");
  const acc = await newAccount(agent, 1000);
  const cats = (await agent.get("/api/categories")).body.data.categories;
  const cat = cats.find((c) => c.category_type === "expense");
  const today = isoDay();
  const base = { manual_account_id: acc.id, transaction_date: today, amount: 5, transaction_type: "expense", description: "x" };
  const tx = (await agent.post("/api/transactions").send(base)).body.data.transaction;
  const goal = (await agent.post("/api/goals").send({ goal_name: "g", target_amount: 10 })).body.data.goal;
  const budget = (await agent.post("/api/budgets").send({ category_id: cat.id, monthly_limit: 100 })).body.data;
  const budgetId = budget?.budget?.id || "00000000-0000-4000-8000-000000000000";
  const ruleBase = { manual_account_id: acc.id, amount: 1, transaction_type: "expense", description: "r", frequency: "monthly", start_date: "2030-01-01" };
  const rule = (await agent.post("/api/recurring").send(ruleBase)).body.data.recurring;
  const custom = (await agent.post("/api/categories").send({ category_name: "Fz", category_type: "expense" })).body.data.category;

  const json = [
    ["post", "/api/transactions", { ...base, amount: ["5"] }],
    ["post", "/api/transactions", { ...base, amount: [5, 6] }],
    ["post", "/api/transactions", { ...base, manual_account_id: [acc.id] }],
    ["post", "/api/transactions", { ...base, category_id: [cat.id] }],
    ["post", "/api/transactions", { ...base, transaction_type: ["income"] }],
    ["post", "/api/transactions", { ...base, transaction_date: [today] }],
    ["post", "/api/transactions", { ...base, notes: { a: 1 } }],
    ["post", "/api/transactions", { ...base, tags: [{ a: 1 }] }],
    ["post", "/api/transactions", { ...base, tags: "abc" }],
    ["post", "/api/transactions", { ...base, amount: 1e300 }],
    ["post", "/api/transactions", { ...base, amount: "1e2" }],
    ["post", "/api/transactions", { ...base, description: "\u0000abc" }],
    ["post", "/api/transactions", { ...base, notes: "a\u0000b" }],
    ["put", `/api/transactions/${tx.id}`, { amount: ["7"] }],
    ["put", `/api/transactions/${tx.id}`, { transaction_type: ["income"] }],
    ["put", `/api/transactions/${tx.id}`, { category_id: [cat.id] }],
    ["put", `/api/transactions/${tx.id}`, { manual_account_id: [acc.id] }],
    ["put", `/api/transactions/${tx.id}`, { description: "\u0000" }],
    ["put", `/api/transactions/${tx.id}`, []],
    ["post", "/api/accounts/manual", { account_name: ["x"], account_type: "cash" }],
    ["post", "/api/accounts/manual", { account_name: "x\u0000", account_type: "cash" }],
    ["post", "/api/accounts/manual", { account_name: "x", account_type: "cash", initial_balance: [1] }],
    ["post", "/api/accounts/manual", { account_name: "x", account_type: "cash", initial_balance: 1e300 }],
    ["post", "/api/accounts/manual", { account_name: "x", account_type: "cash", overdraft_limit: [5] }],
    ["put", `/api/accounts/manual/${acc.id}`, { overdraft_allowed: [true] }],
    ["put", `/api/accounts/manual/${acc.id}`, { color_tag: { a: 1 } }],
    ["post", "/api/categories", { category_name: ["x"], category_type: "expense" }],
    ["post", "/api/categories", { category_name: "x", category_type: ["expense"] }],
    ["post", "/api/goals", { goal_name: "g", target_amount: 10, target_date: ["2027-01-01"] }],
    ["post", "/api/goals", { goal_name: "g", target_amount: [10] }],
    ["put", `/api/goals/${goal.id}`, { is_completed: [true] }],
    ["post", `/api/goals/${goal.id}/contribute`, { amount: ["1"] }],
    ["post", `/api/goals/${goal.id}/contribute`, { amount: 1, manual_account_id: [acc.id] }],
    ["post", "/api/budgets", { category_id: cat.id, monthly_limit: ["10"] }],
    ["post", "/api/budgets", { category_id: [cat.id], monthly_limit: 10 }],
    ["post", "/api/budgets", { category_id: cat.id, monthly_limit: 10, alert_threshold: [50] }],
    ["put", `/api/budgets/${budgetId}`, { is_active: [true] }],
    ["put", `/api/budgets/${budgetId}`, { monthly_limit: 1e300 }],
    ["post", "/api/recurring", { ...ruleBase, frequency: ["daily"] }],
    ["post", "/api/recurring", { ...ruleBase, start_date: [today] }],
    ["post", "/api/recurring", { ...ruleBase, description: "r\u0000" }],
    ["post", "/api/recurring", { ...ruleBase, start_date: "0000-01-01" }],
    ["put", `/api/recurring/${rule.id}`, { is_active: [true] }],
    ["put", `/api/recurring/${rule.id}`, { amount: ["2"] }],
    ["put", `/api/recurring/${rule.id}`, { end_date: [today] }],
    ["post", "/api/data/import/transactions", { manual_account_id: [acc.id], csv: "date,amount,description\n2026-01-01,1,x" }],
    ["post", "/api/ai/categorize", { description: ["Esselunga"] }],
    ["put", "/api/auth/profile", { first_name: ["Mario"] }],
    ["put", "/api/auth/profile", { first_name: "Ma\u0000rio" }],
    ["post", "/api/auth/login", { email: ["a@b.it"], password: "x" }],
    ["post", "/api/auth/forgot-password", { email: ["a@b.it"] }],
    ["post", "/api/auth/verify-email", { code: ["123456"] }],
    ["delete", `/api/categories/${custom.id}`, undefined],
  ];
  const gets = [
    `/api/transactions?page=1&page=2`,
    `/api/transactions?search=a&search=b`,
    `/api/transactions?account_id[]=x`,
    `/api/transactions?search=%00`,
    `/api/transactions?from_date=2026-01-01&from_date=2026-02-01`,
    `/api/accounts/${acc.id}/history?from_date=2026-01-01&from_date=2026-02-01`,
    `/api/dashboard/networth?days=30&days=90`,
    `/api/data/export/transactions.csv?account_id=${acc.id}&account_id=${acc.id}`,
    `/api/recurring/not-a-uuid`,
  ];
  const plain = [
    ["put", `/api/recurring/${rule.id}`],
    ["put", `/api/budgets/${budgetId}`],
    ["put", `/api/accounts/manual/${acc.id}`],
    ["put", `/api/goals/${goal.id}`],
    ["put", `/api/transactions/${tx.id}`],
    ["post", "/api/recurring/process"],
    ["post", "/api/transactions"],
    ["post", "/api/accounts/manual"],
    ["post", `/api/goals/${goal.id}/contribute`],
  ];

  const failures = [];
  for (const [m, url, body] of json) {
    const r = body === undefined ? await agent[m](url) : await agent[m](url).send(body);
    if (r.status >= 500) failures.push(`${m.toUpperCase()} ${url} ${JSON.stringify(body)} -> ${r.status}`);
  }
  for (const url of gets) {
    const r = await agent.get(url);
    if (r.status >= 500) failures.push(`GET ${url} -> ${r.status}`);
  }
  for (const [m, url] of plain) {
    const r = await agent[m](url).set("Content-Type", "text/plain").send("hello");
    if (r.status >= 500) failures.push(`${m.toUpperCase()} ${url} text/plain -> ${r.status}`);
  }
  assert.deepEqual(failures, []);

  // the important ones are explicit 400s, and nothing was written
  const arr = await agent.post("/api/transactions").send({ ...base, amount: ["5"] });
  assert.equal(arr.status, 400);
  assert.equal((await agent.post("/api/transactions").send({ ...base, description: "\u0000abc" })).status, 400);
  assert.equal((await agent.get("/api/transactions?page=1&page=2")).status, 400);
  assert.equal((await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [acc.id])).rows[0].current_balance, 995);
});

// ---------- 4. "tomorrow" transactions ----------

test("a transaction dated tomorrow pre-writes tomorrow's snapshot; moving/deleting it fixes that row", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("tomorrow");
  const acc = await newAccount(agent, 100);
  const today = isoDay();
  const tomorrow = isoDay(Date.now() + DAY);
  const snap = async (day) =>
    (await pool.query("SELECT balance_amount FROM account_balances WHERE manual_account_id = $1 AND balance_date = $2", [acc.id, day])).rows[0]?.balance_amount;

  const tx = await agent.post("/api/transactions").send({
    manual_account_id: acc.id, transaction_date: `${tomorrow}T00:00:00Z`, amount: 30, transaction_type: "expense", description: "domani",
  });
  assert.equal(tx.status, 201, JSON.stringify(tx.body));
  assert.equal(await snap(today), 100, "today's end-of-day balance excludes tomorrow's payment");
  assert.equal(await snap(tomorrow), 70, "tomorrow's row exists before the day arrives (carried forward by charts)");
  const hist = (await agent.get(`/api/accounts/${acc.id}/history`)).body.data.history;
  assert.equal(hist.at(-1).date, today, "history never shows future days");

  // net worth: today uses the live balance (which includes it)
  const nw = (await agent.get("/api/dashboard/networth?days=30")).body.data;
  assert.equal(nw.end, 70);

  // moving it to the past rewrites the future row as well
  await agent.put(`/api/transactions/${tx.body.data.transaction.id}`).send({ transaction_date: `${today}T00:00:00Z`, amount: 40 });
  assert.equal(await snap(today), 60);
  assert.equal(await snap(tomorrow), 60);
  await agent.delete(`/api/transactions/${tx.body.data.transaction.id}`);
  assert.equal(await snap(today), 100);
  assert.equal(await snap(tomorrow), 100);
});

// ---------- 5. recurring: active-rule cap, per-user scheduler budget ----------

test("recurring: at most 50 active rules per user (create and resume), paused rules do not count", async (t) => {
  if (!ready) return t.skip();
  const { agent, userId } = await registerUser("reccap");
  const acc = await newAccount(agent, 100);
  await pool.query(
    `INSERT INTO recurring_transactions (user_id, manual_account_id, amount, transaction_type, description, frequency, start_date, next_run_date)
     SELECT $1, $2, 1, 'expense', 'r' || g, 'monthly', '2030-01-01', '2030-01-01' FROM generate_series(1, 50) g`,
    [userId, acc.id]
  );
  const body = { manual_account_id: acc.id, amount: 1, transaction_type: "expense", description: "one too many", frequency: "monthly", start_date: "2030-01-01" };
  const over = await agent.post("/api/recurring").send(body);
  assert.equal(over.status, 409);
  assert.equal(over.body.code, "RECURRING_LIMIT");

  const someRule = (await pool.query("SELECT id FROM recurring_transactions WHERE user_id = $1 LIMIT 1", [userId])).rows[0].id;
  assert.equal((await agent.put(`/api/recurring/${someRule}`).send({ is_active: false })).status, 200);
  const created = await agent.post("/api/recurring").send(body);
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const resume = await agent.put(`/api/recurring/${someRule}`).send({ is_active: true });
  assert.equal(resume.status, 409);
  assert.equal(resume.body.code, "RECURRING_LIMIT");
});

test("recurring scheduler: every user gets its own time box and a backlog is carried over", async (t) => {
  if (!ready) return t.skip();
  const users = [await registerUser("schedA"), await registerUser("schedB")];
  const now = new Date();
  for (const u of users) {
    const acc = await newAccount(u.agent, 100000);
    const start = isoDay(now.getTime() - 40 * DAY);
    await pool.query(
      `INSERT INTO recurring_transactions (user_id, manual_account_id, amount, transaction_type, description, frequency, start_date, next_run_date)
       VALUES ($1, $2, 1, 'expense', 'daily', 'daily', $3, $3)`,
      [u.userId, acc.id, start]
    );
  }
  const boxed = await processDue({ now, perUserBudgetMs: 1 });
  assert.ok(boxed.pendingUsers >= 2, JSON.stringify(boxed));
  assert.ok(boxed.users >= 2, "the second user is still visited");

  const full = await processDue({ now });
  assert.equal(full.pendingUsers, 0, JSON.stringify(full));
  for (const u of users) {
    const n = await pool.query("SELECT COUNT(*)::int n FROM transactions WHERE user_id = $1", [u.userId]);
    assert.equal(n.rows[0].n, 41, "every occurrence generated exactly once across runs");
  }
});

// ---------- 6. RLS: categories must be visible to the row's owner ----------

test("RLS: restricted role cannot attach another tenant's category to a transaction or recurring rule", async (t) => {
  if (!ready) return t.skip();
  if (appPool === pool) return t.skip("restricted role not configured");
  const A = await registerUser("rlscatA");
  const B = await registerUser("rlscatB");
  const catA = (await A.agent.post("/api/categories").send({ category_name: "Privata", category_type: "expense" })).body.data.category;
  const accB = await newAccount(B.agent, 100);
  const sys = (await pool.query("SELECT id FROM transaction_categories WHERE is_system = true AND category_type = 'expense' LIMIT 1")).rows[0].id;

  await assert.rejects(
    withUserContext(B.userId, (db) =>
      db.query(
        `INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description, category_id)
         VALUES ($1, $2, NOW(), 1, 'expense', 'x', $3)`,
        [B.userId, accB.id, catA.id]
      )
    ),
    /row-level security/
  );
  await assert.rejects(
    withUserContext(B.userId, (db) =>
      db.query(
        `INSERT INTO recurring_transactions (user_id, manual_account_id, category_id, amount, transaction_type, description, frequency, start_date, next_run_date)
         VALUES ($1, $2, $3, 1, 'expense', 'x', 'monthly', '2030-01-01', '2030-01-01')`,
        [B.userId, accB.id, catA.id]
      )
    ),
    /row-level security/
  );
  // system categories and no category are fine
  await withUserContext(B.userId, (db) =>
    db.query(
      `INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description, category_id)
       VALUES ($1, $2, NOW(), 1, 'expense', 'x', $3), ($1, $2, NOW(), 1, 'expense', 'y', NULL)`,
      [B.userId, accB.id, sys]
    )
  );
});
