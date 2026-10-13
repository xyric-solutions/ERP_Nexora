"use client";

/**
 * Interactive bank reconciliation and statement-matching workspace for the
 * isolated Nexora UI/UX prototype. All state is local and resets on reload.
 */

import { useMemo, useState } from "react";
import { bankAccounts, findBankAccount, formatMoney } from "./banking-master-data";
import type { ReconciliationRecord } from "./banking-reconciliation-data";

type MatchState = "matched" | "suggested" | "unmatched";

interface LedgerCandidate {
  id: string;
  reference: string;
  date: string;
  description: string;
  amount: number;
  confidence: number;
  reason: string;
}

interface ReconciliationLine {
  id: string;
  date: string;
  bankReference: string;
  narrative: string;
  amount: number;
  state: MatchState;
  candidates: readonly LedgerCandidate[];
}

const statementLines: readonly ReconciliationLine[] = [
  {
    id: "stmt-001",
    date: "31 Aug 2026",
    bankReference: "FT26244009812",
    narrative: "MERIDIAN HEALTH GROUP INV 2214",
    amount: 248600,
    state: "suggested",
    candidates: [
      { id: "cand-001", reference: "RCP-2026-0912", date: "31 Aug 2026", description: "Meridian Health Group · invoice INV-2026-2214", amount: 248600, confidence: 99, reason: "Exact amount, same date and invoice reference" },
      { id: "cand-002", reference: "RCP-2026-0907", date: "26 Aug 2026", description: "Unidentified customer deposit", amount: 248600, confidence: 61, reason: "Exact amount but date and payer differ" },
    ],
  },
  {
    id: "stmt-002",
    date: "30 Aug 2026",
    bankReference: "FEE-AUG-4471",
    narrative: "MONTHLY FACILITY FEE",
    amount: -1860,
    state: "unmatched",
    candidates: [
      { id: "cand-003", reference: "CHG-2026-0231", date: "30 Aug 2026", description: "First Meridian · monthly facility fee", amount: -1860, confidence: 96, reason: "Exact amount, date and charge description" },
    ],
  },
  {
    id: "stmt-003",
    date: "29 Aug 2026",
    bankReference: "TAX-REG-08",
    narrative: "REGIONAL TAX AUTHORITY AUGUST",
    amount: -118940,
    state: "matched",
    candidates: [
      { id: "cand-004", reference: "PAY-2026-0414", date: "29 Aug 2026", description: "Regional tax authority · August remittance", amount: -118940, confidence: 100, reason: "Exact reference, amount and value date" },
    ],
  },
  {
    id: "stmt-004",
    date: "26 Aug 2026",
    bankReference: "CSH-DEP-8821",
    narrative: "CASH DEPOSIT DOWNTOWN BRANCH",
    amount: 12480,
    state: "unmatched",
    candidates: [
      { id: "cand-005", reference: "RCP-2026-0907", date: "26 Aug 2026", description: "Unidentified deposit · pending allocation", amount: 12480, confidence: 88, reason: "Exact amount and date; payer is missing" },
      { id: "cand-006", reference: "DEP-2026-0064", date: "25 Aug 2026", description: "Cash deposit slip 0064", amount: 12500, confidence: 67, reason: "Near amount and date within tolerance" },
    ],
  },
  {
    id: "stmt-005",
    date: "25 Aug 2026",
    bankReference: "SWEEP-EUR-0088",
    narrative: "CONTINENTAL TRUST EUR SWEEP",
    amount: 195120,
    state: "matched",
    candidates: [
      { id: "cand-007", reference: "TRF-2026-0088", date: "31 Aug 2026", description: "Euro collections sweep into Operating USD", amount: 195120, confidence: 94, reason: "Exact amount and transfer reference; settlement date differs" },
    ],
  },
  {
    id: "stmt-006",
    date: "18 Aug 2026",
    bankReference: "CHQ-104879",
    narrative: "CHEQUE 104879 PRESENTED",
    amount: -92000,
    state: "suggested",
    candidates: [
      { id: "cand-008", reference: "CHQ-104879", date: "18 Aug 2026", description: "Atlas Metals · cheque issued", amount: -92000, confidence: 100, reason: "Exact cheque number, date and amount" },
    ],
  },
];

