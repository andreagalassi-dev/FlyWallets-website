const { HttpError } = require("../utils/httpError");
const {
  parseCsv,
  detectDelimiter,
  restoreFormula,
  parseAmount,
  detectDecimalSeparator,
  parseDate,
  detectDateFormat,
} = require("./csvService");
const { recordTransaction } = require("./ledgerService");
const { categorizeTransaction } = require("./aiService");

const MAX_CSV_BYTES = 1024 * 1024;
const MAX_ROWS = 2000;
const MAX_COLUMNS = 200; // per record; bank exports have < 30. Bounds every per-row / per-column step below
const HEADER_SCAN_ROWS = 20;
const PREVIEW_ROWS = 10;
const FIELDS = ["date", "amount", "debit", "credit", "description", "type", "category", "notes", "tags"];

// ---------------------------------------------------------------------------
// Header recognition (English + Italian). Order = priority when several headers match.
// ---------------------------------------------------------------------------
const SYNONYMS = {
  date: ["date", "data operazione", "data", "transaction date", "booking date", "posting date", "data contabile",
    "data movimento", "data transazione", "data registrazione", "valuta", "data valuta", "value date"],
  amount: ["amount", "importo", "ammontare", "importo eur", "importo in eur", "totale", "value", "valore", "somma"],
  debit: ["dare", "uscite", "uscita", "debit", "debits", "addebiti", "addebito", "withdrawal", "withdrawals", "money out", "paid out"],
  credit: ["avere", "entrate", "entrata", "credit", "credits", "accrediti", "accredito", "deposit", "deposits", "money in", "paid in"],
  description: ["description", "descrizione", "causale", "dettagli", "dettaglio", "details", "descrizione operazione",
    "memo", "narrative", "payee", "beneficiario", "merchant"],
  type: ["type", "tipo", "transaction type", "tipo operazione", "tipologia", "direction", "segno"],
  category: ["category", "categoria"],
  notes: ["notes", "note", "nota", "annotazioni", "comment", "comments", "commenti"],
  tags: ["tags", "tag", "etichette"],
};

const normHeader = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

// A header cell longer than this is not a header: only its prefix is normalised (keeps the header scan linear)
const MAX_HEADER_CHARS = 200;
const normCell = (s) => normHeader(String(s ?? "").slice(0, MAX_HEADER_CHARS));

/** Appends column index `i` to the (ascending) index list of `key`. */
const addIndex = (map, key, i) => {
  const list = map.get(key);
  if (list) list.push(i);
  else map.set(key, [i]);
};

/**
 * Maps every field to a column index using header names. Exact match first, then whole-word containment.
 * Every header is normalised and tokenised ONCE into lookup maps (normalised header -> columns, word ->
 * columns), so the cost is O(total header length + synonyms) instead of O(columns x synonyms x words).
 */
const autoMap = (headers) => {
  const byExact = new Map();
  const byWord = new Map();
  headers.forEach((h, i) => {
    const norm = normCell(h);
    if (!norm) return;
    addIndex(byExact, norm, i);
    for (const word of new Set(norm.split(" "))) addIndex(byWord, word, i);
  });

  const used = new Set();
  const out = {};
  const pass = (lookup, accept) => {
    for (const field of FIELDS) {
      if (out[field] !== undefined) continue;
      for (const syn of SYNONYMS[field]) {
        if (!accept(syn)) continue;
        const idx = (lookup.get(syn) || []).find((i) => !used.has(i));
        if (idx !== undefined) {
          out[field] = idx;
          used.add(idx);
          break;
        }
      }
    }
  };
  pass(byExact, () => true);
  pass(byWord, (syn) => syn.length > 3); // e.g. "data operazione (gg/mm)"
  return out;
};

const hasRequired = (m) => m.date !== undefined && m.description !== undefined &&
  (m.amount !== undefined || m.debit !== undefined || m.credit !== undefined);

const resolveUserMapping = (userMapping, headers) => {
  const norm = headers.map(normCell);
  const out = {};
  for (const [field, ref] of Object.entries(userMapping || {})) {
    if (ref === null || ref === undefined || ref === "") continue;
    let idx;
    if (Number.isInteger(ref)) idx = ref;
    else idx = norm.indexOf(normCell(ref));
    if (idx < 0 || idx >= headers.length) {
      throw new HttpError(400, `mapping.${field}: column "${ref}" not found in the CSV header`);
    }
    out[field] = idx;
  }
  return out;
};

