import { describe, expect, it, vi } from "vitest";

import type { NexoraApiClient } from "../../app/lib/api/generated.js";
import { HrApiClient } from "../../app/features/hr/api/hr-client.js";

describe("HR browser client", () => {
  it("serializes governed Hire reads through the generated API client", async () => {
    const api = {
      listHrOrganizationUnits: vi.fn(async () => ({ items: [] })),
      listHrEmployeeHireRequests: vi.fn(async () => ({ items: [] })),
      getHrEmployeeHireRequest: vi.fn(async () => ({ id: "request-1" })),
    } as unknown as NexoraApiClient;
    const client = new HrApiClient(api);

    await client.organizationUnits({ companyId: "company/a", type: "branch", limit: 25 });
    await client.hireRequests({ companyId: "company/a", search: "Ayesha Khan", limit: 20 });
    await client.hireRequest("employee/a", "request/a");

    expect(api.listHrOrganizationUnits).toHaveBeenCalledWith("?company_id=company%2Fa&type=branch&limit=25");
    expect(api.listHrEmployeeHireRequests).toHaveBeenCalledWith("?company_id=company%2Fa&search=Ayesha+Khan&limit=20");
    expect(api.getHrEmployeeHireRequest).toHaveBeenCalledWith("employee/a", "request/a");
  });

  it("passes Hire mutation payloads and browser safeguards without rewriting them", async () => {
    const requestResult = {
      id: "request-1",
      employee_id: "employee-1",
      company_id: "company-a",
      relationship_id: "relationship-1",
      lifecycle_request_id: "request-1",
      status: "pending_approval" as const,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const decisionResult = {
      id: "request-1",
      employee_id: "employee-1",
      company_id: "company-a",
      relationship_id: "relationship-1",
      status: "approved" as const,
      assignment_id: "assignment-2",
      audit_event_id: "audit-2",
      replayed: false,
    };
    const api = {
      createHrEmployeeHireRequest: vi.fn(async () => requestResult),
      decideHrEmployeeHireRequest: vi.fn(async () => decisionResult),
    } as unknown as NexoraApiClient;
    const client = new HrApiClient(api);
    const request = {
      company_id: "company-a",
      job_id: "job-1",
      profile_draft_assignment_id: "assignment-1",
      effective_on: "2026-10-16",
      reason: "Ready for independent review.",
    };
    const decision = { decision: "approved" as const, reason: "Independent review completed." };

    await expect(client.createHireRequest("employee-1", request, "csrf-token", "request-key")).resolves.toEqual(
      requestResult,
    );
    await expect(
      client.decideHireRequest("employee-1", "request-1", decision, "csrf-token", "decision-key"),
    ).resolves.toEqual(decisionResult);
    expect(api.createHrEmployeeHireRequest).toHaveBeenCalledWith("employee-1", request, "csrf-token", "request-key");
    expect(api.decideHrEmployeeHireRequest).toHaveBeenCalledWith(
      "employee-1",
      "request-1",
      decision,
      "csrf-token",
      "decision-key",
    );
  });

  it("passes Transfer reads and mutations through the generated API client", async () => {
    const requestResult = {
      id: "transfer-1",
      employee_id: "employee-1",
      company_id: "company-a",
      source_assignment_id: "assignment-1",
      status: "pending" as const,
      audit_event_id: "audit-1",
      replayed: false,
    };
    const api = {
      listHrEmployeeTransferRequests: vi.fn(async () => ({ items: [] })),
      getHrEmployeeTransferRequest: vi.fn(async () => ({ id: "transfer-1" })),
      createHrEmployeeTransferRequest: vi.fn(async () => requestResult),
      decideHrEmployeeTransferRequest: vi.fn(async () => ({
        ...requestResult,
        status: "approved" as const,
        assignment_id: "assignment-2",
      })),
    } as unknown as NexoraApiClient;
    const client = new HrApiClient(api);
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

    await client.transferRequests({ companyId: "company/a", search: "EMP 1", limit: 10 });
    await client.transferRequest("employee/a", "transfer/a");
    await expect(client.createTransferRequest("employee-1", payload, "csrf", "request-key")).resolves.toEqual(
      requestResult,
    );
    await client.decideTransferRequest(
      "employee-1",
      "transfer-1",
      { decision: "approved", reason: "Independently approved." },
      "csrf",
      "decision-key",
    );

    expect(api.listHrEmployeeTransferRequests).toHaveBeenCalledWith(
      "?company_id=company%2Fa&search=EMP+1&limit=10",
    );
    expect(api.getHrEmployeeTransferRequest).toHaveBeenCalledWith("employee/a", "transfer/a");
    expect(api.createHrEmployeeTransferRequest).toHaveBeenCalledWith(
      "employee-1",
      payload,
      "csrf",
      "request-key",
    );
    expect(api.decideHrEmployeeTransferRequest).toHaveBeenCalledWith(
      "employee-1",
      "transfer-1",
      { decision: "approved", reason: "Independently approved." },
      "csrf",
      "decision-key",
    );
  });
});
