"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { HrRecordDrawer } from "../components/hr-record-drawer";

import { useEffect, useMemo, useState } from "react";

import type { HrEmployeeDraftDetail } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";

import { HrApiClient } from "../api/hr-client";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  HrDetailAudit,
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import { HrEmployeeWizard } from "./hr-employee-wizard";

type LoadState = "loading" | "ready" | "unavailable";
type DraftFilter = "all" | "draft" | "submitted";
/** Draft = not yet submitted; Submitted = sent to Approvals (it stays inactive until hired). */
const draftFilterOptions: readonly { value: DraftFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "draft", label: "Draft" },
  { value: "submitted", label: "Submitted" },
];

export function HrEmployeeDraftsWorkspace({
  onAction,
  allowAdd = false,
}: {
  onAction: (action: string, subject?: string) => void;
  /** Add Employee page: offer "+ Add Employee" and open the new employee's details after Create. */
  allowAdd?: boolean;
}) {
  const { api, csrfToken, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [noCompany, setNoCompany] = useState(false);
  const [companyId, setCompanyId] = useState("");
  const [drafts, setDrafts] = useState<Awaited<ReturnType<HrApiClient["employeeDrafts"]>>["items"]>([]);
  const [selected, setSelected] = useState<HrEmployeeDraftDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<DraftFilter>("all");
  const [submitReason, setSubmitReason] = useState("");
  const [state, setState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("ready");
  const [refreshKey, setRefreshKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const canRead = session?.user.permissions.includes("hr.employee.read") ?? false;
  const canSubmit = session?.user.permissions.includes("hr.employee.submit") ?? false;
  const canUpdate = session?.user.permissions.includes("hr.employee.update") ?? false;
  const [editingId, setEditingId] = useState("");
  const [adding, setAdding] = useState(false);
  const canCreate = session?.user.permissions.includes("hr.employee.create") ?? false;

  /** Deleting a draft withdraws it: it leaves this list and keeps its audit trail. */
  const deleteDraft = async (draft: { id: string; employee_number: string }) => {
    setError("");
    try {
      await client.withdrawEmployeeDraft(draft.id, csrfToken(), crypto.randomUUID());
      setNotice(`${draft.employee_number} was deleted. Its audit trail is kept.`);
      setSelected(null);
      setDrawerOpen(false);
      setRefreshKey((current) => current + 1);
      onAction("Employee draft deleted", draft.employee_number);
      return true;
    } catch {
      setError("The draft could not be deleted. Only unsubmitted drafts in your company scope can be deleted.");
      return false;
    }
  };

  const reload = () => {
    if (!canRead) {
      setState("unavailable");
      return;
    }
    setState("loading");
    setError("");
    client
      .companies()
      .then((result) => {
        setNoCompany(result.items.length === 0);
        setCompanyId((current) => current || result.items[0]?.id || "");
        if (!result.items.length) setState("ready");
      })
      .catch(() => setState("unavailable"));
  };

  useEffect(() => {
    reload();
    // The authenticated client changes only after an intentional session change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canRead, client]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
    client
      .employeeDrafts({ companyId, search: appliedSearch || undefined, status: statusFilter, limit: 50 })
      .then((result) => {
        if (!active) return;
        setDrafts(result.items);
        setSelected((current) => (current && result.items.some((item) => item.id === current.id) ? current : null));
        setState("ready");
      })
      .catch(() => {
        if (active) setState("unavailable");
      });
    return () => {
      active = false;
    };
  }, [appliedSearch, client, companyId, refreshKey, statusFilter]);

  const openDraft = (employeeId: string) => {
    setDrawerOpen(true);
    setDetailState("loading");
    setError("");
    client
      .employeeDraft(employeeId)
      .then((detail) => {
        setSelected(detail);
        setSubmitReason("");
        setDetailState("ready");
      })
      .catch(() => {
        setSelected(null);
        setDetailState("unavailable");
      });
  };

  const submitDraft = async () => {
    if (!selected) {
      setError("Select a draft to submit.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await client.submitEmployeeDraft(
        selected.id,
        { reason: submitReason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${result.employee_number} was submitted for HR approval and remains inactive.`);
      setSelected(null);
      setDrawerOpen(false);
      setSubmitReason("");
      setRefreshKey((current) => current + 1);
      onAction("Employee draft submitted", result.employee_number);
    } catch {
      setError(
        "The draft could not be submitted. It may have changed or your session may no longer permit this action.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  if (state === "unavailable") {
    return (
      <Alert>
        <AlertTitle>Live employee drafts are unavailable</AlertTitle>
        <AlertDescription>
          The live draft directory could not be loaded. No cached or prototype employee records are shown.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <section className="grid min-w-0 grid-cols-1 gap-4" aria-label="Employee drafts">
      <div className="flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <WorkForm
          className="flex min-w-0 basis-full flex-wrap items-end gap-2 sm:basis-65 sm:flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <label className="grid content-start min-w-0 flex-1 gap-1.5 text-sm font-medium text-foreground">
            Search draft
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Name or employee number"
            />
          </label>
          <Button type="submit" variant="outline">
            Search
          </Button>
        </WorkForm>
        {allowAdd && canCreate ? (
          <Button type="button" onClick={() => setAdding(true)}>
            + Add Employee
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter<DraftFilter>
        label="Draft status"
        value={statusFilter}
        options={draftFilterOptions}
        onChange={(value) => {
          setStatusFilter(value);
          setError("");
        }}
      />

      {notice ? (
        <Alert>
          <AlertTitle>Employee drafts</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Action unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {noCompany ? (
        <Alert>
          <AlertTitle>Company access required</AlertTitle>
          <AlertDescription>Company access must be granted before employee drafts can be reviewed.</AlertDescription>
        </Alert>
      ) : null}
      {state === "loading" ? (
        <div className="grid gap-2 rounded-lg border border-border bg-card p-4" aria-live="polite">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {state === "ready" ? (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="relative min-w-0 w-full overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <WorkTable tableId="app/features/hr/views/hr-employee-drafts-workspace:1" className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="w-px whitespace-nowrap px-4 py-3">Employee no.</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Work email</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr
                    key={draft.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`Open ${draft.display_name} (${draft.employee_number})`}
                    className="cursor-pointer border-b border-border/70 transition-colors last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                    onClick={() => openDraft(draft.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        openDraft(draft.id);
                      }
                    }}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs font-semibold">{draft.employee_number}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{draft.display_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{draft.work_email || "—"}</td>
                    <td className="px-4 py-3 text-muted-foreground">{draft.joined_on}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(draft.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={draft.status === "pending_approval" ? "secondary" : "outline"}>
                        {draft.status === "pending_approval" ? "Submitted" : "Draft"}
                      </Badge>
                    </td>
                  </tr>
                ))}
                {drafts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={6}>
                      No employee drafts match this company, status and search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>

          <HrRecordDrawer
            title={selected?.display_name ?? "Employee draft"}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            busy={submitting}
            error={error}
            footer={
              selected && selected.status !== "pending_approval" ? (
                <>
                  {canUpdate ? (
                    <>
                      <HrConfirmDeleteButton
                        label={`Delete ${selected.display_name}`}
                        title={`Delete draft ${selected.employee_number}?`}
                        description="The draft is removed from Employee Drafts. Its contacts, documents and history stay in the audit trail."
                        variant="outline"
                        disabled={submitting}
                        onConfirm={() => deleteDraft(selected)}
                      />
                      <HrEditButton
                        label={`Edit ${selected.display_name}`}
                        disabled={submitting}
                        onClick={() => {
                          setDrawerOpen(false);
                          setEditingId(selected.id);
                        }}
                      />
                    </>
                  ) : null}
                  {canSubmit ? (
                    <Button type="button" disabled={submitting} onClick={submitDraft}>
                      {submitting ? "Submitting…" : "Submit for approval"}
                    </Button>
                  ) : null}
                </>
              ) : undefined
            }
          >
            <aside className="rounded-lg border border-border bg-card p-4 shadow-sm">
              {detailState === "loading" ? (
                <div className="grid gap-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : null}
              {detailState === "unavailable" ? (
                <Alert variant="destructive">
                  <AlertTitle>Draft unavailable</AlertTitle>
                  <AlertDescription>The selected draft could not be loaded in your current scope.</AlertDescription>
                </Alert>
              ) : null}
              {!selected && detailState === "ready" ? (
                <p className="text-sm text-muted-foreground">
                  Select a draft to review its permitted profile fields and submit it for approval.
                </p>
              ) : null}
              {selected ? (
                <div className="grid gap-4">
                  <HrDetailSummary code={selected.employee_number} status={selected.status === "pending_approval" ? "submitted" : "draft"}>
                    {selected.joined_on ? `Joining ${hrDisplayDate(selected.joined_on)}` : null}
                  </HrDetailSummary>
                  <HrDetailGroup title="Name">
                    <HrDetailTile label="First name" value={selected.first_name} />
                    <HrDetailTile label="Middle name" value={selected.middle_name} />
                    <HrDetailTile label="Last name" value={selected.last_name} />
                    <HrDetailTile label="Preferred name" value={selected.preferred_name} />
                  </HrDetailGroup>
                  <HrDetailGroup title="Contact">
                    <HrDetailTile label="Email" value={selected.work_email} />
                    <HrDetailTile label="Phone number" value={selected.phone} />
                  </HrDetailGroup>
                  <HrDetailGroup title="Employment">
                    <HrDetailTile label="Joining date" value={hrDisplayDate(selected.joined_on)} />
                    <HrDetailTile label="Location" value={selected.location ?? ""} />
                    <HrDetailTile label="Project" value={selected.project ?? ""} />
                  </HrDetailGroup>
                  {selected.status === "pending_approval" ? (
                    <Alert>
                      <AlertTitle>Submitted for approval</AlertTitle>
                      <AlertDescription>
                        This employee is in Approvals. It can no longer be edited or deleted here.
                      </AlertDescription>
                    </Alert>
                  ) : (
                  <HrDetailSection title="Submit for approval">
                    <label className="grid content-start gap-1.5 text-sm font-medium text-foreground">
                      Submission reason
                      <Textarea
                        disabled={!canSubmit || submitting}
                        value={submitReason}
                        onChange={(event) => setSubmitReason(event.target.value)}
                        maxLength={1000}
                        placeholder="Explain why this profile is ready for approval."
                      />
                    </label>
                  </HrDetailSection>
                  )}
                  {canSubmit || selected.status === "pending_approval" ? null : (
                    <Alert>
                      <AlertTitle>Submission permission required</AlertTitle>
                      <AlertDescription>
                        Your session can view this draft but cannot submit it for approval.
                      </AlertDescription>
                    </Alert>
                  )}
                  <HrDetailAudit items={[{ label: "Created", value: hrDisplayDate(selected.created_at, true) }]} />
                </div>
              ) : null}
            </aside>
          </HrRecordDrawer>
        </div>
      ) : null}
      {adding ? (
        <HrEmployeeWizard
          target={{ kind: "create" }}
          onClose={() => {
            setAdding(false);
            setRefreshKey((current) => current + 1);
          }}
          onSaved={(message, employeeNumber, employeeId) => {
            setNotice(message);
            setAdding(false);
            setRefreshKey((current) => current + 1);
            onAction("Employee draft created", employeeNumber);
            // The new employee opens in the standard detail drawer.
            if (employeeId) openDraft(employeeId);
          }}
        />
      ) : null}
      {editingId ? (
        <HrEmployeeWizard
          target={{ kind: "draft", employeeId: editingId }}
          onClose={() => {
            setEditingId("");
            setRefreshKey((current) => current + 1);
          }}
          onSaved={(message, employeeNumber) => {
            setNotice(message);
            setEditingId("");
            setRefreshKey((current) => current + 1);
            onAction("Employee draft updated", employeeNumber);
          }}
        />
      ) : null}
    </section>
  );
}