// ---------------------------------------------------------------------------
// Value helpers
// ---------------------------------------------------------------------------
const INCOME_WORDS = new Set(["income", "entrata", "entrate", "in", "credit", "credito", "avere", "accredito", "deposit", "e", "+", "cr", "c"]);
const EXPENSE_WORDS = new Set(["expense", "uscita", "uscite", "spesa", "out", "debit", "debito", "dare", "addebito", "withdrawal", "u", "-", "dr", "d"]);
const parseType = (raw) => {
  const v = normHeader(raw) || String(raw).trim();
  if (INCOME_WORDS.has(v)) return "income";
  if (EXPENSE_WORDS.has(v)) return "expense";
  return null;
};

// eslint-disable-next-line no-control-regex
const cleanLine = (s) => restoreFormula(String(s ?? "").trim()).replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
// eslint-disable-next-line no-control-regex
const cleanMultiline = (s) => restoreFormula(String(s ?? "").trim()).replace(/\u0000/g, "").trim();

const toDbDate = (ymd) => `${ymd}T12:00:00.000Z`; // midday UTC: the calendar day survives any timezone shift

// ---------------------------------------------------------------------------
// Parsing / analysis (pure, no DB)
// ---------------------------------------------------------------------------

/**
 * Turns the raw CSV text into normalised rows plus the detected settings.
 * @returns {{detected: object, rows: Array}}  rows: {row, date, cents, type, description, categoryName, notes, tags, error?}
 */
