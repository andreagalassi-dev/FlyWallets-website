const { Pool, types } = require("pg");
require("dotenv").config();

// NUMERIC(18,2) -> JS number (pg returns strings by default). Safe for 2-decimal money below 2^53 cents.
types.setTypeParser(1700, (value) => parseFloat(value));

// The schema uses TIMESTAMP (no time zone). Keep everything in UTC end to end: the session time zone
// is forced to UTC (see buildPool) and such values are read back as UTC instants, not as "local time of
// whichever machine runs Node". DATE columns stay plain 'YYYY-MM-DD' strings (no midnight shifting).
types.setTypeParser(1114, (value) => new Date(`${value.replace(" ", "T")}Z`));
types.setTypeParser(1082, (value) => value);

/**
 * Pool / session limits, so that no request can hold a pooled connection (and an open transaction) forever.
 * All overridable from the environment (milliseconds; 0 disables the PostgreSQL timeouts):
 *   DB_POOL_MAX                               (default 10)     connections per pool
 *   DB_CONNECTION_TIMEOUT_MS                  (default 5000)   wait for a free pool connection, then fail (500)
 *                                                              instead of queueing forever
 *   DB_IDLE_TIMEOUT_MS                        (default 30000)  close pooled connections idle for this long
 *   DB_STATEMENT_TIMEOUT_MS                   (default 15000)  PostgreSQL statement_timeout (per statement)
 *   DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS (default 30000)  PostgreSQL idle_in_transaction_session_timeout:
 *                                                              the server kills a session left idle inside an
 *                                                              open transaction (releases its locks / snapshot)
 * The PostgreSQL settings are sent in the startup packet (`options`), so every pooled session has them.
 */
const envMs = (name, fallback) => {
  const v = Number.parseInt(process.env[name], 10);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
};
const poolSettings = () => ({
  max: envMs("DB_POOL_MAX", 10) || 10,
  connectionTimeoutMillis: envMs("DB_CONNECTION_TIMEOUT_MS", 5000),
  idleTimeoutMillis: envMs("DB_IDLE_TIMEOUT_MS", 30000),
  statementTimeout: envMs("DB_STATEMENT_TIMEOUT_MS", 15000),
  idleInTransactionTimeout: envMs("DB_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS", 30000),
});

const buildPool = (connectionString) => {
  // SSL disabled for localhost or when explicitly disabled
  const isLocalhost =
    !connectionString ||
    connectionString.includes("localhost") ||
    connectionString.includes("127.0.0.1");
  const s = poolSettings();

  const p = new Pool({
    connectionString,
    ssl: process.env.DB_SSL === "false" || isLocalhost ? false : { rejectUnauthorized: false },
    max: s.max,
    connectionTimeoutMillis: s.connectionTimeoutMillis,
    idleTimeoutMillis: s.idleTimeoutMillis,
    options: [
      "-c timezone=UTC",
      `-c statement_timeout=${s.statementTimeout}`,
      `-c idle_in_transaction_session_timeout=${s.idleInTransactionTimeout}`,
    ].join(" "),
  });
  // An idle pooled connection that dies (server restart, idle-session kill) must not crash the process
  p.on("error", (err) => console.error("PostgreSQL pool: idle client error:", err.message));
  return p;
};

// Owner/superuser pool: auth flows, seed, migrations.
const pool = buildPool(process.env.DATABASE_URL);

// Restricted pool (role `flywallets_app`, see database/rls_app_role.sql). Row-Level Security is only
// enforced for this role. Falls back to the main pool when DATABASE_APP_URL is not configured.
const appPool = process.env.DATABASE_APP_URL ? buildPool(process.env.DATABASE_APP_URL) : pool;

/**
 * Runs `fn(client)` in a single transaction with `app.current_user_id` set, which activates the RLS
 * policies defined in database/schema.sql (function current_user_id()).
 * set_config(..., true) is the parameterizable equivalent of SET LOCAL.
 */
const withUserContext = async (userId, fn) => {
  const client = await appPool.connect();
  // Per-transaction scratch space: services may queue work to run once, right before COMMIT
  // (e.g. ledgerService coalesces balance-snapshot rebuilds of bulk imports into one per account).
  const txContext = { beforeCommit: [] };
  client.txContext = txContext;
  // While checked out the pool does not listen for connection errors: a session killed by the server
  // (e.g. idle_in_transaction_session_timeout) would otherwise surface as an unhandled 'error' event.
  let broken = null;
  const onError = (err) => {
    broken = err;
  };
  client.on("error", onError);
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.current_user_id', $1, true)", [String(userId)]);
    const result = await fn(client);
    for (const hook of txContext.beforeCommit) await hook();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch((rollbackErr) => {
      broken = broken || rollbackErr;
    });
    throw err;
  } finally {
    delete client.txContext;
    client.off("error", onError);
    client.release(broken || undefined); // a broken connection is discarded, never handed to the next request
  }
};

const connectDB = async () => {
  try {
    const client = await pool.connect();
    console.log("✅ PostgreSQL Connected Successfully!");
    if (appPool === pool && process.env.NODE_ENV === "production") {
      console.warn(
        "⚠️  DATABASE_APP_URL is not set: Row-Level Security is NOT enforced (the main role bypasses it). See database/rls_app_role.sql."
      );
    }
    client.release();
    if (appPool !== pool) {
      (await appPool.connect()).release();
      console.log("🔒 RLS application role connected (DATABASE_APP_URL)");
    }
  } catch (err) {
    console.error("❌ Database Connection Failed:", err.message);
    console.warn(
      "👉 Tip: verify DATABASE_URL in backend/.env or run `docker compose up -d` to start a local database."
    );
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    }
  }
};

module.exports = { pool, appPool, withUserContext, connectDB };
