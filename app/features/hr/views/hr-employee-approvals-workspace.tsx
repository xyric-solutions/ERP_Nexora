"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import type { DecideHrEmployeeDraftApprovalRequest, HrEmployeeDraftApprovalDetail } from "@nexora/contracts";

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
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrHireApprovalsPanel } from "../components/hr-hire-approvals-panel";
import { HrTransferApprovalsPanel } from "../components/hr-transfer-approvals-panel";
import { HrPromotionApprovalsPanel } from "../components/hr-promotion-approvals-panel";
import { HrManagerChangeApprovalsPanel } from "../components/hr-manager-change-approvals-panel";
import { HrWorkLocationChangeApprovalsPanel } from "../components/hr-work-location-change-approvals-panel";

type LoadState = "loading" | "ready" | "error";
type Decision = DecideHrEmployeeDraftApprovalRequest["decision"];

export function HrEmployeeApprovalsWorkspace({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [queue, setQueue] = useState<Awaited<ReturnType<HrApiClient["employeeDraftApprovals"]>>["items"]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<HrEmployeeDraftApprovalDetail | null>(null);
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const canApproveDraft = session?.user.permissions.includes("hr.employee.approve") ?? false;
  const canApproveHire = session?.user.permissions.includes("hr.employment_lifecycle.approve") ?? false;
  const canApproveTransfer = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canApprovePromotion = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canApproveManagerChange = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canApproveWorkLocationChange = session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canApprove =
    canApproveDraft ||
    canApproveHire ||
    canApproveTransfer ||
    canApprovePromotion ||
    canApproveManagerChange ||
    canApproveWorkLocationChange;
  const userId = session?.user.id;

  useEffect(() => {
    if (sessionLoading || !canApprove) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) =>
          result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
        );
        if (result.items.length === 0) setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canApprove, client, sessionLoading]);

  useEffect(() => {
    if (!canApproveDraft || !companyId) return;
    let active = true;
    setState("loading");
    setQueue([]);
    setSelectedId("");
    setDetail(null);
    setDecision(null);
    setReason("");
    client
      .employeeDraftApprovals({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canApproveDraft, client, companyId, refreshKey]);

  useEffect(() => {
    if (!selectedId || !companyId) return;
    let active = true;
    setDetail(null);
    setDetailState("loading");
    setReason("");
    setDecision(null);
    client
      .employeeDraftApproval(selectedId)
      .then((result) => {
        if (!active) return;
        if (result.company_id !== companyId) {
          setDetailState("error");
          return;
        }
        setDetail(result);
        setDetailState("ready");
      })
      .catch(() => {
        if (active) setDetailState("error");
      });
    return () => {
      active = false;
    };
  }, [client, companyId, selectedId]);

  const decide = async () => {
    if (!detail || !decision || saving) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Enter a decision reason of 1 to 1000 characters.");
      setDecision(null);
      return;
    }
    if (detail.submitted_by === userId || detail.created_by === userId) {
      setError("A different HR approver must decide this draft.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.approval_id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decideEmployeeDraftApproval(
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      setNotice(`${result.employee_number} was ${decision}. This decision does not activate employment.`);
      onAction(`Employee draft ${decision}`, result.employee_number);
      retry.current = null;
      setDecision(null);
      setRefreshKey((current) => current + 1);
    } catch {
      setError("The decision could not be saved. Check your access and refresh the queue before trying again.");
      setDecision(null);
    } finally {
      setSaving(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canApprove)
    return (
      <Alert>
        <AlertTitle>Approval access required</AlertTitle>
        <AlertDescription>
          Your session does not have permission to review employee drafts or Hire requests.
        </AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-4" aria-label="Employee and Hire approvals">
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <label className="grid min-w-55 flex-1 gap-1.5 text-sm font-medium text-foreground">
          Company
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
            disabled={saving || companies.length === 0}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!companyId || saving}
          onClick={() => setRefreshKey((current) => current + 1)}
        >
          Refresh queue
        </Button>
      </div>
      {canApproveDraft && notice && (
        <Alert>
          <AlertTitle>Decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {canApproveDraft && error && (
        <Alert variant="destructive">
          <AlertTitle>Decision unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canApproveDraft && state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live approvals unavailable</AlertTitle>
          <AlertDescription>
            The approval queue could not be loaded. No prototype approval actions are shown here.
          </AlertDescription>
        </Alert>
      )}
      {canApproveDraft && state === "loading" && (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {canApproveDraft && state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(20rem,.8fr)]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-160 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Submitted</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {queue.map((item) => (
                  <tr className="border-b border-border/70 last:border-0" key={item.approval_id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{item.display_name}</p>
                      <p className="text-xs text-muted-foreground">{item.employee_number}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{new Date(item.submitted_at).toLocaleString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setError("");
                          setSelectedId(item.employee_id);
                        }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
                {queue.length === 0 && (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={3}>
                      No pending approvals in this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
            {detailState === "loading" && selectedId && (
              <div className="grid gap-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-16 w-full" />
              </div>
            )}
            {detailState === "error" && selectedId && (
              <Alert variant="destructive">
                <AlertTitle>Review unavailable</AlertTitle>
                <AlertDescription>
                  This pending draft may have changed or is outside your company access.
                </AlertDescription>
              </Alert>
            )}
            {!selectedId && (
              <p className="text-sm text-muted-foreground">
                Select a pending draft to review its permitted profile before making a decision.
              </p>
            )}
            {detail && detailState === "ready" && (
              <div className="grid gap-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="font-semibold text-foreground">{detail.display_name}</h2>
                    <p className="text-sm text-muted-foreground">{detail.employee_number}</p>
                  </div>
                  <Badge variant="secondary">Pending</Badge>
                </div>
                <dl className="grid gap-2 text-sm">
                  <div>
                    <dt className="text-muted-foreground">Work email</dt>
                    <dd>{detail.work_email || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Phone</dt>
                    <dd>{detail.phone || "Not provided"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Joined</dt>
                    <dd>{detail.joined_on}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Submitted</dt>
                    <dd>{new Date(detail.submitted_at).toLocaleString()}</dd>
                  </div>
                </dl>
                {detail.submitted_by === userId || detail.created_by === userId ? (
                  <Alert>
                    <AlertTitle>Independent approver required</AlertTitle>
                    <AlertDescription>
                      You created or submitted this draft, so another HR approver must decide it.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    <label className="grid gap-1.5 text-sm font-medium text-foreground">
                      Decision reason
                      <Textarea
                        value={reason}
                        onChange={(event) => {
                          setReason(event.target.value);
                          retry.current = null;
                        }}
                        maxLength={1000}
                        disabled={saving}
                        placeholder="Explain the approval or rejection for the audit record."
                      />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" disabled={saving || !reason.trim()} onClick={() => setDecision("approved")}>
                        Approve draft
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={saving || !reason.trim()}
                        onClick={() => setDecision("rejected")}
                      >
                        Reject draft
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Approving this draft does not activate employment or payroll access.
                    </p>
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
            <DialogTitle>Confirm {decision === "approved" ? "approval" : "rejection"}</DialogTitle>
            <DialogDescription>
              This records an audited decision for {detail?.display_name}. The draft will leave the pending queue.
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
              {saving ? "Saving..." : "Confirm decision"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {canApproveHire && (
        <HrHireApprovalsPanel
          key={companyId}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          onAction={onAction}
        />
      )}
      {canApproveTransfer && (
        <HrTransferApprovalsPanel
          key={`transfer:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          onAction={onAction}
        />
      )}
      {canApprovePromotion && (
        <HrPromotionApprovalsPanel
          key={`promotion:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          onAction={onAction}
        />
      )}
      {canApproveManagerChange && (
        <HrManagerChangeApprovalsPanel
          key={`manager-change:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          onAction={onAction}
        />
      )}
      {canApproveWorkLocationChange && (
        <HrWorkLocationChangeApprovalsPanel
          key={`work-location-change:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          onAction={onAction}
        />
      )}
    </section>
  );
}
