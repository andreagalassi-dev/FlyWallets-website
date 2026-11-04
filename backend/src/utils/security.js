const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { JWT_SECRET, JWT_REFRESH_SECRET } = require("../config/env");

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
  return jwt.sign(payload, JWT_SECRET, { expiresIn });
};

exports.generateRefreshToken = (payload) => {
  // jti makes every refresh token unique even when issued within the same second
  return jwt.sign({ ...payload, jti: crypto.randomUUID() }, JWT_REFRESH_SECRET, {
    expiresIn: "30d",
  });
};

/** SHA-256 hex digest. Used to store refresh tokens / reset tokens: the DB never holds the raw value. */
exports.sha256 = (value) =>
  crypto.createHash("sha256").update(String(value)).digest("hex");

/** 6-digit numeric OTP from a CSPRNG (leading zeros preserved). */
exports.generateOtp = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");

/** HMAC of an OTP bound to its owner: a leaked DB row alone cannot be brute-forced offline. */
exports.hashOtp = (userId, code) =>
  crypto.createHmac("sha256", JWT_SECRET).update(`${userId}:${code}`).digest("hex");

exports.safeEqual = (a, b) => {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
};
