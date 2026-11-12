"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import type { HrFinancePayrollDashboard } from "@nexora/contracts";

import { Button } from "@/components/ui/button";

import { HrStatusPill } from "./hr-detail-tile";
import { HrInlineBar } from "./hr-stat-tile";

type Period = HrFinancePayrollDashboard["recent_periods"][number];
type Metrics = HrFinancePayrollDashboard["metrics"];

const eyebrow = "m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
const card = "flex min-w-0 flex-col rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5";

export function payrollMoney(value: string | number, currency = "PKR", fractionDigits = 2) {
  return new Intl.NumberFormat("en-PK", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: fractionDigits,
  }).format(Number(value));
}

/** "2026-10-01" -> "Oct 2026". */
export function payrollMonth(month: string) {
  const date = new Date(`${month.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime())
    ? month.slice(0, 7)
    : date.toLocaleDateString("en-GB", { month: "short", year: "numeric" });
}

/** A closed period is finished, not a failure, so it reads neutral. */
export function PayrollStatePill({ state }: { state: string }) {
  return <HrStatusPill status={state} tone={state === "closed" ? "neutral" : undefined} />;
}

const stateOrder = ["open", "processing", "calculated", "under_review", "approved", "posting_ready", "posted", "paid", "closed"];
const steps = [
  { state: "calculated", label: "Calculated" },
  { state: "approved", label: "Approved" },
  { state: "posted", label: "Journal posted" },
  { state: "paid", label: "Paid" },
] as const;

/** Latest period: gross / deductions / net and payroll-to-payment progress. */
export function PayrollLatestPeriod({ latest, sample }: { latest: Period | null; sample: boolean }) {
  if (!latest)
    return (
      <article className={card}>
        <p className={eyebrow}>Latest period</p>
        <h2 className="m-0! mt-0.5! text-base font-semibold">No payroll period yet</h2>
        <p className="m-0! mt-2 text-sm text-muted-foreground">
          Figures appear here after the first payroll period is calculated.
        </p>
      </article>
    );
  const reached = stateOrder.indexOf(latest.state);
  const done = steps.map((step) => reached >= stateOrder.indexOf(step.state));
  const current = done.indexOf(false);
  const figures = [
    ["Gross pay", payrollMoney(latest.gross, latest.currency_code)],
    ["Deductions", payrollMoney(latest.deductions, latest.currency_code)],
    [`Net pay · ${latest.employee_count} employees`, payrollMoney(latest.net, latest.currency_code)],
  ] as const;
  return (
    <article className={card} aria-label="Latest payroll period">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={eyebrow}>Latest period{sample ? " · sample" : ""}</p>
          <h2 className="m-0! mt-0.5! text-base font-semibold">{payrollMonth(latest.month)} payroll</h2>
        </div>
        <PayrollStatePill state={latest.state} />
      </div>
      <dl className="m-0! mt-4 grid overflow-hidden rounded-lg border border-border sm:grid-cols-3">
        {figures.map(([term, value], index) => (
          <div
            key={term}
            className={`min-w-0 px-4 py-3 ${index ? "border-t border-border sm:border-t-0 sm:border-l" : ""}`}
          >
            <dt className="truncate text-xs text-muted-foreground">{term}</dt>
            <dd
              className={`m-0! mt-0.5 truncate text-lg font-semibold tabular-nums ${index === 2 ? "text-[var(--nx-brand)]" : ""}`}
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
      <ol className="m-0! mt-5 grid list-none grid-cols-4 p-0!" aria-label="Payroll-to-payment progress">
        {steps.map((step, index) => {
          const complete = done[index];
          const active = index === current;
          return (
            <li
              key={step.state}
              aria-current={active ? "step" : undefined}
              className={`relative grid justify-items-center gap-1.5 text-center text-xs ${
                complete || active ? "text-foreground" : "text-muted-foreground"
              } ${active ? "font-semibold" : ""}`}
            >
              {index ? (
                <span
                  aria-hidden
                  className={`absolute top-2.5 right-1/2 -left-1/2 h-0.5 ${complete || active ? "bg-[var(--nx-success)]" : "bg-border"}`}
                />
              ) : null}
              <span
                aria-hidden
                className={`relative z-10 grid size-5.5 place-items-center rounded-full border-2 ${
                  complete
                    ? "border-[var(--nx-success)] bg-[var(--nx-success)] text-card"
                    : active
                      ? "border-primary bg-card ring-4 ring-primary/20"
                      : "border-border bg-card"
                }`}
              >
                {complete ? <Check className="size-3" strokeWidth={3} /> : null}
              </span>
              {step.label}
            </li>
          );
        })}
      </ol>
      {latest.warning_count ? (
        <p className="m-0! mt-4 text-sm text-[var(--nx-warning)]">
          <strong>{latest.warning_count} calculation warning(s)</strong> to clear before approval.
        </p>
      ) : null}
    </article>
  );
}

/** Coverage and queue counts as one aligned list instead of separate cards. */
export function PayrollHealth({
  metrics,
  periodCount,
  onOpenEmployees,
}: {
  metrics: Metrics;
  periodCount: number;
  onOpenEmployees: () => void;
}) {
  const rows = [
    ["Review queue", "Calculated or under review", metrics.review_queue],
    ["Journal queue", "Approved, not yet posted", metrics.journal_queue],
    ["Payment exceptions", "Failed or rejected payments", metrics.payment_exceptions],
    ["Payroll periods", "All periods for this company", periodCount],
  ] as const;
  const attention = (label: string, value: number) => value > 0 && label !== "Payroll periods";
  return (
    <article className={card} aria-label="Payroll health">
      <p className={eyebrow}>Controls</p>
      <h2 className="m-0! mt-0.5! text-base font-semibold">Payroll health</h2>
      <ul className="m-0! mt-2 grid list-none p-0!">
        <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-b border-border/70 py-2.5">
          <span className="min-w-0">
            <span className="block text-sm font-medium">Salary coverage</span>
            <span className="block truncate text-xs text-muted-foreground">
              {metrics.salary_gaps
                ? `${metrics.salary_gaps} employee(s) without an effective salary`
                : "Every current employee has a salary"}
            </span>
          </span>
          <strong
            className={`text-right text-base tabular-nums ${metrics.salary_gaps ? "text-[var(--nx-warning)]" : ""}`}
          >
            {metrics.salary_covered_employees}/{metrics.current_employees}
          </strong>
          <span className="col-span-2">
            <HrInlineBar
              tone="success"
              value={metrics.salary_covered_employees}
              max={metrics.current_employees}
              label={`${metrics.salary_covered_employees} of ${metrics.current_employees} employees covered`}
            />
          </span>
          {metrics.salary_gaps ? (
            <Button className="col-span-2 justify-self-start" size="sm" variant="outline" onClick={onOpenEmployees}>
              Open employee directory
            </Button>
          ) : null}
        </li>
        {rows.map(([label, note, value]) => (
          <li
            key={label}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/70 py-2.5 last:border-0"
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium">{label}</span>
              <span className="block truncate text-xs text-muted-foreground">{note}</span>
            </span>
            <strong
              className={`text-right text-base tabular-nums ${attention(label, value) ? "text-[var(--nx-warning)]" : ""}`}
            >
              {value}
            </strong>
          </li>
        ))}
      </ul>
    </article>
  );
}

/** Net payroll by month: single series, bars from zero, hover/focus tooltip; the history table is its table view. */
export function PayrollNetTrend({ periods, sample }: { periods: readonly Period[]; sample: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const series = [...periods].slice(0, 6).reverse();
  if (!series.length) return null;
  const currency = series[series.length - 1]!.currency_code;
  const peak = Math.max(...series.map((period) => Number(period.net)), 1);
  const magnitude = 10 ** Math.floor(Math.log10(peak));
  const top = Math.ceil(peak / magnitude) * magnitude;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((step) => step * top);
  const compact = (value: number) =>
    new Intl.NumberFormat("en-PK", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  const active = hover === null ? null : series[hover];
  return (
    <article className={card} aria-label="Net payroll trend">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className={eyebrow}>Trend{sample ? " · sample" : ""}</p>
          <h2 className="m-0! mt-0.5! text-base font-semibold">Net payroll, last {series.length} months</h2>
        </div>
        <span className="text-xs text-muted-foreground">{currency}</span>
      </div>
      <div className="relative mt-4 grid h-52 grid-cols-[3rem_minmax(0,1fr)] grid-rows-[minmax(0,1fr)_1.5rem]">
        <div className="relative">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="absolute right-2 translate-y-1/2 text-[11px] text-muted-foreground tabular-nums"
              style={{ bottom: `${(tick / top) * 100}%` }}
            >
              {compact(tick)}
            </span>
          ))}
        </div>
        <div className="relative border-b border-[var(--nx-border-strong)]">
          {ticks.slice(1).map((tick) => (
            <span
              key={tick}
              aria-hidden
              className="absolute inset-x-0 border-t border-dashed border-border"
              style={{ bottom: `${(tick / top) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 grid auto-cols-fr grid-flow-col items-end gap-0.5 px-[4%]">
            {series.map((period, index) => {
              const net = Number(period.net);
              const last = index === series.length - 1;
              return (
                <button
                  type="button"
                  key={period.id}
                  aria-label={`${payrollMonth(period.month)}: net ${payrollMoney(net, period.currency_code, 0)}`}
                  onMouseEnter={() => setHover(index)}
                  onMouseLeave={() => setHover(null)}
                  onFocus={() => setHover(index)}
                  onBlur={() => setHover(null)}
                  className="relative flex h-full cursor-default items-end justify-center border-0 bg-transparent p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={`block w-[min(2.75rem,70%)] rounded-t bg-[var(--nx-brand)] transition-opacity ${
                      hover !== null && hover !== index ? "opacity-45" : ""
                    }`}
                    style={{ height: `${(net / top) * 100}%` }}
                  />
                  {last ? (
                    <span
                      className="absolute -translate-y-full pb-1 text-[11px] font-semibold tabular-nums"
                      style={{ bottom: `${(net / top) * 100}%` }}
                    >
                      {compact(net)}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
        <span />
        <div className="grid auto-cols-fr grid-flow-col px-[4%] pt-1">
          {series.map((period) => (
            <span key={period.id} className="truncate text-center text-[11px] text-muted-foreground">
              {payrollMonth(period.month)}
            </span>
          ))}
        </div>
        {active ? (
          <div
            role="status"
            className="pointer-events-none absolute top-0 z-10 grid min-w-40 gap-0.5 rounded-lg border border-border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
            style={{
              left: `clamp(0px, calc(3rem + (100% - 3rem) * ${((hover ?? 0) + 0.5) / series.length} - 5rem), calc(100% - 10rem))`,
            }}
          >
            <strong className="mb-0.5">{payrollMonth(active.month)}</strong>
            {[
              ["Net", payrollMoney(active.net, active.currency_code, 0)],
              ["Gross", payrollMoney(active.gross, active.currency_code, 0)],
              ["Employees", String(active.employee_count)],
            ].map(([term, value]) => (
              <span key={term} className="flex justify-between gap-3">
                <span className="text-muted-foreground">{term}</span>
                <span className="tabular-nums">{value}</span>
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </article>
  );
}
