import type { Readable } from "node:stream";

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

export interface BoundedWriteRequest {
  objectKey: string;
  contentType: string;
  sizeBytes: number;
  maxBytes: number;
  checksumSha256?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BoundedReadRequest {
  objectKey: string;
  maxBytes: number;
  checksumSha256?: string;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface BoundedObjectRead {
  metadata: StoredObjectMetadata;
  body: Readable;
}

export interface ListedObject {
  objectKey: string;
  sizeBytes: number;
  lastModified: Date;
}

export interface ObjectList {
  objects: ListedObject[];
  continuationToken: string | null;
}

export class ObjectStorageError extends Error {
  constructor(
    readonly code:
      | "OBJECT_KEY_INVALID"
      | "OBJECT_SIZE_LIMIT"
      | "OBJECT_SIZE_MISMATCH"
      | "OBJECT_CHECKSUM_MISMATCH"
      | "OBJECT_ALREADY_EXISTS"
      | "OBJECT_ABORTED"
      | "OBJECT_METADATA_INVALID",
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "ObjectStorageError";
  }
}

export interface ObjectStorage {
  signUpload(request: UploadRequest): Promise<SignedOperation>;
  signDownload(objectKey: string): Promise<SignedOperation>;
  metadata(objectKey: string): Promise<StoredObjectMetadata>;
  writeBounded(request: BoundedWriteRequest, body: Readable): Promise<StoredObjectMetadata>;
  readBounded(request: BoundedReadRequest): Promise<BoundedObjectRead>;
  list(prefix: string, options?: { continuationToken?: string; limit?: number }): Promise<ObjectList>;
  exists(objectKey: string): Promise<boolean>;
  remove(objectKey: string): Promise<void>;
  checkReady(): Promise<void>;
  close(): void;
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

export function assertObjectKey(objectKey: string): void {
  if (
    objectKey.length < 1 ||
    objectKey.length > 1_024 ||
    objectKey.startsWith("/") ||
    objectKey.includes("\\") ||
    objectKey.split("/").some((segment) => segment === "" || segment === "." || segment === "..") ||
    [...objectKey].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127;
    })
  ) {
    throw new ObjectStorageError("OBJECT_KEY_INVALID", "The object key is invalid.");
  }
}
