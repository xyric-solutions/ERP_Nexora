import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  hrLearningWorkspaceSchema,
  hrLearningCertificateSchema,
  hrLearningTermsSchema,
  type HrLearningTerms,
  type HrLearningRecord,
  type HrLearningQuery,
  type HrLearningAction,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import {
  withHrGovernedClient,
  runHrGovernedCommand,
  requireHrGovernedCompany,
  type HrGovernedDependencies,
} from "./governed.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { requireSelfServiceEmployee, canManageSelfService } from "./employee-self-service-authority.js";
import { attendanceHash } from "./attendance-completion.js";
type Row = {
  tenant_id: string;
  id: string;
  company_id: string;
  kind: HrLearningTerms["kind"];
  programme_id: string | null;
  parent_id: string | null;
  employee_id: string | null;
  version: number;
  state: string;
  terms: HrLearningTerms;
  created_by: string;
  updated_by: string;
  manager_user_id: string | null;
  manager_decided_by: string | null;
  created_at: string;
  updated_at: string;
};
const conflict: (message: string) => never = (message) => {
  throw new HrApiError(409, "HR_LEARNING_REVIEW_REQUIRED", message);
};
const denied: (message?: string) => never = (message = "Current company-scoped Learning authority is required.") => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
const kinds = { programmes: "programme", requests: "request", sessions: "session", completions: "completion" };
const writable = (c: HrActorContext) =>
  !c.impersonationRequestId && (!c.realActorId || c.realActorId === c.actor.userId);
