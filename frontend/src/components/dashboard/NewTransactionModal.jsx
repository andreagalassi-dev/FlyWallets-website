"use client";

import { useMemo, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { todayInputValue } from "@/lib/format";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";

const emptyForm = (accountId = "") => ({
  manual_account_id: accountId,
  transaction_date: todayInputValue(),
  amount: "",
  transaction_type: "expense",
  description: "",
  category_id: "",
  notes: "",
});

export function NewTransactionModal({ open, onClose, onCreated, accounts = [], categories = [] }) {
  const manualAccounts = accounts.filter((a) => a.source === "manual");
  const [form, setForm] = useState(emptyForm());
  const [loading, setLoading] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  // Only categories compatible with the selected type
  const visibleCategories = useMemo(
    () => categories.filter((c) => c.category_type === "both" || c.category_type === form.transaction_type),
    [categories, form.transaction_type]
  );
  const accountId = form.manual_account_id || manualAccounts[0]?.id || "";

  const suggest = async () => {
    if (form.description.trim().length < 2) {
      setError("Type a description first, then ask for a suggestion");
      return;
    }
    setSuggesting(true);
    setError("");
    try {
      const res = await api.post("/ai/categorize", {
        description: form.description,
        amount: Number(form.amount) || undefined,
        transaction_type: form.transaction_type,
      });
      const s = res.data.data.suggestion;
      if (s) {
        setForm((f) => ({ ...f, category_id: s.category_id }));
        toast.info(`Suggested: ${s.icon_emoji || ""} ${s.category_name}`);
      }
    } catch (err) {
      setError(getErrorMessage(err, "Could not get a suggestion"));
    } finally {
      setSuggesting(false);
    }
  };

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/transactions", {
        manual_account_id: accountId,
        transaction_date: `${form.transaction_date}T12:00:00Z`,
        amount: Number(form.amount),
        transaction_type: form.transaction_type,
        description: form.description,
        category_id: form.category_id || undefined,
        notes: form.notes || undefined,
      });
      toast.success("Transaction saved");
      setForm(emptyForm(accountId));
      onCreated?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Could not save the transaction"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New transaction" description="The account balance updates immediately.">
      {manualAccounts.length === 0 ? (
        <p className="text-sm text-gray-400">Create a manual account first, then you can record transactions on it.</p>
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

          <Field label="Account">
            <Select value={accountId} onChange={set("manual_account_id")} required>
              {manualAccounts.map((a) => <option key={a.id} value={a.id}>{a.icon_emoji || ""} {a.account_name}</option>)}
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
            <Input value={form.description} onChange={set("description")} placeholder="Esselunga Milano" required maxLength={255} />
          </Field>
          <Field label="Category">
            <div className="flex gap-2">
              <Select value={form.category_id} onChange={set("category_id")}>
                <option value="">Automatic</option>
                {visibleCategories.map((c) => <option key={c.id} value={c.id}>{c.icon_emoji || ""} {c.category_name}</option>)}
              </Select>
              <Button type="button" variant="secondary" size="icon" onClick={suggest} disabled={suggesting} title="Suggest a category" aria-label="Suggest a category">
                {suggesting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary" />}
              </Button>
            </div>
          </Field>
          <Field label="Notes (optional)">
            <Input value={form.notes} onChange={set("notes")} maxLength={1000} />
          </Field>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save transaction"}
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
