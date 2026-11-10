"use client";

import { BankEntryHeader } from "../components/bank-entry-header";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
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
import { BankFxTransferLine } from "../components/bank-fx-transfer-line";
import {
  BankWorkflowControls,
  emptyBankWorkflowSelection,
  type BankWorkflowSelection,
} from "../components/bank-workflow-controls";
import { bankTransferStateLabel } from "../model/bank-transfer-status";
import type { BankTransferEntryKind } from "../model/bank-transfer-routing";
import {
  displayTransferTotal,
  transferAmountUnits,
  transferAmountPattern as amountPattern,
  transferRatePattern as ratePattern,
  transferModes as modes,
  type EditableTransferLine as EditableLine,
} from "../model/bank-transfer-entry";

type BankOption = BankTransferOptions["bank_accounts"][number];

type MutationAction = "create" | "update" | "submit" | "approve";

export interface BankingTransferEntryProps {
  transferId?: string;
  entryKind?: BankTransferEntryKind;
  onBack: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  onConfigurePolicy?: () => void;
  onOpen: (transferId: string) => void;
}

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
    exchangeRate: "",
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
    exchangeRate: line.conversion_rate ?? "",
    bankCharge: line.bank_charge_amount,
    chargeExpanded: Number(line.bank_charge_amount) > 0,
  }));
}

function sameDecimal(left: string, right: string) {
  const canonical = (value: string) => value.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
  return canonical(left) === canonical(right);
}

