import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";
import {
  hrEmployeeLifecycleEventDirectorySchema,
  hrEmployeeProfileVersionDirectorySchema,
} from "../../packages/contracts/src/hr/index.js";

describe("OpenAPI contract", () => {
  it("documents the supplier filter only on the purchase document directory", () => {
    const paths = buildOpenApiDocument().paths;
    expect(paths["/procurement/documents"].get.parameters).toContainEqual({
      in: "query",
      name: "supplier_id",
      schema: { type: "string", minLength: 1, maxLength: 128 },
    });
    for (const path of ["/procurement/products", "/procurement/approvers", "/procurement/suppliers"] as const)
      expect(paths[path].get.parameters.map((parameter) => parameter.name)).not.toContain("supplier_id");
  });

  it("matches the committed snapshot and versioned paths", async () => {
    const generated = `${JSON.stringify(buildOpenApiDocument(), null, 2)}\n`;
    expect(await readFile(new URL("../../openapi-v1.json", import.meta.url), "utf8")).toBe(generated);
    expect(Object.keys(buildOpenApiDocument().paths)).toEqual([
      "/master_data/fiscal_calendars/options",
      "/master_data/fiscal_calendars",
      "/master_data/fiscal_calendars/{calendarId}",
      "/master_data/fiscal_calendars/{calendarId}/periods",
      "/finance/fiscal_calendars/{calendarId}/period_status",
      "/finance/currencies/catalog",
      "/finance/currencies",
      "/finance/currencies/adoptions",
      "/finance/currencies/{code}/status",
      "/finance/currency_rates",
      "/finance/currency_rates/{rateId}/corrections",
      "/finance/currency_rates/{rateId}/status",
      "/finance/transfer_policy",
      "/master-data/countries",
      "/finance/companies/{companyId}/currency-profile",
      "/finance/company-currencies",
      "/finance/company-currencies/{currencyCode}/status",
      "/finance/company-currency-rates",
      "/finance/company-currency-rates/{rateId}/corrections",
      "/finance/company-currency-rates/{rateId}/status",
      "/finance/journals/options",
      "/finance/journals",
      "/finance/journals/{journalId}",
      "/finance/journals/{journalId}/submit",
      "/finance/journals/{journalId}/decision",
      "/finance/journals/{journalId}/reversal",
      "/finance/recurring-journals",
      "/finance/recurring-journals/{templateId}",
      "/finance/recurring-journals/{templateId}/status",
      "/finance/recurring-journals/{templateId}/occurrences",
      "/finance/subledger/workspace",
      "/finance/subledger/reports",
      "/finance/subledger/parties",
      "/finance/subledger/policy",
      "/finance/subledger/operations",
      "/finance/subledger/operations/{operationId}/actions",
      "/finance/taxes",
      "/finance/taxes/options",
      "/finance/taxes/{id}",
      "/finance/taxes/{id}/status",
      "/banking/transfers",
      "/banking/transfers/options",
      "/banking/transfers/workflow_options",
      "/banking/transfers/{transferId}",
      "/banking/transfers/{transferId}/submit",
      "/banking/transfers/{transferId}/decision",
      "/banking/transfers/{transferId}/approver",
      "/banking/transfers/{transferId}/post",
      "/banking/transfers/{transferId}/reverse",
      "/banking/revaluation-policy",
      "/banking/revaluations",
      "/banking/revaluations/preview",
      "/banking/revaluations/approvers",
      "/banking/revaluations/{revaluationId}",
      "/banking/revaluations/{revaluationId}/submit",
      "/banking/revaluations/{revaluationId}/approve",
      "/banking/revaluations/{revaluationId}/reject",
      "/banking/revaluations/{revaluationId}/post",
      "/banking/revaluations/{revaluationId}/reverse",
      "/banking/revaluations/{revaluationId}/events",
      "/banking/statement_import_options",
      "/banking/statement_import_templates/{format}",
      "/banking/statement_imports",
      "/banking/statement_imports/{id}",
      "/banking/statement_imports/{id}/mapping",
      "/banking/statement_imports/{id}/lines/{lineId}",
      "/banking/statement_imports/{id}/validate",
      "/banking/statement_imports/{id}/finalize",
      "/banking/statement_mapping_profiles",
      "/banking/statement_mapping_profiles/{profileId}",
      "/banking/reconciliations",
      "/banking/reconciliation_setup",
      "/banking/reconciliations/{id}",
      "/banking/reconciliations/{id}/matches",
      "/banking/reconciliations/{id}/manual_selections",
      "/banking/reconciliations/{id}/matches/{matchId}/decision",
      "/banking/reconciliations/{id}/matches/{matchId}",
      "/banking/reconciliations/{id}/adjustments",
      "/banking/reconciliations/{id}/adjustments/{adjustmentId}",
      "/banking/reconciliations/{id}/adjustments/{adjustmentId}/submit",
      "/banking/reconciliations/{id}/adjustments/{adjustmentId}/decision",
      "/banking/reconciliations/{id}/adjustments/{adjustmentId}/post",
      "/banking/reconciliations/{id}/adjustments/{adjustmentId}/reverse",
      "/banking/reconciliations/{id}/submit",
      "/banking/reconciliations/{id}/decision",
      "/security/bank_self_approval_options",
      "/security/bank_self_approval_grants",
      "/banking/payments/{paymentId}/approver",
      "/banking/receipts/{receiptId}/approver",
      "/finance/hierarchy",
      "/finance/hierarchy/{headerId}",
      "/banking/payments/workflow_options",
      "/banking/receipts/workflow_options",
      "/master_data/projects",
      "/master_data/projects/companies",
      "/master_data/projects/{id}",
      "/master_data/projects/{id}/status",
      "/master_data/locations",
      "/master_data/locations/companies",
      "/master_data/locations/{id}",
      "/master_data/locations/{id}/status",
      "/procurement/companies",
      "/procurement/options",
      "/procurement/products",
      "/procurement/approvers",
      "/procurement/suppliers",
      "/procurement/suppliers/{id}",
      "/procurement/documents",
      "/procurement/documents/{id}",
      "/procurement/documents/{id}/actions",
      "/procurement/documents/{id}/flow",
      "/inventory/companies",
      "/inventory/options",
      "/inventory/lookups",
      "/inventory/products",
      "/inventory/products/{id}",
      "/inventory/warehouses",
      "/inventory/warehouses/{id}",
      "/inventory/transfers",
      "/inventory/transfers/{id}",
      "/auth/login",
      "/auth/session",
      "/auth/change-initial-password",
      "/auth/select-tenant",
      "/auth/cancel-tenant-selection",
      "/auth/session/rotate",
      "/auth/companies",
      "/auth/session/company",
      "/auth/logout",
      "/auth/logout-all",
      "/security/permissions",
      "/security/capabilities",
      "/security/roles",
      "/security/role_actions",
      "/security/assignments",
      "/security/assignment_requests",
      "/security/assignment_request_actions",
      "/security/approvals",
      "/security/approval_actions",
      "/security/audit_events",
      "/security/users",
      "/security/users/{userId}",
      "/security/user_options",
      "/security/access_review_campaigns",
      "/security/access_review_items",
      "/security/access_review_campaign_actions",
      "/security/access_review_decisions",
      "/security/delegations",
      "/security/session_policies",
      "/security/session_policy_actions",
      "/security/delegation_actions",
      "/security/impersonations",
      "/security/impersonation_actions",
      "/security/user_requests",
      "/security/user_request_actions",
      "/security/user_emergency_actions",
      "/hr/employees",
      "/finance/chart_templates",
      "/finance/chart_templates/{templateId}",
      "/finance/chart_templates/{templateId}/company_adoption",
      "/finance/chart_templates/company_nominals/{nominalId}/classification",
      "/finance/chart_templates/{templateId}/company_preview",
      "/finance/chart_templates/{templateId}/nodes",
      "/finance/chart_templates/{templateId}/publish",
      "/finance/nominals/options",
      "/finance/nominals",
      "/finance/nominals/{nominalId}",
      "/finance/nominals/{nominalId}/submit",
      "/finance/nominals/{nominalId}/decision",
      "/finance/nominals/{nominalId}/status",
      "/banking/companies",
      "/banking/ledger_accounts",
      "/banking/accounts",
      "/banking/accounts/summary",
      "/banking/accounts/{accountId}",
      "/banking/accounts/{accountId}/submit",
      "/banking/accounts/{accountId}/decision",
      "/banking/accounts/{accountId}/status",
      "/banking/payments",
      "/banking/payments/options",
      "/banking/payments/nominal_accounts",
      "/banking/payments/{paymentId}",
      "/banking/payments/{paymentId}/submit",
      "/banking/payments/{paymentId}/decision",
      "/banking/payments/{paymentId}/post",
      "/banking/payments/{paymentId}/reverse",
      "/banking/receipts",
      "/banking/receipts/options",
      "/banking/receipts/nominal_accounts",
      "/banking/receipts/{receiptId}",
      "/banking/receipts/{receiptId}/submit",
      "/banking/receipts/{receiptId}/decision",
      "/banking/receipts/{receiptId}/post",
      "/banking/receipts/{receiptId}/reverse",
      "/hr/companies",
      "/hr/dashboard",
      "/hr/finance_payroll_dashboard",
      "/hr/positions_organization",
      "/hr/manpower_requisitions",
      "/hr/manpower_requisitions/{requisitionId}/submit",
      "/hr/manpower_requisitions/{requisitionId}/decision",
      "/hr/job_openings",
      "/hr/job_openings/{openingId}/state",
      "/hr/recruitment_interview_panel",
      "/hr/recruitment_interviews",
      "/hr/recruitment_interviews/actions",
      "/hr/recruitment_offers/{offerId}/employee",
      "/hr/attendance_correction_context",
      "/hr/attendance_corrections",
      "/hr/attendance_corrections/{correctionId}",
      "/hr/attendance_corrections/{correctionId}/draft",
      "/hr/attendance_corrections/{correctionId}/actions",
      "/hr/monthly_attendance",
      "/hr/daily_attendance",
      "/hr/shift_assignment_context",
      "/hr/shift_assignments",
      "/hr/shift_assignments/{assignmentId}",
      "/hr/shift_assignments/{assignmentId}/close",
      "/hr/attendance_overtime",
      "/hr/attendance_overtime_context",
      "/hr/attendance_overtime/{recordId}",
      "/hr/attendance_overtime_rules",
      "/hr/attendance_overtime/{recordId}/replace",
      "/hr/attendance_overtime/{recordId}/actions",
      "/hr/attendance_periods",
      "/hr/attendance_payroll_inputs",
      "/hr/attendance_periods/actions",
      "/hr/leave_types",
      "/hr/leave_types/{recordId}/policies",
      "/hr/leave_types/{recordId}/status",
      "/hr/leave_balances",
      "/hr/leave_ledger",
      "/hr/leave_balances/postings",
      "/hr/leave_context",
      "/hr/leave_requests",
      "/hr/leave_requests/{recordId}",
      "/hr/leave_requests/{recordId}/actions",
      "/hr/payroll_workspace",
      "/hr/payroll_options",
      "/hr/payroll_records",
      "/hr/payroll_records/{recordId}/actions",
      "/hr/payroll_localization",
      "/hr/payroll_localization/{id}/actions",
      "/hr/payroll_overtime",
      "/hr/payroll_overtime/{id}/actions",
      "/hr/payroll_payments",
      "/hr/payroll_payments/actions",
      "/hr/self_service/attendance",
      "/hr/self_service/attendance/punches",
      "/hr/self_service/attendance/day",
      "/hr/attendance_records",
      "/hr/self_service/leave_context",
      "/hr/self_service/leave_requests/{id}",
      "/hr/self_service/leave_requests",
      "/hr/self_service/leave_requests/{id}/actions",
      "/hr/learning",
      "/hr/learning/actions",
      "/hr/learning/certificates/{id}",
      "/hr/personal_corrections",
      "/hr/report_governance",
      "/hr/personal_corrections/{id}/actions",
      "/hr/report_governance/actions",
      "/hr/self_service",
      "/hr/self_service/payslips/{id}",
      "/hr/payslips",
      "/hr/payslips/{id}",
      "/hr/payslips/releases",
      "/hr/policy_upgrades",
      "/hr/policy_upgrades/actions",
      "/hr/settlement_entitlements",
      "/hr/settlement_entitlements/actions",
      "/hr/settlement_benefits",
      "/hr/settlement_benefits/actions",
      "/hr/lifecycle_cases",
      "/hr/lifecycle_cases/actions",
      "/hr/performance/inbox",
      "/hr/performance/participation",
      "/hr/performance/participation/actions",
      "/hr/performance",
      "/hr/performance/actions",
      "/hr/payroll_journal",
      "/hr/payroll_journal/actions",
      "/hr/payroll_runs/comparison",
      "/hr/payroll_runs",
      "/hr/payroll_runs/actions",
      "/hr/shift_resolution",
      "/hr/shift_context",
      "/hr/shifts",
      "/hr/shifts/{shiftId}",
      "/hr/shifts/{shiftId}/rules",
      "/hr/shifts/{shiftId}/status",
      "/hr/recruitment_offer_context",
      "/hr/recruitment_offers",
      "/hr/recruitment_offers/{offerId}",
      "/hr/recruitment_offers/{offerId}/terms",
      "/hr/recruitment_offers/{offerId}/actions",
      "/hr/applications",
      "/hr/applications/{applicationId}/stage",
      "/hr/candidates",
      "/hr/candidates/{candidateId}/status",
      "/hr/organization_units",
      "/hr/employees/{employeeId}",
      "/hr/employee_drafts",
      "/hr/employee_drafts/{employeeId}",
      "/hr/employee_drafts/{employeeId}/submit",
      "/hr/employee_draft_approvals",
      "/hr/employee_draft_approvals/{employeeId}",
      "/hr/employee_drafts/{employeeId}/approval_decision",
      "/hr/employees/{employeeId}/profile_draft_assignment",
      "/hr/employees/{employeeId}/contacts",
      "/hr/employees/{employeeId}/emergency_contacts",
      "/hr/employees/{employeeId}/documents",
      "/hr/manpower_requisitions/{recordId}/update",
      "/hr/manpower_requisitions/{recordId}/state",
      "/hr/manpower_requisitions/{recordId}/delete",
      "/hr/job_openings/{recordId}/update",
      "/hr/job_openings/{recordId}/delete",
      "/hr/candidates/{recordId}/update",
      "/hr/candidates/{recordId}/delete",
      "/hr/employees/{employeeId}/status",
      "/hr/employees/{employeeId}/remove",
      "/hr/employee_number_preview",
      "/hr/employee_drafts/{employeeId}/withdraw",
      "/hr/employees/{employeeId}/contacts/{contactId}",
      "/hr/employees/{employeeId}/contacts/{contactId}/remove",
      "/hr/employees/{employeeId}/emergency_contacts/{contactId}",
      "/hr/employees/{employeeId}/emergency_contacts/{contactId}/remove",
      "/hr/employees/{employeeId}/documents/{documentId}/replace",
      "/hr/employees/{employeeId}/documents/{documentId}/remove",
      "/hr/employees/{employeeId}/documents/{documentId}/content",
      "/hr/employees/{employeeId}/employment_history",
      "/hr/employees/{employeeId}/employment_history/{historyId}",
      "/hr/employees/{employeeId}/employment_history/{historyId}/remove",
      "/hr/employees/{employeeId}/assignments",
      "/hr/employees/{employeeId}/status_history",
      "/hr/employees/{employeeId}/lifecycle_events",
      "/hr/employees/{employeeId}/profile_history",
      "/hr/masters",
      "/hr/masters/{masterId}",
      "/hr/masters/{masterId}/status",
      "/hr/job_grades",
      "/hr/job_grade_currencies",
      "/hr/requisition_work_locations",
      "/hr/cost_centre_nominals",
      "/hr/requisition_projects",
      "/hr/job_grades/{gradeId}",
      "/hr/jobs",
      "/hr/hire_requests",
      "/hr/employees/{employeeId}/hire_requests",
      "/hr/employees/{employeeId}/hire_requests/{requestId}",
      "/hr/employees/{employeeId}/hire_requests/{requestId}/decision",
      "/hr/transfer_requests",
      "/hr/employees/{employeeId}/transfer_requests",
      "/hr/employees/{employeeId}/transfer_requests/{requestId}",
      "/hr/employees/{employeeId}/transfer_requests/{requestId}/decision",
      "/hr/promotion_requests",
      "/hr/employees/{employeeId}/promotion_requests",
      "/hr/employees/{employeeId}/promotion_requests/{requestId}",
      "/hr/employees/{employeeId}/promotion_requests/{requestId}/decision",
      "/hr/manager_change_requests",
      "/hr/employees/{employeeId}/manager_change_requests",
      "/hr/employees/{employeeId}/manager_change_requests/{requestId}",
      "/hr/employees/{employeeId}/manager_change_requests/{requestId}/decision",
      "/hr/work_location_change_requests",
      "/hr/employees/{employeeId}/work_location_change_requests",
      "/hr/employees/{employeeId}/work_location_change_requests/{requestId}",
      "/hr/employees/{employeeId}/work_location_change_requests/{requestId}/decision",
      "/hr/organization_placement_change_requests",
      "/hr/employees/{employeeId}/organization_placement_change_requests",
      "/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}",
      "/hr/employees/{employeeId}/organization_placement_change_requests/{requestId}/decision",
      "/hr/employment_lifecycle_policies",
      "/hr/employment_lifecycle_policies/{policyId}",
      "/hr/employment_lifecycle_policies/{policyId}/submit",
      "/hr/employment_lifecycle_policies/{policyId}/approval_decision",
      "/hr/employment_lifecycle_policies/{policyId}/deactivate",
      "/hr/employment_lifecycle_policies/{policyId}/activate",
      "/health/live",
      "/health/ready",
      "/jobs/sample",
    ]);
  });

  it("documents minimal Finance Nominal input and governed lifecycle operations", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/finance/nominals/options"].get.operationId).toBe("listFinanceNominalOptions");
    expect(document.paths["/finance/nominals"].get.operationId).toBe("listFinanceNominals");
    expect(document.paths["/finance/nominals"].post.operationId).toBe("createFinanceNominal");
    expect(document.paths["/finance/nominals/{nominalId}"].get.operationId).toBe("getFinanceNominal");
    expect(document.paths["/finance/nominals/{nominalId}"].patch.operationId).toBe("updateFinanceNominal");
    expect(document.paths["/finance/nominals/{nominalId}/submit"].post.operationId).toBe("submitFinanceNominal");
    expect(document.paths["/finance/nominals/{nominalId}/decision"].post.operationId).toBe("decideFinanceNominal");
    expect(document.paths["/finance/nominals/{nominalId}/status"].post.operationId).toBe("changeFinanceNominalStatus");
    const create = document.components.schemas.CreateFinanceNominalRequest as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(create.additionalProperties).toBe(false);
    expect(Object.keys(create.properties ?? {})).toEqual([
      "nominal_kind",
      "company_id",
      "category_id",
      "section_id",
      "name",
      "currency",
      "description",
      "chart_template_id",
      "chart_node_key",
    ]);
    const update = document.paths["/finance/nominals/{nominalId}"].patch;
    expect(update.parameters.map((parameter) => parameter.name)).toEqual([
      "nominalId",
      "x-csrf-token",
      "idempotency-key",
      "if-match",
    ]);
    expect(update.security).toEqual([{ cookieAuth: [] }]);
  });

  it("documents the governed Bank Payment lifecycle without browser-controlled accounting authority", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/banking/payments"].get.operationId).toBe("listBankPayments");
    expect(document.paths["/banking/payments"].post.operationId).toBe("createBankPayment");
    expect(document.paths["/banking/payments/{paymentId}"].patch.operationId).toBe("updateBankPayment");
    expect(document.paths["/banking/payments/{paymentId}/submit"].post.operationId).toBe("submitBankPayment");
    expect(document.paths["/banking/payments/{paymentId}/decision"].post.operationId).toBe("decideBankPayment");
    expect(document.paths["/banking/payments/{paymentId}/post"].post.operationId).toBe("postBankPayment");
    expect(document.paths["/banking/payments/{paymentId}/reverse"].post.operationId).toBe("reverseBankPayment");

    const createSchema = document.components.schemas.CreateBankPaymentRequest as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(createSchema.additionalProperties).toBe(false);
    expect(Object.keys(createSchema.properties ?? {})).toEqual([
      "company_id",
      "project_id",
      "location_id",
      "approver_user_id",
      "bank_account_id",
      "posting_date",
      "value_date",
      "lines",
    ]);
    expect(createSchema.properties).not.toHaveProperty("tenant_id");
    expect(createSchema.properties).not.toHaveProperty("state");
    expect(createSchema.properties).not.toHaveProperty("total_amount");
    expect(createSchema.properties).not.toHaveProperty("bank_control_account_id");
    expect(createSchema.properties).not.toHaveProperty("journal_id");
  });

  it("documents the governed Bank Receipt lifecycle without Customer or accounting authority", () => {
    const document = buildOpenApiDocument();
    expect(document.paths["/banking/receipts"].get.operationId).toBe("listBankReceipts");
    expect(document.paths["/banking/receipts"].post.operationId).toBe("createBankReceipt");
    expect(document.paths["/banking/receipts/{receiptId}"].patch.operationId).toBe("updateBankReceipt");
    expect(document.paths["/banking/receipts/{receiptId}/submit"].post.operationId).toBe("submitBankReceipt");
    expect(document.paths["/banking/receipts/{receiptId}/decision"].post.operationId).toBe("decideBankReceipt");
    expect(document.paths["/banking/receipts/{receiptId}/post"].post.operationId).toBe("postBankReceipt");
    expect(document.paths["/banking/receipts/{receiptId}/reverse"].post.operationId).toBe("reverseBankReceipt");

    const createSchema = document.components.schemas.CreateBankReceiptRequest as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(createSchema.additionalProperties).toBe(false);
    expect(Object.keys(createSchema.properties ?? {})).toEqual([
      "company_id",
      "project_id",
      "location_id",
      "approver_user_id",
      "bank_account_id",
      "posting_date",
      "value_date",
      "lines",
    ]);
    expect(createSchema.properties).not.toHaveProperty("tenant_id");
    expect(createSchema.properties).not.toHaveProperty("customer_id");
    expect(createSchema.properties).not.toHaveProperty("invoice_id");
    expect(createSchema.properties).not.toHaveProperty("state");
    expect(createSchema.properties).not.toHaveProperty("total_amount");
    expect(createSchema.properties).not.toHaveProperty("bank_control_account_id");
    expect(createSchema.properties).not.toHaveProperty("journal_id");
  });

  it("documents bounded statement uploads and governed reconciliation mutations", () => {
    const document = buildOpenApiDocument();
    const upload = document.paths["/banking/statement_imports"].post;
    const multipart = upload.requestBody.content["multipart/form-data"] as {
      schema: {
        additionalProperties?: boolean;
        required?: string[];
        properties?: Record<string, { format?: string; description?: string }>;
      };
    };
    expect(upload.parameters.map((parameter) => parameter.name)).toEqual(["x-csrf-token", "idempotency-key"]);
    expect(multipart.schema.additionalProperties).toBe(false);
    expect(multipart.schema.required).toEqual([
      "company_id",
      "bank_account_id",
      "statement_reference",
      "date_format",
      "file",
    ]);
    expect(multipart.schema.properties?.file?.format).toBe("binary");
    expect(multipart.schema.properties?.file?.description).toContain("1,000");

    const finalize = document.paths["/banking/statement_imports/{id}/finalize"].post;
    expect(finalize.parameters.map((parameter) => parameter.name)).toEqual([
      "id",
      "x-csrf-token",
      "idempotency-key",
      "if-match",
    ]);

    const decision = document.paths["/banking/reconciliations/{id}/decision"].post;
    expect(decision.operationId).toBe("decideBankReconciliation");
    expect(decision.parameters.map((parameter) => parameter.name)).toEqual([
      "id",
      "x-csrf-token",
      "idempotency-key",
      "if-match",
    ]);
    const adjustment = document.paths["/banking/reconciliations/{id}/adjustments/{adjustmentId}"];
    expect(adjustment.get.operationId).toBe("getBankReconciliationAdjustment");
    expect(adjustment.patch.parameters.map((parameter) => parameter.name)).toEqual([
      "id",
      "adjustmentId",
      "x-csrf-token",
      "idempotency-key",
      "if-match",
    ]);
    const createAdjustment = document.components.schemas.CreateBankReconciliationAdjustmentRequest as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(createAdjustment.additionalProperties).toBe(false);
    expect(createAdjustment.properties).not.toHaveProperty("amount");
    expect(createAdjustment.properties).not.toHaveProperty("direction");
    expect(createAdjustment.properties).not.toHaveProperty("company_id");
    const createReconciliation = document.components.schemas.CreateBankReconciliationRequest as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    };
    expect(createReconciliation.additionalProperties).toBe(false);
    expect(createReconciliation.properties).not.toHaveProperty("tenant_id");
    expect(createReconciliation.properties).not.toHaveProperty("state");
    expect(createReconciliation.properties).not.toHaveProperty("ledger_population_hash");
  });

  it("keeps employee history projections free of private fields and actor identifiers", () => {
    const lifecycle = {
      items: [
        {
          id: "event-1",
          relationship_id: "relationship-1",
          sequence: 1,
          event_type: "hire",
          effective_on: "2026-10-16",
          previous_state: null,
          resulting_state: { code: "employed", label: "Employed", canonical_class: "employed" },
          reason: "Approved hire",
          source_reference: "hr:hire",
          recorded_at: "2026-10-16T00:00:00.000Z",
          approved_at: "2026-10-16T00:00:00.000Z",
          recorded_by: "private-actor",
        },
      ],
      next_cursor: null,
    };
    expect(hrEmployeeLifecycleEventDirectorySchema.safeParse(lifecycle).success).toBe(false);

    const profile = {
      items: [
        {
          id: "version-1",
          revision: 1,
          effective_from: "2026-10-16",
          effective_to: null,
          first_name: "Synthetic",
          middle_name: "",
          last_name: "Employee",
          preferred_name: "",
          work_email: "synthetic@example.test",
          source_reference: "migration:0033-current-state-baseline",
          capture_origin: "migration_baseline",
          recorded_at: "2026-10-16T00:00:00.000Z",
          personal_email: "private@example.test",
        },
      ],
      next_cursor: null,
    };
    expect(hrEmployeeProfileVersionDirectorySchema.safeParse(profile).success).toBe(false);
  });
});
