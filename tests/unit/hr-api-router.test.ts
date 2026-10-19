import { PassThrough } from "node:stream";

import { describe, expect, it, vi } from "vitest";
import request from "supertest";

import { createApp } from "../../server/api/src/app.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../../server/api/src/modules/auth/tenant-router.js";
import type { SourceHrRepository } from "../../server/api/src/modules/hr/source-repository.js";
import { createLogger, createMetrics } from "../../packages/observability/src/index.js";

const session = {
  sessionId: "session-hr-1",
  tenantId: "tenant-hr",
  userId: "user-hr",
  csrfToken: "c".repeat(43),
  idleExpiresAt: new Date("2026-10-15T13:00:00.000Z"),
  absoluteExpiresAt: new Date("2026-10-15T20:00:00.000Z"),
};

function appForHr(
  repository: Pick<
    SourceHrRepository,
    | "listEmployees"
    | "getDashboard"
    | "getFinancePayrollDashboard"
    | "getPositionsOrganization"
    | "listCompanies"
    | "listOrganizationUnits"
    | "createOrganizationUnit"
    | "updateOrganizationUnit"
    | "changeOrganizationUnitStatus"
    | "getEmployee"
    | "listEmployeeDrafts"
    | "getEmployeeDraft"
    | "listMasters"
    | "createMaster"
    | "updateMaster"
    | "changeMasterStatus"
    | "listJobGrades"
    | "createJobGrade"
    | "updateJobGrade"
    | "createEmployeeDraft"
    | "updateEmployeeDraft"
    | "getEmployeeDraftApproval"
    | "decideEmployeeDraftApproval"
    | "listEmployeeContacts"
    | "createEmployeeContact"
    | "listEmployeeEmergencyContacts"
    | "createEmployeeEmergencyContact"
    | "listEmployeeDocuments"
    | "listEmployeeAssignments"
    | "listEmployeeStatusHistory"
    | "listEmploymentLifecyclePolicies"
    | "createEmploymentLifecyclePolicy"
  >,
) {
  const auth = {
    loadAuthenticatedAccount: vi.fn(async () => ({
      tenantId: "tenant-hr",
      organizationName: "Nexora HR",
      userId: "user-hr",
      email: "hr@example.test",
      displayName: "HR User",
      roles: ["hr_manager"],
      permissions: ["hr.employee.read", "hr.master.read"],
      sessionVersion: 1,
    })),
  } as unknown as TenantAuthApiService;
  const sessions = {
    get: vi.fn(async () => session),
    authorizeMutation: vi.fn(async (_token: string, csrfToken: string) =>
      csrfToken === session.csrfToken ? { status: "ok" as const, session } : { status: "invalid_csrf" as const },
    ),
  } as unknown as TenantSessionApiService;
  return createApp({
    config: { allowedOrigins: new Set(["https://hr.example.test"]) },
    logger: createLogger(new PassThrough()),
    metrics: createMetrics(),
    readiness: {},
    authService: auth,
    sessionService: sessions,
    hrRepository: repository,
  });
}

