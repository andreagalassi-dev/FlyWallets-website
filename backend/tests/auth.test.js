const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { request, app, pool, dbSuite, registerUser, cleanupTestUsers, closeDb, PASSWORD } = require("./helpers");
const { hashOtp, sha256 } = require("../src/utils/security");

let ready;
before(async (t) => {
  ready = await dbSuite(t);
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

test("register creates user, session and sets httpOnly cookies", async (t) => {
  if (!ready) return t.skip();
  const { res, email } = await registerUser("reg");
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.requiresEmailVerification, true);
  const cookies = res.headers["set-cookie"].join(";");
  assert.match(cookies, /access_token=.*HttpOnly/);
  assert.match(cookies, /refresh_token=.*HttpOnly/);

  const sessions = await pool.query(
    "SELECT s.session_token FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.email = $1",
    [email.toLowerCase()]
  );
  assert.equal(sessions.rows.length, 1);
  assert.equal(sessions.rows[0].session_token.length, 64, "refresh token must be stored hashed");
});

test("register rejects weak passwords and duplicate e-mails", async (t) => {
  if (!ready) return t.skip();
  const weak = await request(app).post("/api/auth/register").send({ email: "x@y.it", password: "weak", user_type: "individual" });
  assert.equal(weak.status, 400);

  const { email } = await registerUser("dup");
  const { res } = await registerUser("dup", { email });
  assert.equal(res.status, 409);
});

test("login: wrong password 401, correct password 200, refresh keeps full token payload", async (t) => {
  if (!ready) return t.skip();
  const { email } = await registerUser("login");

  const bad = await request(app).post("/api/auth/login").send({ email, password: "Wrong123!" });
  assert.equal(bad.status, 401);

  const agent = request.agent(app);
  const ok = await agent.post("/api/auth/login").send({ email, password: PASSWORD });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.user.email, email.toLowerCase());

  const refresh = await agent.post("/api/auth/refresh-token");
  assert.equal(refresh.status, 200);
  const me = await agent.get("/api/auth/me");
  assert.equal(me.status, 200);
  assert.equal(me.body.data.user.user_type, "individual");

  await agent.post("/api/auth/logout");
  const after = await agent.post("/api/auth/refresh-token");
  assert.equal(after.status, 401, "cookies are cleared on logout");
});

test("revoked sessions cannot refresh", async (t) => {
  if (!ready) return t.skip();
  const { agent, userId } = await registerUser("revoked");
  await pool.query("DELETE FROM sessions WHERE user_id = $1", [userId]);
  const res = await agent.post("/api/auth/refresh-token");
  assert.equal(res.status, 403);
});

test("email OTP: wrong codes lock after 3 attempts, right code verifies", async (t) => {
  if (!ready) return t.skip();
  const { agent, userId } = await registerUser("otp");
  await pool.query("UPDATE email_verifications SET code_hash = $1 WHERE user_id = $2", [hashOtp(userId, "123456"), userId]);

  assert.equal((await agent.post("/api/auth/verify-email").send({ code: "000000" })).status, 400);
  assert.equal((await agent.post("/api/auth/verify-email").send({ code: "000001" })).status, 400);
  assert.equal((await agent.post("/api/auth/verify-email").send({ code: "000002" })).status, 429, "3rd wrong attempt locks");
  assert.equal((await agent.post("/api/auth/verify-email").send({ code: "123456" })).status, 429, "even the right code is refused while locked");
  assert.equal((await agent.post("/api/auth/resend-verification")).status, 429, "no resend while locked");

  // new user, happy path
  const second = await registerUser("otp2");
  await pool.query("UPDATE email_verifications SET code_hash = $1 WHERE user_id = $2", [hashOtp(second.userId, "654321"), second.userId]);
  assert.equal((await second.agent.post("/api/auth/verify-email").send({ code: "654321" })).status, 200);
  const row = await pool.query("SELECT email_verified FROM users WHERE id = $1", [second.userId]);
  assert.equal(row.rows[0].email_verified, true);
});

test("password reset: single use token, revokes sessions, new password works", async (t) => {
  if (!ready) return t.skip();
  const { email, userId, agent } = await registerUser("reset");

  // unknown e-mail gets the same answer (no account enumeration)
  const unknown = await request(app).post("/api/auth/forgot-password").send({ email: "nobody@flywallets.test" });
  assert.equal(unknown.status, 200);

  const known = await request(app).post("/api/auth/forgot-password").send({ email });
  assert.equal(known.status, 200);
  assert.equal(known.body.message, unknown.body.message);

  // We cannot read the e-mailed token, so swap the stored hash for one we know
  const raw = crypto.randomBytes(32).toString("hex");
  await pool.query("UPDATE password_resets SET reset_token = $1 WHERE user_id = $2", [sha256(raw), userId]);

  const weak = await request(app).post("/api/auth/reset-password").send({ token: raw, password: "weak" });
  assert.equal(weak.status, 400);

  const NEW = "Brand0New!pass";
  const ok = await request(app).post("/api/auth/reset-password").send({ token: raw, password: NEW });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const replay = await request(app).post("/api/auth/reset-password").send({ token: raw, password: NEW });
  assert.equal(replay.status, 400, "token is single use");

  assert.equal((await agent.post("/api/auth/refresh-token")).status, 403, "old sessions revoked");
  assert.equal((await request(app).post("/api/auth/login").send({ email, password: PASSWORD })).status, 401);
  assert.equal((await request(app).post("/api/auth/login").send({ email, password: NEW })).status, 200);
});

test("expired reset tokens are rejected", async (t) => {
  if (!ready) return t.skip();
  const { email, userId } = await registerUser("expired");
  await request(app).post("/api/auth/forgot-password").send({ email });
  const raw = crypto.randomBytes(32).toString("hex");
  await pool.query("UPDATE password_resets SET reset_token = $1, expires_at = NOW() - INTERVAL '1 minute' WHERE user_id = $2", [sha256(raw), userId]);
  const res = await request(app).post("/api/auth/reset-password").send({ token: raw, password: "Brand0New!pass" });
  assert.equal(res.status, 400);
});
