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

export const hrCandidateQuerySchema = z.strictObject({ company_id: identifier, search: z.string().trim().max(160).optional(), status: z.enum(["active", "archived"]).optional(), limit: z.number().int().min(1).max(100).default(50) });
export const hrCandidateSchema = z.strictObject({
  id: identifier, company_id: identifier, reference: z.string().min(1).max(32), display_name: z.string().min(1).max(201), email: z.string().email().max(320), phone: z.string().max(40),
  source: z.enum(["direct", "referral", "agency", "job_board", "other"]), status: z.enum(["active", "archived"]), created_at: z.string().datetime(),
});
export const hrCandidateDirectorySchema = z.strictObject({ items: z.array(hrCandidateSchema) });
export const createHrCandidateRequestSchema = z.strictObject({ company_id: identifier, first_name: z.string().trim().min(1).max(100), last_name: z.string().trim().min(1).max(100), email: z.string().trim().email().max(320), phone: z.string().trim().max(40).default(""), source: z.enum(["direct", "referral", "agency", "job_board", "other"]).default("direct") });
export const changeHrCandidateStatusRequestSchema = z.strictObject({ company_id: identifier, status: z.enum(["active", "archived"]) });
export const hrCandidateResultSchema = z.strictObject({ id: identifier, reference: z.string().min(1).max(32), status: z.enum(["active", "archived"]), company_id: identifier, audit_event_id: identifier, replayed: z.boolean() });
export type HrCandidateQuery = z.infer<typeof hrCandidateQuerySchema>;
export type HrCandidateDirectory = z.infer<typeof hrCandidateDirectorySchema>;
export type CreateHrCandidateRequest = z.infer<typeof createHrCandidateRequestSchema>;
export type ChangeHrCandidateStatusRequest = z.infer<typeof changeHrCandidateStatusRequestSchema>;
export type HrCandidateResult = z.infer<typeof hrCandidateResultSchema>;

export const hrApplicationStageSchema = z.enum(["application", "screening", "shortlisted", "interview", "evaluation", "selected", "hired", "rejected", "withdrawn"]);
export const hrApplicationTransitions: Readonly<Record<z.infer<typeof hrApplicationStageSchema>, readonly z.infer<typeof hrApplicationStageSchema>[]>> = {
  application: ["screening", "rejected", "withdrawn"], screening: ["shortlisted", "rejected", "withdrawn"], shortlisted: ["interview", "rejected", "withdrawn"],
  interview: ["evaluation", "rejected", "withdrawn"], evaluation: ["rejected", "withdrawn"], selected: ["rejected", "withdrawn"], hired: [], rejected: [], withdrawn: [],
};
export const hrApplicationQuerySchema = z.strictObject({ company_id: identifier, search: z.string().trim().max(160).optional(), stage: hrApplicationStageSchema.optional(), limit: z.number().int().min(1).max(100).default(100), offset: z.number().int().min(0).max(100000).default(0) });
export const hrApplicationSchema = z.strictObject({
  id: identifier, company_id: identifier, reference: z.string(), candidate_id: identifier, candidate_name: z.string(), candidate_email: z.string(), opening_id: identifier, opening_title: z.string(), opening_reference: z.string(),
  stage: hrApplicationStageSchema, created_at: z.string().datetime(), updated_at: z.string().datetime(),
  history: z.array(z.strictObject({ id: identifier, from_stage: hrApplicationStageSchema.nullable(), to_stage: hrApplicationStageSchema, reason: z.string(), actor_id: identifier, occurred_at: z.string().datetime() })),
});
export const hrApplicationDirectorySchema = z.strictObject({ items: z.array(hrApplicationSchema), total: z.number().int().min(0) });
export const createHrApplicationRequestSchema = z.strictObject({ company_id: identifier, candidate_id: identifier, opening_id: identifier });
export const changeHrApplicationStageRequestSchema = z.strictObject({ company_id: identifier, expected_stage: hrApplicationStageSchema, stage: hrApplicationStageSchema, reason: z.string().trim().min(1).max(1000) });
export const hrApplicationResultSchema = z.strictObject({ id: identifier, company_id: identifier, reference: z.string(), stage: hrApplicationStageSchema, audit_event_id: identifier, replayed: z.boolean() });
export type HrApplicationStage = z.infer<typeof hrApplicationStageSchema>;
export type HrApplicationQuery = z.infer<typeof hrApplicationQuerySchema>;
export type HrApplicationDirectory = z.infer<typeof hrApplicationDirectorySchema>;
export type CreateHrApplicationRequest = z.infer<typeof createHrApplicationRequestSchema>;
export type ChangeHrApplicationStageRequest = z.infer<typeof changeHrApplicationStageRequestSchema>;
export type HrApplicationResult = z.infer<typeof hrApplicationResultSchema>;

export const hrInterviewKindSchema = z.enum(["screening", "technical", "panel", "hr", "final"]);
export const hrInterviewTemplates = {
  screening: [{id:"fit",label:"Role fit",weight:40},{id:"communication",label:"Communication",weight:30},{id:"motivation",label:"Motivation",weight:30}],
  technical: [{id:"depth",label:"Technical depth",weight:40},{id:"problem",label:"Problem solving",weight:30},{id:"practice",label:"Engineering practice",weight:20},{id:"communication",label:"Communication",weight:10}],
  panel: [{id:"domain",label:"Domain expertise",weight:30},{id:"leadership",label:"Leadership",weight:30},{id:"stakeholder",label:"Stakeholder handling",weight:25},{id:"communication",label:"Communication",weight:15}],
  hr: [{id:"values",label:"Values alignment",weight:40},{id:"expectations",label:"Expectation alignment",weight:35},{id:"availability",label:"Availability",weight:25}],
  final: [{id:"overall",label:"Overall suitability",weight:50},{id:"growth",label:"Growth potential",weight:30},{id:"values",label:"Values alignment",weight:20}],
} as const;
export const hrRecruitmentEvidencePolicy = { version: "recruitment-v1", minimum_evaluators: 2, selection_threshold: 65 } as const;
export const hrInterviewWorkspaceQuerySchema = z.strictObject({company_id:identifier, application_id:identifier});
export const hrInterviewPanelQuerySchema = z.strictObject({company_id:identifier,search:z.string().trim().max(160).default(""),limit:z.number().int().min(1).max(100).default(100)});
export const hrInterviewPanelDirectorySchema = z.strictObject({items:z.array(z.strictObject({id:identifier,name:z.string()}))});
const interviewActionScope = {company_id:identifier,application_id:identifier};
const interviewActionReason = z.string().trim().min(1).max(1000);
const interviewScheduleFields = {starts_at:z.string().datetime({offset:true}),duration_minutes:z.number().int().min(15).max(240),mode:z.enum(["on_site","video","telephone"]),location:z.string().trim().min(1).max(300)};
export const hrInterviewActionRequestSchema = z.discriminatedUnion("action",[
  z.strictObject({...interviewActionScope,action:z.literal("schedule"),kind:hrInterviewKindSchema,...interviewScheduleFields,panel_user_ids:z.array(identifier).min(2).max(8).refine(ids=>new Set(ids).size===ids.length,"Panel members must be distinct.")}),
  z.strictObject({...interviewActionScope,action:z.literal("reschedule"),interview_id:identifier,expected_version:z.number().int().positive(),...interviewScheduleFields,reason:interviewActionReason}),
  z.strictObject({...interviewActionScope,action:z.enum(["complete","cancel","no_show"]),interview_id:identifier,expected_version:z.number().int().positive(),reason:interviewActionReason}),
  z.strictObject({...interviewActionScope,action:z.literal("evaluate"),interview_id:identifier,scores:z.record(z.string().min(1).max(40),z.number().int().min(1).max(5)),recommendation:z.enum(["strong_hire","hire","hold","no_hire"]),strengths:z.string().trim().min(1).max(2000),concerns:z.string().trim().min(1).max(2000)}),
  z.strictObject({...interviewActionScope,action:z.literal("assessment_add"),title:z.string().trim().min(1).max(160),mandatory:z.boolean(),reason:interviewActionReason}),
  z.strictObject({...interviewActionScope,action:z.literal("assessment_decide"),assessment_id:identifier,outcome:z.enum(["passed","failed"]),reason:interviewActionReason}),
  z.strictObject({...interviewActionScope,action:z.literal("select"),reason:interviewActionReason}),
]);
const evidenceTimestamp = z.string().datetime({offset:true});
export const hrInterviewWorkspaceSchema = z.strictObject({
  application:z.strictObject({id:identifier,reference:z.string(),candidate_name:z.string(),opening_title:z.string(),stage:hrApplicationStageSchema}),
  interviews:z.array(z.strictObject({id:identifier,kind:hrInterviewKindSchema,round:z.number().int(),starts_at:evidenceTimestamp,duration_minutes:z.number().int(),mode:z.enum(["on_site","video","telephone"]),location:z.string(),status:z.enum(["scheduled","completed","cancelled","no_show"]),version:z.number().int(),
    template:z.array(z.strictObject({id:z.string(),label:z.string(),weight:z.number()})),panel:z.array(z.strictObject({user_id:identifier,name:z.string()})),
    evaluations:z.array(z.strictObject({id:identifier,user_id:identifier,scores:z.record(z.string(),z.number()),weighted_score:z.number(),recommendation:z.enum(["strong_hire","hire","hold","no_hire"]),strengths:z.string(),concerns:z.string(),submitted_at:evidenceTimestamp})),
  })),
  assessments:z.array(z.strictObject({id:identifier,title:z.string(),mandatory:z.boolean(),status:z.enum(["pending","passed","failed"]),reason:z.string(),decided_by:identifier.nullable()})),
  history:z.array(z.strictObject({id:identifier,action:z.string(),reason:z.string(),actor_id:identifier,occurred_at:evidenceTimestamp})),
  readiness:z.strictObject({ready:z.boolean(),blockers:z.array(z.string()),average_score:z.number().nullable(),evaluators:z.number().int(),minimum_evaluators:z.number().int(),threshold:z.number(),policy_version:z.string()}),
});
export const hrInterviewActionResultSchema = z.strictObject({id:identifier,application_id:identifier,audit_event_id:identifier,replayed:z.boolean()});
export type HrInterviewWorkspaceQuery = z.infer<typeof hrInterviewWorkspaceQuerySchema>;
export type HrInterviewPanelQuery = z.infer<typeof hrInterviewPanelQuerySchema>;
export type HrInterviewPanelDirectory = z.infer<typeof hrInterviewPanelDirectorySchema>;
export type HrInterviewWorkspace = z.infer<typeof hrInterviewWorkspaceSchema>;
export type HrInterviewActionRequest = z.infer<typeof hrInterviewActionRequestSchema>;
export type HrInterviewActionResult = z.infer<typeof hrInterviewActionResultSchema>;

export const hrOfferStateSchema = z.enum(["draft","submitted","approved","generated","sent","accepted","declined","rejected","expired","withdrawn"]);
export const hrOfferQuerySchema = z.strictObject({company_id:identifier,search:z.string().trim().max(160).optional(),state:hrOfferStateSchema.optional(),limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().min(0).max(100000).default(0)});
export const hrOfferScopeQuerySchema = z.strictObject({company_id:identifier});
export const hrOfferContextQuerySchema = z.strictObject({company_id:identifier,application_id:identifier});
export const hrOfferContextSchema = z.strictObject({application_id:identifier,application_reference:z.string(),candidate_name:z.string(),company_name:z.string(),opening_id:identifier,opening_title:z.string(),opening_reference:z.string(),requisition_id:identifier,requisition_reference:z.string(),designation_id:identifier,designation:z.string(),job_grade_id:identifier,job_grade:z.string(),employment_type_id:identifier,employment_type:z.string(),branch_id:identifier,branch:z.string(),department_id:identifier,department:z.string(),salary_minimum:z.string(),salary_maximum:z.string(),currency_code:z.string(),positions_authorized:z.number().int(),positions_reserved:z.number().int(),today:isoDate,blockers:z.array(z.string())});
const hrOfferTermsFields = {proposed_gross:z.string().regex(/^\d{1,16}(?:\.\d{1,4})?$/).refine(value=>/[1-9]/.test(value),"Proposed gross must be positive."),joining_on:isoDate,valid_until:isoDate,probation_months:z.number().int().min(0).max(24),notice_days:z.number().int().min(0).max(365),cost_center_id:identifier,work_location_id:identifier,employee_category_id:identifier,reporting_manager_id:identifier.nullable().default(null),note:z.string().trim().max(2000).default(""),range_exception_reason:z.string().trim().max(1000).default("")};
export const createHrOfferRequestSchema = z.strictObject({company_id:identifier,application_id:identifier,...hrOfferTermsFields}).refine(value=>value.valid_until<=value.joining_on,"Offer validity must end on or before the joining date.");
export const updateHrOfferRequestSchema = z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),...hrOfferTermsFields}).refine(value=>value.valid_until<=value.joining_on,"Offer validity must end on or before the joining date.");
export const hrOfferActionRequestSchema = z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),action:z.enum(["submit","approve","reject_approval","generate","record_sent","accept","decline","withdraw","expire"]),reason:z.string().trim().min(1).max(1000),approve_range_exception:z.boolean().default(false),evidence_reference:z.string().trim().max(500).default(""),responded_on:isoDate.optional()}).superRefine((value,ctx)=>{
  if(["record_sent","accept","decline"].includes(value.action)&&!value.evidence_reference)ctx.addIssue({code:"custom",path:["evidence_reference"],message:"A delivery or candidate response reference is required."});
  if(["accept","decline"].includes(value.action)&&!value.responded_on)ctx.addIssue({code:"custom",path:["responded_on"],message:"The candidate response date is required."});
  if(value.approve_range_exception&&value.action!=="approve")ctx.addIssue({code:"custom",path:["approve_range_exception"],message:"Range exceptions can only be decided during approval."});
});
export const hrOfferSummarySchema = z.strictObject({id:identifier,reference:z.string(),company_id:identifier,application_id:identifier,application_reference:z.string(),candidate_name:z.string(),opening_title:z.string(),state:hrOfferStateSchema,version:z.number().int(),proposed_gross:z.string(),currency_code:z.string(),joining_on:isoDate,valid_until:isoDate,is_overdue:z.boolean(),outside_range:z.boolean(),created_at:z.string().datetime({offset:true})});
export const hrOfferDirectorySchema = z.strictObject({items:z.array(hrOfferSummarySchema),total:z.number().int()});
export const hrOfferDetailSchema = hrOfferSummarySchema.extend({context:hrOfferContextSchema,probation_months:z.number().int(),notice_days:z.number().int(),cost_center_id:identifier,cost_center:z.string(),work_location_id:identifier,work_location:z.string(),employee_category_id:identifier,employee_category:z.string(),reporting_manager_id:identifier.nullable(),reporting_manager:z.string().nullable(),note:z.string(),range_exception_reason:z.string(),created_by:identifier,submitted_by:identifier.nullable(),approved_by:identifier.nullable(),exception_approved_by:identifier.nullable(),approval_override_event_id:identifier.nullable(),document_text:z.string().nullable(),delivery_reference:z.string().nullable(),response_reference:z.string().nullable(),responded_on:isoDate.nullable(),history:z.array(z.strictObject({id:identifier,action:z.string(),from_state:hrOfferStateSchema.nullable(),to_state:hrOfferStateSchema,reason:z.string(),evidence_reference:z.string(),actor_id:identifier,actor_name:z.string(),occurred_at:z.string().datetime({offset:true})}))});
export const hrOfferResultSchema = z.strictObject({id:identifier,reference:z.string(),state:hrOfferStateSchema,version:z.number().int(),audit_event_id:identifier,replayed:z.boolean()});
export type HrOfferQuery = z.infer<typeof hrOfferQuerySchema>;
export type HrOfferContext = z.infer<typeof hrOfferContextSchema>;
export type HrOfferDirectory = z.infer<typeof hrOfferDirectorySchema>;
export type HrOfferDetail = z.infer<typeof hrOfferDetailSchema>;
export type CreateHrOfferRequest = z.infer<typeof createHrOfferRequestSchema>;
export type UpdateHrOfferRequest = z.infer<typeof updateHrOfferRequestSchema>;
export type HrOfferActionRequest = z.infer<typeof hrOfferActionRequestSchema>;
export type HrOfferResult = z.infer<typeof hrOfferResultSchema>;

export const createHrOfferEmployeeRequestSchema = z.strictObject({
  company_id: identifier,
  expected_version: z.number().int().positive(),
  employee_number: createHrEmployeeDraftRequestSchema.shape.employee_number,
  work_email: createHrEmployeeDraftRequestSchema.shape.work_email,
  reason: z.string().trim().min(8).max(1000),
});
export const hrOfferEmployeeResultSchema = hrEmployeeDraftResultSchema.extend({offer_id: identifier});
export const hrOfferEmployeeWorkspaceSchema = z.strictObject({
  offer: hrOfferDetailSchema,
  candidate: z.strictObject({id:identifier,first_name:z.string(),last_name:z.string(),email:z.string(),phone:z.string()}),
  application_stage: hrApplicationStageSchema,
  blockers: z.array(z.string()),
  handoff: z.strictObject({employee_id:identifier,employee_number:z.string(),employee_status:z.string(),profile_approval:z.string(),assignment_id:identifier.nullable(),hire_state:z.string().nullable(),created_at:z.string().datetime({offset:true}),created_by:z.string(),reason:z.string()}).nullable(),
});
export type CreateHrOfferEmployeeRequest = z.infer<typeof createHrOfferEmployeeRequestSchema>;
export type HrOfferEmployeeResult = z.infer<typeof hrOfferEmployeeResultSchema>;
export type HrOfferEmployeeWorkspace = z.infer<typeof hrOfferEmployeeWorkspaceSchema>;

