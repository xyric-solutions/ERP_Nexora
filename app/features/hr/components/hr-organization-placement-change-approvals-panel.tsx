"use client";

import { useEffect, useRef, useState } from "react";

import type { HrEmployeeOrganizationPlacementChangeRequestReview } from "@nexora/contracts";

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

type Decision = "approved" | "rejected";
const placementLabels: Record<string, string> = {
  business_unit: "Business unit",
  division: "Division",
  branch: "Branch",
  department: "Department",
  warehouse: "Warehouse",
};

function message(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

export function HrOrganizationPlacementChangeApprovalsPanel({
  client,
  csrfToken,
  companyId,
  canApprove,
  userId,
  canUseApprovalOverride,
  onAction,
}: {
  client: HrApiClient;
  csrfToken: () => string;
  companyId: string;
  canApprove: boolean;
  userId?: string;
  canUseApprovalOverride: boolean;
  onAction: (action: string, subject?: string) => void;
}) {
  const [queue, setQueue] = useState<HrEmployeeOrganizationPlacementChangeRequestReview[]>([]);
  const [loadedCompanyId, setLoadedCompanyId] = useState("");
  const [loadError, setLoadError] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState<HrEmployeeOrganizationPlacementChangeRequestReview | null>(null);
  const [detailId, setDetailId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!canApprove || !companyId) return;
    let active = true;
    client
      .organizationPlacementChangeRequests({ companyId, limit: 50 })
      .then((result) => {
        if (!active) return;
        setQueue(result.items);
        setLoadedCompanyId(companyId);
        setLoadError("");
      })
      .catch((cause) => {
        if (!active) return;
        setLoadError(message(cause, "The organization-placement approval queue could not be loaded."));
        setLoadedCompanyId(companyId);
      });
    return () => {
      active = false;
    };
  }, [canApprove, client, companyId, refreshKey]);

  useEffect(() => {
    const selected = queue.find((item) => item.id === selectedId);
    if (!selected) return;
    let active = true;
    client
      .organizationPlacementChangeRequest(selected.employee_id, selected.id)
      .then((result) => {
        if (!active) return;
        setDetail(result);
        setDetailId(selected.id);
      })
      .catch((cause) => {
        if (!active) return;
        setError(message(cause, "The selected organization request is no longer available."));
        setDetailId(selected.id);
      });
    return () => {
      active = false;
    };
  }, [client, queue, selectedId]);

  if (!canApprove)
    return (
      <Alert>
        <AlertTitle>Organization approval permission required</AlertTitle>
        <AlertDescription>Your session cannot decide organization-placement changes.</AlertDescription>
      </Alert>
    );

  const loading = loadedCompanyId !== companyId;
  const detailLoading = Boolean(selectedId && detailId !== selectedId);
  const approvalOverride = approvalOverrideReviewState(detail, detail?.requested_by === userId, canUseApprovalOverride);

  const decide = async () => {
    if (!detail || !decision || saving) return;
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 1000) {
      setError("Enter a decision reason of 1 to 1000 characters.");
      setDecision(null);
      return;
    }
    if (approvalOverride.independentApproverRequired) {
      setError("A different HR approver must decide this request.");
      setDecision(null);
      return;
    }
    if (decision === "approved" && !detail.hierarchy_ready) {
      setError("Approval is blocked because the proposed hierarchy is no longer ready.");
      setDecision(null);
      return;
    }
    const fingerprint = `${detail.id}:${decision}:${trimmed}`;
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setSaving(true);
    setError("");
    try {
      const result = await client.decideOrganizationPlacementChangeRequest(
        detail.employee_id,
        detail.id,
        { decision, reason: trimmed },
        csrfToken(),
        retry.current.key,
      );
      retry.current = null;
      setNotice(`Organization-placement request ${result.id} was ${result.status}.`);
      onAction(`Organization placement ${result.status}`, detail.employee_number);
      setSelectedId("");
      setDetail(null);
      setDetailId("");
      setReason("");
      setDecision(null);
      setRefreshKey((value) => value + 1);
    } catch (cause) {
      setError(message(cause, "The organization-placement decision could not be saved."));
      setDecision(null);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section
      className="grid gap-4 rounded-lg border border-border bg-card p-4 shadow-sm"
      aria-label="Organization placement approvals"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Independent checker</p>
          <h2 className="mt-1 text-lg font-semibold">Organization placement approvals</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Review the complete hierarchy before creating a new assignment segment.
          </p>
        </div>
        <Badge variant="outline">Live API only</Badge>
      </div>
      {loading && <Skeleton className="h-24 w-full" />}
      {!loading && loadError && (
        <Alert variant="destructive">
          <AlertTitle>Approval queue unavailable</AlertTitle>
          <AlertDescription>{loadError} No mock requests are shown.</AlertDescription>
        </Alert>
      )}
      {!loading && !loadError && queue.length === 0 && (
        <Alert>
          <AlertTitle>No pending organization changes</AlertTitle>
          <AlertDescription>The company has no organization-placement requests awaiting review.</AlertDescription>
        </Alert>
      )}
      {!loading && !loadError && queue.length > 0 && (
        <label className="grid gap-1.5 text-sm font-medium">
          Pending request
          <select
            className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
            value={selectedId}
            onChange={(event) => {
              setSelectedId(event.target.value);
              setError("");
              setNotice("");
            }}
          >
            <option value="">Select a request</option>
            {queue.map((item) => (
              <option key={item.id} value={item.id}>
                {item.employee_number} — {item.employee_name}
              </option>
            ))}
          </select>
        </label>
      )}
      {detailLoading && <Skeleton className="h-32 w-full" />}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Organization decision unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertTitle>Decision recorded</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {detail && detailId === selectedId && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <PlacementCard title="Current hierarchy" names={detail.current_names} />
            <PlacementCard title="Proposed hierarchy" names={detail.proposed_names} />
          </div>
          <Alert variant={detail.hierarchy_ready ? "default" : "destructive"}>
            <AlertTitle>{detail.hierarchy_ready ? "Hierarchy ready" : "Approval blocked"}</AlertTitle>
            <AlertDescription>
              {detail.hierarchy_ready
                ? "The proposed units currently form one active company hierarchy."
                : "The hierarchy became inactive or incoherent. Rejection remains available."}
            </AlertDescription>
          </Alert>
          <dl className="grid gap-3 rounded-md bg-muted/45 p-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">Requested by</dt>
              <dd className="font-medium">{detail.requested_by}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Effective date</dt>
              <dd className="font-medium">{detail.effective_on}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Maker reason</dt>
              <dd className="font-medium">{detail.reason}</dd>
            </div>
          </dl>
          {approvalOverride.overrideAllowed ? <SuperAdminOverrideWarning /> : null}
          {approvalOverride.independentApproverRequired && (
            <Alert variant="destructive">
              <AlertTitle>Independent approver required</AlertTitle>
              <AlertDescription>You requested this change and cannot decide it.</AlertDescription>
            </Alert>
          )}
          <label htmlFor="organization-placement-decision-reason" className="grid gap-1.5 text-sm font-medium">
            Decision reason
            <Textarea
              id="organization-placement-decision-reason"
              value={reason}
              maxLength={1000}
              disabled={saving}
              onChange={(event) => {
                setReason(event.target.value);
                retry.current = null;
              }}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={
                saving || approvalOverride.independentApproverRequired || !detail.hierarchy_ready || !reason.trim()
              }
              onClick={() => setDecision("approved")}
            >
              Approve organization change
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={saving || approvalOverride.independentApproverRequired || !reason.trim()}
              onClick={() => setDecision("rejected")}
            >
              Reject
            </Button>
          </div>
        </>
      )}
      <Dialog
        open={decision !== null}
        onOpenChange={(open) => {
          if (!open && !saving) setDecision(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirm organization decision</DialogTitle>
            <DialogDescription>
              This records an immutable {decision} decision. Approval closes the current assignment and projects the
              complete hierarchy.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose
              render={
                <Button type="button" variant="outline" disabled={saving}>
                  Cancel
                </Button>
              }
            />
            <Button
              type="button"
              variant={decision === "rejected" ? "destructive" : "default"}
              disabled={saving}
              onClick={decide}
            >
              {saving ? "Recording..." : `Confirm ${decision ?? "decision"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function PlacementCard({ title, names }: { title: string; names: Record<string, string> }) {
  return (
    <div className="rounded-md border border-border p-3">
      <h3 className="font-semibold">{title}</h3>
      <dl className="mt-2 grid gap-1 text-sm">
        {Object.entries(placementLabels).map(([type, label]) => (
          <div key={type} className="flex justify-between gap-3">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-medium">{names[type] ?? "Not assigned"}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
