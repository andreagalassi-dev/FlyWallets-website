// Dashboard chart endpoints: GET /api/dashboard/networth and /api/dashboard/spending.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");

let ready;
let A;
let B;
let C;
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("chartsA");
  B = await registerUser("chartsB");
  C = await registerUser("chartsC");
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
// POST /transactions auto-categorises when no category is given: clear it explicitly through PUT
const uncategorise = async (user, tx) => {
  const r = await api(user).put(`/transactions/${tx.id}`, { category_id: null });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.data.transaction.category_id, null);
};
const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const newAccount = async (user, initial_balance) => {
  const res = await api(user).post("/accounts/manual", { account_name: `Acc ${Math.random()}`, account_type: "checking", initial_balance });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.account;
};
const newTx = async (user, accId, body) => {
  const res = await api(user).post("/transactions", {
    manual_account_id: accId, transaction_date: new Date().toISOString(), transaction_type: "expense", description: "x", ...body,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.transaction;
};

test("networth: forward-filled daily totals, backdated transactions, archived accounts excluded", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);

  const acc1 = await newAccount(A, 1000);
  await newTx(A, acc1.id, { amount: 100, transaction_date: daysAgo(10) }); // snapshots -10..0 = 900
  const acc2 = await newAccount(A, 500);
  await newTx(A, acc2.id, { amount: 50, transaction_type: "income", transaction_date: daysAgo(5) }); // -5..0 = 550
  const archived = await newAccount(A, 300);
  await newTx(A, archived.id, { amount: 10, transaction_date: daysAgo(3) });
  const del = await a.del(`/accounts/manual/${archived.id}`);
  assert.equal(del.status, 200, JSON.stringify(del.body));
  assert.equal(
    (await pool.query("SELECT is_archived FROM manual_accounts WHERE id = $1", [archived.id])).rows[0].is_archived,
    true,
    "account with history is archived, not deleted"
  );

  // Simulate a gap in the snapshots (e.g. days without a rebuild): the value must be carried forward
  await pool.query(
    "DELETE FROM account_balances WHERE manual_account_id = $1 AND balance_date > $2::date AND balance_date < CURRENT_DATE",
    [acc1.id, daysAgo(10)]
  );

  const res = await a.get("/dashboard/networth");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.data;
  assert.equal(d.days, 30);
  assert.equal(d.series.length, 30);
  assert.equal(d.series[0].date, daysAgo(29));
  assert.equal(d.series[29].date, daysAgo(0));
  assert.match(d.series[0].date, /^\d{4}-\d{2}-\d{2}$/);

  const expected = (n) => (n > 10 ? 0 : n > 5 ? 900 : 1450); // n = days ago
  d.series.forEach((p, i) => assert.equal(p.total, expected(29 - i), `day -${29 - i} (${p.date})`));
  assert.equal(d.start, 0);
  assert.equal(d.end, 1450);
  assert.equal(d.change, 1450);
  assert.equal(d.changePercentage, null, "no positive base on the first day");

  // The last point equals the dashboard total balance
  const dash = await a.get("/dashboard");
  assert.equal(d.end, dash.body.data.summary.totalBalance);

  // Longer windows
  const y = (await a.get("/dashboard/networth?days=365")).body.data;
  assert.equal(y.series.length, 365);
  assert.equal(y.series[0].date, daysAgo(364));
  assert.equal(y.end, 1450);
  const q = (await a.get("/dashboard/networth?days=90")).body.data;
  assert.equal(q.series.length, 90);

  // A same-day expense moves only today's point
  await newTx(A, acc2.id, { amount: 145 }); // today: 1450 -> 1305
  const later = (await a.get("/dashboard/networth")).body.data;
  assert.equal(later.end, 1305);
  assert.equal(later.series.at(-2).total, 1450, "yesterday keeps its snapshot");
});

test("networth: percentage with a positive base and isolation between users", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(B, 800);
  await newTx(B, acc.id, { amount: 200, transaction_type: "income", transaction_date: daysAgo(40) }); // -40..0 = 1000
  await uncategorise(B, await newTx(B, acc.id, { amount: 50.75 })); // today = 949.25

  const d = (await api(B).get("/dashboard/networth")).body.data;
  assert.equal(d.start, 1000);
  assert.equal(d.end, 949.25);
  assert.equal(d.change, -50.75);
  assert.equal(d.changePercentage, -5.1); // -50.75 / 1000 = -5.075% -> -5.1 (one decimal)
  assert.ok(d.series.every((p, i) => p.total === (i < 29 ? 1000 : 949.25)), "only B's account is counted");

  // A's numbers do not include B's account
  assert.equal((await api(A).get("/dashboard/networth")).body.data.end, 1305);
});

