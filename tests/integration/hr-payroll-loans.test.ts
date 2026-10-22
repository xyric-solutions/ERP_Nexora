import { PassThrough } from "node:stream";
import request from "supertest";
import { vi } from "vitest";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { createLoanFixture, loanActor } from "./hr-payroll-loans-fixture.js";
import { runActor } from "./hr-payroll-run-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
run("Governed loan disbursement and Payroll recovery", () => {
  let pool: DatabasePool;
  const fixtures: Awaited<ReturnType<typeof createLoanFixture>>[] = [];
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
  });
  afterAll(async () => {
    for (const f of fixtures) await f.dispose();
    await pool?.end();
  });
  async function fixture(options: Parameters<typeof createLoanFixture>[1] = {}) {
    const f = await createLoanFixture(pool, options);
    fixtures.push(f);
    return f;
  }
  it("links a real governed posted payment, protects evidence and consumes only on final approval", async () => {
    const f = await fixture();
    expect((await f.row()).status).toBe("approved");
    expect((await f.row()).lines.map((i) => i.amount)).toEqual(["33.3400", "33.3300", "33.3300"]);
    await f.fund();
    const row = await f.row();
    expect(row.status).toBe("active");
    expect(row.details.receivable_account_id).toBe(f.receivable);
    await f.act("calculate");
    let workspace = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    const recovery = workspace.employees[0]!.lines.find((l) => l.source.startsWith("loan:"))!;
    expect(recovery.amount).toBe("33.3400");
    expect(workspace.employees[0]!.deductions).toBe("3133.3400");
    expect((await f.row()).details.recovered).toBe("0");
    await f.act("calculate");
    workspace = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(workspace.employees[0]!.lines.filter((l) => l.source.startsWith("loan:"))).toHaveLength(1);
    await f.act("submit");
    await f.act("approve", "r06.checker");
    const after = await f.row();
    expect(after.details.recovered).toBe("33.3400");
    expect(after.details.outstanding).toBe("66.6600");
    expect(after.status).toBe("active");
    expect(after.history.some((h) => h.action === "recovered")).toBe(true);
    const recorded = (
      await pool.query(
        `select liability_account_id from hr_payroll_result_item where tenant_id=$1 and result_id=$2 and source like 'loan:%'`,
        [tenant, workspace.employees[0]!.id],
      )
    ).rows[0];
    expect(recorded.liability_account_id).toBe(f.receivable);
    await expect(
      pool.query(`update hr_loan_disbursement set bank_reference='tampered' where tenant_id=$1 and loan_id=$2`, [
        tenant,
        f.loan.id,
      ]),
    ).rejects.toThrow();
    await expect(
      pool.query(`update hr_loan_instalment set amount=1 where tenant_id=$1 and loan_id=$2`, [tenant, f.loan.id]),
    ).rejects.toThrow();
  });
  it("settles a fully recovered loan atomically and replays final approval once", async () => {
    const f = await fixture({ count: 1 });
    await f.fund();
    await f.act("calculate");
    await f.act("submit");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query),
      input = {
        ...f.query,
        action: "approve" as const,
        reason: "Final exact loan recovery acceptance",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      key = randomUUID();
    const first = await f.repo.actOnPayrollRun(runActor("r06.checker"), input, key, "loan-test");
    expect(await f.repo.actOnPayrollRun(runActor("r06.checker"), input, key, "loan-test")).toMatchObject({
      ...first,
      replayed: true,
    });
    expect((await f.row()).status).toBe("settled");
    expect((await f.row()).details.outstanding).toBe("0");
  });
  it("rejects maker confirmation, missing permission and out-of-company evidence without changing the loan", async () => {
    const f = await fixture();
    await expect(f.loanAction("confirm_disbursement", "r06.maker", f.confirmation)).rejects.toMatchObject({
      status: 403,
    });
    const row = await f.row();
    await expect(
      f.repo.actOnPayrollRecord(
        runActor("r06.checker"),
        row.id,
        {
          company_id: f.companyId,
          section: "loans",
          action: "confirm_disbursement",
          expected_version: row.version,
          source_hash: row.source_hash,
          confirm_override: false,
          reason: "Permission check acceptance",
          ...f.confirmation,
        },
        randomUUID(),
        "loan-test",
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      f.loanAction("confirm_disbursement", "r06.checker", {
        ...f.confirmation,
        bank_payment_line_id: "other-company-line",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect((await f.row()).status).toBe("approved");
  });
  it("rejects incorrect employee, principal and loan reference matches", async () => {
    const f = await fixture();
    for (const override of [
      { document_reference: "other-employee" },
      { amount: "99.99" },
      { external_reference: "OTHER-LOAN" },
    ]) {
      const bad = await f.pay(override);
      await expect(
        f.loanAction("confirm_disbursement", "r06.checker", { ...f.confirmation, bank_payment_line_id: bad.lineId }),
      ).rejects.toMatchObject({ status: 409 });
    }
    expect((await f.row()).status).toBe("approved");
  });
  it("replays confirmation and rejects stale or duplicate bank confirmation identities", async () => {
    const f = await fixture(),
      row = await f.row(),
      input = {
        company_id: f.companyId,
        section: "loans" as const,
        action: "confirm_disbursement" as const,
        reason: "Independent bank confirmation acceptance",
        expected_version: row.version,
        source_hash: row.source_hash,
        confirm_override: false,
        ...f.confirmation,
      },
      key = randomUUID();
    const first = await f.repo.actOnPayrollRecord(loanActor("r06.checker"), row.id, input, key, "loan-test");
    await expect(
      f.repo.actOnPayrollRecord(runActor("r06.checker"), row.id, input, key, "loan-test"),
    ).rejects.toMatchObject({ status: 403 });

    expect(await f.repo.actOnPayrollRecord(loanActor("r06.checker"), row.id, input, key, "loan-test")).toMatchObject({
      ...first,
      replayed: true,
    });
    await expect(
      f.repo.actOnPayrollRecord(loanActor("r06.checker"), row.id, input, randomUUID(), "loan-test"),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rejects direct unfunded activation, premature settlement, consumption and bank reversal", async () => {
    const f = await fixture();
    await expect(
      pool.query(`update hr_employee_loan set state='active',version=version+1 where tenant_id=$1 and id=$2`, [
        tenant,
        f.loan.id,
      ]),
    ).rejects.toThrow();
    await f.fund();
    await expect(
      pool.query(`update hr_employee_loan set state='settled',version=version+1 where tenant_id=$1 and id=$2`, [
        tenant,
        f.loan.id,
      ]),
    ).rejects.toThrow();
    await f.act("calculate");
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    await expect(
      pool.query(
        `update hr_loan_instalment set state='consumed',consumed_result_id=$3 where tenant_id=$1 and loan_id=$2 and due_month=$4::date`,
        [tenant, f.loan.id, state.employees[0]!.id, f.month],
      ),
    ).rejects.toThrow();
    await expect(
      f.payments.reverse(
        f.bankActor("r06.target"),
        f.payment.posted.id,
        { expected_version: 4, reason: "Attempt reversal under a funded loan" },
        randomUUID(),
        "loan-test",
      ),
    ).rejects.toThrow();
    expect((await f.payments.get(f.bankActor("r06.target"), f.payment.posted.id)).state).toBe("posted");
  });
  it("rejects future confirmation and activation after calculation", async () => {
    const f = await fixture();
    await expect(
      f.loanAction("confirm_disbursement", "r06.checker", { ...f.confirmation, confirmed_on: "2099-01-01" }),
    ).rejects.toMatchObject({ status: 409 });
    await f.act("calculate");
    await expect(f.fund()).rejects.toMatchObject({ status: 409 });
    expect((await f.row()).status).toBe("approved");
  });
  it("rolls back excessive deductions and leaves the schedule unconsumed", async () => {
    const f = await fixture({ principal: "40000", count: 1 });
    await f.fund();
    await expect(f.act("calculate")).rejects.toMatchObject({ status: 409 });
    const state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees).toHaveLength(0);
    expect((await f.row()).details.recovered).toBe("0");
  });
  it("detects changed recovery accounts and excludes approved unfunded loans", async () => {
    const f = await fixture();
    await f.act("calculate");
    let state = await f.repo.getPayrollRunWorkspace(runActor(), f.query);
    expect(state.employees[0]!.lines.some((l) => l.source.startsWith("loan:"))).toBe(false);
    // A separate funded company verifies stale evidence without editing immutable terms.
    const funded = await fixture();
    await funded.fund();
    await funded.act("calculate");
    await pool.query(`update account set status='inactive' where tenant_id=$1 and id=$2`, [tenant, funded.receivable]);
    state = await funded.repo.getPayrollRunWorkspace(runActor(), funded.query);
    expect(state.blocked.join(" ")).toContain("Loan recovery evidence changed");
    await funded.act("submit");
    await expect(funded.act("approve", "r06.checker")).rejects.toMatchObject({ status: 409 });
  });
  it("verifies HTTP authentication, CSRF, validation, disbursement and independent final approval", async () => {
    const f = await fixture({ count: 1 }),
      csrf = "l".repeat(43),
      session = {
        sessionId: "loan-http-review",
        tenantId: tenant,
        userId: "r06.checker",
        csrfToken: csrf,
        idleExpiresAt: new Date("2099-01-01"),
        absoluteExpiresAt: new Date("2099-01-01"),
      };
    const app = createApp({
      config: { allowedOrigins: new Set(["https://loans.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: f.repo,
      authService: {
        loadAuthenticatedAccount: vi.fn(async () => loanActor("r06.checker").actor),
      } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, value: string) =>
          value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    });
    const path = "/api/v1/hr/payroll_records/" + f.loan.id + "/actions",
      row = await f.row(),
      body = {
        company_id: f.companyId,
        section: "loans",
        action: "confirm_disbursement",
        reason: "Independent HTTP bank confirmation",
        expected_version: row.version,
        source_hash: row.source_hash,
        confirm_override: false,
        ...f.confirmation,
      };
    expect(
      (
        await request(app)
          .get("/api/v1/hr/payroll_workspace")
          .query({ company_id: f.companyId, month: f.month, section: "loans" })
      ).status,
    ).toBe(401);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=loan-http")
          .set("idempotency-key", randomUUID())
          .send(body)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(app)
          .post(path)
          .set("cookie", "nexora_session=loan-http")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", randomUUID())
          .send({ ...body, bank_reference: undefined })
      ).status,
    ).toBe(400);
    const confirmation = await request(app)
      .post(path)
      .set("cookie", "nexora_session=loan-http")
      .set("origin", "https://loans.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", randomUUID())
      .send(body);
    expect(confirmation.status).toBe(200);
    expect(confirmation.body.status).toBe("active");
    await f.act("calculate");
    await f.act("submit");
    const state = await f.repo.getPayrollRunWorkspace(loanActor("r06.checker"), f.query),
      input = {
        ...f.query,
        action: "approve",
        reason: "Independent HTTP loan recovery approval",
        expected_version: state.period!.version,
        source_hash: state.source_hash,
        confirm_override: false,
      },
      key = randomUUID();
    for (const replayed of [false, true]) {
      const approved = await request(app)
        .post("/api/v1/hr/payroll_runs/actions")
        .set("cookie", "nexora_session=loan-http")
        .set("origin", "https://loans.example.test")
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key)
        .send(input);
      expect(approved.status).toBe(200);
      expect(approved.body).toMatchObject({ status: "approved", replayed });
    }
    expect((await f.row()).status).toBe("settled");
  });
  it("blocks overdue instalments instead of silently skipping them and lists only exact authorized payment matches", async () => {
    const f = await fixture();
    const before = await f.row();
    expect(before.disbursement_options?.map((p) => p.line_id)).toContain(f.payment.lineId);
    const wrong = await f.pay({ document_reference: "other-employee" });
    expect((await f.row()).disbursement_options?.some((p) => p.line_id === wrong.lineId)).toBe(false);
    await f.fund();
    const next = (await pool.query("select ($1::date+interval '1 month')::date::text as month", [f.month])).rows[0]
      .month;
    const state = await f.repo.getPayrollRunWorkspace(runActor(), { company_id: f.companyId, month: next });
    expect(state.blocked.join(" ")).toContain("overdue instalments");
  });
});
