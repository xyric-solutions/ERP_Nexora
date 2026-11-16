import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  assetDepreciationInputSchema,
  assetDepreciationActionSchema,
  assetDepreciationRunSchema,
  assetScheduleSchema,
  fixedAssetSchema,
  type AssetEvent,
  type AssetEventPreview,
  type AssetDepreciationRun,
  type FixedAsset,
  type AssetDepreciationInput,
  type AssetDepreciationAction,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { createFinanceTransactionClient, type FinancePostingLine } from "../finance/posting/types.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { SourceAssetRepository, assetProjection, reject, digest } from "./source-repository.js";
import { depreciationForPeriod, minor, money, monthStart, monthEnd, nextDay } from "./calculations.js";

const projection = `(select j.entry_number from journal_entry j where j.tenant_id=fixed_asset_depreciation_run.tenant_id and j.id=fixed_asset_depreciation_run.journal_id) as journal_reference,(select j.entry_number from journal_entry j where j.tenant_id=fixed_asset_depreciation_run.tenant_id and j.id=fixed_asset_depreciation_run.reversal_journal_id) as reversal_journal_reference,lifecycle_event_id,id,code,company_id,period_id,period_start::text as start,period_end::text as end,state,version,maker_id,approver_id,total::text,details,journal_id,reversal_journal_id`;
export class AssetDepreciationService {
  constructor(readonly repository: SourceAssetRepository) {}
  async run(client: PoolClient, tenant: string, company: string, id: string, lock = false) {
    const row = (
      await client.query(
        `select ${projection} from fixed_asset_depreciation_run where tenant_id=$1 and company_id=$2 and id=$3 ${lock ? "for update" : ""}`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) reject("The depreciation run was not found.", "ASSET_RUN_NOT_FOUND", 404);
    return assetDepreciationRunSchema.parse(row);
  }
  async runs(client: PoolClient, tenant: string, company: string, offset = 0, limit = 100) {
    const rows = await client.query(
      `select ${projection} from fixed_asset_depreciation_run where tenant_id=$1 and company_id=$2 order by period_start desc,created_at desc,id limit $3 offset $4`,
      [tenant, company, limit, offset],
    );
    return rows.rows.map((row) => assetDepreciationRunSchema.parse(row));
  }
  async preview(client: PoolClient, tenant: string, company: string, periodId: string, ids?: string[]) {
    const period = (
      await client.query<{ start: string; end: string }>(
        "select period_start::text as start,period_end::text as end from financial_period where tenant_id=$1 and company_id=$2 and id=$3",
        [tenant, company, periodId],
      )
    ).rows[0];
    if (!period || period.start !== monthStart(period.start) || period.end !== monthEnd(period.start))
      reject("Select a company accounting period covering one complete calendar month.");
    const rows = await client.query(
      `select ${assetProjection} from fixed_asset_record where tenant_id=$1 and company_id=$2 and ($3::text[] is null or id=any($3)) order by code limit 401 for update`,
      [tenant, company, ids ?? null],
    );
    if (rows.rows.length > 400)
      reject(
        "Select a batch of at most 400 assets for this depreciation run. No assets were silently omitted.",
        "ASSET_BATCH_REQUIRED",
      );
    if (ids && rows.rows.length !== new Set(ids).size)
      reject("The depreciation selection includes an unavailable asset.");
    const assets = rows.rows.map((row) => fixedAssetSchema.parse(row)),
      base = await resolveCompanyBaseCurrency(client, tenant, company);
    const details = assets.map((asset) => depreciationForPeriod(asset, period.start, period.end)),
      total = details.reduce((sum, detail) => sum + minor(detail.amount, base.decimalPlaces), 0n);
    return { period, assets, details, total: money(total, base.decimalPlaces) };
  }
  async create(context: BankingActorContext, raw: AssetDepreciationInput, key: string) {
    const input = assetDepreciationInputSchema.parse(raw),
      r = this.repository;
    return r.transaction(context, input.company_id, "depreciate", true, (client) =>
      this.createInTransaction(client, context, input, key),
    );
  }
  async createInTransaction(
    client: PoolClient,
    context: BankingActorContext,
    input: AssetDepreciationInput,
    key: string,
  ) {
    const r = this.repository;
    return r.idempotent(client, context, input.company_id, key, input, assetDepreciationRunSchema, async () => {
      const preview = await this.preview(client, context.tenantId, input.company_id, input.period_id, input.asset_ids),
        id = randomUUID(),
        code = await r.code(client, context.tenantId, input.company_id, "DEP");
      const pending = await client.query(
        `select 1 from fixed_asset_depreciation_run r cross join lateral jsonb_array_elements(r.details) d
          where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.state in('draft','submitted','approved')
            and d->>'asset_id'=any($4::text[]) and coalesce(d->>'skip_reason','')='' limit 1`,
        [
          context.tenantId,
          input.company_id,
          input.period_id,
          preview.details.filter((d) => !d.skip_reason).map((d) => d.asset_id),
        ],
      );
      if (pending.rowCount)
        reject(
          "An active depreciation draft already reserves one or more selected assets in this period.",
          "ASSET_RUN_PENDING",
        );
      await client.query(
        `insert into fixed_asset_depreciation_run(tenant_id,company_id,id,code,period_id,period_start,period_end,state,maker_id,total,details) values($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10)`,
        [
          context.tenantId,
          input.company_id,
          id,
          code,
          input.period_id,
          preview.period.start,
          preview.period.end,
          context.actor.userId,
          preview.total,
          JSON.stringify(preview.details),
        ],
      );
      const result = await this.run(client, context.tenantId, input.company_id, id);
      await r.audit(client, context, input.company_id, id, "depreciation_previewed", input.reason, null, result);
      return result;
    });
  }
  async action(context: BankingActorContext, id: string, raw: AssetDepreciationAction, key: string) {
    const input = assetDepreciationActionSchema.parse(raw),
      r = this.repository,
      permission = ["approve", "reject"].includes(input.action)
        ? "approve"
        : input.action === "reverse"
          ? "reverse"
          : "depreciate";
    return r.transaction(context, input.company_id, permission, true, (client) =>
      r.idempotent(client, context, input.company_id, key, { id, input }, assetDepreciationRunSchema, async () => {
        const before = await this.run(client, context.tenantId, input.company_id, id, true);
        r.version(before.version, input.expected_version);
        const required = {
          submit: "draft",
          approve: "submitted",
          reject: "submitted",
          post: "approved",
          reverse: "posted",
        }[input.action];
        if (before.state !== required) reject("The depreciation action is unavailable in this state.");
        if (["approve", "reject", "reverse"].includes(input.action) && before.maker_id === context.actor.userId)
          reject("An independent checker is required.", "ASSET_SELF_APPROVAL_DENIED", 403);
        if (input.action === "reject") {
          await client.query(
            "update fixed_asset_depreciation_run set state='rejected',version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, input.company_id, id],
          );
        } else if (input.action === "reverse") {
          if (!input.reversal_date || input.reversal_date < before.end)
            reject("Supply a governed reversal date on or after the original posting.");
          const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
          if (input.reversal_date > today) reject("Reversal cannot be future dated.");
          const effects = await client.query<{
            asset_id: string;
            amount: string;
            previous_end: string | null;
            previous_financial_date: string;
            asset_version: number;
          }>(
            "select asset_id,amount::text,previous_end::text,previous_financial_date::text,asset_version from fixed_asset_depreciation_effect where tenant_id=$1 and company_id=$2 and run_id=$3 and reversed_at is null order by asset_id",
            [context.tenantId, input.company_id, id],
          );
          const assets = await r.assetsByIds(
              client,
              context.tenantId,
              input.company_id,
              effects.rows.map((row) => row.asset_id),
              true,
            ),
            assetMap = new Map(assets.map((asset) => [asset.id, asset]));
          if (assets.length !== effects.rowCount) reject("A depreciated asset is unavailable.");
          const laterFinancial = await client.query(
            `select 1 from fixed_asset_event e join fixed_asset_depreciation_effect d on d.tenant_id=e.tenant_id and d.company_id=e.company_id and d.asset_id=e.asset_id where d.tenant_id=$1 and d.company_id=$2 and d.run_id=$3 and e.state='posted' and e.posted_asset_version>d.asset_version and (e.type in ('impairment','disposal','return') or (e.type='maintenance' and e.input->>'treatment'='capital_improvement')) limit 1`,
            [context.tenantId, input.company_id, id],
          );
          if (laterFinancial.rowCount)
            reject("Later asset financial effects must be corrected before reversing depreciation.");
          for (const effect of effects.rows) {
            const asset = assetMap.get(effect.asset_id)!;
            if (
              asset.last_depreciation_end !== before.details.find((detail) => detail.asset_id === asset.id)!.end ||
              !["active", "fully_depreciated"].includes(asset.status)
            )
              reject(
                "Reverse later asset financial effects first. Depreciation must remain the latest financial effect.",
              );
          }
          const original = (
            await client.query<{ accounting_event_id: string }>(
              "select accounting_event_id from fixed_asset_depreciation_run where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, id],
            )
          ).rows[0]!;
          await client.query("select set_config('nexora.asset_depreciation_reversal',$1,true)", [id]);
          const base = await resolveCompanyBaseCurrency(client, context.tenantId, input.company_id),
            reversed = await r.finance.reverse(await createFinanceTransactionClient(client), {
              tenantId: context.tenantId,
              companyId: input.company_id,
              actorId: context.actor.userId,
              sourceType: "assets.depreciation",
              sourceId: id,
              eventType: "reversed",
              originalEventType: "depreciation",
              originalAccountingEventId: original.accounting_event_id,
              originalJournalId: before.journal_id!,
              externalIdempotencyKey: `asset-depreciation-reverse:${id}`,
              transactionCurrency: base.code,
              postingDate: input.reversal_date,
              payloadHashMaterial: { run_id: id, reason: input.reason },
            });
          const updated = await client.query(
            `update fixed_asset_record set accumulated_depreciation=accumulated_depreciation-x.amount,last_depreciation_end=x.previous_end,last_financial_date=x.previous_financial_date,status='active',version=version+1,updated_at=clock_timestamp() from jsonb_to_recordset($3::jsonb) as x(asset_id text,amount numeric,previous_end date,previous_financial_date date) where tenant_id=$1 and company_id=$2 and id=x.asset_id returning ${assetProjection}`,
            [context.tenantId, input.company_id, JSON.stringify(effects.rows)],
          );
          await r.auditBatch(
            client,
            context,
            input.company_id,
            updated.rows.map((row) => {
              const asset = fixedAssetSchema.parse(row);
              return {
                id: asset.id,
                action: "depreciation_reversed",
                reason: input.reason,
                before: assetMap.get(asset.id),
                after: { asset, run_id: id, journal_id: reversed.journalId },
              };
            }),
          );
          await client.query(
            "update fixed_asset_depreciation_effect set reversed_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and run_id=$3",
            [context.tenantId, input.company_id, id],
          );
          await client.query(
            "update fixed_asset_depreciation_run set state='reversed',version=version+1,reversal_journal_id=$4,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, input.company_id, id, reversed.journalId],
          );
        } else {
          const preview = await this.preview(
            client,
            context.tenantId,
            input.company_id,
            before.period_id,
            before.details.map((detail) => detail.asset_id),
          );
          if (digest(preview.details) !== digest(before.details) || minor(preview.total, 8) !== minor(before.total, 8))
            reject("Asset values changed. Reject this run and generate a fresh preview.", "ASSET_PREVIEW_CHANGED");
          if (minor(before.total, 8) <= 0n)
            reject("There is no eligible depreciation to post. Review the skipped assets.");
          let journal = before.journal_id,
            event: string | null = null;
          if (input.action === "post") {
            const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
            if (before.end > today) reject("Depreciation cannot be posted before the accounting period ends.");
            const posted = await this.postApprovedRun(
              client,
              context,
              before,
              preview.assets,
              before.end,
              input.reason,
            );
            journal = posted.journalId;
            event = posted.accountingEventId;
          }
          const state = { submit: "submitted", approve: "approved", post: "posted" }[input.action];
          await client.query(
            `update fixed_asset_depreciation_run set state=$4,approver_id=case when $5='approve' then $6 else approver_id end,journal_id=$7,accounting_event_id=coalesce($8,accounting_event_id),version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
            [context.tenantId, input.company_id, id, state, input.action, context.actor.userId, journal, event],
          );
        }
        const result = await this.run(client, context.tenantId, input.company_id, id);
        await r.audit(
          client,
          context,
          input.company_id,
          id,
          `depreciation_${input.action}`,
          input.reason,
          before,
          result,
        );
        return result;
      }),
    );
  }

  private async postApprovedRun(
    client: PoolClient,
    context: BankingActorContext,
    run: AssetDepreciationRun,
    assets: FixedAsset[],
    postingDate: string,
    reason: string,
  ) {
    const r = this.repository,
      base = await resolveCompanyBaseCurrency(client, context.tenantId, run.company_id),
      eligible = run.details.filter((detail) => !detail.skip_reason),
      assetMap = new Map(assets.map((asset) => [asset.id, asset])),
      contexts = await r.postingContexts(
        client,
        context.tenantId,
        run.company_id,
        eligible.map((detail) => assetMap.get(detail.asset_id)!),
        postingDate,
      ),
      lines: FinancePostingLine[] = [];
    for (const detail of eligible) {
      const asset = assetMap.get(detail.asset_id)!,
        dimensions = contexts.get(asset.id)!;
      lines.push(
        {
          accountId: asset.category.expense_account_id,
          debit: detail.amount,
          credit: "0",
          dimensions,
          description: run.code + " " + asset.code + " depreciation",
          sourceMetadata: { asset_id: asset.id, run_id: run.id },
        },
        {
          accountId: asset.category.accumulated_account_id,
          debit: "0",
          credit: detail.amount,
          dimensions,
          description: run.code + " " + asset.code + " accumulated depreciation",
          sourceMetadata: { asset_id: asset.id, run_id: run.id },
        },
      );
    }
    const posted = await r.finance.post(await createFinanceTransactionClient(client), {
      tenantId: context.tenantId,
      companyId: run.company_id,
      actorId: context.actor.userId,
      sourceType: "assets.depreciation",
      sourceId: run.id,
      eventType: "depreciation",
      externalIdempotencyKey: "asset-depreciation:" + run.id,
      transactionCurrency: base.code,
      postingDate,
      exchangeRateId: null,
      exchangeRateValue: "1",
      payloadHashMaterial: { run_id: run.id, details: JSON.parse(JSON.stringify(run.details)) },
      lines,
    });
    const effects = eligible.map((detail) => {
      const asset = assetMap.get(detail.asset_id)!;
      return {
        asset_id: asset.id,
        amount: detail.amount,
        start: detail.start,
        end: detail.end,
        previous_end: asset.last_depreciation_end,
        previous_financial_date: asset.last_financial_date,
        asset_version: asset.version + 1,
      };
    });
    await client.query(
      `insert into fixed_asset_depreciation_effect(tenant_id,company_id,run_id,asset_id,period_start,period_end,amount,previous_end,previous_financial_date,asset_version) select $1,$2,$3,asset_id,start,"end",amount,previous_end,previous_financial_date,asset_version from jsonb_to_recordset($4::jsonb) as x(asset_id text,amount numeric,start date,"end" date,previous_end date,previous_financial_date date,asset_version integer)`,
      [context.tenantId, run.company_id, run.id, JSON.stringify(effects)],
    );
    const updated = await client.query(
      `update fixed_asset_record set accumulated_depreciation=accumulated_depreciation+x.amount,last_depreciation_end=x."end",last_financial_date=$3,status=case when cost-impairment-accumulated_depreciation-x.amount<=residual_value then 'fully_depreciated' else 'active' end,version=version+1,updated_at=clock_timestamp() from jsonb_to_recordset($4::jsonb) as x(asset_id text,amount numeric,"end" date,asset_version integer) where tenant_id=$1 and company_id=$2 and id=x.asset_id and version=x.asset_version-1 returning ${assetProjection}`,
      [context.tenantId, run.company_id, postingDate, JSON.stringify(effects)],
    );
    if (updated.rowCount !== effects.length)
      reject("Asset values changed during posting.", "ASSET_VERSION_CONFLICT", 412);
    await r.auditBatch(
      client,
      context,
      run.company_id,
      updated.rows.map((row) => {
        const asset = fixedAssetSchema.parse(row);
        return {
          id: asset.id,
          action: "depreciation_posted",
          reason,
          before: assetMap.get(asset.id),
          after: { asset, run_id: run.id, journal_id: posted.journalId },
        };
      }),
    );
    return posted;
  }
  async previewBeforeEvent(
    client: PoolClient,
    context: BankingActorContext,
    asset: FixedAsset,
    date: string,
  ): Promise<{ asset: FixedAsset; depreciation: AssetEventPreview["depreciation"] }> {
    const depreciation: AssetEventPreview["depreciation"] = [];
    if (date < asset.depreciation_start) return { asset, depreciation };
    let projected = { ...asset },
      start = asset.last_depreciation_end ? nextDay(asset.last_depreciation_end) : monthStart(asset.depreciation_start);
    while (start <= date && projected.status === "active") {
      if (depreciation.length >= 12)
        reject(
          "Post earlier monthly depreciation runs first. Lifecycle review supports at most twelve outstanding periods.",
          "ASSET_DEPRECIATION_REQUIRED",
        );
      const end = asset.category.convention === "full_month" ? monthEnd(start) : [monthEnd(start), date].sort()[0]!,
        detail = depreciationForPeriod(projected, start, end);
      if (detail.skip_reason) {
        if (
          end < asset.depreciation_start ||
          minor(detail.opening_carrying, asset.decimal_places) <= minor(asset.residual_value, asset.decimal_places)
        )
          break;
        reject(
          "Depreciation must be resolved before this lifecycle action: " + detail.skip_reason,
          "ASSET_DEPRECIATION_REQUIRED",
        );
      }
      const period = (
        await client.query<{ id: string; start: string; end: string }>(
          "select id,period_start::text as start,period_end::text as end from financial_period where tenant_id=$1 and company_id=$2 and period_start=$3 and period_end=$4",
          [context.tenantId, asset.company_id, monthStart(start), monthEnd(start)],
        )
      ).rows[0];
      if (!period)
        reject(
          "Create the missing company monthly accounting period before preparing this lifecycle action.",
          "ASSET_DEPRECIATION_PERIOD_REQUIRED",
        );
      const postingDate = detail.end < date ? detail.end : date;
      depreciation.push({
        period_id: period.id,
        start: period.start,
        end: period.end,
        posting_date: postingDate,
        detail,
      });
      projected = {
        ...projected,
        accumulated_depreciation: money(
          minor(projected.accumulated_depreciation, asset.decimal_places) + minor(detail.amount, asset.decimal_places),
          asset.decimal_places,
        ),
        last_depreciation_end: detail.end,
        last_financial_date: postingDate,
        net_book_value: detail.closing_carrying,
        version: projected.version + 1,
        status:
          minor(detail.closing_carrying, asset.decimal_places) <= minor(asset.residual_value, asset.decimal_places)
            ? "fully_depreciated"
            : "active",
      };
      start = nextDay(detail.end);
    }
    return { asset: projected, depreciation };
  }
  async postBeforeEvent(
    client: PoolClient,
    context: BankingActorContext,
    event: AssetEvent,
    asset: FixedAsset,
  ): Promise<{ asset: FixedAsset; runIds: string[] }> {
    const r = this.repository,
      runIds: string[] = [];
    if (event.preview.depreciation.length) {
      const { companyAuthoritySql } = await import("../security/company-authority.js");
      if (
        !context.actor.permissions.includes("assets.asset.depreciate") ||
        !(
          await client.query(companyAuthoritySql, [
            context.tenantId,
            context.actor.userId,
            event.company_id,
            "assets.asset.depreciate",
          ])
        ).rowCount
      )
        reject("Posting this event also requires company depreciation authority.", "PERMISSION_DENIED", 403);
    }
    for (const item of event.preview.depreciation) {
      const id = randomUUID(),
        code = await r.code(client, context.tenantId, event.company_id, "DEP");
      await client.query(
        `insert into fixed_asset_depreciation_run(tenant_id,company_id,id,code,period_id,period_start,period_end,state,maker_id,approver_id,total,details,lifecycle_event_id) values($1,$2,$3,$4,$5,$6,$7,'approved',$8,$9,$10,$11,$12)`,
        [
          context.tenantId,
          event.company_id,
          id,
          code,
          item.period_id,
          item.start,
          item.end,
          event.maker_id,
          event.approver_id,
          item.detail.amount,
          JSON.stringify([item.detail]),
          event.id,
        ],
      );
      const run = await this.run(client, context.tenantId, event.company_id, id),
        posted = await this.postApprovedRun(client, context, run, [asset], item.posting_date, event.input.reason);
      await client.query(
        "update fixed_asset_depreciation_run set state='posted',journal_id=$4,accounting_event_id=$5,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
        [context.tenantId, event.company_id, id, posted.journalId, posted.accountingEventId],
      );
      await r.audit(
        client,
        context,
        event.company_id,
        id,
        "lifecycle_depreciation_posted",
        event.input.reason,
        null,
        await this.run(client, context.tenantId, event.company_id, id),
      );
      asset = await r.asset(client, context.tenantId, event.company_id, asset.id);
      runIds.push(id);
    }
    return { asset, runIds };
  }

  async schedule(client: PoolClient, tenant: string, company: string, asset: FixedAsset) {
    const rows: (typeof assetScheduleSchema._output)["rows"] = [];
    const posted = await client.query<{ start: string; end: string; amount: string; opening: string; closing: string }>(
      `select e.period_start::text as start,e.period_end::text as end,e.amount::text,d->>'opening_carrying' as opening,d->>'closing_carrying' as closing from fixed_asset_depreciation_effect e join fixed_asset_depreciation_run r on r.tenant_id=e.tenant_id and r.company_id=e.company_id and r.id=e.run_id cross join lateral jsonb_array_elements(r.details) d where e.tenant_id=$1 and e.company_id=$2 and e.asset_id=$3 and e.reversed_at is null and d->>'asset_id'=e.asset_id order by e.period_start`,
      [tenant, company, asset.id],
    );
    let cumulative = 0n;
    for (const row of posted.rows) {
      cumulative += minor(row.amount, asset.decimal_places);
      rows.push({
        start: row.start,
        end: row.end,
        amount: row.amount,
        accumulated_depreciation: money(cumulative, asset.decimal_places),
        net_book_value: row.closing,
        posted: true,
      });
    }
    if (!["returned", "disposed", "fully_depreciated"].includes(asset.status)) {
      let projection = { ...asset, status: "active" as const },
        start = projection.last_depreciation_end
          ? nextDay(projection.last_depreciation_end)
          : monthStart(asset.depreciation_start);
      const remainingRows = 1201 - rows.length;
      for (let month = 0; month < remainingRows; month++) {
        const end = monthEnd(start),
          detail = depreciationForPeriod(projection, start, end);
        if (detail.skip_reason) {
          if (detail.skip_reason.includes("zero") || detail.skip_reason.includes("round")) {
            projection = { ...projection, last_depreciation_end: end };
            start = nextDay(end);
            continue;
          }
          break;
        }
        const accumulated =
          minor(projection.accumulated_depreciation, asset.decimal_places) + minor(detail.amount, asset.decimal_places);
        rows.push({
          start: detail.start,
          end: detail.end,
          amount: detail.amount,
          accumulated_depreciation: money(accumulated, asset.decimal_places),
          net_book_value: detail.closing_carrying,
          posted: false,
        });
        projection = {
          ...projection,
          last_depreciation_end: detail.end,
          accumulated_depreciation: money(accumulated, asset.decimal_places),
        };
        start = nextDay(detail.end);
      }
    }
    const annual = new Map<number, { depreciation: bigint; posted: bigint }>();
    for (const row of rows) {
      const year = Number(row.start.slice(0, 4)),
        totals = annual.get(year) ?? { depreciation: 0n, posted: 0n };
      totals.depreciation += minor(row.amount, asset.decimal_places);
      if (row.posted) totals.posted += minor(row.amount, asset.decimal_places);
      annual.set(year, totals);
    }
    return assetScheduleSchema.parse({
      asset_id: asset.id,
      base_currency: asset.base_currency,
      rows,
      annual: [...annual].map(([year, totals]) => ({
        year,
        depreciation: money(totals.depreciation, asset.decimal_places),
        posted: money(totals.posted, asset.decimal_places),
      })),
    });
  }
}
