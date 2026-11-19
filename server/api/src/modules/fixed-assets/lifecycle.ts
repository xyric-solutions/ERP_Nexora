import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  assetEventInputSchema,
  assetEventActionSchema,
  assetEventSchema,
  assetEventPreviewSchema,
  type AssetEventInput,
  type AssetEventAction,
  type FixedAsset,
  type AssetEventPreview,
  type AssetQuery,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { createFinanceTransactionClient } from "../finance/posting/types.js";
import { SourceAssetRepository, reject, digest } from "./source-repository.js";
import { AssetDepreciationService } from "./depreciation.js";
import { minor, money, monthStart } from "./calculations.js";

export const assetEventProjection = `e.id,e.code,e.company_id,e.asset_id,a.code as asset_code,e.type,e.event_date::text as date,e.state,e.version,e.maker_id,e.approver_id,e.input,e.preview,e.journal_id,(select entry_number from journal_entry j where j.tenant_id=e.tenant_id and j.id=e.journal_id) as journal_reference,e.created_at::text,e.depreciation_run_ids`;
export const eventPermission = (type: AssetEventInput["type"]) =>
  ({
    transfer: "transfer",
    maintenance: "maintain",
    verification: "maintain",
    impairment: "impair",
    disposal: "dispose",
    return: "return",
    refund: "return",
  })[type];
