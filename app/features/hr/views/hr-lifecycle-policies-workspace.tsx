"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";


import { useEffect, useMemo, useState } from "react";

import type { HrEmploymentLifecyclePolicyDirectory } from "@nexora/contracts";
import { Ban } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";

import { HrApiClient } from "../api/hr-client";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrConfirmDeleteButton } from "../components/hr-confirm-delete-button";
import {
  HrDetailAudit,
  HrDetailList,
  HrDetailNote,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  HrStatusPill,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrEditButton } from "../components/hr-icon-buttons";
import { HrPagination, HrSearchField, matchesSearch, useHrPage } from "../components/hr-list-controls";
import { HrMasterStatusFilter, type HrMasterStatus } from "../components/hr-master-status-filter";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { hrCell } from "../components/hr-table";

type LoadState = "loading" | "ready" | "error";
type Policy = HrEmploymentLifecyclePolicyDirectory["items"][number];
type Decision = "submit" | "approve" | "activate" | "deactivate";

const statusLabel: Record<Policy["status"], string> = {
  draft: "Draft",
  pending_approval: "Pending approval",
  approved: "Approved",
  active: "Active",
  inactive: "Deactivated",
};

const decisionLabel: Record<Decision, string> = {
  submit: "Submit for approval",
  approve: "Approve",
  activate: "Activate",
  deactivate: "Deactivate",
};

const filterMatches = (filter: HrMasterStatus, policy: Policy) =>
  filter === "all" || (filter === "active" ? policy.status === "active" : policy.status === "inactive");

