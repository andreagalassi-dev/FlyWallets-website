import { test } from "node:test";
import assert from "node:assert/strict";
import { overdraftFormState, overdraftPayload, overdraftLabel } from "./overdraft.js";

test("form state reflects the account (null limit = empty field)", () => {
  assert.deepEqual(overdraftFormState({ overdraft_allowed: true, overdraft_limit: "250.00" }), { overdraft_allowed: true, overdraft_limit: "250" });
  assert.deepEqual(overdraftFormState({ overdraft_allowed: true, overdraft_limit: null }), { overdraft_allowed: true, overdraft_limit: "" });
  assert.deepEqual(overdraftFormState(undefined), { overdraft_allowed: false, overdraft_limit: "" });
});

test("payload: disabled sends only the flag", () => {
  assert.deepEqual(overdraftPayload({ overdraft_allowed: false, overdraft_limit: "100" }), { overdraft_allowed: false });
});

test("payload: enabled with empty limit means unlimited (null)", () => {
  assert.deepEqual(overdraftPayload({ overdraft_allowed: true, overdraft_limit: "" }), { overdraft_allowed: true, overdraft_limit: null });
  assert.deepEqual(overdraftPayload({ overdraft_allowed: true, overdraft_limit: "  " }), { overdraft_allowed: true, overdraft_limit: null });
});

test("payload: enabled with a limit sends a number (0 is a valid limit)", () => {
  assert.deepEqual(overdraftPayload({ overdraft_allowed: true, overdraft_limit: "500.5" }), { overdraft_allowed: true, overdraft_limit: 500.5 });
  assert.deepEqual(overdraftPayload({ overdraft_allowed: true, overdraft_limit: "0" }), { overdraft_allowed: true, overdraft_limit: 0 });
});

test("label: none when off, unlimited vs capped when on", () => {
  assert.equal(overdraftLabel({ overdraft_allowed: false }), null);
  assert.equal(overdraftLabel(null), null);
  assert.equal(overdraftLabel({ overdraft_allowed: true, overdraft_limit: null }), "Overdraft allowed");
  assert.match(overdraftLabel({ overdraft_allowed: true, overdraft_limit: 300, currency: "EUR" }), /^Overdraft up to .*300/);
});
