const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const { withStatus } = require("../src/controllers/budgetController");

let ready;
let A;
let B;
let accountA;
let expenseCat; // system expense category
let otherExpenseCat; // another system expense category
let incomeCat; // system income category
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("budgetA");
  B = await registerUser("budgetB");
  accountA = (await A.agent.post("/api/accounts/manual").send({ account_name: "Budget", account_type: "checking", initial_balance: 10000 })).body.data.account;
  const cats = (await A.agent.get("/api/categories")).body.data.categories;
  expenseCat = cats.find((c) => c.is_system && c.category_type === "expense");
  otherExpenseCat = cats.find((c) => c.is_system && c.category_type === "expense" && c.id !== expenseCat.id);
  incomeCat = cats.find((c) => c.is_system && c.category_type === "income");
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const spend = (user, amount, extra = {}) =>
  user.agent.post("/api/transactions").send({
    manual_account_id: accountA.id,
    transaction_date: new Date().toISOString(),
    amount,
    transaction_type: "expense",
    description: "Spesa test",
    category_id: expenseCat.id,
    ...extra,
  });

test("withStatus: thresholds are exact (integer cents)", () => {
  const b = (spent, monthly_limit = 100, alert_threshold = 80) => withStatus({ spent, monthly_limit, alert_threshold });
  assert.equal(b(0).status, "ok");
  assert.equal(b(79.99).status, "ok");
  assert.equal(b(80).status, "warning");
  assert.equal(b(99.99).status, "warning");
  assert.equal(b(100).status, "exceeded");
  assert.equal(b(100).remaining, 0);
  assert.equal(b(0.1 + 0.2, 0.3, 100).status, "exceeded", "no float drift");
  const over = b(123.456, 100);
  assert.equal(over.spent, 123.46);
  assert.equal(over.remaining, -23.46);
  assert.equal(over.percentage, 123.5);
  assert.equal(b(33.333, 100).percentage, 33.3);
});

test("budget lifecycle: spent / percentage / status follow this month's expenses", async (t) => {
  if (!ready) return t.skip();
  const created = await A.agent.post("/api/budgets").send({ category_id: expenseCat.id, monthly_limit: 100 });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const budget = created.body.data.budget;
  assert.equal(budget.alert_threshold, 80);
  assert.equal(budget.spent, 0);
  assert.equal(budget.remaining, 100);
  assert.equal(budget.status, "ok");
  assert.equal(budget.category_name, expenseCat.category_name);

  // duplicate category -> 409
  assert.equal((await A.agent.post("/api/budgets").send({ category_id: expenseCat.id, monthly_limit: 50 })).status, 409);

  const get = async () => (await A.agent.get("/api/budgets")).body.data.budgets.find((x) => x.id === budget.id);

  assert.equal((await spend(A, 50)).status, 201);
  let b = await get();
  assert.equal(b.spent, 50);
  assert.equal(b.percentage, 50);
  assert.equal(b.status, "ok");

  // Not counted: future-dated, previous month, other category, income
  const now = new Date();
  const lastMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0, 12)).toISOString();
  assert.equal((await spend(A, 500, { transaction_date: new Date(Date.now() + 12 * 3600 * 1000).toISOString() })).status, 201);
  assert.equal((await spend(A, 500, { transaction_date: lastMonth })).status, 201);
  assert.equal((await spend(A, 500, { category_id: otherExpenseCat.id })).status, 201);
  b = await get();
  assert.equal(b.spent, 50, "only this month's past expenses of the category count");

  await spend(A, 35);
  b = await get();
  assert.equal(b.spent, 85);
  assert.equal(b.status, "warning");

  await spend(A, 20.5);
  b = await get();
  assert.equal(b.status, "exceeded");
  assert.equal(b.percentage, 105.5);
  assert.equal(b.remaining, -5.5);

  // alerts: message + severity
  const alerts = (await A.agent.get("/api/budgets/alerts")).body.data;
  assert.equal(alerts.count, 1);
  assert.equal(alerts.alerts[0].budget_id, budget.id);
  assert.equal(alerts.alerts[0].severity, "critical");
  assert.match(alerts.alerts[0].message, /superato/);

  // summary of the list
  const list = (await A.agent.get("/api/budgets")).body.data;
  assert.match(list.period.month, /^\d{4}-\d{2}$/);
  assert.equal(list.summary.exceededCount, 1);
  assert.equal(list.summary.totalSpent, 105.5);

  // raise the limit -> warning (105.5 / 120 = 87.9%)
  const upd = await A.agent.put(`/api/budgets/${budget.id}`).send({ monthly_limit: 120 });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.budget.status, "warning");
  assert.equal(upd.body.data.budget.percentage, 87.9);
  const warn = (await A.agent.get("/api/budgets/alerts")).body.data.alerts;
  assert.equal(warn[0].status, "warning");
  assert.match(warn[0].message, /87,9%/);

  // threshold above the current percentage -> ok, no alert
  const thr = await A.agent.put(`/api/budgets/${budget.id}`).send({ alert_threshold: 95 });
  assert.equal(thr.body.data.budget.status, "ok");
  assert.equal((await A.agent.get("/api/budgets/alerts")).body.data.count, 0);

  // inactive budgets never alert
  await A.agent.put(`/api/budgets/${budget.id}`).send({ alert_threshold: 50 });
  assert.equal((await A.agent.get("/api/budgets/alerts")).body.data.count, 1);
  const off = await A.agent.put(`/api/budgets/${budget.id}`).send({ is_active: false });
  assert.equal(off.body.data.budget.is_active, false);
  assert.equal((await A.agent.get("/api/budgets/alerts")).body.data.count, 0);

  assert.equal((await A.agent.delete(`/api/budgets/${budget.id}`)).status, 200);
  assert.equal((await A.agent.delete(`/api/budgets/${budget.id}`)).status, 404);
});

