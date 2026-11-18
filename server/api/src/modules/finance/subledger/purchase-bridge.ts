import { createHash } from "node:crypto";
import type { PoolClient } from "pg";
import { z } from "zod";
import {
  decimal,
  decimalText,
  convertMinor,
  paymentTotals,
  purchaseDocumentSchema,
  type SubledgerInput,
  type subledgerPreviewSchema,
} from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { resolveCompanyCurrencyAuthority } from "../currencies/company-authority.js";
import { resolveTax } from "../taxes/resolver.js";
import { SubledgerError } from "./source-repository.js";

type Preview = z.infer<typeof subledgerPreviewSchema>;
type Group = Extract<SubledgerInput, { type: "purchase_payment" }>;
const sourceSchema = purchaseDocumentSchema.pick({
  id: true,
  code: true,
  company_id: true,
  kind: true,
  state: true,
  version: true,
  supplier_id: true,
  currency: true,
  document_date: true,
  bill_date: true,
  due_date: true,
  total_amount: true,
  lines: true,
  discount_amount: true,
  additional_charges: true,
  allocations: true,
  payment_details: true,
});
export async function purchaseSource(client: PoolClient, tenant: string, company: string, id: string) {
  const row = (
    await client.query(
      `select id,code,company_id,kind,state,row_version as version,supplier_id,currency,
    document_date::text,bill_date::text,due_date::text,total_amount::text,lines,discount_amount::text,
    additional_charges,allocations,payment_details from procurement_document
    where tenant_id=$1 and company_id=$2 and id=$3 for share`,
      [tenant, company, id],
    )
  ).rows[0];
  if (!row) throw new SubledgerError(404, "NOT_FOUND", "Purchase source was not found in this company.");
  return sourceSchema.parse(row);
}
export async function purchaseParty(client: PoolClient, tenant: string, company: string, supplier: string) {
  const row = (
    await client.query<{ id: string }>(
      `select id from finance_subledger_party
    where tenant_id=$1 and company_id=$2 and source_supplier_id=$3`,
      [tenant, company, supplier],
    )
  ).rows[0];
  if (!row)
    throw new SubledgerError(
      409,
      "PURCHASE_PARTY_MISSING",
      "Link this supplier in Finance Accounting setup before preparing its payment.",
    );
  return row.id;
}
function fail(message: string): never {
  throw new SubledgerError(409, "PURCHASE_ACCOUNTING_BLOCKED", message);
}
/** Canonicalize source decimals without rounding unsupported currency units. */
export function nativePurchaseAmount(value: string, precision: number) {
  const units = decimal(value, 8),
    factor = 10n ** BigInt(8 - precision);
  if (units % factor !== 0n)
    throw new SubledgerError(
      409,
      "PURCHASE_CURRENCY_PRECISION",
      "The source amount exceeds this currency's precision. Correct the source before financial preparation.",
    );
  return decimalText(units / factor, precision);
}

