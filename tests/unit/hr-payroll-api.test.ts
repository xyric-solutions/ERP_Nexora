import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const csrf = "c".repeat(43),
  cookie = "nexora_session=payroll-test";
const session = {
  sessionId: "payroll-session",
  tenantId: "tenant-payroll",
  userId: "payroll-user",
  csrfToken: csrf,
  idleExpiresAt: new Date("2099-01-01"),
  absoluteExpiresAt: new Date("2099-01-01"),
};
function app() {
  const repository = {
    getPayslipWorkspace: vi.fn(async () => ({ items: [], total: 0 })),
    getPayslipDetail: vi.fn(async () => ({ document: {}, release: null })),
    releasePayslips: vi.fn(async () => ({
      id: "slip-1",
      company_id: "company-1",
      status: "released",
      version: 1,
      audit_event_id: "event-slip",
      replayed: false,
    })),
    getPayrollPaymentWorkspace: vi.fn(async () => ({ batch: null, payments: [] })),
    actOnPayrollPayment: vi.fn(async () => ({
      id: "batch-1",
      company_id: "company-1",
      status: "draft",
      version: 1,
      audit_event_id: "event-1",
      replayed: false,
    })),
    getPayrollLocalization: vi.fn(async () => ({ items: [], total: 0 })),
    createPayrollLocalization: vi.fn(async () => ({
      id: "setup-1",
      company_id: "company-1",
      status: "draft",
      version: 1,
      audit_event_id: "event-setup",
      replayed: false,
    })),
    decidePayrollLocalization: vi.fn(async () => ({
      id: "setup-1",
      company_id: "company-1",
      status: "submitted",
      version: 2,
      audit_event_id: "event-setup",
      replayed: false,
    })),

    getOvertimeMoneyWorkspace: vi.fn(async () => ({ items: [], total: 0 })),
    createOvertimeMoney: vi.fn(async () => ({
      id: "ot-policy-1",
      company_id: "company-1",
      status: "draft",
      version: 1,
      audit_event_id: "event-1",
      replayed: false,
    })),
    decideOvertimeMoney: vi.fn(async () => ({
      id: "ot-policy-1",
      company_id: "company-1",
      status: "submitted",
      version: 2,
      audit_event_id: "event-1",
      replayed: false,
    })),
    getPayrollRunComparison: vi.fn(async () => ({
      company_id: "company-1",
      month: "2026-10-01",
      period_id: "period-1",
      period_version: 2,
      current_run_number: 1,
      baseline_run_number: null,
      currency_code: "PKR",
      source_hash: "a".repeat(64),
      runs: [{ run_number: 1, employee_count: 1, calculated_at: "2026-10-21T10:00:00Z" }],
      counts: { amount_changed: 0, evidence_changed: 0, added: 1, removed: 0, unchanged: 0 },
      current_totals: { gross: "100.0000", deductions: "0.0000", net: "100.0000", employer_contributions: "0.0000" },
      baseline_totals: null,
      delta: { gross: "100.0000", deductions: "0.0000", net: "100.0000", employer_contributions: "0.0000" },
      items: [],
      total: 0,
      limit: 25,
      offset: 0,
    })),
    getPayrollRunWorkspace: vi.fn(async () => ({ period: null, employees: [], total: 0 })),
    actOnPayrollRun: vi.fn(async () => ({
      id: "period-1",
      company_id: "company-1",
      status: "calculated",
      version: 2,
      audit_event_id: "event-1",
      replayed: false,
    })),
    getPayrollWorkspace: vi.fn(async () => ({ items: [], total: 0 })),
    getPayrollOptions: vi.fn(async () => ({
      employees: [],
      components: [],
      accounts: [],
      structures: [],
      truncated: false,
    })),
    createPayrollRecord: vi.fn(async () => ({
      id: "payroll-1",
      company_id: "company-1",
      status: "active",
      version: 1,
      audit_event_id: "event-1",
      replayed: false,
    })),
    actOnPayrollRecord: vi.fn(async () => ({
      id: "payroll-1",
      company_id: "company-1",
      status: "approved",
      version: 3,
      audit_event_id: "event-1",
      replayed: false,
    })),
  };
  const service = createApp({
    config: { allowedOrigins: new Set(["https://payroll.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    hrRepository: repository as unknown as SourceHrRepository,
    authService: {
      loadAuthenticatedAccount: vi.fn(async () => ({
        tenantId: session.tenantId,
        userId: session.userId,
        organizationName: "Payroll test",
        email: "payroll@example.test",
        displayName: "Payroll user",
        roles: ["hr_manager"],
        permissions: ["hr.payroll.setup.read", "hr.payroll.setup.manage"],
        sessionVersion: 1,
      })),
    } as unknown as TenantAuthApiService,
    sessionService: {
      get: vi.fn(async () => session),
      authorizeMutation: vi.fn(async (_token: string, value: string) =>
        value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
      ),
    } as unknown as TenantSessionApiService,
  });
  return { service, repository };
}
const input = {
  kind: "component",
  company_id: "company-1",
  code: "BASIC",
  name: "Basic salary",
  component_kind: "earning",
  method: "fixed",
  formula: null,
  taxable: true,
  prorated: true,
  account_id: "expense-1",
  position: 1,
  reason: "Controlled Payroll configuration",
};
describe("Payroll API boundary", () => {
  it("requires authentication for persisted reads", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .get("/api/v1/hr/payroll_workspace")
          .query({ company_id: "company-1", section: "components", month: "2026-10-01" })
      ).status,
    ).toBe(401);
    expect(repository.getPayrollWorkspace).not.toHaveBeenCalled();
  });
  it("coerces bounded pagination and passes authenticated company context", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .get("/api/v1/hr/payroll_workspace")
      .set("cookie", cookie)
      .query({ company_id: "company-1", section: "components", month: "2026-10-01", limit: "10", offset: "5" });
    expect(response.status).toBe(200);
    expect(repository.getPayrollWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ limit: 10, offset: 5 }),
    );
  });
  it("rejects invalid section and month before reading business data", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .get("/api/v1/hr/payroll_workspace")
          .set("cookie", cookie)
          .query({ company_id: "company-1", section: "anything", month: "2026-10-02", limit: 999 })
      ).status,
    ).toBe(400);
    expect(repository.getPayrollWorkspace).not.toHaveBeenCalled();
  });
  it("rejects a foreign origin before any financial mutation", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .post("/api/v1/hr/payroll_records")
          .set("cookie", cookie)
          .set("origin", "https://foreign.invalid")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", "payroll-route-test")
          .send(input)
      ).status,
    ).toBe(403);
    expect(repository.createPayrollRecord).not.toHaveBeenCalled();
  });
  it("requires CSRF and idempotency for mutations", async () => {
    const { service, repository } = app();
    const a = await request(service)
      .post("/api/v1/hr/payroll_records")
      .set("cookie", cookie)
      .set("idempotency-key", "payroll-route-test")
      .send(input);
    expect(a.status).toBe(403);
    const b = await request(service)
      .post("/api/v1/hr/payroll_records")
      .set("cookie", cookie)
      .set("x-csrf-token", csrf)
      .send(input);
    expect(b.status).toBe(400);
    expect(repository.createPayrollRecord).not.toHaveBeenCalled();
  });
  it("validates and passes a permitted create request to the single API authority", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .post("/api/v1/hr/payroll_records")
      .set("cookie", cookie)
      .set("origin", "https://payroll.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "payroll-route-test")
      .send(input);
    expect(response.status).toBe(200);
    expect(repository.createPayrollRecord).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      input,
      "payroll-route-test",
      expect.any(String),
    );
  });
  it("does not accept execution actions through the configuration API", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .post("/api/v1/hr/payroll_records/payroll-1/actions")
      .set("cookie", cookie)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "payroll-route-test")
      .send({
        company_id: "company-1",
        section: "runs",
        action: "posted",
        reason: "Must use Finance workflow",
        expected_version: 1,
        source_hash: "a".repeat(64),
      });
    expect(response.status).toBe(400);
    expect(repository.actOnPayrollRecord).not.toHaveBeenCalled();
  });

  it("serves private run comparisons with validated bounds and the authenticated tenant", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .get("/api/v1/hr/payroll_runs/comparison")
      .set("cookie", cookie)
      .query({
        company_id: "company-1",
        month: "2026-10-01",
        expected_run_number: "1",
        filter: "all",
        limit: "10",
        offset: "2",
      });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(repository.getPayrollRunComparison).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ expected_run_number: 1, filter: "all", limit: 10, offset: 2 }),
    );
  });
  it("requires an authenticated session before disclosing comparison wages", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .get("/api/v1/hr/payroll_runs/comparison")
      .query({ company_id: "company-1", month: "2026-10-01", expected_run_number: 1 });
    expect(r.status).toBe(401);
    expect(repository.getPayrollRunComparison).not.toHaveBeenCalled();
    expect(r.headers["cache-control"]).toBe("no-store");
  });
  it.each([
    { expected_run_number: 0 },
    { expected_run_number: "1.5" },
    { baseline_run_number: -1 },
    { limit: 51 },
    { offset: -1 },
    { filter: "paid" },
    { month: "2026-10-02" },
    { bank_account_id: "foreign" },
  ])("rejects invalid comparison queries: %j", async (extra) => {
    const { service, repository } = app();
    const r = await request(service)
      .get("/api/v1/hr/payroll_runs/comparison")
      .set("cookie", cookie)
      .query({ company_id: "company-1", month: "2026-10-01", expected_run_number: 1, ...extra });
    expect(r.status).toBe(400);
    expect(repository.getPayrollRunComparison).not.toHaveBeenCalled();
  });
  it("serves bounded Payroll run reads with authenticated context", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .get("/api/v1/hr/payroll_runs")
      .set("cookie", cookie)
      .query({ company_id: "company-1", month: "2026-10-01", limit: "10", offset: "2" });
    expect(response.status).toBe(200);
    expect(repository.getPayrollRunWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ limit: 10, offset: 2 }),
    );
    const invalid = await request(service)
      .get("/api/v1/hr/payroll_runs")
      .set("cookie", cookie)
      .query({ company_id: "company-1", month: "2026-10-01", limit: 999 });
    expect(invalid.status).toBe(400);
  });
  it("requires trusted origin, CSRF and valid action for Payroll execution", async () => {
    const { service, repository } = app(),
      body = {
        company_id: "company-1",
        month: "2026-10-01",
        action: "calculate",
        reason: "Governed calculation request",
        expected_version: 1,
        source_hash: "a".repeat(64),
      };
    const foreign = await request(service)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", cookie)
      .set("origin", "https://foreign.invalid")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "run-route-acceptance")
      .send(body);
    expect(foreign.status).toBe(403);
    const missing = await request(service)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", cookie)
      .set("idempotency-key", "run-route-acceptance")
      .send(body);
    expect(missing.status).toBe(403);
    const invalid = await request(service)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", cookie)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "run-route-acceptance")
      .send({ ...body, action: "post_money" });
    expect(invalid.status).toBe(400);
    expect(repository.actOnPayrollRun).not.toHaveBeenCalled();
  });
  it("passes a valid execution request and idempotency key to Payroll authority", async () => {
    const { service, repository } = app(),
      body = {
        company_id: "company-1",
        month: "2026-10-01",
        action: "calculate",
        reason: "Governed calculation request",
        expected_version: 1,
        source_hash: "a".repeat(64),
        confirm_override: false,
      };
    const response = await request(service)
      .post("/api/v1/hr/payroll_runs/actions")
      .set("cookie", cookie)
      .set("origin", "https://payroll.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "run-route-acceptance")
      .send(body);
    expect(response.status).toBe(200);
    expect(repository.actOnPayrollRun).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      body,
      "run-route-acceptance",
      expect.any(String),
    );
  });

  it("serves bounded monetary overtime setup queries under the authenticated tenant", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .get("/api/v1/hr/payroll_overtime")
      .set("cookie", cookie)
      .query({ company_id: "company-1", section: "policies", on_date: "2026-10-01", limit: 10, offset: 2 });
    expect(response.status).toBe(200);
    expect(repository.getOvertimeMoneyWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ section: "policies", limit: 10, offset: 2 }),
    );
    const invalid = await request(service)
      .get("/api/v1/hr/payroll_overtime")
      .set("cookie", cookie)
      .query({ company_id: "company-1", section: "policies", on_date: "2026-10-01", limit: 51 });
    expect(invalid.status).toBe(400);
  });
  it("validates a monetary arrangement and forwards its idempotency key", async () => {
    const { service, repository } = app(),
      body = {
        company_id: "company-1",
        kind: "arrangement",
        employee_id: "employee-1",
        policy_version_id: "policy-1",
        direct_rate: null,
        effective_from: "2026-10-01",
        effective_to: null,
        reason: "Create approved policy arrangement draft",
      };
    const response = await request(service)
      .post("/api/v1/hr/payroll_overtime")
      .set("cookie", cookie)
      .set("origin", "https://payroll.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "ot-route-acceptance")
      .send(body);
    expect(response.status).toBe(200);
    expect(repository.createOvertimeMoney).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      body,
      "ot-route-acceptance",
      expect.any(String),
    );
  });
  it("requires CSRF and trusted origin for monetary decisions", async () => {
    const { service, repository } = app(),
      body = {
        company_id: "company-1",
        kind: "policy",
        action: "submit",
        expected_version: 1,
        source_hash: "a".repeat(64),
        reason: "Submit reviewed monetary authority",
        confirm_override: false,
      };
    const foreign = await request(service)
      .post("/api/v1/hr/payroll_overtime/ot-policy-1/actions")
      .set("cookie", cookie)
      .set("origin", "https://foreign.invalid")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "ot-route-acceptance")
      .send(body);
    expect(foreign.status).toBe(403);
    const missing = await request(service)
      .post("/api/v1/hr/payroll_overtime/ot-policy-1/actions")
      .set("cookie", cookie)
      .set("idempotency-key", "ot-route-acceptance")
      .send(body);
    expect(missing.status).toBe(403);
    expect(repository.decideOvertimeMoney).not.toHaveBeenCalled();
  });
  it("rejects unsupported custom monetary policy terms at the API boundary", async () => {
    const { service, repository } = app();
    const response = await request(service)
      .post("/api/v1/hr/payroll_overtime")
      .set("cookie", cookie)
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "ot-route-acceptance")
      .send({
        company_id: "company-1",
        kind: "policy",
        reference: "CUSTOM",
        name: "Unsupported conversion",
        effective_from: "2026-10-01",
        effective_to: null,
        reason: "Unsupported conversion must fail",
        terms: { rate_basis_method: "custom" },
      });
    expect(response.status).toBe(400);
    expect(repository.createOvertimeMoney).not.toHaveBeenCalled();
  });
});

