"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createHrShiftAllocationRequestSchema,
  closeHrShiftAllocationRequestSchema,
  type CreateHrShiftAllocationRequest,
  type CloseHrShiftAllocationRequest,
  type HrShiftAllocationSummary,
  type HrShiftAllocationDetail,
  type HrShiftAllocationDirectory,
  type HrShiftAllocationContext,
  type HrShiftSummary,
  type HrShiftResolution,
} from "@nexora/contracts";
import { CalendarClock, Plus, RefreshCw, Search, CheckCircle2, ShieldCheck, ArrowRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
type Scope = CreateHrShiftAllocationRequest["scope"];
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const label = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const todayValue = () => new Date().toISOString().slice(0, 10);
const shiftDay = (d: string, n: number) =>
  new Date(Date.parse(d + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
const time = (m: number) =>
  `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fail = (e: unknown) =>
  e instanceof ApiError ? e.message : "The shift assignment could not be loaded or saved. Please retry.";
function Fact({ name, value }: { name: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-3">
      <dt className="text-xs text-muted-foreground">{name}</dt>
      <dd className="m-0 mt-1 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

function TargetPicker({
  client,
  companyId,
  scope,
  onDate,
  value,
  disabled,
  revision,
  onChange,
}: {
  client: HrApiClient;
  companyId: string;
  scope: Scope;
  onDate: string;
  value: string;
  disabled: boolean;
  revision: number;
  onChange: (id: string) => void;
}) {
  const [data, setData] = useState<HrShiftAllocationContext | null>(null),
    [search, setSearch] = useState(""),
    [query, setQuery] = useState(""),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const remembered = useRef<{ id: string; name: string } | null>(null);
  useEffect(() => {
    if (!onDate) return;
    let current = true;
    setLoading(true);
    setError("");
    setData(null);
    client
      .shiftAllocationContext({ companyId, scope, onDate, search: query || undefined })
      .then((result) => {
        if (current) {
          setData(result);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, companyId, scope, onDate, query, revision]);
  return (
    <div className="grid min-w-0 gap-3">
      <label className="grid min-w-0 gap-2 text-sm font-medium">
        {label(scope)}
        <select
          required
          className={selectClass}
          value={value}
          disabled={disabled || loading}
          onChange={(e) => {
            remembered.current = {
              id: e.target.value,
              name: data?.targets.find((t) => t.id === e.target.value)?.name ?? "Selected target",
            };
            onChange(e.target.value);
          }}
        >
          <option value="">Select an authorized {scope}</option>
          {value && !data?.targets.some((t) => t.id === value) && (
            <option value={value}>
              {remembered.current?.id === value ? remembered.current.name : "Selected target"} (review dates)
            </option>
          )}
          {data?.targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name} ({t.code})
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap items-end gap-2">
        <label className="grid min-w-0 flex-1 gap-2 text-xs text-muted-foreground">
          Find {scope}
          <Input
            value={search}
            maxLength={160}
            disabled={disabled}
            placeholder="Name or code"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button type="button" variant="outline" disabled={disabled || loading} onClick={() => setQuery(search.trim())}>
          Find target
        </Button>
      </div>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {data?.capped && (
        <p className="text-xs text-muted-foreground">
          Showing 100 matches. Refine the target search to find another record.
        </p>
      )}
      {data && !data.targets.length && (
        <p className="text-xs text-muted-foreground">
          No matching {scope} is available on this date. Employee choices require approved operational employment.
        </p>
      )}
    </div>
  );
}

function AllocationEditor({
  client,
  today,
  companyId,
  busy,
  revision,
  onSave,
  onClose,
}: {
  client: HrApiClient;
  today: string;
  companyId: string;
  busy: boolean;
  revision: number;
  onSave: (input: CreateHrShiftAllocationRequest) => Promise<void>;
  onClose: () => void;
}) {
  const [scope, setScope] = useState<Scope>("employee"),
    [target, setTarget] = useState(""),
    [from, setFrom] = useState(today),
    [to, setTo] = useState(""),
    [shiftId, setShiftId] = useState(""),
    [reason, setReason] = useState("");
  const [options, setOptions] = useState<HrShiftSummary[]>([]),
    [total, setTotal] = useState(0),
    [offset, setOffset] = useState(0),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [current, setCurrent] = useState<HrShiftAllocationSummary | null>(null),
    [currentLoading, setCurrentLoading] = useState(false),
    [replacement, setReplacement] = useState<{ id: string; version: number } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    client
      .shifts({ companyId, status: "active", limit: 100, offset })
      .then((result) => {
        if (active) {
          setOptions((values) =>
            offset
              ? Array.from(new Map([...values, ...result.items].map((item) => [item.id, item])).values())
              : result.items,
          );
          setTotal(result.total);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, companyId, offset, revision]);
  useEffect(() => {
    if (!target || !from) {
      setCurrent(null);
      return;
    }
    let active = true;
    setCurrentLoading(true);
    client
      .shiftAllocations({ companyId, scope, scopeId: target, onDate: from, limit: 10 })
      .then((result) => {
        if (active) {
          setCurrent(result.items[0] ?? null);
          setCurrentLoading(false);
        }
      })
      .catch((e) => {
        if (active) {
          setError(fail(e));
          setCurrentLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [client, companyId, scope, target, from, revision]);
  const eligible = options.filter((s) => s.configured && (scope === "employee" || s.work_location_id === null));
  const submit = () => {
    const result = createHrShiftAllocationRequestSchema.safeParse({
      company_id: companyId,
      scope,
      scope_id: target,
      shift_id: shiftId,
      effective_from: from,
      effective_to: to || null,
      reason,
      replace_assignment_id: replacement?.id ?? null,
      expected_replace_version: replacement?.version ?? null,
    });
    if (!result.success) {
      setError(
        result.error.issues
          .slice(0, 3)
          .map((i) => i.message)
          .join(" "),
      );
      return;
    }
    if (current && !replacement) {
      setError(
        "An assignment already covers the start date. Explicitly choose replacement, or use a different interval.",
      );
      return;
    }
    setError("");
    void onSave(result.data);
  };
  return (
    <form
      aria-label="Shift assignment editor"
      className="grid min-w-0 gap-5 rounded-xl border border-primary/30 bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">New allocation</div>
          <h2 className="mt-1 text-lg font-semibold">Set an effective working arrangement</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Employee overrides take priority over department defaults, then branch defaults. Existing intervals are
            retained when replaced.
          </p>
        </div>
        <Button
          type="button"
          aria-label="Close assignment editor"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Review the assignment</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="grid gap-2 text-sm font-medium">
          Allocation scope
          <select
            className={selectClass}
            value={scope}
            disabled={busy}
            onChange={(e) => {
              setScope(e.target.value as Scope);
              setTarget("");
              setShiftId("");
              setCurrent(null);
              setReplacement(null);
            }}
          >
            {["employee", "department", "branch"].map((s) => (
              <option value={s} key={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Effective from
          <Input
            required
            type="date"
            value={from}
            disabled={busy}
            onChange={(e) => {
              setFrom(e.target.value);
              setReplacement(null);
            }}
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Effective to (optional)
          <Input type="date" min={from} value={to} disabled={busy} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>
      <TargetPicker
        client={client}
        companyId={companyId}
        scope={scope}
        onDate={from}
        value={target}
        disabled={busy}
        revision={revision}
        onChange={(id) => {
          setTarget(id);
          setReplacement(null);
          setCurrent(null);
        }}
      />
      <label className="grid gap-2 text-sm font-medium">
        Configured shift
        <select
          required
          className={selectClass}
          value={shiftId}
          disabled={busy || loading}
          onChange={(e) => setShiftId(e.target.value)}
        >
          <option value="">Select an active shift</option>
          {eligible.map((s) => (
            <option key={s.id} value={s.id}>
              {s.code} · {s.name} · {s.work_location ?? "Company-wide"}
            </option>
          ))}
        </select>
      </label>
      {options.length < total && (
        <Button
          type="button"
          variant="outline"
          className="justify-self-start"
          disabled={busy || loading}
          onClick={() => setOffset(options.length)}
        >
          Load more shifts
        </Button>
      )}
      {!eligible.length && !loading && (
        <p className="text-sm text-muted-foreground">
          No configured shift is available for this scope. Create one in Shifts &amp; Rules first.
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        {scope === "employee"
          ? "Approved employment must cover the entire interval. A site-specific shift must match the employee’s effective work location throughout it."
          : "Branch and department defaults use company-wide shifts. Use an employee override for site-specific arrangements."}{" "}
        New allocations start today or later; locked attendance periods stay protected.
      </p>
      {current && (
        <div className="grid gap-3 rounded-lg border border-primary/25 bg-primary/5 p-4">
          <div className="text-sm">
            <strong>{current.reference}</strong> · {current.shift_code} currently covers this start date (
            {current.effective_from} → {current.effective_to ?? "open-ended"}).
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={replacement?.id === current.id}
              disabled={busy || currentLoading}
              onCheckedChange={(checked) =>
                setReplacement(checked ? { id: current.id, version: current.version } : null)
              }
            />
            Replace this allocation from {from}. Preserve its previous interval and audit history.
          </label>
        </div>
      )}
      <label className="grid gap-2 text-sm font-medium">
        Allocation reason
        <Textarea
          required
          minLength={8}
          maxLength={1000}
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain this employee arrangement or organisational default"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          className="text-primary-foreground!"
          disabled={busy || loading || currentLoading || !target || !shiftId}
        >
          {busy ? "Saving…" : replacement ? "Replace assignment" : "Create assignment"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function EndAllocation({
  detail,
  today,
  busy,
  onSave,
}: {
  detail: HrShiftAllocationDetail;
  today: string;
  busy: boolean;
  onSave: (id: string, input: CloseHrShiftAllocationRequest) => Promise<void>;
}) {
  const [action, setAction] = useState<"close" | "cancel">("close"),
    [end, setEnd] = useState(detail.effective_to ?? (detail.effective_from > today ? detail.effective_from : today)),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  if (["ended", "cancelled"].includes(detail.state)) return null;
  return (
    <form
      aria-label="End shift assignment"
      className="grid gap-4 rounded-xl border border-border bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const result = closeHrShiftAllocationRequestSchema.safeParse({
          company_id: detail.company_id,
          expected_version: detail.version,
          action,
          effective_to: action === "close" ? end : null,
          reason,
        });
        if (!result.success) {
          setError(result.error.issues.map((i) => i.message).join(" "));
          return;
        }
        setError("");
        void onSave(detail.id, result.data);
      }}
    >
      <h3 className="text-base font-semibold">End or cancel the allocation</h3>
      <p className="text-sm text-muted-foreground">
        Closing shortens the interval without replacing history. Cancellation is available only for an allocation that
        has not started before today. Lower-priority defaults may then apply; check the employee preview.
      </p>
      {error && (
        <p role="status" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          End action
          <select
            className={selectClass}
            value={action}
            disabled={busy}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            <option value="close">Close on a date</option>
            {detail.effective_from >= today && <option value="cancel">Cancel unstarted allocation</option>}
          </select>
        </label>
        {action === "close" && (
          <label className="grid gap-2 text-sm font-medium">
            Last allocated day
            <Input
              required
              type="date"
              min={detail.effective_from > shiftDay(today, -1) ? detail.effective_from : shiftDay(today, -1)}
              value={end}
              disabled={busy}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
        )}
      </div>
      <label className="grid gap-2 text-sm font-medium">
        End reason
        <Textarea
          required
          minLength={8}
          maxLength={1000}
          rows={2}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button
        type="submit"
        variant="outline"
        className="justify-self-start"
        disabled={busy || reason.trim().length < 8}
      >
        {busy ? "Saving…" : action === "cancel" ? "Cancel allocation" : "Close allocation"}
      </Button>
    </form>
  );
}

function EmployeePreview({
  client,
  companyId,
  revision,
}: {
  client: HrApiClient;
  companyId: string;
  revision: number;
}) {
  const [date, setDate] = useState(todayValue),
    [employee, setEmployee] = useState(""),
    [result, setResult] = useState<HrShiftResolution | null>(null),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!employee || !date) {
      setResult(null);
      return;
    }
    let current = true;
    setLoading(true);
    setError("");
    client
      .resolveShift({ companyId, employeeId: employee, onDate: date })
      .then((data) => {
        if (current) {
          setResult(data);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setResult(null);
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, companyId, date, employee, revision]);
  const shift = result?.resolved_shift;
  const weeklyOff = shift?.weekly_off_days.includes(new Date(date + "T00:00:00Z").getUTCDay());
  return (
    <section
      aria-label="Employee shift preview"
      className="grid min-w-0 gap-5 rounded-xl border border-border bg-card p-5"
    >
      <div>
        <h2 className="text-lg font-semibold">Which shift applies?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Resolve the approved employee placement and effective roster for a working date. This preview does not record
          attendance or approve payroll.
        </p>
      </div>
      <label className="grid gap-2 text-sm font-medium">
        Working date
        <Input required type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <TargetPicker
        client={client}
        companyId={companyId}
        scope="employee"
        onDate={date}
        value={employee}
        disabled={loading}
        revision={revision}
        onChange={setEmployee}
      />
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Preview unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {loading ? (
        <Skeleton className="h-40 w-full" />
      ) : result ? (
        <>
          <div className="flex flex-wrap items-start justify-between gap-3 rounded-lg border border-primary/20 bg-primary/5 p-4">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-primary">
                {result.employee.employee_number} · {result.on_date}
              </div>
              <h3 className="mt-1 text-lg font-semibold">{result.employee.display_name}</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {shift ? `${shift.code} · ${shift.name}` : "Review the allocation blockers below"}
              </p>
            </div>
            <Badge variant="secondary">
              {shift ? (weeklyOff ? "Weekly off day" : "Working shift") : "Needs attention"}
            </Badge>
          </div>
          {result.blockers.length > 0 && (
            <div role="status" className="grid gap-2 rounded-lg border border-border bg-muted/40 p-4 text-sm">
              {result.blockers.map((b) => (
                <p key={b}>{b}</p>
              ))}
            </div>
          )}
          <div>
            <h3 className="text-sm font-semibold">Assignment priority</h3>
            <ol className="m-0 mt-3 grid list-none gap-3 p-0">
              {result.contenders.map((a, i) => (
                <li
                  key={a.id}
                  className={`rounded-lg border p-4 ${i === 0 ? "border-primary/30 bg-primary/5" : "border-border bg-background"}`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">
                      {i + 1}. {label(a.scope)} · {a.scope_name}
                    </span>
                    <Badge variant={i === 0 ? "secondary" : "outline"}>
                      {i === 0 ? "Highest priority" : "Fallback"}
                    </Badge>
                  </div>
                  <p className="mt-2 text-sm">
                    {a.shift_code} · {a.shift_name}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {a.reference} · {a.effective_from} → {a.effective_to ?? "open-ended"}
                  </p>
                </li>
              ))}
            </ol>
          </div>
          {shift && (
            <dl className="m-0 grid gap-3 sm:grid-cols-2">
              <Fact
                name="Resolved working window"
                value={`${time(shift.start_minute)}–${time(shift.end_minute)}${shift.end_minute >= 1440 ? " (following day)" : ""}`}
              />
              <Fact
                name="Timezone / work location"
                value={`${shift.time_zone} / ${shift.work_location ?? "Company-wide"}`}
              />
              <Fact name="Required work" value={`${shift.required_work_minutes} minutes`} />
              <Fact
                name="Absent / half-day thresholds"
                value={`${shift.minimum_present_minutes} / ${shift.half_day_minutes} minutes`}
              />
              <Fact
                name="Arrival / departure grace"
                value={
                  shift.kind === "flexible"
                    ? "Flexible duration"
                    : `${shift.grace_in_minutes} / ${shift.grace_out_minutes} minutes`
                }
              />
              <Fact
                name="Overtime eligibility buffer"
                value={`${shift.overtime_after_minutes} minutes; separate approval required`}
              />
            </dl>
          )}
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border p-5 text-sm text-muted-foreground">
          Select an employee and working date to view the effective shift and its source.
        </p>
      )}
    </section>
  );
}

export function HrShiftAssignmentsWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, csrfToken, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.shift.read") ?? false,
    canManage = session?.user.permissions.includes("hr.attendance.shift.manage") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState(""),
    [today, setToday] = useState(todayValue);
  const [items, setItems] = useState<HrShiftAllocationDirectory>({ items: [], total: 0 }),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState<HrShiftAllocationDetail | null>(null);
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [scope, setScope] = useState(""),
    [state, setState] = useState(""),
    [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState(false),
    [view, setView] = useState<"register" | "preview">("register"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [revision, setRevision] = useState(0);
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!canRead) return;
    let current = true;
    setLoading(true);
    client
      .companies()
      .then((data) => {
        if (current) {
          setCompanies(data.items);
          setCompany((value) => (data.items.some((c) => c.id === value) ? value : (data.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, canRead, revision]);
  useEffect(() => {
    if (!company || !canRead) return;
    let current = true;
    setLoading(true);
    client
      .shiftAllocations({
        companyId: company,
        search: applied || undefined,
        scope: (scope as Scope) || undefined,
        state: state || undefined,
        offset,
      })
      .then((data) => {
        if (current) {
          setItems(data);
          setSelected((value) => (data.items.some((a) => a.id === value) ? value : (data.items[0]?.id ?? "")));
          setLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setLoading(false);
        }
      });
    client
      .shiftAllocationContext({ companyId: company, scope: "branch", onDate: todayValue() })
      .then((data) => {
        if (current) setToday(data.today);
      })
      .catch((e) => {
        if (current) setError(fail(e));
      });
    return () => {
      current = false;
    };
  }, [client, company, canRead, applied, scope, state, offset, revision]);
  useEffect(() => {
    if (!selected || !company) {
      setDetail(null);
      return;
    }
    let current = true;
    setDetailLoading(true);
    client
      .shiftAllocation(company, selected)
      .then((data) => {
        if (current) {
          setDetail(data);
          setDetailLoading(false);
        }
      })
      .catch((e) => {
        if (current) {
          setDetail(null);
          setError(fail(e));
          setDetailLoading(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, company, selected, revision]);
  const reload = () => setRevision((value) => value + 1);
  const save = async (input: CreateHrShiftAllocationRequest | CloseHrShiftAllocationRequest, id?: string) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify([id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = id
        ? await client.closeShiftAllocation(id, input as CloseHrShiftAllocationRequest, csrfToken(), retry.current.key)
        : await client.createShiftAllocation(input as CreateHrShiftAllocationRequest, csrfToken(), retry.current.key);
      setEditor(false);
      setSelected(result.id);
      setSearch(result.reference);
      setApplied(result.reference);
      setScope("");
      setState("");
      setOffset(0);
      setNotice(
        `${result.reference} saved. Its recorded interval and change history are retained; use Employee preview to check the effective working arrangement.`,
      );
      retry.current = null;
      reload();
    } catch (e) {
      setError(fail(e));
      reload();
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Shift assignment access required</AlertTitle>
        <AlertDescription>
          Sign in with attendance shift read permission to review company allocations.
        </AlertDescription>
      </Alert>
    );
  const current = detail?.id === selected && detail.company_id === company ? detail : null;
  return (
    <section
      aria-label="Live shift assignments"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex min-w-0 gap-3">
          <CalendarClock className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">The right shift, for the right people and dates</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Employee → department → branch. Effective placement determines the applicable roster; replacements
              preserve previous intervals and locked attendance stays protected.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            disabled={busy || loading}
            onClick={() => {
              setError("");
              reload();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          <Button type="button" variant="outline" onClick={() => onNavigate("hr", "shifts")} disabled={busy || editor}>
            Manage shift rules
          </Button>
          {canManage && (
            <Button
              type="button"
              className="text-primary-foreground!"
              disabled={busy || editor || !company}
              onClick={() => {
                setEditor(true);
                setView("register");
                setError("");
                setNotice("");
              }}
            >
              <Plus className="size-4" />
              New assignment
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Assignment action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <label className="grid gap-2 rounded-xl border border-border bg-card p-4 text-sm font-medium">
        Company
        <select
          className={selectClass}
          value={company}
          disabled={busy || editor}
          onChange={(e) => {
            setCompany(e.target.value);
            setItems({ items: [], total: 0 });
            setSelected("");
            setDetail(null);
            setOffset(0);
            setError("");
            setNotice("");
          }}
        >
          <option value="">Select an authorized company</option>
          {companies.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {company ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant={view === "register" ? "default" : "outline"}
              className={view === "register" ? "text-primary-foreground!" : ""}
              aria-pressed={view === "register"}
              disabled={busy || editor}
              onClick={() => setView("register")}
            >
              Assignment register
            </Button>
            <Button
              type="button"
              variant={view === "preview" ? "default" : "outline"}
              className={view === "preview" ? "text-primary-foreground!" : ""}
              aria-pressed={view === "preview"}
              disabled={busy || editor}
              onClick={() => setView("preview")}
            >
              Employee preview
            </Button>
          </div>
          {view === "preview" ? (
            <EmployeePreview key={company} client={client} companyId={company} revision={revision} />
          ) : (
            <>
              <form
                className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_10rem_10rem_auto]"
                onSubmit={(e) => {
                  e.preventDefault();
                  setApplied(search.trim());
                  setOffset(0);
                  setError("");
                }}
              >
                <label className="grid gap-2 text-sm font-medium">
                  Search assignments
                  <Input
                    value={search}
                    maxLength={160}
                    disabled={busy || editor}
                    placeholder="Reference, employee, organisation or shift"
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  Scope filter
                  <select
                    className={selectClass}
                    value={scope}
                    disabled={busy || editor}
                    onChange={(e) => {
                      setScope(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">All scopes</option>
                    {["employee", "department", "branch"].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  State filter
                  <select
                    className={selectClass}
                    value={state}
                    disabled={busy || editor}
                    onChange={(e) => {
                      setState(e.target.value);
                      setOffset(0);
                    }}
                  >
                    <option value="">All states</option>
                    {["active", "scheduled", "ended", "cancelled"].map((s) => (
                      <option key={s} value={s}>
                        {label(s)}
                      </option>
                    ))}
                  </select>
                </label>
                <Button type="submit" variant="outline" className="self-end" disabled={busy || editor}>
                  <Search className="size-4" />
                  Search
                </Button>
              </form>
              {editor && (
                <AllocationEditor
                  today={today}
                  client={client}
                  companyId={company}
                  busy={busy}
                  revision={revision}
                  onSave={(input) => save(input)}
                  onClose={() => setEditor(false)}
                />
              )}
              <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
                <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex items-center justify-between gap-2 border-b border-border p-4">
                    <h3 className="text-sm font-semibold">Recorded allocations</h3>
                    <Badge variant="secondary">{items.total}</Badge>
                  </div>
                  {loading && !items.items.length ? (
                    <Skeleton className="m-4 h-40" />
                  ) : items.items.length ? (
                    <div className="grid max-h-80 gap-2 overflow-y-auto p-3 xl:max-h-[48rem]">
                      {items.items.map((a) => (
                        <button
                          type="button"
                          key={a.id}
                          disabled={busy || editor}
                          aria-pressed={selected === a.id}
                          onClick={() => {
                            setSelected(a.id);
                            setDetail(null);
                            setError("");
                            setNotice("");
                          }}
                          className={`grid min-w-0 gap-2 rounded-lg border p-3 text-left text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 ${selected === a.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}
                        >
                          <span className="flex flex-wrap justify-between gap-2">
                            <span className="text-xs font-semibold">{a.reference}</span>
                            <Badge variant={a.state === "active" ? "secondary" : "outline"}>{label(a.state)}</Badge>
                          </span>
                          <span className="break-words text-sm font-semibold">{a.scope_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {label(a.scope)} · {a.shift_code}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {a.effective_from} → {a.effective_to ?? "open-ended"}
                          </span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-2 p-5">
                      <h3 className="text-base font-semibold">No assignments to display</h3>
                      <p className="text-sm text-muted-foreground">
                        Create a company allocation or adjust the filters. Approved employee placement and configured
                        shifts are required.
                      </p>
                    </div>
                  )}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || loading || editor || !offset}
                      onClick={() => setOffset(Math.max(0, offset - 50))}
                    >
                      Previous
                    </Button>
                    <span className="text-xs text-muted-foreground">
                      {items.total ? `${offset + 1}–${Math.min(offset + 50, items.total)}` : "0"} of {items.total}
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={busy || loading || editor || offset + 50 >= items.total}
                      onClick={() => setOffset(offset + 50)}
                    >
                      Next
                    </Button>
                  </div>
                </section>
                <div className="grid min-w-0 gap-5" aria-busy={busy || detailLoading}>
                  {detailLoading && !current ? (
                    <Skeleton className="h-96 w-full" />
                  ) : current ? (
                    <>
                      <section className="overflow-hidden rounded-xl border border-border bg-card">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                          <div>
                            <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                              {current.reference} · version {current.version}
                            </div>
                            <h2 className="mt-2 break-words text-xl font-semibold">{current.scope_name}</h2>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {label(current.scope)} allocation · {current.shift_code} / {current.shift_name}
                            </p>
                          </div>
                          <Badge variant="secondary">{label(current.state)}</Badge>
                        </div>
                        <dl className="m-0 grid gap-3 p-5 sm:grid-cols-2">
                          <Fact name="Target" value={`${current.scope_code} · ${label(current.scope)}`} />
                          <Fact
                            name="Effective interval"
                            value={`${current.effective_from} → ${current.effective_to ?? "open-ended"}`}
                          />
                          <Fact name="Shift timezone" value={current.time_zone ?? "Configuration required"} />
                          <Fact name="Shift work location" value={current.work_location ?? "Company-wide"} />
                        </dl>
                        <div className="border-t border-border p-5">
                          <h3 className="text-sm font-semibold">Recorded reason</h3>
                          <p className="mt-2 break-words text-sm text-muted-foreground">{current.note}</p>
                        </div>
                        <div className="m-5 mt-0 flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                          <ShieldCheck className="size-5 shrink-0 text-primary" />
                          Shift and target identity stay fixed. Use a dated replacement or close the allocation to
                          retain its history.
                        </div>
                      </section>
                      {canManage && !editor && (
                        <EndAllocation
                          key={`${current.id}:${current.version}`}
                          detail={current}
                          today={today}
                          busy={busy || detailLoading}
                          onSave={(id, input) => save(input, id)}
                        />
                      )}
                      <section className="rounded-xl border border-border bg-card p-5">
                        <h3 className="text-base font-semibold">Allocation history</h3>
                        <div className="mt-4 grid gap-3">
                          {current.history.length ? (
                            current.history.map((h) => (
                              <div key={h.id} className="rounded-lg border border-border bg-background/50 p-3">
                                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                                  <span>
                                    Version {h.version} · {label(h.action)} · {h.actor_name}
                                  </span>
                                  <time dateTime={h.occurred_at}>{new Date(h.occurred_at).toLocaleString()}</time>
                                </div>
                                <p className="mt-2 break-words text-sm">{h.reason}</p>
                                {h.related_reference && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="mt-3"
                                    disabled={busy || editor}
                                    onClick={() => {
                                      setSearch(h.related_reference!);
                                      setApplied(h.related_reference!);
                                      setScope("");
                                      setState("");
                                      setOffset(0);
                                    }}
                                  >
                                    Related: {h.related_reference}
                                    <ArrowRight className="size-4" />
                                  </Button>
                                )}
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Legacy allocation: its original interval remains retained. New changes will record
                              immutable events here.
                            </p>
                          )}
                        </div>
                      </section>
                    </>
                  ) : (
                    <p className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                      Select an allocation to review its effective dates and history.
                    </p>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        !loading && (
          <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
            No authorized company is available. Ask your administrator to review company access.
          </p>
        )
      )}
    </section>
  );
}
