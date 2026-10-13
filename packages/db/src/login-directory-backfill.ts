import { createHmac } from "node:crypto";

import type pg from "pg";

export interface LoginDirectoryBackfillResult {
  examinedAccounts: number;
  inserted: number;
  updated: number;
  unchanged: number;
  deactivated: number;
  skipped: number;
  conflicts: number;
}

interface SourceIdentifierRow {
  tenant_id: string;
  user_id: string;
  email: string;
  status: "active" | "inactive" | "locked";
  username: string;
}

interface ExistingIdentifierRow {
  tenant_id: string;
  user_id: string;
  identifier_kind: "email" | "username";
  identifier_hmac: string;
  lifecycle_state: "active" | "inactive";
}

function hmac(secret: Buffer, domain: string, value: string): string {
  return createHmac("sha256", secret).update(`${domain}\0${value}`, "utf8").digest("hex");
}

function key(row: Pick<ExistingIdentifierRow, "tenant_id" | "user_id" | "identifier_kind">): string {
  return `${row.tenant_id}\0${row.user_id}\0${row.identifier_kind}`;
}

export async function backfillLoginDirectory(
  pool: pg.Pool,
  loginDirectorySecret: string,
): Promise<LoginDirectoryBackfillResult> {
  if (Buffer.byteLength(loginDirectorySecret, "utf8") < 32) {
    throw new Error("AUTH_LOGIN_DIRECTORY_SECRET must contain at least 32 bytes");
  }
  const secret = Buffer.from(loginDirectorySecret, "utf8");
  const verifier = hmac(secret, "nexora-login-directory-secret", "v1");
  const client = await pool.connect();
  try {
    await client.query("begin isolation level serializable");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1, 0))", [
      "nexora:security:login-directory-backfill",
    ]);
    const ownership = await client.query<{ owns_sources: boolean }>(
      `select bool_and(pg_get_userbyid(relowner) = current_user) as owns_sources
       from pg_class
       where oid = any(array[
         'security_user_account'::regclass,
         'security_password_credential'::regclass,
         'security_login_identifier'::regclass
       ])`,
    );
    if (!ownership.rows[0]?.owns_sources) {
      throw new Error("Login directory backfill requires the migration-owner database connection");
    }

    await client.query("alter table security_user_account no force row level security");
    await client.query("alter table security_password_credential no force row level security");

    const state = await client.query<{ secret_verifier: string }>(
      "select secret_verifier from security_login_directory_state where singleton for update",
    );
    if (state.rows[0] && state.rows[0].secret_verifier !== verifier) {
      throw new Error("AUTH_LOGIN_DIRECTORY_SECRET does not match the existing login directory");
    }

    const source = await client.query<SourceIdentifierRow>(
      `select account.tenant_id, account.id as user_id, account.email, account.status, credential.username
       from security_user_account account
       join security_password_credential credential
         on credential.tenant_id = account.tenant_id and credential.user_id = account.id
       order by account.tenant_id, account.id`,
    );
    const existing = await client.query<ExistingIdentifierRow>(
      `select tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state
       from security_login_identifier
       order by tenant_id,user_id,identifier_kind`,
    );
    const existingByKey = new Map(existing.rows.map((row) => [key(row), row]));
    const expectedKeys = new Set<string>();
    let inserted = 0;
    let updated = 0;
    let unchanged = 0;
    let skipped = 0;

    for (const account of source.rows) {
      const normalizedEmail = account.email.trim().toLocaleLowerCase("en-US");
      const normalizedUsername = account.username.trim().toLocaleLowerCase("en-US");
      if (!normalizedEmail || !normalizedUsername) {
        skipped += 1;
        continue;
      }
      const lifecycleState = account.status === "active" ? "active" : "inactive";
      for (const [identifierKind, normalized] of [
        ["email", normalizedEmail],
        ["username", normalizedUsername],
      ] as const) {
        const record: ExistingIdentifierRow = {
          tenant_id: account.tenant_id,
          user_id: account.user_id,
          identifier_kind: identifierKind,
          identifier_hmac: hmac(secret, identifierKind, normalized),
          lifecycle_state: lifecycleState,
        };
        const recordKey = key(record);
        expectedKeys.add(recordKey);
        const previous = existingByKey.get(recordKey);
        if (!previous) inserted += 1;
        else if (
          previous.identifier_hmac !== record.identifier_hmac ||
          previous.lifecycle_state !== record.lifecycle_state
        )
          updated += 1;
        else unchanged += 1;
        await client.query(
          `insert into security_login_identifier
             (tenant_id,user_id,identifier_kind,identifier_hmac,lifecycle_state,source_reference,created_at,updated_at)
           values ($1,$2,$3,$4,$5,'security_password_credential',now(),now())
           on conflict (tenant_id,user_id,identifier_kind) do update
             set identifier_hmac=excluded.identifier_hmac,
                 lifecycle_state=excluded.lifecycle_state,
                 source_reference=excluded.source_reference,
                 updated_at=case
                   when security_login_identifier.identifier_hmac is distinct from excluded.identifier_hmac
                     or security_login_identifier.lifecycle_state is distinct from excluded.lifecycle_state
                   then now() else security_login_identifier.updated_at end`,
          [record.tenant_id, record.user_id, record.identifier_kind, record.identifier_hmac, record.lifecycle_state],
        );
      }
    }

    let deactivated = 0;
    for (const record of existing.rows) {
      if (expectedKeys.has(key(record)) || record.lifecycle_state === "inactive") continue;
      const result = await client.query(
        `update security_login_identifier
         set lifecycle_state='inactive',updated_at=now()
         where tenant_id=$1 and user_id=$2 and identifier_kind=$3 and lifecycle_state='active'`,
        [record.tenant_id, record.user_id, record.identifier_kind],
      );
      deactivated += result.rowCount ?? 0;
    }

    await client.query(
      `insert into security_login_directory_state (singleton,secret_verifier,last_reconciled_at)
       values (true,$1,now())
       on conflict (singleton) do update set last_reconciled_at=excluded.last_reconciled_at`,
      [verifier],
    );
    await client.query("alter table security_password_credential force row level security");
    await client.query("alter table security_user_account force row level security");
    await client.query("commit");
    return {
      examinedAccounts: source.rowCount ?? source.rows.length,
      inserted,
      updated,
      unchanged,
      deactivated,
      skipped,
      conflicts: 0,
    };
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}
