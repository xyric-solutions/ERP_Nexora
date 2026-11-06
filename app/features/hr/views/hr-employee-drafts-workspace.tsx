"use client";
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
import { HrDetailList, HrDetailTile } from "../components/hr-detail-tile";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrEmployeeWizard } from "./hr-employee-wizard";

type LoadState = "loading" | "ready" | "unavailable";

export function HrEmployeeDraftsWorkspace({ onAction }: { onAction: (action: string, subject?: string) => void }) {
  const { api, csrfToken, session } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [drafts, setDrafts] = useState<Awaited<ReturnType<HrApiClient["employeeDrafts"]>>["items"]>([]);
  const [selected, setSelected] = useState<HrEmployeeDraftDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
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
        setCompanies(result.items);
        setCompanyId((current) => current || result.items[0]?.id || "");
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
      .employeeDrafts({ companyId, search: appliedSearch || undefined, limit: 50 })
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
  }, [appliedSearch, client, companyId, refreshKey]);

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
    if (!selected || !submitReason.trim()) {
      setError("A submission reason is required for approval evidence.");
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
        <label className="grid min-w-0 basis-full gap-1.5 text-sm font-medium text-foreground sm:basis-55 sm:flex-1">
          Company
          <select
            className="h-9 min-w-0 w-full rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            disabled={state === "loading" || companies.length === 0}
            value={companyId}
            onChange={(event) => setCompanyId(event.target.value)}
          >
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        <form
          className="flex min-w-0 basis-full flex-wrap items-end gap-2 sm:basis-65 sm:flex-1"
          onSubmit={(event) => {
            event.preventDefault();
            setAppliedSearch(search.trim());
          }}
        >
          <label className="grid min-w-0 flex-1 gap-1.5 text-sm font-medium text-foreground">
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
        </form>
        <Button type="button" variant="outline" onClick={reload}>
          Refresh
        </Button>
      </div>

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
            <table className="w-full min-w-180 text-left text-sm">
              <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Joined</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {drafts.map((draft) => (
                  <tr className="border-b border-border/70 last:border-0" key={draft.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium text-foreground">{draft.display_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {draft.employee_number}
                        {draft.work_email ? ` · ${draft.work_email}` : ""}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{draft.joined_on}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(draft.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <Button type="button" variant="ghost" size="sm" onClick={() => openDraft(draft.id)}>
                          Review
                        </Button>
                        {canUpdate ? (
                          <>
                            <HrEditButton label={`Edit ${draft.display_name}`} variant="ghost" onClick={() => setEditingId(draft.id)} />
                            <HrConfirmDeleteButton
                              label={`Delete ${draft.display_name}`}
                              title={`Delete draft ${draft.employee_number}?`}
                              description="The draft is removed from Employee Drafts. Its contacts, documents and history stay in the audit trail."
                              onConfirm={() => deleteDraft(draft)}
                            />
                          </>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
                {drafts.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8 text-center text-muted-foreground" colSpan={4}>
                      No employee drafts match this company and search.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <HrRecordDrawer
            title={selected?.display_name ?? "Employee draft"}
            open={drawerOpen}
            onClose={() => setDrawerOpen(false)}
            busy={submitting}
            error={error}
            footer={
              selected ? (
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
                  <HrDetailList>
                    <HrDetailTile label="Employee number" value={selected.employee_number} />
                    <HrDetailTile label="Status" value={<Badge variant="secondary">Draft</Badge>} />
                    <HrDetailTile label="First name" value={selected.first_name} />
                    <HrDetailTile label="Middle name" value={selected.middle_name} />
                    <HrDetailTile label="Last name" value={selected.last_name} />
                    <HrDetailTile label="Preferred name" value={selected.preferred_name} />
                    <HrDetailTile label="Email" value={selected.work_email} />
                    <HrDetailTile label="Phone number" value={selected.phone} />
                    <HrDetailTile label="Joining date" value={selected.joined_on} />
                    <HrDetailTile label="Created" value={new Date(selected.created_at).toLocaleString()} />
                  </HrDetailList>
                  <label className="grid gap-1.5 text-sm font-medium text-foreground">
                    Submission reason
                    <Textarea
                      disabled={!canSubmit || submitting}
                      value={submitReason}
                      onChange={(event) => setSubmitReason(event.target.value)}
                      maxLength={1000}
                      placeholder="Explain why this profile is ready for approval."
                    />
                  </label>
                  {canSubmit ? null : (
                    <Alert>
                      <AlertTitle>Submission permission required</AlertTitle>
                      <AlertDescription>
                        Your session can view this draft but cannot submit it for approval.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              ) : null}
            </aside>
          </HrRecordDrawer>
        </div>
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
