"use client";

/**
 * Rendering for matured module screens in the isolated Nexora UI/UX prototype.
 *
 * These views consume a module profile's domain fixtures and reuse the shared
 * SVG chart kit. Presentation only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { useState } from "react";
import type { ModuleChart, ModuleColumn, ModuleKpi, ModuleRow, ModuleUnit } from "./module-profile-types";
import {
  ChartPanel,
  ComboChart,
  DonutChart,
  FunnelChart,
  GaugeChart,
  HeatmapChart,
  RadarChart,
  ScatterChart,
  Sparkline,
  StackedBarChart,
  WaterfallChart,
  type ChartTone,
} from "./role-dashboard-charts";

export type DateRangePreset =
  | "all"
  | "today"
  | "yesterday"
  | "last-week"
  | "last-month"
  | "this-quarter"
  | "last-quarter"
  | "semi-annual"
  | "last-six-months"
  | "this-year"
  | "custom";

export const dateRangeOptions: readonly { value: DateRangePreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "today", label: "Today" },
  { value: "yesterday", label: "Yesterday" },
  { value: "last-week", label: "Last week" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "last-quarter", label: "Last quarter" },
  { value: "semi-annual", label: "This half year" },
  { value: "last-six-months", label: "Last 6 months" },
  { value: "this-year", label: "This year" },
  { value: "custom", label: "Custom range" },
] as const;

const prototypeToday = new Date(Date.UTC(2026, 8, 8));

export function prototypeDateToIso(value: string | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function shiftDays(date: Date, days: number): Date {
  const shifted = new Date(date);
  shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted;
}

function rangeBounds(preset: DateRangePreset, customFrom: string, customTo: string): readonly [string, string] {
  const today = isoDate(prototypeToday);
  const year = prototypeToday.getUTCFullYear();
  const month = prototypeToday.getUTCMonth();
  const quarterStartMonth = Math.floor(month / 3) * 3;
  if (preset === "today") return [today, today];
  if (preset === "yesterday") {
    const yesterday = isoDate(shiftDays(prototypeToday, -1));
    return [yesterday, yesterday];
  }
  if (preset === "last-week") return [isoDate(shiftDays(prototypeToday, -7)), today];
  if (preset === "last-month") return [isoDate(new Date(Date.UTC(year, month - 1, 1))), isoDate(new Date(Date.UTC(year, month, 0)))];
  if (preset === "this-quarter") return [isoDate(new Date(Date.UTC(year, quarterStartMonth, 1))), today];
  if (preset === "last-quarter") return [isoDate(new Date(Date.UTC(year, quarterStartMonth - 3, 1))), isoDate(new Date(Date.UTC(year, quarterStartMonth, 0)))];
  if (preset === "semi-annual") return [isoDate(new Date(Date.UTC(year, month < 6 ? 0 : 6, 1))), today];
  if (preset === "last-six-months") return [isoDate(new Date(Date.UTC(year, month - 6, 8))), today];
  if (preset === "this-year") return [`${year}-01-01`, today];
  if (preset === "custom") return [customFrom, customTo];
  return ["", ""];
}

export function dateMatchesRange(value: string | undefined, preset: DateRangePreset, customFrom = "", customTo = ""): boolean {
  if (preset === "all") return true;
  const date = prototypeDateToIso(value);
  if (!date) return false;
  const [from, to] = rangeBounds(preset, customFrom, customTo);
  return (!from || date >= from) && (!to || date <= to);
}

export function AdvancedListFilters({
  open,
  creators,
  createdBy,
  createdOn,
  dateRange,
  customFrom,
  customTo,
  onCreatedByChange,
  onCreatedOnChange,
  onDateRangeChange,
  onCustomFromChange,
  onCustomToChange,
  documentNumber,
  reference,
  minAmount,
  maxAmount,
  onDocumentNumberChange,
  onReferenceChange,
  onMinAmountChange,
  onMaxAmountChange,
  onClear,
}: {
  open: boolean;
  creators: readonly string[];
  createdBy: string;
  createdOn: string;
  dateRange: DateRangePreset;
  customFrom: string;
  customTo: string;
  onCreatedByChange: (value: string) => void;
  onCreatedOnChange: (value: string) => void;
  onDateRangeChange: (value: DateRangePreset) => void;
  onCustomFromChange: (value: string) => void;
  onCustomToChange: (value: string) => void;
  documentNumber?: string;
  reference?: string;
  minAmount?: string;
  maxAmount?: string;
  onDocumentNumberChange?: (value: string) => void;
  onReferenceChange?: (value: string) => void;
  onMinAmountChange?: (value: string) => void;
  onMaxAmountChange?: (value: string) => void;
  onClear: () => void;
}) {
  if (!open) return null;
  return (
    <div className="nx-advanced-filters" aria-label="Advanced filters">
      <label>
        <span>Created by</span>
        <select value={createdBy} onChange={(event) => onCreatedByChange(event.target.value)}>
          <option value="">All creators</option>
          {creators.map((creator) => <option key={creator}>{creator}</option>)}
        </select>
      </label>
      <label>
        <span>Created on</span>
        <input type="date" value={createdOn} onChange={(event) => onCreatedOnChange(event.target.value)} />
      </label>
      <label>
        <span>Date range</span>
        <select value={dateRange} onChange={(event) => onDateRangeChange(event.target.value as DateRangePreset)}>
          {dateRangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
      </label>
      {dateRange === "custom" ? (
        <>
          <label><span>From</span><input type="date" value={customFrom} onChange={(event) => onCustomFromChange(event.target.value)} /></label>
          <label><span>To</span><input type="date" value={customTo} onChange={(event) => onCustomToChange(event.target.value)} /></label>
        </>
      ) : null}
      {onDocumentNumberChange ? <label><span>Document number</span><input value={documentNumber ?? ""} onChange={(event) => onDocumentNumberChange(event.target.value)} placeholder="Contains…" /></label> : null}
      {onReferenceChange ? <label><span>Reference contains</span><input value={reference ?? ""} onChange={(event) => onReferenceChange(event.target.value)} placeholder="Source or external ref…" /></label> : null}
      {onMinAmountChange ? <label><span>Minimum amount</span><input inputMode="decimal" value={minAmount ?? ""} onChange={(event) => onMinAmountChange(event.target.value)} placeholder="0.00" /></label> : null}
      {onMaxAmountChange ? <label><span>Maximum amount</span><input inputMode="decimal" value={maxAmount ?? ""} onChange={(event) => onMaxAmountChange(event.target.value)} placeholder="No limit" /></label> : null}
      <button type="button" onClick={onClear}>Clear filters</button>
    </div>
  );
}

export function ListFilterSelect({
  listLabel,
  label,
  value,
  options,
  onChange,
}: {
  listLabel: string;
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
}) {
  return (
    <select
      className="nx-filter-select"
      aria-label={`Filter ${listLabel} by ${label.toLowerCase()}`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">{label}: All</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

const kpiToneToChartTone: Record<ModuleKpi["tone"], ChartTone> = {
  positive: "teal",
  neutral: "indigo",
  info: "cyan",
  warning: "sky",
  danger: "plum",
};

export function formatModuleValue(value: number, unit: ModuleUnit) {
  if (unit === "currency") {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  if (unit === "percent") return `${Math.round(value * 10) / 10}%`;
  if (unit === "days") return `${Math.round(value)} days`;
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function ModuleKpiGrid({ kpis, onSelect }: { kpis: readonly ModuleKpi[]; onSelect: (kpi: ModuleKpi) => void }) {
  return (
    <section className="nx-role-kpi-grid" aria-label="Key performance indicators">
      {kpis.map((kpi) => (
        <button className={`nx-role-kpi nx-role-kpi--${kpi.tone}`} key={kpi.id} onClick={() => onSelect(kpi)} type="button">
          <span className="nx-role-kpi__top"><span>{kpi.label}</span><i aria-hidden="true">↗</i></span>
          <strong className="nx-role-kpi__value">{kpi.value}</strong>
          <span className="nx-role-kpi__meta"><b>{kpi.delta}</b>{kpi.comparison}</span>
          {kpi.trend ? (
            <Sparkline values={kpi.trend} tone={kpiToneToChartTone[kpi.tone]} label={`${kpi.label} recent trend, ${kpi.delta} ${kpi.comparison}`} />
          ) : null}
          <small className="nx-role-kpi__source">Open source detail</small>
        </button>
      ))}
    </section>
  );
}

export function ModuleChartPanel({ chart, index }: { chart: ModuleChart; index: number }) {
  const chartId = `module-${chart.kind}-${index}`;
  const wide = chart.kind === "combo" || chart.kind === "waterfall" || chart.kind === "stacked" || chart.kind === "gauges" || chart.kind === "heatmap";

  return (
    <ChartPanel
      chartId={chartId}
      eyebrow={chart.eyebrow}
      title={chart.title}
      subtitle={chart.subtitle}
      wide={wide}
      note={"note" in chart ? chart.note : undefined}
    >
      {chart.kind === "combo" ? (
        <ComboChart
          labels={chart.labels}
          barSeries={{ label: chart.barLabel, values: chart.barValues, tone: "cyan" }}
          lineSeries={{ label: chart.lineLabel, values: chart.lineValues, tone: "blue" }}
          formatValue={(value) => formatModuleValue(value, chart.unit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : chart.kind === "waterfall" ? (
        <WaterfallChart
          steps={chart.steps}
          formatValue={(value) => formatModuleValue(value, chart.unit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : chart.kind === "stacked" ? (
        <StackedBarChart
          labels={chart.labels}
          series={chart.series}
          formatValue={(value) => formatModuleValue(value, chart.unit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : chart.kind === "donut" ? (
        <DonutChart
          data={chart.segments.map((segment) => ({ name: segment.label, value: segment.value, tone: segment.tone }))}
          centerValue={chart.centerValue}
          centerLabel={chart.centerLabel}
          formatValue={(value) => formatModuleValue(value, chart.unit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : chart.kind === "funnel" ? (
        <FunnelChart stages={chart.stages} accessibleSummary={chart.accessibleSummary} />
      ) : chart.kind === "gauges" ? (
        <div className="nx-gauge-grid">
          {chart.gauges.map((gauge) => (
            <GaugeChart
              key={gauge.id}
              label={gauge.label}
              valueLabel={gauge.valueLabel}
              percent={gauge.percent}
              targetPercent={100}
              hint={gauge.hint}
              tone={gauge.tone}
              caption={`${gauge.label}: ${gauge.valueLabel}, ${gauge.hint}.`}
            />
          ))}
        </div>
      ) : chart.kind === "heatmap" ? (
        <HeatmapChart
          cells={chart.cells}
          rows={chart.rows}
          columns={chart.columns}
          tone={chart.tone}
          formatValue={(value) => formatModuleValue(value, chart.unit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : chart.kind === "scatter" ? (
        <ScatterChart
          points={chart.points}
          xLabel={chart.xLabel}
          yLabel={chart.yLabel}
          formatX={(value) => formatModuleValue(value, chart.xUnit)}
          formatY={(value) => formatModuleValue(value, chart.yUnit)}
          accessibleSummary={chart.accessibleSummary}
        />
      ) : (
        <RadarChart axes={chart.axes} accessibleSummary={chart.accessibleSummary} />
      )}
    </ChartPanel>
  );
}

export function ModuleDataTable({
  columns,
  rows,
  linkKey,
  openOnlyFromLink = false,
  onOpen,
}: {
  columns: readonly ModuleColumn[];
  rows: readonly ModuleRow[];
  linkKey?: string;
  openOnlyFromLink?: boolean;
  onOpen: (row: ModuleRow) => void;
}) {
  const link = linkKey ?? columns[0]?.key;
  const isInteractiveTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a, label"));
  return (
    <div className="nx-table-wrap">
      <table className="nx-data-table">
        <thead>
          <tr>
            <th><input aria-label="Select all rows" type="checkbox" /></th>
            {columns.map((column) => (
              <th className={column.numeric ? "amount" : undefined} key={column.key}>{column.label}</th>
            ))}
            <th>Status</th>
            {!openOnlyFromLink ? <th><span className="sr-only">Actions</span></th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              className="nx-interactive-row"
              key={row.id}
              tabIndex={0}
              onClick={(event) => { if (!isInteractiveTarget(event.target)) onOpen(row); }}
              onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpen(row); } }}
            >
              <td><input aria-label={`Select ${row.cells[link ?? ""] ?? row.id}`} type="checkbox" /></td>
              {columns.map((column) => (
                <td className={column.numeric ? "amount" : undefined} key={column.key}>
                  {column.key === link ? (
                    <button className="nx-record-link" type="button" onClick={() => onOpen(row)}>{row.cells[column.key]}</button>
                  ) : (
                    row.cells[column.key] ?? "—"
                  )}
                </td>
              ))}
              <td><span className={`nx-status nx-status-${row.status.toLowerCase().replaceAll(" ", "-")}`}>{row.status}</span></td>
              {!openOnlyFromLink ? (
                <td>
                  <button className="nx-row-menu" aria-label={`Actions for ${row.cells[link ?? ""] ?? row.id}`} type="button" onClick={() => onOpen(row)}>•••</button>
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function ModuleSearchableTable({
  columns,
  rows,
  linkKey,
  openOnlyFromLink,
  filters,
  label,
  summary,
  totalRecords,
  onOpen,
  onAction,
}: {
  columns: readonly ModuleColumn[];
  rows: readonly ModuleRow[];
  linkKey?: string;
  openOnlyFromLink?: boolean;
  filters?: readonly string[];
  label: string;
  summary?: string;
  totalRecords?: number;
  onOpen: (row: ModuleRow) => void;
  onAction: (action: string, subject?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [createdOn, setCreatedOn] = useState("");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bank, setBank] = useState("");
  const [currency, setCurrency] = useState("");
  const [nominal, setNominal] = useState("");
  const [status, setStatus] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [reference, setReference] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const needle = query.trim().toLowerCase();
  const bankColumnKey = columns.find((column) => column.key.toLowerCase() === "bank" || /^bank(?:\s|\/|$)/i.test(column.label))?.key;
  const currencyColumnKey = columns.find((column) => ["cur", "currency"].includes(column.key.toLowerCase()) || /^(?:cur\.|currency)$/i.test(column.label.trim()))?.key;
  const nominalColumnKey = columns.find((column) => column.key.toLowerCase().includes("nominal") || /nominal(?:\s+account)?/i.test(column.label))?.key;
  const documentColumnKey = linkKey ?? columns.find((column) => /document|voucher|number|code/i.test(column.label))?.key ?? columns[0]?.key;
  const referenceColumnKey = columns.find((column) => /reference|source|ref\.?/i.test(column.label))?.key;
  const amountColumnKey = columns.find((column) => column.numeric || /amount|value|balance|total/i.test(column.label))?.key;
  const amountFor = (row: ModuleRow) => {
    const value = amountColumnKey ? row.cells[amountColumnKey] : "";
    const parsed = Number((value ?? "").replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const creatorFor = (row: ModuleRow) => row.cells.createdBy ?? row.cells.owner ?? row.cells.preparedBy ?? row.cells.requestedBy ?? "System";
  const dateFor = (row: ModuleRow) => row.cells.createdOn ?? row.cells.date ?? row.cells.transactionDate ?? row.cells.valueDate ?? "";
  const creators = [...new Set(rows.map(creatorFor))].sort();
  const banks = bankColumnKey ? [...new Set(rows.map((row) => row.cells[bankColumnKey]).filter(Boolean))].sort() : [];
  const currencies = currencyColumnKey ? [...new Set(rows.map((row) => row.cells[currencyColumnKey]).filter(Boolean))].sort() : [];
  const nominals = nominalColumnKey ? [...new Set(rows.map((row) => row.cells[nominalColumnKey]).filter(Boolean))].sort() : [];
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  const filtered = rows.filter((row) => {
    const queryMatch = !needle
      || Object.values(row.cells).some((value) => value.toLowerCase().includes(needle))
      || row.status.toLowerCase().includes(needle);
    const creatorMatch = !createdBy || creatorFor(row) === createdBy;
    const createdOnMatch = !createdOn || prototypeDateToIso(dateFor(row)) === createdOn;
    const bankMatch = !bank || (bankColumnKey ? row.cells[bankColumnKey] === bank : true);
    const currencyMatch = !currency || (currencyColumnKey ? row.cells[currencyColumnKey] === currency : true);
    const nominalMatch = !nominal || (nominalColumnKey ? row.cells[nominalColumnKey] === nominal : true);
    const statusMatch = !status || row.status === status;
    const documentMatch = !documentNumber || (documentColumnKey ? row.cells[documentColumnKey]?.toLowerCase().includes(documentNumber.toLowerCase()) : true);
    const referenceMatch = !reference || (referenceColumnKey ? row.cells[referenceColumnKey]?.toLowerCase().includes(reference.toLowerCase()) : Object.values(row.cells).some((value) => value.toLowerCase().includes(reference.toLowerCase())));
    const minimumMatch = !minAmount || amountFor(row) >= Number(minAmount);
    const maximumMatch = !maxAmount || amountFor(row) <= Number(maxAmount);
    return queryMatch && creatorMatch && createdOnMatch && bankMatch && currencyMatch && nominalMatch && statusMatch && documentMatch && referenceMatch && minimumMatch && maximumMatch && dateMatchesRange(dateFor(row), dateRange, customFrom, customTo);
  });
  const activeFilterCount = Number(Boolean(createdBy)) + Number(Boolean(createdOn)) + Number(dateRange !== "all") + Number(Boolean(bank)) + Number(Boolean(currency)) + Number(Boolean(nominal)) + Number(Boolean(status)) + Number(Boolean(documentNumber)) + Number(Boolean(reference)) + Number(Boolean(minAmount)) + Number(Boolean(maxAmount));

  return (
    <section className="nx-card nx-list-card">
      <div className="nx-filter-bar">
        <label className="nx-search-field">
          <span>⌕</span>
          <input aria-label={`Search ${label}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${label.toLowerCase()}...`} />
        </label>
        {bankColumnKey ? <ListFilterSelect listLabel={label} label="Bank" value={bank} options={banks} onChange={setBank} /> : null}
        {currencyColumnKey ? <ListFilterSelect listLabel={label} label="Currency" value={currency} options={currencies} onChange={setCurrency} /> : null}
        {nominalColumnKey ? <ListFilterSelect listLabel={label} label="Nominal" value={nominal} options={nominals} onChange={setNominal} /> : null}
        <ListFilterSelect listLabel={label} label="Status" value={status} options={statuses} onChange={setStatus} />
        {(filters ?? ["Status: All"])
          .filter((filter) => !/quarter|more filters/i.test(filter))
          .filter((filter) => !/^status:/i.test(filter))
          .filter((filter) => !(bankColumnKey && /^bank:/i.test(filter)) && !(currencyColumnKey && /^(?:cur\.|currency):/i.test(filter)) && !(nominalColumnKey && /^nominals?:/i.test(filter)))
          .slice(0, bankColumnKey || currencyColumnKey || nominalColumnKey ? 0 : 1)
          .map((filter) => (
          <button key={filter} type="button" onClick={() => onAction("Filter", filter)}>{filter}</button>
        ))}
        <button aria-expanded={advancedOpen} className={activeFilterCount ? "is-active" : undefined} type="button" onClick={() => setAdvancedOpen((value) => !value)}>
          Filters{activeFilterCount ? ` (${activeFilterCount})` : ""} ▾
        </button>
        <button className="nx-icon-control" aria-label="Refresh list" type="button" onClick={() => onAction("Refresh", label)}>↻</button>
        <button className="nx-icon-control" aria-label="Choose columns" type="button" onClick={() => onAction("Column selection", label)}>☷</button>
      </div>
      <AdvancedListFilters
        open={advancedOpen}
        creators={creators}
        createdBy={createdBy}
        createdOn={createdOn}
        dateRange={dateRange}
        customFrom={customFrom}
        customTo={customTo}
        onCreatedByChange={setCreatedBy}
        onCreatedOnChange={setCreatedOn}
        onDateRangeChange={setDateRange}
        onCustomFromChange={setCustomFrom}
        onCustomToChange={setCustomTo}
        documentNumber={documentNumber}
        reference={reference}
        minAmount={minAmount}
        maxAmount={maxAmount}
        onDocumentNumberChange={setDocumentNumber}
        onReferenceChange={setReference}
        onMinAmountChange={setMinAmount}
        onMaxAmountChange={setMaxAmount}
        onClear={() => {
          setCreatedBy("");
          setCreatedOn("");
          setDateRange("all");
          setCustomFrom("");
          setCustomTo("");
          setBank("");
          setCurrency("");
          setNominal("");
          setStatus("");
          setDocumentNumber("");
          setReference("");
          setMinAmount("");
          setMaxAmount("");
        }}
      />
      <ModuleDataTable columns={columns} rows={filtered} linkKey={linkKey} openOnlyFromLink={openOnlyFromLink} onOpen={onOpen} />
      <div className="nx-pagination">
        <span>{summary ?? `Showing 1–${filtered.length} of ${totalRecords ?? filtered.length} records`}</span>
        <div>
          <button disabled type="button">Previous</button>
          <button className="active" type="button">1</button>
          <button type="button" onClick={() => onAction("Page", "2")}>2</button>
          <button type="button" onClick={() => onAction("Next page", label)}>Next</button>
        </div>
      </div>
    </section>
  );
}
