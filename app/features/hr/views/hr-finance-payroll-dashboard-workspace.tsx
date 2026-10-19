"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HrFinancePayrollDashboard } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;

function money(value: string, currency = "PKR") {
  return new Intl.NumberFormat("en-PK", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
}

function label(value: string | null) {
  return value ? value.replaceAll("_", " ") : "Not started";
}

function Metric({ title, value, note }: { title: string; value: string | number; note: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <strong className="mt-2 block text-3xl text-foreground">{value}</strong>
      <small className="mt-1 block text-muted-foreground">{note}</small>
    </article>
  );
}

export function HrFinancePayrollDashboardWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
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
      if (!sessionLoading) setLoading(false);
      return;
    }
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
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
        <AlertDescription>This dashboard requires payroll period, result or reporting read permission.</AlertDescription>
      </Alert>
    );

  const latest = summary?.latest_period;
  const metrics = summary?.metrics;

  return (
    <section className="grid gap-5" aria-label="Finance and Payroll Dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="nx-eyebrow">Finance / payroll control</span>
            <span className="nx-status nx-status-active">Live</span>
          </div>
          <h1 className="mt-1 font-serif text-3xl font-semibold">Finance &amp; Payroll Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Company-scoped payroll coverage, immutable results, journal and payment controls.
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-64 gap-1 text-sm font-medium">
            Company
            <select
              className="h-9 rounded-md border border-input bg-background px-2"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                void load(event.target.value);
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name} ({company.code})
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={loading || !companyId} onClick={() => void load(companyId)}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </header>

      <Alert>
        <AlertTitle>Authoritative read model</AlertTitle>
        <AlertDescription>
          Values come from effective salary assignments, payroll periods, immutable payroll results, journal proposals
          and governed payment batches. This dashboard does not calculate, approve, post or pay payroll.
        </AlertDescription>
      </Alert>
      {error ? (
        <Alert>
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error} No prototype payroll values are shown.</AlertDescription>
        </Alert>
      ) : null}
      {loading && !summary ? <Skeleton className="h-80 w-full" /> : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Current employees"
              value={metrics?.current_employees ?? 0}
              note="Effective company assignments"
            />
            <Metric
              title="Salary coverage"
              value={`${metrics?.salary_covered_employees ?? 0}/${metrics?.current_employees ?? 0}`}
              note={`${metrics?.salary_gaps ?? 0} employee(s) need an effective salary assignment`}
            />
            <Metric
              title="Latest gross payroll"
              value={latest ? money(latest.gross, latest.currency_code) : "—"}
              note={latest ? `Period ${latest.month.slice(0, 7)}` : "No payroll period recorded"}
            />
            <Metric
              title="Latest net payroll"
              value={latest ? money(latest.net, latest.currency_code) : "—"}
              note={latest ? `${latest.employee_count} calculated employee(s)` : "No immutable results recorded"}
            />
            <Metric title="Payroll periods" value={metrics?.total_periods ?? 0} note="All company periods" />
            <Metric title="Review queue" value={metrics?.review_queue ?? 0} note="Calculated or under review" />
            <Metric title="Journal queue" value={metrics?.journal_queue ?? 0} note="Approved and awaiting a posted journal" />
            <Metric title="Payment exceptions" value={metrics?.payment_exceptions ?? 0} note="Failed or rejected controls" />
          </div>

          {metrics?.salary_gaps ? (
            <Alert>
              <AlertTitle>Salary coverage needs attention</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                {metrics.salary_gaps} current employee(s) do not have an effective approved salary assignment.
                <Button variant="outline" onClick={() => onNavigate("hr", "employees")}>
                  Open employee directory
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="grid items-start gap-4 xl:grid-cols-[1fr_1.5fr]">
            <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
              <span className="nx-eyebrow">Latest period</span>
              <h2 className="mt-1 text-xl font-semibold">Payroll-to-payment control</h2>
              {latest ? (
                <dl className="mt-4 grid gap-3">
                  {[
                    ["Period", latest.month.slice(0, 7)],
                    ["Calculation", label(latest.state)],
                    ["Journal", label(latest.journal_state)],
                    ["Journal balanced", latest.journal_balanced === null ? "Not prepared" : latest.journal_balanced ? "Yes" : "No"],
                    ["Payment batch", label(latest.payment_state)],
                    ["Payments", `${latest.confirmed_payment_count}/${latest.payment_count} confirmed`],
                    ["Payment total", money(latest.payment_total, latest.currency_code)],
                    ["Calculation warnings", String(latest.warning_count)],
                  ].map(([term, value]) => (
                    <div className="flex items-center justify-between gap-4 border-b border-border/70 pb-2 last:border-0" key={term}>
                      <dt className="text-sm text-muted-foreground">{term}</dt>
                      <dd className="text-right text-sm font-semibold capitalize">{value}</dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-4 text-sm text-muted-foreground">
                  No payroll period exists for this company. The dashboard will populate when an authorized payroll
                  workflow creates its first period.
                </p>
              )}
            </article>

            <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
              <header className="border-b border-border p-5">
                <span className="nx-eyebrow">Period history</span>
                <h2 className="mt-1 text-xl font-semibold">Recent payroll periods</h2>
              </header>
              <div className="overflow-x-auto">
                <table className="w-full min-w-180 text-left text-sm">
                  <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Period</th>
                      <th className="px-4 py-3">State</th>
                      <th className="px-4 py-3 text-right">Employees</th>
                      <th className="px-4 py-3 text-right">Gross</th>
                      <th className="px-4 py-3 text-right">Net</th>
                      <th className="px-4 py-3">Journal</th>
                      <th className="px-4 py-3">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.recent_periods.map((period) => (
                      <tr className="border-t border-border/70" key={period.id}>
                        <td className="px-4 py-3 font-medium">{period.month.slice(0, 7)}</td>
                        <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{label(period.state)}</Badge></td>
                        <td className="px-4 py-3 text-right">{period.employee_count}</td>
                        <td className="px-4 py-3 text-right">{money(period.gross, period.currency_code)}</td>
                        <td className="px-4 py-3 text-right">{money(period.net, period.currency_code)}</td>
                        <td className="px-4 py-3 capitalize">{label(period.journal_state)}</td>
                        <td className="px-4 py-3 capitalize">{label(period.payment_state)}</td>
                      </tr>
                    ))}
                    {summary.recent_periods.length === 0 ? (
                      <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>No payroll periods have been recorded for this company.</td></tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </article>
          </div>
          <p className="text-right text-xs text-muted-foreground">
            Updated {new Date(summary.generated_at).toLocaleString()}
          </p>
        </>
      ) : null}
    </section>
  );
}
