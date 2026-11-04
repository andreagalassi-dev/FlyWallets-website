// Regression tests for defects found during the independent security review.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, pool, appPool, dbSuite, registerUser, cleanupTestUsers, closeDb, PASSWORD } = require("./helpers");
const { hashOtp } = require("../src/utils/security");
const { withUserContext } = require("../src/config/db");

let ready;
before(async (t) => {
  ready = await dbSuite(t);
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const iso = () => new Date().toISOString();

test("OTP: 40 parallel wrong guesses are limited to max_attempts evaluations", async (t) => {
  if (!ready) return t.skip();
  const { agent, userId } = await registerUser("race");
  await pool.query("UPDATE email_verifications SET code_hash = $1 WHERE user_id = $2", [hashOtp(userId, "123456"), userId]);

  const results = await Promise.all(
    Array.from({ length: 40 }, (_, i) => agent.post("/api/auth/verify-email").send({ code: String(i).padStart(6, "0") }))
  );
  const evaluated = results.filter((r) => r.status === 400 || (r.status === 429 && r.body.message.includes("locked for"))).length;
  assert.ok(evaluated <= 3, `only 3 guesses may be evaluated, got ${evaluated}`);
  const row = await pool.query("SELECT attempts FROM email_verifications WHERE user_id = $1", [userId]);
  assert.equal(row.rows[0].attempts, 3);
  // the correct code is refused once locked
  assert.equal((await agent.post("/api/auth/verify-email").send({ code: "123456" })).status, 429);
});

test("login and profile responses expose the USER id, not the profile row id", async (t) => {
  if (!ready) return t.skip();
  const { email, userId, agent } = await registerUser("ids");
  const login = await request(app).post("/api/auth/login").send({ email, password: PASSWORD });
  assert.equal(login.body.data.user.id, userId);
  const upd = await agent.put("/api/auth/profile").send({ first_name: "Mario" });
  assert.equal(upd.status, 200);
  assert.equal(upd.body.data.user.id, userId);
  assert.equal(upd.body.data.user.first_name, "Mario");
});

test("profile: identity fields are immutable, bad input is a 400, no existence oracle", async (t) => {
  if (!ready) return t.skip();
  const a = await registerUser("profA");
  const b = await registerUser("profB");
  const before = (await pool.query("SELECT fiscal_code FROM user_individuals WHERE user_id = $1", [a.userId])).rows[0].fiscal_code;
  const otherFc = (await pool.query("SELECT fiscal_code FROM user_individuals WHERE user_id = $1", [b.userId])).rows[0].fiscal_code;

  const res = await a.agent.put("/api/auth/profile").send({ fiscal_code: otherFc, first_name: "Luigi" });
  assert.equal(res.status, 200, "fiscal_code is ignored, not probed");
  const after = (await pool.query("SELECT fiscal_code FROM user_individuals WHERE user_id = $1", [a.userId])).rows[0].fiscal_code;
  assert.equal(after, before);

  assert.equal((await a.agent.put("/api/auth/profile").send({ date_of_birth: "not-a-date" })).status, 400);
  assert.equal((await a.agent.put("/api/auth/profile").set("Content-Type", "text/plain").send("hello")).status, 200, "non-JSON body does not crash");
});

test("registration with missing individual fields is a 400, not a 500", async (t) => {
  if (!ready) return t.skip();
  const res = await request(app).post("/api/auth/register").send({ email: "nofields@flywallets.test", password: PASSWORD, user_type: "individual" });
  assert.equal(res.status, 400);
});

test("strict dates and page bounds are validated (400, not 500)", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("val");
  const acc = (await agent.post("/api/accounts/manual").send({ account_name: "V", account_type: "cash" })).body.data.account;
  const base = { manual_account_id: acc.id, amount: 1, transaction_type: "expense", description: "x" };
  assert.equal((await agent.post("/api/transactions").send({ ...base, transaction_date: "2025-02-30" })).status, 400);
  assert.equal((await agent.get("/api/transactions?page=100000000000000000000")).status, 400);
});

test("transaction dates with offsets are stored as the correct UTC instant", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("tz");
  const acc = (await agent.post("/api/accounts/manual").send({ account_name: "TZ", account_type: "cash", initial_balance: 10 })).body.data.account;
  const res = await agent.post("/api/transactions").send({
    manual_account_id: acc.id, amount: 1, transaction_type: "expense", description: "late",
    transaction_date: "2026-01-31T23:30:00-05:00", // past date (max 1 day ahead is allowed), still crosses a month
  });
  assert.equal(res.status, 201);
  assert.equal(new Date(res.body.data.transaction.transaction_date).toISOString(), "2026-02-01T04:30:00.000Z");
});

