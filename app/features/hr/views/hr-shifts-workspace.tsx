"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { readHrOperationsScope, useHrOperationsScope } from "../components/hr-operations-scope";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
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
import { Plus, ShieldCheck, Trash2, CheckCircle2, X } from "lucide-react";
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
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterSheet } from "../components/hr-master-sheet";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import {
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";

import { SearchableSelect } from "@/shared/ui/searchable-select";
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
const shiftWindow = (s: HrShiftSummary) =>
  s.kind === "rotating"
    ? "Weekly cycle"
    : `${time(s.start_minute)}–${time(s.end_minute)}${s.end_minute >= 1440 ? " +1 day" : ""}`;

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
  const code = editor.copy ? "AUTO" : (initial?.code ?? "AUTO");
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
  // Typing in the Work location dropdown searches the server after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setLocationQuery(locationSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [locationSearch]);
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
    <label className="grid content-start gap-2 text-sm font-medium">
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
    <WorkForm
      aria-label="Shift rules editor"
      className="grid min-w-0 gap-5 rounded-lg border border-border bg-card p-4"
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
      <HrDetailSection title="Shift">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid content-start gap-2 text-sm font-medium">
            Shift code (automatic)
            <Input
              required
              maxLength={32}
              value={code === "AUTO" ? "Assigned on save · SHF-001…" : code}
              readOnly
              disabled={busy}
              placeholder="GENERAL"
            />
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
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
          <label className="grid content-start gap-2 text-sm font-medium">
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
          <label className="grid content-start gap-2 text-sm font-medium">
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
      </HrDetailSection>
      <HrDetailSection title="Work location">
        <div className="grid content-start gap-2 text-sm font-medium">
          <label htmlFor="hr-shift-work-location">Work location</label>
          <SearchableSelect
            id="hr-shift-work-location"
            label="Work location"
            value={location}
            placeholder="Company-wide"
            searchPlaceholder="Search active locations…"
            disabled={busy}
            loading={contextBusy && !context}
            search={locationSearch}
            onSearchChange={setLocationSearch}
            options={[
              { value: "", label: "Company-wide" },
              ...(initial?.work_location_id && !context?.locations.some((l) => l.id === initial.work_location_id)
                ? [{ value: initial.work_location_id, label: `${initial.work_location} (current)` }]
                : []),
              ...(context?.locations.map((l) => ({ value: l.id, label: `${l.name} (${l.code})` })) ?? []),
            ]}
            onValueChange={(next) => {
              setLocation(next);
              setRotation([]);
            }}
          />
        </div>
      </HrDetailSection>
      {kind === "rotating" ? (
        <HrDetailSection title="Weekly rotation">
          <label className="grid content-start gap-2 text-sm font-medium">
            Rotation starts on Monday
            <Input required type="date" value={anchor} disabled={busy} onChange={(e) => setAnchor(e.target.value)} />
          </label>
          {rotation.map((id, index) => (
            <div key={index} className="flex min-w-0 items-end gap-2">
              <label className="grid content-start min-w-0 flex-1 gap-2 text-sm font-medium">
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
        </HrDetailSection>
      ) : (
        <>
          <HrDetailSection title="Working hours">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid content-start gap-2 text-sm font-medium">
                Start time
                <Input required type="time" value={start} disabled={busy} onChange={(e) => setStart(e.target.value)} />
              </label>
              <label className="grid content-start gap-2 text-sm font-medium">
                End time
                <Input required type="time" value={end} disabled={busy} onChange={(e) => setEnd(e.target.value)} />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={nextDay} disabled={busy} onCheckedChange={(value) => setNextDay(value === true)} />
              Ends on the following day
            </label>
          </HrDetailSection>
          <HrDetailSection title="Breaks">
            <div className="flex flex-wrap items-center justify-end gap-2">
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
                <label className="grid content-start gap-2 text-xs font-medium">
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
                <label className="grid content-start gap-2 text-xs font-medium">
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
          </HrDetailSection>
          <HrDetailSection title="Attendance rules">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid content-start gap-2 text-sm font-medium">
                Required work (minutes)
                <Input
                  type="number"
                  required
                  min={1}
                  max={1440}
                  readOnly={kind !== "flexible"}
                  value={
                    kind === "flexible" ? (Number.isNaN(required) ? "" : required) : Number.isFinite(net) ? net : ""
                  }
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
          </HrDetailSection>
          <HrDetailSection title="Weekly off days">
            <fieldset className="m-0 min-w-0 border-0 p-0">
              <legend className="sr-only">Weekly off days</legend>
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
          </HrDetailSection>
          <div role="status" className="rounded-lg bg-primary/5 p-3 text-sm text-muted-foreground">
            Window: {Number.isFinite(span) && span > 0 ? hours(span) : "Review times"} · Net time:{" "}
            {Number.isFinite(net) && net > 0 ? hours(net) : "Review breaks"}
            {kind === "flexible"
              ? " · Flexible shifts use the required duration without fixed arrival/departure penalties."
              : ""}
          </div>
        </>
      )}
      <HrDetailSection title="Change reason">
        <label className="grid content-start gap-2 text-sm font-medium">
          Change reason
          <Textarea
            maxLength={1000}
            rows={3}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain the company working arrangement and reason for these rules"
          />
        </label>
      </HrDetailSection>
      <HrDrawerActions>
        <Button type="submit" className="text-primary-foreground!" disabled={busy || !context || contextBusy}>
          {busy ? "Saving…" : initial && !editor.copy ? "Save shift rules" : "Create shift"}
        </Button>
      </HrDrawerActions>
    </WorkForm>
  );
}

export function HrShiftsWorkspace({
  initialReference,
}: {
  initialReference?: string;
  /** Kept for the shell's call signature; shift assignment is reached from the side menu. */
  onNavigate: (moduleId: string, pageId: string) => void;
}) {
  const [workPageSize, setWorkPageSize] = useState(25);
  const initialScope = useMemo(() => readHrOperationsScope(initialReference), [initialReference]);
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = session?.user.permissions.includes("hr.attendance.shift.read") ?? false,
    canManage = session?.user.permissions.includes("hr.attendance.shift.manage") ?? false;
  const [company, setCompany] = useState(initialScope.company_id ?? "");
  const [directory, setDirectory] = useState<HrShiftDirectory>({ items: [], total: 0 }),
    [selected, setSelected] = useState("");
  const [detail, setDetail] = useState<HrShiftDetail | null>(null);
  const [search, setSearch] = useState(""),
    [applied, setApplied] = useState(""),
    [status, setStatus] = useState<HrMasterStatus>("active"),
    [offset, setOffset] = useState(0),
    [onDate, setOnDate] = useState("");
  const [loading, setLoading] = useState(false),
    [detailLoading, setDetailLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [editor, setEditor] = useState<Editor | null>(null),
    [revision, setRevision] = useState(0);
  const mutation = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useHrOperationsScope(company);
  useEffect(() => {
    if (!canRead) return;
    let current = true;
    setLoading(true);
    client
      .companies()
      .then((result) => {
        if (current) {
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
      .shifts({ companyId: company, search: applied || undefined, status: status === "all" ? undefined : status, offset, limit: workPageSize })
      .then((result) => {
        if (current) {
          setDirectory(result);
          setSelected((value) => (result.items.some((s) => s.id === value) ? value : ""));
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
  }, [client, company, canRead, applied, status, offset, revision, workPageSize]);
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
      setStatus("all");
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
  /** One-click deactivate/reactivate from the drawer footer; the API still records actor, time and this reason. */
  const changeStatus = async () => {
    if (!detail || mutation.current) return;
    mutation.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const deactivating = detail.status === "active";
    const input = {
      company_id: company,
      expected_version: detail.version,
      status: deactivating ? ("inactive" as const) : ("active" as const),
      reason: deactivating ? "Deactivated from Shifts & Rules." : "Reactivated from Shifts & Rules.",
    };
    const fingerprint = JSON.stringify([detail.id, input]);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.shiftStatus(detail.id, input, csrfToken(), retry.current.key);
      setNotice(`Shift ${detail.code} ${deactivating ? "deactivated" : "reactivated"}.`);
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
  const summary = directory.items.find((s) => s.id === selected);
  const openShift = (id: string) => {
    if (busy || editor) return;
    setSelected(id);
    setDetail(null);
    setOnDate("");
    setError("");
    setNotice("");
  };
  const closeShift = () => {
    if (busy) return;
    setSelected("");
    setDetail(null);
    setOnDate("");
  };
  const openRow = (s: HrShiftSummary) => ({
    role: "button" as const,
    tabIndex: 0,
    "aria-label": `Open ${s.name} (${s.code})`,
    onClick: () => openShift(s.id),
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openShift(s.id);
      }
    },
  });
  return (
    <section
      aria-label="Live shifts and rules"
      className="grid min-w-0 gap-4 font-sans text-foreground [&_label]:gap-1.5 [&_label]:leading-tight [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0"
    >
      {error && !selected && (
        <Alert variant="destructive">
          <AlertTitle>Shift action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {notice && !selected && (
        <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
          <CheckCircle2 className="size-5 shrink-0 text-primary" />
          {notice}
        </div>
      )}
      <WorkForm
        aria-label="Find shifts"
        className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setApplied(search.trim());
          setOffset(0);
        }}
      >
        <label className="grid content-start min-w-0 gap-2 text-sm font-medium">
          Search shifts
          <Input
            type="search"
            value={search}
            maxLength={160}
            disabled={busy || !!editor}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Code or name, then press Enter"
          />
        </label>
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
      </WorkForm>
      <HrMasterStatusFilter
        value={status}
        onChange={(next) => {
          setStatus(next);
          setOffset(0);
        }}
      />
      {editor && (
        <HrRecordDrawer
          title={editor?.copy ? "Copy shift" : editor?.detail ? "Edit shift rules" : "Add shift"}
          open={!!editor}
          onClose={() => setEditor(null)}
          busy={busy}
          error={error}
          notice={notice}
        >
          <ShiftEditor
            key={`${editor.detail?.id ?? "new"}:${editor.copy}`}
            client={client}
            companyId={company}
            editor={editor}
            busy={busy}
            onSave={save}
            onClose={() => setEditor(null)}
          />
        </HrRecordDrawer>
      )}
      {!company && !loading && (
        <p className="rounded-lg border border-border bg-card p-5 text-sm text-muted-foreground">
          No authorized company is available. Ask your administrator to review company access.
        </p>
      )}
      {company && (
        <div className="relative overflow-hidden rounded-lg border border-border bg-card shadow-sm">
          {loading && !directory.items.length ? (
            <div className="grid gap-2 p-4" aria-live="polite">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <WorkTable paging={false} tableId="app/features/hr/views/hr-shifts-workspace:1" className="w-full min-w-180 border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="w-px whitespace-nowrap px-4 py-3">Shift code</th>
                    <th className="px-4 py-3">Shift</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Working hours</th>
                    <th className="px-4 py-3">Time zone</th>
                    <th className="px-4 py-3">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {directory.items.map((s) => (
                    <tr
                      key={s.id}
                      aria-disabled={busy || !!editor}
                      className={`cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${selected === s.id ? "bg-primary/5" : ""}`}
                      {...openRow(s)}
                    >
                      <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold text-foreground">{s.code}</td>
                      <td className="px-4 py-3 font-medium text-foreground">{s.name}</td>
                      <td className="px-4 py-3 text-muted-foreground">{title(s.kind)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{shiftWindow(s)}</td>
                      <td className="px-4 py-3 text-muted-foreground">{s.time_zone ?? "Not configured"}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={s.status === "active" ? "secondary" : "outline"}>
                            {s.status === "active" ? "Active" : "Deactivated"}
                          </Badge>
                          {!s.configured && (
                            <span className="text-xs font-medium text-destructive">Configuration required</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {directory.items.length === 0 && (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                        No shifts match this company, search and status. No sample shifts are substituted.
                      </td>
                    </tr>
                  )}
                </tbody>
              </WorkTable>
            </div>
          )}
          <WorkOffsetPagination
            busy={busy || loading || !!editor}
            total={directory.total}
            offset={offset}
            size={workPageSize}
            previousDisabled={busy || loading || !!editor || offset === 0}
            nextDisabled={busy || loading || !!editor || offset + workPageSize >= directory.total}
            onSizeChange={(size) => {
              setWorkPageSize(size);
              setOffset(0);
            }}
            onPrevious={() => setOffset(Math.max(0, offset - workPageSize))}
            onNext={() => setOffset(offset + workPageSize)}
          />
        </div>
      )}
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) closeShift();
        }}
        eyebrow="Shifts & Rules"
        title={current?.name ?? summary?.name ?? "Shift"}
        description={
          current
            ? `${current.code} · version ${current.version} · ${title(current.kind)} · ${current.time_zone ?? "Timezone not configured"} · ${current.work_location ?? "Company-wide"}`
            : summary
              ? `${summary.code} · ${title(summary.kind)}`
              : ""
        }
        footer={
          canManage && current ? (
            <>
              <Button
                type="button"
                variant="outline"
                disabled={busy || !!editor || detailLoading}
                onClick={() => void changeStatus()}
              >
                {busy ? "Saving…" : current.status === "active" ? "Deactivate" : "Reactivate"}
              </Button>
              <HrEditButton
                label="Edit rules"
                disabled={busy || !!editor || detailLoading || current.rules_locked}
                onClick={() => {
                  setEditor({ detail: current, copy: false });
                  setError("");
                }}
              />
            </>
          ) : undefined
        }
      >
        <div className="grid min-w-0 gap-5" aria-busy={detailLoading || busy}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Shift action needs attention</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {notice && (
            <div role="status" className="flex gap-2 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              <CheckCircle2 className="size-5 shrink-0 text-primary" />
              {notice}
            </div>
          )}
          {detailLoading && !current ? (
            <Skeleton className="h-80 w-full" />
          ) : current ? (
            <>
              <HrDetailSummary code={current.code} status={current.status}>
                {current.kind === "rotating" ? `${current.rotation.length}-week cycle` : shiftWindow(current)} ·{" "}
                {current.work_location ?? "Company-wide"}
              </HrDetailSummary>
              {!current.configured && (
                <div role="status" className="rounded-lg border border-border bg-muted/50 p-3 text-sm">
                  This existing shift needs timezone and work-rule configuration before new assignments. Referenced
                  legacy rules remain preserved; use a new shift code when editing is locked.
                </div>
              )}
              {current.rules_locked && (
                <div className="flex gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm text-muted-foreground">
                  <ShieldCheck className="size-5 shrink-0 text-primary" />
                  Assignments or rotation references lock these rules.
                </div>
              )}
              <HrDetailGroup title="Details">
                <HrDetailTile label="Shift type" value={title(current.kind)} />
                <HrDetailTile label="Version" value={String(current.version)} />
                <HrDetailTile label="Time zone" value={current.time_zone ?? "Timezone not configured"} />
                <HrDetailTile label="Work location" value={current.work_location ?? "Company-wide"} />
              </HrDetailGroup>
              {current.kind !== "rotating" ? (
                <>
                  <HrDetailGroup title="Working rules">
                    <HrDetailTile
                      label="Working window"
                      value={`${time(current.start_minute)}–${time(current.end_minute)}${current.end_minute >= 1440 ? " (following day)" : ""}`}
                    />
                    <HrDetailTile
                      label="Required work"
                      value={
                        current.required_work_minutes ? hours(current.required_work_minutes) : "Needs configuration"
                      }
                    />
                    <HrDetailTile
                      label="Absent / half-day thresholds"
                      value={`Below ${current.minimum_present_minutes}m / below ${current.half_day_minutes}m`}
                    />
                    <HrDetailTile
                      label="Arrival / departure grace"
                      value={
                        current.kind === "flexible"
                          ? "Flexible duration; no fixed-time penalties"
                          : `${current.grace_in_minutes}m / ${current.grace_out_minutes}m`
                      }
                    />
                    <HrDetailTile
                      label="Overtime eligibility buffer"
                      value={`${current.overtime_after_minutes}m beyond required work; separate approval`}
                    />
                    <HrDetailTile
                      label="Weekly off"
                      value={current.weekly_off_days.map((d) => days[d]).join(", ") || "No weekly off days configured"}
                    />
                  </HrDetailGroup>
                  <HrDetailSection title="Break policy">
                    {current.breaks.length ? (
                      current.breaks.map((b, i) => (
                        <div
                          key={i}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-muted/35 p-3 text-sm"
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
                  </HrDetailSection>
                </>
              ) : (
                <HrDetailSection title="Weekly rotation">
                  <p className="text-sm text-muted-foreground">
                    Week 1 starts Monday{" "}
                    {current.rotation_anchor_date
                      ? hrDisplayDate(current.rotation_anchor_date)
                      : "(anchor not configured)"}
                    . The cycle repeats every {current.rotation.length} weeks; each member supplies its own rules.
                  </p>
                  <ol className="m-0 grid list-none gap-2 p-0">
                    {current.rotation.map((r) => (
                      <li
                        key={r.position}
                        className="flex min-w-0 gap-3 rounded-lg border border-border bg-muted/35 p-3"
                      >
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
                  <label className="grid content-start gap-2 text-sm font-medium">
                    Preview working date
                    <Input
                      type="date"
                      value={onDate || current.preview_date}
                      disabled={busy || !!editor}
                      onChange={(e) => setOnDate(e.target.value)}
                    />
                  </label>
                  <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
                    {current.resolved
                      ? `${hrDisplayDate(current.preview_date)}: ${current.resolved.code} · ${time(current.resolved.start_minute)}–${time(current.resolved.end_minute)}${current.resolved.end_minute >= 1440 ? " (following day)" : ""}`
                      : "Complete the cycle configuration before resolving a working date."}
                  </div>
                </HrDetailSection>
              )}
              <HrDetailSection title="Rule history">
                {current.history.length ? (
                  current.history.map((h) => (
                    <div key={h.id} className="rounded-lg border border-border bg-muted/35 p-3">
                      <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                        <span>
                          Version {h.version} · {title(h.action)} · {h.actor_name}
                        </span>
                        <time dateTime={h.occurred_at}>{hrDisplayDate(h.occurred_at, true)}</time>
                      </div>
                      <p className="mt-2 break-words text-sm">{h.reason}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    This legacy shift has no recorded rule changes in the live workspace yet.
                  </p>
                )}
              </HrDetailSection>
            </>
          ) : null}
        </div>
      </HrMasterSheet>
    </section>
  );
}
