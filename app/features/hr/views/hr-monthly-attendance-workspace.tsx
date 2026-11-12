"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { readHrOperationsScope, useHrOperationsScope } from "../components/hr-operations-scope";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import type { HrMonthlyAttendanceDirectory, HrMonthlyAttendanceRow } from "@nexora/contracts";
import { Users, ArrowUpRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import {
  AttendanceStatusBadge,
  attendanceLabel,
  attendanceMinutes,
  attendanceStatusClass,
} from "../components/attendance-status";
import {
  AttendanceRecordTable,
  AttendanceRecordTiles,
  exportAttendanceRecords,
} from "../components/hr-attendance-records";
import { useAttendanceRead } from "../components/hr-workspace-controls";
type Navigate = (moduleId: string, pageId: string, recordRef?: string) => void;
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
/** The employee's own check-in / check-out records for the month (needs attendance punch read). */
function EmployeeCheckIns({
  client,
  company,
  employee,
  from,
  to,
}: {
  client: HrApiClient;
  company: string;
  employee: string;
  from: string;
  to: string;
}) {
  const q = { company_id: company, employee_id: employee, from, to };
  const read = useAttendanceRead(JSON.stringify(q), () => client.employeeAttendanceRecords(q)),
    records = read.data;
  return (
    <section aria-label="Check-in records" className="grid gap-4 rounded-lg border border-border bg-background p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Check-in records · {from} to {to}
        </h3>
        <Button
          variant="outline"
          disabled={!records}
          onClick={() =>
            records &&
            exportAttendanceRecords(records.records, `attendance-${records.employee_number}-${from}-to-${to}.csv`)
          }
        >
          <Download className="size-4" />
          Export
        </Button>
      </div>
      {read.error ? (
        <p role="alert" className="text-sm text-destructive">
          {read.error}
        </p>
      ) : !records ? (
        <Skeleton className="h-32 w-full" />
      ) : (
        <>
          <AttendanceRecordTiles summary={records.summary} />
          <AttendanceRecordTable records={records.records} />
        </>
      )}
    </section>
  );
}
function EmployeeMonth({
  item,
  data,
  onNavigate,
  client,
  canReadPunches,
}: {
  item: HrMonthlyAttendanceRow;
  data: HrMonthlyAttendanceDirectory;
  onNavigate: Navigate;
  client: HrApiClient;
  canReadPunches: boolean;
}) {
  const [date, setDate] = useState(item.days[0]?.on_date ?? "");
  const chosen = item.days.find((d) => d.on_date === date),
    byDate = new Map(item.days.map((d) => [d.on_date, d]));
  const slots = Array.from(
    { length: Number(data.through_date.slice(8)) },
    (_, i) => `${data.month.slice(0, 7)}-${String(i + 1).padStart(2, "0")}`,
  );
  return (
    <section aria-label="Employee monthly detail" className="grid min-w-0 gap-5">
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
      {canReadPunches && (
        <EmployeeCheckIns
          client={client}
          company={data.company_id}
          employee={item.employee_id}
          from={data.month}
          to={data.through_date}
        />
      )}
      <div className="grid gap-2 rounded-lg border border-border bg-muted/30 p-4">
        <h3 className="text-sm font-semibold">Finalized attendance input</h3>
        {!data.snapshot_access ? (
          <p className="text-xs text-muted-foreground">
            Finalized input summaries require attendance payroll-input read permission.
          </p>
        ) : item.finalized_input ? (
          <>
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
export function HrMonthlyAttendanceWorkspace({
  onNavigate,
  initialReference,
}: {
  initialReference?: string;
  onNavigate: Navigate;
}) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const initialScope = useMemo(() => readHrOperationsScope(initialReference), [initialReference]);
  const { api, session, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    canRead = session?.user.permissions.includes("hr.attendance.read") ?? false,
    canReadPunches = session?.user.permissions.includes("hr.attendance.punch.read") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState(initialScope.company_id ?? ""),
    [month, setMonth] = useState(
      () => initialScope.month?.slice(0, 7) ?? initialScope.as_of?.slice(0, 7) ?? currentMonth(),
    ),
    [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [offset, setOffset] = useState(0),
    [revision] = useState(0),
    [selected, setSelected] = useState("");
  const [data, setData] = useState<HrMonthlyAttendanceDirectory | null>(null),
    [loading, setLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [error, setError] = useState("");
  useHrOperationsScope(company, month + "-01", month + "-01");
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
      .monthlyAttendance({ company_id: company, month: month + "-01", search: applied || undefined, limit: workPageSize, offset })
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
  }, [client, company, month, applied, offset, revision, canRead, workPageSize]);
  const detail = data?.items.find((r) => r.employee_id === selected);
  if (sessionLoading) return <Skeleton className="h-64 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Attendance access required</AlertTitle>
        <AlertDescription>Your role needs attendance read permission to open this workspace.</AlertDescription>
      </Alert>
    );
  const openRow = (row: HrMonthlyAttendanceRow) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${row.display_name} (${row.employee_number}) monthly attendance`,
    onClick: () => setSelected(row.employee_id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelected(row.employee_id);
      }
    },
  });
  return (
    <section
      aria-label="Monthly attendance workspace"
      className="grid min-w-0 gap-4 font-sans text-foreground [&_label]:gap-1.5 [&_label]:leading-tight [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Monthly attendance unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!companyLoading && !error && !companies.length && (
        <Alert>
          <AlertTitle>No authorized company</AlertTitle>
          <AlertDescription>Ask your administrator to review company access.</AlertDescription>
        </Alert>
      )}
      <WorkForm
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-[0.7fr_1fr] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(search.trim());
        }}
      >
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
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
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Search employee
          <Input
            maxLength={160}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Name or employee number"
          />
        </label>
      </WorkForm>
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{data?.total ?? 0} employees match this month and search.</span>
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
            <div className="max-h-[38rem] overflow-y-auto">
              <WorkTable paging={false} tableId="app/features/hr/views/hr-monthly-attendance-workspace:1" className="w-full text-left text-sm">
                <thead className="sticky top-0 z-10 bg-muted">
                  <tr>
                    {[
                      "Employee",
                      "Covered dates",
                      "Present / half",
                      "Absent",
                      "Leave days",
                      "Needs review",
                      "Worked",
                    ].map((h) => (
                      <th key={h} scope="col" className="px-4 py-3 text-xs font-semibold text-muted-foreground">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((row) => (
                    <tr
                      key={row.employee_id}
                      {...openRow(row)}
                      className={`cursor-pointer border-t border-border outline-none hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === row.employee_id ? "bg-primary/5" : ""}`}
                    >
                      <td className="px-4 py-3">
                        <strong className="block">{row.display_name}</strong>
                        <span className="mt-1 block text-xs text-muted-foreground">{row.employee_number}</span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.covered_days}</td>
                      <td className="px-4 py-3 tabular-nums">
                        {row.counts.present} / {row.counts.half_day}
                      </td>
                      <td className="px-4 py-3 tabular-nums">{row.counts.absent}</td>
                      <td className="px-4 py-3 tabular-nums">{row.approved_leave_days}</td>
                      <td className="px-4 py-3 tabular-nums">{row.counts.needs_review}</td>
                      <td className="px-4 py-3 tabular-nums">{attendanceMinutes(row.worked_minutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </WorkTable>
            </div>
          </div>
          <div className="grid gap-3 md:hidden">
            {data.items.map((row) => (
              <article
                key={row.employee_id}
                {...openRow(row)}
                className="grid min-w-0 cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
              >
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
      <WorkOffsetPagination
        busy={loading}
        total={data?.total ?? 0}
        offset={offset}
        size={workPageSize}
        previousDisabled={loading || offset === 0}
        nextDisabled={loading || !data || offset + workPageSize >= data.total}
        onSizeChange={(size) => {
          setWorkPageSize(size);
          setOffset(0);
        }}
        onPrevious={() => setOffset((v) => Math.max(0, v - workPageSize))}
        onNext={() => setOffset((v) => v + workPageSize)}
      />
      <Dialog
        open={Boolean(detail && data)}
        onOpenChange={(open) => {
          if (!open) setSelected("");
        }}
      >
        <DialogContent
          className="z-[1301]! flex max-h-[90vh] w-[min(72rem,calc(100vw-2rem))]! max-w-none! flex-col gap-0 overflow-hidden p-0"
          overlayClassName="z-[1300]! backdrop-blur-sm!"
        >
          <div className="border-b border-border px-5 py-3 pr-14 sm:px-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
              Monthly Attendance
            </span>
            <DialogTitle className="m-0! mt-0.5 truncate text-lg font-semibold leading-snug">
              {detail?.display_name ?? "Employee month"}
            </DialogTitle>
            <DialogDescription className="m-0! mt-0.5 text-xs text-muted-foreground">
              {detail
                ? `${detail.employee_number} · ${detail.covered_days} covered dates · ${detail.departments.join(" / ") || "No department"}`
                : ""}
            </DialogDescription>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-6">
            {detail && data ? (
              <EmployeeMonth
                key={`${data.company_id}:${data.month}:${detail.employee_id}`}
                item={detail}
                data={data}
                onNavigate={onNavigate}
                client={client}
                canReadPunches={canReadPunches}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
