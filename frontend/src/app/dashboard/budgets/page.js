"use client";

import { useState } from "react";
import { Plus, Pencil, Trash2, Loader2, Wallet } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getErrorMessage } from "@/lib/errors";
import { formatCurrency } from "@/lib/format";
import { colorFor } from "@/lib/colors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Modal } from "@/components/ui/Modal";
import { BudgetBar, budgetStatusOf } from "@/components/dashboard/BudgetBar";
import { NewBudgetModal, EditBudgetModal } from "@/components/dashboard/BudgetModals";

function monthLabel(period) {
  const date = period?.from ? new Date(`${String(period.from).slice(0, 10)}T12:00:00`) : null;
  if (date && !Number.isNaN(date.getTime())) return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(date);
  return period?.month || "This month";
}

function RemainingText({ budget }) {
  const remaining = Number(budget.remaining);
  if (remaining < 0) return <span className="text-red-400">Over by {formatCurrency(Math.abs(remaining))}</span>;
  return <span className="text-gray-400">{formatCurrency(remaining)} left</span>;
}

function BudgetCard({ budget, onEdit, onDelete }) {
  const hex = colorFor(budget.category_color);
  const status = budgetStatusOf(budget.status);
  const paused = budget.is_active === false;
  const pct = Math.round(Number(budget.percentage) || 0);

  return (
    <Card className={paused ? "opacity-60" : ""}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl" style={{ backgroundColor: `${hex}22` }} aria-hidden="true">
            {budget.category_emoji || "💸"}
          </span>
          <div className="min-w-0">
            <h3 className="truncate font-semibold text-white">{budget.category_name}</h3>
            <p className="text-xs text-gray-500">
              Alert at {budget.alert_threshold}%
              {paused && <span className="ml-2 rounded-full bg-white/10 px-2 py-0.5 text-gray-300">Paused</span>}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={() => onEdit(budget)} aria-label={`Edit budget for ${budget.category_name}`}><Pencil size={14} /></Button>
          <Button size="sm" variant="ghost" onClick={() => onDelete(budget)} aria-label={`Delete budget for ${budget.category_name}`}><Trash2 size={14} /></Button>
        </div>
      </div>

      <div className="mt-4 flex items-baseline justify-between gap-2">
        <p className="tabular-nums text-white">
          <span className="text-lg font-semibold">{formatCurrency(budget.spent)}</span>
          <span className="text-sm text-gray-500"> of {formatCurrency(budget.monthly_limit)}</span>
        </p>
        <p className={`text-sm font-semibold tabular-nums ${status.text}`}>{pct}%</p>
      </div>
      <BudgetBar className="mt-2" percentage={budget.percentage} threshold={budget.alert_threshold} status={budget.status} label={`${budget.category_name} budget`} />
      <div className="mt-2 flex items-center justify-between text-xs">
        <RemainingText budget={budget} />
        {!paused && budget.status !== "ok" && <span className={`font-medium ${status.text}`}>{status.label}</span>}
      </div>
    </Card>
  );
}

function SummaryStrip({ summary }) {
  const totalLimit = Number(summary.totalLimit) || 0;
  const remaining = Number(summary.totalRemaining) || 0;
  const status = Number(summary.exceededCount) > 0 ? "exceeded" : Number(summary.warningCount) > 0 ? "warning" : "ok";
  return (
    <Card>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-gray-400">Total budgeted</p>
          <p className="mt-1 text-lg font-bold text-white tabular-nums sm:text-2xl">{formatCurrency(totalLimit)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">Spent</p>
          <p className="mt-1 text-lg font-bold text-white tabular-nums sm:text-2xl">{formatCurrency(summary.totalSpent)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-400">{remaining < 0 ? "Over by" : "Remaining"}</p>
          <p className={`mt-1 text-lg font-bold tabular-nums sm:text-2xl ${remaining < 0 ? "text-red-400" : "text-green-400"}`}>{formatCurrency(Math.abs(remaining))}</p>
        </div>
      </div>
      <BudgetBar className="mt-4" percentage={summary.percentage} status={status} label="All budgets combined" />
      <p className="mt-2 text-xs text-gray-500">
        {Math.round(Number(summary.percentage) || 0)}% used
        {Number(summary.exceededCount) > 0 && <span className="text-red-400"> · {summary.exceededCount} over budget</span>}
        {Number(summary.warningCount) > 0 && <span className="text-amber-400"> · {summary.warningCount} close to the limit</span>}
      </p>
    </Card>
  );
}

function BudgetsSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading budgets">
      <Skeleton className="h-32" />
      <div className="grid gap-4 md:grid-cols-2"><Skeleton className="h-36" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>
    </div>
  );
}

export default function BudgetsPage() {
  const { data, loading, error, reload } = useApiData("/budgets");
  const { data: categoriesData } = useApiData("/categories");
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toDelete, setToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const confirmDelete = async () => {
    setDeleting(true);
    try {
      await api.delete(`/budgets/${toDelete.id}`);
      toast.success(`Budget for "${toDelete.category_name}" deleted`);
      setToDelete(null);
      reload();
    } catch (err) {
      toast.error(getErrorMessage(err, "Could not delete the budget"));
    } finally {
      setDeleting(false);
    }
  };

  const budgets = data?.budgets || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Budgets</h1>
          {data && <p className="text-sm text-gray-400">{monthLabel(data.period)}</p>}
        </div>
        <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> New Budget</Button>
      </div>

      {loading && !data ? (
        <BudgetsSkeleton />
      ) : error ? (
        <Card className="text-center space-y-3" role="alert">
          <p className="text-red-400">{error}</p>
          <Button variant="secondary" onClick={reload}>Try again</Button>
        </Card>
      ) : budgets.length === 0 ? (
        <Card className="text-center py-12 space-y-3">
          <Wallet className="mx-auto text-gray-600" size={32} />
          <p className="text-gray-400">No budgets yet. Set a monthly limit for a category to keep your spending in check.</p>
          <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> Create your first budget</Button>
        </Card>
      ) : (
        <>
          <SummaryStrip summary={data.summary} />
          <div className="grid gap-4 md:grid-cols-2">
            {budgets.map((b) => <BudgetCard key={b.id} budget={b} onEdit={setEditing} onDelete={setToDelete} />)}
          </div>
        </>
      )}

      <NewBudgetModal
        open={creating}
        onClose={() => setCreating(false)}
        onSaved={reload}
        categories={categoriesData?.categories || []}
        budgetedCategoryIds={budgets.map((b) => b.category_id)}
      />
      {editing && <EditBudgetModal budget={editing} onClose={() => setEditing(null)} onSaved={reload} />}
      <Modal
        open={!!toDelete}
        onClose={() => !deleting && setToDelete(null)}
        title="Delete budget?"
        description={toDelete ? `The monthly limit for "${toDelete.category_name}" will be removed. Your transactions are not affected.` : ""}
      >
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setToDelete(null)} disabled={deleting}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} disabled={deleting}>{deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Delete"}</Button>
        </div>
      </Modal>
    </div>
  );
}
