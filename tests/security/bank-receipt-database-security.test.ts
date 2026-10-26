import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Bank Receipt database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS on every receipt-owned relation", async () => {
    const relations = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
         from pg_class
        where oid=any(array[
          'bank_receipt_sequence'::regclass,
          'bank_receipt'::regclass,
          'bank_receipt_line'::regclass,
          'bank_receipt_event'::regclass
        ])
        order by relname`,
    );
    expect(relations.rows).toEqual([
      { relname: "bank_receipt", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_receipt_event", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_receipt_line", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_receipt_sequence", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it("installs lifecycle, line, posting-link, currency, override and append-only guards", async () => {
    const controls = await pool.query<{ table_name: string; trigger_name: string }>(
      `select tgrelid::regclass::text as table_name,tgname as trigger_name
         from pg_trigger
        where tgrelid=any(array[
          'bank_receipt'::regclass,
          'bank_receipt_line'::regclass,
          'bank_receipt_event'::regclass
        ]) and not tgisinternal
        order by table_name,trigger_name`,
    );
    expect(controls.rows).toEqual(
      expect.arrayContaining([
        { table_name: "bank_receipt", trigger_name: "bank_receipt_approval_override_guard" },
        { table_name: "bank_receipt", trigger_name: "bank_receipt_currency_guard" },
        { table_name: "bank_receipt", trigger_name: "bank_receipt_posting_link_guard" },
        { table_name: "bank_receipt", trigger_name: "bank_receipt_transition_guard" },
        { table_name: "bank_receipt_event", trigger_name: "bank_receipt_event_authority_guard" },
        { table_name: "bank_receipt_event", trigger_name: "bank_receipt_event_immutable" },
        { table_name: "bank_receipt_line", trigger_name: "bank_receipt_line_guard" },
      ]),
    );
  });

  it("binds receipt, line, period and journal identities to one company", async () => {
    const foreignKeys = await pool.query<{ table_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
         from pg_constraint
        where contype='f'
          and conrelid=any(array[
            'bank_receipt'::regclass,
            'bank_receipt_line'::regclass
          ])
        order by table_name,definition`,
    );
    const definitions = foreignKeys.rows.map((row) => `${row.table_name}: ${row.definition}`);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_receipt: FOREIGN KEY (tenant_id, company_id, bank_account_id) REFERENCES bank_account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_receipt_line: FOREIGN KEY (tenant_id, company_id, receipt_id) REFERENCES bank_receipt(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_receipt_line: FOREIGN KEY (tenant_id, company_id, nominal_account_id) REFERENCES account(tenant_id, company_id, id)",
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

  it("enforces exact lifecycle, payer, methods and append-only transitions", async () => {
    const constraints = await pool.query<{ table_name: string; constraint_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,conname as constraint_name,
              pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid=any(array[
          'bank_receipt'::regclass,
          'bank_receipt_line'::regclass,
          'bank_receipt_event'::regclass
        ]) and contype='c'
        order by table_name,constraint_name`,
    );
    const byName = new Map(constraints.rows.map((row) => [row.constraint_name, row.definition]));
    expect(byName.get("bank_receipt_lifecycle_evidence_check")).toContain("reversed");
    expect(byName.get("bank_receipt_decision_separation_check")).toContain("approval_override_event_id");
    expect(byName.get("bank_receipt_event_transition_check")).toContain("posted");
    expect(byName.get("bank_receipt_event_override_check")).toContain("posted");
    const payerConstraint = constraints.rows.find(
      (row) => row.table_name === "bank_receipt_line" && row.definition.includes("payer_name"),
    )?.definition;
    expect(payerConstraint).toContain("200");
    const methodConstraint = constraints.rows.find(
      (row) => row.table_name === "bank_receipt_line" && row.definition.includes("receipt_method"),
    )?.definition;
    for (const method of ["bank_transfer", "cheque", "cash", "online", "direct_debit", "card"]) {
      expect(methodConstraint).toContain(`'${method}'::text`);
    }
  });

  it("uses the Finance rate lock and rejects bank-control nominal lines", async () => {
    const functions = await pool.query<{ function_name: string; definition: string }>(
      `select proname as function_name,pg_get_functiondef(oid) as definition
         from pg_proc
        where proname in ('validate_bank_receipt_currency','validate_bank_receipt_line')
        order by proname`,
    );
    expect(functions.rows).toHaveLength(2);
    const byName = new Map(functions.rows.map((row) => [row.function_name, row.definition]));
    expect(byName.get("validate_bank_receipt_currency")).toContain("finance_currency_rate_lock_key");
    expect(byName.get("validate_bank_receipt_line")).toContain("reconciliation_required");
  });

  it("binds audit and override evidence to receipt action and permission", async () => {
    const result = await pool.query<{ definition: string }>(
      `select pg_get_functiondef(oid) as definition
         from pg_proc
        where proname='validate_bank_receipt_event_authority'`,
    );
    expect(result.rows).toHaveLength(1);
    const definition = result.rows[0]!.definition;
    expect(definition).toContain("banking.receipt");
    expect(definition).toContain("banking.receipt.approve");
    expect(definition).toContain("banking.receipt.post");
    expect(definition).toContain("correlation_id");
    expect(definition).toContain("approval_reference");
  });

  it("registers the exact receipt permissions", async () => {
    const permissions = await pool.query<{ permission_key: string }>(
      `select permission_key from security_permission_definition
        where permission_key like 'banking.receipt.%'
        order by permission_key`,
    );
    expect(permissions.rows.map((row) => row.permission_key)).toEqual([
      "banking.receipt.approve",
      "banking.receipt.create",
      "banking.receipt.post",
      "banking.receipt.read",
      "banking.receipt.reverse",
      "banking.receipt.submit",
      "banking.receipt.update",
    ]);
  });
});