export const hrShiftKindSchema = z.enum(["fixed", "multiple", "night", "rotating", "flexible"]);
export const hrShiftBreakSchema = z.strictObject({
  label: z.string().trim().min(1).max(80),
  minutes: z.number().int().min(1).max(720),
  paid: z.boolean(),
});
const hrShiftCommonFields = {
  company_id: identifier,
  code: createHrEmployeeDraftRequestSchema.shape.employee_number,
  name: z.string().trim().min(1).max(160),
  time_zone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine((value) => {
      try {
        if (value !== "UTC" && !value.includes("/")) return false;
        new Intl.DateTimeFormat("en", { timeZone: value });
        return true;
      } catch {
        return false;
      }
    }, "Select a valid IANA time zone."),
  work_location_id: identifier.nullable(),
  reason: z.string().trim().min(8).max(1000),
};
const hrShiftLeafFields = {
  kind: z.enum(["fixed", "multiple", "night", "flexible"]),
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(2879),
  required_work_minutes: z.number().int().min(1).max(1440),
  grace_in_minutes: z.number().int().min(0).max(720),
  grace_out_minutes: z.number().int().min(0).max(720),
  minimum_present_minutes: z.number().int().min(1).max(1439),
  half_day_minutes: z.number().int().min(1).max(1439),
  overtime_after_minutes: z.number().int().min(0).max(720),
  weekly_off_days: z
    .array(z.number().int().min(0).max(6))
    .max(6)
    .refine((days) => new Set(days).size === days.length, "Weekly off days must be distinct."),
  breaks: z.array(hrShiftBreakSchema).max(32),
};
const hrShiftRotationFields = {
  kind: z.literal("rotating"),
  rotation_anchor_date: isoDate.refine(
    (value) => new Date(value + "T00:00:00Z").getUTCDay() === 1,
    "The weekly rotation anchor must be a Monday.",
  ),
  rotation_shift_ids: z
    .array(identifier)
    .min(2)
    .max(52)
    .refine((ids) => new Set(ids).size >= 2, "A rotation needs at least two distinct shifts."),
};
function coherentHrShift(
  input: {
    kind: string;
    start_minute?: number;
    end_minute?: number;
    required_work_minutes?: number;
    grace_in_minutes?: number;
    grace_out_minutes?: number;
    minimum_present_minutes?: number;
    half_day_minutes?: number;
    breaks?: { minutes: number; paid: boolean }[];
  },
  ctx: z.RefinementCtx,
) {
  if (input.kind === "rotating") return;
  const span = input.end_minute! - input.start_minute!,
    breaks = input.breaks!.reduce((sum, b) => sum + b.minutes, 0),
    unpaid = input.breaks!.filter((b) => !b.paid).reduce((sum, b) => sum + b.minutes, 0),
    net = span - unpaid;
  const invalid = (message: string) => ctx.addIssue({ code: "custom", message });
  if (span <= 0 || span > 1440)
    invalid("A shift window must be greater than zero and no longer than 24 hours.");
  if (breaks >= span) invalid("Total breaks must be shorter than the shift window.");
  if (
    input.required_work_minutes! > net ||
    (input.kind !== "flexible" && input.required_work_minutes !== net)
  )
    invalid("Required work must match net shift minutes, or fit within the flexible window.");
  if (
    input.minimum_present_minutes! > input.half_day_minutes! ||
    input.half_day_minutes! > input.required_work_minutes!
  )
    invalid("Absent and half-day thresholds must not exceed the required work minutes.");
  if (input.kind === "night" && input.end_minute! < 1440)
    invalid("A night shift must end on the following day.");
  if (input.kind === "flexible" && (input.grace_in_minutes !== 0 || input.grace_out_minutes !== 0))
    invalid("Flexible shifts use required work minutes rather than arrival/departure grace.");
}
export const createHrShiftRequestSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({ ...hrShiftCommonFields, ...hrShiftLeafFields }),
    z.strictObject({ ...hrShiftCommonFields, ...hrShiftRotationFields }),
  ])
  .superRefine(coherentHrShift);
export const updateHrShiftRequestSchema = z
  .discriminatedUnion("kind", [
    z.strictObject({
      ...hrShiftCommonFields,
      ...hrShiftLeafFields,
      expected_version: z.number().int().positive(),
    }),
    z.strictObject({
      ...hrShiftCommonFields,
      ...hrShiftRotationFields,
      expected_version: z.number().int().positive(),
    }),
  ])
  .superRefine(coherentHrShift);
export const changeHrShiftStatusRequestSchema = z.strictObject({
  company_id: identifier,
  expected_version: z.number().int().positive(),
  status: z.enum(["active", "inactive"]),
  reason: z.string().trim().min(8).max(1000),
});
export const hrShiftQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  status: z.enum(["active", "inactive"]).optional(),
  leaf_only: z.boolean().default(false),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
});
export const hrShiftScopeQuerySchema = z.strictObject({
  company_id: identifier,
  on_date: isoDate.optional(),
});
export const hrShiftContextQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
});
export const hrShiftContextSchema = z.strictObject({
  locations: z.array(z.strictObject({ id: identifier, code: z.string(), name: z.string() })),
  time_zones: z.array(z.string()),
  locations_capped: z.boolean(),
});
export type HrShiftContext = z.infer<typeof hrShiftContextSchema>;
export const hrShiftSummarySchema = z.strictObject({
  id: identifier,
  company_id: identifier,
  code: z.string(),
  name: z.string(),
  kind: hrShiftKindSchema,
  status: z.enum(["active", "inactive"]),
  version: z.number().int().positive(),
  time_zone: z.string().nullable(),
  work_location_id: identifier.nullable(),
  work_location: z.string().nullable(),
  start_minute: z.number().int(),
  end_minute: z.number().int(),
  required_work_minutes: z.number().int().nullable(),
  net_minutes: z.number().int(),
  grace_in_minutes: z.number().int(),
  grace_out_minutes: z.number().int(),
  minimum_present_minutes: z.number().int(),
  half_day_minutes: z.number().int(),
  overtime_after_minutes: z.number().int(),
  weekly_off_days: z.array(z.number().int()),
  rotation_anchor_date: isoDate.nullable(),
  configured: z.boolean(),
  rules_locked: z.boolean(),
});
export const hrShiftDirectorySchema = z.strictObject({
  items: z.array(hrShiftSummarySchema),
  total: z.number().int().nonnegative(),
});
export const hrShiftDetailSchema = hrShiftSummarySchema.extend({
  breaks: z.array(hrShiftBreakSchema),
  rotation: z.array(z.strictObject({ position: z.number().int(), shift: hrShiftSummarySchema })),
  preview_date: isoDate,
  resolved: hrShiftSummarySchema.nullable(),
  history: z.array(
    z.strictObject({
      id: identifier,
      action: z.string(),
      version: z.number().int(),
      reason: z.string(),
      actor_name: z.string(),
      occurred_at: z.string().datetime({ offset: true }),
    }),
  ),
});
export const hrShiftResultSchema = z.strictObject({
  id: identifier,
  code: z.string(),
  version: z.number().int(),
  status: z.enum(["active", "inactive"]),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export type CreateHrShiftRequest = z.infer<typeof createHrShiftRequestSchema>;
export type UpdateHrShiftRequest = z.infer<typeof updateHrShiftRequestSchema>;
export type ChangeHrShiftStatusRequest = z.infer<typeof changeHrShiftStatusRequestSchema>;
export type HrShiftQuery = z.infer<typeof hrShiftQuerySchema>;
export type HrShiftSummary = z.infer<typeof hrShiftSummarySchema>;
export type HrShiftDirectory = z.infer<typeof hrShiftDirectorySchema>;
export type HrShiftDetail = z.infer<typeof hrShiftDetailSchema>;
export type HrShiftResult = z.infer<typeof hrShiftResultSchema>;

export const hrDailyAttendanceQuerySchema = z.strictObject({
  company_id: identifier,
  on_date: isoDate,
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
});
export const hrDailyAttendanceStatusSchema = z.enum(["present", "half_day", "absent", "partial_leave", "on_leave", "off_day", "holiday", "scheduled", "in_progress", "needs_review", "official_duty"]);
export const hrDailyAttendanceRowSchema = z.strictObject({
  employee_id: identifier, employee_number: z.string(), display_name: z.string(), department: z.string().nullable(),
  shift_id: identifier.nullable(), shift_name: z.string().nullable(), allocation_scope: z.enum(["employee","department","branch"]).nullable(),
  time_zone: z.string().nullable(), scheduled_start: z.string().nullable(), scheduled_end: z.string().nullable(),
  status: hrDailyAttendanceStatusSchema, first_in: z.string().nullable(), last_out: z.string().nullable(),
  worked_minutes: z.number().int().nonnegative(), late_minutes: z.number().int().nonnegative(),
  potential_overtime_minutes: z.number().int().nonnegative(), approved_overtime_minutes: z.number().int().nonnegative(),
  leave_days: z.string(), correction_applied: z.boolean(), punch_count: z.number().int().nonnegative(),
  issues: z.array(z.string()),
  punches: z.array(z.strictObject({direction:z.enum(["in","out"]),occurred_at:z.string(),source:z.string()})).nullable(),
});
export const hrDailyAttendanceDirectorySchema = z.strictObject({
  company_id: identifier, on_date: isoDate, generated_at: z.string(), period_state: z.string().nullable(),
  total: z.number().int().nonnegative(), items: z.array(hrDailyAttendanceRowSchema),
  can_read_punches: z.boolean(),
});
export type HrDailyAttendanceQuery = z.infer<typeof hrDailyAttendanceQuerySchema>;
export type HrDailyAttendanceRow = z.infer<typeof hrDailyAttendanceRowSchema>;
export type HrDailyAttendanceDirectory = z.infer<typeof hrDailyAttendanceDirectorySchema>;

export const hrMonthlyAttendanceQuerySchema = z.strictObject({
  company_id: identifier,
  month: isoDate.refine(v => v.endsWith("-01") && v >= "1900-01-01" && v <= "2199-12-01", "Choose the first day of a supported month."),
  search: z.string().trim().max(160).optional(),
  limit: z.number().int().min(1).max(50).default(25),
  offset: z.number().int().min(0).max(100000).default(0),
});
export const hrMonthlyAttendanceDaySchema = hrDailyAttendanceRowSchema.pick({
  status:true,worked_minutes:true,late_minutes:true,leave_days:true,shift_name:true,issues:true,
  correction_applied:true,potential_overtime_minutes:true,approved_overtime_minutes:true,
}).extend({on_date:isoDate});
export const hrMonthlyAttendanceRowSchema = z.strictObject({
  employee_id:identifier,employee_number:z.string(),display_name:z.string(),departments:z.array(z.string()),
  covered_days:z.number().int().nonnegative(),
  counts:z.record(hrDailyAttendanceStatusSchema,z.number().int().nonnegative()),
  worked_minutes:z.number().int().nonnegative(),late_minutes:z.number().int().nonnegative(),
  approved_leave_days:z.string(),potential_overtime_minutes:z.number().int().nonnegative(),approved_overtime_minutes:z.number().int().nonnegative(),
  correction_days:z.number().int().nonnegative(),days:z.array(hrMonthlyAttendanceDaySchema),
  finalized_input:z.strictObject({calendar_days:z.string(),paid_days:z.string(),unpaid_days:z.string(),present_days:z.string(),absent_days:z.string(),approved_leave_days:z.string(),evidence_version:z.string(),created_at:z.string()}).nullable(),
});
export const hrMonthlyAttendanceDirectorySchema = z.strictObject({
  company_id:identifier,month:isoDate,through_date:isoDate,generated_at:z.string(),
  period_state:z.string().nullable(),snapshot_access:z.boolean(),total:z.number().int().nonnegative(),items:z.array(hrMonthlyAttendanceRowSchema),
});
export type HrMonthlyAttendanceQuery = z.infer<typeof hrMonthlyAttendanceQuerySchema>;
export type HrMonthlyAttendanceRow = z.infer<typeof hrMonthlyAttendanceRowSchema>;
export type HrMonthlyAttendanceDirectory = z.infer<typeof hrMonthlyAttendanceDirectorySchema>;

export const hrCorrectionStatusSchema=z.enum(["draft","pending_manager","pending_hr","approved","rejected","cancelled"]);
export const hrCorrectionKindSchema=z.enum(["missing_in","missing_out","incorrect_attendance","official_duty"]);
export const hrCorrectionQuerySchema=z.strictObject({company_id:identifier,search:z.string().trim().max(160).optional(),status:hrCorrectionStatusSchema.optional(),limit:z.number().int().min(1).max(100).default(50),offset:z.number().int().min(0).max(100000).default(0)});
export const hrCorrectionContextQuerySchema=z.strictObject({company_id:identifier,on_date:isoDate,employee_id:identifier.optional(),search:z.string().trim().max(160).optional()});
const correctionTerms={kind:hrCorrectionKindSchema,stated_in:z.string().datetime({offset:true}).nullable(),stated_out:z.string().datetime({offset:true}).nullable(),reason:z.string().trim().min(8).max(1000)};
function coherentCorrection(value:{kind:string;stated_in:string|null;stated_out:string|null},ctx:z.RefinementCtx){
 if((value.kind==="missing_in" && (!value.stated_in||value.stated_out))||(value.kind==="missing_out" && (!value.stated_out||value.stated_in))||(value.kind==="incorrect_attendance" && (!value.stated_in||!value.stated_out))||(value.kind==="official_duty"&&(value.stated_in||value.stated_out)))ctx.addIssue({code:"custom",message:"Supply only the timestamps required for this correction type."});
 if(value.stated_in&&value.stated_out&&(Date.parse(value.stated_out)<=Date.parse(value.stated_in)||Date.parse(value.stated_out)-Date.parse(value.stated_in)>86400000))ctx.addIssue({code:"custom",message:"Stated out must follow stated in within 24 hours."});
}
export const createHrCorrectionRequestSchema=z.strictObject({company_id:identifier,employee_id:identifier,work_date:isoDate,...correctionTerms,expected_evidence_hash:z.string().regex(/^[a-f0-9]{64}$/)}).superRefine(coherentCorrection);
export const updateHrCorrectionRequestSchema=z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),...correctionTerms,expected_evidence_hash:z.string().regex(/^[a-f0-9]{64}$/)}).superRefine(coherentCorrection);
export const hrCorrectionActionSchema=z.enum(["submit","cancel","manager_approve","manager_reject","hr_approve","hr_reject"]);
export const hrCorrectionActionRequestSchema=z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),action:hrCorrectionActionSchema,reason:z.string().trim().min(8).max(1000),expected_evidence_hash:z.string().regex(/^[a-f0-9]{64}$/).nullable(),override_self_approval:z.boolean().default(false)});
export const hrCorrectionSummarySchema=z.strictObject({id:identifier,reference:z.string(),company_id:identifier,employee_id:identifier,employee_number:z.string(),display_name:z.string(),work_date:isoDate,kind:hrCorrectionKindSchema,stated_in:z.string().nullable(),stated_out:z.string().nullable(),reason:z.string(),status:hrCorrectionStatusSchema,version:z.number().int().positive(),workflow_managed:z.boolean(),requested_by:identifier,requested_by_name:z.string(),submitted_by:identifier.nullable(),manager_user_id:identifier.nullable(),manager_name:z.string().nullable(),manager_decided_by:identifier.nullable(),hr_decided_by:identifier.nullable(),decision_comment:z.string(),review_source_hash:z.string().nullable(),subject_user_ids:z.array(identifier),created_at:z.string(),updated_at:z.string()});
export const hrCorrectionEvidenceSchema=z.strictObject({hash:z.string(),on_date:isoDate,employee_id:identifier,assignment_id:identifier,manager_employee_id:identifier.nullable(),manager_user_id:identifier.nullable(),manager_name:z.string().nullable(),subject_user_ids:z.array(identifier),period_locked:z.boolean(),today:isoDate,day:hrDailyAttendanceRowSchema,blockers:z.array(z.string())});
export const hrCorrectionContextSchema=z.strictObject({today:isoDate,employees:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string()})),employees_capped:z.boolean(),evidence:hrCorrectionEvidenceSchema.nullable()});
export const hrCorrectionDirectorySchema=z.strictObject({items:z.array(hrCorrectionSummarySchema),total:z.number().int().nonnegative()});
export const hrCorrectionDetailSchema=hrCorrectionSummarySchema.extend({evidence:hrCorrectionEvidenceSchema.nullable(),evidence_unavailable:z.string().nullable(),evidence_changed:z.boolean(),allowed_actions:z.array(hrCorrectionActionSchema),can_edit:z.boolean(),self_decision_requires_override:z.boolean(),override_allowed:z.boolean(),history:z.array(z.strictObject({id:identifier,action:z.string(),version:z.number().int(),reason:z.string(),actor_name:z.string(),source_hash:z.string().nullable(),override_event_id:identifier.nullable(),occurred_at:z.string()}))});
export const hrCorrectionResultSchema=z.strictObject({id:identifier,reference:z.string(),company_id:identifier,version:z.number().int(),status:hrCorrectionStatusSchema,audit_event_id:identifier,replayed:z.boolean()});
export type HrCorrectionQuery=z.infer<typeof hrCorrectionQuerySchema>;
export type HrCorrectionContextQuery=z.infer<typeof hrCorrectionContextQuerySchema>;
export type HrCorrectionContext=z.infer<typeof hrCorrectionContextSchema>;
export type CreateHrCorrectionRequest=z.infer<typeof createHrCorrectionRequestSchema>;
export type UpdateHrCorrectionRequest=z.infer<typeof updateHrCorrectionRequestSchema>;
export type HrCorrectionActionRequest=z.infer<typeof hrCorrectionActionRequestSchema>;
export type HrCorrectionSummary=z.infer<typeof hrCorrectionSummarySchema>;
export type HrCorrectionDirectory=z.infer<typeof hrCorrectionDirectorySchema>;
export type HrCorrectionDetail=z.infer<typeof hrCorrectionDetailSchema>;
export type HrCorrectionEvidence=z.infer<typeof hrCorrectionEvidenceSchema>;
export type HrCorrectionResult=z.infer<typeof hrCorrectionResultSchema>;

