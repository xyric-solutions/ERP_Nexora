"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HrFinancePayrollDashboard } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrStatusPill } from "../components/hr-detail-tile";
import {
  PayrollHealth,
  PayrollLatestPeriod,
  PayrollNetTrend,
  PayrollStatePill,
  payrollMoney,
  payrollMonth,
} from "../components/hr-finance-payroll-panels";
import { HrInsightHeader } from "../components/hr-stat-tile";
import { financePayrollSamplePeriods, showFinancePayrollSample } from "../model/finance-payroll-sample";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;

export function HrFinancePayrollDashboardWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [summary, setSummary] = useState<HrFinancePayrollDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRead = Boolean(
    session?.user.permissions.some((permission) =>
      ["hr.payroll.report.read", "hr.payroll.period.read", "hr.payroll.result.read"].includes(permission),
    ),
  );

  const load = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        setSummary(await client.financePayrollDashboard(targetCompanyId));
        setError("");
      } catch {
        setSummary(null);
        setError("The live Finance and Payroll summary could not be loaded for this company.");
      } finally {
        setLoading(false);
      }
    },
    [client],
  );

  useEffect(() => {
    if (sessionLoading || !canRead) {
      return;
    }
    client
      .companies()
      .then((result) => {
        const first = result.items[0]?.id ?? "";
        return load(first);
      })
      .catch(() => {
        setError("Authorized payroll companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);

  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Payroll reporting access required</AlertTitle>
        <AlertDescription>
          This dashboard requires payroll period, result or reporting read permission.
        </AlertDescription>
      </Alert>
    );

  const latest = summary?.latest_period;
  const metrics = summary?.metrics;
  const sample = Boolean(summary && summary.recent_periods.length === 0 && showFinancePayrollSample);
  const periods = sample ? financePayrollSamplePeriods : (summary?.recent_periods ?? []);
  const shownLatest = sample ? (financePayrollSamplePeriods[0] ?? null) : (latest ?? null);

  return (
    <section className="grid min-w-0 gap-4" aria-label="Finance and Payroll Dashboard">
      <HrInsightHeader eyebrow="Finance / payroll control" title="Finance & Payroll Dashboard" />

      {error ? (
        <Alert>
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error} No prototype payroll values are shown.</AlertDescription>
        </Alert>
      ) : null}
      {loading && !summary ? <Skeleton className="h-80 w-full" /> : null}

      {summary ? (
        <>
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(0,1fr)]">
            <PayrollLatestPeriod latest={shownLatest} sample={sample} />
            {metrics ? (
              <PayrollHealth
                metrics={metrics}
                periodCount={metrics.total_periods}
                onOpenEmployees={() => onNavigate("hr", "employees")}
              />
            ) : null}
          </div>
          <PayrollNetTrend periods={periods} sample={sample} />

          <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex flex-wrap items-start justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <p className="m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Period history
                </p>
                <h2 className="m-0! mt-0.5! text-base font-semibold">Recent payroll periods</h2>
              </div>
              {sample ? <HrStatusPill status="sample" tone="info" label="Sample data" /> : null}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-200 text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 sm:pl-5">Period</th>
                    <th className="px-4 py-2.5">Status</th>
                    <th className="px-4 py-2.5 text-right">Employees</th>
                    <th className="px-4 py-2.5 text-right">Gross</th>
                    <th className="px-4 py-2.5 text-right">Deductions</th>
                    <th className="px-4 py-2.5 text-right">Net</th>
                    <th className="px-4 py-2.5">Journal</th>
                    <th className="px-4 py-2.5 sm:pr-5">Payment</th>
                  </tr>
                </thead>
                <tbody>
                  {periods.map((period) => (
                    <tr className="border-b border-border/70 last:border-0" key={period.id}>
                      <td className="px-4 py-3 sm:pl-5">
                        <span className="block font-medium">{payrollMonth(period.month)}</span>
                        <span className="text-xs text-muted-foreground">Run {period.run_number}</span>
                      </td>
                      <td className="px-4 py-3">
                        <PayrollStatePill state={period.state} />
                      </td>
                      <td className="px-4 py-3 text-right tabular-nums">{period.employee_count}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{payrollMoney(period.gross, period.currency_code)}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {payrollMoney(period.deductions, period.currency_code)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold tabular-nums">
                        {payrollMoney(period.net, period.currency_code)}
                      </td>
                      <td className="px-4 py-3">
                        {period.journal_state ? (
                          <HrStatusPill status={period.journal_state} />
                        ) : (
                          <span className="text-muted-foreground">Not started</span>
                        )}
                      </td>
                      <td className="px-4 py-3 sm:pr-5">
                        {period.payment_state ? (
                          <span className="grid justify-items-start gap-0.5">
                            <HrStatusPill status={period.payment_state} />
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {period.confirmed_payment_count}/{period.payment_count} confirmed
                            </span>
                          </span>
                        ) : (
                          <span className="text-muted-foreground">Not started</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {periods.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={8}>
                        No payroll periods have been recorded for this company.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
          <p className="m-0! text-right text-xs text-muted-foreground">
            Updated {new Date(summary.generated_at).toLocaleString()}
          </p>
        </>
      ) : null}
    </section>
  );
}
