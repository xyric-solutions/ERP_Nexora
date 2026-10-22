"use client";
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
      setCode("");
      setName("");
      setEffectiveFrom("");
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
      className="grid min-w-0 gap-4 [&_.overflow-x-auto]:relative [&_button.bg-primary]:text-primary-foreground!"
      aria-label="Employment lifecycle policies"
    >
      <p className="rounded-lg border border-border bg-card p-3 text-sm text-muted-foreground">
        New policy drafts include Hire, employment confirmation, resignation and termination transitions. Existing
        approved policies retain their original definitions; unsupported transitions remain blocked until a governed
        policy upgrade.
      </p>
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
                  Creates pre-employment, employed, confirmed and ended states, with independently approved Hire,
                  confirmation and exit transitions.
                </p>
              </div>
              <label htmlFor="lifecycle-policy-code" className="grid min-w-0 gap-1.5 text-sm font-medium">
                Policy code
                <Input
                  id="lifecycle-policy-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={32}
                  placeholder="HR-LIFECYCLE"
                />
              </label>
              <label htmlFor="lifecycle-policy-name" className="grid min-w-0 gap-1.5 text-sm font-medium">
                Policy name
                <Input
                  id="lifecycle-policy-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  placeholder="Standard employment lifecycle"
                />
              </label>
              <label htmlFor="lifecycle-policy-effectiveFrom" className="grid min-w-0 gap-1.5 text-sm font-medium">
                Effective from
                <Input
                  id="lifecycle-policy-effectiveFrom"
                  type="date"
                  value={effectiveFrom}
                  onChange={(event) => setEffectiveFrom(event.target.value)}
                />
              </label>
              <Button type="button" onClick={() => void createPolicy()} disabled={saving}>
                {saving ? "Creating…" : "Create draft policy"}
              </Button>
              <label
                htmlFor="lifecycle-policy-submissionReason"
                className="grid min-w-0 gap-1.5 border-t pt-3 text-sm font-medium"
              >
                Submission reason
                <Input
                  id="lifecycle-policy-submissionReason"
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
              <label htmlFor="lifecycle-policy-approvalReason" className="grid min-w-0 gap-1.5 text-sm font-medium">
                Approval reason
                <Input
                  id="lifecycle-policy-approvalReason"
                  value={approvalReason}
                  onChange={(event) => setApprovalReason(event.target.value)}
                  maxLength={1000}
                  placeholder="Reason for approval"
                />
              </label>
              <label htmlFor="lifecycle-policy-activationReason" className="grid min-w-0 gap-1.5 text-sm font-medium">
                Activation reason
                <Input
                  id="lifecycle-policy-activationReason"
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
      <HrEmploymentPolicyUpgrades key={companyId} companyId={companyId} policyRevision={refreshKey} />
    </section>
  );
}
