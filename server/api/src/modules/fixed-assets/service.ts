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
import { assetValuation, dailyEntitlement, nextDay, minor, money } from "./calculations.js";
import { assetAccrualQuerySchema, assetAccrualScheduleSchema, type AssetAccrualSchedule } from "@nexora/contracts";
import { reject } from "./source-repository.js";
import { assetJournalDirectorySchema } from "@nexora/contracts";
import { AssetStagedDocuments } from "./staged-documents.js";

export class FixedAssetsService {
  readonly repository: SourceAssetRepository;
  readonly lifecycle: AssetLifecycleService;
  readonly depreciation: AssetDepreciationService;
  readonly reports: AssetReportService;
  readonly attachments: AssetAttachmentService;
  readonly stagedDocuments: AssetStagedDocuments;
  constructor(pool: Pool, storage?: ObjectStorage) {
    this.repository = new SourceAssetRepository(pool);
    this.lifecycle = new AssetLifecycleService(this.repository);
    this.depreciation = new AssetDepreciationService(this.repository);
    this.reports = new AssetReportService(this.repository);
    this.attachments = new AssetAttachmentService(this.repository, storage);
    this.stagedDocuments = new AssetStagedDocuments(this.repository, storage);
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
        valuation: assetValuation(asset, new Date().toISOString().slice(0, 10)),
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
  async valuation(context: BankingActorContext, company: string, id: string, asOf: string) {
    return this.repository.transaction(context, company, "read", false, async (client) => {
      const asset = await this.repository.asset(client, context.tenantId, company, id);
      if (asOf < asset.last_financial_date)
        reject(
          "Historical valuations before the latest financial effect require the posted schedule.",
          "ASSET_HISTORICAL_CUTOFF",
        );
      return assetValuation(asset, asOf);
    });
  }
  async accrualSchedule(context: BankingActorContext, id: string, raw: unknown) {
    const query = assetAccrualQuerySchema.parse(raw);
    return this.repository.transaction(context, query.company_id, "read", false, async (client) => {
      const asset = await this.repository.asset(client, context.tenantId, query.company_id, id);
      if (asset.category.calculation_basis !== "actual_actual" && asset.method !== "double_declining")
        reject("This asset retains its approved legacy monthly schedule.", "ASSET_LEGACY_SCHEDULE");
      const earliest = [
        asset.accrual_basis?.start ?? asset.depreciation_start,
        asset.last_depreciation_end ? nextDay(asset.last_depreciation_end) : asset.depreciation_start,
      ]
        .sort()
        .at(-1)!;
      if (
        query.from < earliest ||
        query.to < query.from ||
        Date.parse(query.to) - Date.parse(query.from) > 365 * 86400000
      )
        reject("Choose up to 366 days from the current accrual basis after the last posted depreciation period.");
      if (["disposed", "returned"].includes(asset.status))
        reject("The asset has reached its terminal lifecycle state.");
      const rows: AssetAccrualSchedule["rows"] = [],
        dp = asset.decimal_places;
      const dayBefore = new Date(query.from + "T00:00:00Z");
      dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
      let previous = dailyEntitlement(asset, dayBefore.toISOString().slice(0, 10)),
        group = "";
      for (let day = query.from; day <= query.to; day = nextDay(day)) {
        const total = dailyEntitlement(asset, day),
          amount = total - previous;
        const key =
          query.frequency === "daily"
            ? day
            : query.frequency === "monthly"
              ? day.slice(0, 7)
              : query.frequency === "quarterly"
                ? `${day.slice(0, 4)}-Q${Math.ceil(Number(day.slice(5, 7)) / 3)}`
                : day.slice(0, 4);
        const accumulated = total + minor(asset.accrual_basis?.opening_accumulated ?? "0", dp),
          nbv = minor(asset.cost, dp) - minor(asset.impairment, dp) - accumulated;
        if (group !== key) {
          rows.push({
            start: day,
            end: day,
            amount: money(amount, dp),
            accumulated_depreciation: money(accumulated, dp),
            net_book_value: money(nbv < 0n ? 0n : nbv, dp),
          });
          group = key;
        } else {
          const row = rows.at(-1)!;
          row.end = day;
          row.amount = money(minor(row.amount, dp) + amount, dp);
          row.accumulated_depreciation = money(accumulated, dp);
          row.net_book_value = money(nbv < 0n ? 0n : nbv, dp);
        }
        previous = total;
      }
      return assetAccrualScheduleSchema.parse({ asset_id: id, frequency: query.frequency, rows });
    });
  }
  async journals(context: BankingActorContext, company: string, id: string, offset: number, limit: number) {
    return this.repository.transaction(context, company, "read", false, async (client) => {
      await this.repository.asset(client, context.tenantId, company, id);
      const rows = await client.query(
        `with sources as(
        select l.journal_id from fixed_asset_record a join journal_line l on l.tenant_id=a.tenant_id and l.id=a.source_line_id where a.tenant_id=$1 and a.company_id=$2 and a.id=$3
        union select r.journal_id from fixed_asset_depreciation_effect e join fixed_asset_depreciation_run r on r.tenant_id=e.tenant_id and r.company_id=e.company_id and r.id=e.run_id where e.tenant_id=$1 and e.company_id=$2 and e.asset_id=$3
        union select r.reversal_journal_id from fixed_asset_depreciation_effect e join fixed_asset_depreciation_run r on r.tenant_id=e.tenant_id and r.company_id=e.company_id and r.id=e.run_id where e.tenant_id=$1 and e.company_id=$2 and e.asset_id=$3
        union select journal_id from fixed_asset_event where tenant_id=$1 and company_id=$2 and asset_id=$3
        union select preview->>'linked_journal_id' from fixed_asset_event where tenant_id=$1 and company_id=$2 and asset_id=$3)
        select j.id,j.entry_number as reference,j.posting_date::text as date,initcap(replace(replace(j.source_type,'.',' '),'_',' ')) as description,
        sum(l.base_debit)::text as debit,sum(l.base_credit)::text as credit from sources s
        join journal_entry j on j.tenant_id=$1 and j.company_id=$2 and j.id=s.journal_id
        join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id
        group by j.id,j.entry_number,j.posting_date,j.source_type,j.source_id order by j.posting_date desc,j.id limit $4 offset $5`,
        [context.tenantId, company, id, limit + 1, offset],
      );
      return assetJournalDirectorySchema.parse({
        items: rows.rows.slice(0, limit),
        next_offset: rows.rows.length > limit ? offset + limit : null,
      });
    });
  }
}
