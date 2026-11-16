import type { Pool } from "pg";
import type { ObjectStorage } from "@nexora/domain";

/** Retains bound/claimed evidence; removes only expired temporary files and abandoned writes. */
export class AssetStagedDocumentCleanup {
  constructor(
    readonly pool: Pool,
    readonly storage: ObjectStorage,
  ) {}
  async cleanupTenant(tenant: string, now = new Date()) {
    if (!Number.isFinite(now.getTime())) throw new Error("Invalid asset document cleanup cutoff.");
    const client = await this.pool.connect(),
      cursor = `stage-storage:${tenant}`;
    let deleted = 0;
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query("insert into fixed_asset_worker_cursor(id) values($1) on conflict do nothing", [cursor]);
      const token = (
        await client.query<{ last_key: string | null }>(
          "select last_key from fixed_asset_worker_cursor where id=$1 for update",
          [cursor],
        )
      ).rows[0]!.last_key;
      const prefix = `assets/staged/${encodeURIComponent(tenant)}/`,
        page = await this.storage.list(prefix, { limit: 100, ...(token ? { continuationToken: token } : {}) });
      for (const object of page.objects) {
        if (object.lastModified.getTime() > now.getTime() - 86400000) continue;
        const parts = object.objectKey.slice(prefix.length).split("/");
        if (parts.length !== 2 || !/^[a-f0-9-]{36}$/.test(parts[1]!)) continue;
        const company = decodeURIComponent(parts[0]!);
        await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`assets:${tenant}:${company}`]);
        const metadata = (
          await client.query<{ id: string; document_id: string | null; claimed_at: Date | null; created_at: Date }>(
            "select id,document_id,claimed_at,created_at from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and object_key=$3 for update",
            [tenant, company, object.objectKey],
          )
        ).rows[0];
        if (
          metadata &&
          (metadata.document_id || metadata.claimed_at || metadata.created_at.getTime() > now.getTime() - 30 * 86400000)
        )
          continue;
        // Delete first: the FK independently prevents removal of attached evidence,
        // including rows the maintenance actor cannot read through company RLS.
        if (metadata)
          await client.query("delete from fixed_asset_staged_document where tenant_id=$1 and company_id=$2 and id=$3", [
            tenant,
            company,
            metadata.id,
          ]);
        await this.storage.remove(object.objectKey);
        deleted++;
      }
      await client.query("update fixed_asset_worker_cursor set last_key=$2,updated_at=clock_timestamp() where id=$1", [
        cursor,
        page.continuationToken,
      ]);
      await client.query("commit");
      return { scanned: page.objects.length, deleted, truncated: page.continuationToken !== null };
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
