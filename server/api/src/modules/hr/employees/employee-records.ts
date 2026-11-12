import { createHash, randomUUID } from "node:crypto";
import { Readable } from "node:stream";

import type { Pool, PoolClient } from "pg";

import {
  hrEmployeeDirectStatuses,
  hrEmployeeDocumentFileTypes,
  hrEmployeeDocumentMaxBytes,
  type CreateHrEmployeeContactRequest,
  type CreateHrEmployeeEmergencyContactRequest,
  type HrEmployeeDocumentDirectory,
  type HrEmployeeEmploymentHistoryDirectory,
  type HrEmployeeNumberPreview,
  type HrEmployeeRecordMutationResult,
} from "@nexora/contracts";
import type { ObjectStorage } from "@nexora/domain/storage";
import type { z } from "zod";
import type {
  hrEmployeeEmploymentHistoryRequestSchema,
  removeHrEmployeeRecordRequestSchema,
  uploadHrEmployeeDocumentFieldsSchema,
  withdrawHrEmployeeDraftRequestSchema,
  changeHrEmployeeStatusRequestSchema,
} from "@nexora/contracts";

import { HrApiError, type HrActorContext } from "../source-repository.js";
import { auditedWrite } from "../shared/audited-write.js";

type UploadFields = z.output<typeof uploadHrEmployeeDocumentFieldsSchema>;
type HistoryInput = z.output<typeof hrEmployeeEmploymentHistoryRequestSchema>;
type RemoveInput = z.output<typeof removeHrEmployeeRecordRequestSchema>;
type WithdrawInput = z.output<typeof withdrawHrEmployeeDraftRequestSchema>;
type StatusInput = z.output<typeof changeHrEmployeeStatusRequestSchema>;

export type HrEmployeeRecordAuditAction =
  | "hr.employee.withdraw"
  | "hr.employee.status"
  | "hr.employee.remove"
  | "hr.employee_contact.update"
  | "hr.employee_contact.remove"
  | "hr.employee_emergency_contact.update"
  | "hr.employee_emergency_contact.remove"
  | "hr.employee_document.upload"
  | "hr.employee_document.replace"
  | "hr.employee_document.remove"
  | "hr.employee_history.create"
  | "hr.employee_history.update"
  | "hr.employee_history.remove";

export type HrEmployeeRecordsDependencies = {
  pool: Pool;
  storage?: Pick<ObjectStorage, "writeBounded" | "readBounded" | "remove">;
  audit: (
    client: PoolClient,
    context: HrActorContext,
    correlationId: string,
    action: HrEmployeeRecordAuditAction,
    entityType: "employee" | "employee_contact" | "employee_emergency_contact" | "employee_document" | "hr_employee_employment_history",
    entityId: string,
    before: unknown,
    after: unknown,
  ) => Promise<string>;
};

export type EmployeeDocumentFile = { fileName: string; body: Buffer };
export type EmployeeDocumentContent = { fileName: string; contentType: string; sizeBytes: number; body: Readable };

const dateOnly = (value: string | Date | null) =>
  value === null ? null : typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);

/**
 * Employee scope for satellite records. Active employees are reached through a
 * current assignment; drafts (and drafts awaiting approval, read-only) through
 * their draft company scope. Both require the actor's company access.
 */
