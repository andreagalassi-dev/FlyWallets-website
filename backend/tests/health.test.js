const { test } = require("node:test");
const assert = require("node:assert/strict");
const { app, request } = require("./helpers");

test("GET /api/health responds OK", async () => {
  const res = await request(app).get("/api/health");
  assert.equal(res.status, 200);
  assert.equal(res.body.status, "OK");
});

test("protected routes require authentication", async () => {
  for (const path of ["/api/accounts", "/api/transactions", "/api/goals", "/api/dashboard", "/api/categories", "/api/ai/insights"]) {
    const res = await request(app).get(path);
    assert.equal(res.status, 401, path);
  }
});

test("unknown routes return a JSON 404", async () => {
  const res = await request(app).get("/api/nope");
  assert.equal(res.status, 404);
  assert.equal(res.body.status, "error");
});

test("CORS rejects unknown origins and allows the configured one", async () => {
  const bad = await request(app).get("/api/health").set("Origin", "http://evil.example");
  assert.equal(bad.status, 403);
  const ok = await request(app).get("/api/health").set("Origin", "http://localhost:3000");
  assert.equal(ok.status, 200);
  assert.equal(ok.headers["access-control-allow-origin"], "http://localhost:3000");
});
