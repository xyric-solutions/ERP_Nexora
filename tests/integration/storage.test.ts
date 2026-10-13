import { createHash, randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { S3ObjectStorage } from "../../packages/domain/src/storage/s3-object-storage.js";
import { verifyObjectMetadata } from "../../packages/domain/src/storage/object-storage.js";

const endpoint = process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000";
const storage = new S3ObjectStorage({
  endpoint,
  region: "us-east-1",
  bucket: "nexora-test",
  accessKeyId: "nexora-test",
  secretAccessKey: "nexora-test-secret",
  forcePathStyle: true,
});

describe("private object storage", () => {
  it("uploads and downloads by signed URL while keeping the bucket private", async () => {
    const body = new TextEncoder().encode("Nexora private object integration proof");
    const expected = {
      objectKey: `quarantine/${randomUUID()}`,
      contentType: "application/pdf",
      sizeBytes: body.byteLength,
      checksumSha256: createHash("sha256").update(body).digest("hex"),
    };
    const upload = await storage.signUpload(expected);
    const uploaded = await fetch(upload.url, { method: "PUT", headers: upload.headers, body });
    expect(uploaded.status).toBe(200);

    const actual = await storage.metadata(expected.objectKey);
    expect(() => verifyObjectMetadata(expected, actual)).not.toThrow();

    const unsigned = await fetch(`${endpoint}/nexora-test/${expected.objectKey}`);
    expect(unsigned.status).toBe(403);

    const download = await storage.signDownload(expected.objectKey);
    const downloaded = await fetch(download.url);
    expect(downloaded.status).toBe(200);
    expect(new Uint8Array(await downloaded.arrayBuffer())).toEqual(body);
  });

  it("rejects content that does not match the signed checksum", async () => {
    const expectedBody = new TextEncoder().encode("expected");
    const tamperedBody = new TextEncoder().encode("tampered");
    const upload = await storage.signUpload({
      objectKey: `quarantine/${randomUUID()}`,
      contentType: "application/pdf",
      sizeBytes: expectedBody.byteLength,
      checksumSha256: createHash("sha256").update(expectedBody).digest("hex"),
    });
    const response = await fetch(upload.url, { method: "PUT", headers: upload.headers, body: tamperedBody });
    expect(response.status).toBe(400);
  });
});
