import { Router, type Request } from "express";
import { z } from "zod";

import {
  approveBankRevaluationRequestSchema,
  bankRevaluationDirectoryQuerySchema,
  bankRevaluationEventDirectoryQuerySchema,
  bankRevaluationPreviewRequestSchema,
  bankWorkflowOptionQuerySchema,
  createBankRevaluationRequestSchema,
  postBankRevaluationRequestSchema,
  rejectBankRevaluationRequestSchema,
  reverseBankRevaluationRequestSchema,
  submitBankRevaluationRequestSchema,
  updateBankRevaluationRequestSchema,
  upsertBankRevaluationPolicyRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../../http/errors.js";
import { currentRequestContext } from "../../../http/request-context.js";
import type { BankingSessionContextDependencies } from "../session-context.js";
import { loadBankingSessionContext } from "../session-context.js";
import { BankingApiError } from "../source-repository.js";
import { BankingRevaluationService, type BankingRevaluationRepository } from "./service.js";

const identifier = z.string().trim().min(1).max(128);

export function createBankRevaluationRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: BankingRevaluationRepository;
    allowedOrigins: ReadonlySet<string>;
  },
): Router {
  const router = Router();
  const service = new BankingRevaluationService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  async function handle<T>(work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof BankingApiError) throw new HttpError(error.status, error.code, error.message);
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
      throw new HttpError(412, "REVALUATION_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }

  router.get("/revaluation-policy", async (req, res) => {
    const result = await handle(async () =>
      service.getPolicy(await loadBankingSessionContext(req, dependencies), identifier.parse(req.query.company_id)),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluation-policy", async (req, res) => {
    const input = upsertBankRevaluationPolicyRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.upsertPolicy(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.get("/revaluations", async (req, res) => {
    const states = Array.isArray(req.query.states)
      ? req.query.states
      : typeof req.query.states === "string"
        ? req.query.states.split(",").filter(Boolean)
        : undefined;
    const query = bankRevaluationDirectoryQuerySchema.parse({
      ...req.query,
      states,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => service.list(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/revaluations/approvers", async (req, res) => {
    const query = bankWorkflowOptionQuerySchema.parse({
      ...req.query,
      kind: "approver",
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => service.approverOptions(await loadBankingSessionContext(req, dependencies), query)),
    );
  });

  router.post("/revaluations/preview", async (req, res) => {
    const input = bankRevaluationPreviewRequestSchema.parse(req.body);
    guards(req);
    res.json(
      await handle(async () => service.preview(await loadBankingSessionContext(req, dependencies, true), input)),
    );
  });

  router.post("/revaluations", async (req, res) => {
    const input = createBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.create(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        guards(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(201).json(result);
  });

  router.get("/revaluations/:revaluationId/events", async (req, res) => {
    const query = bankRevaluationEventDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () =>
        service.listEvents(
          await loadBankingSessionContext(req, dependencies),
          identifier.parse(req.params.revaluationId),
          query,
        ),
      ),
    );
  });

  router.get("/revaluations/:revaluationId", async (req, res) => {
    const result = await handle(async () =>
      service.get(await loadBankingSessionContext(req, dependencies), identifier.parse(req.params.revaluationId)),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.patch("/revaluations/:revaluationId", async (req, res) => {
    const input = updateBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.update(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        input,
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluations/:revaluationId/submit", async (req, res) => {
    const input = submitBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.submit(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        input,
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluations/:revaluationId/approve", async (req, res) => {
    const input = approveBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.decide(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        { ...input, action: "approve" },
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluations/:revaluationId/reject", async (req, res) => {
    const input = rejectBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.decide(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        { ...input, action: "reject" },
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluations/:revaluationId/post", async (req, res) => {
    const input = postBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.post(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        input,
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  router.post("/revaluations/:revaluationId/reverse", async (req, res) => {
    const input = reverseBankRevaluationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      service.reverse(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.revaluationId),
        input,
        guards(req, input.expected_version),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });

  return router;
}
