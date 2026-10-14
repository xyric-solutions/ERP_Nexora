"use client";

/**
 * Reconciliation worksheet — what `+ Add New` opens on Bank > Reconciliation.
 *
 * This is the manual-tick method: the closing balance printed on the bank
 * statement is keyed, the movements that have presented are ticked, and the
 * reconstruction
 *
 *     opening + receipts - payments + adjustments
 *
 * is compared to it. A nil difference means the account reconciles; anything
 * else is an unticked movement or a bank-only item the books have not
 * recorded yet, which is what the adjustments row is for.
 *
 * Choosing statement import instead hands over to the import screen, because
 * there the file supplies both the lines and the closing balance.
 *
 * Deterministic presentation data only: no API, database, Demo Account,
 * authorization, posting, or business-transaction dependency. Nothing here
 * posts a journal; the adjustment rows state what the product would post.
 */

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  accountLabel,
  bankAccounts,
  findBankAccount,
  formatMoney,
} from "../model/banking-master-data";
import {
  adjustmentKinds,
  canSubmitWorksheet,
  displayDate,
  impliedStatementBalance,
  isNilDifference,
  liveReconciliationFor,
  nextReconciliationId,
  periodLabelFor,
  reconciliationRegister,
  round2,
  worksheetLinesFor,
  worksheetOpeningBalance,
  worksheetTotals,
  type AdjustmentKind,
  type ReconciliationMethod,
  type ReconciliationRecord,
  type WorksheetAdjustment,
} from "../model/banking-reconciliation-data";

const PROTOTYPE_TODAY = "2026-09-18";

