"use client";

/**
 * Banking transaction and bank account detail views for the isolated Nexora
 * UI/UX prototype. Shows the complete accounting effect, lifecycle status and
 * workflow actions for a saved transaction.
 *
 * Presentation only: nothing is posted, stored or transmitted.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  accountLabel,
  bankAccounts,
  findAccount,
  findBankAccount,
  formatMoney,
  type BankCurrency,
} from "../model/banking-master-data";
import { findTransactionType } from "../model/banking-transaction-types";
import { bankingProfile } from "../model/banking-profile";
import type { ModuleRow } from "@prototype/shared/types/module-profile-types";

export interface SavedJournalLine {
  accountCode: string;
  description: string;
  debit: number;
  credit: number;
}

export interface SavedBankingTransaction {
  reference: string;
  typeId: string;
  status:
    | "Draft"
    | "Pending approval"
    | "Approved"
    | "Posted"
    | "Rejected"
    | "Reversed"
    | "Part allocated"
    | "Unallocated"
    | "Outstanding"
    | "Cleared"
    | "Stale"
    | "Void";
  transactionDate: string;
  valueDate: string;
  bankAccountId: string;
  counterBankAccountId?: string;
  party: string;
  currency: BankCurrency;
  exchangeRate: number;
  amount: number;
  method: string;
  description: string;
  notes: string;
  costCentre: string;
  approvalRoute: string;
  attachment?: string;
  chequeNumber?: string;
  chequeDate?: string;
  createdBy: string;
  createdAt: string;
  lines: readonly SavedJournalLine[];
  approvals: readonly { label: string; person: string; time: string; state: "complete" | "current" | "pending" }[];
  audit: readonly { action: string; actor: string; time: string }[];
}

const standardAudit = [
  { action: "Submitted for approval", actor: "Ayesha Malik", time: "02 Sep 2026, 10:18" },
  { action: "Attachment added", actor: "Ayesha Malik", time: "02 Sep 2026, 10:12" },
  { action: "Amount updated", actor: "Ayesha Malik", time: "02 Sep 2026, 09:54" },
  { action: "Draft created", actor: "Ayesha Malik", time: "01 Sep 2026, 16:41" },
];

export const savedBankingTransactions: readonly SavedBankingTransaction[] = [
  {
    reference: "PAY-2026-0418",
    typeId: "bank-payment",
    status: "Pending approval",
    transactionDate: "02 Sep 2026",
    valueDate: "03 Sep 2026",
    bankAccountId: "BA-4471",
    party: "Atlas Metals Ltd.",
    currency: "USD",
    exchangeRate: 1,
    amount: 184260,
    method: "Wire transfer",
    description: "Settlement of August enclosure supply against agreed terms",
    notes: "Release only after the quality hold on PO-2026-1836 is cleared.",
    costCentre: "Operations",
    approvalRoute: "Finance review → Final approval",
    attachment: "remittance-advice-atlas-aug.pdf",
    createdBy: "Ayesha Malik",
    createdAt: "01 Sep 2026, 16:41",
    lines: [
      { accountCode: "20-01-00100", description: "Accounts Payable — Atlas Metals Ltd.", debit: 184260, credit: 0 },
      { accountCode: "10-01-00200", description: "Bank — Operating USD", debit: 0, credit: 184285 },
      { accountCode: "70-01-00100", description: "Wire transfer fee", debit: 25, credit: 0 },
    ],
    approvals: [
      { label: "Requested", person: "Ayesha Malik", time: "02 Sep · 10:18", state: "complete" },
      { label: "Department manager", person: "Bilal Khan", time: "02 Sep · 11:05", state: "complete" },
      { label: "Finance review", person: "Mariam Ali", time: "Current step", state: "current" },
      { label: "Final approval", person: "Omar Siddiqui", time: "Pending", state: "pending" },
    ],
    audit: standardAudit,
  },
  {
    reference: "RCP-2026-0912",
    typeId: "bank-receipt",
    status: "Posted",
    transactionDate: "31 Aug 2026",
    valueDate: "31 Aug 2026",
    bankAccountId: "BA-4471",
    party: "Meridian Health Group",
    currency: "USD",
    exchangeRate: 1,
    amount: 248600,
    method: "Wire transfer",
    description: "Full settlement of invoice INV-2026-2214",
    notes: "Remittance advice matched to a single open invoice.",
    costCentre: "Commercial",
    approvalRoute: "Single approver (under $25,000)",
    attachment: "remittance-meridian-2214.pdf",
    createdBy: "Sana Iqbal",
    createdAt: "31 Aug 2026, 09:22",
    lines: [
      { accountCode: "10-01-00200", description: "Bank — Operating USD", debit: 248600, credit: 0 },
      { accountCode: "10-02-00100", description: "Accounts Receivable — Meridian Health Group", debit: 0, credit: 248600 },
    ],
    approvals: [
      { label: "Requested", person: "Sana Iqbal", time: "31 Aug · 09:22", state: "complete" },
      { label: "Finance review", person: "Mariam Ali", time: "31 Aug · 10:40", state: "complete" },
      { label: "Posted to ledger", person: "System", time: "31 Aug · 10:41", state: "complete" },
    ],
    audit: [
      { action: "Posted to general ledger", actor: "System", time: "31 Aug 2026, 10:41" },
      { action: "Approved", actor: "Mariam Ali", time: "31 Aug 2026, 10:40" },
      { action: "Submitted for approval", actor: "Sana Iqbal", time: "31 Aug 2026, 09:22" },
    ],
  },
  {
    reference: "TRF-2026-0088",
    typeId: "bank-transfer",
    status: "Posted",
    transactionDate: "31 Aug 2026",
    valueDate: "31 Aug 2026",
    bankAccountId: "BA-8814",
    counterBankAccountId: "BA-4471",
    party: "Internal",
    currency: "EUR",
    exchangeRate: 1.084,
    amount: 180000,
    method: "Internal transfer",
    description: "Sweep euro collections into the operating account",
    notes: "Monthly sweep under the treasury policy.",
    costCentre: "Corporate",
    approvalRoute: "Dual signature (over $250,000)",
    createdBy: "Mariam Ali",
    createdAt: "31 Aug 2026, 08:05",
    lines: [
      { accountCode: "10-01-00200", description: "Bank — Operating USD (funds received)", debit: 195120, credit: 0 },
      { accountCode: "10-01-00220", description: "Bank — Collections EUR (funds sent)", debit: 0, credit: 195120 },
    ],
    approvals: [
      { label: "Requested", person: "Mariam Ali", time: "31 Aug · 08:05", state: "complete" },
      { label: "Treasury approval", person: "Omar Siddiqui", time: "31 Aug · 08:44", state: "complete" },
      { label: "Posted to ledger", person: "System", time: "31 Aug · 08:45", state: "complete" },
    ],
    audit: [
      { action: "Posted to general ledger", actor: "System", time: "31 Aug 2026, 08:45" },
      { action: "Approved", actor: "Omar Siddiqui", time: "31 Aug 2026, 08:44" },
      { action: "Draft created", actor: "Mariam Ali", time: "31 Aug 2026, 08:05" },
    ],
  },
  {
    reference: "CHQ-104882",
    typeId: "cheque-issued",
    status: "Approved",
    transactionDate: "28 Aug 2026",
    valueDate: "04 Sep 2026",
    bankAccountId: "BA-4471",
    party: "Northgate Facilities",
    currency: "USD",
    exchangeRate: 1,
    amount: 24600,
    method: "Post dated",
    description: "Quarterly facilities charge",
    notes: "Post-dated cheque presented on 04 Sep.",
    costCentre: "Facilities",
    approvalRoute: "Finance review → Final approval",
    chequeNumber: "104882",
    chequeDate: "04 Sep 2026",
    createdBy: "Bilal Khan",
    createdAt: "28 Aug 2026, 14:02",
    lines: [
      { accountCode: "60-05-00100", description: "Office Rent — Q3 facilities charge", debit: 24600, credit: 0 },
      { accountCode: "10-01-00200", description: "Bank — Operating USD (cheque issued)", debit: 0, credit: 24600 },
    ],
    approvals: [
      { label: "Requested", person: "Bilal Khan", time: "28 Aug · 14:02", state: "complete" },
      { label: "Finance review", person: "Mariam Ali", time: "28 Aug · 15:20", state: "complete" },
      { label: "Awaiting presentation", person: "Bank", time: "Due 04 Sep", state: "current" },
    ],
    audit: [
      { action: "Approved", actor: "Mariam Ali", time: "28 Aug 2026, 15:20" },
      { action: "Cheque printed", actor: "Bilal Khan", time: "28 Aug 2026, 14:20" },
      { action: "Draft created", actor: "Bilal Khan", time: "28 Aug 2026, 14:02" },
    ],
  },
  {
    reference: "CHG-2026-0231",
    typeId: "bank-charges",
    status: "Posted",
    transactionDate: "30 Aug 2026",
    valueDate: "30 Aug 2026",
    bankAccountId: "BA-4471",
    party: "First Meridian Bank",
    currency: "USD",
    exchangeRate: 1,
    amount: 1860,
    method: "Facility fee",
    description: "Monthly facility fee applied by the bank",
    notes: "Identified during reconciliation as not previously recorded.",
    costCentre: "Corporate",
    approvalRoute: "Single approver (under $25,000)",
    createdBy: "Mariam Ali",
    createdAt: "31 Aug 2026, 11:12",
    lines: [
      { accountCode: "70-01-00100", description: "Bank Charges & Commission — facility fee", debit: 1860, credit: 0 },
      { accountCode: "10-01-00200", description: "Bank — Operating USD", debit: 0, credit: 1860 },
    ],
    approvals: [
      { label: "Requested", person: "Mariam Ali", time: "31 Aug · 11:12", state: "complete" },
      { label: "Posted to ledger", person: "System", time: "31 Aug · 11:15", state: "complete" },
    ],
    audit: [
      { action: "Posted to general ledger", actor: "System", time: "31 Aug 2026, 11:15" },
      { action: "Created from reconciliation", actor: "Mariam Ali", time: "31 Aug 2026, 11:12" },
    ],
  },
];

export function findSavedTransaction(reference: string): SavedBankingTransaction | undefined {
  return savedBankingTransactions.find((transaction) => transaction.reference === reference);
}

const statusTone: Record<SavedBankingTransaction["status"], string> = {
  Draft: "draft",
  "Pending approval": "pending-approval",
  Approved: "approved",
  Posted: "posted",
  Rejected: "rejected",
  Reversed: "reversed",
  "Part allocated": "pending-approval",
  Unallocated: "rejected",
  Outstanding: "pending-approval",
  Cleared: "posted",
  Stale: "rejected",
  Void: "reversed",
};

function parseAmount(value: string | undefined): number {
  const parsed = Number.parseFloat((value ?? "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function currencyFrom(row: ModuleRow): BankCurrency {
  if (["USD", "EUR", "GBP", "PKR"].includes(row.cells.cur ?? "")) {
    return row.cells.cur as BankCurrency;
  }
  const amount = row.cells.amount ?? "";
  if (amount.includes("€")) return "EUR";
  if (amount.includes("£")) return "GBP";
  if (amount.includes("₨")) return "PKR";
  return "USD";
}

function bankForLabel(label: string | undefined) {
  const value = (label ?? "").toLowerCase();
  if (value.includes("cash")) return findBankAccount("BA-CASH") ?? bankAccounts[0];
  if (value.includes("payroll")) return findBankAccount("BA-4472") ?? bankAccounts[0];
  if (value.includes("collection") || value.includes("euro")) return findBankAccount("BA-8814") ?? bankAccounts[0];
  if (value.includes("sterling")) return findBankAccount("BA-2260") ?? bankAccounts[0];
  if (value.includes("reserve")) return findBankAccount("BA-4480") ?? bankAccounts[0];
  if (value.includes("local") || value.includes("meezan") || value.includes("pkr")) {
    return findBankAccount("BA-9902") ?? bankAccounts[0];
  }
  return bankAccounts[0];
}

const nominalCodes: Readonly<Record<string, string>> = {
  "trade debtors": "10-02-00100",
  "trade receivables": "10-02-00100",
  "other creditors": "20-01-00200",
  "payroll payable": "20-02-00100",
  "bank charges": "70-01-00100",
  "travel expenses": "60-06-00100",
  "vehicle fuel": "60-06-00100",
  "internet charges": "60-03-00100",
  "consultancy income": "40-01-00100",
  "other income": "40-04-00300",
  "suspense account": "10-01-00320",
};

function nominalCode(label: string | undefined, fallback: string): string {
  return nominalCodes[(label ?? "").trim().toLowerCase()] ?? fallback;
}

function selectedReference(pageId: string, row: ModuleRow): string {
  if (pageId === "bank-payments") return "BPV-" + String(row.cells.voucher ?? row.id).padStart(6, "0");
  if (pageId === "bank-receipts") return "BRV-" + String(row.cells.voucher ?? row.id).padStart(6, "0");
  return row.cells.reference ?? row.cells.number ?? row.id;
}

function selectedStatus(status: string): SavedBankingTransaction["status"] {
  const supported = new Set<SavedBankingTransaction["status"]>([
    "Draft", "Pending approval", "Approved", "Posted", "Rejected", "Reversed",
    "Part allocated", "Unallocated", "Outstanding", "Cleared", "Stale", "Void",
  ]);
  return supported.has(status as SavedBankingTransaction["status"])
    ? status as SavedBankingTransaction["status"]
    : "Pending approval";
}

function buildSelectedTransaction(pageId: string, selected: ModuleRow): SavedBankingTransaction {
  const list = bankingProfile.pages[pageId]?.list;
  const isBatch = pageId === "bank-payments" || pageId === "bank-receipts";
  const related = isBatch && list
    ? list.rows.filter((row) => row.cells.voucher === selected.cells.voucher)
    : [selected];
  const isReceipt = pageId === "bank-receipts";
  const isTransfer = pageId === "transfers";
  const isCheque = pageId === "cheques";
  const currency = currencyFrom(selected);
  const sourceBank = bankForLabel(selected.cells.bank ?? selected.cells.from ?? selected.cells.account);
  const destinationBank = isTransfer ? bankForLabel(selected.cells.to) : undefined;
  const amount = related.reduce((sum, row) => sum + parseAmount(row.cells.amount), 0);
  const lines: SavedJournalLine[] = [];

  if (isTransfer && destinationBank) {
    const baseAmount = amount * (parseAmount(selected.cells.rate) || 1);
    lines.push(
      { accountCode: destinationBank.glCode, description: destinationBank.name + " · funds received", debit: baseAmount, credit: 0 },
      { accountCode: sourceBank.glCode, description: sourceBank.name + " · funds transferred", debit: 0, credit: baseAmount },
    );
  } else if (isReceipt) {
    lines.push({ accountCode: sourceBank.glCode, description: sourceBank.name + " · batch receipt", debit: amount, credit: 0 });
    related.forEach((row) => lines.push({
      accountCode: nominalCode(row.cells.nominal, "10-02-00100"),
      description: row.cells.details ?? "Bank receipt",
      debit: 0,
      credit: parseAmount(row.cells.amount),
    }));
  } else {
    related.forEach((row) => lines.push({
      accountCode: nominalCode(row.cells.nominal, isCheque ? "60-05-00100" : "20-01-00100"),
      description: row.cells.details ?? row.cells.payee ?? "Bank payment",
      debit: parseAmount(row.cells.amount),
      credit: 0,
    }));
    lines.push({ accountCode: sourceBank.glCode, description: sourceBank.name + " · money out", debit: 0, credit: amount });
  }

  const status = selectedStatus(selected.status);
  const complete = status === "Posted" || status === "Cleared";
  const closed = ["Rejected", "Reversed", "Void"].includes(status);
  const date = selected.cells.date ?? selected.cells.issued ?? "31 Aug 2026";
  const actor = selected.cells.requested ?? "Finance team";
  const approvals: SavedBankingTransaction["approvals"] = complete
    ? [
        { label: "Created", person: actor, time: date, state: "complete" },
        { label: "Finance review", person: "Mariam Ali", time: date, state: "complete" },
        { label: "Posted to ledger", person: "System", time: date, state: "complete" },
      ]
    : closed
      ? [
          { label: "Created", person: actor, time: date, state: "complete" },
          { label: status, person: "Finance control", time: date, state: "complete" },
        ]
      : [
          { label: "Created", person: actor, time: date, state: "complete" },
          { label: "Finance review", person: "Mariam Ali", time: "Current step", state: "current" },
          { label: "Post to ledger", person: "System", time: "Pending", state: "pending" },
        ];
  const party = selected.cells.payee
    ?? selected.cells.requested
    ?? selected.cells.details?.split(/\s[-–—]\s/)[0]
    ?? (isTransfer ? "Internal treasury" : "Counterparty");

  return {
    reference: selectedReference(pageId, selected),
    typeId: isReceipt ? "bank-receipt" : isTransfer ? "bank-transfer" : isCheque ? "cheque-issued" : "bank-payment",
    status,
    transactionDate: date,
    valueDate: date,
    bankAccountId: sourceBank.id,
    counterBankAccountId: destinationBank?.id,
    party,
    currency,
    exchangeRate: isTransfer ? parseAmount(selected.cells.rate) || 1 : 1,
    amount,
    method: isCheque ? "Cheque" : isTransfer ? "Internal transfer" : "Bank transfer",
    description: isReceipt
      ? related.length + "-line bank receipt batch"
      : isTransfer
        ? "Transfer from " + selected.cells.from + " to " + selected.cells.to
        : isCheque
          ? "Cheque issued to " + selected.cells.payee
          : related.length + "-line bank payment batch",
    notes: "Opened from the " + pageId.replaceAll("-", " ") + " worklist. Prototype record only.",
    costCentre: "Corporate",
    approvalRoute: complete ? "Finance review → Posted" : "Finance review → Final approval",
    chequeNumber: selected.cells.number,
    chequeDate: isCheque ? date : undefined,
    createdBy: actor,
    createdAt: date + " · 09:30",
    lines,
    approvals,
    audit: [
      { action: "Status: " + status, actor: "Finance workflow", time: date },
      { action: "Record created", actor, time: date + " · 09:30" },
    ],
  };
}

export function BankingTransactionDetail({
  reference,
  sourcePageId,
  sourceRow,
  onAction,
  onBack,
}: {
  reference?: string;
  sourcePageId?: string;
  sourceRow?: ModuleRow;
  onAction: (action: string, subject?: string) => void;
  onBack?: () => void;
}) {
  const [tab, setTab] = useState("Accounting effect");
  const storedTransaction = findSavedTransaction(reference ?? "");
  const transaction = sourcePageId && sourceRow
    ? buildSelectedTransaction(sourcePageId, sourceRow)
    : storedTransaction ?? {
        ...savedBankingTransactions[0],
        reference: reference ?? savedBankingTransactions[0].reference,
        status: "Approved",
        description: "Prototype banking transaction opened from the selected workspace",
        notes: "This illustrative detail was generated locally for the selected reference.",
        audit: [
          { action: "Detail opened", actor: "Prototype user", time: "Current session" },
          ...savedBankingTransactions[0].audit,
        ],
      };
  const type = findTransactionType(transaction.typeId);
  const bank = findBankAccount(transaction.bankAccountId);
  const counterBank = transaction.counterBankAccountId ? findBankAccount(transaction.counterBankAccountId) : undefined;
  const totalDebit = transaction.lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = transaction.lines.reduce((sum, line) => sum + line.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.005;
  const tabs = ["Accounting effect", "Details", "Approval", "Audit trail"];
  const canApprove = transaction.status === "Pending approval";
  const canReverse = transaction.status === "Posted" || transaction.status === "Cleared";

  return (
    <div className="grid min-w-0 gap-3.5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {onBack ? <button className="nx-record-link" type="button" onClick={onBack}>← Back to list</button> : null}
            <span>{type?.label ?? "Bank transaction"}</span>
          </div>
          <h1>{transaction.reference}</h1>
          <p>{transaction.description}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className={`nx-status nx-status-${statusTone[transaction.status]}`}>{transaction.status}</span>
            <span className="nx-role-badge">{type?.label}</span>
            <span className="nx-role-badge">{transaction.transactionDate}</span>
            {transaction.chequeNumber ? <span className="nx-role-badge">Cheque {transaction.chequeNumber}</span> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" type="button" onClick={() => onAction("Print", transaction.reference)}>Print</Button>
          {transaction.status === "Draft" || canApprove ? (
            <Button variant="outline" type="button" onClick={() => onAction("Edit", transaction.reference)}>Edit</Button>
          ) : null}
          {canApprove ? (
            <>
              <Button variant="destructive" type="button" onClick={() => onAction("Reject", transaction.reference)}>Reject</Button>
              <Button type="button" onClick={() => onAction("Approve", transaction.reference)}>Approve</Button>
            </>
          ) : null}
          {canReverse ? (
            <Button variant="outline" type="button" onClick={() => onAction("Reverse posting", transaction.reference)}>Reverse</Button>
          ) : null}
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9.375rem,1fr))] gap-3.5 rounded-md border border-border bg-card p-4 shadow-xs [&_span]:block [&_span]:text-xs [&_span]:font-semibold [&_span]:text-muted-foreground [&_strong]:mt-1 [&_strong]:block [&_strong]:text-base [&_strong]:font-bold [&_strong]:tabular-nums [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground">
        <div><span>Amount</span><strong>{formatMoney(transaction.amount, transaction.currency)}</strong></div>
        <div><span>Bank account</span><strong>{bank?.name ?? "—"}</strong><small>{bank?.number}</small></div>
        {counterBank ? <div><span>Destination</span><strong>{counterBank.name}</strong><small>{counterBank.number}</small></div> : null}
        <div><span>{type?.partyKind === "customer" ? "Received from" : type?.partyKind === "supplier" ? "Paid to" : "Party"}</span><strong>{transaction.party}</strong></div>
        <div><span>Method</span><strong>{transaction.method}</strong></div>
        <div><span>Value date</span><strong>{transaction.valueDate}</strong></div>
      </section>

      <div className="nx-tabs" role="tablist" aria-label="Transaction sections">
        {tabs.map((item) => (
          <Button variant="outline" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} role="tab" type="button">{item}</Button>
        ))}
      </div>

      <div className="nx-content-grid nx-detail-layout">
        <section className="nx-card nx-detail-main">
          <div className="nx-card-head">
            <div><span>{tab}</span><h2>{tab === "Accounting effect" ? "General ledger impact" : tab}</h2></div>
            {tab === "Accounting effect" ? (
              <span className={`nx-status nx-status-${balanced ? "posted" : "rejected"}`}>{balanced ? "Balanced" : "Out of balance"}</span>
            ) : null}
          </div>

          {tab === "Accounting effect" ? (
            <>
              <div className="nx-table-wrap">
                <table className="nx-data-table [&_tbody_small]:block [&_tbody_small]:text-xs [&_tbody_small]:text-muted-foreground">
                  <thead>
                    <tr><th>Account</th><th>Description</th><th className="amount">Debit</th><th className="amount">Credit</th></tr>
                  </thead>
                  <tbody>
                    {transaction.lines.map((line, index) => {
                      const account = findAccount(line.accountCode);
                      return (
                        <tr key={`${line.accountCode}-${index}`}>
                          <td>
                            <button className="nx-record-link" type="button" onClick={() => onAction("Open nominal", accountLabel(line.accountCode))}>
                              {line.accountCode}
                            </button>
                            <small>{account?.name}</small>
                          </td>
                          <td>{line.description}</td>
                          <td className="amount">{line.debit > 0 ? formatMoney(line.debit, transaction.currency) : "—"}</td>
                          <td className="amount">{line.credit > 0 ? formatMoney(line.credit, transaction.currency) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={2} scope="row">Totals</th>
                      <td className="amount">{formatMoney(totalDebit, transaction.currency)}</td>
                      <td className="amount">{formatMoney(totalCredit, transaction.currency)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              {transaction.exchangeRate !== 1 ? (
                <p className="nx-role-section-note">
                  <strong>Currency</strong>
                  <span>{transaction.currency} converted at {transaction.exchangeRate} — base value {formatMoney(transaction.amount * transaction.exchangeRate)} USD.</span>
                </p>
              ) : null}
            </>
          ) : tab === "Details" ? (
            <div className="nx-field-grid">
              {[
                ["Transaction type", type?.label ?? "—"],
                ["Reference", transaction.reference],
                ["Transaction date", transaction.transactionDate],
                ["Value date", transaction.valueDate],
                ["Currency", transaction.currency],
                ["Exchange rate", String(transaction.exchangeRate)],
                ["Cost centre", transaction.costCentre],
                ["Approval route", transaction.approvalRoute],
                ["Created by", transaction.createdBy],
                ["Created at", transaction.createdAt],
                ["Supporting document", transaction.attachment ?? "None attached"],
                ["Internal notes", transaction.notes],
              ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          ) : tab === "Approval" ? (
            <ol className="nx-approval-timeline">
              {transaction.approvals.map((step, index) => (
                <li className={step.state} key={step.label}>
                  <i>{step.state === "complete" ? "✓" : index + 1}</i>
                  <div><strong>{step.label}</strong><span>{step.person}</span><small>{step.time}</small></div>
                </li>
              ))}
            </ol>
          ) : (
            <ol className="nx-audit-timeline">
              {transaction.audit.map((item) => (
                <li key={item.action + item.time}><i /><div><strong>{item.action}</strong><span>{item.actor}</span><small>{item.time}</small></div></li>
              ))}
            </ol>
          )}
        </section>

        <aside className="nx-card nx-activity-panel">
          <div className="nx-card-head"><div><span>Status</span><h2>Lifecycle</h2></div></div>
          <ol className="nx-approval-timeline">
            {transaction.approvals.map((step, index) => (
              <li className={step.state} key={`side-${step.label}`}>
                <i>{step.state === "complete" ? "✓" : index + 1}</i>
                <div><strong>{step.label}</strong><small>{step.time}</small></div>
              </li>
            ))}
          </ol>
          <p className="nx-role-section-note">
            <strong>Prototype boundary</strong>
            <span>Approve, reject and reverse are visual states only. No ledger, bank file or Demo Account record is affected.</span>
          </p>
        </aside>
      </div>
    </div>
  );
}

export function BankAccountDetail({
  accountId,
  onAction,
  onOpenTransaction,
  onOpenStatement,
  onNewTransaction,
}: {
  accountId: string;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction: (reference: string) => void;
  onOpenStatement?: (accountId: string) => void;
  onNewTransaction?: (accountId: string) => void;
}) {
  const account = findBankAccount(accountId) ?? bankAccounts[0];
  const related = savedBankingTransactions.filter((transaction) => transaction.bankAccountId === account.id || transaction.counterBankAccountId === account.id);

  return (
    <div className="grid min-w-0 gap-3.5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5 text-xs font-bold uppercase tracking-wider text-muted-foreground"><span>Bank & cash accounts</span></div>
          <h1>{account.name}</h1>
          <p>{account.bank} · {account.branch} · {account.number}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <span className={`nx-status nx-status-${account.status.toLowerCase()}`}>{account.status}</span>
            <span className="nx-role-badge">{account.type}</span>
            <span className="nx-role-badge">{account.currency}</span>
            <span className="nx-role-badge">{accountLabel(account.glCode)}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            type="button"
            onClick={() => {
              onAction("Statement", account.name);
              onOpenStatement?.(account.id);
            }}
          >
            Statement
          </Button>
          <Button variant="outline" type="button" onClick={() => onAction("Edit account", account.name)}>Edit</Button>
          <Button
            type="button"
            onClick={() => {
              onAction("New transaction", account.name);
              onNewTransaction?.(account.id);
            }}
          >
            New transaction
          </Button>
        </div>
      </header>

      <section className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(9.375rem,1fr))] gap-3.5 rounded-md border border-border bg-card p-4 shadow-xs [&_span]:block [&_span]:text-xs [&_span]:font-semibold [&_span]:text-muted-foreground [&_strong]:mt-1 [&_strong]:block [&_strong]:text-base [&_strong]:font-bold [&_strong]:tabular-nums [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground">
        <div><span>Ledger balance</span><strong>{formatMoney(account.ledgerBalance, account.currency)}</strong></div>
        <div><span>Available</span><strong>{formatMoney(account.availableBalance, account.currency)}</strong></div>
        <div><span>Overdraft limit</span><strong>{formatMoney(account.overdraftLimit, account.currency)}</strong></div>
        <div><span>Unreconciled</span><strong>{account.unreconciled} items</strong></div>
        <div><span>Last movement</span><strong>{account.lastMovement}</strong></div>
      </section>

      <div className="nx-content-grid nx-detail-layout">
        <section className="nx-card nx-detail-main">
          <div className="nx-card-head"><div><span>Activity</span><h2>Recent transactions</h2></div></div>
          <div className="nx-table-wrap">
            <table className="nx-data-table">
              <thead><tr><th>Reference</th><th>Date</th><th>Party</th><th className="amount">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {related.length === 0 ? (
                  <tr><td colSpan={5}>No transactions recorded against this account in the prototype fixtures.</td></tr>
                ) : related.map((transaction) => (
                  <tr key={transaction.reference}>
                    <td><button className="nx-record-link" type="button" onClick={() => onOpenTransaction(transaction.reference)}>{transaction.reference}</button></td>
                    <td>{transaction.transactionDate}</td>
                    <td>{transaction.party}</td>
                    <td className="amount">{formatMoney(transaction.amount, transaction.currency)}</td>
                    <td><span className={`nx-status nx-status-${statusTone[transaction.status]}`}>{transaction.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="nx-card nx-activity-panel">
          <div className="nx-card-head"><div><span>Account</span><h2>Banking details</h2></div></div>
          <div className="nx-field-grid">
            {[
              ["IBAN", account.iban],
              ["SWIFT / BIC", account.swift],
              ["Nominal control", accountLabel(account.glCode)],
              ["Opened", account.openedOn],
              ["Signatories", account.signatories.join(", ")],
            ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </aside>
      </div>
    </div>
  );
}
