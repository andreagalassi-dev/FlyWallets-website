const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool, appPool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const { withUserContext } = require("../src/config/db");

let ready;
let A; // main user
let B; // another user, for isolation checks
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("ledgerA");
  B = await registerUser("ledgerB");
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
const balanceOf = async (id) => (await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [id])).rows[0].current_balance;

test("account balance follows transactions atomically (create + delete)", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);

  const created = await a.post("/accounts/manual", { account_name: "Conto Test", account_type: "checking", initial_balance: 1000, icon_emoji: "🏦" });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const accountId = created.body.data.account.id;
  assert.equal(created.body.data.account.current_balance, 1000);

  const mk = (amount, transaction_type, description) =>
    a.post("/transactions", { manual_account_id: accountId, transaction_date: new Date().toISOString(), amount, transaction_type, description });

  const expense = await mk(100.5, "expense", "Esselunga Milano");
  assert.equal(expense.status, 201, JSON.stringify(expense.body));
  assert.equal(await balanceOf(accountId), 899.5);
  assert.ok(expense.body.data.transaction.category_id, "category auto-suggested when omitted");

  assert.equal((await mk(50, "income", "Rimborso")).status, 201);
  assert.equal(await balanceOf(accountId), 949.5);

  const del = await a.del(`/transactions/${expense.body.data.transaction.id}`);
  assert.equal(del.status, 200);
  assert.equal(await balanceOf(accountId), 1050, "deleting an expense gives the money back");

  // today's snapshot reflects the latest balance
  const hist = await a.get(`/accounts/${accountId}/history`);
  assert.equal(hist.status, 200);
  assert.equal(hist.body.data.history.at(-1).balance, 1050);
});

test("invalid transactions are rejected without touching the balance", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = (await a.post("/accounts/manual", { account_name: "Strict", account_type: "cash", initial_balance: 10 })).body.data.account;
  const base = { manual_account_id: acc.id, transaction_date: new Date().toISOString(), transaction_type: "expense", description: "x" };

  assert.equal((await a.post("/transactions", { ...base, amount: -5 })).status, 400);
  assert.equal((await a.post("/transactions", { ...base, amount: 0 })).status, 400);
  assert.equal((await a.post("/transactions", { ...base, amount: 1.234 })).status, 400);
  assert.equal((await a.post("/transactions", { ...base, amount: 5, category_id: "00000000-0000-4000-8000-000000000000" })).status, 404);
  assert.equal(await balanceOf(acc.id), 10);
});

test("users cannot read or modify each other's data", async (t) => {
  if (!ready) return t.skip();
  const acc = (await api(A).post("/accounts/manual", { account_name: "Privato", account_type: "savings", initial_balance: 500 })).body.data.account;

  assert.equal((await api(B).put(`/accounts/manual/${acc.id}`, { account_name: "hack" })).status, 404);
  assert.equal((await api(B).del(`/accounts/manual/${acc.id}`)).status, 404);
  const tx = await api(B).post("/transactions", { manual_account_id: acc.id, transaction_date: new Date().toISOString(), amount: 1, transaction_type: "expense", description: "steal" });
  assert.equal(tx.status, 404);
  const list = await api(B).get("/accounts");
  assert.ok(!list.body.data.accounts.some((x) => x.id === acc.id));
  assert.equal(await balanceOf(acc.id), 500);
});

test("accounts with history are archived, empty ones deleted", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const empty = (await a.post("/accounts/manual", { account_name: "Vuoto", account_type: "wallet" })).body.data.account;
  assert.equal((await a.del(`/accounts/manual/${empty.id}`)).body.data.archived, false);

  const used = (await a.post("/accounts/manual", { account_name: "Usato", account_type: "wallet", initial_balance: 5 })).body.data.account;
  await a.post("/transactions", { manual_account_id: used.id, transaction_date: new Date().toISOString(), amount: 1, transaction_type: "expense", description: "caffè" });
  assert.equal((await a.del(`/accounts/manual/${used.id}`)).body.data.archived, true);
  const list = await a.get("/accounts");
  assert.ok(!list.body.data.accounts.some((x) => x.id === used.id));
  const kept = await pool.query("SELECT 1 FROM transactions WHERE manual_account_id = $1", [used.id]);
  assert.equal(kept.rows.length, 1, "transactions survive archiving");
});

test("goals: contribution moves money and progress; deleting the transaction reverts both", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = (await a.post("/accounts/manual", { account_name: "Per Goal", account_type: "checking", initial_balance: 1000 })).body.data.account;
  const goal = (await a.post("/goals", { goal_name: "Vacanza", target_amount: 400, icon_emoji: "🏖️" })).body.data.goal;

  const c = await a.post(`/goals/${goal.id}/contribute`, { amount: 100, manual_account_id: acc.id });
  assert.equal(c.status, 200, JSON.stringify(c.body));
  assert.equal(c.body.data.goal.current_amount, 100);
  assert.equal(c.body.data.goal.progress_percentage, 25);
  assert.equal(await balanceOf(acc.id), 900);

  const done = await a.post(`/goals/${goal.id}/contribute`, { amount: 300 });
  assert.equal(done.body.data.goal.is_completed, true);
  assert.equal(await balanceOf(acc.id), 900, "contribution without account leaves balances alone");

  const txs = await a.get(`/transactions?account_id=${acc.id}`);
  assert.equal(txs.body.data.transactions.length, 1);
  await a.del(`/transactions/${txs.body.data.transactions[0].id}`);
  assert.equal(await balanceOf(acc.id), 1000);
  const after = (await a.get("/goals")).body.data.goals.find((g) => g.id === goal.id);
  assert.equal(after.current_amount, 300);
  assert.equal(after.is_completed, false, "dropping below target re-opens the goal");

  assert.equal((await a.put(`/goals/${goal.id}`, { is_completed: true })).body.data.goal.is_completed, true);
  assert.equal((await a.del(`/goals/${goal.id}`)).status, 200);
  assert.equal((await a.del(`/goals/${goal.id}`)).status, 404);
});

