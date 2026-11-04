const { test, before, after, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const { pool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const {
  occurrence,
  nextOccurrence,
  firstOnOrAfter,
  daysInMonth,
  isoDay,
  processDue,
  MAX_OCCURRENCES_PER_RUN,
} = require("../src/services/recurringService");

// ---------------------------------------------------------------------------------------------
// Date arithmetic (pure)
// ---------------------------------------------------------------------------------------------

const series = (start, freq, n) => Array.from({ length: n }, (_, i) => occurrence(start, freq, i));

test("dates: daysInMonth handles leap years", () => {
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2025, 2), 28);
  assert.equal(daysInMonth(2100, 2), 28);
  assert.equal(daysInMonth(2000, 2), 29);
  assert.equal(daysInMonth(2025, 12), 31);
  assert.equal(daysInMonth(2025, 4), 30);
});

test("dates: monthly keeps the original day, clamped to the month length", () => {
  assert.deepEqual(series("2025-01-31", "monthly", 5), ["2025-01-31", "2025-02-28", "2025-03-31", "2025-04-30", "2025-05-31"]);
  assert.deepEqual(series("2024-01-31", "monthly", 3), ["2024-01-31", "2024-02-29", "2024-03-31"]);
  assert.deepEqual(series("2025-11-30", "monthly", 4), ["2025-11-30", "2025-12-30", "2026-01-30", "2026-02-28"]);
  assert.deepEqual(series("2025-12-15", "monthly", 3), ["2025-12-15", "2026-01-15", "2026-02-15"]);
  // stepping from a clamped date goes back to the original day
  assert.equal(nextOccurrence("2025-01-31", "monthly", "2025-02-28"), "2025-03-31");
  assert.equal(occurrence("2025-01-31", "monthly", 24), "2027-01-31");
});

test("dates: yearly on 29 Feb falls back to 28 Feb in non-leap years", () => {
  assert.deepEqual(series("2024-02-29", "yearly", 5), ["2024-02-29", "2025-02-28", "2026-02-28", "2027-02-28", "2028-02-29"]);
  assert.equal(nextOccurrence("2024-02-29", "yearly", "2027-02-28"), "2028-02-29");
});

test("dates: daily and weekly cross month / year / leap boundaries", () => {
  assert.deepEqual(series("2024-02-27", "daily", 4), ["2024-02-27", "2024-02-28", "2024-02-29", "2024-03-01"]);
  assert.deepEqual(series("2025-12-30", "daily", 3), ["2025-12-30", "2025-12-31", "2026-01-01"]);
  assert.deepEqual(series("2025-12-25", "weekly", 3), ["2025-12-25", "2026-01-01", "2026-01-08"]);
  // DST change in Europe (30 Mar 2025) does not shift anything: everything is UTC
  assert.deepEqual(series("2025-03-29", "daily", 3), ["2025-03-29", "2025-03-30", "2025-03-31"]);
  assert.equal(occurrence("2025-01-01", "daily", -1), "2024-12-31");
});

test("dates: firstOnOrAfter finds the next occurrence of the schedule", () => {
  assert.equal(firstOnOrAfter("2025-01-31", "monthly", "2025-01-01"), "2025-01-31"); // before start -> start
  assert.equal(firstOnOrAfter("2025-01-31", "monthly", "2025-04-15"), "2025-04-30");
  assert.equal(firstOnOrAfter("2025-01-31", "monthly", "2025-03-31"), "2025-03-31");
  assert.equal(firstOnOrAfter("2025-01-31", "monthly", "2025-04-30"), "2025-04-30");
  assert.equal(firstOnOrAfter("2025-01-31", "monthly", "2025-05-01"), "2025-05-31");
  assert.equal(firstOnOrAfter("2025-01-06", "weekly", "2025-01-07"), "2025-01-13");
  assert.equal(firstOnOrAfter("2025-01-06", "weekly", "2025-01-13"), "2025-01-13");
  assert.equal(firstOnOrAfter("2024-02-29", "yearly", "2025-03-01"), "2026-02-28");
  assert.equal(firstOnOrAfter("2025-01-01", "daily", "2025-03-01"), "2025-03-01");
  assert.throws(() => occurrence("2025-01-01", "hourly", 1));
  assert.throws(() => occurrence("01/01/2025", "daily", 1));
});

// ---------------------------------------------------------------------------------------------
// Processor + API (database)
// ---------------------------------------------------------------------------------------------

