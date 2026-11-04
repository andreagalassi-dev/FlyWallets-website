// Core ledger hardening: PUT /transactions/:id, overdraft rules, backdated snapshots, verified-e-mail gate.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const env = require("../src/config/env");

let ready;
let A;
let B;
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("coreA");
  B = await registerUser("coreB");
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const api = (user) => ({
  get: (p) => user.agent.get(`/api${p}`),
  post: (p, body) => user.agent.post(`/api${p}`).send(body),
  put: (p, body) => user.agent.put(`/api${p}`).send(body),
  del: (p) => user.agent.delete(`/api${p}`),
});
const balanceOf = async (id) =>
  (await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [id])).rows[0].current_balance;
const goalOf = async (id) =>
  (await pool.query("SELECT current_amount, is_completed FROM savings_goals WHERE id = $1", [id])).rows[0];
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);

const newAccount = async (user, initial_balance = 0, extra = {}) => {
  const res = await api(user).post("/accounts/manual", { account_name: `Acc ${Math.random()}`, account_type: "checking", initial_balance, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.account;
};
const newTx = async (user, accId, body = {}) => {
  const res = await api(user).post("/transactions", {
    manual_account_id: accId, transaction_date: now(), amount: 10, transaction_type: "expense", description: "x", ...body,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.transaction;
};

// ---------- PUT /transactions/:id ----------

test("PUT transaction: amount and type changes revert the old effect and apply the new one", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = await newAccount(A, 1000);
  const tx = await newTx(A, acc.id, { amount: 100 });
  assert.equal(await balanceOf(acc.id), 900);

  const r1 = await a.put(`/transactions/${tx.id}`, { amount: 250.5, notes: "corrected", tags: ["fix"] });
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.data.transaction.amount, 250.5);
  assert.equal(r1.body.data.transaction.notes, "corrected");
  assert.deepEqual(r1.body.data.transaction.tags, ["fix"]);
  assert.equal(r1.body.data.transaction.description, "x", "untouched fields are kept");
  assert.equal(await balanceOf(acc.id), 749.5);

  const r2 = await a.put(`/transactions/${tx.id}`, { transaction_type: "income" });
  assert.equal(r2.status, 200, JSON.stringify(r2.body));
  assert.equal(await balanceOf(acc.id), 1250.5);

  const r3 = await a.put(`/transactions/${tx.id}`, { notes: null, description: "  renamed  " });
  assert.equal(r3.body.data.transaction.notes, null, "null clears notes");
  assert.equal(r3.body.data.transaction.description, "renamed");
  assert.equal(await balanceOf(acc.id), 1250.5, "cosmetic edits do not move money");
});

test("PUT transaction: moving to another account updates both balances", async (t) => {
  if (!ready) return t.skip();
  const from = await newAccount(A, 500);
  const to = await newAccount(A, 0);
  const tx = await newTx(A, from.id, { amount: 40, transaction_type: "income" });
  assert.equal(await balanceOf(from.id), 540);

  const res = await api(A).put(`/transactions/${tx.id}`, { manual_account_id: to.id, amount: 60 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.data.transaction.manual_account_id, to.id);
  assert.equal(await balanceOf(from.id), 500);
  assert.equal(await balanceOf(to.id), 60);
});

test("PUT transaction: validation, ownership, archived accounts, imported rows", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = await newAccount(A, 100);
  const tx = await newTx(A, acc.id, { amount: 5 });

  assert.equal((await a.put(`/transactions/${tx.id}`, {})).status, 400, "at least one field");
  assert.equal((await a.put(`/transactions/${tx.id}`, { amount: -1 })).status, 400);
  assert.equal((await a.put(`/transactions/${tx.id}`, { amount: 1.234 })).status, 400);
  assert.equal((await a.put(`/transactions/${tx.id}`, { description: "" })).status, 400);
  assert.equal((await a.put(`/transactions/${tx.id}`, { transaction_type: "transfer" })).status, 400);
  const tooFar = new Date(Date.now() + 3 * 86400000).toISOString();
  assert.equal((await a.put(`/transactions/${tx.id}`, { transaction_date: tooFar })).status, 400);
  assert.equal((await a.put("/transactions/not-a-uuid", { amount: 1 })).status, 400);
  assert.equal((await a.put("/transactions/00000000-0000-4000-8000-000000000000", { amount: 1 })).status, 404);

  // another user's transaction / account
  assert.equal((await api(B).put(`/transactions/${tx.id}`, { amount: 1 })).status, 404);
  const accB = await newAccount(B, 100);
  assert.equal((await a.put(`/transactions/${tx.id}`, { manual_account_id: accB.id })).status, 404);
  assert.equal(await balanceOf(accB.id), 100);

  // explicit category of the wrong type -> 400; incompatible implicit category is dropped on type change
  const cats = (await a.get("/categories")).body.data.categories;
  const incomeCat = cats.find((c) => c.category_type === "income");
  const expenseCat = cats.find((c) => c.category_type === "expense");
  assert.equal((await a.put(`/transactions/${tx.id}`, { category_id: incomeCat.id })).status, 400);
  await a.put(`/transactions/${tx.id}`, { category_id: expenseCat.id });
  const flipped = await a.put(`/transactions/${tx.id}`, { transaction_type: "income" });
  assert.equal(flipped.status, 200);
  assert.equal(flipped.body.data.transaction.category_id, null);
  await a.put(`/transactions/${tx.id}`, { transaction_type: "expense" });
  assert.equal(await balanceOf(acc.id), 95, "failed edits left the balance alone");

  // archived account (source or target) -> 409
  const other = await newAccount(A, 10);
  await newTx(A, other.id, { amount: 1 });
  await a.del(`/accounts/manual/${other.id}`); // archived (has history)
  assert.equal((await a.put(`/transactions/${tx.id}`, { manual_account_id: other.id })).status, 409);

  // imported bank transaction -> 400
  const bank = await pool.query(
    `INSERT INTO bank_accounts (user_id, bank_provider, provider_account_id, access_token_encrypted)
     VALUES ($1, 'test', 'x', 'x') RETURNING id`,
    [A.userId]
  );
  const btx = await pool.query(
    `INSERT INTO transactions (user_id, bank_account_id, transaction_date, amount, transaction_type, description)
     VALUES ($1, $2, NOW(), 5, 'expense', 'bank') RETURNING id`,
    [A.userId, bank.rows[0].id]
  );
  const res = await a.put(`/transactions/${btx.rows[0].id}`, { amount: 1 });
  assert.equal(res.status, 400);
  assert.match(res.body.message, /cannot be edited/);
});

test("PUT transaction linked to a goal keeps the goal consistent", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = await newAccount(A, 1000);
  const goal = (await a.post("/goals", { goal_name: "Bici", target_amount: 200 })).body.data.goal;
  await a.post(`/goals/${goal.id}/contribute`, { amount: 100, manual_account_id: acc.id });
  const tx = (await a.get(`/transactions?account_id=${acc.id}`)).body.data.transactions[0];
  assert.equal((await goalOf(goal.id)).current_amount, 100);

  // amount up -> goal completes
  assert.equal((await a.put(`/transactions/${tx.id}`, { amount: 200 })).status, 200);
  assert.deepEqual(await goalOf(goal.id), { current_amount: 200, is_completed: true });
  assert.equal(await balanceOf(acc.id), 800);
  const link = await pool.query("SELECT contributed_amount FROM savings_goal_transactions WHERE transaction_id = $1", [tx.id]);
  assert.equal(link.rows[0].contributed_amount, 200);

  // amount down -> goal re-opens
  await a.put(`/transactions/${tx.id}`, { amount: 150 });
  assert.deepEqual(await goalOf(goal.id), { current_amount: 150, is_completed: false });

  // becomes an income -> link removed, money taken back from the goal
  assert.equal((await a.put(`/transactions/${tx.id}`, { transaction_type: "income" })).status, 200);
  assert.deepEqual(await goalOf(goal.id), { current_amount: 0, is_completed: false });
  assert.equal((await pool.query("SELECT 1 FROM savings_goal_transactions WHERE transaction_id = $1", [tx.id])).rows.length, 0);
  assert.equal(await balanceOf(acc.id), 1150);
});

// ---------- overdraft ----------

test("overdraft: balance cannot go below 0 by default (create, edit, delete, goal contributions)", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = await newAccount(A, 50);

  const tooMuch = await a.post("/transactions", { manual_account_id: acc.id, transaction_date: now(), amount: 50.01, transaction_type: "expense", description: "x" });
  assert.equal(tooMuch.status, 422);
  assert.equal(tooMuch.body.code, "INSUFFICIENT_FUNDS");
  assert.equal(tooMuch.body.status, "error");
  assert.match(tooMuch.body.message, /Insufficient funds/);
  await newTx(A, acc.id, { amount: 50 }); // exactly 0 is fine
  assert.equal(await balanceOf(acc.id), 0);

  // deleting an income that was already spent
  const income = await newTx(A, acc.id, { amount: 30, transaction_type: "income" });
  const spend = await newTx(A, acc.id, { amount: 20 });
  const del = await a.del(`/transactions/${income.id}`);
  assert.equal(del.status, 422);
  assert.equal(del.body.code, "INSUFFICIENT_FUNDS");
  assert.equal(await balanceOf(acc.id), 10);

  // editing an expense upwards
  const edit = await a.put(`/transactions/${spend.id}`, { amount: 31 });
  assert.equal(edit.status, 422);
  assert.equal(edit.body.code, "INSUFFICIENT_FUNDS");
  assert.equal((await a.put(`/transactions/${spend.id}`, { amount: 30 })).status, 200);
  assert.equal(await balanceOf(acc.id), 0);

  // goal contribution through the account
  const goal = (await a.post("/goals", { goal_name: "G", target_amount: 100 })).body.data.goal;
  const c = await a.post(`/goals/${goal.id}/contribute`, { amount: 1, manual_account_id: acc.id });
  assert.equal(c.status, 422);
  assert.equal((await goalOf(goal.id)).current_amount, 0, "rolled back");

  // raising the balance is always allowed, deleting an expense too
  assert.equal((await a.del(`/transactions/${spend.id}`)).status, 200);
  assert.equal(await balanceOf(acc.id), 30);
});

