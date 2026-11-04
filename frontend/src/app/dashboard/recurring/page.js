"use client";

import { useEffect, useRef, useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Pause, Play, RefreshCw, Repeat, AlertTriangle } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getErrorMessage } from "@/lib/errors";
import { formatDate } from "@/lib/format";
import { frequencyLabel, listingToastMessage, processResultToast, resumeErrorHint, ruleWarning } from "@/lib/recurring";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { Amount, CategoryBadge } from "@/components/dashboard/TransactionRow";
import { RecurringFormModal } from "@/components/dashboard/RecurringFormModal";

function RuleCard({ rule, busy, onEdit, onToggle, onDelete }) {
  const paused = !rule.is_active;
  const warning = ruleWarning(rule);

  return (
    <Card className={paused ? "opacity-70" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="truncate font-semibold text-white">{rule.description}</h3>
            {paused && <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-gray-300">Paused</span>}
          </div>
          <div className="mt-1.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
            <CategoryBadge name={rule.category_name} emoji={rule.category_emoji} color={rule.category_color} />
            <span>{rule.account_name}{rule.account_archived ? " (archived)" : ""}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <Amount amount={rule.amount} type={rule.transaction_type} currency={rule.currency} />
          <p className="text-xs text-gray-400 mt-0.5">{frequencyLabel(rule.frequency)}</p>
        </div>
      </div>

      <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
        <div className="flex gap-1.5">
          <dt className="text-gray-500">Next run</dt>
          <dd className="text-gray-200">{paused ? "—" : formatDate(rule.next_run_date)}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-gray-500">Ends</dt>
          <dd className="text-gray-200">{rule.end_date ? formatDate(rule.end_date) : "Never"}</dd>
        </div>
        <div className="flex gap-1.5">
          <dt className="text-gray-500">Started</dt>
          <dd className="text-gray-200">{formatDate(rule.start_date)}</dd>
        </div>
      </dl>

      {warning && (
        <div className="mt-3 flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300" role="alert">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <p>{warning}</p>
        </div>
      )}
      {rule.account_archived && (
        <p className="mt-3 text-xs text-gray-500">This account is archived, so the rule will not run until you move it to another account.</p>
      )}

      <div className="mt-3 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={() => onToggle(rule)} disabled={busy} aria-label={`${paused ? "Resume" : "Pause"} ${rule.description}`}>
          {busy ? <Loader2 size={14} className="animate-spin" /> : paused ? <Play size={14} className="mr-1" /> : <Pause size={14} className="mr-1" />}
          {paused ? "Resume" : "Pause"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onEdit(rule)} aria-label={`Edit ${rule.description}`}><Pencil size={14} /></Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(rule)} aria-label={`Delete ${rule.description}`}><Trash2 size={14} /></Button>
      </div>
    </Card>
  );
}

export default function RecurringPage() {
  const { data, loading, error, reload } = useApiData("/recurring");
  const { data: accountsData } = useApiData("/accounts");
  const { data: categoriesData } = useApiData("/categories");
  const [formRule, setFormRule] = useState(undefined); // undefined = closed, null = new, object = edit
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [busyId, setBusyId] = useState(null);

  // Listing also generates the due occurrences: tell the user when it did (once per response)
  const announced = useRef(null);
  useEffect(() => {
    if (!data || announced.current === data) return;
    announced.current = data;
    const message = listingToastMessage(data.processed);
    if (message) toast.info(message);
  }, [data]);

  const processNow = async () => {
    setProcessing(true);
    try {
      const res = await api.post("/recurring/process");
      const { type, message } = processResultToast(res.data.data);
      toast[type](message);
      announced.current = null;
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not process the recurring transactions"));
    } finally {
      setProcessing(false);
    }
  };

  const toggle = async (rule) => {
    setBusyId(rule.id);
    try {
      await api.put(`/recurring/${rule.id}`, { is_active: !rule.is_active });
      toast.success(rule.is_active ? "Recurring transaction paused" : "Recurring transaction resumed");
      reload();
    } catch (err) {
      const message = getErrorMessage(err, "Could not update the recurring transaction");
      toast.error(!rule.is_active ? resumeErrorHint(err?.response?.status, message) : message);
    } finally {
      setBusyId(null);
    }
  };

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/recurring/${toDelete.id}`);
      toast.success("Recurring transaction deleted");
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete the recurring transaction"));
    } finally {
      setDeleting(false);
    }
  };

  const rules = data?.recurring || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-white">Recurring</h1>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={processNow} disabled={processing || loading}>
            {processing ? <Loader2 size={16} className="mr-2 animate-spin" /> : <RefreshCw size={16} className="mr-2" />} Process now
          </Button>
          <Button onClick={() => setFormRule(null)}><Plus size={16} className="mr-2" /> New Recurring</Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2" aria-busy="true" aria-label="Loading recurring transactions">
          <Skeleton className="h-40" /><Skeleton className="h-40" /><Skeleton className="h-40" />
        </div>
      ) : error ? (
        <Card className="text-center space-y-3" role="alert">
          <p className="text-red-400">{error}</p>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </Card>
      ) : rules.length === 0 ? (
        <Card className="text-center py-12 space-y-3">
          <Repeat className="mx-auto text-gray-600" size={32} />
          <p className="text-gray-400">No recurring transactions yet. Schedule rent, subscriptions or your salary and they will be added for you.</p>
          <Button onClick={() => setFormRule(null)}><Plus size={16} className="mr-2" /> Add a recurring transaction</Button>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rules.map((r) => (
            <RuleCard key={r.id} rule={r} busy={busyId === r.id} onEdit={setFormRule} onToggle={toggle} onDelete={setToDelete} />
          ))}
        </div>
      )}

      {formRule !== undefined && (
        <RecurringFormModal
          rule={formRule || undefined}
          onClose={() => setFormRule(undefined)}
          onSaved={(processed) => {
            const message = listingToastMessage(processed);
            if (message) toast.info(message);
            reload();
          }}
          accounts={accountsData?.accounts || []}
          categories={categoriesData?.categories || []}
        />
      )}
      <Modal
        open={!!toDelete}
        onClose={() => !deleting && setToDelete(null)}
        title="Delete recurring transaction?"
        description={toDelete ? `"${toDelete.description}" will stop repeating. Transactions it already created stay in your history.` : ""}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}</Button>
        </div>
      </Modal>
    </div>
  );
}
