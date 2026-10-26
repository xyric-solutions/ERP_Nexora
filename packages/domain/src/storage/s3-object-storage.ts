import { createHash } from "node:crypto";
import { Readable, Transform, type TransformCallback } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DeleteObjectCommand,
  GetObjectCommand,
  GetObjectTaggingCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  PutObjectTaggingCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  assertObjectKey,
  assertSha256,
  ObjectStorageError,
  type BoundedObjectRead,
  type BoundedReadRequest,
  type BoundedWriteRequest,
  type ObjectList,
  type ObjectStorage,
  type SignedOperation,
  type StoredObjectMetadata,
  type UploadRequest,
} from "./object-storage.js";

export interface S3StorageOptions {
  bucket: string;
  endpoint?: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle?: boolean;
  expiresInSeconds?: number;
}

export class S3ObjectStorage implements ObjectStorage {
  readonly #client: S3Client;
  readonly #bucket: string;
  readonly #expiresInSeconds: number;

  constructor(options: S3StorageOptions) {
    this.#bucket = options.bucket;
    this.#expiresInSeconds = options.expiresInSeconds ?? 300;
    this.#client = new S3Client({
      region: options.region,
      credentials: { accessKeyId: options.accessKeyId, secretAccessKey: options.secretAccessKey },
      ...(options.endpoint ? { endpoint: options.endpoint } : {}),
      ...(options.forcePathStyle === undefined ? {} : { forcePathStyle: options.forcePathStyle }),
      requestChecksumCalculation: "WHEN_REQUIRED",
      responseChecksumValidation: "WHEN_REQUIRED",
    });
  }

  async signUpload(request: UploadRequest): Promise<SignedOperation> {
    assertObjectKey(request.objectKey);
    assertSha256(request.checksumSha256);
    const checksum = Buffer.from(request.checksumSha256, "hex").toString("base64");
    const command = new PutObjectCommand({
      Bucket: this.#bucket,
      Key: request.objectKey,
      ContentType: request.contentType,
      ContentLength: request.sizeBytes,
      ChecksumSHA256: checksum,
      Metadata: { "sha256-hex": request.checksumSha256 },
    });
    return this.#signed(command, { "content-type": request.contentType, "x-amz-checksum-sha256": checksum });
  }

  async signDownload(objectKey: string): Promise<SignedOperation> {
    assertObjectKey(objectKey);
    return this.#signed(new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }), {});
  }

  async metadata(objectKey: string): Promise<StoredObjectMetadata> {
    assertObjectKey(objectKey);
    const result = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }));
    let checksumSha256 = result.Metadata?.["sha256-hex"];
    if (!checksumSha256) {
      const tags = await this.#client.send(new GetObjectTaggingCommand({ Bucket: this.#bucket, Key: objectKey }));
      checksumSha256 = tags.TagSet?.find((tag) => tag.Key === "sha256-hex")?.Value;
    }
    if (!checksumSha256 || result.ContentLength === undefined || !result.ContentType) {
      throw new ObjectStorageError("OBJECT_METADATA_INVALID", "Stored object metadata is incomplete.");
    }
    try {
      assertSha256(checksumSha256);
    } catch (error) {
      throw new ObjectStorageError("OBJECT_METADATA_INVALID", "Stored object checksum metadata is invalid.", {
        cause: error,
      });
    }
    return { objectKey, checksumSha256, sizeBytes: result.ContentLength, contentType: result.ContentType };
  }

  async writeBounded(request: BoundedWriteRequest, body: Readable): Promise<StoredObjectMetadata> {
    assertObjectKey(request.objectKey);
    if (request.checksumSha256) assertSha256(request.checksumSha256);
    if (
      !Number.isSafeInteger(request.sizeBytes) ||
      request.sizeBytes < 0 ||
      !Number.isSafeInteger(request.maxBytes) ||
      request.maxBytes < 1 ||
      request.sizeBytes > request.maxBytes
    ) {
      body.destroy();
      throw new ObjectStorageError("OBJECT_SIZE_LIMIT", "The object exceeds the configured size limit.");
    }
    const cancellation = createCancellation(request.signal, request.timeoutMs);
    const verifier = new IntegrityTransform(request.maxBytes, request.sizeBytes, request.checksumSha256);
    const pumping = pipeline(body, verifier, { signal: cancellation.signal });
    let stored = false;
    try {
      await this.#client.send(
        new PutObjectCommand({
          Bucket: this.#bucket,
          Key: request.objectKey,
          ContentType: request.contentType,
          ContentLength: request.sizeBytes,
          Body: verifier,
          IfNoneMatch: "*",
        }),
        { abortSignal: cancellation.signal },
      );
      await pumping;
      stored = true;
      const checksumSha256 = verifier.checksumSha256;
      await this.#client.send(
        new PutObjectTaggingCommand({
          Bucket: this.#bucket,
          Key: request.objectKey,
          Tagging: { TagSet: [{ Key: "sha256-hex", Value: checksumSha256 }] },
        }),
        { abortSignal: cancellation.signal },
      );
      return {
        objectKey: request.objectKey,
        contentType: request.contentType,
        sizeBytes: request.sizeBytes,
        checksumSha256,
      };
    } catch (error) {
      body.destroy();
      verifier.destroy();
      await pumping.catch(() => undefined);
      if (stored) await this.remove(request.objectKey).catch(() => undefined);
      throw normalizeStorageError(error, cancellation.signal);
    } finally {
      cancellation.dispose();
    }
  }

  async readBounded(request: BoundedReadRequest): Promise<BoundedObjectRead> {
    assertObjectKey(request.objectKey);
    if (request.checksumSha256) assertSha256(request.checksumSha256);
    if (!Number.isSafeInteger(request.maxBytes) || request.maxBytes < 1) {
      throw new ObjectStorageError("OBJECT_SIZE_LIMIT", "The object size limit is invalid.");
    }
    const metadata = await this.metadata(request.objectKey);
    if (metadata.sizeBytes > request.maxBytes) {
      throw new ObjectStorageError("OBJECT_SIZE_LIMIT", "The stored object exceeds the configured size limit.");
    }
    if (request.checksumSha256 && request.checksumSha256 !== metadata.checksumSha256) {
      throw new ObjectStorageError("OBJECT_CHECKSUM_MISMATCH", "The stored object checksum does not match.");
    }
    const cancellation = createCancellation(request.signal, request.timeoutMs);
    try {
      const response = await this.#client.send(new GetObjectCommand({ Bucket: this.#bucket, Key: request.objectKey }), {
        abortSignal: cancellation.signal,
      });
      if (!response.Body) throw new ObjectStorageError("OBJECT_METADATA_INVALID", "The stored object body is missing.");
      const verifier = new IntegrityTransform(request.maxBytes, metadata.sizeBytes, metadata.checksumSha256);
      const source = Readable.from(response.Body as AsyncIterable<Uint8Array>);
      const pumping = pipeline(source, verifier, { signal: cancellation.signal });
      pumping.catch((error: unknown) => verifier.destroy(normalizeStorageError(error, cancellation.signal)));
      const dispose = () => cancellation.dispose();
      verifier.once("close", dispose);
      verifier.once("end", dispose);
      return { metadata, body: verifier };
    } catch (error) {
      cancellation.dispose();
      throw normalizeStorageError(error, cancellation.signal);
    }
  }

  async list(prefix: string, options: { continuationToken?: string; limit?: number } = {}): Promise<ObjectList> {
    assertListPrefix(prefix);
    const limit = options.limit ?? 100;
    if (!Number.isInteger(limit) || limit < 1 || limit > 1_000)
      throw new Error("Object list limit must be 1 to 1,000.");
    const result = await this.#client.send(
      new ListObjectsV2Command({
        Bucket: this.#bucket,
        Prefix: prefix,
        MaxKeys: limit,
        ...(options.continuationToken ? { ContinuationToken: options.continuationToken } : {}),
      }),
    );
    return {
      objects: (result.Contents ?? []).flatMap((item) =>
        item.Key && item.Size !== undefined && item.LastModified
          ? [{ objectKey: item.Key, sizeBytes: item.Size, lastModified: item.LastModified }]
          : [],
      ),
      continuationToken: result.NextContinuationToken ?? null,
    };
  }

  async remove(objectKey: string): Promise<void> {
    assertObjectKey(objectKey);
    await this.#client.send(new DeleteObjectCommand({ Bucket: this.#bucket, Key: objectKey }));
  }

  async exists(objectKey: string): Promise<boolean> {
    assertObjectKey(objectKey);
    try {
      await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }));
      return true;
    } catch (error) {
      const status =
        typeof error === "object" && error !== null && "$metadata" in error
          ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
          : undefined;
      if (status === 404) return false;
      throw error;
    }
  }

  async checkReady(): Promise<void> {
    await this.#client.send(new HeadBucketCommand({ Bucket: this.#bucket }));
  }

  close(): void {
    this.#client.destroy();
  }

  async #signed(
    command: PutObjectCommand | GetObjectCommand,
    headers: Record<string, string>,
  ): Promise<SignedOperation> {
    const url = await getSignedUrl(this.#client, command, { expiresIn: this.#expiresInSeconds });
    return { url, headers, expiresAt: new Date(Date.now() + this.#expiresInSeconds * 1000) };
  }
}

class IntegrityTransform extends Transform {
  readonly #hash = createHash("sha256");
  readonly #maxBytes: number;
  readonly #expectedBytes: number;
  readonly #expectedChecksum: string | undefined;
  #bytes = 0;
  #checksumSha256: string | null = null;

  constructor(maxBytes: number, expectedBytes: number, expectedChecksum?: string) {
    super();
    this.#maxBytes = maxBytes;
    this.#expectedBytes = expectedBytes;
    this.#expectedChecksum = expectedChecksum;
  }

  get checksumSha256(): string {
    if (!this.#checksumSha256) throw new Error("Object checksum is not available before the stream finishes.");
    return this.#checksumSha256;
  }

  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: TransformCallback): void {
    this.#bytes += chunk.length;
    if (this.#bytes > this.#maxBytes) {
      callback(new ObjectStorageError("OBJECT_SIZE_LIMIT", "The object exceeds the configured size limit."));
      return;
    }
    this.#hash.update(chunk);
    callback(null, chunk);
  }

  override _flush(callback: TransformCallback): void {
    if (this.#bytes !== this.#expectedBytes) {
      callback(new ObjectStorageError("OBJECT_SIZE_MISMATCH", "The object size does not match the declared size."));
      return;
    }
    this.#checksumSha256 = this.#hash.digest("hex");
    if (this.#expectedChecksum && this.#checksumSha256 !== this.#expectedChecksum) {
      callback(new ObjectStorageError("OBJECT_CHECKSUM_MISMATCH", "The object checksum does not match."));
      return;
    }
    callback();
  }
}

function createCancellation(
  parent: AbortSignal | undefined,
  timeoutMs = 30_000,
): {
  signal: AbortSignal;
  dispose: () => void;
} {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 300_000) throw new Error("Invalid object timeout.");
  const controller = new AbortController();
  const abort = () => controller.abort(parent?.reason);
  if (parent?.aborted) abort();
  else parent?.addEventListener("abort", abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error("Object operation timed out.")), timeoutMs);
  timer.unref();
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parent?.removeEventListener("abort", abort);
    },
  };
}

function normalizeStorageError(error: unknown, signal: AbortSignal): Error {
  if (error instanceof ObjectStorageError) return error;
  const status =
    typeof error === "object" && error !== null && "$metadata" in error
      ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
      : undefined;
  if (status === 409 || status === 412) {
    return new ObjectStorageError("OBJECT_ALREADY_EXISTS", "The immutable object already exists.", { cause: error });
  }
  if (signal.aborted)
    return new ObjectStorageError("OBJECT_ABORTED", "The object operation was aborted.", { cause: error });
  return error instanceof Error ? error : new Error("The object operation failed.");
}

function assertListPrefix(prefix: string): void {
  if (!prefix.endsWith("/"))
    throw new ObjectStorageError("OBJECT_KEY_INVALID", "Object list prefixes must end with a slash.");
  assertObjectKey(`${prefix}placeholder`);
}
