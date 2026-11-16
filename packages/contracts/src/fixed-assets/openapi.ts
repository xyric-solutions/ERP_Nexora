import { z } from "zod";
import {
  assetQuerySchema,
  assetOptionsSchema,
  assetWorkspaceSchema,
  assetDashboardSchema,
  assetSourcesSchema,
  assetDirectorySchema,
  assetDetailSchema,
  assetDetailQuerySchema,
  assetCategoryInputSchema,
  assetCategorySchema,
  assetCreateSchema,
  assetCreateResultSchema,
  assetUpdateSchema,
  fixedAssetSchema,
  assetActionSchema,
  assetEventInputSchema,
  assetEventSchema,
  assetEventActionSchema,
  assetDepreciationInputSchema,
  assetDepreciationRunSchema,
  assetDepreciationActionSchema,
  assetAttachmentInputSchema,
  assetAttachmentSchema,
  assetCompanyPolicyInputSchema,
  assetCompanyPolicySchema,
  assetNominalClassificationInputSchema,
  assetValuationQuerySchema,
  assetValuationSchema,
  assetJournalQuerySchema,
  assetJournalDirectorySchema,
  assetStagedDocumentSchema,
  assetAccrualQuerySchema,
  assetAccrualScheduleSchema,
} from "./index.js";
export function fixedAssetPaths() {
  const json = (schema: z.ZodType) => ({
    "application/json": { schema: z.toJSONSchema(schema, { target: "openapi-3.0", unrepresentable: "any" }) },
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
  const company = { in: "query", name: "company_id", required: true, schema: { type: "string" } };
  const path = { in: "path", name: "id", required: true, schema: { type: "string" } };
  const listParameters = Object.entries(z.toJSONSchema(assetQuerySchema).properties ?? {}).map(([name, schema]) => ({
    in: "query",
    name,
    required: name === "company_id",
    schema,
  }));
  const read = (operationId: string, output: z.ZodType, parameters: unknown[]) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { 200: { description: "Validated company asset data", content: json(output) }, ...errors },
  });
  const write = (
    operationId: string,
    input: z.ZodType,
    output: z.ZodType,
    version = false,
    identified = false,
    status = 200,
  ) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(identified ? [path] : []),
      ...["x-csrf-token", "idempotency-key", ...(version ? ["if-match"] : [])].map((name) => ({
        in: "header",
        name,
        required: true,
        schema: { type: "string" },
      })),
    ],
    requestBody: { required: true, content: json(input) },
    responses: { [status]: { description: "Validated asset result", content: json(output) }, ...errors },
  });
  return {
    "/assets/records/{id}/accrual-schedule": {
      get: read("getFixedAssetAccrualSchedule", assetAccrualScheduleSchema, [
        path,
        ...Object.entries(z.toJSONSchema(assetAccrualQuerySchema).properties ?? {}).map(([name, schema]) => ({
          in: "query",
          name,
          required: true,
          schema,
        })),
      ]),
    },
    "/assets/staged-documents": {
      post: {
        ...write("stageFixedAssetDocument", assetAttachmentInputSchema, assetStagedDocumentSchema, false, false, 201),
        parameters: [
          company,
          ...["x-csrf-token", "idempotency-key"].map((name) => ({
            in: "header",
            name,
            required: true,
            schema: { type: "string" },
          })),
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "file"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  file: { type: "string", format: "binary", description: "Private PDF, PNG or JPEG; maximum 10 MB." },
                },
              },
            },
          },
        },
      },
    },
    "/assets/options": { get: read("getFixedAssetOptions", assetOptionsSchema, [company]) },
    "/assets/records/{id}/journals": {
      get: read("getFixedAssetJournals", assetJournalDirectorySchema, [
        path,
        ...Object.entries(z.toJSONSchema(assetJournalQuerySchema).properties ?? {}).map(([name, schema]) => ({
          in: "query",
          name,
          required: name === "company_id",
          schema,
        })),
      ]),
    },
    "/assets/policies": {
      post: write("saveFixedAssetCompanyPolicy", assetCompanyPolicyInputSchema, assetCompanyPolicySchema, true),
    },
    "/assets/nominals/{id}/classification": {
      post: write(
        "classifyFixedAssetNominal",
        assetNominalClassificationInputSchema,
        z.strictObject({ account_id: z.string(), active: z.boolean(), version: z.number().int() }),
        true,
        true,
      ),
    },
    "/assets/records/{id}/valuation": {
      get: read("getFixedAssetValuation", assetValuationSchema, [
        path,
        ...Object.entries(z.toJSONSchema(assetValuationQuerySchema).properties ?? {}).map(([name, schema]) => ({
          in: "query",
          name,
          required: true,
          schema,
        })),
      ]),
    },
    "/assets/records/{id}/attachments": {
      post: {
        ...write("uploadFixedAssetAttachment", assetAttachmentInputSchema, assetAttachmentSchema, false, true, 201),
        parameters: [
          path,
          company,
          ...["x-csrf-token", "idempotency-key"].map((name) => ({
            in: "header",
            name,
            required: true,
            schema: { type: "string" },
          })),
        ],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["title", "file"],
                properties: {
                  title: { type: "string", maxLength: 200 },
                  file: { type: "string", format: "binary", description: "PDF, PNG or JPEG; maximum 10 MB." },
                },
              },
            },
          },
        },
      },
    },
    "/assets/records/{id}/attachments/{attachmentId}/content": {
      get: {
        operationId: "downloadFixedAssetAttachment",
        security: [{ cookieAuth: [] }],
        parameters: [path, company, { in: "path", name: "attachmentId", required: true, schema: { type: "string" } }],
        responses: {
          200: {
            description: "Authorized immutable document download",
            content: { "application/octet-stream": { schema: { type: "string", format: "binary" } } },
          },
          ...errors,
        },
      },
    },
    "/assets/workspace": { get: read("getFixedAssetWorkspace", assetWorkspaceSchema, listParameters) },
    "/assets/dashboard": { get: read("getFixedAssetDashboard", assetDashboardSchema, listParameters) },
    "/assets/reports": { get: read("getFixedAssetReports", assetDashboardSchema, listParameters) },
    "/assets/sources": { get: read("getFixedAssetSources", assetSourcesSchema, listParameters) },
    "/assets/records": {
      get: read("listFixedAssets", assetDirectorySchema, listParameters),
      post: write("createFixedAssets", assetCreateSchema, assetCreateResultSchema, false, false, 201),
    },
    "/assets/records/{id}": {
      get: read("getFixedAsset", assetDetailSchema, [
        path,
        ...Object.entries(z.toJSONSchema(assetDetailQuerySchema).properties ?? {}).map(([name, schema]) => ({
          in: "query",
          name,
          required: name === "company_id",
          schema,
        })),
      ]),
      patch: write("updateFixedAsset", assetUpdateSchema, fixedAssetSchema, true, true),
    },
    "/assets/records/{id}/actions": { post: write("actOnFixedAsset", assetActionSchema, fixedAssetSchema, true, true) },
    "/assets/categories": {
      post: write("createFixedAssetCategory", assetCategoryInputSchema, assetCategorySchema, true, false, 201),
    },
    "/assets/categories/{id}": {
      patch: write("updateFixedAssetCategory", assetCategoryInputSchema, assetCategorySchema, true, true),
    },
    "/assets/events": {
      post: write("createFixedAssetEvent", assetEventInputSchema, assetEventSchema, false, false, 201),
    },
    "/assets/events/{id}/actions": {
      post: write("actOnFixedAssetEvent", assetEventActionSchema, assetEventSchema, true, true),
    },
    "/assets/depreciation": {
      post: write(
        "previewFixedAssetDepreciation",
        assetDepreciationInputSchema,
        assetDepreciationRunSchema,
        false,
        false,
        201,
      ),
    },
    "/assets/depreciation/{id}/actions": {
      post: write("actOnFixedAssetDepreciation", assetDepreciationActionSchema, assetDepreciationRunSchema, true, true),
    },
  };
}
