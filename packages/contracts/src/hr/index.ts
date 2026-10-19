import { z } from "zod";

const identifier = z.string().trim().min(1).max(128);
const isoDate = z.string().date();
const approvalOverrideReviewFields = {
  self_decision_requires_override: z.boolean().optional(),
  super_admin_override_allowed: z.boolean().optional(),
};

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
  branch: z.string().min(1).max(200),
  department_id: identifier,
  department: z.string().min(1).max(200),
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
  type: z.enum(["business_unit", "division", "branch", "department", "warehouse"]).optional(),
  include_inactive: z.boolean().default(false),
  limit: z.number().int().min(1).max(200).default(200),
});
export const hrOrganizationUnitDirectorySchema = z.strictObject({
  items: z.array(
    z.strictObject({
      id: identifier,
      parent_id: identifier,
      type: z.enum(["business_unit", "division", "branch", "department", "warehouse"]),
      code: z.string().min(1).max(64),
      name: z.string().min(1).max(200),
      status: z.enum(["active", "inactive"]),
      created_at: z.string().datetime(),
      head_name: z.string().nullable(),
      employee_count: z.number().int().nonnegative(),
    }),
  ),
});
export type HrOrganizationUnitDirectoryQuery = z.infer<typeof hrOrganizationUnitDirectoryQuerySchema>;
export type HrOrganizationUnitDirectory = z.infer<typeof hrOrganizationUnitDirectorySchema>;

const hrOrganizationUnitTypeSchema = z.enum(["business_unit", "division", "branch", "department", "warehouse"]);
export const createHrOrganizationUnitRequestSchema = z.strictObject({
  company_id: identifier,
  parent_id: identifier,
  type: hrOrganizationUnitTypeSchema,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
});
export const updateHrOrganizationUnitRequestSchema = z.strictObject({
  company_id: identifier,
  parent_id: identifier,
  code: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(200),
});
export const changeHrOrganizationUnitStatusRequestSchema = z.strictObject({
  company_id: identifier,
  status: z.enum(["active", "inactive"]),
});
export const hrOrganizationUnitMutationResultSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export type CreateHrOrganizationUnitRequest = z.infer<typeof createHrOrganizationUnitRequestSchema>;
export type UpdateHrOrganizationUnitRequest = z.infer<typeof updateHrOrganizationUnitRequestSchema>;
export type ChangeHrOrganizationUnitStatusRequest = z.infer<typeof changeHrOrganizationUnitStatusRequestSchema>;
export type HrOrganizationUnitMutationResult = z.infer<typeof hrOrganizationUnitMutationResultSchema>;
export const hrOrganizationPlacementSnapshotSchema = z.strictObject({
  business_unit_id: identifier.nullable(),
  division_id: identifier.nullable(),
  branch_id: identifier.nullable(),
  department_id: identifier.nullable(),
  warehouse_id: identifier.nullable(),
});

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
  organization_placements: hrOrganizationPlacementSnapshotSchema,
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

export const hrEmployeeHistoryQuerySchema = z.strictObject({
  limit: z.number().int().min(1).max(100).default(25),
  cursor: z.string().trim().min(1).max(512).optional(),
});

export const hrEmploymentLifecycleClassSchema = z.enum(["pre_employment", "employed", "temporarily_inactive", "ended"]);

export const hrEmployeeLifecycleStateEvidenceSchema = z.strictObject({
  code: z.string().min(1).max(64),
  label: z.string().min(1).max(120),
  canonical_class: hrEmploymentLifecycleClassSchema,
});

