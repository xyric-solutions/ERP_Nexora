"use client";
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
import {
  ClipboardCheck,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
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
  offset,
  disabled,
  onValue,
  onOffset,
}: {
  name: string;
  value: string;
  offset: string;
  disabled: boolean;
  onValue: (v: string) => void;
  onOffset: (v: string) => void;
}) {
  return (
    <div className="grid min-w-0 gap-2">
      <label className="grid min-w-0 gap-2 text-sm font-medium">
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
      <label className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {name} UTC offset
        <Input
          required
          aria-label={`${name} UTC offset`}
          className="w-28"
          pattern="[+-](0[0-9]|1[0-4]):[0-5][0-9]"
          value={offset}
          disabled={disabled}
          onChange={(e) => onOffset(e.target.value)}
          placeholder="+05:00"
        />
      </label>
    </div>
  );
}
function Editor({
  client,
  companyId,
  initial,
  revision,
  busy,
  onSave,
  onClose,
}: {
  client: HrApiClient;
  companyId: string;
  initial: HrCorrectionDetail | null;
  revision: number;
  busy: boolean;
  onSave: (id: string | null, input: CreateHrCorrectionRequest | UpdateHrCorrectionRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [date, setDate] = useState(initial?.work_date ?? today()),
    [employee, setEmployee] = useState(initial?.employee_id ?? ""),
    [kind, setKind] = useState<CreateHrCorrectionRequest["kind"]>(initial?.kind ?? "missing_out"),
    [reason, setReason] = useState(initial?.reason ?? ""),
    [version] = useState(initial?.version),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [inOffset, setInOffset] = useState("+00:00"),
    [outOffset, setOutOffset] = useState("+00:00"),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState("");
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
          setInOffset(utcOffset(initial?.stated_in ?? value.evidence.day.scheduled_start, zone));
          setOutOffset(utcOffset(initial?.stated_out ?? value.evidence.day.scheduled_end, zone));
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
    blocked = !evidence || !!evidence.blockers.length || loading;
  const iso = (value: string, offset: string) =>
    value ? `${value.length === 16 ? value + ":00" : value}${offset}` : null;
  return (
    <form
      aria-label="Correction draft editor"
      className="grid min-w-0 gap-5 rounded-xl border border-primary/25 bg-card p-4 sm:p-6"
      onSubmit={async (e) => {
        e.preventDefault();
        const terms = {
          company_id: companyId,
          kind,
          stated_in: kind === "missing_in" || kind === "incorrect_attendance" ? iso(start, inOffset) : null,
          stated_out: kind === "missing_out" || kind === "incorrect_attendance" ? iso(end, outOffset) : null,
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{initial ? `Edit ${initial.reference}` : "New attendance correction"}</h2>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          Close editor
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Review correction details</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <label className="grid min-w-0 gap-2 text-sm font-medium">
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
        <label className="grid min-w-0 gap-2 text-sm font-medium">
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
      </div>
      {!initial && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">
            Find employee
            <Input
              maxLength={160}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name or employee number"
            />
          </label>
          <Button type="button" variant="outline" disabled={busy || loading} onClick={() => setApplied(search.trim())}>
            Find
          </Button>
        </div>
      )}
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        Employee
        <select
          required
          className={selectClass}
          disabled={busy || loading || !!initial}
          value={employee}
          onChange={(e) => {
            setEmployee(e.target.value);
            initialized.current = false;
          }}
        >
          <option value="">Select an operational employee</option>
          {employee && !context?.employees.some((v) => v.id === employee) && (
            <option value={employee}>{initial?.display_name ?? "Selected employee"}</option>
          )}
          {context?.employees.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </label>
      {context?.employees_capped && (
        <p className="text-xs text-muted-foreground">Showing the first 100 employees. Search to narrow the choices.</p>
      )}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : evidence ? (
        <Evidence value={evidence} />
      ) : (
        <p className="text-sm text-muted-foreground">
          Choose an employee to load the effective shift and current attendance evidence.
        </p>
      )}
      {kind !== "official_duty" && (
        <div className="grid min-w-0 gap-4 sm:grid-cols-2">
          {(kind === "missing_in" || kind === "incorrect_attendance") && (
            <TimestampField
              name="Stated in"
              value={start}
              offset={inOffset}
              disabled={busy}
              onValue={setStart}
              onOffset={setInOffset}
            />
          )}
          {(kind === "missing_out" || kind === "incorrect_attendance") && (
            <TimestampField
              name="Stated out"
              value={end}
              offset={outOffset}
              disabled={busy}
              onValue={setEnd}
              onOffset={setOutOffset}
            />
          )}
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        Enter local times in {evidence?.day.time_zone ?? "the employee's effective shift timezone"} with the matching
        UTC offset. Overnight out punches use the following date. An official-duty request supplies no device
        timestamps.
      </p>
      <label className="grid gap-2 text-sm font-medium">
        Correction reason
        <Textarea
          required
          minLength={8}
          maxLength={1000}
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the missing or incorrect evidence and why this correction is needed"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="text-primary-foreground!" disabled={busy || blocked}>
          {busy ? "Saving…" : initial ? "Save draft changes" : "Save correction draft"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel editing
        </Button>
      </div>
    </form>
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
    [reason, setReason] = useState(""),
    [override, setOverride] = useState(false),
    [error, setError] = useState("");
  if (!detail.allowed_actions.length) return null;
  const decision = action.includes("approve") || action.includes("reject");
  return (
    <form
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
      <label className="grid gap-2 text-sm font-medium">
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
          {detail.allowed_actions.map((a) => (
            <option key={a} value={a}>
              {label(a)}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2 text-sm font-medium">
        Action reason
        <Textarea
          required
          rows={3}
          minLength={8}
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
    </form>
  );
}
export function HrAttendanceCorrectionsWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    canRead = session?.user.permissions.includes("hr.attendance.correction.read") ?? false,
    canCreate = session?.user.permissions.includes("hr.attendance.correction.create") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState(""),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState("");
  const [data, setData] = useState<HrCorrectionDirectory>({ items: [], total: 0 }),
    [detail, setDetail] = useState<HrCorrectionDetail | null>(null),
    [editor, setEditor] = useState<{ initial: HrCorrectionDetail | null; key: number } | null>(null),
    [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
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
        limit: 50,
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
  }, [client, company, canRead, status, applied, offset, revision]);
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
  const review = (id: string, reference: string) => (
    <Button
      variant="outline"
      size="sm"
      disabled={busy || !!editor}
      aria-label={`Review ${reference}`}
      onClick={() => {
        setSelected(id);
        setDetail(null);
        setError("");
      }}
    >
      Review
    </Button>
  );
  return (
    <section
      aria-label="Attendance corrections workspace"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-3 text-primary">
            <ClipboardCheck className="size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">Correct the day. Preserve the evidence.</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              A traceable request moves from the owner to their reporting manager and then HR.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={loading || companyLoading || busy}
            onClick={() => {
              setError("");
              setRevision((v) => v + 1);
            }}
          >
            <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          {canCreate && (
            <Button
              className="text-primary-foreground!"
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
          )}
        </div>
      </div>
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
      <form
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_0.7fr_1fr_auto] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Company
          <select
            aria-label="Company"
            className={selectClass}
            value={company}
            disabled={companyLoading || busy || !!editor}
            onChange={(e) => {
              setCompany(e.target.value);
              setOffset(0);
              setData({ items: [], total: 0 });
              setSelected("");
              setDetail(null);
              setNotice("");
              setError("");
            }}
          >
            {!companies.length && (
              <option value="">{companyLoading ? "Loading companies…" : "No authorized company"}</option>
            )}
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
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
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Search corrections
          <Input
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Reference, employee number or name"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" className="text-primary-foreground!" disabled={loading || !company}>
            <Search className="size-4" />
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch("");
              setApplied("");
              setStatus("");
              setOffset(0);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { name: "Requests in this page", value: data.items.length, icon: ClipboardCheck },
          {
            name: "Awaiting decisions",
            value: data.items.filter((r) => r.status.startsWith("pending")).length,
            icon: Clock3,
          },
          {
            name: "Approved corrections",
            value: data.items.filter((r) => r.status === "approved").length,
            icon: ShieldCheck,
          },
          { name: "Raw punch edits", value: 0, icon: ShieldCheck },
        ].map(({ name, value, icon: Icon }) => (
          <div key={name} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Icon className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">{name}</p>
              <div className="mt-1 text-xl font-semibold tabular-nums">{loading ? "—" : value}</div>
            </div>
          </div>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        Counts describe the current page. {data.total} requests match the company and filters.
      </p>
      {editor && (
        <Editor
          key={editor.key}
          client={client}
          companyId={company}
          initial={editor.initial}
          revision={revision}
          busy={busy}
          onClose={() => setEditor(null)}
          onSave={(id, input) =>
            mutate(JSON.stringify({ id, input }), (key) =>
              id
                ? client.updateCorrection(id, input as UpdateHrCorrectionRequest, csrfToken(), key)
                : client.createCorrection(input as CreateHrCorrectionRequest, csrfToken(), key),
            )
          }
        />
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
              <table className="w-full min-w-[1000px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    {["Reference / employee", "Working date", "Type", "Requested by", "Status", ""].map((h, i) => (
                      <th scope="col" key={i} className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {h || <span className="sr-only">Actions</span>}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr
                      key={row.id}
                      className={`border-t border-border hover:bg-muted/40 ${selected === row.id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-4">
                        <strong className="block">{row.reference}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">
                          {row.employee_number} · {row.display_name}
                        </span>
                      </td>
                      <td className="px-4 py-4">{row.work_date}</td>
                      <td className="px-4 py-4">{label(row.kind)}</td>
                      <td className="px-4 py-4">{row.requested_by_name}</td>
                      <td className="px-4 py-4">
                        <Status value={row.status} />
                        {!row.workflow_managed && (
                          <span className="mt-1 block text-xs text-muted-foreground">Legacy evidence</span>
                        )}
                      </td>
                      <td className="px-4 py-4">{review(row.id, row.reference)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {data.items.map((row) => (
              <article key={row.id} className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <h3 className="break-all text-sm font-semibold">{row.reference}</h3>
                  <Status value={row.status} />
                </div>
                <p className="text-sm">{row.display_name}</p>
                <p className="text-xs text-muted-foreground">
                  {row.employee_number} · {row.work_date} · {label(row.kind)}
                </p>
                {review(row.id, row.reference)}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border border-border bg-card px-5 py-12 text-center">
          <ClipboardCheck className="size-8 text-muted-foreground" />
          <h3 className="font-semibold">No correction requests found</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            Create a draft for an eligible employee, or adjust the company and filters.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {data.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total}` : "0 results"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || offset === 0}
            onClick={() => setOffset((v) => Math.max(0, v - 50))}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={loading || offset + 50 >= data.total}
            onClick={() => setOffset((v) => v + 50)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {!editor &&
        (detailLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          detail && (
            <section
              aria-label="Correction request detail"
              className="grid min-w-0 gap-5 rounded-xl border border-primary/25 bg-card p-4 sm:p-6"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="break-all text-lg font-semibold">{detail.reference}</h2>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {detail.employee_number} · {detail.display_name} · {detail.work_date} · version {detail.version}
                  </p>
                </div>
                <Status value={detail.status} />
              </div>
              <dl className="m-0 grid gap-3 sm:grid-cols-2">
                {[
                  ["Correction type", label(detail.kind)],
                  ["Stated in", displayTime(detail.stated_in, detail.evidence?.day.time_zone ?? null)],
                  ["Stated out", displayTime(detail.stated_out, detail.evidence?.day.time_zone ?? null)],
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
                  Current evidence differs from the previous workflow step. Review it before deciding.
                </p>
              )}
              {!detail.workflow_managed && (
                <p className="text-sm text-muted-foreground">Legacy request retained as read-only evidence.</p>
              )}
              {detail.status === "draft" && !detail.evidence?.manager_user_id && (
                <p className="text-sm text-muted-foreground">
                  Submission needs an effective reporting manager with an active user binding and company access.
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {detail.can_edit && !editor && (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => setEditor({ initial: detail, key: Date.now() })}
                  >
                    Edit draft
                  </Button>
                )}
                {session?.user.permissions.includes("hr.attendance.read") && (
                  <Button variant="outline" onClick={view}>
                    Open daily evidence
                    <ArrowUpRight className="size-4" />
                  </Button>
                )}
              </div>
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
                  <ol className="m-0 mt-3 grid max-h-96 list-none gap-3 overflow-auto p-0">
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
                          <span className="text-xs text-[var(--nx-warning)]">
                            Super-administrator override recorded
                          </span>
                        )}
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="mt-2 text-xs text-muted-foreground">
                    No governed workflow events exist for this legacy record.
                  </p>
                )}
              </div>
            </section>
          )
        ))}
      <p className="rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        Draft → reporting manager → HR. Only the final approved correction contributes to attendance. Raw punches remain
        immutable; this workflow does not approve overtime or post payroll. Locked attendance periods cannot be changed.
      </p>
    </section>
  );
}
