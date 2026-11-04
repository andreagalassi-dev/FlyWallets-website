const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const {
  loginLimiter,
  registerLimiter,
  otpLimiter,
  authCodeIpLimiter,
  apiLimiter,
} = require("../middleware/rateLimitMiddleware");
const {
  validateLogin,
  validateRegistration,
  validateOtp,
  validateForgotPassword,
  validateResetPassword,
  validateProfile,
} = require("../middleware/validationMiddleware");
const { authenticateToken } = require("../middleware/authMiddleware");

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

// Current user / Update Profile
router.get("/me", authenticateToken, authController.me);
router.put("/profile", authenticateToken, apiLimiter, validateProfile, authController.updateProfile);

// Logout
router.post("/logout", authController.logout);

// E-mail verification (OTP)
router.post(
  "/verify-email",
  authenticateToken,
  authCodeIpLimiter,
  validateOtp,
  authController.verifyEmail
);
router.post(
  "/resend-verification",
  authenticateToken,
  authCodeIpLimiter,
  otpLimiter,
  authController.resendVerification
);

// Password recovery
router.post(
  "/forgot-password",
  authCodeIpLimiter,
  validateForgotPassword, // normalizes the e-mail first, so the limiter key cannot be dodged with aliases
  otpLimiter,
  authController.forgotPassword
);
router.post("/reset-password", authCodeIpLimiter, validateResetPassword, authController.resetPassword);

module.exports = router;
