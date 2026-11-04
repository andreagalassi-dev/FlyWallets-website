const { HttpError } = require("../utils/httpError");

/**
 * Balance-affecting operations shared by the transaction and goal controllers.
 * Every function expects a `db` client that is ALREADY inside a transaction
 * (req.withUser provides one), so a failure rolls the whole operation back.
 */

// Transactions may be dated at most this far ahead (time zones / "tomorrow's" payments); beyond -> 400
const MAX_FUTURE_MS = 24 * 60 * 60 * 1000;
// ...and at most this far back: bounds the daily snapshots one request can (re)build (~3,650 rows)
const MAX_PAST_YEARS = 10;

/** True when the date is invalid or more than 1 day in the future. */
const isTooFarInFuture = (date) => {
  const t = new Date(date).getTime();
  return Number.isNaN(t) || t > Date.now() + MAX_FUTURE_MS;
};

/** Oldest accepted transaction instant: same UTC calendar day, MAX_PAST_YEARS years ago, 00:00Z. */
const oldestAllowedDate = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear() - MAX_PAST_YEARS, d.getUTCMonth(), d.getUTCDate()));
};

/** True when the date is invalid or older than MAX_PAST_YEARS years. */
const isTooFarInPast = (date) => {
  const t = new Date(date).getTime();
  return Number.isNaN(t) || t < oldestAllowedDate().getTime();
};

const assertValidDate = (date) => {
  if (Number.isNaN(new Date(date).getTime())) throw new HttpError(400, "Invalid transaction_date");
  if (isTooFarInFuture(date)) {
    throw new HttpError(400, "transaction_date cannot be more than 1 day in the future");
  }
  if (isTooFarInPast(date)) {
    throw new HttpError(400, `transaction_date cannot be more than ${MAX_PAST_YEARS} years in the past`);
  }
};

/** 'YYYY-MM-DD' (UTC) of a Date / ISO string, as stored in the TIMESTAMP column (session time zone is UTC). */
const dayOf = (date) => new Date(date).toISOString().slice(0, 10);

const toCents = (v) => Math.round(Number(v) * 100);
const signedCents = (type, amount) => (type === "income" ? toCents(amount) : -toCents(amount));

