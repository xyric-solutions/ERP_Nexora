"use client";
import { useState } from "react";
import { hrSelfAttendanceQuerySchema } from "@nexora/contracts";
import { Download, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AttendanceRecordCalendar,
  AttendanceRecordTable,
  AttendanceRecordTiles,
  exportAttendanceRecords,
  useSelfAttendanceCompanies,
} from "../components/hr-attendance-records";
import { localDate, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";

const monthStart = (date: string) => date.slice(0, 8) + "01";

/** Employee self-service: the signed-in employee's own check-in records for a date range. */
export function HrMyAttendanceWorkspace() {
  const today = localDate();
  const [company, setCompany] = useState(""),
    [from, setFrom] = useState(monthStart(today)),
    [to, setTo] = useState(today),
    [applied, setApplied] = useState({ from: monthStart(today), to: today }),
    [rangeError, setRangeError] = useState("");
  const { client, read: membership, workspace } = useSelfAttendanceCompanies(company, today);
  const companyId = workspace?.company_id ?? "";
  const q = { company_id: companyId, ...applied };
  const read = useAttendanceRead(companyId ? JSON.stringify(q) : null, () => client.selfAttendance(q)),
    data = read.data;

  function show(range: { from: string; to: string }) {
    const parsed = hrSelfAttendanceQuerySchema.safeParse({ company_id: companyId || "pending", ...range });
    if (!parsed.success) {
      setRangeError(parsed.error.issues[0]?.message ?? "Choose a valid date range.");
      return;
    }
    setRangeError("");
    setApplied(range);
  }

  if (membership.loading) return <Skeleton className="h-96 w-full" />;
  if (membership.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Attendance unavailable</AlertTitle>
        <AlertDescription>{membership.error}</AlertDescription>
      </Alert>
    );
  if (!workspace || workspace.status === "link_required" || !companyId)
    return (
      <Alert>
        <UserRound className="size-4" />
        <AlertTitle>Link your employee account</AlertTitle>
        <AlertDescription>
          Ask Security or HR to link your sign-in to your employee record and grant access to your company to see your
          attendance.
        </AlertDescription>
      </Alert>
    );

  return (
    <section aria-label="My attendance" className="grid min-w-0 gap-5">
      <form
        className="grid gap-3 rounded-xl border border-border bg-muted/30 p-4 sm:grid-cols-2 lg:flex lg:flex-wrap lg:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          show({ from, to });
        }}
      >
        {workspace.memberships.length > 1 && (
          <label className="grid gap-2 text-sm font-medium lg:w-56">
            Company
            <select className={selectClass} value={companyId} onChange={(e) => setCompany(e.target.value)}>
              {workspace.memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company_name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-2 text-sm font-medium lg:w-52">
          From
          <Input type="date" required value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
        </label>
        <label className="grid gap-2 text-sm font-medium lg:w-52">
          To
          <Input type="date" required value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
        </label>
        <Button type="submit" className="h-10 text-primary-foreground!">
          Show attendance
        </Button>
        <Button
          type="button"
          className="h-10 text-primary-foreground!"
          disabled={!data}
          onClick={() =>
            data &&
            exportAttendanceRecords(data.records, `attendance-${data.employee_number}-${data.from}-to-${data.to}.csv`)
          }
        >
          <Download className="size-4" aria-hidden="true" />
          Export selected dates
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-10"
          onClick={() => {
            const range = { from: monthStart(today), to: today };
            setFrom(range.from);
            setTo(range.to);
            show(range);
          }}
        >
          Current month
        </Button>
      </form>
      {rangeError && (
        <p role="alert" className="text-sm text-destructive">
          {rangeError}
        </p>
      )}
      {read.error && (
        <Alert variant="destructive">
          <AlertTitle>Attendance unavailable</AlertTitle>
          <AlertDescription>{read.error}</AlertDescription>
        </Alert>
      )}
      {!data && !read.error ? (
        <Skeleton className="h-96 w-full" />
      ) : data ? (
        <>
          <p className="text-sm font-medium text-muted-foreground">
            {data.display_name} ({data.employee_number}) · Showing {data.from} to {data.to}, inclusive
          </p>
          <AttendanceRecordTiles summary={data.summary} />
          <AttendanceRecordCalendar from={data.from} to={data.to} today={data.today} records={data.records} />
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <AttendanceRecordTable records={data.records} />
          </div>
        </>
      ) : null}
    </section>
  );
}
