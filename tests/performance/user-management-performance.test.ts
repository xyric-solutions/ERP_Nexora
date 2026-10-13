import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SourceSecurityAdministrationRepository,
  type SecurityActorContext,
} from "../../apps/api/src/modules/security/source-administration-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "../integration/source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function context(): SecurityActorContext {
  const actor: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId: "r06.maker",
    email: "r06.maker@uat.nexora.invalid",
    displayName: "Authorization Admin / Maker",
    roles: [],
    permissions: [],
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor, correlationId: "user-management-performance" };
}

run("governed user management performance", () => {
  let pool: DatabasePool;
  let repository: SourceSecurityAdministrationRepository;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      `insert into security_user_account
        (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at,display_name)
       select 'r06-perf-user-' || value,$1,'r06-perf:' || value,
              'r06-perf-' || value || '@uat.nexora.invalid','active','disabled',now(),now(),
              'Performance User ' || lpad(value::text,4,'0')
         from generate_series(1,500) value
       on conflict (tenant_id,id) do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_password_credential
        (tenant_id,user_id,username,algorithm,iterations,salt,password_hash,updated_at)
       select $1,'r06-perf-user-' || value,'r06.perf.' || value,
              'pbkdf2_sha256',310000,decode(repeat('01',16),'hex'),decode(repeat('02',32),'hex'),now()
         from generate_series(1,500) value
       on conflict (tenant_id,user_id) do nothing`,
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       select $1,'r06-perf-access-' || value,'r06-perf-user-' || value,
              'nexora-r06-uat-company',true,'r06.last-admin-a',
              'governed_administration','performance-fixture'
         from generate_series(1,500) value
        where not exists (
          select 1 from security_user_company_access access
           where access.tenant_id=$1 and access.user_id='r06-perf-user-' || value
             and access.company_id='nexora-r06-uat-company' and access.revoked_at is null)
      `,
      [sourceTestTenantId],
    );
    repository = new SourceSecurityAdministrationRepository(pool, "d".repeat(32));
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("serves bounded list, search, and detail reads within the regression budget", async () => {
    const started = performance.now();
    for (let iteration = 0; iteration < 10; iteration += 1) {
      const page = await repository.listUsers(context(), { limit: 25 });
      expect(page.items).toHaveLength(25);
      expect(page.next_cursor).not.toBeNull();
    }
    const search = await repository.listUsers(context(), { search: "Performance User 0499", limit: 25 });
    expect(search.items).toHaveLength(1);
    const detail = await repository.getUser(context(), "r06-perf-user-499");
    expect(detail.username).toBe("r06.perf.499");
    expect(performance.now() - started).toBeLessThan(2_500);
  });
});
