import { Router } from "express";
import {
  bankSelfApprovalQuerySchema,
  bankSelfApprovalOptionsQuerySchema,
  changeBankSelfApprovalRequestSchema,
} from "@nexora/contracts";
import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../banking/session-context.js";
import { BankingApiError } from "../banking/source-repository.js";
import type { SourceBankSelfApprovalRepository } from "./bank-self-approval-repository.js";
export type BankSelfApprovalRepository = Pick<SourceBankSelfApprovalRepository, "list" | "options" | "change">;
export function createBankSelfApprovalRouter(
  deps: BankingSessionContextDependencies & {
    repository: BankSelfApprovalRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof BankingApiError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  router.get("/bank_self_approval_options", async (req, res) => {
    const context = await loadBankingSessionContext(req, deps);
    const input = bankSelfApprovalOptionsQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(() => deps.repository.options(context, input)));
  });
  router.get("/bank_self_approval_grants", async (req, res) => {
    const context = await loadBankingSessionContext(req, deps);
    const input = bankSelfApprovalQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(() => deps.repository.list(context, input)));
  });
  router.post("/bank_self_approval_grants", async (req, res) => {
    const origin = req.get("origin");
    if (origin && !deps.allowedOrigins.has(origin))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
    const context = await loadBankingSessionContext(req, deps, true),
      input = changeBankSelfApprovalRequestSchema.parse(req.body),
      key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
    if (req.get("if-match") !== `"${input.expected_version}"`)
      throw new HttpError(
        412,
        "BANK_GRANT_PRECONDITION_FAILED",
        "Supply the quoted current grant version in If-Match.",
      );
    const result = await handle(() =>
      deps.repository.change(context, input, key, currentRequestContext().correlationId),
    );
    res.setHeader("etag", `"${result.record.version}"`);
    res.json(result);
  });
  return router;
}
