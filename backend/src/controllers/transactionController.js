const {
  recordTransaction,
  removeTransaction,
  updateTransaction: editTransaction,
} = require("../services/ledgerService");
const { categorizeTransaction } = require("../services/aiService");

const escapeLike = (value) => value.replace(/[\\%_]/g, "\\$&");

/** GET /api/transactions — filters + pagination, newest first. */
exports.listTransactions = async (req, res) => {
  const { account_id, category_id, type, from_date, to_date, search } = req.query;
  const page = req.query.page || 1;
  const limit = req.query.limit || 20;

  const where = ["t.user_id = $1"];
  const params = [req.user.id];
  // `clause` receives the positional placeholder (e.g. "$3") of the pushed value
  const addFilter = (value, clause) => {
    params.push(value);
    where.push(clause(`$${params.length}`));
  };
  if (account_id) addFilter(account_id, (p) => `(t.manual_account_id = ${p} OR t.bank_account_id = ${p})`);
  if (category_id) addFilter(category_id, (p) => `t.category_id = ${p}`);
  if (type) addFilter(type, (p) => `t.transaction_type = ${p}`);
  if (from_date) addFilter(from_date, (p) => `t.transaction_date >= ${p}::date`);
  if (to_date) addFilter(to_date, (p) => `t.transaction_date < (${p}::date + 1)`);
  if (search) addFilter(`%${escapeLike(search)}%`, (p) => `t.description ILIKE ${p} ESCAPE '\\'`);
  const whereSql = where.join(" AND ");

  const result = await req.withUser(async (db) => {
    const total = await db.query(`SELECT COUNT(*)::int AS n FROM transactions t WHERE ${whereSql}`, params);
    const rows = await db.query(
      `SELECT t.id, t.manual_account_id, t.bank_account_id, t.transaction_date, t.amount, t.currency,
              t.transaction_type, t.description, t.notes, t.tags, t.category_id,
              c.category_name, c.icon_emoji AS category_emoji, c.color_tag AS category_color,
              COALESCE(m.account_name, b.account_name, b.bank_name) AS account_name
         FROM transactions t
         LEFT JOIN transaction_categories c ON c.id = t.category_id
         LEFT JOIN manual_accounts m ON m.id = t.manual_account_id
         LEFT JOIN bank_accounts b ON b.id = t.bank_account_id
        WHERE ${whereSql}
        ORDER BY t.transaction_date DESC, t.created_at DESC
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`,
      params
    );
    return { rows: rows.rows, total: total.rows[0].n };
  });

  res.json({
    status: "success",
    data: {
      transactions: result.rows,
      pagination: {
        page,
        limit,
        total: result.total,
        totalPages: Math.max(1, Math.ceil(result.total / limit)),
      },
    },
  });
};

/**
 * POST /api/transactions — atomic: insert + balance update (+ goal progress).
 * When no category is given one is suggested (AI if configured, keyword engine otherwise).
 */
exports.createTransaction = async (req, res) => {
  const userId = req.user.id;
  const b = req.body;

  const tx = await req.withUser(async (db) => {
    let categoryId = b.category_id;
    if (!categoryId) {
      const cats = await db.query(
        `SELECT id, category_name, category_type, icon_emoji, is_system FROM transaction_categories
          WHERE is_active = true AND (is_system = true OR user_id = $1)`,
        [userId]
      );
      const guess = await categorizeTransaction(b.description, b.amount, cats.rows, {
        type: b.transaction_type,
        keywordsOnly: true,
      });
      categoryId = guess?.category_id;
    }

    return recordTransaction(db, userId, {
      manualAccountId: b.manual_account_id,
      date: new Date(b.transaction_date).toISOString(), // normalise offsets to a UTC instant
      amount: b.amount,
      type: b.transaction_type,
      description: b.description,
      categoryId,
      notes: b.notes,
      tags: b.tags,
      goalId: b.savings_goal_id,
    });
  });

  res.status(201).json({ status: "success", data: { transaction: tx } });
};

/**
 * PUT /api/transactions/:id — partial edit (amount, type, date, description, category, notes, tags, account).
 * Atomic: the old effect is reverted and the new one applied (see ledgerService.updateTransaction).
 */
exports.updateTransaction = async (req, res) => {
  const b = req.body;
  const tx = await req.withUser((db) =>
    editTransaction(db, req.user.id, req.params.id, {
      manualAccountId: b.manual_account_id,
      date: b.transaction_date === undefined ? undefined : new Date(b.transaction_date).toISOString(),
      amount: b.amount,
      type: b.transaction_type,
      description: b.description,
      categoryId: b.category_id,
      notes: b.notes,
      tags: b.tags,
    })
  );
  res.json({ status: "success", data: { transaction: tx } });
};

/** DELETE /api/transactions/:id — removes the row and reverts the account balance. */
exports.deleteTransaction = async (req, res) => {
  await req.withUser((db) => removeTransaction(db, req.user.id, req.params.id));
  res.json({ status: "success", message: "Transaction deleted" });
};