describe("HR API foundation", () => {
  it("exposes live Finance/Payroll and Positions summaries behind authenticated HR routes", async () => {
    const financeSummary = {
      company_id: "company-a",
      generated_at: "2026-10-19T12:00:00.000Z",
      metrics: {
        current_employees: 2,
        salary_covered_employees: 1,
        salary_gaps: 1,
        total_periods: 0,
        review_queue: 0,
        journal_queue: 0,
        payment_exceptions: 0,
      },
      latest_period: null,
      recent_periods: [],
    };
    const positionsSummary = {
      company_id: "company-a",
      generated_at: "2026-10-19T12:00:00.000Z",
      metrics: {
        current_assignments: 1,
        active_departments: 1,
        represented_jobs: 1,
        reporting_managers: 0,
        without_manager: 1,
      },
      departments: [],
      items: [],
    };
    const repository = {
      getFinancePayrollDashboard: vi.fn(async () => financeSummary),
      getPositionsOrganization: vi.fn(async () => positionsSummary),
    } as unknown as Pick<SourceHrRepository, "getFinancePayrollDashboard" | "getPositionsOrganization">;

    const blocked = await request(appForHr(repository)).get(
      "/api/v1/hr/finance_payroll_dashboard?company_id=company-a",
    );
    expect(blocked.status).toBe(401);

    const finance = await request(appForHr(repository))
      .get("/api/v1/hr/finance_payroll_dashboard?company_id=company-a")
      .set("cookie", "nexora_session=token-hr");
    expect(finance.status).toBe(200);
    expect(finance.body).toEqual(financeSummary);
    expect(repository.getFinancePayrollDashboard).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "company-a",
    );

    const positions = await request(appForHr(repository))
      .get("/api/v1/hr/positions_organization?company_id=company-a&search=engineer&limit=25")
      .set("cookie", "nexora_session=token-hr");
    expect(positions.status).toBe(200);
    expect(positions.body).toEqual(positionsSummary);
    expect(repository.getPositionsOrganization).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      { company_id: "company-a", search: "engineer", limit: 25 },
    );
  });

  it("keeps the pending approval detail behind an authenticated HR route", async () => {
    const detail = {
      id: "employee-1",
      employee_number: "EMP-001",
      display_name: "Ayesha Khan",
      first_name: "Ayesha",
      middle_name: "",
      last_name: "Khan",
      preferred_name: "",
      work_email: "",
      phone: "",
      joined_on: "2026-10-15",
      company_id: "company-a",
      created_at: "2026-10-15T00:00:00.000Z",
      approval_id: "approval-1",
      created_by: "creator-user",
      submitted_by: "other-user",
      submitted_at: "2026-10-15T01:00:00.000Z",
    };
    const repository = {
      getEmployeeDraftApproval: vi.fn(async () => detail),
    } as unknown as Pick<SourceHrRepository, "getEmployeeDraftApproval">;
    const blocked = await request(appForHr(repository)).get("/api/v1/hr/employee_draft_approvals/employee-1");
    expect(blocked.status).toBe(401);
    expect(repository.getEmployeeDraftApproval).not.toHaveBeenCalled();

    const accepted = await request(appForHr(repository))
      .get("/api/v1/hr/employee_draft_approvals/employee-1")
      .set("cookie", "nexora_session=token-hr");
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(detail);
    expect(repository.getEmployeeDraftApproval).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr", actor: expect.objectContaining({ userId: "user-hr" }) }),
      "employee-1",
    );
  });

  it("returns bounded active organization placements for an authorized company", async () => {
    const directory = {
      items: [{ id: "branch-a", parent_id: "company-a", type: "branch", code: "BR-A", name: "Branch A" }],
    } as const;
    const repository = {
      listOrganizationUnits: vi.fn(async () => directory),
    } as unknown as Pick<SourceHrRepository, "listOrganizationUnits">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/organization_units?company_id=company-a&type=branch&limit=100")
      .set("cookie", "nexora_session=token-hr");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(directory);
    expect(repository.listOrganizationUnits).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), {
      company_id: "company-a",
      type: "branch",
      include_inactive: false,
      limit: 100,
    });
  });

  it("protects organization-unit creation with browser mutation controls", async () => {
    const repository = {
      createOrganizationUnit: vi.fn(async () => ({
        id: "org-unit-1",
        company_id: "company-a",
        audit_event_id: "audit-1",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createOrganizationUnit">;
    const payload = { company_id: "company-a", parent_id: "company-a", type: "branch", code: "LHR", name: "Lahore" };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/organization_units")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "org-create-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createOrganizationUnit).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      payload,
      "org-create-1",
      expect.any(String),
    );
  });

  it("protects HR master creation with browser mutation controls", async () => {
    const repository = {
      createMaster: vi.fn(async () => ({ id: "designation-1", company_id: "company-a", audit_event_id: "audit-2", replayed: false })),
    } as unknown as Pick<SourceHrRepository, "createMaster">;
    const payload = { company_id: "company-a", type: "designation", code: "HRM", name: "HR Manager", description: "Leads HR operations" };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/masters")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "master-create-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createMaster).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), payload, "master-create-1", expect.any(String));
  });

  it("validates type-specific HR master configuration before repository access", async () => {
    const repository = {
      createMaster: vi.fn(async () => ({ id: "location-1", company_id: "company-a", audit_event_id: "audit-location-1", replayed: false })),
    } as unknown as Pick<SourceHrRepository, "createMaster">;
    const payload = {
      company_id: "company-a", type: "work_location", code: "REMOTE", name: "Remote Pakistan",
      description: "Home-based work", configuration_key: "working_pattern", configuration_value: "remote",
    };
    const accepted = await request(appForHr(repository))
      .post("/api/v1/hr/masters")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "configured-master-1")
      .send(payload);
    expect(accepted.status).toBe(201);
    expect(repository.createMaster).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), payload, "configured-master-1", expect.any(String));

    const rejected = await request(appForHr(repository))
      .post("/api/v1/hr/masters")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "configured-master-2")
      .send({ ...payload, configuration_key: "pay_cycle" });
    expect(rejected.status).toBe(400);
    expect(repository.createMaster).toHaveBeenCalledTimes(1);

    const missing = await request(appForHr(repository))
      .post("/api/v1/hr/masters")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "configured-master-3")
      .send({ company_id: "company-a", type: "employee_category", code: "STAFF", name: "Staff", description: "Salaried staff" });
    expect(missing.status).toBe(400);
    expect(repository.createMaster).toHaveBeenCalledTimes(1);
  });

  it("returns company-scoped job grades from the dedicated catalogue", async () => {
    const directory = {
      items: [{
        id: "grade-1", company_id: "company-a", type: "job_grade", code: "G5", name: "Grade 5",
        description: "Professional grade", status: "active", grade_level: 5, currency_code: "PKR",
        band_minimum: "100000.0000", band_midpoint: "125000.0000", band_maximum: "150000.0000",
      }],
    } as const;
    const repository = { listJobGrades: vi.fn(async () => directory) } as unknown as Pick<SourceHrRepository, "listJobGrades">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/job_grades?company_id=company-a")
      .set("cookie", "nexora_session=token-hr");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(directory);
    expect(repository.listJobGrades).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), "company-a");
  });

  it("validates and protects job-grade creation with browser mutation controls", async () => {
    const repository = {
      createJobGrade: vi.fn(async () => ({ id: "grade-5", company_id: "company-a", audit_event_id: "audit-grade-5", replayed: false })),
    } as unknown as Pick<SourceHrRepository, "createJobGrade">;
    const payload = {
      company_id: "company-a", code: "G5", name: "Grade 5", description: "Professional grade",
      grade_level: 5, currency_code: "PKR", band_minimum: "100000", band_midpoint: "125000", band_maximum: "150000",
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/job_grades")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "job-grade-create-1")
      .send(payload);

    expect(response.status).toBe(201);
    expect(repository.createJobGrade).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), payload, "job-grade-create-1", expect.any(String));

    const invalid = await request(appForHr(repository))
      .post("/api/v1/hr/job_grades")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "job-grade-create-2")
      .send({ ...payload, band_midpoint: null });
    expect(invalid.status).toBe(400);
    expect(repository.createJobGrade).toHaveBeenCalledTimes(1);
  });

  it("protects employee contact creation with the standard browser mutation controls", async () => {
    const repository = {
      createEmployeeContact: vi.fn(async () => ({
        id: "contact-1",
        employee_id: "employee-1",
        audit_event_id: "audit-1",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmployeeContact">;
    const payload = {
      channel: "email",
      contact_usage: "work",
      contact_value: "contact@example.test",
      is_primary: false,
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/contacts")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "employee-contact-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createEmployeeContact).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "employee-contact-1",
      expect.any(String),
    );
  });

  it("protects emergency-contact creation with the standard browser mutation controls", async () => {
    const repository = {
      createEmployeeEmergencyContact: vi.fn(async () => ({
        id: "emergency-contact-1",
        employee_id: "employee-1",
        audit_event_id: "audit-1",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmployeeEmergencyContact">;
    const payload = {
      name: "Nadia Khan",
      relationship: "Sibling",
      phone: "+923001234567",
      priority: 1,
      is_primary: true,
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/emergency_contacts")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "employee-emergency-contact-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createEmployeeEmergencyContact).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "employee-emergency-contact-1",
      expect.any(String),
    );
  });

  it("returns employee document metadata only through an authenticated read route", async () => {
    const directory = {
      items: [
        {
          id: "document-1",
          employee_id: "employee-1",
          document_type: "qualification",
          title: "Controlled certificate",
          reference: "CERT-001",
          issued_on: "2026-01-01",
          expires_on: null,
          restricted: true,
          issuing_authority: "Nexora Academy",
          verification_status: "unverified",
          status: "active",
          created_at: "2026-10-15T00:00:00.000Z",
        },
      ],
    };
    const repository = {
      listEmployeeDocuments: vi.fn(async () => directory),
    } as unknown as Pick<SourceHrRepository, "listEmployeeDocuments">;

    const blocked = await request(appForHr(repository)).get("/api/v1/hr/employees/employee-1/documents");
    expect(blocked.status).toBe(401);
    expect(repository.listEmployeeDocuments).not.toHaveBeenCalled();

    const accepted = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/documents")
      .set("cookie", "nexora_session=token-hr");
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(directory);
    expect(repository.listEmployeeDocuments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr", actor: expect.objectContaining({ userId: "user-hr" }) }),
      "employee-1",
    );
  });

  it("keeps the assignment timeline behind an authenticated HR route", async () => {
    const directory = {
      items: [
        {
          id: "assignment-1",
          employee_id: "employee-1",
          company_id: "company-a",
          designation: "Analyst",
          job: "",
          job_grade: "G1",
          employment_type: "Full time",
          work_location: "Head office",
          change_reason: "initial_appointment",
          assignment_status: "active",
          effective_from: "2026-01-01",
          effective_to: null,
          created_at: "2026-10-15T00:00:00.000Z",
        },
      ],
    };
    const repository = {
      listEmployeeAssignments: vi.fn(async () => directory),
    } as unknown as Pick<SourceHrRepository, "listEmployeeAssignments">;
    const blocked = await request(appForHr(repository)).get("/api/v1/hr/employees/employee-1/assignments");
    expect(blocked.status).toBe(401);
    const accepted = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/assignments")
      .set("cookie", "nexora_session=token-hr");
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(directory);
    expect(repository.listEmployeeAssignments).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
    );
  });

  it("keeps employee status history behind an authenticated HR route", async () => {
    const directory = {
      items: [
        {
          id: "status-history-1",
          employee_id: "employee-1",
          from_status: "draft",
          to_status: "pending_approval",
          effective_on: "2026-10-15",
          reason: "Submitted for review",
          created_at: "2026-10-15T00:00:00.000Z",
        },
      ],
    };
    const repository = {
      listEmployeeStatusHistory: vi.fn(async () => directory),
    } as unknown as Pick<SourceHrRepository, "listEmployeeStatusHistory">;
    const blocked = await request(appForHr(repository)).get("/api/v1/hr/employees/employee-1/status_history");
    expect(blocked.status).toBe(401);
    const accepted = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/status_history")
      .set("cookie", "nexora_session=token-hr");
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(directory);
    expect(repository.listEmployeeStatusHistory).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
    );
  });

  it("parses bounded lifecycle and profile history reads behind authentication", async () => {
    const repository = {
      listEmployeeLifecycleEvents: vi.fn(async () => ({ items: [], next_cursor: null })),
      listEmployeeProfileHistory: vi.fn(async () => ({ items: [], next_cursor: null })),
    } as unknown as Pick<SourceHrRepository, "listEmployeeLifecycleEvents" | "listEmployeeProfileHistory">;
    const blocked = await request(appForHr(repository)).get(
      "/api/v1/hr/employees/employee-1/lifecycle_events?limit=10",
    );
    expect(blocked.status).toBe(401);

    const lifecycle = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/lifecycle_events?limit=10&cursor=cursor-value")
      .set("cookie", "nexora_session=token-hr");
    const profile = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/profile_history")
      .set("cookie", "nexora_session=token-hr");

    expect(lifecycle.status).toBe(200);
    expect(profile.status).toBe(200);
    expect(repository.listEmployeeLifecycleEvents).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      { limit: 10, cursor: "cursor-value" },
    );
    expect(repository.listEmployeeProfileHistory).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      { limit: 25 },
    );
  });

  it("parses a bounded lifecycle-policy directory query in the authenticated HR route", async () => {
    const repository = {
      listEmploymentLifecyclePolicies: vi.fn(async () => ({ items: [] })),
    } as unknown as Pick<SourceHrRepository, "listEmploymentLifecyclePolicies">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/employment_lifecycle_policies?company_id=company-a&limit=25")
      .set("cookie", "nexora_session=token-hr");
    expect(response.status).toBe(200);
    expect(repository.listEmploymentLifecyclePolicies).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      { company_id: "company-a", limit: 25 },
    );
  });

  it("protects lifecycle-policy creation with the standard browser mutation controls", async () => {
    const repository = {
      createEmploymentLifecyclePolicy: vi.fn(async () => ({
        id: "policy-1",
        company_id: "company-a",
        code: "POLICY-1",
        name: "Lifecycle policy",
        version: 1,
        status: "draft",
        audit_event_id: "audit-1",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmploymentLifecyclePolicy">;
    const payload = {
      company_id: "company-a",
      code: "POLICY-1",
      name: "Lifecycle policy",
      effective_from: "2026-10-15",
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employment_lifecycle_policies")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "lifecycle-policy-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createEmploymentLifecyclePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      payload,
      "lifecycle-policy-1",
      expect.any(String),
    );
  });

  it("protects lifecycle-policy submission with the standard browser mutation controls", async () => {
    const repository = {
      submitEmploymentLifecyclePolicy: vi.fn(async () => ({
        id: "policy-1",
        company_id: "company-a",
        code: "POLICY-1",
        name: "Lifecycle policy",
        version: 1,
        status: "pending_approval",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "submitEmploymentLifecyclePolicy">;
    const payload = { reason: "Ready for independent review." };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employment_lifecycle_policies/policy-1/submit")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "lifecycle-policy-submit-1")
      .send(payload);
    expect(response.status).toBe(200);
    expect(repository.submitEmploymentLifecyclePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "policy-1",
      payload,
      "lifecycle-policy-submit-1",
      expect.any(String),
    );
  });

  it("protects lifecycle-policy independent approval with the standard browser mutation controls", async () => {
    const repository = {
      approveEmploymentLifecyclePolicy: vi.fn(async () => ({
        id: "policy-1",
        company_id: "company-a",
        code: "POLICY-1",
        name: "Lifecycle policy",
        version: 1,
        status: "approved",
        audit_event_id: "audit-3",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "approveEmploymentLifecyclePolicy">;
    const payload = { reason: "Independently reviewed and approved." };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employment_lifecycle_policies/policy-1/approval_decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "lifecycle-policy-approve-1")
      .send(payload);
    expect(response.status).toBe(200);
    expect(repository.approveEmploymentLifecyclePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "policy-1",
      payload,
      "lifecycle-policy-approve-1",
      expect.any(String),
    );
  });

  it("protects lifecycle-policy activation with the standard browser mutation controls", async () => {
    const repository = {
      activateEmploymentLifecyclePolicy: vi.fn(async () => ({
        id: "policy-1",
        company_id: "company-a",
        code: "POLICY-1",
        name: "Lifecycle policy",
        version: 1,
        status: "active",
        audit_event_id: "audit-4",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "activateEmploymentLifecyclePolicy">;
    const payload = { reason: "Approved policy is effective today." };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employment_lifecycle_policies/policy-1/activate")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "lifecycle-policy-activate-1")
      .send(payload);
    expect(response.status).toBe(200);
    expect(repository.activateEmploymentLifecyclePolicy).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "policy-1",
      payload,
      "lifecycle-policy-activate-1",
      expect.any(String),
    );
  });

  it("protects pending employee hire requests with the standard browser mutation controls", async () => {
    const repository = {
      createEmployeeHireRequest: vi.fn(async () => ({
        id: "request-1",
        employee_id: "employee-1",
        company_id: "company-a",
        relationship_id: "relationship-1",
        lifecycle_request_id: "request-1",
        status: "pending_approval",
        audit_event_id: "audit-5",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmployeeHireRequest">;
    const payload = {
      company_id: "company-a",
      job_id: "job-1",
      profile_draft_assignment_id: "assignment-1",
      effective_on: "2026-10-15",
      reason: "Approved profile is ready for independent hire review.",
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/hire_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "employee-hire-request-1")
      .send(payload);
    expect(response.status).toBe(201);
    expect(repository.createEmployeeHireRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "employee-hire-request-1",
      expect.any(String),
    );
  });

  it("parses the bounded pending Hire review queue query", async () => {
    const repository = {
      listEmployeeHireRequests: vi.fn(async () => ({ items: [] })),
    } as unknown as Pick<SourceHrRepository, "listEmployeeHireRequests">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/hire_requests?company_id=company-a&search=Analyst&limit=25")
      .set("cookie", "nexora_session=token-hr");
    expect(response.status).toBe(200);
    expect(repository.listEmployeeHireRequests).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      { company_id: "company-a", search: "Analyst", limit: 25 },
    );
  });

  it("rejects an unbounded Hire review queue query before repository access", async () => {
    const repository = {
      listEmployeeHireRequests: vi.fn(async () => ({ items: [] })),
    } as unknown as Pick<SourceHrRepository, "listEmployeeHireRequests">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/hire_requests?company_id=company-a&limit=101")
      .set("cookie", "nexora_session=token-hr");
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(repository.listEmployeeHireRequests).not.toHaveBeenCalled();
  });

  it("returns one authenticated, company-scoped Hire review projection", async () => {
    const detail = {
      id: "request-1",
      employee_id: "employee-1",
      employee_number: "EMP-001",
      employee_name: "Ayesha Khan",
      company_id: "company-a",
      relationship_id: "relationship-1",
      job_id: "job-1",
      job_code: "ANL-1",
      job_name: "Analyst",
      profile_draft_assignment_id: "assignment-1",
      designation: "Analyst",
      job_grade: "G1",
      employment_type: "Full time",
      work_location: "Head office",
      effective_on: "2026-10-15",
      requested_by: "maker-user",
      requested_at: "2026-10-15T01:00:00.000Z",
      reason: "Approved profile is ready for independent hire review.",
      status: "pending",
      decided_by: null,
      decided_at: null,
      decision_reason: null,
    } as const;
    const repository = {
      getEmployeeHireRequest: vi.fn(async () => detail),
    } as unknown as Pick<SourceHrRepository, "getEmployeeHireRequest">;
    const blocked = await request(appForHr(repository)).get("/api/v1/hr/employees/employee-1/hire_requests/request-1");
    expect(blocked.status).toBe(401);
    expect(repository.getEmployeeHireRequest).not.toHaveBeenCalled();

    const accepted = await request(appForHr(repository))
      .get("/api/v1/hr/employees/employee-1/hire_requests/request-1")
      .set("cookie", "nexora_session=token-hr");
    expect(accepted.status).toBe(200);
    expect(accepted.body).toEqual(detail);
    expect(repository.getEmployeeHireRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "request-1",
    );
  });

  it("protects independent employee hire decisions with the standard browser mutation controls", async () => {
    const repository = {
      decideEmployeeHireRequest: vi.fn(async () => ({
        id: "request-1",
        employee_id: "employee-1",
        company_id: "company-a",
        relationship_id: "relationship-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-6",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "decideEmployeeHireRequest">;
    const payload = { decision: "approved", reason: "Independent HR approval completed." };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/hire_requests/request-1/decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "employee-hire-decision-1")
      .send(payload);
    expect(response.status).toBe(200);
    expect(repository.decideEmployeeHireRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "request-1",
      payload,
      "employee-hire-decision-1",
      expect.any(String),
    );
  });

  it("protects Transfer creation and independent decisions with the standard browser controls", async () => {
    const repository = {
      createEmployeeTransferRequest: vi.fn(async () => ({
        id: "transfer-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "pending",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      decideEmployeeTransferRequest: vi.fn(async () => ({
        id: "transfer-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmployeeTransferRequest" | "decideEmployeeTransferRequest">;
    const payload = {
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      branch_id: "branch-2",
      department_id: "department-2",
      job_id: "job-1",
      designation_id: "designation-1",
      job_grade_id: "grade-1",
      cost_center_id: "cost-center-1",
      work_location_id: "location-1",
      employment_type_id: "employment-type-1",
      employee_category_id: "category-1",
      effective_on: "2026-10-16",
      reason: "Move the employee to the new operating branch.",
    };
    const created = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/transfer_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "transfer-request-1")
      .send(payload);
    expect(created.status).toBe(201);
    expect(repository.createEmployeeTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "transfer-request-1",
      expect.any(String),
    );

    const decision = { decision: "approved", reason: "Independent Transfer approval completed." };
    const decided = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/transfer_requests/transfer-1/decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "transfer-decision-1")
      .send(decision);
    expect(decided.status).toBe(200);
    expect(repository.decideEmployeeTransferRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "transfer-1",
      decision,
      "transfer-decision-1",
      expect.any(String),
    );
  });

  it("protects Promotion creation and independent decisions with the standard browser controls", async () => {
    const repository = {
      createEmployeePromotionRequest: vi.fn(async () => ({
        id: "promotion-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "pending",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      decideEmployeePromotionRequest: vi.fn(async () => ({
        id: "promotion-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createEmployeePromotionRequest" | "decideEmployeePromotionRequest">;
    const payload = {
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      job_id: "job-2",
      designation_id: "designation-2",
      job_grade_id: "grade-2",
      effective_on: "2026-10-16",
      reason: "Promote the employee to the approved role.",
    };
    const created = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/promotion_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "promotion-request-1")
      .send(payload);
    expect(created.status).toBe(201);
    expect(repository.createEmployeePromotionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "promotion-request-1",
      expect.any(String),
    );

    const decision = { decision: "approved", reason: "Independent Promotion approval completed." };
    const decided = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/promotion_requests/promotion-1/decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "promotion-decision-1")
      .send(decision);
    expect(decided.status).toBe(200);
    expect(repository.decideEmployeePromotionRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "promotion-1",
      decision,
      "promotion-decision-1",
      expect.any(String),
    );
  });

  it("protects manager-change creation and independent decisions with explicit clear intent", async () => {
    const repository = {
      createEmployeeManagerChangeRequest: vi.fn(async () => ({
        id: "manager-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "pending",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      decideEmployeeManagerChangeRequest: vi.fn(async () => ({
        id: "manager-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<
      SourceHrRepository,
      "createEmployeeManagerChangeRequest" | "decideEmployeeManagerChangeRequest"
    >;
    const payload = {
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      reporting_manager_id: null,
      clear_reporting_manager: true,
      effective_on: "2026-10-16",
      reason: "Move the employee to the approved top-level reporting line.",
    };
    const created = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/manager_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "manager-change-request-1")
      .send(payload);
    expect(created.status).toBe(201);
    expect(repository.createEmployeeManagerChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "manager-change-request-1",
      expect.any(String),
    );

    const ambiguous = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/manager_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "manager-change-request-invalid")
      .send({ ...payload, clear_reporting_manager: false });
    expect(ambiguous.status).toBe(400);

    const decision = { decision: "approved", reason: "Independent manager-change approval completed." };
    const decided = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/manager_change_requests/manager-change-1/decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "manager-change-decision-1")
      .send(decision);
    expect(decided.status).toBe(200);
    expect(repository.decideEmployeeManagerChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "manager-change-1",
      decision,
      "manager-change-decision-1",
      expect.any(String),
    );
  });

  it("protects work-location-change creation and independent decisions", async () => {
    const repository = {
      createEmployeeWorkLocationChangeRequest: vi.fn(async () => ({
        id: "work-location-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "pending",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      decideEmployeeWorkLocationChangeRequest: vi.fn(async () => ({
        id: "work-location-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<
      SourceHrRepository,
      "createEmployeeWorkLocationChangeRequest" | "decideEmployeeWorkLocationChangeRequest"
    >;
    const payload = {
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      work_location_id: "location-2",
      effective_on: "2026-10-16",
      reason: "Move to the reviewed Lahore statutory location.",
    };
    const created = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/work_location_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "work-location-change-request-1")
      .send(payload);
    expect(created.status).toBe(201);
    expect(repository.createEmployeeWorkLocationChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "work-location-change-request-1",
      expect.any(String),
    );

    const invalid = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/work_location_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "work-location-change-request-invalid")
      .send({ ...payload, reason: "" });
    expect(invalid.status).toBe(400);

    const decision = { decision: "approved", reason: "Independent location approval completed." };
    const decided = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/work_location_change_requests/work-location-change-1/decision")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "work-location-change-decision-1")
      .send(decision);
    expect(decided.status).toBe(200);
    expect(repository.decideEmployeeWorkLocationChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "work-location-change-1",
      decision,
      "work-location-change-decision-1",
      expect.any(String),
    );
  });

  it("protects complete organization-placement creation and decisions", async () => {
    const repository = {
      createEmployeeOrganizationPlacementChangeRequest: vi.fn(async () => ({
        id: "organization-placement-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "pending",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      decideEmployeeOrganizationPlacementChangeRequest: vi.fn(async () => ({
        id: "organization-placement-change-1",
        employee_id: "employee-1",
        company_id: "company-a",
        source_assignment_id: "assignment-1",
        status: "approved",
        assignment_id: "assignment-2",
        audit_event_id: "audit-2",
        replayed: false,
      })),
    } as unknown as Pick<
      SourceHrRepository,
      "createEmployeeOrganizationPlacementChangeRequest" | "decideEmployeeOrganizationPlacementChangeRequest"
    >;
    const payload = {
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      proposed: {
        business_unit_id: "business-unit-2",
        division_id: "division-2",
        branch_id: "branch-2",
        department_id: "department-2",
        warehouse_id: "warehouse-2",
      },
      effective_on: "2026-10-16",
      reason: "Move to the complete target organization hierarchy.",
    };
    const created = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/organization_placement_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "organization-placement-request-1")
      .send(payload);
    expect(created.status).toBe(201);
    expect(repository.createEmployeeOrganizationPlacementChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "organization-placement-request-1",
      expect.any(String),
    );

    const invalid = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/organization_placement_change_requests")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "organization-placement-invalid")
      .send({ ...payload, proposed: { ...payload.proposed, branch_id: undefined } });
    expect(invalid.status).toBe(400);

    const decision = { decision: "approved", reason: "The complete hierarchy was independently approved." };
    const decided = await request(appForHr(repository))
      .post(
        "/api/v1/hr/employees/employee-1/organization_placement_change_requests/organization-placement-change-1/decision",
      )
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "organization-placement-decision-1")
      .send(decision);
    expect(decided.status).toBe(200);
    expect(repository.decideEmployeeOrganizationPlacementChangeRequest).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      "organization-placement-change-1",
      decision,
      "organization-placement-decision-1",
      expect.any(String),
    );
  });

  it("rejects HR data requests without an authenticated session", async () => {
    const response = await request(
      appForHr({
        listEmployees: vi.fn(),
        getEmployee: vi.fn(),
        listEmployeeDrafts: vi.fn(),
        getEmployeeDraft: vi.fn(),
        listMasters: vi.fn(),
        createEmployeeDraft: vi.fn(),
        updateEmployeeDraft: vi.fn(),
      }),
    ).get("/api/v1/hr/employees?company_id=company-a");

    expect(response.status).toBe(401);
    expect(response.body.code).toBe("INVALID_SESSION");
  });

  it("passes an authenticated tenant context and bounded employee query to the repository", async () => {
    const repository = {
      listEmployees: vi.fn(async () => ({ items: [] })),
      getEmployee: vi.fn(),
      listEmployeeDrafts: vi.fn(),
      getEmployeeDraft: vi.fn(),
      listMasters: vi.fn(),
      createEmployeeDraft: vi.fn(),
      updateEmployeeDraft: vi.fn(),
    } as unknown as Pick<SourceHrRepository, "listEmployees" | "getEmployee" | "listMasters">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/employees?company_id=company-a&search=Ayesha&limit=25")
      .set("cookie", "nexora_session=token-hr");

    expect(response.status).toBe(200);
    expect(repository.listEmployees).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr", actor: expect.objectContaining({ userId: "user-hr" }) }),
      { company_id: "company-a", search: "Ayesha", limit: 25 },
    );
  });

  it("derives the HR company picker from the authenticated server context", async () => {
    const repository = {
      listCompanies: vi.fn(async () => ({ items: [{ id: "company-a", code: "A", name: "Company A" }] })),
      listEmployees: vi.fn(),
      getEmployee: vi.fn(),
      listEmployeeDrafts: vi.fn(),
      getEmployeeDraft: vi.fn(),
      listMasters: vi.fn(),
      createEmployeeDraft: vi.fn(),
      updateEmployeeDraft: vi.fn(),
    } as unknown as Pick<SourceHrRepository, "listCompanies">;

    const response = await request(appForHr(repository))
      .get("/api/v1/hr/companies")
      .set("cookie", "nexora_session=token-hr");

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [{ id: "company-a", code: "A", name: "Company A" }] });
    expect(repository.listCompanies).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr", actor: expect.objectContaining({ userId: "user-hr" }) }),
    );
  });

  it("returns the company-scoped HR operational dashboard", async () => {
    const summary = {
      company_id: "company-a",
      generated_at: "2026-10-19T10:00:00.000Z",
      metrics: { active_headcount: 12, draft_profiles: 2, pending_employee_approvals: 1, pending_movements: 3, active_departments: 4, recent_joiners: 2, master_configuration_gaps: 1 },
      status_distribution: [{ status: "active", count: 12 }],
      action_items: [{ key: "approvals", label: "Employee approvals", count: 1, page_id: "employee-approvals", tone: "attention" }],
    } as const;
    const repository = { getDashboard: vi.fn(async () => summary) } as unknown as Pick<SourceHrRepository, "getDashboard">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/dashboard?company_id=company-a")
      .set("cookie", "nexora_session=token-hr");
    expect(response.status).toBe(200);
    expect(response.body).toEqual(summary);
    expect(repository.getDashboard).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-hr" }), "company-a");
  });

  it("rejects an invalid master-data query before it reaches the repository", async () => {
    const repository = {
      listEmployees: vi.fn(),
      getEmployee: vi.fn(),
      listEmployeeDrafts: vi.fn(),
      getEmployeeDraft: vi.fn(),
      listMasters: vi.fn(),
      createEmployeeDraft: vi.fn(),
      updateEmployeeDraft: vi.fn(),
    } as unknown as Pick<SourceHrRepository, "listEmployees" | "getEmployee" | "listMasters">;
    const response = await request(appForHr(repository))
      .get("/api/v1/hr/masters?company_id=company-a&limit=1000")
      .set("cookie", "nexora_session=token-hr");

    expect(response.status).toBe(400);
    expect(response.body.code).toBe("INVALID_REQUEST");
    expect(repository.listMasters).not.toHaveBeenCalled();
  });

  it("protects employee draft creation with origin, CSRF, and idempotency controls", async () => {
    const repository = {
      listEmployees: vi.fn(),
      getEmployee: vi.fn(),
      listEmployeeDrafts: vi.fn(),
      getEmployeeDraft: vi.fn(),
      listMasters: vi.fn(),
      createEmployeeDraft: vi.fn(async () => ({
        id: "employee-1",
        employee_number: "EMP-001",
        status: "draft",
        company_id: "company-a",
        audit_event_id: "audit-1",
        replayed: false,
      })),
      updateEmployeeDraft: vi.fn(),
    } as unknown as Pick<
      SourceHrRepository,
      "listEmployees" | "getEmployee" | "listEmployeeDrafts" | "listMasters" | "createEmployeeDraft"
    >;
    const payload = {
      company_id: "company-a",
      employee_number: "EMP-001",
      first_name: "Ayesha",
      last_name: "Khan",
      joined_on: "2026-10-15",
    };
    const blocked = await request(appForHr(repository))
      .post("/api/v1/hr/employees")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://untrusted.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "hr-draft-1")
      .send(payload);
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("ORIGIN_VALIDATION_FAILED");

    const accepted = await request(appForHr(repository))
      .post("/api/v1/hr/employees")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "hr-draft-1")
      .send(payload);
    expect(accepted.status).toBe(201);
    expect(repository.createEmployeeDraft).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      payload,
      "hr-draft-1",
      expect.any(String),
    );
  });

  it("creates a profile-draft assignment through the same mutation safeguards", async () => {
    const repository = {
      listEmployees: vi.fn(),
      getEmployee: vi.fn(),
      listEmployeeDrafts: vi.fn(),
      getEmployeeDraft: vi.fn(),
      listMasters: vi.fn(),
      createEmployeeDraft: vi.fn(),
      updateEmployeeDraft: vi.fn(),
      createProfileDraftAssignment: vi.fn(async () => ({
        id: "assignment-1",
        employee_id: "employee-1",
        company_id: "company-a",
        assignment_status: "profile_draft",
        audit_event_id: "audit-1",
        replayed: false,
      })),
    } as unknown as Pick<SourceHrRepository, "createProfileDraftAssignment">;
    const payload = {
      company_id: "company-a",
      designation_id: "designation-a",
      job_grade_id: "grade-a",
      cost_center_id: "cost-center-a",
      work_location_id: "location-a",
      employment_type_id: "employment-type-a",
      employee_category_id: "category-a",
      effective_from: "2026-10-15",
    };
    const response = await request(appForHr(repository))
      .post("/api/v1/hr/employees/employee-1/profile_draft_assignment")
      .set("cookie", "nexora_session=token-hr")
      .set("origin", "https://hr.example.test")
      .set("x-csrf-token", session.csrfToken)
      .set("idempotency-key", "profile-assignment-1")
      .send(payload);

    expect(response.status).toBe(201);
    expect(repository.createProfileDraftAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: "tenant-hr" }),
      "employee-1",
      payload,
      "profile-assignment-1",
      expect.any(String),
    );
  });
});
