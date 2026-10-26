"use client";
import { useMemo, useRef, useState } from "react";
import { Plus, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useSession } from "@/lib/session/session-provider";
import {
  createHrLocalizationSchema,
  hrLocalizationDecisionSchema,
  type HrLocalizationQuery,
  type HrLocalizationRecord,
  type HrLocalizationWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, State, panel, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";
type Kind = HrLocalizationQuery["kind"];
const titles: Record<Kind, string> = {
  jurisdiction_override: "Employee jurisdiction",
  jurisdiction_override_revocation: "Revoke jurisdiction override",
  legal_profile: "Legal employer",
  payroll_configuration: "Payroll currency",
  work_location: "Work jurisdictions",
  activation: "Published packs",
  declaration: "Employee declarations",
  parameter: "Contribution bases",
  pack_release: "Rule publishing",
};
type Definition = {
  key: string;
  title: string;
  type?: "date" | "number" | "money";
  options?: keyof Omit<HrLocalizationWorkspace["options"], "truncated">;
  choices?: [string, string][];
  optional?: boolean;
};
const start: Definition = { key: "effective_from", title: "Effective from", type: "date" },
  end: Definition = { key: "effective_to", title: "Effective to", type: "date", optional: true },
  jurisdiction: Definition = { key: "jurisdiction_id", title: "Jurisdiction", options: "jurisdictions" },
  currency: Definition = { key: "currency_code", title: "Currency", options: "currencies" },
  country: Definition = { key: "country_code", title: "Country", options: "countries" };
const definitions: Record<Kind, Definition[]> = {
  pack_release: [],
  jurisdiction_override: [
    { key: "employee_id", title: "Employee", options: "employees" },
    { key: "employee_assignment_id", title: "Approved employee placement", options: "assignments" },
    country,
    jurisdiction,
    { key: "rule_scope", title: "Published rule category", options: "rule_scopes" },
    { key: "legal_basis", title: "Reviewed legal basis" },
    { key: "evidence_reference", title: "Supporting evidence reference" },
    start,
    end,
  ],
  jurisdiction_override_revocation: [
    { key: "override_id", title: "Approved override to revoke", options: "overrides" },
    start,
    end,
  ],
  legal_profile: [
    country,
    jurisdiction,
    { key: "legal_entity_type_id", title: "Legal entity type", options: "entity_types" },
    start,
    end,
  ],
  payroll_configuration: [currency, start, end],
  work_location: [
    { key: "work_location_id", title: "Company work location", options: "work_locations" },
    country,
    jurisdiction,
    start,
    end,
  ],
  activation: [
    { key: "legal_profile_id", title: "Reviewed legal profile", options: "legal_profiles" },
    { key: "pack_version_id", title: "Published production pack", options: "packs" },
    jurisdiction,
    start,
    end,
  ],
  declaration: [
    { key: "employee_id", title: "Employee", options: "employees" },
    jurisdiction,
    { key: "tax_year", title: "Tax year identifier", type: "number" },
    {
      key: "supersedes_declaration_id",
      title: "Previous approved declaration",
      options: "declarations",
      optional: true,
    },
    currency,
    start,
    ...[
      ["estimated_annual_salary", "Estimated annual salary"],
      ["prior_taxable_salary", "Prior taxable salary"],
      ["prior_salary_tax_withheld", "Prior salary tax withheld"],
      ["documented_tax_credit", "Documented tax credit"],
      ["other_tax_withheld", "Other tax withheld"],
    ].map(([key, title]) => ({ key, title, type: "money" as const })),
    {
      key: "eobi_applicability",
      title: "EOBI applicability",
      choices: [
        ["applicable", "Applicable"],
        ["not_applicable", "Not applicable"],
      ],
    },
    {
      key: "provincial_social_security_status",
      title: "Provincial social security assessment",
      choices: [
        ["assessed_not_applicable", "Reviewed and not applicable"],
        ["external_pack_required", "External scheme pack required"],
      ],
    },
  ],
  parameter: [
    jurisdiction,
    currency,
    { key: "amount", title: "Approved contribution base", type: "money" },
    start,
    end,
  ],
};
type Form = {
  row: HrLocalizationRecord | null;
  kind: Kind;
  options: HrLocalizationWorkspace["options"];
  values: Record<string, string>;
};
export function HrPayrollLocalizationSetup({ company, onDate }: { company: string; onDate: string }) {
  const { api, session, csrfToken } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [];
  const [referenceCountry, setReferenceCountry] = useState("");
  const [kind, setKind] = useState<Kind>("legal_profile"),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [form, setForm] = useState<Form | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const canRead =
    permissions.includes("hr.payroll.setup.read") &&
    (!["declaration", "jurisdiction_override", "jurisdiction_override_revocation"].includes(kind) ||
      permissions.includes("hr.payroll.salary.read"));
  const query: HrLocalizationQuery = {
    company_id: company,
    kind,
    on_date: onDate,
    country_code: referenceCountry || undefined,
    search,
    limit: 25,
    offset,
  };
  const state = useAttendanceRead(company && canRead ? JSON.stringify([query, revision]) : null, () =>
      client.payrollLocalization(query),
    ),
    data = state.data;
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  function open(row: HrLocalizationRecord | null) {
    if (!data) return;
    setError("");
    setNotice("");
    setForm({
      row,
      kind,
      options: {
        ...data.options,
        countries: referenceCountry
          ? data.options.countries.filter((c) => c.id === referenceCountry)
          : data.options.countries,
      },
      values: {
        country_code: referenceCountry,
        effective_from: onDate,
        reason: "",
        source_reference: "",
        action: row?.allowed_actions[0] ?? "submit",
        confirm_override: "false",
      },
    });
  }
  function change(key: string, value: string) {
    setForm((f) => {
      if (!f) return f;
      const values = { ...f.values, [key]: value };
      if (key === "country_code") {
        values.jurisdiction_id = "";
        values.legal_entity_type_id = "";
      }
      if (key === "employee_id") values.employee_assignment_id = "";
      if (key === "override_id") {
        const selected = f.options.overrides.find((o) => o.id === value);
        values.effective_from = selected?.effective_from ?? "";
        values.effective_to = selected?.effective_to ?? "";
      }
      if (key === "employee_id" || key === "jurisdiction_id" || key === "tax_year")
        values.supersedes_declaration_id = "";
      if (key === "pack_version_id") {
        values.jurisdiction_id = f.options.packs.find((p) => p.id === value)?.jurisdiction_id ?? "";
      }
      return { ...f, values };
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!form || guard.current || !csrfToken()) return;
    const v = form.values;
    let terms: Record<string, unknown> = { kind: form.kind };
    if (!form.row && form.kind === "pack_release") {
      try {
        terms = { ...JSON.parse(v.bundle_json ?? ""), kind: "pack_release" };
      } catch {
        setError("Enter a valid JSON rule bundle.");
        return;
      }
    }
    for (const d of definitions[form.kind])
      terms[d.key] = d.type === "number" ? Number(v[d.key]) : d.optional ? v[d.key] || null : (v[d.key] ?? "");
    if (form.kind === "payroll_configuration") terms.payroll_frequency = "monthly";
    if (form.kind === "parameter") {
      terms.scheme_code = "eobi";
      terms.parameter_key = "contribution_base";
    }
    const parsed = form.row
      ? hrLocalizationDecisionSchema.safeParse({
          company_id: company,
          action: v.action,
          expected_version: form.row.version,
          source_hash: form.row.source_hash,
          confirm_override: v.confirm_override === "true",
          reason: v.reason,
        })
      : createHrLocalizationSchema.safeParse({
          company_id: company,
          terms,
          source_reference: v.source_reference,
          reason: v.reason,
        });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.path.join(".") + ": " + i.message).join(" "));
      return;
    }
    const fingerprint = JSON.stringify([form.row?.id, parsed.data]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      if (form.row)
        await client.decidePayrollLocalization(
          form.row.id,
          hrLocalizationDecisionSchema.parse(parsed.data),
          csrfToken(),
          retry.current.key,
        );
      else
        await client.createPayrollLocalization(
          createHrLocalizationSchema.parse(parsed.data),
          csrfToken(),
          retry.current.key,
        );
      retry.current = null;
      setForm(null);
      setRevision((r) => r + 1);
      setNotice("Statutory setup saved with its approval history.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The statutory setup could not be saved.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="grid min-w-0 gap-4" aria-label="Payroll statutory setup">
      <div>
        <h3 className="flex items-center gap-2 text-lg font-semibold">
          <ShieldCheck className="h-5 w-5" />
          Statutory setup &amp; review
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Review the legal employer, location and employee facts used by Payroll. Approval applies the record to the
          shared ERP data. Published rules supply the rates.
        </p>
      </div>
      <nav aria-label="Statutory setup sections" className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {(Object.keys(titles) as Kind[]).map((k) => (
          <Button
            key={k}
            aria-pressed={kind === k}
            variant="outline"
            className={
              "h-auto min-h-10 whitespace-normal text-left " + (kind === k ? "border-primary bg-primary/10" : "")
            }
            disabled={!!form || busy}
            onClick={() => {
              setKind(k);
              setOffset(0);
              setSearch("");
            }}
          >
            {titles[k]}
          </Button>
        ))}
      </nav>
      {!canRead ? (
        <p role="status" className="text-sm text-muted-foreground">
          Statutory setup and salary read permissions are required for employee-specific setup.
        </p>
      ) : (
        <>
          <Field title="Reference country">
            <select
              className={selectClass}
              value={referenceCountry}
              disabled={!!form || busy}
              onChange={(e) => setReferenceCountry(e.target.value)}
            >
              <option value="">All countries</option>
              {data?.options.countries.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          {["declaration", "jurisdiction_override", "jurisdiction_override_revocation"].includes(kind) && (
            <Field title="Employee lookup search">
              <Input
                value={search}
                disabled={!!form || busy}
                placeholder="Employee name or number"
                onChange={(e) => setSearch(e.target.value)}
              />
            </Field>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              disabled={!!form || busy || state.loading}
              onClick={() => setRevision((r) => r + 1)}
            >
              <RefreshCw className="h-4 w-4" />
              Refresh statutory setup
            </Button>
            {data?.can_create && (
              <Button disabled={!!form || busy} onClick={() => open(null)}>
                <Plus className="h-4 w-4" />
                New statutory setup
              </Button>
            )}
          </div>
          {data?.notices.map((n, i) => (
            <p key={i} className="text-xs leading-relaxed text-muted-foreground">
              {n}
            </p>
          ))}
          {data?.options.truncated && (
            <p className="text-sm text-[var(--nx-warning)]">
              Lookup results are limited to 500. Narrow the employee search; contact configuration support for missing
              reference options.
            </p>
          )}
          {(error || state.error) && (
            <p
              role="alert"
              className="break-words rounded-lg border border-[var(--nx-danger-border)] p-3 text-sm text-[var(--nx-danger)]"
            >
              {error || state.error}
            </p>
          )}
          {notice && (
            <p role="status" className="text-sm text-[var(--nx-success-text)]">
              {notice}
            </p>
          )}
          {state.loading ? (
            <p role="status">Loading statutory setup…</p>
          ) : !data?.items.length ? (
            <div className={panel + " text-sm text-muted-foreground"}>
              No governed requests for this section. Existing approved records remain available in the reviewed
              reference options.
            </div>
          ) : (
            <div className="grid min-w-0 gap-3 xl:grid-cols-2">
              {data.items.map((r) => (
                <article className={panel} key={r.id}>
                  <header className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <h4 className="font-semibold">{titles[r.kind]}</h4>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Effective {r.terms.effective_from} · version {r.version}
                      </p>
                    </div>
                    <State value={r.status} />
                  </header>
                  <p className="mt-3 break-words text-sm text-muted-foreground">{r.source_reference}</p>
                  {r.kind === "jurisdiction_override" && r.materialized_state && (
                    <p className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      Override record: <State value={r.materialized_state} />
                      {r.materialized_state === "revoked" &&
                        "Revoked through separate review; original approval and Payroll evidence are retained."}
                    </p>
                  )}
                  {r.kind === "pack_release" && (
                    <p className="mt-2 text-sm font-medium">
                      {r.terms.kind === "pack_release" ? r.terms.classification : ""} ·{" "}
                      {r.publication
                        ? "Published"
                        : r.status === "approved"
                          ? "Awaiting authorized publisher"
                          : r.status}
                    </p>
                  )}
                  <p className="mt-2 break-all font-mono text-xs text-muted-foreground">{r.id}</p>
                  <Button variant="outline" className="mt-4" disabled={busy || !!form} onClick={() => open(r)}>
                    Review statutory setup
                  </Button>
                </article>
              ))}
            </div>
          )}
          {!!data && data.total > 25 && (
            <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
              <span>
                {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  disabled={!offset || !!form || busy || state.loading}
                  onClick={() => setOffset((v) => Math.max(0, v - 25))}
                >
                  Previous setup
                </Button>
                <Button
                  variant="outline"
                  disabled={offset + 25 >= data.total || !!form || busy || state.loading}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next setup
                </Button>
              </div>
            </div>
          )}
        </>
      )}
      <Dialog
        open={!!form}
        onOpenChange={(v) => {
          if (!v && !busy) {
            setForm(null);
            setError("");
          }
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl!">
          <DialogHeader>
            <DialogTitle>{form?.row ? "Review statutory setup" : "New statutory setup"}</DialogTitle>
            <DialogDescription>
              {form ? titles[form.kind] : ""} · Approved facts are immutable. Use explicit effective dates and reviewed
              source evidence.
            </DialogDescription>
          </DialogHeader>
          {form && (
            <form onSubmit={save} className="grid min-w-0 grid-cols-1 gap-4">
              {error && (
                <p role="alert" className="break-words text-sm text-[var(--nx-danger)]">
                  {error}
                </p>
              )}
              {form.row ? (
                <>
                  {form.kind === "pack_release" && (
                    <>
                      <p className="text-sm font-semibold">
                        {form.row.terms.kind === "pack_release" ? form.row.terms.classification : ""} rule bundle
                      </p>
                      <Field title="Reviewed statutory bundle">
                        <Textarea
                          readOnly
                          spellCheck={false}
                          className="h-72 min-h-72 max-h-72 overflow-y-auto font-mono text-xs"
                          value={JSON.stringify(form.row.terms, null, 2)}
                        />
                      </Field>
                      <p className="break-all font-mono text-xs">Artifact: {form.row.bundle_hash}</p>
                      <p className="min-w-0 break-all text-sm text-muted-foreground">
                        {form.row.publication
                          ? "Published · " + form.row.publication.pack_version_id
                          : form.row.status === "approved"
                            ? "Approved · awaiting authorized publisher"
                            : "Independent approval is required before publication."}
                      </p>
                    </>
                  )}
                  <dl className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                    {Object.entries(form.row.terms)
                      .filter(
                        ([key]) =>
                          key !== "kind" && !(form.kind === "pack_release" && ["rules", "sources"].includes(key)),
                      )
                      .map(([key, value]) => {
                        const def = definitions[form.kind].find((d) => d.key === key),
                          option = def?.options ? form.options[def.options].find((o) => o.id === value) : null;
                        return (
                          <div key={key} className="min-w-0">
                            <dt className="text-xs text-muted-foreground">{def?.title ?? key.replaceAll("_", " ")}</dt>
                            <dd className="mt-1 break-words text-sm">
                              {option?.label ?? String(value ?? "Open ended")}
                            </dd>
                          </div>
                        );
                      })}
                  </dl>
                  <p className="break-words text-sm text-muted-foreground">Source: {form.row.source_reference}</p>
                  {form.row.materialized_state === "revoked" && (
                    <p className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed">
                      This override was revoked through a separately approved request. Its original approval and frozen
                      Payroll calculations remain available for audit. New calculations use the current reviewed
                      jurisdiction setup.
                    </p>
                  )}
                </>
              ) : form.kind === "pack_release" ? (
                <>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    Import a reviewed rule bundle with source document fingerprints and positive, boundary and
                    non-applicable test cases. Production rules require independent approval and an authorized
                    publisher. No rates are supplied automatically.
                  </p>
                  <aside className="rounded-lg border border-border bg-muted/30 p-3 text-sm leading-relaxed text-muted-foreground">
                    <p className="font-medium text-foreground">Rules that change during a Payroll month</p>
                    <p className="mt-2">
                      An unchanged monthly rule is charged once. A changing rule or input requires its reviewed
                      configuration to declare{" "}
                      <code className="break-all">context_basis: calendar_weighted_monthly</code>. The executor
                      allocates the unrounded monthly result by covered earned calendar days, then applies the rule’s
                      rounding. This basis must match the approved source specification.
                    </p>
                    <p className="mt-2">
                      Include reviewed full and partial-period vectors with <code>CONTEXT_DAYS</code> and{" "}
                      <code>EARNED_PERIOD_DAYS</code>. The executor supplies these values; keep them out of the formula
                      to avoid applying allocation twice. Unreviewed allocation remains blocked.
                    </p>
                  </aside>
                  <Field title="Statutory rule bundle JSON">
                    <Textarea
                      required
                      spellCheck={false}
                      className="h-72 min-h-72 max-h-72 overflow-y-auto font-mono text-xs"
                      disabled={busy}
                      value={form.values.bundle_json ?? ""}
                      onChange={(e) => change("bundle_json", e.target.value)}
                    />
                  </Field>
                  <Field title="Statutory source reference">
                    <Textarea
                      required
                      minLength={5}
                      maxLength={500}
                      disabled={busy}
                      value={form.values.source_reference ?? ""}
                      onChange={(e) => change("source_reference", e.target.value)}
                    />
                  </Field>
                </>
              ) : (
                <fieldset disabled={busy} className="m-0! grid min-w-0 grid-cols-1 gap-4 border-0! p-0! sm:grid-cols-2">
                  {definitions[form.kind].map((d) => {
                    let options = d.options ? form.options[d.options] : [];
                    if (d.options === "jurisdictions" || d.options === "entity_types")
                      options = options.filter(
                        (o) => !form.values.country_code || o.country_code === form.values.country_code,
                      );
                    if (d.options === "assignments")
                      options = options.filter((o) => o.employee_id === form.values.employee_id);
                    if (d.options === "declarations")
                      options = options.filter(
                        (o) =>
                          o.employee_id === form.values.employee_id &&
                          o.jurisdiction_id === form.values.jurisdiction_id &&
                          o.tax_year === Number(form.values.tax_year),
                      );
                    return (
                      <Field title={"Statutory " + d.title.toLowerCase()} key={d.key}>
                        {d.options || d.choices ? (
                          <select
                            className={selectClass}
                            required={!d.optional}
                            value={form.values[d.key] ?? ""}
                            onChange={(e) => change(d.key, e.target.value)}
                          >
                            <option value="">
                              {d.optional ? "No predecessor / new authority" : "Choose " + d.title.toLowerCase()}
                            </option>
                            {(d.choices ?? options.map((o) => [o.id, o.label])).map(([id, label]) => (
                              <option key={id} value={id}>
                                {label}
                              </option>
                            ))}
                          </select>
                        ) : d.key === "legal_basis" ? (
                          <Textarea
                            required
                            minLength={5}
                            maxLength={1000}
                            rows={4}
                            value={form.values[d.key] ?? ""}
                            onChange={(e) => change(d.key, e.target.value)}
                          />
                        ) : (
                          <Input
                            required={!d.optional}
                            type={d.type === "date" ? "date" : d.type === "number" ? "number" : "text"}
                            inputMode={d.type === "money" ? "decimal" : undefined}
                            min={d.type === "number" ? 2000 : undefined}
                            max={d.type === "number" ? 2200 : undefined}
                            readOnly={form.kind === "jurisdiction_override_revocation" && d.type === "date"}
                            maxLength={
                              d.type === "money"
                                ? 21
                                : d.key === "legal_basis"
                                  ? 1000
                                  : d.key === "evidence_reference"
                                    ? 500
                                    : undefined
                            }
                            value={form.values[d.key] ?? ""}
                            onChange={(e) => change(d.key, e.target.value)}
                          />
                        )}
                      </Field>
                    );
                  })}
                  {form.kind === "jurisdiction_override" && (
                    <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
                      This overrides only the selected published rule category. It selects that jurisdiction and its
                      ancestors; it does not set rates or replace unrelated categories. Matching rules must already be
                      published and activated. Mid-month changes require the published allocation policy. A different
                      reviewer must approve the request.
                    </p>
                  )}
                  {form.kind === "jurisdiction_override_revocation" && (
                    <p className="text-sm leading-relaxed text-muted-foreground sm:col-span-2">
                      The effective range is copied from the approved override. A separate reviewer must approve
                      revocation. Calculated Payroll must be recalculated; submitted or finalized periods block this
                      change. Original approval and calculation evidence remain retained.
                    </p>
                  )}
                  {form.kind === "payroll_configuration" && (
                    <p className="text-sm text-muted-foreground">Supported payroll frequency: monthly.</p>
                  )}
                  {form.kind === "parameter" && (
                    <p className="text-sm text-muted-foreground">
                      EOBI contribution base · use the approved company assessment; this form does not select a
                      statutory rate.
                    </p>
                  )}
                  <div className="sm:col-span-2">
                    <Field title="Statutory source reference">
                      <Textarea
                        required
                        minLength={5}
                        maxLength={500}
                        value={form.values.source_reference ?? ""}
                        onChange={(e) => change("source_reference", e.target.value)}
                      />
                    </Field>
                  </div>
                </fieldset>
              )}
              {[
                "declaration",
                "parameter",
                "pack_release",
                "jurisdiction_override",
                "jurisdiction_override_revocation",
              ].includes(form.kind) && (
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Employee declarations, jurisdiction changes, contribution bases and rule publication require a
                  different reviewer. Administrator self-approval is unavailable.
                </p>
              )}
              {form.kind === "activation" && !form.options.packs.length && (
                <p role="status" className="text-sm text-[var(--nx-warning)]">
                  No compatible production pack has been published. Ask the authorized publisher to release reviewed
                  rules before creating an activation.
                </p>
              )}
              {!!form.row?.allowed_actions.length && (
                <Field title="Statutory decision">
                  <select
                    className={selectClass}
                    disabled={busy}
                    value={form.values.action}
                    onChange={(e) => change("action", e.target.value)}
                  >
                    {form.row.allowed_actions.map((a) => (
                      <option key={a} value={a}>
                        {a}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {form.row &&
                ["legal_profile", "payroll_configuration", "work_location", "activation"].includes(form.kind) &&
                permissions.includes("platform.approval.override") && (
                  <Field title="Statutory administrator override">
                    <select
                      className={selectClass}
                      disabled={busy}
                      value={form.values.confirm_override}
                      onChange={(e) => change("confirm_override", e.target.value)}
                    >
                      <option value="false">Independent review</option>
                      <option value="true">Explicit audited administrator override</option>
                    </select>
                  </Field>
                )}
              {(!form.row || !!form.row.allowed_actions.length) && (
                <>
                  <Field title="Statutory change reason">
                    <Textarea
                      required
                      minLength={5}
                      maxLength={500}
                      disabled={busy}
                      value={form.values.reason}
                      onChange={(e) => change("reason", e.target.value)}
                    />
                  </Field>
                  <Button type="submit" disabled={busy} className="justify-self-start">
                    {busy ? "Saving…" : form.row ? "Confirm statutory decision" : "Save statutory draft"}
                  </Button>
                </>
              )}
              {form.row && (
                <details className="min-w-0 text-xs">
                  <summary className="cursor-pointer">Statutory approval history and fingerprint</summary>
                  <p className="mt-3 break-all font-mono">{form.row.source_hash}</p>
                  <ol className="mt-3 grid gap-3">
                    {form.row.history.map((h, i) => (
                      <li key={i} className="border-l-2 border-primary/30 pl-3">
                        <strong>{h.action}</strong>
                        <p className="mt-1 break-words">{h.reason}</p>
                        <p className="mt-1 break-all text-muted-foreground">
                          {h.actor_id} · {new Date(h.occurred_at).toLocaleString()}
                          {h.override ? " · Audited administrator override" : ""}
                        </p>
                      </li>
                    ))}
                  </ol>
                </details>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                className="justify-self-start"
                onClick={() => setForm(null)}
              >
                Close statutory setup
              </Button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
