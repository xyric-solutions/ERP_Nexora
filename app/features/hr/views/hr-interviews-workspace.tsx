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
import {
  CalendarDays,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  Plus,
  ShieldCheck,
  Users,
  X,
} from "lucide-react";
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
  busy,
  run,
  close,
  interview,
}: {
  scope: Scope;
  panel: HrInterviewPanelDirectory["items"];
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
      <div className="grid gap-3 sm:grid-cols-2">
        {!interview ? (
          <label className="grid gap-1.5 text-sm">
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
        <label className="grid gap-1.5 text-sm">
          Start date and time
          <Input required type="datetime-local" value={starts} onChange={(e) => setStarts(e.target.value)} />
        </label>
        <label className="grid gap-1.5 text-sm">
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
        <label className="grid gap-1.5 text-sm">
          Interview mode
          <select className={selectClass} value={mode} onChange={(e) => setMode(e.target.value as typeof mode)}>
            {["video", "on_site", "telephone"].map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm sm:col-span-2">
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
      {!interview ? (
        <fieldset className="m-0 min-w-0 rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-medium">Panel members · choose 2–8</legend>
          <p className="mb-3 text-xs text-muted-foreground">
            Each member signs in to submit their own evaluation. Accounts must have this company’s access and HR update
            permission.
          </p>
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
              No matching eligible panel accounts. Refine the panel search or check company access.
            </p>
          ) : null}
        </fieldset>
      ) : (
        <label className="grid gap-1.5 text-sm">
          Reason for rescheduling
          <Textarea required maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
        </label>
      )}
      <HrDrawerActions>
        <Button
          type="submit"
          className="text-primary-foreground!"
          disabled={busy || (!interview && members.length < 2)}
        >
          {busy ? "Saving…" : interview ? "Save new schedule" : "Schedule interview"}
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={close}>
          Cancel
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
    <form onSubmit={submit} className="grid min-w-0 gap-4 border-t border-border pt-4">
      <div>
        <h4 className="m-0 font-semibold">Your panel scorecard</h4>
        <p className="mt-1 text-sm text-muted-foreground">
          Rate each criterion from 1 to 5. Submitted scorecards are final and retained as evidence.
        </p>
      </div>
      {interview.template.map((criterion) => (
        <label
          key={criterion.id}
          className="grid grid-cols-[1fr_110px] items-center gap-3 rounded-lg bg-muted/40 p-3 text-sm"
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
      <label className="grid gap-1.5 text-sm">
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
      <label className="grid gap-1.5 text-sm">
        Strengths
        <Textarea required maxLength={2000} value={strengths} onChange={(e) => setStrengths(e.target.value)} />
      </label>
      <label className="grid gap-1.5 text-sm">
        Concerns (enter “None” if appropriate)
        <Textarea required maxLength={2000} value={concerns} onChange={(e) => setConcerns(e.target.value)} />
      </label>
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
      className="grid gap-3 rounded-lg bg-muted/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (await run({ ...scope, action, interview_id: interview.id, expected_version: interview.version, reason }))
          setReason("");
      }}
    >
      <label className="grid gap-1.5 text-sm">
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
      <label className="grid gap-1.5 text-sm">
        Outcome reason
        <Textarea
          required
          maxLength={1000}
          value={reason}
          disabled={busy}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button type="submit" variant="outline" disabled={busy || !reason.trim()}>
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
      className="mt-3 grid gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await run({ ...scope, action: "assessment_decide", assessment_id: assessment.id, outcome, reason });
      }}
    >
      <label className="grid gap-1 text-sm">
        Assessment outcome
        <select className={selectClass} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="passed">Passed</option>
          <option value="failed">Failed</option>
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        Decision evidence
        <Textarea
          required
          maxLength={1000}
          value={reason}
          placeholder="Record findings and supporting reference"
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <Button type="submit" variant="outline" disabled={busy || !reason.trim()}>
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
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]),
    [companyId, setCompanyId] = useState("");
  const [apps, setApps] = useState<HrApplicationDirectory>({ items: [], total: 0 }),
    [applicationId, setApplicationId] = useState("");
  const [search, setSearch] = useState(""),
    [query, setQuery] = useState({ search: "", offset: 0 });
  const [workspace, setWorkspace] = useState<HrInterviewWorkspace | null>(null),
    [selectedId, setSelectedId] = useState("");
  const [panel, setPanel] = useState<HrInterviewPanelDirectory["items"]>([]),
    [panelSearch, setPanelSearch] = useState(""),
    [panelQuery, setPanelQuery] = useState("");
  const [editor, setEditor] = useState<"schedule" | "reschedule" | null>(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [assessmentTitle, setAssessmentTitle] = useState(""),
    [mandatory, setMandatory] = useState(true),
    [assessmentReason, setAssessmentReason] = useState("");
  const [decisionReason, setDecisionReason] = useState("");
  const sequence = useRef(0);
  useEffect(() => {
    if (sessionLoading || !canRead) return;
    let cancelled = false;
    client
      .companies()
      .then((result) => {
        if (!cancelled) {
          setCompanies(result.items);
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
  // Applications grouped per candidate, so each person's interviews and evidence read together.
  const candidateGroups = apps.items.reduce<
    Array<{ id: string; name: string; email: string; applications: HrApplicationDirectory["items"] }>
  >((groups, item) => {
    const group = groups.find((entry) => entry.id === item.candidate_id);
    if (group) group.applications.push(item);
    else groups.push({ id: item.candidate_id, name: item.candidate_name, email: item.candidate_email, applications: [item] });
    return groups;
  }, []);
  const chosen = apps.items.find((item) => item.id === applicationId);
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
            <Badge variant={item.status === "completed" ? "secondary" : "outline"}>{label(item.status)}</Badge>
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
            {item.status === "completed" &&
            item.panel.some((person) => person.user_id === session.user.id) &&
            !mine ? (
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
      <form
        className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[minmax(12rem,1fr)_minmax(14rem,1.4fr)_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          setQuery({ search, offset: 0 });
        }}
      >
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Company
          <select
            className={selectClass}
            disabled={busy}
            value={companyId}
            onChange={(e) => {
              sequence.current += 1;
              setCompanyId(e.target.value);
              setApplicationId("");
              setWorkspace(null);
              setNotice("");
              setError("");
              setEditor(null);
              setQuery({ search: "", offset: 0 });
              setSearch("");
            }}
          >
            {!companies.length ? (
              <option value="">No authorized company</option>
            ) : (
              companies.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Find candidate
          <Input
            type="search"
            value={search}
            maxLength={160}
            placeholder="Candidate, reference or role, then Enter"
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <Button type="submit" variant="outline" disabled={busy}>
          Search
        </Button>
      </form>
      <div className="grid min-w-0 items-start gap-5 lg:grid-cols-[minmax(240px,320px)_minmax(0,1fr)]">
        <aside className="grid min-w-0 gap-3 rounded-xl border border-border bg-card p-3" aria-label="Candidates">
          <div className="flex items-center justify-between gap-2 px-1">
            <h3 className="m-0 text-sm font-semibold">Candidates</h3>
            <Badge variant="outline" className="tabular-nums">
              {candidateGroups.length}
            </Badge>
          </div>
          {candidateGroups.length ? (
            <ul className="m-0! grid max-h-[70vh] list-none gap-2 overflow-y-auto p-0! pr-1">
              {candidateGroups.map((group) => (
                <li key={group.id} className="grid gap-1.5 rounded-lg border border-border p-2">
                  <span className="min-w-0 px-1">
                    <span className="block truncate text-sm font-semibold">{group.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">{group.email}</span>
                  </span>
                  {group.applications.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      disabled={busy}
                      aria-pressed={item.id === applicationId}
                      onClick={() => {
                        setApplicationId(item.id);
                        setNotice("");
                        setError("");
                      }}
                      className={`grid w-full min-w-0 gap-1 rounded-md border px-2.5 py-2 text-left text-xs transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 ${item.id === applicationId ? "border-primary bg-primary/10" : "border-transparent bg-muted/40 hover:border-primary/40"}`}
                    >
                      <span className="line-clamp-2 break-words font-medium text-foreground">{item.opening_title}</span>
                      <span className="flex flex-wrap items-center justify-between gap-1 text-muted-foreground">
                        <span className="truncate">{item.reference}</span>
                        <Badge
                          variant={item.stage === "rejected" ? "destructive" : "secondary"}
                          className="px-1.5 py-0 text-[10px]"
                        >
                          {label(item.stage)}
                        </Badge>
                      </span>
                    </button>
                  ))}
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-1 py-6 text-center text-sm text-muted-foreground">
              No matching candidates. Applications created in Recruitment Pipeline appear here.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-1 pt-2">
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
        </aside>
        {loading && !workspace ? (
          <Skeleton className="h-96 w-full" />
        ) : !workspace ? (
          <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <CalendarDays className="size-9 text-primary" />
            <h3 className="m-0 text-lg font-semibold">No candidate selected</h3>
            <p className="max-w-lg text-sm text-muted-foreground">
              Create an application in Recruitment Pipeline, progress it through screening, and shortlist the
              candidate to begin interview scheduling.
            </p>
            <a className="text-sm font-medium text-primary underline underline-offset-4" href="#/hr/recruitment-pipeline">
              Open Recruitment Pipeline
            </a>
          </div>
        ) : (
          <div className="grid min-w-0 gap-4" aria-label={`${workspace.application.candidate_name} interview record`}>
            <div className="grid gap-4 rounded-xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Candidate</p>
                  <h3 className="mt-1 text-xl font-semibold">{workspace.application.candidate_name}</h3>
                  <p className="mt-1 break-words text-sm text-muted-foreground">
                    {workspace.application.opening_title}
                    {chosen ? ` · ${chosen.reference} · ${chosen.candidate_email}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{label(workspace.application.stage)}</Badge>
                  {canUpdate && scheduleAllowed ? (
                    <Button className="text-primary-foreground!" disabled={busy} onClick={() => setEditor("schedule")}>
                      <Plus className="size-4" />
                      Schedule interview
                    </Button>
                  ) : null}
                </div>
              </div>
              <dl className="m-0 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-lg bg-muted/40 p-3">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarDays className="size-4" />
                    Interview rounds
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">{workspace.interviews.length}</dd>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Users className="size-4" />
                    Evaluators
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {workspace.readiness.evaluators}
                    <span className="ml-1 text-sm font-normal text-muted-foreground">
                      / {workspace.readiness.minimum_evaluators} minimum
                    </span>
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ClipboardCheck className="size-4" />
                    Weighted average
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {workspace.readiness.average_score === null ? "Pending" : `${workspace.readiness.average_score}%`}
                  </dd>
                </div>
                <div className="rounded-lg bg-muted/40 p-3">
                  <dt className="flex items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-4" />
                    Selection readiness
                  </dt>
                  <dd className="mt-1 text-xl font-semibold">
                    {workspace.readiness.ready ? "Ready" : `${workspace.readiness.blockers.length} open`}
                  </dd>
                </div>
              </dl>
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
                  <form
                    className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-card p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      setPanelQuery(panelSearch);
                    }}
                  >
                    <label className="grid flex-1 gap-1 text-sm">
                      Find panel account
                      <Input
                        value={panelSearch}
                        maxLength={160}
                        placeholder="Name or email"
                        onChange={(e) => setPanelSearch(e.target.value)}
                      />
                    </label>
                    <Button type="submit" variant="outline" disabled={busy}>
                      Find panel
                    </Button>
                    <span className="w-full text-xs text-muted-foreground">
                      Up to 100 company-authorized accounts. Refine the search if needed.
                    </span>
                  </form>
                  <ScheduleForm
                    key={`${applicationId}-${editor}-${selectedId}`}
                    scope={scope}
                    panel={panel}
                    busy={busy}
                    run={run}
                    close={() => setEditor(null)}
                    interview={editor === "reschedule" ? selected : undefined}
                  />
                </>
              ) : null}
            </HrRecordDrawer>
            <section className="grid min-w-0 gap-3" aria-label="Interview rounds">
              <h4 className="m-0 font-semibold">Interviews & evaluations</h4>
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
            </section>
            <div className="grid min-w-0 items-start gap-4 xl:grid-cols-2">
              <section className="grid gap-3 rounded-xl border border-border bg-card p-5" aria-label="Assessments">
                <h4 className="m-0 font-semibold">Assessments & checks</h4>
                <p className="text-sm text-muted-foreground">
                  Mandatory assessments must pass before selection. Final decisions and panel scorecards cannot be
                  edited.
                </p>
                {workspace.assessments.map((item) => (
                  <article key={item.id} className="rounded-lg border border-border p-3">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="text-sm font-semibold">{item.title}</span>
                      <Badge variant={item.status === "failed" ? "destructive" : "outline"}>
                        {item.mandatory ? "Required" : "Optional"} · {label(item.status)}
                      </Badge>
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
                      className="grid gap-3 rounded-lg bg-muted/40 p-3"
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
                      <label className="grid gap-1.5 text-sm">
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
                      <label className="grid gap-1.5 text-sm">
                        Assessment instructions
                        <Textarea
                          required
                          maxLength={1000}
                          value={assessmentReason}
                          onChange={(e) => setAssessmentReason(e.target.value)}
                        />
                      </label>
                      <Button
                        type="submit"
                        variant="outline"
                        disabled={busy || !assessmentTitle.trim() || !assessmentReason.trim()}
                      >
                        <Plus className="size-4" />
                        Add assessment
                      </Button>
                    </form>
                  </HrRecordDrawer>
                ) : null}
              </section>
              <section
                className="grid min-w-0 gap-4 rounded-xl border border-primary/20 bg-card p-5"
                aria-label="Selection readiness"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-5 text-primary" />
                  <h4 className="m-0 font-semibold">Selection readiness</h4>
                </div>
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
                      className="grid gap-3 border-t border-border pt-3"
                      onSubmit={async (e) => {
                        e.preventDefault();
                        await run({ ...scope, action: "select", reason: decisionReason });
                      }}
                    >
                      <label className="grid gap-1.5 text-sm">
                        Selection reason
                        <Textarea
                          required
                          maxLength={1000}
                          value={decisionReason}
                          onChange={(e) => setDecisionReason(e.target.value)}
                        />
                      </label>
                      <Button
                        type="submit"
                        className="text-primary-foreground!"
                        disabled={busy || !workspace.readiness.ready || !decisionReason.trim()}
                      >
                        Confirm selection
                      </Button>
                    </form>
                  </HrRecordDrawer>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Selection requires the Evaluation stage and HR approval permission. Hiring follows the
                    accepted-offer workflow.
                  </p>
                )}
                <a
                  href="#/hr/recruitment-pipeline"
                  className="text-sm font-medium text-primary underline underline-offset-4"
                >
                  Open application pipeline
                </a>
              </section>
            </div>
            <section className="rounded-xl border border-border bg-card p-5" aria-label="Evidence activity">
              <h4 className="m-0 font-semibold">Evidence activity</h4>
              <div className="mt-4 grid min-w-0 gap-4">
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
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
