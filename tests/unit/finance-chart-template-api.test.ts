import { PassThrough } from "node:stream";
import request from "supertest";
import { describe, expect, it, vi } from "vitest";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { ChartTemplateRepository } from "../../server/api/src/modules/finance/templates/service.js";
import { ChartTemplateError } from "../../server/api/src/modules/finance/templates/source-repository.js";
const session = {
  sessionId: "ct-session",
  tenantId: "ct-tenant",
  userId: "ct-user",
  csrfToken: "c".repeat(43),
  idleExpiresAt: new Date("2099-01-01"),
  absoluteExpiresAt: new Date("2099-01-01"),
};
const input = {
  catalog_key: "synthetic",
  name: "Synthetic",
  revision: "v1",
  source_filename: "source.xlsx",
  source_sha256: "a".repeat(64),
  categories: [{ key: "expense", name: "Expense", type: "expense" as const }],
  sections: [{ code: "71", name: "Wages", category_key: "expense" }],
  nominals: [{ code: "7101", name: "Salaries", section_code: "71", source_rows: [{ source: "synthetic", row: 1 }] }],
};
const template = {
  id: "chart-one",
  catalog_key: input.catalog_key,
  name: input.name,
  revision: input.revision,
  source_filename: input.source_filename,
  source_sha256: input.source_sha256,
  content_sha256: "b".repeat(64),
  category_count: 1,
  section_count: 1,
  nominal_count: 1,
  state: "draft" as const,
  version: 1,
  created_at: "2026-10-20T00:00:00.000Z",
  published_at: null,
};
function setup() {
  const result = { template, audit_event_id: "audit-one", replayed: false };
  const repository: ChartTemplateRepository = {
    adoptCompany: vi.fn(),
    classifyNominal: vi.fn(),
    companyPreview: vi.fn(),
    list: vi.fn(async () => ({ items: [template], next_cursor: null })),
    get: vi.fn(async () => template),
    nodes: vi.fn(async () => ({ items: [], next_cursor: null })),
    import: vi.fn(async () => result),
    publish: vi.fn(async () => result),
  };
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      organizationName: "Synthetic",
      displayName: "Synthetic",
      email: "ct@example.test",
      roles: [],
      permissions: ["finance.chart_template.read", "finance.chart_template.admin"],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return {
    repository,
    app: createApp({
      config: { allowedOrigins: new Set(["https://ct.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      authService: authentication,
      sessionService: sessions,
      chartTemplateRepository: repository,
    }),
  };
}
describe("Central Chart template HTTP boundary", () => {
  it("protects adoption and classification with session, CSRF, origin, versions and bounded bodies", async () => {
    const { app, repository } = setup();
    const payload = {
      company_id: "company-one",
      currency: "USD",
      expected_template_version: 2,
      preview_sha256: "a".repeat(64),
    };
    const send = (csrf: string, version: string, body: unknown = payload) =>
      request(app)
        .post("/api/v1/finance/chart_templates/chart-one/company_adoption")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "adopt-one")
        .set("if-match", version)
        .send(body);
    expect((await send("wrong", '"2"')).status).toBe(403);
    expect((await send(session.csrfToken, '"1"')).status).toBe(412);
    expect((await send(session.csrfToken, '"2"', { ...payload, activate: true })).status).toBe(400);
    expect(repository.adoptCompany).not.toHaveBeenCalled();
    vi.mocked(repository.adoptCompany).mockResolvedValueOnce({
      adoption_id: "adopt-one",
      company_id: "company-one",
      template_id: "chart-one",
      created_categories: 1,
      created_sections: 1,
      created_nominals: 1,
      matched_accounts: 0,
      bank_references: 0,
      audit_event_id: "audit-one",
      replayed: false,
    });
    expect((await send(session.csrfToken, '"2"')).status).toBe(201);
    const classify = () =>
      request(app)
        .post("/api/v1/finance/chart_templates/company_nominals/nominal-one/classification")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "review-one")
        .set("if-match", '"1"');
    expect(
      (
        await classify()
          .set("origin", "https://hostile.test")
          .send({ expected_version: 1, classification: "ordinary", reason: "Synthetic review" })
      ).status,
    ).toBe(403);
    expect(
      (await classify().send({ expected_version: 1, classification: "unrestricted", reason: "Synthetic review" }))
        .status,
    ).toBe(400);
    expect(repository.classifyNominal).not.toHaveBeenCalled();
    vi.mocked(repository.classifyNominal).mockRejectedValueOnce(
      new ChartTemplateError(403, "COMPANY_ACCESS_DENIED", "Denied"),
    );
    expect(
      (await classify().send({ expected_version: 1, classification: "ordinary", reason: "Synthetic review" })).status,
    ).toBe(403);
  });
  it("validates read-only company preview inputs and preserves scoped errors", async () => {
    const { app, repository } = setup();
    const preview = (query: string) =>
      request(app)
        .get(`/api/v1/finance/chart_templates/chart-one/company_preview${query}`)
        .set("cookie", "nexora_session=token");
    expect((await preview("?company_id=company-one&currency=usd")).status).toBe(400);
    expect((await preview("?company_id=company-one&currency=USD&limit=101")).status).toBe(400);
    expect((await preview("?currency=USD")).status).toBe(400);
    expect(repository.companyPreview).not.toHaveBeenCalled();
    vi.mocked(repository.companyPreview).mockRejectedValueOnce(
      new ChartTemplateError(403, "PERMISSION_DENIED", "Company access denied"),
    );
    const response = await preview("?company_id=company-one&currency=USD&limit=50");
    expect(response.status).toBe(403);
    expect(repository.companyPreview).toHaveBeenCalledOnce();
    expect(repository.import).not.toHaveBeenCalled();
    expect(repository.publish).not.toHaveBeenCalled();
  });
  it("requires a session and rejects spoofed tenants", async () => {
    const { app, repository } = setup();
    expect((await request(app).get("/api/v1/finance/chart_templates")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/finance/chart_templates")
          .set("cookie", "nexora_session=token")
          .set("x-tenant-id", "other")
      ).status,
    ).toBe(403);
    expect(repository.list).not.toHaveBeenCalled();
  });
  it("enforces CSRF, allowed origin and import request keys", async () => {
    const { app, repository } = setup();
    const send = (csrf: string, origin: string, key?: string) => {
      const req = request(app)
        .post("/api/v1/finance/chart_templates")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", csrf)
        .set("origin", origin);
      if (key) req.set("idempotency-key", key);
      return req.send(input);
    };
    expect((await send("wrong", "https://ct.example.test", "one")).status).toBe(403);
    expect((await send(session.csrfToken, "https://hostile.test", "one")).status).toBe(403);
    expect((await send(session.csrfToken, "https://ct.example.test")).status).toBe(400);
    expect(repository.import).not.toHaveBeenCalled();
    const accepted = await send(session.csrfToken, "https://ct.example.test", "one");
    expect(accepted.status).toBe(201);
    expect(accepted.headers["cache-control"]).toBe("no-store");
  });
  it("bounds page inputs and validates hierarchy before repository writes", async () => {
    const { app, repository } = setup();
    expect(
      (
        await request(app)
          .get("/api/v1/finance/chart_templates/chart-one/nodes?limit=999")
          .set("cookie", "nexora_session=token")
      ).status,
    ).toBe(400);
    expect(
      (
        await request(app)
          .post("/api/v1/finance/chart_templates")
          .set("cookie", "nexora_session=token")
          .set("x-csrf-token", session.csrfToken)
          .set("idempotency-key", "bad")
          .send({ ...input, sections: [{ ...input.sections[0], category_key: "missing" }] })
      ).status,
    ).toBe(400);
    expect(repository.nodes).not.toHaveBeenCalled();
    expect(repository.import).not.toHaveBeenCalled();
  });
  it("requires matching If-Match for publication and returns normal scoped problems", async () => {
    const { app, repository } = setup();
    const send = (etag: string) =>
      request(app)
        .post("/api/v1/finance/chart_templates/chart-one/publish")
        .set("cookie", "nexora_session=token")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", "publish")
        .set("if-match", etag)
        .send({ expected_version: 1 });
    expect((await send('"2"')).status).toBe(412);
    expect(repository.publish).not.toHaveBeenCalled();
    expect((await send('"1"')).status).toBe(200);
    vi.mocked(repository.get).mockRejectedValueOnce(new ChartTemplateError(403, "PERMISSION_DENIED", "Denied"));
    expect(
      (await request(app).get("/api/v1/finance/chart_templates/chart-one").set("cookie", "nexora_session=token"))
        .status,
    ).toBe(403);
  });
});
