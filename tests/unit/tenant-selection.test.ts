import { describe, expect, it, vi } from "vitest";

import {
  TenantSelectionService,
  type PasswordVerifiedAccount,
  type TenantSelectionRecord,
  type TenantSelectionStore,
} from "../../packages/auth/src/index.js";

const accounts: PasswordVerifiedAccount[] = [
  {
    tenantId: "tenant-a",
    organizationName: "Organization A",
    userId: "user-a",
    email: "user@example.test",
    displayName: "User",
    roles: [],
    permissions: [],
    sessionVersion: 1,
    mustChangePassword: false,
    passwordVersion: 1,
  },
  {
    tenantId: "tenant-b",
    organizationName: "Organization B",
    userId: "user-b",
    email: "user@example.test",
    displayName: "User",
    roles: [],
    permissions: [],
    sessionVersion: 1,
    mustChangePassword: true,
    passwordVersion: 2,
  },
];

describe("tenant selection", () => {
  it("issues opaque choices without exposing tenant or user identifiers", async () => {
    let saved: TenantSelectionRecord | null = null;
    const store: TenantSelectionStore = {
      create: vi.fn(async (_ticket, record) => {
        saved = record;
        return true;
      }),
      consume: vi.fn(async () => ({ status: "invalid" as const })),
      cancel: vi.fn(async () => undefined),
    };
    const service = new TenantSelectionService(store, "d".repeat(32), 300_000, () => new Date("2026-10-12T00:00:00Z"));

    const challenge = await service.issue(accounts, { sourceIp: "127.0.0.1", userAgent: "unit-test" });

    expect(challenge.ticket).toHaveLength(43);
    expect(challenge.expiresAt.toISOString()).toBe("2026-10-12T00:05:00.000Z");
    expect(challenge.choices.map((choice) => choice.organizationName)).toEqual(["Organization A", "Organization B"]);
    expect(JSON.stringify(challenge)).not.toContain("tenant-a");
    expect(JSON.stringify(challenge)).not.toContain("user-a");
    expect(saved?.choices).toHaveLength(2);
    expect(saved?.bindingHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("requires a genuine multi-membership challenge and delegates cancellation", async () => {
    const store: TenantSelectionStore = {
      create: vi.fn(async () => true),
      consume: vi.fn(async () => ({ status: "invalid" as const })),
      cancel: vi.fn(async () => undefined),
    };
    const service = new TenantSelectionService(store, "d".repeat(32));

    await expect(service.issue(accounts.slice(0, 1), { sourceIp: "127.0.0.1" })).rejects.toThrow(/between two/);
    await service.cancel("x".repeat(43));
    expect(store.cancel).toHaveBeenCalledWith("x".repeat(43));
  });
});
