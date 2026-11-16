import type { PoolClient } from "pg";
import {
  assetCreateSchema,
  purchaseLineSchema,
  convertMinor,
  decimal,
  decimalText,
  type PurchaseAssetRegistration,
} from "@nexora/contracts";
import type { BankingActorContext } from "../banking/source-repository.js";
import { SourceAssetRepository, reject } from "./source-repository.js";
import { resolveCompanyBaseCurrency } from "../finance/currencies/company-authority.js";
import { minor } from "./calculations.js";

/** Runs only inside the existing AP posting transaction; never posts another journal. */
export async function registerPostedPurchase(
  repository: SourceAssetRepository,
  client: PoolClient,
  context: BankingActorContext,
  company: string,
  documentId: string,
  journalId: string,
) {
  const document = (
    await client.query<{ lines: unknown; currency: string; supplier_id: string }>(
      "select lines,currency,supplier_id from procurement_document where tenant_id=$1 and company_id=$2 and id=$3 and kind='bill' and state='approved' for share",
      [context.tenantId, company, documentId],
    )
  ).rows[0];
  if (!document) return;
  const lines = purchaseLineSchema.array().parse(document.lines);
  for (const line of lines) {
    if (!line.create_fixed_asset) continue;
    const registration: PurchaseAssetRegistration | undefined = line.asset_registration;
    if (!registration || !line.id || !line.asset_category_id)
      reject("Approved asset registration details are missing.");
    const category = await repository.category(client, context.tenantId, company, line.asset_category_id);
    if (
      !(
        await client.query(
          "select 1 from fixed_asset_nominal_classification where tenant_id=$1 and company_id=$2 and account_id=$3 and active for share",
          [context.tenantId, company, category.asset_account_id],
        )
      ).rowCount
    )
      reject("The purchase nominal is no longer classified as a Fixed Asset.", "ASSET_CLASSIFICATION_CHANGED");
    if (
      category.version !== registration.category_version ||
      category.company_policy_version !== registration.company_policy_version
    )
      reject(
        "The asset policy changed after purchase approval. Revise and approve the source bill again.",
        "ASSET_POLICY_CHANGED",
      );
    const debit = (
      await client.query<{ id: string; base_debit: string; fx_rate: string; decimal_places: number }>(
        `select l.id,l.base_debit::text,coalesce(l.fx_rate,1)::text as fx_rate,p.decimal_places
       from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id
       join currency p on p.tenant_id=j.tenant_id and p.code=l.currency
       where l.tenant_id=$1 and j.company_id=$2 and j.id=$3 and l.dimensions->>'purchase_line_id'=$4
       and l.account_id=$5 and l.base_debit>0`,
        [context.tenantId, company, journalId, line.id, category.asset_account_id],
      )
    ).rows;
    if (debit.length !== 1) reject("The posted purchase line must resolve to one explicit asset debit.");
    const source = debit[0]!;
    const base = await resolveCompanyBaseCurrency(client, context.tenantId, company);
    const totals = registration.units.reduce((sum, unit) => sum + decimal(unit.cost, source.decimal_places), 0n);
    const expected = (decimal(line.quantity, 4) * decimal(line.unit_price, 2)) / 10000n;
    if (totals !== decimal(decimalText(expected, 2), source.decimal_places))
      reject("Individual asset costs must equal the approved bill line.");
    let allocated = 0n;
    const units = registration.units.map((unit, index) => {
      const converted =
        index === registration.units.length - 1
          ? minor(source.base_debit, base.decimalPlaces) - allocated
          : convertMinor(
              decimal(unit.cost, source.decimal_places),
              source.decimal_places,
              source.fx_rate,
              base.decimalPlaces,
            );
      allocated += converted;
      return {
        ...unit,
        cost: decimalText(converted, base.decimalPlaces),
        residual_value: decimalText(
          convertMinor(
            decimal(unit.residual_value, source.decimal_places),
            source.decimal_places,
            source.fx_rate,
            base.decimalPlaces,
          ),
          base.decimalPlaces,
        ),
      };
    });
    const created = await repository.createInTransaction(
      client,
      context,
      assetCreateSchema.parse({
        company_id: company,
        category_id: category.id,
        source_line_id: source.id,
        supplier_id: document.supplier_id,
        reason:
          "Automatically registered from posted Purchase bill" +
          (registration.reason ? ": " + registration.reason : ""),
        units,
      }),
      documentId,
    );
    for (let index = 0; index < created.items.length; index++) {
      const unit = registration.units[index]!;
      if (!unit.unit_id) reject("The approved asset unit is missing its stable identity.");
      await client.query(
        "insert into fixed_asset_purchase_origin(tenant_id,company_id,asset_id,document_id,line_id,unit_id) values($1,$2,$3,$4,$5,$6)",
        [context.tenantId, company, created.items[index]!.id, documentId, line.id, unit.unit_id],
      );
    }
  }
}
