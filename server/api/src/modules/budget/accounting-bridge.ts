import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  purchaseDocumentSchema,
  purchaseTotals,
  budgetQuerySchema,
  budgetDimensionsSchema,
  budgetPoolMatches,
  budgetDimensionKey,
  decimal,
  decimalText,
  convertMinor,
  divideRounded,
  type BudgetDimensions,
} from "@nexora/contracts";
import { resolveCompanyCurrencyAuthority } from "../finance/currencies/company-authority.js";
import { budgetHash, budgetReject, lockBudget, type BudgetClient } from "./transaction.js";
import { loadBudgetPolicy, loadBudgetReport } from "./reporting.js";

const sourceSchema = purchaseDocumentSchema.pick({
  id: true,
  company_id: true,
  kind: true,
  state: true,
  version: true,
  source_id: true,
  currency: true,
  document_date: true,
  bill_date: true,
  due_date: true,
  lines: true,
  discount_amount: true,
  additional_charges: true,
});
type Source = z.infer<typeof sourceSchema>;
async function source(c: BudgetClient, t: string, company: string, id: string): Promise<Source> {
  const row = (
    await c.query(
      `select id,company_id,kind,state,row_version as version,source_id,currency,document_date::text,bill_date::text,due_date::text,lines,discount_amount::text,additional_charges
  from procurement_document where tenant_id=$1 and company_id=$2 and id=$3`,
      [t, company, id],
    )
  ).rows[0];
  if (!row) budgetReject("The purchase commitment source was not found.", "BUDGET_SOURCE_MISSING", 409);
  return sourceSchema.parse(row);
}
export async function budgetInstalled(c: BudgetClient) {
  return (
    (await c.query<{ installed: boolean }>("select to_regclass('public.budget_commitment') is not null as installed"))
      .rows[0]?.installed === true
  );
}
/** Resolve actual approved line provenance; document totals never release a commitment. */
async function root(
  c: BudgetClient,
  t: string,
  company: string,
  document: Source,
  lineId: string,
  charge: boolean,
): Promise<{ document: Source; lineId: string }> {
  const seen = new Set<string>();
  let current = document,
    currentLine = lineId;
  for (let depth = 0; depth < 16; depth++) {
    if (seen.has(current.id)) budgetReject("Purchase source lineage contains a cycle.", "BUDGET_SOURCE_INVALID", 409);
    seen.add(current.id);
    if (current.kind === "order" || !current.source_id) return { document: current, lineId: currentLine };
    const item = charge
      ? current.additional_charges?.find((l) => l.id === currentLine)
      : current.lines.find((l) => l.id === currentLine);
    const parentLine =
      item &&
      ("source_charge_id" in item ? item.source_charge_id : "source_line_id" in item ? item.source_line_id : null);
    if (!parentLine) return { document: current, lineId: currentLine };
    current = await source(c, t, company, current.source_id);
    currentLine = parentLine;
  }
  budgetReject("Purchase source lineage exceeds the supported depth.", "BUDGET_SOURCE_INVALID", 409);
}
type Exposure = {
  id: string;
  account: string;
  dimensions: BudgetDimensions;
  period: string;
  native: string;
  base: string;
  currency: string;
  rate: string;
  rateId: string | null;
};
async function exposures(c: BudgetClient, t: string, company: string, d: Source): Promise<Exposure[]> {
  const totals = purchaseTotals(d.lines, d),
    result: Exposure[] = [];
  const fallback = (
    await c.query<{ expense_account_id: string }>(
      "select expense_account_id from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
      [t, company],
    )
  ).rows[0]?.expense_account_id;
  const authority = await resolveCompanyCurrencyAuthority(c, {
    tenantId: t,
    companyId: company,
    sourceCurrency: d.currency,
    effectiveOnOrBefore: d.document_date,
  });
  for (const [charge, items] of [
    [false, d.lines],
    [true, d.additional_charges ?? []],
  ] as const) {
    for (const [index, line] of items.entries()) {
      if (!line.id) budgetReject("Every controlled purchase line requires a stable identity.");
      const ancestry = await root(c, t, company, d, line.id, charge);
      if (d.kind === "bill" && ancestry.document.kind === "order") continue;
      const category =
        "asset_category_id" in line && line.asset_category_id
          ? (
              await c.query<{ asset_account_id: string }>(
                "select asset_account_id from fixed_asset_category where tenant_id=$1 and company_id=$2 and id=$3 and active",
                [t, company, line.asset_category_id],
              )
            ).rows[0]?.asset_account_id
          : undefined;
      const account = line.nominal_account_id ?? category ?? fallback;
      const posting = account
        ? (
            await c.query<{ type: string }>(
              "select type from account where tenant_id=$1 and company_id=$2 and id=$3 and status='active' and not is_header and not reconciliation_required",
              [t, company, account],
            )
          ).rows[0]
        : undefined;
      if (!account || !posting || !["expense", "asset"].includes(posting.type))
        budgetReject(
          "Map each controlled purchase line to an active expense/acquisition nominal.",
          "BUDGET_MAPPING_REQUIRED",
          409,
        );
      const period = (
        await c.query<{ id: string }>(
          `select id from financial_period where tenant_id=$1 and company_id=$2 and
    ${line.budget_period_id ? "id=$3" : "period_start<=$3::date and period_end>=$3::date"} order by period_start limit 1`,
          [t, company, line.budget_period_id ?? d.due_date ?? d.document_date],
        )
      ).rows[0];
      if (!period)
        budgetReject("Configure the expected spending period for this purchase.", "BUDGET_PERIOD_REQUIRED", 409);
      const native = (charge ? totals.charges[index] : totals.lines[index])!.net;
      if (!decimal(native, 8)) continue;
      // Source net excludes recoverable tax; its separate GL asset remains separately visible.
      const base = convertMinor(decimal(native, 8), 8, authority.rateValue, authority.baseDecimalPlaces);
      result.push({
        id: line.id,
        account,
        dimensions: budgetDimensionsSchema.parse(line.dimensions ?? {}),
        period: period.id,
        native,
        base: decimalText(base, authority.baseDecimalPlaces),
        currency: d.currency,
        rate: authority.rateValue,
        rateId: authority.rateId,
      });
    }
  }
  return result;
}
async function assertPolicy(
  c: BudgetClient,
  t: string,
  company: string,
  date: string,
  period: string,
  account: string,
  dimensions: BudgetDimensions,
  additional: bigint,
  sourceId?: string,
) {
  const calendar = (
    await c.query<{ fiscal_calendar_id: string }>(
      "select fiscal_calendar_id from financial_period where tenant_id=$1 and company_id=$2 and id=$3",
      [t, company, period],
    )
  ).rows[0]?.fiscal_calendar_id;
  const policy = await loadBudgetPolicy(c, t, company, calendar, date);
  if (!policy?.enabled) return;
  const report = await loadBudgetReport(
    c,
    t,
    company,
    budgetQuerySchema.parse({
      company_id: company,
      version_id: policy.control_version_id,
      period_id: period,
      account_id: account,
      as_of: date,
      limit: 100,
    }),
    true,
  );
  if (!report.complete)
    budgetReject(
      "Existing purchase exposure requires reconciliation before budget checks can complete.",
      "BUDGET_RECONCILIATION_REQUIRED",
      409,
    );
  const matching = report.rows.filter((r) => !r.unbudgeted && budgetPoolMatches(r.dimensions, dimensions));
  if (matching.length > 1) budgetReject("Budget control pools overlap.", "BUDGET_POOL_OVERLAP", 409);
  const available = matching[0]
    ? decimal(matching[0].available, 8, true)
    : report.rows
        .filter((r) => r.unbudgeted && budgetDimensionKey(r.dimensions) === budgetDimensionKey(dimensions))
        .reduce((sum, r) => sum + decimal(r.available, 8, true), 0n);
  if (available >= additional) {
    const basis = matching[0] ? decimal(matching[0].budget, 8, true) + decimal(matching[0].transfers, 8, true) : 0n;
    if (basis > 0n && (basis - available + additional) * 1000000n >= basis * decimal(policy.warn_percent, 4))
      return `Budget utilization has reached the ${policy.warn_percent}% warning threshold.`;
    return;
  }
  if (policy.mode === "warning")
    return "Budget warning: this source exceeds its available allocation. The configured warning policy permits it to proceed.";
  if (policy.mode === "approval" && sourceId) {
    const snapshot = (
      await c.query(
        "select row_version,to_jsonb(d) as snapshot from procurement_document d where tenant_id=$1 and company_id=$2 and id=$3",
        [t, company, sourceId],
      )
    ).rows[0];
    if (
      snapshot &&
      (
        await c.query(
          `select 1 from budget_request where tenant_id=$1 and company_id=$2 and kind='exception' and state='approved'
   and payload->>'source_document_id'=$3 and (payload->>'source_version')::integer=$4 and payload->>'source_hash'=$5 and payload->>'policy_id'=$6`,
          [t, company, sourceId, snapshot.row_version, budgetHash(snapshot.snapshot), policy.id],
        )
      ).rowCount
    )
      return;
  }
  budgetReject(
    policy.mode === "approval"
      ? "An independent, current Budget exception is required before this source can proceed."
      : "The source exceeds its available budget. Revise or transfer budget before proceeding.",
    policy.mode === "approval" ? "BUDGET_APPROVAL_REQUIRED" : "BUDGET_EXCEEDED",
    409,
  );
}
/** Called inside the owning purchase approval transaction, before its state changes. */
export async function reserveBudgetPurchase(
  c: BudgetClient,
  t: string,
  company: string,
  id: string,
  actor: string,
  reconcile = false,
) {
  if (!(await budgetInstalled(c))) return [];
  await lockBudget(c, t, company);
  const d = await source(c, t, company, id);
  if (!["order", "bill"].includes(d.kind)) return [];
  const today = (await c.query<{ date: string }>("select current_date::text as date")).rows[0]!.date;
  const calendars = (
    await c.query<{ fiscal_calendar_id: string }>(
      "select distinct fiscal_calendar_id from financial_period where tenant_id=$1 and company_id=$2 and ((coalesce($3::date,$4::date) between period_start and period_end) or id=any($5::text[]))",
      [
        t,
        company,
        d.due_date,
        d.document_date,
        [...d.lines, ...(d.additional_charges ?? [])].flatMap((line) =>
          line.budget_period_id ? [line.budget_period_id] : [],
        ),
      ],
    )
  ).rows;
  const policies = [];
  for (const calendar of calendars)
    policies.push(await loadBudgetPolicy(c, t, company, calendar.fiscal_calendar_id, today));
  const enabled = policies.some((policy) => policy?.enabled);
  let entries: Exposure[];
  try {
    entries = await exposures(c, t, company, d);
  } catch (error) {
    if (enabled || reconcile) throw error;
    return [];
  }
  const warnings: string[] = [];
  for (const entry of entries) {
    if (
      (
        await c.query(
          "select 1 from budget_commitment where tenant_id=$1 and company_id=$2 and source_document_id=$3 and source_line_id=$4",
          [t, company, id, entry.id],
        )
      ).rowCount
    )
      continue;
    if (!reconcile) {
      const warning = await assertPolicy(
        c,
        t,
        company,
        today,
        entry.period,
        entry.account,
        entry.dimensions,
        decimal(entry.base, 8),
        id,
      );
      if (warning) warnings.push(warning);
    }
    await c.query(
      `insert into budget_commitment(tenant_id,company_id,id,source_document_id,source_line_id,account_id,dimensions,period_id,reserved_base,reserved_native,currency,rate,rate_id,source_version,created_by,commitment_date)
   values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [
        t,
        company,
        randomUUID(),
        id,
        entry.id,
        entry.account,
        JSON.stringify(entry.dimensions),
        entry.period,
        entry.base,
        entry.native,
        entry.currency,
        entry.rate,
        entry.rateId,
        d.state === "approved" ? d.version : d.version + 1,
        actor,
        d.document_date,
      ],
    );
  }
  return [...new Set(warnings)];
}
export type BudgetPosting = {
  tenantId: string;
  companyId: string;
  actorId: string;
  journalId: string;
  postingDate: string;
  sourceType: string;
  sourceId: string;
  originalJournalId?: string;
};
/** Called by the shared GL posting boundary in the SAME database transaction. */
export async function applyBudgetPosting(c: BudgetClient, input: BudgetPosting, enforcePolicy = true) {
  if (!(await budgetInstalled(c))) return;
  const { tenantId: t, companyId: company, journalId: journal, postingDate: date, actorId: actor } = input;
  await lockBudget(c, t, company);
  if (input.originalJournalId) {
    const entries = (
      await c.query<{
        commitment_id: string;
        base_delta: string;
        native_delta: string;
        source_document_id: string;
        source_line_id: string;
      }>(
        "select commitment_id,base_delta::text,native_delta::text,source_document_id,source_line_id from budget_commitment_event where tenant_id=$1 and company_id=$2 and journal_id=$3 and kind='recognize'",
        [t, company, input.originalJournalId],
      )
    ).rows;
    for (const e of entries)
      await c.query(
        "insert into budget_commitment_event(tenant_id,company_id,id,commitment_id,kind,base_delta,native_delta,journal_id,source_document_id,source_line_id,event_date,actor_id) values($1,$2,$3,$4,'reverse',$5,$6,$7,$8,$9,$10,$11)",
        [
          t,
          company,
          randomUUID(),
          e.commitment_id,
          decimalText(-decimal(e.base_delta, 8, true), 8),
          decimalText(-decimal(e.native_delta, 8, true), 8),
          journal,
          e.source_document_id,
          e.source_line_id,
          date,
          actor,
        ],
      );
    return; // Reversals restore exposure and must not be blocked by an unrelated later policy.
  }
  let sourceId: string | undefined;
  if (input.sourceType === "currency_subledger") {
    const operation = (
      await c.query<{ payload: { source_document_id?: string }; type: string }>(
        "select type,payload from finance_subledger_operation where tenant_id=$1 and company_id=$2 and id=$3",
        [t, company, input.sourceId],
      )
    ).rows[0];
    if (operation?.type === "recognition") sourceId = operation.payload.source_document_id;
  }
  if (sourceId) {
    const d = await source(c, t, company, sourceId),
      totals = purchaseTotals(d.lines, d);
    for (const [charge, items] of [
      [false, d.lines],
      [true, d.additional_charges ?? []],
    ] as const) {
      for (const [index, line] of items.entries()) {
        if (!line.id)
          budgetReject("Purchase recognition requires stable line identities.", "BUDGET_MAPPING_REQUIRED", 409);
        const ancestry = await root(c, t, company, d, line.id, charge);
        // A standalone bill owns its reservation; order-linked bills consume their order.
        const rootDocument = ancestry.document.kind === "order" ? ancestry.document.id : d.id,
          rootLine = ancestry.document.kind === "order" ? ancestry.lineId : line.id;
        const commitment = (
          await c.query<{
            id: string;
            account_id: string;
            reserved_base: string;
            reserved_native: string;
            remaining: string;
            native_remaining: string;
          }>(
            `select c.id,c.account_id,c.reserved_base::text,c.reserved_native::text,
    (c.reserved_base-coalesce(sum(e.base_delta),0))::text as remaining,(c.reserved_native-coalesce(sum(e.native_delta),0))::text as native_remaining
    from budget_commitment c left join budget_commitment_event e on e.tenant_id=c.tenant_id and e.company_id=c.company_id and e.commitment_id=c.id
    where c.tenant_id=$1 and c.company_id=$2 and c.source_document_id=$3 and c.source_line_id=$4 group by c.tenant_id,c.company_id,c.id`,
            [t, company, rootDocument, rootLine],
          )
        ).rows[0];
        if (!commitment) continue;
        const journalLine = (
          await c.query<{ native: string; dimensions: BudgetDimensions }>(
            `select (debit-credit)::text as native,dimensions from journal_line where tenant_id=$1 and journal_id=$2 and dimensions->>$3=$4`,
            [t, journal, charge ? "purchase_charge_id" : "purchase_line_id", line.id],
          )
        ).rows;
        const native = decimal((charge ? totals.charges[index] : totals.lines[index])!.net, 8);
        if (!native) continue;
        if (journalLine.length !== 1 || decimal(journalLine[0]!.native, 8, true) !== native)
          budgetReject(
            "The posted expense line no longer matches its reserved purchase nominal/amount.",
            "BUDGET_RECOGNITION_MISMATCH",
            409,
          );
        const remaining = decimal(commitment.native_remaining, 8, true);
        if (native > remaining)
          budgetReject("Recognition exceeds the unrecognized purchase commitment.", "BUDGET_RECOGNITION_EXCEEDED", 409);
        const base =
          native === remaining
            ? decimal(commitment.remaining, 8, true)
            : divideRounded(decimal(commitment.reserved_base, 8) * native, decimal(commitment.reserved_native, 8));
        await c.query(
          "insert into budget_commitment_event(tenant_id,company_id,id,commitment_id,kind,base_delta,native_delta,journal_id,source_document_id,source_line_id,event_date,actor_id) values($1,$2,$3,$4,'recognize',$5,$6,$7,$8,$9,$10,$11)",
          [
            t,
            company,
            randomUUID(),
            commitment.id,
            decimalText(base, 8),
            decimalText(native, 8),
            journal,
            d.id,
            line.id,
            date,
            actor,
          ],
        );
      }
    }
  }
  // Reconciliation records historical authorization; it must not re-approve old spending.
  if (!enforcePolicy) return;
  const lines = (
    await c.query<{ account_id: string; dimensions: Record<string, string>; amount: string; period_id: string }>(
      `select l.account_id,l.dimensions,sum(l.base_debit-l.base_credit)::text as amount,j.period_id
  from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
  where l.tenant_id=$1 and j.company_id=$2 and l.journal_id=$3 and a.type in ('expense','asset') and not a.reconciliation_required
  and not exists(select 1 from finance_subledger_policy p where p.tenant_id=a.tenant_id and p.company_id=a.company_id and a.id in(p.receivable_account_id,p.payable_account_id))
  and not exists(select 1 from finance_tax_mapping_rule m where m.tenant_id=a.tenant_id and m.company_id=a.company_id and m.account_id=a.id and m.treatment='recoverable')
  group by l.account_id,l.dimensions,j.period_id`,
      [t, company, journal],
    )
  ).rows;
  for (const line of lines) {
    if (decimal(line.amount, 8, true) <= 0n) continue;
    const raw = line.dimensions,
      dimensions = Object.fromEntries(
        Object.entries({
          department: raw.department ?? raw.department_id,
          project: raw.project ?? raw.project_id,
          cost_centre: raw.cost_centre ?? raw.cost_center ?? raw.cost_center_id,
          branch: raw.branch ?? raw.branch_id,
        }).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
      );
    const releases = (
      await c.query<{ amount: string; dimensions: BudgetDimensions }>(
        `select e.base_delta::text as amount,c.dimensions from budget_commitment_event e join budget_commitment c on c.tenant_id=e.tenant_id and c.company_id=e.company_id and c.id=e.commitment_id
   where e.tenant_id=$1 and e.company_id=$2 and e.journal_id=$3 and e.kind='recognize' and c.account_id=$4 and c.period_id=$5`,
        [t, company, journal, line.account_id, line.period_id],
      )
    ).rows;
    const released = releases
      .filter((r) => budgetDimensionKey(r.dimensions) === budgetDimensionKey(dimensions))
      .reduce((sum, r) => sum + decimal(r.amount, 8), 0n);
    if (released > 0n && decimal(line.amount, 8, true) <= released) continue;
    // Current journal and commitment releases are already visible in this transaction.
    await assertPolicy(
      c,
      t,
      company,
      date,
      line.period_id,
      line.account_id,
      budgetDimensionsSchema.parse(dimensions),
      0n,
      sourceId,
    );
  }
}

export async function reconcileBudgetPurchases(c: BudgetClient, t: string, company: string, actor: string) {
  await lockBudget(c, t, company);
  const docs = (
    await c.query<{ id: string }>(
      "select id from procurement_document where tenant_id=$1 and company_id=$2 and state='approved' and kind in ('order','bill') order by document_date,case kind when 'order' then 0 else 1 end,id limit 2001",
      [t, company],
    )
  ).rows;
  if (docs.length > 2000)
    budgetReject(
      "Interactive reconciliation supports 2,000 purchase documents. Reconcile larger legacy datasets in a scoped migration before enabling controls.",
    );
  for (const d of docs) await reserveBudgetPurchase(c, t, company, d.id, actor, true);
  const postings = (
    await c.query<{ id: string; journal_id: string; operation_date: string; original_journal_id: string | null }>(
      `select o.id,j.id as journal_id,j.posting_date::text as operation_date,j.reverses_journal_id as original_journal_id
       from journal_entry j join finance_subledger_operation o on o.tenant_id=j.tenant_id and o.company_id=j.company_id
        and o.journal_id=coalesce(j.reverses_journal_id,j.id)
       where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and o.state='posted'
        and o.type='recognition' and o.payload->>'source_document_id' is not null
       order by j.posted_at,j.created_at,case when j.reverses_journal_id is null then 0 else 1 end,j.id limit 2001`,
      [t, company],
    )
  ).rows;
  if (postings.length > 2000)
    budgetReject(
      "Interactive reconciliation supports 2,000 recognition/reversal journals. Reconcile larger legacy datasets in a scoped migration before enabling controls.",
    );
  for (const op of postings) {
    if (
      !(
        await c.query("select 1 from budget_commitment_event where tenant_id=$1 and company_id=$2 and journal_id=$3", [
          t,
          company,
          op.journal_id,
        ])
      ).rowCount
    )
      await applyBudgetPosting(
        c,
        {
          tenantId: t,
          companyId: company,
          actorId: actor,
          journalId: op.journal_id,
          postingDate: op.operation_date,
          sourceType: "currency_subledger",
          sourceId: op.id,
          ...(op.original_journal_id ? { originalJournalId: op.original_journal_id } : {}),
        },
        false,
      );
  }
  return { documents: docs.length, journals: postings.length };
}
