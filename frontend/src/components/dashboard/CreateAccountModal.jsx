"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import api from "@/lib/api";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { ColorPicker, EmojiPicker } from "@/components/ui/Pickers";
import { OverdraftFields } from "@/components/dashboard/OverdraftFields";
import { overdraftPayload } from "@/lib/overdraft";

export const ACCOUNT_TYPES = [
  { value: "checking", label: "Checking account" },
  { value: "savings", label: "Savings" },
  { value: "wallet", label: "Digital wallet" },
  { value: "cash", label: "Cash" },
];

const EMPTY = { account_name: "", account_type: "checking", initial_balance: "0", color_tag: "gold", icon_emoji: "🏦", description: "", overdraft_allowed: false, overdraft_limit: "" };

export function CreateAccountModal({ open, onClose, onCreated }) {
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target?.value ?? e });

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const { overdraft_allowed, overdraft_limit, ...fields } = form;
      await api.post("/accounts/manual", {
        ...fields,
        initial_balance: Number(form.initial_balance) || 0,
        description: form.description || undefined,
        ...overdraftPayload({ overdraft_allowed, overdraft_limit }),
      });
      toast.success(`Account "${form.account_name}" created`);
      setForm(EMPTY);
      onCreated?.();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not create the account"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="New manual account" description="Track a bank account, wallet or cash by hand.">
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Name">
          <Input value={form.account_name} onChange={set("account_name")} placeholder="Conto Principale" required maxLength={100} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            <Select value={form.account_type} onChange={set("account_type")}>
              {ACCOUNT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </Select>
          </Field>
          <Field label="Initial balance (€)">
            <Input type="number" step="0.01" value={form.initial_balance} onChange={set("initial_balance")} required />
          </Field>
        </div>
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
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
