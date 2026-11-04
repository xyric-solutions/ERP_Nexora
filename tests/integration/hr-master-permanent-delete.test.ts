import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository, type HrActorContext } from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const company = "nexora-r06-uat-company";

run("HR Organisation & Masters permanent delete (HR135)", () => {
  let pool: DatabasePool;
  let repo: SourceHrRepository;
  const actor = (permissions: string[]): HrActorContext => ({
    tenantId: sourceTestTenantId,
    actor: {
      tenantId: sourceTestTenantId,
      userId: "r06.maker",
      email: "r06.maker@example.test",
      displayName: "Maker",
      organizationName: "Permanent delete tests",
      roles: ["hr_manager"],
      permissions,
      sessionVersion: 1,
    },
  });
  const context = actor(["hr.master.create", "hr.master.update", "hr.master.read", "hr.organization.update", "hr.organization.read"]);
  const key = () => `master-delete-${randomUUID()}`;
  const corr = "hr-master-permanent-delete-test";

  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });

  async function masterRow(id: string) {
    return (
      await pool.query<{ code: string; status: string }>("select code,status from hr_master_record where tenant_id=$1 and id=$2", [sourceTestTenantId, id])
    ).rows[0];
  }
  async function unitRow(id: string) {
    return (await pool.query<{ code: string; status: string }>("select code,status from organization_unit where tenant_id=$1 and id=$2", [sourceTestTenantId, id])).rows[0];
  }
  async function inactiveMaster(type: "designation" | "job" | "cost_center" | "work_location" | "employment_setup", code = "AUTO") {
    const terms =
      type === "employment_setup"
        ? { payment_route: "payroll" as const, pay_cycle: "monthly" as const }
        : type === "cost_center"
          ? { configuration_key: "default_nominal", configuration_value: "5000" }
          : type === "work_location"
            ? { configuration_key: "working_pattern", configuration_value: "on_site" }
            : {};
    const created = await repo.createMaster(context, { company_id: company, type, code, name: `Delete ${type} ${randomUUID().slice(0, 8)}`, description: "", ...terms }, key(), corr);
    await repo.changeMasterStatus(context, created.id, { company_id: company, status: "inactive" }, key(), corr);
    return created.id;
  }
  async function withSetupStatus(id: string, status: "active" | "inactive") {
    await pool.query(
      `update hr_master_record set status=$3,deactivated_by=case when $3='inactive' then 'r06.maker' end,deactivated_at=case when $3='inactive' then now() end where tenant_id=$1 and id=$2`,
      [sourceTestTenantId, id, status],
    );
  }

  it("permanently deletes an inactive, unreferenced master with audit and deletion evidence", async () => {
    for (const type of ["designation", "job", "cost_center", "work_location", "employment_setup"] as const) {
      const id = await inactiveMaster(type);
      const { code } = (await masterRow(id))!;
      const result = await repo.deleteMaster(context, id, { company_id: company }, key(), corr);
      expect(result).toMatchObject({ id, company_id: company, code, deleted: true, replayed: false });
      expect(await masterRow(id)).toBeUndefined();
      const audit = await pool.query<{ action: string; entity_type: string; entity_id: string }>(
        "select action,entity_type,entity_id from platform_admin_audit_event where tenant_id=$1 and id=$2",
        [sourceTestTenantId, result.audit_event_id],
      );
      expect(audit.rows[0]).toEqual({ action: "hr.master.delete", entity_type: "hr_master_record", entity_id: id });
      const evidence = await pool.query<{ code: string; record_kind: string; before_state: { status: string; master_type: string; code: string } }>(
        "select code,record_kind,before_state from hr_master_deletion where tenant_id=$1 and audit_event_id=$2",
        [sourceTestTenantId, result.audit_event_id],
      );
      expect(evidence.rows[0]).toMatchObject({ code, record_kind: type, before_state: { status: "inactive", master_type: type, code } });
    }
  });

  it("replays an idempotent delete; a new key after deletion finds nothing", async () => {
    const id = await inactiveMaster("designation");
    const idempotencyKey = key();
    const first = await repo.deleteMaster(context, id, { company_id: company }, idempotencyKey, corr);
    const replay = await repo.deleteMaster(context, id, { company_id: company }, idempotencyKey, corr);
    expect(replay).toEqual({ ...first, replayed: true });
    const evidence = await pool.query("select 1 from hr_master_deletion where tenant_id=$1 and entity_id=$2", [sourceTestTenantId, id]);
    expect(evidence.rowCount).toBe(1);
    await expect(repo.deleteMaster(context, id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 404, code: "HR_MASTER_NOT_FOUND" });
  });

  it("refuses to delete an active record", async () => {
    const created = await repo.createMaster(context, { company_id: company, type: "designation", code: "AUTO", name: `Active ${randomUUID().slice(0, 8)}`, description: "" }, key(), corr);
    await expect(repo.deleteMaster(context, created.id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_MASTER_DELETE_ACTIVE" });
    expect(await masterRow(created.id)).toMatchObject({ status: "active" });
    // Defence in depth: the database guard refuses a direct delete of an active row.
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await expect(client.query("delete from hr_master_record where tenant_id=$1 and id=$2", [sourceTestTenantId, created.id])).rejects.toMatchObject({ code: "23514" });
    } finally {
      await client.query("rollback");
      client.release();
    }
  });

  it("refuses records still referenced by assignments and keeps them deactivated", async () => {
    for (const id of ["r06-uat-cost-center", "r06-uat-employment-setup"]) {
      await withSetupStatus(id, "inactive");
      try {
        await expect(repo.deleteMaster(context, id, { company_id: company }, key(), corr)).rejects.toMatchObject({
          status: 409,
          code: "HR_MASTER_IN_USE",
          message: "This record is still used by employee assignments, requisitions or other records and cannot be deleted. It remains deactivated.",
        });
        expect(await masterRow(id)).toMatchObject({ status: "inactive" });
      } finally {
        await withSetupStatus(id, "active");
      }
    }
  });

  it("refuses retired employment types and setups referenced by the HR134 legacy map", async () => {
    const legacyId = `legacy-type-${randomUUID()}`;
    const setupId = await inactiveMaster("employment_setup");
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local session_replication_role = replica");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query(
        "insert into hr_master_record(id,tenant_id,company_id,master_type,code,name,status,created_by,deactivated_by,deactivated_at) values($1,$2,$3,'employment_type',$4,$5,'inactive','r06.maker','migration-0134',now())",
        [legacyId, sourceTestTenantId, company, `ET-${Date.now()}`, `Legacy ${legacyId}`],
      );
      await client.query(
        "insert into hr_employment_setup_legacy_map(tenant_id,company_id,employment_setup_id,employment_type_id) values($1,$2,$3,$4)",
        [sourceTestTenantId, company, setupId, legacyId],
      );
      await client.query("commit");
    } finally {
      client.release();
    }
    await expect(repo.deleteMaster(context, legacyId, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_MASTER_TYPE_RETIRED" });
    expect(await masterRow(legacyId)).toMatchObject({ status: "inactive" });
    await expect(repo.deleteMaster(context, setupId, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_MASTER_IN_USE" });
    expect(await masterRow(setupId)).toMatchObject({ status: "inactive" });
  });

  it("refuses a caller without the master update permission", async () => {
    const id = await inactiveMaster("designation");
    await expect(repo.deleteMaster(actor(["hr.master.read"]), id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    await expect(repo.deleteOrganizationUnit(actor(["hr.master.update"]), "nexora-r06-uat-branch", { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    expect(await masterRow(id)).toMatchObject({ status: "inactive" });
  });

  it("deletes an inactive job grade together with its band detail", async () => {
    const level = 500 + Math.floor(Math.random() * 400);
    const created = await repo.createJobGrade(
      context,
      { company_id: company, code: "AUTO", name: `Grade ${randomUUID().slice(0, 8)}`, description: "", grade_level: level, currency_code: "PKR", band_minimum: "100.00", band_midpoint: "150.00", band_maximum: "200.00" },
      key(),
      corr,
    ).catch(async (error: unknown) => {
      // A previous run may have used the random level; retry once with another.
      if ((error as { code?: string }).code !== "HR_JOB_GRADE_DUPLICATE") throw error;
      return repo.createJobGrade(context, { company_id: company, code: "AUTO", name: `Grade ${randomUUID().slice(0, 8)}`, description: "", grade_level: level === 999 ? 401 : level + 1, currency_code: "PKR", band_minimum: null, band_midpoint: null, band_maximum: null }, key(), corr);
    });
    await expect(repo.deleteJobGrade(context, created.id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_MASTER_DELETE_ACTIVE" });
    await repo.changeMasterStatus(context, created.id, { company_id: company, status: "inactive" }, key(), corr);
    const designation = await inactiveMaster("designation");
    await expect(repo.deleteJobGrade(context, designation, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 404, code: "HR_JOB_GRADE_NOT_FOUND" });
    const result = await repo.deleteJobGrade(context, created.id, { company_id: company }, key(), corr);
    expect(result).toMatchObject({ id: created.id, deleted: true });
    expect(await masterRow(created.id)).toBeUndefined();
    const detail = await pool.query("select 1 from hr_job_grade_detail where tenant_id=$1 and master_record_id=$2", [sourceTestTenantId, created.id]);
    expect(detail.rowCount).toBe(0);
    const audit = await pool.query<{ action: string }>("select action from platform_admin_audit_event where tenant_id=$1 and id=$2", [sourceTestTenantId, result.audit_event_id]);
    expect(audit.rows[0]?.action).toBe("hr.job_grade.delete");
  });

  it("blocks organization units with child units, then deletes leaf-first", async () => {
    const branch = await repo.createOrganizationUnit(context, { company_id: company, parent_id: company, type: "branch", code: "AUTO", name: `Delete branch ${randomUUID().slice(0, 8)}` }, key(), corr);
    const department = await repo.createOrganizationUnit(context, { company_id: company, parent_id: branch.id, type: "department", code: "AUTO", name: `Delete dept ${randomUUID().slice(0, 8)}` }, key(), corr);
    await expect(repo.deleteOrganizationUnit(context, department.id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_MASTER_DELETE_ACTIVE" });
    await repo.changeOrganizationUnitStatus(context, department.id, { company_id: company, status: "inactive" }, key(), corr);
    await repo.changeOrganizationUnitStatus(context, branch.id, { company_id: company, status: "inactive" }, key(), corr);
    await expect(repo.deleteOrganizationUnit(context, branch.id, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_ORGANIZATION_UNIT_HAS_CHILDREN" });
    expect(await unitRow(branch.id)).toMatchObject({ status: "inactive" });
    const leaf = await repo.deleteOrganizationUnit(context, department.id, { company_id: company }, key(), corr);
    expect(leaf).toMatchObject({ id: department.id, deleted: true, replayed: false });
    const root = await repo.deleteOrganizationUnit(context, branch.id, { company_id: company }, key(), corr);
    expect(root.code).toMatch(/^BR-\d{3,}$/);
    expect(await unitRow(branch.id)).toBeUndefined();
    const audit = await pool.query<{ action: string; entity_type: string }>("select action,entity_type from platform_admin_audit_event where tenant_id=$1 and id=$2", [sourceTestTenantId, root.audit_event_id]);
    expect(audit.rows[0]).toEqual({ action: "hr.organization.delete", entity_type: "organization_unit" });
    // The company itself and units outside the company scope are refused.
    await expect(repo.deleteOrganizationUnit(context, company, { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 409, code: "HR_COMPANY_ADMIN_REQUIRED" });
    await expect(repo.deleteOrganizationUnit(context, "work-location-division", { company_id: company }, key(), corr)).rejects.toMatchObject({ status: 404, code: "HR_ORGANIZATION_UNIT_NOT_FOUND" });
  });

  it("never reissues a deleted code, even the highest one without a prior counter", async () => {
    const id = await inactiveMaster("designation");
    const { code } = (await masterRow(id))!;
    await repo.deleteMaster(context, id, { company_id: company }, key(), corr);
    const next = await repo.createMaster(context, { company_id: company, type: "designation", code: "AUTO", name: `Next ${randomUUID().slice(0, 8)}`, description: "" }, key(), corr);
    const nextCode = (await masterRow(next.id))!.code;
    expect(Number(nextCode.slice(4))).toBeGreaterThan(Number(code.slice(4)));

    // An explicit (imported) code above the counter high-water mark, then deleted.
    const highest = await pool.query<{ value: string }>(
      `select greatest(
         coalesce((select next_value from hr_record_code_counter where tenant_id=$1 and scope_id=$2 and record_kind='designation'),0),
         coalesce((select max(substring(code from '^DSG-([0-9]+)$')::bigint) from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='designation'),0)
       )::text value`,
      [sourceTestTenantId, company],
    );
    const imported = `DSG-${String(Number(highest.rows[0]!.value) + 5).padStart(3, "0")}`;
    const importedId = await inactiveMaster("designation", imported);
    expect((await masterRow(importedId))!.code).toBe(imported);
    await repo.deleteMaster(context, importedId, { company_id: company }, key(), corr);
    const after = await repo.createMaster(context, { company_id: company, type: "designation", code: "AUTO", name: `After ${randomUUID().slice(0, 8)}`, description: "" }, key(), corr);
    expect(Number((await masterRow(after.id))!.code.slice(4))).toBeGreaterThan(Number(imported.slice(4)));
  });
});
