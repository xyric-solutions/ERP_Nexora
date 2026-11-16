"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { useHrOperationsScope } from "../components/hr-operations-scope";
import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  hrDailyAttendanceQuerySchema,
  type HrDailyAttendanceDirectory,
  type HrDailyAttendanceRow,
} from "@nexora/contracts";
import { Users } from "lucide-react";
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
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrDetailList, HrDetailTile } from "../components/hr-detail-tile";
import { HrEditButton } from "../components/hr-icon-buttons";
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
  const [workPageSize, setWorkPageSize] = useState(25);
  const initial = useMemo(() => readInitialReference(initialReference), [initialReference]);
  const { api, session, loading: sessionLoading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.read") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"] | null>(null),
    [company, setCompany] = useState(initial?.company_id ?? "");
  const [date, setDate] = useState(initial?.on_date ?? localDate()),
    [search, setSearch] = useState(initial?.search ?? ""),
    [applied, setApplied] = useState(initial?.search ?? ""),
    [offset, setOffset] = useState(0),
    [revision] = useState(0);
  const [data, setData] = useState<HrDailyAttendanceDirectory | null>(null),
    [loading, setLoading] = useState(false),
    [companyLoading, setCompanyLoading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState("");
  useHrOperationsScope(company, date);
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
  }, [canRead, client, revision]);
  useEffect(() => {
    if (!canRead || !company || !date) return;
    let active = true;
    setLoading(true);
    setError("");
    setData(null);
    setSelected("");
    client
      .dailyAttendance({ company_id: company, on_date: date, search: applied || undefined, limit: workPageSize, offset })
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
  }, [client, company, date, applied, offset, revision, canRead, workPageSize]);
  const detail = data?.items.find((r) => r.employee_id === selected);
  const openRow = (row: HrDailyAttendanceRow) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${row.display_name} (${row.employee_number}) attendance evidence`,
    onClick: () => setSelected(row.employee_id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        setSelected(row.employee_id);
      }
    },
  });
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
      className="grid min-w-0 gap-4 font-sans text-foreground [&_label]:gap-1.5 [&_label]:leading-tight [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_dd]:font-sans! [&_td]:font-sans!"
    >
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Attendance unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!companyLoading && companies?.length === 0 ? (
        <Alert>
          <AlertTitle>Company access required</AlertTitle>
          <AlertDescription>Company access must be granted before daily attendance can be reviewed.</AlertDescription>
        </Alert>
      ) : null}
      <WorkForm
        className="grid min-w-0 gap-4 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[0.7fr_1fr] sm:p-5"
        onSubmit={(e) => {
          e.preventDefault();
          setOffset(0);
          setApplied(search.trim());
        }}
      >
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
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
        <span>{data?.total ?? 0} employees match the date and search.</span>
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
          <div className="hidden max-h-[38rem] overflow-y-auto md:block">
            <WorkTable paging={false} tableId="app/features/hr/views/hr-daily-attendance-workspace:1" className="w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-muted">
                <tr>
                  {["Employee", "Shift / department", "In / out", "Worked", "Late", "Status"].map((h) => (
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
                    className={`cursor-pointer border-t border-border outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === row.employee_id ? "bg-primary/5" : ""}`}
                  >
                    <td className="px-4 py-3">
                      <span className="block font-semibold">{row.display_name}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">{row.employee_number}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="block">{row.shift_name ?? "Shift not assigned"}</span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {row.department ?? "No department"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <span className="block">{time(row.first_in, row.time_zone)}</span>
                      <span className="mt-1 block text-muted-foreground">{time(row.last_out, row.time_zone)}</span>
                    </td>
                    <td className="px-4 py-3 tabular-nums">{minutes(row.worked_minutes)}</td>
                    <td className="px-4 py-3 tabular-nums">{row.late_minutes}m</td>
                    <td className="px-4 py-3">
                      <Status row={row} />
                      {row.correction_applied && (
                        <span className="mt-1 block text-xs text-muted-foreground">Approved correction</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </WorkTable>
          </div>
        ) : (
          <div className="grid justify-items-center gap-2 px-5 py-12 text-center">
            <Users className="size-8 text-muted-foreground" />
            <h3 className="font-semibold">No attendance rows to display</h3>
            <p className="max-w-lg text-sm text-muted-foreground">
              Choose a working date. Employees need an approved operational placement covering that day.
            </p>
          </div>
        )}
      </div>
      {!loading && !!data?.items.length && (
        <div className="grid gap-3 md:hidden">
          {data.items.map((row) => (
            <article
              key={row.employee_id}
              {...openRow(row)}
              className="grid min-w-0 cursor-pointer gap-3 rounded-xl border border-border bg-card p-4 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
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
            </article>
          ))}
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
      <HrMasterSheet
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setSelected("");
        }}
        size="wide"
        eyebrow="Daily Attendance"
        title={detail?.display_name ?? "Attendance evidence"}
        description={
          detail ? `${detail.employee_number} · ${date} · ${detail.time_zone ?? "Timezone not configured"}` : ""
        }
        footer={
          detail && session?.user.permissions.includes("hr.attendance.correction.create") ? (
            <HrEditButton
              label="Correct this day"
              onClick={() =>
                onNavigate(
                  "hr",
                  "attendance-corrections",
                  JSON.stringify({
                    company_id: company,
                    new_correction: {
                      employee_id: detail.employee_id,
                      employee_number: detail.employee_number,
                      work_date: date,
                    },
                  }),
                )
              }
            />
          ) : undefined
        }
      >
        {detail && (
          <section aria-label="Attendance evidence" className="grid min-w-0 gap-4">
            <div>
              <Status row={detail} />
            </div>
            <HrDetailList>
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
                <HrDetailTile key={name} label={name} value={value} />
              ))}
            </HrDetailList>
            {detail.issues.length > 0 && (
              <ul className="m-0 grid gap-2 rounded-lg border border-[var(--nx-warning-border)]/30 bg-[var(--nx-warning-soft)]/5 p-4 pl-8 text-sm">
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
            </div>
          </section>
        )}
      </HrMasterSheet>
    </section>
  );
}
