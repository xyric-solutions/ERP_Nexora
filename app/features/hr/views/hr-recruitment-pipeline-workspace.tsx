"use client";
import { WorkOffsetPagination, WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrRecordCodeField } from "../components/hr-create-form";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { hrApplicationTransitions, type HrApplicationDirectory, type HrApplicationStage } from "@nexora/contracts";
import { Plus } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import { HrMasterSheet } from "../components/hr-master-sheet";
import {
  HrDetailAudit,
  HrDetailCode,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrEditButton } from "../components/hr-icon-buttons";

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
/** Stage filters shown on the pipeline (besides All); other stages still appear on rows and in stage changes. */
const filterStages: readonly HrApplicationStage[] = ["selected", "rejected", "withdrawn"];
const selectStyle =
  "h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 disabled:opacity-50";
const failure = (error: unknown, fallback: string) => (error instanceof ApiError ? error.message : fallback);
const candidateLabel = (item: { display_name: string; email: string }) => `${item.display_name} — ${item.email}`;
const openingLabel = (item: { title: string; reference: string; remaining_positions: number }) =>
  `${item.title} — ${item.reference} · ${item.remaining_positions} open`;
const date = (value: string) =>
  new Date(value).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

export function HrRecruitmentPipelineWorkspace() {
  const { api, session, loading: sessionLoading, csrfToken } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employee.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canUpdate = permissions.includes("hr.employee.update");
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
  const [stageEditing, setStageEditing] = useState(false);
  const [editor, setEditor] = useState(false);
  const [candidateId, setCandidateId] = useState(""),
    [openingId, setOpeningId] = useState("");
  const [candidatesLoading, setCandidatesLoading] = useState(false),
    [openingsLoading, setOpeningsLoading] = useState(false);
  const optionsLoading = candidatesLoading || openingsLoading;
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

  const [workPageSize, setWorkPageSize] = useState(25);
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
        limit: workPageSize,
      });
      if (sequence !== requestSequence.current) return;
      setData(result);
      setSelectedId((current) => (result.items.some((item) => item.id === current) ? current : ""));
    } catch (err) {
      if (sequence === requestSequence.current) {
        setError(failure(err, "The recruitment pipeline could not be loaded."));
        setData({ items: [], total: 0 });
      }
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [client, companyId, canRead, filter, workPageSize]);
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

  // Both dropdowns list live records of the selected company when the editor opens.
  useEffect(() => {
    if (!editor || !companyId) return;
    let cancelled = false;
    setCandidatesLoading(true);
    client
      .candidates({ companyId, status: "active", limit: 100 })
      .then((people) => {
        if (!cancelled) setCandidates(people.items);
      })
      .catch((err) => {
        if (!cancelled) setError(failure(err, "Candidate options could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setCandidatesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, editor, companyId]);

  useEffect(() => {
    if (!editor || !companyId) return;
    let cancelled = false;
    setOpeningsLoading(true);
    client
      .jobOpenings({ companyId, state: "open", limit: 100 })
      .then((jobs) => {
        if (!cancelled)
          setOpenings(
            jobs.items.filter(
              (item) =>
                item.remaining_positions > 0 &&
                (!item.closing_on || item.closing_on >= new Date().toISOString().slice(0, 10)),
            ),
          );
      })
      .catch((err) => {
        if (!cancelled) setError(failure(err, "Opening options could not be loaded."));
      })
      .finally(() => {
        if (!cancelled) setOpeningsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [client, editor, companyId]);

  const openEditor = () => {
    setCandidateId("");
    setOpeningId("");
    setCandidates([]);
    setOpenings([]);
    setError("");
    setEditor(true);
  };

  const selected = data.items.find((item) => item.id === selectedId);
  const allowed = selected ? hrApplicationTransitions[selected.stage] : [];
  const latestNote = selected?.history.at(-1)?.reason ? selected.history.at(-1) : undefined;
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
      setNotice(`${result.reference} created in ${labels[result.stage]}. Move it to Screening when ready.`);
      setEditor(false);
      setSearch("");
      setStageFilter("");
      // A fresh filter object reloads the board, which then shows the new application in its stage.
      setFilter({ search: "", stage: "", offset: 0 });
      setSelectedId(result.id);
    } catch (err) {
      setError(failure(err, "The application could not be saved. Please retry."));
    } finally {
      setSaving(false);
    }
  }
  async function move(event: React.FormEvent) {
    event.preventDefault();
    if (!selected || !nextStage || saving) return;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      await client.changeApplicationStage(
        selected.id,
        {
          company_id: companyId,
          expected_stage: selected.stage,
          stage: nextStage,
          reason: reason.trim() || `Moved to ${labels[nextStage]}.`,
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${selected.reference} moved to ${labels[nextStage]}.`);
      setStageEditing(false);
      await load();
    } catch (err) {
      setError(failure(err, "The stage could not be changed. Refresh and try again."));
    } finally {
      setSaving(false);
    }
  }

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
      {error && !selected ? (
        <Alert variant="destructive" role="alert">
          <AlertTitle>Action needs attention</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice && !selected ? (
        <div role="status" className="rounded-xl border border-primary/25 bg-primary/5 p-4 text-sm">
          {notice}
        </div>
      ) : null}
      {!loading && !error && !companyId ? (
        <Alert>
          <AlertTitle>No authorized company</AlertTitle>
          <AlertDescription>Ask your administrator to review company access.</AlertDescription>
        </Alert>
      ) : null}
      <WorkForm
        className="grid items-end gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[1.2fr_.7fr_auto]"
        onSubmit={(event) => {
          event.preventDefault();
          setFilter({ search, stage: stageFilter, offset: 0 });
        }}
      >
        <label className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
          Search applications
          <Input
            type="search"
            placeholder="Candidate, reference or job title, then Enter"
            maxLength={160}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <label className="grid content-start gap-1.5 text-sm font-medium">
          Stage
          <select
            className={selectStyle}
            value={stageFilter}
            disabled={saving || !companyId}
            onChange={(event) => {
              setStageFilter(event.target.value);
              setFilter({ search, stage: event.target.value, offset: 0 });
            }}
          >
            <option value="">All</option>
            {filterStages.map((stage) => (
              <option key={stage} value={stage}>
                {labels[stage]}
              </option>
            ))}
          </select>
        </label>
        {canCreate ? (
          <Button
            type="button"
            className="text-primary-foreground!"
            disabled={!companyId || saving}
            onClick={openEditor}
          >
            <Plus className="size-4" />
            Add application
          </Button>
        ) : null}
      </WorkForm>
      {editor ? (
        <HrRecordDrawer
          title="Add application"
          open={editor}
          onClose={() => setEditor(false)}
          busy={saving}
          error={error}
          notice={notice}
          description="Choose an active candidate and an open vacancy in this company."
        >
          <WorkForm
            onSubmit={create}
            className="grid min-w-0 gap-4 rounded-2xl border border-primary/30 bg-card p-5 shadow-sm"
          >
            <HrDetailSection title="Application">
              <HrRecordCodeField kind="application" companyId={companyId || undefined} value={null} />
              <label className="grid content-start gap-1.5 text-sm font-medium">
                Candidate
                <select
                  required
                  className={selectStyle}
                  disabled={saving || candidatesLoading}
                  value={candidateId}
                  onChange={(event) => setCandidateId(event.target.value)}
                >
                  <option value="">
                    {candidatesLoading
                      ? "Loading candidates…"
                      : candidates.length
                        ? "Select a candidate"
                        : "No active candidates"}
                  </option>
                  {candidates.map((item) => (
                    <option key={item.id} value={item.id}>
                      {candidateLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid content-start gap-1.5 text-sm font-medium">
                Opening title
                <select
                  required
                  className={selectStyle}
                  disabled={saving || openingsLoading}
                  value={openingId}
                  onChange={(event) => setOpeningId(event.target.value)}
                >
                  <option value="">
                    {openingsLoading
                      ? "Loading openings…"
                      : openings.length
                        ? "Select an opening"
                        : "No open job openings"}
                  </option>
                  {openings.map((item) => (
                    <option key={item.id} value={item.id}>
                      {openingLabel(item)}
                    </option>
                  ))}
                </select>
              </label>
            </HrDetailSection>
            {!optionsLoading && (!candidates.length || !openings.length) ? (
              <Alert>
                <AlertTitle>{candidates.length ? "No open job openings" : "No active candidates"}</AlertTitle>
              </Alert>
            ) : null}
            <HrDrawerActions>
              <Button
                className="text-primary-foreground!"
                type="submit"
                disabled={saving || optionsLoading || !candidateId || !openingId}
              >
                {saving ? "Saving…" : "Create application"}
              </Button>
            </HrDrawerActions>
          </WorkForm>
        </HrRecordDrawer>
      ) : null}
      <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by stage">
        {(["", ...filterStages] as const).map((stage) => {
          const active = filter.stage === stage;
          const count = stage ? data.items.filter((item) => item.stage === stage).length : data.items.length;
          return (
            <Button
              key={stage || "all"}
              type="button"
              size="sm"
              variant={active ? "default" : "ghost"}
              aria-pressed={active}
              disabled={saving}
              onClick={() => {
                setStageFilter(stage);
                setFilter({ search, stage, offset: 0 });
              }}
            >
              {stage ? labels[stage] : "All"}
              <span className="tabular-nums opacity-70">{count}</span>
            </Button>
          );
        })}
      </div>
      {loading ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="relative min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
          <WorkTable paging={false} tableId="app/features/hr/views/hr-recruitment-pipeline-workspace:1" className="w-full min-w-160 text-left text-sm">
            <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Candidate</th>
                <th className="px-4 py-3">Opening</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3">Applied</th>
                <th className="px-4 py-3">Last update</th>
              </tr>
            </thead>
            <tbody>
              {data.items.map((item) => (
                <tr
                  key={item.id}
                  tabIndex={0}
                  className="cursor-pointer border-b border-border transition-colors last:border-0 hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-none"
                  onClick={() => {
                    setStageEditing(false);
                    setSelectedId(item.id);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setStageEditing(false);
                      setSelectedId(item.id);
                    }
                  }}
                >
                  <td className="px-4 py-3">
                    <span className="block font-medium">{item.candidate_name}</span>
                    <span className="block text-xs text-muted-foreground">{item.reference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="block">{item.opening_title}</span>
                    <span className="block text-xs text-muted-foreground">{item.opening_reference}</span>
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant={item.stage === "rejected" || item.stage === "withdrawn" ? "outline" : "secondary"}>
                      {labels[item.stage]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{date(item.created_at)}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{date(item.updated_at)}</td>
                </tr>
              ))}
              {data.items.length === 0 ? (
                <tr>
                  <td className="px-4 py-10 text-center text-muted-foreground" colSpan={5}>
                    No applications match these filters.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </WorkTable>
          <p className="m-0! border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {data.total} applications · showing {data.items.length ? filter.offset + 1 : 0}–
            {filter.offset + data.items.length}
          </p>
        </div>
      )}
      <WorkOffsetPagination
        busy={loading || saving}
        total={data.total}
        offset={filter.offset}
        size={workPageSize}
        previousDisabled={loading || saving || filter.offset === 0}
        nextDisabled={loading || saving || filter.offset + workPageSize >= data.total}
        onSizeChange={(size) => {
          setWorkPageSize(size);
          setFilter((current) => ({ ...current, offset: 0 }));
        }}
        onPrevious={() => setFilter((current) => ({ ...current, offset: Math.max(0, current.offset - workPageSize) }))}
        onNext={() => setFilter((current) => ({ ...current, offset: current.offset + workPageSize }))}
      />
      <HrMasterSheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open && !saving) {
            setSelectedId("");
            setStageEditing(false);
          }
        }}
        eyebrow="Recruitment Pipeline"
        title={selected?.candidate_name ?? "Application"}
        description={selected ? `${selected.reference} · ${selected.opening_title}` : ""}
        footer={
          selected && canUpdate && allowed.length && !stageEditing ? (
            <HrEditButton
              label={`Edit ${selected.reference}`}
              disabled={saving}
              onClick={() => setStageEditing(true)}
            />
          ) : undefined
        }
      >
        {selected ? (
          <div className="grid min-w-0 gap-4" aria-label="Application details">
            {error ? (
              <Alert variant="destructive" role="alert">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            {notice ? (
              <p role="status" className="m-0! rounded-lg border border-border bg-muted p-3 text-sm">
                {notice}
              </p>
            ) : null}
            {stageEditing ? (
              <WorkForm className="grid gap-5" onSubmit={move}>
                <HrDetailSummary code={selected.reference} status={selected.stage} statusLabel={labels[selected.stage]}>
                  {selected.candidate_name} · {selected.opening_title}
                </HrDetailSummary>
                <HrDetailSection title="Stage change">
                  <label className="grid content-start gap-1.5 text-sm font-medium">
                    Stage
                    <select
                      className={selectStyle}
                      required
                      disabled={saving}
                      value={nextStage}
                      onChange={(event) => setNextStage(event.target.value as HrApplicationStage)}
                    >
                      <option value="">{labels[selected.stage]} (current)</option>
                      {allowed.map((stage) => (
                        <option key={stage} value={stage}>
                          {labels[stage]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid content-start gap-1.5 text-sm font-medium">
                    Notes
                    <Textarea
                      maxLength={1000}
                      value={reason}
                      disabled={saving}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                </HrDetailSection>
                <HrDrawerActions>
                  <Button type="button" variant="outline" disabled={saving} onClick={() => setStageEditing(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving || !nextStage}>
                    {saving ? "Saving…" : "Save changes"}
                  </Button>
                </HrDrawerActions>
              </WorkForm>
            ) : (
              <>
                <HrDetailSummary code={selected.reference} status={selected.stage} statusLabel={labels[selected.stage]}>
                  Applied {hrDisplayDate(selected.created_at, false)} · last update{" "}
                  {hrDisplayDate(selected.updated_at, false)}
                </HrDetailSummary>
                <HrDetailGroup title="Candidate">
                  <HrDetailTile label="Name" value={selected.candidate_name} />
                  <HrDetailTile label="Email" value={selected.candidate_email} />
                </HrDetailGroup>
                <HrDetailGroup title="Position">
                  <HrDetailTile
                    label="Opening"
                    value={selected.opening_title}
                    hint={<HrDetailCode>{selected.opening_reference}</HrDetailCode>}
                  />
                </HrDetailGroup>
                {latestNote ? (
                  <HrDetailSection title="Latest note">
                    <HrDetailNote meta={hrDisplayDate(latestNote.occurred_at, true)}>{latestNote.reason}</HrDetailNote>
                  </HrDetailSection>
                ) : null}
                <HrDetailAudit
                  items={[
                    { label: "Applied", value: hrDisplayDate(selected.created_at, true) },
                    { label: "Updated", value: hrDisplayDate(selected.updated_at, true) },
                  ]}
                />
              </>
            )}
          </div>
        ) : null}
      </HrMasterSheet>
    </section>
  );
}
