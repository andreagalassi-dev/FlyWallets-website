const ev = require("express-validator");
const { validationResult } = ev;

/**
 * Every field validated in this file is a SCALAR unless declared with listBody(): arrays / objects (e.g.
 * `amount: ["5"]`, `?page=1&page=2`, `account_id[]=x`) and strings containing NUL bytes are refused with a 400
 * before they can reach PostgreSQL. `body`, `query` and `param` below are the express-validator factories
 * wrapped with this check, so every chain gets it automatically.
 */
const scalarValue = (value) => {
  if (value === undefined || value === null) return true;
  if (typeof value === "object") throw new Error("must be a single value, not a list or an object");
  if (typeof value === "string" && value.includes("\u0000")) throw new Error("must not contain NUL characters");
  return true;
};
/** Adds the scalar / NUL check to any express-validator chain (exported for routers with their own chains). */
const scalar = (chain) => chain.custom(scalarValue).bail();
const body = (field) => scalar(ev.body(field));
const query = (field) => scalar(ev.query(field));
const param = (field) => scalar(ev.param(field));
// Fields that legitimately hold arrays / objects (tags, the whole body): validate their shape explicitly
const listBody = (field) => ev.body(field);
exports.scalar = scalar;
exports.scalarValue = scalarValue;
const { isTooFarInFuture, isTooFarInPast, MAX_PAST_YEARS } = require("../services/ledgerService");

const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "error", errors: errors.array() });
  }
  next();
};
exports.handleValidation = handleValidation;

const passwordRules = (field = "password") =>
  body(field)
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters long")
    .matches(/[A-Z]/)
    .withMessage("Password must contain at least one uppercase letter")
    .matches(/[0-9]/)
    .withMessage("Password must contain at least one number")
    .matches(/[@$!%*?&]/)
    .withMessage("Password must contain at least one special character");

exports.validateRegistration = [
  body("email").isEmail().withMessage("Invalid email address").normalizeEmail(),
  passwordRules(),
  body("user_type")
    .isIn(["individual", "business"])
    .withMessage("Invalid user type"),

  // Individual validation
  ...["first_name", "last_name", "fiscal_code", "place_of_birth", "address_street", "address_city", "address_postal_code", "address_province"].map(
    (field) =>
      body(field)
        .if(body("user_type").equals("individual"))
        .isString()
        .trim()
        .notEmpty()
        .withMessage(`${field.replace(/_/g, " ")} is required`)
  ),
  body("date_of_birth")
    .if(body("user_type").equals("individual"))
    .isISO8601({ strict: true })
    .withMessage("date_of_birth must be a valid date"),

  // Business validation
  body("company_name")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("Company name is required"),
  body("vat_number")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("VAT number is required"),
  body("owner_first_name")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("Owner first name is required"),
  body("owner_last_name")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("Owner last name is required"),
  body("owner_fiscal_code")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("Owner fiscal code is required"),
  body("phone_number")
    .if(body("user_type").equals("business"))
    .notEmpty()
    .withMessage("Phone number is required for business accounts"),

  handleValidation,
];

exports.validateLogin = [
  body("email").isEmail().withMessage("Invalid email address").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidation,
];

// --- Auth: OTP / password reset ---

exports.validateOtp = [
  body("code").matches(/^\d{6}$/).withMessage("Code must be 6 digits"),
  handleValidation,
];

exports.validateForgotPassword = [
  body("email").isEmail().withMessage("Invalid email address").normalizeEmail(),
  handleValidation,
];

exports.validateResetPassword = [
  body("token").isHexadecimal().isLength({ min: 64, max: 64 }).withMessage("Invalid reset token"),
  passwordRules("password"),
  handleValidation,
];

// --- Shared building blocks for the data modules ---

const uuidParam = (name = "id") => param(name).isUUID().withMessage(`${name} must be a valid UUID`);
const money = (field, { optional = false } = {}) =>
  (optional ? body(field).optional() : body(field))
    .isFloat({ gt: 0, max: 999999999999 })
    .withMessage(`${field} must be a positive number`)
    .custom((v) => /^\d+(\.\d{1,2})?$/.test(String(v)))
    .withMessage(`${field} can have at most 2 decimals`)
    .toFloat();
const optionalText = (field, max = 255) =>
  body(field).optional({ values: "null" }).isString().trim().isLength({ max }).withMessage(`${field} is too long`);
const optionalColor = body("color_tag").optional({ values: "null" }).isString().trim().isLength({ max: 30 });
const optionalEmoji = body("icon_emoji").optional({ values: "null" }).isString().isLength({ max: 16 });

const ACCOUNT_TYPES = ["checking", "savings", "wallet", "cash"];

