"use client";

/**
 * Multi-line bank payment / receipt entry for the isolated Nexora UI/UX
 * prototype.
 *
 * Uses the Nexora transaction pattern: one bank account header, then a grid of
 * lines that each carry their own date, reference, mode, nominal account,
 * details and amount. Every line posts against the single bank account, so
 * the batch is a balanced journal by construction and the running total plus
 * the double-entry summary stay visible while the user types.
 *
 * Presentation only: nothing is posted, stored or transmitted.
 */

import { useState } from "react";
import { customers } from "./mock-data";
import { AccountSelect } from "./banking-account-select";
import {
  accountLabel,
  bankAccounts,
  findAccount,
  findBankAccount,
  formatMoney,
} from "./banking-master-data";

export type BatchEntryKind = "payment" | "receipt";

interface BatchLine {
  id: string;
  date: string;
  reference: string;
  mode: string;
  account: string;
  party: string;
  document: string;
  details: string;
  amount: string;
}

const paymentModes = ["Bank transfer", "Cheque", "Cash", "Online", "Standing order", "Card"] as const;
const receiptModes = ["Bank transfer", "Cheque", "Cash", "Online", "Direct debit", "Card"] as const;

const config = {
  payment: {
    title: "Add Bank Payments",
    accountLabel: "Nominal Account",
    accountHelper: "Expense, payable or asset account charged by this payment.",
    suggested: ["60-05-00100", "60-02-00100", "60-03-00100", "60-06-00100", "20-01-00100", "70-01-00100"],
    modes: paymentModes,
    bankSideLabel: "Credit (money out)",
    summaryNote: "Each line debits its nominal account; the bank account is credited with the batch total.",
    prefix: "PAY",
  },
  receipt: {
    title: "Add Bank Receipts",
    accountLabel: "Nominal Account",
    accountHelper: "Receivable or income account credited by this receipt.",
    suggested: ["10-02-00100", "40-01-00100", "40-02-00100", "40-03-00100", "40-04-00300"],
    modes: receiptModes,
    bankSideLabel: "Debit (money in)",
    summaryNote: "Each line credits its nominal account; the bank account is debited with the batch total.",
    prefix: "RCP",
  },
} as const;

