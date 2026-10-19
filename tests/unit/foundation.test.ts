import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../../server/api/src/app.js";
import { loadConfig } from "../../server/api/src/config.js";
import { FileSigningService } from "../../server/api/src/modules/files/service.js";
import { processSampleJob } from "../../server/worker/src/jobs/sample.js";
import { verifyObjectMetadata } from "../../packages/domain/src/storage/object-storage.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";

function testApp(readiness: Record<string, () => Promise<void>> = { database: async () => undefined }) {
  return createApp({
    config: { allowedOrigins: new Set(["http://localhost:3000"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness,
    jobPublisher: { publishSample: vi.fn(async () => undefined) },
    version: "test",
  });
}

describe("runtime foundation", () => {
  it("requires independent high-entropy throttle and session secrets without MFA configuration", () => {
    const environment: NodeJS.ProcessEnv = {
      NODE_ENV: "test",
      DATABASE_URL: "postgresql://nexora@localhost:5432/nexora_test",
      REDIS_URL: "redis://localhost:6379",
      AUTH_THROTTLE_SECRET: "t".repeat(32),
      AUTH_LOGIN_DIRECTORY_SECRET: "d".repeat(32),
      AUTH_SESSION_SECRET: "s".repeat(32),
      BANKING_DATA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString("base64"),
    };

    const config = loadConfig(environment);
    expect(config.authThrottleSecret).toBe("t".repeat(32));
    expect(config.authLoginDirectorySecret).toBe("d".repeat(32));
    expect(config.authSessionSecret).toBe("s".repeat(32));
    expect(config.bankingDataEncryptionKeyVersion).toBe("v1");
    expect(() => loadConfig({ ...environment, BANKING_DATA_ENCRYPTION_KEY: "" })).toThrow();
    expect(() => loadConfig({ ...environment, AUTH_THROTTLE_SECRET: "short" })).toThrow();
    expect(() => loadConfig({ ...environment, AUTH_SESSION_SECRET: "short" })).toThrow();
    expect(() => loadConfig({ ...environment, AUTH_SESSION_SECRET: environment.AUTH_THROTTLE_SECRET })).toThrow();
    expect(() =>
      loadConfig({ ...environment, AUTH_LOGIN_DIRECTORY_SECRET: environment.AUTH_THROTTLE_SECRET }),
    ).toThrow();
  });

  it("serves liveness and dependency-aware readiness", async () => {
    const live = await request(testApp()).get("/api/v1/health/live");
    expect(live.status).toBe(200);
    expect(live.body).toMatchObject({ status: "ok", service: "nexora-api", version: "test" });

    const unavailable = await request(
      testApp({
        database: async () => {
          throw new Error("offline");
        },
      }),
    ).get("/api/v1/health/ready");
    expect(unavailable.status).toBe(503);
    expect(unavailable.body).toMatchObject({ code: "NOT_READY", status: 503 });
    expect(unavailable.headers["x-correlation-id"]).toBeTruthy();
  });

  it("does not expose the sample job publisher when production dependencies omit it", async () => {
    const app = createApp({
      config: { allowedOrigins: new Set(["http://localhost:3000"]) },
      logger: createLogger(new PassThrough()),
      metrics: createMetrics(),
      readiness: { database: async () => undefined },
      version: "test",
    });

    const response = await request(app).post("/api/v1/jobs/sample").send({ mode: "succeed" });
    expect(response.status).toBe(404);
    expect(response.body).toMatchObject({ code: "NOT_FOUND", status: 404 });
  });

  it("retries a retryable job once without duplicating completion", async () => {
    const mark = vi.fn(async () => undefined);
    const data = {
      requestId: "29d4f890-4237-4b43-a31a-9b98d2136813",
      mode: "retry-once" as const,
      correlationId: "corr-1",
      traceContext: {},
    };
    await expect(processSampleJob({ id: "job-1", data, attemptsMade: 0 } as never, { mark })).rejects.toThrow(
      "RETRYABLE",
    );
    await expect(processSampleJob({ id: "job-1", data, attemptsMade: 1 } as never, { mark })).resolves.toEqual({
      processed: true,
    });
    expect(mark.mock.calls.filter((call) => call[1] === "completed")).toHaveLength(1);
  });

  it("rejects storage metadata that differs from the authorized upload", () => {
    const expected = {
      objectKey: "quarantine/one",
      contentType: "application/pdf",
      sizeBytes: 42,
      checksumSha256: "a".repeat(64),
    };
    expect(() => verifyObjectMetadata(expected, { ...expected, sizeBytes: 43 })).toThrow(/does not match/);
  });

  it("signs bounded private uploads and only available downloads", async () => {
    const storage = {
      signUpload: vi.fn(async () => ({ url: "https://storage.invalid/upload", expiresAt: new Date(), headers: {} })),
      signDownload: vi.fn(async () => ({
        url: "https://storage.invalid/download",
        expiresAt: new Date(),
        headers: {},
      })),
      metadata: vi.fn(),
    };
    const files = new FileSigningService(storage);
    const upload = await files.authorizeUpload({
      contentType: "application/pdf",
      sizeBytes: 42,
      checksumSha256: "a".repeat(64),
    });
    expect(upload.objectKey).toMatch(/^quarantine\/[0-9a-f-]{36}$/);
    expect(storage.signUpload).toHaveBeenCalledOnce();
    await expect(files.authorizeDownload("quarantine/00000000-0000-0000-0000-000000000000")).rejects.toThrow(
      /not available/,
    );
    await expect(files.authorizeDownload("available/00000000-0000-0000-0000-000000000000")).resolves.toMatchObject({
      url: "https://storage.invalid/download",
    });
  });
});
