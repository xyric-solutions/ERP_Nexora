import {
  decimal,
  decimalText,
  divideRounded,
  subledgerReportSchema,
  type SubledgerReport,
  type SubledgerReportQuery,
} from "@nexora/contracts";
import type { BankingActorContext } from "../../banking/source-repository.js";
import { resolveCompanyBaseCurrency, resolveCompanyCurrencyAuthority } from "../currencies/company-authority.js";
import { SourceSubledgerRepository, reject } from "./source-repository.js";
import { itemBalancesSql, itemBalanceParameters } from "./queries.js";

type ReportRow = SubledgerReport["rows"][number];
const fromDb = (value: string, scale: number) => decimal(value, 8, true) / 10n ** BigInt(8 - scale);

/** Dated reports read immutable journal/open-item events, including original reversed journals. */
export class SubledgerReports {
  constructor(private readonly repository: SourceSubledgerRepository) {}
  async run(context: BankingActorContext, query: SubledgerReportQuery): Promise<SubledgerReport> {
    return this.repository.transaction(context, query.company_id, "finance.subledger.report", false, async (client) => {
      if (query.from && query.from > query.as_of) reject("The report start date must be on or before its end date.");
      if (!["statement", "fx"].includes(query.report) && (query.party_id || query.side || query.currency))
        reject(
          "Company financial statements and the general ledger include all parties and original currencies. Use a statement or FX report for party/currency filters.",
          "REPORT_SCOPE_INVALID",
          400,
        );
      const base = await resolveCompanyBaseCurrency(client, context.tenantId, query.company_id, false);
      const presentation = query.presentation_currency ?? base.code;
      const closing = await resolveCompanyCurrencyAuthority(client, {
        tenantId: context.tenantId,
        companyId: query.company_id,
        sourceCurrency: presentation,
        effectiveOnOrBefore: query.as_of,
        lock: false,
      });
      const pScale = closing.sourceDecimalPlaces;
      const rateCache = new Map<string, typeof closing>([[query.as_of, closing]]);
      const translate = async (amount: bigint, date: string) => {
        let rate = rateCache.get(date);
        if (!rate) {
          rate = await resolveCompanyCurrencyAuthority(client, {
            tenantId: context.tenantId,
            companyId: query.company_id,
            sourceCurrency: presentation,
            effectiveOnOrBefore: date,
            lock: false,
          });
          rateCache.set(date, rate);
        }
        return {
          value: divideRounded(
            amount * 10n ** BigInt(pScale + 18),
            decimal(rate.rateValue, 18) * 10n ** BigInt(base.decimalPlaces),
          ),
          rate: rate.rateValue,
        };
      };
      let rows: ReportRow[] = [];
      let debit = 0n,
        credit = 0n,
        balance = 0n,
        presentationTotal = 0n,
        translationDifference = 0n;
      const text = (amount: bigint) => decimalText(amount, base.decimalPlaces);
      const pText = (amount: bigint) => decimalText(amount, pScale);
      if (query.report === "fx") {
        const movements = (
          await client.query<{
            id: string;
            code: string;
            date: string;
            type: string;
            journal_id: string;
            realized: string;
            unrealized: string;
          }>(
            `select o.id,o.code,o.operation_date::text as date,o.type,o.journal_id,
          sum(fx.realized)::text as realized,sum(fx.unrealized)::text as unrealized from finance_subledger_operation o
          cross join lateral jsonb_to_recordset(o.preview->'fx_by_item') as fx(item_id text,realized numeric,unrealized numeric)
          join finance_subledger_item i on i.tenant_id=o.tenant_id and i.company_id=o.company_id and i.id=fx.item_id
          where o.tenant_id=$1 and o.company_id=$2 and o.state='posted' and o.operation_date<=$3::date
          and ($7::date is null or o.operation_date>=$7::date)
          and ($4::text is null or i.party_id=$4) and ($5::text is null or i.side=$5) and ($6::text is null or i.currency=$6)
          group by o.tenant_id,o.company_id,o.id
          order by o.operation_date,o.created_at,o.id limit 100001`,
            [
              context.tenantId,
              query.company_id,
              query.as_of,
              query.party_id ?? null,
              query.side ?? null,
              query.currency ?? null,
              query.from ?? null,
            ],
          )
        ).rows;
        if (movements.length > 100000)
          reject("Narrow the report date or party range before running this report.", "REPORT_RANGE_TOO_LARGE", 422);
        for (const operation of movements) {
          for (const category of ["realized", "unrealized"] as const) {
            const value = decimal(operation[category], base.decimalPlaces, true);
            if (!value) continue;
            const translated = await translate(value, query.as_of);
            balance += value;
            presentationTotal += translated.value;
            credit += value > 0n ? value : 0n;
            debit += value < 0n ? -value : 0n;
            rows.push({
              id: `${operation.id}-${category}`,
              date: operation.date,
              code: operation.code,
              name: `${category} exchange ${value >= 0n ? "gain" : "loss"}`,
              type: category,
              currency: base.code,
              original: text(value),
              debit: text(value < 0n ? -value : 0n),
              credit: text(value > 0n ? value : 0n),
              balance: text(value),
              presentation_balance: pText(translated.value),
              rate: translated.rate,
              journal_id: operation.journal_id,
            });
          }
        }
      } else if (query.report === "statement") {
        const events = (
          await client.query<{
            id: string;
            date: string;
            code: string;
            name: string;
            side: string;
            currency: string;
            foreign: string;
            base: string;
            kind: string;
            journal_id: string;
            rate: string;
            party_id: string;
            decimal_places: number;
          }>(
            `select e.id,e.event_date::text as date,o.code,p.name,i.side,i.currency,i.party_id,i.decimal_places,e.foreign_delta::text as foreign,e.base_delta::text as base,o.type as kind,e.journal_id,i.rate::text
          from finance_subledger_item_event e join finance_subledger_item i on i.tenant_id=e.tenant_id and i.company_id=e.company_id and i.id=e.item_id
          join finance_subledger_operation o on o.tenant_id=e.tenant_id and o.company_id=e.company_id and o.id=e.operation_id
          join finance_subledger_party p on p.tenant_id=i.tenant_id and p.company_id=i.company_id and p.id=i.party_id
          where e.tenant_id=$1 and e.company_id=$2 and e.event_date<=$3::date and ($4::text is null or i.party_id=$4)
            and ($5::text is null or i.side=$5) and ($6::text is null or i.currency=$6)
            order by e.event_date,e.created_at,e.id limit 100001`,
            [
              context.tenantId,
              query.company_id,
              query.as_of,
              query.party_id ?? null,
              query.side ?? null,
              query.currency ?? null,
            ],
          )
        ).rows;
        if (events.length > 100000)
          reject(
            "Narrow the statement by party or currency before running this report.",
            "REPORT_RANGE_TOO_LARGE",
            422,
          );
        const running = new Map<string, bigint>();
        for (const event of events) {
          const value = fromDb(event.base, base.decimalPlaces);
          const accounting = value * (event.side === "receivable" ? 1n : -1n);
          const partyBalance = (running.get(event.party_id) ?? 0n) + value;
          running.set(event.party_id, partyBalance);
          balance += value;
          if (query.from && event.date < query.from) continue;
          const translated = await translate(partyBalance, query.as_of);
          debit += accounting > 0n ? accounting : 0n;
          credit += accounting < 0n ? -accounting : 0n;
          rows.push({
            id: event.id,
            date: event.date,
            code: event.code,
            name: event.name,
            type: event.kind,
            currency: event.currency,
            original: decimalText(fromDb(event.foreign, event.decimal_places), event.decimal_places),
            debit: text(accounting > 0n ? accounting : 0n),
            credit: text(accounting < 0n ? -accounting : 0n),
            balance: text(partyBalance),
            presentation_balance: pText(translated.value),
            rate: translated.rate,
            journal_id: event.journal_id,
          });
        }
        for (const partyBalance of running.values())
          presentationTotal += (await translate(partyBalance, query.as_of)).value;
      } else {
        const period = (
          await client.query<{ start: string }>(
            `select min(p.period_start)::text as start from financial_period p where p.tenant_id=$1 and p.company_id=$2
          and p.fiscal_calendar_id=(select fiscal_calendar_id from financial_period where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end limit 1)`,
            [context.tenantId, query.company_id, query.as_of],
          )
        ).rows[0];
        const start = query.from ?? period?.start ?? `${query.as_of.slice(0, 4)}-01-01`;
        const dateGroup = `case when $4='trial_balance' or ($4='balance_sheet' and a.type in ('asset','liability')) then $3::date else j.posting_date end`;
        const journals = (
          await client.query<{
            id: string;
            date: string;
            code: string;
            name: string;
            type: string;
            currency: string;
            original: string;
            debit: string;
            credit: string;
            journal_id: string;
            account_id: string;
            original_scale: number;
          }>(
            `select min(l.id) as id,(${dateGroup})::text as date,a.code,a.name,a.type,l.currency,sum(l.debit-l.credit)::text as original,sum(l.base_debit)::text as debit,sum(l.base_credit)::text as credit,min(j.id) as journal_id,a.id as account_id,coalesce(min(standard.decimal_places),8)::integer as original_scale
          from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id join account a on a.tenant_id=l.tenant_id and a.company_id=j.company_id and a.id=l.account_id
          left join currency standard on standard.tenant_id=l.tenant_id and standard.code=l.currency
          where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<=$3::date
          and ($4<>'profit_loss' or (a.type in ('revenue','expense') and j.posting_date>=$5::date))
          and ($4<>'general_ledger' or j.posting_date>=$5::date)
          group by a.id,a.code,a.name,a.type,l.currency,${dateGroup},(case when $4='general_ledger' then l.id else null end)
          order by (${dateGroup}),a.code,min(l.id) limit 100001`,
            [context.tenantId, query.company_id, query.as_of, query.report, start],
          )
        ).rows;
        if (journals.length > 100000)
          reject("Narrow the report date range before running this report.", "REPORT_RANGE_TOO_LARGE", 422);
        const grouped = new Map<
          string,
          { id: string; code: string; name: string; type: string; debit: bigint; credit: bigint; translated: bigint }
        >();
        const running = new Map<string, bigint>();
        if (query.report === "general_ledger") {
          const opening = (
            await client.query<{ account_id: string; balance: string }>(
              `select l.account_id,sum(l.base_debit-l.base_credit)::text as balance from journal_entry j
             join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id
             where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<$3::date group by l.account_id`,
              [context.tenantId, query.company_id, start],
            )
          ).rows;
          for (const row of opening) running.set(row.account_id, fromDb(row.balance, base.decimalPlaces));
        }
        for (const line of journals) {
          if (
            (query.report === "profit_loss" && (!["revenue", "expense"].includes(line.type) || line.date < start)) ||
            (query.report === "general_ledger" && line.date < start)
          )
            continue;
          const dr = fromDb(line.debit, base.decimalPlaces),
            cr = fromDb(line.credit, base.decimalPlaces),
            net = dr - cr;
          const financialTranslation =
            query.report === "profit_loss" ||
            (query.report === "balance_sheet" && ["equity", "revenue", "expense"].includes(line.type));
          const translated = await translate(net, financialTranslation ? line.date : query.as_of);
          if (query.report === "general_ledger") {
            const closingBalance = (running.get(line.account_id) ?? 0n) + net;
            running.set(line.account_id, closingBalance);
            const translatedClosing = await translate(closingBalance, query.as_of);
            rows.push({
              id: line.id,
              date: line.date,
              code: line.code,
              name: line.name,
              type: line.type,
              currency: line.currency,
              original: decimalText(fromDb(line.original, line.original_scale), line.original_scale),
              debit: text(dr),
              credit: text(cr),
              balance: text(closingBalance),
              presentation_balance: pText(translatedClosing.value),
              rate: translated.rate,
              journal_id: line.journal_id,
            });
          } else {
            const retained = query.report === "balance_sheet" && ["revenue", "expense"].includes(line.type);
            const key = retained ? "retained-earnings" : line.account_id;
            const group = grouped.get(key) ?? {
              id: key,
              code: retained ? "RETAINED" : line.code,
              name: retained ? "Accumulated earnings from posted income and expenses" : line.name,
              type: retained ? "equity" : line.type,
              debit: 0n,
              credit: 0n,
              translated: 0n,
            };
            group.debit += dr;
            group.credit += cr;
            group.translated += translated.value;
            grouped.set(key, group);
          }
          debit += dr;
          credit += cr;
          balance += net;
          presentationTotal += translated.value;
        }
        if (query.report !== "general_ledger")
          rows = [...grouped.values()].map((group) => ({
            id: group.id,
            date: null,
            code: group.code,
            name: group.name,
            type: group.type,
            currency: base.code,
            original: text(group.debit - group.credit),
            debit: text(group.debit),
            credit: text(group.credit),
            balance: text(group.debit - group.credit),
            presentation_balance: pText(group.translated),
            rate: null,
            journal_id: null,
          }));
        if (query.report === "balance_sheet" && presentation !== base.code) {
          translationDifference = -presentationTotal;
          rows.push({
            id: "currency-translation-reserve",
            date: query.as_of,
            code: "CTA",
            name: "Currency translation reserve",
            type: "equity",
            currency: base.code,
            original: text(0n),
            debit: text(0n),
            credit: text(0n),
            balance: text(0n),
            presentation_balance: pText(translationDifference),
            rate: null,
            journal_id: null,
          });
          presentationTotal += translationDifference;
        }
      }
      const reconciliation: SubledgerReport["reconciliation"] = [];
      const controlRows = (
        await client.query<{ id: string; carrying: string }>(
          `${itemBalancesSql} select control_account_id as id,sum(carrying*(case when side='receivable' then 1 else -1 end))::text as carrying from item_balances group by control_account_id`,
          itemBalanceParameters(context.tenantId, { company_id: query.company_id, as_of: query.as_of }),
        )
      ).rows;
      const controls = new Map(controlRows.map((row) => [row.id, fromDb(row.carrying, base.decimalPlaces)]));
      if (controls.size) {
        const ledger = (
          await client.query<{ id: string; value: string }>(
            `select l.account_id as id,sum(l.base_debit-l.base_credit)::text as value from journal_entry j join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id where j.tenant_id=$1 and j.company_id=$2 and j.status in ('posted','reversed') and j.posting_date<=$3::date and l.account_id=any($4::text[]) group by l.account_id`,
            [context.tenantId, query.company_id, query.as_of, [...controls.keys()]],
          )
        ).rows;
        for (const [account, expected] of controls) {
          const actual = fromDb(ledger.find((row) => row.id === account)?.value ?? "0", base.decimalPlaces);
          reconciliation.push({
            account_id: account,
            ledger_balance: text(actual),
            subledger_balance: text(expected),
            difference: text(actual - expected),
          });
        }
      }
      const method =
        presentation === base.code
          ? "Posted functional-currency amounts"
          : query.report === "balance_sheet"
            ? "Closing-rate assets/liabilities; historical equity and income; explicit translation reserve"
            : query.report === "profit_loss"
              ? "Transaction-date income and expense translation"
              : "Management convenience translation at the selected closing rate; not a translated financial statement";
      return subledgerReportSchema.parse({
        company_id: query.company_id,
        report: query.report,
        as_of: query.as_of,
        base_currency: base.code,
        presentation_currency: presentation,
        translation_method: method,
        rows: rows.slice(query.offset, query.offset + query.limit),
        total_rows: rows.length,
        debit: text(debit),
        credit: text(credit),
        balance: text(balance),
        presentation_balance: pText(presentationTotal),
        translation_difference: pText(translationDifference),
        reconciliation,
      });
    });
  }
}
