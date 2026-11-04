const { HttpError } = require("../utils/httpError");
const { recordTransaction, addToGoal } = require("../services/ledgerService");

const withProgress = (g) => ({
  ...g,
  progress_percentage: g.target_amount > 0
    ? Math.min(100, Math.round((g.current_amount / g.target_amount) * 1000) / 10)
    : 0,
});

exports.withProgress = withProgress;

/** GET /api/goals */
exports.listGoals = async (req, res) => {
  const goals = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `SELECT id, goal_name, description, target_amount, current_amount, currency, target_date,
              color_tag, icon_emoji, is_completed, completed_at, created_at
         FROM savings_goals
        WHERE user_id = $1 AND is_active = true
        ORDER BY is_completed, target_date NULLS LAST, created_at`,
      [req.user.id]
    );
    return rows.map(withProgress);
  });
  res.json({ status: "success", data: { goals } });
};

/** POST /api/goals */
exports.createGoal = async (req, res) => {
  const { goal_name, target_amount, target_date = null, color_tag = null, icon_emoji = null, description = null } = req.body;
  const goal = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO savings_goals (user_id, goal_name, target_amount, target_date, color_tag, icon_emoji, description)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [req.user.id, goal_name, target_amount, target_date, color_tag, icon_emoji, description]
    );
    return withProgress(rows[0]);
  });
  res.status(201).json({ status: "success", data: { goal } });
};

/**
 * POST /api/goals/:id/contribute { amount, manual_account_id? }
 * With an account the contribution is also recorded as an expense on it (balance decreases);
 * without one only the goal progresses.
 */
exports.contribute = async (req, res) => {
  const userId = req.user.id;
  const { amount, manual_account_id } = req.body;

  const goal = await req.withUser(async (db) => {
    if (manual_account_id) {
      const g = await db.query(
        "SELECT goal_name FROM savings_goals WHERE id = $1 AND user_id = $2",
        [req.params.id, userId]
      );
      if (!g.rows[0]) throw new HttpError(404, "Savings goal not found");
      await recordTransaction(db, userId, {
        manualAccountId: manual_account_id,
        date: new Date().toISOString(),
        amount,
        type: "expense",
        description: `Contributo obiettivo: ${g.rows[0].goal_name}`,
        goalId: req.params.id,
      });
    } else {
      await addToGoal(db, userId, req.params.id, null, amount);
    }
    const { rows } = await db.query("SELECT * FROM savings_goals WHERE id = $1", [req.params.id]);
    return withProgress(rows[0]);
  });

  res.json({ status: "success", data: { goal } });
};

/** PUT /api/goals/:id */
exports.updateGoal = async (req, res) => {
  const b = req.body;
  const goal = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `UPDATE savings_goals SET
         goal_name     = COALESCE($1, goal_name),
         description   = COALESCE($2, description),
         target_amount = COALESCE($3, target_amount),
         target_date   = COALESCE($4, target_date),
         color_tag     = COALESCE($5, color_tag),
         icon_emoji    = COALESCE($6, icon_emoji),
         is_completed  = COALESCE($7, current_amount >= COALESCE($3, target_amount)),
         completed_at  = CASE WHEN COALESCE($7, current_amount >= COALESCE($3, target_amount))
                              THEN COALESCE(completed_at, NOW()) ELSE NULL END
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [b.goal_name, b.description, b.target_amount, b.target_date, b.color_tag, b.icon_emoji,
       b.is_completed, req.params.id, req.user.id]
    );
    return rows[0] && withProgress(rows[0]);
  });
  if (!goal) throw new HttpError(404, "Savings goal not found");
  res.json({ status: "success", data: { goal } });
};

/** DELETE /api/goals/:id — contribution transactions stay in the ledger. */
exports.deleteGoal = async (req, res) => {
  const deleted = await req.withUser(async (db) => {
    const { rows } = await db.query(
      "DELETE FROM savings_goals WHERE id = $1 AND user_id = $2 RETURNING id",
      [req.params.id, req.user.id]
    );
    return rows[0];
  });
  if (!deleted) throw new HttpError(404, "Savings goal not found");
  res.json({ status: "success", message: "Goal deleted" });
};