// overdraft_allowed: boolean; overdraft_limit: >= 0 (null = unlimited when overdraft is allowed)
const overdraftRules = [
  body("overdraft_allowed").optional().isBoolean().withMessage("overdraft_allowed must be a boolean").toBoolean(),
  body("overdraft_limit")
    .optional({ values: "null" })
    .isFloat({ min: 0, max: 999999999999 })
    .withMessage("overdraft_limit must be a non-negative number")
    .custom((v) => /^\d+(\.\d{1,2})?$/.test(String(v)))
    .withMessage("overdraft_limit can have at most 2 decimals")
    .toFloat(),
];

// Transactions may be dated at most 1 day ahead and 10 years back (same rules as ledgerService.recordTransaction)
const transactionDate = (optional = false) =>
  (optional ? body("transaction_date").optional() : body("transaction_date"))
    .isISO8601({ strict: true })
    .withMessage("transaction_date must be an ISO date")
    .bail()
    .custom((v) => !isTooFarInFuture(v))
    .withMessage("transaction_date cannot be more than 1 day in the future")
    .bail()
    .custom((v) => !isTooFarInPast(v))
    .withMessage(`transaction_date cannot be more than ${MAX_PAST_YEARS} years in the past`);

exports.validateIdParam = [uuidParam(), handleValidation];

exports.validateCreateManualAccount = [
  body("account_name").isString().trim().isLength({ min: 1, max: 100 }).withMessage("account_name is required"),
  body("account_type").isIn(ACCOUNT_TYPES).withMessage(`account_type must be one of ${ACCOUNT_TYPES.join(", ")}`),
  body("initial_balance").optional().isFloat({ min: -999999999999, max: 999999999999 }).toFloat(),
  optionalColor,
  optionalEmoji,
  optionalText("description", 500),
  ...overdraftRules,
  handleValidation,
];

