import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  migrateExcelBankHierarchy,
  type ExcelBankHierarchyRequest,
} from "../../packages/db/src/maintenance/excel-bank-hierarchy.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { importChartTemplateRequestSchema } from "../../packages/contracts/src/finance/chart-templates.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";

const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = url ? describe : describe.skip;
const key = () => randomUUID();
const permissions = [
  "platform.approval.override",
  "finance.chart_template.read",
  "finance.chart_template.admin",
  "finance.nominal.read",
  "finance.nominal.create",
  "banking.bank_account.read",
  "banking.bank_account.create",
];
const actor: FinanceNominalActorContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.override-admin",
    displayName: "Synthetic maintenance operator",
    organizationName: "Synthetic",
    email: "maintenance@example.invalid",
    roles: ["super_administrator"],
    permissions,
    sessionVersion: 1,
  },
};
run("Excel Bank hierarchy maintenance boundary", () => {
  let pool: DatabasePool, templateId: string, sourceSha256: string;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.includes("chart_template_ct01"))
      throw new Error("Explicit isolated CT-01 database required.");
    pool = createDatabasePool(url);
    await ensureSourceSuperAdministratorFixture(pool);
    for (const permission of permissions.filter((permission) => permission.startsWith("finance.chart_template."))) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override',$2,'all') on conflict do nothing",
        [tenant, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override',$2,'tenant',$1) on conflict do nothing",
        [tenant, permission],
      );
    }
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','Synthetic USD',2,true,'active') on conflict do nothing",
      [tenant],
    );
    const manifest = importChartTemplateRequestSchema.parse(
      JSON.parse(
        await readFile(new URL("../../packages/db/catalogs/approved-chart-20261020.json", import.meta.url), "utf8"),
      ),
    );
    const repo = new SourceChartTemplateRepository(pool);
    const imported = await repo.import(actor, { ...manifest, revision: `maintenance-${key()}` }, key(), key());
    await repo.publish(actor, imported.template.id, { expected_version: 1 }, key(), key());
    templateId = imported.template.id;
    sourceSha256 = manifest.source_sha256;
  });
  afterAll(async () => {
    await pool?.end();
  });
  async function fixture() {
    const companyId = `maintenance-${key()}`,
      category = `category-${key()}`,
      sectionId = `section-${key()}`;
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic isolated company','active')",
      [tenant, companyId],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','synthetic-maintenance')",
      [tenant, key(), companyId],
    );
    for (const permission of permissions.filter((item) => !item.startsWith("finance.chart_template."))) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override',$2,'all') on conflict do nothing",
        [tenant, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override',$2,'company',$3) on conflict do nothing",
        [tenant, permission, companyId],
      );
    }
    await pool.query(
      "insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,'LEGACY-CA','Current Assets','asset',null,true,'active',false,now()),($1,$2,$4,'LEGACY-CB','Cash & Bank','asset',$3,true,'active',false,now())",
      [tenant, companyId, category, sectionId],
    );
    await pool.query(
      "insert into finance_nominal_section_policy(tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value) values($1,$2,$3,$4,'cash_and_bank','LEGACY-',6,1,999999,1)",
      [tenant, companyId, category, sectionId],
    );
    return {
      request: {
        tenantId: tenant,
        companyId,
        templateId,
        actorId: "r06.override-admin",
        sectionId,
        expectedSectionCode: "LEGACY-CB",
        expectedPolicyVersion: 1,
        sourceSha256,
      } satisfies ExcelBankHierarchyRequest,
      category,
    };
  }
  const guards = async () =>
    (
      await pool.query(
        "select proname,pg_get_functiondef(oid) as definition from pg_proc where oid=any(array['finance_guard_account()'::regprocedure,'enforce_finance_nominal_policy()'::regprocedure]) order by proname",
      )
    ).rows;
  it("migrates only the section and allocator, preserves Bank identities/history, restores exact guards and replays", async () => {
    const { request, category } = await fixture();
    const bankRepo = new SourceFinanceNominalRepository(pool);
    const bank = await bankRepo.create(
      actor,
      {
        company_id: request.companyId,
        category_id: category,
        section_id: request.sectionId,
        name: `Synthetic existing bank ${key()}`,
        currency: "USD",
      },
      key(),
      key(),
    );
    request.expectedPolicyVersion = 2;
    const beforeGuards = await guards();
    const beforeBank = (
      await pool.query("select to_jsonb(b) as bank from bank_account b where tenant_id=$1 and account_id=$2", [
        tenant,
        bank.id,
      ])
    ).rows;
    const beforeEvents = (
      await pool.query(
        "select to_jsonb(e) as event from finance_nominal_event e where tenant_id=$1 and nominal_id=$2 order by resulting_version",
        [tenant, bank.id],
      )
    ).rows;
    const result = await migrateExcelBankHierarchy(pool, request);
    expect(result.replayed).toBe(false);
    expect(await guards()).toEqual(beforeGuards);
    expect(
      (
        await pool.query("select id,code,name,parent_id from account where tenant_id=$1 and id=$2", [
          tenant,
          request.sectionId,
        ])
      ).rows[0],
    ).toEqual({ id: request.sectionId, code: "2309", name: "Cash and Bank", parent_id: category });
    expect(
      (await pool.query("select code,parent_id from account where tenant_id=$1 and id=$2", [tenant, bank.id])).rows[0],
    ).toEqual({ code: bank.code, parent_id: request.sectionId });
    expect(
      (
        await pool.query("select to_jsonb(b) as bank from bank_account b where tenant_id=$1 and account_id=$2", [
          tenant,
          bank.id,
        ])
      ).rows,
    ).toEqual(beforeBank);
    expect(
      (
        await pool.query(
          "select to_jsonb(e) as event from finance_nominal_event e where tenant_id=$1 and nominal_id=$2 order by resulting_version",
          [tenant, bank.id],
        )
      ).rows,
    ).toEqual(beforeEvents);
    expect(await migrateExcelBankHierarchy(pool, request)).toEqual({ ...result, replayed: true });
    const preview = await new SourceChartTemplateRepository(pool).companyPreview(actor, request.templateId, {
      company_id: request.companyId,
      currency: "USD",
      limit: 100,
    });
    expect(preview).toMatchObject({
      blocked: false,
      totals: {
        categories_to_create: 13,
        sections_to_create: 77,
        nominal_drafts_to_create: 227,
        exact_matches: 2,
        conflicts: 0,
        bank_references: 7,
      },
    });
    await expect(migrateExcelBankHierarchy(pool, { ...request, expectedPolicyVersion: 3 })).rejects.toThrow(
      "replay conflicts",
    );
    await expect(
      pool.query("update account set code='UNAUTHORIZED' where tenant_id=$1 and id=$2", [tenant, request.sectionId]),
    ).rejects.toThrow("immutable");
    await expect(
      pool.query(
        "update finance_nominal_section_policy set prefix='UNAUTHORIZED',row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and section_id=$2",
        [tenant, request.sectionId],
      ),
    ).rejects.toThrow("protected");
    const next = await bankRepo.create(
      actor,
      {
        company_id: request.companyId,
        category_id: category,
        section_id: request.sectionId,
        name: `Synthetic new bank ${key()}`,
        currency: "USD",
      },
      key(),
      key(),
    );
    expect(next.code).toBe("230908");
    await expect(
      pool.query("delete from finance_chart_hierarchy_maintenance where tenant_id=$1 and id=$2", [tenant, result.id]),
    ).rejects.toThrow();
  });
  it("rejects stale version, missing authority, another company and wrong source without changing guards", async () => {
    const { request } = await fixture();
    const before = await guards();
    await expect(migrateExcelBankHierarchy(pool, { ...request, expectedPolicyVersion: 99 })).rejects.toThrow(
      "precondition",
    );
    await expect(migrateExcelBankHierarchy(pool, { ...request, actorId: "r06.restricted" })).rejects.toThrow(
      "company access",
    );
    await expect(migrateExcelBankHierarchy(pool, { ...request, companyId: "absent-company" })).rejects.toThrow(
      "company access",
    );
    await expect(migrateExcelBankHierarchy(pool, { ...request, sourceSha256: "0".repeat(64) })).rejects.toThrow(
      "published Excel",
    );
    expect(await guards()).toEqual(before);
  });
  it("serializes concurrent requests and records one maintenance event", async () => {
    const { request } = await fixture();
    const results = await Promise.all([
      migrateExcelBankHierarchy(pool, request),
      migrateExcelBankHierarchy(pool, request),
    ]);
    expect(results.map((result) => result.replayed).sort()).toEqual([false, true]);
    expect(results[0]!.id).toBe(results[1]!.id);
    expect(
      (
        await pool.query(
          "select count(*)::int as count from finance_chart_hierarchy_maintenance where tenant_id=$1 and company_id=$2",
          [tenant, request.companyId],
        )
      ).rows[0].count,
    ).toBe(1);
  });
  it("rejects target collisions and exhausted code ranges atomically", async () => {
    for (const code of ["2309", "230901", "230999"]) {
      const { request } = await fixture();
      await pool.query(
        "insert into account(tenant_id,company_id,id,code,name,type,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,$4,'Synthetic occupied code','asset',false,'active',true,now())",
        [tenant, request.companyId, key(), code],
      );
      await expect(migrateExcelBankHierarchy(pool, request)).rejects.toThrow(
        code === "230999" ? "exhausted" : "occupied",
      );
      expect(
        (await pool.query("select code from account where tenant_id=$1 and id=$2", [tenant, request.sectionId])).rows[0]
          .code,
      ).toBe("LEGACY-CB");
    }
  });
  it("rolls back temporary DDL and data if immutable evidence cannot be written", async () => {
    const { request } = await fixture();
    const before = await guards();
    // Test-only fault injection: a trigger scoped to the isolated synthetic section.
    const triggerName = `maintenance_fault_${key().replaceAll("-", "")}`;
    await pool.query(
      `create function ${triggerName}() returns trigger language plpgsql as $$ begin if NEW.section_id='${request.sectionId}' then raise exception 'Synthetic evidence failure'; end if; return NEW; end $$; create trigger ${triggerName} before insert on finance_chart_hierarchy_maintenance for each row execute function ${triggerName}()`,
    );
    try {
      await expect(migrateExcelBankHierarchy(pool, request)).rejects.toThrow("Synthetic evidence failure");
    } finally {
      await pool.query(
        `drop trigger ${triggerName} on finance_chart_hierarchy_maintenance; drop function ${triggerName}()`,
      );
    }
    expect(await guards()).toEqual(before);
    expect(
      (await pool.query("select code from account where tenant_id=$1 and id=$2", [tenant, request.sectionId])).rows[0]
        .code,
    ).toBe("LEGACY-CB");
  });
  it("denies a non-administrator database connection even with supplied actor identity", async () => {
    const { request } = await fixture();
    const connection = await pool.connect();
    // A one-connection facade keeps SET ROLE on the same physical connection.
    const restrictedPool = {
      connect: async () => ({ query: connection.query.bind(connection), release: () => undefined }),
    } as unknown as DatabasePool;
    const role = `chart_maintenance_reader_${key().replaceAll("-", "")}`;
    await connection.query(`create role ${role} nologin; set role ${role}`);
    try {
      await expect(migrateExcelBankHierarchy(restrictedPool, request)).rejects.toThrow("maintenance administrator");
    } finally {
      await connection.query(`reset role; drop role ${role}`);
      connection.release();
    }
  });
});
