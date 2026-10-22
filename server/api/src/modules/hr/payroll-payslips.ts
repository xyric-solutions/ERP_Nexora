import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  hrPayslipDocumentSchema,
  type HrPayslipDocument,
  type HrPayslipQuery,
  type HrPayslipRelease,
  type HrPayslipWorkspace,
  type HrPayslipDetail,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { PayrollWorkspace, type PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
import { ExactPayrollAmount } from "./payroll-calculation.js";
import { requireBankPaymentCompanyPermission } from "../banking/payments/source-repository.js";
import { BankingApiError } from "../banking/source-repository.js";
// Database rows are projected through shared public schemas before leaving this boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;
const conflict = (message: string): never => {
  throw new HrApiError(409, "HR_PAYSLIP_REVIEW_REQUIRED", message);
};
const denied = (message = "Current company-scoped Payslip and Payroll result authority is required."): never => {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
};
export function reconcilePayslip(doc: HrPayslipDocument) {
  const amount = (s: string) => ExactPayrollAmount.parse(s),
    sum = (kind: string) =>
      doc.lines.filter((l) => l.kind === kind).reduce((n, l) => n.add(amount(l.amount)), amount("0"));
  if (
    !doc.lines.length ||
    doc.lines.length > 1000 ||
    sum("earning").compare(amount(doc.result.gross)) ||
    sum("deduction").compare(amount(doc.result.deductions)) ||
    sum("employer_contribution").compare(amount(doc.result.employer_contributions)) ||
    amount(doc.result.gross).subtract(amount(doc.result.deductions)).compare(amount(doc.result.net))
  )
    conflict("Payslip totals do not reconcile to the retained result lines.");
}
export class PayrollPayslips {
  private readonly writes: PayrollWorkspace;
  constructor(private readonly d: PayrollWorkspaceDependencies) {
    this.writes = new PayrollWorkspace(d);
  }
  private async authorize(client: PoolClient, c: HrActorContext, company: string, release = false) {
    for (const key of [
      "hr.payroll.payslip.read",
      "hr.payroll.result.read",
      ...(release ? ["hr.payroll.payslip.release"] : []),
    ]) {
      if (!c.actor.permissions.includes(key)) denied();
      try {
        await requireBankPaymentCompanyPermission(client, c, key, company);
      } catch (e) {
        if (e instanceof BankingApiError && e.status === 403) denied();
        throw e;
      }
    }
  }
  private async independent(client: PoolClient, c: HrActorContext, p: Row) {
    if (
      [p.created_by, p.calculated_by, p.submitted_by].includes(c.actor.userId) ||
      (
        await client.query(
          `select 1 from employee_user_binding b join hr_payroll_result r on r.tenant_id=b.tenant_id and r.employee_id=b.employee_id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 and b.user_id=$5 and b.ended_at is null limit 1`,
          [c.tenantId, p.company_id, p.id, p.run_number, c.actor.userId],
        )
      ).rowCount
    )
      denied(
        "An independent officer must release payslips. Payroll preparers and bound employees cannot self-publish through an override.",
      );
  }
  private async context(client: PoolClient, c: HrActorContext, q: { company_id: string; month: string }, lock = false) {
    const p = (
      await client.query(
        `select id,state,run_number,company_id,created_by,calculated_by,submitted_by,workflow_managed from hr_payroll_period where tenant_id=$1 and company_id=$2 and month=$3::date${lock ? " for update" : ""}`,
        [c.tenantId, q.company_id, q.month],
      )
    ).rows[0] as Row | undefined;
    const rows = p
      ? ((
          await client.query(
            `select r.id,r.employee_id,r.run_number,r.calculation_hash,r.warnings,s.id as release_id,s.released_by,s.released_at::text,s.workflow_managed as release_managed,s.publication_hash,coalesce(s.publication_snapshot,hr_payslip_publication(r.tenant_id,r.company_id,r.id)) as document from hr_payroll_result r left join hr_payslip_release s on s.tenant_id=r.tenant_id and s.company_id=r.company_id and s.payroll_result_id=r.id where r.tenant_id=$1 and r.company_id=$2 and r.period_id=$3 and r.run_number=$4 order by r.id collate "C" limit 501`,
            [c.tenantId, q.company_id, p.id, p.run_number],
          )
        ).rows as Row[])
      : [];
    const blocked: string[] = [];
    if (!p?.workflow_managed || !["posted", "paid", "closed"].includes(p.state))
      blocked.push(
        "Post the governed Payroll accrual before releasing payslips. Banking confirmation is not required for publication.",
      );
    if (rows.length > 500)
      blocked.push("Publication supports up to 500 employees per run. Larger runs require a governed worker batch.");
    if (rows.some((r) => !r.document))
      blocked.push(
        "A matching posted Finance accrual is required for every result. Historical releases remain preserved.",
      );
    if (rows.some((r) => Array.isArray(r.warnings) && r.warnings.length))
      blocked.push("Resolve Payroll result warnings before publication.");
    let can = false;
    if (p && !blocked.length) {
      try {
        await this.authorize(client, c, q.company_id, true);
        await this.independent(client, c, p);
        can = true;
      } catch (e) {
        if (!(e instanceof HrApiError && e.status === 403)) throw e;
      }
    }
    const hash = attendanceHash({
      period_id: p?.id ?? null,
      run_number: p?.run_number ?? null,
      rows: rows.map((r) => ({
        id: r.id,
        calculation_hash: r.calculation_hash,
        release_id: r.release_id,
        document: r.document,
      })),
    });
    return { p, rows, blocked, can, hash };
  }
  async workspace(c: HrActorContext, q: HrPayslipQuery): Promise<HrPayslipWorkspace> {
    return this.d.read(c, "hr.payroll.payslip.read", async (client) => {
      await this.d.company(client, c, q.company_id);
      await this.authorize(client, c, q.company_id);
      const x = await this.context(client, c, q),
        items = x.rows
          .filter((r) => r.document)
          .map((r) => {
            const doc = hrPayslipDocumentSchema.parse(r.document);
            reconcilePayslip(doc);
            return {
              result_id: r.id,
              employee_id: r.employee_id,
              employee_number: doc.employee.number,
              employee_name: doc.employee.name,
              currency_code: doc.result.currency,
              gross: doc.result.gross,
              deductions: doc.result.deductions,
              net: doc.result.net,
              state: r.release_id ? ("released" as const) : ("pending" as const),
              release_id: r.release_id ?? null,
              released_at: r.released_at ?? null,
              can_release: x.can && !r.release_id,
            };
          })
          .filter(
            (r) =>
              (q.state === "all" || q.state === r.state) &&
              (!q.search ||
                [r.employee_name, r.employee_number].some((v) => v.toLowerCase().includes(q.search.toLowerCase()))),
          );
      const history = x.p
        ? (
            await client.query(
              `select action,reason,actor_id,created_at::text as occurred_at from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_type='payslip' and after_json->>'period_id'=$3 order by created_at desc,id desc limit 100`,
              [c.tenantId, q.company_id, x.p.id],
            )
          ).rows
        : [];
      const released = x.rows.filter((r) => r.release_id).length;
      return {
        company_id: q.company_id,
        month: q.month,
        source_hash: x.hash,
        period: x.p ? { id: x.p.id, state: x.p.state, run_number: x.p.run_number } : null,
        items: items.slice(q.offset, q.offset + q.limit),
        total: items.length,
        limit: q.limit,
        offset: q.offset,
        counts: { results: x.rows.length, released, pending: x.rows.length - released },
        can_release: x.can,
        blocked: x.blocked,
        history,
      };
    });
  }
  async detail(c: HrActorContext, company: string, id: string): Promise<HrPayslipDetail> {
    return this.d.read(c, "hr.payroll.payslip.read", async (client) => {
      await this.d.company(client, c, company);
      await this.authorize(client, c, company);
      const row = (
        await client.query(
          `select p.month::text from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.id=r.period_id and p.company_id=r.company_id and p.run_number=r.run_number where r.tenant_id=$1 and r.company_id=$2 and r.id=$3`,
          [c.tenantId, company, id],
        )
      ).rows[0];
      if (!row)
        throw new HrApiError(404, "HR_PAYSLIP_NOT_FOUND", "This payslip is not available in the authorized company.");
      const x = await this.context(client, c, { company_id: company, month: row.month }),
        r = x.rows.find((r) => r.id === id);
      if (!r?.document) conflict("A posted Payroll result is required before this payslip can be opened.");
      const doc = hrPayslipDocumentSchema.parse(r!.document);
      reconcilePayslip(doc);
      return {
        document: doc,
        release: r!.release_id
          ? {
              id: r!.release_id,
              released_by: r!.released_by,
              released_at: r!.released_at,
              publication_hash: r!.publication_hash ?? null,
              workflow_managed: r!.release_managed,
            }
          : null,
        can_release: x.can && !r!.release_id,
      };
    });
  }
  async release(c: HrActorContext, input: HrPayslipRelease, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.payroll.payslip.release",
      key,
      corr,
      "/api/v1/hr/payslips/releases",
      { ...input, action: "release" },
      async (client) => {
        const x = await this.context(client, c, input, true);
        if (x.blocked.length) conflict(x.blocked.join(" "));
        if (x.hash !== input.source_hash)
          conflict("Payslip publication evidence changed. Refresh and review the selected employees again.");
        if (!x.p) conflict("A posted Payroll period is required.");
        await this.independent(client, c, x.p!);
        const selected = input.result_ids.map((id) => x.rows.find((r) => r.id === id));
        if (selected.some((r) => !r?.document || r.release_id))
          conflict("Choose unreleased current results in this company and Payroll month.");
        const ids: string[] = [];
        for (const r of selected) {
          const doc = hrPayslipDocumentSchema.parse(r!.document);
          reconcilePayslip(doc);
          const id = "payslip-" + randomUUID();
          ids.push(id);
          await client.query(
            `insert into hr_payslip_release(id,tenant_id,company_id,period_id,payroll_result_id,employee_id,run_number,calculation_hash,released_by,workflow_managed,publication_snapshot,publication_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,$10::jsonb,$11)`,
            [
              id,
              c.tenantId,
              input.company_id,
              x.p!.id,
              r!.id,
              r!.employee_id,
              r!.run_number,
              r!.calculation_hash,
              c.actor.userId,
              JSON.stringify(doc),
              attendanceHash(doc),
            ],
          );
        }
        return {
          id: ids[0]!,
          status: "released",
          version: 1,
          kind: "payslip",
          before: { result_ids: input.result_ids },
          after: { period_id: x.p!.id, result_ids: input.result_ids, release_ids: ids, publication_count: ids.length },
        };
      },
      (client) => this.authorize(client, c, input.company_id, true),
    );
  }
}