function stateLabel(state: MatchState): string {
  return state === "matched" ? "Matched" : state === "suggested" ? "Suggested" : "Unmatched";
}

export function BankingReconciliation({
  mode,
  record,
  onAction,
  onOpenTransaction,
  onImportStatement,
  onBack,
}: {
  mode: "reconciliation" | "matching";
  /** The register record being worked; absent on the standalone matching screen. */
  record?: ReconciliationRecord;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction: (reference: string) => void;
  onImportStatement: () => void;
  onBack?: () => void;
}) {
  /** A submitted or approved reconciliation is shown as at certification: every
      line already presented, so the summary cannot contradict the status. */
  const certified = record ? record.status === "Submitted" || record.status === "Approved" : false;
  const [accountId, setAccountId] = useState(record?.accountId ?? "BA-4471");
  const [tab, setTab] = useState<"Review" | "Matched" | "Adjustments">(certified ? "Matched" : "Review");
  const [selectedLineId, setSelectedLineId] = useState(statementLines[0].id);
  const [selectedCandidateId, setSelectedCandidateId] = useState(statementLines[0].candidates[0].id);
  const [locallyMatched, setLocallyMatched] = useState<Set<string>>(
    () => certified ? new Set(statementLines.map((line) => line.id)) : new Set(),
  );
  const [completed, setCompleted] = useState(false);
  const account = findBankAccount(accountId) ?? bankAccounts[0];
  const statementCode = record?.statementCode ?? "STMT-2026-08-4471";
  const periodLabel = record?.periodLabel ?? "August 2026";
  const periodOptions = [...new Set([periodLabel, "August 2026", "September 2026"])];

  const effectiveLines = useMemo(
    () => statementLines.map((line) => locallyMatched.has(line.id) ? { ...line, state: "matched" as const } : line),
    [locallyMatched],
  );
  const selected = effectiveLines.find((line) => line.id === selectedLineId) ?? effectiveLines[0];
  const selectedCandidate = selected.candidates.find((candidate) => candidate.id === selectedCandidateId)
    ?? selected.candidates[0];
  const visibleLines = tab === "Matched"
    ? effectiveLines.filter((line) => line.state === "matched")
    : tab === "Adjustments"
      ? effectiveLines.filter((line) => line.state === "unmatched")
      : effectiveLines.filter((line) => line.state !== "matched");
  const matchedCount = effectiveLines.filter((line) => line.state === "matched").length;
  const unmatchedCount = effectiveLines.length - matchedCount;
  const statementBalance = record?.statementBalance ?? 598140;
  const ledgerBalance = record?.ledgerBalance ?? 612480;
  const difference = ledgerBalance - statementBalance;
  const progress = Math.round((matchedCount / effectiveLines.length) * 100);

  const chooseLine = (line: ReconciliationLine) => {
    setSelectedLineId(line.id);
    setSelectedCandidateId(line.candidates[0]?.id ?? "");
  };

  const matchSelected = () => {
    if (!selectedCandidate) {
      onAction("No match selected", selected.bankReference);
      return;
    }
    setLocallyMatched((current) => new Set(current).add(selected.id));
    onAction("Matched", selected.bankReference + " → " + selectedCandidate.reference);
  };

  return (
    <div className="nx-recon">
      {completed ? (
        <div className="nx-txn-banner nx-txn-banner--submitted" role="status">
          <strong>Reconciliation submitted for approval</strong>
          <span>{statementCode} is visually complete. No bank statement, journal or Demo Account record was changed.</span>
        </div>
      ) : null}

      <header className="nx-recon__head">
        <div>
          <span className="nx-eyebrow">Banking & Treasury · Period close</span>
          <h1>{mode === "matching" ? "Statement Matching" : "Bank Reconciliation"}</h1>
          <p>Match imported statement lines to ledger transactions, resolve exceptions and send a balanced reconciliation for approval.</p>
          <div className="nx-txn-detail__badges">
            <span className={`nx-status nx-status-${(record?.status ?? "In progress").toLowerCase().replaceAll(" ", "-")}`}>{record?.status ?? "In progress"}</span>
            {record ? <span className="nx-role-badge">{record.id}</span> : null}
            <span className="nx-role-badge">{statementCode}</span>
            <span className="nx-role-badge">{periodLabel}</span>
            {record ? <span className="nx-role-badge">{record.method}</span> : null}
          </div>
        </div>
        <div className="nx-txn-detail__actions">
          {onBack ? <button className="nx-button nx-button-secondary" type="button" onClick={onBack}>← Reconciliations</button> : null}
          {certified ? (
            <>
              <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Print reconciliation", record?.id ?? account.name)}>Print reconciliation</button>
              <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Request reopen", record?.id ?? account.name)}>Request reopen</button>
            </>
          ) : (
            <>
              <button className="nx-button nx-button-secondary" type="button" onClick={onImportStatement}>Import statement</button>
              <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Run auto-match", account.name)}>Run auto-match</button>
              <button className="nx-button nx-button-primary" type="button" onClick={() => { setCompleted(true); onAction("Submit reconciliation", account.name); }}>Submit for approval</button>
            </>
          )}
        </div>
      </header>

      <ol className="nx-recon__steps" aria-label="Reconciliation progress">
        {[
          ["1", record?.method === "Manual tick" ? "Closing balance keyed" : "Statement imported", `${record?.totalItems ?? 212} lines`],
          ["2", record?.method === "Manual tick" ? "Entries ticked as presented" : "Auto-match complete", `${record ? record.totalItems - record.openItems : 178} matched`],
          ["3", "Review exceptions", `${record ? record.openItems : unmatchedCount} open`],
          ["4", "Approval & close", record?.status === "Approved" ? "Approved" : record?.status === "Submitted" || completed ? "Submitted" : "Pending"],
        ].map(([number, label, meta], index) => (
          <li className={certified || index < 2 || completed ? "complete" : index === 2 ? "current" : ""} key={label}>
            <i>{certified || index < 2 || completed ? "✓" : number}</i>
            <span><strong>{label}</strong><small>{meta}</small></span>
          </li>
        ))}
      </ol>

      <section className="nx-recon__controls">
        <label>
          <span>Bank account</span>
          <select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
            {bankAccounts.filter((item) => item.status !== "Closed").map((item) => (
              <option key={item.id} value={item.id}>{item.name} · {item.number} ({item.currency})</option>
            ))}
          </select>
        </label>
        <label><span>Statement period</span><select defaultValue={periodLabel}>{periodOptions.map((option) => <option key={option}>{option}</option>)}</select></label>
        <label><span>Match tolerance</span><select defaultValue="3 days · 0.50"><option>3 days · 0.50</option><option>5 days · 1.00</option><option>Exact only</option></select></label>
        <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Recalculate", account.name)}>Refresh matches</button>
      </section>

      <section className="nx-recon__summary" aria-label="Reconciliation summary">
        <article><span>Statement balance</span><strong>{formatMoney(statementBalance, account.currency)}</strong><small>Bank closing balance</small></article>
        <article><span>Ledger balance</span><strong>{formatMoney(ledgerBalance, account.currency)}</strong><small>Before adjustments</small></article>
        <article className={difference === 0 ? undefined : "warning"}><span>Difference</span><strong>{formatMoney(difference, account.currency)}</strong><small>{difference === 0 ? "Statement agrees with the ledger" : "Requires explanation"}</small></article>
        <article><span>Matched progress</span><strong>{progress}%</strong><small>{matchedCount} of {effectiveLines.length} sample lines</small><i><b style={{ width: progress + "%" }} /></i></article>
      </section>

      <div className="nx-tabs" role="tablist" aria-label="Reconciliation views">
        {(["Review", "Matched", "Adjustments"] as const).map((item) => (
          <button aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} onClick={() => setTab(item)} role="tab" type="button">
            {item}{item === "Review" ? " (" + unmatchedCount + ")" : item === "Matched" ? " (" + matchedCount + ")" : ""}
          </button>
        ))}
      </div>

      <section className="nx-recon__workspace">
        <div className="nx-recon__statement">
          <header><div><span>Imported bank statement</span><h2>{tab === "Review" ? "Lines requiring review" : tab}</h2></div><small>Select a line to inspect its best ledger candidates.</small></header>
          <div className="nx-table-wrap">
            <table className="nx-data-table">
              <thead><tr><th>Date</th><th>Bank reference</th><th>Narrative</th><th className="amount">Amount</th><th>Match</th></tr></thead>
              <tbody>
                {visibleLines.length === 0 ? (
                  <tr><td colSpan={5} className="nx-statement-table__empty">No lines remain in this view.</td></tr>
                ) : visibleLines.map((line) => (
                  <tr className={selected.id === line.id ? "is-selected" : undefined} key={line.id}>
                    <td>{line.date}</td>
                    <td><button className="nx-record-link" type="button" onClick={() => chooseLine(line)}>{line.bankReference}</button></td>
                    <td>{line.narrative}</td>
                    <td className={line.amount >= 0 ? "amount nx-pos" : "amount nx-neg"}>{formatMoney(line.amount, account.currency)}</td>
                    <td><span className={"nx-status nx-status-" + (line.state === "matched" ? "posted" : line.state === "suggested" ? "pending-approval" : "rejected")}>{stateLabel(line.state)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="nx-recon__match">
          <header>
            <span>Selected statement line</span>
            <h2>{selected.bankReference}</h2>
            <strong className={selected.amount >= 0 ? "nx-pos" : "nx-neg"}>{formatMoney(selected.amount, account.currency)}</strong>
            <p>{selected.date} · {selected.narrative}</p>
          </header>
          <div className="nx-recon__candidate-head"><span>Suggested ledger matches</span><small>Ranked by amount, date and reference</small></div>
          <div className="nx-recon__candidates">
            {selected.candidates.map((candidate) => (
              <label className={selectedCandidate?.id === candidate.id ? "is-selected" : undefined} key={candidate.id}>
                <input checked={selectedCandidate?.id === candidate.id} name="ledger-candidate" onChange={() => setSelectedCandidateId(candidate.id)} type="radio" />
                <span>
                  <b>{candidate.confidence}%</b>
                  <strong>{candidate.reference}</strong>
                  <small>{candidate.date} · {candidate.description}</small>
                  <em>{candidate.reason}</em>
                  <i><u style={{ width: candidate.confidence + "%" }} /></i>
                </span>
                <strong>{formatMoney(candidate.amount, account.currency)}</strong>
              </label>
            ))}
          </div>
          <div className="nx-recon__match-actions">
            <button className="nx-button nx-button-primary" disabled={!selectedCandidate || selected.state === "matched"} type="button" onClick={matchSelected}>Match selected</button>
            {selectedCandidate ? <button className="nx-button nx-button-secondary" type="button" onClick={() => onOpenTransaction(selectedCandidate.reference)}>Open ledger entry</button> : null}
            <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Create adjustment", selected.bankReference)}>Create adjustment</button>
            <button className="nx-button nx-button-ghost" type="button" onClick={() => onAction("Leave unmatched", selected.bankReference)}>Leave unmatched</button>
          </div>
          <p className="nx-role-section-note"><strong>Prototype boundary</strong><span>Matching and adjustment actions change only this temporary screen state.</span></p>
        </aside>
      </section>
    </div>
  );
}
