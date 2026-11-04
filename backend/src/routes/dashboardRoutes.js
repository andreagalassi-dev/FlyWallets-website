const express = require("express");
const router = express.Router();
const { getDashboard, getNetWorth, getSpending } = require("../controllers/dashboardController");
const { validateChartWindow } = require("../middleware/validationMiddleware");

router.get("/", getDashboard);
router.get("/networth", validateChartWindow, getNetWorth);
router.get("/spending", validateChartWindow, getSpending);

module.exports = router;
