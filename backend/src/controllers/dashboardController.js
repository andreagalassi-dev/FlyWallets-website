const { withProgress } = require("./goalController");

/**
 * GET /api/dashboard — everything the home screen needs in one round trip
 * (one RLS-scoped transaction; the queries are independent aggregates).
 */
exports.getDashboard = async (req, res) => {
  const userId = req.user.id;

  const data = await req.withUser(async (db) => {
    const [accounts, month, recent, goals, categories] = await Promise.all([
      db.query(
        `SELECT id, 'manual' AS source, account_name, account_type, account_currency AS currency,
                current_balance, color_tag, icon_emoji
           FROM manual_accounts
          WHERE user_id = $1 AND is_archived = false AND is_active = true
          ORDER BY created_at`,
        [userId]
      ),
      db.query(
        `SELECT COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'income'), 0)  AS income,
                COALESCE(SUM(amount) FILTER (WHERE transaction_type = 'expense'), 0) AS expense
           FROM transactions
          WHERE user_id = $1 AND transaction_date >= date_trunc('month', NOW())
            AND transaction_date < date_trunc('month', NOW()) + INTERVAL '1 month'`,
        [userId]
      ),
      db.query(
        `SELECT t.id, t.transaction_date, t.amount, t.currency, t.transaction_type, t.description,
                c.category_name, c.icon_emoji AS category_emoji, c.color_tag AS category_color,
                m.account_name
           FROM transactions t
           LEFT JOIN transaction_categories c ON c.id = t.category_id
           LEFT JOIN manual_accounts m ON m.id = t.manual_account_id
          WHERE t.user_id = $1
          ORDER BY t.transaction_date DESC, t.created_at DESC
          LIMIT 8`,
        [userId]
      ),
      db.query(
        `SELECT id, goal_name, target_amount, current_amount, currency, target_date, color_tag, icon_emoji, is_completed
           FROM savings_goals WHERE user_id = $1 AND is_active = true
          ORDER BY is_completed, target_date NULLS LAST, created_at LIMIT 6`,
        [userId]
      ),
      db.query(
        `SELECT id, category_name, category_type, color_tag, icon_emoji, is_system
           FROM transaction_categories
          WHERE is_active = true AND (is_system = true OR user_id = $1)
          ORDER BY is_system DESC, category_type, category_name`,
        [userId]
      ),
    ]);

    const totalBalance = accounts.rows.reduce((sum, a) => sum + a.current_balance, 0);
    const { income, expense } = month.rows[0];
    const net = income - expense;
    // Month net flow relative to the balance at the start of the month (0 when there is no base)
    const base = totalBalance - net;
    const netChangePercentage = base > 0 ? Math.round((net / base) * 1000) / 10 : 0;

    return {
      summary: {
        totalBalance: Math.round(totalBalance * 100) / 100,
        monthlyIncome: income,
        monthlyExpense: expense,
        netChangePercentage,
      },
      accounts: accounts.rows,
      recentTransactions: recent.rows,
      savingsGoals: goals.rows.map(withProgress),
      categories: categories.rows,
    };
  });

  res.json({ status: "success", data });
};

const toCents = (v) => Math.round(Number(v) * 100);
const fromCents = (c) => c / 100;
const windowDays = (req) => Number(req.query.days) || 30;

/**
 * GET /api/dashboard/networth?days=30|90|365 — daily total of the user's active (non-archived) manual accounts.
 * Each account contributes its latest account_balances snapshot on or before the day (carried forward), 0 before
 * its first snapshot; today's point uses current_balance so it always matches the dashboard total.
 * Bounded: at most 365 days x accounts index lookups (uq_account_balances_manual_day).
 */
