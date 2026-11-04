const { pool } = require("../config/db");
const {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
  sha256,
  generateOtp,
  hashOtp,
  safeEqual,
} = require("../utils/security");
const jwt = require("jsonwebtoken"); // Needed for verify
const crypto = require("crypto");
const { JWT_REFRESH_SECRET } = require("../config/env");
const { sendVerificationOtp, sendPasswordReset } = require("../services/emailService");

const OTP_TTL_MINUTES = 10;
const OTP_LOCK_MINUTES = 15;
const RESET_TTL_HOURS = 1;
// Short-lived access tokens bound how long a suspended/reset account keeps access (refresh re-checks the DB)
const ACCESS_TTL = "15m";
const ACCESS_TTL_MS = 15 * 60 * 1000;
// Refresh-token rotation: a rotated token replayed within this window (multi-tab race) only gets a new access
// token; after it, the replay is treated as theft and every session of the user is revoked.
const REFRESH_GRACE_SECONDS = 30;
// Rotated session rows are kept this long for reuse detection, then purged at the next login
const ROTATED_RETENTION_DAYS = 7;

// --- Helpers ---

const setTokenCookies = (res, accessToken, refreshToken) => {
  // Access Token (Optional to keep in cookie, usually Header is fine for APIs, but cookie is safer for XSS)
  // For this architecture we keep Access Token in JSON (for mobile app ease) or Cookie?
  // User guide says: "Save Access Token: HttpOnly Cookie (preferito)"

  res.cookie("access_token", accessToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: ACCESS_TTL_MS,
  });

  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

const accessPayload = (user) => ({
  id: user.id,
  email: user.email,
  user_type: user.user_type,
});

