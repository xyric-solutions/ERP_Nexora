"use client";
import { useEffect, useMemo, useState } from "react";
import {
  hrDailyAttendanceQuerySchema,
  type HrDailyAttendanceDirectory,
  type HrDailyAttendanceRow,
} from "@nexora/contracts";
import {
  CalendarDays,
  RefreshCw,
  Search,
  Clock3,
  ShieldCheck,
  Users,
  TriangleAlert,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AttendanceStatusBadge,
  attendanceLabel as label,
  attendanceMinutes as minutes,
} from "../components/attendance-status";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const time = (value: string | null, zone: string | null) =>
  value
    ? new Intl.DateTimeFormat(undefined, {
        timeZone: zone ?? "UTC",
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      }).format(new Date(value))
    : "—";
function Status({ row }: { row: HrDailyAttendanceRow }) {
  return <AttendanceStatusBadge status={row.status} />;
}
function readInitialReference(value: string | undefined) {
  try {
    const parsed = hrDailyAttendanceQuerySchema.safeParse(JSON.parse(value ?? "null"));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
export function HrDailyAttendanceWorkspace({
  onNavigate,
  initialReference,
}: {
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
  initialReference?: string;
}) {
  const initial = useMemo(() => readInitialReference(initialReference), [initialReference]);
  const { api, session, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.read") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState(initial?.company_id ?? "");
  const [date, setDate] = useState(initial?.on_date ?? localDate()),
    [search, setSearch] = useState(initial?.search ?? ""),
    [applied, setApplied] = useState(initial?.search ?? ""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0);
  const [data, setData] = useState<HrDailyAttendanceDirectory | null>(null),
    [loading, setLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
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
        if (active) setError(e instanceof ApiError ? e.message : "Authorized companies could not be loaded.");
      })
      .finally(() => {
        if (active) setCompanyLoading(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, client, revision]);
  useEffect(() => {
    if (!canRead || !company || !date) return;
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelected("");
    client
      .dailyAttendance({ company_id: company, on_date: date, search: applied || undefined, limit: 50, offset })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active) setError(e instanceof ApiError ? e.message : "Attendance could not be loaded. Please retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, company, date, applied, offset, revision, canRead]);
  const counts = useMemo(
    () => ({
      present: data?.items.filter((r) => ["present", "half_day", "official_duty"].includes(r.status)).length ?? 0,
      review: data?.items.filter((r) => r.status === "needs_review").length ?? 0,
      ongoing: data?.items.filter((r) => ["scheduled", "in_progress"].includes(r.status)).length ?? 0,
    }),
    [data],
  );
  const detail = data?.items.find((r) => r.employee_id === selected);
  if (sessionLoading) return <Skeleton className="h-64 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Attendance access required</AlertTitle>
        <AlertDescription>Your role needs attendance read permission to open this workspace.</AlertDescription>
      </Alert>
    );
  return (
    <section
      aria-label="Daily attendance workspace"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-3 text-primary">
            <CalendarDays className="size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">A clear view of every working day</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Effective placements, shift rules and approved evidence in one daily register.
            </p>
          </div>
        </div>
        <Button variant="outline" disabled={loading || companyLoading} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Attendance unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <form
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_0.7fr_1fr_auto] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(search.trim());
        }}
      >
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Company
          <select
            aria-label="Company"
            className={selectClass}
            disabled={companyLoading}
            value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              setOffset(0);
              setData(null);
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
          Working date
          <Input
            required
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setOffset(0);
            }}
          />
        </label>
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Search employee
          <Input
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or employee number"
          />
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit" disabled={loading || !company} className="text-primary-foreground!">
            <Search className="size-4" />
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch("");
              setApplied("");
              setOffset(0);
            }}
          >
            Clear
          </Button>
        </div>
      </form>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {[
          { name: "Employees in this page", value: data?.items.length ?? 0, icon: Users },
          { name: "Present / half day / duty", value: counts.present, icon: ShieldCheck },
          { name: "Scheduled or in progress", value: counts.ongoing, icon: Clock3 },
          { name: "Evidence needs review", value: counts.review, icon: TriangleAlert },
        ].map(({ name, value, icon: Icon }) => (
          <div key={name} className="flex items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Icon className="size-5 shrink-0 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">{name}</p>
              <div className="mt-1 text-2xl font-semibold tabular-nums">{loading ? "—" : value}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Counts describe the current page. {data?.total ?? 0} employees match the company, date and search.</span>
        <span>
          {data
            ? `Period: ${data.period_state ? label(data.period_state) : "Not opened"} · Updated ${new Date(data.generated_at).toLocaleTimeString()}`
            : ""}
        </span>
      </div>
      <div
        className={`min-w-0 overflow-hidden rounded-xl border border-border bg-card ${!loading && data?.items.length ? "hidden md:block" : ""}`}
        aria-busy={loading}
      >
        {loading ? (
          <div className="grid gap-3 p-5" aria-label="Loading attendance">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : data?.items.length ? (
          <div className="hidden max-h-[38rem] overflow-auto md:block">
            <table className="w-full min-w-[950px] text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  {["Employee", "Shift / department", "In / out", "Worked", "Late", "Status", ""].map((h, i) => (
                    <th key={i} scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                      {h || <span className="sr-only">Actions</span>}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <tr
                    key={row.employee_id}
                    className={`border-t border-border transition-colors hover:bg-muted/40 ${selected === row.employee_id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-4">
                      <span className="block font-semibold">{row.display_name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{row.employee_number}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className="block">{row.shift_name ?? "Shift not assigned"}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {row.department ?? "No department"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs">
                      <span className="block">{time(row.first_in, row.time_zone)}</span>
                      <span className="mt-1 block text-muted-foreground">{time(row.last_out, row.time_zone)}</span>
                    </td>
                    <td className="px-4 py-4 tabular-nums">{minutes(row.worked_minutes)}</td>
                    <td className="px-4 py-4 tabular-nums">{row.late_minutes}m</td>
                    <td className="px-4 py-4">
                      <Status row={row} />
                      {row.correction_applied && (
                        <span className="mt-1 block text-xs text-muted-foreground">Approved correction</span>
                      )}
                    </td>
                    <td className="px-4 py-4">
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`Review ${row.employee_number}`}
                        onClick={() => setSelected(row.employee_id)}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 px-5 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <h3 className="font-semibold">No attendance rows to display</h3>
            <p className="max-w-lg text-sm text-muted-foreground">
              Choose an authorized company and date. Employees need an approved operational placement covering that day.
            </p>
          </div>
        )}
      </div>
      {!loading && !!data?.items.length && (
        <div className="grid gap-3 md:hidden">
          {data.items.map((row) => (
            <article key={row.employee_id} className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="break-words text-sm font-semibold">{row.display_name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{row.employee_number}</p>
                </div>
                <Status row={row} />
              </div>
              <p className="text-xs text-muted-foreground">
                {row.shift_name ?? "Shift not assigned"} · {row.department ?? "No department"}
              </p>
              <dl className="m-0 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <dt className="text-muted-foreground">Worked / late</dt>
                  <dd className="m-0 mt-1">
                    {minutes(row.worked_minutes)} / {row.late_minutes}m
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">In / out</dt>
                  <dd className="m-0 mt-1">
                    {time(row.first_in, row.time_zone)}
                    <br />
                    {time(row.last_out, row.time_zone)}
                  </dd>
                </div>
              </dl>
              <Button
                variant="outline"
                aria-label={`Review ${row.employee_number}`}
                onClick={() => setSelected(row.employee_id)}
              >
                Review evidence
              </Button>
            </article>
          ))}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {data?.total ? `${offset + 1}–${offset + data.items.length} of ${data.total}` : "0 results"}
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
            disabled={loading || !data || offset + 50 >= data.total}
            onClick={() => setOffset((v) => v + 50)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {detail && (
        <section
          aria-label="Attendance evidence"
          className="grid min-w-0 gap-4 rounded-xl border border-primary/25 bg-card p-5"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{detail.display_name}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {detail.employee_number} · {date} · {detail.time_zone ?? "Timezone not configured"}
              </p>
            </div>
            <Status row={detail} />
          </div>
          <dl className="m-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[
              [
                "Scheduled window",
                `${time(detail.scheduled_start, detail.time_zone)} → ${time(detail.scheduled_end, detail.time_zone)}`,
              ],
              [
                "Shift source",
                detail.allocation_scope ? `${label(detail.allocation_scope)} assignment` : "Not assigned",
              ],
              ["Approved leave", `${detail.leave_days} day(s)`],
              [
                "Extra / approved overtime",
                `${minutes(detail.potential_overtime_minutes)} / ${minutes(detail.approved_overtime_minutes)}`,
              ],
            ].map(([name, value]) => (
              <div key={name} className="min-w-0 rounded-lg border border-border bg-background p-3">
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="m-0 mt-2 break-words text-sm font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {detail.issues.length > 0 && (
            <ul className="m-0 grid gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 pl-8 text-sm">
              {detail.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <div>
            <h3 className="text-sm font-semibold">Raw punch evidence</h3>
            {detail.punches === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Raw evidence requires punch read permission.</p>
            ) : detail.punches.length ? (
              <ol className="m-0 mt-3 grid max-h-64 list-none gap-2 overflow-auto p-0 sm:grid-cols-2">
                {detail.punches.map((p, i) => (
                  <li key={i} className="rounded-lg border border-border bg-background px-3 py-2 text-sm">
                    <strong className="mr-2 uppercase">{p.direction}</strong>
                    {time(p.occurred_at, detail.time_zone)}
                    <span className="ml-2 text-xs text-muted-foreground">{label(p.source)}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">No raw punches recorded for this working date.</p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {session?.user.permissions.includes("hr.attendance.shift.read") && (
              <Button variant="outline" onClick={() => onNavigate("hr", "shift-assignments")}>
                Review shift assignments
              </Button>
            )}
            <Button variant="ghost" onClick={() => setSelected("")}>
              Close details
            </Button>
          </div>
        </section>
      )}
      <p className="rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        This operational view reads immutable punches and approved corrections and leave. Worked time deducts unpaid
        breaks after recorded gaps; incomplete or conflicting evidence requires review. Extra minutes are an indicator;
        payroll uses approved overtime and locked attendance inputs. A locked period remains unchanged when this view is
        refreshed.
      </p>
    </section>
  );
}
