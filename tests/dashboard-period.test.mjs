/**
 * Dashboard period scope and comparison.
 *
 * Period arithmetic is where this kind of feature goes wrong: ISO week
 * numbering across a year boundary, month-end clamping, leap years, and a
 * half-finished period being compared as though it were complete. Each of
 * those has a test here rather than a hope.
 */
import assert from "node:assert/strict";
import test from "node:test";

const stamp = `${process.pid}-${Date.now()}`;
const url = new URL("../app/dashboard-period.ts", import.meta.url);
url.searchParams.set("test", stamp);
const P = await import(url.href);

/* ---------------------------------------------------------- ISO weeks */

test("ISO week numbering is correct across year boundaries", () => {
  const w = (iso) => P.isoWeek(P.parseIso(iso));

  // 1 January 2026 is a Thursday, so it belongs to week 1 of 2026.
  assert.deepEqual(w("2026-01-01"), { year: 2026, week: 1 });

  // 1 January 2027 is a Friday - still week 53 of the 2026 week-numbering
  // year. A naive implementation reports week 1 of 2027 here.
  assert.deepEqual(w("2027-01-01"), { year: 2026, week: 53 });

  // 31 December 2024 is a Tuesday, which falls in week 1 of 2025.
  assert.deepEqual(w("2024-12-31"), { year: 2025, week: 1 });

  // A mid-year sanity check.
  assert.deepEqual(w("2026-09-17"), { year: 2026, week: 38 });
});

/* ------------------------------------------------------- leap years */

test("February length is right in leap and common years", () => {
  assert.equal(P.daysInMonth(2024, 1), 29);
  assert.equal(P.daysInMonth(2026, 1), 28);
  assert.equal(P.daysInMonth(2000, 1), 29);
  assert.equal(P.daysInMonth(1900, 1), 28);
});

test("a month period covers the whole month, whatever its length", () => {
  const feb = P.resolvePeriods({ granularity: "month", count: 1, mode: "none", asAt: "2024-02-29" })[0];
  assert.equal(feb.from, "2024-02-01");
  assert.equal(feb.to, "2024-02-29");

  const apr = P.resolvePeriods({ granularity: "month", count: 1, mode: "none", asAt: "2026-04-10" })[0];
  assert.equal(apr.from, "2026-04-01");
  assert.equal(apr.to, "2026-04-30");
});

/* ------------------------------------------- month-end clamping */

test("stepping back a month from the 31st does not overflow into the next month", () => {
  // 31 March minus one month must be February, not 3 March.
  const periods = P.resolvePeriods({ granularity: "month", count: 2, mode: "sequential", asAt: "2026-03-31" });
  assert.equal(periods.length, 2);
  assert.equal(periods[0].key, "2026-02");
  assert.equal(periods[1].key, "2026-03");
});

test("stepping back a year from 29 February lands in February", () => {
  const periods = P.resolvePeriods({ granularity: "year", count: 2, mode: "sequential", asAt: "2024-02-29" });
  assert.equal(periods[0].key, "2023");
  assert.equal(periods[1].key, "2024");
});

/* ----------------------------------------------- period resolution */

test("each granularity resolves to the right bounds and labels", () => {
  const at = "2026-09-17";
  const one = (granularity) => P.resolvePeriods({ granularity, count: 1, mode: "none", asAt: at })[0];

  const day = one("day");
  assert.equal(day.key, "2026-09-17");
  assert.equal(day.from, "2026-09-17");
  assert.equal(day.to, "2026-09-17");
  assert.equal(day.label, "17 Sep");

  // 17 September 2026 is a Thursday; the Monday-start week runs 14-20.
  const week = one("week");
  assert.equal(week.key, "2026-W38");
  assert.equal(week.from, "2026-09-14");
  assert.equal(week.to, "2026-09-20");

  const month = one("month");
  assert.equal(month.key, "2026-09");
  assert.equal(month.from, "2026-09-01");
  assert.equal(month.to, "2026-09-30");

  const quarter = one("quarter");
  assert.equal(quarter.key, "2026-Q3");
  assert.equal(quarter.from, "2026-07-01");
  assert.equal(quarter.to, "2026-09-30");

  const year = one("year");
  assert.equal(year.key, "2026");
  assert.equal(year.from, "2026-01-01");
  assert.equal(year.to, "2026-12-31");
});

