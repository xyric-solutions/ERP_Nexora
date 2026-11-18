import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { migrateSourceModule } from "../../packages/db/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";

const bootstrap = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = bootstrap ? describe : describe.skip;
run("Additive purchase adjustment migration", () => {
  it("upgrades real v5 rows without changing historical amounts, versions or audit evidence", async () => {
    if (!bootstrap || !["localhost", "127.0.0.1"].includes(new URL(bootstrap).hostname))
      throw Error("Local disposable database required.");
    const { pool, close } = await createDisposableSourceDatabase(bootstrap);
    try {
      for (const moduleName of ["platform", "security", "workflow", "master_data", "finance"])
        await migrateSourceModule(pool, moduleName);
      await migrateSourceModule(pool, "procurement", { throughVersion: 5 });
      await pool.query(
        "insert into tenant(id,name,plan,region,status,default_locale) values('purchase-upgrade','Purchase migration fixture','enterprise','test','active','en')",
      );
      await pool.query(
        "insert into organization_unit(id,tenant_id,parent_id,type,code,name,status) values('upgrade-company','purchase-upgrade',null,'company','UPGRADE','Migration fixture','active')",
      );
      await pool.query(
        "insert into security_user_account(id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at) values('upgrade-maker','purchase-upgrade','upgrade:maker','upgrade@example.invalid','active','disabled',now(),now())",
      );
      const client = await pool.connect();
      try {
        await client.query("begin");
        const hash = createHash("sha256").update("Synthetic legacy purchase migration evidence").digest("hex");
        await client.query(
          "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,occurred_at,previous_event_hash,event_hash) values('upgrade-audit','purchase-upgrade',1,'upgrade-maker','upgrade-test','procurement.document.created','procurement_document','upgrade-document',$1,$1,'company:upgrade-company',now(),$1,$1)",
          [hash],
        );
        await client.query(
          "insert into procurement_document(tenant_id,company_id,id,kind,code,document_date,currency,lines,total_amount,created_by,updated_by) values('purchase-upgrade','upgrade-company','upgrade-document','request','PRQ-001','2026-11-01','USD',$1,10.00,'upgrade-maker','upgrade-maker')",
          [
            JSON.stringify([
              {
                id: "legacy-line",
                source_line_id: null,
                item_code: "LEGACY",
                description: "Legacy service",
                quantity: "1",
                uom: "Each",
                unit_price: "10.00",
                tax_percent: "0",
              },
            ]),
          ],
        );
        await client.query(
          "insert into procurement_change(tenant_id,company_id,id,entity_type,entity_id,record_version,actor_id,action,reason,audit_event_id,idempotency_key,request_sha256,snapshot,result) select tenant_id,company_id,'upgrade-change','document',id,row_version,updated_by,'created','Historical migration fixture','upgrade-audit','upgrade-key',$1,to_jsonb(d),jsonb_build_object('record',to_jsonb(d)) from procurement_document d where id='upgrade-document'",
          [hash],
        );
        await client.query("commit");
      } catch (error) {
        await client.query("rollback");
        throw error;
      } finally {
        client.release();
      }
      const before = (
        await pool.query("select to_jsonb(d) as row from procurement_document d where id='upgrade-document'")
      ).rows[0]!.row;
      const evidence = (await pool.query("select snapshot,result from procurement_change where id='upgrade-change'"))
        .rows[0];
      expect(await migrateSourceModule(pool, "procurement", { throughVersion: 6 })).toBe(true);
      const after = (
        await pool.query(
          "select to_jsonb(d)-'discount_amount'-'additional_charges' as row,discount_amount::text,additional_charges from procurement_document d where id='upgrade-document'",
        )
      ).rows[0]!;
      expect(after.row).toEqual(before);
      expect(after.discount_amount).toBe("0.00");
      expect(after.additional_charges).toEqual([]);
      expect(
        (await pool.query("select snapshot,result from procurement_change where id='upgrade-change'")).rows[0],
      ).toEqual(evidence);
      expect(await migrateSourceModule(pool, "procurement", { throughVersion: 6 })).toBe(false);
    } finally {
      await close();
    }
  }, 60000);
});
