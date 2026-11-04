"use client";

import { useRef, useState } from "react";
import { AlertTriangle, ChevronDown, FileText, Loader2, UploadCloud, X } from "lucide-react";
import api from "@/lib/api";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/store/toastStore";
import {
  DATE_FORMAT_OPTIONS,
  DECIMAL_OPTIONS,
  DELIMITER_OPTIONS,
  MAPPING_FIELDS,
  buildImportBody,
  formatBytes,
  hasInsufficientFunds,
  importErrorMessage,
  mappingOptionsFromDetected,
  summarizeImport,
  textByteSize,
  validateCsvFile,
  validateCsvText,
} from "@/lib/csvClient";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";

const STATUS_STYLES = {
  imported: "bg-green-500/15 text-green-400",
  duplicate: "bg-amber-500/15 text-amber-400",
  error: "bg-red-500/15 text-red-400",
};
const STATUS_LABELS = { imported: "New", duplicate: "Duplicate", error: "Error" };
const PREVIEW_ROWS = 15;

function Stat({ label, value, tone }) {
  return (
    <div className="rounded-lg bg-black/20 border border-white/5 px-3 py-2">
      <p className="text-xs text-gray-400">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function ResultView({ result, done, account }) {
  const counts = summarizeImport(result);
  const detected = result.detected || {};
  const detectedDelimiter = { ",": "comma", ";": "semicolon", "\t": "tab", "|": "pipe" }[detected.delimiter] || detected.delimiter;
  const preview = (result.preview || []).slice(0, PREVIEW_ROWS);
  const errors = result.errors || [];

  return (
    <div className="space-y-4" aria-live="polite">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat label="Rows read" value={counts.total} tone="text-white" />
        <Stat label={done ? "Imported" : "To import"} value={counts.toImport} tone="text-green-400" />
        <Stat label="Duplicates skipped" value={counts.duplicates} tone="text-amber-400" />
        <Stat label="Errors" value={counts.errors} tone={counts.errors ? "text-red-400" : "text-gray-300"} />
      </div>

      {(detected.delimiter || detected.date_format || detected.decimal_separator) && (
        <p className="text-xs text-gray-400">
          Detected: {detectedDelimiter && <>delimiter <b className="text-gray-200">{detectedDelimiter}</b></>}
          {detected.date_format && <>, dates <b className="text-gray-200">{detected.date_format}</b></>}
          {detected.decimal_separator && <>, decimals <b className="text-gray-200">&quot;{detected.decimal_separator}&quot;</b></>}
        </p>
      )}

      {hasInsufficientFunds(errors) && (
        <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-300" role="note">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          <p>
            Some expenses would take {account ? `"${account.account_name}"` : "the account"} below zero, and accounts without overdraft cannot go negative.
            Import the incomes first, add funds to the account, or enable overdraft on it.
          </p>
        </div>
      )}

      {preview.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <caption className="sr-only">First rows of the CSV</caption>
            <thead className="bg-white/5 text-xs text-gray-400">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-medium">Row</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Date</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Description</th>
                <th scope="col" className="px-3 py-2 text-right font-medium">Amount</th>
                <th scope="col" className="px-3 py-2 text-left font-medium hidden sm:table-cell">Category</th>
                <th scope="col" className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {preview.map((r) => (
                <tr key={r.row} className="border-t border-white/5">
                  <td className="px-3 py-2 text-gray-500 tabular-nums">{r.row}</td>
                  <td className="px-3 py-2 text-gray-300 whitespace-nowrap">{r.date || "—"}</td>
                  <td className="px-3 py-2 text-white max-w-[14rem] truncate" title={r.description}>{r.description || "—"}</td>
                  <td className={`px-3 py-2 text-right tabular-nums whitespace-nowrap ${r.type === "income" ? "text-green-400" : "text-red-400"}`}>
                    {r.amount !== undefined && r.amount !== null && r.amount !== "" ? `${r.type === "income" ? "+" : "−"}${formatCurrency(Math.abs(Number(r.amount)), account?.currency)}` : "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-400 hidden sm:table-cell">{r.category || "—"}</td>
                  <td className="px-3 py-2">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[r.status] || "bg-white/10 text-gray-300"}`} title={r.error || undefined}>
                      {STATUS_LABELS[r.status] || r.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(result.preview || []).length > PREVIEW_ROWS && (
            <p className="px-3 py-2 text-xs text-gray-500 border-t border-white/5">Showing the first {PREVIEW_ROWS} of {result.preview.length} previewed rows.</p>
          )}
        </div>
      )}

      {errors.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-red-400 mb-1">Rows with problems ({errors.length})</h3>
          <ul className="max-h-40 overflow-y-auto rounded-lg border border-red-500/20 bg-red-500/5 divide-y divide-red-500/10 text-sm">
            {errors.slice(0, 100).map((e, i) => (
              <li key={`${e.row}-${i}`} className="px-3 py-1.5 text-gray-300">
                <span className="text-red-400 font-medium">Row {e.row}:</span> {e.message}
              </li>
            ))}
            {errors.length > 100 && <li className="px-3 py-1.5 text-gray-500">…and {errors.length - 100} more</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function ImportCsvModal({ open, onClose, accounts = [], onImported }) {
  const manualAccounts = accounts.filter((a) => a.source === "manual" && !a.is_archived);
  const fileInput = useRef(null);
  const [accountId, setAccountId] = useState("");
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [options, setOptions] = useState({ delimiter: "auto", dateFormat: "auto", decimalSeparator: "auto" });
  const [showMapping, setShowMapping] = useState(false);
  const [mapping, setMapping] = useState(null); // { headers, selected } once a preview has run
  const [mappingTouched, setMappingTouched] = useState(false);
  const [result, setResult] = useState(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(null); // 'preview' | 'import'
  const [error, setError] = useState("");

  const effectiveAccountId = accountId || manualAccounts[0]?.id || "";
  const account = manualAccounts.find((a) => a.id === effectiveAccountId);

  // Any input change invalidates the previous preview: the user must preview again before importing
  const invalidate = () => {
    setResult(null);
    setDone(false);
    setError("");
  };

  const loadFile = (file) => {
    const check = validateCsvFile(file);
    if (!check.ok) {
      setError(check.error);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      invalidate();
      setCsv(String(reader.result || ""));
      setFileName(`${file.name} (${formatBytes(file.size)})`);
      setMapping(null);
      setMappingTouched(false);
    };
    reader.onerror = () => setError("Could not read that file");
    reader.readAsText(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    loadFile(e.dataTransfer.files?.[0]);
  };

  const clearCsv = () => {
    setCsv("");
    setFileName("");
    setMapping(null);
    setMappingTouched(false);
    invalidate();
  };

  const setOption = (key) => (e) => {
    setOptions({ ...options, [key]: e.target.value });
    invalidate();
  };

  const run = async (dryRun) => {
    const check = validateCsvText(csv);
    if (!check.ok) return setError(check.error);
    if (!effectiveAccountId) return setError("Choose the account to import into");
    setBusy(dryRun ? "preview" : "import");
    setError("");
    try {
      const body = buildImportBody({
        accountId: effectiveAccountId,
        csv,
        delimiter: options.delimiter,
        dateFormat: options.dateFormat,
        decimalSeparator: options.decimalSeparator,
        mapping: mappingTouched && mapping ? mapping.selected : {},
        dryRun,
      });
      const res = await api.post("/data/import/transactions", body);
      const data = res.data.data;
      setResult(data);
      if (dryRun) {
        // Fill the mapping dropdowns from what the API detected (keeps manual choices)
        if (!mappingTouched) setMapping(mappingOptionsFromDetected(data.detected, csv));
      } else {
        const counts = summarizeImport(data);
        const parts = [`${counts.toImport} transaction${counts.toImport === 1 ? "" : "s"} imported`];
        if (counts.duplicates) parts.push(`${counts.duplicates} duplicate${counts.duplicates === 1 ? "" : "s"} skipped`);
        if (counts.errors) parts.push(`${counts.errors} with errors`);
        if (counts.toImport > 0) toast.success(parts.join(", "));
        else toast.info(parts.join(", "));
        setDone(true);
        onImported?.();
        if (counts.errors === 0) onClose();
      }
    } catch (err) {
      setError(importErrorMessage(err));
      if (!dryRun) setResult(null);
    } finally {
      setBusy(null);
    }
  };

  const counts = result ? summarizeImport(result) : null;
  const canImport = !!result && !done && counts.toImport > 0 && !busy;

  const changeMapping = (field) => (e) => {
    setMapping((m) => ({ ...m, selected: { ...m.selected, [field]: e.target.value } }));
    setMappingTouched(true);
    invalidate();
  };

  return (
    <Modal open={open} onClose={onClose} size="xl" title="Import transactions from CSV" description="Preview first: nothing is saved until you press Import.">
      <div className="space-y-4">
        <FormError message={error} />

        {manualAccounts.length === 0 ? (
          <p className="text-sm text-gray-400">Create a manual account first, then you can import transactions into it.</p>
        ) : (
          <>
            <Field label="Import into">
              <Select
                value={effectiveAccountId}
                onChange={(e) => {
                  setAccountId(e.target.value);
                  invalidate();
                }}
                disabled={!!busy || done}
              >
                {manualAccounts.map((a) => <option key={a.id} value={a.id}>{a.icon_emoji || ""} {a.account_name}</option>)}
              </Select>
            </Field>

            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${dragging ? "border-primary bg-primary/5" : "border-white/10"}`}
              >
                <UploadCloud className="text-gray-500" size={28} />
                <p className="text-sm text-gray-300">Drop a .csv file here, or</p>
                <Button type="button" variant="secondary" size="sm" onClick={() => fileInput.current?.click()} disabled={!!busy || done}>Choose file</Button>
                <input
                  ref={fileInput}
                  type="file"
                  accept=".csv,.txt,text/csv,text/plain"
                  className="sr-only"
                  tabIndex={-1}
                  aria-label="CSV file"
                  onChange={(e) => {
                    loadFile(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
                <p className="text-xs text-gray-500">Up to 1 MB and 2,000 rows per import.</p>
              </div>
              {fileName && (
                <p className="mt-2 flex items-center gap-2 text-sm text-gray-300">
                  <FileText size={14} className="text-primary" /> <span className="truncate">{fileName}</span>
                  <button type="button" onClick={clearCsv} className="text-gray-500 hover:text-white" aria-label="Remove file"><X size={14} /></button>
                </p>
              )}
            </div>

            <Field label="…or paste CSV text">
              <textarea
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setFileName("");
                  setMapping(null);
                  setMappingTouched(false);
                  invalidate();
                }}
                rows={4}
                spellCheck={false}
                disabled={!!busy || done}
                placeholder={"Date,Description,Amount\n2025-01-31,Coffee,-1.80"}
                className="flex w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 font-mono text-xs text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary/50"
              />
              {csv && <p className="text-xs text-gray-500">{formatBytes(textByteSize(csv))}</p>}
            </Field>

            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="Delimiter">
                <Select value={options.delimiter} onChange={setOption("delimiter")}>
                  {DELIMITER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Date format">
                <Select value={options.dateFormat} onChange={setOption("dateFormat")}>
                  {DATE_FORMAT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="Decimal separator">
                <Select value={options.decimalSeparator} onChange={setOption("decimalSeparator")}>
                  {DECIMAL_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </div>

            <div className="rounded-lg border border-white/5">
              <button
                type="button"
                onClick={() => setShowMapping((s) => !s)}
                aria-expanded={showMapping}
                aria-controls="csv-mapping-panel"
                className="flex w-full items-center justify-between px-3 py-2 text-sm text-gray-300 hover:text-white"
              >
                Column mapping
                <ChevronDown size={16} className={`transition-transform ${showMapping ? "rotate-180" : ""}`} />
              </button>
              {showMapping && (
                <div id="csv-mapping-panel" className="border-t border-white/5 p-3">
                  {!mapping ? (
                    <p className="text-sm text-gray-400">Run a preview first: the detected columns will appear here, and you can change them if something looks wrong.</p>
                  ) : (
                    <div className="grid gap-3 sm:grid-cols-3">
                      {MAPPING_FIELDS.map((f) => (
                        <Field key={f.key} label={f.label}>
                          <Select value={mapping.selected[f.key] || ""} onChange={changeMapping(f.key)}>
                            <option value="">Not used</option>
                            {mapping.headers.map((h) => <option key={h.index} value={h.index}>{h.label}</option>)}
                          </Select>
                        </Field>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {result && <ResultView result={result} done={done} account={account} />}
          </>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="ghost" onClick={onClose}>{done ? "Close" : "Cancel"}</Button>
          {manualAccounts.length > 0 && !done && (
            <>
              <Button type="button" variant="secondary" onClick={() => run(true)} disabled={!!busy || !csv.trim()}>
                {busy === "preview" ? <Loader2 className="h-4 w-4 animate-spin" /> : "Preview"}
              </Button>
              <Button type="button" onClick={() => run(false)} disabled={!canImport}>
                {busy === "import" ? <Loader2 className="h-4 w-4 animate-spin" /> : counts ? `Import ${counts.toImport}` : "Import"}
              </Button>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
