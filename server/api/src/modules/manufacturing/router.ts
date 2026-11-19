import { Router, type Request } from "express";
import { z } from "zod";
import {
  bomByProductQuerySchema,
  bomInputSchema,
  convertProductionPlanInputSchema,
  manufacturingDirectoryQuerySchema,
  manufacturingLookupQuerySchema,
  manufacturingOrderActionSchema,
  manufacturingOrderInputSchema,
  manufacturingSurfaceSchema,
  productionPlanInputSchema,
  updateBomInputSchema,
  updateManufacturingOrderInputSchema,
  updateProductionPlanInputSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { ManufacturingError, type SourceManufacturingRepository } from "./source-repository.js";

export type ManufacturingRepository = Pick<
  SourceManufacturingRepository,
  | "companies"
  | "lookups"
  | "boms"
  | "getBom"
  | "bomByProduct"
  | "saveBom"
  | "plans"
  | "getPlan"
  | "savePlan"
  | "convertPlan"
  | "orders"
  | "getOrder"
  | "saveOrder"
  | "action"
>;
const identity = z.string().trim().min(1).max(128),
  companyQuery = z.strictObject({ company_id: identity });

export function createManufacturingRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: ManufacturingRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  const { repository } = dependencies;
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const handle = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ManufacturingError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  };
  function mutation(req: Request, version?: number) {
    const origin = req.get("origin"),
      key = req.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "MANUFACTURING_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  const correlation = () => currentRequestContext().correlationId;
  const id = (req: Request) => identity.parse(req.params.id);

  router.get("/companies", async (req, res) => {
    const query = z.strictObject({ surface: manufacturingSurfaceSchema }).parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.companies(ctx, query.surface)));
  });
  router.get("/lookups", async (req, res) => {
    const query = manufacturingLookupQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.lookups(ctx, query)));
  });
  router.get("/boms", async (req, res) => {
    const query = manufacturingDirectoryQuerySchema.omit({ state: true }).parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.boms(ctx, query)));
  });
  router.get("/boms/by-product/:productId", async (req, res) => {
    const query = bomByProductQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() =>
      repository.bomByProduct(ctx, query.company_id, identity.parse(req.params.productId), query.surface),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.get("/boms/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => repository.getBom(ctx, query.company_id, id(req)));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/boms", async (req, res) => {
    const input = bomInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveBom(ctx, null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/boms/:id", async (req, res) => {
    const input = updateBomInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveBom(ctx, id(req), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });

  router.get("/plans", async (req, res) => {
    const query = manufacturingDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.plans(ctx, query)));
  });
  router.get("/plans/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => repository.getPlan(ctx, query.company_id, id(req)));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/plans", async (req, res) => {
    const input = productionPlanInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.savePlan(ctx, null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/plans/:id", async (req, res) => {
    const input = updateProductionPlanInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.savePlan(ctx, id(req), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/plans/:id/convert", async (req, res) => {
    const input = convertProductionPlanInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.convertPlan(ctx, id(req), input, key, correlation()));
    res.setHeader("etag", `"${result.plan.version}"`).json(result);
  });

  router.get("/orders", async (req, res) => {
    const query = manufacturingDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => repository.orders(ctx, query)));
  });
  router.get("/orders/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() => repository.getOrder(ctx, query.company_id, id(req)));
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/orders", async (req, res) => {
    const input = manufacturingOrderInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveOrder(ctx, null, input, key, correlation()));
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/orders/:id", async (req, res) => {
    const input = updateManufacturingOrderInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.saveOrder(ctx, id(req), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/orders/:id/actions", async (req, res) => {
    const input = manufacturingOrderActionSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() => repository.action(ctx, id(req), input, key, correlation()));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  return router;
}
