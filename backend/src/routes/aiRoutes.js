const express = require("express");
const router = express.Router();
const c = require("../controllers/aiController");
const { aiLimiter } = require("../middleware/rateLimitMiddleware");
const { validateCategorize } = require("../middleware/validationMiddleware");

router.post("/categorize", aiLimiter, validateCategorize, c.categorize);
router.get("/insights", aiLimiter, c.insights);

module.exports = router;
