import { test } from "node:test";
import assert from "node:assert/strict";
import {
  linearScale,
  niceStep,
  niceTicks,
  linePath,
  areaPath,
  nearestIndex,
  tickIndices,
  formatAxisAmount,
  formatShortDate,
  donutAngles,
  arcPath,
  polar,
  categoryColor,
} from "./chartUtils.js";
import { CHART_COLORS, CHART_OTHER_COLOR } from "./colors.js";

const norm = (s) => s.replace(/ /g, " ");
const TAU = Math.PI * 2;
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);

test("linearScale maps the domain onto the range (inverted y works)", () => {
  const y = linearScale([0, 100], [200, 0]);
  assert.equal(y(0), 200);
  assert.equal(y(100), 0);
  assert.equal(y(25), 150);
  assert.equal(linearScale([5, 5], [0, 10])(5), 5, "flat domain -> middle of the range");
});

test("niceStep picks 1 / 2 / 2.5 / 5 x 10^k", () => {
  assert.equal(niceStep(0.7), 1);
  assert.equal(niceStep(1.3), 2);
  assert.equal(niceStep(2.2), 2.5);
  assert.equal(niceStep(380), 500);
  assert.equal(niceStep(1234), 2000);
  assert.equal(niceStep(0), 1);
});

test("niceTicks covers the data with round values", () => {
  assert.deepEqual(niceTicks(0, 5240.5, 4), { ticks: [0, 2000, 4000, 6000], min: 0, max: 6000, step: 2000 });
  const t = niceTicks(2814.69, 5240.5, 4);
  assert.ok(t.min <= 2814.69 && t.max >= 5240.5);
  assert.deepEqual(t.ticks, [2000, 3000, 4000, 5000, 6000]);
  assert.deepEqual(niceTicks(-120, 80, 4).ticks, [-150, -100, -50, 0, 50, 100]);
  assert.deepEqual(niceTicks(0, 0.3, 3).ticks, [0, 0.1, 0.2, 0.3], "no floating-point noise");
});

test("niceTicks handles flat and empty series", () => {
  assert.deepEqual(niceTicks(0, 0).ticks.slice(0, 1), [0]);
  assert.ok(niceTicks(0, 0).max > 0);
  const flat = niceTicks(1000, 1000);
  assert.ok(flat.min < 1000 && flat.max > 1000);
  assert.deepEqual(niceTicks(NaN, NaN).ticks.at(0), 0);
});

test("linePath / areaPath", () => {
  const pts = [{ x: 0, y: 10 }, { x: 5.555, y: 0 }, { x: 10, y: 4 }];
  assert.equal(linePath(pts), "M0 10 L5.56 0 L10 4");
  assert.equal(areaPath(pts, 20), "M0 10 L5.56 0 L10 4 L10 20 L0 20 Z");
  assert.equal(areaPath([], 20), "");
});

test("nearestIndex snaps the pointer to the closest point", () => {
  assert.equal(nearestIndex(0, 0, 100, 11), 0);
  assert.equal(nearestIndex(14, 0, 100, 11), 1);
  assert.equal(nearestIndex(16, 0, 100, 11), 2);
  assert.equal(nearestIndex(-50, 0, 100, 11), 0, "clamped left");
  assert.equal(nearestIndex(500, 0, 100, 11), 10, "clamped right");
  assert.equal(nearestIndex(50, 0, 100, 1), 0);
});

test("tickIndices spreads labels and keeps the ends", () => {
  assert.deepEqual(tickIndices(30, 5), [0, 7, 15, 22, 29]);
  assert.deepEqual(tickIndices(2, 5), [0, 1]);
  assert.deepEqual(tickIndices(1, 5), [0]);
  assert.deepEqual(tickIndices(0, 5), []);
  assert.deepEqual(tickIndices(365, 3), [0, 182, 364]);
});

test("formatAxisAmount is short and localised", () => {
  assert.equal(norm(formatAxisAmount(0)), "0 €");
  assert.equal(norm(formatAxisAmount(250)), "250 €");
  assert.equal(norm(formatAxisAmount(1500)), "1,5k €");
  assert.equal(norm(formatAxisAmount(12000)), "12k €");
  assert.equal(norm(formatAxisAmount(-2500)), "-2,5k €");
  assert.equal(norm(formatAxisAmount(1200000)), "1,2M €");
  assert.equal(norm(formatAxisAmount(0.5)), "0,5 €");
});

test("formatShortDate", () => {
  assert.equal(formatShortDate("2026-11-04"), "4 nov");
  assert.match(formatShortDate("2026-11-04", { withYear: true }), /^nov 26$/);
});

test("donutAngles: proportional slices with gaps that close the circle", () => {
  const pad = 0.02;
  const a = donutAngles([50, 30, 20], { padAngle: pad });
  const sweeps = a.map((s) => s.end - s.start);
  const avail = TAU - 3 * pad;
  close(sweeps[0], avail * 0.5);
  close(sweeps[1], avail * 0.3);
  close(sweeps[2], avail * 0.2);
  close(a[0].start, pad / 2);
  close(a[2].end + pad / 2, TAU);
  close(a[1].start - a[0].end, pad, 1e-9);
});

test("donutAngles: a single category is a full ring, zero values get no slice", () => {
  assert.deepEqual(donutAngles([42], { padAngle: 0.05 }), [{ start: 0, end: TAU }]);
  assert.deepEqual(donutAngles([0, 10, 0], { padAngle: 0.05 }), [null, { start: 0, end: TAU }, null]);
  assert.deepEqual(donutAngles([], {}), []);
  assert.deepEqual(donutAngles([0, 0]), [null, null]);
});

test("donutAngles: tiny slices get a minimum visible angle, the rest still add up", () => {
  const min = 0.05;
  const a = donutAngles([10000, 1, 2], { minAngle: min });
  const sweeps = a.map((s) => s.end - s.start);
  close(sweeps[1], min);
  close(sweeps[2], min);
  close(sweeps.reduce((s, v) => s + v, 0), TAU);
  assert.ok(sweeps[0] < TAU - 2 * min + 1e-9);
});

test("polar / arcPath", () => {
  const top = polar(100, 100, 50, 0);
  close(top.x, 100);
  close(top.y, 50);
  const right = polar(100, 100, 50, Math.PI / 2);
  close(right.x, 150);
  close(right.y, 100);

  assert.equal(arcPath(100, 100, 50, 30, 0, Math.PI / 2), "M100 50 A50 50 0 0 1 150 100 L130 100 A30 30 0 0 0 100 70 Z");
  assert.match(arcPath(100, 100, 50, 30, 0, Math.PI * 1.5), /A50 50 0 1 1/, "large-arc flag past 180°");
  const full = arcPath(100, 100, 50, 30, 0, TAU);
  assert.equal(full.match(/M/g).length, 2, "full ring = two half arcs");
});

test("categoryColor: fixed order, Other is neutral", () => {
  assert.equal(categoryColor({ key: "a" }, 0), CHART_COLORS[0]);
  assert.equal(categoryColor({ key: "uncategorized" }, 5), CHART_COLORS[5]);
  assert.equal(categoryColor({ key: "other" }, 6), CHART_OTHER_COLOR);
});
