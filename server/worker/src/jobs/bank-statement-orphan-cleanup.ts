import type pg from "pg";

export const BANK_STATEMENT_CLEANUP_JOB = "bank-statement-orphan-cleanup";
export const BANK_STATEMENT_QUARANTINE_PREFIX = "bank-statements/quarantine/";

type ImportState = "uploaded" | "draft" | "validated" | "finalized" | "rejected";

export interface BankStatementCleanupStorage {
  list(
    prefix: string,
    options: { continuationToken?: string; limit: number },
  ): Promise<{
    objects: Array<{ objectKey: string; sizeBytes: number; lastModified: Date }>;
    continuationToken: string | null;
  }>;
  exists(objectKey: string): Promise<boolean>;
  remove(objectKey: string): Promise<void>;
}

export interface BankStatementCleanupRepository {
  withObjectReferenceLock<T>(
    objectKey: string,
    operation: (reference: { state: ImportState } | null) => Promise<T>,
  ): Promise<T>;
  listStaleIntents(cutoff: Date, limit: number): Promise<Array<{ objectKey: string }>>;
}

export type BankStatementOrphanCleanupOptions = {
  now: Date;
  orphanGraceMs: number;
  pageSize: number;
  maxObjects: number;
};

export type BankStatementOrphanCleanupResult = {
  scanned: number;
  deleted: number;
  retained: number;
  missingIntents: number;
  truncated: boolean;
};

export async function processBankStatementOrphanCleanup(
  options: BankStatementOrphanCleanupOptions,
  dependencies: { storage: BankStatementCleanupStorage; repository: BankStatementCleanupRepository },
): Promise<BankStatementOrphanCleanupResult> {
  validateOptions(options);
  const cutoff = new Date(options.now.getTime() - options.orphanGraceMs);
  let continuationToken: string | undefined;
  let scanned = 0;
  let deleted = 0;
  let retained = 0;
  let truncated = false;

  do {
    const remaining = options.maxObjects - scanned;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    const page = await dependencies.storage.list(BANK_STATEMENT_QUARANTINE_PREFIX, {
      ...(continuationToken ? { continuationToken } : {}),
      limit: Math.min(options.pageSize, remaining),
    });
    for (const object of page.objects.slice(0, remaining)) {
      scanned += 1;
      if (object.lastModified >= cutoff) {
        retained += 1;
        continue;
      }
      const removed = await dependencies.repository.withObjectReferenceLock(object.objectKey, async (reference) => {
        if (reference) return false;
        if (!(await dependencies.storage.exists(object.objectKey))) return false;
        await dependencies.storage.remove(object.objectKey);
        return true;
      });
      if (removed) deleted += 1;
      else retained += 1;
    }
    if (page.objects.length > remaining) truncated = true;
    continuationToken = page.continuationToken ?? undefined;
    if (continuationToken && scanned >= options.maxObjects) truncated = true;
  } while (continuationToken && scanned < options.maxObjects);

  const intents = await dependencies.repository.listStaleIntents(cutoff, options.maxObjects);
  let missingIntents = 0;
  for (const intent of intents) {
    if (!(await dependencies.storage.exists(intent.objectKey))) missingIntents += 1;
  }
  return { scanned, deleted, retained, missingIntents, truncated };
}

export class PostgresBankStatementCleanupRepository implements BankStatementCleanupRepository {
  constructor(private readonly pool: pg.Pool) {}

  async withObjectReferenceLock<T>(
    objectKey: string,
    operation: (reference: { state: ImportState } | null) => Promise<T>,
  ): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [objectKey]);
      const result = await client.query<{ state: ImportState }>(
        `select state
           from bank_statement_import
          where object_storage_key = $1
          order by tenant_id
          limit 1
          for share`,
        [objectKey],
      );
      const value = await operation(result.rows[0] ?? null);
      await client.query("commit");
      return value;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async listStaleIntents(cutoff: Date, limit: number): Promise<Array<{ objectKey: string }>> {
    const result = await this.pool.query<{ object_storage_key: string }>(
      `select object_storage_key
         from bank_statement_import
        where state in ('uploaded','draft','validated')
          and updated_at < $1
        order by updated_at, tenant_id, id
        limit $2`,
      [cutoff, limit],
    );
    return result.rows.map((row) => ({ objectKey: row.object_storage_key }));
  }
}

function validateOptions(options: BankStatementOrphanCleanupOptions): void {
  if (!Number.isFinite(options.now.getTime())) throw new Error("Cleanup time is invalid.");
  if (!Number.isInteger(options.orphanGraceMs) || options.orphanGraceMs < 60_000) {
    throw new Error("Cleanup grace must be at least one minute.");
  }
  if (!Number.isInteger(options.pageSize) || options.pageSize < 1 || options.pageSize > 1_000) {
    throw new Error("Cleanup page size must be between 1 and 1,000.");
  }
  if (!Number.isInteger(options.maxObjects) || options.maxObjects < 1 || options.maxObjects > 10_000) {
    throw new Error("Cleanup object limit must be between 1 and 10,000.");
  }
}
