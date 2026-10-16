import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const isoDate = z.string().date();

export const hrEmployeeStatusSchema = z.enum([
  "draft",
  "pending_approval",
  "active",
  "probation",
  "confirmed",
  "suspended",
  "resigned",
  "terminated",
  "inactive",
]);

export const hrEmployeeDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  status: hrEmployeeStatusSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const hrEmployeeSummarySchema = z.strictObject({
  id: identifier,
  employee_number: z.string().min(1).max(32),
  display_name: z.string().min(1).max(320),
  work_email: z.string().max(320),
  status: hrEmployeeStatusSchema,
  joined_on: isoDate,
  company_id: identifier,
  branch_id: identifier,
  department_id: identifier,
  designation: z.string().min(1).max(160),
});

export const hrEmployeeDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeSummarySchema),
});

/** A minimal, server-authorized company picker projection for HR screens. */
export const hrCompanyDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(200),
    }),
  ),
});
export type HrCompanyDirectory = z.infer<typeof hrCompanyDirectorySchema>;

export const hrOrganizationUnitDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  type: z.enum(["branch", "department"]).optional(),
  limit: z.number().int().min(1).max(200).default(200),
});
export const hrOrganizationUnitDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      parent_id: identifier,
      type: z.enum(["branch", "department"]),
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(200),
    }),
  ),
});
export type HrOrganizationUnitDirectoryQuery = z.infer<typeof hrOrganizationUnitDirectoryQuerySchema>;
export type HrOrganizationUnitDirectory = z.infer<typeof hrOrganizationUnitDirectorySchema>;

// Creating a draft deliberately excludes bank, tax, national-ID and employment
// assignment data. Those fields have their own governed workflows and must not
// be bundled into a directory/profile write.
export const createHrEmployeeDraftRequestSchema = z.strictObject({
  company_id: identifier,
  employee_number: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
  first_name: z.string().trim().min(1).max(100),
  middle_name: z.string().trim().max(100).optional(),
  last_name: z.string().trim().min(1).max(100),
  preferred_name: z.string().trim().max(100).optional(),
  joined_on: isoDate,
  work_email: z.string().trim().email().max(320).optional(),
  phone: z.string().trim().max(40).optional(),
});

export const hrEmployeeDraftResultSchema = z.strictObject({
  id: identifier,
  employee_number: z.string().min(1).max(32),
  status: z.enum(["draft", "pending_approval"]),
  company_id: identifier,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const hrEmployeeDraftDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const hrEmployeeDraftSummarySchema = z.strictObject({
  id: identifier,
  employee_number: z.string().min(1).max(32),
  display_name: z.string().min(1).max(320),
  work_email: z.string().max(320),
  joined_on: isoDate,
  company_id: identifier,
  created_at: z.string().datetime(),
});

export const hrEmployeeDraftDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeDraftSummarySchema),
});

export const hrEmployeeDraftDetailSchema = hrEmployeeDraftSummarySchema.extend({
  first_name: z.string().max(100),
  middle_name: z.string().max(100),
  last_name: z.string().max(100),
  preferred_name: z.string().max(100),
  phone: z.string().max(40),
});

/** Contact values are isolated from employee profile and private-record APIs. */
export const hrEmployeeContactSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  channel: z.enum(["email", "phone"]),
  contact_usage: z.enum(["work", "personal", "other"]),
  contact_value: z.string().min(1).max(320),
  label: z.string().max(100),
  is_primary: z.boolean(),
  effective_from: isoDate,
  created_at: z.string().datetime(),
});
export const hrEmployeeContactDirectorySchema = z.strictObject({ items: z.array(hrEmployeeContactSchema) });
export const createHrEmployeeContactRequestSchema = z
  .strictObject({
    channel: z.enum(["email", "phone"]),
    contact_usage: z.enum(["work", "personal", "other"]),
    contact_value: z.string().trim().min(1).max(320),
    label: z.string().trim().max(100).optional(),
    is_primary: z.boolean().default(false),
  })
  .superRefine((value, context) => {
    if (value.channel === "email" && !z.string().email().safeParse(value.contact_value).success)
      context.addIssue({ code: "custom", path: ["contact_value"], message: "A valid email address is required." });
  });
