import { Readable } from "node:stream";

import busboy from "busboy";
import { Router, type Request } from "express";
import { z } from "zod";

import {
  bankStatementFileFormatSchema,
  bankStatementImportDirectoryQuerySchema,
  bankStatementImportOptionsQuerySchema,
  bankStatementMappingProfileDirectoryQuerySchema,
  bankStatementUploadFieldsSchema,
  createBankReconciliationAdjustmentRequestSchema,
  createBankReconciliationMatchRequestSchema,
  createBankReconciliationRequestSchema,
  createBankStatementMappingProfileRequestSchema,
  decideBankReconciliationAdjustmentRequestSchema,
  decideBankReconciliationMatchRequestSchema,
  decideBankReconciliationRequestSchema,
  finalizeBankStatementImportRequestSchema,
  postBankReconciliationAdjustmentRequestSchema,
  reverseBankReconciliationAdjustmentRequestSchema,
  submitBankReconciliationAdjustmentRequestSchema,
  submitBankReconciliationRequestSchema,
  unmatchBankReconciliationRequestSchema,
  updateBankReconciliationAdjustmentRequestSchema,
  updateBankStatementImportMappingRequestSchema,
  updateBankStatementLineRequestSchema,
  updateBankStatementMappingProfileRequestSchema,
  validateBankStatementImportRequestSchema,
  bankReconciliationDirectoryQuerySchema,
  bankReconciliationSetupQuerySchema,
  setBankReconciliationManualSelectionRequestSchema,
} from "@nexora/contracts";
import type { ObjectStorage } from "@nexora/domain/storage";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import { BankReconciliationAdjustmentService } from "./reconciliations/adjustment-service.js";
import type { BankReconciliationAdjustmentRepository } from "./reconciliations/adjustment-service.js";
import { BankingReconciliationService, type BankingReconciliationRepository } from "./reconciliations/service.js";
import { loadBankingSessionContext } from "./session-context.js";
import { BankingApiError, type BankingActorContext } from "./source-repository.js";
import { BankingStatementImportService, type BankingStatementImportRepository } from "./statements/service.js";

const identifier = z.string().trim().min(1).max(128);
const MAX_STATEMENT_BYTES = 25 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_STATEMENT_BYTES + 64 * 1024;
const allowedUploadFields = new Set([
  "company_id",
  "bank_account_id",
  "statement_reference",
  "date_format",
  "mapping_profile_id",
  "supersedes_import_id",
]);

export type BankingStatementStorage = Pick<ObjectStorage, "writeBounded" | "readBounded" | "remove">;

export interface BankStatementReconciliationRouterDependencies {
  statementRepository: BankingStatementImportRepository;
  statementStorage: BankingStatementStorage;
  reconciliationRepository: BankingReconciliationRepository;
  adjustmentRepository: BankReconciliationAdjustmentRepository;
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function trustedOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowed.has(origin)) {
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
  }
}

function idempotencyKey(req: Request): string {
  const key = req.get("idempotency-key");
  if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(key)) {
    throw new HttpError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
  }
  return key;
}

function etag(version: number): string {
  return `"${version}"`;
}

function verifyVersionPrecondition(req: Request, expectedVersion: number, resource: string): void {
  const supplied = req.get("if-match");
  if (supplied === undefined) {
    throw new HttpError(428, "PRECONDITION_REQUIRED", `A quoted ${resource} version is required in If-Match.`);
  }
  const match = /^"([1-9]\d*)"$/u.exec(supplied.trim());
  if (!match) {
    throw new HttpError(400, "INVALID_IF_MATCH", `If-Match must contain a quoted ${resource} version.`);
  }
  if (Number(match[1]) !== expectedVersion) {
    throw new HttpError(412, "PRECONDITION_FAILED", `The ${resource} version does not match the request.`);
  }
}

function requirePermission(context: BankingActorContext, permission: string): void {
  if (!context.actor.permissions.includes(permission)) {
    throw new HttpError(403, "PERMISSION_DENIED", "You are not permitted to perform this Banking operation.");
  }
}

