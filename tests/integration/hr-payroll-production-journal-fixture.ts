import type { BeforePayrollAttendanceClose } from "./hr-payroll-run-fixture.js";
import { randomUUID } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createPublisherFixture, publisherActor } from "./hr-payroll-publisher-fixture.js";
import { publishApprovedStatutoryPack } from "../../server/api/src/modules/hr/payroll-statutory-publisher.js";
import { grantJournalFixtureAuthority, journalActor } from "./hr-payroll-journal-fixture.js";
import { ensureCompanyCurrencyFixture, sourceTestTenantId as tenant } from "./source-security-fixture.js";
import type { HrPayrollJournalAction, HrPayrollRunAction } from "../../packages/contracts/src/hr/index.js";
/** Artificial production-classification path, isolated DB only; no legal rates or normal-company business facts. */
export async function createProductionJournalFixture(
  pool: DatabasePool,
  beforeCalculate?: (fixture: Awaited<ReturnType<typeof createPublisherFixture>>) => Promise<void>,
  beforeAttendanceClose?: BeforePayrollAttendanceClose,
) {
  const f = await createPublisherFixture(pool, beforeAttendanceClose),
    profile = await f.prepareCompany(),
    published = await publishApprovedStatutoryPack(
      pool,
      await f.proposal({ ...f.bundle, classification: "production" }),
    );
  await f.approve({
    kind: "activation",
    legal_profile_id: profile,
    jurisdiction_id: f.jurisdiction,
    pack_version_id: published.pack_version_id,
    effective_from: f.month,
    effective_to: null,
  });
  const query = { company_id: f.companyId, month: f.month };
  const runAction = async (
    action: HrPayrollRunAction["action"],
    extra: Partial<HrPayrollRunAction> = {},
    who = "r06.maker",
  ) => {
    const w = await f.repo.getPayrollRunWorkspace(publisherActor(who), query);
    return f.repo.actOnPayrollRun(
      publisherActor(who),
      {
        ...query,
        action,
        reason: "Isolated normal statutory executor acceptance",
        source_hash: w.source_hash,
        expected_version: w.period?.version ?? 0,
        confirm_override: false,
        ...extra,
      },
      randomUUID(),
      "production-journal-test",
    );
  };
  await runAction("policy", {
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    net_payable_account_id: f.liability,
  });
  let w = await f.repo.getPayrollRunWorkspace(publisherActor(), query);
  await runAction("open", { policy_id: w.policies[0]!.id });
  if (beforeCalculate) await beforeCalculate(f);
  await runAction("calculate");
  w = await f.repo.getPayrollRunWorkspace(publisherActor(), query);
  if (w.blocked.length) throw Error(w.blocked.join(" "));
  await runAction("submit");
  await runAction("approve", {}, "r06.checker");
  await grantJournalFixtureAuthority(pool, f.companyId);
  await pool.query(
    `insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.target',$3,false,'r06.last-admin-a','governed_administration','isolated-production-journal')`,
    [tenant, randomUUID(), f.companyId],
  );
  const calendar = randomUUID();
  await pool.query(
    `insert into fiscal_calendar(id,tenant_id,company_id,year,period_start,period_end,status) values($1,$2,$3,extract(year from current_date)::int,date_trunc('year',current_date)::date,(date_trunc('year',current_date)+interval '1 year - 1 day')::date,'active')`,
    [calendar, tenant, f.companyId],
  );
  await pool.query(
    `insert into financial_period(id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at) values($1,$2,$3,$4,extract(month from current_date)::int,date_trunc('month',current_date)::date,(date_trunc('month',current_date)+interval '1 month - 1 day')::date,'open',now())`,
    [randomUUID(), tenant, f.companyId, calendar],
  );
  // Keep Finance setup independent of test ordering, without changing an existing base authority.
  if (
    !(await pool.query("select 1 from currency where tenant_id=$1 and is_base and status='active'", [tenant])).rowCount
  )
    await pool.query(
      "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','Synthetic base currency',2,true,'active') on conflict(tenant_id,code) do update set is_base=true,status='active'",
      [tenant],
    );
  const base = (
    await pool.query(
      "select code from currency where tenant_id=$1 and is_base and status='active' order by code limit 1",
      [tenant],
    )
  ).rows[0].code;
  await ensureCompanyCurrencyFixture(pool, f.companyId, base, ["PKR"]);
  if (base !== "PKR")
    await pool.query(
      `insert into currency_rate(id,tenant_id,company_id,source_currency,target_currency,rate,effective_date,created_at)
       values($1,$2,$3,'PKR',$4,1,current_date,now()) on conflict do nothing`,
      [randomUUID(), tenant, f.companyId, base],
    );
  const read = async (who = "r06.maker") => f.repo.getPayrollJournalWorkspace(journalActor(who), query);
  const act = async (action: HrPayrollJournalAction["action"], who = "r06.maker") => {
    const view = await read(who);
    return f.repo.actOnPayrollJournal(
      journalActor(who),
      {
        ...query,
        action,
        posting_date: view.posting_date,
        expected_version: view.proposal?.version ?? 0,
        source_hash: view.source_hash,
        reason: "Isolated production-classification Finance accrual",
      },
      randomUUID(),
      "production-journal-test",
    );
  };
  return { ...f, query, journalRead: read, journalAction: act };
}
