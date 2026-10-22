import { createEncashmentFixture } from "./hr-encashment-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPayslipFixture, payslipActor } from "./hr-payslips-fixture.js";
import { createLifecycleFixture } from "./hr-lifecycle-case-fixture.js";
import { hrSelfServiceQuerySchema } from "../../packages/contracts/src/hr/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Employee-owned Benefits self-service", () => {
  let pool: DatabasePool,
    f: Awaited<ReturnType<typeof createPayslipFixture>>,
    user: string,
    binding: string,
    releaseId: string;
  const q = () => hrSelfServiceQuerySchema.parse({ ...f.query });
  const actor = () => payslipActor(user, []);
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    f = await createPayslipFixture(pool);
    await createLifecycleFixture(pool, false, { fixture: f, person: f.person });
    user = "self-user-" + randomUUID();
    binding = "self-binding-" + randomUUID();
    await pool.query(
      "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
      [user, tenant, user + "@example.test"],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','isolated-self-service')",
      [tenant, randomUUID(), user, f.companyId],
    );
    await pool.query(
      "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated personal portal','r06.last-admin-a')",
      [binding, tenant, user, f.person.employeeId],
    );
  });
  afterAll(async () => {
    await f?.dispose();
    await pool?.end();
  });
  it("rejects caller-selected employee identities and invalid pagination or month", () => {
    expect(hrSelfServiceQuerySchema.safeParse({ ...q(), employee_id: "another-person" }).success).toBe(false);
    expect(hrSelfServiceQuerySchema.safeParse({ ...q(), month: "2026-10-02" }).success).toBe(false);
    expect(hrSelfServiceQuerySchema.safeParse({ ...q(), limit: 51 }).success).toBe(false);
  });
  it("shows only owned published records without employer-wide Payroll permissions", async () => {
    const before = await f.repo.getSelfService(actor(), q());
    expect(before.status).toBe("ready");
    expect(before.memberships).toHaveLength(1);
    expect(before.payslips).toEqual([]);
    const pending = (await f.payslipRead()).items[0]!.result_id;
    await expect(f.repo.getSelfServicePayslip(actor(), f.companyId, pending)).rejects.toMatchObject({ status: 404 });
    await f.release();
    const after = await f.repo.getSelfService(actor(), q());
    expect(after.payslip_total).toBe(1);
    expect(after.payslips).toHaveLength(1);
    releaseId = after.payslips[0]!.id;
    const detail = await f.repo.getSelfServicePayslip(actor(), f.companyId, releaseId);
    expect(detail.can_release).toBe(false);
    expect(detail.release?.publication_hash).toHaveLength(64);
    expect(detail.document.employee.id).toBe(f.person.employeeId);
    expect(detail.document).toEqual((await f.payslipDetail(pending)).document);
    expect(JSON.stringify(after)).not.toContain("bank_account");
  });
  it("does not give an administrator another employee portal or guessable published document", async () => {
    const empty = await f.repo.getSelfService(
      payslipActor("r06.last-admin-a"),
      hrSelfServiceQuerySchema.parse({ month: f.month }),
    );
    expect(empty.status).toBe("link_required");
    expect(empty.memberships).toEqual([]);
    await expect(
      f.repo.getSelfServicePayslip(payslipActor("r06.checker"), f.companyId, releaseId),
    ).rejects.toMatchObject({ status: 404 });
    await expect(f.repo.getSelfService(actor(), { ...q(), company_id: "another-company" })).rejects.toMatchObject({
      status: 403,
    });
  });
  it("returns correct totals even beyond the final page and retains the frozen publication", async () => {
    await pool.query("update employee set first_name='Changed after publication' where tenant_id=$1 and id=$2", [
      tenant,
      f.person.employeeId,
    ]);
    const page = await f.repo.getSelfService(actor(), { ...q(), offset: 999 });
    expect(page.payslips).toEqual([]);
    expect(page.payslip_total).toBe(1);
    const detail = await f.repo.getSelfServicePayslip(actor(), f.companyId, releaseId);
    expect(detail.document.employee.name).not.toContain("Changed after publication");
  });
  it("immediately denies reads when current company access is revoked", async () => {
    await pool.query(
      "update security_user_company_access set revoked_by='r06.last-admin-a',revoked_at=now(),revocation_reason='Isolated access revocation' where tenant_id=$1 and user_id=$2 and company_id=$3 and revoked_at is null",
      [tenant, user, f.companyId],
    );
    await expect(f.repo.getSelfService(actor(), q())).rejects.toMatchObject({ status: 403 });
    await expect(f.repo.getSelfServicePayslip(actor(), f.companyId, releaseId)).rejects.toMatchObject({ status: 404 });
  });
  it("uses the actual shared leave ledger for owned available and encashed balances", async () => {
    const g = await createEncashmentFixture(pool),
      own = "self-balance-" + randomUUID();
    try {
      await pool.query(
        "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at) values($1,$2,$1,$3,'active','disabled',now())",
        [own, tenant, own + "@example.test"],
      );
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','isolated-personal-balances')",
        [tenant, randomUUID(), own, g.companyId],
      );
      await pool.query(
        "insert into employee_user_binding(id,tenant_id,user_id,employee_id,effective_from,reason,created_by) values($1,$2,$3,$4,current_date,'Isolated exact personal balances','r06.last-admin-a')",
        ["balance-binding-" + randomUUID(), tenant, own, g.person.employeeId],
      );
      const result = await g.repo.getSelfService(
        payslipActor(own, []),
        hrSelfServiceQuerySchema.parse({ company_id: g.companyId, month: g.today.slice(0, 7) + "-01" }),
      );
      expect(result.balances).toHaveLength(1);
      expect(result.balances[0]).toMatchObject({
        employee_id: g.person.employeeId,
        available: "12.3456",
        reserved: "0.0000",
        encashed: "0.0000",
      });
      expect(result.balances[0]).toEqual(await g.balance());
      expect(result.memberships.every((m) => m.employee_id === g.person.employeeId)).toBe(true);
    } finally {
      await g.dispose();
    }
  });
  it("denies expired bindings, disabled accounts and tenant context mismatches", async () => {
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','isolated-self-service-restored')",
      [tenant, randomUUID(), user, f.companyId],
    );
    await pool.query(
      "update employee_user_binding set effective_to=current_date,ended_at=now(),ended_by='r06.last-admin-a' where tenant_id=$1 and id=$2",
      [tenant, binding],
    );
    expect((await f.repo.getSelfService(actor(), hrSelfServiceQuerySchema.parse({ month: f.month }))).status).toBe(
      "link_required",
    );
    await pool.query("update security_user_account set status='inactive' where tenant_id=$1 and id=$2", [tenant, user]);
    await expect(f.repo.getSelfService(actor(), q())).rejects.toMatchObject({ status: 403 });
    await expect(f.repo.getSelfService({ ...actor(), tenantId: "another-tenant" }, q())).rejects.toMatchObject({
      status: 403,
    });
  });
});
