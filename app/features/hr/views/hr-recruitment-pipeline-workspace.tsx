"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hrApplicationTransitions, type HrApplicationDirectory, type HrApplicationStage } from "@nexora/contracts";
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarDays,
  CircleDot,
  History,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";

type Application = HrApplicationDirectory["items"][number];
const labels: Record<HrApplicationStage, string> = {
  application: "Applied",
  screening: "Screening",
  shortlisted: "Shortlisted",
  interview: "Interview",
  evaluation: "Evaluation",
  selected: "Selected",
  hired: "Hired",
  rejected: "Rejected",
  withdrawn: "Withdrawn",
};
const stages = Object.keys(labels) as HrApplicationStage[];
const activeStages = stages.slice(0, 5);
const selectStyle =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const failure = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

function StageBadge({ stage }: { stage: HrApplicationStage }) {
  return (
    <Badge
      variant={stage === "rejected" ? "destructive" : "secondary"}
      className={stage === "interview" || stage === "evaluation" ? "border-primary/20 bg-primary/10 text-primary" : ""}
    >
      {labels[stage]}
    </Badge>
  );
}

export function HrRecruitmentPipelineWorkspace() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canUpdate = permissions.includes("hr.employee.update");
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [data, setData] = useState<HrApplicationDirectory>({ items: [], total: 0 });
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [search, setSearch] = useState(""),
    [stageFilter, setStageFilter] = useState("");
  const [filter, setFilter] = useState({ search: "", stage: "", offset: 0 });
  const [selectedId, setSelectedId] = useState(""),
    [nextStage, setNextStage] = useState<HrApplicationStage | "">("");
  const [reason, setReason] = useState("");
  const [editor, setEditor] = useState(false);
  const [candidateId, setCandidateId] = useState(""),
    [openingId, setOpeningId] = useState("");
  const [candidateSearch, setCandidateSearch] = useState(""),
    [openingSearch, setOpeningSearch] = useState("");
  const [lookup, setLookup] = useState({ candidates: "", openings: "" });
  const [optionsLoading, setOptionsLoading] = useState(false);
  const [candidates, setCandidates] = useState<Awaited<ReturnType<HrApiClient["candidates"]>>["items"]>([]);
  const [openings, setOpenings] = useState<Awaited<ReturnType<HrApiClient["jobOpenings"]>>["items"]>([]);
  const requestSequence = useRef(0);

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
          setError(failure(err, "Companies could not be loaded."));
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [client, sessionLoading, canRead]);

  const load = useCallback(async () => {
    if (!companyId || !canRead) return;
    const sequence = ++requestSequence.current;
    setLoading(true);
    setError("");
    try {
      const result = await client.applications({
        companyId,
        search: filter.search,
        stage: filter.stage || undefined,
        offset: filter.offset,
        limit: 50,
      });
      if (sequence !== requestSequence.current) return;
      setData(result);
      setSelectedId((current) =>
        result.items.some((item) => item.id === current) ? current : (result.items[0]?.id ?? ""),
      );
    } catch (err) {
      if (sequence === requestSequence.current) {
        setError(failure(err, "The recruitment pipeline could not be loaded."));
        setData({ items: [], total: 0 });
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [client, companyId, canRead, filter]);
  useEffect(() => {
    void load();
    return () => {
      requestSequence.current += 1;
    };
  }, [load]);
  useEffect(() => {
    setNextStage("");
    setReason("");
  }, [selectedId, data]);

  useEffect(() => {
    if (!editor || !companyId) return;
    let cancelled = false;
    setOptionsLoading(true);
    setCandidates([]);
    setOpenings([]);
    setCandidateId("");
    setOpeningId("");
    Promise.all([
      client.candidates({ companyId, status: "active", search: lookup.candidates, limit: 100 }),
      client.jobOpenings({ companyId, state: "open", search: lookup.openings, limit: 100 }),
    ])
      .then(([people, jobs]) => {
        if (!cancelled) {
          setCandidates(people.items);
          setOpenings(
            jobs.items.filter((item) => !item.closing_on || item.closing_on >= new Date().toISOString().slice(0, 10)),
          );
        }
      })
      .catch((err) => {
        if (!cancelled) setError(failure(err, "Candidate and opening options could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setOptionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, editor, companyId, lookup]);

  const selected = data.items.find((item) => item.id === selectedId);
  const allowed = selected ? hrApplicationTransitions[selected.stage] : [];
  async function create(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !candidateId || !openingId) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await client.createApplication(
        { company_id: companyId, candidate_id: candidateId, opening_id: openingId },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${result.reference} created. The application is ready for screening.`);
      setEditor(false);
      setSelectedId(result.id);
      setSearch("");
      setStageFilter("");
      setFilter({ search: "", stage: "", offset: 0 });
    } catch (err) {
      setError(failure(err, "The application could not be saved. Please retry."));
    } finally {
      setSaving(false);
    }
  }
  async function move(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !nextStage || !reason.trim() || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await client.changeApplicationStage(
        selected.id,
        { company_id: companyId, expected_stage: selected.stage, stage: nextStage, reason: reason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${selected.reference} moved to ${labels[nextStage]}.`);
      await load();
    } catch (err) {
      setError(failure(err, "The stage could not be changed. Refresh and try again."));
    } finally {
      setSaving(false);
    }
  }
  const card = (item: Application) => (
    <button
      type="button"
      key={item.id}
      aria-pressed={selectedId === item.id}
      onClick={() => setSelectedId(item.id)}
      className={`grid w-full gap-3 rounded-xl border bg-card p-4 text-left shadow-xs transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selectedId === item.id ? "border-primary ring-1 ring-primary/30" : "border-border"}`}
    >
      <div className="flex items-center gap-3">
        <span
          className="grid size-9 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-semibold text-primary"
          aria-hidden="true"
        >
          {item.candidate_name
            .split(" ")
            .map((part) => part[0])
            .slice(0, 2)
            .join("")}
        </span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-foreground">{item.candidate_name}</span>
          <span className="block truncate text-xs text-muted-foreground">{item.reference}</span>
        </span>
      </div>
      <p className="flex gap-2 text-sm text-muted-foreground">
        <BriefcaseBusiness className="mt-0.5 size-4 shrink-0" />
        <span className="line-clamp-2">{item.opening_title}</span>
      </p>
      <div className="flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>{date(item.created_at)}</span>
        <ArrowRight className="size-4 text-primary" />
      </div>
    </button>
  );

  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session || !canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>Sign in with permission to read HR employees to access the pipeline.</AlertDescription>
      </Alert>
    );
  return (
    <section
      aria-label="Live recruitment pipeline"
      className="grid min-w-0 gap-5 font-sans text-foreground [&_p]:mb-0 [&_h2]:mb-0 [&_h3]:mb-0 [&_h4]:mb-0 [&_ol]:m-0 [&_ol]:list-none [&_ol]:p-0"
    >
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-5 sm:p-6">
        <div>
          <Badge variant="outline" className="border-primary/30 bg-card text-primary">
            Recruitment workspace
          </Badge>
          <h2 className="mt-3 text-xl font-semibold tracking-tight">A clear path from application to evaluation</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Review candidates for each opening, record decisions, and keep the application history together.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || saving || !companyId}
            onClick={() => void load()}
            aria-label="Refresh pipeline"
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
          {canCreate ? (
            <Button
              className="text-primary-foreground!"
              disabled={!companyId || saving}
              onClick={() => {
                setEditor(true);
                setError("");
              }}
            >
              <Plus className="size-4" />
              Add application
            </Button>
          ) : null}
        </div>
      </div>
      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <div role="status" className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
          {notice}
        </div>
      ) : null}
      <form
        className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1.2fr_.7fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ search, stage: stageFilter, offset: 0 });
        }}
      >
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Company
          <select
            value={companyId}
            disabled={saving}
            className={selectStyle}
            onChange={(event) => {
              requestSequence.current += 1;
              setCompanyId(event.target.value);
              setData({ items: [], total: 0 });
              setSelectedId("");
              setEditor(false);
              setNotice("");
              setError("");
              setFilter((current) => ({ ...current, offset: 0 }));
            }}
          >
            {companies.length === 0 ? (
              <option value="">No authorized companies</option>
            ) : (
              companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))
            )}
          </select>
        </label>
        <label className="grid min-w-0 gap-1.5 text-sm font-medium">
          Search applications
          <Input
            placeholder="Candidate, reference or job title"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-medium">
          Stage
          <select className={selectStyle} value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
            <option value="">All stages</option>
            {stages.map((stage) => (
              <option key={stage} value={stage}>
                {labels[stage]}
              </option>
            ))}
          </select>
        </label>
        <Button variant="outline" type="submit" disabled={saving || !companyId}>
          <Search className="size-4" />
          Apply filters
        </Button>
      </form>
      {editor ? (
        <form onSubmit={create} className="grid gap-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">New application</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Choose an active candidate and an open vacancy in this company.
              </p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              disabled={saving}
              aria-label="Close application form"
              onClick={() => setEditor(false)}
            >
              <X className="size-4" />
            </Button>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <div className="grid gap-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Find candidate
                <Input
                  value={candidateSearch}
                  placeholder="Search name or email"
                  onChange={(event) => setCandidateSearch(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Candidate
                <select
                  required
                  disabled={optionsLoading || saving}
                  className={selectStyle}
                  value={candidateId}
                  onChange={(event) => setCandidateId(event.target.value)}
                >
                  <option value="">Select a candidate</option>
                  {candidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.display_name} — {item.email}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="grid gap-2">
              <label className="grid gap-1.5 text-sm font-medium">
                Find opening
                <Input
                  value={openingSearch}
                  placeholder="Search opening title"
                  onChange={(event) => setOpeningSearch(event.target.value)}
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Job opening
                <select
                  required
                  disabled={optionsLoading || saving}
                  className={selectStyle}
                  value={openingId}
                  onChange={(event) => setOpeningId(event.target.value)}
                >
                  <option value="">Select an opening</option>
                  {openings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title} — {item.reference}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={optionsLoading || saving}
              onClick={() => setLookup({ candidates: candidateSearch, openings: openingSearch })}
            >
              Find matching options
            </Button>
            <p className="text-xs text-muted-foreground">Up to 100 matches per list. Refine your search if needed.</p>
          </div>
          {!optionsLoading && (!candidates.length || !openings.length) ? (
            <Alert>
              <AlertTitle>Recruitment setup required</AlertTitle>
              <AlertDescription>
                No matching {candidates.length ? "open job openings" : "active candidates"}. Create the missing record
                in Candidate Directory or Job Openings, then retry.
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="flex gap-2">
            <Button
              className="text-primary-foreground!"
              type="submit"
              disabled={saving || optionsLoading || !candidateId || !openingId}
            >
              {saving ? "Saving…" : "Create application"}
            </Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => setEditor(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold">Application board</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {data.total} matching applications · Showing {data.items.length ? filter.offset + 1 : 0}–
            {filter.offset + data.items.length}. Counts below cover this page.
          </p>
        </div>
        <Badge variant="outline">
          <Users className="size-3" />
          {data.items.filter((item) => activeStages.includes(item.stage)).length} in progress on this page
        </Badge>
      </div>
      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : data.items.length === 0 ? (
        <div className="grid justify-items-center gap-3 rounded-2xl border border-dashed border-border bg-card px-5 py-14 text-center">
          <span className="rounded-2xl bg-primary/10 p-4 text-primary">
            <BriefcaseBusiness className="size-7" />
          </span>
          <h3 className="text-lg font-semibold">No applications to display</h3>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">
            Add an application to an open vacancy, or adjust your company and stage filters to find an existing record.
          </p>
          {canCreate ? (
            <Button variant="outline" disabled={!companyId} onClick={() => setEditor(true)}>
              <Plus className="size-4" />
              Add application
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 items-start gap-5 2xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="min-w-0">
            <div className="flex gap-3 overflow-x-auto pb-4" aria-label="Application stages" tabIndex={0}>
              {(filter.stage ? [filter.stage as HrApplicationStage] : activeStages).map((stage) => (
                <div key={stage} className="min-w-60 flex-1 rounded-xl border border-border bg-muted/35 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      <CircleDot className="size-3.5 text-primary" />
                      {labels[stage]}
                    </span>
                    <Badge variant="outline" className="bg-card">
                      {data.items.filter((item) => item.stage === stage).length}
                    </Badge>
                  </div>
                  <div className="grid gap-3">
                    {data.items.filter((item) => item.stage === stage).map(card)}
                    {data.items.every((item) => item.stage !== stage) ? (
                      <p className="rounded-lg border border-dashed border-border p-5 text-center text-xs text-muted-foreground">
                        No applications at this stage
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
            {!filter.stage && data.items.some((item) => !activeStages.includes(item.stage)) ? (
              <div className="mt-3 rounded-xl border border-border bg-card p-4">
                <h4 className="mb-3 text-sm font-semibold">Other stages and outcomes</h4>
                <div className="grid gap-3 sm:grid-cols-2">
                  {data.items
                    .filter((item) => !activeStages.includes(item.stage))
                    .map((item) => (
                      <div key={item.id} className="grid gap-2">
                        <StageBadge stage={item.stage} />
                        {card(item)}
                      </div>
                    ))}
                </div>
              </div>
            ) : null}
          </div>
          {selected ? (
            <aside
              className="grid gap-5 rounded-2xl border border-border bg-card p-5 shadow-sm"
              aria-label="Application details"
            >
              <div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-muted-foreground">{selected.reference}</span>
                  <StageBadge stage={selected.stage} />
                </div>
                <h3 className="mt-3 text-lg font-semibold">{selected.candidate_name}</h3>
                <p className="mt-1 break-all text-sm text-muted-foreground">{selected.candidate_email}</p>
              </div>
              <div className="rounded-xl bg-muted/50 p-3">
                <p className="text-sm font-medium">{selected.opening_title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{selected.opening_reference}</p>
                <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-3.5" />
                  Applied {date(selected.created_at)}
                </p>
              </div>
              {selected.stage === "evaluation" ? (
                <Alert>
                  <AlertTitle>Interview evidence required</AlertTitle>
                  <AlertDescription>
                    Open Interviews & Evaluations to review panel scorecards, assessment outcomes and the selection readiness check.
                  </AlertDescription>
                </Alert>
              ) : null}
              {canUpdate && allowed.length ? (
                <form className="grid gap-3 border-t border-border pt-4" onSubmit={move}>
                  <h4 className="text-sm font-semibold">Record a stage decision</h4>
                  <label className="grid gap-1.5 text-sm">
                    Next stage
                    <select
                      className={selectStyle}
                      required
                      disabled={saving}
                      value={nextStage}
                      onChange={(event) => setNextStage(event.target.value as HrApplicationStage)}
                    >
                      <option value="">Choose next stage</option>
                      {allowed.map((stage) => (
                        <option key={stage} value={stage}>
                          {labels[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Decision reason
                    <Textarea
                      required
                      maxLength={1000}
                      value={reason}
                      disabled={saving}
                      placeholder="Record the screening outcome or decision context"
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <Button
                    className="text-primary-foreground!"
                    type="submit"
                    disabled={saving || !nextStage || !reason.trim()}
                  >
                    {saving ? "Saving decision…" : "Save stage decision"}
                    <ArrowRight className="size-4" />
                  </Button>
                </form>
              ) : null}
              <div className="border-t border-border pt-4">
                <h4 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                  <History className="size-4 text-primary" />
                  Application history
                </h4>
                <ol className="grid gap-4">
                  {selected.history.map((event) => (
                    <li key={event.id} className="border-l-2 border-primary/25 pl-3">
                      <p className="text-sm font-medium">
                        {event.from_stage ? `${labels[event.from_stage]} → ` : ""}
                        {labels[event.to_stage]}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                        {event.reason}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{date(event.occurred_at)}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </aside>
          ) : null}
        </div>
      )}
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={loading || saving || filter.offset === 0}
          onClick={() => setFilter((current) => ({ ...current, offset: Math.max(0, current.offset - 50) }))}
        >
          Previous
        </Button>
        <Button
          variant="outline"
          size="sm"
          disabled={loading || saving || filter.offset + 50 >= data.total}
          onClick={() => setFilter((current) => ({ ...current, offset: current.offset + 50 }))}
        >
          Next
        </Button>
      </div>
    </section>
  );
}
