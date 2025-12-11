const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");

// Register Routes (Step-by-step or unified)
router.post("/register", authController.register);

// Login Route
router.post("/login", authController.login);

module.exports = router;