async function parseStatementMultipart(req: Request): Promise<{
  fields: Record<string, string>;
  file: { originalFilename: string; body: Buffer };
}> {
  const contentLength = req.get("content-length");
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_MULTIPART_BYTES)) {
    throw new HttpError(413, "STATEMENT_FILE_SIZE_INVALID", "The multipart request exceeds the safe size limit.");
  }
  const contentType = req.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("multipart/form-data;")) {
    throw new HttpError(415, "STATEMENT_MULTIPART_REQUIRED", "Use multipart/form-data for Bank Statement uploads.");
  }

  return new Promise((resolve, reject) => {
    let parser: ReturnType<typeof busboy>;
    try {
      parser = busboy({
        headers: req.headers,
        limits: { fileSize: MAX_STATEMENT_BYTES, files: 1, fields: 6, parts: 7, fieldSize: 4_096 },
      });
    } catch {
      reject(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "The multipart request is invalid."));
      return;
    }
    const fields: Record<string, string> = {};
    const chunks: Buffer[] = [];
    let originalFilename = "";
    let fileSeen = false;
    let failure: Error | null = null;
    const fail = (error: Error) => {
      failure ??= error;
    };

    parser.on("field", (name, value, information) => {
      if (!allowedUploadFields.has(name) || name in fields || information.nameTruncated || information.valueTruncated) {
        fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "The multipart fields are invalid."));
        return;
      }
      fields[name] = value;
    });
    parser.on("file", (name, file, information) => {
      if (name !== "file" || fileSeen) {
        fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "Exactly one Bank Statement file is required."));
        file.resume();
        return;
      }
      fileSeen = true;
      originalFilename = information.filename;
      file.on("data", (chunk: Buffer) => chunks.push(chunk));
      file.on("limit", () =>
        fail(new HttpError(413, "STATEMENT_FILE_SIZE_INVALID", "The Bank Statement exceeds 25 MiB.")),
      );
      file.on("error", () =>
        fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "The Bank Statement stream is invalid.")),
      );
    });
    parser.on("filesLimit", () =>
      fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "Exactly one Bank Statement file is required.")),
    );
    parser.on("fieldsLimit", () =>
      fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "Too many multipart fields were supplied.")),
    );
    parser.on("partsLimit", () =>
      fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "Too many multipart parts were supplied.")),
    );
    parser.on("error", () =>
      fail(new HttpError(400, "STATEMENT_MULTIPART_INVALID", "The multipart request is invalid.")),
    );
    parser.on("close", () => {
      if (failure) {
        reject(failure);
        return;
      }
      const body = Buffer.concat(chunks);
      if (!fileSeen || !originalFilename || body.length === 0) {
        reject(new HttpError(400, "STATEMENT_FILE_REQUIRED", "A non-empty Bank Statement file is required."));
        return;
      }
      resolve({ fields, file: { originalFilename, body } });
    });
    req.on("aborted", () => fail(new HttpError(400, "STATEMENT_MULTIPART_ABORTED", "The upload was interrupted.")));
    req.pipe(parser);
  });
}

