"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HrPositionsOrganization } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;

function Metric({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <article className="rounded-lg border border-border bg-card p-4 shadow-sm">
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</span>
      <strong className="mt-2 block text-3xl text-foreground">{value}</strong>
      <small className="mt-1 block text-muted-foreground">{note}</small>
    </article>
  );
}

export function HrPositionsOrganizationWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [summary, setSummary] = useState<HrPositionsOrganization | null>(null);
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
        setCompanies(result.items);
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

  const metrics = summary?.metrics;
  return (
    <section className="grid gap-5" aria-label="Positions and Organisation">
      <Alert>
        <AlertTitle>Current effective workforce positions</AlertTitle>
        <AlertDescription>
          Every row comes from a current effective employee assignment and its approved job, designation, grade,
          department and reporting manager. Vacancy or budgeted-position totals are not inferred without an approved
          position-establishment record.
        </AlertDescription>
      </Alert>

      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
        <label className="grid min-w-64 flex-1 gap-1.5 text-sm font-medium">
          Company
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={companyId}
            onChange={(event) => {
              setCompanyId(event.target.value);
              setAppliedQuery("");
              setQuery("");
            }}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex min-w-72 flex-[1.4] items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label className="grid flex-1 gap-1.5 text-sm font-medium">
            Search position or person
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee, job, designation or department" />
          </label>
          <Button type="submit" variant="outline">Search</Button>
          <Button type="button" variant="outline" onClick={() => { setQuery(""); setAppliedQuery(""); }}>Clear</Button>
        </form>
        <Button type="button" variant="outline" disabled={loading || !companyId} onClick={() => void load(companyId, appliedQuery)}>
          {loading ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      {error ? <Alert><AlertTitle>Positions unavailable</AlertTitle><AlertDescription>{error} No prototype rows are shown.</AlertDescription></Alert> : null}
      {loading && !summary ? <Skeleton className="h-80 w-full" /> : null}

      {summary ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Metric title="Current assignments" value={metrics?.current_assignments ?? 0} note="Occupied workforce positions" />
            <Metric title="Departments" value={metrics?.active_departments ?? 0} note="With current assignments" />
            <Metric title="Jobs represented" value={metrics?.represented_jobs ?? 0} note="Approved job catalogue entries" />
            <Metric title="Reporting managers" value={metrics?.reporting_managers ?? 0} note="Managers referenced by assignments" />
            <Metric title="Without manager" value={metrics?.without_manager ?? 0} note="Top-level or incomplete reporting lines" />
          </div>

          <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <span className="nx-eyebrow">Organisation coverage</span>
            <h2 className="mt-1 text-xl font-semibold">Department distribution</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {summary.departments.map((department) => (
                <div className="rounded-md border border-border/70 bg-background p-4" key={department.department_id}>
                  <div className="flex items-start justify-between gap-3">
                    <strong>{department.department}</strong>
                    <Badge variant="secondary">{department.active_people}</Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {department.job_count} job(s) · {department.manager_count} reporting manager(s)
                  </p>
                </div>
              ))}
              {summary.departments.length === 0 ? <p className="text-sm text-muted-foreground">No current assignments are recorded.</p> : null}
            </div>
          </article>

          <article className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
            <header className="border-b border-border p-5">
              <span className="nx-eyebrow">Current assignment register</span>
              <h2 className="mt-1 text-xl font-semibold">Occupied positions</h2>
              <p className="mt-1 text-sm text-muted-foreground">Showing up to 100 authorized current assignments.</p>
            </header>
            <div className="overflow-x-auto">
              <table className="w-full min-w-260 text-left text-sm">
                <thead className="bg-muted/60 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Position</th>
                    <th className="px-4 py-3">Job / grade</th>
                    <th className="px-4 py-3">Organisation</th>
                    <th className="px-4 py-3">Reports to</th>
                    <th className="px-4 py-3">Effective</th>
                    <th className="px-4 py-3"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {summary.items.map((item) => (
                    <tr className="border-t border-border/70" key={item.assignment_id}>
                      <td className="px-4 py-3"><strong className="block">{item.employee_name}</strong><span className="text-xs text-muted-foreground">{item.employee_number}</span></td>
                      <td className="px-4 py-3">{item.designation}</td>
                      <td className="px-4 py-3"><span className="block">{item.job}</span><span className="text-xs text-muted-foreground">{item.job_grade}</span></td>
                      <td className="px-4 py-3"><span className="block">{item.department}</span><span className="text-xs text-muted-foreground">{item.branch}</span></td>
                      <td className="px-4 py-3">{item.reporting_manager ?? "Top level"}</td>
                      <td className="px-4 py-3">{item.effective_from}</td>
                      <td className="px-4 py-3 text-right"><Button type="button" size="sm" variant="ghost" onClick={() => onNavigate("hr", "employee-record", item.employee_id)}>Open employee</Button></td>
                    </tr>
                  ))}
                  {summary.items.length === 0 ? <tr><td className="px-4 py-8 text-center text-muted-foreground" colSpan={7}>No current assignments match this search.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </article>
          <p className="text-right text-xs text-muted-foreground">Updated {new Date(summary.generated_at).toLocaleString()}</p>
        </>
      ) : null}
    </section>
  );
}
