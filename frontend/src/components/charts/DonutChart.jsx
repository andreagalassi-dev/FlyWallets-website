"use client";

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { arcPath, categoryColor, donutAngles } from "@/lib/chartUtils";

const VIEW = 200;
const C = VIEW / 2;
const R_OUTER = 92;
const R_ACTIVE = 99;
const R_INNER = 64;
const PAD_ANGLE = 2.5 / R_OUTER; // ≈ 2.5px gap at the outer edge
const MIN_ANGLE = 0.045; // ≈ 2.6°: the smallest slice stays visible / hoverable

// Rounded percentage; a non-zero amount that rounds to 0 shows as "<0,1%"
const pct = (v, amount = 0) =>
  v === 0 && amount > 0 ? "<0,1%" : `${new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(v)}%`;

/**
 * Spending by category: donut + legend.
 * - categories: [{ key, name, emoji, total, percentage, count? }] sorted desc ("Other" last, neutral colour)
 * - Hover a slice or a legend row (or focus a legend row) to highlight it; click / tap a legend row to pin it.
 *   The centre shows the total, or the highlighted category.
 */
export default function DonutChart({ categories, total, currency = "EUR", size = 176, title = "Spending by category", emptyText = "No expenses in this period." }) {
  const [hovered, setHovered] = useState(null);
  const [pinned, setPinned] = useState(null);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const activeKey = hovered ?? pinned;

  const angles = donutAngles(categories.map((c) => c.total), { padAngle: PAD_ANGLE, minAngle: MIN_ANGLE });
  const active = categories.find((c) => c.key === activeKey) || null;
  const empty = !(total > 0) || categories.length === 0;

  const label = empty
    ? `${title}: ${emptyText}`
    : `${title}, total ${formatCurrency(total, currency)}: ` +
      categories.map((c) => `${c.name} ${formatCurrency(c.total, currency)} (${pct(c.percentage, c.total)})`).join(", ");

  return (
    <div className="flex w-full flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative shrink-0" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${VIEW} ${VIEW}`} role="img" aria-label={label} className="block overflow-visible">
          {empty ? (
            <circle cx={C} cy={C} r={(R_OUTER + R_INNER) / 2} fill="none" stroke="white" strokeOpacity="0.08" strokeWidth={R_OUTER - R_INNER} />
          ) : (
            categories.map((c, i) => {
              const a = angles[i];
              if (!a) return null;
              const isActive = c.key === activeKey;
              return (
                <path
                  key={c.key}
                  d={arcPath(C, C, isActive ? R_ACTIVE : R_OUTER, R_INNER, a.start, a.end)}
                  fill={categoryColor(c, i)}
                  opacity={activeKey && !isActive ? 0.3 : 1}
                  className="cursor-pointer motion-safe:transition-opacity motion-safe:duration-200"
                  onPointerEnter={() => setHovered(c.key)}
                  onPointerLeave={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === c.key ? null : c.key))}
                  aria-hidden="true"
                />
              );
            })
          )}
        </svg>

        {/* centre label (HTML so long names wrap/truncate nicely) */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center" aria-hidden="true">
          <div style={{ maxWidth: size * (R_INNER / VIEW) * 1.75 }} className="min-w-0 px-1">
            {empty ? (
              <p className="text-xs text-gray-400">No expenses</p>
            ) : active ? (
              <>
                <p className="truncate text-[11px] text-gray-300">
                  {active.emoji ? `${active.emoji} ` : ""}
                  {active.name}
                </p>
                <p className="text-base font-semibold tabular-nums text-white">{formatCurrency(active.total, currency)}</p>
                <p className="text-[11px] tabular-nums text-gray-400">{pct(active.percentage, active.total)}</p>
              </>
            ) : (
              <>
                <p className="text-[11px] uppercase tracking-wide text-gray-400">Total</p>
                <p className="text-base font-semibold tabular-nums text-white">{formatCurrency(total, currency)}</p>
              </>
            )}
          </div>
        </div>
      </div>

      {empty ? (
        <p className="flex-1 text-center text-sm text-gray-400 sm:text-left">{emptyText}</p>
      ) : (
        <ul className="w-full min-w-0 flex-1 space-y-0.5" aria-label={`${title} legend`} id={`${uid}-legend`}>
          {categories.map((c, i) => {
            const isActive = c.key === activeKey;
            const dim = activeKey && !isActive;
            return (
              <li key={c.key}>
                <button
                  type="button"
                  aria-pressed={pinned === c.key}
                  onPointerEnter={() => setHovered(c.key)}
                  onPointerLeave={() => setHovered(null)}
                  onFocus={() => setHovered(c.key)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setPinned((p) => (p === c.key ? null : c.key))}
                  className={`flex w-full min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm outline-none motion-safe:transition-colors focus-visible:ring-2 focus-visible:ring-primary/60 ${
                    isActive ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"
                  } ${dim ? "opacity-60" : ""}`}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: categoryColor(c, i) }} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate text-gray-200" title={c.count ? `${c.name} (${c.count} categories)` : c.name}>
                    {c.emoji ? <span aria-hidden="true">{c.emoji} </span> : null}
                    {c.name}
                    {c.count ? <span className="text-gray-500"> · {c.count}</span> : null}
                  </span>
                  <span className="shrink-0 tabular-nums text-white">{formatCurrency(c.total, currency)}</span>
                  <span className="w-11 shrink-0 text-right text-xs tabular-nums text-gray-400">{pct(c.percentage, c.total)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
