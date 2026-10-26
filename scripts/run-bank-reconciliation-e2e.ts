import { randomBytes } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";

import {
  CreateBucketCommand,
  DeleteBucketCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createDatabasePool } from "../packages/db/src/index.js";

const bootstrapUrl =
  process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test";
const redisUrl = process.env.TEST_SOURCE_REDIS_URL ?? "redis://127.0.0.1:56380";
const s3Endpoint = process.env.TEST_S3_ENDPOINT ?? "http://127.0.0.1:59000";
const s3Region = process.env.S3_REGION ?? "us-east-1";
const s3AccessKeyId = process.env.TEST_S3_ACCESS_KEY_ID ?? "nexora-test";
const s3SecretAccessKey = process.env.TEST_S3_SECRET_ACCESS_KEY ?? "nexora-test-secret";
const bootstrap = new URL(bootstrapUrl);
const revaluationAcceptance = process.env.NEXORA_BANK_REVALUATION_E2E === "true";
const acceptanceName = revaluationAcceptance ? "Bank Revaluation" : "Bank Reconciliation";
if (!["127.0.0.1", "localhost", "[::1]"].includes(bootstrap.hostname)) {
  throw new Error("The reconciliation E2E bootstrap database must be local.");
}

const suffix = randomBytes(12).toString("hex");
const databaseName = `nexora_bank_context_e2e_isolated_${suffix}`;
const bucket = `nexora-reconciliation-e2e-${suffix}`;
const nextDistDirectoryName = `bank-reconciliation-e2e-${suffix}`;
const password = `R7!${randomBytes(12).toString("base64url")}aZ`;
if (!/^nexora_bank_context_e2e_isolated_[a-f0-9]{24}$/.test(databaseName)) throw new Error("Unsafe E2E database name.");
if (!/^nexora-reconciliation-e2e-[a-f0-9]{24}$/.test(bucket)) throw new Error("Unsafe E2E bucket name.");
if (!/^bank-reconciliation-e2e-[a-f0-9]{24}$/.test(nextDistDirectoryName))
  throw new Error("Unsafe E2E Next build directory name.");
const nextDistDirectory = resolve(".next", nextDistDirectoryName);
const nextDistSetting = `.next/${nextDistDirectoryName}`;

async function freePort(from: number, to: number) {
  for (let port = from; port <= to; port += 1) {
    const available = await new Promise<boolean>((resolveAvailability) => {
      const server = createServer();
      server.once("error", () => resolveAvailability(false));
      server.listen(port, "127.0.0.1", () => server.close(() => resolveAvailability(true)));
    });
    if (available) return port;
  }
  throw new Error(`No free localhost port is available between ${from} and ${to}.`);
}

async function waitFor(url: string, timeoutMs: number) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error(`Timed out waiting for ${url}.`);
}

await mkdir(resolve("outputs", "bank-reconciliation-e2e"), { recursive: true });
const apiPort = await freePort(4011, 4099);
const webPort = await freePort(3201, 3299);
const webOrigin = `http://127.0.0.1:${webPort}`;
const apiOrigin = `http://127.0.0.1:${apiPort}`;
const s3 = new S3Client({
  endpoint: s3Endpoint,
  region: s3Region,
  forcePathStyle: true,
  credentials: { accessKeyId: s3AccessKeyId, secretAccessKey: s3SecretAccessKey },
});
const children: ChildProcess[] = [];
let bucketCreated = false;

