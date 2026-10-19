"use client";

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
  const [code, setCode] = useState("");
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
  }, [canReadPolicies, client, sessionLoading]);

  useEffect(() => {
    if (!companyId) return;
    let active = true;
    setState("loading");
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
      setNotice(`${result.code} v${result.version} was created as a draft with the standard initial hire definition.`);
      setCode("");
      setName("");
      setEffectiveFrom("");
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
    <section className="grid min-w-0 gap-4" aria-label="Employment lifecycle policies">
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
      <label className="grid max-w-xl gap-1.5 rounded-lg border border-border bg-card p-3 text-sm font-medium shadow-sm">
        Company
        <select
          className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
          value={companyId}
          onChange={(event) => setCompanyId(event.target.value)}
          disabled={state === "loading"}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name} ({company.code})
            </option>
          ))}
        </select>
      </label>
      {state === "loading" && <Skeleton className="h-32 w-full" />}
      {state === "error" && (
        <Alert variant="destructive">
          <AlertTitle>Lifecycle policies unavailable</AlertTitle>
          <AlertDescription>
            No mock policy data is shown when the authorized API data cannot be loaded.
          </AlertDescription>
        </Alert>
      )}
      {state === "ready" && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,.6fr)]">
          <div className="overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
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
                          <Button
                            size="sm"
                            type="button"
                            onClick={() => void submitPolicy(policy.id, policy.code)}
                            disabled={submittingPolicyId === policy.id || !submissionReason.trim()}
                          >
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
                              <Button
                                size="sm"
                                type="button"
                                onClick={() => void approvePolicy(policy.id, policy.code)}
                                disabled={approvingPolicyId === policy.id || !approvalReason.trim()}
                              >
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
                              <Button
                                size="sm"
                                type="button"
                                onClick={() => void activatePolicy(policy.id, policy.code)}
                                disabled={activatingPolicyId === policy.id || !activationReason.trim()}
                              >
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
          {canManagePolicies && (
            <aside className="grid content-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
              <div>
                <h2 className="font-semibold">Create draft policy</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Creates fixed pre-employment and employed states plus an approval-required hire transition.
                </p>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Policy code
                <Input
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={32}
                  placeholder="HR-LIFECYCLE"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Policy name
                <Input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  placeholder="Standard employment lifecycle"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Effective from
                <Input type="date" value={effectiveFrom} onChange={(event) => setEffectiveFrom(event.target.value)} />
              </label>
              <Button type="button" onClick={() => void createPolicy()} disabled={saving}>
                {saving ? "Creating…" : "Create draft policy"}
              </Button>
              <label className="grid gap-1.5 border-t pt-3 text-sm font-medium">
                Submission reason
                <Input
                  value={submissionReason}
                  onChange={(event) => setSubmissionReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Reason for independent review"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Enter a reason, then use Submit on a draft row. Submission cannot activate a policy.
                </span>
              </label>
            </aside>
          )}
          {canApprovePolicies && (
            <aside className="grid content-start gap-3 rounded-lg border border-border bg-card p-4 shadow-sm">
              <div>
                <h2 className="font-semibold">Independent approval</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Approval and activation are separate audited decisions. Self-decision requires the governed
                  super-admin override.
                </p>
              </div>
              <label className="grid gap-1.5 text-sm font-medium">
                Approval reason
                <Input
                  value={approvalReason}
                  onChange={(event) => setApprovalReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Reason for approval"
                />
              </label>
              <label className="grid gap-1.5 text-sm font-medium">
                Activation reason
                <Input
                  value={activationReason}
                  onChange={(event) => setActivationReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Reason for activation"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Activation is allowed only for an approved policy effective today.
                </span>
              </label>
            </aside>
          )}
        </div>
      )}
    </section>
  );
}
