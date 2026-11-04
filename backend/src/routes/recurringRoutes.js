const express = require("express");
const router = express.Router();
const c = require("../controllers/recurringController");
const v = require("../middleware/validationMiddleware");

router.get("/", c.listRecurring);
router.post("/process", c.processNow);
router.get("/:id", v.validateIdParam, c.getRecurring);
router.post("/", v.validateCreateRecurring, c.createRecurring);
router.put("/:id", v.validateUpdateRecurring, c.updateRecurring);
router.delete("/:id", v.validateIdParam, c.deleteRecurring);

module.exports = router;
