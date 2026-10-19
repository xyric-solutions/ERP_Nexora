"use client";

import { useEffect, useRef, useState } from "react";

import type { DecideHrEmployeePromotionRequest, HrEmployeePromotionRequestReview } from "@nexora/contracts";

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

export function HrPromotionApprovalsPanel({
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
  const [queue, setQueue] = useState<Awaited<ReturnType<HrApiClient["promotionRequests"]>>["items"]>([]);
  const [selected, setSelected] = useState<{ employeeId: string; requestId: string } | null>(null);
  const [detail, setDetail] = useState<HrEmployeePromotionRequestReview | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<DecideHrEmployeePromotionRequest["decision"] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const approvalOverride = approvalOverrideReviewState(detail, detail?.requested_by === userId, canUseApprovalOverride);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .promotionRequests({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setState("ready");
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The pending Promotion queue could not be loaded."));
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
      .promotionRequest(selected.employeeId, selected.requestId)
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
        setError(message(cause, "The selected Promotion request is no longer available."));
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
    if (approvalOverride.independentApproverRequired) {
      setError("A different HR approver must decide this Promotion request.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decidePromotionRequest(
        detail.employee_id,
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      setNotice(
        result.status === "approved"
          ? `${detail.employee_number}'s Promotion was applied without changing compensation.`
          : `${detail.employee_number}'s Promotion was rejected without changing assignment or salary history.`,
      );
      onAction(`Employee Promotion ${result.status}`, detail.employee_number);
      retry.current = null;
      setDecision(null);
      refresh();
    } catch (cause) {
      setError(message(cause, "The Promotion decision could not be saved. Refresh the queue before trying again."));
      setDecision(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Promotion approvals"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Maker / checker control
          </p>
          <h2 className="mt-1 text-lg font-semibold text-foreground">Promotion approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Compare current and proposed role details. Compensation is outside this decision.
          </p>
        </div>
        <Button type="button" variant="outline" disabled={saving} onClick={refresh}>
          Refresh Promotion queue
        </Button>
      </div>
      {notice && (
        <Alert>
          <AlertTitle>Promotion decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Promotion approval unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {state === "loading" && <Skeleton className="h-28 w-full" />}
      {state === "error" && (
        <p className="text-sm text-muted-foreground">
          No prototype Promotion records are shown while live data is unavailable.
        </p>
      )}
      {state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Proposed role</th>
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
                      <p>{item.proposed_job}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.proposed_designation} · {item.proposed_job_grade}
                      </p>
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
                      No pending Promotion approvals in this company.
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
              <p className="text-sm text-muted-foreground">Select a pending Promotion to compare role details.</p>
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
                    label="Current role"
                    value={`${detail.source_job} · ${detail.source_designation} · ${detail.source_job_grade}`}
                  />
                  <ReviewField
                    label="Proposed role"
                    value={`${detail.proposed_job} · ${detail.proposed_designation} · ${detail.proposed_job_grade}`}
                  />
                  <ReviewField label="Effective date" value={detail.effective_on} />
                  <ReviewField label="Business reason" value={detail.reason} />
                </dl>
                <Alert>
                  <AlertTitle>Compensation unchanged</AlertTitle>
                  <AlertDescription>
                    This decision does not create, update, or supersede a salary assignment.
                  </AlertDescription>
                </Alert>
                {approvalOverride.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                {approvalOverride.independentApproverRequired ? (
                  <Alert>
                    <AlertTitle>Independent approver required</AlertTitle>
                    <AlertDescription>
                      You submitted this Promotion, so another HR checker must decide it.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <label
                      htmlFor="promotion-decision-reason"
                      className="grid gap-1.5 text-sm font-medium text-foreground"
                    >
                      Decision reason
                      <Textarea
                        id="promotion-decision-reason"
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
                        Approve Promotion
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving || !reason.trim()}
                        onClick={() => setDecision("rejected")}
                      >
                        Reject Promotion
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
            <DialogTitle>Confirm Promotion {decision === "approved" ? "approval" : "rejection"}</DialogTitle>
            <DialogDescription>
              Approval changes job, designation, and grade atomically while salary remains unchanged. Rejection changes
              neither.
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
