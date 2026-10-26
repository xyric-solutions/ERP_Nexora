"use client";
import { SettlementCorrectionExecution } from "../components/settlement-correction-execution";
import { SettlementCorrectionReview } from "../components/settlement-correction-review";
import { SettlementCountryEvidence } from "../components/settlement-country-controls";
import { useRef, useState } from "react";
import { HrSettlementBenefits } from "./hr-settlement-benefits";
import { HrSettlementEntitlements } from "./hr-settlement-entitlements";
import { formatHrMinor as minor } from "../components/payroll-money";
import { SettlementPayrollHandoff } from "./hr-settlement-payroll";
import { SettlementLineCalculation } from "../components/settlement-line-calculation";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  hrLifecycleCaseActionSchema,
  type HrLifecycleCaseAction,
  type HrLifecycleCaseTerms,
  type HrLifecycleCaseRecord,
  type HrLifecycleCaseWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  Metric,
  panel,
  selectClass,
  State,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
import { HrEmployeeAssignmentsWorkspace } from "./hr-employee-assignments-workspace";
import { HrEmployeeApprovalsWorkspace } from "./hr-employee-approvals-workspace";
export const lifecycleCasePages = {
  onboarding: "onboarding",
  "probation-reviews": "probation",
  resignations: "resignation",
  terminations: "termination",
  clearance: "clearance",
  "final-settlements": "settlement",
  offboarding: "offboarding",
} as const;
const titles = {
  onboarding: "Onboarding",
  probation: "Probation Reviews",
  resignation: "Resignations",
  termination: "Termination Cases",
  clearance: "Exit Clearance",
  settlement: "Final Settlements",
  offboarding: "Offboarding Control Centre",
};
const actionTitles: Record<string, string> = {
  request_void: "Request statement correction",
  approve_void: "Approve correction and restore leave",
  reject_void: "Reject statement correction",
  edit: "Edit draft",
  submit: "Submit for approval",
  approve: "Approve case",
  return: "Return to draft",
  cancel: "Cancel draft",
  apply_exit: "Complete offboarding",
  calculate_benefit: "Company benefit calculated",
  calculate_encashment: "Leave encashment calculated",
};
const checklist = {
  onboarding: [
    ["identity", "Identity and employee documents"],
    ["employment", "Approved employment and joining records"],
    ["access", "Required workspace access"],
    ["equipment", "Equipment and workplace readiness"],
    ["payroll", "Payroll setup and salary readiness"],
  ],
  clearance: [
    ["assets", "Returned assets and equipment"],
    ["access", "Access revocation and account ownership"],
    ["finance", "Finance balances and recovery review"],
    ["knowledge", "Knowledge and work handover"],
    ["hr", "HR documents and exit interview"],
  ],
};
type Task = { id: string; title: string; complete: boolean; evidence: string };
function LifecycleCaseForm({
  w,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  w: HrLifecycleCaseWorkspace;
  initial: HrLifecycleCaseRecord | null;
  busy: boolean;
  onSave: (terms: HrLifecycleCaseTerms, reason: string) => void;
  onCancel: () => void;
}) {
  const t = initial?.terms,
    kind = w.section as Exclude<typeof w.section, "offboarding">;
  const [relationship, setRelationship] = useState(t && "relationship_id" in t ? t.relationship_id : ""),
    [exit, setExit] = useState(t && "exit_case_id" in t ? t.exit_case_id : ""),
    [date, setDate] = useState(
      t && "due_date" in t
        ? t.due_date
        : t && "effective_date" in t
          ? t.effective_date
          : t && "last_working_date" in t
            ? t.last_working_date
            : localDate(),
    ),
    [notes, setNotes] = useState(t && "notes" in t ? t.notes : t && "summary" in t ? t.summary : ""),
    [reference, setReference] = useState(t && "notice_reference" in t ? t.notice_reference : ""),
    [recommendation, setRecommendation] = useState<"confirm" | "extend">(
      t?.kind === "probation" ? t.recommendation : "confirm",
    ),
    [extension, setExtension] = useState(t?.kind === "probation" ? (t.extension_until ?? "") : ""),
    [rating, setRating] = useState(t?.kind === "probation" ? t.rating : 3),
    [currency, setCurrency] = useState(t?.kind === "settlement" ? t.currency : (w.currencies[0]?.code ?? "")),
    [lines, setLines] = useState(
      t?.kind === "settlement"
        ? t.lines
        : [
            {
              direction: "earning" as "earning" | "deduction",
              description: "",
              amount_minor: "0",
              source_reference: "",
            },
          ],
    ),
    [tasks, setTasks] = useState<Task[]>(
      t && "tasks" in t
        ? t.tasks
        : kind === "onboarding" || kind === "clearance"
          ? checklist[kind].map(([id, title]) => ({ id, title, complete: false, evidence: "" }))
          : [],
    ),
    [reason, setReason] = useState("");
  function save() {
    let terms: HrLifecycleCaseTerms;
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
      terms = {
        kind,
        relationship_id: relationship,
        last_working_date: date,
        notice_reference: reference,
        summary: notes,
      };
    else if (kind === "clearance") terms = { kind, exit_case_id: exit, tasks, notes };
    else terms = { kind: "settlement", exit_case_id: exit, currency, lines, notes };
    onSave(terms, reason);
  }
  return (
    <form
      className={panel + " space-y-4"}
      aria-label="Lifecycle case editor"
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <h3 className="text-lg font-semibold">
        {initial ? "Edit draft" : "Create"} {titles[kind]}
      </h3>
      {kind === "clearance" || kind === "settlement" ? (
        <Field title="Approved exit case">
          <select
            className={selectClass}
            value={exit}
            required
            disabled={busy || !!initial}
            onChange={(e) => setExit(e.target.value)}
          >
            <option value="">Choose approved exit</option>
            {w.exits.map((e) => (
              <option key={e.id} value={e.id}>
                {e.employee_name} · {e.kind} ·{" "}
                {e.terms.kind === "resignation" || e.terms.kind === "termination" ? e.terms.last_working_date : ""}
              </option>
            ))}
          </select>
        </Field>
      ) : (
        <Field title="Employment relationship">
          <select
            className={selectClass}
            value={relationship}
            required
            disabled={busy || !!initial}
            onChange={(e) => setRelationship(e.target.value)}
          >
            <option value="">Choose approved employment</option>
            {w.relationships.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label} · {r.status}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!["clearance", "settlement"].includes(kind) && (
        <Field
          title={
            kind === "onboarding"
              ? "Joining checklist due date"
              : kind === "probation"
                ? "Review effective date"
                : "Last working date"
          }
        >
          <Input type="date" value={date} required disabled={busy} onChange={(e) => setDate(e.target.value)} />
        </Field>
      )}
      {kind === "probation" && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Probation recommendation">
            <select
              className={selectClass}
              value={recommendation}
              disabled={busy}
              onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
            >
              <option value="confirm">Confirm employment</option>
              <option value="extend">Extend probation review period</option>
            </select>
          </Field>
          <Field title="Review rating">
            <select
              className={selectClass}
              value={rating}
              disabled={busy}
              onChange={(e) => setRating(Number(e.target.value))}
            >
              {[1, 2, 3, 4, 5].map((v) => (
                <option key={v} value={v}>
                  {v} / 5
                </option>
              ))}
            </select>
          </Field>
          {recommendation === "extend" && (
            <Field title="Extended probation end">
              <Input
                type="date"
                min={date}
                value={extension}
                required
                disabled={busy}
                onChange={(e) => setExtension(e.target.value)}
              />
            </Field>
          )}
          <p className="text-sm text-muted-foreground sm:col-span-2">
            Confirmation requires an authorized transition in the approved employment policy. For a termination
            recommendation, raise a separate Termination Case.
          </p>
        </div>
      )}
      {(kind === "resignation" || kind === "termination") && (
        <Field title="Notice / decision evidence reference">
          <Input
            value={reference}
            required
            minLength={5}
            maxLength={500}
            disabled={busy}
            onChange={(e) => setReference(e.target.value)}
          />
        </Field>
      )}
      {kind === "clearance" && (
        <p className="text-sm text-muted-foreground">
          Complete linked-account deactivation through Security before submitting exit clearance. Checklist evidence
          alone does not revoke system access.
        </p>
      )}
      {(kind === "onboarding" || kind === "clearance") && (
        <div className="space-y-3">
          {tasks.map((task, index) => (
            <fieldset key={task.id} className="min-w-0 space-y-2 rounded-lg border border-border p-3">
              <legend className="max-w-full break-words px-1 text-sm font-semibold">{task.title}</legend>
              <label htmlFor={"lifecycle-task-" + task.id} className="flex items-center gap-2 text-sm">
                <Checkbox
                  id={"lifecycle-task-" + task.id}
                  checked={task.complete}
                  disabled={busy}
                  onCheckedChange={(checked) =>
                    setTasks((v) => v.map((x, i) => (i === index ? { ...x, complete: checked === true } : x)))
                  }
                />
                Verified complete
              </label>
              <Field title={"Evidence for " + task.title}>
                <Textarea
                  value={task.evidence}
                  required={task.complete}
                  minLength={task.complete ? 5 : undefined}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(e) =>
                    setTasks((v) => v.map((x, i) => (i === index ? { ...x, evidence: e.target.value } : x)))
                  }
                />
              </Field>
            </fieldset>
          ))}
        </div>
      )}
      {kind === "settlement" && (
        <>
          <Field title="Settlement currency">
            <select
              className={selectClass}
              value={currency}
              required
              disabled={busy}
              onChange={(e) => setCurrency(e.target.value)}
            >
              <option value="">Choose active currency</option>
              {w.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.decimal_places} decimal places
                </option>
              ))}
            </select>
          </Field>
          <p className="text-sm text-muted-foreground">
            Enter exact minor currency units: the smallest unit at the selected precision. This statement records
            reviewed earnings and recoveries; it does not post a journal or mark payment made. Retain approved Payroll,
            leave, loan and asset references for every line.
          </p>
          {lines.map((line, index) => (
            <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
              <legend className="px-1 text-sm font-medium">Settlement line {index + 1}</legend>
              {line.benefit_source_id && (
                <p className="text-sm text-muted-foreground">
                  Calculated from an approved company benefit rule and retained service evidence. Refresh it in Company
                  settlement benefits below; its financial terms cannot be edited manually.
                </p>
              )}
              {line.encashment_source_id && (
                <p className="text-sm text-muted-foreground">
                  Calculated from approved leave policy and balance evidence. Refresh it in Leave encashment below; its
                  financial terms cannot be edited manually.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <Field title={"Line " + (index + 1) + " direction"}>
                  <select
                    className={selectClass}
                    disabled={busy || !!(line.encashment_source_id || line.benefit_source_id)}
                    value={line.direction}
                    onChange={(e) =>
                      setLines((v) =>
                        v.map((x, i) => (i === index ? { ...x, direction: e.target.value as typeof x.direction } : x)),
                      )
                    }
                  >
                    <option value="earning">Earning</option>
                    <option value="deduction">Deduction / recovery</option>
                  </select>
                </Field>
                <Field title={"Line " + (index + 1) + " amount in minor units"}>
                  <Input
                    inputMode="numeric"
                    pattern="(0|[1-9][0-9]{0,14})"
                    value={line.amount_minor}
                    readOnly={!!line.calculation}
                    disabled={busy || !!(line.encashment_source_id || line.benefit_source_id)}
                    required
                    onChange={(e) =>
                      setLines((v) => v.map((x, i) => (i === index ? { ...x, amount_minor: e.target.value } : x)))
                    }
                  />
                </Field>
              </div>
              <p className="text-sm text-muted-foreground">
                Currency amount: {currency}{" "}
                {minor(line.amount_minor, w.currencies.find((c) => c.code === currency)?.decimal_places ?? 2)}
              </p>
              <SettlementLineCalculation
                line={line}
                index={index}
                busy={busy || !!(line.encashment_source_id || line.benefit_source_id)}
                onChange={(next) => setLines((v) => v.map((item, i) => (i === index ? next : item)))}
              />
              <Field title={"Line " + (index + 1) + " description"}>
                <Input
                  value={line.description}
                  required
                  minLength={3}
                  maxLength={160}
                  disabled={busy || !!(line.encashment_source_id || line.benefit_source_id)}
                  onChange={(e) =>
                    setLines((v) => v.map((x, i) => (i === index ? { ...x, description: e.target.value } : x)))
                  }
                />
              </Field>
              <Field title={"Line " + (index + 1) + " reviewed source reference"}>
                <Input
                  value={line.source_reference}
                  required
                  minLength={5}
                  maxLength={500}
                  disabled={busy || !!(line.encashment_source_id || line.benefit_source_id)}
                  onChange={(e) =>
                    setLines((v) => v.map((x, i) => (i === index ? { ...x, source_reference: e.target.value } : x)))
                  }
                />
              </Field>
              {(lines.length > 1 || line.encashment_source_id || line.benefit_source_id) && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    setLines((v) => {
                      const next = v.filter((_, i) => i !== index);
                      return next.length
                        ? next
                        : [{ direction: "earning", description: "", amount_minor: "0", source_reference: "" }];
                    })
                  }
                >
                  Remove line {index + 1}
                </Button>
              )}
            </fieldset>
          ))}
          <Button
            type="button"
            variant="outline"
            disabled={busy || lines.length >= 30}
            onClick={() =>
              setLines((v) => [
                ...v,
                { direction: "earning", description: "", amount_minor: "0", source_reference: "" },
              ])
            }
          >
            Add statement line
          </Button>
        </>
      )}
      <Field
        title={
          kind === "probation" || kind === "resignation" || kind === "termination" ? "Review summary" : "Case notes"
        }
      >
        <Textarea
          value={notes}
          required={!["onboarding", "clearance"].includes(kind)}
          minLength={!["onboarding", "clearance"].includes(kind) ? 10 : undefined}
          maxLength={4000}
          disabled={busy}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>
      <Field title="Change reason">
        <Textarea
          value={reason}
          required
          minLength={5}
          maxLength={500}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" className="text-primary-foreground!" disabled={busy}>
          Save draft
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
export function HrLifecycleCasesWorkspace({
  page,
  onNavigate,
}: {
  page: keyof typeof lifecycleCasePages;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, loading, csrfToken } = useSession(),
    client = new HrApiClient(api),
    canRead = session?.user.permissions.includes("hr.employment_history.read"),
    section = lifecycleCasePages[page];
  const [companyRevision, setCompanyRevision] = useState(0),
    [choice, setChoice] = useState(""),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [editor, setEditor] = useState<"new" | HrLifecycleCaseRecord | null>(null),
    [opened, setOpened] = useState(""),
    [decision, setDecision] = useState<{ record: HrLifecycleCaseRecord; action: string } | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null),
    companies = useAttendanceRead(canRead ? "lifecycle-companies:" + companyRevision : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? ""),
    q = { company_id: company, section, search: filter, offset, limit: 25 },
    result = useAttendanceRead(company && canRead ? JSON.stringify([q, revision]) : null, () =>
      client.lifecycleCaseWorkspace(q),
    ),
    w = result.data,
    r = w?.items.find((x) => x.id === opened);
  async function command(input: HrLifecycleCaseAction) {
    if (guard.current) return;
    const parsed = hrLifecycleCaseActionSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const r = await client.actOnLifecycleCase(input, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice(
        [
          "calculate_payroll_correction",
          "approve_payroll_correction",
          "reject_payroll_correction",
          "post_payroll_correction",
        ].includes(input.action)
          ? r.status === "supplemental_payroll_posted"
            ? "Supplement posted to Payroll tax carry-forwards and actual Finance. Payment remains separate."
            : "Supplemental Payroll: " + r.status.replaceAll("_", " ")
          : input.action === "request_financial_correction"
            ? "Financial correction submitted for independent review. Original records are preserved."
            : input.action === "decide_financial_correction"
              ? input.decision === "approve"
                ? "Review approved. Separate Payroll correction is pending; no entries or payment have been changed."
                : "Financial correction review rejected."
              : input.action === "request_void"
                ? "Correction submitted for independent review. Payroll handoff and offboarding are paused."
                : input.action === "approve_void"
                  ? "Statement cancelled and consumed leave restored. Create a replacement draft."
                  : input.action === "reject_void"
                    ? "Correction rejected. The original statement remains approved."
                    : r.status === "payroll_inputs_prepared"
                      ? "Draft Payroll inputs prepared. Review and approve them in Payroll."
                      : "Lifecycle case " + r.status + " · version " + r.version,
      );
      setEditor(null);
      setDecision(null);
      setOpened(r.id);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The lifecycle action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading secure workspace…</p>;
  if (!canRead)
    return <section className={panel}>Company-scoped employment history read permission is required.</section>;
  return (
    <div className="min-w-0 space-y-5" data-lifecycle-workspace>
      <nav aria-label="Employee Lifecycle pages" className="flex flex-wrap gap-2">
        {Object.entries(lifecycleCasePages).map(([id, k]) => (
          <Button
            key={id}
            variant={id === page ? "default" : "outline"}
            className={id === page ? "text-primary-foreground!" : ""}
            disabled={busy || !!editor || !!decision}
            onClick={() => onNavigate("hr", id)}
          >
            {titles[k]}
          </Button>
        ))}
        <Button
          variant="outline"
          disabled={busy || !!editor || !!decision}
          onClick={() => onNavigate("hr", "employee-movements")}
        >
          Transfers & promotions
        </Button>
        <Button
          variant="outline"
          disabled={busy || !!editor || !!decision}
          onClick={() => onNavigate("hr", "lifecycle-policies")}
        >
          Lifecycle Policies
        </Button>
      </nav>
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{titles[section]}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {section === "offboarding"
                ? "Complete approved exits after clearance and settlement review. Effective employment history and assignment closure are recorded together."
                : section === "settlement"
                  ? "Calculate reviewed entitlements, approve the statement and track linked Payroll inputs through Finance posting. Banking payment remains pending integration."
                  : "Create evidence-based cases for approved employment. Submission freezes the reviewed terms; a separate officer approves or returns the case."}
            </p>
          </div>
          {w?.can_create && (
            <Button
              className="text-primary-foreground!"
              disabled={busy || !!editor || !!decision}
              onClick={() => {
                setEditor("new");
                setError("");
              }}
            >
              Create case
            </Button>
          )}
        </div>
        <Field title="Company">
          <select
            className={selectClass}
            value={company}
            disabled={busy || !!editor || !!decision || companies.loading || !companies.data?.items.length}
            onChange={(e) => {
              setChoice(e.target.value);
              setOffset(0);
              setOpened("");
              setError("");
              setNotice("");
            }}
          >
            {!companies.data?.items.length && (
              <option value="">
                {companies.loading
                  ? "Loading authorized companies…"
                  : companies.error
                    ? "Companies could not be loaded"
                    : "No authorized companies"}
              </option>
            )}
            {companies.data?.items.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.code})
              </option>
            ))}
          </select>
        </Field>
        {companies.error && (
          <div role="alert" className="space-y-2 text-sm">
            <p>{companies.error}</p>
            <Button type="button" variant="outline" onClick={() => setCompanyRevision((v) => v + 1)}>
              Retry authorized companies
            </Button>
          </div>
        )}
        {!companies.loading && !companies.error && companies.data?.items.length === 0 && (
          <p role="status" className="text-sm text-muted-foreground">
            No companies are assigned to your account. Ask your administrator to review company access.
          </p>
        )}
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter(search);
            setOffset(0);
            setOpened("");
          }}
        >
          <div className="min-w-0 flex-1 basis-48">
            <Field title="Search cases and employment options">
              <Input
                value={search}
                maxLength={120}
                disabled={busy || !!editor || !!decision}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee, relationship, status or evidence"
              />
            </Field>
          </div>
          <Button type="submit" variant="outline" disabled={busy || !!editor || !!decision}>
            Search
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !!editor || !!decision}
            onClick={() => setRevision((v) => v + 1)}
          >
            Refresh
          </Button>
        </form>
      </section>
      {(error || result.error || companies.error) && (
        <div role="alert" className={panel + " border-destructive text-destructive"}>
          {error || result.error || companies.error}
        </div>
      )}
      {notice && (
        <p role="status" className={panel}>
          {notice}
        </p>
      )}
      {result.loading && <p role="status">Loading connected employment cases…</p>}
      {w && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric title="Matching cases" value={w.total} hint={titles[section]} />
            <Metric
              title="Approved employment options"
              value={w.relationships.length}
              hint="Select the employee’s legal employment relationship"
            />
            <Metric
              title="Approved exits awaiting closure"
              value={w.exits.length}
              hint="Clearance → settlement review → offboarding"
            />
          </div>
          {w.truncated && (
            <p role="status" className={panel}>
              This view has a bounded record limit. Narrow the employee search to find employment options; archived
              cases remain preserved.
            </p>
          )}
          <section className={panel + " space-y-3"}>
            <h3 className="font-semibold">{titles[section]} cases</h3>
            {!w.items.length ? (
              <p className="text-sm text-muted-foreground">
                No matching cases.{" "}
                {section === "clearance" || section === "settlement"
                  ? "Approve a resignation or termination first."
                  : section === "offboarding"
                    ? "Approved resignations and terminations will appear here."
                    : "Choose approved employment to prepare a case."}
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <caption className="sr-only">Governed employee lifecycle cases</caption>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {["Employee / case", "State", "Updated", "Actions"].map((t) => (
                        <th key={t} scope="col" className="px-3 py-3 font-medium">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {w.items.map((i) => (
                      <tr key={i.id} className="border-b last:border-0">
                        <td className="max-w-64 break-words px-3 py-4">
                          <p className="font-medium">{i.employee_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.kind} · version {i.version}
                          </p>
                        </td>
                        <td className="px-3 py-4">
                          <State value={i.state} />
                        </td>
                        <td className="px-3 py-4 text-muted-foreground">
                          {new Date(i.updated_at).toLocaleDateString()}
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setOpened(i.id)}>
                              Open
                            </Button>
                            {i.allowed_actions
                              .filter((a) => section !== "offboarding" || a === "apply_exit")
                              .map((a) => (
                                <Button
                                  key={a}
                                  size="sm"
                                  variant="outline"
                                  disabled={busy || !!editor || !!decision}
                                  onClick={() => {
                                    if (a === "edit") setEditor(i);
                                    else {
                                      setDecision({ record: i, action: a });
                                      setReason("");
                                    }
                                    setError("");
                                  }}
                                >
                                  {actionTitles[a]}
                                </Button>
                              ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span>
                {w.total ? offset + 1 : 0}–{Math.min(offset + 25, w.total)} of {w.total}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset === 0 || !!editor || !!decision}
                  onClick={() => setOffset((v) => Math.max(0, v - 25))}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + 25 >= w.total || !!editor || !!decision}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
          {editor && (
            <LifecycleCaseForm
              key={editor === "new" ? "new" : editor.id + editor.version}
              w={w}
              initial={editor === "new" ? null : editor}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(terms, reason) =>
                command({
                  action: "save",
                  company_id: company,
                  id: editor === "new" ? null : editor.id,
                  expected_version: editor === "new" ? 0 : editor.version,
                  terms,
                  reason,
                })
              }
            />
          )}
          {decision && (
            <form
              className={panel + " space-y-4"}
              aria-label="Lifecycle decision review"
              onSubmit={(e) => {
                e.preventDefault();
                command({
                  action: decision.action as Exclude<
                    HrLifecycleCaseAction["action"],
                    | "save"
                    | "prepare_payroll"
                    | "request_financial_correction"
                    | "decide_financial_correction"
                    | "calculate_payroll_correction"
                    | "approve_payroll_correction"
                    | "reject_payroll_correction"
                    | "post_payroll_correction"
                  >,
                  company_id: company,
                  id: decision.record.id,
                  expected_version: decision.record.version,
                  reason,
                });
              }}
            >
              <h3 className="text-lg font-semibold">{actionTitles[decision.action]}</h3>
              <p className="text-sm">
                {decision.record.employee_name} · version {decision.record.version}. The server rechecks current
                authority, case evidence and employment history.
              </p>
              {decision.action === "approve" &&
                decision.record.terms.kind === "settlement" &&
                decision.record.terms.lines.some((l) => l.encashment_source_id) && (
                  <p className="rounded-lg border border-border bg-muted p-3 text-sm">
                    Approving this statement deducts its calculated encashment days from the leave ledger. It does not
                    post Payroll or make payment. Review the rule, eligible days and rate before confirming.
                  </p>
                )}
              {["request_void", "approve_void", "reject_void"].includes(decision.action) && (
                <div className="rounded-lg border border-border bg-muted p-3 text-sm space-y-2">
                  <p>
                    A separate officer must review this correction. Approval cancels the entire statement and restores
                    its consumed leave. Original amounts, policy evidence and ledger entries remain in history. Create a
                    replacement draft after approval.
                  </p>
                  <p>
                    Payroll handoff and offboarding pause while review is pending. Generated Payroll inputs must first
                    be independently rejected; only zero-value exclusions can remain. Calculated or finalized Payroll
                    and externally processed amounts require the governed financial correction process.
                  </p>
                  {decision.record.void_requests
                    .filter((v) => v.state === "submitted")
                    .map((v) => (
                      <p key={v.id} className="whitespace-pre-wrap break-words">
                        <strong>Requested correction:</strong> {v.reason}
                      </p>
                    ))}
                </div>
              )}
              {decision.action === "apply_exit" && (
                <p className="text-sm">
                  This action closes the approved employment and assignment period. Clearance and settlement statements
                  must already be approved. It records no payment and sends no external notification.
                </p>
              )}
              <Field title="Decision reason">
                <Textarea
                  value={reason}
                  required
                  minLength={5}
                  maxLength={500}
                  disabled={busy}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" className="text-primary-foreground!" disabled={busy}>
                  Confirm action
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                  Cancel review
                </Button>
              </div>
            </form>
          )}
          {r && (
            <section className={panel + " space-y-4"} aria-label="Lifecycle case detail">
              <div className="flex flex-wrap justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  {r.employee_name} · {r.kind}
                </h3>
                <Button size="sm" variant="outline" onClick={() => setOpened("")}>
                  Close detail
                </Button>
              </div>
              <State value={r.state} />
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {Object.entries(r.terms)
                  .filter(([k]) => !["tasks", "lines", "kind"].includes(k))
                  .map(([k, v]) => (
                    <div key={k}>
                      <dt className="text-muted-foreground">{k.replaceAll("_", " ")}</dt>
                      <dd className="whitespace-pre-wrap break-words">{v === null ? "—" : String(v)}</dd>
                    </div>
                  ))}
              </dl>
              {"tasks" in r.terms &&
                r.terms.tasks.map((t) => (
                  <div key={t.id} className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">
                      {t.title} · {t.complete ? "Complete" : "Pending"}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-muted-foreground">
                      {t.evidence || "Evidence not recorded"}
                    </p>
                  </div>
                ))}
              {r.terms.kind === "settlement" && (
                <>
                  <p className="font-semibold">
                    {r.state === "cancelled" ? "Original statement, retained for audit · " : ""}
                    {r.terms.currency} net statement: {minor(r.evidence.net_minor, r.evidence.money_scale)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Approval of this statement is separate from financial posting and payment. Banking integration is
                    deferred.
                  </p>
                  <SettlementCorrectionReview key={r.id} record={r} company={company} busy={busy} onCommand={command} />
                  <SettlementCorrectionExecution
                    key={r.id}
                    record={r}
                    company={company}
                    busy={busy}
                    onCommand={command}
                  />
                  {r.void_blockers.map((b, i) => (
                    <p key={i} className="rounded-lg border border-border bg-muted p-3 text-sm">
                      {b}
                    </p>
                  ))}
                  {r.void_requests.some((v) => v.state === "submitted") && (
                    <p role="status" className="rounded-lg border border-border bg-muted p-3 text-sm">
                      Correction review pending. Payroll handoff and offboarding are paused until an independent officer
                      decides.
                    </p>
                  )}
                  {r.state === "cancelled" && r.void_requests.some((v) => v.state === "approved") && (
                    <p className="rounded-lg border border-border bg-muted p-3 text-sm">
                      This statement was cancelled through independent correction approval. Its encashed leave was
                      restored. The original amounts below are retained for audit; create and approve a replacement
                      statement before offboarding.
                    </p>
                  )}
                  {r.void_requests.length > 0 && (
                    <section aria-label="Statement correction history" className="space-y-3">
                      <h4 className="font-semibold">Correction history</h4>
                      <p className="text-xs text-muted-foreground">
                        Latest 25 reviews; earlier decisions remain in the audit record.
                      </p>
                      {r.void_requests.map((v) => (
                        <div key={v.id} className="rounded-lg border border-border p-3 text-sm space-y-1">
                          <p className="font-medium">
                            {v.state === "submitted"
                              ? "Pending review"
                              : v.state === "approved"
                                ? "Approved correction"
                                : "Rejected correction"}
                          </p>
                          <p className="whitespace-pre-wrap break-words">{v.reason}</p>
                          <p className="break-words text-muted-foreground">
                            Requested by {v.requested_by} · {new Date(v.created_at).toLocaleString()}
                          </p>
                          {v.decision_reason && (
                            <p className="whitespace-pre-wrap break-words">
                              Decision: {v.decision_reason} · {v.decided_by}
                            </p>
                          )}
                        </div>
                      ))}
                    </section>
                  )}
                  {r.country_sources.length > 0 && (
                    <section aria-label="Captured country policy evidence" className="space-y-3">
                      <h4 className="font-semibold">Reviewed country policies</h4>
                      {r.country_sources.map((s) => (
                        <SettlementCountryEvidence key={s.source_id} evidence={s.evidence} />
                      ))}
                    </section>
                  )}
                  {r.terms.lines.map((l, i) => (
                    <div key={i} className="rounded-lg border border-border p-3 text-sm">
                      <p className="break-words font-medium">
                        {l.description} · {l.direction} · {minor(l.amount_minor, r.evidence.money_scale)}{" "}
                        {r.terms.kind === "settlement" ? r.terms.currency : ""}
                      </p>
                      <p className="mt-1 break-words text-muted-foreground">{l.source_reference}</p>
                      {l.calculation && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          Reviewed quantity {l.calculation.quantity} × rate {l.calculation.rate_minor} minor units;
                          {l.calculation.rate_divisor || l.calculation.rate_multiplier
                            ? " policy factor " +
                              (l.calculation.rate_multiplier ?? 1) +
                              "/" +
                              (l.calculation.rate_divisor ?? 1) +
                              ";"
                            : ""}{" "}
                          rounded half up once on the total.
                        </p>
                      )}
                    </div>
                  ))}
                </>
              )}
              <p className="break-all text-xs text-muted-foreground">
                Case {r.id} · created by {r.created_by} · updated by {r.updated_by} · decision by{" "}
                {r.decided_by ?? "Pending"}
              </p>
            </section>
          )}
          {section === "settlement" && (
            <HrSettlementEntitlements
              key={company + ":" + (r?.id ?? "company")}
              company={company}
              record={r ?? null}
              busy={busy || !!editor || !!decision}
              onBusy={setBusy}
              onCalculated={() => {
                setNotice(
                  "Calculated encashment saved to the draft; submit for independent approval to consume leave.",
                );
                setRevision((v) => v + 1);
              }}
            />
          )}
          {section === "settlement" && (
            <HrSettlementBenefits
              key={company + ":benefits:" + (r?.id ?? "company")}
              company={company}
              record={r ?? null}
              busy={busy || !!editor || !!decision}
              onBusy={setBusy}
              onCalculated={() => {
                setNotice("Company benefit saved to the draft; submit for independent statement approval.");
                setRevision((v) => v + 1);
              }}
            />
          )}
          {r?.kind === "settlement" && (
            <SettlementPayrollHandoff
              key={r.id + ":" + revision}
              record={r}
              w={w}
              busy={busy}
              onPrepare={command}
              onNavigate={onNavigate}
            />
          )}
          <section className={panel}>
            <h3 className="font-semibold">Company lifecycle audit</h3>
            <ol className="mt-3 divide-y">
              {w.history.map((h, index) => (
                <li key={h.created_at + index} className="py-3 text-sm">
                  <p className="font-medium">
                    {actionTitles[h.action] ?? "Draft saved"} · {h.actor_id}
                  </p>
                  <p className="mt-1 break-words text-muted-foreground">{h.reason}</p>
                  <time className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</time>
                </li>
              ))}
            </ol>
            {!w.history.length && <p className="mt-2 text-sm text-muted-foreground">No lifecycle actions recorded.</p>}
          </section>
        </>
      )}
    </div>
  );
}
export function HrLifecycleMovementsWorkspace({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const [tab, setTab] = useState<"prepare" | "approve">("prepare");
  return (
    <div
      className="min-w-0 space-y-4 [&_.overflow-x-auto]:relative [&_button.bg-primary]:text-primary-foreground! [&_label]:min-w-0 [&_section]:min-w-0 [&_select]:w-full [&_select]:min-w-0"
      data-lifecycle-movements
    >
      <section className={panel + " space-y-3"}>
        <h2 className="text-xl font-semibold">Transfers, Promotions & Movements</h2>
        <p className="text-sm text-muted-foreground">
          Prepare effective-dated transfers, promotions, manager, work location and organizational changes against the
          employee’s existing assignment. Independent decisions create the authoritative assignment segment. Salary
          revisions remain a separate Payroll approval.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button
            className={tab === "prepare" ? "text-primary-foreground!" : ""}
            variant={tab === "prepare" ? "default" : "outline"}
            onClick={() => setTab("prepare")}
          >
            Prepare movements
          </Button>
          <Button
            className={tab === "approve" ? "text-primary-foreground!" : ""}
            variant={tab === "approve" ? "default" : "outline"}
            onClick={() => setTab("approve")}
          >
            Review approvals
          </Button>
        </div>
      </section>
      {tab === "prepare" ? <HrEmployeeAssignmentsWorkspace /> : <HrEmployeeApprovalsWorkspace onAction={onAction} />}
    </div>
  );
}