export class LearningDevelopment {
  constructor(private readonly d: HrGovernedDependencies) {}
  private async permission(client: PoolClient, c: HrActorContext, company: string, key: string) {
    await requireHrCompanyPermission(client, c, company, "hr.learning." + key);
  }
  private async performanceRead(client: PoolClient, c: HrActorContext, company: string) {
    try {
      await requireHrCompanyPermission(client, c, company, "hr.performance.read");
      return true;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  }
  private async can(client: PoolClient, c: HrActorContext, company: string, key: string) {
    try {
      await this.permission(client, c, company, key);
      return true;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  }
  private async row(client: PoolClient, c: HrActorContext, company: string, id: string, kind?: string, lock = false) {
    const r = (
      await client.query<Row>(
        `select r.*,r.created_at::text,r.updated_at::text from hr_learning_record r where tenant_id=$1 and company_id=$2 and id=$3${lock ? " for update" : ""}`,
        [c.tenantId, company, id],
      )
    ).rows[0];
    if (!r || (kind && r.kind !== kind))
      throw new HrApiError(404, "HR_LEARNING_NOT_FOUND", "The learning record is unavailable in this company.");
    return r;
  }
  private async owned(client: PoolClient, c: HrActorContext, company: string, employee: string | null, write = false) {
    try {
      return !!employee && (await requireSelfServiceEmployee(client, c, company, write, employee)) === employee;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  }
  private async independent(client: PoolClient, c: HrActorContext, r: Row) {
    return (
      r.created_by !== c.actor.userId &&
      !(
        await client.query(
          "select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3 and ended_at is null and effective_from<=current_date and(effective_to is null or effective_to>=current_date)",
          [c.tenantId, r.employee_id, c.actor.userId],
        )
      ).rowCount
    );
  }
  private async programme(client: PoolClient, c: HrActorContext, company: string, id: string) {
    const p = await this.row(client, c, company, id, "programme");
    if (p.state !== "active" || p.terms.kind !== "programme") conflict("An active published programme is required.");
    return p;
  }
  private async employee(client: PoolClient, c: HrActorContext, company: string, id: string, on?: string) {
    const rows = await client.query(
      "select e.id from employee e where e.tenant_id=$1 and e.id=$2 and exists(select 1 from hr_employment_relationship r where r.tenant_id=e.tenant_id and r.employee_id=e.id and r.legal_employer_id=$3 and r.approval_state='approved' and(r.status='active' or $4::date<current_date and r.status in('ended','suspended')) and r.effective_from<=coalesce($4::date,current_date) and(r.effective_to is null or r.effective_to>=coalesce($4::date,current_date)))",
      [c.tenantId, id, company, on ?? null],
    );
    if (!rows.rowCount) conflict("The employee needs effective approved employment in this company.");
  }
  private async route(client: PoolClient, c: HrActorContext, company: string, employee: string) {
    const rows = (
      await client.query<{ user_id: string }>(
        `select distinct b.user_id from employee_assignment a join employee_user_binding b on b.tenant_id=a.tenant_id and b.employee_id=a.reporting_manager_id join security_user_account u on u.tenant_id=b.tenant_id and u.id=b.user_id and u.status='active' and u.archived_at is null join security_user_company_access x on x.tenant_id=b.tenant_id and x.user_id=b.user_id and x.company_id=a.company_id and x.revoked_at is null where a.tenant_id=$1 and a.company_id=$2 and a.employee_id=$3 and a.assignment_status='active' and a.effective_from<=current_date and(a.effective_to is null or a.effective_to>=current_date) and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date) limit 2`,
        [c.tenantId, company, employee],
      )
    ).rows;
    if (rows.length !== 1)
      conflict(
        "Exactly one active reporting-manager account with company access is required. Resolve the employee assignment first.",
      );
    return rows[0]!.user_id;
  }
  private async prerequisites(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    employee: string,
    p: Row,
    on: string,
  ) {
    if (p.terms.kind !== "programme") conflict("Review the programme source.");
    for (const id of p.terms.prerequisite_ids) {
      const ok = await client.query(
        "select 1 from hr_learning_record where tenant_id=$1 and company_id=$2 and employee_id=$3 and programme_id=$4 and kind='completion' and state='issued' and terms->>'completed_on'<=$5 and(terms->>'valid_until' is null or terms->>'valid_until'>=$5) limit 1",
        [c.tenantId, company, employee, id, on],
      );
      if (!ok.rowCount) conflict("A required prerequisite certificate is missing, expired or revoked.");
    }
  }
  private async save(
    client: PoolClient,
    c: HrActorContext,
    r: Row | null,
    values: {
      id?: string;
      company_id: string;
      kind: Row["kind"];
      programme_id?: string | null;
      parent_id?: string | null;
      employee_id?: string | null;
      state: string;
      terms: HrLearningTerms;
      manager_user_id?: string | null;
      manager_decided_by?: string | null;
    },
    action: string,
    reason: string,
  ) {
    const id = r?.id ?? values.id ?? "learning-" + randomUUID();
    if (!r)
      await client.query(
        "insert into hr_learning_record(tenant_id,company_id,id,kind,programme_id,parent_id,employee_id,state,terms,created_by,updated_by,manager_user_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10,$11)",
        [
          c.tenantId,
          values.company_id,
          id,
          values.kind,
          values.programme_id ?? null,
          values.parent_id ?? null,
          values.employee_id ?? null,
          values.state,
          values.terms,
          c.actor.userId,
          values.manager_user_id ?? null,
        ],
      );
    else
      await client.query(
        "update hr_learning_record set state=$3,terms=$4,version=version+1,updated_by=$5,updated_at=clock_timestamp(),manager_user_id=$6,manager_decided_by=$7 where tenant_id=$1 and id=$2",
        [
          c.tenantId,
          id,
          values.state,
          values.terms,
          c.actor.userId,
          values.manager_user_id === undefined ? r.manager_user_id : values.manager_user_id,
          values.manager_decided_by === undefined ? r.manager_decided_by : values.manager_decided_by,
        ],
      );
    await client.query(
      "insert into hr_learning_event(tenant_id,company_id,id,record_id,version,action,reason,actor_id,before_json,after_json) select tenant_id,company_id,$3,id,version,$4,$5,$6,$7::jsonb,to_jsonb(r) from hr_learning_record r where tenant_id=$1 and id=$2",
      [c.tenantId, id, "learning-event-" + randomUUID(), action, reason, c.actor.userId, r ? JSON.stringify(r) : null],
    );
    return this.row(client, c, values.company_id, id);
  }
  private async allowed(client: PoolClient, c: HrActorContext, r: Row, rights: Record<string, boolean>) {
    if (!writable(c)) return [];
    const actions: string[] = [],
      own =
        !!r.employee_id &&
        (await this.owned(client, c, r.company_id, r.employee_id)) &&
        (await canManageSelfService(client, c, r.company_id, r.employee_id)),
      independent = await this.independent(client, c, r);
    if (r.kind === "programme") {
      if (r.state === "draft" && rights.manage) actions.push("update");
      if (r.state === "draft" && rights.manage && independent) actions.push("activate");
      if (r.state === "active" && rights.manage) actions.push("archive");
    }
    if (r.kind === "request") {
      if (r.state === "draft" && (own || rights.request) && r.created_by === c.actor.userId)
        actions.push("update", "submit");
      if (
        ["draft", "pending_manager", "pending_hr", "approved"].includes(r.state) &&
        (own || rights.manage) &&
        !(
          await client.query(
            "select 1 from hr_learning_record where tenant_id=$1 and kind='participation' and terms->>'request_id'=$2 and state<>'withdrawn' limit 1",
            [c.tenantId, r.id],
          )
        ).rowCount
      )
        actions.push("cancel");
      if (r.state === "pending_manager" && r.manager_user_id === c.actor.userId && rights.manager_decide && independent)
        actions.push("manager_approve", "reject");
      if (r.state === "pending_hr" && rights.hr_decide && independent && r.manager_decided_by !== c.actor.userId)
        actions.push("hr_approve", "reject");
    }
    if (r.kind === "session" && rights.manage) {
      if (r.state === "draft") actions.push("update", "schedule", "cancel");
      if (r.state === "scheduled" && r.terms.kind === "session") {
        const counts = (
          await client.query<{ active: number; pending: number }>(
            "select count(*)filter(where state<>'withdrawn')::int active,count(*)filter(where state='enrolled')::int pending from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='participation'",
            [c.tenantId, r.id],
          )
        ).rows[0]!;
        if (!counts.pending && Date.parse(r.terms.slots.at(-1)!.ends_at) <= Date.now()) actions.push("close");
        if (!counts.active) actions.push("cancel");
      }
    }
    if (r.kind === "participation" && r.state === "enrolled" && r.terms.kind === "participation") {
      const frozen = !!(
        await client.query(
          "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='completion' and state<>'voided' limit 1",
          [c.tenantId, r.id],
        )
      ).rowCount;
      if (!frozen) {
        const session = await this.row(client, c, r.company_id, r.parent_id!, "session"),
          p = await this.row(client, c, r.company_id, r.programme_id!, "programme");
        if (
          rights.attendance &&
          session.state === "scheduled" &&
          session.terms.kind === "session" &&
          p.terms.kind === "programme"
        ) {
          if (session.terms.slots.some((s) => Date.parse(s.ends_at) <= Date.now())) actions.push("attendance");
          const attendance = r.terms.attendance;
          if (
            session.terms.slots.every(
              (s) =>
                Date.parse(s.ends_at) <= Date.now() &&
                attendance.some((a) => Date.parse(a.starts_at) === Date.parse(s.starts_at)),
            ) &&
            attendance.length === session.terms.slots.length &&
            r.terms.evidence_reference.length >= 12 &&
            (p.terms.pass_mark === null || r.terms.assessment_score !== null)
          )
            actions.push("propose_completion");
        }
        if (rights.manage) actions.push("withdraw");
      }
    }
    if (r.kind === "completion") {
      if (r.state === "submitted" && rights.certify && independent) {
        const p = await this.row(client, c, r.company_id, r.parent_id!, "participation");
        if (p.updated_by !== c.actor.userId) actions.push("finalize", "void");
      }
      if (r.state === "issued" && rights.certify && independent) actions.push("revoke");
      if (r.state === "issued" && (rights.read || own)) actions.push("certificate");
    }
    return actions;
  }
  private async dto(
    client: PoolClient,
    c: HrActorContext,
    r: Row,
    rights: Record<string, boolean>,
    today: string,
    includeActions = true,
  ): Promise<HrLearningRecord> {
    const e = r.employee_id
      ? (
          await client.query<{ name: string; code: string }>(
            "select concat_ws(' ',first_name,middle_name,last_name) as name,employee_number as code from employee where tenant_id=$1 and id=$2",
            [c.tenantId, r.employee_id],
          )
        ).rows[0]
      : null;
    const { tenant_id: tenant, ...rest } = r;
    void tenant;
    return {
      ...rest,
      terms: hrLearningTermsSchema.parse(r.terms),
      employee_name: e?.name ?? "",
      employee_number: e?.code ?? "",
      allowed_actions: includeActions ? await this.allowed(client, c, r, rights) : [],
      expired:
        r.state === "issued" && r.terms.kind === "completion" && !!r.terms.valid_until && r.terms.valid_until < today,
    };
  }
  async workspace(c: HrActorContext, q: HrLearningQuery) {
    return withHrGovernedClient(this.d, c, true, async (client) => {
      await requireHrGovernedCompany(client, c, q.company_id);
      const employee = q.mode === "mine" ? await requireSelfServiceEmployee(client, c, q.company_id) : null;
      if (!employee) await this.permission(client, c, q.company_id, "read");
      const rights: Record<string, boolean> = {};
      for (const key of ["read", "manage", "request", "manager_decide", "hr_decide", "attendance", "certify"])
        rights[key] = await this.can(client, c, q.company_id, key);
      if (q.mode === "mine") {
        for (const key of Object.keys(rights)) rights[key] = false;
      }
      const today = (await client.query<{ today: string }>("select current_date::text today")).rows[0]!.today;
      const projection = async (rows: Row[], actions = true) =>
        Promise.all(rows.map((r) => this.dto(client, c, r, rights, today, actions)));
      const base =
          "r.tenant_id=$1 and r.company_id=$2 and r.kind=$3 and($4::text is null or r.employee_id=$4 or r.kind='programme' and r.state='active' or r.kind='session' and exists(select 1 from hr_learning_record p where p.tenant_id=r.tenant_id and p.parent_id=r.id and p.kind='participation' and p.employee_id=$4)) and($5='all' or r.state=$5) and($6='' or concat_ws(' ',r.terms->>'name',r.terms->>'title',r.id,e.first_name,e.last_name,e.employee_number) ilike '%'||$6||'%')",
        args = [c.tenantId, q.company_id, kinds[q.section], employee, q.state, q.search];
      const rows = (
          await client.query<Row>(
            `select r.*,r.created_at::text,r.updated_at::text from hr_learning_record r left join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where ${base} order by r.created_at desc,r.id limit $7 offset $8`,
            [...args, q.limit, q.offset],
          )
        ).rows,
        total = (
          await client.query<{ n: number }>(
            `select count(*)::int n from hr_learning_record r left join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id where ${base}`,
            args,
          )
        ).rows[0]!.n;
      let selected: Row | null = null;
      if (q.record_id) {
        selected = await this.row(client, c, q.company_id, q.record_id);
        if (
          employee &&
          !(
            selected.employee_id === employee ||
            (selected.kind === "programme" && selected.state === "active") ||
            (selected.kind === "session" &&
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and employee_id=$3 and kind='participation'",
                  [c.tenantId, selected.id, employee],
                )
              ).rowCount)
          )
        )
          denied();
      }
      const optionRows = (
        await client.query<Row>(
          "select r.*,r.created_at::text,r.updated_at::text from hr_learning_record r where tenant_id=$1 and company_id=$2 and((kind='programme' and state='active') or(kind='request' and state='approved' and($3::text is null or employee_id=$3) and not exists(select 1 from hr_learning_record seat where seat.tenant_id=r.tenant_id and seat.kind='participation' and seat.terms->>'request_id'=r.id and seat.state<>'withdrawn')) or(kind='session' and state='scheduled' and $3::text is null)) order by r.created_at desc,r.id limit 601",
          [c.tenantId, q.company_id, employee],
        )
      ).rows;
      const optionKind = (kind: string) => optionRows.filter((r) => r.kind === kind).slice(0, 200);
      const participants =
        selected?.kind === "session"
          ? (
              await client.query<Row>(
                "select r.*,r.created_at::text,r.updated_at::text from hr_learning_record r where tenant_id=$1 and parent_id=$2 and kind='participation' and($3::text is null or employee_id=$3) order by r.created_at,r.id limit 200",
                [c.tenantId, selected.id, employee],
              )
            ).rows
          : [];
      const history = selected
        ? (
            await client.query(
              "select id,record_id,version,action,reason,actor_id,occurred_at::text from hr_learning_event where tenant_id=$1 and record_id=$2 order by version desc limit 100",
              [c.tenantId, selected.id],
            )
          ).rows
        : [];
      const employees = employee
        ? []
        : (
            await client.query<{ id: string; name: string; code: string }>(
              "select e.id,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as name,e.employee_number as code from employee e where tenant_id=$1 and exists(select 1 from hr_employment_relationship r where r.tenant_id=e.tenant_id and r.employee_id=e.id and r.legal_employer_id=$2 and r.status='active' and r.approval_state='approved' and r.effective_from<=current_date and(r.effective_to is null or r.effective_to>=current_date)) and($3='' or concat_ws(' ',e.first_name,e.last_name,e.employee_number) ilike '%'||$3||'%') order by employee_number,id limit 101",
              [c.tenantId, q.company_id, q.search],
            )
          ).rows;
      const links =
        employee || !(await this.performanceRead(client, c, q.company_id))
          ? []
          : (
              await client.query(
                "select id,kind,employee_id,coalesce(terms->>'title',terms->>'development_plan',id) as label from hr_performance_record where tenant_id=$1 and company_id=$2 and kind in('goal','outcome') and state='approved' order by created_at desc,id limit 101",
                [c.tenantId, q.company_id],
              )
            ).rows;
      const gapsWhere =
        "p.tenant_id=$1 and p.company_id=$2 and p.kind='programme' and p.state='active' and(p.terms->>'mandatory')::boolean and($3::text is null or e.id=$3) and exists(select 1 from hr_employment_relationship r where r.tenant_id=e.tenant_id and r.employee_id=e.id and r.legal_employer_id=$2 and r.status='active' and r.approval_state='approved' and r.effective_from<=current_date and(r.effective_to is null or r.effective_to>=current_date)) and not exists(select 1 from hr_learning_record x where x.tenant_id=p.tenant_id and x.company_id=p.company_id and x.programme_id=p.id and x.employee_id=e.id and x.kind='completion' and x.state='issued' and(x.terms->>'valid_until' is null or x.terms->>'valid_until'>=current_date::text))";
      const gaps =
          q.section === "completions"
            ? (
                await client.query(
                  `select p.id as programme_id,p.terms->>'name' as programme_name,e.id as employee_id,concat_ws(' ',e.first_name,e.last_name) as employee_name from hr_learning_record p join employee e on e.tenant_id=p.tenant_id where ${gapsWhere} order by p.id,e.id limit 50`,
                  [c.tenantId, q.company_id, employee],
                )
              ).rows
            : [],
        gapTotal =
          q.section === "completions"
            ? (
                await client.query<{ n: number }>(
                  `select count(*)::int n from hr_learning_record p join employee e on e.tenant_id=p.tenant_id where ${gapsWhere}`,
                  [c.tenantId, q.company_id, employee],
                )
              ).rows[0]!.n
            : 0;
      return hrLearningWorkspaceSchema.parse({
        company_id: q.company_id,
        section: q.section,
        mode: q.mode,
        today,
        items: await projection(rows),
        total,
        limit: q.limit,
        offset: q.offset,
        selected: selected ? (await projection([selected]))[0] : null,
        participants: await projection(participants),
        history,
        programmes: await projection(optionKind("programme"), false),
        requests: await projection(optionKind("request"), false),
        sessions: await projection(optionKind("session"), false),
        employees: employees.slice(0, 100),
        performance_links: links.slice(0, 100),
        options_capped:
          optionRows.length > 600 ||
          ["programme", "request", "session"].some((k) => optionRows.filter((r) => r.kind === k).length > 200) ||
          employees.length > 100 ||
          links.length > 100,
        can_manage: writable(c) && rights.manage,
        can_review: writable(c) && rights.certify,
        can_create_request:
          writable(c) &&
          (rights.request || (!!employee && (await canManageSelfService(client, c, q.company_id, employee)))),
        gaps,
        gap_total: gapTotal,
      });
    });
  }
  async action(c: HrActorContext, input: HrLearningAction, key: string, corr: string) {
    let target: Row | null = null,
      ownEmployee: string | null = null;
    return runHrGovernedCommand(
      this.d,
      c,
      {
        company: input.company_id,
        path: "/api/v1/hr/learning/actions",
        key,
        corr,
        input,
        lock: `nexora:hr:learning:${c.tenantId}:${input.company_id}`,
        type: "hr.learning.workflow",
      },
      async (client) => {
        await requireHrGovernedCompany(client, c, input.company_id, true);
        if ("id" in input && input.id) target = await this.row(client, c, input.company_id, input.id, undefined, true);
        const managerDecision =
          input.action === "manager_approve" ||
          (input.action === "reject" &&
            (target?.state === "pending_manager" ||
              (target?.state === "rejected" && target.manager_decided_by === null)));
        const need =
          input.action === "enroll"
            ? "manage"
            : input.action === "attendance" || input.action === "propose_completion"
              ? "attendance"
              : input.action === "finalize" || input.action === "revoke" || input.action === "void"
                ? "certify"
                : input.action === "manager_approve"
                  ? "manager_decide"
                  : input.action === "hr_approve"
                    ? "hr_decide"
                    : input.action === "reject"
                      ? managerDecision
                        ? "manager_decide"
                        : "hr_decide"
                      : (input.action === "create" && input.terms.kind === "request") ||
                          input.action === "submit" ||
                          (input.action === "update" && target?.kind === "request")
                        ? "request"
                        : "manage";
        if (!(await this.can(client, c, input.company_id, need))) {
          const employee = target?.employee_id ?? ("employee_id" in input ? input.employee_id : null);
          if (
            ((input.action === "create" && input.terms.kind === "request") ||
              (target?.kind === "request" && ["update", "submit", "cancel"].includes(input.action))) &&
            (!employee || (await this.owned(client, c, input.company_id, employee, true)))
          )
            ownEmployee = await requireSelfServiceEmployee(client, c, input.company_id, true, employee ?? undefined);
          else if (input.action === "reject" && target?.kind === "request")
            await this.permission(client, c, input.company_id, managerDecision ? "manager_decide" : "hr_decide");
          else denied();
        }
        if (
          target &&
          ["manager_approve", "hr_approve", "finalize", "revoke", "void", "reject"].includes(input.action)
        ) {
          if (!(await this.independent(client, c, target)))
            denied("An independent officer must decide this learning record.");
          if (target.kind === "request") {
            if (
              managerDecision &&
              (target.manager_user_id !== c.actor.userId ||
                (await this.route(client, c, input.company_id, target.employee_id!)) !== c.actor.userId)
            )
              denied("Only the current routed reporting manager may decide this request.");
            if (!managerDecision && target.manager_decided_by === c.actor.userId)
              denied("HR review must be separate from the manager decision.");
          }
          if (input.action === "finalize") {
            const p = await this.row(client, c, input.company_id, target.parent_id!, "participation");
            const assessor = (
              await client.query<{ actor_id: string }>(
                "select actor_id from hr_learning_event where tenant_id=$1 and record_id=$2 and action='attendance' order by version desc limit 1",
                [c.tenantId, p.id],
              )
            ).rows[0]?.actor_id;
            if (assessor === c.actor.userId)
              denied("The attendance/assessment recorder cannot certify their own evidence.");
          }
        }
      },
      async (client) => {
        const company = input.company_id,
          today = (await client.query<{ today: string }>("select current_date::text today")).rows[0]!.today;
        const save = async (
          r: Row | null,
          v: Parameters<LearningDevelopment["save"]>[3],
          action: string = input.action,
        ) => this.save(client, c, r, v, action, input.reason);
        let after: Row;
        if (input.action === "create" || input.action === "update") {
          const terms = input.terms;
          if (input.action === "create" && (input.id || input.expected_version !== 0))
            conflict("New records require version zero and no existing ID.");
          if (
            input.action === "update" &&
            (!target ||
              target.state !== "draft" ||
              target.version !== input.expected_version ||
              target.kind !== terms.kind)
          )
            conflict("Only the current draft can be edited.");
          const employee = terms.kind === "request" ? (target?.employee_id ?? ownEmployee ?? input.employee_id) : null;
          if (terms.kind === "request" && !employee) conflict("Choose an employee for this request.");
          if (target && target.created_by !== c.actor.userId && target.kind === "request")
            denied("The request author must edit their own draft.");
          const programme =
            terms.kind === "programme" ? null : await this.programme(client, c, company, terms.programme_id);
          if (target && target.kind !== "programme" && programme?.id !== target.programme_id)
            conflict("A retained draft cannot change its programme. Create a new draft.");
          if (terms.kind === "programme") {
            if (target && terms.prerequisite_ids.includes(target.id)) conflict("A programme cannot require itself.");
            for (const id of terms.prerequisite_ids) await this.programme(client, c, company, id);
          }
          if (employee) {
            await this.employee(client, c, company, employee);
            if (terms.kind === "request")
              for (const [kind, id] of [
                ["goal", terms.goal_id],
                ["outcome", terms.outcome_id],
              ])
                if (id) {
                  if (!(await this.performanceRead(client, c, company)))
                    denied("Current Performance read authority is required to link development records.");
                  const ok = await client.query(
                    "select 1 from hr_performance_record where tenant_id=$1 and company_id=$2 and id=$3 and employee_id=$4 and kind=$5 and state='approved'",
                    [c.tenantId, company, id, employee, kind],
                  );
                  if (!ok.rowCount)
                    conflict("The linked approved performance record must belong to this employee and company.");
                }
          }
          after = await save(target, {
            company_id: company,
            kind: terms.kind,
            employee_id: employee ?? null,
            programme_id: programme?.id ?? null,
            state: "draft",
            terms,
          });
        } else if (input.action === "enroll") {
          const request = await this.row(client, c, company, input.request_id, "request", true),
            session = await this.row(client, c, company, input.session_id, "session", true);
          if (
            request.state !== "approved" ||
            session.state !== "scheduled" ||
            request.version !== input.expected_request_version ||
            session.version !== input.expected_session_version ||
            request.programme_id !== session.programme_id ||
            session.terms.kind !== "session"
          )
            conflict("Review the current approved request and matching scheduled session.");
          const p = await this.programme(client, c, company, session.programme_id!),
            slots = session.terms.slots;
          if (Date.parse(slots[0]!.starts_at) <= Date.now()) conflict("Enroll before the first lesson starts.");
          for (const slot of [slots[0]!, slots.at(-1)!])
            await this.employee(client, c, company, request.employee_id!, slot.starts_at.slice(0, 10));
          await this.prerequisites(client, c, company, request.employee_id!, p, slots[0]!.starts_at.slice(0, 10));
          const n = (
            await client.query<{ n: number }>(
              "select count(*)::int n from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='participation' and state<>'withdrawn'",
              [c.tenantId, session.id],
            )
          ).rows[0]!.n;
          if (n >= session.terms.capacity)
            conflict(
              "This session is full. A cancelled enrolment must release a seat before another employee can join.",
            );
          const overlap = await client.query(
            "select 1 from hr_learning_record p join hr_learning_record s on s.tenant_id=p.tenant_id and s.id=p.parent_id cross join lateral jsonb_array_elements(s.terms->'slots') old cross join jsonb_array_elements($4::jsonb) new where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.kind='participation' and p.state<>'withdrawn' and s.state='scheduled' and(old->>'starts_at')::timestamptz<(new->>'ends_at')::timestamptz and(new->>'starts_at')::timestamptz<(old->>'ends_at')::timestamptz limit 1",
            [c.tenantId, company, request.employee_id, JSON.stringify(slots)],
          );
          if (overlap.rowCount) conflict("This employee already has an overlapping training session.");
          after = await save(null, {
            company_id: company,
            kind: "participation",
            employee_id: request.employee_id,
            programme_id: request.programme_id,
            parent_id: session.id,
            state: "enrolled",
            terms: {
              kind: "participation",
              request_id: request.id,
              session_id: session.id,
              attendance: [],
              assessment_score: null,
              evidence_reference: "",
            },
          });
        } else {
          const r = target;
          if (!r || r.version !== input.expected_version) conflict("This record changed. Refresh its current version.");
          let state = r.state,
            terms = r.terms,
            manager = r.manager_user_id,
            managerDecider = r.manager_decided_by;
          if (input.action === "attendance") {
            if (r.kind !== "participation" || r.state !== "enrolled" || r.terms.kind !== "participation")
              conflict("Only an enrolled participant can receive attendance evidence.");
            if (
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='completion' and state<>'voided' limit 1",
                  [c.tenantId, r.id],
                )
              ).rowCount
            )
              conflict(
                "Completion evidence is frozen. An independent certifier must void the submitted proposal before correcting attendance.",
              );
            const session = await this.row(client, c, company, r.parent_id!, "session");
            if (session.state !== "scheduled" || session.terms.kind !== "session")
              conflict("The training session must remain scheduled.");
            if (new Set(input.attendance.map((a) => Date.parse(a.starts_at))).size !== input.attendance.length)
              conflict("Record each lesson once.");
            for (const a of input.attendance) {
              const slot = session.terms.slots.find((s) => Date.parse(s.starts_at) === Date.parse(a.starts_at));
              if (
                !slot ||
                Date.parse(slot.ends_at) > Date.now() ||
                a.minutes > (Date.parse(slot.ends_at) - Date.parse(slot.starts_at)) / 60000
              )
                conflict("Attendance must match a finished lesson and cannot exceed its planned minutes.");
            }
            terms = {
              ...r.terms,
              attendance: input.attendance,
              assessment_score: input.assessment_score,
              evidence_reference: input.evidence_reference,
            };
          } else if (input.action === "propose_completion") {
            if (r.kind !== "participation" || r.state !== "enrolled" || r.terms.kind !== "participation")
              conflict("Review an enrolled participant first.");
            const session = await this.row(client, c, company, r.parent_id!, "session"),
              p = await this.row(client, c, company, r.programme_id!, "programme");
            if (session.terms.kind !== "session" || session.state !== "scheduled" || p.terms.kind !== "programme")
              conflict("Review the retained programme and scheduled session.");
            const slots = session.terms.slots;
            if (
              Date.parse(slots.at(-1)!.ends_at) > Date.now() ||
              r.terms.attendance.length !== slots.length ||
              slots.some(
                (s) =>
                  !r.terms.kind ||
                  r.terms.kind !== "participation" ||
                  !r.terms.attendance.some((a) => Date.parse(a.starts_at) === Date.parse(s.starts_at)),
              ) ||
              r.terms.evidence_reference.length < 12
            )
              conflict(
                "Record all finished lessons, including explicit zero-minute absences, and verified evidence first.",
              );
            if (p.terms.pass_mark !== null && r.terms.assessment_score === null)
              conflict("The programme requires an assessment score.");
            const planned = slots.reduce((n, s) => n + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000, 0),
              attended = r.terms.attendance.reduce((n, a) => n + a.minutes, 0),
              percent = Math.round((attended / planned) * 10000) / 100,
              result =
                attended * 100 >= planned * p.terms.minimum_attendance_percent &&
                (p.terms.pass_mark === null || r.terms.assessment_score! >= p.terms.pass_mark)
                  ? "passed"
                  : "failed",
              on = new Date(slots.at(-1)!.ends_at).toISOString().slice(0, 10),
              employee = (
                await client.query<{ name: string; code: string }>(
                  "select concat_ws(' ',first_name,middle_name,last_name) name,employee_number code from employee where tenant_id=$1 and id=$2",
                  [c.tenantId, r.employee_id],
                )
              ).rows[0]!;
            await this.employee(client, c, company, r.employee_id!, on);
            await this.prerequisites(client, c, company, r.employee_id!, p, on);
            const until =
              p.terms.validity_months === null
                ? null
                : (
                    await client.query<{ on_date: string }>(
                      "select ($1::date+make_interval(months=>$2))::date::text as on_date",
                      [on, p.terms.validity_months],
                    )
                  ).rows[0]!.on_date;
            after = await save(null, {
              company_id: company,
              kind: "completion",
              programme_id: r.programme_id,
              parent_id: r.id,
              employee_id: r.employee_id,
              state: "submitted",
              terms: {
                kind: "completion",
                participation_id: r.id,
                employee_name: employee.name,
                employee_number: employee.code,
                programme_name: p.terms.name,
                session_title: session.terms.title,
                completed_on: on,
                attendance_percent: percent,
                assessment_score: r.terms.assessment_score,
                result,
                certificate_id: "NXL-" + randomUUID().toUpperCase(),
                valid_until: until,
                source_hash: attendanceHash({ participation: r, programme: p, session }),
                evidence_reference: r.terms.evidence_reference,
                minimum_attendance_percent: p.terms.minimum_attendance_percent,
                pass_mark: p.terms.pass_mark,
              },
            });
            return { id: after.id, version: after.version, status: after.state, before: null, after };
          } else if (r.kind === "programme" && input.action === "activate" && r.state === "draft") {
            if (r.terms.kind !== "programme") conflict("Review programme terms.");
            for (const id of r.terms.prerequisite_ids) await this.programme(client, c, company, id);
            if (!(await this.independent(client, c, r))) denied("A different officer must publish this programme.");
            state = "active";
          } else if (r.kind === "programme" && input.action === "archive" && r.state === "active") {
            const open = await client.query(
              "select 1 from hr_learning_record where tenant_id=$1 and programme_id=$2 and(kind='request' and state in('draft','pending_manager','pending_hr','approved') or kind='session' and state in('draft','scheduled')) limit 1",
              [c.tenantId, r.id],
            );
            if (open.rowCount) conflict("Resolve open requests and sessions before archiving the programme.");
            state = "archived";
          } else if (r.kind === "request" && input.action === "submit" && r.state === "draft") {
            if (r.created_by !== c.actor.userId) denied("The request author must submit it.");
            await this.employee(client, c, company, r.employee_id!);
            const p = await this.programme(client, c, company, r.programme_id!);
            await this.prerequisites(client, c, company, r.employee_id!, p, today);
            manager = await this.route(client, c, company, r.employee_id!);
            if (manager === r.created_by) conflict("A separate reporting manager must review this request.");
            state = "pending_manager";
          } else if (r.kind === "request" && input.action === "manager_approve" && r.state === "pending_manager") {
            await this.employee(client, c, company, r.employee_id!);
            state = "pending_hr";
            managerDecider = c.actor.userId;
          } else if (r.kind === "request" && input.action === "hr_approve" && r.state === "pending_hr") {
            await this.employee(client, c, company, r.employee_id!);
            await this.programme(client, c, company, r.programme_id!);
            state = "approved";
          } else if (
            r.kind === "request" &&
            input.action === "reject" &&
            ["pending_manager", "pending_hr"].includes(r.state)
          )
            state = "rejected";
          else if (
            r.kind === "request" &&
            input.action === "cancel" &&
            ["draft", "pending_manager", "pending_hr", "approved"].includes(r.state)
          ) {
            if (
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and kind='participation' and terms->>'request_id'=$2 and state<>'withdrawn' limit 1",
                  [c.tenantId, r.id],
                )
              ).rowCount
            )
              conflict("Withdraw the active enrolment before cancelling this request.");
            state = "cancelled";
          } else if (r.kind === "session" && input.action === "schedule" && r.state === "draft") {
            await this.programme(client, c, company, r.programme_id!);
            const p = await this.row(client, c, company, r.programme_id!, "programme");
            if (p.terms.kind !== "programme") conflict("Review programme terms.");
            if (
              r.terms.kind !== "session" ||
              r.terms.slots.reduce((n, s) => n + (Date.parse(s.ends_at) - Date.parse(s.starts_at)) / 60000, 0) <
                p.terms.duration_minutes ||
              Date.parse(r.terms.slots[0]!.starts_at) <= Date.now()
            )
              conflict(
                "Schedule before the first lesson and include enough minutes to meet the published programme duration.",
              );
            state = "scheduled";
          } else if (r.kind === "session" && input.action === "cancel" && ["draft", "scheduled"].includes(r.state)) {
            if (
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='participation' and state<>'withdrawn' limit 1",
                  [c.tenantId, r.id],
                )
              ).rowCount
            )
              conflict("Withdraw all participants before cancelling the session.");
            state = "cancelled";
          } else if (r.kind === "session" && input.action === "close" && r.state === "scheduled") {
            if (
              r.terms.kind !== "session" ||
              Date.parse(r.terms.slots.at(-1)!.ends_at) > Date.now() ||
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='participation' and state='enrolled' limit 1",
                  [c.tenantId, r.id],
                )
              ).rowCount
            )
              conflict("All lessons must finish and each participant must be completed or withdrawn before closing.");
            state = "closed";
          } else if (r.kind === "participation" && input.action === "withdraw" && r.state === "enrolled") {
            if (
              (
                await client.query(
                  "select 1 from hr_learning_record where tenant_id=$1 and parent_id=$2 and kind='completion' and state<>'voided' limit 1",
                  [c.tenantId, r.id],
                )
              ).rowCount
            )
              conflict("Submitted completion evidence must be decided before withdrawing.");
            state = "withdrawn";
          } else if (
            r.kind === "completion" &&
            input.action === "finalize" &&
            r.state === "submitted" &&
            r.terms.kind === "completion"
          ) {
            const participant = await this.row(client, c, company, r.parent_id!, "participation", true),
              session = await this.row(client, c, company, participant.parent_id!, "session"),
              p = await this.row(client, c, company, r.programme_id!, "programme");
            if (
              participant.state !== "enrolled" ||
              r.terms.source_hash !== attendanceHash({ participation: participant, programme: p, session })
            )
              conflict("The completion source changed. Review retained evidence before certification.");
            state = r.terms.result === "passed" ? "issued" : "failed";
            await save(participant, { ...participant, state: "completed" }, "complete_participation");
            const request = await this.row(
              client,
              c,
              company,
              participant.terms.kind === "participation" ? participant.terms.request_id : "",
              "request",
              true,
            );
            await save(request, { ...request, state: "fulfilled" }, "fulfil_request");
          } else if (r.kind === "completion" && input.action === "void" && r.state === "submitted") state = "voided";
          else if (r.kind === "completion" && input.action === "revoke" && r.state === "issued") state = "revoked";
          else conflict("This action is not available in the current learning state.");
          after = await save(r, { ...r, state, terms, manager_user_id: manager, manager_decided_by: managerDecider });
        }
        return { id: after.id, version: after.version, status: after.state, before: target, after };
      },
    );
  }
  async certificate(c: HrActorContext, company: string, id: string) {
    return withHrGovernedClient(this.d, c, true, async (client) => {
      await requireHrGovernedCompany(client, c, company);
      const r = await this.row(client, c, company, id, "completion");
      if (!(await this.can(client, c, company, "read")) && !(await this.owned(client, c, company, r.employee_id)))
        denied();
      if (r.state !== "issued" || r.terms.kind !== "completion")
        conflict("Only an issued, unrevoked certificate can be downloaded.");
      const today = (await client.query<{ on_date: string }>("select current_date::text as on_date")).rows[0]!.on_date;
      if (r.terms.valid_until && r.terms.valid_until < today)
        conflict("This certificate has expired. The retained completion remains in history.");
      const source = (
        await client.query(
          "select o.name as company_name,coalesce(nullif(u.display_name,''),u.id) as issuer_name from organization_unit o join security_user_account u on u.tenant_id=o.tenant_id and u.id=$3 where o.tenant_id=$1 and o.id=$2",
          [c.tenantId, company, r.updated_by],
        )
      ).rows[0];
      return hrLearningCertificateSchema.parse({
        record: await this.dto(client, c, r, { read: true }, today),
        ...source,
        issued_at: r.updated_at,
      });
    });
  }
}
