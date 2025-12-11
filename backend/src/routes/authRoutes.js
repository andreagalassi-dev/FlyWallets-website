const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
  loginLimiter,
  registerLimiter,
} = require("../middleware/rateLimitMiddleware");
const {
  validateLogin,
  validateRegistration,
} = require("../middleware/validationMiddleware");

// Register
router.post(
  "/register",
  registerLimiter,
  validateRegistration,
  authController.register
);

// Login
router.post("/login", loginLimiter, validateLogin, authController.login);

// Refresh Token
router.post("/refresh-token", authController.refreshToken);

// Logout
router.post("/logout", authController.logout);

// Helper / Recover
router.post("/verify-email", authController.verifyEmail);
router.post("/forgot-password", authController.forgotPassword);
router.post("/reset-password", authController.resetPassword);

module.exports = router;
