"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toDateInputValue } from "@/lib/format";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { ColorPicker, EmojiPicker } from "@/components/ui/Pickers";

/** Edit a savings goal. Render only while `goal` is set (use `key={goal.id}`): the form is prefilled once. */
export function EditGoalModal({ goal, onClose, onSaved }) {
  const [form, setForm] = useState({
    goal_name: goal.goal_name || "",
    target_amount: String(Number(goal.target_amount)),
    target_date: toDateInputValue(goal.target_date),
    color_tag: goal.color_tag || "blue",
    icon_emoji: goal.icon_emoji || "🏖️",
    is_completed: !!goal.is_completed,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const body = {
        goal_name: form.goal_name,
        target_amount: Number(form.target_amount),
        color_tag: form.color_tag,
        icon_emoji: form.icon_emoji,
      };
      // The API cannot clear a date, so an empty field simply leaves it as is
      if (form.target_date) body.target_date = form.target_date;
      // Only sent when toggled: otherwise the server derives it from the saved amount vs the target
      if (form.is_completed !== !!goal.is_completed) body.is_completed = form.is_completed;
      await api.put(`/goals/${goal.id}`, body);
      toast.success(`Goal "${form.goal_name}" updated`);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not update the goal"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit savings goal">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Title">
          <Input value={form.goal_name} onChange={set("goal_name")} required maxLength={100} />
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
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_completed}
            onChange={(e) => setForm({ ...form, is_completed: e.target.checked })}
            className="h-4 w-4 accent-[#D4AF37]"
          />
          <span className="text-sm text-gray-300">Mark as completed {goal.is_completed && <span className="text-gray-500">(untick to re-open)</span>}</span>
        </label>
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
