const crypto = require("crypto");
require("dotenv").config();

const NODE_ENV = process.env.NODE_ENV || "development";
const isProd = NODE_ENV === "production";
const isTest = NODE_ENV === "test";

/**
 * JWT secrets must come from the environment. There is deliberately no hardcoded fallback:
 * - production: refuse to start without a strong secret
 * - development: generate a random one per process (sessions reset on restart) and warn
 * - test: fixed values so tests are deterministic
 */
const resolveSecret = (name) => {
  const value = process.env[name];
  if (value && value.length >= 32) return value;

  if (isProd) {
    console.error(`❌ ${name} is missing or shorter than 32 characters. Refusing to start.`);
    process.exit(1);
  }
  if (isTest) return `test-only-${name.toLowerCase()}-0123456789abcdef0123456789`;

  console.warn(
    `⚠️  ${name} is not set (or < 32 chars): using a random secret for this process. Set it in backend/.env.`
  );
  return crypto.randomBytes(48).toString("hex");
};

const list = (value, fallback) =>
  (value || fallback)
    .split(",")
    .map((v) => v.trim().replace(/\/$/, ""))
    .filter(Boolean);

const clientUrls = list(process.env.CLIENT_URL, "http://localhost:3000");

module.exports = {
  NODE_ENV,
  isProd,
  isTest,
  PORT: process.env.PORT || 5000,
  JWT_SECRET: resolveSecret("JWT_SECRET"),
  JWT_REFRESH_SECRET: resolveSecret("JWT_REFRESH_SECRET"),
  clientUrls,
  // First origin is the canonical one used in e-mail links
  primaryClientUrl: clientUrls[0],
  trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) : 0,
  // When true, unverified users can read but not modify their financial data (see verifiedEmailMiddleware)
  requireVerifiedEmail: ["true", "1", "yes"].includes(String(process.env.REQUIRE_VERIFIED_EMAIL || "").toLowerCase()),
};
