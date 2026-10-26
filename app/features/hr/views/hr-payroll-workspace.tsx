"use client";
import {payrollNavigationContext} from "../components/payroll-navigation";
import { HrPayrollLocalizationSetup } from "./hr-payroll-localization-setup";
import { HrPayrollOvertimeSetup } from "./hr-payroll-overtime-setup";
import { useMemo, useRef, useState } from "react";
import { Wallet, Plus, RefreshCw, ArrowRight, ChevronLeft, ChevronRight, ShieldCheck, Layers3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  State,
  Metric,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
import {
  createHrPayrollRecordSchema,
  hrPayrollRecordActionSchema,
  type HrPayrollSection,
  type HrPayrollItem,
  type HrPayrollOptions,
  type HrPayrollRecordAction,
  type HrPayrollMutationResult,
} from "@nexora/contracts";
export const payrollPages = {
  "payroll-setup": ["components", "Pay components", "setup"],
  "salary-structures": ["structures", "Salary structures", "salary"],
  "salary-revisions": ["salaries", "Salary revisions", "salary"],
  "payroll-inputs": ["adjustments", "Payroll inputs", "adjustment"],
  "employee-loans": ["loans", "Loans & advances", "loan"],
  "payroll-runs": ["runs", "Payroll runs", "period"],
  "payroll-validation": ["review", "Review & approval", "period"],
  "payroll-journal": ["journals", "Payroll journal", "report"],
  "payment-batch": ["payments", "Payment batches", "payment"],
  payslips: ["payslips", "Payslips", "payslip"],
} as const;
type Page = keyof typeof payrollPages;
type Navigate = (module: string, page: string, reference?: string) => void;
type Save = (input: unknown, operation: (key: string) => Promise<HrPayrollMutationResult>) => Promise<boolean>;
const kinds = {
  components: "component",
  structures: "structure",
  salaries: "salary",
  adjustments: "adjustment",
  loans: "loan",
} as const;
const titles: Record<string, string> = {
  method: "Calculation method",
  kind: "Component type",
  taxable: "Taxable",
  prorated: "Prorated",
  position: "Calculation order",
  reason: "Reason",
  description: "Description",
  compensation_type: "Compensation model",
  payment_basis: "Payment basis",
  approved_by: "Approved by",
  approved_at: "Approved on",
  instalment_count: "Instalments",
  recovered: "Approved Payroll recoveries",
  outstanding: "Scheduled repayment balance",
  gross: "Gross",
  deductions: "Deductions",
  net: "Net",
  run_number: "Run number",
  posted_at: "Posted on",
  paid_at: "Paid on",
  released_at: "Released on",
  confirmed_at: "Confirmation recorded on",
  confirmed_on: "Transfer confirmed on",
};
const name = (value: string) => titles[value] ?? value.replaceAll("_", " ").replace(/^./, (v) => v.toUpperCase());
function Message({ error }: { error: string }) {
  return error ? (
    <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
      {error}
    </div>
  ) : null;
}
function Pick({
  title,
  value,
  change,
  options,
  required = true,
}: {
  title: string;
  value: string;
  change: (v: string) => void;
  options: { id: string; label: string }[];
  required?: boolean;
}) {
  return (
    <Field title={title}>
      <select required={required} className={selectClass} value={value} onChange={(e) => change(e.target.value)}>
        <option value="">Choose {title.toLowerCase()}</option>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}
const enumOptions = (values: string[]) => values.map((v) => ({ id: v, label: name(v) }));
function RecordEditor({
  section,
  company,
  month,
  options: baseOptions,
  records,
  search,
  setSearch,
  save,
  client,
  csrf,
  busy,
  onClose,
}: {
  section: keyof typeof kinds;
  company: string;
  month: string;
  options: HrPayrollOptions | null;
  records: HrPayrollItem[];
  search: string;
  setSearch: (v: string) => void;
  save: Save;
  client: HrApiClient;
  csrf: () => string;
  busy: boolean;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>({
      code: "",
      name: "",
      description: "",
      currency_code: "",
      component_kind: "earning",
      method: "fixed",
      formula: "",
      position: "1",
      taxable: "false",
      prorated: "false",
      account_id: "",
      employee_id: "",
      structure_id: "",
      supersedes_id: "",
      effective_from: month,
      effective_to: "",
      compensation_type: "fixed",
      payment_basis: "monthly",
      effective_month: month,
      amount: "",
      component_id: "",
      reference: "",
      principal: "",
      instalment_count: "1",
      start_month: month,
      reason: "",
    }),
    [items, setItems] = useState<{ component_id: string; amount: string; formula: string }[]>([
      { component_id: "", amount: "", formula: "" },
    ]),
    [error, setError] = useState("");
  const date =
    section === "salaries"
      ? form.effective_from
      : section === "loans"
        ? form.start_month
        : section === "adjustments"
          ? form.effective_month
          : month;
  const available = useAttendanceRead(
    date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? JSON.stringify([company, date, search]) : null,
    () => client.payrollOptions({ company_id: company, on_date: date, search }),
  );
  const options = available.data ?? (date === month && search === "" ? baseOptions : null);
  const change = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const field = (key: string, title: string, type = "text", required = true) => (
    <Field title={title}>
      <Input
        className="box-border! w-full min-w-0! max-w-full! font-normal!"
        type={type}
        inputMode={["amount", "principal"].includes(key) ? "decimal" : undefined}
        value={form[key]}
        required={required}
        onChange={(e) => change(key, e.target.value)}
        maxLength={type === "text" ? 160 : undefined}
      />
    </Field>
  );
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const common = { company_id: company, kind: kinds[section], reason: form.reason };
    let input: unknown;
    if (section === "components")
      input = {
        ...common,
        code: form.code,
        name: form.name,
        component_kind: form.component_kind,
        method: form.method,
        formula: form.method === "formula" ? form.formula : null,
        taxable: form.taxable === "true",
        prorated: form.prorated === "true",
        account_id: form.account_id,
        position: Number(form.position),
      };
    else if (section === "structures")
      input = {
        ...common,
        code: form.code,
        name: form.name,
        description: form.description,
        currency_code: form.currency_code,
        items: items.map((i) => ({
          component_id: i.component_id,
          amount: options?.components.find((c) => c.id === i.component_id)?.method === "fixed" ? i.amount : null,
          formula: options?.components.find((c) => c.id === i.component_id)?.method === "formula" ? i.formula : null,
        })),
      };
    else if (section === "salaries")
      input = {
        ...common,
        employee_id: form.employee_id,
        structure_id: form.structure_id,
        supersedes_id: form.supersedes_id || null,
        currency_code: form.currency_code,
        effective_from: form.effective_from,
        effective_to: form.effective_to || null,
        compensation_type: form.compensation_type,
        payment_basis: form.payment_basis,
      };
    else if (section === "adjustments")
      input = {
        ...common,
        employee_id: form.employee_id,
        component_id: form.component_id,
        effective_month: form.effective_month,
        amount: form.amount,
      };
    else
      input = {
        ...common,
        employee_id: form.employee_id,
        component_id: form.component_id,
        reference: form.reference,
        currency_code: form.currency_code,
        principal: form.principal,
        start_month: form.start_month,
        instalment_count: Number(form.instalment_count),
      };
    const parsed = createHrPayrollRecordSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    if (await save(parsed.data, (key) => client.createPayrollRecord(parsed.data, csrf(), key))) onClose();
  }
  return (
    <section className={panel + " border-primary/30"} aria-label="New Payroll record">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-primary">New record</div>
          <h2 className="mt-1 text-lg font-semibold">{name(kinds[section])}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Terms are preserved after saving. Use a successor record for revised terms.
          </p>
        </div>
        <Button variant="outline" onClick={onClose} disabled={busy}>
          Close editor
        </Button>
      </header>
      <form className="grid gap-5" onSubmit={submit}>
        <fieldset disabled={busy} className="m-0! grid min-w-0 gap-4 border-0! p-0! md:grid-cols-2">
          {["components", "structures"].includes(section) && (
            <>
              {field("code", "Code")}
              {field("name", "Name")}
            </>
          )}
          {section === "components" && (
            <>
              <Pick
                title="Component type"
                value={form.component_kind}
                change={(v) => {
                  change("component_kind", v);
                  change("account_id", "");
                }}
                options={enumOptions(["earning", "deduction"])}
              />
              <Pick
                title="Calculation method"
                value={form.method}
                change={(v) => change("method", v)}
                options={enumOptions(["fixed", "formula"])}
              />
              {form.method === "formula" && field("formula", "Formula")}
              {field("position", "Calculation order", "number")}
              <Pick
                title="Posting account"
                value={form.account_id}
                change={(v) => change("account_id", v)}
                options={(options?.accounts ?? []).filter(
                  (a) => a.type === (form.component_kind === "earning" ? "expense" : "liability"),
                )}
              />
              <Pick
                title="Tax treatment"
                value={form.taxable}
                change={(v) => change("taxable", v)}
                options={[
                  { id: "true", label: "Taxable" },
                  { id: "false", label: "Exempt" },
                ]}
              />
              <Pick
                title="Attendance proration"
                value={form.prorated}
                change={(v) => change("prorated", v)}
                options={[
                  { id: "true", label: "Prorate by paid days" },
                  { id: "false", label: "Full amount" },
                ]}
              />
            </>
          )}
          {["structures", "salaries", "loans"].includes(section) && field("currency_code", "Currency (ISO code)")}
          {["salaries", "adjustments", "loans"].includes(section) && (
            <>
              <Field title="Find employee">
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Employee name or number"
                />
              </Field>
              <Pick
                title="Employee"
                value={form.employee_id}
                change={(v) => change("employee_id", v)}
                options={options?.employees ?? []}
              />
            </>
          )}
          {section === "structures" && field("description", "Description", "text", false)}
          {section === "salaries" && (
            <>
              <Pick
                title="Salary structure"
                value={form.structure_id}
                change={(v) => {
                  change("structure_id", v);
                  const currency = options?.structures.find((s) => s.id === v)?.currency_code;
                  if (currency) change("currency_code", currency);
                }}
                options={(options?.structures ?? []).filter((s) => s.currency_code)}
              />
              <Pick
                title="Replaces approved salary"
                required={false}
                value={form.supersedes_id}
                change={(v) => change("supersedes_id", v)}
                options={records
                  .filter(
                    (r) =>
                      r.employee_id === form.employee_id &&
                      ["approved", "effective"].includes(r.status) &&
                      !r.details.closed_by_successor_id,
                  )
                  .map((r) => ({ id: r.id, label: r.reference + " · " + r.effective_from }))}
              />
              {field("effective_from", "Effective from", "date")}
              {field("effective_to", "Effective to", "date", false)}
              <Pick
                title="Compensation model"
                value={form.compensation_type}
                change={(v) => change("compensation_type", v)}
                options={enumOptions(["fixed", "contractual", "hourly"])}
              />
              <Pick
                title="Payment basis"
                value={form.payment_basis}
                change={(v) => change("payment_basis", v)}
                options={enumOptions(["hourly", "daily", "weekly", "monthly", "annual", "custom"])}
              />
            </>
          )}
          {["adjustments", "loans"].includes(section) && (
            <Pick
              title={section === "loans" ? "Recovery component" : "Pay component"}
              value={form.component_id}
              change={(v) => change("component_id", v)}
              options={(options?.components ?? []).filter(
                (c) => section !== "loans" || (c.kind === "deduction" && c.method === "fixed"),
              )}
            />
          )}
          {section === "adjustments" && (
            <>
              {field("effective_month", "Payroll month (first day)", "date")}
              {field("amount", "Amount")}
            </>
          )}
          {section === "loans" && (
            <>
              {field("reference", "Loan reference")}
              {field("principal", "Principal")}
              {field("start_month", "First recovery month (first day)", "date")}
              {field("instalment_count", "Number of instalments", "number")}
            </>
          )}
        </fieldset>
        {section === "structures" && (
          <fieldset disabled={busy} className="m-0! grid min-w-0 gap-3 border-0! p-0!">
            <legend className="mb-3 text-sm font-semibold">Structure components</legend>
            {items.map((item, index) => {
              const method = options?.components.find((c) => c.id === item.component_id)?.method;
              return (
                <div
                  className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-3 sm:grid-cols-[1fr_1fr_auto]"
                  key={index}
                >
                  <Pick
                    title={"Component " + (index + 1)}
                    value={item.component_id}
                    change={(v) =>
                      setItems((s) => s.map((i, n) => (n === index ? { component_id: v, amount: "", formula: "" } : i)))
                    }
                    options={options?.components ?? []}
                  />
                  <Field title={method === "formula" ? "Formula " + (index + 1) : "Amount " + (index + 1)}>
                    <Input
                      value={method === "formula" ? item.formula : item.amount}
                      required
                      onChange={(e) =>
                        setItems((s) =>
                          s.map((i, n) =>
                            n === index ? { ...i, [method === "formula" ? "formula" : "amount"]: e.target.value } : i,
                          ),
                        )
                      }
                    />
                  </Field>
                  <Button
                    type="button"
                    variant="outline"
                    className="self-end"
                    disabled={items.length === 1}
                    onClick={() => setItems((s) => s.filter((_, n) => n !== index))}
                  >
                    Remove
                  </Button>
                </div>
              );
            })}
            <Button
              variant="outline"
              type="button"
              className="justify-self-start"
              disabled={items.length >= 50}
              onClick={() => setItems((s) => [...s, { component_id: "", amount: "", formula: "" }])}
            >
              Add component
            </Button>
          </fieldset>
        )}
        <Field title="Reason">
          <Textarea
            required
            minLength={5}
            maxLength={500}
            value={form.reason}
            disabled={busy}
            onChange={(e) => change("reason", e.target.value)}
            placeholder="Explain the business reason for this record"
          />
        </Field>
        <Message error={error || available.error} />
        {options?.truncated && (
          <p role="status" className="text-sm text-muted-foreground">
            The available choices are limited. Refine the employee search; configuration lists show the first 500
            records.
          </p>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {section === "components" || section === "structures"
              ? "Configuration is saved with immutable terms."
              : "Creates a draft. Submission and independent approval follow separately."}
          </p>
          <Button className="text-primary-foreground!" type="submit" disabled={busy || !options}>
            {busy
              ? "Saving…"
              : "Save " + (section === "components" || section === "structures" ? "configuration" : "draft")}
          </Button>
        </div>
      </form>
    </section>
  );
}
function RecordDetail({
  record,
  section,
  permissions,
  save,
  client,
  csrf,
  busy,
  close,
}: {
  record: HrPayrollItem;
  section: HrPayrollSection;
  permissions: string[];
  save: Save;
  client: HrApiClient;
  csrf: () => string;
  busy: boolean;
  close: () => void;
}) {
  const [reason, setReason] = useState(""),
    [action, setAction] = useState<HrPayrollRecordAction["action"]>("submit"),
    [paymentLine, setPaymentLine] = useState(""),
    [bankReference, setBankReference] = useState(""),
    [confirmedOn, setConfirmedOn] = useState(localDate()),
    [override, setOverride] = useState(false),
    [error, setError] = useState("");
  const group = Object.values(payrollPages).find((p) => p[0] === section)![2],
    canManage = permissions.includes("hr.payroll." + group + ".manage"),
    canApprove = permissions.includes("hr.payroll." + group + ".approve"),
    config = ["components", "structures"].includes(section),
    actions: HrPayrollRecordAction["action"][] = [];
  if (record.workflow_managed && section in kinds) {
    if (config && canManage) actions.push(record.status === "active" ? "deactivate" : "activate");
    if (
      section === "loans" &&
      record.status === "approved" &&
      canApprove &&
      permissions.includes("banking.payment.read")
    )
      actions.push("confirm_disbursement");
    if (record.status === "draft" && canManage) actions.push("submit");
    if (record.status === "submitted" && canApprove) actions.push("approve", "reject");
    if (["draft", "submitted"].includes(record.status) && canManage && section !== "adjustments")
      actions.push("cancel");
  }
  const chosen = actions.includes(action) ? action : actions[0];
  async function decide(e: React.FormEvent) {
    e.preventDefault();
    const parsed = hrPayrollRecordActionSchema.safeParse({
      company_id: record.details.company_id,
      section,
      expected_version: record.version,
      source_hash: record.source_hash,
      action: chosen,
      reason,
      confirm_override: chosen === "confirm_disbursement" ? false : override,
      ...(chosen === "confirm_disbursement"
        ? { bank_payment_line_id: paymentLine, bank_reference: bankReference, confirmed_on: confirmedOn }
        : {}),
    });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    if (
      await save({ ...parsed.data, id: record.id }, (key) =>
        client.actOnPayrollRecord(record.id, parsed.data, csrf(), key),
      )
    )
      close();
  }
  return (
    <section className={panel + " border-primary/30"} aria-label="Payroll record detail">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs text-muted-foreground">{record.reference}</p>
          <h2 className="mt-1 text-lg font-semibold">{record.title}</h2>
          <div className="mt-2">
            <State value={record.status} />
          </div>
        </div>
        <Button variant="outline" onClick={close} disabled={busy}>
          Close details
        </Button>
      </header>
      <dl className="mt-5 grid min-w-0 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Object.entries(record.details)
          .filter(
            ([k, v]) =>
              v !== null && !k.endsWith("_id") && !k.endsWith("_hash") && !["company_id", "formula"].includes(k),
          )
          .map(([key, value]) => (
            <div className="min-w-0" key={key}>
              <dt className="text-xs text-muted-foreground">{name(key)}</dt>
              <dd className="mt-1 break-words text-sm">{value}</dd>
            </div>
          ))}
      </dl>
      {section === "loans" && (
        <div className="mt-5 grid min-w-0 grid-cols-1 gap-3 rounded-lg border border-border bg-muted/30 p-4 text-sm sm:grid-cols-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Loan principal</p>
            <p className="mt-1 font-semibold tabular-nums">
              {record.amount} {record.currency_code}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Employee document reference for Bank Payment</p>
            <p className="mt-1 break-all font-mono text-xs">{record.employee_id}</p>
          </div>
          {Object.entries(record.details)
            .filter(([key]) =>
              ["bank_payment_line_id", "payment_id", "journal_id", "receivable_account_id"].includes(key),
            )
            .map(([key, value]) => (
              <div className="min-w-0" key={key}>
                <p className="text-xs text-muted-foreground">{name(key)}</p>
                <p className="mt-1 break-all font-mono text-xs">{value}</p>
              </div>
            ))}
        </div>
      )}
      {record.details.formula && (
        <div className="mt-4 rounded bg-muted p-3 font-mono text-xs break-words">{record.details.formula}</div>
      )}
      {record.lines.length > 0 && (
        <div className="mt-5 grid gap-2">
          {record.lines.map((line, i) => (
            <div
              key={i}
              className="flex min-w-0 flex-wrap items-start justify-between gap-3 rounded-lg border border-border p-3 text-sm"
            >
              <div className="min-w-0">
                <strong className="break-words">{line.label}</strong>
                <p className="mt-1 break-words text-xs text-muted-foreground">{line.description}</p>
              </div>
              <span className="font-mono tabular-nums">
                {line.amount ?? "Formula"} {record.currency_code}
              </span>
            </div>
          ))}
        </div>
      )}
      <details className="mt-5 rounded-lg border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Workflow history ({record.history.length})</summary>
        <ol className="mt-4 grid gap-3">
          {record.history.map((h, i) => (
            <li key={i} className="border-l-2 border-primary/30 pl-3">
              <div className="flex flex-wrap justify-between gap-2">
                <strong>{name(h.action)}</strong>
                <span className="text-xs text-muted-foreground">{new Date(h.occurred_at).toLocaleString()}</span>
              </div>
              <p className="mt-1 break-words text-sm text-muted-foreground">{h.reason}</p>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {h.actor_id}
                {h.override ? " · Audited administrator override" : ""}
              </p>
            </li>
          ))}
        </ol>
        {!record.history.length && (
          <p className="mt-3 text-muted-foreground">No workspace events recorded for this historical record.</p>
        )}
      </details>
      <details className="mt-4 text-xs text-muted-foreground">
        <summary className="cursor-pointer">Source evidence · version {record.version}</summary>
        <p className="mt-2 break-all font-mono">{record.source_hash}</p>
      </details>
      {!record.workflow_managed && (
        <p className="mt-4 text-sm text-muted-foreground">
          Historical record. Its original workflow and evidence are preserved.
        </p>
      )}
      {actions.length > 0 && (
        <form onSubmit={decide} className="mt-6 grid gap-4 border-t border-border pt-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldCheck className="h-4 w-4 text-primary" />
            Controlled action
          </div>
          <div className="grid min-w-0 gap-4 md:grid-cols-2">
            <Pick
              title="Action"
              value={chosen}
              change={(v) => setAction(v as HrPayrollRecordAction["action"])}
              options={enumOptions(actions)}
            />
            <Field title="Decision reason">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                minLength={5}
                maxLength={500}
                disabled={busy}
              />
            </Field>
          </div>
          {chosen === "confirm_disbursement" && (
            <div className="grid min-w-0 grid-cols-1 gap-4 rounded-lg border border-border bg-muted/30 p-4 md:grid-cols-2">
              <p className="min-w-0 text-sm text-muted-foreground md:col-span-2">
                Verify the actual transfer independently. The posted Bank Payment line must debit the employee-loan
                receivable asset account, use this loan reference as its external reference and the employee ID as its
                document reference. Amount and currency must match the principal. This action links evidence and enables
                recovery.
              </p>
              {(record.disbursement_options?.length ?? 0) > 0 && (
                <Pick
                  title="Matching posted Bank Payment"
                  value={paymentLine}
                  change={setPaymentLine}
                  options={[
                    ...(record.disbursement_options ?? []).map((p) => ({
                      id: p.line_id,
                      label:
                        p.payment_reference +
                        " · " +
                        p.posting_date +
                        " · " +
                        p.amount +
                        " " +
                        p.currency_code +
                        " · " +
                        p.receivable_account,
                    })),
                  ]}
                />
              )}
              {!record.disbursement_options?.length && (
                <p className="min-w-0 text-sm text-muted-foreground md:col-span-2">
                  No matching posted payment is available. Complete its independent Bank Payments workflow first. Up to
                  25 matching payments are listed; a verified line ID can also be entered below.
                </p>
              )}
              <Field title="Posted Bank Payment line ID">
                <Input
                  value={paymentLine}
                  onChange={(e) => setPaymentLine(e.target.value)}
                  required
                  maxLength={128}
                  disabled={busy}
                />
              </Field>
              <Field title="Bank confirmation reference">
                <Input
                  value={bankReference}
                  onChange={(e) => setBankReference(e.target.value)}
                  required
                  minLength={3}
                  maxLength={128}
                  disabled={busy}
                />
              </Field>
              <Field title="Transfer confirmed on">
                <Input
                  type="date"
                  value={confirmedOn}
                  onChange={(e) => setConfirmedOn(e.target.value)}
                  required
                  max={localDate()}
                  disabled={busy}
                />
              </Field>
            </div>
          )}
          {["approve", "reject"].includes(chosen) && permissions.includes("platform.approval.override") && (
            <Field title="Administrator override">
              <select
                className={selectClass}
                value={String(override)}
                onChange={(e) => setOverride(e.target.value === "true")}
              >
                <option value="false">Use independent approval</option>
                <option value="true">Explicitly authorize audited self-decision override</option>
              </select>
            </Field>
          )}
          <Message error={error} />
          <Button className="justify-self-start text-primary-foreground!" disabled={busy} type="submit">
            {busy
              ? "Saving…"
              : chosen === "confirm_disbursement"
                ? "Record disbursement confirmation"
                : "Confirm " + name(chosen)}
          </Button>
          <p className="text-xs text-muted-foreground">
            This decision uses the version and evidence shown above. Refreshing the list does not replace this review.
          </p>
        </form>
      )}
    </section>
  );
}
export function HrPayrollWorkspace({ page, onNavigate, initialReference }: { page: Page; onNavigate: Navigate; initialReference?:string|undefined }) {
 const initial=payrollNavigationContext(initialReference);
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    [section, , group] = payrollPages[page],
    permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.payroll." + group + ".read");
  const [choice, setCompany] = useState(initial?.company_id??""),
    [month, setMonth] = useState(initial?.month??localDate().slice(0, 7) + "-01"),
    [search, setSearch] = useState(""),
    [employeeSearch, setEmployeeSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [editing, setEditing] = useState(false),
    [selected, setSelected] = useState<HrPayrollItem | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const companies = useAttendanceRead(canRead ? "payroll-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? ""),
    query = { company_id: company, section, month, search, limit: 25, offset },
    records = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
      client.payrollWorkspace(query),
    );
  const options = useAttendanceRead(
    canRead && company && section in kinds ? JSON.stringify([company, employeeSearch, month, revision]) : null,
    () => client.payrollOptions({ company_id: company, on_date: month, search: employeeSearch }),
  );
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const save: Save = async (input, operation) => {
    if (guard.current) return false;
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setNotice("Saved · " + name(result.status) + " · version " + result.version);
      setRevision((v) => v + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Payroll change could not be saved.");
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  };
  if (loading) return <div className={panel}>Loading Payroll workspace…</div>;
  if (!canRead) return <div className={panel}>You do not have permission to view this Payroll screen.</div>;
  return (
    <div
      aria-label="Payroll workspace"
      className="grid min-w-0 gap-5 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_select]:font-normal! [&_textarea]:font-normal! [&_input]:font-normal!"
    >
      <nav className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5" aria-label="Payroll navigation">
        {Object.entries(payrollPages).map(([id, [, title, g]]) => (
          <Button
            key={id}
            variant="outline"
            className={
              "h-auto min-h-11 min-w-0 justify-start whitespace-normal px-3 py-2 text-left text-xs " +
              (id === page ? "border-primary bg-primary/10 text-primary!" : "")
            }
            disabled={editing || busy || !permissions.includes("hr.payroll." + g + ".read")}
            onClick={() => onNavigate("hr", id)}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            {title}
          </Button>
        ))}
      </nav>
      <section className={panel}>
        <div className="grid min-w-0 items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1.5fr_auto]">
          <Field title="Company">
            <select
              className={selectClass}
              value={company}
              disabled={editing || !!selected || busy}
              onChange={(e) => {
                setCompany(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Select company</option>
              {companies.data?.items.map((c) => (
                <option value={c.id} key={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </Field>
          <Field title="Payroll month">
            <Input
              type="month"
              className="box-border! min-w-0! max-w-full!"
              disabled={editing || !!selected || busy}
              value={month.slice(0, 7)}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value + "-01");
                  setOffset(0);
                }
              }}
            />
          </Field>
          <Field title="Search records">
            <Input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
              placeholder="Code, employee or reference"
              maxLength={120}
            />
          </Field>
          <Button variant="outline" disabled={busy || records.loading} onClick={() => setRevision((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </section>
      {section === "components" && company && (
        <details className={panel}>
          <summary className="cursor-pointer font-semibold">
            Monetary overtime policies &amp; employee arrangements
          </summary>
          <div className="mt-5">
            <HrPayrollOvertimeSetup key={company} company={company} onDate={month} />
          </div>
        </details>
      )}
      {section === "components" && company && (
        <details className={panel}>
          <summary className="cursor-pointer font-semibold">Statutory company &amp; employee setup</summary>
          <div className="mt-5">
            <HrPayrollLocalizationSetup key={company} company={company} onDate={month} />
          </div>
        </details>
      )}
      <Message error={companies.error || records.error || options.error || error} />
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </div>
      )}
      {records.data?.notices.map((text, i) => (
        <p
          key={i}
          className="rounded-lg border border-border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground"
        >
          {text}
        </p>
      ))}
      <div className="grid gap-3 sm:grid-cols-3">
        <Metric title="Matching records" value={records.data?.total ?? "—"} hint="Authorized company records" />
        <Metric
          title="Current view"
          value={payrollPages[page][1]}
          hint={section in kinds ? "Connected configuration and workflow" : "Connected records · execution pending"}
        />
        <Metric
          title="Payroll period"
          value={month.slice(0, 7)}
          hint="Attendance, salary and Finance share the same period"
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Layers3 className="h-5 w-5 text-primary" />
          {payrollPages[page][1]}
        </h2>
        <div className="flex flex-wrap gap-2">
          {section === "adjustments" && (
            <Button
              variant="outline"
              disabled={editing || busy}
              onClick={() => onNavigate("hr", "attendance-payroll-inputs")}
            >
              Locked attendance inputs
              <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          {section in kinds && permissions.includes("hr.payroll." + group + ".manage") && (
            <Button
              className="text-primary-foreground!"
              disabled={editing || busy || !company || !!selected}
              onClick={() => setEditing(true)}
            >
              <Plus className="h-4 w-4" />
              New {name(kinds[section as keyof typeof kinds])}
            </Button>
          )}
        </div>
      </div>
      {editing && (
        <RecordEditor
          key={section + company}
          section={section as keyof typeof kinds}
          company={company}
          month={month}
          options={options.data}
          records={records.data?.items ?? []}
          search={employeeSearch}
          setSearch={setEmployeeSearch}
          save={save}
          client={client}
          csrf={csrfToken}
          busy={busy}
          onClose={() => setEditing(false)}
        />
      )}
      {selected && (
        <RecordDetail
          key={selected.id}
          record={{ ...selected, details: { ...selected.details, company_id: company } }}
          section={section}
          permissions={permissions}
          save={save}
          client={client}
          csrf={csrfToken}
          busy={busy}
          close={() => setSelected(null)}
        />
      )}
      {records.loading ? (
        <div role="status" className={panel}>
          Loading Payroll records…
        </div>
      ) : !records.data?.items.length ? (
        <div className={panel + " py-10 text-center"}>
          <Wallet className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <h3 className="font-semibold">No matching records</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {section in kinds
              ? "Choose a company or create the first governed record."
              : "This view shows persisted Payroll records when their workflow has produced them."}
          </p>
        </div>
      ) : (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {records.data.items.map((r) => (
            <article key={r.id} className={panel + " flex min-w-0 flex-col gap-4"}>
              <header className="flex min-w-0 flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all text-xs text-muted-foreground">{r.reference}</p>
                  <h3 className="mt-1 break-words font-semibold">{r.title}</h3>
                </div>
                <State value={r.status} />
              </header>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-xs text-muted-foreground">
                    {r.amount ? "Amount" : section === "components" ? "Calculation" : "Components"}
                  </p>
                  <p className="mt-1 break-words font-mono tabular-nums">
                    {r.amount
                      ? r.amount + " " + (r.currency_code ?? "")
                      : section === "components"
                        ? name(r.details.method ?? "fixed")
                        : r.lines.length || "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Effective</p>
                  <p className="mt-1">
                    {r.effective_from ?? "Configuration"}
                    {r.effective_to ? " → " + r.effective_to : ""}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                className="mt-auto justify-between"
                disabled={editing || busy}
                onClick={() => {
                  setSelected(r);
                  setError("");
                }}
              >
                Open record
                <ArrowRight className="h-4 w-4" />
              </Button>
            </article>
          ))}
        </div>
      )}
      {records.data && records.data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {offset + 1}–{Math.min(offset + 25, records.data.total)} of {records.data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0 || busy || records.loading}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= records.data.total || busy || records.loading}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
