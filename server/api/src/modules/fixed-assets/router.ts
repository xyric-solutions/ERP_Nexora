import { Router, type Request } from "express";
import { z } from "zod";
import {
  assetQuerySchema,
  assetDetailQuerySchema,
  assetCategoryInputSchema,
  assetCreateSchema,
  assetUpdateSchema,
  assetActionSchema,
  assetEventInputSchema,
  assetEventActionSchema,
  assetDepreciationInputSchema,
  assetDepreciationActionSchema,
  assetCompanyPolicyInputSchema,
  assetNominalClassificationInputSchema,
  assetValuationQuerySchema,
  assetJournalQuerySchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { parseSingleFileMultipart } from "../../http/single-file-multipart.js";
import { assetFileMaxBytes } from "./attachments.js";
import { assetAttachmentInputSchema } from "@nexora/contracts";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { AssetError } from "./source-repository.js";
import type { FixedAssetsService } from "./service.js";

const id = z.string().trim().min(1).max(128),
  scope = z.strictObject({ company_id: id });
export function createFixedAssetsRouter(
  dependencies: BankingSessionContextDependencies & {
    service: FixedAssetsService;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router(),
    s = dependencies.service;
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const context = async (req: Request, write = false) => ({
    ...(await loadBankingSessionContext(req, dependencies, write)),
    correlationId: currentRequestContext().correlationId,
  });
  const handle = async <T>(work: () => Promise<T>) => {
    try {
      return await work();
    } catch (error) {
      if (error instanceof AssetError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  };
  function guard(req: Request, version?: number) {
    const origin = req.get("origin"),
      key = req.get("idempotency-key");
    if (origin && !dependencies.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "The request origin was rejected.");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply an idempotency key.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "ASSET_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/options", async (req, res) => {
    const q = scope.parse(req.query);
    res.json(await handle(async () => s.repository.options(await context(req), q.company_id)));
  });
  router.get("/workspace", async (req, res) => {
    const q = assetQuerySchema.parse(req.query);
    res.json(await handle(async () => s.workspace(await context(req), q)));
  });
  router.post("/staged-documents", async (req, res) => {
    const company = scope.parse(req.query),
      key = guard(req),
      actor = await context(req, true);
    const { fields, file } = await parseSingleFileMultipart(req, {
      maxFileBytes: assetFileMaxBytes,
      allowedFields: new Set(["title"]),
      label: "asset category document",
    });
    res
      .status(201)
      .json(
        await handle(() => s.stagedDocuments.upload(actor, { ...fields, company_id: company.company_id }, file, key)),
      );
  });
  router.post("/policies", async (req, res) => {
    const input = assetCompanyPolicyInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(await handle(async () => s.repository.saveCompanyPolicy(await context(req, true), input, key)));
  });
  router.post("/nominals/:id/classification", async (req, res) => {
    const input = assetNominalClassificationInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        s.repository.classifyNominal(await context(req, true), id.parse(req.params.id), input, key),
      ),
    );
  });
  router.get("/dashboard", async (req, res) => {
    const q = assetQuerySchema.parse(req.query);
    res.json(await handle(async () => s.reports.dashboard(await context(req), q)));
  });
  router.get("/reports", async (req, res) => {
    const q = assetQuerySchema.parse(req.query);
    res.json(await handle(async () => s.reports.dashboard(await context(req), q, true)));
  });
  router.get("/sources", async (req, res) => {
    const q = assetQuerySchema.parse(req.query);
    res.json(await handle(async () => s.repository.sources(await context(req), q)));
  });
  router.get("/records", async (req, res) => {
    const q = assetQuerySchema.parse(req.query);
    res.json(await handle(async () => s.repository.list(await context(req), q)));
  });
  router.get("/records/:id", async (req, res) => {
    const q = assetDetailQuerySchema.parse(req.query),
      result = await handle(async () =>
        s.detail(await context(req), q.company_id, id.parse(req.params.id), q.history_offset),
      );
    res.setHeader("etag", `"${result.asset.version}"`);
    res.json(result);
  });
  router.get("/records/:id/valuation", async (req, res) => {
    const q = assetValuationQuerySchema.parse(req.query);
    res.json(await handle(async () => s.valuation(await context(req), q.company_id, id.parse(req.params.id), q.as_of)));
  });
  router.get("/records/:id/accrual-schedule", async (req, res) => {
    res.json(await handle(async () => s.accrualSchedule(await context(req), id.parse(req.params.id), req.query)));
  });
  router.get("/records/:id/journals", async (req, res) => {
    const q = assetJournalQuerySchema.parse(req.query);
    res.json(
      await handle(async () =>
        s.journals(await context(req), q.company_id, id.parse(req.params.id), q.offset, q.limit),
      ),
    );
  });
  router.post("/records/:id/attachments", async (req, res) => {
    const company = scope.parse(req.query);
    const key = guard(req),
      actor = await context(req, true),
      asset = id.parse(req.params.id);
    const { fields, file } = await parseSingleFileMultipart(req, {
      maxFileBytes: assetFileMaxBytes,
      allowedFields: new Set(["title"]),
      label: "asset supporting document",
    });
    const input = assetAttachmentInputSchema.parse({ ...fields, company_id: company.company_id });
    res.status(201).json(await handle(() => s.attachments.upload(actor, asset, input, file, key)));
  });
  router.get("/records/:id/attachments/:attachmentId/content", async (req, res) => {
    const company = scope.parse(req.query),
      asset = id.parse(req.params.id),
      attachment = id.parse(req.params.attachmentId);
    const file = await handle(async () =>
      s.attachments.content(await context(req), company.company_id, asset, attachment),
    );
    res.setHeader("content-type", file.content_type);
    res.setHeader("content-length", file.size_bytes);
    res.setHeader("x-content-type-options", "nosniff");
    res.setHeader(
      "content-disposition",
      `attachment; filename*=UTF-8''${encodeURIComponent(file.file_name).replace(/['()*]/g, (char) => "%" + char.charCodeAt(0).toString(16))}`,
    );
    res.setHeader("content-security-policy", "sandbox; default-src 'none'");
    file.body.on("error", () => res.destroy());
    file.body.pipe(res);
  });
  router.post("/categories", async (req, res) => {
    const input = assetCategoryInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res
      .status(201)
      .json(await handle(async () => s.repository.saveCategory(await context(req, true), null, input, key)));
  });
  router.patch("/categories/:id", async (req, res) => {
    const input = assetCategoryInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        s.repository.saveCategory(await context(req, true), id.parse(req.params.id), input, key),
      ),
    );
  });
  router.post("/records", async (req, res) => {
    const input = assetCreateSchema.parse(req.body),
      key = guard(req);
    res.status(201).json(await handle(async () => s.repository.create(await context(req, true), input, key)));
  });
  router.patch("/records/:id", async (req, res) => {
    const input = assetUpdateSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => s.repository.update(await context(req, true), id.parse(req.params.id), input, key)),
    );
  });
  router.post("/records/:id/actions", async (req, res) => {
    const input = assetActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => s.repository.action(await context(req, true), id.parse(req.params.id), input, key)),
    );
  });
  router.post("/events", async (req, res) => {
    const input = assetEventInputSchema.parse(req.body),
      key = guard(req);
    res.status(201).json(await handle(async () => s.lifecycle.create(await context(req, true), input, key)));
  });
  router.post("/events/:id/actions", async (req, res) => {
    const input = assetEventActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => s.lifecycle.action(await context(req, true), id.parse(req.params.id), input, key)),
    );
  });
  router.post("/depreciation", async (req, res) => {
    const input = assetDepreciationInputSchema.parse(req.body),
      key = guard(req);
    res.status(201).json(await handle(async () => s.depreciation.create(await context(req, true), input, key)));
  });
  router.post("/depreciation/:id/actions", async (req, res) => {
    const input = assetDepreciationActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => s.depreciation.action(await context(req, true), id.parse(req.params.id), input, key)),
    );
  });
  return router;
}
