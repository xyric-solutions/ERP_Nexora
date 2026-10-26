import { createHash, randomUUID } from "node:crypto";

import { evaluateApprovalActor } from "@nexora/auth";
import {
  type BankRevaluationAccountingPreview,
  bankRevaluationDetailSchema,
  bankRevaluationDirectorySchema,
  bankRevaluationEventDirectorySchema,
  bankRevaluationMutationResultSchema,
  bankRevaluationPolicyMutationSchema,
  bankRevaluationPolicySchema,
  bankRevaluationPreviewSchema,
  type BankRevaluationDetail,
  type BankRevaluationDirectory,
  type BankRevaluationDirectoryQuery,
  type BankRevaluationEventDirectory,
  type BankRevaluationEventDirectoryQuery,
  type BankRevaluationLine,
  type BankRevaluationMutationResult,
  type BankRevaluationPreview,
  type BankRevaluationPreviewRequest,
  type BankRevaluationPolicy,
  type BankRevaluationPolicyMutation,
  type BankWorkflowOptionQuery,
  type BankWorkflowOptions,
  type CreateBankRevaluationRequest,
  type DecideBankRevaluationRequest,
  type PostBankRevaluationRequest,
  type ReverseBankRevaluationRequest,
  type SubmitBankRevaluationRequest,
  type UpdateBankRevaluationRequest,
  type UpsertBankRevaluationPolicyRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../../security/approval-override-writer.js";
import {
  CompanyCurrencyAuthorityError,
  resolveCompanyCurrencyAuthority,
} from "../../finance/currencies/company-authority.js";
import { FinancePostingService } from "../../finance/posting/service.js";
import {
  createFinanceTransactionClient,
  FinancePostingError,
  type FinancePostingLine,
} from "../../finance/posting/types.js";
import { bankDecisionEvidence } from "../decision-evidence.js";
import { BankingApiError, type BankingActorContext } from "../source-repository.js";
import { bankWorkflowOptions, globalBankOverride } from "../workflow-context.js";
import { calculateBankRevaluationPortfolio } from "./calculation.js";
import type { BankingRevaluationRepository } from "./service.js";

type RevaluationState = "draft" | "submitted" | "approved" | "rejected" | "posted" | "reversed";

type HeaderRow = {
  id: string;
  company_id: string;
  voucher_number: string;
  external_reference: string | null;
  narration: string | null;
  revaluation_date: string | Date;
  base_currency: string;
  base_decimal_places: number;
  currency: string;
  rate_id: string;
  closing_rate: string;
  rate_effective_date: string | Date;
  rate_revision_version: string | number;
  policy_id: string;
  policy_version: string | number;
  unrealized_gain_nominal_id: string;
  unrealized_loss_nominal_id: string;
  source_fingerprint: string;
  foreign_balance: string;
  carrying_base_balance: string;
  revalued_base_balance: string;
  total_gain: string;
  total_loss: string;
  net_gain_loss: string;
  account_count: number;
  state: RevaluationState;
  row_version: string | number;
  maker_user_id: string;
  approver_user_id: string | null;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  decided_by: string | null;
  decided_at: string | Date | null;
  decision_reason: string | null;
  super_admin_override_used: boolean;
  decision_evidence_id: string | null;
  posted_by: string | null;
  posted_at: string | Date | null;
  journal_entry_id: string | null;
  reversal_scheduled_date: string | Date | null;
  reversal_journal_entry_id: string | null;
  reversed_at: string | Date | null;
  created_at: string | Date;
  updated_at: string | Date;
  reversal_schedule_state?: "pending" | "processing" | "posted" | "failed" | null;
};

type BalanceRow = {
  bank_account_id: string;
  bank_account_code: string;
  bank_account_name: string;
  bank_name: string;
  control_nominal_id: string;
  control_nominal_code: string;
  currency: string;
  foreign_balance: string;
  carrying_base_balance: string;
};

type StoredLineRow = BalanceRow & {
  id: string;
  revalued_base_balance: string;
  adjustment: string;
  direction: "gain" | "loss" | "none";
};

type RateEvidence = {
  id: string;
  source_currency: string;
  target_currency: string;
  rate: string;
  effective_date: string | Date;
  row_version: string | number;
};

type PolicyEvidence = {
  id: string;
  row_version: string | number;
  unrealized_gain_nominal_id: string;
  unrealized_loss_nominal_id: string;
  reversal_mode: "next_open_period_first_day";
};

type DirectoryCursor = { revaluationDate: string; voucherNumber: string; id: string };
type EventCursor = { occurredAt: string; id: string };

type PolicyRow = {
  id: string;
  company_id: string;
  unrealized_gain_nominal_id: string;
  unrealized_gain_nominal_code: string;
  unrealized_gain_nominal_name: string;
  unrealized_loss_nominal_id: string;
  unrealized_loss_nominal_code: string;
  unrealized_loss_nominal_name: string;
  reversal_mode: "next_open_period_first_day";
  status: "active" | "inactive";
  row_version: string | number;
  created_at: string | Date;
  updated_at: string | Date;
};

type EventRow = {
  id: string;
  revaluation_id: string;
  event_type:
    | "created"
    | "updated"
    | "submitted"
    | "approved"
    | "rejected"
    | "posted"
    | "reversal_scheduled"
    | "reversal_failed"
    | "reversed";
  from_state: RevaluationState | null;
  to_state: RevaluationState | null;
  actor_id: string | null;
  reason: string | null;
  super_admin_override_used: boolean;
  decision_evidence_id: string | null;
  occurred_at: string | Date;
};

const dateOnly = (value: string | Date | null): string | null =>
  value === null
    ? null
    : value instanceof Date
      ? `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1)
          .toString()
          .padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`
      : value.slice(0, 10);
const iso = (value: string | Date | null): string | null => (value === null ? null : new Date(value).toISOString());
const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, child]) => [key, canonical(child)]),
        )
      : value;
const hash = (value: unknown): string =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");

function decodeCursor(value: string): DirectoryCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<DirectoryCursor>;
    if (!parsed.revaluationDate || !parsed.voucherNumber || !parsed.id) throw new Error("invalid");
    return parsed as DirectoryCursor;
  } catch {
    throw new BankingApiError(400, "INVALID_CURSOR", "The Bank Revaluation cursor is invalid.");
  }
}

function encodeCursor(row: HeaderRow): string {
  return Buffer.from(
    JSON.stringify({
      revaluationDate: dateOnly(row.revaluation_date),
      voucherNumber: row.voucher_number,
      id: row.id,
    }),
    "utf8",
  ).toString("base64url");
}

function decodeEventCursor(value: string): EventCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<EventCursor>;
    if (!parsed.occurredAt || !parsed.id || !Number.isFinite(new Date(parsed.occurredAt).getTime()))
      throw new Error("invalid");
    return parsed as EventCursor;
  } catch {
    throw new BankingApiError(400, "INVALID_CURSOR", "The Bank Revaluation event cursor is invalid.");
  }
}

function encodeEventCursor(row: EventRow): string {
  return Buffer.from(JSON.stringify({ occurredAt: iso(row.occurred_at), id: row.id }), "utf8").toString("base64url");
}

function direction(value: string): "gain" | "loss" | "none" {
  return value.startsWith("-") ? "loss" : /^0(?:\.0+)?$/.test(value) ? "none" : "gain";
}

function reversalState(row: HeaderRow): "not_scheduled" | "pending" | "posted" | "failed" {
  if (row.reversal_journal_entry_id || row.reversal_schedule_state === "posted") return "posted";
  if (row.reversal_schedule_state === "failed") return "failed";
  if (row.reversal_schedule_state === "pending" || row.reversal_schedule_state === "processing") return "pending";
  return "not_scheduled";
}

const amountScale = 8;
const amountFactor = 100_000_000n;

function parseSignedAmount(value: string): bigint {
  const match = /^(-?)(0|[1-9]\d{0,29})(?:\.(\d{1,8}))?$/.exec(value);
  if (!match) throw new BankingApiError(500, "REVALUATION_AMOUNT_INVALID", "Stored revaluation evidence is invalid.");
  const magnitude = BigInt(match[2]!) * amountFactor + BigInt((match[3] ?? "").padEnd(amountScale, "0"));
  return match[1] === "-" ? -magnitude : magnitude;
}

function formatAmount(value: bigint): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const digits = magnitude.toString().padStart(amountScale + 1, "0");
  const formatted = `${digits.slice(0, -amountScale)}.${digits.slice(-amountScale)}`;
  return negative && magnitude !== 0n ? `-${formatted}` : formatted;
}

