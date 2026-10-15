import { describe, expect, it, vi } from "vitest";

import { BrowserSessionClient } from "../../app/lib/auth/session-client.js";

const session = {
  status: "authenticated" as const,
  tenant_id: "tenant-uat",
  user: {
    id: "user-admin",
    email: "admin@example.test",
    display_name: "Authorization Administrator",
    roles: ["authorization_admin"],
    permissions: ["security.authorization.permission.read"],
  },
  csrf_token: "a".repeat(43),
  idle_expires_at: "2026-10-07T08:30:00.000Z",
  absolute_expires_at: "2026-10-07T16:00:00.000Z",
};

function transport(overrides: Record<string, unknown> = {}) {
  return {
    loginWithPassword: vi.fn(async () => session),
    selectTenant: vi.fn(async () => session),
    changeInitialPassword: vi.fn(async () => session),
    cancelTenantSelection: vi.fn(async () => undefined),
    getSession: vi.fn(async () => session),
    rotateSession: vi.fn(async () => session),
    logout: vi.fn(async () => undefined),
    logoutAll: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("BrowserSessionClient", () => {
  it("keeps the synchronizer token in memory and refreshes it after rotation", async () => {
    const api = transport({
      rotateSession: vi.fn(async () => ({ ...session, csrf_token: "b".repeat(43) })),
    });
    const client = new BrowserSessionClient(api);

    await client.loginWithPassword({
      identifier: "admin@example.test",
      password: "password phrase",
    });
    expect(client.csrfTokenForRequest()).toBe("a".repeat(43));
    await client.rotate();
    expect(api.rotateSession).toHaveBeenCalledWith("a".repeat(43));
    expect(client.csrfTokenForRequest()).toBe("b".repeat(43));
    await client.logout();
    expect(() => client.csrfTokenForRequest()).toThrow(/No active browser session/);
  });

  it("can restore a page-reloaded session without persistent browser storage", async () => {
    const client = new BrowserSessionClient(transport());

    expect(() => client.csrfTokenForRequest()).toThrow(/No active browser session/);
    await client.restore();
    expect(client.csrfTokenForRequest()).toBe(session.csrf_token);
  });

  it("does not create client session state until an organization choice succeeds", async () => {
    const challenge = {
      status: "tenant_selection_required" as const,
      ticket: "t".repeat(43),
      expires_at: "2026-10-07T08:05:00.000Z",
      choices: [
        { id: "a".repeat(43), organization_name: "Organization A" },
        { id: "b".repeat(43), organization_name: "Organization B" },
      ],
    };
    const api = transport({ loginWithPassword: vi.fn(async () => challenge) });
    const client = new BrowserSessionClient(api);

    await expect(
      client.loginWithPassword({ identifier: "admin@example.test", password: "password phrase" }),
    ).resolves.toEqual(challenge);
    expect(() => client.csrfTokenForRequest()).toThrow(/No active browser session/);
    await client.selectTenant({ ticket: challenge.ticket, choice_id: challenge.choices[0]!.id });
    expect(client.csrfTokenForRequest()).toBe(session.csrf_token);
  });

  it("creates client session state only after the initial password change succeeds", async () => {
    const challenge = {
      status: "password_change_required" as const,
      ticket: "p".repeat(43),
      expires_at: "2026-10-07T08:05:00.000Z",
    };
    const api = transport({ loginWithPassword: vi.fn(async () => challenge) });
    const client = new BrowserSessionClient(api);

    await expect(client.loginWithPassword({ identifier: "new.user", password: "one-time password" })).resolves.toEqual(
      challenge,
    );
    expect(() => client.csrfTokenForRequest()).toThrow(/No active browser session/);

    await client.changeInitialPassword({ ticket: challenge.ticket, new_password: "permanent-password-2026" });

    expect(api.changeInitialPassword).toHaveBeenCalledWith({
      ticket: challenge.ticket,
      new_password: "permanent-password-2026",
    });
    expect(client.csrfTokenForRequest()).toBe(session.csrf_token);
  });

  it("clears the in-memory synchronizer token after logout-all", async () => {
    const api = transport();
    const client = new BrowserSessionClient(api);

    await client.loginWithPassword({
      identifier: "admin@example.test",
      password: "password phrase",
    });
    await client.logoutAll();

    expect(api.logoutAll).toHaveBeenCalledWith("a".repeat(43));
    expect(() => client.csrfTokenForRequest()).toThrow(/No active browser session/);
  });
});
