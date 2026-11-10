"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Building2, ChevronRight, ClipboardCheck, FileClock, UserPlus, Users, Workflow } from "lucide-react";
import type { HrDashboardSummary } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrStatusPill, hrDisplayDate } from "../components/hr-detail-tile";
import { HrInlineBar, HrInsightHeader, HrStatTile } from "../components/hr-stat-tile";

type Navigate = (moduleId: string, pageId: string) => void;

export function HrDashboardWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
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
          setError("The HR summary could not be loaded. Reload the page to try again.");
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
        const first = result.items[0]?.id ?? "";
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
    ["Active headcount", metrics?.active_headcount ?? 0, "Current effective assignments", "employees", Users],
    ["Draft profiles", metrics?.draft_profiles ?? 0, "Still being prepared", "employee-drafts", FileClock],
    ["Pending approvals", metrics?.pending_employee_approvals ?? 0, "Awaiting review", "employee-approvals", ClipboardCheck],
    ["Pending movements", metrics?.pending_movements ?? 0, "Hire and assignment changes", "employee-approvals", Workflow],
    ["Active departments", metrics?.active_departments ?? 0, "In this company", "org-structure", Building2],
    ["Recent joiners", metrics?.recent_joiners ?? 0, "Last 90 days", "employees", UserPlus],
  ] as const;
  const distribution = summary?.status_distribution ?? [];
  const distributionTotal = distribution.reduce((total, item) => total + item.count, 0);
  const distributionMax = Math.max(0, ...distribution.map((item) => item.count));
  const share = (count: number) => (distributionTotal ? (count / distributionTotal) * 100 : 0);

  return (
    <section className="grid min-w-0 gap-4" aria-label="HR Dashboard">
      <HrInsightHeader eyebrow="People & workforce" title="HR Dashboard" />
      {error ? (
        <Alert>
          <AlertTitle>Dashboard unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {loading ? (
        <div aria-label="Loading workforce summary" className="grid gap-3">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map(([label]) => (
              <Skeleton key={label} className="h-22 w-full" />
            ))}
          </div>
          <Skeleton className="h-56 w-full" />
        </div>
      ) : summary ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            {cards.map(([label, value, note, pageId, Icon]) => (
              <HrStatTile
                key={label}
                label={label}
                value={value.toLocaleString()}
                note={note}
                icon={Icon}
                onClick={() => onNavigate("hr", pageId)}
              />
            ))}
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <article className="flex min-w-0 flex-col gap-4 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                    Workforce composition
                  </p>
                  <h2 className="m-0! mt-0.5! text-base font-semibold">Current employee status</h2>
                </div>
                <span className="text-right">
                  <strong className="block text-2xl font-semibold leading-tight tabular-nums">
                    {distributionTotal.toLocaleString()}
                  </strong>
                  <span className="text-xs text-muted-foreground">employees</span>
                </span>
              </div>
              {distribution.length ? (
                <ul className="m-0! grid list-none gap-0 p-0!">
                  {distribution.map((item) => (
                    <li
                      key={item.status}
                      className="grid grid-cols-[minmax(0,6.5rem)_minmax(0,1fr)_2.75rem_2.5rem] items-center gap-2 border-b border-border/70 py-2 text-sm last:border-0 sm:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem_3rem] sm:gap-3"
                    >
                      <span className="truncate">{statusLabel(item.status)}</span>
                      <HrInlineBar value={item.count} max={distributionMax} label={`${item.count} ${statusLabel(item.status)}`} />
                      <strong className="text-right tabular-nums">{item.count.toLocaleString()}</strong>
                      <span className="text-right text-xs text-muted-foreground tabular-nums">
                        {share(item.count).toFixed(0)}%
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0! text-sm text-muted-foreground">No current employees in this company.</p>
              )}
            </article>
            <article className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-card p-4 shadow-sm sm:p-5">
              <div>
                <p className="m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Action centre
                </p>
                <h2 className="m-0! mt-0.5! text-base font-semibold">Needs review</h2>
              </div>
              {summary.action_items.length ? (
                <ul className="m-0! mt-1! grid list-none gap-0 p-0!">
                  {summary.action_items.map((item) => (
                    <li key={item.key} className="m-0! border-b border-border last:border-0">
                      <button
                        className="flex w-full items-center gap-3 rounded-md border-0 bg-transparent px-2 py-2.5 text-left text-foreground transition-colors hover:bg-[var(--nx-surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        type="button"
                        onClick={() => onNavigate("hr", item.page_id)}
                      >
                        <span className="grid min-w-0 flex-1 gap-0.5">
                          <span className="truncate text-sm font-semibold">{item.label}</span>
                          {actionNotes[item.key] ? (
                            <span className="truncate text-[13px] text-muted-foreground">{actionNotes[item.key]}</span>
                          ) : null}
                        </span>
                        <HrStatusPill
                          status={item.count ? "pending" : "none"}
                          tone={item.count ? "warning" : "neutral"}
                          label={item.count.toLocaleString()}
                        />
                        <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-0! text-sm text-muted-foreground">No pending actions for this company.</p>
              )}
            </article>
          </div>
          <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border px-4 py-3 sm:px-5">
              <p className="m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Last 90 days
              </p>
              <h2 className="m-0! mt-0.5! text-base font-semibold">Recent joiners</h2>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-130 text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 sm:pl-5">Employee</th>
                    <th className="px-4 py-2.5">Position</th>
                    <th className="px-4 py-2.5 text-right sm:pr-5">Joined</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.recent_joiner_list.map((joiner) => (
                    <tr key={joiner.employee_id} className="border-b border-border/70 last:border-0">
                      <td className="px-4 py-2.5 sm:pl-5">
                        <span className="block font-medium">{joiner.employee_name}</span>
                        <span className="text-xs text-muted-foreground">{joiner.employee_number}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {[joiner.designation, joiner.department].filter(Boolean).join(" · ") || (
                          <span className="text-muted-foreground">Not recorded</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums sm:pr-5">{hrDisplayDate(joiner.joined_on)}</td>
                    </tr>
                  ))}
                  {summary.recent_joiner_list.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                        No one has joined in the last 90 days.
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
      ) : !error ? (
        <p className="rounded-lg border border-border bg-card p-5 text-muted-foreground">
          No authorised company is available for this dashboard.
        </p>
      ) : null}
    </section>
  );
}

function statusLabel(status: string) {
  const text = status.replaceAll("_", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** One-line explanations for the server's action-centre keys. */
const actionNotes: Record<string, string> = {
  drafts: "Complete and submit for approval",
  approvals: "Drafts and hires waiting for a decision",
  movements: "Transfers, promotions and placement changes",
  configuration: "Masters missing their setup",
};
