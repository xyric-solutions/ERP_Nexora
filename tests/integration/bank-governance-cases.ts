import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import type {
  BankPaymentDetail,
  BankPaymentMutationResult,
  BankWorkflowOptions,
  BankWorkflowOptionQuery,
  DecideBankPaymentRequest,
  ReassignBankApproverRequest,
} from "@nexora/contracts";
import type { DatabasePool } from "../../packages/db/src/index.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import { SourceBankSelfApprovalRepository } from "../../server/api/src/modules/security/bank-self-approval-repository.js";
import type { BankWorkflowContext } from "../../server/api/src/modules/banking/workflow-context.js";
type Detail = Pick<
  BankPaymentDetail,
  | "id"
  | "company_id"
  | "state"
  | "version"
  | "approver_user_id"
  | "delegated_decision_id"
  | "delegated_self_approval_allowed"
  | "journal_id"
  | "approver_history"
>;
interface Repository {
  get(context: BankingActorContext, id: string): Promise<Detail>;
  submit(
    context: BankingActorContext,
    id: string,
    input: { expected_version: number },
    key: string,
    correlation: string,
  ): Promise<BankPaymentMutationResult>;
  decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankPaymentRequest,
    key: string,
    correlation: string,
  ): Promise<BankPaymentMutationResult>;
  reassign(
    context: BankingActorContext,
    id: string,
    input: ReassignBankApproverRequest,
    key: string,
    correlation: string,
  ): Promise<BankPaymentMutationResult>;
  post(
    context: BankingActorContext,
    id: string,
    input: { expected_version: number },
    key: string,
    correlation: string,
  ): Promise<BankPaymentMutationResult>;
  workflowOptions(context: BankingActorContext, query: BankWorkflowOptionQuery): Promise<BankWorkflowOptions>;
}
interface Fixture {
  pool: DatabasePool;
  kind: "payment" | "receipt";
  company: string;
  repository: Repository;
  maker: BankingActorContext;
  checker: BankingActorContext;
  poster: BankingActorContext;
  admin: BankingActorContext;
  create(context: BankingActorContext, fields: BankWorkflowContext): Promise<BankPaymentMutationResult>;
}
const key = () => randomUUID();
export function registerBankGovernanceCases(fixture: () => Fixture) {
  it("saves a draft in a closed period but rejects submission without changing financial state or audit history", async () => {
    const { pool, repository, maker, company, kind, create } = fixture();
    // Only this suite's randomly named company is touched, never the source UAT company.
    expect(company).toMatch(/^(payment|receipt)-company-[a-f0-9]+$/);
    const periods = await pool.query<{ id: string; status: string }>(
      "select id,status from financial_period where tenant_id=$1 and company_id=$2",
      [maker.tenantId, company],
    );
    expect(periods.rows).toHaveLength(1);
    const period = periods.rows[0]!;
    try {
      await pool.query("update financial_period set status='closed' where tenant_id=$1 and company_id=$2 and id=$3", [
        maker.tenantId,
        company,
        period.id,
      ]);
      const draft = await create(maker, { approver_user_id: "r06.checker" });
      const read = () =>
        pool.query(
          `select h.state,h.row_version::integer as version,h.original_journal_entry_id,
          (select count(*)::integer from bank_${kind}_event e where e.tenant_id=h.tenant_id and e.${kind}_id=h.id) as events
          from bank_${kind} h where h.tenant_id=$1 and h.company_id=$2 and h.id=$3`,
          [maker.tenantId, company, draft.id],
        );
      const before = await read();
      expect(before.rows).toEqual([
        { state: "draft", version: draft.version, original_journal_entry_id: null, events: 1 },
      ]);
      await expect(
        repository.submit(maker, draft.id, { expected_version: draft.version }, key(), key()),
      ).rejects.toMatchObject({ status: 409, code: `${kind.toUpperCase()}_PERIOD_LOCKED` });
      expect((await read()).rows).toEqual(before.rows);
      expect((await repository.get(maker, draft.id)).state).toBe("draft");
    } finally {
      await pool.query("update financial_period set status=$4 where tenant_id=$1 and company_id=$2 and id=$3", [
        maker.tenantId,
        company,
        period.id,
        period.status,
      ]);
    }
  });
  async function prepare() {
    const f = fixture(),
      { pool, kind, company } = f,
      tenant = f.maker.tenantId;
    const permissions = ["security.bank_self_approval.read", "security.bank_self_approval.manage"];
    const policies = await pool.query<{ id: string }>(
      `select distinct p.id from security_user_role_assignment_version a join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id
      join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id where a.tenant_id=$1 and a.user_id=$2 and r.role_code='super_administrator' and a.lifecycle_state='active'`,
      [tenant, f.admin.actor.userId],
    );
    expect(policies.rows.length).toBeGreaterThan(0);
    for (const policy of policies.rows)
      for (const permission of permissions) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy.id, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy.id, permission, company],
        );
      }
    const maker = {
      ...f.maker,
      actor: { ...f.maker.actor, permissions: [...f.maker.actor.permissions, `banking.${kind}.approve`] },
    };
    const admin = {
      ...f.admin,
      actor: { ...f.admin.actor, permissions: [...f.admin.actor.permissions, ...permissions] },
    };
    return { ...f, tenant, maker, admin, grants: new SourceBankSelfApprovalRepository(pool) };
  }
  async function setGrant(f: Awaited<ReturnType<typeof prepare>>, state: "active" | "revoked") {
    const page = await f.grants.list(f.admin, {
      company_id: f.company,
      transaction_kind: f.kind,
      user_id: f.maker.actor.userId,
      history: "false",
      limit: 1,
    });
    const previous = page.items[0];
    if (previous?.state === state) return previous;
    return (
      await f.grants.change(
        f.admin,
        {
          company_id: f.company,
          transaction_kind: f.kind,
          user_id: f.maker.actor.userId,
          state,
          expected_version: previous?.version ?? 0,
          reason: "Synthetic governed Bank approval test",
        },
        key(),
        key(),
      )
    ).record;
  }
  it("enforces explicit grant permission, live global/company authority, versions and immutable grant history", async () => {
    const f = await prepare(),
      { grants, admin, maker, company, kind, tenant, pool } = f;
    await expect(grants.options(maker, { transaction_kind: kind, limit: 50 })).rejects.toMatchObject({ status: 403 });
    await expect(
      grants.options(
        { ...maker, actor: { ...maker.actor, roles: ["super_administrator"], permissions: admin.actor.permissions } },
        { company_id: company, transaction_kind: kind, limit: 50 },
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      grants.list(admin, { company_id: "outside-company", transaction_kind: kind, history: "false", limit: 10 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      grants.options({ ...admin, impersonationRequestId: "synthetic" }, { transaction_kind: kind, limit: 50 }),
    ).rejects.toMatchObject({ status: 403 });
    const permissionless = {
      ...admin,
      actor: {
        ...admin.actor,
        permissions: admin.actor.permissions.filter((p) => p !== "security.bank_self_approval.manage"),
      },
    };
    const input = {
      company_id: company,
      transaction_kind: kind,
      user_id: maker.actor.userId,
      state: "active" as const,
      expected_version: 0,
      reason: "Synthetic permission regression",
    };
    await expect(grants.change(permissionless, input, key(), key())).rejects.toMatchObject({ status: 403 });
    const retry = key(),
      first = await grants.change(admin, input, retry, key());
    expect(first.record.version).toBe(1);
    expect((await grants.change(admin, input, retry, key())).replayed).toBe(true);
    await expect(grants.change(admin, { ...input, reason: "Different operation" }, retry, key())).rejects.toMatchObject(
      { code: "BANK_GRANT_IDEMPOTENCY_CONFLICT" },
    );
    await expect(grants.change(admin, { ...input, state: "revoked" }, key(), key())).rejects.toMatchObject({
      code: "BANK_GRANT_VERSION_CONFLICT",
    });
    const revoked = await setGrant(f, "revoked");
    expect(revoked.version).toBe(2);
    const history = await grants.list(admin, {
      company_id: company,
      transaction_kind: kind,
      user_id: maker.actor.userId,
      history: "true",
      limit: 1,
    });
    expect(history.items).toHaveLength(1);
    expect(history.next_cursor).toBeTruthy();
    const next = await grants.list(admin, {
      company_id: company,
      transaction_kind: kind,
      user_id: maker.actor.userId,
      history: "true",
      limit: 1,
      cursor: history.next_cursor!,
    });
    expect(next.items[0]?.version).toBe(2);
    await expect(
      grants.list(admin, {
        company_id: company,
        transaction_kind: kind,
        user_id: maker.actor.userId,
        history: "false",
        limit: 1,
        cursor: history.next_cursor!,
      }),
    ).rejects.toMatchObject({ code: "BANK_GRANT_CURSOR_INVALID" });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await expect(
        client.query("delete from bank_self_approval_grant_version where tenant_id=$1 and id=$2", [tenant, revoked.id]),
      ).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("requires an active kind/company grant for self-selection and records exact delegated decision evidence without posting", async () => {
    const f = await prepare(),
      { repository, maker, checker, admin, kind, company, tenant, pool } = f;
    await expect(f.create(maker, { approver_user_id: maker.actor.userId })).rejects.toMatchObject({
      code: "BANK_APPROVER_INELIGIBLE",
    });
    const grant = await setGrant(f, "active");
    const options = await repository.workflowOptions(maker, { company_id: company, kind: "approver", limit: 100 });
    expect(options.items.find((item) => item.id === maker.actor.userId)?.self_approval).toBe(true);
    const created = await f.create(maker, { approver_user_id: maker.actor.userId }),
      submitted = await repository.submit(maker, created.id, { expected_version: created.version }, key(), key());
    await expect(
      repository.decide(checker, created.id, { action: "approve", expected_version: submitted.version }, key(), key()),
    ).rejects.toMatchObject({ code: "BANK_ASSIGNED_CHECKER_REQUIRED" });
    const approved = await repository.decide(
      maker,
      created.id,
      { action: "approve", expected_version: submitted.version },
      key(),
      key(),
    );
    const detail = await repository.get(maker, created.id);
    expect(detail.delegated_decision_id).toBeTruthy();
    expect(detail.journal_id).toBeNull();
    const evidence = await pool.query(
      `select e.grant_version::integer,e.user_id,e.created_by,e.submitted_by,e.decision_action,b.approval_override_event_id from bank_delegated_decision e join bank_${kind} b on b.tenant_id=e.tenant_id and b.id=e.${kind}_id where e.tenant_id=$1 and e.id=$2`,
      [tenant, detail.delegated_decision_id],
    );
    expect(evidence.rows).toEqual([
      {
        grant_version: grant.version,
        user_id: maker.actor.userId,
        created_by: maker.actor.userId,
        submitted_by: maker.actor.userId,
        decision_action: "approve",
        approval_override_event_id: null,
      },
    ]);
    await setGrant(f, "revoked");
    // Historical approval remains valid after grant revocation; posting remains independent.
    await expect(
      repository.post(maker, created.id, { expected_version: approved.version }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    const posted = await repository.post(f.poster, created.id, { expected_version: approved.version }, key(), key());
    expect(posted.state).toBe("posted");
    expect((await repository.get(admin, created.id)).delegated_decision_id).toBe(detail.delegated_decision_id);
    await setGrant(f, "active");
    const rejectedDraft = await f.create(maker, { approver_user_id: maker.actor.userId });
    const rejectedSubmission = await repository.submit(maker, rejectedDraft.id, { expected_version: 1 }, key(), key());
    const rejected = await repository.decide(
      maker,
      rejectedDraft.id,
      { action: "reject", expected_version: rejectedSubmission.version, reason: "Synthetic delegated rejection" },
      key(),
      key(),
    );
    expect(rejected.state).toBe("rejected");
    const rejectedDetail = await repository.get(maker, rejectedDraft.id);
    expect(
      (
        await pool.query("select decision_action from bank_delegated_decision where tenant_id=$1 and id=$2", [
          tenant,
          rejectedDetail.delegated_decision_id,
        ])
      ).rows,
    ).toEqual([{ decision_action: "reject" }]);
    await setGrant(f, "revoked");
  });
  it("serializes a governed grant revocation ahead of a waiting self-decision", async () => {
    const f = await prepare(),
      grant = await setGrant(f, "active"),
      { pool, tenant, repository, maker, admin, company, kind } = f;
    const created = await f.create(maker, { approver_user_id: maker.actor.userId }),
      submitted = await repository.submit(maker, created.id, { expected_version: 1 }, key(), key());
    const blocker = await pool.connect();
    let revoke: Promise<unknown> | undefined, decision: Promise<unknown> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`nexora:security:admin:${tenant}`]);
      revoke = f.grants
        .change(
          admin,
          {
            company_id: company,
            transaction_kind: kind,
            user_id: maker.actor.userId,
            state: "revoked",
            expected_version: grant.version,
            reason: "Synthetic concurrent grant revocation",
          },
          key(),
          key(),
        )
        .catch((error: unknown) => error);
      await expect
        .poll(
          async () =>
            (
              await pool.query<{ n: number }>(
                "select count(*)::integer n from pg_stat_activity where $1=any(pg_blocking_pids(pid))",
                [blocker.processID],
              )
            ).rows[0]?.n,
        )
        .toBeGreaterThan(0);
      decision = repository
        .decide(maker, created.id, { action: "approve", expected_version: submitted.version }, key(), key())
        .catch((error: unknown) => error);
      await expect
        .poll(
          async () =>
            (
              await pool.query<{ n: number }>(
                "select count(*)::integer n from pg_stat_activity where $1=any(pg_blocking_pids(pid))",
                [blocker.processID],
              )
            ).rows[0]?.n,
        )
        .toBeGreaterThan(1);
      await blocker.query("commit");
      expect(await revoke).toMatchObject({ record: { state: "revoked" } });
      expect(await decision).toMatchObject({ status: 403 });
      expect((await repository.get(maker, created.id)).state).toBe("submitted");
    } finally {
      await blocker.query("rollback");
      blocker.release();
      await Promise.all([revoke, decision]);
    }
  });
  it("permits only audited versioned global reassignment, including recovery from a revoked assigned checker", async () => {
    const f = await prepare(),
      { repository, maker, checker, admin, company, kind, pool, tenant } = f;
    const created = await f.create(maker, { approver_user_id: checker.actor.userId }),
      submitted = await repository.submit(maker, created.id, { expected_version: 1 }, key(), key());
    const input = { approver_user_id: admin.actor.userId, expected_version: submitted.version };
    await expect(repository.reassign(checker, created.id, input, key(), key())).rejects.toMatchObject({ status: 403 });
    await expect(
      repository.reassign({ ...admin, impersonationRequestId: "synthetic" }, created.id, input, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-checker' and permission_key=$2 and scope_kind='company' and scope_value=$3",
      [tenant, `banking.${kind}.approve`, company],
    );
    let reassigned: BankPaymentMutationResult;
    const retry = key();
    try {
      reassigned = await repository.reassign(admin, created.id, input, retry, key());
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-checker',$2,'company',$3) on conflict do nothing",
        [tenant, `banking.${kind}.approve`, company],
      );
    }
    expect(reassigned.state).toBe("submitted");
    expect(reassigned.version).toBe(submitted.version + 1);
    expect((await repository.reassign(admin, created.id, input, retry, key())).replayed).toBe(true);
    await expect(
      repository.reassign(
        admin,
        created.id,
        { approver_user_id: checker.actor.userId, expected_version: submitted.version },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const detail = await repository.get(maker, created.id);
    expect(detail.approver_history).toEqual([
      expect.objectContaining({
        previous_user_id: checker.actor.userId,
        assigned_user_id: admin.actor.userId,
        actor_id: admin.actor.userId,
        version: reassigned.version,
      }),
    ]);
    await expect(
      repository.decide(checker, created.id, { action: "approve", expected_version: reassigned.version }, key(), key()),
    ).rejects.toMatchObject({ code: "BANK_ASSIGNED_CHECKER_REQUIRED" });
    expect(
      (
        await repository.decide(
          admin,
          created.id,
          { action: "approve", expected_version: reassigned.version },
          key(),
          key(),
        )
      ).state,
    ).toBe("approved");
    expect((await repository.get(admin, created.id)).journal_id).toBeNull();
  });
  it("does not treat inactive users or a grant for another kind/company as eligible", async () => {
    const f = await prepare();
    await setGrant(f, "active");
    expect(
      (
        await f.pool.query<{ allowed: boolean }>("select bank_can_self_approve($1,$2,$3,$4) allowed", [
          f.tenant,
          f.company,
          f.maker.actor.userId,
          f.kind === "payment" ? "receipt" : "payment",
        ])
      ).rows[0]?.allowed,
    ).toBe(false);
    expect(
      (
        await f.pool.query<{ allowed: boolean }>("select bank_can_self_approve($1,'outside-company',$2,$3) allowed", [
          f.tenant,
          f.maker.actor.userId,
          f.kind,
        ])
      ).rows[0]?.allowed,
    ).toBe(false);
    await f.pool.query(
      "update security_user_account set status='inactive',updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
      [f.tenant, f.maker.actor.userId],
    );
    try {
      expect(
        (await f.grants.options(f.admin, { company_id: f.company, transaction_kind: f.kind, limit: 100 })).users.map(
          (item) => item.id,
        ),
      ).not.toContain(f.maker.actor.userId);
    } finally {
      await f.pool.query(
        "update security_user_account set status='active',updated_at=clock_timestamp() where tenant_id=$1 and id=$2",
        [f.tenant, f.maker.actor.userId],
      );
    }
    await setGrant(f, "revoked");
  });
  it("serializes concurrent reassignment/decision and rejects direct assignment tampering", async () => {
    const f = await prepare(),
      { repository, maker, checker, admin, pool, tenant, kind } = f;
    const created = await f.create(maker, { approver_user_id: checker.actor.userId }),
      submitted = await repository.submit(maker, created.id, { expected_version: 1 }, key(), key());
    const outcomes = await Promise.allSettled([
      repository.reassign(
        admin,
        created.id,
        { approver_user_id: admin.actor.userId, expected_version: submitted.version },
        key(),
        key(),
      ),
      repository.decide(checker, created.id, { action: "approve", expected_version: submitted.version }, key(), key()),
    ]);
    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const client = await pool.connect();
    try {
      await client.query("begin");
      await expect(
        client.query(
          `update bank_${kind} set approver_user_id=$3,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and id=$2`,
          [tenant, created.id, maker.actor.userId],
        ),
      ).rejects.toMatchObject({ code: expect.stringMatching(/^(23514|P0001)$/) });
    } finally {
      await client.query("rollback");
      client.release();
    }
    const rls = await pool.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where relname=any($1::text[])",
      [["bank_self_approval_grant_version", "bank_delegated_decision", "bank_approver_reassignment"]],
    );
    expect(rls.rows).toHaveLength(3);
    expect(rls.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });
}