/** Authoritative lifecycle evidence with actor identifiers deliberately omitted. */
export const hrEmployeeLifecycleEventSchema = z.strictObject({
  id: identifier,
  relationship_id: identifier,
  sequence: z.number().int().positive(),
  event_type: z.enum([
    "hire",
    "probation",
    "confirmation",
    "suspension",
    "resume",
    "resignation",
    "termination",
    "rehire",
  ]),
  effective_on: isoDate,
  previous_state: hrEmployeeLifecycleStateEvidenceSchema.nullable(),
  resulting_state: hrEmployeeLifecycleStateEvidenceSchema,
  reason: z.string().min(1).max(1000),
  source_reference: z.string().min(1).max(512),
  recorded_at: z.string().datetime(),
  approved_at: z.string().datetime(),
});
export const hrEmployeeLifecycleEventDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeLifecycleEventSchema),
  next_cursor: z.string().nullable(),
});

/** Non-sensitive profile history; private contact and identity values are excluded. */
export const hrEmployeeProfileVersionSchema = z.strictObject({
  id: identifier,
  revision: z.number().int().positive(),
  effective_from: isoDate,
  effective_to: isoDate.nullable(),
  first_name: z.string().min(1).max(100),
  middle_name: z.string().max(100),
  last_name: z.string().min(1).max(100),
  preferred_name: z.string().max(100),
  work_email: z.string().max(320),
  source_reference: z.string().min(1).max(500),
  capture_origin: z.enum(["migration_baseline", "recorded_change"]),
  recorded_at: z.string().datetime(),
});
export const hrEmployeeProfileVersionDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeProfileVersionSchema),
  next_cursor: z.string().nullable(),
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

export const hrDashboardSummarySchema = z.strictObject({
  company_id: identifier,
  generated_at: z.string().datetime({ offset: true }),
  metrics: z.strictObject({
    active_headcount: z.number().int().min(0),
    draft_profiles: z.number().int().min(0),
    pending_employee_approvals: z.number().int().min(0),
    pending_movements: z.number().int().min(0),
    active_departments: z.number().int().min(0),
    recent_joiners: z.number().int().min(0),
    master_configuration_gaps: z.number().int().min(0),
  }),
  status_distribution: z.array(z.strictObject({ status: z.string().min(1).max(40), count: z.number().int().min(0) })),
  action_items: z.array(z.strictObject({
    key: z.string().min(1).max(80),
    label: z.string().min(1).max(160),
    count: z.number().int().min(0),
    page_id: z.string().min(1).max(128),
    tone: z.enum(["neutral", "attention"]),
  })),
});
export type HrDashboardSummary = z.infer<typeof hrDashboardSummarySchema>;

const hrPayrollPeriodStateSchema = z.enum([
  "open",
  "processing",
  "calculated",
  "under_review",
  "approved",
  "posting_ready",
  "posted",
  "paid",
  "closed",
]);
const hrPayrollMoneySchema = z.string().regex(/^-?\d+(?:\.\d{1,4})?$/);
const hrFinancePayrollPeriodSummarySchema = z.strictObject({
  id: identifier,
  month: isoDate,
  state: hrPayrollPeriodStateSchema,
  run_number: z.number().int().min(0),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  employee_count: z.number().int().min(0),
  gross: hrPayrollMoneySchema,
  deductions: hrPayrollMoneySchema,
  net: hrPayrollMoneySchema,
  warning_count: z.number().int().min(0),
  journal_state: z.enum(["prepared", "accepted", "posted", "rejected"]).nullable(),
  journal_balanced: z.boolean().nullable(),
  payment_state: z.string().min(1).max(40).nullable(),
  payment_count: z.number().int().min(0),
  confirmed_payment_count: z.number().int().min(0),
  payment_total: hrPayrollMoneySchema,
});
export const hrFinancePayrollDashboardSchema = z.strictObject({
  company_id: identifier,
  generated_at: z.string().datetime({ offset: true }),
  metrics: z.strictObject({
    current_employees: z.number().int().min(0),
    salary_covered_employees: z.number().int().min(0),
    salary_gaps: z.number().int().min(0),
    total_periods: z.number().int().min(0),
    review_queue: z.number().int().min(0),
    journal_queue: z.number().int().min(0),
    payment_exceptions: z.number().int().min(0),
  }),
  latest_period: hrFinancePayrollPeriodSummarySchema.nullable(),
  recent_periods: z.array(hrFinancePayrollPeriodSummarySchema),
});
export type HrFinancePayrollDashboard = z.infer<typeof hrFinancePayrollDashboardSchema>;

