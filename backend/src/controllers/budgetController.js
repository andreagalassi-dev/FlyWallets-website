const { HttpError } = require("../utils/httpError");

/**
 * Monthly budgets: one spending limit per (user, category). `spent` is always computed for the
 * CURRENT calendar month (UTC) from the expense transactions of that category, on manual and bank
 * accounts, dated from the 1st of the month up to now (future-dated transactions are not counted).
 */

const eur = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const pct = (p) => `${p.toLocaleString("it-IT")}%`;

/** Adds spent / remaining / percentage / status. Integer cents avoid float drift at the thresholds. */
const withStatus = (b) => {
  const spentC = Math.round(b.spent * 100);
  const limitC = Math.round(b.monthly_limit * 100);
  let status = "ok";
  if (spentC >= limitC) status = "exceeded";
  else if (spentC * 100 >= b.alert_threshold * limitC) status = "warning";
  return {
    ...b,
    spent: spentC / 100,
    remaining: (limitC - spentC) / 100, // negative when the budget is exceeded
    percentage: Math.round((spentC / limitC) * 1000) / 10,
    status,
  };
};

const alertMessage = (b) => {
  const name = b.category_name;
  if (b.status === "exceeded") {
    const over = eur.format(-b.remaining);
    return b.remaining < 0
      ? `Budget "${name}" superato di ${over}: spesi ${eur.format(b.spent)} su ${eur.format(b.monthly_limit)} (${pct(b.percentage)}).`
      : `Budget "${name}" esaurito: spesi ${eur.format(b.spent)} su ${eur.format(b.monthly_limit)}.`;
  }
  return `Hai usato il ${pct(b.percentage)} del budget "${name}": restano ${eur.format(b.remaining)} su ${eur.format(b.monthly_limit)}.`;
};

/** Budgets of the user with this month's spending (optionally a single one). */
const loadBudgets = async (db, userId, budgetId = null) => {
  const { rows } = await db.query(
    `SELECT b.id, b.category_id, b.monthly_limit, b.alert_threshold, b.is_active, b.created_at, b.updated_at,
            c.category_name, c.category_type, c.icon_emoji AS category_emoji, c.color_tag AS category_color,
            COALESCE(s.spent, 0) AS spent
       FROM budgets b
       JOIN transaction_categories c ON c.id = b.category_id
       LEFT JOIN LATERAL (
         SELECT SUM(t.amount) AS spent
           FROM transactions t
          WHERE t.user_id = b.user_id
            AND t.category_id = b.category_id
            AND t.transaction_type = 'expense'
            AND t.transaction_date >= date_trunc('month', NOW())
            AND t.transaction_date <= NOW()
       ) s ON true
      WHERE b.user_id = $1 AND ($2::uuid IS NULL OR b.id = $2::uuid)
      ORDER BY b.is_active DESC, c.category_name`,
    [userId, budgetId]
  );
  return rows.map(withStatus);
};

const currentPeriod = () => {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const day = (d) => d.toISOString().slice(0, 10);
  return {
    month: day(now).slice(0, 7),
    from: day(new Date(Date.UTC(y, m, 1))),
    to: day(new Date(Date.UTC(y, m + 1, 0))),
  };
};

/** The category must be visible to the user (system or own), active, and usable for expenses. */
const assertExpenseCategory = async (db, userId, categoryId) => {
  const { rows } = await db.query(
    `SELECT category_type FROM transaction_categories
      WHERE id = $1 AND is_active = true AND (is_system = true OR user_id = $2)`,
    [categoryId, userId]
  );
  if (!rows[0]) throw new HttpError(404, "Category not found");
  if (rows[0].category_type === "income") {
    throw new HttpError(400, "Budgets can only be set on expense categories");
  }
};

