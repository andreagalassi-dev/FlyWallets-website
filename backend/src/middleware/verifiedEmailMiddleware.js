const { pool } = require("../config/db");
const env = require("../config/env");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Verified e-mail gate. Must run after authenticateToken and is mounted (app.js, `gated` chain) ONLY on the
 * routers whose writes require a verified address: accounts, transactions, goals, categories, budgets,
 * recurring, data. It never inspects the path (Express routing is case-insensitive, so path checks are bypassable).
 *
 * Active only when REQUIRE_VERIFIED_EMAIL=true (read at request time from config/env, so tests can toggle it).
 * Non-safe requests from users whose e-mail is not verified get
 * 403 { status: "error", code: "EMAIL_NOT_VERIFIED", message }.
 */
exports.requireVerifiedEmail = async (req, res, next) => {
  if (!env.requireVerifiedEmail || SAFE_METHODS.has(req.method)) return next();

  const { rows } = await pool.query("SELECT email_verified FROM users WHERE id = $1", [req.user.id]);
  if (rows[0]?.email_verified) return next();

  res.status(403).json({
    status: "error",
    code: "EMAIL_NOT_VERIFIED",
    message: "Please verify your e-mail address before making changes",
  });
};
