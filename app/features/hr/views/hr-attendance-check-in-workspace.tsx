"use client";
import { useEffect, useRef, useState } from "react";
import type { HrAttendanceRecord, HrAttendanceWorkMode, HrSelfAttendance } from "@nexora/contracts";
import { saveHrSelfAttendanceDaySchema } from "@nexora/contracts";
import { Building2, CheckCircle2, House, Save, TimerReset, UserRound } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  AttendanceRecordTable,
  clockLabel,
  durationLabel,
  RecordStatus,
  useSelfAttendanceCompanies,
} from "../components/hr-attendance-records";
import { Field, localDate, panel, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";

/** Current wall-clock time ("HH:MM") in the attendance time zone. */
function clockIn(timeZone: string) {
  const options = { hour: "2-digit", minute: "2-digit", hourCycle: "h23" } as const;
  try {
    return new Intl.DateTimeFormat("en-GB", { ...options, timeZone }).format(new Date());
  } catch {
    return new Intl.DateTimeFormat("en-GB", options).format(new Date());
  }
}
function useClock(timeZone: string | undefined) {
  const [now, setNow] = useState(() => (timeZone ? clockIn(timeZone) : ""));
  useEffect(() => {
    if (!timeZone) return;
    const tick = () => setNow(clockIn(timeZone));
    tick();
    const timer = setInterval(tick, 30_000);
    return () => clearInterval(timer);
  }, [timeZone]);
  return now;
}

/** One compact time row: an editable time, Now and the suggested times. */
function TimeCard({
  id,
  title,
  value,
  saved,
  presets,
  nowTime,
  disabled,
  isAvailable,
  onChange,
}: {
  id: string;
  title: string;
  value: string;
  saved: string | null;
  presets: readonly string[];
  nowTime: string;
  disabled: boolean;
  isAvailable: (time: string) => boolean;
  onChange: (time: string) => void;
}) {
  const changed = value !== (saved ?? "");
  return (
    <section className={`${panel} grid content-start gap-3 p-4!`} aria-label={title}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={id} className="text-base font-semibold">
          {title}
        </label>
        {saved ? (
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              changed
                ? "bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]"
                : "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]"
            }`}
          >
            {changed ? `Was ${clockLabel(saved)} · not saved` : `Saved ${clockLabel(saved)}`}
          </span>
        ) : value ? (
          <span className="rounded-full bg-[var(--nx-warning-soft)] px-2.5 py-0.5 text-xs font-semibold text-[var(--nx-warning)]">
            Not saved
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          id={id}
          type="time"
          className="h-10 w-36 text-base font-semibold"
          value={value}
          max={nowTime || undefined}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
        <Button
          type="button"
          variant="outline"
          className="h-10 text-primary"
          disabled={disabled || !nowTime}
          onClick={() => onChange(nowTime)}
        >
          <TimerReset className="size-4" aria-hidden="true" />
          Now
        </Button>
        <div className="flex flex-wrap gap-2" role="group" aria-label={`Suggested ${title.toLowerCase()}s`}>
          {presets.map((time) => (
            <Button
              key={time}
              type="button"
              variant="outline"
              aria-pressed={value === time}
              disabled={disabled || !isAvailable(time)}
              className={`h-10 rounded-full px-3 font-semibold ${value === time ? "border-primary bg-primary/10 text-primary" : ""}`}
              onClick={() => onChange(time)}
            >
              {clockLabel(time)}
            </Button>
          ))}
        </div>
      </div>
    </section>
  );
}

function headline(data: HrSelfAttendance, nowTime: string) {
  const r = data.today_record;
  if (!r?.check_in_time) return { title: "Not checked in", detail: "Today: no check-in yet" };
  if (!r.check_out_time) {
    const [h, m] = r.check_in_time.split(":").map(Number) as [number, number];
    const [nh, nm] = (nowTime || r.check_in_time).split(":").map(Number) as [number, number];
    const sofar = Math.max(0, nh * 60 + nm - (h * 60 + m));
    return {
      title: `Checked in at ${clockLabel(r.check_in_time)}`,
      detail: `Today: ${durationLabel(sofar)} so far · ${durationLabel(data.rules.minimum_work_minutes)} needed for a full day`,
    };
  }
  return {
    title: `Checked out at ${clockLabel(r.check_out_time)}`,
    detail: `Today: ${durationLabel(r.worked_minutes)} worked`,
  };
}

const monthStart = (date: string) => date.slice(0, 8) + "01";

/** Employee self-service: record and correct today's check-in and check-out, then see this month's records. */
export function HrAttendanceCheckInWorkspace() {
  const { csrfToken } = useSession();
  const today0 = localDate();
  const [company, setCompany] = useState(""),
    [revision, setRevision] = useState(0),
    [inTime, setInTime] = useState(""),
    [outTime, setOutTime] = useState(""),
    [mode, setMode] = useState<HrAttendanceWorkMode>("office"),
    [note, setNote] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const { client, read: membership, workspace } = useSelfAttendanceCompanies(company, today0);
  const companyId = workspace?.company_id ?? "";
  const q = { company_id: companyId, from: monthStart(today0), to: today0 };
  const read = useAttendanceRead(companyId ? JSON.stringify([q, revision]) : null, () => client.selfAttendance(q)),
    data = read.data;
  const nowTime = useClock(data?.time_zone);
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const record: HrAttendanceRecord | null = data?.today_record ?? null;

  // Load the saved day into the form whenever it changes (first load, company switch, after a save).
  const savedKey = JSON.stringify([data?.company_id, record]);
  useEffect(() => {
    setInTime(record?.check_in_time ?? "");
    setOutTime(record?.check_out_time ?? "");
    setMode(record?.work_mode ?? "office");
    setNote(record?.note ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey]);

  const dirty =
    inTime !== (record?.check_in_time ?? "") ||
    outTime !== (record?.check_out_time ?? "") ||
    (!!inTime && mode !== (record?.work_mode ?? "office")) ||
    (!!inTime && note.trim() !== (record?.note ?? ""));

  function discard() {
    setInTime(record?.check_in_time ?? "");
    setOutTime(record?.check_out_time ?? "");
    setMode(record?.work_mode ?? "office");
    setNote(record?.note ?? "");
    setError("");
  }

  async function save() {
    if (guard.current || !data) return;
    if (!inTime) return setError("Enter your check-in time.");
    if (record?.check_out_time && !outTime) return setError("Keep a check-out time; it cannot be removed.");
    if (nowTime && (inTime > nowTime || (outTime && outTime > nowTime)))
      return setError("That time has not happened yet. Choose Now or an earlier time.");
    const parsed = saveHrSelfAttendanceDaySchema.safeParse({
      company_id: data.company_id,
      check_in: inTime,
      check_out: outTime || null,
      work_mode: mode,
      note: note.trim() || null,
    });
    if (!parsed.success)
      return setError(parsed.error.issues[0]?.message ?? "Review your check-in and check-out times.");
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.saveSelfAttendanceDay(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice(
        parsed.data.check_out
          ? `Saved: in ${clockLabel(parsed.data.check_in)}, out ${clockLabel(parsed.data.check_out)}.`
          : `Saved: checked in at ${clockLabel(parsed.data.check_in)}.`,
      );
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Your attendance could not be saved. Please retry.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  if (membership.loading) return <Skeleton className="h-96 w-full" />;
  if (membership.error)
    return (
      <Alert variant="destructive">
        <AlertTitle>Check-in unavailable</AlertTitle>
        <AlertDescription>{membership.error}</AlertDescription>
      </Alert>
    );
  if (!workspace || workspace.status === "link_required" || !companyId)
    return (
      <Alert>
        <UserRound className="size-4" />
        <AlertTitle>Link your employee account</AlertTitle>
        <AlertDescription>
          Ask Security or HR to link your sign-in to your employee record and grant access to your company before you
          check in.
        </AlertDescription>
      </Alert>
    );

  const locked = !!data?.period_locked,
    readOnly = locked || (!!data && !data.today_editable);
  const head = data ? headline(data, nowTime) : null;
  return (
    <section aria-label="Daily check-in" className="grid min-w-0 gap-4">
      {workspace.memberships.length > 1 && (
        <div className={`${panel} max-w-md`}>
          <Field title="Company">
            <select
              className={selectClass}
              value={companyId}
              disabled={busy}
              onChange={(e) => {
                setCompany(e.target.value);
                setNotice("");
                setError("");
              }}
            >
              {workspace.memberships.map((m) => (
                <option key={m.company_id} value={m.company_id}>
                  {m.company_name}
                </option>
              ))}
            </select>
          </Field>
        </div>
      )}
      {read.error && (
        <Alert variant="destructive">
          <AlertTitle>Attendance unavailable</AlertTitle>
          <AlertDescription>{read.error}</AlertDescription>
        </Alert>
      )}
      {!data && !read.error ? (
        <Skeleton className="h-96 w-full" />
      ) : data && head ? (
        <>
          <form
            className="grid gap-4 rounded-xl border border-border bg-muted/30 p-4 sm:p-5"
            aria-label="Today's attendance"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
          >
            <div className="grid min-w-0 gap-1">
              <span className="font-mono text-sm font-semibold text-primary">{data.today}</span>
              <h2 className="m-0! text-2xl font-bold">{head.title}</h2>
              <p className="m-0! flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                {head.detail}
                {record?.check_out_time && (
                  <>
                    <span aria-hidden="true">·</span>
                    <RecordStatus status={record.status} />
                  </>
                )}
                {record?.arrival === "late" && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span className="font-semibold text-[var(--nx-warning)]">Late arrival</span>
                  </>
                )}
              </p>
            </div>
            {locked && (
              <Alert>
                <AlertTitle>Attendance month is locked</AlertTitle>
                <AlertDescription>
                  This month has been closed for payroll, so times can no longer be saved. Ask HR for a correction.
                </AlertDescription>
              </Alert>
            )}
            {!locked && !data.today_editable && (
              <Alert>
                <AlertTitle>Recorded by an attendance device</AlertTitle>
                <AlertDescription>Today&apos;s time came from a device. Ask HR for a correction.</AlertDescription>
              </Alert>
            )}
            <div className="grid gap-3 lg:grid-cols-2">
              <TimeCard
                id="attendance-check-in-time"
                title="Check-in time"
                value={inTime}
                saved={record?.check_in_time ?? null}
                presets={data.rules.check_in_presets}
                nowTime={nowTime}
                disabled={busy || readOnly}
                isAvailable={(time) => !nowTime || time <= nowTime}
                onChange={setInTime}
              />
              <TimeCard
                id="attendance-check-out-time"
                title="Check-out time"
                value={outTime}
                saved={record?.check_out_time ?? null}
                presets={data.rules.check_out_presets}
                nowTime={nowTime}
                disabled={busy || readOnly || !inTime}
                isAvailable={(time) => (!nowTime || time <= nowTime) && (!inTime || time > inTime)}
                onChange={setOutTime}
              />
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <section className={`${panel} grid content-start gap-3 p-4!`} aria-label="Work mode">
                <h3 className="m-0! text-base font-semibold">Work mode</h3>
                <div className="flex gap-2">
                  {(["office", "remote"] as const).map((m) => {
                    const Icon = m === "office" ? Building2 : House;
                    return (
                      <Button
                        key={m}
                        type="button"
                        variant={mode === m ? "default" : "outline"}
                        aria-pressed={mode === m}
                        disabled={busy || readOnly}
                        className={`h-10 flex-1 ${mode === m ? "text-primary-foreground!" : ""}`}
                        onClick={() => setMode(m)}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                        {m === "office" ? "On-site" : "Remote"}
                      </Button>
                    );
                  })}
                </div>
              </section>
              <section className={`${panel} grid content-start gap-3 p-4!`} aria-label="Notes">
                <label htmlFor="attendance-note" className="text-base font-semibold">
                  Notes
                </label>
                <Textarea
                  id="attendance-note"
                  value={note}
                  maxLength={500}
                  rows={1}
                  className="min-h-10"
                  disabled={busy || readOnly}
                  onChange={(e) => setNote(e.target.value)}
                />
              </section>
            </div>
            {error && (
              <Alert variant="destructive">
                <AlertTitle>Not saved</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {notice && !dirty && (
              <p
                role="status"
                className="m-0! flex items-center gap-2 rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] px-3 py-2 text-sm text-[var(--nx-success-text)]"
              >
                <CheckCircle2 className="size-4" aria-hidden="true" />
                {notice}
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {dirty && (
                <Button type="button" variant="outline" className="h-10" disabled={busy} onClick={discard}>
                  Discard changes
                </Button>
              )}
              <Button
                type="submit"
                className="h-10 min-w-32 text-primary-foreground!"
                disabled={busy || readOnly || !dirty || !inTime}
              >
                <Save className="size-4" aria-hidden="true" />
                {busy ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <AttendanceRecordTable records={data.records} range={`${data.from} to ${data.to}`} />
          </div>
        </>
      ) : null}
    </section>
  );
}
