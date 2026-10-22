"use client";
import { learningCertificateHtml } from "../components/learning-certificate";
import { attendanceLabel as label } from "../components/attendance-status";
import { useId, useRef, useState } from "react";
import { BookOpen, RefreshCw, Plus, Download, ArrowRight, CalendarDays, Award } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrCompanyScope } from "../components/hr-company-scope";
import { Field, State, Metric, panel, selectClass, useAttendanceRead } from "../components/hr-workspace-controls";
import {
  hrLearningActionSchema,
  type HrLearningTerms,
  type HrLearningRecord,
  type HrLearningQuery,
} from "@nexora/contracts";
type Navigate = (module: string, page: string, reference?: string) => void;
export const learningPages = [
  "training-programs",
  "training-requests",
  "training-sessions",
  "training-completions",
] as const;
const sections = ["programmes", "requests", "sessions", "completions"] as const;
type Section = (typeof sections)[number];
type Editable = Extract<HrLearningTerms, { kind: "programme" | "request" | "session" }>;
const title = (r: HrLearningRecord) =>
  r.terms.kind === "programme"
    ? r.terms.name
    : r.terms.kind === "session"
      ? r.terms.title
      : r.terms.kind === "completion"
        ? r.terms.programme_name
        : r.employee_name || r.id;
const names: Record<string, string> = {
  activate: "Publish programme",
  archive: "Archive programme",
  submit: "Submit to reporting manager",
  manager_approve: "Approve as reporting manager",
  hr_approve: "Approve as HR",
  reject: "Reject request",
  cancel: "Cancel",
  schedule: "Schedule session",
  close: "Close session",
  withdraw: "Withdraw participant",
  propose_completion: "Submit completion evidence",
  finalize: "Verify completion & result",
  revoke: "Revoke certificate",
  void: "Return evidence for correction",
};
const localInput = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? ""
    : new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const isoInput = (value: string) => (value ? new Date(value).toISOString() : "");
