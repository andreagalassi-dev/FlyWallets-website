import { getErrorMessage } from "./errors.js";

// Client-side helpers for the CSV import / export UI (pure functions, unit tested).

export const CSV_MAX_BYTES = 1024 * 1024; // matches the API limit (1 MB)
export const CSV_MAX_ROWS = 2000;
export const EXPORT_FALLBACK_NAME = "flywallets-transactions.csv";

export const DELIMITER_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: ",", label: "Comma (,)" },
  { value: ";", label: "Semicolon (;)" },
  { value: "\t", label: "Tab" },
  { value: "|", label: "Pipe (|)" },
];
export const DATE_FORMAT_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: "iso", label: "YYYY-MM-DD" },
  { value: "dmy", label: "DD/MM/YYYY" },
  { value: "mdy", label: "MM/DD/YYYY" },
];
export const DECIMAL_OPTIONS = [
  { value: "auto", label: "Auto-detect" },
  { value: ".", label: "Dot (1234.56)" },
  { value: ",", label: "Comma (1234,56)" },
];
export const EXPORT_DELIMITERS = [
  { value: ",", label: "Comma" },
  { value: ";", label: "Semicolon — Italian Excel" },
];

/** Columns the importer can map. `debit`/`credit` are for statements with two amount columns. */
export const MAPPING_FIELDS = [
  { key: "date", label: "Date" },
  { key: "amount", label: "Amount" },
  { key: "description", label: "Description" },
  { key: "type", label: "Type" },
  { key: "category", label: "Category" },
  { key: "notes", label: "Notes" },
  { key: "tags", label: "Tags" },
  { key: "debit", label: "Debit (out)" },
  { key: "credit", label: "Credit (in)" },
];

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Byte size of a string once encoded as UTF-8 (what the API counts). */
export function textByteSize(text) {
  return new TextEncoder().encode(String(text ?? "")).length;
}

/** Guards a picked file before reading it: { ok: true } or { ok: false, error }. */
export function validateCsvFile(file) {
  if (!file) return { ok: false, error: "No file selected" };
  const name = String(file.name || "");
  const looksCsv = /\.(csv|txt|tsv)$/i.test(name) || /csv|text\/plain|excel/i.test(file.type || "");
  if (!looksCsv) return { ok: false, error: "Please choose a .csv file" };
  if (file.size === 0) return { ok: false, error: "The file is empty" };
  if (file.size > CSV_MAX_BYTES) {
    return { ok: false, error: `The file is ${formatBytes(file.size)}: the limit is 1 MB. Split it into smaller files.` };
  }
  return { ok: true };
}

/** Guards pasted/loaded text: { ok: true } or { ok: false, error }. */
export function validateCsvText(text) {
  const value = String(text ?? "");
  if (!value.trim()) return { ok: false, error: "Add a CSV file or paste some CSV text first" };
  if (textByteSize(value) > CSV_MAX_BYTES) return { ok: false, error: "The CSV is larger than 1 MB. Split it into smaller files." };
  const lines = value.split(/\r\n|\r|\n/).filter((l) => l.trim() !== "").length;
  if (lines < 2) return { ok: false, error: "The CSV needs a header row and at least one data row" };
  // A rough guard: quoted newlines can make this overcount, so the API stays the source of truth
  if (lines - 1 > CSV_MAX_ROWS * 2) return { ok: false, error: `Too many rows: the limit is ${CSV_MAX_ROWS.toLocaleString("en-US")} per import.` };
  return { ok: true };
}

/** Builds the POST /data/import/transactions body. `mapping` values: column indexes (number or numeric string). */
export function buildImportBody({ accountId, csv, delimiter = "auto", dateFormat = "auto", decimalSeparator = "auto", mapping = {}, dryRun = false }) {
  const cleanMapping = {};
  for (const [field, value] of Object.entries(mapping || {})) {
    if (value === "" || value === null || value === undefined) continue;
    cleanMapping[field] = /^\d+$/.test(String(value)) ? Number(value) : value;
  }
  const body = {
    manual_account_id: accountId,
    csv,
    delimiter,
    date_format: dateFormat,
    decimal_separator: decimalSeparator,
    dry_run: !!dryRun,
  };
  if (Object.keys(cleanMapping).length) body.mapping = cleanMapping;
  return body;
}