export async function requireEmployeeRecordScope(
  client: PoolClient,
  context: HrActorContext,
  employeeId: string,
  mode: "read" | "write",
): Promise<{ status: string }> {
  const result = await client.query<{ status: string }>(
    `select employee.status from employee
      where employee.tenant_id=$1 and employee.id=$2 and (
        exists (
          select 1 from employee_assignment assignment
            join security_user_company_access access
              on access.tenant_id=assignment.tenant_id and access.company_id=assignment.company_id
           where assignment.tenant_id=employee.tenant_id and assignment.employee_id=employee.id
             and access.user_id=$3 and access.revoked_at is null
             and assignment.assignment_status in ('active','legacy_compatibility')
             and assignment.effective_from<=current_date
             and (assignment.effective_to is null or assignment.effective_to>=current_date))
        or (employee.status in ('draft','pending_approval') and exists (
          select 1 from hr_employee_draft_scope scope
            join security_user_company_access access
              on access.tenant_id=scope.tenant_id and access.company_id=scope.company_id
           where scope.tenant_id=employee.tenant_id and scope.employee_id=employee.id
             and access.user_id=$3 and access.revoked_at is null)))`,
    [context.tenantId, employeeId, context.actor.userId],
  );
  const row = result.rows[0];
  if (!row) throw new HrApiError(404, "HR_EMPLOYEE_NOT_FOUND", "The employee is unavailable in your company scope.");
  if (mode === "write" && row.status === "pending_approval")
    throw new HrApiError(
      409,
      "HR_EMPLOYEE_UNDER_APPROVAL",
      "This employee is awaiting approval. Records can change again once it is approved or returned.",
    );
  return row;
}

