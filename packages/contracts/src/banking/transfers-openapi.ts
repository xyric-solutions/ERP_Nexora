import { z } from "zod";

import {
  bankTransferDetailSchema,
  bankTransferDirectorySchema,
  bankTransferMutationResultSchema,
  bankTransferOptionsSchema,
  bankTransferPostingResultSchema,
  bankTransferReversalResultSchema,
  createBankTransferRequestSchema,
  decideBankTransferRequestSchema,
  postBankTransferRequestSchema,
  reverseBankTransferRequestSchema,
  submitBankTransferRequestSchema,
  updateBankTransferRequestSchema,
} from "./index.js";
import { bankWorkflowOptionsSchema, reassignBankApproverRequestSchema } from "./workflow-context.js";

export function bankTransferPaths() {
  const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "openapi-3.0" });
  const pathId = {
    in: "path",
    name: "transferId",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const csrf = { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } };
  const key = {
    in: "header",
    name: "idempotency-key",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 255 },
  };
  const version = {
    in: "header",
    name: "if-match",
    required: false,
    schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
  };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const response = (description: string, schema: z.ZodType, status = "200") => ({
    [status]: { description, content: { "application/json": { schema: json(schema) } } },
    ...errors,
  });
  const action = (operationId: string, input: z.ZodType, output: z.ZodType, description: string) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [pathId, csrf, key, version],
    requestBody: { required: true, content: { "application/json": { schema: json(input) } } },
    responses: response(description, output),
  });
  return {
    "/banking/transfers": {
      get: {
        operationId: "listBankTransfers",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "bank_account_id", schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "state", schema: { type: "string" } },
          { in: "query", name: "posting_date_from", schema: { type: "string", format: "date" } },
          { in: "query", name: "posting_date_to", schema: { type: "string", format: "date" } },
          { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
          { in: "query", name: "sort_by", schema: { type: "string" } },
          { in: "query", name: "sort_direction", schema: { type: "string", enum: ["asc", "desc"] } },
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } },
          { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
        ],
        responses: response("Company-scoped Bank Transfer directory", bankTransferDirectorySchema),
      },
      post: {
        operationId: "createBankTransfer",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: { required: true, content: { "application/json": { schema: json(createBankTransferRequestSchema) } } },
        responses: response("Bank Transfer draft created", bankTransferMutationResultSchema, "201"),
      },
    },
    "/banking/transfers/options": {
      get: {
        operationId: "listBankTransferOptions",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
        ],
        responses: response("Eligible same-company Bank Accounts and Transfer modes", bankTransferOptionsSchema),
      },
    },
    "/banking/transfers/workflow_options": {
      get: {
        operationId: "listTransferWorkflowOptions",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "kind", required: true, schema: { type: "string", enum: ["project", "location", "approver"] } },
          { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
          { in: "query", name: "selected_id", schema: { type: "string", maxLength: 128 } },
          { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } },
        ],
        responses: response("Company-scoped Transfer workflow options", bankWorkflowOptionsSchema),
      },
    },
    "/banking/transfers/{transferId}": {
      get: {
        operationId: "getBankTransfer",
        security: [{ cookieAuth: [] }],
        parameters: [pathId],
        responses: response("Persisted Bank Transfer detail", bankTransferDetailSchema),
      },
      patch: action("updateBankTransfer", updateBankTransferRequestSchema, bankTransferMutationResultSchema, "Draft updated"),
    },
    "/banking/transfers/{transferId}/submit": {
      post: action("submitBankTransfer", submitBankTransferRequestSchema, bankTransferMutationResultSchema, "Transfer submitted"),
    },
    "/banking/transfers/{transferId}/decision": {
      post: action("decideBankTransfer", decideBankTransferRequestSchema, bankTransferMutationResultSchema, "Transfer decided"),
    },
    "/banking/transfers/{transferId}/approver": {
      post: action("reassignBankTransferApprover", reassignBankApproverRequestSchema, bankTransferMutationResultSchema, "Approver reassigned"),
    },
    "/banking/transfers/{transferId}/post": {
      post: action("postBankTransfer", postBankTransferRequestSchema, bankTransferPostingResultSchema, "Transfer posted"),
    },
    "/banking/transfers/{transferId}/reverse": {
      post: action("reverseBankTransfer", reverseBankTransferRequestSchema, bankTransferReversalResultSchema, "Transfer reversed"),
    },
  };
}
