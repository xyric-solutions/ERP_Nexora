import { Router, type Request } from "express";
import { z } from "zod";
import {
  salesQuerySchema,
  salesLookupQuerySchema,
  salesDocumentInputSchema,
  salesDocumentUpdateSchema,
  salesActionSchema,
  salesDerivedDraftInputSchema,
  salesSourcePrepareSchema,
  salesStockPrepareSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { OperationalError } from "../shared/operational-transaction.js";
import { SubledgerError } from "../finance/subledger/source-repository.js";
import type { SourceSalesRepository } from "./source-repository.js";
export type SalesRepository = Pick<
  SourceSalesRepository,
  | "list"
  | "lookups"
  | "get"
  | "save"
  | "action"
  | "derive"
  | "prepareAccounting"
  | "prepareStock"
  | "overview"
  | "productUnits"
>;
export function createSalesRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: SalesRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router(),
    id = z.string().trim().min(1).max(128),
    company = z.strictObject({ company_id: id });
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OperationalError || error instanceof SubledgerError)
        throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function mutation(req: Request, version?: number) {
    const origin = req.get("origin"),
      key = req.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    if (!key || !key.trim() || key.length > 255)
      throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply a request identity of 1 to 255 characters.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "SALES_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/documents", async (req, res) => {
    const input = salesQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.list(context, input)));
  });
  router.get("/overview", async (req, res) => {
    const input = company.extend({ as_of: z.iso.date().optional() }).parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.overview(context, input.company_id, input.as_of)));
  });
  router.get("/products/:id/units", async (req, res) => {
    const input = company.parse(req.query),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.productUnits(context, input.company_id, recordId)));
  });
  router.get("/lookups", async (req, res) => {
    const input = salesLookupQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.lookups(context, input)));
  });
  router.get("/documents/:id", async (req, res) => {
    const input = company.parse(req.query),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies);
    const result = await handle(() => dependencies.repository.get(context, input.company_id, recordId));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/documents", async (req, res) => {
    const input = salesDocumentInputSchema.parse(req.body),
      key = mutation(req),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(context, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.put("/documents/:id", async (req, res) => {
    const input = salesDocumentUpdateSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(context, recordId, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/documents/:id/actions", async (req, res) => {
    const input = salesActionSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.action(context, recordId, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/documents/:id/derive", async (req, res) => {
    const input = salesDerivedDraftInputSchema.parse(req.body);
    mutation(req, input.expected_version);
    const recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    res.json(await handle(() => dependencies.repository.derive(context, recordId, input)));
  });
  router.post("/documents/:id/accounting", async (req, res) => {
    const input = salesSourcePrepareSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    res.json(await handle(() => dependencies.repository.prepareAccounting(context, recordId, input, key)));
  });
  router.post("/documents/:id/stock", async (req, res) => {
    const input = salesStockPrepareSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      recordId = id.parse(req.params.id),
      context = await loadBankingSessionContext(req, dependencies, true);
    res.json(
      await handle(() =>
        dependencies.repository.prepareStock(context, recordId, input, key, currentRequestContext().correlationId),
      ),
    );
  });
  return router;
}
