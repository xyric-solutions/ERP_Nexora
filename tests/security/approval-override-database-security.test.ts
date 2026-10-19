import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("approval override database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS and immutable evidence", async () => {
    const relation = await pool.query<{
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relrowsecurity,relforcerowsecurity from pg_class
        where oid='approval_override_event'::regclass`,
    );
    expect(relation.rows[0]).toEqual({ relrowsecurity: true, relforcerowsecurity: true });
    const trigger = await pool.query<{ trigger_name: string }>(
      `select tgname as trigger_name from pg_trigger
        where tgrelid='approval_override_event'::regclass and not tgisinternal`,
    );
    expect(trigger.rows).toContainEqual({ trigger_name: "approval_override_event_immutable" });
  });

  it("binds domain references and authority evidence to the same tenant", async () => {
    const foreignKeys = await pool.query<{ table_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
         from pg_constraint
        where contype='f' and conname=any($1::text[])
        order by conname`,
      [
        [
          "security_role_approval_override_event_fk",
          "security_assignment_approval_override_event_fk",
          "security_user_change_override_event_fk",
          "security_session_policy_override_event_fk",
          "security_session_policy_activation_override_event_fk",
          "security_access_review_override_event_fk",
          "security_delegation_override_event_fk",
          "security_impersonation_override_event_fk",
        ],
      ],
    );
    expect(foreignKeys.rows).toHaveLength(8);
    expect(
      foreignKeys.rows.every(
        (row) =>
          row.definition.includes("tenant_id") &&
          row.definition.includes("REFERENCES approval_override_event(tenant_id, event_id)"),
      ),
    ).toBe(true);

    const authorityKeys = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition from pg_constraint
        where conrelid='approval_override_event'::regclass and contype='f'`,
    );
    expect(authorityKeys.rows.some((row) => row.definition.includes("actor_user_id, role_policy_id"))).toBe(true);
    expect(authorityKeys.rows.some((row) => row.definition.includes("role_assignment_version"))).toBe(true);
  });
});
