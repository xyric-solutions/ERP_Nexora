"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { COMPARISON_MODES, MAX_PERIODS, MIN_PERIODS, type ComparisonMode } from "../model/reporting-period";

export type ReportingPeriodKey = "today" | "this-week" | "last-week" | "this-month" | "last-month" | "this-quarter" | "last-quarter" | "year-to-date" | "this-year" | "last-year" | "custom";
export type ReportingViewBy = "day" | "week" | "month" | "quarter" | "year";

export const reportingPeriodLabels: Record<ReportingPeriodKey, string> = {
  today: "Today",
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-month": "Last month",
  "this-quarter": "This quarter",
  "last-quarter": "Last quarter",
  "year-to-date": "Year to date",
  "this-year": "This year",
  "last-year": "Last year",
  custom: "Custom range",
};

export const reportingPeriodLengths: Record<ReportingPeriodKey, number> = {
  today: 1,
  "this-week": 1,
  "last-week": 1,
  "this-month": 1,
  "last-month": 1,
  "this-quarter": 3,
  "last-quarter": 3,
  "year-to-date": 12,
  "this-year": 12,
  "last-year": 12,
  custom: 6,
};

const reportingAxisPools: Record<ReportingViewBy, string[]> = {
  day: ["20 Aug", "21 Aug", "22 Aug", "23 Aug", "24 Aug", "25 Aug", "26 Aug", "27 Aug", "28 Aug", "29 Aug", "30 Aug", "31 Aug"],
  week: ["W37", "W38", "W39", "W40", "W41", "W42", "W43", "W44", "W45", "W46", "W47", "W48"],
  month: ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"],
  quarter: ["Q1", "Q2", "Q3", "Q4"],
  year: ["FY22", "FY23", "FY24", "FY25", "FY26"],
};

export function reportingAxisLabels(period: ReportingPeriodKey, viewBy: ReportingViewBy) {
  const pool = reportingAxisPools[viewBy];
  const count = (() => {
    if (period === "today") return 1;
    if (period === "this-week" || period === "last-week") return viewBy === "day" ? 7 : 1;
    if (period === "this-month" || period === "last-month") {
      if (viewBy === "day") return 12;
      if (viewBy === "week") return 4;
      return 1;
    }
    if (period === "this-quarter" || period === "last-quarter") {
      if (viewBy === "day" || viewBy === "week") return 12;
      if (viewBy === "month") return 3;
      return 1;
    }
    if (period === "custom") return Math.min(reportingPeriodLengths.custom, pool.length);
    return pool.length;
  })();
  return pool.slice(-Math.min(count, pool.length));
}

interface ReportingPeriodControlsProps {
  value: ReportingPeriodKey;
  onChange: (value: ReportingPeriodKey) => void;
  viewBy: ReportingViewBy;
  onViewByChange: (value: ReportingViewBy) => void;
  balanceForward: boolean;
  onBalanceForwardChange: (value: boolean) => void;
  onApply?: () => void;
  contextLabel: string;
  /**
   * Comparison is optional so the reports workspace keeps its existing
   * controls unchanged. When these are supplied - as the role dashboards do -
   * the bar also offers period-over-period comparison.
   */
  comparison?: ComparisonMode;
  onComparisonChange?: (value: ComparisonMode) => void;
  compareCount?: number;
  onCompareCountChange?: (value: number) => void;
  /** Human summary of the resolved dates, shown beside the controls. */
  scopeSummary?: string;
  /** Reported when the anchor period is still in progress. */
  partialNote?: string | null;
  /** From/To of the custom range, lifted so the caller can resolve dates. */
  onCustomRangeChange?: (from: string, to: string) => void;
}

