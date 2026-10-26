"use client";
import { PerformanceParticipation, PersonalPerformanceInbox } from "./hr-performance-participation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  hrPerformanceCommandSchema,
  type HrPerformanceCommand,
  type HrPerformanceRecord,
  type HrPerformanceTerms,
  type HrPerformanceWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import {
  Field,
  Metric,
  State,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
export const performancePages = {
  "performance-cycles": "cycles",
  "goals-kpis": "goals",
  "performance-reviews": "reviews",
  "performance-outcomes": "outcomes",
} as const;
const titles = {
  cycles: "Performance Cycles",
  goals: "Goals & KPIs",
  reviews: "Performance Reviews",
  outcomes: "Performance Outcomes",
};
const kindFor = { cycles: "cycle", goals: "goal", reviews: "review", outcomes: "outcome" } as const;
const actionTitles: Record<string, string> = {
  activate: "Activate cycle",
  close_cycle: "Close cycle",
  cancel_cycle: "Cancel draft cycle",
  approve_goal: "Approve goal",
  revise_goal: "Reopen goal for revision",
  cancel_goal: "Cancel draft goal",
  submit_review: "Submit review",
  publish_review: "Publish review",
  return_review: "Return review to draft",
  submit_outcome: "Submit outcome",
  approve_outcome: "Approve outcome",
  return_outcome: "Return outcome to draft",
  complete_outcome: "Complete follow-up",
};
function remembered(key: string) {
  try {
    return sessionStorage.getItem("nexora.performance." + key) ?? "";
  } catch {
    return "";
  }
}
function remember(key: string, value: string) {
  try {
    sessionStorage.setItem("nexora.performance." + key, value);
  } catch {
    /* Browser storage is optional. */
  }
}
const label = (r: HrPerformanceRecord) =>
  r.terms.kind === "cycle" || r.terms.kind === "goal" ? r.terms.title : (r.employee_name ?? r.employee_id ?? r.id);
function goalLabel(r: HrPerformanceRecord, id: string) {
  const goal = (Array.isArray(r.evidence.goals) ? r.evidence.goals : []).find(
    (g) => g && typeof g === "object" && "id" in g && g.id === id,
  ) as Record<string, unknown> | undefined;
  return goal
    ? String(goal.title) + " · " + Number(goal.weight_bps) / 100 + "% · version " + String(goal.version)
    : "Goal " + id;
}
function detailFields(r: HrPerformanceRecord, w: HrPerformanceWorkspace): [string, string][] {
  const t = r.terms;
  if (t.kind === "cycle")
    return [
      ["Description", t.description || "—"],
      ["Cycle start", t.start_date],
      ["Cycle end", t.end_date],
      ["Review due", t.review_due_date],
    ];
  if (t.kind === "goal")
    return [
      ["Employee", r.employee_name ?? t.employee_id],
      ["KPI measurement", t.measure],
      ["Target", t.target],
      ["Goal weight", t.weight_bps / 100 + "%"],
      ["Due date", t.due_date],
    ];
  if (t.kind === "review")
    return [
      ["Employee", r.employee_name ?? t.employee_id],
      ["Review summary", t.summary],
      ["Strengths", t.strengths],
      ["Development needs", t.development],
    ];
  return [
    ["Outcome", t.outcome_kind.replaceAll("_", " ")],
    ["Follow-up plan", t.plan],
    ["Responsible employee", w.employees.find((e) => e.id === t.owner_employee_id)?.label ?? t.owner_employee_id],
    ["Due date", t.due_date],
  ];
}
function PerformanceForm({
  w,
  initial,
  busy,
  onSave,
  onCancel,
}: {
  w: HrPerformanceWorkspace;
  initial: HrPerformanceRecord | null;
  busy: boolean;
  onSave: (terms: HrPerformanceTerms, reason: string) => void;
  onCancel: () => void;
}) {
  const kind = kindFor[w.section],
    t = initial?.terms;
  const [title, setTitle] = useState(t && (t.kind === "cycle" || t.kind === "goal") ? t.title : ""),
    [description, setDescription] = useState(t?.kind === "cycle" ? t.description : ""),
    [start, setStart] = useState(t?.kind === "cycle" ? t.start_date : localDate()),
    [end, setEnd] = useState(t?.kind === "cycle" ? t.end_date : localDate()),
    [due, setDue] = useState(
      t?.kind === "cycle"
        ? t.review_due_date
        : t?.kind === "goal" || t?.kind === "outcome"
          ? t.due_date
          : w.cycle?.terms.kind === "cycle"
            ? w.cycle.terms.end_date
            : localDate(),
    ),
    [employee, setEmployee] = useState(t && (t.kind === "goal" || t.kind === "review") ? t.employee_id : ""),
    [measure, setMeasure] = useState(t?.kind === "goal" ? t.measure : ""),
    [target, setTarget] = useState(t?.kind === "goal" ? t.target : ""),
    [weight, setWeight] = useState(t?.kind === "goal" ? String(t.weight_bps / 100) : "100"),
    [summary, setSummary] = useState(t?.kind === "review" ? t.summary : ""),
    [strengths, setStrengths] = useState(t?.kind === "review" ? t.strengths : ""),
    [development, setDevelopment] = useState(t?.kind === "review" ? t.development : ""),
    [ratings, setRatings] = useState<Record<string, { rating: number; evidence: string }>>(
      t?.kind === "review"
        ? Object.fromEntries(t.ratings.map((r) => [r.goal_id, { rating: r.rating, evidence: r.evidence }]))
        : {},
    ),
    [review, setReview] = useState(t?.kind === "outcome" ? t.review_id : ""),
    [outcomeKind, setOutcomeKind] = useState<"development_plan" | "recognition" | "promotion_recommendation">(
      t?.kind === "outcome" ? t.outcome_kind : "development_plan",
    ),
    [plan, setPlan] = useState(t?.kind === "outcome" ? t.plan : ""),
    [owner, setOwner] = useState(t?.kind === "outcome" ? t.owner_employee_id : ""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const goalSet = w.goal_sets.find((s) => s.employee_id === employee),
    employeeChoices =
      kind === "review"
        ? w.goal_sets
            .filter((s) => s.weight_bps === 10000 && s.goals.length)
            .map((s) => ({ id: s.employee_id, label: s.employee_name }))
        : w.employees;
  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    let terms: HrPerformanceTerms;
    if (kind === "cycle") terms = { kind, title, description, start_date: start, end_date: end, review_due_date: due };
    else if (kind === "goal") {
      if (!/^\d{1,3}(\.\d{1,2})?$/.test(weight)) {
        setError("Enter a weight from 0.01 to 100, with up to two decimal places.");
        return;
      }
      const [whole, fraction = ""] = weight.split(".");
      terms = {
        kind,
        cycle_id: w.cycle_id!,
        employee_id: employee,
        title,
        measure,
        target,
        weight_bps: Number(whole) * 100 + Number(fraction.padEnd(2, "0")),
        due_date: due,
      };
    } else if (kind === "review") {
      if (!goalSet) {
        setError("Choose an employee with approved goals totalling 100%.");
        return;
      }
      terms = {
        kind,
        cycle_id: w.cycle_id!,
        employee_id: employee,
        goals_hash: goalSet.source_hash,
        summary,
        strengths,
        development,
        ratings: goalSet.goals.map((g) => ({
          goal_id: g.id,
          rating: ratings[g.id]?.rating ?? 3,
          evidence: ratings[g.id]?.evidence ?? "",
        })),
      };
    } else
      terms = { kind, review_id: review, outcome_kind: outcomeKind, plan, owner_employee_id: owner, due_date: due };
    const check = hrPerformanceCommandSchema.safeParse({
      action: "save",
      company_id: w.company_id,
      record_id: initial?.id ?? null,
      expected_version: initial?.version ?? 0,
      terms,
      reason,
    });
    if (!check.success) {
      setError(check.error.issues.map((i) => i.message).join(" "));
      return;
    }
    onSave(terms, reason);
  }
  return (
    <form className={panel + " space-y-4"} onSubmit={submit} aria-label="Performance editor">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">
          {initial ? "Edit draft" : "Create"} {kind}
        </h3>
        <State value="draft" />
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {(kind === "cycle" || kind === "goal") && (
        <Field title="Title">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            minLength={3}
            maxLength={160}
            disabled={busy}
          />
        </Field>
      )}
      {kind === "cycle" && (
        <>
          <Field title="Cycle description">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              disabled={busy}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field title="Cycle start">
              <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} required disabled={busy} />
            </Field>
            <Field title="Cycle end">
              <Input
                type="date"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                min={start}
                required
                disabled={busy}
              />
            </Field>
            <Field title="Review due date">
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                min={end}
                required
                disabled={busy}
              />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Five-point scale: 1 Needs improvement, 2 Developing, 3 Meets expectations, 4 Exceeds expectations, 5
            Exceptional. The overall score is weighted by approved goal percentages.
          </p>
        </>
      )}
      {(kind === "goal" || kind === "review") && (
        <Field title="Employee">
          <select
            className={selectClass}
            value={employee}
            onChange={(e) => setEmployee(e.target.value)}
            required
            disabled={busy || !!initial}
          >
            <option value="">Select employee</option>
            {employeeChoices.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
            {initial && employee && !employeeChoices.some((e) => e.id === employee) && (
              <option value={employee}>{initial.employee_name ?? employee}</option>
            )}
          </select>
        </Field>
      )}
      {kind === "goal" && (
        <>
          <Field title="KPI measurement">
            <Textarea
              value={measure}
              onChange={(e) => setMeasure(e.target.value)}
              required
              minLength={3}
              maxLength={500}
              disabled={busy}
            />
          </Field>
          <Field title="Target">
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              required
              maxLength={500}
              disabled={busy}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field title="Goal weight (%)">
              <Input
                inputMode="decimal"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                required
                disabled={busy}
              />
            </Field>
            <Field title="Goal due date">
              <Input
                type="date"
                value={due}
                min={w.cycle?.terms.kind === "cycle" ? w.cycle.terms.start_date : undefined}
                max={w.cycle?.terms.kind === "cycle" ? w.cycle.terms.end_date : undefined}
                onChange={(e) => setDue(e.target.value)}
                required
                disabled={busy}
              />
            </Field>
          </div>
        </>
      )}
      {kind === "review" && (
        <>
          <p className="text-sm text-muted-foreground">
            Only employees with 100% approved goal weight are offered. Record observed achievement and evidence for
            every goal. Submission is allowed after the cycle ends.
          </p>
          {goalSet?.goals.map((g) => (
            <fieldset key={g.id} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
              <legend className="max-w-full px-1 text-sm font-semibold">
                {g.terms.kind === "goal" ? g.terms.title : g.id} ·{" "}
                {g.terms.kind === "goal" ? g.terms.weight_bps / 100 : 0}%
              </legend>
              <p className="break-words text-sm text-muted-foreground">
                {g.terms.kind === "goal" ? g.terms.measure + " · Target: " + g.terms.target : ""}
              </p>
              <Field title={"Rating for " + label(g)}>
                <select
                  className={selectClass}
                  value={ratings[g.id]?.rating ?? 3}
                  disabled={busy}
                  onChange={(e) =>
                    setRatings((old) => ({
                      ...old,
                      [g.id]: { rating: Number(e.target.value), evidence: old[g.id]?.evidence ?? "" },
                    }))
                  }
                >
                  {["Needs improvement", "Developing", "Meets expectations", "Exceeds expectations", "Exceptional"].map(
                    (s, i) => (
                      <option key={s} value={i + 1}>
                        {i + 1} · {s}
                      </option>
                    ),
                  )}
                </select>
              </Field>
              <Field title={"Achievement evidence for " + label(g)}>
                <Textarea
                  value={ratings[g.id]?.evidence ?? ""}
                  required
                  minLength={5}
                  maxLength={1000}
                  disabled={busy}
                  onChange={(e) =>
                    setRatings((old) => ({
                      ...old,
                      [g.id]: { rating: old[g.id]?.rating ?? 3, evidence: e.target.value },
                    }))
                  }
                />
              </Field>
            </fieldset>
          ))}
          <Field title="Review summary">
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              minLength={10}
              maxLength={4000}
              required
              disabled={busy}
            />
          </Field>
          <Field title="Strengths">
            <Textarea
              value={strengths}
              onChange={(e) => setStrengths(e.target.value)}
              minLength={5}
              maxLength={2000}
              required
              disabled={busy}
            />
          </Field>
          <Field title="Development needs">
            <Textarea
              value={development}
              onChange={(e) => setDevelopment(e.target.value)}
              minLength={5}
              maxLength={2000}
              required
              disabled={busy}
            />
          </Field>
        </>
      )}
      {kind === "outcome" && (
        <>
          <Field title="Published review">
            <select
              className={selectClass}
              value={review}
              onChange={(e) => setReview(e.target.value)}
              required
              disabled={busy || !!initial}
            >
              <option value="">Select published employee review</option>
              {w.published_reviews.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.employee_name} · {String(r.evidence.score ?? "—")}/5
                </option>
              ))}
            </select>
          </Field>
          <Field title="Outcome type">
            <select
              className={selectClass}
              value={outcomeKind}
              onChange={(e) => setOutcomeKind(e.target.value as typeof outcomeKind)}
              disabled={busy}
            >
              <option value="development_plan">Development plan</option>
              <option value="recognition">Recognition</option>
              <option value="promotion_recommendation">Promotion recommendation</option>
            </select>
          </Field>
          <Field title="Follow-up plan">
            <Textarea
              value={plan}
              onChange={(e) => setPlan(e.target.value)}
              minLength={10}
              maxLength={4000}
              required
              disabled={busy}
            />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field title="Responsible employee">
              <select
                className={selectClass}
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
                disabled={busy}
              >
                <option value="">Select follow-up owner</option>
                {w.employees.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field title="Follow-up due date">
              <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} required disabled={busy} />
            </Field>
          </div>
          <p className="text-sm text-muted-foreground">
            Approval records a recommendation and follow-up plan. Salary changes, promotions and course enrolments
            require their own governed workflows.
          </p>
        </>
      )}
      <Field title="Change reason">
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          minLength={5}
          maxLength={500}
          disabled={busy}
        />
      </Field>
      <div className="flex flex-wrap gap-2">
        <Button type="submit" disabled={busy} className="text-primary-foreground!">
          {busy ? "Saving…" : "Save draft"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onCancel}>
          Cancel editing
        </Button>
      </div>
    </form>
  );
}
export function HrPerformanceWorkspace({
  page,
  onNavigate,
}: {
  page: keyof typeof performancePages;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const section = performancePages[page],
    { api, session, csrfToken, loading } = useSession(),
    client = new HrApiClient(api),
    canRead = session?.user.permissions.includes("hr.performance.read");
  const [choice, setChoice] = useState(() => remembered("company")),
    [cycleChoice, setCycleChoice] = useState(() => remembered("cycle")),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState(""),
    [employeeSearch, setEmployeeSearch] = useState(""),
    [employeeFilter, setEmployeeFilter] = useState(""),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [editor, setEditor] = useState<"new" | HrPerformanceRecord | null>(null),
    [opened, setOpened] = useState(""),
    [decision, setDecision] = useState<{ r: HrPerformanceRecord; action: string } | null>(null),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null),
    companies = useAttendanceRead(canRead ? "performance-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? "");
  const query = {
    company_id: company,
    section,
    ...(cycleChoice ? { cycle_id: cycleChoice } : {}),
    search: filter,
    employee_search: employeeFilter,
    limit: 25,
    offset,
  };
  const data = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
      client.performanceWorkspace(query),
    ),
    w = data.data,
    r = w?.items.find((r) => r.id === opened);
  function reset() {
    setEditor(null);
    setOpened("");
    setDecision(null);
    setOffset(0);
    setError("");
    setNotice("");
  }
  async function command(input: HrPerformanceCommand) {
    if (guard.current) return;
    const check = hrPerformanceCommandSchema.safeParse(input);
    if (!check.success) {
      setError(check.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await client.actOnPerformance(input, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice("Performance record " + result.status + " · version " + result.version);
      setEditor(null);
      setDecision(null);
      setOpened(result.id);
      if (input.action === "save" && input.terms.kind === "cycle") {
        setCycleChoice(result.id);
        remember("cycle", result.id);
      }
      remember("company", company);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The Performance action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading your secure workspace…</p>;
  if (!canRead) return <PersonalPerformanceInbox />;
  return (
    <div className="min-w-0 space-y-5" data-performance-workspace>
      <nav aria-label="Performance Management pages" className="flex flex-wrap gap-2">
        {Object.entries(performancePages).map(([p, s]) => (
          <Button
            key={p}
            variant={p === page ? "default" : "outline"}
            className={p === page ? "text-primary-foreground!" : ""}
            disabled={busy || !!editor || !!decision}
            onClick={() => onNavigate("hr", p)}
          >
            {titles[s]}
          </Button>
        ))}
      </nav>
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{titles[section]}</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              {section === "cycles"
                ? "Define the assessment period, activate its goals and close after all reviews and follow-ups are complete."
                : section === "goals"
                  ? "Agree measurable goals for company employees. Approved goal weights must total 100% before a review."
                  : section === "reviews"
                    ? "Rate approved goals, retain achievement evidence and publish through independent review."
                    : "Turn published reviews into approved, owned follow-ups. Recommendations remain separate from employment and Payroll approvals."}
            </p>
          </div>
          {w?.can_create && (
            <Button
              className="text-primary-foreground!"
              disabled={busy || !!editor || !!decision}
              onClick={() => {
                setEditor("new");
                setDecision(null);
                setError("");
              }}
            >
              Create {kindFor[section]}
            </Button>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Company">
            <select
              className={selectClass}
              value={company}
              disabled={busy || !!editor || !!decision}
              onChange={(e) => {
                setChoice(e.target.value);
                remember("company", e.target.value);
                setCycleChoice("");
                remember("cycle", "");
                reset();
              }}
            >
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </Field>
          <Field title="Performance cycle">
            <select
              className={selectClass}
              value={w?.cycle_id ?? cycleChoice}
              disabled={busy || !!editor || !!decision}
              onChange={(e) => {
                setCycleChoice(e.target.value);
                remember("cycle", e.target.value);
                reset();
              }}
            >
              {!w?.cycles.length && <option value="">Create a cycle first</option>}
              {w?.cycles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label} · {c.state}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <form
          className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter(search);
            reset();
          }}
        >
          <div className="col-span-2 min-w-0 sm:flex-1">
            <Field title="Search records">
              <Input
                value={search}
                maxLength={120}
                disabled={busy || !!editor || !!decision}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Employee, title or status"
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
            onClick={() => {
              setRevision((v) => v + 1);
              reset();
            }}
          >
            Refresh
          </Button>
        </form>
        {section !== "cycles" && (
          <form
            className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              setEmployeeFilter(employeeSearch);
            }}
          >
            <div className="col-span-2 min-w-0 sm:flex-1">
              <Field title="Employee options search">
                <Input
                  value={employeeSearch}
                  maxLength={120}
                  disabled={busy || !!editor || !!decision}
                  onChange={(e) => setEmployeeSearch(e.target.value)}
                  placeholder="Find an employee by name or number before creating"
                />
              </Field>
            </div>
            <Button type="submit" variant="outline" disabled={busy || !!editor || !!decision}>
              Find employee
            </Button>
          </form>
        )}
      </section>
      {(error || data.error || companies.error) && (
        <div role="alert" className={panel + " border-destructive text-destructive"}>
          {error || data.error || companies.error}
        </div>
      )}
      {notice && (
        <p role="status" className={panel}>
          {notice}
        </p>
      )}
      {data.loading && <p role="status">Loading connected Performance records…</p>}
      {w && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              title="Cycle state"
              value={w.cycle?.state ?? "Not created"}
              hint={w.cycle ? label(w.cycle) : "Create a cycle to begin"}
            />
            <Metric title="Matching records" value={w.total} hint={titles[section]} />
            <Metric title="Rating scale" value="1–5" hint="Weighted by approved goals" />
          </div>
          {w.blocked.length > 0 && (
            <section className={panel + " border-[var(--nx-warning)]"}>
              {w.blocked.map((t) => (
                <p key={t} className="text-sm">
                  {t}
                </p>
              ))}
            </section>
          )}
          {w.employees_truncated && (
            <p className="text-sm text-muted-foreground">
              The employee selector shows the first 100 matches. Use Employee options search to narrow the list.
            </p>
          )}
          {section === "reviews" && <PerformanceParticipation key={w.company_id + ":" + w.cycle_id} workspace={w} />}
          <section className={panel + " space-y-3"}>
            <h3 className="text-base font-semibold">{titles[section]} records</h3>
            {!w.items.length ? (
              <p className="py-3 text-sm text-muted-foreground">
                No matching records.{" "}
                {section === "cycles"
                  ? "Create a cycle to begin."
                  : section === "outcomes"
                    ? "Publish an employee review before creating its follow-up."
                    : section === "reviews"
                      ? "Approve employee goals totalling 100% before saving a review."
                      : "Activate a cycle before assigning employee goals."}
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-sm">
                  <caption className="sr-only">Company Performance records and available governed actions</caption>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {["Record / employee", "Details", "State", "Actions"].map((t) => (
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
                          <p className="font-medium">{label(i)}</p>
                          {i.kind === "goal" && <p className="text-xs text-muted-foreground">{i.employee_name}</p>}
                          <p className="text-xs text-muted-foreground">Version {i.version}</p>
                        </td>
                        <td className="max-w-60 break-words px-3 py-4 text-muted-foreground">
                          {i.terms.kind === "cycle"
                            ? i.terms.start_date + " → " + i.terms.end_date
                            : i.terms.kind === "goal"
                              ? i.terms.weight_bps / 100 + "% · " + i.terms.target
                              : i.terms.kind === "review"
                                ? String(i.evidence.score ?? "—") + "/5 · " + String(i.evidence.band ?? "")
                                : i.terms.outcome_kind.replaceAll("_", " ") + " · due " + i.terms.due_date}
                        </td>
                        <td className="px-3 py-4">
                          <State value={i.state} />
                        </td>
                        <td className="px-3 py-4">
                          <div className="flex flex-wrap gap-2">
                            <Button size="sm" variant="outline" onClick={() => setOpened(i.id)}>
                              Open
                            </Button>
                            {i.allowed_actions.map((a) => (
                              <Button
                                key={a}
                                size="sm"
                                variant="outline"
                                disabled={busy || !!editor || !!decision}
                                onClick={() => {
                                  if (a === "edit") {
                                    setEditor(i);
                                    setError("");
                                  } else {
                                    setDecision({ r: i, action: a });
                                    setEditor(null);
                                    setReason("");
                                    setError("");
                                  }
                                }}
                              >
                                {a === "edit" ? "Edit draft" : (actionTitles[a] ?? a)}
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
              <span className="text-muted-foreground">
                {w.total ? offset + 1 : 0}–{Math.min(offset + 25, w.total)} of {w.total}
              </span>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset === 0 || !!editor || !!decision}
                  onClick={() => setOffset((v) => Math.max(0, v - 25))}
                >
                  Previous
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={offset + 25 >= w.total || !!editor || !!decision}
                  onClick={() => setOffset((v) => v + 25)}
                >
                  Next
                </Button>
              </div>
            </div>
          </section>
          {editor && (
            <PerformanceForm
              key={(editor === "new" ? "new" : editor.id + editor.version) + section}
              w={w}
              initial={editor === "new" ? null : editor}
              busy={busy}
              onCancel={() => setEditor(null)}
              onSave={(terms, reason) =>
                command({
                  action: "save",
                  company_id: company,
                  record_id: editor === "new" ? null : editor.id,
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
              aria-label="Performance decision review"
              onSubmit={(e) => {
                e.preventDefault();
                command({
                  action: decision.action as Exclude<HrPerformanceCommand["action"], "save">,
                  company_id: company,
                  record_id: decision.r.id,
                  expected_version: decision.r.version,
                  reason,
                });
              }}
            >
              <h3 className="text-lg font-semibold">{actionTitles[decision.action]}</h3>
              <p className="text-sm">
                {label(decision.r)} · version {decision.r.version}. The server rechecks current source evidence, company
                scope and independent decision authority.
              </p>
              {decision.action === "complete_outcome" && (
                <p className="text-sm">
                  Record completed follow-up evidence in the reason. Completion closes this plan; employment and
                  compensation changes remain separate approvals.
                </p>
              )}
              <Field title="Decision reason / completion evidence">
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
                  {busy ? "Saving…" : "Confirm action"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                  Cancel review
                </Button>
              </div>
            </form>
          )}
          {r && (
            <section className={panel + " space-y-3"} aria-label="Performance record detail">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">{label(r)}</h3>
                <Button size="sm" variant="outline" onClick={() => setOpened("")}>
                  Close detail
                </Button>
              </div>
              <State value={r.state} />
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {detailFields(r, w).map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-muted-foreground">{k.replaceAll("_", " ")}</dt>
                    <dd className="whitespace-pre-wrap break-words">{String(v)}</dd>
                  </div>
                ))}
              </dl>
              {r.terms.kind === "review" && (
                <>
                  <p className="font-semibold">
                    Weighted score: {String(r.evidence.score ?? "—")}/5 · {String(r.evidence.band ?? "")}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {r.state === "published"
                      ? "Published assessment and goal evidence are immutable."
                      : "Submit after the cycle ends, then publish through an independent officer."}
                  </p>
                  <ol className="space-y-3">
                    {r.terms.ratings.map((i) => (
                      <li key={i.goal_id} className="rounded-lg border border-border p-3 text-sm">
                        <p className="break-all font-medium">
                          {goalLabel(r, i.goal_id)} · rating {i.rating}/5
                        </p>
                        <p className="mt-1 whitespace-pre-wrap break-words">{i.evidence}</p>
                      </li>
                    ))}
                  </ol>
                </>
              )}
              <p className="break-all text-xs text-muted-foreground">
                Record {r.id} · created by {r.created_by} · updated by {r.updated_by} ·{" "}
                {new Date(r.updated_at).toLocaleString()}
              </p>
            </section>
          )}
          <section className={panel}>
            <h3 className="font-semibold">Cycle audit history</h3>
            {!w.history.length ? (
              <p className="mt-2 text-sm text-muted-foreground">No actions recorded.</p>
            ) : (
              <ol className="mt-3 divide-y">
                {w.history.map((h, i) => (
                  <li key={h.created_at + i} className="py-3 text-sm">
                    <p className="font-medium">
                      {actionTitles[h.action] ?? (h.action === "save" ? "Draft saved" : h.action)} · {h.actor_id}
                    </p>
                    <p className="mt-1 break-words text-muted-foreground">{h.reason}</p>
                    <time className="text-xs text-muted-foreground">{new Date(h.created_at).toLocaleString()}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
