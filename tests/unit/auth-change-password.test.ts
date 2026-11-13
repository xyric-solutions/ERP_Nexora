import { PassThrough } from "node:stream";

import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import {
  hashPassword,
  PasswordPolicyError,
  TenantAuthenticationService,
  type AuthenticatedAccount,
  type LoginThrottleStore,
  type TenantAuthenticationRepository,
} from "../../packages/auth/src/index.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";

const origin = "https://erp.example.test";
const account: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user@example.test",
  displayName: "User A",
  roles: ["operator"],
  permissions: ["hr.employee.read"],
  sessionVersion: 3,
};

function throttle(blockedUntil: Date | null = null): LoginThrottleStore {
  return {
    findBlockedUntil: vi.fn(async () => blockedUntil),
    recordFailure: vi.fn(async () => null),
    clear: vi.fn(async () => undefined),
  };
}

async function serviceWith(
  options: {
    currentPassword?: string;
    throttleStore?: LoginThrottleStore;
    changed?: boolean;
    policy?: { minimumLength: number; requireSymbol: boolean };
  } = {},
) {
  const encodedPasswordHash = await hashPassword(options.currentPassword ?? "Current-phrase-1");
  const repository: TenantAuthenticationRepository = {
    resolveLoginCandidates: vi.fn(async () => []),
    findPasswordCredential: vi.fn(async () => ({
      tenantId: account.tenantId,
      userId: account.userId,
      status: "active" as const,
      encodedPasswordHash,
      mustChangePassword: false,
      passwordVersion: 7,
    })),
    loadAuthenticatedAccount: vi.fn(async () => account),
    upgradePasswordHash: vi.fn(async () => true),
    appendAuthenticationEvent: vi.fn(async () => undefined),
    changeInitialPassword: vi.fn(async () => true),
    changePassword: vi.fn(async () => options.changed ?? true),
  };
  const throttleStore = options.throttleStore ?? throttle();
  const service = await TenantAuthenticationService.create({
    repository,
    throttleStore,
    throttleSecret: "t".repeat(32),
    loginDirectorySecret: "d".repeat(32),
    dummyPasswordHash: encodedPasswordHash,
    ...(options.policy
      ? {
          securityPolicyAuthority: {
            loadEffectiveSecurityPolicy: async () => ({
              passwordMinimumLength: options.policy!.minimumLength,
              passwordRequireUppercase: false,
              passwordRequireLowercase: false,
              passwordRequireNumber: false,
              passwordRequireSymbol: options.policy!.requireSymbol,
              sessionIdleMs: 1,
              sessionAbsoluteMs: 1,
              concurrentSessionLimit: 1,
              loginMaximumFailures: 5,
              loginWindowMs: 1,
              loginBlockMs: 1,
              delegationMaximumMs: 1,
              impersonationMaximumMs: 1,
            }),
          },
        }
      : {}),
  });
  return { service, repository, throttleStore };
}

const changeInput = {
  tenantId: account.tenantId,
  userId: account.userId,
  currentPassword: "Current-phrase-1",
  newPassword: "Brand-new-phrase-2",
  correlationId: "correlation-a",
};

describe("self-service password change service", () => {
  it("verifies the current password, rehashes and stores against the expected credential version", async () => {
    const { service, repository, throttleStore } = await serviceWith();
    await expect(service.changePassword(changeInput)).resolves.toEqual({ status: "changed", account });
    expect(repository.changePassword).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        userId: "user-a",
        expectedPasswordVersion: 7,
        argon2Hash: expect.stringMatching(/^\$argon2id\$/),
        sourceReference: "self_service_password_change",
      }),
    );
    expect(throttleStore.clear).toHaveBeenCalledOnce();
  });

  it("rejects a wrong current password and records a throttle failure without writing", async () => {
    const { service, repository, throttleStore } = await serviceWith();
    await expect(service.changePassword({ ...changeInput, currentPassword: "wrong-phrase" })).resolves.toEqual({
      status: "invalid_current_password",
    });
    expect(throttleStore.recordFailure).toHaveBeenCalledOnce();
    expect(repository.changePassword).not.toHaveBeenCalled();
  });

  it("refuses while the user is throttled", async () => {
    const { service, repository } = await serviceWith({ throttleStore: throttle(new Date(Date.now() + 60_000)) });
    const result = await service.changePassword(changeInput);
    expect(result.status).toBe("throttled");
    expect(repository.findPasswordCredential).not.toHaveBeenCalled();
  });

  it("applies the tenant password policy and refuses reusing the current password", async () => {
    const { service, repository } = await serviceWith({ policy: { minimumLength: 20, requireSymbol: true } });
    await expect(service.changePassword(changeInput)).rejects.toBeInstanceOf(PasswordPolicyError);
    const plain = await serviceWith();
    await expect(
      plain.service.changePassword({ ...changeInput, newPassword: changeInput.currentPassword }),
    ).rejects.toMatchObject({ violations: ["PASSWORD_REUSED"] });
    expect(repository.changePassword).not.toHaveBeenCalled();
    expect(plain.repository.changePassword).not.toHaveBeenCalled();
  });

  it("reports a lost race on the credential version as a failed change", async () => {
    const { service } = await serviceWith({ changed: false });
    await expect(service.changePassword(changeInput)).resolves.toEqual({ status: "invalid_current_password" });
  });
});

const session = {
  sessionId: "session-a",
  tenantId: account.tenantId,
  userId: account.userId,
  sessionVersion: 3,
  csrfToken: "csrf-a",
  idleExpiresAt: new Date(Date.now() + 60_000),
  absoluteExpiresAt: new Date(Date.now() + 120_000),
  activeCompanyId: null,
};