const lockAccount = async (db, userId, accountId) => {
  const { rows } = await db.query(
    `SELECT id, account_name, current_balance, is_archived, account_currency, overdraft_allowed, overdraft_limit
       FROM manual_accounts WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [accountId, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Account not found");
  return rows[0];
};

/**
 * Lowest balance (in cents) the account may reach: 0 without overdraft, -overdraft_limit with it,
 * -Infinity when overdraft is allowed without a limit.
 */
const balanceFloorCents = (account) => {
  if (!account.overdraft_allowed) return 0;
  return account.overdraft_limit == null ? -Infinity : -toCents(account.overdraft_limit);
};

/**
 * Rejects (422 INSUFFICIENT_FUNDS) an operation that would LOWER the balance below the allowed floor.
 * Operations that raise the balance are always allowed, even if the account is still below the floor.
 */
const assertCanApply = (account, deltaCents) => {
  if (deltaCents >= 0) return;
  const next = toCents(account.current_balance) + deltaCents;
  const floor = balanceFloorCents(account);
  if (next < floor) {
    const fmt = (c) => (c / 100).toFixed(2);
    throw new HttpError(
      422,
      `Insufficient funds: this operation would bring the balance of "${account.account_name}" to ${fmt(next)} ` +
        (floor === 0 ? "(overdraft is not allowed on this account)" : `(overdraft limit is ${fmt(-floor)})`),
      "INSUFFICIENT_FUNDS"
    );
  }
};

const applyDelta = async (db, accountId, deltaCents) => {
  if (deltaCents === 0) return;
  await db.query(
    "UPDATE manual_accounts SET current_balance = current_balance + $1 WHERE id = $2",
    [deltaCents / 100, accountId]
  );
};

/**
 * Recomputes the daily snapshots of a manual account from `fromDate` (inclusive, 'YYYY-MM-DD' / Date / null =
 * today), set-based: balance(day) = initial_balance + signed sum of the transactions dated on or before that day.
 * The range ends at the LATEST of: today, the account's latest transaction date (transactions may be dated up to
 * 1 day ahead) and its latest existing snapshot. So a "tomorrow" transaction already has its day's snapshot when
 * that day arrives (the net-worth chart carries snapshots forward), and moving/deleting it fixes that row too.
 * Rows are upserted through the partial unique index uq_account_balances_manual_day.
 * Call it with the EARLIEST date touched by a create / edit / delete so backdated changes fix past days.
 */
const rebuildSnapshots = async (db, userId, accountId, fromDate = null) => {
  const from = fromDate == null ? null : fromDate instanceof Date ? dayOf(fromDate) : String(fromDate).slice(0, 10);
  await db.query(
    `WITH acc AS (
       SELECT m.id, m.user_id, m.initial_balance, m.account_currency,
              LEAST(COALESCE($3::date, CURRENT_DATE), CURRENT_DATE) AS start_day,
              GREATEST(
                CURRENT_DATE,
                (SELECT MAX(t.transaction_date)::date FROM transactions t WHERE t.manual_account_id = m.id),
                (SELECT MAX(b.balance_date) FROM account_balances b WHERE b.manual_account_id = m.id)
              ) AS end_day
         FROM manual_accounts m WHERE m.id = $1 AND m.user_id = $2
     ),
     base AS (
       SELECT COALESCE(SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END), 0) AS amount
         FROM transactions t, acc
        WHERE t.manual_account_id = acc.id AND t.transaction_date::date < acc.start_day
     ),
     daily AS (
       SELECT t.transaction_date::date AS day,
              SUM(CASE WHEN t.transaction_type = 'income' THEN t.amount ELSE -t.amount END) AS amount
         FROM transactions t, acc
        WHERE t.manual_account_id = acc.id
          AND t.transaction_date::date >= acc.start_day AND t.transaction_date::date <= acc.end_day
        GROUP BY 1
     ),
     days AS (
       SELECT d::date AS day FROM acc, generate_series(acc.start_day, acc.end_day, INTERVAL '1 day') d
     )
     INSERT INTO account_balances (user_id, manual_account_id, balance_date, balance_amount, currency, is_manual)
     SELECT acc.user_id, acc.id, days.day,
            acc.initial_balance + base.amount + SUM(COALESCE(daily.amount, 0)) OVER (ORDER BY days.day),
            acc.account_currency, true
       FROM days CROSS JOIN acc CROSS JOIN base
       LEFT JOIN daily ON daily.day = days.day
     ON CONFLICT (manual_account_id, balance_date) WHERE manual_account_id IS NOT NULL
     DO UPDATE SET balance_amount = EXCLUDED.balance_amount, currency = EXCLUDED.currency, last_updated_at = NOW()
     WHERE account_balances.balance_amount IS DISTINCT FROM EXCLUDED.balance_amount
        OR account_balances.currency IS DISTINCT FROM EXCLUDED.currency
        OR account_balances.balance_date = CURRENT_DATE`,
    [accountId, userId, from]
  );
};

/** Stores today's balance of the account (same formula as rebuildSnapshots, limited to today). */
const snapshotBalance = (db, userId, accountId) => rebuildSnapshots(db, userId, accountId, null);

const FAR_FUTURE_DAY = "9999-12-31"; // "today" for min() comparisons (rebuildSnapshots clamps to CURRENT_DATE)

/** Runs the snapshot rebuilds queued on this client (one per account, from its earliest date). */
const flushSnapshots = async (db) => {
  const pending = db?.txContext?.ledgerSnapshots;
  if (!pending) return;
  for (const [id, p] of [...pending]) {
    await rebuildSnapshots(db, p.userId, id, p.day === FAR_FUTURE_DAY ? null : p.day);
    pending.delete(id);
  }
};

/**
 * Rebuilds snapshots from `fromDate`.
 * - Inside withUserContext / req.withUser (db.txContext present, set by config/db.js) or withSnapshotBatch the
 *   rebuild is coalesced and run ONCE per account, from the earliest date, right before COMMIT (resp. at the end
 *   of the batch): a 365-occurrence recurring catch-up or a 2,000-row CSV import costs one rebuild per account.
 * - Any other client (seed script, a raw pool client in its own BEGIN, the Pool itself) gets an immediate
 *   rebuild: always correct, just O(days) per call.
 */
const scheduleSnapshots = async (db, userId, accountId, fromDate) => {
  const day = fromDate == null ? FAR_FUTURE_DAY : fromDate instanceof Date ? dayOf(fromDate) : String(fromDate).slice(0, 10);
  const ctx = db.txContext;
  if (!ctx || !Array.isArray(ctx.beforeCommit)) return rebuildSnapshots(db, userId, accountId, fromDate);

  if (!ctx.ledgerSnapshots) {
    ctx.ledgerSnapshots = new Map();
    ctx.beforeCommit.push(() => flushSnapshots(db));
  }
  const prev = ctx.ledgerSnapshots.get(accountId);
  if (!prev || day < prev.day) ctx.ledgerSnapshots.set(accountId, { userId, day });
};

/**
 * Coalesces the snapshot rebuilds of every ledger call made by `fn(db)` on a client that was NOT opened by
 * withUserContext (e.g. a script running its own BEGIN ... COMMIT). Runs them when `fn` returns, still inside
 * the caller's transaction. If `fn` throws, the queued rebuilds are still attempted (best effort; if the
 * transaction is aborted the caller rolls back anyway). Inside withUserContext it simply runs `fn`.
 */
const withSnapshotBatch = async (db, fn) => {
  if (db.txContext || typeof db.release !== "function") return fn(db); // already batched, or a Pool (no tx)
  const ctx = { beforeCommit: [] };
  db.txContext = ctx;
  const runHooks = async () => {
    for (const hook of ctx.beforeCommit) await hook();
  };
  let result;
  try {
    result = await fn(db);
  } catch (err) {
    await runHooks().catch(() => {});
    delete db.txContext;
    throw err;
  }
  try {
    await runHooks();
  } finally {
    delete db.txContext;
  }
  return result;
};

/**
 * Moves a goal's saved amount by `delta` (may be negative; never below 0). Completion is sticky when money
 * is added (a manually completed goal stays completed) and recomputed when money is taken away.
 */
const shiftGoal = async (db, goalId, delta) => {
  await db.query(
    `UPDATE savings_goals
        SET current_amount = GREATEST(current_amount + $1::numeric, 0),
            is_completed = CASE WHEN $1::numeric >= 0
                                THEN is_completed OR current_amount + $1::numeric >= target_amount
                                ELSE GREATEST(current_amount + $1::numeric, 0) >= target_amount END,
            completed_at = CASE WHEN (CASE WHEN $1::numeric >= 0
                                           THEN is_completed OR current_amount + $1::numeric >= target_amount
                                           ELSE GREATEST(current_amount + $1::numeric, 0) >= target_amount END)
                                THEN COALESCE(completed_at, NOW()) ELSE NULL END
      WHERE id = $2`,
    [delta, goalId]
  );
};

const addToGoal = async (db, userId, goalId, transactionId, amount) => {
  const { rows } = await db.query(
    `SELECT id, goal_name, current_amount, target_amount FROM savings_goals
      WHERE id = $1 AND user_id = $2 FOR UPDATE`,
    [goalId, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Savings goal not found");

  if (transactionId) {
    await db.query(
      `INSERT INTO savings_goal_transactions (savings_goal_id, transaction_id, contributed_amount)
       VALUES ($1, $2, $3)`,
      [goalId, transactionId, amount]
    );
  }
  await shiftGoal(db, goalId, amount);
  return rows[0];
};

/** Checks that a category exists for the user and fits the transaction type (404 / 400). */
const assertCategory = async (db, userId, categoryId, type) => {
  const cat = await db.query(
    `SELECT category_type FROM transaction_categories
      WHERE id = $1 AND is_active = true AND (is_system = true OR user_id = $2)`,
    [categoryId, userId]
  );
  if (!cat.rows[0]) throw new HttpError(404, "Category not found");
  const ct = cat.rows[0].category_type;
  if (ct !== "both" && ct !== type) {
    throw new HttpError(400, `Category is for ${ct} transactions`);
  }
};

/**
 * Inserts the transaction, updates the account balance (income +, expense -), rebuilds the daily
 * snapshots from the transaction date (coalesced before COMMIT, see scheduleSnapshots) and, for an expense
 * linked to a savings goal, advances the goal.
 * Throws 400 (date > 1 day ahead / bad category type), 404 (account / category / goal), 409 (archived account),
 * 422 INSUFFICIENT_FUNDS (overdraft rules). Returns the new row.
 */
exports.recordTransaction = async (db, userId, input) => {
  assertValidDate(input.date);
  const account = await lockAccount(db, userId, input.manualAccountId);
  if (account.is_archived) throw new HttpError(409, "Account is archived");

  if (input.categoryId) await assertCategory(db, userId, input.categoryId, input.type);
  if (input.goalId && input.type !== "expense") {
    throw new HttpError(400, "Only expenses can contribute to a savings goal");
  }
  const delta = signedCents(input.type, input.amount);
  assertCanApply(account, delta);

  const { rows } = await db.query(
    `INSERT INTO transactions
       (user_id, manual_account_id, transaction_date, amount, currency, transaction_type,
        description, category_id, notes, tags)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [
      userId,
      input.manualAccountId,
      input.date,
      input.amount,
      account.account_currency,
      input.type,
      input.description,
      input.categoryId || null,
      input.notes || null,
      JSON.stringify(input.tags || []),
    ]
  );
  const tx = rows[0];

  await applyDelta(db, input.manualAccountId, delta);
  await scheduleSnapshots(db, userId, input.manualAccountId, tx.transaction_date);

  if (input.goalId) await addToGoal(db, userId, input.goalId, tx.id, input.amount);

  return tx;
};

