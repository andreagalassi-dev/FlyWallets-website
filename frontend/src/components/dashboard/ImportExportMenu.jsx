"use client";

import { useState } from "react";
import { Download, Loader2, Upload } from "lucide-react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { EXPORT_DELIMITERS, buildExportParams, parseExportHeaders } from "@/lib/csvClient";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Select";
import { Modal, Field } from "@/components/ui/Modal";
import { ImportCsvModal } from "@/components/dashboard/ImportCsvModal";

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A failed blob request carries the JSON error as a Blob: turn it back into a normal axios error shape
async function unwrapBlobError(err) {
  const data = err?.response?.data;
  if (data instanceof Blob) {
    try {
      err.response.data = JSON.parse(await data.text());
    } catch {
      /* not JSON: keep the generic message */
    }
  }
  return err;
}

/**
 * Export / Import buttons for the transactions page.
 * Props: filters ({search, account_id, category_id, type, from_date, to_date}: the export respects them),
 * accounts (array from GET /accounts), onImported() (called after a successful import: reload the list).
 */
export function ImportExportMenu({ filters = {}, accounts = [], onImported }) {
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [delimiter, setDelimiter] = useState(",");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");

  const activeFilters = Object.values(filters).filter((v) => v !== undefined && v !== null && String(v).trim() !== "").length;

  const doExport = async () => {
    setExporting(true);
    setError("");
    try {
      const res = await api.get(`/data/export/transactions.csv?${buildExportParams(filters, delimiter)}`, { responseType: "blob" });
      const info = parseExportHeaders(res.headers);
      saveBlob(res.data, info.filename);
      if (info.rows === 0) toast.info("No transactions matched, the file only has the header row");
      else toast.success(info.rows === null ? "Export downloaded" : `${info.rows.toLocaleString("en-US")} transactions exported`);
      if (info.truncated) toast.error("The export was cut at 50,000 rows. Narrow the dates or filters and export again to get the rest.");
      setExportOpen(false);
    } catch (err) {
      setError(getErrorMessage(await unwrapBlobError(err), "Could not export the transactions"));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="secondary" onClick={() => setImportOpen(true)}>
          <Upload size={16} className="mr-2" /> Import
        </Button>
        <Button
          variant="secondary"
          onClick={() => {
            setError("");
            setExportOpen(true);
          }}
          aria-haspopup="dialog"
        >
          <Download size={16} className="mr-2" /> Export
        </Button>
      </div>

      <Modal
        open={exportOpen}
        onClose={() => !exporting && setExportOpen(false)}
        title="Export transactions"
        description={activeFilters ? `Your ${activeFilters} active filter${activeFilters === 1 ? "" : "s"} will be applied.` : "All your transactions will be exported."}
      >
        <div className="space-y-4">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-500 text-sm rounded-md" role="alert">{error}</div>}
          <Field label="Delimiter">
            <Select value={delimiter} onChange={(e) => setDelimiter(e.target.value)}>
              {EXPORT_DELIMITERS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
          </Field>
          <p className="text-xs text-gray-500">Exports up to 50,000 rows. Use semicolon if you open the file with Excel in an Italian locale.</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setExportOpen(false)} disabled={exporting}>Cancel</Button>
            <Button type="button" onClick={doExport} disabled={exporting}>
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Download CSV"}
            </Button>
          </div>
        </div>
      </Modal>

      {importOpen && <ImportCsvModal open onClose={() => setImportOpen(false)} accounts={accounts} onImported={onImported} />}
    </>
  );
}