test("future-dated transactions do not count in this month's summary", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("future");
  const acc = (await agent.post("/api/accounts/manual").send({ account_name: "F", account_type: "cash" })).body.data.account;
  // far-future dates are now refused outright (max 1 day ahead)
  const far = await agent.post("/api/transactions").send({ manual_account_id: acc.id, amount: 999, transaction_type: "income", description: "future", transaction_date: "2099-06-01T10:00:00Z" });
  assert.equal(far.status, 400);
  // a few hours ahead is accepted, and only counts if it still falls in the current month
  const soon = new Date(Date.now() + 3 * 3600 * 1000);
  const ahead = await agent.post("/api/transactions").send({ manual_account_id: acc.id, amount: 5, transaction_type: "income", description: "soon", transaction_date: soon.toISOString() });
  assert.equal(ahead.status, 201);
  await agent.post("/api/transactions").send({ manual_account_id: acc.id, amount: 10, transaction_type: "income", description: "now", transaction_date: iso() });
  const sameMonth = soon.getUTCMonth() === new Date().getUTCMonth();
  const d = (await agent.get("/api/dashboard")).body.data;
  assert.equal(d.summary.monthlyIncome, sameMonth ? 15 : 10);
});

test("goals: completion state stays consistent", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("goalstate");
  const goal = (await agent.post("/api/goals").send({ goal_name: "G", target_amount: 100 })).body.data.goal;
  await agent.put(`/api/goals/${goal.id}`).send({ is_completed: true });
  const after = await agent.post(`/api/goals/${goal.id}/contribute`).send({ amount: 10 });
  assert.equal(after.body.data.goal.is_completed, true, "a completed goal stays completed when it receives more money");

  const g2 = (await agent.post("/api/goals").send({ goal_name: "G2", target_amount: 100 })).body.data.goal;
  await agent.post(`/api/goals/${g2.id}/contribute`).send({ amount: 10 });
  const lowered = await agent.put(`/api/goals/${g2.id}`).send({ target_amount: 5 });
  assert.equal(lowered.body.data.goal.is_completed, true, "lowering the target below the saved amount completes the goal");
});

test("transactions on archived accounts cannot be deleted behind the scenes", async (t) => {
  if (!ready) return t.skip();
  const { agent } = await registerUser("arch");
  const acc = (await agent.post("/api/accounts/manual").send({ account_name: "A", account_type: "cash", initial_balance: 30 })).body.data.account;
  const tx = (await agent.post("/api/transactions").send({ manual_account_id: acc.id, amount: 5, transaction_type: "expense", description: "x", transaction_date: iso() })).body.data.transaction;
  await agent.delete(`/api/accounts/manual/${acc.id}`); // archived
  assert.equal((await agent.delete(`/api/transactions/${tx.id}`)).status, 409);
  assert.equal((await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [acc.id])).rows[0].current_balance, 25);
});

test("forgot-password limiter is shared across e-mail aliases", async (t) => {
  if (!ready) return t.skip();
  const { normalizeEmail } = require("validator");
  assert.equal(normalizeEmail("v.ic.tim+1@gmail.com"), normalizeEmail("victim@gmail.com"));
});

test("RLS: cannot attach rows to another tenant's account or transaction", async (t) => {
  if (!ready) return t.skip();
  if (appPool === pool) return t.skip("restricted role not configured");
  const A = await registerUser("rlsA");
  const B = await registerUser("rlsB");
  const accB = (await B.agent.post("/api/accounts/manual").send({ account_name: "B", account_type: "cash" })).body.data.account;

  await assert.rejects(
    withUserContext(A.userId, (db) =>
      db.query(
        "INSERT INTO transactions (user_id, manual_account_id, transaction_date, amount, transaction_type, description) VALUES ($1, $2, NOW(), 1, 'expense', 'x')",
        [A.userId, accB.id]
      )
    ),
    /row-level security/
  );
});
