// Refresh-token rotation with reuse detection (POST /api/auth/refresh-token).
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { request, app, pool, dbSuite, registerUser, cleanupTestUsers, closeDb, PASSWORD } = require("./helpers");
const { sha256 } = require("../src/utils/security");

let ready;
before(async (t) => {
  ready = await dbSuite(t);
});
after(async () => {
  if (ready) await cleanupTestUsers();
  await closeDb();
});

const cookieValue = (res, name) => {
  const raw = (res.headers["set-cookie"] || []).find((c) => c.startsWith(`${name}=`));
  return raw ? raw.slice(name.length + 1).split(";")[0] : undefined;
};
const refreshWith = (token) => request(app).post("/api/auth/refresh-token").set("Cookie", `refresh_token=${token}`);
const sessionsOf = async (userId) =>
  (await pool.query("SELECT session_token, rotated_at, expires_at FROM sessions WHERE user_id = $1 ORDER BY created_at", [userId])).rows;

test("refresh issues a new refresh token each time and marks the old one rotated", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId } = await registerUser("rot");
  const first = cookieValue(res, "refresh_token");

  const r1 = await agent.post("/api/auth/refresh-token");
  assert.equal(r1.status, 200);
  const second = cookieValue(r1, "refresh_token");
  assert.ok(second && second !== first, "a new refresh token is issued");
  assert.ok(cookieValue(r1, "access_token"));
  const setCookie = r1.headers["set-cookie"].find((c) => c.startsWith("refresh_token="));
  assert.match(setCookie, /HttpOnly/);
  assert.match(setCookie, /SameSite=Strict/);

  const rows = await sessionsOf(userId);
  assert.equal(rows.length, 2);
  const old = rows.find((r) => r.session_token === sha256(first));
  const fresh = rows.find((r) => r.session_token === sha256(second));
  assert.ok(old.rotated_at, "old row marked rotated");
  assert.equal(fresh.rotated_at, null);
  assert.equal(fresh.expires_at.getTime(), old.expires_at.getTime(), "rotation keeps the original expiry");

  // the agent now holds the new token and keeps rotating
  const r2 = await agent.post("/api/auth/refresh-token");
  assert.equal(r2.status, 200);
  assert.notEqual(cookieValue(r2, "refresh_token"), second);
  assert.equal((await agent.get("/api/auth/me")).status, 200);
});

test("a rotated token replayed inside the grace window only gets a new access token", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId } = await registerUser("grace");
  const first = cookieValue(res, "refresh_token");
  assert.equal((await agent.post("/api/auth/refresh-token")).status, 200);

  const replay = await refreshWith(first); // e.g. a second tab that sent the old cookie concurrently
  assert.equal(replay.status, 200);
  assert.ok(cookieValue(replay, "access_token"), "fresh access token");
  assert.equal(cookieValue(replay, "refresh_token"), undefined, "no new refresh token in the grace path");
  assert.equal((await sessionsOf(userId)).length, 2, "no extra session created");
  assert.equal((await agent.post("/api/auth/refresh-token")).status, 200, "the legitimate chain keeps working");
});

test("concurrent refreshes with the same token: one rotation, every request succeeds", async (t) => {
  if (!ready) return t.skip();
  const { res, userId } = await registerUser("race");
  const token = cookieValue(res, "refresh_token");
  const results = await Promise.all(Array.from({ length: 5 }, () => refreshWith(token)));
  assert.deepEqual(results.map((r) => r.status), [200, 200, 200, 200, 200]);
  assert.equal(results.filter((r) => cookieValue(r, "refresh_token")).length, 1, "only one new refresh token");
  assert.equal((await sessionsOf(userId)).length, 2);
});

test("a rotated token replayed after the grace window revokes every session of the user", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId, email } = await registerUser("reuse");
  const stolen = cookieValue(res, "refresh_token");
  assert.equal((await agent.post("/api/auth/refresh-token")).status, 200);
  // another device of the same user
  const other = request.agent(app);
  assert.equal((await other.post("/api/auth/login").send({ email, password: PASSWORD })).status, 200);

  await pool.query("UPDATE sessions SET rotated_at = NOW() - INTERVAL '31 seconds' WHERE session_token = $1", [sha256(stolen)]);
  const reuse = await refreshWith(stolen);
  assert.equal(reuse.status, 403);
  assert.equal(reuse.body.status, "error");
  assert.equal(reuse.body.code, "REFRESH_TOKEN_REUSED");
  assert.equal((await sessionsOf(userId)).length, 0, "all sessions revoked");

  assert.equal((await agent.post("/api/auth/refresh-token")).status, 403, "legitimate chain revoked too");
  assert.equal((await other.post("/api/auth/refresh-token")).status, 403, "other devices revoked too");
  const audit = await pool.query("SELECT 1 FROM audit_logs WHERE user_id = $1 AND action = 'refresh_token_reuse'", [userId]);
  assert.equal(audit.rows.length, 1);
});

test("login purges long-rotated and expired session rows", async (t) => {
  if (!ready) return t.skip();
  const { agent, res, userId, email } = await registerUser("purge");
  const first = cookieValue(res, "refresh_token");
  assert.equal((await agent.post("/api/auth/refresh-token")).status, 200);
  await pool.query("UPDATE sessions SET rotated_at = NOW() - INTERVAL '8 days' WHERE session_token = $1", [sha256(first)]);

  assert.equal((await request(app).post("/api/auth/login").send({ email, password: PASSWORD })).status, 200);
  const rows = await sessionsOf(userId);
  assert.ok(!rows.some((r) => r.session_token === sha256(first)), "old rotated row purged");
  assert.equal(rows.length, 2, "current chain head + new login session remain");
});
