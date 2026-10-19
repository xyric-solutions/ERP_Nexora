"use client";

import { useEffect, useRef, useState } from "react";

import type { DecideHrEmployeeTransferRequest, HrEmployeeTransferRequestReview } from "@nexora/contracts";

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

export function HrTransferApprovalsPanel({
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
  const [queue, setQueue] = useState<Awaited<ReturnType<HrApiClient["transferRequests"]>>["items"]>([]);
  const [selected, setSelected] = useState<{ employeeId: string; requestId: string } | null>(null);
  const [detail, setDetail] = useState<HrEmployeeTransferRequestReview | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<DecideHrEmployeeTransferRequest["decision"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const approvalOverride = approvalOverrideReviewState(detail, detail?.requested_by === userId, canUseApprovalOverride);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .transferRequests({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The pending Transfer queue could not be loaded."));
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
      .transferRequest(selected.employeeId, selected.requestId)
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
        setError(message(cause, "The selected Transfer request is no longer available."));
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

  const decide = async () => {
    if (!detail || !decision || saving) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Enter a decision reason of 1 to 1000 characters.");
      setDecision(null);
      return;
    }
    if (approvalOverride.independentApproverRequired) {
      setError("A different HR approver must decide this Transfer request.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decideTransferRequest(
        detail.employee_id,
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      setNotice(
        result.status === "approved"
          ? `${detail.employee_number}'s Transfer was applied as a new assignment segment.`
          : `${detail.employee_number}'s Transfer was rejected without changing assignment history.`,
      );
      onAction(`Employee Transfer ${result.status}`, detail.employee_number);
      retry.current = null;
      setDecision(null);
      refresh();
    } catch (cause) {
      setError(message(cause, "The Transfer decision could not be saved. Refresh the queue before trying again."));
      setDecision(null);
    } finally {
      setSaving(false);
    }
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
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Transfer approvals"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Maker / checker control
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Transfer approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare current and proposed placement before applying an immutable assignment change.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={saving} onClick={refresh}>
          Refresh Transfer queue
        </Button>
      </div>

      {notice && (
        <Alert>
          <AlertTitle>Transfer decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Transfer approval unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {state === "error" && (
        <p className="text-sm text-muted-foreground">
          No prototype Transfer records are shown while live data is unavailable.
        </p>
      )}
      {state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Proposed placement</th>
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
                      <p>{item.proposed_branch || "No branch"}</p>
                      <p className="text-xs text-muted-foreground">{item.proposed_department || "No department"}</p>
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
                      No pending Transfer approvals in this company.
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
                Select a pending Transfer to compare its placement change.
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
                  <ReviewField
                    label="Current placement"
                    value={`${detail.source_branch || "No branch"} · ${detail.source_department || "No department"}`}
                  />
                  <ReviewField
                    label="Proposed placement"
                    value={`${detail.proposed_branch || "No branch"} · ${detail.proposed_department || "No department"}`}
                  />
                  <ReviewField
                    label="Job and designation"
                    value={`${detail.proposed_job} · ${detail.proposed_designation}`}
                  />
                  <ReviewField
                    label="Grade and work location"
                    value={`${detail.proposed_job_grade} · ${detail.proposed_work_location}`}
                  />
                  <ReviewField label="Effective date" value={detail.effective_on} />
                  <ReviewField label="Business reason" value={detail.reason} />
                </dl>
                {approvalOverride.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                {approvalOverride.independentApproverRequired ? (
                  <Alert>
                    <AlertTitle>Independent approver required</AlertTitle>
                    <AlertDescription>
                      You submitted this Transfer, so another HR checker must decide it.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <label
                      htmlFor="transfer-decision-reason"
                      className="grid gap-1.5 text-sm font-medium text-foreground"
                    >
                      Decision reason
                      <Textarea
                        id="transfer-decision-reason"
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
                        Approve Transfer
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving || !reason.trim()}
                        onClick={() => setDecision("rejected")}
                      >
                        Reject Transfer
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
            <DialogTitle>Confirm Transfer {decision === "approved" ? "approval" : "rejection"}</DialogTitle>
            <DialogDescription>
              Approval ends the current assignment and creates the proposed placement atomically. Rejection leaves the
              assignment unchanged.
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