export const hrPositionsOrganizationQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(250).default(100),
});
export const hrPositionsOrganizationSchema = z.strictObject({
  company_id: identifier,
  generated_at: z.string().datetime({ offset: true }),
  metrics: z.strictObject({
    current_assignments: z.number().int().min(0),
    active_departments: z.number().int().min(0),
    represented_jobs: z.number().int().min(0),
    reporting_managers: z.number().int().min(0),
    without_manager: z.number().int().min(0),
  }),
  departments: z.array(z.strictObject({
    department_id: identifier,
    department: z.string().min(1).max(200),
    active_people: z.number().int().min(0),
    job_count: z.number().int().min(0),
    manager_count: z.number().int().min(0),
  })),
  items: z.array(z.strictObject({
    assignment_id: identifier,
    employee_id: identifier,
    employee_number: z.string().min(1).max(32),
    employee_name: z.string().min(1).max(320),
    employee_status: hrEmployeeStatusSchema,
    branch_id: identifier,
    branch: z.string().min(1).max(200),
    department_id: identifier,
    department: z.string().min(1).max(200),
    job: z.string().min(1).max(160),
    designation: z.string().min(1).max(160),
    job_grade: z.string().min(1).max(160),
    reporting_manager: z.string().min(1).max(320).nullable(),
    effective_from: isoDate,
  })),
});
export type HrPositionsOrganizationQuery = z.infer<typeof hrPositionsOrganizationQuerySchema>;
export type HrPositionsOrganization = z.infer<typeof hrPositionsOrganizationSchema>;

const hrMoneySchema = z.string().regex(/^\d+(?:\.\d{1,4})?$/);
export const hrManpowerRequisitionQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  state: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrManpowerRequisitionSchema = z.strictObject({
  id: identifier, company_id: identifier, reference: z.string().min(1).max(32),
  job_title: z.string().min(1).max(160), designation: z.string().min(1).max(160), job_grade: z.string().min(1).max(160),
  employment_type: z.string().min(1).max(160), branch: z.string().min(1).max(200), department: z.string().min(1).max(200),
  positions_requested: z.number().int().min(1), position_type: z.enum(["new_position", "replacement"]),
  salary_minimum: hrMoneySchema, salary_maximum: hrMoneySchema, currency_code: z.string().regex(/^[A-Z]{3}$/),
  target_start_date: isoDate, reason: z.string().min(1).max(2000), required_skills: z.array(z.string().min(1).max(100)).max(30),
  state: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]), created_by: identifier,
  submitted_by: identifier.nullable(), submitted_at: z.string().datetime().nullable(), decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(), decision_reason: z.string().max(1000).nullable(), created_at: z.string().datetime(),
});
export const hrManpowerRequisitionDirectorySchema = z.strictObject({ items: z.array(hrManpowerRequisitionSchema) });
export const createHrManpowerRequisitionRequestSchema = z.strictObject({
  company_id: identifier, job_title: z.string().trim().min(1).max(160), designation_id: identifier, job_grade_id: identifier,
  employment_type_id: identifier, branch_id: identifier, department_id: identifier, positions_requested: z.number().int().min(1).max(999),
  position_type: z.enum(["new_position", "replacement"]), replacement_employee_id: identifier.optional(),
  salary_minimum: hrMoneySchema, salary_maximum: hrMoneySchema, currency_code: z.string().regex(/^[A-Z]{3}$/), target_start_date: isoDate,
  reason: z.string().trim().min(1).max(2000), required_skills: z.array(z.string().trim().min(1).max(100)).max(30).default([]),
}).superRefine((value, context) => {
  if (value.position_type === "replacement" && !value.replacement_employee_id) context.addIssue({ code: "custom", path: ["replacement_employee_id"], message: "Replacement employee is required." });
  if (value.position_type === "new_position" && value.replacement_employee_id) context.addIssue({ code: "custom", path: ["replacement_employee_id"], message: "New positions cannot name a replacement employee." });
  if (Number(value.salary_minimum) > Number(value.salary_maximum)) context.addIssue({ code: "custom", path: ["salary_maximum"], message: "Maximum salary must be at least the minimum." });
});
export const hrManpowerRequisitionResultSchema = z.strictObject({ id: identifier, reference: z.string().min(1).max(32), state: z.enum(["draft", "submitted", "approved", "rejected", "cancelled"]), company_id: identifier, audit_event_id: identifier, replayed: z.boolean() });
export const submitHrManpowerRequisitionRequestSchema = z.strictObject({ reason: z.string().trim().min(1).max(1000) });
export const decideHrManpowerRequisitionRequestSchema = z.strictObject({ decision: z.enum(["approved", "rejected"]), reason: z.string().trim().min(1).max(1000) });
export type HrManpowerRequisitionQuery = z.infer<typeof hrManpowerRequisitionQuerySchema>;
export type HrManpowerRequisitionDirectory = z.infer<typeof hrManpowerRequisitionDirectorySchema>;
export type CreateHrManpowerRequisitionRequest = z.infer<typeof createHrManpowerRequisitionRequestSchema>;
export type HrManpowerRequisitionResult = z.infer<typeof hrManpowerRequisitionResultSchema>;
export type SubmitHrManpowerRequisitionRequest = z.infer<typeof submitHrManpowerRequisitionRequestSchema>;
export type DecideHrManpowerRequisitionRequest = z.infer<typeof decideHrManpowerRequisitionRequestSchema>;

