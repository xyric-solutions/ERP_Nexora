import { createHash, randomUUID } from "node:crypto";

import { evaluateApprovalActor } from "@nexora/auth";
import {
  bankReconciliationDetailSchema,
  bankReconciliationDirectorySchema,
  bankReconciliationMatchMutationResultSchema,
  bankReconciliationManualSelectionMutationResultSchema,
  bankReconciliationMutationResultSchema,
  bankReconciliationSetupSchema,
  type BankReconciliationDetail,
  type BankReconciliationDirectory,
  type BankReconciliationDirectoryQuery,
  type BankReconciliationMatch,
  type BankReconciliationMatchMutationResult,
  type BankReconciliationManualSelectionMutationResult,
  type BankReconciliationMutationResult,
  type BankReconciliationSetup,
  type BankReconciliationSetupQuery,
  type CreateBankReconciliationMatchRequest,
  type CreateBankReconciliationRequest,
  type DecideBankReconciliationMatchRequest,
  type DecideBankReconciliationRequest,
  type SubmitBankReconciliationRequest,
  type SetBankReconciliationManualSelectionRequest,
  type UnmatchBankReconciliationRequest,
} from "@nexora/contracts";
import type { Pool, PoolClient } from "pg";

import { ApprovalOverrideWriterError, writeApprovalOverrideEvent } from "../../security/approval-override-writer.js";
import { bankDecisionEvidence } from "../decision-evidence.js";
import { BankingApiError, type BankingActorContext } from "../source-repository.js";
import { globalBankOverride } from "../workflow-context.js";
import {
  buildReconciliationMatches,
  calculateManualReconciliationBalances,
  calculateReconciliationBalances,
  ledgerPopulationHash,
  type ReconciliationBalances,
  type ReconciliationLedgerCandidate,
  type ReconciliationStatementLine,
} from "./matching.js";
import type { BankingReconciliationRepository } from "./service.js";

type ReconciliationState = "draft" | "in_progress" | "submitted" | "approved";

type ReconciliationRow = {
  id: string;
  company_id: string;
  bank_account_id: string;
  bank_account_name: string;
  method: "statement_import" | "manual_tick";
  import_id: string | null;
  reconciliation_date: string | Date;
  statement_date: string | Date;
  period_start: string | Date;
  period_end: string | Date;
  statement_reference: string;
  currency: string;
  currency_decimals: number;
  opening_statement_balance: string;
  statement_money_in: string;
  statement_money_out: string;
  reconstructed_statement_balance: string;
  closing_statement_balance: string;
  ledger_balance_at_cutoff: string;
  unmatched_ledger_money_in: string;
  unmatched_ledger_money_out: string;
  adjusted_ledger_balance: string;
  difference: string;
  matched_count: number;
  unmatched_statement_count: number;
  unmatched_ledger_count: number;
  adjustment_count: number;
  available_ledger_money_in: string;
  available_ledger_money_out: string;
  selected_ledger_money_in: string;
  selected_ledger_money_out: string;
  calculated_selected_balance: string;
  ledger_population_hash: string;
  ledger_calculated_at: string | Date;
  state: ReconciliationState;
  prepared_by: string;
  submitted_by: string | null;
  submitted_at: string | Date | null;
  approved_by: string | null;
  approved_at: string | Date | null;
  decision_reason: string | null;
  approval_override_event_id: string | null;
  row_version: string | number;
  created_at: string | Date;
  updated_at: string | Date;
};

type BankRow = {
  id: string;
  account_id: string;
  account_name: string;
  currency: string;
  currency_decimals: number;
};

type StatementLineRow = {
  id: string;
  import_id: string;
  source_row_number: number;
  raw_row: Record<string, string | null>;
  transaction_date: string | Date | null;
  direction: "money_in" | "money_out" | null;
  amount: string | null;
  currency: string;
  reference: string | null;
  details: string | null;
  transaction_type: string | null;
  account_text: string | null;
  payment_mode: string | null;
  row_fingerprint: string;
  inclusion_state: "included" | "excluded";
  exclusion_reason: string | null;
  validation_state: "valid" | "warning" | "duplicate" | "error";
  duplicate_disposition: "not_applicable" | "unresolved" | "accepted_duplicate" | "rejected_duplicate";
  validation_issues: unknown;
  row_version: string | number;
};

type LedgerRow = {
  journal_line_id: string;
  journal_id: string;
  journal_entry_number: string;
  posting_date: string | Date;
  direction: "money_in" | "money_out";
  amount: string;
  currency: string;
  reference: string | null;
  narrative: string | null;
  reconciled_at: string | Date | null;
  journal_status: "posted" | "reversed";
  manual_selected?: boolean;
};

type MatchRow = {
  id: string;
  statement_line_id: string;
  journal_line_id: string;
  match_type: "exact" | "suggested" | "manual";
  state: "proposed" | "confirmed" | "rejected";
  confidence_score: string | number;
  reason_codes: unknown;
  decided_by: string | null;
  decided_at: string | Date | null;
  decision_reason: string | null;
  row_version: string | number;
};

const iso = (value: string | Date | null) => (value === null ? null : new Date(value).toISOString());
const dateOnly = (value: string | Date | null) =>
  value === null
    ? null
    : value instanceof Date
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

export class SourceBankReconciliationRepository implements BankingReconciliationRepository {
  constructor(private readonly pool: Pool) {}