export function BankingReconciliationWorksheet({
  initialAccountId,
  records,
  onAction,
  onCreate,
  onCancel,
  onImportStatement,
}: {
  /** Route-supplied account, so a reconciliation can be started from a link. */
  initialAccountId?: string;
  records: readonly ReconciliationRecord[];
  onAction: (action: string, subject?: string) => void;
  onCreate: (record: ReconciliationRecord, submitted: boolean) => void;
  onCancel: () => void;
  onImportStatement: () => void;
}) {
  const preselected = initialAccountId && findBankAccount(initialAccountId) ? initialAccountId : "";
  const [accountId, setAccountId] = useState(preselected);
  const [statementDate, setStatementDate] = useState(PROTOTYPE_TODAY);
  const [statementBalance, setStatementBalance] = useState(
    preselected ? impliedStatementBalance(preselected, PROTOTYPE_TODAY).toFixed(2) : "",
  );
  const [method, setMethod] = useState<ReconciliationMethod>("Manual tick");
  const [loaded, setLoaded] = useState(Boolean(preselected));
  const [ticked, setTicked] = useState<ReadonlySet<string>>(new Set());
  const [adjustments, setAdjustments] = useState<readonly WorksheetAdjustment[]>([]);
  const [adjustmentKind, setAdjustmentKind] = useState<AdjustmentKind>("Bank charge");
  const [adjustmentAmount, setAdjustmentAmount] = useState("");
  const [adjustmentNarrative, setAdjustmentNarrative] = useState("");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const account = findBankAccount(accountId);
  const currency = account?.currency;
  const openingBalance = account ? worksheetOpeningBalance(account.id) : 0;
  // Small deterministic fixtures: the React compiler memoizes these on its own,
  // and a manual useMemo here only fights it over the account object.
  const lines = loaded && account ? worksheetLinesFor(account.id, statementDate) : [];
  const laterLines = loaded && account
    ? worksheetLinesFor(account.id, "9999-12-31").length - lines.length
    : 0;
  const keyedBalance = Number(statementBalance.replace(/[^0-9.-]/g, ""));
  const totals = worksheetTotals(
    lines,
    ticked,
    openingBalance,
    Number.isFinite(keyedBalance) ? keyedBalance : 0,
    adjustments,
  );
  const nilDifference = isNilDifference(totals.difference);
  const blocking = account ? liveReconciliationFor(account.id, records) : undefined;

  const needle = query.trim().toLowerCase();
  const visibleLines = needle
    ? lines.filter((line) =>
        [line.voucher, line.type, line.reference, line.details, accountLabel(line.nominal)]
          .some((value) => value.toLowerCase().includes(needle)))
    : lines;
  const allVisibleTicked = visibleLines.length > 0 && visibleLines.every((line) => ticked.has(line.id));

  const toggle = (id: string) => {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setTicked((current) => {
      const next = new Set(current);
      for (const line of visibleLines) {
        if (allVisibleTicked) next.delete(line.id); else next.add(line.id);
      }
      return next;
    });
  };

  const loadTransactions = () => {
    if (!account) {
      setError("Choose the bank account being reconciled.");
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(statementDate)) {
      setError("Enter the statement date the closing balance is taken from.");
      return;
    }
    if (blocking) {
      setError(`${account.name} already has a live reconciliation (${blocking.id}). Approve or reopen that one before starting another.`);
      return;
    }
    setError("");
    setTicked(new Set());
    setAdjustments([]);
    setLoaded(true);
    if (!statementBalance.trim()) {
      setStatementBalance(impliedStatementBalance(account.id, statementDate).toFixed(2));
    }
    onAction("Load transactions", `${account.name} · ${displayDate(statementDate)}`);
  };

  const addAdjustment = () => {
    const parsed = Number(adjustmentAmount.replace(/[^0-9.]/g, ""));
    if (!adjustmentAmount.trim() || !Number.isFinite(parsed) || parsed <= 0) {
      setError("An adjustment needs an amount greater than nil.");
      return;
    }
    const direction = adjustmentKinds.find((item) => item.kind === adjustmentKind)?.direction ?? -1;
    setError("");
    setAdjustments((current) => [
      ...current,
      {
        id: `adj-${current.length + 1}`,
        kind: adjustmentKind,
        amount: round2(parsed * direction),
        narrative: adjustmentNarrative.trim() || adjustmentKind,
      },
    ]);
    setAdjustmentAmount("");
    setAdjustmentNarrative("");
  };

  const save = (submit: boolean) => {
    if (!account) {
      setError("Choose the bank account being reconciled.");
      return;
    }
    if (!loaded) {
      setError("Load the transactions before saving the reconciliation.");
      return;
    }
    if (!statementBalance.trim() || !Number.isFinite(keyedBalance)) {
      setError("Enter the closing balance printed on the bank statement.");
      return;
    }
    if (submit && !canSubmitWorksheet(totals.difference)) {
      setError("A reconciliation can only be submitted once the difference is nil. Tick the remaining movements or record an adjustment.");
      return;
    }
    setError("");
    onCreate(
      {
        id: nextReconciliationId(records.length - reconciliationRegister.length),
        accountId: account.id,
        date: displayDate(statementDate),
        periodLabel: periodLabelFor(statementDate),
        statementCode: `MAN-${statementDate.slice(0, 7)}-${account.id.replace("BA-", "")}`,
        statementBalance: round2(keyedBalance),
        ledgerBalance: round2(keyedBalance - totals.difference),
        // Submitting means the difference is nil, so nothing is still open:
        // the movements left unticked are outstanding, which is an explained
        // state, not unfinished work. A saved draft keeps them as open work.
        openItems: submit ? 0 : totals.untickedCount,
        totalItems: lines.length,
        method: "Manual tick",
        status: submit ? "Submitted" : "Draft",
        preparedBy: "Mariam Ali",
      },
      submit,
    );
  };

  return (
    <section className="grid min-w-0 gap-3.5 rounded-md border border-border bg-card p-4 shadow-xs">
      <header className="flex flex-wrap items-start justify-between gap-4 [&_h2]:mb-0 [&_h2]:mt-1 [&_h2]:text-xl [&_h2]:font-bold [&_p]:mb-0 [&_p]:mt-1 [&_p]:max-w-prose [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-muted-foreground">
        <div>
          <span className="nx-eyebrow">Banking &amp; Treasury · New reconciliation</span>
          <h2>Reconciliation balance</h2>
          <p>Key the closing balance printed on the bank statement, then tick the movements that have presented. The account reconciles when the difference is nil.</p>
        </div>
        <div className="flex overflow-hidden rounded-md border border-border [&>button]:rounded-none [&>button]:border-0 [&>button]:border-r [&>button]:border-border [&>button]:bg-card [&>button:last-child]:border-r-0" role="group" aria-label="Reconciliation method">
          {(["Manual tick", "Statement import"] as const).map((option) => (
            <Button
              variant="outline"
              aria-pressed={method === option}
              className={method === option ? "active" : undefined}
              key={option}
              type="button"
              onClick={() => { setMethod(option); setError(""); }}
            >
              {option}
            </Button>
          ))}
        </div>
      </header>

      {method === "Statement import" ? (
        <div className="nx-worksheet__import">
          <p>
            Statement import is the stronger evidence: the bank file supplies both the movements and the closing balance,
            so a bank transaction that was never entered in Nexora is found rather than assumed. Ticking against a keyed
            balance cannot do that — it only proves which entries you already hold have presented.
          </p>
          <div className="nx-worksheet__actions">
            <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
            <Button type="button" onClick={onImportStatement}>Continue to statement import</Button>
          </div>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-muted p-3.5 [&>label]:grid [&>label]:min-w-47.5 [&>label]:flex-1 [&>label]:gap-1.5 [&>label:first-child]:basis-75 [&_label>span]:text-xs [&_label>span]:font-semibold [&_select]:min-h-10 [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-3 [&_select]:text-sm">
            <label>
              <span>Bank account <b aria-hidden="true">*</b></span>
              <select
                value={accountId}
                onChange={(event) => { setAccountId(event.target.value); setLoaded(false); setStatementBalance(""); setError(""); }}
              >
                <option value="">Select…</option>
                {bankAccounts.filter((option) => option.status !== "Closed").map((option) => (
                  <option key={option.id} value={option.id}>{option.name} · {option.number} ({option.currency})</option>
                ))}
              </select>
            </label>
            <label>
              <span>Statement date <b aria-hidden="true">*</b></span>
              <Input type="date" value={statementDate} onChange={(event) => { setStatementDate(event.target.value); setLoaded(false); setError(""); }} />
            </label>
            <label>
              <span>Statement balance <b aria-hidden="true">*</b></span>
              <Input
                className="text-right tabular-nums"
                inputMode="decimal"
                placeholder="0.00"
                value={statementBalance}
                onChange={(event) => { setStatementBalance(event.target.value); setError(""); }}
              />
            </label>
            <Button type="button" onClick={loadTransactions}>Load transactions</Button>
          </div>

          <div className="flex flex-wrap items-stretch gap-2 [&>div]:min-w-32.5 [&>div]:flex-1 [&>div]:basis-37.5 [&>div]:rounded-md [&>div]:border [&>div]:border-border [&>div]:bg-card [&>div]:px-3 [&>div]:py-2.5 [&>div.nx-worksheet__difference]:border-[var(--nx-warning)] [&>div.nx-worksheet__difference]:bg-[var(--nx-warning-soft)] [&>div.nx-worksheet__difference.is-nil]:border-[var(--nx-success)] [&>div.nx-worksheet__difference.is-nil]:bg-[var(--nx-success-soft)] [&>i]:grid [&>i]:w-5.5 [&>i]:place-items-center [&>i]:text-base [&>i]:font-bold [&>i]:not-italic [&_span]:block [&_span]:text-xs [&_span]:text-muted-foreground [&_strong]:mt-1 [&_strong]:block [&_strong]:text-base [&_strong]:font-bold [&_strong]:tabular-nums [&_small]:mt-0.5 [&_small]:block [&_small]:text-xs [&_small]:text-muted-foreground max-md:[&>div]:basis-full max-md:[&>i]:h-4 max-md:[&>i]:w-full" aria-label="Reconciliation arithmetic">
            <div>
              <span>Opening balance</span>
              <strong>{formatMoney(openingBalance, currency)}</strong>
              <small>Last reconciled bank balance</small>
            </div>
            <i aria-hidden="true">+</i>
            <div>
              <span>Receipts</span>
              <strong>{formatMoney(totals.receipts, currency)}</strong>
              <small>Ticked as presented</small>
            </div>
            <i aria-hidden="true">−</i>
            <div>
              <span>Payments</span>
              <strong>{formatMoney(totals.payments, currency)}</strong>
              <small>Ticked as presented</small>
            </div>
            {adjustments.length > 0 ? (
              <>
                <i aria-hidden="true">±</i>
                <div>
                  <span>Adjustments</span>
                  <strong>{formatMoney(totals.adjustments, currency)}</strong>
                  <small>{adjustments.length} recorded</small>
                </div>
              </>
            ) : null}
            <i aria-hidden="true">=</i>
            <div>
              <span>Balance</span>
              <strong>{formatMoney(totals.balance, currency)}</strong>
              <small>Reconstructed from ticks</small>
            </div>
            <div className={loaded && nilDifference ? "nx-worksheet__difference is-nil" : "nx-worksheet__difference"}>
              <span>Difference</span>
              <strong>{formatMoney(totals.difference, currency)}</strong>
              <small>
                {!loaded
                  ? "Nothing loaded yet"
                  : nilDifference
                    ? "Reconciles"
                    : `${totals.untickedCount} movement${totals.untickedCount === 1 ? "" : "s"} unticked`}
              </small>
            </div>
          </div>

          {loaded ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
                <span>
                  {totals.tickedCount} of {lines.length} ticked
                  {laterLines > 0 ? ` · ${laterLines} movement${laterLines === 1 ? "" : "s"} after ${displayDate(statementDate)} excluded` : ""}
                </span>
                <label className="flex items-center gap-2">
                  <span>Search</span>
                  <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Voucher, payee, reference or detail" />
                </label>
              </div>

              <div className="nx-table-wrap">
                <table className="nx-data-table [&_tbody_tr.is-ticked_td]:bg-primary/10 [&_tbody_tr.is-adjustment_td]:bg-[var(--nx-warning-soft)] [&_tbody_tr.is-adjustment_td]:italic">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>V. ID</th>
                      <th>Type</th>
                      <th>Account / payee</th>
                      <th>Ref. no.</th>
                      <th>Details</th>
                      <th className="amount">Payments</th>
                      <th className="amount">Receipts</th>
                      <th className="w-15.5 text-center">
                        <label>
                          <Checkbox aria-label="Tick every listed movement" checked={allVisibleTicked} onCheckedChange={toggleAllVisible} />
                          <span>Rec</span>
                        </label>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleLines.length === 0 ? (
                      <tr><td colSpan={9} className="px-3 py-5 text-center text-muted-foreground">No movements to reconcile up to {displayDate(statementDate)}.</td></tr>
                    ) : visibleLines.map((line) => (
                      <tr className={ticked.has(line.id) ? "is-ticked" : undefined} key={line.id}>
                        <td>{displayDate(line.date)}</td>
                        <td>{line.voucher}</td>
                        <td>{line.type}</td>
                        <td>{accountLabel(line.nominal)}</td>
                        <td>{line.reference}</td>
                        <td>{line.details}</td>
                        <td className="amount">{line.credit ? formatMoney(line.credit, currency) : "—"}</td>
                        <td className="amount">{line.debit ? formatMoney(line.debit, currency) : "—"}</td>
                        <td className="w-15.5 text-center">
                          <Checkbox
                            aria-label={`Tick ${line.voucher} as presented`}
                            checked={ticked.has(line.id)}
                            onCheckedChange={() => toggle(line.id)}
                          />
                        </td>
                      </tr>
                    ))}
                    {adjustments.map((item) => (
                      <tr className="is-adjustment" key={item.id}>
                        <td>{displayDate(statementDate)}</td>
                        <td>Adjustment</td>
                        <td>{item.kind}</td>
                        <td>{item.kind === "Interest earned" ? "Interest income" : "Bank charges"}</td>
                        <td>—</td>
                        <td>{item.narrative}</td>
                        <td className="amount">{item.amount < 0 ? formatMoney(Math.abs(item.amount), currency) : "—"}</td>
                        <td className="amount">{item.amount > 0 ? formatMoney(item.amount, currency) : "—"}</td>
                        <td className="w-15.5 text-center">
                          <button aria-label={`Remove ${item.kind}`} className="text-destructive" type="button" onClick={() => setAdjustments((current) => current.filter((entry) => entry.id !== item.id))}>✕</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap items-end gap-3 rounded-md border border-dashed border-border bg-muted p-3.5 [&>div:first-child]:min-w-70 [&>div:first-child]:flex-1 [&_strong]:block [&_strong]:text-xs [&_small]:mt-1 [&_small]:block [&_small]:max-w-prose [&_small]:text-xs [&_small]:leading-relaxed [&_small]:text-muted-foreground [&_label]:grid [&_label]:min-w-37.5 [&_label]:gap-1.5 [&_label>span]:text-xs [&_label>span]:font-semibold [&_select]:min-h-9 [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-2.5">
                <div>
                  <strong>Bank-only item?</strong>
                  <small>A charge, interest or an unidentified credit sits on the statement before it reaches the books. Record it here and the difference clears. In the product this creates a controlled journal through the posting service — it never edits a posted one.</small>
                </div>
                <label>
                  <span>Type</span>
                  <select value={adjustmentKind} onChange={(event) => setAdjustmentKind(event.target.value as AdjustmentKind)}>
                    {adjustmentKinds.map((item) => <option key={item.kind} value={item.kind}>{item.kind}</option>)}
                  </select>
                </label>
                <label>
                  <span>Amount</span>
                  <Input className="text-right tabular-nums" inputMode="decimal" placeholder="0.00" value={adjustmentAmount} onChange={(event) => setAdjustmentAmount(event.target.value)} />
                </label>
                <label>
                  <span>Narrative</span>
                  <Input value={adjustmentNarrative} onChange={(event) => setAdjustmentNarrative(event.target.value)} placeholder={adjustmentKinds.find((item) => item.kind === adjustmentKind)?.helper} />
                </label>
                <Button variant="outline" type="button" onClick={addAdjustment}>Add adjustment</Button>
              </div>
            </>
          ) : (
            <p className="m-0 rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">Choose the account and statement date, then load the transactions to start ticking.</p>
          )}

          {error ? <p className="m-0 rounded-md border border-destructive bg-destructive/10 px-3 py-2 text-xs text-destructive" role="alert">{error}</p> : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-1">
            <Button variant="outline" type="button" onClick={onCancel}>Cancel</Button>
            <Button variant="outline" type="button" onClick={() => save(false)}>Save and close</Button>
            <Button
              disabled={!loaded || !nilDifference}
              title={nilDifference ? undefined : "The difference must be nil before a reconciliation can be submitted"}
              type="button"
              onClick={() => save(true)}
            >
              Save and submit
            </Button>
          </div>
        </>
      )}
    </section>
  );
}