test("periods come back oldest first and are contiguous", () => {
  for (const granularity of ["day", "week", "month", "quarter", "year"]) {
    const periods = P.resolvePeriods({ granularity, count: 5, mode: "sequential", asAt: "2026-09-17" });
    assert.equal(periods.length, 5, `${granularity}: expected five periods`);
    for (let i = 1; i < periods.length; i += 1) {
      assert.ok(periods[i - 1].from < periods[i].from, `${granularity}: periods must ascend`);
      // No gaps: the next period starts the day after the previous one ends.
      const prevEnd = P.parseIso(periods[i - 1].to);
      const nextStart = P.parseIso(periods[i].from);
      const gapDays = (nextStart - prevEnd) / 86400000;
      assert.equal(gapDays, 1, `${granularity}: gap between ${periods[i - 1].key} and ${periods[i].key}`);
    }
    assert.equal(new Set(periods.map((p) => p.key)).size, 5, `${granularity}: keys must be unique`);
  }
});

/* --------------------------------------------------- comparison modes */

test("no comparison yields exactly one period", () => {
  const periods = P.resolvePeriods({ granularity: "month", count: 6, mode: "none", asAt: "2026-09-17" });
  assert.equal(periods.length, 1);
  assert.equal(periods[0].key, "2026-09");
});

test("period by period honours the requested count, within bounds", () => {
  const at = "2026-09-17";
  assert.equal(P.resolvePeriods({ granularity: "month", count: 3, mode: "sequential", asAt: at }).length, 3);
  assert.equal(P.resolvePeriods({ granularity: "year", count: 20, mode: "sequential", asAt: at }).length, 20);
  // Out-of-range counts are clamped rather than producing a broken chart.
  assert.equal(P.resolvePeriods({ granularity: "month", count: 1, mode: "sequential", asAt: at }).length, P.MIN_PERIODS);
  assert.equal(P.resolvePeriods({ granularity: "month", count: 99, mode: "sequential", asAt: at }).length, P.MAX_PERIODS);
});

test("a custom From and To range determines the inclusive comparison periods", () => {
  const months = P.resolvePeriods({ granularity: "month", count: 2, mode: "sequential", from: "2025-10-01", asAt: "2026-09-17" });
  assert.equal(months.length, 12);
  assert.equal(months[0].key, "2025-10");
  assert.equal(months.at(-1).key, "2026-09");

  const days = P.resolvePeriods({ granularity: "day", count: 2, mode: "sequential", from: "2026-09-01", asAt: "2026-09-17" });
  assert.equal(days.length, 17);
  assert.equal(days[0].key, "2026-09-01");
  assert.equal(days.at(-1).key, "2026-09-17");
});

test("year over year aligns the same period one year earlier", () => {
  const at = "2026-09-17";
  const month = P.resolvePeriods({ granularity: "month", count: 2, mode: "year-over-year", asAt: at });
  assert.deepEqual(month.map((p) => p.key), ["2025-09", "2026-09"]);

  const quarter = P.resolvePeriods({ granularity: "quarter", count: 2, mode: "year-over-year", asAt: at });
  assert.deepEqual(quarter.map((p) => p.key), ["2025-Q3", "2026-Q3"]);

  const day = P.resolvePeriods({ granularity: "day", count: 2, mode: "year-over-year", asAt: at });
  assert.deepEqual(day.map((p) => p.key), ["2025-09-17", "2026-09-17"]);
});

/* ------------------------------------------------- partial periods */