test("overdraft: limit and unlimited modes, exposed on the account API", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const limited = await newAccount(A, 0, { overdraft_allowed: true, overdraft_limit: 100 });
  assert.equal(limited.overdraft_allowed, true);
  assert.equal(limited.overdraft_limit, 100);
  await newTx(A, limited.id, { amount: 100 });
  assert.equal(await balanceOf(limited.id), -100);
  assert.equal((await a.post("/transactions", { manual_account_id: limited.id, transaction_date: now(), amount: 0.01, transaction_type: "expense", description: "x" })).status, 422);

  const listed = (await a.get("/accounts")).body.data.accounts.find((x) => x.id === limited.id);
  assert.equal(listed.overdraft_allowed, true);
  assert.equal(listed.overdraft_limit, 100);

  // tightening the limit below the current balance is refused; loosening works; null = unlimited
  const tighten = await a.put(`/accounts/manual/${limited.id}`, { overdraft_limit: 50 });
  assert.equal(tighten.status, 422);
  assert.equal(tighten.body.code, "OVERDRAFT_LIMIT_CONFLICT");
  assert.equal((await a.put(`/accounts/manual/${limited.id}`, { overdraft_allowed: false })).status, 422);
  const unlimited = await a.put(`/accounts/manual/${limited.id}`, { overdraft_limit: null });
  assert.equal(unlimited.status, 200);
  assert.equal(unlimited.body.data.account.overdraft_limit, null);
  await newTx(A, limited.id, { amount: 100000 });
  assert.equal(await balanceOf(limited.id), -100100);
  assert.equal((await a.put(`/accounts/manual/${limited.id}`, { account_name: "Renamed" })).status, 200, "cosmetic edits never 422");

  // validation + negative initial balance without overdraft
  assert.equal((await a.post("/accounts/manual", { account_name: "x", account_type: "cash", overdraft_limit: -5 })).status, 400);
  assert.equal((await a.post("/accounts/manual", { account_name: "x", account_type: "cash", overdraft_allowed: "maybe" })).status, 400);
  const neg = await a.post("/accounts/manual", { account_name: "x", account_type: "cash", initial_balance: -10 });
  assert.equal(neg.status, 422);
  assert.equal(neg.body.code, "OVERDRAFT_LIMIT_CONFLICT");
  assert.equal((await a.post("/accounts/manual", { account_name: "x", account_type: "cash", initial_balance: -10, overdraft_allowed: true })).status, 201);
});

