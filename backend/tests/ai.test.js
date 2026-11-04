const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.NODE_ENV = "test";
const ai = require("../src/services/aiService");

const mk = (category_name, category_type, is_system = true) => ({
  id: `id-${category_name}`,
  category_name,
  category_type,
  icon_emoji: "x",
  is_system,
});
const CATEGORIES = [
  mk("Stipendio", "income"),
  mk("Altro Reddito", "income"),
  mk("Cibo & Ristoranti", "expense"),
  mk("Utenze", "expense"),
  mk("Intrattenimento & Hobby", "expense"),
  mk("Trasporti & Auto", "expense"),
  mk("Varie", "expense"),
];

test("keyword engine categorizes common Italian descriptions", async () => {
  const cases = [
    ["Esselunga Milano", 54.2, "Cibo & Ristoranti"],
    ["Ricarica Iliad", 9.99, "Utenze"],
    ["Bonifico Stipendio", 2000, "Stipendio"],
    ["Netflix abbonamento", 12.99, "Intrattenimento & Hobby"],
    ["Telepass autostrada", 18, "Trasporti & Auto"],
    ["Qualcosa di sconosciuto", 10, "Varie"],
  ];
  for (const [description, amount, expected] of cases) {
    const type = expected === "Stipendio" ? "income" : "expense";
    const out = await ai.categorizeTransaction(description, amount, CATEGORIES, { type });
    assert.equal(out.category_name, expected, description);
    assert.equal(out.source, "keywords");
  }
});

test("a user's custom category wins when its name appears in the description", async () => {
  const cats = [...CATEGORIES, mk("Palestra", "expense", false)];
  const out = await ai.categorizeTransaction("Rinnovo palestra annuale", 300, cats, { type: "expense" });
  assert.equal(out.category_name, "Palestra");
});

test("insights fall back to deterministic tips (exactly 3)", async () => {
  const empty = await ai.generateInsights({ income: 0, expense: 0, byCategory: [] }, "en");
  assert.equal(empty.source, "rules");
  assert.equal(empty.tips.length, 3);

  const stats = { income: 2000, expense: 1900, byCategory: [{ name: "Viaggi", total: 1200 }, { name: "Utenze", total: 700 }] };
  const res = await ai.generateInsights(stats, "it");
  assert.equal(res.tips.length, 3);
  assert.match(res.tips[0].title, /Viaggi/);
});
