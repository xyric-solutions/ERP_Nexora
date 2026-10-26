import { z } from "zod";

import {
  activateCompanyCurrencyRequestSchema,
  changeCompanyCurrencyStatusRequestSchema,
  changeCompanyCurrencyRateStatusRequestSchema,
  companyCurrencyDirectorySchema,
  companyCurrencyMutationSchema,
  companyCurrencyProfileSchema,
  companyCurrencyRateDirectorySchema,
  companyCurrencyRateSchema,
  correctCompanyCurrencyRateRequestSchema,
  configureCompanyCurrencyProfileRequestSchema,
  countryCurrencyDirectorySchema,
  createCompanyCurrencyRateRequestSchema,
} from "./company-currencies.js";

export function companyCurrencyPaths() {
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
  const companyId = {
    in: "query",
    name: "company_id",
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
  const pagination = [
    { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
    { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
  ];

  return {
    "/master-data/countries": {
      get: {
        operationId: "listCountryCurrencies",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 100 } },
          { in: "query", name: "country_code", required: false, schema: { type: "string", pattern: "^[A-Z]{2}$" } },
          { in: "query", name: "currency_code", required: false, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
          ...pagination,
        ],
        responses: response("Immutable country and legal-currency mappings", countryCurrencyDirectorySchema),
      },
    },
    "/finance/companies/{companyId}/currency-profile": {
      get: {
        operationId: "getCompanyCurrencyProfile",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "companyId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
        ],
        responses: response("Company financial currency profile", companyCurrencyProfileSchema),
      },
      post: {
        operationId: "configureCompanyCurrencyProfile",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "companyId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          csrf,
          key,
        ],
        requestBody: body(configureCompanyCurrencyProfileRequestSchema),
        responses: response("Company financial currency profile configured", companyCurrencyMutationSchema, "201"),
      },
    },
    "/finance/company-currencies": {
      get: {
        operationId: "listCompanyCurrencies",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyId,
          { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 100 } },
          { in: "query", name: "status", required: false, schema: { type: "string", enum: ["active", "inactive"] } },
          ...pagination,
        ],
        responses: response("Company-scoped active and inactive currencies", companyCurrencyDirectorySchema),
      },
      post: {
        operationId: "activateCompanyCurrency",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(activateCompanyCurrencyRequestSchema),
        responses: response(
          "Company currency and initial rate created atomically",
          companyCurrencyMutationSchema,
          "201",
        ),
      },
    },
    "/finance/company-currencies/{currencyCode}/status": {
      patch: {
        operationId: "changeCompanyCurrencyStatus",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "currencyCode", required: true, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
          companyId,
          csrf,
          key,
          ifMatch,
        ],
        requestBody: body(changeCompanyCurrencyStatusRequestSchema),
        responses: response("Company currency status changed", companyCurrencyMutationSchema),
      },
    },
    "/finance/company-currency-rates": {
      get: {
        operationId: "listCompanyCurrencyRates",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyId,
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
        responses: response("Immutable company exchange-rate history", companyCurrencyRateDirectorySchema),
      },
      post: {
        operationId: "createCompanyCurrencyRate",
        security: [{ cookieAuth: [] }],
        parameters: [csrf, key],
        requestBody: body(createCompanyCurrencyRateRequestSchema),
        responses: response("Company exchange-rate revision created", companyCurrencyRateSchema, "201"),
      },
    },
    "/finance/company-currency-rates/{rateId}/corrections": {
      post: {
        operationId: "correctCompanyCurrencyRate",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "rateId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          csrf,
          key,
          ifMatch,
        ],
        requestBody: body(correctCompanyCurrencyRateRequestSchema),
        responses: response("Correcting rate revision created without rewriting history", companyCurrencyRateSchema),
      },
    },
    "/finance/company-currency-rates/{rateId}/status": {
      patch: {
        operationId: "changeCompanyCurrencyRateStatus",
        security: [{ cookieAuth: [] }],
        parameters: [
          { in: "path", name: "rateId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          csrf,
          key,
          ifMatch,
        ],
        requestBody: body(changeCompanyCurrencyRateStatusRequestSchema),
        responses: response("Company exchange-rate status changed", companyCurrencyRateSchema),
      },
    },
  };
}
