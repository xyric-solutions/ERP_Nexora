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
});
