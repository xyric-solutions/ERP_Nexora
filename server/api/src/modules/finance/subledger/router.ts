import { Router, type Request } from "express";
import {
  subledgerActionSchema,
  subledgerOperationInputSchema,
  subledgerPartyInputSchema,
  subledgerPolicyInputSchema,
  subledgerQuerySchema,
  subledgerReportQuerySchema,
} from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import { SubledgerError, type SourceSubledgerRepository } from "./source-repository.js";
import { SubledgerReports } from "./reports.js";

export function createSubledgerRouter(
  dependencies: BankingSessionContextDependencies & {
    repository: SourceSubledgerRepository;
    allowedOrigins: ReadonlySet<string>;
  },
) {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });
  const reports = new SubledgerReports(dependencies.repository);
  async function handle<T>(work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (error instanceof SubledgerError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }
  function guard(req: Request, version?: number) {
    if (req.get("origin") && !dependencies.allowedOrigins.has(req.get("origin")!))
      throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "The origin was rejected.");
    const key = req.get("idempotency-key");
    if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "Supply an idempotency key.");
    if (version !== undefined && req.get("if-match") !== `"${version}"`)
      throw new HttpError(412, "SUBLEDGER_PRECONDITION_FAILED", "Supply the quoted current version in If-Match.");
    return key;
  }
  router.get("/workspace", async (req, res) => {
    const query = subledgerQuerySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.workspace(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });
  router.get("/reports", async (req, res) => {
    const query = subledgerReportQuerySchema.parse(req.query);
    res.json(await handle(async () => reports.run(await loadBankingSessionContext(req, dependencies), query)));
  });
  router.post("/parties", async (req, res) => {
    const input = subledgerPartyInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.createParty(await loadBankingSessionContext(req, dependencies, true), input, key),
        ),
      );
  });
  router.post("/policy", async (req, res) => {
    const input = subledgerPolicyInputSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res.json(
      await handle(async () =>
        dependencies.repository.configure(await loadBankingSessionContext(req, dependencies, true), input, key),
      ),
    );
  });
  router.post("/operations", async (req, res) => {
    const input = subledgerOperationInputSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.create(await loadBankingSessionContext(req, dependencies, true), input, key),
        ),
      );
  });
  router.post("/operations/:id/actions", async (req, res) => {
    const input = subledgerActionSchema.parse(req.body),
      key = guard(req, input.expected_version);
    const id = String(req.params.id);
    if (!/^[a-f0-9-]{36}$/.test(id)) throw new HttpError(400, "INVALID_ID", "Select a valid operation.");
    res.json(
      await handle(async () =>
        dependencies.repository.action(await loadBankingSessionContext(req, dependencies, true), id, input, key),
      ),
    );
  });
  return router;
}
