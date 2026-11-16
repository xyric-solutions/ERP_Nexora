import type { Pool } from "pg";
import type { ObjectStorage } from "@nexora/domain";
import { assetDetailSchema, assetWorkspaceSchema, assetQuerySchema, type AssetQuery } from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceAssetRepository } from "./source-repository.js";
import { AssetLifecycleService } from "./lifecycle.js";
import { AssetDepreciationService } from "./depreciation.js";
import { AssetReportService } from "./reports.js";
import { AssetAttachmentService } from "./attachments.js";
import { refundBalanceQuery } from "./refunds.js";

export class FixedAssetsService {
  readonly repository: SourceAssetRepository;
  readonly lifecycle: AssetLifecycleService;
  readonly depreciation: AssetDepreciationService;
  readonly reports: AssetReportService;
  readonly attachments: AssetAttachmentService;
  constructor(pool: Pool, storage?: ObjectStorage) {
    this.repository = new SourceAssetRepository(pool);
    this.lifecycle = new AssetLifecycleService(this.repository);
    this.depreciation = new AssetDepreciationService(this.repository);
    this.reports = new AssetReportService(this.repository);
    this.attachments = new AssetAttachmentService(this.repository, storage);
  }
  async workspace(context: BankingActorContext, raw: AssetQuery) {
    const query = assetQuerySchema.parse(raw),
      r = this.repository;
    return r.transaction(context, query.company_id, "read", false, async (client) =>
      assetWorkspaceSchema.parse({
        assets: await r.directory(client, context.tenantId, query),
        events: await this.lifecycle.filteredEvents(client, context.tenantId, query),
        runs: await this.depreciation.runs(client, context.tenantId, query.company_id, query.offset, query.limit),
      }),
    );
  }
  async detail(context: BankingActorContext, company: string, id: string, historyOffset = 0) {
    const r = this.repository;
    return r.transaction(context, company, "read", false, async (client) => {
      const asset = await r.asset(client, context.tenantId, company, id),
        history = await client.query(
          "select id,action,actor_id,occurred_at::text as at,reason,before_value as before,after_value as after from fixed_asset_audit where tenant_id=$1 and company_id=$2 and entity_id=$3 order by occurred_at desc,id desc limit 101 offset $4",
          [context.tenantId, company, id, historyOffset],
        );
      return assetDetailSchema.parse({
        asset,
        source: await r.source(client, context.tenantId, company, asset.source_line_id),
        events: await this.lifecycle.events(client, context.tenantId, company, id, 0, 1000),
        history: history.rows.slice(0, 100),
        history_offset: historyOffset,
        history_next_offset: history.rows.length > 100 ? historyOffset + 100 : null,
        schedule: await this.depreciation.schedule(client, context.tenantId, company, asset),
        attachments: await this.attachments.list(client, context.tenantId, company, id),
        refund_outstanding: (
          await client.query<{ amount: string }>(
            refundBalanceQuery(
              "with scoped as(select tenant_id,company_id,id from fixed_asset_record where tenant_id=$1 and company_id=$2 and id=$3)",
            ),
            [context.tenantId, company, id],
          )
        ).rows[0]!.amount,
      });
    });
  }
}
