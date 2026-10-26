import { PassThrough } from "node:stream";
import { describe, it, expect, vi } from "vitest";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
const csrf = "c".repeat(43),
  cookie = "nexora_session=owned-review-test",
  origin = "https://hr.example.test";
function app() {
  const session = {
      sessionId: "owned-session",
      tenantId: "owned-tenant",
      userId: "owned-user",
      csrfToken: csrf,
      idleExpiresAt: new Date("2099-01-01"),
      absoluteExpiresAt: new Date("2099-01-01"),
    },
    result = {
      id: "record-1",
      company_id: "company-1",
      status: "draft",
      version: 1,
      audit_event_id: "audit-1",
      replayed: false,
    },
    repository = {
      getSettlementBenefits: vi.fn(async () => ({
        company_id: "company-1",
        can_create_rule: false,
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        currencies: [],
        preview: null,
      })),
      actOnSettlementBenefit: vi.fn(async () => result),
      getSettlementEntitlements: vi.fn(async () => ({
        company_id: "company-1",
        can_create_rule: false,
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        leave_types: [],
        currencies: [],
        preview: null,
      })),
      actOnSettlementEntitlement: vi.fn(async () => result),
      getPolicyUpgrades: vi.fn(async () => ({
        company_id: "company-1",
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        can_request: false,
        relationships: [],
        policies: [],
        truncated: false,
      })),
      actOnPolicyUpgrade: vi.fn(async () => result),
      getLifecycleCaseWorkspace: vi.fn(async () => ({
        company_id: "company-1",
        section: "onboarding",
        items: [],
        total: 0,
        limit: 25,
        offset: 0,
        can_create: false,
        relationships: [],
        exits: [],
        currencies: [],
        history: [],
        truncated: false,
      })),
      actOnLifecycleCase: vi.fn(async () => result),
      getPerformanceInbox: vi.fn(async () => ({ items: [], truncated: false })),
      getPerformanceParticipation: vi.fn(async () => ({
        company_id: "company-1",
        cycle_id: "cycle-1",
        mode: "mine",
        can_invite: false,
        items: [],
        reviews: [],
        truncated: false,
      })),
      actOnPerformanceParticipation: vi.fn(async () => result),
    };
  return {
    repository,
    service: createApp({
      config: { allowedOrigins: new Set([origin]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      hrRepository: repository as unknown as SourceHrRepository,
      authService: {
        loadAuthenticatedAccount: vi.fn(async () => ({
          tenantId: session.tenantId,
          userId: session.userId,
          organizationName: "Owned test",
          email: "test@example.test",
          displayName: "Reviewer",
          roles: ["employee"],
          permissions: [],
          sessionVersion: 1,
        })),
      } as unknown as TenantAuthApiService,
      sessionService: {
        get: vi.fn(async () => session),
        authorizeMutation: vi.fn(async (_token: string, value: string) =>
          value === csrf ? { status: "ok", session } : { status: "invalid_csrf" },
        ),
      } as unknown as TenantSessionApiService,
    }),
  };
}
const commands = [
  {
    path: "/api/v1/hr/settlement_benefits/actions",
    method: "actOnSettlementBenefit" as const,
    body: {
      action: "submit_rule",
      company_id: "company-1",
      id: "benefit-rule-1",
      expected_version: 1,
      reason: "Reviewed company benefit for independent approval",
    },
  },
  {
    path: "/api/v1/hr/settlement_entitlements/actions",
    method: "actOnSettlementEntitlement" as const,
    body: {
      action: "approve_rule",
      company_id: "company-1",
      id: "rule-1",
      expected_version: 2,
      reason: "Independent company encashment policy review",
    },
  },
  {
    path: "/api/v1/hr/lifecycle_cases/actions",
    method: "actOnLifecycleCase" as const,
    body: {
      action: "prepare_payroll",
      company_id: "company-1",
      id: "settlement-1",
      expected_version: 3,
      month: "2026-10-01",
      unprocessed_entitlements_only: true,
      mappings: [{ line_index: 0, component_id: "component-1", exclusion_reason: "" }],
      reason: "Reviewed new unpaid settlement entitlement",
    },
  },
  {
    path: "/api/v1/hr/policy_upgrades/actions",
    method: "actOnPolicyUpgrade" as const,
    body: {
      action: "request",
      company_id: "company-1",
      relationship_id: "relationship-1",
      target_policy_id: "replacement-1",
      effective_on: "2026-10-21",
      reason: "Reviewed replacement employment policy request",
    },
  },
  {
    path: "/api/v1/hr/lifecycle_cases/actions",
    method: "actOnLifecycleCase" as const,
    body: {
      action: "save",
      company_id: "company-1",
      id: null,
      expected_version: 0,
      terms: {
        kind: "onboarding",
        relationship_id: "relationship-1",
        due_date: "2026-10-21",
        notes: "Reviewed joining checklist",
        tasks: [{ id: "identity", title: "Identity verification", complete: false, evidence: "" }],
      },
      reason: "Prepare joining checklist",
    },
  },
  {
    path: "/api/v1/hr/performance/participation/actions",
    method: "actOnPerformanceParticipation" as const,
    body: {
      action: "acknowledge",
      company_id: "company-1",
      cycle_id: "cycle-1",
      review_id: "review-1",
      expected_version: 3,
      reason: "I acknowledge receipt of my published assessment",
    },
  },
];
describe("Private Lifecycle and employee-owned Performance HTTP boundary", () => {
  it.each([
    ["/api/v1/hr/settlement_benefits", { company_id: "company-1" }],
    ["/api/v1/hr/settlement_entitlements", { company_id: "company-1" }],
    ["/api/v1/hr/policy_upgrades", { company_id: "company-1" }],
    ["/api/v1/hr/lifecycle_cases", { company_id: "company-1", section: "onboarding" }],
    ["/api/v1/hr/performance/participation", { company_id: "company-1", cycle_id: "cycle-1" }],
    ["/api/v1/hr/performance/inbox", {}],
  ] as const)("requires authentication and prevents caching for %s", async (path, query) => {
    const { service } = app();
    expect((await request(service).get(path).query(query)).status).toBe(401);
    const response = await request(service).get(path).query(query).set("cookie", cookie);
    expect(response.status).toBe(200);
    expect(response.headers["cache-control"]).toBe("no-store");
  });
  it.each(commands)("rejects cross-origin and CSRF failures before $method", async ({ path, method, body }) => {
    const { service, repository } = app();
    for (const foreign of [true, false])
      expect(
        (
          await request(service)
            .post(path)
            .set("cookie", cookie)
            .set("origin", foreign ? "https://foreign.invalid" : origin)
            .set("x-csrf-token", foreign ? csrf : "bad")
            .set("idempotency-key", "owned-review-key")
            .send(body)
        ).status,
      ).toBe(403);
    expect(repository[method]).not.toHaveBeenCalled();
  });
  it.each(commands)(
    "forwards idempotent commands with authenticated ownership context to $method",
    async ({ path, method, body }) => {
      const { service, repository } = app();
      const r = await request(service)
        .post(path)
        .set("cookie", cookie)
        .set("origin", origin)
        .set("x-csrf-token", csrf)
        .set("idempotency-key", "owned-review-key")
        .send(body);
      expect(r.status).toBe(200);
      expect(repository[method]).toHaveBeenCalledWith(
        expect.objectContaining({ tenantId: "owned-tenant", actor: expect.objectContaining({ userId: "owned-user" }) }),
        body,
        "owned-review-key",
        expect.any(String),
      );
    },
  );
  it.each(commands)("rejects client-supplied approval/payment overrides at $method", async ({ path, method, body }) => {
    const { service, repository } = app();
    for (const extra of [{ confirm_override: true }, { payment_status: "paid" }, { decided_by: "other-user" }])
      expect(
        (
          await request(service)
            .post(path)
            .set("cookie", cookie)
            .set("origin", origin)
            .set("x-csrf-token", csrf)
            .set("idempotency-key", "owned-review-key")
            .send({ ...body, ...extra })
        ).status,
      ).toBe(400);
    expect(repository[method]).not.toHaveBeenCalled();
  });
});
