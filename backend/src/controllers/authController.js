const { pool } = require("../config/db");
const {
  hashPassword,
  comparePassword,
  generateToken,
  generateRefreshToken,
} = require("../utils/security");

/**
 * REGISTER User
 * Wraps user creation, profile creation, and verification setup in a transaction.
 */
exports.register = async (req, res) => {
  const client = await pool.connect();
  try {
    const {
      email,
      password,
      user_type, // Base User
      first_name,
      last_name,
      fiscal_code,
      date_of_birth,
      place_of_birth,
      nationality, // Individual
      address_street,
      address_city,
      address_postal_code,
      address_province, // Address
      company_name,
      vat_number,
      business_type, // Business
    } = req.body;

    // Validation (Basic)
    if (!email || !password || !user_type) {
      return res
        .status(400)
        .json({ status: "error", message: "Missing required fields" });
    }

    await client.query("BEGIN");

    // 1. Check if email exists
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

    // 4. Insert Profile based on type
    if (user_type === "individual") {
      if (!first_name || !last_name || !fiscal_code) {
        throw new Error("Missing individual profile data");
      }
      await client.query(
        `INSERT INTO user_individuals (
           user_id, first_name, last_name, fiscal_code, date_of_birth, place_of_birth, nationality,
           address_street, address_city, address_postal_code, address_province
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          user.id,
          first_name,
          last_name,
          fiscal_code,
          date_of_birth || "2000-01-01",
          place_of_birth || "Unknown",
          nationality || "IT",
          address_street,
          address_city,
          address_postal_code,
          address_province,
        ]
      );
    } else if (user_type === "business") {
      if (!company_name || !vat_number) {
        throw new Error("Missing business profile data");
      }
      await client.query(
        `INSERT INTO user_businesses (
              user_id, company_name, vat_number, business_type,
              address_street, address_city, address_postal_code, address_province
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          company_name,
          vat_number,
          business_type || "other",
          address_street,
          address_city,
          address_postal_code,
          address_province,
        ]
      );
    }

    // 5. Create Email Verification Entry
    await client.query(
      `INSERT INTO email_verifications (user_id, email, attempts) VALUES ($1, $2, 0)`,
      [user.id, email]
    );

    // 6. Log Audit
    await client.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'register', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    await client.query("COMMIT");

    // Generate Token
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      user_type: user.user_type,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // In a real app, send verification email here

    res.status(201).json({
      status: "success",
      data: {
        user: { id: user.id, email: user.email, user_type: user.user_type },
        access_token: accessToken,
        refresh_token: refreshToken,
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
 * LOGIN User
 */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. Find User
    const result = await pool.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);
    const user = result.rows[0];

    if (!user) {
      return res
        .status(401)
        .json({ status: "error", message: "Invalid credentials" });
    }

    // 2. Verify Password
    const isMatch = await comparePassword(password, user.password_hash);
    if (!isMatch) {
      // Log failed attempt
      return res
        .status(401)
        .json({ status: "error", message: "Invalid credentials" });
    }

    // 3. Check Status
    if (!user.is_active)
      return res.status(403).json({ message: "Account disabled" });
    if (user.is_suspended)
      return res.status(403).json({ message: "Account suspended" });

    // 4. Update stats
    await pool.query("UPDATE users SET last_login_at = NOW() WHERE id = $1", [
      user.id,
    ]);
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, ip_address, user_agent) VALUES ($1, 'login', $2, $3)`,
      [user.id, req.ip, req.headers["user-agent"]]
    );

    // 5. Generate Tokens
    const accessToken = generateToken({
      id: user.id,
      email: user.email,
      user_type: user.user_type,
    });
    const refreshToken = generateRefreshToken({ id: user.id });

    // 6. Create Session
    // We store the session hash or raw token depending on strategy. Simplified here.
    await pool.query(
      `INSERT INTO sessions (user_id, session_token, ip_address, user_agent, expires_at) 
         VALUES ($1, $2, $3, $4, NOW() + INTERVAL '30 days')`,
      [user.id, refreshToken, req.ip, req.headers["user-agent"]]
    );

    res.json({
      status: "success",
      data: {
        access_token: accessToken,
        refresh_token: refreshToken,
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
