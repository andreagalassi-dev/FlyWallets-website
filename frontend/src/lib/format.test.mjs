import { test } from "node:test";
import assert from "node:assert/strict";
import { formatCurrency, formatDate, todayInputValue, toDateInputValue } from "./format.js";

// Intl uses a non-breaking space between number and symbol, normalise for readable assertions
const norm = (s) => s.replace(/ /g, " ");

test("formatCurrency formats EUR with it-IT separators", () => {
  assert.equal(norm(formatCurrency(12345.5)), "12.345,50 €");
});

test("formatCurrency handles negatives and rounds to cents", () => {
  assert.equal(norm(formatCurrency(-10.5)), "-10,50 €");
  assert.equal(norm(formatCurrency(0.1 + 0.2)), "0,30 €");
});

test("formatCurrency accepts numeric strings (API DECIMAL columns)", () => {
  assert.equal(norm(formatCurrency("99.9")), "99,90 €");
});

test("formatCurrency falls back to zero for invalid input", () => {
  assert.equal(norm(formatCurrency(undefined)), "0,00 €");
  assert.equal(norm(formatCurrency(null)), "0,00 €");
  assert.equal(norm(formatCurrency("abc")), "0,00 €");
});

test("formatCurrency supports other currencies", () => {
  assert.match(norm(formatCurrency(5, "USD")), /^5,00 (US\$|USD|\$)$/);
});

test("formatDate returns an empty string for empty values", () => {
  assert.equal(formatDate(""), "");
  assert.equal(formatDate(null), "");
  assert.equal(formatDate(undefined), "");
});

test("formatDate keeps the calendar day of a YYYY-MM-DD value (no timezone shift)", () => {
  const out = formatDate("2025-03-15");
  assert.match(out, /^15 /);
  assert.match(out, /2025$/);
  assert.match(out, /mar/i);
  // first and last day of year must not slip into a neighbouring year
  assert.match(formatDate("2025-01-01"), /^01 .*2025$/);
  assert.match(formatDate("2025-12-31"), /^31 .*2025$/);
});

test("formatDate parses full ISO timestamps", () => {
  const out = formatDate("2025-06-10T12:00:00.000Z");
  assert.match(out, /2025$/);
  assert.match(out, /giu/i);
});

test("todayInputValue returns a zero-padded local YYYY-MM-DD", () => {
  const value = todayInputValue();
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/);
  const d = new Date();
  assert.equal(Number(value.slice(0, 4)), d.getFullYear());
  assert.equal(Number(value.slice(5, 7)), d.getMonth() + 1);
  assert.equal(Number(value.slice(8, 10)), d.getDate());
});

test("toDateInputValue keeps plain dates and converts timestamps to the local day", () => {
  assert.equal(toDateInputValue("2026-03-05"), "2026-03-05");
  const local = new Date(2026, 2, 5, 23, 30);
  assert.equal(toDateInputValue(local.toISOString()), "2026-03-05");
  assert.equal(toDateInputValue(""), "");
  assert.equal(toDateInputValue(null), "");
  assert.equal(toDateInputValue("garbage"), "");
});
