"use client";

import { useEffect, useRef, useState } from "react";

import type {
  HrEmployeeAssignmentDirectory,
  HrOrganizationPlacementSnapshot,
  HrOrganizationUnitDirectory,
} from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";

type PlacementType = HrOrganizationUnitDirectory["items"][number]["type"];
type LoadState = "loading" | "ready" | "error";
const levels: Array<{ type: PlacementType; key: keyof HrOrganizationPlacementSnapshot; label: string }> = [
  { type: "business_unit", key: "business_unit_id", label: "Business unit" },
  { type: "division", key: "division_id", label: "Division" },
  { type: "branch", key: "branch_id", label: "Branch" },
  { type: "department", key: "department_id", label: "Department" },
  { type: "warehouse", key: "warehouse_id", label: "Warehouse" },
];

function localDate(): string {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrOrganizationPlacementChangeMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  assignments,
  canRequest,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  assignments: HrEmployeeAssignmentDirectory["items"];
  canRequest: boolean;
}) {
  const source = assignments.find(
    (item) => item.assignment_status === "active" && item.effective_from <= localDate() && !item.effective_to,
  );
  const [units, setUnits] = useState<HrOrganizationUnitDirectory["items"]>([]);
  const [resolvedCompanyId, setResolvedCompanyId] = useState("");
  const [resolvedState, setResolvedState] = useState<LoadState>("loading");
  const [proposed, setProposed] = useState<HrOrganizationPlacementSnapshot | null>(null);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = localDate();
  const state = resolvedCompanyId === companyId ? resolvedState : "loading";
  const current = source?.organization_placements;

  useEffect(() => {
    let active = true;
    client
      .organizationUnits({ companyId, limit: 200 })
      .then((result) => {
        if (!active) return;
        setUnits(result.items);
        setResolvedCompanyId(companyId);
        setResolvedState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The organization hierarchy could not be loaded."));
        setResolvedCompanyId(companyId);
        setResolvedState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId]);

  if (!source || !current)
    return (
      <Alert>
        <AlertTitle>Active assignment required</AlertTitle>
        <AlertDescription>A current relationship-bound assignment is required for this workflow.</AlertDescription>
      </Alert>
    );
  if (!canRequest)
    return (
      <Alert>
        <AlertTitle>Assignment-change permission required</AlertTitle>
        <AlertDescription>Your session cannot request organization-placement changes.</AlertDescription>
      </Alert>
    );

  const selection = proposed ?? current;
  const changed = JSON.stringify(selection) !== JSON.stringify(current);
  const retained = Object.values(selection).some(Boolean);

  const changeLevel = (index: number, value: string) => {
    const next = { ...selection, [levels[index]!.key]: value || null };
    for (let child = index + 1; child < levels.length; child += 1) next[levels[child]!.key] = null;
    setProposed(next);
    retry.current = null;
  };

  const submit = async () => {
    if (submitting) return;
    const trimmed = reason.trim();
    if (!changed || !retained || !trimmed || trimmed.length > 1000) {
      setError("Choose a changed, non-empty hierarchy and enter a business reason.");
      return;
    }
    const input = {
      company_id: companyId,
      source_assignment_id: source.id,
      proposed: selection,
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createOrganizationPlacementChangeRequest(
        employeeId,
        input,
        csrfToken(),
        retry.current.key,
      );
      retry.current = null;
      setProposed(null);
      setReason("");
      setNotice(`Organization-placement request ${result.id} is pending independent approval.`);
    } catch (cause) {
      setError(message(cause, "The organization-placement request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Organization placement change request"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee movement</p>
          <h2 className="mt-1 text-lg font-semibold">Request organization placement change</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Submit one complete company hierarchy. Job, manager, work location, employment context and salary remain
            unchanged.
          </p>
        </div>
        <Badge variant="outline">Same-day effective</Badge>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Organization request unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Organization change submitted</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-24 w-full" />}
      {state === "error" && (
        <p className="text-sm text-muted-foreground">No prototype hierarchy is shown while live data is unavailable.</p>
      )}
      {state === "ready" && (
        <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {levels.map((level, index) => {
              const parentId = index === 0 ? null : selection[levels[index - 1]!.key];
              const options = units.filter(
                (unit) => unit.type === level.type && (index === 0 || !parentId || unit.parent_id === parentId),
              );
              return (
                <label key={level.type} className="grid gap-1.5 text-sm font-medium">
                  {level.label}
                  <select
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={selection[level.key] ?? ""}
                    disabled={submitting}
                    onChange={(event) => changeLevel(index, event.target.value)}
                  >
                    <option value="">Not assigned</option>
                    {options.map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.code} — {unit.name}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
          <label htmlFor="organization-placement-effective-on" className="grid gap-1.5 text-sm font-medium">
            Effective date
            <Input id="organization-placement-effective-on" type="date" value={effectiveOn} disabled readOnly />
          </label>
          <label htmlFor="organization-placement-reason" className="grid gap-1.5 text-sm font-medium">
            Business reason
            <Textarea
              id="organization-placement-reason"
              value={reason}
              maxLength={1000}
              disabled={submitting}
              onChange={(event) => {
                setReason(event.target.value);
                retry.current = null;
              }}
            />
          </label>
          <div>
            <Button type="button" onClick={submit} disabled={submitting || !changed || !retained || !reason.trim()}>
              {submitting ? "Submitting organization change..." : "Submit organization-placement request"}
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
