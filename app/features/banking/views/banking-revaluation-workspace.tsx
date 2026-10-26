"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import type {
  BankAccountSummary,
  BankingCompanyDirectory,
  BankRevaluationDetail,
  BankRevaluationEvent,
  BankRevaluationPreview,
  BankRevaluationState,
  BankRevaluationSummary,
  BankWorkflowOptions,
  CompanyCurrency,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { FinanceCurrenciesClient } from "@/features/finance/api/finance-currencies-client";
import { BankingApiClient } from "../api/banking-client";

const states: readonly BankRevaluationState[] = ["draft", "submitted", "approved", "rejected", "posted", "reversed"];

function today() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function idempotency(action: string) {
  return `web-bank-revaluation-${action}-${crypto.randomUUID()}`;
}

function errorMessage(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "The Bank Revaluation request failed safely.";
}

function stateLabel(state: BankRevaluationState) {
  switch (state) {
    case "draft":
      return "Draft";
    case "submitted":
      return "Waiting for approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "posted":
      return "Posted";
    case "reversed":
      return "Reversed";
  }
}

function amount(value: string, currency: string) {
  const number = Number(value);
  if (!Number.isFinite(number)) return `${currency} ${value}`;
  return `${currency} ${new Intl.NumberFormat(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(number)}`;
}

function gainLoss(value: string, currency: string, direction: "gain" | "loss" | "none") {
  return `${amount(Math.abs(Number(value)).toFixed(2), currency)} ${direction === "none" ? "no change" : direction}`;
}

function stateVariant(state: BankRevaluationState): "default" | "destructive" | "outline" | "secondary" {
  if (state === "posted" || state === "reversed") return "default";
  if (state === "rejected") return "destructive";
  if (state === "submitted") return "secondary";
  return "outline";
}

export interface BankingRevaluationWorkspaceProps {
  recordRef?: string;
  onNavigate: (recordRef?: string) => void;
}

export function BankingRevaluationWorkspace({ recordRef, onNavigate }: BankingRevaluationWorkspaceProps) {
  const { api, session, loading } = useSession();
  const banking = useMemo(() => new BankingApiClient(api), [api]);
  const currencies = useMemo(() => new FinanceCurrenciesClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);

  if (loading) return <Notice title="Checking access" detail="Confirming your live Bank Revaluation permissions." />;
  if (!session) return <Notice title="Sign in required" detail="Use an authenticated Nexora session to continue." />;
  if (!permissions.has("banking.revaluation.read"))
    return <Notice title="Permission required" detail="banking.revaluation.read is required." destructive />;

  if (!recordRef) {
    return (
      <RevaluationRegister
        banking={banking}
        currencies={currencies}
        permissions={permissions}
        onNavigate={onNavigate}
      />
    );
  }

  return (
    <RevaluationForm
      key={recordRef}
      revaluationId={recordRef === "new" ? undefined : recordRef}
      banking={banking}
      currencies={currencies}
      permissions={permissions}
      currentUserId={session.user.id}
      impersonating={Boolean(session.impersonation)}
      onNavigate={onNavigate}
    />
  );
}

interface Clients {
  banking: BankingApiClient;
  currencies: FinanceCurrenciesClient;
  permissions: ReadonlySet<string>;
}