let ready;
let A;
let B;
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("recA");
  B = await registerUser("recB");
});
// Rules with fixed past dates must not be picked up by later tests that run with the real clock
afterEach(async () => {
  if (ready) await pool.query("UPDATE recurring_transactions SET is_active = false WHERE user_id = ANY($1::uuid[])", [[A.userId, B.userId]]);
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const newAccount = async (user, initial_balance = 0, name = "Rec") =>
  (await user.agent.post("/api/accounts/manual").send({ account_name: name, account_type: "checking", initial_balance })).body.data.account;
const balanceOf = async (id) => (await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [id])).rows[0].current_balance;
const ruleRow = async (id) => (await pool.query("SELECT * FROM recurring_transactions WHERE id = $1", [id])).rows[0];
const txDates = async (accountId, description) =>
  (await pool.query(
    `SELECT to_char(transaction_date, 'YYYY-MM-DD') AS d FROM transactions
      WHERE manual_account_id = $1 AND description = $2 ORDER BY transaction_date`,
    [accountId, description]
  )).rows.map((r) => r.d);

/** Inserts a rule directly (bypasses API validation, e.g. to use fixed past dates). */
const insertRule = async (user, accountId, r) =>
  (await pool.query(
    `INSERT INTO recurring_transactions
       (user_id, manual_account_id, category_id, amount, transaction_type, description, frequency, start_date, next_run_date, end_date)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9) RETURNING *`,
    [user.userId, accountId, r.category_id || null, r.amount, r.transaction_type || "income", r.description, r.frequency, r.start_date, r.end_date || null]
  )).rows[0];
const at = (day) => new Date(`${day}T10:00:00Z`);

test("processor: monthly catch-up keeps the day of month, is idempotent", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Stipendio");
  const rule = await insertRule(A, acc.id, { amount: 1000, description: "Stipendio 31", frequency: "monthly", start_date: "2025-01-31" });

  const r1 = await processDue({ userId: A.userId, now: at("2025-04-15") });
  assert.equal(r1.created.length, 3);
  assert.deepEqual(await txDates(acc.id, "Stipendio 31"), ["2025-01-31", "2025-02-28", "2025-03-31"]);
  assert.equal(await balanceOf(acc.id), 3000);
  const row = await ruleRow(rule.id);
  assert.equal(row.next_run_date, "2025-04-30");
  assert.equal(row.is_active, true);
  assert.equal(row.last_error, null);
  assert.ok(row.last_run_at);
  const tx = r1.created[0].transaction;
  assert.equal(tx.transaction_type, "income");
  assert.deepEqual(typeof tx.tags === "string" ? JSON.parse(tx.tags) : tx.tags, ["recurring"]);

  // same day again -> nothing new
  assert.equal((await processDue({ userId: A.userId, now: at("2025-04-15") })).created.length, 0);
  // next occurrence on its clamped date
  assert.equal((await processDue({ userId: A.userId, now: at("2025-04-30") })).created.length, 1);
  assert.equal((await ruleRow(rule.id)).next_run_date, "2025-05-31");
  assert.equal(await balanceOf(acc.id), 4000);
});

test("processor: end_date stops and deactivates the rule", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A);
  const rule = await insertRule(A, acc.id, { amount: 1, description: "Fine", frequency: "daily", start_date: "2025-01-01", end_date: "2025-01-05" });
  const r = await processDue({ userId: A.userId, now: at("2025-02-01") });
  assert.equal(r.created.filter((c) => c.rule_id === rule.id).length, 5);
  assert.ok(r.deactivated.includes(rule.id));
  const row = await ruleRow(rule.id);
  assert.equal(row.is_active, false);
  assert.equal(row.next_run_date, "2025-01-06");
  assert.deepEqual(await txDates(acc.id, "Fine"), ["2025-01-01", "2025-01-02", "2025-01-03", "2025-01-04", "2025-01-05"]);

  // a rule whose next_run_date already passed end_date is just closed
  const late = await insertRule(A, acc.id, { amount: 1, description: "Late", frequency: "weekly", start_date: "2025-01-10", end_date: "2025-01-10" });
  await pool.query("UPDATE recurring_transactions SET next_run_date = '2025-01-17' WHERE id = $1", [late.id]);
  const r2 = await processDue({ userId: A.userId, now: at("2025-02-01") });
  assert.ok(r2.deactivated.includes(late.id));
  assert.equal((await txDates(acc.id, "Late")).length, 0);
});

