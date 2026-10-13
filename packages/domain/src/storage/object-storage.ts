export interface UploadRequest {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface SignedOperation {
  url: string;
  expiresAt: Date;
  headers: Record<string, string>;
}

export interface StoredObjectMetadata {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string;
}

export interface ObjectStorage {
  signUpload(request: UploadRequest): Promise<SignedOperation>;
  signDownload(objectKey: string): Promise<SignedOperation>;
  metadata(objectKey: string): Promise<StoredObjectMetadata>;
}

export function assertSha256(checksum: string): void {
  if (!/^[a-f0-9]{64}$/.test(checksum)) throw new Error("checksum must be a lowercase SHA-256 hex digest");
}

export function verifyObjectMetadata(expected: UploadRequest, actual: StoredObjectMetadata): void {
  if (
    expected.objectKey !== actual.objectKey ||
    expected.sizeBytes !== actual.sizeBytes ||
    expected.checksumSha256 !== actual.checksumSha256
  ) {
    throw new Error("stored object metadata does not match the authorized upload");
  }
}