test("categories: system ones are protected, custom ones can be created and deleted", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const list = (await a.get("/categories")).body.data.categories;
  const system = list.find((c) => c.is_system);
  assert.ok(system);
  assert.equal((await a.del(`/categories/${system.id}`)).status, 403);

  const created = await a.post("/categories", { category_name: "Palestra", category_type: "expense", icon_emoji: "💪" });
  assert.equal(created.status, 201);
  assert.equal((await a.post("/categories", { category_name: "Palestra", category_type: "expense" })).status, 409);
  assert.ok(!(await api(B).get("/categories")).body.data.categories.some((c) => c.category_name === "Palestra"));
  assert.equal((await a.del(`/categories/${created.body.data.category.id}`)).status, 200);
});

test("transactions list: filters + pagination", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const acc = (await a.post("/accounts/manual", { account_name: "Filtri", account_type: "checking", initial_balance: 100 })).body.data.account;
  for (let i = 1; i <= 5; i++) {
    await a.post("/transactions", { manual_account_id: acc.id, transaction_date: `2026-01-0${i}T10:00:00Z`, amount: i, transaction_type: i % 2 ? "income" : "expense", description: i === 3 ? "100% Special_deal" : `Voce ${i}` });
  }
  const page1 = await a.get(`/transactions?account_id=${acc.id}&limit=2&page=1`);
  assert.equal(page1.body.data.pagination.total, 5);
  assert.equal(page1.body.data.pagination.totalPages, 3);
  assert.equal(page1.body.data.transactions.length, 2);
  assert.equal(page1.body.data.transactions[0].description, "Voce 5", "newest first");

  assert.equal((await a.get(`/transactions?account_id=${acc.id}&type=income`)).body.data.pagination.total, 3);
  assert.equal((await a.get(`/transactions?account_id=${acc.id}&from_date=2026-01-02&to_date=2026-01-03`)).body.data.pagination.total, 2);
  // LIKE wildcards in the search term are escaped, not interpreted
  assert.equal((await a.get(`/transactions?account_id=${acc.id}&search=${encodeURIComponent("100%")}`)).body.data.pagination.total, 1);
  assert.equal((await a.get(`/transactions?account_id=${acc.id}&search=${encodeURIComponent("%")}`)).body.data.pagination.total, 1);
});

test("dashboard aggregates summary, accounts, goals and categories", async (t) => {
  if (!ready) return t.skip();
  const c = await registerUser("dash");
  const a = api(c);
  const acc = (await a.post("/accounts/manual", { account_name: "Main", account_type: "checking", initial_balance: 1000 })).body.data.account;
  const now = new Date().toISOString();
  await a.post("/transactions", { manual_account_id: acc.id, transaction_date: now, amount: 500, transaction_type: "income", description: "Stipendio" });
  await a.post("/transactions", { manual_account_id: acc.id, transaction_date: now, amount: 200, transaction_type: "expense", description: "Affitto" });
  await a.post("/goals", { goal_name: "Fondo", target_amount: 1000 });

  const res = await a.get("/dashboard");
  assert.equal(res.status, 200);
  const d = res.body.data;
  assert.equal(d.summary.totalBalance, 1300);
  assert.equal(d.summary.monthlyIncome, 500);
  assert.equal(d.summary.monthlyExpense, 200);
  assert.equal(d.summary.netChangePercentage, 30, "net +300 on a 1000 starting balance");
  assert.equal(d.accounts.length, 1);
  assert.equal(d.recentTransactions.length, 2);
  assert.equal(d.savingsGoals[0].progress_percentage, 0);
  assert.ok(d.categories.length >= 25);
});

test("AI endpoints work with the AI provider disabled", async (t) => {
  if (!ready) return t.skip();
  const a = api(A);
  const cat = await a.post("/ai/categorize", { description: "Ricarica Iliad", amount: 9.99, transaction_type: "expense" });
  assert.equal(cat.status, 200);
  assert.equal(cat.body.data.suggestion.category_name, "Utenze");
  assert.equal(cat.body.data.provider, "disabled");

  const ins = await a.get("/ai/insights");
  assert.equal(ins.status, 200);
  assert.equal(ins.body.data.tips.length, 3);
});

test("RLS: with the restricted role a user only sees their own rows, even without WHERE", async (t) => {
  if (!ready) return t.skip();
  if (appPool === pool) return t.skip("DATABASE_APP_URL / TEST_DATABASE_APP_URL not configured");
  const mine = await withUserContext(A.userId, (db) => db.query("SELECT DISTINCT user_id FROM manual_accounts"));
  assert.deepEqual(mine.rows.map((r) => r.user_id), [A.userId]);

  const none = await withUserContext("00000000-0000-4000-8000-000000000000", (db) => db.query("SELECT * FROM transactions"));
  assert.equal(none.rows.length, 0);

  // writing on behalf of someone else is blocked by the policy
  await assert.rejects(
    withUserContext(B.userId, (db) =>
      db.query("INSERT INTO manual_accounts (user_id, account_name, account_type) VALUES ($1, 'x', 'cash')", [A.userId])
    ),
    /row-level security/
  );
});
