"use client";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrRecordDrawer } from "../components/hr-record-drawer";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  HrApplicationDirectory,
  HrInterviewActionRequest,
  HrInterviewPanelDirectory,
  HrInterviewWorkspace,
} from "@nexora/contracts";
import { CalendarDays, CheckCircle2, Clock3, Plus, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import {
  HrDetailFigures,
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  HrStatusPill,
} from "../components/hr-detail-tile";

type Interview = HrInterviewWorkspace["interviews"][number];
type Assessment = HrInterviewWorkspace["assessments"][number];
type RunAction = (payload: HrInterviewActionRequest) => Promise<boolean>;
type Scope = { company_id: string; application_id: string };
const selectClass =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const label = (value: string) => value.replaceAll("_", " ").replace(/^./, (c) => c.toUpperCase());
const actionLabels: Record<string, string> = {
  schedule: "Interview scheduled",
  reschedule: "Interview rescheduled",
  complete: "Interview completed",
  cancel: "Interview cancelled",
  no_show: "Candidate did not attend",
  evaluate: "Evaluation submitted",
  assessment_add: "Assessment added",
  assessment_decide: "Assessment decision recorded",
  select: "Candidate selected",
};
const time = (value: string) => new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
const failure = (err: unknown) =>
  err instanceof ApiError ? err.message : "The action could not be completed. Please retry.";

function ScheduleForm({
  scope,
  panel,
  panelSearch,
  onPanelSearch,
  busy,
  run,
  close,
  interview,
}: {
  scope: Scope;
  panel: HrInterviewPanelDirectory["items"];
  /** Typed panel search; the list reloads from the server as you type. */
  panelSearch: string;
  onPanelSearch: (value: string) => void;
  busy: boolean;
  run: RunAction;
  close: () => void;
  interview?: Interview;
}) {
  const [kind, setKind] = useState<"screening" | "technical" | "panel" | "hr" | "final">(
    interview?.kind ?? "technical",
  );
  const [starts, setStarts] = useState("");
  const [duration, setDuration] = useState(interview?.duration_minutes ?? 60);
  const [mode, setMode] = useState<"on_site" | "video" | "telephone">(interview?.mode ?? "video");
  const [location, setLocation] = useState(interview?.location ?? "");
  const [members, setMembers] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!starts) return;
    const common = { ...scope, starts_at: new Date(starts).toISOString(), duration_minutes: duration, mode, location };
    const payload: HrInterviewActionRequest = interview
      ? { ...common, action: "reschedule", interview_id: interview.id, expected_version: interview.version, reason }
      : { ...common, action: "schedule", kind, panel_user_ids: members };
    if (await run(payload)) close();
  };
  return (
    <form onSubmit={submit} className="grid min-w-0 gap-4 rounded-xl border border-primary/30 bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="m-0 text-lg font-semibold">
            {interview ? `Reschedule round ${interview.round}` : "Schedule interview"}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Times use your local timezone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          aria-label="Close schedule form"
          onClick={close}
        >
          <X className="size-4" />
        </Button>
      </div>
      <HrDetailSection title="Interview">
        <div className="grid gap-3 sm:grid-cols-2">
          {!interview ? (
            <label className="grid content-start gap-1.5 text-sm">
              Interview type
              <select className={selectClass} value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
                {["screening", "technical", "panel", "hr", "final"].map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="grid content-start gap-1.5 text-sm">
            Start date and time
            <Input required type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
          </label>
          <label className="grid content-start gap-1.5 text-sm">
            Duration (minutes)
            <Input
              required
              type="number"
              min={15}
              max={240}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value))}
            />
          </label>
          <label className="grid content-start gap-1.5 text-sm">
            Interview mode
            <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
              {["video", "on_site", "telephone"].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid content-start gap-1.5 text-sm sm:col-span-2">
            Location or meeting reference
            <Input
              required
              maxLength={300}
              value={location}
              placeholder="Meeting room, video meeting reference or phone contact"
              onChange={(e) => setLocation(e.target.value)}
            />
          </label>
        </div>
      </HrDetailSection>
      {!interview ? (
        <HrDetailSection title="Panel members · choose 2–8">
          <Input
            type="search"
            aria-label="Search panel members"
            value={panelSearch}
            maxLength={160}
            placeholder="Search by name or email…"
            onChange={(e) => onPanelSearch(e.target.value)}
          />
          <div className="grid max-h-48 gap-2 overflow-y-auto sm:grid-cols-2">
            {panel.map((person) => (
              <label key={person.id} className="flex items-center gap-2 rounded-md bg-muted/40 p-2 text-sm">
                <Checkbox
                  checked={members.includes(person.id)}
                  disabled={busy || (!members.includes(person.id) && members.length >= 8)}
                  onCheckedChange={(checked) =>
                    setMembers((current) =>
                      checked ? [...current, person.id] : current.filter((id) => id !== person.id),
                    )
                  }
                />
                <span className="min-w-0 break-words">{person.name}</span>
              </label>
            ))}
          </div>
          {!panel.length ? (
            <p className="text-sm text-muted-foreground">
              No matching eligible panel accounts.
            </p>
          ) : null}
        </HrDetailSection>
      ) : (
        <HrDetailSection title="Reason">
          <label className="grid content-start gap-1.5 text-sm">
            Reason for rescheduling
            <Textarea maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          </label>
        </HrDetailSection>
      )}
      <HrDrawerActions>
        <Button
          type="submit"
          className="text-primary-foreground!"
          disabled={busy || (!interview && members.length < 2)}
        >
          {busy ? "Saving…" : interview ? "Save new schedule" : "Schedule interview"}
        </Button>
      </HrDrawerActions>
    </form>
  );
}