function toNumber(value: string): number {
  const parsed = Number.parseFloat(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

let lineSeed = 0;
function makeLine(date: string): BatchLine {
  lineSeed += 1;
  return { id: `line-${lineSeed}`, date, reference: "", mode: "", account: "", party: "", document: "", details: "", amount: "" };
}

export function BankingBatchEntry({
  kind,
  onAction,
  onBack,
  onOpenTransaction,
}: {
  kind: BatchEntryKind;
  onAction: (action: string, subject?: string) => void;
  onBack?: () => void;
  onOpenTransaction?: (reference: string) => void;
}) {
  const settings = config[kind];
  const [bankAccountId, setBankAccountId] = useState(bankAccounts[0].id);
  const [lines, setLines] = useState<BatchLine[]>(() => [makeLine("2026-09-07")]);
  const [submitted, setSubmitted] = useState(false);
  const [savedState, setSavedState] = useState<"draft" | "approved" | null>(null);
  const [postingDate, setPostingDate] = useState("2026-09-07");
  const [approvalRoute, setApprovalRoute] = useState("Finance review → Final approval");
  const [attachmentName, setAttachmentName] = useState("");
  const batchReference = kind === "payment" ? "BPV-000033" : "BRV-000049";
  const parties = customers;

  const bank = findBankAccount(bankAccountId);
  const total = lines.reduce((sum, line) => sum + toNumber(line.amount), 0);

  const updateLine = (id: string, patch: Partial<BatchLine>) => {
    setLines((current) => current.map((line) => (line.id === id ? { ...line, ...patch } : line)));
    setSavedState(null);
  };

  const addLine = () => {
    setLines((current) => [...current, makeLine(current[current.length - 1]?.date ?? "2026-09-07")]);
    setSavedState(null);
  };

  const removeLine = (id: string) => {
    setLines((current) => (current.length === 1 ? current : current.filter((line) => line.id !== id)));
    setSavedState(null);
  };

  // A line is only counted once it carries an account and a positive amount.
  const lineErrors = lines.map((line) => {
    const issues: string[] = [];
    const amount = toNumber(line.amount);
    const touched = Boolean(line.account || line.party || line.document || line.details.trim() || line.reference.trim() || amount > 0);
    if (!touched) return { issues, touched };
    if (!line.date) issues.push("Date is required.");
    if (!line.account) issues.push("Nominal account is required.");
    if (kind === "receipt" && !line.party) issues.push("Received from is required.");
    if (amount <= 0) issues.push("Amount must be greater than zero.");
    if (line.account && bank && line.account === bank.glCode) issues.push("A line cannot post to the bank account itself.");
    return { issues, touched };
  });

  const touchedCount = lineErrors.filter((line) => line.touched).length;
  const issueCount = lineErrors.reduce((sum, line) => sum + line.issues.length, 0);
  const batchIssues: string[] = [];
  if (!bankAccountId) batchIssues.push("Select the bank account for this batch.");
  if (touchedCount === 0) batchIssues.push("Enter at least one complete line.");
  const blocked = issueCount > 0 || batchIssues.length > 0;

  const approve = () => {
    setSubmitted(true);
    if (blocked) {
      onAction("Validation failed", `${issueCount + batchIssues.length} issue(s) to resolve`);
      return;
    }
    setSavedState("approved");
    onAction("Approved and closed", `${settings.title} · ${formatMoney(total, bank?.currency ?? "USD")}`);
  };

  return (
    <div className="nx-batch nx-workspace-form nx-workspace-form--batch">
      {savedState ? (
        <div className="nx-txn-banner nx-txn-banner--submitted" role="status">
          <strong>{savedState === "approved" ? "Approved and closed" : "Draft saved"}</strong>
          <span>
            {touchedCount} {touchedCount === 1 ? "line" : "lines"} totalling {formatMoney(total, bank?.currency ?? "USD")} against {bank?.name}.
            This prototype records no real transaction.
          </span>
          {onOpenTransaction ? (
            <button className="nx-button nx-button-secondary" type="button" onClick={() => onOpenTransaction(batchReference)}>Open transaction</button>
          ) : null}
        </div>
      ) : null}

      {submitted && blocked ? (
        <div className="nx-txn-banner nx-txn-banner--error" role="alert">
          <strong>{issueCount + batchIssues.length} issue{issueCount + batchIssues.length === 1 ? "" : "s"} to resolve</strong>
          <span>{batchIssues.join(" ") || "Complete the highlighted lines before approving this batch."}</span>
        </div>
      ) : null}

      <nav className="nx-batch__crumbs" aria-label="Breadcrumb">
        <button type="button" onClick={() => onAction("Home", "Workspace")}>Home</button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => onBack?.()}>{kind === "payment" ? "Bank Payments" : "Bank Receipts"}</button>
        <span aria-hidden="true">/</span>
        <em>{settings.title}</em>
      </nav>

      <header className="nx-batch__title">
        <div>
          <span>{kind === "payment" ? "Money out" : "Money in"} · Batch entry</span>
          <h1>{settings.title}</h1>
          <p>Enter multiple lines against one bank account, review the accounting effect, then route the batch for approval.</p>
        </div>
        <span className="nx-status nx-status-draft">Draft</span>
      </header>

      <section className="nx-batch__meta" aria-label="Batch controls">
        <label>
          <span>Batch reference</span>
          <input readOnly value={batchReference} />
          <small>Generated automatically</small>
        </label>
        <label>
          <span>Posting date</span>
          <input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} />
          <small>Open financial period</small>
        </label>
        <label>
          <span>Approval route</span>
          <select value={approvalRoute} onChange={(event) => setApprovalRoute(event.target.value)}>
            <option>Finance review → Final approval</option>
            <option>Single approver (under 25,000)</option>
            <option>Dual signature (over 250,000)</option>
          </select>
          <small>Determined by value and bank mandate</small>
        </label>
        <label>
          <span>Supporting document</span>
          <input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="e.g. payment-run.pdf" />
          <small>Prototype only · no upload occurs</small>
        </label>
      </section>

      <section className="nx-batch__bank">
        <div className="nx-batch__bank-heading">
          <span>{kind === "payment" ? "Funding account" : "Deposit account"}</span>
          <label htmlFor="batch-bank">{kind === "payment" ? "Pay through" : "Receive into"}</label>
        </div>
        <select
          id="batch-bank"
          value={bankAccountId}
          onChange={(event) => { setBankAccountId(event.target.value); setSavedState(null); }}
        >
          {bankAccounts.filter((account) => account.status !== "Closed").map((account) => (
            <option key={account.id} value={account.id}>
              {account.name} ({account.glCode.replace(/-/g, "").slice(-6)}) ({account.currency})
            </option>
          ))}
        </select>
        {bank ? <span className="nx-batch__bank-meta">{accountLabel(bank.glCode)} · available {formatMoney(bank.availableBalance, bank.currency)}</span> : null}
      </section>

      <header className="nx-batch__line-heading">
        <div>
          <span>Transaction lines</span>
          <h2>{kind === "payment" ? "Payment details" : "Receipt details"}</h2>
          <p>Enter each allocation as a separate line. Required fields are marked and the journal updates below.</p>
        </div>
        <div>
          <strong>{lines.length}</strong>
          <span>{lines.length === 1 ? "line" : "lines"}</span>
        </div>
      </header>

      <section className="nx-batch__grid-wrap">
        <table className={`nx-batch-grid nx-batch-grid--${kind}`}>
          <thead>
            <tr>
              <th className="nx-batch-grid__date">Date <em aria-hidden="true">*</em></th>
              <th className="nx-batch-grid__ref">Ref. No.</th>
              <th className="nx-batch-grid__mode">Mode</th>
              {kind === "receipt" ? <th className="nx-batch-grid__party">Received from <em aria-hidden="true">*</em></th> : null}
              <th className="nx-batch-grid__account">Nominal Account <em aria-hidden="true">*</em></th>
              <th className="nx-batch-grid__document">Document</th>
              <th>Details</th>
              <th className="amount nx-batch-grid__amount">Amount <em aria-hidden="true">*</em></th>
              <th><span className="sr-only">Remove line</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, index) => {
              const state = lineErrors[index];
              const showLineErrors = submitted && state.issues.length > 0;
              return (
                <tr className={showLineErrors ? "is-invalid" : undefined} key={line.id}>
                  <td>
                    <input aria-label={`Line ${index + 1} date`} type="date" value={line.date} onChange={(event) => updateLine(line.id, { date: event.target.value })} />
                  </td>
                  <td>
                    <input aria-label={`Line ${index + 1} reference`} value={line.reference} onChange={(event) => updateLine(line.id, { reference: event.target.value })} placeholder="e.g. 137" />
                  </td>
                  <td>
                    <select aria-label={`Line ${index + 1} mode`} value={line.mode} onChange={(event) => updateLine(line.id, { mode: event.target.value })}>
                      <option value="">—</option>
                      {settings.modes.map((mode) => <option key={mode}>{mode}</option>)}
                    </select>
                  </td>
                  {kind === "receipt" ? (
                    <td>
                      <select aria-label={`Line ${index + 1} received from`} value={line.party} onChange={(event) => updateLine(line.id, { party: event.target.value })}>
                        <option value="">Select…</option>
                        {parties.map((party) => <option key={party.id} value={party.name}>{party.name}</option>)}
                      </select>
                    </td>
                  ) : null}
                  <td className="nx-batch-grid__account-cell">
                    <AccountSelect
                      id={`line-account-${line.id}`}
                      label={`Line ${index + 1} nominal account`}
                      value={line.account}
                      onChange={(code) => updateLine(line.id, { account: code })}
                      suggested={settings.suggested}
                      filter={(account) => !account.isBankControl}
                    />
                  </td>
                  <td>
                    <input aria-label={`Line ${index + 1} document`} value={line.document} onChange={(event) => updateLine(line.id, { document: event.target.value })} placeholder={kind === "payment" ? "Bill / PO" : "Invoice"} />
                  </td>
                  <td>
                    <input aria-label={`Line ${index + 1} details`} value={line.details} onChange={(event) => updateLine(line.id, { details: event.target.value })} placeholder="Narration for the statement and journal" />
                  </td>
                  <td className="amount">
                    <input aria-label={`Line ${index + 1} amount`} className="amount" inputMode="decimal" value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0.00" />
                  </td>
                  <td>
                    <button
                      aria-label={`Remove line ${index + 1}`}
                      className="nx-batch-grid__remove"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(line.id)}
                      type="button"
                    >
                      🗑
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={kind === "receipt" ? 7 : 6} scope="row">Total</th>
              <td className="amount">{formatMoney(total, bank?.currency ?? "USD")}</td>
              <td />
            </tr>
          </tfoot>
        </table>

        {submitted && issueCount > 0 ? (
          <ul className="nx-batch__issues" aria-label="Line validation issues">
            {lineErrors.map((state, index) =>
              state.issues.length > 0 ? <li key={lines[index].id}>Line {index + 1}: {state.issues.join(" ")}</li> : null,
            )}
          </ul>
        ) : null}

      </section>

      <div className="nx-batch__grid-actions">
        <button className="nx-batch__add" type="button" onClick={addLine}>+ Add More</button>
        <span className="nx-batch__count">{touchedCount} of {lines.length} {lines.length === 1 ? "line" : "lines"} complete</span>
      </div>

      <section className="nx-batch__effect">
        <header>
          <span>Accounting effect</span>
          <h2>Journal this batch will post</h2>
          <p>{settings.bankSideLabel} · {settings.summaryNote}</p>
        </header>
        <table className="nx-txn-journal">
          <thead><tr><th>Account</th><th className="amount">Debit</th><th className="amount">Credit</th></tr></thead>
          <tbody>
            {lines.map((line, index) => {
              const amount = toNumber(line.amount);
              if (!line.account || amount <= 0) return null;
              const account = findAccount(line.account);
              return (
                <tr key={line.id}>
                  <td>
                    <strong>{line.account}</strong>
                    <small>{account?.name} · {kind === "receipt" && line.party ? line.party : `line ${index + 1}`}{line.document ? ` · ${line.document}` : ""}</small>
                  </td>
                  <td className="amount">{kind === "payment" ? formatMoney(amount, bank?.currency ?? "USD") : "—"}</td>
                  <td className="amount">{kind === "receipt" ? formatMoney(amount, bank?.currency ?? "USD") : "—"}</td>
                </tr>
              );
            })}
            {total > 0 && bank ? (
              <tr>
                <td><strong>{bank.glCode}</strong><small>{findAccount(bank.glCode)?.name} · batch total</small></td>
                <td className="amount">{kind === "receipt" ? formatMoney(total, bank.currency) : "—"}</td>
                <td className="amount">{kind === "payment" ? formatMoney(total, bank.currency) : "—"}</td>
              </tr>
            ) : null}
            {total <= 0 ? <tr><td className="nx-txn-journal__empty" colSpan={3}>Enter a line amount to preview the journal.</td></tr> : null}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Totals</th>
              <td className="amount">{formatMoney(total, bank?.currency ?? "USD")}</td>
              <td className="amount">{formatMoney(total, bank?.currency ?? "USD")}</td>
            </tr>
          </tfoot>
        </table>
        <p className={`nx-txn-balance nx-txn-balance--${total > 0 ? "ok" : "off"}`} role="status">
          {total > 0 ? "Balanced — debits equal credits." : "Enter a line amount to complete the entry."}
        </p>
      </section>

      <footer className="nx-batch__actions">
        <button className="nx-batch__btn nx-batch__btn--cancel" type="button" onClick={() => { setLines([makeLine("2026-09-07")]); setSubmitted(false); setSavedState(null); onAction("Cancelled", settings.title); }}>Cancel</button>
        <div>
          <button className="nx-batch__btn nx-batch__btn--draft" type="button" onClick={() => { setSavedState("draft"); onAction("Saved as draft", settings.title); }}>Save Draft</button>
          <button className="nx-batch__btn nx-batch__btn--approve" type="button" onClick={approve}>Approve and Close</button>
        </div>
      </footer>
    </div>
  );
}
