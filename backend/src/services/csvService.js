/**
 * Dependency-free CSV toolkit (RFC 4180): parser, serializer, formula-injection guard and the
 * number / date helpers shared by the transaction export and import.
 */

const DELIMITERS = [",", ";", "\t", "|"];

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * Parses CSV text into an array of records (arrays of strings).
 * Handles quoted fields, escaped quotes (""), delimiters / CR / LF inside quotes, CRLF, LF and bare CR
 * record separators and a leading UTF-8 BOM. Records made of a single empty field (blank lines) are skipped.
 * Throws an Error with `.code = "CSV_UNTERMINATED_QUOTE"` when a quoted field is never closed, and with
 * `.code = "CSV_TOO_MANY_FIELDS"` (plus `.maxFields`) as soon as one record exceeds `maxFields` fields: a
 * 1 MB file of delimiters would otherwise become ~1M columns that every later step has to walk.
 * Single pass, O(input length).
 * @param {string} text
 * @param {{delimiter?: string, maxRecords?: number, maxFields?: number}} [opts] maxRecords stops early (used for sniffing)
 * @returns {string[][]}
 */
const parseCsv = (text, { delimiter = ",", maxRecords = Infinity, maxFields = Infinity } = {}) => {
  const records = [];
  let record = [];
  let field = "";
  let inQuotes = false;
  let fieldStart = true; // true until the first char of the current field is consumed
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  const n = text.length;

  const endField = () => {
    if (record.length >= maxFields) {
      const err = new Error(`CSV record has more than ${maxFields} fields`);
      err.code = "CSV_TOO_MANY_FIELDS";
      err.maxFields = maxFields;
      throw err;
    }
    record.push(field);
    field = "";
    fieldStart = true;
  };
  const endRecord = () => {
    endField();
    if (!(record.length === 1 && record[0] === "")) records.push(record);
    record = [];
  };

  while (i < n) {
    if (inQuotes) {
      // Copy the whole run up to the next quote at once (no per-character string building)
      const q = text.indexOf('"', i);
      if (q < 0) {
        field += text.slice(i);
        break; // unterminated: reported below
      }
      field += text.slice(i, q);
      if (text[q + 1] === '"') {
        field += '"';
        i = q + 2;
      } else {
        inQuotes = false;
        i = q + 1;
      }
      continue;
    }
    const ch = text[i];
    if (ch === '"' && fieldStart) {
      inQuotes = true;
      fieldStart = false;
      i += 1;
    } else if (ch === delimiter) {
      endField();
      i += 1;
    } else if (ch === "\r" || ch === "\n") {
      endRecord();
      if (records.length >= maxRecords) return records;
      i += ch === "\r" && text[i + 1] === "\n" ? 2 : 1;
    } else {
      // Plain run: everything up to the next delimiter / line break (a quote inside it is literal)
      let j = i + 1;
      while (j < n) {
        const c = text[j];
        if (c === delimiter || c === "\r" || c === "\n") break;
        j += 1;
      }
      field += text.slice(i, j);
      fieldStart = false;
      i = j;
    }
  }
  if (inQuotes) {
    const err = new Error("Unterminated quoted field in CSV");
    err.code = "CSV_UNTERMINATED_QUOTE";
    throw err;
  }
  if (field !== "" || record.length > 0) endRecord();
  return records;
};

/**
 * Picks the most plausible delimiter by checking how consistently each candidate splits the first rows.
 * A candidate that fails to parse (unterminated quote, more than `maxFields` fields) is not considered.
 */
