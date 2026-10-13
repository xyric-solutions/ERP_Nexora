"use client";

import { useMemo, useState } from "react";
import type { CompanyMode } from "./mock-data";
import type { RoleDashboardDefinition, RoleDashboardScorecardRow } from "./role-dashboard-data";
import { RoleDashboardVisuals } from "./role-dashboard-visuals";
import { getRoleDashboardVisuals } from "./role-dashboard-visual-data";
import { getRoleAnalytics, type AnalyticsUnit } from "./role-dashboard-analytics-data";
import {
  ChartPanel,
  ComboChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  RadarChart,
  ScatterChart,
  Sparkline,
  StackedBarChart,
  TreemapChart,
  WaterfallChart,
  toneAt,
  type ChartTone,
  type StackedSeries,
} from "./role-dashboard-charts";
import { DashboardDrillJourney, type DashboardDrillRequest } from "./drill/dashboard-journey";
import { ExecutiveDashboardIntelligence } from "./executive-dashboard-intelligence";
import { RoleDeepDiveIntelligence } from "./role-deep-dive-intelligence";
import { ReportingPeriodControls, reportingPeriodLabels, type ReportingPeriodKey, type ReportingViewBy } from "./reporting-period-controls";
import {
  PROTOTYPE_TODAY,
  anchorForPreset,
  deltaOf,
  describeScope,
  formatValue,
  parseValue,
  resolvePeriods,
  seriesFor,
  type ComparisonMode,
} from "./dashboard-period";
import { DashboardComparison, type ComparisonRow } from "./dashboard-comparison";
import "./dashboard-comparison.css";
import {
  isAnchorPeriod,
  periodFactor,
  rangeSeries,
  scaleBy,
  snapshotLabel,
} from "./dashboard-scaling";

interface RoleDashboardContext {
  role: string;
  roleId: string;
  companyMode: CompanyMode;
}

interface RoleDashboardProps {
  context: RoleDashboardContext;
  dashboard: RoleDashboardDefinition;
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string) => void;
}

const kpiTones: Record<string, ChartTone> = {
  positive: "teal",
  neutral: "indigo",
  info: "cyan",
  warning: "sky",
  danger: "plum",
};

