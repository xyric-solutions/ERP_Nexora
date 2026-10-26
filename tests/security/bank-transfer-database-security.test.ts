import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Bank Transfer database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS on all Transfer-owned relations", async () => {
    const relations = await pool.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }>(
      `select relname,relrowsecurity,relforcerowsecurity from pg_class
        where oid=any(array[
          'bank_transfer_fx_policy'::regclass,'bank_transfer_fx_policy_event'::regclass,
          'bank_transfer_sequence'::regclass,'bank_transfer'::regclass,
          'bank_transfer_line'::regclass,'bank_transfer_event'::regclass
        ]) order by relname`,
    );
    expect(relations.rows).toHaveLength(6);
    expect(relations.rows.every((row) => row.relrowsecurity && row.relforcerowsecurity)).toBe(true);
  });

  it("installs immutable evidence and lifecycle guards", async () => {
    const triggers = await pool.query<{ table_name: string; trigger_name: string }>(
      `select tgrelid::regclass::text as table_name,tgname as trigger_name from pg_trigger
        where tgrelid=any(array[
          'bank_transfer_fx_policy'::regclass,'bank_transfer_fx_policy_event'::regclass,
          'bank_transfer'::regclass,'bank_transfer_line'::regclass,'bank_transfer_event'::regclass
        ]) and not tgisinternal order by table_name,trigger_name`,
    );
    expect(triggers.rows).toEqual(
      expect.arrayContaining([
        { table_name: "bank_transfer", trigger_name: "bank_transfer_governance_evidence" },
        { table_name: "bank_transfer", trigger_name: "bank_transfer_guard" },
        { table_name: "bank_transfer_event", trigger_name: "bank_transfer_event_guard" },
        { table_name: "bank_transfer_event", trigger_name: "bank_transfer_event_immutable" },
        { table_name: "bank_transfer_line", trigger_name: "bank_transfer_line_guard" },
        { table_name: "bank_transfer_fx_policy", trigger_name: "bank_transfer_fx_policy_guard" },
        { table_name: "bank_transfer_fx_policy_event", trigger_name: "bank_transfer_fx_policy_event_immutable" },
      ]),
    );
  });

  it("keeps Transfer permissions explicit and independently grantable", async () => {
    const permissions = await pool.query<{ key: string }>(
      `select permission_key as key from security_permission_definition
        where permission_key like 'banking.transfer.%' order by permission_key`,
    );
    expect(permissions.rows.map((row) => row.key)).toEqual([
      "banking.transfer.approve",
      "banking.transfer.create",
      "banking.transfer.post",
      "banking.transfer.read",
      "banking.transfer.reassign",
      "banking.transfer.reverse",
      "banking.transfer.submit",
      "banking.transfer.update",
    ]);
  });
});
