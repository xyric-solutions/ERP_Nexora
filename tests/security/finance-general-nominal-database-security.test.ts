import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "../integration/source-security-fixture.js";
const url = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL,
  run = url ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 10),
  company = `gn-security-${suffix}`,
  category = company + "-category",
  section = company + "-section";
run("Ordinary Finance nominal database security", () => {
  let pool: DatabasePool;
  beforeAll(async () => {
    pool = createDatabasePool(url!);
    await ensureSourceAuthorizationFixture(pool);
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'XGN','Synthetic ordinary nominal currency',2,false,'active') on conflict do nothing",
      [sourceTestTenantId],
    );
    await pool.query(
      `insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic security','active')`,
      [sourceTestTenantId, company],
    );
    await pool.query(
      `insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,created_at)
   values($1,$2,$3,$3,$3,'expense',null,true,'active',false,now()),($1,$2,$4,$4,$4,'expense',$3,true,'active',false,now())`,
      [sourceTestTenantId, company, category, section],
    );
    await pool.query(
      `insert into finance_general_nominal_policy(tenant_id,company_id,category_id,section_id,prefix,code_width,next_value,last_value)
   values($1,$2,$3,$4,$5,4,1,9999)`,
      [sourceTestTenantId, company, category, section, company + "-"],
    );
  });
  afterAll(async () => {
    await pool?.end();
  });
  async function transaction(work: (client: PoolClient) => Promise<void>) {
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await work(client);
    } finally {
      await client.query("rollback");
      client.release();
    }
  }
  async function draft(client: PoolClient, profile = true, currency = "USD") {
    const id = `gn-${randomUUID()}`;
    await client.query(
      `insert into account(tenant_id,company_id,id,code,name,type,parent_id,is_header,status,manual_posting_allowed,managed_general_nominal,created_at)
   values($1,$2,$3,$3,$3,'expense',$4,false,'inactive',true,true,now())`,
      [sourceTestTenantId, company, id, section],
    );
    if (profile)
      await client.query(
        `insert into finance_general_nominal(tenant_id,company_id,nominal_id,currency,created_by) values($1,$2,$3,$4,'r06.maker')`,
        [sourceTestTenantId, company, id, currency],
      );
    return id;
  }
  it("rejects an account without its authoritative governance extension", async () =>
    transaction(async (client) => {
      await draft(client, false);
      await expect(client.query("set constraints all immediate")).rejects.toMatchObject({ code: "23514" });
    }));
  it("protects generated accounting identity", async () =>
    transaction(async (client) => {
      const id = await draft(client);
      await expect(
        client.query("update account set code='changed' where tenant_id=$1 and id=$2", [sourceTestTenantId, id]),
      ).rejects.toThrow("immutable");
    }));
  it("prevents deactivation of a referenced ordinary nominal Section", async () =>
    transaction(async (client) => {
      await draft(client);
      await expect(
        client.query("update account set status='inactive' where tenant_id=$1 and id=$2", [
          sourceTestTenantId,
          section,
        ]),
      ).rejects.toThrow("Header authority");
    }));
  it("prevents deactivation of a currency used by a governed draft", async () =>
    transaction(async (client) => {
      await draft(client, true, "XGN");
      await expect(
        client.query("update currency set status='inactive' where tenant_id=$1 and code='XGN'", [sourceTestTenantId]),
      ).rejects.toThrow("Currency is required");
    }));
  it("rejects self-approval without actor/resource-bound override evidence", async () =>
    transaction(async (client) => {
      const id = await draft(client);
      await client.query(
        "update finance_general_nominal set state='pending_approval',submitted_by='r06.maker',row_version=2,updated_at=clock_timestamp() where tenant_id=$1 and nominal_id=$2",
        [sourceTestTenantId, id],
      );
      await expect(
        client.query(
          "update finance_general_nominal set state='active',decided_by='r06.maker',row_version=3,updated_at=clock_timestamp() where tenant_id=$1 and nominal_id=$2",
          [sourceTestTenantId, id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("protects immutable lifecycle evidence", async () =>
    transaction(async (client) => {
      const id = await draft(client),
        eventId = `event-${randomUUID()}`;
      await client.query(
        `insert into finance_general_nominal_event(tenant_id,event_id,company_id,nominal_id,event_type,resulting_version,actor_id)
   values($1,$2,$3,$4,'created',1,'r06.maker')`,
        [sourceTestTenantId, eventId, company, id],
      );
      await expect(
        client.query("delete from finance_general_nominal_event where tenant_id=$1 and event_id=$2", [
          sourceTestTenantId,
          eventId,
        ]),
      ).rejects.toThrow("immutable");
    }));
  it("rejects an event with a fabricated actor or version", async () =>
    transaction(async (client) => {
      const id = await draft(client);
      await expect(
        client.query(
          `insert into finance_general_nominal_event(tenant_id,event_id,company_id,nominal_id,event_type,resulting_version,actor_id)
   values($1,$2,$3,$4,'created',2,'r06.checker')`,
          [sourceTestTenantId, key(), company, id],
        ),
      ).rejects.toMatchObject({ code: "23514" });
    }));
  it("enforces tenant isolation for a non-owner PostgreSQL role", async () =>
    transaction(async (client) => {
      const id = await draft(client),
        role = `gn_rls_${suffix}`;
      await client.query(`create role ${role} nologin nosuperuser nobypassrls`);
      await client.query(`grant usage on schema public to ${role}`);
      await client.query(
        `grant select on finance_general_nominal,finance_general_nominal_policy,finance_general_nominal_event to ${role}`,
      );
      await client.query(`set local role ${role}`);
      expect(
        (await client.query("select nominal_id from finance_general_nominal where nominal_id=$1", [id])).rows,
      ).toHaveLength(1);
      await client.query("select set_config('nexora.tenant_id','outside-tenant',true)");
      expect(
        (await client.query("select nominal_id from finance_general_nominal where nominal_id=$1", [id])).rows,
      ).toHaveLength(0);
      expect(
        (await client.query("select section_id from finance_general_nominal_policy where company_id=$1", [company]))
          .rows,
      ).toHaveLength(0);
    }));
});
function key() {
  return randomUUID();
}
