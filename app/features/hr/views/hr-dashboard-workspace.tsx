"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrDashboardSummary } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Navigate = (moduleId: string, pageId: string) => void;

export function HrDashboardWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [summary, setSummary] = useState<HrDashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRead = session?.user.permissions.includes("hr.employee.read") ?? false;

  const load = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        setSummary(await client.dashboard(targetCompanyId));
        setError("");
      } catch {
        setError("The live HR summary could not be loaded for this company. Refresh the session and try again.");
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
        setCompanies(result.items);
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        return load(first);
      })
      .catch(() => {
        setError("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);

  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.{" "}
          <Button className="ml-2" size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>HR access required</AlertTitle>
        <AlertDescription>The HR Dashboard requires employee read permission.</AlertDescription>
      </Alert>
    );

  const metrics = summary?.metrics;
  const cards = [
    ["Active headcount", metrics?.active_headcount ?? 0, "Current effective assignments", "employees"],
    ["Draft profiles", metrics?.draft_profiles ?? 0, "Profiles still being prepared", "employee-drafts"],
    [
      "Pending approvals",
      metrics?.pending_employee_approvals ?? 0,
      "Employee records awaiting review",
      "employee-approvals",
    ],
    ["Pending movements", metrics?.pending_movements ?? 0, "Hire and assignment changes", "employee-approvals"],
    ["Active departments", metrics?.active_departments ?? 0, "Within the selected company", "org-structure"],
    ["Recent joiners", metrics?.recent_joiners ?? 0, "Joined in the last 90 days", "employees"],
  ] as const;
  const distributionTotal = summary?.status_distribution.reduce((total, item) => total + item.count, 0) ?? 0;

  return (
    <section className="grid min-w-0 gap-5" aria-label="HR Dashboard">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              HR & Payroll · live operations
            </span>
            <Badge variant="outline">Live</Badge>
          </div>
          <h1 className="mt-1 text-3xl font-semibold">HR Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Company-scoped workforce and workflow signals from the live HR authority.
          </p>
        </div>
        <div className="flex min-w-0 w-full flex-wrap items-end gap-2 sm:w-auto">
          <label className="grid min-w-0 w-full gap-1 text-sm font-medium sm:w-64">
            Company
            <select
              className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                void load(event.target.value);
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <Button variant="outline" disabled={loading} onClick={() => void load(companyId)}>
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </header>
      <Alert>
        <AlertTitle>Live scope</AlertTitle>
        <AlertDescription>
          Workforce, draft, approval, movement, organisation and master-data counts are live. Open the owning
          Recruitment, Attendance, Leave or Payroll workspace for its detailed records and controls.
        </AlertDescription>
      </Alert>
      {error ? (
        <Alert>
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading && !summary ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value, note, pageId]) => (
              <button
                className="rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent"
                key={label}
                type="button"
                onClick={() => onNavigate("hr", pageId)}
              >
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</span>
                <strong className="mt-2 block text-3xl">{value}</strong>
                <small className="mt-1 block text-muted-foreground">{note}</small>
              </button>
            ))}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <article className="min-w-0 rounded-lg border border-border bg-card p-4 sm:p-5">
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Workforce composition
                </span>
                <h2 className="mt-1 text-xl font-semibold">Current employee status</h2>
              </div>
              <div className="grid gap-4">
                {summary?.status_distribution.length ? (
                  summary.status_distribution.map((item) => (
                    <div key={item.status}>
                      <div className="mb-1 flex justify-between text-sm">
                        <span className="capitalize">{item.status.replaceAll("_", " ")}</span>
                        <strong>{item.count}</strong>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full bg-primary"
                          style={{
                            width: `${distributionTotal ? Math.max(4, (item.count / distributionTotal) * 100) : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    No current effective employees are recorded for this company.
                  </p>
                )}
              </div>
            </article>
            <article className="rounded-lg border bg-card p-5">
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Action centre
                </span>
                <h2 className="mt-1 text-xl font-semibold">Needs review</h2>
              </div>
              <div className="grid gap-2">
                {summary?.action_items.map((item) => (
                  <button
                    className="flex items-center justify-between rounded-md border p-3 text-left hover:bg-accent"
                    key={item.key}
                    type="button"
                    onClick={() => onNavigate("hr", item.page_id)}
                  >
                    <span>
                      <strong className="block text-sm">{item.label}</strong>
                      <small className="text-muted-foreground">Open governed workspace</small>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {item.count}
                    </Badge>
                  </button>
                ))}
              </div>
              {metrics?.master_configuration_gaps ? (
                <Alert className="mt-4">
                  <AlertTitle>Master configuration incomplete</AlertTitle>
                  <AlertDescription>
                    {metrics.master_configuration_gaps} active master record(s) need their type-specific configuration
                    completed.
                  </AlertDescription>
                </Alert>
              ) : null}
            </article>
          </div>
          {summary ? (
            <p className="text-right text-xs text-muted-foreground">
              Updated {new Date(summary.generated_at).toLocaleString()}
            </p>
          ) : null}
        </>
      )}
    </section>
  );
}
