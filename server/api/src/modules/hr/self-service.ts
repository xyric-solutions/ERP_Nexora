import { canManagePersonalLeave } from "./self-leave-authority.js";
import type { Pool, PoolClient } from "pg";
import {
  hrPayslipDocumentSchema,
  hrSelfServiceWorkspaceSchema,
  type HrPayslipDocument,
  type HrPayslipDetail,
  type HrSelfServiceQuery,
  type HrSelfServiceWorkspace,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { readLeaveBalances } from "./leave-balances.js";
import { reconcilePayslip } from "./payroll-payslips.js";
import { attendanceHash } from "./attendance-completion.js";

type Membership = HrSelfServiceWorkspace["memberships"][number];
type Publication = {
  id: string;
  employee_id: string;
  company_id: string;
  payroll_result_id: string;
  period_id: string;
  publication_snapshot: unknown;
  publication_hash: string;
  released_at: string;
  released_by: string;
  workflow_managed: boolean;
};

/** Personal projections have no HR administrator override and grant no employer-wide reads. */
export class HrSelfService {
  constructor(private readonly pool: Pool) {}
  private async read<T>(c: HrActorContext, operation: (client: PoolClient) => Promise<T>) {
    if (c.actor.tenantId !== c.tenantId)
      throw new HrApiError(403, "PERMISSION_DENIED", "The active tenant session is required.");
    const client = await this.pool.connect();
    try {
      await client.query("begin isolation level repeatable read read only");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [c.tenantId]);
      const active = await client.query(
        "select 1 from security_user_account where tenant_id=$1 and id=$2 and status='active' and archived_at is null",
        [c.tenantId, c.actor.userId],
      );
      if (!active.rowCount) throw new HrApiError(403, "PERMISSION_DENIED", "An active employee account is required.");
      const result = await operation(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
  private async memberships(client: PoolClient, c: HrActorContext, company?: string) {
    // Current binding + current company access + an actual employment relationship.
    // Historical ended employment remains visible only while Security explicitly retains access.
    const result = await client.query<Membership>(
      `select distinct o.id as company_id,o.name as company_name,e.id as employee_id,concat_ws(' ',e.first_name,e.middle_name,e.last_name) as employee_name,e.employee_number
      from employee_user_binding b join employee e on e.tenant_id=b.tenant_id and e.id=b.employee_id
      join hr_employment_relationship r on r.tenant_id=e.tenant_id and r.employee_id=e.id and r.status in ('active','suspended','ended') and r.effective_from<=current_date
      join organization_unit o on o.tenant_id=r.tenant_id and o.id=r.legal_employer_id and o.type='company' and o.status='active'
      join security_user_company_access a on a.tenant_id=o.tenant_id and a.company_id=o.id and a.user_id=b.user_id and a.revoked_at is null
      where b.tenant_id=$1 and b.user_id=$2 and b.ended_at is null and b.effective_from<=current_date and(b.effective_to is null or b.effective_to>=current_date)
      and($3::text is null or o.id=$3) order by company_name,company_id,employee_id limit 101`,
      [c.tenantId, c.actor.userId, company ?? null],
    );
    return result.rows;
  }
  private document(row: Publication, employee: string): HrPayslipDocument {
    const doc = hrPayslipDocumentSchema.parse(row.publication_snapshot);
    if (
      row.employee_id !== employee ||
      doc.employee.id !== employee ||
      doc.company.id !== row.company_id ||
      doc.result.id !== row.payroll_result_id ||
      doc.period.id !== row.period_id ||
      attendanceHash(doc) !== row.publication_hash
    )
      throw new HrApiError(409, "HR_SELF_SERVICE_PUBLICATION_INVALID", "The published payslip needs Payroll review.");
    reconcilePayslip(doc);
    return doc;
  }
  async workspace(c: HrActorContext, q: HrSelfServiceQuery): Promise<HrSelfServiceWorkspace> {
    return this.read(c, async (client) => {
      const all = await this.memberships(client, c),
        company = q.company_id ?? all[0]?.company_id;
      const owned = company ? await this.memberships(client, c, company) : [];
      if (q.company_id && owned.length !== 1)
        throw new HrApiError(403, "PERMISSION_DENIED", "This company is unavailable for your employee account.");
      if (owned.length > 1)
        throw new HrApiError(
          409,
          "HR_SELF_SERVICE_BINDING_AMBIGUOUS",
          "Ask Security to review the employee account binding.",
        );
      const membership = owned[0];
      if (!membership)
        return hrSelfServiceWorkspaceSchema.parse({
          memberships: [],
          memberships_truncated: false,
          company_id: null,
          month: q.month,
          status: "link_required",
          payslips: [],
          payslip_total: 0,
          requests: [],
          request_total: 0,
          balances: [],
          balances_truncated: false,
          loans: [],
          loan_total: 0,
          limit: q.limit,
          offset: q.offset,
        });
      const args = [c.tenantId, membership.company_id, membership.employee_id, q.month, q.limit, q.offset];
      const payslips = await client.query<Publication>(
        `select p.*,p.released_at::text from hr_payslip_release p
        where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.workflow_managed and p.publication_snapshot->'period'->>'month'=$4 order by p.released_at desc,p.id limit $5 offset $6`,
        args,
      );
      const requests = await client.query(
        `select r.id,r.reference,t.name as leave_type,r.from_date::text,r.to_date::text,r.requested_days::text as days,r.status from hr_leave_request r join hr_leave_type t on t.tenant_id=r.tenant_id and t.company_id=r.company_id and t.id=r.leave_type_id
        where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and r.from_date<($4::date+interval '1 month') and r.to_date>=$4::date order by r.from_date desc,r.id limit $5 offset $6`,
        args,
      );
      const loans = await client.query(
        `select l.id,l.reference,l.currency_code as currency,l.principal::text,l.state,
        coalesce((select sum(i.amount) from hr_loan_instalment i where i.tenant_id=l.tenant_id and i.loan_id=l.id and i.state='consumed'),0)::text as recovered,
        coalesce((select sum(i.amount) from hr_loan_instalment i where i.tenant_id=l.tenant_id and i.loan_id=l.id and i.state='scheduled'),0)::text as outstanding
        from hr_employee_loan l where l.tenant_id=$1 and l.company_id=$2 and l.employee_id=$3 and l.state in ('approved','active','settled') order by l.created_at desc,l.id limit $4 offset $5`,
        [...args.slice(0, 3), q.limit, q.offset],
      );
      const types = await client.query<{ id: string }>(
        `select id from hr_leave_type where tenant_id=$1 and company_id=$2 and (status='active' or exists(select 1 from hr_leave_transaction l where l.tenant_id=hr_leave_type.tenant_id and l.company_id=hr_leave_type.company_id and l.leave_type_id=hr_leave_type.id and l.employee_id=$3)) order by name,id limit 51`,
        args.slice(0, 3),
      );
      const today = (await client.query<{ today: string }>("select current_date::text as today")).rows[0]!.today;
      const balances = await readLeaveBalances(
        client,
        c,
        membership.company_id,
        types.rows.slice(0, 50).map((t) => ({ employee: membership.employee_id, type: t.id })),
        today,
      );
      // Totals remain correct on empty pages beyond the last row.
      const counts = await client.query<{ payslips: number; requests: number; loans: number }>(
        `select
        (select count(*)::int from hr_payslip_release p where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.workflow_managed and p.publication_snapshot->'period'->>'month'=$4) as payslips,
        (select count(*)::int from hr_leave_request r where r.tenant_id=$1 and r.company_id=$2 and r.employee_id=$3 and r.from_date<($4::date+interval '1 month') and r.to_date>=$4::date) as requests,
        (select count(*)::int from hr_employee_loan l where l.tenant_id=$1 and l.company_id=$2 and l.employee_id=$3 and l.state in ('approved','active','settled')) as loans`,
        args.slice(0, 4),
      );
      return hrSelfServiceWorkspaceSchema.parse({
        memberships: all.slice(0, 100),
        memberships_truncated: all.length > 100,
        company_id: membership.company_id,
        month: q.month,
        status: "ready",
        can_apply_leave: await canManagePersonalLeave(client, c, membership.company_id, membership.employee_id),
        payslips: payslips.rows.map((r) => {
          const doc = this.document(r, membership.employee_id);
          return {
            id: r.id,
            month: doc.period.month,
            currency: doc.result.currency,
            gross: doc.result.gross,
            deductions: doc.result.deductions,
            net: doc.result.net,
            released_at: r.released_at,
          };
        }),
        payslip_total: counts.rows[0]!.payslips,
        requests: requests.rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          leave_type: r.leave_type,
          from_date: r.from_date,
          to_date: r.to_date,
          days: r.days,
          status: r.status,
        })),
        request_total: counts.rows[0]!.requests,
        balances,
        balances_truncated: types.rows.length > 50,
        loans: loans.rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          currency: r.currency,
          principal: r.principal,
          recovered: r.recovered,
          outstanding: r.outstanding,
          state: r.state,
        })),
        loan_total: counts.rows[0]!.loans,
        limit: q.limit,
        offset: q.offset,
      });
    });
  }
  async payslip(c: HrActorContext, company: string, id: string): Promise<HrPayslipDetail> {
    return this.read(c, async (client) => {
      const memberships = await this.memberships(client, c, company);
      if (memberships.length !== 1)
        throw new HrApiError(404, "HR_SELF_SERVICE_PAYSLIP_NOT_FOUND", "This published payslip is unavailable.");
      const row = (
        await client.query<Publication>(
          `select p.*,p.released_at::text from hr_payslip_release p where p.tenant_id=$1 and p.company_id=$2 and p.employee_id=$3 and p.id=$4 and p.workflow_managed`,
          [c.tenantId, company, memberships[0]!.employee_id, id],
        )
      ).rows[0];
      if (!row)
        throw new HrApiError(404, "HR_SELF_SERVICE_PAYSLIP_NOT_FOUND", "This published payslip is unavailable.");
      return {
        document: this.document(row, memberships[0]!.employee_id),
        release: {
          id: row.id,
          released_by: row.released_by,
          released_at: row.released_at,
          publication_hash: row.publication_hash,
          workflow_managed: row.workflow_managed,
        },
        can_release: false,
      };
    });
  }
}