export function ReportingPeriodControls({
  value, onChange, viewBy, onViewByChange, balanceForward, onBalanceForwardChange,
  onApply, contextLabel, comparison, onComparisonChange, compareCount, onCompareCountChange,
  scopeSummary, partialNote, onCustomRangeChange,
}: ReportingPeriodControlsProps) {
  const [customFrom, setCustomFrom] = useState("2026-01-01");
  const [customTo, setCustomTo] = useState("2026-08-31");
  const periodDescription = value === "custom" ? `${customFrom} to ${customTo}` : reportingPeriodLabels[value];
  const comparing = comparison !== undefined && onComparisonChange !== undefined;

  const setRange = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    onCustomRangeChange?.(from, to);
  };

  const reset = () => {
    onChange("year-to-date");
    onViewByChange("month");
    onBalanceForwardChange(false);
    setRange("2026-01-01", "2026-08-31");
    onComparisonChange?.("sequential");
    onCompareCountChange?.(6);
  };

  return (
    <section className="flex min-w-0 flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4 shadow-sm" aria-label={`${contextLabel} date and period filters`}>
      <div className="mr-auto flex min-w-47.5 flex-col gap-0.5">
        <span className="text-xs font-bold tracking-[0.08em] text-primary uppercase">Date intelligence</span>
        <strong className="text-sm text-foreground">{periodDescription}</strong>
        <small className="text-xs text-muted-foreground">{scopeSummary ?? `View by ${viewBy} · As of 31 Aug 2026`}</small>
      </div>
      <Label className="grid min-w-32 gap-1.5 text-xs text-muted-foreground"><span>Period</span><select className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={value} onChange={(event) => onChange(event.target.value as ReportingPeriodKey)}>{Object.entries(reportingPeriodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Label>
      <Label className="grid min-w-32 gap-1.5 text-xs text-muted-foreground"><span>View by</span><select className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={viewBy} onChange={(event) => onViewByChange(event.target.value as ReportingViewBy)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></Label>
      {comparing ? (
        <>
          <Label className="grid min-w-32 gap-1.5 text-xs text-muted-foreground">
            <span>Compare</span>
            <select className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={comparison} onChange={(event) => onComparisonChange?.(event.target.value as ComparisonMode)}>
              {COMPARISON_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
          </Label>
          {comparison === "sequential" && value !== "custom" ? (
            <Label className="grid min-w-32 gap-1.5 text-xs text-muted-foreground">
              <span>How many {viewBy === "day" ? "days" : `${viewBy}s`}</span>
              <Input className="h-9"
                type="number" min={MIN_PERIODS} max={MAX_PERIODS} value={compareCount ?? 6}
                onChange={(event) => onCompareCountChange?.(Math.max(MIN_PERIODS, Math.min(MAX_PERIODS, Number(event.target.value) || MIN_PERIODS)))}
              />
            </Label>
          ) : null}
        </>
      ) : null}
      {value === "custom" ? <div className="flex gap-2"><Label className="grid flex-1 gap-1.5 text-xs text-muted-foreground"><span>From</span><Input className="h-9" type="date" value={customFrom} onChange={(event) => setRange(event.target.value, customTo)} /></Label><Label className="grid flex-1 gap-1.5 text-xs text-muted-foreground"><span>To</span><Input className="h-9" type="date" value={customTo} min={customFrom} onChange={(event) => setRange(customFrom, event.target.value)} /></Label></div> : null}
      {partialNote ? <p className="w-full rounded-r-lg border-l-3 border-[var(--nx-warning)] bg-[var(--nx-warning-soft)] px-3 py-2 text-sm" role="note">{partialNote}</p> : null}
      <Label className="flex min-h-10 min-w-59.5 items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-1.5 text-xs"><Checkbox id="nx-balance-forward" aria-label="Include balance brought forward" checked={balanceForward} onCheckedChange={(checked) => onBalanceForwardChange(checked === true)} /><span><strong className="block text-foreground">Include balance brought forward</strong><small className="mt-0.5 block text-muted-foreground">Carry the opening balance into cumulative totals.</small></span></Label>
      <div className="flex gap-2"><Button variant="outline" type="button" onClick={reset}>Reset</Button><Button type="button" onClick={onApply}>Apply period</Button></div>
    </section>
  );
}
