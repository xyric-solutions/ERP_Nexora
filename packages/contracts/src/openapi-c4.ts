import { z } from "zod";
import { fiscalCalendarPaths } from "./finance/periods-openapi.js";
import { bankTransferPaths } from "./banking/transfers-openapi.js";
import { bankRevaluationPaths } from "./banking/revaluations-openapi.js";
import { companyCurrencyPaths } from "./finance/company-currencies-openapi.js";
import { financeCurrencyPaths } from "./finance/currencies-openapi.js";
import { bankWorkflowOptionsSchema, reassignBankApproverRequestSchema } from "./banking/workflow-context.js";
import { bankGovernancePaths } from "./security/bank-self-approval-openapi.js";
import {
  financeHierarchyDirectorySchema,
  financeHierarchyItemSchema,
  createFinanceHierarchyRequestSchema,
  changeFinanceHierarchyRequestSchema,
} from "./finance/hierarchy.js";
import {
  bankSelfApprovalDirectorySchema,
  bankSelfApprovalGrantSchema,
  bankSelfApprovalMutationSchema,
  bankSelfApprovalOptionsSchema,
  changeBankSelfApprovalRequestSchema,
} from "./security/bank-self-approval.js";
import { referenceMasterPaths } from "./master-data/openapi.js";
import {
  referenceMasterSchema,
  referenceMasterDirectorySchema,
  referenceMasterMutationSchema,
  createReferenceMasterRequestSchema,
  updateReferenceMasterRequestSchema,
  changeReferenceMasterStatusRequestSchema,
} from "./master-data/index.js";

import {
  authenticationCompletionResponseSchema,
  cancelTenantSelectionRequestSchema,
  changeInitialPasswordRequestSchema,
  passwordLoginRequestSchema,
  passwordLoginResponseSchema,
  passwordChangeRequiredResponseSchema,
  selectTenantRequestSchema,
  sessionResponseSchema,
  tenantSelectionRequiredResponseSchema,
} from "./auth/index.js";
import {
  bankAccountCurrencySummarySchema,
  bankAccountDetailSchema,
  bankAccountDirectorySchema,
  bankAccountMutationResultSchema,
  bankPaymentDetailSchema,
  bankPaymentDirectorySchema,
  bankPaymentMutationResultSchema,
  bankPaymentNominalAccountDirectorySchema,
  bankPaymentOptionsSchema,
  bankPaymentPostingResultSchema,
  bankPaymentReversalResultSchema,
  bankReceiptDetailSchema,
  bankReceiptDirectorySchema,
  bankReceiptMutationResultSchema,
  bankReceiptNominalAccountDirectorySchema,
  bankReceiptOptionsSchema,
  bankReceiptPostingResultSchema,
  bankReceiptReversalResultSchema,
  bankReconciliationAdjustmentSchema,
  bankReconciliationAdjustmentMutationResultSchema,
  bankReconciliationDetailSchema,
  bankReconciliationDirectorySchema,
  bankReconciliationMatchMutationResultSchema,
  bankReconciliationManualSelectionMutationResultSchema,
  bankReconciliationMutationResultSchema,
  bankReconciliationSetupSchema,
  bankStatementImportDetailSchema,
  bankStatementImportDirectorySchema,
  bankStatementImportMutationResultSchema,
  bankStatementImportOptionsSchema,
  bankStatementMappingProfileDirectorySchema,
  bankStatementMappingProfileSchema,
  bankingCompanyDirectorySchema,
  bankingLedgerAccountDirectorySchema,
  changeBankAccountStatusRequestSchema,
  createBankPaymentRequestSchema,
  createBankReconciliationAdjustmentRequestSchema,
  createBankReconciliationMatchRequestSchema,
  createBankReconciliationRequestSchema,
  createBankReceiptRequestSchema,
  createBankStatementMappingProfileRequestSchema,
  createBankAccountRequestSchema,
  decideBankReconciliationAdjustmentRequestSchema,
  decideBankReconciliationMatchRequestSchema,
  decideBankReconciliationRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankReceiptRequestSchema,
  decideBankAccountRequestSchema,
  postBankPaymentRequestSchema,
  postBankReconciliationAdjustmentRequestSchema,
  postBankReceiptRequestSchema,
  reverseBankPaymentRequestSchema,
  reverseBankReconciliationAdjustmentRequestSchema,
  setBankReconciliationManualSelectionRequestSchema,
  reverseBankReceiptRequestSchema,
  submitBankPaymentRequestSchema,
  submitBankReconciliationAdjustmentRequestSchema,
  submitBankReconciliationRequestSchema,
  submitBankReceiptRequestSchema,
  submitBankAccountRequestSchema,
  updateBankPaymentRequestSchema,
  updateBankReconciliationAdjustmentRequestSchema,
  updateBankReceiptRequestSchema,
  updateBankStatementImportMappingRequestSchema,
  updateBankStatementLineRequestSchema,
  updateBankStatementMappingProfileRequestSchema,
  updateBankAccountRequestSchema,
  unmatchBankReconciliationRequestSchema,
  validateBankStatementImportRequestSchema,
  finalizeBankStatementImportRequestSchema,
} from "./banking/index.js";
import { healthStatusSchema } from "./health.js";
import {
  importChartTemplateRequestSchema,
  publishChartTemplateRequestSchema,
  chartTemplateSummarySchema,
  chartTemplateDirectorySchema,
  chartTemplateNodesSchema,
  chartTemplateMutationSchema,
  chartCompanyPreviewSchema,
  adoptCompanyChartRequestSchema,
  adoptCompanyChartResultSchema,
  classifyChartNominalRequestSchema,
  classifyChartNominalResultSchema,
} from "./finance/chart-templates.js";
import {
  changeFinanceNominalStatusRequestSchema,
  createFinanceNominalRequestSchema,
  decideFinanceNominalRequestSchema,
  financeNominalDetailSchema,
  financeNominalDirectorySchema,
  financeNominalMutationResultSchema,
  financeNominalOptionsSchema,
  submitFinanceNominalRequestSchema,
  updateFinanceNominalRequestSchema,
} from "./finance/index.js";
import {
  hrEmployeeDetailSchema,
  hrEmployeeDirectorySchema,
  hrCompanyDirectorySchema,
  hrOrganizationUnitDirectorySchema,
  hrEmployeeDraftDirectorySchema,
  hrEmployeeDraftDetailSchema,
  hrEmployeeDraftApprovalQueueSchema,
  hrEmployeeDraftApprovalDetailSchema,
  createHrEmployeeDraftRequestSchema,
  updateHrEmployeeDraftRequestSchema,
  submitHrEmployeeDraftRequestSchema,
  decideHrEmployeeDraftApprovalRequestSchema,
  createHrProfileDraftAssignmentRequestSchema,
  hrProfileDraftAssignmentResultSchema,
  hrEmployeeDraftResultSchema,
  hrMasterDirectorySchema,
  hrEmployeeContactDirectorySchema,
  createHrEmployeeContactRequestSchema,
  hrEmployeeContactResultSchema,
  hrEmployeeEmergencyContactDirectorySchema,
  createHrEmployeeEmergencyContactRequestSchema,
  hrEmployeeEmergencyContactResultSchema,
  hrEmployeeDocumentDirectorySchema,
  hrEmployeeAssignmentDirectorySchema,
  hrEmployeeStatusHistoryDirectorySchema,
  hrEmployeeLifecycleEventDirectorySchema,
  hrEmployeeProfileVersionDirectorySchema,
  hrEmploymentLifecyclePolicyDirectorySchema,
  createHrEmploymentLifecyclePolicyRequestSchema,
  hrEmploymentLifecyclePolicyResultSchema,
  submitHrEmploymentLifecyclePolicyRequestSchema,
  hrEmploymentLifecyclePolicySubmissionResultSchema,
  approveHrEmploymentLifecyclePolicyRequestSchema,
  hrEmploymentLifecyclePolicyApprovalResultSchema,
  activateHrEmploymentLifecyclePolicyRequestSchema,
  hrEmploymentLifecyclePolicyActivationResultSchema,
  createHrJobRequestSchema,
  hrJobResultSchema,
  createHrEmployeeHireRequestSchema,
  hrEmployeeHireRequestResultSchema,
  decideHrEmployeeHireRequestSchema,
  hrEmployeeHireDecisionResultSchema,
  hrEmployeeHireRequestDirectorySchema,
  hrEmployeeHireRequestReviewSchema,
  createHrEmployeeTransferRequestSchema,
  hrEmployeeTransferRequestResultSchema,
  decideHrEmployeeTransferRequestSchema,
  hrEmployeeTransferDecisionResultSchema,
  hrEmployeeTransferRequestDirectorySchema,
  hrEmployeeTransferRequestReviewSchema,
  createHrEmployeePromotionRequestSchema,
  hrEmployeePromotionRequestResultSchema,
  decideHrEmployeePromotionRequestSchema,
  hrEmployeePromotionDecisionResultSchema,
  hrEmployeePromotionRequestDirectorySchema,
  hrEmployeePromotionRequestReviewSchema,
  createHrEmployeeManagerChangeRequestSchema,
  hrEmployeeManagerChangeRequestResultSchema,
  decideHrEmployeeManagerChangeRequestSchema,
  hrEmployeeManagerChangeDecisionResultSchema,
  hrEmployeeManagerChangeRequestDirectorySchema,
  hrEmployeeManagerChangeRequestReviewSchema,
  createHrEmployeeWorkLocationChangeRequestSchema,
  hrEmployeeWorkLocationChangeRequestResultSchema,
  decideHrEmployeeWorkLocationChangeRequestSchema,
  hrEmployeeWorkLocationChangeDecisionResultSchema,
  hrEmployeeWorkLocationChangeRequestDirectorySchema,
  hrEmployeeWorkLocationChangeRequestReviewSchema,
  createHrEmployeeOrganizationPlacementChangeRequestSchema,
  hrEmployeeOrganizationPlacementChangeRequestResultSchema,
  decideHrEmployeeOrganizationPlacementChangeRequestSchema,
  hrEmployeeOrganizationPlacementChangeDecisionResultSchema,
  hrEmployeeOrganizationPlacementChangeRequestDirectorySchema,
  hrEmployeeOrganizationPlacementChangeRequestReviewSchema,
} from "./hr/index.js";
import { jobReceiptSchema, sampleJobPayloadSchema } from "./jobs/index.js";
import { problemDetailsSchema } from "./problem.js";
import {
  createSecurityAccessReviewCampaignSchema,
  securityAccessReviewCampaignActionSchema,
  securityAccessReviewDecisionSchema,
} from "./security/access-review.js";
import { createSecurityDelegationSchema, securityDelegationActionSchema } from "./security/delegation.js";
import { createSecurityImpersonationSchema, securityImpersonationActionSchema } from "./security/impersonation.js";
import { createSecuritySessionPolicySchema, securitySessionPolicyActionSchema } from "./security/session-policy.js";
import {
  createSecurityAssignmentRequestSchema,
  createSecurityRoleRequestSchema,
  securityAdministrationResultSchema,
  securityApprovalActionSchema,
  securityAssignmentRequestActionSchema,
  securityPageSchema,
  securityRoleActionRequestSchema,
} from "./security/administration.js";
import {
  createSecurityUserRequestSchema,
  securityUserAdministrationResultSchema,
  securityUserDetailSchema,
  securityUserEmergencyActionSchema,
  securityUserOptionsSchema,
  securityUserPageSchema,
  securityUserRequestActionSchema,
} from "./security/user-administration.js";