function application(changePassword?: TenantAuthApiService["changePassword"], impersonating = false) {
  const current = impersonating
    ? {
        ...session,
        impersonation: {
          requestId: "r",
          requestVersion: 1,
          targetUserId: "user-b",
          targetSessionVersion: 1,
          expiresAt: new Date(Date.now() + 60_000),
        },
      }
    : session;
  const authentication = {
    loadAuthenticatedAccount: vi.fn(async () => account),
    recordTrustedAuthenticationEvent: vi.fn(async () => undefined),
    ...(changePassword ? { changePassword } : {}),
  } as unknown as TenantAuthApiService;
  const issued = { ...session, sessionId: "session-b", csrfToken: "csrf-b", token: "n".repeat(64) };
  const sessions = {
    get: vi.fn(async () => current),
    authorizeMutation: vi.fn(async (_token: string, csrf: string) =>
      csrf === session.csrfToken ? { status: "ok", session: current } : { status: "invalid_csrf" },
    ),
    revokeAllForUser: vi.fn(async () => 2),
    issue: vi.fn(async () => issued),
    revokeToken: vi.fn(async () => true),
  } as unknown as TenantSessionApiService;
  const app = createApp({
    config: { allowedOrigins: new Set([origin]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: authentication,
    sessionService: sessions,
  });
  return { app, authentication, sessions };
}

function post(app: ReturnType<typeof application>["app"], csrf = session.csrfToken, from = origin) {
  return request(app)
    .post("/api/v1/auth/change-password")
    .set("cookie", "nexora_session=" + "o".repeat(64))
    .set("origin", from)
    .set("x-csrf-token", csrf);
}

const body = { current_password: "Current-phrase-1", new_password: "Brand-new-phrase-2" };

describe("POST /api/v1/auth/change-password", () => {
  it("requires a session, a trusted origin and the CSRF token", async () => {
    const change = vi.fn();
    const { app } = application(change as unknown as TenantAuthApiService["changePassword"]);
    const anonymous = await request(app).post("/api/v1/auth/change-password").set("origin", origin).send(body);
    expect(anonymous.status).toBe(401);
    expect(anonymous.headers["content-type"]).toContain("application/problem+json");
    expect((await post(app, session.csrfToken, "https://hostile.test").send(body)).status).toBe(403);
    const csrf = await post(app, "wrong").send(body);
    expect(csrf.status).toBe(403);
    expect(csrf.body.code).toBe("CSRF_VALIDATION_FAILED");
    expect(change).not.toHaveBeenCalled();
  });

  it("validates the body in problem format", async () => {
    const change = vi.fn();
    const { app } = application(change as unknown as TenantAuthApiService["changePassword"]);
    for (const invalid of [
      {},
      { current_password: "same-phrase-1", new_password: "same-phrase-1" },
      { ...body, extra: true },
    ]) {
      const response = await post(app).send(invalid);
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({ code: "INVALID_REQUEST", status: 400 });
    }
    expect(change).not.toHaveBeenCalled();
  });

  it("changes the password, ends every session and issues a fresh one", async () => {
    const change = vi.fn(async () => ({ status: "changed" as const, account }));
    const { app, sessions, authentication } = application(change);
    const response = await post(app).send(body);
    expect(response.status).toBe(200);
    expect(change).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant-a",
        userId: "user-a",
        currentPassword: body.current_password,
        newPassword: body.new_password,
      }),
    );
    expect(sessions.revokeAllForUser).toHaveBeenCalledWith("tenant-a", "user-a");
    expect(sessions.issue).toHaveBeenCalledOnce();
    expect(authentication.recordTrustedAuthenticationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ eventType: "session_issued" }),
    );
    expect(response.body).toMatchObject({ status: "authenticated", csrf_token: "csrf-b", user: { id: "user-a" } });
    expect(String(response.headers["set-cookie"])).toContain("nexora_session=" + "n".repeat(64));
    expect(JSON.stringify(response.body)).not.toContain(body.new_password);
  });

  it("maps a wrong current password, throttling and policy failures to safe problems", async () => {
    const wrong = application(vi.fn(async () => ({ status: "invalid_current_password" as const })));
    const wrongResponse = await post(wrong.app).send(body);
    expect(wrongResponse.status).toBe(400);
    expect(wrongResponse.body.code).toBe("INVALID_CURRENT_PASSWORD");
    expect(wrong.sessions.revokeAllForUser).not.toHaveBeenCalled();

    const throttled = application(vi.fn(async () => ({ status: "throttled" as const, retryAfterSeconds: 30 })));
    const throttledResponse = await post(throttled.app).send(body);
    expect(throttledResponse.status).toBe(429);
    expect(throttledResponse.headers["retry-after"]).toBe("30");

    const policy = application(
      vi.fn(async () => {
        throw new PasswordPolicyError(["PASSWORD_TOO_SHORT"]);
      }),
    );
    const policyResponse = await post(policy.app).send(body);
    expect(policyResponse.status).toBe(400);
    expect(policyResponse.body.code).toBe("PASSWORD_POLICY_REJECTED");
  });

  it("refuses during impersonation and answers 503 when the service is not configured", async () => {
    const change = vi.fn();
    const impersonating = application(change as unknown as TenantAuthApiService["changePassword"], true);
    const forbidden = await post(impersonating.app).send(body);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("IMPERSONATION_FORBIDDEN");
    expect(change).not.toHaveBeenCalled();
    expect((await post(application().app).send(body)).status).toBe(503);
  });
});
