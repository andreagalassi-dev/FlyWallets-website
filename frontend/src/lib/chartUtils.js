// Pure, framework-free helpers for the hand-written SVG charts (src/components/charts).
import { CHART_COLORS, CHART_OTHER_COLOR } from "./colors.js";

/** Linear scale: maps [d0, d1] to [r0, r1]. A zero-width domain maps everything to the middle of the range. */
export function linearScale([d0, d1], [r0, r1]) {
  const span = d1 - d0;
  if (span === 0) return () => (r0 + r1) / 2;
  return (v) => r0 + ((v - d0) / span) * (r1 - r0);
}

/** "Nice" step (1, 2, 2.5, 5 x 10^k) for a raw step. */
export function niceStep(raw) {
  if (!(raw > 0) || !Number.isFinite(raw)) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const f = raw / base;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nice * base;
}

/**
 * Round tick values covering [min, max] with about `count` intervals.
 * Returns { ticks, min, max, step } where min/max are the extended (nice) domain.
 * A flat series (min === max) gets a domain around the value; 0..0 becomes 0..1.
 */
export function niceTicks(min, max, count = 4) {
  let lo = Math.min(min, max);
  let hi = Math.max(min, max);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
    lo = 0;
    hi = 1;
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= lo === 0 ? 0 : pad;
    hi += pad;
  }
  const step = niceStep((hi - lo) / Math.max(1, count));
  const start = Math.floor(lo / step + 1e-9) * step;
  const end = Math.ceil(hi / step - 1e-9) * step;
  const ticks = [];
  for (let v = start, i = 0; v <= end + step / 2 && i < 50; v += step, i++) {
    // Kill floating-point noise (0.30000000000000004)
    ticks.push(Number(v.toPrecision(12)) + 0);
  }
  return { ticks, min: ticks[0], max: ticks[ticks.length - 1], step };
}

/** SVG path ("M x y L x y ...") through points [{x, y}]. */
export function linePath(points) {
  return points.map((p, i) => `${i ? "L" : "M"}${round(p.x)} ${round(p.y)}`).join(" ");
}

/** Closed area under the line down to `baseY`. */
export function areaPath(points, baseY) {
  if (points.length === 0) return "";
  const first = points[0];
  const last = points[points.length - 1];
  return `${linePath(points)} L${round(last.x)} ${round(baseY)} L${round(first.x)} ${round(baseY)} Z`;
}

/** Index (0..n-1) of the point closest to `x` when n points are spread evenly over [x0, x1]. */
export function nearestIndex(x, x0, x1, n) {
  if (n <= 1) return 0;
  const t = (x - x0) / (x1 - x0);
  return Math.min(n - 1, Math.max(0, Math.round(t * (n - 1))));
}

/** Up to `max` evenly spaced indices of an n-long series, always including the first and the last. */
export function tickIndices(n, max = 5) {
  if (n <= 0) return [];
  if (n === 1) return [0];
  const k = Math.max(2, Math.min(max, n));
  const out = new Set();
  for (let i = 0; i < k; i++) out.add(Math.round((i * (n - 1)) / (k - 1)));
  return [...out];
}

/**
 * Short axis label for an amount: "0 €", "250 €", "1,5k €", "12k €", "1,2M €" (it-IT decimal comma).
 * Uses the currency symbol of `currency` (EUR by default).
 */
