// Test environment bootstrap. MUST be required before anything from src/.
process.env.NODE_ENV = "test";

const local = (url) => url && /@(localhost|127\.0\.0\.1)[:/]/.test(url);
const url =
  process.env.TEST_DATABASE_URL ||
  (local(process.env.DATABASE_URL) ? process.env.DATABASE_URL : null) ||
  "postgresql://postgres:postgres@localhost:5432/flywallets";

// Safety net: integration tests create and delete users, never run them against a remote database.
if (!local(url)) {
  throw new Error("Refusing to run tests against a non-local database. Set TEST_DATABASE_URL.");
}
process.env.DATABASE_URL = url;
process.env.DB_SSL = "false";
if (process.env.TEST_DATABASE_APP_URL) process.env.DATABASE_APP_URL = process.env.TEST_DATABASE_APP_URL;

const request = require("supertest");
const app = require("../src/app");
const { pool, appPool } = require("../src/config/db");

let dbReady;
const dbAvailable = async () => {
  if (dbReady === undefined) {
    try {
      await pool.query("SELECT 1 FROM users LIMIT 1");
      dbReady = true;
    } catch {
      dbReady = false;
    }
  }
  return dbReady;
};

// Skip DB-backed suites when no database is reachable locally; in CI a missing DB must fail loudly.
const dbSuite = async (t) => {
  if (!(await dbAvailable())) {
    if (process.env.CI) throw new Error("Database not reachable in CI");
    t.skip("PostgreSQL not reachable (run `docker compose up -d`)");
    return false;
  }
  return true;
};

const PASSWORD = "Test1234!";
const uniqueEmail = (tag = "u") =>
  `test.${tag}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}@flywallets.test`;

/** Registers an individual and returns a supertest agent holding the auth cookies. */
const registerUser = async (tag = "u", overrides = {}) => {
  const agent = request.agent(app);
  const email = uniqueEmail(tag);
  const rnd = Math.random().toString(36).slice(2, 10).toUpperCase();
  const res = await agent.post("/api/auth/register").send({
    email,
    password: PASSWORD,
    user_type: "individual",
    first_name: "Test",
    last_name: "User",
    fiscal_code: `FC${rnd}${Date.now()}`.slice(0, 16),
    date_of_birth: "1990-01-01",
    place_of_birth: "Milano",
    address_street: "Via Roma 1",
    address_city: "Milano",
    address_postal_code: "20100",
    address_province: "MI",
    ...overrides,
  });
  return { agent, email, res, userId: res.body?.data?.user?.id };
};

const deleteUser = (email) => pool.query("DELETE FROM users WHERE email = $1", [email.toLowerCase()]);
const cleanupTestUsers = () => pool.query("DELETE FROM users WHERE email LIKE 'test.%@flywallets.test'");
const closeDb = async () => {
  await pool.end();
  if (appPool !== pool) await appPool.end();
};

module.exports = { app, request, pool, appPool, dbSuite, registerUser, deleteUser, cleanupTestUsers, closeDb, PASSWORD, uniqueEmail };