export const hrJobOpeningQuerySchema = z.strictObject({ company_id: identifier, search: z.string().trim().max(160).optional(), state: z.enum(["open", "on_hold", "closed", "cancelled"]).optional(), limit: z.number().int().min(1).max(100).default(50) });
export const hrJobOpeningSchema = z.strictObject({
  id: identifier, company_id: identifier, reference: z.string().min(1).max(32), requisition_id: identifier, requisition_reference: z.string().min(1).max(32),
  title: z.string().min(1).max(160), positions_requested: z.number().int().min(1), filled_positions: z.number().int().min(0), remaining_positions: z.number().int().min(0),
  channels: z.array(z.string().min(1).max(80)).max(10), closing_on: isoDate.nullable(), state: z.enum(["open", "on_hold", "closed", "cancelled"]), state_reason: z.string().max(1000), created_at: z.string().datetime(),
});
export const hrJobOpeningDirectorySchema = z.strictObject({ items: z.array(hrJobOpeningSchema) });
export const createHrJobOpeningRequestSchema = z.strictObject({ company_id: identifier, requisition_id: identifier, title: z.string().trim().min(1).max(160), positions_requested: z.number().int().min(1).max(999), channels: z.array(z.string().trim().min(1).max(80)).min(1).max(10), closing_on: isoDate.optional() });
export const changeHrJobOpeningStateRequestSchema = z.strictObject({ company_id: identifier, state: z.enum(["open", "on_hold", "closed", "cancelled"]), reason: z.string().trim().max(1000).default("") });
export const hrJobOpeningResultSchema = z.strictObject({ id: identifier, reference: z.string().min(1).max(32), state: z.enum(["open", "on_hold", "closed", "cancelled"]), company_id: identifier, audit_event_id: identifier, replayed: z.boolean() });
export type HrJobOpeningQuery = z.infer<typeof hrJobOpeningQuerySchema>;
export type HrJobOpeningDirectory = z.infer<typeof hrJobOpeningDirectorySchema>;
export type CreateHrJobOpeningRequest = z.infer<typeof createHrJobOpeningRequestSchema>;
export type ChangeHrJobOpeningStateRequest = z.infer<typeof changeHrJobOpeningStateRequestSchema>;
export type HrJobOpeningResult = z.infer<typeof hrJobOpeningResultSchema>;

