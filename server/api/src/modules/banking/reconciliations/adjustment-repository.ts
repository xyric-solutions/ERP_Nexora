import { createHash, randomUUID } from "node:crypto";

import { evaluateApprovalActor } from "@nexora/auth";
import {
  bankReconciliationAdjustmentMutationResultSchema,
  type BankReconciliationAdjustment,
  type BankReconciliationAdjustmentMutationResult,
  type CreateBankReconciliationAdjustmentRequest,
  type DecideBankReconciliationAdjustmentRequest,
  type PostBankReconciliationAdjustmentRequest,
  type ReverseBankReconciliationAdjustmentRequest,
  type SubmitBankReconciliationAdjustmentRequest,
  type UpdateBankReconciliationAdjustmentRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../../security/approval-override-writer.js";
import {
  CompanyCurrencyAuthorityError,
  resolveCompanyCurrencyAuthority,
} from "../../finance/currencies/company-authority.js";
import {
  createFinanceTransactionClient,
  FinancePostingError,
  FinancePostingService,
  type FinancePostingLine,
} from "../../finance/posting/index.js";
import { bankDecisionEvidence } from "../decision-evidence.js";
import { BankingApiError, type BankingActorContext } from "../source-repository.js";
import { globalBankOverride } from "../workflow-context.js";
import type { BankReconciliationAdjustmentRepository } from "./adjustment-service.js";
import {
  calculateReconciliationBalances,
  ledgerPopulationHash,
  type ReconciliationLedgerCandidate,
  type ReconciliationStatementLine,
} from "./matching.js";

type ReconciliationRow = {
  id: string;
  company_id: string;
  bank_account_id: string;
  import_id: string | null;
  statement_date: string | Date;
  period_start: string | Date;
  period_end: string | Date;
  currency: string;
  currency_decimals: number;
  opening_statement_balance: string;
  closing_statement_balance: string;
  ledger_balance_at_cutoff: string;
  state: "draft" | "in_progress" | "submitted" | "approved";
  row_version: string | number;
};

type AdjustmentRow = {
  id: string;
  company_id: string;
  reconciliation_id: string;
  statement_line_id: string;
  kind: "bank_charge" | "interest_earned" | "unidentified_credit" | "unidentified_debit" | "other";
  offset_nominal_id: string;
  offset_nominal_code: string;
  offset_nominal_name: string;
  narrative: string;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  state: "draft" | "submitted" | "approved" | "posted" | "reversed";
  row_version: string | number;
  created_by: string;
  submitted_by: string | null;
  approved_by: string | null;
  posted_by: string | null;
  reversed_by: string | null;
  approval_override_event_id: string | null;
  accounting_event_id: string | null;
  journal_id: string | null;
  bank_journal_line_id: string | null;
};

type StatementRow = {
  id: string;
  import_id: string;
  transaction_date: string | Date;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  reference: string | null;
  details: string | null;
};

type NominalRow = {
  id: string;
  code: string;
  name: string;
};

type BankRow = {
  account_id: string;
};

type CaptureRow = {
  journal_line_id: string;
  journal_id: string;
  posting_date: string | Date;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  reference: string | null;
  narrative: string | null;
  journal_status: "draft" | "posted" | "reversed";
};

function normalizeFinanceAmount(value: string): string {
  if (!value.includes(".")) return value;
  const normalized = value.replace(/0+$/, "").replace(/\.$/, "");
  return normalized || "0";
}

export function buildAdjustmentPostingLines(input: {
  direction: "money_in" | "money_out";
  amount: string;
  bankAccountId: string;
  bankNominalId: string;
  offsetNominalId: string;
  adjustmentKind: AdjustmentRow["kind"];
  narrative: string;
}): readonly FinancePostingLine[] {
  const bankLine: FinancePostingLine = {
    accountId: input.bankNominalId,
    debit: input.direction === "money_in" ? input.amount : "0",
    credit: input.direction === "money_out" ? input.amount : "0",
    dimensions: {},
    description: input.narrative,
    sourceMetadata: { bank_account_id: input.bankAccountId, is_bank_control: true },
  };
  const offsetLine: FinancePostingLine = {
    accountId: input.offsetNominalId,
    debit: input.direction === "money_out" ? input.amount : "0",
    credit: input.direction === "money_in" ? input.amount : "0",
    dimensions: {},
    description: input.narrative,
    sourceMetadata: { adjustment_kind: input.adjustmentKind },
  };
  return input.direction === "money_in" ? [bankLine, offsetLine] : [offsetLine, bankLine];
}

const dateOnly = (value: string | Date) =>
  value instanceof Date
    ? `${value.getFullYear().toString().padStart(4, "0")}-${(value.getMonth() + 1)
        .toString()
        .padStart(2, "0")}-${value.getDate().toString().padStart(2, "0")}`
    : value.slice(0, 10);

const canonical = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === "object"
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([left], [right]) => left.localeCompare(right))
            .map(([key, entry]) => [key, canonical(entry)]),
        )
      : value;

const hash = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(canonical(value)), "utf8")
    .digest("hex");

