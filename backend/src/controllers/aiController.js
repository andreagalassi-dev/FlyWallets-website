const { categorizeTransaction, generateInsights, getProvider } = require("../services/aiService");

const visibleCategories = (db, userId) =>
  db.query(
    `SELECT id, category_name, category_type, icon_emoji, is_system FROM transaction_categories
      WHERE is_active = true AND (is_system = true OR user_id = $1)`,
    [userId]
  );

/** POST /api/ai/categorize { description, amount?, transaction_type? } */
exports.categorize = async (req, res) => {
  const { description, amount, transaction_type } = req.body;
  const categories = await req.withUser(async (db) => (await visibleCategories(db, req.user.id)).rows);
  const suggestion = await categorizeTransaction(description, amount, categories, { type: transaction_type });
  res.json({ status: "success", data: { suggestion, provider: getProvider() } });
};

/** GET /api/ai/insights?lang=en|it — 3 tips from the last 30 days of spending. */
exports.insights = async (req, res) => {
  const stats = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `SELECT t.transaction_type, COALESCE(c.category_name, 'Senza categoria') AS name, SUM(t.amount) AS total
         FROM transactions t LEFT JOIN transaction_categories c ON c.id = t.category_id
        WHERE t.user_id = $1 AND t.transaction_date >= NOW() - INTERVAL '30 days' AND t.transaction_date <= NOW()
        GROUP BY t.transaction_type, c.category_name
        ORDER BY total DESC`,
      [req.user.id]
    );
    const sum = (type) => rows.filter((r) => r.transaction_type === type).reduce((s, r) => s + r.total, 0);
    return {
      income: sum("income"),
      expense: sum("expense"),
      byCategory: rows.filter((r) => r.transaction_type === "expense").map((r) => ({ name: r.name, total: r.total })),
    };
  });

  const lang = req.query.lang === "it" ? "it" : "en";
  const { tips, source } = await generateInsights(stats, lang);
  res.json({
    status: "success",
    data: {
      tips,
      source,
      period: "last_30_days",
      totals: { income: stats.income, expense: stats.expense },
      byCategory: stats.byCategory,
    },
  });
};