export function createBankStatementReconciliationRouter(
  dependencies: BankStatementReconciliationRouterDependencies,
): Router {
  const router = Router();
  const statements = new BankingStatementImportService(dependencies.statementRepository, dependencies.statementStorage);
  const reconciliations = new BankingReconciliationService(dependencies.reconciliationRepository);
  const adjustments = new BankReconciliationAdjustmentService(dependencies.adjustmentRepository);

  async function handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof BankingApiError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }

  async function readContext(req: Request) {
    return loadBankingSessionContext(req, dependencies);
  }

  async function mutationContext(req: Request) {
    trustedOrigin(req, dependencies.allowedOrigins);
    return loadBankingSessionContext(req, dependencies, true);
  }

  router.get("/statement_import_options", async (req, res) => {
    const query = bankStatementImportOptionsQuerySchema.parse({ company_id: req.query.company_id });
    res.json(await handle(async () => statements.options(await readContext(req), query)));
  });

  router.get("/statement_import_templates/:format", async (req, res) => {
    const context = await readContext(req);
    requirePermission(context, "banking.statement_import.read");
    const template = statements.template(bankStatementFileFormatSchema.parse(req.params.format));
    res.setHeader("content-disposition", `attachment; filename="${template.filename}"`);
    res.type(template.contentType).send(template.body);
  });

  router.get("/statement_imports", async (req, res) => {
    const query = bankStatementImportDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => statements.list(await readContext(req), query)));
  });

  router.get("/statement_imports/:id", async (req, res) => {
    const result = await handle(async () => statements.get(await readContext(req), identifier.parse(req.params.id)));
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  router.post("/statement_imports", async (req, res) => {
    const context = await mutationContext(req);
    const key = idempotencyKey(req);
    const upload = await parseStatementMultipart(req);
    const fields = bankStatementUploadFieldsSchema.parse({
      ...upload.fields,
      mapping_profile_id: upload.fields.mapping_profile_id || undefined,
      supersedes_import_id: upload.fields.supersedes_import_id || undefined,
    });
    const result = await handle(async () =>
      statements.upload(
        context,
        fields,
        {
          originalFilename: upload.file.originalFilename,
          sizeBytes: upload.file.body.length,
          body: Readable.from(upload.file.body),
        },
        key,
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.version));
    res.status(result.replayed ? 200 : 201).json(result);
  });

  router.patch("/statement_imports/:id/mapping", async (req, res) => {
    const context = await mutationContext(req);
    const input = updateBankStatementImportMappingRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "statement import");
    const result = await handle(async () =>
      statements.updateMapping(
        context,
        identifier.parse(req.params.id),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  router.patch("/statement_imports/:id/lines/:lineId", async (req, res) => {
    const context = await mutationContext(req);
    const input = updateBankStatementLineRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "statement line");
    const result = await handle(async () =>
      statements.updateLine(
        context,
        identifier.parse(req.params.id),
        identifier.parse(req.params.lineId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  for (const [action, schema, invoke] of [
    [
      "validate",
      validateBankStatementImportRequestSchema,
      (context: BankingActorContext, id: string, input: never, key: string, correlationId: string) =>
        statements.validate(context, id, input, key, correlationId),
    ],
    [
      "finalize",
      finalizeBankStatementImportRequestSchema,
      (context: BankingActorContext, id: string, input: never, key: string, correlationId: string) =>
        statements.finalize(context, id, input, key, correlationId),
    ],
  ] as const) {
    router.post(`/statement_imports/:id/${action}`, async (req, res) => {
      const context = await mutationContext(req);
      const input = schema.parse(req.body);
      verifyVersionPrecondition(req, input.expected_version, "statement import");
      const result = await handle(async () =>
        invoke(
          context,
          identifier.parse(req.params.id),
          input as never,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      );
      res.setHeader("etag", etag(result.version));
      res.json(result);
    });
  }

  router.get("/statement_mapping_profiles", async (req, res) => {
    const query = bankStatementMappingProfileDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => statements.listMappingProfiles(await readContext(req), query)));
  });

  router.post("/statement_mapping_profiles", async (req, res) => {
    const context = await mutationContext(req);
    const input = createBankStatementMappingProfileRequestSchema.parse(req.body);
    const result = await handle(async () =>
      statements.createMappingProfile(context, input, idempotencyKey(req), currentRequestContext().correlationId),
    );
    res.setHeader("etag", etag(result.version));
    res.status(201).json(result);
  });

  router.patch("/statement_mapping_profiles/:profileId", async (req, res) => {
    const context = await mutationContext(req);
    const input = updateBankStatementMappingProfileRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "mapping profile");
    const result = await handle(async () =>
      statements.updateMappingProfile(
        context,
        identifier.parse(req.params.profileId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  router.get("/reconciliations", async (req, res) => {
    const query = bankReconciliationDirectoryQuerySchema.parse({
      ...req.query,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => reconciliations.list(await readContext(req), query)));
  });

  router.get("/reconciliation_setup", async (req, res) => {
    const query = bankReconciliationSetupQuerySchema.parse(req.query);
    res.json(await handle(async () => reconciliations.setup(await readContext(req), query)));
  });

  router.get("/reconciliations/:id", async (req, res) => {
    const result = await handle(async () =>
      reconciliations.get(await readContext(req), identifier.parse(req.params.id)),
    );
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  router.post("/reconciliations", async (req, res) => {
    const context = await mutationContext(req);
    const input = createBankReconciliationRequestSchema.parse(req.body);
    const result = await handle(async () =>
      reconciliations.create(context, input, idempotencyKey(req), currentRequestContext().correlationId),
    );
    res.setHeader("etag", etag(result.version));
    res.status(result.replayed ? 200 : 201).json(result);
  });

  router.post("/reconciliations/:id/matches", async (req, res) => {
    const context = await mutationContext(req);
    const input = createBankReconciliationMatchRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "reconciliation");
    const result = await handle(async () =>
      reconciliations.createMatch(
        context,
        identifier.parse(req.params.id),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.reconciliation_version));
    res.json(result);
  });

  router.post("/reconciliations/:id/manual_selections", async (req, res) => {
    const context = await mutationContext(req);
    const input = setBankReconciliationManualSelectionRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "reconciliation");
    const result = await handle(async () =>
      reconciliations.setManualSelection(
        context,
        identifier.parse(req.params.id),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.reconciliation_version));
    res.json(result);
  });

  router.post("/reconciliations/:id/matches/:matchId/decision", async (req, res) => {
    const context = await mutationContext(req);
    const input = decideBankReconciliationMatchRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "match");
    const result = await handle(async () =>
      reconciliations.decideMatch(
        context,
        identifier.parse(req.params.id),
        identifier.parse(req.params.matchId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.reconciliation_version));
    res.json(result);
  });

  router.delete("/reconciliations/:id/matches/:matchId", async (req, res) => {
    const context = await mutationContext(req);
    const input = unmatchBankReconciliationRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "match");
    const result = await handle(async () =>
      reconciliations.unmatch(
        context,
        identifier.parse(req.params.id),
        identifier.parse(req.params.matchId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.reconciliation_version));
    res.json(result);
  });

  for (const [action, schema, invoke] of [
    [
      "submit",
      submitBankReconciliationRequestSchema,
      (context: BankingActorContext, id: string, input: never, key: string, correlationId: string) =>
        reconciliations.submit(context, id, input, key, correlationId),
    ],
    [
      "decision",
      decideBankReconciliationRequestSchema,
      (context: BankingActorContext, id: string, input: never, key: string, correlationId: string) =>
        reconciliations.decide(context, id, input, key, correlationId),
    ],
  ] as const) {
    router.post(`/reconciliations/:id/${action}`, async (req, res) => {
      const context = await mutationContext(req);
      const input = schema.parse(req.body);
      verifyVersionPrecondition(req, input.expected_version, "reconciliation");
      const result = await handle(async () =>
        invoke(
          context,
          identifier.parse(req.params.id),
          input as never,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      );
      res.setHeader("etag", etag(result.version));
      res.json(result);
    });
  }

  router.post("/reconciliations/:id/adjustments", async (req, res) => {
    const context = await mutationContext(req);
    const input = createBankReconciliationAdjustmentRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "reconciliation");
    const result = await handle(async () =>
      adjustments.create(
        context,
        identifier.parse(req.params.id),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.adjustment.version));
    res.status(result.replayed ? 200 : 201).json(result);
  });

  router.get("/reconciliations/:id/adjustments/:adjustmentId", async (req, res) => {
    const result = await handle(async () =>
      adjustments.get(
        await readContext(req),
        identifier.parse(req.params.id),
        identifier.parse(req.params.adjustmentId),
      ),
    );
    res.setHeader("etag", etag(result.version));
    res.json(result);
  });

  router.patch("/reconciliations/:id/adjustments/:adjustmentId", async (req, res) => {
    const context = await mutationContext(req);
    const input = updateBankReconciliationAdjustmentRequestSchema.parse(req.body);
    verifyVersionPrecondition(req, input.expected_version, "adjustment");
    const result = await handle(async () =>
      adjustments.update(
        context,
        identifier.parse(req.params.id),
        identifier.parse(req.params.adjustmentId),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.setHeader("etag", etag(result.adjustment.version));
    res.json(result);
  });

  for (const [action, schema, invoke] of [
    [
      "submit",
      submitBankReconciliationAdjustmentRequestSchema,
      (
        context: BankingActorContext,
        reconciliationId: string,
        adjustmentId: string,
        input: never,
        key: string,
        correlationId: string,
      ) => adjustments.submit(context, reconciliationId, adjustmentId, input, key, correlationId),
    ],
    [
      "decision",
      decideBankReconciliationAdjustmentRequestSchema,
      (
        context: BankingActorContext,
        reconciliationId: string,
        adjustmentId: string,
        input: never,
        key: string,
        correlationId: string,
      ) => adjustments.decide(context, reconciliationId, adjustmentId, input, key, correlationId),
    ],
    [
      "post",
      postBankReconciliationAdjustmentRequestSchema,
      (
        context: BankingActorContext,
        reconciliationId: string,
        adjustmentId: string,
        input: never,
        key: string,
        correlationId: string,
      ) => adjustments.post(context, reconciliationId, adjustmentId, input, key, correlationId),
    ],
    [
      "reverse",
      reverseBankReconciliationAdjustmentRequestSchema,
      (
        context: BankingActorContext,
        reconciliationId: string,
        adjustmentId: string,
        input: never,
        key: string,
        correlationId: string,
      ) => adjustments.reverse(context, reconciliationId, adjustmentId, input, key, correlationId),
    ],
  ] as const) {
    router.post(`/reconciliations/:id/adjustments/:adjustmentId/${action}`, async (req, res) => {
      const context = await mutationContext(req);
      const input = schema.parse(req.body);
      verifyVersionPrecondition(req, input.expected_version, "adjustment");
      const result = await handle(async () =>
        invoke(
          context,
          identifier.parse(req.params.id),
          identifier.parse(req.params.adjustmentId),
          input as never,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      );
      res.setHeader("etag", etag(result.adjustment.version));
      res.json(result);
    });
  }

  return router;
}
