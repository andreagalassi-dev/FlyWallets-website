const express = require("express");
const router = express.Router();
const c = require("../controllers/accountController");
const v = require("../middleware/validationMiddleware");

router.get("/", c.listAccounts);
router.post("/manual", v.validateCreateManualAccount, c.createManualAccount);
router.put("/manual/:id", v.validateUpdateManualAccount, c.updateManualAccount);
router.delete("/manual/:id", v.validateIdParam, c.deleteManualAccount);
router.get("/:id/history", v.validateAccountHistory, c.accountHistory);

module.exports = router;
