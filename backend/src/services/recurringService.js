const { pool, withUserContext } = require("../config/db");
const { recordTransaction } = require("./ledgerService");

/**
 * Recurring transactions (rent, subscriptions, salary...).
 *
 * A rule describes a schedule anchored on `start_date`; `next_run_date` is the first occurrence not
 * generated yet. The processor turns every due occurrence (next_run_date <= today, <= end_date) into a
 * real ledger transaction through ledgerService.recordTransaction and advances next_run_date.
 *
 * Dates are plain 'YYYY-MM-DD' strings (DATE columns are not converted to JS Dates, see config/db.js)
 * and all arithmetic is done in UTC, so there are no DST / local-time shifts.
 */

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];
const MAX_OCCURRENCES_PER_RUN = 366; // per rule per run: bounds the work of a long catch-up
// Scheduler mode: each user gets at most this much time per tick, so one user with a huge backlog cannot
// monopolise a run; what is left (`pending`) is carried over to the next tick.
const SCHEDULER_USER_BUDGET_MS = 5000;

// --- Date arithmetic (pure, unit tested) ---

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

const parseDate = (s) => {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
};
const pad = (n, len = 2) => String(n).padStart(len, "0");
const fmt = (y, m, d) => `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
const daysInMonth = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based
const toDays = (s) => {
  const { y, m, d } = parseDate(s);
  return Date.UTC(y, m - 1, d) / 86400000;
};
const fromDays = (n) => new Date(n * 86400000).toISOString().slice(0, 10);

/** UTC calendar date of an instant, as 'YYYY-MM-DD'. */
const isoDay = (date = new Date()) => date.toISOString().slice(0, 10);

/**
 * The n-th occurrence (n >= 0) of a schedule starting on `start`. Monthly and yearly rules keep the
 * ORIGINAL day of month, clamped to the length of the target month:
 *   31 Jan monthly -> 28/29 Feb -> 31 Mar;  29 Feb yearly -> 28 Feb in non-leap years.
 */
const occurrence = (start, frequency, n) => {
  switch (frequency) {
    case "daily":
      return fromDays(toDays(start) + n);
    case "weekly":
      return fromDays(toDays(start) + 7 * n);
    case "monthly": {
      const { y, m, d } = parseDate(start);
      const idx = (m - 1) + n;
      const ty = y + Math.floor(idx / 12);
      const tm = (idx % 12) + 1;
      return fmt(ty, tm, Math.min(d, daysInMonth(ty, tm)));
    }
    case "yearly": {
      const { y, m, d } = parseDate(start);
      const ty = y + n;
      return fmt(ty, m, Math.min(d, daysInMonth(ty, m)));
    }
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
};

/** Index of the first occurrence falling on or after `date` (0 when `date` <= start). */
const indexOnOrAfter = (start, frequency, date) => {
  if (date <= start) return 0;
  let n;
  switch (frequency) {
    case "daily":
      return toDays(date) - toDays(start);
    case "weekly":
      return Math.ceil((toDays(date) - toDays(start)) / 7);
    case "monthly": {
      const a = parseDate(start);
      const b = parseDate(date);
      n = (b.y - a.y) * 12 + (b.m - a.m);
      break;
    }
    case "yearly":
      n = parseDate(date).y - parseDate(start).y;
      break;
    default:
      throw new Error(`Unknown frequency: ${frequency}`);
  }
  // Calendar estimate may be one short (e.g. start on the 31st, date on the 30th of the same month)
  while (occurrence(start, frequency, n) < date) n += 1;
  return n;
};

/** First occurrence of the schedule on or after `date`. */
const firstOnOrAfter = (start, frequency, date) =>
  occurrence(start, frequency, indexOnOrAfter(start, frequency, date));

/** The occurrence following `current` (which must itself be an occurrence of the schedule). */
const nextOccurrence = (start, frequency, current) =>
  occurrence(start, frequency, indexOnOrAfter(start, frequency, current) + 1);

// --- Processor ---

/**
 * Generates every due occurrence for the rules of ONE user, using `db` (a client already inside a
 * transaction with the user's RLS context). Rules are claimed with FOR UPDATE SKIP LOCKED, so two
 * concurrent runs never process the same rule: the second one skips it, or (if the first already
 * committed) no longer sees it as due. Each occurrence runs in its own SAVEPOINT; a failure rolls back
 * only that occurrence, is stored in `last_error` and stops the rule for this run (next_run_date stays
 * on the failed occurrence so it is retried next time).
 *
 * `deadline` (ms timestamp, optional) time-boxes the run: once reached, processing stops between two
 * occurrences (progress is saved) and `pending` is true; the next run continues from there.
 *
 * Returns { created: [{ rule_id, transaction }], errors: [{ rule_id, date, message }], deactivated: [rule_id],
 *           pending: boolean }.
 */
const processUserRules = async (db, userId, today, { maxPerRule = MAX_OCCURRENCES_PER_RUN, deadline = null } = {}) => {
  const result = { created: [], errors: [], deactivated: [], pending: false };
  const { rows: rules } = await db.query(
    `SELECT id, manual_account_id, category_id, amount, transaction_type, description, frequency,
            start_date, next_run_date, end_date
       FROM recurring_transactions
      WHERE user_id = $1 AND is_active = true AND next_run_date <= $2::date
      ORDER BY next_run_date, created_at
      FOR UPDATE SKIP LOCKED`,
    [userId, today]
  );

  let timedOut = false;
  for (const rule of rules) {
    if (timedOut) break;
    let next = rule.next_run_date;
    let error = null;
    let count = 0;

    while (next <= today && (!rule.end_date || next <= rule.end_date) && count < maxPerRule) {
      if (deadline && Date.now() >= deadline) {
        timedOut = true;
        break;
      }
      await db.query("SAVEPOINT recurring_occurrence");
      try {
        const transaction = await recordTransaction(db, userId, {
          manualAccountId: rule.manual_account_id,
          date: `${next}T00:00:00.000Z`,
          amount: rule.amount,
          type: rule.transaction_type,
          description: rule.description,
          categoryId: rule.category_id,
          tags: ["recurring"],
        });
        await db.query("RELEASE SAVEPOINT recurring_occurrence");
        result.created.push({ rule_id: rule.id, transaction });
      } catch (err) {
        await db.query("ROLLBACK TO SAVEPOINT recurring_occurrence");
        await db.query("RELEASE SAVEPOINT recurring_occurrence");
        error = err.status && err.status < 500 ? err.message : "Unexpected error while recording the transaction";
        if (!err.status) console.error(`[recurring] rule ${rule.id}:`, err.message);
        result.errors.push({ rule_id: rule.id, date: next, message: error });
        break;
      }
      count += 1;
      next = nextOccurrence(rule.start_date, rule.frequency, next);
    }

    // Still behind (per-rule cap or deadline reached): the next run continues from `next`
    if (!error && next <= today && (!rule.end_date || next <= rule.end_date)) result.pending = true;
    const ended = !error && rule.end_date && next > rule.end_date;
    if (ended) result.deactivated.push(rule.id);
    await db.query(
      `UPDATE recurring_transactions
          SET next_run_date = $2,
              is_active = is_active AND NOT $3,
              last_run_at = CASE WHEN $4 > 0 THEN NOW() ELSE last_run_at END,
              last_error = $5
        WHERE id = $1`,
      [rule.id, next, Boolean(ended), count, error]
    );
  }
  return result;
};

/**
 * Runs the processor.
 * - `{ db, userId }`: inside an existing user transaction (e.g. req.withUser), for one user.
 * - `{ userId }`: opens its own RLS-scoped transaction for that user.
 * - `{}`: every user with due rules (background scheduler). Users are discovered with the owner pool,
 *   then each one is processed in its own `withUserContext` transaction, so one failing user does
 *   not block the others.
 * `now` (Date) can be injected for tests; "today" is its UTC calendar date. `maxPerRule` caps the
 * occurrences generated per rule in one run (default 366); the rest is generated by the next runs.
 * `timeBudgetMs` time-boxes a run (used on request paths so an API call never blocks for long).
 * `perUserBudgetMs` (scheduler mode, default 5 s) time-boxes each user inside a run: a user with a long backlog
 * is left `pending` and continued by the next tick, so other users are still served (`pendingUsers` counts them).
 * Snapshot rebuilds are coalesced per account at COMMIT by ledgerService, so a catch-up is roughly linear.
 */
const processDue = async ({
  db,
  userId,
  now = new Date(),
  maxPerRule = MAX_OCCURRENCES_PER_RUN,
  timeBudgetMs = null,
  perUserBudgetMs = SCHEDULER_USER_BUDGET_MS,
} = {}) => {
  const today = isoDay(now);
  const opts = { maxPerRule, deadline: timeBudgetMs ? Date.now() + timeBudgetMs : null };
  if (db) return processUserRules(db, userId, today, opts);
  if (userId) return withUserContext(userId, (client) => processUserRules(client, userId, today, opts));

  const total = { users: 0, created: 0, errors: 0, deactivated: 0, failedUsers: 0, pendingUsers: 0 };
  const runDeadline = opts.deadline;
  const { rows } = await pool.query(
    `SELECT DISTINCT user_id FROM recurring_transactions WHERE is_active = true AND next_run_date <= $1::date`,
    [today]
  );
  for (const { user_id } of rows) {
    try {
      // Per-user time box (never beyond the whole run's budget, when one is set)
      const userDeadline = perUserBudgetMs ? Date.now() + perUserBudgetMs : null;
      const deadline = [runDeadline, userDeadline].filter(Boolean).reduce((a, b) => Math.min(a, b), Infinity);
      const userOpts = { maxPerRule, deadline: Number.isFinite(deadline) ? deadline : null };
      const r = await withUserContext(user_id, (client) => processUserRules(client, user_id, today, userOpts));
      total.users += 1;
      if (r.pending) total.pendingUsers += 1;
      total.created += r.created.length;
      total.errors += r.errors.length;
      total.deactivated += r.deactivated.length;
    } catch (err) {
      total.failedUsers += 1;
      console.error(`[recurring] processing failed for user ${user_id}:`, err.message);
    }
  }
  return total;
};

/**
 * Background scheduler (started from server.js only, never from app.js so tests do not run timers):
 * one run shortly after startup, then every `intervalMs`. Never throws.
 */
const startScheduler = (intervalMs = 60 * 60 * 1000, startupDelayMs = 3000) => {
  let running = false;
  const tick = async () => {
    if (running) return; // a slow run must not overlap the next tick
    running = true;
    try {
      const r = await processDue();
      if (r.created || r.deactivated || r.failedUsers || r.pendingUsers) {
        console.log(
          `🔁 Recurring: ${r.created} transaction(s) created for ${r.users} user(s), ${r.errors} error(s), ${r.deactivated} rule(s) ended${r.failedUsers ? `, ${r.failedUsers} user(s) failed` : ""}${r.pendingUsers ? `, ${r.pendingUsers} user(s) continue next run` : ""}`
        );
      }
    } catch (err) {
      console.error("[recurring] scheduler run failed:", err.message);
    } finally {
      running = false;
    }
  };
  setTimeout(tick, startupDelayMs).unref(); // let the DB connection check log first
  const timer = setInterval(tick, intervalMs);
  timer.unref();
  return timer;
};

module.exports = {
  FREQUENCIES,
  MAX_OCCURRENCES_PER_RUN,
  SCHEDULER_USER_BUDGET_MS,
  isoDay,
  daysInMonth,
  occurrence,
  firstOnOrAfter,
  nextOccurrence,
  processDue,
  startScheduler,
};
