import { describe, expect, it, vi } from "vitest";
import type pg from "pg";

import {
  PostgresRecurringJournalGenerationRepository,
  processRecurringJournalGeneration,
  type RecurringJournalGenerationRepository,
} from "../../server/worker/src/jobs/recurring-journal-generation.js";

function databaseClient(
  query: (statement: string, values?: readonly unknown[]) => Promise<{ rows: unknown[] }>,
): pg.PoolClient {
  return {
    query: vi.fn(query),
    release: vi.fn(),
  } as unknown as pg.PoolClient;
}

function databasePool(clients: pg.PoolClient[]): pg.Pool {
  const pending = [...clients];
  return {
    connect: vi.fn(async () => {
      const client = pending.shift();
      if (!client) throw new Error("Unexpected database connection");
      return client;
    }),
  } as unknown as pg.Pool;
}

describe("Recurring Journal generation job", () => {
  it("passes bounded scheduling authority to the repository", async () => {
    const generateDue = vi.fn<RecurringJournalGenerationRepository["generateDue"]>().mockResolvedValue({
      tenantsScanned: 1,
      draftsCreated: 2,
      failed: 0,
      tenantScanTruncated: false,
    });
    const now = new Date("2026-10-29T00:00:00.000Z");
    await expect(
      processRecurringJournalGeneration(
        { now, actorId: "journal.worker", tenantLimit: 10, templateLimit: 25 },
        { generateDue },
      ),
    ).resolves.toMatchObject({ draftsCreated: 2, failed: 0 });
    expect(generateDue).toHaveBeenCalledWith({
      now,
      actorId: "journal.worker",
      tenantLimit: 10,
      templateLimit: 25,
    });
  });

  it("rejects an invalid scheduler clock before database work", async () => {
    const generateDue = vi.fn<RecurringJournalGenerationRepository["generateDue"]>();
    await expect(
      processRecurringJournalGeneration(
        { now: new Date(Number.NaN), actorId: "journal.worker", tenantLimit: 10, templateLimit: 25 },
        { generateDue },
      ),
    ).rejects.toThrow("generation time is invalid");
    expect(generateDue).not.toHaveBeenCalled();
  });

  it("continues with later tenants when one tenant generation fails", async () => {
    const cursorClient = databaseClient(async (statement) => {
      if (statement.includes("last_tenant_id") && statement.includes("for update"))
        return { rows: [{ last_tenant_id: "tenant-z" }] };
      if (statement.includes("from tenant")) return { rows: [{ id: "tenant-a" }, { id: "tenant-b" }] };
      return { rows: [] };
    });
    const failingTenant = databaseClient(async (statement) => {
      if (statement.includes("from recurring_journal_template")) throw new Error("tenant unavailable");
      return { rows: [] };
    });
    const healthyTenant = databaseClient(async () => ({ rows: [] }));
    const repository = new PostgresRecurringJournalGenerationRepository(
      databasePool([cursorClient, failingTenant, healthyTenant]),
    );

    await expect(
      repository.generateDue({
        now: new Date("2026-10-29T00:00:00.000Z"),
        actorId: "journal.worker",
        tenantLimit: 2,
        templateLimit: 25,
      }),
    ).resolves.toEqual({ tenantsScanned: 2, draftsCreated: 0, failed: 1, tenantScanTruncated: false });
  });

  it("advances the durable tenant cursor and reports a bounded scan", async () => {
    const cursorClient = databaseClient(async (statement, values) => {
      if (statement.includes("last_tenant_id") && statement.includes("for update"))
        return { rows: [{ last_tenant_id: "tenant-a" }] };
      if (statement.includes("from tenant"))
        return { rows: [{ id: "tenant-b" }, { id: "tenant-c" }, { id: "tenant-a" }] };
      if (statement.includes("update recurring_journal_worker_cursor")) {
        expect(values).toEqual(["tenant-c"]);
      }
      return { rows: [] };
    });
    const repository = new PostgresRecurringJournalGenerationRepository(
      databasePool([cursorClient, databaseClient(async () => ({ rows: [] })), databaseClient(async () => ({ rows: [] }))]),
    );

    await expect(
      repository.generateDue({
        now: new Date("2026-10-29T00:00:00.000Z"),
        actorId: "journal.worker",
        tenantLimit: 2,
        templateLimit: 25,
      }),
    ).resolves.toMatchObject({ tenantsScanned: 2, tenantScanTruncated: true });
  });
});
