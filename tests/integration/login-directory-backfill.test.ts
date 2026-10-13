import { pbkdf2Sync, randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { backfillLoginDirectory } from "../../packages/db/src/login-directory-backfill.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/pool.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("login-directory backfill", () => {
  const suffix = randomUUID();
  const tenantId = `login-backfill-${suffix}`;
  const userId = `login-user-${suffix}`;
  const email = `login.${suffix}@uat.nexora.invalid`;
  const secret = "d".repeat(32);
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
    await pool.query(
      `insert into tenant (id,name,plan,region,status,default_locale)
       values ($1,'Login Backfill Test','enterprise','test','active','en-US')`,
      [tenantId],
    );
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
       values ($1,$2,$3,$4,'active','disabled',now(),now())`,
      [userId, tenantId, `test:${userId}`, email],
    );
    const salt = randomBytes(16);
    await pool.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at)
       values ($1,$2,$3,'pbkdf2_sha256',310000,$4,$5,now())`,
      [tenantId, userId, userId, salt, pbkdf2Sync("test password", salt, 310_000, 32, "sha256")],
    );
  });

  afterAll(async () => {
    if (pool) {
      await pool.query("delete from security_login_identifier where tenant_id=$1", [tenantId]);
      await pool.query("delete from security_password_credential where tenant_id=$1", [tenantId]);
      await pool.query("delete from security_user_account where tenant_id=$1", [tenantId]);
      await pool.query("delete from tenant where id=$1", [tenantId]);
      await pool.end();
    }
  });

  it("is deterministic, idempotent, and leaves source credentials unchanged", async () => {
    const before = await pool.query<{ password_hash: string; argon2_hash: string | null }>(
      `select encode(password_hash,'hex') as password_hash,argon2_hash
       from security_password_credential where tenant_id=$1 and user_id=$2`,
      [tenantId, userId],
    );
    const first = await backfillLoginDirectory(pool, secret);
    expect(first.inserted).toBeGreaterThanOrEqual(2);
    const rows = await pool.query<{ identifier_kind: string; lifecycle_state: string }>(
      `select identifier_kind,lifecycle_state from security_login_identifier
       where tenant_id=$1 and user_id=$2 order by identifier_kind`,
      [tenantId, userId],
    );
    expect(rows.rows).toEqual([
      { identifier_kind: "email", lifecycle_state: "active" },
      { identifier_kind: "username", lifecycle_state: "active" },
    ]);
    const second = await backfillLoginDirectory(pool, secret);
    expect(second.inserted).toBe(0);
    expect(second.updated).toBe(0);
    const after = await pool.query<{ password_hash: string; argon2_hash: string | null }>(
      `select encode(password_hash,'hex') as password_hash,argon2_hash
       from security_password_credential where tenant_id=$1 and user_id=$2`,
      [tenantId, userId],
    );
    expect(after.rows).toEqual(before.rows);
    const rls = await pool.query<{ relforcerowsecurity: boolean }>(
      `select relforcerowsecurity from pg_class where oid=any(array[
        'security_user_account'::regclass,'security_password_credential'::regclass
      ]) order by relname`,
    );
    expect(rls.rows.every((row) => row.relforcerowsecurity)).toBe(true);
  });

  it("rejects a mismatched directory secret before mutation", async () => {
    await expect(backfillLoginDirectory(pool, "x".repeat(32))).rejects.toThrow(/does not match/);
  });
});
