import { randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  bankingCompanyDirectorySchema,
  fiscalCalendarSchema,
  fiscalCalendarDirectorySchema,
  fiscalCalendarDetailSchema,
  financialPeriodSchema,
  monthlyFiscalPeriods,
  type FiscalCalendarQuery,
  type CreateFiscalCalendar,
  type GenerateFiscalPeriods,
} from "@nexora/contracts";
import {
  calendarTransaction,
  calendarIdempotency,
  calendarAudit,
  requireCalendarPermission,
  FiscalCalendarError,
  type CalendarContext,
} from "./transaction.js";
const projection = "id,company_id,year,period_start::text,period_end::text,status,row_version::integer as version";
export async function loadFiscalCalendar(
  c: PoolClient,
  ctx: CalendarContext,
  company: string,
  id: string,
  exclusive = false,
) {
  const row = (
    await c.query(
      `select ${projection} from fiscal_calendar where tenant_id=$1 and company_id=$2 and id=$3 ${exclusive ? "for update" : "for share"}`,
      [ctx.tenantId, company, id],
    )
  ).rows[0];
  if (!row) throw new FiscalCalendarError(404, "CALENDAR_NOT_FOUND", "Fiscal calendar was not found in this company.");
  return fiscalCalendarSchema.parse(row);
}
export async function loadFiscalCalendarDetail(c: PoolClient, ctx: CalendarContext, company: string, id: string) {
  const calendar = await loadFiscalCalendar(c, ctx, company, id);
  const periods = (
    await c.query(
      "select id,company_id,fiscal_calendar_id,period_number,period_start::text,period_end::text,status,row_version::integer as version from financial_period where tenant_id=$1 and company_id=$2 and fiscal_calendar_id=$3 order by period_number",
      [ctx.tenantId, company, id],
    )
  ).rows.map((p) => financialPeriodSchema.parse(p));
  const history = (
    await c.query(
      "select id,actor_id,action,period_id,before_status,after_status,reason,to_char(occurred_at at time zone 'UTC','YYYY-MM-DD\"T\"HH24:MI:SS.US\"Z\"') as occurred_at,correlation_id from fiscal_calendar_event where tenant_id=$1 and company_id=$2 and calendar_id=$3 order by occurred_at desc,id desc limit 101",
      [ctx.tenantId, company, id],
    )
  ).rows;
  return fiscalCalendarDetailSchema.parse({
    calendar,
    periods,
    history: history.slice(0, 100),
    history_has_more: history.length > 100,
  });
}
export class SourceFiscalCalendarRepository {
  constructor(private readonly pool: Pool) {}
  companies(ctx: CalendarContext) {
    return calendarTransaction(this.pool, ctx, async (c) => {
      if (!ctx.actor.permissions.includes("platform.fiscal_calendar.read"))
        throw new FiscalCalendarError(403, "PERMISSION_DENIED", "Fiscal calendar read permission is required.");
      return bankingCompanyDirectorySchema.parse({
        items: (
          await c.query(
            "select id,code,name from organization_unit where tenant_id=$1 and type='company' and status='active' and bank_has_live_permission($1,id,$2,'platform.fiscal_calendar.read') order by code,id limit 100",
            [ctx.tenantId, ctx.actor.userId],
          )
        ).rows,
      });
    });
  }
  list(ctx: CalendarContext, q: FiscalCalendarQuery) {
    return calendarTransaction(this.pool, ctx, async (c) => {
      await requireCalendarPermission(c, ctx, q.company_id, "platform.fiscal_calendar.read");
      const rows = (
        await c.query(
          `select ${projection} from fiscal_calendar where tenant_id=$1 and company_id=$2 and id>$3 order by id limit $4`,
          [ctx.tenantId, q.company_id, q.after ?? "", q.limit + 1],
        )
      ).rows;
      return fiscalCalendarDirectorySchema.parse({
        items: rows.slice(0, q.limit),
        next_cursor: rows.length > q.limit ? rows[q.limit - 1]!.id : null,
      });
    });
  }
  detail(ctx: CalendarContext, company: string, id: string) {
    return calendarTransaction(this.pool, ctx, async (c) => {
      await requireCalendarPermission(c, ctx, company, "platform.fiscal_calendar.read");
      await requireCalendarPermission(c, ctx, company, "platform.accounting_period.read");
      return loadFiscalCalendarDetail(c, ctx, company, id);
    });
  }
  create(ctx: CalendarContext, input: CreateFiscalCalendar, key: string, correlation: string) {
    return calendarTransaction(
      this.pool,
      ctx,
      async (c) => {
        await requireCalendarPermission(c, ctx, input.company_id, "platform.fiscal_calendar.create", true);
        await requireCalendarPermission(c, ctx, input.company_id, "platform.fiscal_calendar.read");
        await requireCalendarPermission(c, ctx, input.company_id, "platform.accounting_period.read");
        return calendarIdempotency(
          c,
          ctx,
          "/api/v1/master_data/fiscal_calendars",
          input,
          key,
          (v) => fiscalCalendarDetailSchema.parse(v),
          async () => {
            await c.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
              `nexora:calendar:${ctx.tenantId}:${input.company_id}`,
            ]);
            const months = monthlyFiscalPeriods(input.period_start),
              id = `fiscal-calendar-${randomUUID()}`;
            await c.query(
              "insert into fiscal_calendar(tenant_id,company_id,id,year,period_start,period_end,status) values($1,$2,$3,$4,$5,$6,'active')",
              [
                ctx.tenantId,
                input.company_id,
                id,
                Number(input.period_start.slice(0, 4)),
                input.period_start,
                months[11]!.period_end,
              ],
            );
            const calendar = await loadFiscalCalendar(c, ctx, input.company_id, id);
            await calendarAudit(c, ctx, calendar, null, "calendar_created", null, "active", null, correlation);
            await this.insertMonths(c, ctx, calendar, months, correlation);
            return loadFiscalCalendarDetail(c, ctx, input.company_id, id);
          },
        );
      },
      true,
    );
  }
  generate(ctx: CalendarContext, id: string, input: GenerateFiscalPeriods, key: string, correlation: string) {
    return calendarTransaction(
      this.pool,
      ctx,
      async (c) => {
        await requireCalendarPermission(c, ctx, input.company_id, "platform.fiscal_calendar.create", true);
        await requireCalendarPermission(c, ctx, input.company_id, "platform.fiscal_calendar.read");
        await requireCalendarPermission(c, ctx, input.company_id, "platform.accounting_period.read");
        return calendarIdempotency(
          c,
          ctx,
          `/api/v1/master_data/fiscal_calendars/${id}/periods`,
          input,
          key,
          (v) => fiscalCalendarDetailSchema.parse(v),
          async () => {
            const calendar = await loadFiscalCalendar(c, ctx, input.company_id, id, true);
            if (calendar.version !== input.expected_version)
              throw new FiscalCalendarError(
                409,
                "CALENDAR_VERSION_CONFLICT",
                "Calendar changed. Reload its current version.",
              );
            if (calendar.status !== "active")
              throw new FiscalCalendarError(
                409,
                "CALENDAR_INACTIVE",
                "Only an active fiscal year can generate periods.",
              );
            let months: ReturnType<typeof monthlyFiscalPeriods>;
            try {
              months = monthlyFiscalPeriods(calendar.period_start);
            } catch {
              throw new FiscalCalendarError(
                409,
                "CALENDAR_IRREGULAR",
                "This legacy fiscal year needs date-boundary review; its history was not changed.",
              );
            }
            if (months[11]!.period_end !== calendar.period_end)
              throw new FiscalCalendarError(
                409,
                "CALENDAR_IRREGULAR",
                "This legacy calendar is not a twelve-month regular year; review its dates without changing history.",
              );
            if (
              (
                await c.query("select 1 from financial_period where tenant_id=$1 and fiscal_calendar_id=$2 limit 1", [
                  ctx.tenantId,
                  id,
                ])
              ).rowCount
            )
              throw new FiscalCalendarError(
                409,
                "CALENDAR_PERIODS_EXIST",
                "Periods already exist. Partial or irregular configurations require explicit review.",
              );
            await this.insertMonths(c, ctx, calendar, months, correlation);
            await c.query(
              "update fiscal_calendar set row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
              [ctx.tenantId, input.company_id, id],
            );
            return loadFiscalCalendarDetail(c, ctx, input.company_id, id);
          },
        );
      },
      true,
    );
  }
  private async insertMonths(
    c: PoolClient,
    ctx: CalendarContext,
    calendar: { id: string; company_id: string },
    months: ReturnType<typeof monthlyFiscalPeriods>,
    correlation: string,
  ) {
    for (const month of months) {
      const period = { id: `financial-period-${randomUUID()}`, version: 1 };
      await c.query(
        "insert into financial_period(tenant_id,company_id,id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,$5,$6,$7,'soft_close',clock_timestamp())",
        [
          ctx.tenantId,
          calendar.company_id,
          period.id,
          calendar.id,
          month.period_number,
          month.period_start,
          month.period_end,
        ],
      );
      await calendarAudit(c, ctx, calendar, period, "period_created", null, "soft_close", null, correlation);
    }
  }
}
