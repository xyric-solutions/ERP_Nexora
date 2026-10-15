import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../server/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const runtimeUrl = process.env.TEST_SOURCE_DATABASE_URL;
const ownerUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = runtimeUrl && ownerUrl ? describe : describe.skip;

run("C4 governed PostgreSQL authorization administration", () => {
  const tenantId = sourceTestTenantId;
  const suffix = randomUUID();
  const roleCode = `c4_${suffix.replaceAll("-", "").slice(0, 20)}`;
  let runtime: DatabasePool;
  let owner: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;
  let policyId = "";
  let assignmentId = "";

  const actor = (userId: string): AuthenticatedAccount => ({
    tenantId,
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions: [],
  });
  const context = (userId: string): SecurityActorContext => ({
    tenantId,
    actor: actor(userId),
    correlationId: `c4-test-${suffix}`,
  });

  beforeAll(async () => {
    runtime = createDatabasePool(runtimeUrl!);
    owner = createDatabasePool(ownerUrl!);
    await ensureSourceAuthorizationFixture(owner);
    repository = new SourceSecurityAdministrationRepository(runtime);
  });

  afterAll(async () => {
    await Promise.allSettled([runtime?.end(), owner?.end()]);
  });

  function track(result: { command_id: string; audit_event_id: string; projection: Record<string, unknown> }) {
    return result;
  }

  it("executes an idempotent maker/checker role and assignment lifecycle", async () => {
    const maker = context("r06.maker");
    const checker = context("r06.checker");
    const draft = {
      role_code: roleCode,
      display_name: "C4 governed test role",
      description: "Disposable final-root integration evidence",
      permissions: ["security.authorization.audit.read"],
      scope: { mode: "tenant" as const, company_ids: [] },
      field_rules: { allow: null, deny: [] },
      sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
      allowed_source_states: {},
      delegations: [],
    };
    const key = `c4-role-${suffix}`;
    const concurrent = await Promise.all([
      repository.createRole(maker, draft, key),
      repository.createRole(maker, draft, key),
    ]);
    expect(new Set(concurrent.map((result) => result.command_id))).toHaveLength(1);
    expect(concurrent.filter((result) => result.replayed)).toHaveLength(1);
    const created = track(concurrent.find((result) => !result.replayed)!);
    policyId = created.entity_id;
    await expect(repository.createRole(maker, { ...draft, display_name: "Changed" }, key)).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });

    const submitted = track(
      await repository.actOnRole(
        maker,
        { action: "submit", policy_id: policyId, expected_version: 1 },
        `c4-submit-${suffix}`,
      ),
    );
    const roleApproval = String(submitted.projection.approval_reference);
    await expect(
      repository.decideApproval(
        maker,
        { resource_type: "role", request_id: roleApproval, decision: "approved", reason: null, expected_version: 1 },
        `c4-maker-approve-${suffix}`,
      ),
    ).rejects.toBeInstanceOf(SecurityAdministrationError);
    track(
      await repository.decideApproval(
        checker,
        { resource_type: "role", request_id: roleApproval, decision: "approved", reason: null, expected_version: 1 },
        `c4-check-${suffix}`,
      ),
    );

    const approved = await repository.listRoles(maker, 0, 100, "approved");
    const row = approved.items.find((item) => item.policy_id === policyId)!;
    const activation = track(
      await repository.actOnRole(
        maker,
        { action: "request_activate", policy_id: policyId, expected_version: Number(row.row_version) },
        `c4-activate-${suffix}`,
      ),
    );
    const activateRequest = String(activation.projection.approval_reference);
    track(
      await repository.decideApproval(
        checker,
        { resource_type: "role", request_id: activateRequest, decision: "approved", reason: null, expected_version: 1 },
        `c4-activate-check-${suffix}`,
      ),
    );

    const request = track(
      await repository.createAssignmentRequest(
        maker,
        {
          requested_action: "create",
          proposal: {
            target_user_id: "r06.target",
            role_policy_id: policyId,
            assignment_id: null,
            valid_from: new Date().toISOString(),
            valid_until: null,
            revocation_reason: null,
          },
        },
        `c4-assignment-${suffix}`,
      ),
    );
    const assignmentRequest = request.entity_id;
    track(
      await repository.actOnAssignmentRequest(
        maker,
        { action: "submit", request_id: assignmentRequest, expected_version: 1 },
        `c4-assignment-submit-${suffix}`,
      ),
    );
    const applied = track(
      await repository.decideApproval(
        checker,
        {
          resource_type: "assignment",
          request_id: assignmentRequest,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `c4-assignment-check-${suffix}`,
      ),
    );
    assignmentId = applied.entity_id;

    const assigned = await repository.listAssignments(maker, 0, 100, "active", "r06.target");
    expect(assigned.items).toContainEqual(
      expect.objectContaining({ assignment_id: assignmentId, role_policy_id: policyId }),
    );
    const audit = await repository.listAudit(maker, 0, 100, "role_assignment", assignmentId);
    expect(audit.items).toContainEqual(
      expect.objectContaining({ action: "security.authorization.assignment.approve" }),
    );

    await expect(
      repository.createRole(
        maker,
        { ...draft, role_code: `${roleCode}_ceiling`, permissions: ["hr.employee.read"] },
        `c4-delegation-ceiling-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: "DELEGATION_DENIED" });

    const conflictingRole = track(
      await repository.createRole(
        maker,
        {
          ...draft,
          role_code: `${roleCode}_sod`,
          display_name: "C4 conflicting test role",
          sod_rules: { conflicting_roles: [roleCode], distinct_actor_fields: [] },
        },
        `c4-sod-role-${suffix}`,
      ),
    );
    const conflictingPolicyId = conflictingRole.entity_id;
    const conflictingSubmit = track(
      await repository.actOnRole(
        maker,
        { action: "submit", policy_id: conflictingPolicyId, expected_version: 1 },
        `c4-sod-submit-${suffix}`,
      ),
    );
    track(
      await repository.decideApproval(
        checker,
        {
          resource_type: "role",
          request_id: String(conflictingSubmit.projection.approval_reference),
          decision: "approved",
          reason: null,
          expected_version: 1,
        },
        `c4-sod-approve-${suffix}`,
      ),
    );
    const conflictingApproved = await repository.listRoles(maker, 0, 100, "approved");
    const conflictingRow = conflictingApproved.items.find((item) => item.policy_id === conflictingPolicyId)!;
    const conflictingActivation = track(
      await repository.actOnRole(
        maker,
        {
          action: "request_activate",
          policy_id: conflictingPolicyId,
          expected_version: Number(conflictingRow.row_version),
        },
        `c4-sod-activate-${suffix}`,
      ),
    );
    track(
      await repository.decideApproval(
        checker,
        {
          resource_type: "role",
          request_id: String(conflictingActivation.projection.approval_reference),
          decision: "approved",
          reason: null,
          expected_version: 1,
        },
        `c4-sod-activate-check-${suffix}`,
      ),
    );
    const sodRequest = track(
      await repository.createAssignmentRequest(
        maker,
        {
          requested_action: "create",
          proposal: {
            target_user_id: "r06.target",
            role_policy_id: conflictingPolicyId,
            assignment_id: null,
            valid_from: new Date().toISOString(),
            valid_until: null,
            revocation_reason: null,
          },
        },
        `c4-sod-assignment-${suffix}`,
      ),
    );
    track(
      await repository.actOnAssignmentRequest(
        maker,
        { action: "submit", request_id: sodRequest.entity_id, expected_version: 1 },
        `c4-sod-assignment-submit-${suffix}`,
      ),
    );
    await expect(
      repository.decideApproval(
        checker,
        {
          resource_type: "assignment",
          request_id: sodRequest.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `c4-sod-assignment-check-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: "SOD_VIOLATION" });
  }, 30_000);

  it("returns the entire real permission catalogue without an unusable continuation cursor", async () => {
    const expected = await owner.query<{ permission_key: string }>(
      "select permission_key from security_permission_definition where status='active' order by permission_key",
    );
    expect(expected.rows.length).toBeGreaterThan(100);
    const catalogue = await repository.listPermissions(context("r06.maker"));
    expect(catalogue.next_cursor).toBeNull();
    expect(catalogue.items.map((item) => item.permission_key)).toEqual(
      expected.rows.map((item) => item.permission_key),
    );
  });

  it("filters shared assignment, approval and audit records by user/role before pagination", async () => {
    const maker = context("r06.maker");
    const checker = context("r06.checker");
    const assignments = await repository.listAssignments(maker, 0, 100, undefined, "r06.target", policyId);
    expect(assignments.items).toContainEqual(expect.objectContaining({ assignment_id: assignmentId }));
    expect(assignments.items.every((row) => row.user_id === "r06.target" && row.role_policy_id === policyId)).toBe(
      true,
    );
    expect((await repository.listAssignments(maker, 0, 100, undefined, "r06.target", "foreign-policy")).items).toEqual(
      [],
    );
    const approvals = await repository.listApprovals(checker, "assignment", 0, 100, undefined, {
      userId: "r06.target",
      rolePolicyId: policyId,
    });
    expect(approvals.items.length).toBeGreaterThan(0);
    expect(approvals.items.every((row) => row.target_user_id === "r06.target" && row.role_policy_id === policyId)).toBe(
      true,
    );
    expect(
      (await repository.listApprovals(checker, "role", 0, 100, undefined, { userId: "r06.target" })).items,
    ).toEqual([]);
    expect(
      (await repository.listApprovals(checker, "user", 0, 100, undefined, { rolePolicyId: policyId })).items,
    ).toEqual([]);
    const userAudit = await repository.listAudit(maker, 0, 100, undefined, undefined, {
      workspace: "users",
      userId: "r06.target",
    });
    const roleAudit = await repository.listAudit(maker, 0, 100, undefined, undefined, {
      workspace: "roles",
      rolePolicyId: policyId,
    });
    expect(userAudit.items).toContainEqual(
      expect.objectContaining({ entity_type: "role_assignment", entity_id: assignmentId }),
    );
    expect(roleAudit.items).toContainEqual(
      expect.objectContaining({ entity_type: "role_assignment", entity_id: assignmentId }),
    );
    expect(roleAudit.items).toContainEqual(
      expect.objectContaining({ entity_type: "role_policy", entity_id: policyId }),
    );
    expect(roleAudit.items).toContainEqual(expect.objectContaining({ entity_type: "role_approval" }));
    expect(userAudit.items).toContainEqual(expect.objectContaining({ entity_type: "assignment_approval" }));
    expect((await repository.listAudit(maker, 0, 100, undefined, undefined, { userId: "foreign-user" })).items).toEqual(
      [],
    );
    expect(
      (await repository.listAudit(maker, 0, 100, undefined, undefined, { rolePolicyId: "foreign-policy" })).items,
    ).toEqual([]);
    const first = await repository.listAudit(maker, 0, 1, undefined, undefined, { rolePolicyId: policyId });
    expect(first.next_cursor).toBe("1");
    const second = await repository.listAudit(maker, 1, 1, undefined, undefined, { rolePolicyId: policyId });
    expect(second.items[0]?.id).not.toBe(first.items[0]?.id);
    await expect(
      repository.listAudit(context("r06.restricted"), 0, 10, undefined, undefined, { userId: "r06.target" }),
    ).rejects.toBeInstanceOf(SecurityAdministrationError);
  });

  it("round-trips complete draft restrictions through production role listings and permission edits", async () => {
    const maker = context("r06.maker");
    const draft = {
      role_code: `roundtrip_${suffix.replaceAll("-", "").slice(0, 20)}`,
      display_name: "Constrained round-trip role",
      description: "Preserve every restriction during checkbox editing",
      permissions: ["security.authorization.audit.read"],
      scope: { mode: "tenant" as const, company_ids: [] },
      field_rules: { allow: ["display_name"], deny: ["private_notes"] },
      sod_rules: { conflicting_roles: ["r06_uat_checker"], distinct_actor_fields: ["created_by"] },
      allowed_source_states: { "security.authorization.audit.read": ["active"] },
      delegations: [
        { permission: "security.authorization.audit.read", scope_kind: "tenant" as const, scope_value: tenantId },
      ],
    };
    const created = await repository.createRole(maker, draft, `roundtrip-create-${suffix}`);
    const listed = await repository.listRoles(maker, 0, 100, "draft");
    const row = listed.items.find((item) => item.policy_id === created.entity_id)!;
    expect(row.allowed_source_states).toEqual(draft.allowed_source_states);
    expect(row.delegations).toEqual(draft.delegations);
    await expect(
      repository.actOnRole(
        maker,
        {
          action: "edit",
          policy_id: created.entity_id,
          role_id: String(row.role_id),
          expected_version: Number(row.row_version),
          draft: { ...draft, permissions: ["security.authorization.audit.read", "security.authorization.role.read"] },
        },
        `roundtrip-denied-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: "DELEGATION_DENIED" });
    await repository.actOnRole(
      maker,
      {
        action: "edit",
        policy_id: created.entity_id,
        role_id: String(row.role_id),
        expected_version: Number(row.row_version),
        draft: {
          ...draft,
          permissions: ["security.authorization.audit.read", "security.authorization.permission.read"],
        },
      },
      `roundtrip-edit-${suffix}`,
    );
    const edited = (await repository.listRoles(maker, 0, 100, "draft")).items.find(
      (item) => item.policy_id === created.entity_id,
    )!;
    expect(edited.scope).toEqual(draft.scope);
    expect(edited.field_rules).toEqual(draft.field_rules);
    expect(edited.sod_rules).toEqual(draft.sod_rules);
    expect(edited.allowed_source_states).toEqual(draft.allowed_source_states);
    expect(edited.delegations).toEqual(draft.delegations);
    expect(edited.row_version).toBe("2");
  });

  it("fails closed for restricted and cross-tenant actors", async () => {
    await expect(repository.listRoles(context("r06.restricted"), 0, 10)).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    });
    await expect(
      repository.listRoles({ ...context("r06.maker"), tenantId: "nexora-r06-other" }, 0, 10),
    ).rejects.toMatchObject({ status: 403, code: "TENANT_ACCESS_DENIED" });
  });

  it("rolls back an approved request that would remove the last administrator", async () => {
    const maker = context("r06.maker");
    const checker = context("r06.checker");
    const assignments = await repository.listAssignments(maker, 0, 100, "active", "r06.last-admin-b");
    const administrator = assignments.items.find((item) => item.role_policy_id === "r06-uat-policy-administrator");
    expect(administrator).toBeTruthy();
    const request = await repository.createAssignmentRequest(
      maker,
      {
        requested_action: "revoke",
        proposal: {
          target_user_id: "r06.last-admin-b",
          role_policy_id: String(administrator!.role_policy_id),
          assignment_id: String(administrator!.assignment_id),
          valid_from: new Date(String(administrator!.valid_from)).toISOString(),
          valid_until: administrator!.valid_until ? new Date(String(administrator!.valid_until)).toISOString() : null,
          revocation_reason: "C4 transactional last-administrator verification",
        },
      },
      `c4-last-admin-${suffix}`,
    );
    await repository.actOnAssignmentRequest(
      maker,
      { action: "submit", request_id: request.entity_id, expected_version: 1 },
      `c4-last-admin-submit-${suffix}`,
    );
    await expect(
      repository.decideApproval(
        checker,
        {
          resource_type: "assignment",
          request_id: request.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `c4-last-admin-check-${suffix}`,
      ),
    ).rejects.toMatchObject({ code: "LAST_ADMINISTRATOR_PROTECTED" });
    const stillActive = await repository.listAssignments(maker, 0, 100, "active", "r06.last-admin-b");
    expect(stillActive.items).toContainEqual(expect.objectContaining({ assignment_id: administrator!.assignment_id }));
  });
});
