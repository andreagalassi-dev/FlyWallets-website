"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, PiggyBank, Loader2 } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal, Field, FormError } from "@/components/ui/Modal";
import { GoalProgress } from "@/components/dashboard/GoalProgress";
import { NewGoalModal } from "@/components/dashboard/NewGoalModal";
import { EditGoalModal } from "@/components/dashboard/EditGoalModal";

function ContributeModal({ goal, accounts, onClose, onDone }) {
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post(`/goals/${goal.id}/contribute`, { amount: Number(amount), manual_account_id: accountId || undefined });
      toast.success("Contribution added");
      setAmount("");
      onDone();
      onClose();
    } catch (err) {
      setError(getFriendlyErrorMessage(err, "Could not add the contribution"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={!!goal} onClose={onClose} title={goal ? `Add to "${goal.goal_name}"` : ""}>
      <form onSubmit={submit} className="space-y-4">
        <FormError message={error} />
        <Field label="Amount (€)">
          <Input type="number" step="0.01" min="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required autoFocus />
        </Field>
        <Field label="Take it from">
          <Select value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            <option value="">Don&apos;t move money (just track progress)</option>
            {accounts.filter((a) => a.source === "manual").map((a) => <option key={a.id} value={a.id}>{a.icon_emoji} {a.account_name}</option>)}
          </Select>
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}</Button>
        </div>
      </form>
    </Modal>
  );
}

export default function GoalsPage() {
  const { data, loading, error, reload } = useApiData("/goals");
  const { data: accountsData } = useApiData("/accounts");
  const [creating, setCreating] = useState(false);
  const [contributing, setContributing] = useState(null);
  const [editing, setEditing] = useState(null);

  const remove = async (goal) => {
    try {
      await api.delete(`/goals/${goal.id}`);
      toast.success(`Goal "${goal.goal_name}" removed`);
      reload();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, "Could not remove the goal"));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Savings Goals</h1>
        <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> New Goal</Button>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
      ) : error ? (
        <Card className="text-center text-red-400">{error}</Card>
      ) : data.goals.length === 0 ? (
        <Card className="text-center py-12 text-gray-400">No goals yet. Create one to start saving with a purpose.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {data.goals.map((g) => (
            <Card key={g.id}>
              <GoalProgress goal={g}>
                <div className="flex justify-end gap-2 pt-2">
                  <Button size="sm" variant="secondary" onClick={() => setContributing(g)}><PiggyBank size={14} className="mr-1" /> Contribute</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditing(g)} aria-label={`Edit ${g.goal_name}`}><Pencil size={14} /></Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(g)} aria-label={`Remove ${g.goal_name}`}><Trash2 size={14} /></Button>
                </div>
              </GoalProgress>
            </Card>
          ))}
        </div>
      )}

      <NewGoalModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      {editing && <EditGoalModal key={editing.id} goal={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      {contributing && (
        <ContributeModal goal={contributing} accounts={accountsData?.accounts || []} onClose={() => setContributing(null)} onDone={reload} />
      )}
    </div>
  );
}
