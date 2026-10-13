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
