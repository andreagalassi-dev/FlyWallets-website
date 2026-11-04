"use client";

export const CHART_RANGES = [
  { days: 30, label: "30D", long: "last 30 days" },
  { days: 90, label: "90D", long: "last 90 days" },
  { days: 365, label: "1Y", long: "last 12 months" },
];

export const rangeLabel = (days) => CHART_RANGES.find((r) => r.days === days)?.long ?? `last ${days} days`;

/** Segmented 30D / 90D / 1Y control (toggle buttons with aria-pressed). */
export default function RangeSelector({ value, onChange, label = "Time range" }) {
  return (
    <div role="group" aria-label={label} className="inline-flex shrink-0 rounded-lg border border-white/10 bg-white/[0.04] p-0.5">
      {CHART_RANGES.map((r) => {
        const on = r.days === value;
        return (
          <button
            key={r.days}
            type="button"
            aria-pressed={on}
            aria-label={r.long}
            onClick={() => onChange(r.days)}
            className={`min-h-[30px] rounded-md px-2.5 text-xs font-medium tabular-nums outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
              on ? "bg-primary/15 text-primary" : "text-gray-400 hover:text-white"
            }`}
          >
            {r.label}
          </button>
        );
      })}
    </div>
  );
}
