import { Router, type Request } from "express";
import { z } from "zod";

import {
  activateCompanyCurrencyRequestSchema,
  changeCompanyCurrencyRateStatusRequestSchema,
  changeCompanyCurrencyStatusRequestSchema,
  companyCurrencyDirectoryQuerySchema,
  companyCurrencyRateDirectoryQuerySchema,
  configureCompanyCurrencyProfileRequestSchema,
  correctCompanyCurrencyRateRequestSchema,
  countryCurrencyDirectoryQuerySchema,
  createCompanyCurrencyRateRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../../http/errors.js";
import { currentRequestContext } from "../../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import { FinanceCurrencyError } from "./source-repository.js";
import { FinanceCurrencyService, type FinanceCurrencyRepository } from "./service.js";

const identifier = z.string().trim().min(1).max(128);
const currencyCode = z.string().regex(/^[A-Z]{3}$/);

export function createCompanyCurrencyRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: FinanceCurrencyRepository;
    allowedOrigins: ReadonlySet<string>;
  },
): Router {
  const router = Router();
  const currencies = new FinanceCurrencyService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  async function handle<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof FinanceCurrencyError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }

  function guards(req: Request, expectedVersion?: number): string {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (expectedVersion !== undefined && req.get("if-match") !== `"${expectedVersion}"`)
      throw new HttpError(
        412,
        "FINANCE_CONFIGURATION_PRECONDITION_FAILED",
        "Supply the quoted current version in If-Match.",
      );
    return key;
  }

  router.get("/master-data/countries", async (req, res) => {
    const query = countryCurrencyDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        currencies.listCountryCurrencies(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });

  router.get("/finance/companies/:companyId/currency-profile", async (req, res) => {
    res.json(
      await handle(async () =>
        currencies.getCompanyCurrencyProfile(
          await loadBankingSessionContext(req, dependencies),
          identifier.parse(req.params.companyId),
        ),
      ),
    );
  });

  router.post("/finance/companies/:companyId/currency-profile", async (req, res) => {
    const companyId = identifier.parse(req.params.companyId);
    const input = configureCompanyCurrencyProfileRequestSchema.parse(req.body);
    if (input.company_id !== companyId)
      throw new HttpError(400, "COMPANY_PATH_MISMATCH", "The company path and request body must match.");
    const result = await handle(async () =>
      currencies.configureCompanyCurrencyProfile(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        guards(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(201).json(result);
  });

  router.get("/finance/company-currencies", async (req, res) => {
    const query = companyCurrencyDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        currencies.listCompanyCurrencies(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });

  router.post("/finance/company-currencies", async (req, res) => {
    const input = activateCompanyCurrencyRequestSchema.parse(req.body);
    const result = await handle(async () =>
      currencies.activateCompanyCurrency(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        guards(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(201).json(result);
  });

  router.patch("/finance/company-currencies/:currencyCode/status", async (req, res) => {
    const input = changeCompanyCurrencyStatusRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        currencies.changeCompanyCurrencyStatus(
          await loadBankingSessionContext(req, dependencies, true),
          identifier.parse(req.query.company_id),
          currencyCode.parse(req.params.currencyCode),
          input,
          guards(req, input.expected_version),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  router.get("/finance/company-currency-rates", async (req, res) => {
    const query = companyCurrencyRateDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        currencies.listCompanyCurrencyRates(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });

  router.post("/finance/company-currency-rates", async (req, res) => {
    const input = createCompanyCurrencyRateRequestSchema.parse(req.body);
    const result = await handle(async () =>
      currencies.createCompanyCurrencyRate(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        guards(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(201).json(result);
  });

  router.post("/finance/company-currency-rates/:rateId/corrections", async (req, res) => {
    const input = correctCompanyCurrencyRateRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        currencies.correctCompanyCurrencyRate(
          await loadBankingSessionContext(req, dependencies, true),
          identifier.parse(req.params.rateId),
          input,
          guards(req, input.expected_version),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  router.patch("/finance/company-currency-rates/:rateId/status", async (req, res) => {
    const input = changeCompanyCurrencyRateStatusRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        currencies.changeCompanyCurrencyRateStatus(
          await loadBankingSessionContext(req, dependencies, true),
          identifier.parse(req.params.rateId),
          input,
          guards(req, input.expected_version),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  return router;
}
