"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";

import { Fragment, useEffect, useRef, useState } from "react";
import {
  hrLifecycleCaseActionSchema,
  type HrLifecycleCaseAction,
  type HrLifecycleCaseQuery,
  type HrLifecycleCaseRecord,
  type HrLifecycleCaseTerms,
  type HrLifecycleCaseWorkspace,
} from "@nexora/contracts";
import { Check } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { SearchableSelect } from "@/shared/ui/searchable-select";

import { HrApiClient } from "../api/hr-client";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailTile,
  HrStatusPill,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrSearchField } from "../components/hr-list-controls";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrFormRows, HrRecordCodeField } from "../components/hr-create-form";
import { hrCell } from "../components/hr-table";
import { Field, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";

export const lifecycleCasePages = {
  onboarding: "onboarding",
  "probation-reviews": "probation",
  resignations: "resignation",
  terminations: "termination",
  clearance: "clearance",
} as const;

type Section = (typeof lifecycleCasePages)[keyof typeof lifecycleCasePages];
type CaseState = HrLifecycleCaseQuery["state"];
type Filter = CaseState;

const PAGE_SIZE = 25;

const singular: Record<Section, string> = {
  onboarding: "Onboarding",
  probation: "Probation review",
  resignation: "Resignation",
  termination: "Termination",
  clearance: "Exit clearance",
};

const createLabel: Record<Section, string> = {
  onboarding: "+ Create case",
  probation: "+ Start review",
  resignation: "+ Create case",
  termination: "+ Create case",
  clearance: "+ Create case",
};

const stateLabel: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
  cancelled: "Cancelled",
  closed: "Closed",
  active: "Active",
  suspended: "Suspended",
};

