const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const SALT_ROUNDS = 12; // High security standard as per arch doc

/**
 * Hash password using bcrypt.
 * Returns object with hash and salt (extracted or separate).
 * Note: Bcrypt embeds salt in the hash. To satisfy DB 'password_salt' column,
 * we will extract the salt portion.
 */
exports.hashPassword = async (plainPassword) => {
  const salt = await bcrypt.genSalt(SALT_ROUNDS);
  const hash = await bcrypt.hash(plainPassword, salt);
  return { hash, salt };
};

exports.comparePassword = async (plainPassword, hash) => {
  return await bcrypt.compare(plainPassword, hash);
};

exports.generateToken = (payload, expiresIn = "1h") => {
  return jwt.sign(
    payload,
    process.env.JWT_SECRET || "fallback_secret_do_not_use_prod",
    { expiresIn }
  );
};

exports.generateRefreshToken = (payload) => {
  return jwt.sign(
    payload,
    process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret",
    { expiresIn: "30d" }
  );
};
