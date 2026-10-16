"use client";

import { useEffect, useRef, useState } from "react";

import type { HrEmployeeAssignmentDirectory, HrMasterDirectory } from "@nexora/contracts";

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
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrPromotionMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  assignments,
  canRequestPromotion,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  assignments: HrEmployeeAssignmentDirectory["items"];
  canRequestPromotion: boolean;
}) {
  const source = assignments.find(
    (item) => item.assignment_status === "active" && item.effective_from <= localDate() && !item.effective_to,
  );
  const [masters, setMasters] = useState<HrMasterDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [jobId, setJobId] = useState(source?.job_id ?? "");
  const [designationId, setDesignationId] = useState(source?.designation_id ?? "");
  const [jobGradeId, setJobGradeId] = useState(source?.job_grade_id ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = localDate();

  useEffect(() => {
    if (!companyId || !source || !canRequestPromotion) return;
    let active = true;
    Promise.all([
      client.masters({ companyId, type: "job", limit: 100 }),
      client.masters({ companyId, type: "designation", limit: 100 }),
      client.masters({ companyId, type: "job_grade", limit: 100 }),
    ])
      .then((results) => {
        if (!active) return;
        setMasters(results.flatMap((result) => result.items));
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The active job, designation, and grade directories could not be loaded."));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [canRequestPromotion, client, companyId, source]);

  if (!source)
    return (
      <Alert>
        <AlertTitle>Active assignment required</AlertTitle>
        <AlertDescription>A governed Promotion can be requested only for a currently active assignment.</AlertDescription>
      </Alert>
    );

  if (!canRequestPromotion)
    return (
      <Alert>
        <AlertTitle>Promotion permission required</AlertTitle>
        <AlertDescription>Your session may read assignment history but cannot request a Promotion.</AlertDescription>
      </Alert>
    );

  const roleChanged =
    jobId !== source.job_id || designationId !== source.designation_id || jobGradeId !== source.job_grade_id;
  const byType = (type: HrMasterDirectory["items"][number]["type"]) => masters.filter((item) => item.type === type);

  const submit = async () => {
    if (submitting) return;
    const trimmed = reason.trim();
    if (!jobId || !designationId || !jobGradeId || !roleChanged || !trimmed || trimmed.length > 1000) {
      setError("Change the job, designation, or grade and enter a business reason of 1 to 1000 characters.");
      return;
    }
    const input = {
      company_id: companyId,
      source_assignment_id: source.id,
      job_id: jobId,
      designation_id: designationId,
      job_grade_id: jobGradeId,
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createPromotionRequest(employeeId, input, csrfToken(), retry.current.key);
      retry.current = null;
      setReason("");
      setNotice(`Promotion request ${result.id} is pending independent approval. Assignment and salary are unchanged.`);
    } catch (cause) {
      setError(message(cause, "The Promotion request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm" aria-label="Promotion request">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee movement</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Request governed Promotion</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Propose a job, designation, or grade change for an independent checker. Promotion changes assignment role
            details only; compensation requires a separately approved salary revision.
          </p>
        </div>
        <Badge variant="outline">Same-day effective</Badge>
      </div>
      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {error && <Alert variant="destructive"><AlertTitle>Promotion request unavailable</AlertTitle><AlertDescription>{error}</AlertDescription></Alert>}
      {notice && <Alert><AlertTitle>Promotion submitted</AlertTitle><AlertDescription>{notice}</AlertDescription></Alert>}
      {state === "ready" && (
        <div className="grid gap-4">
          <dl className="grid gap-3 rounded-md bg-muted/45 p-3 text-sm sm:grid-cols-3">
            <ContextField label="Current job" value={source.job || "Not assigned"} />
            <ContextField label="Current designation" value={source.designation} />
            <ContextField label="Current grade" value={source.job_grade} />
          </dl>
          <div className="grid gap-3 md:grid-cols-4">
            <MasterSelect label="Proposed job" value={jobId} items={byType("job")} disabled={submitting} onChange={setJobId} />
            <MasterSelect label="Proposed designation" value={designationId} items={byType("designation")} disabled={submitting} onChange={setDesignationId} />
            <MasterSelect label="Proposed grade" value={jobGradeId} items={byType("job_grade")} disabled={submitting} onChange={setJobGradeId} />
            <label htmlFor="promotion-effective-on" className="grid gap-1.5 text-sm font-medium text-foreground">
              Effective date
              <Input id="promotion-effective-on" type="date" value={effectiveOn} disabled readOnly />
            </label>
          </div>
          <label htmlFor="promotion-request-reason" className="grid gap-1.5 text-sm font-medium text-foreground">
            Business reason
            <Textarea id="promotion-request-reason" value={reason} maxLength={1000} disabled={submitting} onChange={(event) => { setReason(event.target.value); retry.current = null; }} placeholder="Explain why this role change is required." />
          </label>
          <div><Button type="button" onClick={submit} disabled={submitting || !roleChanged || !reason.trim()}>{submitting ? "Submitting Promotion..." : "Submit Promotion request"}</Button></div>
          <p className="text-xs text-muted-foreground">Submission and approval never create, update, or supersede salary-assignment records.</p>
        </div>
      )}
    </section>
  );
}

function MasterSelect({ label, value, items, disabled, onChange }: { label: string; value: string; items: HrMasterDirectory["items"]; disabled: boolean; onChange: (value: string) => void }) {
  const id = `promotion-${label.toLowerCase().replaceAll(" ", "-")}`;
  return <label htmlFor={id} className="grid gap-1.5 text-sm font-medium text-foreground">{label}<select id={id} className="h-9 rounded-md border border-input bg-background px-2.5 text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Select {label.toLowerCase()}</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.code})</option>)}</select></label>;
}

function ContextField({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-muted-foreground">{label}</dt><dd className="mt-0.5 font-medium text-foreground">{value}</dd></div>;
}