/** Persists the refresh token (as SHA-256) so it can be revoked on logout / password reset. */
const storeSession = (db, userId, refreshToken, req) =>
  db.query(
    `INSERT INTO sessions (user_id, session_token, device_name, ip_address, expires_at)
     VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
    [userId, sha256(refreshToken), (req.headers["user-agent"] || "").slice(0, 255), req.ip]
  );

/** Creates a fresh e-mail OTP for the user (replacing pending ones) and sends it. */
const issueEmailOtp = async (db, user) => {
  const code = generateOtp();
  await db.query("DELETE FROM email_verifications WHERE user_id = $1 AND is_verified = false", [user.id]);
  await db.query(
    `INSERT INTO email_verifications (user_id, email, code_hash, attempts, expires_at)
     VALUES ($1, $2, $3, 0, NOW() + make_interval(mins => $4))`,
    [user.id, user.email, hashOtp(user.id, code), OTP_TTL_MINUTES]
  );
  return code;
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
              owner_first_name, owner_last_name, owner_fiscal_code,
              address_street, address_city, address_postal_code, address_province,
              phone_business
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
        [
          user.id,
          req.body.company_name,
          req.body.vat_number,
          req.body.business_type || "srl", // Default or from input
          req.body.owner_first_name,
          req.body.owner_last_name,
          req.body.owner_fiscal_code,
          req.body.address_street,
          req.body.address_city,
          req.body.address_postal_code,
          req.body.address_province,
          req.body.phone_number, // Mapping phone_number to phone_business for now
        ]
      );
    }

    // Update phone_number in users table if provided (it is unique)
    if (req.body.phone_number) {
      await client.query("UPDATE users SET phone_number = $1 WHERE id = $2", [
        req.body.phone_number,
        user.id,
      ]);
    }

    // 5. Verification (OTP stored hashed, sent after COMMIT)
    const otp = await issueEmailOtp(client, user);

    // Log
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'register', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    // Generate Tokens + session (so refresh-token works right after registering)
    const accessToken = generateToken(accessPayload(user), ACCESS_TTL);
    const refreshToken = generateRefreshToken({ id: user.id });
    await storeSession(client, user.id, refreshToken, req);

    await client.query("COMMIT");

    sendVerificationOtp(user.email, otp); // fire-and-forget: never blocks or fails registration

    // Send Cookies
    setTokenCookies(res, accessToken, refreshToken);

    res.status(201).json({
      status: "success",
      data: {
        user: { id: user.id, email: user.email, user_type: user.user_type, email_verified: false },
        requiresEmailVerification: true,
        // Tokens are in cookies now
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    // Unique violations (fiscal code, VAT number, phone) -> clear 409 instead of a generic 500
    if (err.code === "23505") {
      const field = /\((\w+)\)/.exec(err.detail || "")?.[1] || "value";
      return res.status(409).json({
        status: "error",
        message: `An account with this ${field.replace(/_/g, " ")} already exists`,
      });
    }
    console.error("Registration Error:", err);
    res.status(500).json({ status: "error", message: "Registration failed" });
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
      return res.status(403).json({ status: "error", message: "Account disabled" });
    if (user.is_suspended)
      return res.status(403).json({ status: "error", message: "Account suspended" });

    // Update login stats
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [
      user.id,
    ]);
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'login', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    // Tokens
    const accessToken = generateToken(accessPayload(user), ACCESS_TTL);
    const refreshToken = generateRefreshToken({ id: user.id });

    // Store Session (and drop this user's expired ones + refresh tokens rotated long ago)
    await pool.query(
      `DELETE FROM sessions
        WHERE user_id = $1 AND (expires_at < NOW() OR rotated_at < NOW() - make_interval(days => $2))`,
      [user.id, ROTATED_RETENTION_DAYS]
    );
    await storeSession(pool, user.id, refreshToken, req);

    setTokenCookies(res, accessToken, refreshToken);

    // Fetch full profile data
    let profileData = {};
    if (user.user_type === "individual") {
      const profileRes = await pool.query(
        "SELECT * FROM user_individuals WHERE user_id = $1",
        [user.id]
      );
      profileData = profileRes.rows[0] || {};
    } else if (user.user_type === "business") {
      const profileRes = await pool.query(
        "SELECT * FROM user_businesses WHERE user_id = $1",
        [user.id]
      );
      profileData = profileRes.rows[0] || {};
    }

    res.json({
      status: "success",
      data: {
        user: {
          ...profileData, // profile first: its own `id` must not shadow the user id
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
  let decoded;
  try {
    decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET);
  } catch {
    return res
      .status(403)
      .json({ status: "error", message: "Invalid refresh token" });
  }

  // Rotation with reuse detection. The session row is locked so two concurrent refreshes with the same
  // token (several tabs share one cookie jar) serialize: the first rotates, the second lands in the grace window.
  const client = await pool.connect();
  let outcome;
  try {
    await client.query("BEGIN");
    const sessionCheck = await client.query(
      `SELECT s.id AS session_id, s.family_id, s.rotated_at IS NOT NULL AS rotated,
              COALESCE(s.rotated_at > NOW() - make_interval(secs => $3), false) AS in_grace,
              u.id, u.email, u.user_type, u.is_active, u.is_suspended
         FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.session_token = $1 AND s.user_id = $2 AND s.expires_at > NOW()
        FOR UPDATE OF s`,
      [sha256(refreshToken), decoded.id, REFRESH_GRACE_SECONDS]
    );
    const session = sessionCheck.rows[0];

    if (!session || !session.is_active || session.is_suspended) {
      outcome = { kind: "invalid" };
    } else if (session.rotated && !session.in_grace) {
      // A token that was already exchanged is being replayed: assume theft, revoke every session of the user
      await client.query("DELETE FROM sessions WHERE user_id = $1", [session.id]);
      await client.query(
        `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'refresh_token_reuse', $2, $3)`,
        [session.id, req.ip, req.headers["user-agent"]]
      );
      outcome = { kind: "reuse" };
    } else if (session.rotated) {
      // Concurrent refresh from another tab: its successor cookie is already in the jar, only re-issue access.
      // Only while the family (this login) still has a live, non-rotated head: after logout / revocation the
      // old token is worthless even inside the window. Separate statement: it must see the head committed by
      // the concurrent request we just waited for (a new snapshot).
      const head = await client.query(
        `SELECT 1 FROM sessions
          WHERE family_id = $1 AND rotated_at IS NULL AND expires_at > NOW() LIMIT 1`,
        [session.family_id]
      );
      outcome = head.rows[0] ? { kind: "grace", user: session } : { kind: "invalid" };
    } else {
      const newRefreshToken = generateRefreshToken({ id: session.id });
      await client.query("UPDATE sessions SET rotated_at = NOW() WHERE id = $1", [session.session_id]);
      // The new session inherits the original expiry: rotation does not extend the 30-day login lifetime
      await client.query(
        `INSERT INTO sessions (user_id, session_token, device_name, ip_address, expires_at, family_id)
         SELECT user_id, $2, $3, $4, expires_at, family_id FROM sessions WHERE id = $1`,
        [session.session_id, sha256(newRefreshToken), (req.headers["user-agent"] || "").slice(0, 255), req.ip]
      );
      outcome = { kind: "rotated", user: session, newRefreshToken };
    }
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  if (outcome.kind === "invalid") {
    return res.status(403).json({ status: "error", message: "Session invalid" });
  }
  if (outcome.kind === "reuse") {
    res.clearCookie("access_token");
    res.clearCookie("refresh_token");
    return res.status(403).json({
      status: "error",
      code: "REFRESH_TOKEN_REUSED",
      message: "Session revoked for security reasons. Please sign in again.",
    });
  }

  // Full payload (email, user_type) so protected endpoints behave the same after a refresh
  const accessToken = generateToken(accessPayload(outcome.user), ACCESS_TTL);
  if (outcome.kind === "rotated") {
    setTokenCookies(res, accessToken, outcome.newRefreshToken);
  } else {
    res.cookie("access_token", accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      maxAge: ACCESS_TTL_MS,
    });
  }

  res.json({ status: "success", message: "Token refreshed" });
};

/**
 * LOGOUT
 */
exports.logout = async (req, res) => {
  const refreshToken = req.cookies.refresh_token;
  if (refreshToken) {
    // Revoke the whole rotation chain of this login, so older (rotated) tokens of it die too
    await pool.query(
      `DELETE FROM sessions
        WHERE family_id IN (SELECT family_id FROM sessions WHERE session_token = $1)`,
      [sha256(refreshToken)]
    );
  }
  res.clearCookie("access_token");
  res.clearCookie("refresh_token");
  res.json({ status: "success", message: "Logged out" });
};

/**
 * UPDATE PROFILE
 */
exports.updateProfile = async (req, res) => {
  const client = await pool.connect();
  try {
    const userId = req.user.id; // From middleware
    const body = req.body ?? {};
    // Normalize user_type
    const user_type = req.user.user_type?.toLowerCase();

    await client.query("BEGIN");

    // 1. Update Common Data (Phone in Users table)
    if (body.phone_number) {
      // Check uniqueness if strictly enforced, or just update
      await client.query("UPDATE users SET phone_number = $1 WHERE id = $2", [
        body.phone_number,
        userId,
      ]);
    }

    // 2. Update Specific Data
    if (user_type === "individual") {
      const {
        first_name,
        last_name,
        date_of_birth,
        place_of_birth,
        nationality,
        address_street,
        address_city,
        address_postal_code,
        address_province,
        address_country,
      } = body;

      // Upsert or Update. Using UPDATE since insert happens on register.
      await client.query(
        `
            UPDATE user_individuals SET
                first_name = COALESCE($1, first_name),
                last_name = COALESCE($2, last_name),
                date_of_birth = COALESCE($3, date_of_birth),
                place_of_birth = COALESCE($4, place_of_birth),
                nationality = COALESCE($5, nationality),
                address_street = COALESCE($6, address_street),
                address_city = COALESCE($7, address_city),
                address_postal_code = COALESCE($8, address_postal_code),
                address_province = COALESCE($9, address_province),
                address_country = COALESCE($10, address_country)
            WHERE user_id = $11
        `,
        [
          first_name,
          last_name,
          date_of_birth,
          place_of_birth,
          nationality,
          address_street,
          address_city,
          address_postal_code,
          address_province,
          address_country,
          userId,
        ]
      );
    } else if (user_type === "business") {
      const {
        company_name,
        owner_first_name,
        owner_last_name,
        owner_fiscal_code,
        address_street,
        address_city,
        address_postal_code,
        address_province,
        address_country,
      } = body;

      await client.query(
        `
            UPDATE user_businesses SET
                company_name = COALESCE($1, company_name),
                owner_first_name = COALESCE($2, owner_first_name),
                owner_last_name = COALESCE($3, owner_last_name),
                owner_fiscal_code = COALESCE($4, owner_fiscal_code),
                address_street = COALESCE($5, address_street),
                address_city = COALESCE($6, address_city),
                address_postal_code = COALESCE($7, address_postal_code),
                address_province = COALESCE($8, address_province),
                address_country = COALESCE($9, address_country)
            WHERE user_id = $10
        `,
        [
          company_name,
          owner_first_name,
          owner_last_name,
          owner_fiscal_code,
          address_street,
          address_city,
          address_postal_code,
          address_province,
          address_country,
          userId,
        ]
      );
    }

    await client.query("COMMIT");

    // Return updated full payload for frontend state
    // Re-fetch everything
    let profileData = {};
    if (user_type === "individual") {
      const resP = await client.query(
        "SELECT * FROM user_individuals WHERE user_id = $1",
        [userId]
      );
      profileData = resP.rows[0];
    } else {
      const resP = await client.query(
        "SELECT * FROM user_businesses WHERE user_id = $1",
        [userId]
      );
      profileData = resP.rows[0];
    }

    // Get common data again
    const userRes = await client.query(
      "SELECT id, email, phone_number, user_type, email_verified FROM users WHERE id = $1",
      [userId]
    );
    const userUpdated = userRes.rows[0];

    res.json({
      status: "success",
      data: {
        user: {
          ...profileData,
          ...userUpdated,
        },
      },
    });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    if (err.code === "23505") {
      return res.status(409).json({ status: "error", message: "These details cannot be used" });
    }
    console.error(`[UpdateProfile] Error for User ${req?.user?.id}:`, err.message);
    res.status(500).json({ status: "error", message: "Update failed" });
  } finally {
    client.release();
  }
};

// --- E-mail verification (OTP) ---

/**
 * GET /me — current user + profile (used by the frontend to hydrate its state).
 */
exports.me = async (req, res) => {
  const userRes = await pool.query(
    "SELECT id, email, phone_number, user_type, email_verified FROM users WHERE id = $1",
    [req.user.id]
  );
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ status: "error", message: "User not found" });

  const table = user.user_type === "individual" ? "user_individuals" : "user_businesses";
  const profile = (await pool.query(`SELECT * FROM ${table} WHERE user_id = $1`, [user.id])).rows[0];
  res.json({ status: "success", data: { user: { ...profile, ...user } } });
};

/**
 * POST /verify-email { code } — authenticated. 3 wrong attempts lock verification for 15 minutes.
 */
exports.verifyEmail = async (req, res) => {
  const userId = req.user.id;
  const { code } = req.body;

  const userRes = await pool.query("SELECT email_verified FROM users WHERE id = $1", [userId]);
  if (userRes.rows[0]?.email_verified) {
    return res.json({ status: "success", message: "Email already verified" });
  }

  const vRes = await pool.query(
    `SELECT *,
            expires_at < NOW() AS is_expired,
            COALESCE(locked_until > NOW(), false) AS is_locked,
            GREATEST(CEIL(EXTRACT(EPOCH FROM (locked_until - NOW()))), 0)::int AS locked_seconds
       FROM email_verifications
      WHERE user_id = $1 AND is_verified = false
      ORDER BY created_at DESC LIMIT 1`,
    [userId]
  );
  const verification = vRes.rows[0];
  if (!verification) {
    return res.status(400).json({ status: "error", message: "No pending verification. Request a new code." });
  }

  if (verification.is_locked) {
    return res.status(429).json({
      status: "error",
      message: "Too many wrong attempts. Try again later.",
      retryAfterSeconds: verification.locked_seconds,
    });
  }
  if (verification.is_expired) {
    return res.status(400).json({ status: "error", message: "Code expired. Request a new one." });
  }

  // Reserve the attempt BEFORE comparing, atomically: parallel guesses cannot exceed max_attempts
  const reserved = await pool.query(
    `UPDATE email_verifications
        SET attempts = attempts + 1,
            locked_until = CASE WHEN attempts + 1 >= max_attempts
                                THEN NOW() + make_interval(mins => $2) ELSE locked_until END
      WHERE id = $1 AND attempts < max_attempts AND (locked_until IS NULL OR locked_until <= NOW())
      RETURNING attempts, max_attempts`,
    [verification.id, OTP_LOCK_MINUTES]
  );
  if (reserved.rows.length === 0) {
    return res.status(429).json({
      status: "error",
      message: "Too many wrong attempts. Try again later.",
      retryAfterSeconds: OTP_LOCK_MINUTES * 60,
    });
  }
  const { attempts, max_attempts } = reserved.rows[0];

  const valid = verification.code_hash && safeEqual(verification.code_hash, hashOtp(userId, code));
  if (!valid) {
    if (attempts >= max_attempts) {
      return res.status(429).json({
        status: "error",
        message: `Too many wrong attempts. Verification locked for ${OTP_LOCK_MINUTES} minutes.`,
        retryAfterSeconds: OTP_LOCK_MINUTES * 60,
      });
    }
    return res.status(400).json({
      status: "error",
      message: "Invalid code",
      attemptsLeft: max_attempts - attempts,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      "UPDATE email_verifications SET is_verified = true, verified_at = NOW() WHERE id = $1 AND is_verified = false",
      [verification.id]
    );
    await client.query(
      "UPDATE users SET email_verified = true, email_verified_at = NOW() WHERE id = $1",
      [userId]
    );
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'verify_email', $2, $3)`,
      [userId, req.ip, req.headers["user-agent"]]
    );
    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }

  res.json({ status: "success", message: "Email verified" });
};