// ---------- backdated snapshots ----------

test("snapshots: backdated create / edit / delete rebuild past days", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = await newAccount(A, 100);
  const history = async () =>
    Object.fromEntries((await a.get(`/accounts/${acc.id}/history`)).body.data.history.map((h) => [h.date, h.balance]));

  const tx = await newTx(A, acc.id, { amount: 30, transaction_date: `${daysAgo(5)}T12:00:00Z` });
  let h = await history();
  for (let d = 5; d >= 0; d--) assert.equal(h[daysAgo(d)], 70, `day -${d} after backdated expense`);

  // move it 2 days later and change the amount: days -5/-4 go back to 100
  await a.put(`/transactions/${tx.id}`, { transaction_date: `${daysAgo(3)}T08:00:00Z`, amount: 40 });
  h = await history();
  assert.equal(h[daysAgo(5)], 100);
  assert.equal(h[daysAgo(4)], 100);
  for (let d = 3; d >= 0; d--) assert.equal(h[daysAgo(d)], 60);

  // a second backdated income layered on top
  const inc = await newTx(A, acc.id, { amount: 15, transaction_type: "income", transaction_date: `${daysAgo(4)}T08:00:00Z` });
  h = await history();
  assert.deepEqual([h[daysAgo(5)], h[daysAgo(4)], h[daysAgo(3)], h[daysAgo(0)]], [100, 115, 75, 75]);

  await a.del(`/transactions/${tx.id}`);
  await a.del(`/transactions/${inc.id}`);
  h = await history();
  for (let d = 5; d >= 0; d--) assert.equal(h[daysAgo(d)], 100);
  assert.equal(h[daysAgo(0)], await balanceOf(acc.id), "today's snapshot equals the live balance");
});

