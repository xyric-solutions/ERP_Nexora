import { describe, expect, it, vi } from "vitest";

import {
  processBankStatementOrphanCleanup,
  type BankStatementCleanupRepository,
  type BankStatementCleanupStorage,
} from "../../server/worker/src/jobs/bank-statement-orphan-cleanup.js";

const now = new Date("2026-10-23T10:00:00.000Z");
const old = new Date("2026-10-23T07:00:00.000Z");
const recent = new Date("2026-10-23T09:30:00.000Z");

function setup(input?: {
  references?: Record<string, { state: "uploaded" | "draft" | "validated" | "finalized" | "rejected" } | null>;
  existingKeys?: string[];
}) {
  const objects = [
    { objectKey: "bank-statements/quarantine/t/c/orphan.csv", sizeBytes: 10, lastModified: old },
    { objectKey: "bank-statements/quarantine/t/c/recent.csv", sizeBytes: 10, lastModified: recent },
    { objectKey: "bank-statements/quarantine/t/c/finalized.csv", sizeBytes: 10, lastModified: old },
    { objectKey: "bank-statements/quarantine/t/c/rejected.csv", sizeBytes: 10, lastModified: old },
  ];
  const existing = new Set(input?.existingKeys ?? objects.map((object) => object.objectKey));
  const remove = vi.fn(async (objectKey: string) => {
    existing.delete(objectKey);
  });
  const storage: BankStatementCleanupStorage = {
    list: vi.fn(async () => ({
      objects: objects.filter((object) => existing.has(object.objectKey)),
      continuationToken: null,
    })),
    remove,
    exists: vi.fn(async (objectKey) => existing.has(objectKey)),
  };
  const references = {
    "bank-statements/quarantine/t/c/finalized.csv": { state: "finalized" as const },
    "bank-statements/quarantine/t/c/rejected.csv": { state: "rejected" as const },
    ...input?.references,
  };
  const repository: BankStatementCleanupRepository = {
    withObjectReferenceLock: vi.fn(async (objectKey, operation) => operation(references[objectKey] ?? null)),
    listStaleIntents: vi.fn(async () => []),
  };
  return { storage, repository, remove };
}

describe("Bank Statement orphan cleanup", () => {
  it("deletes only old unreferenced objects and preserves recent, finalized and audit-retained evidence", async () => {
    const { storage, repository, remove } = setup();
    const result = await processBankStatementOrphanCleanup(
      { now, orphanGraceMs: 60 * 60 * 1_000, pageSize: 100, maxObjects: 500 },
      { storage, repository },
    );
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove).toHaveBeenCalledWith("bank-statements/quarantine/t/c/orphan.csv");
    expect(result).toMatchObject({ scanned: 4, deleted: 1, retained: 3, missingIntents: 0 });
  });

  it("detects a stale database intent whose object is missing without deleting audit data", async () => {
    const key = "bank-statements/quarantine/t/c/missing.csv";
    const { storage, repository, remove } = setup({ existingKeys: [] });
    repository.listStaleIntents = vi.fn(async () => [{ objectKey: key }]);
    const result = await processBankStatementOrphanCleanup(
      { now, orphanGraceMs: 60 * 60 * 1_000, pageSize: 100, maxObjects: 500 },
      { storage, repository },
    );
    expect(result.missingIntents).toBe(1);
    expect(remove).not.toHaveBeenCalled();
  });

  it("propagates deletion failures so BullMQ retries instead of recording false success", async () => {
    const { storage, repository } = setup();
    storage.remove = vi.fn(async () => {
      throw new Error("temporary object-store failure");
    });
    await expect(
      processBankStatementOrphanCleanup(
        { now, orphanGraceMs: 60 * 60 * 1_000, pageSize: 100, maxObjects: 500 },
        { storage, repository },
      ),
    ).rejects.toThrow("temporary object-store failure");
  });
});