  private claim(context: BankingActorContext, permission: string): void {
    if (context.tenantId !== context.actor.tenantId || !context.actor.permissions.includes(permission)) {
      throw new BankingApiError(
        403,
        "PERMISSION_DENIED",
        "You are not permitted to perform this Bank Reconciliation operation.",
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
    mutation: boolean,
    work: (client: PoolClient) => Promise<T>,
  ): Promise<T> {
    if (mutation && (context.realActorId || context.impersonationRequestId)) {
      throw new BankingApiError(
        403,
        "IMPERSONATION_RESTRICTED",
        "Mutating Bank Reconciliation operations are disabled during impersonation.",
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
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        ["23P01", "23503", "23505", "23514", "40001", "40P01"].includes(String(error.code))
      ) {
        throw new BankingApiError(
          409,
          "RECONCILIATION_AUTHORITY_CONFLICT",
          "Reconciliation evidence or a concurrent change conflicted. Refresh and retry.",
        );
      }
      throw error;
    } finally {
      client.release();
    }
  }

  private async idempotent<T>(
    client: PoolClient,
    context: BankingActorContext,
    path: string,
    input: unknown,
    key: string,
    parse: (value: unknown, replayed: boolean) => T,
    work: () => Promise<T>,
  ): Promise<T> {
    if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,254}$/u.test(key)) {
      throw new BankingApiError(400, "INVALID_IDEMPOTENCY_KEY", "A valid idempotency key is required.");
    }
    await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
      `nexora:reconciliation:${context.tenantId}:${context.actor.userId}:${path}:${key}`,
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
      return parse(prior.response_body, true);
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

  private async bank(
    client: PoolClient,
    context: BankingActorContext,
    companyId: string,
    bankAccountId: string,
  ): Promise<BankRow> {
    const row = (
      await client.query<BankRow>(
        `select bank.id,bank.account_id,bank.account_name,bank.currency,currency.decimal_places as currency_decimals
           from bank_account bank
           join account ledger
             on ledger.tenant_id=bank.tenant_id and ledger.company_id=bank.company_id and ledger.id=bank.account_id
           join currency
             on currency.tenant_id=bank.tenant_id and currency.code=bank.currency and currency.status='active'
          where bank.tenant_id=$1 and bank.company_id=$2 and bank.id=$3 and bank.status='active'
            and ledger.status='active' and not ledger.is_header and ledger.reconciliation_required
          for share of bank,ledger,currency`,
        [context.tenantId, companyId, bankAccountId],
      )
    ).rows[0];
    if (!row) {
      throw new BankingApiError(
        400,
        "RECONCILIATION_BANK_ACCOUNT_INVALID",
        "Select an active same-company Bank Account with an approved reconciliation nominal.",
      );
    }
    return row;
  }

  private async header(
    client: PoolClient,
    context: BankingActorContext,
    id: string,
    lock = false,
  ): Promise<ReconciliationRow> {
    const row = (
      await client.query<ReconciliationRow>(
        `select reconciliation.*,bank.account_name as bank_account_name,
                currency.decimal_places as currency_decimals
           from bank_reconciliation reconciliation
           join bank_account bank
             on bank.tenant_id=reconciliation.tenant_id and bank.company_id=reconciliation.company_id
            and bank.id=reconciliation.bank_account_id
           join currency
             on currency.tenant_id=reconciliation.tenant_id and currency.code=reconciliation.currency
          where reconciliation.tenant_id=$1 and reconciliation.id=$2${lock ? " for update of reconciliation" : ""}`,
        [context.tenantId, id],
      )
    ).rows[0];
    if (!row) throw new BankingApiError(404, "RECONCILIATION_NOT_FOUND", "The Bank Reconciliation was not found.");
    return row;
  }

  private version(row: ReconciliationRow, expected: number): void {
    if (Number(row.row_version) !== expected) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_VERSION_CONFLICT",
        "The reconciliation changed. Reload and retry.",
      );
    }
  }

  private balances(row: ReconciliationRow): ReconciliationBalances {
    return {
      currency: row.currency,
      opening_statement_balance: row.opening_statement_balance,
      statement_money_in: row.statement_money_in,
      statement_money_out: row.statement_money_out,
      reconstructed_statement_balance: row.reconstructed_statement_balance,
      closing_statement_balance: row.closing_statement_balance,
      ledger_balance_at_cutoff: row.ledger_balance_at_cutoff,
      unmatched_ledger_money_in: row.unmatched_ledger_money_in,
      unmatched_ledger_money_out: row.unmatched_ledger_money_out,
      adjusted_ledger_balance: row.adjusted_ledger_balance,
      difference: row.difference,
      matched_count: Number(row.matched_count),
      unmatched_statement_count: Number(row.unmatched_statement_count),
      unmatched_ledger_count: Number(row.unmatched_ledger_count),
      adjustment_count: Number(row.adjustment_count),
      available_ledger_money_in: row.available_ledger_money_in,
      available_ledger_money_out: row.available_ledger_money_out,
      selected_ledger_money_in: row.selected_ledger_money_in,
      selected_ledger_money_out: row.selected_ledger_money_out,
      calculated_selected_balance: row.calculated_selected_balance,
    };
  }

  private summary(row: ReconciliationRow) {
    return {
      id: row.id,
      company_id: row.company_id,
      bank_account_id: row.bank_account_id,
      bank_account_name: row.bank_account_name,
      method: row.method,
      import_id: row.import_id,
      reconciliation_date: dateOnly(row.reconciliation_date),
      statement_date: dateOnly(row.statement_date),
      period_start: dateOnly(row.period_start),
      period_end: dateOnly(row.period_end),
      statement_reference: row.statement_reference,
      balances: this.balances(row),
      state: row.state,
      prepared_by: row.prepared_by,
      submitted_by: row.submitted_by,
      approved_by: row.approved_by,
      version: Number(row.row_version),
      created_at: iso(row.created_at),
      submitted_at: iso(row.submitted_at),
      approved_at: iso(row.approved_at),
    };
  }

  private mutation(row: ReconciliationRow, eventId: string, replayed = false): BankReconciliationMutationResult {
    return bankReconciliationMutationResultSchema.parse({
      id: row.id,
      state: row.state,
      version: Number(row.row_version),
      audit_event_id: eventId,
      replayed,
    });
  }

  private async event(
    client: PoolClient,
    context: BankingActorContext,
    row: ReconciliationRow,
    type:
      | "created"
      | "ledger_captured"
      | "match_proposed"
      | "match_confirmed"
      | "match_rejected"
      | "unmatched"
      | "submitted"
      | "approved"
      | "returned",
    correlationId: string,
    reason: string | null = null,
  ): Promise<string> {
    const eventId = `bank-reconciliation-event-${randomUUID()}`;
    await client.query(
      `insert into bank_reconciliation_event
        (tenant_id,company_id,event_id,reconciliation_id,reconciliation_version,event_type,
         actor_id,reason,state_snapshot)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        context.tenantId,
        row.company_id,
        eventId,
        row.id,
        row.row_version,
        type,
        context.actor.userId,
        reason,
        JSON.stringify({
          state: row.state,
          version: Number(row.row_version),
          balances: this.balances(row),
          correlation_id: correlationId.slice(0, 128),
        }),
      ],
    );
    return eventId;
  }

  private async importedStatementLines(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<ReconciliationRow, "company_id" | "import_id">,
  ): Promise<StatementLineRow[]> {
    if (!row.import_id) return [];
    return (
      await client.query<StatementLineRow>(
        `select id,import_id,source_row_number,raw_row,transaction_date,direction,amount::text,currency,
                reference,details,transaction_type,account_text,payment_mode,row_fingerprint,inclusion_state,
                exclusion_reason,validation_state,duplicate_disposition,validation_issues,row_version
           from bank_statement_line
          where tenant_id=$1 and company_id=$2 and import_id=$3 and inclusion_state='included'
            and validation_state in ('valid','warning','duplicate')
            and (validation_state<>'duplicate' or duplicate_disposition='accepted_duplicate')
          order by source_row_number,id`,
        [context.tenantId, row.company_id, row.import_id],
      )
    ).rows;
  }

  private matchingStatementLines(rows: readonly StatementLineRow[]): ReconciliationStatementLine[] {
    return rows.map((line) => {
      if (!line.transaction_date || !line.direction || !line.amount) {
        throw new BankingApiError(409, "RECONCILIATION_STATEMENT_INVALID", "A finalized statement row is invalid.");
      }
      return {
        id: line.id,
        transactionDate: dateOnly(line.transaction_date)!,
        direction: line.direction,
        amount: line.amount,
        currency: line.currency,
        reference: line.reference,
        details: line.details,
      };
    });
  }

  private async currentLedgerPopulation(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<ReconciliationRow, "company_id" | "bank_account_id" | "statement_date" | "period_start" | "period_end">,
    lock: boolean,
  ): Promise<LedgerRow[]> {
    const bank = await this.bank(client, context, row.company_id, row.bank_account_id);
    const result = await client.query<LedgerRow>(
      `select line.id as journal_line_id,journal.id as journal_id,journal.entry_number as journal_entry_number,
              journal.posting_date,
              case when line.debit>0 then 'money_in' else 'money_out' end as direction,
              case when line.debit>0 then line.debit::text else line.credit::text end as amount,
              line.currency,
              left(coalesce(event.payload->'payload'->>'payment_reference',
                            event.payload->'payload'->>'receipt_reference',
                            event.payload->'payload'->>'transfer_reference',journal.entry_number),128) as reference,
              left(coalesce(event.payload->'lines'->(line.line_number-1)->>'description',journal.entry_number),500) as narrative,
              null::timestamptz as reconciled_at,journal.status as journal_status
         from journal_line line
         join journal_entry journal
           on journal.tenant_id=line.tenant_id and journal.id=line.journal_id
         left join accounting_event event
           on journal.source_type='accounting_event' and event.tenant_id=journal.tenant_id and event.id=journal.source_id
        where journal.tenant_id=$1 and journal.company_id=$2 and line.account_id=$3
          and line.currency=$4 and journal.status='posted'
          and journal.posting_date between $5::date and $6::date
          and journal.posting_date<=$7::date
          and not exists(
              select 1 from bank_reconciliation_adjustment adjustment
               where adjustment.tenant_id=journal.tenant_id and adjustment.company_id=journal.company_id
                 and adjustment.reversal_journal_id=journal.id and adjustment.state='reversed'
          )
          and not exists(
              select 1 from bank_reconciliation_ledger_line used
               where used.tenant_id=line.tenant_id and used.company_id=journal.company_id
                 and used.journal_line_id=line.id and used.reconciled_at is not null
          )
        order by journal.posting_date,journal.id,line.id
        limit 2001${lock ? " for share of journal,line" : ""}`,
      [
        context.tenantId,
        row.company_id,
        bank.account_id,
        bank.currency,
        dateOnly(row.period_start),
        dateOnly(row.period_end),
        dateOnly(row.statement_date),
      ],
    );
    if (result.rows.length > 2_000) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_LEDGER_POPULATION_TOO_LARGE",
        "The eligible ledger population exceeds 2,000 lines. Use a narrower statement cutoff.",
      );
    }
    return result.rows;
  }

  private ledgerCandidate(row: LedgerRow, matched = false): ReconciliationLedgerCandidate {
    return {
      journalLineId: row.journal_line_id,
      journalId: row.journal_id,
      postingDate: dateOnly(row.posting_date)!,
      direction: row.direction,
      amount: row.amount,
      currency: row.currency,
      reference: row.reference,
      narrative: row.narrative,
      matched,
    };
  }

  private async ledgerBalanceAtCutoff(
    client: PoolClient,
    context: BankingActorContext,
    bank: BankRow,
    companyId: string,
    statementDate: string,
  ): Promise<string> {
    const result = await client.query<{ balance: string }>(
      `select coalesce(sum(line.debit-line.credit),0)::numeric(38,8)::text as balance
         from journal_line line
         join journal_entry journal on journal.tenant_id=line.tenant_id and journal.id=line.journal_id
        where journal.tenant_id=$1 and journal.company_id=$2 and line.account_id=$3
          and line.currency=$4 and journal.status in ('posted','reversed')
          and journal.posting_date<=$5::date`,
      [context.tenantId, companyId, bank.account_id, bank.currency, statementDate],
    );
    return result.rows[0]?.balance ?? "0.00000000";
  }

  private async openingBalance(
    client: PoolClient,
    context: BankingActorContext,
    bank: BankRow,
    companyId: string,
    periodStart: string,
  ): Promise<{
    amount: string;
    source: "last_approved_reconciliation" | "ledger_before_period";
    reconciliationId: string | null;
    statementDate: string | null;
  }> {
    const prior = (
      await client.query<{ id: string; statement_date: string | Date; closing_statement_balance: string }>(
        `select id,statement_date,closing_statement_balance::text
           from bank_reconciliation
          where tenant_id=$1 and company_id=$2 and bank_account_id=$3 and state='approved'
            and period_end<$4::date
          order by period_end desc,approved_at desc,id desc
          limit 1`,
        [context.tenantId, companyId, bank.id, periodStart],
      )
    ).rows[0];
    if (prior) {
      return {
        amount: prior.closing_statement_balance,
        source: "last_approved_reconciliation",
        reconciliationId: prior.id,
        statementDate: dateOnly(prior.statement_date),
      };
    }
    const result = await client.query<{ balance: string }>(
      `select coalesce(sum(line.debit-line.credit),0)::numeric(38,8)::text as balance
         from journal_line line
         join journal_entry journal on journal.tenant_id=line.tenant_id and journal.id=line.journal_id
        where journal.tenant_id=$1 and journal.company_id=$2 and line.account_id=$3
          and line.currency=$4 and journal.status in ('posted','reversed')
          and journal.posting_date<$5::date`,
      [context.tenantId, companyId, bank.account_id, bank.currency, periodStart],
    );
    return {
      amount: result.rows[0]?.balance ?? "0.00000000",
      source: "ledger_before_period",
      reconciliationId: null,
      statementDate: null,
    };
  }

  private async capturedLedger(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<ReconciliationRow, "company_id" | "id">,
  ): Promise<LedgerRow[]> {
    return (
      await client.query<LedgerRow>(
        `select capture.journal_line_id,capture.journal_id,journal.entry_number as journal_entry_number,
                capture.posting_date,capture.direction,capture.amount::text,capture.currency,
                capture.reference,capture.narrative,capture.reconciled_at,journal.status as journal_status
                ,coalesce(selection.selected,false) as manual_selected
           from bank_reconciliation_ledger_line capture
           join journal_entry journal
             on journal.tenant_id=capture.tenant_id and journal.company_id=capture.company_id
             and journal.id=capture.journal_id
           left join bank_reconciliation_manual_selection selection
             on selection.tenant_id=capture.tenant_id and selection.company_id=capture.company_id
            and selection.reconciliation_id=capture.reconciliation_id
            and selection.journal_line_id=capture.journal_line_id
          where capture.tenant_id=$1 and capture.company_id=$2 and capture.reconciliation_id=$3
          order by capture.posting_date,capture.journal_id,capture.journal_line_id`,
        [context.tenantId, row.company_id, row.id],
      )
    ).rows;
  }

  private async matches(
    client: PoolClient,
    context: BankingActorContext,
    row: Pick<ReconciliationRow, "company_id" | "id">,
  ): Promise<MatchRow[]> {
    return (
      await client.query<MatchRow>(
        `select id,statement_line_id,journal_line_id,match_type,state,confidence_score::text,
                reason_codes,decided_by,decided_at,decision_reason,row_version
           from bank_reconciliation_match
          where tenant_id=$1 and company_id=$2 and reconciliation_id=$3
          order by created_at,id`,
        [context.tenantId, row.company_id, row.id],
      )
    ).rows;
  }

  private match(row: MatchRow): BankReconciliationMatch {
    return {
      id: row.id,
      statement_line_id: row.statement_line_id,
      journal_line_id: row.journal_line_id,
      match_type: row.match_type,
      state: row.state,
      confidence_score: Number(row.confidence_score),
      reason_codes: row.reason_codes as string[],
      decided_by: row.decided_by,
      decided_at: iso(row.decided_at),
      version: Number(row.row_version),
    };
  }

  private async calculate(
    client: PoolClient,
    context: BankingActorContext,
    row: ReconciliationRow,
  ): Promise<ReconciliationBalances> {
    const captures = (await this.capturedLedger(client, context, row)).filter(
      (capture) => capture.journal_status === "posted",
    );
    if (row.method === "manual_tick") {
      return calculateManualReconciliationBalances({
        currency: row.currency,
        currencyDecimals: Number(row.currency_decimals),
        openingStatementBalance: row.opening_statement_balance,
        closingStatementBalance: row.closing_statement_balance,
        ledgerBalanceAtCutoff: row.ledger_balance_at_cutoff,
        ledgerCandidates: captures.map((capture) => ({
          ...this.ledgerCandidate(capture),
          selected: Boolean(capture.manual_selected),
        })),
      });
    }
    const statements = this.matchingStatementLines(await this.importedStatementLines(client, context, row));
    const confirmed = (
      await client.query<{ statement_line_id: string; journal_line_id: string }>(
        `select statement_line_id,journal_line_id from bank_reconciliation_match
          where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and state='confirmed'`,
        [context.tenantId, row.company_id, row.id],
      )
    ).rows;
    const confirmedStatements = new Set(confirmed.map((match) => match.statement_line_id));
    const confirmedLedger = new Set(confirmed.map((match) => match.journal_line_id));
    const adjustments = await client.query<{ count: string }>(
      `select count(*)::text as count from bank_reconciliation_adjustment
        where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and state<>'reversed'`,
      [context.tenantId, row.company_id, row.id],
    );
    return calculateReconciliationBalances({
      currency: row.currency,
      currencyDecimals: Number(row.currency_decimals),
      openingStatementBalance: row.opening_statement_balance,
      closingStatementBalance: row.closing_statement_balance,
      ledgerBalanceAtCutoff: row.ledger_balance_at_cutoff,
      statementLines: statements,
      ledgerCandidates: captures.map((capture) =>
        this.ledgerCandidate(capture, confirmedLedger.has(capture.journal_line_id)),
      ),
      confirmedStatementLineIds: confirmedStatements,
      adjustmentCount: Number(adjustments.rows[0]?.count ?? 0),
    });
  }

  private async updateBalances(
    client: PoolClient,
    context: BankingActorContext,
    row: ReconciliationRow,
    state: ReconciliationState,
  ): Promise<ReconciliationRow> {
    const balances = await this.calculate(client, context, row);
    await client.query(
      `update bank_reconciliation
          set statement_money_in=$4,statement_money_out=$5,reconstructed_statement_balance=$6,
              unmatched_ledger_money_in=$7,unmatched_ledger_money_out=$8,adjusted_ledger_balance=$9,
               difference=$10,matched_count=$11,unmatched_statement_count=$12,unmatched_ledger_count=$13,
               adjustment_count=$14,state=$15,available_ledger_money_in=$16,
               available_ledger_money_out=$17,selected_ledger_money_in=$18,
               selected_ledger_money_out=$19,calculated_selected_balance=$20,
               row_version=row_version+1,updated_at=clock_timestamp()
        where tenant_id=$1 and company_id=$2 and id=$3`,
      [
        context.tenantId,
        row.company_id,
        row.id,
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
        state,
        balances.available_ledger_money_in ?? "0.00000000",
        balances.available_ledger_money_out ?? "0.00000000",
        balances.selected_ledger_money_in ?? "0.00000000",
        balances.selected_ledger_money_out ?? "0.00000000",
        balances.calculated_selected_balance ?? balances.adjusted_ledger_balance,
      ],
    );
    return this.header(client, context, row.id, true);
  }

  private async assertPopulationStable(
    client: PoolClient,
    context: BankingActorContext,
    row: ReconciliationRow,
  ): Promise<void> {
    const captured = (await this.capturedLedger(client, context, row)).filter(
      (candidate) => candidate.journal_status === "posted",
    );
    const capturedHash = ledgerPopulationHash(captured.map((candidate) => this.ledgerCandidate(candidate)));
    if (capturedHash !== row.ledger_population_hash) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_LEDGER_REFRESH_REQUIRED",
        "The captured Bank ledger evidence is no longer consistent. Create a refreshed reconciliation before continuing.",
      );
    }
    const current = await this.currentLedgerPopulation(client, context, row, true);
    const currentHash = ledgerPopulationHash(current.map((candidate) => this.ledgerCandidate(candidate)));
    if (currentHash !== row.ledger_population_hash) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_LEDGER_REFRESH_REQUIRED",
        current.length === captured.length
          ? "The posted Bank ledger evidence changed. Create a refreshed reconciliation before continuing."
          : current.length > captured.length
            ? "New posted Bank ledger entries exist. Create a refreshed reconciliation before continuing."
            : "Captured Bank ledger entries are no longer eligible. Create a refreshed reconciliation before continuing.",
      );
    }
    const reversed = await client.query<{ exists: boolean }>(
      `select exists(
         select 1 from bank_reconciliation_ledger_line capture
         join journal_entry journal
           on journal.tenant_id=capture.tenant_id and journal.company_id=capture.company_id
          and journal.id=capture.journal_id
        where capture.tenant_id=$1 and capture.company_id=$2 and capture.reconciliation_id=$3
          and journal.status<>'posted'
          and not exists(
              select 1 from bank_reconciliation_adjustment adjustment
               where adjustment.tenant_id=capture.tenant_id and adjustment.company_id=capture.company_id
                 and adjustment.reconciliation_id=capture.reconciliation_id
                 and adjustment.journal_id=capture.journal_id
                 and adjustment.bank_journal_line_id=capture.journal_line_id
                 and adjustment.state='reversed'
          )
       ) as exists`,
      [context.tenantId, row.company_id, row.id],
    );
    if (reversed.rows[0]?.exists) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_LEDGER_REFRESH_REQUIRED",
        "A captured journal changed or was reversed. Create a refreshed reconciliation.",
      );
    }
  }

  async setup(context: BankingActorContext, query: BankReconciliationSetupQuery): Promise<BankReconciliationSetup> {
    this.claim(context, "banking.reconciliation.create");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.reconciliation.create", query.company_id);
      const bank = await this.bank(client, context, query.company_id, query.bank_account_id);
      const opening = await this.openingBalance(client, context, bank, query.company_id, query.period_start);
      const population = await this.currentLedgerPopulation(
        client,
        context,
        {
          company_id: query.company_id,
          bank_account_id: query.bank_account_id,
          statement_date: query.statement_date,
          period_start: query.period_start,
          period_end: query.period_end,
        },
        false,
      );
      const totals = calculateManualReconciliationBalances({
        currency: bank.currency,
        currencyDecimals: Number(bank.currency_decimals),
        openingStatementBalance: "0",
        closingStatementBalance: "0",
        ledgerBalanceAtCutoff: "0",
        ledgerCandidates: population.map((candidate) => this.ledgerCandidate(candidate)),
      });
      return bankReconciliationSetupSchema.parse({
        company_id: query.company_id,
        bank_account_id: bank.id,
        bank_account_name: bank.account_name,
        currency: bank.currency,
        opening_statement_balance: opening.amount,
        opening_balance_source: opening.source,
        last_approved_reconciliation_id: opening.reconciliationId,
        last_approved_statement_date: opening.statementDate,
        available_receipts: totals.available_ledger_money_in,
        available_payments: totals.available_ledger_money_out,
        available_transaction_count: population.length,
      });
    });
  }

  async create(
    context: BankingActorContext,
    input: CreateBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult> {
    this.claim(context, "banking.reconciliation.create");
    return this.transaction(context, true, async (client) => {
      await this.scoped(client, context, "banking.reconciliation.create", input.company_id);
      return this.idempotent(
        client,
        context,
        "/api/v1/banking/reconciliations",
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMutationResultSchema.parse(value), replayed }),
        async () => {
          const bank = await this.bank(client, context, input.company_id, input.bank_account_id);
          const opening = await this.openingBalance(client, context, bank, input.company_id, input.period_start);
          if (input.import_id) {
            const imported = await client.query<{ state: string; statement_reference: string }>(
              `select state,statement_reference from bank_statement_import
                where tenant_id=$1 and company_id=$2 and bank_account_id=$3 and id=$4 for share`,
              [context.tenantId, input.company_id, input.bank_account_id, input.import_id],
            );
            if (imported.rows[0]?.state !== "finalized") {
              throw new BankingApiError(
                409,
                "RECONCILIATION_IMPORT_NOT_FINALIZED",
                "Select a finalized Bank Statement import for this Bank Account.",
              );
            }
          }
          const id = `bank-reconciliation-${randomUUID()}`;
          const population = await this.currentLedgerPopulation(
            client,
            context,
            {
              company_id: input.company_id,
              bank_account_id: input.bank_account_id,
              statement_date: input.statement_date,
              period_start: input.period_start,
              period_end: input.period_end,
            },
            true,
          );
          const populationHash = ledgerPopulationHash(population.map((candidate) => this.ledgerCandidate(candidate)));
          const ledgerBalance = await this.ledgerBalanceAtCutoff(
            client,
            context,
            bank,
            input.company_id,
            input.statement_date,
          );
          await client.query(
            `insert into bank_reconciliation
               (tenant_id,company_id,id,bank_account_id,method,import_id,reconciliation_date,statement_date,period_start,period_end,
                statement_reference,currency,opening_statement_balance,closing_statement_balance,
                ledger_balance_at_cutoff,ledger_population_hash,ledger_calculated_at,state,prepared_by)
              values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,clock_timestamp(),'draft',$17)`,
            [
              context.tenantId,
              input.company_id,
              id,
              input.bank_account_id,
              input.method,
              input.import_id ?? null,
              input.reconciliation_date,
              input.statement_date,
              input.period_start,
              input.period_end,
              input.statement_reference,
              bank.currency,
              opening.amount,
              input.closing_statement_balance,
              ledgerBalance,
              populationHash,
              context.actor.userId,
            ],
          );
          let row = await this.header(client, context, id, true);
          await this.event(client, context, row, "created", correlationId);
          if (population.length > 0) {
            await client.query(
              `insert into bank_reconciliation_ledger_line
                (tenant_id,company_id,reconciliation_id,journal_line_id,journal_id,posting_date,
                 direction,amount,currency,reference,narrative)
               select $1,$2,$3,item.journal_line_id,item.journal_id,item.posting_date::date,item.direction,
                      item.amount::numeric,item.currency,item.reference,item.narrative
                 from jsonb_to_recordset($4::jsonb) as item(
                   journal_line_id text,journal_id text,posting_date text,direction text,amount text,
                   currency text,reference text,narrative text
                 )`,
              [
                context.tenantId,
                input.company_id,
                id,
                JSON.stringify(
                  population.map((candidate) => ({
                    journal_line_id: candidate.journal_line_id,
                    journal_id: candidate.journal_id,
                    posting_date: dateOnly(candidate.posting_date),
                    direction: candidate.direction,
                    amount: candidate.amount,
                    currency: candidate.currency,
                    reference: candidate.reference,
                    narrative: candidate.narrative,
                  })),
                ),
              ],
            );
          }
          const capturedPopulation = await this.capturedLedger(client, context, row);
          const persistedPopulationHash = ledgerPopulationHash(
            capturedPopulation.map((candidate) => this.ledgerCandidate(candidate)),
          );
          if (persistedPopulationHash !== populationHash) {
            await client.query(
              `update bank_reconciliation
                  set ledger_population_hash=$4,row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, input.company_id, id, persistedPopulationHash],
            );
            row = await this.header(client, context, id, true);
          }
          const statements = this.matchingStatementLines(await this.importedStatementLines(client, context, row));
          const planned = buildReconciliationMatches(
            statements,
            population.map((candidate) => this.ledgerCandidate(candidate)),
          );
          for (const match of [...planned.confirmed, ...planned.suggestions]) {
            await client.query(
              `insert into bank_reconciliation_match
                (tenant_id,company_id,id,reconciliation_id,statement_line_id,journal_line_id,
                 match_type,state,confidence_score,reason_codes,decided_by,decided_at,created_by)
               values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                      case when $8='confirmed' then $11 else null end,
                      case when $8='confirmed' then clock_timestamp() else null end,$11)`,
              [
                context.tenantId,
                input.company_id,
                `bank-reconciliation-match-${randomUUID()}`,
                id,
                match.statementLineId,
                match.journalLineId,
                match.matchType,
                match.state,
                match.confidenceScore,
                JSON.stringify(match.reasonCodes),
                context.actor.userId,
              ],
            );
          }
          row = await this.updateBalances(client, context, row, "in_progress");
          const eventId = await this.event(client, context, row, "ledger_captured", correlationId);
          return this.mutation(row, eventId);
        },
      );
    });
  }

  async list(
    context: BankingActorContext,
    query: BankReconciliationDirectoryQuery,
  ): Promise<BankReconciliationDirectory> {
    this.claim(context, "banking.reconciliation.read");
    return this.transaction(context, false, async (client) => {
      await this.scoped(client, context, "banking.reconciliation.read", query.company_id);
      const values: unknown[] = [context.tenantId, query.company_id];
      const filters = ["reconciliation.tenant_id=$1", "reconciliation.company_id=$2"];
      for (const [field, value] of [
        ["bank_account_id", query.bank_account_id],
        ["state", query.state],
        ["method", query.method],
      ] as const) {
        if (value) {
          values.push(value);
          filters.push(`reconciliation.${field}=$${values.length}`);
        }
      }
      if (query.statement_date_from) {
        values.push(query.statement_date_from);
        filters.push(`reconciliation.statement_date>=$${values.length}::date`);
      }
      if (query.statement_date_to) {
        values.push(query.statement_date_to);
        filters.push(`reconciliation.statement_date<=$${values.length}::date`);
      }
      if (query.search) {
        values.push(`%${query.search.replace(/[\\%_]/gu, "\\$&")}%`);
        filters.push(`reconciliation.statement_reference ilike $${values.length} escape '\\'`);
      }
      const offset = decodeCursor(query.cursor);
      values.push(query.limit + 1, offset);
      const result = await client.query<ReconciliationRow>(
        `select reconciliation.*,bank.account_name as bank_account_name,
                currency.decimal_places as currency_decimals
           from bank_reconciliation reconciliation
           join bank_account bank
             on bank.tenant_id=reconciliation.tenant_id and bank.company_id=reconciliation.company_id
            and bank.id=reconciliation.bank_account_id
           join currency
             on currency.tenant_id=reconciliation.tenant_id and currency.code=reconciliation.currency
          where ${filters.join(" and ")}
          order by reconciliation.statement_date desc,reconciliation.id desc
          limit $${values.length - 1} offset $${values.length}`,
        values,
      );
      return bankReconciliationDirectorySchema.parse({
        items: result.rows.slice(0, query.limit).map((row) => this.summary(row)),
        next_cursor:
          result.rows.length > query.limit
            ? Buffer.from(String(offset + query.limit), "utf8").toString("base64url")
            : null,
      });
    });
  }

  async get(context: BankingActorContext, id: string): Promise<BankReconciliationDetail> {
    this.claim(context, "banking.reconciliation.read");
    return this.transaction(context, false, async (client) => {
      const row = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.read", row.company_id);
      const statementLines = await this.importedStatementLines(client, context, row);
      const ledger = await this.capturedLedger(client, context, row);
      const matches = await this.matches(client, context, row);
      const confirmed = new Set(
        matches.filter((match) => match.state === "confirmed").map((match) => match.journal_line_id),
      );
      const adjustments = await client.query<{
        id: string;
        statement_line_id: string;
        kind: string;
        offset_nominal_id: string;
        offset_nominal_code: string;
        offset_nominal_name: string;
        narrative: string;
        direction: string;
        amount: string;
        currency: string;
        state: string;
        row_version: string | number;
        created_by: string;
        submitted_by: string | null;
        approved_by: string | null;
        posted_by: string | null;
        reversed_by: string | null;
        journal_id: string | null;
        bank_journal_line_id: string | null;
      }>(
        `select adjustment.id,adjustment.statement_line_id,adjustment.kind,adjustment.offset_nominal_id,
                nominal.code as offset_nominal_code,nominal.name as offset_nominal_name,
                adjustment.narrative,adjustment.direction,adjustment.amount::text,adjustment.currency,
                adjustment.state,adjustment.row_version,adjustment.created_by,adjustment.submitted_by,
                adjustment.approved_by,adjustment.posted_by,adjustment.reversed_by,
                adjustment.journal_id,adjustment.bank_journal_line_id
           from bank_reconciliation_adjustment adjustment
           join account nominal
             on nominal.tenant_id=adjustment.tenant_id and nominal.company_id=adjustment.company_id
            and nominal.id=adjustment.offset_nominal_id
          where adjustment.tenant_id=$1 and adjustment.company_id=$2 and adjustment.reconciliation_id=$3
          order by adjustment.created_at,adjustment.id`,
        [context.tenantId, row.company_id, id],
      );
      const timeline = await client.query<{
        event_id: string;
        event_type: string;
        actor_id: string;
        actor_label: string;
        reason: string | null;
        occurred_at: string | Date;
      }>(
        `select event.event_id,event.event_type,event.actor_id,
                 coalesce(nullif(actor.display_name,''),nullif(actor.email,''),event.actor_id) as actor_label,
                 event.reason,event.occurred_at
           from (
             select event_id,event_type,actor_id,reason,occurred_at
               from bank_reconciliation_event
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3
             union all
             select event_id,case when selected then 'manual_selected' else 'manual_cleared' end,
                    actor_id,null::text,occurred_at
               from bank_reconciliation_manual_selection_event
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3
           ) event
            left join security_user_account actor
              on actor.tenant_id=$1 and actor.id=event.actor_id
           order by event.occurred_at,event.event_id`,
        [context.tenantId, row.company_id, id],
      );
      const eventStates: Record<string, [string | null, string]> = {
        created: [null, "draft"],
        ledger_captured: ["draft", "in_progress"],
        match_proposed: ["in_progress", "in_progress"],
        match_confirmed: ["in_progress", "in_progress"],
        match_rejected: ["in_progress", "in_progress"],
        unmatched: ["in_progress", "in_progress"],
        manual_selected: ["in_progress", "in_progress"],
        manual_cleared: ["in_progress", "in_progress"],
        submitted: ["in_progress", "submitted"],
        approved: ["submitted", "approved"],
        returned: ["submitted", "in_progress"],
      };
      const stateFor = (event: string): [string | null, string] => eventStates[event] ?? [row.state, row.state];
      return bankReconciliationDetailSchema.parse({
        ...this.summary(row),
        statement_lines: statementLines.map((line) => ({
          id: line.id,
          import_id: line.import_id,
          source_row_number: line.source_row_number,
          raw_row: line.raw_row,
          transaction_date: dateOnly(line.transaction_date),
          direction: line.direction,
          amount: line.amount,
          currency: line.currency,
          reference: line.reference,
          details: line.details,
          transaction_type: line.transaction_type,
          account_text: line.account_text,
          payment_mode: line.payment_mode,
          row_fingerprint: line.row_fingerprint,
          inclusion_state: line.inclusion_state,
          exclusion_reason: line.exclusion_reason,
          validation_state: line.validation_state,
          duplicate_disposition: line.duplicate_disposition,
          issues: line.validation_issues,
          version: Number(line.row_version),
        })),
        ledger_candidates: ledger.map((candidate) => ({
          journal_line_id: candidate.journal_line_id,
          journal_id: candidate.journal_id,
          journal_entry_number: candidate.journal_entry_number,
          posting_date: dateOnly(candidate.posting_date),
          direction: candidate.direction,
          amount: candidate.amount,
          currency: candidate.currency,
          reference: candidate.reference,
          narrative: candidate.narrative,
          matched: confirmed.has(candidate.journal_line_id),
          reversed: candidate.journal_status === "reversed",
          manual_selected: Boolean(candidate.manual_selected),
        })),
        matches: matches.map((match) => this.match(match)),
        adjustments: adjustments.rows.map((adjustment) => ({
          id: adjustment.id,
          statement_line_id: adjustment.statement_line_id,
          kind: adjustment.kind,
          offset_nominal_id: adjustment.offset_nominal_id,
          offset_nominal_code: adjustment.offset_nominal_code,
          offset_nominal_name: adjustment.offset_nominal_name,
          narrative: adjustment.narrative,
          direction: adjustment.direction,
          amount: adjustment.amount,
          currency: adjustment.currency,
          state: adjustment.state,
          version: Number(adjustment.row_version),
          created_by: adjustment.created_by,
          submitted_by: adjustment.submitted_by,
          approved_by: adjustment.approved_by,
          posted_by: adjustment.posted_by,
          reversed_by: adjustment.reversed_by,
          journal_id: adjustment.journal_id,
          bank_journal_line_id: adjustment.bank_journal_line_id,
        })),
        timeline: timeline.rows.map((event) => {
          const states = stateFor(event.event_type);
          return {
            id: event.event_id,
            action: event.event_type,
            actor_id: event.actor_id,
            actor_label: event.actor_label,
            previous_state: states[0],
            resulting_state: states[1],
            reason: event.reason,
            occurred_at: iso(event.occurred_at),
          };
        }),
        ledger_population_hash: row.ledger_population_hash,
        ledger_calculated_at: iso(row.ledger_calculated_at),
        self_decision_requires_override: [row.prepared_by, row.submitted_by].includes(context.actor.userId),
        super_admin_override_allowed: await globalBankOverride(client, context, row.company_id),
      });
    });
  }

  async setManualSelection(
    context: BankingActorContext,
    id: string,
    input: SetBankReconciliationManualSelectionRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationManualSelectionMutationResult> {
    this.claim(context, "banking.reconciliation.match");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.match", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/manual-selections`,
        input,
        idempotencyKey,
        (value, replayed) => ({
          ...bankReconciliationManualSelectionMutationResultSchema.parse(value),
          replayed,
        }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (row.method !== "manual_tick" || !["draft", "in_progress"].includes(row.state)) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MANUAL_SELECTION_NOT_ALLOWED",
              "Manual selections are available only on an editable manual reconciliation.",
            );
          }
          const candidate = await client.query<{ selected: boolean | null }>(
            `select selection.selected
               from bank_reconciliation_ledger_line capture
               join journal_entry journal
                 on journal.tenant_id=capture.tenant_id and journal.company_id=capture.company_id
                and journal.id=capture.journal_id
               left join bank_reconciliation_manual_selection selection
                 on selection.tenant_id=capture.tenant_id and selection.company_id=capture.company_id
                and selection.reconciliation_id=capture.reconciliation_id
                and selection.journal_line_id=capture.journal_line_id
              where capture.tenant_id=$1 and capture.company_id=$2 and capture.reconciliation_id=$3
                and capture.journal_line_id=$4 and capture.reconciled_at is null and journal.status='posted'
              for update of capture,selection`,
            [context.tenantId, row.company_id, id, input.journal_line_id],
          );
          if (candidate.rowCount !== 1) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MANUAL_CANDIDATE_INVALID",
              "The selected transaction is no longer an eligible unreconciled Bank movement.",
            );
          }
          if (candidate.rows[0]?.selected === input.selected) {
            const prior = await client.query<{ event_id: string }>(
              `select event_id from bank_reconciliation_manual_selection_event
                where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and journal_line_id=$4
                  and selected=$5
                order by occurred_at desc,event_id desc limit 1`,
              [context.tenantId, row.company_id, id, input.journal_line_id, input.selected],
            );
            if (!prior.rows[0]) {
              throw new BankingApiError(
                409,
                "RECONCILIATION_MANUAL_SELECTION_EVIDENCE_MISSING",
                "The existing manual selection has no audit evidence. Contact an administrator.",
              );
            }
            return bankReconciliationManualSelectionMutationResultSchema.parse({
              reconciliation_id: id,
              reconciliation_version: Number(row.row_version),
              journal_line_id: input.journal_line_id,
              selected: input.selected,
              balances: this.balances(row),
              audit_event_id: prior.rows[0].event_id,
              replayed: false,
            });
          }
          await client.query(
            `insert into bank_reconciliation_manual_selection
              (tenant_id,company_id,reconciliation_id,journal_line_id,selected,changed_by)
             values($1,$2,$3,$4,$5,$6)
             on conflict(tenant_id,reconciliation_id,journal_line_id) do update
               set selected=excluded.selected,row_version=bank_reconciliation_manual_selection.row_version+1,
                   changed_by=excluded.changed_by,changed_at=clock_timestamp()`,
            [context.tenantId, row.company_id, id, input.journal_line_id, input.selected, context.actor.userId],
          );
          row = await this.updateBalances(client, context, row, "in_progress");
          const eventId = `bank-reconciliation-selection-event-${randomUUID()}`;
          await client.query(
            `insert into bank_reconciliation_manual_selection_event
              (tenant_id,company_id,event_id,reconciliation_id,journal_line_id,
               reconciliation_version,selected,actor_id,correlation_id)
             values($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
            [
              context.tenantId,
              row.company_id,
              eventId,
              id,
              input.journal_line_id,
              row.row_version,
              input.selected,
              context.actor.userId,
              correlationId.slice(0, 128),
            ],
          );
          return bankReconciliationManualSelectionMutationResultSchema.parse({
            reconciliation_id: id,
            reconciliation_version: Number(row.row_version),
            journal_line_id: input.journal_line_id,
            selected: input.selected,
            balances: this.balances(row),
            audit_event_id: eventId,
            replayed: false,
          });
        },
      );
    });
  }

  private async insertMatch(
    client: PoolClient,
    context: BankingActorContext,
    row: ReconciliationRow,
    input: {
      statementLineId: string;
      journalLineId: string;
      matchType: "exact" | "suggested" | "manual";
      state: "proposed" | "confirmed";
      confidenceScore: number;
      reasonCodes: string[];
    },
  ): Promise<MatchRow> {
    const existing = await client.query<MatchRow>(
      `select * from bank_reconciliation_match
        where tenant_id=$1 and company_id=$2 and reconciliation_id=$3
          and statement_line_id=$4 and journal_line_id=$5 and state<>'rejected'
        order by created_at,id limit 1 for update`,
      [context.tenantId, row.company_id, row.id, input.statementLineId, input.journalLineId],
    );
    if (existing.rows[0]) {
      throw new BankingApiError(
        409,
        "RECONCILIATION_MATCH_EXISTS",
        "This statement and ledger pair already has an active match or suggestion.",
      );
    }
    return (
      await client.query<MatchRow>(
        `insert into bank_reconciliation_match
          (tenant_id,company_id,id,reconciliation_id,statement_line_id,journal_line_id,match_type,state,
           confidence_score,reason_codes,decided_by,decided_at,created_by)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
                case when $8='confirmed' then $11 else null end,
                case when $8='confirmed' then clock_timestamp() else null end,$11)
         returning id,statement_line_id,journal_line_id,match_type,state,confidence_score::text,
                   reason_codes,decided_by,decided_at,decision_reason,row_version`,
        [
          context.tenantId,
          row.company_id,
          `bank-reconciliation-match-${randomUUID()}`,
          row.id,
          input.statementLineId,
          input.journalLineId,
          input.matchType,
          input.state,
          input.confidenceScore,
          JSON.stringify(input.reasonCodes),
          context.actor.userId,
        ],
      )
    ).rows[0]!;
  }

  private matchMutation(
    row: ReconciliationRow,
    match: MatchRow | null,
    eventId: string,
    replayed = false,
  ): BankReconciliationMatchMutationResult {
    return bankReconciliationMatchMutationResultSchema.parse({
      reconciliation_id: row.id,
      reconciliation_version: Number(row.row_version),
      match: match ? this.match(match) : null,
      balances: this.balances(row),
      audit_event_id: eventId,
      replayed,
    });
  }

  async createMatch(
    context: BankingActorContext,
    id: string,
    input: CreateBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    this.claim(context, "banking.reconciliation.match");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.match", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/matches`,
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMatchMutationResultSchema.parse(value), replayed }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (!(["draft", "in_progress"] as const).includes(row.state as "draft" | "in_progress")) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MATCHING_LOCKED",
              "Submitted reconciliations cannot be changed.",
            );
          }
          const statements = this.matchingStatementLines(await this.importedStatementLines(client, context, row));
          const captures = (await this.capturedLedger(client, context, row)).filter(
            (candidate) => candidate.journal_status === "posted",
          );
          const currentMatches = await this.matches(client, context, row);
          const matchedStatements = new Set(
            currentMatches.filter((match) => match.state === "confirmed").map((match) => match.statement_line_id),
          );
          const matchedLedgers = new Set(
            currentMatches.filter((match) => match.state === "confirmed").map((match) => match.journal_line_id),
          );
          const availableStatements = statements.filter((statement) => !matchedStatements.has(statement.id));
          const availableLedger = captures.map((candidate) =>
            this.ledgerCandidate(candidate, matchedLedgers.has(candidate.journal_line_id)),
          );
          let match: MatchRow | null = null;
          let eventType: "match_proposed" | "match_confirmed" = "match_confirmed";
          if (input.action === "propose") {
            const planned = buildReconciliationMatches(availableStatements, availableLedger).suggestions;
            if (planned.length === 0) {
              throw new BankingApiError(
                409,
                "RECONCILIATION_NO_SUGGESTIONS",
                "No deterministic match suggestions are available.",
              );
            }
            for (const proposal of planned) {
              const active = currentMatches.some(
                (existing) =>
                  existing.state !== "rejected" &&
                  existing.statement_line_id === proposal.statementLineId &&
                  existing.journal_line_id === proposal.journalLineId,
              );
              if (active) continue;
              const inserted = await this.insertMatch(client, context, row, proposal);
              match ??= inserted;
            }
            if (!match) {
              throw new BankingApiError(
                409,
                "RECONCILIATION_NO_NEW_SUGGESTIONS",
                "All current suggestions already exist.",
              );
            }
            eventType = "match_proposed";
          } else {
            const statement = availableStatements.find((entry) => entry.id === input.statement_line_id);
            const ledger = availableLedger.find(
              (entry) => entry.journalLineId === input.journal_line_id && !entry.matched,
            );
            if (!statement || !ledger) {
              throw new BankingApiError(
                409,
                "RECONCILIATION_MATCH_EVIDENCE_INELIGIBLE",
                "The selected statement or ledger evidence is no longer eligible.",
              );
            }
            if (input.action === "confirm_exact") {
              const exact = buildReconciliationMatches(availableStatements, availableLedger).confirmed.find(
                (entry) => entry.statementLineId === statement.id && entry.journalLineId === ledger.journalLineId,
              );
              if (!exact) {
                throw new BankingApiError(
                  409,
                  "RECONCILIATION_EXACT_MATCH_INVALID",
                  "The selected pair is not a unique exact match.",
                );
              }
              match = await this.insertMatch(client, context, row, exact);
            } else {
              match = await this.insertMatch(client, context, row, {
                statementLineId: statement.id,
                journalLineId: ledger.journalLineId,
                matchType: "manual",
                state: "confirmed",
                confidenceScore: 1,
                reasonCodes: ["MANUAL_CONFIRMATION"],
              });
            }
          }
          row = await this.updateBalances(client, context, row, "in_progress");
          const eventId = await this.event(client, context, row, eventType, correlationId);
          return this.matchMutation(row, match, eventId);
        },
      );
    });
  }

  async decideMatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: DecideBankReconciliationMatchRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    this.claim(context, "banking.reconciliation.match");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.match", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/matches/${matchId}/decision`,
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMatchMutationResultSchema.parse(value), replayed }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (!(["draft", "in_progress"] as const).includes(row.state as "draft" | "in_progress")) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MATCHING_LOCKED",
              "Submitted reconciliations cannot be changed.",
            );
          }
          const previous = (
            await client.query<MatchRow>(
              `select * from bank_reconciliation_match
                where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4 for update`,
              [context.tenantId, row.company_id, id, matchId],
            )
          ).rows[0];
          if (!previous) throw new BankingApiError(404, "RECONCILIATION_MATCH_NOT_FOUND", "The match was not found.");
          if (previous.state !== "proposed") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MATCH_NOT_PROPOSED",
              "Only a proposed match can be decided.",
            );
          }
          const state = input.action === "confirm" ? "confirmed" : "rejected";
          const reason = input.action === "reject" ? input.reason! : null;
          const match = (
            await client.query<MatchRow>(
              `update bank_reconciliation_match
                  set state=$5,decided_by=$6,decided_at=clock_timestamp(),decision_reason=$7,
                      row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4
                returning id,statement_line_id,journal_line_id,match_type,state,confidence_score::text,
                          reason_codes,decided_by,decided_at,decision_reason,row_version`,
              [context.tenantId, row.company_id, id, matchId, state, context.actor.userId, reason],
            )
          ).rows[0]!;
          row = await this.updateBalances(client, context, row, "in_progress");
          const eventId = await this.event(
            client,
            context,
            row,
            state === "confirmed" ? "match_confirmed" : "match_rejected",
            correlationId,
            reason,
          );
          return this.matchMutation(row, match, eventId);
        },
      );
    });
  }

  async unmatch(
    context: BankingActorContext,
    id: string,
    matchId: string,
    input: UnmatchBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMatchMutationResult> {
    this.claim(context, "banking.reconciliation.match");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.match", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/matches/${matchId}/unmatch`,
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMatchMutationResultSchema.parse(value), replayed }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (!(["draft", "in_progress"] as const).includes(row.state as "draft" | "in_progress")) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_MATCHING_LOCKED",
              "Submitted reconciliations cannot be changed.",
            );
          }
          const updated = await client.query(
            `update bank_reconciliation_match
                set state='rejected',decided_by=$5,decided_at=clock_timestamp(),decision_reason=$6,
                    row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and reconciliation_id=$3 and id=$4
                and state in ('proposed','confirmed')`,
            [context.tenantId, row.company_id, id, matchId, context.actor.userId, input.reason],
          );
          if (updated.rowCount !== 1) {
            throw new BankingApiError(409, "RECONCILIATION_MATCH_NOT_ACTIVE", "The match is no longer active.");
          }
          row = await this.updateBalances(client, context, row, "in_progress");
          const eventId = await this.event(client, context, row, "unmatched", correlationId, input.reason);
          return this.matchMutation(row, null, eventId);
        },
      );
    });
  }

  async submit(
    context: BankingActorContext,
    id: string,
    input: SubmitBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult> {
    this.claim(context, "banking.reconciliation.submit");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.submit", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/submit`,
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMutationResultSchema.parse(value), replayed }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (row.state !== "in_progress") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_NOT_SUBMITTABLE",
              "Only an in-progress reconciliation can be submitted.",
            );
          }
          await this.assertPopulationStable(client, context, row);
          const balances = await this.calculate(client, context, row);
          if (balances.difference !== "0.00000000" || balances.unmatched_statement_count !== 0) {
            throw new BankingApiError(
              409,
              "RECONCILIATION_NOT_BALANCED",
              "The reconciliation must have zero difference and no unmatched statement rows before submission.",
            );
          }
          await client.query(
            `update bank_reconciliation
                set statement_money_in=$4,statement_money_out=$5,reconstructed_statement_balance=$6,
                    unmatched_ledger_money_in=$7,unmatched_ledger_money_out=$8,adjusted_ledger_balance=$9,
                     difference=$10,matched_count=$11,unmatched_statement_count=$12,unmatched_ledger_count=$13,
                     adjustment_count=$14,available_ledger_money_in=$15,available_ledger_money_out=$16,
                     selected_ledger_money_in=$17,selected_ledger_money_out=$18,
                     calculated_selected_balance=$19,state='submitted',submitted_by=$20,submitted_at=clock_timestamp(),
                    decision_reason=null,row_version=row_version+1,updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and id=$3`,
            [
              context.tenantId,
              row.company_id,
              id,
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
              balances.available_ledger_money_in ?? "0.00000000",
              balances.available_ledger_money_out ?? "0.00000000",
              balances.selected_ledger_money_in ?? "0.00000000",
              balances.selected_ledger_money_out ?? "0.00000000",
              balances.calculated_selected_balance ?? balances.adjusted_ledger_balance,
              context.actor.userId,
            ],
          );
          row = await this.header(client, context, id, true);
          const eventId = await this.event(client, context, row, "submitted", correlationId);
          return this.mutation(row, eventId);
        },
      );
    });
  }

  async decide(
    context: BankingActorContext,
    id: string,
    input: DecideBankReconciliationRequest,
    idempotencyKey: string,
    correlationId: string,
  ): Promise<BankReconciliationMutationResult> {
    this.claim(context, "banking.reconciliation.approve");
    return this.transaction(context, true, async (client) => {
      const authority = await this.header(client, context, id);
      await this.scoped(client, context, "banking.reconciliation.approve", authority.company_id);
      return this.idempotent(
        client,
        context,
        `/api/v1/banking/reconciliations/${id}/decision`,
        input,
        idempotencyKey,
        (value, replayed) => ({ ...bankReconciliationMutationResultSchema.parse(value), replayed }),
        async () => {
          let row = await this.header(client, context, id, true);
          this.version(row, input.expected_version);
          if (row.state !== "submitted") {
            throw new BankingApiError(
              409,
              "RECONCILIATION_NOT_DECIDABLE",
              "Only a submitted reconciliation can be decided.",
            );
          }
          const evidence = bankDecisionEvidence(input, "Bank Reconciliation");
          const self = [row.prepared_by, row.submitted_by].includes(context.actor.userId);
          let overrideId: string | null = null;
          if (self) {
            const actor = evaluateApprovalActor({
              account: context.actor,
              makerActorIds: [row.prepared_by, row.submitted_by ?? ""],
              normalDecisionPermission: "banking.reconciliation.approve",
              impersonated: false,
            });
            if (actor.kind !== "override" || !(await globalBankOverride(client, context, row.company_id))) {
              throw new BankingApiError(
                403,
                "RECONCILIATION_APPROVER_SEPARATION_REQUIRED",
                "An independent approver or governed Super Administrator override is required.",
              );
            }
            overrideId = (
              await writeApprovalOverrideEvent(client, {
                tenantId: context.tenantId,
                account: context.actor,
                makerActorIds: [row.prepared_by, row.submitted_by ?? ""],
                normalDecisionPermission: "banking.reconciliation.approve",
                resourceType: "bank_reconciliation",
                resourceId: id,
                decisionAction: input.action,
                reason: evidence.reason,
                correlationId,
                idempotencyKey: `${idempotencyKey}:approval-override`,
                metadata: {
                  company_id: row.company_id,
                  bank_account_id: row.bank_account_id,
                  expected_version: input.expected_version,
                },
                impersonated: false,
              })
            ).eventId;
          }
          if (input.action === "approve") {
            await this.assertPopulationStable(client, context, row);
            const balances = await this.calculate(client, context, row);
            if (balances.difference !== "0.00000000" || balances.unmatched_statement_count !== 0) {
              throw new BankingApiError(
                409,
                "RECONCILIATION_NOT_BALANCED",
                "The reconciliation is no longer ready for approval.",
              );
            }
            await client.query(
              `update bank_reconciliation
                  set state='approved',approved_by=$4,approved_at=clock_timestamp(),decision_reason=$5,
                      approval_override_event_id=$6,row_version=row_version+1,updated_at=clock_timestamp()
                where tenant_id=$1 and company_id=$2 and id=$3`,
              [context.tenantId, row.company_id, id, context.actor.userId, evidence.reason, overrideId],
            );
            row = await this.header(client, context, id, true);
            await client.query(
              `update bank_statement_line line
                  set reconciled_reconciliation_id=$4,reconciled_at=clock_timestamp(),row_version=line.row_version+1
                 from bank_reconciliation_match match
                where match.tenant_id=$1 and match.company_id=$2 and match.reconciliation_id=$3
                  and match.state='confirmed' and line.tenant_id=match.tenant_id
                  and line.company_id=match.company_id and line.id=match.statement_line_id`,
              [context.tenantId, row.company_id, id, id],
            );
            await client.query(
              `update bank_reconciliation_ledger_line capture
                  set reconciled_at=clock_timestamp()
                 from bank_reconciliation_match match
                where match.tenant_id=$1 and match.company_id=$2 and match.reconciliation_id=$3
                  and match.state='confirmed' and capture.tenant_id=match.tenant_id
                  and capture.company_id=match.company_id and capture.reconciliation_id=match.reconciliation_id
                  and capture.journal_line_id=match.journal_line_id`,
              [context.tenantId, row.company_id, id],
            );
            if (row.method === "manual_tick") {
              await client.query(
                `update bank_reconciliation_ledger_line capture
                    set reconciled_at=clock_timestamp()
                   from bank_reconciliation_manual_selection selection
                  where selection.tenant_id=$1 and selection.company_id=$2
                    and selection.reconciliation_id=$3 and selection.selected
                    and capture.tenant_id=selection.tenant_id and capture.company_id=selection.company_id
                    and capture.reconciliation_id=selection.reconciliation_id
                    and capture.journal_line_id=selection.journal_line_id`,
                [context.tenantId, row.company_id, id],
              );
            }
            const eventId = await this.event(client, context, row, "approved", correlationId, evidence.reason);
            return this.mutation(row, eventId);
          }
          await client.query(
            `update bank_reconciliation
                set state='in_progress',submitted_by=null,submitted_at=null,approved_by=null,approved_at=null,
                    approval_override_event_id=null,decision_reason=$4,row_version=row_version+1,
                    updated_at=clock_timestamp()
              where tenant_id=$1 and company_id=$2 and id=$3`,
            [context.tenantId, row.company_id, id, evidence.reason],
          );
          row = await this.header(client, context, id, true);
          const eventId = await this.event(client, context, row, "returned", correlationId, evidence.reason);
          return this.mutation(row, eventId);
        },
      );
    });
  }
}

function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  const decoded = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  if (!Number.isSafeInteger(decoded) || decoded < 0) {
    throw new BankingApiError(400, "RECONCILIATION_CURSOR_INVALID", "The directory cursor is invalid.");
  }
  return decoded;
}
