import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

const overridePermissions = [
  "platform.approval.override",
  "security.authorization.role.approve",
  "security.user_account.approve",
  "security.access_review.approve",
  "security.delegation.approve",
  "security.impersonation.approve",
] as const;

function superAdminContext(correlationId: string): SecurityActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: "r06.override-admin",
    email: "override-admin@uat.nexora.invalid",
    displayName: "Override Administrator",
    roles: ["super_administrator"],
    permissions: overridePermissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, correlationId };
}

run("Security super-admin approval override integration", () => {
  const suffix = randomUUID().replaceAll("-", "");
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceSuperAdministratorFixture(pool);
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("records governed evidence for role and governed-user self-decisions", async () => {
    const context = superAdminContext(`security-override-core-${suffix}`);
    const role = await repository.createRole(
      context,
      {
        role_code: `override_${suffix.slice(0, 20)}`,
        display_name: "Approval override integration role",
        description: "Synthetic governed override evidence",
        permissions: ["security.authorization.audit.read"],
        scope: { mode: "tenant", company_ids: [] },
        field_rules: { allow: null, deny: [] },
        sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
        allowed_source_states: {},
        delegations: [],
      },
      `override-role-create-${suffix}`,
    );
    const submittedRole = await repository.actOnRole(
      context,
      { action: "submit", policy_id: role.entity_id, expected_version: 1 },
      `override-role-submit-${suffix}`,
    );
    const roleRequestId = String(submittedRole.projection.approval_reference);
    const approvedRole = await repository.decideApproval(
      context,
      {
        resource_type: "role",
        request_id: roleRequestId,
        decision: "approved",
        reason: "Approve the isolated integration role under governed override",
        expected_version: 1,
      },
      `override-role-approve-${suffix}`,
    );
    expect(approvedRole.projection.authorization).toMatchObject({ maker_checker_override: true });

    const userRequest = await repository.createUserRequest(
      context,
      {
        requested_action: "create",
        proposal: {
          display_name: "Override Integration User",
          username: `override.${suffix.slice(0, 18)}`,
          email: `override.${suffix.slice(0, 18)}@uat.nexora.invalid`,
          employee_id: null,
          companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
          initial_role_policy_ids: [],
        },
      },
      `override-user-create-${suffix}`,
    );
    await repository.actOnUserRequest(
      context,
      { action: "submit", request_id: userRequest.entity_id, expected_version: 1 },
      `override-user-submit-${suffix}`,
    );
    const approvedUser = await repository.decideApproval(
      context,
      {
        resource_type: "user",
        request_id: userRequest.entity_id,
        decision: "approved",
        reason: "Approve the isolated integration account under governed override",
        expected_version: 2,
      },
      `override-user-approve-${suffix}`,
    );
    expect(approvedUser.projection.authorization).toMatchObject({ maker_checker_override: true });

    const evidence = await pool.query<{ resource_type: string }>(
      `select resource_type from approval_override_event
        where tenant_id=$1 and resource_id=any($2::text[])
        order by resource_type`,
      [sourceTestTenantId, [roleRequestId, userRequest.entity_id]],
    );
    expect(evidence.rows).toEqual([
      { resource_type: "security.role_approval_request" },
      { resource_type: "security.user_change_request" },
    ]);
  });

  it("records governed evidence for access-review, delegation, and impersonation decisions", async () => {
    const context = superAdminContext(`security-override-surfaces-${suffix}`);
    const campaign = await repository.createAccessReviewCampaign(
      context,
      {
        name: `Override campaign ${suffix.slice(0, 8)}`,
        description: "Synthetic governed override evidence",
        company_ids: ["nexora-r06-uat-company"],
        reviewer_ids: ["r06.checker"],
        review_starts_at: new Date(Date.now() - 60_000).toISOString(),
        review_ends_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      `override-campaign-create-${suffix}`,
    );
    const submittedCampaign = await repository.actOnAccessReviewCampaign(
      context,
      { action: "submit", campaign_id: campaign.entity_id, expected_version: 1 },
      `override-campaign-submit-${suffix}`,
    );
    const approvedCampaign = await repository.actOnAccessReviewCampaign(
      context,
      {
        action: "approve",
        campaign_id: campaign.entity_id,
        expected_version: Number((submittedCampaign.projection.new_state as Record<string, unknown>).row_version),
        reason: "Approve the isolated access-review campaign under governed override",
      },
      `override-campaign-approve-${suffix}`,
    );
    expect(approvedCampaign.projection.authorization).toMatchObject({ maker_checker_override: true });

    const delegation = await repository.createDelegation(
      context,
      {
        delegatee_id: "r06.restricted",
        permission_key: "security.authorization.audit.read",
        scope_kind: "tenant",
        scope_value: sourceTestTenantId,
        valid_from: new Date(Date.now() - 60_000).toISOString(),
        valid_until: new Date(Date.now() + 86_400_000).toISOString(),
        reason: "Cover the isolated evidence review window",
      },
      `override-delegation-create-${suffix}`,
    );
    const submittedDelegation = await repository.actOnDelegation(
      context,
      { action: "submit", delegation_id: delegation.entity_id, expected_version: 1 },
      `override-delegation-submit-${suffix}`,
    );
    const approvedDelegation = await repository.actOnDelegation(
      context,
      {
        action: "approve",
        delegation_id: delegation.entity_id,
        expected_version: Number((submittedDelegation.projection.new_state as Record<string, unknown>).row_version),
        reason: "Approve the bounded delegation under governed override",
      },
      `override-delegation-approve-${suffix}`,
    );
    expect(approvedDelegation.projection.authorization).toMatchObject({ maker_checker_override: true });

    const impersonation = await repository.createImpersonation(
      context,
      { target_user_id: "r06.target", purpose: "Validate governed override evidence", duration_minutes: 5 },
      `override-impersonation-create-${suffix}`,
    );
    const submittedImpersonation = await repository.actOnImpersonation(
      context,
      { action: "submit", request_id: impersonation.entity_id, expected_version: 1 },
      `override-impersonation-submit-${suffix}`,
      `override-session-${suffix}`,
    );
    const approvedImpersonation = await repository.actOnImpersonation(
      context,
      {
        action: "approve",
        request_id: impersonation.entity_id,
        expected_version: Number((submittedImpersonation.projection.new_state as Record<string, unknown>).row_version),
        reason: "Approve the isolated impersonation request under governed override",
      },
      `override-impersonation-approve-${suffix}`,
      `override-session-${suffix}`,
    );
    expect(approvedImpersonation.projection.authorization).toMatchObject({ maker_checker_override: true });

    const evidence = await pool.query<{ resource_type: string }>(
      `select resource_type from approval_override_event
        where tenant_id=$1 and resource_id=any($2::text[])
        order by resource_type`,
      [sourceTestTenantId, [campaign.entity_id, delegation.entity_id, impersonation.entity_id]],
    );
    expect(evidence.rows).toEqual([
      { resource_type: "security.access_review_campaign" },
      { resource_type: "security.delegation" },
      { resource_type: "security.impersonation_request" },
    ]);
  });

  it("does not convert beneficiary self-service into an approval override", async () => {
    const context = superAdminContext(`security-override-beneficiary-${suffix}`);
    await expect(
      repository.createAssignmentRequest(
        context,
        {
          requested_action: "create",
          proposal: {
            target_user_id: context.actor.userId,
            role_policy_id: "r06-uat-policy-restricted",
            assignment_id: null,
            valid_from: new Date().toISOString(),
            valid_until: null,
            revocation_reason: null,
          },
        },
        `override-beneficiary-assignment-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "MAKER_CHECKER_VIOLATION" });
  });
});