describe("Statutory setup HTTP boundary", () => {
  const setup = {
    company_id: "company-1",
    terms: {
      kind: "payroll_configuration",
      currency_code: "PKR",
      payroll_frequency: "monthly",
      effective_from: "2026-10-01",
      effective_to: null,
    },
    reason: "Reviewed statutory configuration",
    source_reference: "Reviewed company currency authority",
  };
  it("requires a session for statutory setup reads", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .get("/api/v1/hr/payroll_localization")
          .query({ company_id: "company-1", kind: "legal_profile", on_date: "2026-10-01" })
      ).status,
    ).toBe(401);
    expect(repository.getPayrollLocalization).not.toHaveBeenCalled();
  });
  it("coerces bounded queries and forwards authenticated company context", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .get("/api/v1/hr/payroll_localization")
          .set("cookie", cookie)
          .query({ company_id: "company-1", kind: "declaration", on_date: "2026-10-01", limit: "10", offset: "5" })
      ).status,
    ).toBe(200);
    expect(repository.getPayrollLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ kind: "declaration", limit: 10, offset: 5 }),
    );
    expect(
      (
        await request(service)
          .get("/api/v1/hr/payroll_localization")
          .set("cookie", cookie)
          .query({ company_id: "company-1", kind: "legal_profile", on_date: "2026-10-01", limit: "501" })
      ).status,
    ).toBe(400);
  });
  it("enforces trusted origins and CSRF before statutory mutations", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .post("/api/v1/hr/payroll_localization")
          .set("cookie", cookie)
          .set("origin", "https://payroll.example.test")
          .set("idempotency-key", "setup-key-1")
          .send(setup)
      ).status,
    ).toBe(403);
    expect(
      (
        await request(service)
          .post("/api/v1/hr/payroll_localization")
          .set("cookie", cookie)
          .set("origin", "https://foreign.example.test")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", "setup-key-1")
          .send(setup)
      ).status,
    ).toBe(403);
    expect(repository.createPayrollLocalization).not.toHaveBeenCalled();
  });
  it("forwards validated drafts and idempotency keys", async () => {
    const { service, repository } = app();
    expect(
      (
        await request(service)
          .post("/api/v1/hr/payroll_localization")
          .set("cookie", cookie)
          .set("origin", "https://payroll.example.test")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", "setup-key-1")
          .send(setup)
      ).status,
    ).toBe(200);
    expect(repository.createPayrollLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      setup,
      "setup-key-1",
      expect.any(String),
    );
  });
  it("rejects unknown mode switches and unsupported Payroll frequencies", async () => {
    const { service, repository } = app();
    for (const input of [
      { ...setup, mode: "test" },
      { ...setup, terms: { ...setup.terms, payroll_frequency: "weekly" } },
    ])
      expect(
        (
          await request(service)
            .post("/api/v1/hr/payroll_localization")
            .set("cookie", cookie)
            .set("origin", "https://payroll.example.test")
            .set("x-csrf-token", csrf)
            .set("idempotency-key", "setup-key-1")
            .send(input)
        ).status,
      ).toBe(400);
    expect(repository.createPayrollLocalization).not.toHaveBeenCalled();
  });
  it("forwards the reviewed version and fingerprint for decisions", async () => {
    const { service, repository } = app(),
      input = {
        company_id: "company-1",
        action: "approve",
        expected_version: 2,
        source_hash: "a".repeat(64),
        reason: "Independent statutory review",
        confirm_override: false,
      };
    expect(
      (
        await request(service)
          .post("/api/v1/hr/payroll_localization/setup-1/actions")
          .set("cookie", cookie)
          .set("origin", "https://payroll.example.test")
          .set("x-csrf-token", csrf)
          .set("idempotency-key", "setup-review-1")
          .send(input)
      ).status,
    ).toBe(200);
    expect(repository.decidePayrollLocalization).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      "setup-1",
      input,
      "setup-review-1",
      expect.any(String),
    );
  });
});