export const hrMasterRecordSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  type: hrMasterTypeSchema,
  code: z.string().min(1).max(32),
  name: z.string().min(1).max(160),
  description: z.string().max(1000),
  status: z.enum(["active", "inactive"]),
  configuration_key: z.enum(["default_nominal", "working_pattern", "payment_route", "pay_cycle"]).nullable(),
  configuration_value: z.string().min(1).max(128).nullable(),
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
const hrMasterConfigurationFields = {
  configuration_key: z.enum(["default_nominal", "working_pattern", "payment_route", "pay_cycle"]).nullable().optional(),
  configuration_value: z.string().trim().min(1).max(128).nullable().optional(),
};
const coherentMasterConfiguration = (value: { configuration_key?: string | null | undefined; configuration_value?: string | null | undefined }) =>
  (value.configuration_key == null) === (value.configuration_value == null);
const validMasterConfiguration = (value: { type: z.infer<typeof hrMasterTypeSchema>; configuration_key?: string | null | undefined; configuration_value?: string | null | undefined }) => {
  const expected = {
    cost_center: "default_nominal",
    work_location: "working_pattern",
    employment_type: "payment_route",
    employee_category: "pay_cycle",
  } as const;
  const expectedKey = expected[value.type as keyof typeof expected];
  if (expectedKey) return value.configuration_key === expectedKey && value.configuration_value != null;
  return value.configuration_key == null && value.configuration_value == null;
};
export const createHrMasterRequestSchema = z.strictObject({
  company_id: identifier,
  type: hrMasterTypeSchema,
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  ...hrMasterConfigurationFields,
}).refine(coherentMasterConfiguration, "Provide both configuration key and value, or leave both blank.")
  .refine(validMasterConfiguration, "The configuration field is not valid for this HR master type.");
export const updateHrMasterRequestSchema = z.strictObject({
  company_id: identifier,
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  ...hrMasterConfigurationFields,
}).refine(coherentMasterConfiguration, "Provide both configuration key and value, or leave both blank.");
export const changeHrMasterStatusRequestSchema = z.strictObject({
  company_id: identifier,
  status: z.enum(["active", "inactive"]),
});
export const hrMasterMutationResultSchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  audit_event_id: identifier,
  replayed: z.boolean(),
});
const hrJobGradeAmountSchema = z.string().regex(/^\d{1,16}(\.\d{1,4})?$/);
export const hrJobGradeRecordSchema = hrMasterRecordSchema.extend({
  grade_level: z.number().int().min(1).max(999),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  band_minimum: z.string().nullable(),
  band_midpoint: z.string().nullable(),
  band_maximum: z.string().nullable(),
});
export const hrJobGradeDirectorySchema = z.strictObject({ items: z.array(hrJobGradeRecordSchema) });
const hrJobGradeFields = {
  company_id: identifier,
  code: z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(1000).default(""),
  grade_level: z.number().int().min(1).max(999),
  currency_code: z.string().trim().regex(/^[A-Z]{3}$/),
  band_minimum: hrJobGradeAmountSchema.nullable().default(null),
  band_midpoint: hrJobGradeAmountSchema.nullable().default(null),
  band_maximum: hrJobGradeAmountSchema.nullable().default(null),
};
const coherentJobGradeBand = (value: { band_minimum: string | null; band_midpoint: string | null; band_maximum: string | null }) => {
  const values = [value.band_minimum, value.band_midpoint, value.band_maximum];
  if (values.every((item) => item === null)) return true;
  if (values.some((item) => item === null)) return false;
  return Number(value.band_minimum) <= Number(value.band_midpoint) && Number(value.band_midpoint) <= Number(value.band_maximum);
};
export const createHrJobGradeRequestSchema = z.strictObject(hrJobGradeFields).refine(coherentJobGradeBand, "Provide all band amounts in minimum-to-maximum order, or leave all three blank.");
export const updateHrJobGradeRequestSchema = z.strictObject(hrJobGradeFields).refine(coherentJobGradeBand, "Provide all band amounts in minimum-to-maximum order, or leave all three blank.");
export type HrJobGradeDirectory = z.infer<typeof hrJobGradeDirectorySchema>;
export type CreateHrJobGradeRequest = z.infer<typeof createHrJobGradeRequestSchema>;
export type UpdateHrJobGradeRequest = z.infer<typeof updateHrJobGradeRequestSchema>;

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
  ...approvalOverrideReviewFields,
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
  ...approvalOverrideReviewFields,
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
  ...approvalOverrideReviewFields,
});
export const hrEmployeePromotionRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeePromotionRequestReviewSchema),
});

