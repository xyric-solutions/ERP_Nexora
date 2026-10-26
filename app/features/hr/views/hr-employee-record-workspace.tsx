"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import type { HrEmployeeDetail } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";

type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
type LoadState = "loading" | "ready" | "error";

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-md border border-border/70 bg-background/60 p-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-sm font-medium text-foreground">{value || "Not recorded"}</dd>
    </div>
  );
}

function statusVariant(status: HrEmployeeDetail["status"]) {
  return ["terminated", "resigned", "inactive"].includes(status) ? "outline" : "secondary";
}

/** A permission-scoped employee overview backed only by the HR detail API. */
export function HrEmployeeRecordWorkspace({
  employeeId,
  onNavigate,
}: {
  employeeId: string;
  onNavigate: Navigate;
}) {
  const { api, session, loading: sessionLoading, refresh: refreshSession } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [employee, setEmployee] = useState<HrEmployeeDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const canRead = session?.user.permissions.includes("hr.employee.read") ?? false;

  const load = useCallback(async () => {
    if (!employeeId || !canRead) return;
    setState("loading");
    try {
      setEmployee(await client.employee(employeeId));
      setState("ready");
    } catch {
      setEmployee(null);
      setState("error");
    }
  }, [canRead, client, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!employeeId)
    return (
      <Alert>
        <AlertTitle>Select an employee</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          Open an employee from the live directory to view their record.
          <Button type="button" variant="outline" onClick={() => onNavigate("hr", "employees")}>
            Employee Directory
          </Button>
        </AlertDescription>
      </Alert>
    );

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
        <AlertTitle>Employee access required</AlertTitle>
        <AlertDescription>This record requires employee read permission.</AlertDescription>
      </Alert>
    );
  if (state === "loading") return <Skeleton className="h-96 w-full" />;
  if (state === "error" || !employee)
    return (
      <Alert>
        <AlertTitle>Employee record could not be loaded</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          The employee may be outside your active company scope, or the live API is unavailable.
          <span className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => onNavigate("hr", "employees")}>
              Back to directory
            </Button>
            <Button type="button" onClick={() => void load()}>
              Retry
            </Button>
          </span>
        </AlertDescription>
      </Alert>
    );

  const initials = employee.display_name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  const destinations = [
    ["Contacts", "employee-contacts"],
    ["Emergency contacts", "employee-emergency-contacts"],
    ["Documents", "employee-documents"],
    ["Assignments", "employee-assignments"],
    ["Employee history", "employee-status-history"],
  ] as const;

  return (
    <section className="grid gap-5" aria-label={`Employee record for ${employee.display_name}`}>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div className="flex min-w-0 items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-full bg-primary/15 text-lg font-semibold text-primary">
            {initials}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-2xl font-semibold text-foreground">{employee.display_name}</h2>
              <Badge variant={statusVariant(employee.status)}>{employee.status.replaceAll("_", " ")}</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {employee.employee_number} · {employee.designation} · {employee.department}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => onNavigate("hr", "employees")}>
            Back to directory
          </Button>
          <Button type="button" variant="outline" onClick={() => void load()}>
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
          <span className="nx-eyebrow">Current placement</span>
          <h3 className="mt-1 text-xl font-semibold">Employment and assignment</h3>
          <dl className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Detail label="Designation" value={employee.designation} />
            <Detail label="Job grade" value={employee.job_grade} />
            <Detail label="Employment type" value={employee.employment_type} />
            <Detail label="Department" value={employee.department} />
            <Detail label="Branch" value={employee.branch} />
            <Detail label="Work location" value={employee.work_location} />
            <Detail label="Employee category" value={employee.employee_category} />
            <Detail label="Joined" value={employee.joined_on} />
            <Detail label="Reporting manager" value={employee.reporting_manager?.display_name} />
          </dl>
        </article>

        <div className="grid gap-4">
          <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
            <span className="nx-eyebrow">Contact</span>
            <h3 className="mt-1 text-xl font-semibold">Work profile</h3>
            <dl className="mt-4 grid gap-3">
              <Detail label="Preferred name" value={employee.preferred_name} />
              <Detail label="Work email" value={employee.work_email} />
              <Detail label="Phone" value={employee.phone} />
              <Detail
                label="Linked user account"
                value={employee.user_account_id ? "Connected" : "Not connected"}
              />
            </dl>
          </article>
          <Alert>
            <AlertTitle>Live governed record</AlertTitle>
            <AlertDescription>
              This overview is loaded from the permission-scoped employee detail API. Assignment and lifecycle history
              remain in their effective-dated workspaces.
            </AlertDescription>
          </Alert>
        </div>
      </div>

      <article className="rounded-lg border border-border bg-card p-5 shadow-sm">
        <span className="nx-eyebrow">Related records</span>
        <h3 className="mt-1 text-xl font-semibold">Open employee workspaces</h3>
        <div className="mt-4 flex flex-wrap gap-2">
          {destinations.map(([label, pageId]) => (
            <Button
              key={pageId}
              type="button"
              variant="outline"
              onClick={() => onNavigate("hr", pageId, employee.id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </article>
    </section>
  );
}