test("a period still in progress is flagged partial", () => {
  // The anchor sits mid-month, so September is incomplete.
  const months = P.resolvePeriods({ granularity: "month", count: 3, mode: "sequential", asAt: "2026-09-17" });
  const last = months[months.length - 1];
  assert.equal(last.key, "2026-09");
  assert.equal(last.partial, true, "the in-progress month must be flagged");
  assert.ok(months.slice(0, -1).every((p) => !p.partial), "completed periods are not partial");

  // A day is never partial: it either is the anchor or it is past.
  const days = P.resolvePeriods({ granularity: "day", count: 3, mode: "sequential", asAt: "2026-09-17" });
  assert.equal(days[days.length - 1].partial, false);

  // On the last day of a month, the month is complete.
  const closed = P.resolvePeriods({ granularity: "month", count: 1, mode: "none", asAt: "2026-08-31" })[0];
  assert.equal(closed.partial, false);
});

/* ------------------------------------------ value parse and format */

test("dashboard value strings round-trip through parse and format", () => {
  const cases = [
    "$8.42M", "18.6%", "$724.8K", "4", "PKR 1,234.00", "62 days",
    "-$2.10M", "0.0%", "105,301,330.24",
  ];
  for (const text of cases) {
    const shape = P.parseValue(text);
    assert.equal(P.formatValue(shape.amount, shape), text, `round trip failed for ${text}`);
  }
});

test("parsing keeps the parts a derived figure needs", () => {
  const money = P.parseValue("$8.42M");
  assert.equal(money.amount, 8.42);
  assert.equal(money.prefix, "$");
  assert.equal(money.scale, "M");
  assert.equal(money.decimals, 2);

  const percent = P.parseValue("18.6%");
  assert.equal(percent.amount, 18.6);
  assert.equal(percent.suffix, "%");
  assert.equal(percent.scale, "");

  const plain = P.parseValue("4");
  assert.equal(plain.amount, 4);
  assert.equal(plain.decimals, 0);

  // A value with no number at all is carried through untouched rather than
  // becoming zero.
  const literal = P.parseValue("Not available");
  assert.equal(literal.literal, "Not available");
  assert.equal(P.formatValue(123, literal), "Not available");
});

/* --------------------------------------------------------- series */

test("a KPI series ends at the authored value and is deterministic", () => {
  const periods = P.resolvePeriods({ granularity: "month", count: 6, mode: "sequential", asAt: "2026-09-17" });
  const a = P.seriesFor("cfo-revenue", 8.42, periods, "month");
  const b = P.seriesFor("cfo-revenue", 8.42, periods, "month");

  assert.equal(a.length, 6);
  // The approved headline never moves when the controls change.
  assert.equal(a[a.length - 1], 8.42);
  assert.deepEqual(a, b, "the same selection must always produce the same series");

  // A different KPI gets a different shape, so charts are not all identical.
  const other = P.seriesFor("cfo-margin", 8.42, periods, "month");
  assert.notDeepEqual(a.slice(0, -1), other.slice(0, -1));

  // Earlier periods stay in a plausible band around the anchor.
  for (const value of a) {
    assert.ok(value >= 0, "a positive KPI must not go negative");
    assert.ok(value <= 8.42 * 1.4, `value ${value} drifted too far from the anchor`);
  }
});

test("a single-period scope produces a single-point series", () => {
  const periods = P.resolvePeriods({ granularity: "month", count: 6, mode: "none", asAt: "2026-09-17" });
  const series = P.seriesFor("k", 100, periods, "month");
  assert.deepEqual(series, [100]);
  assert.equal(P.deltaOf(series, periods), null, "one period cannot have a comparison");
});

test("the delta compares the current period against the basis period", () => {
  const periods = P.resolvePeriods({ granularity: "year", count: 2, mode: "year-over-year", asAt: "2026-09-17" });
  const series = [80, 100];
  const delta = P.deltaOf(series, periods);
  assert.ok(delta);
  assert.equal(delta.absolute, 20);
  assert.equal(Math.round(delta.percent), 25);
  assert.equal(delta.direction, "up");
  assert.equal(delta.basisLabel, periods[0].longLabel);

  const down = P.deltaOf([100, 75], periods);
  assert.equal(down.direction, "down");
  assert.equal(down.absolute, -25);

  const flat = P.deltaOf([50, 50], periods);
  assert.equal(flat.direction, "flat");
  assert.equal(flat.percent, 0);

  // Dividing by a zero basis must not produce Infinity on screen.
  const fromZero = P.deltaOf([0, 10], periods);
  assert.equal(fromZero.percent, null);
});