function RevaluationRegister({
  banking,
  currencies,
  permissions,
  onNavigate,
}: Clients & { onNavigate: (recordRef?: string) => void }) {
  const canCreate = permissions.has("banking.revaluation.create");
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [currencyOptions, setCurrencyOptions] = useState<CompanyCurrency[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccountSummary[]>([]);
  const [currency, setCurrency] = useState("");
  const [bankAccountId, setBankAccountId] = useState("");
  const [state, setState] = useState<BankRevaluationState | "">("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search.trim());
  const [rows, setRows] = useState<BankRevaluationSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(
    async (selectedCompanyId: string, cursor?: string, append = false) => {
      if (!selectedCompanyId) return;
      const result = await banking.revaluations({
        company_id: selectedCompanyId,
        ...(currency ? { currency } : {}),
        ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
        ...(state ? { states: [state] } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(deferredSearch ? { search: deferredSearch } : {}),
        limit: 50,
        ...(cursor ? { cursor } : {}),
      });
      setRows((current) => (append ? [...current, ...result.items] : result.items));
      setNextCursor(result.next_cursor);
    },
    [bankAccountId, banking, currency, dateFrom, dateTo, deferredSearch, state],
  );

  useEffect(() => {
    let active = true;
    banking
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
      })
      .catch((caught) => active && setError(errorMessage(caught)));
    return () => {
      active = false;
    };
  }, [banking]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    Promise.all([
      banking.accounts({
        company_id: companyId,
        state: "active",
        sort_by: "account_name",
        sort_direction: "asc",
        limit: 100,
      }),
      currencies.companyCurrencies({ company_id: companyId, status: "active", limit: 100 }),
      banking.revaluations({
        company_id: companyId,
        ...(currency ? { currency } : {}),
        ...(bankAccountId ? { bank_account_id: bankAccountId } : {}),
        ...(state ? { states: [state] } : {}),
        ...(dateFrom ? { date_from: dateFrom } : {}),
        ...(dateTo ? { date_to: dateTo } : {}),
        ...(deferredSearch ? { search: deferredSearch } : {}),
        limit: 50,
      }),
    ])
      .then(([accountsResult, currencyResult, revaluationResult]) => {
        if (!active) return;
        setBankAccounts(accountsResult.items);
        setCurrencyOptions(currencyResult.items.filter((item) => !item.is_base));
        setRows(revaluationResult.items);
        setNextCursor(revaluationResult.next_cursor);
      })
      .catch((caught) => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [bankAccountId, banking, companyId, currencies, currency, dateFrom, dateTo, deferredSearch, state]);

  async function applyFilters() {
    setLoading(true);
    setError("");
    try {
      await load(companyId);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      await load(companyId, nextCursor, true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  function clearFilters() {
    setCurrency("");
    setBankAccountId("");
    setState("");
    setDateFrom("");
    setDateTo("");
    setSearch("");
  }

  return (
    <div className="space-y-4" aria-busy={loading}>
      <header className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Banking &amp; Treasury</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Bank Revaluation</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Governed foreign-currency bank balance remeasurement in each company&apos;s base currency.
          </p>
        </div>
        {canCreate ? (
          <Button type="button" onClick={() => onNavigate("new")}>
            Add New
          </Button>
        ) : null}
      </header>

      {error ? <Notice title="Bank Revaluations could not be loaded" detail={error} destructive /> : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card shadow-sm">
        <div className="grid gap-3 border-b border-border bg-muted/20 p-4 sm:grid-cols-2 xl:grid-cols-8">
          <Filter label="Company" className="xl:col-span-2">
            <select
              aria-label="Company"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={companyId}
              onChange={(event) => {
                setLoading(true);
                setError("");
                setCurrency("");
                setBankAccountId("");
                setCompanyId(event.target.value);
              }}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} - {company.name}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Currency">
            <select
              aria-label="Currency"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={currency}
              onChange={(event) => setCurrency(event.target.value)}
            >
              <option value="">All currencies</option>
              {currencyOptions.map((item) => (
                <option key={item.id} value={item.currency_code}>
                  {item.currency_code}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Bank">
            <select
              aria-label="Bank account"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
            >
              <option value="">All bank accounts</option>
              {bankAccounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} ({account.currency})
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="Status">
            <select
              aria-label="Status"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={state}
              onChange={(event) => setState(event.target.value as BankRevaluationState | "")}
            >
              <option value="">All statuses</option>
              {states.map((item) => (
                <option key={item} value={item}>
                  {stateLabel(item)}
                </option>
              ))}
            </select>
          </Filter>
          <Filter label="From date">
            <Input
              aria-label="From date"
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </Filter>
          <Filter label="To date">
            <Input
              aria-label="To date"
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
            />
          </Filter>
          <Filter label="Reference" className="xl:col-span-2">
            <Input
              aria-label="Reference"
              maxLength={160}
              value={search}
              placeholder="Voucher or external reference"
              onChange={(event) => setSearch(event.target.value)}
            />
          </Filter>
          <div className="flex items-end gap-2 xl:col-span-2">
            <Button
              type="button"
              className="flex-1"
              disabled={loading || !companyId}
              onClick={() => void applyFilters()}
            >
              Search
            </Button>
            <Button type="button" variant="outline" onClick={clearFilters}>
              Clear
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1120px] text-sm">
            <thead className="bg-sky-500 text-left text-white">
              <tr>
                {[
                  "Voucher",
                  "Date",
                  "Currency",
                  "Account(s)",
                  "Exchange rate",
                  "Foreign balance",
                  "Revalued balance",
                  "Gain / Loss",
                  "Status",
                  "Reversal",
                ].map((heading) => (
                  <th key={heading} scope="col" className="px-3 py-3 font-semibold">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!loading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-muted-foreground">
                    No persisted Bank Revaluations match the current filters.
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-muted/30">
                  <td className="px-3 py-3">
                    <button
                      type="button"
                      className="font-semibold text-primary hover:underline"
                      onClick={() => onNavigate(row.id)}
                    >
                      {row.voucher_number}
                    </button>
                    {row.external_reference ? (
                      <span className="block text-xs text-muted-foreground">{row.external_reference}</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-3">{row.revaluation_date}</td>
                  <td className="px-3 py-3">
                    {row.currency} / {row.base_currency}
                  </td>
                  <td className="px-3 py-3">
                    {row.account_count} bank account{row.account_count === 1 ? "" : "s"}
                  </td>
                  <td className="px-3 py-3 tabular-nums">{row.closing_rate}</td>
                  <td className="px-3 py-3 tabular-nums">{amount(row.foreign_balance, row.currency)}</td>
                  <td className="px-3 py-3 tabular-nums">{amount(row.revalued_base_balance, row.base_currency)}</td>
                  <td
                    className={
                      row.direction === "loss"
                        ? "px-3 py-3 font-semibold text-destructive"
                        : "px-3 py-3 font-semibold text-emerald-700"
                    }
                  >
                    {gainLoss(row.gain_loss_amount, row.base_currency, row.direction)}
                  </td>
                  <td className="px-3 py-3">
                    <Badge variant={stateVariant(row.state)}>{stateLabel(row.state)}</Badge>
                  </td>
                  <td className="px-3 py-3 capitalize">{row.reversal_state.replaceAll("_", " ")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>{rows.length} revaluation record(s) loaded</span>
          {nextCursor ? (
            <Button type="button" variant="outline" disabled={loadingMore} onClick={() => void loadMore()}>
              {loadingMore ? "Loading more..." : "Load more"}
            </Button>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function RevaluationForm({
  revaluationId,
  banking,
  currencies,
  permissions,
  currentUserId,
  impersonating,
  onNavigate,
}: Clients & {
  revaluationId?: string;
  currentUserId: string;
  impersonating: boolean;
  onNavigate: (recordRef?: string) => void;
}) {
  const { csrfToken } = useSession();
  const notify = useActionFeedback();
  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [companyCurrencies, setCompanyCurrencies] = useState<CompanyCurrency[]>([]);
  const [baseCurrency, setBaseCurrency] = useState("");
  const [currency, setCurrency] = useState("");
  const [revaluationDate, setRevaluationDate] = useState(today());
  const [externalReference, setExternalReference] = useState("");
  const [narration, setNarration] = useState("");
  const [approvers, setApprovers] = useState<BankWorkflowOptions["items"]>([]);
  const [approverId, setApproverId] = useState("");
  const [detail, setDetail] = useState<BankRevaluationDetail | null>(null);
  const [preview, setPreview] = useState<BankRevaluationPreview | null>(null);
  const [events, setEvents] = useState<BankRevaluationEvent[]>([]);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const canCreate = permissions.has("banking.revaluation.create") && !impersonating;
  const canUpdate = permissions.has("banking.revaluation.update") && !impersonating;
  const canSubmit = permissions.has("banking.revaluation.submit") && !impersonating;
  const canApprove = permissions.has("banking.revaluation.approve") && !impersonating;
  const canPost = permissions.has("banking.revaluation.post") && !impersonating;
  const canReverse = permissions.has("banking.revaluation.reverse") && !impersonating;
  const editable = !detail || detail.state === "draft" || detail.state === "rejected";

  const loadOptions = useCallback(
    async (selectedCompanyId: string, selectedApproverId = "") => {
      if (!selectedCompanyId) return;
      const [profile, directory, approverDirectory] = await Promise.all([
        currencies.profile(selectedCompanyId),
        currencies.companyCurrencies({ company_id: selectedCompanyId, status: "active", limit: 100 }),
        banking.revaluationApprovers({
          company_id: selectedCompanyId,
          ...(selectedApproverId ? { selected_id: selectedApproverId } : {}),
          limit: 100,
        }),
      ]);
      setBaseCurrency(profile.base_currency);
      setCompanyCurrencies(directory.items.filter((item) => !item.is_base));
      setApprovers(
        approverDirectory.selected &&
          !approverDirectory.items.some((item) => item.id === approverDirectory.selected?.id)
          ? [approverDirectory.selected, ...approverDirectory.items]
          : approverDirectory.items,
      );
    },
    [banking, currencies],
  );

  const loadDetail = useCallback(
    async (id: string) => {
      const [record, audit] = await Promise.all([banking.revaluation(id), banking.revaluationEvents(id)]);
      setDetail(record);
      setCompanyId(record.company_id);
      setCurrency(record.currency);
      setBaseCurrency(record.base_currency);
      setRevaluationDate(record.revaluation_date);
      setExternalReference(record.external_reference ?? "");
      setNarration(record.narration ?? "");
      setApproverId(record.approver_user_id ?? "");
      setPreview(null);
      setEvents(audit.items);
      await loadOptions(record.company_id, record.approver_user_id ?? "");
    },
    [banking, loadOptions],
  );

  useEffect(() => {
    let active = true;
    banking
      .companies()
      .then(async (result) => {
        if (!active) return;
        setCompanies(result.items);
        if (revaluationId) {
          await loadDetail(revaluationId);
        } else {
          const firstCompany = result.items[0]?.id ?? "";
          setCompanyId(firstCompany);
          if (firstCompany) await loadOptions(firstCompany);
        }
      })
      .catch((caught) => active && setError(errorMessage(caught)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [banking, loadDetail, loadOptions, revaluationId]);

  async function changeCompany(value: string) {
    setCompanyId(value);
    setCurrency("");
    setApproverId("");
    setPreview(null);
    setError("");
    try {
      await loadOptions(value);
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function applyPreview() {
    if (!companyId || !currency || !revaluationDate) return;
    setBusy("preview");
    setPreview(null);
    setError("");
    try {
      const result = await banking.previewRevaluation(
        { company_id: companyId, currency, revaluation_date: revaluationDate },
        csrfToken(),
        idempotency("preview"),
      );
      setPreview(result);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function saveDraft() {
    if (!companyId || !currency || !revaluationDate || (!detail && !preview)) return;
    const action = detail ? "update" : "create";
    setBusy(action);
    setError("");
    try {
      if (detail) {
        await banking.updateRevaluation(
          detail.id,
          {
            expected_version: detail.version,
            currency,
            revaluation_date: revaluationDate,
            external_reference: externalReference.trim() || null,
            narration: narration.trim() || null,
            approver_user_id: approverId || null,
          },
          csrfToken(),
          idempotency(action),
        );
        await loadDetail(detail.id);
        notify("Bank Revaluation draft updated.");
      } else {
        const result = await banking.createRevaluation(
          {
            company_id: companyId,
            currency,
            revaluation_date: revaluationDate,
            ...(externalReference.trim() ? { external_reference: externalReference.trim() } : {}),
            ...(narration.trim() ? { narration: narration.trim() } : {}),
            ...(approverId ? { approver_user_id: approverId } : {}),
          },
          csrfToken(),
          idempotency(action),
        );
        notify("Bank Revaluation draft saved.");
        onNavigate(result.id);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  async function lifecycle(action: "submit" | "approve" | "reject" | "post" | "reverse") {
    if (!detail) return;
    if ((action === "reject" || action === "reverse") && reason.trim().length < 3) {
      setError("Enter a reason of at least 3 characters.");
      return;
    }
    setBusy(action);
    setError("");
    try {
      if (action === "submit") {
        if (!detail.approver_user_id) {
          setError("Select and save an eligible approver before submitting the Bank Revaluation.");
          return;
        }
        await banking.submitRevaluation(
          detail.id,
          { expected_version: detail.version, ...(reason.trim() ? { reason: reason.trim() } : {}) },
          csrfToken(),
          idempotency(action),
        );
      } else if (action === "approve") {
        await banking.approveRevaluation(
          detail.id,
          { expected_version: detail.version, ...(reason.trim() ? { reason: reason.trim() } : {}) },
          csrfToken(),
          idempotency(action),
        );
      } else if (action === "reject") {
        await banking.rejectRevaluation(
          detail.id,
          { expected_version: detail.version, reason: reason.trim() },
          csrfToken(),
          idempotency(action),
        );
      } else if (action === "post") {
        await banking.postRevaluation(
          detail.id,
          { expected_version: detail.version },
          csrfToken(),
          idempotency(action),
        );
      } else {
        await banking.reverseRevaluation(
          detail.id,
          { expected_version: detail.version, reason: reason.trim() },
          csrfToken(),
          idempotency(action),
        );
      }
      await loadDetail(detail.id);
      setReason("");
      notify(`Bank Revaluation ${action} completed.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy("");
    }
  }

  const evidence = preview ?? detail;
  const sameMaker = detail?.maker_user_id === currentUserId;

  return (
    <div className="space-y-4" aria-busy={loading || Boolean(busy)}>
      <header className="flex flex-col gap-4 border-b border-border pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <button
            type="button"
            className="text-sm font-medium text-primary hover:underline"
            onClick={() => onNavigate()}
          >
            Bank / Bank Revaluation
          </button>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-3xl font-semibold tracking-tight">
              {detail?.voucher_number ?? "Add Bank Revaluation"}
            </h1>
            {detail ? <Badge variant={stateVariant(detail.state)}>{stateLabel(detail.state)}</Badge> : null}
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Apply previews authoritative balances. Save persists a draft; posting remains a separate governed action.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => onNavigate()}>
          Back to work page
        </Button>
      </header>

      {error ? <Notice title="Bank Revaluation could not be completed" detail={error} destructive /> : null}
      {impersonating ? (
        <Notice
          title="Read-only impersonation"
          detail="Financial revaluation mutations are disabled during impersonation."
        />
      ) : null}

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <h2 className="border-b border-border pb-3 text-lg font-semibold">Search</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <Field label="Company" htmlFor="revaluation-company" required>
            <select
              id="revaluation-company"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={companyId}
              disabled={Boolean(detail) || !editable}
              onChange={(event) => void changeCompany(event.target.value)}
            >
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} - {company.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Currency" htmlFor="revaluation-currency" required>
            <select
              id="revaluation-currency"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={currency}
              disabled={!editable}
              onChange={(event) => {
                setCurrency(event.target.value);
                setPreview(null);
              }}
            >
              <option value="">Select currency</option>
              {companyCurrencies.map((item) => (
                <option key={item.id} value={item.currency_code}>
                  {item.currency_name} ({item.currency_code})
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date" htmlFor="revaluation-date" required>
            <Input
              id="revaluation-date"
              type="date"
              value={revaluationDate}
              disabled={!editable}
              onChange={(event) => {
                setRevaluationDate(event.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full"
              disabled={!editable || !currency || !revaluationDate || busy === "preview"}
              onClick={() => void applyPreview()}
            >
              {busy === "preview" ? "Applying..." : "Apply"}
            </Button>
          </div>
          <div className="rounded-md border border-border bg-muted/30 px-4 py-3">
            <span className="block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Base currency
            </span>
            <strong className="mt-1 block text-lg">{baseCurrency || "-"}</strong>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Ref. No." htmlFor="revaluation-reference">
            <Input
              id="revaluation-reference"
              maxLength={128}
              value={externalReference}
              disabled={!editable}
              placeholder="External reference"
              onChange={(event) => setExternalReference(event.target.value)}
            />
          </Field>
          <Field label="Narration" htmlFor="revaluation-narration">
            <Textarea
              id="revaluation-narration"
              maxLength={500}
              value={narration}
              disabled={!editable}
              placeholder="Purpose and period of this revaluation"
              onChange={(event) => setNarration(event.target.value)}
            />
          </Field>
          <Field label="Approver" htmlFor="revaluation-approver" required>
            <select
              id="revaluation-approver"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={approverId}
              disabled={!editable}
              required
              onChange={(event) => setApproverId(event.target.value)}
            >
              <option value="">Select eligible approver</option>
              {approvers.map((approver) => (
                <option key={approver.id} value={approver.id} disabled={!approver.eligible}>
                  {approver.name}
                  {approver.self_approval ? " (audited override)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>

        {evidence ? (
          <>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-y border-border bg-muted/20 px-3 py-3">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Authoritative rate
                </span>
                <p className="font-semibold">
                  1 {evidence.currency} = {evidence.rate_snapshot.rate} {evidence.base_currency}
                </p>
              </div>
              <div className="text-right">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Effective date
                </span>
                <p className="font-semibold">{evidence.rate_snapshot.effective_date}</p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[960px] text-sm">
                <thead className="bg-sky-500 text-white">
                  <tr>
                    {[
                      "Account Code",
                      "Account Name",
                      `${evidence.currency} Balance`,
                      `${evidence.base_currency} Carrying Balance`,
                      "Revalued Balance",
                      "Revalued Gain / Loss",
                    ].map((heading) => (
                      <th key={heading} scope="col" className="px-3 py-3 text-left font-semibold">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {evidence.lines.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                        No eligible foreign-currency bank balances were found.
                      </td>
                    </tr>
                  ) : null}
                  {evidence.lines.map((line) => (
                    <tr key={line.bank_account_id} className="border-t border-border">
                      <td className="px-3 py-3">{line.bank_account_code}</td>
                      <td className="px-3 py-3">
                        <strong>{line.bank_account_name}</strong>
                        <span className="block text-xs text-muted-foreground">{line.bank_name}</span>
                      </td>
                      <td className="px-3 py-3 tabular-nums">{amount(line.foreign_balance, line.currency)}</td>
                      <td className="px-3 py-3 tabular-nums">
                        {amount(line.carrying_base_balance, evidence.base_currency)}
                      </td>
                      <td className="px-3 py-3 tabular-nums">
                        {amount(line.revalued_base_balance, evidence.base_currency)}
                      </td>
                      <td
                        className={
                          line.direction === "loss"
                            ? "px-3 py-3 font-semibold text-destructive"
                            : "px-3 py-3 font-semibold text-emerald-700"
                        }
                      >
                        {gainLoss(line.adjustment, evidence.base_currency, line.direction)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 border-border bg-muted/30 font-semibold">
                  <tr>
                    <td colSpan={2} className="px-3 py-3">
                      Totals
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {amount(evidence.totals.foreign_balance, evidence.currency)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {amount(evidence.totals.carrying_base_balance, evidence.base_currency)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {amount(evidence.totals.revalued_base_balance, evidence.base_currency)}
                    </td>
                    <td className="px-3 py-3 tabular-nums">
                      {gainLoss(
                        evidence.totals.net_gain_loss,
                        evidence.base_currency,
                        Number(evidence.totals.net_gain_loss) > 0
                          ? "gain"
                          : Number(evidence.totals.net_gain_loss) < 0
                            ? "loss"
                            : "none",
                      )}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        ) : (
          <div className="mt-5 rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
            Select a company, foreign currency and date, then choose Apply to calculate a read-only preview.
          </div>
        )}
      </section>

      {detail ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl flex-1">
              <Label htmlFor="revaluation-action-reason">Action reason</Label>
              <Textarea
                id="revaluation-action-reason"
                maxLength={500}
                value={reason}
                placeholder="Required for rejection and reversal; optional for submission and approval"
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {(detail.state === "draft" || detail.state === "rejected") && canSubmit ? (
                <Button type="button" disabled={Boolean(busy)} onClick={() => void lifecycle("submit")}>
                  Submit for approval
                </Button>
              ) : null}
              {detail.state === "submitted" && canApprove ? (
                <>
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={Boolean(busy)}
                    onClick={() => void lifecycle("reject")}
                  >
                    Reject
                  </Button>
                  <Button type="button" disabled={Boolean(busy)} onClick={() => void lifecycle("approve")}>
                    {sameMaker ? "Approve with audited override" : "Approve"}
                  </Button>
                </>
              ) : null}
              {detail.state === "approved" && canPost ? (
                <Button type="button" disabled={Boolean(busy)} onClick={() => void lifecycle("post")}>
                  Post
                </Button>
              ) : null}
              {detail.state === "posted" && canReverse ? (
                <Button
                  type="button"
                  variant="destructive"
                  disabled={Boolean(busy)}
                  onClick={() => void lifecycle("reverse")}
                >
                  Schedule reversal
                </Button>
              ) : null}
            </div>
          </div>
          {sameMaker && detail.state === "submitted" && canApprove ? (
            <p className="mt-3 text-sm text-amber-700">
              You created this record. Approval can succeed only when the server validates an audited Super Admin
              override.
            </p>
          ) : null}
          <dl className="mt-5 grid gap-3 border-t border-border pt-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <Meta label="Journal entry" value={detail.journal_entry_id ?? "Not posted"} />
            <Meta label="Reversal date" value={detail.reversal_scheduled_date ?? "Not scheduled"} />
            <Meta label="Reversal journal" value={detail.reversal_journal_entry_id ?? "Not posted"} />
            <Meta label="Override evidence" value={detail.decision_evidence_id ?? "Not used"} />
          </dl>
        </section>
      ) : null}

      {detail?.accounting_preview ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Accounting preview</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Posting date {detail.accounting_preview.posting_date} · period {detail.accounting_preview.period_id}
          </p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left">Nominal</th>
                  <th className="px-3 py-2 text-left">Description</th>
                  <th className="px-3 py-2 text-right">Debit</th>
                  <th className="px-3 py-2 text-right">Credit</th>
                </tr>
              </thead>
              <tbody>
                {detail.accounting_preview.lines.map((line, index) => (
                  <tr className="border-t border-border" key={`${line.nominal_id}-${index}`}>
                    <td className="px-3 py-2">{line.nominal_code}</td>
                    <td className="px-3 py-2">{line.description}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amount(line.debit, detail.base_currency)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{amount(line.credit, detail.base_currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {detail ? (
        <section className="rounded-lg border border-border bg-card p-4 shadow-sm">
          <h2 className="text-lg font-semibold">Audit history</h2>
          {events.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No lifecycle events were returned.</p>
          ) : null}
          <ol className="mt-3 space-y-2">
            {events.map((event) => (
              <li
                key={event.id}
                className="flex flex-col gap-1 rounded-md border border-border px-3 py-2 text-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <span>
                  <strong className="capitalize">{event.event_type.replaceAll("_", " ")}</strong>
                  {event.reason ? ` - ${event.reason}` : ""}
                  {event.super_admin_override_used ? " (audited override)" : ""}
                </span>
                <time dateTime={event.occurred_at} className="text-muted-foreground">
                  {new Date(event.occurred_at).toLocaleString()}
                </time>
              </li>
            ))}
          </ol>
        </section>
      ) : null}

      <footer className="sticky bottom-2 z-20 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        <Button type="button" variant="outline" onClick={() => onNavigate()}>
          Cancel
        </Button>
        {editable && (detail ? canUpdate : canCreate) ? (
          <Button type="button" disabled={Boolean(busy) || (!detail && !preview)} onClick={() => void saveDraft()}>
            {busy === "create" || busy === "update" ? "Saving..." : "Save draft"}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}

function Filter({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`grid gap-1 text-sm font-medium ${className}`}>
      {label}
      {children}
    </label>
  );
}

function Field({
  label,
  htmlFor,
  required = false,
  children,
}: {
  label: string;
  htmlFor: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-1">
      <Label htmlFor={htmlFor}>
        {label}
        {required ? <span className="text-destructive"> *</span> : null}
      </Label>
      {children}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="mt-1 break-all font-medium">{value}</dd>
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