/** Deletes a manual-account transaction and reverts its effect on balance and savings goals. */
exports.removeTransaction = async (db, userId, transactionId) => {
  const { rows } = await db.query(
    "SELECT * FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE",
    [transactionId, userId]
  );
  const tx = rows[0];
  if (!tx) throw new HttpError(404, "Transaction not found");
  if (!tx.manual_account_id) {
    throw new HttpError(400, "Imported bank transactions cannot be deleted");
  }

  const account = await lockAccount(db, userId, tx.manual_account_id);
  if (account.is_archived) throw new HttpError(409, "Account is archived");

  // Deleting an income that was already spent must not push the balance below the allowed floor
  const delta = -signedCents(tx.transaction_type, tx.amount);
  assertCanApply(account, delta);

  // Take back what this transaction contributed to goals
  const contribs = await db.query(
    "SELECT savings_goal_id, contributed_amount FROM savings_goal_transactions WHERE transaction_id = $1",
    [tx.id]
  );
  for (const c of contribs.rows) await shiftGoal(db, c.savings_goal_id, -c.contributed_amount);

  await applyDelta(db, tx.manual_account_id, delta);
  await db.query("DELETE FROM transactions WHERE id = $1", [tx.id]);
  await scheduleSnapshots(db, userId, tx.manual_account_id, tx.transaction_date);
  return tx;
};

