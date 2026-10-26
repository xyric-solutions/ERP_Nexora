import { Router } from "express";
import { z } from "zod";
import {
  importChartTemplateRequestSchema,
  chartTemplateQuerySchema,
  chartTemplateNodeQuerySchema,
  publishChartTemplateRequestSchema,
  chartCompanyPreviewQuerySchema,
  adoptCompanyChartRequestSchema,
  classifyChartNominalRequestSchema,
} from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { currentRequestContext } from "../../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import { ChartTemplateService, type ChartTemplateRepository } from "./service.js";
import { ChartTemplateError } from "./source-repository.js";
export function createChartTemplateRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: ChartTemplateRepository;
    allowedOrigins: ReadonlySet<string>;
  },
): Router {
  const router = Router(),
    service = new ChartTemplateService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof ChartTemplateError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  router.get("/", async (req, res) => {
    const query = chartTemplateQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => service.list(await loadBankingSessionContext(req, dependencies), query)));
  });
  router.post("/:templateId/company_adoption", async (req, res) => {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    const context = await loadBankingSessionContext(req, dependencies, true);
    const id = z.string().min(1).max(128).parse(req.params.templateId),
      input = adoptCompanyChartRequestSchema.parse(req.body);
    if (req.get("if-match") !== `"${input.expected_template_version}"`)
      throw new HttpError(412, "TEMPLATE_PRECONDITION_FAILED", "Supply the quoted template version in If-Match.");
    res
      .status(201)
      .json(await handle(() => service.adoptCompany(context, id, input, key, currentRequestContext().correlationId)));
  });
  router.post("/company_nominals/:nominalId/classification", async (req, res) => {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    const context = await loadBankingSessionContext(req, dependencies, true);
    const id = z.string().min(1).max(128).parse(req.params.nominalId),
      input = classifyChartNominalRequestSchema.parse(req.body);
    if (req.get("if-match") !== `"${input.expected_version}"`)
      throw new HttpError(412, "NOMINAL_PRECONDITION_FAILED", "Supply the quoted nominal version in If-Match.");
    res.json(
      await handle(() => service.classifyNominal(context, id, input, key, currentRequestContext().correlationId)),
    );
  });
  router.get("/:templateId/nodes", async (req, res) => {
    const query = chartTemplateNodeQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    const id = z.string().min(1).max(128).parse(req.params.templateId);
    res.json(await handle(async () => service.nodes(await loadBankingSessionContext(req, dependencies), id, query)));
  });
  router.get("/:templateId/company_preview", async (req, res) => {
    const query = chartCompanyPreviewQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    const id = z.string().min(1).max(128).parse(req.params.templateId);
    res.json(
      await handle(async () => service.companyPreview(await loadBankingSessionContext(req, dependencies), id, query)),
    );
  });
  router.get("/:templateId", async (req, res) => {
    const id = z.string().min(1).max(128).parse(req.params.templateId);
    const result = await handle(async () => service.get(await loadBankingSessionContext(req, dependencies), id));
    res.setHeader("etag", `"${result.version}"`);
    res.json(result);
  });
  router.post(["/", "/:templateId/publish"], async (req, res) => {
    const origin = req.get("origin");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    const context = await loadBankingSessionContext(req, dependencies, true);
    if (req.params.templateId) {
      const id = z.string().min(1).max(128).parse(req.params.templateId),
        input = publishChartTemplateRequestSchema.parse(req.body);
      if (req.get("if-match") !== `"${input.expected_version}"`)
        throw new HttpError(412, "TEMPLATE_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
      res.json(await handle(() => service.publish(context, id, input, key, currentRequestContext().correlationId)));
    } else {
      const input = importChartTemplateRequestSchema.parse(req.body);
      res
        .status(201)
        .json(await handle(() => service.import(context, input, key, currentRequestContext().correlationId)));
    }
  });
  return router;
}
