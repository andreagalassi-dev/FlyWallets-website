"use client";

import { Sparkles, Lightbulb } from "lucide-react";
import useApiData from "@/hooks/useApiData";
import { formatCurrency } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SpendingCard } from "@/components/charts/ChartCards";

export default function StatsPage() {
  const { data, loading, error } = useApiData("/ai/insights");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Statistics</h1>
        <p className="text-sm text-gray-400">Income, expenses and insights from your last 30 days; spending for the range you choose.</p>
      </div>

      {loading && !data ? (
        <div className="grid gap-4 md:grid-cols-3"><Skeleton className="h-32" /><Skeleton className="h-32" /><Skeleton className="h-32" /></div>
      ) : error ? (
        <Card className="text-center text-red-400">{error}</Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardDescription>Income (30 days)</CardDescription><p className="text-2xl font-bold text-green-400 mt-1">{formatCurrency(data.totals.income)}</p></Card>
            <Card><CardDescription>Expenses (30 days)</CardDescription><p className="text-2xl font-bold text-red-400 mt-1">{formatCurrency(data.totals.expense)}</p></Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Sparkles size={18} className="text-primary" /> Financial insights
                <span className="ml-auto text-[11px] font-normal uppercase tracking-wide text-gray-500">
                  {data.source === "ai" ? "AI generated" : "Smart rules"}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-3">
              {data.tips.map((tip, i) => (
                <div key={i} className="rounded-lg bg-white/5 border border-white/5 p-4">
                  <Lightbulb size={18} className="text-primary mb-2" />
                  <p className="font-medium text-white text-sm">{tip.title}</p>
                  <p className="text-sm text-gray-400 mt-1">{tip.message}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* Independent of the insights request: has its own range selector and loading / error states */}
      <SpendingCard size={208} />
    </div>
  );
}
