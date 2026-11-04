// Snapshot rebuild batching (bulk callers: recurring catch-up, CSV import, scripts) and the 10-year date bound.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { pool, dbSuite, registerUser, cleanupTestUsers, closeDb } = require("./helpers");
const { processDue } = require("../src/services/recurringService");
const { recordTransaction, withSnapshotBatch } = require("../src/services/ledgerService");

let ready;
let A;
before(async (t) => {
  ready = await dbSuite(t);
  if (!ready) return;
  A = await registerUser("batch");
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const DAY = 86400000;
const dayAgo = (n) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);

const newAccount = async (initial_balance) => {
  const res = await A.agent.post("/api/accounts/manual").send({ account_name: `B ${Math.random()}`, account_type: "checking", initial_balance });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.account.id;
};

/** Every daily snapshot from `fromDay` to today must equal initial_balance + signed sum of tx up to that day. */
const assertSnapshotsMatchLedger = async (accountId, fromDay) => {
  const { rows } = await pool.query(
    `SELECT d::date::text AS day, ab.balance_amount AS snap,
            m.initial_balance + COALESCE((SELECT SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END)
                                            FROM transactions t
                                           WHERE t.manual_account_id = m.id AND t.transaction_date::date <= d::date), 0) AS expected
       FROM manual_accounts m
      CROSS JOIN generate_series($2::date, CURRENT_DATE, INTERVAL '1 day') d
       LEFT JOIN account_balances ab ON ab.manual_account_id = m.id AND ab.balance_date = d::date
      WHERE m.id = $1
      ORDER BY 1`,
    [accountId, fromDay]
  );
  const wrong = rows.filter((r) => r.snap !== r.expected);
  assert.equal(wrong.length, 0, `snapshots differ from the ledger: ${JSON.stringify(wrong.slice(0, 3))}`);
  return rows;
};

test("recurring catch-up of 365 daily occurrences is fast and leaves correct snapshots", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(100000);
  const start = dayAgo(365);
  await pool.query(
    `INSERT INTO recurring_transactions (user_id, manual_account_id, amount, transaction_type, description, frequency, start_date, next_run_date)
     VALUES ($1, $2, 10, 'expense', 'daily rule', 'daily', $3, $3)`,
    [A.userId, acc, start]
  );

  const t0 = Date.now();
  const r = await processDue({ userId: A.userId });
  const ms = Date.now() - t0;
  assert.equal(r.errors.length, 0, JSON.stringify(r.errors));
  assert.equal(r.created.length, 366);
  assert.ok(ms < 15000, `catch-up took ${ms} ms`);

  const balance = (await pool.query("SELECT current_balance FROM manual_accounts WHERE id = $1", [acc])).rows[0].current_balance;
  assert.equal(balance, 100000 - 366 * 10);
  const rows = await assertSnapshotsMatchLedger(acc, start);
  assert.equal(rows[0].snap, 100000 - 10, "first day: one occurrence");
  assert.equal(rows.at(-1).snap, balance, "today's snapshot equals the live balance");
});

test("clients not opened by withUserContext: immediate rebuild by default, coalesced with withSnapshotBatch", async (t) => {
  if (!ready) return t.skip();
  const plain = await newAccount(1000);
  const batched = await newAccount(1000);
  const input = (accountId, n) => ({
    manualAccountId: accountId, date: `${dayAgo(n)}T12:00:00.000Z`, amount: n, type: n % 3 ? "expense" : "income", description: `d${n}`,
  });

  const client = await pool.connect(); // owner pool, its own BEGIN/COMMIT: no txContext
  try {
    await client.query("BEGIN");
    for (const n of [20, 3, 11]) await recordTransaction(client, A.userId, input(plain, n));
    await withSnapshotBatch(client, async (db) => {
      for (const n of [20, 3, 11]) await recordTransaction(db, A.userId, input(batched, n));
    });
    assert.equal(client.txContext, undefined, "batch context removed");
    await client.query("COMMIT");
  } finally {
    client.release();
  }
  await assertSnapshotsMatchLedger(plain, dayAgo(20));
  await assertSnapshotsMatchLedger(batched, dayAgo(20));
});

test("transaction_date older than 10 years is rejected (API, ledger, CSV rows)", async (t) => {
  if (!ready) return t.skip();
  const acc = await newAccount(1000);
  const tooOld = new Date(Date.now() - (10 * 365 + 5) * DAY).toISOString();
  const base = { manual_account_id: acc, amount: 1, transaction_type: "expense", description: "old" };

  const res = await A.agent.post("/api/transactions").send({ ...base, transaction_date: tooOld });
  assert.equal(res.status, 400);
  assert.match(JSON.stringify(res.body), /10 years/);

  const ok = await A.agent.post("/api/transactions").send({ ...base, transaction_date: `${dayAgo(9 * 365)}T10:00:00Z` });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal((await A.agent.put(`/api/transactions/${ok.body.data.transaction.id}`).send({ transaction_date: tooOld })).status, 400);

  // the ledger enforces it too (callers that bypass the validators: recurring, CSV import, scripts)
  await assert.rejects(
    recordTransaction(pool, A.userId, { manualAccountId: acc, date: tooOld, amount: 1, type: "expense", description: "x" }),
    (err) => err.status === 400 && /10 years/.test(err.message)
  );

  // CSV import: the old row becomes a per-row error, the others are imported
  const csv = `date,amount,description\n2010-01-05,-5,Too old\n${dayAgo(2)},-7,Recent\n`;
  const imp = await A.agent.post("/api/data/import/transactions").send({ manual_account_id: acc, csv });
  assert.equal(imp.status, 200, JSON.stringify(imp.body));
  assert.equal(imp.body.data.imported, 1);
  assert.equal(imp.body.data.errors.length, 1);
  assert.match(imp.body.data.errors[0].message, /10 years/);
});
