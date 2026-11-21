import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { operationalAudit } from "../../server/api/src/modules/shared/operational-transaction.js";
export async function ensureProductCategoryFixture(pool: DatabasePool, tenant: string, company: string) {
  const id = `category-fixture-${company}`,
    c = await pool.connect();
  try {
    await c.query("begin");
    await c.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id','r06.maker',true)", [
      tenant,
    ]);
    await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`inventory:${tenant}:${company}`]);
    if (
      !(
        await c.query("select 1 from inventory_product_category where tenant_id=$1 and company_id=$2 and id=$3", [
          tenant,
          company,
          id,
        ])
      ).rowCount
    ) {
      const context = {
        tenantId: tenant,
        actor: {
          tenantId: tenant,
          userId: "r06.maker",
          organizationName: company,
          displayName: "Maker",
          email: "fixture@example.invalid",
          roles: [],
          permissions: [],
          sessionVersion: 1,
        },
      };
      await c.query(
        "insert into inventory_product_category(tenant_id,company_id,id,code,name,status,created_by,updated_by) values($1,$2,$3,'CAT-001','Acceptance category','active','r06.maker','r06.maker')",
        [tenant, company, id],
      );
      const row = (
        await c.query(
          "select to_jsonb(x) snapshot from inventory_product_category x where tenant_id=$1 and company_id=$2 and id=$3",
          [tenant, company, id],
        )
      ).rows[0].snapshot;
      const audit = await operationalAudit(c, context, {
        company,
        entity: "inventory_category",
        id,
        action: "inventory.category.save",
        before: null,
        after: row,
        correlation: randomUUID(),
      });
      await c.query(
        "insert into inventory_product_category_change(tenant_id,company_id,id,category_id,record_version,actor_id,reason,audit_event_id,idempotency_key,request_sha256,snapshot,result) values($1,$2,$3,$4,1,'r06.maker','Explicit isolated acceptance setup',$5,$6,repeat('0',64),$7::jsonb,'{}'::jsonb)",
        [tenant, company, randomUUID(), id, audit, randomUUID(), JSON.stringify(row)],
      );
    }
    await c.query("commit");
    return id;
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
  }
}
