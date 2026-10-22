"use client";
import { useMemo, useRef, useState } from "react";
import {
  Calculator,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
  LockKeyhole,
  Wallet,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { hrPayrollRunActionSchema, type HrPayrollRunWorkspace, type HrPayrollRunAction } from "@nexora/contracts";
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
import { HrPayrollRunComparison } from "../components/hr-payroll-run-comparison";
import { payrollPages } from "./hr-payroll-workspace";
const actionTitle = {
  policy: "Create payroll policy",
  open: "Open payroll period",
  calculate: "Calculate salary results",
  submit: "Submit for review",
  return: "Return for corrections",
  approve: "Approve payroll",
};
type Draft = {
  action: HrPayrollRunAction["action"];
  snapshot: HrPayrollRunWorkspace;
  reason: string;
  confirm_override: boolean;
  currency_code: string;
  rounding_mode: "half_up" | "half_even" | "down" | "up";
  account: string;
  policy: string;
};
export function HrPayrollRunsWorkspace({
  review = false,
  onNavigate,
}: {
  review?: boolean;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.payroll.period.read");
  const [choice, setChoice] = useState(""),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const companies = useAttendanceRead(canRead ? "payroll-run-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? ""),
    query = { company_id: company, month: month + "-01", limit: 25, offset },
    state = useAttendanceRead(company && canRead ? JSON.stringify([query, revision]) : null, () =>
      client.payrollRunWorkspace(query),
    ),
    data = state.data;
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  function begin(action: HrPayrollRunAction["action"]) {
    if (!data) return;
    setError("");
    setNotice("");
    setDraft({
      action,
      snapshot: data,
      reason: "",
      confirm_override: false,
      currency_code: "",
      rounding_mode: "half_up",
      account: "",
      policy: data.policies[0]?.id ?? "",
    });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!draft || guard.current) return;
    if (
      ["approve", "return"].includes(draft.action) &&
      draft.snapshot.review_access === "override_required" &&
      !draft.confirm_override
    ) {
      setError(
        "An explicit audited administrator override is required for this self-decision. Choose the override or ask an independent reviewer.",
      );
      return;
    }
    const current = draft.snapshot,
      currency = current.currencies.find((c) => c.id === draft.currency_code),
      parsed = hrPayrollRunActionSchema.safeParse({
        company_id: current.company_id,
        month: current.month,
        action: draft.action,
        reason: draft.reason,
        expected_version: current.period?.version ?? 0,
        source_hash: current.source_hash,
        confirm_override: draft.confirm_override,
        ...(draft.action === "policy"
          ? {
              currency_code: draft.currency_code,
              money_scale: currency?.scale,
              net_payable_account_id: draft.account,
              rounding_mode: draft.rounding_mode,
            }
          : {}),
        ...(draft.action === "open" ? { policy_id: draft.policy } : {}),
      });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    guard.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await client.actOnPayrollRun(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setDraft(null);
      setNotice(actionTitle[draft.action] + " saved · " + result.status + " · version " + result.version);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Payroll action could not be saved.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  const set = (update: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...update } : d));
  if (loading) return <section className={panel}>Loading Payroll session…</section>;
  if (!canRead) return <section className={panel}>Payroll period read permission is required.</section>;
  const mode = review ? "payroll-validation" : "payroll-runs";
  return (
    <div
      aria-label="Payroll execution workspace"
      className="grid min-w-0 gap-5 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_input]:font-normal! [&_select]:font-normal! [&_textarea]:font-normal!"
    >
      <nav aria-label="Payroll navigation" className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        {Object.entries(payrollPages).map(([id, [, title, group]]) => (
          <Button
            key={id}
            variant="outline"
            className={
              "h-auto min-h-11 min-w-0 justify-start whitespace-normal px-3 py-2 text-left text-xs " +
              (id === mode ? "border-primary bg-primary/10 text-primary!" : "")
            }
            disabled={busy || !!draft || !permissions.includes("hr.payroll." + group + ".read")}
            onClick={() => onNavigate("hr", id)}
          >
            <Wallet className="h-3.5 w-3.5 shrink-0" />
            {title}
          </Button>
        ))}
      </nav>
      <section className={panel}>
        <div className="grid min-w-0 items-end gap-4 md:grid-cols-[1.5fr_1fr_auto]">
          <Field title="Company">
            <select
              className={selectClass}
              value={company}
              disabled={!!draft || busy}
              onChange={(e) => {
                setChoice(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Select company</option>
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </Field>
          <Field title="Payroll month">
            <Input
              className="box-border! w-full min-w-0! max-w-full!"
              type="month"
              value={month}
              disabled={!!draft || busy}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setOffset(0);
                }
              }}
            />
          </Field>
          <Button variant="outline" disabled={state.loading || busy} onClick={() => setRevision((v) => v + 1)}>
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </section>
      {(error || state.error || companies.error) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || state.error || companies.error}
        </div>
      )}
      {notice && (
        <div
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </div>
      )}
      <section className={panel + " flex flex-wrap items-start justify-between gap-4"}>
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Calculator className="h-5 w-5 text-primary" />
              {review ? "Payroll review" : "Payroll run"}
            </h2>
            {data?.period && <State value={data.period.state} />}
          </div>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Salary calculations use frozen attendance and approved compensation snapshots. Recalculation saves a new
            immutable run. Final approval requires all pay and statutory evidence to reconcile.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {data?.allowed_actions.includes("policy") && !review && (
            <Button variant="outline" disabled={!!draft || busy} onClick={() => begin("policy")}>
              Payroll policy
            </Button>
          )}
          {!review && data?.allowed_actions.includes("open") && (
            <Button className="text-primary-foreground!" disabled={!!draft || busy} onClick={() => begin("open")}>
              Open period
            </Button>
          )}
          {!review && data?.allowed_actions.includes("calculate") && (
            <Button className="text-primary-foreground!" disabled={!!draft || busy} onClick={() => begin("calculate")}>
              {data.period?.run_number ? "Recalculate" : "Calculate salary results"}
            </Button>
          )}
          {!review && data?.allowed_actions.includes("submit") && (
            <Button className="text-primary-foreground!" disabled={!!draft || busy} onClick={() => begin("submit")}>
              Submit for review
            </Button>
          )}
          {review && data?.allowed_actions.includes("return") && (
            <Button variant="outline" disabled={!!draft || busy} onClick={() => begin("return")}>
              Return for corrections
            </Button>
          )}
          {review && data?.period?.state === "under_review" && (
            <Button
              className="text-primary-foreground!"
              disabled={!!draft || busy || !data.allowed_actions.includes("approve")}
              onClick={() => begin("approve")}
            >
              Approve payroll
            </Button>
          )}
        </div>
      </section>
      {data?.period?.state === "open" && data.period.run_number > 0 && (
        <section className={panel} role="status">
          <h3 className="text-sm font-semibold">Returned for correction · recalculation required</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The earlier result is retained for comparison. Update and independently approve the required salary or
            one-off inputs, then calculate a new run before submitting it for review. Frozen attendance and finalized
            Payroll remain protected.
          </p>
        </section>
      )}
      {review && data?.review_access === "forbidden" && (
        <section className={panel} role="status">
          <h3 className="text-sm font-semibold">Independent Payroll reviewer required</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The maker, calculator, submitter and employees included in this run cannot decide their own Payroll without
            an authorized audited override. An independent reviewer with company approval authority must approve or
            return this run.
          </p>
        </section>
      )}
      {data?.supplemental_totals && (
        <section aria-label="Payroll including posted supplements" className={panel + " space-y-2"}>
          <h3 className="font-semibold">Including posted settlement supplements</h3>
          <p className="text-sm">
            Net {data.supplemental_totals.net} · Gross {data.supplemental_totals.gross} · Deductions{" "}
            {data.supplemental_totals.deductions}
          </p>
          <p className="text-xs text-muted-foreground">
            The original run, result fingerprints and published payslips remain intact. Approved correction entries and
            tax carry-forwards are recorded separately in Final Settlements; payment reconciliation remains separate.
          </p>
        </section>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Metric
          title="Run"
          value={data?.period?.run_number ?? "—"}
          hint={data?.period ? "Version " + data.period.version : "No Payroll period opened"}
        />
        <Metric
          title="Published attendance inputs"
          value={data?.attendance?.input_count ?? 0}
          hint={data?.attendance?.state === "locked" ? "Locked source evidence" : "Attendance close required"}
        />
        <Metric title="Employee results" value={data?.total ?? 0} hint="Current immutable run" />
        <Metric
          title="Original run net"
          value={data?.totals?.net ?? "—"}
          hint={
            data?.totals
              ? data.totals.currency_code +
                (["approved", "posting_ready", "posted", "paid", "closed"].includes(data.period?.state ?? "")
                  ? " · approved original calculation"
                  : " · preliminary until final approval")
              : "Calculation not available"
          }
        />
        <Metric
          title="Employer contributions"
          value={data?.totals?.employer_contributions ?? "—"}
          hint={data?.totals ? data.totals.currency_code + " · additional company cost" : "Calculated statutory costs"}
        />
      </div>
      <p className="text-sm text-muted-foreground">
        Overtime uses its released monetary policy and approved employee arrangement. Approved one-off earnings and
        deductions use this period’s salary currency and rounding policy. Their original amounts and approvals stay
        attached to each saved calculation. Inputs are consumed only with final approval.
      </p>
      {!!data?.blocked.length && (
        <section className={panel + " border-[var(--nx-warning-border)]"} aria-label="Payroll approval gates">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--nx-warning)]">
            <LockKeyhole className="h-4 w-4" />
            Required before final approval
          </h3>
          <ul className="mt-3 grid list-disc gap-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            {data.blocked.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="outline" disabled={!!draft || busy} onClick={() => onNavigate("hr", "attendance-period")}>
              Attendance close
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" disabled={!!draft || busy} onClick={() => onNavigate("hr", "payroll-setup")}>
              Statutory setup
              <ArrowRight className="h-4 w-4" />
            </Button>
            <Button variant="outline" disabled={!!draft || busy} onClick={() => onNavigate("hr", "salary-revisions")}>
              Salary authorities
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </section>
      )}
      {draft && (
        <section className={panel + " border-primary/30"} aria-label="Payroll action form">
          <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{actionTitle[draft.action]}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Reviewed period version {draft.snapshot.period?.version ?? 0} · {draft.snapshot.month.slice(0, 7)}
              </p>
            </div>
            <Button variant="outline" disabled={busy} onClick={() => setDraft(null)}>
              Close action
            </Button>
          </header>
          <form onSubmit={save} className="grid gap-4">
            <fieldset disabled={busy} className="m-0! grid min-w-0 gap-4 border-0! p-0! md:grid-cols-2">
              {draft.action === "policy" && (
                <>
                  <Field title="Payroll currency">
                    <select
                      required
                      className={selectClass}
                      value={draft.currency_code}
                      onChange={(e) => set({ currency_code: e.target.value })}
                    >
                      <option value="">Choose active Finance currency</option>
                      {draft.snapshot.currencies.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.label} · {c.scale} decimals
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title="Net payable liability account">
                    <select
                      required
                      className={selectClass}
                      value={draft.account}
                      onChange={(e) => set({ account: e.target.value })}
                    >
                      <option value="">Choose company liability account</option>
                      {draft.snapshot.accounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field title="Rounding method">
                    <select
                      className={selectClass}
                      value={draft.rounding_mode}
                      onChange={(e) => set({ rounding_mode: e.target.value as Draft["rounding_mode"] })}
                    >
                      <option value="half_up">Half up</option>
                      <option value="half_even">Half even</option>
                      <option value="down">Toward zero</option>
                      <option value="up">Away from zero</option>
                    </select>
                  </Field>
                  <p className="self-end text-sm leading-relaxed text-muted-foreground">
                    The policy uses Finance currency precision. Salary amounts are rounded per component within each
                    effective salary segment.
                  </p>
                </>
              )}
              {draft.action === "open" && (
                <Field title="Payroll policy">
                  <select
                    required
                    className={selectClass}
                    value={draft.policy}
                    onChange={(e) => set({ policy: e.target.value })}
                  >
                    <option value="">Choose governed policy</option>
                    {draft.snapshot.policies.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.currency_code} · {p.money_scale} decimals · {p.rounding_mode.replaceAll("_", " ")}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {["return", "approve"].includes(draft.action) &&
                draft.snapshot.review_access === "override_required" &&
                permissions.includes("platform.approval.override") && (
                  <Field title="Administrator override">
                    <select
                      className={selectClass}
                      value={String(draft.confirm_override)}
                      onChange={(e) => set({ confirm_override: e.target.value === "true" })}
                    >
                      <option value="false">Use independent Payroll review</option>
                      <option value="true">Explicitly authorize audited self-decision override</option>
                    </select>
                  </Field>
                )}
            </fieldset>
            <Field title="Payroll action reason">
              <Textarea
                required
                minLength={5}
                maxLength={500}
                value={draft.reason}
                disabled={busy}
                onChange={(e) => set({ reason: e.target.value })}
              />
            </Field>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Reviewed source fingerprint</summary>
              <p className="mt-2 break-all font-mono">{draft.snapshot.source_hash}</p>
            </details>
            <p className="text-xs leading-relaxed text-muted-foreground">
              {draft.action === "calculate"
                ? "This saves salary, overtime and available published statutory calculations. Unresolved statutory context is retained as a warning and prevents final approval."
                : draft.action === "policy"
                  ? "The policy is immutable after creation. This action does not calculate or post money."
                  : draft.action === "return"
                    ? "Returning reopens this unapproved period for input corrections. Previous results remain immutable. A new calculation is required before resubmission."
                    : "Refresh preserves this form and its reviewed fingerprint. If the source changes, close the action and review it again."}
            </p>
            <Button type="submit" className="justify-self-start text-primary-foreground!" disabled={busy}>
              {busy ? "Saving…" : "Confirm " + actionTitle[draft.action].toLowerCase()}
            </Button>
          </form>
        </section>
      )}
      {data?.period && data.period.run_number > 0 && permissions.includes("hr.payroll.result.read") && (
        <HrPayrollRunComparison
          key={company + month}
          client={client}
          data={data}
          revision={revision}
          disabled={busy || !!draft}
          onRefresh={() => setRevision((v) => v + 1)}
        />
      )}
      {state.loading ? (
        <section className={panel} role="status">
          Loading Payroll results…
        </section>
      ) : !data?.employees.length ? (
        <section className={panel + " py-9 text-center"}>
          <ShieldCheck className="mx-auto mb-3 h-7 w-7 text-muted-foreground" />
          <h3 className="font-semibold">No employee results to show</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.total
              ? "Result read permission is required to inspect wage amounts."
              : "Open the period and calculate the published salary inputs."}
          </p>
        </section>
      ) : (
        <div className="grid min-w-0 gap-3 lg:grid-cols-2">
          {data.employees.map((employee) => (
            <details className={panel} key={employee.id}>
              <summary className="cursor-pointer text-sm">
                <strong>{employee.display_name}</strong>
                <span className="mt-1 block text-xs text-muted-foreground">
                  {employee.employee_number} · {employee.currency_code}
                </span>
                <span className="mt-3 block font-mono tabular-nums">Net {employee.net}</span>
              </summary>
              {employee.supplemental && (
                <p className="mt-3 rounded-md border border-border bg-muted p-3 text-sm">
                  After posted settlement supplements: net {employee.supplemental.net}, gross{" "}
                  {employee.supplemental.gross}, deductions {employee.supplemental.deductions}. Original values below
                  are retained for audit.
                </p>
              )}
              <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-muted-foreground">Gross</dt>
                  <dd className="mt-1 break-all font-mono tabular-nums">{employee.gross}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Deductions</dt>
                  <dd className="mt-1 break-all font-mono tabular-nums">{employee.deductions}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Employer contributions</dt>
                  <dd className="mt-1 break-all font-mono tabular-nums">{employee.employer_contributions}</dd>
                </div>
              </dl>
              <section
                className="mt-4 min-w-0 rounded-lg border border-border bg-muted/30 p-3"
                aria-label="Statutory calculation evidence"
              >
                <h4 className="text-sm font-semibold">
                  {employee.statutory?.state === "sealed"
                    ? employee.statutory.environment === "test"
                      ? "Synthetic test evidence · isolated testing only"
                      : "Statutory evidence sealed"
                    : "Statutory calculation requires review"}
                </h4>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  {employee.statutory?.state === "sealed"
                    ? employee.statutory.rule_count +
                      " verified rule(s) · " +
                      employee.statutory.pack_count +
                      " published pack(s). Employer contributions remain separate from employee net pay."
                    : "These wages remain preliminary until the required published rules and company context can be verified. Review the warnings below."}
                </p>
                {!!employee.statutory?.jurisdiction_overrides?.length && (
                  <div className="mt-3 grid min-w-0 gap-2 text-xs" aria-label="Applied employee jurisdiction overrides">
                    <h4 className="font-semibold">Applied employee jurisdiction overrides</h4>
                    <p className="leading-relaxed text-muted-foreground">
                      Frozen approvals select rules only for their stated category. Other categories retain their own
                      jurisdiction authority.
                    </p>
                    {employee.statutory.jurisdiction_overrides.map((o) => (
                      <dl className="grid min-w-0 gap-1 rounded-md border border-border p-2 sm:grid-cols-2" key={o.id}>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Rule category</dt>
                          <dd className="break-words">{o.rule_scope}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Jurisdiction</dt>
                          <dd className="break-all">{o.jurisdiction_id}</dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Effective range</dt>
                          <dd>
                            {o.effective_from} – {o.effective_to ?? "Open ended"}
                          </dd>
                        </div>
                        <div className="min-w-0">
                          <dt className="text-muted-foreground">Approval reference</dt>
                          <dd className="break-all font-mono">{o.id}</dd>
                        </div>
                      </dl>
                    ))}
                  </div>
                )}
                {!!employee.statutory?.contexts?.length && (
                  <div className="mt-3 grid min-w-0 gap-2 text-xs" aria-label="Dated statutory contexts">
                    <h4 className="font-semibold">Reviewed statutory context periods</h4>
                    <p className="leading-relaxed text-muted-foreground">
                      Unchanged monthly rules are applied once. Changed rules or inputs use their published context
                      policy; each period retains its source evidence.
                    </p>
                    {employee.statutory.contexts.map((c) => (
                      <details key={c.effective_from} className="min-w-0 rounded-md border border-border p-2">
                        <summary className="cursor-pointer">
                          {c.effective_from} – {c.effective_to} · {c.calendar_days} earned calendar day(s)
                        </summary>
                        <dl className="mt-2 grid min-w-0 gap-1 text-muted-foreground">
                          <dt>Context input fingerprint</dt>
                          <dd className="break-all font-mono">{c.input_hash}</dd>
                          <dt>Resolved rule set</dt>
                          <dd className="break-all font-mono">{c.resolved_set_hash}</dd>
                        </dl>
                      </details>
                    ))}
                  </div>
                )}
                {employee.statutory?.state === "sealed" && (
                  <details className="mt-3 min-w-0 text-xs">
                    <summary className="cursor-pointer">Retained statutory fingerprints</summary>
                    <dl className="mt-2 grid min-w-0 gap-2">
                      <div>
                        <dt className="text-muted-foreground">Snapshot</dt>
                        <dd className="break-all font-mono">{employee.statutory.snapshot_id}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Input / resolved rule set</dt>
                        <dd className="break-all font-mono">
                          {employee.statutory.input_hash}
                          <br />
                          {employee.statutory.resolved_set_hash}
                        </dd>
                      </div>
                    </dl>
                  </details>
                )}
              </section>
              <div className="mt-4 grid gap-2">
                {employee.lines.map((line, i) => (
                  <div
                    key={i}
                    className="flex min-w-0 flex-wrap justify-between gap-2 rounded-lg border border-border p-3 text-sm"
                  >
                    <span className="min-w-0 break-words">
                      {line.component_name}
                      <small className="mt-1 block text-muted-foreground">{line.kind.replaceAll("_", " ")}</small>
                    </span>
                    <span className="font-mono tabular-nums">{line.amount}</span>
                    {line.overtime && (
                      <details
                        className="w-full min-w-0 border-t border-border pt-3 text-xs"
                        aria-label="Overtime calculation evidence"
                      >
                        <summary className="cursor-pointer font-medium">
                          Overtime · {line.overtime.work_date} · {line.overtime.approved_minutes} approved minutes
                        </summary>
                        <dl className="mt-3 grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                          <div>
                            <dt className="text-muted-foreground">Contractual basis</dt>
                            <dd className="mt-1 break-all font-mono">
                              {line.overtime.basis_amount} {employee.currency_code}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Conversion</dt>
                            <dd className="mt-1">
                              {line.overtime.conversion_method.replaceAll("_", " ")}
                              {line.overtime.ordinary_hours
                                ? " / " + line.overtime.ordinary_hours + " ordinary hours"
                                : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Hourly rate / multiplier</dt>
                            <dd className="mt-1 break-all font-mono">
                              {line.overtime.hourly_rate} × {line.overtime.multiplier}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted-foreground">Rounding</dt>
                            <dd className="mt-1">
                              {line.overtime.rounding_stage.replaceAll("_", " ")} ·{" "}
                              {line.overtime.rounding_mode.replaceAll("_", " ")}
                            </dd>
                          </div>
                          <div className="sm:col-span-2">
                            <dt className="text-muted-foreground">Released policy / approved arrangement</dt>
                            <dd className="mt-1 break-all font-mono">
                              {line.overtime.policy_version_id}
                              <br />
                              {line.overtime.arrangement_id}
                            </dd>
                          </div>
                        </dl>
                      </details>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-4 break-all font-mono text-[11px] text-muted-foreground">
                Calculation: {employee.calculation_hash}
              </p>
              {employee.warnings.map((warning, i) => (
                <p key={i} className="mt-2 text-sm text-[var(--nx-warning)]">
                  {warning}
                </p>
              ))}
            </details>
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
              disabled={offset === 0 || state.loading || busy || !!draft}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= data.total || state.loading || busy || !!draft}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
      {!!data?.history.length && (
        <details className={panel}>
          <summary className="cursor-pointer text-sm font-semibold">Run history ({data.history.length})</summary>
          <ol className="mt-4 grid gap-3">
            {data.history.map((item, i) => (
              <li key={i} className="border-l-2 border-primary/30 pl-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2">
                  <strong>{item.action.replaceAll("_", " ")}</strong>
                  <span className="text-xs text-muted-foreground">{new Date(item.occurred_at).toLocaleString()}</span>
                </div>
                <p className="mt-1 break-words text-muted-foreground">{item.reason}</p>
                <p className="mt-1 break-all text-xs text-muted-foreground">
                  {item.actor_id}
                  {item.override ? " · Audited administrator override" : ""}
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