/** A manager-change request changes only the reporting line, never compensation or placement. */
export const createHrEmployeeManagerChangeRequestSchema = z
  .strictObject({
    company_id: identifier,
    source_assignment_id: identifier,
    reporting_manager_id: identifier.nullable(),
    clear_reporting_manager: z.boolean(),
    effective_on: isoDate,
    reason: z.string().trim().min(1).max(1000),
  })
  .superRefine((value, context) => {
    const selectsManager = value.reporting_manager_id !== null && !value.clear_reporting_manager;
    const explicitlyClears = value.reporting_manager_id === null && value.clear_reporting_manager;
    if (!selectsManager && !explicitlyClears) {
      context.addIssue({
        code: "custom",
        path: ["reporting_manager_id"],
        message: "Select a reporting manager or explicitly clear the reporting manager.",
      });
    }
  });
export const hrEmployeeManagerChangeRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.literal("pending"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeeManagerChangeRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeManagerChangeDecisionResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.enum(["approved", "rejected"]),
  assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const hrEmployeeManagerChangeRequestDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmployeeManagerChangeRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  source_assignment_id: identifier,
  current_reporting_manager_id: identifier.nullable(),
  current_reporting_manager_name: z.string().max(320).nullable(),
  proposed_reporting_manager_id: identifier.nullable(),
  proposed_reporting_manager_name: z.string().max(320).nullable(),
  clear_reporting_manager: z.boolean(),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
  ...approvalOverrideReviewFields,
});
export const hrEmployeeManagerChangeRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeManagerChangeRequestReviewSchema),
});

/** A work-location change alters statutory location context, never role, placement, or pay. */
export const createHrEmployeeWorkLocationChangeRequestSchema = z.strictObject({
  company_id: identifier,
  source_assignment_id: identifier,
  work_location_id: identifier,
  effective_on: isoDate,
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeWorkLocationChangeRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.literal("pending"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeeWorkLocationChangeRequestSchema = z.strictObject({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeWorkLocationChangeDecisionResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.enum(["approved", "rejected"]),
  assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const hrEmployeeWorkLocationChangeRequestDirectoryQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
});
export const hrEmployeeWorkLocationChangeRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  source_assignment_id: identifier,
  current_work_location_id: identifier,
  current_work_location_name: z.string().min(1).max(160),
  proposed_work_location_id: identifier,
  proposed_work_location_name: z.string().min(1).max(160),
  jurisdiction_profile_id: identifier,
  jurisdiction_country_code: z.string().min(1).max(32),
  jurisdiction_id: identifier,
  jurisdiction_ready: z.boolean(),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
  ...approvalOverrideReviewFields,
});
export const hrEmployeeWorkLocationChangeRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeWorkLocationChangeRequestReviewSchema),
});

