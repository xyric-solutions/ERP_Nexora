import { createHash, randomUUID } from "node:crypto";
import type { PoolClient } from "pg";
import type { FinanceNominalMutationResult, UpdateFinanceNominalRequest } from "@nexora/contracts";
import type { FinanceNominalActorContext } from "./nominals/source-repository.js";
import { hasLiveCoaMasterAuthority } from "./coa-master-authority.js";

export class CoaMasterError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  return value && typeof value === "object"
    ? Object.fromEntries(
        Object.entries(value)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([k, v]) => [k, canonical(v)]),
      )
    : value;
}
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");

export async function changeCoaMaster(
  client: PoolClient,
  context: FinanceNominalActorContext,
  id: string,
  action: "created" | "updated" | "activated" | "deactivated",
  expectedVersion: number,
  correlation: string,
  fields: Pick<UpdateFinanceNominalRequest, "name" | "description" | "currency"> = {},
): Promise<FinanceNominalMutationResult> {
  const { rows } = await client.query<{
    id: string;
    company_id: string;
    code: string;
    name: string;
    description: string | null;
    is_header: boolean;
    status: string;
    managed_general_nominal: boolean;
    managed_bank_nominal: boolean;
    coa_version: string;
    parent_id: string | null;
  }>("select * from account where tenant_id=$1 and id=$2 for update", [context.tenantId, id]);
  const account = rows[0];
  if (!account) throw new CoaMasterError(404, "COA_MASTER_NOT_FOUND", "Company master account was not found.");
  if (!(await hasLiveCoaMasterAuthority(client, context, account.company_id)))
    throw new CoaMasterError(
      403,
      "COA_SUPER_ADMIN_REQUIRED",
      "Only a live global Super Admin with company access may manage Chart of Accounts masters.",
    );
  const general = account.managed_general_nominal;
  const profile = account.is_header
    ? null
    : (
        await client.query<{
          row_version: string;
          state: string;
          currency: string;
          bank_id: string | null;
          classification: string | null;
        }>(
          general
            ? `select g.row_version,g.state,g.currency,null::text as bank_id,n.posting_classification as classification from finance_general_nominal g left join finance_chart_company_node n on n.tenant_id=g.tenant_id and n.company_id=g.company_id and n.account_id=g.nominal_id where g.tenant_id=$1 and g.nominal_id=$2 for update of g`
            : `select b.row_version,b.status as state,b.currency,b.id as bank_id,null::text as classification from bank_account b where b.tenant_id=$1 and b.account_id=$2 and b.identity_mode='nominal_only' for update`,
          [context.tenantId, id],
        )
      ).rows[0];
  if (!account.is_header && !profile)
    throw new CoaMasterError(
      409,
      "COA_MASTER_RESTRICTED",
      "Legacy detailed Bank masters require their existing controlled workflow.",
    );
  const version = Number(profile?.row_version ?? account.coa_version),
    state = profile?.state ?? account.status;
  if (version !== expectedVersion)
    throw new CoaMasterError(409, "NOMINAL_VERSION_CONFLICT", "The master changed. Reload its current version.");
  if ((action === "activated" && state === "active") || (action === "deactivated" && state !== "active"))
    throw new CoaMasterError(409, "COA_STATE_CONFLICT", "The master is not in a state that supports this change.");
  if (action === "activated" && general && profile?.classification && profile.classification !== "ordinary")
    throw new CoaMasterError(
      409,
      "NOMINAL_POSTING_REVIEW_REQUIRED",
      "Unclassified or module-controlled accounts cannot be activated as ordinary nominals. Preserve classification and resolve posting ownership first.",
    );
  if (state === "closed" || state === "rejected")
    throw new CoaMasterError(
      409,
      "COA_STATE_RESTRICTED",
      "Closed or rejected records need explicit review, not automatic activation.",
    );
  const name = fields.name ?? account.name,
    currency = fields.currency ?? profile?.currency ?? null;
  if (action === "activated" && account.parent_id) {
    const parent = await client.query(
      "select 1 from account s left join account c on c.tenant_id=s.tenant_id and c.company_id=s.company_id and c.id=s.parent_id where s.tenant_id=$1 and s.company_id=$2 and s.id=$3 and s.is_header and s.status='active' and (s.parent_id is null or (c.is_header and c.status='active')) for share of s",
      [context.tenantId, account.company_id, account.parent_id],
    );
    if (!parent.rowCount)
      throw new CoaMasterError(
        409,
        "COA_PARENT_INACTIVE",
        "Activate the same-company category and section before their nominal.",
      );
  }
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:coa-name:${context.tenantId}:${account.company_id}:${account.parent_id ?? "root"}:${name.trim().toLowerCase()}`,
  ]);
  if (
    name !== account.name &&
    (
      await client.query(
        "select 1 from finance_chart_company_node where tenant_id=$1 and company_id=$2 and account_id=$3",
        [context.tenantId, account.company_id, id],
      )
    ).rowCount
  )
    throw new CoaMasterError(
      409,
      "COA_SOURCE_IDENTITY_BOUND",
      "This adopted name is bound to its approved catalog. Resolve source identity before renaming it.",
    );
  if (
    (
      await client.query(
        "select 1 from account where tenant_id=$1 and company_id=$2 and parent_id is not distinct from $3 and id<>$4 and lower(btrim(name))=lower(btrim($5))",
        [context.tenantId, account.company_id, account.parent_id, id, name],
      )
    ).rowCount
  )
    throw new CoaMasterError(409, "NOMINAL_DUPLICATE", "A master with this name already exists in the same hierarchy.");
  if (
    currency &&
    !(
      await client.query(
        `select company_currency.currency_code
           from company_currency
           join currency standard
             on standard.tenant_id=company_currency.tenant_id
            and standard.code=company_currency.currency_code
            and standard.status='active'
          where company_currency.tenant_id=$1 and company_currency.company_id=$2
            and company_currency.currency_code=$3 and company_currency.status='active'
          for share of company_currency,standard`,
        [context.tenantId, account.company_id, currency],
      )
    ).rowCount
  )
    throw new CoaMasterError(400, "NOMINAL_CURRENCY_INVALID", "Select a currency that is active for this company.");
  if (fields.currency && fields.currency !== profile?.currency) {
    const used = await client.query(
      `select 1 where
         exists(select 1 from journal_line where tenant_id=$1 and account_id=$2)
         or exists(select 1 from bank_payment_line where tenant_id=$1 and nominal_account_id=$2)
         or exists(select 1 from bank_receipt_line where tenant_id=$1 and nominal_account_id=$2)
         or exists(select 1 from bank_payment where tenant_id=$1 and bank_account_id=$3)
         or exists(select 1 from bank_receipt where tenant_id=$1 and bank_account_id=$3)
         or exists(select 1 from bank_transfer_line where tenant_id=$1 and (from_bank_account_id=$3 or to_bank_account_id=$3))
         or exists(select 1 from bank_statement_import where tenant_id=$1 and bank_account_id=$3)
         or exists(select 1 from bank_reconciliation where tenant_id=$1 and bank_account_id=$3)
         or exists(select 1 from bank_revaluation_line where tenant_id=$1 and bank_account_id=$3)`,
      [context.tenantId, id, profile?.bank_id ?? null],
    );
    if (used.rowCount)
      throw new CoaMasterError(
        409,
        "COA_CURRENCY_IN_USE",
        "Currency is immutable after transaction usage; existing financial records will not be rewritten.",
      );
  }
  if (
    account.is_header &&
    action === "deactivated" &&
    (
      await client.query("select 1 from account where tenant_id=$1 and company_id=$2 and parent_id=$3 limit 1", [
        context.tenantId,
        account.company_id,
        id,
      ])
    ).rowCount
  )
    throw new CoaMasterError(
      409,
      "COA_DEPENDENCY_EXISTS",
      "This hierarchy master has children and cannot be deactivated.",
    );
  const nextState = action === "activated" ? "active" : action === "deactivated" ? "inactive" : state;
  const accountState = nextState === "active" ? "active" : "inactive";
  const eventId = `coa-${randomUUID()}`,
    next = version + 1,
    reason = `Super Admin directly ${action} the Chart of Accounts master. No approval or posting was performed.`;
  const before = { ...account, state, currency: profile?.currency ?? null };
  await client.query(
    `insert into finance_coa_master_change(tenant_id,company_id,id,account_id,actor_id,action,record_version,resulting_state,profile_state,account_name,currency,reason,before_state) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [
      context.tenantId,
      account.company_id,
      eventId,
      id,
      context.actor.userId,
      action,
      next,
      accountState,
      nextState,
      name,
      currency,
      reason,
      JSON.stringify(before),
    ],
  );
  await client.query(
    "update account set name=$3,description=$4,status=$5,coa_version=$6,coa_change_id=$7 where tenant_id=$1 and id=$2",
    [
      context.tenantId,
      id,
      name,
      fields.description === undefined ? account.description : fields.description,
      accountState,
      next,
      eventId,
    ],
  );
  if (!account.is_header) {
    if (general)
      await client.query(
        "update finance_general_nominal set state=$3,currency=$4,row_version=$5,coa_change_id=$6,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and nominal_id=$2",
        [context.tenantId, id, nextState, currency, next, eventId],
      );
    else
      await client.query(
        "update bank_account set status=$3,account_name=$4,currency=$5,row_version=$6,coa_change_id=$7,deactivated_by=case when $3='inactive' then $8 else null end,deactivated_at=case when $3='inactive' then clock_timestamp() else null end,updated_at=greatest(clock_timestamp(),updated_at+interval '1 microsecond') where tenant_id=$1 and id=$2",
        [context.tenantId, profile!.bank_id, nextState, name, currency, next, eventId, context.actor.userId],
      );
    await client.query(
      `insert into ${general ? "finance_general_nominal_event" : "finance_nominal_event"}(tenant_id,event_id,company_id,nominal_id,${general ? "" : "bank_account_id,"}event_type,resulting_version,actor_id,reason) values(${Array.from({ length: general ? 8 : 9 }, (_, i) => "$" + (i + 1)).join(",")})`,
      [
        context.tenantId,
        `nominal-event-${randomUUID()}`,
        account.company_id,
        id,
        ...(general ? [] : [profile!.bank_id]),
        action,
        next,
        context.actor.userId,
        reason,
      ],
    );
    if (!general)
      await client.query(
        "insert into bank_account_event(tenant_id,event_id,account_id,event_type,actor_id,reason,state_snapshot) values($1,$2,$3,$4,$5,$6,$7)",
        [
          context.tenantId,
          `bank-event-${randomUUID()}`,
          profile!.bank_id,
          action,
          context.actor.userId,
          reason,
          JSON.stringify({ id: profile!.bank_id, account_id: id, state: nextState, version: next }),
        ],
      );
  }
  const after = {
    id,
    company_id: account.company_id,
    code: account.code,
    name,
    currency,
    state: nextState,
    version: next,
  };
  await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
    `nexora:platform:audit:${context.tenantId}`,
  ]);
  const latest = (
    await client.query<{ sequence: string; event_hash: string }>(
      "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
      [context.tenantId],
    )
  ).rows[0];
  const audit = {
    id: eventId,
    tenant_id: context.tenantId,
    actor_id: context.actor.userId,
    correlation_id: correlation,
    action: `finance.coa_master.${action}`,
    entity_type: "finance_nominal",
    entity_id: id,
    before_hash: hash(before),
    after_hash: hash(after),
    source_reference: "finance.coa_master",
    approval_reference: null,
    occurred_at: new Date().toISOString(),
    sequence: Number(latest?.sequence ?? 0) + 1,
    previous_event_hash: latest?.event_hash ?? hash({ genesis: context.tenantId }),
  };
  await client.query(
    "insert into platform_admin_audit_event(id,tenant_id,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,sequence,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
    [
      eventId,
      context.tenantId,
      context.actor.userId,
      correlation,
      audit.action,
      audit.entity_type,
      id,
      audit.before_hash,
      audit.after_hash,
      audit.source_reference,
      null,
      audit.occurred_at,
      audit.sequence,
      audit.previous_event_hash,
      hash(audit),
    ],
  );
  return {
    id,
    bank_account_id: profile?.bank_id ?? null,
    code: account.code,
    state: nextState as FinanceNominalMutationResult["state"],
    version: next,
    audit_event_id: eventId,
    replayed: false,
  };
}