const analyzeCsv = (csv, options = {}) => {
  if (Buffer.byteLength(csv, "utf8") > MAX_CSV_BYTES) throw new HttpError(400, "CSV is larger than 1 MB");
  const text = csv.charCodeAt(0) === 0xfeff ? csv.slice(1) : csv;

  const delimiter = !options.delimiter || options.delimiter === "auto"
    ? detectDelimiter(text, { maxFields: MAX_COLUMNS })
    : options.delimiter;
  let records;
  try {
    records = parseCsv(text, { delimiter, maxFields: MAX_COLUMNS });
  } catch (err) {
    if (err.code === "CSV_UNTERMINATED_QUOTE") throw new HttpError(400, "Malformed CSV: unterminated quoted field");
    if (err.code === "CSV_TOO_MANY_FIELDS") {
      throw new HttpError(400, `CSV has a row with more than ${MAX_COLUMNS} columns (check the delimiter)`);
    }
    throw err;
  }
  if (records.length < 2) throw new HttpError(400, "CSV must contain a header row and at least one data row");

  // Locate header + column mapping
  const hasUserMapping = options.mapping && Object.values(options.mapping).some((v) => v !== null && v !== undefined && v !== "");
  let headerIdx = -1;
  let map = {};
  if (hasUserMapping) {
    headerIdx = 0;
    const user = resolveUserMapping(options.mapping, records[0]);
    map = { ...autoMap(records[0]), ...user };
    // explicit amount mapping disables auto-detected debit/credit (and vice versa)
    if (user.amount !== undefined && user.debit === undefined && user.credit === undefined) { delete map.debit; delete map.credit; }
    if ((user.debit !== undefined || user.credit !== undefined) && user.amount === undefined) delete map.amount;
  } else {
    for (let i = 0; i < Math.min(records.length, HEADER_SCAN_ROWS); i += 1) {
      const candidate = autoMap(records[i]);
      if (hasRequired(candidate)) {
        headerIdx = i;
        map = candidate;
        break;
      }
    }
  }
  if (headerIdx < 0 || !hasRequired(map)) {
    const first = (records[0] || []).slice(0, 12).map((h) => String(h).slice(0, 40)).join(", ");
    throw new HttpError(
      400,
      `Could not detect the date, amount and description columns. Provide a "mapping". Header found: ${first}`
    );
  }
  if (map.amount !== undefined) { delete map.debit; delete map.credit; }
  const headers = records[headerIdx];

  const dataRecords = [];
  records.slice(headerIdx + 1).forEach((cells, i) => {
    if (cells.every((c) => String(c).trim() === "")) return;
    dataRecords.push({ row: headerIdx + 2 + i, cells });
  });
  if (dataRecords.length === 0) throw new HttpError(400, "CSV has no data rows");
  if (dataRecords.length > MAX_ROWS) throw new HttpError(400, `CSV has more than ${MAX_ROWS} data rows`);

  const cell = (r, field) => (map[field] === undefined ? "" : String(r.cells[map[field]] ?? "").trim());

  const dateFormat = options.date_format && options.date_format !== "auto"
    ? options.date_format
    : detectDateFormat(dataRecords.map((r) => cell(r, "date")).filter(Boolean));
  const moneyCells = dataRecords.flatMap((r) => ["amount", "debit", "credit"].map((f) => cell(r, f)).filter(Boolean));
  const decimalSeparator = options.decimal_separator && options.decimal_separator !== "auto"
    ? options.decimal_separator
    : detectDecimalSeparator(moneyCells);

  const rows = dataRecords.map((r) => {
    const out = { row: r.row, date: null, cents: null, type: null, description: "", categoryName: null, notes: null, tags: [] };
    const fail = (message) => ({ ...out, error: message });

    const date = parseDate(cell(r, "date"), dateFormat);
    if (!date) return fail(`invalid date "${cell(r, "date").slice(0, 30)}"`);
    out.date = date;

    // Amount + type
    if (map.amount !== undefined) {
      const a = parseAmount(cell(r, "amount"), decimalSeparator);
      if (a.error) return fail(a.error);
      if (a.cents === 0) return fail("amount cannot be zero");
      if (map.type !== undefined && cell(r, "type") !== "") {
        const t = parseType(cell(r, "type"));
        if (!t) return fail(`unknown type "${cell(r, "type").slice(0, 20)}"`);
        out.type = t;
      } else {
        out.type = a.cents < 0 ? "expense" : "income";
      }
      out.cents = Math.abs(a.cents);
    } else {
      const d = cell(r, "debit") ? parseAmount(cell(r, "debit"), decimalSeparator) : { cents: 0 };
      const c = cell(r, "credit") ? parseAmount(cell(r, "credit"), decimalSeparator) : { cents: 0 };
      if (d.error) return fail(`debit: ${d.error}`);
      if (c.error) return fail(`credit: ${c.error}`);
      if (d.cents && c.cents) return fail("both debit and credit are filled");
      if (!d.cents && !c.cents) return fail("amount is empty");
      out.type = d.cents ? "expense" : "income";
      out.cents = Math.abs(d.cents || c.cents);
    }

    out.description = cleanLine(cell(r, "description")).slice(0, 255);
    if (!out.description) return fail("description is required");
    out.categoryName = cleanLine(cell(r, "category")).slice(0, 60) || null;
    out.notes = cleanMultiline(cell(r, "notes")).slice(0, 1000) || null;
    out.tags = cell(r, "tags")
      .split(/[|]/)
      .map((t) => cleanLine(t).slice(0, 30))
      .filter(Boolean)
      .slice(0, 10);
    return out;
  });

  const mappingNames = {};
  for (const f of FIELDS) mappingNames[f] = map[f] === undefined ? null : String(headers[map[f]] ?? "").trim();

  return {
    detected: { delimiter, date_format: dateFormat, decimal_separator: decimalSeparator, mapping: mappingNames },
    rows,
  };
};

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

const dupKey = (date, cents, type, description) => `${date}|${cents}|${type}|${description.trim().toLowerCase()}`;

/**
 * Applies the parsed rows to the account. Must run inside req.withUser (one DB transaction).
 * Every row has its own SAVEPOINT; with dryRun everything is rolled back at the end.
 */
/**
 * 404 / 409 unless the account exists, belongs to the user and is not archived. With `lock` the row is
 * locked FOR UPDATE until the end of the transaction.
 */
const assertImportableAccount = async (db, userId, accountId, { lock = false } = {}) => {
  const acc = await db.query(
    `SELECT id, is_archived FROM manual_accounts WHERE id = $1 AND user_id = $2${lock ? " FOR UPDATE" : ""}`,
    [accountId, userId]
  );
  if (!acc.rows[0]) throw new HttpError(404, "Account not found");
  if (acc.rows[0].is_archived) throw new HttpError(409, "Account is archived");
};

