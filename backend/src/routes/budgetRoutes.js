const express = require("express");
const router = express.Router();
const c = require("../controllers/budgetController");
const v = require("../middleware/validationMiddleware");

router.get("/", c.listBudgets);
router.get("/alerts", c.listAlerts);
router.post("/", v.validateCreateBudget, c.createBudget);
router.put("/:id", v.validateUpdateBudget, c.updateBudget);
router.delete("/:id", v.validateIdParam, c.deleteBudget);

module.exports = router;
