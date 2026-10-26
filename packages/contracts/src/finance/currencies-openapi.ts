import { z } from "zod";

import {
  adoptCurrencyRequestSchema,
  changeCurrencyRateStatusRequestSchema,
  changeCurrencyStatusRequestSchema,
  correctCurrencyRateRequestSchema,
  createCurrencyRateRequestSchema,
  currencyCatalogDirectorySchema,
  currencyRateDirectorySchema,
  currencyRateSchema,
  financeConfigurationMutationSchema,
  tenantCurrencyDirectorySchema,
  transferFxPolicySchema,
  upsertTransferFxPolicyRequestSchema,
} from "./currencies.js";

export function financeCurrencyPaths() {
  const json = (schema: z.ZodType) => z.toJSONSchema(schema, { target: "openapi-3.0" });
  const csrf = { in: "header", name: "x-csrf-token", required: true, schema: { type: "string" } };
  const key = { in: "header", name: "idempotency-key", required: true, schema: { type: "string", maxLength: 255 } };
  const version = { in: "header", name: "if-match", required: false, schema: { type: "string" } };
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const ok = (description: string, schema: z.ZodType, status = "200") => ({
    [status]: { description, content: { "application/json": { schema: json(schema) } } },
    ...errors,
  });
  const body = (schema: z.ZodType) => ({ required: true, content: { "application/json": { schema: json(schema) } } });
  const pagination = [
    { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
  ];
  return {
    "/finance/currencies/catalog": {
      get: {
        operationId: "listCurrencyCatalog",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 100 } },
          { in: "query", name: "adopted", required: false, schema: { type: "boolean" } },
          ...pagination,
        ],
        responses: ok("Standard currency catalog", currencyCatalogDirectorySchema),
      },
    },
    "/finance/currencies": {
      get: {
        operationId: "listTenantCurrencies",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 100 } },
          { in: "query", name: "status", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
          ...pagination,
        ],
        responses: ok("Tenant Currency Master", tenantCurrencyDirectorySchema),
      },
    },
    "/finance/currencies/adoptions": {
      post: {
        operationId: "adoptCurrency",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(adoptCurrencyRequestSchema),
        responses: ok("Currency adopted", financeConfigurationMutationSchema, "201"),
      },
    },
    "/finance/currencies/{code}/status": {
      post: {
        operationId: "changeCurrencyStatus",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "code", required: true, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
          csrf,
          key,
          version,
        ],
        requestBody: body(changeCurrencyStatusRequestSchema),
        responses: ok("Currency status changed", financeConfigurationMutationSchema),
      },
    },
    "/finance/currency_rates": {
      get: {
        operationId: "listCurrencyRates",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "source_currency", required: false, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
          { in: "query", name: "effective_on_or_before", required: false, schema: { type: "string", format: "date" } },
          {
            in: "query",
            name: "status",
            required: false,
            schema: { type: "string", enum: ["active", "inactive", "superseded"] },
          },
          ...pagination,
        ],
        responses: ok("Governed Currency Rates", currencyRateDirectorySchema),
      },
      post: {
        operationId: "createCurrencyRate",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(createCurrencyRateRequestSchema),
        responses: ok("Currency Rate created", currencyRateSchema, "201"),
      },
    },
    "/finance/currency_rates/{rateId}/corrections": {
      post: {
        operationId: "correctCurrencyRate",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "rateId", required: true, schema: { type: "string", maxLength: 128 } },
          csrf,
          key,
          version,
        ],
        requestBody: body(correctCurrencyRateRequestSchema),
        responses: ok("Currency Rate corrected", currencyRateSchema),
      },
    },
    "/finance/currency_rates/{rateId}/status": {
      post: {
        operationId: "changeCurrencyRateStatus",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "rateId", required: true, schema: { type: "string", maxLength: 128 } },
          csrf,
          key,
          version,
        ],
        requestBody: body(changeCurrencyRateStatusRequestSchema),
        responses: ok("Currency Rate status changed", currencyRateSchema),
      },
    },
    "/finance/transfer_policy": {
      get: {
        operationId: "getTransferFxPolicy",
        security: [{ cookieAuth: [] }],
        parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } }],
        responses: ok("Company Transfer FX policy", transferFxPolicySchema),
      },
      post: {
        operationId: "upsertTransferFxPolicy",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key, version],
        requestBody: body(upsertTransferFxPolicyRequestSchema),
        responses: ok("Transfer FX policy persisted", financeConfigurationMutationSchema),
      },
    },
  };
}