const TX_CHANGE_KEYS = ["manualAccountId", "date", "amount", "type", "description", "categoryId", "notes", "tags"];

/**
 * Edits a manual-account transaction atomically: reverts the old effect and applies the new one on the
 * old / new account (locked in id order to avoid deadlocks), keeps linked savings goals consistent and
 * rebuilds snapshots from the earliest affected day.
 * `changes` uses the recordTransaction keys; `undefined` = unchanged, `null` clears categoryId / notes.
 * A category not given explicitly is dropped when it no longer fits the new type.
 * Turning a goal contribution into an income unlinks it and takes the amount back from the goal.
 */
exports.updateTransaction = async (db, userId, transactionId, changes) => {
  const has = (k) => changes[k] !== undefined;
  if (!TX_CHANGE_KEYS.some(has)) throw new HttpError(400, "Nothing to update");

  const { rows } = await db.query(
    "SELECT * FROM transactions WHERE id = $1 AND user_id = $2 FOR UPDATE",
    [transactionId, userId]
  );
  const old = rows[0];
  if (!old) throw new HttpError(404, "Transaction not found");
  if (!old.manual_account_id) {
    throw new HttpError(400, "Imported bank transactions cannot be edited");
  }
  if (has("date")) assertValidDate(changes.date);

  const next = {
    accountId: has("manualAccountId") ? changes.manualAccountId : old.manual_account_id,
    amount: has("amount") ? Number(changes.amount) : Number(old.amount),
    type: has("type") ? changes.type : old.transaction_type,
    categoryId: has("categoryId") ? changes.categoryId : old.category_id,
  };

  // Lock every affected account in a deterministic order
  const ids = [...new Set([old.manual_account_id, next.accountId])].sort();
  const accounts = {};
  for (const id of ids) accounts[id] = await lockAccount(db, userId, id);
  if (ids.some((id) => accounts[id].is_archived)) throw new HttpError(409, "Account is archived");

  if (has("categoryId") && next.categoryId) {
    await assertCategory(db, userId, next.categoryId, next.type);
  } else if (!has("categoryId") && next.categoryId && next.type !== old.transaction_type) {
    const cat = await db.query("SELECT category_type FROM transaction_categories WHERE id = $1", [next.categoryId]);
    const ct = cat.rows[0]?.category_type;
    if (ct !== "both" && ct !== next.type) next.categoryId = null;
  }

  // Balance: revert the old effect, apply the new one (net per account), check overdraft rules first
  const deltas = Object.fromEntries(ids.map((id) => [id, 0]));
  deltas[old.manual_account_id] -= signedCents(old.transaction_type, old.amount);
  deltas[next.accountId] += signedCents(next.type, next.amount);
  for (const id of ids) assertCanApply(accounts[id], deltas[id]);

  // Savings goals linked to this transaction
  const links = await db.query(
    "SELECT id, savings_goal_id, contributed_amount FROM savings_goal_transactions WHERE transaction_id = $1",
    [old.id]
  );
  for (const link of links.rows) {
    if (next.type !== "expense") {
      await shiftGoal(db, link.savings_goal_id, -link.contributed_amount);
      await db.query("DELETE FROM savings_goal_transactions WHERE id = $1", [link.id]);
    } else if (toCents(link.contributed_amount) !== toCents(next.amount)) {
      await shiftGoal(db, link.savings_goal_id, (toCents(next.amount) - toCents(link.contributed_amount)) / 100);
      await db.query("UPDATE savings_goal_transactions SET contributed_amount = $1 WHERE id = $2", [next.amount, link.id]);
    }
  }

  for (const id of ids) await applyDelta(db, id, deltas[id]);

  const updated = await db.query(
    `UPDATE transactions SET
       manual_account_id = $1,
       transaction_date  = COALESCE($2::timestamp, transaction_date),
       amount            = $3,
       currency          = $4,
       transaction_type  = $5,
       description       = COALESCE($6, description),
       category_id       = $7,
       notes             = CASE WHEN $8::boolean THEN $9 ELSE notes END,
       tags              = COALESCE($10::json, tags)
     WHERE id = $11
     RETURNING *`,
    [
      next.accountId,
      has("date") ? new Date(changes.date).toISOString() : null,
      next.amount,
      accounts[next.accountId].account_currency,
      next.type,
      has("description") ? changes.description : null,
      next.categoryId || null,
      has("notes"),
      changes.notes ?? null,
      has("tags") ? JSON.stringify(changes.tags || []) : null,
      old.id,
    ]
  );
  const tx = updated.rows[0];

  const fromDay = [dayOf(old.transaction_date), dayOf(tx.transaction_date)].sort()[0];
  for (const id of ids) await scheduleSnapshots(db, userId, id, fromDay);

  return tx;
};

/** Advances a goal without moving money between accounts (used by POST /goals/:id/contribute). */
exports.addToGoal = addToGoal;
exports.snapshotBalance = snapshotBalance;
exports.rebuildSnapshots = rebuildSnapshots;
exports.lockAccount = lockAccount;
exports.balanceFloorCents = balanceFloorCents;
exports.isTooFarInFuture = isTooFarInFuture;
exports.isTooFarInPast = isTooFarInPast;
exports.MAX_FUTURE_MS = MAX_FUTURE_MS;
exports.MAX_PAST_YEARS = MAX_PAST_YEARS;
exports.flushSnapshots = flushSnapshots;
exports.withSnapshotBatch = withSnapshotBatch;