export const hrShiftAllocationScopeSchema = z.enum(["employee", "department", "branch"]);
export const hrShiftAllocationStateSchema = z.enum(["active", "scheduled", "ended", "cancelled"]);
export const hrShiftAllocationQuerySchema = z.strictObject({
  company_id: identifier,
  search: z.string().trim().max(160).optional(),
  scope: hrShiftAllocationScopeSchema.optional(),
  scope_id: identifier.optional(),
  on_date: isoDate.optional(),
  state: hrShiftAllocationStateSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).max(100000).default(0),
});
export const hrShiftAllocationContextQuerySchema = z.strictObject({
  company_id: identifier,
  scope: hrShiftAllocationScopeSchema,
  on_date: isoDate,
  search: z.string().trim().max(160).optional(),
});
export const hrShiftAllocationContextSchema = z.strictObject({
  today: isoDate,
  targets: z.array(z.strictObject({ id: identifier, code: z.string(), name: z.string() })),
  capped: z.boolean(),
});
export const createHrShiftAllocationRequestSchema = z
  .strictObject({
    company_id: identifier,
    scope: hrShiftAllocationScopeSchema,
    scope_id: identifier,
    shift_id: identifier,
    effective_from: isoDate,
    effective_to: isoDate.nullable(),
    reason: z.string().trim().min(8).max(1000),
    replace_assignment_id: identifier.nullable().default(null),
    expected_replace_version: z.number().int().positive().nullable().default(null),
  })
  .superRefine((v, c) => {
    if (v.effective_to && v.effective_to < v.effective_from)
      c.addIssue({ code: "custom", message: "End date must be on or after the start date." });
    if ((v.replace_assignment_id === null) !== (v.expected_replace_version === null))
      c.addIssue({
        code: "custom",
        message: "A replacement requires the previous allocation and its version.",
      });
  });
export const closeHrShiftAllocationRequestSchema = z
  .strictObject({
    company_id: identifier,
    expected_version: z.number().int().positive(),
    action: z.enum(["close", "cancel"]),
    effective_to: isoDate.nullable(),
    reason: z.string().trim().min(8).max(1000),
  })
  .superRefine((v, c) => {
    if ((v.action === "close") !== (v.effective_to !== null))
      c.addIssue({ code: "custom", message: "Closing requires an end date; cancellation does not." });
  });
export const hrShiftAllocationSummarySchema = z.strictObject({
  id: identifier,
  reference: z.string(),
  company_id: identifier,
  scope: hrShiftAllocationScopeSchema,
  scope_id: identifier,
  scope_name: z.string(),
  scope_code: z.string(),
  shift_id: identifier,
  shift_code: z.string(),
  shift_name: z.string(),
  time_zone: z.string().nullable(),
  work_location_id: identifier.nullable(),
  work_location: z.string().nullable(),
  effective_from: isoDate,
  effective_to: isoDate.nullable(),
  version: z.number().int().positive(),
  state: hrShiftAllocationStateSchema,
  note: z.string(),
  replaces_assignment_id: identifier.nullable(),
  created_at: z.string().datetime({ offset: true }),
});
export const hrShiftAllocationDirectorySchema = z.strictObject({
  items: z.array(hrShiftAllocationSummarySchema),
  total: z.number().int().nonnegative(),
});
export const hrShiftAllocationDetailSchema = hrShiftAllocationSummarySchema.extend({
  history: z.array(
    z.strictObject({
      id: identifier,
      action: z.string(),
      version: z.number().int(),
      reason: z.string(),
      actor_name: z.string(),
      related_reference: z.string().nullable(),
      occurred_at: z.string().datetime({ offset: true }),
    }),
  ),
});
export const hrShiftAllocationResultSchema = z.strictObject({
  id: identifier,
  reference: z.string(),
  version: z.number().int(),
  state: hrShiftAllocationStateSchema,
  replaced_assignment_id: identifier.nullable(),
  audit_event_id: identifier,
  replayed: z.boolean(),
});
export const hrShiftResolutionQuerySchema = z.strictObject({
  company_id: identifier,
  employee_id: identifier,
  on_date: isoDate,
});
export const hrShiftResolutionSchema = z.strictObject({
  company_id: identifier,
  on_date: isoDate,
  employee: z.strictObject({ id: identifier, employee_number: z.string(), display_name: z.string() }),
  operational_assignment_id: identifier.nullable(),
  contenders: z.array(hrShiftAllocationSummarySchema),
  winning_assignment_id: identifier.nullable(),
  resolved_shift: hrShiftSummarySchema.nullable(),
  blockers: z.array(z.string()),
});
export type HrShiftAllocationQuery = z.infer<typeof hrShiftAllocationQuerySchema>;
export type HrShiftAllocationContextQuery = z.infer<typeof hrShiftAllocationContextQuerySchema>;
export type HrShiftAllocationContext = z.infer<typeof hrShiftAllocationContextSchema>;
export type CreateHrShiftAllocationRequest = z.infer<typeof createHrShiftAllocationRequestSchema>;
export type CloseHrShiftAllocationRequest = z.infer<typeof closeHrShiftAllocationRequestSchema>;
export type HrShiftAllocationSummary = z.infer<typeof hrShiftAllocationSummarySchema>;
export type HrShiftAllocationDirectory = z.infer<typeof hrShiftAllocationDirectorySchema>;
export type HrShiftAllocationDetail = z.infer<typeof hrShiftAllocationDetailSchema>;
export type HrShiftAllocationResult = z.infer<typeof hrShiftAllocationResultSchema>;
export type HrShiftResolutionQuery = z.infer<typeof hrShiftResolutionQuerySchema>;
export type HrShiftResolution = z.infer<typeof hrShiftResolutionSchema>;

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

// Connected attendance completion: operational hours, period review and frozen payroll inputs.
export const hrOvertimeQuerySchema = z.strictObject({ company_id: identifier, month: isoDate.refine(v=>v.endsWith('-01'),'Use the first day of the month'), search: z.string().trim().max(100).optional(), limit: z.coerce.number().int().min(1).max(50).default(25), offset: z.coerce.number().int().min(0).max(100000).default(0) });
export const hrOvertimeContextQuerySchema = z.strictObject({company_id:identifier,on_date:isoDate,employee_id:identifier.optional(),search:z.string().trim().max(100).optional()});
export const hrOvertimeRuleRequestSchema=z.strictObject({company_id:identifier,category:z.enum(['regular','weekend','holiday']),effective_from:isoDate,effective_to:isoDate.nullable(),minimum_minutes:z.number().int().min(0).max(1439),daily_cap_minutes:z.number().int().min(1).max(1440),reason:z.string().trim().min(8).max(1000)}).refine(v=>v.daily_cap_minutes>v.minimum_minutes&&(!v.effective_to||v.effective_to>=v.effective_from),'Review the effective dates and minute limits');
export const hrOvertimeRuleSchema=z.strictObject({id:identifier,category:z.enum(['regular','weekend','holiday']),version_number:z.number().int(),effective_from:isoDate,effective_to:isoDate.nullable(),minimum_minutes:z.number().int(),daily_cap_minutes:z.number().int(),evidence_hash:z.string().nullable()});
export const hrOvertimeEvidenceSchema=z.strictObject({hash:z.string(),attendance:hrCorrectionEvidenceSchema,category:z.enum(['regular','weekend','holiday']),eligible_minutes:z.number().int(),rule:hrOvertimeRuleSchema.nullable(),blockers:z.array(z.string())});
export const hrOvertimeContextSchema=z.strictObject({employees:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string()})),employees_capped:z.boolean(),rules:z.array(hrOvertimeRuleSchema),evidence:hrOvertimeEvidenceSchema.nullable(),can_manage_rules:z.boolean()});
export const createHrOvertimeRequestSchema=z.strictObject({company_id:identifier,employee_id:identifier,work_date:isoDate,requested_minutes:z.number().int().min(1).max(1440),reason:z.string().trim().min(8).max(1000),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/)});
export const hrOvertimeActionRequestSchema=z.strictObject({company_id:identifier,action:z.enum(['submit','cancel','manager_approve','manager_reject','hr_approve','hr_reject']),expected_version:z.number().int().positive(),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/).optional(),approved_minutes:z.number().int().min(1).max(1440).optional(),reason:z.string().trim().min(8).max(1000),override_self_approval:z.boolean().default(false)});
export const hrAttendanceCompletionResultSchema=z.strictObject({id:identifier,company_id:identifier,version:z.number().int(),status:z.string(),audit_event_id:identifier,replayed:z.boolean()});
export const hrOvertimeSummarySchema=z.strictObject({id:identifier,reference:z.string(),company_id:identifier,employee_id:identifier,employee_number:z.string(),display_name:z.string(),work_date:isoDate,category:z.enum(['regular','weekend','holiday']),requested_minutes:z.number().int(),approved_minutes:z.number().int().nullable(),reason:z.string(),status:z.string(),version:z.number().int(),workflow_managed:z.boolean(),requested_by:identifier,submitted_by:identifier.nullable(),manager_user_id:identifier.nullable(),manager_decided_by:identifier.nullable(),hr_decided_by:identifier.nullable(),subject_user_ids:z.array(z.string()),review_source_hash:z.string().nullable()});
export const hrAttendanceCompletionHistorySchema=z.strictObject({action:z.string(),reason:z.string(),actor_name:z.string(),occurred_at:z.string(),source_hash:z.string().nullable(),override_event_id:z.string().nullable()});
export const hrOvertimeDetailSchema=hrOvertimeSummarySchema.extend({evidence:hrOvertimeEvidenceSchema.nullable(),evidence_unavailable:z.string().nullable(),allowed_actions:z.array(hrOvertimeActionRequestSchema.shape.action),self_decision_requires_override:z.boolean(),history:z.array(hrAttendanceCompletionHistorySchema)});
export const hrOvertimeDirectorySchema=z.strictObject({items:z.array(hrOvertimeSummarySchema),total:z.number().int()});
export const hrAttendancePeriodQuerySchema=hrOvertimeQuerySchema.omit({search:true});
export const hrAttendancePeriodActionRequestSchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01'),'Use the first day of the month'),action:z.enum(['open','process','lock']),expected_version:z.number().int().min(0),expected_source_hash:z.string().regex(/^[0-9a-f]{64}$/).optional(),reason:z.string().trim().min(8).max(1000),override_self_approval:z.boolean().default(false)});
export const hrAttendanceCloseDaySchema=z.strictObject({on_date:isoDate,status:z.string(),shift_id:z.string().nullable(),time_zone:z.string().nullable(),worked_minutes:z.number().int(),paid_days:z.string(),unpaid_days:z.string(),approved_leave_days:z.string(),unpaid_leave_days:z.string(),present_days:z.string(),absent_days:z.string(),correction_ids:z.array(z.string()),overtime:z.array(z.strictObject({id:z.string(),category:z.enum(['regular','weekend','holiday']),minutes:z.number().int(),operational_rule_id:z.string().nullable()})),leave_ids:z.array(z.string()),issues:z.array(z.string())});
export const hrAttendanceCloseEmployeeSchema=z.strictObject({employee_id:identifier,employee_number:z.string(),display_name:z.string(),calendar_days:z.string(),paid_days:z.string(),unpaid_days:z.string(),approved_leave_days:z.string(),unpaid_leave_days:z.string(),present_days:z.string(),absent_days:z.string(),overtime_regular_minutes:z.number().int(),overtime_weekend_minutes:z.number().int(),overtime_holiday_minutes:z.number().int(),correction_count:z.number().int(),source_hash:z.string(),exception_count:z.number().int(),days:z.array(hrAttendanceCloseDaySchema)});
export const hrAttendancePeriodSchema=z.strictObject({id:identifier,company_id:identifier,month:isoDate,state:z.enum(['open','processing','exceptions','hr_review','locked']),version:z.number().int(),opened_by:identifier,submitted_by:identifier.nullable(),locked_by:identifier.nullable(),locked_at:z.string().nullable(),source_hash:z.string().nullable(),review_hash:z.string().nullable(),employee_count:z.number().int(),exception_count:z.number().int(),processed_at:z.string().nullable()});
export const hrAttendancePeriodWorkspaceSchema=z.strictObject({period:hrAttendancePeriodSchema.nullable(),items:z.array(hrAttendanceCloseEmployeeSchema),total:z.number().int(),allowed_actions:z.array(z.enum(['open','process','lock'])),self_decision_requires_override:z.boolean(),history:z.array(hrAttendanceCompletionHistorySchema)});
export const hrAttendancePayrollInputsSchema=z.strictObject({period:hrAttendancePeriodSchema.nullable(),items:z.array(hrAttendanceCloseEmployeeSchema),total:z.number().int(),locked:z.boolean()});
export type HrOvertimeQuery=z.infer<typeof hrOvertimeQuerySchema>;
export type HrOvertimeContextQuery=z.infer<typeof hrOvertimeContextQuerySchema>;
export type HrOvertimeRuleRequest=z.infer<typeof hrOvertimeRuleRequestSchema>;
export type HrOvertimeRule=z.infer<typeof hrOvertimeRuleSchema>;
export type HrOvertimeEvidence=z.infer<typeof hrOvertimeEvidenceSchema>;
export type HrOvertimeContext=z.infer<typeof hrOvertimeContextSchema>;
export type CreateHrOvertimeRequest=z.infer<typeof createHrOvertimeRequestSchema>;
export type HrOvertimeActionRequest=z.infer<typeof hrOvertimeActionRequestSchema>;
export type HrAttendanceCompletionResult=z.infer<typeof hrAttendanceCompletionResultSchema>;
export type HrOvertimeSummary=z.infer<typeof hrOvertimeSummarySchema>;
export type HrOvertimeDetail=z.infer<typeof hrOvertimeDetailSchema>;
export type HrOvertimeDirectory=z.infer<typeof hrOvertimeDirectorySchema>;
export type HrAttendancePeriodQuery=z.infer<typeof hrAttendancePeriodQuerySchema>;
export type HrAttendancePeriodActionRequest=z.infer<typeof hrAttendancePeriodActionRequestSchema>;
export type HrAttendanceCloseDay=z.infer<typeof hrAttendanceCloseDaySchema>;
export type HrAttendanceCloseEmployee=z.infer<typeof hrAttendanceCloseEmployeeSchema>;
export type HrAttendancePeriod=z.infer<typeof hrAttendancePeriodSchema>;
export type HrAttendancePeriodWorkspace=z.infer<typeof hrAttendancePeriodWorkspaceSchema>;
export type HrAttendancePayrollInputs=z.infer<typeof hrAttendancePayrollInputsSchema>;

