import type { Pool } from "pg";
import {
  changeFiscalPeriodsSchema,
  financialPeriodSchema,
  fiscalCalendarDetailSchema,
  type ChangeFiscalPeriods,
} from "@nexora/contracts";
import {
  calendarTransaction,
  calendarIdempotency,
  calendarAudit,
  requireCalendarPermission,
  FiscalCalendarError,
  type CalendarContext,
} from "../../master-data/fiscal-calendars/transaction.js";
import { loadFiscalCalendar, loadFiscalCalendarDetail } from "../../master-data/fiscal-calendars/source-repository.js";
export class SourceFinancePeriodRepository {
  constructor(private readonly pool: Pool) {}
  change(ctx: CalendarContext, calendarId: string, input: ChangeFiscalPeriods, key: string, correlation: string) {
    input = changeFiscalPeriodsSchema.parse(input);
    return calendarTransaction(
      this.pool,
      ctx,
      async (c) => {
        const permission = input.status === "open" ? "finance.period.reopen" : "finance.period.close";
        await requireCalendarPermission(c, ctx, input.company_id, permission);
        await requireCalendarPermission(c, ctx, input.company_id, "platform.fiscal_calendar.read");
        await requireCalendarPermission(c, ctx, input.company_id, "platform.accounting_period.read");
        // Recheck locked-reopen authority before returning an idempotent cached result too.
        if (input.confirm_locked_reopen) await requireCalendarPermission(c, ctx, input.company_id, permission, true);
        return calendarIdempotency(
          c,
          ctx,
          `/api/v1/finance/fiscal_calendars/${calendarId}/period_status`,
          input,
          key,
          (v) => fiscalCalendarDetailSchema.parse(v),
          async () => {
            const calendar = await loadFiscalCalendar(c, ctx, input.company_id, calendarId);
            if (calendar.status !== "active")
              throw new FiscalCalendarError(
                409,
                "CALENDAR_INACTIVE",
                "The parent fiscal calendar must be active. Closed years are not reopened implicitly.",
              );
            const periods = (
              await c.query(
                "select id,company_id,fiscal_calendar_id,period_number,period_start::text,period_end::text,status,row_version::integer as version from financial_period where tenant_id=$1 and company_id=$2 and fiscal_calendar_id=$3 and id=any($4::text[]) order by id for update",
                [ctx.tenantId, input.company_id, calendarId, input.periods.map((p) => p.id)],
              )
            ).rows.map((p) => financialPeriodSchema.parse(p));
            if (periods.length !== input.periods.length)
              throw new FiscalCalendarError(
                404,
                "PERIOD_NOT_FOUND",
                "Every selected period must belong to this company and fiscal year.",
              );
            for (const period of periods) {
              if (period.version !== input.periods.find((p) => p.id === period.id)!.expected_version)
                throw new FiscalCalendarError(
                  409,
                  "PERIOD_VERSION_CONFLICT",
                  "A period changed. Reload before continuing.",
                );
              if (period.period_start < calendar.period_start || period.period_end > calendar.period_end)
                throw new FiscalCalendarError(
                  409,
                  "PERIOD_BOUNDARIES_INVALID",
                  "The period does not fit the fiscal year.",
                );
              if (
                period.status === input.status ||
                (input.status === "closed" && period.status !== "soft_close") ||
                (input.status === "soft_close" && period.status !== "open")
              )
                throw new FiscalCalendarError(
                  409,
                  "PERIOD_TRANSITION_INVALID",
                  "Use Open → Soft Closed → Locked; reopening requires an explicit Open action.",
                );
              if (period.status === "closed") {
                if (!input.confirm_locked_reopen || !input.reason)
                  throw new FiscalCalendarError(
                    403,
                    "LOCKED_PERIOD_CONFIRMATION_REQUIRED",
                    "Reopening a locked period requires Super Admin confirmation and a reason.",
                  );
                await requireCalendarPermission(c, ctx, input.company_id, permission, true);
              }
              if (input.status !== "open") {
                const blocked = await c.query(
                  `select 1 where
       exists(select 1 from journal_entry j left join journal_line l on l.tenant_id=j.tenant_id and l.journal_id=j.id where j.tenant_id=$1 and j.company_id=$2 and j.period_id=$3 and j.status in ('posted','reversed') group by j.id having count(l.id)=0 or sum(l.base_debit-l.base_credit)<>0)
       or exists(select 1 from journal_entry where tenant_id=$1 and company_id=$2 and status='draft' and posting_date between $4::date and $5::date)
       or exists(select 1 from bank_payment where tenant_id=$1 and company_id=$2 and state in ('submitted','approved') and posting_date between $4::date and $5::date)
       or exists(select 1 from bank_receipt where tenant_id=$1 and company_id=$2 and state in ('submitted','approved') and posting_date between $4::date and $5::date)
       or exists(select 1 from accounting_event where tenant_id=$1 and state not in ('posted','rejected') and (payload->'resolved'->>'period_id'=$3 or (payload->>'company_id'=$2 and payload->>'posting_date' between $4::text and $5::text)))`,
                  [ctx.tenantId, input.company_id, period.id, period.period_start, period.period_end],
                );
                if (blocked.rowCount)
                  throw new FiscalCalendarError(
                    409,
                    "PERIOD_CLOSE_BLOCKED",
                    "Resolve unbalanced journals or incomplete accounting/Bank workflows before closing or locking this period. Draft Bank entries alone do not block closure.",
                  );
              }
              await c.query(
                "update financial_period set status=$4,row_version=row_version+1 where tenant_id=$1 and company_id=$2 and id=$3",
                [ctx.tenantId, input.company_id, period.id, input.status],
              );
              await calendarAudit(
                c,
                ctx,
                calendar,
                { id: period.id, version: period.version + 1 },
                input.status === "open" ? "opened" : input.status === "closed" ? "locked" : "soft_closed",
                period.status,
                input.status,
                input.reason ?? null,
                correlation,
              );
            }
            return loadFiscalCalendarDetail(c, ctx, input.company_id, calendarId);
          },
        );
      },
      true,
    );
  }
}
