"use client";
import { HrRecordDrawer } from "./hr-record-drawer";

import { useEffect, useMemo, useRef, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrMasterDirectory, HrOrganizationUnitDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";
import { isWithinUnit } from "../model/organization-hierarchy";
import { costCentreOptionLabel } from "../model/employment-setup";

type Props = {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  assignments: HrEmployeeAssignmentDirectory["items"];
  canCreateAssignment: boolean;
  canRequestHire: boolean;
  onAssignmentCreated: () => void;
  onHireRequested?: () => void;
};

type LoadState = "idle" | "loading" | "ready" | "error";

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrHireMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  assignments,
  canCreateAssignment,
  canRequestHire,
  onAssignmentCreated,
  onHireRequested,
}: Props) {
  const [masters, setMasters] = useState<HrMasterDirectory["items"]>([]);
  const [placements, setPlacements] = useState<HrOrganizationUnitDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [branchId, setBranchId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designationId, setDesignationId] = useState("");
  const [jobGradeId, setJobGradeId] = useState("");
  const [costCenterId, setCostCenterId] = useState("");
  const [workLocationId, setWorkLocationId] = useState("");
  const [jobId, setJobId] = useState("");
  const [effectiveOn, setEffectiveOn] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState("");
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const assignmentRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const hireRetry = useRef<{ fingerprint: string; key: string } | null>(null);

  const profileAssignment = assignments.find((item) => item.assignment_status === "profile_draft") ?? null;
  useEffect(() => {
    if (profileAssignment) setEffectiveOn(profileAssignment.effective_from);
  }, [profileAssignment?.id, profileAssignment?.effective_from]);
  const branches = placements.filter((item) => item.type === "branch");
  const departments = placements.filter(
    // A department may sit directly under the project or under one of its locations.
    (item) => item.type === "department" && (!branchId || isWithinUnit(placements, item.id, branchId)),
  );
  const byType = useMemo(
    () => (type: HrMasterDirectory["items"][number]["type"]) => masters.filter((item) => item.type === type),
    [masters],
  );

  useEffect(() => {
    if (!companyId || (!canCreateAssignment && !canRequestHire)) return;
    let active = true;
    Promise.all([
      client.masters({ companyId, activeOnly: true, limit: 100 }),
      client.organizationUnits({ companyId, limit: 200 }),
      client.masters({ companyId, type: "cost_center", activeOnly: true, limit: 100 }),
    ])
      .then(([masterResult, placementResult, centreResult]) => {
        if (!active) return;
        // Cost centres load separately so the shared 100-record catalogue cannot crowd them out.
        setMasters([...masterResult.items.filter((item) => item.type !== "cost_center"), ...centreResult.items]);
        setPlacements(placementResult.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The company assignment catalogue could not be loaded."));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [canCreateAssignment, canRequestHire, client, companyId]);

  const createAssignment = async () => {
    if (savingAssignment || !employeeId) return;
    const required = [
      branchId,
      departmentId,
      designationId,
      jobGradeId,
      costCenterId,
      workLocationId,
      effectiveOn,
    ];
    if (required.some((value) => !value)) {
      setError("Select a project, department, and every required employment master before saving the profile draft.");
      return;
    }
    const input = {
      company_id: companyId,
      branch_id: branchId,
      department_id: departmentId,
      designation_id: designationId,
      job_grade_id: jobGradeId,
      cost_center_id: costCenterId,
      work_location_id: workLocationId,
      effective_from: effectiveOn,
    };
    const fingerprint = JSON.stringify(input);
    if (assignmentRetry.current?.fingerprint !== fingerprint)
      assignmentRetry.current = { fingerprint, key: crypto.randomUUID() };
    setSavingAssignment(true);
    setError("");
    try {
      await client.createProfileDraftAssignment(employeeId, input, csrfToken(), assignmentRetry.current.key);
      assignmentRetry.current = null;
      setNotice("Profile-draft assignment saved. It remains non-operational until an independent Hire approval.");
      onAssignmentCreated();
    } catch (cause) {
      setError(message(cause, "The profile-draft assignment could not be saved."));
    } finally {
      setSavingAssignment(false);
    }
  };

  const requestHire = async () => {
    if (!profileAssignment || submitting || !employeeId) return;
    const trimmed = reason.trim();
    if (!jobId || !effectiveOn || !trimmed || trimmed.length > 1000) {
      setError("Select an active job, effective date, and business reason of 1 to 1000 characters.");
      return;
    }
    const input = {
      company_id: companyId,
      job_id: jobId,
      profile_draft_assignment_id: profileAssignment.id,
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (hireRetry.current?.fingerprint !== fingerprint) hireRetry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createHireRequest(employeeId, input, csrfToken(), hireRetry.current.key);
      hireRetry.current = null;
      setNotice(`Hire request ${result.id} is pending independent approval. Employment is not active yet.`);
      setReason("");
      onHireRequested?.();
    } catch (cause) {
      setError(message(cause, "The Hire request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  if (!employeeId) return null;

  return (
    <HrRecordDrawer
      completionKey={notice}
      title="Manage assignment & hire"
      triggerLabel="Manage assignment & hire"
      busy={savingAssignment || submitting}
    >
      <section className="grid min-w-0 gap-4" aria-label="Governed Hire request">
        {state === "loading" && <Skeleton className="h-28 w-full" />}
        {error && (
          <Alert variant="destructive">
            <AlertTitle>Hire preparation unavailable</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {notice && (
          <Alert>
            <AlertTitle>Employment workflow updated</AlertTitle>
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        )}

        {state === "ready" && !profileAssignment && !canCreateAssignment && (
          <Alert>
            <AlertTitle>Profile assignment required</AlertTitle>
            <AlertDescription>
              An authorized HR assignment maker must prepare the employee&apos;s profile-draft assignment first.
            </AlertDescription>
          </Alert>
        )}

        {state === "ready" && !profileAssignment && canCreateAssignment && (
          <div className="grid min-w-0 gap-3">
            <h3 className="m-0! text-sm font-semibold text-foreground">Profile assignment</h3>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <SelectField
                label="Project"
                value={branchId}
                onChange={(value) => {
                  setBranchId(value);
                  setDepartmentId("");
                }}
                items={branches}
                disabled={savingAssignment}
              />
              <SelectField
                label="Department"
                value={departmentId}
                onChange={setDepartmentId}
                items={departments}
                disabled={savingAssignment || !branchId}
              />
              <MasterSelect
                label="Designation"
                value={designationId}
                onChange={setDesignationId}
                items={byType("designation")}
                disabled={savingAssignment}
              />
              <MasterSelect
                label="Job grade"
                value={jobGradeId}
                onChange={setJobGradeId}
                items={byType("job_grade")}
                disabled={savingAssignment}
              />
              <MasterSelect
                label="Cost center"
                value={costCenterId}
                onChange={setCostCenterId}
                items={byType("cost_center")}
                optionLabel={costCentreOptionLabel}
                disabled={savingAssignment}
              />
              <MasterSelect
                label="Work location"
                value={workLocationId}
                onChange={setWorkLocationId}
                items={byType("work_location")}
                disabled={savingAssignment}
              />
              <label
                htmlFor="hire-profile-effective-on"
                className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground"
              >
                Effective date
                <Input
                  id="hire-profile-effective-on"
                  type="date"
                  value={effectiveOn}
                  onChange={(event) => setEffectiveOn(event.target.value)}
                  disabled={savingAssignment}
                />
              </label>
            </div>
            <div>
              <Button type="button" onClick={createAssignment} disabled={savingAssignment}>
                {savingAssignment ? "Saving profile context..." : "Save profile context"}
              </Button>
            </div>
          </div>
        )}

        {state === "ready" && profileAssignment && (
          <div className="grid min-w-0 gap-3">
            <h3 className="m-0! text-sm font-semibold text-foreground">Hire request</h3>
            {!canRequestHire ? (
              <Alert>
                <AlertTitle>Hire request permission required</AlertTitle>
                <AlertDescription>
                  Your session may read this profile context but cannot submit a Hire request.
                </AlertDescription>
              </Alert>
            ) : (
              <>
                <div className="grid min-w-0 gap-3 sm:grid-cols-2">
                  <MasterSelect
                    label="Approved job"
                    value={jobId}
                    onChange={(value) => {
                      setJobId(value);
                      hireRetry.current = null;
                    }}
                    items={byType("job")}
                    disabled={submitting}
                  />
                  <label
                    htmlFor="hire-request-effective-on"
                    className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground"
                  >
                    Effective date
                    <Input
                      id="hire-request-effective-on"
                      type="date"
                      value={effectiveOn}
                      onChange={(event) => {
                        setEffectiveOn(event.target.value);
                        hireRetry.current = null;
                      }}
                      disabled={submitting}
                    />
                  </label>
                </div>
                <label
                  htmlFor="hire-request-reason"
                  className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground"
                >
                  Business reason
                  <Textarea
                    id="hire-request-reason"
                    value={reason}
                    maxLength={1000}
                    onChange={(event) => {
                      setReason(event.target.value);
                      hireRetry.current = null;
                    }}
                    disabled={submitting}
                  />
                </label>
                <div>
                  <Button
                    type="button"
                    className="text-primary-foreground!"
                    onClick={requestHire}
                    disabled={submitting || !jobId}
                  >
                    {submitting ? "Submitting Hire request..." : "Submit Hire request"}
                  </Button>
                </div>
              </>
            )}
          </div>
        )}
      </section>
    </HrRecordDrawer>
  );
}

function SelectField({
  label,
  value,
  onChange,
  items,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: HrOrganizationUnitDirectory["items"];
  disabled: boolean;
}) {
  const id = `hire-placement-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label htmlFor={id} className="grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground">
      {label}
      <select
        id={id}
        className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} ({item.code})
          </option>
        ))}
      </select>
    </label>
  );
}

function MasterSelect({
  label,
  value,
  onChange,
  items,
  optionLabel = (item) => `${item.name} (${item.code})`,
  disabled,
  className = "",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: HrMasterDirectory["items"];
  optionLabel?: (item: HrMasterDirectory["items"][number]) => string;
  disabled: boolean;
  className?: string;
}) {
  const id = `hire-master-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label
      htmlFor={id}
      className={`grid min-w-0 content-start gap-1.5 text-sm font-medium text-foreground ${className}`}
    >
      {label}
      <select
        id={id}
        className="h-9 w-full min-w-0 truncate rounded-md border border-input bg-background px-2.5 text-sm"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
      >
        <option value="">Select {label.toLowerCase()}</option>
        {items.map((item) => (
          <option key={item.id} value={item.id}>
            {optionLabel(item)}
          </option>
        ))}
      </select>
    </label>
  );
}