exports.validateUpdateManualAccount = [
  uuidParam(),
  body("account_name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  optionalColor,
  optionalEmoji,
  optionalText("description", 500),
  ...overdraftRules,
  handleValidation,
];

exports.validateAccountHistory = [
  uuidParam(),
  query("from_date").optional().isISO8601({ strict: true }),
  query("to_date").optional().isISO8601({ strict: true }),
  handleValidation,
];

exports.validateCreateCategory = [
  body("category_name").isString().trim().isLength({ min: 1, max: 60 }).withMessage("category_name is required"),
  body("category_type").isIn(["income", "expense", "both"]),
  optionalColor,
  optionalEmoji,
  handleValidation,
];

exports.validateListTransactions = [
  query("account_id").optional().isUUID(),
  query("category_id").optional().isUUID(),
  query("type").optional().isIn(["income", "expense"]),
  query("from_date").optional().isISO8601({ strict: true }),
  query("to_date").optional().isISO8601({ strict: true }),
  query("search").optional().isString().isLength({ max: 100 }),
  query("page").optional().isInt({ min: 1, max: 10000 }).toInt(),
  query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  handleValidation,
];

exports.validateCreateTransaction = [
  body("manual_account_id").isUUID().withMessage("manual_account_id is required"),
  transactionDate(),
  money("amount"),
  body("transaction_type").isIn(["income", "expense"]),
  body("description").isString().trim().isLength({ min: 1, max: 255 }).withMessage("description is required"),
  body("category_id").optional({ values: "null" }).isUUID(),
  body("savings_goal_id").optional({ values: "null" }).isUUID(),
  optionalText("notes", 1000),
  listBody("tags").optional().isArray({ max: 10 }),
  body("tags.*").optional().isString().trim().isLength({ min: 1, max: 30 }),
  handleValidation,
];

// PUT /transactions/:id — same rules as POST, every field optional but at least one required
const TX_EDITABLE = ["manual_account_id", "transaction_date", "amount", "transaction_type", "description",
  "category_id", "notes", "tags"];
exports.validateUpdateTransaction = [
  uuidParam(),
  listBody()
    .custom((b) => b !== null && typeof b === "object" && TX_EDITABLE.some((f) => b[f] !== undefined))
    .withMessage(`Provide at least one of: ${TX_EDITABLE.join(", ")}`),
  body("manual_account_id").optional().isUUID().withMessage("manual_account_id must be a valid UUID"),
  transactionDate(true),
  money("amount", { optional: true }),
  body("transaction_type").optional().isIn(["income", "expense"]),
  body("description").optional().isString().trim().isLength({ min: 1, max: 255 }).withMessage("description cannot be empty"),
  body("category_id").optional({ values: "null" }).isUUID(),
  optionalText("notes", 1000),
  listBody("tags").optional().isArray({ max: 10 }),
  body("tags.*").optional().isString().trim().isLength({ min: 1, max: 30 }),
  handleValidation,
];

exports.validateCreateGoal = [
  body("goal_name").isString().trim().isLength({ min: 1, max: 100 }).withMessage("goal_name is required"),
  money("target_amount"),
  body("target_date").optional({ values: "null" }).isISO8601({ strict: true }),
  optionalText("description", 500),
  optionalColor,
  optionalEmoji,
  handleValidation,
];

exports.validateUpdateGoal = [
  uuidParam(),
  body("goal_name").optional().isString().trim().isLength({ min: 1, max: 100 }),
  body("target_amount").optional().isFloat({ gt: 0, max: 999999999999 }).toFloat(),
  body("target_date").optional({ values: "null" }).isISO8601({ strict: true }),
  body("is_completed").optional().isBoolean().toBoolean(),
  optionalText("description", 500),
  optionalColor,
  optionalEmoji,
  handleValidation,
];

exports.validateContribute = [
  uuidParam(),
  money("amount"),
  body("manual_account_id").optional({ values: "null" }).isUUID(),
  handleValidation,
];

exports.validateCategorize = [
  body("description").isString().trim().isLength({ min: 2, max: 255 }),
  body("amount").optional().isFloat({ min: 0 }).toFloat(),
  body("transaction_type").optional().isIn(["income", "expense"]),
  handleValidation,
];

// PUT /auth/profile: every field optional, identity fields (fiscal code, VAT) are not editable here
const profileText = ["first_name", "last_name", "place_of_birth", "nationality", "address_street", "address_city",
  "address_postal_code", "address_province", "address_country", "company_name", "owner_first_name",
  "owner_last_name", "owner_fiscal_code", "phone_number"];
exports.validateProfile = [
  ...profileText.map((f) => body(f).optional({ values: "null" }).isString().trim().isLength({ min: 1, max: 255 })),
  body("date_of_birth").optional({ values: "null" }).isISO8601({ strict: true }),
  handleValidation,
];

// --- Budgets ---

const alertThreshold = body("alert_threshold")
  .optional()
  .isInt({ min: 1, max: 100 })
  .withMessage("alert_threshold must be an integer between 1 and 100")
  .toInt();

exports.validateCreateBudget = [
  body("category_id").isUUID().withMessage("category_id is required"),
  money("monthly_limit"),
  alertThreshold,
  handleValidation,
];

exports.validateUpdateBudget = [
  uuidParam(),
  money("monthly_limit").optional(),
  alertThreshold,
  body("is_active").optional().isBoolean().withMessage("is_active must be a boolean").toBoolean(),
  handleValidation,
];

// --- Recurring transactions (calendar dates only: YYYY-MM-DD) ---

const FREQUENCIES = ["daily", "weekly", "monthly", "yearly"];
const calendarDate = (field) =>
  body(field)
    .matches(/^\d{4}-\d{2}-\d{2}$/)
    .withMessage(`${field} must be a date (YYYY-MM-DD)`)
    .bail()
    .isISO8601({ strict: true })
    .withMessage(`${field} must be a valid date`);

exports.validateCreateRecurring = [
  body("manual_account_id").isUUID().withMessage("manual_account_id is required"),
  body("category_id").optional({ values: "null" }).isUUID(),
  money("amount"),
  body("transaction_type").isIn(["income", "expense"]).withMessage("transaction_type must be income or expense"),
  body("description").isString().trim().isLength({ min: 1, max: 255 }).withMessage("description is required"),
  body("frequency").isIn(FREQUENCIES).withMessage(`frequency must be one of ${FREQUENCIES.join(", ")}`),
  calendarDate("start_date"),
  calendarDate("end_date").optional({ values: "null" }),
  handleValidation,
];

exports.validateUpdateRecurring = [
  uuidParam(),
  body("manual_account_id").optional().isUUID(),
  body("category_id").optional({ values: "null" }).isUUID(),
  money("amount").optional(),
  body("transaction_type").optional().isIn(["income", "expense"]),
  body("description").optional().isString().trim().isLength({ min: 1, max: 255 }),
  body("frequency").optional().isIn(FREQUENCIES),
  calendarDate("start_date").optional(),
  calendarDate("end_date").optional({ values: "null" }),
  body("is_active").optional().isBoolean().withMessage("is_active must be a boolean").toBoolean(),
  handleValidation,
];

// --- Dashboard charts: GET /dashboard/networth|spending?days=30|90|365 (default 30) ---

const CHART_WINDOWS = ["30", "90", "365"];
exports.validateChartWindow = [
  query("days")
    .optional()
    .not()
    .isArray()
    .withMessage("days must be a single value")
    .bail()
    .isIn(CHART_WINDOWS)
    .withMessage(`days must be one of ${CHART_WINDOWS.join(", ")}`),
  handleValidation,
];
