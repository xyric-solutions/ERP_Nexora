"use client";

import { useEffect, useRef, useState } from "react";

import type {
  DecideHrEmployeeWorkLocationChangeRequest,
  HrEmployeeWorkLocationChangeRequestReview,
} from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

import { HrApiClient } from "../api/hr-client";

type LoadState = "loading" | "ready" | "error";

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrWorkLocationChangeApprovalsPanel({
  client,
  csrfToken,
  companyId,
  userId,
  onAction,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  userId: string | undefined;
  onAction: (action: string, subject?: string) => void;
}) {
  const [queue, setQueue] = useState<Awaited<ReturnType<HrApiClient["workLocationChangeRequests"]>>["items"]>([]);
  const [selected, setSelected] = useState<{ employeeId: string; requestId: string } | null>(null);
  const [detail, setDetail] = useState<HrEmployeeWorkLocationChangeRequestReview | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<DecideHrEmployeeWorkLocationChangeRequest["decision"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .workLocationChangeRequests({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The pending work-location-change queue could not be loaded."));
        setState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId, refreshKey]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    client
      .workLocationChangeRequest(selected.employeeId, selected.requestId)
      .then((result) => {
        if (!active) return;
        if (result.company_id !== companyId) {
          setDetailState("error");
          return;
        }
        setDetail(result);
        setDetailState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The selected work-location-change request is no longer available."));
        setDetailState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId, selected]);

  const refresh = () => {
    setState("loading");
    setSelected(null);
    setDetail(null);
    setError("");
    setRefreshKey((current) => current + 1);
  };

  const review = (employeeId: string, requestId: string) => {
    setSelected({ employeeId, requestId });
    setDetail(null);
    setDetailState("loading");
    setReason("");
    setDecision(null);
    setError("");
  };

  const decide = async () => {
    if (!detail || !decision || saving) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Enter a decision reason of 1 to 1000 characters.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decideWorkLocationChangeRequest(
        detail.employee_id,
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      setNotice(
        result.status === "approved"
          ? `${detail.employee_number}'s work location was changed without changing organization, role, manager, or compensation.`
          : `${detail.employee_number}'s work-location change was rejected without changing assignment or salary history.`,
      );
      onAction(`Employee work-location change ${result.status}`, detail.employee_number);
      retry.current = null;
      setDecision(null);
      refresh();
    } catch (cause) {
      setError(
        message(cause, "The work-location-change decision could not be saved. Refresh the queue before retrying."),
      );
      setDecision(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Work-location-change approvals"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Maker / checker control
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Work-location-change approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare locations and verify effective statutory jurisdiction authority before deciding the request.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={saving} onClick={refresh}>
          Refresh location-change queue
        </Button>
      </div>
      {notice && (
        <Alert>
          <AlertTitle>Work-location-change decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Work-location-change approval unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {state === "error" && (
        <p className="text-sm text-muted-foreground">
          No prototype work-location-change records are shown while live data is unavailable.
        </p>
      )}
      {state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Proposed location</th>
                  <th className="px-4 py-3">Jurisdiction</th>
                  <th className="px-4 py-3">Effective</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr className="border-b border-border/70 last:border-0" key={item.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{item.employee_name}</p>
                      <p className="text-xs text-muted-foreground">{item.employee_number}</p>
                    </td>
                    <td className="px-4 py-3">{item.proposed_work_location_name}</td>
                    <td className="px-4 py-3">
                      <Badge variant={item.jurisdiction_ready ? "secondary" : "destructive"}>
                        {item.jurisdiction_ready ? "Ready" : "Unavailable"}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{item.effective_on}</td>
                    <td className="px-4 py-3 text-right">
                      <Button type="button" size="sm" variant="ghost" onClick={() => review(item.employee_id, item.id)}>
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {queue.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                      No pending work-location-change approvals in this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="rounded-md border border-border p-4">
            {detailState === "loading" && selected && <Skeleton className="h-36 w-full" />}
            {detailState === "error" && selected && (
              <p className="text-sm text-muted-foreground">Select another request or refresh the queue.</p>
            )}
            {!selected && (
              <p className="text-sm text-muted-foreground">
                Select a pending work-location change to review its statutory context.
              </p>
            )}
            {detail && detailState === "ready" && (
              <div className="grid gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold text-foreground">{detail.employee_name}</h3>
                    <p className="text-sm text-muted-foreground">{detail.employee_number}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <ReviewField label="Current work location" value={detail.current_work_location_name} />
                  <ReviewField label="Proposed work location" value={detail.proposed_work_location_name} />
                  <ReviewField
                    label="Jurisdiction"
                    value={`${detail.jurisdiction_country_code} / ${detail.jurisdiction_id}`}
                  />
                  <ReviewField label="Effective date" value={detail.effective_on} />
                  <ReviewField label="Business reason" value={detail.reason} />
                </dl>
                <Alert variant={detail.jurisdiction_ready ? "default" : "destructive"}>
                  <AlertTitle>
                    {detail.jurisdiction_ready ? "Jurisdiction evidence ready" : "Jurisdiction evidence unavailable"}
                  </AlertTitle>
                  <AlertDescription>
                    {detail.jurisdiction_ready
                      ? `Reviewed profile ${detail.jurisdiction_profile_id} is effective for this decision.`
                      : "Approval is blocked. Reject this request or restore valid reviewed jurisdiction authority."}
                  </AlertDescription>
                </Alert>
                <Alert>
                  <AlertTitle>Other assignment details unchanged</AlertTitle>
                  <AlertDescription>
                    Approval changes only the work location. Organization, role, manager, and compensation are copied
                    from the authoritative source assignment.
                  </AlertDescription>
                </Alert>
                {detail.requested_by === userId ? (
                  <Alert>
                    <AlertTitle>Independent approver required</AlertTitle>
                    <AlertDescription>
                      You submitted this location change, so another HR checker must decide it.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <label
                      htmlFor="work-location-change-decision-reason"
                      className="grid gap-1.5 text-sm font-medium text-foreground"
                    >
                      Decision reason
                      <Textarea
                        id="work-location-change-decision-reason"
                        value={reason}
                        maxLength={1000}
                        disabled={saving}
                        onChange={(event) => {
                          setReason(event.target.value);
                          retry.current = null;
                        }}
                        placeholder="Explain the approval or rejection for the immutable audit record."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        disabled={saving || !reason.trim() || !detail.jurisdiction_ready}
                        onClick={() => setDecision("approved")}
                      >
                        Approve location change
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving || !reason.trim()}
                        onClick={() => setDecision("rejected")}
                      >
                        Reject location change
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}
      <Dialog open={decision !== null} onOpenChange={(open) => !open && !saving && setDecision(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm work-location-change {decision === "approved" ? "approval" : "rejection"}</DialogTitle>
            <DialogDescription>
              Approval changes only the effective work location. Rejection changes no assignment or salary history.
            </DialogDescription>
          </DialogHeader>
          <p className="rounded-md bg-muted p-3 text-sm">Reason: {reason.trim()}</p>
          <DialogFooter>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>Cancel</DialogClose>
            <Button
              type="button"
              variant={decision === "rejected" ? "destructive" : "default"}
              disabled={saving}
              onClick={decide}
            >
              {saving ? "Saving decision..." : "Confirm decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function ReviewField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-foreground">{value}</dd>
    </div>
  );
}