/**
 * POST /resend-verification — authenticated, rate limited (3 / 10 min). Refused while locked.
 */
exports.resendVerification = async (req, res) => {
  const userRes = await pool.query(
    "SELECT id, email, email_verified FROM users WHERE id = $1",
    [req.user.id]
  );
  const user = userRes.rows[0];
  if (!user) return res.status(404).json({ status: "error", message: "User not found" });
  if (user.email_verified) {
    return res.json({ status: "success", message: "Email already verified" });
  }

  const locked = await pool.query(
    `SELECT CEIL(EXTRACT(EPOCH FROM (locked_until - NOW())))::int AS locked_seconds FROM email_verifications
      WHERE user_id = $1 AND locked_until > NOW() ORDER BY locked_until DESC LIMIT 1`,
    [user.id]
  );
  if (locked.rows[0]) {
    return res.status(429).json({
      status: "error",
      message: "Verification is locked after too many wrong attempts. Try again later.",
      retryAfterSeconds: locked.rows[0].locked_seconds,
    });
  }

  const code = await issueEmailOtp(pool, user);
  await sendVerificationOtp(user.email, code);
  res.json({ status: "success", message: "A new code has been sent", expiresInMinutes: OTP_TTL_MINUTES });
};

// --- Password reset ---

/**
 * POST /forgot-password { email } — always answers 200 so it cannot be used to discover accounts.
 */
