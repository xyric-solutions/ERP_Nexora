import { createHash, randomUUID } from "node:crypto";
import type { Pool, PoolClient } from "pg";
import {
  bankTransferDetailSchema,
  bankTransferDirectorySchema,
  bankTransferMutationResultSchema,
  bankTransferOptionsSchema,
  bankTransferPostingResultSchema,
  bankTransferReversalResultSchema,
  type BankTransferDetail,
  type BankTransferDirectory,
  type BankTransferDirectoryQuery,
  type BankTransferLineInput,
  type BankTransferMutationResult,
  type BankTransferOptions,
  type BankTransferOptionsQuery,
  type BankTransferPostingResult,
  type BankTransferReversalResult,
  type BankTransferState,
  type BankWorkflowOptionQuery,
  type BankWorkflowOptions,
  type CreateBankTransferRequest,
  type DecideBankTransferRequest,
  type PostBankTransferRequest,
  type ReassignBankApproverRequest,
  type ReverseBankTransferRequest,
  type SubmitBankTransferRequest,
  type UpdateBankTransferRequest,
} from "@nexora/contracts";
import { evaluateApprovalActor } from "@nexora/auth";
import {
  createFinanceTransactionClient,
  FinancePostingError,
  FinancePostingService,
  parseFinanceDecimal,
  convertFinanceAmountToBase,
} from "../../finance/posting/index.js";
import {
  CompanyCurrencyAuthorityError,
  resolveCompanyBaseCurrency,
  resolveCompanyCurrencyAuthority,
} from "../../finance/currencies/company-authority.js";
import { writeApprovalOverrideEvent, ApprovalOverrideWriterError } from "../../security/approval-override-writer.js";
import { bankDecisionEvidence } from "../decision-evidence.js";
import {
  bankContextDetail,
  bankWorkflowOptions,
  delegatedBankDecisionGrant,
  globalBankOverride,
  recordBankAssignmentIntervention,
  recordBankDelegatedDecision,
  requireAssignedBankDecision,
  updatedBankContext,
  validateBankApprover,
} from "../workflow-context.js";
import { BankingApiError, type BankingActorContext } from "../source-repository.js";

interface TransferHeaderRow {
  id: string;
  company_id: string;
  reference: string;
  posting_date: string | Date;
  value_date: string | Date | null;
  base_currency: string;
  fx_policy_id: string;
  fx_policy_version: string | number;
  fx_gain_nominal_id: string;
  fx_loss_nominal_id: string;
  rounding_nominal_id: string;
  bank_charge_nominal_id: string;
  rounding_tolerance: string;
  total_base_amount: string;
  project_id: string | null;
  location_id: string | null;
  approver_user_id: string | null;
  state: BankTransferState;
  row_version: string | number;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  rejected_by: string | null;
  rejected_at: string | Date | null;
  decision_reason: string | null;
  approval_override_event_id: string | null;
  delegated_decision_id: string | null;
  approver_reassignment_id: string | null;
  posted_by: string | null;
  posted_at: string | Date | null;
  original_period_id: string | null;
  original_accounting_event_id: string | null;
  original_journal_entry_id: string | null;
  reversed_by: string | null;
  reversed_at: string | Date | null;
  reversal_reason: string | null;
  reversal_period_id: string | null;
  reversal_accounting_event_id: string | null;
  reversal_journal_entry_id: string | null;
}
interface BankRow {
  id: string;
  reference: string;
  account_name: string;
  bank_name: string | null;
  account_number_masked: string | null;
  currency: string;
  decimal_places: number;
  account_id: string;
  ledger_account_code: string;
  ledger_account_name: string;
}
interface RateRow {
  id: string;
  rate: string;
  effective_date: string;
}
interface PolicyRow {
  id: string;
  row_version: string | number;
  fx_gain_nominal_id: string;
  fx_loss_nominal_id: string;
  rounding_nominal_id: string;
  bank_charge_nominal_id: string;
  rounding_tolerance: string;
}
interface ResolvedLine {
  id: string;
  line_order: number;
  document_date: string;
  from_bank_account_id: string;
  external_reference: string | null;
  transfer_mode: BankTransferLineInput["transfer_mode"];
  to_bank_account_id: string;
  details: string | null;
  source_amount: string;
  bank_charge_amount: string;
  source_currency: string;
  destination_currency: string;
  destination_amount: string;
  source_rate_id: string | null;
  source_rate: string;
  source_rate_effective_date: string | null;
  destination_rate_id: string | null;
  destination_rate: string;
  destination_rate_effective_date: string | null;
  source_base_amount: string;
  destination_base_amount: string;
  bank_charge_base_amount: string;
  fx_difference: string;
  from_control_account_id: string;
  from_control_account_code: string;
  from_control_account_name: string;
  to_control_account_id: string;
  to_control_account_code: string;
  to_control_account_name: string;
}
interface StoredTransferLineRow extends ResolvedLine {
  transfer_id: string;
}

const amountScale = 8,
  rateScale = 18,
  pow = (n: number) => 10n ** BigInt(n);
const format = (value: bigint, scale = amountScale) => {
  const sign = value < 0n ? "-" : "",
    digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
};
const compactDecimal = (value: string) =>
  value.includes(".") ? value.replace(/0+$/, "").replace(/\.$/, "") || "0" : value;
const dateOnly = (value: string | Date | null) =>
  value === null ? null : (value instanceof Date ? value.toISOString() : value).slice(0, 10);
const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([k, v]) => [k, canonical(v)]),
        )
      : value;
const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
const roundNativeFromBase = (base: bigint, rate: bigint, decimals: number) => {
  const unit = pow(amountScale - decimals),
    denominator = rate * unit;
  return ((base * pow(rateScale) + denominator / 2n) / denominator) * unit;
};
const sum = (values: string[]) =>
  values.reduce(
    (total, value) =>
      total + parseFinanceDecimal(value, { fractionalDigits: amountScale, integerDigits: 30, allowZero: true }).scaled,
    0n,
  );

export class SourceBankTransferRepository {
  constructor(
    private readonly pool: Pool,
    private readonly finance = new FinancePostingService(),
  ) {}

