"use client";

import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";

function ThresholdField({ value, onChange }) {
  return (
    <Field label="Alert me at">
      <div className="flex items-center gap-3">
        <input
          type="range"
          min={1}
          max={100}
          step={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          aria-label="Alert threshold percentage"
          className="flex-1 accent-[#D4AF37]"
        />
        <div className="relative w-24 shrink-0">
          <Input type="number" min={1} max={100} step={1} value={value} onChange={(e) => onChange(e.target.value)} required aria-label="Alert threshold percentage" className="pr-7" />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-500">%</span>
        </div>
      </div>
      <p className="text-xs text-gray-500">You get a warning in the bell when spending reaches this share of the limit.</p>
    </Field>
  );
}

export function NewBudgetModal({ open, onClose, onSaved, categories = [], budgetedCategoryIds = [] }) {
  const available = useMemo(
    () => categories.filter((c) => (c.category_type === "expense" || c.category_type === "both") && !budgetedCategoryIds.includes(c.id)),
    [categories, budgetedCategoryIds]
  );
  const [form, setForm] = useState({ category_id: "", monthly_limit: "", alert_threshold: "80" });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const categoryId = form.category_id || available[0]?.id || "";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/budgets", {
        category_id: categoryId,
        monthly_limit: Number(form.monthly_limit),
        alert_threshold: Number(form.alert_threshold),
      });
      toast.success("Budget created");
      setForm({ category_id: "", monthly_limit: "", alert_threshold: "80" });
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the budget"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New budget" description="Set a monthly spending limit for a category.">
      {available.length === 0 ? (
        <div className="space-y-4">
          <p className="text-sm text-gray-400">Every expense category already has a budget. Create a custom category first to budget something else.</p>
          <div className="flex justify-end"><Button type="button" variant="ghost" onClick={onClose}>Close</Button></div>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <FormError message={error} />
          <Field label="Category">
            <Select value={categoryId} onChange={(e) => setForm({ ...form, category_id: e.target.value })} required>
              {available.map((c) => <option key={c.id} value={c.id}>{c.icon_emoji || ""} {c.category_name}</option>)}
            </Select>
          </Field>
          <Field label="Monthly limit (€)">
            <Input type="number" step="0.01" min="0.01" value={form.monthly_limit} onChange={(e) => setForm({ ...form, monthly_limit: e.target.value })} required autoFocus />
          </Field>
          <ThresholdField value={form.alert_threshold} onChange={(v) => setForm({ ...form, alert_threshold: v })} />
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create budget"}</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function EditBudgetModal({ budget, onClose, onSaved }) {
  const [form, setForm] = useState({
    monthly_limit: String(Number(budget.monthly_limit)),
    alert_threshold: String(budget.alert_threshold),
    is_active: budget.is_active !== false,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.put(`/budgets/${budget.id}`, {
        monthly_limit: Number(form.monthly_limit),
        alert_threshold: Number(form.alert_threshold),
        is_active: form.is_active,
      });
      toast.success("Budget updated");
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Could not update the budget"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title={`Edit budget: ${budget.category_emoji || ""} ${budget.category_name}`}>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Monthly limit (€)">
          <Input type="number" step="0.01" min="0.01" value={form.monthly_limit} onChange={(e) => setForm({ ...form, monthly_limit: e.target.value })} required autoFocus />
        </Field>
        <ThresholdField value={form.alert_threshold} onChange={(v) => setForm({ ...form, alert_threshold: v })} />
        <label className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/20 px-3 py-2.5 cursor-pointer">
          <span>
            <span className="block text-sm font-medium text-gray-200">Active</span>
            <span className="block text-xs text-gray-500">Pause to stop tracking and alerts without losing the budget.</span>
          </span>
          <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} className="h-4 w-4 accent-[#D4AF37]" />
        </label>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}</Button>
        </div>
      </form>
    </Modal>
  );
}
