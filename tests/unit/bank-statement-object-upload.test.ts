import { Readable } from "node:stream";

import { describe, expect, it, vi } from "vitest";

import { storeBankStatementObject } from "../../server/api/src/modules/banking/statements/object-upload.js";

const metadata = {
  objectKey: "bank-statements/quarantine/t/c/import.csv",
  contentType: "text/csv",
  sizeBytes: 4,
  checksumSha256: "a".repeat(64),
};

describe("Bank Statement object/database compensation", () => {
  it("removes the written object when database persistence fails", async () => {
    const remove = vi.fn(async () => undefined);
    const storage = { writeBounded: vi.fn(async () => metadata), remove };
    const persistenceError = new Error("database transaction failed");
    await expect(
      storeBankStatementObject(
        storage,
        { objectKey: metadata.objectKey, contentType: "text/csv", sizeBytes: 4, maxBytes: 100 },
        Readable.from(["test"]),
        async () => {
          throw persistenceError;
        },
      ),
    ).rejects.toBe(persistenceError);
    expect(remove).toHaveBeenCalledWith(metadata.objectKey);
  });

  it("retains the immutable object after persistence succeeds", async () => {
    const remove = vi.fn(async () => undefined);
    const storage = { writeBounded: vi.fn(async () => metadata), remove };
    await expect(
      storeBankStatementObject(
        storage,
        { objectKey: metadata.objectKey, contentType: "text/csv", sizeBytes: 4, maxBytes: 100 },
        Readable.from(["test"]),
        async (stored) => stored.objectKey,
      ),
    ).resolves.toBe(metadata.objectKey);
    expect(remove).not.toHaveBeenCalled();
  });

  it("reports both persistence and compensation failures for durable cleanup", async () => {
    const storage = {
      writeBounded: vi.fn(async () => metadata),
      remove: vi.fn(async () => {
        throw new Error("object store unavailable");
      }),
    };
    await expect(
      storeBankStatementObject(
        storage,
        { objectKey: metadata.objectKey, contentType: "text/csv", sizeBytes: 4, maxBytes: 100 },
        Readable.from(["test"]),
        async () => {
          throw new Error("database transaction failed");
        },
      ),
    ).rejects.toBeInstanceOf(AggregateError);
  });
});
