import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  assertSha256,
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
    });
  }

  async signUpload(request: UploadRequest): Promise<SignedOperation> {
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
    return this.#signed(new GetObjectCommand({ Bucket: this.#bucket, Key: objectKey }), {});
  }

  async metadata(objectKey: string): Promise<StoredObjectMetadata> {
    const result = await this.#client.send(new HeadObjectCommand({ Bucket: this.#bucket, Key: objectKey }));
    const checksumSha256 = result.Metadata?.["sha256-hex"];
    if (!checksumSha256 || result.ContentLength === undefined || !result.ContentType)
      throw new Error("stored object metadata is incomplete");
    return { objectKey, checksumSha256, sizeBytes: result.ContentLength, contentType: result.ContentType };
  }

  async #signed(
    command: PutObjectCommand | GetObjectCommand,
    headers: Record<string, string>,
  ): Promise<SignedOperation> {
    const url = await getSignedUrl(this.#client, command, { expiresIn: this.#expiresInSeconds });
    return { url, headers, expiresAt: new Date(Date.now() + this.#expiresInSeconds * 1000) };
  }
}
