import { Router, type Request } from "express";
import { z } from "zod";
import {
  fiscalCalendarQuerySchema,
  createFiscalCalendarSchema,
  generateFiscalPeriodsSchema,
  changeFiscalPeriodsSchema,
} from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { currentRequestContext } from "../../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import { FiscalCalendarError } from "./transaction.js";
import type { SourceFiscalCalendarRepository } from "./source-repository.js";
import type { SourceFinancePeriodRepository } from "../../finance/periods/source-repository.js";
export type FiscalCalendarApiRepository = Pick<
  SourceFiscalCalendarRepository,
  "companies" | "list" | "detail" | "create" | "generate"
>;
export type FinancePeriodApiRepository = Pick<SourceFinancePeriodRepository, "change">;
export function createFiscalCalendarRouter(
  deps: BankingSessionContextDependencies & {
    calendars: FiscalCalendarApiRepository;
    periods: FinancePeriodApiRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const id = (req: Request) => z.string().trim().min(1).max(128).parse(req.params.calendarId);
  const company = (req: Request) =>
    z.strictObject({ company_id: z.string().trim().min(1).max(128) }).parse(req.query).company_id;
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (e) {
      if (e instanceof FiscalCalendarError) throw new HttpError(e.status, e.code, e.message);
      throw e;
    }
  }
  function guards(req: Request, version?: number | string) {
    const origin = req.get("origin");
    if (origin && !deps.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "CALENDAR_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/master_data/fiscal_calendars/options", async (req, res) =>
    res.json(await handle(async () => deps.calendars.companies(await loadBankingSessionContext(req, deps)))),
  );
  router.get("/master_data/fiscal_calendars", async (req, res) => {
    const q = fiscalCalendarQuerySchema.parse(req.query);
    res.json(await handle(async () => deps.calendars.list(await loadBankingSessionContext(req, deps), q)));
  });
  router.get("/master_data/fiscal_calendars/:calendarId", async (req, res) => {
    const companyId = company(req),
      calendar = id(req);
    const result = await handle(async () =>
      deps.calendars.detail(await loadBankingSessionContext(req, deps), companyId, calendar),
    );
    res.setHeader("etag", `"${result.calendar.version}"`);
    res.json(result);
  });
  router.post("/master_data/fiscal_calendars", async (req, res) => {
    const input = createFiscalCalendarSchema.parse(req.body),
      key = guards(req);
    res.json(
      await handle(async () =>
        deps.calendars.create(
          await loadBankingSessionContext(req, deps, true),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/master_data/fiscal_calendars/:calendarId/periods", async (req, res) => {
    const input = generateFiscalPeriodsSchema.parse(req.body),
      key = guards(req, input.expected_version),
      calendar = id(req);
    res.json(
      await handle(async () =>
        deps.calendars.generate(
          await loadBankingSessionContext(req, deps, true),
          calendar,
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/finance/fiscal_calendars/:calendarId/period_status", async (req, res) => {
    const input = changeFiscalPeriodsSchema.parse(req.body),
      versions = [...input.periods]
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((p) => p.expected_version)
        .join(","),
      key = guards(req, versions),
      calendar = id(req);
    res.json(
      await handle(async () =>
        deps.periods.change(
          await loadBankingSessionContext(req, deps, true),
          calendar,
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  return router;
}
