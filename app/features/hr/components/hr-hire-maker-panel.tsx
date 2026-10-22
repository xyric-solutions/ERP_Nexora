"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrMasterDirectory, HrOrganizationUnitDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";

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
  const [employmentTypeId, setEmploymentTypeId] = useState("");
  const [employeeCategoryId, setEmployeeCategoryId] = useState("");
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
    (item) => item.type === "department" && (!branchId || item.parent_id === branchId),
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
    ])
      .then(([masterResult, placementResult]) => {
        if (!active) return;
        setMasters(masterResult.items);
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
      employmentTypeId,
      employeeCategoryId,
      effectiveOn,
    ];
    if (required.some((value) => !value)) {
      setError("Select a branch, department, and every required employment master before saving the profile draft.");
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
      employment_type_id: employmentTypeId,
      employee_category_id: employeeCategoryId,
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
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Governed Hire request"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employment control</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Prepare governed Hire</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Prepare non-operational assignment context, then submit it for an independent checker decision.
          </p>
        </div>
        <Badge variant={profileAssignment ? "secondary" : "outline"}>
          {profileAssignment ? "Profile context ready" : "Profile context required"}
        </Badge>
      </div>

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
        <div className="grid gap-3">
          <div>
            <h3 className="font-medium text-foreground">1. Profile-draft assignment</h3>
            <p className="text-sm text-muted-foreground">All placement fields are required for later activation.</p>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <SelectField
              label="Branch"
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
              disabled={savingAssignment}
            />
            <MasterSelect
              label="Work location"
              value={workLocationId}
              onChange={setWorkLocationId}
              items={byType("work_location")}
              disabled={savingAssignment}
            />
            <MasterSelect
              label="Employment type"
              value={employmentTypeId}
              onChange={setEmploymentTypeId}
              items={byType("employment_type")}
              disabled={savingAssignment}
            />
            <MasterSelect
              label="Employee category"
              value={employeeCategoryId}
              onChange={setEmployeeCategoryId}
              items={byType("employee_category")}
              disabled={savingAssignment}
            />
            <label htmlFor="hire-profile-effective-on" className="grid gap-1.5 text-sm font-medium text-foreground">
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
        <div className="grid gap-3">
          <div>
            <h3 className="font-medium text-foreground">2. Request independent Hire approval</h3>
            <p className="text-sm text-muted-foreground">
              Submission creates a pending request only. It does not activate the employee or assignment.
            </p>
          </div>
          {!canRequestHire ? (
            <Alert>
              <AlertTitle>Hire request permission required</AlertTitle>
              <AlertDescription>
                Your session may read this profile context but cannot submit a Hire request.
              </AlertDescription>
            </Alert>
          ) : (
            <>
              <div className="grid gap-3 md:grid-cols-2">
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
                <label htmlFor="hire-request-effective-on" className="grid gap-1.5 text-sm font-medium text-foreground">
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
              <label htmlFor="hire-request-reason" className="grid gap-1.5 text-sm font-medium text-foreground">
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
                  placeholder="Explain why this approved profile should become an active employment relationship."
                />
              </label>
              <div>
                <Button
                  type="button"
                  className="text-primary-foreground!"
                  onClick={requestHire}
                  disabled={submitting || !jobId || !reason.trim()}
                >
                  {submitting ? "Submitting Hire request..." : "Submit Hire request"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </section>
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
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
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
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  items: HrMasterDirectory["items"];
  disabled: boolean;
}) {
  const id = `hire-master-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
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
