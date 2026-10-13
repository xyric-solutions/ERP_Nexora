import { randomUUID } from "node:crypto";

import { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { TenantSelectionService, type PasswordVerifiedAccount } from "../../packages/auth/src/index.js";
import { RedisTenantSelectionStore } from "../../apps/api/src/modules/auth/redis-tenant-selection-store.js";

const redisUrl = process.env.TEST_SOURCE_REDIS_URL;
const run = redisUrl ? describe : describe.skip;

run("Redis tenant-selection authority", () => {
  const prefix = `nexora:test:tenant-selection:${randomUUID()}`;
  let redis: Redis;
  let service: TenantSelectionService;
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

  beforeAll(() => {
    redis = new Redis(redisUrl!, { maxRetriesPerRequest: null });
    service = new TenantSelectionService(new RedisTenantSelectionStore(redis, prefix), "d".repeat(32));
  });

  afterAll(async () => {
    let cursor = "0";
    do {
      const [next, keys] = await redis.scan(cursor, "MATCH", `${prefix}:*`, "COUNT", 100);
      cursor = next;
      if (keys.length) await redis.del(...keys);
    } while (cursor !== "0");
    await redis.quit();
  });

  it("atomically consumes an offered choice once", async () => {
    const context = { sourceIp: "127.0.0.1", userAgent: "integration-test" };
    const challenge = await service.issue(accounts, context);
    const choice = challenge.choices[0]!;
    const results = await Promise.all([
      service.consume(challenge.ticket, choice.id, context),
      service.consume(challenge.ticket, choice.id, context),
    ]);
    expect(results.filter((result) => result.status === "selected")).toHaveLength(1);
    expect(results.filter((result) => result.status === "invalid")).toHaveLength(1);
  });

  it("fails closed for a context mismatch and invalidates the ticket", async () => {
    const context = { sourceIp: "127.0.0.1", userAgent: "integration-test" };
    const challenge = await service.issue(accounts, context);
    const choice = challenge.choices[0]!;
    await expect(service.consume(challenge.ticket, choice.id, { ...context, sourceIp: "127.0.0.2" })).resolves.toEqual({
      status: "invalid",
    });
    await expect(service.consume(challenge.ticket, choice.id, context)).resolves.toEqual({ status: "invalid" });
  });

  it("cancels a challenge idempotently", async () => {
    const context = { sourceIp: "127.0.0.1" };
    const challenge = await service.issue(accounts, context);
    await service.cancel(challenge.ticket);
    await service.cancel(challenge.ticket);
    await expect(service.consume(challenge.ticket, challenge.choices[0]!.id, context)).resolves.toEqual({
      status: "invalid",
    });
  });
});
