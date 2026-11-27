import { Router } from "express";
import { z } from "zod";
import { businessSetupInputSchema } from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { currentRequestContext } from "../../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import type { SourceChartTemplateRepository } from "./source-repository.js";
import { ChartTemplateError } from "./template-shared.js";
import { CoaMasterError } from "../coa-master-change.js";

export type BusinessSetupRepository = Pick<
  SourceChartTemplateRepository,
  "businessNatures" | "businessSetup" | "initializeBusiness"
>;
export function createBusinessSetupRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: BusinessSetupRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ChartTemplateError || error instanceof CoaMasterError)
        throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  router.get("/natures", async (req, res) => {
    z.strictObject({}).parse(req.query);
    const ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.businessNatures(ctx)));
  });
  router.get("/", async (req, res) => {
    const query = z.strictObject({ company_id: z.string().trim().min(1).max(128) }).parse(req.query);
    const ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.businessSetup(ctx, query.company_id)));
  });
  router.post("/", async (req, res) => {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    const ctx = await loadBankingSessionContext(req, dependencies, true),
      input = businessSetupInputSchema.parse(req.body);
    const result = await handle(() =>
      dependencies.repository.initializeBusiness(ctx, input, key, currentRequestContext().correlationId),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  return router;
}
