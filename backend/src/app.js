const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const cookieParser = require("cookie-parser");

const { clientUrls, trustProxy, isTest } = require("./config/env");
const { authenticateToken } = require("./middleware/authMiddleware");
const { rlsContext } = require("./middleware/rlsMiddleware");
const { apiLimiter } = require("./middleware/rateLimitMiddleware");
const { requireVerifiedEmail } = require("./middleware/verifiedEmailMiddleware");
const { HttpError } = require("./utils/httpError");

const app = express();

if (trustProxy) app.set("trust proxy", trustProxy);

// Middleware
app.use(helmet());
app.use(
  cors({
    credentials: true,
    exposedHeaders: ["Content-Disposition", "X-Export-Rows", "X-Export-Truncated"],
    origin: (origin, callback) => {
      // Requests without Origin (curl, server-to-server, same-origin) are allowed
      if (!origin || clientUrls.includes(origin)) return callback(null, true);
      callback(new Error(`Origin ${origin} not allowed by CORS`));
    },
  })
);
// JSON bodies: 100 KB everywhere, except POST /api/data/import/transactions (a whole CSV file in the body), whose
// 2 MB parser is mounted on that route only, AFTER authentication and the per-user limiters
// (routes/importExportRoutes.js): unauthenticated or throttled callers are refused before the body is read.
// The skip test mirrors Express route matching (case-insensitive, optional trailing slash).
const defaultJson = express.json({ limit: "100kb" });
const isCsvImport = (req) => req.method === "POST" && /^\/api\/data\/import\/transactions\/?$/i.test(req.path);
app.use((req, res, next) => (isCsvImport(req) ? next() : defaultJson(req, res, next)));
app.use(cookieParser());
if (!isTest) app.use(morgan("dev"));
// Express 5 leaves req.body undefined when no parser matched (e.g. text/plain): handlers always get an object
app.use((req, res, next) => {
  if (req.body === undefined || req.body === null) req.body = {};
  next();
});

// Public routes
app.use("/api/auth", require("./routes/authRoutes"));

app.get("/api/health", (req, res) => {
  res
    .status(200)
    .json({ status: "OK", message: "FlyWallets Backend is Running 🚀" });
});

app.get("/", (req, res) => {
  res.send("FlyWallets API v1.0");
});

// Protected routes: authenticated -> per-user rate limit -> RLS user context
const secured = [authenticateToken, apiLimiter, rlsContext];
// Data routes additionally pass the verified e-mail gate (writes only, and only when REQUIRE_VERIFIED_EMAIL=true).
// The gate is decided by WHICH router it is mounted on, never by parsing the (case-insensitive) path.
const gated = [...secured, requireVerifiedEmail];
app.use("/api/accounts", gated, require("./routes/accountRoutes"));
app.use("/api/categories", gated, require("./routes/categoryRoutes"));
app.use("/api/transactions", gated, require("./routes/transactionRoutes"));
app.use("/api/goals", gated, require("./routes/goalRoutes"));
app.use("/api/dashboard", secured, require("./routes/dashboardRoutes"));
app.use("/api/ai", secured, require("./routes/aiRoutes"));
app.use("/api/budgets", gated, require("./routes/budgetRoutes"));
app.use("/api/recurring", gated, require("./routes/recurringRoutes"));
app.use("/api/data", gated, require("./routes/importExportRoutes")); // CSV export / import

// 404
app.use((req, res) => {
  res.status(404).json({ status: "error", message: "Not Found" });
});

// Error Handling (never leak internals to the client)
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.status && err.status < 500) {
    const code = err instanceof HttpError && err.code ? { code: err.code } : {};
    return res.status(err.status).json({ status: "error", ...code, message: err.message });
  }
  if (err.message?.startsWith("Origin ")) {
    return res.status(403).json({ status: "error", message: "Origin not allowed" });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ status: "error", message: "Invalid JSON body" });
  }
  // Bad input that slipped past the validators and was refused by PostgreSQL (invalid text representation,
  // invalid datetime, NUL byte, numeric overflow, CHECK violation): a client error, never details
  if (["22P02", "22007", "22008", "22021", "22003", "23514"].includes(err.code)) {
    return res.status(400).json({ status: "error", message: "Invalid input" });
  }
  if (!isTest) console.error(err.stack);
  res.status(500).json({ status: "error", message: "Internal Server Error" });
});

module.exports = app;