describe("Deferred salary Banking integration", () => {
  it("keeps payment reads authenticated and explicitly unavailable until Banking handoff", async () => {
    const { service, repository } = app();
    const query = { company_id: "company-1", month: "2026-10-01" };
    expect((await request(service).get("/api/v1/hr/payroll_payments").query(query)).status).toBe(401);
    const response = await request(service).get("/api/v1/hr/payroll_payments").set("cookie", cookie).query(query);
    expect(response.status).toBe(409);
    expect(response.body.code ?? response.body.type).toBeTruthy();
    expect(repository.getPayrollPaymentWorkspace).not.toHaveBeenCalled();
  });
});

describe("Payslips authenticated API boundary", () => {
  const query = { company_id: "company-1", month: "2026-10-01" },
    body = {
      ...query,
      result_ids: ["result-1"],
      source_hash: "a".repeat(64),
      reason: "Independent exact payslip publication",
    };
  it("requires authentication for private salary documents", async () => {
    const { service, repository } = app();
    expect((await request(service).get("/api/v1/hr/payslips/result-1").query({ company_id: "company-1" })).status).toBe(
      401,
    );
    expect(repository.getPayslipDetail).not.toHaveBeenCalled();
  });
  it("passes bounded company queries and disables HTTP caching", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .get("/api/v1/hr/payslips")
      .set("cookie", cookie)
      .query({ ...query, limit: "10" });
    expect(r.status).toBe(200);
    expect(r.headers["cache-control"]).toBe("no-store");
    expect(repository.getPayslipWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      expect.objectContaining({ company_id: "company-1", limit: 10, offset: 0 }),
    );
  });
  it("requires company context for document access", async () => {
    const { service, repository } = app();
    expect((await request(service).get("/api/v1/hr/payslips/result-1").set("cookie", cookie)).status).toBe(400);
    expect(repository.getPayslipDetail).not.toHaveBeenCalled();
  });
  it("rejects CSRF failures and browser money inputs before publication", async () => {
    const { service, repository } = app();
    for (const variant of ["csrf", "amount"]) {
      const r = await request(service)
        .post("/api/v1/hr/payslips/releases")
        .set("cookie", cookie)
        .set("origin", "https://payroll.example.test")
        .set("x-csrf-token", variant === "csrf" ? "bad" : csrf)
        .set("idempotency-key", "payslip-route-key")
        .send(variant === "amount" ? { ...body, net: "1" } : body);
      expect(r.status).toBe(variant === "csrf" ? 403 : 400);
    }
    expect(repository.releasePayslips).not.toHaveBeenCalled();
  });
  it("passes explicit idempotent publication commands to the authenticated repository", async () => {
    const { service, repository } = app();
    const r = await request(service)
      .post("/api/v1/hr/payslips/releases")
      .set("cookie", cookie)
      .set("origin", "https://payroll.example.test")
      .set("x-csrf-token", csrf)
      .set("idempotency-key", "payslip-route-key")
      .send(body);
    expect(r.status).toBe(200);
    expect(repository.releasePayslips).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: session.tenantId }),
      body,
      "payslip-route-key",
      expect.any(String),
    );
  });
});
