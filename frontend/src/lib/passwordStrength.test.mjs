import { test } from "node:test";
import assert from "node:assert/strict";
import { PASSWORD_CHECKS, scorePassword } from "./passwordStrength.js";

test("empty password scores 0 with no label and is invalid", () => {
  const r = scorePassword("");
  assert.equal(r.score, 0);
  assert.equal(r.label, "");
  assert.equal(r.valid, false);
  assert.ok(r.checks.every((c) => c.passed === false));
});

test("default argument behaves like an empty password", () => {
  assert.equal(scorePassword().score, 0);
});

test("exposes one result per rule, mirroring PASSWORD_CHECKS", () => {
  const r = scorePassword("abc");
  assert.deepEqual(
    r.checks.map((c) => c.id),
    PASSWORD_CHECKS.map((c) => c.id)
  );
});

test("each rule is detected independently", () => {
  const passed = (pwd) => scorePassword(pwd).checks.filter((c) => c.passed).map((c) => c.id);
  assert.deepEqual(passed("abcdefgh"), ["length"]);
  assert.deepEqual(passed("A"), ["upper"]);
  assert.deepEqual(passed("1"), ["number"]);
  assert.deepEqual(passed("@"), ["special"]);
});

test("a password missing one rule is invalid and capped at 'Fair'", () => {
  const r = scorePassword("Password123"); // no special character
  assert.equal(r.valid, false);
  assert.equal(r.score, 2);
  assert.equal(r.label, "Fair");
});

test("very weak passwords stay below 'Fair'", () => {
  assert.equal(scorePassword("a").label, "Too weak");
  assert.equal(scorePassword("abcdefgh").score, 1); // only the length rule
  assert.equal(scorePassword("abcdefgh1").label, "Fair");
});

test("a valid short password is 'Good'", () => {
  const r = scorePassword("Passw0rd!");
  assert.equal(r.valid, true);
  assert.equal(r.score, 3);
  assert.equal(r.label, "Good");
});

test("a valid password of 12+ characters is 'Strong'", () => {
  const r = scorePassword("Passw0rd!Passw0rd!");
  assert.equal(r.valid, true);
  assert.equal(r.score, 4);
  assert.equal(r.label, "Strong");
});

test("length boundary: 11 chars is Good, 12 chars is Strong", () => {
  assert.equal(scorePassword("Abcdefgh1@x").score, 3);
  assert.equal(scorePassword("Abcdefgh1@xy").score, 4);
});

test("only the backend-accepted special characters count", () => {
  assert.equal(scorePassword("Password1#").valid, false);
  assert.equal(scorePassword("Password1&").valid, true);
});
