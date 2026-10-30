"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  JournalDetail,
  JournalLineInput,
  JournalOptions,
  JournalSummary,
  RecurringJournalOccurrenceDirectory,
  RecurringJournalTemplate,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { FinanceJournalsClient } from "../api/finance-journals-client";
import { formatJournalAmount, validateJournalLines } from "../lib/finance-journal-form";

export const financeJournalPages = [
  "journal-register",
  "manual-journal",
  "journal-detail",
  "journal-approval",
  "journal-reversal",
  "recurring-journals",
] as const;
export type FinanceJournalPage = (typeof financeJournalPages)[number];

type Navigate = (
  moduleId: string,
  pageId: string,
  recordRef?: string,
  options?: { bypassUnsavedGuard?: boolean },
) => void;
type DraftLine = JournalLineInput & { client_id: string };

const today = () => {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};
const emptyLine = (): DraftLine => ({
  client_id: crypto.randomUUID(),
  account_id: "",
  description: "",
  debit: "0",
  credit: "0",
  dimensions: {},
});
const key = (action: string) => `web-finance-journal-${action}-${crypto.randomUUID()}`;
const errorText = (error: unknown) =>
  error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "The Journal request failed safely.";
const money = (value: string, currency: string) => {
  const [whole = "0", fraction = ""] = value.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const decimals = fraction.replace(/0+$/, "").padEnd(2, "0");
  return `${currency} ${grouped}${decimals ? `.${decimals}` : ""}`;
};
const linePayload = (lines: DraftLine[]): JournalLineInput[] =>
  lines.map(({ account_id, description, debit, credit, dimensions }) => ({
    account_id,
    description: description.trim(),
    debit: debit || "0",
    credit: credit || "0",
    dimensions,
  }));
const requiredDimensionErrors = (lines: DraftLine[], options: JournalOptions | null) =>
  lines.flatMap((line, index) => {
    const nominal = options?.nominals.find((item) => item.id === line.account_id);
    return (nominal?.required_dimensions ?? [])
      .filter((dimension) => !line.dimensions[dimension]?.trim())
      .map((dimension) => `Line ${index + 1}: enter the required ${dimension.replaceAll("_", " ")} dimension.`);
  });

export function FinanceJournalWorkspace({
  page,
  recordRef,
  onNavigate,
  onDirtyChange,
}: {
  page: FinanceJournalPage;
  recordRef?: string;
  onNavigate: Navigate;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const notify = useActionFeedback();
  const client = useMemo(() => new FinanceJournalsClient(api), [api]);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);
  const recurring = page === "recurring-journals";
  const canRead = permissions.has(recurring ? "finance.recurring_journal.read" : "finance.journal.read");
  const [options, setOptions] = useState<JournalOptions | null>(null);
  const [companyId, setCompanyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadOptions = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const initial = await client.options();
      const selected = companyId || initial.companies[0]?.id || "";
      setCompanyId(selected);
      setOptions(selected ? await client.options(selected) : initial);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, companyId]);

  useEffect(() => {
    if (sessionLoading || !session || !canRead) return;
    const timer = window.setTimeout(() => void loadOptions(), 0);
    return () => window.clearTimeout(timer);
  }, [canRead, loadOptions, session, sessionLoading]);
  useEffect(() => {
    if (!companyId || !canRead) return;
    let active = true;
    client
      .options(companyId)
      .then((value) => active && setOptions(value))
      .catch((caught) => active && setError(errorText(caught)));
    return () => {
      active = false;
    };
  }, [canRead, client, companyId]);

  if (sessionLoading) return <Notice title="Checking Finance access" detail="Confirming Journal permissions." />;
  if (!session) return <Notice title="Sign in required" detail="An authenticated Nexora session is required." />;
  if (!canRead)
    return (
      <Notice
        title="Permission required"
        detail={`The ${recurring ? "Recurring Journal" : "Journal"} read permission is required.`}
      />
    );

  const common = { client, companyId, options, csrfToken, permissions, notify, setError, onNavigate };
  return (
    <div className="space-y-5" aria-busy={loading}>
      <WorkspaceHeader
        page={page}
        companyId={companyId}
        options={options}
        onCompany={setCompanyId}
        onNavigate={onNavigate}
        permissions={permissions}
      />
      {error ? <Notice title="Journal request could not be completed" detail={error} destructive /> : null}
      {page === "journal-register" ? <JournalRegister key={companyId} {...common} /> : null}
      {page === "manual-journal" ? (
        <ManualJournalForm
          key={`${companyId}:${recordRef ?? "new"}`}
          {...common}
          journalId={recordRef}
          onDirtyChange={onDirtyChange}
        />
      ) : null}
      {page === "journal-detail" ? (
        <JournalDetailView key={`${companyId}:${recordRef ?? "none"}`} {...common} journalId={recordRef} />
      ) : null}
      {page === "journal-approval" ? <JournalApproval key={companyId} {...common} initialId={recordRef} /> : null}
      {page === "journal-reversal" ? <JournalReversal key={companyId} {...common} initialId={recordRef} /> : null}
      {page === "recurring-journals" ? <RecurringJournals key={companyId} {...common} /> : null}
    </div>
  );
}

type Common = {
  client: FinanceJournalsClient;
  companyId: string;
  options: JournalOptions | null;
  csrfToken: () => string;
  permissions: Set<string>;
  notify: (message: string) => void;
  setError: (message: string) => void;
  onNavigate: Navigate;
};

