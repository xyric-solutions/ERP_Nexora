import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import {
  hrReportExportPolicyTermsSchema,
  hrReportGovernanceWorkspaceSchema,
  type HrReportGovernanceQuery,
  type HrReportGovernanceAction,
  type HrReportGovernanceWorkspace,
  type HrReportGovernanceResult,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { requireHrCompanyPermission } from "./company-authority.js";
import { attendanceHash } from "./attendance-completion.js";
import {
  withHrGovernedClient,
  runHrGovernedCommand,
  requireHrGovernedCompany,
  type HrGovernedDependencies,
} from "./governed.js";
type Report = "employee_directory" | "payroll_results";
type Policy = {
  id: string;
  version: number;
  state: "submitted" | "approved" | "rejected";
  terms: ReturnType<typeof hrReportExportPolicyTermsSchema.parse>;
  created_by: string;
  created_at: string;
  reason: string;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string;
};
type ExportRow = {
  id: string;
  report: Report;
  from_date: string;
  to_date: string;
  policy_id: string;
  row_count: number;
  source_hash: string;
  created_by: string;
  created_at: string;
  expires_at: string;
  reason: string;
  expired: boolean;
};
const reports = [
  {
    id: "employee_directory" as const,
    title: "Employee directory",
    description:
      "Effective company workforce in the selected window. Excludes personal contacts, date of birth, bank and tax identifiers.",
  },
  {
    id: "payroll_results" as const,
    title: "Finalized Payroll results",
    description:
      "Current finalized run totals including posted settlement supplements. Excludes bank details and unpublished calculations.",
  },
];
const review = (message: string): never => {
  throw new HrApiError(409, "HR_REPORT_REVIEW_REQUIRED", message);
};
const columns = {
  employee_directory: [
    "Company",
    "Employee number",
    "Employee name",
    "Status",
    "Joined on",
    "Department",
    "Designation",
  ],
  payroll_results: [
    "Company",
    "Employee number",
    "Employee name",
    "Payroll month",
    "Currency",
    "Gross",
    "Employee deductions",
    "Net",
    "Employer contributions",
    "Payroll state",
  ],
};
/** Neutralize spreadsheet formulas before quoting; never treat source values as formulas or HTML. */
export function hrCsvCell(value: unknown) {
  const text = String(value ?? ""),
    safe = /^[\s]*[=+\-@\t\r\n]/.test(text) ? "'" + text : text;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export class HrReportGovernance {
  constructor(private readonly d: HrGovernedDependencies) {}
  private async permission(client: PoolClient, c: HrActorContext, company: string, key: string) {
    await requireHrCompanyPermission(client, c, company, key);
  }
  private async can(client: PoolClient, c: HrActorContext, company: string, keys: string[]) {
    try {
      for (const key of keys) await this.permission(client, c, company, key);
      return true;
    } catch (e) {
      if (e instanceof HrApiError && e.status === 403) return false;
      throw e;
    }
  }
  private keys(report: Report) {
    return report === "employee_directory"
      ? ["hr.employee.read"]
      : ["hr.payroll.report.read", "hr.payroll.result.read", "hr.payroll.salary.read"];
  }
  private async active(client: PoolClient, c: HrActorContext, company: string) {
    return (
      (
        await client.query<Policy>(
          "select id,version,state,terms,created_by,created_at::text,reason,decided_by,decided_at::text,decision_reason from hr_report_export_policy where tenant_id=$1 and company_id=$2 and state='approved' order by decided_at desc,id desc limit 1",
          [c.tenantId, company],
        )
      ).rows[0] ?? null
    );
  }
  private async policyPublic(client: PoolClient, c: HrActorContext, company: string, p: Policy) {
    const can =
      p.state === "submitted" &&
      p.created_by !== c.actor.userId &&
      !c.impersonationRequestId &&
      (!c.realActorId || c.realActorId === c.actor.userId) &&
      (await this.can(client, c, company, ["hr.report_export_policy.approve"]));
    return { ...p, allowed_actions: can ? ["approve_policy", "reject_policy"] : [] };
  }
  private async event(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    kind: string,
    id: string,
    reason: string,
  ) {
    await client.query(
      "insert into hr_report_access_event(tenant_id,company_id,id,kind,record_id,actor_id,reason) values($1,$2,$3,$4,$5,$6,$7)",
      [c.tenantId, company, "report-event-" + randomUUID(), kind, id, c.actor.userId, reason],
    );
  }
  private async snapshot(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    report: Report,
    from: string,
    to: string,
    max: number,
  ) {
    let rows: string[][];
    if (report === "employee_directory")
      rows = (
        await client.query<{ cells: string[] }>(
          `select cells from(select distinct on(e.id) e.id,e.employee_number,a.effective_from,a.id as assignment_id,array[o.name,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name),e.status,e.joined_on::text,coalesce(dept.name,''),coalesce(des.name,'')] as cells from employee_assignment a join employee e on e.tenant_id=a.tenant_id and e.id=a.employee_id join organization_unit o on o.tenant_id=a.tenant_id and o.id=a.company_id left join organization_unit dept on dept.tenant_id=a.tenant_id and dept.id=a.department_id left join hr_master_record des on des.tenant_id=a.tenant_id and des.id=a.designation_id left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.assignment_status in('active','ended','legacy_compatibility') and a.effective_from<=$4::date and(a.effective_to is null or a.effective_to>=$3::date) and(e.joined_on<=$4::date) and(a.assignment_status='legacy_compatibility' or a.employment_relationship_id is null or er.approval_state='approved') order by e.id,a.effective_from desc,a.id desc) roster order by employee_number,id limit $5`,
          [c.tenantId, company, from, to, max + 1],
        )
      ).rows.map((r) => r.cells);
    else
      rows = (
        await client.query<{ cells: string[] }>(
          `select array[o.name,e.employee_number,concat_ws(' ',e.first_name,e.middle_name,e.last_name),p.month::text,r.currency_code,coalesce(x.value->>'gross',r.gross::text),coalesce(x.value->>'deductions',r.deductions::text),coalesce(x.value->>'net',r.net::text),coalesce(x.value->>'employer_contributions',r.employer_contributions::text),p.state] as cells from hr_payroll_result r join hr_payroll_period p on p.tenant_id=r.tenant_id and p.company_id=r.company_id and p.id=r.period_id and p.run_number=r.run_number join employee e on e.tenant_id=r.tenant_id and e.id=r.employee_id join organization_unit o on o.tenant_id=r.tenant_id and o.id=r.company_id left join lateral(select effective_hr_payroll_correction(r.tenant_id,r.company_id,r.id) as value)x on true where r.tenant_id=$1 and r.company_id=$2 and p.workflow_managed and p.state in('posted','paid','closed') and p.month between date_trunc('month',$3::date)::date and date_trunc('month',$4::date)::date order by p.month,e.employee_number,r.id limit $5`,
          [c.tenantId, company, from, to, max + 1],
        )
      ).rows.map((r) => r.cells);
    if (rows.length > max)
      review(
        "This report exceeds the approved row limit. Narrow the date range or ask for an independently reviewed policy change.",
      );
    const hash = attendanceHash({ report, company, from, to, columns: columns[report], rows }),
      csv = "\uFEFF" + [columns[report], ...rows].map((row) => row.map(hrCsvCell).join(",")).join("\r\n") + "\r\n";
    if (Buffer.byteLength(csv, "utf8") > 2000000)
      review("This report exceeds the bounded export size. Narrow the date range.");
    return { hash, csv, count: rows.length };
  }
  async workspace(c: HrActorContext, q: HrReportGovernanceQuery): Promise<HrReportGovernanceWorkspace> {
    return withHrGovernedClient(this.d, c, true, async (client) => {
      await requireHrGovernedCompany(client, c, q.company_id);
      await this.permission(
        client,
        c,
        q.company_id,
        q.section === "audit" ? "hr.report_audit.read" : "hr.report_export.read",
      );
      const active = await this.active(client, c, q.company_id),
        catalogue = [];
      for (const r of reports)
        catalogue.push({
          ...r,
          can_export:
            !!active &&
            active.terms.reports.includes(r.id) &&
            (await this.can(client, c, q.company_id, ["hr.report_export.create", ...this.keys(r.id)])),
        });
      let total = 0;
      const policies = [],
        exports = [],
        events = [];
      if (q.section === "policies") {
        const rows = (
          await client.query<Policy>(
            "select id,version,state,terms,created_by,created_at::text,reason,decided_by,decided_at::text,decision_reason from hr_report_export_policy where tenant_id=$1 and company_id=$2 order by created_at desc,id limit $3 offset $4",
            [c.tenantId, q.company_id, q.limit, q.offset],
          )
        ).rows;
        for (const p of rows) policies.push(await this.policyPublic(client, c, q.company_id, p));
        total = (
          await client.query<{ n: number }>(
            "select count(*)::int as n from hr_report_export_policy where tenant_id=$1 and company_id=$2",
            [c.tenantId, q.company_id],
          )
        ).rows[0]!.n;
      }
      if (q.section === "exports") {
        const rows = (
          await client.query<ExportRow>(
            "select id,report,from_date::text,to_date::text,policy_id,row_count,source_hash,created_by,created_at::text,expires_at::text,reason,expires_at<=clock_timestamp() as expired from hr_report_export where tenant_id=$1 and company_id=$2 and created_by=$3 order by created_at desc,id limit $4 offset $5",
            [c.tenantId, q.company_id, c.actor.userId, q.limit, q.offset],
          )
        ).rows;
        for (const row of rows)
          exports.push({
            ...row,
            can_download:
              !row.expired &&
              row.policy_id === active?.id &&
              !c.impersonationRequestId &&
              (!c.realActorId || c.realActorId === c.actor.userId) &&
              (await this.can(client, c, q.company_id, ["hr.report_export.download", ...this.keys(row.report)])),
          });
        total = (
          await client.query<{ n: number }>(
            "select count(*)::int as n from hr_report_export where tenant_id=$1 and company_id=$2 and created_by=$3",
            [c.tenantId, q.company_id, c.actor.userId],
          )
        ).rows[0]!.n;
      }
      if (q.section === "audit") {
        events.push(
          ...(
            await client.query(
              "select id,kind,record_id,actor_id,reason,occurred_at::text from hr_report_access_event where tenant_id=$1 and company_id=$2 order by occurred_at desc,id limit $3 offset $4",
              [c.tenantId, q.company_id, q.limit, q.offset],
            )
          ).rows,
        );
        total = (
          await client.query<{ n: number }>(
            "select count(*)::int as n from hr_report_access_event where tenant_id=$1 and company_id=$2",
            [c.tenantId, q.company_id],
          )
        ).rows[0]!.n;
      }
      return hrReportGovernanceWorkspaceSchema.parse({
        company_id: q.company_id,
        section: q.section,
        catalogue,
        active_policy: active ? await this.policyPublic(client, c, q.company_id, active) : null,
        policies,
        exports,
        events,
        total,
        limit: q.limit,
        offset: q.offset,
        can_manage_policy: await this.can(client, c, q.company_id, ["hr.report_export_policy.manage"]),
      });
    });
  }
  async action(
    c: HrActorContext,
    input: HrReportGovernanceAction,
    key: string,
    corr: string,
  ): Promise<HrReportGovernanceResult> {
    let active: Policy | null = null,
      exportRow: ExportRow | null = null,
      download: HrReportGovernanceResult["download"];
    const result = await runHrGovernedCommand(
      this.d,
      c,
      {
        company: input.company_id,
        key,
        corr,
        path: "/api/v1/hr/report_governance/actions",
        input,
        lock: `nexora:hr:report-governance:${c.tenantId}:${input.company_id}`,
        type: "hr.report.governance",
      },
      async (client) => {
        await requireHrGovernedCompany(client, c, input.company_id, true);
        await this.permission(client, c, input.company_id, "hr.report_export.read");
        const permission =
          input.action === "create_policy"
            ? "hr.report_export_policy.manage"
            : input.action.endsWith("_policy")
              ? "hr.report_export_policy.approve"
              : input.action === "download"
                ? "hr.report_export.download"
                : "hr.report_export.create";
        await this.permission(client, c, input.company_id, permission);
        if (input.action === "create_export" || input.action === "download") {
          active = await this.active(client, c, input.company_id);
          if (!active) review("An independently approved export policy is required. Open Compliance Configuration.");
          let report: Report;
          if (input.action === "download") {
            exportRow =
              (
                await client.query<ExportRow>(
                  "select id,report,from_date::text,to_date::text,policy_id,row_count,source_hash,created_by,created_at::text,expires_at::text,reason,expires_at<=clock_timestamp() as expired from hr_report_export where tenant_id=$1 and company_id=$2 and id=$3 and created_by=$4",
                  [c.tenantId, input.company_id, input.id, c.actor.userId],
                )
              ).rows[0] ?? null;
            if (!exportRow)
              throw new HrApiError(
                404,
                "HR_REPORT_EXPORT_NOT_FOUND",
                "This export receipt is unavailable for your account.",
              );
            if (exportRow.expired) review("This export authorization expired. Create a new reviewed export.");
            if (exportRow.policy_id !== active!.id)
              review("The disclosure policy changed. Create a new export under the current approved policy.");
            report = exportRow.report;
          } else report = input.report;
          if (!active!.terms.reports.includes(report)) review("This report is outside the approved disclosure policy.");
          for (const key of this.keys(report)) await this.permission(client, c, input.company_id, key);
          // Download bytes are regenerated only after current authority, expiry and source checks. They are never persisted in receipts or idempotency storage.
          if (input.action === "download") {
            const row = exportRow!,
              snapshot = await this.snapshot(
                client,
                c,
                input.company_id,
                row.report,
                row.from_date,
                row.to_date,
                active!.terms.max_rows,
              );
            if (snapshot.hash !== row.source_hash || snapshot.count !== row.row_count)
              review(
                "The report source changed after review. Create a fresh export; the original receipt is retained.",
              );
            download = {
              filename: row.report + "-" + row.from_date + "-" + row.to_date + ".csv",
              content_type: "text/csv;charset=utf-8",
              csv: snapshot.csv,
              row_count: snapshot.count,
            };
          }
        }
        if (input.action === "approve_policy" || input.action === "reject_policy") {
          const p = (
            await client.query<Policy>(
              "select * from hr_report_export_policy where tenant_id=$1 and company_id=$2 and id=$3",
              [c.tenantId, input.company_id, input.id],
            )
          ).rows[0];
          if (!p) throw new HrApiError(404, "HR_REPORT_POLICY_NOT_FOUND", "This policy is unavailable.");
          if (p.created_by === c.actor.userId)
            throw new HrApiError(
              403,
              "PERMISSION_DENIED",
              "A different authorized officer must review this disclosure policy.",
            );
        }
      },
      async (client) => {
        if (input.action === "create_policy") {
          const id = "export-policy-" + randomUUID();
          await client.query(
            "insert into hr_report_export_policy(tenant_id,company_id,id,terms,created_by,reason) values($1,$2,$3,$4,$5,$6)",
            [
              c.tenantId,
              input.company_id,
              id,
              hrReportExportPolicyTermsSchema.parse(input.terms),
              c.actor.userId,
              input.reason,
            ],
          );
          await this.event(client, c, input.company_id, "policy.created", id, input.reason);
          return {
            id,
            version: 1,
            status: "submitted",
            before: null,
            after: { action: input.action, terms: input.terms, reason: input.reason },
          };
        }
        if (input.action === "approve_policy" || input.action === "reject_policy") {
          const p = (
            await client.query<Policy>(
              "select * from hr_report_export_policy where tenant_id=$1 and company_id=$2 and id=$3 for update",
              [c.tenantId, input.company_id, input.id],
            )
          ).rows[0]!;
          if (p.state !== "submitted" || p.version !== input.expected_version)
            review("The disclosure policy changed. Refresh its version.");
          const state = input.action === "approve_policy" ? "approved" : "rejected";
          await client.query(
            "update hr_report_export_policy set state=$3,version=version+1,decided_by=$4,decided_at=clock_timestamp(),decision_reason=$5 where tenant_id=$1 and id=$2",
            [c.tenantId, p.id, state, c.actor.userId, input.reason],
          );
          await this.event(client, c, input.company_id, "policy." + state, p.id, input.reason);
          return {
            id: p.id,
            version: p.version + 1,
            status: state,
            before: { state: p.state },
            after: { state, action: input.action, reason: input.reason },
          };
        }
        if (input.action === "create_export") {
          const count = (
            await client.query<{ n: number }>(
              "select count(*)::int as n from hr_report_export where tenant_id=$1 and company_id=$2 and created_by=$3 and created_at>clock_timestamp()-interval '1 hour'",
              [c.tenantId, input.company_id, c.actor.userId],
            )
          ).rows[0]!.n;
          if (count >= 20) review("The hourly export limit has been reached. Reuse a current receipt or try later.");
          const snapshot = await this.snapshot(
              client,
              c,
              input.company_id,
              input.report,
              input.from_date,
              input.to_date,
              active!.terms.max_rows,
            ),
            id = "hr-export-" + randomUUID();
          await client.query(
            "insert into hr_report_export(tenant_id,company_id,id,report,from_date,to_date,policy_id,row_count,source_hash,created_by,created_at,expires_at,reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,statement_timestamp(),statement_timestamp()+($11||' hours')::interval,$12)",
            [
              c.tenantId,
              input.company_id,
              id,
              input.report,
              input.from_date,
              input.to_date,
              active!.id,
              snapshot.count,
              snapshot.hash,
              c.actor.userId,
              String(active!.terms.expires_after_hours),
              input.reason,
            ],
          );
          await this.event(client, c, input.company_id, "export.created", id, input.reason);
          return {
            id,
            version: 1,
            status: "ready",
            before: null,
            after: {
              report: input.report,
              row_count: snapshot.count,
              source_hash: snapshot.hash,
              policy_id: active!.id,
              reason: input.reason,
            },
          };
        }
        await this.event(client, c, input.company_id, "export.downloaded", input.id, input.reason);
        return {
          id: input.id,
          version: 1,
          status: "downloaded",
          before: null,
          after: {
            report: exportRow!.report,
            source_hash: exportRow!.source_hash,
            row_count: exportRow!.row_count,
            reason: input.reason,
          },
        };
      },
    );
    return download ? { ...result, download } : result;
  }
}
