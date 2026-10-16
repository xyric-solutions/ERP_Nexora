import type {
  CreateHrEmployeeDraftRequest,
  HrEmployeeDetail,
  HrCompanyDirectory,
  HrOrganizationUnitDirectory,
  HrOrganizationUnitDirectoryQuery,
  HrEmployeeDirectory,
  HrEmployeeDirectoryQuery,
  HrEmployeeDraftDirectory,
  HrEmployeeDraftDetail,
  HrEmployeeDraftDirectoryQuery,
  HrEmployeeDraftResult,
  UpdateHrEmployeeDraftRequest,
  SubmitHrEmployeeDraftRequest,
  HrEmployeeDraftApprovalQueue,
  HrEmployeeDraftApprovalDetail,
  HrEmployeeDraftApprovalQueueQuery,
  DecideHrEmployeeDraftApprovalRequest,
  CreateHrProfileDraftAssignmentRequest,
  HrProfileDraftAssignmentResult,
  HrEmployeeContactDirectory,
  CreateHrEmployeeContactRequest,
  HrEmployeeContactResult,
  HrEmployeeEmergencyContactDirectory,
  CreateHrEmployeeEmergencyContactRequest,
  HrEmployeeEmergencyContactResult,
  HrEmployeeDocumentDirectory,
  HrEmployeeAssignmentDirectory,
  HrEmployeeStatusHistoryDirectory,
} from "@nexora/contracts";

import type { HrActorContext, SourceHrRepository } from "../source-repository.js";

/** Employee use-cases live here; controllers remain HTTP-only and repositories remain SQL-only. */
export class HrEmployeeService {
  constructor(
    private readonly repository: Pick<
      SourceHrRepository,
      | "listCompanies"
      | "listOrganizationUnits"
      | "listEmployees"
      | "getEmployee"
      | "listEmployeeDrafts"
      | "getEmployeeDraft"
      | "listEmployeeDraftApprovals"
      | "getEmployeeDraftApproval"
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
    >,
  ) {}

  listCompanies(context: HrActorContext): Promise<HrCompanyDirectory> {
    return this.repository.listCompanies(context);
  }

  listOrganizationUnits(
    context: HrActorContext,
    query: HrOrganizationUnitDirectoryQuery,
  ): Promise<HrOrganizationUnitDirectory> {
    return this.repository.listOrganizationUnits(context, query);
  }

  list(context: HrActorContext, query: HrEmployeeDirectoryQuery): Promise<HrEmployeeDirectory> {
    return this.repository.listEmployees(context, query);
  }

  get(context: HrActorContext, employeeId: string): Promise<HrEmployeeDetail> {
    return this.repository.getEmployee(context, employeeId);
  }

  listDrafts(context: HrActorContext, query: HrEmployeeDraftDirectoryQuery): Promise<HrEmployeeDraftDirectory> {
    return this.repository.listEmployeeDrafts(context, query);
  }

  getDraft(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftDetail> {
    return this.repository.getEmployeeDraft(context, employeeId);
  }

  createDraft(
    context: HrActorContext,
    input: CreateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.repository.createEmployeeDraft(context, input, idempotencyKey, correlationId);
  }

  updateDraft(
    context: HrActorContext,
    employeeId: string,
    input: UpdateHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.repository.updateEmployeeDraft(context, employeeId, input, idempotencyKey, correlationId);
  }

  submitDraft(
    context: HrActorContext,
    employeeId: string,
    input: SubmitHrEmployeeDraftRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.repository.submitEmployeeDraft(context, employeeId, input, idempotencyKey, correlationId);
  }

  listDraftApprovals(
    context: HrActorContext,
    query: HrEmployeeDraftApprovalQueueQuery,
  ): Promise<HrEmployeeDraftApprovalQueue> {
    return this.repository.listEmployeeDraftApprovals(context, query);
  }
  getDraftApproval(context: HrActorContext, employeeId: string): Promise<HrEmployeeDraftApprovalDetail> {
    return this.repository.getEmployeeDraftApproval(context, employeeId);
  }
  decideDraftApproval(
    context: HrActorContext,
    employeeId: string,
    input: DecideHrEmployeeDraftApprovalRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeDraftResult> {
    return this.repository.decideEmployeeDraftApproval(context, employeeId, input, idempotencyKey, correlationId);
  }
  createProfileDraftAssignment(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrProfileDraftAssignmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrProfileDraftAssignmentResult> {
    return this.repository.createProfileDraftAssignment(context, employeeId, input, idempotencyKey, correlationId);
  }

  listContacts(context: HrActorContext, employeeId: string): Promise<HrEmployeeContactDirectory> {
    return this.repository.listEmployeeContacts(context, employeeId);
  }

  createContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeContactResult> {
    return this.repository.createEmployeeContact(context, employeeId, input, idempotencyKey, correlationId);
  }

  listEmergencyContacts(context: HrActorContext, employeeId: string): Promise<HrEmployeeEmergencyContactDirectory> {
    return this.repository.listEmployeeEmergencyContacts(context, employeeId);
  }

  createEmergencyContact(
    context: HrActorContext,
    employeeId: string,
    input: CreateHrEmployeeEmergencyContactRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<HrEmployeeEmergencyContactResult> {
    return this.repository.createEmployeeEmergencyContact(context, employeeId, input, idempotencyKey, correlationId);
  }

  listDocuments(context: HrActorContext, employeeId: string): Promise<HrEmployeeDocumentDirectory> {
    return this.repository.listEmployeeDocuments(context, employeeId);
  }

  listAssignments(context: HrActorContext, employeeId: string): Promise<HrEmployeeAssignmentDirectory> {
    return this.repository.listEmployeeAssignments(context, employeeId);
  }

  listStatusHistory(context: HrActorContext, employeeId: string): Promise<HrEmployeeStatusHistoryDirectory> {
    return this.repository.listEmployeeStatusHistory(context, employeeId);
  }
}