function WorkspaceHeader({
  page,
  companyId,
  options,
  onCompany,
  onNavigate,
  permissions,
}: {
  page: FinanceJournalPage;
  companyId: string;
  options: JournalOptions | null;
  onCompany: (id: string) => void;
  onNavigate: Navigate;
  permissions: Set<string>;
}) {
  const titles: Record<FinanceJournalPage, [string, string]> = {
    "journal-register": ["Journals", "One register for Manual, Bank, Payroll and other posted accounting sources."],
    "manual-journal": ["Manual Journal", "Prepare a balanced draft in the company base currency."],
    "journal-detail": ["Journal Detail", "Inspect lines, source ownership and immutable lifecycle evidence."],
    "journal-approval": [
      "Journal Approval & Posting",
      "Complete final review before creating an immutable ledger entry.",
    ],
    "journal-reversal": ["Journal Reversal", "Create a governed compensating entry for a posted Manual Journal."],
    "recurring-journals": ["Recurring Journals", "Schedule monthly or quarterly templates that generate drafts only."],
  };
  return (
    <header className="border-b border-border pb-4">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-sm text-primary">Home / Finance / Journals</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{titles[page][0]}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{titles[page][1]}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="grid min-w-64 gap-1">
            <Label htmlFor="journal-company">Company</Label>
            <select
              id="journal-company"
              className="h-10 rounded-md border border-input bg-background px-3"
              value={companyId}
              onChange={(event) => onCompany(event.target.value)}
            >
              {options?.companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.code} · {company.name}
                </option>
              ))}
            </select>
          </div>
          {options?.base_currency ? (
            <Badge variant="outline" className="h-10 px-3">
              Base currency · {options.base_currency}
            </Badge>
          ) : null}
          {page === "journal-register" && permissions.has("finance.journal.create") ? (
            <Button onClick={() => onNavigate("finance", "manual-journal")}>＋ Add New</Button>
          ) : null}
        </div>
      </div>
    </header>
  );
}

