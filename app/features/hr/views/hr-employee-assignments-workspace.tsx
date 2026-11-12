"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { loadEmployeeRouteCompanies, loadEmployeeRouteDirectory } from "../api/employee-route-context";
import { HrHireMakerPanel } from "../components/hr-hire-maker-panel";
import { HrTransferMakerPanel } from "../components/hr-transfer-maker-panel";
import { HrPromotionMakerPanel } from "../components/hr-promotion-maker-panel";
import { HrManagerChangeMakerPanel } from "../components/hr-manager-change-maker-panel";
import { HrWorkLocationChangeMakerPanel } from "../components/hr-work-location-change-maker-panel";
import { HrOrganizationPlacementChangeMakerPanel } from "../components/hr-organization-placement-change-maker-panel";

type LoadState = "loading" | "ready" | "error";

function assignmentVariant(status: HrEmployeeAssignmentDirectory["items"][number]["assignment_status"]) {
  return status === "active" ? "secondary" : status === "ended" || status === "cancelled" ? "outline" : "default";
}

/** Displays immutable assignment history and governed maker workflows. */
export function HrEmployeeAssignmentsWorkspace({ initialEmployeeId }: { initialEmployeeId?: string } = {}) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companyRevision, setCompanyRevision] = useState(0);
  const [noCompany, setNoCompany] = useState(false);
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
  const canRequestWorkLocationChange = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canRequestOrganizationPlacementChange =
    session?.user.permissions.includes("hr.employee_assignment.change") ?? false;

  useEffect(() => {
    if (sessionLoading || !canReadAssignments || !canReadEmployees) return;
    let active = true;
    loadEmployeeRouteCompanies(client, initialEmployeeId)
      .then((result) => {
        if (!active) return;
        setNoCompany(result.items.length === 0);
        setCompanyId((current) =>
          result.items.some((company) => company.id === current) ? current : result.preferredCompanyId,
        );
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canReadAssignments, canReadEmployees, client, initialEmployeeId, sessionLoading, companyRevision]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    loadEmployeeRouteDirectory(client, companyId, initialEmployeeId)
      .then((result) => {
        if (!active) return;
        setEmployees(result.items);
        setEmployeeId(result.selectedEmployeeId);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId, initialEmployeeId]);

  useEffect(() => {
    if (!employeeId) return;
    let active = true;
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
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,28rem)]">
        <label className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
          Employee
          <select
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm"
            value={employeeId}
            onChange={(event) => {
              setAssignmentState(event.target.value ? "loading" : "ready");
              setAssignments([]);
              setEmployeeId(event.target.value);
            }}
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
          <AlertDescription>Authorized companies or employees could not be loaded. Retry the request.</AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setState("loading");
              setCompanyRevision((v) => v + 1);
            }}
          >
            Retry movement companies
          </Button>
        </Alert>
      )}
      {state === "ready" && noCompany ? (
        <Alert>
          <AlertTitle>Company access required</AlertTitle>
          <AlertDescription>
            Company access must be granted before employee assignments can be reviewed.
          </AlertDescription>
        </Alert>
      ) : null}
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
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <WorkTable tableId="app/features/hr/views/hr-employee-assignments-workspace:1" className="w-full text-left text-sm">
              <thead className="border-b border-border bg-muted/60 font-semibold">
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
                      {[assignment.employment_setup, assignment.job_grade, assignment.work_location].filter(Boolean).join(" · ")}
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
            </WorkTable>
          </div>
          <div className="flex min-w-0 flex-wrap gap-2">
            <HrHireMakerPanel
              key={`${companyId}:${employeeId}`}
              client={client}
              csrfToken={csrfToken}
              companyId={companyId}
              employeeId={employeeId}
              assignments={assignments}
              canCreateAssignment={canCreateAssignment}
              canRequestHire={canRequestHire}
              onAssignmentCreated={() => {
                setAssignmentState("loading");
                setAssignmentRefreshKey((current) => current + 1);
              }}
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
            <HrWorkLocationChangeMakerPanel
              key={`work-location-change:${companyId}:${employeeId}:${assignmentRefreshKey}`}
              client={client}
              csrfToken={csrfToken}
              companyId={companyId}
              employeeId={employeeId}
              assignments={assignments}
              canRequestWorkLocationChange={canRequestWorkLocationChange}
            />
            <HrOrganizationPlacementChangeMakerPanel
              key={`organization-placement-change:${companyId}:${employeeId}:${assignmentRefreshKey}`}
              client={client}
              csrfToken={csrfToken}
              companyId={companyId}
              employeeId={employeeId}
              assignments={assignments}
              canRequest={canRequestOrganizationPlacementChange}
            />
          </div>
        </>
      )}
    </section>
  );
}