export const hrEmployeeContactResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const hrEmployeeEmergencyContactSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  name: z.string().min(1).max(160),
  relationship: z.string().min(1).max(80),
  phone: z.string().min(1).max(40),
  email: z.string().max(320),
  priority: z.number().int().min(1).max(99),
  is_primary: z.boolean(),
  effective_from: isoDate,
  created_at: z.string().datetime(),
});
export const hrEmployeeEmergencyContactDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeEmergencyContactSchema),
});
export const createHrEmployeeEmergencyContactRequestSchema = z.strictObject({
  name: z.string().trim().min(1).max(160),
  relationship: z.string().trim().min(1).max(80),
  phone: z.string().trim().min(1).max(40),
  email: z.string().trim().email().max(320).optional(),
  priority: z.number().int().min(1).max(99),
  is_primary: z.boolean().default(false),
});
export const hrEmployeeEmergencyContactResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  audit_event_id: identifier,
  replayed: z.boolean(),
});

/** Restricted document metadata deliberately omits storage keys and file URLs. */
export const hrEmployeeDocumentSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  document_type: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  reference: z.string().max(120),
  issued_on: isoDate.nullable(),
  expires_on: isoDate.nullable(),
  restricted: z.boolean(),
  issuing_authority: z.string().max(200),
  verification_status: z.enum(["unverified", "pending", "verified", "rejected", "expired"]),
  status: z.enum(["active", "inactive"]),
  created_at: z.string().datetime(),
});
export const hrEmployeeDocumentDirectorySchema = z.strictObject({ items: z.array(hrEmployeeDocumentSchema) });

/** Immutable, scoped assignment timeline; it does not authorize a movement. */
export const hrEmployeeAssignmentSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  employment_relationship_id: identifier.nullable(),
  branch_id: identifier.nullable(),
  department_id: identifier.nullable(),
  job_id: identifier.nullable(),
  designation_id: identifier,
  job_grade_id: identifier,
  cost_center_id: identifier,
  work_location_id: identifier,
  employment_type_id: identifier,
  employee_category_id: identifier,
  reporting_manager_id: identifier.nullable(),
  designation: z.string().min(1).max(160),
  job: z.string().max(160),
  job_grade: z.string().min(1).max(160),
  employment_type: z.string().min(1).max(160),
  work_location: z.string().min(1).max(160),
  change_reason: z.enum([
    "initial_appointment",
    "transfer",
    "promotion",
    "demotion",
    "manager_change",
    "employment_type_change",
    "grade_revision",
    "cost_center_change",
    "status_change",
    "organization_change",
    "job_change",
    "designation_change",
    "work_location_change",
    "correction",
  ]),
  assignment_status: z.enum(["profile_draft", "active", "ended", "cancelled", "legacy_compatibility"]),
  effective_from: isoDate,
  effective_to: isoDate.nullable(),
  created_at: z.string().datetime(),
});
export const hrEmployeeAssignmentDirectorySchema = z.strictObject({ items: z.array(hrEmployeeAssignmentSchema) });

/** Status events are immutable evidence, not mutable employee-profile fields. */
export const hrEmployeeStatusHistoryEntrySchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  from_status: hrEmployeeStatusSchema.nullable(),
  to_status: hrEmployeeStatusSchema,
  effective_on: isoDate,
  reason: z.string().min(1).max(1000),
  created_at: z.string().datetime(),
});
export const hrEmployeeStatusHistoryDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeStatusHistoryEntrySchema),
});

