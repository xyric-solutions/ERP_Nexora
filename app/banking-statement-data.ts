/**
 * Per-account bank statement fixtures for the isolated Nexora UI/UX prototype.
 *
 * These lines are a deterministic *sample* of movements on each account, not
 * the account's complete history: the opening balance here is the last
 * reconciled bank balance, and the running balance is built from it. They are
 * shared by the statement screen and the reconciliation worksheet so both
 * screens tick the same transactions.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency.
 */

export interface StatementLine {
  id: string;
  date: string;
  voucher: string;
  type: string;
  nominal: string;
  reference: string;
  details: string;
  debit: number;
  credit: number;
  reconciled: boolean;
}

/** Deterministic statement fixtures keyed by bank account. */
export const statements: Readonly<Record<string, { openingBalance: number; lines: readonly StatementLine[] }>> = {
  "BA-4471": {
    openingBalance: 820400,
    lines: [
      { id: "s1", date: "2026-08-04", voucher: "RCP-2026-0901", type: "Receipt", nominal: "10-02-00100", reference: "INV-2026-2190", details: "Northwind Logistics — invoice settlement", debit: 142300, credit: 0, reconciled: true },
      { id: "s2", date: "2026-08-06", voucher: "PAY-2026-0402", type: "Payment", nominal: "60-03-00100", reference: "131", details: "Utilities — August", debit: 0, credit: 18450, reconciled: true },
      { id: "s3", date: "2026-08-11", voucher: "PAY-2026-0405", type: "Payment", nominal: "20-01-00100", reference: "BILL-0844", details: "Vertex Components — parts supply", debit: 0, credit: 92480, reconciled: true },
      { id: "s4", date: "2026-08-14", voucher: "RCP-2026-0904", type: "Receipt", nominal: "10-02-00100", reference: "INV-2026-2201", details: "Delta Manufacturing — milestone 2", debit: 186400, credit: 0, reconciled: true },
      { id: "s5", date: "2026-08-18", voucher: "CHQ-104879", type: "Cheque", nominal: "20-01-00100", reference: "104879", details: "Atlas Metals — cheque issued (unpresented)", debit: 0, credit: 92000, reconciled: false },
      { id: "s6", date: "2026-08-21", voucher: "PAY-2026-0409", type: "Payment", nominal: "60-06-00100", reference: "128", details: "Travel — regional site visits", debit: 0, credit: 19057, reconciled: true },
      { id: "s7", date: "2026-08-25", voucher: "TRF-2026-0084", type: "Transfer", nominal: "10-01-00240", reference: "TRF-0084", details: "Sterling Trade sweep into operating", debit: 76260, credit: 0, reconciled: true },
      { id: "s8", date: "2026-08-26", voucher: "RCP-2026-0907", type: "Receipt", nominal: "10-01-00300", reference: "—", details: "Unidentified deposit — pending allocation", debit: 12480, credit: 0, reconciled: false },
      { id: "s9", date: "2026-08-29", voucher: "PAY-2026-0414", type: "Payment", nominal: "20-03-00100", reference: "TAX-08", details: "Regional tax authority — August", debit: 0, credit: 118940, reconciled: true },
      { id: "s10", date: "2026-08-30", voucher: "CHG-2026-0231", type: "Charge", nominal: "70-01-00100", reference: "MBL-01", details: "Facility fee applied by the bank", debit: 0, credit: 1860, reconciled: false },
      { id: "s11", date: "2026-08-31", voucher: "RCP-2026-0912", type: "Receipt", nominal: "10-02-00100", reference: "INV-2026-2214", details: "Meridian Health Group — full settlement", debit: 248600, credit: 0, reconciled: true },
      { id: "s12", date: "2026-08-31", voucher: "TRF-2026-0088", type: "Transfer", nominal: "10-01-00220", reference: "TRF-0088", details: "Euro collections sweep", debit: 195120, credit: 0, reconciled: true },
      { id: "s13", date: "2026-09-01", voucher: "PAY-2026-0417", type: "Payment", nominal: "20-01-00100", reference: "BILL-0891", details: "Vertex Components — September supply", debit: 0, credit: 92480, reconciled: false },
      { id: "s14", date: "2026-09-02", voucher: "PAY-2026-0416", type: "Payment", nominal: "20-02-00100", reference: "PR-08", details: "Payroll funding transfer", debit: 0, credit: 486200, reconciled: false },
    ],
  },
  "BA-4472": {
    // Payroll USD ties exactly: 240,000 opening + 500,000 funded - 647,640 paid
    // = 92,360, the account's ledger balance.
    openingBalance: 240000,
    lines: [
      { id: "p1", date: "2026-08-03", voucher: "TRF-2026-0079", type: "Transfer", nominal: "10-01-00200", reference: "TRF-0079", details: "Funding transfer from Operating USD", debit: 250000, credit: 0, reconciled: true },
      { id: "p2", date: "2026-08-05", voucher: "PAY-2026-0403", type: "Payment", nominal: "60-01-00100", reference: "PR-08A", details: "August payroll - first cycle", debit: 0, credit: 320000, reconciled: true },
      { id: "p3", date: "2026-08-18", voucher: "TRF-2026-0085", type: "Transfer", nominal: "10-01-00200", reference: "TRF-0085", details: "Funding transfer from Operating USD", debit: 250000, credit: 0, reconciled: true },
      { id: "p4", date: "2026-08-20", voucher: "PAY-2026-0408", type: "Payment", nominal: "60-01-00100", reference: "PR-08B", details: "August payroll - second cycle", debit: 0, credit: 240000, reconciled: true },
      { id: "p5", date: "2026-08-27", voucher: "PAY-2026-0412", type: "Payment", nominal: "20-02-00100", reference: "PR-TAX-08", details: "Payroll taxes and contributions", debit: 0, credit: 87640, reconciled: true },
    ],
  },
  "BA-8814": {
    openingBalance: 412000,
    lines: [
      { id: "e1", date: "2026-08-07", voucher: "RCP-2026-0902", type: "Receipt", nominal: "10-02-00100", reference: "INV-EU-118", details: "Crescent Retail — European invoice", debit: 162400, credit: 0, reconciled: true },
      { id: "e2", date: "2026-08-13", voucher: "PAY-2026-0406", type: "Payment", nominal: "20-01-00100", reference: "BILL-EU-22", details: "Lumen Packaging — SEPA settlement", debit: 0, credit: 64180, reconciled: true },
      { id: "e3", date: "2026-08-20", voucher: "RCP-2026-0905", type: "Receipt", nominal: "10-02-00100", reference: "INV-EU-121", details: "Summit Partners — retainer", debit: 96750, credit: 0, reconciled: true },
      { id: "e4", date: "2026-08-28", voucher: "CHG-2026-0228", type: "Charge", nominal: "70-01-00100", reference: "CT-04", details: "Cross-border transfer commission", debit: 0, credit: 2180, reconciled: false },
      { id: "e5", date: "2026-08-31", voucher: "TRF-2026-0088", type: "Transfer", nominal: "10-01-00200", reference: "TRF-0088", details: "Sweep to operating USD", debit: 0, credit: 180000, reconciled: true },
      { id: "e6", date: "2026-09-02", voucher: "RCP-2026-0913", type: "Receipt", nominal: "40-03-00100", reference: "INV-EU-125", details: "Support renewal — EU region", debit: 43430, credit: 0, reconciled: false },
    ],
  },
};

export const emptyStatement: { openingBalance: number; lines: readonly StatementLine[] } = {
  openingBalance: 0,
  lines: [],
};

export function statementFor(accountId: string): { openingBalance: number; lines: readonly StatementLine[] } {
  return statements[accountId] ?? emptyStatement;
}
