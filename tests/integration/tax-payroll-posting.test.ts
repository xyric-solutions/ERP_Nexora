import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { ensureSourceSuperAdministratorFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { subledgerActor } from "./subledger-fixture.js";
import { SourceTaxRepository } from "../../server/api/src/modules/finance/taxes/source-repository.js";

const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("governed Payroll tax and actual accrual", () => {
  let pool: DatabasePool, close: () => Promise<void>;
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    pool = db.pool;
    close = db.close;
    await migrateSourceSchema(pool);
    await ensureSourceSuperAdministratorFixture(pool);
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  it("freezes a 5.5% component deduction and posts the exact mapped liability through independent Payroll review", async () => {
    let taxId = "",
      account = "",
      company = "";
    const permissions = ["finance.tax.read", "finance.tax.manage", "finance.tax_mapping.admin"];
    const admin = {
      ...subledgerActor("r06.override-admin"),
      actor: { ...subledgerActor("r06.override-admin").actor, roles: ["super_administrator"], permissions },
    };
    const f = await createProductionJournalFixture(pool, undefined, undefined, async (context) => {
      company = context.company;
      account = `payroll-tax-${randomUUID()}`;
      await pool.query(
        "insert into account(id,tenant_id,company_id,code,name,type,status,created_at) values($1,$2,$3,'TAX_PAY','Payroll Tax Liability','liability','active',now())",
        [account, tenant, company],
      );
      const component = await context.create({
        kind: "component",
        code: "UNI_TAX",
        name: "Unified payroll tax",
        component_kind: "deduction",
        method: "fixed",
        formula: null,
        taxable: false,
        prorated: false,
        account_id: account,
        position: 2,
      });
      await pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','isolated-payroll-tax')",
        [tenant, randomUUID(), company],
      );
      await pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,'r06-uat-policy-approval-override',p,'all' from unnest($2::text[]) p on conflict do nothing",
        [tenant, permissions],
      );
      await pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,'r06-uat-policy-approval-override',p,'company',$3 from unnest($2::text[]) p on conflict do nothing",
        [tenant, permissions, company],
      );
      const tax = await new SourceTaxRepository(pool).save(
        admin,
        {
          company_id: company,
          name: "Payroll flat deduction",
          tax_type: "Payroll Tax",
          rate: "5.50",
          description: "Synthetic test rate",
          module: "payroll",
          treatment: "payroll_deduction",
          trigger: "calculation",
          account_id: account,
          payroll_component_id: component.id,
          payroll_basis_component_id: context.earning,
          effective_date: context.month,
          status: "active",
          reason: "Map isolated payroll tax",
        },
        randomUUID(),
      );
      taxId = tax.id;
      return [{ component_id: component.id, amount: "0.00", formula: null }];
    });
    try {
      const result = (
        await pool.query<{ amount: string; basis: string; rate: string }>(
          "select i.amount::text,i.tax_snapshot->>'basis' as basis,i.tax_snapshot->>'rate' as rate from hr_payroll_result_item i join hr_payroll_result r on r.tenant_id=i.tenant_id and r.id=i.result_id where r.tenant_id=$1 and r.company_id=$2 and i.tax_snapshot is not null",
          [tenant, company],
        )
      ).rows;
      expect(result).toHaveLength(1);
      expect(Number(result[0]!.amount)).toBe(1705);
      expect(Number(result[0]!.basis)).toBe(31000);
      expect(Number(result[0]!.rate)).toBe(5.5);
      expect((await f.journalRead()).blocked).toEqual([]);
      await f.journalAction("prepare");
      await f.journalAction("accept", "r06.checker");
      await f.journalAction("post", "r06.target");
      const journal = (await f.journalRead()).proposal!.external_journal_id;
      const actual = (
        await pool.query<{ credit: string }>(
          "select credit::text from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
          [tenant, journal, account],
        )
      ).rows;
      expect(Number(actual[0]!.credit)).toBe(1705);
      expect(
        (
          await pool.query(
            "select 1 from finance_tax_application where tenant_id=$1 and company_id=$2 and definition_id=$3 and journal_id=$4",
            [tenant, company, taxId, journal],
          )
        ).rowCount,
      ).toBe(1);
    } finally {
      await f.dispose();
    }
  }, 60000);
});
