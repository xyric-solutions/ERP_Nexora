import {
  isJurisdictionSetup,
  requireJurisdictionSetupAuthority,
  validateJurisdictionSetup,
} from "./payroll-jurisdiction-setup.js";
import {
  verifyStatutoryBundle,
  validateStatutoryBundleReferences,
  statutoryBundleIdentity,
} from "./payroll-statutory-bundle.js";
import { PayrollCalculationError } from "./payroll-calculation.js";
import { ZodError } from "zod";
import type { StatutoryExecutionMode } from "./payroll-statutory.js";
import { randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  hrLocalizationTermsSchema,
  type CreateHrLocalization,
  type HrLocalizationTerms,
  type HrLocalizationQuery,
  type HrLocalizationDecision,
  type HrLocalizationRecord,
  type HrLocalizationWorkspace,
} from "@nexora/contracts";
import { HrApiError, type HrActorContext } from "./source-repository.js";
import { PayrollWorkspace, type PayrollWorkspaceDependencies } from "./payroll-workspace.js";
import { attendanceHash } from "./attendance-completion.js";
type Row = Record<string, unknown>;
const fail = (message: string): never => {
  throw new HrApiError(409, "HR_LOCALIZATION_REVIEW_REQUIRED", message);
};
const deny = (): never => {
  throw new HrApiError(
    403,
    "PERMISSION_DENIED",
    "Independent review and the required statutory setup permission are required.",
  );
};
const has = (c: HrActorContext, p: string) => c.actor.permissions.includes(p);
const permission = (kind: string, action: "read" | "manage" | "approve") =>
  kind === "declaration" || isJurisdictionSetup(kind)
    ? "hr.payroll.salary." + action
    : action === "approve"
      ? "hr.payroll.period.approve"
      : "hr.payroll.setup." + action;
