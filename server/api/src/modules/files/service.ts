import { randomUUID } from "node:crypto";

import { assertSha256, type ObjectStorage, type SignedOperation, type UploadRequest } from "@nexora/domain/storage";

const allowedContentTypes = new Set(["application/pdf", "image/jpeg", "image/png", "text/csv"]);

export class FileSigningService {
  constructor(private readonly storage: ObjectStorage) {}

  async authorizeUpload(
    input: Omit<UploadRequest, "objectKey">,
  ): Promise<{ objectKey: string; operation: SignedOperation }> {
    if (!allowedContentTypes.has(input.contentType)) throw new Error("content type is not allowed");
    if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes <= 0 || input.sizeBytes > 25 * 1024 * 1024)
      throw new Error("file size is outside the allowed range");
    assertSha256(input.checksumSha256);
    const objectKey = `quarantine/${randomUUID()}`;
    return { objectKey, operation: await this.storage.signUpload({ ...input, objectKey }) };
  }

  async authorizeDownload(objectKey: string): Promise<SignedOperation> {
    if (!/^available\/[0-9a-f-]{36}$/.test(objectKey)) throw new Error("object key is not available for download");
    return this.storage.signDownload(objectKey);
  }
}
