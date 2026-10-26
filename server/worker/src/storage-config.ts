import { S3ObjectStorage } from "@nexora/domain/storage";

export function createWorkerObjectStorage(environment: NodeJS.ProcessEnv = process.env): S3ObjectStorage {
  const region = required(environment, "S3_REGION");
  const bucket = required(environment, "S3_BUCKET");
  const accessKeyId = required(environment, "S3_ACCESS_KEY_ID");
  const secretAccessKey = required(environment, "S3_SECRET_ACCESS_KEY");
  return new S3ObjectStorage({
    region,
    bucket,
    accessKeyId,
    secretAccessKey,
    ...(environment.S3_ENDPOINT ? { endpoint: environment.S3_ENDPOINT } : {}),
    forcePathStyle: environment.S3_FORCE_PATH_STYLE !== "false",
  });
}

export function readBankStatementCleanupConfig(environment: NodeJS.ProcessEnv = process.env): {
  everyMs: number;
  orphanGraceMs: number;
  pageSize: number;
  maxObjects: number;
} {
  return {
    everyMs: boundedInteger(environment.BANK_STATEMENT_CLEANUP_EVERY_MS, 3_600_000, 300_000, 86_400_000),
    orphanGraceMs: boundedInteger(environment.BANK_STATEMENT_ORPHAN_GRACE_MS, 86_400_000, 60_000, 604_800_000),
    pageSize: boundedInteger(environment.BANK_STATEMENT_CLEANUP_PAGE_SIZE, 100, 1, 1_000),
    maxObjects: boundedInteger(environment.BANK_STATEMENT_CLEANUP_MAX_OBJECTS, 1_000, 1, 10_000),
  };
}

function required(environment: NodeJS.ProcessEnv, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function boundedInteger(value: string | undefined, fallback: number, minimum: number, maximum: number): number {
  const parsed = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`Cleanup setting must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}
