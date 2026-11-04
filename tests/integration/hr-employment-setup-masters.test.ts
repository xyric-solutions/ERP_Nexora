import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company";

run("HR Employment Setup masters (HR134)", () => {
  let pool: DatabasePool;
  let repo: SourceHrRepository;
  const context: HrActorContext = {
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      email: "r06.maker@example.test",
      displayName: "Maker",
      organizationName: "Employment setup tests",
      roles: ["hr_manager"],
      permissions: ["hr.master.create", "hr.master.update", "hr.master.read"],
      sessionVersion: 1,
    },
  };
  const key = () => `employment-setup-${randomUUID()}`;
  const corr = "hr-employment-setup-test";

  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function row(id: string) {
    return (
      await pool.query<{ master_type: string; code: string; payment_route: string | null; pay_cycle: string | null; status: string }>(
        "select master_type,code,payment_route,pay_cycle,status from hr_master_record where tenant_id=$1 and id=$2",
        [sourceTestTenantId, id],
      )
    ).rows[0]!;
  }

  it("creates an employment setup with an ES code, its terms and audit evidence", async () => {
    const name = `Contract weekly ${randomUUID().slice(0, 8)}`;
    const created = await repo.createMaster(
      context,
      { company_id: company, type: "employment_setup", code: "AUTO", name, description: "", payment_route: "accounts_payable", pay_cycle: "weekly" },
      key(),
      corr,
    );
    expect(await row(created.id)).toMatchObject({ master_type: "employment_setup", payment_route: "accounts_payable", pay_cycle: "weekly", status: "active" });
    expect((await row(created.id)).code).toMatch(/^ES-\d{3,}$/);
    const audit = await pool.query<{ action: string; entity_id: string; after_hash: string | null }>(
      "select action,entity_id,after_hash from platform_admin_audit_event where tenant_id=$1 and id=$2",
      [sourceTestTenantId, created.audit_event_id],
    );
    expect(audit.rows[0]).toMatchObject({ action: "hr.master.create", entity_id: created.id });
    expect(audit.rows[0]?.after_hash).toBeTruthy();
    const directory = await repo.listMasters(context, { company_id: company, type: "employment_setup", active_only: true, limit: 100 });
    expect(directory.items.find((item) => item.id === created.id)).toMatchObject({ type: "employment_setup", payment_route: "accounts_payable", pay_cycle: "weekly", configuration_key: null });
  });

  it("keeps both terms on update and refuses an update without them", async () => {
    const created = await repo.createMaster(
      context,
      { company_id: company, type: "employment_setup", code: "AUTO", name: `Staff ${randomUUID().slice(0, 8)}`, description: "", payment_route: "payroll", pay_cycle: "monthly" },
      key(),
      corr,
    );
    const { code } = await row(created.id);
    await repo.updateMaster(
      context,
      created.id,
      { company_id: company, code, name: `Renamed ${randomUUID().slice(0, 8)}`, description: "Fortnightly staff", payment_route: "stipend", pay_cycle: "fortnightly" },
      key(),
      corr,
    );
    expect(await row(created.id)).toMatchObject({ code, payment_route: "stipend", pay_cycle: "fortnightly" });
    await expect(
      repo.updateMaster(context, created.id, { company_id: company, code, name: "No terms", description: "" }, key(), corr),
    ).rejects.toMatchObject({ status: 400, code: "HR_MASTER_CONFIGURATION_REQUIRED" });
    expect(await row(created.id)).toMatchObject({ payment_route: "stipend", pay_cycle: "fortnightly" });
  });

  it("refuses payment terms on other master kinds", async () => {
    const created = await repo.createMaster(
      context,
      { company_id: company, type: "designation", code: "AUTO", name: `Designation ${randomUUID().slice(0, 8)}`, description: "" },
      key(),
      corr,
    );
    const { code } = await row(created.id);
    await expect(
      repo.updateMaster(context, created.id, { company_id: company, code, name: "Designation", description: "", payment_route: "payroll", pay_cycle: "monthly" }, key(), corr),
    ).rejects.toMatchObject({ status: 400, code: "HR_MASTER_CONFIGURATION_INVALID" });
  });

  it("rejects creating, changing or reactivating retired employment types and categories", async () => {
    for (const type of ["employment_type", "employee_category"] as const) {
      await expect(
        repo.createMaster(context, { company_id: company, type, code: "AUTO", name: `Retired ${randomUUID()}`, description: "" }, key(), corr),
      ).rejects.toMatchObject({ status: 409, code: "HR_MASTER_TYPE_RETIRED" });
    }
    // Archived legacy evidence only exists from the HR134 backfill; seed one with triggers bypassed.
    const legacyId = `legacy-type-${randomUUID()}`;
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = replica");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        "insert into hr_master_record(id,tenant_id,company_id,master_type,code,name,status,created_by,deactivated_by,deactivated_at) values($1,$2,$3,'employment_type',$4,$5,'inactive','r06.maker','migration-0134',now())",
        [legacyId, sourceTestTenantId, company, `ET-${Date.now()}`, `Legacy ${legacyId}`],
      );
      await client.query("commit");
    } finally {
      client.release();
    }
    await expect(
      repo.changeMasterStatus(context, legacyId, { company_id: company, status: "active" }, key(), corr),
    ).rejects.toMatchObject({ status: 409, code: "HR_MASTER_TYPE_RETIRED" });
    await expect(
      repo.updateMaster(context, legacyId, { company_id: company, code: "ET-RENAMED", name: "Renamed", description: "" }, key(), corr),
    ).rejects.toMatchObject({ status: 409, code: "HR_MASTER_TYPE_RETIRED" });
    expect(await row(legacyId)).toMatchObject({ status: "inactive" });
  });
});