export const createHrEmployeeOrganizationPlacementChangeRequestSchema = z.strictObject({
  company_id: identifier,
  source_assignment_id: identifier,
  proposed: hrOrganizationPlacementSnapshotSchema,
  effective_on: isoDate,
  reason: z.string().trim().min(1).max(1000),
});
export const hrEmployeeOrganizationPlacementChangeRequestResultSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  company_id: identifier,
  source_assignment_id: identifier,
  status: z.literal("pending"),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const decideHrEmployeeOrganizationPlacementChangeRequestSchema = decideHrEmployeeWorkLocationChangeRequestSchema;
export const hrEmployeeOrganizationPlacementChangeDecisionResultSchema =
  hrEmployeeWorkLocationChangeDecisionResultSchema;
export const hrEmployeeOrganizationPlacementChangeRequestDirectoryQuerySchema =
  hrEmployeeWorkLocationChangeRequestDirectoryQuerySchema;
export const hrEmployeeOrganizationPlacementChangeRequestReviewSchema = z.strictObject({
  id: identifier,
  employee_id: identifier,
  employee_number: z.string().min(1).max(32),
  employee_name: z.string().min(1).max(320),
  company_id: identifier,
  relationship_id: identifier,
  source_assignment_id: identifier,
  current: hrOrganizationPlacementSnapshotSchema,
  proposed: hrOrganizationPlacementSnapshotSchema,
  current_names: z.record(z.string(), z.string()),
  proposed_names: z.record(z.string(), z.string()),
  hierarchy_ready: z.boolean(),
  effective_on: isoDate,
  requested_by: identifier,
  requested_at: z.string().datetime(),
  reason: z.string().min(1).max(1000),
  status: z.enum(["pending", "approved", "rejected"]),
  decided_by: identifier.nullable(),
  decided_at: z.string().datetime().nullable(),
  decision_reason: z.string().max(1000).nullable(),
  ...approvalOverrideReviewFields,
});
export const hrEmployeeOrganizationPlacementChangeRequestDirectorySchema = z.strictObject({
  items: z.array(hrEmployeeOrganizationPlacementChangeRequestReviewSchema),
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
export type HrEmployeeHistoryQuery = z.infer<typeof hrEmployeeHistoryQuerySchema>;
export type HrEmployeeLifecycleEventDirectory = z.infer<typeof hrEmployeeLifecycleEventDirectorySchema>;
export type HrEmployeeProfileVersionDirectory = z.infer<typeof hrEmployeeProfileVersionDirectorySchema>;

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
  ...approvalOverrideReviewFields,
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
  ...approvalOverrideReviewFields,
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
export type CreateHrMasterRequest = z.infer<typeof createHrMasterRequestSchema>;
export type UpdateHrMasterRequest = z.infer<typeof updateHrMasterRequestSchema>;
export type ChangeHrMasterStatusRequest = z.infer<typeof changeHrMasterStatusRequestSchema>;
export type HrMasterMutationResult = z.infer<typeof hrMasterMutationResultSchema>;
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
export type HrEmployeeTransferRequestDirectoryQuery = z.infer<typeof hrEmployeeTransferRequestDirectoryQuerySchema>;
export type HrEmployeeTransferRequestReview = z.infer<typeof hrEmployeeTransferRequestReviewSchema>;
export type HrEmployeeTransferRequestDirectory = z.infer<typeof hrEmployeeTransferRequestDirectorySchema>;
export type CreateHrEmployeePromotionRequest = z.infer<typeof createHrEmployeePromotionRequestSchema>;
export type HrEmployeePromotionRequestResult = z.infer<typeof hrEmployeePromotionRequestResultSchema>;
export type DecideHrEmployeePromotionRequest = z.infer<typeof decideHrEmployeePromotionRequestSchema>;
export type HrEmployeePromotionDecisionResult = z.infer<typeof hrEmployeePromotionDecisionResultSchema>;
export type HrEmployeePromotionRequestDirectoryQuery = z.infer<typeof hrEmployeePromotionRequestDirectoryQuerySchema>;
export type HrEmployeePromotionRequestReview = z.infer<typeof hrEmployeePromotionRequestReviewSchema>;
export type HrEmployeePromotionRequestDirectory = z.infer<typeof hrEmployeePromotionRequestDirectorySchema>;
export type CreateHrEmployeeManagerChangeRequest = z.infer<typeof createHrEmployeeManagerChangeRequestSchema>;
export type HrEmployeeManagerChangeRequestResult = z.infer<typeof hrEmployeeManagerChangeRequestResultSchema>;
export type DecideHrEmployeeManagerChangeRequest = z.infer<typeof decideHrEmployeeManagerChangeRequestSchema>;
export type HrEmployeeManagerChangeDecisionResult = z.infer<typeof hrEmployeeManagerChangeDecisionResultSchema>;
export type HrEmployeeManagerChangeRequestDirectoryQuery = z.infer<
  typeof hrEmployeeManagerChangeRequestDirectoryQuerySchema
>;
export type HrEmployeeManagerChangeRequestReview = z.infer<typeof hrEmployeeManagerChangeRequestReviewSchema>;
export type HrEmployeeManagerChangeRequestDirectory = z.infer<typeof hrEmployeeManagerChangeRequestDirectorySchema>;
export type CreateHrEmployeeWorkLocationChangeRequest = z.infer<typeof createHrEmployeeWorkLocationChangeRequestSchema>;
export type HrEmployeeWorkLocationChangeRequestResult = z.infer<typeof hrEmployeeWorkLocationChangeRequestResultSchema>;
export type DecideHrEmployeeWorkLocationChangeRequest = z.infer<typeof decideHrEmployeeWorkLocationChangeRequestSchema>;
export type HrEmployeeWorkLocationChangeDecisionResult = z.infer<
  typeof hrEmployeeWorkLocationChangeDecisionResultSchema
>;
export type HrEmployeeWorkLocationChangeRequestDirectoryQuery = z.infer<
  typeof hrEmployeeWorkLocationChangeRequestDirectoryQuerySchema
>;
export type HrEmployeeWorkLocationChangeRequestReview = z.infer<typeof hrEmployeeWorkLocationChangeRequestReviewSchema>;
export type HrEmployeeWorkLocationChangeRequestDirectory = z.infer<
  typeof hrEmployeeWorkLocationChangeRequestDirectorySchema
>;
export type HrOrganizationPlacementSnapshot = z.infer<typeof hrOrganizationPlacementSnapshotSchema>;
export type CreateHrEmployeeOrganizationPlacementChangeRequest = z.infer<
  typeof createHrEmployeeOrganizationPlacementChangeRequestSchema
>;
export type HrEmployeeOrganizationPlacementChangeRequestResult = z.infer<
  typeof hrEmployeeOrganizationPlacementChangeRequestResultSchema
>;
export type DecideHrEmployeeOrganizationPlacementChangeRequest = z.infer<
  typeof decideHrEmployeeOrganizationPlacementChangeRequestSchema
>;
export type HrEmployeeOrganizationPlacementChangeDecisionResult = z.infer<
  typeof hrEmployeeOrganizationPlacementChangeDecisionResultSchema
>;
export type HrEmployeeOrganizationPlacementChangeRequestDirectoryQuery = z.infer<
  typeof hrEmployeeOrganizationPlacementChangeRequestDirectoryQuerySchema
>;
export type HrEmployeeOrganizationPlacementChangeRequestReview = z.infer<
  typeof hrEmployeeOrganizationPlacementChangeRequestReviewSchema
>;
export type HrEmployeeOrganizationPlacementChangeRequestDirectory = z.infer<
  typeof hrEmployeeOrganizationPlacementChangeRequestDirectorySchema
>;
