"use client";
import { WorkTable } from "@/shared/ui/work-table";

import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrRecordCodeField } from "../components/hr-create-form";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { HrJobOpeningDirectory } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  HrDetailAudit,
  HrDetailCode,
  HrDetailFigures,
  HrDetailGroup,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import { HrPagination, HrSearchField, matchesSearch, useHrPage } from "../components/hr-list-controls";

/** Cancelled openings are no longer listed; All = open, on hold and closed. */
type OpeningFilter = "all" | "open" | "on_hold" | "closed";
const openingFilterOptions: readonly { value: OpeningFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "open", label: "Open" },
  { value: "on_hold", label: "On hold" },
  { value: "closed", label: "Closed" },
];
type Opening = HrJobOpeningDirectory["items"][number];
export function HrJobOpeningsWorkspace() {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const { api, csrfToken, session, loading: sessionLoading, refresh: refreshSession } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [],
    canRead = permissions.includes("hr.employee.read"),
    canCreate = permissions.includes("hr.employee.create"),
    canUpdate = permissions.includes("hr.employee.update");
  const [companyId, setCompanyId] = useState(""),
    [items, setItems] = useState<Opening[]>([]),
    [approved, setApproved] = useState<Awaited<ReturnType<HrApiClient["manpowerRequisitions"]>>["items"]>([]),
    [selectedId, setSelectedId] = useState(""),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [message, setMessage] = useState(""),
    [editor, setEditor] = useState(false),
    [title, setTitle] = useState(""),
    [requisitionId, setRequisitionId] = useState(""),
    [headcount, setHeadcount] = useState("1"),
    [channels, setChannels] = useState("Company website"),
    [closingOn, setClosingOn] = useState(""),
    /** Set while editing an existing opening. */
    [editingId, setEditingId] = useState(""),
    [openingState, setOpeningState] = useState<Opening["state"]>("open"),
    [openingFilter, setOpeningFilter] = useState<OpeningFilter>("all"),
    [search, setSearch] = useState("");
  const load = useCallback(
    async (company: string) => {
      if (!company) return;
      setLoading(true);
      try {
        const [openings, requisitions] = await Promise.all([
          client.jobOpenings({ companyId: company }),
          client.manpowerRequisitions({ companyId: company, state: "approved" }),
        ]);
        setItems(openings.items);
        setApproved(requisitions.items);
        setSelectedId((current) =>
          openings.items.some((item) => item.id === current) ? current : (openings.items[0]?.id ?? ""),
        );
      } catch {
        setMessage("Job openings could not be loaded from the authorized API. No prototype rows are shown.");
      } finally {
        setLoading(false);
      }
    },
    [client],
  );
  useEffect(() => {
    if (sessionLoading || !canRead) {
      if (!sessionLoading) setLoading(false);
      return;
    }
    client
      .companies()
      .then((result) => {
        const first = result.items[0]?.id ?? "";
        setCompanyId(first);
        if (!first) {
          setMessage("No authorized company is available. Ask your administrator to review company access.");
          setLoading(false);
          return;
        }
        return load(first);
      })
      .catch(() => {
        setMessage("Authorized companies could not be loaded.");
        setLoading(false);
      });
  }, [canRead, client, load, sessionLoading]);
  const selected = items.find((item) => item.id === selectedId);
  const visibleItems = items.filter(
    (item) =>
      (openingFilter === "all" ? item.state !== "cancelled" : item.state === openingFilter) &&
      matchesSearch(search, [
        item.reference,
        item.title,
        item.requisition_reference,
        item.closing_on,
        item.state.replaceAll("_", " "),
        ...item.channels,
      ]),
  );
  const openingsPage = useHrPage(visibleItems, `${companyId}:${openingFilter}:${search.trim()}`);
  // Mirrors the server rule: non-cancelled openings draw down the requisition's approved headcount.
  const chosenRequisition = approved.find((item) => item.id === requisitionId);
  const raisedHeadcount = items
    .filter((item) => item.requisition_id === requisitionId && item.state !== "cancelled")
    .reduce((total, item) => total + item.positions_requested, 0);
  const availableHeadcount = chosenRequisition
    ? Math.max(0, chosenRequisition.positions_requested - raisedHeadcount)
    : null;
  const chooseRequisition = (id: string) => {
    const requisition = approved.find((item) => item.id === id);
    setRequisitionId(id);
    // Start from the requisition's job title; recruiters can still adjust the advertised wording.
    if (requisition && (!title.trim() || approved.some((item) => item.job_title === title)))
      setTitle(requisition.job_title);
  };
  const startEdit = (opening: Opening) => {
    setEditingId(opening.id);
    setRequisitionId(opening.requisition_id);
    setTitle(opening.title);
    setHeadcount(String(opening.positions_requested));
    setChannels(opening.channels.join(", "));
    setClosingOn(opening.closing_on ?? "");
    setOpeningState(opening.state);
    setDetailsOpen(false);
    setEditor(true);
  };
  const closeEditor = () => {
    setEditor(false);
    setEditingId("");
  };
  const remove = async (opening: Opening) => {
    setSaving(true);
    try {
      await client.deleteJobOpening(opening.id, companyId, csrfToken(), crypto.randomUUID());
      setMessage(`${opening.reference} was deleted.`);
      setDetailsOpen(false);
      setSelectedId("");
      await load(companyId);
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message ? cause.message : "The opening could not be deleted.");
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveEdit = async () => {
    const count = Number(headcount);
    const channelList = channels
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!title.trim() || !Number.isInteger(count) || count < 1 || !channelList.length) {
      setMessage("Provide a title, the number of positions to fill and at least one advertising channel.");
      return;
    }
    setSaving(true);
    try {
      await client.updateJobOpening(
        editingId,
        {
          company_id: companyId,
          title: title.trim(),
          positions_requested: count,
          channels: channelList,
          closing_on: closingOn || null,
          state: openingState,
          reason: "",
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage("The job opening was saved.");
      setSelectedId(editingId);
      closeEditor();
      await load(companyId);
    } catch (cause) {
      setMessage(cause instanceof Error && cause.message ? cause.message : "The opening could not be saved.");
    } finally {
      setSaving(false);
    }
  };
  const save = async () => {
    if (saving) return;
    if (editingId) return saveEdit();
    const count = Number(headcount);
    if (!requisitionId || !title.trim() || !Number.isInteger(count) || count < 1) {
      setMessage("Select an approved requisition and provide a title and the number of positions to fill.");
      return;
    }
    if (availableHeadcount !== null && count > availableHeadcount) {
      setMessage(
        `Only ${availableHeadcount} approved position${availableHeadcount === 1 ? " is" : "s are"} still unassigned on this requisition.`,
      );
      return;
    }
    if (!channels.split(",").some((value) => value.trim())) {
      setMessage("Name at least one channel where this vacancy will be advertised.");
      return;
    }
    setSaving(true);
    try {
      const result = await client.createJobOpening(
        {
          company_id: companyId,
          requisition_id: requisitionId,
          title: title.trim(),
          positions_requested: count,
          channels: channels
            .split(",")
            .map((value) => value.trim())
            .filter(Boolean),
          ...(closingOn ? { closing_on: closingOn } : {}),
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`${result.reference} was created as an open job opening.`);
      setEditor(false);
      setSelectedId(result.id);
      await load(companyId);
    } catch {
      setMessage(
        "The opening was rejected. It needs an approved requisition with enough positions that are not already in another opening.",
      );
    } finally {
      setSaving(false);
    }
  };
  const change = async (state: "open" | "on_hold" | "closed" | "cancelled") => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      await client.changeJobOpeningState(
        selected.id,
        {
          company_id: companyId,
          state,
          reason:
            state === "on_hold"
              ? "Placed on hold for review."
              : state === "closed"
                ? "Recruitment closed."
                : state === "cancelled"
                  ? "Opening cancelled."
                  : "Reopened for recruitment.",
        },
        csrfToken(),
        crypto.randomUUID(),
      );
      setMessage(`${selected.reference} is now ${state.replaceAll("_", " ")}.`);
      await load(companyId);
    } catch {
      setMessage("The opening state could not be changed.");
    } finally {
      setSaving(false);
    }
  };
  if (sessionLoading) return <Skeleton className="h-96 w-full" />;
  if (!session)
    return (
      <Alert>
        <AlertTitle>Sign in required</AlertTitle>
        <AlertDescription>
          Your session is not active.{" "}
          <Button size="sm" variant="outline" onClick={() => void refreshSession()}>
            Retry session
          </Button>
        </AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert>
        <AlertTitle>Recruitment access required</AlertTitle>
        <AlertDescription>This screen requires HR employee read permission.</AlertDescription>
      </Alert>
    );
  return (
    <section className="grid min-w-0 gap-4" aria-label="Job Openings">
      <p className="m-0! text-sm text-muted-foreground">
        Open vacancies against approved requisitions and track available headcount.
      </p>
      {message ? (
        <Alert>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id="hr-job-openings-search"
          value={search}
          onChange={setSearch}
          placeholder="Search reference, opening, requisition or channel"
        />
        {canCreate ? (
          <Button
            className="w-full md:w-auto"
            onClick={() => {
              setEditingId("");
              setTitle("");
              setHeadcount("1");
              setClosingOn("");
              setEditor(true);
              chooseRequisition(approved[0]?.id ?? "");
            }}
          >
            + Create opening
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter<OpeningFilter>
        label="Opening state"
        value={openingFilter}
        options={openingFilterOptions}
        onChange={setOpeningFilter}
      />
      {loading ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid min-w-0 items-start gap-4 ">
          <div className="relative min-w-0 overflow-x-auto rounded-lg border bg-card border-border">
            <WorkTable tableId="app/features/hr/views/hr-job-openings-workspace:1" className="w-full min-w-190 text-sm">
              <thead className="border-b bg-muted/60 border-border">
                <tr>
                  <th className="px-4 py-3 text-left">Reference</th>
                  <th className="px-4 py-3 text-left">Opening</th>
                  <th className="px-4 py-3 text-left">Requisition</th>
                  <th className="px-4 py-3 text-left">Unfilled positions</th>
                  <th className="px-4 py-3 text-left">Closing</th>
                  <th className="px-4 py-3 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {openingsPage.pageRows.map((item) => (
                  <tr
                    className={`cursor-pointer border-b border-border ${item.id === selectedId ? "bg-accent" : ""}`}
                    key={item.id}
                    onClick={() => {
                      setSelectedId(item.id);
                      setDetailsOpen(true);
                      setEditor(false);
                    }}
                  >
                    <td className="px-4 py-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 font-semibold"
                        onClick={() => {
                          setSelectedId(item.id);
                          setDetailsOpen(true);
                          setEditor(false);
                        }}
                      >
                        {item.reference}
                      </Button>
                    </td>
                    <td className="px-4 py-3">
                      <strong>{item.title}</strong>
                      <span className="block text-xs text-muted-foreground">{item.channels.join(", ")}</span>
                    </td>
                    <td className="px-4 py-3">{item.requisition_reference}</td>
                    <td className="px-4 py-3">
                      {item.remaining_positions} of {item.positions_requested}
                      <span className="block text-xs text-muted-foreground">{item.filled_positions} hired</span>
                    </td>
                    <td className="px-4 py-3">{item.closing_on ?? "Not set"}</td>
                    <td className="px-4 py-3">
                      <span className="nx-status nx-status-draft">{item.state.replaceAll("_", " ")}</span>
                    </td>
                  </tr>
                ))}
                {visibleItems.length === 0 ? (
                  <tr>
                    <td className="px-4 py-10 text-center text-muted-foreground" colSpan={6}>
                      {search.trim() ? "No job openings match this search." : "No job openings match this state."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>
          <HrPagination
            label="Job opening pages"
            page={openingsPage.page}
            pageCount={openingsPage.pageCount}
            total={openingsPage.total}
            onPageChange={openingsPage.setPage}
          />
          {editor ? (
            <HrRecordDrawer
              title={editingId ? title || "Edit job opening" : "Create job opening"}
              open={editor}
              onClose={closeEditor}
              busy={saving}
              notice={message}
            >
              <aside className="grid gap-5 rounded-lg border bg-card p-4 border-border">
                <HrDetailSection title="Opening">
                  <HrRecordCodeField
                    kind="opening"
                    companyId={companyId || undefined}
                    value={editingId ? (items.find((item) => item.id === editingId)?.reference ?? null) : null}
                  />
                  <label className="grid content-start gap-1 text-sm">
                    Opening title
                    <Input value={title} onChange={(event) => setTitle(event.target.value)} />
                  </label>
                  {approved.length === 0 && !editingId ? (
                    <Alert>
                      <AlertTitle>Approved requisition required</AlertTitle>
                      <AlertDescription>
                        Submit and independently approve a manpower requisition before creating an opening.
                      </AlertDescription>
                    </Alert>
                  ) : null}
                  <label className="grid content-start gap-1 text-sm">
                    Approved requisition
                    <select
                      className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2 disabled:opacity-60"
                      value={requisitionId}
                      disabled={!!editingId}
                      onChange={(event) => chooseRequisition(event.target.value)}
                    >
                      {editingId && !approved.some((item) => item.id === requisitionId) ? (
                        <option value={requisitionId}>
                          {items.find((item) => item.id === editingId)?.requisition_reference ?? "Current requisition"}
                        </option>
                      ) : null}
                      <option value="">Select</option>
                      {approved.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.reference} · {item.job_title} ({item.positions_requested} approved)
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="grid content-start gap-1 text-sm">
                    Positions to fill
                    <Input
                      inputMode="numeric"
                      value={headcount}
                      onChange={(event) => setHeadcount(event.target.value)}
                    />
                  </label>
                  <label className="grid content-start gap-1 text-sm">
                    Closing date
                    <Input type="date" value={closingOn} onChange={(event) => setClosingOn(event.target.value)} />
                  </label>
                </HrDetailSection>
                <HrDetailSection title="Advertising">
                  <label className="grid content-start gap-1 text-sm">
                    Advertising channels
                    <Input
                      value={channels}
                      placeholder="Company website, LinkedIn, Employee referral"
                      onChange={(event) => setChannels(event.target.value)}
                    />
                  </label>
                </HrDetailSection>
                {editingId ? (
                  <HrDetailSection title="Status">
                    <label className="grid content-start gap-1 text-sm">
                      Status
                      <select
                        className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2"
                        value={openingState}
                        onChange={(event) => setOpeningState(event.target.value as Opening["state"])}
                      >
                        {(openingState === "cancelled" ? (["open", "on_hold", "closed", "cancelled"] as const) : (["open", "on_hold", "closed"] as const)).map((state) => (
                          <option key={state} value={state}>
                            {state === "on_hold" ? "On hold" : state.charAt(0).toUpperCase() + state.slice(1)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </HrDetailSection>
                ) : null}
                <HrDrawerActions>
                  <Button disabled={saving || (!editingId && !approved.length)} onClick={() => void save()}>
                    {editingId ? "Save changes" : "Create opening"}
                  </Button>
                </HrDrawerActions>
              </aside>
            </HrRecordDrawer>
          ) : selected ? (
            <HrRecordDrawer
              title={selected.title}
              open={detailsOpen && !editor}
              onClose={() => setDetailsOpen(false)}
              busy={saving}
              notice={message}
            >
              <aside className="grid min-w-0 gap-4 rounded-lg border bg-card p-5 border-border">
                <HrDetailSummary code={selected.reference} status={selected.state}>
                  From requisition <HrDetailCode>{selected.requisition_reference}</HrDetailCode>
                  {selected.closing_on ? ` · closes ${hrDisplayDate(selected.closing_on)}` : ""}
                </HrDetailSummary>
                <HrDetailFigures
                  items={[
                    { label: "Positions", value: selected.positions_requested },
                    { label: "Hired", value: selected.filled_positions },
                    { label: "Unfilled", value: selected.remaining_positions },
                  ]}
                  progress={{
                    value: selected.filled_positions,
                    total: selected.positions_requested,
                    label: `${selected.filled_positions} of ${selected.positions_requested} filled`,
                  }}
                />
                <HrDetailGroup title="Opening">
                  <HrDetailTile label="Opening title" value={selected.title} />
                  <HrDetailTile label="Requisition" value={selected.requisition_reference} mono />
                  <HrDetailTile
                    label="Advertised on"
                    value={
                      selected.channels.length ? (
                        <span className="flex flex-wrap gap-1.5">
                          {selected.channels.map((channel) => (
                            <span
                              key={channel}
                              className="rounded-[5px] border border-border bg-muted px-2 text-xs font-normal"
                            >
                              {channel}
                            </span>
                          ))}
                        </span>
                      ) : undefined
                    }
                  />
                  <HrDetailTile
                    label="Closing date"
                    value={selected.closing_on ? hrDisplayDate(selected.closing_on) : "Not set"}
                  />
                </HrDetailGroup>
                {selected.state_reason ? (
                  <HrDetailSection title="Latest change">
                    <HrDetailNote>{selected.state_reason}</HrDetailNote>
                  </HrDetailSection>
                ) : null}
                <HrDetailAudit items={[{ label: "Created", value: hrDisplayDate(selected.created_at, true) }]} />
                {canUpdate ? (
                  <HrDrawerActions>
                    <HrConfirmDeleteButton
                      label={`Delete ${selected.reference}`}
                      title={`Delete ${selected.reference}?`}
                      description="Openings without applications can be deleted. The deletion is kept in the audit trail."
                      variant="outline"
                      disabled={saving}
                      onConfirm={() => remove(selected)}
                    />
                    <HrEditButton
                      label={`Edit ${selected.reference}`}
                      disabled={saving}
                      onClick={() => startEdit(selected)}
                    />
                    {selected.state !== "on_hold" && selected.state !== "cancelled" ? (
                      <Button variant="outline" onClick={() => void change("on_hold")}>
                        Put on hold
                      </Button>
                    ) : null}
                    {selected.state === "on_hold" ? <Button onClick={() => void change("open")}>Reopen</Button> : null}
                    {selected.state !== "closed" && selected.state !== "cancelled" ? (
                      <Button variant="outline" onClick={() => void change("closed")}>
                        Close
                      </Button>
                    ) : null}
                  </HrDrawerActions>
                ) : null}
              </aside>
            </HrRecordDrawer>
          ) : (
            <aside className="rounded-lg border bg-card p-5 text-sm text-muted-foreground border-border">
              Create an opening when an approved requisition is available.
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
