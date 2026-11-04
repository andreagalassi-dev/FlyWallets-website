"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ArrowDownRight, Plus, Wallet, MailWarning, RefreshCw } from "lucide-react";
import useApiData from "@/hooks/useApiData";
import useAuthStore from "@/store/authStore";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { AccountCard } from "@/components/dashboard/AccountCard";
import { TransactionRow } from "@/components/dashboard/TransactionRow";
import { GoalProgress } from "@/components/dashboard/GoalProgress";
import { CreateAccountModal } from "@/components/dashboard/CreateAccountModal";
import { NewTransactionModal } from "@/components/dashboard/NewTransactionModal";
import { NewGoalModal } from "@/components/dashboard/NewGoalModal";
import { NetWorthCard, SpendingCard } from "@/components/charts/ChartCards";

function DashboardSkeleton() {
  return (
    <div className="space-y-8" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Skeleton className="h-32 col-span-2" />
        <Skeleton className="h-32" />
        <Skeleton className="h-32" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-80" /><Skeleton className="h-80" />
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
      </div>
      <div className="grid gap-4 lg:grid-cols-7">
        <Skeleton className="h-72 lg:col-span-4" />
        <Skeleton className="h-72 lg:col-span-3" />
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useApiData("/dashboard");
  const user = useAuthStore((s) => s.user);
  const [modal, setModal] = useState(null); // 'account' | 'transaction' | 'goal'
  const close = () => setModal(null);
  // The chart cards fetch on their own; bumping this key re-fetches them after money moved
  const [chartsKey, setChartsKey] = useState(0);
  const reloadWithCharts = () => {
    reload();
    setChartsKey((k) => k + 1);
  };

  if (loading && !data) return <DashboardSkeleton />;

  if (error && !data) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <p className="text-red-400 mb-4">{error}</p>
        <Button variant="secondary" onClick={reload}><RefreshCw size={16} className="mr-2" /> Retry</Button>
      </Card>
    );
  }

  const { summary, accounts, recentTransactions, savingsGoals, categories } = data;
  const positive = summary.netChangePercentage >= 0;

  return (
    <div className="space-y-8">
      {user && user.email_verified === false && (
        <Link
          href="/register/verify-email"
          className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-primary hover:bg-primary/20 transition-colors"
        >
          <MailWarning size={18} /> Verify your e-mail address to secure your account →
        </Link>
      )}

      {/* Section 1: Total Balance */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card className="col-span-2 bg-gradient-to-br from-primary/10 to-transparent border-primary/20">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-primary">Total Balance</CardTitle>
            <Wallet className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-white tabular-nums">{formatCurrency(summary.totalBalance)}</div>
            <p className="text-xs text-gray-400 mt-1">
              <span className={`${positive ? "text-green-500" : "text-red-500"} inline-flex items-center mr-1`}>
                {positive ? <ArrowUpRight size={12} className="mr-1" /> : <ArrowDownRight size={12} className="mr-1" />}
                {positive ? "+" : ""}{summary.netChangePercentage}%
              </span>
              this month
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Income (Mo)</CardTitle>
            <ArrowUpRight className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{formatCurrency(summary.monthlyIncome)}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Expense (Mo)</CardTitle>
            <ArrowDownRight className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent><div className="text-2xl font-bold tabular-nums">{formatCurrency(summary.monthlyExpense)}</div></CardContent>
        </Card>
      </div>

      {/* Section 1b: Charts (independent requests: the dashboard never waits for them) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <NetWorthCard refreshKey={chartsKey} className="min-w-0" />
        <SpendingCard refreshKey={chartsKey} className="min-w-0" />
      </div>

      {/* Section 2: Accounts */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-white">Your Accounts</h2>
          <Button size="sm" variant="secondary" onClick={() => setModal("account")}>
            <Plus size={16} className="mr-2" /> Add Account
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          {accounts.map((a) => <AccountCard key={a.id} account={a} />)}
          <button
            onClick={() => setModal("account")}
            className="glass-card border-dashed !border-white/20 !bg-transparent flex items-center justify-center min-h-[104px] hover:!bg-white/5 transition-colors"
          >
            <div className="text-center text-gray-500">
              <Plus className="mx-auto h-8 w-8 mb-2 opacity-50" />
              <span className="text-sm">Create Manual Account</span>
            </div>
          </button>
        </div>
      </div>

      {/* Section 3: Recent Transactions & Goals */}
      <div className="grid gap-4 lg:grid-cols-7">
        <Card className="lg:col-span-4">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent Transactions</CardTitle>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => setModal("transaction")}><Plus size={16} className="mr-1" /> New</Button>
              <Link href="/dashboard/transactions"><Button size="sm" variant="ghost">View all</Button></Link>
            </div>
          </CardHeader>
          <CardContent>
            {recentTransactions.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">No transactions yet.</div>
            ) : (
              recentTransactions.map((tx) => <TransactionRow key={tx.id} tx={tx} />)
            )}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Savings Goals</CardTitle>
            <Button size="sm" variant="secondary" onClick={() => setModal("goal")}><Plus size={16} className="mr-1" /> New</Button>
          </CardHeader>
          <CardContent className="space-y-5">
            {savingsGoals.length === 0 ? (
              <div className="text-center py-10 text-gray-500 text-sm">No goals set.</div>
            ) : (
              savingsGoals.map((g) => <GoalProgress key={g.id} goal={g} />)
            )}
          </CardContent>
        </Card>
      </div>

      <CreateAccountModal open={modal === "account"} onClose={close} onCreated={reloadWithCharts} />
      <NewTransactionModal open={modal === "transaction"} onClose={close} onCreated={reloadWithCharts} accounts={accounts} categories={categories} />
      <NewGoalModal open={modal === "goal"} onClose={close} onCreated={reload} />
    </div>
  );
}