function EvaluationForm({
  scope,
  interview,
  busy,
  run,
}: {
  scope: Scope;
  interview: Interview;
  busy: boolean;
  run: RunAction;
}) {
  const [scores, setScores] = useState<Record<string, number>>({}),
    [recommendation, setRecommendation] = useState<"strong_hire" | "hire" | "hold" | "no_hire">("hire");
  const [strengths, setStrengths] = useState(""),
    [concerns, setConcerns] = useState("");
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    await run({
      ...scope,
      action: "evaluate",
      interview_id: interview.id,
      scores,
      recommendation,
      strengths,
      concerns,
    });
  };
  return (
    <form onSubmit={submit} className="grid min-w-0 gap-5">
      <HrDetailSummary status={interview.status} statusLabel={label(interview.status)}>
        Round {interview.round} · {label(interview.kind)} · {time(interview.starts_at)}
      </HrDetailSummary>
      <HrDetailSection title="Your panel scorecard">
        {interview.template.map((criterion) => (
          <label
            key={criterion.id}
            className="grid content-start grid-cols-[1fr_110px] items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm"
          >
            <span>
              {criterion.label}
              <span className="ml-2 text-xs text-muted-foreground">{criterion.weight}%</span>
            </span>
            <select
              required
              aria-label={`${criterion.label} rating`}
              className={selectClass}
              disabled={busy}
              value={scores[criterion.id] ?? ""}
              onChange={(e) => setScores({ ...scores, [criterion.id]: Number(e.target.value) })}
            >
              <option value="">Rating</option>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>
                  {n} / 5
                </option>
              ))}
            </select>
          </label>
        ))}
      </HrDetailSection>
      <HrDetailSection title="Recommendation">
        <label className="grid content-start gap-1.5 text-sm">
          Recommendation
          <select
            className={selectClass}
            value={recommendation}
            onChange={(e) => setRecommendation(e.target.value as typeof recommendation)}
          >
            {["strong_hire", "hire", "hold", "no_hire"].map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid content-start gap-1.5 text-sm">
          Strengths
          <Textarea required maxLength={2000} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
        </label>
        <label className="grid content-start gap-1.5 text-sm">
          Concerns (enter “None” if appropriate)
          <Textarea required maxLength={2000} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
        </label>
      </HrDetailSection>
      <Button
        type="submit"
        className="text-primary-foreground!"
        disabled={busy || Object.keys(scores).length !== interview.template.length}
      >
        Submit my evaluation
      </Button>
    </form>
  );
}

