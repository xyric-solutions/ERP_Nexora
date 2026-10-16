import { describe, expect, it } from "vitest";

import {
  TenantSessionService,
  type TenantSessionRecord,
  type TenantSessionStore,
} from "../../packages/auth/src/index.js";

class MemoryTenantSessionStore implements TenantSessionStore {
  readonly records = new Map<string, TenantSessionRecord>();

  async create(record: TenantSessionRecord) {
    this.records.set(record.id, record);
  }

  async findByTokenHash(tokenHash: string) {
    return [...this.records.values()].find((record) => record.tokenHash === tokenHash) ?? null;
  }

  async touch(id: string, now: Date, idleExpiresAt: Date) {
    const record = this.records.get(id);
    if (!record || record.idleExpiresAt <= now || record.absoluteExpiresAt <= now) return null;
    const updated = { ...record, lastSeenAt: now, idleExpiresAt };
    this.records.set(id, updated);
    return updated;
  }

  async rotate(previousId: string, replacement: TenantSessionRecord, now: Date) {
    const previous = this.records.get(previousId);
    if (!previous || previous.idleExpiresAt <= now || previous.absoluteExpiresAt <= now) return false;
    this.records.delete(previousId);
    this.records.set(replacement.id, replacement);
    return true;
  }

  async revoke(id: string) {
    return this.records.delete(id);
  }

  async revokeByTokenHash(tokenHash: string) {
    const record = await this.findByTokenHash(tokenHash);
    return record ? this.records.delete(record.id) : false;
  }

  async revokeAll(tenantId: string, userId: string) {
    let count = 0;
    for (const [id, record] of this.records) {
      if (record.tenantId === tenantId && record.userId === userId) {
        this.records.delete(id);
        count += 1;
      }
    }
    return count;
  }

  async setImpersonation(id: string, context: TenantSessionRecord["impersonation"] | null) {
    const record = this.records.get(id);
    if (!record) return false;
    if (context) this.records.set(id, { ...record, impersonation: context });
    else {
      const remaining = { ...record };
      delete remaining.impersonation;
      this.records.set(id, remaining);
    }
    return true;
  }
}

describe("TenantSessionService", () => {
  it("issues tenant-bound opaque sessions, prevents fixation, rotates, and revokes", async () => {
    const store = new MemoryTenantSessionStore();
    let currentSessionVersion = 1;
    const service = new TenantSessionService(
      store,
      "s".repeat(32),
      {
        idleTimeoutMs: 30 * 60 * 1_000,
        absoluteTimeoutMs: 8 * 60 * 60 * 1_000,
      },
      { loadSessionVersion: async () => currentSessionVersion },
    );
    const first = await service.issue("tenant-a", "user-a", {
      sourceIp: "203.0.113.10",
      userAgent: "test-agent",
    });

    expect(first.token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(first.csrfToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect([...store.records.values()][0]).toMatchObject({ tenantId: "tenant-a", userId: "user-a" });
    expect([...store.records.values()][0]).toMatchObject({ sessionVersion: 1 });
    expect([...store.records.values()][0]?.tokenHash).not.toContain(first.token);

    const replacement = await service.issue("tenant-a", "user-a", {}, first.token);
    expect(await service.get(first.token)).toBeNull();
    expect(await service.get(replacement.token)).not.toBeNull();

    await expect(service.rotate(replacement.token, "wrong")).resolves.toEqual({ status: "invalid_csrf" });
    const rotated = await service.rotate(replacement.token, replacement.csrfToken);
    expect(rotated.status).toBe("ok");
    expect(await service.get(replacement.token)).toBeNull();
    if (rotated.status === "ok") {
      currentSessionVersion = 2;
      expect(await service.get(rotated.token)).toBeNull();
      const replacementAfterRevocation = await service.issue("tenant-a", "user-a");
      await expect(
        service.logoutAll(replacementAfterRevocation.token, replacementAfterRevocation.csrfToken),
      ).resolves.toEqual({ status: "ok" });
      expect(await service.get(replacementAfterRevocation.token)).toBeNull();
    }
  });

  it("revalidates impersonation authority and both account session versions on every use", async () => {
    const store = new MemoryTenantSessionStore();
    const versions = new Map([
      ["real-user", 1],
      ["target-user", 3],
    ]);
    let contextActive = true;
    const service = new TenantSessionService(
      store,
      "s".repeat(32),
      { idleTimeoutMs: 60_000, absoluteTimeoutMs: 300_000 },
      { loadSessionVersion: async (_tenantId, userId) => versions.get(userId) ?? null },
      () => new Date("2026-10-16T12:00:00.000Z"),
      { validateImpersonationContext: async () => contextActive },
    );
    const issued = await service.issue("tenant-a", "real-user");
    const started = await service.startImpersonation(issued.token, {
      requestId: "impersonation-1",
      requestVersion: 4,
      targetUserId: "target-user",
      targetSessionVersion: 3,
      expiresAt: new Date("2026-10-16T12:10:00.000Z"),
    });
    expect(started?.impersonation?.targetUserId).toBe("target-user");
    contextActive = false;
    expect((await service.get(issued.token))?.impersonation).toBeUndefined();

    contextActive = true;
    const restarted = await service.startImpersonation(issued.token, {
      requestId: "impersonation-2",
      requestVersion: 2,
      targetUserId: "target-user",
      targetSessionVersion: 3,
      expiresAt: new Date("2026-10-16T12:10:00.000Z"),
    });
    expect(restarted).not.toBeNull();
    versions.set("target-user", 4);
    expect((await service.get(issued.token))?.impersonation).toBeUndefined();
  });
});
