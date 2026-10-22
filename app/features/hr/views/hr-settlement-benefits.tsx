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
import { useId, useRef, useState } from "react";
import {
  hrSettlementBenefitActionSchema,
  type HrSettlementBenefitAction,
  type HrLifecycleCaseRecord,
  type HrBenefitRuleTerms,
} from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
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
  submit_rule: "Submit benefit rule",
  approve_rule: "Approve benefit rule",
  reject_rule: "Reject benefit rule",
};
const basisLabels = {
  fixed_amount: "Single award",
  completed_service_years: "Completed service years",
  service_days: "Service days / partial years",
};
export function HrSettlementBenefits({
  company,
  record,
  busy,
  onBusy,
  onCalculated,
}: {
  company: string;
  record: HrLifecycleCaseRecord | null;
  busy: boolean;
  onBusy: (v: boolean) => void;
  onCalculated: () => void;
}) {
  const factorsId = useId();
  const { api, session, csrfToken } = useSession(),
    client = new HrApiClient(api),
    canRead = ["hr.employment_history.read", "hr.employment_lifecycle_policy.read"].every((p) =>
      session?.user.permissions.includes(p),
    );
  const [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [country, setCountry] = useState(""),
    [rule, setRule] = useState(""),
    [create, setCreate] = useState(false),
    [basis, setBasis] = useState<HrBenefitRuleTerms["basis"]>("fixed_amount"),
    [salaryMode, setSalaryMode] = useState(false),
    [useFactors, setUseFactors] = useState(false),
    [currency, setCurrency] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [decision, setDecision] = useState<{ id: string; version: number; action: keyof typeof titles } | null>(null);
  const exit = record?.terms.kind === "settlement" ? record.terms.exit_case_id : undefined,
    q = {
      company_id: company,
      limit: 25,
      offset,
      ...(exit ? { exit_case_id: exit } : {}),
      ...(exit && rule ? { rule_id: rule } : {}),
    };
  const read = useAttendanceRead(canRead && company ? JSON.stringify([q, revision]) : null, () =>
      client.settlementBenefits(q),
    ),
    countryRead = useAttendanceRead(
      canRead && company && country ? JSON.stringify(["country-options", company, country]) : null,
      () => client.settlementBenefits({ company_id: company, country_code: country, limit: 1, offset: 0 }),
    ),
    w = read.data,
    guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  async function command(input: HrSettlementBenefitAction) {
    if (guard.current) return;
    const parsed = hrSettlementBenefitActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    onBusy(true);
    setError("");
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.actOnSettlementBenefit(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setCreate(false);
      setDecision(null);
      setReason("");
      setRevision((v) => v + 1);
      setNotice(
        input.action === "add_to_statement"
          ? "Company benefit saved to the draft. Submit the statement for independent review."
          : input.action === "create_rule"
            ? "Benefit rule saved as a draft. Submit it for independent approval."
            : "Company benefit rule decision recorded.",
      );
      if (input.action === "add_to_statement") onCalculated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The benefit action could not be completed.");
    } finally {
      guard.current = false;
      onBusy(false);
    }
  }
  if (!canRead)
    return (
      <section className={panel}>
        <h3 className="font-semibold">Company settlement benefits</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Company Lifecycle policy read permission is required to review benefit rules.
        </p>
      </section>
    );
  const scale = w?.currencies.find((c) => c.code === currency)?.decimal_places ?? 2,
    p = w?.preview;
  return (
    <section className={panel + " min-w-0 space-y-4"} aria-label="Company settlement benefits" data-settlement-benefits>
      <div>
        <h3 className="text-lg font-semibold">Company settlement benefits</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Calculate company gratuity, severance, notice and other contractual benefits by a single award, completed
          service years or actual service days with approved policy factors. Rules require independent approval and a
          signed policy reference. These settings do not determine statutory entitlement or make payment.
        </p>
      </div>
      {(error || read.error) && (
        <p role="alert" className="rounded-lg border border-destructive p-3 text-sm text-destructive">
          {error || read.error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
          {notice}
        </p>
      )}
      {read.loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading company benefit evidence…
        </p>
      )}
      {w && (
        <Tabs defaultValue={record ? "calculate" : "rules"} className="min-w-0">
          <TabsList className="max-w-full">
            <TabsTrigger value="calculate">Calculate benefit</TabsTrigger>
            <TabsTrigger value="rules">Benefit rules</TabsTrigger>
          </TabsList>
          <TabsContent value="calculate" className="space-y-4 pt-3">
            {record?.state !== "draft" || !exit ? (
              <p className="text-sm text-muted-foreground">
                Open a draft final settlement for an approved exit to calculate a benefit. Approved and cancelled
                statements retain their original evidence.
              </p>
            ) : (
              <>
                <Field title="Approved benefit rule">
                  <select
                    className={selectClass + " min-w-0 max-w-full"}
                    disabled={busy || create || !!decision}
                    value={rule}
                    onChange={(e) => {
                      setRule(e.target.value);
                      setReason("");
                      setError("");
                    }}
                  >
                    <option value="">Choose approved company rule</option>
                    {rule && !w?.items.some((r) => r.id === rule) && (
                      <option value={rule}>{p?.country_scope?.matched_rule_name ?? "Applicable country rule"}</option>
                    )}
                    {w.items
                      .filter((r) => r.state === "approved")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.terms.name} · {r.terms.category} · {r.terms.direction}
                        </option>
                      ))}
                  </select>
                </Field>
                {!w.items.some((r) => r.state === "approved") && (
                  <p className="text-sm text-muted-foreground">
                    No approved benefit rules on this page. Review Benefit rules or use the page controls below.
                  </p>
                )}
                {p && (
                  <>
                    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                      <Metric
                        title="Completed service"
                        value={String(p.completed_service_years) + " years"}
                        hint={String(p.service_days) + " calendar days; " + p.employed_from + " to " + p.as_of}
                      />
                      <Metric
                        title="Eligible units"
                        value={String(p.eligible_units)}
                        hint={p.quantity_label + " capped by approved policy"}
                      />
                      <Metric
                        title="Approved rate"
                        value={p.currency + " " + formatHrMinor(p.rate_minor, p.money_scale)}
                        hint={
                          p.salary
                            ? "Reference rate rounded for display; total rounds once"
                            : "Company reference rate; final total rounds once"
                        }
                      />
                      <Metric
                        title={p.direction === "earning" ? "Benefit earning" : "Benefit deduction"}
                        value={p.currency + " " + formatHrMinor(p.amount_minor, p.money_scale)}
                        hint="Draft calculation; no Payroll posting or payment"
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
                        quantity={p.eligible_units}
                        unit={p.quantity_label}
                      />
                    )}
                    {p.blockers.map((b, i) => (
                      <p key={i} className="rounded-lg border border-border bg-muted p-3 text-sm">
                        {b}
                      </p>
                    ))}
                    <form
                      className="space-y-3"
                      aria-label="Add calculated company benefit"
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
                      <Field title="Benefit calculation review reason">
                        <Textarea
                          required
                          minLength={10}
                          maxLength={500}
                          value={reason}
                          disabled={busy}
                          onChange={(e) => setReason(e.target.value)}
                        />
                      </Field>
                      <p className="text-sm text-muted-foreground">
                        Adding or refreshing replaces this benefit category in the draft. Review other manual lines to
                        avoid counting the same obligation twice. Submission and independent approval recheck the
                        retained source.
                      </p>
                      <Button type="submit" disabled={busy || p.blockers.length > 0}>
                        Add or refresh benefit line
                      </Button>
                    </form>
                  </>
                )}
              </>
            )}
          </TabsContent>
          <TabsContent value="rules" className="space-y-4 pt-3">
            <p className="text-sm text-muted-foreground">
              Maintain company defaults and country/regional policies for each benefit category. Approved dates cannot
              overlap within the same scope. Country rules for a category use one consistent profile basis. Completed
              years use calendar anniversaries; service-day rules calculate partial years from actual elapsed or
              inclusive days and an explicit company divisor. Salary-derived rules use fixed monthly earning components.
              Policy factors and effective dates require independent approval; no legal rate is assumed.
            </p>
            {w.can_create_rule && !create && (
              <Button
                variant="outline"
                disabled={busy || !!decision}
                onClick={() => {
                  setCreate(true);
                  setError("");
                  setReason("");
                }}
              >
                New benefit rule
              </Button>
            )}
            {create && (
              <form
                aria-label="New company benefit rule"
                className="space-y-4 rounded-lg border border-border p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  const data = new FormData(e.currentTarget),
                    get = (k: string) => String(data.get(k) ?? "");
                  try {
                    command({
                      action: "create_rule",
                      company_id: company,
                      reason: get("reason"),
                      terms: {
                        ...settlementCountryTerms(data),
                        name: get("name"),
                        category: get("category") as "gratuity" | "severance" | "notice" | "other",
                        basis,
                        direction: get("direction") as "earning" | "deduction",
                        currency,
                        rate_minor: salaryMode ? "0" : parseHrCurrency(get("rate"), scale),
                        ...(salaryMode
                          ? {
                              salary_basis: {
                                component_ids: data.getAll("salary_components").map(String),
                                multiplier: Number(get("salary_multiplier")),
                                divisor: Number(get("salary_divisor")),
                              },
                            }
                          : {}),
                        ...(basis === "service_days"
                          ? { service_day_count: get("day_count") as "elapsed" | "inclusive" }
                          : {}),
                        ...(!salaryMode && (basis === "service_days" || useFactors)
                          ? {
                              rate_factors: {
                                multiplier: Number(get("salary_multiplier")),
                                divisor: Number(get("salary_divisor")),
                              },
                            }
                          : {}),
                        maximum_units: basis === "fixed_amount" ? 1 : Number(get("cap")),
                        minimum_service_days: Number(get("service")),
                        exit_kinds: data.getAll("exit_kinds") as Array<"resignation" | "termination">,
                        effective_from: get("from"),
                        effective_to: get("until"),
                        policy_reference: get("reference"),
                      },
                    });
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Review the company amount.");
                  }
                }}
              >
                <h4 className="font-semibold">New company benefit rule</h4>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <Field title="Benefit rule name">
                    <Input name="name" required minLength={3} maxLength={160} disabled={busy} />
                  </Field>
                  <Field title="Benefit category">
                    <select name="category" className={selectClass} required disabled={busy} defaultValue="">
                      <option value="">Choose category</option>
                      {["gratuity", "severance", "notice", "other"].map((v) => (
                        <option key={v} value={v}>
                          {v.charAt(0).toUpperCase() + v.slice(1)}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title="Calculation basis">
                    <select
                      className={selectClass}
                      value={basis}
                      disabled={busy}
                      onChange={(e) => setBasis(e.target.value as typeof basis)}
                    >
                      {Object.entries(basisLabels).map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title="Benefit direction">
                    <select name="direction" className={selectClass} required defaultValue="" disabled={busy}>
                      <option value="">Choose earning or deduction</option>
                      <option value="earning">Earning payable to employee</option>
                      <option value="deduction">Deduction recoverable from employee</option>
                    </select>
                  </Field>
                  <Field title="Benefit currency">
                    <select
                      className={selectClass}
                      required
                      disabled={busy}
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    >
                      <option value="">Choose currency</option>
                      {w.currencies.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.code}
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
                  {!salaryMode && (
                    <>
                      {" "}
                      <Field
                        title={
                          basis === "fixed_amount"
                            ? "Fixed company amount"
                            : basis === "service_days"
                              ? "Company reference amount"
                              : "Company rate per service year"
                        }
                      >
                        <Input
                          name="rate"
                          inputMode="decimal"
                          required
                          disabled={busy}
                          placeholder="Enter approved currency amount"
                        />
                      </Field>
                    </>
                  )}
                  {!salaryMode && basis !== "service_days" && (
                    <label htmlFor={factorsId} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={factorsId}
                        checked={useFactors}
                        onCheckedChange={(v) => setUseFactors(v === true)}
                        disabled={busy}
                      />
                      Apply company rate factors
                    </label>
                  )}
                  {(salaryMode || basis === "service_days" || useFactors) && (
                    <SettlementSalaryFactors busy={busy} labelPrefix={salaryMode ? "Salary" : "Policy"} />
                  )}{" "}
                  {basis !== "fixed_amount" && (
                    <Field
                      title={
                        basis === "service_days" ? "Maximum service days payable" : "Maximum service years payable"
                      }
                    >
                      <Input
                        name="cap"
                        type="number"
                        min={1}
                        max={basis === "service_days" ? 36500 : 100}
                        step={1}
                        required
                        disabled={busy}
                      />
                    </Field>
                  )}
                  {basis === "service_days" && (
                    <Field title="Service day counting">
                      <select name="day_count" className={selectClass} defaultValue="" required disabled={busy}>
                        <option value="">Choose signed policy convention</option>
                        <option value="elapsed">Elapsed days: exit date minus employment start</option>
                        <option value="inclusive">Inclusive days: count employment start and exit</option>
                      </select>
                    </Field>
                  )}
                  <Field title="Minimum service days">
                    <Input
                      name="service"
                      type="number"
                      min={0}
                      max={36500}
                      step={1}
                      required
                      defaultValue="0"
                      disabled={busy}
                    />
                  </Field>
                  <Field title="Benefit effective from">
                    <Input name="from" type="date" required defaultValue={localDate()} disabled={busy} />
                  </Field>
                  <Field title="Benefit effective until">
                    <Input name="until" type="date" required disabled={busy} />
                  </Field>
                </div>
                {salaryMode && <SettlementSalaryComponents busy={busy} components={w.salary_components} />}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-medium">Eligible exit types</legend>
                  {["resignation", "termination"].map((v) => (
                    <label key={v} className="flex items-center gap-2 text-sm">
                      <Checkbox name="exit_kinds" value={v} disabled={busy} />
                      {v === "resignation" ? "Resignation" : "Termination"}
                    </label>
                  ))}
                </fieldset>
                <SettlementCountryFields
                  country={country}
                  onCountry={setCountry}
                  options={{ ...w, legal_jurisdictions: countryRead.data?.legal_jurisdictions ?? [] }}
                  busy={busy}
                  loading={countryRead.loading}
                  error={countryRead.error}
                />
                <Field title="Signed company benefit policy reference">
                  <Textarea name="reference" required minLength={10} maxLength={1000} disabled={busy} />
                </Field>
                <Field title="Benefit rule preparation reason">
                  <Textarea name="reason" required minLength={10} maxLength={500} disabled={busy} />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy}>
                    Save benefit rule draft
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setCreate(false)}>
                    Cancel benefit rule
                  </Button>
                </div>
              </form>
            )}
            {w.items.length > 0 ? (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">Company settlement benefit rules</caption>
                  <thead>
                    <tr>
                      {["Company rule", "Terms and scope", "Status", "Review"].map((h) => (
                        <th key={h} scope="col" className="border-b p-3">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {w.items.map((r) => (
                      <tr key={r.id} className="border-b">
                        <td className="max-w-64 break-words p-3">
                          <p className="font-medium">{r.terms.name}</p>
                          <p className="text-muted-foreground">
                            {r.terms.category} · {r.terms.direction}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {r.terms.effective_from} – {r.terms.effective_to}
                          </p>
                        </td>
                        <td className="max-w-72 break-words p-3">
                          <p>
                            {basisLabels[r.terms.basis]} · {r.terms.currency}{" "}
                            {r.terms.salary_basis
                              ? "Approved monthly salary × " +
                                r.terms.salary_basis.multiplier +
                                " ÷ " +
                                r.terms.salary_basis.divisor
                              : r.money_scale === null
                                ? r.terms.rate_minor + " minor units"
                                : formatHrMinor(r.terms.rate_minor, r.money_scale)}
                          </p>
                          <p>
                            Cap {r.terms.maximum_units} {r.terms.basis === "service_days" ? "days" : "units"}; minimum{" "}
                            {r.terms.minimum_service_days} elapsed days
                            {r.terms.service_day_count ? " · " + r.terms.service_day_count + " day counting" : ""}
                          </p>
                          {r.terms.salary_basis && (
                            <ul className="mt-1 space-y-1 text-xs text-muted-foreground">
                              {r.terms.salary_basis.component_ids.map((id) => (
                                <li key={id} className="break-words">
                                  {w.salary_components.find((c) => c.id === id)?.name ??
                                    "Unavailable earning component: " + id}
                                </li>
                              ))}
                            </ul>
                          )}
                          {r.terms.rate_factors && (
                            <p>
                              Policy factor {r.terms.rate_factors.multiplier} ÷ {r.terms.rate_factors.divisor}; total
                              rounds once
                            </p>
                          )}
                          <p>{r.terms.exit_kinds.join(", ")}</p>
                          <SettlementCountryRule
                            scope={r.terms.legal_scope}
                            options={{ ...w, legal_jurisdictions: countryRead.data?.legal_jurisdictions ?? [] }}
                          />
                          <p className="mt-1 whitespace-pre-wrap text-muted-foreground">{r.terms.policy_reference}</p>
                        </td>
                        <td className="p-3">
                          <State value={r.state} />
                          <p className="mt-1 text-xs text-muted-foreground">Version {r.version}</p>
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            {r.allowed_actions.map((action) => (
                              <Button
                                key={action}
                                size="sm"
                                variant="outline"
                                disabled={busy || create || !!decision}
                                onClick={() => {
                                  setDecision({ id: r.id, version: r.version, action });
                                  setReason("");
                                }}
                              >
                                {titles[action]}
                              </Button>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No company benefit rules yet. Create a policy draft and obtain independent approval.
              </p>
            )}
            {decision && (
              <form
                className="space-y-3 rounded-lg border border-border p-4"
                aria-label="Company benefit rule decision"
                onSubmit={(e) => {
                  e.preventDefault();
                  command({
                    company_id: company,
                    id: decision.id,
                    action: decision.action,
                    expected_version: decision.version,
                    reason,
                  } as HrSettlementBenefitAction);
                }}
              >
                <h4 className="font-semibold">{titles[decision.action]}</h4>
                <p className="text-sm text-muted-foreground">
                  Review the rate, scope, dates and policy reference above. An author cannot approve their rule.
                </p>
                <Field title="Benefit rule decision reason">
                  <Textarea
                    required
                    minLength={10}
                    maxLength={500}
                    value={reason}
                    disabled={busy}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Field>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" disabled={busy}>
                    Confirm benefit rule decision
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                    Cancel benefit decision
                  </Button>
                </div>
              </form>
            )}
          </TabsContent>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-sm text-muted-foreground">
            <span>
              {w.total ? offset + 1 : 0}–{Math.min(offset + w.limit, w.total)} of {w.total} company benefit rules
            </span>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={busy || create || !!decision || offset === 0}
                onClick={() => setOffset((v) => Math.max(0, v - 25))}
              >
                Previous benefit rules
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={busy || create || !!decision || offset + 25 >= w.total}
                onClick={() => setOffset((v) => v + 25)}
              >
                Next benefit rules
              </Button>
            </div>
          </div>
        </Tabs>
      )}
    </section>
  );
}