function StatusForm({
  scope,
  interview,
  busy,
  run,
}: {
  scope: Scope;
  interview: Interview;
  busy: boolean;
  run: RunAction;
}) {
  const [action, setAction] = useState<"complete" | "cancel" | "no_show">(
      interview.status === "no_show" ? "cancel" : "complete",
    ),
    [reason, setReason] = useState("");
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ ...scope, action, interview_id: interview.id, expected_version: interview.version, reason }))
          setReason("");
      }}
    >
      <HrDetailSummary status={interview.status} statusLabel={label(interview.status)}>
        Round {interview.round} · {label(interview.kind)} · {time(interview.starts_at)}
      </HrDetailSummary>
      <HrDetailSection title="Outcome">
        <label className="grid content-start gap-1.5 text-sm">
          Record interview outcome
          <select
            className={selectClass}
            value={action}
            disabled={busy}
            onChange={(e) => setAction(e.target.value as typeof action)}
          >
            {(interview.status === "no_show" ? ["cancel"] : ["complete", "no_show", "cancel"]).map((value) => (
              <option key={value} value={value}>
                {label(value)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid content-start gap-1.5 text-sm">
          Outcome reason
          <Textarea
            maxLength={1000}
            value={reason}
            disabled={busy}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </HrDetailSection>
      <Button type="submit" variant="outline" disabled={busy}>
        Save outcome
      </Button>
    </form>
  );
}

function AssessmentDecision({
  scope,
  assessment,
  busy,
  run,
}: {
  scope: Scope;
  assessment: Assessment;
  busy: boolean;
  run: RunAction;
}) {
  const [outcome, setOutcome] = useState<"passed" | "failed">("passed"),
    [reason, setReason] = useState("");
  return (
    <form
      className="grid gap-5"
      onSubmit={async (e) => {
        e.preventDefault();
        await run({ ...scope, action: "assessment_decide", assessment_id: assessment.id, outcome, reason });
      }}
    >
      <HrDetailSummary status={assessment.status}>
        {assessment.title} · {assessment.mandatory ? "Required" : "Optional"}
      </HrDetailSummary>
      <HrDetailSection title="Decision">
        <label className="grid content-start gap-1 text-sm">
          Assessment outcome
          <select
            className={selectClass}
            value={outcome}
            onChange={(e) => setOutcome(e.target.value as typeof outcome)}
          >
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
          </select>
        </label>
        <label className="grid content-start gap-1 text-sm">
          Decision evidence
          <Textarea
            maxLength={1000}
            value={reason}
            placeholder="Record findings and supporting reference"
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </HrDetailSection>
      <Button type="submit" variant="outline" disabled={busy}>
        Record final decision
      </Button>
    </form>
  );
}

export function HrInterviewsWorkspace() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.employee.read"),
    canUpdate = permissions.includes("hr.employee.update"),
    canSelect = permissions.includes("hr.employee.approve");
  const [noCompany, setNoCompany] = useState(false),
    [companyId, setCompanyId] = useState("");
  const [apps, setApps] = useState<HrApplicationDirectory>({ items: [], total: 0 }),
    [applicationId, setApplicationId] = useState("");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState({ search: "", offset: 0 });
  // The candidate search applies as you type, after a short pause, from the first page.
  useEffect(() => {
    const timer = setTimeout(
      () => setQuery((current) => (current.search === search.trim() ? current : { search: search.trim(), offset: 0 })),
      300,
    );
    return () => clearTimeout(timer);
  }, [search]);
  const [workspace, setWorkspace] = useState<HrInterviewWorkspace | null>(null),
    [selectedId, setSelectedId] = useState("");
  const [panel, setPanel] = useState<HrInterviewPanelDirectory["items"]>([]),
    [panelSearch, setPanelSearch] = useState(""),
    [panelQuery, setPanelQuery] = useState("");
  // Typing in the panel search reloads eligible accounts after a short pause.
  useEffect(() => {
    const timer = setTimeout(() => setPanelQuery(panelSearch.trim()), 300);
    return () => clearTimeout(timer);
  }, [panelSearch]);
  const [editor, setEditor] = useState<"schedule" | "reschedule" | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [assessmentTitle, setAssessmentTitle] = useState(""),
    [mandatory, setMandatory] = useState(true),
    [assessmentReason, setAssessmentReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const [recordOpen, setRecordOpen] = useState(false);
  const sequence = useRef(0);
  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let cancelled = false;
    client
      .companies()
      .then((result) => {
        if (!cancelled) {
          setNoCompany(result.items.length === 0);
          setCompanyId(result.items[0]?.id ?? "");
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(failure(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionLoading, canRead, session?.user.id, session?.tenant_id]);
  useEffect(() => {
    if (!companyId || !canRead) return;
    let cancelled = false;
    setLoading(true);
    client
      .applications({ companyId, search: query.search, offset: query.offset, limit: 50 })
      .then((result) => {
        if (!cancelled) {
          setApps(result);
          setApplicationId((current) =>
            result.items.some((item) => item.id === current)
              ? current
              : (result.items.find((item) => ["shortlisted", "interview", "evaluation"].includes(item.stage))?.id ??
                result.items[0]?.id ??
                ""),
          );
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setApps({ items: [], total: 0 });
          setApplicationId("");
          setError(failure(err));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, companyId, canRead, query]);
  useEffect(() => {
    if (!companyId || !canRead) return;
    let cancelled = false;
    setPanel([]);
    client
      .interviewPanel({ companyId, search: panelQuery })
      .then((result) => {
        if (!cancelled) setPanel(result.items);
      })
      .catch((err) => {
        if (!cancelled) setError(failure(err));
      });
    return () => {
      cancelled = true;
    };
  }, [client, companyId, canRead, panelQuery]);
  const load = useCallback(async () => {
    if (!companyId || !applicationId) return;
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await client.interviewWorkspace(companyId, applicationId);
      if (current === sequence.current) {
        setWorkspace(result);
        setApps((current) => ({
          ...current,
          items: current.items.map((item) =>
            item.id === result.application.id ? { ...item, stage: result.application.stage } : item,
          ),
        }));
        setSelectedId((id) =>
          result.interviews.some((item) => item.id === id) ? id : (result.interviews[0]?.id ?? ""),
        );
      }
    } catch (err) {
      if (current === sequence.current) {
        setWorkspace(null);
        setError(failure(err));
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [client, companyId, applicationId]);
  useEffect(() => {
    setWorkspace(null);
    setEditor(null);
    setDecisionReason("");
    void load();
    return () => {
      sequence.current += 1;
    };
  }, [load]);
  const run: RunAction = async (payload) => {
    if (busy) return false;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await client.interviewAction(payload, csrfToken(), crypto.randomUUID());
      setNotice(`${actionLabels[payload.action]} with its audit evidence.`);
      await load();
      return true;
    } catch (err) {
      setError(failure(err));
      return false;
    } finally {
      setBusy(false);
    }
  };
  const scope = { company_id: companyId, application_id: applicationId },
    selected = workspace?.interviews.find((item) => item.id === selectedId);
  const editable = !!workspace && ["shortlisted", "interview", "evaluation"].includes(workspace.application.stage),
    scheduleAllowed = editable && workspace?.application.stage !== "evaluation";
  const actorName = (id: string) =>
    id === session?.user.id
      ? session.user.display_name
      : (workspace?.interviews.flatMap((item) => item.panel).find((person) => person.user_id === id)?.name ??
        panel.find((person) => person.id === id)?.name ??
        id);
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session || !canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>Sign in with HR employee read permission to review interviews.</AlertDescription>
      </Alert>
    );
  const chosen = apps.items.find((item) => item.id === applicationId);
  const openApplication = (id: string) => {
    setApplicationId(id);
    setNotice("");
    setError("");
    setRecordOpen(true);
  };
  const roundCard = (item: Interview) => {
    const mine = item.evaluations.find((evaluation) => evaluation.user_id === session.user.id);
    const submitted = item.panel.filter((person) =>
      item.evaluations.some((evaluation) => evaluation.user_id === person.user_id),
    ).length;
    return (
      <article
        key={item.id}
        className={`grid min-w-0 gap-4 rounded-xl border bg-card p-4 ${item.id === selectedId ? "border-primary/60" : "border-border"}`}
        aria-label={`Round ${item.round} ${label(item.kind)} interview`}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h5 className="m-0 font-semibold">
              Round {item.round} · {label(item.kind)}
            </h5>
            <p className="mt-1.5 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock3 className="size-4 shrink-0" />
              {time(item.starts_at)} · {item.duration_minutes} minutes
            </p>
            <p className="mt-1 break-words text-sm text-muted-foreground">
              {label(item.mode)} · {item.location}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <HrStatusPill status={item.status} label={label(item.status)} />
            <Badge variant="outline">
              Evaluations {submitted}/{item.panel.length}
            </Badge>
          </div>
        </div>
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3">
          <h6 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Panel</h6>
          {item.panel.map((person) => {
            const evaluation = item.evaluations.find((entry) => entry.user_id === person.user_id);
            return (
              <div key={person.user_id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-words">{person.name}</span>
                <Badge variant="outline">
                  {evaluation
                    ? `${evaluation.weighted_score}% · ${label(evaluation.recommendation)}`
                    : "Awaiting evaluation"}
                </Badge>
              </div>
            );
          })}
        </div>
        {canUpdate && editable ? (
          <div className="flex flex-wrap gap-2">
            {["scheduled", "no_show"].includes(item.status) ? (
              <>
                <HrRecordDrawer
                  title="Record interview outcome"
                  triggerLabel="Record outcome"
                  completionKey={notice}
                  busy={busy}
                  error={error}
                  notice={notice}
                >
                  <StatusForm key={`${item.id}-${item.version}`} scope={scope} interview={item} busy={busy} run={run} />
                </HrRecordDrawer>
                {scheduleAllowed ? (
                  <Button
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      setSelectedId(item.id);
                      setEditor("reschedule");
                    }}
                  >
                    Reschedule
                  </Button>
                ) : null}
              </>
            ) : null}
            {item.status === "completed" && item.panel.some((person) => person.user_id === session.user.id) && !mine ? (
              <HrRecordDrawer
                title="Interview evaluation"
                triggerLabel="Submit my evaluation"
                completionKey={notice}
                busy={busy}
                error={error}
                notice={notice}
              >
                <EvaluationForm key={item.id} scope={scope} interview={item} busy={busy} run={run} />
              </HrRecordDrawer>
            ) : null}
          </div>
        ) : null}
        {item.evaluations.length ? (
          <div className="grid gap-2 border-t border-border pt-3">
            <h6 className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Submitted scorecards
            </h6>
            {item.evaluations.map((evaluation) => (
              <details key={evaluation.id} className="rounded-lg border border-border p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  {item.panel.find((person) => person.user_id === evaluation.user_id)?.name ?? evaluation.user_id} ·{" "}
                  {evaluation.weighted_score}% · {label(evaluation.recommendation)}
                </summary>
                <div className="mt-3 grid gap-2 text-sm">
                  <p>
                    <strong>Strengths:</strong> {evaluation.strengths}
                  </p>
                  <p>
                    <strong>Concerns:</strong> {evaluation.concerns}
                  </p>
                  {item.template.map((criterion) => (
                    <p key={criterion.id} className="text-muted-foreground">
                      {criterion.label}: {evaluation.scores[criterion.id]} / 5 · {criterion.weight}% weight
                    </p>
                  ))}
                  <span className="text-xs text-muted-foreground">Submitted {time(evaluation.submitted_at)}</span>
                </div>
              </details>
            ))}
          </div>
        ) : null}
      </article>
    );
  };
  return (
    <section
      aria-label="Live interviews and evaluations"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_h4]:mb-0 [&_h5]:mb-0 [&_h6]:mb-0 [&_ul]:m-0 [&_ul]:pl-5"
    >
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
          {notice}
        </div>
      ) : null}
      {noCompany ? (
        <Alert>
          <AlertTitle>Company access required</AlertTitle>
          <AlertDescription>Company access must be granted before interviews can be reviewed.</AlertDescription>
        </Alert>
      ) : null}
      <form
        className="grid items-end gap-3 rounded-xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setQuery({ search, offset: 0 });
        }}
      >
        <label className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
          Search
          <Input
            type="search"
            value={search}
            maxLength={160}
            placeholder="Candidate, reference or role"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </form>
      <div className="relative min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full min-w-160 text-left text-sm">
          <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Candidate</th>
              <th className="px-4 py-3">Opening</th>
              <th className="px-4 py-3">Application</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Last update</th>
            </tr>
          </thead>
          <tbody>
            {apps.items.map((item) => (
              <tr
                key={item.id}
                tabIndex={0}
                className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                onClick={() => openApplication(item.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    openApplication(item.id);
                  }
                }}
              >
                <td className="px-4 py-3">
                  <span className="block font-medium">{item.candidate_name}</span>
                  <span className="block text-xs text-muted-foreground">{item.candidate_email}</span>
                </td>
                <td className="px-4 py-3">{item.opening_title}</td>
                <td className="px-4 py-3 whitespace-nowrap">{item.reference}</td>
                <td className="px-4 py-3">
                  <Badge variant={item.stage === "rejected" ? "destructive" : "secondary"}>{label(item.stage)}</Badge>
                </td>
                <td className="px-4 py-3 whitespace-nowrap">{new Date(item.updated_at).toLocaleDateString()}</td>
              </tr>
            ))}
            {!apps.items.length ? (
              <tr>
                <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                  No matching candidates.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2">
          <span className="text-xs text-muted-foreground">{apps.total} applications</span>
          <div className="flex gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || query.offset === 0}
              onClick={() => setQuery((current) => ({ ...current, offset: Math.max(0, current.offset - 50) }))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={busy || query.offset + 50 >= apps.total}
              onClick={() => setQuery((current) => ({ ...current, offset: current.offset + 50 }))}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      <HrMasterSheet
        open={recordOpen && Boolean(applicationId)}
        onOpenChange={(open) => {
          if (!open && !busy) {
            setRecordOpen(false);
            setEditor(null);
          }
        }}
        eyebrow="Interviews & Evaluations"
        title={chosen?.candidate_name ?? workspace?.application.candidate_name ?? "Candidate"}
        description={chosen ? `${chosen.reference} · ${chosen.opening_title}` : ""}
      >
        {loading && !workspace ? (
          <Skeleton className="h-96 w-full" />
        ) : !workspace ? (
          <p className="m-0! text-sm text-muted-foreground">The interview record could not be loaded.</p>
        ) : (
          <div className="grid min-w-0 gap-4" aria-label={`${workspace.application.candidate_name} interview record`}>
            <div className="grid gap-4">
              <HrDetailSummary
                code={workspace.application.reference}
                status={workspace.application.stage}
                statusLabel={label(workspace.application.stage)}
              >
                {workspace.application.opening_title}
              </HrDetailSummary>
              <HrDetailFigures
                items={[
                  { label: "Interview rounds", value: workspace.interviews.length },
                  {
                    label: "Evaluators",
                    value: (
                      <>
                        {workspace.readiness.evaluators}
                        <span className="ml-1 text-sm font-normal text-muted-foreground">
                          / {workspace.readiness.minimum_evaluators} minimum
                        </span>
                      </>
                    ),
                  },
                  {
                    label: "Weighted average",
                    value:
                      workspace.readiness.average_score === null ? "Pending" : `${workspace.readiness.average_score}%`,
                  },
                  {
                    label: "Selection readiness",
                    value: workspace.readiness.ready ? "Ready" : `${workspace.readiness.blockers.length} open`,
                  },
                ]}
              />
              <HrDetailGroup title="Candidate">
                <HrDetailTile label="Name" value={workspace.application.candidate_name} />
                {chosen ? <HrDetailTile label="Email" value={chosen.candidate_email} /> : null}
                <HrDetailTile label="Opening" value={workspace.application.opening_title} />
              </HrDetailGroup>
              {canUpdate && scheduleAllowed ? (
                <HrDrawerActions>
                  <Button className="text-primary-foreground!" disabled={busy} onClick={() => setEditor("schedule")}>
                    <Plus className="size-4" />
                    Schedule interview
                  </Button>
                </HrDrawerActions>
              ) : null}
              {!editable ? (
                <Alert>
                  <AlertTitle>Application stage: {label(workspace.application.stage)}</AlertTitle>
                  <AlertDescription>
                    Interview evidence is maintained at Shortlisted, Interview and Evaluation. Progress the application
                    in Recruitment Pipeline when appropriate.
                  </AlertDescription>
                </Alert>
              ) : null}
            </div>
            <HrRecordDrawer
              title={editor === "reschedule" ? "Reschedule interview" : "Schedule interview"}
              open={!!editor && canUpdate}
              onClose={() => setEditor(null)}
              busy={busy}
              error={error}
              notice={notice}
            >
              {editor && canUpdate ? (
                <>
                  <ScheduleForm
                    key={`${applicationId}-${editor}-${selectedId}`}
                    scope={scope}
                    panel={panel}
                    panelSearch={panelSearch}
                    onPanelSearch={setPanelSearch}
                    busy={busy}
                    run={run}
                    close={() => setEditor(null)}
                    interview={editor === "reschedule" ? selected : undefined}
                  />
                </>
              ) : null}
            </HrRecordDrawer>
            <HrDetailSection title="Interviews & evaluations">
              {workspace.interviews.length ? (
                workspace.interviews.map(roundCard)
              ) : (
                <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
                  <CalendarDays className="mx-auto size-7 text-primary" />
                  <h5 className="mb-0 mt-3 font-semibold">No interview rounds yet</h5>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Schedule the first conversation once the candidate is shortlisted.
                  </p>
                </div>
              )}
            </HrDetailSection>
            <HrDetailSection title="Assessments & checks">
              {workspace.assessments.map((item) => (
                <article key={item.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap justify-between gap-2">
                    <span className="text-sm font-semibold">{item.title}</span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="outline">{item.mandatory ? "Required" : "Optional"}</Badge>
                      <HrStatusPill status={item.status} label={label(item.status)} />
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{item.reason}</p>
                  {canUpdate && editable && item.status === "pending" ? (
                    <HrRecordDrawer
                      title="Record assessment outcome"
                      triggerLabel="Record assessment outcome"
                      completionKey={notice}
                      busy={busy}
                      error={error}
                      notice={notice}
                    >
                      <AssessmentDecision scope={scope} assessment={item} busy={busy} run={run} />
                    </HrRecordDrawer>
                  ) : null}
                </article>
              ))}
              {!workspace.assessments.length ? (
                <p className="text-sm text-muted-foreground">No assessments recorded for this application.</p>
              ) : null}
              {canUpdate && editable ? (
                <HrRecordDrawer
                  title="Add assessment"
                  triggerLabel="Add assessment"
                  completionKey={notice}
                  busy={busy}
                  error={error}
                  notice={notice}
                >
                  <form
                    className="grid gap-5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      if (
                        await run({
                          ...scope,
                          action: "assessment_add",
                          title: assessmentTitle,
                          mandatory,
                          reason: assessmentReason,
                        })
                      ) {
                        setAssessmentTitle("");
                        setAssessmentReason("");
                      }
                    }}
                  >
                    <HrDetailSection title="Assessment">
                      <label className="grid content-start gap-1.5 text-sm">
                        Assessment title
                        <Input
                          required
                          maxLength={160}
                          value={assessmentTitle}
                          onChange={(e) => setAssessmentTitle(e.target.value)}
                          placeholder="Technical test, reference check…"
                        />
                      </label>
                      <label className="flex items-center gap-2 text-sm">
                        <Checkbox checked={mandatory} onCheckedChange={(value) => setMandatory(!!value)} />
                        Required before selection
                      </label>
                      <label className="grid content-start gap-1.5 text-sm">
                        Assessment instructions
                        <Textarea
                          maxLength={1000}
                          value={assessmentReason}
                          onChange={(e) => setAssessmentReason(e.target.value)}
                        />
                      </label>
                    </HrDetailSection>
                    <Button
                      type="submit"
                      variant="outline"
                      disabled={busy || !assessmentTitle.trim()}
                    >
                      <Plus className="size-4" />
                      Add assessment
                    </Button>
                  </form>
                </HrRecordDrawer>
              ) : null}
            </HrDetailSection>
            <HrDetailSection title="Selection readiness">
              <p className="text-sm text-muted-foreground">
                {workspace.readiness.policy_version} · {workspace.readiness.threshold}% threshold · all required panel
                evaluations
              </p>
              {workspace.readiness.ready ? (
                <div className="flex flex-wrap gap-2 rounded-lg bg-primary/10 p-3 text-sm">
                  <CheckCircle2 className="size-5 shrink-0 text-primary" />
                  Interview evidence meets the selection requirements.
                </div>
              ) : (
                <ul className="grid gap-2 text-sm text-muted-foreground">
                  {workspace.readiness.blockers.map((blocker) => (
                    <li key={blocker}>{blocker}</li>
                  ))}
                </ul>
              )}
              {canSelect && workspace.application.stage === "evaluation" ? (
                <HrRecordDrawer
                  title="Confirm candidate selection"
                  triggerLabel="Confirm candidate selection"
                  completionKey={notice}
                  busy={busy}
                  error={error}
                  notice={notice}
                >
                  <form
                    className="grid gap-5"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      await run({ ...scope, action: "select", reason: decisionReason });
                    }}
                  >
                    <HrDetailSummary
                      code={workspace.application.reference}
                      status={workspace.application.stage}
                      statusLabel={label(workspace.application.stage)}
                    >
                      {workspace.application.candidate_name} · {workspace.application.opening_title}
                    </HrDetailSummary>
                    <HrDetailSection title="Decision">
                      <label className="grid content-start gap-1.5 text-sm">
                        Selection reason
                        <Textarea
                          maxLength={1000}
                          value={decisionReason}
                          onChange={(e) => setDecisionReason(e.target.value)}
                        />
                      </label>
                    </HrDetailSection>
                    <Button
                      type="submit"
                      className="text-primary-foreground!"
                      disabled={busy || !workspace.readiness.ready}
                    >
                      Confirm selection
                    </Button>
                  </form>
                </HrRecordDrawer>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Selection requires the Evaluation stage and HR approval permission. Hiring follows the accepted-offer
                  workflow.
                </p>
              )}
              <a
                href="#/hr/recruitment-pipeline"
                className="text-sm font-medium text-primary underline underline-offset-4"
              >
                Open application pipeline
              </a>
            </HrDetailSection>
            <HrDetailSection title="Evidence activity">
              <div className="grid min-w-0 gap-4">
                {workspace.history.length ? (
                  workspace.history
                    .slice()
                    .reverse()
                    .map((item) => (
                      <div key={item.id} className="border-l-2 border-primary/25 pl-3">
                        <span className="text-sm font-medium">{actionLabels[item.action] ?? label(item.action)}</span>
                        <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                          {item.reason}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          By {actorName(item.actor_id)} · {time(item.occurred_at)}
                        </p>
                      </div>
                    ))
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Interview activity appears here as evidence is recorded.
                  </p>
                )}
              </div>
            </HrDetailSection>
          </div>
        )}
      </HrMasterSheet>
    </section>
  );
}
