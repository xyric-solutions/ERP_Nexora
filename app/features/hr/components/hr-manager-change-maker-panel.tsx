"use client";

import { useRef, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrEmployeeDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";

const CLEAR_MANAGER = "__clear_reporting_manager__";

function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrManagerChangeMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  employees,
  assignments,
  canRequestManagerChange,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  employees: HrEmployeeDirectory["items"];
  assignments: HrEmployeeAssignmentDirectory["items"];
  canRequestManagerChange: boolean;
}) {
  const source = assignments.find(
    (item) => item.assignment_status === "active" && item.effective_from <= localDate() && !item.effective_to,
  );
  const [managerChoice, setManagerChoice] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = localDate();

  if (!source)
    return (
      <Alert>
        <AlertTitle>Active assignment required</AlertTitle>
        <AlertDescription>
          A governed manager change can be requested only for a currently active assignment.
        </AlertDescription>
      </Alert>
    );

  if (!canRequestManagerChange)
    return (
      <Alert>
        <AlertTitle>Manager-change permission required</AlertTitle>
        <AlertDescription>
          Your session may read assignment history but cannot request a reporting-line change.
        </AlertDescription>
      </Alert>
    );

  const currentManager = employees.find((employee) => employee.id === source.reporting_manager_id);
  const candidates = employees.filter((employee) => employee.id !== employeeId);
  const selectedManagerId = managerChoice && managerChoice !== CLEAR_MANAGER ? managerChoice : null;
  const changed =
    managerChoice === CLEAR_MANAGER
      ? source.reporting_manager_id !== null
      : Boolean(selectedManagerId && selectedManagerId !== source.reporting_manager_id);

  const submit = async () => {
    if (submitting) return;
    const trimmed = reason.trim();
    if (!managerChoice || !changed || !trimmed || trimmed.length > 1000) {
      setError("Choose a different reporting manager or explicitly choose no reporting manager, then enter a reason.");
      return;
    }
    const input = {
      company_id: companyId,
      source_assignment_id: source.id,
      reporting_manager_id: selectedManagerId,
      clear_reporting_manager: managerChoice === CLEAR_MANAGER,
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createManagerChangeRequest(employeeId, input, csrfToken(), retry.current.key);
      retry.current = null;
      setManagerChoice("");
      setReason("");
      setNotice(
        `Manager-change request ${result.id} is pending independent approval. Assignment and salary are unchanged.`,
      );
    } catch (cause) {
      setError(message(cause, "The manager-change request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Manager-change request"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee movement</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Request governed manager change</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Propose another eligible reporting manager or explicitly clear the reporting line. All other assignment
            details and compensation remain unchanged until and after independent approval.
          </p>
        </div>
        <Badge variant="outline">Same-day effective</Badge>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Manager-change request unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Manager change submitted</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      <dl className="grid gap-3 rounded-md bg-muted/45 p-3 text-sm sm:grid-cols-2">
        <ContextField
          label="Current reporting manager"
          value={currentManager?.display_name ?? "No reporting manager"}
        />
        <ContextField
          label="Employee"
          value={employees.find((employee) => employee.id === employeeId)?.display_name ?? employeeId}
        />
      </dl>
      <div className="grid gap-3 md:grid-cols-2">
        <label htmlFor="manager-change-proposed-manager" className="grid gap-1.5 text-sm font-medium text-foreground">
          Proposed reporting manager
          <select
            id="manager-change-proposed-manager"
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={managerChoice}
            disabled={submitting}
            onChange={(event) => {
              setManagerChoice(event.target.value);
              retry.current = null;
            }}
          >
            <option value="">Select a reporting-line outcome</option>
            <option value={CLEAR_MANAGER}>No reporting manager</option>
            {candidates.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} — {employee.display_name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="manager-change-effective-on" className="grid gap-1.5 text-sm font-medium text-foreground">
          Effective date
          <Input id="manager-change-effective-on" type="date" value={effectiveOn} disabled readOnly />
        </label>
      </div>
      <label htmlFor="manager-change-request-reason" className="grid gap-1.5 text-sm font-medium text-foreground">
        Business reason
        <Textarea
          id="manager-change-request-reason"
          value={reason}
          maxLength={1000}
          disabled={submitting}
          onChange={(event) => {
            setReason(event.target.value);
            retry.current = null;
          }}
          placeholder="Explain why this reporting-line change is required."
        />
      </label>
      <div>
        <Button type="button" onClick={submit} disabled={submitting || !changed || !reason.trim()}>
          {submitting ? "Submitting manager change..." : "Submit manager-change request"}
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Submission and approval never create, update, or supersede salary-assignment records.
      </p>
    </section>
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
