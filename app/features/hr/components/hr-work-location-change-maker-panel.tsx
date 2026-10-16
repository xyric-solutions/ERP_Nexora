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

export function HrWorkLocationChangeMakerPanel({
  client,
  csrfToken,
  companyId,
  employeeId,
  assignments,
  canRequestWorkLocationChange,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  employeeId: string;
  assignments: HrEmployeeAssignmentDirectory["items"];
  canRequestWorkLocationChange: boolean;
}) {
  const source = assignments.find(
    (item) => item.assignment_status === "active" && item.effective_from <= localDate() && !item.effective_to,
  );
  const [locations, setLocations] = useState<HrMasterDirectory["items"]>([]);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadedCompanyId, setLoadedCompanyId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const effectiveOn = localDate();

  useEffect(() => {
    let active = true;
    client
      .masters({ companyId, type: "work_location", activeOnly: true, limit: 100 })
      .then((result) => {
        if (!active) return;
        setLocations(result.items);
        setLoadedCompanyId(companyId);
        setLoadState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The work-location directory could not be loaded."));
        setLoadedCompanyId(companyId);
        setLoadState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId]);

  const effectiveLoadState = loadedCompanyId === companyId ? loadState : "loading";

  if (!source)
    return (
      <Alert>
        <AlertTitle>Active assignment required</AlertTitle>
        <AlertDescription>
          A governed work-location change can be requested only for a currently active assignment.
        </AlertDescription>
      </Alert>
    );

  if (!canRequestWorkLocationChange)
    return (
      <Alert>
        <AlertTitle>Assignment-change permission required</AlertTitle>
        <AlertDescription>
          Your session may read assignment history but cannot request a location change.
        </AlertDescription>
      </Alert>
    );

  const changed = Boolean(locationId && locationId !== source.work_location_id);

  const submit = async () => {
    if (submitting) return;
    const trimmed = reason.trim();
    if (!changed || !trimmed || trimmed.length > 1000) {
      setError("Choose a different work location and enter a business reason.");
      return;
    }
    const input = {
      company_id: companyId,
      source_assignment_id: source.id,
      work_location_id: locationId,
      effective_on: effectiveOn,
      reason: trimmed,
    };
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSubmitting(true);
    setError("");
    try {
      const result = await client.createWorkLocationChangeRequest(employeeId, input, csrfToken(), retry.current.key);
      retry.current = null;
      setLocationId("");
      setReason("");
      setNotice(
        `Work-location-change request ${result.id} is pending independent approval. Assignment and salary are unchanged.`,
      );
    } catch (cause) {
      setError(message(cause, "The work-location-change request could not be submitted."));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Work-location-change request"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Employee movement</p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Request governed work-location change</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Select a different company work location. The API will require approved jurisdiction evidence effective
            today; organization placement, role, manager, and compensation remain unchanged.
          </p>
        </div>
        <Badge variant="outline">Same-day effective</Badge>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Work-location request unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Work-location change submitted</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {effectiveLoadState === "loading" && <Skeleton className="h-20 w-full" />}
      {effectiveLoadState === "error" && (
        <p className="text-sm text-muted-foreground">
          No prototype locations are shown while live data is unavailable.
        </p>
      )}
      {effectiveLoadState === "ready" && (
        <>
          <dl className="grid gap-3 rounded-md bg-muted/45 p-3 text-sm sm:grid-cols-2">
            <ContextField label="Current work location" value={source.work_location} />
            <ContextField label="Current assignment" value={source.id} />
          </dl>
          <div className="grid gap-3 md:grid-cols-2">
            <label
              htmlFor="work-location-change-proposed-location"
              className="grid gap-1.5 text-sm font-medium text-foreground"
            >
              Proposed work location
              <select
                id="work-location-change-proposed-location"
                className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                value={locationId}
                disabled={submitting}
                onChange={(event) => {
                  setLocationId(event.target.value);
                  retry.current = null;
                }}
              >
                <option value="">Select a work location</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id} disabled={location.id === source.work_location_id}>
                    {location.code} â€” {location.name}
                  </option>
                ))}
              </select>
            </label>
            <label
              htmlFor="work-location-change-effective-on"
              className="grid gap-1.5 text-sm font-medium text-foreground"
            >
              Effective date
              <Input id="work-location-change-effective-on" type="date" value={effectiveOn} disabled readOnly />
            </label>
          </div>
          <label
            htmlFor="work-location-change-request-reason"
            className="grid gap-1.5 text-sm font-medium text-foreground"
          >
            Business reason
            <Textarea
              id="work-location-change-request-reason"
              value={reason}
              maxLength={1000}
              disabled={submitting}
              onChange={(event) => {
                setReason(event.target.value);
                retry.current = null;
              }}
              placeholder="Explain why this work-location change is required."
            />
          </label>
          <div>
            <Button type="button" onClick={submit} disabled={submitting || !changed || !reason.trim()}>
              {submitting ? "Submitting location change..." : "Submit work-location-change request"}
            </Button>
          </div>
        </>
      )}
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
