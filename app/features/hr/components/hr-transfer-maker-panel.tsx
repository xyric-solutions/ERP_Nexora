"use client";

import { useEffect, useRef, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrOrganizationUnitDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

function localDate(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrTransferMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  assignments,
  canRequestTransfer,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  assignments: HrEmployeeAssignmentDirectory["items"];
  canRequestTransfer: boolean;
}) {
  const source = assignments.find(
    (item) => item.assignment_status === "active" && item.effective_from <= localDate() && !item.effective_to,
  );
  const [placements, setPlacements] = useState<HrOrganizationUnitDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [branchId, setBranchId] = useState(source?.branch_id ?? "");
  const [departmentId, setDepartmentId] = useState(source?.department_id ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = localDate();

  useEffect(() => {
    if (!companyId || !source || !canRequestTransfer) return;
    let active = true;
    client
      .organizationUnits({ companyId, limit: 200 })
      .then((result) => {
        if (!active) return;
        setPlacements(result.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The company placement directory could not be loaded."));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [canRequestTransfer, client, companyId, source]);

  if (!source)
    return (
      <Alert>
        <AlertTitle>Active assignment required</AlertTitle>
        <AlertDescription>A governed Transfer can be requested only for a currently active assignment.</AlertDescription>
      </Alert>
    );

  if (!canRequestTransfer)
    return (
      <Alert>
        <AlertTitle>Transfer permission required</AlertTitle>
        <AlertDescription>Your session may read assignment history but cannot request a Transfer.</AlertDescription>
      </Alert>
    );

  const branches = placements.filter((item) => item.type === "branch");
  const departments = placements.filter(
    (item) => item.type === "department" && (!branchId || item.parent_id === branchId),
  );
  const placementChanged = branchId !== (source.branch_id ?? "") || departmentId !== (source.department_id ?? "");

  const submit = async () => {
    if (submitting) return;
    const trimmed = reason.trim();
    if (!branchId || !departmentId || !placementChanged || !trimmed || trimmed.length > 1000) {
      setError("Select a different branch or department and enter a business reason of 1 to 1000 characters.");
      return;
    }
    if (!source.job_id || !source.employment_relationship_id) {
      setError("The active assignment is missing governed job or relationship authority.");
      return;
    }
    const input = {
      company_id: companyId,
      source_assignment_id: source.id,
      branch_id: branchId,
      department_id: departmentId,
      job_id: source.job_id,
      designation_id: source.designation_id,
      job_grade_id: source.job_grade_id,
      cost_center_id: source.cost_center_id,
      work_location_id: source.work_location_id,
      employment_type_id: source.employment_type_id,
      employee_category_id: source.employee_category_id,
      ...(source.reporting_manager_id ? { reporting_manager_id: source.reporting_manager_id } : {}),
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createTransferRequest(employeeId, input, csrfToken(), retry.current.key);
      retry.current = null;
      setReason("");
      setNotice(`Transfer request ${result.id} is pending independent approval. The assignment is unchanged.`);
    } catch (cause) {
      setError(message(cause, "The Transfer request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm" aria-label="Transfer request">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee movement</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Request governed Transfer</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Propose a branch or department change for an independent checker. Job, grade, manager, and employment
            context remain unchanged in this Transfer slice.
          </p>
        </div>
        <Badge variant="outline">Same-day effective</Badge>
      </div>

      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Transfer request unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Transfer submitted</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}

      {state === "ready" && (
        <div className="grid gap-4">
          <dl className="grid gap-3 rounded-md bg-muted/45 p-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <ContextField label="Current job" value={source.job || source.designation} />
            <ContextField label="Designation" value={source.designation} />
            <ContextField label="Grade" value={source.job_grade} />
            <ContextField label="Work location" value={source.work_location} />
          </dl>
          <div className="grid gap-3 md:grid-cols-3">
            <PlacementSelect
              label="Proposed branch"
              value={branchId}
              items={branches}
              disabled={submitting}
              onChange={(value) => {
                setBranchId(value);
                setDepartmentId("");
                retry.current = null;
              }}
            />
            <PlacementSelect
              label="Proposed department"
              value={departmentId}
              items={departments}
              disabled={submitting || !branchId}
              onChange={(value) => {
                setDepartmentId(value);
                retry.current = null;
              }}
            />
            <label htmlFor="transfer-effective-on" className="grid gap-1.5 text-sm font-medium text-foreground">
              Effective date
              <Input id="transfer-effective-on" type="date" value={effectiveOn} disabled readOnly />
            </label>
          </div>
          <label htmlFor="transfer-request-reason" className="grid gap-1.5 text-sm font-medium text-foreground">
            Business reason
            <Textarea
              id="transfer-request-reason"
              value={reason}
              maxLength={1000}
              disabled={submitting}
              onChange={(event) => {
                setReason(event.target.value);
                retry.current = null;
              }}
              placeholder="Explain the operational reason for this branch or department transfer."
            />
          </label>
          <div>
            <Button type="button" onClick={submit} disabled={submitting || !placementChanged || !reason.trim()}>
              {submitting ? "Submitting Transfer..." : "Submit Transfer request"}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Submission does not change the current assignment. Approval closes it and creates one new immutable
            effective assignment in a single database transaction.
          </p>
        </div>
      )}
    </section>
  );
}

function PlacementSelect({
  label,
  value,
  items,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  items: HrOrganizationUnitDirectory["items"];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  const id = `transfer-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-foreground">
      {label}
      <select
        id={id}
        className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
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

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-medium text-foreground">{value}</dd>
    </div>
  );
}
