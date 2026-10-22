"use client";
import {
  useAttendanceRead,
  Field,
  State,
  Metric,
  History,
  selectClass,
  panel,
  dayValue,
} from "../components/hr-workspace-controls";
import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, LockKeyhole, ArrowRight, RefreshCw, CheckCircle2, FileCheck2, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { HrApiClient } from "../api/hr-client";
import {
  attendanceLabel as label,
  attendanceMinutes as minutes,
  AttendanceStatusBadge,
} from "../components/attendance-status";
import {
  createHrOvertimeRequestSchema,
  hrOvertimeRuleRequestSchema,
  hrOvertimeActionRequestSchema,
  hrAttendancePeriodActionRequestSchema,
  hrAttendancePeriodQuerySchema,
  type HrCompanyDirectory,
  type HrOvertimeContext,
  type HrOvertimeDirectory,
  type HrOvertimeDetail,
  type HrOvertimeActionRequest,
  type HrAttendancePeriodWorkspace,
  type HrAttendancePayrollInputs,
  type HrAttendanceCloseEmployee,
  type HrAttendanceCompletionResult,
} from "@nexora/contracts";
type Navigate = (module: string, page: string, record?: string) => void;
type Mode = "overtime" | "attendance-period" | "attendance-payroll-inputs";
const previousMonth = () => {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
};
function DailyTrace({
  item,
  onNavigate,
  company,
}: {
  item: HrAttendanceCloseEmployee;
  onNavigate: Navigate;
  company: string;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      <p className="break-all text-xs text-muted-foreground">Evidence hash: {item.source_hash}</p>
      {item.days.map((d) => (
        <div key={d.on_date} className="rounded-lg border border-border bg-background p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{d.on_date}</strong>
              <AttendanceStatusBadge status={d.status as Parameters<typeof AttendanceStatusBadge>[0]["status"]} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() =>
                onNavigate(
                  "hr",
                  "daily-attendance",
                  JSON.stringify({ company_id: company, on_date: d.on_date, search: item.employee_number }),
                )
              }
            >
              View attendance <ArrowRight className="size-3" />
            </Button>
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <div>
              <dt className="text-muted-foreground">Paid / unpaid</dt>
              <dd className="mt-1">
                {dayValue(d.paid_days)} / {dayValue(d.unpaid_days)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Worked</dt>
              <dd className="mt-1">{minutes(d.worked_minutes)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Leave / unpaid leave</dt>
              <dd className="mt-1">
                {dayValue(d.approved_leave_days)} / {dayValue(d.unpaid_leave_days)}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Approved overtime</dt>
              <dd className="mt-1">{minutes(d.overtime.reduce((n, o) => n + o.minutes, 0))}</dd>
            </div>
          </dl>
          {d.issues.length > 0 && (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-[var(--nx-warning)]">
              {d.issues.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          )}
          {(d.correction_ids.length > 0 || d.leave_ids.length > 0 || d.overtime.length > 0) && (
            <div className="mt-3 grid gap-1 break-all text-xs text-muted-foreground">
              {d.correction_ids.map((id) => (
                <span key={id}>Correction: {id}</span>
              ))}
              {d.leave_ids.map((id) => (
                <span key={id}>Leave: {id}</span>
              ))}
              {d.overtime.map((o) => (
                <span key={o.id}>
                  {label(o.category)} overtime: {o.id} · {minutes(o.minutes)} · Rule{" "}
                  {o.operational_rule_id ?? "missing"}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
function EmployeeInputs({
  items,
  onNavigate,
  company,
}: {
  items: HrAttendanceCloseEmployee[];
  onNavigate: Navigate;
  company: string;
}) {
  return (
    <div className="grid min-w-0 gap-3">
      {items.map((item) => (
        <details key={item.employee_id} className={panel}>
          <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <strong className="block break-words text-sm">{item.display_name}</strong>
              <span className="text-xs text-muted-foreground">
                {item.employee_number} · {dayValue(item.calendar_days)} covered days
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span>
                Paid <strong>{dayValue(item.paid_days)}</strong>
              </span>
              <span>
                Unpaid <strong>{dayValue(item.unpaid_days)}</strong>
              </span>
              <span>
                OT{" "}
                <strong>
                  {minutes(
                    item.overtime_regular_minutes + item.overtime_weekend_minutes + item.overtime_holiday_minutes,
                  )}
                </strong>
              </span>
              {item.exception_count > 0 ? (
                <State value="exceptions" />
              ) : (
                <CheckCircle2 className="size-4 text-[var(--nx-success-text)]" />
              )}
              <ChevronDown className="size-4" />
            </div>
          </summary>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric title="Regular overtime" value={minutes(item.overtime_regular_minutes)} hint="Approved minutes" />
            <Metric title="Weekend overtime" value={minutes(item.overtime_weekend_minutes)} hint="Approved minutes" />
            <Metric title="Holiday overtime" value={minutes(item.overtime_holiday_minutes)} hint="Approved minutes" />
            <Metric title="Corrections" value={item.correction_count} hint="Final HR approvals" />
          </div>
          <div className="mt-4">
            <DailyTrace item={item} onNavigate={onNavigate} company={company} />
          </div>
        </details>
      ))}
    </div>
  );
}
type Save = (
  input: unknown,
  operation: (key: string) => Promise<HrAttendanceCompletionResult>,
) => Promise<HrAttendanceCompletionResult | undefined>;
function Overtime({
  client,
  company,
  month,
  revision,
  busy,
  save,
  csrf,
  onNavigate,
  canCreate,
  onEditing,
}: {
  onEditing: (value: boolean) => void;
  client: HrApiClient;
  company: string;
  month: string;
  revision: number;
  busy: boolean;
  save: Save;
  csrf: () => string;
  onNavigate: Navigate;
  canCreate: boolean;
}) {
  const [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [editor, setEditor] = useState(false),
    [rules, setRules] = useState(false),
    [date, setDate] = useState(month),
    [employee, setEmployee] = useState(""),
    [employeeSearch, setEmployeeSearch] = useState(""),
    [lookup, setLookup] = useState(""),
    [requested, setRequested] = useState("60"),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState<HrOvertimeActionRequest["action"] | "">(""),
    [decisionReason, setDecisionReason] = useState(""),
    [decisionVersion, setDecisionVersion] = useState(0),
    [decisionHash, setDecisionHash] = useState<string | undefined>(),
    [approved, setApproved] = useState(""),
    [override, setOverride] = useState(false),
    [category, setCategory] = useState("regular"),
    [minimum, setMinimum] = useState("30"),
    [cap, setCap] = useState("240"),
    [ruleFrom, setRuleFrom] = useState(month),
    [ruleTo, setRuleTo] = useState(""),
    [ruleReason, setRuleReason] = useState("");
  const listRead = useAttendanceRead<HrOvertimeDirectory>(
    JSON.stringify([company, month, revision, offset, applied]),
    () => client.listOvertime({ company_id: company, month, limit: 25, offset, search: applied || undefined }),
  );
  const detailRead = useAttendanceRead<HrOvertimeDetail>(
    selected ? JSON.stringify([company, selected, revision]) : null,
    () => client.getOvertime(company, selected),
  );
  const contextRead = useAttendanceRead<HrOvertimeContext>(
    editor || rules ? JSON.stringify([company, date, employee, lookup, revision]) : null,
    () =>
      client.overtimeContext({
        company_id: company,
        on_date: date,
        employee_id: employee || undefined,
        search: lookup || undefined,
      }),
  );
  const data = listRead.data,
    detail = detailRead.data,
    context = contextRead.data,
    loading = listRead.loading,
    evidenceBusy = contextRead.loading,
    loadError = listRead.error || detailRead.error || contextRead.error;
  useEffect(() => {
    onEditing(editor || rules || !!decision);
    return () => onEditing(false);
  }, [editor, rules, decision, onEditing]);
  const evidence = context?.evidence;
  async function create() {
    setError("");
    const parsed = createHrOvertimeRequestSchema.safeParse({
      company_id: company,
      employee_id: employee,
      work_date: date,
      requested_minutes: Number(requested),
      reason,
      expected_evidence_hash: evidence?.hash,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the request.");
      return;
    }
    const r = await save(parsed.data, (key) => client.createOvertime(parsed.data, key, csrf()));
    if (r) {
      setEditor(false);
      setSelected(r.id);
      setReason("");
    }
  }
  async function decide() {
    if (!detail || !decision) return;
    setError("");
    const parsed = hrOvertimeActionRequestSchema.safeParse({
      company_id: company,
      action: decision,
      expected_version: decisionVersion,
      expected_evidence_hash: decisionHash,
      approved_minutes: decision === "hr_approve" ? Number(approved || detail.requested_minutes) : undefined,
      reason: decisionReason,
      override_self_approval: override,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the decision.");
      return;
    }
    const r = await save(parsed.data, (key) => client.actOnOvertime(detail.id, parsed.data, key, csrf()));
    if (r) {
      setDecision("");
      setDecisionReason("");
      setOverride(false);
    }
  }
  async function createRule() {
    setError("");
    const parsed = hrOvertimeRuleRequestSchema.safeParse({
      company_id: company,
      category,
      effective_from: ruleFrom,
      effective_to: ruleTo || null,
      minimum_minutes: Number(minimum),
      daily_cap_minutes: Number(cap),
      reason: ruleReason,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the rule.");
      return;
    }
    const r = await save(parsed.data, (key) => client.createOvertimeRule(parsed.data, key, csrf()));
    if (r) {
      setRuleReason("");
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      {(error || loadError) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || loadError}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Approve evidenced extra work through the reporting manager and HR. Only final approved minutes enter period
          close.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy || editor} onClick={() => setRules((v) => !v)}>
            Operational rules
          </Button>
          {canCreate && (
            <Button
              className="text-primary-foreground!"
              disabled={busy || editor}
              onClick={() => {
                setEditor(true);
                setRules(false);
                setDecision("");
                setEmployee("");
                setDate(month);
                setError("");
              }}
            >
              New overtime request
            </Button>
          )}
        </div>
      </div>
      {rules && (
        <section className={panel} aria-label="Operational overtime rules">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-semibold">Operational overtime rules</h2>
            <Button variant="ghost" disabled={busy} onClick={() => setRules(false)}>
              Close
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Effective rules control eligible minutes. Monetary rates are handled by payroll policy. A later rule closes
            the previous open-ended version on the preceding day. Existing claim dates stay covered and earlier terms
            are preserved.
          </p>
          <div className="mt-4 grid gap-2">
            {context?.rules.map((r) => (
              <div
                key={r.id}
                className="flex flex-wrap justify-between gap-2 rounded-lg border border-border p-3 text-sm"
              >
                <strong>
                  {label(r.category)} · v{r.version_number}
                </strong>
                <span>
                  Minimum {r.minimum_minutes} min · cap {r.daily_cap_minutes} min
                </span>
                <span className="text-xs text-muted-foreground">
                  {r.effective_from} – {r.effective_to ?? "Open ended"}
                </span>
              </div>
            ))}
            {context && !context.rules.length && (
              <p className="text-sm text-muted-foreground">No active rules cover {date}.</p>
            )}
          </div>
          {context?.can_manage_rules && (
            <form
              className="mt-4 grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void createRule();
              }}
            >
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field title="Category">
                  <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
                    <option value="regular">Regular</option>
                    <option value="weekend">Weekend</option>
                    <option value="holiday">Holiday</option>
                  </select>
                </Field>
                <Field title="Effective from">
                  <Input
                    type="date"
                    className="box-border! min-w-0! max-w-full!"
                    value={ruleFrom}
                    onChange={(e) => setRuleFrom(e.target.value)}
                    required
                  />
                </Field>
                <Field title="Effective to (optional)">
                  <Input
                    type="date"
                    className="box-border! min-w-0! max-w-full!"
                    value={ruleTo}
                    onChange={(e) => setRuleTo(e.target.value)}
                  />
                </Field>
                <Field title="Minimum overtime minutes">
                  <Input
                    type="number"
                    min={0}
                    max={1439}
                    value={minimum}
                    onChange={(e) => setMinimum(e.target.value)}
                    required
                  />
                </Field>
                <Field title="Daily cap in minutes">
                  <Input
                    type="number"
                    min={1}
                    max={1440}
                    value={cap}
                    onChange={(e) => setCap(e.target.value)}
                    required
                  />
                </Field>
              </div>
              <Field title="Rule change reason">
                <Textarea
                  value={ruleReason}
                  minLength={8}
                  maxLength={1000}
                  onChange={(e) => setRuleReason(e.target.value)}
                  required
                />
              </Field>
              <div>
                <Button type="submit" className="text-primary-foreground!" disabled={busy}>
                  Create effective rule
                </Button>
              </div>
            </form>
          )}
        </section>
      )}
      {editor && (
        <section className={panel} aria-label="New overtime request">
          <div className="flex flex-wrap justify-between gap-2">
            <h2 className="text-base font-semibold">New overtime request</h2>
            <Button variant="ghost" disabled={busy} onClick={() => setEditor(false)}>
              Close
            </Button>
          </div>
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div className="grid gap-4 md:grid-cols-2">
              <Field title="Working date">
                <Input
                  type="date"
                  className="box-border! min-w-0! max-w-full!"
                  value={date}
                  onChange={(e) => {
                    setDate(e.target.value);
                    setEmployee("");
                  }}
                  required
                />
              </Field>
              <Field title="Find employee">
                <div className="flex min-w-0 gap-2">
                  <Input
                    aria-label="Find employee"
                    value={employeeSearch}
                    onChange={(e) => setEmployeeSearch(e.target.value)}
                    placeholder="Name or employee number"
                  />
                  <Button
                    variant="outline"
                    type="button"
                    onClick={() => {
                      setEmployee("");
                      setLookup(employeeSearch);
                    }}
                  >
                    Find
                  </Button>
                </div>
              </Field>
              <Field title="Employee">
                <select
                  className={selectClass}
                  value={employee}
                  onChange={(e) => setEmployee(e.target.value)}
                  required
                  disabled={evidenceBusy && !employee}
                >
                  <option value="">Select employee</option>
                  {context?.employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.code} · {e.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field title="Requested overtime minutes">
                <Input
                  type="number"
                  min={1}
                  max={evidence?.eligible_minutes || 1440}
                  value={requested}
                  onChange={(e) => setRequested(e.target.value)}
                  required
                />
              </Field>
            </div>
            {context?.employees_capped && (
              <p className="text-xs text-muted-foreground">
                Showing the first 100 employees. Refine the employee search.
              </p>
            )}
            {evidenceBusy ? (
              <Skeleton className="h-24" />
            ) : (
              evidence && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Metric title="Attendance" value={label(evidence.attendance.day.status)} hint={date} />
                    <Metric
                      title="Category"
                      value={label(evidence.category)}
                      hint={evidence.rule ? `Operational rule v${evidence.rule.version_number}` : "No rule"}
                    />
                    <Metric
                      title="Eligible overtime"
                      value={minutes(evidence.eligible_minutes)}
                      hint="Shift evidence and daily cap"
                    />
                    <Metric
                      title="Reporting manager"
                      value={evidence.attendance.manager_name ?? "Unassigned"}
                      hint="Active user binding required"
                    />
                  </div>
                  {evidence.blockers.length > 0 && (
                    <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-[var(--nx-warning)]">
                      {evidence.blockers.map((b) => (
                        <li key={b}>{b}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )
            )}
            <Field title="Business reason">
              <Textarea
                minLength={8}
                maxLength={1000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
              />
            </Field>
            <div>
              <Button
                className="text-primary-foreground!"
                disabled={busy || evidenceBusy || !evidence || evidence.blockers.length > 0}
                type="submit"
              >
                Save overtime draft
              </Button>
            </div>
          </form>
        </section>
      )}
      <form
        className="flex min-w-0 gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setApplied(search);
          setOffset(0);
        }}
      >
        <Input
          aria-label="Search overtime requests"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search employee or reference"
        />
        <Button variant="outline" type="submit">
          Search
        </Button>
      </form>
      {loading ? (
        <Skeleton className="h-32" />
      ) : data?.items.length ? (
        <div className="grid min-w-0 gap-3">
          {data.items.map((r) => (
            <article key={r.id} className={panel}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <strong className="block break-words text-sm">{r.display_name}</strong>
                  <span className="text-xs text-muted-foreground">
                    {r.employee_number} · {r.reference} · {r.work_date}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span>
                    {label(r.category)} ·{" "}
                    {minutes(r.status === "approved" ? (r.approved_minutes ?? 0) : r.requested_minutes)}
                  </span>
                  <State value={r.status} />
                  <Button
                    variant="outline"
                    disabled={busy || editor}
                    onClick={() => {
                      setSelected(r.id);
                      setDecision("");
                      setDecisionReason("");
                      setOverride(false);
                    }}
                  >
                    Review
                  </Button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className={panel}>
          <p className="text-sm text-muted-foreground">No overtime requests match this month and search.</p>
        </div>
      )}
      {data && data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!offset || loading}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= data.total || loading}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {!editor && selected && !detail && <Skeleton className="h-36" />}
      {!editor && detail && (
        <section className={panel} aria-label="Overtime request review">
          <div className="flex flex-wrap justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold">{detail.reference}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {detail.display_name} · {detail.work_date} · Version {detail.version}
              </p>
            </div>
            <State value={detail.status} />
          </div>
          <p className="mt-3 break-words text-sm">{detail.reason}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Metric title="Requested" value={minutes(detail.requested_minutes)} hint={label(detail.category)} />
            <Metric title="Approved" value={minutes(detail.approved_minutes ?? 0)} hint="Final HR decision" />
            <Metric
              title="Current eligible minutes"
              value={minutes(detail.evidence?.eligible_minutes ?? 0)}
              hint="Derived from source evidence"
            />
          </div>
          {detail.evidence_unavailable && (
            <p className="mt-3 text-sm text-[var(--nx-warning)]">{detail.evidence_unavailable}</p>
          )}
          {!detail.workflow_managed && (
            <p className="mt-3 text-sm text-muted-foreground">Legacy evidence is preserved as read-only history.</p>
          )}
          {detail.evidence?.blockers.map((b) => (
            <p className="mt-2 text-sm text-[var(--nx-warning)]" key={b}>
              {b}
            </p>
          ))}
          <div className="mt-3">
            <Button
              variant="outline"
              onClick={() =>
                onNavigate(
                  "hr",
                  "daily-attendance",
                  JSON.stringify({ company_id: company, on_date: detail.work_date, search: detail.employee_number }),
                )
              }
            >
              View source attendance <ArrowRight className="size-4" />
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {detail.allowed_actions.map((action) => (
              <Button
                key={action}
                variant={action.endsWith("reject") || action === "cancel" ? "outline" : "default"}
                className={action.endsWith("reject") || action === "cancel" ? "" : "text-primary-foreground!"}
                disabled={busy}
                onClick={() => {
                  setDecision(action);
                  setDecisionVersion(detail.version);
                  setDecisionHash(detail.evidence?.hash);
                  setApproved(String(detail.requested_minutes));
                  setOverride(false);
                }}
              >
                {label(action)}
              </Button>
            ))}
          </div>
          {decision && (
            <form
              className="mt-4 grid gap-4 rounded-lg border border-border bg-background p-4"
              onSubmit={(e) => {
                e.preventDefault();
                void decide();
              }}
            >
              <h3 className="text-sm font-semibold">Confirm {label(decision).toLowerCase()}</h3>
              {decision === "hr_approve" && (
                <Field title="Final approved overtime minutes">
                  <Input
                    type="number"
                    min={1}
                    max={Math.min(detail.requested_minutes, detail.evidence?.eligible_minutes ?? 1440)}
                    value={approved}
                    onChange={(e) => setApproved(e.target.value)}
                    required
                  />
                </Field>
              )}
              <Field title="Decision reason">
                <Textarea
                  value={decisionReason}
                  minLength={8}
                  maxLength={1000}
                  onChange={(e) => setDecisionReason(e.target.value)}
                  required
                />
              </Field>
              {decision.includes("_") && detail.self_decision_requires_override && (
                <label htmlFor="overtime-override" className="flex items-start gap-2 text-sm">
                  <Checkbox
                    id="overtime-override"
                    checked={override}
                    onCheckedChange={(v) => setOverride(v === true)}
                  />
                  I explicitly acknowledge a super-administrator override of actor separation. This decision will be
                  audited.
                </label>
              )}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  className="text-primary-foreground!"
                  disabled={busy || (decision.includes("_") && detail.self_decision_requires_override && !override)}
                >
                  Confirm decision
                </Button>
                <Button variant="outline" disabled={busy} onClick={() => setDecision("")}>
                  Back
                </Button>
              </div>
            </form>
          )}
          <div className="mt-4">
            <History items={detail.history} />
          </div>
        </section>
      )}
    </div>
  );
}
function CloseAndInputs({
  mode,
  client,
  company,
  month,
  revision,
  busy,
  save,
  csrf,
  onNavigate,
  onEditing,
}: {
  onEditing: (value: boolean) => void;
  mode: Exclude<Mode, "overtime">;
  client: HrApiClient;
  company: string;
  month: string;
  revision: number;
  busy: boolean;
  save: Save;
  csrf: () => string;
  onNavigate: Navigate;
}) {
  const [error, setError] = useState(""),
    [offset, setOffset] = useState(0),
    [action, setAction] = useState<"open" | "process" | "lock" | "">(""),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [reviewVersion, setReviewVersion] = useState(0),
    [reviewHash, setReviewHash] = useState<string | undefined>();
  const periodRead = useAttendanceRead<HrAttendancePeriodWorkspace | HrAttendancePayrollInputs>(
    JSON.stringify([company, month, mode, revision, offset]),
    () => {
      const q = { company_id: company, month, limit: 25, offset };
      return mode === "attendance-period" ? client.periodWorkspace(q) : client.payrollInputs(q);
    },
  );
  const data = periodRead.data,
    loading = periodRead.loading,
    loadError = periodRead.error;
  useEffect(() => {
    onEditing(!!action);
    return () => onEditing(false);
  }, [action, onEditing]);
  const period = data?.period,
    workspace = data && "allowed_actions" in data ? data : null;
  async function apply() {
    setError("");
    const parsed = hrAttendancePeriodActionRequestSchema.safeParse({
      company_id: company,
      month,
      action,
      expected_version: reviewVersion,
      expected_source_hash: reviewHash,
      reason,
      override_self_approval: override,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Review the close action.");
      return;
    }
    const r = await save(parsed.data, (key) => client.actOnPeriod(parsed.data, key, csrf()));
    if (r) {
      setAction("");
      setReason("");
      setOverride(false);
    }
  }
  return (
    <div className="grid min-w-0 gap-4">
      {(error || loadError) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || loadError}
        </div>
      )}
      <div className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold">
              {mode === "attendance-period" ? (
                <FileCheck2 className="size-5 text-primary" />
              ) : (
                <LockKeyhole className="size-5 text-primary" />
              )}
              {mode === "attendance-period" ? "Month-end attendance review" : "Finalized attendance inputs"}
            </h2>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
              {mode === "attendance-period"
                ? "Process the completed month, resolve every exception, then have a separate authorized approver lock the reviewed sources. Locking creates immutable payroll inputs."
                : "Payroll reads the locked attendance snapshot: days, approved leave, approved overtime and correction references. Salary values and payment posting are handled in payroll."}
            </p>
          </div>
          <State value={period?.state ?? "not_opened"} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric title="Employees" value={period?.employee_count ?? 0} hint="All operational placements in month" />
          <Metric title="Exceptions" value={period?.exception_count ?? 0} hint="Each unresolved source blocks lock" />
          <Metric
            title="Review version"
            value={period?.version ?? 0}
            hint={
              period?.processed_at
                ? `Processed ${new Date(period.processed_at).toLocaleDateString()}`
                : "Not yet processed"
            }
          />
          <Metric
            title="Payroll availability"
            value={period?.state === "locked" ? "Available" : "Awaiting lock"}
            hint={
              period?.locked_at
                ? `Locked ${new Date(period.locked_at).toLocaleDateString()}`
                : "Review first, then lock"
            }
          />
        </div>
        {period?.review_hash && (
          <p className="mt-3 break-all text-xs text-muted-foreground">Reviewed source hash: {period.review_hash}</p>
        )}
        <div className="mt-4 flex flex-wrap gap-2">
          {workspace?.allowed_actions.map((a) => (
            <Button
              key={a}
              className={a === "lock" ? "text-primary-foreground!" : ""}
              variant={a === "lock" ? "default" : "outline"}
              disabled={busy || loading || !!action}
              onClick={() => {
                setAction(a);
                setReviewVersion(period?.version ?? 0);
                setReviewHash(period?.review_hash ?? undefined);
                setOverride(false);
              }}
            >
              {a === "open"
                ? "Open attendance period"
                : a === "process"
                  ? "Process / refresh review"
                  : "Lock reviewed period"}
            </Button>
          ))}
          {mode === "attendance-period" && period?.state === "locked" && (
            <Button
              variant="outline"
              onClick={() =>
                onNavigate("hr", "attendance-payroll-inputs", JSON.stringify({ company_id: company, month }))
              }
            >
              View payroll inputs <ArrowRight className="size-4" />
            </Button>
          )}
          {mode === "attendance-payroll-inputs" && period?.state !== "locked" && (
            <Button
              variant="outline"
              onClick={() => onNavigate("hr", "attendance-period", JSON.stringify({ company_id: company, month }))}
            >
              Open period review <ArrowRight className="size-4" />
            </Button>
          )}
        </div>
      </div>
      {action && (
        <form
          className={panel + " grid gap-4"}
          onSubmit={(e) => {
            e.preventDefault();
            void apply();
          }}
        >
          <h2 className="text-base font-semibold">
            {action === "lock"
              ? "Lock the reviewed attendance month"
              : action === "process"
                ? "Rebuild the attendance review"
                : "Open the attendance month"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {action === "lock"
              ? "The server will recheck source evidence before freezing employee inputs. Locked months cannot be reopened or edited through this workflow."
              : "This action records your reason and review history. Processing includes every operational employee and reports pending requests, missing shifts and unreconciled attendance."}
          </p>
          <Field title="Attendance close reason">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              minLength={8}
              maxLength={1000}
              required
            />
          </Field>
          {action === "lock" && workspace?.self_decision_requires_override && (
            <label htmlFor="period-override" className="flex items-start gap-2 text-sm">
              <Checkbox id="period-override" checked={override} onCheckedChange={(v) => setOverride(v === true)} />I
              explicitly acknowledge the audited super-administrator override because I opened or processed this month.
            </label>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              className="text-primary-foreground!"
              type="submit"
              disabled={busy || (action === "lock" && workspace?.self_decision_requires_override && !override)}
            >
              {busy ? "Processing…" : "Confirm " + label(action).toLowerCase()}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setAction("")}>
              Cancel
            </Button>
          </div>
        </form>
      )}
      {loading ? (
        <Skeleton className="h-40" />
      ) : data?.items.length ? (
        <EmployeeInputs items={data.items} company={company} onNavigate={onNavigate} />
      ) : (
        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            {mode === "attendance-period"
              ? "No prepared review exists for this month. Open and process a completed month to review its attendance."
              : period?.state === "locked"
                ? "This locked legacy period has no v5 daily evidence. Its historical inputs are preserved; a controlled migration is required before showing daily traces."
                : "Finalized inputs appear here after the attendance period is locked."}
          </p>
        </div>
      )}
      {data && data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span>
            {offset + 1}–{Math.min(offset + 25, data.total)} of {data.total} employees
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={!offset || loading}
              onClick={() => setOffset((v) => Math.max(0, v - 25))}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              disabled={offset + 25 >= data.total || loading}
              onClick={() => setOffset((v) => v + 25)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {workspace && <History items={workspace.history} />}
    </div>
  );
}
export function HrAttendanceCompletionWorkspace({
  mode,
  onNavigate,
  initialReference,
}: {
  mode: Mode;
  onNavigate: Navigate;
  initialReference?: string;
}) {
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const initial = useMemo(() => {
    try {
      const ref = JSON.parse(initialReference ?? "{}");
      const q = hrAttendancePeriodQuerySchema.safeParse(ref);
      return q.success ? q.data : null;
    } catch {
      return null;
    }
  }, [initialReference]);
  const [companyChoice, setCompany] = useState(initial?.company_id ?? ""),
    [month, setMonth] = useState(initial?.month ?? previousMonth()),
    [revision, setRevision] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editing, setEditing] = useState(false);
  const lock = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const permission =
    mode === "overtime"
      ? "hr.attendance.overtime.read"
      : mode === "attendance-period"
        ? "hr.attendance.period.read"
        : "hr.attendance.payroll_input.read";
  const permissions = session?.user.permissions ?? [],
    canRead = permissions.includes(permission);
  const companyRead = useAttendanceRead<HrCompanyDirectory>(canRead ? "companies" : null, () => client.companies());
  const companies = companyRead.data?.items ?? [],
    companyLoading = companyRead.loading,
    company = companies.some((c) => c.id === companyChoice) ? companyChoice : (companies[0]?.id ?? ""),
    loadError = companyRead.error;
  const save: Save = async (input, operation) => {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setNotice(`Saved · ${label(result.status)} · version ${result.version}`);
      setRevision((v) => v + 1);
      return result;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "The change could not be saved. Refresh the evidence and retry.");
    } finally {
      setBusy(false);
      lock.current = false;
    }
  };
  if (sessionLoading) return <Skeleton className="h-40" />;
  if (!canRead) return <div className={panel}>You do not have permission to view this attendance workspace.</div>;
  return (
    <div className="grid min-w-0 gap-5 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!">
      <nav aria-label="Attendance completion workflow" className="grid min-w-0 grid-cols-1 gap-2 sm:grid-cols-3">
        {(
          [
            ["overtime", "Overtime", Clock3],
            ["attendance-period", "Period close", FileCheck2],
            ["attendance-payroll-inputs", "Payroll inputs", LockKeyhole],
          ] as const
        ).map(([id, title, Icon]) => (
          <Button
            key={id}
            variant="outline"
            className={
              "h-auto min-w-0 justify-start gap-2 whitespace-normal px-4 py-3 " +
              (mode === id ? "border-primary bg-primary/10 text-primary!" : "")
            }
            disabled={
              busy ||
              editing ||
              !permissions.includes(
                id === "overtime"
                  ? "hr.attendance.overtime.read"
                  : id === "attendance-period"
                    ? "hr.attendance.period.read"
                    : "hr.attendance.payroll_input.read",
              )
            }
            onClick={() => onNavigate("hr", id, JSON.stringify({ company_id: company, month }))}
          >
            <Icon className="size-4 shrink-0" />
            {title}
          </Button>
        ))}
      </nav>
      <div className={panel + " grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] md:items-end"}>
        <Field title="Company">
          <select
            className={selectClass}
            disabled={busy || editing || companyLoading}
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setError("");
              setNotice("");
            }}
          >
            <option value="">{companyLoading ? "Loading authorized companies…" : "Select company"}</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        <Field title="Attendance month">
          <Input
            type="month"
            className="box-border! min-w-0! max-w-full!"
            value={month.slice(0, 7)}
            disabled={busy || editing}
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value + "-01");
              setNotice("");
            }}
          />
        </Field>
        <Button variant="outline" disabled={busy || !company} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className={"size-4 " + (busy ? "animate-spin" : "")} />
          Refresh
        </Button>
      </div>
      {(error || loadError) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || loadError}
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
      {companyLoading ? (
        <Skeleton className="h-32" />
      ) : !company ? (
        <div className={panel}>No authorized company is available.</div>
      ) : mode === "overtime" ? (
        <Overtime
          key={company + month}
          client={client}
          company={company}
          month={month}
          revision={revision}
          busy={busy}
          save={save}
          csrf={csrfToken}
          onNavigate={onNavigate}
          onEditing={setEditing}
          canCreate={permissions.includes("hr.attendance.overtime.create")}
        />
      ) : (
        <CloseAndInputs
          key={company + month + mode}
          onEditing={setEditing}
          mode={mode}
          client={client}
          company={company}
          month={month}
          revision={revision}
          busy={busy}
          save={save}
          csrf={csrfToken}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
