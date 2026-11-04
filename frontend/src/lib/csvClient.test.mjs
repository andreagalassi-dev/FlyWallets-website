import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CSV_MAX_BYTES,
  validateCsvFile,
  validateCsvText,
  buildImportBody,
  parseHeaderRow,
  mappingOptionsFromDetected,
  filenameFromContentDisposition,
  buildExportParams,
  parseExportHeaders,
  hasInsufficientFunds,
  importErrorMessage,
  formatBytes,
  summarizeImport,
  EXPORT_FALLBACK_NAME,
} from "./csvClient.js";

test("validateCsvFile accepts small csv files and rejects others", () => {
  assert.equal(validateCsvFile({ name: "a.csv", size: 100, type: "text/csv" }).ok, true);
  assert.equal(validateCsvFile({ name: "a.csv", size: 0, type: "text/csv" }).ok, false);
  assert.match(validateCsvFile({ name: "a.pdf", size: 10, type: "application/pdf" }).error, /\.csv/);
  const big = validateCsvFile({ name: "a.csv", size: CSV_MAX_BYTES + 1, type: "text/csv" });
  assert.equal(big.ok, false);
  assert.match(big.error, /1 MB/);
  assert.equal(validateCsvFile(null).ok, false);
});

test("validateCsvText needs a header and one row, and respects the size limit", () => {
  assert.equal(validateCsvText("").ok, false);
  assert.equal(validateCsvText("date,amount").ok, false);
  assert.equal(validateCsvText("date,amount\n2025-01-01,10").ok, true);
  assert.equal(validateCsvText("a\n" + "x".repeat(CSV_MAX_BYTES)).ok, false);
});

test("buildImportBody drops empty mapping entries and converts indexes", () => {
  const body = buildImportBody({
    accountId: "acc1",
    csv: "a,b",
    dryRun: true,
    mapping: { date: "0", amount: "2", description: "", notes: "Memo" },
  });
  assert.equal(body.manual_account_id, "acc1");
  assert.equal(body.dry_run, true);
  assert.equal(body.delimiter, "auto");
  assert.deepEqual(body.mapping, { date: 0, amount: 2, notes: "Memo" });
  assert.equal("mapping" in buildImportBody({ accountId: "x", csv: "y", mapping: { date: "" } }), false);
});

test("parseHeaderRow handles quotes, BOM and delimiters", () => {
  assert.deepEqual(parseHeaderRow('﻿Date;"Desc; long";Amount', ";"), ["Date", "Desc; long", "Amount"]);
  assert.deepEqual(parseHeaderRow('"a ""q""",b', ","), ['a "q"', "b"]);
  assert.deepEqual(parseHeaderRow("\n\nx,y\n1,2", ","), ["x", "y"]);
  assert.deepEqual(parseHeaderRow("", ","), []);
});

test("mappingOptionsFromDetected resolves names and indexes to column indexes", () => {
  const csv = "Date,Memo,Amount\n2025-01-01,x,3";
  const { headers, selected } = mappingOptionsFromDetected(
    { delimiter: ",", mapping: { date: "Date", amount: 2, description: "memo", type: "Nope" } },
    csv
  );
  assert.deepEqual(headers.map((h) => h.label), ["Date", "Memo", "Amount"]);
  assert.equal(selected.date, "0");
  assert.equal(selected.amount, "2");
  assert.equal(selected.description, "1");
  assert.equal(selected.type, "");
  assert.equal(selected.notes, "");
});

test("filenameFromContentDisposition handles the common shapes", () => {
  assert.equal(filenameFromContentDisposition('attachment; filename="tx-2025.csv"'), "tx-2025.csv");
  assert.equal(filenameFromContentDisposition("attachment; filename=tx.csv"), "tx.csv");
  assert.equal(filenameFromContentDisposition("attachment; filename*=UTF-8''caff%C3%A8.csv"), "caffè.csv");
  assert.equal(filenameFromContentDisposition('attachment; filename="../../etc/passwd"'), "passwd");
  assert.equal(filenameFromContentDisposition(undefined), EXPORT_FALLBACK_NAME);
  assert.equal(filenameFromContentDisposition("attachment"), EXPORT_FALLBACK_NAME);
});

test("buildExportParams keeps only set filters and a valid delimiter", () => {
  const qs = new URLSearchParams(buildExportParams({ search: " coffee ", account_id: "", type: "expense", from_date: "2025-01-01" }, ";"));
  assert.equal(qs.get("search"), "coffee");
  assert.equal(qs.get("type"), "expense");
  assert.equal(qs.get("from_date"), "2025-01-01");
  assert.equal(qs.has("account_id"), false);
  assert.equal(qs.get("delimiter"), ";");
  assert.equal(new URLSearchParams(buildExportParams({}, "weird")).get("delimiter"), ",");
});

test("parseExportHeaders reads rows, truncation and filename", () => {
  const info = parseExportHeaders({ "x-export-rows": "42", "x-export-truncated": "true", "content-disposition": 'attachment; filename="a.csv"' });
  assert.deepEqual(info, { rows: 42, truncated: true, filename: "a.csv" });
  const empty = parseExportHeaders({});
  assert.equal(empty.rows, null);
  assert.equal(empty.truncated, false);
  assert.equal(empty.filename, EXPORT_FALLBACK_NAME);
});

test("hasInsufficientFunds detects overdraft errors", () => {
  assert.equal(hasInsufficientFunds([{ row: 2, message: "Insufficient funds: balance would go below 0" }]), true);
  assert.equal(hasInsufficientFunds([{ row: 2, message: "Invalid date" }]), false);
  assert.equal(hasInsufficientFunds(), false);
});

test("importErrorMessage maps statuses to friendly text", () => {
  const e = (status, message) => ({ response: { status, data: { message } } });
  assert.match(importErrorMessage(e(413)), /too large/);
  assert.match(importErrorMessage(e(404)), /not found/);
  assert.match(importErrorMessage(e(409)), /archived/);
  assert.match(importErrorMessage(e(400, "Could not detect the columns, provide a mapping")), /Column mapping/);
  assert.equal(importErrorMessage(e(400, "Too many rows")), "Too many rows");
  assert.equal(importErrorMessage({}), "Could not read the CSV");
});

test("formatBytes and summarizeImport", () => {
  assert.equal(formatBytes(512), "512 B");
  assert.equal(formatBytes(2048), "2.0 KB");
  assert.equal(formatBytes(1.5 * 1024 * 1024), "1.5 MB");
  assert.deepEqual(summarizeImport({ total_rows: 5, imported: 3, skipped_duplicates: 1, errors: [{}] }), { total: 5, toImport: 3, duplicates: 1, errors: 1 });
});
