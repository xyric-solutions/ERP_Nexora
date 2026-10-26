"use client";
import { useEffect, useMemo, useState } from "react";
import type { HrMonthlyAttendanceDirectory, HrMonthlyAttendanceRow } from "@nexora/contracts";
import {
  CalendarRange,
  RefreshCw,
  Search,
  Users,
  CheckCircle2,
  TriangleAlert,
  Clock3,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  AttendanceStatusBadge,
  attendanceLabel,
  attendanceMinutes,
  attendanceStatusClass,
} from "../components/attendance-status";
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40";
const currentMonth = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const dayCodes: Record<HrMonthlyAttendanceRow["days"][number]["status"], string> = {
  present: "P",
  half_day: "H",
  absent: "A",
  on_leave: "L",
  partial_leave: "PL",
  off_day: "O",
  holiday: "HL",
  scheduled: "SC",
  in_progress: "IP",
  needs_review: "NR",
  official_duty: "OD",
};
function EmployeeMonth({
  item,
  data,
  onNavigate,
  onClose,
}: {
  item: HrMonthlyAttendanceRow;
  data: HrMonthlyAttendanceDirectory;
  onNavigate: Navigate;
  onClose: () => void;
}) {
  const [date, setDate] = useState(item.days[0]?.on_date ?? "");
  const chosen = item.days.find((d) => d.on_date === date),
    byDate = new Map(item.days.map((d) => [d.on_date, d]));
  const slots = Array.from(
    { length: Number(data.through_date.slice(8)) },
    (_, i) => `${data.month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
  );
  return (
    <section
      aria-label="Employee monthly detail"
      className="grid min-w-0 gap-5 rounded-xl border border-primary/25 bg-card p-4 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="break-words text-lg font-semibold">{item.display_name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {item.employee_number} · {item.covered_days} covered dates ·{" "}
            {item.departments.join(" / ") || "No department"}
          </p>
        </div>
        <Button variant="ghost" onClick={onClose}>
          Close details
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Choose a day to review its result. Dates without an operational placement are excluded from the totals.
      </p>
      <div className="grid grid-cols-7 gap-1 sm:gap-2" aria-label="Attendance calendar">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <span
            key={day}
            aria-hidden="true"
            className="py-1 text-center text-[10px] font-medium text-muted-foreground sm:text-xs"
          >
            {day}
          </span>
        ))}
        {Array.from({ length: new Date(data.month + "T00:00:00Z").getUTCDay() }, (_, i) => (
          <span key={`pad-${i}`} aria-hidden="true" />
        ))}
        {slots.map((day) => {
          const result = byDate.get(day);
          return result ? (
            <button
              key={day}
              type="button"
              aria-pressed={date === day}
              aria-label={`${day}: ${attendanceLabel(result.status)}`}
              onClick={() => setDate(day)}
              className={`grid min-h-16 min-w-0 gap-1 rounded-lg border px-1 py-2 text-center sm:gap-2 sm:p-3 sm:text-left outline-none transition-shadow hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring ${attendanceStatusClass(result.status)} ${date === day ? "ring-2 ring-primary ring-offset-2 ring-offset-card" : ""}`}
            >
              <span className="text-sm font-semibold">{Number(day.slice(8))}</span>
              <span aria-hidden="true" className="text-xs font-semibold sm:hidden">
                {dayCodes[result.status]}
              </span>
              <span className="hidden break-words text-xs sm:block">{attendanceLabel(result.status)}</span>
              <span className="hidden text-xs opacity-80 sm:block">{attendanceMinutes(result.worked_minutes)}</span>
            </button>
          ) : (
            <div
              key={day}
              className="grid min-h-16 gap-1 rounded-lg border border-dashed border-border px-1 py-2 text-center text-muted-foreground sm:gap-2 sm:p-3 sm:text-left"
            >
              <span className="text-sm">{Number(day.slice(8))}</span>
              <span className="text-xs sm:hidden" title="No operational placement">
                —
              </span>
              <span className="hidden text-xs sm:block">No placement</span>
            </div>
          );
        })}
      </div>
      <div
        className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden"
        aria-label="Calendar legend"
      >
        {[...new Set(item.days.map((d) => d.status))].map((status) => (
          <span key={status}>
            <strong>{dayCodes[status]}</strong> {attendanceLabel(status)}
          </span>
        ))}
      </div>
      {chosen && (
        <div className="grid gap-3 rounded-lg border border-border bg-background p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <strong className="text-sm">
              {chosen.on_date} · {chosen.shift_name ?? "No shift assigned"}
            </strong>
            <AttendanceStatusBadge status={chosen.status} />
          </div>
          <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            {[
              ["Worked", attendanceMinutes(chosen.worked_minutes)],
              ["Late", `${chosen.late_minutes}m`],
              ["Approved leave", `${chosen.leave_days} day(s)`],
              ["Approved overtime", attendanceMinutes(chosen.approved_overtime_minutes)],
            ].map(([name, value]) => (
              <div key={name}>
                <dt className="text-xs text-muted-foreground">{name}</dt>
                <dd className="m-0 mt-1 font-medium">{value}</dd>
              </div>
            ))}
          </dl>
          {chosen.correction_applied && (
            <p className="text-xs text-muted-foreground">An approved correction contributes to this result.</p>
          )}
          {chosen.issues.length > 0 && (
            <ul className="m-0 grid gap-1 pl-5 text-sm">
              {chosen.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <div>
            <Button
              variant="outline"
              onClick={() =>
                onNavigate(
                  "hr",
                  "daily-attendance",
                  JSON.stringify({
                    company_id: data.company_id,
                    on_date: chosen.on_date,
                    search: item.employee_number,
                  }),
                )
              }
            >
              Open daily evidence
              <ArrowUpRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Finalized attendance input</h3>
        {!data.snapshot_access ? (
          <p className="text-xs text-muted-foreground">
            Finalized input summaries require attendance payroll-input read permission.
          </p>
        ) : item.finalized_input ? (
          <>
            <p className="text-xs text-muted-foreground">
              Stored separately from the operational calendar above. This summary does not indicate a payroll payment.
            </p>
            <dl className="m-0 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
              {[
                ["Calendar days", item.finalized_input.calendar_days],
                ["Paid days", item.finalized_input.paid_days],
                ["Unpaid days", item.finalized_input.unpaid_days],
                ["Approved leave", item.finalized_input.approved_leave_days],
              ].map(([name, value]) => (
                <div key={name}>
                  <dt className="text-xs text-muted-foreground">{name}</dt>
                  <dd className="m-0 mt-1 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="break-words text-xs text-muted-foreground">
              Evidence: {item.finalized_input.evidence_version}
            </p>
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            {data.period_state === "locked"
              ? "No finalized input exists for this employee in the locked month."
              : "This month has no locked input to display. Operational totals remain subject to review."}
          </p>
        )}
      </div>
    </section>
  );
}
export function HrMonthlyAttendanceWorkspace({ onNavigate }: { onNavigate: Navigate }) {
  const { api, session, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    canRead = session?.user.permissions.includes("hr.attendance.read") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState(""),
    [month, setMonth] = useState(currentMonth),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState("");
  const [data, setData] = useState<HrMonthlyAttendanceDirectory | null>(null),
    [loading, setLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [error, setError] = useState("");
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
  }, [client, canRead, revision]);
  useEffect(() => {
    if (!canRead || !company || !/^\d{4}-\d{2}$/.test(month)) return;
    let active = true;
    setData(null);
    setSelected("");
    setError("");
    setLoading(true);
    client
      .monthlyAttendance({ company_id: company, month: month + "-01", search: applied || undefined, limit: 25, offset })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((e) => {
        if (active)
          setError(e instanceof ApiError ? e.message : "Monthly attendance could not be loaded. Please retry.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [client, company, month, applied, offset, revision, canRead]);
  const totals = useMemo(
    () => ({
      present: data?.items.reduce((n, r) => n + r.counts.present, 0) ?? 0,
      review: data?.items.reduce((n, r) => n + r.counts.needs_review, 0) ?? 0,
      worked: data?.items.reduce((n, r) => n + r.worked_minutes, 0) ?? 0,
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
  const reviewButton = (row: HrMonthlyAttendanceRow) => (
    <Button
      variant="outline"
      size="sm"
      aria-label={`Review ${row.employee_number}`}
      onClick={() => setSelected(row.employee_id)}
    >
      Review month
    </Button>
  );
  return (
    <section
      aria-label="Monthly attendance workspace"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <div className="rounded-xl bg-primary/15 p-3 text-primary">
            <CalendarRange className="size-6" />
          </div>
          <div className="min-w-0">
            <h2 className="text-xl font-semibold tracking-tight">Every day, one connected monthly view</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              Review employee coverage, attendance and exceptions before the next approval stage.
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
          <AlertTitle>Monthly attendance unavailable</AlertTitle>
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
          Attendance month
          <Input
            required
            type="month"
            min="1900-01"
            max="2199-12"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setOffset(0);
              setData(null);
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
          <Button type="submit" className="text-primary-foreground!" disabled={loading || !company || !month}>
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
          { name: "Present days", value: totals.present, icon: CheckCircle2 },
          { name: "Days needing review", value: totals.review, icon: TriangleAlert },
          { name: "Recorded work", value: attendanceMinutes(totals.worked), icon: Clock3 },
        ].map(({ name, value, icon: Icon }) => (
          <div key={name} className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-card p-4">
            <Icon className="size-5 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">{name}</p>
              <div className="mt-1 break-words text-xl font-semibold tabular-nums">{loading ? "—" : value}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Totals describe the current page. {data?.total ?? 0} employees match this month and search.</span>
        <span>
          {data
            ? `Period: ${data.period_state ? attendanceLabel(data.period_state) : "Not opened"} · Updated ${new Date(data.generated_at).toLocaleTimeString()}`
            : ""}
        </span>
      </div>
      {loading || companyLoading ? (
        <div className="grid gap-3 rounded-xl border border-border bg-card p-5" aria-label="Loading monthly attendance">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : data?.items.length ? (
        <>
          <div className="hidden min-w-0 overflow-hidden rounded-xl border border-border bg-card md:block">
            <div className="max-h-[38rem] overflow-auto">
              <table className="w-full min-w-[1050px] text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    {[
                      "Employee",
                      "Covered dates",
                      "Present / half",
                      "Absent",
                      "Leave days",
                      "Review",
                      "Worked",
                      "",
                    ].map((h, i) => (
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
                      className={`border-t border-border hover:bg-muted/40 ${selected === row.employee_id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-4">
                        <strong className="block">{row.display_name}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{row.employee_number}</span>
                      </td>
                      <td className="px-4 py-4 tabular-nums">{row.covered_days}</td>
                      <td className="px-4 py-4 tabular-nums">
                        {row.counts.present} / {row.counts.half_day}
                      </td>
                      <td className="px-4 py-4 tabular-nums">{row.counts.absent}</td>
                      <td className="px-4 py-4 tabular-nums">{row.approved_leave_days}</td>
                      <td className="px-4 py-4 tabular-nums">{row.counts.needs_review}</td>
                      <td className="px-4 py-4 tabular-nums">{attendanceMinutes(row.worked_minutes)}</td>
                      <td className="px-4 py-4">{reviewButton(row)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {data.items.map((row) => (
              <article key={row.employee_id} className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-4">
                <div>
                  <h3 className="break-words text-sm font-semibold">{row.display_name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {row.employee_number} · {row.covered_days} covered dates
                  </p>
                </div>
                <dl className="m-0 grid grid-cols-2 gap-3 text-sm">
                  {[
                    ["Present / half", `${row.counts.present} / ${row.counts.half_day}`],
                    ["Absent", row.counts.absent],
                    ["Approved leave", row.approved_leave_days],
                    ["Needs review", row.counts.needs_review],
                  ].map(([name, value]) => (
                    <div key={name}>
                      <dt className="text-xs text-muted-foreground">{name}</dt>
                      <dd className="m-0 mt-1">{value}</dd>
                    </div>
                  ))}
                </dl>
                {reviewButton(row)}
              </article>
            ))}
          </div>
        </>
      ) : (
        <div className="grid justify-items-center gap-2 rounded-xl border border-border bg-card px-5 py-12 text-center">
          <Users className="size-8 text-muted-foreground" />
          <h3 className="font-semibold">No operational employees in this month</h3>
          <p className="max-w-lg text-sm text-muted-foreground">
            Choose a company and month, or clear the search. Only approved operational placements contribute attendance
            dates.
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          {data?.items.length ? `${offset + 1}–${offset + data.items.length} of ${data.total}` : "0 results"}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || offset === 0}
            onClick={() => setOffset((v) => Math.max(0, v - 25))}
          >
            <ChevronLeft className="size-4" />
            Previous
          </Button>
          <Button
            variant="outline"
            disabled={loading || !data || offset + 25 >= data.total}
            onClick={() => setOffset((v) => v + 25)}
          >
            Next
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      {detail && data && (
        <EmployeeMonth
          key={`${data.company_id}:${data.month}:${detail.employee_id}`}
          item={detail}
          data={data}
          onNavigate={onNavigate}
          onClose={() => setSelected("")}
        />
      )}
      <p className="rounded-lg border border-border bg-muted/30 p-4 text-xs leading-relaxed text-muted-foreground">
        These are operational monthly results from the daily attendance rules. Present, half day, leave, official duty,
        off days and unfinished shifts remain separate. This view does not calculate paid days or approve payroll.
        Authorized users can compare a separately stored finalized input when the attendance period is locked.
      </p>
    </section>
  );
}
