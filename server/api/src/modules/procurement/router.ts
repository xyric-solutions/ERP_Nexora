import { Router, type Request } from "express";
import { z } from "zod";
import {
  updatePurchaseRequestSchema,
  updateSupplierInputSchema,
  purchaseQuerySchema,
  savePurchaseRequestSchema,
  purchaseActionRequestSchema,
  supplierInputSchema,
  procurementLookupQuerySchema,
  purchaseFlowQuerySchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { ProcurementError, type SourceProcurementRepository } from "./source-repository.js";

export type ProcurementRepository = Pick<
  SourceProcurementRepository,
  | "companies"
  | "options"
  | "products"
  | "approvers"
  | "list"
  | "get"
  | "flow"
  | "save"
  | "action"
  | "suppliers"
  | "saveSupplier"
>;
const identity = z.string().trim().min(1).max(128);
const companyQuery = z.strictObject({ company_id: identity });
export function createProcurementRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: ProcurementRepository;
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
      if (error instanceof ProcurementError) throw new HttpError(error.status, error.code, error.message);
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
      throw new HttpError(412, "PURCHASE_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/companies", async (req, res) => {
    z.strictObject({}).parse(req.query);
    const context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.companies(context)));
  });
  router.get("/options", async (req, res) => {
    const query = companyQuery.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.options(context, query.company_id)));
  });
  router.get("/suppliers", async (req, res) => {
    const query = purchaseQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.suppliers(context, query)));
  });
  router.get("/products", async (req, res) => {
    const query = procurementLookupQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.products(context, query)));
  });
  router.get("/approvers", async (req, res) => {
    const query = procurementLookupQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.approvers(context, query)));
  });
  router.post("/suppliers", async (req, res) => {
    const input = supplierInputSchema.parse(req.body),
      key = mutation(req),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.saveSupplier(context, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).json(result);
  });
  router.patch("/suppliers/:id", async (req, res) => {
    const input = updateSupplierInputSchema.parse(req.body);
    if (!input.expected_version)
      throw new HttpError(400, "PURCHASE_VERSION_REQUIRED", "The current supplier version is required.");
    const key = mutation(req, input.expected_version),
      context = await loadBankingSessionContext(req, dependencies, true);
    res.json(
      await handle(() =>
        dependencies.repository.saveSupplier(
          context,
          identity.parse(req.params.id),
          input,
          key,
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/documents", async (req, res) => {
    const query = purchaseQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.list(context, query)));
  });
  router.get("/documents/:id", async (req, res) => {
    const query = companyQuery.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    const result = await handle(() =>
      dependencies.repository.get(context, query.company_id, identity.parse(req.params.id)),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });
  router.get("/documents/:id/flow", async (req, res) => {
    const query = purchaseFlowQuerySchema.parse(req.query),
      context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => dependencies.repository.flow(context, identity.parse(req.params.id), query)));
  });
  router.post("/documents", async (req, res) => {
    const input = savePurchaseRequestSchema.parse(req.body),
      key = mutation(req),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(context, null, input, key, currentRequestContext().correlationId),
    );
    res.status(201).setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  router.patch("/documents/:id", async (req, res) => {
    const input = updatePurchaseRequestSchema.parse(req.body);
    if (!input.expected_version)
      throw new HttpError(400, "PURCHASE_VERSION_REQUIRED", "The current Purchase version is required.");
    const key = mutation(req, input.expected_version),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.save(
        context,
        identity.parse(req.params.id),
        input,
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  router.post("/documents/:id/actions", async (req, res) => {
    const input = purchaseActionRequestSchema.parse(req.body),
      key = mutation(req, input.expected_version),
      context = await loadBankingSessionContext(req, dependencies, true);
    const result = await handle(() =>
      dependencies.repository.action(
        context,
        identity.parse(req.params.id),
        input,
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  return router;
}
