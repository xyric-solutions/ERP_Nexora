"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "unavailable";

function employeeStatusVariant(status: HrEmployeeDirectory["items"][number]["status"]) {
  return ["terminated", "resigned", "inactive"].includes(status) ? "outline" : "secondary";
}

export function HrEmployeeDirectory({
  onOpenEmployee,
}: {
  onOpenEmployee: (employeeId: string) => void;
}) {
  const { api, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companyId, setCompanyId] = useState("");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [companyState, setCompanyState] = useState<LoadState>("loading");
  const [directoryState, setDirectoryState] = useState<LoadState>("loading");

  const reloadCompanies = () => {
    if (!session?.user.permissions.includes("hr.employee.read")) {
      setCompanyState("unavailable");
      return;
    }
    setCompanyState("loading");
    client
      .companies()
      .then((result) => {
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
        setCompanyState("ready");
      })
      .catch(() => setCompanyState("unavailable"));
  };

  useEffect(() => {
    reloadCompanies();
    // The client/session change only after a deliberate authentication change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client, session?.user.permissions]);

  useEffect(() => {
    if (companyState !== "ready" || !companyId) return;
    let active = true;
    setDirectoryState("loading");
    client
      .employees({ companyId, search: appliedQuery || undefined, limit: 50 })
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setDirectoryState("ready");
      })
      .catch(() => {
        if (active) setDirectoryState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [appliedQuery, client, companyId, companyState]);

  if (companyState === "unavailable") {
    return (
      <>
        <Alert>
          <AlertTitle>Live HR directory is unavailable</AlertTitle>
          <AlertDescription>
            Your current session could not load an authorized company scope. Refresh the session or check HR access.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee directory">
      <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <div className="grid min-w-55 flex-1 gap-1.5">
          <label className="text-sm font-medium text-foreground" htmlFor="hr-directory-company">
            Company
          </label>
          <select
            id="hr-directory-company"
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={companyState !== "ready" || companies.length === 0}
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </div>
        <form
          className="flex min-w-65 flex-1 items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label className="grid flex-1 gap-1.5 text-sm font-medium text-foreground" htmlFor="hr-directory-search">
            Search employee
            <Input
              id="hr-directory-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Name or employee number"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setQuery("");
              setAppliedQuery("");
            }}
          >
            Clear
          </Button>
        </form>
        <Button type="button" onClick={reloadCompanies} variant="outline">
          Refresh
        </Button>
      </div>

      {companyState === "loading" || directoryState === "loading" ? (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {companyState === "ready" && companies.length === 0 ? (
        <Alert>
          <AlertTitle>No HR company access</AlertTitle>
          <AlertDescription>Your account has no active company scope for the employee directory.</AlertDescription>
        </Alert>
      ) : null}

      {directoryState === "unavailable" ? (
        <Alert>
          <AlertTitle>Employee records could not be loaded</AlertTitle>
          <AlertDescription>
            The live directory is temporarily unavailable. No cached or unauthorized employee data is shown.
          </AlertDescription>
        </Alert>
      ) : null}

      {directoryState === "ready" ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
          <table className="w-full min-w-230 border-collapse text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Designation</th>
                <th className="px-4 py-3">Department</th>
                <th className="px-4 py-3">Joined</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr className="border-b border-border/70 last:border-0" key={employee.id}>
                  <td className="px-4 py-3">
                    <p className="font-medium text-foreground">{employee.display_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {employee.employee_number}
                      {employee.work_email ? ` · ${employee.work_email}` : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.designation}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    <span className="block text-foreground">{employee.department}</span>
                    <span className="text-xs">{employee.branch}</span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{employee.joined_on}</td>
                  <td className="px-4 py-3">
                    <Badge variant={employeeStatusVariant(employee.status)}>
                      {employee.status.replaceAll("_", " ")}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => onOpenEmployee(employee.id)}
                    >
                      Open
                    </Button>
                  </td>
                </tr>
              ))}
              {employees.length === 0 ? (
                <tr>
                  <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                    No employees match this company and search.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            Live, permission-scoped HR directory · showing up to 50 records
          </p>
        </div>
      ) : null}
    </section>
  );
}
