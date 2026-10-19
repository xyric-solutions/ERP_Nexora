"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BankReceiptDetail, DecideBankReceiptRequest } from "@nexora/contracts";
import {
  ArrowLeft,
  CheckCircle2,
  CircleDollarSign,
  FileClock,
  Landmark,
  PencilLine,
  Printer,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { BankingApiClient } from "../api/banking-client";

type ReceiptAction = "submit" | "approve" | "reject" | "post" | "reverse";
type Confirmation = "post" | "reverse" | null;
type LoadFailure = { kind: "denied" | "not-found" | "error"; message: string };

interface RetryAttempt {
  fingerprint: string;
  key: string;
}

export interface BankingReceiptDetailProps {
  receiptId: string;
  onBack: () => void;
  onEdit: (receiptId: string) => void;
}

const stateLabels: Record<BankReceiptDetail["state"], string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  posted: "Posted",
  reversed: "Reversed",
};

const stateStyles: Record<BankReceiptDetail["state"], string> = {
  draft: "border-slate-300 bg-slate-100 text-slate-700",
  submitted: "border-amber-300 bg-amber-50 text-amber-800",
  approved: "border-sky-300 bg-sky-50 text-sky-800",
  rejected: "border-rose-300 bg-rose-50 text-rose-800",
  posted: "border-emerald-300 bg-emerald-50 text-emerald-800",
  reversed: "border-violet-300 bg-violet-50 text-violet-800",
};

const receiptMethodLabels: Record<BankReceiptDetail["lines"][number]["receipt_method"], string> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  cash: "Cash",
  online: "Online",
  direct_debit: "Direct debit",
  card: "Card",
};