/* --------------------------------------------- preset to anchor date */

test("each Period preset resolves to the right anchor date", () => {
  const today = "2026-09-17"; // a Thursday, Q3
  const a = (preset, customTo) => P.anchorForPreset(preset, today, customTo);

  // "This ..." presets all anchor on today; the period containing it is what
  // differs, and that is the granularity's job.
  for (const preset of ["today", "this-week", "this-month", "this-quarter", "year-to-date", "this-year"]) {
    assert.equal(a(preset), today, `${preset} should anchor on today`);
  }

  assert.equal(a("last-week"), "2026-09-10", "last week is seven days back");
  assert.equal(a("last-month"), "2026-08-31", "last month anchors on its final day");
  assert.equal(a("last-quarter"), "2026-06-30", "last quarter ends 30 June");
  assert.equal(a("last-year"), "2025-12-31", "last year ends 31 December");

  assert.equal(a("custom", "2026-03-15"), "2026-03-15", "custom uses the To date");
  assert.equal(a("custom"), today, "custom with no date falls back to today");
  assert.equal(a("custom", "not-a-date"), today, "a malformed custom date falls back rather than breaking");
});

test("a completed preset produces a complete anchor period", () => {
  // "Last month" must not be flagged partial - it is finished.
  const anchor = P.anchorForPreset("last-month", "2026-09-17");
  const periods = P.resolvePeriods({ granularity: "month", count: 3, mode: "sequential", asAt: anchor });
  const last = periods[periods.length - 1];
  assert.equal(last.key, "2026-08");
  assert.equal(last.partial, false, "a finished month must not be flagged partial");

  // Whereas "This month" mid-month is incomplete.
  const live = P.resolvePeriods({
    granularity: "month", count: 3, mode: "sequential",
    asAt: P.anchorForPreset("this-month", "2026-09-17"),
  });
  assert.equal(live[live.length - 1].partial, true);
});

/* ------------------------------------------------------- description */

test("the scope description names the actual dates", () => {
  const scope = { granularity: "month", count: 6, mode: "sequential", asAt: "2026-09-17" };
  const periods = P.resolvePeriods(scope);
  const text = P.describeScope(scope, periods);
  assert.match(text, /6 months/);
  assert.match(text, /Apr 2026/);
  assert.match(text, /Sep 2026/);

  const single = { ...scope, mode: "none" };
  const singleText = P.describeScope(single, P.resolvePeriods(single));
  assert.match(singleText, /2026-09-01 to 2026-09-30/);

  const yoy = { ...scope, mode: "year-over-year" };
  const yoyText = P.describeScope(yoy, P.resolvePeriods(yoy));
  assert.match(yoyText, /Sep 2026 against Sep 2025/);
});

/* ------------------------------------------------------- UI wiring */