function schema(value: z.ZodType): Record<string, unknown> {
  return z.toJSONSchema(value, { target: "draft-7", io: "output" }) as Record<string, unknown>;
}

const problemResponse = {
  description: "Safe structured error",
  content: { "application/problem+json": { schema: { $ref: "#/components/schemas/ProblemDetails" } } },
} as const;

const csrfParameter = {
  in: "header",
  name: "x-csrf-token",
  required: true,
  schema: { type: "string", minLength: 43, maxLength: 43 },
} as const;

const idempotencyParameter = {
  in: "header",
  name: "idempotency-key",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 255 },
} as const;

const identityContextParameters = ["user_id", "role_policy_id"].map((name) => ({
  in: "query",
  name,
  required: false,
  description: "Optional tenant-scoped record context; filtering never grants access.",
  schema: { type: "string", minLength: 1, maxLength: 128 },
}));
const securityPaginationParameters = [
  { in: "query", name: "cursor", required: false, schema: { type: "integer", minimum: 0, default: 0 } },
  { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
];

const securityErrors = {
  "400": problemResponse,
  "401": problemResponse,
  "403": problemResponse,
  "409": problemResponse,
  "503": problemResponse,
} as const;
const securityPageResponse = {
  "200": {
    description: "Tenant-scoped governed authorization data",
    content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityPage" } } },
  },
  ...securityErrors,
} as const;

const nominalIdParameter = {
  in: "path",
  name: "nominalId",
  required: true,
  schema: { type: "string", minLength: 1, maxLength: 128 },
} as const;
const nominalVersionParameter = {
  in: "header",
  name: "if-match",
  required: true,
  description: "Quoted expected_version; must agree with the request body.",
  schema: { type: "string", pattern: '^"[1-9][0-9]*"$' },
} as const;

function nominalMutationOperation(operationId: string, requestSchema: string, create = false) {
  return {
    operationId,
    description:
      "Requires live global Super Admin authority, company access and exact Finance/Bank master permissions. Direct activation creates audit evidence, never a journal. Ordinary master approval endpoints are retired.",
    security: [{ cookieAuth: [] }],
    parameters: create
      ? [csrfParameter, idempotencyParameter]
      : [nominalIdParameter, csrfParameter, idempotencyParameter, nominalVersionParameter],
    requestBody: {
      required: true,
      content: { "application/json": { schema: { $ref: `#/components/schemas/${requestSchema}` } } },
    },
    responses: {
      [create ? "201" : "200"]: {
        description: "Persisted governed Nominal lifecycle result",
        content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceNominalMutationResult" } } },
      },
      "404": problemResponse,
      "412": problemResponse,
      ...securityErrors,
    },
  } as const;
}

function bankStatementAndReconciliationPaths() {
  const pathParameter = (name: string) => ({
    in: "path",
    name,
    required: true,
    schema: { type: "string", minLength: 1, maxLength: 128 },
  });
  const queryParameter = (name: string, valueSchema: Record<string, unknown>, required = false) => ({
    in: "query",
    name,
    required,
    schema: valueSchema,
  });
  const companyParameter = queryParameter("company_id", { type: "string", minLength: 1, maxLength: 128 }, true);
  const cursorParameters = [
    queryParameter("limit", { type: "integer", minimum: 1, maximum: 100, default: 50 }),
    queryParameter("cursor", { type: "string", minLength: 1, maxLength: 512 }),
  ];
  const errors = {
    "400": problemResponse,
    "401": problemResponse,
    "403": problemResponse,
    "404": problemResponse,
    "409": problemResponse,
    "412": problemResponse,
    "413": problemResponse,
    "415": problemResponse,
    "422": problemResponse,
    "428": problemResponse,
    "503": problemResponse,
  };
  const jsonResponse = (description: string, responseSchema: z.ZodType, status = "200") => ({
    [status]: {
      description,
      content: { "application/json": { schema: schema(responseSchema) } },
    },
    ...errors,
  });
  const mutation = (
    operationId: string,
    requestSchema: z.ZodType,
    responseSchema: z.ZodType,
    description: string,
    parameters: Array<Record<string, unknown>>,
    methodStatus = "200",
  ) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [...parameters, csrfParameter, idempotencyParameter, nominalVersionParameter],
    requestBody: { required: true, content: { "application/json": { schema: schema(requestSchema) } } },
    responses: jsonResponse(description, responseSchema, methodStatus),
  });
  const createMutation = (
    operationId: string,
    requestSchema: z.ZodType,
    responseSchema: z.ZodType,
    description: string,
    parameters: Array<Record<string, unknown>> = [],
  ) => ({
    operationId,
    security: [{ cookieAuth: [] }],
    parameters: [...parameters, csrfParameter, idempotencyParameter],
    requestBody: { required: true, content: { "application/json": { schema: schema(requestSchema) } } },
    responses: jsonResponse(description, responseSchema, "201"),
  });

  const importId = pathParameter("id");
  const lineId = pathParameter("lineId");
  const profileId = pathParameter("profileId");
  const reconciliationId = pathParameter("id");
  const matchId = pathParameter("matchId");
  const adjustmentId = pathParameter("adjustmentId");

  return {
    "/banking/statement_import_options": {
      get: {
        operationId: "listBankStatementImportOptions",
        security: [{ cookieAuth: [] }],
        parameters: [companyParameter],
        responses: jsonResponse("Company-scoped statement import options", bankStatementImportOptionsSchema),
      },
    },
    "/banking/statement_import_templates/{format}": {
      get: {
        operationId: "downloadBankStatementImportTemplate",
        security: [{ cookieAuth: [] }],
        parameters: [
          {
            in: "path",
            name: "format",
            required: true,
            schema: { type: "string", enum: ["csv", "xlsx"] },
          },
        ],
        responses: {
          "200": {
            description: "Bounded sample statement file with the canonical import columns",
            content: {
              "text/csv": { schema: { type: "string", format: "binary" } },
              "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": {
                schema: { type: "string", format: "binary" },
              },
            },
          },
          ...errors,
        },
      },
    },
    "/banking/statement_imports": {
      get: {
        operationId: "listBankStatementImports",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyParameter,
          queryParameter("bank_account_id", { type: "string", minLength: 1, maxLength: 128 }),
          queryParameter("state", {
            type: "string",
            enum: ["uploaded", "draft", "validated", "finalized", "rejected"],
          }),
          queryParameter("statement_date_from", { type: "string", format: "date" }),
          queryParameter("statement_date_to", { type: "string", format: "date" }),
          queryParameter("search", { type: "string", maxLength: 160 }),
          ...cursorParameters,
        ],
        responses: jsonResponse("Company-scoped statement import directory", bankStatementImportDirectorySchema),
      },
      post: {
        operationId: "uploadBankStatementImport",
        description:
          "Streams one bounded CSV or XLSX file to protected object storage while calculating SHA-256. No object-storage URL is returned.",
        security: [{ cookieAuth: [] }],
        parameters: [csrfParameter, idempotencyParameter],
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                additionalProperties: false,
                required: ["company_id", "bank_account_id", "statement_reference", "date_format", "file"],
                properties: {
                  company_id: { type: "string", minLength: 1, maxLength: 128 },
                  bank_account_id: { type: "string", minLength: 1, maxLength: 128 },
                  statement_reference: { type: "string", minLength: 1, maxLength: 128 },
                  date_format: {
                    type: "string",
                    enum: ["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd", "dd-MM-yyyy"],
                  },
                  mapping_profile_id: { type: ["string", "null"], minLength: 1, maxLength: 128 },
                  supersedes_import_id: { type: ["string", "null"], minLength: 1, maxLength: 128 },
                  file: {
                    type: "string",
                    format: "binary",
                    description: "CSV or XLSX only; maximum 25 MiB and 1,000 parsed data rows.",
                  },
                },
              },
              encoding: {
                file: { contentType: "text/csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
              },
            },
          },
        },
        responses: jsonResponse(
          "Statement upload accepted and parsed into a recoverable draft",
          bankStatementImportMutationResultSchema,
          "201",
        ),
      },
    },
    "/banking/statement_imports/{id}": {
      get: {
        operationId: "getBankStatementImport",
        security: [{ cookieAuth: [] }],
        parameters: [importId],
        responses: jsonResponse(
          "Persisted statement import detail and bounded preview",
          bankStatementImportDetailSchema,
        ),
      },
    },
    "/banking/statement_imports/{id}/mapping": {
      patch: mutation(
        "updateBankStatementImportMapping",
        updateBankStatementImportMappingRequestSchema,
        bankStatementImportMutationResultSchema,
        "Statement mapping updated and rows revalidated",
        [importId],
      ),
    },
    "/banking/statement_imports/{id}/lines/{lineId}": {
      patch: mutation(
        "updateBankStatementLine",
        updateBankStatementLineRequestSchema,
        bankStatementImportMutationResultSchema,
        "Statement row resolution updated with audit evidence",
        [importId, lineId],
      ),
    },
    "/banking/statement_imports/{id}/validate": {
      post: mutation(
        "validateBankStatementImport",
        validateBankStatementImportRequestSchema,
        bankStatementImportMutationResultSchema,
        "Statement import revalidated",
        [importId],
      ),
    },
    "/banking/statement_imports/{id}/finalize": {
      post: mutation(
        "finalizeBankStatementImport",
        finalizeBankStatementImportRequestSchema,
        bankStatementImportMutationResultSchema,
        "Validated import finalized as immutable reconciliation evidence",
        [importId],
      ),
    },
    "/banking/statement_mapping_profiles": {
      get: {
        operationId: "listBankStatementMappingProfiles",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyParameter,
          queryParameter("bank_account_id", { type: "string", minLength: 1, maxLength: 128 }),
          queryParameter("state", { type: "string", enum: ["active", "inactive"] }),
          queryParameter("search", { type: "string", maxLength: 160 }),
          ...cursorParameters,
        ],
        responses: jsonResponse(
          "Company-scoped statement mapping profiles",
          bankStatementMappingProfileDirectorySchema,
        ),
      },
      post: createMutation(
        "createBankStatementMappingProfile",
        createBankStatementMappingProfileRequestSchema,
        bankStatementMappingProfileSchema,
        "Versioned statement mapping profile created",
      ),
    },
    "/banking/statement_mapping_profiles/{profileId}": {
      patch: mutation(
        "updateBankStatementMappingProfile",
        updateBankStatementMappingProfileRequestSchema,
        bankStatementMappingProfileSchema,
        "Versioned statement mapping profile updated",
        [profileId],
      ),
    },
    "/banking/reconciliations": {
      get: {
        operationId: "listBankReconciliations",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyParameter,
          queryParameter("bank_account_id", { type: "string", minLength: 1, maxLength: 128 }),
          queryParameter("state", { type: "string", enum: ["draft", "in_progress", "submitted", "approved"] }),
          queryParameter("method", { type: "string", enum: ["statement_import", "manual_tick"] }),
          queryParameter("statement_date_from", { type: "string", format: "date" }),
          queryParameter("statement_date_to", { type: "string", format: "date" }),
          queryParameter("search", { type: "string", maxLength: 160 }),
          ...cursorParameters,
        ],
        responses: jsonResponse("Company-scoped bank reconciliation directory", bankReconciliationDirectorySchema),
      },
      post: createMutation(
        "createBankReconciliation",
        createBankReconciliationRequestSchema,
        bankReconciliationMutationResultSchema,
        "Bank reconciliation draft created from captured evidence",
      ),
    },
    "/banking/reconciliation_setup": {
      get: {
        operationId: "getBankReconciliationSetup",
        security: [{ cookieAuth: [] }],
        parameters: [
          companyParameter,
          queryParameter("bank_account_id", { type: "string", minLength: 1, maxLength: 128 }, true),
          queryParameter("period_start", { type: "string", format: "date" }, true),
          queryParameter("period_end", { type: "string", format: "date" }, true),
          queryParameter("statement_date", { type: "string", format: "date" }, true),
        ],
        responses: jsonResponse(
          "Server-derived reconciliation opening balance and available totals",
          bankReconciliationSetupSchema,
        ),
      },
    },
    "/banking/reconciliations/{id}": {
      get: {
        operationId: "getBankReconciliation",
        security: [{ cookieAuth: [] }],
        parameters: [reconciliationId],
        responses: jsonResponse("Persisted reconciliation workspace", bankReconciliationDetailSchema),
      },
    },
    "/banking/reconciliations/{id}/matches": {
      post: mutation(
        "createBankReconciliationMatch",
        createBankReconciliationMatchRequestSchema,
        bankReconciliationMatchMutationResultSchema,
        "Exact matches proposed or one match confirmed",
        [reconciliationId],
      ),
    },
    "/banking/reconciliations/{id}/manual_selections": {
      post: mutation(
        "setBankReconciliationManualSelection",
        setBankReconciliationManualSelectionRequestSchema,
        bankReconciliationManualSelectionMutationResultSchema,
        "Manual reconciliation selection persisted with audit evidence",
        [reconciliationId],
      ),
    },
    "/banking/reconciliations/{id}/matches/{matchId}/decision": {
      post: mutation(
        "decideBankReconciliationMatch",
        decideBankReconciliationMatchRequestSchema,
        bankReconciliationMatchMutationResultSchema,
        "Suggested match confirmed or rejected",
        [reconciliationId, matchId],
      ),
    },
    "/banking/reconciliations/{id}/matches/{matchId}": {
      delete: mutation(
        "unmatchBankReconciliation",
        unmatchBankReconciliationRequestSchema,
        bankReconciliationMatchMutationResultSchema,
        "Confirmed match reversed with immutable audit evidence",
        [reconciliationId, matchId],
      ),
    },
    "/banking/reconciliations/{id}/adjustments": {
      post: mutation(
        "createBankReconciliationAdjustment",
        createBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Bank-only adjustment draft created",
        [reconciliationId],
        "201",
      ),
    },
    "/banking/reconciliations/{id}/adjustments/{adjustmentId}": {
      get: {
        operationId: "getBankReconciliationAdjustment",
        security: [{ cookieAuth: [] }],
        parameters: [reconciliationId, adjustmentId],
        responses: jsonResponse("Persisted bank-only adjustment detail", bankReconciliationAdjustmentSchema),
      },
      patch: mutation(
        "updateBankReconciliationAdjustment",
        updateBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Draft bank-only adjustment updated",
        [reconciliationId, adjustmentId],
      ),
    },
    "/banking/reconciliations/{id}/adjustments/{adjustmentId}/submit": {
      post: mutation(
        "submitBankReconciliationAdjustment",
        submitBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Adjustment submitted for a separate decision",
        [reconciliationId, adjustmentId],
      ),
    },
    "/banking/reconciliations/{id}/adjustments/{adjustmentId}/decision": {
      post: mutation(
        "decideBankReconciliationAdjustment",
        decideBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Adjustment approved or rejected under maker-checker controls",
        [reconciliationId, adjustmentId],
      ),
    },
    "/banking/reconciliations/{id}/adjustments/{adjustmentId}/post": {
      post: mutation(
        "postBankReconciliationAdjustment",
        postBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Approved bank-only adjustment posted atomically",
        [reconciliationId, adjustmentId],
      ),
    },
    "/banking/reconciliations/{id}/adjustments/{adjustmentId}/reverse": {
      post: mutation(
        "reverseBankReconciliationAdjustment",
        reverseBankReconciliationAdjustmentRequestSchema,
        bankReconciliationAdjustmentMutationResultSchema,
        "Posted bank-only adjustment reversed with audit evidence",
        [reconciliationId, adjustmentId],
      ),
    },
    "/banking/reconciliations/{id}/submit": {
      post: mutation(
        "submitBankReconciliation",
        submitBankReconciliationRequestSchema,
        bankReconciliationMutationResultSchema,
        "Zero-difference reconciliation submitted for approval",
        [reconciliationId],
      ),
    },
    "/banking/reconciliations/{id}/decision": {
      post: mutation(
        "decideBankReconciliation",
        decideBankReconciliationRequestSchema,
        bankReconciliationMutationResultSchema,
        "Reconciliation approved or returned under maker-checker controls",
        [reconciliationId],
      ),
    },
  };
}

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "Nexora ERP API", version: "1.0.0" },
    servers: [{ url: "/api/v1" }],
    paths: {
      ...fiscalCalendarPaths(),
      ...financeCurrencyPaths(),
      ...companyCurrencyPaths(),
      ...bankTransferPaths(),
      ...bankRevaluationPaths(),
      ...bankStatementAndReconciliationPaths(),
      ...bankGovernancePaths(),
      "/finance/hierarchy": {
        get: {
          operationId: "listFinanceHierarchy",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
            { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 100 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped category and section masters",
              content: { "application/json": { schema: schema(financeHierarchyDirectorySchema) } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createFinanceHierarchy",
          description: "Super Admin direct category/section creation; no approval or posting.",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(createFinanceHierarchyRequestSchema) } },
          },
          responses: {
            "201": {
              description: "Persisted active hierarchy master",
              content: { "application/json": { schema: schema(financeHierarchyItemSchema) } },
            },
            ...securityErrors,
          },
        },
      },
      "/finance/hierarchy/{headerId}": {
        patch: {
          operationId: "changeFinanceHierarchy",
          description:
            "Super Admin audited rename/activation/deactivation; codes, accounting type and parents are immutable; dependencies protected.",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "headerId", required: true, schema: { type: "string", maxLength: 128 } },
            { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
            nominalVersionParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: schema(changeFinanceHierarchyRequestSchema) } },
          },
          responses: {
            "200": {
              description: "Persisted versioned master",
              content: { "application/json": { schema: schema(financeHierarchyItemSchema) } },
            },
            ...securityErrors,
          },
        },
      },
      ...Object.fromEntries(
        ["payments", "receipts"].map((kind) => [
          `/banking/${kind}/workflow_options`,
          {
            get: {
              operationId: kind === "payments" ? "listPaymentWorkflowOptions" : "listReceiptWorkflowOptions",
              security: [{ cookieAuth: [] }],
              parameters: [
                { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
                {
                  in: "query",
                  name: "kind",
                  required: true,
                  schema: { type: "string", enum: ["project", "location", "approver"] },
                },
                { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
                { in: "query", name: "selected_id", schema: { type: "string", maxLength: 128 } },
                { in: "query", name: "cursor", schema: { type: "string", maxLength: 512 } },
                { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
              ],
              responses: {
                "200": {
                  description: "Company-scoped active references or live eligible checkers",
                  content: { "application/json": { schema: { $ref: "#/components/schemas/BankWorkflowOptions" } } },
                },
                ...securityErrors,
              },
            },
          },
        ]),
      ),
      ...referenceMasterPaths(),
      "/auth/login": {
        post: {
          operationId: "loginWithPassword",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PasswordLoginRequest" } } },
          },
          responses: {
            "200": {
              description: "Authenticated server-side session created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/PasswordLoginResponse" } } },
            },
            "401": problemResponse,
            "403": problemResponse,
            "429": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/session": {
        get: {
          operationId: "getSession",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Active authenticated session",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SessionResponse" } } },
            },
            "401": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/change-initial-password": {
        post: {
          operationId: "changeInitialPassword",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ChangeInitialPasswordRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Initial password changed and authenticated server-side session created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SessionResponse" } } },
            },
            "400": problemResponse,
            "401": problemResponse,
            "403": problemResponse,
            "409": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/select-tenant": {
        post: {
          operationId: "selectTenant",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SelectTenantRequest" } } },
          },
          responses: {
            "200": {
              description: "Authenticated server-side session created for the selected organization",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/AuthenticationCompletionResponse" } },
              },
            },
            "401": problemResponse,
            "403": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/cancel-tenant-selection": {
        post: {
          operationId: "cancelTenantSelection",
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CancelTenantSelectionRequest" } },
            },
          },
          responses: {
            "204": { description: "Tenant-selection challenge invalidated" },
            "403": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/session/rotate": {
        post: {
          operationId: "rotateSession",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter],
          responses: {
            "200": {
              description: "Session identifier and CSRF token rotated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SessionResponse" } } },
            },
            "401": problemResponse,
            "403": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/auth/logout": {
        post: {
          operationId: "logout",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter],
          responses: {
            "204": { description: "Current session revoked" },
            "401": problemResponse,
            "403": problemResponse,
          },
        },
      },
      "/auth/logout-all": {
        post: {
          operationId: "logoutAll",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter],
          responses: {
            "204": { description: "All sessions for the current tenant account revoked" },
            "401": problemResponse,
            "403": problemResponse,
          },
        },
      },
      "/security/permissions": {
        get: {
          operationId: "listSecurityPermissions",
          security: [{ cookieAuth: [] }],
          responses: securityPageResponse,
        },
      },
      "/security/capabilities": {
        get: {
          operationId: "listSecurityCapabilities",
          security: [{ cookieAuth: [] }],
          responses: securityPageResponse,
        },
      },
      "/security/roles": {
        get: { operationId: "listSecurityRoles", security: [{ cookieAuth: [] }], responses: securityPageResponse },
        post: {
          operationId: "createSecurityRole",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityRoleRequest" } } },
          },
          responses: {
            "201": {
              description: "Governed role draft created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/role_actions": {
        post: {
          operationId: "actOnSecurityRole",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityRoleActionRequest" } } },
          },
          responses: {
            "200": {
              description: "Governed role transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/assignments": {
        get: {
          operationId: "listSecurityAssignments",
          security: [{ cookieAuth: [] }],
          parameters: [...securityPaginationParameters, ...identityContextParameters],
          responses: securityPageResponse,
        },
      },
      "/security/assignment_requests": {
        post: {
          operationId: "createSecurityAssignmentRequest",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityAssignmentRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Governed assignment request created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/assignment_request_actions": {
        post: {
          operationId: "actOnSecurityAssignmentRequest",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SecurityAssignmentRequestAction" } },
            },
          },
          responses: {
            "200": {
              description: "Governed assignment transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/approvals": {
        get: {
          operationId: "listSecurityApprovals",
          security: [{ cookieAuth: [] }],
          responses: securityPageResponse,
          parameters: [
            ...securityPaginationParameters,
            ...identityContextParameters,
            {
              in: "query",
              name: "resource_type",
              required: true,
              schema: { type: "string", enum: ["user", "role", "assignment"] },
            },
          ],
        },
      },
      "/security/approval_actions": {
        post: {
          operationId: "decideSecurityApproval",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityApprovalAction" } } },
          },
          responses: {
            "200": {
              description: "Authorization approval decision recorded",
              content: {
                "application/json": {
                  schema: {
                    oneOf: [
                      { $ref: "#/components/schemas/SecurityAdministrationResult" },
                      { $ref: "#/components/schemas/SecurityUserAdministrationResult" },
                    ],
                  },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/audit_events": {
        get: {
          operationId: "listSecurityAudit",
          security: [{ cookieAuth: [] }],
          responses: securityPageResponse,
          parameters: [
            ...securityPaginationParameters,
            ...identityContextParameters,
            { in: "query", name: "workspace", required: false, schema: { type: "string", enum: ["users", "roles"] } },
          ],
        },
      },
      "/security/users": {
        get: {
          operationId: "listSecurityUsers",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "archived",
              required: false,
              description: "Filter by archive evidence. Omit to preserve the existing all-records API behavior.",
              schema: { type: "boolean" },
            },
          ],
          responses: {
            "200": {
              description: "Tenant-scoped governed user directory",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityUserPage" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/security/users/{userId}": {
        get: {
          operationId: "getSecurityUser",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "userId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Governed tenant user detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityUserDetail" } } },
            },
            "401": problemResponse,
            "403": problemResponse,
            "404": problemResponse,
            "503": problemResponse,
          },
        },
      },
      "/security/user_options": {
        get: {
          operationId: "listSecurityUserOptions",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Eligible tenant-scoped user administration options",
              content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityUserOptions" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/security/access_review_campaigns": {
        get: {
          operationId: "listSecurityAccessReviewCampaigns",
          security: [{ cookieAuth: [] }],
          parameters: securityPaginationParameters,
          responses: securityPageResponse,
        },
        post: {
          operationId: "createSecurityAccessReviewCampaign",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityAccessReviewCampaign" } },
            },
          },
          responses: {
            "201": {
              description: "Access review campaign draft created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/access_review_items": {
        get: {
          operationId: "listSecurityAccessReviewItems",
          security: [{ cookieAuth: [] }],
          parameters: [
            ...securityPaginationParameters,
            {
              in: "query",
              name: "campaign_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: securityPageResponse,
        },
      },
      "/security/access_review_campaign_actions": {
        post: {
          operationId: "actOnSecurityAccessReviewCampaign",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SecurityAccessReviewCampaignAction" } },
            },
          },
          responses: {
            "200": {
              description: "Access review campaign transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/access_review_decisions": {
        post: {
          operationId: "decideSecurityAccessReviewItem",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SecurityAccessReviewDecision" } },
            },
          },
          responses: {
            "200": {
              description: "Immutable access review decision recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/delegations": {
        get: {
          operationId: "listSecurityDelegations",
          security: [{ cookieAuth: [] }],
          parameters: [
            ...securityPaginationParameters,
            {
              in: "query",
              name: "lifecycle_state",
              schema: {
                type: "string",
                enum: ["draft", "submitted", "approved", "active", "rejected", "revoked", "expired"],
              },
            },
            {
              in: "query",
              name: "principal_id",
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: securityPageResponse,
        },
        post: {
          operationId: "createSecurityDelegation",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityDelegation" } } },
          },
          responses: {
            "201": {
              description: "Governed delegation draft created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/session_policies": {
        get: {
          operationId: "listSecuritySessionPolicies",
          security: [{ cookieAuth: [] }],
          responses: securityPageResponse,
        },
        post: {
          operationId: "createSecuritySessionPolicy",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSecuritySessionPolicy" } } },
          },
          responses: {
            "201": {
              description: "Session policy draft created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/session_policy_actions": {
        post: {
          operationId: "actOnSecuritySessionPolicy",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecuritySessionPolicyAction" } } },
          },
          responses: {
            "200": {
              description: "Session policy transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/delegation_actions": {
        post: {
          operationId: "actOnSecurityDelegation",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityDelegationAction" } } },
          },
          responses: {
            "200": {
              description: "Governed delegation transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/impersonations": {
        get: {
          operationId: "listSecurityImpersonations",
          security: [{ cookieAuth: [] }],
          parameters: [
            ...securityPaginationParameters,
            {
              in: "query",
              name: "lifecycle_state",
              schema: {
                type: "string",
                enum: ["draft", "submitted", "approved", "active", "rejected", "ended", "expired", "activation_failed"],
              },
            },
            { in: "query", name: "principal_id", schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: securityPageResponse,
        },
        post: {
          operationId: "createSecurityImpersonation",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityImpersonation" } } },
          },
          responses: {
            "201": {
              description: "Governed impersonation draft created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/impersonation_actions": {
        post: {
          operationId: "actOnSecurityImpersonation",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityImpersonationAction" } } },
          },
          responses: {
            "200": {
              description: "Governed impersonation transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/user_requests": {
        post: {
          operationId: "createSecurityUserRequest",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateSecurityUserRequest" } } },
          },
          responses: {
            "201": {
              description: "Governed user change request created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/user_request_actions": {
        post: {
          operationId: "actOnSecurityUserRequest",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityUserRequestAction" } } },
          },
          responses: {
            "200": {
              description: "Governed user request transition recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/security/user_emergency_actions": {
        post: {
          operationId: "actOnSecurityUserEmergency",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SecurityUserEmergencyAction" } } },
          },
          responses: {
            "200": {
              description: "Immediate governed user security action recorded",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/SecurityUserAdministrationResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees": {
        get: {
          operationId: "listHrEmployees",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "status", required: false, schema: { type: "string" } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee directory",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createHrEmployeeDraft",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeDraftRequest" } } },
          },
          responses: {
            "201": {
              description: "Governed employee draft created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates": {
        get: {
          operationId: "listChartTemplates",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { in: "query", name: "cursor", schema: { type: "string", pattern: "^\\d{1,7}$" } },
          ],
          responses: {
            "200": {
              description: "Tenant-owned central revisions",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartTemplateDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "importChartTemplate",
          security: [{ cookieAuth: [] }],
          description:
            "Import immutable central definitions as a draft. Requires tenant-scoped finance.chart_template.admin; creates no company accounts.",
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ImportChartTemplateRequest" } } },
          },
          responses: {
            "201": {
              description: "Persisted template import",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartTemplateMutation" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/{templateId}": {
        get: {
          operationId: "getChartTemplate",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } }],
          responses: {
            "200": {
              description: "Central revision metadata",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartTemplateSummary" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/{templateId}/company_adoption": {
        post: {
          operationId: "adoptCompanyChart",
          security: [{ cookieAuth: [] }],
          description:
            "Atomically adopt a published chart as company drafts. Requires company adoption/create permissions and a current preview hash. Does not approve or post.",
          parameters: [
            { in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } },
            ...["x-csrf-token", "idempotency-key", "if-match"].map((name) => ({
              in: "header",
              name,
              required: true,
              schema: { type: "string" },
            })),
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/AdoptCompanyChartRequest" } } },
          },
          responses: {
            "201": {
              description: "Company drafts and source mappings persisted atomically",
              content: { "application/json": { schema: { $ref: "#/components/schemas/AdoptCompanyChartResult" } } },
            },
            "412": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/company_nominals/{nominalId}/classification": {
        post: {
          operationId: "classifyChartNominal",
          security: [{ cookieAuth: [] }],
          description:
            "Explicit posting review of the latest adopted draft. Module-controlled definitions remain blocked from manual approval/posting.",
          parameters: [
            { in: "path", name: "nominalId", required: true, schema: { type: "string", maxLength: 128 } },
            ...["x-csrf-token", "idempotency-key", "if-match"].map((name) => ({
              in: "header",
              name,
              required: true,
              schema: { type: "string" },
            })),
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ClassifyChartNominalRequest" } } },
          },
          responses: {
            "200": {
              description: "Posting review recorded; no activation",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ClassifyChartNominalResult" } } },
            },
            "404": problemResponse,
            "412": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/{templateId}/company_preview": {
        get: {
          operationId: "previewChartCompanyAdoption",
          security: [{ cookieAuth: [] }],
          description:
            "Read-only company adoption preview. Requires tenant template read and live company-scoped Finance read authority. Creates no accounts.",
          parameters: [
            { in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } },
            { in: "query", name: "company_id", required: true, schema: { type: "string", maxLength: 128 } },
            { in: "query", name: "currency", required: true, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { in: "query", name: "cursor", schema: { type: "string", pattern: "^\\d{1,7}$" } },
          ],
          responses: {
            "200": {
              description: "Consistent read-only conflict preview",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartCompanyPreview" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/{templateId}/nodes": {
        get: {
          operationId: "listChartTemplateNodes",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } },
            { in: "query", name: "kind", schema: { type: "string", enum: ["category", "section", "nominal"] } },
            { in: "query", name: "parent_key", schema: { type: "string", maxLength: 140 } },
            { in: "query", name: "category_key", schema: { type: "string", maxLength: 140 } },
            { in: "query", name: "search", schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
            { in: "query", name: "cursor", schema: { type: "string", pattern: "^\\d{1,7}$" } },
          ],
          responses: {
            "200": {
              description: "Scoped definition page",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartTemplateNodes" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/chart_templates/{templateId}/publish": {
        post: {
          operationId: "publishChartTemplate",
          security: [{ cookieAuth: [] }],
          description: "Publish a central reference revision only; does not approve or activate company accounts.",
          parameters: [
            { in: "path", name: "templateId", required: true, schema: { type: "string", maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
            nominalVersionParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PublishChartTemplateRequest" } } },
          },
          responses: {
            "200": {
              description: "Published immutable revision",
              content: { "application/json": { schema: { $ref: "#/components/schemas/ChartTemplateMutation" } } },
            },
            "404": problemResponse,
            "412": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/finance/nominals/options": {
        get: {
          operationId: "listFinanceNominalOptions",
          description:
            "Returns authorized companies independently of Banking read permissions; selected-company options require company access.",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized companies, Finance hierarchy, active currencies and setup readiness",
              content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceNominalOptions" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/finance/nominals": {
        get: {
          operationId: "listFinanceNominals",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "category_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "section_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "currency", required: false, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
            {
              in: "query",
              name: "state",
              required: false,
              schema: {
                type: "string",
                enum: ["draft", "pending_approval", "active", "rejected", "inactive", "closed", "review_required"],
              },
            },
            {
              in: "query",
              name: "account_status",
              required: false,
              schema: { type: "string", enum: ["active", "inactive"] },
            },
            {
              in: "query",
              name: "sort_by",
              required: false,
              schema: { type: "string", enum: ["code", "name", "currency", "state"], default: "code" },
            },
            {
              in: "query",
              name: "sort_direction",
              required: false,
              schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped Finance Nominals without external bank identifiers",
              content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceNominalDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: nominalMutationOperation("createFinanceNominal", "CreateFinanceNominalRequest", true),
      },
      "/finance/nominals/{nominalId}": {
        get: {
          operationId: "getFinanceNominal",
          security: [{ cookieAuth: [] }],
          parameters: [nominalIdParameter],
          responses: {
            "200": {
              description: "Persisted Nominal, lifecycle evidence and authorized actions",
              content: { "application/json": { schema: { $ref: "#/components/schemas/FinanceNominalDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        patch: nominalMutationOperation("updateFinanceNominal", "UpdateFinanceNominalRequest"),
      },
      "/finance/nominals/{nominalId}/submit": {
        post: nominalMutationOperation("submitFinanceNominal", "SubmitFinanceNominalRequest"),
      },
      "/finance/nominals/{nominalId}/decision": {
        post: nominalMutationOperation("decideFinanceNominal", "DecideFinanceNominalRequest"),
      },
      "/finance/nominals/{nominalId}/status": {
        post: nominalMutationOperation("changeFinanceNominalStatus", "ChangeFinanceNominalStatusRequest"),
      },
      "/banking/companies": {
        get: {
          operationId: "listBankingCompanies",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Companies within the authenticated user's active Banking access scope",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankingCompanyDirectory" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/ledger_accounts": {
        get: {
          operationId: "listBankingLedgerAccounts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200, default: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Eligible postable asset accounts for bank-account mapping",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/BankingLedgerAccountDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts": {
        get: {
          operationId: "listBankAccounts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "bank", required: false, schema: { type: "string", maxLength: 200 } },
            { in: "query", name: "currency", required: false, schema: { type: "string", pattern: "^[A-Z]{3}$" } },
            {
              in: "query",
              name: "ledger_account_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "state", required: false, schema: { type: "string" } },
            { in: "query", name: "sort_by", required: false, schema: { type: "string", default: "account_name" } },
            {
              in: "query",
              name: "sort_direction",
              required: false,
              schema: { type: "string", enum: ["asc", "desc"], default: "asc" },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped bank-account directory",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createBankAccount",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateBankAccountRequest" } } },
          },
          responses: {
            "201": {
              description: "Governed bank-account draft created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts/summary": {
        get: {
          operationId: "getBankAccountSummary",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Posted ledger balance totals by account currency",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountCurrencySummary" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts/{accountId}": {
        get: {
          operationId: "getBankAccount",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "accountId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Masked governed bank-account detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        post: {
          operationId: "updateBankAccount",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "accountId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateBankAccountRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank-account draft updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts/{accountId}/submit": {
        post: {
          operationId: "submitBankAccount",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "accountId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitBankAccountRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank account submitted for independent approval",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts/{accountId}/decision": {
        post: {
          operationId: "decideBankAccount",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "accountId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DecideBankAccountRequest" } } },
          },
          responses: {
            "200": {
              description: "Independent bank-account approval decision recorded",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/accounts/{accountId}/status": {
        post: {
          operationId: "changeBankAccountStatus",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "accountId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ChangeBankAccountStatusRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Bank-account operational status changed",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankAccountMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/payments": {
        get: {
          operationId: "listBankPayments",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "bank_account_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "state",
              required: false,
              schema: { type: "string", enum: ["draft", "submitted", "approved", "rejected", "posted", "reversed"] },
            },
            { in: "query", name: "posting_date_from", required: false, schema: { type: "string", format: "date" } },
            { in: "query", name: "posting_date_to", required: false, schema: { type: "string", format: "date" } },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "sort_by",
              required: false,
              schema: {
                type: "string",
                enum: ["posting_date", "reference", "total_amount", "state"],
                default: "posting_date",
              },
            },
            {
              in: "query",
              name: "sort_direction",
              required: false,
              schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped Bank Payment directory",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateBankPaymentRequest" } } },
          },
          responses: {
            "201": {
              description: "Bank Payment draft created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/payments/options": {
        get: {
          operationId: "listBankPaymentOptions",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Eligible active Bank Accounts for payment capture",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentOptions" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/payments/nominal_accounts": {
        get: {
          operationId: "listBankPaymentNominalAccounts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Bounded active nominal-account directory for Bank Payments",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/BankPaymentNominalAccountDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/payments/{paymentId}": {
        get: {
          operationId: "getBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped governed Bank Payment detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        patch: {
          operationId: "updateBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateBankPaymentRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Payment draft updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/payments/{paymentId}/submit": {
        post: {
          operationId: "submitBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitBankPaymentRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Payment submitted for independent approval",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/payments/{paymentId}/decision": {
        post: {
          operationId: "decideBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DecideBankPaymentRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Payment independently approved or rejected",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/payments/{paymentId}/post": {
        post: {
          operationId: "postBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PostBankPaymentRequest" } } },
          },
          responses: {
            "200": {
              description: "Approved Bank Payment posted to an immutable journal",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentPostingResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/payments/{paymentId}/reverse": {
        post: {
          operationId: "reverseBankPayment",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "paymentId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReverseBankPaymentRequest" } } },
          },
          responses: {
            "200": {
              description: "Posted Bank Payment reversed through a compensating journal",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankPaymentReversalResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/receipts": {
        get: {
          operationId: "listBankReceipts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "bank_account_id",
              required: false,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "state",
              required: false,
              schema: { type: "string", enum: ["draft", "submitted", "approved", "rejected", "posted", "reversed"] },
            },
            { in: "query", name: "posting_date_from", required: false, schema: { type: "string", format: "date" } },
            { in: "query", name: "posting_date_to", required: false, schema: { type: "string", format: "date" } },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "sort_by",
              required: false,
              schema: {
                type: "string",
                enum: ["posting_date", "reference", "total_amount", "state"],
                default: "posting_date",
              },
            },
            {
              in: "query",
              name: "sort_direction",
              required: false,
              schema: { type: "string", enum: ["asc", "desc"], default: "desc" },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", minLength: 1, maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped Bank Receipt directory",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptDirectory" } } },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateBankReceiptRequest" } } },
          },
          responses: {
            "201": {
              description: "Bank Receipt draft created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptMutationResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/options": {
        get: {
          operationId: "listBankReceiptOptions",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Eligible active Bank Accounts and receipt methods",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptOptions" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/nominal_accounts": {
        get: {
          operationId: "listBankReceiptNominalAccounts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Bounded active nominal-account directory for Bank Receipts",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/BankReceiptNominalAccountDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/{receiptId}": {
        get: {
          operationId: "getBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped governed Bank Receipt detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        patch: {
          operationId: "updateBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateBankReceiptRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Receipt draft updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/{receiptId}/submit": {
        post: {
          operationId: "submitBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitBankReceiptRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Receipt submitted for independent approval",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/{receiptId}/decision": {
        post: {
          operationId: "decideBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DecideBankReceiptRequest" } } },
          },
          responses: {
            "200": {
              description: "Bank Receipt independently approved or rejected",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptMutationResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/{receiptId}/post": {
        post: {
          operationId: "postBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/PostBankReceiptRequest" } } },
          },
          responses: {
            "200": {
              description: "Approved Bank Receipt posted to an immutable journal",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptPostingResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/banking/receipts/{receiptId}/reverse": {
        post: {
          operationId: "reverseBankReceipt",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "receiptId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/ReverseBankReceiptRequest" } } },
          },
          responses: {
            "200": {
              description: "Posted Bank Receipt reversed through a compensating journal",
              content: { "application/json": { schema: { $ref: "#/components/schemas/BankReceiptReversalResult" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/companies": {
        get: {
          operationId: "listHrCompanies",
          security: [{ cookieAuth: [] }],
          responses: {
            "200": {
              description: "Companies within the authenticated user's active HR access scope",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrCompanyDirectory" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/organization_units": {
        get: {
          operationId: "listHrOrganizationUnits",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "type", required: false, schema: { type: "string", enum: ["branch", "department"] } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 200, default: 200 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized active organization placements below a company",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrOrganizationUnitDirectory" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}": {
        get: {
          operationId: "getHrEmployee",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized employee detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employee_drafts": {
        get: {
          operationId: "listHrEmployeeDrafts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee drafts",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftDirectory" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employee_drafts/{employeeId}": {
        get: {
          operationId: "getHrEmployeeDraft",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized employee draft detail",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftDetail" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        post: {
          operationId: "updateHrEmployeeDraft",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateHrEmployeeDraftRequest" } } },
          },
          responses: {
            "200": {
              description: "Governed employee draft updated",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employee_drafts/{employeeId}/submit": {
        post: {
          operationId: "submitHrEmployeeDraft",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitHrEmployeeDraftRequest" } } },
          },
          responses: {
            "200": {
              description: "Employee draft submitted for approval",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employee_draft_approvals": {
        get: {
          operationId: "listHrEmployeeDraftApprovals",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee draft approval queue",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftApprovalQueue" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employee_draft_approvals/{employeeId}": {
        get: {
          operationId: "getHrEmployeeDraftApproval",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Pending employee draft profile for an authorized HR approver",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftApprovalDetail" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employee_drafts/{employeeId}/approval_decision": {
        post: {
          operationId: "decideHrEmployeeDraftApproval",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DecideHrEmployeeDraftApprovalRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Employee draft approval decision recorded",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDraftResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/profile_draft_assignment": {
        post: {
          operationId: "createHrProfileDraftAssignment",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrProfileDraftAssignmentRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Employee profile-draft assignment created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrProfileDraftAssignmentResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/contacts": {
        get: {
          operationId: "listHrEmployeeContacts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized active employee contact records",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeContactDirectory" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        post: {
          operationId: "createHrEmployeeContact",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeContactRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Append-only employee contact created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeContactResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/emergency_contacts": {
        get: {
          operationId: "listHrEmployeeEmergencyContacts",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized active employee emergency contacts",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeEmergencyContactDirectory" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
        post: {
          operationId: "createHrEmployeeEmergencyContact",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeEmergencyContactRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Append-only emergency contact created",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeEmergencyContactResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/documents": {
        get: {
          operationId: "listHrEmployeeDocuments",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized employee document metadata without storage location",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeDocumentDirectory" } } },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/assignments": {
        get: {
          operationId: "listHrEmployeeAssignments",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized immutable employee assignment timeline",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeAssignmentDirectory" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/status_history": {
        get: {
          operationId: "listHrEmployeeStatusHistory",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
          ],
          responses: {
            "200": {
              description: "Authorized immutable employee status history",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeStatusHistoryDirectory" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/lifecycle_events": {
        get: {
          operationId: "listHrEmployeeLifecycleEvents",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Authorized immutable employee lifecycle events",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeLifecycleEventDirectory" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/profile_history": {
        get: {
          operationId: "listHrEmployeeProfileHistory",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
            },
            { in: "query", name: "cursor", required: false, schema: { type: "string", maxLength: 512 } },
          ],
          responses: {
            "200": {
              description: "Authorized non-sensitive immutable employee profile history",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeProfileVersionDirectory" } },
              },
            },
            "404": problemResponse,
            ...securityErrors,
          },
        },
      },
      "/hr/masters": {
        get: {
          operationId: "listHrMasters",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "type", required: false, schema: { type: "string" } },
            { in: "query", name: "active_only", required: false, schema: { type: "boolean", default: true } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 100 },
            },
          ],
          responses: {
            "200": {
              description: "Company-scoped HR master records",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterDirectory" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/jobs": {
        post: {
          operationId: "createHrJob",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrJobRequest" } } },
          },
          responses: {
            "201": {
              description: "Company-scoped job created",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrJobResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/hire_requests": {
        get: {
          operationId: "listHrEmployeeHireRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee Hire requests",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeHireRequestDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/hire_requests": {
        post: {
          operationId: "createHrEmployeeHireRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeHireRequest" } } },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable employee hire request",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeHireRequestResult" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/hire_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeeHireRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee Hire request review",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeHireRequestReview" } } },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/hire_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeeHireRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/DecideHrEmployeeHireRequest" } } },
          },
          responses: {
            "200": {
              description: "Independently decided employee Hire request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeHireDecisionResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/transfer_requests": {
        get: {
          operationId: "listHrEmployeeTransferRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee transfer requests",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeTransferRequestDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/transfer_requests": {
        post: {
          operationId: "createHrEmployeeTransferRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeTransferRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable employee transfer request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeTransferRequestResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/transfer_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeeTransferRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee transfer request review",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeTransferRequestReview" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/transfer_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeeTransferRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DecideHrEmployeeTransferRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Independently decided employee transfer request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeeTransferDecisionResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/promotion_requests": {
        get: {
          operationId: "listHrEmployeePromotionRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee promotion requests",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeePromotionRequestDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/promotion_requests": {
        post: {
          operationId: "createHrEmployeePromotionRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeePromotionRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable employee promotion request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeePromotionRequestResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/promotion_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeePromotionRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee promotion request review",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeePromotionRequestReview" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/promotion_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeePromotionRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DecideHrEmployeePromotionRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Independently decided employee promotion request",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmployeePromotionDecisionResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/manager_change_requests": {
        get: {
          operationId: "listHrEmployeeManagerChangeRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee manager-change requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeManagerChangeRequestDirectory" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/manager_change_requests": {
        post: {
          operationId: "createHrEmployeeManagerChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmployeeManagerChangeRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable employee manager-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeManagerChangeRequestResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/manager_change_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeeManagerChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee manager-change request review",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeManagerChangeRequestReview" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/manager_change_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeeManagerChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/DecideHrEmployeeManagerChangeRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Independently decided employee manager-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeManagerChangeDecisionResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/work_location_change_requests": {
        get: {
          operationId: "listHrEmployeeWorkLocationChangeRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee work-location-change requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeWorkLocationChangeRequestDirectory" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/work_location_change_requests": {
        post: {
          operationId: "createHrEmployeeWorkLocationChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateHrEmployeeWorkLocationChangeRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable employee work-location-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeWorkLocationChangeRequestResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/work_location_change_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeeWorkLocationChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped employee work-location-change request review",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeWorkLocationChangeRequestReview" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/work_location_change_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeeWorkLocationChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DecideHrEmployeeWorkLocationChangeRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Independently decided employee work-location-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeWorkLocationChangeDecisionResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/organization_placement_change_requests": {
        get: {
          operationId: "listHrEmployeeOrganizationPlacementChangeRequests",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Pending company-scoped employee organization-placement-change requests",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeOrganizationPlacementChangeRequestDirectory" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/organization_placement_change_requests": {
        post: {
          operationId: "createHrEmployeeOrganizationPlacementChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/CreateHrEmployeeOrganizationPlacementChangeRequest" },
              },
            },
          },
          responses: {
            "201": {
              description: "Pending, independently approvable organization-placement-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeOrganizationPlacementChangeRequestResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}": {
        get: {
          operationId: "getHrEmployeeOrganizationPlacementChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
          ],
          responses: {
            "200": {
              description: "Company-scoped organization-placement-change request review",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeOrganizationPlacementChangeRequestReview" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}/decision": {
        post: {
          operationId: "decideHrEmployeeOrganizationPlacementChangeRequest",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "path",
              name: "employeeId",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            { in: "path", name: "requestId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/DecideHrEmployeeOrganizationPlacementChangeRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Independently decided organization-placement-change request",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmployeeOrganizationPlacementChangeDecisionResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employment_lifecycle_policies": {
        get: {
          operationId: "listHrEmploymentLifecyclePolicies",
          security: [{ cookieAuth: [] }],
          parameters: [
            {
              in: "query",
              name: "company_id",
              required: true,
              schema: { type: "string", minLength: 1, maxLength: 128 },
            },
            {
              in: "query",
              name: "limit",
              required: false,
              schema: { type: "integer", minimum: 1, maximum: 100, default: 50 },
            },
          ],
          responses: {
            "200": {
              description: "Company-scoped employment lifecycle policy directory",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmploymentLifecyclePolicyDirectory" } },
              },
            },
            ...securityErrors,
          },
        },
        post: {
          operationId: "createHrEmploymentLifecyclePolicy",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreateHrEmploymentLifecyclePolicyRequest" } },
            },
          },
          responses: {
            "201": {
              description: "Draft employment lifecycle policy created with a fixed initial/hire definition",
              content: {
                "application/json": { schema: { $ref: "#/components/schemas/HrEmploymentLifecyclePolicyResult" } },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employment_lifecycle_policies/{policyId}/submit": {
        post: {
          operationId: "submitHrEmploymentLifecyclePolicy",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "policyId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/SubmitHrEmploymentLifecyclePolicyRequest" } },
            },
          },
          responses: {
            "200": {
              description: "Draft lifecycle policy submitted for independent approval",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmploymentLifecyclePolicySubmissionResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employment_lifecycle_policies/{policyId}/approval_decision": {
        post: {
          operationId: "approveHrEmploymentLifecyclePolicy",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "policyId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ApproveHrEmploymentLifecyclePolicyRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Lifecycle policy independently approved; activation remains a separate operation",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmploymentLifecyclePolicyApprovalResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/hr/employment_lifecycle_policies/{policyId}/activate": {
        post: {
          operationId: "activateHrEmploymentLifecyclePolicy",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "path", name: "policyId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            csrfParameter,
            idempotencyParameter,
          ],
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/ActivateHrEmploymentLifecyclePolicyRequest" },
              },
            },
          },
          responses: {
            "200": {
              description: "Approved current policy activated",
              content: {
                "application/json": {
                  schema: { $ref: "#/components/schemas/HrEmploymentLifecyclePolicyActivationResult" },
                },
              },
            },
            ...securityErrors,
          },
        },
      },
      "/health/live": {
        get: {
          operationId: "getLiveness",
          responses: {
            "200": {
              description: "Process is alive",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthStatus" } } },
            },
          },
        },
      },
      "/health/ready": {
        get: {
          operationId: "getReadiness",
          responses: {
            "200": {
              description: "Required dependencies are ready",
              content: { "application/json": { schema: { $ref: "#/components/schemas/HealthStatus" } } },
            },
            "503": problemResponse,
          },
        },
      },
      "/jobs/sample": {
        post: {
          operationId: "enqueueSampleJob",
          requestBody: {
            required: true,
            content: { "application/json": { schema: { $ref: "#/components/schemas/SampleJobPayload" } } },
          },
          responses: {
            "202": {
              description: "Job accepted",
              content: { "application/json": { schema: { $ref: "#/components/schemas/JobReceipt" } } },
            },
          },
        },
      },
    },
    components: {
      securitySchemes: {
        cookieAuth: { type: "apiKey", in: "cookie", name: "__Host-nexora_session" },
      },
      schemas: {
        BankWorkflowOptions: schema(bankWorkflowOptionsSchema),
        ReassignBankApproverRequest: schema(reassignBankApproverRequestSchema),
        BankSelfApprovalGrant: schema(bankSelfApprovalGrantSchema),
        BankSelfApprovalDirectory: schema(bankSelfApprovalDirectorySchema),
        BankSelfApprovalOptions: schema(bankSelfApprovalOptionsSchema),
        BankSelfApprovalMutation: schema(bankSelfApprovalMutationSchema),
        ChangeBankSelfApprovalRequest: schema(changeBankSelfApprovalRequestSchema),
        ReferenceMaster: schema(referenceMasterSchema),
        ReferenceMasterDirectory: schema(referenceMasterDirectorySchema),
        ReferenceMasterMutation: schema(referenceMasterMutationSchema),
        CreateReferenceMasterRequest: schema(createReferenceMasterRequestSchema),
        UpdateReferenceMasterRequest: schema(updateReferenceMasterRequestSchema),
        ChangeReferenceMasterStatusRequest: schema(changeReferenceMasterStatusRequestSchema),
        ImportChartTemplateRequest: schema(importChartTemplateRequestSchema),
        PublishChartTemplateRequest: schema(publishChartTemplateRequestSchema),
        ChartTemplateSummary: schema(chartTemplateSummarySchema),
        ChartTemplateDirectory: schema(chartTemplateDirectorySchema),
        ChartTemplateNodes: schema(chartTemplateNodesSchema),
        ChartTemplateMutation: schema(chartTemplateMutationSchema),
        ChartCompanyPreview: schema(chartCompanyPreviewSchema),
        AdoptCompanyChartRequest: schema(adoptCompanyChartRequestSchema),
        AdoptCompanyChartResult: schema(adoptCompanyChartResultSchema),
        ClassifyChartNominalRequest: schema(classifyChartNominalRequestSchema),
        ClassifyChartNominalResult: schema(classifyChartNominalResultSchema),
        FinanceNominalOptions: schema(financeNominalOptionsSchema),
        FinanceNominalDirectory: schema(financeNominalDirectorySchema),
        FinanceNominalDetail: schema(financeNominalDetailSchema),
        FinanceNominalMutationResult: schema(financeNominalMutationResultSchema),
        CreateFinanceNominalRequest: schema(createFinanceNominalRequestSchema),
        UpdateFinanceNominalRequest: schema(updateFinanceNominalRequestSchema),
        SubmitFinanceNominalRequest: schema(submitFinanceNominalRequestSchema),
        DecideFinanceNominalRequest: schema(decideFinanceNominalRequestSchema),
        ChangeFinanceNominalStatusRequest: schema(changeFinanceNominalStatusRequestSchema),
        PasswordLoginRequest: schema(passwordLoginRequestSchema),
        PasswordLoginResponse: schema(passwordLoginResponseSchema),
        PasswordChangeRequiredResponse: schema(passwordChangeRequiredResponseSchema),
        AuthenticationCompletionResponse: schema(authenticationCompletionResponseSchema),
        ChangeInitialPasswordRequest: schema(changeInitialPasswordRequestSchema),
        TenantSelectionRequiredResponse: schema(tenantSelectionRequiredResponseSchema),
        SelectTenantRequest: schema(selectTenantRequestSchema),
        CancelTenantSelectionRequest: schema(cancelTenantSelectionRequestSchema),
        SessionResponse: schema(sessionResponseSchema),
        HealthStatus: schema(healthStatusSchema),
        BankingCompanyDirectory: schema(bankingCompanyDirectorySchema),
        BankingLedgerAccountDirectory: schema(bankingLedgerAccountDirectorySchema),
        BankAccountDirectory: schema(bankAccountDirectorySchema),
        BankAccountCurrencySummary: schema(bankAccountCurrencySummarySchema),
        BankAccountDetail: schema(bankAccountDetailSchema),
        CreateBankAccountRequest: schema(createBankAccountRequestSchema),
        UpdateBankAccountRequest: schema(updateBankAccountRequestSchema),
        SubmitBankAccountRequest: schema(submitBankAccountRequestSchema),
        DecideBankAccountRequest: schema(decideBankAccountRequestSchema),
        ChangeBankAccountStatusRequest: schema(changeBankAccountStatusRequestSchema),
        BankAccountMutationResult: schema(bankAccountMutationResultSchema),
        BankPaymentDirectory: schema(bankPaymentDirectorySchema),
        BankPaymentDetail: schema(bankPaymentDetailSchema),
        BankPaymentOptions: schema(bankPaymentOptionsSchema),
        BankPaymentNominalAccountDirectory: schema(bankPaymentNominalAccountDirectorySchema),
        CreateBankPaymentRequest: schema(createBankPaymentRequestSchema),
        UpdateBankPaymentRequest: schema(updateBankPaymentRequestSchema),
        SubmitBankPaymentRequest: schema(submitBankPaymentRequestSchema),
        DecideBankPaymentRequest: schema(decideBankPaymentRequestSchema),
        PostBankPaymentRequest: schema(postBankPaymentRequestSchema),
        ReverseBankPaymentRequest: schema(reverseBankPaymentRequestSchema),
        BankPaymentMutationResult: schema(bankPaymentMutationResultSchema),
        BankPaymentPostingResult: schema(bankPaymentPostingResultSchema),
        BankPaymentReversalResult: schema(bankPaymentReversalResultSchema),
        BankStatementImportOptions: schema(bankStatementImportOptionsSchema),
        BankStatementImportDirectory: schema(bankStatementImportDirectorySchema),
        BankStatementImportDetail: schema(bankStatementImportDetailSchema),
        BankStatementImportMutationResult: schema(bankStatementImportMutationResultSchema),
        BankStatementMappingProfileDirectory: schema(bankStatementMappingProfileDirectorySchema),
        BankStatementMappingProfile: schema(bankStatementMappingProfileSchema),
        CreateBankStatementMappingProfileRequest: schema(createBankStatementMappingProfileRequestSchema),
        UpdateBankStatementMappingProfileRequest: schema(updateBankStatementMappingProfileRequestSchema),
        UpdateBankStatementImportMappingRequest: schema(updateBankStatementImportMappingRequestSchema),
        UpdateBankStatementLineRequest: schema(updateBankStatementLineRequestSchema),
        ValidateBankStatementImportRequest: schema(validateBankStatementImportRequestSchema),
        FinalizeBankStatementImportRequest: schema(finalizeBankStatementImportRequestSchema),
        BankReconciliationDirectory: schema(bankReconciliationDirectorySchema),
        BankReconciliationDetail: schema(bankReconciliationDetailSchema),
        BankReconciliationMutationResult: schema(bankReconciliationMutationResultSchema),
        BankReconciliationMatchMutationResult: schema(bankReconciliationMatchMutationResultSchema),
        BankReconciliationSetup: schema(bankReconciliationSetupSchema),
        BankReconciliationManualSelectionMutationResult: schema(bankReconciliationManualSelectionMutationResultSchema),
        BankReconciliationAdjustmentMutationResult: schema(bankReconciliationAdjustmentMutationResultSchema),
        CreateBankReconciliationRequest: schema(createBankReconciliationRequestSchema),
        CreateBankReconciliationMatchRequest: schema(createBankReconciliationMatchRequestSchema),
        DecideBankReconciliationMatchRequest: schema(decideBankReconciliationMatchRequestSchema),
        UnmatchBankReconciliationRequest: schema(unmatchBankReconciliationRequestSchema),
        CreateBankReconciliationAdjustmentRequest: schema(createBankReconciliationAdjustmentRequestSchema),
        UpdateBankReconciliationAdjustmentRequest: schema(updateBankReconciliationAdjustmentRequestSchema),
        SubmitBankReconciliationAdjustmentRequest: schema(submitBankReconciliationAdjustmentRequestSchema),
        DecideBankReconciliationAdjustmentRequest: schema(decideBankReconciliationAdjustmentRequestSchema),
        PostBankReconciliationAdjustmentRequest: schema(postBankReconciliationAdjustmentRequestSchema),
        ReverseBankReconciliationAdjustmentRequest: schema(reverseBankReconciliationAdjustmentRequestSchema),
        SubmitBankReconciliationRequest: schema(submitBankReconciliationRequestSchema),
        DecideBankReconciliationRequest: schema(decideBankReconciliationRequestSchema),
        HrEmployeeDirectory: schema(hrEmployeeDirectorySchema),
        HrCompanyDirectory: schema(hrCompanyDirectorySchema),
        HrEmployeeDetail: schema(hrEmployeeDetailSchema),
        HrEmployeeDraftDirectory: schema(hrEmployeeDraftDirectorySchema),
        HrEmployeeDraftDetail: schema(hrEmployeeDraftDetailSchema),
        HrEmployeeDraftApprovalQueue: schema(hrEmployeeDraftApprovalQueueSchema),
        HrEmployeeDraftApprovalDetail: schema(hrEmployeeDraftApprovalDetailSchema),
        UpdateHrEmployeeDraftRequest: schema(updateHrEmployeeDraftRequestSchema),
        SubmitHrEmployeeDraftRequest: schema(submitHrEmployeeDraftRequestSchema),
        DecideHrEmployeeDraftApprovalRequest: schema(decideHrEmployeeDraftApprovalRequestSchema),
        CreateHrProfileDraftAssignmentRequest: schema(createHrProfileDraftAssignmentRequestSchema),
        HrProfileDraftAssignmentResult: schema(hrProfileDraftAssignmentResultSchema),
        CreateHrEmployeeDraftRequest: schema(createHrEmployeeDraftRequestSchema),
        HrEmployeeDraftResult: schema(hrEmployeeDraftResultSchema),
        HrOrganizationUnitDirectory: schema(hrOrganizationUnitDirectorySchema),
        HrMasterDirectory: schema(hrMasterDirectorySchema),
        HrEmployeeContactDirectory: schema(hrEmployeeContactDirectorySchema),
        CreateHrEmployeeContactRequest: schema(createHrEmployeeContactRequestSchema),
        HrEmployeeContactResult: schema(hrEmployeeContactResultSchema),
        HrEmployeeEmergencyContactDirectory: schema(hrEmployeeEmergencyContactDirectorySchema),
        CreateHrEmployeeEmergencyContactRequest: schema(createHrEmployeeEmergencyContactRequestSchema),
        HrEmployeeEmergencyContactResult: schema(hrEmployeeEmergencyContactResultSchema),
        HrEmployeeDocumentDirectory: schema(hrEmployeeDocumentDirectorySchema),
        HrEmployeeAssignmentDirectory: schema(hrEmployeeAssignmentDirectorySchema),
        HrEmployeeStatusHistoryDirectory: schema(hrEmployeeStatusHistoryDirectorySchema),
        HrEmployeeLifecycleEventDirectory: schema(hrEmployeeLifecycleEventDirectorySchema),
        HrEmployeeProfileVersionDirectory: schema(hrEmployeeProfileVersionDirectorySchema),
        HrEmploymentLifecyclePolicyDirectory: schema(hrEmploymentLifecyclePolicyDirectorySchema),
        CreateHrEmploymentLifecyclePolicyRequest: schema(createHrEmploymentLifecyclePolicyRequestSchema),
        HrEmploymentLifecyclePolicyResult: schema(hrEmploymentLifecyclePolicyResultSchema),
        SubmitHrEmploymentLifecyclePolicyRequest: schema(submitHrEmploymentLifecyclePolicyRequestSchema),
        HrEmploymentLifecyclePolicySubmissionResult: schema(hrEmploymentLifecyclePolicySubmissionResultSchema),
        ApproveHrEmploymentLifecyclePolicyRequest: schema(approveHrEmploymentLifecyclePolicyRequestSchema),
        HrEmploymentLifecyclePolicyApprovalResult: schema(hrEmploymentLifecyclePolicyApprovalResultSchema),
        ActivateHrEmploymentLifecyclePolicyRequest: schema(activateHrEmploymentLifecyclePolicyRequestSchema),
        HrEmploymentLifecyclePolicyActivationResult: schema(hrEmploymentLifecyclePolicyActivationResultSchema),
        CreateHrJobRequest: schema(createHrJobRequestSchema),
        HrJobResult: schema(hrJobResultSchema),
        CreateHrEmployeeHireRequest: schema(createHrEmployeeHireRequestSchema),
        HrEmployeeHireRequestResult: schema(hrEmployeeHireRequestResultSchema),
        DecideHrEmployeeHireRequest: schema(decideHrEmployeeHireRequestSchema),
        HrEmployeeHireDecisionResult: schema(hrEmployeeHireDecisionResultSchema),
        HrEmployeeHireRequestDirectory: schema(hrEmployeeHireRequestDirectorySchema),
        HrEmployeeHireRequestReview: schema(hrEmployeeHireRequestReviewSchema),
        CreateHrEmployeeTransferRequest: schema(createHrEmployeeTransferRequestSchema),
        HrEmployeeTransferRequestResult: schema(hrEmployeeTransferRequestResultSchema),
        DecideHrEmployeeTransferRequest: schema(decideHrEmployeeTransferRequestSchema),
        HrEmployeeTransferDecisionResult: schema(hrEmployeeTransferDecisionResultSchema),
        HrEmployeeTransferRequestDirectory: schema(hrEmployeeTransferRequestDirectorySchema),
        HrEmployeeTransferRequestReview: schema(hrEmployeeTransferRequestReviewSchema),
        CreateHrEmployeePromotionRequest: schema(createHrEmployeePromotionRequestSchema),
        HrEmployeePromotionRequestResult: schema(hrEmployeePromotionRequestResultSchema),
        DecideHrEmployeePromotionRequest: schema(decideHrEmployeePromotionRequestSchema),
        HrEmployeePromotionDecisionResult: schema(hrEmployeePromotionDecisionResultSchema),
        HrEmployeePromotionRequestDirectory: schema(hrEmployeePromotionRequestDirectorySchema),
        HrEmployeePromotionRequestReview: schema(hrEmployeePromotionRequestReviewSchema),
        CreateHrEmployeeManagerChangeRequest: schema(createHrEmployeeManagerChangeRequestSchema),
        HrEmployeeManagerChangeRequestResult: schema(hrEmployeeManagerChangeRequestResultSchema),
        DecideHrEmployeeManagerChangeRequest: schema(decideHrEmployeeManagerChangeRequestSchema),
        HrEmployeeManagerChangeDecisionResult: schema(hrEmployeeManagerChangeDecisionResultSchema),
        HrEmployeeManagerChangeRequestDirectory: schema(hrEmployeeManagerChangeRequestDirectorySchema),
        HrEmployeeManagerChangeRequestReview: schema(hrEmployeeManagerChangeRequestReviewSchema),
        CreateHrEmployeeWorkLocationChangeRequest: schema(createHrEmployeeWorkLocationChangeRequestSchema),
        HrEmployeeWorkLocationChangeRequestResult: schema(hrEmployeeWorkLocationChangeRequestResultSchema),
        DecideHrEmployeeWorkLocationChangeRequest: schema(decideHrEmployeeWorkLocationChangeRequestSchema),
        HrEmployeeWorkLocationChangeDecisionResult: schema(hrEmployeeWorkLocationChangeDecisionResultSchema),
        HrEmployeeWorkLocationChangeRequestDirectory: schema(hrEmployeeWorkLocationChangeRequestDirectorySchema),
        HrEmployeeWorkLocationChangeRequestReview: schema(hrEmployeeWorkLocationChangeRequestReviewSchema),
        CreateHrEmployeeOrganizationPlacementChangeRequest: schema(
          createHrEmployeeOrganizationPlacementChangeRequestSchema,
        ),
        HrEmployeeOrganizationPlacementChangeRequestResult: schema(
          hrEmployeeOrganizationPlacementChangeRequestResultSchema,
        ),
        DecideHrEmployeeOrganizationPlacementChangeRequest: schema(
          decideHrEmployeeOrganizationPlacementChangeRequestSchema,
        ),
        HrEmployeeOrganizationPlacementChangeDecisionResult: schema(
          hrEmployeeOrganizationPlacementChangeDecisionResultSchema,
        ),
        HrEmployeeOrganizationPlacementChangeRequestDirectory: schema(
          hrEmployeeOrganizationPlacementChangeRequestDirectorySchema,
        ),
        HrEmployeeOrganizationPlacementChangeRequestReview: schema(
          hrEmployeeOrganizationPlacementChangeRequestReviewSchema,
        ),
        ProblemDetails: schema(problemDetailsSchema),
        SampleJobPayload: schema(sampleJobPayloadSchema),
        JobReceipt: schema(jobReceiptSchema),
        SecurityPage: schema(securityPageSchema),
        CreateSecurityRoleRequest: schema(createSecurityRoleRequestSchema),
        SecurityRoleActionRequest: schema(securityRoleActionRequestSchema),
        CreateSecurityAssignmentRequest: schema(createSecurityAssignmentRequestSchema),
        SecurityAssignmentRequestAction: schema(securityAssignmentRequestActionSchema),
        SecurityApprovalAction: schema(securityApprovalActionSchema),
        SecurityAdministrationResult: schema(securityAdministrationResultSchema),
        CreateSecurityAccessReviewCampaign: schema(createSecurityAccessReviewCampaignSchema),
        SecurityAccessReviewCampaignAction: schema(securityAccessReviewCampaignActionSchema),
        SecurityAccessReviewDecision: schema(securityAccessReviewDecisionSchema),
        CreateSecurityDelegation: schema(createSecurityDelegationSchema),
        SecurityDelegationAction: schema(securityDelegationActionSchema),
        CreateSecurityImpersonation: schema(createSecurityImpersonationSchema),
        SecurityImpersonationAction: schema(securityImpersonationActionSchema),
        CreateSecuritySessionPolicy: schema(createSecuritySessionPolicySchema),
        SecuritySessionPolicyAction: schema(securitySessionPolicyActionSchema),
        CreateSecurityUserRequest: schema(createSecurityUserRequestSchema),
        SecurityUserRequestAction: schema(securityUserRequestActionSchema),
        SecurityUserEmergencyAction: schema(securityUserEmergencyActionSchema),
        SecurityUserPage: schema(securityUserPageSchema),
        SecurityUserDetail: schema(securityUserDetailSchema),
        SecurityUserOptions: schema(securityUserOptionsSchema),
        SecurityUserAdministrationResult: schema(securityUserAdministrationResultSchema),
        BankReceiptDirectory: schema(bankReceiptDirectorySchema),
        BankReceiptDetail: schema(bankReceiptDetailSchema),
        BankReceiptOptions: schema(bankReceiptOptionsSchema),
        BankReceiptNominalAccountDirectory: schema(bankReceiptNominalAccountDirectorySchema),
        CreateBankReceiptRequest: schema(createBankReceiptRequestSchema),
        UpdateBankReceiptRequest: schema(updateBankReceiptRequestSchema),
        SubmitBankReceiptRequest: schema(submitBankReceiptRequestSchema),
        DecideBankReceiptRequest: schema(decideBankReceiptRequestSchema),
        PostBankReceiptRequest: schema(postBankReceiptRequestSchema),
        ReverseBankReceiptRequest: schema(reverseBankReceiptRequestSchema),
        BankReceiptMutationResult: schema(bankReceiptMutationResultSchema),
        BankReceiptPostingResult: schema(bankReceiptPostingResultSchema),
        BankReceiptReversalResult: schema(bankReceiptReversalResultSchema),
      },
    },
  } as const;
}