const detectDelimiter = (text, { maxFields = Infinity } = {}) => {
  let best = { delimiter: ",", score: -1 };
  for (const delimiter of DELIMITERS) {
    let rows;
    try {
      rows = parseCsv(text, { delimiter, maxRecords: 15, maxFields });
    } catch {
      continue;
    }
    if (!rows.length || rows[0].length < 2) continue;
    const width = rows[0].length;
    const consistent = rows.filter((r) => r.length === width).length;
    const score = consistent * 1000 + width; // consistency first, then more columns
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
};

// ---------------------------------------------------------------------------
// Serializer + injection guard
// ---------------------------------------------------------------------------

/**
 * Neutralises spreadsheet formula injection: a text cell that starts with = + - @ TAB or CR gets a
 * leading apostrophe so Excel / Sheets / LibreOffice treat it as plain text.
 */
const neutralizeFormula = (value) => {
  const s = value == null ? "" : String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
};

/** Reverses neutralizeFormula (used on import so an export -> import round trip is lossless). */
const restoreFormula = (value) => (/^'[=+\-@\t\r]/.test(value) ? value.slice(1) : value);

/** Quotes a single already-sanitised cell when needed. */
const quoteCell = (value, delimiter) => {
  const s = value == null ? "" : String(value);
  return s.includes('"') || s.includes(delimiter) || s.includes("\n") || s.includes("\r")
    ? `"${s.replace(/"/g, '""')}"`
    : s;
};

/** Serializes one record to a CSV line (without the line terminator). */
const serializeRow = (cells, delimiter = ",") => cells.map((c) => quoteCell(c, delimiter)).join(delimiter);

// ---------------------------------------------------------------------------
// Amounts
// ---------------------------------------------------------------------------

const MAX_CENTS = 99999999999999n; // < 1e12 units, as enforced by the API validators

/**
 * Parse evidence for the decimal separator of a single amount cell: "," | "." | null (unknown).
 */
const decimalEvidence = (raw) => {
  const s = String(raw).replace(/[^\d.,]/g, "");
  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma >= 0 && lastDot >= 0) return lastComma > lastDot ? "," : ".";
  const sep = lastComma >= 0 ? "," : lastDot >= 0 ? "." : null;
  if (!sep) return null;
  const parts = s.split(sep);
  if (parts.length > 2) return null; // repeated => thousands separator
  const decimals = parts[1].length;
  if (decimals === 3) return null; // ambiguous: 1.234 / 1,234 read as thousands
  return decimals >= 1 && decimals <= 2 ? sep : null;
};

/** Detects the decimal separator from all non-empty amount cells ("," wins only when "." has no evidence). */
const detectDecimalSeparator = (cells) => {
  let comma = 0;
  let dot = 0;
  for (const cell of cells) {
    const e = decimalEvidence(cell);
    if (e === ",") comma += 1;
    else if (e === ".") dot += 1;
  }
  return comma > dot ? "," : ".";
};

/**
 * Parses a money string into a signed integer number of cents (BigInt-safe, no float drift).
 * Accepts: "1234.56", "1.234,56", "€ 1.234,56", "-12,50", "+7", "(12.50)", "12,50-", "EUR 5", "1'234.50".
 * @returns {{cents: number} | {error: string}}
 */
const parseAmount = (raw, decimalSeparator = ".") => {
  let s = String(raw ?? "")
    .replace(/[\u00a0\u202f\s]/g, "")
    .replace(/[−‒–]/g, "-"); // unicode minus / dashes
  if (s === "") return { error: "amount is empty" };

  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  s = s.replace(/[€$£]|eur|usd|gbp|chf/gi, "");
  if (s.endsWith("-")) {
    negative = true; // trailing minus: 12,50-
    s = s.slice(0, -1);
  }
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,']+$/.test(s) || !/\d/.test(s)) return { error: `invalid amount "${String(raw).slice(0, 30)}"` };

  const thousands = decimalSeparator === "," ? /[.']/g : /[,']/g;
  s = s.replace(thousands, "");
  if (decimalSeparator === ",") s = s.replace(",", ".");
  if (!/^\d*\.?\d*$/.test(s) || s === ".") return { error: `invalid amount "${String(raw).slice(0, 30)}"` };

  const [intPart, frac = ""] = s.split(".");
  const trimmedFrac = frac.replace(/0+$/, "");
  if (trimmedFrac.length > 2) return { error: "amount has more than 2 decimals" };
  const cents = BigInt(intPart || "0") * 100n + BigInt((trimmedFrac + "00").slice(0, 2));
  if (cents > MAX_CENTS) return { error: "amount is too large" };
  const value = Number(cents);
  return { cents: negative ? -value : value };
};

// ---------------------------------------------------------------------------
// Dates
// ---------------------------------------------------------------------------

const validYmd = (y, m, d) => {
  if (y < 1900 || y > 2200 || m < 1 || m > 12 || d < 1) return false;
  return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
};
const pad = (n) => String(n).padStart(2, "0");
const fullYear = (yy) => (yy.length === 2 ? 2000 + Number(yy) : Number(yy));

/** Strips a trailing time part ("2026-03-04 10:22", "2026-03-04T10:22:00Z", "04/03/2026 10.22"). */
const dateOnly = (raw) => String(raw ?? "").trim().replace(/[T\s]+\d{1,2}[:.]\d{2}.*$/i, "").trim();

/**
 * Parses a date cell to "YYYY-MM-DD" (or null).
 * @param {string} raw
 * @param {'iso'|'dmy'|'mdy'} format
 */
const parseDate = (raw, format) => {
  const s = dateOnly(raw);
  let m;
  if (format === "iso") {
    m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s) || /^(\d{4})(\d{2})(\d{2})$/.exec(s);
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    return validYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
  }
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const y = fullYear(m[3]);
  const [d, mo] = format === "mdy" ? [b, a] : [a, b];
  return validYmd(y, mo, d) ? `${y}-${pad(mo)}-${pad(d)}` : null;
};

/** Infers iso | dmy | mdy from sample cells (defaults to dmy for ambiguous day/month data, as in Italy). */
const detectDateFormat = (cells) => {
  let dmyOnly = false;
  let mdyOnly = false;
  let iso = 0;
  let other = 0;
  for (const cell of cells) {
    const s = dateOnly(cell);
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s) || /^\d{8}$/.test(s)) {
      iso += 1;
      continue;
    }
    const m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})$/.exec(s);
    if (!m) continue;
    other += 1;
    if (Number(m[1]) > 12) dmyOnly = true;
    if (Number(m[2]) > 12) mdyOnly = true;
  }
  if (iso > 0 && iso >= other) return "iso";
  if (mdyOnly && !dmyOnly) return "mdy";
  return "dmy";
};

module.exports = {
  DELIMITERS,
  parseCsv,
  detectDelimiter,
  neutralizeFormula,
  restoreFormula,
  quoteCell,
  serializeRow,
  parseAmount,
  detectDecimalSeparator,
  parseDate,
  detectDateFormat,
};