export const updateHrEmployeeDraftRequestSchema = z
  .strictObject({
    first_name: z.string().trim().min(1).max(100).optional(),
    middle_name: z.string().trim().max(100).optional(),
    last_name: z.string().trim().min(1).max(100).optional(),
    preferred_name: z.string().trim().max(100).optional(),
    joined_on: isoDate.optional(),
    work_email: z.string().trim().email().max(320).optional(),
    phone: z.string().trim().max(40).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "At least one draft field must be supplied.");

export const hrEmployeeDetailSchema = hrEmployeeSummarySchema.extend({
  preferred_name: z.string().max(100),
  phone: z.string().max(40),
  employment_type: z.string().min(1).max(160),
  job_grade: z.string().min(1).max(160),
  work_location: z.string().min(1).max(160),
  employee_category: z.string().min(1).max(160),
  reporting_manager: z
    .strictObject({
      id: identifier,
      employee_number: z.string().min(1).max(32),
      display_name: z.string().min(1).max(320),
    })
    .nullable(),
  user_account_id: identifier.nullable(),
});

export const hrMasterTypeSchema = z.enum([
  "job",
  "designation",
  "job_grade",
  "cost_center",
  "work_location",
  "employment_type",
  "employee_category",
]);

export const hrMasterDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  type: hrMasterTypeSchema.optional(),
  active_only: z.boolean().default(true),
  limit: z.number().int().min(1).max(100).default(100),
});

export const hrMasterRecordSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  type: hrMasterTypeSchema,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  description: z.string().max(1000),
  status: z.enum(["active", "inactive"]),
});
export const createHrJobRequestSchema = z.strictObject({
  company_id: identifier,
  code: z
    .string()
    .trim()
    .regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).optional(),
});
export const hrJobResultSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  code: z.string(),
  name: z.string(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

/**
 * A hire request captures proposed employment context only. It must not be
 * interpreted by a client as permission to activate an employee or assignment.
 */
export const createHrEmployeeHireRequestSchema = z.strictObject({
  company_id: identifier,
  job_id: identifier,
  profile_draft_assignment_id: identifier,
  effective_on: isoDate,
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeHireRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  relationship_id: identifier,
  lifecycle_request_id: identifier,
  status: z.literal("pending_approval"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeeHireRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeHireDecisionResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  relationship_id: identifier,
  status: z.enum(["approved", "rejected"]),
  assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});

export const hrEmployeeHireRequestDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

/** Minimal approval projection; private employee fields are deliberately excluded. */
export const hrEmployeeHireRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  job_id: identifier,
  job_code: z.string().min(1).max(32),
  job_name: z.string().min(1).max(160),
  profile_draft_assignment_id: identifier,
  designation: z.string().min(1).max(160),
  job_grade: z.string().min(1).max(160),
  employment_type: z.string().min(1).max(160),
  work_location: z.string().min(1).max(160),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
});

export const hrEmployeeHireRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeHireRequestReviewSchema),
});

/** A transfer request is proposed assignment context, never a live assignment. */
export const createHrEmployeeTransferRequestSchema = z.strictObject({
  company_id: identifier,
  source_assignment_id: identifier,
  branch_id: identifier.optional(),
  department_id: identifier.optional(),
  job_id: identifier,
  designation_id: identifier,
  job_grade_id: identifier,
  cost_center_id: identifier,
  work_location_id: identifier,
  employment_type_id: identifier,
  employee_category_id: identifier,
  reporting_manager_id: identifier.optional(),
  effective_on: isoDate,
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeTransferRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.literal("pending"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeeTransferRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeTransferDecisionResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.enum(["approved", "rejected"]),
  assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const hrEmployeeTransferRequestDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmployeeTransferRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  source_assignment_id: identifier,
  source_branch: z.string().max(200),
  source_department: z.string().max(200),
  proposed_branch: z.string().max(200),
  proposed_department: z.string().max(200),
  proposed_job: z.string().min(1).max(160),
  proposed_designation: z.string().min(1).max(160),
  proposed_job_grade: z.string().min(1).max(160),
  proposed_work_location: z.string().min(1).max(160),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
});
export const hrEmployeeTransferRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeTransferRequestReviewSchema),
});

