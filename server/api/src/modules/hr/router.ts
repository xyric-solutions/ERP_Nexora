import { Router, type Request } from "express";
import { z } from "zod";

import {
  createHrEmployeeDraftRequestSchema,
  updateHrEmployeeDraftRequestSchema,
  submitHrEmployeeDraftRequestSchema,
  hrEmployeeDraftApprovalQueueQuerySchema,
  decideHrEmployeeDraftApprovalRequestSchema,
  createHrProfileDraftAssignmentRequestSchema,
  createHrEmployeeContactRequestSchema,
  createHrEmployeeEmergencyContactRequestSchema,
  hrEmployeeDirectoryQuerySchema,
  hrEmployeeDraftDirectoryQuerySchema,
  hrMasterDirectoryQuerySchema,
  hrEmploymentLifecyclePolicyDirectoryQuerySchema,
  createHrEmploymentLifecyclePolicyRequestSchema,
  submitHrEmploymentLifecyclePolicyRequestSchema,
  approveHrEmploymentLifecyclePolicyRequestSchema,
  activateHrEmploymentLifecyclePolicyRequestSchema,
  createHrJobRequestSchema,
  createHrEmployeeHireRequestSchema,
  decideHrEmployeeHireRequestSchema,
  hrEmployeeHireRequestDirectoryQuerySchema,
  hrOrganizationUnitDirectoryQuerySchema,
  createHrEmployeeTransferRequestSchema,
  decideHrEmployeeTransferRequestSchema,
  hrEmployeeTransferRequestDirectoryQuerySchema,
} from "@nexora/contracts";

import { HttpError } from "../../http/errors.js";
import { currentRequestContext } from "../../http/request-context.js";
import type { TenantAuthApiService, TenantSessionApiService } from "../auth/tenant-router.js";
import { HrEmployeeService } from "./employees/service.js";
import { HrMasterService } from "./masters/service.js";
import { HrLifecycleService } from "./lifecycle/service.js";
import { HrMovementService } from "./movements/service.js";
import { HrApiError, type SourceHrRepository } from "./source-repository.js";
import { loadHrSessionContext } from "./shared/session-context.js";

export interface HrRouterDependencies {
  repository: Pick<
    SourceHrRepository,
    | "listCompanies"
    | "listOrganizationUnits"
    | "listEmployees"
    | "getEmployee"
    | "listEmployeeDrafts"
    | "getEmployeeDraft"
    | "listEmployeeDraftApprovals"
    | "getEmployeeDraftApproval"
    | "listMasters"
    | "createEmployeeDraft"
    | "updateEmployeeDraft"
    | "submitEmployeeDraft"
    | "decideEmployeeDraftApproval"
    | "createProfileDraftAssignment"
    | "listEmployeeContacts"
    | "createEmployeeContact"
    | "listEmployeeEmergencyContacts"
    | "createEmployeeEmergencyContact"
    | "listEmployeeDocuments"
    | "listEmployeeAssignments"
    | "listEmployeeStatusHistory"
    | "listEmploymentLifecyclePolicies"
    | "createEmploymentLifecyclePolicy"
    | "submitEmploymentLifecyclePolicy"
    | "approveEmploymentLifecyclePolicy"
    | "activateEmploymentLifecyclePolicy"
    | "createJob"
    | "listEmployeeHireRequests"
    | "getEmployeeHireRequest"
    | "createEmployeeHireRequest"
    | "decideEmployeeHireRequest"
    | "listEmployeeTransferRequests"
    | "getEmployeeTransferRequest"
    | "createEmployeeTransferRequest"
    | "decideEmployeeTransferRequest"
  >;
  authentication: TenantAuthApiService;
  sessions: TenantSessionApiService;
  secureCookies: boolean;
  allowedOrigins: ReadonlySet<string>;
}

function trustedOrigin(req: Request, allowed: ReadonlySet<string>): void {
  const origin = req.get("origin");
  if (origin && !allowed.has(origin))
    throw new HttpError(403, "ORIGIN_VALIDATION_FAILED", "Request origin validation failed.");
}

function idempotencyKey(req: Request): string {
  const key = req.get("idempotency-key");
  if (!key) throw new HttpError(400, "IDEMPOTENCY_KEY_REQUIRED", "An idempotency key is required.");
  return key;
}

function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

