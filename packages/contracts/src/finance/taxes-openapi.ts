import { z } from "zod";
import {
  taxInputSchema,
  taxUpdateSchema,
  taxStatusSchema,
  taxDirectorySchema,
  taxDetailSchema,
  taxOptionsSchema,
} from "./taxes.js";

export function taxPaths() {
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
  const id = { in: "path", name: "id", required: true, schema: { type: "string" } };
  const query = [
    scope,
    ...["search", "module", "tax_type", "status"].map((name) => ({
      in: "query",
      name,
      required: false,
      schema: { type: "string" },
    })),
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } },
    { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 1000000 } },
  ];
  const get = (operationId: string, schema: z.ZodType, parameters: unknown[]) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { 200: { description: "Company tax configuration", content: json(schema) }, ...errors },
  });
  const mutation = (operationId: string, schema: z.ZodType, version = false, status = 200) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(version ? [id] : []),
      ...["x-csrf-token", "idempotency-key", ...(version ? ["if-match"] : [])].map((name) => ({
        in: "header",
        name,
        required: true,
        schema: { type: "string" },
      })),
    ],
    requestBody: { required: true, content: json(schema) },
    responses: {
      [status]: { description: "Audited tax configuration result", content: json(taxDetailSchema) },
      ...errors,
    },
  });
  return {
    "/finance/taxes": {
      get: get("getTaxes", taxDirectorySchema, query),
      post: mutation("createTax", taxInputSchema, false, 201),
    },
    "/finance/taxes/options": { get: get("getTaxOptions", taxOptionsSchema, query) },
    "/finance/taxes/{id}": {
      get: get("getTax", taxDetailSchema, [scope, id]),
      patch: mutation("updateTax", taxUpdateSchema, true),
    },
    "/finance/taxes/{id}/status": { post: mutation("changeTaxStatus", taxStatusSchema, true) },
  };
}