/** Lifecycle policies: name and describe a company policy; drafts are edited or deleted, live ones deactivated. */
export function HrLifecyclePoliciesWorkspace() {
  const { api, csrfToken, session, activeCompany, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [fallbackCompanyId, setFallbackCompanyId] = useState("");
  const companyId = activeCompany?.id ?? fallbackCompanyId;
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const [refreshKey, setRefreshKey] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<HrMasterStatus>("all");
  const [openedId, setOpenedId] = useState("");
  const [editor, setEditor] = useState<"new" | Policy | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("hr.employment_lifecycle_policy.read");
  const canManage = permissions.includes("hr.employment_lifecycle_policy.manage");
  const canApprove = permissions.includes("hr.employment_lifecycle_policy.approve");

  // Without a sign-in company, fall back to the first authorized company.
  useEffect(() => {
    if (sessionLoading || !canRead || activeCompany?.id) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setFallbackCompanyId(result.items[0]?.id ?? "");
        if (!result.items.length) setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [activeCompany?.id, canRead, client, sessionLoading, refreshKey]);

  useEffect(() => {
    if (!companyId || !canRead) return;
    let active = true;
    client
      .employmentLifecyclePolicies({ companyId, limit: 100 })
      .then((result) => {
        if (!active) return;
        setPolicies(result.items);
        setState("ready");
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canRead, client, companyId, refreshKey]);

  const visible = policies.filter(
    (policy) =>
      filterMatches(filter, policy) &&
      matchesSearch(search, [policy.name, policy.code, policy.description, statusLabel[policy.status]]),
  );
  const listPage = useHrPage(visible, `${search}|${filter}`);
  const opened = policies.find((policy) => policy.id === openedId) ?? null;

  const reload = () => {
    setState("loading");
    setRefreshKey((value) => value + 1);
  };

  const openEditor = (target: "new" | Policy) => {
    setError("");
    setNotice("");
    setName(target === "new" ? "" : target.name);
    setDescription(target === "new" ? "" : target.description);
    setEditor(target);
  };

  const savePolicy = async () => {
    if (!companyId || !name.trim()) {
      setError("Enter the policy name.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const body = { company_id: companyId, name: name.trim(), description: description.trim() };
      const result =
        editor === "new"
          ? await client.createEmploymentLifecyclePolicy({ ...body, code: "AUTO" }, csrfToken(), crypto.randomUUID())
          : await client.updateEmploymentLifecyclePolicy(
              (editor as Policy).id,
              body,
              csrfToken(),
              crypto.randomUUID(),
            );
      setNotice(editor === "new" ? `${result.code} created as a draft.` : `${result.code} updated.`);
      setOpenedId(result.id);
      setEditor(null);
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The policy could not be saved.");
    } finally {
      setBusy(false);
    }
  };

  const deletePolicy = async (policy: Policy) => {
    setBusy(true);
    setError("");
    try {
      await client.deleteEmploymentLifecyclePolicy(policy.id, { company_id: companyId }, csrfToken(), crypto.randomUUID());
      setNotice(`${policy.code} deleted.`);
      setOpenedId("");
      reload();
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "The policy could not be deleted.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const decide = async (policy: Policy, action: Decision) => {
    setBusy(true);
    setError("");
    try {
      const key = crypto.randomUUID();
      const input = { reason: reason.trim() };
      if (action === "submit") await client.submitEmploymentLifecyclePolicy(policy.id, input, csrfToken(), key);
      else if (action === "approve") await client.approveEmploymentLifecyclePolicy(policy.id, input, csrfToken(), key);
      else if (action === "activate")
        await client.activateEmploymentLifecyclePolicy(policy.id, input, csrfToken(), key);
      else
        await client.deactivateEmploymentLifecyclePolicy(
          policy.id,
          { company_id: companyId, ...input },
          csrfToken(),
          key,
        );
      setNotice(
        action === "submit"
          ? `${policy.code} submitted for approval.`
          : action === "approve"
            ? `${policy.code} approved.`
            : action === "activate"
              ? `${policy.code} is now active.`
              : `${policy.code} deactivated.`,
      );
      setDecision(null);
      setReason("");
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "The action could not be completed.");
    } finally {
      setBusy(false);
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Lifecycle policy read permission is required.</AlertDescription>
      </Alert>
    );

  const workflow: Decision[] = opened
    ? opened.status === "draft" && canManage
      ? ["submit"]
      : opened.status === "pending_approval" && canApprove
        ? ["approve"]
        : opened.status === "approved" && canApprove
          ? ["activate"]
          : []
    : [];
  const blockedBySelfReview =
    !!opened &&
    (opened.status === "pending_approval" || opened.status === "approved") &&
    opened.self_decision_requires_override &&
    !opened.super_admin_override_allowed;
  const isDraft = opened?.status === "draft";
  const canDeactivate = !!opened && canManage && (opened.status === "active" || opened.status === "approved");

  return (
    <section className="grid min-w-0 gap-3" aria-label="Lifecycle policies">
      <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(14rem,1fr)_auto] md:items-end">
        <HrSearchField
          id="hr-lifecycle-policies-search"
          value={search}
          onChange={setSearch}
          placeholder="Search policy name, code or text"
        />
        {canManage ? (
          <Button
            type="button"
            className="w-full md:w-auto"
            disabled={state !== "ready" || !companyId || busy}
            onClick={() => openEditor("new")}
          >
            + Create policy
          </Button>
        ) : null}
      </div>
      <HrMasterStatusFilter label="Policy status" value={filter} onChange={setFilter} />

      {notice && !opened && !editor ? (
        <p role="status" className="m-0! text-sm text-muted-foreground">
          {notice}
        </p>
      ) : null}
      {state === "loading" ? <Skeleton className="h-32 w-full" /> : null}
      {state === "error" ? (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            Lifecycle policies could not be loaded.
            <Button type="button" variant="outline" size="sm" onClick={reload}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {state === "ready" && !companyId ? (
        <Alert>
          <AlertDescription>No company is assigned to your account.</AlertDescription>
        </Alert>
      ) : null}

      {state === "ready" && companyId ? (
        <>
          <div className="min-w-0 overflow-x-auto rounded-lg border border-border bg-card">
            <WorkTable paging={false} tableId="app/features/hr/views/hr-lifecycle-policies-workspace:1" className="w-full table-fixed text-left text-sm">
              <caption className="sr-only">Lifecycle policies</caption>
              <thead className="border-b border-border bg-muted/60">
                <tr>
                  <th scope="col" className={`${hrCell} w-[34%] font-semibold max-sm:w-auto`}>
                    Policy
                  </th>
                  <th scope="col" className={`${hrCell} font-semibold max-sm:hidden`}>
                    Description
                  </th>
                  <th scope="col" className={`${hrCell} w-36 font-semibold`}>
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {listPage.pageRows.map((policy) => (
                  <HrClickableRow
                    key={policy.id}
                    onOpen={() => {
                      setError("");
                      setNotice("");
                      setDecision(null);
                      setReason("");
                      setOpenedId(policy.id);
                    }}
                  >
                    <td className={hrCell}>
                      <span className="block truncate font-medium">{policy.name}</span>
                      <span className="font-mono text-xs text-muted-foreground">{policy.code}</span>
                    </td>
                    <td className={`${hrCell} text-muted-foreground max-sm:hidden`}>
                      <span className="line-clamp-2 wrap-anywhere">{policy.description}</span>
                    </td>
                    <td className={hrCell}>
                      <HrStatusPill status={policy.status} label={statusLabel[policy.status]} />
                    </td>
                  </HrClickableRow>
                ))}
                {!visible.length ? (
                  <tr>
                    <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                      {search.trim() || filter !== "all" ? "No policies match." : "No lifecycle policies yet."}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </WorkTable>
          </div>
          <HrPagination
            label="Lifecycle policy pages"
            page={listPage.page}
            pageCount={listPage.pageCount}
            total={listPage.total}
            onPageChange={listPage.setPage}
          />
        </>
      ) : null}

      <HrRecordDrawer
        title={editor === "new" ? "New lifecycle policy" : `Edit ${editor ? editor.name : "policy"}`}
        description={editor === "new" ? "Create a lifecycle policy" : "Edit the lifecycle policy"}
        open={editor !== null}
        busy={busy}
        error={editor ? error : undefined}
        onClose={() => setEditor(null)}
      >
        <WorkForm
          className="grid min-w-0 gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void savePolicy();
          }}
        >
          <label htmlFor="lifecycle-policy-code" className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
            Code
            <Input
              id="lifecycle-policy-code"
              readOnly
              className="font-mono read-only:bg-muted/40"
              value={editor && editor !== "new" ? editor.code : "Assigned on save · LCP-001…"}
            />
          </label>
          <label htmlFor="lifecycle-policy-name" className="grid min-w-0 content-start gap-1.5 text-sm font-medium">
            Policy name
            <Input
              id="lifecycle-policy-name"
              value={name}
              required
              maxLength={160}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <label
            htmlFor="lifecycle-policy-description"
            className="grid min-w-0 content-start gap-1.5 text-sm font-medium"
          >
            Policy
            <Textarea
              id="lifecycle-policy-description"
              rows={10}
              value={description}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>
          <HrDrawerActions>
            <Button type="submit" disabled={busy}>
              {busy ? "Saving…" : editor === "new" ? "Create policy" : "Save changes"}
            </Button>
          </HrDrawerActions>
        </WorkForm>
      </HrRecordDrawer>

      <HrRecordDrawer
        title={opened?.name ?? "Lifecycle policy"}
        description="Lifecycle policy details"
        open={!!opened && editor === null}
        busy={busy}
        error={opened && !editor ? error : undefined}
        notice={opened && !editor ? notice : undefined}
        onClose={() => {
          setOpenedId("");
          setDecision(null);
        }}
      >
        {opened ? (
          <div className="grid min-w-0 gap-4">
            <HrDetailSummary code={opened.code} status={opened.status} statusLabel={statusLabel[opened.status]}>
              Version {opened.version}
            </HrDetailSummary>
            <HrDetailSection title="Policy">
              {opened.description ? (
                <p className="m-0! whitespace-pre-wrap text-[13.5px] leading-relaxed wrap-anywhere">
                  {opened.description}
                </p>
              ) : (
                <HrDetailNote>No policy text yet.</HrDetailNote>
              )}
            </HrDetailSection>
            <HrDetailList>
              <HrDetailTile label="Policy name" value={opened.name} />
              <HrDetailTile label="Code" value={opened.code} mono />
              <HrDetailTile label="Status" value={statusLabel[opened.status]} />
            </HrDetailList>
            {(opened.status === "pending_approval" || opened.status === "approved") &&
            opened.self_decision_requires_override &&
            opened.super_admin_override_allowed &&
            workflow.length ? (
              <SuperAdminOverrideWarning />
            ) : null}
            {blockedBySelfReview && workflow.length ? (
              <Alert variant="destructive">
                <AlertDescription>A different HR approver must decide on this policy.</AlertDescription>
              </Alert>
            ) : null}
            <HrDetailAudit items={[{ label: "Created", value: hrDisplayDate(opened.effective_from) }]} />
            {decision ? (
              <WorkForm
                className="grid min-w-0 gap-3"
                aria-label={decisionLabel[decision]}
                onSubmit={(event) => {
                  event.preventDefault();
                  void decide(opened, decision);
                }}
              >
                <label
                  htmlFor="lifecycle-policy-decision-reason"
                  className="grid min-w-0 content-start gap-1.5 text-sm font-medium"
                >
                  Reason
                  <Textarea
                    id="lifecycle-policy-decision-reason"
                    rows={2}
                    maxLength={1000}
                    value={reason}
                    disabled={busy}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
                <HrDrawerActions>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={busy}>
                    {busy ? "Saving…" : decisionLabel[decision]}
                  </Button>
                </HrDrawerActions>
              </WorkForm>
            ) : (
              <HrDrawerActions>
                {canManage ? (
                  <HrConfirmDeleteButton
                    label={isDraft ? `Delete ${opened.code}` : "Only drafts can be deleted"}
                    title={`Delete ${opened.code}?`}
                    description="Only unused drafts can be deleted. The deletion is kept in the audit trail and the code is not reused."
                    variant="outline"
                    disabled={busy || !isDraft}
                    onConfirm={() => deletePolicy(opened)}
                  />
                ) : null}
                {canManage ? (
                  <HrEditButton
                    label={isDraft ? `Edit ${opened.code}` : "Only drafts can be edited"}
                    disabled={busy || !isDraft}
                    onClick={() => openEditor(opened)}
                  />
                ) : null}
                {canDeactivate ? (
                  <Button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setError("");
                      setReason("");
                      setDecision("deactivate");
                    }}
                  >
                    <Ban aria-hidden="true" />
                    Deactivate
                  </Button>
                ) : null}
                {workflow.map((action) => (
                  <Button
                    key={action}
                    type="button"
                    disabled={busy || blockedBySelfReview}
                    onClick={() => {
                      setError("");
                      setReason("");
                      setDecision(action);
                    }}
                  >
                    {decisionLabel[action]}
                  </Button>
                ))}
              </HrDrawerActions>
            )}
          </div>
        ) : null}
      </HrRecordDrawer>
    </section>
  );
}
