import { Router, type Request } from "express";
import { z } from "zod";
import {
  productInputSchema,
  updateProductInputSchema,
  productQuerySchema,
  productLookupQuerySchema,
  inventorySurfaceSchema,
  warehouseInputSchema,
  updateWarehouseInputSchema,
  stockTransferInputSchema,
  updateStockTransferInputSchema,
  inventoryDirectoryQuerySchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { InventoryError, type SourceInventoryRepository } from "./source-repository.js";

export type InventoryRepository = Pick<
  SourceInventoryRepository,
  | "companies"
  | "options"
  | "lookups"
  | "list"
  | "get"
  | "save"
  | "warehouses"
  | "getWarehouse"
  | "saveWarehouse"
  | "transfers"
  | "getTransfer"
  | "saveTransfer"
>;
const identity = z.string().trim().min(1).max(128),
  companyQuery = z.strictObject({ company_id: identity });
export function createInventoryRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: InventoryRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const handle = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof InventoryError) throw new HttpError(error.status, error.code, error.message);
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
      throw new HttpError(412, "PRODUCT_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/companies", async (req, res) => {
    const query = z.strictObject({ surface: inventorySurfaceSchema.default("products") }).parse(req.query);
    const ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.companies(ctx, query.surface)));
  });
  router.get("/options", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.options(ctx, query.company_id)));
  });
  router.get("/lookups", async (req, res) => {
    const query = productLookupQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.lookups(ctx, query)));
  });
  router.get("/products", async (req, res) => {
    const query = productQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.list(ctx, query)));
  });
  router.get("/products/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const result = await handle(() =>
      dependencies.repository.get(ctx, query.company_id, identity.parse(req.params.id)),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });
  router.post("/products", async (req, res) => {
    const input = productInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(ctx, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/products/:id", async (req, res) => {
    const input = updateProductInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(
        ctx,
        identity.parse(req.params.id),
        input,
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.get("/warehouses", async (req, res) => {
    const query = inventoryDirectoryQuerySchema.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.warehouses(ctx, query)));
  });
  router.get("/warehouses/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() =>
      dependencies.repository.getWarehouse(ctx, query.company_id, identity.parse(req.params.id)),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/warehouses", async (req, res) => {
    const input = warehouseInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.saveWarehouse(ctx, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/warehouses/:id", async (req, res) => {
    const input = updateWarehouseInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.saveWarehouse(
        ctx,
        identity.parse(req.params.id),
        input,
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.get("/transfers", async (req, res) => {
    const query = inventoryDirectoryQuerySchema.omit({ status: true }).parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.transfers(ctx, query)));
  });
  router.get("/transfers/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      ctx = await loadBankingSessionContext(req, dependencies);
    const record = await handle(() =>
      dependencies.repository.getTransfer(ctx, query.company_id, identity.parse(req.params.id)),
    );
    res.setHeader("etag", `"${record.version}"`).json(record);
  });
  router.post("/transfers", async (req, res) => {
    const input = stockTransferInputSchema.parse(req.body),
      key = mutation(req),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.saveTransfer(ctx, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.patch("/transfers/:id", async (req, res) => {
    const input = updateStockTransferInputSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      ctx = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.saveTransfer(
        ctx,
        identity.parse(req.params.id),
        input,
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  return router;
}