export class AssetLifecycleService {
  constructor(readonly repository: SourceAssetRepository) {}
  async event(client: PoolClient, tenant: string, company: string, id: string, lock = false) {
    const row = (
      await client.query(
        `select ${assetEventProjection} from fixed_asset_event e join fixed_asset_record a on a.tenant_id=e.tenant_id and a.company_id=e.company_id and a.id=e.asset_id where e.tenant_id=$1 and e.company_id=$2 and e.id=$3 ${lock ? "for update of e" : ""}`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row) reject("The asset event was not found.", "ASSET_EVENT_NOT_FOUND", 404);
    return assetEventSchema.parse(row);
  }
  async events(
    client: PoolClient,
    tenant: string,
    company: string,
    asset?: string,
    offset = 0,
    limit = 100,
    type?: AssetEventInput["type"],
  ) {
    const rows = await client.query(
      `select ${assetEventProjection} from fixed_asset_event e join fixed_asset_record a on a.tenant_id=e.tenant_id and a.company_id=e.company_id and a.id=e.asset_id where e.tenant_id=$1 and e.company_id=$2 and ($3::text is null or e.asset_id=$3) and ($6::text is null or e.type=$6) order by e.event_date desc,e.created_at desc,e.id limit $4 offset $5`,
      [tenant, company, asset ?? null, limit, offset, type ?? null],
    );
    return rows.rows.map((row) => assetEventSchema.parse(row));
  }
  async filteredEvents(client: PoolClient, tenant: string, query: AssetQuery) {
    const { where, parameters } = this.repository.assetScope(tenant, query),
      conditions = [`exists(select 1 from fixed_asset_record where ${where} and id=e.asset_id)`];
    const add = (sql: string, value: string) => {
      parameters.push(value);
      conditions.push(sql.replace("?", `$${parameters.length}`));
    };
    if (query.event_type) add("e.type=?", query.event_type);
    if (query.event_from) add("e.event_date>=?", query.event_from);
    if (query.event_to) add("e.event_date<=?", query.event_to);
    if (query.verification_exceptions)
      conditions.push(
        "e.type='verification' and e.state='posted' and e.input->>'result'<>'verified' and not exists(select 1 from fixed_asset_event newer where newer.tenant_id=e.tenant_id and newer.company_id=e.company_id and newer.asset_id=e.asset_id and newer.type='verification' and newer.state='posted' and (newer.event_date,newer.created_at,newer.id)>(e.event_date,e.created_at,e.id))",
      );
    parameters.push(query.limit, query.offset);
    const rows = await client.query(
      `select ${assetEventProjection} from fixed_asset_event e join fixed_asset_record a on a.tenant_id=e.tenant_id and a.company_id=e.company_id and a.id=e.asset_id where e.tenant_id=$1 and e.company_id=$2 and ${conditions.join(" and ")} order by e.event_date desc,e.created_at desc,e.id limit $${parameters.length - 1} offset $${parameters.length}`,
      parameters,
    );
    return rows.rows.map((row) => assetEventSchema.parse(row));
  }
  async preview(
    client: PoolClient,
    context: BankingActorContext,
    asset: FixedAsset,
    input: AssetEventInput,
  ): Promise<AssetEventPreview> {
    const original = asset;
    const earlyReturn = input.type === "return" && ["draft", "submitted", "approved"].includes(asset.status);
    const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
    if (input.date > today || input.date < (earlyReturn ? asset.acquisition_date : asset.in_service_date))
      reject("Lifecycle dates must fall between acquisition/in-service and today.");
    if (input.type !== "refund" && !earlyReturn && input.date < asset.assignment_date)
      reject("Lifecycle events cannot precede the latest effective assignment.");
    if (input.type !== "refund" && !earlyReturn && !["active", "fully_depreciated"].includes(asset.status))
      reject("Only an asset in service may enter this lifecycle workflow.");
    if (input.type !== "refund" && input.date < asset.last_financial_date)
      reject("Lifecycle events cannot precede the latest asset financial effect.");
    let depreciation: AssetEventPreview["depreciation"] = [];
    let depreciationDate: string | null = null;
    if (["impairment", "disposal", "return"].includes(input.type)) depreciationDate = input.date;
    if (input.type === "maintenance" && input.treatment === "capital_improvement") {
      const prior = new Date(
        (asset.category.convention === "full_month" ? monthStart(input.date) : input.date) + "T00:00:00Z",
      );
      prior.setUTCDate(prior.getUTCDate() - 1);
      depreciationDate = prior.toISOString().slice(0, 10);
      if (asset.last_depreciation_end && asset.last_depreciation_end > depreciationDate)
        reject(
          "Reverse depreciation covering the improvement date before capitalizing this cost.",
          "ASSET_DEPRECIATION_REQUIRED",
        );
    }
    if (depreciationDate) {
      const projected = await new AssetDepreciationService(this.repository).previewBeforeEvent(
        client,
        context,
        asset,
        depreciationDate,
      );
      asset = projected.asset;
      depreciation = projected.depreciation;
    }
    const dp = asset.decimal_places,
      cost = minor(asset.cost, dp),
      dep = minor(asset.accumulated_depreciation, dp),
      impairment = minor(asset.impairment, dp),
      carrying = cost - dep - impairment;
    const source = await this.repository.source(client, context.tenantId, input.company_id, asset.source_line_id),
      dimensions = {
        ...source.dimensions,
        ...Object.fromEntries(
          Object.entries(asset.assignment)
            .filter((entry): entry is [string, string] => entry[1] !== null)
            .map(([key, value]) => [key.replace("_id", ""), value]),
        ),
      };
    const result: AssetEventPreview = {
      cost: money(cost, dp),
      accumulated_depreciation: money(dep, dp),
      impairment: money(impairment, dp),
      carrying: money(carrying, dp),
      amount: money(0n, dp),
      gain: money(0n, dp),
      lines: [],
      linked_journal_id: null,
      depreciation,
    };
    const add = (account: string, value: bigint) => {
      if (value !== 0n)
        result.lines.push({
          account_id: account,
          debit: money(value > 0n ? value : 0n, dp),
          credit: money(value < 0n ? -value : 0n, dp),
          dimensions,
        });
    };
    if (input.type === "transfer") {
      if (input.date < asset.assignment_date) reject("A transfer cannot precede the latest assignment.");
      await this.repository.assignment(client, context.tenantId, input.company_id, input.assignment, input.date);
      if (digest(input.assignment) === digest(original.assignment)) reject("Change at least one assignment reference.");
    }
    if (input.type === "verification")
      await this.repository.assignment(client, context.tenantId, input.company_id, input.actual_assignment, input.date);
    if (input.type === "maintenance") {
      result.amount = money(minor(input.cost, dp), dp);
      if (input.next_date && input.next_date < input.date)
        reject("The next maintenance date must follow this maintenance.");
      if (
        input.supplier_id &&
        !(
          await client.query(
            "select 1 from procurement_supplier where tenant_id=$1 and company_id=$2 and id=$3 and status='active'",
            [context.tenantId, input.company_id, input.supplier_id],
          )
        ).rowCount
      )
        reject("Select an active company supplier.");
      if (input.treatment === "capital_improvement") {
        if (!input.source_line_id || minor(input.cost, dp) <= 0n)
          reject("A capital improvement requires positive cost and an independently posted acquisition debit.");
        const improvement = await this.repository.source(
          client,
          context.tenantId,
          input.company_id,
          input.source_line_id,
        );
        if (
          improvement.account_id !== asset.category.asset_account_id ||
          minor(improvement.available, dp) < minor(input.cost, dp) ||
          improvement.date > input.date
        )
          reject("The improvement must fit the available posted debit to this asset category account.");
        result.linked_journal_id = improvement.journal_id;
      } else if (input.source_line_id) reject("Ordinary maintenance cannot reserve a capital acquisition source.");
    }
    if (input.type === "impairment") {
      const recoverable = minor(input.recoverable_amount, dp),
        loss = carrying - recoverable;
      if (loss <= 0n) reject("Recoverable amount must be below the current carrying amount.");
      result.amount = money(loss, dp);
      add(asset.category.impairment_account_id, loss);
      add(asset.category.asset_account_id, -loss);
    }
    if (input.type === "disposal" || input.type === "return") {
      const proceeds = minor(input.type === "disposal" ? input.proceeds : input.amount, dp);
      if (input.type === "return") {
        if (input.credit_note_item_id && input.refund_receivable_account_id)
          reject("Use either the Accounting supplier credit note or a direct refund receivable, not both.");
        if (proceeds > cost)
          reject(
            "The net credit for one returned asset cannot exceed its registered cost. Record separate compensation in Accounting.",
          );
        if (input.expected_refund_date && input.expected_refund_date < input.date)
          reject("The expected refund date cannot precede the return date.");
        if (
          !input.credit_note_item_id &&
          (
            await client.query(
              "select 1 from finance_tax_application where tenant_id=$1 and company_id=$2 and journal_id=$3 and amount<>0 limit 1",
              [context.tenantId, input.company_id, source.journal_id],
            )
          ).rowCount
        )
          reject(
            "Tax-bearing acquisitions require a separately posted supplier credit note through Accounting before the asset return.",
            "ASSET_RETURN_TAX_EVIDENCE_REQUIRED",
          );
      }
      result.amount = money(proceeds, dp);
      result.gain = money(proceeds - carrying, dp);
      if (input.type === "disposal") {
        if (input.kind === "scrap" && proceeds !== 0n) reject("Scrapping cannot recognize sale proceeds.");
        if (proceeds > 0n) {
          if (!input.proceeds_account_id) reject("Select the disposal receivable account.");
          await this.receivableAccount(client, context, asset, input.proceeds_account_id);
          add(input.proceeds_account_id, proceeds);
        }
        add(asset.category.asset_account_id, -(cost - impairment));
      } else if (source.source_type === "purchase_invoice" || input.credit_note_item_id) {
        if (!input.credit_note_item_id)
          reject(
            "Invoice returns require a separately posted supplier credit note through Accounting, including the original tax reversal.",
          );
        const note = (
          await client.query<{ journal_id: string; credit: string; document_date: string }>(
            `select i.journal_id,j.posting_date::text as document_date,sum(l.base_credit-l.base_debit)::text as credit
      from finance_subledger_item i join finance_party_directory p on p.tenant_id=i.tenant_id and p.company_id=i.company_id and p.id=i.party_id
      join finance_subledger_operation o on o.tenant_id=i.tenant_id and o.company_id=i.company_id and o.id=i.operation_id
      join journal_entry j on j.tenant_id=i.tenant_id and j.company_id=i.company_id and j.id=i.journal_id and j.status='posted'
      join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id and l.account_id=$5
      where i.tenant_id=$1 and i.company_id=$2 and i.id=$3 and i.side='payable' and i.kind='credit_note' and p.source_supplier_id=$4
      and ($6::text is null or o.payload->>'original_item_id'=$6)
      and not exists(select 1 from finance_subledger_operation r where r.tenant_id=i.tenant_id and r.company_id=i.company_id and r.state='posted' and r.type='reversal' and r.payload->>'operation_id'=i.operation_id)
      group by i.journal_id,j.posting_date`,
            [
              context.tenantId,
              input.company_id,
              input.credit_note_item_id,
              asset.supplier_id,
              asset.category.asset_account_id,
              source.source_type === "purchase_invoice" ? source.source_id : null,
            ],
          )
        ).rows[0];
        if (!note || note.document_date > input.date || proceeds <= 0n)
          reject(
            "The credit note must link the original invoice and supplier, use the asset account, and remain posted by the return date.",
          );
        const missingTax = await client.query(
          `select 1 from finance_tax_application original where original.tenant_id=$1 and original.company_id=$2 and original.journal_id=$3 and original.amount<>0 and not exists(select 1 from finance_tax_application credit where credit.tenant_id=original.tenant_id and credit.company_id=original.company_id and credit.journal_id=$4 and credit.definition_id=original.definition_id and credit.revision=original.revision and credit.amount*original.amount<0) limit 1`,
          [context.tenantId, input.company_id, source.journal_id, note.journal_id],
        );
        if (missingTax.rowCount)
          reject(
            "The supplier credit note must reverse the original governed tax definitions and revisions. Prepare the tax correction in Accounting before returning the asset.",
            "ASSET_RETURN_TAX_EVIDENCE_REQUIRED",
          );
        const used = (
          await client.query<{ amount: string }>(
            "select coalesce(sum((input->>'amount')::numeric),0)::text as amount from fixed_asset_event where tenant_id=$1 and company_id=$2 and type='return' and state='posted' and input->>'credit_note_item_id'=$3",
            [context.tenantId, input.company_id, input.credit_note_item_id],
          )
        ).rows[0]!.amount;
        if (minor(used, dp) + proceeds > minor(note.credit, dp))
          reject("Returns exceed the posted supplier credit note asset amount.");
        result.linked_journal_id = note.journal_id;
        add(asset.category.asset_account_id, -(cost - impairment - proceeds));
      } else {
        if (source.currency !== asset.base_currency)
          reject(
            "Foreign-currency vendor credits require a posted supplier credit note so Accounting can retain the monetary FX balance.",
          );
        if (input.credit_note_item_id)
          reject("A direct-bank acquisition uses its separately mapped vendor refund receivable.");
        if (!input.refund_receivable_account_id || proceeds <= 0n)
          reject("Select a vendor refund receivable account and a positive net return amount.");
        await this.receivableAccount(client, context, asset, input.refund_receivable_account_id);
        add(input.refund_receivable_account_id, proceeds);
        add(asset.category.asset_account_id, -(cost - impairment));
      }
      add(asset.category.accumulated_account_id, dep);
      const gain = proceeds - carrying;
      add(gain >= 0n ? asset.category.gain_account_id : asset.category.loss_account_id, -gain);
    }
    if (input.type === "refund") {
      if (asset.status !== "returned") reject("A refund requires a returned asset.");
      const returned = await this.event(client, context.tenantId, input.company_id, input.return_event_id);
      if (
        returned.asset_id !== asset.id ||
        returned.type !== "return" ||
        returned.state !== "posted" ||
        returned.input.type !== "return" ||
        input.date < returned.date
      )
        reject("Select this asset’s posted vendor return.");
      const receivable = returned.input.credit_note_item_id ? undefined : returned.input.refund_receivable_account_id;
      const note = returned.input.credit_note_item_id;
      const receipt = (
        await client.query<{ journal_id: string; credit: string; date: string; account_id: string }>(
          `select j.id as journal_id,l.base_credit::text as credit,j.posting_date::text as date,l.account_id
      from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id and j.status='posted'
      where l.tenant_id=$1 and j.company_id=$2 and l.id=$3 and l.base_credit>0 and
       (($4::text is not null and l.account_id=$4 and exists(select 1 from bank_receipt r where r.tenant_id=j.tenant_id and r.company_id=j.company_id and r.original_journal_entry_id=j.id and r.state='posted'))
       or ($5::text is not null and exists(select 1 from finance_subledger_item i join finance_subledger_item_event e on e.tenant_id=i.tenant_id and e.company_id=i.company_id and e.item_id=i.id join finance_subledger_operation o on o.tenant_id=e.tenant_id and o.company_id=e.company_id and o.id=e.operation_id where i.tenant_id=j.tenant_id and i.company_id=j.company_id and i.id=$5 and l.account_id=i.control_account_id and e.journal_id=j.id and e.base_delta>0 and o.type='settlement' and o.payload->>'side'='payable' and not exists(select 1 from finance_subledger_operation reversed where reversed.tenant_id=o.tenant_id and reversed.company_id=o.company_id and reversed.type='reversal' and reversed.state='posted' and reversed.payload->>'operation_id'=o.id))))`,
          [context.tenantId, input.company_id, input.receipt_line_id, receivable ?? null, note ?? null],
        )
      ).rows[0];
      if (!receipt || receipt.date > input.date)
        reject("Select a posted Bank Receipt or a supplier-credit refund settlement for this return.");
      const amount = minor(input.amount, dp),
        used = (
          await client.query<{ asset_used: string; receipt_used: string }>(
            `select coalesce(sum((input->>'amount')::numeric) filter(where input->>'return_event_id'=$3),0)::text as asset_used,coalesce(sum((input->>'amount')::numeric) filter(where input->>'receipt_line_id'=$4),0)::text as receipt_used from fixed_asset_event where tenant_id=$1 and company_id=$2 and type='refund' and state='posted'`,
            [context.tenantId, input.company_id, input.return_event_id, input.receipt_line_id],
          )
        ).rows[0]!;
      if (
        amount <= 0n ||
        amount + minor(used.asset_used, dp) > minor(returned.preview.amount, dp) ||
        amount + minor(used.receipt_used, dp) > minor(receipt.credit, dp)
      )
        reject("Refund allocations exceed the return or posted receipt amount.");
      result.amount = money(amount, dp);
      result.linked_journal_id = receipt.journal_id;
    }
    return assetEventPreviewSchema.parse(result);
  }
  private async receivableAccount(client: PoolClient, context: BankingActorContext, asset: FixedAsset, id: string) {
    if ([asset.category.asset_account_id, asset.category.accumulated_account_id].includes(id))
      reject("Select a separate refund or disposal receivable account.");
    if (
      !(
        await client.query(
          `select 1 from account a where tenant_id=$1 and company_id=$2 and id=$3 and type='asset' and status='active' and not is_header and not reconciliation_required
    and not exists(select 1 from bank_account b where b.tenant_id=a.tenant_id and b.company_id=a.company_id and b.account_id=a.id)
    and not exists(select 1 from finance_subledger_policy p where p.tenant_id=a.tenant_id and p.company_id=a.company_id and a.id in(p.receivable_account_id,p.payable_account_id))`,
          [context.tenantId, asset.company_id, id],
        )
      ).rowCount
    )
      reject(
        "Use an active, separate asset receivable account; bank and monetary subledger controls are governed by their own workflows.",
      );
  }
  async create(context: BankingActorContext, raw: AssetEventInput, key: string) {
    const input = assetEventInputSchema.parse(raw),
      r = this.repository;
    return r.transaction(context, input.company_id, eventPermission(input.type), true, (client) =>
      r.idempotent(client, context, input.company_id, key, input, assetEventSchema, async () => {
        const asset = await r.asset(client, context.tenantId, input.company_id, input.asset_id, true);
        r.version(asset.version, input.expected_version);
        const preview = await this.preview(client, context, asset, input),
          id = randomUUID(),
          code = await r.code(client, context.tenantId, input.company_id, "FAE");
        await client.query(
          `insert into fixed_asset_event(tenant_id,company_id,id,code,asset_id,type,event_date,state,asset_version,maker_id,input,preview) values($1,$2,$3,$4,$5,$6,$7,'draft',$8,$9,$10,$11)`,
          [
            context.tenantId,
            input.company_id,
            id,
            code,
            asset.id,
            input.type,
            input.date,
            asset.version,
            context.actor.userId,
            JSON.stringify(input),
            JSON.stringify(preview),
          ],
        );
        const result = await this.event(client, context.tenantId, input.company_id, id);
        await r.audit(client, context, input.company_id, asset.id, "event_created", input.reason, null, result);
        return result;
      }),
    );
  }
  async action(context: BankingActorContext, id: string, raw: AssetEventAction, key: string) {
    const input = assetEventActionSchema.parse(raw),
      r = this.repository;
    // Resolve the type within the authorized transaction, then re-check its specific scoped permission.
    return r.transaction(
      context,
      input.company_id,
      input.action === "approve" || input.action === "reject" ? "approve" : "read",
      true,
      (client) =>
        r.idempotent(client, context, input.company_id, key, { id, input }, assetEventSchema, async () => {
          const before = await this.event(client, context.tenantId, input.company_id, id, true);
          r.version(before.version, input.expected_version);
          const permission = eventPermission(before.type);
          if (input.action === "submit" || input.action === "post") {
            if (!context.actor.permissions.includes(`assets.asset.${permission}`))
              reject("The lifecycle permission is missing.", "PERMISSION_DENIED", 403);
            const { companyAuthoritySql } = await import("../security/company-authority.js");
            if (
              !(
                await client.query(companyAuthoritySql, [
                  context.tenantId,
                  context.actor.userId,
                  input.company_id,
                  `assets.asset.${permission}`,
                ])
              ).rowCount
            )
              reject("The lifecycle action is outside company authority.", "COMPANY_ACCESS_DENIED", 403);
          }
          const required = { submit: "draft", approve: "submitted", reject: "submitted", post: "approved" }[
            input.action
          ];
          if (before.state !== required) reject("This event action is unavailable in its current state.");
          if ((input.action === "approve" || input.action === "reject") && before.maker_id === context.actor.userId)
            reject("An independent checker must decide this asset event.", "ASSET_SELF_APPROVAL_DENIED", 403);
          if (input.action === "reject") {
            await client.query(
              "update fixed_asset_event set state='rejected',version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
              [context.tenantId, input.company_id, id],
            );
            const result = await this.event(client, context.tenantId, input.company_id, id);
            await r.audit(
              client,
              context,
              input.company_id,
              before.asset_id,
              "event_reject",
              input.reason,
              before,
              result,
            );
            return result;
          }
          let asset = await r.asset(client, context.tenantId, input.company_id, before.asset_id, true);
          r.version(asset.version, before.input.expected_version);
          if (input.action === "post") {
            // Use the same source-journal lock as Banking and Accounting reversal.
            // Re-read financial evidence after locking before consuming any credit.
            const linked = before.preview.linked_journal_id;
            if (linked)
              await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
                "fixed-asset-source-journal:" + context.tenantId + ":" + input.company_id + ":" + linked,
              ]);
          }
          const preview = await this.preview(client, context, asset, before.input);
          if (digest(preview) !== digest(before.preview))
            reject("Financial evidence changed. Reject this event and prepare a new one.", "ASSET_PREVIEW_CHANGED");
          let journal = before.journal_id;
          let depreciationRunIds: string[] = [];
          if (input.action === "post") {
            const depreciated = await new AssetDepreciationService(r).postBeforeEvent(client, context, before, asset);
            asset = depreciated.asset;
            depreciationRunIds = depreciated.runIds;
            journal = preview.linked_journal_id;
            if (preview.lines.length) {
              const posted = await r.finance.post(await createFinanceTransactionClient(client), {
                tenantId: context.tenantId,
                companyId: input.company_id,
                actorId: context.actor.userId,
                sourceType: "assets.lifecycle",
                sourceId: id,
                eventType: before.type,
                externalIdempotencyKey: `asset-event:${id}`,
                transactionCurrency: asset.base_currency,
                postingDate: before.date,
                exchangeRateId: null,
                exchangeRateValue: "1",
                payloadHashMaterial: {
                  asset_id: asset.id,
                  type: before.type,
                  preview: JSON.parse(JSON.stringify(preview)),
                },
                lines: preview.lines.map((line) => ({
                  accountId: line.account_id,
                  debit: line.debit,
                  credit: line.credit,
                  dimensions: line.dimensions,
                  description: `${before.code} ${before.type} ${asset.code}`,
                })),
              });
              journal = posted.journalId;
            }
            const assignment =
              before.input.type === "transfer"
                ? before.input.assignment
                : before.input.type === "return"
                  ? { custodian_id: null, department_id: null, branch_id: null, location_id: null, project_id: null }
                  : asset.assignment;
            const details =
              before.input.type === "verification" || before.input.type === "return"
                ? {
                    ...asset.details,
                    condition: before.input.condition,
                    ...(before.input.type === "verification" ? { verification_due: null } : {}),
                  }
                : asset.details;
            let cost = asset.cost;
            if (before.input.type === "maintenance" && before.input.treatment === "capital_improvement") {
              cost = money(
                minor(asset.cost, asset.decimal_places) + minor(before.preview.amount, asset.decimal_places),
                asset.decimal_places,
              );
              await client.query(
                "insert into fixed_asset_acquisition(tenant_id,company_id,id,asset_id,source_line_id,amount,event_id) values($1,$2,$3,$4,$5,$6,$7)",
                [
                  context.tenantId,
                  input.company_id,
                  randomUUID(),
                  asset.id,
                  before.input.source_line_id,
                  before.preview.amount,
                  id,
                ],
              );
            }
            const impairment =
              before.type === "impairment"
                ? money(
                    minor(asset.impairment, asset.decimal_places) + minor(preview.amount, asset.decimal_places),
                    asset.decimal_places,
                  )
                : asset.impairment;
            let state = before.type === "return" ? "returned" : before.type === "disposal" ? "disposed" : asset.status;
            if (
              before.type === "impairment" &&
              minor(asset.cost, asset.decimal_places) -
                minor(asset.accumulated_depreciation, asset.decimal_places) -
                minor(impairment, asset.decimal_places) <=
                minor(asset.residual_value, asset.decimal_places)
            )
              state = "fully_depreciated";
            if (cost !== asset.cost && state === "fully_depreciated") state = "active";
            await client.query(
              `update fixed_asset_record set assignment=$4,assignment_date=case when $5 in ('transfer','return') then $6 else assignment_date end,details=$7,cost=$8,impairment=$9,status=$10,last_financial_date=case when $5 in ('return','disposal','impairment') or $8::numeric<>cost then $6 else last_financial_date end,version=version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
              [
                context.tenantId,
                input.company_id,
                asset.id,
                JSON.stringify(assignment),
                before.type,
                before.date,
                JSON.stringify(details),
                cost,
                impairment,
                state,
              ],
            );
            await r.audit(client, context, input.company_id, asset.id, before.type, input.reason, asset, {
              asset: await r.asset(client, context.tenantId, input.company_id, asset.id),
              event_id: id,
              journal_id: journal,
              linked_journal_id: preview.linked_journal_id,
            });
          }
          const state = { submit: "submitted", approve: "approved", reject: "rejected", post: "posted" }[input.action];
          await client.query(
            `update fixed_asset_event set state=$4,version=version+1,approver_id=case when $5='approve' then $6 else approver_id end,journal_id=$7,posted_asset_version=case when $5='post' then (select version from fixed_asset_record where tenant_id=$1 and company_id=$2 and id=$9) else posted_asset_version end,posted_at=case when $5='post' then clock_timestamp() else posted_at end,depreciation_run_ids=$8,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
            [
              context.tenantId,
              input.company_id,
              id,
              state,
              input.action,
              context.actor.userId,
              journal,
              JSON.stringify(depreciationRunIds),
              before.asset_id,
            ],
          );
          const result = await this.event(client, context.tenantId, input.company_id, id);
          await r.audit(
            client,
            context,
            input.company_id,
            before.asset_id,
            `event_${input.action}`,
            input.reason,
            before,
            result,
          );
          return result;
        }),
    );
  }
}
