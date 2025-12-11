const { pool } = require("../config/db");
const {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
} = require("../utils/security");
const jwt = require("jsonwebtoken"); // Needed for verify

// --- Helpers ---

const setTokenCookies = (res, accessToken, refreshToken) => {
  // Access Token (Optional to keep in cookie, usually Header is fine for APIs, but cookie is safer for XSS)
  // For this architecture we keep Access Token in JSON (for mobile app ease) or Cookie?
  // User guide says: "Save Access Token: HttpOnly Cookie (preferito)"

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 3600000, // 1 hour
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/api/auth/refresh-token", // Restrict to refresh endpoint
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

// --- Controllers ---

/**
 * REGISTER
 */
exports.register = async (req, res) => {
  const client = await pool.connect();
  try {
    const { email, password, user_type } = req.body;
    // ... (rest of profile fields handled by input, assumed validated by middleware now) ...
    // To keep it clean, we extract major fields needed for logic.
    // We assume validationMiddleware has strictly checked existence of required fields.

    await client.query("BEGIN");

    // 1. Check duplicate EMAIL
    const checkEmail = await client.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );
    if (checkEmail.rows.length > 0) {
      await client.query("ROLLBACK");
      return res
        .status(409)
        .json({ status: "error", message: "Email already registered" });
    }

    // 2. Hash Password
    const { hash, salt } = await hashPassword(password);

    // 3. Insert User
    const userResult = await client.query(
      `INSERT INTO users (
        email, password_hash, password_salt, user_type, 
        terms_accepted, terms_accepted_at, privacy_accepted, privacy_accepted_at,
        is_active, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, true, NOW(), true, NOW(), true, NOW(), NOW()) 
      RETURNING id, email, user_type`,
      [email, hash, salt, user_type]
    );
    const user = userResult.rows[0];

    // 4. Insert Profile (Simplified for brevity, assuming req.body contains correct fields)
    // In production, we map req.body fields explicitly to prevent prototype pollution etc.
    if (user_type === "individual") {
      await client.query(
        `INSERT INTO user_individuals (
           user_id, first_name, last_name, fiscal_code, date_of_birth, place_of_birth, nationality,
           address_street, address_city, address_postal_code, address_province
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          user.id,
          req.body.first_name,
          req.body.last_name,
          req.body.fiscal_code,
          req.body.date_of_birth,
          req.body.place_of_birth,
          req.body.nationality || "IT",
          req.body.address_street,
          req.body.address_city,
          req.body.address_postal_code,
          req.body.address_province,
        ]
      );
    } else {
      await client.query(
        `INSERT INTO user_businesses (
              user_id, company_name, vat_number, business_type,
              address_street, address_city, address_postal_code, address_province
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          req.body.company_name,
          req.body.vat_number,
          req.body.business_type,
          req.body.address_street,
          req.body.address_city,
          req.body.address_postal_code,
          req.body.address_province,
        ]
      );
    }

    // 5. Verification
    await client.query(
      `INSERT INTO email_verifications (user_id, email, attempts) VALUES ($1, $2, 0)`,
      [user.id, email]
    );

    // Log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'register', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    await client.query("COMMIT");

    // Generate Tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      user_type: user.user_type,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Send Cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      status: "success",
      data: {
        user: { id: user.id, email: user.email, user_type: user.user_type },
        // Tokens are in cookies now
      },
    });
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Registration Error:", err);
    res
      .status(500)
      .json({
        status: "error",
        message: "Registration failed",
        debug: err.message,
      });
  } finally {
    client.release();
  }
};

/**
 * LOGIN
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user || !(await comparePassword(password, user.password_hash))) {
      return res
        .status(401)
        .json({ status: "error", message: "Invalid credentials" });
    }

    if (!user.is_active)
      return res.status(403).json({ message: "Account disabled" });
    if (user.is_suspended)
      return res.status(403).json({ message: "Account suspended" });

    // Update login stats
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [
      user.id,
    ]);
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'login', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    // Tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      user_type: user.user_type,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store Session
    await pool.query(
      `INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at) VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken, req.ip, req.headers["user-agent"]]
    );

    setTokenCookies(res, accessToken, refreshToken);

    res.json({
      status: "success",
      data: {
        user: {
          id: user.id,
          email: user.email,
          user_type: user.user_type,
          email_verified: user.email_verified,
        },
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ status: "error", message: "Login failed" });
  }
};

/**
 * REFRESH TOKEN
 */
exports.refreshToken = async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (!refreshToken)
    return res
      .status(401)
      .json({ status: "error", message: "No refresh token" });

  // Verify token
  jwt.verify(
    refreshToken,
    process.env.JWT_REFRESH_SECRET || "fallback_refresh_secret",
    async (err, decoded) => {
      if (err)
        return res
          .status(403)
          .json({ status: "error", message: "Invalid refresh token" });

      // Check if session exists in DB (Security check: Revocation)
      const sessionCheck = await pool.query(
        "SELECT id FROM sessions WHERE session_token = $1 AND user_id = $2",
        [refreshToken, decoded.id]
      );
      if (sessionCheck.rows.length === 0) {
        // Potential Reuse Detected! In a stricter system, invalidate all user tokens here.
        return res
          .status(403)
          .json({ status: "error", message: "Session invalid" });
      }

      const accessToken = generateToken({ id: decoded.id }); // Payload usually needs more info, but ID is min
      // Typically we refetch user to get roles/email or encode them in refresh token payload too.
      // For now, minimal:

      res.cookie("access_token", accessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 3600000,
      });

      res.json({ status: "success", message: "Token refreshed" });
    }
  );
};

/**
 * LOGOUT
 */
exports.logout = async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    await pool.query("DELETE FROM sessions WHERE session_token = $1", [
      refreshToken,
    ]);
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.json({ status: "success", message: "Logged out" });
};

// --- MOCK Endpoints for Passwords/Emails (Full implementation requires Email Service) ---

exports.verifyEmail = async (req, res) => {
  // TODO: Validate OTP from Redis/DB
  res.json({ status: "success", message: "Email verified (MOCK)" });
};

exports.forgotPassword = async (req, res) => {
  // TODO: Send Reset Email
  res.json({ status: "success", message: "Reset email sent (MOCK)" });
};

exports.resetPassword = async (req, res) => {
  // TODO: Update password
  res.json({ status: "success", message: "Password reset (MOCK)" });
};