const exitFilters: readonly { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
  { value: "approved", label: "Approved" },
  { value: "cancelled", label: "Cancelled" },
];
/** Onboarding has no Cancelled outcome: a case that should not proceed is Rejected. */
const sectionsWithoutCancel: readonly Section[] = ["onboarding"];
const filters: Record<Section, readonly { value: Filter; label: string }[]> = {
  onboarding: [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Submitted" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ],
  probation: [
    { value: "all", label: "All" },
    { value: "draft", label: "Draft" },
    { value: "submitted", label: "Submitted" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
  ],
  resignation: exitFilters,
  termination: exitFilters,
  clearance: exitFilters,
};

/** Workflow decisions offered at the bottom of the record drawer. */
const decisionLabels: Record<string, string> = {
  submit: "Submit for approval",
  approve: "Approve",
  reject: "Reject",
  return: "Return to draft",
};

const historyLabels: Record<string, string> = {
  save: "Draft saved",
  submit: "Submitted for approval",
  approve: "Approved",
  reject: "Rejected",
  return: "Returned to draft",
  cancel: "Cancelled",
  apply_exit: "Exit completed",
};

const checklist: Record<"onboarding" | "clearance", readonly (readonly [string, string])[]> = {
  onboarding: [
    ["identity", "Identity and employee documents"],
    ["employment", "Employment contract and joining records"],
    ["access", "System and workspace access"],
    ["equipment", "Equipment and workplace ready"],
    ["payroll", "Payroll and bank details set up"],
  ],
  clearance: [
    ["assets", "Assets and equipment returned"],
    ["access", "Access revoked and accounts handed over"],
    ["finance", "Finance balances and recoveries reviewed"],
    ["knowledge", "Work and knowledge handed over"],
    ["hr", "HR documents and exit interview"],
  ],
};

type Task = { id: string; title: string; complete: boolean; evidence: string };
type Terms = Exclude<HrLifecycleCaseTerms, { kind: "settlement" }>;

function caseDate(terms: HrLifecycleCaseTerms): { label: string; value: string } | null {
  if ("due_date" in terms) return { label: "Due date", value: terms.due_date };
  if ("effective_date" in terms) return { label: "Review date", value: terms.effective_date };
  if ("last_working_date" in terms) return { label: "Last working day", value: terms.last_working_date };
  return null;
}

function taskProgress(terms: HrLifecycleCaseTerms) {
  if (!("tasks" in terms)) return null;
  return { done: terms.tasks.filter((task) => task.complete).length, total: terms.tasks.length };
}

const exitLabel = (record: HrLifecycleCaseRecord) =>
  `${record.employee_name} · ${record.kind === "termination" ? "Termination" : "Resignation"}` +
  (record.terms.kind === "resignation" || record.terms.kind === "termination"
    ? ` · ${hrDisplayDate(record.terms.last_working_date)}`
    : "");

/** Draft → Submitted → Approved, ending in Rejected or Cancelled when a case stopped there. */
function CaseWorkflow({ state }: { state: string }) {
  const negative = state === "rejected" || state === "cancelled";
  const end = negative || state === "closed" ? state : "approved";
  const steps = ["draft", "submitted", end];
  const current = state === "draft" ? 0 : state === "submitted" ? 1 : 2;
  const skipped = state === "cancelled";
  return (
    <ol aria-label="Workflow" className="m-0! flex min-w-0 list-none items-center gap-1.5 p-0! text-xs font-semibold">
      {steps.map((step, index) => {
        const done = index < current && !(skipped && index === 1);
        const isCurrent = index === current;
        return (
          <Fragment key={step}>
            {index ? (
              <li aria-hidden className={`h-px min-w-3 flex-1 ${index <= current ? "bg-primary" : "bg-border"}`} />
            ) : null}
            <li
              aria-current={isCurrent ? "step" : undefined}
              className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 ${
                isCurrent
                  ? negative && index === 2
                    ? "border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)] text-[var(--nx-danger)]"
                    : "border-primary bg-primary text-primary-foreground"
                  : done
                    ? "border-primary/40 text-foreground"
                    : "border-border text-muted-foreground"
              }`}
            >
              {done ? <Check className="size-3" aria-hidden /> : null}
              {stateLabel[step]}
            </li>
          </Fragment>
        );
      })}
    </ol>
  );
}

function LifecycleCaseForm({
  w,
  section,
  initial,
  preset,
  busy,
  onSave,
}: {
  w: HrLifecycleCaseWorkspace;
  section: Section;
  initial: HrLifecycleCaseRecord | null;
  preset: string;
  busy: boolean;
  onSave: (terms: Terms, reason: string) => void;
}) {
  const t = initial?.terms;
  const kind = section;
  const [relationship, setRelationship] = useState(t && "relationship_id" in t ? t.relationship_id : preset);
  const [exit, setExit] = useState(t && "exit_case_id" in t ? t.exit_case_id : "");
  const [date, setDate] = useState(
    t && "due_date" in t
      ? t.due_date
      : t && "effective_date" in t
        ? t.effective_date
        : t && "last_working_date" in t
          ? t.last_working_date
          : localDate(),
  );
  const [notes, setNotes] = useState(t && "notes" in t ? t.notes : t && "summary" in t ? t.summary : "");
  const [reference, setReference] = useState(t && "notice_reference" in t ? t.notice_reference : "");
  const [recommendation, setRecommendation] = useState<"confirm" | "extend">(
    t?.kind === "probation" ? t.recommendation : "confirm",
  );
  const [extension, setExtension] = useState(t?.kind === "probation" ? (t.extension_until ?? "") : "");
  const [rating, setRating] = useState(t?.kind === "probation" ? t.rating : 3);
  const [tasks, setTasks] = useState<Task[]>(
    t && "tasks" in t
      ? t.tasks
      : kind === "onboarding" || kind === "clearance"
        ? checklist[kind].map(([id, title]) => ({ id, title, complete: false, evidence: "" }))
        : [],
  );
  const [reason, setReason] = useState("");
  const [missing, setMissing] = useState("");

  // Employees hired from an accepted offer are listed first in the onboarding picker.
  const employeeOptions = [
    ...w.offers
      .filter((offer) => !w.relationships.some((item) => item.id === offer.relationship_id))
      .map((offer) => ({ value: offer.relationship_id, label: offer.employee_name })),
    ...w.relationships.map((item) => ({ value: item.id, label: item.label })),
  ];

  function save() {
    if (kind === "clearance" ? !exit : !relationship) {
      setMissing(kind === "clearance" ? "Choose the approved exit." : "Choose the employee.");
      return;
    }
    setMissing("");
    let terms: Terms;
    if (kind === "onboarding") terms = { kind, relationship_id: relationship, due_date: date, notes, tasks };
    else if (kind === "probation")
      terms = {
        kind,
        relationship_id: relationship,
        effective_date: date,
        recommendation,
        extension_until: recommendation === "extend" ? extension : null,
        rating,
        summary: notes,
      };
    else if (kind === "resignation" || kind === "termination")
      terms = { kind, relationship_id: relationship, last_working_date: date, notice_reference: reference, summary: notes };
    else terms = { kind, exit_case_id: exit, tasks, notes };
    onSave(terms, reason);
  }

  const done = tasks.filter((task) => task.complete).length;
  const dateLabel = kind === "onboarding" ? "Due date" : kind === "probation" ? "Review date" : "Last working day";

  return (
    <WorkForm
      className="grid min-w-0 gap-4"
      aria-label={`${singular[section]} form`}
      onSubmit={(event) => {
        event.preventDefault();
        save();
      }}
    >
      {missing ? (
        <p role="alert" className="m-0! text-sm text-destructive">
          {missing}
        </p>
      ) : null}
      <HrRecordCodeField
        kind={kind}
        companyId={w.company_id}
        value={initial?.code ?? null}
        existing={Boolean(initial)}
        id={`hr-lifecycle-case-code-${kind}`}
      />
      {kind === "clearance" ? (
        <Field title="Approved exit">
          <SearchableSelect
            label="Approved exit"
            value={exit}
            required
            invalid={missing !== "" && !exit}
            disabled={busy || !!initial}
            placeholder="Choose approved exit"
            searchPlaceholder="Search employee…"
            options={w.exits.map((item) => ({ value: item.id, label: exitLabel(item) }))}
            onValueChange={setExit}
          />
        </Field>
      ) : (
        <Field title="Employee">
          <SearchableSelect
            label="Employee"
            value={relationship}
            required
            invalid={missing !== "" && !relationship}
            disabled={busy || !!initial}
            placeholder="Choose employee"
            searchPlaceholder="Search employee…"
            options={employeeOptions}
            onValueChange={setRelationship}
          />
        </Field>
      )}

      {kind !== "clearance" ? (
        <HrFormRows>
          <Field title={dateLabel}>
            <Input type="date" value={date} required disabled={busy} onChange={(event) => setDate(event.target.value)} />
          </Field>
          {kind === "resignation" || kind === "termination" ? (
            <Field title={kind === "resignation" ? "Notice reference" : "Decision reference"}>
              <Input
                value={reference}
                required
                maxLength={500}
                disabled={busy}
                onChange={(event) => setReference(event.target.value)}
              />
            </Field>
          ) : null}
          {kind === "probation" ? (
            <Field title="Rating">
              <select
                className={selectClass}
                value={rating}
                disabled={busy}
                onChange={(event) => setRating(Number(event.target.value))}
              >
                {[1, 2, 3, 4, 5].map((value) => (
                  <option key={value} value={value}>
                    {value} / 5
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {kind === "probation" ? (
            <Field title="Outcome">
              <select
                className={selectClass}
                value={recommendation}
                disabled={busy}
                onChange={(event) => setRecommendation(event.target.value as typeof recommendation)}
              >
                <option value="confirm">Confirm employment</option>
                <option value="extend">Extend probation</option>
              </select>
            </Field>
          ) : null}
          {kind === "probation" && recommendation === "extend" ? (
            <Field title="Extend until">
              <Input
                type="date"
                min={date}
                value={extension}
                required
                disabled={busy}
                onChange={(event) => setExtension(event.target.value)}
              />
            </Field>
          ) : null}
        </HrFormRows>
      ) : null}

      {kind === "onboarding" || kind === "clearance" ? (
        <fieldset className="m-0 grid min-w-0 gap-2 border-0 p-0">
          <legend className="mb-2 flex w-full items-center justify-between gap-3 text-sm font-medium">
            <span>Checklist</span>
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {done} of {tasks.length} done
            </span>
          </legend>
          <div aria-hidden className="h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-[width]"
              style={{ width: `${tasks.length ? (done / tasks.length) * 100 : 0}%` }}
            />
          </div>
          <ul className="m-0! grid list-none divide-y divide-border rounded-md border border-border p-0!">
            {tasks.map((task, index) => (
              <li key={task.id}>
                <label
                  htmlFor={`lifecycle-task-${task.id}`}
                  className="flex min-w-0 cursor-pointer items-center gap-3 px-3 py-2.5 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    id={`lifecycle-task-${task.id}`}
                    checked={task.complete}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setTasks((current) =>
                        current.map((item, i) => (i === index ? { ...item, complete: checked === true } : item)),
                      )
                    }
                  />
                  <span
                    className={`min-w-0 flex-1 wrap-anywhere ${task.complete ? "text-muted-foreground line-through" : ""}`}
                  >
                    {task.title}
                  </span>
                  {task.complete ? (
                    <span className="text-xs font-semibold text-[var(--nx-success-text)]">Done</span>
                  ) : null}
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      ) : null}

      <Field title={kind === "onboarding" || kind === "clearance" ? "Notes" : "Summary"}>
        <Textarea
          value={notes}
          rows={3}
          required={kind !== "onboarding" && kind !== "clearance"}
          maxLength={4000}
          disabled={busy}
          onChange={(event) => setNotes(event.target.value)}
        />
      </Field>
      <Field title="Reason for change">
        <Input value={reason} maxLength={500} disabled={busy} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <HrDrawerActions>
        <Button type="submit" disabled={busy}>
          {busy ? "Saving…" : initial ? "Save changes" : "Save draft"}
        </Button>
      </HrDrawerActions>
    </WorkForm>
  );
}

function CaseDetail({ record, w }: { record: HrLifecycleCaseRecord; w: HrLifecycleCaseWorkspace }) {
  const terms = record.terms;
  const date = caseDate(terms);
  const progress = taskProgress(terms);
  const events = w.history.filter((item) => item.record_id === record.id);
  const employment = w.relationships.find((item) => item.id === record.relationship_id);
  const exit = "exit_case_id" in terms ? w.exits.find((item) => item.id === terms.exit_case_id) : undefined;
  return (
    <>
      <CaseWorkflow state={record.state} />
      <HrDetailGroup title="Employee">
        <HrDetailTile label="Employee" value={record.employee_name} />
        {employment ? <HrDetailTile label="Employment" value={employment.label} /> : null}
        {employment ? (
          <HrDetailTile label="Employment status" value={stateLabel[employment.status] ?? employment.status} />
        ) : null}
        {exit ? <HrDetailTile label="Exit" value={exitLabel(exit)} /> : null}
      </HrDetailGroup>
      <HrDetailGroup title={terms.kind === "probation" ? "Review" : "Details"}>
        {date ? <HrDetailTile label={date.label} value={hrDisplayDate(date.value)} /> : null}
        {terms.kind === "probation" ? (
          <>
            <HrDetailTile label="Rating" value={`${terms.rating} / 5`} />
            <HrDetailTile
              label="Outcome"
              value={terms.recommendation === "confirm" ? "Confirm employment" : "Extend probation"}
            />
            {terms.extension_until ? (
              <HrDetailTile label="Extend until" value={hrDisplayDate(terms.extension_until)} />
            ) : null}
          </>
        ) : null}
        {terms.kind === "resignation" || terms.kind === "termination" ? (
          <HrDetailTile
            label={terms.kind === "resignation" ? "Notice reference" : "Decision reference"}
            value={terms.notice_reference}
          />
        ) : null}
        {progress ? <HrDetailTile label="Checklist" value={`${progress.done} of ${progress.total} done`} /> : null}
      </HrDetailGroup>
      {"tasks" in terms && terms.tasks.length ? (
        <HrDetailSection title="Checklist">
          <ul className="m-0! grid list-none gap-1.5 p-0!">
            {terms.tasks.map((task) => (
              <li key={task.id} className="flex min-w-0 items-center justify-between gap-3 text-[13.5px]">
                <span className="min-w-0 wrap-anywhere">{task.title}</span>
                <HrStatusPill status={task.complete ? "completed" : "pending"} label={task.complete ? "Done" : "Open"} />
              </li>
            ))}
          </ul>
        </HrDetailSection>
      ) : null}
      {("summary" in terms && terms.summary) || ("notes" in terms && terms.notes) ? (
        <HrDetailSection title={"summary" in terms ? "Summary" : "Notes"}>
          <HrDetailNote>{"summary" in terms ? terms.summary : "notes" in terms ? terms.notes : ""}</HrDetailNote>
        </HrDetailSection>
      ) : null}
      <HrDetailGroup title="Approval">
        <HrDetailTile label="Status" value={stateLabel[record.state] ?? record.state} />
        <HrDetailTile label="Submitted by" value={record.submitted_by ?? undefined} />
        <HrDetailTile label="Decided by" value={record.decided_by ?? undefined} />
      </HrDetailGroup>
      {events.length ? (
        <HrDetailSection title="History">
          <ol className="m-0! grid list-none gap-2 p-0!">
            {events.map((event, index) => (
              <li key={event.created_at + index} className="text-[13px]">
                <span className="font-medium">{historyLabels[event.action] ?? "Updated"}</span>
                <span className="text-muted-foreground"> · {hrDisplayDate(event.created_at, true)}</span>
                {event.reason ? (
                  <span className="block text-xs text-muted-foreground wrap-anywhere">{event.reason}</span>
                ) : null}
              </li>
            ))}
          </ol>
        </HrDetailSection>
      ) : null}
      <HrDetailAudit
        items={[
          { label: "Updated", value: hrDisplayDate(record.updated_at, true) },
          { label: "Version", value: String(record.version) },
        ]}
      />
    </>
  );
}

export function HrLifecycleCasesWorkspace({
  page,
}: {
  page: keyof typeof lifecycleCasePages;
  onNavigate?: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, loading, csrfToken, activeCompany } = useSession();
  const client = new HrApiClient(api);
  const canRead = session?.user.permissions.includes("hr.employment_history.read");
  const section = lifecycleCasePages[page];
  const company = activeCompany?.id ?? "";
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<"new" | HrLifecycleCaseRecord | null>(null);
  const [preset, setPreset] = useState("");
  const [opened, setOpened] = useState("");
  const [decision, setDecision] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const guard = useRef(false);
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);

  // Search the server as the user types, after a short pause.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setQuery(search.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(handle);
  }, [search]);

  const q: HrLifecycleCaseQuery = {
    company_id: company,
    section,
    state: filter,
    search: query,
    offset,
    limit: PAGE_SIZE,
  };
  const result = useAttendanceRead(company && canRead ? JSON.stringify([q, revision]) : null, () =>
    client.lifecycleCaseWorkspace(q),
  );
  const w = result.data;
  const record = w?.items.find((item) => item.id === opened) ?? null;

  async function command(input: HrLifecycleCaseAction): Promise<boolean> {
    if (guard.current) return false;
    const parsed = hrLifecycleCaseActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => issue.message).join(" "));
      return false;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const saved = await client.actOnLifecycleCase(input, csrfToken(), retry.current.key);
      retry.current = null;
      const label = singular[section];
      setNotice(
        input.action === "save"
          ? `${label} saved as a draft.`
          : `${label}: ${historyLabels[input.action]?.toLowerCase() ?? "updated"}.`,
      );
      // Keep the record in view under its new status.
      if (filter !== "all") {
        const next = saved.status as Filter;
        setFilter(filters[section].some((item) => item.value === next) ? next : "all");
      }
      setOffset(0);
      setEditor(null);
      setDecision(null);
      setReason("");
      setOpened(saved.id);
      setRevision((value) => value + 1);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be completed.");
      return false;
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }

  if (loading) return <Skeleton className="h-32 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Employment history read permission is required.</AlertDescription>
      </Alert>
    );

  const canCreate = !!w?.can_create;
  const decisions = record?.allowed_actions.filter((action) => action in decisionLabels) ?? [];
  const canEdit = record?.allowed_actions.includes("edit") ?? false;
  const allowsCancel = !sectionsWithoutCancel.includes(section);
  const canDelete = allowsCancel && (record?.allowed_actions.includes("cancel") ?? false);
  const rows = (w?.items ?? []).filter((item) => allowsCancel || item.state !== "cancelled");
  const startCase = (relationship = "") => {
    setError("");
    setNotice("");
    setPreset(relationship);
    setEditor("new");
  };

  return (
    <section className="grid min-w-0 gap-3" aria-label={`${singular[section]} cases`} data-lifecycle-workspace={section}>
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id={`hr-lifecycle-${section}-search`}
          value={search}
          onChange={setSearch}
          placeholder="Search employee or status"
        />
        {canCreate ? (
          <Button type="button" className="w-full md:w-auto" disabled={busy} onClick={() => startCase()}>
            {createLabel[section]}
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter<Filter>
        label={`${singular[section]} status`}
        value={filter}
        options={filters[section]}
        onChange={(next) => {
          setFilter(next);
          setOffset(0);
          setOpened("");
        }}
      />

      {!company ? (
        <Alert>
          <AlertDescription>Choose a company at sign-in to see these cases.</AlertDescription>
        </Alert>
      ) : null}
      {notice && !editor && !record ? (
        <p role="status" className="m-0! text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {result.error && !editor && !record ? (
        <Alert variant="destructive">
          <AlertDescription>{result.error}</AlertDescription>
        </Alert>
      ) : null}

      {result.loading && !w ? <Skeleton className="h-40 w-full" /> : null}

      {w ? (
        <>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <WorkTable paging={false} tableId="app/features/hr/views/hr-lifecycle-cases-workspace:2" className="w-full text-left text-sm">
              <caption className="sr-only">{singular[section]} cases</caption>
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Employee
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-sm:hidden`}>
                    {section === "clearance" || section === "onboarding"
                      ? "Checklist"
                      : section === "probation"
                        ? "Review date"
                        : "Last working day"}
                  </th>
                  {section === "probation" ? (
                    <th scope="col" className={`${hrCell} font-semibold max-md:hidden`}>
                      Outcome
                    </th>
                  ) : null}
                  <th scope="col" className={`${hrCell} font-semibold`}>
                    Status
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-md:hidden`}>
                    Updated
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const date = caseDate(item.terms);
                  const progress = taskProgress(item.terms);
                  return (
                    <HrClickableRow
                      key={item.id}
                      onOpen={() => {
                        setError("");
                        setNotice("");
                        setDecision(null);
                        setReason("");
                        setOpened(item.id);
                      }}
                    >
                      <td className={`${hrCell} font-medium wrap-anywhere`}>{item.employee_name}</td>
                      <td className={`${hrCell} text-muted-foreground max-sm:hidden`}>
                        {progress ? `${progress.done} of ${progress.total} done` : date ? hrDisplayDate(date.value) : ""}
                      </td>
                      {section === "probation" ? (
                        <td className={`${hrCell} text-muted-foreground max-md:hidden`}>
                          {item.terms.kind === "probation"
                            ? item.terms.recommendation === "confirm"
                              ? "Confirm"
                              : "Extend"
                            : ""}
                        </td>
                      ) : null}
                      <td className={hrCell}>
                        <HrStatusPill status={item.state} label={stateLabel[item.state]} />
                      </td>
                      <td className={`${hrCell} text-muted-foreground max-md:hidden`}>
                        {hrDisplayDate(item.updated_at, false)}
                      </td>
                    </HrClickableRow>
                  );
                })}
                {!rows.length ? (
                  <tr>
                    <td
                      colSpan={section === "probation" ? 5 : 4}
                      className="px-4 py-10 text-center text-muted-foreground"
                    >
                      {query || filter !== "all" ? "No cases match." : "No cases yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>
          {w.total > PAGE_SIZE ? (
            <nav
              aria-label={`${singular[section]} pages`}
              className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground"
            >
              <span aria-live="polite">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, w.total)} of {w.total}
              </span>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset === 0}
                  onClick={() => setOffset((value) => Math.max(0, value - PAGE_SIZE))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={offset + PAGE_SIZE >= w.total}
                  onClick={() => setOffset((value) => value + PAGE_SIZE)}
                >
                  Next
                </Button>
              </div>
            </nav>
          ) : null}
        </>
      ) : null}

      {w ? (
        <HrRecordDrawer
          title={editor === "new" ? `New ${singular[section].toLowerCase()}` : `Edit ${singular[section].toLowerCase()}`}
          description={`${editor === "new" ? "Create" : "Edit"} ${singular[section].toLowerCase()}`}
          open={editor !== null}
          busy={busy}
          error={editor ? error : undefined}
          onClose={() => setEditor(null)}
        >
          {editor ? (
            <LifecycleCaseForm
              key={editor === "new" ? `new:${preset}` : editor.id + editor.version}
              w={w}
              section={section}
              initial={editor === "new" ? null : editor}
              preset={preset}
              busy={busy}
              onSave={(terms, changeReason) =>
                void command({
                  action: "save",
                  company_id: company,
                  id: editor === "new" ? null : editor.id,
                  expected_version: editor === "new" ? 0 : editor.version,
                  terms,
                  reason: changeReason,
                })
              }
            />
          ) : null}
        </HrRecordDrawer>
      ) : null}

      {w ? (
        <HrRecordDrawer
          title={record?.employee_name ?? singular[section]}
          description={`${singular[section]} details`}
          open={!!record && editor === null}
          busy={busy}
          error={record && !editor ? error : undefined}
          notice={record && !editor ? notice : undefined}
          onClose={() => {
            setOpened("");
            setDecision(null);
          }}
        >
          {record ? (
            <div className="grid min-w-0 gap-4">
              <CaseDetail record={record} w={w} />
              {decision ? (
                <WorkForm
                  className="grid min-w-0 gap-3"
                  aria-label={decisionLabels[decision]}
                  onSubmit={(event) => {
                    event.preventDefault();
                    void command({
                      action: decision as "submit" | "approve" | "reject" | "return",
                      company_id: company,
                      id: record.id,
                      expected_version: record.version,
                      reason,
                    });
                  }}
                >
                  <Field title="Reason">
                    <Textarea
                      rows={2}
                      value={reason}
                      maxLength={500}
                      disabled={busy}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </Field>
                  <HrDrawerActions>
                    <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                      Back
                    </Button>
                    <Button type="submit" disabled={busy}>
                      {busy ? "Saving…" : decisionLabels[decision]}
                    </Button>
                  </HrDrawerActions>
                </WorkForm>
              ) : (
                <HrDrawerActions>
                  {allowsCancel ? (
                    <HrConfirmDeleteButton
                      label={canDelete ? `Delete ${singular[section].toLowerCase()}` : "Only drafts can be deleted"}
                      title={`Delete this ${singular[section].toLowerCase()}?`}
                      description="The draft is cancelled and kept in the history under Cancelled."
                      variant="outline"
                      disabled={busy || !canDelete}
                      onConfirm={() =>
                        command({
                          action: "cancel",
                          company_id: company,
                          id: record.id,
                          expected_version: record.version,
                          reason: "",
                        })
                      }
                    />
                  ) : null}
                  <HrEditButton
                    label={canEdit ? `Edit ${singular[section].toLowerCase()}` : "Only drafts can be edited"}
                    disabled={busy || !canEdit}
                    onClick={() => {
                      setError("");
                      setNotice("");
                      setEditor(record);
                    }}
                  />
                  {decisions.map((action) => (
                    <Button
                      key={action}
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setError("");
                        setReason("");
                        setDecision(action);
                      }}
                    >
                      {decisionLabels[action]}
                    </Button>
                  ))}
                </HrDrawerActions>
              )}
            </div>
          ) : null}
        </HrRecordDrawer>
      ) : null}
    </section>
  );
}