/** A promotion request changes assignment role fields, never compensation. */
export const createHrEmployeePromotionRequestSchema = z.strictObject({
  company_id: identifier,
  source_assignment_id: identifier,
  job_id: identifier,
  designation_id: identifier,
  job_grade_id: identifier,
  effective_on: isoDate,
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeePromotionRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.literal("pending"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeePromotionRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeePromotionDecisionResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.enum(["approved", "rejected"]),
  assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const hrEmployeePromotionRequestDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmployeePromotionRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  source_assignment_id: identifier,
  source_job: z.string().min(1).max(160),
  source_designation: z.string().min(1).max(160),
  source_job_grade: z.string().min(1).max(160),
  proposed_job: z.string().min(1).max(160),
  proposed_designation: z.string().min(1).max(160),
  proposed_job_grade: z.string().min(1).max(160),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
});
export const hrEmployeePromotionRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeePromotionRequestReviewSchema),
});

export const hrMasterDirectorySchema = z.strictObject({ items: z.array(hrMasterRecordSchema) });

export type HrEmployeeDirectoryQuery = z.infer<typeof hrEmployeeDirectoryQuerySchema>;
export type CreateHrEmployeeDraftRequest = z.infer<typeof createHrEmployeeDraftRequestSchema>;
export type HrEmployeeDraftResult = z.infer<typeof hrEmployeeDraftResultSchema>;
export type HrEmployeeDraftDirectoryQuery = z.infer<typeof hrEmployeeDraftDirectoryQuerySchema>;
export type HrEmployeeDraftDirectory = z.infer<typeof hrEmployeeDraftDirectorySchema>;
export type HrEmployeeDraftDetail = z.infer<typeof hrEmployeeDraftDetailSchema>;
export type HrEmployeeContactDirectory = z.infer<typeof hrEmployeeContactDirectorySchema>;
export type CreateHrEmployeeContactRequest = z.infer<typeof createHrEmployeeContactRequestSchema>;
export type HrEmployeeContactResult = z.infer<typeof hrEmployeeContactResultSchema>;
export type HrEmployeeEmergencyContactDirectory = z.infer<typeof hrEmployeeEmergencyContactDirectorySchema>;
export type CreateHrEmployeeEmergencyContactRequest = z.infer<typeof createHrEmployeeEmergencyContactRequestSchema>;
export type HrEmployeeEmergencyContactResult = z.infer<typeof hrEmployeeEmergencyContactResultSchema>;
export type HrEmployeeDocumentDirectory = z.infer<typeof hrEmployeeDocumentDirectorySchema>;
export type HrEmployeeAssignmentDirectory = z.infer<typeof hrEmployeeAssignmentDirectorySchema>;
export type HrEmployeeStatusHistoryDirectory = z.infer<typeof hrEmployeeStatusHistoryDirectorySchema>;

export const hrEmploymentLifecyclePolicyDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmploymentLifecyclePolicySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  version: z.number().int().positive(),
  status: z.enum(["draft", "pending_approval", "approved", "active", "inactive"]),
  effective_from: isoDate,
  effective_to: isoDate.nullable(),
});
export const hrEmploymentLifecyclePolicyDirectorySchema = z.strictObject({
  items: z.array(hrEmploymentLifecyclePolicySchema),
});
export const createHrEmploymentLifecyclePolicyRequestSchema = z
  .strictObject({
    company_id: identifier,
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
    name: z.string().trim().min(1).max(160),
    effective_from: isoDate,
    effective_to: isoDate.optional(),
  })
  .superRefine((value, context) => {
    if (value.effective_to && value.effective_to < value.effective_from)
      context.addIssue({
        code: "custom",
        path: ["effective_to"],
        message: "The end date cannot precede the start date.",
      });
  });
export const hrEmploymentLifecyclePolicyResultSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  version: z.number().int().positive(),
  status: z.literal("draft"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const submitHrEmploymentLifecyclePolicyRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmploymentLifecyclePolicySubmissionResultSchema = hrEmploymentLifecyclePolicyResultSchema.extend({
  status: z.literal("pending_approval"),
});
export type HrEmploymentLifecyclePolicyDirectoryQuery = z.infer<typeof hrEmploymentLifecyclePolicyDirectoryQuerySchema>;
export type HrEmploymentLifecyclePolicyDirectory = z.infer<typeof hrEmploymentLifecyclePolicyDirectorySchema>;
export type CreateHrEmploymentLifecyclePolicyRequest = z.infer<typeof createHrEmploymentLifecyclePolicyRequestSchema>;
export type HrEmploymentLifecyclePolicyResult = z.infer<typeof hrEmploymentLifecyclePolicyResultSchema>;
export type SubmitHrEmploymentLifecyclePolicyRequest = z.infer<typeof submitHrEmploymentLifecyclePolicyRequestSchema>;
export type HrEmploymentLifecyclePolicySubmissionResult = z.infer<
  typeof hrEmploymentLifecyclePolicySubmissionResultSchema
>;
export const approveHrEmploymentLifecyclePolicyRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmploymentLifecyclePolicyApprovalResultSchema = hrEmploymentLifecyclePolicyResultSchema.extend({
  status: z.literal("approved"),
});
export type ApproveHrEmploymentLifecyclePolicyRequest = z.infer<typeof approveHrEmploymentLifecyclePolicyRequestSchema>;
export type HrEmploymentLifecyclePolicyApprovalResult = z.infer<typeof hrEmploymentLifecyclePolicyApprovalResultSchema>;
export const activateHrEmploymentLifecyclePolicyRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmploymentLifecyclePolicyActivationResultSchema = hrEmploymentLifecyclePolicyResultSchema.extend({
  status: z.literal("active"),
});
export type ActivateHrEmploymentLifecyclePolicyRequest = z.infer<
  typeof activateHrEmploymentLifecyclePolicyRequestSchema
>;
export type HrEmploymentLifecyclePolicyActivationResult = z.infer<
  typeof hrEmploymentLifecyclePolicyActivationResultSchema
>;
export type UpdateHrEmployeeDraftRequest = z.infer<typeof updateHrEmployeeDraftRequestSchema>;

export const submitHrEmployeeDraftRequestSchema = z.strictObject({
  reason: z.string().trim().min(1).max(1000),
});
export type SubmitHrEmployeeDraftRequest = z.infer<typeof submitHrEmployeeDraftRequestSchema>;

export const hrEmployeeDraftApprovalQueueQuerySchema = z.strictObject({
  company_id: identifier,
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmployeeDraftApprovalQueueSchema = z.strictObject({
  items: z.array(
    z.strictObject({
      approval_id: identifier,
      employee_id: identifier,
      employee_number: z.string().min(1).max(32),
      display_name: z.string().min(1).max(320),
      company_id: identifier,
      submitted_by: identifier,
      submitted_at: z.string().datetime(),
    }),
  ),
});
export const hrEmployeeDraftApprovalDetailSchema = hrEmployeeDraftDetailSchema.extend({
  approval_id: identifier,
  created_by: identifier,
  submitted_by: identifier,
  submitted_at: z.string().datetime(),
});
export type HrEmployeeDraftApprovalQueueQuery = z.infer<typeof hrEmployeeDraftApprovalQueueQuerySchema>;
export type HrEmployeeDraftApprovalQueue = z.infer<typeof hrEmployeeDraftApprovalQueueSchema>;
export type HrEmployeeDraftApprovalDetail = z.infer<typeof hrEmployeeDraftApprovalDetailSchema>;

export const decideHrEmployeeDraftApprovalRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export type DecideHrEmployeeDraftApprovalRequest = z.infer<typeof decideHrEmployeeDraftApprovalRequestSchema>;

export const createHrProfileDraftAssignmentRequestSchema = z.strictObject({
  company_id: identifier,
  branch_id: identifier.optional(),
  department_id: identifier.optional(),
  designation_id: identifier,
  job_grade_id: identifier,
  cost_center_id: identifier,
  work_location_id: identifier,
  employment_type_id: identifier,
  employee_category_id: identifier,
  effective_from: isoDate,
  reporting_manager_id: identifier.optional(),
});

export const hrProfileDraftAssignmentResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  assignment_status: z.literal("profile_draft"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export type CreateHrProfileDraftAssignmentRequest = z.infer<typeof createHrProfileDraftAssignmentRequestSchema>;
export type HrProfileDraftAssignmentResult = z.infer<typeof hrProfileDraftAssignmentResultSchema>;
export type HrEmployeeStatus = z.infer<typeof hrEmployeeStatusSchema>;
export type HrMasterDirectoryQuery = z.infer<typeof hrMasterDirectoryQuerySchema>;
export type HrMasterType = z.infer<typeof hrMasterTypeSchema>;
export type HrEmployeeDirectory = z.infer<typeof hrEmployeeDirectorySchema>;
export type HrEmployeeDetail = z.infer<typeof hrEmployeeDetailSchema>;
export type HrMasterDirectory = z.infer<typeof hrMasterDirectorySchema>;
export type CreateHrJobRequest = z.infer<typeof createHrJobRequestSchema>;
export type HrJobResult = z.infer<typeof hrJobResultSchema>;
export type CreateHrEmployeeHireRequest = z.infer<typeof createHrEmployeeHireRequestSchema>;
export type HrEmployeeHireRequestResult = z.infer<typeof hrEmployeeHireRequestResultSchema>;
export type DecideHrEmployeeHireRequest = z.infer<typeof decideHrEmployeeHireRequestSchema>;
export type HrEmployeeHireDecisionResult = z.infer<typeof hrEmployeeHireDecisionResultSchema>;
export type HrEmployeeHireRequestDirectoryQuery = z.infer<typeof hrEmployeeHireRequestDirectoryQuerySchema>;
export type HrEmployeeHireRequestReview = z.infer<typeof hrEmployeeHireRequestReviewSchema>;
export type HrEmployeeHireRequestDirectory = z.infer<typeof hrEmployeeHireRequestDirectorySchema>;
export type CreateHrEmployeeTransferRequest = z.infer<typeof createHrEmployeeTransferRequestSchema>;
export type HrEmployeeTransferRequestResult = z.infer<typeof hrEmployeeTransferRequestResultSchema>;
export type DecideHrEmployeeTransferRequest = z.infer<typeof decideHrEmployeeTransferRequestSchema>;
export type HrEmployeeTransferDecisionResult = z.infer<typeof hrEmployeeTransferDecisionResultSchema>;
export type HrEmployeeTransferRequestDirectoryQuery = z.infer<
  typeof hrEmployeeTransferRequestDirectoryQuerySchema
>;
export type HrEmployeeTransferRequestReview = z.infer<typeof hrEmployeeTransferRequestReviewSchema>;
export type HrEmployeeTransferRequestDirectory = z.infer<typeof hrEmployeeTransferRequestDirectorySchema>;
export type CreateHrEmployeePromotionRequest = z.infer<typeof createHrEmployeePromotionRequestSchema>;
export type HrEmployeePromotionRequestResult = z.infer<typeof hrEmployeePromotionRequestResultSchema>;
export type DecideHrEmployeePromotionRequest = z.infer<typeof decideHrEmployeePromotionRequestSchema>;
export type HrEmployeePromotionDecisionResult = z.infer<typeof hrEmployeePromotionDecisionResultSchema>;
export type HrEmployeePromotionRequestDirectoryQuery = z.infer<
  typeof hrEmployeePromotionRequestDirectoryQuerySchema
>;
export type HrEmployeePromotionRequestReview = z.infer<typeof hrEmployeePromotionRequestReviewSchema>;
export type HrEmployeePromotionRequestDirectory = z.infer<typeof hrEmployeePromotionRequestDirectorySchema>;
