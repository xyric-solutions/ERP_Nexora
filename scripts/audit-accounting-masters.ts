import { createHash } from "node:crypto";
import { createDatabasePool } from "../packages/db/src/pool.js";

/** Production preflight/read-back only. Never migrates, seeds or repairs data.
 * Supply secrets through the environment; no connection URL is emitted.
 */
const url = process.env.DATABASE_URL,
  tenant = process.env.NEXORA_AUDIT_TENANT_ID,
  company = process.env.NEXORA_AUDIT_COMPANY_ID,
  actor = process.env.NEXORA_AUDIT_ACTOR_ID;
if (!url || !tenant || !company || !actor)
  throw new Error(
    "DATABASE_URL and explicit NEXORA_AUDIT_TENANT_ID, NEXORA_AUDIT_COMPANY_ID, NEXORA_AUDIT_ACTOR_ID are required.",
  );
const pool = createDatabasePool(url),
  client = await pool.connect();
try {
  await client.query("begin isolation level repeatable read read only");
  await client.query("set local statement_timeout='30s'");
  await client.query("select set_config('nexora.tenant_id',$1,true),set_config('nexora.user_id',$2,true)", [
    tenant,
    actor,
  ]);
  if (
    !(
      await client.query(
        "select 1 from security_user_company_access where tenant_id=$1 and company_id=$2 and user_id=$3 and revoked_at is null",
        [tenant, company, actor],
      )
    ).rowCount
  )
    throw new Error("The explicit audit actor does not have access to this company.");
  if (
    !(
      await client.query<{ allowed: boolean }>(
        "select bank_has_live_permission($1,$2,$3,'finance.nominal.read') as allowed",
        [tenant, company, actor],
      )
    ).rows[0]?.allowed
  )
    throw new Error("The explicit audit actor does not have current company Finance read authority.");
  const identity = (await client.query("select current_database() as database, current_user as database_role")).rows[0];
  const migrations = (
    await client.query(
      "select module_name,max(version)::int as version from nexora_schema_migration group by module_name order by module_name",
    )
  ).rows;
  const counts = (
    await client.query(
      `select count(*) filter(where is_header and parent_id is null)::int categories,
    count(*) filter(where is_header and parent_id is not null)::int sections,count(*) filter(where not is_header)::int nominals,
    count(*) filter(where status='inactive')::int inactive
    from account where tenant_id=$1 and company_id=$2`,
      [tenant, company],
    )
  ).rows[0];
  const missingParents = (
    await client.query(
      `select count(*)::int count from account a left join account p
    on p.tenant_id=a.tenant_id and p.company_id=a.company_id and p.id=a.parent_id
    where a.tenant_id=$1 and a.company_id=$2 and a.parent_id is not null and p.id is null`,
      [tenant, company],
    )
  ).rows[0].count;
  const bankMismatch = (
    await client.query(
      `select count(*)::int count from bank_account b left join account a
    on a.tenant_id=b.tenant_id and a.company_id=b.company_id and a.id=b.account_id
    where b.tenant_id=$1 and b.company_id=$2 and (a.id is null or a.is_header or a.type<>'asset')`,
      [tenant, company],
    )
  ).rows[0].count;
  const bankLinkage = (
    await client.query(
      `select
      (select count(*)::int from bank_account where tenant_id=$1 and company_id=$2) bank_records,
      (select count(*)::int from bank_account where tenant_id=$1 and company_id=$2 and status='active') active_bank_records,
      (select count(*)::int from finance_nominal_section_policy where tenant_id=$1 and company_id=$2 and section_role='cash_and_bank' and status='active') governed_cash_bank_sections,
      (select count(*)::int from account a
       join finance_nominal_section_policy p on p.tenant_id=a.tenant_id and p.company_id=a.company_id and p.section_id=a.parent_id and p.section_role='cash_and_bank' and p.status='active'
       where a.tenant_id=$1 and a.company_id=$2 and not a.is_header
       and not exists(select 1 from bank_account b where b.tenant_id=a.tenant_id and b.company_id=a.company_id and b.account_id=a.id)) unlinked_cash_bank_nominals`,
      [tenant, company],
    )
  ).rows[0];
  const setupSchemaAvailable = (
    await client.query("select to_regclass('public.finance_company_business_setup') is not null available")
  ).rows[0].available;
  const setup = setupSchemaAvailable
    ? ((
        await client.query(
          "select business_nature_key,template_id,initialized_at from finance_company_business_setup where tenant_id=$1 and company_id=$2",
          [tenant, company],
        )
      ).rows[0] ?? null)
    : null;
  async function digest(query: string) {
    const hash = createHash("sha256");
    let cursor = "",
      count = 0;
    for (;;) {
      const page = await client.query<{ id: string; record: unknown }>(query, [tenant, company, cursor]);
      for (const row of page.rows) {
        hash.update(JSON.stringify(row.record));
        hash.update("\n");
        count++;
      }
      if (page.rows.length < 500) break;
      cursor = page.rows.at(-1)!.id;
    }
    return { count, sha256: hash.digest("hex") };
  }
  const accounts =
    await digest(`select id,jsonb_build_array(id,code,name,type,parent_id,is_header,status,manual_posting_allowed,reconciliation_required) record
    from account where tenant_id=$1 and company_id=$2 and id>$3 order by id limit 500`);
  const postedLines =
    await digest(`select l.id,jsonb_build_array(l.id,l.journal_id,l.account_id,l.currency,l.debit,l.credit,l.base_debit,l.base_credit,j.posting_date,j.status) record
    from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id
    where j.tenant_id=$1 and j.company_id=$2 and j.status in('posted','reversed') and l.id>$3 order by l.id limit 500`);
  const balances = (
    await client.query(
      `select l.account_id,l.currency,sum(l.debit-l.credit)::text native_balance,
    sum(l.base_debit-l.base_credit)::text base_balance from journal_line l join journal_entry j on j.tenant_id=l.tenant_id and j.id=l.journal_id
    where j.tenant_id=$1 and j.company_id=$2 and j.status in('posted','reversed') group by l.account_id,l.currency order by l.account_id,l.currency`,
      [tenant, company],
    )
  ).rows;
  const policies = (
    await client.query(
      "select version,receivable_account_id,payable_account_id from finance_subledger_policy where tenant_id=$1 and company_id=$2 order by version desc limit 1",
      [tenant, company],
    )
  ).rows;
  await client.query("commit");
  process.stdout.write(
    JSON.stringify(
      {
        identity,
        tenant_id: tenant,
        company_id: company,
        migrations,
        counts,
        missing_parents: missingParents,
        invalid_bank_links: bankMismatch,
        bank_linkage: bankLinkage,
        business_setup_schema_available: setupSchemaAvailable,
        business_setup: setup,
        accounts,
        posted_lines: postedLines,
        balance_sha256: createHash("sha256").update(JSON.stringify(balances)).digest("hex"),
        control_policy: policies[0] ?? null,
      },
      null,
      2,
    ) + "\n",
  );
} catch (error) {
  await client.query("rollback").catch(() => undefined);
  process.stderr.write(
    "Read-only accounting audit failed. Verify database connectivity, migration state and explicit tenant/company access. No data was changed.\n",
  );
  if (error instanceof Error && error.message.startsWith("The explicit audit actor"))
    process.stderr.write(error.message + "\n");
  process.exitCode = 1;
} finally {
  client.release();
  await pool.end();
}
