import { Router, type Request } from "express";
import { z } from "zod";

import {
  bankWorkflowOptionQuerySchema,
  reassignBankApproverRequestSchema,
  bankAccountDirectoryQuerySchema,
  bankPaymentDirectoryQuerySchema,
  bankPaymentNominalAccountDirectoryQuerySchema,
  bankPaymentOptionsQuerySchema,
  bankReceiptDirectoryQuerySchema,
  bankReceiptNominalAccountDirectoryQuerySchema,
  bankReceiptOptionsQuerySchema,
  bankingLedgerAccountDirectoryQuerySchema,
  changeBankAccountStatusRequestSchema,
  createBankAccountRequestSchema,
  createBankPaymentRequestSchema,
  createBankReceiptRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankReceiptRequestSchema,
  decideBankAccountRequestSchema,
  postBankPaymentRequestSchema,
  postBankReceiptRequestSchema,
  reverseBankPaymentRequestSchema,
  reverseBankReceiptRequestSchema,
  submitBankPaymentRequestSchema,
  submitBankReceiptRequestSchema,
  submitBankAccountRequestSchema,
  updateBankPaymentRequestSchema,
  updateBankReceiptRequestSchema,
  updateBankAccountRequestSchema,
  bankTransferDirectoryQuerySchema,
  bankTransferOptionsQuerySchema,
  createBankTransferRequestSchema,
  updateBankTransferRequestSchema,
  submitBankTransferRequestSchema,
  decideBankTransferRequestSchema,
  postBankTransferRequestSchema,
  reverseBankTransferRequestSchema,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import { BankingAccountService } from "./accounts/service.js";
import { BankingPaymentService } from "./payments/service.js";
import type { SourceBankPaymentRepository } from "./payments/source-repository.js";
import { BankingReceiptService } from "./receipts/service.js";
import type { SourceBankReceiptRepository } from "./receipts/source-repository.js";
import {
  createBankStatementReconciliationRouter,
  type BankingStatementStorage,
} from "./statement-reconciliation-router.js";
import type { BankReconciliationAdjustmentRepository } from "./reconciliations/adjustment-service.js";
import type { BankingReconciliationRepository } from "./reconciliations/service.js";
import { createBankRevaluationRouter } from "./revaluations/router.js";
import type { BankingRevaluationRepository } from "./revaluations/service.js";
import type { BankingStatementImportRepository } from "./statements/service.js";
import { BankingTransferService, type BankingTransferRepository } from "./transfers/service.js";
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

export type BankingPaymentRepository = Pick<
  SourceBankPaymentRepository,
  | "list"
  | "options"
  | "workflowOptions"
  | "listNominalAccounts"
  | "get"
  | "create"
  | "update"
  | "submit"
  | "decide"
  | "post"
  | "reverse"
  | "reassign"
>;

export type BankingReceiptRepository = Pick<
  SourceBankReceiptRepository,
  | "list"
  | "options"
  | "workflowOptions"
  | "listNominalAccounts"
  | "get"
  | "create"
  | "update"
  | "submit"
  | "decide"
  | "post"
  | "reverse"
  | "reassign"
>;
export type { BankingTransferRepository } from "./transfers/service.js";

export interface BankingRouterDependencies {
  repository: BankingRepository;
  paymentRepository: BankingPaymentRepository;
  receiptRepository: BankingReceiptRepository;
  transferRepository?: BankingTransferRepository;
  statementRepository?: BankingStatementImportRepository;
  statementStorage?: BankingStatementStorage;
  reconciliationRepository?: BankingReconciliationRepository;
  adjustmentRepository?: BankReconciliationAdjustmentRepository;
  revaluationRepository?: BankingRevaluationRepository;
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

function paymentEtag(version: number): string {
  return `"${version}"`;
}

function verifyPaymentPrecondition(req: Request, expectedVersion: number): void {
  const supplied = req.get("if-match");
  if (supplied === undefined) return;
  const match = /^"([1-9]\d*)"$/.exec(supplied.trim());
  if (!match) {
    throw new HttpError(400, "INVALID_IF_MATCH", "The If-Match header must contain a quoted payment version.");
  }
  if (Number(match[1]) !== expectedVersion) {
    throw new HttpError(
      412,
      "PAYMENT_PRECONDITION_FAILED",
      "The payment version precondition does not match the request.",
    );
  }
}

function receiptEtag(version: number): string {
  return `"${version}"`;
}

function verifyReceiptPrecondition(req: Request, expectedVersion: number): void {
  const supplied = req.get("if-match");
  if (supplied === undefined) return;
  const match = /^"([1-9]\d*)"$/.exec(supplied.trim());
  if (!match) {
    throw new HttpError(400, "INVALID_IF_MATCH", "The If-Match header must contain a quoted receipt version.");
  }
  if (Number(match[1]) !== expectedVersion) {
    throw new HttpError(
      412,
      "RECEIPT_PRECONDITION_FAILED",
      "The receipt version precondition does not match the request.",
    );
  }
}

function verifyTransferPrecondition(req: Request, expectedVersion: number): void {
  const supplied = req.get("if-match");
  if (supplied === undefined) return;
  const match = /^"([1-9]\d*)"$/.exec(supplied.trim());
  if (!match)
    throw new HttpError(400, "INVALID_IF_MATCH", "The If-Match header must contain a quoted Transfer version.");
  if (Number(match[1]) !== expectedVersion)
    throw new HttpError(
      412,
      "TRANSFER_PRECONDITION_FAILED",
      "The Transfer version precondition does not match the request.",
    );
}

const identifier = z.string().trim().min(1).max(128);

export function createBankingRouter(dependencies: BankingRouterDependencies): Router {
  const router = Router();
  const accounts = new BankingAccountService(dependencies.repository);
  const payments = new BankingPaymentService(dependencies.paymentRepository);
  const receipts = new BankingReceiptService(dependencies.receiptRepository);
  const transfers = dependencies.transferRepository
    ? new BankingTransferService(dependencies.transferRepository)
    : null;
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  const statementReconciliationDependencyCount = [
    dependencies.statementRepository,
    dependencies.statementStorage,
    dependencies.reconciliationRepository,
    dependencies.adjustmentRepository,
  ].filter(Boolean).length;
  if (statementReconciliationDependencyCount !== 0 && statementReconciliationDependencyCount !== 4) {
    throw new Error(
      "Statement import, storage, reconciliation, and adjustment repositories must be configured together.",
    );
  }
  if (
    dependencies.statementRepository &&
    dependencies.statementStorage &&
    dependencies.reconciliationRepository &&
    dependencies.adjustmentRepository
  ) {
    router.use(
      createBankStatementReconciliationRouter({
        statementRepository: dependencies.statementRepository,
        statementStorage: dependencies.statementStorage,
        reconciliationRepository: dependencies.reconciliationRepository,
        adjustmentRepository: dependencies.adjustmentRepository,
        authentication: dependencies.authentication,
        sessions: dependencies.sessions,
        secureCookies: dependencies.secureCookies,
        allowedOrigins: dependencies.allowedOrigins,
      }),
    );
  }
  if (dependencies.revaluationRepository) {
    router.use(
      createBankRevaluationRouter({
        repository: dependencies.revaluationRepository,
        authentication: dependencies.authentication,
        sessions: dependencies.sessions,
        secureCookies: dependencies.secureCookies,
        allowedOrigins: dependencies.allowedOrigins,
      }),
    );
  }

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

  router.get("/payments", async (req, res) => {
    const query = bankPaymentDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      bank_account_id: req.query.bank_account_id,
      state: req.query.state,
      posting_date_from: req.query.posting_date_from,
      posting_date_to: req.query.posting_date_to,
      search: req.query.search,
      sort_by: req.query.sort_by,
      sort_direction: req.query.sort_direction,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      cursor: req.query.cursor,
    });
    res.json(await handle(async () => payments.list(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/payments/options", async (req, res) => {
    const query = bankPaymentOptionsQuerySchema.parse({ company_id: req.query.company_id });
    res.json(await handle(async () => payments.options(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/payments/nominal_accounts", async (req, res) => {
    const query = bankPaymentNominalAccountDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => payments.listNominalAccounts(await loadBankingSessionContext(req, dependencies), query)),
    );
  });

  router.get("/payments/workflow_options", async (req, res) => {
    const query = bankWorkflowOptionQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => payments.workflowOptions(await loadBankingSessionContext(req, dependencies), query)),
    );
  });
  router.get("/payments/:paymentId", async (req, res) => {
    const paymentId = identifier.parse(req.params.paymentId);
    const result = await handle(async () =>
      payments.get(await loadBankingSessionContext(req, dependencies), paymentId),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.post("/payments", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createBankPaymentRequestSchema.parse(req.body);
    const result = await handle(async () =>
      payments.create(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.status(201).json(result);
  });

  router.patch("/payments/:paymentId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const paymentId = identifier.parse(req.params.paymentId);
    const input = updateBankPaymentRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.update(
        await loadBankingSessionContext(req, dependencies, true),
        paymentId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.post("/payments/:paymentId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const paymentId = identifier.parse(req.params.paymentId);
    const input = submitBankPaymentRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.submit(
        await loadBankingSessionContext(req, dependencies, true),
        paymentId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.post("/payments/:paymentId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const paymentId = identifier.parse(req.params.paymentId);
    const input = decideBankPaymentRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.decide(
        await loadBankingSessionContext(req, dependencies, true),
        paymentId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.post("/payments/:paymentId/approver", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = reassignBankApproverRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.reassign(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.paymentId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });
  router.post("/payments/:paymentId/post", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const paymentId = identifier.parse(req.params.paymentId);
    const input = postBankPaymentRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.post(
        await loadBankingSessionContext(req, dependencies, true),
        paymentId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.post("/payments/:paymentId/reverse", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const paymentId = identifier.parse(req.params.paymentId);
    const input = reverseBankPaymentRequestSchema.parse(req.body);
    verifyPaymentPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      payments.reverse(
        await loadBankingSessionContext(req, dependencies, true),
        paymentId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", paymentEtag(result.version));
    res.json(result);
  });

  router.get("/receipts", async (req, res) => {
    const query = bankReceiptDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      bank_account_id: req.query.bank_account_id,
      state: req.query.state,
      posting_date_from: req.query.posting_date_from,
      posting_date_to: req.query.posting_date_to,
      search: req.query.search,
      sort_by: req.query.sort_by,
      sort_direction: req.query.sort_direction,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      cursor: req.query.cursor,
    });
    res.json(await handle(async () => receipts.list(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/receipts/options", async (req, res) => {
    const query = bankReceiptOptionsQuerySchema.parse({ company_id: req.query.company_id });
    res.json(await handle(async () => receipts.options(await loadBankingSessionContext(req, dependencies), query)));
  });

  router.get("/receipts/nominal_accounts", async (req, res) => {
    const query = bankReceiptNominalAccountDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => receipts.listNominalAccounts(await loadBankingSessionContext(req, dependencies), query)),
    );
  });

  router.get("/receipts/workflow_options", async (req, res) => {
    const query = bankWorkflowOptionQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => receipts.workflowOptions(await loadBankingSessionContext(req, dependencies), query)),
    );
  });
  router.get("/receipts/:receiptId", async (req, res) => {
    const receiptId = identifier.parse(req.params.receiptId);
    const result = await handle(async () =>
      receipts.get(await loadBankingSessionContext(req, dependencies), receiptId),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  router.post("/receipts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createBankReceiptRequestSchema.parse(req.body);
    const result = await handle(async () =>
      receipts.create(
        await loadBankingSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.status(201).json(result);
  });

  router.patch("/receipts/:receiptId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const receiptId = identifier.parse(req.params.receiptId);
    const input = updateBankReceiptRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.update(
        await loadBankingSessionContext(req, dependencies, true),
        receiptId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  router.post("/receipts/:receiptId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const receiptId = identifier.parse(req.params.receiptId);
    const input = submitBankReceiptRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.submit(
        await loadBankingSessionContext(req, dependencies, true),
        receiptId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  router.post("/receipts/:receiptId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const receiptId = identifier.parse(req.params.receiptId);
    const input = decideBankReceiptRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.decide(
        await loadBankingSessionContext(req, dependencies, true),
        receiptId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  router.post("/receipts/:receiptId/approver", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = reassignBankApproverRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.reassign(
        await loadBankingSessionContext(req, dependencies, true),
        identifier.parse(req.params.receiptId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });
  router.post("/receipts/:receiptId/post", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const receiptId = identifier.parse(req.params.receiptId);
    const input = postBankReceiptRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.post(
        await loadBankingSessionContext(req, dependencies, true),
        receiptId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  router.post("/receipts/:receiptId/reverse", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const receiptId = identifier.parse(req.params.receiptId);
    const input = reverseBankReceiptRequestSchema.parse(req.body);
    verifyReceiptPrecondition(req, input.expected_version);
    const result = await handle(async () =>
      receipts.reverse(
        await loadBankingSessionContext(req, dependencies, true),
        receiptId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", receiptEtag(result.version));
    res.json(result);
  });

  if (transfers)
    router.get("/transfers", async (req, res) => {
      const query = bankTransferDirectoryQuerySchema.parse({
        ...req.query,
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(await handle(async () => transfers.list(await loadBankingSessionContext(req, dependencies), query)));
    });
  if (transfers)
    router.get("/transfers/options", async (req, res) => {
      const query = bankTransferOptionsQuerySchema.parse({ company_id: req.query.company_id });
      res.json(await handle(async () => transfers.options(await loadBankingSessionContext(req, dependencies), query)));
    });
  if (transfers)
    router.get("/transfers/workflow_options", async (req, res) => {
      const query = bankWorkflowOptionQuerySchema.parse({
        ...req.query,
        limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
      });
      res.json(
        await handle(async () => transfers.workflowOptions(await loadBankingSessionContext(req, dependencies), query)),
      );
    });
  if (transfers)
    router.get("/transfers/:transferId", async (req, res) => {
      const result = await handle(async () =>
        transfers.get(await loadBankingSessionContext(req, dependencies), identifier.parse(req.params.transferId)),
      );
      res.setHeader("etag", `"${result.version}"`);
      res.json(result);
    });
  if (transfers)
    router.post("/transfers", async (req, res) => {
      trustedOrigin(req, dependencies.allowedOrigins);
      const input = createBankTransferRequestSchema.parse(req.body);
      const result = await handle(async () =>
        transfers.create(
          await loadBankingSessionContext(req, dependencies, true),
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      );
      res.setHeader("etag", `"${result.version}"`);
      res.status(result.replayed ? 200 : 201).json(result);
    });
  if (transfers)
    router.patch("/transfers/:transferId", async (req, res) => {
      trustedOrigin(req, dependencies.allowedOrigins);
      const input = updateBankTransferRequestSchema.parse(req.body);
      verifyTransferPrecondition(req, input.expected_version);
      const result = await handle(async () =>
        transfers.update(
          await loadBankingSessionContext(req, dependencies, true),
          identifier.parse(req.params.transferId),
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      );
      res.setHeader("etag", `"${result.version}"`);
      res.json(result);
    });
  if (transfers)
    for (const [action, schema, invoke] of [
      [
        "submit",
        submitBankTransferRequestSchema,
        (
          ctx: Awaited<ReturnType<typeof loadBankingSessionContext>>,
          id: string,
          input: never,
          key: string,
          correlation: string,
        ) => transfers.submit(ctx, id, input, key, correlation),
      ],
      [
        "decision",
        decideBankTransferRequestSchema,
        (
          ctx: Awaited<ReturnType<typeof loadBankingSessionContext>>,
          id: string,
          input: never,
          key: string,
          correlation: string,
        ) => transfers.decide(ctx, id, input, key, correlation),
      ],
      [
        "approver",
        reassignBankApproverRequestSchema,
        (
          ctx: Awaited<ReturnType<typeof loadBankingSessionContext>>,
          id: string,
          input: never,
          key: string,
          correlation: string,
        ) => transfers.reassign(ctx, id, input, key, correlation),
      ],
      [
        "post",
        postBankTransferRequestSchema,
        (
          ctx: Awaited<ReturnType<typeof loadBankingSessionContext>>,
          id: string,
          input: never,
          key: string,
          correlation: string,
        ) => transfers.post(ctx, id, input, key, correlation),
      ],
      [
        "reverse",
        reverseBankTransferRequestSchema,
        (
          ctx: Awaited<ReturnType<typeof loadBankingSessionContext>>,
          id: string,
          input: never,
          key: string,
          correlation: string,
        ) => transfers.reverse(ctx, id, input, key, correlation),
      ],
    ] as const) {
      router.post(`/transfers/:transferId/${action}`, async (req, res) => {
        trustedOrigin(req, dependencies.allowedOrigins);
        const input = schema.parse(req.body);
        verifyTransferPrecondition(req, input.expected_version);
        const result = await handle(async () =>
          invoke(
            await loadBankingSessionContext(req, dependencies, true),
            identifier.parse(req.params.transferId),
            input as never,
            idempotencyKey(req),
            currentRequestContext().correlationId,
          ),
        );
        res.setHeader("etag", `"${result.version}"`);
        res.json(result);
      });
    }

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
