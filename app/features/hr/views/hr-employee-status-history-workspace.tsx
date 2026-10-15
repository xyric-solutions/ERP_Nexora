"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeDirectory, HrEmployeeStatusHistoryDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

export function HrEmployeeStatusHistoryWorkspace() {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [history, setHistory] = useState<HrEmployeeStatusHistoryDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [historyState, setHistoryState] = useState<LoadState>("ready");
  const canReadHistory = session?.user.permissions.includes("hr.employment_history.read") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;

  useEffect(() => {
    if (sessionLoading || !canReadHistory || !canReadEmployees) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) =>
          result.items.some((company) => company.id === current) ? current : (result.items[0]?.id ?? ""),
        );
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canReadEmployees, canReadHistory, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    setEmployeeId("");
    setHistory([]);
    client
      .employees({ companyId, limit: 100 })
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
    setHistoryState("loading");
    client
      .employeeStatusHistory(employeeId)
      .then((result) => {
        if (!active) return;
        setHistory(result.items);
        setHistoryState("ready");
      })
      .catch(() => {
        if (active) setHistoryState("error");
      });
    return () => {
      active = false;
    };
  }, [client, employeeId]);

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canReadHistory || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Employment history access required</AlertTitle>
        <AlertDescription>This screen requires employee-directory and employment-history read permissions.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee status history">
      <Alert>
        <AlertTitle>Immutable employee status history</AlertTitle>
        <AlertDescription>
          Status evidence is read-only. Status changes must continue through their governed workflow and approval process.
        </AlertDescription>
      </Alert>
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-medium">
          Company
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={state === "loading"}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Employee
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            disabled={state !== "ready"}
          >
            <option value="">Select an employee</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} — {employee.display_name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live HR data unavailable</AlertTitle>
          <AlertDescription>No mock employment history is shown.</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && historyState === "loading" && <Skeleton className="h-32 w-full" />}
      {employeeId && historyState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Status history unavailable</AlertTitle>
          <AlertDescription>The selected employee is no longer available in your current company scope.</AlertDescription>
        </Alert>
      )}
      {employeeId && historyState === "ready" && (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Effective date</th>
                <th className="px-4 py-3">Status change</th>
                <th className="px-4 py-3">Reason</th>
              </tr>
            </thead>
            <tbody>
              {history.map((entry) => (
                <tr className="border-b border-border/70 last:border-0" key={entry.id}>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">{entry.effective_on}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {entry.from_status && <Badge variant="outline">{entry.from_status}</Badge>}
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="secondary">{entry.to_status}</Badge>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{entry.reason}</td>
                </tr>
              ))}
              {history.length === 0 && (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                    No status history is available for this employee.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
