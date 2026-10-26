import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

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
  it("writes and reads bounded immutable objects with verified checksums", async () => {
    const body = Buffer.from("Nexora bounded Bank Statement");
    const objectKey = `bank-statements/quarantine/test/test/${randomUUID()}.csv`;
    const expectedChecksum = createHash("sha256").update(body).digest("hex");
    const written = await storage.writeBounded(
      {
        objectKey,
        contentType: "text/csv",
        sizeBytes: body.length,
        maxBytes: 1_024,
        checksumSha256: expectedChecksum,
        timeoutMs: 5_000,
      },
      Readable.from([body]),
    );
    expect(written).toMatchObject({ objectKey, sizeBytes: body.length, checksumSha256: expectedChecksum });

    const stored = await storage.readBounded({
      objectKey,
      maxBytes: 1_024,
      checksumSha256: expectedChecksum,
      timeoutMs: 5_000,
    });
    const chunks: Buffer[] = [];
    for await (const chunk of stored.body) chunks.push(Buffer.from(chunk));
    expect(Buffer.concat(chunks)).toEqual(body);

    await expect(
      storage.writeBounded(
        { objectKey, contentType: "text/csv", sizeBytes: body.length, maxBytes: 1_024, timeoutMs: 5_000 },
        Readable.from([body]),
      ),
    ).rejects.toMatchObject({ code: "OBJECT_ALREADY_EXISTS" });

    const listed = await storage.list("bank-statements/quarantine/test/test/", { limit: 100 });
    expect(listed.objects).toEqual(expect.arrayContaining([expect.objectContaining({ objectKey })]));
    await storage.remove(objectKey);
    await expect(storage.metadata(objectKey)).rejects.toBeDefined();
  });

  it("aborts oversized writes before persisting an object", async () => {
    const objectKey = `bank-statements/quarantine/test/test/${randomUUID()}.csv`;
    await expect(
      storage.writeBounded(
        { objectKey, contentType: "text/csv", sizeBytes: 9, maxBytes: 8, timeoutMs: 5_000 },
        Readable.from([Buffer.from("123456789")]),
      ),
    ).rejects.toMatchObject({ code: "OBJECT_SIZE_LIMIT" });
    await expect(storage.metadata(objectKey)).rejects.toBeDefined();
  });

  it("does not persist a cancelled upload", async () => {
    const objectKey = `bank-statements/quarantine/test/test/${randomUUID()}.csv`;
    const controller = new AbortController();
    controller.abort();
    await expect(
      storage.writeBounded(
        {
          objectKey,
          contentType: "text/csv",
          sizeBytes: 4,
          maxBytes: 8,
          timeoutMs: 5_000,
          signal: controller.signal,
        },
        Readable.from([Buffer.from("test")]),
      ),
    ).rejects.toMatchObject({ code: "OBJECT_ABORTED" });
    await expect(storage.metadata(objectKey)).rejects.toBeDefined();
  });

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