/** Compose existing settlement/advance previews; never create child journals. */
export async function previewPurchasePayment(
  client: PoolClient,
  context: BankingActorContext,
  input: Group,
  id: string,
  code: string,
  preview: (input: SubledgerInput, id: string, code: string) => Promise<Preview>,
): Promise<Preview> {
  const source = await purchaseSource(client, context.tenantId, input.company_id, input.source_document_id);
  if (
    source.state !== "approved" ||
    !["payment", "multi_payment"].includes(source.kind) ||
    source.version !== input.source_version
  )
    fail("The Purchase payment must remain approved at the prepared source version.");
  const details = source.payment_details;
  if (input.currency !== source.currency) fail("The prepared currency must match the approved Purchase instruction.");
  if (!details) fail("Select a real Bank account on the approved Purchase instruction.");
  const a = await resolveCompanyCurrencyAuthority(client, {
    tenantId: context.tenantId,
    companyId: input.company_id,
    sourceCurrency: source.currency,
    effectiveOnOrBefore: input.date,
  });
  const scale = a.sourceDecimalPlaces;
  const native = (value: string) => nativePurchaseAmount(value, scale);
  const bank = (
    await client.query<{ account_id: string; currency: string; overdraft_limit: string }>(
      "select account_id,currency,overdraft_limit::text from bank_account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' for update",
      [context.tenantId, input.company_id, details.bank_account_id],
    )
  ).rows[0];
  if (!bank || bank.currency !== source.currency) fail("The selected active Bank must use the instruction currency.");
  if (input.tax_definition_id && input.tax_definition_id === input.additional_tax_definition_id)
    fail("Main and additional withholding require separate governed definitions.");
  const account = async (id: string | undefined, type: string, label: string) => {
    if (!id) fail(`Select the governed ${label} account before preparing this payment.`);
    const row = (
      await client.query(
        "select 1 from account where tenant_id=$1 and company_id=$2 and id=$3 and type=$4 and status='active' and not is_header and not reconciliation_required",
        [context.tenantId, input.company_id, id, type],
      )
    ).rowCount;
    if (!row) fail(`Select an active ${type} posting account for ${label}.`);
    return id;
  };
  let result: Preview | undefined;
  let cash = 0n;
  const merge = (child: Preview) => {
    if (!result)
      result = {
        ...child,
        lines: [],
        deltas: [],
        sources: [],
        taxes: [],
        item: null,
        additional_items: [],
        purchase_suppliers: [],
        source_evidence: createHash("sha256").update(JSON.stringify(source)).digest("hex"),
        fx_by_item: [],
        realized_gain: "0",
        unrealized_gain: "0",
        rounding: "0",
      };
    result.lines.push(...child.lines);
    result.deltas.push(...child.deltas);
    result.sources.push(...child.sources);
    result.taxes.push(...child.taxes);
    result.fx_by_item.push(...child.fx_by_item);
    if (child.item) result.additional_items!.push(child.item);
    for (const field of ["realized_gain", "unrealized_gain", "rounding"] as const)
      result[field] = decimalText(
        decimal(result[field], result.base_decimal_places, true) +
          decimal(child[field], result.base_decimal_places, true),
        result.base_decimal_places,
      );
  };
  const addNative = (accountId: string, amount: bigint, description: string) => {
    if (!amount) return;
    result!.lines.push({
      accountId,
      debit: decimalText(amount > 0n ? amount : 0n, scale),
      credit: decimalText(amount < 0n ? -amount : 0n, scale),
      currency: source.currency,
      exchangeRateId: a.rateId,
      exchangeRateValue: a.rateValue,
      exchangeRateDate: a.rateEffectiveDate,
      dimensions: {},
      description,
    });
  };
  const add = (account: string, cents: bigint, description: string) =>
    addNative(
      account,
      decimal(native(decimalText(cents < 0n ? -cents : cents, 2)), scale) * (cents < 0n ? -1n : 1n),
      description,
    );
  for (const [index, entry] of details.entries.entries()) {
    const party = await purchaseParty(client, context.tenantId, input.company_id, entry.supplier_id);
    const allocations = [];
    let allocated = 0n,
      discount = 0n;
    for (const allocation of source.allocations) {
      const bill = await purchaseSource(client, context.tenantId, input.company_id, allocation.bill_id);
      if (bill.supplier_id !== entry.supplier_id) continue;
      if (bill.state !== "approved" || bill.currency !== source.currency)
        fail("Each allocated Bill must remain approved in the instruction currency.");
      const item = (
        await client.query<{ id: string }>(
          `select i.id from finance_subledger_item i
        where i.tenant_id=$1 and i.company_id=$2 and i.source_document_id=$3 and i.party_id=$4 and i.kind='invoice' and i.side='payable'
        and not exists(select 1 from finance_subledger_operation r where r.tenant_id=i.tenant_id and r.company_id=i.company_id and r.type='reversal' and r.state='posted' and r.payload->>'operation_id'=i.operation_id)`,
          [context.tenantId, input.company_id, bill.id, party],
        )
      ).rows[0];
      if (!item) fail(`Recognize and post ${bill.code} in Finance before settling this instruction.`);
      const amount = decimal(allocation.amount, 2),
        d = decimal(allocation.discount ?? "0", 2);
      allocated += amount;
      discount += d;
      allocations.push({ item_id: item.id, amount: decimalText(amount + d, 2) });
    }
    if (!allocations.length) fail("Every supplier requires a posted allocated Bill.");
    const totals = paymentTotals(entry, decimalText(allocated, 2));
    const clearing = allocated + discount;
    const child = await preview(
      {
        company_id: input.company_id,
        date: input.date,
        reference: source.code,
        reason: input.reason,
        type: "settlement",
        side: "payable",
        party_id: party,
        bank_account_id: details.bank_account_id,
        payment_currency: source.currency,
        payment_amount: native(decimalText(clearing, 2)),
        bank_fee: "0",
        allocations: allocations.map((allocation) => ({ ...allocation, amount: native(allocation.amount) })),
      },
      `${id}:${index}`,
      `${code}/${index + 1}`,
    );
    merge(child);
    result!.purchase_suppliers!.push({
      supplier_id: entry.supplier_id,
      party_id: party,
      name: child.sources[0]!.party_name,
      currency: source.currency,
      gross: native(totals.gross),
      allocated: native(decimalText(allocated, 2)),
      discount: native(decimalText(discount, 2)),
      withholding: native(decimalText(decimal(totals.wht, 2) + decimal(totals.additional_wht, 2), 2)),
      advance: native(totals.unallocated),
      net: native(totals.net),
    });
    if (discount) {
      add(
        await account(input.discount_account_id, "revenue", "settlement discount"),
        -discount,
        `${source.code} settlement discount`,
      );
      add(bank.account_id, discount, `${source.code} discount reduces cash`);
    }
    const advance = decimal(totals.unallocated, 2);
    if (advance) {
      if (input.advance_monetary === undefined)
        fail("Classify the supplier advance as refundable monetary or a nonmonetary goods/services prepayment.");
      const advanceAccount = await account(input.advance_account_id, "asset", "supplier advance");
      merge(
        await preview(
          {
            company_id: input.company_id,
            date: input.date,
            reference: source.code,
            reason: input.reason,
            type: "recognition",
            side: "payable",
            party_id: party,
            kind: "advance",
            currency: source.currency,
            amount: native(totals.unallocated),
            due_date: input.date,
            monetary: input.advance_monetary,
            bank_account_id: details.bank_account_id,
            counter_account_id: advanceAccount,
          },
          `${id}:advance:${index}`,
          `${code}/ADV${index + 1}`,
        ),
      );
    }
    const taxes = [
      { amount: totals.wht, definition: input.tax_definition_id },
      { amount: totals.additional_wht, definition: input.additional_tax_definition_id },
    ];
    for (const expected of taxes) {
      if (decimal(expected.amount, 2) === 0n) continue;
      if (!expected.definition)
        fail(
          "Select a governed settlement withholding definition matching the entered amount; percentages alone cannot post tax.",
        );
      for (const allocation of allocations) {
        if (
          (
            await client.query(
              `select 1 from finance_subledger_item i join finance_subledger_operation o on o.tenant_id=i.tenant_id and o.company_id=i.company_id and o.id=i.operation_id where i.tenant_id=$1 and i.company_id=$2 and i.id=$3 and exists(select 1 from jsonb_array_elements(coalesce(o.preview->'taxes','[]'::jsonb)) t where t->>'treatment'='withholding' and t->>'trigger'='recognition')`,
              [context.tenantId, input.company_id, allocation.item_id],
            )
          ).rowCount
        )
          fail("This Bill already withheld tax at recognition; correct the instruction before settling it.");
      }
      const tax = await resolveTax(client, {
        tenant: context.tenantId,
        company: input.company_id,
        definition: expected.definition,
        date: input.date,
        module: "purchases",
        trigger: "settlement",
        currency: source.currency,
        precision: scale,
        basis: native(entry.amount),
      });
      if (tax.treatment !== "withholding" || decimal(tax.amount, 8) !== decimal(expected.amount, 8))
        fail("The governed tax definition does not match the instruction's exact withholding amount.");
      tax.source_item_id = `purchase:${createHash("sha256").update(`${source.id}:${entry.supplier_id}:${expected.definition}`).digest("hex")}`;
      result!.taxes.push(tax);
      add(tax.account_id, -decimal(expected.amount, 2), `${source.code} governed withholding`);
      add(bank.account_id, decimal(expected.amount, 2), `${source.code} withholding reduces cash`);
    }
    cash += decimal(native(totals.net), scale);
  }
  if (!result) fail("No supplier payment entries were found.");
  const fee = decimal(native(input.bank_fee), scale);
  if (fee) {
    // Reuse the configured fee account from the settlement preview, without a
    // second Bank voucher. One preview with an explicit fee resolves that policy.
    const first = result.lines.find((line) => line.description.includes("bank settlement"));
    if (!first) fail("Bank settlement evidence is unavailable.");
    const policy = (
      await client.query<{ expense_account_id: string }>(
        "select expense_account_id from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
        [context.tenantId, input.company_id],
      )
    ).rows[0]!;
    addNative(policy.expense_account_id, fee, `${source.code} bank fee`);
  }
  cash += fee;
  const balance = (
    await client.query<{ balance: string }>(
      `select coalesce(sum(l.debit-l.credit),0)::text as balance from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id where j.tenant_id=$1 and j.company_id=$2 and l.account_id=$3 and l.currency=$4 and j.status in ('posted','reversed')`,
      [context.tenantId, input.company_id, bank.account_id, bank.currency],
    )
  ).rows[0]!.balance;
  if (decimal(balance, 8, true) - decimal(decimalText(cash, scale), 8) < -decimal(bank.overdraft_limit, 8))
    fail("The entire payment group exceeds the Bank balance and approved overdraft.");
  // Coalesce Bank components before posting: the journal contains one native
  // credit, avoiding independent rounding of discount/withholding cash pieces.
  result.lines = result.lines.filter((line) => line.accountId !== bank.account_id);
  addNative(bank.account_id, -cash, `${source.code} Purchase payment`);
  // Preserve the exact shared conversion rounding after combining native cash.
  const base = result.base_decimal_places;
  const residual = result.lines.reduce(
    (sum, line) =>
      sum +
      convertMinor(
        decimal(line.debit, line.currency === source.currency ? scale : base) -
          decimal(line.credit, line.currency === source.currency ? scale : base),
        line.currency === source.currency ? scale : base,
        line.exchangeRateValue,
        base,
      ),
    0n,
  );
  if (residual) {
    const policy = (
      await client.query<{ expense_account_id: string }>(
        "select expense_account_id from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
        [context.tenantId, input.company_id],
      )
    ).rows[0]!;
    result.lines.push({
      accountId: policy.expense_account_id,
      debit: decimalText(residual < 0n ? -residual : 0n, base),
      credit: decimalText(residual > 0n ? residual : 0n, base),
      currency: result.base_currency,
      exchangeRateId: null,
      exchangeRateValue: "1",
      exchangeRateDate: null,
      dimensions: {},
      description: `${code} grouped conversion rounding`,
    });
    result.rounding = decimalText(decimal(result.rounding, base, true) + residual, base);
  }
  return result;
}
