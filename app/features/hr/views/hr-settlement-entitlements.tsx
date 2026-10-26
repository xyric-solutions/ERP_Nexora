"use client";
import {
  SettlementSalaryFactors,
  SettlementSalaryComponents,
  SettlementSalaryEvidence,
} from "../components/settlement-salary-controls";
import {
  SettlementCountryFields,
  SettlementCountryRule,
  SettlementCountryEvidence,
  settlementCountryTerms,
} from "../components/settlement-country-controls";
import { useRef, useState } from "react";
import {
  hrSettlementEntitlementActionSchema,
  type HrSettlementEntitlementAction,
  type HrLifecycleCaseRecord,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  Metric,
  State,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
import { formatHrMinor, parseHrCurrency } from "../components/payroll-money";
const titles = {
  submit_rule: "Submit company rule",
  approve_rule: "Approve company rule",
  reject_rule: "Reject company rule",
};
export function HrSettlementEntitlements({
  company,
  record,
  busy,
  onBusy,
  onCalculated,
}: {
  company: string;
  record: HrLifecycleCaseRecord | null;
  busy: boolean;
  onBusy: (value: boolean) => void;
  onCalculated: () => void;
}) {
  const { api, session, csrfToken } = useSession(),
    client = new HrApiClient(api),
    permissions = session?.user.permissions ?? [];
  const canRead = ["hr.employment_history.read", "hr.employment_lifecycle_policy.read", "hr.leave.type.read"].every(
    (p) => permissions.includes(p),
  );
  const [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [country, setCountry] = useState(""),
    [rule, setRule] = useState(""),
    [showCreate, setShowCreate] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState<{ id: string; version: number; action: keyof typeof titles } | null>(null);
  const t = record?.terms,
    exit = t?.kind === "settlement" ? t.exit_case_id : undefined;
  const query = {
    company_id: company,
    limit: 25,
    offset,
    ...(exit ? { exit_case_id: exit } : {}),
    ...(rule && exit ? { rule_id: rule } : {}),
  };
  const read = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
      client.settlementEntitlements(query),
    ),
    countryRead = useAttendanceRead(
      canRead && company && country ? JSON.stringify(["country-options", company, country]) : null,
      () => client.settlementEntitlements({ company_id: company, country_code: country, limit: 1, offset: 0 }),
    ),
    w = read.data;
  const [name, setName] = useState(""),
    [type, setType] = useState(""),
    [currency, setCurrency] = useState(""),
    [rate, setRate] = useState(""),
    [salaryMode, setSalaryMode] = useState(false),
    [cap, setCap] = useState(""),
    [service, setService] = useState("0"),
    [from, setFrom] = useState(localDate()),
    [until, setUntil] = useState(""),
    [reference, setReference] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  async function command(input: HrSettlementEntitlementAction) {
    if (guard.current) return;
    const parsed = hrSettlementEntitlementActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    onBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.actOnSettlementEntitlement(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice(
        input.action === "add_to_statement"
          ? "Calculated leave encashment added to the draft. Leave will be consumed only after independent statement approval."
          : input.action === "create_rule"
            ? "Company rule saved as a draft. Submit it for independent approval."
            : input.action === "approve_rule"
              ? "Company rule independently approved."
              : input.action === "reject_rule"
                ? "Company rule rejected; its history is retained."
                : "Company rule submitted for independent review.",
      );
      setDecision(null);
      setShowCreate(false);
      setReason("");
      setRevision((v) => v + 1);
      if (input.action === "add_to_statement") onCalculated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The entitlement action could not be completed.");
    } finally {
      guard.current = false;
      onBusy(false);
    }
  }
  if (!canRead)
    return (
      <section className={panel}>
        <h3 className="font-semibold">Leave encashment</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Company-scoped Lifecycle Policy and Leave Type read permissions are needed to view encashment rules.
        </p>
      </section>
    );
  const p = w?.preview,
    scale = w?.currencies.find((c) => c.code === currency)?.decimal_places ?? 2;
  return (
    <section className={panel + " min-w-0 space-y-4"} aria-label="Leave encashment" data-settlement-encashment>
      <div>
        <h3 className="text-xl font-semibold">Leave encashment</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Calculate from an independently approved company rule and the employee’s leave ledger. Pending requests are
          reserved. Statement approval deducts the encashed days; Payroll posting and Banking payment are separate.
        </p>
      </div>
      {(error || read.error) && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || read.error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      <Tabs defaultValue="calculate" className="min-w-0">
        <TabsList className="max-w-full">
          <TabsTrigger value="calculate">Calculate leave</TabsTrigger>
          <TabsTrigger value="rules">Company rules</TabsTrigger>
        </TabsList>
        <TabsContent value="calculate" className="min-w-0 space-y-4">
          {record?.state === "draft" && t?.kind === "settlement" ? (
            <>
              <p className="text-sm">
                Draft for <strong>{record.employee_name}</strong>. Add or refresh one calculated line per leave type.
              </p>
              <Field title="Approved encashment rule">
                <select
                  className={selectClass}
                  value={rule}
                  disabled={busy || read.loading}
                  onChange={(e) => {
                    setRule(e.target.value);
                    setError("");
                  }}
                >
                  <option value="">Choose an approved company rule</option>
                  {rule && !w?.items.some((r) => r.id === rule) && (
                    <option value={rule}>{p?.country_scope?.matched_rule_name ?? "Applicable country rule"}</option>
                  )}
                  {w?.items
                    .filter((r) => r.state === "approved")
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.terms.name} · {r.leave_type} · {r.terms.effective_from} to {r.terms.effective_to}
                      </option>
                    ))}
                </select>
              </Field>
              {w && !w.items.some((r) => r.state === "approved") && (
                <p className="text-sm text-muted-foreground">
                  No approved rule on this page. Use Company rules to create and independently approve a rule or page
                  through earlier rules below.
                </p>
              )}
              {p && (
                <>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    <Metric title="Posted leave balance" value={p.balance + " days"} hint={"As of " + p.as_of} />
                    <Metric
                      title="Pending / future reserved"
                      value={p.reserved + " / " + p.future_used}
                      hint="Days protected from encashment"
                    />
                    <Metric
                      title="Eligible after rule cap"
                      value={p.eligible_days + " days"}
                      hint={"Available " + p.available + " days"}
                    />
                    <Metric
                      title="Calculated entitlement"
                      value={p.currency + " " + formatHrMinor(p.amount_minor, p.money_scale)}
                      hint={
                        p.salary
                          ? "Reference daily rate " + formatHrMinor(p.rate_minor, p.money_scale) + "; total rounds once"
                          : "Rate " + formatHrMinor(p.rate_minor, p.money_scale) + " per day; half-up rounding"
                      }
                    />
                  </div>
                  {p.country_scope && (
                    <SettlementCountryEvidence evidence={p.country_scope} onRule={setRule} disabled={busy} />
                  )}
                  {p.salary && (
                    <SettlementSalaryEvidence
                      salary={p.salary}
                      currency={p.currency}
                      scale={p.money_scale}
                      quantity={p.eligible_days}
                      unit="days"
                    />
                  )}
                  {p.blockers.length > 0 ? (
                    <div role="alert" className="rounded-lg border border-destructive/40 p-3 text-sm text-destructive">
                      <p className="font-medium">Calculation needs review</p>
                      <ul className="mt-2 list-disc space-y-1 pl-5">
                        {p.blockers.map((b) => (
                          <li key={b}>{b}</li>
                        ))}
                      </ul>
                    </div>
                  ) : (
                    <form
                      className="space-y-3"
                      aria-label="Add calculated leave encashment"
                      onSubmit={(e) => {
                        e.preventDefault();
                        command({
                          action: "add_to_statement",
                          company_id: company,
                          id: record.id,
                          expected_version: record.version,
                          rule_id: p.rule_id,
                          source_hash: p.source_hash,
                          reason,
                        });
                      }}
                    >
                      <p className="text-sm text-muted-foreground">
                        This adds a source-protected draft line. It does not deduct leave, approve Payroll or make
                        payment.
                      </p>
                      <Field title="Calculation review reason">
                        <Textarea
                          value={reason}
                          onChange={(e) => setReason(e.target.value)}
                          required
                          minLength={10}
                          maxLength={500}
                          disabled={busy}
                        />
                      </Field>
                      <Button type="submit" disabled={busy} className="text-primary-foreground!">
                        Add or refresh calculated line
                      </Button>
                    </form>
                  )}
                </>
              )}
              {read.loading && <p role="status">Loading current rule and leave evidence…</p>}
            </>
          ) : (
            <p className="rounded-lg border border-border bg-muted p-4 text-sm">
              Open a draft settlement above to calculate leave encashment. Approved statements retain their original
              sources and leave deductions.
            </p>
          )}
        </TabsContent>
        <TabsContent value="rules" className="min-w-0 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="max-w-2xl text-sm text-muted-foreground">
              Rates and eligibility come from the company’s reviewed policy. Rules apply within explicit dates and
              cannot overlap for the same leave type and country/regional scope. Submitted terms are retained; rejected
              rules can be replaced with a new draft.
            </p>
            {w?.can_create_rule && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => {
                  setShowCreate((v) => !v);
                  setDecision(null);
                  setError("");
                }}
              >
                New company rule
              </Button>
            )}
          </div>
          {w?.items.length ? (
            <div className="relative max-w-full overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <caption className="sr-only">Governed company leave encashment rules</caption>
                <thead>
                  <tr>
                    {["Rule / leave type", "Rate and cap", "Effective dates", "State / actions"].map((v) => (
                      <th key={v} scope="col" className="border-b p-3">
                        {v}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {w.items.map((r) => (
                    <tr key={r.id} className="border-b">
                      <td className="max-w-72 break-words p-3">
                        <p className="font-semibold">{r.terms.name}</p>
                        <p>{r.leave_type}</p>
                        <SettlementCountryRule
                          scope={r.terms.legal_scope}
                          options={{ ...w, legal_jurisdictions: countryRead.data?.legal_jurisdictions ?? [] }}
                        />
                        <p className="mt-2 text-xs text-muted-foreground">{r.terms.policy_reference}</p>
                      </td>
                      <td className="p-3">
                        {r.terms.currency}{" "}
                        {r.terms.salary_basis
                          ? "Approved monthly salary × " +
                            r.terms.salary_basis.multiplier +
                            " ÷ " +
                            r.terms.salary_basis.divisor
                          : r.money_scale === null
                            ? r.terms.rate_minor + " minor units"
                            : formatHrMinor(r.terms.rate_minor, r.money_scale)}{" "}
                        / day
                        {r.terms.salary_basis && (
                          <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                            {r.terms.salary_basis.component_ids.map((id) => (
                              <li className="break-words" key={id}>
                                {w.salary_components.find((c) => c.id === id)?.name ?? id}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Cap {r.terms.maximum_days} days · minimum service {r.terms.minimum_service_days} days
                        </p>
                      </td>
                      <td className="p-3">
                        {r.terms.effective_from}
                        <br />
                        to {r.terms.effective_to}
                      </td>
                      <td className="p-3">
                        <State value={r.state} />
                        <div className="mt-2 flex flex-wrap gap-2">
                          {r.allowed_actions.map((action) => (
                            <Button
                              key={action}
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                setDecision({ id: r.id, version: r.version, action });
                                setReason("");
                                setShowCreate(false);
                              }}
                            >
                              {titles[action]}
                            </Button>
                          ))}
                        </div>
                        <p className="mt-2 max-w-64 break-words text-xs text-muted-foreground">
                          Author {r.created_by} · decision {r.decided_by ?? "Pending"}
                        </p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            !read.loading && (
              <p className="text-sm text-muted-foreground">
                No company encashment rules yet. No benefit or rate is assumed automatically.
              </p>
            )
          )}
          {decision && (
            <form
              className="space-y-3 rounded-lg border border-border p-4"
              aria-label="Company encashment rule decision"
              onSubmit={(e) => {
                e.preventDefault();
                command({
                  action: decision.action,
                  company_id: company,
                  id: decision.id,
                  expected_version: decision.version,
                  reason,
                });
              }}
            >
              <h4 className="font-semibold">{titles[decision.action]}</h4>
              <Field title="Rule decision reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} className="text-primary-foreground!">
                  Confirm rule decision
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                  Cancel review
                </Button>
              </div>
            </form>
          )}
          {showCreate && w && (
            <form
              className="space-y-4 rounded-lg border border-border p-4"
              aria-label="New company encashment rule"
              onSubmit={(e) => {
                e.preventDefault();
                try {
                  command({
                    action: "create_rule",
                    company_id: company,
                    terms: {
                      ...settlementCountryTerms(new FormData(e.currentTarget)),
                      name,
                      leave_type_id: type,
                      currency,
                      rate_minor: salaryMode ? "0" : parseHrCurrency(rate, scale),
                      ...(salaryMode
                        ? {
                            salary_basis: {
                              component_ids: new FormData(e.currentTarget).getAll("salary_components").map(String),
                              multiplier: Number(new FormData(e.currentTarget).get("salary_multiplier")),
                              divisor: Number(new FormData(e.currentTarget).get("salary_divisor")),
                            },
                          }
                        : {}),
                      maximum_days: cap,
                      minimum_service_days: Number(service),
                      effective_from: from,
                      effective_to: until,
                      policy_reference: reference,
                    },
                    reason,
                  });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Review the rule rate.");
                }
              }}
            >
              <h4 className="font-semibold">New company rule</h4>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field title="Rule name">
                  <Input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    minLength={3}
                    maxLength={160}
                    disabled={busy}
                  />
                </Field>
                <Field title="Eligible paid leave type">
                  <select
                    className={selectClass}
                    value={type}
                    onChange={(e) => setType(e.target.value)}
                    required
                    disabled={busy}
                  >
                    <option value="">Choose paid leave</option>
                    {w.leave_types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field title="Rule currency">
                  <select
                    className={selectClass}
                    value={currency}
                    required
                    disabled={busy}
                    onChange={(e) => setCurrency(e.target.value)}
                  >
                    <option value="">Choose currency</option>
                    {w.currencies.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.code} · {c.decimal_places} decimals
                      </option>
                    ))}
                  </select>
                </Field>
                <Field title="Rate source">
                  <select
                    className={selectClass}
                    value={salaryMode ? "salary" : "fixed"}
                    disabled={busy}
                    onChange={(e) => setSalaryMode(e.target.value === "salary")}
                  >
                    <option value="fixed">Fixed company currency amount</option>
                    <option value="salary" disabled={!w.can_configure_salary}>
                      Approved monthly salary components
                    </option>
                  </select>
                </Field>
                {salaryMode ? (
                  <SettlementSalaryFactors busy={busy} />
                ) : (
                  <Field title="Company rate per day">
                    <Input
                      inputMode="decimal"
                      value={rate}
                      onChange={(e) => setRate(e.target.value)}
                      required
                      disabled={busy}
                      placeholder="For example 100.50"
                    />
                  </Field>
                )}
                <Field title="Maximum encashable days">
                  <Input
                    inputMode="decimal"
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
                    required
                    pattern="[0-9]{1,4}(\.[0-9]{1,4})?"
                    disabled={busy}
                  />
                </Field>
                <Field title="Minimum completed service days">
                  <Input
                    type="number"
                    min={0}
                    max={36500}
                    step={1}
                    value={service}
                    onChange={(e) => setService(e.target.value)}
                    required
                    disabled={busy}
                  />
                </Field>
                <Field title="Effective from">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} required disabled={busy} />
                </Field>
                <Field title="Effective until">
                  <Input
                    type="date"
                    value={until}
                    min={from}
                    onChange={(e) => setUntil(e.target.value)}
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
              {salaryMode && <SettlementSalaryComponents busy={busy} components={w.salary_components} />}
              <SettlementCountryFields
                country={country}
                onCountry={setCountry}
                options={{ ...w, legal_jurisdictions: countryRead.data?.legal_jurisdictions ?? [] }}
                busy={busy}
                loading={countryRead.loading}
                error={countryRead.error}
              />
              <Field title="Approved company policy reference">
                <Textarea
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  required
                  minLength={10}
                  maxLength={1000}
                  disabled={busy}
                />
              </Field>
              <Field title="Rule preparation reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={10}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="text-primary-foreground!" disabled={busy}>
                  Save company rule draft
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setShowCreate(false)}>
                  Cancel editing
                </Button>
              </div>
            </form>
          )}
        </TabsContent>
      </Tabs>
      {w && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {w.total ? offset + 1 : 0}–{Math.min(offset + w.limit, w.total)} of {w.total} company rules
          </span>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || offset === 0}
              onClick={() => {
                setOffset((v) => Math.max(0, v - 25));
                setRule("");
              }}
            >
              Previous rules
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy || offset + 25 >= w.total}
              onClick={() => {
                setOffset((v) => v + 25);
                setRule("");
              }}
            >
              Next rules
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
              Refresh leave evidence
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