export function createHrRouter(dependencies: HrRouterDependencies): Router {
  const router = Router();
  const employees = new HrEmployeeService(dependencies.repository);
  const masters = new HrMasterService(dependencies.repository);
  const lifecycle = new HrLifecycleService(dependencies.repository);
  const movements = new HrMovementService(dependencies.repository);
  router.use((_req, res, next) => {
    res.setHeader("cache-control", "no-store");
    next();
  });

  async function handle<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof HrApiError) throw new HttpError(error.status, error.code, error.message);
      throw error;
    }
  }

  router.get("/companies", async (req, res) => {
    res.json(await handle(async () => employees.listCompanies(await loadHrSessionContext(req, dependencies))));
  });
  router.get("/organization_units", async (req, res) => {
    const query = hrOrganizationUnitDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      type: req.query.type,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => employees.listOrganizationUnits(await loadHrSessionContext(req, dependencies), query)),
    );
  });

  router.get("/employees", async (req, res) => {
    const query = hrEmployeeDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      status: req.query.status,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => employees.list(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employees", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrEmployeeDraftRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createDraft(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employee_drafts", async (req, res) => {
    const query = hrEmployeeDraftDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => employees.listDrafts(await loadHrSessionContext(req, dependencies), query)));
  });
  router.get("/employee_drafts/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(await handle(async () => employees.getDraft(await loadHrSessionContext(req, dependencies), employeeId)));
  });
  router.post("/employee_drafts/:employeeId", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = updateHrEmployeeDraftRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.updateDraft(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 200).json(result);
  });
  router.post("/employee_drafts/:employeeId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = submitHrEmployeeDraftRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        employees.submitDraft(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/employee_draft_approvals", async (req, res) => {
    const query = hrEmployeeDraftApprovalQueueQuerySchema.parse({
      company_id: req.query.company_id,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => employees.listDraftApprovals(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.get("/employee_draft_approvals/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.getDraftApproval(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.post("/employee_drafts/:employeeId/approval_decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = decideHrEmployeeDraftApprovalRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        employees.decideDraftApproval(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employees/:employeeId/profile_draft_assignment", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrProfileDraftAssignmentRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createProfileDraftAssignment(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/hire_requests", async (req, res) => {
    const query = hrEmployeeHireRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => lifecycle.listHireRequests(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.post("/employees/:employeeId/hire_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeHireRequestSchema.parse(req.body);
    const result = await handle(async () =>
      lifecycle.requestHire(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/hire_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        lifecycle.getHireRequest(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/hire_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeHireRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.decideHire(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/transfer_requests", async (req, res) => {
    const query = hrEmployeeTransferRequestDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      search: req.query.search,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(
      await handle(async () => movements.listTransfers(await loadHrSessionContext(req, dependencies), query)),
    );
  });
  router.post("/employees/:employeeId/transfer_requests", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeTransferRequestSchema.parse(req.body);
    const result = await handle(async () =>
      movements.requestTransfer(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/transfer_requests/:requestId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    res.json(
      await handle(async () =>
        movements.getTransfer(await loadHrSessionContext(req, dependencies), employeeId, requestId),
      ),
    );
  });
  router.post("/employees/:employeeId/transfer_requests/:requestId/decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const requestId = z.string().trim().min(1).max(128).parse(req.params.requestId);
    const input = decideHrEmployeeTransferRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        movements.decideTransfer(
          await loadHrSessionContext(req, dependencies, true),
          employeeId,
          requestId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.get("/employees/:employeeId/contacts", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listContacts(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.post("/employees/:employeeId/contacts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeContactRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createContact(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/emergency_contacts", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () =>
        employees.listEmergencyContacts(await loadHrSessionContext(req, dependencies), employeeId),
      ),
    );
  });
  router.post("/employees/:employeeId/emergency_contacts", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    const input = createHrEmployeeEmergencyContactRequestSchema.parse(req.body);
    const result = await handle(async () =>
      employees.createEmergencyContact(
        await loadHrSessionContext(req, dependencies, true),
        employeeId,
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employees/:employeeId/documents", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listDocuments(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId/assignments", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listAssignments(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId/status_history", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(
      await handle(async () => employees.listStatusHistory(await loadHrSessionContext(req, dependencies), employeeId)),
    );
  });
  router.get("/employees/:employeeId", async (req, res) => {
    const employeeId = z.string().trim().min(1).max(128).parse(req.params.employeeId);
    res.json(await handle(async () => employees.get(await loadHrSessionContext(req, dependencies), employeeId)));
  });
  router.get("/masters", async (req, res) => {
    const query = hrMasterDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      type: req.query.type,
      active_only: parseBoolean(req.query.active_only) ?? true,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => masters.list(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/jobs", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrJobRequestSchema.parse(req.body);
    const result = await handle(async () =>
      dependencies.repository.createJob(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.get("/employment_lifecycle_policies", async (req, res) => {
    const query = hrEmploymentLifecyclePolicyDirectoryQuerySchema.parse({
      company_id: req.query.company_id,
      limit: req.query.limit === undefined ? undefined : Number(req.query.limit),
    });
    res.json(await handle(async () => lifecycle.listPolicies(await loadHrSessionContext(req, dependencies), query)));
  });
  router.post("/employment_lifecycle_policies", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const input = createHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    const result = await handle(async () =>
      lifecycle.createPolicy(
        await loadHrSessionContext(req, dependencies, true),
        input,
        idempotencyKey(req),
        currentRequestContext().correlationId,
      ),
    );
    res.status(result.replayed ? 200 : 201).json(result);
  });
  router.post("/employment_lifecycle_policies/:policyId/submit", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = submitHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.submitPolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employment_lifecycle_policies/:policyId/approval_decision", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = approveHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.approvePolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  router.post("/employment_lifecycle_policies/:policyId/activate", async (req, res) => {
    trustedOrigin(req, dependencies.allowedOrigins);
    const policyId = z.string().trim().min(1).max(128).parse(req.params.policyId);
    const input = activateHrEmploymentLifecyclePolicyRequestSchema.parse(req.body);
    res.json(
      await handle(async () =>
        lifecycle.activatePolicy(
          await loadHrSessionContext(req, dependencies, true),
          policyId,
          input,
          idempotencyKey(req),
          currentRequestContext().correlationId,
        ),
      ),
    );
  });
  return router;
}
