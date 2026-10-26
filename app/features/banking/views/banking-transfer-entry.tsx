"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BankTransferDetail,
  BankTransferMode,
  BankTransferOptions,
  BankingCompanyDirectory,
  CreateBankTransferRequest,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { BankingApiClient } from "../api/banking-client";
import { BankEntryActions } from "../components/bank-entry-actions";
import {
  BankWorkflowControls,
  emptyBankWorkflowSelection,
  type BankWorkflowSelection,
} from "../components/bank-workflow-controls";
import { bankTransferStateLabel } from "../model/bank-transfer-status";

type BankOption = BankTransferOptions["bank_accounts"][number];

interface EditableLine {
  id: string;
  date: string;
  fromBankId: string;
  reference: string;
  mode: BankTransferMode;
  toBankId: string;
  details: string;
  amount: string;
  bankCharge: string;
  chargeExpanded: boolean;
}

type MutationAction = "create" | "update" | "submit" | "approve";

export interface BankingTransferEntryProps {
  transferId?: string;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onOpen: (transferId: string) => void;
}

const modes: ReadonlyArray<{ value: BankTransferMode; label: string }> = [
  { value: "internal", label: "Internal" },
  { value: "local_bank", label: "Local bank" },
  { value: "wire_swift", label: "Wire / SWIFT" },
  { value: "standing_order", label: "Standing order" },
];

const amountPattern = /^(0|[1-9]\d{0,29})(?:\.\d{1,8})?$/;

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function emptyLine(date = today()): EditableLine {
  return {
    id: crypto.randomUUID(),
    date,
    fromBankId: "",
    reference: "",
    mode: "internal",
    toBankId: "",
    details: "",
    amount: "",
    bankCharge: "0",
    chargeExpanded: false,
  };
}

function message(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The Bank Transfer request could not be completed. Check the API connection and try again.";
}

function accountLabel(account: BankOption) {
  return `${account.account_name} · ${account.currency} · ${account.account_number_masked ?? account.reference}`;
}

function toEditable(detail: BankTransferDetail): EditableLine[] {
  return detail.lines.map((line) => ({
    id: line.id,
    date: line.document_date,
    fromBankId: line.from_bank_account_id,
    reference: line.external_reference ?? "",
    mode: line.transfer_mode,
    toBankId: line.to_bank_account_id,
    details: line.details ?? "",
    amount: line.source_amount,
    bankCharge: line.bank_charge_amount,
    chargeExpanded: Number(line.bank_charge_amount) > 0,
  }));
}

function sameDecimal(left: string, right: string) {
  const leftValue = Number(left);
  const rightValue = Number(right);
  return Number.isFinite(leftValue) && Number.isFinite(rightValue) && leftValue === rightValue;
}

