import { Router, type Request } from "express";
import { z } from "zod";
import {
  financeNominalOptionsQuerySchema,
  financeNominalDirectoryQuerySchema,
  createFinanceNominalRequestSchema,
  updateFinanceNominalRequestSchema,
  submitFinanceNominalRequestSchema,
  decideFinanceNominalRequestSchema,
  changeFinanceNominalStatusRequestSchema,
  financeHierarchyQuerySchema,
  createFinanceHierarchyRequestSchema,
  changeFinanceHierarchyRequestSchema,
  currencyCatalogQuerySchema,
  tenantCurrencyQuerySchema,
  adoptCurrencyRequestSchema,
  changeCurrencyStatusRequestSchema,
  currencyRateQuerySchema,
  createCurrencyRateRequestSchema,
  correctCurrencyRateRequestSchema,
  changeCurrencyRateStatusRequestSchema,
  upsertTransferFxPolicyRequestSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { FinanceNominalError } from "./nominals/source-repository.js";
import { FinanceNominalService, type FinanceNominalRepository } from "./nominals/service.js";
import { CoaMasterError } from "./coa-master-change.js";
import type { SourceCoaHierarchyRepository } from "./coa-hierarchy-repository.js";
import { FinanceCurrencyError } from "./currencies/source-repository.js";
import { FinanceCurrencyService, type FinanceCurrencyRepository } from "./currencies/service.js";

export type { FinanceNominalRepository } from "./nominals/service.js";
export type { FinanceCurrencyRepository } from "./currencies/service.js";
export function createFinanceRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: FinanceNominalRepository;
    hierarchy?: SourceCoaHierarchyRepository;
    currencies?: FinanceCurrencyRepository;
    allowedOrigins: ReadonlySet<string>;
  },
): Router {
  const router = Router(),
    repo = new FinanceNominalService(dependencies.repository),
    currencies = dependencies.currencies ? new FinanceCurrencyService(dependencies.currencies) : null;
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (
        error instanceof FinanceNominalError ||
        error instanceof CoaMasterError ||
        error instanceof FinanceCurrencyError
      )
        throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function id(req: Request): string {
    return z.string().trim().min(1).max(128).parse(req.params.nominalId);
  }
  function guards(req: Request, version?: number, preconditionCode = "NOMINAL_PRECONDITION_FAILED"): string {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, preconditionCode, "Supply the quoted current version in If-Match.");
    return key;
  }
  if (currencies) {
    router.get("/currencies/catalog", async (req, res) => {
      const query = currencyCatalogQuerySchema.parse({
        ...req.query,
        adopted: req.query.adopted === undefined ? undefined : req.query.adopted === "true",
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(
        await handle(async () => currencies.listCatalog(await loadBankingSessionContext(req, dependencies), query)),
      );
    });
    router.get("/currencies", async (req, res) => {
      const query = tenantCurrencyQuerySchema.parse({
        ...req.query,
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(
        await handle(async () => currencies.listCurrencies(await loadBankingSessionContext(req, dependencies), query)),
      );
    });
    router.post("/currencies/adoptions", async (req, res) => {
      const input = adoptCurrencyRequestSchema.parse(req.body),
        key = guards(req);
      res
        .status(201)
        .json(
          await handle(async () =>
            currencies.adopt(
              await loadBankingSessionContext(req, dependencies, true),
              input,
              key,
              currentRequestContext().correlationId,
            ),
          ),
        );
    });
    router.post("/currencies/:code/status", async (req, res) => {
      const code = z
          .string()
          .regex(/^[A-Z]{3}$/)
          .parse(req.params.code),
        input = changeCurrencyStatusRequestSchema.parse(req.body),
        key = guards(req, input.expected_version, "FINANCE_CONFIGURATION_PRECONDITION_FAILED");
      res.json(
        await handle(async () =>
          currencies.changeCurrencyStatus(
            await loadBankingSessionContext(req, dependencies, true),
            code,
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
    });
    router.get("/currency_rates", async (req, res) => {
      const query = currencyRateQuerySchema.parse({
        ...req.query,
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(
        await handle(async () => currencies.listRates(await loadBankingSessionContext(req, dependencies), query)),
      );
    });
    router.post("/currency_rates", async (req, res) => {
      const input = createCurrencyRateRequestSchema.parse(req.body),
        key = guards(req);
      res
        .status(201)
        .json(
          await handle(async () =>
            currencies.createRate(
              await loadBankingSessionContext(req, dependencies, true),
              input,
              key,
              currentRequestContext().correlationId,
            ),
          ),
        );
    });
    router.post("/currency_rates/:rateId/corrections", async (req, res) => {
      const rateId = z.string().trim().min(1).max(128).parse(req.params.rateId),
        input = correctCurrencyRateRequestSchema.parse(req.body),
        key = guards(req, input.expected_version, "FINANCE_CONFIGURATION_PRECONDITION_FAILED");
      res.json(
        await handle(async () =>
          currencies.correctRate(
            await loadBankingSessionContext(req, dependencies, true),
            rateId,
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
    });
    router.post("/currency_rates/:rateId/status", async (req, res) => {
      const rateId = z.string().trim().min(1).max(128).parse(req.params.rateId),
        input = changeCurrencyRateStatusRequestSchema.parse(req.body),
        key = guards(req, input.expected_version, "FINANCE_CONFIGURATION_PRECONDITION_FAILED");
      res.json(
        await handle(async () =>
          currencies.changeRateStatus(
            await loadBankingSessionContext(req, dependencies, true),
            rateId,
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
    });
    router.get("/transfer_policy", async (req, res) => {
      const companyId = z.string().trim().min(1).max(128).parse(req.query.company_id);
      const result = await handle(async () =>
        currencies.getPolicy(await loadBankingSessionContext(req, dependencies), companyId),
      );
      res.setHeader("etag", `"${result.version}"`);
      res.json(result);
    });
    router.post("/transfer_policy", async (req, res) => {
      const input = upsertTransferFxPolicyRequestSchema.parse(req.body),
        key = guards(req, input.expected_version, "FINANCE_CONFIGURATION_PRECONDITION_FAILED");
      res.json(
        await handle(async () =>
          currencies.upsertPolicy(
            await loadBankingSessionContext(req, dependencies, true),
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
    });
  }
  if (dependencies.hierarchy) {
    const hierarchy = dependencies.hierarchy;
    router.get("/hierarchy", async (req, res) => {
      const q = financeHierarchyQuerySchema.parse({
        ...req.query,
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(await handle(async () => hierarchy.list(await loadBankingSessionContext(req, dependencies), q)));
    });
    router.post("/hierarchy", async (req, res) => {
      const input = createFinanceHierarchyRequestSchema.parse(req.body),
        key = guards(req);
      res
        .status(201)
        .json(
          await handle(async () =>
            hierarchy.change(
              await loadBankingSessionContext(req, dependencies, true),
              input.company_id,
              undefined,
              input,
              key,
              currentRequestContext().correlationId,
            ),
          ),
        );
    });
    router.patch("/hierarchy/:headerId", async (req, res) => {
      const input = changeFinanceHierarchyRequestSchema.parse(req.body),
        key = guards(req, input.expected_version),
        company = z
          .object({ company_id: z.string().min(1).max(128) })
          .strict()
          .parse(req.query).company_id,
        header = z.string().min(1).max(128).parse(req.params.headerId);
      res.json(
        await handle(async () =>
          hierarchy.change(
            await loadBankingSessionContext(req, dependencies, true),
            company,
            header,
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
    });
  }
  router.get("/nominals/options", async (req, res) => {
    const query = financeNominalOptionsQuerySchema.parse(req.query);
    res.json(
      await handle(async () => repo.options(await loadBankingSessionContext(req, dependencies), query.company_id)),
    );
  });
  router.get("/nominals", async (req, res) => {
    const query = financeNominalDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => repo.list(await loadBankingSessionContext(req, dependencies), query)));
  });
  router.get("/nominals/:nominalId", async (req, res) => {
    const result = await handle(async () => repo.get(await loadBankingSessionContext(req, dependencies), id(req)));
    if (result.version) res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });
  router.post("/nominals", async (req, res) => {
    const input = createFinanceNominalRequestSchema.parse(req.body),
      key = guards(req);
    res
      .status(201)
      .json(
        await handle(async () =>
          repo.create(
            await loadBankingSessionContext(req, dependencies, true),
            input,
            key,
            currentRequestContext().correlationId,
          ),
        ),
      );
  });
  router.patch("/nominals/:nominalId", async (req, res) => {
    const input = updateFinanceNominalRequestSchema.parse(req.body),
      key = guards(req, input.expected_version);
    res.json(
      await handle(async () =>
        repo.update(
          await loadBankingSessionContext(req, dependencies, true),
          id(req),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/nominals/:nominalId/submit", async (req, res) => {
    const input = submitFinanceNominalRequestSchema.parse(req.body),
      key = guards(req, input.expected_version);
    res.json(
      await handle(async () =>
        repo.submit(
          await loadBankingSessionContext(req, dependencies, true),
          id(req),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/nominals/:nominalId/decision", async (req, res) => {
    const input = decideFinanceNominalRequestSchema.parse(req.body),
      key = guards(req, input.expected_version);
    res.json(
      await handle(async () =>
        repo.decide(
          await loadBankingSessionContext(req, dependencies, true),
          id(req),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/nominals/:nominalId/status", async (req, res) => {
    const input = changeFinanceNominalStatusRequestSchema.parse(req.body),
      key = guards(req, input.expected_version);
    res.json(
      await handle(async () =>
        repo.changeStatus(
          await loadBankingSessionContext(req, dependencies, true),
          id(req),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  return router;
}
