import { test } from "node:test";
import assert from "node:assert/strict";
import { getErrorMessage, getErrorCode, getFriendlyErrorMessage } from "./errors.js";

test("prefers the API message", () => {
  const err = { response: { data: { message: "Invalid code", errors: [{ msg: "x" }] } } };
  assert.equal(getErrorMessage(err), "Invalid code");
});

test("falls back to the first validation error", () => {
  const err = { response: { data: { errors: [{ msg: "Email is invalid" }, { msg: "other" }] } } };
  assert.equal(getErrorMessage(err), "Email is invalid");
});

test("ignores an empty validation errors array", () => {
  assert.equal(getErrorMessage({ response: { data: { errors: [] } } }), "Something went wrong");
});

test("reports network errors with a connectivity hint", () => {
  assert.match(getErrorMessage({ code: "ERR_NETWORK" }), /Cannot reach the server/);
});

test("API message wins over a network error code", () => {
  const err = { code: "ERR_NETWORK", response: { data: { message: "Boom" } } };
  assert.equal(getErrorMessage(err), "Boom");
});

test("uses the default or a custom fallback for unknown errors", () => {
  assert.equal(getErrorMessage(new Error("x")), "Something went wrong");
  assert.equal(getErrorMessage({}, "Registration failed"), "Registration failed");
});

test("is safe on null and undefined", () => {
  assert.equal(getErrorMessage(null), "Something went wrong");
  assert.equal(getErrorMessage(undefined, "fallback"), "fallback");
});

test("getErrorCode reads the API error code and is null-safe", () => {
  assert.equal(getErrorCode({ response: { data: { code: "INSUFFICIENT_FUNDS" } } }), "INSUFFICIENT_FUNDS");
  assert.equal(getErrorCode({ response: { data: {} } }), undefined);
  assert.equal(getErrorCode(null), undefined);
});

test("friendly message: fixed text for session/e-mail codes", () => {
  const verify = { response: { data: { code: "EMAIL_NOT_VERIFIED", message: "Email not verified" } } };
  assert.equal(getFriendlyErrorMessage(verify), "Verify your e-mail to make changes");
  const reused = { response: { data: { code: "REFRESH_TOKEN_REUSED" } } };
  assert.match(getFriendlyErrorMessage(reused), /sign in again/);
});

test("friendly message: API detail plus a hint for balance codes", () => {
  const err = { response: { data: { code: "INSUFFICIENT_FUNDS", message: "Insufficient funds: balance would be -5.00." } } };
  assert.equal(
    getFriendlyErrorMessage(err),
    "Insufficient funds: balance would be -5.00. Lower the amount, pick another account or allow overdraft on it."
  );
  const conflict = { response: { data: { code: "OVERDRAFT_LIMIT_CONFLICT", message: "The balance (-20.00) exceeds the overdraft limit" } } };
  assert.match(getFriendlyErrorMessage(conflict), /exceeds the overdraft limit\. Add money/);
});

test("friendly message: other errors behave like getErrorMessage", () => {
  assert.equal(getFriendlyErrorMessage({ response: { data: { message: "Nope" } } }), "Nope");
  assert.equal(getFriendlyErrorMessage({}, "Custom"), "Custom");
  assert.equal(getFriendlyErrorMessage(undefined), "Something went wrong");
});
