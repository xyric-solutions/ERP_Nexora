"use client";
import { HrDrawerActions } from "../components/hr-drawer-context";
import { HrEmploymentPolicyUpgrades } from "./hr-employment-policy-upgrades";

import { useEffect, useMemo, useState } from "react";

import type { HrEmploymentLifecyclePolicyDirectory } from "@nexora/contracts";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";

import { HrApiClient } from "../api/hr-client";
import { HrRecordDrawer } from "../components/hr-record-drawer";

type LoadState = "loading" | "ready" | "error";

function policyVariant(status: HrEmploymentLifecyclePolicyDirectory["items"][number]["status"]) {
  return status === "active" ? "secondary" : status === "inactive" ? "outline" : "default";
}

/** Policy drafts can be submitted, but independent approval and activation remain separate capabilities. */
export function HrLifecyclePoliciesWorkspace() {
  const { api, csrfToken, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [policies, setPolicies] = useState<HrEmploymentLifecyclePolicyDirectory["items"]>([]);
  const [state, setState] = useState<LoadState>("loading");
  const code = "AUTO";
  const [name, setName] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [saving, setSaving] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [submissionReason, setSubmissionReason] = useState("");
  const [submittingPolicyId, setSubmittingPolicyId] = useState("");
  const [approvalReason, setApprovalReason] = useState("");
  const [approvingPolicyId, setApprovingPolicyId] = useState("");
  const [activationReason, setActivationReason] = useState("");
  const [activatingPolicyId, setActivatingPolicyId] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [actionPolicy, setActionPolicy] = useState<HrEmploymentLifecyclePolicyDirectory["items"][number] | null>(null);
  const actionBusy = Boolean(submittingPolicyId || approvingPolicyId || activatingPolicyId);
  const openAction = (policy: HrEmploymentLifecyclePolicyDirectory["items"][number]) => {
    setError("");
    setSubmissionReason("");
    setApprovalReason("");
    setActivationReason("");
    setActionPolicy(policy);
  };
  const canReadPolicies = session?.user.permissions.includes("hr.employment_lifecycle_policy.read") ?? false;
  const canManagePolicies = session?.user.permissions.includes("hr.employment_lifecycle_policy.manage") ?? false;
  const canApprovePolicies = session?.user.permissions.includes("hr.employment_lifecycle_policy.approve") ?? false;

  useEffect(() => {
    if (sessionLoading || !canReadPolicies) return;
    let active = true;
    client
      .companies()
      .then((result) => {
        if (!active) return;
        setCompanies(result.items);
        if (!result.items.length) setState("ready");
        setCompanyId((current) =>
          result.items.some((company) => company.id === current) ? current : (result.items[0]?.id ?? ""),
        );
      })
      .catch(() => {
        if (active) setState("error");
      });
    return () => {
      active = false;
    };
  }, [canReadPolicies, client, sessionLoading, refreshKey]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    client
      .employmentLifecyclePolicies({ companyId, limit: 50 })
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
  }, [client, companyId, refreshKey]);

  const createPolicy = async () => {
    if (!companyId || !code.trim() || !name.trim() || !effectiveFrom) {
      setError("Choose a company and provide a policy code, name, and effective date.");
      return;
    }
    setSaving(true);
    setError("");
    setNotice("");
    try {
      const result = await client.createEmploymentLifecyclePolicy(
        { company_id: companyId, code: code.trim().toUpperCase(), name: name.trim(), effective_from: effectiveFrom },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(
        `${result.code} v${result.version} was created as a draft with the standard Hire, confirmation and exit definitions.`,
      );
      setName("");
      setEffectiveFrom("");
      setCreateOpen(false);
      setState("loading");
      setRefreshKey((current) => current + 1);
    } catch {
      setError("The policy could not be created. Check its code, company scope, and your lifecycle-policy permission.");
    } finally {
      setSaving(false);
    }
  };

  const submitPolicy = async (policyId: string, policyCode: string) => {
    if (!submissionReason.trim()) {
      setError("Provide a submission reason before sending a lifecycle policy for independent approval.");
      return;
    }
    setSubmittingPolicyId(policyId);
    setError("");
    setNotice("");
    try {
      const result = await client.submitEmploymentLifecyclePolicy(
        policyId,
        { reason: submissionReason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(
        `${result.code} is pending independent approval. It is not active and cannot govern employee transitions.`,
      );
      setSubmissionReason("");
      setActionPolicy(null);
      setState("loading");
      setRefreshKey((current) => current + 1);
    } catch {
      setError(
        `Unable to submit ${policyCode}. Confirm it is still a draft in your company scope and that you have manage permission.`,
      );
    } finally {
      setSubmittingPolicyId("");
    }
  };

  const approvePolicy = async (policyId: string, policyCode: string) => {
    if (!approvalReason.trim()) {
      setError("Provide an approval reason before independently approving a lifecycle policy.");
      return;
    }
    const policy = policies.find((item) => item.id === policyId);
    if (policy?.self_decision_requires_override && !policy.super_admin_override_allowed) {
      setError(`A different HR approver must approve ${policyCode}.`);
      return;
    }
    setApprovingPolicyId(policyId);
    setError("");
    setNotice("");
    try {
      const result = await client.approveEmploymentLifecyclePolicy(
        policyId,
        { reason: approvalReason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${result.code} is approved but remains inactive until the separate activation step is completed.`);
      setApprovalReason("");
      setActionPolicy(null);
      setState("loading");
      setRefreshKey((current) => current + 1);
    } catch {
      setError(`Unable to approve ${policyCode}. Check its current state, your access, and maker/checker authority.`);
    } finally {
      setApprovingPolicyId("");
    }
  };

  const activatePolicy = async (policyId: string, policyCode: string) => {
    if (!activationReason.trim()) {
      setError("Provide an activation reason before activating an approved policy.");
      return;
    }
    const policy = policies.find((item) => item.id === policyId);
    if (policy?.self_decision_requires_override && !policy.super_admin_override_allowed) {
      setError(`A different HR approver must activate ${policyCode}.`);
      return;
    }
    setActivatingPolicyId(policyId);
    setError("");
    setNotice("");
    try {
      const result = await client.activateEmploymentLifecyclePolicy(
        policyId,
        { reason: activationReason.trim() },
        csrfToken(),
        crypto.randomUUID(),
      );
      setNotice(`${result.code} is now active. This does not create or activate any employee.`);
      setActivationReason("");
      setActionPolicy(null);
      setState("loading");
      setRefreshKey((current) => current + 1);
    } catch {
      setError(
        `Unable to activate ${policyCode}. It must be approved, effective today, and have no overlapping active company policy.`,
      );
    } finally {
      setActivatingPolicyId("");
    }
  };

  if (sessionLoading) return <Skeleton className="h-32 w-full" />;
  if (!canReadPolicies)
    return (
      <Alert>
        <AlertTitle>Lifecycle policy access required</AlertTitle>
        <AlertDescription>This screen requires the employment lifecycle policy read permission.</AlertDescription>
      </Alert>
    );

  return (
    <section
      className="grid min-w-0 grid-cols-1 gap-4 [&_.overflow-x-auto]:relative [&_button.bg-primary]:text-primary-foreground!"
      aria-label="Employment lifecycle policies"
    >
      <Alert>
        <AlertTitle>Employment lifecycle policies</AlertTitle>
        <AlertDescription>
          Policies define legal employment transitions. Draft authoring and submission are controlled here; independent
          approval and activation remain separate workflow steps.
        </AlertDescription>
      </Alert>
      {notice && (
        <Alert>
          <AlertTitle>Draft lifecycle policy created</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Lifecycle policy action unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="flex min-w-0 flex-wrap items-end gap-3 rounded-lg border border-border bg-card p-3 shadow-sm">
        <label className="grid content-start min-w-0 basis-full gap-1.5 text-sm font-medium sm:basis-64 sm:flex-1">
          Company
          <select
            className="h-9 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-sm"
            value={companyId}
            onChange={(event) => {
              setState("loading");
              setPolicies([]);
              setCompanyId(event.target.value);
            }}
            disabled={state === "loading" || !companies.length}
          >
            {!companies.length && (
              <option value="">
                {state === "loading"
                  ? "Loading authorized companies…"
                  : state === "error"
                    ? "Companies could not be loaded"
                    : "No authorized companies"}
              </option>
            )}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name} ({company.code})
              </option>
            ))}
          </select>
        </label>
        {canManagePolicies && (
          <Button
            type="button"
            disabled={state !== "ready" || !companyId || actionBusy}
            onClick={() => {
              setError("");
              setCreateOpen(true);
            }}
          >
            + Create draft policy
          </Button>
        )}
      </div>
      {state === "loading" && <Skeleton className="h-32 w-full" />}
      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Lifecycle policies unavailable</AlertTitle>
          <AlertDescription>
            Authorized companies or policies could not be loaded. Retry the request; if your access has changed, sign in
            again.
          </AlertDescription>
          <Button
            type="button"
            variant="outline"
            className="mt-3"
            onClick={() => {
              setState("loading");
              setRefreshKey((v) => v + 1);
            }}
          >
            Retry companies and policies
          </Button>
        </Alert>
      )}
      {state === "ready" && !companies.length && (
        <Alert>
          <AlertTitle>No company access</AlertTitle>
          <AlertDescription>
            No companies are assigned to your account. Ask your administrator to review company access.
          </AlertDescription>
        </Alert>
      )}
      {state === "ready" && companies.length > 0 && (
        <div className="grid min-w-0 grid-cols-1 gap-4">
          <div className="min-w-0 w-full overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-3">Policy</th>
                  <th className="px-4 py-3">Version</th>
                  <th className="px-4 py-3">Effective period</th>
                  <th className="px-4 py-3">Status</th>
                  {(canManagePolicies || canApprovePolicies) && <th className="px-4 py-3">Action</th>}
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr className="border-b border-border/70 last:border-0" key={policy.id}>
                    <td className="px-4 py-3">
                      <p className="font-medium">{policy.name}</p>
                      <p className="text-xs text-muted-foreground">{policy.code}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{policy.version}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {policy.effective_from} to {policy.effective_to ?? "Open-ended"}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={policyVariant(policy.status)}>{policy.status.replaceAll("_", " ")}</Badge>
                    </td>
                    {(canManagePolicies || canApprovePolicies) && (
                      <td className="px-4 py-3">
                        {policy.status === "draft" && canManagePolicies ? (
                          <Button size="sm" type="button" onClick={() => openAction(policy)} disabled={actionBusy}>
                            {submittingPolicyId === policy.id ? "Submitting..." : "Submit"}
                          </Button>
                        ) : policy.status === "pending_approval" && canApprovePolicies ? (
                          <div className="grid min-w-72 gap-2">
                            {policy.self_decision_requires_override && policy.super_admin_override_allowed ? (
                              <SuperAdminOverrideWarning />
                            ) : null}
                            {policy.self_decision_requires_override && !policy.super_admin_override_allowed ? (
                              <Alert variant="destructive">
                                <AlertTitle>Independent approver required</AlertTitle>
                                <AlertDescription>
                                  You created or submitted this policy and cannot approve it.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Button size="sm" type="button" onClick={() => openAction(policy)} disabled={actionBusy}>
                                {approvingPolicyId === policy.id ? "Approving..." : "Approve"}
                              </Button>
                            )}
                          </div>
                        ) : policy.status === "approved" && canApprovePolicies ? (
                          <div className="grid min-w-72 gap-2">
                            {policy.self_decision_requires_override && policy.super_admin_override_allowed ? (
                              <SuperAdminOverrideWarning />
                            ) : null}
                            {policy.self_decision_requires_override && !policy.super_admin_override_allowed ? (
                              <Alert variant="destructive">
                                <AlertTitle>Independent activator required</AlertTitle>
                                <AlertDescription>
                                  You created or submitted this policy and cannot activate it.
                                </AlertDescription>
                              </Alert>
                            ) : (
                              <Button size="sm" type="button" onClick={() => openAction(policy)} disabled={actionBusy}>
                                {activatingPolicyId === policy.id ? "Activating..." : "Activate"}
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">No action available</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {policies.length === 0 && (
                  <tr>
                    <td
                      className="px-4 py-8 text-center text-muted-foreground"
                      colSpan={canManagePolicies || canApprovePolicies ? 5 : 4}
                    >
                      No lifecycle policy is configured for this company.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <HrRecordDrawer
        title={
          actionPolicy?.status === "draft"
            ? "Submit lifecycle policy"
            : actionPolicy?.status === "pending_approval"
              ? "Approve lifecycle policy"
              : "Activate lifecycle policy"
        }
        description="Review the selected policy and record a reason for this separate audited decision."
        open={Boolean(actionPolicy)}
        busy={actionBusy}
        error={error}
        onClose={() => setActionPolicy(null)}
      >
        {actionPolicy && (
          <form
            className="grid min-w-0 gap-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (actionBusy) return;
              if (actionPolicy.status === "draft") void submitPolicy(actionPolicy.id, actionPolicy.code);
              else if (actionPolicy.status === "pending_approval")
                void approvePolicy(actionPolicy.id, actionPolicy.code);
              else if (actionPolicy.status === "approved") void activatePolicy(actionPolicy.id, actionPolicy.code);
            }}
          >
            <div className="grid gap-1 wrap-anywhere">
              <p className="font-semibold">{actionPolicy.name}</p>
              <p className="text-sm text-muted-foreground">
                {actionPolicy.code} · Version {actionPolicy.version}
              </p>
              <p className="text-sm text-muted-foreground">
                {companies.find((company) => company.id === companyId)?.name}
              </p>
            </div>
            {actionPolicy.self_decision_requires_override &&
            actionPolicy.super_admin_override_allowed &&
            actionPolicy.status !== "draft" ? (
              <SuperAdminOverrideWarning />
            ) : null}
            <label htmlFor="lifecycle-policy-action-reason" className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
              {actionPolicy.status === "draft"
                ? "Submission reason"
                : actionPolicy.status === "pending_approval"
                  ? "Approval reason"
                  : "Activation reason"}
              <Input
                id="lifecycle-policy-action-reason"
                required
                maxLength={1000}
                disabled={actionBusy}
                value={
                  actionPolicy.status === "draft"
                    ? submissionReason
                    : actionPolicy.status === "pending_approval"
                      ? approvalReason
                      : activationReason
                }
                onChange={(event) => {
                  if (actionPolicy.status === "draft") setSubmissionReason(event.target.value);
                  else if (actionPolicy.status === "pending_approval") setApprovalReason(event.target.value);
                  else setActivationReason(event.target.value);
                }}
              />
            </label>
            <p className="text-sm text-muted-foreground">
              {actionPolicy.status === "draft"
                ? "Submission sends this draft for independent approval and cannot activate it."
                : actionPolicy.status === "pending_approval"
                  ? "Approval remains separate from activation. Maker/checker restrictions still apply."
                  : "Activation requires an approved policy effective today, with no overlapping active company policy."}
            </p>
            <Button
              type="submit"
              disabled={
                actionBusy ||
                (actionPolicy.status !== "draft" &&
                  actionPolicy.self_decision_requires_override &&
                  !actionPolicy.super_admin_override_allowed)
              }
            >
              {actionBusy
                ? "Saving…"
                : actionPolicy.status === "draft"
                  ? "Submit policy"
                  : actionPolicy.status === "pending_approval"
                    ? "Approve policy"
                    : "Activate policy"}
            </Button>
          </form>
        )}
      </HrRecordDrawer>
      <HrRecordDrawer
        title="Create draft lifecycle policy"
        description="Create the draft without leaving the lifecycle-policy register. Submission and activation remain separate governed actions."
        open={createOpen}
        busy={saving}
        error={error}
        notice={notice}
        onClose={() => setCreateOpen(false)}
      >
        <div className="grid gap-4">
          <label htmlFor="lifecycle-policy-code" className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
            Policy code (automatic)
            <Input
              id="lifecycle-policy-code"
              value="Assigned on save · LCP-001…"
              readOnly
              maxLength={32}
              placeholder="HR-LIFECYCLE"
            />
          </label>
          <label htmlFor="lifecycle-policy-name" className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
            Policy name
            <Input
              id="lifecycle-policy-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={160}
              placeholder="Standard employment lifecycle"
            />
          </label>
          <label htmlFor="lifecycle-policy-effectiveFrom" className="grid content-start min-w-0 gap-1.5 text-sm font-medium">
            Effective from
            <Input
              id="lifecycle-policy-effectiveFrom"
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </label>
          <HrDrawerActions>
            <Button type="button" onClick={() => void createPolicy()} disabled={saving}>
              {saving ? "Creating…" : "Create draft policy"}
            </Button>
          </HrDrawerActions>
        </div>
      </HrRecordDrawer>
      <HrEmploymentPolicyUpgrades key={companyId} companyId={companyId} policyRevision={refreshKey} />
    </section>
  );
}