function child(script: string, args: string[], env: NodeJS.ProcessEnv, logName: string) {
  const output = createWriteStream(resolve("outputs", "bank-reconciliation-e2e", logName), { flags: "w" });
  const processHandle = spawn(process.execPath, [script, ...args], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  processHandle.stdout?.pipe(output);
  processHandle.stderr?.pipe(output);
  children.push(processHandle);
  return processHandle;
}

async function stop(processHandle: ChildProcess) {
  if (processHandle.exitCode !== null || !processHandle.pid) return;
  processHandle.kill("SIGTERM");
  await Promise.race([
    new Promise<void>((resolveExit) => processHandle.once("exit", () => resolveExit())),
    new Promise<void>((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (processHandle.exitCode === null) processHandle.kill("SIGKILL");
}

let outcome = 1;
let failure: unknown;
const cleanupErrors: unknown[] = [];
try {
  await s3.send(new CreateBucketCommand({ Bucket: bucket }));
  bucketCreated = true;
  const sharedEnv = {
    ...process.env,
    TEST_SOURCE_BOOTSTRAP_DATABASE_URL: bootstrapUrl,
    TEST_SOURCE_REDIS_URL: redisUrl,
    REDIS_URL: redisUrl,
    S3_ENDPOINT: s3Endpoint,
    S3_REGION: s3Region,
    S3_BUCKET: bucket,
    S3_ACCESS_KEY_ID: s3AccessKeyId,
    S3_SECRET_ACCESS_KEY: s3SecretAccessKey,
    S3_FORCE_PATH_STYLE: "true",
    NEXORA_BANK_CONTEXT_E2E_DATABASE: databaseName,
    NEXORA_BANK_CONTEXT_E2E_PASSWORD: password,
    NEXORA_BANK_CONTEXT_E2E_PORT: String(apiPort),
    NEXORA_BANK_CONTEXT_E2E_WEB_ORIGIN: webOrigin,
  };
  const api = child(
    resolve("node_modules", "tsx", "dist", "cli.mjs"),
    [resolve("scripts", "run-bank-reconciliation-e2e-api.ts")],
    sharedEnv,
    "api.log",
  );
  await waitFor(`${apiOrigin}/api/v1/health/ready`, 120_000);
  if (api.exitCode !== null) throw new Error("The isolated reconciliation API exited before browser acceptance.");

  const web = child(
    resolve("node_modules", "next", "dist", "bin", "next"),
    ["dev", "--hostname", "127.0.0.1", "--port", String(webPort)],
    {
      ...sharedEnv,
      NEXT_PUBLIC_API_BASE_URL: apiOrigin,
      APP_URL: webOrigin,
      NEXT_DIST_DIR: nextDistSetting,
    },
    "web.log",
  );
  await waitFor(webOrigin, 120_000);
  if (web.exitCode !== null) throw new Error("The isolated reconciliation web server exited before acceptance.");

  const playwright = child(
    resolve("node_modules", "@playwright", "test", "cli.js"),
    [
      "test",
      "--workers=1",
      ...(revaluationAcceptance
        ? ["tests/e2e/bank-revaluations.spec.ts"]
        : ["tests/e2e/bank-reconciliation.spec.ts", "tests/e2e/bank-statement-import.spec.ts"]),
    ],
    {
      ...sharedEnv,
      PLAYWRIGHT_BASE_URL: webOrigin,
      PLAYWRIGHT_USE_EXISTING_WEB: "true",
      NEXORA_BANKING_MAKER_USERNAME: "r06.maker",
      NEXORA_BANKING_CHECKER_USERNAME: "r06.checker",
      NEXORA_BANK_REVALUATION_MAKER_USERNAME: "r06.maker",
      NEXORA_BANK_REVALUATION_APPROVER_USERNAME: "r06.checker",
      NEXORA_BANK_REVALUATION_POSTER_USERNAME: "r06.target",
      NEXORA_BANK_REVALUATION_CURRENCY: "PKR",
      NEXORA_BANK_REVALUATION_DATE: "2026-10-26",
      NEXORA_E2E_PASSWORD: password,
    },
    "playwright.log",
  );
  outcome = await new Promise<number>((resolveExit) => playwright.once("exit", (code) => resolveExit(code ?? 1)));
} catch (error) {
  failure = error;
} finally {
  for (const processHandle of [...children].reverse()) {
    try {
      await stop(processHandle);
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    if (bucketCreated) {
      let continuation: string | undefined;
      do {
        const listed = await s3.send(new ListObjectsV2Command({ Bucket: bucket, ContinuationToken: continuation }));
        if (listed.Contents?.length) {
          await s3.send(
            new DeleteObjectsCommand({
              Bucket: bucket,
              Delete: { Objects: listed.Contents.flatMap((item) => (item.Key ? [{ Key: item.Key }] : [])) },
            }),
          );
        }
        continuation = listed.IsTruncated ? listed.NextContinuationToken : undefined;
      } while (continuation);
      await s3.send(new DeleteBucketCommand({ Bucket: bucket }));
    }
  } catch (error) {
    cleanupErrors.push(error);
  } finally {
    s3.destroy();
  }
  const database = createDatabasePool(bootstrapUrl);
  try {
    await database.query(`drop database if exists ${databaseName}`);
  } catch (error) {
    cleanupErrors.push(error);
  } finally {
    try {
      await database.end();
    } catch (error) {
      cleanupErrors.push(error);
    }
  }
  try {
    await rm(nextDistDirectory, { recursive: true, force: true });
  } catch (error) {
    cleanupErrors.push(error);
  }
}

if (failure || cleanupErrors.length)
  throw new AggregateError(
    [...(failure ? [failure] : []), ...cleanupErrors],
    `${acceptanceName} isolated acceptance or cleanup failed.`,
  );
if (outcome !== 0) throw new Error(`${acceptanceName} browser acceptance failed with exit code ${outcome}.`);
