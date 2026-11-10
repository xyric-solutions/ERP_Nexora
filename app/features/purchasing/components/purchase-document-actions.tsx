"use client";

import type { PurchaseDocument, PurchaseKind } from "@nexora/contracts";
import { Button } from "@/components/ui/button";

export type PurchaseFormAction = "save" | "submit" | "save_approve" | "approve" | "reject" | "cancel";

export function PurchaseDocumentActions({
  kind,
  record,
  canSave,
  canSubmit,
  canDecide,
  mayDecide,
  canSaveApprove,
  approvalReasonRequired,
  deferActionReason,
  canContinue,
  canCancel,
  busy,
  dirty,
  reason,
  onAction,
}: {
  kind: PurchaseKind;
  record: PurchaseDocument | null;
  canSave: boolean;
  canSubmit: boolean;
  canDecide: boolean;
  mayDecide: boolean;
  canSaveApprove: boolean;
  approvalReasonRequired: boolean;
  deferActionReason: boolean;
  canContinue: boolean;
  canCancel: boolean;
  busy: boolean;
  dirty: boolean;
  reason: string;
  onAction: (action: PurchaseFormAction, continueFlow?: boolean) => void;
}) {
  return (
    <div role="group" aria-label="Purchase document actions" className="flex flex-wrap items-center gap-2 print:hidden">
      {canSave ? (
        <Button type="submit" variant="outline" disabled={busy}>
          {busy ? "Working…" : "Save Draft"}
        </Button>
      ) : null}
      {canSubmit ? (
        <>
          <Button
            type="button"
            disabled={busy || (!canSave && dirty) || (canSaveApprove && approvalReasonRequired && !reason.trim())}
            onClick={() => onAction(canSaveApprove ? "save_approve" : "submit", true)}
          >
            {canSaveApprove
              ? kind === "receipt"
                ? "Receive Products"
                : "Save, Approve & Continue"
              : "Save & Continue"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || (!canSave && dirty)}
            onClick={() => onAction("submit")}
          >
            Submit for Approval
          </Button>
        </>
      ) : null}
      {canDecide ? (
        <>
          <Button
            type="button"
            disabled={busy || (approvalReasonRequired && !reason.trim()) || !mayDecide}
            onClick={() => onAction("approve", true)}
          >
            {kind === "receipt"
              ? "Receive Products"
              : canContinue
                ? "Approve & Continue"
                : record?.kind === "bill"
                  ? "Approve Bill"
                  : "Approve"}
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || (!deferActionReason && !reason.trim()) || !mayDecide}
            onClick={() => onAction("reject")}
          >
            Reject
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || (approvalReasonRequired && !reason.trim()) || !mayDecide}
            onClick={() => onAction("approve")}
          >
            {kind === "receipt" ? "Receive & Close" : "Approve & Close"}
          </Button>
        </>
      ) : null}
      {canCancel ? (
        <Button
          type="button"
          variant="ghost"
          disabled={busy || (!deferActionReason && !reason.trim()) || dirty}
          onClick={() => onAction("cancel")}
        >
          Cancel record
        </Button>
      ) : null}
    </div>
  );
}
