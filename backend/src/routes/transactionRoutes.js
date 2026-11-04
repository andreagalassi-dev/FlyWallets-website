const express = require("express");
const router = express.Router();
const c = require("../controllers/transactionController");
const v = require("../middleware/validationMiddleware");

router.get("/", v.validateListTransactions, c.listTransactions);
router.post("/", v.validateCreateTransaction, c.createTransaction);
router.put("/:id", v.validateUpdateTransaction, c.updateTransaction);
router.delete("/:id", v.validateIdParam, c.deleteTransaction);

module.exports = router;