export function HrLearningBody({
  company,
  section,
  mode = "hr",
  onBusy,
  onNavigate,
}: {
  company: string;
  section: Section;
  mode?: "hr" | "mine";
  onBusy?: (busy: boolean) => void;
  onNavigate?: Navigate;
}) {
  const mandatoryId = useId();
  const { api, csrfToken } = useSession(),
    client = new HrApiClient(api);
  const [revision, setRevision] = useState(0),
    [offset, setOffset] = useState(0),
    [selected, setSelected] = useState(""),
    [search, setSearch] = useState(""),
    [draftSearch, setDraftSearch] = useState(""),
    [state, setState] = useState("all"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [editor, setEditor] = useState<{ id?: string; version: number; employee: string; terms: Editable } | null>(
      null,
    ),
    [reason, setReason] = useState(""),
    [decision, setDecision] = useState<{ record: HrLearningRecord; action: string } | null>(null),
    [decisionReason, setDecisionReason] = useState(""),
    [enrollRequest, setEnrollRequest] = useState("");
  const [attendance, setAttendance] = useState<{
    record: HrLearningRecord;
    session: Extract<HrLearningTerms, { kind: "session" }>;
    entries: Extract<HrLearningTerms, { kind: "participation" }>["attendance"];
    score: string;
    reference: string;
  } | null>(null);
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const q: HrLearningQuery = {
      company_id: company,
      section,
      mode,
      search,
      state,
      limit: 10,
      offset,
      ...(selected ? { record_id: selected } : {}),
    },
    read = useAttendanceRead(JSON.stringify([q, revision]), () => client.learning(q)),
    w = read.data;
  async function command(candidate: unknown, selectCreated = false) {
    if (guard.current) return;
    const parsed = hrLearningActionSchema.safeParse(candidate);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const r = await client.actOnLearning(parsed.data, csrfToken(), retry.current.key);
      retry.current = null;
      setEditor(null);
      setAttendance(null);
      setDecision(null);
      setReason("");
      setDecisionReason("");
      setEnrollRequest("");
      setNotice(
        r.status === "issued"
          ? "The verified internal certificate was issued."
          : r.status === "failed"
            ? "The completion was recorded as failed. No certificate was issued."
            : "Learning record saved: " + label(r.status) + ".",
      );
      if (selectCreated) setSelected(r.id);
      setOffset(0);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Learning action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  function create() {
    setError("");
    setReason("");
    const programme = w?.programmes[0]?.id ?? "";
    let terms: Editable;
    if (section === "programmes")
      terms = {
        kind: "programme",
        code: "",
        name: "",
        objectives: "",
        category: "Technical",
        delivery_mode: "Classroom",
        provider: "Internal",
        duration_minutes: 60,
        cost_per_participant: "0",
        currency: "PKR",
        mandatory: false,
        minimum_attendance_percent: 80,
        pass_mark: null,
        validity_months: null,
        prerequisite_ids: [],
      };
    else if (section === "requests")
      terms = { kind: "request", programme_id: programme, justification: "", goal_id: null, outcome_id: null };
    else {
      const d = new Date(Date.now() + 86400000);
      d.setHours(9, 0, 0, 0);
      terms = {
        kind: "session",
        programme_id: programme,
        title: "",
        trainer: "",
        location: "",
        capacity: 20,
        slots: [{ starts_at: d.toISOString(), ends_at: new Date(d.getTime() + 3600000).toISOString() }],
      };
    }
    setEditor({ version: 0, employee: "", terms });
  }
  function edit(r: HrLearningRecord) {
    if (!["programme", "request", "session"].includes(r.terms.kind)) return;
    setEditor({
      id: r.id,
      version: r.version,
      employee: r.employee_id ?? "",
      terms: structuredClone(r.terms) as Editable,
    });
    setReason("");
    setError("");
  }
  function patch(p: Record<string, unknown>) {
    setEditor((v) => (v ? { ...v, terms: { ...v.terms, ...p } as Editable } : v));
  }
  function action(r: HrLearningRecord, a: string) {
    if (a === "update") {
      edit(r);
      return;
    }
    if (a === "attendance") {
      const s = w?.selected?.terms;
      if (s?.kind !== "session" || r.terms.kind !== "participation") return;
      setAttendance({
        record: r,
        session: s,
        entries: s.slots.map((slot) =>
          r.terms.kind === "participation"
            ? (r.terms.attendance.find((x) => Date.parse(x.starts_at) === Date.parse(slot.starts_at)) ?? {
                starts_at: slot.starts_at,
                minutes: 0,
                note: "",
              })
            : { starts_at: slot.starts_at, minutes: 0, note: "" },
        ),
        score: r.terms.assessment_score === null ? "" : String(r.terms.assessment_score),
        reference: r.terms.evidence_reference,
      });
      setReason("");
      setError("");
      return;
    }
    setDecision({ record: r, action: a });
    setDecisionReason("");
    setError("");
  }
  async function certificate(r: HrLearningRecord) {
    if (guard.current) return;
    guard.current = true;
    setBusy(true);
    onBusy?.(true);
    setError("");
    try {
      const c = await client.learningCertificate(company, r.id),
        url = URL.createObjectURL(
          new Blob([learningCertificateHtml(c, getComputedStyle(document.body).fontFamily)], {
            type: "text/html;charset=utf-8",
          }),
        ),
        a = document.createElement("a");
      a.href = url;
      a.download = "nexora-internal-training-" + r.id + ".html";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Certificate unavailable.");
    } finally {
      guard.current = false;
      setBusy(false);
      onBusy?.(false);
    }
  }
  function buttons(r: HrLearningRecord) {
    return (
      <div className="flex flex-wrap gap-2">
        {r.allowed_actions
          .filter((a) => a !== "certificate")
          .map((a) => (
            <Button
              type="button"
              key={a}
              variant={a === "finalize" || a.includes("approve") ? "default" : "outline"}
              disabled={busy}
              onClick={() => action(r, a)}
            >
              {a === "update"
                ? "Edit draft"
                : a === "attendance"
                  ? "Record attendance & assessment"
                  : (names[a] ?? label(a))}
            </Button>
          ))}
        {r.allowed_actions.includes("certificate") && (
          <Button type="button" variant="outline" disabled={busy || r.expired} onClick={() => void certificate(r)}>
            <Download className="size-4" />
            Download certificate
          </Button>
        )}
      </div>
    );
  }
  const current = w?.selected;
  return (
    <section className="min-w-0 space-y-5 text-foreground" data-learning-section={section} data-learning-mode={mode}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">
            {section === "programmes"
              ? "Programme catalogue"
              : section === "requests"
                ? "Training requests"
                : section === "sessions"
                  ? "Sessions & attendance"
                  : "Completion & certificates"}
          </h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            {section === "programmes"
              ? "Publish independently reviewed programmes with attendance, assessment, prerequisite and renewal rules."
              : section === "requests"
                ? "The request author submits to the employee’s current reporting manager, followed by separate HR review."
                : section === "sessions"
                  ? "Schedule lessons, allocate approved requests and record actual attendance before independent certification."
                  : "Verified completion evidence, current certificate validity and mandatory learning gaps."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => setRevision((v) => v + 1)}>
            <RefreshCw className="size-4" />
            {read.error ? "Retry Learning" : "Refresh Learning"}
          </Button>
          {!editor &&
            w &&
            (section === "requests" ? w.can_create_request : section !== "completions" && w.can_manage) && (
              <Button type="button" disabled={busy} onClick={create}>
                <Plus className="size-4" />
                {section === "programmes"
                  ? "New programme"
                  : section === "requests"
                    ? "New training request"
                    : "New session"}
              </Button>
            )}
        </div>
      </div>
      {(error || read.error) && (
        <Alert variant="destructive">
          <AlertTitle>Learning action needs attention</AlertTitle>
          <AlertDescription>{error || read.error}</AlertDescription>
        </Alert>
      )}
      {notice && (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {read.loading && <p role="status">Loading authorized learning records…</p>}
      {w?.options_capped && (
        <Alert>
          <AlertTitle>Refine the selection</AlertTitle>
          <AlertDescription>
            Some selection lists reached their safety limit. Search for an employee or use the owning list to open the
            exact record before continuing.
          </AlertDescription>
        </Alert>
      )}
      <form
        className={panel + " flex flex-col gap-3 sm:flex-row sm:items-end"}
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(draftSearch.trim());
          setOffset(0);
          setSelected("");
        }}
      >
        <div className="min-w-0 flex-1">
          <Field title="Search Learning records">
            <Input
              maxLength={100}
              value={draftSearch}
              disabled={busy}
              onChange={(e) => setDraftSearch(e.target.value)}
              placeholder="Name, employee number or record ID"
            />
          </Field>
        </div>
        <Field title="Learning state">
          <select
            className={selectClass}
            value={state}
            disabled={busy}
            onChange={(e) => {
              setState(e.target.value);
              setOffset(0);
              setSelected("");
            }}
          >
            {[
              "all",
              ...(section === "programmes"
                ? ["draft", "active", "archived"]
                : section === "requests"
                  ? ["draft", "pending_manager", "pending_hr", "approved", "fulfilled", "rejected", "cancelled"]
                  : section === "sessions"
                    ? ["draft", "scheduled", "closed", "cancelled"]
                    : ["submitted", "issued", "failed", "revoked", "voided"]),
            ].map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </Field>
        <Button type="submit" disabled={busy}>
          Search
        </Button>
      </form>
      {editor && (
        <form
          className={panel + " space-y-4"}
          aria-label="Learning editor"
          onSubmit={(e) => {
            e.preventDefault();
            void command(
              {
                action: editor.id ? "update" : "create",
                company_id: company,
                ...(editor.id ? { id: editor.id } : {}),
                expected_version: editor.version,
                ...(editor.terms.kind === "request" && mode === "hr" ? { employee_id: editor.employee } : {}),
                terms: editor.terms,
                reason,
              },
              true,
            );
          }}
        >
          <h3 className="text-lg font-semibold">{editor.id ? "Edit retained draft" : "New " + editor.terms.kind}</h3>
          {editor.terms.kind === "programme" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field title="Programme code">
                  <Input
                    required
                    maxLength={40}
                    disabled={busy}
                    value={editor.terms.code}
                    onChange={(e) => patch({ code: e.target.value })}
                  />
                </Field>
                <Field title="Programme name">
                  <Input
                    required
                    maxLength={160}
                    disabled={busy}
                    value={editor.terms.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </Field>
                <Field title="Category">
                  <select
                    className={selectClass}
                    disabled={busy}
                    value={editor.terms.category}
                    onChange={(e) => patch({ category: e.target.value })}
                  >
                    {["Technical", "Compliance", "Leadership", "Safety", "Onboarding"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field title="Delivery mode">
                  <select
                    className={selectClass}
                    disabled={busy}
                    value={editor.terms.delivery_mode}
                    onChange={(e) => patch({ delivery_mode: e.target.value })}
                  >
                    {["Classroom", "Online", "On the job", "External"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                  </select>
                </Field>
                <Field title="Provider">
                  <Input
                    required
                    maxLength={160}
                    disabled={busy}
                    value={editor.terms.provider}
                    onChange={(e) => patch({ provider: e.target.value })}
                  />
                </Field>
                <Field title="Required training minutes">
                  <Input
                    type="number"
                    min={1}
                    max={44640}
                    required
                    disabled={busy}
                    value={editor.terms.duration_minutes}
                    onChange={(e) => patch({ duration_minutes: Number(e.target.value) })}
                  />
                </Field>
                <Field title="Estimated cost per participant">
                  <Input
                    required
                    inputMode="decimal"
                    disabled={busy}
                    value={editor.terms.cost_per_participant}
                    onChange={(e) => patch({ cost_per_participant: e.target.value })}
                  />
                </Field>
                <Field title="Cost currency">
                  <Input
                    required
                    maxLength={3}
                    disabled={busy}
                    value={editor.terms.currency}
                    onChange={(e) => patch({ currency: e.target.value.toUpperCase() })}
                  />
                </Field>
                <Field title="Minimum attendance percent">
                  <Input
                    required
                    type="number"
                    min={1}
                    max={100}
                    disabled={busy}
                    value={editor.terms.minimum_attendance_percent}
                    onChange={(e) => patch({ minimum_attendance_percent: Number(e.target.value) })}
                  />
                </Field>
                <Field title="Assessment pass mark (optional)">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    disabled={busy}
                    value={editor.terms.pass_mark ?? ""}
                    placeholder="Blank = assessment not required"
                    onChange={(e) => patch({ pass_mark: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
                <Field title="Certificate validity months (optional)">
                  <Input
                    type="number"
                    min={1}
                    max={120}
                    disabled={busy}
                    value={editor.terms.validity_months ?? ""}
                    placeholder="Blank = no expiry"
                    onChange={(e) => patch({ validity_months: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                </Field>
              </div>
              <Field title="Learning objectives">
                <Textarea
                  required
                  minLength={12}
                  maxLength={2000}
                  disabled={busy}
                  value={editor.terms.objectives}
                  onChange={(e) => patch({ objectives: e.target.value })}
                />
              </Field>
              <label htmlFor={mandatoryId} className="flex items-center gap-3 text-sm">
                <Checkbox
                  id={mandatoryId}
                  checked={editor.terms.mandatory}
                  disabled={busy}
                  onCheckedChange={(v) => patch({ mandatory: v === true })}
                />
                Mandatory for active employees in this company
              </label>
              <Field title="Prerequisite programmes">
                <select
                  multiple
                  className={selectClass + " min-h-24"}
                  disabled={busy}
                  value={editor.terms.prerequisite_ids}
                  onChange={(e) =>
                    patch({ prerequisite_ids: Array.from(e.target.selectedOptions).map((o) => o.value) })
                  }
                >
                  {w?.programmes
                    .filter((p) => p.id !== editor.id)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {title(p)}
                      </option>
                    ))}
                </select>
              </Field>
              <p className="text-xs text-muted-foreground">
                Costs are estimates for HR review. Publishing or approving training creates no Accounting, Payroll or
                Banking posting. Published terms are retained; create a successor programme when rules change.
              </p>
            </>
          )}
          {(editor.terms.kind === "request" || editor.terms.kind === "session") && (
            <Field title="Training programme">
              <select
                required
                className={selectClass}
                disabled={busy || !!editor.id}
                value={editor.terms.programme_id}
                onChange={(e) => patch({ programme_id: e.target.value })}
              >
                <option value="">Select an active programme</option>
                {w?.programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {title(p)}
                  </option>
                ))}
              </select>
            </Field>
          )}
          {editor.terms.kind === "request" && (
            <>
              {mode === "hr" && (
                <Field title="Employee">
                  <select
                    className={selectClass}
                    required
                    disabled={busy || !!editor.id}
                    value={editor.employee}
                    onChange={(e) => {
                      const employee = e.target.value;
                      setEditor((v) =>
                        v ? { ...v, employee, terms: { ...v.terms, goal_id: null, outcome_id: null } as Editable } : v,
                      );
                    }}
                  >
                    <option value="">Select employee with approved employment</option>
                    {w?.employees.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name} · {e.code}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              <Field title="Development need and justification">
                <Textarea
                  required
                  minLength={12}
                  maxLength={2000}
                  disabled={busy}
                  value={editor.terms.justification}
                  onChange={(e) => patch({ justification: e.target.value })}
                />
              </Field>
              {mode === "hr" && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["goal", "outcome"] as const).map((k) => (
                    <Field key={k} title={"Linked performance " + k + " (optional)"}>
                      <select
                        className={selectClass}
                        disabled={busy}
                        value={
                          editor.terms.kind === "request"
                            ? (editor.terms[k === "goal" ? "goal_id" : "outcome_id"] ?? "")
                            : ""
                        }
                        onChange={(e) => patch({ [k === "goal" ? "goal_id" : "outcome_id"]: e.target.value || null })}
                      >
                        <option value="">No performance link</option>
                        {w?.performance_links
                          .filter((p) => p.kind === k && p.employee_id === editor.employee)
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.label}
                            </option>
                          ))}
                      </select>
                    </Field>
                  ))}
                </div>
              )}
              <p className="text-xs text-muted-foreground">
                The backend resolves the current reporting-manager account when you submit. HR approval is separate from
                the author and manager; approval alone does not reserve a training seat.
              </p>
            </>
          )}
          {editor.terms.kind === "session" && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                {(["title", "trainer", "location"] as const).map((k) => (
                  <Field key={k} title={k === "title" ? "Session title" : label(k)}>
                    <Input
                      required
                      maxLength={k === "location" ? 240 : 160}
                      disabled={busy}
                      value={editor.terms.kind === "session" ? editor.terms[k] : ""}
                      onChange={(e) => patch({ [k]: e.target.value })}
                    />
                  </Field>
                ))}
                <Field title="Session capacity">
                  <Input
                    type="number"
                    min={1}
                    max={200}
                    required
                    disabled={busy}
                    value={editor.terms.capacity}
                    onChange={(e) => patch({ capacity: Number(e.target.value) })}
                  />
                </Field>
              </div>
              <fieldset className="space-y-3">
                <legend className="mb-2 font-medium">Lesson schedule</legend>
                <p className="text-xs text-muted-foreground">
                  Enter local times ({Intl.DateTimeFormat().resolvedOptions().timeZone}). Lessons are stored as absolute
                  instants and cannot overlap.
                </p>
                {editor.terms.slots.map((slot, index) => (
                  <div key={index} className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2">
                    <Field title={"Lesson " + (index + 1) + " start"}>
                      <Input
                        type="datetime-local"
                        required
                        disabled={busy}
                        value={localInput(slot.starts_at)}
                        onChange={(e) => {
                          if (editor.terms.kind !== "session") return;
                          patch({
                            slots: editor.terms.slots.map((s, i) =>
                              i === index ? { ...s, starts_at: isoInput(e.target.value) } : s,
                            ),
                          });
                        }}
                      />
                    </Field>
                    <Field title={"Lesson " + (index + 1) + " end"}>
                      <Input
                        type="datetime-local"
                        required
                        disabled={busy}
                        value={localInput(slot.ends_at)}
                        onChange={(e) => {
                          if (editor.terms.kind !== "session") return;
                          patch({
                            slots: editor.terms.slots.map((s, i) =>
                              i === index ? { ...s, ends_at: isoInput(e.target.value) } : s,
                            ),
                          });
                        }}
                      />
                    </Field>
                    {editor.terms.kind === "session" && editor.terms.slots.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        disabled={busy}
                        onClick={() => {
                          if (editor.terms.kind === "session")
                            patch({ slots: editor.terms.slots.filter((_, i) => i !== index) });
                        }}
                      >
                        Remove lesson {index + 1}
                      </Button>
                    )}
                  </div>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || editor.terms.slots.length >= 31}
                  onClick={() => {
                    if (editor.terms.kind !== "session") return;
                    const previous = editor.terms.slots.at(-1)!;
                    patch({
                      slots: [
                        ...editor.terms.slots,
                        {
                          starts_at: new Date(Date.parse(previous.starts_at) + 86400000).toISOString(),
                          ends_at: new Date(Date.parse(previous.ends_at) + 86400000).toISOString(),
                        },
                      ],
                    });
                  }}
                >
                  Add lesson
                </Button>
              </fieldset>
            </>
          )}
          <Field title="Learning change reason">
            <Textarea
              required
              minLength={12}
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || reason.trim().length < 12}>
              Save learning draft
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditor(null)}>
              Close editor
            </Button>
          </div>
        </form>
      )}
      {w && !w.items.length && (
        <p className={panel + " text-sm text-muted-foreground"}>No learning records match this company and filter.</p>
      )}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {w?.items.map((r) => (
          <article className={panel + " space-y-3"} key={r.id}>
            <div className="flex flex-wrap justify-between gap-2">
              <h3 className="min-w-0 break-words font-semibold">{title(r)}</h3>
              <State value={r.expired ? "expired" : r.state} />
            </div>
            {r.employee_name && (
              <p className="break-words text-sm text-muted-foreground">
                {r.employee_name} · {r.employee_number}
              </p>
            )}
            {r.terms.kind === "programme" && (
              <p className="text-sm text-muted-foreground">
                {r.terms.category} · {r.terms.duration_minutes} minutes · {r.terms.cost_per_participant}{" "}
                {r.terms.currency}
                {r.terms.mandatory ? " · Mandatory" : ""}
              </p>
            )}
            {r.terms.kind === "completion" && (
              <p className="text-sm text-muted-foreground">
                {r.terms.attendance_percent}% attendance · Completed {r.terms.completed_on} · Valid through{" "}
                {r.terms.valid_until ?? "No expiry"}
              </p>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setSelected(r.id);
                setError("");
              }}
            >
              Open {r.kind}
              <ArrowRight className="size-4" />
            </Button>
          </article>
        ))}
      </div>
      {w && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
          <span>
            {w.total ? offset + 1 : 0}–{Math.min(offset + w.limit, w.total)} of {w.total} records
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={busy || !offset}
              onClick={() => setOffset((v) => Math.max(0, v - 10))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || offset + 10 >= w.total}
              onClick={() => setOffset((v) => v + 10)}
            >
              Next
            </Button>
          </div>
        </div>
      )}
      {current && (
        <article className={panel + " space-y-4"} aria-label="Learning record detail">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="break-words text-lg font-semibold">{title(current)}</h3>
              <p className="mt-1 break-all text-xs text-muted-foreground">
                {current.id} · Version {current.version}
              </p>
            </div>
            <State value={current.expired ? "expired" : current.state} />
          </div>
          {current.employee_name && (
            <p className="break-words text-sm">
              {current.employee_name} · {current.employee_number}
            </p>
          )}
          {current.terms.kind === "programme" && (
            <>
              <p className="whitespace-pre-wrap break-words text-sm">{current.terms.objectives}</p>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  title="Attendance needed"
                  value={current.terms.minimum_attendance_percent + "%"}
                  hint="Explicit lesson evidence"
                />
                <Metric
                  title="Assessment pass mark"
                  value={current.terms.pass_mark === null ? "Not required" : current.terms.pass_mark + "%"}
                  hint="Independent certification"
                />
                <Metric
                  title="Validity"
                  value={
                    current.terms.validity_months === null ? "No expiry" : current.terms.validity_months + " months"
                  }
                  hint="From final lesson date"
                />
              </div>
              <p className="text-sm text-muted-foreground">
                Provider: {current.terms.provider} · {current.terms.delivery_mode} · Estimated{" "}
                {current.terms.cost_per_participant} {current.terms.currency} per participant
              </p>
            </>
          )}
          {current.terms.kind === "request" && (
            <>
              <p className="whitespace-pre-wrap break-words text-sm">{current.terms.justification}</p>
              <dl className="grid min-w-0 gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                {[
                  ["Programme", current.programme_id],
                  ["Reporting manager", current.manager_user_id ?? "Resolved at submission"],
                  ["Manager decision", current.manager_decided_by ?? "Pending"],
                  ["Performance goal", current.terms.goal_id ?? "None"],
                  ["Performance outcome", current.terms.outcome_id ?? "None"],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt>{k}</dt>
                    <dd className="mt-1 break-all">{v}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
          {current.terms.kind === "session" && (
            <>
              <p className="break-words text-sm">
                {current.terms.trainer} · {current.terms.location} · Capacity {current.terms.capacity} ·{" "}
                {w!.participants.filter((p) => p.state !== "withdrawn").length} retained seats
              </p>
              <ol className="space-y-2 text-sm">
                {current.terms.slots.map((s) => (
                  <li className="rounded-lg border border-border p-3" key={s.starts_at}>
                    {new Date(s.starts_at).toLocaleString()} – {new Date(s.ends_at).toLocaleString()}
                  </li>
                ))}
              </ol>
            </>
          )}
          {current.terms.kind === "completion" && (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Metric
                  title="Verified attendance"
                  value={current.terms.attendance_percent + "%"}
                  hint={"Required " + current.terms.minimum_attendance_percent + "%"}
                />
                <Metric
                  title="Assessment"
                  value={
                    current.terms.assessment_score === null ? "Not required" : current.terms.assessment_score + "%"
                  }
                  hint={
                    current.terms.pass_mark === null
                      ? "No assessment threshold"
                      : "Pass mark " + current.terms.pass_mark + "%"
                  }
                />
                <Metric
                  title="Derived result"
                  value={label(current.terms.result)}
                  hint={
                    current.state === "submitted"
                      ? "Awaiting independent verification"
                      : (current.terms.valid_until ?? "No expiry")
                  }
                />
              </div>
              <p className="break-words text-sm">Supporting evidence: {current.terms.evidence_reference}</p>
              <p className="break-all text-xs text-muted-foreground">
                Internal certificate: {current.terms.certificate_id}
              </p>
              {current.expired && (
                <Alert>
                  <AlertDescription>
                    This certificate expired. Create a new approved request for renewal; prior evidence stays in
                    history.
                  </AlertDescription>
                </Alert>
              )}
            </>
          )}
          {buttons(current)}
          {current.kind === "session" && current.state === "scheduled" && w?.can_manage && (
            <form
              aria-label="Enroll approved training request"
              className="space-y-3 rounded-lg border border-border p-4"
              onSubmit={(e) => {
                e.preventDefault();
                const r = w.requests.find((r) => r.id === enrollRequest);
                if (r)
                  void command({
                    action: "enroll",
                    company_id: company,
                    request_id: r.id,
                    session_id: current.id,
                    expected_request_version: r.version,
                    expected_session_version: current.version,
                    reason,
                  });
              }}
            >
              <Field title="Approved training request">
                <select
                  className={selectClass}
                  required
                  disabled={busy}
                  value={enrollRequest}
                  onChange={(e) => setEnrollRequest(e.target.value)}
                >
                  <option value="">Select matching approved request</option>
                  {w.requests
                    .filter((r) => r.programme_id === current.programme_id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.employee_name} · {r.employee_number} · {r.id}
                      </option>
                    ))}
                </select>
              </Field>
              <Field title="Enrollment reason">
                <Textarea
                  required
                  minLength={12}
                  maxLength={1000}
                  disabled={busy}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Button type="submit" disabled={busy || !enrollRequest || reason.trim().length < 12}>
                Enroll employee
              </Button>
            </form>
          )}
          {current.kind === "session" && (
            <div className="space-y-3">
              <h4 className="font-semibold">Participant register</h4>
              <p className="text-xs text-muted-foreground">
                Attendance becomes available after a lesson finishes. Completion submission requires every lesson,
                assessment where required and a verified evidence reference.
              </p>
              {!w?.participants.length && <p className="text-sm text-muted-foreground">No participants enrolled.</p>}
              {w?.participants.map((p) => (
                <div className="space-y-3 rounded-lg border border-border p-4" key={p.id}>
                  <div className="flex flex-wrap justify-between gap-2">
                    <p className="break-words font-medium">
                      {p.employee_name} · {p.employee_number}
                    </p>
                    <State value={p.state} />
                  </div>
                  {p.terms.kind === "participation" && (
                    <p className="text-xs text-muted-foreground">
                      {p.terms.attendance.reduce((n, a) => n + a.minutes, 0)} attendance minutes · Assessment{" "}
                      {p.terms.assessment_score === null ? "not recorded" : p.terms.assessment_score + "%"}
                    </p>
                  )}
                  {buttons(p)}
                </div>
              ))}
            </div>
          )}
          <details className="rounded-lg border border-border p-3">
            <summary className="cursor-pointer font-medium">Decision & change history ({w?.history.length})</summary>
            <ol className="mt-3 space-y-3">
              {w?.history.map((h) => (
                <li className="border-t border-border pt-3 text-sm" key={h.id}>
                  <p className="font-medium">
                    {label(h.action)} · Version {h.version}
                  </p>
                  <p className="mt-1 break-words">{h.reason}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {h.actor_id} · {new Date(h.occurred_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </article>
      )}
      {attendance && (
        <form
          aria-label="Record training attendance"
          className={panel + " space-y-4"}
          onSubmit={(e) => {
            e.preventDefault();
            void command({
              action: "attendance",
              company_id: company,
              id: attendance.record.id,
              expected_version: attendance.record.version,
              attendance: attendance.entries,
              assessment_score: attendance.score === "" ? null : Number(attendance.score),
              evidence_reference: attendance.reference,
              reason,
            });
          }}
        >
          <h3 className="font-semibold">Attendance & assessment — {attendance.record.employee_name}</h3>
          <p className="text-sm text-muted-foreground">
            Record actual minutes for every finished lesson, including zero for absence. Completion and pass/fail
            results are calculated from the published programme rules.
          </p>
          {attendance.entries.map((a, index) => (
            <div className="grid gap-3 rounded-lg border border-border p-3 sm:grid-cols-2" key={a.starts_at}>
              <Field title={"Attendance minutes for lesson " + (index + 1)}>
                <Input
                  type="number"
                  min={0}
                  max={1440}
                  required
                  disabled={busy}
                  value={a.minutes}
                  onChange={(e) =>
                    setAttendance((v) =>
                      v
                        ? {
                            ...v,
                            entries: v.entries.map((x, i) =>
                              i === index ? { ...x, minutes: Number(e.target.value) } : x,
                            ),
                          }
                        : v,
                    )
                  }
                />
              </Field>
              <Field title={"Attendance note for lesson " + (index + 1)}>
                <Input
                  maxLength={500}
                  disabled={busy}
                  value={a.note}
                  onChange={(e) =>
                    setAttendance((v) =>
                      v
                        ? { ...v, entries: v.entries.map((x, i) => (i === index ? { ...x, note: e.target.value } : x)) }
                        : v,
                    )
                  }
                />
              </Field>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                {new Date(a.starts_at).toLocaleString()} · Planned{" "}
                {Math.round((Date.parse(attendance.session.slots[index]!.ends_at) - Date.parse(a.starts_at)) / 60000)}{" "}
                minutes
              </p>
            </div>
          ))}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field title="Assessment score percent">
              <Input
                type="number"
                min={0}
                max={100}
                disabled={busy}
                value={attendance.score}
                placeholder="Required when programme has a pass mark"
                onChange={(e) => setAttendance((v) => (v ? { ...v, score: e.target.value } : v))}
              />
            </Field>
            <Field title="Verified training evidence reference">
              <Input
                required
                minLength={12}
                maxLength={500}
                disabled={busy}
                value={attendance.reference}
                onChange={(e) => setAttendance((v) => (v ? { ...v, reference: e.target.value } : v))}
              />
            </Field>
          </div>
          <Field title="Attendance change reason">
            <Textarea
              required
              minLength={12}
              maxLength={1000}
              disabled={busy}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || reason.trim().length < 12}>
              Save attendance evidence
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAttendance(null)}>
              Close attendance editor
            </Button>
          </div>
        </form>
      )}
      {section === "completions" && w && (
        <div className={panel + " space-y-3"}>
          <h3 className="flex items-center gap-2 font-semibold">
            <Award className="size-4" />
            Mandatory learning gaps ({w.gap_total})
          </h3>
          <p className="text-sm text-muted-foreground">
            Active employees missing a currently valid, issued certificate for a mandatory active programme. Expired and
            revoked certificates do not satisfy the requirement.
          </p>
          {w.gaps.map((g) => (
            <div
              className="grid gap-1 rounded-lg border border-border p-3 sm:grid-cols-2"
              key={g.employee_id + g.programme_id}
            >
              <span className="break-words text-sm font-medium">{g.employee_name}</span>
              <span className="break-words text-sm text-muted-foreground">{g.programme_name}</span>
            </div>
          ))}
          {w.gap_total > w.gaps.length && (
            <p className="text-xs text-muted-foreground">
              Showing the first {w.gaps.length} of {w.gap_total} gaps.
            </p>
          )}
          {!w.gap_total && (
            <p className="text-sm text-muted-foreground">No mandatory learning gaps in this authorized scope.</p>
          )}
        </div>
      )}
      {onNavigate && (
        <nav className="flex flex-wrap gap-2" aria-label="Connected Learning screens">
          {sections.map((s, index) => (
            <Button
              key={s}
              type="button"
              variant="outline"
              disabled={busy || s === section}
              onClick={() => onNavigate("hr", learningPages[index]!)}
            >
              {label(s)}
            </Button>
          ))}
        </nav>
      )}
      <Dialog
        open={!!decision}
        onOpenChange={(open) => {
          if (!open && !busy) setDecision(null);
        }}
      >
        <DialogContent className="max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{names[decision?.action ?? ""] ?? "Review Learning action"}</DialogTitle>
            <DialogDescription>
              {decision?.action === "finalize"
                ? "Confirm independently verified attendance and assessment evidence. The server derives the result; failed learning cannot issue a certificate."
                : decision?.action === "void"
                  ? "Retain the submitted proposal as voided and return its attendance evidence for correction."
                  : "Confirm the current record and record why this action is appropriate."}
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (decision)
                void command({
                  action: decision.action,
                  company_id: company,
                  id: decision.record.id,
                  expected_version: decision.record.version,
                  reason: decisionReason,
                });
            }}
          >
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <Field title="Learning decision reason">
              <Textarea
                required
                minLength={12}
                maxLength={1000}
                disabled={busy}
                value={decisionReason}
                onChange={(e) => setDecisionReason(e.target.value)}
              />
            </Field>
            <Button type="submit" disabled={busy || decisionReason.trim().length < 12}>
              Confirm Learning action
            </Button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
export function HrLearningWorkspace({
  page,
  onNavigate,
}: {
  page: (typeof learningPages)[number];
  onNavigate: Navigate;
}) {
  const [busy, setBusy] = useState(false),
    section = sections[learningPages.indexOf(page)]!;
  return (
    <div className="min-w-0 space-y-5 text-foreground" data-learning-page={page}>
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm text-primary">
            <BookOpen className="size-4" />
            HR & Payroll · Learning & Development
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {section === "programmes"
              ? "Training Programmes"
              : section === "requests"
                ? "Training Requests"
                : section === "sessions"
                  ? "Training Sessions"
                  : "Completion & Certificates"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Governed development needs, training delivery and verified employee learning records.
          </p>
        </div>
        <Badge variant="outline">API connected</Badge>
      </header>
      <HrCompanyScope disabled={busy}>
        {(company) => <HrLearningBody company={company} section={section} onBusy={setBusy} onNavigate={onNavigate} />}
      </HrCompanyScope>
    </div>
  );
}
export function HrPersonalLearning({ company, onBusy }: { company: string; onBusy?: (busy: boolean) => void }) {
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<Section>("requests");
  return (
    <Tabs
      value={active}
      onValueChange={(value) => {
        if (!busy && sections.includes(value as Section)) setActive(value as Section);
      }}
    >
      <div className="max-w-full overflow-x-auto">
        <TabsList className="w-max">
          {sections.map((s) => (
            <TabsTrigger key={s} value={s} disabled={busy}>
              {s === "sessions" ? <CalendarDays className="mr-1 size-4" /> : null}
              {label(s)}
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
      {sections.map((s) => (
        <TabsContent key={s} value={s}>
          <HrLearningBody
            key={company + s}
            company={company}
            section={s}
            mode="mine"
            onBusy={(v) => {
              setBusy(v);
              onBusy?.(v);
            }}
          />
        </TabsContent>
      ))}
    </Tabs>
  );
}
