import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
(url ? describe : describe.skip)("Bank historical context reversal compatibility", () => {
  let pool: DatabasePool;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await migrateSourceSchema(pool);
  });
  afterAll(async () => {
    await pool?.end();
  });
  for (const kind of ["payment", "receipt"] as const)
    it(`preserves legacy ${kind} dimensions only for an exact evidenced reassignment`, async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        await client.query(
          `create temporary table bank_${kind}(tenant_id text,id text,company_id text,project_id text,location_id text,state text,approver_user_id text,approver_reassignment_id text,row_version integer,updated_at text) on commit drop`,
        );
        await client.query(
          `create temporary table bank_${kind}_line(tenant_id text,company_id text,${kind}_id text,dimensions jsonb) on commit drop`,
        );
        await client.query(
          `create temporary table bank_approver_reassignment(tenant_id text,company_id text,id text,record_version integer,payment_id text,receipt_id text,previous_user_id text,assigned_user_id text) on commit drop`,
        );
        await client.query(
          `insert into bank_${kind} values('synthetic','legacy','company',null,null,'submitted','old-checker',null,1,'before')`,
        );
        await client.query(
          `insert into bank_${kind}_line values('synthetic','company','legacy','{"project":"Historical free text","location":"Historical city"}')`,
        );
        await client.query(
          `create constraint trigger reassignment_context_probe after update on bank_${kind} deferrable initially deferred for each row execute function validate_bank_context_dimensions()`,
        );
        await client.query(
          `insert into bank_approver_reassignment values('synthetic','company','proof',2,${kind === "payment" ? "'legacy',null" : "null,'legacy'"},'old-checker','new-checker')`,
        );
        await client.query(
          `update bank_${kind} set approver_user_id='new-checker',approver_reassignment_id='proof',row_version=2,updated_at='after'`,
        );
        await expect(client.query("set constraints all immediate")).resolves.toBeDefined();
        await client.query("set constraints all deferred");
        await client.query(
          `insert into bank_approver_reassignment values('synthetic','company','forged',3,${kind === "payment" ? "'legacy',null" : "null,'legacy'"},'new-checker','third-checker')`,
        );
        await client.query(
          `update bank_${kind} set project_id='forged-project',approver_user_id='third-checker',approver_reassignment_id='forged',row_version=3,updated_at='forged'`,
        );
        await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
  for (const kind of ["payment", "receipt"] as const)
    it(`preserves legacy ${kind} reversal context without accepting forged new dimensions`, async () => {
      const client = await pool.connect();
      try {
        await client.query("begin");
        // Session-local function probes shadow names only on this test connection.
        // No public financial rows, triggers or migration history are changed.
        await client.query(
          `create temporary table bank_${kind}(tenant_id text,id text,company_id text,project_id text,location_id text,state text) on commit drop`,
        );
        await client.query(
          `create temporary table bank_${kind}_line(tenant_id text,company_id text,${kind}_id text,dimensions jsonb) on commit drop`,
        );
        await client.query(
          `create constraint trigger context_probe after insert or update on bank_${kind} deferrable initially deferred for each row execute function validate_bank_context_dimensions()`,
        );
        await client.query(`insert into bank_${kind} values('synthetic','legacy','company',null,null,'reversed')`);
        await client.query(
          `insert into bank_${kind}_line values('synthetic','company','legacy','{"project":"Historical free text","location":"Historical city"}')`,
        );
        await expect(client.query("set constraints all immediate")).resolves.toBeDefined();
        expect(
          (await client.query(`select dimensions from bank_${kind}_line where ${kind}_id='legacy'`)).rows[0]
            ?.dimensions,
        ).toEqual({ project: "Historical free text", location: "Historical city" });
        await client.query("set constraints all deferred");
        await client.query(`insert into bank_${kind} values('synthetic','new','company',null,null,'draft')`);
        await client.query(`insert into bank_${kind}_line values('synthetic','company','new','{"project":"forged"}')`);
        await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
      } finally {
        await client.query("rollback");
        client.release();
      }
    });
});
