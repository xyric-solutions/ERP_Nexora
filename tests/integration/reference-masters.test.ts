import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import request from "supertest";
import { createApp } from "../../server/api/src/app.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import {
  SourceReferenceMasterRepository,
  type ReferenceMasterContext,
} from "../../server/api/src/modules/master-data/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const key = () => randomUUID();
const permissions = [
  "master_data.project.read",
  "master_data.project.manage",
  "master_data.location.read",
  "master_data.location.manage",
];
const actor: ReferenceMasterContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.maker",
    organizationName: "Synthetic",
    displayName: "Synthetic reference maker",
    email: "master@example.invalid",
    roles: ["banking_test"],
    permissions,
    sessionVersion: 1,
  },
};
run("Company reporting reference masters", () => {
  let pool: DatabasePool, repo: SourceReferenceMasterRepository;
  const company = `reference-${key()}`,
    other = `reference-${key()}`;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.includes("chart_template_ct01"))
      throw new Error("Explicit isolated reference test database required");
    pool = createDatabasePool(url);
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    repo = new SourceReferenceMasterRepository(pool);
    for (const id of [company, other]) {
      await pool.query(
        "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic reference company','active')",
        [tenant, id],
      );
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','synthetic-reference')",
        [tenant, key(), id],
      );
      for (const permission of permissions) {
        await pool.query(
          "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-maker',$2,'all') on conflict do nothing",
          [tenant, permission],
        );
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
          [tenant, permission, id],
        );
      }
    }
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("creates distinct project/location identities, persists reloads and audits each version", async () => {
    for (const kind of ["projects", "locations"] as const) {
      const first = await repo.create(
        actor,
        kind,
        { company_id: company, code: "REPORTING", name: "Synthetic reporting reference" },
        key(),
        key(),
      );
      expect(first.record).toMatchObject({ company_id: company, version: 1, status: "active" });
      expect(await repo.get(actor, kind, company, first.record.id)).toEqual(first.record);
      const updated = await repo.update(
        actor,
        kind,
        first.record.id,
        { company_id: company, expected_version: 1, name: "Updated synthetic reference" },
        key(),
        key(),
      );
      const inactive = await repo.status(
        actor,
        kind,
        first.record.id,
        { company_id: company, expected_version: 2, status: "inactive" },
        key(),
        key(),
      );
      expect(updated.record.version).toBe(2);
      expect(inactive.record).toMatchObject({ version: 3, status: "inactive", code: "REPORTING" });
      const events = await pool.query(
        "select record_version from erp_reference_master_event where tenant_id=$1 and coalesce(project_id,location_id)=$2 order by record_version",
        [tenant, first.record.id],
      );
      expect(events.rows.map((row) => Number(row.record_version))).toEqual([1, 2, 3]);
    }
  });
  it("replays create/update idempotently, rejects changed payloads and stale versions", async () => {
    const input = { company_id: company, code: `RETRY-${key()}`, name: "Synthetic retry" },
      retry = key();
    const result = await repo.create(actor, "projects", input, retry, key());
    expect(await repo.create(actor, "projects", input, retry, key())).toEqual(result);
    await expect(repo.create(actor, "projects", { ...input, name: "Different" }, retry, key())).rejects.toMatchObject({
      code: "IDEMPOTENCY_CONFLICT",
    });
    const edit = { company_id: company, expected_version: 1, name: "Edited retry" },
      updateKey = key();
    const updated = await repo.update(actor, "projects", result.record.id, edit, updateKey, key());
    expect(await repo.update(actor, "projects", result.record.id, edit, updateKey, key())).toEqual(updated);
    await expect(repo.update(actor, "projects", result.record.id, edit, key(), key())).rejects.toMatchObject({
      code: "MASTER_VERSION_CONFLICT",
    });
  });
  it("enforces case-insensitive company codes without deduplicating names or mixing companies", async () => {
    const code = `CASE-${key()}`,
      name = "Same display name";
    const result = await repo.create(actor, "projects", { company_id: company, code, name }, key(), key());
    await expect(
      repo.create(actor, "projects", { company_id: company, code: code.toLowerCase(), name }, key(), key()),
    ).rejects.toMatchObject({ code: "MASTER_CODE_CONFLICT" });
    await repo.create(actor, "projects", { company_id: other, code, name }, key(), key());
    await repo.create(actor, "projects", { company_id: company, code: `${code}-2`, name }, key(), key());
    await expect(repo.get(actor, "projects", other, result.record.id)).rejects.toMatchObject({ status: 404 });
  });
  it("paginates bounded filtered results with company/filter-bound cursors and escaped search", async () => {
    for (const code of ["PAGE-A", "PAGE-B", "PAGE-C"])
      await repo.create(actor, "locations", { company_id: company, code, name: "Synthetic page" }, key(), key());
    const query = { company_id: company, search: "PAGE-", limit: 2 };
    const page = await repo.list(actor, "locations", query);
    expect(page.items.map((item) => item.code)).toEqual(["PAGE-A", "PAGE-B"]);
    expect(
      (await repo.list(actor, "locations", { ...query, cursor: page.next_cursor! })).items.map((item) => item.code),
    ).toEqual(["PAGE-C"]);
    await expect(
      repo.list(actor, "locations", { ...query, company_id: other, cursor: page.next_cursor! }),
    ).rejects.toMatchObject({ code: "INVALID_CURSOR" });
    expect((await repo.list(actor, "locations", { ...query, search: "%" })).items).toEqual([]);
    expect((await repo.companies(actor, "locations")).items.map((item) => item.id)).toEqual(
      expect.arrayContaining([company, other]),
    );
  });
  it("requires live company grants, denies impersonated writes and revalidates idempotent replays", async () => {
    const permission = "master_data.project.manage",
      input = { company_id: company, code: `REVOKE-${key()}`, name: "Synthetic authority" },
      retry = key();
    await repo.create(actor, "projects", input, retry, key());
    await expect(
      repo.create(
        { ...actor, impersonationRequestId: "synthetic" },
        "projects",
        { ...input, code: key() },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ code: "IMPERSONATION_RESTRICTED" });
    await expect(repo.list(actor, "projects", { company_id: "outside", limit: 5 })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      repo.list({ ...actor, actor: { ...actor.actor, tenantId: "outside" } }, "projects", {
        company_id: company,
        limit: 5,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key=$2 and scope_kind='company' and scope_value=$3",
      [tenant, permission, company],
    );
    try {
      await expect(repo.create(actor, "projects", input, retry, key())).rejects.toMatchObject({ status: 403 });
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3)",
        [tenant, permission, company],
      );
    }
  });
  it("enforces separate explicit Project/Location read and manage permissions", async () => {
    for (const kind of ["projects", "locations"] as const) {
      const resource = kind === "projects" ? "project" : "location";
      const reader = { ...actor, actor: { ...actor.actor, permissions: [`master_data.${resource}.read`] } };
      await expect(repo.list(reader, kind, { company_id: company, limit: 5 })).resolves.toHaveProperty("items");
      await expect(
        repo.create(
          reader,
          kind,
          { company_id: company, code: key(), name: "Unauthorized synthetic write" },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
      const otherResource = resource === "project" ? "location" : "project";
      const wrong = {
        ...actor,
        actor: {
          ...actor.actor,
          permissions: [`master_data.${otherResource}.read`, `master_data.${otherResource}.manage`],
        },
      };
      await expect(repo.list(wrong, kind, { company_id: company, limit: 5 })).rejects.toMatchObject({ status: 403 });
      await expect(
        repo.create(
          wrong,
          kind,
          { company_id: company, code: key(), name: "Wrong resource synthetic write" },
          key(),
          key(),
        ),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
  it("enforces real PostgreSQL-backed read/manage permissions through HTTP, not just hidden UI controls", async () => {
    for (const kind of ["projects", "locations"] as const) {
      const resource = kind === "projects" ? "project" : "location";
      const authentication = {
        loadAuthenticatedAccount: async () => ({ ...actor.actor, permissions: [`master_data.${resource}.read`] }),
      } as unknown as TenantAuthApiService;
      const session = {
        tenantId: tenant,
        userId: actor.actor.userId,
        sessionId: "synthetic-master",
        csrfToken: "synthetic-csrf",
        idleExpiresAt: new Date(),
        absoluteExpiresAt: new Date(),
      };
      const sessions = {
        get: async () => session,
        authorizeMutation: async () => ({ status: "ok", session }),
      } as unknown as TenantSessionApiService;
      const app = createApp({
        config: { allowedOrigins: new Set(["https://erp.example.test"]) },
        logger: createLogger(new PassThrough()),
        metrics: createMetrics(),
        readiness: {},
        authService: authentication,
        sessionService: sessions,
        referenceMasterRepository: repo,
      });
      expect(
        (
          await request(app)
            .get(`/api/v1/master_data/${kind}?company_id=${company}`)
            .set("cookie", "nexora_session=synthetic")
        ).status,
      ).toBe(200);
      const denied = await request(app)
        .post(`/api/v1/master_data/${kind}`)
        .set("cookie", "nexora_session=synthetic")
        .set("origin", "https://erp.example.test")
        .set("x-csrf-token", session.csrfToken)
        .set("idempotency-key", key())
        .send({ company_id: company, code: key(), name: "Forbidden read-only creation" });
      expect(denied.status).toBe(403);
      expect(denied.body.code).toBe("PERMISSION_DENIED");
    }
  });
  it("serializes master management against governed Identity permission revocation", async () => {
    for (const kind of ["projects", "locations"] as const) {
      const permission = `master_data.${kind === "projects" ? "project" : "location"}.manage`;
      const blocker = await pool.connect();
      let mutation: Promise<unknown> | undefined;
      try {
        await blocker.query("begin");
        await blocker.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
          `nexora:security:admin:${tenant}`,
        ]);
        mutation = repo
          .create(
            actor,
            kind,
            { company_id: company, code: key(), name: "Synthetic concurrent authority" },
            key(),
            key(),
          )
          .catch((error: unknown) => error);
        await expect
          .poll(
            async () =>
              (
                await pool.query<{ waiting: boolean }>(
                  "select exists(select 1 from pg_stat_activity where $1=any(pg_blocking_pids(pid))) waiting",
                  [blocker.processID],
                )
              ).rows[0]?.waiting,
          )
          .toBe(true);
        await blocker.query(
          "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-maker' and permission_key=$2 and scope_kind='company' and scope_value=$3",
          [tenant, permission, company],
        );
        await blocker.query("commit");
        expect(await mutation).toMatchObject({ status: 403 });
      } finally {
        await blocker.query("rollback");
        blocker.release();
        await mutation;
        await pool.query(
          "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-maker',$2,'company',$3) on conflict do nothing",
          [tenant, permission, company],
        );
      }
    }
  });
  it("rolls back unaudited writes and rejects identity/history mutation", async () => {
    const created = await repo.create(
      actor,
      "locations",
      { company_id: company, code: `GUARD-${key()}`, name: "Synthetic guard" },
      key(),
      key(),
    );
    const client = await pool.connect();
    try {
      for (const sql of [
        "update erp_location set code='CHANGED',row_version=row_version+1 where tenant_id=$1 and id=$2",
        "delete from erp_location where tenant_id=$1 and id=$2",
        "update erp_reference_master_event set result='{}' where tenant_id=$1 and location_id=$2",
      ]) {
        await client.query("begin");
        await expect(client.query(sql, [tenant, created.record.id])).rejects.toThrow();
        await client.query("rollback");
      }
      await client.query("begin");
      await client.query(
        "update erp_location set name='Unaudited',row_version=row_version+1 where tenant_id=$1 and id=$2",
        [tenant, created.record.id],
      );
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback");
      expect((await repo.get(actor, "locations", company, created.record.id)).name).toBe("Synthetic guard");
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("enforces tenant RLS on both masters and events for a non-owner role", async () => {
    const created = await repo.create(
      actor,
      "projects",
      { company_id: company, code: `RLS-${key()}`, name: "Synthetic RLS" },
      key(),
      key(),
    );
    const client = await pool.connect(),
      role = `reference_rls_${key().replaceAll("-", "")}`;
    try {
      await client.query("begin");
      await client.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(`grant select on erp_project,erp_location,erp_reference_master_event to ${role}`);
      await client.query(`set local role ${role}`);
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      expect((await client.query("select id from erp_project where id=$1", [created.record.id])).rows).toHaveLength(1);
      await client.query("select set_config('nexora.tenant_id','outside',true)");
      for (const table of ["erp_project", "erp_location", "erp_reference_master_event"])
        expect((await client.query(`select id from ${table} where tenant_id=$1`, [tenant])).rows).toHaveLength(0);
    } finally {
      await client.query("rollback");
      client.release();
    }
  });
  it("serializes duplicate retries and concurrent code creation without partial evidence", async () => {
    const input = { company_id: company, code: `CONCURRENT-${key()}`, name: "Synthetic concurrency" },
      retry = key();
    const replay = await Promise.all([
      repo.create(actor, "projects", input, retry, key()),
      repo.create(actor, "projects", input, retry, key()),
    ]);
    expect(replay[0]).toEqual(replay[1]);
    const second = { ...input, code: `${input.code}-2` };
    const raced = await Promise.allSettled([
      repo.create(actor, "projects", second, key(), key()),
      repo.create(actor, "projects", second, key(), key()),
    ]);
    expect(raced.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(raced.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
  it("rolls back the record when its required audit write fails", async () => {
    const code = `ROLLBACK-${key()}`;
    await expect(
      repo.create(actor, "locations", { company_id: company, code, name: "Synthetic rollback" }, key(), ""),
    ).rejects.toMatchObject({ code: "MASTER_INTEGRITY_CONFLICT" });
    expect(
      (
        await pool.query("select id from erp_location where tenant_id=$1 and company_id=$2 and code=$3", [
          tenant,
          company,
          code,
        ])
      ).rows,
    ).toEqual([]);
  });
  it("rejects standalone fabricated history even when the original audit exists", async () => {
    const created = await repo.create(
      actor,
      "locations",
      { company_id: company, code: `HISTORY-${key()}`, name: "Synthetic evidence" },
      key(),
      key(),
    );
    await expect(
      pool.query(
        `insert into erp_reference_master_event(tenant_id,company_id,id,kind,location_id,record_version,action,actor_id,audit_event_id,idempotency_key,request_sha256,result)
      values($1,$2,$3,'locations',$4,2,'updated','r06.maker',$5,$6,$7,$8)`,
        [
          tenant,
          company,
          key(),
          created.record.id,
          created.audit_event_id,
          key(),
          "a".repeat(64),
          JSON.stringify(created),
        ],
      ),
    ).rejects.toMatchObject({ code: "23514" });
  });
  it("migrates an empty isolated database in dependency order and replays without changes", async () => {
    const database = `reference_fresh_${key().replaceAll("-", "")}`;
    const freshUrl = new URL(url!);
    freshUrl.pathname = `/${database}`;
    await pool.query(`create database ${database}`);
    const fresh = createDatabasePool(freshUrl.toString());
    try {
      expect(await migrateSourceSchema(fresh)).toContain("master_data");
      expect(await migrateSourceSchema(fresh)).toEqual([]);
      expect(
        (
          await fresh.query(
            "select version from nexora_schema_migration where module_name='master_data' order by version",
          )
        ).rows,
      ).toEqual([{ version: 1 }, { version: 2 }]);
    } finally {
      await fresh.end();
      // Only the uniquely named empty test database created immediately above.
      await pool.query(`drop database ${database}`);
    }
  });
});
