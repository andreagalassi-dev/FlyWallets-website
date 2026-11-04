"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Trash2, Pencil, Search, ChevronLeft, ChevronRight } from "lucide-react";
import api from "@/lib/api";
import useApiData from "@/hooks/useApiData";
import { getFriendlyErrorMessage } from "@/lib/errors";
import { toast } from "@/store/toastStore";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { TransactionRow } from "@/components/dashboard/TransactionRow";
import { NewTransactionModal } from "@/components/dashboard/NewTransactionModal";
import { ImportExportMenu } from "@/components/dashboard/ImportExportMenu";
import { EditTransactionModal } from "@/components/dashboard/EditTransactionModal";

const LIMIT = 15;

function TransactionsContent() {
  // `?search=` comes from the header search box
  const urlSearch = useSearchParams().get("search") || "";
  const [filters, setFilters] = useState({ search: urlSearch, account_id: "", category_id: "", type: "", from_date: "", to_date: "" });
  const [page, setPage] = useState(1);
  const [appliedUrlSearch, setAppliedUrlSearch] = useState(urlSearch);
  // A new header search while already on this page: apply it (state adjusted during render)
  if (urlSearch !== appliedUrlSearch) {
    setAppliedUrlSearch(urlSearch);
    setFilters({ ...filters, search: urlSearch });
    setPage(1);
  }
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const { data: accountsData } = useApiData("/accounts");
  const { data: categoriesData } = useApiData("/categories");

  const query = useMemo(() => {
    const params = new URLSearchParams({ page, limit: LIMIT });
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    return `/transactions?${params}`;
  }, [filters, page]);
  const { data, loading, error, reload } = useApiData(query);

  const setFilter = (key) => (e) => {
    setFilters({ ...filters, [key]: e.target.value });
    setPage(1);
  };

  const remove = async (tx) => {
    try {
      await api.delete(`/transactions/${tx.id}`);
      toast.success("Transaction deleted, balance updated");
      reload();
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, "Could not delete the transaction"));
    }
  };

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Transactions</h1>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportMenu filters={filters} accounts={accountsData?.accounts || []} onImported={reload} />
          <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" /> New Transaction</Button>
        </div>
      </div>

      <Card className="!p-4 grid gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="relative lg:col-span-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={16} />
          <Input className="pl-9" placeholder="Search description…" value={filters.search} onChange={setFilter("search")} aria-label="Search" />
        </div>
        <Select value={filters.account_id} onChange={setFilter("account_id")} aria-label="Account">
          <option value="">All accounts</option>
          {accountsData?.accounts.map((a) => <option key={a.id} value={a.id}>{a.account_name}</option>)}
        </Select>
        <Select value={filters.category_id} onChange={setFilter("category_id")} aria-label="Category">
          <option value="">All categories</option>
          {categoriesData?.categories.map((c) => <option key={c.id} value={c.id}>{c.icon_emoji} {c.category_name}</option>)}
        </Select>
        <Select value={filters.type} onChange={setFilter("type")} aria-label="Type">
          <option value="">Income & expense</option>
          <option value="income">Income</option>
          <option value="expense">Expense</option>
        </Select>
        <div className="flex gap-2 md:col-span-3 lg:col-span-2">
          <Input type="date" value={filters.from_date} onChange={setFilter("from_date")} aria-label="From date" />
          <Input type="date" value={filters.to_date} onChange={setFilter("to_date")} aria-label="To date" />
        </div>
      </Card>

      <Card className="!py-2">
        {loading && !data ? (
          <div className="space-y-3 py-4">{[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : error ? (
          <p className="py-8 text-center text-red-400">{error}</p>
        ) : data.transactions.length === 0 ? (
          <p className="py-12 text-center text-gray-500 text-sm">No transactions match these filters.</p>
        ) : (
          data.transactions.map((tx) => (
            <TransactionRow
              key={tx.id}
              tx={tx}
              action={
                tx.manual_account_id && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => setEditing(tx)} className="text-gray-600 hover:text-primary transition-colors" aria-label={`Edit ${tx.description}`}>
                      <Pencil size={16} />
                    </button>
                    <button onClick={() => remove(tx)} className="text-gray-600 hover:text-red-400 transition-colors" aria-label={`Delete ${tx.description}`}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                )
              }
            />
          ))
        )}
      </Card>

      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-center gap-4 text-sm text-gray-400">
          <Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={16} /> Prev</Button>
          <span>Page {pagination.page} of {pagination.totalPages} · {pagination.total} transactions</span>
          <Button variant="ghost" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>Next <ChevronRight size={16} /></Button>
        </div>
      )}

      <NewTransactionModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={reload}
        accounts={accountsData?.accounts || []}
        categories={categoriesData?.categories || []}
      />
      {editing && (
        <EditTransactionModal
          key={editing.id}
          tx={editing}
          onClose={() => setEditing(null)}
          onSaved={reload}
          accounts={accountsData?.accounts || []}
          categories={categoriesData?.categories || []}
        />
      )}
    </div>
  );
}

export default function TransactionsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64" />}>
      <TransactionsContent />
    </Suspense>
  );
}
