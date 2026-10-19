import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { SourceTenantAuthenticationRepository } from "../../server/api/src/modules/auth/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const executeFile = promisify(execFile);

run("Shoaib super-administrator provisioning", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("reconciles one active assignment and one governed override grant across repeated runs", async () => {
    const environment = {
      ...process.env,
      DATABASE_URL: databaseUrl!,
      NEXORA_ENVIRONMENT: "uat",
      NEXORA_UAT_CONFIRM: sourceTestTenantId,
      NEXORA_SHOAIB_PASSWORD: "NexoraLocal!2026-ProvisioningTest",
      AUTH_LOGIN_DIRECTORY_SECRET: "provisioning-test-directory-secret-2026",
    };
    const arguments_ = ["node_modules/tsx/dist/cli.mjs", "scripts/provision-shoaib-admin.ts"];
    await executeFile(process.execPath, arguments_, { cwd: process.cwd(), env: environment });
    await executeFile(process.execPath, arguments_, { cwd: process.cwd(), env: environment });

    const evidence = await pool.query<{
      assignment_count: number;
      grant_count: number;
    }>(
      `select
         (select count(*)::int from security_user_role_assignment
           where tenant_id=$1 and user_id='user-shoaib-super-admin'
             and role_policy_id='policy-super-administrator' and lifecycle_state='active') as assignment_count,
         (select count(*)::int from security_role_permission_grant
           where tenant_id=$1 and role_policy_id='policy-super-administrator'
             and permission_key='platform.approval.override') as grant_count`,
      [sourceTestTenantId],
    );
    expect(evidence.rows[0]).toEqual({ assignment_count: 1, grant_count: 1 });

    const authenticated = await new SourceTenantAuthenticationRepository(pool).loadAuthenticatedAccount(
      sourceTestTenantId,
      "user-shoaib-super-admin",
      new Date(),
    );
    expect(authenticated?.roles).toContain("super_administrator");
    expect(authenticated?.permissions).toContain("platform.approval.override");
  });
});
