"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  createHrShiftRequestSchema,
  updateHrShiftRequestSchema,
  type CreateHrShiftRequest,
  type UpdateHrShiftRequest,
  type HrShiftDetail,
  type HrShiftDirectory,
  type HrShiftContext,
  type HrShiftSummary,
} from "@nexora/contracts";
import { Clock3, Copy, Plus, RefreshCw, ShieldCheck, Trash2, Search, CheckCircle2, X } from "lucide-react";
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

const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());
const time = (m: number) =>
  `${String(Math.floor((m % 1440) / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const minutes = (s: string) => {
  const [h, m] = s.split(":").map(Number);
  return h! * 60 + m!;
};
const hours = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;
const fail = (e: unknown) =>
  e instanceof ApiError ? e.message : "Shift rules could not be loaded or saved. Please retry.";
type Editor = { detail?: HrShiftDetail; copy: boolean };
function Rule({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-background/60 p-3">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="m-0 mt-1 break-words text-sm font-semibold">{value}</dd>
    </div>
  );
}

function ShiftEditor({
  client,
  companyId,
  editor,
  busy,
  onSave,
  onClose,
}: {
  client: HrApiClient;
  companyId: string;
  editor: Editor;
  busy: boolean;
  onSave: (input: CreateHrShiftRequest | UpdateHrShiftRequest, id?: string) => Promise<void>;
  onClose: () => void;
}) {
  const initial = editor.detail;
  const [expectedVersion] = useState(initial?.version);
  const [code, setCode] = useState(editor.copy ? "" : (initial?.code ?? ""));
  const [name, setName] = useState(editor.copy ? `${initial?.name ?? ""} copy` : (initial?.name ?? ""));
  const [kind, setKind] = useState<CreateHrShiftRequest["kind"]>(initial?.kind ?? "fixed");
  const [zone, setZone] = useState(initial?.time_zone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? "UTC");
  const [location, setLocation] = useState(initial?.work_location_id ?? "");
  const [start, setStart] = useState(time(initial?.start_minute ?? 540));
  const [end, setEnd] = useState(time(initial?.end_minute ?? 1020));
  const [nextDay, setNextDay] = useState((initial?.end_minute ?? 1020) >= 1440);
  const [graceIn, setGraceIn] = useState(initial?.grace_in_minutes ?? 15);
  const [graceOut, setGraceOut] = useState(initial?.grace_out_minutes ?? 10);
  const [minimum, setMinimum] = useState(initial?.minimum_present_minutes ?? 120);
  const [half, setHalf] = useState(initial?.half_day_minutes ?? 240);
  const [overtime, setOvertime] = useState(initial?.overtime_after_minutes ?? 30);
  const [required, setRequired] = useState(initial?.required_work_minutes ?? 480);
  const [off, setOff] = useState(initial?.weekly_off_days ?? [0, 6]);
  const [breaks, setBreaks] = useState(initial?.breaks ?? [{ label: "Lunch", minutes: 30, paid: false }]);
  const [anchor, setAnchor] = useState(initial?.rotation_anchor_date ?? "");
  const [rotation, setRotation] = useState(initial?.rotation.map((r) => r.shift.id) ?? []);
  const [reason, setReason] = useState(
    editor.copy ? `Copy of ${initial?.code}; new rules for future assignments.` : "",
  );
  const [context, setContext] = useState<HrShiftContext | null>(null);
  const [locationSearch, setLocationSearch] = useState("");
  const [locationQuery, setLocationQuery] = useState("");
  const [choices, setChoices] = useState<HrShiftSummary[]>([]);
  const [choiceTotal, setChoiceTotal] = useState(0);
  const [choiceOffset, setChoiceOffset] = useState(0);
  const [optionsBusy, setOptionsBusy] = useState(false);
  const [contextBusy, setContextBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let current = true;
    setContextBusy(true);
    client
      .shiftContext(companyId, locationQuery || undefined)
      .then((result) => {
        if (current) {
          setContext(result);
          setContextBusy(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setContextBusy(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, companyId, locationQuery]);
  useEffect(() => {
    if (kind !== "rotating") return;
    let current = true;
    setOptionsBusy(true);
    client
      .shifts({ companyId, status: "active", leafOnly: true, offset: choiceOffset, limit: 100 })
      .then((result) => {
        if (current) {
          setChoices((values) => (choiceOffset ? [...values, ...result.items] : result.items));
          setChoiceTotal(result.total);
          setOptionsBusy(false);
        }
      })
      .catch((e) => {
        if (current) {
          setError(fail(e));
          setOptionsBusy(false);
        }
      });
    return () => {
      current = false;
    };
  }, [client, companyId, kind, choiceOffset]);
  const endMinute = minutes(end) + (nextDay ? 1440 : 0),
    span = endMinute - minutes(start),
    net = span - breaks.filter((b) => !b.paid).reduce((n, b) => n + b.minutes, 0);
  const eligible = choices.filter(
    (s) => s.configured && s.time_zone === zone && s.work_location_id === (location || null),
  );
  const numeric = (label: string, value: number, set: (n: number) => void, max = 720) => (
    <label className="grid gap-2 text-sm font-medium">
      {label}
      <Input
        type="number"
        min={0}
        max={max}
        step={1}
        value={Number.isNaN(value) ? "" : value}
        disabled={busy}
        onChange={(e) => set(e.target.valueAsNumber)}
      />
    </label>
  );
  const submit = () => {
    const common = { company_id: companyId, code, name, time_zone: zone, work_location_id: location || null, reason };
    const fields =
      kind === "rotating"
        ? { ...common, kind, rotation_anchor_date: anchor, rotation_shift_ids: rotation }
        : {
            ...common,
            kind,
            start_minute: minutes(start),
            end_minute: endMinute,
            required_work_minutes: kind === "flexible" ? required : net,
            grace_in_minutes: graceIn,
            grace_out_minutes: graceOut,
            minimum_present_minutes: minimum,
            half_day_minutes: half,
            overtime_after_minutes: overtime,
            weekly_off_days: off,
            breaks,
          };
    const result =
      initial && !editor.copy
        ? updateHrShiftRequestSchema.safeParse({ ...fields, expected_version: expectedVersion })
        : createHrShiftRequestSchema.safeParse(fields);
    if (!result.success) {
      setError(
        result.error.issues
          .slice(0, 3)
          .map((i) => `${i.path.join(" ")}: ${i.message}`)
          .join(" "),
      );
      return;
    }
    setError("");
    void onSave(result.data, initial && !editor.copy ? initial.id : undefined);
  };
  return (
    <form
      aria-label="Shift rules editor"
      className="grid min-w-0 gap-5 rounded-xl border border-primary/30 bg-card p-5"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-primary">
            {editor.copy
              ? `Copy from ${initial?.code}`
              : initial
                ? `Edit ${initial.code} · version ${expectedVersion}`
                : "New shift"}
          </div>
          <h2 className="mt-1 text-lg font-semibold">Define the working rules</h2>
        </div>
        <Button
          aria-label="Close shift editor"
          type="button"
          size="icon"
          variant="ghost"
          disabled={busy}
          onClick={onClose}
        >
          <X className="size-4" />
        </Button>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Review shift configuration</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-2 text-sm font-medium">
          Shift code
          <Input
            required
            maxLength={32}
            value={code}
            disabled={busy}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="GENERAL"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Shift name
          <Input
            required
            maxLength={160}
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
            placeholder="General office shift"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Shift type
          <select
            className={selectClass}
            value={kind}
            disabled={busy}
            onChange={(e) => {
              const value = e.target.value as typeof kind;
              setKind(value);
              if (value === "night") {
                setStart("22:00");
                setEnd("06:00");
                setNextDay(true);
              }
              if (value === "flexible") {
                setStart("08:00");
                setEnd("20:00");
                setNextDay(false);
                setGraceIn(0);
                setGraceOut(0);
              }
            }}
          >
            {["fixed", "multiple", "night", "flexible", "rotating"].map((k) => (
              <option key={k} value={k}>
                {title(k)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Time zone
          <select
            className={selectClass}
            value={zone}
            disabled={busy}
            onChange={(e) => {
              setZone(e.target.value);
              setRotation([]);
            }}
          >
            {Array.from(new Set([zone, ...(context?.time_zones ?? [])])).map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="grid gap-3 rounded-lg border border-border bg-background/40 p-4">
        <label className="grid gap-2 text-sm font-medium">
          Work location
          <select
            className={selectClass}
            value={location}
            disabled={busy || contextBusy}
            onChange={(e) => {
              setLocation(e.target.value);
              setRotation([]);
            }}
          >
            <option value="">Company-wide</option>
            {initial?.work_location_id && !context?.locations.some((l) => l.id === initial.work_location_id) && (
              <option value={initial.work_location_id}>{initial.work_location} (current)</option>
            )}
            {context?.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name} ({l.code})
              </option>
            ))}
          </select>
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="grid min-w-0 flex-1 gap-2 text-xs text-muted-foreground">
            Find work location
            <Input
              value={locationSearch}
              maxLength={160}
              disabled={busy}
              onChange={(e) => setLocationSearch(e.target.value)}
              placeholder="Search active locations"
            />
          </label>
          <Button
            type="button"
            variant="outline"
            disabled={busy || contextBusy}
            onClick={() => {
              setError("");
              setLocationQuery(locationSearch.trim());
            }}
          >
            Find location
          </Button>
        </div>
        {context?.locations_capped && (
          <p className="text-xs text-muted-foreground">
            Showing the first 100 matches. Refine the location search to find another site.
          </p>
        )}
      </div>
      {kind === "rotating" ? (
        <div className="grid gap-4 rounded-lg border border-border p-4">
          <div>
            <h3 className="text-base font-semibold">Weekly rotation</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Each week uses its member shift’s hours, breaks, thresholds and weekly off days. Members must share this
              timezone and work location.
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Rotation starts on Monday
            <Input required type="date" value={anchor} disabled={busy} onChange={(e) => setAnchor(e.target.value)} />
          </label>
          {rotation.map((id, index) => (
            <div key={index} className="flex min-w-0 items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-2 text-sm font-medium">
                Week {index + 1}
                <select
                  required
                  className={selectClass}
                  value={id}
                  disabled={busy}
                  onChange={(e) => setRotation((values) => values.map((v, i) => (i === index ? e.target.value : v)))}
                >
                  <option value="">Select a configured shift</option>
                  {initial?.rotation.some((r) => r.shift.id === id) && !eligible.some((s) => s.id === id) && (
                    <option value={id}>{initial.rotation.find((r) => r.shift.id === id)?.shift.code} (current)</option>
                  )}
                  {eligible.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} · {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label={`Remove week ${index + 1}`}
                disabled={busy}
                onClick={() => setRotation((values) => values.filter((_, i) => i !== index))}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || rotation.length >= 52}
              onClick={() => setRotation((values) => [...values, ""])}
            >
              <Plus className="size-4" />
              Add week
            </Button>
            {choices.length < choiceTotal && (
              <Button
                type="button"
                variant="outline"
                disabled={optionsBusy || busy}
                onClick={() => setChoiceOffset(choices.length)}
              >
                Load more shifts
              </Button>
            )}
          </div>
          {!eligible.length && !optionsBusy && (
            <p className="text-sm text-muted-foreground">
              Create at least two configured member shifts for this timezone and location first. You can close this form
              without saving.
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Start time
              <Input required type="time" value={start} disabled={busy} onChange={(e) => setStart(e.target.value)} />
            </label>
            <label className="grid gap-2 text-sm font-medium">
              End time
              <Input required type="time" value={end} disabled={busy} onChange={(e) => setEnd(e.target.value)} />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={nextDay} disabled={busy} onCheckedChange={(value) => setNextDay(value === true)} />
            Ends on the following day
          </label>
          <div className="grid gap-3 rounded-lg border border-border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Breaks</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={busy || breaks.length >= 32}
                onClick={() => setBreaks((values) => [...values, { label: "Break", minutes: 15, paid: false }])}
              >
                <Plus className="size-4" />
                Add break
              </Button>
            </div>
            {breaks.map((b, index) => (
              <div
                key={index}
                className="grid min-w-0 items-end gap-3 rounded-lg bg-muted/40 p-3 sm:grid-cols-[minmax(0,1fr)_6rem_auto_auto]"
              >
                <label className="grid gap-2 text-xs font-medium">
                  Break {index + 1} name
                  <Input
                    required
                    maxLength={80}
                    value={b.label}
                    disabled={busy}
                    onChange={(e) =>
                      setBreaks((values) => values.map((v, i) => (i === index ? { ...v, label: e.target.value } : v)))
                    }
                  />
                </label>
                <label className="grid gap-2 text-xs font-medium">
                  Minutes
                  <Input
                    required
                    type="number"
                    min={1}
                    max={720}
                    value={Number.isNaN(b.minutes) ? "" : b.minutes}
                    disabled={busy}
                    onChange={(e) =>
                      setBreaks((values) =>
                        values.map((v, i) => (i === index ? { ...v, minutes: e.target.valueAsNumber } : v)),
                      )
                    }
                  />
                </label>
                <label className="flex h-10 items-center gap-2 text-sm">
                  <Checkbox
                    checked={b.paid}
                    disabled={busy}
                    onCheckedChange={(value) =>
                      setBreaks((values) => values.map((v, i) => (i === index ? { ...v, paid: value === true } : v)))
                    }
                  />
                  Paid break {index + 1}
                </label>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={`Remove break ${index + 1}`}
                  disabled={busy}
                  onClick={() => setBreaks((values) => values.filter((_, i) => i !== index))}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">
              Unpaid breaks reduce required work time. Paid breaks remain inside the shift’s paid time; actual
              attendance and approved overtime are processed separately.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium">
              Required work (minutes)
              <Input
                type="number"
                required
                min={1}
                max={1440}
                readOnly={kind !== "flexible"}
                value={kind === "flexible" ? (Number.isNaN(required) ? "" : required) : Number.isFinite(net) ? net : ""}
                disabled={busy}
                onChange={(e) => setRequired(e.target.valueAsNumber)}
              />
            </label>
            {numeric("Absent below (minutes)", minimum, setMinimum, 1439)}
            {numeric("Half day below (minutes)", half, setHalf, 1439)}
            {numeric("Overtime buffer (minutes)", overtime, setOvertime)}
            {kind !== "flexible" && (
              <>
                {numeric("Arrival grace (minutes)", graceIn, setGraceIn)}
                {numeric("Departure grace (minutes)", graceOut, setGraceOut)}
              </>
            )}
          </div>
          <fieldset className="m-0 min-w-0 rounded-lg border border-border p-4">
            <legend className="px-1 text-sm font-semibold">Weekly off days</legend>
            <div className="flex flex-wrap gap-4">
              {days.map((day, index) => (
                <label key={day} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={off.includes(index)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setOff((values) => (checked ? [...values, index].sort() : values.filter((n) => n !== index)))
                    }
                  />
                  {day}
                </label>
              ))}
            </div>
          </fieldset>
          <div role="status" className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">
            Window: {Number.isFinite(span) && span > 0 ? hours(span) : "Review times"} · Net time:{" "}
            {Number.isFinite(net) && net > 0 ? hours(net) : "Review breaks"}
            {kind === "flexible"
              ? " · Flexible shifts use the required duration without fixed arrival/departure penalties."
              : ""}
          </div>
        </>
      )}
      <label className="grid gap-2 text-sm font-medium">
        Change reason
        <Textarea
          required
          minLength={8}
          maxLength={1000}
          rows={3}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Explain the company working arrangement and reason for these rules"
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="text-primary-foreground!" disabled={busy || !context || contextBusy}>
          {busy ? "Saving…" : initial && !editor.copy ? "Save shift rules" : "Create shift"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function HrShiftsWorkspace({ onNavigate }: { onNavigate: (moduleId: string, pageId: string) => void }) {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.shift.read") ?? false,
    canManage = session?.user.permissions.includes("hr.attendance.shift.manage") ?? false;
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [company, setCompany] = useState("");
  const [directory, setDirectory] = useState<HrShiftDirectory>({ items: [], total: 0 }),
    [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<HrShiftDetail | null>(null);
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [onDate, setOnDate] = useState("");
  const [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [revision, setRevision] = useState(0),
    [statusReason, setStatusReason] = useState("");
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!canRead) return;
    let current = true;
    setLoading(true);
    client
      .companies()
      .then((result) => {
        if (current) {
          setCompanies(result.items);
          setCompany((value) => (result.items.some((c) => c.id === value) ? value : (result.items[0]?.id ?? "")));
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
  }, [canRead, client, revision]);
  useEffect(() => {
    if (!company || !canRead) return;
    let current = true;
    setLoading(true);
    client
      .shifts({ companyId: company, search: applied || undefined, status: status || undefined, offset })
      .then((result) => {
        if (current) {
          setDirectory(result);
          setSelected((value) => (result.items.some((s) => s.id === value) ? value : (result.items[0]?.id ?? "")));
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
  }, [client, company, canRead, applied, status, offset, revision]);
  useEffect(() => {
    if (!company || !selected) {
      setDetail(null);
      return;
    }
    let current = true;
    setDetailLoading(true);
    client
      .shift(company, selected, onDate || undefined)
      .then((result) => {
        if (current) {
          setDetail(result);
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
  }, [client, company, selected, onDate, revision]);
  const reload = useCallback(() => setRevision((value) => value + 1), []);
  const save = async (input: CreateHrShiftRequest | UpdateHrShiftRequest, id?: string) => {
    if (mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify([id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = id
        ? await client.updateShift(id, input as UpdateHrShiftRequest, csrfToken(), retry.current.key)
        : await client.createShift(input, csrfToken(), retry.current.key);
      setEditor(null);
      setSelected(result.id);
      setSearch(result.code);
      setApplied(result.code);
      setOffset(0);
      setStatus("");
      setNotice(`Shift ${result.code} saved. Employee allocation and attendance processing remain separate steps.`);
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
  const changeStatus = async () => {
    if (!detail || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const input = {
      company_id: company,
      expected_version: detail.version,
      status: detail.status === "active" ? ("inactive" as const) : ("active" as const),
      reason: statusReason,
    };
    const fingerprint = JSON.stringify([detail.id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.shiftStatus(detail.id, input, csrfToken(), retry.current.key);
      setStatusReason("");
      setNotice(`Shift ${detail.code} is now ${input.status}. Rule history is preserved.`);
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
        <AlertTitle>Shift access required</AlertTitle>
        <AlertDescription>
          Sign in with attendance shift read permission to review company working rules.
        </AlertDescription>
      </Alert>
    );
  const current = detail?.id === selected && detail.company_id === company ? detail : null;
  return (
    <section
      aria-label="Live shifts and rules"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-5">
        <div className="flex min-w-0 gap-3">
          <Clock3 className="mt-1 size-6 shrink-0 text-primary" />
          <div>
            <h2 className="text-lg font-semibold">Consistent working rules across the company</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Define hours, breaks and attendance thresholds in the company’s timezone. Referenced rules stay protected
              so historical attendance remains reliable. Creating a shift does not assign employees or approve overtime.
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
          <Button
            type="button"
            variant="outline"
            disabled={busy || !!editor}
            onClick={() => onNavigate("hr", "shift-assignments")}
          >
            Assign shifts
          </Button>
          {canManage && (
            <Button
              type="button"
              className="text-primary-foreground!"
              disabled={busy || !company || !!editor}
              onClick={() => {
                setEditor({ copy: false });
                setError("");
                setNotice("");
              }}
            >
              <Plus className="size-4" />
              New shift
            </Button>
          )}
        </div>
      </div>
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Shift action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <form
        className="grid gap-4 rounded-xl border border-border bg-card p-4 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_10rem_auto]"
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
            className={selectClass}
            value={company}
            disabled={busy || !!editor}
            onChange={(e) => {
              setCompany(e.target.value);
              setDirectory({ items: [], total: 0 });
              setSelected("");
              setDetail(null);
              setOffset(0);
              setError("");
              setNotice("");
              setStatusReason("");
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
        <label className="grid min-w-0 gap-2 text-sm font-medium">
          Search shifts
          <Input
            value={search}
            maxLength={160}
            disabled={busy || !!editor}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name"
          />
        </label>
        <label className="grid gap-2 text-sm font-medium">
          Status
          <select
            className={selectClass}
            disabled={busy || !!editor}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </label>
        <Button className="self-end" type="submit" variant="outline" disabled={busy || !!editor || !company}>
          <Search className="size-4" />
          Search
        </Button>
      </form>
      {editor && (
        <ShiftEditor
          key={`${editor.detail?.id ?? "new"}:${editor.copy}`}
          client={client}
          companyId={company}
          editor={editor}
          busy={busy}
          onSave={save}
          onClose={() => setEditor(null)}
        />
      )}
      {!company && !loading && (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          No authorized company is available. Ask your administrator to review company access.
        </p>
      )}
      {company && (
        <div className="grid min-w-0 items-start gap-5 xl:grid-cols-[minmax(15rem,0.8fr)_minmax(0,2fr)]">
          <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border p-4">
              <h3 className="text-sm font-semibold">Company shifts</h3>
              <Badge variant="secondary">{directory.total}</Badge>
            </div>
            {loading && !directory.items.length ? (
              <Skeleton className="m-4 h-40" />
            ) : directory.items.length ? (
              <div className="grid max-h-80 gap-2 overflow-y-auto p-3 xl:max-h-[48rem]">
                {directory.items.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    aria-pressed={selected === s.id}
                    disabled={busy || !!editor}
                    onClick={() => {
                      setSelected(s.id);
                      setDetail(null);
                      setError("");
                      setNotice("");
                      setStatusReason("");
                    }}
                    className={`grid min-w-0 gap-2 rounded-lg border p-3 text-left text-foreground transition-colors focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-60 ${selected === s.id ? "border-primary bg-primary/10" : "border-border bg-background hover:bg-muted"}`}
                  >
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-semibold">{s.code}</span>
                      <Badge variant={s.status === "active" ? "secondary" : "outline"}>{title(s.status)}</Badge>
                    </span>
                    <span className="break-words text-sm">{s.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {title(s.kind)} ·{" "}
                      {s.kind === "rotating"
                        ? "Weekly cycle"
                        : `${time(s.start_minute)}–${time(s.end_minute)}${s.end_minute >= 1440 ? " +1 day" : ""}`}
                    </span>
                    {!s.configured && (
                      <span className="text-xs font-medium text-destructive">Configuration required</span>
                    )}
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid gap-2 p-5">
                <h3 className="text-base font-semibold">No shifts to display</h3>
                <p className="text-sm text-muted-foreground">
                  Create a company shift or adjust the search and status filters. No sample shifts are substituted.
                </p>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border p-3">
              <Button
                variant="outline"
                size="sm"
                disabled={busy || loading || !!editor || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 50))}
              >
                Previous
              </Button>
              <span className="text-xs text-muted-foreground">
                {directory.total ? `${offset + 1}–${Math.min(offset + 50, directory.total)}` : "0"} of {directory.total}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={busy || loading || !!editor || offset + 50 >= directory.total}
                onClick={() => setOffset(offset + 50)}
              >
                Next
              </Button>
            </div>
          </section>
          <div className="grid min-w-0 gap-5" aria-busy={detailLoading || busy}>
            {detailLoading && !current ? (
              <Skeleton className="h-96 w-full" />
            ) : current ? (
              <>
                <section className="overflow-hidden rounded-xl border border-border bg-card">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
                    <div>
                      <div className="text-xs font-semibold uppercase tracking-wider text-primary">
                        {current.code} · version {current.version}
                      </div>
                      <h2 className="mt-2 break-words text-xl font-semibold">{current.name}</h2>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {title(current.kind)} · {current.time_zone ?? "Timezone not configured"} ·{" "}
                        {current.work_location ?? "Company-wide"}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !!editor || detailLoading || current.rules_locked}
                          onClick={() => {
                            setEditor({ detail: current, copy: false });
                            setError("");
                          }}
                        >
                          Edit rules
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          disabled={busy || !!editor || detailLoading}
                          onClick={() => {
                            setEditor({ detail: current, copy: true });
                            setError("");
                          }}
                        >
                          <Copy className="size-4" />
                          Copy to new shift
                        </Button>
                      </div>
                    )}
                  </div>
                  {!current.configured && (
                    <div role="status" className="m-5 rounded-lg border border-border bg-muted/50 p-4 text-sm">
                      This existing shift needs timezone and work-rule configuration before new assignments. Referenced
                      legacy rules remain preserved; use a new shift code when editing is locked.
                    </div>
                  )}
                  {current.rules_locked && (
                    <div className="m-5 flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm text-muted-foreground">
                      <ShieldCheck className="size-5 shrink-0 text-primary" />
                      Assignments or rotation references protect these rules. Copy to a new code when the working
                      arrangement changes.
                    </div>
                  )}
                  {current.kind !== "rotating" ? (
                    <>
                      <dl className="m-0 grid gap-3 p-5 sm:grid-cols-2">
                        <Rule
                          label="Working window"
                          value={`${time(current.start_minute)}–${time(current.end_minute)}${current.end_minute >= 1440 ? " (following day)" : ""}`}
                        />
                        <Rule
                          label="Required work"
                          value={
                            current.required_work_minutes ? hours(current.required_work_minutes) : "Needs configuration"
                          }
                        />
                        <Rule
                          label="Absent / half-day thresholds"
                          value={`Below ${current.minimum_present_minutes}m / below ${current.half_day_minutes}m`}
                        />
                        <Rule
                          label="Arrival / departure grace"
                          value={
                            current.kind === "flexible"
                              ? "Flexible duration; no fixed-time penalties"
                              : `${current.grace_in_minutes}m / ${current.grace_out_minutes}m`
                          }
                        />
                        <Rule
                          label="Overtime eligibility buffer"
                          value={`${current.overtime_after_minutes}m beyond required work; separate approval`}
                        />
                        <Rule
                          label="Weekly off"
                          value={
                            current.weekly_off_days.map((d) => days[d]).join(", ") || "No weekly off days configured"
                          }
                        />
                      </dl>
                      <div className="border-t border-border p-5">
                        <h3 className="text-sm font-semibold">Break policy</h3>
                        <div className="mt-3 grid gap-2">
                          {current.breaks.length ? (
                            current.breaks.map((b, i) => (
                              <div
                                key={i}
                                className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/40 p-3 text-sm"
                              >
                                <span>
                                  {b.label} · {b.minutes} minutes
                                </span>
                                <Badge variant="outline">{b.paid ? "Paid" : "Unpaid"}</Badge>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No scheduled breaks.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="grid gap-4 p-5">
                      <p className="text-sm text-muted-foreground">
                        Week 1 starts Monday {current.rotation_anchor_date ?? "(anchor not configured)"}. The cycle
                        repeats every {current.rotation.length} weeks; each member supplies its own rules.
                      </p>
                      <ol className="m-0 grid list-none gap-2 p-0">
                        {current.rotation.map((r) => (
                          <li key={r.position} className="flex min-w-0 gap-3 rounded-lg border border-border p-3">
                            <Badge variant="secondary">Week {r.position}</Badge>
                            <div className="min-w-0">
                              <div className="break-words text-sm font-semibold">
                                {r.shift.code} · {r.shift.name}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {time(r.shift.start_minute)}–{time(r.shift.end_minute)}
                                {r.shift.end_minute >= 1440 ? " +1 day" : ""} ·{" "}
                                {r.shift.required_work_minutes
                                  ? hours(r.shift.required_work_minutes)
                                  : "Needs configuration"}
                              </p>
                            </div>
                          </li>
                        ))}
                      </ol>
                      <label className="grid gap-2 text-sm font-medium">
                        Preview working date
                        <Input
                          type="date"
                          value={onDate || current.preview_date}
                          disabled={busy || !!editor}
                          onChange={(e) => setOnDate(e.target.value)}
                        />
                      </label>
                      <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-sm">
                        {current.resolved
                          ? `${current.preview_date}: ${current.resolved.code} · ${time(current.resolved.start_minute)}–${time(current.resolved.end_minute)}${current.resolved.end_minute >= 1440 ? " (following day)" : ""}`
                          : "Complete the cycle configuration before resolving a working date."}
                      </div>
                    </div>
                  )}
                </section>
                {canManage && !editor && (
                  <form
                    className="grid gap-3 rounded-xl border border-border bg-card p-5"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void changeStatus();
                    }}
                  >
                    <h3 className="text-sm font-semibold">Availability</h3>
                    <p className="text-sm text-muted-foreground">
                      {title(current.status)}. Current/future assignments and active rotations must be moved before
                      deactivation. Existing history is retained.
                    </p>
                    <label className="grid gap-2 text-sm font-medium">
                      Status change reason
                      <Textarea
                        required
                        minLength={8}
                        maxLength={1000}
                        rows={2}
                        value={statusReason}
                        disabled={busy}
                        onChange={(e) => setStatusReason(e.target.value)}
                      />
                    </label>
                    <Button
                      type="submit"
                      variant="outline"
                      className="justify-self-start"
                      disabled={busy || detailLoading || statusReason.trim().length < 8}
                    >
                      {current.status === "active" ? "Deactivate shift" : "Reactivate shift"}
                    </Button>
                  </form>
                )}
                <section className="rounded-xl border border-border bg-card p-5">
                  <h3 className="text-base font-semibold">Rule history</h3>
                  <div className="mt-4 grid gap-3">
                    {current.history.length ? (
                      current.history.map((h) => (
                        <div key={h.id} className="rounded-lg border border-border bg-background/50 p-3">
                          <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                            <span>
                              Version {h.version} · {title(h.action)} · {h.actor_name}
                            </span>
                            <time dateTime={h.occurred_at}>{new Date(h.occurred_at).toLocaleString()}</time>
                          </div>
                          <p className="mt-2 break-words text-sm">{h.reason}</p>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        This legacy shift has no recorded rule changes in the live workspace yet.
                      </p>
                    )}
                  </div>
                </section>
              </>
            ) : (
              <div className="rounded-xl border border-dashed border-border p-8 text-sm text-muted-foreground">
                Select a shift to review its working rules and change history.
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
