"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createHrPayrollRecordSchema,
  hrPayrollRecordActionSchema,
  type HrPayrollItem,
  type HrPayrollRecordAction,
} from "@nexora/contracts";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect } from "@/shared/ui/searchable-select";

import { HrApiClient } from "../api/hr-client";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  HrDetailAudit,
  HrDetailList,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  HrStatusPill,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrSearchField } from "../components/hr-list-controls";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { hrCell } from "../components/hr-table";
import { Field, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";

type Navigate = (module: string, page: string, reference?: string) => void;
type LoanKind = "loan" | "advance";
type Decision = Exclude<HrPayrollRecordAction["action"], "activate" | "deactivate" | "cancel">;

const PAGE_SIZE = 25;
const label: Record<LoanKind, { one: string; many: string }> = {
  loan: { one: "Loan", many: "Loans" },
  advance: { one: "Advance", many: "Advances" },
};
const decisionLabel: Record<Decision, string> = {
  submit: "Submit for approval",
  approve: "Approve",
  reject: "Reject",
  confirm_disbursement: "Confirm disbursement",
};
const monthStart = () => localDate().slice(0, 8) + "01";
const money = (amount: string | null | undefined, currency: string | null | undefined) =>
  amount ? `${amount} ${currency ?? ""}`.trim() : "";

/** Keeps one idempotency key per unchanged request so a retry cannot apply twice. */
function useIdempotency() {
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  return (input: unknown) => {
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    return {
      key: retry.current.key,
      done: () => {
        retry.current = null;
      },
    };
  };
}

function NewLoanForm({
  kind,
  company,
  client,
  csrf,
  busy,
  onSaved,
  setBusy,
}: {
  kind: LoanKind;
  company: string;
  client: HrApiClient;
  csrf: () => string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onSaved: (message: string, id: string) => void;
}) {
  const [employee, setEmployee] = useState("");
  const [component, setComponent] = useState("");
  const [currency, setCurrency] = useState("");
  const [principal, setPrincipal] = useState("");
  const [startMonth, setStartMonth] = useState(monthStart());
  const [instalments, setInstalments] = useState(kind === "advance" ? "1" : "12");
  const [reason, setReason] = useState("");
  const [typed, setTyped] = useState("");
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");
  const idempotency = useIdempotency();

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(typed.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [typed]);

  const onDate = /^\d{4}-\d{2}-01$/.test(startMonth) ? startMonth : monthStart();
  const options = useAttendanceRead(company ? JSON.stringify([company, onDate, search]) : null, () =>
    client.payrollOptions({ company_id: company, on_date: onDate, search }),
  );
  const recoveryComponents = (options.data?.components ?? []).filter(
    (item) => item.kind === "deduction" && item.method === "fixed",
  );
  const code = options.data?.code_previews?.[kind] ?? "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = createHrPayrollRecordSchema.safeParse({
      company_id: company,
      kind: "loan",
      loan_kind: kind,
      reason,
      employee_id: employee,
      component_id: component,
      reference: "AUTO",
      currency_code: currency.trim().toUpperCase(),
      principal: principal.trim(),
      start_month: startMonth,
      instalment_count: Number(instalments),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return;
    }
    const attempt = idempotency(parsed.data);
    setBusy(true);
    try {
      const result = await client.createPayrollRecord(parsed.data, csrf(), attempt.key);
      attempt.done();
      onSaved(`${label[kind].one} saved as a draft.`, result.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : `The ${label[kind].one.toLowerCase()} could not be saved.`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <WorkForm className="grid min-w-0 gap-4" aria-label={`New ${label[kind].one.toLowerCase()}`} onSubmit={submit}>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field title={`${label[kind].one} code`}>
        <Input readOnly aria-readonly value={code || "Assigned on save"} className="font-mono read-only:bg-muted/40" />
      </Field>
      <div className="grid min-w-0 content-start gap-2 text-sm font-medium">
        <label htmlFor={`hr-${kind}-employee`}>Employee</label>
        <SearchableSelect
          id={`hr-${kind}-employee`}
          label="Employee"
          value={employee}
          required
          disabled={busy}
          loading={options.loading && !options.data}
          placeholder="Choose employee"
          searchPlaceholder="Search by name or employee number…"
          search={typed}
          onSearchChange={setTyped}
          options={(options.data?.employees ?? []).map((item) => ({ value: item.id, label: item.label }))}
          onValueChange={setEmployee}
        />
      </div>
      <Field title="Recovery component">
        <select
          className={selectClass}
          value={component}
          required
          disabled={busy || options.loading}
          onChange={(event) => setComponent(event.target.value)}
        >
          <option value="">
            {options.loading
              ? "Loading components…"
              : recoveryComponents.length
                ? "Choose recovery component"
                : "No fixed deduction components configured"}
          </option>
          {recoveryComponents.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <Field title="Amount">
          <Input
            inputMode="decimal"
            value={principal}
            required
            disabled={busy}
            onChange={(event) => setPrincipal(event.target.value)}
          />
        </Field>
        <Field title="Currency">
          <Input
            value={currency}
            required
            maxLength={3}
            disabled={busy}
            className="uppercase"
            onChange={(event) => setCurrency(event.target.value.toUpperCase())}
          />
        </Field>
        <Field title="First recovery month">
          <Input
            type="month"
            value={startMonth.slice(0, 7)}
            required
            disabled={busy}
            onChange={(event) => setStartMonth(event.target.value ? event.target.value + "-01" : "")}
          />
        </Field>
        <Field title="Instalments">
          <Input
            type="number"
            min={1}
            max={600}
            value={instalments}
            required
            disabled={busy}
            onChange={(event) => setInstalments(event.target.value)}
          />
        </Field>
      </div>
      <Field title="Reason">
        <Textarea rows={2} value={reason} maxLength={500} disabled={busy} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <HrDrawerActions>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : "Save draft"}
        </Button>
      </HrDrawerActions>
    </WorkForm>
  );
}

function LoanDetail({
  kind,
  company,
  record,
  permissions,
  client,
  csrf,
  busy,
  setBusy,
  onChanged,
  onNavigate,
}: {
  kind: LoanKind;
  company: string;
  record: HrPayrollItem;
  permissions: readonly string[];
  client: HrApiClient;
  csrf: () => string;
  busy: boolean;
  setBusy: (busy: boolean) => void;
  onChanged: (message: string, keepOpen: boolean) => void;
  onNavigate: Navigate;
}) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [paymentLine, setPaymentLine] = useState("");
  const [bankReference, setBankReference] = useState("");
  const [confirmedOn, setConfirmedOn] = useState(localDate());
  const [error, setError] = useState("");
  const idempotency = useIdempotency();

  const canManage = permissions.includes("hr.payroll.loan.manage");
  const canApprove = permissions.includes("hr.payroll.loan.approve");
  const decisions: Decision[] = [];
  if (record.workflow_managed) {
    if (record.status === "draft" && canManage) decisions.push("submit");
    if (record.status === "submitted" && canApprove) decisions.push("approve", "reject");
    if (record.status === "approved" && canApprove && permissions.includes("banking.payment.read"))
      decisions.push("confirm_disbursement");
  }
  const canDelete = record.workflow_managed && canManage && ["draft", "submitted"].includes(record.status);

  async function act(action: HrPayrollRecordAction["action"]) {
    setError("");
    const parsed = hrPayrollRecordActionSchema.safeParse({
      company_id: company,
      section: "loans",
      expected_version: record.version,
      source_hash: record.source_hash,
      action,
      reason,
      confirm_override: false,
      ...(action === "confirm_disbursement"
        ? { bank_payment_line_id: paymentLine, bank_reference: bankReference, confirmed_on: confirmedOn }
        : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return false;
    }
    const attempt = idempotency({ id: record.id, ...parsed.data });
    setBusy(true);
    try {
      await client.actOnPayrollRecord(record.id, parsed.data, csrf(), attempt.key);
      attempt.done();
      setDecision(null);
      setReason("");
      onChanged(
        action === "cancel"
          ? `${label[kind].one} deleted.`
          : action === "submit"
            ? `${label[kind].one} submitted for approval.`
            : action === "approve"
              ? `${label[kind].one} approved.`
              : action === "reject"
                ? `${label[kind].one} rejected.`
                : "Disbursement confirmed.",
        action !== "cancel",
      );
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be completed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  const d = record.details;
  return (
    <div className="grid min-w-0 gap-4">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <HrDetailSummary code={record.reference} status={record.status}>
        {label[kind].one} · {money(record.amount, record.currency_code)}
      </HrDetailSummary>
      <HrDetailList>
        <HrDetailTile label="Employee" value={record.employee_name} />
        <HrDetailTile label="Amount" value={money(record.amount, record.currency_code)} />
        <HrDetailTile label="Recovery component" value={d.component_name} />
        <HrDetailTile
          label="First recovery"
          value={record.effective_from ? hrDisplayDate(record.effective_from) : ""}
        />
        <HrDetailTile label="Instalments" value={d.instalment_count} />
        <HrDetailTile label="Recovered" value={money(d.recovered, record.currency_code)} />
        <HrDetailTile label="Outstanding" value={money(d.outstanding, record.currency_code)} />
        {d.bank_reference ? <HrDetailTile label="Bank reference" value={d.bank_reference} /> : null}
        {d.confirmed_on ? <HrDetailTile label="Disbursed on" value={hrDisplayDate(d.confirmed_on)} /> : null}
      </HrDetailList>
      {record.lines.length ? (
        <HrDetailSection title="Recovery schedule">
          <ul className="m-0! grid list-none gap-1 p-0!">
            {record.lines.map((line, index) => (
              <li key={index} className="flex min-w-0 items-center justify-between gap-3 text-[13.5px]">
                <span>{hrDisplayDate(line.label)}</span>
                <span className="flex items-center gap-3">
                  <span className="tabular-nums">{money(line.amount, record.currency_code)}</span>
                  <HrStatusPill status={line.description} />
                </span>
              </li>
            ))}
          </ul>
        </HrDetailSection>
      ) : null}
      {record.history.length ? (
        <HrDetailSection title="History">
          <ol className="m-0! grid list-none gap-2 p-0!">
            {record.history.map((event, index) => (
              <li key={index} className="text-[13px]">
                <span className="font-medium capitalize">{event.action.replaceAll("_", " ")}</span>
                <span className="text-muted-foreground"> · {hrDisplayDate(event.occurred_at, true)}</span>
                {event.reason ? (
                  <span className="block text-xs text-muted-foreground wrap-anywhere">{event.reason}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </HrDetailSection>
      ) : null}
      <HrDetailAudit items={[{ label: "Version", value: String(record.version) }]} />

      {decision ? (
        <WorkForm
          className="grid min-w-0 gap-3"
          aria-label={decisionLabel[decision]}
          onSubmit={(event) => {
            event.preventDefault();
            void act(decision);
          }}
        >
          {decision === "confirm_disbursement" ? (
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              <Field title="Bank payment">
                <select
                  className={selectClass}
                  value={paymentLine}
                  required
                  disabled={busy}
                  onChange={(event) => setPaymentLine(event.target.value)}
                >
                  <option value="">
                    {record.disbursement_options?.length ? "Choose posted payment" : "No posted payment available"}
                  </option>
                  {(record.disbursement_options ?? []).map((option) => (
                    <option key={option.line_id} value={option.line_id}>
                      {option.payment_reference} · {option.posting_date} · {option.amount} {option.currency_code}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Bank reference">
                <Input
                  value={bankReference}
                  required
                  maxLength={128}
                  disabled={busy}
                  onChange={(event) => setBankReference(event.target.value)}
                />
              </Field>
              <Field title="Confirmed on">
                <Input
                  type="date"
                  value={confirmedOn}
                  required
                  disabled={busy}
                  onChange={(event) => setConfirmedOn(event.target.value)}
                />
              </Field>
              {!record.disbursement_options?.length ? (
                <Button
                  type="button"
                  variant="outline"
                  className="self-end"
                  onClick={() => onNavigate("banking", "bank-payments")}
                >
                  Open Bank Payments
                </Button>
              ) : null}
            </div>
          ) : null}
          <Field title="Reason">
            <Textarea
              rows={2}
              value={reason}
              maxLength={500}
              disabled={busy}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          <HrDrawerActions>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
              Back
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : decisionLabel[decision]}
            </Button>
          </HrDrawerActions>
        </WorkForm>
      ) : (
        <HrDrawerActions>
          {canDelete ? (
            <HrConfirmDeleteButton
              label={`Delete ${record.reference}`}
              title={`Delete ${record.reference}?`}
              description={`The ${label[kind].one.toLowerCase()} request is cancelled and kept in the audit history.`}
              variant="outline"
              disabled={busy}
              onConfirm={() => act("cancel")}
            />
          ) : null}
          {decisions.map((action) => (
            <Button
              key={action}
              type="button"
              disabled={busy}
              onClick={() => {
                setError("");
                setReason("");
                setDecision(action);
              }}
            >
              {decisionLabel[action]}
            </Button>
          ))}
        </HrDrawerActions>
      )}
    </div>
  );
}

function LoanRegister({ kind, onNavigate }: { kind: LoanKind; onNavigate: Navigate }) {
  const { api, session, activeCompany, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.payroll.loan.read");
  const canManage = permissions.includes("hr.payroll.loan.manage");
  const company = activeCompany?.id ?? "";
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [creating, setCreating] = useState(false);
  const [openedId, setOpenedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setFilter(search.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  const query = {
    company_id: company,
    section: "loans" as const,
    month: monthStart(),
    search: filter,
    loan_kind: kind,
    limit: PAGE_SIZE,
    offset,
  };
  const result = useAttendanceRead(company && canRead ? JSON.stringify([query, revision]) : null, () =>
    client.payrollWorkspace(query),
  );
  const items = result.data?.items ?? [];
  const total = result.data?.total ?? 0;
  const opened = items.find((item) => item.id === openedId) ?? null;

  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Loan read permission is required.</AlertDescription>
      </Alert>
    );

  return (
    <section className="grid min-w-0 gap-3" aria-label={label[kind].many} data-loan-register={kind}>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id={`hr-${kind}-search`}
          value={search}
          onChange={setSearch}
          placeholder="Search code or employee"
        />
        {canManage ? (
          <Button
            type="button"
            className="w-full md:w-auto"
            disabled={!company || busy}
            onClick={() => {
              setNotice("");
              setCreating(true);
            }}
          >
            + New {label[kind].one.toLowerCase()}
          </Button>
        ) : null}
      </div>
      {!company ? (
        <Alert>
          <AlertDescription>Choose a company at sign-in to see these records.</AlertDescription>
        </Alert>
      ) : null}
      {notice && !opened && !creating ? (
        <p role="status" className="m-0! text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {result.error ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}
      {result.loading && !result.data ? <Skeleton className="h-40 w-full" /> : null}
      {result.data ? (
        <>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <WorkTable paging={false} tableId="app/features/hr/views/hr-benefits-workspace:1" className="w-full text-left text-sm">
              <caption className="sr-only">{label[kind].many}</caption>
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Code
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Employee
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-sm:hidden`}>
                    Amount
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-md:hidden`}>
                    Outstanding
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <HrClickableRow
                    key={item.id}
                    onOpen={() => {
                      setNotice("");
                      setOpenedId(item.id);
                    }}
                  >
                    <td className={`${hrCell} font-mono text-[13px]`}>{item.reference}</td>
                    <td className={`${hrCell} font-medium wrap-anywhere`}>{item.employee_name}</td>
                    <td className={`${hrCell} tabular-nums max-sm:hidden`}>{money(item.amount, item.currency_code)}</td>
                    <td className={`${hrCell} tabular-nums text-muted-foreground max-md:hidden`}>
                      {money(item.details.outstanding, item.currency_code)}
                    </td>
                    <td className={hrCell}>
                      <HrStatusPill status={item.status} />
                    </td>
                  </HrClickableRow>
                ))}
                {!items.length ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      {filter
                        ? `No ${label[kind].many.toLowerCase()} match this search.`
                        : `No ${label[kind].many.toLowerCase()} yet.`}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>
          {total > PAGE_SIZE ? (
            <nav
              aria-label={`${label[kind].many} pages`}
              className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span aria-live="polite">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= total}
                  onClick={() => setOffset((value) => value + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}

      <HrRecordDrawer
        title={`New ${label[kind].one.toLowerCase()}`}
        description={`Create a ${label[kind].one.toLowerCase()} request`}
        open={creating}
        busy={busy}
        onClose={() => setCreating(false)}
      >
        {creating ? (
          <NewLoanForm
            kind={kind}
            company={company}
            client={client}
            csrf={csrfToken}
            busy={busy}
            setBusy={setBusy}
            onSaved={(message, id) => {
              setNotice(message);
              setCreating(false);
              setOpenedId(id);
              setRevision((value) => value + 1);
            }}
          />
        ) : null}
      </HrRecordDrawer>

      <HrRecordDrawer
        title={opened?.employee_name ?? label[kind].one}
        description={`${label[kind].one} details`}
        open={!!opened && !creating}
        busy={busy}
        notice={opened ? notice : undefined}
        onClose={() => setOpenedId("")}
      >
        {opened ? (
          <LoanDetail
            key={opened.id + ":" + opened.version}
            kind={kind}
            company={company}
            record={opened}
            permissions={permissions}
            client={client}
            csrf={csrfToken}
            busy={busy}
            setBusy={setBusy}
            onNavigate={onNavigate}
            onChanged={(message, keepOpen) => {
              setNotice(message);
              if (!keepOpen) setOpenedId("");
              setRevision((value) => value + 1);
            }}
          />
        ) : null}
      </HrRecordDrawer>
    </section>
  );
}

/** Loan Benefits (Employee Lifecycle): loans and salary advances, kept as separate governed records. */
/** Loan Benefits sub-pages: Loan Requests and Advance Requests, each with its own records and workflow. */
export function HrLoanBenefitsWorkspace({ kind, onNavigate }: { kind: LoanKind; onNavigate: Navigate }) {
  return (
    <div className="grid min-w-0 gap-4 text-foreground" data-benefits-workspace={kind}>
      <LoanRegister kind={kind} onNavigate={onNavigate} />
    </div>
  );
}
