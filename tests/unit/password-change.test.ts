import { describe, expect, it } from "vitest";

import {
  PasswordChangeService,
  type PasswordChangeTicketRecord,
  type PasswordChangeTicketStore,
} from "../../packages/auth/src/index.js";

class MemoryPasswordChangeTicketStore implements PasswordChangeTicketStore {
  readonly records = new Map<string, PasswordChangeTicketRecord>();

  async create(ticketHash: string, record: PasswordChangeTicketRecord): Promise<boolean> {
    if (this.records.has(ticketHash)) return false;
    this.records.set(ticketHash, record);
    return true;
  }

  async consume(ticketHash: string, bindingHash: string): Promise<PasswordChangeTicketRecord | null> {
    const record = this.records.get(ticketHash);
    this.records.delete(ticketHash);
    return record?.bindingHash === bindingHash ? record : null;
  }

  async cancel(ticketHash: string): Promise<void> {
    this.records.delete(ticketHash);
  }
}

describe("PasswordChangeService", () => {
  it("issues a bound opaque ticket and consumes it only once", async () => {
    const service = new PasswordChangeService(new MemoryPasswordChangeTicketStore(), "p".repeat(32));
    const context = { sourceIp: "127.0.0.1", userAgent: "unit-test" };
    const challenge = await service.issue({
      tenantId: "tenant-a",
      userId: "user-a",
      passwordVersion: 3,
      context,
    });
    expect(challenge.ticket).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await expect(
      service.consume({
        ticket: challenge.ticket,
        newPassword: "secure replacement phrase",
        context,
      }),
    ).resolves.toMatchObject({ tenantId: "tenant-a", userId: "user-a", passwordVersion: 3 });
    await expect(
      service.consume({
        ticket: challenge.ticket,
        newPassword: "secure replacement phrase",
        context,
      }),
    ).resolves.toBeNull();
  });

  it("fails closed for context mismatch, expiry, and weak passwords", async () => {
    let now = new Date("2026-10-12T00:00:00.000Z");
    const service = new PasswordChangeService(new MemoryPasswordChangeTicketStore(), "p".repeat(32), 30_000, () => now);
    const challenge = await service.issue({
      tenantId: "tenant-a",
      userId: "user-a",
      passwordVersion: 1,
      context: { sourceIp: "127.0.0.1" },
    });
    await expect(
      service.consume({
        ticket: challenge.ticket,
        newPassword: "secure replacement phrase",
        context: { sourceIp: "127.0.0.2" },
      }),
    ).resolves.toBeNull();

    const expired = await service.issue({
      tenantId: "tenant-a",
      userId: "user-a",
      passwordVersion: 1,
      context: { sourceIp: "127.0.0.1" },
    });
    now = new Date(now.getTime() + 31_000);
    await expect(
      service.consume({
        ticket: expired.ticket,
        newPassword: "secure replacement phrase",
        context: { sourceIp: "127.0.0.1" },
      }),
    ).resolves.toBeNull();
    await expect(
      service.consume({
        ticket: "x".repeat(43),
        newPassword: "short",
        context: { sourceIp: "127.0.0.1" },
      }),
    ).rejects.toMatchObject({ code: "PASSWORD_POLICY_REJECTED" });
  });
});
