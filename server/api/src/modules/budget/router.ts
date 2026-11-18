import { Router, type Request } from "express";
import busboy from "busboy";
import { z } from "zod";
import {
  budgetQuerySchema,
  budgetScopeSchema,
  budgetPlanInputSchema,
  budgetVersionInputSchema,
  budgetVersionUpdateSchema,
  budgetActionSchema,
  budgetPolicyInputSchema,
  budgetModelInputSchema,
  budgetApplyModelSchema,
  budgetGenerateSchema,
  budgetRequestInputSchema,
  budgetRequestActionSchema,
  budgetImportCommitSchema,
  budgetImportPreviewQuerySchema,
  budgetCommentInputSchema,
  budgetReconcileSchema,
  budgetImportMaxBytes,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { BudgetError } from "./transaction.js";
import { BudgetService } from "./service.js";
import type { SourceBudgetRepository } from "./source-repository.js";

export function createBudgetRouter(
  d: BankingSessionContextDependencies & { repository: SourceBudgetRepository; allowedOrigins: ReadonlySet<string> },
) {
  const router = Router(),
    service = new BudgetService(d.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof BudgetError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  const ctx = (req: Request, write = false) => loadBankingSessionContext(req, d, write);
  const id = (req: Request) => z.string().trim().min(1).max(128).parse(req.params.id);
  const correlation = () => currentRequestContext().correlationId;
  function guard(req: Request, version?: number) {
    if (req.get("origin") && !d.allowedOrigins.has(req.get("origin")!))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "The origin was rejected.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply an idempotency key.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "BUDGET_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/options", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.records.options(await ctx(req), q)));
  });
  router.get("/sources", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.sources(await ctx(req), q)));
  });
  router.get("/workspace", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.records.directory(await ctx(req), q)));
  });
  router.get("/reports", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.report(await ctx(req), q)));
  });
  router.get("/drill", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.reporting.drill(await ctx(req), q)));
  });
  router.get("/history", async (req, res) => {
    const q = budgetQuerySchema.parse(req.query);
    res.json(await handle(async () => service.reporting.history(await ctx(req), q)));
  });
  router.get("/controls/:id", async (req, res) => {
    const q = budgetScopeSchema.parse(req.query);
    res.json(await handle(async () => service.sourceControl(await ctx(req), q.company_id, id(req))));
  });
  router.get("/versions/:id", async (req, res) => {
    const q = budgetScopeSchema.parse(req.query);
    const result = await handle(async () => service.records.detail(await ctx(req), q.company_id, id(req)));
    res.setHeader("etag", `"${result.record.version}"`).json(result);
  });
  router.post("/plans", async (req, res) => {
    const input = budgetPlanInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(await handle(async () => service.records.createPlan(await ctx(req, true), input, key, correlation())));
  });
  router.post("/versions", async (req, res) => {
    const input = budgetVersionInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(await handle(async () => service.records.createVersion(await ctx(req, true), input, key, correlation())));
  });
  router.patch("/versions/:id", async (req, res) => {
    const input = budgetVersionUpdateSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => service.records.updateVersion(await ctx(req, true), id(req), input, key, correlation())),
    );
  });
  router.post("/versions/:id/actions", async (req, res) => {
    const input = budgetActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => service.governance.action(await ctx(req, true), id(req), input, key, correlation())),
    );
  });
  router.post("/generate", async (req, res) => {
    const input = budgetGenerateSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(await handle(async () => service.forecasting.generate(await ctx(req, true), input, key, correlation())));
  });
  router.post("/models", async (req, res) => {
    const input = budgetModelInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(
        await handle(async () => service.governance.model(await ctx(req, true), undefined, input, key, correlation())),
      );
  });
  router.patch("/models/:id", async (req, res) => {
    const input = budgetModelInputSchema.required({ expected_version: true }).parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () => service.governance.model(await ctx(req, true), id(req), input, key, correlation())),
    );
  });
  router.post("/models/apply", async (req, res) => {
    const input = budgetApplyModelSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(await handle(async () => service.governance.applyModel(await ctx(req, true), input, key, correlation())));
  });
  router.put("/policy", async (req, res) => {
    const input = budgetPolicyInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(await handle(async () => service.governance.policy(await ctx(req, true), input, key)));
  });
  router.post("/requests", async (req, res) => {
    const input = budgetRequestInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(await handle(async () => service.governance.request(await ctx(req, true), input, key, correlation())));
  });
  router.post("/requests/:id/actions", async (req, res) => {
    const input = budgetRequestActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        service.governance.requestAction(await ctx(req, true), id(req), input, key, correlation()),
      ),
    );
  });
  router.post("/comments", async (req, res) => {
    const input = budgetCommentInputSchema.parse(req.body),
      key = guard(req);
    res.status(201).json(await handle(async () => service.reporting.comment(await ctx(req, true), input, key)));
  });
  router.post("/reconcile", async (req, res) => {
    const input = budgetReconcileSchema.parse(req.body),
      key = guard(req);
    res.json(await handle(async () => service.reconcile(await ctx(req, true), input.company_id, input.reason, key)));
  });
  router.get("/template", async (req, res) => {
    const q = budgetScopeSchema.parse(req.query);
    const file = await handle(async () => service.files.template(await ctx(req), q.company_id));
    res
      .type("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
      .attachment("budget-template.xlsx")
      .send(file);
  });
  router.get("/export", async (req, res) => {
    const input = z
      .strictObject({
        ...budgetQuerySchema.shape,
        format: z.enum(["csv", "xlsx"]).default("xlsx"),
        allocations: z.enum(["true", "false"]).default("false"),
      })
      .parse(req.query);
    const { format, allocations, ...q } = input;
    const file = await handle(async () => service.files.export(await ctx(req), q, format, allocations === "true"));
    res
      .type(format === "xlsx" ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/csv")
      .attachment(`budget-${allocations === "true" ? "allocations" : "report"}.${format}`)
      .send(file);
  });
  router.post("/imports", async (req, res) => {
    const q = budgetImportPreviewQuerySchema.parse(req.query),
      key = guard(req, q.expected_version),
      context = await ctx(req, true);
    const file = await readUpload(req);
    res
      .status(201)
      .json(
        await handle(() =>
          service.files.preview(
            context,
            q.company_id,
            q.version_id,
            q.expected_version,
            file.buffer,
            file.format,
            key,
            correlation(),
          ),
        ),
      );
  });
  router.post("/imports/:id/commit", async (req, res) => {
    const input = budgetImportCommitSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        service.files.commit(
          await ctx(req, true),
          input.company_id,
          id(req),
          input.expected_version,
          input.reason,
          key,
          correlation(),
        ),
      ),
    );
  });
  return router;
}
function readUpload(req: Request): Promise<{ buffer: Buffer; format: "csv" | "xlsx" }> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let filename = "",
      count = 0,
      failed = false;
    const fail = (message: string) => {
      failed = true;
      reject(new HttpError(400, "BUDGET_FILE_INVALID", message));
    };
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { files: 1, fileSize: budgetImportMaxBytes, fields: 0, parts: 2 },
      });
    } catch {
      fail("Upload one Budget XLSX or CSV file.");
      return;
    }
    parser.on("file", (field, stream, info) => {
      count++;
      filename = info.filename;
      stream.on("limit", () => fail("Budget files must be at most 10 MB."));
      stream.on("data", (chunk) => {
        if (!failed) chunks.push(Buffer.from(chunk));
      });
      stream.on("error", () => fail("The file upload failed."));
      if (field !== "file") fail("Use the file upload field.");
    });
    parser.on("filesLimit", () => fail("Upload one file at a time."));
    parser.on("fieldsLimit", () => fail("Only the Budget file field is accepted."));
    parser.on("partsLimit", () => fail("Upload one file at a time."));
    parser.on("error", () => fail("The file upload is invalid."));
    req.on("aborted", () => fail("The file upload was interrupted."));
    parser.on("close", () => {
      if (failed) return;
      if (count !== 1 || !chunks.length) {
        fail("Select a nonempty spreadsheet.");
        return;
      }
      const extension = filename.toLowerCase().split(".").pop();
      if (extension !== "csv" && extension !== "xlsx") {
        fail("Upload an XLSX or CSV file.");
        return;
      }
      resolve({ buffer: Buffer.concat(chunks), format: extension });
    });
    req.pipe(parser);
  });
}
