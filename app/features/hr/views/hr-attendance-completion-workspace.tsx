"use client";
import { useHrOperationsScope } from "../components/hr-operations-scope";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrDeleteButton, HrEditButton } from "../components/hr-icon-buttons";
import {
  AttendanceEmployeeDetails,
  AttendanceEmployeeTable,
  AttendancePeriodBar,
  AttendancePeriodDetails,
  attendanceMonthLabel,
  periodActionLabel,
} from "../components/hr-attendance-month-end";
import {
  useAttendanceRead,
  Field,
  State,
  Metric,
  History,
  selectClass,
  panel,
} from "../components/hr-workspace-controls";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Plus } from "lucide-react";
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
} from "../components/attendance-status";
import {
  createHrOvertimeRequestSchema,
  replaceHrOvertimeRequestSchema,
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
type Save = (
  input: unknown,
  operation: (key: string) => Promise<HrAttendanceCompletionResult>,
) => Promise<HrAttendanceCompletionResult | undefined>;
type OvertimeEditor = { mode: "new" } | { mode: "edit"; id: string; version: number; employeeName: string };

function Overtime({
  client,
  company,
  month,
  revision,
  busy,
  save,
  csrf,
  onNavigate,
  onEditing,
  saveError,
  newRequest,
  search,
}: {
  onEditing: (value: boolean) => void;
  saveError?: string;
  client: HrApiClient;
  company: string;
  month: string;
  revision: number;
  busy: boolean;
  save: Save;
  csrf: () => string;
  onNavigate: Navigate;
  /** Increments each time "New overtime request" is pressed in the page header. */
  newRequest: number;
  /** Search text typed in the page header row. */
  search: string;
}) {
  const [selected, setSelected] = useState(""),
    [applied, setApplied] = useState(search.trim()),
    [offset, setOffset] = useState(0),
    [error, setError] = useState(""),
    [editor, setEditor] = useState<OvertimeEditor | null>(null),
    [seenRequest, setSeenRequest] = useState(newRequest),
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
    [override, setOverride] = useState(false);
  // The header button lives in the parent; open a blank request when it is pressed.
  if (newRequest !== seenRequest) {
    setSeenRequest(newRequest);
    setEditor({ mode: "new" });
    setSelected("");
    setDecision("");
    setEmployee("");
    setEmployeeSearch("");
    setLookup("");
    setDate(month);
    setRequested("60");
    setReason("");
    setError("");
  }
  const listRead = useAttendanceRead<HrOvertimeDirectory>(
    JSON.stringify([company, month, revision, offset, applied]),
    () => client.listOvertime({ company_id: company, month, limit: 25, offset, search: applied || undefined }),
  );
  const detailRead = useAttendanceRead<HrOvertimeDetail>(
    selected ? JSON.stringify([company, selected, revision]) : null,
    () => client.getOvertime(company, selected),
  );
  const contextRead = useAttendanceRead<HrOvertimeContext>(
    editor ? JSON.stringify([company, date, employee, lookup, revision]) : null,
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
    onEditing(!!editor || !!decision);
    return () => onEditing(false);
  }, [editor, decision, onEditing]);
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied(search.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  const evidence = context?.evidence;
  const editing = editor?.mode === "edit" ? editor : null;
  async function saveRequest() {
    setError("");
    if (editing) {
      const parsed = replaceHrOvertimeRequestSchema.safeParse({
        company_id: company,
        expected_version: editing.version,
        work_date: date,
        requested_minutes: Number(requested),
        reason,
        expected_evidence_hash: evidence?.hash,
      });
      if (!parsed.success) {
        setError(parsed.error.issues[0]?.message ?? "Review the request.");
        return;
      }
      const r = await save(parsed.data, (key) => client.replaceOvertime(editing.id, parsed.data, key, csrf()));
      if (r) {
        setEditor(null);
        setSelected(r.id);
        setReason("");
      }
      return;
    }
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
      setEditor(null);
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
      if (decision === "cancel") setSelected("");
    }
  }
  const startDecision = (action: HrOvertimeActionRequest["action"]) => {
    if (!detail) return;
    setDecision(action);
    setDecisionReason("");
    setDecisionVersion(detail.version);
    setDecisionHash(detail.evidence?.hash);
    setApproved(String(detail.requested_minutes));
    setOverride(false);
  };
  const startEdit = () => {
    if (!detail) return;
    setEditor({ mode: "edit", id: detail.id, version: detail.version, employeeName: detail.display_name });
    setEmployee(detail.employee_id);
    setDate(detail.work_date);
    setRequested(String(detail.requested_minutes));
    setReason(detail.reason);
    setDecision("");
    setError("");
    setSelected("");
  };
  const workflowActions = detail?.allowed_actions.filter((action) => action !== "cancel") ?? [];
  const canDelete = !!detail?.allowed_actions.includes("cancel");
  return (
    <div className="grid min-w-0 gap-4">
      {(error || loadError) && !editor && !selected && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || loadError}
        </div>
      )}
      {editor && (
        <HrRecordDrawer
          title={editing ? "Edit overtime request" : "New overtime request"}
          open={!!editor}
          onClose={() => setEditor(null)}
          busy={busy}
          error={error || loadError || saveError}
          footer={
            <Button
              type="submit"
              form="overtime-request-form"
              disabled={busy || evidenceBusy || !evidence || evidence.blockers.length > 0}
            >
              {editing ? "Save changes" : "Save overtime draft"}
            </Button>
          }
        >
          <form
            id="overtime-request-form"
            className="grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void saveRequest();
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
                    if (!editing) setEmployee("");
                  }}
                  required
                />
              </Field>
              {editing ? (
                <Field title="Employee">
                  <Input value={editing.employeeName} readOnly disabled />
                </Field>
              ) : (
                <>
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
                </>
              )}
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
            {!editing && context?.employees_capped && (
              <p className="text-xs text-muted-foreground">Showing the first 100 employees. Refine the employee search.</p>
            )}
            {evidenceBusy ? (
              <Skeleton className="h-24" />
            ) : (
              evidence && (
                <div className="rounded-lg border border-border bg-background p-4">
                  <div className="grid grid-cols-2 gap-3">
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
          </form>
        </HrRecordDrawer>
      )}
      {loading ? (
        <Skeleton className="h-32" />
      ) : data?.items.length ? (
        <div className="grid min-w-0 gap-2">
          {data.items.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={busy || !!editor}
              onClick={() => {
                setSelected(r.id);
                setDecision("");
                setDecisionReason("");
                setOverride(false);
                setError("");
              }}
              className={`${panel} flex w-full flex-wrap items-center justify-between gap-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${selected === r.id ? "border-primary/60" : ""}`}
            >
              <span className="min-w-0">
                <strong className="block break-words text-sm">{r.display_name}</strong>
                <span className="text-xs text-muted-foreground">
                  {r.employee_number} · {r.reference} · {r.work_date}
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-3 text-sm">
                <span>
                  {label(r.category)} ·{" "}
                  {minutes(r.status === "approved" ? (r.approved_minutes ?? 0) : r.requested_minutes)}
                </span>
                <State value={r.status} />
              </span>
            </button>
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
      <HrRecordDrawer
        title={detail?.reference ?? "Overtime request"}
        open={!!selected && !editor}
        onClose={() => {
          if (busy) return;
          setSelected("");
          setDecision("");
        }}
        busy={busy}
        error={error || (selected ? detailRead.error : "") || saveError}
        footer={
          detail && !decision ? (
            <>
              {detail.can_edit ? <HrEditButton label="Edit overtime request" disabled={busy} onClick={startEdit} /> : null}
              {canDelete ? (
                <HrDeleteButton
                  label="Cancel overtime request"
                  disabled={busy}
                  onClick={() => startDecision("cancel")}
                />
              ) : null}
              {workflowActions.map((action) => (
                <Button key={action} disabled={busy} onClick={() => startDecision(action)}>
                  {label(action)}
                </Button>
              ))}
            </>
          ) : undefined
        }
      >
        {!detail ? (
          <Skeleton className="h-36" />
        ) : (
          <section className="grid gap-4" aria-label="Overtime request review">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-semibold">{detail.display_name}</p>
                <p className="text-sm text-muted-foreground">
                  {detail.employee_number} · {detail.work_date} · Version {detail.version}
                </p>
              </div>
              <State value={detail.status} />
            </div>
            <p className="break-words text-sm">{detail.reason}</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Metric title="Requested" value={minutes(detail.requested_minutes)} hint={label(detail.category)} />
              <Metric title="Approved" value={minutes(detail.approved_minutes ?? 0)} hint="Final HR decision" />
              <Metric
                title="Current eligible minutes"
                value={minutes(detail.evidence?.eligible_minutes ?? 0)}
                hint="Derived from source evidence"
              />
            </div>
            {detail.evidence_unavailable && (
              <p className="text-sm text-[var(--nx-warning)]">{detail.evidence_unavailable}</p>
            )}
            {!detail.workflow_managed && (
              <p className="text-sm text-muted-foreground">Legacy evidence is preserved as read-only history.</p>
            )}
            {detail.evidence?.blockers.map((b) => (
              <p className="text-sm text-[var(--nx-warning)]" key={b}>
                {b}
              </p>
            ))}
            <div>
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
            {decision && (
              <form
                className="grid gap-4 rounded-lg border border-border bg-background p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void decide();
                }}
              >
                <h3 className="text-sm font-semibold">
                  {decision === "cancel" ? "Cancel this overtime request" : `Confirm ${label(decision).toLowerCase()}`}
                </h3>
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
                <Field title={decision === "cancel" ? "Reason for cancelling" : "Decision reason"}>
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
                <div className="flex flex-wrap justify-end gap-2">
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision("")}>
                    Back
                  </Button>
                  <Button
                    type="submit"
                    variant={decision === "cancel" ? "destructive" : "default"}
                    className={decision === "cancel" ? "" : "text-primary-foreground!"}
                    disabled={busy || (decision.includes("_") && detail.self_decision_requires_override && !override)}
                  >
                    {decision === "cancel" ? "Cancel request" : "Confirm decision"}
                  </Button>
                </div>
              </form>
            )}
            <History items={detail.history} />
          </section>
        )}
      </HrRecordDrawer>
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
  saveError,
}: {
  onEditing: (value: boolean) => void;
  saveError?: string;
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
    [periodOpen, setPeriodOpen] = useState(false),
    [employeeId, setEmployeeId] = useState(""),
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
    workspace = data && "allowed_actions" in data ? data : null,
    employee = data?.items.find((item) => item.employee_id === employeeId) ?? null;
  const startAction = (next: "open" | "process" | "lock") => {
    setPeriodOpen(true);
    setAction(next);
    setReason("");
    setReviewVersion(period?.version ?? 0);
    setReviewHash(period?.review_hash ?? undefined);
    setOverride(false);
    setError("");
  };
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
      setError(parsed.error.issues[0]?.message ?? "Review the period action.");
      return;
    }
    const r = await save(parsed.data, (key) => client.actOnPeriod(parsed.data, key, csrf()));
    if (r) {
      setAction("");
      setReason("");
      setOverride(false);
    }
  }
  const crossLink =
    mode === "attendance-period" && period?.state === "locked" ? (
      <Button
        variant="outline"
        onClick={() => onNavigate("hr", "attendance-payroll-inputs", JSON.stringify({ company_id: company, month }))}
      >
        View payroll inputs <ArrowRight className="size-4" />
      </Button>
    ) : null;
  return (
    <div className="grid min-w-0 gap-4">
      {(error || loadError) && !periodOpen && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {error || loadError}
        </div>
      )}
      {loading && !data ? (
        <Skeleton className="h-16" />
      ) : (
        <AttendancePeriodBar
          month={month}
          period={period}
          actions={workspace?.allowed_actions ?? []}
          busy={busy || loading}
          onOpen={() => {
            setPeriodOpen(true);
            setAction("");
          }}
          onAction={startAction}
        />
      )}
      {crossLink ? <div className="flex justify-end">{crossLink}</div> : null}
      {loading ? (
        <Skeleton className="h-40" />
      ) : data?.items.length ? (
        <AttendanceEmployeeTable items={data.items} selected={employeeId} onOpen={setEmployeeId} />
      ) : (
        <div className={panel}>
          <p className="text-sm text-muted-foreground">
            {mode === "attendance-period"
              ? "No review has been prepared for this month yet. Open the period, then process the review."
              : period?.state === "locked"
                ? "This locked legacy period has no daily evidence to show. Its historical inputs are preserved."
                : "Finalized inputs appear here after the attendance period is locked."}
          </p>
        </div>
      )}
      {data && data.total > 25 && (
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <span className="text-xs text-muted-foreground">
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
      {workspace ? (
        <section className={panel} aria-label="Period history">
          <History items={workspace.history} title="Period history" />
        </section>
      ) : null}
      <HrRecordDrawer
        title={`Attendance period · ${attendanceMonthLabel(month)}`}
        open={periodOpen}
        onClose={() => {
          if (busy) return;
          setPeriodOpen(false);
          setAction("");
        }}
        busy={busy}
        error={error || saveError}
        footer={
          !action && workspace?.allowed_actions.length ? (
            <>
              {workspace.allowed_actions.map((a) => (
                <Button key={a} disabled={busy || loading} onClick={() => startAction(a)}>
                  {periodActionLabel(a)}
                </Button>
              ))}
            </>
          ) : undefined
        }
      >
        <AttendancePeriodDetails month={month} period={period} />
        {action ? (
          <form
            className="grid gap-4 rounded-lg border border-border bg-background p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void apply();
            }}
          >
            <h3 className="text-sm font-semibold">
              {action === "lock"
                ? "Lock the reviewed month"
                : action === "process"
                  ? "Process the attendance review"
                  : "Open the attendance month"}
            </h3>
            {action === "lock" ? (
              <p className="text-sm text-muted-foreground">
                Locking freezes the employee inputs for payroll. A locked month cannot be reopened here.
              </p>
            ) : null}
            <Field title="Reason">
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
                explicitly acknowledge the audited super-administrator override because I opened or processed this
                month.
              </label>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAction("")}>
                Back
              </Button>
              <Button
                className="text-primary-foreground!"
                type="submit"
                disabled={busy || (action === "lock" && workspace?.self_decision_requires_override && !override)}
              >
                {busy ? "Processing…" : periodActionLabel(action)}
              </Button>
            </div>
          </form>
        ) : null}
      </HrRecordDrawer>
      <HrRecordDrawer
        title={employee?.display_name ?? "Employee month"}
        open={!!employee}
        onClose={() => setEmployeeId("")}
      >
        {employee ? <AttendanceEmployeeDetails item={employee} company={company} onNavigate={onNavigate} /> : null}
      </HrRecordDrawer>
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
    [editing, setEditing] = useState(false),
    [newRequest, setNewRequest] = useState(0),
    [overtimeSearch, setOvertimeSearch] = useState("");
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
  useHrOperationsScope(company, undefined, month);
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
      <div
        className={
          panel +
          (mode === "overtime"
            ? " grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,16rem)_minmax(0,10rem)_minmax(0,1fr)_auto] lg:items-end"
            : " grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,220px)_auto] md:items-end")
        }
      >
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
        {mode === "overtime" ? (
          <Field title="Search">
            <Input
              aria-label="Search overtime requests"
              type="search"
              value={overtimeSearch}
              onChange={(e) => setOvertimeSearch(e.target.value)}
              placeholder="Employee or reference"
            />
          </Field>
        ) : null}
        {mode === "overtime" && permissions.includes("hr.attendance.overtime.create") ? (
          <Button
            className="text-primary-foreground! lg:justify-self-end"
            disabled={busy || editing || !company}
            onClick={() => {
              setError("");
              setNotice("");
              setNewRequest((value) => value + 1);
            }}
          >
            <Plus className="size-4" />
            New overtime request
          </Button>
        ) : null}
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
          saveError={error}
          csrf={csrfToken}
          onNavigate={onNavigate}
          onEditing={setEditing}
          newRequest={newRequest}
          search={overtimeSearch}
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
          saveError={error}
          csrf={csrfToken}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
