"use client";

import { useState } from "react";
import { Plus, Trash2, Lock, Loader2 } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { CATEGORY_EMOJIS } from "@/lib/colors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { ColorPicker, EmojiPicker } from "@/components/ui/Pickers";
import { CategoryBadge } from "@/components/dashboard/TransactionRow";

const GROUPS = [
  { type: "expense", title: "Expense categories" },
  { type: "income", title: "Income categories" },
  { type: "both", title: "Income & expense" },
];

const EMPTY = { category_name: "", category_type: "expense", color_tag: "blue", icon_emoji: "🛒" };

function NewCategoryModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/categories", form);
      toast.success(`Category "${form.category_name}" created`);
      setForm(EMPTY);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not create the category"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New category" description="Your own categories can be used on any transaction.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name">
            <Input value={form.category_name} onChange={set("category_name")} placeholder="Pets" required maxLength={100} />
          </Field>
          <Field label="Type">
            <Select value={form.category_type} onChange={set("category_type")}>
              <option value="expense">Expense</option>
              <option value="income">Income</option>
              <option value="both">Both</option>
            </Select>
          </Field>
        </div>
        <Field label="Icon"><EmojiPicker value={form.icon_emoji} onChange={set("icon_emoji")} options={CATEGORY_EMOJIS} /></Field>
        <Field label="Color"><ColorPicker value={form.color_tag} onChange={set("color_tag")} /></Field>
        <div className="flex items-center gap-2 text-sm text-gray-500">
          Preview: <CategoryBadge name={form.category_name || "Category"} emoji={form.icon_emoji} color={form.color_tag} />
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create category"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

export default function CategoriesPage() {
  const { data, loading, error, reload } = useApiData("/categories");
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/categories/${toDelete.id}`);
      toast.success(`Category "${toDelete.category_name}" deleted`);
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, "Could not delete the category"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Categories</h1>
        <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> New Category</Button>
      </div>

      {loading && !data ? (
        <div className="space-y-4"><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : error ? (
        <Card className="text-center text-red-400">{error} <Button variant="ghost" size="sm" onClick={reload}>Retry</Button></Card>
      ) : (
        GROUPS.map(({ type, title }) => {
          const items = data.categories.filter((c) => c.category_type === type);
          if (items.length === 0) return null;
          return (
            <section key={type} className="space-y-2" aria-label={title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">{title}</h2>
              <Card className="!py-1">
                {items.map((c) => (
                  <div key={c.id} className="flex items-center justify-between gap-3 py-3 border-b border-white/5 last:border-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <CategoryBadge name={c.category_name} emoji={c.icon_emoji} color={c.color_tag} />
                      <span className="text-xs text-gray-500">{c.is_system ? "System" : "Custom"}</span>
                    </div>
                    {c.is_system ? (
                      <span className="text-gray-600" title="System categories cannot be deleted" aria-label="System category, locked">
                        <Lock size={16} />
                      </span>
                    ) : (
                      <button onClick={() => setToDelete(c)} className="text-gray-600 hover:text-red-400 transition-colors" aria-label={`Delete ${c.category_name}`}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </Card>
            </section>
          );
        })
      )}

      <NewCategoryModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Delete category?"
        description={toDelete ? `"${toDelete.category_name}" will be removed. Transactions using it become uncategorized.` : ""}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