test("processor: catch-up is capped per run and resumes on the next run", async (t) => {
  if (!ready) return t.skip();
  assert.equal(MAX_OCCURRENCES_PER_RUN, 366);
  const { userId } = A;
  const acc = await newAccount(A);
  const rule = await insertRule(A, acc.id, { amount: 0.01, description: "Cap", frequency: "daily", start_date: "2025-01-01" });
  const now = at("2025-01-12");
  // time-boxed run (request paths): stops between occurrences, keeps consistent progress
  const r0 = await processDue({ userId, now, timeBudgetMs: 1 });
  assert.equal(r0.pending, true);
  assert.ok(r0.created.length < 12);
  await pool.query("UPDATE recurring_transactions SET next_run_date = '2025-01-01' WHERE id = $1", [rule.id]);
  await pool.query("DELETE FROM transactions WHERE manual_account_id = $1", [acc.id]);
  await pool.query("UPDATE manual_accounts SET current_balance = 0 WHERE id = $1", [acc.id]);

  const r1 = await processDue({ userId, now, maxPerRule: 5 });
  assert.equal(r1.created.filter((c) => c.rule_id === rule.id).length, 5);
  assert.equal(r1.pending, true);
  assert.equal((await ruleRow(rule.id)).next_run_date, "2025-01-06");
  const r2 = await processDue({ userId, now, maxPerRule: 5 });
  assert.equal(r2.created.filter((c) => c.rule_id === rule.id).length, 5);
  const r3 = await processDue({ userId, now }); // default cap: the remaining 2
  assert.equal(r3.created.filter((c) => c.rule_id === rule.id).length, 2);
  assert.equal(r3.pending, false);
  assert.equal((await ruleRow(rule.id)).next_run_date, "2025-01-13");
  assert.equal(await balanceOf(acc.id), 0.12);
  assert.equal(new Set(await txDates(acc.id, "Cap")).size, 12);
  await pool.query("DELETE FROM recurring_transactions WHERE id = $1", [rule.id]);
});

test("processor: a failing occurrence is rolled back alone and retried later", async (t) => {
  if (!ready) return t.skip();
  const poor = await newAccount(A, 25, "Povero");
  const rich = await newAccount(A, 0, "Ricco");
  const failing = await insertRule(A, poor.id, { amount: 10, transaction_type: "expense", description: "Abbonamento", frequency: "monthly", start_date: "2025-01-10" });
  const healthy = await insertRule(A, rich.id, { amount: 5, description: "Entrata", frequency: "monthly", start_date: "2025-01-10" });

  const r = await processDue({ userId: A.userId, now: at("2025-04-20") });
  // 4 due on each rule; the expense one stops after 2 (25 -> 15 -> 5, the third would overdraw)
  assert.equal(r.created.filter((c) => c.rule_id === failing.id).length, 2);
  assert.equal(r.created.filter((c) => c.rule_id === healthy.id).length, 4, "other rules are not affected");
  const err = r.errors.find((e) => e.rule_id === failing.id);
  assert.ok(err);
  assert.equal(err.date, "2025-03-10");
  assert.equal(await balanceOf(poor.id), 5);
  let row = await ruleRow(failing.id);
  assert.equal(row.next_run_date, "2025-03-10", "next_run_date stays on the failed occurrence");
  assert.equal(row.is_active, true);
  assert.ok(row.last_error);

  // fund the account -> the remaining occurrences are generated and the error is cleared
  await A.agent.post("/api/transactions").send({ manual_account_id: poor.id, transaction_date: new Date().toISOString(), amount: 100, transaction_type: "income", description: "Ricarica" });
  const r2 = await processDue({ userId: A.userId, now: at("2025-04-20") });
  assert.equal(r2.created.filter((c) => c.rule_id === failing.id).length, 2);
  row = await ruleRow(failing.id);
  assert.equal(row.next_run_date, "2025-05-10");
  assert.equal(row.last_error, null);
  assert.deepEqual(await txDates(poor.id, "Abbonamento"), ["2025-01-10", "2025-02-10", "2025-03-10", "2025-04-10"]);

  // archived account -> error stored, nothing created
  const arch = await newAccount(A, 0, "Archiviato");
  await A.agent.post("/api/transactions").send({ manual_account_id: arch.id, transaction_date: new Date().toISOString(), amount: 1, transaction_type: "income", description: "x" });
  assert.equal((await A.agent.delete(`/api/accounts/manual/${arch.id}`)).status, 200);
  const dead = await insertRule(A, arch.id, { amount: 1, description: "Morto", frequency: "daily", start_date: "2025-01-01" });
  const r3 = await processDue({ userId: A.userId, now: at("2025-01-03") });
  assert.equal(r3.created.filter((c) => c.rule_id === dead.id).length, 0);
  row = await ruleRow(dead.id);
  assert.match(row.last_error, /archived/i);
  assert.equal(row.next_run_date, "2025-01-01");
  for (const id of [failing.id, healthy.id, dead.id]) await pool.query("DELETE FROM recurring_transactions WHERE id = $1", [id]);
});

