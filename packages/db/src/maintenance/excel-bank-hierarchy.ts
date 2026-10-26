import { createHash, randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface ExcelBankHierarchyRequest {
  tenantId: string;
  companyId: string;
  templateId: string;
  actorId: string;
  sectionId: string;
  expectedSectionCode: string;
  expectedPolicyVersion: number;
  sourceSha256: string;
}
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const literal = (value: string) => `'${value.replaceAll("'", "''")}'`;

/** Privileged, offline maintenance. Never expose this through an application API.
 * Narrow trigger exceptions exist ONLY inside this transaction and are restored
 * before commit. Other sessions can never observe a committed relaxed guard.
 */
export async function migrateExcelBankHierarchy(pool: Pool, request: ExcelBankHierarchyRequest) {
  if (!/^[a-f0-9]{64}$/.test(request.sourceSha256) || !Number.isSafeInteger(request.expectedPolicyVersion))
    throw new Error("Explicit source hash and policy version are required.");
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query("set local lock_timeout='5s'");
    await client.query("set local statement_timeout='30s'");
    const privileged = await client.query("select rolsuper from pg_roles where rolname=current_user");
    if (privileged.rows[0]?.rolsuper !== true)
      throw new Error("A separate database maintenance administrator is required.");
    await client.query("select set_config('nexora.tenant_id',$1,true)", [request.tenantId]);
    // Global because temporary function DDL is shared; company lock also excludes
    // cooperating adoption operations. Ordinary allocation is excluded by row locks.
    await client.query("select pg_advisory_xact_lock(hashtextextended('nexora:chart-hierarchy-maintenance',0))");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:chart-adoption:${request.tenantId}:${request.companyId}`,
    ]);
    const actor = await client.query(
      `select 1 from security_user_account u
      join security_user_company_access c on c.tenant_id=u.tenant_id and c.user_id=u.id and c.company_id=$3 and c.revoked_at is null
      join security_user_role_assignment_version a on a.tenant_id=u.tenant_id and a.user_id=u.id
      join security_role_policy p on p.tenant_id=a.tenant_id and p.id=a.role_policy_id
      join security_tenant_role r on r.tenant_id=p.tenant_id and r.role_id=p.role_id
      join security_role_permission_grant g on g.tenant_id=p.tenant_id and g.role_policy_id=p.id and g.permission_key='finance.chart_template.admin'
      join security_role_scope_grant s on s.tenant_id=g.tenant_id and s.role_policy_id=g.role_policy_id and s.permission_key=g.permission_key
      where u.tenant_id=$1 and u.id=$2 and u.status='active' and u.archived_at is null
      and a.lifecycle_state='active' and a.valid_from<=now() and (a.valid_until is null or a.valid_until>now())
      and a.version=(select max(v.version) from security_user_role_assignment_version v where v.tenant_id=a.tenant_id and v.assignment_id=a.assignment_id)
      and p.status='active' and p.lifecycle_state='active' and r.lifecycle_state='active'
      and s.scope_kind='tenant' and s.scope_value=$1 limit 1`,
      [request.tenantId, request.actorId, request.companyId],
    );
    if (!actor.rowCount) throw new Error("Live template administration and company access are required.");
    const source = await client.query(
      `select n.name,n.parent_key from finance_chart_template t
      join finance_chart_template_node n on n.tenant_id=t.tenant_id and n.template_id=t.id
      where t.tenant_id=$1 and t.id=$2 and t.state='published' and t.source_sha256=$3
      and n.kind='section' and n.code='2309' and n.name='Cash and Bank' and n.account_type='asset'`,
      [request.tenantId, request.templateId, request.sourceSha256],
    );
    if (source.rowCount !== 1) throw new Error("The approved published Excel Bank section is required.");
    const requestHash = digest(request);
    const prior = await client.query(
      `select id,request_sha256 from finance_chart_hierarchy_maintenance
      where tenant_id=$1 and company_id=$2 and template_id=$3 and section_id=$4`,
      [request.tenantId, request.companyId, request.templateId, request.sectionId],
    );
    if (prior.rowCount) {
      if (prior.rows[0].request_sha256 !== requestHash)
        throw new Error("Maintenance replay conflicts with the original request.");
      await client.query("commit");
      return { id: String(prior.rows[0].id), replayed: true };
    }
    const section = await client.query(
      `select to_jsonb(a) as data from account a
      join organization_unit c on c.tenant_id=a.tenant_id and c.id=a.company_id and c.type='company' and c.status='active'
      where a.tenant_id=$1 and a.company_id=$2 and a.id=$3 for update of a`,
      [request.tenantId, request.companyId, request.sectionId],
    );
    const oldSection: Record<string, unknown> | undefined = section.rows[0]?.data;
    if (
      !oldSection ||
      oldSection.code !== request.expectedSectionCode ||
      oldSection.is_header !== true ||
      oldSection.type !== "asset" ||
      oldSection.status !== "active"
    )
      throw new Error("Section precondition changed; no migration applied.");
    const category = await client.query(
      `select id from account where tenant_id=$1 and company_id=$2 and id=$3
      and is_header and type='asset' and status='active' and name='Current Assets' for update`,
      [request.tenantId, request.companyId, oldSection.parent_id],
    );
    if (category.rowCount !== 1) throw new Error("The existing Current Assets category must be reviewed.");
    const policy = await client.query(
      `select to_jsonb(p) as data from finance_nominal_section_policy p
      where tenant_id=$1 and company_id=$2 and section_id=$3 and section_role='cash_and_bank' for update`,
      [request.tenantId, request.companyId, request.sectionId],
    );
    const oldPolicy: Record<string, unknown> | undefined = policy.rows[0]?.data;
    if (
      !oldPolicy ||
      Number(oldPolicy.row_version) !== request.expectedPolicyVersion ||
      oldPolicy.category_id !== oldSection.parent_id ||
      oldPolicy.status !== "active"
    )
      throw new Error("Bank policy precondition changed; no migration applied.");
    // No writes to these domains. Stabilize fingerprints and reject concurrent
    // financial writes for the short maintenance window rather than racing them.
    const tables = [
      "account",
      "bank_account",
      "bank_account_event",
      "finance_nominal_event",
      "bank_payment",
      "bank_payment_line",
      "bank_payment_event",
      "bank_receipt",
      "bank_receipt_line",
      "bank_receipt_event",
      "journal_entry",
      "journal_line",
    ];
    await client.query(`lock table ${tables.join(",")} in share row exclusive mode`);
    const dependencies = async () => {
      const state: Record<string, unknown> = {};
      for (const table of tables) {
        const result = await client.query(
          `select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) as rows
          from ${table} t where tenant_id=$1 ${table === "account" ? "and id<>$2" : ""}`,
          table === "account" ? [request.tenantId, request.sectionId] : [request.tenantId],
        );
        state[table] = result.rows[0].rows;
      }
      return digest(state);
    };
    const beforeHash = await dependencies();
    const sourceCodes = await client.query(
      `select code from finance_chart_template_node where tenant_id=$1 and template_id=$2
      and kind='nominal' and parent_key='section:2309' order by code`,
      [request.tenantId, request.templateId],
    );
    if (sourceCodes.rows.length !== 7 || sourceCodes.rows.some((row, index) => row.code !== `23090${index + 1}`))
      throw new Error("Unexpected workbook Bank code reservations.");
    const used = await client.query(
      `select code from account where tenant_id=$1 and company_id=$2 and (code='2309' or code ~ '^2309[0-9]{2}$')`,
      [request.tenantId, request.companyId],
    );
    if (used.rows.some((row) => row.code === "2309" || Number(String(row.code).slice(4)) <= 7))
      throw new Error(
        "A target section or reserved Bank code is already occupied; explicit identity review is required.",
      );
    const next = Math.max(8, ...used.rows.map((row) => Number(String(row.code).slice(4)) + 1));
    if (next > 99) throw new Error("The Excel Bank code range is exhausted.");
    const timestamp = (
      await client.query("select greatest(clock_timestamp(),$1::timestamptz+interval '1 microsecond')::text as value", [
        oldPolicy.updated_at,
      ])
    ).rows[0].value;
    const newSection = { ...oldSection, code: "2309", name: "Cash and Bank" };
    const newPolicy = {
      ...oldPolicy,
      prefix: "2309",
      code_width: 2,
      first_value: 1,
      last_value: 99,
      next_value: next,
      row_version: request.expectedPolicyVersion + 1,
      updated_at: timestamp,
    };
    // Let PostgreSQL normalize timestamptz JSON formatting before exact comparison.
    const normalized = (
      await client.query(
        `select to_jsonb(jsonb_populate_record(null::finance_nominal_section_policy,$1::jsonb)) as value`,
        [JSON.stringify(newPolicy)],
      )
    ).rows[0].value;
    const originals: string[] = [];
    for (const [functionName, before, after] of [
      ["finance_guard_account", oldSection, newSection],
      ["enforce_finance_nominal_policy", oldPolicy, normalized],
    ] as const) {
      const original = String(
        (await client.query("select pg_get_functiondef($1::regprocedure) as definition", [`${functionName}()`])).rows[0]
          .definition,
      );
      if (!/\bBEGIN\b/.test(original)) throw new Error("Unexpected identity guard definition.");
      originals.push(original);
      const exception = `BEGIN\n IF TG_OP='UPDATE' AND to_jsonb(OLD)=${literal(JSON.stringify(before))}::jsonb AND to_jsonb(NEW)=${literal(JSON.stringify(after))}::jsonb THEN RETURN NEW; END IF;`;
      await client.query(original.replace(/\bBEGIN\b/, exception));
    }
    await client.query(
      "update account set code='2309',name='Cash and Bank' where tenant_id=$1 and company_id=$2 and id=$3",
      [request.tenantId, request.companyId, request.sectionId],
    );
    await client.query(
      `update finance_nominal_section_policy set prefix='2309',code_width=2,first_value=1,last_value=99,next_value=$4,
      row_version=row_version+1,updated_at=$5 where tenant_id=$1 and company_id=$2 and section_id=$3`,
      [request.tenantId, request.companyId, request.sectionId, next, timestamp],
    );
    // Restore the exact original definitions before ANY commit. A failure above
    // rolls back both DDL and data. No trigger is disabled or left relaxed.
    for (const original of originals) await client.query(original);
    await client.query("set constraints all immediate");
    const finalState = await client.query(
      `select 1 from account a join finance_nominal_section_policy p
       on p.tenant_id=a.tenant_id and p.company_id=a.company_id and p.section_id=a.id
       where a.tenant_id=$1 and a.company_id=$2 and a.id=$3
       and to_jsonb(a)=$4::jsonb and to_jsonb(p)=$5::jsonb`,
      [request.tenantId, request.companyId, request.sectionId, JSON.stringify(newSection), JSON.stringify(normalized)],
    );
    if (finalState.rowCount !== 1)
      throw new Error("Final hierarchy differs from the reviewed change; maintenance rolled back.");
    if ((await dependencies()) !== beforeHash)
      throw new Error("A protected dependency changed; maintenance rolled back.");
    const id = `chart-maintenance-${randomUUID()}`;
    await client.query(
      `insert into finance_chart_hierarchy_maintenance(tenant_id,company_id,id,template_id,section_id,actor_id,request_sha256,before_state,after_state,dependency_sha256)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [
        request.tenantId,
        request.companyId,
        id,
        request.templateId,
        request.sectionId,
        request.actorId,
        requestHash,
        JSON.stringify({ section: oldSection, policy: oldPolicy }),
        JSON.stringify({ section: newSection, policy: normalized }),
        beforeHash,
      ],
    );
    await client.query("commit");
    return { id, replayed: false };
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
