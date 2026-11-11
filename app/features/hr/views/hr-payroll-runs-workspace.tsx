"use client";
import { useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LockKeyhole, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { hrPayrollRunActionSchema, type HrPayrollRunWorkspace, type HrPayrollRunAction } from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrDetailGroup, HrDetailSummary, HrDetailTile } from "../components/hr-detail-tile";
import { Field, State, panel, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
import { HrPayrollRunComparison } from "../components/hr-payroll-run-comparison";

const actionTitle = {
  policy: "Create payroll policy",
  policy_update: "Edit payroll policy",
  policy_delete: "Delete payroll policy",
  open: "Open payroll period",
  calculate: "Calculate salary results",
  submit: "Submit for review",
  return: "Return for corrections",
  approve: "Approve payroll",
};
const roundingLabels: Record<string, string> = {
  half_up: "Half up",
  half_even: "Half even",
  down: "Toward zero",
  up: "Away from zero",
};
type Policy = HrPayrollRunWorkspace["policies"][number];
type Employee = HrPayrollRunWorkspace["employees"][number];
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
const tableClass = "w-full border-collapse text-left text-sm";
const headClass = "border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const th = "whitespace-nowrap px-4 py-3";
const td = "px-4 py-3";
const tableWrap = "relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm";

export function HrPayrollRunsWorkspace({
  review = false,
}: {
  review?: boolean;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.payroll.period.read");
  const [month, setMonth] = useState(localDate().slice(0, 7)),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [draft, setDraft] = useState<Draft | null>(null),
    [policyId, setPolicyId] = useState(""),
    [employeeId, setEmployeeId] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  const companies = useAttendanceRead(canRead ? "payroll-run-companies" : null, () => client.companies()),
    company = companies.data?.items[0]?.id ?? "",
    query = { company_id: company, month: month + "-01", limit: 25, offset },
    state = useAttendanceRead(company && canRead ? JSON.stringify([query, revision]) : null, () =>
      client.payrollRunWorkspace(query),
    ),
    data = state.data;
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const canManagePolicy = !review && !!data?.allowed_actions.includes("policy");
  const term = search.trim().toLowerCase();
  const policies = (data?.policies ?? []).filter(
    (p) =>
      !term ||
      [p.currency_code, roundingLabels[p.rounding_mode] ?? p.rounding_mode, accountLabel(data, p.net_payable_account_id)]
        .join(" ")
        .toLowerCase()
        .includes(term),
  );
  const employees = (data?.employees ?? []).filter(
    (e) => !term || (e.display_name + " " + e.employee_number).toLowerCase().includes(term),
  );
  const selectedPolicy = data?.policies.find((p) => p.id === policyId) ?? null;
  const selectedEmployee = data?.employees.find((e) => e.id === employeeId) ?? null;

  function begin(action: HrPayrollRunAction["action"], policy?: Policy) {
    if (!data) return;
    setError("");
    setNotice("");
    setDraft({
      action,
      snapshot: data,
      reason: "",
      confirm_override: false,
      currency_code: policy?.currency_code ?? "",
      rounding_mode: (policy?.rounding_mode as Draft["rounding_mode"]) ?? "half_up",
      account: policy?.net_payable_account_id ?? "",
      policy: policy?.id ?? data.policies[0]?.id ?? "",
    });
  }
  async function run(current: Draft): Promise<boolean> {
    if (guard.current) return false;
    if (
      ["approve", "return"].includes(current.action) &&
      current.snapshot.review_access === "override_required" &&
      !current.confirm_override
    ) {
      setError(
        "An explicit audited administrator override is required for this self-decision. Choose the override or ask an independent reviewer.",
      );
      return false;
    }
    const snap = current.snapshot,
      currency = snap.currencies.find((c) => c.id === current.currency_code),
      withTerms = current.action === "policy" || current.action === "policy_update",
      parsed = hrPayrollRunActionSchema.safeParse({
        company_id: snap.company_id,
        month: snap.month,
        action: current.action,
        reason: current.reason,
        expected_version: snap.period?.version ?? 0,
        source_hash: snap.source_hash,
        confirm_override: current.confirm_override,
        ...(withTerms
          ? {
              currency_code: current.currency_code,
              money_scale: currency?.scale,
              net_payable_account_id: current.account,
              rounding_mode: current.rounding_mode,
            }
          : {}),
        ...(current.action === "open" || current.action === "policy_update" || current.action === "policy_delete"
          ? { policy_id: current.policy }
          : {}),
      });
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return false;
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
      if (current.action === "policy_delete") setPolicyId("");
      setNotice(
        actionTitle[current.action] + " saved" + (current.action === "policy_delete" ? "" : " · " + result.status),
      );
      setRevision((v) => v + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Payroll action could not be saved.");
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (draft) await run(draft);
  }
  const set = (update: Partial<Draft>) => setDraft((d) => (d ? { ...d, ...update } : d));
  if (loading) return <section className={panel}>Loading Payroll session…</section>;
  if (!canRead) return <section className={panel}>Payroll period read permission is required.</section>;
  const locked = !!draft || busy;
  return (
    <div
      aria-label={review ? "Payroll review workspace" : "Payroll execution workspace"}
      className="grid min-w-0 gap-4 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_input]:font-normal! [&_select]:font-normal! [&_textarea]:font-normal!"
    >
      <section className={panel}>
        <div className="grid min-w-0 items-end gap-4 md:grid-cols-[minmax(9.5rem,11rem)_minmax(0,1fr)_auto]">
          <Field title="Payroll month">
            <Input
              className="box-border! w-full min-w-0! max-w-full!"
              type="month"
              value={month}
              disabled={locked}
              onChange={(e) => {
                if (e.target.value) {
                  setMonth(e.target.value);
                  setOffset(0);
                }
              }}
            />
          </Field>
          <Field title="Search records">
            <Input
              value={search}
              maxLength={120}
              placeholder={review ? "Employee name or number" : "Policy, employee name or number"}
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          {canManagePolicy && (
            <Button className="w-full text-primary-foreground! md:w-auto" disabled={locked} onClick={() => begin("policy")}>
              <Plus className="h-4 w-4" />
              Payroll policy
            </Button>
          )}
        </div>
      </section>
      {companies.data && !companies.data.items.length && (
        <div className={panel}>No authorized company is available.</div>
      )}
      {!draft && !policyId && !employeeId && (error || state.error || companies.error) && (
        <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {error || state.error || companies.error}
        </div>
      )}
      {notice && !draft && (
        <div
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {data?.period ? (
            <>
              <State value={data.period.state} />
              <span>
                Run {data.period.run_number || "—"}
                {data.totals ? ` · Net ${data.totals.net} ${data.totals.currency_code}` : ""}
                {data.totals ? ` · Employer contributions ${data.totals.employer_contributions}` : ""}
              </span>
            </>
          ) : (
            <span>No payroll period opened for this month</span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!review && data?.allowed_actions.includes("open") && (
            <Button variant="outline" disabled={locked} onClick={() => begin("open")}>
              Open period
            </Button>
          )}
          {!review && data?.allowed_actions.includes("calculate") && (
            <Button variant="outline" disabled={locked} onClick={() => begin("calculate")}>
              {data.period?.run_number ? "Recalculate" : "Calculate salary results"}
            </Button>
          )}
          {!review && data?.allowed_actions.includes("submit") && (
            <Button variant="outline" disabled={locked} onClick={() => begin("submit")}>
              Submit for review
            </Button>
          )}
          {review && data?.allowed_actions.includes("return") && (
            <Button variant="outline" disabled={locked} onClick={() => begin("return")}>
              Return for corrections
            </Button>
          )}
          {review && data?.period?.state === "under_review" && (
            <Button
              className="text-primary-foreground!"
              disabled={locked || !data.allowed_actions.includes("approve")}
              onClick={() => begin("approve")}
            >
              Approve payroll
            </Button>
          )}
        </div>
      </div>
      {data?.period?.state === "open" && data.period.run_number > 0 && (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
          Returned for correction · recalculation required
        </p>
      )}
      {review && data?.review_access === "forbidden" && (
        <p role="status" className="rounded-lg border border-border bg-muted/40 p-3 text-sm font-semibold">
          Independent Payroll reviewer required
        </p>
      )}
      {!!data?.blocked.length && (
        <section
          className="rounded-lg border border-[var(--nx-warning-border)] bg-card p-3"
          aria-label="Payroll approval gates"
        >
          <h3 className="flex items-center gap-2 text-sm font-semibold text-[var(--nx-warning)]">
            <LockKeyhole className="h-4 w-4" />
            Required before final approval
          </h3>
          <ul className="mt-2 grid list-disc gap-1 pl-5 text-sm text-muted-foreground">
            {data.blocked.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </section>
      )}
      {!review && (
        <section aria-label="Payroll policies" className="grid gap-2">
          <h3 className="text-sm font-semibold">Payroll policies</h3>
          <div className={tableWrap}>
            <table className={tableClass}>
              <thead className={headClass}>
                <tr>
                  <th className={th}>Payroll currency</th>
                  <th className={th}>Precision</th>
                  <th className={th}>Rounding</th>
                  <th className={th}>Net payable liability account</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((p) => (
                  <HrClickableRow
                    key={p.id}
                    disabled={locked}
                    onOpen={() => {
                      setError("");
                      setPolicyId(p.id);
                    }}
                  >
                    <td className={td + " font-medium"}>{currencyLabel(data, p.currency_code)}</td>
                    <td className={td + " text-muted-foreground"}>{p.money_scale} decimals</td>
                    <td className={td + " text-muted-foreground"}>{roundingLabels[p.rounding_mode] ?? p.rounding_mode}</td>
                    <td className={td + " text-muted-foreground"}>{accountLabel(data, p.net_payable_account_id)}</td>
                    <td className={td}>
                      <State value={p.in_use ? "in_use" : "active"} />
                    </td>
                  </HrClickableRow>
                ))}
                {!policies.length && (
                  <tr>
                    <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                      {state.loading ? "Loading payroll policies…" : "No payroll policies match this company and search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
      {data?.period && data.period.run_number > 0 && permissions.includes("hr.payroll.result.read") && (
        <HrPayrollRunComparison key={company + month} client={client} data={data} revision={revision} disabled={locked} />
      )}
      <section aria-label="Employee results" className="grid gap-2">
        <h3 className="text-sm font-semibold">Employee results</h3>
        <div className={tableWrap}>
          <table className={tableClass}>
            <thead className={headClass}>
              <tr>
                <th className={th}>Employee</th>
                <th className={th}>Employee no.</th>
                <th className={th + " text-right"}>Gross</th>
                <th className={th + " text-right"}>Deductions</th>
                <th className={th + " text-right"}>Net</th>
                <th className={th + " text-right"}>Employer contributions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <HrClickableRow key={employee.id} disabled={locked} onOpen={() => setEmployeeId(employee.id)}>
                  <td className={td + " font-medium"}>{employee.display_name}</td>
                  <td className={td + " font-mono text-xs text-muted-foreground"}>{employee.employee_number}</td>
                  <td className={td + " text-right font-mono tabular-nums"}>{employee.gross}</td>
                  <td className={td + " text-right font-mono tabular-nums"}>{employee.deductions}</td>
                  <td className={td + " text-right font-mono tabular-nums"}>
                    {employee.net} {employee.currency_code}
                  </td>
                  <td className={td + " text-right font-mono tabular-nums"}>{employee.employer_contributions}</td>
                </HrClickableRow>
              ))}
              {!employees.length && (
                <tr>
                  <td className="px-4 py-6 text-center text-muted-foreground" colSpan={6}>
                    {state.loading
                      ? "Loading Payroll results…"
                      : data?.total && !data.employees.length
                        ? "Result read permission is required to inspect wage amounts."
                        : term && data?.employees.length
                          ? "No employee results match this search."
                          : "Open the period and calculate the published salary inputs."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      {data && data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={offset === 0 || state.loading || locked}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              <ChevronLeft className="h-4 w-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= data.total || state.loading || locked}
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

      {/* Policy details: Edit and Delete sit at the bottom; a policy used by a period stays read-only. */}
      {selectedPolicy && data && !draft ? (
        <HrRecordDrawer
          title={`${selectedPolicy.currency_code} payroll policy`}
          description="Payroll policy details"
          open
          busy={busy}
          error={error}
          onClose={() => setPolicyId("")}
          footer={
            canManagePolicy && !selectedPolicy.in_use ? (
              <>
                <HrConfirmDeleteButton
                  label={`Delete the ${selectedPolicy.currency_code} payroll policy`}
                  title={`Delete the ${selectedPolicy.currency_code} payroll policy?`}
                  description="The policy is removed. Payroll periods that are already open keep their own policy."
                  variant="outline"
                  disabled={busy}
                  onConfirm={() =>
                    run({
                      action: "policy_delete",
                      snapshot: data,
                      reason: "",
                      confirm_override: false,
                      currency_code: "",
                      rounding_mode: "half_up",
                      account: "",
                      policy: selectedPolicy.id,
                    })
                  }
                />
                <HrEditButton
                  label={`Edit the ${selectedPolicy.currency_code} payroll policy`}
                  disabled={busy}
                  onClick={() => begin("policy_update", selectedPolicy)}
                />
              </>
            ) : undefined
          }
        >
          <div className="grid gap-4">
            <HrDetailSummary code={selectedPolicy.currency_code} status={selectedPolicy.in_use ? "in_use" : "active"}>
              {selectedPolicy.in_use ? "Used by a payroll period" : null}
            </HrDetailSummary>
            <HrDetailGroup title="Policy">
              <HrDetailTile label="Payroll currency" value={currencyLabel(data, selectedPolicy.currency_code)} />
              <HrDetailTile label="Precision" value={`${selectedPolicy.money_scale} decimals`} />
              <HrDetailTile
                label="Rounding method"
                value={roundingLabels[selectedPolicy.rounding_mode] ?? selectedPolicy.rounding_mode}
              />
              <HrDetailTile
                label="Net payable liability account"
                value={accountLabel(data, selectedPolicy.net_payable_account_id)}
              />
            </HrDetailGroup>
          </div>
        </HrRecordDrawer>
      ) : null}

      {selectedEmployee && !draft ? (
        <HrRecordDrawer
          title={selectedEmployee.display_name}
          description="Employee payroll result"
          open
          onClose={() => setEmployeeId("")}
        >
          <EmployeeResult employee={selectedEmployee} />
        </HrRecordDrawer>
      ) : null}

      {draft ? (
        <HrRecordDrawer
          title={actionTitle[draft.action]}
          description={`Reviewed period version ${draft.snapshot.period?.version ?? 0} · ${draft.snapshot.month.slice(0, 7)}`}
          open
          busy={busy}
          error={error}
          onClose={() => setDraft(null)}
          footer={
            <Button type="submit" form="payroll-run-action" className="text-primary-foreground!" disabled={busy}>
              {busy
                ? "Saving…"
                : draft.action === "policy"
                  ? "Create payroll policy"
                  : draft.action === "policy_update"
                    ? "Save payroll policy"
                    : "Confirm " + actionTitle[draft.action].toLowerCase()}
            </Button>
          }
        >
          <form id="payroll-run-action" onSubmit={save} className="grid gap-4">
            <fieldset disabled={busy} className="m-0! grid min-w-0 gap-4 border-0! p-0!">
              {(draft.action === "policy" || draft.action === "policy_update") && (
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
                      {Object.entries(roundingLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </Field>
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
                        {p.currency_code} · {p.money_scale} decimals · {roundingLabels[p.rounding_mode] ?? p.rounding_mode}
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
            <Field title="Reason">
              <Textarea
                maxLength={500}
                value={draft.reason}
                disabled={busy}
                onChange={(e) => set({ reason: e.target.value })}
              />
            </Field>
          </form>
        </HrRecordDrawer>
      ) : null}
    </div>
  );
}

function currencyLabel(data: HrPayrollRunWorkspace | null | undefined, code: string) {
  return data?.currencies.find((c) => c.id === code)?.label ?? code;
}
function accountLabel(data: HrPayrollRunWorkspace | null | undefined, id: string) {
  return data?.accounts.find((a) => a.id === id)?.label ?? id;
}

/** Full calculation evidence for one employee, shown in the drawer. */
function EmployeeResult({ employee }: { employee: Employee }) {
  return (
    <div className="grid gap-4">
      <HrDetailSummary code={employee.employee_number} status={employee.statutory?.state ?? "calculated"}>
        {employee.currency_code}
      </HrDetailSummary>
      <HrDetailGroup title="Amounts">
        <HrDetailTile label="Gross" value={employee.gross} />
        <HrDetailTile label="Deductions" value={employee.deductions} />
        <HrDetailTile label="Net" value={employee.net} />
        <HrDetailTile label="Employer contributions" value={employee.employer_contributions} />
      </HrDetailGroup>
      {employee.supplemental && (
        <p className="rounded-md border border-border bg-muted p-3 text-sm">
          After posted settlement supplements: net {employee.supplemental.net}, gross {employee.supplemental.gross},
          deductions {employee.supplemental.deductions}. Original values are retained for audit.
        </p>
      )}
      <section className="min-w-0 rounded-lg border border-border bg-muted/30 p-3" aria-label="Statutory calculation evidence">
        <h4 className="text-sm font-semibold">
          {employee.statutory?.state === "sealed"
            ? employee.statutory.environment === "test"
              ? "Synthetic test evidence · isolated testing only"
              : "Statutory evidence sealed"
            : "Statutory calculation requires review"}
        </h4>
        {employee.statutory?.state === "sealed" && (
          <p className="mt-1 text-xs text-muted-foreground">
            {employee.statutory.rule_count} verified rule(s) · {employee.statutory.pack_count} published pack(s)
          </p>
        )}
        {!!employee.statutory?.jurisdiction_overrides?.length && (
          <div className="mt-3 grid min-w-0 gap-2 text-xs" aria-label="Applied employee jurisdiction overrides">
            <h4 className="font-semibold">Applied employee jurisdiction overrides</h4>
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
      <div className={tableWrap}>
        <table className={tableClass}>
          <thead className={headClass}>
            <tr>
              <th className={th}>Component</th>
              <th className={th}>Type</th>
              <th className={th + " text-right"}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {employee.lines.map((line, i) => (
              <tr key={i} className="border-b border-border/70 align-top last:border-0">
                <td className={td}>
                  {line.component_name}
                  {line.overtime && (
                    <details className="mt-1 text-xs" aria-label="Overtime calculation evidence">
                      <summary className="cursor-pointer text-muted-foreground">
                        Overtime · {line.overtime.work_date} · {line.overtime.approved_minutes} approved minutes
                      </summary>
                      <dl className="mt-2 grid min-w-0 gap-2 sm:grid-cols-2">
                        <div>
                          <dt className="text-muted-foreground">Contractual basis</dt>
                          <dd className="break-all font-mono">
                            {line.overtime.basis_amount} {employee.currency_code}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Conversion</dt>
                          <dd>
                            {line.overtime.conversion_method.replaceAll("_", " ")}
                            {line.overtime.ordinary_hours ? " / " + line.overtime.ordinary_hours + " ordinary hours" : ""}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Hourly rate / multiplier</dt>
                          <dd className="break-all font-mono">
                            {line.overtime.hourly_rate} × {line.overtime.multiplier}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Rounding</dt>
                          <dd>
                            {line.overtime.rounding_stage.replaceAll("_", " ")} ·{" "}
                            {line.overtime.rounding_mode.replaceAll("_", " ")}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-muted-foreground">Released policy / approved arrangement</dt>
                          <dd className="break-all font-mono">
                            {line.overtime.policy_version_id}
                            <br />
                            {line.overtime.arrangement_id}
                          </dd>
                        </div>
                      </dl>
                    </details>
                  )}
                </td>
                <td className={td + " text-muted-foreground"}>{line.kind.replaceAll("_", " ")}</td>
                <td className={td + " text-right font-mono tabular-nums"}>{line.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {employee.warnings.map((warning, i) => (
        <p key={i} className="text-sm text-[var(--nx-warning)]">
          {warning}
        </p>
      ))}
      <p className="break-all font-mono text-[11px] text-muted-foreground">Calculation: {employee.calculation_hash}</p>
    </div>
  );
}