// Time & Leave: exact day quantities and governed shared authorities.
const leaveDate=isoDate.refine(v=>v>='1900-01-01'&&v<='2199-12-31','Use a date from 1900 to 2199');
const leaveQuantity=z.string().regex(/^\d{1,4}(\.\d{1,4})?$/,'Use up to four decimal places');
const leaveSignedQuantity=z.string().regex(/^-?\d{1,4}(\.\d{1,4})?$/,'Use a signed day quantity with up to four decimal places');
export const hrLeaveQuerySchema=z.strictObject({company_id:identifier,as_of:leaveDate,search:z.string().trim().max(100).optional(),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrLeavePolicyInputSchema=z.strictObject({effective_from:leaveDate,annual_entitlement_days:leaveQuantity,accrual_method:z.enum(['annual_grant','monthly_accrual','on_completion']),carry_forward:z.boolean(),maximum_carry_forward_days:leaveQuantity,maximum_balance_days:leaveQuantity,minimum_request_days:leaveQuantity,maximum_request_days:leaveQuantity,requires_hr_approval:z.boolean(),applicable_category_ids:z.array(identifier).max(100),applicable_genders:z.array(z.enum(['female','male','other','undisclosed'])).max(4),document_required_after_days:leaveQuantity.nullable()}).refine(v=>Number(v.minimum_request_days)>0&&Number(v.maximum_request_days)>=Number(v.minimum_request_days),'Review minimum and maximum request days').refine(v=>v.carry_forward?Number(v.maximum_carry_forward_days)>0&&Number(v.maximum_carry_forward_days)<=Number(v.maximum_balance_days):Number(v.maximum_carry_forward_days)===0,'Review carry-forward and balance limits');
export const createHrLeaveTypeRequestSchema=z.strictObject({company_id:identifier,code:z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),name:z.string().trim().min(1).max(160),paid:z.boolean(),policy:hrLeavePolicyInputSchema,reason:z.string().trim().min(12).max(1000)}).refine(v=>v.paid||(Number(v.policy.annual_entitlement_days)===0&&v.policy.requires_hr_approval),'Unpaid leave has zero paid entitlement and requires HR approval');
export const updateHrLeavePolicyRequestSchema=z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),policy:hrLeavePolicyInputSchema,reason:z.string().trim().min(12).max(1000)});
export const hrLeaveTypeStatusRequestSchema=z.strictObject({company_id:identifier,expected_version:z.number().int().positive(),status:z.enum(['active','inactive']),reason:z.string().trim().min(12).max(1000)});
export const hrLeavePolicySchema=hrLeavePolicyInputSchema.safeExtend({effective_from:isoDate,id:identifier,version_number:z.number().int(),effective_to:isoDate.nullable(),automation_ready:z.boolean()});
export const hrLeaveTypeSchema=z.strictObject({id:identifier,company_id:identifier,code:z.string(),name:z.string(),paid:z.boolean(),status:z.enum(['active','inactive']),version:z.number().int(),policy:hrLeavePolicySchema.nullable()});
export const hrLeaveTypeDirectorySchema=z.strictObject({items:z.array(hrLeaveTypeSchema),total:z.number().int(),categories:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string()}))});
export const hrLeavePortionSchema=z.enum(['full','first_half','second_half']);
export const hrLeaveAllocationSchema=z.strictObject({on_date:leaveDate,portion:hrLeavePortionSchema});
export const hrLeaveContextQuerySchema=z.strictObject({company_id:identifier,from_date:leaveDate,to_date:leaveDate,employee_id:identifier.optional(),leave_type_id:identifier.optional(),request_id:identifier.optional(),document_id:identifier.optional(),search:z.string().trim().max(100).optional()}).refine(v=>v.to_date>=v.from_date&&Date.parse(v.to_date)-Date.parse(v.from_date)<=61*86400000,'Select an ordered date range of at most 62 calendar days');
export const hrLeaveBalanceSchema=z.strictObject({encashed:z.string().default('0.0000'),employee_id:identifier,employee_number:z.string(),display_name:z.string(),leave_type_id:identifier,leave_type:z.string(),paid:z.boolean(),as_of:isoDate,opening:z.string(),accrued:z.string(),carried:z.string(),adjusted:z.string(),expired:z.string(),used:z.string(),balance:z.string(),reserved:z.string(),future_used:z.string(),available:z.string(),hash:z.string()});
export const hrLeaveBalanceQuerySchema=hrLeaveQuerySchema.extend({employee_id:identifier.optional(),leave_type_id:identifier.optional()});
export const hrLeaveBalanceDirectorySchema=z.strictObject({items:z.array(hrLeaveBalanceSchema),total:z.number().int()});
export const hrLeaveLedgerQuerySchema=z.strictObject({company_id:identifier,employee_id:identifier,leave_type_id:identifier,as_of:leaveDate,limit:z.coerce.number().int().min(1).max(100).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrLeaveLedgerSchema=z.strictObject({balance:hrLeaveBalanceSchema,items:z.array(z.strictObject({id:identifier,effective_on:isoDate,kind:z.string(),days:z.string(),reason:z.string(),source_type:z.string(),source_id:z.string(),policy_version_id:identifier.nullable(),actor_name:z.string(),created_at:z.string()})),total:z.number().int()});
export const hrLeaveBalancePostingRequestSchema=z.strictObject({company_id:identifier,employee_id:identifier,leave_type_id:identifier,effective_on:leaveDate,kind:z.enum(['opening','accrual','carry_forward','adjustment','expiry']),days:leaveSignedQuantity,period_start:leaveDate.nullable(),period_end:leaveDate.nullable(),expected_balance_hash:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(12).max(1000)}).refine(v=>Number(v.days)!==0&&((v.period_start===null&&v.period_end===null)||(v.period_start!==null&&v.period_end!==null&&v.period_end>=v.period_start)),'Use a non-zero quantity and a complete ordered period');
export const hrLeaveContextDaySchema=z.strictObject({on_date:isoDate,chargeable:z.boolean(),status:z.string(),shift_name:z.string().nullable(),punch_count:z.number().int(),worked_minutes:z.number().int(),first_in:z.string().nullable(),last_out:z.string().nullable(),scheduled_start:z.string().nullable(),scheduled_end:z.string().nullable(),policy:hrLeavePolicySchema.nullable(),issues:z.array(z.string())});
export const hrLeaveContextSchema=z.strictObject({hash:z.string(),employees:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string()})),employees_capped:z.boolean(),types:z.array(hrLeaveTypeSchema),documents:z.array(z.strictObject({id:identifier,name:z.string(),expires_on:isoDate.nullable()})),manager_user_id:identifier.nullable(),manager_name:z.string().nullable(),subject_user_ids:z.array(identifier),days:z.array(hrLeaveContextDaySchema),balance:hrLeaveBalanceSchema.nullable(),blockers:z.array(z.string()),today:isoDate});
export const createHrLeaveRequestSchema=z.strictObject({company_id:identifier,employee_id:identifier,leave_type_id:identifier,from_date:leaveDate,to_date:leaveDate,document_id:identifier.nullable(),days:z.array(hrLeaveAllocationSchema).min(1).max(62),reason:z.string().trim().min(12).max(1000),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/)}).refine(v=>v.to_date>=v.from_date&&Date.parse(v.to_date)-Date.parse(v.from_date)<=61*86400000&&new Set(v.days.map(d=>d.on_date)).size===v.days.length&&v.days.every(d=>d.on_date>=v.from_date&&d.on_date<=v.to_date),'Review the date range and unique daily allocations');
export const hrLeaveRequestActionSchema=z.enum(['submit','cancel','manager_approve','manager_reject','hr_approve','hr_reject','cancel_approved']);
export const hrLeaveRequestActionRequestSchema=z.strictObject({company_id:identifier,action:hrLeaveRequestActionSchema,expected_version:z.number().int().positive(),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/).optional(),reason:z.string().trim().min(12).max(1000),override_self_approval:z.boolean().default(false)});
export const hrLeaveRequestQuerySchema=hrLeaveQuerySchema.extend({status:z.enum(['draft','pending_manager','pending_hr','approved','rejected','cancelled']).optional(),queue_only:z.enum(['true','false']).default('false')});
export const hrLeaveRequestSummarySchema=z.strictObject({id:identifier,reference:z.string(),company_id:identifier,employee_id:identifier,employee_number:z.string(),display_name:z.string(),leave_type_id:identifier,leave_type:z.string(),paid:z.boolean(),from_date:isoDate,to_date:isoDate,requested_days:z.string(),reason:z.string(),document_id:identifier.nullable(),status:z.string(),version:z.number().int(),workflow_managed:z.boolean(),requested_by:identifier,submitted_by:identifier.nullable(),manager_user_id:identifier.nullable(),manager_decided_by:identifier.nullable(),hr_decided_by:identifier.nullable(),subject_user_ids:z.array(identifier),requires_hr_approval:z.boolean(),review_source_hash:z.string().nullable()});
export const hrLeaveRequestDirectorySchema=z.strictObject({items:z.array(hrLeaveRequestSummarySchema),total:z.number().int()});
export const hrLeaveRequestDetailSchema=hrLeaveRequestSummarySchema.extend({days:z.array(hrLeaveAllocationSchema.extend({days:z.string(),policy_version_id:identifier})),context:hrLeaveContextSchema.nullable(),context_unavailable:z.string().nullable(),allowed_actions:z.array(hrLeaveRequestActionSchema),self_decision_requires_override:z.boolean(),history:z.array(hrAttendanceCompletionHistorySchema)});
export type HrLeaveQuery=z.infer<typeof hrLeaveQuerySchema>;
export type HrLeavePolicyInput=z.infer<typeof hrLeavePolicyInputSchema>;
export type CreateHrLeaveTypeRequest=z.infer<typeof createHrLeaveTypeRequestSchema>;
export type UpdateHrLeavePolicyRequest=z.infer<typeof updateHrLeavePolicyRequestSchema>;
export type HrLeaveTypeStatusRequest=z.infer<typeof hrLeaveTypeStatusRequestSchema>;
export type HrLeavePolicy=z.infer<typeof hrLeavePolicySchema>;
export type HrLeaveType=z.infer<typeof hrLeaveTypeSchema>;
export type HrLeaveTypeDirectory=z.infer<typeof hrLeaveTypeDirectorySchema>;
export type HrLeaveAllocation=z.infer<typeof hrLeaveAllocationSchema>;
export type HrLeaveContextQuery=z.infer<typeof hrLeaveContextQuerySchema>;
export type HrLeaveBalance=z.infer<typeof hrLeaveBalanceSchema>;
export type HrLeaveBalanceQuery=z.infer<typeof hrLeaveBalanceQuerySchema>;
export type HrLeaveBalanceDirectory=z.infer<typeof hrLeaveBalanceDirectorySchema>;
export type HrLeaveLedgerQuery=z.infer<typeof hrLeaveLedgerQuerySchema>;
export type HrLeaveLedger=z.infer<typeof hrLeaveLedgerSchema>;
export type HrLeaveBalancePostingRequest=z.infer<typeof hrLeaveBalancePostingRequestSchema>;
export type HrLeaveContext=z.infer<typeof hrLeaveContextSchema>;
export type CreateHrLeaveRequest=z.infer<typeof createHrLeaveRequestSchema>;
export type HrLeaveRequestActionRequest=z.infer<typeof hrLeaveRequestActionRequestSchema>;
export type HrLeaveRequestQuery=z.infer<typeof hrLeaveRequestQuerySchema>;
export type HrLeaveRequestSummary=z.infer<typeof hrLeaveRequestSummarySchema>;
export type HrLeaveRequestDirectory=z.infer<typeof hrLeaveRequestDirectorySchema>;
export type HrLeaveRequestDetail=z.infer<typeof hrLeaveRequestDetailSchema>;

// Governed Payroll workspace. Amounts cross the API as exact decimal strings.
export const hrPayrollSectionSchema=z.enum(['components','structures','salaries','adjustments','loans','runs','review','journals','payments','payslips']);
export const hrPayrollWorkspaceQuerySchema=z.strictObject({company_id:identifier,section:hrPayrollSectionSchema,month:isoDate.refine(v=>v.endsWith('-01'),'Choose the first day of the payroll month.'),search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
const payrollDecimal=z.string().regex(/^\d{1,16}(\.\d{1,4})?$/,'Enter a non-negative amount with up to four decimal places.');
const payrollReason=z.string().trim().min(5).max(500);
export const hrPayrollItemSchema=z.strictObject({disbursement_options:z.array(z.strictObject({line_id:identifier,payment_reference:z.string(),posting_date:isoDate,amount:z.string(),currency_code:z.string(),receivable_account:z.string()})).max(25).optional(),id:identifier,title:z.string(),reference:z.string(),status:z.string(),version:z.number().int(),workflow_managed:z.boolean(),source_hash:z.string(),created_by:z.string(),submitted_by:z.string().nullable(),employee_id:z.string().nullable(),employee_name:z.string().nullable(),currency_code:z.string().nullable(),amount:z.string().nullable(),effective_from:z.string().nullable(),effective_to:z.string().nullable(),details:z.record(z.string(),z.string().nullable()),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string(),override:z.boolean()})),lines:z.array(z.strictObject({label:z.string(),amount:z.string().nullable(),description:z.string()}))});
export const hrPayrollWorkspaceSchema=z.strictObject({company_id:identifier,section:hrPayrollSectionSchema,month:isoDate,items:z.array(hrPayrollItemSchema),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),notices:z.array(z.string())});
export const hrPayrollOptionsQuerySchema=z.strictObject({company_id:identifier,search:z.string().trim().max(120).default(''),on_date:isoDate});
export const hrPayrollOptionsSchema=z.strictObject({employees:z.array(z.strictObject({id:identifier,label:z.string()})),accounts:z.array(z.strictObject({id:identifier,label:z.string(),type:z.string()})),components:z.array(z.strictObject({id:identifier,label:z.string(),kind:z.enum(['earning','deduction']),method:z.enum(['fixed','formula'])})),structures:z.array(z.strictObject({id:identifier,label:z.string(),currency_code:z.string().nullable()})),truncated:z.boolean()});
const payrollBase={company_id:identifier,reason:payrollReason};
export const createHrPayrollRecordSchema=z.discriminatedUnion('kind',[
z.strictObject({...payrollBase,kind:z.literal('component'),code:z.string().trim().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/),name:z.string().trim().min(1).max(160),component_kind:z.enum(['earning','deduction']),method:z.enum(['fixed','formula']),formula:z.string().trim().min(1).max(500).nullable(),taxable:z.boolean(),prorated:z.boolean(),account_id:identifier,position:z.number().int().min(1).max(1000)}),
z.strictObject({...payrollBase,kind:z.literal('structure'),code:z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,31}$/),name:z.string().trim().min(1).max(160),description:z.string().trim().max(1000),currency_code:z.string().regex(/^[A-Z]{3}$/),items:z.array(z.strictObject({component_id:identifier,amount:payrollDecimal.nullable(),formula:z.string().trim().min(1).max(500).nullable()})).min(1).max(50)}),
z.strictObject({...payrollBase,kind:z.literal('salary'),supersedes_id:identifier.nullable().default(null),employee_id:identifier,structure_id:identifier,currency_code:z.string().regex(/^[A-Z]{3}$/),effective_from:isoDate,effective_to:isoDate.nullable(),compensation_type:z.enum(['fixed','contractual','hourly']),payment_basis:z.enum(['hourly','daily','weekly','monthly','annual','custom'])}),
z.strictObject({...payrollBase,kind:z.literal('adjustment'),employee_id:identifier,component_id:identifier,effective_month:isoDate,amount:payrollDecimal}),
z.strictObject({...payrollBase,kind:z.literal('loan'),employee_id:identifier,component_id:identifier,reference:z.string().trim().min(1).max(80),currency_code:z.string().regex(/^[A-Z]{3}$/),start_month:isoDate,principal:payrollDecimal,instalment_count:z.number().int().min(1).max(600)})
]).superRefine((v,c)=>{const issue=(message:string)=>c.addIssue({code:'custom',message});if(v.kind==='component'&&((v.method==='fixed')!==(v.formula===null)))issue('Fixed components have no formula; formula components require one.');if(v.kind==='structure'){if(new Set(v.items.map(i=>i.component_id)).size!==v.items.length)issue('Each component can appear only once.');if(v.items.some(i=>(i.amount===null)===(i.formula===null)))issue('Choose one amount or formula for each structure item.');}if(v.kind==='salary'&&v.effective_to&&v.effective_to<v.effective_from)issue('The end date must follow the start date.');if(v.kind==='loan'&&!/[1-9]/.test(v.principal))issue('Principal must be positive.');if(v.kind==='adjustment'&&!v.effective_month.endsWith('-01'))issue('Use the first day of the month.');if(v.kind==='loan'&&!v.start_month.endsWith('-01'))issue('Use the first day of the month.');});
export const hrPayrollRecordActionSchema=z.strictObject({...payrollBase,section:z.enum(['components','structures','salaries','adjustments','loans']),expected_version:z.number().int().min(1),source_hash:z.string().regex(/^[a-f0-9]{64}$/),action:z.enum(['submit','approve','reject','cancel','activate','deactivate','confirm_disbursement']),confirm_override:z.boolean().default(false),bank_payment_line_id:identifier.optional(),bank_reference:z.string().trim().min(3).max(128).optional(),confirmed_on:isoDate.optional()}).superRefine((v,c)=>{if(v.action==='confirm_disbursement'){if(v.section!=='loans'||!v.bank_payment_line_id||!v.bank_reference||!v.confirmed_on||v.confirm_override)c.addIssue({code:'custom',message:'Loan disbursement requires a posted payment line, bank confirmation reference and date, with independent review.'});}else if(v.bank_payment_line_id!==undefined||v.bank_reference!==undefined||v.confirmed_on!==undefined)c.addIssue({code:'custom',message:'Disbursement fields are only valid for loan confirmation.'});});
export const hrPayrollMutationResultSchema=z.strictObject({id:identifier,company_id:identifier,status:z.string(),version:z.number().int(),audit_event_id:identifier,replayed:z.boolean()});
export type HrPayrollSection=z.infer<typeof hrPayrollSectionSchema>;
export type HrPayrollWorkspaceQuery=z.infer<typeof hrPayrollWorkspaceQuerySchema>;
export type HrPayrollWorkspace=z.infer<typeof hrPayrollWorkspaceSchema>;
export type HrPayrollItem=z.infer<typeof hrPayrollItemSchema>;
export type HrPayrollOptionsQuery=z.infer<typeof hrPayrollOptionsQuerySchema>;
export type HrPayrollOptions=z.infer<typeof hrPayrollOptionsSchema>;
export type CreateHrPayrollRecord=z.infer<typeof createHrPayrollRecordSchema>;
export type HrPayrollRecordAction=z.infer<typeof hrPayrollRecordActionSchema>;
export type HrPayrollMutationResult=z.infer<typeof hrPayrollMutationResultSchema>;

export const hrPayrollRunQuerySchema=z.strictObject({company_id:identifier,limit:z.coerce.number().int().min(1).max(50).optional(),offset:z.coerce.number().int().min(0).max(100000).optional(),month:isoDate.refine(v=>v.endsWith('-01'),'Choose the first day of the month.')});
export const hrPayrollRunActionSchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),action:z.enum(['policy','open','calculate','submit','return','approve']),reason:z.string().trim().min(5).max(500),expected_version:z.number().int().min(0),source_hash:z.string().regex(/^[a-f0-9]{64}$/),confirm_override:z.boolean().default(false),policy_id:identifier.optional(),currency_code:z.string().regex(/^[A-Z]{3}$/).optional(),money_scale:z.number().int().min(0).max(4).optional(),net_payable_account_id:identifier.optional(),rounding_mode:z.enum(['half_up','half_even','down','up']).optional()});
export const hrPayrollRunEmployeeSchema=z.strictObject({supplemental:z.strictObject({gross:z.string(),deductions:z.string(),net:z.string(),employer_contributions:z.string()}).nullable().default(null),id:identifier,employee_id:identifier,employee_number:z.string(),display_name:z.string(),currency_code:z.string(),gross:z.string(),deductions:z.string(),net:z.string(),employer_contributions:z.string(),statutory:z.strictObject({jurisdiction_overrides:z.array(z.strictObject({id:identifier,rule_scope:z.string(),jurisdiction_id:identifier,effective_from:isoDate,effective_to:isoDate.nullable()})).max(1550).default([]),contexts:z.array(z.strictObject({effective_from:isoDate,effective_to:isoDate,calendar_days:z.number().int().positive(),input_hash:z.string(),resolved_set_hash:z.string()})).default([]),status:z.enum(['ready','blocked']),environment:z.enum(['production','test']),state:z.string().nullable(),engine_version:z.string().nullable(),snapshot_id:identifier.nullable(),input_hash:z.string(),resolved_set_hash:z.string(),rule_count:z.number().int().nonnegative(),pack_count:z.number().int().nonnegative()}).nullable(),calculation_hash:z.string(),attendance_source_hash:z.string(),warnings:z.array(z.string()),lines:z.array(z.strictObject({component_name:z.string(),kind:z.string(),amount:z.string(),source:z.string(),overtime:z.strictObject({work_date:isoDate,approved_minutes:z.number().int(),basis_amount:z.string(),ordinary_hours:z.string().nullable(),hourly_rate:z.string(),multiplier:z.string(),rounded_amount:z.string(),rounding_mode:z.string(),rounding_stage:z.string(),policy_version_id:identifier,arrangement_id:identifier,conversion_method:z.string()}).nullable().optional()}))});
export const hrPayrollRunWorkspaceSchema=z.strictObject({review_access:z.enum(["independent","override_required","forbidden"]).nullable().default(null),supplemental_totals:z.strictObject({gross:z.string(),deductions:z.string(),net:z.string(),employer_contributions:z.string()}).nullable().default(null),company_id:identifier,month:isoDate,source_hash:z.string(),period:z.strictObject({id:identifier,state:z.string(),version:z.number().int(),run_number:z.number().int(),currency_code:z.string(),created_by:z.string(),calculated_by:z.string().nullable(),submitted_by:z.string().nullable(),approved_by:z.string().nullable(),review_hash:z.string().nullable()}).nullable(),attendance:z.strictObject({id:identifier,state:z.string(),source_hash:z.string().nullable(),input_count:z.number().int(),evidence_versions:z.array(z.string())}).nullable(),policies:z.array(z.strictObject({id:identifier,currency_code:z.string(),money_scale:z.number().int(),rounding_mode:z.string(),net_payable_account_id:identifier})),accounts:z.array(z.strictObject({id:identifier,label:z.string()})),currencies:z.array(z.strictObject({id:z.string(),label:z.string(),scale:z.number().int()})),employees:z.array(hrPayrollRunEmployeeSchema),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),totals:z.strictObject({gross:z.string(),deductions:z.string(),net:z.string(),employer_contributions:z.string(),currency_code:z.string()}).nullable(),blocked:z.array(z.string()),allowed_actions:z.array(z.string()),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string(),override:z.boolean()}))});
export type HrPayrollRunQuery=z.infer<typeof hrPayrollRunQuerySchema>;
export type HrPayrollRunAction=z.infer<typeof hrPayrollRunActionSchema>;
export type HrPayrollRunWorkspace=z.infer<typeof hrPayrollRunWorkspaceSchema>;