function compactAmount(value: bigint): string {
  const formatted = formatAmount(value);
  const compact = formatted.replace(/\.0+$/u, "").replace(/(\.\d*?)0+$/u, "$1");
  return compact === "-0" ? "0" : compact;
}

type PostingLineEvidence = {
  nominalId: string;
  nominalCode: string;
  description: string;
  debit: string;
  credit: string;
};

function authorityError(error: CompanyCurrencyAuthorityError): BankingApiError {
  const code =
    error.code === "COMPANY_CURRENCY_RATE_MISSING"
      ? "REVALUATION_RATE_MISSING"
      : error.code === "COMPANY_CURRENCY_INACTIVE"
        ? "REVALUATION_CURRENCY_INACTIVE"
        : "REVALUATION_BASE_CURRENCY_MISSING";
  return new BankingApiError(error.status, code, error.message);
}

export class SourceBankRevaluationRepository implements BankingRevaluationRepository {
  constructor(
    private readonly pool: Pool,
    private readonly finance = new FinancePostingService(),
  ) {}

  private claim(context: BankingActorContext, permission: string): void {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission)) {
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Bank Revaluation operation.",
      );
    }
  }

  private async scoped(
    client: PoolClient,
    context: BankingActorContext,
    permission: string,
    companyId: string,
  ): Promise<void> {
    this.claim(context, permission);
    const result = await client.query<{ allowed: boolean }>("select bank_has_live_permission($1,$2,$3,$4) as allowed", [
      context.tenantId,
      companyId,
      context.actor.userId,
      permission,
    ]);
    if (!result.rows[0]?.allowed)
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your live permission scope.");
  }

  private async transaction<T>(
    context: BankingActorContext,
    mutation: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (mutation && (context.realActorId || context.impersonationRequestId))
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Bank Revaluation operations are disabled during impersonation.",
      );
    const client = await this.pool.connect();
    try {
      await client.query(mutation ? "begin isolation level serializable" : "begin");
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
      if (error instanceof CompanyCurrencyAuthorityError) throw authorityError(error);
      if (error instanceof FinancePostingError) throw new BankingApiError(error.status, error.code, error.message);
      if (error instanceof ApprovalOverrideWriterError)
        throw new BankingApiError(error.code.includes("IDEMPOTENCY") ? 409 : 403, error.code, error.message);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23P01", "23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        const mapped = new BankingApiError(
          409,
          "REVALUATION_AUTHORITY_CONFLICT",
          "Bank Revaluation evidence or a concurrent change conflicted. Refresh and retry.",
        );
        Object.defineProperty(mapped, "cause", { value: error, enumerable: false });
        throw mapped;
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async approverOptions(context: BankingActorContext, query: BankWorkflowOptionQuery): Promise<BankWorkflowOptions> {
    this.claim(context, "banking.revaluation.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.revaluation.read", query.company_id);
      return bankWorkflowOptions(client, context, "revaluation", { ...query, kind: "approver" });
    });
  }

  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    method: "POST" | "PATCH",
    path: string,
    input: unknown,
    key: string,
    parse: (value: unknown, replayed: boolean) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(key))
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:revaluation:${context.tenantId}:${context.actor.userId}:${method}:${path}:${key}`,
    ]);
    const fingerprint = hash(input);
    const prior = (
      await client.query<{ request_fingerprint: string; response_body: unknown }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method=$3 and path=$4 and idempotency_key=$5`,
        [context.tenantId, context.actor.userId, method, path, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_fingerprint !== fingerprint)
        throw new BankingApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
      return parse(prior.response_body, true);
    }
    const result = await work();
    await client.query(
      `insert into platform_admin_idempotency
        (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
       values($1,$2,$3,$4,$5,$6,200,$7,$8)`,
      [
        context.tenantId,
        context.actor.userId,
        method,
        path,
        key,
        fingerprint,
        JSON.stringify(result),
        `"${hash(result)}"`,
      ],
    );
    return result;
  }

  private async header(client: PoolClient, context: BankingActorContext, id: string, lock = false): Promise<HeaderRow> {
    const row = (
      await client.query<HeaderRow>(
        `select revaluation.*,schedule.state as reversal_schedule_state
           from bank_revaluation revaluation
           left join bank_revaluation_reversal_schedule schedule
             on schedule.tenant_id=revaluation.tenant_id and schedule.company_id=revaluation.company_id
            and schedule.revaluation_id=revaluation.id
          where revaluation.tenant_id=$1 and revaluation.id=$2${lock ? " for update of revaluation" : ""}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row) throw new BankingApiError(404, "REVALUATION_NOT_FOUND", "Bank Revaluation was not found.");
    return row;
  }

  private async rateEvidence(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    rateId: string,
  ): Promise<RateEvidence> {
    const row = (
      await client.query<RateEvidence>(
        `select id,source_currency,target_currency,rate::text,effective_date,row_version
           from currency_rate
          where tenant_id=$1 and company_id=$2 and id=$3 for share`,
        [tenantId, companyId, rateId],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(409, "REVALUATION_RATE_MISSING", "The selected company rate evidence is unavailable.");
    return row;
  }

  private async policyEvidence(client: PoolClient, tenantId: string, companyId: string): Promise<PolicyEvidence> {
    const row = (
      await client.query<PolicyEvidence>(
        `select policy.id,policy.row_version,policy.unrealized_gain_nominal_id,
                policy.unrealized_loss_nominal_id,policy.reversal_mode
           from bank_revaluation_policy policy
           join account gain
             on gain.tenant_id=policy.tenant_id and gain.company_id=policy.company_id
            and gain.id=policy.unrealized_gain_nominal_id and gain.status='active'
            and not gain.is_header and gain.manual_posting_allowed and not gain.managed_bank_nominal
           join account loss
             on loss.tenant_id=policy.tenant_id and loss.company_id=policy.company_id
            and loss.id=policy.unrealized_loss_nominal_id and loss.status='active'
            and not loss.is_header and loss.manual_posting_allowed and not loss.managed_bank_nominal
          where policy.tenant_id=$1 and policy.company_id=$2 and policy.status='active'
          for share of policy,gain,loss`,
        [tenantId, companyId],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(
        409,
        "REVALUATION_POLICY_MISSING",
        "Configure an active Bank Revaluation gain and loss policy before continuing.",
      );
    return row;
  }

  private async currencyDecimalPlaces(client: PoolClient, tenantId: string, currency: string): Promise<number> {
    const row = (
      await client.query<{ decimal_places: number }>(
        `select decimal_places::integer
           from currency
          where tenant_id=$1 and code=$2 and status='active'`,
        [tenantId, currency],
      )
    ).rows[0];
    if (!row)
      throw new BankingApiError(
        409,
        "REVALUATION_BASE_CURRENCY_MISSING",
        "The active company base-currency precision is unavailable.",
      );
    return row.decimal_places;
  }

  private async validateApprover(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<HeaderRow, "company_id" | "maker_user_id" | "approver_user_id">,
  ): Promise<void> {
    if (!row.approver_user_id)
      throw new BankingApiError(400, "REVALUATION_APPROVER_REQUIRED", "Select an eligible independent approver.");
    const authority = (
      await client.query<{ allowed: boolean; self_override: boolean }>(
        `select bank_has_live_permission($1,$2,$3,'banking.revaluation.approve') as allowed,
                bank_has_live_permission($1,$2,$3,'platform.approval.override',true) as self_override`,
        [context.tenantId, row.company_id, row.approver_user_id],
      )
    ).rows[0];
    if (!authority?.allowed || (row.approver_user_id === row.maker_user_id && !authority.self_override))
      throw new BankingApiError(
        400,
        "REVALUATION_APPROVER_INELIGIBLE",
        "The selected approver is inactive, outside company scope, unauthorized, or not eligible for self-approval.",
      );
  }

  private async policyPostingEvidence(client: PoolClient, context: BankingActorContext, row: HeaderRow): Promise<void> {
    const valid = await client.query(
      `select 1
         from bank_revaluation_policy policy
         join account gain
           on gain.tenant_id=policy.tenant_id and gain.company_id=policy.company_id
          and gain.id=policy.unrealized_gain_nominal_id and gain.status='active'
          and not gain.is_header and gain.manual_posting_allowed and not gain.managed_bank_nominal
         join account loss
           on loss.tenant_id=policy.tenant_id and loss.company_id=policy.company_id
          and loss.id=policy.unrealized_loss_nominal_id and loss.status='active'
          and not loss.is_header and loss.manual_posting_allowed and not loss.managed_bank_nominal
        where policy.tenant_id=$1 and policy.company_id=$2 and policy.id=$3 and policy.row_version=$4
          and policy.status='active' and policy.unrealized_gain_nominal_id=$5
          and policy.unrealized_loss_nominal_id=$6
        for share of policy,gain,loss`,
      [
        context.tenantId,
        row.company_id,
        row.policy_id,
        Number(row.policy_version),
        row.unrealized_gain_nominal_id,
        row.unrealized_loss_nominal_id,
      ],
    );
    if (!valid.rowCount)
      throw new BankingApiError(
        409,
        "REVALUATION_POLICY_CHANGED",
        "The frozen Bank Revaluation policy is no longer active and postable.",
      );
  }

  private async postingEvidence(
    client: PoolClient,
    context: BankingActorContext,
    row: HeaderRow,
    storedLines?: BankRevaluationLine[],
  ): Promise<PostingLineEvidence[]> {
    const lines = storedLines ?? (await this.storedLines(client, context, row));
    const policyCodes = (
      await client.query<{ gain_code: string; loss_code: string }>(
        `select gain.code as gain_code,loss.code as loss_code
           from account gain
           join account loss on loss.tenant_id=gain.tenant_id and loss.company_id=gain.company_id
          where gain.tenant_id=$1 and gain.company_id=$2 and gain.id=$3 and loss.id=$4`,
        [context.tenantId, row.company_id, row.unrealized_gain_nominal_id, row.unrealized_loss_nominal_id],
      )
    ).rows[0];
    if (!policyCodes)
      throw new BankingApiError(409, "REVALUATION_POLICY_CHANGED", "The frozen policy nominals are unavailable.");
    const result: PostingLineEvidence[] = [];
    let totalGain = 0n;
    let totalLoss = 0n;
    for (const line of lines) {
      const adjustment = parseSignedAmount(line.adjustment);
      if (adjustment === 0n) continue;
      const magnitude = adjustment < 0n ? -adjustment : adjustment;
      if (adjustment > 0n) totalGain += magnitude;
      else totalLoss += magnitude;
      result.push({
        nominalId: line.control_nominal_id,
        nominalCode: line.control_nominal_code,
        description: `Bank FX revaluation ${row.voucher_number} · ${line.bank_account_code}`,
        debit: adjustment > 0n ? compactAmount(magnitude) : "0",
        credit: adjustment < 0n ? compactAmount(magnitude) : "0",
      });
    }
    if (totalGain > 0n)
      result.push({
        nominalId: row.unrealized_gain_nominal_id,
        nominalCode: policyCodes.gain_code,
        description: `Unrealized FX gain · ${row.voucher_number}`,
        debit: "0",
        credit: compactAmount(totalGain),
      });
    if (totalLoss > 0n)
      result.push({
        nominalId: row.unrealized_loss_nominal_id,
        nominalCode: policyCodes.loss_code,
        description: `Unrealized FX loss · ${row.voucher_number}`,
        debit: compactAmount(totalLoss),
        credit: "0",
      });
    if (result.length > 1_000)
      throw new BankingApiError(
        409,
        "REVALUATION_POSTING_LINE_LIMIT",
        "The Bank Revaluation exceeds the 1,000-line Finance journal limit.",
      );
    return result;
  }

  private async accountingPreview(
    client: PoolClient,
    context: BankingActorContext,
    row: HeaderRow,
    storedLines: BankRevaluationLine[],
  ): Promise<BankRevaluationAccountingPreview | null> {
    const lines = await this.postingEvidence(client, context, row, storedLines);
    if (lines.length === 0) return null;
    const period = (
      await client.query<{ id: string }>(
        `select id from financial_period
          where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end
          order by period_start,id limit 2`,
        [context.tenantId, row.company_id, dateOnly(row.revaluation_date)],
      )
    ).rows;
    if (period.length !== 1) return null;
    const debit = lines.reduce((total, line) => total + parseSignedAmount(line.debit), 0n);
    const credit = lines.reduce((total, line) => total + parseSignedAmount(line.credit), 0n);
    return {
      posting_date: dateOnly(row.revaluation_date)!,
      period_id: period[0]!.id,
      currency: row.base_currency,
      lines: lines.map((line) => ({
        nominal_id: line.nominalId,
        nominal_code: line.nominalCode,
        description: line.description,
        debit: line.debit,
        credit: line.credit,
      })),
      debit_total: compactAmount(debit),
      credit_total: compactAmount(credit),
      balanced: debit === credit,
    };
  }

  private async insertEvent(
    client: PoolClient,
    context: BankingActorContext,
    row: HeaderRow,
    input: {
      eventType: "updated" | "submitted" | "approved" | "rejected" | "posted" | "reversal_scheduled" | "reversed";
      fromState: RevaluationState;
      reason: string | null;
      correlationId: string;
      superAdminOverrideUsed?: boolean;
      decisionEvidenceId?: string | null;
    },
  ): Promise<string> {
    const id = randomUUID();
    await client.query(
      `insert into bank_revaluation_event
        (tenant_id,company_id,id,revaluation_id,event_type,from_state,to_state,actor_id,reason,
         record_version,super_admin_override_used,decision_evidence_id,correlation_id)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        context.tenantId,
        row.company_id,
        id,
        row.id,
        input.eventType,
        input.fromState,
        row.state,
        context.actor.userId,
        input.reason,
        Number(row.row_version),
        input.superAdminOverrideUsed ?? false,
        input.decisionEvidenceId ?? null,
        input.correlationId,
      ],
    );
    return id;
  }

  private async balances(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    currency: string,
    revaluationDate: string,
  ): Promise<BalanceRow[]> {
    const rows = (
      await client.query<BalanceRow>(
        `with eligible as (
           select bank.id as bank_account_id,bank.reference as bank_account_code,
                  bank.account_name as bank_account_name,coalesce(nullif(bank.bank_name,''),bank.account_name) as bank_name,
                  ledger.id as control_nominal_id,ledger.code as control_nominal_code,bank.currency
             from bank_account bank
             join account ledger
               on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
             join company_currency company_currency
               on company_currency.tenant_id=bank.tenant_id and company_currency.company_id=bank.company_id
              and company_currency.currency_code=bank.currency and company_currency.status='active'
             join currency standard
               on standard.tenant_id=bank.tenant_id and standard.code=bank.currency and standard.status='active'
            where bank.tenant_id=$1 and bank.company_id=$2 and bank.currency=$3 and bank.status='active'
              and ledger.status='active' and not ledger.is_header and ledger.reconciliation_required
            order by bank.id limit 10001
         )
         select eligible.*,
                coalesce(sum(case when journal.id is not null and line.currency=eligible.currency then line.debit-line.credit else 0 end),0)::numeric(38,8)::text as foreign_balance,
                coalesce(sum(case when journal.id is not null then line.base_debit-line.base_credit else 0 end),0)::numeric(38,8)::text as carrying_base_balance
           from eligible
           left join journal_line line
             on line.tenant_id=$1 and line.account_id=eligible.control_nominal_id
           left join journal_entry journal
             on journal.tenant_id=line.tenant_id and journal.company_id=$2 and journal.id=line.journal_id
            and journal.status in ('posted','reversed') and journal.posting_date<=$4::date
          group by eligible.bank_account_id,eligible.bank_account_code,eligible.bank_account_name,eligible.bank_name,
                   eligible.control_nominal_id,eligible.control_nominal_code,eligible.currency
          order by eligible.bank_account_id`,
        [tenantId, companyId, currency, revaluationDate],
      )
    ).rows;
    if (rows.length > 10_000)
      throw new BankingApiError(
        409,
        "REVALUATION_ACCOUNT_POPULATION_TOO_LARGE",
        "The eligible Bank Account population exceeds 10,000 accounts.",
      );
    return rows;
  }

  private async buildPreview(
    client: PoolClient,
    context: BankingActorContext,
    input: BankRevaluationPreviewRequest,
  ): Promise<BankRevaluationPreview> {
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:revaluation-source:${context.tenantId}:${input.company_id}:${input.currency}:${input.revaluation_date}`,
    ]);
    const authority = await resolveCompanyCurrencyAuthority(client, {
      tenantId: context.tenantId,
      companyId: input.company_id,
      sourceCurrency: input.currency,
      effectiveOnOrBefore: input.revaluation_date,
    });
    if (input.currency === authority.baseCurrency)
      throw new BankingApiError(
        400,
        "REVALUATION_BASE_CURRENCY_INVALID",
        "Bank Revaluation applies only to a foreign company currency.",
      );
    if (!authority.rateId || !authority.rateEffectiveDate)
      throw new BankingApiError(409, "REVALUATION_RATE_MISSING", "A closing company exchange rate is required.");
    const unresolved = await client.query(
      `select 1
         from bank_revaluation previous
         join bank_revaluation_reversal_schedule schedule
           on schedule.tenant_id=previous.tenant_id and schedule.company_id=previous.company_id
          and schedule.revaluation_id=previous.id
        where previous.tenant_id=$1 and previous.company_id=$2 and previous.currency=$3
          and previous.state='posted' and previous.revaluation_date<$4::date
          and schedule.scheduled_date<=$4::date and schedule.state<>'posted'
        order by previous.revaluation_date,previous.id limit 1 for share of previous,schedule`,
      [context.tenantId, input.company_id, input.currency, input.revaluation_date],
    );
    if (unresolved.rowCount)
      throw new BankingApiError(
        409,
        "REVALUATION_PRIOR_REVERSAL_UNRESOLVED",
        "A required earlier Bank Revaluation reversal remains unresolved.",
      );
    const [rate, policy, balances] = await Promise.all([
      this.rateEvidence(client, context.tenantId, input.company_id, authority.rateId),
      this.policyEvidence(client, context.tenantId, input.company_id),
      this.balances(client, context.tenantId, input.company_id, input.currency, input.revaluation_date),
    ]);
    const calculated = calculateBankRevaluationPortfolio({
      lines: balances.map((line) => ({
        foreignBalance: line.foreign_balance,
        carryingBaseBalance: line.carrying_base_balance,
      })),
      closingRate: authority.rateValue,
      baseDecimalPlaces: authority.baseDecimalPlaces,
    });
    const lines: BankRevaluationLine[] = balances.map((line, index) => ({
      id: null,
      bank_account_id: line.bank_account_id,
      bank_account_code: line.bank_account_code,
      bank_account_name: line.bank_account_name,
      bank_name: line.bank_name,
      control_nominal_id: line.control_nominal_id,
      control_nominal_code: line.control_nominal_code,
      currency: line.currency,
      foreign_balance: line.foreign_balance,
      carrying_base_balance: line.carrying_base_balance,
      revalued_base_balance: calculated.lines[index]!.revaluedBaseBalance,
      adjustment: calculated.lines[index]!.adjustment,
      direction: calculated.lines[index]!.direction,
    }));
    const evidence = {
      companyId: input.company_id,
      baseCurrency: authority.baseCurrency,
      baseDecimalPlaces: authority.baseDecimalPlaces,
      currency: input.currency,
      revaluationDate: input.revaluation_date,
      rate: {
        id: rate.id,
        value: rate.rate,
        effectiveDate: dateOnly(rate.effective_date),
        revisionVersion: Number(rate.row_version),
      },
      policy: {
        id: policy.id,
        version: Number(policy.row_version),
        gainNominalId: policy.unrealized_gain_nominal_id,
        lossNominalId: policy.unrealized_loss_nominal_id,
        reversalMode: policy.reversal_mode,
      },
      lines: lines.map((line) => ({
        bankAccountId: line.bank_account_id,
        controlNominalId: line.control_nominal_id,
        currency: line.currency,
        foreignBalance: line.foreign_balance,
        carryingBaseBalance: line.carrying_base_balance,
        revaluedBaseBalance: line.revalued_base_balance,
        adjustment: line.adjustment,
      })),
    };
    return bankRevaluationPreviewSchema.parse({
      company_id: input.company_id,
      base_currency: authority.baseCurrency,
      currency: input.currency,
      revaluation_date: input.revaluation_date,
      rate_snapshot: {
        rate_id: rate.id,
        source_currency: rate.source_currency,
        target_currency: rate.target_currency,
        rate: rate.rate,
        effective_date: dateOnly(rate.effective_date),
        revision_version: Number(rate.row_version),
      },
      policy_snapshot: {
        policy_id: policy.id,
        policy_version: Number(policy.row_version),
        unrealized_gain_nominal_id: policy.unrealized_gain_nominal_id,
        unrealized_loss_nominal_id: policy.unrealized_loss_nominal_id,
        reversal_mode: policy.reversal_mode,
      },
      lines,
      totals: {
        foreign_balance: calculated.totals.foreignBalance,
        carrying_base_balance: calculated.totals.carryingBaseBalance,
        revalued_base_balance: calculated.totals.revaluedBaseBalance,
        total_gain: calculated.totals.totalGain,
        total_loss: calculated.totals.totalLoss,
        net_gain_loss: calculated.totals.netGainLoss,
      },
      source_fingerprint: hash(evidence),
      generated_at: new Date().toISOString(),
    });
  }

  private summary(row: HeaderRow) {
    return {
      id: row.id,
      company_id: row.company_id,
      voucher_number: row.voucher_number,
      external_reference: row.external_reference,
      revaluation_date: dateOnly(row.revaluation_date),
      base_currency: row.base_currency,
      currency: row.currency,
      closing_rate: row.closing_rate,
      foreign_balance: row.foreign_balance,
      carrying_base_balance: row.carrying_base_balance,
      revalued_base_balance: row.revalued_base_balance,
      gain_loss_amount: row.net_gain_loss,
      direction: direction(row.net_gain_loss),
      account_count: row.account_count,
      state: row.state,
      reversal_state: reversalState(row),
      version: Number(row.row_version),
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    };
  }

  private async storedLines(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<HeaderRow, "company_id" | "id">,
  ): Promise<BankRevaluationLine[]> {
    const lines = (
      await client.query<StoredLineRow>(
        `select line.id,line.bank_account_id,bank.reference as bank_account_code,
                bank.account_name as bank_account_name,coalesce(nullif(bank.bank_name,''),bank.account_name) as bank_name,
                line.control_nominal_id,nominal.code as control_nominal_code,line.currency,
                line.foreign_balance::text,line.carrying_base_balance::text,line.revalued_base_balance::text,
                line.adjustment::text,line.direction
           from bank_revaluation_line line
           join bank_account bank
             on bank.tenant_id=line.tenant_id and bank.company_id=line.company_id and bank.id=line.bank_account_id
           join account nominal
             on nominal.tenant_id=line.tenant_id and nominal.company_id=line.company_id and nominal.id=line.control_nominal_id
          where line.tenant_id=$1 and line.company_id=$2 and line.revaluation_id=$3
          order by line.line_order,line.id`,
        [context.tenantId, row.company_id, row.id],
      )
    ).rows;
    return lines.map((line) => ({ ...line }));
  }

  private async detail(
    client: PoolClient,
    context: BankingActorContext,
    row: HeaderRow,
  ): Promise<BankRevaluationDetail> {
    const lines = await this.storedLines(client, context, row);
    const accountingPreview = await this.accountingPreview(client, context, row, lines);
    return bankRevaluationDetailSchema.parse({
      ...this.summary(row),
      narration: row.narration,
      rate_snapshot: {
        rate_id: row.rate_id,
        source_currency: row.currency,
        target_currency: row.base_currency,
        rate: row.closing_rate,
        effective_date: dateOnly(row.rate_effective_date),
        revision_version: Number(row.rate_revision_version),
      },
      policy_snapshot: {
        policy_id: row.policy_id,
        policy_version: Number(row.policy_version),
        unrealized_gain_nominal_id: row.unrealized_gain_nominal_id,
        unrealized_loss_nominal_id: row.unrealized_loss_nominal_id,
        reversal_mode: "next_open_period_first_day",
      },
      lines,
      totals: {
        foreign_balance: row.foreign_balance,
        carrying_base_balance: row.carrying_base_balance,
        revalued_base_balance: row.revalued_base_balance,
        total_gain: row.total_gain,
        total_loss: row.total_loss,
        net_gain_loss: row.net_gain_loss,
      },
      accounting_preview: accountingPreview,
      source_fingerprint: row.source_fingerprint,
      maker_user_id: row.maker_user_id,
      approver_user_id: row.approver_user_id,
      submitted_by: row.submitted_by,
      submitted_at: iso(row.submitted_at),
      decided_by: row.decided_by,
      decided_at: iso(row.decided_at),
      decision_reason: row.decision_reason,
      super_admin_override_used: row.super_admin_override_used,
      decision_evidence_id: row.decision_evidence_id,
      posted_by: row.posted_by,
      posted_at: iso(row.posted_at),
      journal_entry_id: row.journal_entry_id,
      reversal_scheduled_date: dateOnly(row.reversal_scheduled_date),
      reversal_journal_entry_id: row.reversal_journal_entry_id,
      reversed_at: iso(row.reversed_at),
    });
  }

  private mutation(row: HeaderRow, auditEventId: string, replayed = false): BankRevaluationMutationResult {
    return bankRevaluationMutationResultSchema.parse({
      id: row.id,
      voucher_number: row.voucher_number,
      state: row.state,
      version: Number(row.row_version),
      audit_event_id: auditEventId,
      journal_entry_id: row.journal_entry_id,
      reversal_scheduled_date: dateOnly(row.reversal_scheduled_date),
      replayed,
    });
  }

  private policy(row: PolicyRow): BankRevaluationPolicy {
    return bankRevaluationPolicySchema.parse({
      id: row.id,
      company_id: row.company_id,
      unrealized_gain_nominal_id: row.unrealized_gain_nominal_id,
      unrealized_gain_nominal_code: row.unrealized_gain_nominal_code,
      unrealized_gain_nominal_name: row.unrealized_gain_nominal_name,
      unrealized_loss_nominal_id: row.unrealized_loss_nominal_id,
      unrealized_loss_nominal_code: row.unrealized_loss_nominal_code,
      unrealized_loss_nominal_name: row.unrealized_loss_nominal_name,
      reversal_mode: row.reversal_mode,
      status: row.status,
      version: Number(row.row_version),
      created_at: iso(row.created_at),
      updated_at: iso(row.updated_at),
    });
  }

  private async policyRow(client: PoolClient, tenantId: string, companyId: string): Promise<PolicyRow | undefined> {
    return (
      await client.query<PolicyRow>(
        `select policy.id,policy.company_id,policy.unrealized_gain_nominal_id,
                gain.code as unrealized_gain_nominal_code,gain.name as unrealized_gain_nominal_name,
                policy.unrealized_loss_nominal_id,loss.code as unrealized_loss_nominal_code,
                loss.name as unrealized_loss_nominal_name,policy.reversal_mode,policy.status,
                policy.row_version,policy.created_at,policy.updated_at
           from bank_revaluation_policy policy
           join account gain
             on gain.tenant_id=policy.tenant_id and gain.company_id=policy.company_id
            and gain.id=policy.unrealized_gain_nominal_id
           join account loss
             on loss.tenant_id=policy.tenant_id and loss.company_id=policy.company_id
            and loss.id=policy.unrealized_loss_nominal_id
          where policy.tenant_id=$1 and policy.company_id=$2`,
        [tenantId, companyId],
      )
    ).rows[0];
  }

  private async allocateVoucher(
    client: PoolClient,
    tenantId: string,
    companyId: string,
    date: string,
  ): Promise<string> {
    const years = (
      await client.query<{ year: number }>(
        `select year from fiscal_calendar
          where tenant_id=$1 and company_id=$2 and $3::date between period_start and period_end`,
        [tenantId, companyId, date],
      )
    ).rows;
    if (years.length !== 1)
      throw new BankingApiError(
        409,
        "REVALUATION_FISCAL_CALENDAR_UNAVAILABLE",
        "Exactly one fiscal calendar must cover the revaluation date.",
      );
    const result = await client.query<{ value: string }>(
      `insert into bank_revaluation_sequence(tenant_id,company_id,fiscal_year,next_value)
       values($1,$2,$3,2)
       on conflict(tenant_id,company_id,fiscal_year)
       do update set next_value=bank_revaluation_sequence.next_value+1
       returning (next_value-1)::text as value`,
      [tenantId, companyId, years[0]!.year],
    );
    return `BRV-${years[0]!.year}-${result.rows[0]!.value.padStart(6, "0")}`;
  }

  private async replaceLines(
    client: PoolClient,
    context: BankingActorContext,
    revaluationId: string,
    preview: BankRevaluationPreview,
    baseDecimalPlaces: number,
  ): Promise<void> {
    await client.query("delete from bank_revaluation_line where tenant_id=$1 and revaluation_id=$2", [
      context.tenantId,
      revaluationId,
    ]);
    if (preview.lines.length === 0) return;
    const records = preview.lines.map((line, index) => ({
      ...line,
      id: randomUUID(),
      line_order: index + 1,
    }));
    await client.query(
      `insert into bank_revaluation_line
        (tenant_id,company_id,revaluation_id,id,line_order,bank_account_id,control_nominal_id,currency,
         base_decimal_places,foreign_balance,carrying_base_balance,closing_rate,revalued_base_balance,adjustment,direction)
       select $1,$2,$3,record.id,record.line_order,record.bank_account_id,record.control_nominal_id,record.currency,
              $4,record.foreign_balance::numeric,record.carrying_base_balance::numeric,$5::numeric,
              record.revalued_base_balance::numeric,record.adjustment::numeric,record.direction
         from jsonb_to_recordset($6::jsonb) as record(
           id text,line_order integer,bank_account_id text,control_nominal_id text,currency text,
           foreign_balance text,carrying_base_balance text,revalued_base_balance text,adjustment text,direction text
         )`,
      [
        context.tenantId,
        preview.company_id,
        revaluationId,
        baseDecimalPlaces,
        preview.rate_snapshot.rate,
        JSON.stringify(records),
      ],
    );
  }

  async getPolicy(context: BankingActorContext, companyId: string): Promise<BankRevaluationPolicy> {
    this.claim(context, "banking.revaluation_policy.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.revaluation_policy.read", companyId);
      const row = await this.policyRow(client, context.tenantId, companyId);
      if (!row)
        throw new BankingApiError(
          404,
          "REVALUATION_POLICY_NOT_FOUND",
          "Configure the company Bank Revaluation policy before creating a revaluation.",
        );
      return this.policy(row);
    });
  }

  async upsertPolicy(
    context: BankingActorContext,
    input: UpsertBankRevaluationPolicyRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationPolicyMutation> {
    this.claim(context, "banking.revaluation_policy.manage");
    return this.transaction(context, true, async (client) => {
      await this.scoped(client, context, "banking.revaluation_policy.manage", input.company_id);
      return this.idempotent(
        client,
        context,
        "POST",
        "/api/v1/banking/revaluation-policy",
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationPolicyMutationSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = (
            await client.query<{
              id: string;
              row_version: string | number;
              status: "active" | "inactive";
            }>(
              `select id,row_version,status from bank_revaluation_policy
                where tenant_id=$1 and company_id=$2 for update`,
              [context.tenantId, input.company_id],
            )
          ).rows[0];
          if (current && Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_POLICY_VERSION_CONFLICT",
              "The Bank Revaluation policy changed. Reload and retry.",
            );
          if (!current && input.expected_version !== undefined)
            throw new BankingApiError(
              409,
              "REVALUATION_POLICY_VERSION_CONFLICT",
              "The Bank Revaluation policy does not exist yet.",
            );
          const eligible = await client.query<{ count: number }>(
            `select count(*)::integer as count from account
              where tenant_id=$1 and company_id=$2 and id=any($3::text[]) and status='active'
                and not is_header and manual_posting_allowed and not managed_bank_nominal`,
            [context.tenantId, input.company_id, [input.unrealized_gain_nominal_id, input.unrealized_loss_nominal_id]],
          );
          if (eligible.rows[0]?.count !== 2)
            throw new BankingApiError(
              400,
              "REVALUATION_POLICY_NOMINAL_INVALID",
              "Gain and loss nominals must be distinct, active, non-header and posting-capable company accounts.",
            );
          const policyId = current?.id ?? `bank-revaluation-policy-${randomUUID()}`;
          const nextVersion = current ? Number(current.row_version) + 1 : 1;
          if (current)
            await client.query(
              `update bank_revaluation_policy
                  set unrealized_gain_nominal_id=$3,unrealized_loss_nominal_id=$4,status=$5,
                      row_version=row_version+1,updated_by=$6,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2`,
              [
                context.tenantId,
                input.company_id,
                input.unrealized_gain_nominal_id,
                input.unrealized_loss_nominal_id,
                input.status,
                context.actor.userId,
              ],
            );
          else
            await client.query(
              `insert into bank_revaluation_policy
                (tenant_id,company_id,id,unrealized_gain_nominal_id,unrealized_loss_nominal_id,
                 reversal_mode,status,row_version,created_by,updated_by)
               values($1,$2,$3,$4,$5,'next_open_period_first_day',$6,1,$7,$7)`,
              [
                context.tenantId,
                input.company_id,
                policyId,
                input.unrealized_gain_nominal_id,
                input.unrealized_loss_nominal_id,
                input.status,
                context.actor.userId,
              ],
            );
          const action = !current
            ? "created"
            : current.status !== input.status
              ? input.status === "active"
                ? "activated"
                : "inactivated"
              : "updated";
          const eventId = randomUUID();
          await client.query(
            `insert into bank_revaluation_policy_event
              (tenant_id,company_id,id,policy_id,action,record_version,actor_id,reason,correlation_id)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              context.tenantId,
              input.company_id,
              eventId,
              policyId,
              action,
              nextVersion,
              context.actor.userId,
              input.reason,
              correlationId,
            ],
          );
          return bankRevaluationPolicyMutationSchema.parse({
            id: policyId,
            version: nextVersion,
            audit_event_id: eventId,
            replayed: false,
          });
        },
      );
    });
  }

  async preview(context: BankingActorContext, input: BankRevaluationPreviewRequest): Promise<BankRevaluationPreview> {
    this.claim(context, "banking.revaluation.create");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.revaluation.create", input.company_id);
      return this.buildPreview(client, context, input);
    });
  }

  async list(context: BankingActorContext, query: BankRevaluationDirectoryQuery): Promise<BankRevaluationDirectory> {
    this.claim(context, "banking.revaluation.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.revaluation.read", query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const where = ["revaluation.tenant_id=$1", "revaluation.company_id=$2"];
      const add = (clause: (position: number) => string, value: unknown) => {
        values.push(value);
        where.push(clause(values.length));
      };
      if (query.currency) add((position) => `revaluation.currency=$${position}`, query.currency);
      if (query.bank_account_id)
        add(
          (position) =>
            `exists(select 1 from bank_revaluation_line filter_line where filter_line.tenant_id=revaluation.tenant_id and filter_line.revaluation_id=revaluation.id and filter_line.bank_account_id=$${position})`,
          query.bank_account_id,
        );
      if (query.states) add((position) => `revaluation.state=any($${position}::text[])`, query.states);
      if (query.date_from) add((position) => `revaluation.revaluation_date>=$${position}::date`, query.date_from);
      if (query.date_to) add((position) => `revaluation.revaluation_date<=$${position}::date`, query.date_to);
      if (query.search)
        add(
          (position) =>
            `(revaluation.voucher_number ilike '%'||$${position}||'%' or coalesce(revaluation.external_reference,'') ilike '%'||$${position}||'%')`,
          query.search,
        );
      if (query.cursor) {
        const cursor = decodeCursor(query.cursor);
        values.push(cursor.revaluationDate, cursor.voucherNumber, cursor.id);
        where.push(
          `(revaluation.revaluation_date,revaluation.voucher_number,revaluation.id)<($${values.length - 2}::date,$${values.length - 1},$${values.length})`,
        );
      }
      values.push(query.limit + 1);
      const rows = (
        await client.query<HeaderRow>(
          `select revaluation.*,schedule.state as reversal_schedule_state
             from bank_revaluation revaluation
             left join bank_revaluation_reversal_schedule schedule
               on schedule.tenant_id=revaluation.tenant_id and schedule.company_id=revaluation.company_id
              and schedule.revaluation_id=revaluation.id
            where ${where.join(" and ")}
            order by revaluation.revaluation_date desc,revaluation.voucher_number desc,revaluation.id desc
            limit $${values.length}`,
          values,
        )
      ).rows;
      const hasNext = rows.length > query.limit;
      const selected = rows.slice(0, query.limit);
      return bankRevaluationDirectorySchema.parse({
        items: selected.map((row) => this.summary(row)),
        next_cursor: hasNext ? encodeCursor(selected.at(-1)!) : null,
      });
    });
  }

  async get(context: BankingActorContext, id: string): Promise<BankRevaluationDetail> {
    this.claim(context, "banking.revaluation.read");
    return this.transaction(context, false, async (client) => {
      const row = await this.header(client, context, id);
      await this.scoped(client, context, "banking.revaluation.read", row.company_id);
      return this.detail(client, context, row);
    });
  }

  async listEvents(
    context: BankingActorContext,
    id: string,
    query: BankRevaluationEventDirectoryQuery,
  ): Promise<BankRevaluationEventDirectory> {
    this.claim(context, "banking.revaluation.read");
    return this.transaction(context, false, async (client) => {
      const current = await this.header(client, context, id);
      await this.scoped(client, context, "banking.revaluation.read", current.company_id);
      const values: unknown[] = [context.tenantId, current.company_id, id];
      let cursorClause = "";
      if (query.cursor) {
        const cursor = decodeEventCursor(query.cursor);
        values.push(cursor.occurredAt, cursor.id);
        cursorClause = ` and (event.occurred_at,event.id)<($${values.length - 1}::timestamptz,$${values.length})`;
      }
      values.push(query.limit + 1);
      const rows = (
        await client.query<EventRow>(
          `select event.id,event.revaluation_id,event.event_type,event.from_state,event.to_state,
                  event.actor_id,event.reason,event.super_admin_override_used,event.decision_evidence_id,
                  event.occurred_at
             from bank_revaluation_event event
            where event.tenant_id=$1 and event.company_id=$2 and event.revaluation_id=$3${cursorClause}
            order by event.occurred_at desc,event.id desc limit $${values.length}`,
          values,
        )
      ).rows;
      const selected = rows.slice(0, query.limit);
      return bankRevaluationEventDirectorySchema.parse({
        items: selected.map((row) => ({
          id: row.id,
          revaluation_id: row.revaluation_id,
          event_type: row.event_type,
          from_state: row.from_state,
          to_state: row.to_state,
          actor_user_id: row.actor_id,
          reason: row.reason,
          super_admin_override_used: row.super_admin_override_used,
          decision_evidence_id: row.decision_evidence_id,
          occurred_at: iso(row.occurred_at),
        })),
        next_cursor: rows.length > query.limit ? encodeEventCursor(selected.at(-1)!) : null,
      });
    });
  }

  async create(
    context: BankingActorContext,
    input: CreateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.create");
    return this.transaction(context, true, async (client) => {
      await this.scoped(client, context, "banking.revaluation.create", input.company_id);
      return this.idempotent(
        client,
        context,
        "POST",
        "/api/v1/banking/revaluations",
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const preview = await this.buildPreview(client, context, input);
          const id = randomUUID();
          const auditEventId = randomUUID();
          const voucher = await this.allocateVoucher(
            client,
            context.tenantId,
            input.company_id,
            input.revaluation_date,
          );
          const baseDecimalPlaces = await this.currencyDecimalPlaces(client, context.tenantId, preview.base_currency);
          const row = (
            await client.query<HeaderRow>(
              `insert into bank_revaluation
                (tenant_id,company_id,id,voucher_number,external_reference,narration,revaluation_date,
                 base_currency,base_decimal_places,currency,rate_id,closing_rate,rate_effective_date,
                 rate_revision_version,policy_id,policy_version,unrealized_gain_nominal_id,
                 unrealized_loss_nominal_id,source_fingerprint,foreign_balance,carrying_base_balance,
                 revalued_base_balance,total_gain,total_loss,net_gain_loss,account_count,state,row_version,
                 maker_user_id,approver_user_id)
               values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
                      $20,$21,$22,$23,$24,$25,$26,'draft',1,$27,$28)
               returning *`,
              [
                context.tenantId,
                input.company_id,
                id,
                voucher,
                input.external_reference?.trim() ?? null,
                input.narration?.trim() ?? null,
                input.revaluation_date,
                preview.base_currency,
                baseDecimalPlaces,
                preview.currency,
                preview.rate_snapshot.rate_id,
                preview.rate_snapshot.rate,
                preview.rate_snapshot.effective_date,
                preview.rate_snapshot.revision_version,
                preview.policy_snapshot.policy_id,
                preview.policy_snapshot.policy_version,
                preview.policy_snapshot.unrealized_gain_nominal_id,
                preview.policy_snapshot.unrealized_loss_nominal_id,
                preview.source_fingerprint,
                preview.totals.foreign_balance,
                preview.totals.carrying_base_balance,
                preview.totals.revalued_base_balance,
                preview.totals.total_gain,
                preview.totals.total_loss,
                preview.totals.net_gain_loss,
                preview.lines.length,
                context.actor.userId,
                input.approver_user_id ?? null,
              ],
            )
          ).rows[0]!;
          await this.replaceLines(client, context, id, preview, baseDecimalPlaces);
          await client.query(
            `insert into bank_revaluation_event
              (tenant_id,company_id,id,revaluation_id,event_type,from_state,to_state,actor_id,reason,
               record_version,correlation_id)
             values($1,$2,$3,$4,'created',null,'draft',$5,'Bank Revaluation draft created.',1,$6)`,
            [context.tenantId, input.company_id, auditEventId, id, context.actor.userId, correlationId],
          );
          return this.mutation(row, auditEventId);
        },
      );
    });
  }

  async update(
    context: BankingActorContext,
    id: string,
    input: UpdateBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.update");
    return this.transaction(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        "PATCH",
        `/api/v1/banking/revaluations/${id}`,
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.revaluation.update", current.company_id);
          if (current.state !== "draft" && current.state !== "rejected")
            throw new BankingApiError(
              409,
              "REVALUATION_STATE_CONFLICT",
              "Only a draft or rejected Bank Revaluation can be revised.",
            );
          if (Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          const preview = await this.buildPreview(client, context, {
            company_id: current.company_id,
            currency: input.currency ?? current.currency,
            revaluation_date: input.revaluation_date ?? dateOnly(current.revaluation_date)!,
          });
          const baseDecimalPlaces = await this.currencyDecimalPlaces(client, context.tenantId, preview.base_currency);
          const updated = (
            await client.query<HeaderRow>(
              `update bank_revaluation set state='draft',
                 external_reference=$4,narration=$5,revaluation_date=$6,base_currency=$7,
                 base_decimal_places=$8,currency=$9,rate_id=$10,closing_rate=$11,rate_effective_date=$12,
                 rate_revision_version=$13,policy_id=$14,policy_version=$15,unrealized_gain_nominal_id=$16,
                 unrealized_loss_nominal_id=$17,source_fingerprint=$18,foreign_balance=$19,
                 carrying_base_balance=$20,revalued_base_balance=$21,total_gain=$22,total_loss=$23,
                 net_gain_loss=$24,account_count=$25,approver_user_id=$26,
                 submitted_by=null,submitted_at=null,decided_by=null,decided_at=null,decision_reason=null,
                 super_admin_override_used=false,decision_evidence_id=null,
                 row_version=row_version+1,
                 updated_at=clock_timestamp()
               where tenant_id=$1 and company_id=$2 and id=$3 and state in ('draft','rejected') and row_version=$27
               returning *`,
              [
                context.tenantId,
                current.company_id,
                id,
                input.external_reference === undefined
                  ? current.external_reference
                  : (input.external_reference?.trim() ?? null),
                input.narration === undefined ? current.narration : (input.narration?.trim() ?? null),
                preview.revaluation_date,
                preview.base_currency,
                baseDecimalPlaces,
                preview.currency,
                preview.rate_snapshot.rate_id,
                preview.rate_snapshot.rate,
                preview.rate_snapshot.effective_date,
                preview.rate_snapshot.revision_version,
                preview.policy_snapshot.policy_id,
                preview.policy_snapshot.policy_version,
                preview.policy_snapshot.unrealized_gain_nominal_id,
                preview.policy_snapshot.unrealized_loss_nominal_id,
                preview.source_fingerprint,
                preview.totals.foreign_balance,
                preview.totals.carrying_base_balance,
                preview.totals.revalued_base_balance,
                preview.totals.total_gain,
                preview.totals.total_loss,
                preview.totals.net_gain_loss,
                preview.lines.length,
                input.approver_user_id === undefined ? current.approver_user_id : input.approver_user_id,
                input.expected_version,
              ],
            )
          ).rows[0];
          if (!updated)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          await this.replaceLines(client, context, id, preview, baseDecimalPlaces);
          const persistedEventId = await this.insertEvent(client, context, updated, {
            eventType: "updated",
            fromState: current.state,
            reason: "Bank Revaluation draft recalculated.",
            correlationId,
          });
          return this.mutation(updated, persistedEventId);
        },
      ),
    );
  }

  async submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.submit");
    return this.transaction(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        "POST",
        `/api/v1/banking/revaluations/${id}/submit`,
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.revaluation.submit", current.company_id);
          if (current.state !== "draft")
            throw new BankingApiError(
              409,
              "REVALUATION_STATE_CONFLICT",
              "Only a draft Bank Revaluation can be submitted.",
            );
          if (Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          await this.validateApprover(client, context, current);
          const refreshed = await this.buildPreview(client, context, {
            company_id: current.company_id,
            currency: current.currency,
            revaluation_date: dateOnly(current.revaluation_date)!,
          });
          if (refreshed.source_fingerprint !== current.source_fingerprint)
            throw new BankingApiError(
              409,
              "REVALUATION_REFRESH_REQUIRED",
              "Rate, policy, Bank Account or posted balance evidence changed. Refresh the draft before submitting.",
            );
          const submitted = (
            await client.query<HeaderRow>(
              `update bank_revaluation set state='submitted',submitted_by=$4,submitted_at=clock_timestamp(),
                      row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3 and state='draft' and row_version=$5
                returning *`,
              [context.tenantId, current.company_id, id, context.actor.userId, input.expected_version],
            )
          ).rows[0];
          if (!submitted)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          const eventId = await this.insertEvent(client, context, submitted, {
            eventType: "submitted",
            fromState: "draft",
            reason: input.reason?.trim() ?? "Submitted for independent approval.",
            correlationId,
          });
          return this.mutation(submitted, eventId);
        },
      ),
    );
  }

  async decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.approve");
    return this.transaction(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        "POST",
        `/api/v1/banking/revaluations/${id}/${input.action}`,
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.revaluation.approve", current.company_id);
          if (current.state !== "submitted")
            throw new BankingApiError(
              409,
              "REVALUATION_STATE_CONFLICT",
              "Only a submitted Bank Revaluation can be approved or rejected.",
            );
          if (Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          await this.validateApprover(client, context, current);
          if (
            current.approver_user_id !== context.actor.userId &&
            !(await globalBankOverride(client, context, current.company_id))
          )
            throw new BankingApiError(
              403,
              "REVALUATION_ASSIGNED_APPROVER_REQUIRED",
              "Only the assigned approver may decide this Bank Revaluation.",
            );
          const evidence = bankDecisionEvidence(input, "Bank Revaluation");
          const actor = evaluateApprovalActor({
            account: context.actor,
            makerActorIds: [current.maker_user_id, current.submitted_by ?? ""],
            normalDecisionPermission: "banking.revaluation.approve",
            impersonated: false,
          });
          if (actor.kind === "forbidden")
            throw new BankingApiError(
              403,
              "REVALUATION_APPROVER_SEPARATION_REQUIRED",
              "An independent approver or governed Super Administrator override is required.",
            );
          let overrideId: string | null = null;
          if (actor.kind === "override")
            overrideId = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [current.maker_user_id, current.submitted_by ?? ""],
                normalDecisionPermission: "banking.revaluation.approve",
                resourceType: "banking.revaluation",
                resourceId: id,
                decisionAction: input.action,
                reason: evidence.reason,
                correlationId,
                idempotencyKey: `${idempotencyKey}:approval-override`,
                metadata: {
                  company_id: current.company_id,
                  voucher_number: current.voucher_number,
                  expected_version: input.expected_version,
                },
                impersonated: false,
              })
            ).eventId;
          const nextState = input.action === "approve" ? "approved" : "rejected";
          const decided = (
            await client.query<HeaderRow>(
              `update bank_revaluation set state=$4,decided_by=$5,decided_at=clock_timestamp(),
                      decision_reason=$6,super_admin_override_used=$7,decision_evidence_id=$8,
                      row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3 and state='submitted' and row_version=$9
                returning *`,
              [
                context.tenantId,
                current.company_id,
                id,
                nextState,
                context.actor.userId,
                evidence.reason,
                overrideId !== null,
                overrideId,
                input.expected_version,
              ],
            )
          ).rows[0];
          if (!decided)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          const eventId = await this.insertEvent(client, context, decided, {
            eventType: nextState,
            fromState: "submitted",
            reason: evidence.reason,
            correlationId,
            superAdminOverrideUsed: overrideId !== null,
            decisionEvidenceId: overrideId,
          });
          return this.mutation(decided, eventId);
        },
      ),
    );
  }

  async post(
    context: BankingActorContext,
    id: string,
    input: PostBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.post");
    return this.transaction(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        "POST",
        `/api/v1/banking/revaluations/${id}/post`,
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.revaluation.post", current.company_id);
          if (current.state !== "approved")
            throw new BankingApiError(409, "REVALUATION_STATE_CONFLICT", "Only an approved Bank Revaluation can post.");
          if (Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          await this.policyPostingEvidence(client, context, current);
          const schedule = (
            await client.query<{ scheduled_date: string | Date }>(
              `select following.period_start as scheduled_date
                 from financial_period current_period
                 join lateral (
                   select period_start from financial_period following
                    where following.tenant_id=current_period.tenant_id
                      and following.company_id=current_period.company_id
                      and following.period_start>current_period.period_end
                    order by following.period_start,following.id limit 1
                 ) following on true
                where current_period.tenant_id=$1 and current_period.company_id=$2
                  and current_period.id=(
                    select id from financial_period covering
                     where covering.tenant_id=$1 and covering.company_id=$2
                       and $3::date between covering.period_start and covering.period_end
                     order by covering.period_start,covering.id limit 1
                  )`,
              [context.tenantId, current.company_id, dateOnly(current.revaluation_date)],
            )
          ).rows[0];
          if (!schedule)
            throw new BankingApiError(
              409,
              "REVALUATION_REVERSAL_PERIOD_UNAVAILABLE",
              "Configure the next accounting period before posting this Bank Revaluation.",
            );
          const evidence = await this.postingEvidence(client, context, current);
          if (evidence.length === 0)
            throw new BankingApiError(
              409,
              "REVALUATION_ZERO_ADJUSTMENT",
              "This Bank Revaluation has no non-zero adjustment to post.",
            );
          const financeClient = await createFinanceTransactionClient(client);
          const financeLines: FinancePostingLine[] = evidence.map((line) => ({
            accountId: line.nominalId,
            debit: line.debit,
            credit: line.credit,
            dimensions: {},
            description: line.description,
            sourceMetadata: { revaluation_id: current.id, voucher_number: current.voucher_number },
          }));
          const posted = await this.finance.post(financeClient, {
            tenantId: context.tenantId,
            companyId: current.company_id,
            actorId: context.actor.userId,
            postingDate: dateOnly(current.revaluation_date)!,
            sourceType: "bank_fx_revaluation",
            sourceId: current.id,
            eventType: "bank_fx_revaluation.posted",
            externalIdempotencyKey: idempotencyKey,
            transactionCurrency: current.base_currency,
            exchangeRateId: null,
            exchangeRateValue: "1",
            payloadHashMaterial: {
              voucher_number: current.voucher_number,
              revaluation_version: Number(current.row_version),
              source_fingerprint: current.source_fingerprint,
              net_gain_loss: current.net_gain_loss,
            },
            auditRef: correlationId,
            lines: financeLines,
          });
          const scheduledDate = dateOnly(schedule.scheduled_date)!;
          const postedRow = (
            await client.query<HeaderRow>(
              `update bank_revaluation set state='posted',posted_by=$4,posted_at=clock_timestamp(),
                      journal_entry_id=$5,reversal_scheduled_date=$6,row_version=row_version+1,
                      updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3 and state='approved' and row_version=$7
                returning *`,
              [
                context.tenantId,
                current.company_id,
                id,
                context.actor.userId,
                posted.journalId,
                scheduledDate,
                input.expected_version,
              ],
            )
          ).rows[0];
          if (!postedRow)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          await client.query(
            `insert into bank_revaluation_reversal_schedule
              (tenant_id,company_id,id,revaluation_id,scheduled_date,state,attempt_count,next_attempt_at)
             values($1,$2,$3,$4,$5,'pending',0,greatest(clock_timestamp(),$5::date::timestamp))`,
            [context.tenantId, current.company_id, randomUUID(), id, scheduledDate],
          );
          const eventId = await this.insertEvent(client, context, postedRow, {
            eventType: "posted",
            fromState: "approved",
            reason: null,
            correlationId,
          });
          await this.insertEvent(client, context, postedRow, {
            eventType: "reversal_scheduled",
            fromState: "approved",
            reason: `Automatic reversal scheduled for ${scheduledDate}.`,
            correlationId,
          });
          return this.mutation(postedRow, eventId);
        },
      ),
    );
  }

  async reverse(
    context: BankingActorContext,
    id: string,
    input: ReverseBankRevaluationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankRevaluationMutationResult> {
    this.claim(context, "banking.revaluation.reverse");
    return this.transaction(context, true, async (client) =>
      this.idempotent(
        client,
        context,
        "POST",
        `/api/v1/banking/revaluations/${id}/reverse`,
        input,
        idempotencyKey,
        (value, replayed) => bankRevaluationMutationResultSchema.parse({ ...(value as object), replayed }),
        async () => {
          const current = await this.header(client, context, id, true);
          await this.scoped(client, context, "banking.revaluation.reverse", current.company_id);
          if (current.state !== "posted" || !current.journal_entry_id)
            throw new BankingApiError(409, "REVALUATION_STATE_CONFLICT", "Only a posted Bank Revaluation can reverse.");
          if (Number(current.row_version) !== input.expected_version)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          const schedule = (
            await client.query<{ id: string; scheduled_date: string | Date; state: string }>(
              `select id,scheduled_date,state from bank_revaluation_reversal_schedule
                where tenant_id=$1 and company_id=$2 and revaluation_id=$3 for update`,
              [context.tenantId, current.company_id, id],
            )
          ).rows[0];
          if (!schedule || !["pending", "failed"].includes(schedule.state))
            throw new BankingApiError(
              409,
              "REVALUATION_REVERSAL_NOT_PENDING",
              "The Bank Revaluation reversal is not pending.",
            );
          const due = await client.query<{ due: boolean }>("select $1::date<=current_date as due", [
            dateOnly(schedule.scheduled_date),
          ]);
          if (!due.rows[0]?.due)
            throw new BankingApiError(
              409,
              "REVALUATION_REVERSAL_NOT_DUE",
              "The scheduled Bank Revaluation reversal date has not arrived.",
            );
          const original = (
            await client.query<{ accounting_event_id: string }>(
              `select source_id as accounting_event_id from journal_entry
                where tenant_id=$1 and company_id=$2 and id=$3 and source_type='accounting_event'
                for share`,
              [context.tenantId, current.company_id, current.journal_entry_id],
            )
          ).rows[0];
          if (!original)
            throw new BankingApiError(
              409,
              "REVALUATION_ORIGINAL_POSTING_INVALID",
              "The original Bank Revaluation posting evidence is unavailable.",
            );
          const financeClient = await createFinanceTransactionClient(client);
          const reversed = await this.finance.reverse(financeClient, {
            tenantId: context.tenantId,
            companyId: current.company_id,
            actorId: context.actor.userId,
            sourceType: "bank_fx_revaluation",
            sourceId: current.id,
            eventType: "bank_fx_revaluation.reversed",
            originalEventType: "bank_fx_revaluation.posted",
            originalAccountingEventId: original.accounting_event_id,
            originalJournalId: current.journal_entry_id,
            postingDate: dateOnly(schedule.scheduled_date)!,
            externalIdempotencyKey: idempotencyKey,
            transactionCurrency: current.base_currency,
            payloadHashMaterial: {
              voucher_number: current.voucher_number,
              revaluation_version: Number(current.row_version),
              reason_hash: hash(input.reason),
            },
            auditRef: correlationId,
          });
          await client.query(
            `update bank_revaluation_reversal_schedule
                set state='posted',attempt_count=attempt_count+1,reversal_journal_entry_id=$4,
                    claimed_by=null,claimed_at=null,last_error_code=null,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and id=$3`,
            [context.tenantId, current.company_id, schedule.id, reversed.journalId],
          );
          const reversedRow = (
            await client.query<HeaderRow>(
              `update bank_revaluation set state='reversed',reversal_journal_entry_id=$4,
                      reversed_at=clock_timestamp(),row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3 and state='posted' and row_version=$5
                returning *`,
              [context.tenantId, current.company_id, id, reversed.journalId, input.expected_version],
            )
          ).rows[0];
          if (!reversedRow)
            throw new BankingApiError(
              409,
              "REVALUATION_VERSION_CONFLICT",
              "The Bank Revaluation changed. Refresh and retry.",
            );
          const eventId = await this.insertEvent(client, context, reversedRow, {
            eventType: "reversed",
            fromState: "posted",
            reason: input.reason,
            correlationId,
          });
          return this.mutation(reversedRow, eventId);
        },
      ),
    );
  }
}