test("processor: concurrent runs never create duplicates", async (t) => {
  if (!ready) return t.skip();
  const { userId } = A;
  const acc = await newAccount(A);
  const rule = await insertRule(A, acc.id, { amount: 1, description: "Parallelo", frequency: "daily", start_date: "2025-03-01", end_date: "2025-03-20" });
  const now = at("2025-03-25");
  await Promise.all([
    processDue({ userId, now }),
    processDue({ userId, now }),
    processDue({ now }), // all users (scheduler mode)
    processDue({ userId, now }),
    A.agent.post("/api/recurring/process").send(),
    A.agent.get("/api/recurring"),
  ]);
  const dates = await txDates(acc.id, "Parallelo");
  assert.equal(dates.length, 20);
  assert.equal(new Set(dates).size, 20);
  assert.equal(await balanceOf(acc.id), 20);
  const row = await ruleRow(rule.id);
  assert.equal(row.is_active, false);
  assert.equal(row.next_run_date, "2025-03-21");
});

test("scheduler mode processes every user in its own context", async (t) => {
  if (!ready) return t.skip();
  const accA = await newAccount(A);
  const accB = await newAccount(B);
  await insertRule(A, accA.id, { amount: 2, description: "Sched", frequency: "weekly", start_date: "2025-06-02", end_date: "2025-06-16" });
  await insertRule(B, accB.id, { amount: 3, description: "Sched", frequency: "weekly", start_date: "2025-06-02", end_date: "2025-06-16" });
  const total = await processDue({ now: at("2025-07-01") });
  assert.ok(total.users >= 2);
  assert.ok(total.created >= 6);
  assert.equal(await balanceOf(accA.id), 6);
  assert.equal(await balanceOf(accB.id), 9);
  const owners = await pool.query(
    "SELECT DISTINCT t.user_id = m.user_id AS same FROM transactions t JOIN manual_accounts m ON m.id = t.manual_account_id WHERE t.description = 'Sched'"
  );
  assert.deepEqual(owners.rows.map((r) => r.same), [true]);
});

// --- API ---

const today = () => isoDay();
const plusDays = (n) => occurrence(today(), "daily", n);

test("API: create generates what is already due and returns the rule", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "API");
  const res = await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 100, transaction_type: "income", description: "Affitto incassato",
    frequency: "monthly", start_date: today(),
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const rule = res.body.data.recurring;
  assert.equal(res.body.data.processed.created, 1);
  assert.equal(rule.start_date, today());
  assert.equal(rule.next_run_date, occurrence(today(), "monthly", 1));
  assert.equal(rule.account_name, "API");
  assert.equal(rule.is_active, true);
  assert.equal(await balanceOf(acc.id), 100);

  const weekly = await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 1, transaction_type: "income", description: "Settimanale",
    frequency: "weekly", start_date: plusDays(-14), end_date: plusDays(60),
  });
  assert.equal(weekly.status, 201);
  assert.equal(weekly.body.data.processed.created, 3);
  assert.equal(weekly.body.data.recurring.next_run_date, plusDays(7));

  // future start: nothing yet
  const fut = await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 1, transaction_type: "income", description: "Futuro",
    frequency: "yearly", start_date: plusDays(10),
  });
  assert.equal(fut.body.data.processed.created, 0);
  assert.equal(fut.body.data.recurring.next_run_date, plusDays(10));

  // changing the frequency never re-generates past occurrences
  const id = weekly.body.data.recurring.id;
  const upd = await A.agent.put(`/api/recurring/${id}`).send({ frequency: "daily" });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  assert.equal(upd.body.data.processed.created, 0);
  assert.equal(upd.body.data.recurring.next_run_date, plusDays(7));
  assert.equal((await txDates(acc.id, "Settimanale")).length, 3);

  const one = await A.agent.get(`/api/recurring/${id}`);
  assert.equal(one.status, 200);
  assert.equal(one.body.data.recurring.frequency, "daily");

  // delete keeps generated transactions
  assert.equal((await A.agent.delete(`/api/recurring/${id}`)).status, 200);
  assert.equal((await A.agent.get(`/api/recurring/${id}`)).status, 404);
  assert.equal((await A.agent.delete(`/api/recurring/${id}`)).status, 404);
  assert.equal((await txDates(acc.id, "Settimanale")).length, 3);
});

