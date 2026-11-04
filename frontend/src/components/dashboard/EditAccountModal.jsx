"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { overdraftFormState, overdraftPayload } from "@/lib/overdraft";
import { formatCurrency } from "@/lib/format";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { ColorPicker, EmojiPicker } from "@/components/ui/Pickers";
import { OverdraftFields } from "@/components/dashboard/OverdraftFields";

/** Edit a manual account. Render only while `account` is set (use `key={account.id}`): the form is prefilled once. */
export function EditAccountModal({ account, onClose, onSaved }) {
  const [form, setForm] = useState({
    account_name: account.account_name || "",
    icon_emoji: account.icon_emoji || "🏦",
    color_tag: account.color_tag || "gold",
    description: account.description || "",
    ...overdraftFormState(account),
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.put(`/accounts/manual/${account.id}`, {
        account_name: form.account_name,
        icon_emoji: form.icon_emoji,
        color_tag: form.color_tag,
        description: form.description,
        ...overdraftPayload(form),
      });
      toast.success(`Account "${form.account_name}" updated`);
      onSaved?.();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not update the account"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open onClose={onClose} title="Edit account" description={`Current balance: ${formatCurrency(account.current_balance, account.currency)}. It changes through transactions.`}>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Name">
          <Input value={form.account_name} onChange={set("account_name")} required maxLength={100} />
        </Field>
        <Field label="Icon"><EmojiPicker value={form.icon_emoji} onChange={set("icon_emoji")} /></Field>
        <Field label="Color"><ColorPicker value={form.color_tag} onChange={set("color_tag")} /></Field>
        <Field label="Description (optional)">
          <Input value={form.description} onChange={set("description")} maxLength={500} />
        </Field>
        <OverdraftFields
          value={{ overdraft_allowed: form.overdraft_allowed, overdraft_limit: form.overdraft_limit }}
          onChange={(v) => setForm({ ...form, ...v })}
        />
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
