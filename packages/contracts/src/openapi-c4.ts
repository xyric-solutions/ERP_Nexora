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
import { healthStatusSchema } from "./health.js";
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
} from "./hr/index.js";
import { jobReceiptSchema, sampleJobPayloadSchema } from "./jobs/index.js";
import { problemDetailsSchema } from "./problem.js";
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