test("API: GET lazily processes due rules; POST /process reports what was created", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Lazy");
  const rule = await insertRule(A, acc.id, { amount: 2, description: "Lazy", frequency: "daily", start_date: plusDays(-2) });
  const list = await A.agent.get("/api/recurring");
  assert.equal(list.status, 200);
  assert.ok(list.body.data.processed.created >= 3);
  const listed = list.body.data.recurring.find((r) => r.id === rule.id);
  assert.equal(listed.next_run_date, plusDays(1));
  assert.equal(await balanceOf(acc.id), 6);

  await pool.query("UPDATE recurring_transactions SET next_run_date = $2 WHERE id = $1", [rule.id, today()]);
  await pool.query("DELETE FROM transactions WHERE manual_account_id = $1 AND transaction_date >= $2::date", [acc.id, today()]);
  const proc = await A.agent.post("/api/recurring/process").send();
  assert.equal(proc.status, 200);
  const mine = proc.body.data.created.filter((c) => c.rule_id === rule.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].description, "Lazy");
  assert.deepEqual(proc.body.data.errors, []);
});

test("API: pause / resume (no back-fill of the paused period) and ended rules", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Pausa");
  const created = (await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 1, transaction_type: "income", description: "Pausa",
    frequency: "daily", start_date: plusDays(-5),
  })).body.data;
  assert.equal(created.processed.created, 6);
  const id = created.recurring.id;

  const paused = await A.agent.put(`/api/recurring/${id}`).send({ is_active: false });
  assert.equal(paused.status, 200);
  assert.equal(paused.body.data.recurring.is_active, false);
  // simulate a pause that started 4 days ago: those days must not be generated on resume
  await pool.query("UPDATE recurring_transactions SET next_run_date = $2 WHERE id = $1", [id, plusDays(-3)]);
  await pool.query("DELETE FROM transactions WHERE manual_account_id = $1 AND transaction_date >= $2::date", [acc.id, plusDays(-3)]);
  assert.equal((await A.agent.post("/api/recurring/process").send()).body.data.created.filter((c) => c.rule_id === id).length, 0, "paused rules are skipped");

  const resumed = await A.agent.put(`/api/recurring/${id}`).send({ is_active: true });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.data.processed.created, 1, "only today's occurrence");
  assert.equal(resumed.body.data.recurring.next_run_date, plusDays(1));
  assert.deepEqual(await txDates(acc.id, "Pausa"), [plusDays(-5), plusDays(-4), today()]);

  // ended rule: resuming requires moving end_date forward
  const ended = (await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 1, transaction_type: "income", description: "Finita",
    frequency: "daily", start_date: plusDays(-3), end_date: plusDays(-2),
  })).body.data;
  assert.equal(ended.processed.created, 2);
  assert.equal(ended.recurring.is_active, false);
  const again = await A.agent.put(`/api/recurring/${ended.recurring.id}`).send({ is_active: true });
  assert.equal(again.status, 422);
  const extended = await A.agent.put(`/api/recurring/${ended.recurring.id}`).send({ is_active: true, end_date: plusDays(5) });
  assert.equal(extended.status, 200, JSON.stringify(extended.body));
  assert.equal(extended.body.data.recurring.is_active, true);
  assert.equal(extended.body.data.processed.created, 1);

  // moving end_date before the next occurrence closes an active rule
  const closed = await A.agent.put(`/api/recurring/${ended.recurring.id}`).send({ end_date: today() });
  assert.equal(closed.body.data.recurring.is_active, false);
});