const otSetupDecimal=z.string().regex(/^\d{1,14}(\.\d{1,6})?$/,'Use an exact positive decimal with up to six decimal places.').refine(v=>/[1-9]/.test(v),'A positive value is required.');
export const hrOvertimeMoneyPolicyTermsSchema=z.strictObject({category:z.enum(['regular','weekend','holiday']),basis_source:z.enum(['selected_components','direct_contractual_rate']),rate_basis_method:z.enum(['monthly','direct_hourly']),component_ids:z.array(identifier).max(10),earning_component_id:identifier,currency_code:z.string().regex(/^[A-Z]{3}$/),money_scale:z.number().int().min(0).max(4),ordinary_hours:otSetupDecimal.nullable(),multiplier:otSetupDecimal,rounding_mode:z.enum(['half_up','half_even','down','up']),rounding_stage:z.enum(['hourly_rate','per_ot_day','final_employee_period']),minute_precision:z.number().int().min(0).max(8),hourly_rate_precision:z.number().int().min(0).max(8),intermediate_precision:z.number().int().min(0).max(8),source_reference:z.string().trim().min(5).max(500)}).superRefine((v,c)=>{const issue=(message:string)=>c.addIssue({code:'custom',message});if(new Set(v.component_ids).size!==v.component_ids.length)issue('Each basis component must be unique.');if(v.basis_source==='selected_components'&&(!v.component_ids.length||v.rate_basis_method!=='monthly'||v.ordinary_hours===null))issue('Selected fixed monthly earnings require components and explicit ordinary hours.');if(v.basis_source==='direct_contractual_rate'&&(v.component_ids.length||v.rate_basis_method!=='direct_hourly'||v.ordinary_hours!==null))issue('A direct hourly arrangement has no component selection or ordinary-hour divisor.');});
const otSetupBase={company_id:identifier,effective_from:isoDate,effective_to:isoDate.nullable(),reason:z.string().trim().min(5).max(500)};
export const createHrOvertimeMoneySchema=z.discriminatedUnion('kind',[
z.strictObject({...otSetupBase,kind:z.literal('policy'),reference:z.string().trim().regex(/^[A-Z0-9][A-Z0-9._/-]{0,63}$/),name:z.string().trim().min(1).max(160),terms:hrOvertimeMoneyPolicyTermsSchema}),
z.strictObject({...otSetupBase,kind:z.literal('arrangement'),employee_id:identifier,policy_version_id:identifier,direct_rate:otSetupDecimal.nullable()})
]).superRefine((v,c)=>{if(v.effective_to&&v.effective_to<v.effective_from)c.addIssue({code:'custom',message:'The end date must follow the start date.'});});
export const hrOvertimeMoneyQuerySchema=z.strictObject({company_id:identifier,on_date:isoDate,section:z.enum(['policies','arrangements']),search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrOvertimeMoneyDecisionSchema=z.strictObject({company_id:identifier,kind:z.enum(['policy','arrangement']),action:z.enum(['submit','approve','reject','release']),expected_version:z.number().int().min(1),source_hash:z.string().regex(/^[a-f0-9]{64}$/),confirm_override:z.boolean().default(false),reason:z.string().trim().min(5).max(500)});
export const hrOvertimeMoneyRecordSchema=z.strictObject({id:identifier,kind:z.enum(['policy','arrangement']),reference:z.string(),name:z.string(),status:z.string(),version:z.number().int(),source_hash:z.string(),workflow_managed:z.boolean(),effective_from:isoDate,effective_to:isoDate.nullable(),employee_id:identifier.nullable(),policy_version_id:identifier,terms:hrOvertimeMoneyPolicyTermsSchema.nullable(),direct_rate:z.string().nullable(),allowed_actions:z.array(z.enum(['submit','approve','reject','release'])),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string(),override:z.boolean()}))});
export const hrOvertimeMoneyWorkspaceSchema=z.strictObject({company_id:identifier,section:z.enum(['policies','arrangements']),items:z.array(hrOvertimeMoneyRecordSchema),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),can_create:z.boolean(),options:z.strictObject({employees:z.array(z.strictObject({id:identifier,label:z.string()})),components:z.array(z.strictObject({id:identifier,label:z.string()})),currencies:z.array(z.strictObject({id:z.string(),label:z.string(),scale:z.number().int()})),policies:z.array(hrOvertimeMoneyRecordSchema),truncated:z.boolean()})});
export type HrOvertimeMoneyQuery=z.infer<typeof hrOvertimeMoneyQuerySchema>;
export type CreateHrOvertimeMoney=z.infer<typeof createHrOvertimeMoneySchema>;
export type HrOvertimeMoneyDecision=z.infer<typeof hrOvertimeMoneyDecisionSchema>;
export type HrOvertimeMoneyRecord=z.infer<typeof hrOvertimeMoneyRecordSchema>;
export type HrOvertimeMoneyWorkspace=z.infer<typeof hrOvertimeMoneyWorkspaceSchema>;

const statutoryDecimal = z.string().regex(/^-?\d{1,30}(\.\d{1,18})?$/);
export const statutoryFormulaConfigurationSchema = z.strictObject({
  context_basis: z.literal("calendar_weighted_monthly").optional(),
  schema_version: z.literal(1),
  currency_code: z.string().regex(/^[A-Z]{3}$/),
  money_scale: z.number().int().min(0).max(4),
  rounding_mode: z.enum(["half_up", "half_even", "down", "up"]),
  formula: z.string().min(1).max(500),
  constants: z.record(z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/), statutoryDecimal).default({}),
  tax_year: z.number().int().min(2000).max(2200).optional(),
  tax_year_start: z.iso.date().optional(),
  ytd_states: z
    .array(z.enum(["posted", "paid", "closed"]))
    .min(1)
    .optional(),
});
export const statutoryApplicabilitySchema = z.strictObject({
  schema_version: z.literal(1),
  all: z
    .array(
      z.strictObject({
        variable: z.string().regex(/^[A-Z][A-Z0-9_]{0,79}$/),
        operator: z.enum(["eq", "ne", "gt", "gte", "lt", "lte"]),
        value: statutoryDecimal,
      }),
    )
    .max(20),
});
export const statutoryOutputSchema = z
  .strictObject({
    schema_version: z.literal(1),
    line_code: z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,79}$/),
    line_name: z.string().min(1).max(200),
    line_kind: z.enum(["earning", "deduction", "employer_contribution", "informational"]),
    component_code: z
      .string()
      .regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/)
      .nullable(),
  })
  .superRefine((v, c) => {
    if ((v.line_kind === "informational") !== (v.component_code === null))
      c.addIssue({
        code: "custom",
        message: "Informational outputs have no component; money outputs need a component.",
      });
  });

export const hrStatutoryPackTermsSchema=z.strictObject({
 kind:z.literal('pack_release'),schema_version:z.literal(1),execution_contract:z.literal('safe_formula_v1'),classification:z.enum(['production','synthetic']),
 key:z.string().regex(/^[A-Za-z][A-Za-z0-9._-]{0,63}$/),name:z.string().trim().min(1).max(200),semantic_version:z.string().regex(/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/),country_code:z.string().regex(/^[A-Z]{2}$/),jurisdiction_id:identifier,effective_from:isoDate,effective_to:isoDate.nullable(),
 sources:z.array(z.strictObject({id:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,39}$/),reference:z.string().trim().min(5).max(400),document_hash:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(20),
 rules:z.array(z.strictObject({key:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),name:z.string().trim().min(1).max(200),category:z.string().regex(/^[A-Za-z][A-Za-z0-9._:-]{0,63}$/),rule_type:z.literal('safe_formula'),configuration:statutoryFormulaConfigurationSchema,applicability:statutoryApplicabilitySchema,output:statutoryOutputSchema,
 vectors:z.array(z.strictObject({key:z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,63}$/),kind:z.enum(['positive','boundary','non_applicable']),inputs:z.record(z.string().max(80),z.string().regex(/^-?\d{1,30}(\.\d{1,18})?$/)),expected:z.strictObject({applicable:z.boolean(),amount:z.string().regex(/^\d{1,30}(\.\d{1,18})?$/)}),rounding:z.strictObject({money_scale:z.number().int().min(0).max(4),rounding_mode:z.enum(['half_up','half_even','down','up'])}),source_id:z.string().max(40)})).min(3).max(20)
 })).min(1).max(20)
});
export type HrStatutoryPackTerms=z.infer<typeof hrStatutoryPackTermsSchema>;

export const hrLocalizationKindSchema=z.enum(['legal_profile','payroll_configuration','work_location','activation','declaration','parameter','pack_release','jurisdiction_override','jurisdiction_override_revocation']);
const localizationRange={effective_from:isoDate,effective_to:isoDate.nullable()};
const localizationMoney=z.string().regex(/^\d{1,16}(\.\d{1,4})?$/);
export const hrLocalizationTermsSchema=z.discriminatedUnion('kind',[
 hrStatutoryPackTermsSchema,
 z.strictObject({kind:z.literal('jurisdiction_override'),...localizationRange,employee_id:identifier,employee_assignment_id:identifier,rule_scope:z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/),country_code:z.string().regex(/^[A-Z]{2}$/),jurisdiction_id:identifier,legal_basis:z.string().trim().min(5).max(1000),evidence_reference:z.string().trim().min(5).max(500)}),
 z.strictObject({kind:z.literal('jurisdiction_override_revocation'),...localizationRange,override_id:identifier}),
 z.strictObject({kind:z.literal('legal_profile'),...localizationRange,country_code:z.string().regex(/^[A-Z]{2}$/),jurisdiction_id:identifier,legal_entity_type_id:identifier}),
 z.strictObject({kind:z.literal('payroll_configuration'),...localizationRange,currency_code:z.string().regex(/^[A-Z]{3}$/),payroll_frequency:z.literal('monthly')}),
 z.strictObject({kind:z.literal('work_location'),...localizationRange,work_location_id:identifier,country_code:z.string().regex(/^[A-Z]{2}$/),jurisdiction_id:identifier}),
 z.strictObject({kind:z.literal('activation'),...localizationRange,legal_profile_id:identifier,jurisdiction_id:identifier,pack_version_id:identifier}),
 z.strictObject({kind:z.literal('declaration'),effective_from:isoDate,employee_id:identifier,jurisdiction_id:identifier,tax_year:z.number().int().min(2000).max(2200),supersedes_declaration_id:identifier.nullable(),currency_code:z.string().regex(/^[A-Z]{3}$/),estimated_annual_salary:localizationMoney,prior_taxable_salary:localizationMoney,prior_salary_tax_withheld:localizationMoney,documented_tax_credit:localizationMoney,other_tax_withheld:localizationMoney,eobi_applicability:z.enum(['applicable','not_applicable']),provincial_social_security_status:z.enum(['assessed_not_applicable','external_pack_required'])}),
 z.strictObject({kind:z.literal('parameter'),...localizationRange,jurisdiction_id:identifier,scheme_code:z.literal('eobi'),parameter_key:z.literal('contribution_base'),amount:localizationMoney,currency_code:z.string().regex(/^[A-Z]{3}$/)})
]).superRefine((v,c)=>{if('effective_to' in v&&v.effective_to&&v.effective_to<v.effective_from)c.addIssue({code:'custom',message:'Effective end must follow the start.'});});
export const createHrLocalizationSchema=z.strictObject({company_id:identifier,terms:hrLocalizationTermsSchema,source_reference:z.string().trim().min(5).max(500),reason:z.string().trim().min(5).max(500)});
export const hrLocalizationQuerySchema=z.strictObject({company_id:identifier,kind:hrLocalizationKindSchema,on_date:isoDate,country_code:z.string().regex(/^[A-Z]{2}$/).optional(),search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrLocalizationDecisionSchema=z.strictObject({company_id:identifier,action:z.enum(['submit','approve','reject']),expected_version:z.number().int().positive(),source_hash:z.string().regex(/^[a-f0-9]{64}$/),confirm_override:z.boolean().default(false),reason:z.string().trim().min(5).max(500)});
export const hrLocalizationRecordSchema=z.strictObject({materialized_state:z.enum(["approved","revoked"]).nullable().default(null),id:identifier,kind:hrLocalizationKindSchema,status:z.enum(['draft','submitted','approved','rejected']),version:z.number().int(),source_hash:z.string(),terms:hrLocalizationTermsSchema,source_reference:z.string(),created_by:z.string(),bundle_hash:z.string().nullable(),publication:z.strictObject({artifact_hash:z.string(),pack_version_id:z.string(),published_at:z.string()}).nullable(),allowed_actions:z.array(z.enum(['submit','approve','reject'])),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string(),override:z.boolean()}))});
const localizationOption=z.strictObject({id:z.string(),label:z.string(),country_code:z.string().optional(),parent_id:z.string().nullable().optional(),employee_id:z.string().optional(),jurisdiction_id:z.string().optional(),tax_year:z.number().int().optional(),effective_from:isoDate.optional(),effective_to:isoDate.nullable().optional()});
export const hrLocalizationWorkspaceSchema=z.strictObject({company_id:identifier,kind:hrLocalizationKindSchema,items:z.array(hrLocalizationRecordSchema),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),can_create:z.boolean(),options:z.strictObject({countries:z.array(localizationOption),jurisdictions:z.array(localizationOption),entity_types:z.array(localizationOption),currencies:z.array(localizationOption),work_locations:z.array(localizationOption),employees:z.array(localizationOption),legal_profiles:z.array(localizationOption),packs:z.array(localizationOption),declarations:z.array(localizationOption),assignments:z.array(localizationOption).default([]),rule_scopes:z.array(localizationOption).default([]),overrides:z.array(localizationOption).default([]),truncated:z.boolean()}),notices:z.array(z.string())});
export type HrLocalizationTerms=z.infer<typeof hrLocalizationTermsSchema>;
export type CreateHrLocalization=z.infer<typeof createHrLocalizationSchema>;
export type HrLocalizationQuery=z.infer<typeof hrLocalizationQuerySchema>;
export type HrLocalizationDecision=z.infer<typeof hrLocalizationDecisionSchema>;
export type HrLocalizationRecord=z.infer<typeof hrLocalizationRecordSchema>;
export type HrLocalizationWorkspace=z.infer<typeof hrLocalizationWorkspaceSchema>;

export const hrPayrollCostCentreMappingSchema=z.strictObject({account_id:identifier,cost_center_id:identifier});
export const hrPayrollJournalQuerySchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),posting_date:isoDate.optional(),cost_center_search:z.string().trim().max(120).optional()});
export const hrPayrollJournalActionSchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),posting_date:isoDate,action:z.enum(['prepare','accept','reject','post']),expected_version:z.number().int().min(0),source_hash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500),cost_center_mappings:z.array(hrPayrollCostCentreMappingSchema).max(1000).refine(v=>new Set(v.map(m=>m.account_id)).size===v.length).optional()}).refine(v=>v.action==='prepare'||v.cost_center_mappings===undefined,{message:'Cost-centre mappings are authored only during preparation.'});
export const hrPayrollJournalWorkspaceSchema=z.strictObject({company_id:identifier,month:isoDate,posting_date:isoDate,source_hash:z.string(),period:z.strictObject({id:identifier,state:z.string(),run_number:z.number().int(),version:z.number().int()}).nullable(),proposal:z.strictObject({id:identifier,state:z.string(),version:z.number().int(),revision:z.number().int(),workflow_managed:z.boolean(),created_by:z.string(),accepted_by:z.string().nullable(),rejected_by:z.string().nullable(),posted_by:z.string().nullable(),external_journal_id:z.string().nullable(),external_entry_number:z.string().nullable(),accounting_event_id:z.string().nullable(),source_results_hash:z.string(),source_evidence:z.record(z.string(),z.unknown())}).nullable(),currency_code:z.string().nullable(),base_currency:z.string().nullable(),exchange_rate_id:z.string().nullable(),exchange_rate:z.string().nullable(),totals:z.strictObject({debit:z.string(),credit:z.string(),net:z.string(),employer_contributions:z.string(),employee_count:z.number().int()}),lines:z.array(z.strictObject({account_id:identifier,account_code:z.string(),account_name:z.string(),account_type:z.string(),debit:z.string(),credit:z.string(),dimensions:z.record(z.string(),z.string()).default({}),cost_center_label:z.string().nullable().default(null)})).max(1000),dimension_requirements:z.array(z.strictObject({account_id:identifier,account_code:z.string(),required_dimensions:z.array(z.string())})).max(1000).default([]),cost_centres:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string()})).max(500).default([]),cost_centres_truncated:z.boolean().default(false),blocked:z.array(z.string()),allowed_actions:z.array(z.enum(['prepare','accept','reject','post'])),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string()}))});
export type HrPayrollJournalQuery=z.infer<typeof hrPayrollJournalQuerySchema>;
export type HrPayrollJournalAction=z.infer<typeof hrPayrollJournalActionSchema>;
export type HrPayrollJournalWorkspace=z.infer<typeof hrPayrollJournalWorkspaceSchema>;

export const hrPayrollPaymentQuerySchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01'))});
const payrollPaymentActionFields={company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),expected_version:z.number().int().min(0),source_hash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500)};
export const hrPayrollPaymentActionSchema=z.discriminatedUnion('action',[
 z.strictObject({...payrollPaymentActionFields,action:z.enum(['prepare','approve','reject'])}),
 z.strictObject({...payrollPaymentActionFields,action:z.literal('confirm'),payment_id:identifier,bank_payment_line_id:identifier,bank_reference:z.string().trim().min(3).max(120),confirmed_on:isoDate})
]);
export const hrPayrollPaymentWorkspaceSchema=z.strictObject({company_id:identifier,month:isoDate,source_hash:z.string(),currency_code:z.string().nullable(),period:z.strictObject({id:identifier,state:z.string(),run_number:z.number().int()}).nullable(),accrual_journal_id:z.string().nullable(),net_payable_account_id:z.string().nullable(),batch:z.strictObject({id:identifier,reference:z.string(),state:z.string(),version:z.number().int(),workflow_managed:z.boolean(),created_by:z.string(),approved_by:z.string().nullable()}).nullable(),totals:z.strictObject({net:z.string(),confirmed:z.string(),outstanding:z.string(),employee_count:z.number().int(),zero_net_count:z.number().int()}),payments:z.array(z.strictObject({id:identifier,result_id:identifier,employee_id:identifier,employee_name:z.string(),employee_number:z.string(),amount:z.string(),state:z.string(),bank_reference:z.string().nullable(),confirmed_on:z.string().nullable(),bank_payment_id:z.string().nullable(),bank_payment_line_id:z.string().nullable(),journal_id:z.string().nullable(),can_confirm:z.boolean()})).max(500),bank_lines:z.array(z.strictObject({id:identifier,payment_id:identifier,reference:z.string(),payment_reference:z.string(),employee_id:identifier,amount:z.string(),posting_date:z.string(),currency_code:z.string()})).max(501),bank_lines_truncated:z.boolean(),blocked:z.array(z.string()),allowed_actions:z.array(z.enum(['prepare','approve','reject'])),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string()}))});
export type HrPayrollPaymentQuery=z.infer<typeof hrPayrollPaymentQuerySchema>;
export type HrPayrollPaymentAction=z.infer<typeof hrPayrollPaymentActionSchema>;
export type HrPayrollPaymentWorkspace=z.infer<typeof hrPayrollPaymentWorkspaceSchema>;

export const hrPayslipDocumentSchema=z.strictObject({version:z.literal('payslip_v1'),company:z.strictObject({id:identifier,code:z.string(),name:z.string()}),employee:z.strictObject({id:identifier,number:z.string(),name:z.string()}),period:z.strictObject({id:identifier,month:isoDate,run_number:z.number().int()}),result:z.strictObject({id:identifier,currency:z.string(),gross:z.string(),deductions:z.string(),net:z.string(),employer_contributions:z.string(),calculation_hash:z.string()}),accrual:z.strictObject({id:identifier,journal_id:identifier,entry_number:z.string()}).nullable(),lines:z.array(z.strictObject({code:z.string(),name:z.string(),kind:z.enum(['earning','deduction','employer_contribution']),amount:z.string(),position:z.number().int()})).max(1000)});
export const hrPayslipQuerySchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),search:z.string().trim().max(120).default(''),state:z.enum(['all','pending','released']).default('all'),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrPayslipReleaseSchema=z.strictObject({company_id:identifier,month:isoDate.refine(v=>v.endsWith('-01')),result_ids:z.array(identifier).min(1).max(50).refine(v=>new Set(v).size===v.length),source_hash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500)});
export const hrPayslipDetailSchema=z.strictObject({document:hrPayslipDocumentSchema,release:z.strictObject({id:identifier,released_by:z.string(),released_at:z.string(),publication_hash:z.string().nullable(),workflow_managed:z.boolean()}).nullable(),can_release:z.boolean()});
export const hrPayslipWorkspaceSchema=z.strictObject({company_id:identifier,month:isoDate,source_hash:z.string(),period:z.strictObject({id:identifier,state:z.string(),run_number:z.number().int()}).nullable(),items:z.array(z.strictObject({result_id:identifier,employee_id:identifier,employee_number:z.string(),employee_name:z.string(),currency_code:z.string(),gross:z.string(),deductions:z.string(),net:z.string(),state:z.enum(['pending','released']),release_id:z.string().nullable(),released_at:z.string().nullable(),can_release:z.boolean()})).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),counts:z.strictObject({results:z.number().int(),released:z.number().int(),pending:z.number().int()}),can_release:z.boolean(),blocked:z.array(z.string()),history:z.array(z.strictObject({action:z.string(),reason:z.string(),actor_id:z.string(),occurred_at:z.string()}))});
export type HrPayslipDocument=z.infer<typeof hrPayslipDocumentSchema>;
export type HrPayslipQuery=z.infer<typeof hrPayslipQuerySchema>;
export type HrPayslipRelease=z.infer<typeof hrPayslipReleaseSchema>;
export type HrPayslipDetail=z.infer<typeof hrPayslipDetailSchema>;
export type HrPayslipWorkspace=z.infer<typeof hrPayslipWorkspaceSchema>;

export const hrPerformanceSectionSchema=z.enum(['cycles','goals','reviews','outcomes']);
export const hrPerformanceTermsSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('cycle'),title:z.string().trim().min(3).max(160),description:z.string().trim().max(2000),start_date:isoDate,end_date:isoDate,review_due_date:isoDate}),
 z.strictObject({kind:z.literal('goal'),cycle_id:identifier,employee_id:identifier,title:z.string().trim().min(3).max(160),measure:z.string().trim().min(3).max(500),target:z.string().trim().min(1).max(500),weight_bps:z.number().int().min(1).max(10000),due_date:isoDate}),
 z.strictObject({kind:z.literal('review'),cycle_id:identifier,employee_id:identifier,goals_hash:z.string().regex(/^[a-f0-9]{64}$/),summary:z.string().trim().min(10).max(4000),strengths:z.string().trim().min(5).max(2000),development:z.string().trim().min(5).max(2000),ratings:z.array(z.strictObject({goal_id:identifier,rating:z.number().int().min(1).max(5),evidence:z.string().trim().min(5).max(1000)})).min(1).max(50).refine(v=>new Set(v.map(i=>i.goal_id)).size===v.length)}),
 z.strictObject({kind:z.literal('outcome'),review_id:identifier,outcome_kind:z.enum(['development_plan','recognition','promotion_recommendation']),plan:z.string().trim().min(10).max(4000),owner_employee_id:identifier,due_date:isoDate})
]);
export const hrPerformanceQuerySchema=z.strictObject({company_id:identifier,section:hrPerformanceSectionSchema,cycle_id:identifier.optional(),search:z.string().trim().max(120).default(''),employee_search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrPerformanceCommandSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('save'),company_id:identifier,record_id:identifier.nullable(),expected_version:z.number().int().min(0),terms:hrPerformanceTermsSchema,reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.enum(['activate','close_cycle','cancel_cycle','approve_goal','revise_goal','cancel_goal','submit_review','publish_review','return_review','submit_outcome','approve_outcome','return_outcome','complete_outcome']),company_id:identifier,record_id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(5).max(500)})
]);
export const hrPerformanceRecordSchema=z.strictObject({id:identifier,kind:z.enum(['cycle','goal','review','outcome']),parent_id:z.string().nullable(),employee_id:z.string().nullable(),employee_name:z.string().nullable(),state:z.string(),version:z.number().int(),terms:hrPerformanceTermsSchema,evidence:z.record(z.string(),z.unknown()),created_by:z.string(),updated_by:z.string(),submitted_by:z.string().nullable(),decided_by:z.string().nullable(),created_at:z.string(),updated_at:z.string(),allowed_actions:z.array(z.string())});
export const hrPerformanceWorkspaceSchema=z.strictObject({company_id:identifier,section:hrPerformanceSectionSchema,cycle_id:z.string().nullable(),cycles:z.array(z.strictObject({id:identifier,label:z.string(),state:z.string()})).max(101),cycle:hrPerformanceRecordSchema.nullable(),items:z.array(hrPerformanceRecordSchema).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),can_create:z.boolean(),employees:z.array(z.strictObject({id:identifier,label:z.string()})).max(101),employees_truncated:z.boolean(),goal_sets:z.array(z.strictObject({employee_id:identifier,employee_name:z.string(),source_hash:z.string(),weight_bps:z.number().int(),goals:z.array(hrPerformanceRecordSchema).max(50)})).max(500),published_reviews:z.array(hrPerformanceRecordSchema).max(500),blocked:z.array(z.string()),history:z.array(z.strictObject({record_id:identifier,action:z.string(),reason:z.string(),actor_id:z.string(),created_at:z.string()})).max(100)});
export type HrPerformanceTerms=z.infer<typeof hrPerformanceTermsSchema>;
export type HrPerformanceCommand=z.infer<typeof hrPerformanceCommandSchema>;
export type HrPerformanceQuery=z.infer<typeof hrPerformanceQuerySchema>;
export type HrPerformanceRecord=z.infer<typeof hrPerformanceRecordSchema>;
export type HrPerformanceWorkspace=z.infer<typeof hrPerformanceWorkspaceSchema>;

export const hrPerformanceParticipationQuerySchema=z.strictObject({company_id:identifier,cycle_id:identifier,mode:z.enum(['mine','staff']).default('mine')});
export const hrPerformanceParticipationActionSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('invite'),company_id:identifier,cycle_id:identifier,employee_id:identifier,contributor_employee_id:identifier,kind:z.enum(['self','peer']),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('submit'),company_id:identifier,cycle_id:identifier,id:identifier,expected_version:z.number().int().positive(),goals_hash:z.string().regex(/^[a-f0-9]{64}$/),summary:z.string().trim().min(10).max(4000),ratings:z.array(z.strictObject({goal_id:identifier,rating:z.number().int().min(1).max(5),evidence:z.string().trim().min(5).max(1000)})).min(1).max(50).refine(v=>new Set(v.map(r=>r.goal_id)).size===v.length),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('withdraw'),company_id:identifier,cycle_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('acknowledge'),company_id:identifier,cycle_id:identifier,review_id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(5).max(500)})
]);
export const hrPerformanceParticipationSchema=z.strictObject({company_id:identifier,cycle_id:identifier,mode:z.enum(['mine','staff']),can_invite:z.boolean(),items:z.array(z.strictObject({id:identifier,employee_id:identifier,employee_name:z.string(),contributor_employee_id:identifier,contributor_name:z.string(),kind:z.enum(['self','peer']),state:z.enum(['invited','submitted','withdrawn']),version:z.number().int(),summary:z.string(),goals_hash:z.string(),goals:z.array(z.strictObject({id:identifier,title:z.string(),weight_bps:z.number().int()})).max(50),ratings:z.array(z.strictObject({goal_id:identifier,rating:z.number().int(),evidence:z.string()})).max(50),can_submit:z.boolean(),can_withdraw:z.boolean()})).max(200),reviews:z.array(z.strictObject({id:identifier,version:z.number().int(),employee_id:identifier,employee_name:z.string(),summary:z.string(),strengths:z.string(),development:z.string(),ratings:z.array(z.strictObject({title:z.string(),rating:z.number().int(),evidence:z.string()})).max(50),score:z.string(),band:z.string(),acknowledged_at:z.string().nullable(),acknowledgement:z.string().nullable(),can_acknowledge:z.boolean()})).max(200),truncated:z.boolean()});
export type HrPerformanceParticipationQuery=z.infer<typeof hrPerformanceParticipationQuerySchema>;
export type HrPerformanceParticipationAction=z.infer<typeof hrPerformanceParticipationActionSchema>;
export type HrPerformanceParticipation=z.infer<typeof hrPerformanceParticipationSchema>;
export const hrPerformanceInboxSchema=z.strictObject({items:z.array(z.strictObject({company_id:identifier,company_name:z.string(),cycle_id:identifier,cycle_title:z.string(),state:z.string()})).max(100),truncated:z.boolean()});
export type HrPerformanceInbox=z.infer<typeof hrPerformanceInboxSchema>;

export function calculateHrSettlementMinor(quantity:string,rateMinor:string,divisor=1,multiplier=1):string{
 if(!/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$/.test(quantity)||!/^(0|[1-9][0-9]{0,14})$/.test(rateMinor))throw new RangeError('Use a nonnegative quantity with at most four decimals and an integer minor-unit rate.');
 if(!Number.isInteger(divisor)||divisor<1||divisor>36600||!Number.isInteger(multiplier)||multiplier<1||multiplier>10000)throw new RangeError('Use bounded positive integer rate factors.');
 const [whole,fraction='']=quantity.split('.');const units=BigInt(whole!)*10000n+BigInt(fraction.padEnd(4,'0')),denominator=10000n*BigInt(divisor),numerator=units*BigInt(rateMinor)*BigInt(multiplier);const amount=(numerator*2n+denominator)/(denominator*2n);
 if(amount>999999999999999n)throw new RangeError('The calculated settlement line exceeds the supported amount.');return amount.toString();
}
const lifecycleTask=z.strictObject({id:identifier,title:z.string().trim().min(3).max(160),complete:z.boolean(),evidence:z.string().trim().max(1000)}).refine(t=>!t.complete||t.evidence.length>=5,{message:'Completed tasks need evidence.'});
export const hrLifecycleCaseTermsSchema=z.discriminatedUnion('kind',[
 z.strictObject({kind:z.literal('onboarding'),relationship_id:identifier,due_date:isoDate,notes:z.string().trim().max(4000),tasks:z.array(lifecycleTask).min(1).max(30).refine(v=>new Set(v.map(t=>t.id)).size===v.length)}),
 z.strictObject({kind:z.literal('probation'),relationship_id:identifier,effective_date:isoDate,recommendation:z.enum(['confirm','extend']),extension_until:isoDate.nullable(),rating:z.number().int().min(1).max(5),summary:z.string().trim().min(10).max(4000)}),
 z.strictObject({kind:z.enum(['resignation','termination']),relationship_id:identifier,last_working_date:isoDate,notice_reference:z.string().trim().min(5).max(500),summary:z.string().trim().min(10).max(4000)}),
 z.strictObject({kind:z.literal('clearance'),exit_case_id:identifier,tasks:z.array(lifecycleTask).min(1).max(30).refine(v=>new Set(v.map(t=>t.id)).size===v.length),notes:z.string().trim().max(4000)}),
 z.strictObject({kind:z.literal('settlement'),exit_case_id:identifier,currency:z.string().regex(/^[A-Z]{3}$/),lines:z.array(z.strictObject({benefit_source_id:identifier.optional(),encashment_source_id:identifier.optional(),direction:z.enum(['earning','deduction']),description:z.string().trim().min(3).max(160),amount_minor:z.string().regex(/^(0|[1-9][0-9]{0,14})$/),calculation:z.strictObject({quantity:z.string().regex(/^(0|[1-9][0-9]{0,6})(\.[0-9]{1,4})?$/),rate_minor:z.string().regex(/^(0|[1-9][0-9]{0,14})$/),rounding:z.literal('half_up'),rate_divisor:z.number().int().min(1).max(36600).optional(),rate_multiplier:z.number().int().min(1).max(10000).optional()}).optional(),source_reference:z.string().trim().min(5).max(500)}).refine(l=>{try{return !l.calculation||calculateHrSettlementMinor(l.calculation.quantity,l.calculation.rate_minor,l.calculation.rate_divisor,l.calculation.rate_multiplier)===l.amount_minor;}catch{return false;}},{message:'The settlement amount must match its exact reviewed quantity and rate.'})).min(1).max(30),notes:z.string().trim().min(10).max(4000)})
]);
export const hrLifecycleCaseQuerySchema=z.strictObject({company_id:identifier,section:z.enum(['onboarding','probation','resignation','termination','clearance','settlement','offboarding']),search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrLifecycleCaseActionSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('calculate_payroll_correction'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),correction_id:identifier,correction_source_hash:z.string().regex(/^[a-f0-9]{64}$/),posting_date:isoDate,taxable_lines:z.array(z.number().int().min(0).max(29)).max(30).refine(v=>new Set(v).size===v.length),tax_treatment_reviewed:z.literal(true),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.enum(['approve_payroll_correction','reject_payroll_correction','post_payroll_correction']),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),execution_id:identifier,execution_version:z.number().int().positive(),execution_source_hash:z.string().regex(/^[a-f0-9]{64}$/),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('request_financial_correction'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),correction_source_hash:z.string().regex(/^[a-f0-9]{64}$/),corrections:z.array(z.strictObject({line_index:z.number().int().min(0).max(29),corrected_minor:z.string().regex(/^(0|[1-9][0-9]{0,14})$/),corrected_leave_days:z.string().regex(/^(0|[1-9][0-9]{0,4})(\.[0-9]{1,4})?$/).refine(v=>Number(v)<=36500).optional()})).min(1).max(30).refine(v=>new Set(v.map(x=>x.line_index)).size===v.length),authority_reference:z.string().trim().min(10).max(1000),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('decide_financial_correction'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),correction_id:identifier,decision:z.enum(['approve','reject']),reason:z.string().trim().min(5).max(500)}),

 z.strictObject({action:z.literal('prepare_payroll'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),month:isoDate.refine(v=>v.endsWith('-01')),unprocessed_entitlements_only:z.literal(true),mappings:z.array(z.strictObject({line_index:z.number().int().min(0).max(29),component_id:identifier.nullable(),exclusion_reason:z.string().trim().max(500)}).refine(m=>m.component_id?m.exclusion_reason==='':m.exclusion_reason.length>=5)).min(1).max(30).refine(v=>new Set(v.map(m=>m.line_index)).size===v.length),reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.literal('save'),company_id:identifier,id:identifier.nullable(),expected_version:z.number().int().min(0),terms:hrLifecycleCaseTermsSchema,reason:z.string().trim().min(5).max(500)}),
 z.strictObject({action:z.enum(['submit','approve','return','cancel','apply_exit','request_void','approve_void','reject_void']),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(5).max(500)})
]);
export const hrSettlementPayrollLinkSchema=z.strictObject({finance_state:z.string().nullable().default(null),line_index:z.number().int(),revision:z.number().int(),adjustment_id:identifier.nullable(),component_id:identifier.nullable(),month:isoDate,state:z.string(),exclusion_reason:z.string(),reason:z.string(),created_by:z.string(),created_at:z.string(),result_id:identifier.nullable(),period_state:z.string().nullable(),journal_id:identifier.nullable()});
export const hrSettlementVoidRecordSchema=z.strictObject({id:identifier,state:z.enum(['submitted','approved','rejected']),case_version:z.number().int(),requested_by:z.string(),decided_by:z.string().nullable(),reason:z.string(),decision_reason:z.string().nullable(),created_at:z.string(),decided_at:z.string().nullable()});
export const hrSettlementCountryScopeSchema=z.strictObject({country_code:z.string().regex(/^[A-Z]{2}$/),jurisdiction_id:identifier.nullable(),basis:z.enum(['legal_employer','work_location']),authority_reference:z.string().trim().min(10).max(1000)});
export type HrSettlementCountryScope=z.infer<typeof hrSettlementCountryScopeSchema>;
export const hrSettlementCountryEvidenceSchema=z.strictObject({as_of:isoDate,basis:z.enum(['legal_employer','work_location']),country_code:z.string().nullable(),country_name:z.string().nullable(),profile_id:identifier.nullable(),jurisdictions:z.array(z.strictObject({id:identifier,name:z.string(),level:z.string()})).max(32),selected_rule_id:identifier,matched_rule_id:identifier.nullable(),matched_rule_name:z.string().nullable(),authority_reference:z.string().nullable()});
export type HrSettlementCountryEvidence=z.infer<typeof hrSettlementCountryEvidenceSchema>;
export const hrSettlementCorrectionExecutionRecordSchema=z.strictObject({id:identifier,correction_id:identifier,state:z.enum(['calculated','approved','rejected','posted']),version:z.number().int().positive(),source_hash:z.string(),posting_date:isoDate,created_by:z.string(),approved_by:z.string().nullable(),posted_by:z.string().nullable(),journal_id:z.string().nullable(),entry_number:z.string().nullable(),reason:z.string(),decision_reason:z.string().nullable(),net_delta:z.string(),taxable_lines:z.array(z.number().int()),leave_changes:z.array(z.strictObject({source_id:identifier,leave_type_id:identifier,original_days:z.string(),corrected_days:z.string(),delta_days:z.string()})).max(30).default([]),months:z.array(z.strictObject({month:isoDate,result_id:identifier,before_gross:z.string(),after_gross:z.string(),before_deductions:z.string(),after_deductions:z.string(),before_net:z.string(),after_net:z.string()})).max(120),journal_lines:z.array(z.strictObject({account_id:identifier,debit:z.string(),credit:z.string()})).max(1000),allowed_actions:z.array(z.string())});
export const hrSettlementCorrectionWorkspaceSchema=z.strictObject({can_calculate:z.boolean().default(false),base_lines:z.array(z.strictObject({line_index:z.number().int(),amount_minor:z.string(),leave_days:z.string().optional()})).max(30).default([]),executions:z.array(hrSettlementCorrectionExecutionRecordSchema).max(25).default([]),source_hash:z.string(),can_request:z.boolean(),records:z.array(z.strictObject({id:identifier,state:z.enum(['submitted','approved','rejected','processed']),source_hash:z.string(),lines:z.array(z.strictObject({line_index:z.number().int(),original_minor:z.string(),corrected_minor:z.string(),delta_minor:z.string(),original_leave_days:z.string().optional(),corrected_leave_days:z.string().optional()})).min(1).max(30),net_delta_minor:z.string(),authority_reference:z.string(),reason:z.string(),requested_by:z.string(),decided_by:z.string().nullable(),decision_reason:z.string().nullable(),created_at:z.string(),decided_at:z.string().nullable(),can_approve:z.boolean(),can_reject:z.boolean(),stale:z.boolean()})).max(25)});
export type HrSettlementCorrectionWorkspace=z.infer<typeof hrSettlementCorrectionWorkspaceSchema>;
export const hrLifecycleCaseRecordSchema=z.strictObject({financial_corrections:hrSettlementCorrectionWorkspaceSchema.nullable().default(null),country_sources:z.array(z.strictObject({source_id:identifier,family:z.enum(['benefit','encashment']),evidence:hrSettlementCountryEvidenceSchema})).max(30).default([]),void_requests:z.array(hrSettlementVoidRecordSchema).max(25).default([]),void_blockers:z.array(z.string()).default([]),payroll_links:z.array(hrSettlementPayrollLinkSchema).max(30).default([]),can_prepare_payroll:z.boolean().default(false),id:identifier,kind:z.string(),relationship_id:identifier,employee_id:identifier,employee_name:z.string(),state:z.string(),version:z.number().int(),terms:hrLifecycleCaseTermsSchema,evidence:z.record(z.string(),z.unknown()),created_by:z.string(),updated_by:z.string(),submitted_by:z.string().nullable(),decided_by:z.string().nullable(),updated_at:z.string(),allowed_actions:z.array(z.string())});
export const hrLifecycleCaseWorkspaceSchema=z.strictObject({payroll_components:z.array(z.strictObject({id:identifier,code:z.string(),name:z.string(),kind:z.enum(['earning','deduction'])})).max(200).default([]),company_id:identifier,section:hrLifecycleCaseQuerySchema.shape.section,items:z.array(hrLifecycleCaseRecordSchema).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),can_create:z.boolean(),relationships:z.array(z.strictObject({id:identifier,employee_id:identifier,label:z.string(),status:z.string(),policy_id:z.string().nullable()})).max(200),exits:z.array(hrLifecycleCaseRecordSchema).max(200),currencies:z.array(z.strictObject({code:z.string(),decimal_places:z.number().int()})).max(200),history:z.array(z.strictObject({record_id:identifier,action:z.string(),reason:z.string(),actor_id:z.string(),created_at:z.string()})).max(100),truncated:z.boolean()});
export type HrLifecycleCaseTerms=z.infer<typeof hrLifecycleCaseTermsSchema>;
export type HrLifecycleCaseQuery=z.infer<typeof hrLifecycleCaseQuerySchema>;
export type HrLifecycleCaseAction=z.infer<typeof hrLifecycleCaseActionSchema>;
export type HrLifecycleCaseRecord=z.infer<typeof hrLifecycleCaseRecordSchema>;
export type HrLifecycleCaseWorkspace=z.infer<typeof hrLifecycleCaseWorkspaceSchema>;

