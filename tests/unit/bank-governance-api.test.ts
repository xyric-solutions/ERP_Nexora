import { PassThrough } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import request from "supertest";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
const session = {
  sessionId: "synthetic",
  tenantId: "tenant-one",
  userId: "admin-one",
  csrfToken: "synthetic-csrf",
  idleExpiresAt: new Date(),
  absoluteExpiresAt: new Date(),
};
const input = {
  company_id: "company-one",
  transaction_kind: "payment",
  user_id: "maker-one",
  expected_version: 0,
  state: "active",
  reason: "Synthetic governed test",
};
function application() {
  const repo = {
    list: vi.fn(async () => ({ items: [], next_cursor: null })),
    options: vi.fn(async () => ({ companies: [], users: [], next_cursor: null })),
    change: vi.fn(async () => ({ record: { version: 1 }, replayed: false })),
  };
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: session.tenantId,
      userId: session.userId,
      roles: ["super_administrator"],
      permissions: [
        "platform.approval.override",
        "security.bank_self_approval.read",
        "security.bank_self_approval.manage",
      ],
      organizationName: "Synthetic",
      email: "synthetic@example.invalid",
      displayName: "Synthetic",
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok", session } : { status: "invalid_csrf" },
    ),
  } as unknown as TenantSessionApiService;
  // API boundary fixtures intentionally stub persistence; repository integration
  // tests separately exercise actual global grants, tenant/company scope and audit.
  const app = createApp({
    config: { allowedOrigins: new Set(["https://erp.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
    bankSelfApprovalRepository: repo as unknown as NonNullable<
      Parameters<typeof createApp>[0]["bankSelfApprovalRepository"]
    >,
  });
  return { app, repo };
}
describe("Bank grant API boundary", () => {
  it("requires a session for directory reads and rejects tenant spoofing", async () => {
    const { app, repo } = application();
    expect((await request(app).get("/api/v1/security/bank_self_approval_options")).status).toBe(401);
    expect(
      (
        await request(app)
          .get("/api/v1/security/bank_self_approval_options")
          .set("cookie", "nexora_session=synthetic")
          .set("x-tenant-id", "forged")
      ).status,
    ).toBe(403);
    expect(repo.options).not.toHaveBeenCalled();
  });
  it("enforces CSRF, Origin, retry keys and expected-version headers before mutation", async () => {
    const { app, repo } = application();
    for (const [origin, csrf, key, version, status] of [
      ["https://hostile.test", session.csrfToken, "key", '"0"', 403],
      ["https://erp.example.test", "bad", "key", '"0"', 403],
      ["https://erp.example.test", session.csrfToken, "", '"0"', 400],
      ["https://erp.example.test", session.csrfToken, "key", '"1"', 412],
    ] as const) {
      const result = await request(app)
        .post("/api/v1/security/bank_self_approval_grants")
        .set("cookie", "nexora_session=synthetic")
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", key)
        .set("if-match", version)
        .send(input);
      expect(result.status).toBe(status);
    }
    expect(repo.change).not.toHaveBeenCalled();
  });
  it("dispatches typed grant changes using the authenticated tenant, not a browser tenant", async () => {
    const { app, repo } = application();
    const result = await request(app)
      .post("/api/v1/security/bank_self_approval_grants")
      .set("cookie", "nexora_session=synthetic")
      .set("origin", "https://erp.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "synthetic-key")
      .set("if-match", '"0"')
      .send(input);
    expect(result.status).toBe(200);
    expect(result.headers.etag).toBe('"1"');
    expect(repo.change).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-one" }),
      input,
      "synthetic-key",
      expect.any(String),
    );
  });
  it("bounds directories and rejects unknown authority fields", async () => {
    const { app, repo } = application();
    for (const query of [
      "company_id=company-one&transaction_kind=payment&limit=101",
      "company_id=company-one&transaction_kind=payment&tenant_id=forged",
    ])
      expect(
        (
          await request(app)
            .get(`/api/v1/security/bank_self_approval_grants?${query}`)
            .set("cookie", "nexora_session=synthetic")
        ).status,
      ).toBe(400);
    expect(repo.list).not.toHaveBeenCalled();
  });
});
