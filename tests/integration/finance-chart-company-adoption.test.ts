import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { SourceChartTemplateRepository } from "../../server/api/src/modules/finance/templates/source-repository.js";
import {
  SourceFinanceNominalRepository,
  type FinanceNominalActorContext,
} from "../../server/api/src/modules/finance/nominals/source-repository.js";
import { importChartTemplateRequestSchema } from "../../packages/contracts/src/finance/chart-templates.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip,
  key = () => randomUUID();
const permissions = [
  "platform.approval.override",
  "finance.nominal.status",
  "finance.chart_template.read",
  "finance.chart_template.admin",
  "finance.chart_template.adopt",
  "finance.chart_template.classify",
  "finance.nominal.read",
  "finance.nominal.create",
  "finance.nominal.update",
  "finance.nominal.submit",
  "banking.payment.read",
  "banking.receipt.read",
  "banking.bank_account.read",
  "banking.bank_account.create",
];
const actor: FinanceNominalActorContext = {
  tenantId: tenant,
  actor: {
    tenantId: tenant,
    userId: "r06.override-admin",
    organizationName: "Synthetic",
    displayName: "Synthetic adopter",
    email: "adoption@example.invalid",
    roles: ["super_administrator"],
    permissions,
    sessionVersion: 1,
  },
};
run("Company Chart adoption and posting review", () => {
  let pool: DatabasePool, repo: SourceChartTemplateRepository, templateId: string;
  beforeAll(async () => {
    if (!url || !new URL(url).pathname.includes("chart_template_ct01"))
      throw new Error("Explicit isolated chart-template database required.");
    pool = createDatabasePool(url);
    await ensureSourceSuperAdministratorFixture(pool);
    repo = new SourceChartTemplateRepository(pool);
    for (const permission of permissions.filter(
      (item) => (item.endsWith(".read") && item.includes("chart_template")) || item.endsWith(".admin"),
    )) {
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
    const source = importChartTemplateRequestSchema.parse(
      JSON.parse(
        await readFile(new URL("../../packages/db/catalogs/approved-chart-20261020.json", import.meta.url), "utf8"),
      ),
    );
    const imported = await repo.import(actor, { ...source, revision: `adoption-${key()}` }, key(), key());
    await repo.publish(actor, imported.template.id, { expected_version: 1 }, key(), key());
    templateId = imported.template.id;
  });
  afterAll(async () => {
    await pool?.end();
  });
  async function fixture() {
    const company = `adoption-${key()}`,
      category = `category-${key()}`,
      section = `section-${key()}`;
    await pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic isolated adoption','active')",
      [tenant, company],
    );
    await pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','synthetic-adoption')",
      [tenant, key(), company],
    );
    for (const permission of permissions.filter(
      (item) => !["finance.chart_template.read", "finance.chart_template.admin"].includes(item),
    )) {
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,'r06-uat-policy-approval-override',$2,'all') on conflict do nothing",
        [tenant, permission],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override',$2,'company',$3) on conflict do nothing",
        [tenant, permission, company],
      );
    }
    await pool.query(
      "insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at) values($1,$2,$3,$3,'Current Assets','asset',null,true,'active',false,now()),($1,$2,$4,'2309','Cash and Bank','asset',$3,true,'active',false,now())",
      [tenant, company, category, section],
    );
    await pool.query(
      "insert into finance_nominal_section_policy(tenant_id,company_id,category_id,section_id,section_role,prefix,code_width,first_value,last_value,next_value) values($1,$2,$3,$4,'cash_and_bank','2309',2,1,99,8)",
      [tenant, company, category, section],
    );
    const preview = await repo.companyPreview(actor, templateId, { company_id: company, currency: "USD", limit: 100 });
    return {
      company,
      input: {
        company_id: company,
        currency: "USD",
        expected_template_version: 2,
        preview_sha256: preview.preview_sha256,
      },
    };
  }
  it("adopts all definitions atomically with exact Excel codes, inactive drafts and immutable source mappings; replays without duplication", async () => {
    const { company, input } = await fixture();
    const requestKey = key();
    const result = await repo.adoptCompany(actor, templateId, input, requestKey, key());
    expect(result).toMatchObject({
      created_categories: 13,
      created_sections: 77,
      created_nominals: 227,
      matched_accounts: 2,
      bank_references: 7,
      replayed: false,
    });
    expect(await repo.adoptCompany(actor, templateId, input, requestKey, key())).toEqual({ ...result, replayed: true });
    expect(
      (
        await pool.query(
          "select count(*)::int as count from finance_chart_company_node where tenant_id=$1 and company_id=$2",
          [tenant, company],
        )
      ).rows[0].count,
    ).toBe(326);
    expect(
      (
        await pool.query(
          "select count(*)::int as count from finance_general_nominal g join account a on a.tenant_id=g.tenant_id and a.id=g.nominal_id where g.tenant_id=$1 and g.company_id=$2 and g.state='draft' and a.status='inactive'",
          [tenant, company],
        )
      ).rows[0].count,
    ).toBe(227);
    for (const banking of [new SourceBankPaymentRepository(pool), new SourceBankReceiptRepository(pool)]) {
      await expect(banking.listNominalAccounts(actor, { company_id: company, limit: 100 })).resolves.toEqual({
        items: [],
        availability: {
          eligible_count: 0,
          matching_count: 0,
          pending_approval_count: 227,
          inactive_count: 0,
          protected_count: 0,
          has_more: false,
        },
      });
    }
    expect(
      (
        await pool.query("select count(*)::int as count from bank_account where tenant_id=$1 and company_id=$2", [
          tenant,
          company,
        ])
      ).rows[0].count,
    ).toBe(0);
    const after = await repo.companyPreview(actor, templateId, { company_id: company, currency: "USD", limit: 100 });
    expect(after.adoption_id).toBe(result.adoption_id);
    expect(after.totals.exact_matches).toBe(319);
    await expect(
      repo.adoptCompany(actor, templateId, { ...input, preview_sha256: after.preview_sha256 }, key(), key()),
    ).rejects.toMatchObject({ code: "CHART_ALREADY_ADOPTED" });
    await expect(
      repo.adoptCompany(actor, templateId, { ...input, currency: "EUR" }, requestKey, key()),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
    await expect(
      pool.query("delete from finance_chart_company_node where tenant_id=$1 and company_id=$2", [tenant, company]),
    ).rejects.toThrow();
  });
  it("explains the company directory without exposing protected accounts, escaping literal searches and bounding results", async () => {
    const { company } = await fixture();
    const prefix = `directory-${key()}`;
    const rows = [
      { suffix: "a", name: "Literal fee %_\\", status: "active", manual: true, reconcile: false, system: false },
      {
        suffix: "b",
        name: "Second selectable nominal",
        status: "active",
        manual: true,
        reconcile: false,
        system: false,
      },
      {
        suffix: "c",
        name: "Protected module account",
        status: "active",
        manual: false,
        reconcile: false,
        system: false,
      },
      { suffix: "d", name: "Protected reconciliation", status: "active", manual: true, reconcile: true, system: false },
      { suffix: "e", name: "Protected system", status: "active", manual: true, reconcile: false, system: true },
      { suffix: "f", name: "Inactive ordinary", status: "inactive", manual: true, reconcile: false, system: false },
    ];
    for (const row of rows) {
      await pool.query(
        `insert into account(tenant_id,company_id,id,code,name,type,status,is_header,manual_posting_allowed,reconciliation_required,is_system_account,created_at)
         values($1,$2,$3,$4,$5,'expense',$6,false,$7,$8,$9,clock_timestamp())`,
        [
          tenant,
          company,
          `${prefix}-${row.suffix}`,
          row.suffix,
          row.name,
          row.status,
          row.manual,
          row.reconcile,
          row.system,
        ],
      );
    }
    for (const banking of [new SourceBankPaymentRepository(pool), new SourceBankReceiptRepository(pool)]) {
      const directory = await banking.listNominalAccounts(actor, { company_id: company, limit: 1 });
      expect(directory).toEqual({
        items: [expect.objectContaining({ id: `${prefix}-a`, code: "a", name: rows[0]!.name })],
        availability: {
          eligible_count: 2,
          matching_count: 2,
          pending_approval_count: 0,
          inactive_count: 1,
          protected_count: 3,
          has_more: true,
        },
      });
      const literal = await banking.listNominalAccounts(actor, { company_id: company, search: "%_\\", limit: 1 });
      expect(literal.items.map((item) => item.id)).toEqual([`${prefix}-a`]);
      expect(literal.availability).toMatchObject({ eligible_count: 2, matching_count: 1, has_more: false });
      const code = await banking.listNominalAccounts(actor, { company_id: company, search: "b", limit: 100 });
      expect(code.items.map((item) => item.id)).toEqual([`${prefix}-b`]);
      const noMatches = await banking.listNominalAccounts(actor, { company_id: company, search: "absent", limit: 100 });
      expect(noMatches.items).toEqual([]);
      expect(noMatches.availability).toMatchObject({ eligible_count: 2, matching_count: 0, has_more: false });
      await expect(
        banking.listNominalAccounts(actor, { company_id: `unpermitted-${key()}`, limit: 100 }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(
        banking.listNominalAccounts({ ...actor, tenantId: "different-tenant" }, { company_id: company, limit: 100 }),
      ).rejects.toMatchObject({ status: 403, code: "TENANT_ACCESS_DENIED" });
      await expect(
        banking.listNominalAccounts(
          { ...actor, actor: { ...actor.actor, userId: "r06.restricted" } },
          { company_id: company, limit: 100 },
        ),
      ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" });
    }
  });
  it("rejects stale preview, permissions, company/currency mismatch and partial-write attempts", async () => {
    const { company, input } = await fixture();
    await expect(
      repo.adoptCompany(actor, templateId, { ...input, preview_sha256: "0".repeat(64) }, key(), key()),
    ).rejects.toMatchObject({ code: "CHART_PREVIEW_STALE" });
    await expect(
      repo.adoptCompany(
        {
          ...actor,
          actor: { ...actor.actor, permissions: permissions.filter((item) => item !== "finance.chart_template.adopt") },
        },
        templateId,
        input,
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.adoptCompany(actor, templateId, { ...input, company_id: "other-company" }, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.adoptCompany({ ...actor, realActorId: "r06.checker" }, templateId, input, key(), key()),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      repo.adoptCompany(actor, templateId, { ...input, currency: "ZZZ" }, key(), key()),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (
        await pool.query(
          "select count(*)::int as count from finance_chart_company_adoption where tenant_id=$1 and company_id=$2",
          [tenant, company],
        )
      ).rows[0].count,
    ).toBe(0);
    expect(
      (
        await pool.query("select count(*)::int as count from account where tenant_id=$1 and company_id=$2", [
          tenant,
          company,
        ])
      ).rows[0].count,
    ).toBe(2);
  });
  it("keeps account identities separate across companies and serializes replayed concurrent adoption", async () => {
    const first = await fixture(),
      second = await fixture(),
      requestKey = key();
    const results = await Promise.all([
      repo.adoptCompany(actor, templateId, first.input, requestKey, key()),
      repo.adoptCompany(actor, templateId, first.input, requestKey, key()),
    ]);
    expect(results.map((item) => item.replayed).sort()).toEqual([false, true]);
    await repo.adoptCompany(actor, templateId, second.input, key(), key());
    const rows = await pool.query(
      "select id,company_id from account where tenant_id=$1 and company_id=any($2::text[]) and code='740101'",
      [tenant, [first.company, second.company]],
    );
    expect(rows.rows).toHaveLength(2);
    expect(rows.rows[0].id).not.toBe(rows.rows[1].id);
  });
  it("requires explicit posting review before direct activation and blocks controlled accounts", async () => {
    const { company, input } = await fixture();
    await repo.adoptCompany(actor, templateId, input, key(), key());
    const row = (
      await pool.query("select id from account where tenant_id=$1 and company_id=$2 and code='740101'", [
        tenant,
        company,
      ])
    ).rows[0];
    const nominals = new SourceFinanceNominalRepository(pool);
    await expect(
      nominals.changeStatus(
        actor,
        row.id,
        { expected_version: 1, action: "activate", reason: "Direct reviewed activation" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const request = {
      expected_version: 1,
      classification: "module_controlled" as const,
      reason: "Explicit tax ownership review",
    };
    const requestKey = key();
    const control = await repo.classifyNominal(actor, row.id, request, requestKey, key());
    expect(control.version).toBe(2);
    expect(await repo.classifyNominal(actor, row.id, request, requestKey, key())).toEqual({
      ...control,
      replayed: true,
    });
    await expect(
      nominals.changeStatus(
        actor,
        row.id,
        { expected_version: 2, action: "activate", reason: "Direct reviewed activation" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    const ordinary = await pool.query("select id from account where tenant_id=$1 and company_id=$2 and code='711301'", [
      tenant,
      company,
    ]);
    const reviewed = await repo.classifyNominal(
      actor,
      ordinary.rows[0].id,
      { expected_version: 1, classification: "ordinary", reason: "Explicitly reviewed for manual posting" },
      key(),
      key(),
    );
    expect(reviewed.version).toBe(2);
    const bankQuery = { company_id: company, search: "711301", limit: 100 };
    expect((await new SourceBankPaymentRepository(pool).listNominalAccounts(actor, bankQuery)).items).toHaveLength(0);
    await expect(
      nominals.submit(actor, ordinary.rows[0].id, { expected_version: 2, reason: "Retired workflow" }, key(), key()),
    ).rejects.toMatchObject({ status: 410 });
    await nominals.changeStatus(
      actor,
      ordinary.rows[0].id,
      { expected_version: 2, action: "activate", reason: "Direct reviewed activation" },
      key(),
      key(),
    );
    await expect(
      repo.classifyNominal(
        actor,
        ordinary.rows[0].id,
        { expected_version: 3, classification: "ordinary", reason: "Too late" },
        key(),
        key(),
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await new SourceBankPaymentRepository(pool).listNominalAccounts(actor, bankQuery)).items.map((item) => item.id),
    ).toContain(ordinary.rows[0].id);
    expect(
      (await new SourceBankReceiptRepository(pool).listNominalAccounts(actor, bankQuery)).items.map((item) => item.id),
    ).toContain(ordinary.rows[0].id);
    expect(
      (await new SourceBankPaymentRepository(pool).listNominalAccounts(actor, { ...bankQuery, search: "740101" }))
        .items,
    ).toHaveLength(0);
  });
  it("rolls back every account and mapping on late audit failure and checks persisted adoption scope", async () => {
    const { company, input } = await fixture();
    await pool.query(
      "delete from security_role_scope_grant where tenant_id=$1 and role_policy_id='r06-uat-policy-approval-override' and permission_key='finance.chart_template.adopt' and scope_kind='company' and scope_value=$2",
      [tenant, company],
    );
    await expect(repo.adoptCompany(actor, templateId, input, key(), key())).rejects.toMatchObject({ status: 403 });
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,'r06-uat-policy-approval-override','finance.chart_template.adopt','company',$2)",
      [tenant, company],
    );
    const fault = `chart_adopt_fault_${key().replaceAll("-", "")}`;
    await pool.query(
      `create function ${fault}() returns trigger language plpgsql as $$ begin if NEW.company_id='${company}' then raise exception 'Synthetic adoption evidence failure'; end if; return NEW; end $$; create trigger ${fault} before insert on finance_chart_company_event for each row execute function ${fault}()`,
    );
    try {
      await expect(repo.adoptCompany(actor, templateId, input, key(), key())).rejects.toThrow(
        "Synthetic adoption evidence failure",
      );
    } finally {
      await pool.query(`drop trigger ${fault} on finance_chart_company_event; drop function ${fault}()`);
    }
    expect(
      (
        await pool.query("select count(*)::int as count from account where tenant_id=$1 and company_id=$2", [
          tenant,
          company,
        ])
      ).rows[0].count,
    ).toBe(2);
    expect(
      (
        await pool.query(
          "select count(*)::int as count from finance_chart_company_node where tenant_id=$1 and company_id=$2",
          [tenant, company],
        )
      ).rows[0].count,
    ).toBe(0);
  });
  it("enforces tenant RLS, immutable adoption evidence and direct-SQL classification evidence", async () => {
    const { company, input } = await fixture();
    await repo.adoptCompany(actor, templateId, input, key(), key());
    await expect(
      pool.query(
        "update finance_chart_company_node set posting_classification='ordinary',review_version=review_version+1,reviewed_by='r06.override-admin',review_reason='Synthetic missing evidence' where tenant_id=$1 and company_id=$2 and node_key='nominal:711301'",
        [tenant, company],
      ),
    ).rejects.toMatchObject({ code: "23514" });
    expect(
      (
        await pool.query(
          "select posting_classification from finance_chart_company_node where tenant_id=$1 and company_id=$2 and node_key='nominal:711301'",
          [tenant, company],
        )
      ).rows[0].posting_classification,
    ).toBe("review_required");
    const connection = await pool.connect(),
      role = `chart_adoption_reader_${key().replaceAll("-", "")}`;
    try {
      await connection.query(
        `create role ${role} nologin; grant select on finance_chart_company_adoption,finance_chart_company_node,finance_chart_company_event to ${role}; set role ${role}`,
      );
      await connection.query("select set_config('nexora.tenant_id','another-tenant',false)");
      for (const table of [
        "finance_chart_company_adoption",
        "finance_chart_company_node",
        "finance_chart_company_event",
      ])
        expect(Number((await connection.query(`select count(*) from ${table}`)).rows[0].count)).toBe(0);
      await connection.query("select set_config('nexora.tenant_id',$1,false)", [tenant]);
      expect(
        Number(
          (await connection.query("select count(*) from finance_chart_company_node where company_id=$1", [company]))
            .rows[0].count,
        ),
      ).toBe(326);
    } finally {
      await connection.query("reset role");
      await connection.query(`drop owned by ${role}; drop role ${role}`);
      connection.release();
    }
    await expect(
      pool.query("delete from finance_chart_company_adoption where tenant_id=$1 and company_id=$2", [tenant, company]),
    ).rejects.toThrow();
    await expect(
      pool.query("delete from finance_chart_company_event where tenant_id=$1 and company_id=$2", [tenant, company]),
    ).rejects.toThrow();
  });
  it("creates an explicitly selected Bank definition with its reserved Excel code and chosen currency, without consuming the custom sequence", async () => {
    const { company, input } = await fixture();
    await repo.adoptCompany(actor, templateId, input, key(), key());
    const nominals = new SourceFinanceNominalRepository(pool);
    const options = await nominals.options(actor, company),
      definition = options.bank_definitions!.find((item) => item.code === "230901")!;
    expect(definition.configured).toBe(false);
    const section = options.sections.find((item) => item.id === definition.section_id)!;
    const request = {
      nominal_kind: "bank" as const,
      company_id: company,
      category_id: section.category_id,
      section_id: section.id,
      name: definition.name,
      currency: "USD",
      chart_template_id: definition.template_id,
      chart_node_key: definition.node_key,
    };
    await expect(
      nominals.create(actor, { ...request, chart_node_key: "nominal:740101" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      nominals.create(actor, { ...request, name: "Unrelated Bank identity" }, key(), key()),
    ).rejects.toMatchObject({ status: 409 });
    const requestKey = key(),
      created = await nominals.create(actor, request, requestKey, key());
    expect(created).toMatchObject({ code: "230901", state: "active", version: 2 });
    expect(await nominals.create(actor, request, requestKey, key())).toEqual({ ...created, replayed: true });
    expect(
      (await nominals.options(actor, company)).bank_definitions!.find((item) => item.code === "230901")!.configured,
    ).toBe(true);
    const preview = await repo.companyPreview(actor, templateId, { company_id: company, currency: "USD", limit: 100 });
    expect(preview.totals).toMatchObject({ exact_matches: 320, bank_references: 6, conflicts: 0 });
    const connection = await pool.connect(),
      role = `chart_bank_reader_${key().replaceAll("-", "")}`;
    try {
      await connection.query(
        `create role ${role} nologin; grant select on finance_chart_bank_binding to ${role}; set role ${role}`,
      );
      await connection.query("select set_config('nexora.tenant_id','another-tenant',false)");
      expect(Number((await connection.query("select count(*) from finance_chart_bank_binding")).rows[0].count)).toBe(0);
      await connection.query("select set_config('nexora.tenant_id',$1,false)", [tenant]);
      expect(
        Number(
          (await connection.query("select count(*) from finance_chart_bank_binding where company_id=$1", [company]))
            .rows[0].count,
        ),
      ).toBe(1);
    } finally {
      await connection.query("reset role");
      await connection.query(`drop owned by ${role}; drop role ${role}`);
      connection.release();
    }
    await expect(nominals.create(actor, request, key(), key())).rejects.toMatchObject({ status: 409 });
    const custom = await nominals.create(
      actor,
      {
        nominal_kind: "bank",
        company_id: company,
        category_id: section.category_id,
        section_id: section.id,
        name: "Synthetic custom Bank " + key(),
        currency: "USD",
      },
      key(),
      key(),
    );
    expect(custom.code).toBe("230908");
    expect(
      (await pool.query("select currency from bank_account where tenant_id=$1 and account_id=$2", [tenant, created.id]))
        .rows[0].currency,
    ).toBe("USD");
    await expect(
      pool.query("delete from finance_chart_bank_binding where tenant_id=$1 and company_id=$2", [tenant, company]),
    ).rejects.toThrow();
  });
});
