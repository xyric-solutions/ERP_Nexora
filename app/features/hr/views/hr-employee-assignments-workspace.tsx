"use client";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrHireMakerPanel } from "../components/hr-hire-maker-panel";
import { HrTransferMakerPanel } from "../components/hr-transfer-maker-panel";
import { HrPromotionMakerPanel } from "../components/hr-promotion-maker-panel";
import { HrManagerChangeMakerPanel } from "../components/hr-manager-change-maker-panel";

type LoadState = "loading" | "ready" | "error";

function assignmentVariant(status: HrEmployeeAssignmentDirectory["items"][number]["assignment_status"]) {
  return status === "active" ? "secondary" : status === "ended" || status === "cancelled" ? "outline" : "default";
}

/** Displays immutable assignment history and governed maker workflows. */
export function HrEmployeeAssignmentsWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [employees, setEmployees] = useState<HrEmployeeDirectory["items"]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [assignments, setAssignments] = useState<HrEmployeeAssignmentDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [assignmentState, setAssignmentState] = useState<LoadState>("ready");
  const [assignmentRefreshKey, setAssignmentRefreshKey] = useState(0);
  const canReadAssignments = session?.user.permissions.includes("hr.employee_assignment.read") ?? false;
  const canReadEmployees = session?.user.permissions.includes("hr.employee.read") ?? false;
  const canCreateAssignment = session?.user.permissions.includes("hr.employee_assignment.create") ?? false;
  const canRequestHire =
    (session?.user.permissions.includes("hr.employment_lifecycle.action") ?? false) &&
    (session?.user.permissions.includes("hr.employment_relationship.create") ?? false);
  const canRequestTransfer = session?.user.permissions.includes("hr.employee_assignment.transfer") ?? false;
  const canRequestPromotion = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canRequestManagerChange = session?.user.permissions.includes("hr.employee_assignment.manager_change") ?? false;

  useEffect(() => {
    if (sessionLoading || !canReadAssignments || !canReadEmployees) return;
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
  }, [canReadAssignments, canReadEmployees, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    setEmployeeId("");
    setAssignments([]);
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
    setAssignmentState("loading");
    client
      .employeeAssignments(employeeId)
      .then((result) => {
        if (!active) return;
        setAssignments(result.items);
        setAssignmentState("ready");
      })
      .catch(() => {
        if (active) setAssignmentState("error");
      });
    return () => {
      active = false;
    };
  }, [assignmentRefreshKey, client, employeeId]);

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canReadAssignments || !canReadEmployees)
    return (
      <Alert>
        <AlertTitle>Assignment access required</AlertTitle>
        <AlertDescription>This screen requires employee-directory and assignment read permissions.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee assignment timeline">
      <Alert>
        <AlertTitle>Effective-dated assignment history</AlertTitle>
        <AlertDescription>
          The timeline remains immutable. Authorized HR makers can prepare a profile-draft assignment and submit a
          separate Hire request below; activation still requires an independent approval.
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
          <AlertDescription>No mock assignment history is shown.</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-20 w-full" />}
      {employeeId && assignmentState === "loading" && <Skeleton className="h-32 w-full" />}
      {employeeId && assignmentState === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Assignment history unavailable</AlertTitle>
          <AlertDescription>
            The selected employee is no longer available in your current company scope.
          </AlertDescription>
        </Alert>
      )}
      {employeeId && assignmentState === "ready" && (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Effective period</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Employment context</th>
                  <th className="px-4 py-3">Change</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => (
                  <tr className="border-b border-border/70 last:border-0" key={assignment.id}>
                    <td className="px-4 py-3 text-muted-foreground">
                      {assignment.effective_from} to {assignment.effective_to ?? "Current"}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{assignment.designation}</p>
                      {assignment.job && <p className="text-xs text-muted-foreground">{assignment.job}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {assignment.employment_type} · {assignment.job_grade} · {assignment.work_location}
                    </td>
                    <td className="px-4 py-3 capitalize text-muted-foreground">
                      {assignment.change_reason.replaceAll("_", " ")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={assignmentVariant(assignment.assignment_status)}>
                        {assignment.assignment_status.replaceAll("_", " ")}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {assignments.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      No assignment history is available for this employee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <HrHireMakerPanel
            key={`${companyId}:${employeeId}`}
            client={client}
            csrfToken={csrfToken}
            companyId={companyId}
            employeeId={employeeId}
            assignments={assignments}
            canCreateAssignment={canCreateAssignment}
            canRequestHire={canRequestHire}
            onAssignmentCreated={() => setAssignmentRefreshKey((current) => current + 1)}
          />
          <HrTransferMakerPanel
            key={`transfer:${companyId}:${employeeId}:${assignmentRefreshKey}`}
            client={client}
            csrfToken={csrfToken}
            companyId={companyId}
            employeeId={employeeId}
            assignments={assignments}
            canRequestTransfer={canRequestTransfer}
          />
          <HrPromotionMakerPanel
            key={`promotion:${companyId}:${employeeId}:${assignmentRefreshKey}`}
            client={client}
            csrfToken={csrfToken}
            companyId={companyId}
            employeeId={employeeId}
            assignments={assignments}
            canRequestPromotion={canRequestPromotion}
          />
          <HrManagerChangeMakerPanel
            key={`manager-change:${companyId}:${employeeId}:${assignmentRefreshKey}`}
            client={client}
            csrfToken={csrfToken}
            companyId={companyId}
            employeeId={employeeId}
            employees={employees}
            assignments={assignments}
            canRequestManagerChange={canRequestManagerChange}
          />
        </>
      )}
    </section>
  );
}
