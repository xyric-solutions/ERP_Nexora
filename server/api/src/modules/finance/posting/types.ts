import { randomUUID } from "node:crypto";

import type { PoolClient } from "pg";

const financeTransactionBrand: unique symbol = Symbol("nexora.finance.transaction");
const financeTransactionMarker: unique symbol = Symbol("nexora.finance.transaction.marker");
const financeTransactionSetting = "nexora.finance_transaction_marker";

export interface FinanceTransactionClient {
  readonly query: PoolClient["query"];
  readonly [financeTransactionBrand]: true;
  readonly [financeTransactionMarker]: string;
}

export type FinanceJsonValue =
  | null
  | boolean
  | number
  | string
  | readonly FinanceJsonValue[]
  | Readonly<{ [key: string]: FinanceJsonValue }>;

export interface FinancePostingLine {
  accountId: string;
  debit: string;
  credit: string;
  dimensions: Readonly<Record<string, string>>;
  description: string;
  sourceMetadata?: Readonly<Record<string, FinanceJsonValue>>;
}

interface FinanceCommandBase {
  tenantId: string;
  companyId: string;
  actorId: string;
  sourceType: string;
  sourceId: string;
  eventType: string;
  externalIdempotencyKey: string;
  transactionCurrency: string;
  payloadHashMaterial: Readonly<Record<string, FinanceJsonValue>>;
  auditRef?: string;
}

export interface FinancePostCommand extends FinanceCommandBase {
  postingDate: string;
  exchangeRateId: string | null;
  exchangeRateValue: string;
  lines: readonly FinancePostingLine[];
}

export interface FinanceReverseCommand extends FinanceCommandBase {
  originalEventType: string;
  originalAccountingEventId: string;
  originalJournalId: string;
}

export interface FinancePostingResult {
  accountingEventId: string;
  journalId: string;
  entryNumber: string;
  periodId: string;
  baseCurrency: string;
  transactionCurrency: string;
  exchangeRateId: string | null;
  exchangeRate: string;
  replayed: boolean;
}

export interface FinanceReversalResult extends FinancePostingResult {
  originalAccountingEventId: string;
  originalJournalId: string;
}

export type FinancePostingErrorCode =
  | "FINANCE_COMMAND_INVALID"
  | "FINANCE_AMOUNT_INVALID"
  | "FINANCE_NUMERIC_OUT_OF_RANGE"
  | "FINANCE_CURRENCY_INVALID"
  | "FINANCE_CURRENCY_SCALE_INVALID"
  | "FINANCE_EXCHANGE_RATE_MISSING"
  | "FINANCE_EXCHANGE_RATE_CHANGED"
  | "FINANCE_TRANSACTION_REQUIRED"
  | "FINANCE_PERIOD_CLOSED_POST_BLOCKED"
  | "FINANCE_PERIOD_UNAVAILABLE"
  | "FINANCE_ACCOUNT_INVALID"
  | "FINANCE_ACCOUNT_INACTIVE_POST_BLOCKED"
  | "FINANCE_ACCOUNT_NOT_POSTABLE"
  | "FINANCE_DIMENSION_REQUIRED"
  | "FINANCE_JOURNAL_UNBALANCED"
  | "FINANCE_IDEMPOTENCY_CONFLICT"
  | "FINANCE_SOURCE_ALREADY_POSTED"
  | "FINANCE_POSTING_IN_PROGRESS"
  | "FINANCE_ORIGINAL_POSTING_INVALID"
  | "FINANCE_REVERSAL_ALREADY_EXISTS"
  | "FINANCE_AUTHORITY_INVALID"
  | "FINANCE_PERSISTENCE_INVARIANT";

export class FinancePostingError extends Error {
  constructor(
    readonly status: number,
    readonly code: FinancePostingErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "FinancePostingError";
  }
}

function transactionRequired(cause?: unknown): FinancePostingError {
  return new FinancePostingError(
    500,
    "FINANCE_TRANSACTION_REQUIRED",
    "Finance posting requires an active caller-owned database transaction.",
    cause === undefined ? undefined : { cause },
  );
}

async function markerIsActive(client: Pick<PoolClient, "query">, marker: string): Promise<boolean> {
  const result = await client.query<{ active: boolean }>(
    `select current_setting('${financeTransactionSetting}',true)=$1 as active`,
    [marker],
  );
  return result.rows[0]?.active === true;
}

export async function createFinanceTransactionClient(
  client: Pick<PoolClient, "query">,
): Promise<FinanceTransactionClient> {
  const marker = randomUUID();
  try {
    await client.query(`select set_config('${financeTransactionSetting}',$1,true)`, [marker]);
    if (!(await markerIsActive(client, marker))) throw transactionRequired();
  } catch (error) {
    if (error instanceof FinancePostingError) throw error;
    throw transactionRequired(error);
  }
  return Object.freeze({
    query: client.query.bind(client) as PoolClient["query"],
    [financeTransactionBrand]: true as const,
    [financeTransactionMarker]: marker,
  });
}

export async function assertFinanceTransactionClient(client: FinanceTransactionClient): Promise<void> {
  if (
    !client ||
    client[financeTransactionBrand] !== true ||
    typeof client[financeTransactionMarker] !== "string"
  )
    throw transactionRequired();
  try {
    if (!(await markerIsActive(client, client[financeTransactionMarker]))) throw transactionRequired();
  } catch (error) {
    if (error instanceof FinancePostingError) throw error;
    throw transactionRequired(error);
  }
}