exports.getNetWorth = async (req, res) => {
  const userId = req.user.id;
  const days = windowDays(req);

  const rows = await req.withUser(async (db) => {
    const result = await db.query(
      `WITH accs AS (
         SELECT id, current_balance FROM manual_accounts
          WHERE user_id = $1 AND is_archived = false AND is_active = true
       ),
       days AS (
         SELECT d::date AS day
           FROM generate_series(CURRENT_DATE - ($2::int - 1), CURRENT_DATE, INTERVAL '1 day') d
       )
       SELECT to_char(days.day, 'YYYY-MM-DD') AS date,
              COALESCE(SUM(CASE WHEN days.day = CURRENT_DATE THEN accs.current_balance
                                ELSE COALESCE(snap.balance_amount, 0) END), 0) AS total
         FROM days
         LEFT JOIN accs ON true
         LEFT JOIN LATERAL (
           SELECT b.balance_amount FROM account_balances b
            WHERE b.manual_account_id = accs.id AND b.user_id = $1 AND b.balance_date <= days.day
            ORDER BY b.balance_date DESC LIMIT 1
         ) snap ON true
        GROUP BY days.day
        ORDER BY days.day`,
      [userId, days]
    );
    return result.rows;
  });

  const series = rows.map((r) => ({ date: r.date, total: fromCents(toCents(r.total)) }));
  const startC = toCents(series[0]?.total ?? 0);
  const endC = toCents(series[series.length - 1]?.total ?? 0);
  const changeC = endC - startC;

  res.json({
    status: "success",
    data: {
      days,
      series,
      start: fromCents(startC),
      end: fromCents(endC),
      change: fromCents(changeC),
      // Relative to the first day; null when there is no positive base to compare against
      changePercentage: startC > 0 ? Math.round((changeC * 1000) / startC) / 10 : null,
    },
  });
};

const SPENDING_TOP = 6;

/**
 * GET /api/dashboard/spending?days=30|90|365 — expenses (all of the user's transactions, dated from the start of
 * the window up to now) grouped by category, sorted desc: the top 6 plus an aggregated "Other" bucket when there
 * are more. Uncategorised expenses form their own "Uncategorized" group. Amounts in cents-exact numbers.
 */
exports.getSpending = async (req, res) => {
  const userId = req.user.id;
  const days = windowDays(req);

  const rows = await req.withUser(async (db) => {
    const result = await db.query(
      `SELECT t.category_id, c.category_name, c.icon_emoji, c.color_tag, SUM(t.amount) AS total
         FROM transactions t
         LEFT JOIN transaction_categories c ON c.id = t.category_id
        WHERE t.user_id = $1 AND t.transaction_type = 'expense'
          AND t.transaction_date >= CURRENT_DATE - ($2::int - 1)
          AND t.transaction_date <= NOW()
        GROUP BY t.category_id, c.category_name, c.icon_emoji, c.color_tag
        ORDER BY total DESC, c.category_name`,
      [userId, days]
    );
    return result.rows;
  });

  let groups = rows.map((r) => ({
    key: r.category_id || "uncategorized",
    category_id: r.category_id,
    name: r.category_id ? r.category_name : "Uncategorized",
    emoji: r.category_id ? r.icon_emoji : null,
    color: r.category_id ? r.color_tag : null,
    cents: toCents(r.total),
  }));
  if (groups.length > SPENDING_TOP) {
    const rest = groups.slice(SPENDING_TOP);
    groups = [
      ...groups.slice(0, SPENDING_TOP),
      {
        key: "other",
        category_id: null,
        name: "Other",
        emoji: null,
        color: null,
        cents: rest.reduce((s, g) => s + g.cents, 0),
        count: rest.length,
      },
    ];
  }
  const totalC = groups.reduce((s, g) => s + g.cents, 0);

  res.json({
    status: "success",
    data: {
      days,
      total: fromCents(totalC),
      categories: groups.map(({ cents, ...g }) => ({
        ...g,
        total: fromCents(cents),
        percentage: totalC > 0 ? Math.round((cents * 1000) / totalC) / 10 : 0,
      })),
    },
  });
};