function exactAmount(value: string, currency: string): string {
  const [integer = "0", rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "").padEnd(2, "0");
  return `${currency} ${integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

function displayDate(value: string | null): string {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeZone: "UTC" }).format(
    new Date(`${value.slice(0, 10)}T00:00:00.000Z`),
  );
}

function displayDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function maskedReference(value: string | null): string {
  if (!value) return "Not recorded";
  return `•••• ${value.slice(-8)}`;
}

function errorMessage(error: unknown): string {
  if (error instanceof ApiError)
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  return "The Banking API request could not be completed.";
}

function loadFailure(error: unknown): LoadFailure {
  const suffix = error instanceof ApiError && error.correlationId ? ` Reference: ${error.correlationId}` : "";
  if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
    return {
      kind: "denied",
      message: `The API denied access to this company-scoped Bank Receipt.${suffix}`,
    };
  }
  if (error instanceof ApiError && error.status === 404)
    return { kind: "not-found", message: "This Bank Receipt was not found within your permitted company scope." };
  return { kind: "error", message: errorMessage(error) };
}

function isVersionConflict(error: unknown): boolean {
  return (
    error instanceof ApiError &&
    error.status === 409 &&
    (error.code === "RECEIPT_VERSION_CONFLICT" || error.code === "RECEIPT_CONFLICT")
  );
}

export function BankingReceiptDetail({ receiptId, onBack, onEdit }: BankingReceiptDetailProps) {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canRead = permissions.has("banking.receipt.read");
  const [receipt, setReceipt] = useState<BankReceiptDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<ReceiptAction | null>(null);
  const [failure, setFailure] = useState<LoadFailure | null>(null);
  const [actionError, setActionError] = useState("");
  const [conflict, setConflict] = useState("");
  const [success, setSuccess] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [reversalReason, setReversalReason] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation>(null);
  const attempts = useRef<Partial<Record<ReceiptAction, RetryAttempt>>>({});

  const load = useCallback(async () => {
    if (!receiptId || !session || !canRead) {
      setLoading(false);
      return false;
    }
    setLoading(true);
    setFailure(null);
    try {
      setReceipt(await client.receipt(receiptId));
      return true;
    } catch (error) {
      setReceipt(null);
      setFailure(loadFailure(error));
      return false;
    } finally {
      setLoading(false);
    }
  }, [canRead, client, receiptId, session]);

  useEffect(() => {
    if (sessionLoading) return;
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load, sessionLoading]);

  function keyFor(action: ReceiptAction, fingerprint: string): string {
    const current = attempts.current[action];
    if (current?.fingerprint === fingerprint) return current.key;
    const next = { fingerprint, key: `web-bank-receipt-${action}-${crypto.randomUUID()}` };
    attempts.current[action] = next;
    return next.key;
  }

  async function mutate(
    action: ReceiptAction,
    fingerprint: string,
    operation: (idempotencyKey: string) => Promise<unknown>,
    message: string,
  ) {
    setBusy(action);
    setActionError("");
    setConflict("");
    setSuccess("");
    try {
      await operation(keyFor(action, fingerprint));
      delete attempts.current[action];
      setConfirmation(null);
      setDecisionReason("");
      setReversalReason("");
      setSuccess(message);
      await load();
    } catch (error) {
      if (isVersionConflict(error)) {
        setConflict("This receipt changed in another session. The latest persisted version has been reloaded.");
        await load();
      } else {
        setActionError(errorMessage(error));
      }
    } finally {
      setBusy(null);
    }
  }

  function submit() {
    if (!receipt) return;
    const fingerprint = JSON.stringify({ id: receipt.id, version: receipt.version });
    void mutate(
      "submit",
      fingerprint,
      (key) => client.submitReceipt(receipt.id, { expected_version: receipt.version }, csrfToken(), key),
      `${receipt.reference} was submitted for independent approval.`,
    );
  }

  function decide(action: "approve" | "reject") {
    if (!receipt) return;
    const reason = decisionReason.trim();
    const input: DecideBankReceiptRequest = {
      action,
      expected_version: receipt.version,
      ...(reason ? { reason } : {}),
    };
    const fingerprint = JSON.stringify({ id: receipt.id, ...input });
    void mutate(
      action,
      fingerprint,
      (key) => client.decideReceipt(receipt.id, input, csrfToken(), key),
      `${receipt.reference} was ${action === "approve" ? "approved" : "rejected"}.`,
    );
  }

  function post() {
    if (!receipt) return;
    const fingerprint = JSON.stringify({ id: receipt.id, version: receipt.version });
    void mutate(
      "post",
      fingerprint,
      (key) => client.postReceipt(receipt.id, { expected_version: receipt.version }, csrfToken(), key),
      `${receipt.reference} was posted to Finance.`,
    );
  }

  function reverse() {
    if (!receipt) return;
    const reason = reversalReason.trim();
    const fingerprint = JSON.stringify({ id: receipt.id, version: receipt.version, reason });
    void mutate(
      "reverse",
      fingerprint,
      (key) => client.reverseReceipt(receipt.id, { expected_version: receipt.version, reason }, csrfToken(), key),
      `${receipt.reference} was reversed through a compensating Finance entry.`,
    );
  }

  if (sessionLoading || (loading && !receipt))
    return (
      <DetailState title="Loading Bank Receipt" detail="Retrieving the persisted transaction and authority." busy />
    );
  if (!session)
    return <DetailState title="Sign in required" detail="A valid Nexora session is required to view Bank Receipts." />;
  if (!canRead)
    return <DetailState title="Permission denied" detail="Your session does not include banking.receipt.read." />;
  if (!receiptId)
    return <DetailState title="Receipt not selected" detail="Open a persisted Bank Receipt from the live directory." />;
  if (!receipt && failure)
    return (
      <DetailState
        title={
          failure.kind === "denied"
            ? "Permission denied"
            : failure.kind === "not-found"
              ? "Bank Receipt not found"
              : "Bank Receipt unavailable"
        }
        detail={failure.message}
        onRetry={failure.kind === "error" ? () => void load() : undefined}
      />
    );
  if (!receipt)
    return <DetailState title="Bank Receipt unavailable" detail="The persisted transaction could not be loaded." />;

  const impersonating = session.impersonation !== undefined;
  const canEdit = !impersonating && receipt.state === "draft" && permissions.has("banking.receipt.update");
  const canSubmit = !impersonating && receipt.state === "draft" && permissions.has("banking.receipt.submit");
  const canDecide = !impersonating && receipt.state === "submitted" && permissions.has("banking.receipt.approve");
  const canPost = !impersonating && receipt.state === "approved" && permissions.has("banking.receipt.post");
  const canReverse = !impersonating && receipt.state === "posted" && permissions.has("banking.receipt.reverse");
  const makerDecision = receipt.state === "submitted" && receipt.self_decision_requires_override;
  const overrideAllowed = makerDecision && receipt.super_admin_override_allowed;
  const independentCheckerRequired = makerDecision && !overrideAllowed;
  const decisionReasonRequired = overrideAllowed;
  const mutationBusy = busy !== null;
  const afterPosting = receipt.state === "posted" || receipt.state === "reversed";

  return (
    <section className="space-y-5" aria-busy={mutationBusy || loading}>
      <header className="overflow-hidden rounded-2xl border border-slate-200 bg-[linear-gradient(135deg,rgba(15,42,66,0.98),rgba(24,64,91,0.94))] text-white shadow-sm">
        <div className="grid gap-6 px-5 py-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:px-7">
          <div className="min-w-0">
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="border-white/35 bg-white/10 text-white hover:bg-white/20 hover:text-white"
                onClick={onBack}
              >
                <ArrowLeft aria-hidden="true" />
                Bank Receipts
              </Button>
              <Badge className={`border ${stateStyles[receipt.state]}`} variant="outline">
                {stateLabels[receipt.state]}
              </Badge>
              <span className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-100">Persisted receipt</span>
            </div>
            <p className="text-sm text-sky-100">Banking &amp; Treasury / Transaction detail</p>
            <h1 className="mt-1 truncate font-serif text-3xl font-semibold tracking-tight sm:text-4xl">
              {receipt.reference}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-200">
              {receipt.lines[0]?.narration ?? "Governed Bank Receipt"} · version {receipt.version}
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-2 lg:max-w-md lg:justify-end">
            {canEdit ? (
              <Button type="button" variant="secondary" disabled={mutationBusy} onClick={() => onEdit(receipt.id)}>
                <PencilLine aria-hidden="true" />
                Edit draft
              </Button>
            ) : null}
            {canSubmit ? (
              <Button type="button" disabled={mutationBusy} onClick={submit}>
                <Send aria-hidden="true" />
                {busy === "submit" ? "Submitting…" : "Submit"}
              </Button>
            ) : null}
            <Button type="button" variant="outline" disabled aria-describedby="receipt-print-unavailable">
              <Printer aria-hidden="true" />
              Print unavailable
            </Button>
            <span id="receipt-print-unavailable" className="sr-only">
              Printing is unavailable until a governed print endpoint is implemented.
            </span>
          </div>
        </div>
      </header>

      {impersonating ? (
        <Alert>
          <ShieldCheck aria-hidden="true" />
          <AlertTitle>Read-only impersonation session</AlertTitle>
          <AlertDescription>
            Bank Receipt lifecycle actions are unavailable while impersonating another user.
          </AlertDescription>
        </Alert>
      ) : null}
      {actionError ? (
        <Alert variant="destructive">
          <XCircle aria-hidden="true" />
          <AlertTitle>Action not completed</AlertTitle>
          <AlertDescription>{actionError} You can retry the same action safely.</AlertDescription>
        </Alert>
      ) : null}
      {conflict ? (
        <Alert variant="destructive">
          <RefreshCw aria-hidden="true" />
          <AlertTitle>Version conflict</AlertTitle>
          <AlertDescription>{conflict}</AlertDescription>
        </Alert>
      ) : null}
      {success ? (
        <Alert>
          <CheckCircle2 aria-hidden="true" />
          <AlertTitle>Lifecycle updated</AlertTitle>
          <AlertDescription>{success}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 font-serif text-xl">
                <Landmark className="size-5 text-sky-700" aria-hidden="true" />
                Receipt particulars
              </CardTitle>
              <CardDescription>Server-authoritative header and masked Bank Account identity.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
                <Datum label="Bank" value={receipt.bank_name} />
                <Datum label="Bank Account" value={`${receipt.bank_account_name} · ${receipt.account_number_masked}`} />
                <Datum label="Posting date" value={displayDate(receipt.posting_date)} />
                <Datum label="Value date" value={displayDate(receipt.value_date)} />
                <Datum label="Currency" value={receipt.currency} />
                <Datum label="Base currency" value={receipt.base_currency} />
                <Datum label="Exchange rate" value={receipt.exchange_rate ?? "Base currency · 1.00"} />
                <Datum label="Persisted total" value={exactAmount(receipt.total_amount, receipt.currency)} strong />
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-border">
              <CardTitle className="font-serif text-xl">Receipt lines</CardTitle>
              <CardDescription>
                {receipt.line_count} persisted line item(s), ordered exactly as submitted.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[920px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th scope="col" className="px-4 py-3">
                        Line
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Document
                      </th>
                      <th scope="col" className="px-4 py-3">
                        References
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Method
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Received from
                      </th>
                      <th scope="col" className="px-4 py-3">
                        Narration
                      </th>
                      <th scope="col" className="px-4 py-3 text-right">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map((line) => (
                      <tr key={line.id} className="border-t border-border align-top">
                        <td className="px-4 py-4 font-medium">{line.line_order}</td>
                        <td className="px-4 py-4 whitespace-nowrap">{displayDate(line.document_date)}</td>
                        <td className="px-4 py-4">
                          <span className="block font-medium">{line.external_reference}</span>
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {line.document_reference ?? "No document reference"}
                          </span>
                        </td>
                        <td className="px-4 py-4 whitespace-nowrap">{receiptMethodLabels[line.receipt_method]}</td>
                        <td className="px-4 py-4 font-medium">{line.payer_name}</td>
                        <td className="max-w-sm px-4 py-4">
                          <span className="block">{line.narration ?? "No narration recorded"}</span>
                          {Object.keys(line.dimensions).length ? (
                            <span className="mt-1 block text-xs text-muted-foreground">
                              {Object.entries(line.dimensions)
                                .map(([key, value]) => `${key}: ${value}`)
                                .join(" · ")}
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold tabular-nums">
                          {exactAmount(line.amount, receipt.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                    <tr>
                      <th scope="row" colSpan={6} className="px-4 py-4 text-right font-semibold">
                        Persisted total
                      </th>
                      <td className="px-4 py-4 text-right text-base font-bold tabular-nums">
                        {exactAmount(receipt.total_amount, receipt.currency)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>

          {!afterPosting ? <AccountingPreview receipt={receipt} /> : <AccountingLinks receipt={receipt} />}
        </div>

        <aside className="space-y-5">
          {(canDecide || independentCheckerRequired) && receipt.state === "submitted" ? (
            <Card className="border-sky-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-xl">
                  <ShieldCheck className="size-5 text-sky-700" aria-hidden="true" />
                  Checker decision
                </CardTitle>
                <CardDescription>Approval remains separate from Finance posting.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {independentCheckerRequired ? (
                  <Alert variant="destructive">
                    <AlertTitle>Independent checker required</AlertTitle>
                    <AlertDescription>
                      You created or submitted this receipt and cannot decide it with ordinary approval authority.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <>
                    {overrideAllowed ? <SuperAdminOverrideWarning /> : null}
                    <div className="space-y-2">
                      <Label htmlFor="bank-receipt-decision-reason">
                        Decision reason {decisionReasonRequired ? "(required)" : "(optional for approval)"}
                      </Label>
                      <Textarea
                        id="bank-receipt-decision-reason"
                        maxLength={500}
                        disabled={mutationBusy}
                        value={decisionReason}
                        onChange={(event) => setDecisionReason(event.target.value)}
                      />
                      <p className="text-xs text-muted-foreground">Rejection always requires at least 3 characters.</p>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
                      <Button
                        type="button"
                        disabled={mutationBusy || (decisionReasonRequired && decisionReason.trim().length < 3)}
                        onClick={() => decide("approve")}
                      >
                        <CheckCircle2 aria-hidden="true" />
                        {busy === "approve" ? "Approving…" : "Approve"}
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={mutationBusy || decisionReason.trim().length < 3}
                        onClick={() => decide("reject")}
                      >
                        <XCircle aria-hidden="true" />
                        {busy === "reject" ? "Rejecting…" : "Reject"}
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ) : null}

          {canPost ? (
            <Card className="border-emerald-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-xl">
                  <CircleDollarSign className="size-5 text-emerald-700" aria-hidden="true" />
                  Finance posting
                </CardTitle>
                <CardDescription>Creates the governed accounting event and balanced journal.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {confirmation === "post" ? (
                  <Alert>
                    <AlertTitle>Confirm Finance posting</AlertTitle>
                    <AlertDescription>
                      This is separate from approval. Finance will revalidate period, FX rate and accounts before any
                      journal is committed.
                    </AlertDescription>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" disabled={mutationBusy} onClick={post}>
                        {busy === "post" ? "Posting…" : "Confirm post"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={mutationBusy}
                        onClick={() => setConfirmation(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <Button type="button" disabled={mutationBusy} onClick={() => setConfirmation("post")}>
                    <CircleDollarSign aria-hidden="true" />
                    Prepare posting
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : null}

          {canReverse ? (
            <Card className="border-violet-200">
              <CardHeader>
                <CardTitle className="flex items-center gap-2 font-serif text-xl">
                  <RotateCcw className="size-5 text-violet-700" aria-hidden="true" />
                  Compensating reversal
                </CardTitle>
                <CardDescription>The original journal remains immutable.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="bank-receipt-reversal-reason">Reversal reason</Label>
                  <Textarea
                    id="bank-receipt-reversal-reason"
                    maxLength={500}
                    disabled={mutationBusy}
                    value={reversalReason}
                    onChange={(event) => {
                      setReversalReason(event.target.value);
                      setConfirmation(null);
                    }}
                  />
                </div>
                {confirmation === "reverse" ? (
                  <Alert variant="destructive">
                    <AlertTitle>Confirm compensating reversal</AlertTitle>
                    <AlertDescription>
                      A new opposite journal will be posted using the server current date and an open Finance period.
                    </AlertDescription>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button type="button" variant="destructive" disabled={mutationBusy} onClick={reverse}>
                        {busy === "reverse" ? "Reversing…" : "Confirm reverse"}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={mutationBusy}
                        onClick={() => setConfirmation(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </Alert>
                ) : (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={mutationBusy || reversalReason.trim().length < 3}
                    onClick={() => setConfirmation("reverse")}
                  >
                    <RotateCcw aria-hidden="true" />
                    Review reversal
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 font-serif text-xl">
                <FileClock className="size-5 text-slate-600" aria-hidden="true" />
                Lifecycle timeline
              </CardTitle>
              <CardDescription>Persisted actors and transition evidence.</CardDescription>
            </CardHeader>
            <CardContent>
              <ol className="relative space-y-5 border-l border-slate-200 pl-5">
                {receipt.timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -left-[1.55rem] top-1 size-3 rounded-full border-2 border-white bg-sky-700 ring-1 ring-sky-200" />
                    <p className="font-semibold capitalize">{event.action}</p>
                    <p className="text-sm text-muted-foreground">
                      {event.actor_label} · {displayDateTime(event.occurred_at)}
                    </p>
                    {event.reason ? <p className="mt-1 text-sm text-slate-600">{event.reason}</p> : null}
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </aside>
      </div>
    </section>
  );
}

function AccountingPreview({ receipt }: { receipt: BankReceiptDetail }) {
  return (
    <Card className="border-amber-200 bg-amber-50/20">
      <CardHeader className="border-b border-amber-200">
        <CardTitle className="font-serif text-xl">Accounting preview</CardTitle>
        <CardDescription>No journal exists yet. Finance revalidates this projection when posting.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="bg-amber-50 text-xs uppercase tracking-wider text-amber-900/65">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Account
                </th>
                <th scope="col" className="px-4 py-3">
                  Role
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Debit
                </th>
                <th scope="col" className="px-4 py-3 text-right">
                  Credit
                </th>
              </tr>
            </thead>
            <tbody>
              {receipt.accounting_preview.lines.map((line) => (
                <tr key={`${line.line_order}-${line.account_id}`} className="border-t border-amber-100">
                  <td className="px-4 py-3">
                    <strong>{line.account_code}</strong>
                    <span className="ml-2 text-muted-foreground">{line.account_name}</span>
                  </td>
                  <td className="px-4 py-3">{line.is_bank_control ? "Bank control" : "Nominal"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {line.side === "debit" ? exactAmount(line.amount, receipt.currency) : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {line.side === "credit" ? exactAmount(line.amount, receipt.currency) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function AccountingLinks({ receipt }: { receipt: BankReceiptDetail }) {
  return (
    <Card className="border-emerald-200 bg-emerald-50/20">
      <CardHeader className="border-b border-emerald-200">
        <CardTitle className="font-serif text-xl">Recorded accounting linkage</CardTitle>
        <CardDescription>
          Actual Finance entry number with masked internal event and journal references.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5 sm:grid-cols-2">
        <div className="rounded-lg border border-emerald-200 bg-white/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-800">Original posting</p>
          <dl className="mt-3 space-y-3">
            <Datum label="Entry number" value={receipt.journal_entry_number ?? "Unavailable"} strong />
            <Datum label="Accounting event" value={maskedReference(receipt.accounting_event_id)} />
            <Datum label="Journal reference" value={maskedReference(receipt.journal_id)} />
          </dl>
        </div>
        {receipt.state === "reversed" ? (
          <div className="rounded-lg border border-violet-200 bg-white/70 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-violet-800">Compensating reversal</p>
            <dl className="mt-3 space-y-3">
              <Datum label="Entry number" value={receipt.reversal_journal_entry_number ?? "Unavailable"} strong />
              <Datum label="Accounting event" value={maskedReference(receipt.reversal_accounting_event_id)} />
              <Datum label="Journal reference" value={maskedReference(receipt.reversal_journal_id)} />
            </dl>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Datum({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-1 break-words text-sm ${strong ? "font-bold text-foreground" : "text-foreground"}`}>
        {value}
      </dd>
    </div>
  );
}

function DetailState({
  title,
  detail,
  busy = false,
  onRetry,
}: {
  title: string;
  detail: string;
  busy?: boolean;
  onRetry?: () => void;
}) {
  return (
    <div
      className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-10 text-center"
      role={busy ? "status" : "alert"}
    >
      {busy ? <RefreshCw className="mx-auto mb-4 size-6 animate-spin text-sky-700" aria-hidden="true" /> : null}
      <h2 className="font-serif text-2xl font-semibold text-slate-900">{title}</h2>
      <p className="mx-auto mt-2 max-w-xl text-sm text-slate-600">{detail}</p>
      {onRetry ? (
        <Button type="button" className="mt-5" onClick={onRetry}>
          <RefreshCw aria-hidden="true" />
          Retry
        </Button>
      ) : null}
    </div>
  );
}
