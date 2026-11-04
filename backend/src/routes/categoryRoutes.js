const express = require("express");
const router = express.Router();
const c = require("../controllers/categoryController");
const v = require("../middleware/validationMiddleware");

router.get("/", c.listCategories);
router.post("/", v.validateCreateCategory, c.createCategory);
router.delete("/:id", v.validateIdParam, c.deleteCategory);

module.exports = router;