/** Validates the declared file type against its contents; returns the stored media type. */
export function employeeDocumentMediaType(fileName: string, body: Buffer): string {
  const extension = fileName.toLowerCase().split(".").pop() ?? "";
  const type = hrEmployeeDocumentFileTypes.find((item) => item.extension === extension);
  if (!type)
    throw new HrApiError(
      415,
      "HR_DOCUMENT_TYPE_UNSUPPORTED",
      "Upload a PDF, HTML, JPEG, PNG, JSON, CSV or text file.",
    );
  if (body.length === 0) throw new HrApiError(400, "HR_DOCUMENT_FILE_REQUIRED", "The uploaded file is empty.");
  if (body.length > hrEmployeeDocumentMaxBytes)
    throw new HrApiError(413, "HR_DOCUMENT_FILE_TOO_LARGE", "Employee documents can be at most 10 MB.");
  const starts = (...bytes: number[]) => bytes.every((byte, index) => body[index] === byte);
  const mismatch = () =>
    new HrApiError(415, "HR_DOCUMENT_CONTENT_MISMATCH", `The file content does not match a ${type.label} file.`);
  if (type.mediaType === "application/pdf" && !body.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw mismatch();
  if (type.mediaType === "image/jpeg" && !starts(0xff, 0xd8, 0xff)) throw mismatch();
  if (type.mediaType === "image/png" && !starts(0x89, 0x50, 0x4e, 0x47)) throw mismatch();
  if (type.mediaType.startsWith("text/") || type.mediaType === "application/json") {
    const text = new TextDecoder("utf-8", { fatal: false }).decode(body);
    if (text.includes("\u0000") || text.includes("�")) throw mismatch();
    if (type.mediaType === "application/json") {
      try {
        JSON.parse(text);
      } catch {
        throw mismatch();
      }
    }
  }
  return type.mediaType;
}

export class HrEmployeeRecords {
  constructor(private readonly dependencies: HrEmployeeRecordsDependencies) {}

  private async read<T>(context: HrActorContext, permission: string, operation: (client: PoolClient) => Promise<T>) {
    if (!context.actor.permissions.includes(permission))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to access this HR data.");
    const client = await this.dependencies.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      const output = await operation(client);
      await client.query("commit");
      return output;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  /** One audited, idempotent write: replays return the stored result. */
  private async write(
    context: HrActorContext,
    permission: string,
    path: string,
    input: unknown,
    idempotencyKey: string,
    lock: string,
    operation: (client: PoolClient) => Promise<HrEmployeeRecordMutationResult>,
  ): Promise<HrEmployeeRecordMutationResult> {
    return auditedWrite(
      this.dependencies.pool,
      context,
      {
        permission,
        path,
        input,
        idempotencyKey,
        lock,
        conflictCode: "HR_EMPLOYEE_RECORD_INVALID",
        conflictMessage: "The change conflicts with the employee's current records.",
      },
      operation,
    );
  }

  // ---------------------------------------------------------------- numbers & drafts

  /** Next automatic employee number; the final number is still reserved on create. */
  async employeeNumberPreview(context: HrActorContext, companyId: string): Promise<HrEmployeeNumberPreview> {
    return this.read(context, "hr.employee.create", async (client) => {
      const access = await client.query(
        "select 1 from security_user_company_access where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
        [context.tenantId, companyId, context.actor.userId],
      );
      if (!access.rowCount) throw new HrApiError(404, "HR_COMPANY_NOT_FOUND", "The company is unavailable in your scope.");
      const result = await client.query<{ next: string }>(
        `select greatest(
            coalesce((select max((substring(employee_number from '^EMP-([0-9]+)$'))::bigint) from employee where tenant_id=$1),0)+1,
            coalesce((select next_value from hr_record_code_counter where tenant_id=$1 and scope_id=$1 and record_kind='employee'),0)
          )::text as next`,
        [context.tenantId],
      );
      return { employee_number: `EMP-${result.rows[0]!.next.padStart(3, "0")}` };
    });
  }

  /** Withdraws an unsubmitted draft: it leaves the drafts list and keeps its audit trail. */
  async withdrawDraft(context: HrActorContext, employeeId: string, input: WithdrawInput, key: string, correlationId: string) {
    return this.write(
      context,
      "hr.employee.update",
      `/api/v1/hr/employee_drafts/${employeeId}/withdraw`,
      { employeeId, input },
      key,
      `nexora:hr:employee-draft:${context.tenantId}`,
      async (client) => {
        const draft = await client.query<{ employee_number: string }>(
          `select employee.employee_number from employee
             join hr_employee_draft_scope scope on scope.tenant_id=employee.tenant_id and scope.employee_id=employee.id
             join security_user_company_access access
               on access.tenant_id=scope.tenant_id and access.company_id=scope.company_id and access.user_id=$3 and access.revoked_at is null
            where employee.tenant_id=$1 and employee.id=$2 and employee.status='draft' for update of employee`,
          [context.tenantId, employeeId, context.actor.userId],
        );
        if (!draft.rows[0])
          throw new HrApiError(409, "HR_EMPLOYEE_DRAFT_NOT_WITHDRAWABLE", "Only unsubmitted drafts in your company scope can be deleted.");
        await client.query("update employee set status='inactive',updated_at=now() where tenant_id=$1 and id=$2", [
          context.tenantId,
          employeeId,
        ]);
        const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee.withdraw", "employee", employeeId, { status: "draft" }, { status: "inactive", reason: input.reason });
        return { id: employeeId, employee_id: employeeId, audit_event_id: audit, replayed: false };
      },
    );
  }

  // ---------------------------------------------------------------- approved employees

  private async directStatus(client: PoolClient, context: HrActorContext, employeeId: string) {
    const scope = await requireEmployeeRecordScope(client, context, employeeId, "write");
    const row = await client.query<{ status: string }>("select status from employee where tenant_id=$1 and id=$2 for update", [context.tenantId, employeeId]);
    const status = row.rows[0]?.status ?? scope.status;
    if (!(hrEmployeeDirectStatuses as readonly string[]).includes(status))
      throw new HrApiError(
        409,
        "HR_EMPLOYEE_STATUS_GOVERNED",
        status === "draft"
          ? "Draft employees become active through submission and approval."
          : "This employee's status is managed by the lifecycle workflow (for example an exit case).",
      );
    return status;
  }

  private async recordStatus(client: PoolClient, context: HrActorContext, employeeId: string, from: string, to: string, reason: string) {
    await client.query("update employee set status=$3,updated_at=now() where tenant_id=$1 and id=$2", [context.tenantId, employeeId, to]);
    await client.query(
      `insert into employee_status_history (id,tenant_id,employee_id,from_status,to_status,effective_on,reason,actor_id)
       values ($1,$2,$3,$4,$5,current_date,$6,$7)`,
      [`employee-status-${randomUUID()}`, context.tenantId, employeeId, from, to, reason, context.actor.userId],
    );
  }

  /** Active, probation, confirmed and suspended are direct, audited moves; exits stay governed. */
  async changeStatus(context: HrActorContext, employeeId: string, input: StatusInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/employees/${employeeId}/status`, { employeeId, input }, key, `nexora:hr:employee-status:${context.tenantId}:${employeeId}`, async (client) => {
      const from = await this.directStatus(client, context, employeeId);
      if (from === input.status) throw new HrApiError(409, "HR_EMPLOYEE_STATUS_UNCHANGED", "The employee already has this status.");
      await this.recordStatus(client, context, employeeId, from, input.status, input.reason || `Status changed to ${input.status}.`);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee.status", "employee", employeeId, { status: from }, { status: input.status, reason: input.reason });
      return { id: employeeId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  /** Soft delete: the employee becomes inactive and leaves the directory; refused once payroll has used them. */
  async removeEmployee(context: HrActorContext, employeeId: string, input: RemoveInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/employees/${employeeId}/remove`, { employeeId, input }, key, `nexora:hr:employee-status:${context.tenantId}:${employeeId}`, async (client) => {
      const from = await this.directStatus(client, context, employeeId);
      const payroll = await client.query<{ used: boolean }>(
        `select exists(select 1 from hr_payroll_result where tenant_id=$1 and employee_id=$2)
             or exists(select 1 from hr_payroll_input where tenant_id=$1 and employee_id=$2)
             or exists(select 1 from hr_payroll_payment where tenant_id=$1 and employee_id=$2)
             or exists(select 1 from hr_payroll_adjustment where tenant_id=$1 and employee_id=$2) as used`,
        [context.tenantId, employeeId],
      );
      if (payroll.rows[0]?.used)
        throw new HrApiError(409, "HR_EMPLOYEE_HAS_PAYROLL", "This employee has payroll history and cannot be deleted. Use an exit case instead.");
      await this.recordStatus(client, context, employeeId, from, "inactive", input.reason || "Removed from the employee directory.");
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee.remove", "employee", employeeId, { status: from }, { status: "inactive", reason: input.reason });
      return { id: employeeId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  // ---------------------------------------------------------------- contacts

  /** Edits a contact: the current version is closed and its replacement starts today. */
  async updateContact(context: HrActorContext, employeeId: string, contactId: string, input: CreateHrEmployeeContactRequest, key: string, correlationId: string) {
    return this.write(context, "hr.employee_contact.manage", `/api/v1/hr/employees/${employeeId}/contacts/${contactId}`, { employeeId, contactId, input }, key, `nexora:hr:employee-contact:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const before = await this.closeContactRow(client, context, employeeId, contactId);
      if (input.is_primary) {
        const primary = await client.query(
          `select 1 from employee_contact where tenant_id=$1 and employee_id=$2 and channel=$3 and contact_usage=$4
             and is_primary and status='active' and effective_to is null`,
          [context.tenantId, employeeId, input.channel, input.contact_usage],
        );
        if (primary.rowCount) throw new HrApiError(409, "HR_CONTACT_PRIMARY_EXISTS", "Another primary contact of this kind is already active.");
      }
      const id = `employee-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_contact
          (id,tenant_id,employee_id,channel,contact_usage,contact_value,label,is_primary,status,effective_from,created_by,source_reference)
         values ($1,$2,$3,$4,$5,$6,$7,$8,'active',current_date,$9,$10)`,
        [id, context.tenantId, employeeId, input.channel, input.contact_usage, input.contact_value, input.label ?? "", input.is_primary, context.actor.userId, `hr:employee-contact-update:${contactId}`],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_contact.update", "employee_contact", id, before, { channel: input.channel, contact_usage: input.contact_usage, is_primary: input.is_primary, replaces: contactId });
      return { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  async removeContact(context: HrActorContext, employeeId: string, contactId: string, input: RemoveInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee_contact.manage", `/api/v1/hr/employees/${employeeId}/contacts/${contactId}/remove`, { employeeId, contactId, input }, key, `nexora:hr:employee-contact:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const before = await this.closeContactRow(client, context, employeeId, contactId);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_contact.remove", "employee_contact", contactId, before, { status: "inactive", reason: input.reason });
      return { id: contactId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  private async closeContactRow(client: PoolClient, context: HrActorContext, employeeId: string, contactId: string) {
    const row = await client.query<{ channel: string; contact_usage: string; is_primary: boolean; effective_from: string | Date }>(
      `select channel,contact_usage,is_primary,effective_from from employee_contact
        where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' and effective_to is null for update`,
      [context.tenantId, employeeId, contactId],
    );
    const current = row.rows[0];
    if (!current) throw new HrApiError(404, "HR_CONTACT_NOT_FOUND", "The contact is no longer active.");
    // History closes on the day before today unless the contact also started today.
    await client.query(
      `update employee_contact set status='inactive',effective_to=greatest(effective_from,current_date-1),updated_at=now()
        where tenant_id=$1 and id=$2`,
      [context.tenantId, contactId],
    );
    return { ...current, effective_from: dateOnly(current.effective_from) };
  }

  async updateEmergencyContact(context: HrActorContext, employeeId: string, contactId: string, input: CreateHrEmployeeEmergencyContactRequest, key: string, correlationId: string) {
    return this.write(context, "hr.employee_emergency_contact.manage", `/api/v1/hr/employees/${employeeId}/emergency_contacts/${contactId}`, { employeeId, contactId, input }, key, `nexora:hr:employee-emergency-contact:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const before = await this.closeEmergencyRow(client, context, employeeId, contactId);
      const conflict = await client.query(
        `select 1 from employee_emergency_contact where tenant_id=$1 and employee_id=$2 and status='active' and effective_to is null
            and (priority=$3 or ($4 and is_primary))`,
        [context.tenantId, employeeId, input.priority, input.is_primary],
      );
      if (conflict.rowCount) throw new HrApiError(409, "HR_EMERGENCY_CONTACT_CONFLICT", "The active emergency-contact priority or primary designation already exists.");
      const id = `employee-emergency-contact-${randomUUID()}`;
      await client.query(
        `insert into employee_emergency_contact
          (id,tenant_id,employee_id,name,relationship,phone,email,priority,is_primary,status,effective_from,created_by,source_reference,supersedes_contact_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',current_date,$10,'hr:employee-emergency-contact-update',$11)`,
        [id, context.tenantId, employeeId, input.name, input.relationship, input.phone, input.email ?? "", input.priority, input.is_primary, context.actor.userId, contactId],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_emergency_contact.update", "employee_emergency_contact", id, before, { priority: input.priority, is_primary: input.is_primary, replaces: contactId });
      return { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  async removeEmergencyContact(context: HrActorContext, employeeId: string, contactId: string, input: RemoveInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee_emergency_contact.manage", `/api/v1/hr/employees/${employeeId}/emergency_contacts/${contactId}/remove`, { employeeId, contactId, input }, key, `nexora:hr:employee-emergency-contact:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const before = await this.closeEmergencyRow(client, context, employeeId, contactId);
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_emergency_contact.remove", "employee_emergency_contact", contactId, before, { status: "inactive", reason: input.reason });
      return { id: contactId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  private async closeEmergencyRow(client: PoolClient, context: HrActorContext, employeeId: string, contactId: string) {
    const row = await client.query<{ priority: number; is_primary: boolean }>(
      `select priority,is_primary from employee_emergency_contact
        where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' and effective_to is null for update`,
      [context.tenantId, employeeId, contactId],
    );
    if (!row.rows[0]) throw new HrApiError(404, "HR_EMERGENCY_CONTACT_NOT_FOUND", "The emergency contact is no longer active.");
    await client.query(
      `update employee_emergency_contact set status='inactive',effective_to=greatest(effective_from,current_date-1),updated_at=now()
        where tenant_id=$1 and id=$2`,
      [context.tenantId, contactId],
    );
    return row.rows[0];
  }

  // ---------------------------------------------------------------- documents

  async listDocuments(context: HrActorContext, employeeId: string): Promise<HrEmployeeDocumentDirectory> {
    return this.read(context, "hr.employee_document.read", async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "read");
      const result = await client.query<HrEmployeeDocumentDirectory["items"][number] & { issued_on: string | Date | null; expires_on: string | Date | null; created_at: Date; size_bytes: string | number | null }>(
        `select id,employee_id,document_type,title,reference,issued_on,expires_on,restricted,issuing_authority,
                verification_status,status,created_at,notes,(storage_key is not null and file_name is not null) as has_file,
                file_name,content_type,size_bytes,supersedes_document_id
           from employee_document
          where tenant_id=$1 and employee_id=$2
          order by status='active' desc,created_at desc,id
          limit 200`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          issued_on: dateOnly(row.issued_on),
          expires_on: dateOnly(row.expires_on),
          created_at: new Date(row.created_at).toISOString(),
          size_bytes: row.size_bytes === null ? null : Number(row.size_bytes),
        })),
      };
    });
  }

  /** Stores the file privately, then records it; a replacement supersedes and removes the earlier document. */
  async uploadDocument(
    context: HrActorContext,
    employeeId: string,
    fields: UploadFields,
    file: EmployeeDocumentFile,
    key: string,
    correlationId: string,
    replaces?: string,
  ): Promise<HrEmployeeRecordMutationResult> {
    const storage = this.dependencies.storage;
    if (!storage) throw new HrApiError(503, "HR_DOCUMENT_STORAGE_UNAVAILABLE", "Document storage is not configured.");
    if (!context.actor.permissions.includes("hr.employee_document.manage"))
      throw new HrApiError(403, "PERMISSION_DENIED", "You are not permitted to manage employee documents.");
    const contentType = employeeDocumentMediaType(file.fileName, file.body);
    const checksum = createHash("sha256").update(file.body).digest("hex");
    // Path separators and control characters never reach the stored file name.
    const fileName = [...file.fileName]
      .map((character) => {
        const code = character.charCodeAt(0);
        return character === "/" || character === "\\" || code < 32 || code === 127 ? "_" : character;
      })
      .join("")
      .slice(-255);
    const id = `employee-document-${randomUUID()}`;
    const objectKey = `hr/employee-documents/${context.tenantId}/${employeeId}/${id}`;
    await storage.writeBounded(
      { objectKey, contentType, sizeBytes: file.body.length, maxBytes: hrEmployeeDocumentMaxBytes, checksumSha256: checksum, timeoutMs: 30_000 },
      Readable.from(file.body),
    );
    try {
      const path = replaces ? `/api/v1/hr/employees/${employeeId}/documents/${replaces}/replace` : `/api/v1/hr/employees/${employeeId}/documents`;
      const result = await this.write(context, "hr.employee_document.manage", path, { employeeId, fields, checksum, fileName, replaces }, key, `nexora:hr:employee-document:${context.tenantId}:${employeeId}`, async (client) => {
        await requireEmployeeRecordScope(client, context, employeeId, "write");
        let before: unknown = null;
        if (replaces) {
          const current = await client.query<{ title: string; file_name: string | null }>(
            `select title,file_name from employee_document where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' for update`,
            [context.tenantId, employeeId, replaces],
          );
          if (!current.rows[0]) throw new HrApiError(404, "HR_DOCUMENT_NOT_FOUND", "The document to replace is no longer active.");
          before = current.rows[0];
          await client.query(
            `update employee_document set status='inactive',removed_at=now(),removed_by=$3,updated_at=now() where tenant_id=$1 and id=$2`,
            [context.tenantId, replaces, context.actor.userId],
          );
        }
        await client.query(
          `insert into employee_document
            (id,tenant_id,employee_id,document_type,title,reference,storage_key,issued_on,expires_on,restricted,created_by,
             notes,status,supersedes_document_id,source_reference,file_name,content_type,size_bytes,checksum_sha256)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10,$11,'active',$12,$13,$14,$15,$16,$17)`,
          [id, context.tenantId, employeeId, fields.document_type, fields.title, fields.reference, objectKey, fields.issued_on ?? null, fields.expires_on ?? null, context.actor.userId, fields.notes, replaces ?? null, replaces ? "hr:employee-document-replace" : "hr:employee-document-upload", fileName, contentType, file.body.length, checksum],
        );
        const audit = await this.dependencies.audit(client, context, correlationId, replaces ? "hr.employee_document.replace" : "hr.employee_document.upload", "employee_document", id, before, { document_type: fields.document_type, file_name: fileName, content_type: contentType, size_bytes: file.body.length, checksum_sha256: checksum, replaces: replaces ?? null });
        return { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
      });
      // A replay keeps the earlier stored file; drop the duplicate object written for this request.
      if (result.replayed) await storage.remove(objectKey).catch(() => undefined);
      return result;
    } catch (error) {
      // Nothing was committed, so the stored object is an orphan.
      await storage.remove(objectKey).catch(() => undefined);
      throw error;
    }
  }

  async documentContent(context: HrActorContext, employeeId: string, documentId: string): Promise<EmployeeDocumentContent> {
    const storage = this.dependencies.storage;
    if (!storage) throw new HrApiError(503, "HR_DOCUMENT_STORAGE_UNAVAILABLE", "Document storage is not configured.");
    const row = await this.read(context, "hr.employee_document.read", async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "read");
      const result = await client.query<{ storage_key: string | null; file_name: string | null; content_type: string | null; size_bytes: string | null; checksum_sha256: string | null }>(
        `select storage_key,file_name,content_type,size_bytes,checksum_sha256 from employee_document
          where tenant_id=$1 and employee_id=$2 and id=$3`,
        [context.tenantId, employeeId, documentId],
      );
      return result.rows[0];
    });
    if (!row?.storage_key || !row.file_name || !row.content_type)
      throw new HrApiError(404, "HR_DOCUMENT_FILE_NOT_FOUND", "This document has no uploaded file.");
    const object = await storage.readBounded({
      objectKey: row.storage_key,
      maxBytes: hrEmployeeDocumentMaxBytes,
      ...(row.checksum_sha256 ? { checksumSha256: row.checksum_sha256 } : {}),
      timeoutMs: 30_000,
    });
    return { fileName: row.file_name, contentType: row.content_type, sizeBytes: Number(row.size_bytes ?? object.metadata.sizeBytes), body: object.body };
  }

  /** Removes a document from the active record; the file and metadata stay for audit. */
  async removeDocument(context: HrActorContext, employeeId: string, documentId: string, input: RemoveInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee_document.manage", `/api/v1/hr/employees/${employeeId}/documents/${documentId}/remove`, { employeeId, documentId, input }, key, `nexora:hr:employee-document:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const current = await client.query<{ title: string }>(
        `select title from employee_document where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' for update`,
        [context.tenantId, employeeId, documentId],
      );
      if (!current.rows[0]) throw new HrApiError(404, "HR_DOCUMENT_NOT_FOUND", "The document is no longer active.");
      await client.query(
        `update employee_document set status='inactive',removed_at=now(),removed_by=$3,updated_at=now() where tenant_id=$1 and id=$2`,
        [context.tenantId, documentId, context.actor.userId],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_document.remove", "employee_document", documentId, current.rows[0], { status: "inactive", reason: input.reason });
      return { id: documentId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  // ---------------------------------------------------------------- employment history

  async listHistory(context: HrActorContext, employeeId: string): Promise<HrEmployeeEmploymentHistoryDirectory> {
    return this.read(context, "hr.employee.read", async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "read");
      const result = await client.query<{
        id: string; employee_id: string; company_name: string; job_title: string; start_on: string | Date; end_on: string | Date | null;
        skills: string[]; last_salary: string | null; salary_currency: string | null; responsibilities: string; reason_for_leaving: string;
        created_at: Date; updated_at: Date;
      }>(
        `select id,employee_id,company_name,job_title,start_on,end_on,skills,last_salary::text as last_salary,salary_currency,
                responsibilities,reason_for_leaving,created_at,updated_at
           from hr_employee_employment_history
          where tenant_id=$1 and employee_id=$2 and status='active'
          order by start_on desc,id limit 100`,
        [context.tenantId, employeeId],
      );
      return {
        items: result.rows.map((row) => ({
          ...row,
          start_on: dateOnly(row.start_on)!,
          end_on: dateOnly(row.end_on),
          last_salary: row.last_salary === null ? null : row.last_salary.replace(/\.?0+$/, "") || "0",
          created_at: row.created_at.toISOString(),
          updated_at: row.updated_at.toISOString(),
        })),
      };
    });
  }

  async saveHistory(context: HrActorContext, employeeId: string, historyId: string | undefined, input: HistoryInput, key: string, correlationId: string) {
    const path = historyId ? `/api/v1/hr/employees/${employeeId}/employment_history/${historyId}` : `/api/v1/hr/employees/${employeeId}/employment_history`;
    return this.write(context, "hr.employee.update", path, { employeeId, historyId, input }, key, `nexora:hr:employee-history:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const values = [input.company_name, input.job_title, input.start_on, input.end_on ?? null, JSON.stringify(input.skills), input.last_salary ?? null, input.salary_currency ?? null, input.responsibilities, input.reason_for_leaving];
      if (historyId) {
        const before = await client.query(
          `select company_name,job_title,start_on::text,end_on::text from hr_employee_employment_history
            where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' for update`,
          [context.tenantId, employeeId, historyId],
        );
        if (!before.rows[0]) throw new HrApiError(404, "HR_EMPLOYMENT_HISTORY_NOT_FOUND", "The employment history entry is no longer available.");
        await client.query(
          `update hr_employee_employment_history set company_name=$4,job_title=$5,start_on=$6,end_on=$7,skills=$8::jsonb,last_salary=$9,
                  salary_currency=$10,responsibilities=$11,reason_for_leaving=$12,updated_by=$13,updated_at=now()
            where tenant_id=$1 and employee_id=$2 and id=$3`,
          [context.tenantId, employeeId, historyId, ...values, context.actor.userId],
        );
        const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_history.update", "hr_employee_employment_history", historyId, before.rows[0], { company_name: input.company_name, job_title: input.job_title, start_on: input.start_on, end_on: input.end_on ?? null });
        return { id: historyId, employee_id: employeeId, audit_event_id: audit, replayed: false };
      }
      const id = `employee-history-${randomUUID()}`;
      await client.query(
        `insert into hr_employee_employment_history
          (tenant_id,id,employee_id,company_name,job_title,start_on,end_on,skills,last_salary,salary_currency,responsibilities,reason_for_leaving,created_by,updated_by)
         values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12,$13,$13)`,
        [context.tenantId, id, employeeId, ...values, context.actor.userId],
      );
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_history.create", "hr_employee_employment_history", id, null, { company_name: input.company_name, job_title: input.job_title, start_on: input.start_on, end_on: input.end_on ?? null });
      return { id, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }

  async removeHistory(context: HrActorContext, employeeId: string, historyId: string, input: RemoveInput, key: string, correlationId: string) {
    return this.write(context, "hr.employee.update", `/api/v1/hr/employees/${employeeId}/employment_history/${historyId}/remove`, { employeeId, historyId, input }, key, `nexora:hr:employee-history:${context.tenantId}:${employeeId}`, async (client) => {
      await requireEmployeeRecordScope(client, context, employeeId, "write");
      const before = await client.query(
        `update hr_employee_employment_history set status='inactive',updated_by=$4,updated_at=now()
          where tenant_id=$1 and employee_id=$2 and id=$3 and status='active' returning company_name,job_title`,
        [context.tenantId, employeeId, historyId, context.actor.userId],
      );
      if (!before.rows[0]) throw new HrApiError(404, "HR_EMPLOYMENT_HISTORY_NOT_FOUND", "The employment history entry is no longer available.");
      const audit = await this.dependencies.audit(client, context, correlationId, "hr.employee_history.remove", "hr_employee_employment_history", historyId, before.rows[0], { status: "inactive", reason: input.reason });
      return { id: historyId, employee_id: employeeId, audit_event_id: audit, replayed: false };
    });
  }
}
