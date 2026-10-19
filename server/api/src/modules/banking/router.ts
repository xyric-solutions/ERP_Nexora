import { Router, type Request } from "express";
import { z } from "zod";

import {
  bankAccountDirectoryQuerySchema,
  bankingLedgerAccountDirectoryQuerySchema,
  changeBankAccountStatusRequestSchema,
  createBankAccountRequestSchema,
  decideBankAccountRequestSchema,
  submitBankAccountRequestSchema,
  updateBankAccountRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import { BankingAccountService } from "./accounts/service.js";
import { loadBankingSessionContext } from "./session-context.js";
import { BankingApiError, type SourceBankingRepository } from "./source-repository.js";

export type BankingRepository = Pick<
  SourceBankingRepository,
  | "listCompanies"
  | "listLedgerAccounts"
  | "listAccounts"
  | "accountSummary"
  | "getAccount"
  | "createAccount"
  | "updateAccount"
  | "submitAccount"
  | "decideAccount"
  | "changeStatus"
>;

export interface BankingRouterDependencies {
  repository: BankingRepository;
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function trustedOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowed.has(origin))
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
}

function idempotencyKey(req: Request): string {
  const key = req.get("idempotency-key");
  if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
  return key;
}

const identifier = z.string().trim().min(1).max(128);

export function createBankingRouter(dependencies: BankingRouterDependencies): Router {
  const router = Router();
  const accounts = new BankingAccountService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  async function handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BankingApiError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }

  router.get("/companies", async (req, res) => {
    res.json(await handle(async () => accounts.listCompanies(await loadBankingSessionContext(req, dependencies))));
  });

  router.get("/ledger_accounts", async (req, res) => {
    const query = bankingLedgerAccountDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => accounts.listLedgerAccounts(await loadBankingSessionContext(req, dependencies), query)),
    );
  });

  router.get("/accounts", async (req, res) => {
    const query = bankAccountDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      bank: req.query.bank,
      currency: req.query.currency,
      ledger_account_id: req.query.ledger_account_id,
      state: req.query.state,
      sort_by: req.query.sort_by,
      sort_direction: req.query.sort_direction,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      cursor: req.query.cursor,
    });
    res.json(await handle(async () => accounts.list(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/accounts/summary", async (req, res) => {
    const companyId = identifier.parse(req.query.company_id);
    res.json(await handle(async () => accounts.summary(await loadBankingSessionContext(req, dependencies), companyId)));
  });

  router.get("/accounts/:accountId", async (req, res) => {
    const accountId = identifier.parse(req.params.accountId);
    res.json(await handle(async () => accounts.get(await loadBankingSessionContext(req, dependencies), accountId)));
  });

  router.post("/accounts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createBankAccountRequestSchema.parse(req.body);
    const result = await handle(async () =>
      accounts.create(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });

  router.post("/accounts/:accountId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const accountId = identifier.parse(req.params.accountId);
    const input = updateBankAccountRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        accounts.update(
          await loadBankingSessionContext(req, dependencies, true),
          accountId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  router.post("/accounts/:accountId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const accountId = identifier.parse(req.params.accountId);
    const input = submitBankAccountRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        accounts.submit(
          await loadBankingSessionContext(req, dependencies, true),
          accountId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  router.post("/accounts/:accountId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const accountId = identifier.parse(req.params.accountId);
    const input = decideBankAccountRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        accounts.decide(
          await loadBankingSessionContext(req, dependencies, true),
          accountId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  router.post("/accounts/:accountId/status", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const accountId = identifier.parse(req.params.accountId);
    const input = changeBankAccountStatusRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        accounts.changeStatus(
          await loadBankingSessionContext(req, dependencies, true),
          accountId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });

  return router;
}