test("the dashboard drives its figures from the period scope", async () => {
  const { readFile } = await import("node:fs/promises");
  const appDir = new URL("../app/", import.meta.url);
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  const dash = strip(await readFile(new URL("role-dashboard.tsx", appDir), "utf8"));

  // The date filter and the comparison live in ONE control, not two rival bars.
  assert.match(dash, /comparison=\{comparison\}/, "the period bar must receive the comparison mode");
  assert.match(dash, /compareCount=\{compareCount\}/, "and how many periods to compare");
  assert.match(dash, /anchorForPreset\(period, PROTOTYPE_TODAY, customTo\)/, "the Period preset must resolve the anchor date");
  assert.match(dash, /resolvePeriods\(periodScope\)/, "periods come from the shared resolver");

  // Series are derived per KPI and end at the authored value.
  assert.match(dash, /seriesFor\(kpi\.id, shape\.amount, resolvedPeriods, viewBy\)/);
  assert.match(dash, /<DashboardComparison/, "the comparison panel must be rendered");

  // A partial anchor period is reported rather than silently compared.
  assert.match(dash, /partialNote=/, "the control bar must be told about a partial period");

  const panel = strip(await readFile(new URL("dashboard-comparison.tsx", appDir), "utf8"));
  // "No comparison" must actually hide the panel.
  assert.match(panel, /if \(mode === "none" \|\| periods\.length < 2\) return null;/);
  // Direction of change is status, not series identity.
  assert.match(panel, /data-direction=/);

  const controls = strip(await readFile(new URL("reporting-period-controls.tsx", appDir), "utf8"));
  // Comparison is optional, so the reports workspace keeps working untouched.
  assert.match(controls, /comparison\?: ComparisonMode/);
  assert.match(controls, /const comparing = comparison !== undefined/);
  assert.match(controls, /COMPARISON_MODES\.map/, "all three comparison modes must be offered");
  assert.match(controls, /How many \{viewBy === "day" \? "days" : `\$\{viewBy\}s`\}/, "the count control must name the unit");
  assert.match(dash, /barSeries=\{comparison === "none" \? undefined/, "no comparison must remove the comparison series");
  assert.match(dash, /period === "custom" \? customFrom/, "custom From must define the resolved range");
  assert.match(controls, /type="number" min=\{MIN_PERIODS\} max=\{MAX_PERIODS\}/, "the reviewer can enter how many periods to compare");
  assert.match(controls, /value !== "custom"/, "a custom date range must replace the period-count input");
});

test("the count control offers the full supported range", () => {
  // The UI builds its options from these bounds, so they must agree with the
  // resolver's clamping.
  assert.equal(P.MIN_PERIODS, 2);
  assert.equal(P.MAX_PERIODS, 60);
  const options = Array.from({ length: P.MAX_PERIODS - P.MIN_PERIODS + 1 }, (_, i) => P.MIN_PERIODS + i);
  assert.deepEqual(options[0], 2);
  assert.deepEqual(options[options.length - 1], 60);
  for (const n of options) {
    const periods = P.resolvePeriods({ granularity: "year", count: n, mode: "sequential", asAt: P.PROTOTYPE_TODAY });
    assert.equal(periods.length, n, `count ${n} must resolve to ${n} periods`);
  }
});

test("the default scope is a sensible opening state", () => {
  assert.equal(P.DEFAULT_SCOPE.granularity, "month");
  assert.equal(P.DEFAULT_SCOPE.mode, "sequential");
  assert.ok(P.DEFAULT_SCOPE.count >= P.MIN_PERIODS && P.DEFAULT_SCOPE.count <= P.MAX_PERIODS);
  assert.match(P.DEFAULT_SCOPE.asAt, /^\d{4}-\d{2}-\d{2}$/);
  // Every granularity and mode offered by the UI must be resolvable.
  for (const g of P.GRANULARITIES) {
    for (const m of P.COMPARISON_MODES) {
      const periods = P.resolvePeriods({ granularity: g.value, count: 4, mode: m.value, asAt: P.PROTOTYPE_TODAY });
      assert.ok(periods.length >= 1, `${g.value}/${m.value} produced no periods`);
    }
  }
});

/* ------------------------------------------- snapshot & range scaling */

test("the anchor period always shows the authored figures untouched", async () => {
  const u = new URL("../app/dashboard-scaling.ts", import.meta.url);
  u.searchParams.set("test", stamp);
  const S = await import(u.href);

  const periods = P.resolvePeriods({ granularity: "month", count: 6, mode: "sequential", asAt: "2026-09-17" });
  const anchor = periods[periods.length - 1].key;

  // This is the guarantee that keeps approved numbers stable.
  assert.equal(S.periodFactor("ceo", periods, anchor, "month"), 1);
  assert.equal(S.isAnchorPeriod(periods, anchor), true);
  // An unknown key must not distort a chart either.
  assert.equal(S.periodFactor("ceo", periods, "not-a-period", "month"), 1);

  const rows = [{ id: "a", label: "A", value: 100 }, { id: "b", label: "B", value: 42.5 }];
  assert.deepEqual(S.scaleBy(rows, ["value"], 1), rows, "a factor of 1 must change nothing");
});

test("earlier snapshot periods scale deterministically and stay sane", async () => {
  const u = new URL("../app/dashboard-scaling.ts", import.meta.url);
  u.searchParams.set("test", stamp);
  const S = await import(u.href);

  const periods = P.resolvePeriods({ granularity: "year", count: 5, mode: "sequential", asAt: "2026-09-17" });
  for (const period of periods.slice(0, -1)) {
    const f1 = S.periodFactor("cfo", periods, period.key, "year");
    const f2 = S.periodFactor("cfo", periods, period.key, "year");
    assert.equal(f1, f2, "the same period must always scale the same way");
    assert.ok(f1 >= 0.35 && f1 <= 1.3, `factor ${f1} outside a sane band`);
    assert.notEqual(f1, 1, "a non-anchor period should actually differ");
  }

  // Scaling preserves record shape and only touches the named fields.
  const points = [{ id: "p", label: "P", x: 10, y: 20, size: 4, tone: "blue" }];
  const scaled = S.scaleBy(points, ["x", "y", "size"], 0.5);
  assert.equal(scaled[0].tone, "blue", "non-numeric fields are untouched");
  assert.equal(scaled[0].label, "P");
  assert.equal(scaled[0].x, 5);
  assert.equal(scaled[0].y, 10);
  assert.equal(scaled[0].size, 2);
});

test("a range series matches the KPI series shape and ends at the anchor", async () => {
  const u = new URL("../app/dashboard-scaling.ts", import.meta.url);
  u.searchParams.set("test", stamp);
  const S = await import(u.href);

  const periods = P.resolvePeriods({ granularity: "month", count: 6, mode: "sequential", asAt: "2026-09-17" });
  const series = S.rangeSeries("ceo:primary", 820, periods, "month");
  assert.equal(series.length, periods.length);
  assert.equal(series[series.length - 1], 820, "the trend must end at the authored value");
  assert.deepEqual(series, S.rangeSeries("ceo:primary", 820, periods, "month"), "must be deterministic");
});

test("every chart is driven by the period scope, not a fixed label pool", async () => {
  const { readFile } = await import("node:fs/promises");
  const appDir = new URL("../app/", import.meta.url);
  const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const dash = strip(await readFile(new URL("role-dashboard.tsx", appDir), "utf8"));

  // The trend chart used fixed label pools, which disagreed with the
  // comparison table ("FY22" against "2022"). Both now resolve from dates.
  assert.doesNotMatch(dash, /reportingAxisLabels\(/, "the trend must not use the fixed label pools");
  assert.match(dash, /months: resolvedPeriods\.map/, "the trend axis comes from the resolved periods");
  assert.match(dash, /rangeSeries\(/, "range charts take a per-period series");

  // Every snapshot chart reads a scaled dataset rather than the raw fixture.
  for (const [chart, prop] of [
    ["bridge", "steps={snapBridgeSteps}"],
    ["funnel", "stages={snapFunnelStages}"],
    ["scatter", "points={snapScatterPoints}"],
    ["heatmap", "cells={snapHeatmapCells}"],
  ]) {
    assert.ok(dash.includes(prop), `the ${chart} chart must use the period-scaled data`);
  }
  assert.match(dash, /compositionSeries\(snapSegments/, "composition takes the scaled segments");
  assert.match(dash, /snapDriverBars\.map/, "the radar takes the scaled driver bars");
  assert.match(dash, /snapSegments\.map/, "the treemap takes the scaled segments");
  assert.match(dash, /gauge\.percent \* snapshotFactor/, "attainment gauges follow the period");

  // And the reviewer can move which period the snapshots show.
  assert.match(dash, /nx-snapshot-picker/, "a period picker must be offered");
  assert.match(dash, /setSnapshotKey\(entry\.key\)/, "the picker must set the snapshot period");

  // The stale subtitle that always claimed six periods is gone.
  assert.doesNotMatch(dash, /across the last six periods/, "the subtitle must state the real selection");
});
