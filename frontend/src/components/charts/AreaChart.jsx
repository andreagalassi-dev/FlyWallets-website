"use client";

import { useId, useState } from "react";
import { formatCurrency } from "@/lib/format";
import { CHART_LINE_COLOR } from "@/lib/colors";
import {
  areaPath,
  formatAxisAmount,
  formatLongDate,
  formatShortDate,
  linePath,
  linearScale,
  nearestIndex,
  niceTicks,
  tickIndices,
} from "@/lib/chartUtils";
import { useElementWidth, usePrefersReducedMotion } from "./useChartSize";

const PAD = { top: 12, right: 14, bottom: 26 };
const AXIS_FONT = 11;

/**
 * Single-series area chart (net worth over time), hand-written SVG.
 * - series: [{ date: 'YYYY-MM-DD', total: number }]
 * - Hover / touch shows a crosshair + tooltip that follows the pointer; the chart is focusable and
 *   ArrowLeft / ArrowRight / Home / End move the highlighted day (announced to screen readers).
 * - The y axis always includes 0 so the filled area is not exaggerated.
 */
export default function AreaChart({ series, title, height = 220, currency = "EUR", color = CHART_LINE_COLOR }) {
  const [wrapRef, width] = useElementWidth();
  const [active, setActive] = useState(null);
  const reduceMotion = usePrefersReducedMotion();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const n = series.length;
  const values = series.map((p) => p.total);
  const withYear = n > 120;

  const geo = (() => {
    const dataMin = Math.min(0, ...values);
    const dataMax = Math.max(0, ...values);
    const { ticks, min, max } = niceTicks(dataMin, dataMax, height < 200 ? 3 : 4);
    const labels = ticks.map((t) => formatAxisAmount(t, currency));
    // Room for the longest y label (≈ 0.6em per character at 11px)
    const left = Math.ceil(Math.max(...labels.map((l) => l.length)) * AXIS_FONT * 0.6) + 10;
    const plotW = Math.max(1, width - left - PAD.right);
    const x = n > 1 ? linearScale([0, n - 1], [left, left + plotW]) : () => left + plotW / 2;
    const y = linearScale([min, max], [height - PAD.bottom, PAD.top]);
    const points = values.map((v, i) => ({ x: x(i), y: y(v) }));
    return { ticks, labels, left, plotW, x, y, points, zeroY: y(0) };
  })();

  const xTicks = tickIndices(n, width < 420 ? 3 : width < 640 ? 4 : 6);
  const first = series[0];
  const last = series[n - 1];

  const onPointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setActive(nearestIndex(e.clientX - rect.left, geo.left, geo.left + geo.plotW, n));
  };

  const onKeyDown = (e) => {
    const cur = active ?? n - 1;
    const step = e.shiftKey ? 7 : 1;
    const next = {
      ArrowLeft: cur - step,
      ArrowRight: cur + step,
      Home: 0,
      End: n - 1,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setActive(Math.min(n - 1, Math.max(0, next)));
  };

  const summary =
    n > 0
      ? `${title}: from ${formatCurrency(first.total, currency)} on ${formatLongDate(first.date)} ` +
        `to ${formatCurrency(last.total, currency)} on ${formatLongDate(last.date)}. ` +
        `Highest ${formatCurrency(Math.max(...values), currency)}, lowest ${formatCurrency(Math.min(...values), currency)}. ` +
        "Use the left and right arrow keys to read each day."
      : `${title}: no data.`;

  const point = active != null && n > 0 ? series[active] : null;
  const p = active != null ? geo.points[active] : null;
  const tipLeft = p ? Math.min(Math.max(p.x, 72), width - 72) : 0;
  const tipBelow = p ? p.y < 64 : false;

  return (
    <div ref={wrapRef} className="relative w-full select-none" style={{ height }}>
      {width > 0 && n > 0 && (
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-labelledby={`${uid}-t ${uid}-d`}
          tabIndex={0}
          className="block touch-pan-y rounded-md outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
          onPointerMove={onPointerMove}
          onPointerDown={onPointerMove}
          onPointerLeave={() => setActive(null)}
          onFocus={() => setActive((a) => a ?? n - 1)}
          onBlur={() => setActive(null)}
          onKeyDown={onKeyDown}
        >
          <title id={`${uid}-t`}>{title}</title>
          <desc id={`${uid}-d`}>{summary}</desc>
          {!reduceMotion && (
            <style>{`
              @keyframes fw-draw-${uid} { from { stroke-dashoffset: 1; } to { stroke-dashoffset: 0; } }
              @keyframes fw-fade-${uid} { from { opacity: 0; } to { opacity: 1; } }
            `}</style>
          )}
          <defs>
            <linearGradient id={`${uid}-fill`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.28" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* y grid + labels */}
          <g aria-hidden="true">
            {geo.ticks.map((t, i) => {
              const ty = geo.y(t);
              return (
                <g key={t}>
                  <line
                    x1={geo.left}
                    x2={geo.left + geo.plotW}
                    y1={ty}
                    y2={ty}
                    stroke="white"
                    strokeOpacity={t === 0 ? 0.18 : 0.06}
                    shapeRendering="crispEdges"
                  />
                  <text x={geo.left - 8} y={ty} dy="0.32em" textAnchor="end" fontSize={AXIS_FONT} fill="#9CA3AF" className="tabular-nums">
                    {geo.labels[i]}
                  </text>
                </g>
              );
            })}
            {/* x labels */}
            {xTicks.map((i) => {
              const anchor = n > 1 && i === 0 ? "start" : n > 1 && i === n - 1 ? "end" : "middle";
              return (
                <text key={i} x={geo.x(i)} y={height - 6} textAnchor={anchor} fontSize={AXIS_FONT} fill="#9CA3AF">
                  {formatShortDate(series[i].date, { withYear })}
                </text>
              );
            })}
          </g>

          {/* area + line (keyed by range so a new range re-plays the draw-in) */}
          <g key={`${n}-${first.date}`} aria-hidden="true">
            <path
              d={areaPath(geo.points, geo.zeroY)}
              fill={`url(#${uid}-fill)`}
              style={reduceMotion ? undefined : { animation: `fw-fade-${uid} 700ms ease-out both` }}
            />
            <path
              d={linePath(geo.points)}
              fill="none"
              stroke={color}
              strokeWidth="2"
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength="1"
              strokeDasharray={reduceMotion ? undefined : "1"}
              style={reduceMotion ? undefined : { animation: `fw-draw-${uid} 900ms ease-out both` }}
            />
            {n === 1 && <circle cx={geo.points[0].x} cy={geo.points[0].y} r="4" fill={color} />}
          </g>

          {/* crosshair */}
          {p && (
            <g aria-hidden="true" pointerEvents="none">
              <line x1={p.x} x2={p.x} y1={PAD.top} y2={height - PAD.bottom} stroke="white" strokeOpacity="0.25" strokeDasharray="3 3" />
              <circle cx={p.x} cy={p.y} r="5" fill={color} stroke="#111525" strokeWidth="2" />
            </g>
          )}
        </svg>
      )}

      {point && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-10 whitespace-nowrap rounded-md border border-white/10 bg-[#161a2c]/95 px-2.5 py-1.5 text-xs shadow-lg"
          style={{
            left: tipLeft,
            top: tipBelow ? p.y + 14 : p.y - 14,
            transform: `translate(-50%, ${tipBelow ? "0" : "-100%"})`,
          }}
        >
          <p className="text-gray-400">{formatLongDate(point.date)}</p>
          <p className="mt-0.5 font-semibold tabular-nums text-white">{formatCurrency(point.total, currency)}</p>
        </div>
      )}

      <p className="sr-only" aria-live="polite">
        {point ? `${formatLongDate(point.date)}: ${formatCurrency(point.total, currency)}` : ""}
      </p>
    </div>
  );
}