  private claim(context: BankingActorContext, permission: string) {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission))
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Bank Transfer operation.",
      );
  }
  private async scoped(client: PoolClient, context: BankingActorContext, permission: string, company: string) {
    this.claim(context, permission);
    const allowed = await client.query<{ allowed: boolean }>(
      "select bank_has_live_permission($1,$2,$3,$4) as allowed",
      [context.tenantId, company, context.actor.userId, permission],
    );
    if (!allowed.rows[0]?.allowed)
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your live permission scope.");
  }
  private async tx<T>(
    context: BankingActorContext,
    mutation: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (mutation && (context.realActorId || context.impersonationRequestId))
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Bank Transfer operations are disabled during impersonation.",
      );
    const client = await this.pool.connect();
    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [context.tenantId]);
      await client.query("select set_config('nexora.user_id',$1,true)", [context.actor.userId]);
      await client.query("select pg_advisory_xact_lock_shared(hashtextextended($1,0))", [
        `nexora:security:admin:${context.tenantId}`,
      ]);
      const result = await work(client);
      await client.query("commit");
      return result;
    } catch (error) {
      await client.query("rollback");
      if (error instanceof BankingApiError) throw error;
      if (error instanceof FinancePostingError) throw this.mapFinance(error);
      if (error instanceof ApprovalOverrideWriterError)
        throw new BankingApiError(error.code.includes("IDEMPOTENCY") ? 409 : 403, error.code, error.message);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      )
        throw new BankingApiError(
          409,
          "TRANSFER_AUTHORITY_CONFLICT",
          "Transfer master data, workflow authority, or a concurrent change conflicted. Refresh and retry.",
        );
      throw error;
    } finally {
      client.release();
    }
  }
  private mapFinance(error: FinancePostingError) {
    const status = error.status >= 500 ? 500 : error.status;
    return new BankingApiError(status, `TRANSFER_${error.code}`, error.message);
  }
  private version(row: TransferHeaderRow, expected: number) {
    if (Number(row.row_version) !== expected)
      throw new BankingApiError(409, "TRANSFER_VERSION_CONFLICT", "The Bank Transfer changed. Reload and retry.");
  }
  private async header(client: PoolClient, context: BankingActorContext, id: string, lock = false) {
    const result = await client.query<TransferHeaderRow>(
      `select * from bank_transfer where tenant_id=$1 and id=$2${lock ? " for update" : ""}`,
      [context.tenantId, id],
    );
    const row = result.rows[0];
    if (!row) throw new BankingApiError(404, "TRANSFER_NOT_FOUND", "The Bank Transfer was not found.");
    await this.scoped(client, context, "banking.transfer.read", row.company_id);
    return row;
  }
  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    path: string,
    input: unknown,
    key: string,
    parse: (value: unknown) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/.test(key))
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:transfer:${context.tenantId}:${context.actor.userId}:${path}:${key}`,
    ]);
    const fingerprint = hash(input),
      prior = (
        await client.query<{ request_fingerprint: string; response_body: unknown }>(
          "select request_fingerprint,response_body from platform_admin_idempotency where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4",
          [context.tenantId, context.actor.userId, path, key],
        )
      ).rows[0];
    if (prior) {
      if (prior.request_fingerprint !== fingerprint)
        throw new BankingApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
      return parse(prior.response_body);
    }
    const result = await work();
    await client.query(
      "insert into platform_admin_idempotency(tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag) values($1,$2,'POST',$3,$4,$5,200,$6,$7)",
      [context.tenantId, context.actor.userId, path, key, fingerprint, JSON.stringify(result), `"${hash(result)}"`],
    );
    return result;
  }

  private async audit(
    client: PoolClient,
    context: BankingActorContext,
    correlation: string,
    action: string,
    id: string,
    before: unknown,
    after: unknown,
    approval: string | null = null,
  ) {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:platform:audit:${context.tenantId}`,
    ]);
    const previous = (
        await client.query<{ sequence: string; event_hash: string }>(
          "select sequence,event_hash from platform_admin_audit_event where tenant_id=$1 order by sequence desc limit 1",
          [context.tenantId],
        )
      ).rows[0],
      occurred = new Date().toISOString(),
      event = {
        id: `bank-transfer-event-${randomUUID()}`,
        tenant_id: context.tenantId,
        sequence: Number(previous?.sequence ?? 0) + 1,
        actor_id: context.actor.userId,
        correlation_id: correlation,
        action,
        entity_type: "bank_transfer",
        entity_id: id,
        before_hash: hash(before),
        after_hash: hash(after),
        source_reference: `bank-transfer:${id}`,
        approval_reference: approval,
        occurred_at: occurred,
        previous_event_hash: previous?.event_hash ?? hash({ genesis: context.tenantId }),
      };
    await client.query(
      "insert into platform_admin_audit_event(id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)",
      [
        event.id,
        event.tenant_id,
        event.sequence,
        event.actor_id,
        event.correlation_id,
        event.action,
        event.entity_type,
        event.entity_id,
        event.before_hash,
        event.after_hash,
        event.source_reference,
        event.approval_reference,
        event.occurred_at,
        event.previous_event_hash,
        hash(event),
      ],
    );
    return { id: event.id, occurred };
  }
  private async event(
    client: PoolClient,
    context: BankingActorContext,
    row: TransferHeaderRow,
    type: string,
    reason: string | null,
    correlation: string,
    audit: { id: string; occurred: string },
  ) {
    await client.query(
      "insert into bank_transfer_event(tenant_id,company_id,id,transfer_id,event_type,actor_id,record_version,reason,correlation_id,occurred_at) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        context.tenantId,
        row.company_id,
        audit.id,
        row.id,
        type,
        context.actor.userId,
        row.row_version,
        reason,
        correlation,
        audit.occurred,
      ],
    );
  }

  private async bank(client: PoolClient, tenant: string, company: string, id: string): Promise<BankRow> {
    const row = (
      await client.query<BankRow>(
        `select bank.id,bank.reference,bank.account_name,nullif(bank.bank_name,'') as bank_name,bank.account_number_masked,bank.currency,currency.decimal_places,bank.account_id,ledger.code as ledger_account_code,ledger.name as ledger_account_name from bank_account bank join account ledger on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id join currency on currency.tenant_id=bank.tenant_id and currency.code=bank.currency and currency.status='active' where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active' and ledger.status='active' and not ledger.is_header and ledger.manual_posting_allowed and ledger.reconciliation_required for share of bank,ledger,currency`,
        [tenant, company, id],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(
        400,
        "TRANSFER_BANK_ACCOUNT_INVALID",
        "Select an active same-company Bank Account with an approved control nominal.",
      );
    return row;
  }
  private async rate(
    client: PoolClient,
    tenant: string,
    company: string,
    currency: string,
    base: string,
    date: string,
  ): Promise<RateRow> {
    try {
      const authority = await resolveCompanyCurrencyAuthority(client, {
        tenantId: tenant,
        companyId: company,
        sourceCurrency: currency,
        effectiveOnOrBefore: date,
      });
      if (authority.baseCurrency !== base)
        throw new BankingApiError(
          409,
          "TRANSFER_BASE_CURRENCY_INVALID",
          "The company base currency changed while resolving this Transfer.",
        );
      return {
        id: authority.rateId ?? "",
        rate: authority.rateValue,
        effective_date: authority.rateEffectiveDate ?? "",
      };
    } catch (error) {
      if (!(error instanceof CompanyCurrencyAuthorityError)) throw error;
      if (error.code === "COMPANY_CURRENCY_RATE_MISSING")
        throw new BankingApiError(400, "TRANSFER_FX_RATE_UNAVAILABLE", error.message);
      if (error.code === "COMPANY_CURRENCY_INACTIVE")
        throw new BankingApiError(400, "TRANSFER_CURRENCY_INVALID", error.message);
      throw new BankingApiError(409, "TRANSFER_BASE_CURRENCY_INVALID", error.message);
    }
  }
  private async policy(client: PoolClient, tenant: string, company: string): Promise<PolicyRow> {
    const row = (
      await client.query<PolicyRow>(
        "select id,row_version,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,bank_charge_nominal_id,rounding_tolerance::text from bank_transfer_fx_policy where tenant_id=$1 and company_id=$2 for share",
        [tenant, company],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(
        409,
        "TRANSFER_FX_POLICY_REQUIRED",
        "Configure the company Transfer/FX policy before creating Transfers.",
      );
    return row;
  }
  private async resolveLines(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    base: string,
    postingDate: string,
    inputs: readonly BankTransferLineInput[],
  ): Promise<ResolvedLine[]> {
    const output: ResolvedLine[] = [],
      baseDecimals = await this.baseDecimals(client, context.tenantId, company, base);
    for (const input of [...inputs].sort((a, b) => a.line_order - b.line_order)) {
      if (input.document_date > postingDate)
        throw new BankingApiError(
          400,
          "TRANSFER_LINE_DATE_INVALID",
          "A Transfer line date cannot be after its posting date.",
        );
      const from = await this.bank(client, context.tenantId, company, input.from_bank_account_id),
        to = await this.bank(client, context.tenantId, company, input.to_bank_account_id);
      if (from.id === to.id)
        throw new BankingApiError(
          400,
          "TRANSFER_BANKS_MUST_DIFFER",
          "Source and destination Bank Accounts must differ.",
        );
      const sourceRate = await this.rate(
          client,
          context.tenantId,
          company,
          from.currency,
          base,
          input.document_date,
        ),
        destinationRate = await this.rate(
          client,
          context.tenantId,
          company,
          to.currency,
          base,
          input.document_date,
        );
      const source = parseFinanceDecimal(input.source_amount, {
          fractionalDigits: amountScale,
          integerDigits: 30,
          allowZero: false,
        }),
        charge = parseFinanceDecimal(input.bank_charge_amount, {
          fractionalDigits: amountScale,
          integerDigits: 30,
          allowZero: true,
        });
      if (source.fractionalDigits > from.decimal_places || charge.fractionalDigits > from.decimal_places)
        throw new BankingApiError(
          400,
          "TRANSFER_CURRENCY_SCALE_INVALID",
          "An amount exceeds the source Bank currency scale.",
        );
      const sourceRateValue = parseFinanceDecimal(sourceRate.rate, {
          fractionalDigits: rateScale,
          integerDigits: 20,
          allowZero: false,
        }),
        destinationRateValue = parseFinanceDecimal(destinationRate.rate, {
          fractionalDigits: rateScale,
          integerDigits: 20,
          allowZero: false,
        });
      const sourceBase = convertFinanceAmountToBase(source.scaled, sourceRateValue.scaled, baseDecimals),
        chargeBase = convertFinanceAmountToBase(charge.scaled, sourceRateValue.scaled, baseDecimals),
        destination = roundNativeFromBase(sourceBase, destinationRateValue.scaled, to.decimal_places),
        destinationBase = convertFinanceAmountToBase(destination, destinationRateValue.scaled, baseDecimals);
      output.push({
        id: `transfer-line-${randomUUID()}`,
        line_order: input.line_order,
        document_date: input.document_date,
        from_bank_account_id: from.id,
        external_reference: input.external_reference ?? null,
        transfer_mode: input.transfer_mode,
        to_bank_account_id: to.id,
        details: input.details ?? null,
        source_amount: source.canonical,
        bank_charge_amount: charge.canonical,
        source_currency: from.currency,
        destination_currency: to.currency,
        destination_amount: format(destination),
        source_rate_id: from.currency === base ? null : sourceRate.id,
        source_rate: sourceRateValue.canonical,
        source_rate_effective_date: from.currency === base ? null : sourceRate.effective_date,
        destination_rate_id: to.currency === base ? null : destinationRate.id,
        destination_rate: destinationRateValue.canonical,
        destination_rate_effective_date: to.currency === base ? null : destinationRate.effective_date,
        source_base_amount: format(sourceBase),
        destination_base_amount: format(destinationBase),
        bank_charge_base_amount: format(chargeBase),
        fx_difference: format(destinationBase - sourceBase),
        from_control_account_id: from.account_id,
        from_control_account_code: from.ledger_account_code,
        from_control_account_name: from.ledger_account_name,
        to_control_account_id: to.account_id,
        to_control_account_code: to.ledger_account_code,
        to_control_account_name: to.ledger_account_name,
      });
    }
    return output;
  }
  private async baseDecimals(client: PoolClient, tenant: string, company: string, base: string) {
    try {
      const authority = await resolveCompanyBaseCurrency(client, tenant, company);
      if (authority.code !== base)
        throw new BankingApiError(
          409,
          "TRANSFER_BASE_CURRENCY_INVALID",
          "The company base currency changed while resolving this Transfer.",
        );
      return authority.decimalPlaces;
    } catch (error) {
      if (error instanceof CompanyCurrencyAuthorityError)
        throw new BankingApiError(409, "TRANSFER_BASE_CURRENCY_INVALID", error.message);
      throw error;
    }
  }
  private async base(client: PoolClient, tenant: string, company: string) {
    try {
      return (await resolveCompanyBaseCurrency(client, tenant, company)).code;
    } catch (error) {
      if (error instanceof CompanyCurrencyAuthorityError)
        throw new BankingApiError(409, "TRANSFER_BASE_CURRENCY_INVALID", error.message);
      throw error;
    }
  }
  private async persistLines(
    client: PoolClient,
    context: BankingActorContext,
    company: string,
    transfer: string,
    lines: ResolvedLine[],
  ) {
    for (const line of lines)
      await client.query(
        `insert into bank_transfer_line(tenant_id,company_id,id,transfer_id,line_order,document_date,from_bank_account_id,to_bank_account_id,external_reference,mode,details,source_currency,destination_currency,source_amount,destination_amount,source_rate_id,source_rate_value,source_rate_effective_date,destination_rate_id,destination_rate_value,destination_rate_effective_date,source_base_amount,destination_base_amount,bank_charge_amount,bank_charge_base_amount,fx_difference,source_control_nominal_id,destination_control_nominal_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28)`,
        [
          context.tenantId,
          company,
          line.id,
          transfer,
          line.line_order,
          line.document_date,
          line.from_bank_account_id,
          line.to_bank_account_id,
          line.external_reference,
          line.transfer_mode,
          line.details,
          line.source_currency,
          line.destination_currency,
          line.source_amount,
          line.destination_amount,
          line.source_rate_id,
          line.source_rate,
          line.source_rate_effective_date,
          line.destination_rate_id,
          line.destination_rate,
          line.destination_rate_effective_date,
          line.source_base_amount,
          line.destination_base_amount,
          line.bank_charge_amount,
          line.bank_charge_base_amount,
          line.fx_difference,
          line.from_control_account_id,
          line.to_control_account_id,
        ],
      );
  }
  private mutation(row: TransferHeaderRow, audit: string, replayed = false): BankTransferMutationResult {
    return bankTransferMutationResultSchema.parse({
      id: row.id,
      reference: row.reference,
      state: row.state,
      version: Number(row.row_version),
      audit_event_id: audit,
      replayed,
    });
  }
  private async allocateReference(client: PoolClient, tenant: string, company: string, date: string) {
    const year = (
      await client.query<{ year: number }>(
        "select year from fiscal_calendar where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end",
        [tenant, company, date],
      )
    ).rows;
    if (year.length !== 1)
      throw new BankingApiError(
        409,
        "TRANSFER_FISCAL_CALENDAR_UNAVAILABLE",
        "Exactly one fiscal calendar must cover the posting date.",
      );
    const result = await client.query<{ value: string }>(
      `insert into bank_transfer_sequence(tenant_id,company_id,fiscal_year,next_value) values($1,$2,$3,2) on conflict(tenant_id,company_id,fiscal_year) do update set next_value=bank_transfer_sequence.next_value+1 returning (next_value-1)::text as value`,
      [tenant, company, year[0]!.year],
    );
    return `BT-${year[0]!.year}-${result.rows[0]!.value.padStart(6, "0")}`;
  }

  async options(context: BankingActorContext, query: BankTransferOptionsQuery): Promise<BankTransferOptions> {
    this.claim(context, "banking.transfer.read");
    return this.tx(context, false, async (client) => {
      await this.scoped(client, context, "banking.transfer.read", query.company_id);
      const rows = await client.query(
        `select bank.id,bank.reference,bank.account_name,nullif(bank.bank_name,'') as bank_name,bank.account_number_masked,bank.currency,ledger.code as ledger_account_code,ledger.name as ledger_account_name from bank_account bank join account ledger on ledger.tenant_id=bank.tenant_id and ledger.id=bank.account_id where bank.tenant_id=$1 and bank.company_id=$2 and bank.status='active' and ledger.status='active' order by bank.account_name,bank.id limit 200`,
        [context.tenantId, query.company_id],
      );
      return bankTransferOptionsSchema.parse({
        bank_accounts: rows.rows,
        transfer_modes: [
          { value: "internal", label: "Internal transfer" },
          { value: "local_bank", label: "Local bank" },
          { value: "wire_swift", label: "Wire / SWIFT" },
          { value: "standing_order", label: "Standing order" },
        ],
      });
    });
  }
  async workflowOptions(context: BankingActorContext, query: BankWorkflowOptionQuery): Promise<BankWorkflowOptions> {
    this.claim(context, "banking.transfer.read");
    return this.tx(context, false, async (client) => {
      await this.scoped(client, context, "banking.transfer.read", query.company_id);
      return bankWorkflowOptions(client, context, "transfer", query);
    });
  }

  async create(
    context: BankingActorContext,
    input: CreateBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferMutationResult> {
    this.claim(context, "banking.transfer.create");
    return this.tx(context, true, async (client) => {
      await this.scoped(client, context, "banking.transfer.create", input.company_id);
      return this.idempotent(
        client,
        context,
        "/api/v1/banking/transfers",
        input,
        key,
        (v) => bankTransferMutationResultSchema.parse(v),
        async () => {
          const base = await this.base(client, context.tenantId, input.company_id),
            policy = await this.policy(client, context.tenantId, input.company_id),
            lines = await this.resolveLines(client, context, input.company_id, base, input.posting_date, input.lines);
          await validateBankApprover(
            client,
            context,
            "transfer",
            input.company_id,
            input.approver_user_id,
            [context.actor.userId],
            false,
          );
          const id = `bank-transfer-${randomUUID()}`,
            reference = await this.allocateReference(client, context.tenantId, input.company_id, input.posting_date),
            total = format(sum(lines.map((line) => line.destination_base_amount)));
          await client.query(
            `insert into bank_transfer(id,tenant_id,company_id,reference,posting_date,value_date,base_currency,fx_policy_id,fx_policy_version,fx_gain_nominal_id,fx_loss_nominal_id,rounding_nominal_id,bank_charge_nominal_id,rounding_tolerance,total_base_amount,project_id,location_id,approver_user_id,state,row_version,created_by) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'draft',1,$19)`,
            [
              id,
              context.tenantId,
              input.company_id,
              reference,
              input.posting_date,
              input.value_date ?? null,
              base,
              policy.id,
              policy.row_version,
              policy.fx_gain_nominal_id,
              policy.fx_loss_nominal_id,
              policy.rounding_nominal_id,
              policy.bank_charge_nominal_id,
              policy.rounding_tolerance,
              total,
              input.project_id ?? null,
              input.location_id ?? null,
              input.approver_user_id ?? null,
              context.actor.userId,
            ],
          );
          await this.persistLines(client, context, input.company_id, id, lines);
          const row = await this.header(client, context, id, true),
            audit = await this.audit(client, context, correlation, "banking.transfer.create", id, null, row);
          await this.event(client, context, row, "draft_created", null, correlation, audit);
          return this.mutation(row, audit.id);
        },
      );
    });
  }

  private async lineInputs(
    client: PoolClient,
    tenant: string,
    company: string,
    id: string,
  ): Promise<BankTransferLineInput[]> {
    return (
      await client.query<BankTransferLineInput>(
        "select line_order,document_date::text,from_bank_account_id,external_reference,mode as transfer_mode,to_bank_account_id,details,source_amount::text,bank_charge_amount::text from bank_transfer_line where tenant_id=$1 and company_id=$2 and transfer_id=$3 order by line_order",
        [tenant, company, id],
      )
    ).rows;
  }
  async update(
    context: BankingActorContext,
    id: string,
    input: UpdateBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferMutationResult> {
    this.claim(context, "banking.transfer.update");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}`,
        input,
        key,
        (v) => bankTransferMutationResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.update", previous.company_id);
          this.version(previous, input.expected_version);
          if (previous.state !== "draft")
            throw new BankingApiError(409, "TRANSFER_NOT_EDITABLE", "Only a draft Bank Transfer can be edited.");
          const ctx = updatedBankContext(previous, input),
            posting = input.posting_date ?? dateOnly(previous.posting_date)!,
            value = input.value_date === undefined ? dateOnly(previous.value_date) : input.value_date,
            base = await this.base(client, context.tenantId, previous.company_id),
            policy = await this.policy(client, context.tenantId, previous.company_id),
            lines = await this.resolveLines(
              client,
              context,
              previous.company_id,
              base,
              posting,
              input.lines ?? (await this.lineInputs(client, context.tenantId, previous.company_id, id)),
            );
          await validateBankApprover(
            client,
            context,
            "transfer",
            previous.company_id,
            ctx.approver_user_id,
            [previous.created_by],
            false,
          );
          await client.query("delete from bank_transfer_line where tenant_id=$1 and company_id=$2 and transfer_id=$3", [
            context.tenantId,
            previous.company_id,
            id,
          ]);
          const total = format(sum(lines.map((line) => line.destination_base_amount)));
          await client.query(
            `update bank_transfer set posting_date=$4,value_date=$5,base_currency=$6,fx_policy_id=$7,fx_policy_version=$8,fx_gain_nominal_id=$9,fx_loss_nominal_id=$10,rounding_nominal_id=$11,bank_charge_nominal_id=$12,rounding_tolerance=$13,total_base_amount=$14,project_id=$15,location_id=$16,approver_user_id=$17,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
            [
              context.tenantId,
              previous.company_id,
              id,
              posting,
              value,
              base,
              policy.id,
              policy.row_version,
              policy.fx_gain_nominal_id,
              policy.fx_loss_nominal_id,
              policy.rounding_nominal_id,
              policy.bank_charge_nominal_id,
              policy.rounding_tolerance,
              total,
              ctx.project_id,
              ctx.location_id,
              ctx.approver_user_id,
            ],
          );
          await this.persistLines(client, context, previous.company_id, id, lines);
          const row = await this.header(client, context, id, true),
            audit = await this.audit(client, context, correlation, "banking.transfer.update", id, previous, row);
          await this.event(client, context, row, "draft_updated", null, correlation, audit);
          return this.mutation(row, audit.id);
        },
      ),
    );
  }

  async submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferMutationResult> {
    this.claim(context, "banking.transfer.submit");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}/submit`,
        input,
        key,
        (v) => bankTransferMutationResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.submit", previous.company_id);
          this.version(previous, input.expected_version);
          if (previous.state !== "draft")
            throw new BankingApiError(409, "TRANSFER_NOT_SUBMITTABLE", "Only a draft Bank Transfer can be submitted.");
          await validateBankApprover(
            client,
            context,
            "transfer",
            previous.company_id,
            previous.approver_user_id,
            [previous.created_by, context.actor.userId],
            true,
          );
          await client.query(
            "update bank_transfer set state='submitted',submitted_by=$4,submitted_at=clock_timestamp(),row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, previous.company_id, id, context.actor.userId],
          );
          const row = await this.header(client, context, id, true),
            audit = await this.audit(client, context, correlation, "banking.transfer.submit", id, previous, row);
          await this.event(client, context, row, "submitted", null, correlation, audit);
          return this.mutation(row, audit.id);
        },
      ),
    );
  }

  async decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferMutationResult> {
    this.claim(context, "banking.transfer.approve");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}/decision`,
        input,
        key,
        (v) => bankTransferMutationResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.approve", previous.company_id);
          this.version(previous, input.expected_version);
          if (previous.state !== "submitted")
            throw new BankingApiError(409, "TRANSFER_NOT_DECIDABLE", "Only a submitted Bank Transfer can be decided.");
          const intervention = await requireAssignedBankDecision(client, context, "transfer", previous),
            evidence = bankDecisionEvidence(input, "Bank Transfer"),
            grant = await delegatedBankDecisionGrant(client, context, "transfer", previous),
            self = [previous.created_by, previous.submitted_by].includes(context.actor.userId);
          let overrideId: string | null = null,
            delegatedId: string | null = null;
          if (self && !grant) {
            const actor = evaluateApprovalActor({
              account: context.actor,
              makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
              normalDecisionPermission: "banking.transfer.approve",
              impersonated: false,
            });
            if (actor.kind !== "override")
              throw new BankingApiError(
                403,
                "TRANSFER_APPROVER_SEPARATION_REQUIRED",
                "An independent approver or governed self-approval grant is required.",
              );
            overrideId = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
                normalDecisionPermission: "banking.transfer.approve",
                resourceType: "banking.transfer",
                resourceId: id,
                decisionAction: input.action,
                reason: evidence.reason,
                correlationId: correlation,
                idempotencyKey: `${key}:approval-override`,
                metadata: {
                  company_id: previous.company_id,
                  transfer_reference: previous.reference,
                  expected_version: input.expected_version,
                },
                impersonated: false,
              })
            ).eventId;
          }
          if (grant) delegatedId = `bank-transfer-decision-${randomUUID()}`;
          const next = input.action === "approve" ? "approved" : "rejected",
            actorColumn = input.action === "approve" ? "approved_by" : "rejected_by",
            timeColumn = input.action === "approve" ? "approved_at" : "rejected_at";
          await client.query(
            `update bank_transfer set state=$4,${actorColumn}=$5,${timeColumn}=clock_timestamp(),decision_reason=$6,approval_override_event_id=$7,delegated_decision_id=$8,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3`,
            [
              context.tenantId,
              previous.company_id,
              id,
              next,
              context.actor.userId,
              evidence.reason,
              overrideId,
              delegatedId,
            ],
          );
          const row = await this.header(client, context, id, true),
            audit = await this.audit(
              client,
              context,
              correlation,
              `banking.transfer.${input.action}`,
              id,
              previous,
              row,
              overrideId,
            );
          if (grant && delegatedId)
            await recordBankDelegatedDecision(
              client,
              context,
              "transfer",
              row,
              input.action,
              grant,
              delegatedId,
              audit.id,
            );
          if (intervention) await recordBankAssignmentIntervention(client, context, "transfer", row, audit.id);
          await this.event(client, context, row, next, evidence.reason, correlation, audit);
          return this.mutation(row, audit.id);
        },
      ),
    );
  }

  async reassign(
    context: BankingActorContext,
    id: string,
    input: ReassignBankApproverRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferMutationResult> {
    this.claim(context, "banking.transfer.reassign");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}/approver`,
        input,
        key,
        (v) => bankTransferMutationResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.reassign", previous.company_id);
          await this.scoped(client, context, "banking.transfer.approve", previous.company_id);
          this.version(previous, input.expected_version);
          if (previous.state !== "submitted")
            throw new BankingApiError(409, "TRANSFER_NOT_REASSIGNABLE", "Only a submitted Transfer can be reassigned.");
          if (!(await globalBankOverride(client, context, previous.company_id)))
            throw new BankingApiError(
              403,
              "TRANSFER_REASSIGNMENT_DENIED",
              "A global administrator is required to reassign an approver.",
            );
          await validateBankApprover(
            client,
            context,
            "transfer",
            previous.company_id,
            input.approver_user_id,
            [previous.created_by, previous.submitted_by ?? ""],
            true,
          );
          const evidenceId = `bank-transfer-reassignment-${randomUUID()}`;
          await client.query(
            "update bank_transfer set approver_user_id=$4,approver_reassignment_id=$5,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [context.tenantId, previous.company_id, id, input.approver_user_id, evidenceId],
          );
          const row = await this.header(client, context, id, true),
            audit = await this.audit(client, context, correlation, "banking.transfer.reassign", id, previous, row);
          await client.query(
            "insert into bank_approver_reassignment(tenant_id,company_id,id,transaction_kind,transfer_id,record_version,previous_user_id,assigned_user_id,actor_id,audit_event_id) values($1,$2,$3,'transfer',$4,$5,$6,$7,$8,$9)",
            [
              context.tenantId,
              previous.company_id,
              evidenceId,
              id,
              row.row_version,
              previous.approver_user_id,
              input.approver_user_id,
              context.actor.userId,
              audit.id,
            ],
          );
          await this.event(
            client,
            context,
            row,
            "approver_reassigned",
            "Approver reassigned by a global administrator.",
            correlation,
            audit,
          );
          return this.mutation(row, audit.id);
        },
      ),
    );
  }

  private async storedLines(client: PoolClient, tenant: string, company: string, id: string): Promise<ResolvedLine[]> {
    const rows = await client.query(
      `select line.id,line.line_order,line.document_date::text,line.from_bank_account_id,line.external_reference,line.mode as transfer_mode,line.to_bank_account_id,line.details,line.source_amount::text,line.bank_charge_amount::text,line.source_currency,line.destination_currency,line.destination_amount::text,line.source_rate_id,line.source_rate_value::text as source_rate,line.source_rate_effective_date::text,line.destination_rate_id,line.destination_rate_value::text as destination_rate,line.destination_rate_effective_date::text,line.source_base_amount::text,line.destination_base_amount::text,line.bank_charge_base_amount::text,line.fx_difference::text,line.source_control_nominal_id as from_control_account_id,source.code as from_control_account_code,source.name as from_control_account_name,line.destination_control_nominal_id as to_control_account_id,destination.code as to_control_account_code,destination.name as to_control_account_name from bank_transfer_line line join account source on source.tenant_id=line.tenant_id and source.id=line.source_control_nominal_id join account destination on destination.tenant_id=line.tenant_id and destination.id=line.destination_control_nominal_id where line.tenant_id=$1 and line.company_id=$2 and line.transfer_id=$3 order by line.line_order`,
      [tenant, company, id],
    );
    return rows.rows as ResolvedLine[];
  }

  private async storedLinesFor(
    client: PoolClient,
    tenant: string,
    company: string,
    ids: readonly string[],
  ): Promise<Map<string, ResolvedLine[]>> {
    const grouped = new Map<string, ResolvedLine[]>();
    if (ids.length === 0) return grouped;
    const rows = await client.query<StoredTransferLineRow>(
      `select line.transfer_id,line.id,line.line_order,line.document_date::text,line.from_bank_account_id,line.external_reference,line.mode as transfer_mode,line.to_bank_account_id,line.details,line.source_amount::text,line.bank_charge_amount::text,line.source_currency,line.destination_currency,line.destination_amount::text,line.source_rate_id,line.source_rate_value::text as source_rate,line.source_rate_effective_date::text,line.destination_rate_id,line.destination_rate_value::text as destination_rate,line.destination_rate_effective_date::text,line.source_base_amount::text,line.destination_base_amount::text,line.bank_charge_base_amount::text,line.fx_difference::text,line.source_control_nominal_id as from_control_account_id,source.code as from_control_account_code,source.name as from_control_account_name,line.destination_control_nominal_id as to_control_account_id,destination.code as to_control_account_code,destination.name as to_control_account_name from bank_transfer_line line join account source on source.tenant_id=line.tenant_id and source.id=line.source_control_nominal_id join account destination on destination.tenant_id=line.tenant_id and destination.id=line.destination_control_nominal_id where line.tenant_id=$1 and line.company_id=$2 and line.transfer_id=any($3::text[]) order by line.transfer_id,line.line_order`,
      [tenant, company, ids],
    );
    for (const { transfer_id: transferId, ...line } of rows.rows) {
      const current = grouped.get(transferId) ?? [];
      current.push(line);
      grouped.set(transferId, current);
    }
    return grouped;
  }
  private financeLines(row: TransferHeaderRow, lines: ResolvedLine[]) {
    const result: Array<{
      accountId: string;
      debit: string;
      credit: string;
      currency: string;
      exchangeRateId: string | null;
      exchangeRateValue: string;
      exchangeRateDate: string | null;
      dimensions: Record<string, string>;
      description: string;
      sourceMetadata: Record<string, string | number | boolean | null>;
    }> = [];
    const tolerance = parseFinanceDecimal(row.rounding_tolerance, {
      fractionalDigits: amountScale,
      integerDigits: 30,
      allowZero: true,
    }).scaled;
    for (const line of lines) {
      const metadata = {
        transfer_line_id: line.id,
        line_order: line.line_order,
        from_bank_account_id: line.from_bank_account_id,
        to_bank_account_id: line.to_bank_account_id,
      };
      result.push(
        {
          accountId: line.to_control_account_id,
          debit: compactDecimal(line.destination_amount),
          credit: "0",
          currency: line.destination_currency,
          exchangeRateId: line.destination_rate_id,
          exchangeRateValue: line.destination_rate,
          exchangeRateDate: line.destination_rate_effective_date,
          dimensions: {},
          description: line.details ?? `Bank Transfer ${row.reference}`,
          sourceMetadata: { ...metadata, role: "destination_bank", is_bank_control: true },
        },
        {
          accountId: line.from_control_account_id,
          debit: "0",
          credit: compactDecimal(line.source_amount),
          currency: line.source_currency,
          exchangeRateId: line.source_rate_id,
          exchangeRateValue: line.source_rate,
          exchangeRateDate: line.source_rate_effective_date,
          dimensions: {},
          description: line.details ?? `Bank Transfer ${row.reference}`,
          sourceMetadata: { ...metadata, role: "source_bank", is_bank_control: true },
        },
      );
      const charge = parseFinanceDecimal(line.bank_charge_amount, {
        fractionalDigits: amountScale,
        integerDigits: 30,
        allowZero: true,
      }).scaled;
      if (charge > 0n) {
        result.push(
          {
            accountId: line.from_control_account_id,
            debit: "0",
            credit: compactDecimal(line.bank_charge_amount),
            currency: line.source_currency,
            exchangeRateId: line.source_rate_id,
            exchangeRateValue: line.source_rate,
            exchangeRateDate: line.source_rate_effective_date,
            dimensions: {},
            description: `Bank charge · ${row.reference}`,
            sourceMetadata: { ...metadata, role: "source_bank_charge", is_bank_control: true },
          },
          {
            accountId: row.bank_charge_nominal_id,
            debit: compactDecimal(line.bank_charge_base_amount),
            credit: "0",
            currency: row.base_currency,
            exchangeRateId: null,
            exchangeRateValue: "1",
            exchangeRateDate: null,
            dimensions: {},
            description: `Bank charge · ${row.reference}`,
            sourceMetadata: { ...metadata, role: "bank_charge", is_bank_control: false },
          },
        );
      }
      const difference = parseFinanceDecimal(line.fx_difference.replace(/^-/, ""), {
        fractionalDigits: amountScale,
        integerDigits: 30,
        allowZero: true,
      }).scaled;
      if (difference > 0n) {
        const positive = !line.fx_difference.startsWith("-");
        const rounding = difference <= tolerance;
        result.push({
          accountId: rounding ? row.rounding_nominal_id : positive ? row.fx_gain_nominal_id : row.fx_loss_nominal_id,
          debit: positive ? "0" : compactDecimal(format(difference)),
          credit: positive ? compactDecimal(format(difference)) : "0",
          currency: row.base_currency,
          exchangeRateId: null,
          exchangeRateValue: "1",
          exchangeRateDate: null,
          dimensions: {},
          description: `${rounding ? "Rounding" : "FX difference"} · ${row.reference}`,
          sourceMetadata: {
            ...metadata,
            role: rounding ? "rounding" : positive ? "fx_gain" : "fx_loss",
            is_bank_control: false,
          },
        });
      }
    }
    return result;
  }

  async post(
    context: BankingActorContext,
    id: string,
    input: PostBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferPostingResult> {
    this.claim(context, "banking.transfer.post");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}/post`,
        input,
        key,
        (v) => bankTransferPostingResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.post", previous.company_id);
          this.version(previous, input.expected_version);
          if (previous.state !== "approved")
            throw new BankingApiError(409, "TRANSFER_NOT_POSTABLE", "Only an approved Bank Transfer can be posted.");
          const poster = evaluateApprovalActor({
            account: context.actor,
            makerActorIds: [previous.created_by, previous.submitted_by ?? "", previous.approved_by ?? ""],
            normalDecisionPermission: "banking.transfer.post",
            impersonated: false,
          });
          if (poster.kind === "forbidden")
            throw new BankingApiError(
              403,
              "TRANSFER_POSTER_SEPARATION_REQUIRED",
              "An independent authorized poster must post this Transfer.",
            );
          let overrideId: string | null = null;
          if (poster.kind === "override")
            overrideId = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [previous.created_by, previous.submitted_by ?? "", previous.approved_by ?? ""],
                normalDecisionPermission: "banking.transfer.post",
                resourceType: "banking.transfer",
                resourceId: id,
                decisionAction: "post",
                reason: "Governed global administrator posting segregation override",
                correlationId: correlation,
                idempotencyKey: `${key}:posting-override`,
                metadata: {
                  company_id: previous.company_id,
                  transfer_reference: previous.reference,
                  expected_version: input.expected_version,
                },
                impersonated: false,
              })
            ).eventId;
          const lines = await this.storedLines(client, context.tenantId, previous.company_id, id),
            financeClient = await createFinanceTransactionClient(client),
            posted = await this.finance.postMultiCurrency(financeClient, {
              tenantId: context.tenantId,
              companyId: previous.company_id,
              actorId: context.actor.userId,
              sourceType: "banking.transfer",
              sourceId: id,
              eventType: "bank_transfer.posted",
              externalIdempotencyKey: key,
              transactionCurrency: previous.base_currency,
              postingDate: dateOnly(previous.posting_date)!,
              payloadHashMaterial: {
                transfer_reference: previous.reference,
                transfer_version: Number(previous.row_version),
                base_total: previous.total_base_amount,
              },
              auditRef: correlation,
              lines: this.financeLines(previous, lines),
            });
          await client.query(
            "update bank_transfer set state='posted',posted_by=$4,posted_at=clock_timestamp(),original_period_id=$5,original_accounting_event_id=$6,original_journal_entry_id=$7,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [
              context.tenantId,
              previous.company_id,
              id,
              context.actor.userId,
              posted.periodId,
              posted.accountingEventId,
              posted.journalId,
            ],
          );
          const row = await this.header(client, context, id, true),
            audit = await this.audit(
              client,
              context,
              correlation,
              "banking.transfer.post",
              id,
              previous,
              row,
              overrideId,
            );
          await this.event(client, context, row, "posted", null, correlation, audit);
          return bankTransferPostingResultSchema.parse({
            ...this.mutation(row, audit.id),
            accounting_event_id: posted.accountingEventId,
            journal_id: posted.journalId,
            journal_entry_number: posted.entryNumber,
          });
        },
      ),
    );
  }

  async reverse(
    context: BankingActorContext,
    id: string,
    input: ReverseBankTransferRequest,
    key: string,
    correlation: string,
  ): Promise<BankTransferReversalResult> {
    this.claim(context, "banking.transfer.reverse");
    return this.tx(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        `/api/v1/banking/transfers/${id}/reverse`,
        input,
        key,
        (v) => bankTransferReversalResultSchema.parse(v),
        async () => {
          const previous = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.transfer.reverse", previous.company_id);
          this.version(previous, input.expected_version);
          if (
            previous.state !== "posted" ||
            !previous.original_accounting_event_id ||
            !previous.original_journal_entry_id
          )
            throw new BankingApiError(409, "TRANSFER_NOT_REVERSIBLE", "Only a posted Bank Transfer can be reversed.");
          const financeClient = await createFinanceTransactionClient(client),
            reversed = await this.finance.reverse(financeClient, {
              tenantId: context.tenantId,
              companyId: previous.company_id,
              actorId: context.actor.userId,
              sourceType: "banking.transfer",
              sourceId: id,
              eventType: "bank_transfer.reversed",
              originalEventType: "bank_transfer.posted",
              originalAccountingEventId: previous.original_accounting_event_id,
              originalJournalId: previous.original_journal_entry_id,
              externalIdempotencyKey: key,
              transactionCurrency: previous.base_currency,
              payloadHashMaterial: {
                transfer_reference: previous.reference,
                transfer_version: Number(previous.row_version),
                reason_hash: hash(input.reason),
              },
              auditRef: correlation,
            });
          await client.query(
            "update bank_transfer set state='reversed',reversed_by=$4,reversed_at=clock_timestamp(),reversal_reason=$5,reversal_period_id=$6,reversal_accounting_event_id=$7,reversal_journal_entry_id=$8,row_version=row_version+1,updated_at=clock_timestamp() where tenant_id=$1 and company_id=$2 and id=$3",
            [
              context.tenantId,
              previous.company_id,
              id,
              context.actor.userId,
              input.reason,
              reversed.periodId,
              reversed.accountingEventId,
              reversed.journalId,
            ],
          );
          const row = await this.header(client, context, id, true),
            audit = await this.audit(client, context, correlation, "banking.transfer.reverse", id, previous, row);
          await this.event(client, context, row, "reversed", input.reason, correlation, audit);
          return bankTransferReversalResultSchema.parse({
            ...this.mutation(row, audit.id),
            original_accounting_event_id: previous.original_accounting_event_id,
            original_journal_id: previous.original_journal_entry_id,
            reversal_accounting_event_id: reversed.accountingEventId,
            reversal_journal_id: reversed.journalId,
            reversal_journal_entry_number: reversed.entryNumber,
          });
        },
      ),
    );
  }

  private summary(row: TransferHeaderRow, lines: ResolvedLine[], banks: Map<string, BankRow>) {
    const totals = new Map<string, bigint>();
    for (const line of lines)
      totals.set(
        line.source_currency,
        (totals.get(line.source_currency) ?? 0n) +
          parseFinanceDecimal(line.source_amount, {
            fractionalDigits: amountScale,
            integerDigits: 30,
            allowZero: false,
          }).scaled,
      );
    const source = [
        ...new Set(
          lines.map((line) => banks.get(line.from_bank_account_id)?.account_name ?? line.from_bank_account_id),
        ),
      ]
        .join(", ")
        .slice(0, 500),
      destination = [
        ...new Set(lines.map((line) => banks.get(line.to_bank_account_id)?.account_name ?? line.to_bank_account_id)),
      ]
        .join(", ")
        .slice(0, 500);
    return {
      id: row.id,
      company_id: row.company_id,
      reference: row.reference,
      posting_date: dateOnly(row.posting_date),
      value_date: dateOnly(row.value_date),
      source_bank_summary: source,
      destination_bank_summary: destination,
      source_totals: [...totals.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([currency, amount]) => ({ currency, amount: format(amount) })),
      base_currency: row.base_currency,
      base_total: row.total_base_amount,
      line_count: lines.length,
      details_summary: lines.find((line) => line.details)?.details ?? null,
      state: row.state,
      version: Number(row.row_version),
      created_at: iso(row.created_at),
    };
  }
  private async banksFor(client: PoolClient, tenant: string, company: string, lines: ResolvedLine[]) {
    const ids = [...new Set(lines.flatMap((line) => [line.from_bank_account_id, line.to_bank_account_id]))],
      map = new Map<string, BankRow>();
    if (!ids.length) return map;
    const rows = await client.query<BankRow>(
      `select bank.id,bank.reference,bank.account_name,nullif(bank.bank_name,'') as bank_name,bank.account_number_masked,bank.currency,currency.decimal_places,bank.account_id,ledger.code as ledger_account_code,ledger.name as ledger_account_name from bank_account bank join account ledger on ledger.tenant_id=bank.tenant_id and ledger.id=bank.account_id join currency on currency.tenant_id=bank.tenant_id and currency.code=bank.currency where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=any($3::text[])`,
      [tenant, company, ids],
    );
    for (const row of rows.rows) map.set(row.id, row);
    return map;
  }

  async list(context: BankingActorContext, query: BankTransferDirectoryQuery): Promise<BankTransferDirectory> {
    this.claim(context, "banking.transfer.read");
    return this.tx(context, false, async (client) => {
      await this.scoped(client, context, "banking.transfer.read", query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id],
        filters = ["tenant_id=$1", "company_id=$2"];
      if (query.state) {
        values.push(query.state);
        filters.push(`state=$${values.length}`);
      }
      if (query.posting_date_from) {
        values.push(query.posting_date_from);
        filters.push(`posting_date>=$${values.length}::date`);
      }
      if (query.posting_date_to) {
        values.push(query.posting_date_to);
        filters.push(`posting_date<=$${values.length}::date`);
      }
      if (query.bank_account_id) {
        values.push(query.bank_account_id);
        filters.push(
          `exists(select 1 from bank_transfer_line line where line.tenant_id=bank_transfer.tenant_id and line.transfer_id=bank_transfer.id and $${values.length} in (line.from_bank_account_id,line.to_bank_account_id))`,
        );
      }
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/g, "\\$&")}%`);
        filters.push(
          `(reference ilike $${values.length} escape '\\' or exists(select 1 from bank_transfer_line line where line.tenant_id=bank_transfer.tenant_id and line.transfer_id=bank_transfer.id and (coalesce(line.details,'') ilike $${values.length} escape '\\' or coalesce(line.external_reference,'') ilike $${values.length} escape '\\')))`,
        );
      }
      const start = query.cursor ? Number(Buffer.from(query.cursor, "base64url").toString("utf8")) : 0,
        sort = {
          posting_date: "posting_date",
          reference: "reference",
          base_total: "total_base_amount",
          state: "state",
        }[query.sort_by];
      values.push(query.limit + 1, Number.isSafeInteger(start) && start >= 0 ? start : 0);
      const rows = await client.query<TransferHeaderRow>(
          `select * from bank_transfer where ${filters.join(" and ")} order by ${sort} ${query.sort_direction},id ${query.sort_direction} limit $${values.length - 1} offset $${values.length}`,
          values,
        ),
        page = rows.rows.slice(0, query.limit),
        linesByTransfer = await this.storedLinesFor(
          client,
          context.tenantId,
          query.company_id,
          page.map((row) => row.id),
        ),
        allLines = [...linesByTransfer.values()].flat(),
        banks = await this.banksFor(client, context.tenantId, query.company_id, allLines),
        items = page.map((row) => this.summary(row, linesByTransfer.get(row.id) ?? [], banks));
      return bankTransferDirectorySchema.parse({
        items,
        next_cursor:
          rows.rows.length > query.limit ? Buffer.from(String(start + query.limit)).toString("base64url") : null,
      });
    });
  }

  private async preview(client: PoolClient, tenantId: string, row: TransferHeaderRow, lines: ResolvedLine[]) {
    const ids = [
        row.fx_gain_nominal_id,
        row.fx_loss_nominal_id,
        row.rounding_nominal_id,
        row.bank_charge_nominal_id,
        ...lines.flatMap((line) => [line.from_control_account_id, line.to_control_account_id]),
      ],
      accounts = await client.query<{ id: string; code: string; name: string }>(
        "select id,code,name from account where tenant_id=$1 and company_id=$2 and id=any($3::text[])",
        [tenantId, row.company_id, ids],
      ),
      byId = new Map(accounts.rows.map((account) => [account.id, account]));
    let order = 0,
      debits = 0n,
      credits = 0n;
    const output: BankTransferDetail["accounting_preview"]["lines"] = [],
      tolerance = parseFinanceDecimal(row.rounding_tolerance, {
        fractionalDigits: amountScale,
        integerDigits: 30,
        allowZero: true,
      }).scaled;
    const push = (
      line: ResolvedLine,
      accountId: string,
      side: "debit" | "credit",
      currency: string,
      amount: string,
      base: string,
      role: "source_bank" | "destination_bank" | "fx_gain" | "fx_loss" | "rounding" | "bank_charge",
      bank: boolean,
    ) => {
      const account = byId.get(accountId);
      if (!account)
        throw new BankingApiError(
          500,
          "TRANSFER_ACCOUNTING_AUTHORITY_INVALID",
          "A Transfer accounting nominal is unavailable.",
        );
      const scaled = parseFinanceDecimal(base, {
        fractionalDigits: amountScale,
        integerDigits: 30,
        allowZero: false,
      }).scaled;
      if (side === "debit") debits += scaled;
      else credits += scaled;
      output.push({
        line_order: ++order,
        transfer_line_id: line.id,
        account_id: account.id,
        account_code: account.code,
        account_name: account.name,
        side,
        transaction_currency: currency,
        transaction_amount: amount,
        base_amount: base,
        role,
        is_bank_control: bank,
      });
    };
    for (const line of lines) {
      push(
        line,
        line.to_control_account_id,
        "debit",
        line.destination_currency,
        line.destination_amount,
        line.destination_base_amount,
        "destination_bank",
        true,
      );
      push(
        line,
        line.from_control_account_id,
        "credit",
        line.source_currency,
        line.source_amount,
        line.source_base_amount,
        "source_bank",
        true,
      );
      const charge = parseFinanceDecimal(line.bank_charge_base_amount, {
        fractionalDigits: amountScale,
        integerDigits: 30,
        allowZero: true,
      }).scaled;
      if (charge > 0n) {
        push(
          line,
          line.from_control_account_id,
          "credit",
          line.source_currency,
          line.bank_charge_amount,
          line.bank_charge_base_amount,
          "source_bank",
          true,
        );
        push(
          line,
          row.bank_charge_nominal_id,
          "debit",
          row.base_currency,
          line.bank_charge_base_amount,
          line.bank_charge_base_amount,
          "bank_charge",
          false,
        );
      }
      const signed = line.fx_difference,
        absolute = parseFinanceDecimal(signed.replace(/^-/, ""), {
          fractionalDigits: amountScale,
          integerDigits: 30,
          allowZero: true,
        }).scaled;
      if (absolute > 0n) {
        const positive = !signed.startsWith("-"),
          rounding = absolute <= tolerance;
        push(
          line,
          rounding ? row.rounding_nominal_id : positive ? row.fx_gain_nominal_id : row.fx_loss_nominal_id,
          positive ? "credit" : "debit",
          row.base_currency,
          format(absolute),
          format(absolute),
          rounding ? "rounding" : positive ? "fx_gain" : "fx_loss",
          false,
        );
      }
    }
    if (debits !== credits)
      throw new BankingApiError(
        500,
        "TRANSFER_ACCOUNTING_UNBALANCED",
        "The stored Transfer accounting preview is not balanced.",
      );
    return {
      base_currency: row.base_currency,
      lines: output,
      debit_total: format(debits),
      credit_total: format(credits),
    };
  }

  async get(context: BankingActorContext, id: string): Promise<BankTransferDetail> {
    this.claim(context, "banking.transfer.read");
    return this.tx(context, false, async (client) => {
      const row = await this.header(client, context, id),
        lines = await this.storedLines(client, context.tenantId, row.company_id, id),
        banks = await this.banksFor(client, context.tenantId, row.company_id, lines),
        events = await client.query<{
          id: string;
          event_type: string;
          actor_id: string;
          actor_label: string;
          reason: string | null;
          occurred_at: string | Date;
        }>(
          `select event.id,event.event_type,event.actor_id,coalesce(nullif(actor.display_name,''),nullif(actor.email,''),event.actor_id) as actor_label,event.reason,event.occurred_at from bank_transfer_event event left join security_user_account actor on actor.tenant_id=event.tenant_id and actor.id=event.actor_id where event.tenant_id=$1 and event.company_id=$2 and event.transfer_id=$3 order by event.occurred_at,event.id`,
          [context.tenantId, row.company_id, id],
        ),
        journal = await client.query<{ original_entry: string | null; reversal_entry: string | null }>(
          `select original.entry_number as original_entry,reversal.entry_number as reversal_entry from bank_transfer transfer left join journal_entry original on original.tenant_id=transfer.tenant_id and original.id=transfer.original_journal_entry_id left join journal_entry reversal on reversal.tenant_id=transfer.tenant_id and reversal.id=transfer.reversal_journal_entry_id where transfer.tenant_id=$1 and transfer.id=$2`,
          [context.tenantId, id],
        ),
        workflow = await bankContextDetail(client, context, row, "transfer"),
        admin = await globalBankOverride(client, context, row.company_id);
      const stateFor = (type: string): [BankTransferState | null, BankTransferState] =>
          ({
            draft_created: [null, "draft"],
            draft_updated: ["draft", "draft"],
            submitted: ["draft", "submitted"],
            approved: ["submitted", "approved"],
            rejected: ["submitted", "rejected"],
            approver_reassigned: ["submitted", "submitted"],
            posted: ["approved", "posted"],
            reversed: ["posted", "reversed"],
          })[type] as [BankTransferState | null, BankTransferState],
        actionFor = (type: string) =>
          ({ draft_created: "created", draft_updated: "updated", approver_reassigned: "updated" })[type] ?? type;
      return bankTransferDetailSchema.parse({
        ...this.summary(row, lines, banks),
        ...workflow,
        lines,
        timeline: events.rows.map((event) => {
          const states = stateFor(event.event_type);
          return {
            id: event.id,
            action: actionFor(event.event_type),
            previous_state: states[0],
            resulting_state: states[1],
            actor_id: event.actor_id,
            actor_label: event.actor_label,
            reason: event.reason,
            occurred_at: iso(event.occurred_at),
          };
        }),
        accounting_preview: await this.preview(client, context.tenantId, row, lines),
        created_by: row.created_by,
        submitted_by: row.submitted_by,
        approved_by: row.approved_by,
        rejected_by: row.rejected_by,
        posted_by: row.posted_by,
        reversed_by: row.reversed_by,
        submitted_at: iso(row.submitted_at),
        approved_at: iso(row.approved_at),
        rejected_at: iso(row.rejected_at),
        posted_at: iso(row.posted_at),
        reversed_at: iso(row.reversed_at),
        accounting_event_id: row.original_accounting_event_id,
        journal_id: row.original_journal_entry_id,
        journal_entry_number: journal.rows[0]?.original_entry ?? null,
        reversal_accounting_event_id: row.reversal_accounting_event_id,
        reversal_journal_id: row.reversal_journal_entry_id,
        reversal_journal_entry_number: journal.rows[0]?.reversal_entry ?? null,
        self_decision_requires_override: [row.created_by, row.submitted_by].includes(context.actor.userId),
        super_admin_override_allowed: admin,
      });
    });
  }
}
