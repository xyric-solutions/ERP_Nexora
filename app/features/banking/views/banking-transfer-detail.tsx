"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BankTransferDetail } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { BankingApiClient } from "../api/banking-client";
import { BankApproverReassignment } from "../components/bank-approver-reassignment";
import { bankTransferStateLabel } from "../model/bank-transfer-status";

type Action = "submit" | "approve" | "reject" | "post" | "reverse" | "reassign";

export function BankingTransferDetail({
  transferId,
  onBack,
  onEdit,
}: {
  transferId: string;
  onBack: () => void;
  onEdit: (id: string) => void;
}) {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const [transfer, setTransfer] = useState<BankTransferDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const retries = useRef<Partial<Record<Action, { fingerprint: string; key: string }>>>({});

  const load = useCallback(async () => {
    if (!session || !permissions.has("banking.transfer.read")) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      setTransfer(await client.transfer(transferId));
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Bank Transfer could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [client, permissions, session, transferId]);

  useEffect(() => {
    if (sessionLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, sessionLoading]);

  function key(action: Action, fingerprint: string) {
    const current = retries.current[action];
    if (current?.fingerprint === fingerprint) return current.key;
    const next = { fingerprint, key: `web-bank-transfer-${action}-${crypto.randomUUID()}` };
    retries.current[action] = next;
    return next.key;
  }

  async function act(action: Action, closeAfter = false) {
    if (!transfer) return;
    if ((action === "reject" || action === "reverse") && reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters.");
      return;
    }
    const fingerprint = `${transfer.id}:${transfer.version}:${reason.trim()}`;
    setBusy(action);
    setError("");
    try {
      if (action === "submit")
        await client.submitTransfer(
          transfer.id,
          { expected_version: transfer.version },
          csrfToken(),
          key(action, fingerprint),
        );
      if (action === "approve" || action === "reject")
        await client.decideTransfer(
          transfer.id,
          { action, expected_version: transfer.version, ...(action === "reject" ? { reason: reason.trim() } : {}) },
          csrfToken(),
          key(action, fingerprint),
        );
      if (action === "post")
        await client.postTransfer(
          transfer.id,
          { expected_version: transfer.version },
          csrfToken(),
          key(action, fingerprint),
        );
      if (action === "reverse")
        await client.reverseTransfer(
          transfer.id,
          { expected_version: transfer.version, reason: reason.trim() },
          csrfToken(),
          key(action, fingerprint),
        );
      notify(`Bank Transfer ${transfer.reference} ${action === "submit" ? "submitted" : `${action}d`}.`);
      setReason("");
      if (action === "approve" && closeAfter) {
        onBack();
        return;
      }
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? `${caught.message}${caught.correlationId ? ` Reference: ${caught.correlationId}` : ""}`
          : "The Transfer action failed safely.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (sessionLoading || loading)
    return (
      <Notice
        title="Loading Bank Transfer"
        detail="Loading persisted transfer, audit history and accounting preview."
      />
    );
  if (!session) return <Notice title="Sign in required" detail="An authenticated session is required." />;
  if (!permissions.has("banking.transfer.read"))
    return <Notice title="Permission required" detail="banking.transfer.read is required." />;
  if (!transfer)
    return (
      <Notice
        title="Bank Transfer unavailable"
        detail={error || "The Transfer was not found in your permitted company scope."}
        destructive
      />
    );

  const currentUserIsAssignedApprover = transfer.approver_user_id === session.user.id;
  const canApproveAndClose =
    transfer.state === "submitted" &&
    permissions.has("banking.transfer.approve") &&
    currentUserIsAssignedApprover &&
    (transfer.super_admin_override_allowed || transfer.delegated_self_approval_allowed);

  return (
    <div className="space-y-5" aria-busy={Boolean(busy)}>
      <header className="flex flex-wrap items-start justify-between gap-4 rounded-lg border border-border bg-card p-5 shadow-sm">
        <div>
          <button type="button" className="text-sm text-primary hover:underline" onClick={onBack}>
            ← Back to Transfers
          </button>
          <h1 className="mt-2 text-2xl font-semibold">{transfer.reference}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Posting date {transfer.posting_date} · Base currency {transfer.base_currency}
          </p>
        </div>
        <Badge
          variant={transfer.state === "posted" ? "default" : transfer.state === "rejected" ? "destructive" : "outline"}
        >
          {bankTransferStateLabel(transfer.state)}
        </Badge>
      </header>
      {error ? <Notice title="Action could not be completed" detail={error} destructive /> : null}
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-4">
        <Fact
          label="Source total"
          value={transfer.source_totals.map((item) => `${item.currency} ${item.amount}`).join(" · ")}
        />
        <Fact label="Base total" value={`${transfer.base_currency} ${transfer.base_total}`} />
        <Fact label="Value date" value={transfer.value_date ?? "Not specified"} />
        <Fact label="Journal" value={transfer.journal_entry_number ?? "Not posted"} />
        <Fact label="Project" value={transfer.project_name ?? "Not selected"} />
        <Fact label="Location / City" value={transfer.location_name ?? "Not selected"} />
        <Fact label="Assigned approver" value={transfer.approver_name ?? "Legacy independent checker queue"} />
        <Fact
          label="Decision authority"
          value={
            transfer.assigned_decision_allowed
              ? "Assigned checker"
              : transfer.delegated_self_approval_allowed
                ? "Delegated self-approval"
                : "Independent approval required"
          }
        />
      </section>
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Transfer lines</h2>
          <p className="text-sm text-muted-foreground">Resolved Bank controls and governed currency-rate evidence.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full text-sm">
            <thead className="bg-sky-500 text-left text-white">
              <tr>
                {[
                  "Date",
                  "From Bank",
                  "Ref. No.",
                  "Mode",
                  "To Bank",
                  "Details",
                  "Source",
                  "Destination",
                  "FX difference",
                ].map((item) => (
                  <th key={item} className="px-3 py-3 font-semibold">
                    {item}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {transfer.lines.map((line) => (
                <tr key={line.id} className="border-t border-border">
                  <td className="px-3 py-3">{line.document_date}</td>
                  <td className="px-3 py-3">
                    <strong>{line.from_control_account_code}</strong>
                    <br />
                    <span className="text-xs text-muted-foreground">{line.from_control_account_name}</span>
                  </td>
                  <td className="px-3 py-3">{line.external_reference ?? "—"}</td>
                  <td className="px-3 py-3">{line.transfer_mode.replaceAll("_", " ")}</td>
                  <td className="px-3 py-3">
                    <strong>{line.to_control_account_code}</strong>
                    <br />
                    <span className="text-xs text-muted-foreground">{line.to_control_account_name}</span>
                  </td>
                  <td className="max-w-72 px-3 py-3">{line.details ?? "—"}</td>
                  <td className="px-3 py-3">
                    {line.source_currency} {line.source_amount}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      Rate {line.source_rate} · {line.source_rate_effective_date ?? "base"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {line.destination_currency} {line.destination_amount}
                    <br />
                    <span className="text-xs text-muted-foreground">
                      Rate {line.destination_rate} · {line.destination_rate_effective_date ?? "base"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    {transfer.base_currency} {line.fx_difference}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Accounting preview</h2>
          <div className="mt-3 space-y-2">
            {transfer.accounting_preview.lines.map((line) => (
              <div
                key={`${line.transfer_line_id}-${line.line_order}`}
                className="grid grid-cols-[1fr_auto] gap-3 rounded-md bg-muted/35 p-3 text-sm"
              >
                <span>
                  {line.account_code} · {line.account_name}
                  <br />
                  <small className="text-muted-foreground">
                    {line.role.replaceAll("_", " ")} · {line.side}
                  </small>
                </span>
                <strong>
                  {transfer.base_currency} {line.base_amount}
                </strong>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold">Audit timeline</h2>
          <ol className="mt-3 space-y-3">
            {transfer.timeline.map((event) => (
              <li key={event.id} className="border-l-2 border-primary/30 pl-3 text-sm">
                <strong>{event.action.replaceAll("_", " ")}</strong>
                <p className="text-muted-foreground">
                  {event.actor_label} · {new Date(event.occurred_at).toLocaleString()}
                </p>
                {event.reason ? <p>{event.reason}</p> : null}
              </li>
            ))}
          </ol>
        </div>
      </section>
      <BankApproverReassignment
        transaction="transfers"
        record={transfer}
        disabled={Boolean(busy)}
        onBusyChange={(next) => setBusy(next ? "reassign" : null)}
        onUpdated={load}
      />
      {canApproveAndClose && transfer.super_admin_override_allowed ? (
        <SuperAdminOverrideWarning reasonRequired={false} />
      ) : null}
      {transfer.state === "submitted" || transfer.state === "posted" ? (
        <label className="grid gap-1.5 rounded-lg border border-border bg-card p-4 text-sm font-medium">
          Reason {transfer.state === "submitted" ? "(required for rejection only)" : "(required for reversal)"}
          <Textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} />
        </label>
      ) : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Back
        </Button>
        <div className="flex flex-wrap gap-2">
          {(transfer.state === "draft" || transfer.state === "rejected") &&
          permissions.has("banking.transfer.update") ? (
            <Button type="button" variant="outline" onClick={() => onEdit(transfer.id)}>
              Edit
            </Button>
          ) : null}
          {transfer.state === "draft" && permissions.has("banking.transfer.submit") ? (
            <Button type="button" disabled={Boolean(busy)} onClick={() => void act("submit")}>
              Submit
            </Button>
          ) : null}
          {transfer.state === "submitted" && permissions.has("banking.transfer.approve") ? (
            <>
              <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => void act("reject")}>
                Reject
              </Button>
              <Button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => void act("approve", canApproveAndClose)}
              >
                {canApproveAndClose ? "Approve & Close" : "Approve"}
              </Button>
            </>
          ) : null}
          {transfer.state === "approved" && permissions.has("banking.transfer.post") ? (
            <Button type="button" disabled={Boolean(busy)} onClick={() => void act("post")}>
              Post Transfer
            </Button>
          ) : null}
          {transfer.state === "posted" && permissions.has("banking.transfer.reverse") ? (
            <Button type="button" variant="destructive" disabled={Boolean(busy)} onClick={() => void act("reverse")}>
              Reverse
            </Button>
          ) : null}
        </div>
      </footer>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
function Notice({ title, detail, destructive = false }: { title: string; detail: string; destructive?: boolean }) {
  return (
    <Alert variant={destructive ? "destructive" : "default"}>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
