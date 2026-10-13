import { pbkdf2Sync, randomBytes, timingSafeEqual } from "node:crypto";

import { hashPassword, verifyPassword } from "../packages/auth/src/passwords.js";
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
if (!password || password.length < 8) {
  throw new Error("NEXORA_UAT_PASSWORD must contain at least 8 characters");
}
if (!loginDirectorySecret) throw new Error("AUTH_LOGIN_DIRECTORY_SECRET is required");

const identities = [
  "r06.maker",
  "r06.checker",
  "r06.target",
  "r06.restricted",
  "r06.last-admin-a",
  "r06.last-admin-b",
] as const;

const pool = createDatabasePool(databaseUrl);
try {
  await ensureSourceAuthorizationFixture(pool);
  const verifier = await hashPassword(password);
  const client = await pool.connect();
  let insertedCredentials = 0;
  try {
    await client.query("begin");
    for (const userId of identities) {
      const current = await client.query<{
        iterations: number | null;
        salt: Buffer | null;
        password_hash: Buffer | null;
        argon2_hash: string | null;
      }>(
        `select iterations,salt,password_hash,argon2_hash
           from security_password_credential where tenant_id=$1 and user_id=$2`,
        [sourceTestTenantId, userId],
      );
      if (current.rows[0]) {
        const credential = current.rows[0];
        const argonMatches = credential.argon2_hash ? await verifyPassword(credential.argon2_hash, password) : false;
        const legacyCandidate =
          credential.iterations && credential.salt && credential.password_hash
            ? pbkdf2Sync(password, credential.salt, credential.iterations, credential.password_hash.length, "sha256")
            : null;
        const legacyMatches =
          legacyCandidate && credential.password_hash
            ? timingSafeEqual(legacyCandidate, credential.password_hash)
            : false;
        if (!argonMatches && !legacyMatches) {
          throw new Error(
            "A controlled UAT credential already exists with a different password. Use the existing managed UAT password or provision a fresh isolated UAT database.",
          );
        }
        continue;
      }
      const salt = randomBytes(16);
      const inserted = await client.query(
        `insert into security_password_credential
          (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,
           argon2_hash,argon2_updated_at,must_change_password,credential_status,updated_at)
         values ($1,$2,$2,'pbkdf2_sha256',310000,$3,$4,$5,now(),false,'active',now())
         on conflict (tenant_id,user_id) do nothing`,
        [sourceTestTenantId, userId, salt, pbkdf2Sync(password, salt, 310_000, 32, "sha256"), verifier],
      );
      insertedCredentials += inserted.rowCount ?? 0;
    }
    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }

  const directory = await backfillLoginDirectory(pool, loginDirectorySecret);
  const counts = await pool.query<{
    identities: string;
    companies: string;
    employees: string;
    credentials: string;
  }>(
    `select
       (select count(*)::text from security_user_account where tenant_id=$1 and id=any($2::text[])) as identities,
       (select count(*)::text from organization_unit where tenant_id=$1 and type='company' and status='active') as companies,
       (select count(*)::text from employee where tenant_id=$1 and id like 'r06-uat-employee-%') as employees,
       (select count(*)::text from security_password_credential where tenant_id=$1 and user_id=any($2::text[])) as credentials`,
    [sourceTestTenantId, identities],
  );

  process.stdout.write(
    `${JSON.stringify({
      tenantId: sourceTestTenantId,
      identities: Number(counts.rows[0]?.identities ?? 0),
      companies: Number(counts.rows[0]?.companies ?? 0),
      employees: Number(counts.rows[0]?.employees ?? 0),
      credentials: Number(counts.rows[0]?.credentials ?? 0),
      insertedCredentials,
      loginDirectory: {
        examined: directory.examinedAccounts,
        inserted: directory.inserted,
        unchanged: directory.unchanged,
      },
    })}\n`,
  );
} finally {
  await pool.end();
}
