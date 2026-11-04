"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { ColorPicker, EmojiPicker } from "@/components/ui/Pickers";

const EMPTY = { goal_name: "", target_amount: "", target_date: "", color_tag: "blue", icon_emoji: "🏖️" };

export function NewGoalModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/goals", {
        ...form,
        target_amount: Number(form.target_amount),
        target_date: form.target_date || undefined,
      });
      toast.success(`Goal "${form.goal_name}" created`);
      setForm(EMPTY);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Could not create the goal"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New savings goal" description="Set a target and track your progress.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Title">
          <Input value={form.goal_name} onChange={set("goal_name")} placeholder="Vacanza Estiva" required maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target amount (€)">
            <Input type="number" step="0.01" min="0.01" value={form.target_amount} onChange={set("target_amount")} required />
          </Field>
          <Field label="Target date (optional)">
            <Input type="date" value={form.target_date} onChange={set("target_date")} />
          </Field>
        </div>
        <Field label="Icon"><EmojiPicker value={form.icon_emoji} onChange={set("icon_emoji")} /></Field>
        <Field label="Color"><ColorPicker value={form.color_tag} onChange={set("color_tag")} /></Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create goal"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
