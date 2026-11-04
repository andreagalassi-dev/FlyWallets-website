const { HttpError } = require("../utils/httpError");
const { snapshotBalance, balanceFloorCents } = require("../services/ledgerService");

/**
 * GET /api/accounts — manual + bank accounts in one list.
 * Bank accounts have no balance column: the latest account_balances snapshot is used.
 */
exports.listAccounts = async (req, res) => {
  const userId = req.user.id;
  const accounts = await req.withUser(async (db) => {
    const manual = await db.query(
      `SELECT id, 'manual' AS source, account_name, account_type, account_currency AS currency,
              current_balance, initial_balance, color_tag, icon_emoji, description,
              COALESCE(overdraft_allowed, false) AS overdraft_allowed, overdraft_limit, created_at
         FROM manual_accounts
        WHERE user_id = $1 AND is_archived = false AND is_active = true
        ORDER BY created_at`,
      [userId]
    );
    const bank = await db.query(
      `SELECT b.id, 'bank' AS source, COALESCE(b.account_name, b.bank_name) AS account_name,
              COALESCE(b.account_type, 'checking') AS account_type, b.account_currency AS currency,
              COALESCE(lb.balance_amount, 0) AS current_balance, b.bank_name, b.account_iban,
              false AS overdraft_allowed, NULL::numeric AS overdraft_limit, b.created_at
         FROM bank_accounts b
         LEFT JOIN LATERAL (
           SELECT balance_amount FROM account_balances
            WHERE bank_account_id = b.id ORDER BY balance_date DESC LIMIT 1
         ) lb ON true
        WHERE b.user_id = $1 AND b.is_active = true
        ORDER BY b.created_at`,
      [userId]
    );
    return [...manual.rows, ...bank.rows];
  });

  res.json({ status: "success", data: { accounts } });
};

/** POST /api/accounts/manual */
exports.createManualAccount = async (req, res) => {
  const userId = req.user.id;
  const {
    account_name,
    account_type,
    initial_balance = 0,
    color_tag = null,
    icon_emoji = null,
    description = null,
    overdraft_allowed = false,
    overdraft_limit = null,
  } = req.body;

  const account = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO manual_accounts
         (user_id, account_name, account_type, initial_balance, current_balance, color_tag, icon_emoji, description,
          overdraft_allowed, overdraft_limit)
       VALUES ($1, $2, $3, $4, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [userId, account_name, account_type, initial_balance, color_tag, icon_emoji, description,
       overdraft_allowed, overdraft_limit]
    );
    assertWithinOverdraft(rows[0]);
    await snapshotBalance(db, userId, rows[0].id);
    return rows[0];
  });

  res.status(201).json({ status: "success", data: { account } });
};

/** 422 when the account's balance is below what its overdraft settings allow (rolls back the caller). */
const assertWithinOverdraft = (account) => {
  if (Math.round(Number(account.current_balance) * 100) < balanceFloorCents(account)) {
    throw new HttpError(
      422,
      account.overdraft_allowed
        ? `The balance (${Number(account.current_balance).toFixed(2)}) exceeds the overdraft limit`
        : `The balance (${Number(account.current_balance).toFixed(2)}) is negative: enable overdraft_allowed to allow it`,
      "OVERDRAFT_LIMIT_CONFLICT"
    );
  }
};

/**
 * PUT /api/accounts/manual/:id — name, color, icon, description and overdraft settings
 * (balance changes via transactions). overdraft_limit: null = unlimited; omitted = unchanged.
 */
exports.updateManualAccount = async (req, res) => {
  const { account_name, color_tag, icon_emoji, description, overdraft_allowed } = req.body;
  const limitGiven = req.body.overdraft_limit !== undefined;

  const account = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `UPDATE manual_accounts SET
         account_name      = COALESCE($1, account_name),
         color_tag         = COALESCE($2, color_tag),
         icon_emoji        = COALESCE($3, icon_emoji),
         description       = COALESCE($4, description),
         overdraft_allowed = COALESCE($5, overdraft_allowed),
         overdraft_limit   = CASE WHEN $6::boolean THEN $7::numeric ELSE overdraft_limit END
       WHERE id = $8 AND user_id = $9
       RETURNING *`,
      [account_name, color_tag, icon_emoji, description, overdraft_allowed, limitGiven,
       limitGiven ? req.body.overdraft_limit : null, req.params.id, req.user.id]
    );
    if (!rows[0]) throw new HttpError(404, "Account not found");
    // tightening the overdraft rules below the current balance is refused (cosmetic edits are always allowed)
    if (overdraft_allowed !== undefined || limitGiven) assertWithinOverdraft(rows[0]);
    return rows[0];
  });

  res.json({ status: "success", data: { account } });
};

/**
 * DELETE /api/accounts/manual/:id
 * An account with transactions is archived (history stays intact); an empty one is deleted.
 */
exports.deleteManualAccount = async (req, res) => {
  const userId = req.user.id;
  const result = await req.withUser(async (db) => {
    const owned = await db.query(
      "SELECT id FROM manual_accounts WHERE id = $1 AND user_id = $2 FOR UPDATE",
      [req.params.id, userId]
    );
    if (!owned.rows[0]) throw new HttpError(404, "Account not found");

    const used = await db.query(
      "SELECT 1 FROM transactions WHERE manual_account_id = $1 LIMIT 1",
      [req.params.id]
    );
    if (used.rows[0]) {
      await db.query(
        "UPDATE manual_accounts SET is_archived = true, is_active = false WHERE id = $1",
        [req.params.id]
      );
      return { archived: true };
    }
    await db.query("DELETE FROM manual_accounts WHERE id = $1", [req.params.id]);
    return { archived: false };
  });

  res.json({ status: "success", data: result });
};

/** GET /api/accounts/:id/history?from_date&to_date — daily balances for charts. */
exports.accountHistory = async (req, res) => {
  const { from_date, to_date } = req.query;
  const history = await req.withUser(async (db) => {
    const { rows } = await db.query(
      `SELECT to_char(balance_date, 'YYYY-MM-DD') AS date, balance_amount AS balance
         FROM account_balances
        WHERE user_id = $1 AND (manual_account_id = $2 OR bank_account_id = $2)
          AND ($3::date IS NULL OR balance_date >= $3::date)
          AND ($4::date IS NULL OR balance_date <= $4::date)
          AND balance_date <= CURRENT_DATE -- a "tomorrow" transaction pre-writes tomorrow's row; hide it until then
        ORDER BY balance_date`,
      [req.user.id, req.params.id, from_date || null, to_date || null]
    );
    return rows;
  });

  res.json({ status: "success", data: { history } });
};
