import { Router, type Request } from "express";
import { taxInputSchema, taxUpdateSchema, taxStatusSchema, taxQuerySchema, taxScopeSchema } from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import type { SourceTaxRepository } from "./source-repository.js";
import { TaxError } from "./resolver.js";

export function createTaxRouter(
  d: BankingSessionContextDependencies & { repository: SourceTaxRepository; allowedOrigins: ReadonlySet<string> },
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
      if (error instanceof TaxError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function guard(req: Request, version?: number) {
    if (req.get("origin") && !d.allowedOrigins.has(req.get("origin")!))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "The origin was rejected.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply an idempotency key.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "TAX_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/options", async (req, res) => {
    const q = taxQuerySchema.parse(req.query);
    res.json(await handle(async () => d.repository.options(await loadBankingSessionContext(req, d), q)));
  });
  router.get("/", async (req, res) => {
    const q = taxQuerySchema.parse(req.query);
    res.json(await handle(async () => d.repository.list(await loadBankingSessionContext(req, d), q)));
  });
  router.get("/:id", async (req, res) => {
    const q = taxScopeSchema.parse(req.query);
    res.json(
      await handle(async () =>
        d.repository.get(await loadBankingSessionContext(req, d), q.company_id, String(req.params.id)),
      ),
    );
  });
  router.post("/", async (req, res) => {
    const input = taxInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(await handle(async () => d.repository.save(await loadBankingSessionContext(req, d, true), input, key)));
  });
  router.patch("/:id", async (req, res) => {
    const input = taxUpdateSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        d.repository.save(await loadBankingSessionContext(req, d, true), input, key, String(req.params.id)),
      ),
    );
  });
  router.post("/:id/status", async (req, res) => {
    const input = taxStatusSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        d.repository.status(await loadBankingSessionContext(req, d, true), String(req.params.id), input, key),
      ),
    );
  });
  return router;
}