/** Splits the header row (first non-empty line) honouring double quotes. Returns trimmed column names. */
export function parseHeaderRow(csv, delimiter) {
  const text = String(csv ?? "").replace(/^﻿/, "");
  const line = text.split(/\r\n|\r|\n/).find((l) => l.trim() !== "");
  if (!line) return [];
  const sep = delimiter && delimiter !== "auto" ? delimiter : ",";
  const cols = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else current += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      cols.push(current.trim());
      current = "";
    } else current += ch;
  }
  cols.push(current.trim());
  return cols;
}

/**
 * Builds the mapping dropdown data from a dry-run's `detected` block.
 * Returns { headers: [{index, label}], selected: { field: "index" | "" } }.
 * The API may report mapped columns as header names or as 0-based indexes: both are normalised to indexes.
 */
export function mappingOptionsFromDetected(detected, csv) {
  const headerNames = parseHeaderRow(csv, detected?.delimiter);
  const headers = headerNames.map((name, index) => ({ index: String(index), label: name || `Column ${index + 1}` }));
  const selected = {};
  const raw = detected?.mapping || {};
  for (const { key } of MAPPING_FIELDS) {
    const value = raw[key];
    let resolved = "";
    if (typeof value === "number" && value >= 0 && value < headerNames.length) {
      resolved = String(value);
    } else if (typeof value === "string" && value !== "") {
      const byName = headerNames.findIndex((h) => h.toLowerCase() === value.trim().toLowerCase());
      if (byName >= 0) resolved = String(byName);
      else if (/^\d+$/.test(value) && Number(value) < headerNames.length) resolved = value;
    }
    selected[key] = resolved;
  }
  return { headers, selected };
}

/** Filename from a Content-Disposition header (RFC 5987 `filename*` preferred), sanitised. */
export function filenameFromContentDisposition(header, fallback = EXPORT_FALLBACK_NAME) {
  if (!header || typeof header !== "string") return fallback;
  let name = null;
  const star = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (star) {
    try {
      name = decodeURIComponent(star[2].trim().replace(/^"|"$/g, ""));
    } catch {
      name = null;
    }
  }
  if (!name) {
    const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header);
    const bare = /filename\s*=\s*([^;]+)/i.exec(header);
    if (quoted) name = quoted[1].replace(/\\(.)/g, "$1");
    else if (bare) name = bare[1].trim();
  }
  if (!name) return fallback;
  // Never let the server pick a path or a control character
  name = name.split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, "").trim();
  return name || fallback;
}

/** Query string for GET /data/export/transactions.csv (empty filters are dropped). */
export function buildExportParams(filters = {}, delimiter = ",") {
  const params = new URLSearchParams();
  for (const key of ["search", "account_id", "category_id", "type", "from_date", "to_date"]) {
    const value = filters[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") params.set(key, String(value).trim());
  }
  params.set("delimiter", delimiter === ";" ? ";" : ",");
  return params.toString();
}

/** Reads the export metadata headers (axios lower-cases them). */
export function parseExportHeaders(headers = {}) {
  const get = (name) => (typeof headers.get === "function" ? headers.get(name) : headers[name]);
  const rows = Number.parseInt(get("x-export-rows"), 10);
  return {
    rows: Number.isFinite(rows) ? rows : null,
    truncated: String(get("x-export-truncated") ?? "").toLowerCase() === "true",
    filename: filenameFromContentDisposition(get("content-disposition")),
  };
}

/** True if any row error is about missing funds (overdraft rule). */
export function hasInsufficientFunds(errors = []) {
  return errors.some((e) => /insufficient|overdraft|not enough/i.test(e?.message || ""));
}

/** Friendly message for a failed import request. */
export function importErrorMessage(err) {
  const status = err?.response?.status;
  const msg = getErrorMessage(err, "Could not read the CSV");
  switch (status) {
    case 413:
      return "The file is too large to upload. The limit is 1 MB and 2,000 rows: split it into smaller files.";
    case 404:
      return "That account was not found. Pick one of your manual accounts.";
    case 409:
      return "This account is archived, so it cannot receive imports. Choose another account.";
    case 400:
      return /map/i.test(msg) ? `${msg} Open "Column mapping" below to pick the columns yourself.` : msg;
    default:
      return msg;
  }
}

/** Counts of a dry-run / import result for display. */
export function summarizeImport(result) {
  const errors = result?.errors?.length ?? 0;
  return {
    total: result?.total_rows ?? 0,
    toImport: result?.imported ?? 0,
    duplicates: result?.skipped_duplicates ?? 0,
    errors,
  };
}
