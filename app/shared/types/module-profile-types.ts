/**
 * Module maturity profiles for the isolated Nexora UI/UX prototype.
 *
 * A module profile supplies domain-specific content (KPIs, table columns and
 * rows, charts, workflow steps, form fields) for the screens of one ERP
 * module, so a matured module stops rendering the generic archetype filler.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency. Every screen
 * that has no profile keeps its existing generic archetype rendering, so
 * modules can be matured one at a time without breaking the catalogue.
 */

import type { ChartTone, FunnelStage, HeatmapCell, ScatterPoint, WaterfallStep } from "@prototype/shared/ui/analytics-charts";

export type ModuleKpiTone = "positive" | "neutral" | "info" | "warning" | "danger";

export interface ModuleKpi {
  id: string;
  label: string;
  value: string;
  delta: string;
  comparison: string;
  tone: ModuleKpiTone;
  /** Optional inline trend; rendered as a sparkline when present. */
  trend?: readonly number[];
}

export interface ModuleColumn {
  key: string;
  label: string;
  /** Right-aligns and tabular-aligns numeric columns. */
  numeric?: boolean;
}

export interface ModuleRow {
  id: string;
  /** Keyed by column key; the `status` key is rendered as a status chip. */
  cells: Readonly<Record<string, string>>;
  status: string;
}

export interface ModuleListProfile {
  /** Replaces the generic "Document no. / Date / Party" table head. */
  columns: readonly ModuleColumn[];
  rows: readonly ModuleRow[];
  /** Column key whose value opens the record; defaults to the first column. */
  linkKey?: string;
  /** When true, the linked column is the only way to open the record. */
  openOnlyFromLink?: boolean;
  filters?: readonly string[];
  summary?: string;
  totalRecords?: number;
  /** Page opened when a row is clicked; falls back to a log-only action. */
  openPageId?: string;
  /** Context-specific create screen and button copy for this list. */
  createPageId?: string;
  createLabel?: string;
}

export type ModuleChart =
  | { kind: "combo"; title: string; subtitle: string; eyebrow: string; unit: ModuleUnit; labels: readonly string[]; barLabel: string; barValues: readonly number[]; lineLabel: string; lineValues: readonly number[]; accessibleSummary: string; note?: string }
  | { kind: "waterfall"; title: string; subtitle: string; eyebrow: string; unit: ModuleUnit; steps: readonly WaterfallStep[]; accessibleSummary: string; note?: string }
  | { kind: "stacked"; title: string; subtitle: string; eyebrow: string; unit: ModuleUnit; labels: readonly string[]; series: readonly { label: string; tone: ChartTone; values: readonly number[] }[]; accessibleSummary: string; note?: string }
  | { kind: "donut"; title: string; subtitle: string; eyebrow: string; unit: ModuleUnit; segments: readonly { id: string; label: string; value: number; tone: ChartTone }[]; centerValue: string; centerLabel: string; accessibleSummary: string; note?: string }
  | { kind: "funnel"; title: string; subtitle: string; eyebrow: string; stages: readonly FunnelStage[]; accessibleSummary: string; note?: string }
  | { kind: "gauges"; title: string; subtitle: string; eyebrow: string; gauges: readonly { id: string; label: string; valueLabel: string; percent: number; hint: string; tone: ChartTone }[]; note?: string }
  | { kind: "heatmap"; title: string; subtitle: string; eyebrow: string; unit: ModuleUnit; tone: ChartTone; rows: readonly string[]; columns: readonly string[]; cells: readonly HeatmapCell[]; accessibleSummary: string; note?: string }
  | { kind: "scatter"; title: string; subtitle: string; eyebrow: string; xLabel: string; yLabel: string; xUnit: ModuleUnit; yUnit: ModuleUnit; points: readonly ScatterPoint[]; accessibleSummary: string; note?: string }
  | { kind: "radar"; title: string; subtitle: string; eyebrow: string; axes: readonly { id: string; label: string; value: number; target: number }[]; accessibleSummary: string; note?: string };

export type ModuleUnit = "currency" | "percent" | "number" | "days";

export interface ModuleAttentionItem {
  id: string;
  title: string;
  detail: string;
  status: string;
  tone: "info" | "warning" | "danger";
}

export interface ModuleDashboardProfile {
  kpis: readonly ModuleKpi[];
  charts: readonly ModuleChart[];
  attention?: readonly ModuleAttentionItem[];
  attentionTitle?: string;
}

export interface ModuleWorkflowProfile {
  steps: readonly { label: string; state: "complete" | "current" | "pending" }[];
  currentTitle: string;
  currentFields: readonly (readonly [string, string])[];
  exceptions: readonly { id: string; title: string; detail: string }[];
}

export interface ModuleFormProfile {
  sections: readonly {
    title: string;
    fields: readonly { label: string; value: string; type?: "text" | "date" | "select" | "textarea"; options?: readonly string[]; wide?: boolean }[];
  }[];
}

export interface ModuleDetailProfile {
  fields: readonly (readonly [string, string])[];
  lineColumns: readonly ModuleColumn[];
  lines: readonly ModuleRow[];
}

export interface ModuleReportProfile {
  kpis: readonly ModuleKpi[];
  charts: readonly ModuleChart[];
  columns: readonly ModuleColumn[];
  rows: readonly ModuleRow[];
}

export interface ModulePageProfile {
  dashboard?: ModuleDashboardProfile;
  list?: ModuleListProfile;
  report?: ModuleReportProfile;
  workflow?: ModuleWorkflowProfile;
  form?: ModuleFormProfile;
  detail?: ModuleDetailProfile;
}

export interface ModuleProfile {
  moduleId: string;
  /** Keyed by page id. Pages without an entry keep generic archetype rendering. */
  pages: Readonly<Record<string, ModulePageProfile>>;
}