test("budget validation", async (t) => {
  if (!ready) return t.skip();
  const post = (body) => A.agent.post("/api/budgets").send(body);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: 0 })).status, 400);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: -10 })).status, 400);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: 10.123 })).status, 400);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: "abc" })).status, 400);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: 10, alert_threshold: 0 })).status, 400);
  assert.equal((await post({ category_id: expenseCat.id, monthly_limit: 10, alert_threshold: 101 })).status, 400);
  assert.equal((await post({ category_id: "not-a-uuid", monthly_limit: 10 })).status, 400);
  assert.equal((await post({ monthly_limit: 10 })).status, 400);
  assert.equal((await post({ category_id: "00000000-0000-4000-8000-000000000000", monthly_limit: 10 })).status, 404);
  assert.equal((await post({ category_id: incomeCat.id, monthly_limit: 10 })).status, 400, "income categories cannot be budgeted");

  // custom "both" category is allowed
  const both = (await A.agent.post("/api/categories").send({ category_name: "Misto budget", category_type: "both" })).body.data.category;
  const ok = await post({ category_id: both.id, monthly_limit: 10, alert_threshold: 50 });
  assert.equal(ok.status, 201);
  assert.equal(ok.body.data.budget.alert_threshold, 50);
  // income on a "both" category is not spending
  await A.agent.post("/api/transactions").send({ manual_account_id: accountA.id, transaction_date: new Date().toISOString(), amount: 99, transaction_type: "income", description: "rimborso", category_id: both.id });
  const b = (await A.agent.get("/api/budgets")).body.data.budgets.find((x) => x.id === ok.body.data.budget.id);
  assert.equal(b.spent, 0);

  const id = ok.body.data.budget.id;
  assert.equal((await A.agent.put(`/api/budgets/${id}`).send({ monthly_limit: 0 })).status, 400);
  assert.equal((await A.agent.put(`/api/budgets/${id}`).send({ is_active: "maybe" })).status, 400);
  assert.equal((await A.agent.put("/api/budgets/nope").send({})).status, 400);
  assert.equal((await A.agent.put("/api/budgets/00000000-0000-4000-8000-000000000000").send({ monthly_limit: 5 })).status, 404);

  // deleting the category removes its budget (ON DELETE CASCADE)
  await A.agent.delete(`/api/categories/${both.id}`);
  assert.ok(!(await A.agent.get("/api/budgets")).body.data.budgets.some((x) => x.id === id));
});

test("budgets are isolated between users", async (t) => {
  if (!ready) return t.skip();
  const own = (await A.agent.post("/api/categories").send({ category_name: "Privata A", category_type: "expense" })).body.data.category;
  const budget = (await A.agent.post("/api/budgets").send({ category_id: own.id, monthly_limit: 100 })).body.data.budget;
  assert.ok(budget);

  assert.ok(!(await B.agent.get("/api/budgets")).body.data.budgets.some((x) => x.id === budget.id));
  assert.equal((await B.agent.get("/api/budgets/alerts")).body.data.count, 0);
  assert.equal((await B.agent.put(`/api/budgets/${budget.id}`).send({ monthly_limit: 1 })).status, 404);
  assert.equal((await B.agent.delete(`/api/budgets/${budget.id}`)).status, 404);
  // B cannot budget on A's private category
  assert.equal((await B.agent.post("/api/budgets").send({ category_id: own.id, monthly_limit: 10 })).status, 404);
  // Both users can budget the same system category independently
  assert.equal((await B.agent.post("/api/budgets").send({ category_id: expenseCat.id, monthly_limit: 10 })).status, 201);

  const still = (await A.agent.get("/api/budgets")).body.data.budgets.find((x) => x.id === budget.id);
  assert.equal(still.monthly_limit, 100);
  assert.equal((await B.agent.get("/api/budgets")).status, 200);
  assert.equal((await A.agent.get("/api/budgets")).status, 200);
});

test("budgets require authentication", async (t) => {
  if (!ready) return t.skip();
  const { request, app } = require("./helpers");
  assert.equal((await request(app).get("/api/budgets")).status, 401);
  assert.equal((await request(app).get("/api/recurring")).status, 401);
});
