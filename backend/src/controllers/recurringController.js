const { HttpError } = require("../utils/httpError");
const { processDue, firstOnOrAfter, isoDay } = require("../services/recurringService");

const MAX_BACKFILL_DAYS = 366; // a new schedule may start at most ~1 year in the past
// Request paths time-box generation (a long catch-up is finished by later calls / the scheduler)
const REQUEST_BUDGET_MS = 2000;
const PROCESS_BUDGET_MS = 10000;
// Active rules per user: bounds the scheduler's work per user (paused / ended rules do not count)
const MAX_ACTIVE_RULES = 50;

/** 409 RECURRING_LIMIT when the user already has MAX_ACTIVE_RULES active rules (serialized per user). */
const assertActiveRuleSlot = async (db, userId, excludeRuleId = null) => {
  // Transaction-scoped advisory lock: two concurrent creates cannot both take the last slot
  await db.query("SELECT pg_advisory_xact_lock(hashtext('recurring:' || $1::text))", [userId]);
  const { rows } = await db.query(
    `SELECT COUNT(*)::int AS n FROM recurring_transactions
      WHERE user_id = $1 AND is_active = true AND ($2::uuid IS NULL OR id <> $2::uuid)`,
    [userId, excludeRuleId]
  );
  if (rows[0].n >= MAX_ACTIVE_RULES) {
    throw new HttpError(
      409,
      `You can have at most ${MAX_ACTIVE_RULES} active recurring transactions: pause or delete one first`,
      "RECURRING_LIMIT"
    );
  }
};
exports.MAX_ACTIVE_RULES = MAX_ACTIVE_RULES;

const loadRules = async (db, userId, ruleId = null) => {
  const { rows } = await db.query(
    `SELECT r.id, r.manual_account_id, m.account_name, m.account_currency AS currency,
            m.is_archived AS account_archived,
            r.category_id, c.category_name, c.icon_emoji AS category_emoji, c.color_tag AS category_color,
            r.amount, r.transaction_type, r.description, r.frequency, r.start_date, r.next_run_date,
            r.end_date, r.is_active, r.last_run_at, r.last_error, r.created_at, r.updated_at
       FROM recurring_transactions r
       JOIN manual_accounts m ON m.id = r.manual_account_id
       LEFT JOIN transaction_categories c ON c.id = r.category_id
      WHERE r.user_id = $1 AND ($2::uuid IS NULL OR r.id = $2::uuid)
      ORDER BY r.is_active DESC, r.next_run_date, r.created_at`,
    [userId, ruleId]
  );
  return rows;
};

