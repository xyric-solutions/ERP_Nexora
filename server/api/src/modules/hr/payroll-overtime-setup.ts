import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  hrOvertimeMoneyPolicyTermsSchema,
  type CreateHrOvertimeMoney,
  type HrOvertimeMoneyQuery,
  type HrOvertimeMoneyDecision,
  type HrOvertimeMoneyRecord,
  type HrOvertimeMoneyWorkspace,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { PayrollWorkspace, type PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
type Row = Record<string, unknown>;
function fail(message: string): never {
  throw new HrApiError(409, "HR_OT_MONEY_REVIEW_REQUIRED", message);
}
function deny(message = "The required monetary overtime permission is missing."): never {
  throw new HrApiError(403, "PERMISSION_DENIED", message);
}
const has = (c: HrActorContext, p: string) => c.actor.permissions.includes(p);
const manage = (kind: string) => (kind === "policy" ? "hr.payroll.setup.manage" : "hr.payroll.salary.manage");
const approve = (kind: string) => (kind === "policy" ? "hr.payroll.period.approve" : "hr.payroll.salary.approve");
const read = (kind: string) => (kind === "policy" ? "hr.payroll.setup.read" : "hr.payroll.salary.read");
const table = (kind: string) => (kind === "policy" ? "hr_ot_monetary_policy_version" : "hr_employee_ot_arrangement");
const date = (value: unknown) => (value == null ? null : String(value));
export class PayrollOvertimeSetup {
  private writes: PayrollWorkspace;
  constructor(private readonly d: PayrollWorkspaceDependencies) {
    this.writes = new PayrollWorkspace(d);
  }
  private async load(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    kind: "policy" | "arrangement",
    id?: string,
    q?: HrOvertimeMoneyQuery,
  ) {
    const params: unknown[] = [c.tenantId, company];
    let filter = "";
    if (id) {
      params.push(id);
      filter += " and a.id=$3";
    } else if (q) {
      params.push("%" + q.search + "%");
      filter +=
        kind === "policy"
          ? " and (p.reference ilike $3 or p.name ilike $3)"
          : " and (e.employee_number ilike $3 or concat_ws(' ',e.first_name,e.last_name) ilike $3)";
    }
    const list = q ? ` limit $${params.push(q.limit)} offset $${params.push(q.offset)}` : "";
    return (
      await client.query(
        kind === "policy"
          ? `select a.*,a.effective_from::text,a.effective_to::text,p.reference,p.name,o.terms,o.option_id from hr_ot_monetary_policy_version a join hr_ot_monetary_policy p on p.tenant_id=a.tenant_id and p.company_id=a.company_id and p.id=a.policy_id left join lateral(select o.id as option_id,jsonb_build_object('category',a.category,'basis_source',o.basis_source,'rate_basis_method',o.rate_basis_method,'component_ids',coalesce((select jsonb_agg(oc.component_id order by oc.position) from hr_ot_monetary_option_component oc where oc.tenant_id=o.tenant_id and oc.company_id=o.company_id and oc.option_id=o.id),'[]'::jsonb),'earning_component_id',o.earning_component_id,'currency_code',a.currency_code,'money_scale',o.final_currency_scale,'ordinary_hours',o.ordinary_hours::text,'multiplier',o.multiplier::text,'rounding_mode',o.rounding_mode,'rounding_stage',o.rounding_stage,'minute_precision',o.minute_precision,'hourly_rate_precision',o.hourly_rate_precision,'intermediate_precision',o.intermediate_precision,'source_reference',a.source_reference) as terms from hr_ot_monetary_policy_option o where o.tenant_id=a.tenant_id and o.company_id=a.company_id and o.policy_version_id=a.id order by o.id limit 1) o on true where a.tenant_id=$1 and a.company_id=$2${filter} order by a.created_at desc,a.id collate "C"${list}`
          : `select a.*,a.effective_from::text,a.effective_to::text,a.state as status,e.employee_number as reference,concat_ws(' ',e.first_name,e.last_name) as name from hr_employee_ot_arrangement a join employee e on e.tenant_id=a.tenant_id and e.id=a.employee_id where a.tenant_id=$1 and a.company_id=$2${filter} order by a.created_at desc,a.id collate "C"${list}`,
        params,
      )
    ).rows as Row[];
  }
  private async map(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    kind: "policy" | "arrangement",
    r: Row,
  ): Promise<HrOvertimeMoneyRecord> {
    const history = (
      await client.query(
        `select action,reason,actor_id,created_at::text as occurred_at,(override_id is not null) as override from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_id=$3 order by created_at desc,id desc limit 20`,
        [c.tenantId, company, r.id],
      )
    ).rows;
    const policy =
      kind === "policy" ? r : (await this.load(client, c, company, "policy", String(r.policy_version_id)))[0];
    const parsed = hrOvertimeMoneyPolicyTermsSchema.safeParse(policy?.terms),
      actions: HrOvertimeMoneyRecord["allowed_actions"] = [];
    if (r.workflow_managed) {
      if (r.status === "draft" && r.created_by === c.actor.userId && has(c, manage(kind))) actions.push("submit");
      if (r.status === "submitted" && has(c, approve(kind))) actions.push("approve", "reject");
      if (kind === "policy" && r.status === "approved" && has(c, approve(kind))) actions.push("release");
    }
    return {
      id: String(r.id),
      kind,
      reference: String(r.reference),
      name: String(r.name),
      status: String(r.status),
      version: Number(r.workflow_version),
      source_hash: attendanceHash({ row: r, terms: policy?.terms ?? null }),
      workflow_managed: Boolean(r.workflow_managed),
      effective_from: String(r.effective_from),
      effective_to: date(r.effective_to),
      employee_id: kind === "policy" ? null : String(r.employee_id),
      policy_version_id: kind === "policy" ? String(r.id) : String(r.policy_version_id),
      terms: parsed.success ? parsed.data : null,
      direct_rate: kind === "policy" ? null : date(r.direct_rate),
      allowed_actions: actions,
      history,
    };
  }
  async workspace(c: HrActorContext, q: HrOvertimeMoneyQuery): Promise<HrOvertimeMoneyWorkspace> {
    const kind = q.section === "policies" ? "policy" : "arrangement";
    return this.d.read(c, read(kind), async (client) => {
      await this.d.company(client, c, q.company_id);
      const rows = await this.load(client, c, q.company_id, kind, undefined, q),
        items = await Promise.all(rows.map((r) => this.map(client, c, q.company_id, kind, r)));
      const total = Number(
        (
          await client.query(
            kind === "policy"
              ? `select count(*)::int as n from hr_ot_monetary_policy_version a join hr_ot_monetary_policy p on p.tenant_id=a.tenant_id and p.id=a.policy_id where a.tenant_id=$1 and a.company_id=$2 and (p.reference ilike $3 or p.name ilike $3)`
              : `select count(*)::int as n from hr_employee_ot_arrangement a join employee e on e.tenant_id=a.tenant_id and e.id=a.employee_id where a.tenant_id=$1 and a.company_id=$2 and (e.employee_number ilike $3 or concat_ws(' ',e.first_name,e.last_name) ilike $3)`,
            [c.tenantId, q.company_id, "%" + q.search + "%"],
          )
        ).rows[0].n,
      );
      const components = (
        await client.query(
          `select c.id,c.code||' · '||c.name as label from hr_pay_component c join account a on a.tenant_id=c.tenant_id and a.company_id=c.company_id and a.id=c.expense_account_id where c.tenant_id=$1 and c.company_id=$2 and c.kind='earning' and c.method='fixed' and c.status='active' and a.status='active' and a.type='expense' and not a.is_header order by c.code,c.id limit 501`,
          [c.tenantId, q.company_id],
        )
      ).rows;
      const employees =
        kind === "arrangement"
          ? (
              await client.query(
                `select e.id,e.employee_number||' · '||concat_ws(' ',e.first_name,e.last_name) as label from employee e where e.tenant_id=$1 and e.status='active' and (e.employee_number ilike $4 or concat_ws(' ',e.first_name,e.last_name) ilike $4) and exists(select 1 from employee_assignment a where a.tenant_id=e.tenant_id and a.company_id=$2 and a.employee_id=e.id and a.effective_from<=$3::date and (a.effective_to is null or a.effective_to>=$3::date)) order by e.employee_number,e.id limit 101`,
                [c.tenantId, q.company_id, q.on_date, "%" + q.search + "%"],
              )
            ).rows
          : [];
      const currencies = (
        await client.query(
          `select code as id,code||' · '||name as label,decimal_places as scale from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 100`,
          [c.tenantId],
        )
      ).rows;
      const releasedIds =
        kind === "arrangement"
          ? (
              await client.query(
                "select id from hr_ot_monetary_policy_version where tenant_id=$1 and company_id=$2 and workflow_managed and status='released' order by effective_from desc,id collate \"C\" limit 51",
                [c.tenantId, q.company_id],
              )
            ).rows
          : [];
      const policiesRaw = await Promise.all(
        releasedIds.slice(0, 50).map(async (row) => (await this.load(client, c, q.company_id, "policy", row.id))[0]!),
      );
      const policies = await Promise.all(policiesRaw.map((r) => this.map(client, c, q.company_id, "policy", r)));
      return {
        company_id: q.company_id,
        section: q.section,
        items,
        total,
        limit: q.limit,
        offset: q.offset,
        can_create: has(c, manage(kind)),
        options: {
          components: components.slice(0, 500) as { id: string; label: string }[],
          employees: employees.slice(0, 100) as { id: string; label: string }[],
          currencies: currencies as { id: string; label: string; scale: number }[],
          policies,
          truncated: components.length > 500 || employees.length > 100 || releasedIds.length > 50,
        },
      };
    });
  }
  private async component(client: PoolClient, c: HrActorContext, company: string, id: string) {
    if (
      !(
        await client.query(
          `select 1 from hr_pay_component c join account a on a.tenant_id=c.tenant_id and a.company_id=c.company_id and a.id=c.expense_account_id where c.tenant_id=$1 and c.company_id=$2 and c.id=$3 and c.status='active' and c.kind='earning' and c.method='fixed' and a.type='expense' and a.status='active' and not a.is_header for share of c,a`,
          [c.tenantId, company, id],
        )
      ).rowCount
    )
      fail("Choose active fixed earning components with active company expense mappings.");
  }
  private async validatePolicy(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    terms: NonNullable<HrOvertimeMoneyRecord["terms"]>,
  ) {
    const currency = (
      await client.query(
        `select decimal_places from currency where tenant_id=$1 and code=$2 and status='active' for share`,
        [c.tenantId, terms.currency_code],
      )
    ).rows[0];
    if (!currency || currency.decimal_places !== terms.money_scale)
      fail("Use the active Finance currency and its configured precision.");
    for (const id of new Set([...terms.component_ids, terms.earning_component_id]))
      await this.component(client, c, company, id);
  }
  private async employee(
    client: PoolClient,
    c: HrActorContext,
    company: string,
    id: string,
    from: string,
    to: string | null,
  ) {
    if (
      !(
        await client.query(
          `select 1 from employee e where e.tenant_id=$1 and e.id=$3 and e.status='active' and exists(select 1 from employee_assignment a where a.tenant_id=e.tenant_id and a.company_id=$2 and a.employee_id=e.id and a.effective_from<=$4::date and (a.effective_to is null or a.effective_to>=coalesce($5::date,$4::date)))`,
          [c.tenantId, company, id, from, to],
        )
      ).rowCount
    )
      fail("The employee needs an active placement covering the selected effective range.");
  }
  private async unfrozen(client: PoolClient, c: HrActorContext, company: string, from: string, to: string | null) {
    if (
      (
        await client.query(
          `select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2 and state<>'open' and (month+interval '1 month'-interval '1 day')::date>=$3::date and ($4::date is null or month<=$4::date) limit 1`,
          [c.tenantId, company, from, to],
        )
      ).rowCount
    )
      fail("A calculated or finalized Payroll period covers this range. Use the governed correction process.");
  }
  async create(c: HrActorContext, input: CreateHrOvertimeMoney, key: string, corr: string) {
    if (!has(c, read(input.kind))) deny();
    return this.writes.runWrite(
      c,
      input.company_id,
      manage(input.kind),
      key,
      corr,
      "/api/v1/hr/payroll_overtime",
      input,
      async (client) => {
        let id: string;
        if (input.kind === "policy") {
          await this.validatePolicy(client, c, input.company_id, input.terms);
          const parent = "ot-policy-" + randomUUID();
          id = "ot-version-" + randomUUID();
          const option = "ot-option-" + randomUUID();
          await client.query(
            `insert into hr_ot_monetary_policy(id,tenant_id,company_id,reference,name,created_by) values($1,$2,$3,$4,$5,$6)`,
            [parent, c.tenantId, input.company_id, input.reference, input.name, c.actor.userId],
          );
          await client.query(
            `insert into hr_ot_monetary_policy_version(id,tenant_id,company_id,policy_id,version_number,category,effective_from,effective_to,source_reference,created_by,workflow_managed,currency_code) values($1,$2,$3,$4,1,$5,$6,$7,$8,$9,true,$10)`,
            [
              id,
              c.tenantId,
              input.company_id,
              parent,
              input.terms.category,
              input.effective_from,
              input.effective_to,
              input.terms.source_reference,
              c.actor.userId,
              input.terms.currency_code,
            ],
          );
          const t = input.terms;
          await client.query(
            `insert into hr_ot_monetary_policy_option(id,tenant_id,company_id,policy_version_id,code,name,rate_basis_method,basis_source,allowed_compensation_types,allowed_payment_bases,minimum_components,maximum_components,ordinary_hours,multiplier,minute_precision,hourly_rate_precision,intermediate_precision,rounding_mode,rounding_stage,final_currency_scale,earning_component_id) values($1,$2,$3,$4,'PRIMARY',$5,$6,$7,ARRAY['fixed'],ARRAY['monthly'],$8,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
            [
              option,
              c.tenantId,
              input.company_id,
              id,
              input.name,
              t.rate_basis_method,
              t.basis_source,
              t.component_ids.length,
              t.ordinary_hours,
              t.multiplier,
              t.minute_precision,
              t.hourly_rate_precision,
              t.intermediate_precision,
              t.rounding_mode,
              t.rounding_stage,
              t.money_scale,
              t.earning_component_id,
            ],
          );
          for (const [index, component] of t.component_ids.entries())
            await client.query(
              `insert into hr_ot_monetary_option_component(id,tenant_id,company_id,option_id,component_id,position) values($1,$2,$3,$4,$5,$6)`,
              ["ot-allowed-" + randomUUID(), c.tenantId, input.company_id, option, component, index + 1],
            );
        } else {
          const policy = (await this.load(client, c, input.company_id, "policy", input.policy_version_id))[0];
          if (!policy?.workflow_managed || policy.status !== "released")
            fail("Choose a released governed monetary overtime policy.");
          const mapped = await this.map(client, c, input.company_id, "policy", policy);
          if (!mapped.terms) fail("This policy uses unsupported legacy terms.");
          const t = mapped.terms;
          if (
            input.effective_from < mapped.effective_from ||
            (mapped.effective_to && (!input.effective_to || input.effective_to > mapped.effective_to))
          )
            fail("Arrangement dates must stay inside the released policy range.");
          if ((t.basis_source === "direct_contractual_rate") !== (input.direct_rate !== null))
            fail("Provide a direct rate only for a direct contractual policy.");
          await this.validatePolicy(client, c, input.company_id, t);
          await this.employee(client, c, input.company_id, input.employee_id, input.effective_from, input.effective_to);
          await this.unfrozen(client, c, input.company_id, input.effective_from, input.effective_to);
          id = "ot-arrangement-" + randomUUID();
          await client.query(
            `insert into hr_employee_ot_arrangement(id,tenant_id,company_id,employee_id,category,policy_version_id,policy_option_id,effective_from,effective_to,direct_rate,currency_code,reason,created_by,workflow_managed) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true)`,
            [
              id,
              c.tenantId,
              input.company_id,
              input.employee_id,
              t.category,
              policy.id,
              policy.option_id,
              input.effective_from,
              input.effective_to,
              input.direct_rate,
              t.currency_code,
              input.reason,
              c.actor.userId,
            ],
          );
          for (const [index, component] of t.component_ids.entries())
            await client.query(
              `insert into hr_employee_ot_arrangement_component(id,tenant_id,company_id,arrangement_id,component_id,position) values($1,$2,$3,$4,$5,$6)`,
              ["ot-selected-" + randomUUID(), c.tenantId, input.company_id, id, component, index + 1],
            );
        }
        const after = await this.map(
          client,
          c,
          input.company_id,
          input.kind,
          (await this.load(client, c, input.company_id, input.kind, id))[0]!,
        );
        return {
          id,
          status: "draft",
          version: 1,
          kind: input.kind === "policy" ? "ot_policy" : "ot_arrangement",
          before: null,
          after,
        };
      },
    );
  }
  async action(c: HrActorContext, id: string, input: HrOvertimeMoneyDecision, key: string, corr: string) {
    if (!has(c, read(input.kind))) deny();
    const decision = ["approve", "reject", "release"].includes(input.action),
      permission = decision ? approve(input.kind) : manage(input.kind);
    return this.writes.runWrite(
      c,
      input.company_id,
      permission,
      key,
      corr,
      "/api/v1/hr/payroll_overtime/" + id + "/actions",
      input,
      async (client) => {
        await client.query(
          `select id from ${table(input.kind)} where tenant_id=$1 and company_id=$2 and id=$3 for update`,
          [c.tenantId, input.company_id, id],
        );
        const row = (await this.load(client, c, input.company_id, input.kind, id))[0];
        if (!row) throw new HrApiError(404, "HR_OT_MONEY_NOT_FOUND", "The monetary overtime record was not found.");
        const before = await this.map(client, c, input.company_id, input.kind, row);
        if (
          !row.workflow_managed ||
          before.version !== input.expected_version ||
          before.source_hash !== input.source_hash
        )
          fail("The monetary overtime source changed. Refresh and review it again.");
        if (!before.allowed_actions.includes(input.action)) fail("This action is not available for the current state.");
        if (!before.terms) fail("The monetary overtime terms cannot be executed by the current Payroll engine.");
        let override: string | null = null;
        if (decision) {
          const subjects =
              input.kind === "arrangement"
                ? (
                    await client.query(
                      "select user_id from employee_user_binding where tenant_id=$1 and employee_id=$2",
                      [c.tenantId, row.employee_id],
                    )
                  ).rows.map((r) => r.user_id)
                : [],
            makers = [String(row.created_by), String(row.submitted_by ?? ""), ...subjects],
            evaluation = evaluateApprovalActor({
              account: c.actor,
              normalDecisionPermission: permission,
              makerActorIds: makers,
            });
          if (evaluation.kind === "forbidden" || (evaluation.kind === "override" && !input.confirm_override))
            deny("Independent review or an explicit governed administrator override is required.");
          override = await this.d.override(client, c, {
            normalDecisionPermission: permission,
            makerActorIds: makers,
            resourceType: input.kind === "policy" ? "hr_ot_monetary_policy_version" : "hr_employee_ot_arrangement",
            resourceId: id,
            decisionAction: input.action === "reject" ? "reject" : "approve",
            reason: input.reason,
            correlationId: corr,
            idempotencyKey: key,
          });
        } else if (row.created_by !== c.actor.userId) deny("The monetary overtime maker must submit this draft.");
        if (input.action !== "reject") {
          await this.validatePolicy(client, c, input.company_id, before.terms);
          if (input.kind === "arrangement") {
            const policy = (await this.load(client, c, input.company_id, "policy", String(row.policy_version_id)))[0];
            if (policy?.status !== "released") fail("The selected policy is no longer released.");
            await this.employee(
              client,
              c,
              input.company_id,
              String(row.employee_id),
              before.effective_from,
              before.effective_to,
            );
            await this.unfrozen(client, c, input.company_id, before.effective_from, before.effective_to);
            const salaries = (
              await client.query(
                `select s.id,s.compensation_type,s.payment_basis,s.currency_code from hr_salary_assignment s where s.tenant_id=$1 and s.company_id=$2 and s.employee_id=$3 and s.state in('approved','effective') and s.effective_from<=$4::date and (s.effective_to is null or s.effective_to>=$4::date)`,
                [c.tenantId, input.company_id, row.employee_id, before.effective_from],
              )
            ).rows;
            if (
              salaries.length !== 1 ||
              salaries[0].compensation_type !== "fixed" ||
              salaries[0].payment_basis !== "monthly" ||
              salaries[0].currency_code !== before.terms.currency_code
            )
              fail("The arrangement needs one matching approved fixed monthly salary on its start date.");
            for (const component of before.terms.component_ids)
              if (
                !(
                  await client.query(
                    `select 1 from hr_salary_assignment_component where tenant_id=$1 and company_id=$2 and assignment_id=$3 and component_id=$4 and method='fixed'`,
                    [c.tenantId, input.company_id, salaries[0].id, component],
                  )
                ).rowCount
              )
                fail("A selected basis component is absent from the approved salary snapshot.");
          } else if (input.action === "release")
            await this.unfrozen(client, c, input.company_id, before.effective_from, before.effective_to);
        }
        const status =
            input.action === "submit"
              ? "submitted"
              : input.action === "approve"
                ? "approved"
                : input.action === "reject"
                  ? "rejected"
                  : "released",
          stateColumn = input.kind === "policy" ? "status" : "state",
          actorColumn =
            input.action === "submit" ? "submitted_by" : input.action === "release" ? "released_by" : "approved_by",
          timeColumn =
            input.action === "submit" ? "submitted_at" : input.action === "release" ? "released_at" : "approved_at";
        const changed = await client.query(
          `update ${table(input.kind)} set ${stateColumn}=$4,${actorColumn}=$5,${timeColumn}=now(),workflow_version=workflow_version+1,evidence_hash=$6 where tenant_id=$1 and company_id=$2 and id=$3 and workflow_version=$7`,
          [
            c.tenantId,
            input.company_id,
            id,
            status,
            c.actor.userId,
            attendanceHash({
              terms: before.terms,
              effective_from: before.effective_from,
              effective_to: before.effective_to,
              employee_id: before.employee_id,
              direct_rate: before.direct_rate,
            }),
            input.expected_version,
          ],
        );
        if (changed.rowCount !== 1) fail("The monetary overtime decision changed concurrently.");
        const after = await this.map(
          client,
          c,
          input.company_id,
          input.kind,
          (await this.load(client, c, input.company_id, input.kind, id))[0]!,
        );
        return {
          id,
          status,
          version: after.version,
          kind: input.kind === "policy" ? "ot_policy" : "ot_arrangement",
          before,
          after,
          override,
        };
      },
    );
  }
}
