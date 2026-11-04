"use client";

import { useState } from "react";
import { RefreshCw, ArrowUpRight, ArrowDownRight } from "lucide-react";
import useApiData from "@/hooks/useApiData";
import { formatCurrency } from "@/lib/format";
import { Card, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import AreaChart from "./AreaChart";
import DonutChart from "./DonutChart";
import RangeSelector, { rangeLabel } from "./RangeSelector";

// `refreshKey` lets the parent force a re-fetch (e.g. after a new transaction) without resetting the range
const chartPath = (endpoint, days, refreshKey) => `/dashboard/${endpoint}?days=${days}${refreshKey ? `&r=${refreshKey}` : ""}`;

function ChartError({ message, onRetry, height }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 text-center" style={{ minHeight: height }}>
      <p className="text-sm text-red-400">{message}</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>
        <RefreshCw size={14} className="mr-2" /> Retry
      </Button>
    </div>
  );
}

function CardHead({ title, subtitle, days, setDays }) {
  return (
    <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <CardTitle className="text-lg">{title}</CardTitle>
        <p className="mt-1 text-xs text-gray-400">{subtitle ?? rangeLabel(days)}</p>
      </div>
      <RangeSelector value={days} onChange={setDays} label={`${title} time range`} />
    </CardHeader>
  );
}

/** Net worth over time (sum of the active manual accounts), with a 30D / 90D / 1Y selector. */
export function NetWorthCard({ refreshKey = 0, className }) {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useApiData(chartPath("networth", days, refreshKey));
  const height = 220;

  let body;
  if (loading && !data) {
    body = (
      <div aria-busy="true" aria-label="Loading net worth chart">
        <Skeleton className="mb-4 h-7 w-40" />
        <div style={{ height }}><Skeleton className="h-full w-full" /></div>
      </div>
    );
  } else if (error && !data) {
    body = <ChartError message={error} onRetry={reload} height={height + 44} />;
  } else {
    const empty = data.series.every((p) => p.total === 0);
    const up = data.change >= 0;
    body = (
      <div className={loading ? "opacity-60 motion-safe:transition-opacity" : undefined} aria-busy={loading}>
        <div className="mb-3 flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-2xl font-bold tabular-nums text-white">{formatCurrency(data.end)}</span>
          {!empty && (
            <span className={`inline-flex items-center text-xs tabular-nums ${up ? "text-green-400" : "text-red-400"}`}>
              {up ? <ArrowUpRight size={14} aria-hidden="true" /> : <ArrowDownRight size={14} aria-hidden="true" />}
              {up ? "+" : "−"}
              {formatCurrency(Math.abs(data.change))}
              {data.changePercentage != null &&
                ` (${up ? "+" : "−"}${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(Math.abs(data.changePercentage))}%)`}
            </span>
          )}
        </div>
        {empty ? (
          <div className="flex items-center justify-center rounded-lg border border-dashed border-white/10 text-center text-sm text-gray-400" style={{ height }}>
            <p className="max-w-[16rem] px-4">No balance history yet. Add an account or a transaction to see your net worth over time.</p>
          </div>
        ) : (
          <AreaChart series={data.series} title={`Net worth, ${rangeLabel(days)}`} height={height} />
        )}
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHead title="Net worth" days={days} setDays={setDays} />
      {body}
    </Card>
  );
}

/** Expenses by category for the selected range (donut + legend). */
export function SpendingCard({ refreshKey = 0, className, size = 176 }) {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useApiData(chartPath("spending", days, refreshKey));

  let body;
  if (loading && !data) {
    body = (
      <div className="flex flex-col items-center gap-6 sm:flex-row" aria-busy="true" aria-label="Loading spending chart">
        <div className="shrink-0" style={{ width: size, height: size }}><Skeleton className="h-full w-full rounded-full" /></div>
        <div className="w-full flex-1 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-5 w-full" />)}
        </div>
      </div>
    );
  } else if (error && !data) {
    body = <ChartError message={error} onRetry={reload} height={size} />;
  } else {
    body = (
      <div className={loading ? "opacity-60 motion-safe:transition-opacity" : undefined} aria-busy={loading}>
        <DonutChart
          categories={data.categories}
          total={data.total}
          size={size}
          title={`Spending by category, ${rangeLabel(days)}`}
          emptyText={`No expenses in the ${rangeLabel(days)}.`}
        />
      </div>
    );
  }

  return (
    <Card className={className}>
      <CardHead title="Spending by category" days={days} setDays={setDays} />
      {body}
    </Card>
  );
}
