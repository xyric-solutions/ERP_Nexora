/**
 * Bank reconciliation register fixtures for the isolated Nexora UI/UX prototype.
 *
 * A reconciliation is a record with its own identity, period, statement
 * balance and approval state. `Bank > Reconciliation` opens the register of
 * these records; the workspace is what a record opens into.
 *
 * Two methods are recognised and recorded rather than inferred, because they
 * are not equivalent evidence:
 *   - Statement import — the bank file supplies the lines and the closing
 *     balance, so a bank transaction never entered in Nexora is found.
 *   - Manual tick — the closing balance is keyed and posted entries are ticked
 *     as presented, which cannot reveal an entry that was never made.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

import { exchangeRates, findBankAccount, formatMoney } from "./banking-master-data.ts";
import { statementFor, type StatementLine } from "./banking-statement-data.ts";
import type { ModuleColumn, ModuleRow } from "./module-profile-types.ts";

export type ReconciliationMethod = "Statement import" | "Manual tick";
export type ReconciliationStatus = "Draft" | "In progress" | "Submitted" | "Approved";

export interface ReconciliationRecord {
  id: string;
  accountId: string;
  /** Statement date, in the prototype's display format. */
  date: string;
  periodLabel: string;
  statementCode: string;
  statementBalance: number;
  ledgerBalance: number;
  openItems: number;
  totalItems: number;
  method: ReconciliationMethod;
  status: ReconciliationStatus;
  preparedBy: string;
}

/**
 * Approved and submitted records carry no unexplained difference: a
 * reconciliation is only certified once the statement balance and the ledger
 * balance agree once outstanding items are accounted for.
 */
export const reconciliationRegister: readonly ReconciliationRecord[] = [
  { id: "REC-2026-0045", accountId: "BA-7731", date: "18 Aug 2026", periodLabel: "August 2026", statementCode: "Not imported", statementBalance: 186000, ledgerBalance: 186000, openItems: 2, totalItems: 2, method: "Manual tick", status: "Draft", preparedBy: "Omar Siddiqui" },
  { id: "REC-2026-0041", accountId: "BA-4471", date: "31 Aug 2026", periodLabel: "August 2026", statementCode: "STMT-2026-08-4471", statementBalance: 598140, ledgerBalance: 612480, openItems: 34, totalItems: 212, method: "Statement import", status: "In progress", preparedBy: "Mariam Ali" },
  { id: "REC-2026-0040", accountId: "BA-8814", date: "31 Aug 2026", periodLabel: "August 2026", statementCode: "STMT-2026-08-8814", statementBalance: 441900, ledgerBalance: 468220, openItems: 8, totalItems: 96, method: "Statement import", status: "In progress", preparedBy: "Bilal Khan" },
  { id: "REC-2026-0039", accountId: "BA-2260", date: "30 Aug 2026", periodLabel: "August 2026", statementCode: "STMT-2026-08-2260", statementBalance: 121200, ledgerBalance: 121200, openItems: 0, totalItems: 41, method: "Statement import", status: "Submitted", preparedBy: "Bilal Khan" },
  { id: "REC-2026-0035", accountId: "BA-4472", date: "29 Aug 2026", periodLabel: "August 2026", statementCode: "MAN-2026-08-4472", statementBalance: 92360, ledgerBalance: 92360, openItems: 0, totalItems: 24, method: "Manual tick", status: "Approved", preparedBy: "Sana Iqbal" },
  { id: "REC-2026-0032", accountId: "BA-9902", date: "28 Aug 2026", periodLabel: "August 2026", statementCode: "MAN-2026-08-9902", statementBalance: 18420000, ledgerBalance: 18420000, openItems: 0, totalItems: 63, method: "Manual tick", status: "Approved", preparedBy: "Sana Iqbal" },
  { id: "REC-2026-0024", accountId: "BA-4480", date: "12 Aug 2026", periodLabel: "August 2026", statementCode: "MAN-2026-08-4480", statementBalance: 244000, ledgerBalance: 244000, openItems: 0, totalItems: 3, method: "Manual tick", status: "Approved", preparedBy: "Omar Siddiqui" },
  { id: "REC-2026-0029", accountId: "BA-4471", date: "31 Jul 2026", periodLabel: "July 2026", statementCode: "STMT-2026-07-4471", statementBalance: 704920, ledgerBalance: 704920, openItems: 0, totalItems: 198, method: "Statement import", status: "Approved", preparedBy: "Mariam Ali" },
  { id: "REC-2026-0028", accountId: "BA-8814", date: "31 Jul 2026", periodLabel: "July 2026", statementCode: "STMT-2026-07-8814", statementBalance: 402660, ledgerBalance: 402660, openItems: 0, totalItems: 88, method: "Statement import", status: "Approved", preparedBy: "Bilal Khan" },
];

