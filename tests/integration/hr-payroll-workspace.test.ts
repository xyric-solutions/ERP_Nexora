import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import {
  createHrPayrollRecordSchema,
  hrPayrollWorkspaceSchema,
  hrPayrollOptionsSchema,
  type HrPayrollSection,
  type HrPayrollItem,
} from "../../packages/contracts/src/hr/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createShiftAllocationFixture } from "./hr-shift-allocation-fixture.js";
import { correctionActor } from "./hr-correction-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip,
  key = () => randomUUID(),
  reason = "Governed Payroll integration acceptance";
const permissions = ["setup", "salary", "adjustment", "loan", "period", "report", "payment", "payslip"].flatMap((g) =>
  ["read", "manage", "approve"].map((p) => "hr.payroll." + g + "." + p),
);
const actor = (id = "r06.maker", grants = permissions) => correctionActor(id, grants);
run("Governed Payroll workspace", () => {
  let pool: DatabasePool, repo: SourceHrRepository;
  const fixtures: Awaited<ReturnType<typeof fixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceHrRepository(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture() {
    const f = await createShiftAllocationFixture(pool),
      employee = await f.target(),
      expense = "payroll-expense-" + key(),
      liability = "payroll-liability-" + key();
    await pool.query(
      `insert into account(id,tenant_id,company_id,code,name,type,status,created_at) values($1,$3,$4,'PAY_EXP','Payroll expense','expense','active',now()),($2,$3,$4,'PAY_LIA','Payroll liability','liability','active',now())`,
      [expense, liability, tenant, f.companyId],
    );
    const result = { ...f, employee, expense, liability, month: f.today.slice(0, 7) + "-01" };
    fixtures.push(result);
    return result;
  }
  async function create(f: Awaited<ReturnType<typeof fixture>>, data: Record<string, unknown>) {
    return repo.createPayrollRecord(
      actor(),
      createHrPayrollRecordSchema.parse({ company_id: f.companyId, reason, ...data }),
      key(),
      "payroll-acceptance",
    );
  }
  async function list(f: Awaited<ReturnType<typeof fixture>>, section: HrPayrollSection) {
    const data = await repo.getPayrollWorkspace(actor(), {
      company_id: f.companyId,
      month: f.month,
      section,
      search: "",
      limit: 25,
      offset: 0,
    });
    hrPayrollWorkspaceSchema.parse(data);
    return data;
  }
  async function component(f: Awaited<ReturnType<typeof fixture>>, deduction = false) {
    return create(f, {
      kind: "component",
      code: deduction ? "RECOVERY" : "BASIC",
      name: deduction ? "Loan recovery" : "Basic salary",
      component_kind: deduction ? "deduction" : "earning",
      method: "fixed",
      formula: null,
      taxable: true,
      prorated: true,
      account_id: deduction ? f.liability : f.expense,
      position: deduction ? 2 : 1,
    });
  }
  async function structure(f: Awaited<ReturnType<typeof fixture>>) {
    const comp = await component(f);
    return create(f, {
      kind: "structure",
      code: "MONTHLY",
      name: "Monthly structure",
      description: "Exact salary terms",
      currency_code: "PKR",
      items: [{ component_id: comp.id, amount: "9007199254740991.1234", formula: null }],
    });
  }
  async function act(
    f: Awaited<ReturnType<typeof fixture>>,
    section: "salaries" | "adjustments" | "loans" | "components" | "structures",
    row: HrPayrollItem,
    action: "submit" | "approve" | "reject" | "cancel" | "deactivate" | "activate",
    user = "r06.maker",
    extra = {},
  ) {
    return repo.actOnPayrollRecord(
      actor(user),
      row.id,
      {
        company_id: f.companyId,
        section,
        expected_version: row.version,
        source_hash: row.source_hash,
        action,
        reason,
        confirm_override: false,
        ...extra,
      },
      key(),
      "payroll-acceptance",
    );
  }
  it("persists company accounting components, exact structures and authorized options", async () => {
    const f = await fixture();
    await structure(f);
    const rows = await list(f, "structures");
    expect(rows.items[0]!.lines[0]!.amount).toBe("9007199254740991.1234");
    const opts = await repo.getPayrollOptions(actor(), { company_id: f.companyId, on_date: f.today, search: "" });
    hrPayrollOptionsSchema.parse(opts);
    expect(opts.accounts).toHaveLength(2);
    expect(opts.employees.some((e) => e.id === f.employee.employeeId)).toBe(true);
  });
  it("rejects foreign-company accounting accounts", async () => {
    const f = await fixture(),
      other = await fixture();
    await expect(
      create(f, {
        kind: "component",
        code: "BAD",
        name: "Bad account",
        component_kind: "earning",
        method: "fixed",
        formula: null,
        taxable: false,
        prorated: false,
        account_id: other.expense,
        position: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects forward formula references and formula injection", async () => {
    const f = await fixture();
    for (const formula of ["FUTURE * 1", "process.exit()"])
      await expect(
        create(f, {
          kind: "component",
          code: "BAD",
          name: "Unsafe formula",
          component_kind: "earning",
          method: "formula",
          formula,
          taxable: false,
          prorated: false,
          account_id: f.expense,
          position: 1,
        }),
      ).rejects.toMatchObject({ status: 409 });
  });
  it("enforces write permission, idempotency replay and conflicting payload", async () => {
    const f = await fixture(),
      input = createHrPayrollRecordSchema.parse({
        company_id: f.companyId,
        reason,
        kind: "component",
        code: "IDEMP",
        name: "Idempotent",
        component_kind: "earning",
        method: "fixed",
        formula: null,
        taxable: true,
        prorated: true,
        account_id: f.expense,
        position: 1,
      }),
      idempotency = key();
    await expect(repo.createPayrollRecord(actor("r06.maker", []), input, idempotency, "test")).rejects.toMatchObject({
      status: 403,
    });
    const first = await repo.createPayrollRecord(actor(), input, idempotency, "test");
    expect((await repo.createPayrollRecord(actor(), input, idempotency, "test")).replayed).toBe(true);
    await expect(
      repo.createPayrollRecord(actor(), { ...input, name: "Changed" }, idempotency, "test"),
    ).rejects.toMatchObject({ status: 409 });
    expect((await list(f, "components")).items[0]!.id).toBe(first.id);
  });
  it("preserves immutable source configuration and rejects stale status changes", async () => {
    const f = await fixture();
    await component(f);
    const row = (await list(f, "components")).items[0]!;
    await act(f, "components", row, "deactivate");
    await expect(act(f, "components", row, "activate")).rejects.toMatchObject({ status: 409 });
    await expect(
      pool.query(`update hr_pay_component set name='Tampered',version=version+1 where tenant_id=$1 and id=$2`, [
        tenant,
        row.id,
      ]),
    ).rejects.toThrow();
  });
  it("blocks component deactivation while an active structure uses it", async () => {
    const f = await fixture();
    await structure(f);
    await expect(act(f, "components", (await list(f, "components")).items[0]!, "deactivate")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("creates frozen salary item snapshots and requires independent approval", async () => {
    const f = await fixture(),
      s = await structure(f);
    await create(f, {
      kind: "salary",
      employee_id: f.employee.employeeId,
      structure_id: s.id,
      currency_code: "PKR",
      effective_from: f.month,
      effective_to: null,
      compensation_type: "fixed",
      payment_basis: "monthly",
    });
    let row = (await list(f, "salaries")).items[0]!;
    expect(row.lines[0]!.amount).toBe("9007199254740991.1234");
    await act(f, "salaries", row, "submit");
    row = (await list(f, "salaries")).items[0]!;
    await expect(act(f, "salaries", row, "approve")).rejects.toMatchObject({ status: 403 });
    await act(f, "salaries", row, "approve", "r06.checker");
    expect((await list(f, "salaries")).items[0]!.status).toBe("approved");
  });
  it("rejects overlapping approved salaries transactionally", async () => {
    const f = await fixture(),
      s = await structure(f);
    for (let i = 0; i < 2; i++) {
      const r = await create(f, {
        kind: "salary",
        employee_id: f.employee.employeeId,
        structure_id: s.id,
        currency_code: "PKR",
        effective_from: f.month,
        effective_to: null,
        compensation_type: "fixed",
        payment_basis: "monthly",
      });
      await act(
        f,
        "salaries",
        (await list(f, "salaries")).items.find((x) => x.id === r.id)!,
        "submit",
      );
      const row = (await list(f, "salaries")).items.find((x) => x.id === r.id)!;
      if (i === 0) await act(f, "salaries", row, "approve", "r06.checker");
      else await expect(act(f, "salaries", row, "approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
    }
  });
  it("requires matching structure currency and employee company", async () => {
    const f = await fixture(),
      other = await fixture(),
      s = await structure(f);
    for (const data of [
      { employee_id: f.employee.employeeId, currency_code: "USD" },
      { employee_id: other.employee.employeeId, currency_code: "PKR" },
    ])
      await expect(
        create(f, {
          kind: "salary",
          ...data,
          structure_id: s.id,
          effective_from: f.month,
          effective_to: null,
          compensation_type: "fixed",
          payment_basis: "monthly",
        }),
      ).rejects.toMatchObject({ status: 409 });
  });
  it("prepares exact loan instalments only on independent approval", async () => {
    const f = await fixture(),
      comp = await component(f, true);
    await create(f, {
      kind: "loan",
      employee_id: f.employee.employeeId,
      component_id: comp.id,
      reference: "LOAN-001",
      currency_code: "PKR",
      start_month: f.month,
      principal: "100.00",
      instalment_count: 3,
    });
    let row = (await list(f, "loans")).items[0]!;
    expect(row.lines).toHaveLength(0);
    await act(f, "loans", row, "submit");
    row = (await list(f, "loans")).items[0]!;
    await act(f, "loans", row, "approve", "r06.checker");
    row = (await list(f, "loans")).items[0]!;
    expect(row.status).toBe("approved");
    expect(row.lines.map((i) => i.amount)).toEqual(["33.3400", "33.3300", "33.3300"]);
  });
  it("keeps adjustment drafts separate from approved inputs", async () => {
    const f = await fixture(),
      comp = await component(f);
    await create(f, {
      kind: "adjustment",
      employee_id: f.employee.employeeId,
      component_id: comp.id,
      effective_month: f.month,
      amount: "12.3456",
    });
    await act(f, "adjustments", (await list(f, "adjustments")).items[0]!, "submit");
    await act(f, "adjustments", (await list(f, "adjustments")).items[0]!, "approve", "r06.checker");
    expect((await list(f, "adjustments")).items[0]!.status).toBe("approved");
  });
  it("does not leak another company to a restricted reader", async () => {
    const f = await fixture();
    await expect(
      repo.getPayrollWorkspace(actor("r06.restricted"), {
        company_id: f.companyId,
        section: "components",
        month: f.month,
        search: "",
        limit: 25,
        offset: 0,
      }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("serves all five financial execution views without fabricated rows", async () => {
    const f = await fixture();
    for (const section of ["runs", "review", "journals", "payments", "payslips"] as const) {
      const data = await list(f, section);
      expect(data.items).toEqual([]);
      expect(data.notices.join(" ")).toContain("Payment integration is deferred until Banking delivery.");
    }
  });

  it("serializes duplicate concurrent requests into one audited configuration", async () => {
    const f = await fixture(),
      input = createHrPayrollRecordSchema.parse({
        company_id: f.companyId,
        reason,
        kind: "component",
        code: "CONCURRENT",
        name: "Concurrent create",
        component_kind: "earning",
        method: "fixed",
        formula: null,
        taxable: false,
        prorated: false,
        account_id: f.expense,
        position: 1,
      }),
      sameKey = key();
    const rows = await Promise.all([
      repo.createPayrollRecord(actor(), input, sameKey, "concurrent"),
      repo.createPayrollRecord(actor(), input, sameKey, "concurrent"),
    ]);
    expect(rows[0]!.id).toBe(rows[1]!.id);
    expect(rows.filter((r) => r.replayed)).toHaveLength(1);
    const events = await pool.query(
      "select count(*)::int as n from hr_payroll_workspace_event where tenant_id=$1 and record_id=$2",
      [tenant, rows[0]!.id],
    );
    expect(events.rows[0].n).toBe(1);
  });
  it("rejects stale source hashes and impersonated writes", async () => {
    const f = await fixture(),
      comp = await component(f);
    const row = (await list(f, "components")).items[0]!;
    await expect(act(f, "components", { ...row, source_hash: "0".repeat(64) }, "deactivate")).rejects.toMatchObject({
      status: 409,
    });
    await expect(
      repo.actOnPayrollRecord(
        { ...actor(), impersonationRequestId: "impersonation-1" },
        comp.id,
        {
          company_id: f.companyId,
          section: "components",
          action: "deactivate",
          expected_version: row.version,
          source_hash: row.source_hash,
          reason,
          confirm_override: false,
        },
        key(),
        "test",
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("rejects loan recovery through an earning component", async () => {
    const f = await fixture(),
      comp = await component(f);
    await expect(
      create(f, {
        kind: "loan",
        employee_id: f.employee.employeeId,
        component_id: comp.id,
        reference: "BAD-LOAN",
        currency_code: "PKR",
        start_month: f.month,
        principal: "100",
        instalment_count: 3,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("preserves structure line terms and immutable event history", async () => {
    const f = await fixture(),
      s = await structure(f);
    await expect(
      pool.query("update hr_salary_structure_item set amount=1 where tenant_id=$1 and structure_id=$2", [tenant, s.id]),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from hr_payroll_workspace_event where tenant_id=$1 and record_id=$2", [tenant, s.id]),
    ).rejects.toThrow();
    expect((await list(f, "structures")).items[0]!.history).toHaveLength(1);
  });
  it("cannot approve a draft without submission", async () => {
    const f = await fixture(),
      comp = await component(f);
    await create(f, {
      kind: "adjustment",
      employee_id: f.employee.employeeId,
      component_id: comp.id,
      effective_month: f.month,
      amount: "1",
    });
    await expect(
      act(f, "adjustments", (await list(f, "adjustments")).items[0]!, "approve", "r06.checker"),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rejects a forged super-administrator self-approval claim", async () => {
    const f = await fixture(),
      comp = await component(f);
    await create(f, {
      kind: "adjustment",
      employee_id: f.employee.employeeId,
      component_id: comp.id,
      effective_month: f.month,
      amount: "1",
    });
    await act(f, "adjustments", (await list(f, "adjustments")).items[0]!, "submit");
    const row = (await list(f, "adjustments")).items[0]!;
    await expect(
      repo.actOnPayrollRecord(
        correctionActor("r06.maker", [...permissions, "platform.approval.override"], ["super_administrator"]),
        row.id,
        {
          company_id: f.companyId,
          section: "adjustments",
          action: "approve",
          expected_version: row.version,
          source_hash: row.source_hash,
          reason,
          confirm_override: true,
        },
        key(),
        "forged-override",
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect((await list(f, "adjustments")).items[0]!.status).toBe("submitted");
  });
  it("blocks backdated terms after a Payroll period has been calculated", async () => {
    const f = await fixture(),
      comp = await component(f),
      period = "payroll-frozen-" + key(),
      policy = "payroll-policy-" + key();
    await pool.query(
      `insert into hr_attendance_period(id,tenant_id,company_id,month,opened_by) values($1,$2,$3,$4,'r06.maker')`,
      [period, tenant, f.companyId, f.month],
    );
    await pool.query(
      `insert into hr_payroll_policy(id,tenant_id,company_id,currency_code,net_payable_account_id,created_by) values($1,$2,$3,'PKR',$4,'r06.maker')`,
      [policy, tenant, f.companyId, f.liability],
    );
    await pool.query(
      `insert into hr_payroll_period(id,tenant_id,company_id,attendance_period_id,policy_id,month,state,source_hash,created_by) values($1,$2,$3,$4,$5,$6,'calculated',$7,'r06.maker')`,
      ["run-" + key(), tenant, f.companyId, period, policy, f.month, "a".repeat(64)],
    );
    await expect(
      create(f, {
        kind: "adjustment",
        employee_id: f.employee.employeeId,
        component_id: comp.id,
        effective_month: f.month,
        amount: "1",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("rechecks component dependencies before reactivating a structure", async () => {
    const f = await fixture();
    await structure(f);
    await act(f, "structures", (await list(f, "structures")).items[0]!, "deactivate");
    await act(f, "components", (await list(f, "components")).items[0]!, "deactivate");
    await expect(act(f, "structures", (await list(f, "structures")).items[0]!, "activate")).rejects.toMatchObject({
      status: 409,
    });
  });
  it("rechecks the posting account before reactivating a component", async () => {
    const f = await fixture();
    await component(f);
    await act(f, "components", (await list(f, "components")).items[0]!, "deactivate");
    await pool.query(`update account set status='inactive' where tenant_id=$1 and id=$2`, [tenant, f.expense]);
    await expect(act(f, "components", (await list(f, "components")).items[0]!, "activate")).rejects.toMatchObject({
      status: 409,
    });
  });

  it("approves an explicit successor and retains the predecessor historical salary", async () => {
    const f = await fixture(),
      s = await structure(f),
      base = await create(f, {
        kind: "salary",
        employee_id: f.employee.employeeId,
        structure_id: s.id,
        currency_code: "PKR",
        effective_from: f.month,
        effective_to: null,
        compensation_type: "fixed",
        payment_basis: "monthly",
      });
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === base.id)!,
      "submit",
    );
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === base.id)!,
      "approve",
      "r06.checker",
    );
    const date = (await pool.query("select ($1::date+interval '1 month')::date::text as date", [f.month])).rows[0].date;
    const revision = await create(f, {
      kind: "salary",
      employee_id: f.employee.employeeId,
      structure_id: s.id,
      currency_code: "PKR",
      effective_from: date,
      effective_to: null,
      compensation_type: "fixed",
      payment_basis: "monthly",
      supersedes_id: base.id,
    });
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === revision.id)!,
      "submit",
    );
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === revision.id)!,
      "approve",
      "r06.checker",
    );
    const rows = (await list(f, "salaries")).items,
      old = rows.find((r) => r.id === base.id)!,
      next = rows.find((r) => r.id === revision.id)!;
    expect(old.status).toBe("approved");
    expect(old.effective_to).toBe((await pool.query("select ($1::date-1)::text as date", [date])).rows[0].date);
    expect(old.details.closed_by_successor_id).toBe(next.id);
    expect(old.lines[0]!.amount).toBe("9007199254740991.1234");
    expect(old.history.some((h) => h.action === "successor_close")).toBe(true);
    expect(next.status).toBe("approved");
    await expect(
      pool.query("update hr_salary_assignment set effective_to=null,version=version+1 where tenant_id=$1 and id=$2", [
        tenant,
        base.id,
      ]),
    ).rejects.toThrow();
  });
  it("rejecting a successor leaves the approved predecessor unchanged", async () => {
    const f = await fixture(),
      s = await structure(f),
      base = await create(f, {
        kind: "salary",
        employee_id: f.employee.employeeId,
        structure_id: s.id,
        currency_code: "PKR",
        effective_from: f.month,
        effective_to: null,
        compensation_type: "fixed",
        payment_basis: "monthly",
      });
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === base.id)!,
      "submit",
    );
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === base.id)!,
      "approve",
      "r06.checker",
    );
    const date = (await pool.query("select ($1::date+interval '1 month')::date::text as date", [f.month])).rows[0].date;
    const revision = await create(f, {
      kind: "salary",
      employee_id: f.employee.employeeId,
      structure_id: s.id,
      currency_code: "PKR",
      effective_from: date,
      effective_to: null,
      compensation_type: "fixed",
      payment_basis: "monthly",
      supersedes_id: base.id,
    });
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === revision.id)!,
      "submit",
    );
    await act(
      f,
      "salaries",
      (await list(f, "salaries")).items.find((r) => r.id === revision.id)!,
      "reject",
      "r06.checker",
    );
    expect((await list(f, "salaries")).items.find((r) => r.id === base.id)!.effective_to).toBeNull();
  });
});
