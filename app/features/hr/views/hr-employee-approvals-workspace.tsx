"use client";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrRecordDrawer } from "../components/hr-record-drawer";

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
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";

import { HrApiClient } from "../api/hr-client";
import { approvalOverrideReviewState } from "../approval-override-ui";
import { HrHireApprovalsPanel } from "../components/hr-hire-approvals-panel";
import { HrTransferApprovalsPanel } from "../components/hr-transfer-approvals-panel";
import { HrPromotionApprovalsPanel } from "../components/hr-promotion-approvals-panel";
import { HrManagerChangeApprovalsPanel } from "../components/hr-manager-change-approvals-panel";
import { HrWorkLocationChangeApprovalsPanel } from "../components/hr-work-location-change-approvals-panel";
import { HrOrganizationPlacementChangeApprovalsPanel } from "../components/hr-organization-placement-change-approvals-panel";

type LoadState = "loading" | "ready" | "error";
type Decision = DecideHrEmployeeDraftApprovalRequest["decision"];

type ApprovalKind = "drafts" | "hire" | "transfer" | "promotion" | "manager" | "location" | "placement";
/** Approval queues grouped by what they change; each kind shows one queue at a time. */
const approvalCategories: readonly { label: string; kinds: readonly { kind: ApprovalKind; label: string }[] }[] = [
  {
    label: "Joining",
    kinds: [
      { kind: "drafts", label: "Employee drafts" },
      { kind: "hire", label: "Hire" },
    ],
  },
  {
    label: "Movements",
    kinds: [
      { kind: "transfer", label: "Transfers" },
      { kind: "promotion", label: "Promotions" },
    ],
  },
  {
    label: "Reporting & placement",
    kinds: [
      { kind: "manager", label: "Manager changes" },
      { kind: "location", label: "Work locations" },
      { kind: "placement", label: "Organisation placement" },
    ],
  },
];

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
  const canApproveOrganizationPlacementChange =
    session?.user.permissions.includes("hr.employee_assignment.change") ?? false;
  const canUseApprovalOverride =
    session?.user.roles.includes("super_administrator") === true &&
    session.user.permissions.includes("platform.approval.override") &&
    session.impersonation === undefined;
  const canApprove =
    canApproveDraft ||
    canApproveHire ||
    canApproveTransfer ||
    canApprovePromotion ||
    canApproveManagerChange ||
    canApproveWorkLocationChange ||
    canApproveOrganizationPlacementChange;
  const userId = session?.user.id;
  const permittedKinds: Record<ApprovalKind, boolean> = {
    drafts: canApproveDraft,
    hire: canApproveHire,
    transfer: canApproveTransfer,
    promotion: canApprovePromotion,
    manager: canApproveManagerChange,
    location: canApproveWorkLocationChange,
    placement: canApproveOrganizationPlacementChange,
  };
  const visibleCategories = approvalCategories
    .map((category) => ({ ...category, kinds: category.kinds.filter((item) => permittedKinds[item.kind]) }))
    .filter((category) => category.kinds.length);
  const [chosenKind, setChosenKind] = useState<ApprovalKind | "">("");
  const firstKind = visibleCategories[0]?.kinds[0]?.kind ?? "drafts";
  const kind: ApprovalKind = chosenKind && permittedKinds[chosenKind] ? chosenKind : firstKind;
  const [countsKey, setCountsKey] = useState(0);
  const [counts, setCounts] = useState<{ key: string; values: Partial<Record<ApprovalKind, number | null>> }>({
    key: "",
    values: {},
  });
  const countsFor = `${companyId}:${refreshKey}:${countsKey}`;
  const countValues = counts.key === countsFor ? counts.values : {};
  // Decisions inside a queue panel refresh the pending counts.
  const reportAction = (action: string, subject?: string) => {
    setCountsKey((current) => current + 1);
    onAction(action, subject);
  };
  const draftOverride = approvalOverrideReviewState(
    detail,
    detail ? detail.submitted_by === userId || detail.created_by === userId : false,
    canUseApprovalOverride && canApproveDraft,
  );

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
    if (!companyId) return;
    let active = true;
    const reads: [ApprovalKind, boolean, () => Promise<{ items: readonly unknown[] }>][] = [
      ["drafts", canApproveDraft, () => client.employeeDraftApprovals({ companyId, limit: 50 })],
      ["hire", canApproveHire, () => client.hireRequests({ companyId, limit: 50 })],
      ["transfer", canApproveTransfer, () => client.transferRequests({ companyId, limit: 50 })],
      ["promotion", canApprovePromotion, () => client.promotionRequests({ companyId, limit: 50 })],
      ["manager", canApproveManagerChange, () => client.managerChangeRequests({ companyId, limit: 50 })],
      ["location", canApproveWorkLocationChange, () => client.workLocationChangeRequests({ companyId, limit: 50 })],
      [
        "placement",
        canApproveOrganizationPlacementChange,
        () => client.organizationPlacementChangeRequests({ companyId, limit: 50 }),
      ],
    ];
    for (const [item, permitted, read] of reads) {
      if (!permitted) continue;
      read()
        .then((result) => result.items.length)
        .catch(() => null)
        .then((value) => {
          if (!active) return;
          setCounts((current) => ({
            key: countsFor,
            values: { ...(current.key === countsFor ? current.values : {}), [item]: value },
          }));
        });
    }
    return () => {
      active = false;
    };
  }, [
    canApproveDraft,
    canApproveHire,
    canApproveManagerChange,
    canApproveOrganizationPlacementChange,
    canApprovePromotion,
    canApproveTransfer,
    canApproveWorkLocationChange,
    client,
    companyId,
    countsFor,
  ]);

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
    const override = approvalOverrideReviewState(
      detail,
      detail.submitted_by === userId || detail.created_by === userId,
      canUseApprovalOverride && canApproveDraft,
    );
    if (override.independentApproverRequired) {
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
      reportAction(`Employee draft ${decision}`, result.employee_number);
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
      <nav
        aria-label="Approval types"
        className="grid gap-3 rounded-lg border border-border bg-card p-3 shadow-sm md:grid-cols-3"
      >
        {visibleCategories.map((category) => (
          <div key={category.label} className="grid content-start gap-1.5">
            <h3 className="m-0! px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {category.label}
            </h3>
            {category.kinds.map((item) => {
              const count = countValues[item.kind];
              const active = item.kind === kind;
              return (
                <button
                  key={item.kind}
                  type="button"
                  aria-current={active ? "page" : undefined}
                  disabled={saving}
                  onClick={() => setChosenKind(item.kind)}
                  className={`flex min-h-9 items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-left text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-foreground hover:border-primary/50 hover:bg-muted/40"
                  }`}
                >
                  <span className="min-w-0 truncate">{item.label}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs tabular-nums ${
                      count ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                    aria-label={count == null ? "Pending count unavailable" : `${count} pending`}
                  >
                    {count === undefined ? "…" : count === null ? "–" : count >= 50 ? "50+" : count}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {canApproveDraft && kind === "drafts" && notice && (
        <Alert>
          <AlertTitle>Decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {canApproveDraft && kind === "drafts" && error && (
        <Alert variant="destructive">
          <AlertTitle>Decision unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {canApproveDraft && kind === "drafts" && state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Live approvals unavailable</AlertTitle>
          <AlertDescription>
            The approval queue could not be loaded. No prototype approval actions are shown here.
          </AlertDescription>
        </Alert>
      )}
      {canApproveDraft && kind === "drafts" && state === "loading" && (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      )}
      {canApproveDraft && kind === "drafts" && state === "ready" && (
        <div className="grid gap-4 ">
          <div className="relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
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
          <HrRecordDrawer
            title="Employee approval"
            open={!!selectedId}
            onClose={() => setSelectedId("")}
            busy={saving}
            error={error}
          >
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
                  {draftOverride.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                  {draftOverride.independentApproverRequired ? (
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
                      <HrDrawerActions>
                        <Button
                          type="button"
                          disabled={saving || !reason.trim()}
                          onClick={() => setDecision("approved")}
                        >
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
                      </HrDrawerActions>
                      <p className="text-xs text-muted-foreground">
                        Approving this draft does not activate employment or payroll access.
                      </p>
                    </>
                  )}
                </div>
              )}
            </aside>
          </HrRecordDrawer>
        </div>
      )}
      <Dialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDecision(null);
        }}
      >
        <DialogContent className="z-[1501]!" overlayClassName="z-[1500]!">
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
      {canApproveHire && kind === "hire" && (
        <HrHireApprovalsPanel
          key={companyId}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
      {canApproveTransfer && kind === "transfer" && (
        <HrTransferApprovalsPanel
          key={`transfer:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
      {canApprovePromotion && kind === "promotion" && (
        <HrPromotionApprovalsPanel
          key={`promotion:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
      {canApproveManagerChange && kind === "manager" && (
        <HrManagerChangeApprovalsPanel
          key={`manager-change:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
      {canApproveWorkLocationChange && kind === "location" && (
        <HrWorkLocationChangeApprovalsPanel
          key={`work-location-change:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
      {canApproveOrganizationPlacementChange && kind === "placement" && (
        <HrOrganizationPlacementChangeApprovalsPanel
          key={`organization-placement-change:${companyId}`}
          client={client}
          csrfToken={csrfToken}
          companyId={companyId}
          canApprove={canApproveOrganizationPlacementChange}
          userId={userId}
          canUseApprovalOverride={canUseApprovalOverride}
          onAction={reportAction}
        />
      )}
    </section>
  );
}
