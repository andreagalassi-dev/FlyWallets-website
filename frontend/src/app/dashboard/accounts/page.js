"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Loader2 } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { AccountCard } from "@/components/dashboard/AccountCard";
import { CreateAccountModal } from "@/components/dashboard/CreateAccountModal";
import { EditAccountModal } from "@/components/dashboard/EditAccountModal";

export default function AccountsPage() {
  const { data, loading, error, reload } = useApiData("/accounts");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      const res = await api.delete(`/accounts/manual/${toDelete.id}`);
      toast.success(res.data.data.archived ? "Account archived (its history is kept)" : "Account deleted");
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, "Could not remove the account"));
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Accounts</h1>
        <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> Add Account</Button>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /></div>
      ) : error ? (
        <Card className="text-center text-red-400">{error} <Button variant="ghost" size="sm" onClick={reload}>Retry</Button></Card>
      ) : data.accounts.length === 0 ? (
        <Card className="text-center py-12 text-gray-400">No accounts yet. Create your first one to start tracking.</Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.accounts.map((a) => (
            <AccountCard key={a.id} account={a}>
              {a.source === "manual" && (
                <div className="mt-3 flex justify-end gap-3">
                  <button onClick={() => setEditing(a)} className="text-gray-500 hover:text-primary transition-colors" aria-label={`Edit ${a.account_name}`}>
                    <Pencil size={16} />
                  </button>
                  <button onClick={() => setToDelete(a)} className="text-gray-500 hover:text-red-400 transition-colors" aria-label={`Remove ${a.account_name}`}>
                    <Trash2 size={16} />
                  </button>
                </div>
              )}
            </AccountCard>
          ))}
        </div>
      )}

      <CreateAccountModal open={creating} onClose={() => setCreating(false)} onCreated={reload} />
      {editing && <EditAccountModal key={editing.id} account={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <Modal open={!!toDelete} onClose={() => setToDelete(null)} title="Remove account?" description={toDelete ? `"${toDelete.account_name}" will disappear from your dashboard. If it has transactions it is archived and the history is kept.` : ""}>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Remove"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
