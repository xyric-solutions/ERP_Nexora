import { z } from "zod";
import { connectedReportIds, connectedReportSchema } from "./connected-reports.js";
import {
  subledgerActionSchema,
  subledgerOperationRequestSchema,
  subledgerOperationSchema,
  subledgerPartyInputSchema,
  subledgerPartySchema,
  subledgerPartyConfigurationInputSchema,
  subledgerPartyConfigurationSchema,
  subledgerSupplierDirectorySchema,
  subledgerPolicyInputSchema,
  subledgerPolicySchema,
  subledgerWorkspaceSchema,
  subledgerReportSchema,
  purchaseAccountingPrepareSchema,
} from "./subledger.js";

export function subledgerPaths() {
  const json = (schema: z.ZodType) => ({
    "application/json": { schema: z.toJSONSchema(schema, { target: "openapi-3.0" }) },
  });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 422, 503].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const scope = { in: "query", name: "company_id", required: true, schema: { type: "string" } };
  const query = [
    scope,
    { in: "query", name: "as_of", required: true, schema: { type: "string", format: "date" } },
    ...["party_id", "side", "currency"].map((name) => ({
      in: "query",
      name,
      required: false,
      schema: { type: "string" },
    })),
    { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100 } },
    { in: "query", name: "offset", required: false, schema: { type: "integer", minimum: 0, maximum: 1000000 } },
  ];
  const mutation = ["x-csrf-token", "idempotency-key"].map((name) => ({
    in: "header",
    name,
    required: true,
    schema: { type: "string" },
  }));
  const post = (operationId: string, input: z.ZodType, output: z.ZodType, version = false, status = 200) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...mutation,
      ...(version ? [{ in: "header", name: "if-match", required: true, schema: { type: "string" } }] : []),
    ],
    requestBody: { required: true, content: json(input) },
    responses: { [status]: { description: "Validated financial result", content: json(output) }, ...errors },
  });
  return {
    "/finance/subledger/supplier-masters": {
      get: {
        operationId: "getSubledgerSupplierMasters",
        security: [{ cookieAuth: [] }],
        parameters: [
          scope,
          { in: "query", name: "search", schema: { type: "string", maxLength: 100 } },
          { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 20 } },
          { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 1000000, default: 0 } },
        ],
        responses: {
          200: {
            description: "Company supplier identities without banking or profile details",
            content: json(subledgerSupplierDirectorySchema),
          },
          ...errors,
        },
      },
    },
    "/finance/subledger/connected-reports": {
      get: {
        operationId: "getConnectedReport",
        security: [{ cookieAuth: [] }],
        parameters: [
          ...query.filter((parameter) => !["side", "party_id"].includes(parameter.name)),
          { in: "query", name: "report", required: true, schema: { type: "string", enum: connectedReportIds } },
          ...["from", "bank_id", "supplier_id"].map((name) => ({
            in: "query",
            name,
            required: false,
            schema: { type: "string" },
          })),
        ],
        responses: {
          200: {
            description: "Persistent company report with native currency totals before pagination",
            content: json(connectedReportSchema),
          },
          ...errors,
        },
      },
    },
    "/finance/subledger/workspace": {
      get: {
        operationId: "getSubledgerWorkspace",
        security: [{ cookieAuth: [] }],
        parameters: [
          ...query,
          { in: "query", name: "source_document_id", required: false, schema: { type: "string" } },
        ],
        responses: {
          200: {
            description: "Company currency balances and financial workflow",
            content: json(subledgerWorkspaceSchema),
          },
          ...errors,
        },
      },
    },
    "/finance/subledger/reports": {
      get: {
        operationId: "getSubledgerReport",
        security: [{ cookieAuth: [] }],
        parameters: [
          ...query,
          {
            in: "query",
            name: "report",
            required: true,
            schema: {
              type: "string",
              enum: ["statement", "fx", "trial_balance", "general_ledger", "profit_loss", "balance_sheet"],
            },
          },
          ...["from", "presentation_currency"].map((name) => ({
            in: "query",
            name,
            required: false,
            schema: { type: "string" },
          })),
        ],
        responses: {
          200: {
            description: "As-of report with full-filter totals and reconciliation",
            content: json(subledgerReportSchema),
          },
          ...errors,
        },
      },
    },
    "/finance/subledger/parties": {
      post: post("createSubledgerParty", subledgerPartyInputSchema, subledgerPartySchema, false, 201),
    },
    "/finance/subledger/parties/{partyId}/configuration": {
      post: {
        ...post(
          "configureSubledgerParty",
          subledgerPartyConfigurationInputSchema,
          subledgerPartyConfigurationSchema,
          true,
        ),
        parameters: [
          ...mutation,
          { in: "header", name: "if-match", required: true, schema: { type: "string" } },
          { in: "path", name: "partyId", required: true, schema: { type: "string" } },
        ],
      },
    },
    "/finance/subledger/policy": {
      post: post("configureSubledgerPolicy", subledgerPolicyInputSchema, subledgerPolicySchema, true),
    },
    "/finance/subledger/operations": {
      post: post("createSubledgerOperation", subledgerOperationRequestSchema, subledgerOperationSchema, false, 201),
    },
    "/finance/subledger/purchase/{documentId}/prepare": {
      post: {
        ...post("preparePurchaseAccounting", purchaseAccountingPrepareSchema, subledgerOperationSchema, true, 201),
        parameters: [
          ...mutation,
          { in: "header", name: "if-match", required: true, schema: { type: "string" } },
          { in: "path", name: "documentId", required: true, schema: { type: "string" } },
        ],
      },
    },
    "/finance/subledger/operations/{operationId}/actions": {
      post: {
        ...post("actOnSubledgerOperation", subledgerActionSchema, subledgerOperationSchema, true),
        parameters: [
          ...mutation,
          { in: "header", name: "if-match", required: true, schema: { type: "string" } },
          { in: "path", name: "operationId", required: true, schema: { type: "string", format: "uuid" } },
        ],
      },
    },
  };
}