export class PayrollLocalizationSetup {
  private writes: PayrollWorkspace;
  constructor(
    private readonly d: PayrollWorkspaceDependencies,
    private readonly mode: StatutoryExecutionMode = "production",
  ) {
    this.writes = new PayrollWorkspace(d);
  }
  private access(c: HrActorContext, kind: string) {
    if (!has(c, "hr.payroll.setup.read") || !has(c, permission(kind, "read"))) deny();
  }
  private async map(client: PoolClient, c: HrActorContext, r: Row): Promise<HrLocalizationRecord> {
    const actions: HrLocalizationRecord["allowed_actions"] = [];
    if (r.state === "draft" && r.created_by === c.actor.userId && has(c, permission(String(r.kind), "manage")))
      actions.push("submit");
    if (
      r.state === "submitted" &&
      has(c, permission(String(r.kind), "approve")) &&
      (r.kind !== "pack_release" || has(c, "platform.localization.activate"))
    )
      actions.push("approve", "reject");
    const terms = hrLocalizationTermsSchema.parse(r.terms);
    if (isJurisdictionSetup(String(r.kind))) {
      const employee =
        terms.kind === "jurisdiction_override"
          ? terms.employee_id
          : terms.kind === "jurisdiction_override_revocation"
            ? (
                await client.query(
                  "select employee_id from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and id=$3",
                  [c.tenantId, r.company_id, terms.override_id],
                )
              ).rows[0]?.employee_id
            : null;
      const self = (
        await client.query("select 1 from employee_user_binding where tenant_id=$1 and employee_id=$2 and user_id=$3", [
          c.tenantId,
          employee,
          c.actor.userId,
        ])
      ).rowCount;
      if (self || [r.created_by, r.submitted_by].includes(c.actor.userId))
        for (const a of ["approve", "reject"] as const) {
          const i = actions.indexOf(a);
          if (i >= 0) actions.splice(i, 1);
        }
    }
    const history = (
      await client.query(
        `select action,reason,actor_id,created_at::text as occurred_at,(override_id is not null) as override from hr_payroll_workspace_event where tenant_id=$1 and company_id=$2 and record_id=$3 order by created_at desc,id desc limit 20`,
        [c.tenantId, r.company_id, r.id],
      )
    ).rows;
    return {
      materialized_state:
        r.kind === "jurisdiction_override"
          ? ((
              await client.query(
                "select state from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and id=$3",
                [c.tenantId, r.company_id, r.id],
              )
            ).rows[0]?.state ?? null)
          : null,
      id: String(r.id),
      kind: r.kind as HrLocalizationRecord["kind"],
      status: r.state as HrLocalizationRecord["status"],
      version: Number(r.version),
      source_hash: attendanceHash(r),
      terms,
      source_reference: String(r.source_reference),
      created_by: String(r.created_by),
      bundle_hash: r.kind === "pack_release" ? attendanceHash(terms) : null,
      publication:
        r.kind === "pack_release"
          ? ((
              await client.query(
                "select artifact_hash,pack_version_id,published_at::text from hr_statutory_pack_publication where tenant_id=$1 and company_id=$2 and request_id=$3",
                [c.tenantId, r.company_id, r.id],
              )
            ).rows[0] ?? null)
          : null,
      allowed_actions: actions,
      history,
    };
  }
  async workspace(c: HrActorContext, q: HrLocalizationQuery): Promise<HrLocalizationWorkspace> {
    this.access(c, q.kind);
    return this.d.read(c, permission(q.kind, "read"), async (client) => {
      await this.d.company(client, c, q.company_id);
      if (isJurisdictionSetup(q.kind)) await requireJurisdictionSetupAuthority(client, c, q.company_id, "read");
      const rows = (
        await client.query(
          `select *,count(*) over()::int as total_count from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and kind=$3 order by created_at desc,id collate "C" limit $4 offset $5`,
          [c.tenantId, q.company_id, q.kind, q.limit, q.offset],
        )
      ).rows;
      // Keep fingerprints independent of pagination metadata.
      const items = await Promise.all(
        rows.map((r) => {
          const row = { ...r };
          delete row.total_count;
          return this.map(client, c, row);
        }),
      );
      const total =
        rows[0]?.total_count ??
        Number(
          (
            await client.query(
              "select count(*)::int as n from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and kind=$3",
              [c.tenantId, q.company_id, q.kind],
            )
          ).rows[0].n,
        );
      const scope = [c.tenantId, q.company_id, q.on_date];
      const employeeSearch = "%" + q.search.replace(/[!%_]/g, (character) => "!" + character) + "%";
      const countries = (
        await client.query(
          `select code as id,name||' ('||code||')' as label,code as country_code from country where status='active' and valid_from<=$1::date and(valid_to is null or valid_to>=$1::date) order by name limit 501`,
          [q.on_date],
        )
      ).rows;
      const jurisdictions = (
        await client.query(
          `select id,name||' ('||country_code||' / '||code||')' as label,country_code,parent_id from jurisdiction where status='active' and($2::text is null or country_code=$2) and valid_from<=$1::date and(valid_to is null or valid_to>=$1::date) order by country_code,code limit 501`,
          [q.on_date, q.country_code ?? null],
        )
      ).rows;
      const entity_types = (
        await client.query(
          `select id,name as label,country_code from legal_entity_type where status='active' and($2::text is null or country_code=$2) and valid_from<=$1::date and(valid_to is null or valid_to>=$1::date) order by country_code,name limit 501`,
          [q.on_date, q.country_code ?? null],
        )
      ).rows;
      const currencies = (
        await client.query(
          `select code as id,code||' · '||name as label from currency where tenant_id=$1 and status='active' and decimal_places<=4 order by code limit 501`,
          [c.tenantId],
        )
      ).rows;
      const work_locations = (
        await client.query(
          `select id,code||' · '||name as label from hr_master_record where tenant_id=$1 and company_id=$2 and master_type='work_location' and status='active' order by code limit 501`,
          scope.slice(0, 2),
        )
      ).rows;
      const employees =
        q.kind === "declaration" || q.kind === "jurisdiction_override"
          ? (
              await client.query(
                `select e.id,e.employee_number||' · '||concat_ws(' ',e.first_name,e.last_name) as label from employee e where e.tenant_id=$1 and(e.status='active' or $5='jurisdiction_override') and(e.employee_number ilike $4 escape '!' or concat_ws(' ',e.first_name,e.last_name) ilike $4 escape '!') and exists(select 1 from employee_assignment a left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=e.tenant_id and a.company_id=$2 and a.employee_id=e.id and a.effective_from<=case when $5='jurisdiction_override' then($3::date+interval '1 month - 1 day')::date else $3::date end and(a.effective_to is null or a.effective_to>=$3::date) and($5='declaration' or a.assignment_status='legacy_compatibility' or(a.assignment_status in('active','ended') and er.approval_state='approved' and er.status in('active','ended')))) order by e.employee_number limit 501`,
                [...scope, employeeSearch, q.kind],
              )
            ).rows
          : [];
      const legal_profiles = (
        await client.query(
          `select id,country_code||' · '||effective_from::text||' · '||id as label,country_code from company_legal_profile where tenant_id=$1 and company_id=$2 and state in('approved','active') and effective_from<=$3::date and(effective_to is null or effective_to>=$3::date) order by effective_from desc limit 501`,
          scope,
        )
      ).rows;
      const packs = (
        await client.query(
          `select v.id,p.pack_key||' · '||v.semantic_version as label,p.country_code,p.target_jurisdiction_id as jurisdiction_id from localization_pack_version v join localization_pack p on p.id=v.pack_id join localization_import_release r on r.pack_version_id=v.id and r.artifact_hash=v.artifact_hash where p.status='active' and v.status in('approved','active') and(p.publisher_scope='system' or p.publisher_tenant_id=$1) and v.effective_from<=$2::date and(v.effective_to is null or v.effective_to>=$2::date) and r.report_json->>'classification'=any($3::text[]) and r.report_json->>'execution_contract'='safe_formula_v1' order by p.pack_key,v.semantic_version limit 501`,
          [c.tenantId, q.on_date, this.mode === "test" ? ["production", "synthetic"] : ["production"]],
        )
      ).rows;
      const declarations =
        q.kind === "declaration"
          ? (
              await client.query(
                `select d.id,e.employee_number||' · '||d.tax_year||' · v'||d.version_number as label,d.employee_id,d.jurisdiction_id,d.tax_year from hr_employee_statutory_declaration d join employee e on e.tenant_id=d.tenant_id and e.id=d.employee_id where d.tenant_id=$1 and d.company_id=$2 and d.state='approved' and not exists(select 1 from hr_employee_statutory_declaration s where s.tenant_id=d.tenant_id and s.supersedes_declaration_id=d.id and s.state='approved') order by d.effective_from desc limit 501`,
                scope.slice(0, 2),
              )
            ).rows
          : [];
      const assignments =
        q.kind === "jurisdiction_override"
          ? (
              await client.query(
                `select a.id,e.employee_number||' · '||a.effective_from::text||' → '||coalesce(a.effective_to::text,'open')||' · '||a.id as label,a.employee_id,a.effective_from::text,a.effective_to::text from employee_assignment a join employee e on e.tenant_id=a.tenant_id and e.id=a.employee_id left join hr_employment_relationship er on er.tenant_id=a.tenant_id and er.id=a.employment_relationship_id where a.tenant_id=$1 and a.company_id=$2 and a.effective_from<($3::date+interval '1 month') and(a.effective_to is null or a.effective_to>=$3::date) and(a.assignment_status='legacy_compatibility' or(a.assignment_status in('active','ended') and er.approval_state='approved' and er.status in('active','ended'))) and concat_ws(' ',e.employee_number,e.first_name,e.last_name) ilike $4 escape '!' order by e.employee_number,a.id limit 501`,
                [...scope, employeeSearch],
              )
            ).rows
          : [];
      const rule_scopes =
        q.kind === "jurisdiction_override"
          ? (
              await client.query(
                `select distinct r.category as id,r.category as label from company_localization_activation a join localization_pack_version v on v.id=a.pack_version_id join localization_pack p on p.id=v.pack_id join hr_statutory_rule r on r.pack_id=p.id where a.tenant_id=$1 and a.company_id=$2 and a.state='active' and a.effective_from<($3::date+interval '1 month') and(a.effective_to is null or a.effective_to>=$3::date) and p.status='active' order by r.category limit 501`,
                scope,
              )
            ).rows
          : [];
      const overrides =
        q.kind === "jurisdiction_override_revocation"
          ? (
              await client.query(
                `select o.id,e.employee_number||' · '||o.rule_scope||' · '||o.jurisdiction_id||' · '||o.effective_from::text as label,o.employee_id,o.effective_from::text,o.effective_to::text from hr_employee_jurisdiction_override o join employee e on e.tenant_id=o.tenant_id and e.id=o.employee_id where o.tenant_id=$1 and o.company_id=$2 and o.state='approved' and concat_ws(' ',e.employee_number,e.first_name,e.last_name,o.rule_scope) ilike $3 escape '!' order by e.employee_number,o.rule_scope,o.id limit 501`,
                [c.tenantId, q.company_id, employeeSearch],
              )
            ).rows
          : [];
      const options = {
        countries,
        jurisdictions,
        entity_types,
        currencies,
        work_locations,
        employees,
        legal_profiles,
        packs,
        declarations,
        assignments,
        rule_scopes,
        overrides,
      };
      return {
        company_id: q.company_id,
        kind: q.kind,
        items,
        total,
        limit: q.limit,
        offset: q.offset,
        can_create:
          has(c, permission(q.kind, "manage")) &&
          (q.kind !== "pack_release" || has(c, "platform.localization.activate")),
        options: {
          ...Object.fromEntries(Object.entries(options).map(([k, v]) => [k, v.slice(0, 500)])),
          truncated: Object.values(options).some((v) => v.length > 500),
        } as HrLocalizationWorkspace["options"],
        notices: [
          "Approve setup before calculating Payroll. Changes to an already calculated preliminary period require recalculation. Submitted or finalized Payroll periods must first follow their correction workflow.",
          ...(!packs.length
            ? [
                "No compatible production statutory release is available. A reviewed publisher must release a supported pack before activation; synthetic test packs cannot be activated here.",
              ]
            : []),
        ],
      };
    });
  }
  private async validate(client: PoolClient, c: HrActorContext, company: string, t: HrLocalizationTerms) {
    if (isJurisdictionSetup(t.kind)) await validateJurisdictionSetup(client, c, company, t, this.mode);
    if (t.kind === "pack_release") {
      try {
        const bundle = verifyStatutoryBundle(t);
        await validateStatutoryBundleReferences(client, c.tenantId, bundle);
        const identity = statutoryBundleIdentity(c.tenantId, bundle);
        if ((await client.query("select 1 from localization_pack_version where id=$1", [identity.version_id])).rowCount)
          fail("This version is already published. Use a new semantic version.");
      } catch (error) {
        if (error instanceof PayrollCalculationError) fail(error.message);
        if (error instanceof ZodError) fail("The rule bundle does not match the supported publishing schema.");
        throw error;
      }
      return;
    }
    const end = "effective_to" in t ? t.effective_to : null,
      range = [c.tenantId, company, t.effective_from, end];
    if (
      (
        await client.query(
          `select 1 from hr_payroll_period where tenant_id=$1 and company_id=$2 and state not in('open','calculated') and(month+interval '1 month'-interval '1 day')::date>=$3::date and($4::date is null or month<=$4::date) limit 1`,
          range,
        )
      ).rowCount
    )
      fail(
        "A submitted or finalized Payroll period covers this range. Return the review or use the governed correction process.",
      );
    if (
      "currency_code" in t &&
      !(
        await client.query(
          `select 1 from currency where tenant_id=$1 and code=$2 and status='active' and decimal_places<=4`,
          [c.tenantId, t.currency_code],
        )
      ).rowCount
    )
      fail("Choose an active Finance currency with supported precision.");
    if ("jurisdiction_id" in t) {
      const j = (
        await client.query(
          `select j.country_code,j.level,c.subnational_mode,c.status as country_status from jurisdiction j join country c on c.code=j.country_code where j.id=$1 and j.status='active' and j.valid_from<=$2::date and(j.valid_to is null or j.valid_to>=coalesce($3::date,$2::date)) and c.valid_from<=$2::date and(c.valid_to is null or c.valid_to>=coalesce($3::date,$2::date))`,
          [t.jurisdiction_id, t.effective_from, end],
        )
      ).rows[0];
      if (!j || j.country_status !== "active" || ("country_code" in t && t.country_code !== j.country_code))
        fail("Choose an active jurisdiction in the selected country covering the effective range.");
    }
    if (
      t.kind === "legal_profile" &&
      !(
        await client.query(
          `select 1 from legal_entity_type where id=$1 and country_code=$2 and status='active' and valid_from<=$3::date and(valid_to is null or valid_to>=coalesce($4::date,$3::date))`,
          [t.legal_entity_type_id, t.country_code, t.effective_from, end],
        )
      ).rowCount
    )
      fail("Choose a matching active legal-entity type.");
    if (
      t.kind === "work_location" &&
      !(
        await client.query(
          `select 1 from hr_master_record where tenant_id=$1 and company_id=$2 and id=$3 and master_type='work_location' and status='active'`,
          [c.tenantId, company, t.work_location_id],
        )
      ).rowCount
    )
      fail("Choose an active work location belonging to this company.");
    if (t.kind === "activation") {
      const pack = (
        await client.query(
          `select 1 from localization_pack_version v join localization_pack p on p.id=v.pack_id join localization_import_release r on r.pack_version_id=v.id and r.artifact_hash=v.artifact_hash join company_legal_profile l on l.tenant_id=$1 and l.company_id=$2 and l.id=$3 and l.country_code=p.country_code where v.id=$4 and p.target_jurisdiction_id=$5 and p.status='active' and v.status in('approved','active') and l.state in('approved','active') and(p.publisher_scope='system' or p.publisher_tenant_id=$1) and r.report_json->>'classification'=any($8::text[]) and r.report_json->>'execution_contract'='safe_formula_v1' and v.effective_from<=$6::date and(v.effective_to is null or v.effective_to>=coalesce($7::date,$6::date)) and l.effective_from<=$6::date and(l.effective_to is null or l.effective_to>=coalesce($7::date,$6::date))`,
          [
            c.tenantId,
            company,
            t.legal_profile_id,
            t.pack_version_id,
            t.jurisdiction_id,
            t.effective_from,
            end,
            this.mode === "test" ? ["production", "synthetic"] : ["production"],
          ],
        )
      ).rowCount;
      if (!pack)
        fail("Activation requires a matching reviewed legal profile and compatible immutable production release.");
    }
    if (t.kind === "declaration") {
      if (
        !(
          await client.query(
            `select 1 from employee e join employee_assignment a on a.tenant_id=e.tenant_id and a.employee_id=e.id where e.tenant_id=$1 and a.company_id=$2 and e.id=$3 and e.status='active' and a.effective_from<=$4::date and(a.effective_to is null or a.effective_to>=$4::date)`,
            [c.tenantId, company, t.employee_id, t.effective_from],
          )
        ).rowCount
      )
        fail("The declaration employee needs an effective placement in this company.");
      const previous = (
        await client.query(
          `select id,effective_from::text from hr_employee_statutory_declaration d where tenant_id=$1 and company_id=$2 and employee_id=$3 and jurisdiction_id=$4 and tax_year=$5 and state='approved' and not exists(select 1 from hr_employee_statutory_declaration s where s.tenant_id=d.tenant_id and s.supersedes_declaration_id=d.id and s.state='approved')`,
          [c.tenantId, company, t.employee_id, t.jurisdiction_id, t.tax_year],
        )
      ).rows;
      if (
        previous.length > 1 ||
        (previous.length === 1 &&
          (previous[0].id !== t.supersedes_declaration_id || previous[0].effective_from >= t.effective_from)) ||
        (!previous.length && t.supersedes_declaration_id)
      )
        fail("A declaration revision must name the latest approved predecessor and begin later.");
    }
  }
  async create(c: HrActorContext, input: CreateHrLocalization, key: string, corr: string) {
    this.access(c, input.terms.kind);
    if (input.terms.kind === "pack_release" && !has(c, "platform.localization.activate")) deny();
    return this.writes.runWrite(
      c,
      input.company_id,
      permission(input.terms.kind, "manage"),
      key,
      corr,
      "/api/v1/hr/payroll_localization",
      input,
      async (client) => {
        await this.validate(client, c, input.company_id, input.terms);
        const id = "localization-" + randomUUID();
        const row = (
          await client.query(
            `insert into hr_payroll_localization_request(tenant_id,company_id,id,kind,terms,source_reference,created_by) values($1,$2,$3,$4,$5::jsonb,$6,$7) returning *`,
            [
              c.tenantId,
              input.company_id,
              id,
              input.terms.kind,
              JSON.stringify(input.terms),
              input.source_reference,
              c.actor.userId,
            ],
          )
        ).rows[0];
        return { id, status: "draft", version: 1, kind: "localization", before: null, after: row };
      },
      async (client) => {
        if (isJurisdictionSetup(input.terms.kind))
          await requireJurisdictionSetupAuthority(client, c, input.company_id, "manage");
      },
    );
  }
  private async materialize(client: PoolClient, c: HrActorContext, r: Row, t: HrLocalizationTerms) {
    const base = [r.id, c.tenantId, r.company_id],
      maker = r.created_by,
      checker = c.actor.userId,
      source = r.source_reference,
      hash = attendanceHash({ terms: t, source, maker, checker });

    if (t.kind === "work_location") {
      const scope = (
        await client.query(
          `with recursive chain as(select id,parent_id,level,array[id] as path from jurisdiction where id=$1 union all select j.id,j.parent_id,j.level,c.path||j.id from jurisdiction j join chain c on c.parent_id=j.id where not j.id=any(c.path)) select exists(select 1 from chain where level='subnational') as has_region,(select subnational_mode from country where code=$2) as mode`,
          [t.jurisdiction_id, t.country_code],
        )
      ).rows[0];
      if (scope.mode === "required" && !scope.has_region)
        fail("This country requires a reviewed subnational work-location jurisdiction.");
    }
    if (t.kind === "jurisdiction_override") {
      await client.query(
        `insert into hr_employee_jurisdiction_override(id,tenant_id,company_id,employee_id,employee_assignment_id,rule_scope,country_code,jurisdiction_id,legal_basis,reason,evidence_reference,effective_from,effective_to,state,requested_by,approved_by,approved_at,audit_reference)values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'approved',$14,$15,now(),$1)`,
        [
          ...base,
          t.employee_id,
          t.employee_assignment_id,
          t.rule_scope,
          t.country_code,
          t.jurisdiction_id,
          t.legal_basis,
          source,
          t.evidence_reference,
          t.effective_from,
          t.effective_to,
          maker,
          checker,
        ],
      );
      return;
    }
    if (t.kind === "jurisdiction_override_revocation") {
      await client.query(
        "update hr_employee_jurisdiction_override set state='revoked',revoked_by=$4,revoked_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3 and state='approved'",
        [c.tenantId, r.company_id, t.override_id, checker],
      );
      return;
    }
    if (t.kind === "legal_profile")
      await client.query(
        `insert into company_legal_profile(id,tenant_id,company_id,country_code,registered_jurisdiction_id,legal_entity_type_id,effective_from,effective_to,state,created_by,submitted_by,submitted_at,approved_by,approved_at) values($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$9,$10,$11,now())`,
        [
          ...base,
          t.country_code,
          t.jurisdiction_id,
          t.legal_entity_type_id,
          t.effective_from,
          t.effective_to,
          maker,
          r.submitted_at,
          checker,
        ],
      );
    else if (t.kind === "payroll_configuration") {
      if (
        (
          await client.query(
            `select 1 from company_payroll_configuration where tenant_id=$1 and company_id=$2 and status in('approved','active') and effective_from<=coalesce($4::date,'infinity'::date) and(effective_to is null or effective_to>=$3::date)`,
            [c.tenantId, r.company_id, t.effective_from, t.effective_to],
          )
        ).rowCount
      )
        fail("An approved Payroll configuration already covers this range.");
      await client.query(
        `insert into company_payroll_configuration(id,tenant_id,company_id,payroll_currency,payroll_frequency,effective_from,effective_to,status) values($1,$2,$3,$4,'monthly',$5,$6,'approved')`,
        [...base, t.currency_code, t.effective_from, t.effective_to],
      );
    } else if (t.kind === "work_location")
      await client.query(
        `insert into hr_work_location_profile(id,tenant_id,company_id,work_location_id,country_code,jurisdiction_id,effective_from,effective_to,state,created_by,submitted_by,submitted_at,approved_by,approved_at) values($1,$2,$3,$4,$5,$6,$7,$8,'approved',$9,$9,$10,$11,now())`,
        [
          ...base,
          t.work_location_id,
          t.country_code,
          t.jurisdiction_id,
          t.effective_from,
          t.effective_to,
          maker,
          r.submitted_at,
          checker,
        ],
      );
    else if (t.kind === "activation")
      await client.query(
        `insert into company_localization_activation(id,tenant_id,company_id,legal_profile_id,target_jurisdiction_id,pack_version_id,effective_from,effective_to,state,approved_by,approved_at) values($1,$2,$3,$4,$5,$6,$7,$8,'active',$9,now())`,
        [...base, t.legal_profile_id, t.jurisdiction_id, t.pack_version_id, t.effective_from, t.effective_to, checker],
      );
    else if (t.kind === "parameter") {
      await client.query(
        `insert into hr_company_statutory_parameter(id,tenant_id,company_id,jurisdiction_id,scheme_code,parameter_key,amount,currency_code,effective_from,effective_to,source_reference,evidence_hash,state,created_by,submitted_by,submitted_at,approved_by,approved_at) values($1,$2,$3,$4,'eobi','contribution_base',$5,$6,$7,$8,$9,$10,'approved',$11,$11,$12,$13,now())`,
        [
          ...base,
          t.jurisdiction_id,
          t.amount,
          t.currency_code,
          t.effective_from,
          t.effective_to,
          source,
          hash,
          maker,
          r.submitted_at,
          checker,
        ],
      );
    } else if (t.kind === "declaration") {
      const version = t.supersedes_declaration_id
        ? Number(
            (
              await client.query(
                "select version_number from hr_employee_statutory_declaration where tenant_id=$1 and company_id=$2 and id=$3",
                [c.tenantId, r.company_id, t.supersedes_declaration_id],
              )
            ).rows[0]?.version_number,
          ) + 1
        : 1;
      await client.query(
        `insert into hr_employee_statutory_declaration(id,tenant_id,company_id,employee_id,jurisdiction_id,tax_year,version_number,effective_from,supersedes_declaration_id,currency_code,estimated_annual_salary,prior_taxable_salary,prior_salary_tax_withheld,documented_tax_credit,other_tax_withheld,eobi_applicability,provincial_social_security_status,source_reference,evidence_hash,state,created_by,submitted_by,submitted_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,NULL,'submitted',$19,$19,$20)`,
        [
          ...base,
          t.employee_id,
          t.jurisdiction_id,
          t.tax_year,
          version,
          t.effective_from,
          t.supersedes_declaration_id,
          t.currency_code,
          t.estimated_annual_salary,
          t.prior_taxable_salary,
          t.prior_salary_tax_withheld,
          t.documented_tax_credit,
          t.other_tax_withheld,
          t.eobi_applicability,
          t.provincial_social_security_status,
          source,
          maker,
          r.submitted_at,
        ],
      );
      await client.query(
        `update hr_employee_statutory_declaration set state='approved',approved_by=$3,approved_at=now(),evidence_hash=$4 where tenant_id=$1 and id=$2`,
        [c.tenantId, r.id, checker, hash],
      );
    }
  }
  async action(c: HrActorContext, id: string, input: HrLocalizationDecision, key: string, corr: string) {
    return this.writes.runWrite(
      c,
      input.company_id,
      "hr.payroll.setup.read",
      key,
      corr,
      "/api/v1/hr/payroll_localization/" + id + "/actions",
      input,
      async (client) => {
        const row = (
          await client.query(
            `select * from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and id=$3 for update`,
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (!row) throw new HrApiError(404, "HR_LOCALIZATION_NOT_FOUND", "The statutory setup request was not found.");
        this.access(c, row.kind);
        if (row.kind === "pack_release" && !has(c, "platform.localization.activate")) deny();
        const required = permission(row.kind, input.action === "submit" ? "manage" : "approve");
        if (!has(c, required)) deny();
        const before = await this.map(client, c, row);
        if (before.version !== input.expected_version || before.source_hash !== input.source_hash)
          fail("The statutory setup source changed. Refresh and review it again.");
        if (
          isJurisdictionSetup(String(row.kind)) &&
          row.state === "submitted" &&
          input.action !== "submit" &&
          !before.allowed_actions.includes(input.action)
        )
          deny();
        if (!before.allowed_actions.includes(input.action)) fail("This decision is unavailable for the current state.");
        const t = before.terms;
        let override: string | null = null;
        if (input.action === "submit") {
          if (row.created_by !== c.actor.userId) deny();
        } else {
          const subjects =
            t.kind === "declaration" ||
            t.kind === "jurisdiction_override" ||
            t.kind === "jurisdiction_override_revocation"
              ? (
                  await client.query(
                    "select user_id from employee_user_binding where tenant_id=$1 and employee_id=$2",
                    [
                      c.tenantId,
                      t.kind === "jurisdiction_override_revocation"
                        ? (
                            await client.query(
                              "select employee_id from hr_employee_jurisdiction_override where tenant_id=$1 and company_id=$2 and id=$3",
                              [c.tenantId, input.company_id, t.override_id],
                            )
                          ).rows[0]?.employee_id
                        : t.employee_id,
                    ],
                  )
                ).rows.map((r) => r.user_id)
              : [];
          const makers = [String(row.created_by), String(row.submitted_by), ...subjects],
            evaluation = evaluateApprovalActor({
              account: c.actor,
              normalDecisionPermission: required,
              makerActorIds: makers,
            });
          if (evaluation.kind === "forbidden" || (evaluation.kind === "override" && !input.confirm_override)) deny();
          // Native statutory facts enforce independent maker/checker identities as well.
          if (
            t.kind === "declaration" ||
            t.kind === "parameter" ||
            t.kind === "pack_release" ||
            isJurisdictionSetup(t.kind)
          ) {
            if (makers.includes(c.actor.userId)) deny();
          }
          override = await this.d.override(client, c, {
            normalDecisionPermission: required,
            makerActorIds: makers,
            resourceType: "hr_payroll_localization_request",
            resourceId: id,
            decisionAction: input.action === "approve" ? "approve" : "reject",
            reason: input.reason,
            correlationId: corr,
            idempotencyKey: key,
          });
        }
        if (input.action !== "reject") await this.validate(client, c, input.company_id, t);
        if (input.action === "approve" && t.kind !== "pack_release") await this.materialize(client, c, row, t);
        const state = input.action === "submit" ? "submitted" : input.action === "approve" ? "approved" : "rejected";
        const after = (
          await client.query(
            `update hr_payroll_localization_request set state=$4,version=version+1,submitted_by=case when $4='submitted' then $5 else submitted_by end,submitted_at=case when $4='submitted' then now() else submitted_at end,decided_by=case when $4 in('approved','rejected') then $5 else null end,decided_at=case when $4 in('approved','rejected') then clock_timestamp() else null end where tenant_id=$1 and company_id=$2 and id=$3 returning *`,
            [c.tenantId, input.company_id, id, state, c.actor.userId],
          )
        ).rows[0];
        return {
          id,
          status: state,
          version: Number(after.version),
          kind: "localization",
          before: row,
          after,
          override,
        };
      },
      async (client) => {
        const r = (
          await client.query(
            "select kind from hr_payroll_localization_request where tenant_id=$1 and company_id=$2 and id=$3",
            [c.tenantId, input.company_id, id],
          )
        ).rows[0];
        if (r && isJurisdictionSetup(r.kind))
          await requireJurisdictionSetupAuthority(
            client,
            c,
            input.company_id,
            input.action === "submit" ? "manage" : "approve",
          );
      },
    );
  }
}