function humanize(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function formatUnitValue(value: number, unit: AnalyticsUnit | string) {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  if (unit === "percent") return `${Math.round(value * 10) / 10}%`;
  if (unit === "days") return `${Math.round(value)} days`;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

/** Deterministic per-KPI trend shape derived from the role's own monthly series. */
function seedOf(value: string) {
  let hash = 7;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 100003;
  }
  return hash;
}

function sparklineFor(kpiId: string, base: readonly number[]) {
  const seed = seedOf(kpiId);
  return base.slice(-8).map((value, index) => {
    const wobble = (((seed + index * 37) % 19) - 9) / 100;
    return Math.max(0.5, value * (1 + wobble));
  });
}

function compositionSeries(
  segments: readonly { id: string; label: string; value: number; tone: ChartTone }[],
  values: readonly number[],
): StackedSeries[] {
  return segments.map((segment) => ({
    label: segment.label,
    tone: segment.tone,
    values: values.map((value, index) => {
      const drift = (((seedOf(segment.id) + index * 13) % 11) - 5) / 100;
      return Math.max(0, value * (segment.value / 100) * (1 + drift));
    }),
  }));
}

/** Reads the numeric attainment out of a scorecard row's display strings. */
function gaugeFromScorecard(row: RoleDashboardScorecardRow) {
  const actual = Number.parseFloat(row.value.replace(/[^0-9.-]/g, ""));
  const target = Number.parseFloat(row.target.replace(/[^0-9.-]/g, ""));
  if (!Number.isFinite(actual) || !Number.isFinite(target) || target === 0) return null;
  const lowerIsBetter = row.target.includes("≤");
  const attainment = lowerIsBetter ? (target / actual) * 100 : (actual / target) * 100;
  // This gauge *means* good or bad, so it wears the reserved status tones, not
  // categorical series colours. The label and caption carry the meaning too,
  // so status is never communicated by colour alone.
  const tone: ChartTone =
    row.status === "on-track" ? "good" : row.status === "watch" ? "warn" : row.status === "at-risk" ? "risk" : "bad";
  return {
    id: row.id,
    label: row.label,
    valueLabel: row.value,
    percent: Math.max(0, Math.min(140, Math.round(attainment))),
    tone,
    caption: `${row.label}: ${row.value} against target ${row.target}, ${humanize(row.status)}.`,
  };
}

export function RoleDashboard({ context, dashboard, onAction, onNavigate }: RoleDashboardProps) {
  const [period, setPeriod] = useState<ReportingPeriodKey>("year-to-date");
  const [viewBy, setViewBy] = useState<ReportingViewBy>("month");
  const [balanceForward, setBalanceForward] = useState(false);
  // Comparison scope. The Period preset above chooses the dates; these choose
  // how those dates are compared.
  const [comparison, setComparison] = useState<ComparisonMode>("sequential");
  const [compareCount, setCompareCount] = useState(6);
  const [customFrom, setCustomFrom] = useState("2026-01-01");
  const [customTo, setCustomTo] = useState("2026-08-31");
  const [drillRequest, setDrillRequest] = useState<DashboardDrillRequest | null>(null);
  const visuals = getRoleDashboardVisuals(dashboard.pageId);
  const analytics = getRoleAnalytics(dashboard.pageId);

  // The Period preset resolves to an anchor date; the View by control gives the
  // granularity; comparison gives the mode and how many periods.
  const periodScope = useMemo(
    () => ({
      granularity: viewBy,
      count: compareCount,
      mode: comparison,
      asAt: anchorForPreset(period, PROTOTYPE_TODAY, customTo),
      from: period === "custom" ? customFrom : undefined,
    }),
    [viewBy, compareCount, comparison, period, customFrom, customTo],
  );
  const resolvedPeriods = useMemo(() => resolvePeriods(periodScope), [periodScope]);
  const scopeSummary = useMemo(
    () => describeScope(periodScope, resolvedPeriods),
    [periodScope, resolvedPeriods],
  );
  const partialPeriod = resolvedPeriods.find((entry) => entry.partial) ?? null;

  /**
   * One series per KPI across the selected periods. Each ends at the value
   * authored in the fixture, so changing these controls never moves a figure a
   * reviewer has already approved.
   */
  const comparisonRows = useMemo<ComparisonRow[]>(
    () =>
      dashboard.kpis.map((kpi) => {
        const shape = parseValue(kpi.value);
        const series = seriesFor(kpi.id, shape.amount, resolvedPeriods, viewBy);
        return { id: kpi.id, label: kpi.label, shape, series, delta: deltaOf(series, resolvedPeriods) };
      }),
    [dashboard.kpis, resolvedPeriods, viewBy],
  );
  // Snapshot charts - bridge, funnel, donut, radar, scatter, heatmap, gauges -
  // show ONE period. This is which one; it follows the anchor whenever the
  // range changes, and the reviewer can move it.
  const anchorKey = resolvedPeriods[resolvedPeriods.length - 1]?.key ?? "";
  const [snapshotKey, setSnapshotKey] = useState(anchorKey);
  const activeSnapshotKey = resolvedPeriods.some((entry) => entry.key === snapshotKey)
    ? snapshotKey
    : anchorKey;
  const snapshotFactor = periodFactor(dashboard.pageId, resolvedPeriods, activeSnapshotKey, viewBy);
  const snapshotIsAnchor = isAnchorPeriod(resolvedPeriods, activeSnapshotKey);
  const snapshotName = snapshotLabel(resolvedPeriods, activeSnapshotKey);

  const rowsByKpi = useMemo(
    () => new Map(comparisonRows.map((row) => [row.id, row])),
    [comparisonRows],
  );

  /**
   * The main trend is a RANGE chart, so it takes one point per selected
   * period. It used to read from fixed label pools, which meant "View by
   * Year" could only ever show FY22-FY26 while the comparison table showed
   * real years - the two disagreed. Both now resolve from the same dates.
   */
  const visibleSeries = useMemo(() => {
    const authoredPrimary = dashboard.chart.primary.values;
    const authoredComparison = dashboard.chart.comparison.values;
    return {
      months: resolvedPeriods.map((entry) => entry.label),
      primary: rangeSeries(
        `${dashboard.pageId}:primary`,
        authoredPrimary[authoredPrimary.length - 1] ?? 0,
        resolvedPeriods,
        viewBy,
      ),
      comparison: rangeSeries(
        `${dashboard.pageId}:comparison`,
        authoredComparison[authoredComparison.length - 1] ?? 0,
        resolvedPeriods,
        viewBy,
      ),
    };
  }, [dashboard, resolvedPeriods, viewBy]);

  const chartPeriodSummary = comparison === "none"
    ? `${reportingPeriodLabels[period]} viewed by ${viewBy}: ${dashboard.chart.primary.label} is ${formatUnitValue(visibleSeries.primary.at(-1) ?? 0, dashboard.chart.unit)}.`
    : `${reportingPeriodLabels[period]} viewed by ${viewBy}, from ${visibleSeries.months[0]} to ${visibleSeries.months.at(-1)}: ${dashboard.chart.primary.label} moves from ${formatUnitValue(visibleSeries.primary[0], dashboard.chart.unit)} to ${formatUnitValue(visibleSeries.primary.at(-1) ?? 0, dashboard.chart.unit)}; ${dashboard.chart.comparison.label} moves from ${formatUnitValue(visibleSeries.comparison[0], dashboard.chart.unit)} to ${formatUnitValue(visibleSeries.comparison.at(-1) ?? 0, dashboard.chart.unit)}.`;
  const isManufacturingMismatch = dashboard.roleId === "production-manager" && context.companyMode !== "manufacturing";

  const compositionMonths = dashboard.chart.months.slice(-6);
  const compositionValues = dashboard.chart.primary.values.slice(-6);
  /**
   * Snapshot datasets, scaled to whichever period the reviewer is viewing.
   * At the anchor period the factor is exactly 1, so these are the authored
   * fixtures untouched.
   */
  const snapSegments = useMemo(
    () => (visuals ? scaleBy(visuals.distribution.segments, ["value"], snapshotFactor) : []),
    [visuals, snapshotFactor],
  );
  const snapDriverBars = useMemo(
    () => (visuals ? scaleBy(visuals.drivers.bars, ["value"], snapshotFactor) : []),
    [visuals, snapshotFactor],
  );
  const snapBridgeSteps = useMemo(
    () => (analytics ? scaleBy(analytics.bridge.steps, ["value"], snapshotFactor) : []),
    [analytics, snapshotFactor],
  );
  const snapFunnelStages = useMemo(
    () => (analytics ? scaleBy(analytics.funnel.stages, ["value"], snapshotFactor) : []),
    [analytics, snapshotFactor],
  );
  const snapScatterPoints = useMemo(
    () => (analytics ? scaleBy(analytics.scatter.points, ["x", "y", "size"], snapshotFactor) : []),
    [analytics, snapshotFactor],
  );
  const snapHeatmapCells = useMemo(
    () => (analytics ? scaleBy(analytics.heatmap.cells, ["value"], snapshotFactor) : []),
    [analytics, snapshotFactor],
  );

  const stackedSeries = visuals ? compositionSeries(snapSegments, compositionValues) : [];
  const radarAxes = visuals
    ? snapDriverBars.map((bar) => ({
        id: bar.id,
        label: bar.label,
        value: Math.round((bar.value / bar.max) * 100),
        target: Math.round((bar.benchmark / bar.max) * 100),
      }))
    : [];
  const gauges = dashboard.scorecard
    .map(gaugeFromScorecard)
    .filter((gauge) => gauge !== null)
    .map((gauge) =>
      snapshotFactor === 1
        ? gauge
        : { ...gauge, percent: Math.max(0, Math.min(140, Math.round(gauge.percent * snapshotFactor))) },
    );
  const treemapNodes = visuals
    ? snapSegments.map((segment, index) => ({
        id: segment.id,
        label: segment.label,
        value: segment.value,
        display: segment.display,
        tone: (segment.tone as ChartTone) ?? toneAt(index),
      }))
    : [];

  const openDrill = (subject: string, targetModuleId?: string) => {
    setDrillRequest({ subject, targetModuleId });
  };

  if (drillRequest) {
    return <DashboardDrillJourney roleId={dashboard.roleId} dashboardTitle={dashboard.title} request={drillRequest} onClose={() => setDrillRequest(null)} />;
  }

  return (
    <section className="nx-role-dashboard" aria-labelledby="role-dashboard-title">
      <header className="nx-role-hero">
        <div className="nx-role-hero__identity">
          <span className="nx-eyebrow">{dashboard.eyebrow}</span>
          <h1 id="role-dashboard-title">{dashboard.title}</h1>
          <p>{dashboard.description}</p>
          <div className="nx-role-badges" aria-label="Dashboard context">
            <span className="nx-role-badge nx-role-badge--accent">Mock role view</span>
            <span className="nx-role-badge">{context.role}</span>
            <span className="nx-role-badge">{humanize(context.companyMode)} company</span>
          </div>
        </div>
        <div className="nx-role-hero__context">
          <div><span>Active role</span><strong>{context.role}</strong></div>
          <div><span>As of</span><strong>31 Aug 2026 · 10:30 PKT</strong></div>
          <p>{dashboard.contextNote}</p>
        </div>
      </header>

      {isManufacturingMismatch ? (
        <div className="nx-role-empty-note" role="note">
          <strong>Manufacturing lens preview</strong>
          <span>This role dashboard intentionally shows production measures while the company context is {humanize(context.companyMode)}. Switch company type to Manufacturing for a fully aligned navigation preview.</span>
        </div>
      ) : null}

      <section className="nx-dashboard-toolbar" aria-label="Dashboard controls">
        <ReportingPeriodControls value={period} onChange={setPeriod} viewBy={viewBy} onViewByChange={setViewBy} balanceForward={balanceForward} onBalanceForwardChange={setBalanceForward} contextLabel={dashboard.title} onApply={() => onAction("Apply reporting period", `${scopeSummary} · ${comparison === "none" ? "no comparison" : comparison}${balanceForward ? " · balance brought forward" : ""}`)} comparison={comparison} onComparisonChange={setComparison} compareCount={compareCount} onCompareCountChange={setCompareCount} scopeSummary={scopeSummary} onCustomRangeChange={(from, to) => { setCustomFrom(from); setCustomTo(to); }} partialNote={comparison !== "none" && partialPeriod ? `${partialPeriod.longLabel} is still in progress, so it is excluded from like-for-like comparison.` : null} />
        <div>
          <button className="nx-button nx-button-secondary" onClick={() => onAction("Refresh", dashboard.title)} type="button">Refresh</button>
          <button className="nx-button nx-button-secondary" onClick={() => onAction("Export", dashboard.title)} type="button">Export snapshot</button>
        </div>
      </section>

      <section className="nx-role-kpi-grid" aria-label={`${dashboard.title} key performance indicators`}>
        {dashboard.kpis.map((kpi) => (
          <button
            className={`nx-role-kpi nx-role-kpi--${kpi.tone}`}
            key={kpi.id}
            onClick={() => openDrill(kpi.label)}
            type="button"
          >
            <span className="nx-role-kpi__top">
              <span>{kpi.label}</span>
              <i aria-hidden="true">↗</i>
            </span>
            <strong className="nx-role-kpi__value">{kpi.value}</strong>
            {(() => {
              // While comparing, the tile reports the change across the chosen
              // periods rather than the fixture's own stated delta, so the
              // number and the control bar can never disagree.
              const row = rowsByKpi.get(kpi.id);
              const periodDelta = comparison === "none" ? null : row?.delta ?? null;
              if (!periodDelta || !row) {
                return <span className="nx-role-kpi__meta"><b>{kpi.delta}</b>{kpi.comparison}</span>;
              }
              const sign = periodDelta.absolute > 0 ? "+" : "";
              const pct = periodDelta.percent === null ? null : `${sign}${periodDelta.percent.toFixed(1)}%`;
              return (
                <span className="nx-role-kpi__meta" data-direction={periodDelta.direction}>
                  <b>{pct ?? `${sign}${formatValue(periodDelta.absolute, row.shape)}`}</b>
                  against {periodDelta.basisLabel}
                </span>
              );
            })()}
            <Sparkline
              values={
                comparison === "none"
                  ? sparklineFor(kpi.id, dashboard.chart.primary.values)
                  : (rowsByKpi.get(kpi.id)?.series ?? sparklineFor(kpi.id, dashboard.chart.primary.values))
              }
              tone={kpiTones[kpi.tone] ?? "blue"}
              label={
                comparison === "none"
                  ? `${kpi.label} recent trend, ${kpi.delta} ${kpi.comparison}`
                  : `${kpi.label} across ${resolvedPeriods.length} ${viewBy} periods, ${resolvedPeriods[0].longLabel} to ${resolvedPeriods[resolvedPeriods.length - 1].longLabel}`
              }
            />
            <small className="nx-role-kpi__source">Explain this number · trace to source</small>
          </button>
        ))}
      </section>

      <DashboardComparison
        rows={comparisonRows}
        periods={resolvedPeriods}
        granularity={viewBy}
        mode={comparison}
        scopeSummary={scopeSummary}
        onOpen={(label) => openDrill(label)}
      />

      {resolvedPeriods.length > 1 ? (
        <section className="nx-snapshot-picker" aria-label="Period shown by the single-period charts">
          <div className="nx-snapshot-picker__copy">
            <span className="nx-eyebrow">Showing</span>
            <strong>{snapshotName}</strong>
            <small>
              {snapshotIsAnchor
                ? "The bridge, funnel, composition, balance, relationship, heatmap and attainment charts show this period."
                : `Single-period charts are showing ${snapshotName}. The latest period in the selection is ${resolvedPeriods[resolvedPeriods.length - 1].longLabel}.`}
            </small>
          </div>
          <div className="nx-snapshot-picker__periods" role="group" aria-label="Choose the period to show">
            {resolvedPeriods.map((entry) => (
              <button
                key={entry.key}
                type="button"
                aria-pressed={entry.key === activeSnapshotKey}
                title={entry.longLabel}
                onClick={() => setSnapshotKey(entry.key)}
              >
                {entry.label}
                {entry.partial ? <em aria-label="in progress">*</em> : null}
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="nx-role-grid">
        <ChartPanel
          chartId="trend-comparison"
          eyebrow="Performance"
          title={dashboard.chart.title}
          subtitle={dashboard.chart.subtitle}
          wide
          action={<button type="button" onClick={() => openDrill(dashboard.chart.title, dashboard.chart.target.moduleId)}>Drill down</button>}
          onDrill={() => openDrill(dashboard.chart.title, dashboard.chart.target.moduleId)}
        >
          <ComboChart
            labels={visibleSeries.months}
            barSeries={comparison === "none" ? undefined : { label: dashboard.chart.comparison.label, values: visibleSeries.comparison, tone: "cyan" }}
            lineSeries={{ label: dashboard.chart.primary.label, values: visibleSeries.primary, tone: "blue" }}
            formatValue={(value) => formatUnitValue(value, dashboard.chart.unit)}
            accessibleSummary={chartPeriodSummary}
          />
        </ChartPanel>

        {analytics ? (
          <ChartPanel
            chartId="contribution-bridge"
            eyebrow="Contribution"
            title={analytics.bridge.title}
            subtitle={analytics.bridge.subtitle}
            badge="Bridge"
            note={analytics.bridge.note}
            wide
            onDrill={() => openDrill(analytics.bridge.title)}
          >
            <WaterfallChart
              steps={snapBridgeSteps}
              formatValue={(value) => formatUnitValue(value, analytics.bridge.unit)}
              accessibleSummary={analytics.bridge.accessibleSummary}
            />
          </ChartPanel>
        ) : null}

        <article className="nx-role-panel nx-role-panel--work">
          <div className="nx-role-panel__head">
            <div><span>My work</span><h2>Priority action queue</h2><p>Assigned mock items ordered by urgency.</p></div>
          </div>
          <div className="nx-role-queue">
            {dashboard.priorities.map((item) => (
              <button className="nx-role-queue__item" key={item.id} onClick={() => openDrill(item.title, item.target.moduleId)} type="button">
                <span className="nx-role-queue__copy"><i className={`nx-role-severity nx-role-severity--${item.priority.toLowerCase()}`}>{humanize(item.priority)}</i><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span><b>{item.status}</b><small>{item.due}</small></span>
              </button>
            ))}
          </div>
        </article>

        {analytics ? (
          <ChartPanel
            chartId="stage-funnel"
            eyebrow="Conversion"
            title={analytics.funnel.title}
            subtitle={analytics.funnel.subtitle}
            badge="Stage flow"
            span={8}
            onDrill={() => openDrill(analytics.funnel.title)}
          >
            <FunnelChart
              stages={snapFunnelStages}
              accessibleSummary={analytics.funnel.accessibleSummary}
              onSelect={(stage) => openDrill(stage.label)}
            />
          </ChartPanel>
        ) : null}

        <RoleDashboardVisuals pageId={dashboard.pageId} onDrill={openDrill} />

        <ExecutiveDashboardIntelligence roleId={dashboard.roleId} onDrill={openDrill} />

        <RoleDeepDiveIntelligence roleId={dashboard.roleId} onDrill={openDrill} />

        {visuals ? (
          <ChartPanel
            chartId="composition-treemap"
            eyebrow="Portfolio"
            title={`${visuals.distribution.title} by weight`}
            subtitle="Proportional view of the same composition, sized by contribution share."
            badge="Treemap"
            onDrill={() => openDrill(visuals.distribution.title)}
          >
            <TreemapChart
              nodes={treemapNodes}
              accessibleSummary={visuals.distribution.accessibleSummary}
              onSelect={(node) => {
                const segment = visuals.distribution.segments.find((item) => item.id === node.id);
                if (segment) openDrill(segment.label, segment.target.moduleId);
              }}
            />
          </ChartPanel>
        ) : null}

        {visuals ? (
          <ChartPanel
            chartId="composition-trend"
            eyebrow="Mix over time"
            title="Composition movement"
            subtitle={`How the ${visuals.distribution.title.toLowerCase()} mix has moved across ${resolvedPeriods.length === 1 ? "the selected period" : `${resolvedPeriods.length} ${viewBy} periods, ${resolvedPeriods[0].label} to ${resolvedPeriods[resolvedPeriods.length - 1].label}`}.`}
            badge="Stacked"
            wide
            onDrill={() => openDrill("Composition movement")}
          >
            <StackedBarChart
              labels={compositionMonths}
              series={stackedSeries}
              formatValue={(value) => formatUnitValue(value, dashboard.chart.unit)}
              accessibleSummary={`Six-period stacked composition for ${dashboard.title}, split across ${stackedSeries.map((item) => item.label).join(", ")}.`}
            />
          </ChartPanel>
        ) : null}

        {visuals ? (
          <ChartPanel
            chartId="capability-radar"
            eyebrow="Balance"
            title="Capability balance"
            subtitle="Actual position against management target across each performance driver."
            badge="Radar"
            onDrill={() => openDrill("Capability balance")}
          >
            <RadarChart
              axes={radarAxes}
              accessibleSummary={`${visuals.drivers.title} shown as a multi-axis balance of actual against target: ${radarAxes.map((axis) => `${axis.label} ${axis.value} versus target ${axis.target}`).join("; ")}.`}
            />
          </ChartPanel>
        ) : null}

        {analytics ? (
          <ChartPanel
            chartId="relationship-scatter"
            eyebrow="Relationship"
            title={analytics.scatter.title}
            subtitle={analytics.scatter.subtitle}
            badge="Scatter"
            onDrill={() => openDrill(analytics.scatter.title)}
          >
            <ScatterChart
              points={snapScatterPoints}
              xLabel={analytics.scatter.xLabel}
              yLabel={analytics.scatter.yLabel}
              formatX={(value) => formatUnitValue(value, analytics.scatter.xUnit)}
              formatY={(value) => formatUnitValue(value, analytics.scatter.yUnit)}
              accessibleSummary={analytics.scatter.accessibleSummary}
            />
          </ChartPanel>
        ) : null}

        <ChartPanel
          chartId="target-gauges"
          eyebrow="Attainment"
          title="Target attainment"
          subtitle="Each scorecard measure expressed as attainment against its management target."
          badge="Gauges"
          wide
          onDrill={() => openDrill("Target attainment")}
        >
          <div className="nx-gauge-grid">
            {gauges.map((gauge) => (
              <GaugeChart
                key={gauge.id}
                label={gauge.label}
                valueLabel={gauge.valueLabel}
                percent={gauge.percent}
                targetPercent={100}
                hint={`${gauge.percent}% of target`}
                tone={gauge.tone}
                caption={gauge.caption}
              />
            ))}
          </div>
        </ChartPanel>

        {analytics ? (
          <ChartPanel
            chartId="density-heatmap"
            eyebrow="Density"
            title={analytics.heatmap.title}
            subtitle={analytics.heatmap.subtitle}
            badge="Heatmap"
            wide
            onDrill={() => openDrill(analytics.heatmap.title)}
          >
            <HeatmapChart
              cells={snapHeatmapCells}
              rows={analytics.heatmap.rows}
              columns={analytics.heatmap.columns}
              tone={analytics.heatmap.tone}
              formatValue={(value) => formatUnitValue(value, analytics.heatmap.unit)}
              accessibleSummary={analytics.heatmap.accessibleSummary}
            />
          </ChartPanel>
        ) : null}

        <article className="nx-role-panel nx-role-panel--wide">
          <div className="nx-role-panel__head">
            <div><span>Control tower</span><h2>Operational scorecard</h2><p>Actual position against management target.</p></div>
          </div>
          <div className="nx-role-scorecard" role="table" aria-label={`${dashboard.title} operational scorecard`}>
            <div className="nx-role-scorecard__row nx-role-scorecard__row--head" role="row">
              <span role="columnheader">Measure</span><span role="columnheader">Actual</span><span role="columnheader">Target</span><span role="columnheader">Variance</span><span role="columnheader">Status</span>
            </div>
            {dashboard.scorecard.map((item) => (
              <div className="nx-role-scorecard__row" key={item.id} role="row">
                <span role="cell"><button className="nx-role-scorecard__link" onClick={() => openDrill(item.label)} type="button">{item.label}</button></span>
                <span role="cell">{item.value}</span><span role="cell">{item.target}</span><span role="cell">{item.variance}</span><span role="cell"><i className={`nx-role-severity nx-role-severity--${item.status.toLowerCase().replaceAll(" ", "-")}`}>{humanize(item.status)}</i></span>
              </div>
            ))}
          </div>
        </article>

        <article className="nx-role-panel">
          <div className="nx-role-panel__head">
            <div><span>Exceptions</span><h2>Risks requiring attention</h2><p>Open the source workspace to investigate.</p></div>
          </div>
          <div className="nx-role-alerts">
            {dashboard.exceptions.map((item) => (
              <button className="nx-role-alert" key={item.id} onClick={() => openDrill(item.title, item.target.moduleId)} type="button">
                <span><i className={`nx-role-severity nx-role-severity--${item.severity.toLowerCase()}`}>{humanize(item.severity)}</i><strong>{item.title}</strong><small>{item.detail}</small></span>
                <span><small>Owner</small><b>{item.owner}</b></span>
              </button>
            ))}
          </div>
        </article>

        <article className="nx-role-panel nx-role-panel--wide">
          <div className="nx-role-panel__head">
            <div><span>Role shortcuts</span><h2>Quick access</h2><p>Each shortcut opens an existing mock prototype workspace.</p></div>
          </div>
          <div className="nx-role-quick-actions">
            {dashboard.quickActions.map((action) => (
              <button className={`nx-role-quick-action nx-role-quick-action--${action.kind}`} key={action.id} onClick={() => onNavigate(action.target.moduleId, action.target.pageId)} type="button">
                <i aria-hidden="true">{action.kind === "primary" ? "+" : "↗"}</i>
                <span><strong>{action.label}</strong><small>{action.description}</small></span>
              </button>
            ))}
          </div>
          <p className="nx-role-empty-note nx-role-empty-note--compact"><strong>Visual permission boundary:</strong> Dashboard actions navigate, filter, refresh, export, or simulate review only. They do not post transactions or change real data.</p>
        </article>
      </section>
    </section>
  );
}