/** GET /api/budgets */
exports.listBudgets = async (req, res) => {
  const budgets = await req.withUser((db) => loadBudgets(db, req.user.id));
  const active = budgets.filter((b) => b.is_active);
  const totalLimit = active.reduce((s, b) => s + Math.round(b.monthly_limit * 100), 0);
  const totalSpent = active.reduce((s, b) => s + Math.round(b.spent * 100), 0);
  res.json({
    status: "success",
    data: {
      period: currentPeriod(),
      summary: {
        totalLimit: totalLimit / 100,
        totalSpent: totalSpent / 100,
        totalRemaining: (totalLimit - totalSpent) / 100,
        percentage: totalLimit > 0 ? Math.round((totalSpent / totalLimit) * 1000) / 10 : 0,
        warningCount: active.filter((b) => b.status === "warning").length,
        exceededCount: active.filter((b) => b.status === "exceeded").length,
      },
      budgets,
    },
  });
};

/** GET /api/budgets/alerts — active budgets in warning / exceeded state, most critical first. */
exports.listAlerts = async (req, res) => {
  const budgets = await req.withUser((db) => loadBudgets(db, req.user.id));
  const alerts = budgets
    .filter((b) => b.is_active && b.status !== "ok")
    .sort((a, b) => b.percentage - a.percentage)
    .map((b) => ({
      budget_id: b.id,
      category_id: b.category_id,
      category_name: b.category_name,
      category_emoji: b.category_emoji,
      category_color: b.category_color,
      status: b.status,
      severity: b.status === "exceeded" ? "critical" : "warning",
      monthly_limit: b.monthly_limit,
      alert_threshold: b.alert_threshold,
      spent: b.spent,
      remaining: b.remaining,
      percentage: b.percentage,
      message: alertMessage(b),
    }));
  res.json({ status: "success", data: { period: currentPeriod(), count: alerts.length, alerts } });
};

/** POST /api/budgets { category_id, monthly_limit, alert_threshold? } */
exports.createBudget = async (req, res) => {
  const userId = req.user.id;
  const { category_id, monthly_limit, alert_threshold = 80 } = req.body;
  try {
    const budget = await req.withUser(async (db) => {
      await assertExpenseCategory(db, userId, category_id);
      const { rows } = await db.query(
        `INSERT INTO budgets (user_id, category_id, monthly_limit, alert_threshold)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [userId, category_id, monthly_limit, alert_threshold]
      );
      return (await loadBudgets(db, userId, rows[0].id))[0];
    });
    res.status(201).json({ status: "success", data: { budget } });
  } catch (err) {
    if (err.code === "23505") throw new HttpError(409, "A budget for this category already exists");
    throw err;
  }
};

/** PUT /api/budgets/:id { monthly_limit?, alert_threshold?, is_active? } */
exports.updateBudget = async (req, res) => {
  const userId = req.user.id;
  const { monthly_limit = null, alert_threshold = null, is_active = null } = req.body;
  const budget = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `UPDATE budgets SET
         monthly_limit   = COALESCE($1, monthly_limit),
         alert_threshold = COALESCE($2, alert_threshold),
         is_active       = COALESCE($3, is_active)
       WHERE id = $4 AND user_id = $5
       RETURNING id`,
      [monthly_limit, alert_threshold, is_active, req.params.id, userId]
    );
    return rows[0] && (await loadBudgets(db, userId, rows[0].id))[0];
  });
  if (!budget) throw new HttpError(404, "Budget not found");
  res.json({ status: "success", data: { budget } });
};

/** DELETE /api/budgets/:id */
exports.deleteBudget = async (req, res) => {
  const deleted = await req.withUser(async (db) => {
    const { rows } = await db.query("DELETE FROM budgets WHERE id = $1 AND user_id = $2 RETURNING id", [
      req.params.id,
      req.user.id,
    ]);
    return rows[0];
  });
  if (!deleted) throw new HttpError(404, "Budget not found");
  res.json({ status: "success", message: "Budget deleted" });
};

exports.withStatus = withStatus;
