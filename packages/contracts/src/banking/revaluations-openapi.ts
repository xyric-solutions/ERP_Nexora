import { z } from "zod";

import {
  approveBankRevaluationRequestSchema,
  bankRevaluationDetailSchema,
  bankRevaluationDirectorySchema,
  bankRevaluationEventDirectorySchema,
  bankRevaluationPolicyMutationSchema,
  bankRevaluationPolicySchema,
  bankRevaluationMutationResultSchema,
  bankRevaluationPreviewRequestSchema,
  bankRevaluationPreviewSchema,
  createBankRevaluationRequestSchema,
  postBankRevaluationRequestSchema,
  rejectBankRevaluationRequestSchema,
  reverseBankRevaluationRequestSchema,
  submitBankRevaluationRequestSchema,
  updateBankRevaluationRequestSchema,
  upsertBankRevaluationPolicyRequestSchema,
} from "./revaluations.js";
import { bankWorkflowOptionsSchema } from "./workflow-context.js";

export function bankRevaluationPaths() {
  const json = (value: z.ZodType) => z.toJSONSchema(value, { target: "openapi-3.0" });
  const csrf = {
    in: "header",
    name: "x-csrf-token",
    required: true,
    schema: { type: "string", minLength: 43, maxLength: 43 },
  };
  const key = {
    in: "header",
    name: "idempotency-key",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 255 },
  };
  const ifMatch = {
    in: "header",
    name: "if-match",
    required: true,
    description: "Quoted expected_version; must agree with the request body.",
    schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
  };
  const revaluationId = {
    in: "path",
    name: "revaluationId",
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 422, 428, 503].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const response = (description: string, value: z.ZodType, status = "200") => ({
    [status]: { description, content: { "application/json": { schema: json(value) } } },
    ...errors,
  });
  const body = (value: z.ZodType) => ({
    required: true,
    content: { "application/json": { schema: json(value) } },
  });
  const mutation = (operationId: string, value: z.ZodType, description: string) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [revaluationId, csrf, key, ifMatch],
    requestBody: body(value),
    responses: response(description, bankRevaluationMutationResultSchema),
  });

  return {
    "/banking/revaluation-policy": {
      get: {
        operationId: "getBankRevaluationPolicy",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
        ],
        responses: response("Company Bank Revaluation accounting policy", bankRevaluationPolicySchema),
      },
      post: {
        operationId: "upsertBankRevaluationPolicy",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key, { ...ifMatch, required: false }],
        requestBody: body(upsertBankRevaluationPolicyRequestSchema),
        responses: response(
          "Company Bank Revaluation accounting policy persisted",
          bankRevaluationPolicyMutationSchema,
        ),
      },
    },
    "/banking/revaluations": {
      get: {
        operationId: "listBankRevaluations",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          { in: "query", name: "currency", required: false, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
          {
            in: "query",
            name: "bank_account_id",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 128 },
          },
          {
            in: "query",
            name: "states",
            required: false,
            schema: {
              type: "array",
              minItems: 1,
              maxItems: 6,
              items: { type: "string", enum: ["draft", "submitted", "approved", "rejected", "posted", "reversed"] },
            },
          },
          { in: "query", name: "date_from", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "date_to", required: false, schema: { type: "string", format: "date" } },
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
          { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
        ],
        responses: response("Company-scoped Bank Revaluation directory", bankRevaluationDirectorySchema),
      },
      post: {
        operationId: "createBankRevaluation",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(createBankRevaluationRequestSchema),
        responses: response(
          "Bank Revaluation draft created from server-derived evidence",
          bankRevaluationMutationResultSchema,
          "201",
        ),
      },
    },
    "/banking/revaluations/preview": {
      post: {
        operationId: "previewBankRevaluation",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(bankRevaluationPreviewRequestSchema),
        responses: response("Read-only Bank Revaluation calculation preview", bankRevaluationPreviewSchema),
      },
    },
    "/banking/revaluations/approvers": {
      get: {
        operationId: "listBankRevaluationApprovers",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          {
            in: "query",
            name: "selected_id",
            required: false,
            schema: { type: "string", minLength: 1, maxLength: 128 },
          },
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
          { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
        ],
        responses: response("Eligible company-scoped Bank Revaluation approvers", bankWorkflowOptionsSchema),
      },
    },
    "/banking/revaluations/{revaluationId}": {
      get: {
        operationId: "getBankRevaluation",
        security: [{ cookieAuth: [] }],
        parameters: [revaluationId],
        responses: response("Bank Revaluation detail with immutable snapshots", bankRevaluationDetailSchema),
      },
      patch: {
        operationId: "updateBankRevaluation",
        security: [{ cookieAuth: [] }],
        parameters: [revaluationId, csrf, key, ifMatch],
        requestBody: body(updateBankRevaluationRequestSchema),
        responses: response("Bank Revaluation draft updated and recalculated", bankRevaluationMutationResultSchema),
      },
    },
    "/banking/revaluations/{revaluationId}/submit": {
      post: mutation(
        "submitBankRevaluation",
        submitBankRevaluationRequestSchema,
        "Bank Revaluation submitted for independent approval",
      ),
    },
    "/banking/revaluations/{revaluationId}/approve": {
      post: mutation(
        "approveBankRevaluation",
        approveBankRevaluationRequestSchema,
        "Bank Revaluation approved without posting",
      ),
    },
    "/banking/revaluations/{revaluationId}/reject": {
      post: mutation(
        "rejectBankRevaluation",
        rejectBankRevaluationRequestSchema,
        "Bank Revaluation rejected with a reason",
      ),
    },
    "/banking/revaluations/{revaluationId}/post": {
      post: mutation(
        "postBankRevaluation",
        postBankRevaluationRequestSchema,
        "Approved Bank Revaluation posted exactly once",
      ),
    },
    "/banking/revaluations/{revaluationId}/reverse": {
      post: mutation(
        "reverseBankRevaluation",
        reverseBankRevaluationRequestSchema,
        "Posted Bank Revaluation reversed through a compensating journal",
      ),
    },
    "/banking/revaluations/{revaluationId}/events": {
      get: {
        operationId: "listBankRevaluationEvents",
        security: [{ cookieAuth: [] }],
        parameters: [
          revaluationId,
          {
            in: "query",
            name: "limit",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
          },
          { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
        ],
        responses: response("Immutable Bank Revaluation event history", bankRevaluationEventDirectorySchema),
      },
    },
  };
}
