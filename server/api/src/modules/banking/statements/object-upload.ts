import type { Readable } from "node:stream";

import type { BoundedWriteRequest, ObjectStorage, StoredObjectMetadata } from "@nexora/domain/storage";

export async function storeBankStatementObject<T>(
  storage: Pick<ObjectStorage, "writeBounded" | "remove">,
  request: BoundedWriteRequest,
  body: Readable,
  persist: (metadata: StoredObjectMetadata) => Promise<T>,
): Promise<T> {
  const metadata = await storage.writeBounded(request, body);
  try {
    return await persist(metadata);
  } catch (persistenceError) {
    try {
      await storage.remove(metadata.objectKey);
    } catch (cleanupError) {
      throw new AggregateError(
        [persistenceError, cleanupError],
        "Bank Statement persistence and object compensation both failed.",
      );
    }
    throw persistenceError;
  }
}