function JournalRegister({ client, companyId, options, onNavigate, setError }: Common) {
  const [items, setItems] = useState<JournalSummary[]>([]);
  const [state, setState] = useState("");
  const [source, setSource] = useState("");
  const [nominalId, setNominalId] = useState("");
  const [reference, setReference] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [filters, setFilters] = useState({
    state: "",
    source: "",
    nominalId: "",
    reference: "",
    dateFrom: "",
    dateTo: "",
  });
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    if (!companyId) return;
    setBusy(true);
    try {
      const result = await client.list({
        company_id: companyId,
        ...(filters.state ? { state: filters.state as "draft" | "submitted" | "posted" | "reversed" } : {}),
        ...(filters.source ? { source: filters.source as "manual" | "bank" | "payroll" | "finance" | "other" } : {}),
        ...(filters.nominalId ? { nominal_id: filters.nominalId } : {}),
        ...(filters.reference ? { reference: filters.reference } : {}),
        ...(filters.dateFrom ? { date_from: filters.dateFrom } : {}),
        ...(filters.dateTo ? { date_to: filters.dateTo } : {}),
        approval_queue: false,
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      setItems(result.items);
      setNextCursor(result.next_cursor);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  }, [client, companyId, cursor, filters, setError]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const apply = () => {
    setFilters({
      state,
      source,
      nominalId,
      reference: reference.trim(),
      dateFrom,
      dateTo,
    });
    setCursor(undefined);
    setCursorHistory([]);
  };
  const clear = () => {
    setState("");
    setSource("");
    setNominalId("");
    setReference("");
    setDateFrom("");
    setDateTo("");
    setFilters({ state: "", source: "", nominalId: "", reference: "", dateFrom: "", dateTo: "" });
    setCursor(undefined);
    setCursorHistory([]);
  };
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="grid gap-3 border-b border-border p-4 md:grid-cols-2 xl:grid-cols-[1fr_11rem_11rem_1fr_10rem_10rem_auto]">
        <Input
          aria-label="Reference search"
          placeholder="Reference or source"
          value={reference}
          onChange={(event) => setReference(event.target.value)}
        />
        <select
          aria-label="State"
          className="h-10 rounded-md border border-input bg-background px-3"
          value={state}
          onChange={(event) => setState(event.target.value)}
        >
          <option value="">All states</option>
          <option value="draft">Draft</option>
          <option value="submitted">Submitted</option>
          <option value="posted">Posted</option>
          <option value="reversed">Reversed</option>
        </select>
        <select
          aria-label="Source"
          className="h-10 rounded-md border border-input bg-background px-3"
          value={source}
          onChange={(event) => setSource(event.target.value)}
        >
          <option value="">All sources</option>
          <option value="manual">Manual</option>
          <option value="bank">Bank</option>
          <option value="payroll">Payroll</option>
          <option value="finance">Finance</option>
          <option value="other">Other</option>
        </select>
        <select
          aria-label="Nominal account"
          className="h-10 rounded-md border border-input bg-background px-3"
          value={nominalId}
          onChange={(event) => setNominalId(event.target.value)}
        >
          <option value="">All nominals</option>
          {options?.nominals.map((nominal) => (
            <option key={nominal.id} value={nominal.id}>
              {nominal.code} · {nominal.name}
            </option>
          ))}
        </select>
        <Input
          aria-label="Date from"
          type="date"
          value={dateFrom}
          onChange={(event) => setDateFrom(event.target.value)}
        />
        <Input aria-label="Date to" type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
        <div className="flex gap-2">
          <Button variant="outline" onClick={clear}>
            Clear
          </Button>
          <Button onClick={apply}>Apply</Button>
        </div>
      </div>
      <JournalTable items={items} busy={busy} onOpen={(item) => onNavigate("finance", "journal-detail", item.id)} />
      <Pagination
        busy={busy}
        hasPrevious={cursorHistory.length > 0}
        hasNext={Boolean(nextCursor)}
        onPrevious={() => {
          const previous = cursorHistory.at(-1);
          setCursorHistory((value) => value.slice(0, -1));
          setCursor(previous);
        }}
        onNext={() => {
          if (!nextCursor) return;
          setCursorHistory((value) => [...value, cursor]);
          setCursor(nextCursor);
        }}
      />
    </section>
  );
}

function JournalTable({
  items,
  busy,
  onOpen,
}: {
  items: JournalSummary[];
  busy: boolean;
  onOpen: (item: JournalSummary) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[920px] text-sm">
        <thead className="bg-primary text-left text-primary-foreground">
          <tr>
            {["Journal ID", "Date", "Reference", "Source", "State", "Total", "Action"].map((label) => (
              <th key={label} className="px-4 py-3 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {busy ? (
            <tr>
              <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                Loading Journals…
              </td>
            </tr>
          ) : null}
          {items.map((item) => (
            <tr key={item.id} className="border-t border-border">
              <td className="px-4 py-3 font-semibold text-primary">{item.display_number}</td>
              <td className="px-4 py-3">{item.journal_date}</td>
              <td className="px-4 py-3">{item.reference_number ?? "—"}</td>
              <td className="px-4 py-3">{item.source_label}</td>
              <td className="px-4 py-3">
                <StateBadge state={item.state} />
              </td>
              <td className="px-4 py-3 text-right tabular-nums">{money(item.total, item.currency)}</td>
              <td className="px-4 py-3">
                <Button size="sm" variant="outline" onClick={() => onOpen(item)}>
                  View
                </Button>
              </td>
            </tr>
          ))}
          {!busy && items.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                No Journals match the current filters.
              </td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}

function ManualJournalForm({
  client,
  companyId,
  options,
  csrfToken,
  permissions,
  notify,
  setError,
  onNavigate,
  journalId,
  onDirtyChange,
}: Common & { journalId?: string; onDirtyChange?: (dirty: boolean) => void }) {
  const [date, setDate] = useState(today());
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [busy, setBusy] = useState("");
  const [loadingDetail, setLoadingDetail] = useState(Boolean(journalId));
  const [dirty, setDirty] = useState(false);
  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirmed, setDeleteConfirmed] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  useEffect(() => {
    onDirtyChange?.(dirty);
    return () => onDirtyChange?.(false);
  }, [dirty, onDirtyChange]);
  useEffect(() => {
    if (!journalId) return;
    client
      .detail(journalId)
      .then((value) => {
        setDetail(value);
        setDate(value.journal_date);
        setReference(value.reference_number ?? "");
        setLines(
          value.lines.map((line) => ({
            client_id: line.id,
            account_id: line.account_id,
            description: line.description,
            debit: line.debit,
            credit: line.credit,
            dimensions: line.dimensions,
          })),
        );
        setDirty(false);
      })
      .catch((caught) => setError(errorText(caught)))
      .finally(() => setLoadingDetail(false));
  }, [client, journalId, setError]);
  const decimalPlaces = options?.decimal_places ?? 2;
  const validation = useMemo(() => validateJournalLines(linePayload(lines), decimalPlaces), [decimalPlaces, lines]);
  const validate = () => {
    const errors = [...validation.errors, ...requiredDimensionErrors(lines, options)];
    if (!date) errors.unshift("Select the Journal date.");
    setValidationErrors(errors);
    return errors.length === 0;
  };
  const save = async () => {
    if (!companyId || !validate()) return;
    setBusy("save");
    try {
      const payload = {
        journal_date: date,
        ...(reference.trim() ? { reference_number: reference.trim() } : {}),
        lines: linePayload(lines),
      };
      const result = detail?.version
        ? await client.update(detail.id, { ...payload, expected_version: detail.version }, csrfToken(), key("update"))
        : await client.create({ ...payload, company_id: companyId }, csrfToken(), key("create"));
      setDirty(false);
      notify("Manual Journal draft saved.");
      onNavigate("finance", "journal-detail", result.id, { bypassUnsavedGuard: true });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  };
  const submit = async () => {
    if (!detail?.version || !validate()) return;
    setBusy("submit");
    try {
      await client.submit(detail.id, { expected_version: detail.version }, csrfToken(), key("submit"));
      notify("Journal submitted for final review.");
      onNavigate("finance", "journal-detail", detail.id, { bypassUnsavedGuard: true });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  };
  const remove = async () => {
    if (!detail?.version || deleteReason.trim().length < 3 || !deleteConfirmed) return;
    setBusy("delete");
    try {
      await client.delete(
        detail.id,
        { expected_version: detail.version, reason: deleteReason.trim() },
        csrfToken(),
        key("delete"),
      );
      setDirty(false);
      notify("Draft Journal content permanently deleted; audit tombstone retained.");
      onNavigate("finance", "journal-register", undefined, { bypassUnsavedGuard: true });
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy("");
    }
  };
  const editable = !detail || detail.state === "draft";
  if (loadingDetail) return <Notice title="Loading Journal" detail="Reading the draft and its current version." />;
  return (
    <section className="space-y-4 rounded-lg border border-border bg-card p-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="journal-date">Date *</Label>
          <Input
            id="journal-date"
            type="date"
            value={date}
            disabled={!editable}
            onChange={(event) => {
              setDate(event.target.value);
              setDirty(true);
            }}
          />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="journal-reference">Ref. No.</Label>
          <Input
            id="journal-reference"
            value={reference}
            disabled={!editable}
            onChange={(event) => {
              setReference(event.target.value);
              setDirty(true);
            }}
          />
        </div>
      </div>
      <LineEditor
        lines={lines}
        options={options}
        disabled={!editable}
        onChange={(value) => {
          setLines(value);
          setDirty(true);
        }}
      />
      {validationErrors.length ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Review the Journal form</AlertTitle>
          <AlertDescription>
            <ul className="list-disc space-y-1 pl-5">
              {validationErrors.map((message) => (
                <li key={message}>{message}</li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-end">
        <div
          className={`grid min-w-80 grid-cols-2 border text-right tabular-nums ${validation.debit === validation.credit && validation.debit > 0n ? "border-[var(--nx-success-border)]" : "border-destructive/40"}`}
        >
          <span className="bg-muted px-4 py-3 font-semibold">
            {formatJournalAmount(validation.debit, decimalPlaces)}
          </span>
          <span className="bg-muted px-4 py-3 font-semibold">
            {formatJournalAmount(validation.credit, decimalPlaces)}
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end sm:justify-between">
        <Button variant="outline" onClick={() => onNavigate("finance", "journal-register")}>
          Cancel
        </Button>
        <div className="flex flex-wrap items-end justify-end gap-2">
          {detail?.capabilities.delete_draft ? (
            <div className="grid gap-1">
              <Label htmlFor="delete-reason">Permanent deletion reason</Label>
              <Input
                id="delete-reason"
                value={deleteReason}
                onChange={(event) => setDeleteReason(event.target.value)}
              />
            </div>
          ) : null}
          {detail?.capabilities.delete_draft ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="confirm-draft-delete"
                checked={deleteConfirmed}
                onCheckedChange={(value) => setDeleteConfirmed(value === true)}
              />
              <Label htmlFor="confirm-draft-delete" className="font-normal">
                Confirm permanent deletion
              </Label>
            </div>
          ) : null}
          {detail?.capabilities.delete_draft ? (
            <Button
              variant="destructive"
              disabled={busy !== "" || deleteReason.trim().length < 3 || !deleteConfirmed}
              onClick={() => void remove()}
            >
              Delete draft permanently
            </Button>
          ) : null}
          {editable && permissions.has(detail ? "finance.journal.update" : "finance.journal.create") ? (
            <Button variant="outline" disabled={busy !== "" || lines.length < 2} onClick={() => void save()}>
              {busy === "save" ? "Saving…" : "Save draft"}
            </Button>
          ) : null}
          {detail?.capabilities.submit ? (
            <Button disabled={busy !== "" || validation.errors.length > 0} onClick={() => void submit()}>
              Submit for approval
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function LineEditor({
  lines,
  options,
  disabled,
  onChange,
}: {
  lines: DraftLine[];
  options: JournalOptions | null;
  disabled?: boolean;
  onChange: (lines: DraftLine[]) => void;
}) {
  const change = (index: number, field: keyof JournalLineInput, value: string) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, [field]: value } : line)));
  const changeAccount = (index: number, accountId: string) =>
    onChange(lines.map((line, i) => (i === index ? { ...line, account_id: accountId, dimensions: {} } : line)));
  const changeDimension = (index: number, dimension: string, value: string) =>
    onChange(
      lines.map((line, i) =>
        i === index ? { ...line, dimensions: { ...line.dimensions, [dimension]: value } } : line,
      ),
    );
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-sm">
        <thead className="bg-primary text-left text-primary-foreground">
          <tr>
            <th className="px-3 py-3">Nominal Account</th>
            <th className="px-3 py-3">Description</th>
            <th className="px-3 py-3">Required Dimensions</th>
            <th className="px-3 py-3 text-right">Debit</th>
            <th className="px-3 py-3 text-right">Credit</th>
            <th className="w-20 px-3 py-3">Action</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.client_id} className="border-t border-border">
              <td className="p-2">
                <select
                  aria-label={`Nominal account line ${index + 1}`}
                  className="h-10 w-full rounded-md border border-input bg-background px-2"
                  value={line.account_id}
                  disabled={disabled}
                  onChange={(event) => changeAccount(index, event.target.value)}
                >
                  <option value="">Select nominal</option>
                  {options?.nominals.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} · {item.name}
                    </option>
                  ))}
                </select>
              </td>
              <td className="p-2">
                <Input
                  aria-label={`Description line ${index + 1}`}
                  value={line.description}
                  disabled={disabled}
                  onChange={(event) => change(index, "description", event.target.value)}
                />
              </td>
              <td className="p-2">
                {(() => {
                  const dimensions =
                    options?.nominals.find((item) => item.id === line.account_id)?.required_dimensions ?? [];
                  if (dimensions.length === 0) return <span className="text-muted-foreground">—</span>;
                  return (
                    <div className="grid gap-2">
                      {dimensions.map((dimension) => (
                        <Input
                          key={dimension}
                          aria-label={`${dimension.replaceAll("_", " ")} dimension line ${index + 1}`}
                          placeholder={dimension.replaceAll("_", " ")}
                          value={line.dimensions[dimension] ?? ""}
                          disabled={disabled}
                          onChange={(event) => changeDimension(index, dimension, event.target.value)}
                        />
                      ))}
                    </div>
                  );
                })()}
              </td>
              <td className="p-2">
                <Input
                  aria-label={`Debit line ${index + 1}`}
                  className="text-right tabular-nums"
                  inputMode="decimal"
                  value={line.debit}
                  disabled={disabled}
                  onChange={(event) => change(index, "debit", event.target.value || "0")}
                />
              </td>
              <td className="p-2">
                <Input
                  aria-label={`Credit line ${index + 1}`}
                  className="text-right tabular-nums"
                  inputMode="decimal"
                  value={line.credit}
                  disabled={disabled}
                  onChange={(event) => change(index, "credit", event.target.value || "0")}
                />
              </td>
              <td className="p-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={disabled || lines.length <= 2}
                  onClick={() => onChange(lines.filter((_, i) => i !== index))}
                >
                  Remove
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {!disabled ? (
        <Button type="button" className="mt-3" variant="outline" onClick={() => onChange([...lines, emptyLine()])}>
          ＋ Add More
        </Button>
      ) : null}
    </div>
  );
}

function JournalDetailView({ client, journalId, setError, onNavigate }: Common & { journalId?: string }) {
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  useEffect(() => {
    if (!journalId) return;
    client
      .detail(journalId)
      .then(setDetail)
      .catch((caught) => setError(errorText(caught)));
  }, [client, journalId, setError]);
  if (!journalId)
    return <Notice title="Select a Journal" detail="Open a Journal from the register to view its detail." />;
  if (!detail) return <Notice title="Loading Journal" detail="Reading lines and lifecycle evidence." />;
  return (
    <div className="space-y-4">
      <section className="rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm text-muted-foreground">{detail.source_label}</p>
            <h2 className="text-2xl font-semibold">{detail.display_number}</h2>
            <p className="mt-1 text-sm">
              {detail.journal_date} · {detail.reference_number ?? "No reference"}
            </p>
          </div>
          <div className="flex gap-2">
            <StateBadge state={detail.state} />
            {detail.capabilities.update ? (
              <Button variant="outline" onClick={() => onNavigate("finance", "manual-journal", detail.id)}>
                Edit draft
              </Button>
            ) : null}
            {detail.capabilities.approve || detail.capabilities.reject ? (
              <Button onClick={() => onNavigate("finance", "journal-approval", detail.id)}>Final review</Button>
            ) : null}
            {detail.capabilities.reverse ? (
              <Button variant="destructive" onClick={() => onNavigate("finance", "journal-reversal", detail.id)}>
                Reverse
              </Button>
            ) : null}
          </div>
        </div>
      </section>
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-primary text-left text-primary-foreground">
              <tr>
                {["Nominal Account", "Description", "Dimensions", "Debit", "Credit"].map((value) => (
                  <th key={value} className="px-4 py-3">
                    {value}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {detail.lines.map((line) => (
                <tr key={line.id} className="border-t border-border">
                  <td className="px-4 py-3 font-medium">
                    {line.account_code} · {line.account_name}
                  </td>
                  <td className="px-4 py-3">{line.description}</td>
                  <td className="px-4 py-3">
                    {Object.entries(line.dimensions).length
                      ? Object.entries(line.dimensions)
                          .map(([dimension, value]) => `${dimension.replaceAll("_", " ")}: ${value}`)
                          .join(" · ")
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(line.debit) ? line.debit : "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{Number(line.credit) ? line.credit : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-right font-semibold">
          Total · {money(detail.total, detail.currency)}
        </div>
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        <h3 className="font-semibold">Lifecycle evidence</h3>
        <ol className="mt-3 space-y-2">
          {detail.events.map((event) => (
            <li
              key={event.id}
              className="flex flex-col justify-between gap-1 border-l-2 border-primary/30 pl-3 text-sm sm:flex-row"
            >
              <span>
                <strong className="capitalize">{event.event_type}</strong> by {event.actor_name}
                {event.reason ? ` · ${event.reason}` : ""}
              </span>
              <time className="text-muted-foreground">{new Date(event.occurred_at).toLocaleString()}</time>
            </li>
          ))}
          {detail.events.length === 0 ? (
            <li className="text-sm text-muted-foreground">Source evidence is owned by the originating module.</li>
          ) : null}
        </ol>
      </section>
    </div>
  );
}

function JournalApproval({
  client,
  companyId,
  csrfToken,
  notify,
  setError,
  initialId,
}: Common & { initialId?: string }) {
  const [items, setItems] = useState<JournalSummary[]>([]);
  const [selected, setSelected] = useState(initialId ?? "");
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const result = await client.list({
        company_id: companyId,
        approval_queue: true,
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      setItems(result.items);
      setNextCursor(result.next_cursor);
      setSelected((value) => value || result.items[0]?.id || "");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, companyId, cursor, setError]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (!selected) return;
    client
      .detail(selected)
      .then(setDetail)
      .catch((caught) => setError(errorText(caught)));
  }, [client, selected, setError]);
  const decide = async (action: "reject" | "post") => {
    if (!detail?.version) return;
    setBusy(true);
    try {
      await client.decide(
        detail.id,
        {
          expected_version: detail.version,
          action,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
          ...(note.trim() ? { approval_note: note.trim() } : {}),
          confirmed: action === "post" && confirmed,
        },
        csrfToken(),
        key(action),
      );
      notify(action === "post" ? "Journal confirmed and posted." : "Journal rejected back to draft.");
      setSelected("");
      setDetail(null);
      setReason("");
      setNote("");
      setConfirmed(false);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 xl:grid-cols-[22rem_1fr]">
      <aside className="rounded-lg border border-border bg-card">
        <div className="border-b border-border p-4 font-semibold">Submitted queue</div>
        {loading ? <p className="p-6 text-sm text-muted-foreground">Loading submitted Journals…</p> : null}
        {items.map((item) => (
          <button
            type="button"
            key={item.id}
            className={`block w-full border-b border-border p-4 text-left hover:bg-muted/40 ${selected === item.id ? "bg-primary/10" : ""}`}
            onClick={() => setSelected(item.id)}
          >
            <strong>{item.display_number}</strong>
            <span className="mt-1 block text-sm text-muted-foreground">
              {item.journal_date} · {money(item.total, item.currency)}
            </span>
          </button>
        ))}
        {items.length === 0 ? <p className="p-6 text-sm text-muted-foreground">No Journals await approval.</p> : null}
        <Pagination
          busy={loading}
          hasPrevious={cursorHistory.length > 0}
          hasNext={Boolean(nextCursor)}
          onPrevious={() => {
            setSelected("");
            setDetail(null);
            setCursorHistory((value) => value.slice(0, -1));
            setCursor(cursorHistory.at(-1));
          }}
          onNext={() => {
            if (!nextCursor) return;
            setSelected("");
            setDetail(null);
            setCursorHistory((value) => [...value, cursor]);
            setCursor(nextCursor);
          }}
        />
      </aside>
      <section className="rounded-lg border border-border bg-card p-4">
        {detail ? (
          <>
            <div className="flex flex-wrap justify-between gap-3">
              <div>
                <h2 className="text-xl font-semibold">{detail.display_number}</h2>
                <p className="text-sm text-muted-foreground">
                  Prepared by {detail.maker_user_id} · {detail.currency} base currency
                </p>
              </div>
              <Badge variant="outline">Balanced · {money(detail.total, detail.currency)}</Badge>
            </div>
            <div className="mt-4">
              <ReadOnlyLines detail={detail} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="decision-note">Approval note</Label>
                <Textarea id="decision-note" value={note} onChange={(event) => setNote(event.target.value)} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="decision-reason">Rejection / override reason</Label>
                <Textarea id="decision-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
            </div>
            <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Checkbox
                id="journal-final-confirmation"
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              <Label htmlFor="journal-final-confirmation" className="text-sm font-normal">
                <strong>Final review confirmed.</strong>
                <br />I verified the date, base-currency lines, nominal accounts, balance and supporting reference.
              </Label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="outline"
                disabled={busy || reason.trim().length < 3 || !detail.capabilities.reject}
                onClick={() => void decide("reject")}
              >
                Reject to draft
              </Button>
              <Button
                disabled={
                  busy ||
                  !confirmed ||
                  !detail.capabilities.approve ||
                  (detail.capabilities.self_approval_required &&
                    detail.capabilities.super_admin_override_available &&
                    reason.trim().length < 3)
                }
                onClick={() => void decide("post")}
              >
                Approve and Post
              </Button>
            </div>
          </>
        ) : (
          <Notice
            title="Select a submitted Journal"
            detail="Choose an item from the approval queue for final review."
          />
        )}
      </section>
    </div>
  );
}

function JournalReversal({
  client,
  companyId,
  csrfToken,
  notify,
  setError,
  initialId,
}: Common & { initialId?: string }) {
  const [items, setItems] = useState<JournalSummary[]>([]);
  const [selected, setSelected] = useState(initialId ?? "");
  const [detail, setDetail] = useState<JournalDetail | null>(null);
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const result = await client.list({
        company_id: companyId,
        source: "manual",
        state: "posted",
        approval_queue: false,
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      setItems(result.items);
      setNextCursor(result.next_cursor);
      setSelected((value) => value || result.items[0]?.id || "");
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, companyId, cursor, setError]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    if (selected)
      client
        .detail(selected)
        .then(setDetail)
        .catch((caught) => setError(errorText(caught)));
  }, [client, selected, setError]);
  const reverse = async () => {
    if (!detail?.version || date < detail.journal_date || reason.trim().length < 3 || !confirmed) return;
    setBusy(true);
    try {
      await client.reverse(
        detail.id,
        { expected_version: detail.version, reversal_date: date, reason: reason.trim() },
        csrfToken(),
        key("reverse"),
      );
      notify("Compensating reversal posted.");
      setDetail(null);
      setSelected("");
      setReason("");
      setConfirmed(false);
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
      <section className="rounded-lg border border-border bg-card p-4">
        <Label htmlFor="reversal-source">Posted Manual Journal</Label>
        <select
          id="reversal-source"
          className="mt-2 h-10 w-full rounded-md border border-input bg-background px-3"
          value={selected}
          onChange={(event) => setSelected(event.target.value)}
        >
          <option value="">Select Journal</option>
          {items.map((item) => (
            <option key={item.id} value={item.id}>
              {item.display_number} · {item.journal_date}
            </option>
          ))}
        </select>
        {loading ? <p className="mt-3 text-sm text-muted-foreground">Loading posted Journals…</p> : null}
        <Pagination
          busy={loading}
          hasPrevious={cursorHistory.length > 0}
          hasNext={Boolean(nextCursor)}
          onPrevious={() => {
            setSelected("");
            setDetail(null);
            setCursorHistory((value) => value.slice(0, -1));
            setCursor(cursorHistory.at(-1));
          }}
          onNext={() => {
            if (!nextCursor) return;
            setSelected("");
            setDetail(null);
            setCursorHistory((value) => [...value, cursor]);
            setCursor(nextCursor);
          }}
        />
      </section>
      <section className="rounded-lg border border-border bg-card p-4">
        {detail ? (
          <>
            <h2 className="text-xl font-semibold">Reverse {detail.display_number}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The original posting remains immutable. A new compensating Journal will be posted.
            </p>
            <div className="mt-4">
              <ReadOnlyLines detail={detail} />
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="reversal-date">Reversal date</Label>
                <Input
                  id="reversal-date"
                  type="date"
                  min={detail.journal_date}
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="reversal-reason">Reason</Label>
                <Input id="reversal-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
              </div>
            </div>
            {date < detail.journal_date ? (
              <p className="mt-3 text-sm text-destructive">The reversal date cannot be before {detail.journal_date}.</p>
            ) : null}
            <div className="mt-4 flex items-start gap-3 rounded-md border border-border bg-muted/30 p-3">
              <Checkbox
                id="confirm-reversal"
                checked={confirmed}
                onCheckedChange={(value) => setConfirmed(value === true)}
              />
              <Label htmlFor="confirm-reversal" className="font-normal">
                I confirm this creates an immutable compensating posting; it does not alter the original Journal.
              </Label>
            </div>
            <div className="mt-4 flex justify-end">
              <Button
                variant="destructive"
                disabled={
                  busy ||
                  !confirmed ||
                  date < detail.journal_date ||
                  reason.trim().length < 3 ||
                  !detail.capabilities.reverse
                }
                onClick={() => void reverse()}
              >
                Post compensating reversal
              </Button>
            </div>
          </>
        ) : (
          <Notice
            title="Select a posted Manual Journal"
            detail="Bank and Payroll sources must be reversed in their owning module."
          />
        )}
      </section>
    </div>
  );
}

function RecurringJournals({ client, companyId, options, csrfToken, permissions, notify, setError }: Common) {
  const [items, setItems] = useState<RecurringJournalTemplate[]>([]);
  const [selected, setSelected] = useState<RecurringJournalTemplate | null>(null);
  const [status, setStatus] = useState<"" | "active" | "inactive">("");
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorHistory, setCursorHistory] = useState<(string | undefined)[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState<"monthly" | "quarterly">("monthly");
  const [start, setStart] = useState(today());
  const [end, setEnd] = useState("");
  const [reference, setReference] = useState("");
  const [narration, setNarration] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([emptyLine(), emptyLine()]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formErrors, setFormErrors] = useState<string[]>([]);
  const [pendingStatus, setPendingStatus] = useState<RecurringJournalTemplate | null>(null);
  const [historyTemplate, setHistoryTemplate] = useState<RecurringJournalTemplate | null>(null);
  const [occurrences, setOccurrences] = useState<RecurringJournalOccurrenceDirectory["items"]>([]);
  const [occurrenceCursor, setOccurrenceCursor] = useState<string | undefined>();
  const [occurrenceHistory, setOccurrenceHistory] = useState<(string | undefined)[]>([]);
  const [occurrenceNext, setOccurrenceNext] = useState<string | null>(null);
  const [occurrenceLoading, setOccurrenceLoading] = useState(false);
  const canManage = permissions.has("finance.recurring_journal.manage");
  const decimalPlaces = options?.decimal_places ?? 2;
  const lineValidation = useMemo(() => validateJournalLines(linePayload(lines), decimalPlaces), [decimalPlaces, lines]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const result = await client.recurring({
        company_id: companyId,
        ...(status ? { status } : {}),
        limit: 25,
        ...(cursor ? { cursor } : {}),
      });
      setItems(result.items);
      setNextCursor(result.next_cursor);
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setLoading(false);
    }
  }, [client, companyId, cursor, setError, status]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const loadOccurrences = useCallback(
    async (item: RecurringJournalTemplate, next?: string) => {
      setOccurrenceLoading(true);
      try {
        const result = await client.occurrences(item.id, { limit: 25, ...(next ? { cursor: next } : {}) });
        setOccurrences(result.items);
        setOccurrenceNext(result.next_cursor);
        setHistoryTemplate(item);
      } catch (caught) {
        setError(errorText(caught));
      } finally {
        setOccurrenceLoading(false);
      }
    },
    [client, setError],
  );
  const openHistory = (item: RecurringJournalTemplate) => {
    setOccurrenceCursor(undefined);
    setOccurrenceHistory([]);
    void loadOccurrences(item);
  };
  const edit = (item: RecurringJournalTemplate) => {
    setSelected(item);
    setName(item.name);
    setSchedule(item.schedule);
    setStart(item.start_date);
    setEnd(item.end_date ?? "");
    setReference(item.reference_pattern ?? "");
    setNarration(item.narration);
    setLines(item.lines.map((line) => ({ ...line, client_id: crypto.randomUUID() })));
    setFormErrors([]);
  };
  const reset = () => {
    setSelected(null);
    setName("");
    setSchedule("monthly");
    setStart(today());
    setEnd("");
    setReference("");
    setNarration("");
    setLines([emptyLine(), emptyLine()]);
    setFormErrors([]);
  };
  const validate = () => {
    const errors = [...lineValidation.errors, ...requiredDimensionErrors(lines, options)];
    if (!name.trim()) errors.unshift("Enter a template name.");
    if (!narration.trim()) errors.push("Enter a narration.");
    if (!start) errors.push("Select a start date.");
    if (end && start && end < start) errors.push("The end date cannot be before the start date.");
    setFormErrors(errors);
    return errors.length === 0;
  };
  const save = async () => {
    if (!companyId || !validate()) return;
    setBusy(true);
    try {
      const input = {
        name: name.trim(),
        schedule,
        start_date: start,
        ...(end ? { end_date: end } : {}),
        ...(reference.trim() ? { reference_pattern: reference.trim() } : {}),
        narration: narration.trim(),
        lines: linePayload(lines),
      };
      if (selected) {
        await client.updateRecurring(
          selected.id,
          { ...input, expected_version: selected.version },
          csrfToken(),
          key("recurring-update"),
        );
        notify("Recurring Journal template updated.");
      } else {
        await client.createRecurring({ ...input, company_id: companyId }, csrfToken(), key("recurring-create"));
        notify("Recurring Journal template saved inactive for review.");
      }
      reset();
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  const confirmStatus = async () => {
    if (!pendingStatus || reason.trim().length < 3) return;
    setBusy(true);
    try {
      const action = pendingStatus.status === "active" ? "inactivate" : "activate";
      await client.recurringStatus(
        pendingStatus.id,
        { expected_version: pendingStatus.version, action, reason: reason.trim() },
        csrfToken(),
        key("recurring-status"),
      );
      notify(`Recurring Journal ${action === "activate" ? "activated" : "inactivated"}.`);
      setPendingStatus(null);
      setReason("");
      await load();
    } catch (caught) {
      setError(errorText(caught));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-4">
      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border p-4">
          <Field label="Template status">
            <select
              aria-label="Template status"
              className="h-10 min-w-48 rounded-md border border-input bg-background px-3"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as typeof status);
                setCursor(undefined);
                setCursorHistory([]);
              }}
            >
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </Field>
          <span className="text-sm text-muted-foreground">
            Worker output is draft-only and remains subject to the normal approval workflow.
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-sm">
            <thead className="bg-primary text-left text-primary-foreground">
              <tr>
                {["Template", "Schedule", "Next draft", "Last generated", "Status", "Action"].map((value) => (
                  <th key={value} className="px-4 py-3">
                    {value}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    Loading recurring templates…
                  </td>
                </tr>
              ) : null}
              {items.map((item) => (
                <tr key={item.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <strong>{item.name}</strong>
                    <span className="block text-muted-foreground">{item.narration}</span>
                  </td>
                  <td className="px-4 py-3 capitalize">{item.schedule}</td>
                  <td className="px-4 py-3">{item.next_scheduled_date ?? "Complete"}</td>
                  <td className="px-4 py-3">{item.last_generated_date ?? "Not generated"}</td>
                  <td className="px-4 py-3">
                    <Badge variant={item.status === "active" ? "default" : "outline"}>{item.status}</Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" onClick={() => openHistory(item)}>
                        History
                      </Button>
                      {canManage ? (
                        <Button size="sm" variant="outline" onClick={() => edit(item)}>
                          Edit
                        </Button>
                      ) : null}
                      {canManage ? (
                        <Button size="sm" variant="outline" disabled={busy} onClick={() => setPendingStatus(item)}>
                          {item.status === "active" ? "Inactivate" : "Activate"}
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No recurring templates match the selected status.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <Pagination
          busy={loading}
          hasPrevious={cursorHistory.length > 0}
          hasNext={Boolean(nextCursor)}
          onPrevious={() => {
            setCursorHistory((value) => value.slice(0, -1));
            setCursor(cursorHistory.at(-1));
          }}
          onNext={() => {
            if (nextCursor) {
              setCursorHistory((value) => [...value, cursor]);
              setCursor(nextCursor);
            }
          }}
        />
      </section>

      {pendingStatus ? (
        <section
          className="space-y-3 rounded-lg border border-border bg-card p-4"
          aria-label="Confirm recurring status change"
        >
          <h2 className="font-semibold">
            Confirm {pendingStatus.status === "active" ? "inactivation" : "activation"} of {pendingStatus.name}
          </h2>
          <p className="text-sm text-muted-foreground">
            Activation permits the worker to generate due drafts. It never posts them automatically.
          </p>
          <Field label="Status change reason">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </Field>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setPendingStatus(null);
                setReason("");
              }}
            >
              Cancel
            </Button>
            <Button disabled={busy || reason.trim().length < 3} onClick={() => void confirmStatus()}>
              Confirm status change
            </Button>
          </div>
        </section>
      ) : null}

      {historyTemplate ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border p-4">
            <h2 className="font-semibold">Generation history · {historyTemplate.name}</h2>
            <p className="text-sm text-muted-foreground">
              Failures remain isolated to their occurrence; exhausted retries require operator review.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted">
                <tr>
                  {["Scheduled date", "State", "Attempts", "Draft", "Last error", "Updated"].map((value) => (
                    <th key={value} className="px-4 py-3 text-left">
                      {value}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {occurrenceLoading ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      Loading generation history…
                    </td>
                  </tr>
                ) : null}
                {occurrences.map((occurrence) => (
                  <tr key={occurrence.id} className="border-t border-border">
                    <td className="px-4 py-3">{occurrence.scheduled_date}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          occurrence.state === "exhausted" || occurrence.state === "failed" ? "destructive" : "outline"
                        }
                      >
                        {occurrence.state.replaceAll("_", " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">{occurrence.attempt_count}</td>
                    <td className="px-4 py-3">{occurrence.manual_journal_id ?? "—"}</td>
                    <td className="px-4 py-3">{occurrence.last_error_code ?? "—"}</td>
                    <td className="px-4 py-3">{new Date(occurrence.updated_at).toLocaleString()}</td>
                  </tr>
                ))}
                {!occurrenceLoading && occurrences.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                      No occurrences have been generated.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <Pagination
            busy={occurrenceLoading}
            hasPrevious={occurrenceHistory.length > 0}
            hasNext={Boolean(occurrenceNext)}
            onPrevious={() => {
              const previous = occurrenceHistory.at(-1);
              setOccurrenceHistory((value) => value.slice(0, -1));
              setOccurrenceCursor(previous);
              void loadOccurrences(historyTemplate, previous);
            }}
            onNext={() => {
              if (occurrenceNext) {
                setOccurrenceHistory((value) => [...value, occurrenceCursor]);
                setOccurrenceCursor(occurrenceNext);
                void loadOccurrences(historyTemplate, occurrenceNext);
              }
            }}
          />
        </section>
      ) : null}

      {canManage ? (
        <section className="space-y-4 rounded-lg border border-border bg-card p-4">
          <h2 className="text-xl font-semibold">{selected ? `Edit ${selected.name}` : "Add recurring template"}</h2>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Field label="Name">
              <Input value={name} onChange={(event) => setName(event.target.value)} />
            </Field>
            <Field label="Schedule">
              <select
                className="h-10 rounded-md border border-input bg-background px-3"
                value={schedule}
                onChange={(event) => setSchedule(event.target.value as typeof schedule)}
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
              </select>
            </Field>
            <Field label="Start date">
              <Input type="date" value={start} onChange={(event) => setStart(event.target.value)} />
            </Field>
            <Field label="End date">
              <Input type="date" min={start} value={end} onChange={(event) => setEnd(event.target.value)} />
            </Field>
            <Field label="Reference pattern">
              <Input
                placeholder="Accrual {date}"
                value={reference}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
            <Field label="Narration">
              <Input value={narration} onChange={(event) => setNarration(event.target.value)} />
            </Field>
          </div>
          <LineEditor lines={lines} options={options} onChange={setLines} />
          {formErrors.length ? (
            <Alert variant="destructive">
              <AlertTitle>Review the recurring template</AlertTitle>
              <AlertDescription>
                <ul className="list-disc space-y-1 pl-5">
                  {formErrors.map((message) => (
                    <li key={message}>{message}</li>
                  ))}
                </ul>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={reset}>
              {selected ? "Cancel edit" : "Clear"}
            </Button>
            <Button disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save template"}
            </Button>
          </div>
        </section>
      ) : null}
    </div>
  );
}

function ReadOnlyLines({ detail }: { detail: JournalDetail }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[620px] text-sm">
        <thead className="bg-muted">
          <tr>
            <th className="px-3 py-2 text-left">Nominal</th>
            <th className="px-3 py-2 text-left">Description</th>
            <th className="px-3 py-2 text-left">Dimensions</th>
            <th className="px-3 py-2 text-right">Debit</th>
            <th className="px-3 py-2 text-right">Credit</th>
          </tr>
        </thead>
        <tbody>
          {detail.lines.map((line) => (
            <tr key={line.id} className="border-t border-border">
              <td className="px-3 py-2">
                {line.account_code} · {line.account_name}
              </td>
              <td className="px-3 py-2">{line.description}</td>
              <td className="px-3 py-2">
                {Object.entries(line.dimensions).length
                  ? Object.entries(line.dimensions)
                      .map(([dimension, value]) => `${dimension.replaceAll("_", " ")}: ${value}`)
                      .join(" · ")
                  : "—"}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{line.debit}</td>
              <td className="px-3 py-2 text-right tabular-nums">{line.credit}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function Pagination({
  busy,
  hasPrevious,
  hasNext,
  onPrevious,
  onNext,
}: {
  busy: boolean;
  hasPrevious: boolean;
  hasNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
}) {
  if (!hasPrevious && !hasNext) return null;
  return (
    <nav className="flex items-center justify-end gap-2 border-t border-border p-3" aria-label="Pagination">
      <Button type="button" size="sm" variant="outline" disabled={busy || !hasPrevious} onClick={onPrevious}>
        Previous
      </Button>
      <Button type="button" size="sm" variant="outline" disabled={busy || !hasNext} onClick={onNext}>
        Next
      </Button>
    </nav>
  );
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label}</span>
      {children}
    </div>
  );
}
function StateBadge({ state }: { state: JournalSummary["state"] }) {
  return (
    <Badge
      variant={state === "posted" ? "default" : state === "reversed" ? "destructive" : "outline"}
      className="capitalize"
    >
      {state}
    </Badge>
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
