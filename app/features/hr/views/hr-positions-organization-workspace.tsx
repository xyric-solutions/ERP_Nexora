"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HrPositionsOrganization } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { BriefcaseBusiness, Building2, Network, UserRound, Users, X } from "lucide-react";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrDetailGroup, HrDetailSummary, HrDetailTile, HrStatusPill, hrDisplayDate } from "../components/hr-detail-tile";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrInlineBar, HrInsightHeader, HrStatTile } from "../components/hr-stat-tile";
import { positionsOrganizationSample, showPositionsOrganizationSample } from "../model/positions-organization-sample";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;

export function HrPositionsOrganizationWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companyId, setCompanyId] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [summary, setSummary] = useState<HrPositionsOrganization | null>(null);
  const [departmentId, setDepartmentId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const canRead = Boolean(
    session?.user.permissions.some((permission) =>
      ["hr.organization.read", "hr.employee_assignment.read", "hr.employee.read"].includes(permission),
    ),
  );

  const load = useCallback(
    async (targetCompanyId: string, search: string) => {
      if (!targetCompanyId) return;
      setLoading(true);
      try {
        setSummary(await client.positionsOrganization({ companyId: targetCompanyId, search: search || undefined, limit: 100 }));
        setError("");
      } catch {
        setSummary(null);
        setError("Current workforce positions could not be loaded from the authorized HR API.");
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
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        return load(first, "");
      })
      .catch(() => {
        setError("Authorized HR companies could not be loaded.");
        setLoading(false);
      });
    // Initial company scope should load once for the authenticated client.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, client, sessionLoading]);

  useEffect(() => {
    if (companyId) void load(companyId, appliedQuery);
  }, [appliedQuery, companyId, load]);

  // Search as the user types, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query.trim()), 350);
    return () => clearTimeout(timer);
  }, [query]);

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
        <AlertTitle>Organisation access required</AlertTitle>
        <AlertDescription>This screen requires organisation, assignment or employee read permission.</AlertDescription>
      </Alert>
    );

  const sample = Boolean(
    summary && showPositionsOrganizationSample && summary.metrics.current_assignments === 0 && !appliedQuery,
  );
  const view = sample ? { ...summary!, ...positionsOrganizationSample } : summary;
  const metrics = view?.metrics;
  const typed = query.trim().toLowerCase();
  const rows = (view?.items ?? []).filter(
    (item) =>
      (!departmentId || item.department_id === departmentId) &&
      (!sample ||
        !typed ||
        [item.employee_name, item.employee_number, item.designation, item.job, item.department, item.branch]
          .join(" ")
          .toLowerCase()
          .includes(typed)),
  );
  const department = view?.departments.find((item) => item.department_id === departmentId);
  const peak = Math.max(0, ...(view?.departments ?? []).map((item) => item.active_people));
  const selected = view?.items.find((item) => item.assignment_id === selectedId) ?? null;
  const eyebrow = "m-0! text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground";
  const th = "px-4 py-2.5";

  return (
    <section className="grid min-w-0 gap-4" aria-label="Positions and Organisation">
      <HrInsightHeader eyebrow="Workforce & insights" title="Positions & Organisation">
        <div className="flex w-full flex-wrap items-end gap-3 sm:w-auto">
          <label htmlFor="positions-org-search" className="grid w-full min-w-0 content-start gap-1 text-sm font-medium sm:w-72">
            Search
            <Input
              id="positions-org-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Employee, job, designation or department"
            />
          </label>
        </div>
      </HrInsightHeader>

      {error ? (
        <Alert>
          <AlertTitle>Positions unavailable</AlertTitle>
          <AlertDescription>{error} No prototype rows are shown.</AlertDescription>
        </Alert>
      ) : null}
      {loading && !summary ? <Skeleton className="h-80 w-full" /> : null}

      {view ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
            <HrStatTile label="Current assignments" value={metrics?.current_assignments ?? 0} note="Occupied positions" icon={Users} />
            <HrStatTile label="Departments" value={metrics?.active_departments ?? 0} note="With current assignments" icon={Building2} />
            <HrStatTile label="Jobs represented" value={metrics?.represented_jobs ?? 0} note="From the job catalogue" icon={BriefcaseBusiness} />
            <HrStatTile label="Reporting managers" value={metrics?.reporting_managers ?? 0} note="Referenced by assignments" icon={Network} />
            <HrStatTile label="Without manager" value={metrics?.without_manager ?? 0} note="Top level or incomplete" icon={UserRound} />
          </div>

          <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <p className={eyebrow}>Organisation coverage</p>
                <h2 className="m-0! mt-0.5! text-base font-semibold">Department distribution</h2>
              </div>
              {sample ? <HrStatusPill status="sample" tone="info" label="Sample data" /> : null}
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-160 text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className={`${th} sm:pl-5`}>Department</th>
                    <th className={`${th} w-2/5`}>Headcount</th>
                    <th className={`${th} text-right`}>People</th>
                    <th className={`${th} text-right`}>Share</th>
                    <th className={`${th} text-right`}>Jobs</th>
                    <th className={`${th} text-right sm:pr-5`}>Managers</th>
                  </tr>
                </thead>
                <tbody>
                  {view.departments.map((item) => (
                    <HrClickableRow
                      key={item.department_id}
                      onOpen={() => setDepartmentId((current) => (current === item.department_id ? "" : item.department_id))}
                    >
                      <td className={`px-4 py-2.5 font-medium sm:pl-5 ${item.department_id === departmentId ? "text-[var(--nx-brand)]" : ""}`}>
                        {item.department}
                      </td>
                      <td className="px-4 py-2.5">
                        <HrInlineBar value={item.active_people} max={peak} label={`${item.active_people} people`} />
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold tabular-nums">{item.active_people}</td>
                      <td className="px-4 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                        {metrics?.current_assignments
                          ? `${Math.round((item.active_people / metrics.current_assignments) * 100)}%`
                          : "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right tabular-nums">{item.job_count}</td>
                      <td className="px-4 py-2.5 text-right tabular-nums sm:pr-5">{item.manager_count}</td>
                    </HrClickableRow>
                  ))}
                  {view.departments.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                        No current assignments are recorded.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>

          <article className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="flex flex-wrap items-end justify-between gap-2 border-b border-border px-4 py-3 sm:px-5">
              <div>
                <p className={eyebrow}>Current assignment register</p>
                <h2 className="m-0! mt-0.5! text-base font-semibold">Occupied positions</h2>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {department ? (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[var(--nx-brand-line)] bg-[var(--nx-brand-soft)] py-0.5 pr-1 pl-2.5 font-semibold text-[var(--nx-brand)]">
                    {department.department}
                    <button
                      type="button"
                      aria-label="Remove department filter"
                      className="grid size-4.5 place-items-center rounded-full hover:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setDepartmentId("")}
                    >
                      <X className="size-3" />
                    </button>
                  </span>
                ) : null}
                <span className="tabular-nums">
                  Showing {rows.length} of {metrics?.current_assignments ?? 0}
                </span>
              </div>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-240 text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className={`${th} sm:pl-5`}>Employee</th>
                    <th className={th}>Position</th>
                    <th className={th}>Job · grade</th>
                    <th className={th}>Organisation</th>
                    <th className={th}>Reports to</th>
                    <th className={`${th} sm:pr-5`}>Effective from</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((item) => (
                    <HrClickableRow key={item.assignment_id} onOpen={() => setSelectedId(item.assignment_id)}>
                      <td className="px-4 py-2.5 sm:pl-5">
                        <span className="block font-medium">{item.employee_name}</span>
                        <span className="text-xs text-muted-foreground">{item.employee_number}</span>
                      </td>
                      <td className="px-4 py-2.5">{item.designation}</td>
                      <td className="px-4 py-2.5">
                        <span className="block">{item.job}</span>
                        <span className="text-xs text-muted-foreground">{item.job_grade}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="block">{item.department}</span>
                        <span className="text-xs text-muted-foreground">{item.branch}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        {item.reporting_manager ?? <HrStatusPill status="top" tone="neutral" label="Top level" />}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums sm:pr-5">{hrDisplayDate(item.effective_from)}</td>
                    </HrClickableRow>
                  ))}
                  {rows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                        No current assignments match this search.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </article>
          <p className="m-0! text-right text-xs text-muted-foreground">
            Updated {new Date(view.generated_at).toLocaleString()}
          </p>

          <HrMasterSheet
            open={!!selected}
            onOpenChange={(open) => {
              if (!open) setSelectedId("");
            }}
            eyebrow="Record details"
            title={selected?.designation ?? "Position"}
            description="Current position and organisation for this employee."
            footer={
              selected && !sample ? (
                <Button type="button" onClick={() => onNavigate("hr", "employee-record", selected.employee_id)}>
                  Open employee record
                </Button>
              ) : undefined
            }
          >
            {selected ? (
              <div className="grid gap-5">
                <HrDetailSummary code={selected.employee_number} status={selected.employee_status}>
                  {selected.employee_name}
                  {sample ? " · sample record" : ""}
                </HrDetailSummary>
                <HrDetailGroup title="Position">
                  <HrDetailTile label="Designation" value={selected.designation} />
                  <HrDetailTile label="Job" value={selected.job} />
                  <HrDetailTile label="Grade" value={selected.job_grade} />
                  <HrDetailTile label="Effective from" value={hrDisplayDate(selected.effective_from)} />
                </HrDetailGroup>
                <HrDetailGroup title="Organisation">
                  <HrDetailTile label="Department" value={selected.department} />
                  <HrDetailTile label="Location" value={selected.branch} />
                  <HrDetailTile label="Reports to" value={selected.reporting_manager ?? "Top level"} />
                </HrDetailGroup>
              </div>
            ) : null}
          </HrMasterSheet>
        </>
      ) : null}
    </section>
  );
}
