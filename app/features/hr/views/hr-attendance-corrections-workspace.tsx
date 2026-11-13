"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { readHrOperationsScope, useHrOperationsScope } from "../components/hr-operations-scope";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrFormRows, HrRecordCodeField } from "../components/hr-create-form";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createHrCorrectionRequestSchema,
  updateHrCorrectionRequestSchema,
  hrCorrectionActionRequestSchema,
  type CreateHrCorrectionRequest,
  type UpdateHrCorrectionRequest,
  type HrCorrectionActionRequest,
  type HrCorrectionContext,
  type HrCorrectionDetail,
  type HrCorrectionDirectory,
  type HrCorrectionEvidence,
  type HrCorrectionResult,
} from "@nexora/contracts";
import { ClipboardCheck, Plus, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { HrApiClient } from "../api/hr-client";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  AttendanceStatusBadge,
  attendanceLabel as label,
  attendanceMinutes as minutes,
} from "../components/attendance-status";
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const fail = (e: unknown) =>
  e instanceof ApiError ? e.message : "The correction could not be loaded or saved. Please retry.";
function Status({ value }: { value: string }) {
  return (
    <Badge
      variant="outline"
      className={
        value === "approved"
          ? "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]!"
          : value.startsWith("pending")
            ? "border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]!"
            : "bg-muted text-foreground!"
      }
    >
      {label(value)}
    </Badge>
  );
}
const displayTime = (value: string | null, zone: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, { timeZone: zone ?? "UTC", dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "—";
function localTime(value: string | null, zone: string) {
  if (!value) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const get = (key: string) => parts.find((p) => p.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
function utcOffset(value: string | null, zone: string) {
  const text =
    new Intl.DateTimeFormat("en", { timeZone: zone, timeZoneName: "longOffset" })
      .formatToParts(new Date(value ?? Date.now()))
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  return text === "GMT" ? "+00:00" : text.replace("GMT", "");
}
/** UTC offset of a local "YYYY-MM-DDTHH:mm" wall-clock time in `zone` (handles daylight-saving changes). */
function offsetForLocal(local: string, zone: string) {
  const minutesOf = (offset: string) => {
    const m = /^([+-])(d{2}):(d{2})$/.exec(offset);
    return m ? (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) : 0;
  };
  const guess = Date.parse(local.slice(0, 16) + ":00Z");
  if (!Number.isFinite(guess)) return "+00:00";
  const first = utcOffset(new Date(guess).toISOString(), zone);
  return utcOffset(new Date(guess - minutesOf(first) * 60000).toISOString(), zone);
}
function Evidence({ value }: { value: HrCorrectionEvidence }) {
  return (
    <div className="grid min-w-0 gap-3 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm">Current attendance evidence</strong>
        <AttendanceStatusBadge status={value.day.status} />
      </div>
      <p className="text-xs text-muted-foreground">
        {value.day.shift_name ?? "No configured shift"} · {value.day.time_zone ?? "Timezone unavailable"}
      </p>
      <dl className="m-0 grid gap-3 sm:grid-cols-2">
        <div>
          <dt className="text-xs text-muted-foreground">Scheduled window</dt>
          <dd className="m-0 mt-1 text-sm">
            {displayTime(value.day.scheduled_start, value.day.time_zone)} →{" "}
            {displayTime(value.day.scheduled_end, value.day.time_zone)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Reporting manager</dt>
          <dd className="m-0 mt-1 text-sm">{value.manager_name ?? "Manager/user route not configured"}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Recorded work</dt>
          <dd className="m-0 mt-1 text-sm">{minutes(value.day.worked_minutes)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Attendance period</dt>
          <dd className="m-0 mt-1 text-sm">{value.period_locked ? "Locked" : "Not locked"}</dd>
        </div>
      </dl>
      {value.blockers.length > 0 && (
        <ul className="m-0 grid gap-1 pl-5 text-sm text-destructive">
          {value.blockers.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      )}
      <div>
        <h3 className="text-xs font-semibold">Raw punches</h3>
        {value.day.punches === null ? (
          <p className="mt-2 text-xs text-muted-foreground">Punch read permission is required to view raw evidence.</p>
        ) : value.day.punches.length ? (
          <ol className="m-0 mt-2 grid max-h-48 list-none gap-2 overflow-auto p-0 sm:grid-cols-2">
            {value.day.punches.map((p, i) => (
              <li key={i} className="rounded border border-border p-2 text-xs">
                <strong className="mr-2 uppercase">{p.direction}</strong>
                {displayTime(p.occurred_at, value.day.time_zone)} · {label(p.source)}
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">No device punches recorded for this working date.</p>
        )}
      </div>
    </div>
  );
}
function TimestampField({
  name,
  value,
  disabled,
  onValue,
}: {
  name: string;
  value: string;
  disabled: boolean;
  onValue: (v: string) => void;
}) {
  return (
    <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
      {name}
      <Input
        required
        className="box-border! w-full min-w-0! max-w-full!"
        type="datetime-local"
        step="60"
        value={value}
        disabled={disabled}
        onChange={(e) => onValue(e.target.value)}
      />
    </label>
  );
}
type CorrectionPrefill = { employee_id: string; employee_number: string; work_date: string };

/** Reads {"new_correction": {...}} from the page reference passed by Daily Attendance. */
function readCorrectionPrefill(reference?: string): CorrectionPrefill | null {
  try {
    const value = JSON.parse(reference ?? "null")?.new_correction;
    return value &&
      typeof value.employee_id === "string" &&
      typeof value.employee_number === "string" &&
      /^\d{4}-\d{2}-\d{2}$/.test(value.work_date)
      ? { employee_id: value.employee_id, employee_number: value.employee_number, work_date: value.work_date }
      : null;
  } catch {
    return null;
  }
}
function Editor({
  client,
  companyId,
  initial,
  revision,
  busy,
  onSave,
  prefill,
}: {
  client: HrApiClient;
  companyId: string;
  initial: HrCorrectionDetail | null;
  revision: number;
  busy: boolean;
  onSave: (id: string | null, input: CreateHrCorrectionRequest | UpdateHrCorrectionRequest) => Promise<void>;
  /** New correction opened from Daily Attendance for one employee and day. */
  prefill?: CorrectionPrefill;
}) {
  const [date, setDate] = useState(initial?.work_date ?? prefill?.work_date ?? today()),
    [employee, setEmployee] = useState(initial?.employee_id ?? prefill?.employee_id ?? ""),
    [kind, setKind] = useState<CreateHrCorrectionRequest["kind"]>(initial?.kind ?? "missing_out"),
    [reason, setReason] = useState(initial?.reason ?? ""),
    [version] = useState(initial?.version),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(prefill?.employee_number ?? "");
  // Typing in the Employee dropdown searches the server after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setApplied(search.trim()), 300);
    return () => clearTimeout(timer);
  }, [search]);
  const [context, setContext] = useState<HrCorrectionContext | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(""),
    initialized = useRef(false);
  useEffect(() => {
    if (!date) return;
    let active = true;
    setLoading(true);
    setContext(null);
    setError("");
    client
      .correctionContext({
        company_id: companyId,
        on_date: date,
        employee_id: employee || undefined,
        search: applied || undefined,
      })
      .then((value) => {
        if (!active) return;
        setContext(value);
        if (value.evidence && !initialized.current) {
          const zone = value.evidence.day.time_zone ?? "UTC";
          setStart(localTime(initial?.stated_in ?? null, zone));
          setEnd(localTime(initial?.stated_out ?? null, zone));
          initialized.current = true;
        }
      })
      .catch((e) => {
        if (active) setError(fail(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, companyId, date, employee, applied, revision, initial]);
  const evidence = context?.evidence,
    blocked = !evidence || loading;
  // Times are entered in the shift's timezone (or this browser's when no shift is configured).
  const zone = evidence?.day.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const iso = (value: string) =>
    value ? `${value.length === 16 ? value + ":00" : value}${offsetForLocal(value, zone)}` : null;
  return (
    <WorkForm
      aria-label="Correction draft editor"
      className="grid min-w-0 gap-4 rounded-xl border border-primary/25 bg-card p-4 sm:p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        const terms = {
          company_id: companyId,
          kind,
          stated_in: kind === "missing_in" || kind === "incorrect_attendance" ? iso(start) : null,
          stated_out: kind === "missing_out" || kind === "incorrect_attendance" ? iso(end) : null,
          reason,
          expected_evidence_hash: evidence?.hash ?? "",
        };
        const result = initial
          ? updateHrCorrectionRequestSchema.safeParse({ ...terms, expected_version: version })
          : createHrCorrectionRequestSchema.safeParse({ ...terms, employee_id: employee, work_date: date });
        if (!result.success) {
          setError(result.error.issues.map((i) => i.message).join(" "));
          return;
        }
        setError("");
        try {
          await onSave(initial?.id ?? null, result.data);
        } catch {
          /* Parent retains the request failure and this draft. */
        }
      }}
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Review correction details</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <HrFormRows>
        <HrRecordCodeField
          kind="correction"
          companyId={companyId}
          value={initial?.reference ?? null}
          id="hr-correction-code"
          refreshKey={revision}
        />
        <div className="grid content-start min-w-0 gap-2 text-sm font-medium">
          <label htmlFor="hr-correction-employee">Employee</label>
          <SearchableSelect
            id="hr-correction-employee"
            label="Employee"
            value={employee}
            placeholder="Select an operational employee"
            searchPlaceholder="Search by name or employee number…"
            disabled={busy || !!initial}
            loading={loading && !context}
            required
            search={search}
            onSearchChange={setSearch}
            options={[
              ...(employee && initial && !context?.employees.some((v) => v.id === employee)
                ? [{ value: employee, label: initial.display_name }]
                : []),
              ...(context?.employees.map((p) => ({ value: p.id, label: `${p.code} · ${p.name}` })) ?? []),
            ]}
            onValueChange={(next) => {
              setEmployee(next);
              initialized.current = false;
            }}
          />
        </div>
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Working date
          <Input
            required
            type="date"
            value={date}
            disabled={busy || !!initial}
            onChange={(e) => {
              setDate(e.target.value);
              initialized.current = false;
            }}
          />
        </label>
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Correction type
          <select
            className={selectClass}
            value={kind}
            disabled={busy}
            onChange={(e) => setKind(e.target.value as typeof kind)}
          >
            {["missing_in", "missing_out", "incorrect_attendance", "official_duty"].map((k) => (
              <option key={k} value={k}>
                {label(k)}
              </option>
            ))}
          </select>
        </label>
      </HrFormRows>
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : evidence ? (
        <Evidence value={evidence} />
      ) : null}
      {kind !== "official_duty" && (
        <HrFormRows>
          {(kind === "missing_in" || kind === "incorrect_attendance") && (
            <TimestampField name="Check in" value={start} disabled={busy} onValue={setStart} />
          )}
          {(kind === "missing_out" || kind === "incorrect_attendance") && (
            <TimestampField name="Check out" value={end} disabled={busy} onValue={setEnd} />
          )}
        </HrFormRows>
      )}
      <label className="grid content-start gap-2 text-sm font-medium">
        Correction reason
        <Textarea
          maxLength={1000}
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the missing or incorrect evidence and why this correction is needed"
        />
      </label>
      <HrDrawerActions>
        <Button type="submit" className="text-primary-foreground!" disabled={busy || blocked}>
          {busy ? "Saving…" : initial ? "Save draft changes" : "Save correction draft"}
        </Button>
      </HrDrawerActions>
    </WorkForm>
  );
}
function Decisions({
  detail,
  busy,
  onAction,
}: {
  detail: HrCorrectionDetail;
  busy: boolean;
  onAction: (input: HrCorrectionActionRequest) => Promise<void>;
}) {
  const [action, setAction] = useState<HrCorrectionActionRequest["action"]>(
      detail.allowed_actions.find((a) => a !== "cancel") ?? "cancel",
    ),
    choices = detail.allowed_actions.filter((a) => a !== "cancel"),
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [error, setError] = useState("");
  if (!choices.length) return null;
  const decision = action.includes("approve") || action.includes("reject");
  return (
    <WorkForm
      aria-label="Correction workflow decision"
      className="grid gap-4 rounded-lg border border-border bg-background p-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const result = hrCorrectionActionRequestSchema.safeParse({
          company_id: detail.company_id,
          expected_version: detail.version,
          action,
          reason,
          expected_evidence_hash: detail.evidence?.hash ?? null,
          override_self_approval: override,
        });
        if (!result.success) {
          setError(result.error.issues.map((i) => i.message).join(" "));
          return;
        }
        try {
          await onAction(result.data);
        } catch {
          /* Parent displays failure; preserve the decision reason. */
        }
      }}
    >
      <h3 className="text-sm font-semibold">Next workflow action</h3>
      {error && (
        <p role="alert" className="text-sm">
          {error}
        </p>
      )}
      <label className="grid content-start gap-2 text-sm font-medium">
        Action
        <select
          className={selectClass}
          value={action}
          disabled={busy}
          onChange={(e) => {
            setAction(e.target.value as typeof action);
            setOverride(false);
          }}
        >
          {choices.map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid content-start gap-2 text-sm font-medium">
        Action reason
        <Textarea
          rows={3}
          maxLength={1000}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      {decision && detail.self_decision_requires_override && detail.override_allowed && (
        <label className="flex items-start gap-2 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-3 text-sm">
          <Checkbox checked={override} disabled={busy} onCheckedChange={(v) => setOverride(v === true)} />
          Confirm a super-administrator self-decision override. The reason and override evidence will be recorded
          separately.
        </label>
      )}
      <div>
        <Button
          type="submit"
          className="text-primary-foreground!"
          disabled={
            busy ||
            !detail.allowed_actions.includes(action) ||
            (decision && detail.self_decision_requires_override && !override)
          }
        >
          {busy ? "Saving…" : label(action)}
        </Button>
      </div>
    </WorkForm>
  );
}
export function HrAttendanceCorrectionsWorkspace({
  onNavigate,
  initialReference,
}: {
  initialReference?: string;
  onNavigate: Navigate;
}) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const initialScope = useMemo(() => readHrOperationsScope(initialReference), [initialReference]);
  const [prefill] = useState(() => readCorrectionPrefill(initialReference));
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    canRead = session?.user.permissions.includes("hr.attendance.correction.read") ?? false,
    canCreate = session?.user.permissions.includes("hr.attendance.correction.create") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"] | null>(null),
    [company, setCompany] = useState(initialScope.company_id ?? ""),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState("");
  const [data, setData] = useState<HrCorrectionDirectory>({ items: [], total: 0 }),
    [detail, setDetail] = useState<HrCorrectionDetail | null>(null),
    [editor, setEditor] = useState<{ initial: HrCorrectionDetail | null; key: number; prefill?: CorrectionPrefill } | null>(
      () => (prefill && canCreate ? { initial: null, key: 1, prefill } : null),
    ),
    [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useHrOperationsScope(company);
  // Search as the user types, once typing pauses.
  useEffect(() => {
    const timer = setTimeout(() => {
      setApplied(search.trim());
      setOffset(0);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    if (!canRead) return;
    let active = true;
    setCompanyLoading(true);
    client
      .companies()
      .then((result) => {
        if (active) {
          setCompanies(result.items);
          setCompany((value) => (result.items.some((c) => c.id === value) ? value : (result.items[0]?.id ?? "")));
        }
      })
      .catch((e) => {
        if (active) setError(fail(e));
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, canRead, revision]);
  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    setLoading(true);
    client
      .corrections({
        company_id: company,
        status: (status || undefined) as Parameters<HrApiClient["corrections"]>[0]["status"],
        search: applied || undefined,
        limit: workPageSize,
        offset,
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(fail(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, company, canRead, status, applied, offset, revision, workPageSize]);
  useEffect(() => {
    if (!selected || !company) {
      setDetail(null);
      return;
    }
    let active = true;
    setDetailLoading(true);
    client
      .correction(company, selected)
      .then((result) => {
        if (active) setDetail(result);
      })
      .catch((e) => {
        if (active) setError(fail(e));
      })
      .finally(() => {
        if (active) setDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, company, selected, revision]);
  async function mutate(fingerprint: string, operation: (key: string) => Promise<HrCorrectionResult>) {
    if (mutation.current) throw Error("A correction is already being saved.");
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await operation(retry.current.key);
      retry.current = null;
      setEditor(null);
      setSelected(result.id);
      setNotice(`${result.reference} · ${label(result.status)} · version ${result.version}`);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(fail(e));
      throw e;
    } finally {
      mutation.current = false;
      setBusy(false);
    }
  }
  const view = () =>
    onNavigate(
      "hr",
      "daily-attendance",
      JSON.stringify({ company_id: company, on_date: detail!.work_date, search: detail!.employee_number }),
    );
  if (sessionLoading) return <Skeleton className="h-64 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Correction access required</AlertTitle>
        <AlertDescription>Your role needs attendance correction read permission.</AlertDescription>
      </Alert>
    );
  const openRow = (id: string) => {
    if (busy || editor) return;
    setSelected(id);
    setDetail(null);
    setError("");
  };
  return (
    <section
      aria-label="Attendance corrections workspace"
      className="grid min-w-0 gap-4 font-sans text-foreground [&_label]:gap-1.5 [&_label]:leading-tight [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Correction action unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <div role="status" className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm">
          {notice}
        </div>
      )}
      {!companyLoading && companies?.length === 0 ? (
        <Alert>
          <AlertTitle>Company access required</AlertTitle>
          <AlertDescription>Company access must be granted before attendance corrections can be reviewed.</AlertDescription>
        </Alert>
      ) : null}
      <WorkForm
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[0.7fr_1fr_auto] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Request status
          <select
            className={selectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            {["draft", "pending_manager", "pending_hr", "approved", "rejected", "cancelled"].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Search corrections
          <Input
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference, employee number or name"
          />
        </label>
        {canCreate ? (
          <div className="flex items-end">
            <Button
              type="button"
              className="w-full text-primary-foreground! xl:w-auto"
              disabled={!company || busy || !!editor}
              onClick={() => {
                setError("");
                setNotice("");
                setEditor({ initial: null, key: Date.now() });
              }}
            >
              <Plus className="size-4" />
              New correction
            </Button>
          </div>
        ) : null}
      </WorkForm>
      {editor && (
        <HrRecordDrawer
          title={editor?.initial ? "Edit attendance correction" : "Add attendance correction"}
          open={!!editor}
          onClose={() => setEditor(null)}
          busy={busy}
          error={error}
          notice={notice}
        >
          <Editor
            key={editor.key}
            client={client}
            companyId={company}
            initial={editor.initial}
            prefill={editor.initial ? undefined : editor.prefill}
            revision={revision}
            busy={busy}
            onSave={(id, input) =>
              mutate(JSON.stringify({ id, input }), (key) =>
                id
                  ? client.updateCorrection(id, input as UpdateHrCorrectionRequest, csrfToken(), key)
                  : client.createCorrection(input as CreateHrCorrectionRequest, csrfToken(), key),
              )
            }
          />
        </HrRecordDrawer>
      )}
      {loading ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-5" aria-label="Loading corrections">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data.items.length ? (
        <>
          <div className="hidden min-w-0 overflow-hidden rounded-xl border border-border bg-card md:block">
            <div className="max-h-[38rem] overflow-auto">
              <WorkTable paging={false} tableId="app/features/hr/views/hr-attendance-corrections-workspace:1" className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    {["Reference / employee", "Working date", "Type", "Requested by", "Status"].map((h) => (
                      <th scope="col" key={h} className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <HrClickableRow key={row.id} disabled={busy || !!editor} onOpen={() => openRow(row.id)}>
                      <td className="px-4 py-3">
                        <strong className="block">{row.reference}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.employee_number} · {row.display_name}
                        </span>
                      </td>
                      <td className="px-4 py-3">{row.work_date}</td>
                      <td className="px-4 py-3">{label(row.kind)}</td>
                      <td className="px-4 py-3">{row.requested_by_name}</td>
                      <td className="px-4 py-3">
                        <Status value={row.status} />
                        {!row.workflow_managed && (
                          <span className="mt-1 block text-xs text-muted-foreground">Legacy evidence</span>
                        )}
                      </td>
                    </HrClickableRow>
                  ))}
                </tbody>
              </WorkTable>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {data.items.map((row) => (
              <div
                key={row.id}
                role="button"
                tabIndex={0}
                aria-label={`Open ${row.reference}`}
                onClick={() => openRow(row.id)}
                onKeyDown={(e) => {
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    openRow(row.id);
                  }
                }}
                className="grid min-w-0 cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="break-all text-sm font-semibold">{row.reference}</h3>
                  <Status value={row.status} />
                </div>
                <p className="text-sm">{row.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.employee_number} · {row.work_date} · {label(row.kind)}
                </p>
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border border-border bg-card px-5 py-12 text-center">
          <ClipboardCheck className="size-8 text-muted-foreground" />
          <h3 className="font-semibold">No correction requests found</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            Create a draft for an eligible employee, or adjust the filters.
          </p>
        </div>
      )}
      <WorkOffsetPagination
        busy={loading}
        total={data.total}
        offset={offset}
        size={workPageSize}
        previousDisabled={loading || offset === 0}
        nextDisabled={loading || offset + workPageSize >= data.total}
        onSizeChange={(size) => {
          setWorkPageSize(size);
          setOffset(0);
        }}
        onPrevious={() => setOffset((v) => Math.max(0, v - workPageSize))}
        onNext={() => setOffset((v) => v + workPageSize)}
      />
      <HrRecordDrawer
        title={detail?.reference ?? "Attendance correction"}
        open={!!selected && !editor}
        onClose={() => {
          setSelected("");
          setDetail(null);
        }}
        busy={busy}
        error={error}
        notice={notice}
        footer={
          detail ? (
            <>
              {detail.allowed_actions.includes("cancel") && (
                <HrConfirmDeleteButton
                  label="Cancel draft"
                  title={`Cancel ${detail.reference}?`}
                  description="The draft is cancelled and kept in history. It does not change attendance."
                  confirmLabel="Cancel draft"
                  variant="outline"
                  disabled={busy}
                  onConfirm={async () => {
                    const input = hrCorrectionActionRequestSchema.parse({
                      company_id: detail.company_id,
                      expected_version: detail.version,
                      action: "cancel",
                      reason: "",
                      expected_evidence_hash: detail.evidence?.hash ?? null,
                      override_self_approval: false,
                    });
                    try {
                      await mutate(JSON.stringify({ id: detail.id, input }), (key) =>
                        client.correctionAction(detail.id, input, csrfToken(), key),
                      );
                      return true;
                    } catch {
                      return false;
                    }
                  }}
                />
              )}
              {detail.can_edit && (
                <HrEditButton
                  label="Edit draft"
                  disabled={busy}
                  onClick={() => setEditor({ initial: detail, key: Date.now() })}
                />
              )}
            </>
          ) : null
        }
      >
        {detailLoading || !detail ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <section aria-label="Correction request detail" className="grid min-w-0 gap-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <p className="m-0 text-xs text-muted-foreground">
                {detail.employee_number} · {detail.display_name} · {detail.work_date} · version {detail.version}
              </p>
              <Status value={detail.status} />
            </div>
            <dl className="m-0 grid gap-3 sm:grid-cols-2">
              {[
                ["Correction type", label(detail.kind)],
                ["Check in", displayTime(detail.stated_in, detail.evidence?.day.time_zone ?? null)],
                ["Check out", displayTime(detail.stated_out, detail.evidence?.day.time_zone ?? null)],
                ["Routed manager", detail.manager_name ?? "Assigned on submission"],
              ].map(([name, value]) => (
                <div key={name} className="min-w-0 rounded-lg border border-border bg-background p-3">
                  <dt className="text-xs text-muted-foreground">{name}</dt>
                  <dd className="m-0 mt-1 break-words text-sm font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="whitespace-pre-wrap break-words rounded-lg border border-border bg-background p-4 text-sm">
              {detail.reason}
            </p>
            {detail.evidence_unavailable && <p className="text-sm text-destructive">{detail.evidence_unavailable}</p>}
            {detail.evidence && <Evidence value={detail.evidence} />}
            {detail.evidence_changed && (
              <p className="rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-3 text-sm text-[var(--nx-warning)]!">
                Current evidence differs from the previous workflow step.
              </p>
            )}
            {session?.user.permissions.includes("hr.attendance.read") && (
              <Button variant="outline" className="justify-self-start" onClick={view}>
                Open daily evidence
                <ArrowUpRight className="size-4" />
              </Button>
            )}
            <Decisions
              key={`${detail.id}:${detail.version}`}
              detail={detail}
              busy={busy}
              onAction={(input) =>
                mutate(JSON.stringify({ id: detail.id, input }), (key) =>
                  client.correctionAction(detail.id, input, csrfToken(), key),
                )
              }
            />
            <div>
              <h3 className="text-sm font-semibold">Workflow history</h3>
              {detail.history.length ? (
                <ol className="m-0 mt-3 grid list-none gap-3 p-0">
                  {detail.history.map((event) => (
                    <li key={event.id} className="grid gap-1 rounded-lg border border-border bg-background p-3">
                      <strong className="text-sm">
                        {label(event.action)} · version {event.version}
                      </strong>
                      <span className="text-xs text-muted-foreground">
                        {event.actor_name} · {new Date(event.occurred_at).toLocaleString()}
                      </span>
                      <p className="whitespace-pre-wrap break-words text-sm">{event.reason}</p>
                      {event.override_event_id && (
                        <span className="text-xs text-[var(--nx-warning)]">Super-administrator override recorded</span>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">No workflow events recorded.</p>
              )}
            </div>
          </section>
        )}
      </HrRecordDrawer>
    </section>
  );
}
