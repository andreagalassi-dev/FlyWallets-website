// Client-side copy of the backend's deterministic keyword engine
// (backend/src/services/aiService.js, KEYWORD_RULES), used only by the public landing page demo.
// It never calls the API: the real categorisation happens server-side on POST /transactions.
// Category names match the system categories seeded in database/schema.sql.

const RULES = [
  // income
  { name: "Stipendio", type: "income", re: /stipendio|salary|cedolino|emolument|busta paga/ },
  { name: "Bonus", type: "income", re: /bonus|premio|incentiv/ },
  { name: "Rimborso", type: "income", re: /rimborso|refund|storno|cashback/ },
  { name: "Interesse", type: "income", re: /interess|interest/ },
  { name: "Investimenti", type: "income", re: /dividend|cedola|etf|plusvalenz|investiment|azioni/ },
  { name: "Regalo", type: "income", re: /regalo|gift/ },
  // expense
  { name: "Affitto & Alloggio", type: "expense", re: /affitto|mutuo|condomini|locazione|rent\b/ },
  { name: "Commissioni Bancarie", type: "expense", re: /commission|canone conto|imposta di bollo|bollo conto|spese tenuta|tenuta conto/ },
  { name: "Pagamenti Carte", type: "expense", re: /saldo carta|carta di credito|american express|amex|nexi|visa revolving/ },
  { name: "Utenze", type: "expense", re: /enel|plenitude|a2a|hera\b|iren\b|bolletta|\bluce\b|\bgas\b|\bacqua\b|iliad|\btim\b|vodafone|windtre|wind tre|fastweb|ricarica|internet|telefon|sky\b/ },
  { name: "Trasporti & Auto", type: "expense", re: /benzina|carburante|diesel|q8|tamoil|eni station|autostrad|telepass|trenitalia|italo|\batm\b|atac|taxi|uber|parcheggio|assicurazione auto|bollo auto|metro|\bbus\b|flixbus|bolt/ },
  { name: "Cibo & Ristoranti", type: "expense", re: /esselunga|coop|conad|carrefour|lidl|eurospin|\bpam\b|supermerc|ristorant|pizzeri|trattori|osteri|mcdonald|burger|sushi|glovo|deliveroo|just ?eat|panific|macelleri|\bspesa\b|\bbar\b|caff[eè]|pasticceri|gelateri/ },
  { name: "Salute & Medicina", type: "expense", re: /farmaci|medic|dentist|ospedal|analisi|clinica|ticket sanitar|oculist|fisioterap/ },
  { name: "Educazione", type: "expense", re: /libri|libreria|corso|universit|scuola|udemy|coursera|tasse scolast|master\b/ },
  { name: "Viaggi", type: "expense", re: /hotel|booking|airbnb|ryanair|easyjet|\bvolo\b|vacanz|ita airways|alitalia|volotea|expedia/ },
  { name: "Bellezza & Cura Personale", type: "expense", re: /parrucchier|barbier|estetist|sephora|profumeri|spa\b|manicure/ },
  { name: "Animali Domestici", type: "expense", re: /veterinari|crocchette|animali|pet shop|arcaplanet/ },
  { name: "Giochi & Divertimento", type: "expense", re: /steam|playstation|xbox|nintendo|app store|google play|videogioc|twitch/ },
  { name: "Intrattenimento & Hobby", type: "expense", re: /netflix|spotify|disney|prime video|dazn|youtube premium|cinema|teatro|concert|abbonament|palestra|museo|apple music/ },
  { name: "Abbigliamento & Accessori", type: "expense", re: /zara|h&m|nike|adidas|abbigliament|scarpe|borsa|zalando|uniqlo|calzedonia/ },
  { name: "Pulizia & Manutenzione", type: "expense", re: /idraulic|elettricist|pulizi|detersiv|manutenzion|bricoman|leroy merlin|brico/ },
  { name: "Shopping & Negozi", type: "expense", re: /amazon|ikea|mediaworld|unieuro|ebay|aliexpress|shein|negozio/ },
  { name: "Regali", type: "expense", re: /regalo|gift/ },
];

export const FALLBACK = { income: "Altro Reddito", expense: "Varie" };

/**
 * @param {string} description  raw bank statement line
 * @param {'income'|'expense'|null} [type]  restricts the rules when known
 * @returns {{ name: string, type: 'income'|'expense', keyword: string | null }}
 */
export function categorize(description, type = null) {
  const text = String(description || "").toLowerCase();
  const rules = type ? RULES.filter((r) => r.type === type) : RULES;
  for (const rule of rules) {
    const match = text.match(rule.re);
    if (match) return { name: rule.name, type: rule.type, keyword: match[0].trim() };
  }
  const fallbackType = type || "expense";
  return { name: FALLBACK[fallbackType], type: fallbackType, keyword: null };
}
