"use client";

import { useState } from "react";
import { COMPARISON_MODES, MAX_PERIODS, MIN_PERIODS, type ComparisonMode } from "./dashboard-period";
import "./reporting-period-controls.css";

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
    <section className="nx-reporting-period" aria-label={`${contextLabel} date and period filters`}>
      <div className="nx-reporting-period__title">
        <span>Date intelligence</span>
        <strong>{periodDescription}</strong>
        <small>{scopeSummary ?? `View by ${viewBy} · As of 31 Aug 2026`}</small>
      </div>
      <label><span>Period</span><select value={value} onChange={(event) => onChange(event.target.value as ReportingPeriodKey)}>{Object.entries(reportingPeriodLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>View by</span><select value={viewBy} onChange={(event) => onViewByChange(event.target.value as ReportingViewBy)}><option value="day">Day</option><option value="week">Week</option><option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option></select></label>
      {comparing ? (
        <>
          <label>
            <span>Compare</span>
            <select value={comparison} onChange={(event) => onComparisonChange?.(event.target.value as ComparisonMode)}>
              {COMPARISON_MODES.map((mode) => <option key={mode.value} value={mode.value}>{mode.label}</option>)}
            </select>
          </label>
          {comparison === "sequential" && value !== "custom" ? (
            <label>
              <span>How many {viewBy === "day" ? "days" : `${viewBy}s`}</span>
              <input
                type="number" min={MIN_PERIODS} max={MAX_PERIODS} value={compareCount ?? 6}
                onChange={(event) => onCompareCountChange?.(Math.max(MIN_PERIODS, Math.min(MAX_PERIODS, Number(event.target.value) || MIN_PERIODS)))}
              />
            </label>
          ) : null}
        </>
      ) : null}
      {value === "custom" ? <div className="nx-reporting-period__custom"><label><span>From</span><input type="date" value={customFrom} onChange={(event) => setRange(event.target.value, customTo)} /></label><label><span>To</span><input type="date" value={customTo} min={customFrom} onChange={(event) => setRange(customFrom, event.target.value)} /></label></div> : null}
      {partialNote ? <p className="nx-reporting-period__partial" role="note">{partialNote}</p> : null}
      <label className="nx-reporting-period__balance" htmlFor="nx-balance-forward"><input id="nx-balance-forward" aria-label="Include balance brought forward" type="checkbox" checked={balanceForward} onChange={(event) => onBalanceForwardChange(event.target.checked)} /><span><strong>Include balance brought forward</strong><small>Carry the opening balance into cumulative totals.</small></span></label>
      <div className="nx-reporting-period__actions"><button type="button" onClick={reset}>Reset</button><button className="is-primary" type="button" onClick={onApply}>Apply period</button></div>
    </section>
  );
}