export class SourceBankReconciliationAdjustmentRepository implements BankReconciliationAdjustmentRepository {
  constructor(
    private readonly pool: Pool,
    private readonly finance: FinancePostingService = new FinancePostingService(),
  ) {}

  private claim(context: BankingActorContext, permission: string): void {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission)) {
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Bank Reconciliation adjustment operation.",
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
    if (!result.rows[0]?.allowed) {
      throw new BankingApiError(403, "COMPANY_ACCESS_DENIED", "The company is outside your live permission scope.");
    }
  }

  private async transaction<T>(
    context: BankingActorContext,
    work: (client: PoolClient) => Promise<T>,
    mutation = true,
  ): Promise<T> {
    if (mutation && (context.realActorId || context.impersonationRequestId)) {
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Bank Reconciliation adjustment operations are disabled during impersonation.",
      );
    }
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
      if (error instanceof ApprovalOverrideWriterError) {
        throw new BankingApiError(error.code.includes("IDEMPOTENCY") ? 409 : 403, error.code, error.message);
      }
      if (error instanceof CompanyCurrencyAuthorityError) {
        throw new BankingApiError(error.status, error.code, error.message);
      }
      if (error instanceof FinancePostingError) throw this.mapFinanceError(error);
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23P01", "23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        throw new BankingApiError(
          409,
          "RECONCILIATION_ADJUSTMENT_AUTHORITY_CONFLICT",
          "Adjustment evidence or a concurrent change conflicted. Refresh and retry.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async idempotent(
    client: PoolClient,
    context: BankingActorContext,
    path: string,
    input: unknown,
    key: string,
    work: () => Promise<BankReconciliationAdjustmentMutationResult>,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(key)) {
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:reconciliation-adjustment:${context.tenantId}:${context.actor.userId}:${path}:${key}`,
    ]);
    const fingerprint = hash(input);
    const prior = (
      await client.query<{ request_fingerprint: string; response_body: unknown }>(
        `select request_fingerprint,response_body from platform_admin_idempotency
          where tenant_id=$1 and actor_id=$2 and method='POST' and path=$3 and idempotency_key=$4`,
        [context.tenantId, context.actor.userId, path, key],
      )
    ).rows[0];
    if (prior) {
      if (prior.request_fingerprint !== fingerprint) {
        throw new BankingApiError(409, "IDEMPOTENCY_CONFLICT", "This key was used for another request.");
      }
      return {
        ...bankReconciliationAdjustmentMutationResultSchema.parse(prior.response_body),
        replayed: true,
      };
    }
    const result = await work();
    await client.query(
      `insert into platform_admin_idempotency
        (tenant_id,actor_id,method,path,idempotency_key,request_fingerprint,response_status,response_body,response_etag)
       values($1,$2,'POST',$3,$4,$5,200,$6,$7)`,
      [context.tenantId, context.actor.userId, path, key, fingerprint, JSON.stringify(result), `"${hash(result)}"`],
    );
    return result;
  }

  private async reconciliation(
    client: PoolClient,
    context: BankingActorContext,
    id: string,
  ): Promise<ReconciliationRow> {
    const row = (
      await client.query<ReconciliationRow>(
        `select reconciliation.*,currency.decimal_places as currency_decimals
           from bank_reconciliation reconciliation
           join currency on currency.tenant_id=reconciliation.tenant_id
                        and currency.code=reconciliation.currency and currency.status='active'
          where reconciliation.tenant_id=$1 and reconciliation.id=$2
          for update of reconciliation`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row) throw new BankingApiError(404, "RECONCILIATION_NOT_FOUND", "The Bank Reconciliation was not found.");
    return row;
  }

  private async adjustment(
    client: PoolClient,
    context: BankingActorContext,
    reconciliation: ReconciliationRow,
    id: string,
  ): Promise<AdjustmentRow> {
    const row = (
      await client.query<AdjustmentRow>(
        `select adjustment.*,nominal.code as offset_nominal_code,nominal.name as offset_nominal_name
           from bank_reconciliation_adjustment adjustment
           join account nominal
             on nominal.tenant_id=adjustment.tenant_id and nominal.company_id=adjustment.company_id
            and nominal.id=adjustment.offset_nominal_id
          where adjustment.tenant_id=$1 and adjustment.company_id=$2
            and adjustment.reconciliation_id=$3 and adjustment.id=$4
          for update of adjustment`,
        [context.tenantId, reconciliation.company_id, reconciliation.id, id],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        404,
        "RECONCILIATION_ADJUSTMENT_NOT_FOUND",
        "The Bank Reconciliation adjustment was not found.",
      );
    }
    return row;
  }

  private version(actual: string | number, expected: number): void {
    if (Number(actual) !== expected) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_ADJUSTMENT_VERSION_CONFLICT",
        "The adjustment changed. Refresh and retry.",
      );
    }
  }

  private requireOpen(reconciliation: ReconciliationRow): void {
    if (!(["draft", "in_progress"] as const).includes(reconciliation.state as "draft" | "in_progress")) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_ADJUSTMENT_LOCKED",
        "Adjustments can be changed only while the reconciliation is open.",
      );
    }
  }

  private async statement(
    client: PoolClient,
    context: BankingActorContext,
    reconciliation: ReconciliationRow,
    statementLineId: string,
  ): Promise<StatementRow> {
    const row = (
      await client.query<StatementRow>(
        `select line.id,line.import_id,line.transaction_date,line.direction,line.amount::text,
                line.currency,line.reference,line.details
           from bank_statement_line line
          where line.tenant_id=$1 and line.company_id=$2 and line.id=$3
            and line.import_id=$4 and line.inclusion_state='included'
            and line.validation_state in ('valid','warning','duplicate')
            and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
            and line.transaction_date between $5::date and $6::date
            and not exists(
              select 1 from bank_reconciliation_match match
               where match.tenant_id=line.tenant_id and match.company_id=line.company_id
                 and match.statement_line_id=line.id and match.state='confirmed'
            )
          for share of line`,
        [
          context.tenantId,
          reconciliation.company_id,
          statementLineId,
          reconciliation.import_id,
          dateOnly(reconciliation.period_start),
          dateOnly(reconciliation.period_end),
        ],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_ADJUSTMENT_STATEMENT_INELIGIBLE",
        "Select an unmatched included statement row within this reconciliation period.",
      );
    }
    return row;
  }

  private async bank(client: PoolClient, context: BankingActorContext, reconciliation: ReconciliationRow) {
    const row = (
      await client.query<BankRow>(
        `select bank.account_id from bank_account bank
          where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active'
          for share of bank`,
        [context.tenantId, reconciliation.company_id, reconciliation.bank_account_id],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_BANK_ACCOUNT_INVALID",
        "The governed Bank Account is unavailable.",
      );
    }
    return row;
  }

  private async nominal(
    client: PoolClient,
    context: BankingActorContext,
    reconciliation: ReconciliationRow,
    nominalId: string,
  ): Promise<NominalRow> {
    const bank = await this.bank(client, context, reconciliation);
    const row = (
      await client.query<NominalRow>(
        `select nominal.id,nominal.code,nominal.name
           from account nominal
          where nominal.tenant_id=$1 and nominal.company_id=$2 and nominal.id=$3
            and nominal.status='active' and not nominal.is_header and nominal.manual_posting_allowed
            and nominal.required_dimensions='[]'::jsonb and nominal.id<>$4
            and not exists(
              select 1 from bank_account other_bank
               where other_bank.tenant_id=nominal.tenant_id and other_bank.company_id=nominal.company_id
                 and other_bank.account_id=nominal.id and other_bank.status='active'
            )
          for share of nominal`,
        [context.tenantId, reconciliation.company_id, nominalId, bank.account_id],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        400,
        "RECONCILIATION_ADJUSTMENT_NOMINAL_INVALID",
        "Select an active postable non-Bank offset nominal without required dimensions.",
      );
    }
    return row;
  }

  private mapped(row: AdjustmentRow): BankReconciliationAdjustment {
    return {
      id: row.id,
      statement_line_id: row.statement_line_id,
      kind: row.kind,
      offset_nominal_id: row.offset_nominal_id,
      offset_nominal_code: row.offset_nominal_code,
      offset_nominal_name: row.offset_nominal_name,
      narrative: row.narrative,
      direction: row.direction,
      amount: row.amount,
      currency: row.currency,
      state: row.state,
      version: Number(row.row_version),
      created_by: row.created_by,
      submitted_by: row.submitted_by,
      approved_by: row.approved_by,
      posted_by: row.posted_by,
      reversed_by: row.reversed_by,
      journal_id: row.journal_id,
      bank_journal_line_id: row.bank_journal_line_id,
    };
  }

  private async event(
    client: PoolClient,
    context: BankingActorContext,
    row: AdjustmentRow,
    type: "created" | "updated" | "submitted" | "approved" | "rejected" | "posted" | "reversed",
    correlationId: string,
    reason: string | null = null,
  ): Promise<string> {
    const eventId = `bank-reconciliation-adjustment-event-${randomUUID()}`;
    await client.query(
      `insert into bank_reconciliation_adjustment_event
        (tenant_id,company_id,event_id,adjustment_id,adjustment_version,event_type,actor_id,reason,state_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        context.tenantId,
        row.company_id,
        eventId,
        row.id,
        Number(row.row_version),
        type,
        context.actor.userId,
        reason,
        JSON.stringify({
          state: row.state,
          version: Number(row.row_version),
          reconciliation_id: row.reconciliation_id,
          statement_line_id: row.statement_line_id,
          correlation_id: correlationId.slice(0, 128),
        }),
      ],
    );
    return eventId;
  }

  private async reconciliationEvent(
    client: PoolClient,
    context: BankingActorContext,
    reconciliation: ReconciliationRow,
    type: "adjustment_linked" | "unmatched",
    correlationId: string,
    reason: string | null,
  ): Promise<void> {
    await client.query(
      `insert into bank_reconciliation_event
        (tenant_id,company_id,event_id,reconciliation_id,reconciliation_version,event_type,
         actor_id,reason,state_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        context.tenantId,
        reconciliation.company_id,
        `bank-reconciliation-event-${randomUUID()}`,
        reconciliation.id,
        Number(reconciliation.row_version),
        type,
        context.actor.userId,
        reason,
        JSON.stringify({
          state: reconciliation.state,
          version: Number(reconciliation.row_version),
          correlation_id: correlationId.slice(0, 128),
        }),
      ],
    );
  }

  private async recalculate(
    client: PoolClient,
    context: BankingActorContext,
    reconciliation: ReconciliationRow,
  ): Promise<ReconciliationRow> {
    const statements = (
      await client.query<StatementRow>(
        `select line.id,line.import_id,line.transaction_date,line.direction,line.amount::text,
                line.currency,line.reference,line.details
           from bank_statement_line line
          where line.tenant_id=$1 and line.company_id=$2 and line.import_id=$3
            and line.inclusion_state='included' and line.validation_state in ('valid','warning','duplicate')
            and (line.validation_state<>'duplicate' or line.duplicate_disposition='accepted_duplicate')
          order by line.source_row_number,line.id`,
        [context.tenantId, reconciliation.company_id, reconciliation.import_id],
      )
    ).rows.map<ReconciliationStatementLine>((line) => ({
      id: line.id,
      transactionDate: dateOnly(line.transaction_date),
      direction: line.direction,
      amount: line.amount,
      currency: line.currency,
      reference: line.reference,
      details: line.details,
    }));
    const captures = (
      await client.query<CaptureRow>(
        `select capture.journal_line_id,capture.journal_id,capture.posting_date,capture.direction,
                capture.amount::text,capture.currency,capture.reference,capture.narrative,
                journal.status as journal_status
           from bank_reconciliation_ledger_line capture
           join journal_entry journal
             on journal.tenant_id=capture.tenant_id and journal.company_id=capture.company_id
            and journal.id=capture.journal_id
          where capture.tenant_id=$1 and capture.company_id=$2 and capture.reconciliation_id=$3
          order by capture.posting_date,capture.journal_id,capture.journal_line_id`,
        [context.tenantId, reconciliation.company_id, reconciliation.id],
      )
    ).rows;
    const postedCaptures = captures.filter((capture) => capture.journal_status === "posted");
    const confirmed = (
      await client.query<{ statement_line_id: string; journal_line_id: string }>(
        `select match.statement_line_id,match.journal_line_id
           from bank_reconciliation_match match
           join bank_reconciliation_ledger_line capture
             on capture.tenant_id=match.tenant_id and capture.company_id=match.company_id
            and capture.reconciliation_id=match.reconciliation_id
            and capture.journal_line_id=match.journal_line_id
           join journal_entry journal
             on journal.tenant_id=capture.tenant_id and journal.company_id=capture.company_id
            and journal.id=capture.journal_id and journal.status='posted'
          where match.tenant_id=$1 and match.company_id=$2 and match.reconciliation_id=$3
            and match.state='confirmed'`,
        [context.tenantId, reconciliation.company_id, reconciliation.id],
      )
    ).rows;
    const confirmedStatements = new Set(confirmed.map((match) => match.statement_line_id));
    const confirmedLedger = new Set(confirmed.map((match) => match.journal_line_id));
    const bank = await this.bank(client, context, reconciliation);
    const ledgerBalance = (
      await client.query<{ balance: string }>(
        `select coalesce(sum(line.debit-line.credit),0)::numeric(38,8)::text as balance
           from journal_line line
           join journal_entry journal on journal.tenant_id=line.tenant_id and journal.id=line.journal_id
          where journal.tenant_id=$1 and journal.company_id=$2 and line.account_id=$3
            and line.currency=$4 and journal.status in ('posted','reversed')
            and journal.posting_date<=$5::date`,
        [
          context.tenantId,
          reconciliation.company_id,
          bank.account_id,
          reconciliation.currency,
          dateOnly(reconciliation.statement_date),
        ],
      )
    ).rows[0]?.balance;
    const adjustmentCount = (
      await client.query<{ count: string }>(
        `select count(*)::text as count from bank_reconciliation_adjustment
          where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and state<>'reversed'`,
        [context.tenantId, reconciliation.company_id, reconciliation.id],
      )
    ).rows[0]?.count;
    const candidates = postedCaptures.map<ReconciliationLedgerCandidate>((capture) => ({
      journalLineId: capture.journal_line_id,
      journalId: capture.journal_id,
      postingDate: dateOnly(capture.posting_date),
      direction: capture.direction,
      amount: capture.amount,
      currency: capture.currency,
      reference: capture.reference,
      narrative: capture.narrative,
      matched: confirmedLedger.has(capture.journal_line_id),
    }));
    const balances = calculateReconciliationBalances({
      currency: reconciliation.currency,
      currencyDecimals: Number(reconciliation.currency_decimals),
      openingStatementBalance: reconciliation.opening_statement_balance,
      closingStatementBalance: reconciliation.closing_statement_balance,
      ledgerBalanceAtCutoff: ledgerBalance ?? "0.00000000",
      statementLines: statements,
      ledgerCandidates: candidates,
      confirmedStatementLineIds: confirmedStatements,
      adjustmentCount: Number(adjustmentCount ?? 0),
    });
    await client.query(
      `update bank_reconciliation
          set ledger_balance_at_cutoff=$4,statement_money_in=$5,statement_money_out=$6,
              reconstructed_statement_balance=$7,unmatched_ledger_money_in=$8,
              unmatched_ledger_money_out=$9,adjusted_ledger_balance=$10,difference=$11,
              matched_count=$12,unmatched_statement_count=$13,unmatched_ledger_count=$14,
              adjustment_count=$15,ledger_population_hash=$16,ledger_calculated_at=clock_timestamp(),
              row_version=row_version+1,updated_at=clock_timestamp()
        where tenant_id=$1 and company_id=$2 and id=$3`,
      [
        context.tenantId,
        reconciliation.company_id,
        reconciliation.id,
        balances.ledger_balance_at_cutoff,
        balances.statement_money_in,
        balances.statement_money_out,
        balances.reconstructed_statement_balance,
        balances.unmatched_ledger_money_in,
        balances.unmatched_ledger_money_out,
        balances.adjusted_ledger_balance,
        balances.difference,
        balances.matched_count,
        balances.unmatched_statement_count,
        balances.unmatched_ledger_count,
        balances.adjustment_count,
        ledgerPopulationHash(candidates),
      ],
    );
    return this.reconciliation(client, context, reconciliation.id);
  }

  private balances(row: ReconciliationRow & Record<string, unknown>) {
    return {
      currency: row.currency,
      opening_statement_balance: String(row.opening_statement_balance),
      statement_money_in: String(row.statement_money_in),
      statement_money_out: String(row.statement_money_out),
      reconstructed_statement_balance: String(row.reconstructed_statement_balance),
      closing_statement_balance: String(row.closing_statement_balance),
      ledger_balance_at_cutoff: String(row.ledger_balance_at_cutoff),
      unmatched_ledger_money_in: String(row.unmatched_ledger_money_in),
      unmatched_ledger_money_out: String(row.unmatched_ledger_money_out),
      adjusted_ledger_balance: String(row.adjusted_ledger_balance),
      difference: String(row.difference),
      matched_count: Number(row.matched_count),
      unmatched_statement_count: Number(row.unmatched_statement_count),
      unmatched_ledger_count: Number(row.unmatched_ledger_count),
      adjustment_count: Number(row.adjustment_count),
    };
  }

  private result(
    reconciliation: ReconciliationRow,
    adjustment: AdjustmentRow,
    eventId: string,
  ): BankReconciliationAdjustmentMutationResult {
    return bankReconciliationAdjustmentMutationResultSchema.parse({
      reconciliation_id: reconciliation.id,
      reconciliation_version: Number(reconciliation.row_version),
      adjustment: this.mapped(adjustment),
      balances: this.balances(reconciliation as ReconciliationRow & Record<string, unknown>),
      audit_event_id: eventId,
      replayed: false,
    });
  }

  async get(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
  ): Promise<BankReconciliationAdjustment> {
    this.claim(context, "banking.reconciliation_adjustment.read");
    return this.transaction(
      context,
      async (client) => {
        const reconciliation = await this.reconciliation(client, context, reconciliationId);
        await this.scoped(client, context, "banking.reconciliation_adjustment.read", reconciliation.company_id);
        return this.mapped(await this.adjustment(client, context, reconciliation, adjustmentId));
      },
      false,
    );
  }

  async create(
    context: BankingActorContext,
    reconciliationId: string,
    input: CreateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.create");
    return this.transaction(context, async (client) => {
      const reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.create", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          this.version(reconciliation.row_version, input.expected_version);
          if (!reconciliation.import_id) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_IMPORT_REQUIRED",
              "Bank-only adjustments require an imported-statement reconciliation.",
            );
          }
          const statement = await this.statement(client, context, reconciliation, input.statement_line_id);
          await this.nominal(client, context, reconciliation, input.offset_nominal_id);
          const id = `bank-reconciliation-adjustment-${randomUUID()}`;
          await client.query(
            `insert into bank_reconciliation_adjustment
              (tenant_id,company_id,id,reconciliation_id,statement_line_id,kind,offset_nominal_id,
               narrative,direction,amount,currency,created_by)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
            [
              context.tenantId,
              reconciliation.company_id,
              id,
              reconciliation.id,
              statement.id,
              input.kind,
              input.offset_nominal_id,
              input.narrative,
              statement.direction,
              statement.amount,
              statement.currency,
              context.actor.userId,
            ],
          );
          const adjustment = await this.adjustment(client, context, reconciliation, id);
          const eventId = await this.event(client, context, adjustment, "created", correlationId);
          const updatedReconciliation = await this.recalculate(client, context, reconciliation);
          return this.result(updatedReconciliation, adjustment, eventId);
        },
      );
    });
  }

  async update(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: UpdateBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.update");
    return this.transaction(context, async (client) => {
      const reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.update", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments/${adjustmentId}`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          const previous = await this.adjustment(client, context, reconciliation, adjustmentId);
          this.version(previous.row_version, input.expected_version);
          if (previous.state !== "draft") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_NOT_EDITABLE",
              "Only a draft adjustment can be edited.",
            );
          }
          if (input.offset_nominal_id) await this.nominal(client, context, reconciliation, input.offset_nominal_id);
          await client.query(
            `update bank_reconciliation_adjustment
                set kind=coalesce($5,kind),offset_nominal_id=coalesce($6,offset_nominal_id),
                    narrative=coalesce($7,narrative),row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
            [
              context.tenantId,
              reconciliation.company_id,
              reconciliation.id,
              adjustmentId,
              input.kind ?? null,
              input.offset_nominal_id ?? null,
              input.narrative ?? null,
            ],
          );
          const adjustment = await this.adjustment(client, context, reconciliation, adjustmentId);
          const eventId = await this.event(client, context, adjustment, "updated", correlationId);
          return this.result(reconciliation, adjustment, eventId);
        },
      );
    });
  }

  async submit(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: SubmitBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.submit");
    return this.transaction(context, async (client) => {
      const reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.submit", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments/${adjustmentId}/submit`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          const previous = await this.adjustment(client, context, reconciliation, adjustmentId);
          this.version(previous.row_version, input.expected_version);
          if (previous.state !== "draft") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_NOT_SUBMITTABLE",
              "Only a draft adjustment can be submitted.",
            );
          }
          await this.statement(client, context, reconciliation, previous.statement_line_id);
          await this.nominal(client, context, reconciliation, previous.offset_nominal_id);
          await client.query(
            `update bank_reconciliation_adjustment
                set state='submitted',submitted_by=$5,submitted_at=clock_timestamp(),decision_reason=null,
                    row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
            [context.tenantId, reconciliation.company_id, reconciliation.id, adjustmentId, context.actor.userId],
          );
          const adjustment = await this.adjustment(client, context, reconciliation, adjustmentId);
          const eventId = await this.event(client, context, adjustment, "submitted", correlationId);
          return this.result(reconciliation, adjustment, eventId);
        },
      );
    });
  }

  async decide(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: DecideBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.approve");
    return this.transaction(context, async (client) => {
      const reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.approve", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments/${adjustmentId}/decision`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          const previous = await this.adjustment(client, context, reconciliation, adjustmentId);
          this.version(previous.row_version, input.expected_version);
          if (previous.state !== "submitted") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_NOT_DECIDABLE",
              "Only a submitted adjustment can be decided.",
            );
          }
          const evidence = bankDecisionEvidence(input, "Bank Reconciliation adjustment");
          const self = [previous.created_by, previous.submitted_by].includes(context.actor.userId);
          let overrideId: string | null = null;
          if (self) {
            const actor = evaluateApprovalActor({
              account: context.actor,
              makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
              normalDecisionPermission: "banking.reconciliation_adjustment.approve",
              impersonated: false,
            });
            if (actor.kind !== "override" || !(await globalBankOverride(client, context, reconciliation.company_id))) {
              throw new BankingApiError(
                403,
                "RECONCILIATION_ADJUSTMENT_APPROVER_SEPARATION_REQUIRED",
                "An independent approver or governed Super Administrator override is required.",
              );
            }
            overrideId = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [previous.created_by, previous.submitted_by ?? ""],
                normalDecisionPermission: "banking.reconciliation_adjustment.approve",
                resourceType: "bank_reconciliation_adjustment",
                resourceId: adjustmentId,
                decisionAction: input.action,
                reason: evidence.reason,
                correlationId,
                idempotencyKey: `${idempotencyKey}:approval-override`,
                metadata: {
                  company_id: reconciliation.company_id,
                  reconciliation_id: reconciliation.id,
                  statement_line_id: previous.statement_line_id,
                  expected_version: input.expected_version,
                },
                impersonated: false,
              })
            ).eventId;
          }
          if (input.action === "approve") {
            await client.query(
              `update bank_reconciliation_adjustment
                  set state='approved',approved_by=$5,approved_at=clock_timestamp(),decision_reason=$6,
                      approval_override_event_id=$7,row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
              [
                context.tenantId,
                reconciliation.company_id,
                reconciliation.id,
                adjustmentId,
                context.actor.userId,
                evidence.reason,
                overrideId,
              ],
            );
          } else {
            await client.query(
              `update bank_reconciliation_adjustment
                  set state='draft',submitted_by=null,submitted_at=null,approved_by=null,approved_at=null,
                      approval_override_event_id=null,decision_reason=$5,row_version=row_version+1,
                      updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
              [context.tenantId, reconciliation.company_id, reconciliation.id, adjustmentId, evidence.reason],
            );
          }
          const adjustment = await this.adjustment(client, context, reconciliation, adjustmentId);
          const eventId = await this.event(
            client,
            context,
            adjustment,
            input.action === "approve" ? "approved" : "rejected",
            correlationId,
            evidence.reason,
          );
          return this.result(reconciliation, adjustment, eventId);
        },
      );
    });
  }

  async post(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: PostBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.post");
    return this.transaction(context, async (client) => {
      let reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.post", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments/${adjustmentId}/post`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          const previous = await this.adjustment(client, context, reconciliation, adjustmentId);
          this.version(previous.row_version, input.expected_version);
          if (previous.state !== "approved") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_NOT_POSTABLE",
              "Only an approved adjustment can be posted.",
            );
          }
          const statement = await this.statement(client, context, reconciliation, previous.statement_line_id);
          const nominal = await this.nominal(client, context, reconciliation, previous.offset_nominal_id);
          const bank = await this.bank(client, context, reconciliation);
          const rate = await resolveCompanyCurrencyAuthority(client, {
            tenantId: context.tenantId,
            companyId: reconciliation.company_id,
            sourceCurrency: previous.currency,
            effectiveOnOrBefore: dateOnly(statement.transaction_date),
          });
          const financeClient = await createFinanceTransactionClient(client);
          // PostgreSQL numeric values retain the column scale (for example,
          // 25.00000000). Finance intentionally validates the supplied scale
          // against the transaction currency, so remove insignificant trailing
          // zeroes without rounding or otherwise changing statement evidence.
          const amount = normalizeFinanceAmount(previous.amount);
          const description = previous.narrative;
          const posted = await this.finance.post(financeClient, {
            tenantId: context.tenantId,
            companyId: reconciliation.company_id,
            actorId: context.actor.userId,
            sourceType: "banking.reconciliation_adjustment",
            sourceId: adjustmentId,
            eventType: "bank_reconciliation_adjustment.posted",
            externalIdempotencyKey: idempotencyKey,
            transactionCurrency: previous.currency,
            postingDate: dateOnly(statement.transaction_date),
            exchangeRateId: rate.rateId,
            exchangeRateValue: rate.rateValue,
            payloadHashMaterial: {
              adjustment_id: adjustmentId,
              reconciliation_id: reconciliation.id,
              statement_line_id: statement.id,
              adjustment_kind: previous.kind,
              adjustment_version: Number(previous.row_version),
            },
            auditRef: correlationId,
            lines: buildAdjustmentPostingLines({
              direction: previous.direction,
              amount,
              bankAccountId: reconciliation.bank_account_id,
              bankNominalId: bank.account_id,
              offsetNominalId: nominal.id,
              adjustmentKind: previous.kind,
              narrative: description,
            }),
          });
          const bankLine = (
            await client.query<{ id: string }>(
              `select id from journal_line
                where tenant_id=$1 and journal_id=$2 and account_id=$3
                order by line_number limit 2 for share`,
              [context.tenantId, posted.journalId, bank.account_id],
            )
          ).rows;
          if (bankLine.length !== 1) {
            throw new BankingApiError(
              500,
              "RECONCILIATION_ADJUSTMENT_POSTING_FAILED",
              "The posted adjustment Bank line could not be identified safely.",
            );
          }
          await client.query(
            `update bank_reconciliation_adjustment
                set state='posted',posted_by=$5,posted_at=clock_timestamp(),accounting_event_id=$6,
                    journal_id=$7,bank_journal_line_id=$8,row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
            [
              context.tenantId,
              reconciliation.company_id,
              reconciliation.id,
              adjustmentId,
              context.actor.userId,
              posted.accountingEventId,
              posted.journalId,
              bankLine[0]!.id,
            ],
          );
          await client.query(
            `insert into bank_reconciliation_ledger_line
              (tenant_id,company_id,reconciliation_id,journal_line_id,journal_id,posting_date,
               direction,amount,currency,reference,narrative)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)`,
            [
              context.tenantId,
              reconciliation.company_id,
              reconciliation.id,
              bankLine[0]!.id,
              posted.journalId,
              dateOnly(statement.transaction_date),
              previous.direction,
              previous.amount,
              previous.currency,
              posted.entryNumber,
            ],
          );
          await client.query(
            `insert into bank_reconciliation_match
              (tenant_id,company_id,id,reconciliation_id,statement_line_id,journal_line_id,
               match_type,state,confidence_score,reason_codes,decided_by,decided_at,created_by)
             values($1,$2,$3,$4,$5,$6,'manual','confirmed',1,$7::jsonb,$8,clock_timestamp(),$8)`,
            [
              context.tenantId,
              reconciliation.company_id,
              `bank-reconciliation-match-${randomUUID()}`,
              reconciliation.id,
              statement.id,
              bankLine[0]!.id,
              JSON.stringify(["POSTED_ADJUSTMENT_EVIDENCE"]),
              context.actor.userId,
            ],
          );
          const adjustment = await this.adjustment(client, context, reconciliation, adjustmentId);
          reconciliation = await this.recalculate(client, context, reconciliation);
          await this.reconciliationEvent(client, context, reconciliation, "adjustment_linked", correlationId, null);
          const eventId = await this.event(client, context, adjustment, "posted", correlationId);
          return this.result(reconciliation, adjustment, eventId);
        },
      );
    });
  }

  async reverse(
    context: BankingActorContext,
    reconciliationId: string,
    adjustmentId: string,
    input: ReverseBankReconciliationAdjustmentRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationAdjustmentMutationResult> {
    this.claim(context, "banking.reconciliation_adjustment.reverse");
    return this.transaction(context, async (client) => {
      let reconciliation = await this.reconciliation(client, context, reconciliationId);
      await this.scoped(client, context, "banking.reconciliation_adjustment.reverse", reconciliation.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${reconciliationId}/adjustments/${adjustmentId}/reverse`,
        input,
        idempotencyKey,
        async () => {
          this.requireOpen(reconciliation);
          const previous = await this.adjustment(client, context, reconciliation, adjustmentId);
          this.version(previous.row_version, input.expected_version);
          if (
            previous.state !== "posted" ||
            !previous.accounting_event_id ||
            !previous.journal_id ||
            !previous.bank_journal_line_id
          ) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_ADJUSTMENT_NOT_REVERSIBLE",
              "Only a posted adjustment can be reversed.",
            );
          }
          // The match guard verifies that its ledger journal is still posted.
          // Reject the match before Finance reverses that journal; the enclosing
          // transaction keeps the two state changes atomic if reversal fails.
          await client.query(
            `update bank_reconciliation_match
                set state='rejected',decided_by=$5,decided_at=clock_timestamp(),decision_reason=$6,
                    row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and journal_line_id=$4
                and state='confirmed'`,
            [
              context.tenantId,
              reconciliation.company_id,
              reconciliation.id,
              previous.bank_journal_line_id,
              context.actor.userId,
              input.reason,
            ],
          );
          const financeClient = await createFinanceTransactionClient(client);
          const reversed = await this.finance.reverse(financeClient, {
            tenantId: context.tenantId,
            companyId: reconciliation.company_id,
            actorId: context.actor.userId,
            sourceType: "banking.reconciliation_adjustment",
            sourceId: adjustmentId,
            eventType: "bank_reconciliation_adjustment.reversed",
            originalEventType: "bank_reconciliation_adjustment.posted",
            originalAccountingEventId: previous.accounting_event_id,
            originalJournalId: previous.journal_id,
            externalIdempotencyKey: idempotencyKey,
            transactionCurrency: previous.currency,
            payloadHashMaterial: {
              adjustment_id: adjustmentId,
              reconciliation_id: reconciliation.id,
              adjustment_version: Number(previous.row_version),
              reason_hash: hash(input.reason),
            },
            auditRef: correlationId,
          });
          await client.query(
            `update bank_reconciliation_adjustment
                set state='reversed',reversed_by=$5,reversed_at=clock_timestamp(),reversal_reason=$6,
                    reversal_accounting_event_id=$7,reversal_journal_id=$8,
                    row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4`,
            [
              context.tenantId,
              reconciliation.company_id,
              reconciliation.id,
              adjustmentId,
              context.actor.userId,
              input.reason,
              reversed.accountingEventId,
              reversed.journalId,
            ],
          );
          const adjustment = await this.adjustment(client, context, reconciliation, adjustmentId);
          reconciliation = await this.recalculate(client, context, reconciliation);
          await this.reconciliationEvent(client, context, reconciliation, "unmatched", correlationId, input.reason);
          const eventId = await this.event(client, context, adjustment, "reversed", correlationId, input.reason);
          return this.result(reconciliation, adjustment, eventId);
        },
      );
    });
  }

  private mapFinanceError(error: FinancePostingError): BankingApiError {
    const mapping: Partial<Record<FinancePostingError["code"], string>> = {
      FINANCE_PERIOD_CLOSED_POST_BLOCKED: "RECONCILIATION_ADJUSTMENT_PERIOD_LOCKED",
      FINANCE_PERIOD_UNAVAILABLE: "RECONCILIATION_ADJUSTMENT_PERIOD_LOCKED",
      FINANCE_EXCHANGE_RATE_MISSING: "RECONCILIATION_ADJUSTMENT_FX_RATE_UNAVAILABLE",
      FINANCE_EXCHANGE_RATE_CHANGED: "RECONCILIATION_ADJUSTMENT_FX_RATE_CHANGED",
      FINANCE_ACCOUNT_INVALID: "RECONCILIATION_ADJUSTMENT_NOMINAL_INVALID",
      FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED: "RECONCILIATION_ADJUSTMENT_NOMINAL_INVALID",
      FINANCE_ACCOUNT_NOT_POSTABLE: "RECONCILIATION_ADJUSTMENT_NOMINAL_INVALID",
      FINANCE_DIMENSION_REQUIRED: "RECONCILIATION_ADJUSTMENT_DIMENSION_REQUIRED",
      FINANCE_IDEMPOTENCY_CONFLICT: "RECONCILIATION_ADJUSTMENT_IDEMPOTENCY_CONFLICT",
      FINANCE_SOURCE_ALREADY_POSTED: "RECONCILIATION_ADJUSTMENT_ALREADY_POSTED",
      FINANCE_REVERSAL_ALREADY_EXISTS: "RECONCILIATION_ADJUSTMENT_ALREADY_REVERSED",
    };
    return new BankingApiError(
      error.status,
      mapping[error.code] ?? "RECONCILIATION_ADJUSTMENT_POSTING_FAILED",
      error.message,
    );
  }
}
