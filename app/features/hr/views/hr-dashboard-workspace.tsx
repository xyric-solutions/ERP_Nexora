"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Building2, ClipboardCheck, FileClock, RefreshCw, UserPlus, Users, Workflow } from "lucide-react";
import type { HrDashboardSummary } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { LabeledField } from "@/shared/ui/labeled-field";
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
  const requestId = useRef(0);
  const canRead = session?.user.permissions.includes("hr.employee.read") ?? false;

  const load = useCallback(
    async (targetCompanyId: string) => {
      if (!targetCompanyId) return;
      const currentRequest = ++requestId.current;
      setLoading(true);
      setSummary(null);
      setError("");
      try {
        const result = await client.dashboard(targetCompanyId);
        if (currentRequest === requestId.current) setSummary(result);
      } catch {
        if (currentRequest === requestId.current)
          setError("The HR summary could not be loaded. Try refreshing this company.");
      } finally {
        if (currentRequest === requestId.current) setLoading(false);
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
        if (!first) setLoading(false);
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
  const icons = [Users, FileClock, ClipboardCheck, Workflow, Building2, UserPlus];

  return (
    <section className="grid min-w-0 gap-4 [&_h1]:mb-0! [&_h2]:mb-0! [&_p]:mb-0!" aria-label="HR Dashboard">
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-4">
        <div>
          <h1 className="text-3xl font-semibold">HR Dashboard</h1>
        </div>
        <div className="flex min-w-0 w-full flex-wrap items-end gap-2 sm:w-auto">
          <LabeledField className="w-full sm:w-64" label="Company">
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
          </LabeledField>
          <Button
            className="h-9"
            variant="outline"
            disabled={loading || !companyId}
            onClick={() => void load(companyId)}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
            {loading ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </header>
      {error ? (
        <Alert>
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <div aria-label="Loading workforce summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {cards.map(([label]) => (
            <Skeleton key={label} className="h-36 w-full" />
          ))}
        </div>
      ) : summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {cards.map(([label, value, note, pageId], index) => {
              const Icon = icons[index];
              return (
                <button
                  className="group rounded-xl border border-border bg-card p-4 text-left text-foreground shadow-sm transition-colors hover:border-primary/50 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  key={label}
                  type="button"
                  onClick={() => onNavigate("hr", pageId)}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-muted-foreground">{label}</span>
                    <Icon className="size-5 text-primary" />
                  </span>
                  <strong className="mt-3 block text-3xl tabular-nums">{value.toLocaleString()}</strong>
                  <small className="mt-1 block text-muted-foreground">{note}</small>
                </button>
              );
            })}
          </div>
          <div className="grid items-start gap-4 lg:grid-cols-2">
            <article className="min-w-0 rounded-lg border border-border bg-card p-4">
              <div className="mb-5 flex items-start justify-between gap-3">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    Workforce composition
                  </span>
                  <h2 className="mt-1 text-xl font-semibold">Current employee status</h2>
                </div>
                <Badge variant="secondary">{distributionTotal} total</Badge>
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
                            width: `${distributionTotal ? (item.count / distributionTotal) * 100 : 0}%`,
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
            <article className="min-w-0 rounded-lg border border-border bg-card p-4">
              <div className="mb-4">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Action centre
                </span>
                <h2 className="mt-1 text-xl font-semibold">Needs review</h2>
              </div>
              <div className="grid gap-2">
                {summary?.action_items.map((item) => (
                  <button
                    className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background p-3 text-left text-foreground hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    key={item.key}
                    type="button"
                    onClick={() => onNavigate("hr", item.page_id)}
                  >
                    <span>
                      <strong className="block text-sm">{item.label}</strong>
                      <small className="text-muted-foreground">
                        Review details <ArrowRight className="inline size-3" />
                      </small>
                    </span>
                    <Badge variant="outline" className="shrink-0">
                      {item.count}
                    </Badge>
                  </button>
                ))}
                {!summary.action_items.length ? (
                  <p className="text-sm text-muted-foreground">No pending actions for this company.</p>
                ) : null}
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
          <nav aria-label="HR shortcuts" className="grid gap-2 sm:grid-cols-3">
            {[
              ["People", "Employee records and approvals", "people-workspace"],
              ["Recruitment", "Plan roles and manage hiring", "recruitment-workspace"],
              ["Organisation & Masters", "Maintain your company structure", "organisation-masters"],
            ].map(([label, note, pageId]) => (
              <Button
                key={pageId}
                variant="outline"
                className="h-auto justify-between gap-3 whitespace-normal p-4 text-left"
                onClick={() => onNavigate("hr", pageId)}
              >
                <span>
                  <strong className="block">{label}</strong>
                  <span className="mt-1 block text-xs font-normal text-muted-foreground">{note}</span>
                </span>
                <ArrowRight className="shrink-0" />
              </Button>
            ))}
          </nav>
          {summary ? (
            <p className="text-right text-xs text-muted-foreground">
              Updated {new Date(summary.generated_at).toLocaleString()}
            </p>
          ) : null}
        </>
      ) : !error ? (
        <p className="rounded-lg border border-border bg-card p-4 text-muted-foreground">
          No authorised company is available for this dashboard.
        </p>
      ) : null}
    </section>
  );
}