export const hrPolicyUpgradeQuerySchema=z.strictObject({company_id:identifier,search:z.string().trim().max(120).default(''),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrPolicyUpgradeActionSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('request'),company_id:identifier,relationship_id:identifier,target_policy_id:identifier,effective_on:isoDate,reason:z.string().trim().min(10).max(500)}),
 z.strictObject({action:z.enum(['approve','reject','cancel']),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(10).max(500)})
]);
export const hrPolicyUpgradeRecordSchema=z.strictObject({id:identifier,relationship_id:identifier,employee_name:z.string(),source_policy_id:identifier,source_policy:z.string(),target_policy_id:identifier,target_policy:z.string(),from_state:z.string(),target_state:z.string(),effective_on:isoDate,state:z.enum(['pending','approved','rejected','cancelled']),version:z.number().int(),requested_by:z.string(),decided_by:z.string().nullable(),reason:z.string(),decision_reason:z.string(),snapshot:z.record(z.string(),z.unknown()),created_at:z.string(),allowed_actions:z.array(z.string())});
export const hrPolicyUpgradeWorkspaceSchema=z.strictObject({company_id:identifier,items:z.array(hrPolicyUpgradeRecordSchema).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),can_request:z.boolean(),relationships:z.array(z.strictObject({id:identifier,label:z.string(),effective_policy_id:identifier,effective_policy:z.string(),current_state:z.string()})).max(200),policies:z.array(z.strictObject({id:identifier,label:z.string(),effective_from:isoDate,effective_to:isoDate.nullable()})).max(200),truncated:z.boolean()});
export type HrPolicyUpgradeQuery=z.infer<typeof hrPolicyUpgradeQuerySchema>;
export type HrPolicyUpgradeAction=z.infer<typeof hrPolicyUpgradeActionSchema>;
export type HrPolicyUpgradeWorkspace=z.infer<typeof hrPolicyUpgradeWorkspaceSchema>;

