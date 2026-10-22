"use client";
import { useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSession } from "@/lib/session/session-provider";
import {
  createHrOvertimeMoneySchema,
  hrOvertimeMoneyDecisionSchema,
  type HrOvertimeMoneyRecord,
  type HrOvertimeMoneyQuery,
  type HrOvertimeMoneyDecision,
  type HrOvertimeMoneyWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, State, panel, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";
type Form = {
  kind: "policy" | "arrangement";
  row: HrOvertimeMoneyRecord | null;
  options: HrOvertimeMoneyWorkspace["options"];
  values: Record<string, string>;
  components: string[];
};
const label = (v: string) => v.replaceAll("_", " ");
export function HrPayrollOvertimeSetup({ company, onDate }: { company: string; onDate: string }) {
  const { api, csrfToken, session } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [],
    canPolicy = permissions.includes("hr.payroll.setup.read"),
    canArrangement = permissions.includes("hr.payroll.salary.read");
  const [section, setSection] = useState<"policies" | "arrangements">("policies"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [form, setForm] = useState<Form | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const query: HrOvertimeMoneyQuery = { company_id: company, on_date: onDate, section, search, limit: 25, offset },
    enabled = company && (section === "policies" ? canPolicy : canArrangement),
    state = useAttendanceRead(enabled ? JSON.stringify([query, revision]) : null, () =>
      client.overtimeMoneyWorkspace(query),
    ),
    data = state.data;
  const lock = useRef(false),
    retry = useRef<{ hash: string; key: string } | null>(null);
  function open(row: HrOvertimeMoneyRecord | null) {
    if (!data) return;
    const kind = row?.kind ?? (section === "policies" ? "policy" : "arrangement");
    setError("");
    setNotice("");
    setForm({
      kind,
      row,
      options: data.options,
      components: [],
      values: {
        reference: "",
        name: "",
        effective_from: onDate,
        effective_to: "",
        category: "regular",
        basis_source: "selected_components",
        earning_component_id: "",
        currency_code: "",
        ordinary_hours: "",
        multiplier: "",
        rounding_mode: "half_up",
        rounding_stage: "per_ot_day",
        minute_precision: "8",
        hourly_rate_precision: "8",
        intermediate_precision: "8",
        source_reference: "",
        employee_id: "",
        policy_version_id: data.options.policies[0]?.id ?? "",
        direct_rate: "",
        reason: "",
        action: row?.allowed_actions[0] ?? "submit",
        confirm_override: "false",
      },
    });
  }
  function change(key: string, value: string) {
    setForm((f) => (f ? { ...f, values: { ...f.values, [key]: value } } : f));
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || lock.current) return;
    const v = form.values,
      currency = form.options.currencies.find((c) => c.id === v.currency_code),
      common = { company_id: company, reason: v.reason };
    const parsed = form.row
      ? hrOvertimeMoneyDecisionSchema.safeParse({
          ...common,
          kind: form.kind,
          action: v.action,
          expected_version: form.row.version,
          source_hash: form.row.source_hash,
          confirm_override: v.confirm_override === "true",
        })
      : createHrOvertimeMoneySchema.safeParse({
          ...common,
          kind: form.kind,
          effective_from: v.effective_from,
          effective_to: v.effective_to || null,
          ...(form.kind === "policy"
            ? {
                reference: v.reference,
                name: v.name,
                terms: {
                  category: v.category,
                  basis_source: v.basis_source,
                  rate_basis_method: v.basis_source === "selected_components" ? "monthly" : "direct_hourly",
                  component_ids: v.basis_source === "selected_components" ? form.components : [],
                  earning_component_id: v.earning_component_id,
                  currency_code: v.currency_code,
                  money_scale: currency?.scale,
                  ordinary_hours: v.basis_source === "selected_components" ? v.ordinary_hours : null,
                  multiplier: v.multiplier,
                  rounding_mode: v.rounding_mode,
                  rounding_stage: v.rounding_stage,
                  minute_precision: Number(v.minute_precision),
                  hourly_rate_precision: Number(v.hourly_rate_precision),
                  intermediate_precision: Number(v.intermediate_precision),
                  source_reference: v.source_reference,
                },
              }
            : {
                employee_id: v.employee_id,
                policy_version_id: v.policy_version_id,
                direct_rate:
                  form.options.policies.find((p) => p.id === v.policy_version_id)?.terms?.basis_source ===
                  "direct_contractual_rate"
                    ? v.direct_rate
                    : null,
              }),
        });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    const hash = JSON.stringify({ id: form.row?.id, input: parsed.data });
    if (retry.current?.hash !== hash) retry.current = { hash, key: crypto.randomUUID() };
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const result = form.row
        ? await client.decideOvertimeMoney(
            form.row.id,
            parsed.data as HrOvertimeMoneyDecision,
            csrfToken(),
            retry.current.key,
          )
        : await client.createOvertimeMoney(
            createHrOvertimeMoneySchema.parse(parsed.data),
            csrfToken(),
            retry.current.key,
          );
      retry.current = null;
      setNotice("Saved monetary overtime · " + label(result.status) + " · version " + result.version);
      setForm(null);
      setRevision((n) => n + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The monetary overtime change could not be saved.");
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  const field = (key: string, title: string, type = "text", required = true) => (
    <Field title={title}>
      <Input
        className="box-border! w-full min-w-0! max-w-full!"
        type={type}
        value={form?.values[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        required={required}
        maxLength={type === "text" ? 500 : undefined}
      />
    </Field>
  );
  const select = (key: string, title: string, options: { id: string; label: string }[], required = true) => (
    <Field title={title}>
      <select
        className={selectClass}
        value={form?.values[key] ?? ""}
        onChange={(e) => change(key, e.target.value)}
        required={required}
      >
        <option value="">Choose {title.toLowerCase()}</option>
        {options.map((o) => (
          <option value={o.id} key={o.id}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
  const enumOptions = (values: string[]) => values.map((id) => ({ id, label: label(id) }));
  return (
    <section className="grid min-w-0 gap-4" aria-label="Monetary overtime setup">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Monetary overtime
          </h3>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Released company policy → approved employee arrangement → frozen attendance → Payroll calculation. Fixed
            monthly salary authority is required. Rates and hours must come from your approved source.
          </p>
        </div>
        {data?.can_create && (
          <Button onClick={() => open(null)} className="text-primary-foreground!">
            <Plus className="h-4 w-4" />
            {section === "policies" ? "New monetary policy" : "New employee arrangement"}
          </Button>
        )}
      </header>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Monetary overtime sections">
        <Button
          variant={section === "policies" ? "secondary" : "outline"}
          aria-pressed={section === "policies"}
          disabled={!canPolicy}
          onClick={() => {
            setSection("policies");
            setOffset(0);
          }}
        >
          Company policies
        </Button>
        <Button
          variant={section === "arrangements" ? "secondary" : "outline"}
          aria-pressed={section === "arrangements"}
          disabled={!canArrangement}
          onClick={() => {
            setSection("arrangements");
            setOffset(0);
          }}
        >
          Employee arrangements
        </Button>
      </div>
      <div className="grid min-w-0 items-end gap-3 sm:grid-cols-[1fr_auto]">
        <Field title="Search monetary overtime">
          <Input
            value={search}
            maxLength={120}
            placeholder={section === "policies" ? "Policy reference or name" : "Employee name or number"}
            onChange={(e) => {
              setSearch(e.target.value);
              setOffset(0);
            }}
          />
        </Field>
        <Button variant="outline" disabled={state.loading} onClick={() => setRevision((n) => n + 1)}>
          <RefreshCw className="h-4 w-4" />
          Refresh overtime
        </Button>
      </div>
      {!form && (error || state.error) && (
        <p role="alert" className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">
          {error || state.error}
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </p>
      )}
      {!enabled ? (
        <p className="text-sm text-muted-foreground">Select a company and use an authorized Payroll role.</p>
      ) : state.loading ? (
        <p role="status">Loading monetary overtime…</p>
      ) : !data?.items.length ? (
        <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
          No matching {section}.{" "}
          {section === "policies"
            ? "Create, submit, independently approve and release a policy before assigning employees."
            : "Create an arrangement against a released policy, then submit it for independent approval."}
        </p>
      ) : (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {data.items.map((row) => (
            <article key={row.id} className={panel + " grid gap-3"}>
              <header className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="break-all text-xs text-muted-foreground">{row.reference}</p>
                  <h4 className="mt-1 break-words font-semibold">{row.name}</h4>
                </div>
                <State value={row.status} />
              </header>
              <p className="text-xs text-muted-foreground">
                {row.effective_from} → {row.effective_to ?? "Open ended"} · version {row.version}
              </p>
              {row.terms ? (
                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className="text-xs text-muted-foreground">Basis</dt>
                    <dd className="mt-1">{label(row.terms.basis_source)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Category / currency</dt>
                    <dd className="mt-1">
                      {label(row.terms.category)} · {row.terms.currency_code}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Multiplier</dt>
                    <dd className="mt-1 font-mono">{row.terms.multiplier}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Ordinary hours / direct rate</dt>
                    <dd className="mt-1 break-all font-mono">
                      {row.direct_rate ?? row.terms.ordinary_hours ?? "Direct hourly"}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-xs text-muted-foreground">Historical terms retained read-only.</p>
              )}
              <Button variant="outline" className="justify-self-start" onClick={() => open(row)}>
                Review monetary record
              </Button>
            </article>
          ))}
        </div>
      )}
      {data && data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!offset || state.loading}
              onClick={() => setOffset((n) => Math.max(0, n - 25))}
            >
              Previous overtime
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= data.total || state.loading}
              onClick={() => setOffset((n) => n + 25)}
            >
              Next overtime
            </Button>
          </div>
        </div>
      )}
      {data?.options.truncated && (
        <p className="text-xs text-muted-foreground">
          Some choices are outside the bounded lookup. Narrow the employee search or review older policy records before
          continuing.
        </p>
      )}
      <Dialog
        open={!!form}
        onOpenChange={(open) => {
          if (!open && !busy) setForm(null);
        }}
      >
        <DialogContent
          showCloseButton={!busy}
          className="max-h-[90dvh] overflow-y-auto font-sans sm:max-w-3xl! [&_p]:mb-0 [&_dd]:ml-0 [&_input]:font-normal! [&_select]:font-normal! [&_textarea]:font-normal!"
        >
          <DialogHeader>
            <DialogTitle>
              {form?.row
                ? "Review monetary overtime"
                : form?.kind === "policy"
                  ? "New monetary overtime policy"
                  : "New employee overtime arrangement"}
            </DialogTitle>
            <DialogDescription>
              {form?.row
                ? "Review retained terms and history. A decision uses the captured version and source fingerprint."
                : "Drafts do not affect Payroll. Submission, independent approval and policy release are required."}
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="grid min-w-0 gap-4">
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {form.row ? (
                <>
                  <dl className="grid gap-3 rounded-lg border border-border p-3 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-muted-foreground">Record</dt>
                      <dd className="mt-1 break-all">
                        {form.row.reference} · {form.row.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Status / effective range</dt>
                      <dd className="mt-1">
                        {label(form.row.status)} · {form.row.effective_from} → {form.row.effective_to ?? "Open ended"}
                      </dd>
                    </div>
                    {form.row.terms && (
                      <>
                        <div>
                          <dt className="text-muted-foreground">Rate / ordinary hours</dt>
                          <dd className="mt-1 break-all">
                            {form.row.direct_rate ?? form.row.terms.ordinary_hours ?? "Direct hourly"} · multiplier{" "}
                            {form.row.terms.multiplier}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Currency / rounding</dt>
                          <dd className="mt-1">
                            {form.row.terms.currency_code} · {form.row.terms.money_scale} decimals ·{" "}
                            {label(form.row.terms.rounding_stage)} · {label(form.row.terms.rounding_mode)}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Approved source reference</dt>
                          <dd className="mt-1 break-words">{form.row.terms.source_reference}</dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Basis component identifiers</dt>
                          <dd className="mt-1 break-all font-mono text-xs">
                            {form.row.terms.component_ids.join(", ") || "Explicit direct contractual rate"}
                          </dd>
                        </div>
                      </>
                    )}
                  </dl>
                  <details className="text-xs text-muted-foreground">
                    <summary className="cursor-pointer">Source fingerprint</summary>
                    <p className="mt-2 break-all font-mono">{form.row.source_hash}</p>
                  </details>
                  <details className="text-sm">
                    <summary className="cursor-pointer">Monetary decision history ({form.row.history.length})</summary>
                    <ol className="mt-3 grid gap-3">
                      {form.row.history.map((h, i) => (
                        <li key={i} className="border-l-2 border-primary/30 pl-3">
                          <strong>{label(h.action)}</strong> · {h.actor_id}
                          {h.override ? " · audited override" : ""}
                          <p className="mt-1 text-xs text-muted-foreground">
                            {h.reason} · {h.occurred_at}
                          </p>
                        </li>
                      ))}
                    </ol>
                  </details>
                </>
              ) : (
                <fieldset disabled={busy} className="m-0! grid min-w-0 gap-4 border-0! p-0! sm:grid-cols-2">
                  {field("effective_from", "Overtime effective from", "date")}
                  {field("effective_to", "Overtime effective to", "date", false)}
                  {form.kind === "policy" ? (
                    <>
                      {field("reference", "Monetary policy reference")}
                      {field("name", "Monetary policy name")}
                      {select("category", "Overtime category", enumOptions(["regular", "weekend", "holiday"]))}
                      {select("currency_code", "Monetary currency", form.options.currencies)}
                      {select(
                        "basis_source",
                        "Rate basis source",
                        enumOptions(["selected_components", "direct_contractual_rate"]),
                      )}
                      {select("earning_component_id", "Overtime earning component", form.options.components)}
                      {form.values.basis_source === "selected_components" && (
                        <>
                          <Field title="Overtime basis components">
                            <select
                              multiple
                              required
                              size={4}
                              className={selectClass + " h-32!"}
                              value={form.components}
                              onChange={(e) => {
                                const components = Array.from(e.target.selectedOptions).map((o) => o.value);
                                setForm((f) => (f ? { ...f, components } : f));
                              }}
                            >
                              {form.options.components.map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.label}
                                </option>
                              ))}
                            </select>
                          </Field>
                          {field("ordinary_hours", "Ordinary hours for monthly basis")}
                        </>
                      )}
                      {field("multiplier", "Monetary multiplier")}
                      {select(
                        "rounding_stage",
                        "Overtime rounding stage",
                        enumOptions(["per_ot_day", "hourly_rate", "final_employee_period"]),
                      )}
                      {select(
                        "rounding_mode",
                        "Overtime rounding mode",
                        enumOptions(["half_up", "half_even", "down", "up"]),
                      )}
                      {field("source_reference", "Monetary policy source reference")}
                      <details className="sm:col-span-2">
                        <summary className="cursor-pointer text-sm">Intermediate precision</summary>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          {select(
                            "minute_precision",
                            "Minute precision",
                            enumOptions(Array.from({ length: 9 }, (_, i) => String(i))),
                          )}
                          {select(
                            "hourly_rate_precision",
                            "Hourly rate precision",
                            enumOptions(Array.from({ length: 9 }, (_, i) => String(i))),
                          )}
                          {select(
                            "intermediate_precision",
                            "Amount precision",
                            enumOptions(Array.from({ length: 9 }, (_, i) => String(i))),
                          )}
                        </div>
                      </details>
                    </>
                  ) : (
                    <>
                      {select("employee_id", "Overtime employee", form.options.employees)}
                      {select(
                        "policy_version_id",
                        "Released monetary policy",
                        form.options.policies.map((p) => ({
                          id: p.id,
                          label: p.reference + " · " + p.name + " · " + p.terms?.currency_code,
                        })),
                      )}
                      {form.options.policies.find((p) => p.id === form.values.policy_version_id)?.terms
                        ?.basis_source === "direct_contractual_rate" &&
                        field("direct_rate", "Direct contractual hourly rate")}
                      <p className="text-sm text-muted-foreground sm:col-span-2">
                        The policy supplies the approved basis components, currency, multiplier and rounding. Employees
                        are bounded by the current search and company placement on the Payroll month.
                      </p>
                    </>
                  )}
                </fieldset>
              )}
              {form.row && !!form.row.allowed_actions.length && (
                <fieldset disabled={busy} className="m-0! grid min-w-0 gap-4 border-0! p-0! sm:grid-cols-2">
                  {select("action", "Monetary decision", enumOptions(form.row.allowed_actions))}
                  {permissions.includes("platform.approval.override") &&
                    form.values.action !== "submit" &&
                    select("confirm_override", "Monetary administrator override", [
                      { id: "false", label: "Use independent approval" },
                      { id: "true", label: "Explicit audited administrator override" },
                    ])}
                </fieldset>
              )}
              {(!form.row || !!form.row.allowed_actions.length) && (
                <>
                  <Field title="Monetary change reason">
                    <Textarea
                      required
                      minLength={5}
                      maxLength={500}
                      disabled={busy}
                      value={form.values.reason}
                      onChange={(e) => change("reason", e.target.value)}
                    />
                  </Field>
                  <p className="text-xs text-muted-foreground">
                    Submitted terms are locked for review. Released policies and approved arrangements preserve
                    historical authority. Overlapping released ranges and calculated Payroll periods prevent retroactive
                    changes.
                  </p>
                  <Button type="submit" disabled={busy} className="justify-self-start text-primary-foreground!">
                    {busy ? "Saving…" : form.row ? "Confirm monetary decision" : "Save monetary draft"}
                  </Button>
                </>
              )}
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