export function formatAxisAmount(value, currency = "EUR") {
  const symbol = currencySymbol(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  const fmt = (n) => new Intl.NumberFormat("it-IT", { maximumFractionDigits: 1 }).format(n);
  if (abs >= 1e6) return `${sign}${fmt(abs / 1e6)}M ${symbol}`;
  if (abs >= 1e3) return `${sign}${fmt(abs / 1e3)}k ${symbol}`;
  return `${sign}${fmt(abs)} ${symbol}`;
}

function currencySymbol(currency) {
  try {
    const part = new Intl.NumberFormat("it-IT", { style: "currency", currency })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part ? part.value : currency;
  } catch {
    return currency;
  }
}

const parseDay = (day) => new Date(`${day}T12:00:00`);

/** 'YYYY-MM-DD' -> "4 nov" (or "nov 25" when `withYear`, for 1-year ranges). */
export function formatShortDate(day, { withYear = false } = {}) {
  const opts = withYear ? { month: "short", year: "2-digit" } : { day: "numeric", month: "short" };
  return new Intl.DateTimeFormat("it-IT", opts).format(parseDay(day));
}

/** 'YYYY-MM-DD' -> "4 novembre 2026" (tooltips and screen-reader text). */
export function formatLongDate(day) {
  return new Intl.DateTimeFormat("it-IT", { day: "numeric", month: "long", year: "numeric" }).format(parseDay(day));
}

const TAU = Math.PI * 2;

/**
 * Angles (radians, clockwise from 12 o'clock) of donut slices for `values`.
 * - Non-positive values get no slice (null).
 * - Every visible slice spans at least `minAngle` so tiny categories stay visible (the others shrink
 *   proportionally to make room).
 * - `padAngle` is the gap between adjacent slices (none for a single slice: it is a full ring).
 * Returns [{ start, end } | null] aligned with `values`.
 */
export function donutAngles(values, { padAngle = 0, minAngle = 0 } = {}) {
  const visible = values.map((v) => v > 0);
  const n = visible.filter(Boolean).length;
  if (n === 0) return values.map(() => null);
  if (n === 1) return values.map((v) => (v > 0 ? { start: 0, end: TAU } : null));

  const pad = Math.min(padAngle, TAU / n / 4);
  const avail = TAU - pad * n;
  const total = values.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  // Slices under the minimum get exactly minAngle; the rest share what is left proportionally
  const min = Math.min(minAngle, avail / n);
  const small = new Set();
  for (let changed = true; changed; ) {
    changed = false;
    const bigTotal = values.reduce((s, v, i) => s + (v > 0 && !small.has(i) ? v : 0), 0);
    const bigAvail = avail - small.size * min;
    values.forEach((v, i) => {
      if (v > 0 && !small.has(i) && (v / bigTotal) * bigAvail < min) {
        small.add(i);
        changed = true;
      }
    });
    if (small.size === n) break;
  }
  const bigTotal = values.reduce((s, v, i) => s + (v > 0 && !small.has(i) ? v : 0), 0) || total;
  const bigAvail = avail - small.size * min;

  let a = 0;
  return values.map((v, i) => {
    if (!(v > 0)) return null;
    const sweep = small.has(i) ? min : (v / bigTotal) * bigAvail;
    const slice = { start: a + pad / 2, end: a + pad / 2 + sweep };
    a += sweep + pad;
    return slice;
  });
}

/** Point on a circle; angle in radians clockwise from 12 o'clock. */
export function polar(cx, cy, r, angle) {
  return { x: cx + r * Math.sin(angle), y: cy - r * Math.cos(angle) };
}

/**
 * SVG path of a ring segment between radii rInner..rOuter from `start` to `end` (radians, clockwise from 12).
 * A full turn is drawn as two half arcs (a single SVG arc cannot describe a closed circle).
 */
export function arcPath(cx, cy, rOuter, rInner, start, end) {
  const sweep = end - start;
  if (sweep >= TAU - 1e-6) {
    const mid = start + Math.PI;
    return `${arcPath(cx, cy, rOuter, rInner, start, mid)} ${arcPath(cx, cy, rOuter, rInner, mid, start + TAU)}`;
  }
  const large = sweep > Math.PI ? 1 : 0;
  const o0 = polar(cx, cy, rOuter, start);
  const o1 = polar(cx, cy, rOuter, end);
  const i1 = polar(cx, cy, rInner, end);
  const i0 = polar(cx, cy, rInner, start);
  return [
    `M${round(o0.x)} ${round(o0.y)}`,
    `A${rOuter} ${rOuter} 0 ${large} 1 ${round(o1.x)} ${round(o1.y)}`,
    `L${round(i1.x)} ${round(i1.y)}`,
    `A${rInner} ${rInner} 0 ${large} 0 ${round(i0.x)} ${round(i0.y)}`,
    "Z",
  ].join(" ");
}

/** Colour of the i-th category of a spending breakdown ("Other" is always neutral). */
export function categoryColor(category, index) {
  if (category?.key === "other") return CHART_OTHER_COLOR;
  return CHART_COLORS[index % CHART_COLORS.length];
}

function round(n) {
  return Math.round(n * 100) / 100;
}