export function BankingTransferEntry({ transferId, onBack, onDirtyChange, onOpen }: BankingTransferEntryProps) {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const canCreate = permissions.has("banking.transfer.create");
  const canUpdate = permissions.has("banking.transfer.update");
  const canSubmit = permissions.has("banking.transfer.submit");
  const canApprove = permissions.has("banking.transfer.approve");
  const readOnly = Boolean(session?.impersonation);
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [accounts, setAccounts] = useState<BankOption[]>([]);
  const [postingDate, setPostingDate] = useState(today());
  const [valueDate, setValueDate] = useState("");
  const [lines, setLines] = useState<EditableLine[]>([emptyLine()]);
  const [detail, setDetail] = useState<BankTransferDetail | null>(null);
  const [workflow, setWorkflow] = useState<BankWorkflowSelection>(emptyBankWorkflowSelection);
  const [selectedSelfApproval, setSelectedSelfApproval] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const retries = useRef<Partial<Record<MutationAction, { fingerprint: string; key: string }>>>({});
  const globalApproval =
    Boolean(session?.user.roles.includes("super_administrator")) &&
    permissions.has("platform.approval.override");
  const canApproveAndClose =
    canApprove &&
    canSubmit &&
    workflow.approver_user_id === session?.user.id &&
    (globalApproval || selectedSelfApproval);

  function markDirty() {
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    if (sessionLoading || !session) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      Promise.all([client.companies(), transferId ? client.transfer(transferId) : Promise.resolve(null)])
        .then(async ([companyResult, persisted]) => {
          if (!active) return;
          setCompanies(companyResult.items);
          const selectedCompany = persisted?.company_id ?? companyResult.items[0]?.id ?? "";
          setCompanyId(selectedCompany);
          if (persisted) {
            setDetail(persisted);
            setPostingDate(persisted.posting_date);
            setValueDate(persisted.value_date ?? "");
            setLines(toEditable(persisted));
            setWorkflow({
              project_id: persisted.project_id ?? "",
              location_id: persisted.location_id ?? "",
              approver_user_id: persisted.approver_user_id ?? "",
            });
          }
          if (selectedCompany) {
            const options = await client.transferOptions({ company_id: selectedCompany });
            if (active) setAccounts(options.bank_accounts);
          }
        })
        .catch((caught) => active && setError(message(caught)))
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [client, session, sessionLoading, transferId]);

  async function changeCompany(next: string) {
    setCompanyId(next);
    setAccounts([]);
    setLines([emptyLine(postingDate)]);
    setWorkflow(emptyBankWorkflowSelection);
    markDirty();
    try {
      setAccounts((await client.transferOptions({ company_id: next })).bank_accounts);
    } catch (caught) {
      setError(message(caught));
    }
  }

  function changeLine(id: string, patch: Partial<EditableLine>) {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    markDirty();
  }

  function payload(): CreateBankTransferRequest | null {
    setError("");
    if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
      setError("Company and a valid posting date are required.");
      return null;
    }
    for (const [index, line] of lines.entries()) {
      if (!line.fromBankId || !line.toBankId || line.fromBankId === line.toBankId) {
        setError(`Line ${index + 1}: select two different Bank Accounts.`);
        return null;
      }
      if (!amountPattern.test(line.amount) || Number(line.amount) <= 0) {
        setError(`Line ${index + 1}: enter a positive amount with at most 8 decimal places.`);
        return null;
      }
      if (line.bankCharge && (!amountPattern.test(line.bankCharge) || Number(line.bankCharge) < 0)) {
        setError(`Line ${index + 1}: bank charge must be zero or a positive amount.`);
        return null;
      }
    }
    return {
      company_id: companyId,
      posting_date: postingDate,
      value_date: valueDate || null,
      lines: lines.map((line, index) => ({
        line_order: index + 1,
        document_date: line.date,
        from_bank_account_id: line.fromBankId,
        external_reference: line.reference.trim() || null,
        transfer_mode: line.mode,
        to_bank_account_id: line.toBankId,
        details: line.details.trim() || null,
        source_amount: line.amount,
        bank_charge_amount: line.bankCharge || "0",
      })),
      project_id: workflow.project_id || null,
      location_id: workflow.location_id || null,
      approver_user_id: workflow.approver_user_id || null,
    };
  }

  function idempotency(action: MutationAction, value: unknown) {
    const fingerprint = `${action}:${JSON.stringify(value)}`;
    const current = retries.current[action];
    if (current?.fingerprint === fingerprint) return current.key;
    const next = { fingerprint, key: `web-bank-transfer-${action}-${crypto.randomUUID()}` };
    retries.current[action] = next;
    return next.key;
  }

  async function save(submitAfter = false, approveAndClose = false) {
    const input = payload();
    if (!input) return;
    if (submitAfter && !workflow.approver_user_id) {
      setError("Select an eligible approver before submitting the Bank Transfer.");
      return;
    }
    if (approveAndClose && !canApproveAndClose) return;
    setBusy(true);
    let submittedId = "";
    try {
      const editableInput = {
        posting_date: input.posting_date,
        value_date: input.value_date,
        lines: input.lines,
        project_id: input.project_id,
        location_id: input.location_id,
        approver_user_id: input.approver_user_id,
      };
      const saved = detail
        ? await client.updateTransfer(
            detail.id,
            { ...editableInput, expected_version: detail.version },
            csrfToken(),
            idempotency("update", input),
          )
        : await client.createTransfer(input, csrfToken(), idempotency("create", input));
      let result = saved;
      if (submitAfter) {
        result = await client.submitTransfer(
          saved.id,
          { expected_version: saved.version },
          csrfToken(),
          idempotency("submit", { id: saved.id, version: saved.version }),
        );
        submittedId = result.id;
      }
      setDirty(false);
      onDirtyChange?.(false);
      if (approveAndClose) {
        const authoritative = await client.transfer(result.id);
        if (
          authoritative.state !== "submitted" ||
          authoritative.approver_user_id !== session?.user.id ||
          (!authoritative.super_admin_override_allowed && !authoritative.delegated_self_approval_allowed)
        ) {
          setError(
            "The Transfer was submitted, but approval is not available to this session. Open its detail with an authorized approver.",
          );
          onOpen(result.id);
          return;
        }
        const approved = await client.decideTransfer(
          result.id,
          { action: "approve", expected_version: authoritative.version },
          csrfToken(),
          idempotency("approve", { id: result.id, version: authoritative.version }),
        );
        notify(`Bank Transfer ${approved.reference} approved. Posting remains a separate controlled action.`);
        onBack();
        return;
      }
      notify(
        submitAfter
          ? `Bank Transfer ${result.reference} submitted for approval.`
          : `Bank Transfer ${result.reference} saved.`,
      );
      onOpen(result.id);
    } catch (caught) {
      setError(message(caught));
      if (approveAndClose && submittedId) onOpen(submittedId);
    } finally {
      setBusy(false);
    }
  }

  const editable = !readOnly && (!detail || detail.state === "draft" || detail.state === "rejected");
  const groupedTotals = lines.reduce<Map<string, number>>((totals, line) => {
    const currency = accounts.find((account) => account.id === line.fromBankId)?.currency;
    if (!currency || !amountPattern.test(line.amount)) return totals;
    totals.set(currency, (totals.get(currency) ?? 0) + Number(line.amount));
    return totals;
  }, new Map());
  const formatAmount = (amount: number) =>
    amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 8 });

  if (sessionLoading || loading)
    return <TransferState title="Loading Bank Transfer" detail="Loading live companies, Bank Accounts and controls." />;
  if (!session) return <TransferState title="Sign in required" detail="An authenticated session is required." />;
  if (!canCreate && !transferId)
    return <TransferState title="Permission required" detail="banking.transfer.create is required." />;

  return (
    <div className="space-y-5" aria-busy={busy}>
      <header className="border-b border-border pb-4">
        <p className="text-sm text-muted-foreground">Home / Transfers / {detail ? detail.reference : "Add Transfer"}</p>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{detail ? "Edit Transfer" : "Add Transfer"}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Move funds between Bank Accounts owned by the same company.
            </p>
          </div>
          {detail ? <Badge variant="outline">{bankTransferStateLabel(detail.state)}</Badge> : null}
        </div>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Bank Transfer could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-4 rounded-lg border border-border bg-card p-4 sm:grid-cols-3">
        <label htmlFor="transfer-company" className="grid gap-1.5 text-sm font-medium">
          Company *
          <select
            id="transfer-company"
            className="h-10 rounded-md border border-input bg-background px-3"
            value={companyId}
            disabled={!editable || Boolean(detail)}
            onChange={(event) => void changeCompany(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.code} · {company.name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor="transfer-posting-date" className="grid gap-1.5 text-sm font-medium">
          Posting date *
          <Input
            id="transfer-posting-date"
            type="date"
            value={postingDate}
            disabled={!editable}
            onChange={(event) => {
              setPostingDate(event.target.value);
              markDirty();
            }}
          />
        </label>
        <label htmlFor="transfer-value-date" className="grid gap-1.5 text-sm font-medium">
          Value date
          <Input
            id="transfer-value-date"
            type="date"
            value={valueDate}
            disabled={!editable}
            onChange={(event) => {
              setValueDate(event.target.value);
              markDirty();
            }}
          />
        </label>
      </section>

      <BankWorkflowControls
        onSelfApprovalChange={setSelectedSelfApproval}
        transaction="transfers"
        company={companyId}
        value={workflow}
        disabled={!editable || busy}
        onChange={(next) => {
          setWorkflow(next);
          markDirty();
        }}
      />

      <section
        className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
        aria-label="Transfer lines"
      >
        <div className="overflow-x-auto">
          <table className="min-w-[1180px] w-full border-collapse text-sm">
            <thead className="bg-sky-500 text-left text-white">
              <tr>
                {["Date *", "From Bank *", "Ref. No.", "Mode", "To Bank *", "Details", "Amount *", ""].map(
                  (heading) => (
                    <th key={heading} className="border-r border-white/50 px-3 py-3 font-semibold last:border-r-0">
                      {heading}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const source = accounts.find((account) => account.id === line.fromBankId);
                const destination = accounts.find((account) => account.id === line.toBankId);
                const persistedLine = detail?.lines.find((candidate) => candidate.id === line.id);
                const evidenceIsCurrent = Boolean(
                  persistedLine &&
                  persistedLine.document_date === line.date &&
                  persistedLine.from_bank_account_id === line.fromBankId &&
                  persistedLine.to_bank_account_id === line.toBankId &&
                  sameDecimal(persistedLine.source_amount, line.amount),
                );
                const crossCurrency = Boolean(source && destination && source.currency !== destination.currency);
                return (
                  <tr key={line.id} className="border-b border-border align-top last:border-b-0">
                    <td className="p-2">
                      <Input
                        className="min-w-36"
                        type="date"
                        value={line.date}
                        disabled={!editable}
                        onChange={(event) => changeLine(line.id, { date: event.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <div className="min-w-64">
                        <SearchableSelect
                          label="From Bank"
                          value={line.fromBankId}
                          disabled={!editable}
                          required
                          placeholder="Select source Bank"
                          options={accounts.map((account) => ({ value: account.id, label: accountLabel(account) }))}
                          onValueChange={(value) =>
                            changeLine(line.id, {
                              fromBankId: value,
                              toBankId: value === line.toBankId ? "" : line.toBankId,
                            })
                          }
                        />
                      </div>
                      {source ? (
                        <p className="mt-1 max-w-56 text-xs text-muted-foreground">
                          Control: {source.ledger_account_code} · {source.ledger_account_name}
                        </p>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <Input
                        className="min-w-36"
                        value={line.reference}
                        disabled={!editable}
                        maxLength={128}
                        onChange={(event) => changeLine(line.id, { reference: event.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <select
                        aria-label="Transfer mode"
                        className="h-10 min-w-40 rounded-md border border-input bg-background px-2"
                        value={line.mode}
                        disabled={!editable}
                        onChange={(event) => changeLine(line.id, { mode: event.target.value as BankTransferMode })}
                      >
                        {modes.map((mode) => (
                          <option key={mode.value} value={mode.value}>
                            {mode.label}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="p-2">
                      <div className="min-w-64">
                        <SearchableSelect
                          label="To Bank"
                          value={line.toBankId}
                          disabled={!editable}
                          required
                          placeholder="Select destination Bank"
                          options={accounts.map((account) => ({
                            value: account.id,
                            label: accountLabel(account),
                            disabled: account.id === line.fromBankId,
                          }))}
                          onValueChange={(value) => changeLine(line.id, { toBankId: value })}
                        />
                      </div>
                    </td>
                    <td className="p-2">
                      <Textarea
                        aria-label="Details"
                        className="min-h-10 min-w-64 resize-y"
                        value={line.details}
                        disabled={!editable}
                        maxLength={500}
                        rows={2}
                        placeholder="Transfer details (optional)"
                        onChange={(event) => changeLine(line.id, { details: event.target.value })}
                      />
                    </td>
                    <td className="p-2">
                      <div className="flex min-w-40 items-center gap-2">
                        <span className="text-xs font-semibold text-muted-foreground">{source?.currency ?? "—"}</span>
                        <Input
                          aria-label="Amount"
                          inputMode="decimal"
                          className="text-right"
                          value={line.amount}
                          disabled={!editable}
                          onChange={(event) => changeLine(line.id, { amount: event.target.value })}
                        />
                      </div>
                      {crossCurrency ? (
                        <p className="mt-2 min-w-56 text-xs text-muted-foreground">
                          {persistedLine && evidenceIsCurrent
                            ? `${persistedLine.destination_currency} ${persistedLine.destination_amount} · Rate ${persistedLine.destination_rate} · ${persistedLine.destination_rate_effective_date ?? "base rate"}`
                            : "Save the draft to calculate and lock the destination amount and exchange-rate evidence."}
                        </p>
                      ) : null}
                      {line.chargeExpanded ? (
                        <div className="mt-3 rounded-md border border-border bg-muted/30 p-2">
                          <label className="grid gap-1 text-xs font-medium">
                            Optional bank charge ({source?.currency ?? "source currency"})
                            <Input
                              aria-label="Bank charge"
                              inputMode="decimal"
                              className="text-right"
                              value={line.bankCharge}
                              disabled={!editable}
                              onChange={(event) => changeLine(line.id, { bankCharge: event.target.value })}
                            />
                          </label>
                          {editable ? (
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="mt-1 h-auto px-0 py-1 text-xs"
                              onClick={() => changeLine(line.id, { bankCharge: "0", chargeExpanded: false })}
                            >
                              Remove charge
                            </Button>
                          ) : null}
                        </div>
                      ) : editable ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="mt-1 h-auto px-0 py-1 text-xs"
                          onClick={() => changeLine(line.id, { chargeExpanded: true })}
                        >
                          + Add bank charge
                        </Button>
                      ) : null}
                    </td>
                    <td className="p-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!editable || lines.length === 1}
                        aria-label="Delete transfer line"
                        onClick={() => {
                          setLines((current) => current.filter((candidate) => candidate.id !== line.id));
                          markDirty();
                        }}
                      >
                        Delete
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td colSpan={6} className="px-3 py-3">
                  Total
                </td>
                <td className="px-3 py-3 text-right">
                  {groupedTotals.size === 0
                    ? "0.00"
                    : [...groupedTotals.entries()]
                        .sort(([left], [right]) => left.localeCompare(right))
                        .map(([currency, amount]) => `${currency} ${formatAmount(amount)}`)
                        .join(" · ")}
                  {groupedTotals.size > 1 && detail ? (
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      Base {detail.accounting_preview.base_currency} {detail.accounting_preview.debit_total}
                    </span>
                  ) : null}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="border-t border-border p-4">
          <Button
            type="button"
            variant="outline"
            disabled={!editable || lines.length >= 200}
            onClick={() => {
              setLines((current) => [...current, emptyLine(postingDate)]);
              markDirty();
            }}
          >
            + Add More
          </Button>
        </div>
      </section>

      {canApproveAndClose && globalApproval && !readOnly ? <SuperAdminOverrideWarning reasonRequired={false} /> : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        {editable ? (
          <BankEntryActions
            busy={busy}
            saveDisabled={readOnly || (detail ? !canUpdate : !canCreate)}
            submitDisabled={readOnly || !canSubmit || (detail ? !canUpdate : !canCreate)}
            showApproval={canApproveAndClose && !readOnly}
            approveDisabled={readOnly || !canApproveAndClose || (detail ? !canUpdate : !canCreate)}
            onSave={() => void save(false)}
            onSubmit={() => void save(true)}
            onApprove={() => void save(true, true)}
          />
        ) : null}
      </footer>
      {dirty ? (
        <p className="sr-only" role="status">
          Bank Transfer has unsaved changes.
        </p>
      ) : null}
    </div>
  );
}

function TransferState({ title, detail }: { title: string; detail: string }) {
  return (
    <Alert>
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{detail}</AlertDescription>
    </Alert>
  );
}
