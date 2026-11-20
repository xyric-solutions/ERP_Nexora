import { Router, type Request } from "express";
import { z } from "zod";
import {
  stockQuerySchema,
  stockMovementInputSchema,
  stockActionSchema,
  stockPolicyInputSchema,
  stockValuationInputSchema,
  stockLookupQuerySchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { OperationalError } from "../shared/operational-transaction.js";
import type { SourceStockRepository } from "./stock-repository.js";
export type StockRepository = Pick<
  SourceStockRepository,
  "workspace" | "lookups" | "get" | "create" | "action" | "configure" | "configureValuation"
>;
export function createStockRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: StockRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router(),
    id = z.string().trim().min(1).max(128);
  router.use((_request, response, next) => {
    response.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OperationalError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function mutation(request: Request, version?: number) {
    const origin = request.get("origin"),
      key = request.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    if (!key || key.trim().length === 0 || key.length > 255)
      throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply an idempotency key of 1–255 characters.");
    if (version !== undefined && request.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "STOCK_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/workspace", async (req, res) => {
    const query = stockQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.workspace(context, query)));
  });
  router.get("/lookups", async (req, res) => {
    const query = stockLookupQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.lookups(context, query)));
  });
  router.get("/operations/:id", async (req, res) => {
    const query = z.strictObject({ company_id: id }).parse(req.query),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => dependencies.repository.get(context, query.company_id, recordId));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/operations", async (req, res) => {
    const input = stockMovementInputSchema.parse(req.body),
      key = mutation(req),
      context = await loadBankingSessionContext(req, dependencies, true);
    const record = await handle(() =>
      dependencies.repository.create(context, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/operations/:id/actions", async (req, res) => {
    const input = stockActionSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    const record = await handle(() =>
      dependencies.repository.action(context, recordId, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/policy", async (req, res) => {
    const input = stockPolicyInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      context = await loadBankingSessionContext(req, dependencies, true);
    const record = await handle(() =>
      dependencies.repository.configure(context, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/valuation", async (req, res) => {
    const input = stockValuationInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      context = await loadBankingSessionContext(req, dependencies, true);
    const record = await handle(() =>
      dependencies.repository.configureValuation(context, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  return router;
}
