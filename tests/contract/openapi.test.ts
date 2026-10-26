import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";
import {
  hrEmployeeLifecycleEventDirectorySchema,
  hrEmployeeProfileVersionDirectorySchema,
} from "../../packages/contracts/src/hr/index.js";

describe("OpenAPI contract", () => {
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
      "/auth/login",
      "/auth/session",
      "/auth/change-initial-password",
      "/auth/select-tenant",
      "/auth/cancel-tenant-selection",
      "/auth/session/rotate",
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
      "/hr/employees/{employeeId}/assignments",
      "/hr/employees/{employeeId}/status_history",
      "/hr/employees/{employeeId}/lifecycle_events",
      "/hr/employees/{employeeId}/profile_history",
      "/hr/masters",
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
      "/hr/employment_lifecycle_policies/{policyId}/submit",
      "/hr/employment_lifecycle_policies/{policyId}/approval_decision",
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
