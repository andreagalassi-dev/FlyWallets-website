const express = require("express");
const { body, query } = require("express-validator");
const router = express.Router();
const c = require("../controllers/importExportController");
const { handleValidation } = require("../middleware/validationMiddleware");
const { MAX_CSV_BYTES } = require("../services/importService");
const { importLimiter, exportLimiter, exportConcurrencyLimiter } = require("../middleware/rateLimitMiddleware");

const MAPPING_FIELDS = ["date", "amount", "description", "type", "category", "notes", "tags", "debit", "credit"];

const validateExport = [
  query("account_id").optional().isUUID(),
  query("category_id").optional().isUUID(),
  query("type").optional().isIn(["income", "expense"]),
  query("from_date").optional().isISO8601({ strict: true }),
  query("to_date").optional().isISO8601({ strict: true }),
  query("search").optional().isString().isLength({ max: 100 }),
  query("delimiter").optional().isIn([",", ";"]).withMessage("delimiter must be ',' or ';'"),
  handleValidation,
];

const validateImport = [
  body("manual_account_id").isUUID().withMessage("manual_account_id is required"),
  body("csv")
    .isString().withMessage("csv must be a string")
    .bail()
    .custom((v) => v.trim().length > 0).withMessage("csv is empty")
    .bail()
    .custom((v) => Buffer.byteLength(v, "utf8") <= MAX_CSV_BYTES).withMessage("csv is larger than 1 MB"),
  body("delimiter").optional().isIn([",", ";", "\t", "|", "auto"]),
  body("date_format").optional().isIn(["iso", "dmy", "mdy", "auto"]),
  body("decimal_separator").optional().isIn([".", ",", "auto"]),
  body("dry_run").optional().isBoolean({ strict: true }).withMessage("dry_run must be a boolean"),
  body("mapping")
    .optional({ values: "null" })
    .custom((m) => {
      if (typeof m !== "object" || Array.isArray(m)) throw new Error("mapping must be an object");
      for (const [k, v] of Object.entries(m)) {
        if (!MAPPING_FIELDS.includes(k)) throw new Error(`unknown mapping field "${k}"`);
        if (v !== null && typeof v !== "string" && !Number.isInteger(v)) {
          throw new Error(`mapping.${k} must be a column name or index`);
        }
      }
      return true;
    }),
  handleValidation,
];

// Mounted in app.js behind authenticateToken + the global per-user apiLimiter, so the route-specific
// limiters below always see req.user. Order matters:
// - export: per-minute limit -> validation -> per-user concurrency slot (a 400 never takes a slot)
// - import: per-minute limit -> 2 MB JSON parser (the ONLY place a body above the global 100 KB is accepted;
//   app.js skips its global parser for exactly this route, so unauthenticated / throttled callers are
//   refused before their body is read) -> validation
router.get("/export/transactions.csv", exportLimiter, validateExport, exportConcurrencyLimiter, c.exportTransactions);
router.post("/import/transactions", importLimiter, express.json({ limit: "2mb" }), validateImport, c.importTransactions);

module.exports = router;
