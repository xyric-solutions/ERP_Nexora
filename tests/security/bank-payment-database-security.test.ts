import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Bank Payment database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS on every payment-owned relation", async () => {
    const relations = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
         from pg_class
        where oid=any(array[
          'bank_payment_sequence'::regclass,
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ])
        order by relname`,
    );
    expect(relations.rows).toEqual([
      { relname: "bank_payment", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_event", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_line", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_sequence", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it("installs lifecycle, line, posting-link, currency, override and append-only guards", async () => {
    const controls = await pool.query<{ table_name: string; trigger_name: string }>(
      `select tgrelid::regclass::text as table_name,tgname as trigger_name
         from pg_trigger
        where tgrelid=any(array[
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ]) and not tgisinternal
        order by table_name,trigger_name`,
    );
    expect(controls.rows).toEqual(
      expect.arrayContaining([
        { table_name: "bank_payment", trigger_name: "bank_payment_approval_override_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_currency_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_posting_link_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_transition_guard" },
        { table_name: "bank_payment_event", trigger_name: "bank_payment_event_authority_guard" },
        { table_name: "bank_payment_event", trigger_name: "bank_payment_event_immutable" },
        { table_name: "bank_payment_line", trigger_name: "bank_payment_line_guard" },
      ]),
    );
  });

  it("binds payment, line, period and journal identities to one company", async () => {
    const foreignKeys = await pool.query<{ table_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
         from pg_constraint
        where contype='f'
          and conrelid=any(array[
            'bank_account'::regclass,
            'bank_payment'::regclass,
            'bank_payment_line'::regclass
          ])
        order by table_name,definition`,
    );
    const definitions = foreignKeys.rows.map((row) => `${row.table_name}: ${row.definition}`);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_account: FOREIGN KEY (tenant_id, company_id, account_id) REFERENCES account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment: FOREIGN KEY (tenant_id, company_id, bank_account_id) REFERENCES bank_account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment_line: FOREIGN KEY (tenant_id, company_id, payment_id) REFERENCES bank_payment(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment_line: FOREIGN KEY (tenant_id, company_id, nominal_account_id) REFERENCES account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.filter((value) => value.includes("REFERENCES financial_period(tenant_id, company_id, id)")),
    ).toHaveLength(2);
    expect(
      definitions.filter((value) => value.includes("REFERENCES journal_entry(tenant_id, company_id, id)")),
    ).toHaveLength(2);
  });

  it("enforces exact lifecycle evidence, bounded methods and append-only event transitions", async () => {
    const constraints = await pool.query<{ table_name: string; constraint_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,conname as constraint_name,
              pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid=any(array[
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ]) and contype='c'
        order by table_name,constraint_name`,
    );
    const byName = new Map(constraints.rows.map((row) => [row.constraint_name, row.definition]));
    expect(byName.get("bank_payment_lifecycle_evidence_check")).toContain("reversed");
    expect(byName.get("bank_payment_decision_separation_check")).toContain("approval_override_event_id");
    expect(byName.get("bank_payment_event_transition_check")).toContain("posted");
    const methodConstraint = constraints.rows.find(
      (row) => row.table_name === "bank_payment_line" && row.definition.includes("payment_method"),
    )?.definition;
    for (const method of ["bank_transfer", "cheque", "cash", "online", "standing_order", "card"]) {
      expect(methodConstraint).toContain(`'${method}'::text`);
    }
  });

  it("accepts PATCH idempotency without widening the method authority", async () => {
    const constraint = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid='platform_admin_idempotency'::regclass
          and conname='platform_admin_idempotency_method_check'`,
    );
    expect(constraint.rows).toHaveLength(1);
    expect(constraint.rows[0]?.definition).toContain("'POST'::text");
    expect(constraint.rows[0]?.definition).toContain("'PATCH'::text");
    expect(constraint.rows[0]?.definition).not.toContain("'PUT'::text");
  });
});
