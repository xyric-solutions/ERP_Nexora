import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const suffix = randomUUID().slice(0, 8),
  company = `general-company-${suffix}`;
const actions = ["read", "create", "update", "submit", "approve", "status"];
const permissions = [...actions.map((action) => `finance.nominal.${action}`), "platform.approval.override"];
function context(id: string): FinanceNominalActorContext {
  return {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      userId: id,
      email: `${id}@example.invalid`,
      displayName: id,
      organizationName: "Synthetic Finance",
      roles: id === "r06.override-admin" ? ["super_administrator"] : ["banking_test"],
      permissions,
      sessionVersion: 1,
    },
  };
}
const maker = context("r06.override-admin"),
  checker = context("r06.checker"),
  key = () => randomUUID();
const types = ["asset", "liability", "equity", "revenue", "expense"] as const;
const input = (type: string, name = `Synthetic ${randomUUID()}`) => ({
  nominal_kind: "general" as const,
  company_id: company,
  category_id: `general-category-${type}-${suffix}`,
  section_id: `general-section-${type}-${suffix}`,
  name,
  currency: "USD",
});

run("Shared ordinary Finance nominal authority", () => {
  let pool: DatabasePool, repo: SourceFinanceNominalRepository;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    repo = new SourceFinanceNominalRepository(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    await pool.query(
      `insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic Finance','active')`,
      [sourceTestTenantId, company],
    );
    await ensureCompanyCurrencyFixture(pool, company, "USD", []);
    for (const type of types) {
      const item = input(type);
      await pool.query(
        `insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
    values($1,$2,$3,$3,$3,$5,null,true,'active',false,now()),($1,$2,$4,$4,$4,$5,$3,true,'active',false,now())`,
        [sourceTestTenantId, company, item.category_id, item.section_id, type],
      );
      await pool.query(
        `insert into finance_general_nominal_policy(tenant_id,company_id,category_id,section_id,prefix,code_width,next_value,last_value)
    values($1,$2,$3,$4,$5,4,1,9999)`,
        [sourceTestTenantId, company, item.category_id, item.section_id, `${type}-${suffix}-`],
      );
    }
    for (const actor of [maker, checker])
      await pool.query(
        `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
    values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','synthetic-general-nominal')`,
        [sourceTestTenantId, key(), actor.actor.userId, company],
      );
    for (const policy of ["r06-uat-policy-approval-override", "r06-uat-policy-checker"]) {
      const grants = [...permissions, "banking.payment.read", "banking.receipt.read"];
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
    select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing`,
        [sourceTestTenantId, policy, grants],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
    select $1,$2,p,'company',$3 from unnest($4::text[]) p on conflict do nothing`,
        [sourceTestTenantId, policy, company, grants],
      );
    }
  });
  afterAll(async () => {
    await pool?.end();
  });
  it.each(types)("creates %s nominals with Finance-only permissions, without a Bank capability", async (type) => {
    const request = input(type),
      requestKey = key();
    const created = await repo.create(maker, request, requestKey, key());
    expect(created).toMatchObject({ state: "active", version: 2, bank_account_id: null });
    expect(await repo.create(maker, request, requestKey, key())).toMatchObject({ ...created, replayed: true });
    const detail = await repo.get(maker, created.id);
    expect(detail).toMatchObject({ type, account_status: "active", state: "active", banking_available: false });
    expect(
      (
        await pool.query("select count(*) from bank_account where tenant_id=$1 and account_id=$2", [
          sourceTestTenantId,
          created.id,
        ])
      ).rows[0].count,
    ).toBe("0");
  });
  it("directly edits active masters, rejects ordinary users and retired submission, and feeds both Bank selectors", async () => {
    const created = await repo.create(maker, input("expense"), key(), key());
    const updated = await repo.update(
      maker,
      created.id,
      { expected_version: created.version, description: "Synthetic update" },
      key(),
      key(),
    );
    await expect(
      repo.update(checker, created.id, { expected_version: updated.version, description: "Forbidden" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.submit(maker, created.id, { expected_version: updated.version, reason: "Retired" }, key(), key()),
    ).rejects.toMatchObject({ status: 410 });
    const query = { company_id: company, search: created.code, limit: 100 };
    const bankActor = {
      ...maker,
      actor: { ...maker.actor, permissions: [...permissions, "banking.payment.read", "banking.receipt.read"] },
    };
    expect(
      (await new SourceBankPaymentRepository(pool).listNominalAccounts(bankActor, query)).items.map((a) => a.id),
    ).toContain(created.id);
    expect(
      (await new SourceBankReceiptRepository(pool).listNominalAccounts(bankActor, query)).items.map((a) => a.id),
    ).toContain(created.id);
    const active = await repo.get(maker, created.id);
    expect(active.events.map((e) => e.event_type)).toEqual(["updated", "activated", "created"]);
    await repo.changeStatus(
      maker,
      created.id,
      { expected_version: active.version!, action: "deactivate", reason: "Synthetic lifecycle" },
      key(),
      key(),
    );
    expect((await new SourceBankPaymentRepository(pool).listNominalAccounts(bankActor, query)).items).toHaveLength(0);
  });
  it("prevents normalized duplicate creation concurrently and never consumes a second identity", async () => {
    const request = input("revenue", "Synthetic duplicate " + key());
    const results = await Promise.allSettled([
      repo.create(maker, request, key(), key()),
      repo.create(maker, { ...request, name: ` ${request.name.toUpperCase()} ` }, key(), key()),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("finds persisted accounts beyond the initial 100 and excludes headers and system controls", async () => {
    const request = input("expense"),
      prefix = `BOUND-${suffix}-`;
    await pool.query(
      `insert into account(tenant_id,company_id,id,code,name,type,parent_id,status,is_header,manual_posting_allowed,created_at)
      select $1,$2,$3||n,$3||lpad(n::text,4,'0'),'Synthetic bounded account '||n,'expense',$4,'active',false,true,now()
      from generate_series(1,105) n`,
      [sourceTestTenantId, company, prefix, request.section_id],
    );
    const actor = { ...maker, actor: { ...maker.actor, permissions: [...permissions, "banking.payment.read"] } };
    const payments = new SourceBankPaymentRepository(pool);
    const initial = await payments.listNominalAccounts(actor, { company_id: company, limit: 100 });
    expect(initial.items.map((a) => a.code)).not.toContain(prefix + "0105");
    const found = await payments.listNominalAccounts(actor, {
      company_id: company,
      search: prefix + "0105",
      limit: 100,
    });
    expect(found.items).toHaveLength(1);
    await pool.query(
      `insert into account(tenant_id,company_id,id,code,name,type,parent_id,status,is_header,manual_posting_allowed,is_system_account,created_at)
      values($1,$2,$3,$3,'Synthetic system control','expense',$4,'active',false,true,true,now())`,
      [sourceTestTenantId, company, prefix + "SYSTEM", request.section_id],
    );
    expect(
      (await payments.listNominalAccounts(actor, { company_id: company, search: prefix + "SYSTEM", limit: 100 })).items,
    ).toHaveLength(0);
  });
  it("rejects duplicate renames and records direct changes without fabricated approvals", async () => {
    const first = await repo.create(maker, input("equity"), key(), key());
    const second = await repo.create(maker, input("equity"), key(), key());
    const detail = await repo.get(maker, first.id);
    await expect(
      repo.update(maker, second.id, { expected_version: second.version, name: detail.name }, key(), key()),
    ).rejects.toMatchObject({ code: "NOMINAL_DUPLICATE" });
    const facts = await pool.query(
      "select submitted_by,decided_by from finance_general_nominal where tenant_id=$1 and nominal_id=$2",
      [sourceTestTenantId, second.id],
    );
    expect(facts.rows).toEqual([{ submitted_by: null, decided_by: null }]);
    const overrides = await pool.query(
      "select count(*) from approval_override_event where tenant_id=$1 and resource_id=$2",
      [sourceTestTenantId, second.id],
    );
    expect(overrides.rows[0].count).toBe("0");
    expect((await repo.get(maker, second.id)).events.map((e) => e.event_type)).toEqual(["activated", "created"]);
  });
  it("fails closed for wrong companies, invalid currency, stale versions and impersonation", async () => {
    await expect(
      repo.create(maker, { ...input("expense"), company_id: "unauthorized-company" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(repo.create(maker, { ...input("expense"), currency: "ZZZ" }, key(), key())).rejects.toMatchObject({
      code: "NOMINAL_CURRENCY_INVALID",
    });
    await expect(
      repo.create({ ...maker, impersonationRequestId: "synthetic" }, input("expense"), key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    const created = await repo.create(maker, input("expense"), key(), key());
    await expect(
      repo.update(maker, created.id, { expected_version: 99, name: "Stale" }, key(), key()),
    ).rejects.toMatchObject({ code: "NOMINAL_VERSION_CONFLICT" });
  });
});
