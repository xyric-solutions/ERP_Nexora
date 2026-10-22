"use client";

import { useState } from "react";
import { ArrowLeftRight, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";
import type { HrPayrollRunComparisonQuery, HrPayrollRunWorkspace } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import type { HrApiClient } from "../api/hr-client";
import { Field, Metric, panel, selectClass, useAttendanceRead } from "./hr-workspace-controls";

const labels = {
  amount_changed: "Pay amount changed",
  evidence_changed: "Evidence changed; pay unchanged",
  added: "Added to run",
  removed: "Removed from run",
  unchanged: "Unchanged",
};
const amountLabels = {
  gross: "Gross earnings",
  deductions: "Deductions",
  net: "Employee net pay",
  employer_contributions: "Employer contributions",
};
const signed = (value: string) => (/^-?0(?:\.0+)?$/.test(value) || value.startsWith("-") ? value : "+" + value);

export function HrPayrollRunComparison({
  client,
  data,
  revision,
  disabled,
  onRefresh,
}: {
  client: HrApiClient;
  data: HrPayrollRunWorkspace;
  revision: number;
  disabled: boolean;
  onRefresh: () => void;
}) {
  const [baseline, setBaseline] = useState(""),
    [filter, setFilter] = useState<HrPayrollRunComparisonQuery["filter"]>("changed"),
    [offset, setOffset] = useState(0);
  const query: HrPayrollRunComparisonQuery = {
    company_id: data.company_id,
    month: data.month,
    expected_run_number: data.period!.run_number,
    ...(baseline ? { baseline_run_number: Number(baseline) } : {}),
    filter,
    limit: 25,
    offset,
  };
  const state = useAttendanceRead(JSON.stringify([query, data.period!.version, revision]), () =>
      client.payrollRunComparison(query),
    ),
    comparison = state.data;
  return (
    <section className={panel + " grid gap-4"} aria-label="Payroll run comparison">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <ArrowLeftRight className="h-5 w-5 shrink-0 text-primary" />
            Review recalculation changes
          </h3>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Compare the current calculation with an earlier saved run for this company and month. Amounts come from
            immutable Payroll results. Employee names and numbers are current directory labels.
          </p>
        </div>
        <Button
          variant="outline"
          disabled={disabled || state.loading}
          onClick={onRefresh}
          aria-label="Refresh run comparison"
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field title="Compare with earlier run">
          <select
            className={selectClass}
            value={baseline}
            disabled={disabled || state.loading}
            onChange={(e) => {
              setBaseline(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Most recent earlier calculation</option>
            {comparison?.runs
              .filter((r) => r.run_number < comparison.current_run_number)
              .map((r) => (
                <option key={r.run_number} value={r.run_number}>
                  Run {r.run_number} · {r.employee_count} employee(s)
                </option>
              ))}
          </select>
        </Field>
        <Field title="Comparison results">
          <select
            className={selectClass}
            value={filter}
            disabled={disabled}
            onChange={(e) => {
              setFilter(e.target.value as typeof filter);
              setOffset(0);
            }}
          >
            <option value="changed">All changes</option>
            <option value="all">All employees</option>
            {Object.entries(labels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      {state.loading ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading retained run evidence…
        </p>
      ) : state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {state.error} Refresh Payroll results if the current calculation changed.
        </div>
      ) : (
        comparison && (
          <>
            <p className="text-sm font-medium">
              Current run {comparison.current_run_number}
              {comparison.baseline_run_number === null
                ? " · First calculation; no earlier retained run"
                : " compared with run " + comparison.baseline_run_number}{" "}
              · {comparison.currency_code}
            </p>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                title="Net pay change"
                value={comparison.baseline_run_number === null ? "—" : signed(comparison.delta.net)}
                hint={comparison.currency_code + " · current minus earlier"}
              />
              <Metric
                title="Pay amounts changed"
                value={comparison.counts.amount_changed}
                hint={comparison.counts.added + " added · " + comparison.counts.removed + " removed"}
              />
              <Metric
                title="Evidence changes only"
                value={comparison.counts.evidence_changed}
                hint="Same pay; review retained fingerprints"
              />
              <Metric
                title="Unchanged employees"
                value={comparison.counts.unchanged}
                hint="Same amounts and calculation evidence"
              />
            </div>
            <details className="min-w-0 rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Complete run totals · all employees</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {Object.entries(amountLabels).map(([key, title]) => {
                  const k = key as keyof typeof amountLabels;
                  return (
                    <div key={k} className="min-w-0 rounded-md bg-muted/30 p-3">
                      <h4 className="font-medium">{title}</h4>
                      <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-muted-foreground">Earlier</dt>
                        <dd className="break-all text-right font-mono tabular-nums">
                          {comparison.baseline_totals?.[k] ?? "—"}
                        </dd>
                        <dt className="text-muted-foreground">Current</dt>
                        <dd className="break-all text-right font-mono tabular-nums">{comparison.current_totals[k]}</dd>
                        <dt className="text-muted-foreground">Change</dt>
                        <dd className="break-all text-right font-mono tabular-nums">
                          {comparison.baseline_run_number === null ? "—" : signed(comparison.delta[k])}
                        </dd>
                      </dl>
                    </div>
                  );
                })}
              </div>
            </details>
            {!comparison.items.length ? (
              <p
                role="status"
                className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground"
              >
                {comparison.total
                  ? "No employees on this page. Use Previous to return to the retained results."
                  : "No employees match this comparison filter."}
              </p>
            ) : (
              <div className="grid min-w-0 gap-3">
                {comparison.items.map((item) => (
                  <details key={item.employee_id} className="min-w-0 rounded-lg border border-border p-3 sm:p-4">
                    <summary className="cursor-pointer text-sm">
                      <span className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                        <span className="min-w-0 break-words font-semibold">
                          {item.display_name}
                          <span className="mt-1 block text-xs font-normal text-muted-foreground">
                            {item.employee_number}
                          </span>
                        </span>
                        <span className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                          {labels[item.change]}
                        </span>
                      </span>
                      <span className="mt-2 grid min-w-0 gap-1 text-xs sm:grid-cols-3">
                        <span className="flex flex-wrap justify-between gap-x-2">
                          <span className="text-muted-foreground">Earlier net</span>
                          <span className="whitespace-nowrap font-mono tabular-nums">{item.before?.net ?? "—"}</span>
                        </span>
                        <span className="flex flex-wrap justify-between gap-x-2">
                          <span className="text-muted-foreground">Current net</span>
                          <span className="whitespace-nowrap font-mono tabular-nums">{item.after?.net ?? "—"}</span>
                        </span>
                        {comparison.baseline_run_number !== null && (
                          <span className="flex flex-wrap justify-between gap-x-2">
                            <span className="text-muted-foreground">Net change</span>
                            <span className="whitespace-nowrap font-mono tabular-nums">{signed(item.delta.net)}</span>
                          </span>
                        )}
                      </span>
                    </summary>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {Object.entries(amountLabels).map(([key, title]) => {
                        const k = key as keyof typeof amountLabels;
                        return (
                          <div key={k} className="min-w-0 rounded-md bg-muted/30 p-3 text-xs">
                            <h4 className="font-semibold">{title}</h4>
                            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
                              <dt className="text-muted-foreground">Earlier</dt>
                              <dd className="break-all text-right font-mono tabular-nums">{item.before?.[k] ?? "—"}</dd>
                              <dt className="text-muted-foreground">Current</dt>
                              <dd className="break-all text-right font-mono tabular-nums">{item.after?.[k] ?? "—"}</dd>
                              <dt className="text-muted-foreground">Change</dt>
                              <dd className="break-all text-right font-mono tabular-nums">
                                {comparison.baseline_run_number === null ? "—" : signed(item.delta[k])}
                              </dd>
                            </dl>
                          </div>
                        );
                      })}
                    </div>
                    {(item.evidence_changed || item.attendance_changed) && (
                      <p className="mt-3 text-xs text-muted-foreground">
                        {item.attendance_changed ? "Frozen attendance evidence differs. " : ""}
                        {item.evidence_changed
                          ? "Calculation inputs or outputs differ. Inspect both retained results before deciding."
                          : ""}
                      </p>
                    )}
                    <details className="mt-3 min-w-0 text-xs text-muted-foreground">
                      <summary className="cursor-pointer">Original result IDs and fingerprints</summary>
                      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                        {(["before", "after"] as const).map((side) => (
                          <div key={side} className="min-w-0">
                            <h4 className="font-semibold text-foreground">
                              {side === "before" ? "Earlier result" : "Current result"}
                            </h4>
                            {item[side] ? (
                              <dl className="mt-2 grid min-w-0 gap-1">
                                <dt>Result</dt>
                                <dd className="break-all font-mono">{item[side].id}</dd>
                                <dt>Calculation</dt>
                                <dd className="break-all font-mono">{item[side].calculation_hash}</dd>
                                <dt>Attendance</dt>
                                <dd className="break-all font-mono">{item[side].attendance_source_hash}</dd>
                              </dl>
                            ) : (
                              <p className="mt-2">Employee absent from this run.</p>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  </details>
                ))}
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {comparison.total ? Math.min(comparison.offset + 1, comparison.total) : 0}–
                {Math.min(comparison.offset + comparison.items.length, comparison.total)} of {comparison.total} matching
                employee(s)
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  aria-label="Previous comparison page"
                  disabled={disabled || offset === 0}
                  onClick={() => setOffset((v) => Math.max(0, v - 25))}
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                <Button
                  variant="outline"
                  aria-label="Next comparison page"
                  disabled={disabled || offset + comparison.limit >= comparison.total}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs leading-relaxed text-muted-foreground">
              This comparison shows original calculations, before later settlement supplements. It does not change a
              run, consume Payroll inputs, approve salaries or establish payment. Review the current run’s approval
              gates separately.
            </p>
          </>
        )
      )}
    </section>
  );
}
