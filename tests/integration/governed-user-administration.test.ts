import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SecurityAdministrationError,
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../apps/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function actor(userId: string): AuthenticatedAccount {
  return {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions: [],
    sessionVersion: 1,
  };
}

function context(userId: string, correlationId: string): SecurityActorContext {
  return { tenantId: sourceTestTenantId, actor: actor(userId), correlationId };
}

run("governed user administration", () => {
  const suffix = randomUUID();
  const username = `governed.user.${suffix}`;
  const email = `${username}@uat.nexora.invalid`;
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;
  let createdUserId = "";
  let deliveredPassword = "";

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("creates, submits, and independently approves a user atomically", async () => {
    const request = await repository.createUserRequest(
      context("r06.maker", `user-create-${suffix}`),
      {
        requested_action: "create",
        proposal: {
          display_name: "Governed User",
          username,
          email,
          employee_id: null,
          companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
          initial_role_policy_ids: [],
        },
      },
      `create-user-${suffix}`,
    );
    expect(request.replayed).toBe(false);
    const requestId = request.entity_id;

    const submitted = await repository.actOnUserRequest(
      context("r06.maker", `user-submit-${suffix}`),
      { action: "submit", request_id: requestId, expected_version: 1 },
      `submit-user-${suffix}`,
    );
    expect(submitted.projection.approval_state).toBe("completed");

    const approved = await repository.decideApproval(
      context("r06.checker", `user-approve-${suffix}`),
      {
        resource_type: "user",
        request_id: requestId,
        decision: "approved",
        reason: null,
        expected_version: 2,
      },
      `approve-user-${suffix}`,
    );
    expect(approved.entity_type).toBe("user_account");
    expect("credential_delivery_available" in approved && approved.credential_delivery_available).toBe(true);
    if ("credential_delivery" in approved && approved.credential_delivery) {
      expect(approved.credential_delivery.one_time_password).toHaveLength(32);
      deliveredPassword = approved.credential_delivery.one_time_password;
    }
    createdUserId = approved.entity_id;

    const account = await pool.query<{
      status: string;
      username: string;
      must_change_password: boolean;
      credential_status: string;
      company_count: string;
      default_count: string;
    }>(
      `select account.status,credential.username,credential.must_change_password,
              credential.credential_status,
              (select count(*)::text from security_user_company_access access
                where access.tenant_id=account.tenant_id and access.user_id=account.id
                  and access.revoked_at is null) as company_count,
              (select count(*)::text from security_user_company_access access
                where access.tenant_id=account.tenant_id and access.user_id=account.id
                  and access.revoked_at is null and access.is_default) as default_count
         from security_user_account account
         join security_password_credential credential
           on credential.tenant_id=account.tenant_id and credential.user_id=account.id
        where account.tenant_id=$1 and account.id=$2`,
      [sourceTestTenantId, createdUserId],
    );
    expect(account.rows[0]).toEqual({
      status: "active",
      username,
      must_change_password: true,
      credential_status: "reset_required",
      company_count: "1",
      default_count: "1",
    });

    const replay = await repository.decideApproval(
      context("r06.checker", `user-approve-replay-${suffix}`),
      {
        resource_type: "user",
        request_id: requestId,
        decision: "approved",
        reason: null,
        expected_version: 2,
      },
      `approve-user-${suffix}`,
    );
    expect(replay.replayed).toBe(true);
    expect("credential_delivery_available" in replay && replay.credential_delivery_available).toBe(false);
    expect(JSON.stringify(replay)).not.toContain("one_time_password");
  });

  it("lists safe user projections and enforces exact permissions", async () => {
    const users = await repository.listUsers(context("r06.maker", `user-list-${suffix}`), {
      search: username,
      limit: 25,
    });
    expect(users.items).toHaveLength(1);
    expect(users.items[0]).toMatchObject({ id: createdUserId, username, status: "active" });
    const detail = await repository.getUser(context("r06.maker", `user-detail-${suffix}`), createdUserId);
    expect(detail).toMatchObject({ id: createdUserId, must_change_password: true });
    expect(JSON.stringify(detail)).not.toContain("argon2");

    await expect(
      repository.createUserRequest(
        context("r06.restricted", `user-denied-${suffix}`),
        {
          requested_action: "archive",
          target_user_id: createdUserId,
          expected_user_version: 1,
          proposal: { reason: "Unauthorized test" },
        },
        `denied-user-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<SecurityAdministrationError>);
  });

  it("locks a target immediately, audits it, and protects the last administrator", async () => {
    const locked = await repository.actOnUserEmergency(
      context("r06.maker", `user-lock-${suffix}`),
      {
        action: "lock",
        target_user_id: createdUserId,
        expected_user_version: 1,
        reason: "Synthetic UAT compromise response",
      },
      `lock-user-${suffix}`,
    );
    expect(locked.credential_delivery_available).toBe(false);
    expect(locked.projection.new_state).toMatchObject({ status: "locked", row_version: "2" });

    const adminVersion = await pool.query<{ row_version: string }>(
      `select row_version from security_user_account where tenant_id=$1 and id='r06.last-admin-b'`,
      [sourceTestTenantId],
    );
    await expect(
      repository.actOnUserEmergency(
        context("r06.maker", `last-admin-lock-${suffix}`),
        {
          action: "lock",
          target_user_id: "r06.last-admin-b",
          expected_user_version: Number(adminVersion.rows[0]?.row_version),
          reason: "Last administrator protection test",
        },
        `last-admin-lock-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "LAST_ADMINISTRATOR_PROTECTED" });

    const evidence = await pool.query<{ action: string; entity_id: string; result_projection: unknown }>(
      `select command.operation as action,event.entity_id,command.result_projection
         from security_administration_command command
         join security_audit_event event
           on event.tenant_id=command.tenant_id and event.id=command.audit_event_id
        where command.tenant_id=$1 and command.idempotency_key=$2`,
      [sourceTestTenantId, `lock-user-${suffix}`],
    );
    expect(evidence.rows[0]).toMatchObject({
      action: "security.user_account.lock",
      entity_id: createdUserId,
    });
    expect(JSON.stringify(evidence.rows[0])).not.toContain(deliveredPassword);
    expect(JSON.stringify(evidence.rows[0])).not.toContain("credential_delivery");
  });

  it("governs unlock, identity edit, password reset, and archive through independent approval", async () => {
    async function approveChange(
      request: Parameters<SourceSecurityAdministrationRepository["createUserRequest"]>[1],
      operation: string,
    ) {
      const created = await repository.createUserRequest(
        context("r06.maker", `${operation}-create-${suffix}`),
        request,
        `${operation}-create-${suffix}`,
      );
      await repository.actOnUserRequest(
        context("r06.maker", `${operation}-submit-${suffix}`),
        { action: "submit", request_id: created.entity_id, expected_version: 1 },
        `${operation}-submit-${suffix}`,
      );
      return repository.decideApproval(
        context("r06.checker", `${operation}-approve-${suffix}`),
        {
          resource_type: "user",
          request_id: created.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `${operation}-approve-${suffix}`,
      );
    }

    await approveChange(
      {
        requested_action: "unlock",
        target_user_id: createdUserId,
        expected_user_version: 2,
        proposal: {},
      },
      "user-unlock",
    );
    await approveChange(
      {
        requested_action: "edit",
        target_user_id: createdUserId,
        expected_user_version: 3,
        proposal: {
          display_name: "Governed User Updated",
          username: `updated.${suffix}`,
          email: `updated.${suffix}@uat.nexora.invalid`,
        },
      },
      "user-edit",
    );
    const reset = await approveChange(
      {
        requested_action: "reset_password",
        target_user_id: createdUserId,
        expected_user_version: 4,
        proposal: { reason: "Controlled password reset" },
      },
      "user-reset",
    );
    expect("credential_delivery_available" in reset && reset.credential_delivery_available).toBe(true);
    await approveChange(
      {
        requested_action: "archive",
        target_user_id: createdUserId,
        expected_user_version: 5,
        proposal: { reason: "Controlled lifecycle close" },
      },
      "user-archive",
    );
    const state = await pool.query<{
      status: string;
      row_version: string;
      session_version: string;
      active_companies: string;
      credential_status: string;
    }>(
      `select account.status,account.row_version,account.session_version,
              credential.credential_status,
              (select count(*)::text from security_user_company_access access
                where access.tenant_id=account.tenant_id and access.user_id=account.id
                  and access.revoked_at is null) as active_companies
         from security_user_account account
         join security_password_credential credential
           on credential.tenant_id=account.tenant_id and credential.user_id=account.id
        where account.tenant_id=$1 and account.id=$2`,
      [sourceTestTenantId, createdUserId],
    );
    expect(state.rows[0]).toMatchObject({
      status: "inactive",
      row_version: "6",
      session_version: "5",
      active_companies: "0",
      credential_status: "reset_required",
    });
    const archivedDetail = await repository.getUser(context("r06.maker", `archive-detail-${suffix}`), createdUserId);
    expect(archivedDetail.archived_at).toBeTruthy();
    const currentUsers = await repository.listUsers(context("r06.maker", `archive-current-${suffix}`), {
      limit: 100,
      archived: false,
      search: `updated.${suffix}`,
    });
    const deletedUsers = await repository.listUsers(context("r06.maker", `archive-deleted-${suffix}`), {
      limit: 100,
      archived: true,
      search: `updated.${suffix}`,
    });
    expect(currentUsers.items).toHaveLength(0);
    expect(deletedUsers.items.map((item) => item.id)).toEqual([createdUserId]);
    expect(deletedUsers.items[0]?.archived_at).toBeTruthy();
    await approveChange(
      {
        requested_action: "company_access",
        target_user_id: createdUserId,
        expected_user_version: 6,
        proposal: {
          companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
        },
      },
      "user-restore-company",
    );
    await approveChange(
      {
        requested_action: "activate",
        target_user_id: createdUserId,
        expected_user_version: 7,
        proposal: {},
      },
      "user-reactivate",
    );
    const reactivated = await pool.query<{
      status: string;
      row_version: string;
      session_version: string;
      active_companies: string;
    }>(
      `select account.status,account.row_version,account.session_version,
              (select count(*)::text from security_user_company_access access
                where access.tenant_id=account.tenant_id and access.user_id=account.id
                  and access.revoked_at is null) as active_companies
         from security_user_account account
        where account.tenant_id=$1 and account.id=$2`,
      [sourceTestTenantId, createdUserId],
    );
    expect(reactivated.rows[0]).toEqual({
      status: "active",
      row_version: "8",
      session_version: "6",
      active_companies: "1",
    });
    const restoredUsers = await repository.listUsers(context("r06.maker", `archive-restored-${suffix}`), {
      limit: 100,
      archived: false,
      search: `updated.${suffix}`,
    });
    expect(restoredUsers.items[0]?.archived_at).toBeNull();
  });

  it("enforces maker-checker, rejection reasons, and idempotent request retries", async () => {
    const proposal = {
      requested_action: "create" as const,
      proposal: {
        display_name: "Idempotent User",
        username: `idempotent.${suffix}`,
        email: `idempotent.${suffix}@uat.nexora.invalid`,
        employee_id: null,
        companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
        initial_role_policy_ids: [],
      },
    };
    const created = await repository.createUserRequest(
      context("r06.last-admin-b", `maker-checker-create-${suffix}`),
      proposal,
      `maker-checker-create-${suffix}`,
    );
    const replay = await repository.createUserRequest(
      context("r06.last-admin-b", `maker-checker-create-replay-${suffix}`),
      proposal,
      `maker-checker-create-${suffix}`,
    );
    expect(replay).toMatchObject({ command_id: created.command_id, replayed: true });
    await expect(
      repository.createUserRequest(
        context("r06.last-admin-b", `maker-checker-create-conflict-${suffix}`),
        { ...proposal, proposal: { ...proposal.proposal, display_name: "Changed payload" } },
        `maker-checker-create-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });

    await repository.actOnUserRequest(
      context("r06.last-admin-b", `maker-checker-submit-${suffix}`),
      { action: "submit", request_id: created.entity_id, expected_version: 1 },
      `maker-checker-submit-${suffix}`,
    );
    await expect(
      repository.decideApproval(
        context("r06.last-admin-b", `maker-checker-self-approve-${suffix}`),
        {
          resource_type: "user",
          request_id: created.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `maker-checker-self-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "MAKER_CHECKER_VIOLATION" });
    await expect(
      repository.decideApproval(
        context("r06.checker", `maker-checker-reject-reason-${suffix}`),
        {
          resource_type: "user",
          request_id: created.entity_id,
          decision: "rejected",
          reason: null,
          expected_version: 2,
        },
        `maker-checker-reject-reason-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 400, code: "DECISION_REASON_REQUIRED" });
    const rejected = await repository.decideApproval(
      context("r06.checker", `maker-checker-reject-${suffix}`),
      {
        resource_type: "user",
        request_id: created.entity_id,
        decision: "rejected",
        reason: "Controlled UAT rejection",
        expected_version: 2,
      },
      `maker-checker-reject-${suffix}`,
    );
    expect(rejected).toMatchObject({ outcome: "rejected", credential_delivery_available: false });
    const account = await pool.query("select 1 from security_user_account where tenant_id=$1 and email=$2", [
      sourceTestTenantId,
      proposal.proposal.email,
    ]);
    expect(account.rowCount).toBe(0);
  });

  it("rejects foreign-company expansion and conflicting initial roles without partial state", async () => {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("alter table organization_unit no force row level security");
      await client.query(
        `insert into tenant (id,name,plan,region,status,default_locale)
         values ('r06-foreign-tenant','Foreign UAT','enterprise','uat-isolated','active','en-US')
         on conflict (id) do nothing`,
      );
      await client.query(
        `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
         values ('r06-foreign-company','r06-foreign-tenant',null,'company','FOREIGN','Foreign Company','active')
         on conflict (tenant_id,id) do nothing`,
      );
      await client.query("alter table organization_unit force row level security");
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }

    await expect(
      repository.createUserRequest(
        context("r06.maker", `foreign-company-${suffix}`),
        {
          requested_action: "create",
          proposal: {
            display_name: "Foreign Company User",
            username: `foreign.${suffix}`,
            email: `foreign.${suffix}@uat.nexora.invalid`,
            employee_id: null,
            companies: [{ company_id: "r06-foreign-company", is_default: true }],
            initial_role_policy_ids: [],
          },
        },
        `foreign-company-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "ADMINISTRATION_CONFLICT" });

    await expect(
      repository.createUserRequest(
        context("r06.last-admin-b", `sod-user-create-${suffix}`),
        {
          requested_action: "create",
          proposal: {
            display_name: "SoD User",
            username: `sod.${suffix}`,
            email: `sod.${suffix}@uat.nexora.invalid`,
            employee_id: null,
            companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
            initial_role_policy_ids: ["r06-uat-policy-maker", "r06-uat-policy-checker"],
          },
        },
        `sod-user-create-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "SOD_VIOLATION" });
    const sodAccount = await pool.query("select 1 from security_user_account where tenant_id=$1 and email=$2", [
      sourceTestTenantId,
      `sod.${suffix}@uat.nexora.invalid`,
    ]);
    expect(sodAccount.rowCount).toBe(0);
  });

  it("fails closed for user reads, actions, options, and approvals outside the actor company boundary", async () => {
    await pool.query(
      `insert into organization_unit (id,tenant_id,parent_id,type,code,name,status)
       values ('r06-isolated-company',$1,null,'company','R06-ISOLATED','R06 Isolated Company','active')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       values ('r06.isolated-user',$1,'r06-uat:r06.isolated-user',
               'r06.isolated-user@uat.nexora.invalid','active','disabled',now(),now(),'Isolated User')
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at)
       values ($1,'r06.isolated-user','r06.isolated-user','pbkdf2_sha256',310000,
               decode(repeat('03',16),'hex'),decode(repeat('04',32),'hex'),now())
       on conflict (tenant_id,user_id) do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       select $1,'r06-isolated-access','r06.isolated-user','r06-isolated-company',true,
              'r06.last-admin-a','governed_administration','controlled-test-fixture'
        where not exists (
          select 1 from security_user_company_access
           where tenant_id=$1 and user_id='r06.isolated-user'
             and company_id='r06-isolated-company' and revoked_at is null)
      `,
      [sourceTestTenantId],
    );

    const page = await repository.listUsers(context("r06.maker", `isolated-list-${suffix}`), {
      search: "r06.isolated-user",
      limit: 25,
    });
    expect(page.items).toHaveLength(0);
    await expect(
      repository.getUser(context("r06.maker", `isolated-detail-${suffix}`), "r06.isolated-user"),
    ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });
    const options = await repository.listUserOptions(context("r06.maker", `isolated-options-${suffix}`));
    expect(options.companies.map((company) => company.id)).not.toContain("r06-isolated-company");
    expect(options.employees.map((employee) => employee.id)).toEqual(
      expect.arrayContaining(["r06-uat-employee-target", "r06-uat-employee-candidate"]),
    );
    expect(options.roles.map((role) => role.policy_id)).toContain("r06-uat-policy-restricted");
    expect(options.roles.map((role) => role.policy_id)).not.toContain("r06-uat-policy-administrator");
    await expect(
      repository.createUserRequest(
        context("r06.maker", `higher-authority-denied-${suffix}`),
        {
          requested_action: "create",
          proposal: {
            display_name: "Higher Authority User",
            username: `higher.authority.${suffix}`,
            email: `higher.authority.${suffix}@uat.nexora.invalid`,
            employee_id: null,
            companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
            initial_role_policy_ids: ["r06-uat-policy-administrator"],
          },
        },
        `higher-authority-denied-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "DELEGATION_DENIED" });
    await expect(
      repository.createUserRequest(
        context("r06.maker", `employee-company-denied-${suffix}`),
        {
          requested_action: "create",
          proposal: {
            display_name: "Employee Boundary User",
            username: `employee.boundary.${suffix}`,
            email: `employee.boundary.${suffix}@uat.nexora.invalid`,
            employee_id: "r06-uat-employee-target",
            companies: [{ company_id: "nexora-r06-uat-company-two", is_default: true }],
            initial_role_policy_ids: [],
          },
        },
        `employee-company-denied-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" });
    await expect(
      repository.actOnUserEmergency(
        context("r06.maker", `isolated-lock-${suffix}`),
        {
          action: "lock",
          target_user_id: "r06.isolated-user",
          expected_user_version: 1,
          reason: "Boundary verification",
        },
        `isolated-lock-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });
    await expect(
      repository.createAssignmentRequest(
        context("r06.maker", `isolated-assignment-${suffix}`),
        {
          requested_action: "create",
          proposal: {
            target_user_id: "r06.isolated-user",
            role_policy_id: "r06-uat-policy-restricted",
            assignment_id: null,
            valid_from: new Date().toISOString(),
            valid_until: null,
            revocation_reason: null,
          },
        },
        `isolated-assignment-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });

    const request = await repository.createUserRequest(
      context("r06.last-admin-b", `isolated-create-${suffix}`),
      {
        requested_action: "create",
        proposal: {
          display_name: "Isolated Proposed User",
          username: `isolated.proposed.${suffix}`,
          email: `isolated.proposed.${suffix}@uat.nexora.invalid`,
          employee_id: null,
          companies: [{ company_id: "r06-isolated-company", is_default: true }],
          initial_role_policy_ids: [],
        },
      },
      `isolated-create-${suffix}`,
    );
    await repository.actOnUserRequest(
      context("r06.last-admin-b", `isolated-submit-${suffix}`),
      { action: "submit", request_id: request.entity_id, expected_version: 1 },
      `isolated-submit-${suffix}`,
    );
    await expect(
      repository.decideApproval(
        context("r06.checker", `isolated-approve-${suffix}`),
        {
          resource_type: "user",
          request_id: request.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `isolated-approve-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 403, code: "DELEGATION_DENIED" });
  });

  it("serializes concurrent approval and delivers a credential only once", async () => {
    const request = await repository.createUserRequest(
      context("r06.maker", `concurrent-user-create-${suffix}`),
      {
        requested_action: "create",
        proposal: {
          display_name: "Concurrent User",
          username: `concurrent.${suffix}`,
          email: `concurrent.${suffix}@uat.nexora.invalid`,
          employee_id: null,
          companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
          initial_role_policy_ids: [],
        },
      },
      `concurrent-user-create-${suffix}`,
    );
    await repository.actOnUserRequest(
      context("r06.maker", `concurrent-user-submit-${suffix}`),
      { action: "submit", request_id: request.entity_id, expected_version: 1 },
      `concurrent-user-submit-${suffix}`,
    );
    const decisions = await Promise.allSettled([
      repository.decideApproval(
        context("r06.checker", `concurrent-user-checker-${suffix}`),
        {
          resource_type: "user",
          request_id: request.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `concurrent-user-checker-${suffix}`,
      ),
      repository.decideApproval(
        context("r06.last-admin-b", `concurrent-user-admin-${suffix}`),
        {
          resource_type: "user",
          request_id: request.entity_id,
          decision: "approved",
          reason: null,
          expected_version: 2,
        },
        `concurrent-user-admin-${suffix}`,
      ),
    ]);
    expect(decisions.filter((decision) => decision.status === "fulfilled")).toHaveLength(1);
    expect(decisions.filter((decision) => decision.status === "rejected")).toHaveLength(1);
    const delivered = decisions
      .filter(
        (decision): decision is PromiseFulfilledResult<Awaited<ReturnType<typeof repository.decideApproval>>> =>
          decision.status === "fulfilled",
      )
      .filter(
        (decision) => "credential_delivery_available" in decision.value && decision.value.credential_delivery_available,
      );
    expect(delivered).toHaveLength(1);
    const accounts = await pool.query(
      "select count(*)::int as count from security_user_account where tenant_id=$1 and email=$2",
      [sourceTestTenantId, `concurrent.${suffix}@uat.nexora.invalid`],
    );
    expect(accounts.rows[0]?.count).toBe(1);
  });

  it("creates an employee-linked account only after approval and rejects a duplicate Employee Master link", async () => {
    const employeeId = `linked-employee-${suffix}`;
    const linkedUsername = `linked.${suffix}`;
    await pool.query(
      `insert into employee
        (id,tenant_id,employee_number,first_name,last_name,joined_on,status,created_by)
       values ($1,$2,$3,'Linked','Employee',date '2026-01-01','active','r06.last-admin-a')`,
      [employeeId, sourceTestTenantId, `LINK-${suffix.replaceAll("-", "").slice(0, 24).toUpperCase()}`],
    );
    await pool.query(
      `insert into employee_assignment
        (id,tenant_id,employee_id,company_id,branch_id,department_id,designation_id,
         job_grade_id,cost_center_id,work_location_id,employment_type_id,
         employee_category_id,effective_from,change_reason,created_by,assignment_status,source_reference)
       select $1,tenant_id,$2,company_id,branch_id,department_id,designation_id,
              job_grade_id,cost_center_id,work_location_id,employment_type_id,
              employee_category_id,effective_from,change_reason,created_by,assignment_status,'linked-account-test'
         from employee_assignment
        where tenant_id=$3 and id='r06-uat-assignment-r06-uat-employee-candidate'`,
      [`linked-assignment-${suffix}`, employeeId, sourceTestTenantId],
    );
    const draft = {
      requested_action: "create" as const,
      proposal: {
        display_name: "Linked Employee Account",
        username: linkedUsername,
        email: `${linkedUsername}@uat.nexora.invalid`,
        employee_id: employeeId,
        companies: [{ company_id: "nexora-r06-uat-company", is_default: true }],
        initial_role_policy_ids: [],
      },
    };
    const created = await repository.createUserRequest(
      context("r06.maker", `linked-create-${suffix}`),
      draft,
      `linked-create-${suffix}`,
    );
    const beforeApproval = await pool.query(
      "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2",
      [sourceTestTenantId, employeeId],
    );
    expect(beforeApproval.rowCount).toBe(0);
    await repository.actOnUserRequest(
      context("r06.maker", `linked-submit-${suffix}`),
      { action: "submit", request_id: created.entity_id, expected_version: 1 },
      `linked-submit-${suffix}`,
    );
    const approved = await repository.decideApproval(
      context("r06.checker", `linked-approve-${suffix}`),
      { resource_type: "user", request_id: created.entity_id, decision: "approved", reason: null, expected_version: 2 },
      `linked-approve-${suffix}`,
    );
    const detail = await repository.getUser(context("r06.maker", `linked-detail-${suffix}`), approved.entity_id);
    expect(detail).toMatchObject({
      display_name: "Linked Employee Account",
      username: linkedUsername,
      employee_linked: true,
      employee: { id: employeeId },
    });
    const options = await repository.listUserOptions(context("r06.maker", `linked-options-${suffix}`));
    expect(options.employees.some((employee) => employee.id === employeeId)).toBe(false);
    await expect(
      repository.createUserRequest(
        context("r06.maker", `duplicate-link-${suffix}`),
        {
          ...draft,
          proposal: {
            ...draft.proposal,
            username: `duplicate.${suffix}`,
            email: `duplicate.${suffix}@uat.nexora.invalid`,
          },
        },
        `duplicate-link-${suffix}`,
      ),
    ).rejects.toMatchObject({ status: 409, code: "ADMINISTRATION_CONFLICT" });
  });
});
