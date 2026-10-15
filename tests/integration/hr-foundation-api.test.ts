import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import {
  HrApiError,
  SourceHrRepository,
  type HrActorContext,
} from "../../server/api/src/modules/hr/source-repository.js";
import { ensureSourceAuthorizationFixture, sourceTestTenantId } from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

function context(userId: string, tenantId = sourceTestTenantId, createEmployee = false): HrActorContext {
  const actor: AuthenticatedAccount = {
    tenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: ["hr_reader"],
    permissions: [
      "hr.employee.read",
      "hr.master.read",
      ...(createEmployee
        ? [
            "hr.employee.create",
            "hr.employee.update",
            "hr.employee.submit",
            "hr.employee.approve",
            "hr.employee_assignment.create",
          ]
        : []),
    ],
    sessionVersion: 1,
  };
  return { tenantId, actor };
}

run("HR foundation API repository", () => {
  let pool: DatabasePool;
  let repository: SourceHrRepository;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await ensureSourceAuthorizationFixture(pool);
    repository = new SourceHrRepository(pool);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it("returns only the requested authorized company directory and a compact projection", async () => {
    const result = await repository.listEmployees(context("r06.maker"), {
      company_id: "nexora-r06-uat-company",
      search: "Target",
      limit: 25,
    });

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "r06-uat-employee-target",
          employee_number: "R06-UAT-001",
          company_id: "nexora-r06-uat-company",
          designation: "R06 UAT Designation",
        }),
      ]),
    );
    expect(JSON.stringify(result)).not.toContain("national_id");
    expect(JSON.stringify(result)).not.toContain("bank_account");
  });

  it("returns master records within the same authorized company scope", async () => {
    const result = await repository.listMasters(context("r06.maker"), {
      company_id: "nexora-r06-uat-company",
      active_only: true,
      limit: 100,
    });

    expect(result.items.map((item) => item.type)).toEqual(
      expect.arrayContaining([
        "designation",
        "job_grade",
        "cost_center",
        "work_location",
        "employment_type",
        "employee_category",
      ]),
    );
    expect(result.items.every((item) => item.company_id === "nexora-r06-uat-company")).toBe(true);
  });

  it("lists only the authenticated user's active HR company scope", async () => {
    const result = await repository.listCompanies(context("r06.maker"));

    expect(result.items).toEqual(
      expect.arrayContaining([
        { id: "nexora-r06-uat-company", code: "R06-UAT", name: "Nexora R06 UAT Company" },
        { id: "nexora-r06-uat-company-two", code: "R06-UAT-2", name: "Nexora R06 UAT Company Two" },
      ]),
    );
    expect((await repository.listCompanies(context("r06.restricted"))).items).toEqual([
      { id: "nexora-r06-uat-company", code: "R06-UAT", name: "Nexora R06 UAT Company" },
    ]);
  });

  it("keeps employee contacts permission-scoped, company-scoped and append-only", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const reader = context("r06.maker");
    reader.actor.permissions = ["hr.employee_contact.read"];
    await expect(repository.listEmployeeContacts(reader, "r06-uat-employee-target")).resolves.toMatchObject({
      items: expect.any(Array),
    });
    await expect(
      repository.listEmployeeContacts(context("r06.maker"), "r06-uat-employee-target"),
    ).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);

    const manager = context("r06.maker");
    manager.actor.permissions = ["hr.employee_contact.manage"];
    const input = {
      channel: "email" as const,
      contact_usage: "other" as const,
      contact_value: `contact-${suffix}@example.test`,
      label: "Controlled test contact",
      is_primary: false,
    };
    const first = await repository.createEmployeeContact(
      manager,
      "r06-uat-employee-target",
      input,
      `contact-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.createEmployeeContact(
      manager,
      "r06-uat-employee-target",
      input,
      `contact-${suffix}`,
      "hr-test-correlation",
    );
    expect(replay).toEqual({ ...first, replayed: true });
    const contacts = await repository.listEmployeeContacts(reader, "r06-uat-employee-target");
    expect(contacts.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ contact_value: input.contact_value, channel: "email", contact_usage: "other" }),
      ]),
    );
    const otherTenantReader = context("r06.maker", "other-tenant");
    otherTenantReader.actor.permissions = ["hr.employee_contact.read"];
    await expect(repository.listEmployeeContacts(otherTenantReader, "r06-uat-employee-target")).rejects.toMatchObject({
      status: 404,
      code: "HR_EMPLOYEE_NOT_FOUND",
    } satisfies Partial<HrApiError>);
  });

  it("keeps emergency contacts separately permission-scoped and rejects conflicting active priorities", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const reader = context("r06.maker");
    reader.actor.permissions = ["hr.employee_emergency_contact.read"];
    await expect(repository.listEmployeeEmergencyContacts(reader, "r06-uat-employee-target")).resolves.toMatchObject({
      items: expect.any(Array),
    });
    await expect(
      repository.listEmployeeEmergencyContacts(context("r06.maker"), "r06-uat-employee-target"),
    ).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);

    const manager = context("r06.maker");
    manager.actor.permissions = ["hr.employee_emergency_contact.manage"];
    const usedPriorities = await pool.query<{ priority: number }>(
      `select priority from employee_emergency_contact
        where tenant_id=$1 and employee_id=$2 and status='active' and effective_to is null`,
      [sourceTestTenantId, "r06-uat-employee-target"],
    );
    const usedPrioritySet = new Set(usedPriorities.rows.map((row) => row.priority));
    const priority = Array.from({ length: 99 }, (_, index) => index + 1).find(
      (candidate) => !usedPrioritySet.has(candidate),
    );
    if (priority === undefined) throw new Error("The emergency-contact fixture has no available test priority.");
    const input = {
      name: "Controlled Contact",
      relationship: "Sibling",
      phone: `+92300${suffix.slice(0, 7)}`,
      priority,
      is_primary: false,
    };
    const first = await repository.createEmployeeEmergencyContact(
      manager,
      "r06-uat-employee-target",
      input,
      `emergency-contact-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.createEmployeeEmergencyContact(
      manager,
      "r06-uat-employee-target",
      input,
      `emergency-contact-${suffix}`,
      "hr-test-correlation",
    );
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(
      repository.createEmployeeEmergencyContact(
        manager,
        "r06-uat-employee-target",
        { ...input, name: "Conflicting Priority" },
        `emergency-contact-conflict-${suffix}`,
        "hr-test-correlation",
      ),
    ).rejects.toMatchObject({ status: 409, code: "HR_EMERGENCY_CONTACT_CONFLICT" } satisfies Partial<HrApiError>);
    expect(await repository.listEmployeeEmergencyContacts(reader, "r06-uat-employee-target")).toMatchObject({
      items: expect.arrayContaining([expect.objectContaining({ name: input.name, priority: input.priority })]),
    });
  });

  it("returns restricted document metadata only through the dedicated document permission", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const documentId = `r06-document-${suffix}`;
    await pool.query(
      `insert into employee_document
        (id,tenant_id,employee_id,document_type,title,reference,storage_key,restricted,created_by)
       values ($1,$2,'r06-uat-employee-target','qualification','Controlled certificate',$3,null,true,'r06.maker')`,
      [documentId, sourceTestTenantId, `CERT-${suffix}`],
    );
    const reader = context("r06.maker");
    reader.actor.permissions = ["hr.employee_document.read"];
    const documents = await repository.listEmployeeDocuments(reader, "r06-uat-employee-target");
    expect(documents.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: documentId, reference: `CERT-${suffix}`, restricted: true }),
      ]),
    );
    expect(JSON.stringify(documents)).not.toContain("storage_key");
    await expect(repository.listEmployeeDocuments(context("r06.maker"), "r06-uat-employee-target")).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);
  });

  it("returns an immutable assignment timeline only through assignment read permission", async () => {
    const reader = context("r06.maker");
    reader.actor.permissions = ["hr.employee_assignment.read"];
    const assignments = await repository.listEmployeeAssignments(reader, "r06-uat-employee-target");
    expect(assignments.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employee_id: "r06-uat-employee-target",
          assignment_status: expect.any(String),
          effective_from: expect.any(String),
        }),
      ]),
    );
    expect(JSON.stringify(assignments)).not.toContain("reporting_manager_id");
    await expect(repository.listEmployeeAssignments(context("r06.maker"), "r06-uat-employee-target")).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);
  });

  it("returns immutable status history only through employment-history read permission", async () => {
    const historyId = `r06-status-history-${randomUUID()}`;
    await pool.query(
      `insert into employee_status_history
        (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id)
       values ($1,$2,'r06-uat-employee-target','active','suspended',current_date,'Controlled history fixture','r06.maker')`,
      [historyId, sourceTestTenantId],
    );
    const reader = context("r06.maker");
    reader.actor.permissions = ["hr.employment_history.read"];
    const history = await repository.listEmployeeStatusHistory(reader, "r06-uat-employee-target");
    expect(history.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: historyId,
          employee_id: "r06-uat-employee-target",
          to_status: expect.any(String),
          effective_on: expect.any(String),
        }),
      ]),
    );
    expect(JSON.stringify(history)).not.toContain("actor_id");
    await expect(repository.listEmployeeStatusHistory(context("r06.maker"), "r06-uat-employee-target")).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);
  });

  it("lists lifecycle policies only within the authorized company and policy-read permission", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const policyId = `r06-lifecycle-policy-${suffix}`;
    await pool.query(
      `insert into hr_employment_lifecycle_policy
        (id,tenant_id,legal_employer_id,code,name,version,status,effective_from,created_by)
       values ($1,$2,'nexora-r06-uat-company',$3,'Controlled lifecycle policy',1,'draft',current_date,'r06.maker')`,
      [policyId, sourceTestTenantId, `R06-${suffix}`],
    );
    const reader = context("r06.restricted");
    reader.actor.permissions = ["hr.employment_lifecycle_policy.read"];
    const policies = await repository.listEmploymentLifecyclePolicies(reader, {
      company_id: "nexora-r06-uat-company",
      limit: 25,
    });
    expect(policies.items).toEqual(expect.arrayContaining([expect.objectContaining({ id: policyId, status: "draft" })]));
    await expect(
      repository.listEmploymentLifecyclePolicies(context("r06.maker"), {
        company_id: "nexora-r06-uat-company",
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<HrApiError>);
    await expect(
      repository.listEmploymentLifecyclePolicies(reader, {
        company_id: "nexora-r06-uat-company-two",
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
  });

  it("creates an idempotent draft lifecycle policy with only its fixed initial hire definition", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const manager = context("r06.maker");
    manager.actor.permissions = ["hr.employment_lifecycle_policy.manage"];
    const input = {
      company_id: "nexora-r06-uat-company",
      code: `R06-${suffix}`,
      name: "Controlled employment lifecycle",
      effective_from: "2026-10-15",
    };
    const first = await repository.createEmploymentLifecyclePolicy(
      manager,
      input,
      `lifecycle-policy-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.createEmploymentLifecyclePolicy(
      manager,
      input,
      `lifecycle-policy-${suffix}`,
      "hr-test-correlation",
    );
    expect(first).toMatchObject({ company_id: input.company_id, code: input.code, version: 1, status: "draft" });
    expect(replay).toEqual({ ...first, replayed: true });
    await expect(
      repository.createEmploymentLifecyclePolicy(
        context("r06.maker"),
        input,
        `lifecycle-policy-denied-${suffix}`,
        "hr-test-correlation",
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<HrApiError>);

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      const states = await client.query(
        `select code,canonical_class,is_initial from hr_employment_lifecycle_state
          where tenant_id=$1 and policy_id=$2 order by display_order`,
        [sourceTestTenantId, first.id],
      );
      const transitions = await client.query(
        `select event_type,requires_approval,workflow_trigger from hr_employment_lifecycle_transition
          where tenant_id=$1 and policy_id=$2`,
        [sourceTestTenantId, first.id],
      );
      const audit = await client.query(
        `select action,entity_type,entity_id from platform_admin_audit_event where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, first.audit_event_id],
      );
      await client.query("commit");
      expect(states.rows).toEqual([
        { code: "pre_employment", canonical_class: "pre_employment", is_initial: true },
        { code: "employed", canonical_class: "employed", is_initial: false },
      ]);
      expect(transitions.rows).toEqual([
        { event_type: "hire", requires_approval: true, workflow_trigger: "hr_employment_hire" },
      ]);
      expect(audit.rows).toEqual([
        { action: "hr.employment_lifecycle_policy.create", entity_type: "employment_lifecycle_policy", entity_id: first.id },
      ]);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("submits a lifecycle-policy draft idempotently without approving or activating it", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const manager = context("r06.maker");
    manager.actor.permissions = ["hr.employment_lifecycle_policy.manage"];
    const created = await repository.createEmploymentLifecyclePolicy(
      manager,
      {
        company_id: "nexora-r06-uat-company",
        code: `R06-SUBMIT-${suffix}`,
        name: "Submission-controlled lifecycle",
        effective_from: "2026-10-15",
      },
      `lifecycle-policy-create-${suffix}`,
      "hr-test-correlation",
    );
    const first = await repository.submitEmploymentLifecyclePolicy(
      manager,
      created.id,
      { reason: "Ready for independent review." },
      `lifecycle-policy-submit-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.submitEmploymentLifecyclePolicy(
      manager,
      created.id,
      { reason: "Ready for independent review." },
      `lifecycle-policy-submit-${suffix}`,
      "hr-test-correlation",
    );
    expect(first).toMatchObject({ id: created.id, status: "pending_approval", replayed: false });
    expect(replay).toEqual({ ...first, replayed: true });
    const policy = await pool.query<{ status: string; submitted_by: string | null }>(
      "select status,submitted_by from hr_employment_lifecycle_policy where tenant_id=$1 and id=$2",
      [sourceTestTenantId, created.id],
    );
    expect(policy.rows).toEqual([{ status: "pending_approval", submitted_by: "r06.maker" }]);
    const audit = await pool.query<{ action: string }>(
      "select action from platform_admin_audit_event where tenant_id=$1 and entity_id=$2 order by sequence desc limit 1",
      [sourceTestTenantId, created.id],
    );
    expect(audit.rows).toEqual([{ action: "hr.employment_lifecycle_policy.submit" }]);
    await expect(
      repository.submitEmploymentLifecyclePolicy(
        context("r06.maker"),
        created.id,
        { reason: "Attempt without lifecycle policy manage permission." },
        `lifecycle-policy-denied-${suffix}`,
        "hr-test-correlation",
      ),
    ).rejects.toMatchObject({ status: 403, code: "PERMISSION_DENIED" } satisfies Partial<HrApiError>);
  });

  it("requires an independent approver and separately activates a current lifecycle policy", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase();
    const manager = context("r06.maker");
    manager.actor.permissions = ["hr.employment_lifecycle_policy.manage"];
    const created = await repository.createEmploymentLifecyclePolicy(
      manager,
      { company_id: "nexora-r06-uat-company", code: `R06-APPROVE-${suffix}`, name: "Approval-controlled lifecycle", effective_from: "2026-10-15" },
      `lifecycle-policy-create-approval-${suffix}`,
      "hr-test-correlation",
    );
    await repository.submitEmploymentLifecyclePolicy(
      manager,
      created.id,
      { reason: "Ready for independent approval." },
      `lifecycle-policy-submit-approval-${suffix}`,
      "hr-test-correlation",
    );
    manager.actor.permissions = ["hr.employment_lifecycle_policy.manage", "hr.employment_lifecycle_policy.approve"];
    const approver = context("r06.checker");
    approver.actor.permissions = ["hr.employment_lifecycle_policy.approve"];
    await expect(
      repository.approveEmploymentLifecyclePolicy(manager, created.id, { reason: "Self approval attempt." }, `lifecycle-policy-self-${suffix}`, "hr-test-correlation"),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);
    const approved = await repository.approveEmploymentLifecyclePolicy(
      approver,
      created.id,
      { reason: "Independently reviewed and approved." },
      `lifecycle-policy-approve-${suffix}`,
      "hr-test-correlation",
    );
    expect(approved).toMatchObject({ id: created.id, status: "approved", replayed: false });
    const policy = await pool.query<{ status: string; approved_by: string | null; activated_by: string | null }>(
      "select status,approved_by,activated_by from hr_employment_lifecycle_policy where tenant_id=$1 and id=$2",
      [sourceTestTenantId, created.id],
    );
    expect(policy.rows).toEqual([{ status: "approved", approved_by: "r06.checker", activated_by: null }]);
    const activated = await repository.activateEmploymentLifecyclePolicy(
      approver,
      created.id,
      { reason: "Approved policy is effective today." },
      `lifecycle-policy-activate-${suffix}`,
      "hr-test-correlation",
    );
    expect(activated).toMatchObject({ id: created.id, status: "active", replayed: false });
    const active = await pool.query<{ status: string; activated_by: string | null }>(
      "select status,activated_by from hr_employment_lifecycle_policy where tenant_id=$1 and id=$2",
      [sourceTestTenantId, created.id],
    );
    expect(active.rows).toEqual([{ status: "active", activated_by: "r06.checker" }]);
  });

  it("rejects a company outside the authenticated user's access and an unknown tenant", async () => {
    await expect(
      repository.listEmployees(context("r06.restricted"), {
        company_id: "nexora-r06-uat-company-two",
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);

    await expect(
      repository.listMasters(context("r06.maker", "other-tenant"), {
        company_id: "nexora-r06-uat-company",
        active_only: true,
        limit: 25,
      }),
    ).rejects.toMatchObject({ status: 403, code: "COMPANY_ACCESS_DENIED" } satisfies Partial<HrApiError>);
  });

  it("creates a company-scoped draft once and safely replays an idempotent retry", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    const input = {
      company_id: "nexora-r06-uat-company",
      employee_number: `R06-${suffix}`,
      first_name: "Draft",
      last_name: "Employee",
      joined_on: "2026-10-15",
    };
    const first = await repository.createEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      input,
      `draft-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.createEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      input,
      `draft-${suffix}`,
      "hr-test-correlation",
    );
    const drafts = await repository.listEmployeeDrafts(context("r06.maker"), {
      company_id: input.company_id,
      search: input.employee_number,
      limit: 25,
    });
    const detail = await repository.getEmployeeDraft(context("r06.maker"), first.id);
    const update = { preferred_name: "Updated draft" };
    const updated = await repository.updateEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      first.id,
      update,
      `update-${suffix}`,
      "hr-test-correlation",
    );
    const updateReplay = await repository.updateEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      first.id,
      update,
      `update-${suffix}`,
      "hr-test-correlation",
    );
    const submitted = await repository.submitEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      first.id,
      { reason: "Ready for HR review" },
      `submit-${suffix}`,
      "hr-test-correlation",
    );
    const decided = await repository.decideEmployeeDraftApproval(
      context("r06.checker", sourceTestTenantId, true),
      first.id,
      { decision: "approved", reason: "Profile approved for assignment" },
      `approve-${suffix}`,
      "hr-test-correlation",
    );

    expect(first).toMatchObject({ employee_number: input.employee_number, status: "draft", replayed: false });
    expect(replay).toEqual({ ...first, replayed: true });
    expect(drafts.items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: first.id, company_id: input.company_id })]),
    );
    expect(detail).toMatchObject({
      id: first.id,
      employee_number: input.employee_number,
      company_id: input.company_id,
      phone: "",
    });
    expect(updated).toMatchObject({ id: first.id, status: "draft", replayed: false });
    expect(updateReplay).toEqual({ ...updated, replayed: true });
    expect(submitted).toMatchObject({ id: first.id, status: "pending_approval", replayed: false });
    expect(decided).toMatchObject({ id: first.id, status: "pending_approval", replayed: false });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [sourceTestTenantId]);
      const scope = await client.query(
        "select company_id from hr_employee_draft_scope where tenant_id=$1 and employee_id=$2",
        [sourceTestTenantId, first.id],
      );
      const audit = await client.query(
        "select action,entity_id from platform_admin_audit_event where tenant_id=$1 and id=$2",
        [sourceTestTenantId, first.audit_event_id],
      );
      const updateAudit = await client.query(
        "select action from platform_admin_audit_event where tenant_id=$1 and id=$2",
        [sourceTestTenantId, updated.audit_event_id],
      );
      const history = await client.query(
        "select from_status,to_status,reason from employee_status_history where tenant_id=$1 and employee_id=$2 order by created_at asc limit 1",
        [sourceTestTenantId, first.id],
      );
      const approval = await client.query(
        "select state,decision_reason from hr_employee_draft_approval where tenant_id=$1 and employee_id=$2",
        [sourceTestTenantId, first.id],
      );
      await client.query("commit");
      expect(scope.rows).toEqual([{ company_id: input.company_id }]);
      expect(audit.rows).toEqual([{ action: "hr.employee.create", entity_id: first.id }]);
      expect(updateAudit.rows).toEqual([{ action: "hr.employee.update" }]);
      expect(history.rows).toEqual([
        { from_status: "draft", to_status: "pending_approval", reason: "Ready for HR review" },
      ]);
      expect(approval.rows).toEqual([{ state: "approved", decision_reason: "Profile approved for assignment" }]);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("returns a rejected submission to draft with a governed reason", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    const input = {
      company_id: "nexora-r06-uat-company",
      employee_number: `R06-${suffix}`,
      first_name: "Rejected",
      last_name: "Draft",
      joined_on: "2026-10-15",
    };
    const employee = await repository.createEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      input,
      `draft-reject-${suffix}`,
      "hr-test-correlation",
    );
    await repository.submitEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      employee.id,
      { reason: "Ready for review" },
      `submit-reject-${suffix}`,
      "hr-test-correlation",
    );
    const decision = await repository.decideEmployeeDraftApproval(
      context("r06.checker", sourceTestTenantId, true),
      employee.id,
      { decision: "rejected", reason: "Missing assignment information" },
      `reject-${suffix}`,
      "hr-test-correlation",
    );
    expect(decision).toMatchObject({ id: employee.id, status: "draft", replayed: false });
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [sourceTestTenantId]);
      const approval = await client.query(
        "select state,decision_reason from hr_employee_draft_approval where tenant_id=$1 and employee_id=$2",
        [sourceTestTenantId, employee.id],
      );
      const current = await client.query("select status,submitted_by from employee where tenant_id=$1 and id=$2", [
        sourceTestTenantId,
        employee.id,
      ]);
      await client.query("commit");
      expect(approval.rows).toEqual([{ state: "rejected", decision_reason: "Missing assignment information" }]);
      expect(current.rows).toEqual([{ status: "draft", submitted_by: null }]);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });

  it("returns only pending company-scoped drafts in the approval queue", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      {
        company_id: "nexora-r06-uat-company",
        employee_number: `R06-${suffix}`,
        first_name: "Queue",
        last_name: "Candidate",
        joined_on: "2026-10-15",
      },
      `queue-draft-${suffix}`,
      "hr-test-correlation",
    );
    await repository.submitEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      employee.id,
      { reason: "Awaiting approval" },
      `queue-submit-${suffix}`,
      "hr-test-correlation",
    );

    const queue = await repository.listEmployeeDraftApprovals(context("r06.maker", sourceTestTenantId, true), {
      company_id: "nexora-r06-uat-company",
      limit: 100,
    });

    expect(queue.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          employee_id: employee.id,
          employee_number: `R06-${suffix}`,
          company_id: "nexora-r06-uat-company",
          submitted_by: "r06.maker",
        }),
      ]),
    );
    const detail = await repository.getEmployeeDraftApproval(
      context("r06.checker", sourceTestTenantId, true),
      employee.id,
    );
    expect(detail).toMatchObject({
      id: employee.id,
      employee_number: `R06-${suffix}`,
      created_by: "r06.maker",
      submitted_by: "r06.maker",
      company_id: "nexora-r06-uat-company",
    });
    expect(detail.submitted_at).toEqual(expect.any(String));
    const approverOnly = context("r06.checker", sourceTestTenantId, true);
    approverOnly.actor.permissions = ["hr.employee.approve"];
    expect((await repository.listCompanies(approverOnly)).items).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: "nexora-r06-uat-company" })]),
    );
    expect((await repository.getEmployeeDraftApproval(approverOnly, employee.id)).id).toBe(employee.id);
    await expect(repository.getEmployeeDraftApproval(context("r06.checker"), employee.id)).rejects.toMatchObject({
      status: 403,
      code: "PERMISSION_DENIED",
    } satisfies Partial<HrApiError>);
    await expect(
      repository.decideEmployeeDraftApproval(
        context("r06.maker", sourceTestTenantId, true),
        employee.id,
        { decision: "approved", reason: "Attempted self approval" },
        `self-approve-${suffix}`,
        "hr-test-correlation",
      ),
    ).rejects.toMatchObject({ status: 403, code: "HR_SELF_APPROVAL_FORBIDDEN" } satisfies Partial<HrApiError>);
    await expect(
      repository.getEmployeeDraftApproval(context("r06.checker", "other-tenant", true), employee.id),
    ).rejects.toMatchObject({ status: 404, code: "HR_APPROVAL_NOT_FOUND" } satisfies Partial<HrApiError>);
  });

  it("creates one profile-draft assignment only after HR approval and safely replays retries", async () => {
    const suffix = randomUUID().replaceAll("-", "").slice(0, 16).toUpperCase();
    const employee = await repository.createEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      {
        company_id: "nexora-r06-uat-company",
        employee_number: `R06-${suffix}`,
        first_name: "Assignment",
        last_name: "Draft",
        joined_on: "2026-10-15",
      },
      `assignment-draft-${suffix}`,
      "hr-test-correlation",
    );
    await repository.submitEmployeeDraft(
      context("r06.maker", sourceTestTenantId, true),
      employee.id,
      { reason: "Ready for profile assignment" },
      `assignment-submit-${suffix}`,
      "hr-test-correlation",
    );
    await repository.decideEmployeeDraftApproval(
      context("r06.checker", sourceTestTenantId, true),
      employee.id,
      { decision: "approved", reason: "Employee profile is complete" },
      `assignment-approve-${suffix}`,
      "hr-test-correlation",
    );

    const input = {
      company_id: "nexora-r06-uat-company",
      branch_id: "nexora-r06-uat-branch",
      department_id: "nexora-r06-uat-department",
      designation_id: "r06-uat-designation",
      job_grade_id: "r06-uat-grade",
      cost_center_id: "r06-uat-cost-center",
      work_location_id: "r06-uat-location",
      employment_type_id: "r06-uat-employment-type",
      employee_category_id: "r06-uat-category",
      effective_from: "2026-10-15",
    };
    const first = await repository.createProfileDraftAssignment(
      context("r06.maker", sourceTestTenantId, true),
      employee.id,
      input,
      `assignment-create-${suffix}`,
      "hr-test-correlation",
    );
    const replay = await repository.createProfileDraftAssignment(
      context("r06.maker", sourceTestTenantId, true),
      employee.id,
      input,
      `assignment-create-${suffix}`,
      "hr-test-correlation",
    );

    expect(first).toMatchObject({
      employee_id: employee.id,
      company_id: input.company_id,
      assignment_status: "profile_draft",
      replayed: false,
    });
    expect(replay).toEqual({ ...first, replayed: true });

    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id', $1, true)", [sourceTestTenantId]);
      const assignment = await client.query(
        `select assignment_status, employment_relationship_id, source_reference
           from employee_assignment where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, first.id],
      );
      const audit = await client.query(
        "select action,entity_id from platform_admin_audit_event where tenant_id=$1 and id=$2",
        [sourceTestTenantId, first.audit_event_id],
      );
      await client.query("commit");
      expect(assignment.rows).toEqual([
        {
          assignment_status: "profile_draft",
          employment_relationship_id: null,
          source_reference: "hr:profile-draft-assignment",
        },
      ]);
      expect(audit.rows).toEqual([{ action: "hr.employee_assignment.create", entity_id: first.id }]);
    } finally {
      await client.query("rollback").catch(() => undefined);
      client.release();
    }
  });
});