export function BankingTransferEntry({
  transferId,
  entryKind,
  onBack,
  onDirtyChange,
  onConfigurePolicy,
  onOpen,
}: BankingTransferEntryProps) {
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
  const [policyConfigured, setPolicyConfigured] = useState<boolean | undefined>();
  const [optionsLoading, setOptionsLoading] = useState(false);
  const optionRequest = useRef(0);
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
  // Existing drafts retain their original currency combinations when opened for editing.
  const creationKind = transferId ? undefined : entryKind;

  function destinationMatches(source: BankOption | undefined, destination: BankOption | undefined) {
    if (!source || !destination) return false;
    return (
      !creationKind ||
      (creationKind === "fx" ? source.currency !== destination.currency : source.currency === destination.currency)
    );
  }
  const globalApproval =
    Boolean(session?.user.roles.includes("super_administrator")) && permissions.has("platform.approval.override");
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
            if (active) {
              setAccounts(options.bank_accounts);
              setPolicyConfigured(options.fx_policy_configured);
            }
          }
        })
        .catch((caught) => active && setError(message(caught)))
        .finally(() => active && setLoading(false));
    }, 0);
    return () => {
      active = false;
      optionRequest.current += 1;
      window.clearTimeout(timer);
    };
  }, [client, session, sessionLoading, transferId]);

  async function changeCompany(next: string) {
    setCompanyId(next);
    setAccounts([]);
    setPolicyConfigured(undefined);
    setLines([emptyLine(postingDate)]);
    setWorkflow(emptyBankWorkflowSelection);
    markDirty();
    await refreshOptions(next);
  }

  async function refreshOptions(selectedCompany = companyId) {
    const request = ++optionRequest.current;
    setOptionsLoading(true);
    setError("");
    try {
      const options = await client.transferOptions({ company_id: selectedCompany });
      if (request !== optionRequest.current) return;
      setAccounts(options.bank_accounts);
      setPolicyConfigured(options.fx_policy_configured);
    } catch (caught) {
      if (request === optionRequest.current) setError(message(caught));
    } finally {
      if (request === optionRequest.current) setOptionsLoading(false);
    }
  }

  function changeLine(id: string, patch: Partial<EditableLine>) {
    setLines((current) =>
      current.map((line) => {
        if (line.id !== id) return line;
        const changedPair =
          (patch.fromBankId !== undefined && patch.fromBankId !== line.fromBankId) ||
          (patch.toBankId !== undefined && patch.toBankId !== line.toBankId);
        return { ...line, ...patch, ...(changedPair ? { exchangeRate: "" } : {}) };
      }),
    );
    markDirty();
  }

  function payload(): CreateBankTransferRequest | null {
    setError("");
    if (optionsLoading || policyConfigured === false) {
      setError("Configure the selected company's Bank Transfer FX policy, then refresh setup before saving.");
      return null;
    }
    if (!companyId || !/^\d{4}-\d{2}-\d{2}$/.test(postingDate)) {
      setError("Company and a valid posting date are required.");
      return null;
    }
    for (const [index, line] of lines.entries()) {
      if (!line.fromBankId || !line.toBankId || line.fromBankId === line.toBankId) {
        setError(`Line ${index + 1}: select two different Bank Accounts.`);
        return null;
      }
      if (
        creationKind &&
        !destinationMatches(
          accounts.find((account) => account.id === line.fromBankId),
          accounts.find((account) => account.id === line.toBankId),
        )
      ) {
        setError(
          `Line ${index + 1}: ${creationKind === "fx" ? "FX Transfer requires Bank Accounts in different currencies." : "Transfer requires Bank Accounts in the same currency. Use Add New → FX Transfer for currency conversion."}`,
        );
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
      if (line.exchangeRate && (!ratePattern.test(line.exchangeRate) || !/[1-9]/.test(line.exchangeRate))) {
        setError(
          `Line ${index + 1}: enter a positive exchange rate with at most 18 decimal places, or leave it blank to use configured rates.`,
        );
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
        conversion_rate: line.exchangeRate || null,
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
  const useFxLayout =
    creationKind === "fx" ||
    Boolean(
      transferId &&
      lines.some((line) => {
        const source = accounts.find((account) => account.id === line.fromBankId);
        const destination = accounts.find((account) => account.id === line.toBankId);
        return source && destination && source.currency !== destination.currency;
      }),
    );
  const groupedTotals = lines.reduce<Map<string, bigint>>((totals, line) => {
    const currency = accounts.find((account) => account.id === line.fromBankId)?.currency;
    const amount = transferAmountUnits(line.amount);
    if (!currency || amount === null) return totals;
    totals.set(currency, (totals.get(currency) ?? 0n) + amount);
    return totals;
  }, new Map());

  function currentLineEvidence(line: EditableLine) {
    const persisted = detail?.lines.find((candidate) => candidate.id === line.id);
    return persisted &&
      persisted.document_date === line.date &&
      persisted.from_bank_account_id === line.fromBankId &&
      persisted.to_bank_account_id === line.toBankId &&
      sameDecimal(persisted.source_amount, line.amount) &&
      sameDecimal(persisted.conversion_rate ?? "", line.exchangeRate)
      ? persisted
      : undefined;
  }

  const totalsLabel =
    groupedTotals.size === 0
      ? "0.00"
      : [...groupedTotals.entries()]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([currency, amount]) => `${currency} ${displayTransferTotal(amount)}`)
          .join(" · ");

  if (sessionLoading || loading)
    return <TransferState title="Loading Bank Transfer" detail="Loading live companies, Bank Accounts and controls." />;
  if (!session) return <TransferState title="Sign in required" detail="An authenticated session is required." />;
  if (!canCreate && !transferId)
    return <TransferState title="Permission required" detail="banking.transfer.create is required." />;

  return (
    <div className="grid min-w-0 gap-3.5" aria-busy={busy}>
      <BankEntryHeader
        title={
          detail ? `Edit Transfer · ${detail.reference}` : creationKind === "fx" ? "Add FX Transfer" : "Add Transfer"
        }
        description={
          creationKind === "fx"
            ? "Convert funds between different-currency Bank Accounts in the same company using an entered or configured exchange rate."
            : creationKind === "transfer"
              ? "Move funds between same-currency Bank Accounts owned by the same company."
              : "Move funds between Bank Accounts owned by the same company."
        }
        status={<Badge variant="outline">{detail ? bankTransferStateLabel(detail.state) : "Draft"}</Badge>}
      />

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Bank Transfer could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {policyConfigured === false ? (
        <Alert>
          <AlertTitle>Bank Transfer FX policy needs setup</AlertTitle>
          <AlertDescription>
            Select FX gain, FX loss, rounding and bank-charge nominals for{" "}
            {companies.find((company) => company.id === companyId)?.name ?? "this company"} in Finance → Currencies
            &amp; Transfer FX before saving a transfer.
            <div className="mt-3 flex flex-wrap gap-2">
              {onConfigurePolicy && permissions.has("finance.transfer_fx_policy.manage") ? (
                <Button type="button" variant="outline" size="sm" onClick={onConfigurePolicy}>
                  Configure policy
                </Button>
              ) : (
                <p className="m-0">Ask an authorized Finance administrator to configure this policy.</p>
              )}
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={optionsLoading}
                onClick={() => void refreshOptions()}
              >
                {optionsLoading ? "Checking setup…" : "Refresh setup"}
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="min-w-0 rounded-lg border border-border bg-card">
        <section aria-label="Transfer controls" className="grid items-start gap-3 p-3 sm:grid-cols-2 xl:grid-cols-4">
          <label htmlFor="transfer-company" className="grid min-w-0 gap-1.5 text-xs font-semibold sm:col-span-2">
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
          <label htmlFor="transfer-posting-date" className="grid min-w-0 gap-1.5 text-xs font-semibold xl:col-span-1">
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
          <label htmlFor="transfer-value-date" className="grid min-w-0 gap-1.5 text-xs font-semibold xl:col-span-1">
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
          className="rounded-none border-0 border-t border-border bg-transparent p-3"
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
      </div>

      {useFxLayout ? (
        <section aria-label="Transfer lines" className="grid min-w-0 gap-3">
          {lines.map((line, index) => {
            const persisted = currentLineEvidence(line);
            return (
              <BankFxTransferLine
                key={line.id}
                line={line}
                index={index}
                count={lines.length}
                accounts={accounts}
                editable={editable && !busy}
                savedAmount={
                  persisted
                    ? {
                        amount: persisted.destination_amount,
                        currency: persisted.destination_currency,
                        enteredRate: Boolean(persisted.conversion_rate),
                      }
                    : undefined
                }
                destinationMatches={destinationMatches}
                onChange={(patch) => changeLine(line.id, patch)}
                onDelete={() => {
                  setLines((current) => current.filter((candidate) => candidate.id !== line.id));
                  markDirty();
                }}
              />
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <Button
              type="button"
              variant="outline"
              disabled={!editable || busy || lines.length >= 200}
              onClick={() => {
                setLines((current) => [...current, emptyLine(postingDate)]);
                markDirty();
              }}
            >
              + Add More
            </Button>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
              <span className="text-muted-foreground">Total sent</span>
              <strong className="tabular-nums">{totalsLabel}</strong>
            </div>
          </div>
        </section>
      ) : (
        <section
          className="overflow-hidden rounded-lg border border-border bg-card shadow-sm"
          aria-label="Transfer lines"
        >
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1080px] table-fixed border-collapse text-xs">
              <colgroup>
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
                <col className="w-[10%]" />
                <col className="w-[18%]" />
                <col className="w-[15%]" />
                <col className="w-[12%]" />
                <col className="w-[5%]" />
              </colgroup>
              <thead className="bg-muted text-left text-foreground">
                <tr>
                  {["Date *", "From Bank *", "Ref. No.", "Mode", "To Bank *", "Details", "Amount *", ""].map(
                    (heading) => (
                      <th key={heading} className="border-r border-border px-3 py-2 font-semibold last:border-r-0">
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
                  const persistedLine = currentLineEvidence(line);
                  const evidenceIsCurrent = Boolean(persistedLine);
                  const crossCurrency = Boolean(source && destination && source.currency !== destination.currency);
                  return (
                    <Fragment key={line.id}>
                      <tr className="border-b border-border align-top last:border-b-0">
                        <td className="p-2">
                          <Input
                            className="min-w-0"
                            type="date"
                            value={line.date}
                            disabled={!editable}
                            onChange={(event) => changeLine(line.id, { date: event.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <div className="min-w-0">
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
                                  toBankId:
                                    value === line.toBankId ||
                                    !destinationMatches(
                                      accounts.find((account) => account.id === value),
                                      accounts.find((account) => account.id === line.toBankId),
                                    )
                                      ? ""
                                      : line.toBankId,
                                })
                              }
                            />
                          </div>
                          {source ? (
                            <p className="mb-0 mt-1 text-xs text-muted-foreground">
                              Control: {source.ledger_account_code} · {source.ledger_account_name}
                            </p>
                          ) : null}
                        </td>
                        <td className="p-2">
                          <Input
                            className="min-w-0"
                            value={line.reference}
                            disabled={!editable}
                            maxLength={128}
                            onChange={(event) => changeLine(line.id, { reference: event.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <select
                            aria-label="Transfer mode"
                            className="h-10 w-full min-w-0 rounded-md border border-input bg-background px-2"
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
                          <div className="min-w-0">
                            <SearchableSelect
                              label="To Bank"
                              value={line.toBankId}
                              disabled={!editable || Boolean(creationKind && !source)}
                              required
                              placeholder="Select destination Bank"
                              options={accounts
                                .filter((account) => !creationKind || destinationMatches(source, account))
                                .map((account) => ({
                                  value: account.id,
                                  label: accountLabel(account),
                                  disabled: account.id === line.fromBankId,
                                }))}
                              onValueChange={(value) => changeLine(line.id, { toBankId: value })}
                            />
                            {creationKind &&
                            source &&
                            !accounts.some(
                              (account) => account.id !== source.id && destinationMatches(source, account),
                            ) ? (
                              <p className="mb-0 mt-1 text-xs text-muted-foreground">
                                No other Bank Account in this currency is available for this company.
                              </p>
                            ) : null}
                          </div>
                        </td>
                        <td className="p-2">
                          <Textarea
                            aria-label="Details"
                            className="h-10 min-h-10 min-w-0 resize-y"
                            value={line.details}
                            disabled={!editable}
                            maxLength={500}
                            rows={2}
                            placeholder="Transfer details (optional)"
                            onChange={(event) => changeLine(line.id, { details: event.target.value })}
                          />
                        </td>
                        <td className="p-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <span className="text-xs font-semibold text-muted-foreground">
                              {source?.currency ?? "—"}
                            </span>
                            <Input
                              aria-label="Amount"
                              inputMode="decimal"
                              className="text-right"
                              value={line.amount}
                              disabled={!editable}
                              onChange={(event) => changeLine(line.id, { amount: event.target.value })}
                            />
                          </div>
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
                                  className="mt-1 h-auto justify-start whitespace-normal px-0 py-1 text-left text-xs"
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
                              className="mt-1 h-auto justify-start whitespace-normal px-0 py-1 text-left text-xs"
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
                            className="px-0 text-xs"
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
                      {crossCurrency ? (
                        <tr className="border-b border-border bg-muted/30 last:border-b-0">
                          <td colSpan={8} className="p-3">
                            <div className="flex items-center gap-6">
                              <label
                                htmlFor={`transfer-rate-${line.id}`}
                                className="grid shrink-0 gap-1 text-xs font-medium"
                              >
                                Exchange rate
                                <span className="flex items-center gap-2">
                                  <span className="text-muted-foreground">1 {source?.currency} =</span>
                                  <Input
                                    id={`transfer-rate-${line.id}`}
                                    aria-label="Exchange rate"
                                    inputMode="decimal"
                                    className="w-40 text-right"
                                    value={line.exchangeRate}
                                    disabled={!editable}
                                    maxLength={39}
                                    placeholder="Configured rate"
                                    onChange={(event) => changeLine(line.id, { exchangeRate: event.target.value })}
                                  />
                                  <span className="text-muted-foreground">{destination?.currency} received</span>
                                </span>
                              </label>
                              <div className="grid max-w-xl gap-1 text-xs text-muted-foreground">
                                <p className="m-0">Leave blank to use configured rates.</p>
                                <p className="m-0">
                                  {persistedLine && evidenceIsCurrent
                                    ? `${persistedLine.destination_currency} ${persistedLine.destination_amount} · ${persistedLine.conversion_rate ? "Entered exchange rate" : "Configured currency rates"}`
                                    : "Save the draft to calculate and lock the destination amount and exchange-rate evidence."}
                                </p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td colSpan={6} className="px-3 py-3">
                    Total
                  </td>
                  <td className="px-3 py-3 text-right">
                    {totalsLabel}
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
      )}

      {canApproveAndClose && globalApproval && !readOnly ? <SuperAdminOverrideWarning reasonRequired={false} /> : null}
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onBack}>
          Cancel
        </Button>
        {editable ? (
          <BankEntryActions
            busy={busy}
            saveDisabled={
              readOnly || optionsLoading || policyConfigured === false || (detail ? !canUpdate : !canCreate)
            }
            submitDisabled={
              readOnly ||
              optionsLoading ||
              policyConfigured === false ||
              !canSubmit ||
              (detail ? !canUpdate : !canCreate)
            }
            showApproval={canApproveAndClose && !readOnly}
            approveDisabled={
              readOnly ||
              optionsLoading ||
              policyConfigured === false ||
              !canApproveAndClose ||
              (detail ? !canUpdate : !canCreate)
            }
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
