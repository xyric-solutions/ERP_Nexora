import { Router, type Request } from "express";
import { z } from "zod";
import {
  subledgerActionSchema,
  subledgerOperationRequestSchema,
  subledgerPartyInputSchema,
  subledgerPartyConfigurationInputSchema,
  subledgerPolicyInputSchema,
  subledgerQuerySchema,
  subledgerSupplierQuerySchema,
  subledgerReportQuerySchema,
  purchaseAccountingPrepareSchema,
  connectedReportQuerySchema,
  customerMasterQuerySchema,
  customerMasterScopeSchema,
  customerMasterInputSchema,
  customerMasterUpdateSchema,
} from "@nexora/contracts";
import { HttpError } from "../../../http/errors.js";
import { loadBankingSessionContext, type BankingSessionContextDependencies } from "../../banking/session-context.js";
import { SubledgerError, type SourceSubledgerRepository } from "./source-repository.js";
import { SubledgerReports } from "./reports.js";
import { ConnectedReports } from "./connected-reports.js";

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
  const connectedReports = new ConnectedReports(dependencies.repository);
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
  router.get("/supplier-masters", async (req, res) => {
    const query = subledgerSupplierQuerySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.supplierMasters(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });
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
  router.get("/connected-reports", async (req, res) => {
    const query = connectedReportQuerySchema.parse(req.query);
    res.json(await handle(async () => connectedReports.run(await loadBankingSessionContext(req, dependencies), query)));
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
  router.get("/customers", async (req, res) => {
    const query = customerMasterQuerySchema.parse(req.query);
    res.json(
      await handle(async () =>
        dependencies.repository.customerMasters(await loadBankingSessionContext(req, dependencies), query),
      ),
    );
  });
  router.get("/customers/:id", async (req, res) => {
    const scope = customerMasterScopeSchema.parse(req.query);
    const id = z.string().trim().min(1).max(128).parse(req.params.id);
    res.json(
      await handle(async () =>
        dependencies.repository.customerMaster(
          await loadBankingSessionContext(req, dependencies),
          scope.company_id,
          id,
        ),
      ),
    );
  });
  router.post("/customers", async (req, res) => {
    const input = customerMasterInputSchema.parse(req.body);
    const key = guard(req);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.createCustomerMaster(
            await loadBankingSessionContext(req, dependencies, true),
            input,
            key,
          ),
        ),
      );
  });
  router.put("/customers/:id", async (req, res) => {
    const input = customerMasterUpdateSchema.parse(req.body);
    const key = guard(req, input.expected_version);
    const id = z.string().trim().min(1).max(128).parse(req.params.id);
    res.json(
      await handle(async () =>
        dependencies.repository.updateCustomerMaster(
          await loadBankingSessionContext(req, dependencies, true),
          id,
          input,
          key,
        ),
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
  router.post("/parties/:id/configuration", async (req, res) => {
    const input = subledgerPartyConfigurationInputSchema.parse(req.body);
    const key = guard(req, input.expected_version);
    const id = z.string().trim().min(1).max(128).parse(req.params.id);
    res.json(
      await handle(async () =>
        dependencies.repository.configureParty(
          await loadBankingSessionContext(req, dependencies, true),
          id,
          input,
          key,
        ),
      ),
    );
  });
  router.post("/operations", async (req, res) => {
    const input = subledgerOperationRequestSchema.parse(req.body),
      key = guard(req);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.create(await loadBankingSessionContext(req, dependencies, true), input, key),
        ),
      );
  });
  router.post("/purchase/:id/prepare", async (req, res) => {
    const input = purchaseAccountingPrepareSchema.parse(req.body),
      key = guard(req, input.expected_version);
    res
      .status(201)
      .json(
        await handle(async () =>
          dependencies.repository.preparePurchase(
            await loadBankingSessionContext(req, dependencies, true),
            z.string().trim().min(1).max(128).parse(req.params.id),
            input,
            key,
          ),
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
