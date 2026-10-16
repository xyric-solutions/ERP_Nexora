import { describe, expect, it, vi } from "vitest";

import { loadHrSessionContext } from "../../server/api/src/modules/hr/shared/session-context.js";

function request(mutation: boolean) {
  return {
    get: (name: string) => {
      if (name === "cookie") return "nexora_session=token";
      if (name === "x-csrf-token" && mutation) return "csrf";
      return undefined;
    },
  } as never;
}

describe("HR impersonation session boundary", () => {
  const view = {
    sessionId: "session-1",
    tenantId: "tenant-a",
    userId: "real-user",
    sessionVersion: 1,
    csrfToken: "csrf",
    idleExpiresAt: new Date(Date.now() + 60_000),
    absoluteExpiresAt: new Date(Date.now() + 120_000),
    impersonation: {
      requestId: "impersonation-1",
      requestVersion: 3,
      targetUserId: "target-user",
      targetSessionVersion: 1,
      expiresAt: new Date(Date.now() + 30_000),
    },
  };

  it("uses the effective target for reads while retaining the real actor identity", async () => {
    const loadAuthenticatedAccount = vi.fn(async (_tenantId: string, userId: string) => ({
      tenantId: "tenant-a",
      organizationName: "Tenant A",
      userId,
      email: `${userId}@example.test`,
      displayName: userId,
      roles: [],
      permissions: [],
      sessionVersion: 1,
    }));
    const context = await loadHrSessionContext(request(false), {
      secureCookies: false,
      authentication: { loadAuthenticatedAccount } as never,
      sessions: { get: vi.fn(async () => view) } as never,
    });
    expect(loadAuthenticatedAccount).toHaveBeenCalledWith("tenant-a", "target-user");
    expect(context).toMatchObject({
      actor: { userId: "target-user" },
      realActorId: "real-user",
      impersonationRequestId: "impersonation-1",
    });
  });

  it("blocks every HR mutation before domain code is reached", async () => {
    await expect(
      loadHrSessionContext(request(true), {
        secureCookies: false,
        authentication: { loadAuthenticatedAccount: vi.fn() } as never,
        sessions: { authorizeMutation: vi.fn(async () => ({ status: "ok", session: view })) } as never,
      }, true),
    ).rejects.toMatchObject({ status: 403, code: "IMPERSONATION_RESTRICTED" });
  });
});
