"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { todayInputValue } from "@/lib/format";
import { FREQUENCIES } from "@/lib/recurring";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";

const dateOnly = (value) => (value ? String(value).slice(0, 10) : "");

/** Create (no `rule`) or edit (`rule`) a recurring transaction. Mount it fresh each time it opens. */
export function RecurringFormModal({ rule, onClose, onSaved, accounts = [], categories = [] }) {
  const editing = !!rule;
  const manualAccounts = accounts.filter((a) => a.source === "manual" && !a.is_archived);
  const [form, setForm] = useState({
    transaction_type: rule?.transaction_type || "expense",
    manual_account_id: rule?.manual_account_id || "",
    amount: rule ? String(Number(rule.amount)) : "",
    description: rule?.description || "",
    category_id: rule?.category_id || "",
    frequency: rule?.frequency || "monthly",
    start_date: todayInputValue(),
    end_date: dateOnly(rule?.end_date),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const accountId = form.manual_account_id || manualAccounts[0]?.id || "";
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.category_type === "both" || c.category_type === form.transaction_type),
    [categories, form.transaction_type]
  );

  const submit = async (e) => {
    e.preventDefault();
    if (form.end_date && !editing && form.end_date < form.start_date) {
      setError("The end date cannot be before the start date");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const payload = {
        manual_account_id: accountId,
        transaction_type: form.transaction_type,
        amount: Number(form.amount),
        description: form.description,
        category_id: form.category_id || undefined,
        frequency: form.frequency,
      };
      let processed;
      if (editing) {
        const res = await api.put(`/recurring/${rule.id}`, {
          ...payload,
          // Clearing a value that was set needs an explicit null; leaving it empty stays undefined
          category_id: form.category_id || (rule.category_id ? null : undefined),
          end_date: form.end_date || (rule.end_date ? null : undefined),
        });
        processed = res.data.data.processed;
        toast.success("Recurring transaction updated");
      } else {
        const res = await api.post("/recurring", { ...payload, start_date: form.start_date, end_date: form.end_date || undefined });
        processed = res.data.data.processed;
        toast.success("Recurring transaction created");
      }
      onSaved?.(processed);
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not save the recurring transaction"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? "Edit recurring transaction" : "New recurring transaction"}
      description={editing ? "Changes apply to future occurrences. Past transactions stay as they are." : "It will be added automatically on every due date."}
    >
      {manualAccounts.length === 0 ? (
        <p className="text-sm text-gray-400">Create a manual account first, then you can schedule recurring transactions on it.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />

          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/30" role="radiogroup" aria-label="Transaction type">
            {[["expense", "Expense"], ["income", "Income"]].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.transaction_type === value}
                onClick={() => setForm({ ...form, transaction_type: value, category_id: "" })}
                className={`h-9 rounded-md text-sm font-medium transition-all ${
                  form.transaction_type === value
                    ? value === "expense" ? "bg-red-500/20 text-red-400" : "bg-green-500/20 text-green-400"
                    : "text-gray-400 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Field label="Description">
            <Input value={form.description} onChange={set("description")} placeholder="Netflix, rent, salary…" required maxLength={255} autoFocus />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount (€)">
              <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set("amount")} required />
            </Field>
            <Field label="Repeats">
              <Select value={form.frequency} onChange={set("frequency")}>
                {FREQUENCIES.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </Select>
            </Field>
          </div>
          <Field label="Account">
            <Select value={accountId} onChange={set("manual_account_id")} required>
              {manualAccounts.map((a) => <option key={a.id} value={a.id}>{a.icon_emoji || ""} {a.account_name}</option>)}
            </Select>
          </Field>
          <Field label="Category">
            <Select value={form.category_id} onChange={set("category_id")}>
              <option value="">Automatic</option>
              {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.icon_emoji || ""} {c.category_name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            {!editing && (
              <Field label="Starts on">
                <Input type="date" value={form.start_date} onChange={set("start_date")} required />
              </Field>
            )}
            <Field label="Ends on (optional)">
              <Input type="date" value={form.end_date} onChange={set("end_date")} min={editing ? undefined : form.start_date} />
            </Field>
          </div>
          {!editing && <p className="text-xs text-gray-500">A start date in the past (up to a year back) adds the missed occurrences right away.</p>}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : editing ? "Save changes" : "Create"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
