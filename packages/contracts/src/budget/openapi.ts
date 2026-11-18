import { z } from "zod";
import {
  budgetOptionsSchema,
  budgetDirectorySchema,
  budgetDetailSchema,
  budgetReportSchema,
  budgetDrillSchema,
  budgetAuditSchema,
  budgetPlanInputSchema,
  budgetPlanSchema,
  budgetVersionInputSchema,
  budgetVersionUpdateSchema,
  budgetActionSchema,
  budgetModelInputSchema,
  budgetModelSchema,
  budgetApplyModelSchema,
  budgetGenerateSchema,
  budgetPolicyInputSchema,
  budgetPolicySchema,
  budgetRequestInputSchema,
  budgetRequestSchema,
  budgetRequestActionSchema,
  budgetImportSchema,
  budgetImportCommitSchema,
  budgetCommentInputSchema,
  budgetReconcileSchema,
  budgetSourceControlSchema,
  budgetSourceDirectorySchema,
} from "./index.js";
export function budgetPaths() {
  const json = (s: z.ZodType) => ({ "application/json": { schema: z.toJSONSchema(s, { target: "openapi-3.0" }) } });
  const scope = { in: "query", name: "company_id", required: true, schema: { type: "string" } };
  const id = { in: "path", name: "id", required: true, schema: { type: "string" } };
  const filters = [
    scope,
    ...[
      "fiscal_calendar_id",
      "version_id",
      "plan_id",
      "search",
      "state",
      "kind",
      "account_id",
      "period_id",
      "department",
      "project",
      "cost_centre",
      "branch",
      "from",
      "as_of",
    ].map((name) => ({ in: "query", name, schema: { type: "string" } })),
    { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } },
    { in: "query", name: "offset", schema: { type: "integer", minimum: 0, maximum: 1000000 } },
  ];
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 412, 422, 503].map((status) => [
      status,
      {
        description: "Standard problem response",
        content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
      },
    ]),
  );
  const get = (operationId: string, s: z.ZodType, parameters: unknown[] = filters) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: { 200: { description: "Company-scoped Budget result", content: json(s) }, ...errors },
  });
  const write = (
    operationId: string,
    input: z.ZodType,
    output: z.ZodType,
    hasId = false,
    version = false,
    status = 200,
  ) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [
      ...(hasId ? [id] : []),
      ...["x-csrf-token", "idempotency-key", ...(version ? ["if-match"] : [])].map((name) => ({
        in: "header",
        name,
        required: true,
        schema: { type: "string" },
      })),
    ],
    requestBody: { required: true, content: json(input) },
    responses: { [status]: { description: "Persisted, audited Budget result", content: json(output) }, ...errors },
  });
  const file = (operationId: string, parameters: unknown[]) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters,
    responses: {
      200: {
        description: "Genuine spreadsheet export",
        content: {
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
            schema: { type: "string", format: "binary" },
          },
          "text/csv": { schema: { type: "string" } },
        },
      },
      ...errors,
    },
  });
  return {
    "/budget/options": { get: get("getBudgetOptions", budgetOptionsSchema) },
    "/budget/sources": { get: get("getBudgetSources", budgetSourceDirectorySchema) },
    "/budget/workspace": { get: get("getBudgetWorkspace", budgetDirectorySchema) },
    "/budget/reports": { get: get("getBudgetReport", budgetReportSchema) },
    "/budget/drill": { get: get("getBudgetDrill", budgetDrillSchema) },
    "/budget/history": { get: get("getBudgetHistory", z.array(budgetAuditSchema)) },
    "/budget/controls/{id}": { get: get("getBudgetSourceControl", budgetSourceControlSchema, [scope, id]) },
    "/budget/plans": { post: write("createBudgetPlan", budgetPlanInputSchema, budgetPlanSchema, false, false, 201) },
    "/budget/versions": {
      post: write("createBudgetVersion", budgetVersionInputSchema, budgetDetailSchema, false, false, 201),
    },
    "/budget/versions/{id}": {
      get: get("getBudgetVersion", budgetDetailSchema, [scope, id]),
      patch: write("updateBudgetVersion", budgetVersionUpdateSchema, budgetDetailSchema, true, true),
    },
    "/budget/versions/{id}/actions": {
      post: write("actBudgetVersion", budgetActionSchema, budgetDetailSchema, true, true),
    },
    "/budget/generate": {
      post: write("generateBudgetVersion", budgetGenerateSchema, budgetDetailSchema, false, false, 201),
    },
    "/budget/models": {
      post: write("createBudgetModel", budgetModelInputSchema, budgetModelSchema, false, false, 201),
    },
    "/budget/models/{id}": {
      patch: write(
        "updateBudgetModel",
        budgetModelInputSchema.required({ expected_version: true }),
        budgetModelSchema,
        true,
        true,
      ),
    },
    "/budget/models/apply": {
      post: write("applyBudgetModel", budgetApplyModelSchema, budgetDetailSchema, false, true),
    },
    "/budget/policy": { put: write("saveBudgetPolicy", budgetPolicyInputSchema, budgetPolicySchema, false, true) },
    "/budget/requests": {
      post: write("createBudgetRequest", budgetRequestInputSchema, budgetRequestSchema, false, false, 201),
    },
    "/budget/requests/{id}/actions": {
      post: write("actBudgetRequest", budgetRequestActionSchema, budgetRequestSchema, true, true),
    },
    "/budget/comments": {
      post: write(
        "createBudgetComment",
        budgetCommentInputSchema,
        z.strictObject({ id: z.string() }),
        false,
        false,
        201,
      ),
    },
    "/budget/reconcile": {
      post: write(
        "reconcileBudgetPurchases",
        budgetReconcileSchema,
        z.strictObject({ documents: z.number().int(), journals: z.number().int() }),
      ),
    },
    "/budget/template": { get: file("downloadBudgetTemplate", [scope]) },
    "/budget/export": {
      get: file("exportBudget", [
        ...filters,
        { in: "query", name: "format", schema: { type: "string", enum: ["csv", "xlsx"] } },
        { in: "query", name: "allocations", schema: { type: "string", enum: ["true", "false"] } },
      ]),
    },
    "/budget/imports": {
      post: {
        operationId: "previewBudgetImport",
        security: [{ cookieAuth: [] }],
        parameters: [
          scope,
          ...["version_id", "expected_version"].map((name) => ({
            in: "query",
            name,
            required: true,
            schema: { type: name === "expected_version" ? "integer" : "string" },
          })),
          ...["x-csrf-token", "idempotency-key", "if-match"].map((name) => ({
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
                required: ["file"],
                properties: { file: { type: "string", format: "binary" } },
              },
            },
          },
        },
        responses: { 201: { description: "Validated import preview", content: json(budgetImportSchema) }, ...errors },
      },
    },
    "/budget/imports/{id}/commit": {
      post: write("commitBudgetImport", budgetImportCommitSchema, budgetDetailSchema, true, true),
    },
  };
}
