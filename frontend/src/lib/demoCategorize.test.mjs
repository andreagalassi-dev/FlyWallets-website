import { test } from "node:test";
import assert from "node:assert/strict";
import { categorize } from "./demoCategorize.js";

test("matches supermarkets, phone top-ups and salary like the backend keyword engine", () => {
  assert.deepEqual(categorize("POS Esselunga Milano Via Foppa", "expense"), {
    name: "Cibo & Ristoranti",
    type: "expense",
    keyword: "esselunga",
  });
  assert.equal(categorize("Ricarica Iliad online", "expense").name, "Utenze");
  assert.equal(categorize("Bonifico stipendio ottobre", "income").name, "Stipendio");
});

test("respects the transaction type when it is known", () => {
  assert.equal(categorize("Regalo compleanno", "income").name, "Regalo");
  assert.equal(categorize("Regalo compleanno", "expense").name, "Regali");
});

test("falls back to the generic category without a keyword", () => {
  assert.deepEqual(categorize("xyz 123"), { name: "Varie", type: "expense", keyword: null });
  assert.equal(categorize("", "income").name, "Altro Reddito");
});