test("API: validation", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Valid");
  const cats = (await A.agent.get("/api/categories")).body.data.categories;
  const incomeCat = cats.find((c) => c.category_type === "income");
  const expenseCat = cats.find((c) => c.category_type === "expense");
  const base = { manual_account_id: acc.id, amount: 10, transaction_type: "expense", description: "Netflix", frequency: "monthly", start_date: plusDays(1) };
  const post = (extra) => A.agent.post("/api/recurring").send({ ...base, ...extra });

  assert.equal((await post({ frequency: "hourly" })).status, 400);
  assert.equal((await post({ start_date: "2026-02-30" })).status, 400);
  assert.equal((await post({ start_date: `${plusDays(1)}T00:00:00Z` })).status, 400);
  assert.equal((await post({ start_date: undefined })).status, 400);
  assert.equal((await post({ end_date: today() })).status, 400, "end before start");
  assert.equal((await post({ amount: 0 })).status, 400);
  assert.equal((await post({ amount: 1.001 })).status, 400);
  assert.equal((await post({ description: "  " })).status, 400);
  assert.equal((await post({ transaction_type: "transfer" })).status, 400);
  assert.equal((await post({ manual_account_id: "x" })).status, 400);
  assert.equal((await post({ start_date: plusDays(-400) })).status, 400, "too far in the past");
  assert.equal((await post({ category_id: incomeCat.id })).status, 400, "category type mismatch");
  assert.equal((await post({ category_id: "00000000-0000-4000-8000-000000000000" })).status, 404);
  assert.equal((await post({ manual_account_id: "00000000-0000-4000-8000-000000000000" })).status, 404);

  const ok = await post({ category_id: expenseCat.id, end_date: null });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.recurring.category_name, expenseCat.category_name);
  const id = ok.body.data.recurring.id;
  assert.equal((await A.agent.put(`/api/recurring/${id}`).send({ amount: -1 })).status, 400);
  assert.equal((await A.agent.put(`/api/recurring/${id}`).send({ is_active: "boh" })).status, 400);
  assert.equal((await A.agent.put(`/api/recurring/${id}`).send({ transaction_type: "income" })).status, 400, "category no longer compatible");
  assert.equal((await A.agent.put(`/api/recurring/${id}`).send({ transaction_type: "income", category_id: null })).status, 200);
  assert.equal((await A.agent.put(`/api/recurring/${id}`).send({ end_date: plusDays(-10) })).status, 400);
  assert.equal((await A.agent.put("/api/recurring/abc").send({})).status, 400);

  // archived account -> 409
  await A.agent.post("/api/transactions").send({ manual_account_id: acc.id, transaction_date: new Date().toISOString(), amount: 1, transaction_type: "income", description: "x" });
  await A.agent.delete(`/api/accounts/manual/${acc.id}`);
  assert.equal((await post({})).status, 409);
});

test("API: rules are isolated between users", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(A, 0, "Privato");
  const rule = (await A.agent.post("/api/recurring").send({
    manual_account_id: acc.id, amount: 5, transaction_type: "income", description: "Segreto",
    frequency: "monthly", start_date: plusDays(3),
  })).body.data.recurring;

  assert.ok(!(await B.agent.get("/api/recurring")).body.data.recurring.some((r) => r.id === rule.id));
  assert.equal((await B.agent.get(`/api/recurring/${rule.id}`)).status, 404);
  assert.equal((await B.agent.put(`/api/recurring/${rule.id}`).send({ amount: 1 })).status, 404);
  assert.equal((await B.agent.delete(`/api/recurring/${rule.id}`)).status, 404);
  // B cannot attach a rule to A's account, nor move its own rule onto it
  const bodyB = { manual_account_id: acc.id, amount: 1, transaction_type: "income", description: "hack", frequency: "daily", start_date: plusDays(1) };
  assert.equal((await B.agent.post("/api/recurring").send(bodyB)).status, 404);
  const accB = await newAccount(B, 0, "B");
  const ruleB = (await B.agent.post("/api/recurring").send({ ...bodyB, manual_account_id: accB.id })).body.data.recurring;
  assert.equal((await B.agent.put(`/api/recurring/${ruleB.id}`).send({ manual_account_id: acc.id })).status, 404);
  // B's processing never touches A's rules
  await pool.query("UPDATE recurring_transactions SET next_run_date = $2 WHERE id = $1", [rule.id, today()]);
  const procB = await B.agent.post("/api/recurring/process").send();
  assert.ok(!procB.body.data.created.some((c) => c.rule_id === rule.id));
  assert.equal(await balanceOf(acc.id), 0);
  assert.equal((await ruleRow(rule.id)).amount, 5);
});
