import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { importChartTemplateRequestSchema } from "../../packages/contracts/src/finance/chart-templates.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import type { FinanceNominalActorContext } from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const permissions = ["finance.chart_template.read", "finance.chart_template.admin", "platform.approval.override"];
const maker: FinanceNominalActorContext = {
  tenantId: sourceTestTenantId,
  actor: {
    tenantId: sourceTestTenantId,
    userId: "r06.override-admin",
    displayName: "Synthetic template owner",
    email: "template@example.invalid",
    organizationName: "Synthetic ERP",
    roles: ["super_administrator"],
    permissions,
    sessionVersion: 1,
  },
};
const key = () => randomUUID();
run("Central Chart template PostgreSQL authority", () => {
  let pool: DatabasePool, repo: SourceChartTemplateRepository;
  let manifest: ReturnType<typeof importChartTemplateRequestSchema.parse>;
  let id: string;
  beforeAll(async () => {
    // Refuse accidental use of the running application database for mutating tests.
    if (!databaseUrl || !new URL(databaseUrl).pathname.includes("chart_template_ct01"))
      throw new Error("An explicitly isolated CT-01 database is required.");
    pool = createDatabasePool(databaseUrl);
    await ensureSourceSuperAdministratorFixture(pool);
    repo = new SourceChartTemplateRepository(pool);
    for (const permission of permissions) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override',$2,'all') on conflict do nothing",
        [sourceTestTenantId, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override',$2,'tenant',$1) on conflict do nothing",
        [sourceTestTenantId, permission],
      );
    }
    manifest = importChartTemplateRequestSchema.parse(
      JSON.parse(
        await readFile(new URL("../../packages/db/catalogs/approved-chart-20261020.json", import.meta.url), "utf8"),
      ),
    );
    manifest = { ...manifest, revision: `isolated-${key()}` };
  });
  afterAll(async () => {
    await pool?.end();
  });
  it("previews an accessible company consistently without changing accounts and reports protected Bank conflicts", async () => {
    // Automated fixtures stay isolated; no company is created in the manual-test DB.
    const company = `preview-company-${key()}`,
      category = `preview-category-${key()}`,
      section = `preview-section-${key()}`;
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic preview company','active')",
      [sourceTestTenantId, company],
    );
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','Synthetic USD',2,true,'active') on conflict do nothing",
      [sourceTestTenantId],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','synthetic-template-preview')",
      [sourceTestTenantId, key(), company],
    );
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override','finance.nominal.read','all') on conflict do nothing",
      [sourceTestTenantId],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override','finance.nominal.read','company',$2) on conflict do nothing",
      [sourceTestTenantId, company],
    );
    await pool.query(
      "insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,'LEGACY-CA','Current Assets','asset',null,true,'active',false,now()),($1,$2,$4,'LEGACY-CB','Cash and Bank','asset',$3,true,'active',false,now())",
      [sourceTestTenantId, company, category, section],
    );
    await pool.query(
      "insert into finance_nominal_section_policy(tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value) values($1,$2,$3,$4,'cash_and_bank','LEGACY-',6,1,999999,1)",
      [sourceTestTenantId, company, category, section],
    );
    const actor = {
      ...maker,
      actor: { ...maker.actor, permissions: [...maker.actor.permissions, "finance.nominal.read"] },
    };
    const imported = await repo.import(maker, { ...manifest, revision: `preview-${key()}` }, key(), key());
    await repo.publish(maker, imported.template.id, { expected_version: 1 }, key(), key());
    const counts = async () =>
      (
        await pool.query(
          "select (select count(*) from account) as accounts,(select count(*) from bank_account) as banks,(select count(*) from journal_entry) as journals",
        )
      ).rows[0];
    const before = await counts();
    const result = await repo.companyPreview(actor, imported.template.id, {
      company_id: company,
      currency: "USD",
      limit: 100,
    });
    expect(result).toMatchObject({
      blocked: true,
      totals: {
        categories_to_create: 14,
        sections_to_create: 77,
        nominal_drafts_to_create: 227,
        conflicts: 1,
        bank_references: 7,
      },
    });
    expect(result.blocking_issues).toMatchObject([{ code: "2309", message: expect.stringContaining("LEGACY-CB") }]);
    const next = await repo.companyPreview(actor, imported.template.id, {
      company_id: company,
      currency: "USD",
      limit: 100,
      cursor: result.next_cursor!,
    });
    expect(next.preview_sha256).toBe(result.preview_sha256);
    expect(await counts()).toEqual(before);
    await expect(
      repo.companyPreview(actor, imported.template.id, { company_id: "outside", currency: "USD", limit: 50 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.companyPreview(actor, imported.template.id, { company_id: company, currency: "ZZZ", limit: 50 }),
    ).rejects.toMatchObject({ code: "TEMPLATE_CURRENCY_INVALID" });
    await expect(
      repo.companyPreview(maker, imported.template.id, { company_id: company, currency: "USD", limit: 50 }),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.companyPreview(actor, imported.template.id, { company_id: company, currency: "USD", limit: 101 }),
    ).rejects.toThrow();
  });
  it("persists the approved 14/78/234 catalog atomically with provenance and no company/account changes", async () => {
    const counts = async () =>
      (
        await pool.query(
          "select (select count(*) from organization_unit) as companies,(select count(*) from account) as accounts,(select count(*) from bank_account) as banks,(select count(*) from journal_entry) as journals",
        )
      ).rows[0];
    const before = await counts(),
      requestKey = key();
    const result = await repo.import(maker, manifest, requestKey, key());
    id = result.template.id;
    expect(result.template).toMatchObject({
      category_count: 14,
      section_count: 78,
      nominal_count: 234,
      state: "draft",
      version: 1,
    });
    expect(await counts()).toEqual(before);
    expect(
      (
        await pool.query(
          "select sum(jsonb_array_length(source_rows)) as occurrences from finance_chart_template_node where tenant_id=$1 and template_id=$2",
          [sourceTestTenantId, id],
        )
      ).rows[0].occurrences,
    ).toBe("237");
    expect(await repo.import(maker, manifest, requestKey, key())).toMatchObject({ ...result, replayed: true });
    await expect(repo.import(maker, { ...manifest, name: "Changed payload" }, requestKey, key())).rejects.toMatchObject(
      { code: "IDEMPOTENCY_CONFLICT" },
    );
  });
  it("rejects a colliding revision and leaves no partial nodes or audit events", async () => {
    const before = (
      await pool.query(
        "select (select count(*) from finance_chart_template) as revisions,(select count(*) from finance_chart_template_node) as nodes,(select count(*) from finance_chart_template_event) as events",
      )
    ).rows;
    await expect(repo.import(maker, manifest, key(), key())).rejects.toMatchObject({
      code: "TEMPLATE_REVISION_CONFLICT",
    });
    expect(
      (
        await pool.query(
          "select (select count(*) from finance_chart_template) as revisions,(select count(*) from finance_chart_template_node) as nodes,(select count(*) from finance_chart_template_event) as events",
        )
      ).rows,
    ).toEqual(before);
  });
  it("reads all nominal pages and performs parent/code/name search using persisted definitions", async () => {
    let cursor: string | undefined,
      count = 0;
    do {
      const page = await repo.nodes(maker, id, { kind: "nominal", limit: 100, ...(cursor ? { cursor } : {}) });
      count += page.items.length;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
    expect(count).toBe(234);
    expect((await repo.nodes(maker, id, { kind: "nominal", search: "711314", limit: 100 })).items).toMatchObject([
      { code: "711314", name: "Google Play", source_rows: [{ source: "Screenshot 2" }, { source: "Screenshot 3" }] },
    ]);
    expect(
      (await repo.nodes(maker, id, { kind: "section", parent_key: "category:current-assets", limit: 100 })).items,
    ).toHaveLength(9);
    expect(
      (await repo.nodes(maker, id, { kind: "nominal", category_key: "category:current-assets", limit: 100 })).items,
    ).toHaveLength(24);
    expect(
      (await repo.nodes(maker, id, { kind: "nominal", category_key: "category:income", search: "711314", limit: 100 }))
        .items,
    ).toHaveLength(0);
    expect(
      (
        await repo.nodes(maker, id, {
          kind: "nominal",
          category_key: "category:expenses",
          search: "711314",
          limit: 100,
        })
      ).items,
    ).toMatchObject([{ code: "711314" }]);
    const reopenedPool = createDatabasePool(databaseUrl!);
    try {
      const reopened = new SourceChartTemplateRepository(reopenedPool);
      expect((await reopened.get(maker, id)).source_sha256).toBe(manifest.source_sha256);
    } finally {
      await reopenedPool.end();
    }
  });
  it("rejects company-only nominal permissions and forged tenant context", async () => {
    const ordinary = {
      ...maker,
      actor: { ...maker.actor, permissions: ["finance.nominal.create", "finance.nominal.read"] },
    };
    await expect(repo.import(ordinary, manifest, key(), key())).rejects.toMatchObject({ status: 403 });
    await expect(repo.get({ ...maker, tenantId: "outside" }, id)).rejects.toMatchObject({ status: 403 });
    await expect(repo.get({ ...maker, actor: { ...maker.actor, userId: "r06.restricted" } }, id)).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      repo.import({ ...maker, realActorId: "other", impersonationRequestId: "impersonation" }, manifest, key(), key()),
    ).rejects.toMatchObject({ code: "COA_SUPER_ADMIN_REQUIRED" });
  });
  it("requires a tenant-scoped live role grant even if the session claims permission", async () => {
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override' and permission_key='finance.chart_template.admin' and scope_kind='tenant'",
      [sourceTestTenantId],
    );
    try {
      await expect(repo.import(maker, { ...manifest, revision: key() }, key(), key())).rejects.toMatchObject({
        status: 403,
      });
    } finally {
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override','finance.chart_template.admin','tenant',$1)",
        [sourceTestTenantId],
      );
    }
  });
  it("publishes with expected version, persists audit evidence and replays safely", async () => {
    await expect(repo.publish(maker, id, { expected_version: 2 }, key(), key())).rejects.toMatchObject({
      code: "TEMPLATE_VERSION_CONFLICT",
    });
    const requestKey = key(),
      published = await repo.publish(maker, id, { expected_version: 1 }, requestKey, key());
    expect(published.template).toMatchObject({ state: "published", version: 2 });
    expect(await repo.publish(maker, id, { expected_version: 1 }, requestKey, key())).toMatchObject({
      ...published,
      replayed: true,
    });
    await expect(repo.publish(maker, id, { expected_version: 1 }, key(), key())).rejects.toMatchObject({
      code: "TEMPLATE_VERSION_CONFLICT",
    });
    expect(
      (
        await pool.query(
          "select action from finance_chart_template_event where tenant_id=$1 and template_id=$2 order by occurred_at",
          [sourceTestTenantId, id],
        )
      ).rows.map((row) => row.action),
    ).toEqual(["imported", "published"]);
  });
  it("blocks raw SQL mutation/deletion and extending a published revision", async () => {
    for (const sql of [
      "update finance_chart_template set name='tampered' where tenant_id=$1 and id=$2",
      "delete from finance_chart_template where tenant_id=$1 and id=$2",
      "update finance_chart_template_node set name='tampered' where tenant_id=$1 and template_id=$2",
      "insert into finance_chart_template_node(tenant_id,template_id,node_key,kind,code,name,parent_key,account_type) values($1,$2,'late','nominal','late','Late','section:7101','expense')",
    ])
      await expect(pool.query(sql, [sourceTestTenantId, id])).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query("delete from finance_chart_template_event where tenant_id=$1 and template_id=$2", [
        sourceTestTenantId,
        id,
      ]),
    ).rejects.toMatchObject({ code: "P0001" });
  });
  it("enforces RLS for a non-owner and rejects incomplete raw revisions", async () => {
    const client = await pool.connect(),
      role = `ct01_${randomUUID().replaceAll("-", "")}`;
    try {
      await client.query("begin");
      await client.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(
        `grant select on finance_chart_template,finance_chart_template_node,finance_chart_template_event to ${role}`,
      );
      await client.query(`grant insert on finance_chart_template to ${role}`);
      await client.query(`set local role ${role}`);
      await client.query("select set_config('nexora.tenant_id','outside',true)");
      for (const table of ["finance_chart_template", "finance_chart_template_node", "finance_chart_template_event"])
        expect((await client.query(`select count(*) from ${table}`)).rows[0].count).toBe("0");
      await client.query("savepoint cross_tenant_write");
      await expect(
        client.query(
          "insert into finance_chart_template(tenant_id,id,catalog_key,name,revision,source_filename,source_sha256,content_sha256,category_count,section_count,nominal_count,created_by) values($1,$2,$2,'Outside write','v1','x.xlsx',$3,$3,1,1,1,'r06.override-admin')",
          [sourceTestTenantId, key(), "a".repeat(64)],
        ),
      ).rejects.toMatchObject({ code: "42501" });
      await client.query("rollback to savepoint cross_tenant_write");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      expect(
        Number((await client.query("select count(*) from finance_chart_template_node")).rows[0].count),
      ).toBeGreaterThanOrEqual(326);
    } finally {
      await client.query("rollback");
      client.release();
    }
    const invalid = await pool.connect();
    try {
      await invalid.query("begin");
      await invalid.query(
        "insert into finance_chart_template(tenant_id,id,catalog_key,name,revision,source_filename,source_sha256,content_sha256,category_count,section_count,nominal_count,created_by) values($1,$2,$2,'Incomplete','v1','x.xlsx',$3,$3,1,1,1,'r06.override-admin')",
        [sourceTestTenantId, key(), "a".repeat(64)],
      );
      await expect(invalid.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
    } finally {
      await invalid.query("rollback");
      invalid.release();
    }
  });
});