/** A reconciliation is live — and therefore blocks a second one — until approved. */
export const liveStatuses: readonly ReconciliationStatus[] = ["Draft", "In progress", "Submitted"];

export function findReconciliation(
  recordId: string,
  records: readonly ReconciliationRecord[] = reconciliationRegister,
): ReconciliationRecord | undefined {
  return records.find((record) => record.id === recordId);
}

export function reconciliationDifference(record: ReconciliationRecord): number {
  return record.ledgerBalance - record.statementBalance;
}

const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const monthLabels = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"] as const;

/** Formats an ISO date the same way the banking fixtures are written. */
export function displayDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return iso;
  const month = Number(match[2]) - 1;
  return `${match[3]} ${monthNames[month] ?? match[2]} ${match[1]}`;
}

export function periodLabelFor(iso: string): string {
  const match = /^(\d{4})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${monthLabels[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
}

export function nextReconciliationId(createdCount: number): string {
  return `REC-2026-${String(46 + createdCount).padStart(4, "0")}`;
}

export const registerColumns: readonly ModuleColumn[] = [
  { key: "id", label: "ID" },
  { key: "date", label: "Date" },
  { key: "bank", label: "Bank" },
  { key: "code", label: "Code" },
  { key: "currency", label: "Cur." },
  { key: "balance", label: "Balance", numeric: true },
  { key: "progress", label: "In Progress" },
];

export function toRow(record: ReconciliationRecord): ModuleRow {
  const account = findBankAccount(record.accountId);
  return {
    id: record.id,
    cells: {
      id: record.id,
      date: record.date,
      bank: account ? `${account.name} — ${account.bank}` : record.accountId,
      code: account?.glCode ?? "—",
      currency: account?.currency ?? "USD",
      balance: formatMoney(record.statementBalance, account?.currency),
      progress: record.openItems > 0 ? `${record.openItems} of ${record.totalItems} open` : "All items matched",
      createdBy: record.preparedBy,
    },
    status: record.status,
  };
}

/** Register differences are translated to the base currency before they are
    summed; adding a EUR difference to a USD one would state a number that is
    true in no currency at all. */
export function differenceInBaseCurrency(records: readonly ReconciliationRecord[]): number {
  return records.reduce((total, record) => {
    const currency = findBankAccount(record.accountId)?.currency ?? "USD";
    return total + Math.abs(reconciliationDifference(record)) * exchangeRates[currency];
  }, 0);
}

/** The live reconciliation that blocks a second one on the same account. */
export function liveReconciliationFor(
  accountId: string,
  records: readonly ReconciliationRecord[],
): ReconciliationRecord | undefined {
  return records.find((record) => record.accountId === accountId && liveStatuses.includes(record.status));
}


/* ------------------------------------------------------------------ */
/* Manual-tick worksheet                                              */
/*                                                                    */
/* The worksheet reconstructs the bank's closing balance from the last */
/* reconciled balance and the movements ticked as presented:           */
/*                                                                    */
/*     opening + ticked receipts - ticked payments + adjustments       */
/*                                                                    */
/* The difference is what the bank says minus what that reconstruction */
/* produces. Nil difference means every presented movement is          */
/* accounted for; anything else is an unticked item or a bank-only     */
/* item (a charge, interest) that the books have not yet recorded.     */
/* ------------------------------------------------------------------ */

export type AdjustmentKind = "Bank charge" | "Interest earned" | "Unidentified item";

export interface WorksheetAdjustment {
  id: string;
  kind: AdjustmentKind;
  /** Signed against the bank balance: a charge reduces it, interest raises it. */
  amount: number;
  narrative: string;
}

export interface WorksheetTotals {
  receipts: number;
  payments: number;
  adjustments: number;
  balance: number;
  difference: number;
  tickedCount: number;
  untickedCount: number;
  untickedNet: number;
}

/** Adjustment kinds and the direction each moves the bank balance. */
export const adjustmentKinds: readonly { kind: AdjustmentKind; direction: -1 | 1; helper: string }[] = [
  { kind: "Bank charge", direction: -1, helper: "Taken by the bank and not yet in the books" },
  { kind: "Interest earned", direction: 1, helper: "Credited by the bank and not yet in the books" },
  { kind: "Unidentified item", direction: -1, helper: "On the statement with no ledger entry yet" },
];

/**
 * Movements offered for ticking: everything on or before the statement date.
 * A movement dated after the statement date cannot have presented on it, so
 * offering it would let a reconciliation tick something that has not happened.
 */
export function worksheetLinesFor(accountId: string, statementDate: string): readonly StatementLine[] {
  const iso = statementDate.slice(0, 10);
  return statementFor(accountId).lines.filter((line) => line.date <= iso);
}

export function worksheetOpeningBalance(accountId: string): number {
  return statementFor(accountId).openingBalance;
}

/**
 * The closing balance this sample implies if every movement the bank has
 * already presented is ticked. The prototype has no bank feed, so this is
 * what prefills the statement balance; a real reconciliation types the figure
 * printed on the statement.
 */
export function impliedStatementBalance(accountId: string, statementDate: string): number {
  const lines = worksheetLinesFor(accountId, statementDate);
  const presented = lines.filter((line) => line.reconciled);
  return round2(
    worksheetOpeningBalance(accountId)
      + presented.reduce((total, line) => total + line.debit, 0)
      - presented.reduce((total, line) => total + line.credit, 0),
  );
}

export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Money compares to the cent, never with ===. */
export function isNilDifference(difference: number): boolean {
  return Math.abs(round2(difference)) < 0.005;
}

export function worksheetTotals(
  lines: readonly StatementLine[],
  ticked: ReadonlySet<string>,
  openingBalance: number,
  statementBalance: number,
  adjustments: readonly WorksheetAdjustment[] = [],
): WorksheetTotals {
  const tickedLines = lines.filter((line) => ticked.has(line.id));
  const untickedLines = lines.filter((line) => !ticked.has(line.id));
  const receipts = round2(tickedLines.reduce((total, line) => total + line.debit, 0));
  const payments = round2(tickedLines.reduce((total, line) => total + line.credit, 0));
  const adjustmentTotal = round2(adjustments.reduce((total, item) => total + item.amount, 0));
  const balance = round2(openingBalance + receipts - payments + adjustmentTotal);
  return {
    receipts,
    payments,
    adjustments: adjustmentTotal,
    balance,
    difference: round2(statementBalance - balance),
    tickedCount: tickedLines.length,
    untickedCount: untickedLines.length,
    untickedNet: round2(untickedLines.reduce((total, line) => total + line.debit - line.credit, 0)),
  };
}

/**
 * A reconciliation is only submitted when it reconciles. Saving an unfinished
 * one is always allowed; submitting one that still differs is not.
 */
export function canSubmitWorksheet(difference: number): boolean {
  return isNilDifference(difference);
}
