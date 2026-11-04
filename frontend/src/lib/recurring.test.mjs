import { test } from "node:test";
import assert from "node:assert/strict";
import { countOf, frequencyLabel, listingToastMessage, processResultToast, ruleWarning, resumeErrorHint } from "./recurring.js";

test("countOf handles numbers, arrays and junk", () => {
  assert.equal(countOf(3), 3);
  assert.equal(countOf([1, 2]), 2);
  assert.equal(countOf(undefined), 0);
  assert.equal(countOf(-1), 0);
});

test("frequencyLabel", () => {
  assert.equal(frequencyLabel("monthly"), "Monthly");
  assert.equal(frequencyLabel("custom"), "custom");
});

test("listingToastMessage only speaks when something was created", () => {
  assert.equal(listingToastMessage({ created: 0 }), null);
  assert.equal(listingToastMessage(undefined), null);
  assert.equal(listingToastMessage({ created: 1 }), "1 recurring transaction was added");
  assert.equal(listingToastMessage({ created: 4 }), "4 recurring transactions were added");
});

test("processResultToast covers success, errors, pending and no-op", () => {
  assert.deepEqual(processResultToast({ created: [], errors: [], pending: 0 }).type, "info");
  const ok = processResultToast({ created: [{}, {}], errors: [], pending: 0 });
  assert.equal(ok.type, "success");
  assert.match(ok.message, /2 transactions created/);
  const failed = processResultToast({ created: [], errors: [{}], pending: 0 });
  assert.equal(failed.type, "error");
  assert.match(failed.message, /1 failed/);
  const more = processResultToast({ created: [{}], errors: [], pending: 5 });
  assert.match(more.message, /5 more are still due/);
});

test("ruleWarning adds the right retry hint", () => {
  assert.equal(ruleWarning({ last_error: null }), null);
  assert.match(ruleWarning({ last_error: "Insufficient funds." }), /allow overdraft/);
  assert.match(ruleWarning({ last_error: "Category deleted" }), /Fix the issue/);
});

test("resumeErrorHint only decorates 422", () => {
  assert.match(resumeErrorHint(422, "Rule ended"), /end date forward/);
  assert.equal(resumeErrorHint(500, "boom"), "boom");
});
