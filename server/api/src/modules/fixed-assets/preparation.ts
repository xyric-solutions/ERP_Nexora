import type { Pool } from "pg";
import type { ObjectStorage } from "@nexora/domain";
import { AssetStagedDocumentCleanup } from "./staged-document-cleanup.js";
import { assetDepreciationInputSchema } from "@nexora/contracts";
import { SourceTenantAuthenticationRepository } from "../auth/source-repository.js";
import { SourceAssetRepository, AssetError, reject, digest } from "./source-repository.js";
import { AssetDepreciationService } from "./depreciation.js";

/** Prepares at most one 400-asset draft per company per tick. It cannot approve or post. */
export class AssetDraftPreparation {
  constructor(
    readonly pool: Pool,
    readonly onFailure?: (error: unknown) => void,
    readonly storage?: ObjectStorage,
  ) {}
  private async scan(id: string, limit: number, tenant?: string) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      if (tenant) await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query("insert into fixed_asset_worker_cursor(id) values($1) on conflict do nothing", [id]);
      const last = (
        await client.query<{ last_key: string | null }>(
          "select last_key from fixed_asset_worker_cursor where id=$1 for update",
          [id],
        )
      ).rows[0]!.last_key;
      const source = tenant
        ? "select company_id as id,policy->>'scheduled_actor_id' as actor_id from fixed_asset_company_policy where tenant_id=$3 and policy->>'auto_prepare_monthly'='true'"
        : "select id,null::text as actor_id from tenant where status='active'";
      const ordered = (
        await client.query<{ id: string; actor_id: string | null }>(
          `with directory as(${source}) select id,actor_id from(
        select id,actor_id,0 as phase from directory where $1::text is null or id>$1
        union all select id,actor_id,1 as phase from directory where $1::text is not null and id<=$1
      ) candidate order by phase,id limit $2`,
          tenant ? [last, limit, tenant] : [last, limit],
        )
      ).rows;
      if (ordered.length)
        await client.query(
          "update fixed_asset_worker_cursor set last_key=$2,updated_at=clock_timestamp() where id=$1",
          [id, ordered.at(-1)!.id],
        );
      await client.query("commit");
      return ordered;
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
  async prepare(now = new Date(), tenantLimit = 50, companyLimit = 20) {
    if (
      !Number.isFinite(now.getTime()) ||
      tenantLimit < 1 ||
      tenantLimit > 100 ||
      companyLimit < 1 ||
      companyLimit > 100
    )
      throw new Error("Invalid asset preparation bounds.");
    // Tenant discovery uses the same runtime tenant directory as other worker jobs.
    const selected = await this.scan("tenants", tenantLimit);
    const repository = new SourceAssetRepository(this.pool),
      depreciation = new AssetDepreciationService(repository),
      authentication = new SourceTenantAuthenticationRepository(this.pool);
    let orphanDocumentsDeleted = 0;
    let drafts = 0,
      failed = 0;
    for (const entry of selected) {
      const tenant = entry.id,
        companies = await this.scan(`companies:${tenant}`, companyLimit, tenant);
      if (this.storage) {
        try {
          orphanDocumentsDeleted += (
            await new AssetStagedDocumentCleanup(this.pool, this.storage).cleanupTenant(tenant, now)
          ).deleted;
        } catch (error) {
          this.onFailure?.(error);
          failed++;
        }
      }
      for (const selectedCompany of companies) {
        const company = { company_id: selectedCompany.id, actor_id: selectedCompany.actor_id! };
        try {
          const actor = await authentication.loadAuthenticatedAccount(tenant, company.actor_id, new Date());
          if (!actor) reject("The scheduled preparer is inactive.", "ASSET_PREPARER_INACTIVE", 403);
          const created = await repository.transaction(
            { tenantId: tenant, actor },
            company.company_id,
            "depreciate",
            true,
            async (db) => {
              const policy = await repository.companyPolicy(db, tenant, company.company_id);
              if (!policy?.auto_prepare_monthly || policy.scheduled_actor_id !== actor.userId) return false;
              const periods = await db.query<{ id: string; status: string; start: string; end: string }>(
                `select p.id,p.status,p.period_start::text as start,p.period_end::text as end from financial_period p
              where p.tenant_id=$1 and p.company_id=$2 and p.period_end<$3::date
                and p.period_start=date_trunc('month',p.period_start)::date
                and p.period_end=(date_trunc('month',p.period_start)+interval '1 month - 1 day')::date
                and exists(select 1 from fixed_asset_record a left join fixed_asset_zero_accrual_observation z on z.tenant_id=a.tenant_id and z.company_id=a.company_id and z.asset_id=a.id and z.asset_version=a.version where a.tenant_id=p.tenant_id and a.company_id=p.company_id and a.status='active'
                  and date_trunc('month',coalesce(z.period_end+1,a.last_depreciation_end+1,a.depreciation_start))::date=p.period_start
                  and a.cost-a.accumulated_depreciation-a.impairment>a.residual_value
                  and not exists(select 1 from fixed_asset_depreciation_run r cross join lateral jsonb_array_elements(r.details) d
                    where r.tenant_id=a.tenant_id and r.company_id=a.company_id and r.period_id=p.id
                      and r.state in('draft','submitted','approved') and d->>'asset_id'=a.id and coalesce(d->>'skip_reason','')=''))
              order by p.period_start limit 1`,
                [tenant, company.company_id, now.toISOString().slice(0, 10)],
              );
              const period = periods.rows[0];
              if (!period) return false;
              if (period.status !== "open")
                reject(
                  "Open the due accounting period before preparing depreciation.",
                  "ASSET_PREPARATION_PERIOD_CLOSED",
                );
              const assets = await db.query<{ id: string }>(
                `select a.id from fixed_asset_record a left join fixed_asset_zero_accrual_observation z on z.tenant_id=a.tenant_id and z.company_id=a.company_id and z.asset_id=a.id and z.asset_version=a.version where a.tenant_id=$1 and a.company_id=$2 and a.status='active'
              and date_trunc('month',coalesce(z.period_end+1,a.last_depreciation_end+1,a.depreciation_start))::date=$3::date
              and a.cost-a.accumulated_depreciation-a.impairment>a.residual_value
              and not exists(select 1 from fixed_asset_depreciation_run r cross join lateral jsonb_array_elements(r.details) d where r.tenant_id=a.tenant_id and r.company_id=a.company_id
                and r.period_id=$4 and r.state in('draft','submitted','approved') and d->>'asset_id'=a.id and coalesce(d->>'skip_reason','')='')
              order by a.id limit 400`,
                [tenant, company.company_id, period.start, period.id],
              );
              if (!assets.rows.length) return false;
              const input = assetDepreciationInputSchema.parse({
                company_id: company.company_id,
                period_id: period.id,
                asset_ids: assets.rows.map((a) => a.id),
                reason: "Scheduled monthly depreciation draft; independent review and explicit posting required",
              });
              const preview = await depreciation.preview(db, tenant, company.company_id, period.id, input.asset_ids);
              const zero = preview.details.filter((d) => d.skip_reason?.includes("rounds to zero"));
              if (zero.length)
                await db.query(
                  `insert into fixed_asset_zero_accrual_observation(tenant_id,company_id,asset_id,asset_version,period_end)
                select $1,$2,asset_id,asset_version,$3::date from jsonb_to_recordset($4::jsonb) as d(asset_id text,asset_version integer)
                on conflict(tenant_id,company_id,asset_id) do update set asset_version=excluded.asset_version,period_end=excluded.period_end,observed_at=clock_timestamp()`,
                  [tenant, company.company_id, period.end, JSON.stringify(zero)],
                );
              if (zero.length === preview.details.length) return false;
              if (preview.details.every((d) => d.skip_reason))
                reject(
                  "Review the asset dates and preceding periods before preparing depreciation.",
                  "ASSET_PREPARATION_REQUIRES_REVIEW",
                );
              const prepared = await depreciation.createInTransaction(
                db,
                { tenantId: tenant, actor },
                input,
                `scheduled-assets:${digest({ period_id: period.id, policy_version: policy.version, assets: preview.assets.map((asset) => ({ id: asset.id, version: asset.version })) })}`,
              );
              if ((await depreciation.run(db, tenant, company.company_id, prepared.id)).state !== "draft")
                reject(
                  "Review the previous preparation before reattempting this unchanged depreciation snapshot.",
                  "ASSET_PREPARATION_REQUIRES_REVIEW",
                );
              return true;
            },
          );
          if (created) drafts++;
          await this.result(tenant, company.company_id, created ? "draft_prepared" : "up_to_date", null);
        } catch (error) {
          this.onFailure?.(error);
          failed++;
          await this.result(
            tenant,
            company.company_id,
            "blocked",
            error instanceof AssetError ? error.code : "ASSET_PREPARATION_FAILED",
          );
        }
      }
    }
    return { tenants: selected.length, drafts, failed, orphanDocumentsDeleted };
  }
  private async result(tenant: string, company: string, status: string, code: string | null) {
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [tenant]);
      await client.query(
        `insert into fixed_asset_preparation_result(tenant_id,company_id,status,error_code) values($1,$2,$3,$4)
        on conflict(tenant_id,company_id) do update set status=excluded.status,error_code=excluded.error_code,updated_at=clock_timestamp()`,
        [tenant, company, status, code],
      );
      await client.query("commit");
    } catch (error) {
      await client.query("rollback");
      throw error;
    } finally {
      client.release();
    }
  }
}
