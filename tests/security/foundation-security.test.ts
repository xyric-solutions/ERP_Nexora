import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../../apps/api/src/app.js";
import {
  clearSessionCookie,
  readSessionCookie,
  serializeSessionCookie,
} from "../../apps/api/src/modules/auth/cookies.js";
import { createLogger, createMetrics, redactSensitive } from "../../packages/observability/src/index.js";
import { evaluatePolicy } from "../../packages/auth/src/index.js";
import type { SecurityAdministrationApiRepository } from "../../apps/api/src/modules/security/router.js";

describe("foundation security", () => {
  it("redacts sensitive values recursively", () => {
    const result = redactSensitive({
      password: "secret-value",
      totpSecret: "JBSWY3DPEHPK3PXP",
      recoveryCode: "ABCD-EFGH-JKLM-NPQR",
      employee: { cnic: "12345", salaryPaisa: 900_000, name: "Ayesha" },
    });
    expect(result).toEqual({
      password: "[Redacted]",
      totpSecret: "[Redacted]",
      recoveryCode: "[Redacted]",
      employee: { cnic: "[Redacted]", salaryPaisa: "[Redacted]", name: "Ayesha" },
    });
  });

  it("does not grant CORS credentials to an unapproved origin", async () => {
    const app = createApp({
      config: { allowedOrigins: new Set(["https://hr.example.test"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: {},
      jobPublisher: { publishSample: vi.fn(async () => undefined) },
    });
    const response = await request(app).get("/api/v1/health/live").set("origin", "https://evil.example");
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
    expect(response.headers["x-powered-by"]).toBeUndefined();
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("uses a host-only hardened production session cookie", () => {
    const cookie = serializeSessionCookie(
      "a".repeat(43),
      new Date("2026-10-07T08:30:00.000Z"),
      new Date("2026-10-07T08:00:00.000Z"),
      true,
    );
    expect(cookie).toContain("__Host-nexora_session=");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).not.toContain("Domain=");
    expect(readSessionCookie(cookie, true)).toBe("a".repeat(43));
    expect(clearSessionCookie(true)).toContain("Max-Age=0");
  });

  it("returns a non-enumerating authorization denial without target or field values", () => {
    const decision = evaluatePolicy({ userId: "40000000-0000-4000-8000-000000000001", assuranceLevel: "mfa" }, null, {
      permissionKey: "hr.employee.read",
      targetScope: {
        scopeId: "40000000-0000-4000-8000-000000000002",
        scopeType: "company",
        status: "active",
        enterpriseScopeId: "40000000-0000-4000-8000-000000000003",
        companyScopeId: "40000000-0000-4000-8000-000000000002",
        ancestorScopeIds: ["40000000-0000-4000-8000-000000000003"],
      },
      requestedFields: ["salaryPaisa"],
      evaluatedAt: new Date("2026-10-07T12:00:00.000Z"),
    });
    expect(decision).toEqual({
      allowed: false,
      permissionKey: "hr.employee.read",
      reason: "authentication_required",
    });
    expect(JSON.stringify(decision)).not.toContain("salaryPaisa");
    expect(JSON.stringify(decision)).not.toContain("000000000002");
  });

  it("rejects direct security API calls without a session and mutations without valid CSRF", async () => {
    const repository = Object.fromEntries(
      [
        "listPermissions",
        "listCapabilities",
        "listRoles",
        "listAssignments",
        "listApprovals",
        "listAudit",
        "createRole",
        "actOnRole",
        "createAssignmentRequest",
        "actOnAssignmentRequest",
        "decideApproval",
        "listUsers",
        "getUser",
        "listUserOptions",
        "createUserRequest",
        "actOnUserRequest",
        "actOnUserEmergency",
      ].map((name) => [name, vi.fn()]),
    ) as unknown as SecurityAdministrationApiRepository;
    const session = {
      sessionId: "session-1",
      tenantId: "tenant-a",
      userId: "maker-a",
      csrfToken: "c".repeat(43),
      idleExpiresAt: new Date("2026-10-09T13:00:00.000Z"),
      absoluteExpiresAt: new Date("2026-10-09T20:00:00.000Z"),
    };
    let allowCsrf = false;
    const authorizeMutation = vi.fn(async () =>
      allowCsrf ? { status: "ok" as const, session } : { status: "invalid_csrf" as const, session },
    );
    const securityLog = new PassThrough();
    let securityLogOutput = "";
    securityLog.on("data", (chunk) => {
      securityLogOutput += String(chunk);
    });
    const app = createApp({
      config: { allowedOrigins: new Set(["https://hr.example.test"]) },
      logger: createLogger(securityLog),
      metrics: createMetrics(),
      readiness: {},
      jobPublisher: { publishSample: vi.fn(async () => undefined) },
      securityRepository: repository,
      authService: {
        verifyPasswordCredentials: vi.fn(),
        loadAuthenticatedAccount: vi.fn(async () => ({
          tenantId: "tenant-a",
          userId: "maker-a",
          email: "maker@example.test",
          displayName: "Maker",
          roles: ["maker"],
          permissions: ["security.authorization.role.create"],
        })),
      },
      sessionService: {
        issue: vi.fn(),
        get: vi.fn(async () => null),
        rotate: vi.fn(),
        authorizeMutation,
        logout: vi.fn(),
        logoutAll: vi.fn(),
        revokeToken: vi.fn(),
      },
    });
    const direct = await request(app).get("/api/v1/security/roles");
    expect(direct.status).toBe(401);
    expect(direct.body.code).toBe("INVALID_SESSION");
    const directUsers = await request(app).get("/api/v1/security/users");
    expect(directUsers.status).toBe(401);
    expect(directUsers.body.code).toBe("INVALID_SESSION");

    const userMutation = await request(app)
      .post("/api/v1/security/user_requests")
      .set("cookie", "nexora_session=" + "s".repeat(64))
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", "invalid")
      .set("idempotency-key", "security-user-csrf-test")
      .send({
        requested_action: "create",
        proposal: {
          display_name: "Denied User",
          username: "denied.user",
          email: "denied.user@example.test",
          employee_id: null,
          companies: [{ company_id: "company-a", is_default: true }],
          initial_role_policy_ids: [],
        },
      });
    expect(userMutation.status).toBe(403);
    expect(userMutation.body.code).toBe("CSRF_VALIDATION_FAILED");
    expect(repository.createUserRequest).not.toHaveBeenCalled();

    const mutation = await request(app)
      .post("/api/v1/security/roles")
      .set("cookie", "nexora_session=" + "s".repeat(64))
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", "invalid")
      .set("idempotency-key", "security-csrf-test")
      .send({
        role_code: "test_role",
        display_name: "Test role",
        description: "",
        permissions: ["security.authorization.audit.read"],
        scope: { mode: "tenant", company_ids: [] },
        field_rules: { allow: null, deny: [] },
        sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
        allowed_source_states: {},
        delegations: [],
      });
    expect(mutation.status).toBe(403);
    expect(mutation.body.code).toBe("CSRF_VALIDATION_FAILED");
    expect(repository.createRole).not.toHaveBeenCalled();

    allowCsrf = true;
    const accepted = await request(app)
      .post("/api/v1/security/roles")
      .set("cookie", "nexora_session=" + "s".repeat(64))
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", "c".repeat(43))
      .set("idempotency-key", "security-accepted-test")
      .send({
        role_code: "test_role",
        display_name: "Test role",
        description: "",
        permissions: ["security.authorization.audit.read"],
        scope: { mode: "tenant", company_ids: [] },
        field_rules: { allow: null, deny: [] },
        sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
        allowed_source_states: {},
        delegations: [],
      });
    expect(accepted.status, securityLogOutput).toBe(201);
    expect(repository.createRole).toHaveBeenCalledOnce();
  });
});
