import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { createDisposableSourceDatabase } from "./disposable-source-database.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId } from "../integration/source-security-fixture.js";
import { SourceFiscalCalendarRepository } from "../../server/api/src/modules/master-data/fiscal-calendars/source-repository.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Fiscal calendar database safeguards", () => {
  let pool: DatabasePool;
  let close: () => Promise<void>;
  beforeAll(async () => {
    const database = await createDisposableSourceDatabase(url!);
    pool = database.pool;
    close = database.close;
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
    const tenant = sourceTestTenantId,
      company = `fiscal-security-${randomUUID()}`,
      user = "r06.override-admin";
    const permissions = [
      "platform.fiscal_calendar.read",
      "platform.fiscal_calendar.create",
      "platform.accounting_period.read",
      "platform.approval.override",
    ];
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Disposable fiscal security company','active')",
      [tenant, company],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,$3,'governed_administration','disposable-fiscal-security')",
      [tenant, randomUUID(), user, company],
    );
    for (const permission of permissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override',$2,'all') on conflict do nothing",
        [tenant, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override',$2,'company',$3) on conflict do nothing",
        [tenant, permission, company],
      );
    }
    await new SourceFiscalCalendarRepository(pool).create(
      {
        tenantId: tenant,
        actor: {
          tenantId: tenant,
          userId: user,
          displayName: user,
          email: "fiscal@example.invalid",
          organizationName: "Disposable fiscal security",
          roles: ["super_administrator"],
          permissions,
          sessionVersion: 1,
        },
      },
      { company_id: company, period_start: "2026-01-01" },
      randomUUID(),
      randomUUID(),
    );
  }, 90000);
  afterAll(async () => {
    await close?.();
  });
  it("forces tenant isolation on fiscal years, periods and immutable history", async () => {
    const result = await pool.query(
      "select relname,relrowsecurity,relforcerowsecurity from pg_class where oid=any(array['fiscal_calendar'::regclass,'financial_period'::regclass,'fiscal_calendar_event'::regclass]) order by relname",
    );
    expect(result.rows).toHaveLength(3);
    expect(result.rows.every((r) => r.relrowsecurity && r.relforcerowsecurity)).toBe(true);
  });
  it("installs company, overlap, immutable-identity and append-only evidence guards", async () => {
    const constraints = await pool.query(
      "select conname,pg_get_constraintdef(oid) as definition from pg_constraint where conname in ('financial_period_calendar_company_fk','financial_period_no_overlap') order by conname",
    );
    expect(constraints.rows).toHaveLength(2);
    expect(constraints.rows[0].definition).toContain("tenant_id, fiscal_calendar_id, company_id");
    const triggers = await pool.query(
      "select tgname from pg_trigger where tgname=any(array['fiscal_calendar_identity_guard','financial_period_boundaries_guard','fiscal_calendar_event_immutable']) and not tgisinternal",
    );
    expect(triggers.rows).toHaveLength(3);
    const event = (await pool.query("select tenant_id,id from fiscal_calendar_event limit 1")).rows[0];
    expect(event).toBeTruthy();
    await expect(
      pool.query("delete from fiscal_calendar_event where tenant_id=$1 and id=$2", [event.tenant_id, event.id]),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
