import { createPayslipFixture } from "./hr-payslips-fixture.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createPersonalLeaveFixture } from "./hr-self-leave-fixture.js";
import { correctionActor } from "./hr-correction-fixture.js";
import {
  createHrPersonalCorrectionSchema,
  hrPersonalCorrectionActionSchema,
  hrReportGovernanceActionSchema,
} from "../../packages/contracts/src/hr/index.js";
import { hrCsvCell } from "../../server/api/src/modules/hr/report-governance.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const permissions = [
  "hr.employee.read",
  "hr.employee.approve",
  "hr.employee_contact.read",
  "hr.employee_contact.manage",
  "hr.report_export.read",
  "hr.report_export.create",
  "hr.report_export.download",
  "hr.report_audit.read",
  "hr.report_export_policy.manage",
  "hr.report_export_policy.approve",
  "hr.payroll.report.read",
  "hr.payroll.result.read",
  "hr.payroll.salary.read",
];
const staff = (who = "r06.checker") => correctionActor(who, permissions);
(url ? describe : describe.skip)("Governed employee corrections and bounded HR disclosure", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createPersonalLeaveFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createPersonalLeaveFixture(pool);
    fixtures.push(f);
    for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
      for (const key of permissions) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
          [tenant, policy, key],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
          [tenant, policy, key, f.companyId],
        );
      }
    return f;
  }
  type Fixture = Awaited<ReturnType<typeof fixture>>;
  const mine = (f: Fixture) =>
    f.repo.getPersonalCorrections(f.own(), {
      company_id: f.companyId,
      mode: "mine",
      state: "all",
      limit: 10,
      offset: 0,
    });
  async function proposal(f: Fixture) {
    const w = await mine(f);
    const input = createHrPersonalCorrectionSchema.parse({
      company_id: f.companyId,
      profile: { ...w.current, preferred_name: "Reviewed preferred name", phone: "+92 300 1234567" },
      expected_source_hash: w.source_hash,
      reason: "Correct my independently verifiable personal information",
    });
    return { input, result: await f.repo.createPersonalCorrection(f.own(), input, randomUUID(), "governance-test") };
  }
  const decide = (
    f: Fixture,
    id: string,
    action: "approve" | "reject" | "cancel",
    actor = staff(),
    version = 1,
    key = randomUUID(),
  ) =>
    f.repo.actOnPersonalCorrection(
      actor,
      id,
      hrPersonalCorrectionActionSchema.parse({
        company_id: f.companyId,
        action,
        expected_version: version,
        reason: "Independently reviewed the supporting personal information",
        review_reference: action === "approve" ? "HR verified signed identity correction" : "",
      }),
      key,
      "governance-test",
    );
  const report = (f: Fixture, action: unknown, actor = staff(), key = randomUUID()) =>
    f.repo.actOnReportGovernance(
      actor,
      hrReportGovernanceActionSchema.parse({ company_id: f.companyId, ...(action as object) }),
      key,
      "governance-test",
    );
  async function policy(f: Fixture, max = 5000) {
    const p = await report(
      f,
      {
        action: "create_policy",
        terms: { max_rows: max, expires_after_hours: 1, reports: ["employee_directory", "payroll_results"] },
        reason: "Bounded authorized workforce disclosure policy",
      },
      staff("r06.maker"),
    );
    await report(f, {
      action: "approve_policy",
      id: p.id,
      expected_version: 1,
      reason: "Independent approval of bounded workforce disclosure",
    });
    return p;
  }
  const receipt = (f: Fixture) =>
    report(f, {
      action: "create_export",
      report: "employee_directory",
      from_date: f.today,
      to_date: f.today,
      reason: "Authorized company workforce planning export",
    });
  const download = (f: Fixture, id: string, actor = staff(), key = randomUUID()) =>
    report(f, { action: "download", id, reason: "Download reviewed company workforce planning report" }, actor, key);
  it("rejects employee selectors, work-email changes and unverified approval", () => {
    expect(createHrPersonalCorrectionSchema.safeParse({ employee_id: "other" }).success).toBe(false);
    expect(
      hrPersonalCorrectionActionSchema.safeParse({
        company_id: "c",
        action: "approve",
        expected_version: 1,
        reason: "Reviewed information",
        review_reference: "",
      }).success,
    ).toBe(false);
    expect(
      hrReportGovernanceActionSchema.safeParse({
        action: "create_export",
        company_id: "c",
        report: "bank_accounts",
        from_date: "2026-01-01",
        to_date: "2026-01-02",
        reason: "Unauthorized disclosure request",
      }).success,
    ).toBe(false);
  });
  it("submits without changing canonical data and applies approval plus contact/profile history atomically", async () => {
    const f = await fixture(),
      before = (await mine(f)).current,
      p = await proposal(f);
    expect((await mine(f)).current).toEqual(before);
    expect((await mine(f)).items[0]?.allowed_actions).toEqual(["cancel"]);
    await decide(f, p.result.id, "approve");
    expect((await mine(f)).current?.preferred_name).toBe("Reviewed preferred name");
    const versions = await pool.query(
      "select source_reference from hr_employee_profile_version where tenant_id=$1 and employee_id=$2 and source_reference=$3",
      [tenant, f.person.employeeId, "hr:personal-data-correction:" + p.result.id],
    );
    expect(versions.rowCount).toBe(1);
    expect(
      (
        await pool.query(
          "select contact_value from employee_contact where tenant_id=$1 and employee_id=$2 and channel='phone' and status='active' and is_primary",
          [tenant, f.person.employeeId],
        )
      ).rows[0]?.contact_value,
    ).toBe("+92 300 1234567");
  });
  it("blocks duplicate pending proposals and lets only the requester cancel", async () => {
    const f = await fixture(),
      p = await proposal(f);
    await expect(f.repo.createPersonalCorrection(f.own(), p.input, randomUUID(), "duplicate")).rejects.toMatchObject({
      status: 409,
    });
    await expect(decide(f, p.result.id, "cancel", staff())).rejects.toMatchObject({ status: 403 });
    await decide(f, p.result.id, "cancel", f.own());
    expect((await mine(f)).items[0]?.state).toBe("cancelled");
  });
  it("rejects no-op and stale-source submissions", async () => {
    const f = await fixture(),
      w = await mine(f);
    await expect(
      f.repo.createPersonalCorrection(
        f.own(),
        {
          company_id: f.companyId,
          profile: w.current!,
          expected_source_hash: w.source_hash!,
          reason: "No actual personal field changes",
        },
        randomUUID(),
        "noop",
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      f.repo.createPersonalCorrection(
        f.own(),
        {
          company_id: f.companyId,
          profile: { ...w.current!, preferred_name: "Changed" },
          expected_source_hash: "0".repeat(64),
          reason: "Stale reviewed personal profile",
        },
        randomUUID(),
        "stale",
      ),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("refuses stale approval without overwriting changes and permits rejection", async () => {
    const f = await fixture(),
      p = await proposal(f);
    await pool.query("update employee set preferred_name='Concurrent HR change' where tenant_id=$1 and id=$2", [
      tenant,
      f.person.employeeId,
    ]);
    await expect(decide(f, p.result.id, "approve")).rejects.toMatchObject({ status: 409 });
    expect((await mine(f)).current?.preferred_name).toBe("Concurrent HR change");
    await decide(f, p.result.id, "reject");
  });
  it("rechecks explicit company access before returning an idempotent decision", async () => {
    const f = await fixture(),
      p = await proposal(f),
      key = randomUUID();
    await decide(f, p.result.id, "reject", staff(), 1, key);
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Isolated governance authority revocation' where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
      [tenant, f.companyId, "r06.checker"],
    );
    await expect(decide(f, p.result.id, "reject", staff(), 1, key)).rejects.toMatchObject({ status: 403 });
  });
  it("rejects unbound and impersonated employee requests", async () => {
    const f = await fixture(),
      p = await proposal(f);
    await expect(mine({ ...f, own: () => staff() })).rejects.toMatchObject({ status: 403 });
    await expect(
      f.repo.createPersonalCorrection(
        { ...f.own(), impersonationRequestId: "impersonation" },
        p.input,
        randomUUID(),
        "impersonated",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("requires independent approved policy and rejects self approval", async () => {
    const f = await fixture();
    await expect(receipt(f)).rejects.toMatchObject({ status: 409 });
    const p = await report(
      f,
      {
        action: "create_policy",
        terms: { max_rows: 100, expires_after_hours: 1, reports: ["employee_directory"] },
        reason: "Reviewed workforce disclosure policy",
      },
      staff("r06.maker"),
    );
    await expect(
      report(
        f,
        { action: "approve_policy", id: p.id, expected_version: 1, reason: "Trying to approve my own policy" },
        staff("r06.maker"),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("downloads actual scoped CSV, emits audit events and persists metadata only", async () => {
    const f = await fixture();
    await policy(f);
    const p = await receipt(f),
      r = await download(f, p.id);
    expect(r.download?.csv).toContain("Employee number");
    expect(r.download?.row_count).toBeGreaterThan(0);
    expect(r.download?.csv).not.toContain("personal_email");
    const saved = await pool.query(
      "select response_body::text from platform_admin_idempotency where tenant_id=$1 and path='/api/v1/hr/report_governance/actions' and response_body->>'id'=$2",
      [tenant, p.id],
    );
    expect(
      saved.rows.every((row) => !row.response_body.includes("csv") && !row.response_body.includes("Employee number")),
    ).toBe(true);
    const audit = await f.repo.getReportGovernance(staff(), {
      company_id: f.companyId,
      section: "audit",
      limit: 50,
      offset: 0,
    });
    expect(audit.events.map((e) => e.kind)).toEqual(
      expect.arrayContaining(["policy.created", "policy.approved", "export.created", "export.downloaded"]),
    );
    await expect(download(f, p.id, staff("r06.maker"))).rejects.toMatchObject({ status: 404 });
  });
  it("rechecks source on download replay and rejects changed sources", async () => {
    const f = await fixture();
    await policy(f);
    const p = await receipt(f),
      key = randomUUID();
    await download(f, p.id, staff(), key);
    await pool.query("update employee set first_name='Changed source' where tenant_id=$1 and id=$2", [
      tenant,
      f.person.employeeId,
    ]);
    await expect(download(f, p.id, staff(), key)).rejects.toMatchObject({ status: 409 });
  });
  it("invalidates earlier receipts after a new policy is approved", async () => {
    const f = await fixture();
    await policy(f);
    const p = await receipt(f);
    await policy(f, 4000);
    await expect(download(f, p.id)).rejects.toMatchObject({ status: 409 });
  });
  it("enforces row limits and current company authority", async () => {
    const f = await fixture();
    await policy(f, 1);
    await expect(receipt(f)).rejects.toMatchObject({ status: 409 });
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Isolated governance authority revocation' where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
      [tenant, f.companyId, "r06.checker"],
    );
    await expect(
      f.repo.getReportGovernance(staff(), { company_id: f.companyId, section: "audit", limit: 10, offset: 0 }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("does not disclose unfinalized Payroll calculations", async () => {
    const f = await fixture();
    await policy(f);
    const p = await report(f, {
      action: "create_export",
      report: "payroll_results",
      from_date: f.today,
      to_date: f.today,
      reason: "Reviewed finalized payroll reporting export",
    });
    const r = await download(f, p.id);
    expect(r.download?.row_count).toBe(0);
  });
  it("blocks expired immutable receipts", async () => {
    const f = await fixture();
    await policy(f);
    const p = await receipt(f),
      id = "expired-export-" + randomUUID();
    await pool.query(
      "insert into hr_report_export select (jsonb_populate_record(null::hr_report_export,to_jsonb(r)||jsonb_build_object('id',$3::text,'created_at',clock_timestamp()-interval '2 hours','expires_at',clock_timestamp()-interval '61 minutes'))).* from hr_report_export r where tenant_id=$1 and id=$2",
      [tenant, p.id, id],
    );
    await expect(download(f, id)).rejects.toMatchObject({ status: 409 });
  });
  it("protects correction, policy, receipt and access-event history from direct edits", async () => {
    const f = await fixture(),
      p = await proposal(f);
    await decide(f, p.result.id, "cancel", f.own());
    await expect(
      pool.query("delete from hr_personal_data_correction where tenant_id=$1 and id=$2", [tenant, p.result.id]),
    ).rejects.toMatchObject({ code: "P0001" });
    await policy(f);
    const e = await receipt(f);
    await expect(
      pool.query("update hr_report_export set reason='Tampering with retained history' where tenant_id=$1 and id=$2", [
        tenant,
        e.id,
      ]),
    ).rejects.toMatchObject({ code: "P0001" });
    await expect(
      pool.query("delete from hr_report_access_event where tenant_id=$1 and company_id=$2", [tenant, f.companyId]),
    ).rejects.toMatchObject({ code: "P0001" });
  });

  it("closes retained contacts when removing an approved personal phone", async () => {
    const f = await fixture();
    let p = await proposal(f);
    await decide(f, p.result.id, "approve");
    const w = await mine(f);
    p = {
      input: {
        company_id: f.companyId,
        profile: { ...w.current!, phone: "" },
        expected_source_hash: w.source_hash!,
        reason: "Remove obsolete personal phone after independent HR verification",
      },
      result: undefined as never,
    };
    p.result = await f.repo.createPersonalCorrection(f.own(), p.input, randomUUID(), "remove-phone");
    await decide(f, p.result.id, "approve");
    expect((await mine(f)).current?.phone).toBe("");
    expect(
      (
        await pool.query(
          "select status from employee_contact where tenant_id=$1 and employee_id=$2 and channel='phone'",
          [tenant, f.person.employeeId],
        )
      ).rows.every((r) => r.status === "inactive"),
    ).toBe(true);
  });
  it("requires current company access for a previously successful download", async () => {
    const f = await fixture();
    await policy(f);
    const p = await receipt(f),
      key = randomUUID();
    await download(f, p.id, staff(), key);
    await pool.query(
      "update security_user_company_access set revoked_at=now(),revoked_by='r06.last-admin-a',revocation_reason='Isolated reporting revocation' where tenant_id=$1 and company_id=$2 and user_id='r06.checker' and revoked_at is null",
      [tenant, f.companyId],
    );
    await expect(download(f, p.id, staff(), key)).rejects.toMatchObject({ status: 403 });
  });
  it("retains idempotent profile decisions without creating duplicate versions", async () => {
    const f = await fixture(),
      p = await proposal(f),
      key = randomUUID();
    const first = await decide(f, p.result.id, "approve", staff(), 1, key),
      second = await decide(f, p.result.id, "approve", staff(), 1, key);
    expect(second.replayed).toBe(true);
    expect(second.audit_event_id).toBe(first.audit_event_id);
    expect(
      (
        await pool.query(
          "select id from hr_employee_profile_version where tenant_id=$1 and employee_id=$2 and source_reference=$3",
          [tenant, f.person.employeeId, "hr:personal-data-correction:" + p.result.id],
        )
      ).rowCount,
    ).toBe(1);
  });

  it("exports actual finalized Finance-posted Payroll totals without bank or personal contact fields", async () => {
    const f = await createPayslipFixture(pool);
    try {
      for (const id of ["r06-uat-policy-maker", "r06-uat-policy-checker"])
        for (const key of permissions) {
          await pool.query(
            "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing",
            [tenant, id, key],
          );
          await pool.query(
            "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing",
            [tenant, id, key, f.companyId],
          );
        }
      const action = (input: unknown, who = "r06.checker") =>
        f.repo.actOnReportGovernance(
          staff(who),
          hrReportGovernanceActionSchema.parse({ company_id: f.companyId, ...(input as object) }),
          randomUUID(),
          "payroll-export-test",
        );
      const p = await action(
        {
          action: "create_policy",
          terms: { max_rows: 1000, expires_after_hours: 1, reports: ["payroll_results"] },
          reason: "Independent finalized Payroll disclosure policy",
        },
        "r06.maker",
      );
      await action({
        action: "approve_policy",
        id: p.id,
        expected_version: 1,
        reason: "Independent review of finalized Payroll disclosure",
      });
      const month = f.query.month,
        e = await action({
          action: "create_export",
          report: "payroll_results",
          from_date: month,
          to_date: month,
          reason: "Authorized finalized Payroll export acceptance",
        }),
        d = await action({
          action: "download",
          id: e.id,
          reason: "Download finalized Payroll totals for independent verification",
        });
      const expected = (
        await pool.query(
          "select r.gross::text,r.net::text,e.employee_number from hr_payroll_result r join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id join hr_payroll_period p on p.tenant_id=r.tenant_id and p.id=r.period_id and p.run_number=r.run_number where r.tenant_id=$1 and r.company_id=$2 and p.month=$3",
          [tenant, f.companyId, month],
        )
      ).rows;
      expect(expected.length).toBeGreaterThan(0);
      expect(d.download?.row_count).toBe(expected.length);
      for (const r of expected) {
        expect(d.download?.csv).toContain(hrCsvCell(r.employee_number));
        expect(d.download?.csv).toContain(hrCsvCell(r.gross));
        expect(d.download?.csv).toContain(hrCsvCell(r.net));
      }
      expect(d.download?.csv).not.toContain("IBAN");
      expect(d.download?.csv).not.toContain("personal_email");
    } finally {
      await f.dispose();
    }
  });
  it.each(["=SUM(1,2)", " +cmd", "\tvalue", "\nvalue", "@payload", "-2"])(
    "neutralizes spreadsheet formula input %j",
    (value) => expect(hrCsvCell(value)).toBe("\"'" + value + '"'),
  );
  it("quotes delimiters and embedded quotes", () => expect(hrCsvCell('a,"b"')).toBe('"a,""b"""'));
});
