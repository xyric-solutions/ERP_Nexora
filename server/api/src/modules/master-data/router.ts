import { Router, type Request } from "express";
import { z } from "zod";
import {
  referenceMasterKindSchema,
  referenceMasterQuerySchema,
  createReferenceMasterRequestSchema,
  updateReferenceMasterRequestSchema,
  changeReferenceMasterStatusRequestSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { ReferenceMasterService, type ReferenceMasterRepository } from "./service.js";
import { ReferenceMasterError } from "./source-repository.js";
const id = z.string().trim().min(1).max(128);
const detailQuery = z.strictObject({ company_id: id });
export function createReferenceMasterRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: ReferenceMasterRepository;
    allowedOrigins: ReadonlySet<string>;
  },
): Router {
  const router = Router(),
    service = new ReferenceMasterService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ReferenceMasterError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function mutation(req: Request, version?: number) {
    const origin = req.get("origin"),
      key = req.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "MASTER_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/:kind/companies", async (req, res) => {
    z.strictObject({}).parse(req.query);
    const context = await loadBankingSessionContext(req, dependencies);
    res.json(await handle(() => service.companies(context, referenceMasterKindSchema.parse(req.params.kind))));
  });
  router.get("/:kind", async (req, res) => {
    const context = await loadBankingSessionContext(req, dependencies),
      kind = referenceMasterKindSchema.parse(req.params.kind);
    const query = referenceMasterQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(() => service.list(context, kind, query)));
  });
  router.get("/:kind/:id", async (req, res) => {
    const context = await loadBankingSessionContext(req, dependencies),
      kind = referenceMasterKindSchema.parse(req.params.kind),
      query = detailQuery.parse(req.query);
    const result = await handle(() => service.get(context, kind, query.company_id, id.parse(req.params.id)));
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });
  router.post("/:kind", async (req, res) => {
    const key = mutation(req),
      context = await loadBankingSessionContext(req, dependencies, true);
    const kind = referenceMasterKindSchema.parse(req.params.kind),
      input = createReferenceMasterRequestSchema.parse(req.body);
    const result = await handle(() => service.create(context, kind, input, key, currentRequestContext().correlationId));
    res.setHeader("etag", `"${result.record.version}"`);
    res.status(201).json(result);
  });
  router.patch("/:kind/:id", async (req, res) => {
    const context = await loadBankingSessionContext(req, dependencies, true),
      kind = referenceMasterKindSchema.parse(req.params.kind);
    const input = updateReferenceMasterRequestSchema.parse(req.body),
      key = mutation(req, input.expected_version);
    const result = await handle(() =>
      service.update(context, kind, id.parse(req.params.id), input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  router.post("/:kind/:id/status", async (req, res) => {
    const context = await loadBankingSessionContext(req, dependencies, true),
      kind = referenceMasterKindSchema.parse(req.params.kind);
    const input = changeReferenceMasterStatusRequestSchema.parse(req.body),
      key = mutation(req, input.expected_version);
    const result = await handle(() =>
      service.status(context, kind, id.parse(req.params.id), input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  return router;
}
