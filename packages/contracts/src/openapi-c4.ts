import {hrLearningQuerySchema,hrLearningActionSchema,hrLearningWorkspaceSchema,hrLearningCertificateSchema} from "./hr/index.js";
import {hrPersonalCorrectionQuerySchema,createHrPersonalCorrectionSchema,hrPersonalCorrectionActionSchema,hrPersonalCorrectionWorkspaceSchema,hrReportGovernanceQuerySchema,hrReportGovernanceActionSchema,hrReportGovernanceWorkspaceSchema,hrReportGovernanceResultSchema} from './hr/index.js';
import {hrSelfLeaveContextQuerySchema,createHrSelfLeaveRequestSchema,hrSelfLeaveActionSchema} from './hr/index.js';
import {hrSelfServiceQuerySchema,hrSelfServiceWorkspaceSchema} from './hr/index.js';
import {hrSettlementBenefitQuerySchema,hrSettlementBenefitActionSchema,hrSettlementBenefitWorkspaceSchema} from './hr/index.js';
import {hrSettlementEntitlementQuerySchema,hrSettlementEntitlementActionSchema,hrSettlementEntitlementWorkspaceSchema} from './hr/index.js';
import {hrPolicyUpgradeQuerySchema,hrPolicyUpgradeActionSchema,hrPolicyUpgradeWorkspaceSchema,hrPolicyUpgradeRecordSchema} from './hr/index.js';
import {hrLifecycleCaseQuerySchema,hrLifecycleCaseActionSchema,hrLifecycleCaseWorkspaceSchema,hrLifecycleCaseTermsSchema,hrLifecycleCaseRecordSchema} from './hr/index.js';
import {hrPerformanceInboxSchema} from './hr/index.js';
import {hrPerformanceParticipationQuerySchema,hrPerformanceParticipationActionSchema,hrPerformanceParticipationSchema} from './hr/index.js';
import {hrPerformanceQuerySchema,hrPerformanceCommandSchema,hrPerformanceWorkspaceSchema,hrPerformanceRecordSchema,hrPerformanceTermsSchema} from './hr/index.js';
import {hrPayslipQuerySchema,hrPayslipReleaseSchema,hrPayslipWorkspaceSchema,hrPayslipDetailSchema,hrPayslipDocumentSchema} from './hr/index.js';
import {hrPayrollPaymentQuerySchema,hrPayrollPaymentActionSchema,hrPayrollPaymentWorkspaceSchema} from './hr/index.js';
import {hrPayrollJournalQuerySchema,hrPayrollJournalActionSchema,hrPayrollJournalWorkspaceSchema} from './hr/index.js';
import {hrLocalizationQuerySchema,createHrLocalizationSchema,hrLocalizationDecisionSchema,hrLocalizationWorkspaceSchema} from './hr/index.js';
import {hrOvertimeMoneyQuerySchema,createHrOvertimeMoneySchema,hrOvertimeMoneyDecisionSchema,hrOvertimeMoneyWorkspaceSchema} from './hr/index.js';
import {hrPayrollRunComparisonQuerySchema,hrPayrollRunComparisonSchema,hrPayrollRunQuerySchema,hrPayrollRunActionSchema,hrPayrollRunWorkspaceSchema} from './hr/index.js';
import {hrPayrollWorkspaceQuerySchema,hrPayrollWorkspaceSchema,hrPayrollOptionsQuerySchema,hrPayrollOptionsSchema,createHrPayrollRecordSchema,hrPayrollRecordActionSchema,hrPayrollMutationResultSchema} from './hr/index.js';
import {hrLeaveQuerySchema,hrLeaveTypeDirectorySchema,createHrLeaveTypeRequestSchema,updateHrLeavePolicyRequestSchema,hrLeaveTypeStatusRequestSchema,hrLeaveBalanceQuerySchema,hrLeaveBalanceDirectorySchema,hrLeaveLedgerQuerySchema,hrLeaveLedgerSchema,hrLeaveBalancePostingRequestSchema,hrLeaveContextQuerySchema,hrLeaveContextSchema,hrLeaveRequestQuerySchema,hrLeaveRequestDirectorySchema,hrLeaveRequestDetailSchema,createHrLeaveRequestSchema,hrLeaveRequestActionRequestSchema} from './hr/index.js';
import {hrOvertimeQuerySchema,hrOvertimeContextQuerySchema,createHrOvertimeRequestSchema,hrOvertimeRuleRequestSchema,hrOvertimeActionRequestSchema,hrAttendancePeriodQuerySchema,hrAttendancePeriodActionRequestSchema,hrOvertimeDirectorySchema,hrOvertimeContextSchema,hrOvertimeDetailSchema,hrAttendanceCompletionResultSchema,hrAttendancePeriodWorkspaceSchema,hrAttendancePayrollInputsSchema} from './hr/index.js';
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
  bankingCompanyDirectorySchema,
  bankingLedgerAccountDirectorySchema,
  changeBankAccountStatusRequestSchema,
  createBankPaymentRequestSchema,
  createBankAccountRequestSchema,
  decideBankPaymentRequestSchema,
  decideBankAccountRequestSchema,
  postBankPaymentRequestSchema,
  reverseBankPaymentRequestSchema,
  submitBankPaymentRequestSchema,
  submitBankAccountRequestSchema,
  updateBankPaymentRequestSchema,
  updateBankAccountRequestSchema,
} from "./banking/index.js";
import { healthStatusSchema } from "./health.js";
import {
  hrEmployeeDetailSchema,
  hrEmployeeDirectorySchema,
  hrCompanyDirectorySchema,
  hrDashboardSummarySchema,
  hrFinancePayrollDashboardSchema,
  hrPositionsOrganizationSchema,
  hrManpowerRequisitionDirectorySchema,
  createHrManpowerRequisitionRequestSchema,
  hrManpowerRequisitionResultSchema,
  submitHrManpowerRequisitionRequestSchema,
  decideHrManpowerRequisitionRequestSchema,
  hrJobOpeningDirectorySchema,
  createHrJobOpeningRequestSchema,
  changeHrJobOpeningStateRequestSchema,
  hrJobOpeningResultSchema,
  hrInterviewPanelDirectorySchema, hrInterviewWorkspaceSchema, hrInterviewActionRequestSchema, hrInterviewActionResultSchema,
  createHrOfferEmployeeRequestSchema, hrOfferEmployeeResultSchema, hrOfferEmployeeWorkspaceSchema,
  createHrShiftRequestSchema, updateHrShiftRequestSchema, changeHrShiftStatusRequestSchema, hrShiftDirectorySchema, hrShiftDetailSchema, hrShiftResultSchema, hrShiftContextSchema,
  hrCorrectionContextSchema,hrCorrectionDirectorySchema,hrCorrectionDetailSchema,hrCorrectionResultSchema,createHrCorrectionRequestSchema,updateHrCorrectionRequestSchema,hrCorrectionActionRequestSchema,
  hrMonthlyAttendanceDirectorySchema,
  hrDailyAttendanceDirectorySchema,
  hrShiftAllocationContextSchema, hrShiftAllocationDirectorySchema, hrShiftAllocationDetailSchema, hrShiftAllocationResultSchema, createHrShiftAllocationRequestSchema, closeHrShiftAllocationRequestSchema, hrShiftResolutionSchema,
  hrOfferContextSchema, hrOfferDirectorySchema, hrOfferDetailSchema, createHrOfferRequestSchema, updateHrOfferRequestSchema, hrOfferActionRequestSchema, hrOfferResultSchema,
  hrApplicationDirectorySchema, createHrApplicationRequestSchema, changeHrApplicationStageRequestSchema, hrApplicationResultSchema,
  hrCandidateDirectorySchema,
  createHrCandidateRequestSchema,
  changeHrCandidateStatusRequestSchema,
  hrCandidateResultSchema,
  hrOrganizationUnitDirectorySchema,
  createHrOrganizationUnitRequestSchema,
  updateHrOrganizationUnitRequestSchema,
  changeHrOrganizationUnitStatusRequestSchema,
  hrOrganizationUnitMutationResultSchema,
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
  createHrMasterRequestSchema,
  updateHrMasterRequestSchema,
  changeHrMasterStatusRequestSchema,
  hrMasterMutationResultSchema,
  hrJobGradeDirectorySchema,
  createHrJobGradeRequestSchema,
  updateHrJobGradeRequestSchema,
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
      "/hr/dashboard": {
        get: {
          operationId: "getHrDashboard",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }],
          responses: { "200": { description: "Company-scoped live HR operational summary", content: { "application/json": { schema: { $ref: "#/components/schemas/HrDashboardSummary" } } } }, ...securityErrors },
        },
      },
      "/hr/finance_payroll_dashboard": {
        get: {
          operationId: "getHrFinancePayrollDashboard",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }],
          responses: { "200": { description: "Company-scoped live Finance and Payroll control summary", content: { "application/json": { schema: { $ref: "#/components/schemas/HrFinancePayrollDashboard" } } } }, ...securityErrors },
        },
      },
      "/hr/positions_organization": {
        get: {
          operationId: "getHrPositionsOrganization",
          security: [{ cookieAuth: [] }],
          parameters: [
            { in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } },
            { in: "query", name: "search", required: false, schema: { type: "string", maxLength: 160 } },
            { in: "query", name: "limit", required: false, schema: { type: "integer", minimum: 1, maximum: 250, default: 100 } },
          ],
          responses: { "200": { description: "Current company workforce positions and organization summary", content: { "application/json": { schema: { $ref: "#/components/schemas/HrPositionsOrganization" } } } }, ...securityErrors },
        },
      },
      "/hr/manpower_requisitions": {
        get: { operationId: "listHrManpowerRequisitions", security: [{ cookieAuth: [] }], parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, { in: "query", name: "search", schema: { type: "string", maxLength: 160 } }, { in: "query", name: "state", schema: { type: "string" } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Company-scoped manpower requisitions", content: { "application/json": { schema: { $ref: "#/components/schemas/HrManpowerRequisitionDirectory" } } } }, ...securityErrors } },
        post: { operationId: "createHrManpowerRequisition", security: [{ cookieAuth: [] }], parameters: [csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrManpowerRequisitionRequest" } } } }, responses: { "201": { description: "Manpower requisition created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrManpowerRequisitionResult" } } } }, "200": { description: "Idempotent replay", content: { "application/json": { schema: { $ref: "#/components/schemas/HrManpowerRequisitionResult" } } } }, ...securityErrors } },
      },
      "/hr/manpower_requisitions/{requisitionId}/submit": {
        post: { operationId: "submitHrManpowerRequisition", security: [{ cookieAuth: [] }], parameters: [{ in: "path", name: "requisitionId", required: true, schema: { type: "string" } }, csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/SubmitHrManpowerRequisitionRequest" } } } }, responses: { "200": { description: "Manpower requisition submitted", content: { "application/json": { schema: { $ref: "#/components/schemas/HrManpowerRequisitionResult" } } } }, ...securityErrors } },
      },
      "/hr/manpower_requisitions/{requisitionId}/decision": {
        post: { operationId: "decideHrManpowerRequisition", security: [{ cookieAuth: [] }], parameters: [{ in: "path", name: "requisitionId", required: true, schema: { type: "string" } }, csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/DecideHrManpowerRequisitionRequest" } } } }, responses: { "200": { description: "Manpower requisition decision recorded", content: { "application/json": { schema: { $ref: "#/components/schemas/HrManpowerRequisitionResult" } } } }, ...securityErrors } },
      },
      "/hr/job_openings": {
        get: { operationId: "listHrJobOpenings", security: [{ cookieAuth: [] }], parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, { in: "query", name: "search", schema: { type: "string", maxLength: 160 } }, { in: "query", name: "state", schema: { type: "string" } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Company-scoped job openings", content: { "application/json": { schema: { $ref: "#/components/schemas/HrJobOpeningDirectory" } } } }, ...securityErrors } },
        post: { operationId: "createHrJobOpening", security: [{ cookieAuth: [] }], parameters: [csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrJobOpeningRequest" } } } }, responses: { "201": { description: "Job opening created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrJobOpeningResult" } } } }, ...securityErrors } },
      },
      "/hr/job_openings/{openingId}/state": {
        post: { operationId: "changeHrJobOpeningState", security: [{ cookieAuth: [] }], parameters: [{ in: "path", name: "openingId", required: true, schema: { type: "string" } }, csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChangeHrJobOpeningStateRequest" } } } }, responses: { "200": { description: "Job opening state changed", content: { "application/json": { schema: { $ref: "#/components/schemas/HrJobOpeningResult" } } } }, ...securityErrors } },
      },
      "/hr/recruitment_interview_panel":{get:{operationId:"listHrInterviewPanel",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":160}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":100}}],responses:{"200":{"description":"HrInterviewPanelDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrInterviewPanelDirectory"}}}},...securityErrors}}},
      "/hr/recruitment_interviews":{get:{operationId:"getHrInterviewWorkspace",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"application_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],responses:{"200":{"description":"HrInterviewWorkspace","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrInterviewWorkspace"}}}},...securityErrors}}},
      "/hr/recruitment_interviews/actions":{post:{operationId:"performHrInterviewAction",security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/HrInterviewActionRequest"}}}},responses:{"200":{"description":"HrInterviewActionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrInterviewActionResult"}}}},...securityErrors}}},
      "/hr/recruitment_offers/{offerId}/employee":{get:{operationId:"getHrOfferEmployeeWorkspace",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"offerId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],responses:{"200":{description:"Accepted offer employee handoff",content:{"application/json":{schema:{$ref:"#/components/schemas/HrOfferEmployeeWorkspace"}}}},...securityErrors}},post:{operationId:"createHrOfferEmployee",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"offerId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CreateHrOfferEmployeeRequest"}}}},responses:{"200":{description:"Replayed handoff",content:{"application/json":{schema:{$ref:"#/components/schemas/HrOfferEmployeeResult"}}}},"201":{description:"Employee draft created",content:{"application/json":{schema:{$ref:"#/components/schemas/HrOfferEmployeeResult"}}}},...securityErrors}}},
      "/hr/attendance_correction_context":{"get":{"operationId":"getHrCorrectionContext","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"on_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"employee_id","required":false,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":160}}],"responses":{...securityErrors,"200":{"description":"HrCorrectionContext","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionContext"}}}}}}},
      "/hr/attendance_corrections":{"get":{"operationId":"listHrCorrections","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":160}},{"in":"query","name":"status","required":false,"schema":{"type":"string","enum":["draft","pending_manager","pending_hr","approved","rejected","cancelled"]}},{"in":"query","name":"limit","required":false,"schema":{"type":"integer","minimum":1,"maximum":100}},{"in":"query","name":"offset","required":false,"schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrCorrectionDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionDirectory"}}}}}},"post":{"parameters":[csrfParameter,idempotencyParameter],"operationId":"createHrCorrection","security":[{"cookieAuth":[]}],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/CreateHrCorrectionRequest"}}}},"responses":{...securityErrors,"200":{"description":"HrCorrectionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionResult"}}}},"201":{"description":"HrCorrectionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionResult"}}}}}}},
      "/hr/attendance_corrections/{correctionId}":{"get":{"operationId":"getHrCorrection","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"correctionId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],"responses":{...securityErrors,"200":{"description":"HrCorrectionDetail","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionDetail"}}}}}}},
      "/hr/attendance_corrections/{correctionId}/draft":{"post":{"operationId":"updateHrCorrection","security":[{"cookieAuth":[]}],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/UpdateHrCorrectionRequest"}}}},"responses":{...securityErrors,"200":{"description":"HrCorrectionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionResult"}}}}},"parameters":[csrfParameter,idempotencyParameter,{"in":"path","name":"correctionId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}]}},
      "/hr/attendance_corrections/{correctionId}/actions":{"post":{"operationId":"actOnHrCorrection","security":[{"cookieAuth":[]}],"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionActionRequest"}}}},"responses":{...securityErrors,"200":{"description":"HrCorrectionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrCorrectionResult"}}}}},"parameters":[csrfParameter,idempotencyParameter,{"in":"path","name":"correctionId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}]}},
      "/hr/monthly_attendance":{get:{operationId:"listHrMonthlyAttendance",security:[{cookieAuth:[]}],parameters:[{in:"query",name:"company_id",required:true,schema:{type:"string",minLength:1,maxLength:128}},{in:"query",name:"month",required:true,schema:{type:"string",format:"date",description:"First day of month, 1900–2199"}},{in:"query",name:"search",schema:{type:"string",maxLength:160}},{in:"query",name:"limit",schema:{type:"integer",minimum:1,maximum:50,default:25}},{in:"query",name:"offset",schema:{type:"integer",minimum:0,maximum:100000,default:0}}],responses:{"200":{description:"Operational monthly attendance with separately authorized finalized summaries",content:{"application/json":{schema:{$ref:"#/components/schemas/HrMonthlyAttendanceDirectory"}}}},...securityErrors}}},
      "/hr/daily_attendance":{get:{operationId:"listHrDailyAttendance",security:[{cookieAuth:[]}],parameters:[{in:"query",name:"company_id",required:true,schema:{type:"string",minLength:1,maxLength:128}},{in:"query",name:"on_date",required:true,schema:{type:"string",format:"date"}},{in:"query",name:"search",schema:{type:"string",maxLength:160}},{in:"query",name:"limit",schema:{type:"integer",minimum:1,maximum:100,default:50}},{in:"query",name:"offset",schema:{type:"integer",minimum:0,maximum:100000,default:0}}],responses:{"200":{description:"Operational daily attendance; read-only, bounded and company-scoped",content:{"application/json":{schema:{$ref:"#/components/schemas/HrDailyAttendanceDirectory"}}}},...securityErrors}}},
      "/hr/shift_assignment_context":{get:{operationId:"getHrShiftAllocationContext",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"scope","required":true,"schema":{"type":"string","enum":["employee","department","branch"]}},{"in":"query","name":"on_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":160}}],responses:{"200":{description:"HrShiftAllocationContext",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationContext"}}}},...securityErrors}}},
      "/hr/shift_assignments":{get:{operationId:"listHrShiftAllocations",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":160}},{"in":"query","name":"scope","required":false,"schema":{"type":"string","enum":["employee","department","branch"]}},{"in":"query","name":"scope_id","required":false,"schema":{"type":"string"}},{"in":"query","name":"on_date","required":false,"schema":{"type":"string","format":"date"}},{"in":"query","name":"state","required":false,"schema":{"type":"string","enum":["active","scheduled","ended","cancelled"]}},{"in":"query","name":"limit","required":false,"schema":{"type":"integer","minimum":1,"maximum":100}},{"in":"query","name":"offset","required":false,"schema":{"type":"integer","minimum":0,"maximum":100000}}],responses:{"200":{description:"HrShiftAllocationDirectory",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationDirectory"}}}},...securityErrors}},post:{operationId:"createHrShiftAllocation",security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CreateHrShiftAllocationRequest"}}}},responses:{"200":{description:"Shift allocation",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationResult"}}}},"201":{description:"Shift allocated",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationResult"}}}},...securityErrors}}},
      "/hr/shift_assignments/{assignmentId}":{get:{operationId:"getHrShiftAllocation",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"assignmentId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],responses:{"200":{description:"HrShiftAllocationDetail",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationDetail"}}}},...securityErrors}}},
      "/hr/shift_assignments/{assignmentId}/close":{post:{operationId:"closeHrShiftAllocation",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"assignmentId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CloseHrShiftAllocationRequest"}}}},responses:{"200":{description:"Shift allocation",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftAllocationResult"}}}},...securityErrors}}},
"/hr/attendance_overtime":{"get":{"operationId":"attendanceListOvertime","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"month","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}},{"in":"query","name":"search","schema":{"type":"string","maxLength":100}}],"responses":{...securityErrors,"200":{"description":"HrOvertimeDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOvertimeDirectory"}}}}}},"post":{"operationId":"attendanceCreateOvertime","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/CreateHrOvertimeRequest"}}}}}},"/hr/attendance_overtime_context":{"get":{"operationId":"attendanceOvertimeContext","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"on_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"employee_id","schema":{"type":"string","maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":100}}],"responses":{...securityErrors,"200":{"description":"HrOvertimeContext","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOvertimeContext"}}}}}}},"/hr/attendance_overtime/{recordId}":{"get":{"operationId":"attendanceGetOvertime","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],"responses":{...securityErrors,"200":{"description":"HrOvertimeDetail","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOvertimeDetail"}}}}}}},"/hr/attendance_overtime_rules":{"post":{"operationId":"attendanceCreateOvertimeRule","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOvertimeRuleRequest"}}}}}},"/hr/attendance_overtime/{recordId}/actions":{"post":{"operationId":"attendanceActOnOvertime","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOvertimeActionRequest"}}}}}},"/hr/attendance_periods":{"get":{"operationId":"attendancePeriodWorkspace","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"month","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrAttendancePeriodWorkspace","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendancePeriodWorkspace"}}}}}}},"/hr/attendance_payroll_inputs":{"get":{"operationId":"attendancePayrollInputs","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"month","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrAttendancePayrollInputs","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendancePayrollInputs"}}}}}}},"/hr/attendance_periods/actions":{"post":{"operationId":"attendanceActOnPeriod","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendancePeriodActionRequest"}}}}}},
"/hr/leave_types":{"get":{"operationId":"timeLeaveListLeaveTypes","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"as_of","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrLeaveTypeDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveTypeDirectory"}}}}}},"post":{"operationId":"timeLeaveCreateLeaveType","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/CreateHrLeaveTypeRequest"}}}}}},"/hr/leave_types/{recordId}/policies":{"post":{"operationId":"timeLeaveUpdateLeavePolicy","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/UpdateHrLeavePolicyRequest"}}}}}},"/hr/leave_types/{recordId}/status":{"post":{"operationId":"timeLeaveChangeLeaveTypeStatus","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveTypeStatusRequest"}}}}}},"/hr/leave_balances":{"get":{"operationId":"timeLeaveListLeaveBalances","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"as_of","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"employee_id","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"leave_type_id","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrLeaveBalanceDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveBalanceDirectory"}}}}}}},"/hr/leave_ledger":{"get":{"operationId":"timeLeaveLeaveLedger","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"as_of","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"employee_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"leave_type_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":100}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrLeaveLedger","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveLedger"}}}}}}},"/hr/leave_balances/postings":{"post":{"operationId":"timeLeavePostLeaveBalance","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveBalancePostingRequest"}}}}}},"/hr/leave_context":{"get":{"operationId":"timeLeaveLeaveContext","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"from_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"to_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"employee_id","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"leave_type_id","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"request_id","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"document_id","required":false,"schema":{"type":"string","maxLength":128}}],"responses":{...securityErrors,"200":{"description":"HrLeaveContext","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveContext"}}}}}}},"/hr/leave_requests":{"get":{"operationId":"timeLeaveListLeaveRequests","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"as_of","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"search","required":false,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}},{"in":"query","name":"queue_only","schema":{"type":"string","enum":["true","false"]}},{"in":"query","name":"status","schema":{"type":"string","enum":["draft","pending_manager","pending_hr","approved","rejected","cancelled"]}}],"responses":{...securityErrors,"200":{"description":"HrLeaveRequestDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveRequestDirectory"}}}}}},"post":{"operationId":"timeLeaveCreateLeaveRequest","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/CreateHrLeaveRequest"}}}}}},"/hr/leave_requests/{recordId}":{"get":{"operationId":"timeLeaveGetLeaveRequest","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],"responses":{...securityErrors,"200":{"description":"HrLeaveRequestDetail","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveRequestDetail"}}}}}}},"/hr/leave_requests/{recordId}/actions":{"post":{"operationId":"timeLeaveActOnLeaveRequest","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrAttendanceCompletionResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrAttendanceCompletionResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveRequestActionRequest"}}}}}},
"/hr/payroll_workspace":{"get":{"operationId":"getPayrollWorkspace","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":120}},{"in":"query","name":"section","required":true,"schema":{"type":"string","enum":["components","structures","salaries","adjustments","loans","runs","review","journals","payments","payslips"]}},{"in":"query","name":"month","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],"responses":{...securityErrors,"200":{"description":"HrPayrollWorkspace","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollWorkspace"}}}}}}},"/hr/payroll_options":{"get":{"operationId":"getPayrollOptions","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":120}},{"in":"query","name":"on_date","required":true,"schema":{"type":"string","format":"date"}}],"responses":{...securityErrors,"200":{"description":"HrPayrollOptions","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollOptions"}}}}}}},"/hr/payroll_records":{"post":{"operationId":"createPayrollRecord","security":[{"cookieAuth":[]}],"parameters":[csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrPayrollMutationResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/CreateHrPayrollRecord"}}}}}},"/hr/payroll_records/{recordId}/actions":{"post":{"operationId":"actOnPayrollRecord","security":[{"cookieAuth":[]}],"parameters":[{"in":"path","name":"recordId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],"responses":{...securityErrors,"200":{"description":"HrPayrollMutationResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}},"requestBody":{"required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollRecordAction"}}}}}},
      '/hr/payroll_localization':{get:{operationId:'getPayrollLocalization',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'kind',required:true,schema:{type:'string',enum:['legal_profile','payroll_configuration','work_location','activation','declaration','parameter','pack_release']}},{in:'query',name:'on_date',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'country_code',schema:{type:'string',pattern:'^[A-Z]{2}$'}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Governed statutory setup workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrLocalizationWorkspace'}}}}}},post:{operationId:'createPayrollLocalization',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CreateHrLocalization'}}}},responses:{...securityErrors,...{"200":{"description":"Governed statutory setup result","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}}}}},
      '/hr/payroll_localization/{id}/actions':{post:{operationId:'decidePayrollLocalization',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter,{in:'path',name:'id',required:true,schema:{type:'string',minLength:1,maxLength:128}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrLocalizationDecision'}}}},responses:{...securityErrors,...{"200":{"description":"Governed statutory setup result","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}}}}},
      '/hr/payroll_overtime':{get:{operationId:'getOvertimeMoneyWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'section',required:true,schema:{type:'string',enum:['policies','arrangements']}},{in:'query',name:'on_date',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Monetary overtime workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrOvertimeMoneyWorkspace'}}}}}},post:{operationId:'createOvertimeMoney',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CreateHrOvertimeMoney'}}}},responses:{...securityErrors,...{"200":{"description":"Governed monetary overtime result","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}}}}},
      '/hr/payroll_overtime/{id}/actions':{post:{operationId:'decideOvertimeMoney',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter,{in:'path',name:'id',required:true,schema:{type:'string',minLength:1,maxLength:128}}],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrOvertimeMoneyDecision'}}}},responses:{...securityErrors,...{"200":{"description":"Governed monetary overtime result","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrPayrollMutationResult"}}}}}}}},
      '/hr/payroll_payments':{get:{operationId:'getPayrollPaymentWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'query',name:'month',required:true,schema:{type:'string',format:'date'}}],responses:{...securityErrors,'200':{description:'Payroll salary payment workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollPaymentWorkspace'}}}}}}},
      '/hr/payroll_payments/actions':{post:{operationId:'actOnPayrollPayment',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollPaymentAction'}}}},responses:{...securityErrors,'200':{description:'Governed salary payment action',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
"/hr/self_service/leave_context":{"get":{"operationId":"getSelfLeaveContext","description":"Owned employee calendar, policy, manager route and exact balance","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"from_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"to_date","required":true,"schema":{"type":"string","format":"date"}},{"in":"query","name":"leave_type_id","schema":{"type":"string","maxLength":128}}],"responses":{...securityErrors,"200":{"description":"Owned employee calendar, policy, manager route and exact balance","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveContext"}}}}}}},"/hr/self_service/leave_requests/{id}":{"get":{"operationId":"getSelfLeaveRequest","description":"Owned leave request, allowed personal actions and history","security":[{"cookieAuth":[]}],"parameters":[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"path","name":"id","required":true,"schema":{"type":"string","maxLength":128}}],"responses":{...securityErrors,"200":{"description":"Owned leave request, allowed personal actions and history","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrLeaveRequestDetail"}}}}}}},"/hr/self_service/leave_requests":{post:{operationId:'createSelfLeaveRequest',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CreateHrSelfLeaveRequest'}}}},responses:{...securityErrors,'200':{description:'Audited personal leave workflow',content:{'application/json':{schema:{$ref:'#/components/schemas/HrAttendanceCompletionResult'}}}}}}},"/hr/self_service/leave_requests/{id}/actions":{post:{operationId:'actOnSelfLeaveRequest',security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"id","required":true,"schema":{"type":"string","maxLength":128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrSelfLeaveAction'}}}},responses:{...securityErrors,'200':{description:'Audited personal leave workflow',content:{'application/json':{schema:{$ref:'#/components/schemas/HrAttendanceCompletionResult'}}}}}}},
"/hr/learning":{get:{operationId:'getLearning',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'section',required:true,schema:{type:'string',enum:['programmes','requests','sessions','completions']}},{in:'query',name:'mode',schema:{type:'string',enum:['hr','mine']}},{in:'query',name:'record_id',schema:{type:'string'}},{in:'query',name:'search',schema:{type:'string',maxLength:100}},{in:'query',name:'state',schema:{type:'string',maxLength:30}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Authorized company Learning workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrLearningWorkspace'}}}}}}},
 "/hr/learning/actions":{post:{operationId:'actOnLearning',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrLearningAction'}}}},responses:{...securityErrors,'200':{description:'Audited Learning action',content:{'application/json':{schema:{$ref:'#/components/schemas/HrAttendanceCompletionResult'}}}}}}},
 "/hr/learning/certificates/{id}":{get:{operationId:'getLearningCertificate',security:[{cookieAuth:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',maxLength:128}},{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}}],responses:{...securityErrors,'200':{description:'Authorized issued internal training certificate',content:{'application/json':{schema:{$ref:'#/components/schemas/HrLearningCertificate'}}}}}}},
 "/hr/personal_corrections":{get:{operationId:'getPersonalCorrections',security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"mode","required":false,"schema":{"type":"string","enum":["mine","review"]}},{"in":"query","name":"state","required":false,"schema":{"type":"string","enum":["all","submitted","approved","rejected","cancelled"]}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],responses:{...securityErrors,'200':{description:'Governed company workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPersonalCorrectionWorkspace'}}}}}},post:{operationId:'createPersonalCorrection',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/CreateHrPersonalCorrection'}}}},responses:{...securityErrors,'200':{description:'Audited own personal correction',content:{'application/json':{schema:{$ref:'#/components/schemas/HrAttendanceCompletionResult'}}}}}}},"/hr/report_governance":{get:{operationId:'getReportGovernance',security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","maxLength":128}},{"in":"query","name":"section","required":true,"schema":{"type":"string","enum":["policies","exports","audit"]}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":50}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],responses:{...securityErrors,'200':{description:'Governed company workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrReportGovernanceWorkspace'}}}}}}},"/hr/personal_corrections/{id}/actions":{post:{operationId:'actOnPersonalCorrection',security:[{cookieAuth:[]}],parameters:[{in:'path',name:'id',required:true,schema:{type:'string',maxLength:128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPersonalCorrectionAction'}}}},responses:{...securityErrors,'200':{description:'Audited governed action',content:{'application/json':{schema:{$ref:'#/components/schemas/HrAttendanceCompletionResult'}}}}}}},"/hr/report_governance/actions":{post:{operationId:'actOnReportGovernance',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrReportGovernanceAction'}}}},responses:{...securityErrors,'200':{description:'Audited governed action',content:{'application/json':{schema:{$ref:'#/components/schemas/HrReportGovernanceResult'}}}}}}},
      '/hr/self_service':{get:{operationId:'getSelfService',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',schema:{type:'string',maxLength:128}},{in:'query',name:'month',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Active employee-owned profile, leave, loans and published payslip summaries',content:{'application/json':{schema:{$ref:'#/components/schemas/HrSelfServiceWorkspace'}}}}}}},
      '/hr/self_service/payslips/{id}':{get:{operationId:'getSelfServicePayslip',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'path',name:'id',required:true,schema:{type:'string',maxLength:128}}],responses:{...securityErrors,'200':{description:'Employee-owned frozen published payslip; unpublished results are unavailable',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayslipDetail'}}}}}}},
      '/hr/payslips':{get:{operationId:'getPayslipWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'query',name:'month',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'state',schema:{type:'string',enum:['all','pending','released']}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Governed payslip publication workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayslipWorkspace'}}}}}}},
      '/hr/payslips/{id}':{get:{operationId:'getPayslipDetail',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'path',name:'id',required:true,schema:{type:'string',maxLength:128}}],responses:{...securityErrors,'200':{description:'Exact payslip preview or frozen publication',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayslipDetail'}}}}}}},
      '/hr/payslips/releases':{post:{operationId:'releasePayslips',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayslipRelease'}}}},responses:{...securityErrors,'200':{description:'Independently released payslips',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/policy_upgrades':{get:{operationId:'getPolicyUpgrades',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Current company-scoped employment policy upgrades and retained authority evidence',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPolicyUpgradeWorkspace'}}}}}}},
      '/hr/policy_upgrades/actions':{post:{operationId:'actOnPolicyUpgrade',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPolicyUpgradeAction'}}}},responses:{...securityErrors,'200':{description:'Audited independent policy upgrade result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/settlement_entitlements':{get:{operationId:'getSettlementEntitlements',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'country_code',schema:{type:'string',pattern:'^[A-Z]{2}$'}},{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'exit_case_id',schema:{type:'string'}},{in:'query',name:'rule_id',schema:{type:'string'}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Reviewed company and country rules with retained applicability evidence',content:{'application/json':{schema:{$ref:'#/components/schemas/HrSettlementEntitlementWorkspace'}}}}}}},
      '/hr/settlement_entitlements/actions':{post:{operationId:'actOnSettlementEntitlement',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrSettlementEntitlementAction'}}}},responses:{...securityErrors,'200':{description:'Audited encashment policy or draft statement result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/settlement_benefits':{get:{operationId:'getSettlementBenefits',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'country_code',schema:{type:'string',pattern:'^[A-Z]{2}$'}},{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'exit_case_id',schema:{type:'string'}},{in:'query',name:'rule_id',schema:{type:'string'}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Reviewed company and country rules with retained applicability evidence',content:{'application/json':{schema:{$ref:'#/components/schemas/HrSettlementBenefitWorkspace'}}}}}}},
      '/hr/settlement_benefits/actions':{post:{operationId:'actOnSettlementBenefit',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrSettlementBenefitAction'}}}},responses:{...securityErrors,'200':{description:'Audited company benefit policy or draft statement result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/lifecycle_cases':{get:{operationId:'getLifecycleCaseWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'section',required:true,schema:{type:'string',enum:['onboarding','probation','resignation','termination','clearance','settlement','offboarding']}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Company employment lifecycle cases and review evidence',content:{'application/json':{schema:{$ref:'#/components/schemas/HrLifecycleCaseWorkspace'}}}}}}},
      '/hr/lifecycle_cases/actions':{post:{operationId:'actOnLifecycleCase',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrLifecycleCaseAction'}}}},responses:{...securityErrors,'200':{description:'Audited lifecycle action result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/performance/inbox':{get:{operationId:'getPerformanceInbox',security:[{cookieAuth:[]}],responses:{...securityErrors,'200':{description:'Employee-owned company and cycle invitations',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPerformanceInbox'}}}}}}},
      '/hr/performance/participation':{get:{operationId:'getPerformanceParticipation',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string'}},{in:'query',name:'cycle_id',required:true,schema:{type:'string'}},{in:'query',name:'mode',schema:{type:'string',enum:['mine','staff'],default:'mine'}}],responses:{...securityErrors,'200':{description:'Employee-owned or authorized staff Performance contributions',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPerformanceParticipation'}}}}}}},
      '/hr/performance/participation/actions':{post:{operationId:'actOnPerformanceParticipation',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPerformanceParticipationAction'}}}},responses:{...securityErrors,'200':{description:'Audited contribution result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/performance':{get:{operationId:'getPerformanceWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'query',name:'section',required:true,schema:{type:'string',enum:['cycles','goals','reviews','outcomes']}},{in:'query',name:'cycle_id',schema:{type:'string',maxLength:128}},{in:'query',name:'search',schema:{type:'string',maxLength:120}},{in:'query',name:'employee_search',schema:{type:'string',maxLength:120}},{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}],responses:{...securityErrors,'200':{description:'Connected company Performance workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPerformanceWorkspace'}}}}}}},
      '/hr/performance/actions':{post:{operationId:'actOnPerformance',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPerformanceCommand'}}}},responses:{...securityErrors,'200':{description:'Audited Performance lifecycle result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/payroll_journal':{get:{operationId:'getPayrollJournalWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'company_id',required:true,schema:{type:'string',maxLength:128}},{in:'query',name:'month',required:true,schema:{type:'string',format:'date'}},{in:'query',name:'posting_date',schema:{type:'string',format:'date'}}],responses:{...securityErrors,'200':{description:'Payroll accrual workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollJournalWorkspace'}}}}}}},
      '/hr/payroll_journal/actions':{post:{operationId:'actOnPayrollJournal',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollJournalAction'}}}},responses:{...securityErrors,'200':{description:'Governed accrual action',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      '/hr/payroll_runs/comparison':{get:{operationId:'getPayrollRunComparison',security:[{cookieAuth:[]}],parameters:[
        {in:'query',name:'company_id',required:true,schema:{type:'string',minLength:1,maxLength:128}},
        {in:'query',name:'month',required:true,schema:{type:'string',format:'date'}},
        {in:'query',name:'expected_run_number',required:true,schema:{type:'integer',minimum:1,maximum:2147483647}},
        {in:'query',name:'baseline_run_number',schema:{type:'integer',minimum:1,maximum:2147483647}},
        {in:'query',name:'filter',schema:{type:'string',enum:['changed','all','amount_changed','evidence_changed','added','removed','unchanged'],default:'changed'}},
        {in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},
        {in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}}
      ],responses:{...securityErrors,'200':{description:'Original immutable Payroll run comparison; no payment confirmation',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollRunComparison'}}}}}}},
      '/hr/payroll_runs':{get:{operationId:'getPayrollRunWorkspace',security:[{cookieAuth:[]}],parameters:[{in:'query',name:'limit',schema:{type:'integer',minimum:1,maximum:50}},{in:'query',name:'offset',schema:{type:'integer',minimum:0,maximum:100000}},{in:'query',name:'company_id',required:true,schema:{type:'string',minLength:1,maxLength:128}},{in:'query',name:'month',required:true,schema:{type:'string',format:'date'}}],responses:{...securityErrors,'200':{description:'Payroll run workspace',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollRunWorkspace'}}}}}}},
      '/hr/payroll_runs/actions':{post:{operationId:'actOnPayrollRun',security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollRunAction'}}}},responses:{...securityErrors,'200':{description:'Payroll mutation result',content:{'application/json':{schema:{$ref:'#/components/schemas/HrPayrollMutationResult'}}}}}}},
      "/hr/shift_resolution":{get:{operationId:"resolveHrEmployeeShift",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"employee_id","required":true,"schema":{"type":"string"}},{"in":"query","name":"on_date","required":true,"schema":{"type":"string","format":"date"}}],responses:{"200":{description:"HrShiftResolution",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftResolution"}}}},...securityErrors}}},
      "/hr/shift_context":{get:{operationId:"getHrShiftContext",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":160}}],responses:{"200":{description:"HrShiftContext",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftContext"}}}},...securityErrors}}},
      "/hr/shifts":{get:{operationId:"listHrShifts",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":160}},{"in":"query","name":"status","schema":{"type":"string","enum":["active","inactive"]}},{"in":"query","name":"leaf_only","schema":{"type":"boolean"}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":100}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}}],responses:{"200":{description:"HrShiftDirectory",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftDirectory"}}}},...securityErrors}},post:{operationId:"createHrShift",security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CreateHrShiftRequest"}}}},responses:{"200":{description:"Shift result",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftResult"}}}},"201":{description:"Shift created",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftResult"}}}},...securityErrors}}},
      "/hr/shifts/{shiftId}":{get:{operationId:"getHrShift",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"shiftId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"on_date","schema":{"type":"string","format":"date"}}],responses:{"200":{description:"HrShiftDetail",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftDetail"}}}},...securityErrors}}},
      "/hr/shifts/{shiftId}/rules":{post:{operationId:"updateHrShift",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"shiftId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/UpdateHrShiftRequest"}}}},responses:{"200":{description:"Shift result",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftResult"}}}},...securityErrors}}},
      "/hr/shifts/{shiftId}/status":{post:{operationId:"changeHrShiftStatus",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"shiftId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/ChangeHrShiftStatusRequest"}}}},responses:{"200":{description:"Shift result",content:{"application/json":{schema:{$ref:"#/components/schemas/HrShiftResult"}}}},...securityErrors}}},
      "/hr/recruitment_offer_context":{get:{operationId:"getHrOfferContext",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"application_id","required":true,"schema":{"type":"string"}}],responses:{"200":{"description":"HrOfferContext","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferContext"}}}},...securityErrors}}},
      "/hr/recruitment_offers":{get:{operationId:"listHrOffers",security:[{cookieAuth:[]}],parameters:[{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"search","schema":{"type":"string","maxLength":160}},{"in":"query","name":"state","schema":{"type":"string","enum":["draft","submitted","approved","generated","sent","accepted","declined","rejected","expired","withdrawn"]}},{"in":"query","name":"offset","schema":{"type":"integer","minimum":0,"maximum":100000}},{"in":"query","name":"limit","schema":{"type":"integer","minimum":1,"maximum":100}}],responses:{"200":{"description":"HrOfferDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferDirectory"}}}},...securityErrors}},post:{operationId:"createHrOffer",security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CreateHrOfferRequest"}}}},responses:{"200":{"description":"HrOfferResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferResult"}}}},"201":{"description":"HrOfferResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferResult"}}}},...securityErrors}}},
      "/hr/recruitment_offers/{offerId}":{get:{operationId:"getHrOffer",security:[{cookieAuth:[]}],parameters:[{"in":"path","name":"offerId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}},{"in":"query","name":"company_id","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],responses:{"200":{"description":"HrOfferDetail","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferDetail"}}}},...securityErrors}}},
      "/hr/recruitment_offers/{offerId}/terms":{post:{operationId:"updateHrOffer",security:[{cookieAuth:[]}],parameters:[...[{"in":"path","name":"offerId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/UpdateHrOfferRequest"}}}},responses:{"200":{"description":"HrOfferResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferResult"}}}},...securityErrors}}},
      "/hr/recruitment_offers/{offerId}/actions":{post:{operationId:"performHrOfferAction",security:[{cookieAuth:[]}],parameters:[...[{"in":"path","name":"offerId","required":true,"schema":{"type":"string","minLength":1,"maxLength":128}}],csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/HrOfferActionRequest"}}}},responses:{"200":{"description":"HrOfferResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrOfferResult"}}}},...securityErrors}}},
      "/hr/applications": {
        get: { operationId: "listHrApplications", security: [{cookieAuth:[]}], parameters: [{in:"query",name:"company_id",required:true,schema:{type:"string"}}, {in:"query",name:"search",schema:{type:"string",maxLength:160}}, {in:"query",name:"stage",schema:{type:"string",enum:["application","screening","shortlisted","interview","evaluation","selected","hired","rejected","withdrawn"]}}, {in:"query",name:"limit",schema:{type:"integer",minimum:1,maximum:100}}, {in:"query",name:"offset",schema:{type:"integer",minimum:0,maximum:100000}}], responses:{"200":{"description":"HrApplicationDirectory","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrApplicationDirectory"}}}},...securityErrors} },
        post: { operationId:"createHrApplication",security:[{cookieAuth:[]}],parameters:[csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/CreateHrApplicationRequest"}}}},responses:{"201":{"description":"HrApplicationResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrApplicationResult"}}}},"200":{"description":"HrApplicationResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrApplicationResult"}}}},...securityErrors} },
      },
      "/hr/applications/{applicationId}/stage": {
        post: { operationId:"changeHrApplicationStage",security:[{cookieAuth:[]}],parameters:[{in:"path",name:"applicationId",required:true,schema:{type:"string"}},csrfParameter,idempotencyParameter],requestBody:{required:true,content:{"application/json":{schema:{$ref:"#/components/schemas/ChangeHrApplicationStageRequest"}}}},responses:{"200":{"description":"HrApplicationResult","content":{"application/json":{"schema":{"$ref":"#/components/schemas/HrApplicationResult"}}}},...securityErrors} },
      },
      "/hr/candidates": {
        get: { operationId: "listHrCandidates", security: [{ cookieAuth: [] }], parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, { in: "query", name: "search", schema: { type: "string", maxLength: 160 } }, { in: "query", name: "status", schema: { type: "string", enum: ["active", "archived"] } }, { in: "query", name: "limit", schema: { type: "integer", minimum: 1, maximum: 100 } }], responses: { "200": { description: "Company-scoped candidates", content: { "application/json": { schema: { $ref: "#/components/schemas/HrCandidateDirectory" } } } }, ...securityErrors } },
        post: { operationId: "createHrCandidate", security: [{ cookieAuth: [] }], parameters: [csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrCandidateRequest" } } } }, responses: { "201": { description: "Candidate created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrCandidateResult" } } } }, ...securityErrors } },
      },
      "/hr/candidates/{candidateId}/status": {
        post: { operationId: "changeHrCandidateStatus", security: [{ cookieAuth: [] }], parameters: [{ in: "path", name: "candidateId", required: true, schema: { type: "string" } }, csrfParameter, idempotencyParameter], requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChangeHrCandidateStatusRequest" } } } }, responses: { "200": { description: "Candidate status changed", content: { "application/json": { schema: { $ref: "#/components/schemas/HrCandidateResult" } } } }, ...securityErrors } },
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
            { in: "query", name: "type", required: false, schema: { type: "string", enum: ["business_unit", "division", "branch", "department", "warehouse"] } },
            { in: "query", name: "include_inactive", required: false, schema: { type: "boolean", default: false } },
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
          post: {
            operationId: "createHrOrganizationUnit",
            security: [{ cookieAuth: [] }],
            parameters: [csrfParameter, idempotencyParameter],
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrOrganizationUnitRequest" } } } },
            responses: { "201": { description: "Organization unit created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrOrganizationUnitMutationResult" } } } }, ...securityErrors },
          },
        },
        "/hr/organization_units/{unitId}": {
          patch: {
            operationId: "updateHrOrganizationUnit",
            security: [{ cookieAuth: [] }],
            parameters: [{ in: "path", name: "unitId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, csrfParameter, idempotencyParameter],
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateHrOrganizationUnitRequest" } } } },
            responses: { "200": { description: "Organization unit updated", content: { "application/json": { schema: { $ref: "#/components/schemas/HrOrganizationUnitMutationResult" } } } }, ...securityErrors },
          },
        },
        "/hr/organization_units/{unitId}/status": {
          post: {
            operationId: "changeHrOrganizationUnitStatus",
            security: [{ cookieAuth: [] }],
            parameters: [{ in: "path", name: "unitId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, csrfParameter, idempotencyParameter],
            requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChangeHrOrganizationUnitStatusRequest" } } } },
            responses: { "200": { description: "Organization unit status changed", content: { "application/json": { schema: { $ref: "#/components/schemas/HrOrganizationUnitMutationResult" } } } }, ...securityErrors },
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
        post: {
          operationId: "createHrMaster",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrMasterRequest" } } } },
          responses: { "201": { description: "HR master record created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterMutationResult" } } } }, ...securityErrors },
        },
      },
      "/hr/masters/{masterId}": {
        patch: {
          operationId: "updateHrMaster",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "path", name: "masterId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, csrfParameter, idempotencyParameter],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateHrMasterRequest" } } } },
          responses: { "200": { description: "HR master record updated", content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterMutationResult" } } } }, ...securityErrors },
        },
      },
      "/hr/masters/{masterId}/status": {
        post: {
          operationId: "changeHrMasterStatus",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "path", name: "masterId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, csrfParameter, idempotencyParameter],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/ChangeHrMasterStatusRequest" } } } },
          responses: { "200": { description: "HR master status changed", content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterMutationResult" } } } }, ...securityErrors },
        },
      },
      "/hr/job_grades": {
        get: {
          operationId: "listHrJobGrades",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "query", name: "company_id", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }],
          responses: { "200": { description: "Company-scoped job grades and optional compensation bands", content: { "application/json": { schema: { $ref: "#/components/schemas/HrJobGradeDirectory" } } } }, ...securityErrors },
        },
        post: {
          operationId: "createHrJobGrade",
          security: [{ cookieAuth: [] }],
          parameters: [csrfParameter, idempotencyParameter],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/CreateHrJobGradeRequest" } } } },
          responses: { "201": { description: "Job grade created", content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterMutationResult" } } } }, ...securityErrors },
        },
      },
      "/hr/job_grades/{gradeId}": {
        patch: {
          operationId: "updateHrJobGrade",
          security: [{ cookieAuth: [] }],
          parameters: [{ in: "path", name: "gradeId", required: true, schema: { type: "string", minLength: 1, maxLength: 128 } }, csrfParameter, idempotencyParameter],
          requestBody: { required: true, content: { "application/json": { schema: { $ref: "#/components/schemas/UpdateHrJobGradeRequest" } } } },
          responses: { "200": { description: "Job grade updated", content: { "application/json": { schema: { $ref: "#/components/schemas/HrMasterMutationResult" } } } }, ...securityErrors },
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
        HrDashboardSummary: schema(hrDashboardSummarySchema),
        HrFinancePayrollDashboard: schema(hrFinancePayrollDashboardSchema),
        HrPositionsOrganization: schema(hrPositionsOrganizationSchema),
        HrManpowerRequisitionDirectory: schema(hrManpowerRequisitionDirectorySchema),
        CreateHrManpowerRequisitionRequest: schema(createHrManpowerRequisitionRequestSchema),
        HrManpowerRequisitionResult: schema(hrManpowerRequisitionResultSchema),
        SubmitHrManpowerRequisitionRequest: schema(submitHrManpowerRequisitionRequestSchema),
        DecideHrManpowerRequisitionRequest: schema(decideHrManpowerRequisitionRequestSchema),
        HrJobOpeningDirectory: schema(hrJobOpeningDirectorySchema),
        CreateHrJobOpeningRequest: schema(createHrJobOpeningRequestSchema),
        ChangeHrJobOpeningStateRequest: schema(changeHrJobOpeningStateRequestSchema),
        HrJobOpeningResult: schema(hrJobOpeningResultSchema),
        HrInterviewPanelDirectory: schema(hrInterviewPanelDirectorySchema),
        HrInterviewWorkspace: schema(hrInterviewWorkspaceSchema),
        HrInterviewActionRequest: schema(hrInterviewActionRequestSchema),
        HrInterviewActionResult: schema(hrInterviewActionResultSchema),
        CreateHrOfferEmployeeRequest:schema(createHrOfferEmployeeRequestSchema), HrOfferEmployeeResult:schema(hrOfferEmployeeResultSchema), HrOfferEmployeeWorkspace:schema(hrOfferEmployeeWorkspaceSchema),
HrOvertimeQuery:schema(hrOvertimeQuerySchema),
HrOvertimeContextQuery:schema(hrOvertimeContextQuerySchema),
CreateHrOvertimeRequest:schema(createHrOvertimeRequestSchema),
HrOvertimeRuleRequest:schema(hrOvertimeRuleRequestSchema),
HrOvertimeActionRequest:schema(hrOvertimeActionRequestSchema),
HrAttendancePeriodQuery:schema(hrAttendancePeriodQuerySchema),
HrAttendancePeriodActionRequest:schema(hrAttendancePeriodActionRequestSchema),
HrOvertimeDirectory:schema(hrOvertimeDirectorySchema),
HrOvertimeContext:schema(hrOvertimeContextSchema),
HrOvertimeDetail:schema(hrOvertimeDetailSchema),

HrAttendancePeriodWorkspace:schema(hrAttendancePeriodWorkspaceSchema),
HrAttendancePayrollInputs:schema(hrAttendancePayrollInputsSchema),
HrLeaveQuery:schema(hrLeaveQuerySchema),
HrLeaveTypeDirectory:schema(hrLeaveTypeDirectorySchema),
CreateHrLeaveTypeRequest:schema(createHrLeaveTypeRequestSchema),
HrAttendanceCompletionResult:schema(hrAttendanceCompletionResultSchema),
UpdateHrLeavePolicyRequest:schema(updateHrLeavePolicyRequestSchema),
HrLeaveTypeStatusRequest:schema(hrLeaveTypeStatusRequestSchema),
HrLeaveBalanceQuery:schema(hrLeaveBalanceQuerySchema),
HrLeaveBalanceDirectory:schema(hrLeaveBalanceDirectorySchema),
HrLeaveLedgerQuery:schema(hrLeaveLedgerQuerySchema),
HrLeaveLedger:schema(hrLeaveLedgerSchema),
HrLeaveBalancePostingRequest:schema(hrLeaveBalancePostingRequestSchema),
HrLeaveContextQuery:schema(hrLeaveContextQuerySchema),
HrLeaveContext:schema(hrLeaveContextSchema),
HrLeaveRequestQuery:schema(hrLeaveRequestQuerySchema),
HrLeaveRequestDirectory:schema(hrLeaveRequestDirectorySchema),
HrLeaveRequestDetail:schema(hrLeaveRequestDetailSchema),
CreateHrLeaveRequest:schema(createHrLeaveRequestSchema),
HrLeaveRequestActionRequest:schema(hrLeaveRequestActionRequestSchema),
HrPayrollWorkspaceQuery:schema(hrPayrollWorkspaceQuerySchema),
HrPayrollWorkspace:schema(hrPayrollWorkspaceSchema),
HrPayrollOptionsQuery:schema(hrPayrollOptionsQuerySchema),
HrPayrollOptions:schema(hrPayrollOptionsSchema),
CreateHrPayrollRecord:schema(createHrPayrollRecordSchema),
HrPayrollRecordAction:schema(hrPayrollRecordActionSchema),
HrPayrollMutationResult:schema(hrPayrollMutationResultSchema),
HrPayrollPaymentQuery:schema(hrPayrollPaymentQuerySchema),HrPayrollPaymentAction:schema(hrPayrollPaymentActionSchema),HrPayrollPaymentWorkspace:schema(hrPayrollPaymentWorkspaceSchema),HrPayslipQuery:schema(hrPayslipQuerySchema),HrPayslipRelease:schema(hrPayslipReleaseSchema),HrPayslipWorkspace:schema(hrPayslipWorkspaceSchema),HrPayslipDetail:schema(hrPayslipDetailSchema),HrPayslipDocument:schema(hrPayslipDocumentSchema),HrPersonalCorrectionQuery:schema(hrPersonalCorrectionQuerySchema),CreateHrPersonalCorrection:schema(createHrPersonalCorrectionSchema),HrPersonalCorrectionAction:schema(hrPersonalCorrectionActionSchema),HrLearningQuery:schema(hrLearningQuerySchema),HrLearningAction:schema(hrLearningActionSchema),HrLearningWorkspace:schema(hrLearningWorkspaceSchema),HrLearningCertificate:schema(hrLearningCertificateSchema),HrPersonalCorrectionWorkspace:schema(hrPersonalCorrectionWorkspaceSchema),HrReportGovernanceQuery:schema(hrReportGovernanceQuerySchema),HrReportGovernanceAction:schema(hrReportGovernanceActionSchema),HrReportGovernanceWorkspace:schema(hrReportGovernanceWorkspaceSchema),HrReportGovernanceResult:schema(hrReportGovernanceResultSchema),HrSelfLeaveContextQuery:schema(hrSelfLeaveContextQuerySchema),CreateHrSelfLeaveRequest:schema(createHrSelfLeaveRequestSchema),HrSelfLeaveAction:schema(hrSelfLeaveActionSchema),HrSelfServiceQuery:schema(hrSelfServiceQuerySchema),HrSelfServiceWorkspace:schema(hrSelfServiceWorkspaceSchema),HrPolicyUpgradeQuery:schema(hrPolicyUpgradeQuerySchema),HrPolicyUpgradeAction:schema(hrPolicyUpgradeActionSchema),HrPolicyUpgradeRecord:schema(hrPolicyUpgradeRecordSchema),HrPolicyUpgradeWorkspace:schema(hrPolicyUpgradeWorkspaceSchema),HrSettlementBenefitQuery:schema(hrSettlementBenefitQuerySchema),HrSettlementBenefitAction:schema(hrSettlementBenefitActionSchema),HrSettlementBenefitWorkspace:schema(hrSettlementBenefitWorkspaceSchema),HrSettlementEntitlementQuery:schema(hrSettlementEntitlementQuerySchema),HrSettlementEntitlementAction:schema(hrSettlementEntitlementActionSchema),HrSettlementEntitlementWorkspace:schema(hrSettlementEntitlementWorkspaceSchema),HrLifecycleCaseQuery:schema(hrLifecycleCaseQuerySchema),HrLifecycleCaseAction:schema(hrLifecycleCaseActionSchema),HrLifecycleCaseTerms:schema(hrLifecycleCaseTermsSchema),HrLifecycleCaseRecord:schema(hrLifecycleCaseRecordSchema),HrLifecycleCaseWorkspace:schema(hrLifecycleCaseWorkspaceSchema),HrPerformanceInbox:schema(hrPerformanceInboxSchema),HrPerformanceParticipationQuery:schema(hrPerformanceParticipationQuerySchema),HrPerformanceParticipationAction:schema(hrPerformanceParticipationActionSchema),HrPerformanceParticipation:schema(hrPerformanceParticipationSchema),HrPerformanceQuery:schema(hrPerformanceQuerySchema),HrPerformanceCommand:schema(hrPerformanceCommandSchema),HrPerformanceWorkspace:schema(hrPerformanceWorkspaceSchema),HrPerformanceRecord:schema(hrPerformanceRecordSchema),HrPerformanceTerms:schema(hrPerformanceTermsSchema),HrPayrollJournalQuery:schema(hrPayrollJournalQuerySchema),HrPayrollJournalAction:schema(hrPayrollJournalActionSchema),HrPayrollJournalWorkspace:schema(hrPayrollJournalWorkspaceSchema),HrPayrollRunComparisonQuery:schema(hrPayrollRunComparisonQuerySchema),HrPayrollRunComparison:schema(hrPayrollRunComparisonSchema),HrPayrollRunQuery:schema(hrPayrollRunQuerySchema),HrPayrollRunAction:schema(hrPayrollRunActionSchema),HrPayrollRunWorkspace:schema(hrPayrollRunWorkspaceSchema),
HrLocalizationQuery:schema(hrLocalizationQuerySchema),CreateHrLocalization:schema(createHrLocalizationSchema),HrLocalizationDecision:schema(hrLocalizationDecisionSchema),HrLocalizationWorkspace:schema(hrLocalizationWorkspaceSchema),
HrOvertimeMoneyQuery:schema(hrOvertimeMoneyQuerySchema),CreateHrOvertimeMoney:schema(createHrOvertimeMoneySchema),HrOvertimeMoneyDecision:schema(hrOvertimeMoneyDecisionSchema),HrOvertimeMoneyWorkspace:schema(hrOvertimeMoneyWorkspaceSchema),
        HrCorrectionContext:schema(hrCorrectionContextSchema),HrCorrectionDirectory:schema(hrCorrectionDirectorySchema),HrCorrectionDetail:schema(hrCorrectionDetailSchema),HrCorrectionResult:schema(hrCorrectionResultSchema),CreateHrCorrectionRequest:schema(createHrCorrectionRequestSchema),UpdateHrCorrectionRequest:schema(updateHrCorrectionRequestSchema),HrCorrectionActionRequest:schema(hrCorrectionActionRequestSchema),
        HrMonthlyAttendanceDirectory:schema(hrMonthlyAttendanceDirectorySchema),
        HrDailyAttendanceDirectory:schema(hrDailyAttendanceDirectorySchema),
        HrShiftAllocationContext:schema(hrShiftAllocationContextSchema),HrShiftAllocationDirectory:schema(hrShiftAllocationDirectorySchema),HrShiftAllocationDetail:schema(hrShiftAllocationDetailSchema),HrShiftAllocationResult:schema(hrShiftAllocationResultSchema),CreateHrShiftAllocationRequest:schema(createHrShiftAllocationRequestSchema),CloseHrShiftAllocationRequest:schema(closeHrShiftAllocationRequestSchema),HrShiftResolution:schema(hrShiftResolutionSchema),
        CreateHrShiftRequest:schema(createHrShiftRequestSchema),UpdateHrShiftRequest:schema(updateHrShiftRequestSchema),ChangeHrShiftStatusRequest:schema(changeHrShiftStatusRequestSchema),HrShiftDirectory:schema(hrShiftDirectorySchema),HrShiftDetail:schema(hrShiftDetailSchema),HrShiftResult:schema(hrShiftResultSchema),HrShiftContext:schema(hrShiftContextSchema),
        HrOfferContext: schema(hrOfferContextSchema), HrOfferDirectory: schema(hrOfferDirectorySchema), HrOfferDetail: schema(hrOfferDetailSchema), CreateHrOfferRequest: schema(createHrOfferRequestSchema), UpdateHrOfferRequest: schema(updateHrOfferRequestSchema), HrOfferActionRequest: schema(hrOfferActionRequestSchema), HrOfferResult: schema(hrOfferResultSchema),
        HrApplicationDirectory: schema(hrApplicationDirectorySchema),
        CreateHrApplicationRequest: schema(createHrApplicationRequestSchema),
        ChangeHrApplicationStageRequest: schema(changeHrApplicationStageRequestSchema),
        HrApplicationResult: schema(hrApplicationResultSchema),
        HrCandidateDirectory: schema(hrCandidateDirectorySchema),
        CreateHrCandidateRequest: schema(createHrCandidateRequestSchema),
        ChangeHrCandidateStatusRequest: schema(changeHrCandidateStatusRequestSchema),
        HrCandidateResult: schema(hrCandidateResultSchema),
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
        CreateHrOrganizationUnitRequest: schema(createHrOrganizationUnitRequestSchema),
        UpdateHrOrganizationUnitRequest: schema(updateHrOrganizationUnitRequestSchema),
        ChangeHrOrganizationUnitStatusRequest: schema(changeHrOrganizationUnitStatusRequestSchema),
        HrOrganizationUnitMutationResult: schema(hrOrganizationUnitMutationResultSchema),
        HrMasterDirectory: schema(hrMasterDirectorySchema),
        CreateHrMasterRequest: schema(createHrMasterRequestSchema),
        UpdateHrMasterRequest: schema(updateHrMasterRequestSchema),
        ChangeHrMasterStatusRequest: schema(changeHrMasterStatusRequestSchema),
        HrMasterMutationResult: schema(hrMasterMutationResultSchema),
        HrJobGradeDirectory: schema(hrJobGradeDirectorySchema),
        CreateHrJobGradeRequest: schema(createHrJobGradeRequestSchema),
        UpdateHrJobGradeRequest: schema(updateHrJobGradeRequestSchema),
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
      },
    },
  } as const;
}
