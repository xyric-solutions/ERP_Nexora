import { z } from "zod";

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
  bankingCompanyDirectorySchema,
  bankingLedgerAccountDirectorySchema,
  changeBankAccountStatusRequestSchema,
  createBankPaymentRequestSchema,
  createBankReceiptRequestSchema,
  createBankAccountRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankReceiptRequestSchema,
  decideBankAccountRequestSchema,
  postBankPaymentRequestSchema,
  postBankReceiptRequestSchema,
  reverseBankPaymentRequestSchema,
  reverseBankReceiptRequestSchema,
  submitBankPaymentRequestSchema,
  submitBankReceiptRequestSchema,
  submitBankAccountRequestSchema,
  updateBankPaymentRequestSchema,
  updateBankReceiptRequestSchema,
  updateBankAccountRequestSchema,
} from "./banking/index.js";
import { healthStatusSchema } from "./health.js";
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
    description: "Requires the exact Finance Nominal permission and corresponding Banking permission for Cash & Bank.",
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

export function buildOpenApiDocument() {
  return {
    openapi: "3.1.0",
    info: { title: "Nexora ERP API", version: "1.0.0" },
    servers: [{ url: "/api/v1" }],
    paths: {
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
            { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            { in: "query", name: "bank_account_id", required: false, schema: { type: "string", minLength: 1, maxLength: 128 } },
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
            { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
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
            { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
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
            { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 100, default: 50 } },
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
