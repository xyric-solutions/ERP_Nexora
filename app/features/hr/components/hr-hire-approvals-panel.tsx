"use client";

import { useEffect, useRef, useState } from "react";

import type { DecideHrEmployeeHireRequest, HrEmployeeHireRequestReview } from "@nexora/contracts";

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
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";

import { HrApiClient } from "../api/hr-client";
import { approvalOverrideReviewState } from "../approval-override-ui";

type LoadState = "loading" | "ready" | "error";

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrHireApprovalsPanel({
  client,
  csrfToken,
  companyId,
  userId,
  canUseApprovalOverride,
  onAction,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  userId: string | undefined;
  canUseApprovalOverride: boolean;
  onAction: (action: string, subject?: string) => void;
}) {
  const [queue, setQueue] = useState<Awaited<ReturnType<HrApiClient["hireRequests"]>>["items"]>([]);
  const [selected, setSelected] = useState<{ employeeId: string; requestId: string } | null>(null);
  const [detail, setDetail] = useState<HrEmployeeHireRequestReview | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<DecideHrEmployeeHireRequest["decision"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const approvalOverride = approvalOverrideReviewState(detail, detail?.requested_by === userId, canUseApprovalOverride);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .hireRequests({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The pending Hire queue could not be loaded."));
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
      .hireRequest(selected.employeeId, selected.requestId)
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
        setError(message(cause, "The selected Hire request is no longer available."));
        setDetailState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId, selected]);

  const decide = async () => {
    if (!detail || !decision || saving) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Enter a decision reason of 1 to 1000 characters.");
      setDecision(null);
      return;
    }
    if (approvalOverride.independentApproverRequired) {
      setError("A different HR approver must decide this Hire request.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decideHireRequest(
        detail.employee_id,
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      setNotice(
        result.status === "approved"
          ? `${detail.employee_number} was activated through independent Hire approval.`
          : `${detail.employee_number}'s Hire request was rejected without activation.`,
      );
      onAction(`Employee Hire ${result.status}`, detail.employee_number);
      retry.current = null;
      setDecision(null);
      setState("loading");
      setSelected(null);
      setDetail(null);
      setRefreshKey((current) => current + 1);
    } catch (cause) {
      setError(message(cause, "The Hire decision could not be saved. Refresh the queue before trying again."));
      setDecision(null);
    } finally {
      setSaving(false);
    }
  };

  if (!companyId)
    return (
      <Alert>
        <AlertTitle>No authorized company</AlertTitle>
        <AlertDescription>No Hire approvals are available in the current company scope.</AlertDescription>
      </Alert>
    );

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

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm" aria-label="Hire approvals">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Maker / checker control
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Hire approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review pending employment context separately from employee-profile approval.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={saving} onClick={refresh}>
          Refresh Hire queue
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertTitle>Hire decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Hire approval unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {state === "error" && (
        <p className="text-sm text-muted-foreground">
          No prototype Hire records are shown while live data is unavailable.
        </p>
      )}
      {state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Proposed job</th>
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
                    <td className="px-4 py-3">
                      <p>{item.job_name}</p>
                      <p className="text-xs text-muted-foreground">{item.job_code}</p>
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
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      No pending Hire approvals in this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="rounded-md border border-border p-4">
            {detailState === "loading" && selected && <Skeleton className="h-36 w-full" />}
            {detailState === "error" && selected && (
              <p className="text-sm text-muted-foreground">Select another pending request or refresh the queue.</p>
            )}
            {!selected && (
              <p className="text-sm text-muted-foreground">
                Select a pending Hire request to inspect its protected assignment context.
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
                <dl className="grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-1">
                  <ReviewField label="Job" value={`${detail.job_name} (${detail.job_code})`} />
                  <ReviewField label="Placement" value={`${detail.designation} · ${detail.work_location}`} />
                  <ReviewField label="Employment context" value={`${detail.employment_type} · ${detail.job_grade}`} />
                  <ReviewField label="Effective date" value={detail.effective_on} />
                  <ReviewField label="Requested" value={new Date(detail.requested_at).toLocaleString()} />
                  <ReviewField label="Business reason" value={detail.reason} />
                </dl>
                {approvalOverride.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                {approvalOverride.independentApproverRequired ? (
                  <Alert>
                    <AlertTitle>Independent approver required</AlertTitle>
                    <AlertDescription>
                      You submitted this Hire request, so another approver must decide it.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <label htmlFor="hire-decision-reason" className="grid gap-1.5 text-sm font-medium text-foreground">
                      Decision reason
                      <Textarea
                        id="hire-decision-reason"
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
                      <Button type="button" disabled={saving || !reason.trim()} onClick={() => setDecision("approved")}>
                        Approve Hire
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving || !reason.trim()}
                        onClick={() => setDecision("rejected")}
                      >
                        Reject Hire
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      )}

      <Dialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm Hire {decision === "approved" ? "approval" : "rejection"}</DialogTitle>
            <DialogDescription>
              Approval activates the relationship and a new operational assignment in one transaction. Rejection leaves
              both inactive.
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
