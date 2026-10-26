import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceFiscalCalendarRepository } from "../../server/api/src/modules/master-data/fiscal-calendars/source-repository.js";
import { SourceFinancePeriodRepository } from "../../server/api/src/modules/finance/periods/source-repository.js";
import type { CalendarContext } from "../../server/api/src/modules/master-data/fiscal-calendars/transaction.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import type { FiscalCalendarDetail, FinancialPeriod } from "../../packages/contracts/src/finance/periods.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  key = () => randomUUID(),
  company = `fiscal-test-${key()}`;
const permissions = [
  "platform.fiscal_calendar.read",
  "platform.fiscal_calendar.create",
  "platform.accounting_period.read",
  "finance.period.close",
  "finance.period.reopen",
  "platform.approval.override",
];
const admin: CalendarContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.override-admin",
    displayName: "Synthetic Finance administrator",
    email: "fiscal@example.invalid",
    organizationName: "Synthetic",
    roles: ["super_administrator"],
    permissions,
    sessionVersion: 1,
  },
};
const ordinary: CalendarContext = { ...admin, actor: { ...admin.actor, userId: "r06.maker", roles: ["finance_test"] } };
(url ? describe : describe.skip)("Company fiscal calendar persistence and security", () => {
  let pool: DatabasePool,
    calendars: SourceFiscalCalendarRepository,
    periods: SourceFinancePeriodRepository,
    year: FiscalCalendarDetail;
  beforeAll(async () => {
    if (!url || !/^\/nexora_(bank_context_e2e_isolated_|chart_template_ct01)/.test(new URL(url).pathname))
      throw Error("An explicitly isolated test database is required.");
    pool = createDatabasePool(url);
    await ensureSourceSuperAdministratorFixture(pool);
    calendars = new SourceFiscalCalendarRepository(pool);
    periods = new SourceFinancePeriodRepository(pool);
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic fiscal calendar company','active')",
      [tenant, company],
    );
    for (const user of ["r06.override-admin", "r06.maker"])
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.override-admin','governed_administration','synthetic-fiscal-test')",
        [tenant, key(), user, company],
      );
    for (const policy of ["r06-uat-policy-approval-override", "r06-uat-policy-maker"])
      for (const permission of permissions) {
        // Synthetic-only grants; ordinary users still have no live global Super Admin role.
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy, permission, company],
        );
      }
    year = await calendars.create(admin, { company_id: company, period_start: "2026-07-01" }, key(), key());
  }, 60_000);
  afterAll(async () => {
    await pool?.end();
  });
  const change = (
    actor: CalendarContext,
    selected: FinancialPeriod[],
    status: "open" | "soft_close" | "closed",
    extra = {},
  ) =>
    periods.change(
      actor,
      year.calendar.id,
      {
        company_id: company,
        periods: selected.map((p) => ({ id: p.id, expected_version: p.version })),
        status,
        reason: "Synthetic Finance test",
        confirm_locked_reopen: false,
        ...extra,
      },
      key(),
      key(),
    );
  it("persists July–June periods, soft-closed by default, and thirteen truthful immutable events", async () => {
    expect(year.calendar.period_end).toBe("2027-06-30");
    expect(year.periods).toHaveLength(12);
    expect(year.periods.every((p) => p.status === "soft_close" && p.version === 1)).toBe(true);
    expect(year.history).toHaveLength(13);
    expect((await calendars.detail(admin, company, year.calendar.id)).periods).toEqual(year.periods);
    expect((await calendars.list(admin, { company_id: company, limit: 25 })).items).toHaveLength(1);
  });
  it("denies ordinary calendar creation, forged global roles, impersonation and cross-company reads", async () => {
    await expect(
      calendars.create(ordinary, { company_id: company, period_start: "2028-01-01" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      calendars.create(
        { ...ordinary, actor: { ...ordinary.actor, roles: ["super_administrator"] } },
        { company_id: company, period_start: "2028-01-01" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      calendars.create(
        { ...admin, realActorId: "r06.maker" },
        { company_id: company, period_start: "2028-01-01" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(calendars.detail(ordinary, "not-permitted-company", year.calendar.id)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      calendars.list({ ...admin, tenantId: "another-tenant" }, { company_id: company, limit: 25 }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("supports scoped Finance close/reopen but restricts locked-period reopening to live Super Admin", async () => {
    let result = await change(ordinary, [year.periods[0]!], "open");
    let p = result.periods[0]!;
    expect(p.status).toBe("open");
    result = await change(ordinary, [p], "soft_close");
    p = result.periods[0]!;
    result = await change(ordinary, [p], "closed");
    p = result.periods[0]!;
    await expect(change(ordinary, [p], "open", { confirm_locked_reopen: true })).rejects.toMatchObject({ status: 403 });
    await expect(change(admin, [p], "open")).rejects.toMatchObject({
      status: 403,
      code: "LOCKED_PERIOD_CONFIRMATION_REQUIRED",
    });
    result = await change(admin, [p], "open", { confirm_locked_reopen: true });
    expect(result.periods[0]!.status).toBe("open");
    expect(result.history.filter((e) => e.period_id === p.id).map((e) => e.action)).toEqual([
      "opened",
      "locked",
      "soft_closed",
      "opened",
      "period_created",
    ]);
  });
  it("replays the same mutation once, rejects different payloads and rechecks revoked permissions", async () => {
    const input = { company_id: company, period_start: "2028-01-01" },
      request = key();
    const created = await calendars.create(admin, input, request, key());
    expect(await calendars.create(admin, input, request, key())).toEqual(created);
    await expect(
      calendars.create(admin, { ...input, period_start: "2029-01-01" }, request, key()),
    ).rejects.toMatchObject({ status: 409, code: "IDEMPOTENCY_CONFLICT" });
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override' and permission_key='platform.fiscal_calendar.create' and scope_value=$2",
      [tenant, company],
    );
    try {
      await expect(calendars.create(admin, input, request, key())).rejects.toMatchObject({ status: 403 });
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override','platform.fiscal_calendar.create','company',$2)",
        [tenant, company],
      );
    }
  });
  it("serializes duplicate year creation and rejects overlapping fiscal years without partial periods", async () => {
    const attempts = await Promise.allSettled([
      calendars.create(admin, { company_id: company, period_start: "2030-07-01" }, key(), key()),
      calendars.create(admin, { company_id: company, period_start: "2030-07-01" }, key(), key()),
    ]);
    expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((r) => r.status === "rejected")).toHaveLength(1);
    await expect(
      calendars.create(admin, { company_id: company, period_start: "2031-01-01" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("generates missing periods for an existing year without replacing its identity or fabricating old creation history", async () => {
    const id = `legacy-calendar-${key()}`;
    await pool.query(
      "insert into fiscal_calendar(tenant_id,company_id,id,year,period_start,period_end,status) values($1,$2,$3,2034,'2034-01-01','2034-12-31','active')",
      [tenant, company, id],
    );
    const input = { company_id: company, expected_version: 1 },
      request = key();
    const result = await calendars.generate(admin, id, input, request, key());
    expect(result.calendar.id).toBe(id);
    expect(result.calendar.version).toBe(2);
    expect(result.periods).toHaveLength(12);
    expect(result.history.every((e) => e.action === "period_created")).toBe(true);
    expect(await calendars.generate(admin, id, input, request, key())).toEqual(result);
    await expect(calendars.generate(admin, id, { ...input, expected_version: 2 }, key(), key())).rejects.toMatchObject({
      status: 409,
      code: "CALENDAR_PERIODS_EXIST",
    });
    const irregular = `legacy-irregular-${key()}`;
    await pool.query(
      "insert into fiscal_calendar(tenant_id,company_id,id,year,period_start,period_end,status) values($1,$2,$3,2035,'2035-01-15','2035-12-31','active')",
      [tenant, company, irregular],
    );
    await expect(calendars.generate(admin, irregular, input, key(), key())).rejects.toMatchObject({
      status: 409,
      code: "CALENDAR_IRREGULAR",
    });
    expect((await calendars.detail(admin, company, irregular)).periods).toHaveLength(0);
  });
  it("waits for the posting period shared lock before committing a close", async () => {
    const opened = await change(admin, [year.periods[4]!], "open"),
      p = opened.periods[4]!,
      blocker = await pool.connect();
    let closing: ReturnType<typeof change> | undefined;
    try {
      await blocker.query("begin");
      await blocker.query("select 1 from financial_period where tenant_id=$1 and id=$2 for share", [tenant, p.id]);
      const pid = (await blocker.query<{ pid: number }>("select pg_backend_pid() as pid")).rows[0]!.pid;
      closing = change(admin, [p], "soft_close");
      await expect
        .poll(
          async () =>
            Number(
              (
                await pool.query(
                  "select count(*)::integer n from pg_stat_activity where $1=any(pg_blocking_pids(pid))",
                  [pid],
                )
              ).rows[0].n,
            ),
          { timeout: 5000 },
        )
        .toBeGreaterThan(0);
      expect(
        (await pool.query("select status from financial_period where tenant_id=$1 and id=$2", [tenant, p.id])).rows[0]
          .status,
      ).toBe("open");
      await blocker.query("commit");
      expect((await closing).periods[4]!.status).toBe("soft_close");
    } finally {
      await blocker.query("rollback");
      blocker.release();
      if (closing) await closing.catch(() => undefined);
    }
  });
  it("rolls back every selected period and audit event if a batch has a stale version", async () => {
    const before = await calendars.detail(admin, company, year.calendar.id);
    await expect(
      change(admin, [before.periods[2]!, { ...before.periods[3]!, version: 999 }], "open"),
    ).rejects.toMatchObject({ status: 409, code: "PERIOD_VERSION_CONFLICT" });
    expect(await calendars.detail(admin, company, year.calendar.id)).toEqual(before);
  });
  it("blocks close for incomplete journals and prevents date/history edits or overlapping/cross-company periods", async () => {
    const result = await change(admin, [year.periods[1]!], "open"),
      p = result.periods[1]!;
    await pool.query(
      "insert into journal_entry(id,tenant_id,company_id,created_by,posting_date,source_type,source_id,status,created_at) values($1,$2,$3,'r06.maker',$4,'synthetic_calendar_test',$1,'draft',clock_timestamp())",
      [key(), tenant, company, p.period_start],
    );
    await expect(change(admin, [p], "soft_close")).rejects.toMatchObject({ status: 409, code: "PERIOD_CLOSE_BLOCKED" });
    await expect(
      pool.query("update fiscal_calendar_event set reason='Forged history' where tenant_id=$1 and calendar_id=$2", [
        tenant,
        year.calendar.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("update financial_period set period_start=period_start+1 where tenant_id=$1 and id=$2", [
        tenant,
        p.id,
      ]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("delete from financial_period where tenant_id=$1 and id=$2", [tenant, p.id]),
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query(
        "insert into financial_period(id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,1,$5,$6,'open',now())",
        [key(), tenant, "nexora-r06-uat-company", year.calendar.id, p.period_start, p.period_end],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
});
