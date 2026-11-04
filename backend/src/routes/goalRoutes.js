const express = require("express");
const router = express.Router();
const c = require("../controllers/goalController");
const v = require("../middleware/validationMiddleware");

router.get("/", c.listGoals);
router.post("/", v.validateCreateGoal, c.createGoal);
router.post("/:id/contribute", v.validateContribute, c.contribute);
router.put("/:id", v.validateUpdateGoal, c.updateGoal);
router.delete("/:id", v.validateIdParam, c.deleteGoal);

module.exports = router;
