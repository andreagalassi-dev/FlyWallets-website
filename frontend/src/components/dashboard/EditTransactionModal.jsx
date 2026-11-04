"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toDateInputValue } from "@/lib/format";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";

/**
 * Edit a manual transaction. Render it only while `tx` is set (`{tx && <EditTransactionModal key={tx.id} …/>}`):
 * the form is prefilled once from the row. Only changed fields are sent.
 */
export function EditTransactionModal({ tx, onClose, onSaved, accounts = [], categories = [] }) {
  const initial = useMemo(
    () => ({
      manual_account_id: tx.manual_account_id,
      transaction_date: toDateInputValue(tx.transaction_date),
      amount: String(Number(tx.amount)),
      transaction_type: tx.transaction_type,
      description: tx.description || "",
      category_id: tx.category_id || "",
      notes: tx.notes || "",
    }),
    [tx]
  );
  const [form, setForm] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const manualAccounts = accounts.filter((a) => a.source === "manual");
  // The row's own account may be missing from the list (e.g. archived): keep it selectable so the form stays consistent
  const accountOptions = manualAccounts.some((a) => a.id === tx.manual_account_id)
    ? manualAccounts
    : [{ id: tx.manual_account_id, account_name: tx.account_name || "Current account" }, ...manualAccounts];

  const fits = (c, type) => c.category_type === "both" || c.category_type === type;
  const visibleCategories = categories.filter((c) => fits(c, form.transaction_type));

  const setType = (type) => {
    const current = categories.find((c) => c.id === form.category_id);
    setForm({ ...form, transaction_type: type, category_id: current && fits(current, type) ? form.category_id : "" });
  };

  const submit = async (e) => {
    e.preventDefault();
    const changes = {};
    if (form.manual_account_id !== initial.manual_account_id) changes.manual_account_id = form.manual_account_id;
    if (form.transaction_date !== initial.transaction_date) changes.transaction_date = `${form.transaction_date}T12:00:00Z`;
    if (Number(form.amount) !== Number(initial.amount)) changes.amount = Number(form.amount);
    if (form.transaction_type !== initial.transaction_type) changes.transaction_type = form.transaction_type;
    if (form.description !== initial.description) changes.description = form.description;
    if (form.category_id !== initial.category_id) changes.category_id = form.category_id || null;
    if (form.notes !== initial.notes) changes.notes = form.notes || null;

    if (Object.keys(changes).length === 0) {
      onClose();
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.put(`/transactions/${tx.id}`, changes);
      toast.success("Transaction updated, balance adjusted");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not update the transaction"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit transaction" description="Account balances are adjusted automatically.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />

        <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-black/30" role="radiogroup" aria-label="Transaction type">
          {[["expense", "Expense"], ["income", "Income"]].map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={form.transaction_type === value}
              onClick={() => setType(value)}
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

        <Field label="Account">
          <Select value={form.manual_account_id} onChange={set("manual_account_id")} required>
            {accountOptions.map((a) => <option key={a.id} value={a.id}>{a.icon_emoji || ""} {a.account_name}</option>)}
          </Select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Amount (€)">
            <Input type="number" step="0.01" min="0.01" value={form.amount} onChange={set("amount")} required />
          </Field>
          <Field label="Date">
            <Input type="date" value={form.transaction_date} onChange={set("transaction_date")} required />
          </Field>
        </div>
        <Field label="Description">
          <Input value={form.description} onChange={set("description")} required maxLength={255} />
        </Field>
        <Field label="Category">
          <Select value={form.category_id} onChange={set("category_id")}>
            <option value="">No category</option>
            {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.icon_emoji || ""} {c.category_name}</option>)}
          </Select>
        </Field>
        <Field label="Notes (optional)">
          <Input value={form.notes} onChange={set("notes")} maxLength={1000} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