exports.forgotPassword = async (req, res) => {
  const generic = {
    status: "success",
    message: "If an account exists for this email, a reset link has been sent.",
  };

  const userRes = await pool.query(
    "SELECT id, email, is_active FROM users WHERE email = $1",
    [req.body.email]
  );
  const user = userRes.rows[0];
  if (!user || !user.is_active) return res.json(generic);

  const rawToken = crypto.randomBytes(32).toString("hex");
  await pool.query("DELETE FROM password_resets WHERE user_id = $1 AND is_used = false", [user.id]);
  await pool.query(
    `INSERT INTO password_resets (user_id, reset_token, expires_at)
     VALUES ($1, $2, NOW() + make_interval(hours => $3))`,
    [user.id, sha256(rawToken), RESET_TTL_HOURS]
  );
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'forgot_password', $2, $3)`,
    [user.id, req.ip, req.headers["user-agent"]]
  );

  await sendPasswordReset(user.email, rawToken);
  res.json(generic);
};

/**
 * POST /reset-password { token, password } — single use, 1 hour TTL, revokes every active session.
 */
exports.resetPassword = async (req, res) => {
  const { token, password } = req.body;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // FOR UPDATE: two concurrent requests with the same token cannot both succeed
    const rRes = await client.query(
      `SELECT id, user_id FROM password_resets
        WHERE reset_token = $1 AND is_used = false AND expires_at > NOW()
        FOR UPDATE`,
      [sha256(token)]
    );
    const reset = rRes.rows[0];
    if (!reset) {
      await client.query("ROLLBACK");
      return res.status(400).json({ status: "error", message: "Invalid or expired reset link" });
    }

    const { hash, salt } = await hashPassword(password);
    await client.query(
      "UPDATE users SET password_hash = $1, password_salt = $2, password_changed_at = NOW() WHERE id = $3",
      [hash, salt, reset.user_id]
    );
    await client.query(
      "UPDATE password_resets SET is_used = true, used_at = NOW() WHERE id = $1",
      [reset.id]
    );
    await client.query("DELETE FROM sessions WHERE user_id = $1", [reset.user_id]);
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'reset_password', $2, $3)`,
      [reset.user_id, req.ip, req.headers["user-agent"]]
    );
    await client.query("COMMIT");

    res.json({ status: "success", message: "Password updated. Please sign in with your new password." });
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
};