const assertAccount = async (db, userId, accountId) => {
  const { rows } = await db.query(
    "SELECT is_archived FROM manual_accounts WHERE id = $1 AND user_id = $2",
    [accountId, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Account not found");
  if (rows[0].is_archived) throw new HttpError(409, "Account is archived");
};

const assertCategory = async (db, userId, categoryId, type) => {
  const { rows } = await db.query(
    `SELECT category_type FROM transaction_categories
      WHERE id = $1 AND is_active = true AND (is_system = true OR user_id = $2)`,
    [categoryId, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Category not found");
  const ct = rows[0].category_type;
  if (ct !== "both" && ct !== type) throw new HttpError(400, `Category is for ${ct} transactions`);
};

const assertDates = (start, end, { checkBackfill }) => {
  if (end && end < start) throw new HttpError(400, "end_date must be on or after start_date");
  if (checkBackfill) {
    const oldest = isoDay(new Date(Date.now() - MAX_BACKFILL_DAYS * 86400000));
    if (start < oldest) throw new HttpError(400, `start_date cannot be earlier than ${oldest}`);
  }
};

const summarize = (r) => ({
  created: r.created.length,
  errors: r.errors,
  pending: r.pending, // true when more occurrences are due but were left for the next run
});
const NOTHING = { created: 0, errors: [], pending: false };

/** GET /api/recurring — first generates what is due (cheap when nothing is), then lists the rules. */
exports.listRecurring = async (req, res) => {
  const userId = req.user.id;
  let processed = NOTHING;
  try {
    processed = summarize(await req.withUser((db) => processDue({ db, userId, timeBudgetMs: REQUEST_BUDGET_MS })));
  } catch (err) {
    // Listing must keep working even if generation hits an unexpected problem
    console.error("[recurring] lazy processing failed:", err.message);
  }
  const recurring = await req.withUser((db) => loadRules(db, userId));
  res.json({ status: "success", data: { recurring, processed } });
};

/** GET /api/recurring/:id */
exports.getRecurring = async (req, res) => {
  const [rule] = await req.withUser((db) => loadRules(db, req.user.id, req.params.id));
  if (!rule) throw new HttpError(404, "Recurring transaction not found");
  res.json({ status: "success", data: { recurring: rule } });
};

/** POST /api/recurring — creates the rule and immediately generates the occurrences already due. */
exports.createRecurring = async (req, res) => {
  const userId = req.user.id;
  const b = req.body;
  const categoryId = b.category_id || null;
  const endDate = b.end_date || null;
  assertDates(b.start_date, endDate, { checkBackfill: true });

  const result = await req.withUser(async (db) => {
    await assertAccount(db, userId, b.manual_account_id);
    if (categoryId) await assertCategory(db, userId, categoryId, b.transaction_type);
    await assertActiveRuleSlot(db, userId);
    const { rows } = await db.query(
      `INSERT INTO recurring_transactions
         (user_id, manual_account_id, category_id, amount, transaction_type, description, frequency,
          start_date, next_run_date, end_date)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9) RETURNING id`,
      [userId, b.manual_account_id, categoryId, b.amount, b.transaction_type, b.description, b.frequency,
       b.start_date, endDate]
    );
    const processed = summarize(await processDue({ db, userId, timeBudgetMs: REQUEST_BUDGET_MS }));
    const [rule] = await loadRules(db, userId, rows[0].id);
    return { recurring: rule, processed };
  });
  res.status(201).json({ status: "success", data: result });
};

/**
 * PUT /api/recurring/:id — every field optional.
 * - Changing frequency/start_date re-anchors the schedule without re-generating past occurrences.
 * - Pause: is_active=false. Resume: is_active=true continues from today (the paused period is NOT
 *   back-filled). Resuming a rule whose end_date has passed -> 422.
 */
exports.updateRecurring = async (req, res) => {
  const userId = req.user.id;
  const b = req.body;
  const today = isoDay();

  const result = await req.withUser(async (db) => {
    const { rows } = await db.query(
      "SELECT * FROM recurring_transactions WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [req.params.id, userId]
    );
    const rule = rows[0];
    if (!rule) throw new HttpError(404, "Recurring transaction not found");

    const pick = (k) => (b[k] !== undefined ? b[k] : rule[k]);
    const next = {
      manual_account_id: pick("manual_account_id"),
      category_id: pick("category_id") || null,
      amount: pick("amount"),
      transaction_type: pick("transaction_type"),
      description: pick("description"),
      frequency: pick("frequency"),
      start_date: pick("start_date"),
      end_date: pick("end_date") || null,
      is_active: pick("is_active"),
    };
    const scheduleChanged = next.frequency !== rule.frequency || next.start_date !== rule.start_date;

    assertDates(next.start_date, next.end_date, {
      checkBackfill: next.start_date !== rule.start_date && !rule.last_run_at,
    });
    if (next.manual_account_id !== rule.manual_account_id) await assertAccount(db, userId, next.manual_account_id);
    if (next.category_id && (next.category_id !== rule.category_id || next.transaction_type !== rule.transaction_type)) {
      await assertCategory(db, userId, next.category_id, next.transaction_type);
    }

    let nextRun = rule.next_run_date;
    if (scheduleChanged) {
      // Occurrences before the current next_run_date were already generated: never repeat them
      const from = rule.last_run_at && rule.next_run_date > next.start_date ? rule.next_run_date : next.start_date;
      nextRun = firstOnOrAfter(next.start_date, next.frequency, from);
    }
    if (next.is_active && !rule.is_active) {
      await assertActiveRuleSlot(db, userId, rule.id);
      nextRun = firstOnOrAfter(next.start_date, next.frequency, nextRun > today ? nextRun : today);
      if (next.end_date && nextRun > next.end_date) {
        throw new HttpError(422, "This recurring transaction has ended: move end_date forward to resume it");
      }
    } else if (next.is_active && next.end_date && nextRun > next.end_date) {
      next.is_active = false; // end_date moved before the next occurrence: the rule is over
    }

    await db.query(
      `UPDATE recurring_transactions SET
         manual_account_id = $2, category_id = $3, amount = $4, transaction_type = $5, description = $6,
         frequency = $7, start_date = $8, end_date = $9, is_active = $10, next_run_date = $11, last_error = NULL
       WHERE id = $1`,
      [rule.id, next.manual_account_id, next.category_id, next.amount, next.transaction_type, next.description,
       next.frequency, next.start_date, next.end_date, next.is_active, nextRun]
    );
    const processed = next.is_active
      ? summarize(await processDue({ db, userId, timeBudgetMs: REQUEST_BUDGET_MS }))
      : NOTHING;
    const [updated] = await loadRules(db, userId, rule.id);
    return { recurring: updated, processed };
  });
  res.json({ status: "success", data: result });
};

/** DELETE /api/recurring/:id — transactions already generated stay in the ledger. */
exports.deleteRecurring = async (req, res) => {
  const deleted = await req.withUser(async (db) => {
    const { rows } = await db.query(
      "DELETE FROM recurring_transactions WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    return rows[0];
  });
  if (!deleted) throw new HttpError(404, "Recurring transaction not found");
  res.json({ status: "success", message: "Recurring transaction deleted" });
};

/** POST /api/recurring/process — runs the processor for the authenticated user now. */
exports.processNow = async (req, res) => {
  const userId = req.user.id;
  const r = await req.withUser((db) => processDue({ db, userId, timeBudgetMs: PROCESS_BUDGET_MS }));
  res.json({
    status: "success",
    data: {
      created: r.created.map(({ rule_id, transaction }) => ({ rule_id, ...transaction })),
      errors: r.errors,
      deactivated: r.deactivated,
      pending: r.pending,
    },
  });
};
