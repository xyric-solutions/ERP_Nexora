import { pbkdf2Sync, randomBytes } from "node:crypto";

import { hashPassword } from "../packages/auth/src/passwords.js";
import { backfillLoginDirectory } from "../packages/db/src/login-directory-backfill.js";
import { createDatabasePool } from "../packages/db/src/pool.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "../tests/integration/source-security-fixture.js";

const databaseUrl = process.env.DATABASE_URL;
const password = process.env.NEXORA_UAT_PASSWORD;
const loginDirectorySecret = process.env.AUTH_LOGIN_DIRECTORY_SECRET;
if (process.env.NEXORA_ENVIRONMENT !== "uat" || process.env.NEXORA_UAT_CONFIRM !== sourceTestTenantId) {
  throw new Error(`Set NEXORA_ENVIRONMENT=uat and NEXORA_UAT_CONFIRM=${sourceTestTenantId}`);
}
if (!databaseUrl) throw new Error("DATABASE_URL is required");
if (!password || password.length < 8) throw new Error("NEXORA_UAT_PASSWORD must contain at least 8 characters");
if (!loginDirectorySecret) throw new Error("AUTH_LOGIN_DIRECTORY_SECRET is required");

const userIds = ["r06.maker", "r06.checker", "r06.target", "r06.restricted", "r06.last-admin-a", "r06.last-admin-b"];
const selectionTenantId = "nexora-r06-selection-uat";
const selectionUserId = "r06.maker.secondary";
const pool = createDatabasePool(databaseUrl);
try {
  await ensureSourceAuthorizationFixture(pool);
  const client = await pool.connect();
  let insertedCredentials = 0;
  try {
    await client.query("begin");
    await client.query(
      `insert into tenant (id,name,plan,region,status,default_locale)
       values ($1,'Nexora R06 Selection UAT','enterprise','uat-isolated','active','en-US')
       on conflict (id) do nothing`,
      [selectionTenantId],
    );
    await client.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
       values ($1,$2,$3,'r06.maker@uat.nexora.invalid','active','disabled',now(),now())
       on conflict (tenant_id,id) do nothing`,
      [selectionUserId, selectionTenantId, `r06-selection:${selectionUserId}`],
    );
    const expected = await client.query<{ id: string }>(
      "select id from security_user_account where tenant_id=$1 and id=any($2::text[]) order by id",
      [sourceTestTenantId, userIds],
    );
    if (expected.rowCount !== userIds.length) throw new Error("The controlled R06 UAT identity fixture is incomplete");

    const credentials = [
      ...userIds.map((userId) => ({ tenantId: sourceTestTenantId, userId })),
      { tenantId: selectionTenantId, userId: selectionUserId },
    ];
    const argon2Hash = await hashPassword(password);
    for (const credential of credentials) {
      const salt = randomBytes(16);
      const result = await client.query(
        `insert into security_password_credential
          (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,argon2_hash,argon2_updated_at,updated_at)
         values ($1,$2,$3,'pbkdf2_sha256',310000,$4,$5,$6,now(),now())
         on conflict (tenant_id,user_id) do nothing`,
        [
          credential.tenantId,
          credential.userId,
          credential.userId,
          salt,
          pbkdf2Sync(password, salt, 310_000, 32, "sha256"),
          argon2Hash,
        ],
      );
      insertedCredentials += result.rowCount ?? 0;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const directory = await backfillLoginDirectory(pool, loginDirectorySecret);
  process.stdout.write(
    `${JSON.stringify({
      tenantId: sourceTestTenantId,
      identityCount: userIds.length,
      selectionTenantId,
      insertedCredentials,
      directory,
    })}\n`,
  );
} finally {
  await pool.end();
}