test("transactions more than 1 day in the future are rejected (400)", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 100);
  const base = { manual_account_id: acc.id, amount: 1, transaction_type: "expense", description: "x" };
  const far = await api(A).post("/transactions", { ...base, transaction_date: new Date(Date.now() + 26 * 3600000).toISOString() });
  assert.equal(far.status, 400);
  const near = await api(A).post("/transactions", { ...base, transaction_date: new Date(Date.now() + 20 * 3600000).toISOString() });
  assert.equal(near.status, 201);
});

// ---------- REQUIRE_VERIFIED_EMAIL ----------

test("verified-email gate: off by default, blocks writes of unverified users when enabled", async (t) => {
  if (!ready) return t.skip();
  const u = await registerUser("gate");
  const a = api(u);
  const original = env.requireVerifiedEmail;
  try {
    env.requireVerifiedEmail = false;
    assert.equal((await a.post("/accounts/manual", { account_name: "Off", account_type: "cash" })).status, 201);

    env.requireVerifiedEmail = true;
    const blocked = await a.post("/accounts/manual", { account_name: "On", account_type: "cash" });
    assert.equal(blocked.status, 403);
    assert.deepEqual(
      { status: blocked.body.status, code: blocked.body.code },
      { status: "error", code: "EMAIL_NOT_VERIFIED" }
    );
    assert.ok(blocked.body.message);
    for (const [method, path] of [["post", "/categories"], ["post", "/transactions"], ["post", "/goals"], ["post", "/budgets"], ["post", "/recurring"], ["post", "/data/import/transactions"]]) {
      const r = await u.agent[method](`/api${path}`).send({});
      assert.equal(r.status, 403, `${method} ${path}`);
      assert.equal(r.body.code, "EMAIL_NOT_VERIFIED");
    }
    // reads, dashboard, AI and auth routes stay open
    assert.equal((await a.get("/accounts")).status, 200);
    assert.equal((await a.get("/transactions")).status, 200);
    assert.equal((await a.get("/dashboard")).status, 200);
    assert.equal((await a.post("/ai/categorize", { description: "Esselunga" })).status, 200);
    assert.equal((await a.put("/auth/profile", { first_name: "Gate" })).status, 200);

    await pool.query("UPDATE users SET email_verified = true WHERE id = $1", [u.userId]);
    assert.equal((await a.post("/accounts/manual", { account_name: "Verified", account_type: "cash" })).status, 201);
  } finally {
    env.requireVerifiedEmail = original;
  }
});
