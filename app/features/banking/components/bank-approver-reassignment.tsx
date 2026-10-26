"use client";
import { useRef, useState } from "react";
import type { BankPaymentDetail, BankReceiptDetail, BankTransferDetail } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { WorkflowSelect } from "./bank-workflow-controls";
export function BankApproverReassignment({
  transaction,
  record,
  disabled,
  onUpdated,
  onBusyChange,
}: {
  transaction: "payments" | "receipts" | "transfers";
  record: BankPaymentDetail | BankReceiptDetail | BankTransferDetail;
  disabled: boolean;
  onUpdated: () => Promise<boolean | void>;
  onBusyChange: (busy: boolean) => void;
}) {
  const { api, csrfToken, session } = useSession(),
    notify = useActionFeedback();
  const [opened, setOpened] = useState(false),
    [target, setTarget] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const permitted = !!record.can_reassign_approver && !session?.impersonation;
  async function reassign() {
    if (!permitted || disabled || busy || !target || target === record.approver_user_id) return;
    const input = { approver_user_id: target, expected_version: record.version },
      fingerprint = JSON.stringify(input);
    const key =
      attempt.current?.fingerprint === fingerprint ? attempt.current.key : `bank-reassign-${crypto.randomUUID()}`;
    attempt.current = { fingerprint, key };
    setBusy(true);
    onBusyChange(true);
    setError("");
    try {
      if (transaction === "payments") await api.reassignBankPaymentApprover(record.id, input, csrfToken(), key);
      else if (transaction === "receipts") await api.reassignBankReceiptApprover(record.id, input, csrfToken(), key);
      else await api.reassignBankTransferApprover(record.id, input, csrfToken(), key);
      attempt.current = null;
      setOpened(false);
      setTarget("");
      notify(
        "Bank approver reassigned successfully. The transaction remains submitted and has not been approved or posted.",
      );
      await onUpdated();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : "Reassignment could not be completed. Retry the same request or refresh current state.",
      );
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  }
  if (!permitted && !record.approver_history?.length) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Approver assignment</CardTitle>
        <CardDescription>
          Reassignment is an audited global-administrator operation. It changes neither financial facts nor lifecycle
          approval.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm">
          Current checker: {record.approver_name ?? record.approver_user_id ?? "Legacy independent checker queue"}
        </p>
        {error && (
          <Alert variant="destructive" role="alert">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {opened && permitted && (
          <WorkflowSelect
            transaction={transaction}
            company={record.company_id}
            kind="approver"
            label="Reassigned approver"
            selected={target}
            disabled={disabled || busy}
            onChange={setTarget}
          />
        )}
        {!!record.approver_history?.length && (
          <ol className="flex flex-col gap-2 text-sm" aria-label="Immutable approver history">
            {record.approver_history.map((item) => (
              <li key={item.id} className="rounded-md border border-border p-3">
                <p>
                  Version {item.version}: {item.previous_user_id ?? "Legacy queue"} → {item.assigned_user_id}
                </p>
                <p className="text-xs text-muted-foreground">
                  {item.actor_id} · {item.occurred_at}
                </p>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
      {permitted && (
        <CardFooter className="flex flex-wrap gap-2">
          {opened ? (
            <>
              <Button
                disabled={disabled || busy || !target || target === record.approver_user_id}
                onClick={() => void reassign()}
              >
                Confirm reassignment
              </Button>
              <Button
                variant="outline"
                disabled={disabled || busy}
                onClick={() => {
                  setOpened(false);
                  setTarget("");
                  setError("");
                }}
              >
                Cancel reassignment
              </Button>
            </>
          ) : (
            <Button variant="outline" disabled={disabled || busy} onClick={() => setOpened(true)}>
              Reassign approver
            </Button>
          )}
          {error && (
            <Button variant="outline" disabled={disabled || busy} onClick={() => void onUpdated()}>
              Refresh decision state
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