const encashmentDays=z.string().regex(/^(0|[1-9][0-9]{0,3})(\.[0-9]{1,4})?$/).refine(v=>Number(v)>0);
export const hrSettlementSalaryEvidenceSchema=z.strictObject({assignment_id:identifier,assignment_version:z.number().int().positive(),effective_from:isoDate,effective_to:isoDate.nullable(),basis_minor:z.string(),multiplier:z.number().int(),divisor:z.number().int(),components:z.array(z.strictObject({id:identifier,name:z.string(),amount_minor:z.string()})).min(1).max(30)});
export type HrSettlementSalaryEvidence=z.infer<typeof hrSettlementSalaryEvidenceSchema>;
export const hrSettlementSalaryBasisSchema=z.strictObject({component_ids:z.array(identifier).min(1).max(30).refine(v=>new Set(v).size===v.length),multiplier:z.number().int().min(1).max(10000),divisor:z.number().int().min(1).max(36600)});
export type HrSettlementSalaryBasis=z.infer<typeof hrSettlementSalaryBasisSchema>;
const settlementCountryOptions={legal_countries:z.array(z.strictObject({code:z.string(),name:z.string()})).max(250).default([]),legal_jurisdictions:z.array(z.strictObject({id:identifier,name:z.string(),country_code:z.string(),parent_id:identifier.nullable(),level:z.string()})).max(500).default([])};
export const hrEncashmentRuleTermsSchema=z.strictObject({legal_scope:hrSettlementCountryScopeSchema.optional(),name:z.string().trim().min(3).max(160),leave_type_id:identifier,salary_basis:hrSettlementSalaryBasisSchema.optional(),currency:z.string().regex(/^[A-Z]{3}$/),rate_minor:z.string().regex(/^(0|[1-9][0-9]{0,14})$/),maximum_days:encashmentDays,minimum_service_days:z.number().int().min(0).max(36500),effective_from:isoDate,effective_to:isoDate,policy_reference:z.string().trim().min(10).max(1000)}).refine(v=>(v.salary_basis?v.rate_minor==='0':v.rate_minor!=='0')&&v.effective_to>=v.effective_from,'Choose an ordered policy period.');
export const hrSettlementEntitlementQuerySchema=z.strictObject({country_code:z.string().regex(/^[A-Z]{2}$/).optional(),company_id:identifier,exit_case_id:identifier.optional(),rule_id:identifier.optional(),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
const encashmentCommand={company_id:identifier,reason:z.string().trim().min(10).max(500)};
export const hrSettlementEntitlementActionSchema=z.discriminatedUnion('action',[
 z.strictObject({...encashmentCommand,action:z.literal('create_rule'),terms:hrEncashmentRuleTermsSchema}),
 z.strictObject({...encashmentCommand,action:z.enum(['submit_rule','approve_rule','reject_rule']),id:identifier,expected_version:z.number().int().positive()}),
 z.strictObject({...encashmentCommand,action:z.literal('add_to_statement'),id:identifier,expected_version:z.number().int().positive(),rule_id:identifier,source_hash:z.string().regex(/^[a-f0-9]{64}$/)})
]);
export const hrSettlementEntitlementWorkspaceSchema=z.strictObject({...settlementCountryOptions,can_configure_salary:z.boolean().default(false),salary_components:z.array(z.strictObject({id:identifier,name:z.string(),code:z.string()})).max(200).default([]),company_id:identifier,can_create_rule:z.boolean(),items:z.array(z.strictObject({id:identifier,terms:hrEncashmentRuleTermsSchema,money_scale:z.number().int().nullable(),leave_type:z.string(),state:z.enum(['draft','submitted','approved','rejected']),version:z.number().int(),created_by:z.string(),submitted_by:z.string().nullable(),decided_by:z.string().nullable(),reason:z.string(),allowed_actions:z.array(z.enum(['submit_rule','approve_rule','reject_rule']))})).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),leave_types:z.array(z.strictObject({id:identifier,name:z.string()})).max(200),currencies:z.array(z.strictObject({code:z.string(),decimal_places:z.number().int()})).max(200),preview:z.strictObject({country_scope:hrSettlementCountryEvidenceSchema.nullable().default(null),salary:hrSettlementSalaryEvidenceSchema.nullable().default(null),rule_id:identifier,exit_case_id:identifier,employee_name:z.string(),as_of:isoDate,balance:z.string(),reserved:z.string(),future_used:z.string(),available:z.string(),eligible_days:z.string(),rate_minor:z.string(),amount_minor:z.string(),currency:z.string(),money_scale:z.number().int(),source_hash:z.string(),blockers:z.array(z.string())}).nullable()});
export type HrSettlementEntitlementQuery=z.infer<typeof hrSettlementEntitlementQuerySchema>;
export type HrSettlementEntitlementAction=z.infer<typeof hrSettlementEntitlementActionSchema>;
export type HrSettlementEntitlementWorkspace=z.infer<typeof hrSettlementEntitlementWorkspaceSchema>;

export const hrBenefitRuleTermsSchema=z.strictObject({legal_scope:hrSettlementCountryScopeSchema.optional(),name:z.string().trim().min(3).max(160),category:z.enum(['gratuity','severance','notice','other']),salary_basis:hrSettlementSalaryBasisSchema.optional(),basis:z.enum(['fixed_amount','completed_service_years','service_days']),service_day_count:z.enum(['elapsed','inclusive']).optional(),rate_factors:z.strictObject({multiplier:z.number().int().min(1).max(10000),divisor:z.number().int().min(1).max(36600)}).optional(),direction:z.enum(['earning','deduction']),currency:z.string().regex(/^[A-Z]{3}$/),rate_minor:z.string().regex(/^(0|[1-9][0-9]{0,14})$/),maximum_units:z.number().int().min(1).max(36500),minimum_service_days:z.number().int().min(0).max(36500),exit_kinds:z.array(z.enum(['resignation','termination'])).min(1).max(2).refine(v=>new Set(v).size===v.length),effective_from:isoDate,effective_to:isoDate,policy_reference:z.string().trim().min(10).max(1000)}).refine(v=>(v.basis==='service_days'?!!v.service_day_count&&!!(v.salary_basis||v.rate_factors):!v.service_day_count&&v.maximum_units<=100)&&!(v.salary_basis&&v.rate_factors)&&(v.salary_basis?v.rate_minor==='0':v.rate_minor!=='0')&&v.effective_to>=v.effective_from && (v.basis!=='fixed_amount'||v.maximum_units===1),'Use explicit day counting and rate factors for service days, one rate source, ordered dates and the correct unit cap.');
export const hrSettlementBenefitQuerySchema=z.strictObject({country_code:z.string().regex(/^[A-Z]{2}$/).optional(),company_id:identifier,exit_case_id:identifier.optional(),rule_id:identifier.optional(),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrSettlementBenefitActionSchema=z.discriminatedUnion('action',[
 z.strictObject({...encashmentCommand,action:z.literal('create_rule'),terms:hrBenefitRuleTermsSchema}),
 z.strictObject({...encashmentCommand,action:z.enum(['submit_rule','approve_rule','reject_rule']),id:identifier,expected_version:z.number().int().positive()}),
 z.strictObject({...encashmentCommand,action:z.literal('add_to_statement'),id:identifier,expected_version:z.number().int().positive(),rule_id:identifier,source_hash:z.string().regex(/^[a-f0-9]{64}$/)})
]);
export const hrSettlementBenefitWorkspaceSchema=z.strictObject({...settlementCountryOptions,can_configure_salary:z.boolean().default(false),salary_components:z.array(z.strictObject({id:identifier,name:z.string(),code:z.string()})).max(200).default([]),company_id:identifier,can_create_rule:z.boolean(),items:z.array(z.strictObject({id:identifier,terms:hrBenefitRuleTermsSchema,money_scale:z.number().int().nullable(),state:z.enum(['draft','submitted','approved','rejected']),version:z.number().int(),created_by:z.string(),submitted_by:z.string().nullable(),decided_by:z.string().nullable(),reason:z.string(),allowed_actions:z.array(z.enum(['submit_rule','approve_rule','reject_rule']))})).max(50),total:z.number().int(),limit:z.number().int(),offset:z.number().int(),currencies:z.array(z.strictObject({code:z.string(),decimal_places:z.number().int()})).max(200),preview:z.strictObject({quantity_label:z.string().default('units'),country_scope:hrSettlementCountryEvidenceSchema.nullable().default(null),salary:hrSettlementSalaryEvidenceSchema.nullable().default(null),rule_id:identifier,exit_case_id:identifier,employee_name:z.string(),as_of:isoDate,employed_from:isoDate,service_days:z.number().int(),completed_service_years:z.number().int(),eligible_units:z.number().int(),rate_minor:z.string(),amount_minor:z.string(),currency:z.string(),money_scale:z.number().int(),direction:z.enum(['earning','deduction']),source_hash:z.string(),blockers:z.array(z.string())}).nullable()});
export type HrSettlementBenefitQuery=z.infer<typeof hrSettlementBenefitQuerySchema>;
export type HrSettlementBenefitAction=z.infer<typeof hrSettlementBenefitActionSchema>;
export type HrSettlementBenefitWorkspace=z.infer<typeof hrSettlementBenefitWorkspaceSchema>;

export type HrBenefitRuleTerms=z.infer<typeof hrBenefitRuleTermsSchema>;

// Employee-owned reads use the active Security binding, never a caller-supplied employee ID.
export const hrSelfServiceQuerySchema = z.strictObject({
  company_id: identifier.optional(),
  month: isoDate.refine(v => v.endsWith('-01'), 'Choose the first day of a month'),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
export const hrSelfServicePayslipQuerySchema = z.strictObject({company_id: identifier});
export const hrSelfServiceWorkspaceSchema = z.strictObject({
  memberships: z.array(z.strictObject({company_id: identifier, company_name: z.string(), employee_id: identifier, employee_name: z.string(), employee_number: z.string()})).max(100),
  memberships_truncated: z.boolean(),
  company_id: identifier.nullable(),
  month: isoDate,
  status: z.enum(['ready', 'link_required']),
  can_apply_leave: z.boolean().default(false),
  payslips: z.array(z.strictObject({id: identifier, month: isoDate, currency: z.string(), gross: z.string(), deductions: z.string(), net: z.string(), released_at: z.string()})).max(50),
  payslip_total: z.number().int().nonnegative(),
  requests: z.array(z.strictObject({id: identifier, reference: z.string(), leave_type: z.string(), from_date: isoDate, to_date: isoDate, days: z.string(), status: z.string()})).max(50),
  request_total: z.number().int().nonnegative(),
  balances: z.array(hrLeaveBalanceSchema).max(50),
  balances_truncated: z.boolean(),
  loans: z.array(z.strictObject({id: identifier, reference: z.string(), currency: z.string(), principal: z.string(), recovered: z.string(), outstanding: z.string(), state: z.string()})).max(50),
  loan_total: z.number().int().nonnegative(),
  limit: z.number().int(), offset: z.number().int(),
});
export type HrSelfServiceQuery = z.infer<typeof hrSelfServiceQuerySchema>;
export type HrSelfServiceWorkspace = z.infer<typeof hrSelfServiceWorkspaceSchema>;

export const hrSelfLeaveContextQuerySchema=z.strictObject({company_id:identifier,leave_type_id:identifier.optional(),from_date:leaveDate,to_date:leaveDate})
  .refine(v=>hrLeaveContextQuerySchema.safeParse(v).success,'Select an ordered range of at most 62 calendar days');
export const createHrSelfLeaveRequestSchema=z.strictObject({company_id:identifier,leave_type_id:identifier,from_date:leaveDate,to_date:leaveDate,days:z.array(hrLeaveAllocationSchema).min(1).max(62),reason:z.string().trim().min(12).max(1000),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/)})
  .refine(v=>createHrLeaveRequestSchema.safeParse({...v,employee_id:'self',document_id:null}).success,'Review the range and unique daily allocations');
export const hrSelfLeaveActionSchema=z.strictObject({company_id:identifier,action:z.enum(['submit','cancel']),expected_version:z.number().int().positive(),expected_evidence_hash:z.string().regex(/^[0-9a-f]{64}$/).optional(),reason:z.string().trim().min(12).max(1000)});
export type HrSelfLeaveContextQuery=z.infer<typeof hrSelfLeaveContextQuerySchema>;
export type CreateHrSelfLeaveRequest=z.infer<typeof createHrSelfLeaveRequestSchema>;
export type HrSelfLeaveAction=z.infer<typeof hrSelfLeaveActionSchema>;

export const hrPersonalProfileSchema=z.strictObject({first_name:z.string().trim().min(1).max(100),middle_name:z.string().trim().max(100),last_name:z.string().trim().min(1).max(100),preferred_name:z.string().trim().max(100),date_of_birth:isoDate.nullable(),personal_email:z.union([z.literal(''),z.email().max(320)]),phone:z.string().trim().max(40)});
export const hrPersonalCorrectionQuerySchema=z.strictObject({company_id:identifier,mode:z.enum(['mine','review']).default('mine'),state:z.enum(['all','submitted','approved','rejected','cancelled']).default('all'),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const createHrPersonalCorrectionSchema=z.strictObject({company_id:identifier,profile:hrPersonalProfileSchema,expected_source_hash:z.string().regex(/^[0-9a-f]{64}$/),reason:z.string().trim().min(12).max(1000)});
export const hrPersonalCorrectionActionSchema=z.strictObject({company_id:identifier,action:z.enum(['approve','reject','cancel']),expected_version:z.number().int().positive(),reason:z.string().trim().min(12).max(1000),review_reference:z.string().trim().max(500).default('')}).refine(v=>v.action!=='approve'||v.review_reference.length>=12,'Record the independently verified supporting information reference');
export const hrPersonalCorrectionRecordSchema=z.strictObject({id:identifier,company_id:identifier,employee_id:identifier,employee_number:z.string(),employee_name:z.string(),version:z.number().int().positive(),state:z.enum(['submitted','approved','rejected','cancelled']),before:hrPersonalProfileSchema,proposed:hrPersonalProfileSchema,source_hash:z.string(),requested_by:z.string(),reason:z.string(),created_at:z.string(),decided_by:z.string().nullable(),decision_reason:z.string(),review_reference:z.string(),decided_at:z.string().nullable(),allowed_actions:z.array(z.enum(['approve','reject','cancel']))});
export const hrPersonalCorrectionWorkspaceSchema=z.strictObject({company_id:identifier,mode:z.enum(['mine','review']),current:hrPersonalProfileSchema.nullable(),source_hash:z.string().nullable(),can_request:z.boolean(),items:z.array(hrPersonalCorrectionRecordSchema).max(50),total:z.number().int().nonnegative(),limit:z.number().int(),offset:z.number().int()});
export type HrPersonalProfile=z.infer<typeof hrPersonalProfileSchema>;
export type HrPersonalCorrectionQuery=z.infer<typeof hrPersonalCorrectionQuerySchema>;
export type CreateHrPersonalCorrection=z.infer<typeof createHrPersonalCorrectionSchema>;
export type HrPersonalCorrectionAction=z.infer<typeof hrPersonalCorrectionActionSchema>;
export type HrPersonalCorrectionWorkspace=z.infer<typeof hrPersonalCorrectionWorkspaceSchema>;

export const hrGovernedReportIdSchema=z.enum(['employee_directory','payroll_results']);
export const hrReportGovernanceQuerySchema=z.strictObject({company_id:identifier,section:z.enum(['policies','exports','audit']),limit:z.coerce.number().int().min(1).max(50).default(25),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrReportExportPolicyTermsSchema=z.strictObject({max_rows:z.number().int().min(1).max(5000),expires_after_hours:z.number().int().min(1).max(168),reports:z.array(hrGovernedReportIdSchema).min(1).max(2)}).refine(v=>new Set(v.reports).size===v.reports.length,'Choose each report once');
export const hrReportGovernanceActionSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.literal('create_policy'),company_id:identifier,terms:hrReportExportPolicyTermsSchema,reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.enum(['approve_policy','reject_policy']),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.literal('create_export'),company_id:identifier,report:hrGovernedReportIdSchema,from_date:isoDate,to_date:isoDate,reason:z.string().trim().min(12).max(1000)}).refine(v=>v.to_date>=v.from_date&&Date.parse(v.to_date)-Date.parse(v.from_date)<=366*86400000,'Choose an ordered date range of at most 367 days'),
 z.strictObject({action:z.literal('download'),company_id:identifier,id:identifier,reason:z.string().trim().min(12).max(1000)})
]);
export const hrReportExportPolicySchema=z.strictObject({id:identifier,version:z.number().int().positive(),state:z.enum(['submitted','approved','rejected']),terms:hrReportExportPolicyTermsSchema,created_by:z.string(),created_at:z.string(),reason:z.string(),decided_by:z.string().nullable(),decided_at:z.string().nullable(),decision_reason:z.string(),allowed_actions:z.array(z.enum(['approve_policy','reject_policy']))});
export const hrReportExportRecordSchema=z.strictObject({id:identifier,report:hrGovernedReportIdSchema,from_date:isoDate,to_date:isoDate,row_count:z.number().int().nonnegative(),source_hash:z.string(),policy_id:identifier,created_by:z.string(),created_at:z.string(),expires_at:z.string(),expired:z.boolean(),can_download:z.boolean(),reason:z.string()});
export const hrReportGovernanceWorkspaceSchema=z.strictObject({company_id:identifier,section:z.enum(['policies','exports','audit']),catalogue:z.array(z.strictObject({id:hrGovernedReportIdSchema,title:z.string(),description:z.string(),can_export:z.boolean()})),active_policy:hrReportExportPolicySchema.nullable(),policies:z.array(hrReportExportPolicySchema),exports:z.array(hrReportExportRecordSchema),events:z.array(z.strictObject({id:identifier,kind:z.string(),record_id:identifier,actor_id:z.string(),reason:z.string(),occurred_at:z.string()})),total:z.number().int().nonnegative(),limit:z.number().int(),offset:z.number().int(),can_manage_policy:z.boolean()});
export const hrReportGovernanceResultSchema=hrAttendanceCompletionResultSchema.extend({download:z.strictObject({filename:z.string(),content_type:z.literal('text/csv;charset=utf-8'),csv:z.string().max(3000000),row_count:z.number().int().nonnegative()}).optional()});
export type HrReportGovernanceQuery=z.infer<typeof hrReportGovernanceQuerySchema>;
export type HrReportGovernanceAction=z.infer<typeof hrReportGovernanceActionSchema>;
export type HrReportGovernanceWorkspace=z.infer<typeof hrReportGovernanceWorkspaceSchema>;
export type HrReportGovernanceResult=z.infer<typeof hrReportGovernanceResultSchema>;

export const hrLearningSlotSchema=z.strictObject({starts_at:z.iso.datetime({offset:true}),ends_at:z.iso.datetime({offset:true})}).refine(v=>Date.parse(v.ends_at)>Date.parse(v.starts_at)&&Date.parse(v.ends_at)-Date.parse(v.starts_at)<=86400000,'A lesson must end after its start and last at most 24 hours');
export const hrLearningProgrammeTermsSchema=z.strictObject({kind:z.literal('programme'),code:z.string().trim().min(1).max(40),name:z.string().trim().min(3).max(160),objectives:z.string().trim().min(12).max(2000),category:z.enum(['Technical','Compliance','Leadership','Safety','Onboarding']),delivery_mode:z.enum(['Classroom','Online','On the job','External']),provider:z.string().trim().min(2).max(160),duration_minutes:z.number().int().min(1).max(44640),cost_per_participant:z.string().regex(/^\d{1,9}(\.\d{1,4})?$/),currency:z.string().regex(/^[A-Z]{3}$/),mandatory:z.boolean(),minimum_attendance_percent:z.number().int().min(1).max(100),pass_mark:z.number().int().min(0).max(100).nullable(),validity_months:z.number().int().min(1).max(120).nullable(),prerequisite_ids:z.array(identifier).max(10)}).refine(v=>new Set(v.prerequisite_ids).size===v.prerequisite_ids.length,'Choose each prerequisite once');
export const hrLearningRequestTermsSchema=z.strictObject({kind:z.literal('request'),programme_id:identifier,justification:z.string().trim().min(12).max(2000),goal_id:identifier.nullable(),outcome_id:identifier.nullable()});
export const hrLearningSessionTermsSchema=z.strictObject({kind:z.literal('session'),programme_id:identifier,title:z.string().trim().min(3).max(160),trainer:z.string().trim().min(3).max(160),location:z.string().trim().min(3).max(240),capacity:z.number().int().min(1).max(200),slots:z.array(hrLearningSlotSchema).min(1).max(31)}).refine(v=>v.slots.every((s,i)=>i===0||Date.parse(s.starts_at)>=Date.parse(v.slots[i-1]!.ends_at)),'Lessons must be ordered and must not overlap');
export const hrLearningAttendanceSchema=z.strictObject({starts_at:z.iso.datetime({offset:true}),minutes:z.number().int().min(0).max(1440),note:z.string().trim().max(500)});
export const hrLearningParticipationTermsSchema=z.strictObject({kind:z.literal('participation'),request_id:identifier,session_id:identifier,attendance:z.array(hrLearningAttendanceSchema).max(31),assessment_score:z.number().int().min(0).max(100).nullable(),evidence_reference:z.string().trim().max(500)});
export const hrLearningCompletionTermsSchema=z.strictObject({kind:z.literal('completion'),participation_id:identifier,employee_name:z.string(),employee_number:z.string(),programme_name:z.string(),session_title:z.string(),completed_on:isoDate,attendance_percent:z.number().min(0).max(100),assessment_score:z.number().int().min(0).max(100).nullable(),result:z.enum(['passed','failed']),certificate_id:identifier,valid_until:isoDate.nullable(),source_hash:z.string().regex(/^[0-9a-f]{64}$/),evidence_reference:z.string(),minimum_attendance_percent:z.number().int(),pass_mark:z.number().int().nullable()});
export const hrLearningTermsSchema=z.union([hrLearningProgrammeTermsSchema,hrLearningRequestTermsSchema,hrLearningSessionTermsSchema,hrLearningParticipationTermsSchema,hrLearningCompletionTermsSchema]);
export const hrLearningQuerySchema=z.strictObject({company_id:identifier,section:z.enum(['programmes','requests','sessions','completions']),mode:z.enum(['hr','mine']).default('hr'),record_id:identifier.optional(),search:z.string().trim().max(100).default(''),state:z.string().trim().max(30).default('all'),limit:z.coerce.number().int().min(1).max(50).default(10),offset:z.coerce.number().int().min(0).max(100000).default(0)});
export const hrLearningActionSchema=z.discriminatedUnion('action',[
 z.strictObject({action:z.enum(['create','update']),company_id:identifier,id:identifier.optional(),expected_version:z.number().int().nonnegative(),employee_id:identifier.optional(),terms:z.union([hrLearningProgrammeTermsSchema,hrLearningRequestTermsSchema,hrLearningSessionTermsSchema]),reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.enum(['submit','activate','archive','manager_approve','hr_approve','reject','cancel','schedule','close','withdraw','finalize','revoke','void']),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.literal('enroll'),company_id:identifier,request_id:identifier,session_id:identifier,expected_request_version:z.number().int().positive(),expected_session_version:z.number().int().positive(),reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.literal('attendance'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),attendance:z.array(hrLearningAttendanceSchema).max(31),assessment_score:z.number().int().min(0).max(100).nullable(),evidence_reference:z.string().trim().min(12).max(500),reason:z.string().trim().min(12).max(1000)}),
 z.strictObject({action:z.literal('propose_completion'),company_id:identifier,id:identifier,expected_version:z.number().int().positive(),reason:z.string().trim().min(12).max(1000)})
]);
export const hrLearningRecordSchema=z.strictObject({id:identifier,company_id:identifier,kind:z.enum(['programme','request','session','participation','completion']),programme_id:identifier.nullable(),parent_id:identifier.nullable(),employee_id:identifier.nullable(),employee_name:z.string(),employee_number:z.string(),version:z.number().int().positive(),state:z.string(),terms:hrLearningTermsSchema,created_by:identifier,updated_by:identifier,manager_user_id:identifier.nullable(),manager_decided_by:identifier.nullable(),created_at:z.string(),updated_at:z.string(),allowed_actions:z.array(z.string()),expired:z.boolean()});
export const hrLearningEventSchema=z.strictObject({id:identifier,record_id:identifier,version:z.number().int(),action:z.string(),reason:z.string(),actor_id:identifier,occurred_at:z.string()});
export const hrLearningCertificateSchema=z.strictObject({record:hrLearningRecordSchema,issuer_name:z.string(),company_name:z.string(),issued_at:z.string()});
export const hrLearningWorkspaceSchema=z.strictObject({company_id:identifier,section:z.enum(['programmes','requests','sessions','completions']),mode:z.enum(['hr','mine']),today:isoDate,items:z.array(hrLearningRecordSchema).max(50),total:z.number().int().nonnegative(),limit:z.number().int(),offset:z.number().int(),selected:hrLearningRecordSchema.nullable(),participants:z.array(hrLearningRecordSchema).max(200),history:z.array(hrLearningEventSchema).max(100),programmes:z.array(hrLearningRecordSchema).max(200),requests:z.array(hrLearningRecordSchema).max(200),sessions:z.array(hrLearningRecordSchema).max(200),employees:z.array(z.strictObject({id:identifier,name:z.string(),code:z.string()})).max(100),performance_links:z.array(z.strictObject({id:identifier,kind:z.enum(['goal','outcome']),employee_id:identifier,label:z.string()})).max(100),options_capped:z.boolean(),can_manage:z.boolean(),can_review:z.boolean(),can_create_request:z.boolean(),gaps:z.array(z.strictObject({programme_id:identifier,programme_name:z.string(),employee_id:identifier,employee_name:z.string()})).max(50),gap_total:z.number().int().nonnegative()});
export type HrLearningTerms=z.infer<typeof hrLearningTermsSchema>;
export type HrLearningQuery=z.infer<typeof hrLearningQuerySchema>;
export type HrLearningAction=z.infer<typeof hrLearningActionSchema>;
export type HrLearningRecord=z.infer<typeof hrLearningRecordSchema>;
export type HrLearningWorkspace=z.infer<typeof hrLearningWorkspaceSchema>;
export type HrLearningCertificate=z.infer<typeof hrLearningCertificateSchema>;

export const hrPayrollRunComparisonQuerySchema = hrPayrollRunQuerySchema.extend({
  expected_run_number: z.coerce.number().int().min(1).max(2147483647),
  baseline_run_number: z.coerce.number().int().min(1).max(2147483647).optional(),
  filter: z.enum(['changed', 'all', 'amount_changed', 'evidence_changed', 'added', 'removed', 'unchanged']).default('changed'),
});
const payrollComparisonAmountsSchema = z.strictObject({
  gross: z.string(), deductions: z.string(), net: z.string(), employer_contributions: z.string(),
});
const payrollComparisonResultSchema = payrollComparisonAmountsSchema.extend({
  id: identifier, calculation_hash: z.string(), attendance_source_hash: z.string(), currency_code: z.string(),
});
export const hrPayrollRunComparisonSchema = z.strictObject({
  company_id: identifier, month: isoDate, period_id: identifier, period_version: z.number().int(),
  current_run_number: z.number().int(), baseline_run_number: z.number().int().nullable(), currency_code: z.string(),
  source_hash: z.string(),
  runs: z.array(z.strictObject({run_number: z.number().int(), employee_count: z.number().int(), calculated_at: z.string()})).max(50),
  counts: z.strictObject({amount_changed: z.number().int(), evidence_changed: z.number().int(), added: z.number().int(), removed: z.number().int(), unchanged: z.number().int()}),
  current_totals: payrollComparisonAmountsSchema, baseline_totals: payrollComparisonAmountsSchema.nullable(), delta: payrollComparisonAmountsSchema,
  items: z.array(z.strictObject({
    employee_id: identifier, employee_number: z.string(), display_name: z.string(),
    change: z.enum(['amount_changed', 'evidence_changed', 'added', 'removed', 'unchanged']),
    evidence_changed: z.boolean(), attendance_changed: z.boolean(),
    before: payrollComparisonResultSchema.nullable(), after: payrollComparisonResultSchema.nullable(), delta: payrollComparisonAmountsSchema,
  })),
  total: z.number().int(), limit: z.number().int(), offset: z.number().int(),
});
export type HrPayrollRunComparisonQuery = z.infer<typeof hrPayrollRunComparisonQuerySchema>;
export type HrPayrollRunComparison = z.infer<typeof hrPayrollRunComparisonSchema>;
