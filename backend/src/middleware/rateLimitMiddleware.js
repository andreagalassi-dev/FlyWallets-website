const rateLimit = require("express-rate-limit");
const { ipKeyGenerator } = rateLimit;
const { isTest } = require("../config/env");

// Rate limiting is disabled under `NODE_ENV=test` so integration tests are not throttled.
const skip = () => isTest;

const tooMany = (message) => ({ status: "error", message });

exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5, // 5 FAILED logins per IP per 15 minutes
  skipSuccessfulRequests: true,
  skip,
  message: tooMany("Too many login attempts, please try again after 15 minutes"),
  standardHeaders: true,
  legacyHeaders: false,
});

exports.registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  skip,
  message: tooMany("Too many accounts created from this IP, please try again later"),
  standardHeaders: true,
  legacyHeaders: false,
});

// OTP / reset e-mail requests: 3 every 10 minutes per target (authenticated user, else the NORMALIZED e-mail,
// so aliases like v.ictim+1@gmail.com share one bucket). The IP is deliberately not part of the key: rotating
// IPs must not reset the budget. Mount validators that normalize the e-mail BEFORE this limiter.
exports.otpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 3,
  skip,
  keyGenerator: (req) => `otp:${req.user?.id || String(req.body?.email || "").toLowerCase()}`,
  message: tooMany("Too many code requests, please wait 10 minutes before trying again"),
  standardHeaders: true,
  legacyHeaders: false,
});

// Per-IP cap on the code / token endpoints (verify, forgot, reset): 20 requests every 10 minutes
exports.authCodeIpLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  skip,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: tooMany("Too many attempts from this address, please try again later"),
  standardHeaders: true,
  legacyHeaders: false,
});

// Authenticated API traffic: 120 requests / minute per user. Mount AFTER authenticateToken.
exports.apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  skip,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: tooMany("Too many requests, slow down"),
  standardHeaders: true,
  legacyHeaders: false,
});

// ---------------------------------------------------------------------------
// CSV import / export (routes/importExportRoutes.js). Mounted AFTER authenticateToken and the global apiLimiter.
// Limits are read from the environment at request time:
//   IMPORT_RATE_LIMIT_PER_MIN        (default 5)  POST /api/data/import/transactions per user per minute
//   EXPORT_RATE_LIMIT_PER_MIN        (default 10) GET /api/data/export/transactions.csv per user per minute
//   EXPORT_MAX_CONCURRENT_PER_USER   (default 2)  exports streaming at the same time per user
// Like the limiters above, the two per-minute limiters are skipped under NODE_ENV=test, unless their variable is
// set explicitly (so a test can exercise them). The concurrency cap is always active.
// ---------------------------------------------------------------------------
const envInt = (name, fallback) => {
  const v = Number.parseInt(process.env[name], 10);
  return Number.isFinite(v) && v > 0 ? v : fallback;
};
const perUser = (prefix) => (req) => `${prefix}:${req.user?.id || ipKeyGenerator(req.ip)}`;

const perMinuteLimiter = (envName, fallback, prefix, message) =>
  rateLimit({
    windowMs: 60 * 1000,
    limit: () => envInt(envName, fallback),
    skip: () => isTest && !process.env[envName],
    keyGenerator: perUser(prefix),
    message: tooMany(message),
    standardHeaders: true,
    legacyHeaders: false,
  });

exports.importLimiter = perMinuteLimiter("IMPORT_RATE_LIMIT_PER_MIN", 5, "import", "Too many CSV imports, please retry in a minute");
exports.exportLimiter = perMinuteLimiter("EXPORT_RATE_LIMIT_PER_MIN", 10, "export", "Too many CSV exports, please retry in a minute");

// In-process count of running exports per user (released when the response closes: finished, aborted or destroyed)
const runningExports = new Map();
exports.exportConcurrencyLimiter = (req, res, next) => {
  const key = req.user?.id || ipKeyGenerator(req.ip);
  const running = runningExports.get(key) || 0;
  if (running >= envInt("EXPORT_MAX_CONCURRENT_PER_USER", 2)) {
    return res.status(429).json(tooMany("Another export is still running, please wait for it to finish"));
  }
  runningExports.set(key, running + 1);
  res.once("close", () => {
    const left = (runningExports.get(key) || 1) - 1;
    if (left > 0) runningExports.set(key, left);
    else runningExports.delete(key);
  });
  next();
};

// AI endpoints call a paid third-party API: stricter, per user
exports.aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  skip,
  keyGenerator: (req) => req.user?.id || ipKeyGenerator(req.ip),
  message: tooMany("Too many AI requests, please retry in a minute"),
  standardHeaders: true,
  legacyHeaders: false,
});