const applyImport = async (db, userId, accountId, rows, { dryRun = false } = {}) => {
  // Lock the account BEFORE reading the existing rows used for de-duplication: concurrent imports into the
  // same account are serialised, and the second one (READ COMMITTED: every statement takes a fresh snapshot)
  // sees the first one's committed rows and skips them as duplicates instead of applying them twice.
  await assertImportableAccount(db, userId, accountId, { lock: true });

  const cats = (await db.query(
    `SELECT id, category_name, category_type, icon_emoji, is_system FROM transaction_categories
      WHERE is_active = true AND (is_system = true OR user_id = $1)`,
    [userId]
  )).rows;
  const catByName = new Map(cats.map((c) => [c.category_name.trim().toLowerCase(), c]));

  // Existing transactions in the imported date window -> multiset of duplicate keys
  const valid = rows.filter((r) => !r.error);
  const existing = new Map();
  if (valid.length) {
    const dates = valid.map((r) => r.date).sort();
    const { rows: ex } = await db.query(
      `SELECT transaction_date::date::text AS d, amount, transaction_type, description, COUNT(*)::int AS n
         FROM transactions
        WHERE user_id = $1 AND manual_account_id = $2
          AND transaction_date >= $3::date AND transaction_date < ($4::date + 1)
        GROUP BY 1, 2, 3, 4`,
      [userId, accountId, dates[0], dates[dates.length - 1]]
    );
    for (const e of ex) {
      const k = dupKey(e.d, Math.round(e.amount * 100), e.transaction_type, e.description);
      existing.set(k, (existing.get(k) || 0) + e.n);
    }
  }

  await db.query("SAVEPOINT import_all");

  // Oldest first, incomes before expenses on the same day (friendlier to overdraft checks), then file order
  const order = [...valid].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1
      : a.type !== b.type ? (a.type === "income" ? -1 : 1) : a.row - b.row);

  for (const r of order) {
    const key = dupKey(r.date, r.cents, r.type, r.description);
    const left = existing.get(key) || 0;
    if (left > 0) {
      existing.set(key, left - 1);
      r.status = "duplicate";
      continue;
    }

    // Category: mapped name (when visible and compatible with the type) else keyword engine
    let cat = r.categoryName ? catByName.get(r.categoryName.toLowerCase()) : null;
    if (cat && cat.category_type !== "both" && cat.category_type !== r.type) cat = null;
    if (!cat) {
      const guess = await categorizeTransaction(r.description, r.cents / 100, cats, { type: r.type, keywordsOnly: true });
      cat = guess ? cats.find((c) => c.id === guess.category_id) : null;
    }

    await db.query("SAVEPOINT import_row");
    try {
      await recordTransaction(db, userId, {
        manualAccountId: accountId,
        date: toDbDate(r.date),
        amount: r.cents / 100,
        type: r.type,
        description: r.description,
        categoryId: cat?.id,
        notes: r.notes,
        tags: r.tags,
      });
      await db.query("RELEASE SAVEPOINT import_row");
      r.status = "imported";
      r.resolvedCategory = cat ? { id: cat.id, name: cat.category_name, emoji: cat.icon_emoji } : null;
    } catch (err) {
      await db.query("ROLLBACK TO SAVEPOINT import_row");
      await db.query("RELEASE SAVEPOINT import_row");
      r.status = "error";
      r.error = err.status && err.status < 500 ? err.message : "Could not import this row";
    }
  }

  if (dryRun) await db.query("ROLLBACK TO SAVEPOINT import_all");
  await db.query("RELEASE SAVEPOINT import_all");
};

/** Builds the API report from processed rows. */
const buildReport = (rows, detected, dryRun) => {
  const errors = rows.filter((r) => r.error).map((r) => ({ row: r.row, message: r.error }));
  return {
    dry_run: dryRun,
    total_rows: rows.length,
    imported: rows.filter((r) => r.status === "imported").length,
    skipped_duplicates: rows.filter((r) => r.status === "duplicate").length,
    errors,
    preview: rows.slice(0, PREVIEW_ROWS).map((r) => ({
      row: r.row,
      date: r.date,
      amount: r.cents === null ? null : r.cents / 100,
      type: r.type,
      description: r.description || null,
      category: r.resolvedCategory?.name ?? r.categoryName ?? null,
      notes: r.notes,
      tags: r.tags,
      status: r.error ? "error" : r.status || "pending",
      ...(r.error ? { error: r.error } : {}),
    })),
    detected,
  };
};

module.exports = { MAX_CSV_BYTES, MAX_ROWS, MAX_COLUMNS, analyzeCsv, assertImportableAccount, applyImport, buildReport };
