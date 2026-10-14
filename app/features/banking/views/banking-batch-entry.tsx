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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { customers } from "@prototype/shared/fixtures/mock-data";
import { AccountSelect } from "../components/banking-account-select";
import {
  accountLabel,
  bankAccounts,
  findAccount,
  findBankAccount,
  formatMoney,
} from "../model/banking-master-data";

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
    <div className="grid min-w-0 gap-3.5">
      {savedState ? (
        <div className="grid gap-1 rounded-md border border-[var(--nx-success)] bg-[var(--nx-success-soft)] p-3" role="status">
          <strong>{savedState === "approved" ? "Approved and closed" : "Draft saved"}</strong>
          <span>
            {touchedCount} {touchedCount === 1 ? "line" : "lines"} totalling {formatMoney(total, bank?.currency ?? "USD")} against {bank?.name}.
            This prototype records no real transaction.
          </span>
          {onOpenTransaction ? (
            <Button variant="outline" type="button" onClick={() => onOpenTransaction(batchReference)}>Open transaction</Button>
          ) : null}
        </div>
      ) : null}

      {submitted && blocked ? (
        <div className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive" role="alert">
          <strong>{issueCount + batchIssues.length} issue{issueCount + batchIssues.length === 1 ? "" : "s"} to resolve</strong>
          <span>{batchIssues.join(" ") || "Complete the highlighted lines before approving this batch."}</span>
        </div>
      ) : null}

      <nav className="flex items-center gap-2 text-xs text-muted-foreground [&>button]:bg-transparent [&>button]:p-0 [&>button]:text-primary [&>button:hover]:underline [&>em]:not-italic [&>em]:text-foreground" aria-label="Breadcrumb">
        <button type="button" onClick={() => onAction("Home", "Workspace")}>Home</button>
        <span aria-hidden="true">/</span>
        <button type="button" onClick={() => onBack?.()}>{kind === "payment" ? "Bank Payments" : "Bank Receipts"}</button>
        <span aria-hidden="true">/</span>
        <em>{settings.title}</em>
      </nav>

      <header className="flex items-start justify-between gap-4 rounded-md border border-primary/30 bg-primary/10 px-4 py-3.5 shadow-[inset_4px_0_0_var(--color-primary)] shadow-xs max-sm:flex-col [&>div>span]:text-xs [&>div>span]:font-bold [&>div>span]:uppercase [&>div>span]:tracking-wider [&>div>span]:text-primary [&_h1]:mb-0 [&_h1]:mt-1 [&_h1]:text-xl [&_h1]:font-semibold [&_p]:mb-0 [&_p]:mt-1 [&_p]:max-w-prose [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-muted-foreground">
        <div>
          <span>{kind === "payment" ? "Money out" : "Money in"} · Batch entry</span>
          <h1>{settings.title}</h1>
          <p>Enter multiple lines against one bank account, review the accounting effect, then route the batch for approval.</p>
        </div>
        <span className="nx-status nx-status-draft">Draft</span>
      </header>

      <section className="grid grid-cols-4 gap-3 rounded-md border border-border bg-muted p-3.5 shadow-xs max-lg:grid-cols-2 max-sm:grid-cols-1 [&>label]:grid [&>label]:min-w-0 [&>label]:gap-1.5 [&_label>span]:text-xs [&_label>span]:font-bold [&_label>small]:text-xs [&_label>small]:leading-snug [&_label>small]:text-muted-foreground [&_select]:min-h-10 [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-3 [&_select]:text-sm" aria-label="Batch controls">
        <label>
          <span>Batch reference</span>
          <Input readOnly value={batchReference} />
          <small>Generated automatically</small>
        </label>
        <label>
          <span>Posting date</span>
          <Input type="date" value={postingDate} onChange={(event) => setPostingDate(event.target.value)} />
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
          <Input value={attachmentName} onChange={(event) => setAttachmentName(event.target.value)} placeholder="e.g. payment-run.pdf" />
          <small>Prototype only · no upload occurs</small>
        </label>
      </section>

      <section className="grid grid-cols-[minmax(7.5rem,.4fr)_minmax(15rem,1fr)_minmax(0,.7fr)] items-end gap-3 rounded-md border border-border bg-card p-4 shadow-xs max-lg:grid-cols-[minmax(7.5rem,.4fr)_minmax(15rem,1fr)] max-sm:grid-cols-1 [&>select]:min-h-10 [&>select]:rounded-md [&>select]:border [&>select]:border-border [&>select]:bg-card [&>select]:px-3 [&>select]:text-sm">
        <div className="grid gap-1.5 [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wider [&>span]:text-primary [&>label]:text-xs [&>label]:font-semibold">
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
        {bank ? <span className="text-xs leading-snug text-muted-foreground max-lg:col-span-full max-sm:col-span-auto">{accountLabel(bank.glCode)} · available {formatMoney(bank.availableBalance, bank.currency)}</span> : null}
      </section>

      <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 rounded-md border border-border bg-card px-4 py-3 shadow-xs max-sm:grid-cols-1 [&>div:first-child>span]:text-xs [&>div:first-child>span]:font-bold [&>div:first-child>span]:uppercase [&>div:first-child>span]:tracking-wider [&>div:first-child>span]:text-primary [&_h2]:mb-0 [&_h2]:mt-1 [&_h2]:text-base [&_h2]:font-bold [&_p]:mb-0 [&_p]:mt-1 [&_p]:text-xs [&_p]:text-muted-foreground">
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

      <section className="min-w-0 overflow-x-auto rounded-b-md border border-border bg-card shadow-xs">
        <table className={`w-full min-w-330 border-collapse ${kind === "payment" ? "min-w-280" : ""} [&_thead_th]:border-b [&_thead_th]:border-r [&_thead_th]:border-border [&_thead_th]:bg-primary [&_thead_th]:px-2.5 [&_thead_th]:py-2.5 [&_thead_th]:text-left [&_thead_th]:text-xs [&_thead_th]:font-bold [&_thead_th]:text-primary-foreground [&_thead_th:first-child]:shadow-[inset_3px_0_0_var(--color-primary-foreground)] [&_tbody_td]:border-b [&_tbody_td]:border-r [&_tbody_td]:border-border [&_tbody_td]:px-1 [&_tbody_td]:py-0.75 [&_tbody_td]:align-middle [&_tbody_td:last-child]:border-r-0 [&_tbody_tr.is-invalid]:bg-destructive/5 [&_tfoot_th]:border-t [&_tfoot_th]:border-border [&_tfoot_th]:px-2.5 [&_tfoot_th]:py-2.5 [&_tfoot_th]:text-left [&_tfoot_th]:text-sm [&_tfoot_th]:font-bold [&_tfoot_td]:border-t [&_tfoot_td]:border-border [&_tfoot_td]:px-2.5 [&_tfoot_td]:py-2.5 [&_tfoot_td]:text-sm [&_tfoot_td]:font-bold [&_input]:min-h-8.5 [&_input]:border-transparent [&_input]:bg-transparent [&_select]:min-h-8.5 [&_select]:border-transparent [&_select]:bg-transparent [&_input:hover]:border-border [&_input:hover]:bg-card [&_select:hover]:border-border [&_select:hover]:bg-card`}>
          <thead>
            <tr>
              <th className="w-33">Date <em aria-hidden="true">*</em></th>
              <th className="w-29.5">Ref. No.</th>
              <th className="w-33">Mode</th>
              {kind === "receipt" ? <th className="w-47.5">Received from <em aria-hidden="true">*</em></th> : null}
              <th className="w-62.5">Nominal Account <em aria-hidden="true">*</em></th>
              <th className="w-35">Document</th>
              <th>Details</th>
              <th className="amount w-33">Amount <em aria-hidden="true">*</em></th>
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
                    <Input aria-label={`Line ${index + 1} date`} type="date" value={line.date} onChange={(event) => updateLine(line.id, { date: event.target.value })} />
                  </td>
                  <td>
                    <Input aria-label={`Line ${index + 1} reference`} value={line.reference} onChange={(event) => updateLine(line.id, { reference: event.target.value })} placeholder="e.g. 137" />
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
                  <td className="[&_label]:sr-only">
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
                    <Input aria-label={`Line ${index + 1} document`} value={line.document} onChange={(event) => updateLine(line.id, { document: event.target.value })} placeholder={kind === "payment" ? "Bill / PO" : "Invoice"} />
                  </td>
                  <td>
                    <Input aria-label={`Line ${index + 1} details`} value={line.details} onChange={(event) => updateLine(line.id, { details: event.target.value })} placeholder="Narration for the statement and journal" />
                  </td>
                  <td className="amount">
                    <Input aria-label={`Line ${index + 1} amount`} className="amount" inputMode="decimal" value={line.amount} onChange={(event) => updateLine(line.id, { amount: event.target.value })} placeholder="0.00" />
                  </td>
                  <td>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Remove line ${index + 1}`}
                      className="size-8 text-muted-foreground hover:border-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={lines.length === 1}
                      onClick={() => removeLine(line.id)}
                      type="button"
                    >
                      🗑
                    </Button>
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
          <ul className="m-0 px-4 pb-3.5 pl-8 text-xs leading-relaxed text-destructive" aria-label="Line validation issues">
            {lineErrors.map((state, index) =>
              state.issues.length > 0 ? <li key={lines[index].id}>Line {index + 1}: {state.issues.join(" ")}</li> : null,
            )}
          </ul>
        ) : null}

      </section>

      <div className="flex flex-wrap items-center justify-between gap-3 py-1 [&>span]:text-xs [&>span]:text-muted-foreground">
        <Button variant="outline" type="button" onClick={addLine}>+ Add More</Button>
        <span>{touchedCount} of {lines.length} {lines.length === 1 ? "line" : "lines"} complete</span>
      </div>

      <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-xs">
        <header className="border-b border-primary/30 bg-primary/10 px-4 py-3 shadow-[inset_4px_0_0_var(--color-primary)] [&>span]:block [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wider [&>span]:text-primary [&_h2]:mb-0 [&_h2]:mt-1 [&_h2]:text-sm [&_h2]:font-bold [&_p]:mb-0 [&_p]:mt-1 [&_p]:text-xs [&_p]:text-muted-foreground">
          <span>Accounting effect</span>
          <h2>Journal this batch will post</h2>
          <p>{settings.bankSideLabel} · {settings.summaryNote}</p>
        </header>
        <table className="w-full border-collapse text-xs [&_th]:border-b [&_th]:border-border [&_th]:bg-primary [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:text-primary-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-2.5 [&_td]:py-2 [&_.amount]:text-right [&_tfoot_th]:bg-muted [&_tfoot_td]:bg-muted">
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
            {total <= 0 ? <tr><td className="px-2.5 py-4 text-center text-muted-foreground" colSpan={3}>Enter a line amount to preview the journal.</td></tr> : null}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Totals</th>
              <td className="amount">{formatMoney(total, bank?.currency ?? "USD")}</td>
              <td className="amount">{formatMoney(total, bank?.currency ?? "USD")}</td>
            </tr>
          </tfoot>
        </table>
        <p className={`m-0 px-4 py-2 text-xs font-semibold ${total > 0 ? "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]" : "bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]"}`} role="status">
          {total > 0 ? "Balanced — debits equal credits." : "Enter a line amount to complete the entry."}
        </p>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border pb-1 pt-3.5 [&>div]:flex [&>div]:flex-wrap [&>div]:gap-2">
        <Button variant="ghost" type="button" onClick={() => { setLines([makeLine("2026-09-07")]); setSubmitted(false); setSavedState(null); onAction("Cancelled", settings.title); }}>Cancel</Button>
        <div>
          <Button variant="outline" type="button" onClick={() => { setSavedState("draft"); onAction("Saved as draft", settings.title); }}>Save Draft</Button>
          <Button type="button" onClick={approve}>Approve and Close</Button>
        </div>
      </footer>
    </div>
  );
}