test("networth / spending: user without data", async (t) => {
  if (!ready) return t.skip();
  const fresh = await registerUser("chartsEmpty");
  const n = (await fresh.agent.get("/api/dashboard/networth")).body.data;
  assert.equal(n.series.length, 30);
  assert.ok(n.series.every((p) => p.total === 0));
  assert.deepEqual([n.start, n.end, n.change, n.changePercentage], [0, 0, 0, null]);
  const s = (await fresh.agent.get("/api/dashboard/spending")).body.data;
  assert.deepEqual(s, { days: 30, total: 0, categories: [] });
});

test("spending: grouped by category, top 6 + Other, uncategorised, window and type filters", async (t) => {
  if (!ready) return t.skip();
  const c = api(C);
  const acc = await newAccount(C, 100000);
  const cats = {};
  for (const name of ["C1", "C2", "C3", "C4", "C5", "C6", "C7"]) {
    const r = await c.post("/categories", { category_name: name, category_type: "expense", icon_emoji: "🧪", color_tag: "#123456" });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    cats[name] = r.body.data.category.id;
  }
  const spend = (name, amount, extra = {}) =>
    newTx(C, acc.id, { amount, category_id: name ? cats[name] : null, transaction_date: daysAgo(2), ...extra });

  await spend("C1", 60.05);
  await spend("C1", 40.05); // C1 = 100.10
  await spend("C2", 90);
  await spend("C3", 80);
  await spend("C4", 70);
  await spend("C5", 60);
  await uncategorise(C, await spend(null, 55.55)); // Uncategorized
  await spend("C6", 20);
  await spend("C7", 10.01);
  await spend("C7", 1000, { transaction_date: daysAgo(40) }); // outside 30 days, inside 90
  await spend("C1", 500, { transaction_date: new Date(Date.now() + 6 * 3600000).toISOString() }); // future: excluded
  await newTx(C, acc.id, { amount: 5000, transaction_type: "income", transaction_date: daysAgo(1) }); // income: excluded

  const res = await c.get("/dashboard/spending");
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const d = res.body.data;
  assert.equal(d.days, 30);
  assert.equal(d.total, 485.66);
  assert.deepEqual(
    d.categories.map((g) => [g.name, g.total, g.percentage]),
    [
      ["C1", 100.1, 20.6],
      ["C2", 90, 18.5],
      ["C3", 80, 16.5],
      ["C4", 70, 14.4],
      ["C5", 60, 12.4],
      ["Uncategorized", 55.55, 11.4],
      ["Other", 30.01, 6.2],
    ]
  );
  const c1 = d.categories[0];
  assert.deepEqual(
    { id: c1.category_id, key: c1.key, emoji: c1.emoji, color: c1.color },
    { id: cats.C1, key: cats.C1, emoji: "🧪", color: "#123456" }
  );
  const uncat = d.categories[5];
  assert.deepEqual([uncat.category_id, uncat.key, uncat.emoji, uncat.color], [null, "uncategorized", null, null]);
  const other = d.categories[6];
  assert.deepEqual([other.category_id, other.key, other.count], [null, "other", 2]);

  const q = (await c.get("/dashboard/spending?days=90")).body.data;
  assert.equal(q.total, 1485.66);
  assert.deepEqual(
    q.categories.map((g) => [g.name, g.total]),
    [["C7", 1010.01], ["C1", 100.1], ["C2", 90], ["C3", 80], ["C4", 70], ["C5", 60], ["Other", 75.55]]
  );
  assert.equal(q.categories.at(-1).count, 2, "Uncategorized + C6 are folded into Other");

  // Isolation: other users see none of C's spending
  const b = (await api(B).get("/dashboard/spending")).body.data;
  assert.ok(b.categories.every((g) => !Object.values(cats).includes(g.category_id)));
  assert.equal(b.total, 50.75);
  assert.deepEqual(b.categories.map((g) => [g.name, g.total, g.percentage]), [["Uncategorized", 50.75, 100]]);
});

test("networth / spending: days validation and authentication", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  for (const path of ["/dashboard/networth", "/dashboard/spending"]) {
    for (const bad of ["7", "0", "-30", "abc", "30.5", "366", ""]) {
      const r = await a.get(`${path}?days=${bad}`);
      assert.equal(r.status, 400, `${path}?days=${bad}`);
    }
    assert.equal((await a.get(`${path}?days=30&days=90`)).status, 400, "repeated parameter");
    for (const ok of ["30", "90", "365"]) {
      const r = await a.get(`${path}?days=${ok}`);
      assert.equal(r.status, 200, `${path}?days=${ok}`);
      assert.equal(r.body.data.days, Number(ok));
    }
    const { request, app } = require("./helpers");
    assert.equal((await request(app).get(`/api${path}`)).status, 401);
  }
});
