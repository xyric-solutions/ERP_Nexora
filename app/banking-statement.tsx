"use client";

/**
 * Account balances and per-bank statement for the isolated Nexora UI/UX
 * prototype. Selecting a bank opens its statement with a running balance and
 * a changeable date range.
 *
 * Presentation only: nothing is posted, stored or transmitted.
 */

import { useState } from "react";
import {
  AdvancedListFilters,
  ListFilterSelect,
  dateMatchesRange,
  prototypeDateToIso,
  type DateRangePreset,
} from "./module-views";
import {
  emptyStatement as fallbackStatement,
  statements,
  type StatementLine,
} from "./banking-statement-data";
import {
  accountLabel,
  bankAccounts,
  findBankAccount,
  formatMoney,
  type BankAccountFixture,
  type BankCurrency,
} from "./banking-master-data";

function withinRange(date: string, from: string, to: string) {
  return (!from || date >= from) && (!to || date <= to);
}

export function BankAccountBalances({
  onOpenAccount,
  onAction,
}: {
  onOpenAccount: (accountId: string) => void;
  onAction: (action: string, subject?: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [createdOn, setCreatedOn] = useState("");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [bank, setBank] = useState("");
  const [currency, setCurrency] = useState("");
  const [nominal, setNominal] = useState("");
  const [status, setStatus] = useState("");
  const needle = query.trim().toLowerCase();
  const creatorFor = (account: BankAccountFixture) => account.signatories[0] ?? "Finance setup";
  const creators = [...new Set(bankAccounts.map(creatorFor))].sort();
  const banks = [...new Set(bankAccounts.map((account) => account.bank))].sort();
  const currencies = [...new Set(bankAccounts.map((account) => account.currency))].sort();
  const nominals = [...new Set(bankAccounts.map((account) => accountLabel(account.glCode)))].sort();
  const statuses = [...new Set(bankAccounts.map((account) => account.status))].sort();
  const visible = bankAccounts.filter((account) => {
    const queryMatch = !needle
      || [account.name, account.bank, account.branch, account.currency, account.number, account.iban, account.glCode]
        .some((value) => value.toLowerCase().includes(needle));
    const creatorMatch = !createdBy || creatorFor(account) === createdBy;
    const createdOnMatch = !createdOn || prototypeDateToIso(account.openedOn) === createdOn;
    const bankMatch = !bank || account.bank === bank;
    const currencyMatch = !currency || account.currency === currency;
    const nominalMatch = !nominal || accountLabel(account.glCode) === nominal;
    const statusMatch = !status || account.status === status;
    return queryMatch && creatorMatch && createdOnMatch && bankMatch && currencyMatch && nominalMatch && statusMatch && dateMatchesRange(account.openedOn, dateRange, customFrom, customTo);
  });
  const activeFilterCount = Number(Boolean(createdBy)) + Number(Boolean(createdOn)) + Number(dateRange !== "all") + Number(Boolean(bank)) + Number(Boolean(currency)) + Number(Boolean(nominal)) + Number(Boolean(status));

  const totalsByCurrency = visible.reduce<Record<string, number>>((totals, account) => {
    totals[account.currency] = (totals[account.currency] ?? 0) + account.ledgerBalance;
    return totals;
  }, {});

  return (
    <>
      <section className="nx-balance-summary">
        {Object.entries(totalsByCurrency).map(([currency, amount]) => (
          <article key={currency}>
            <span>Total held · {currency}</span>
            <strong>{formatMoney(amount, currency as BankCurrency)}</strong>
            <small>{visible.filter((account) => account.currency === currency).length} account(s)</small>
          </article>
        ))}
      </section>

      <section className="nx-card nx-list-card">
        <div className="nx-filter-bar">
          <label className="nx-search-field">
            <span>⌕</span>
            <input aria-label="Search bank accounts" onChange={(event) => setQuery(event.target.value)} placeholder="Search bank, account or currency..." value={query} />
          </label>
          <ListFilterSelect listLabel="Account balances" label="Bank" value={bank} options={banks} onChange={setBank} />
          <ListFilterSelect listLabel="Account balances" label="Currency" value={currency} options={currencies} onChange={setCurrency} />
          <ListFilterSelect listLabel="Account balances" label="Nominal" value={nominal} options={nominals} onChange={setNominal} />
          <ListFilterSelect listLabel="Account balances" label="Status" value={status} options={statuses} onChange={setStatus} />
          <button aria-expanded={advancedOpen} className={activeFilterCount ? "is-active" : undefined} type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""} ▾
          </button>
          <button className="nx-icon-control" aria-label="Refresh balances" type="button" onClick={() => onAction("Refresh", "Account balances")}>↻</button>
        </div>
        <AdvancedListFilters
          open={advancedOpen}
          creators={creators}
          createdBy={createdBy}
          createdOn={createdOn}
          dateRange={dateRange}
          customFrom={customFrom}
          customTo={customTo}
          onCreatedByChange={setCreatedBy}
          onCreatedOnChange={setCreatedOn}
          onDateRangeChange={setDateRange}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          onClear={() => {
            setCreatedBy("");
            setCreatedOn("");
            setDateRange("all");
            setCustomFrom("");
            setCustomTo("");
            setBank("");
            setCurrency("");
            setNominal("");
            setStatus("");
          }}
        />
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead>
              <tr>
                <th>Bank</th><th>Account</th><th>Nominal</th><th>Cur.</th>
                <th className="amount">Ledger balance</th><th className="amount">Available</th>
                <th className="amount">Unreconciled</th><th>Last movement</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((account) => (
                <tr
                  className="nx-interactive-row"
                  key={account.id}
                  tabIndex={0}
                  onClick={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button, input, select, textarea, a, label"))) onOpenAccount(account.id); }}
                  onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenAccount(account.id); } }}
                >
                  <td>
                    <button className="nx-record-link" type="button" onClick={() => onOpenAccount(account.id)}>{account.bank}</button>
                    <small>{account.branch}</small>
                  </td>
                  <td>
                    <button className="nx-record-link" type="button" onClick={() => onOpenAccount(account.id)}>{account.name}</button>
                    <small>{account.number}</small>
                  </td>
                  <td>{accountLabel(account.glCode)}</td>
                  <td>{account.currency}</td>
                  <td className="amount"><strong>{formatMoney(account.ledgerBalance, account.currency)}</strong></td>
                  <td className="amount">{formatMoney(account.availableBalance, account.currency)}</td>
                  <td className="amount">{account.unreconciled > 0 ? `${account.unreconciled} items` : "—"}</td>
                  <td>{account.lastMovement}</td>
                  <td><span className={`nx-status nx-status-${account.status.toLowerCase()}`}>{account.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nx-pagination">
          <span>Showing {visible.length} of {bankAccounts.length} accounts · select a bank to open its statement</span>
        </div>
      </section>
    </>
  );
}

export function BankStatement({
  accountId,
  onAction,
  onOpenTransaction,
  onReconcile,
  onBack,
}: {
  accountId: string;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction: (reference: string) => void;
  onReconcile?: (accountId: string) => void;
  onBack?: () => void;
}) {
  const [selectedId, setSelectedId] = useState(accountId);
  const [from, setFrom] = useState("2026-08-01");
  const [to, setTo] = useState("2026-09-07");
  const [onlyUnreconciled, setOnlyUnreconciled] = useState(false);
  const [query, setQuery] = useState("");
  const [transactionType, setTransactionType] = useState("");
  const [nominal, setNominal] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");

  const account: BankAccountFixture = findBankAccount(selectedId) ?? bankAccounts[0];
  const statement = statements[account.id] ?? fallbackStatement;

  // Movement before the window becomes part of the opening balance.
  const before = statement.lines.filter((line) => from && line.date < from);
  const openingBalance = statement.openingBalance + before.reduce((sum, line) => sum + line.debit - line.credit, 0);

  const windowLines = statement.lines.filter((line) => withinRange(line.date, from, to));
  const types = [...new Set(statement.lines.map((line) => line.type))].sort();
  const nominals = [...new Set(statement.lines.map((line) => line.nominal))].sort();
  const needle = query.trim().toLowerCase();
  const visibleLines = windowLines.filter((line) => {
    const amount = Math.max(line.debit, line.credit);
    const queryMatch = !needle || [line.voucher, line.type, line.nominal, line.reference, line.details].some((value) => value.toLowerCase().includes(needle));
    return queryMatch
      && (!onlyUnreconciled || !line.reconciled)
      && (!transactionType || line.type === transactionType)
      && (!nominal || line.nominal === nominal)
      && (!minAmount || amount >= Number(minAmount))
      && (!maxAmount || amount <= Number(maxAmount));
  });

  const running = windowLines.reduce<{ balance: number; rows: (StatementLine & { balance: number })[] }>(
    (state, line) => {
      const balance = state.balance + line.debit - line.credit;
      return { balance, rows: [...state.rows, { ...line, balance }] };
    },
    { balance: openingBalance, rows: [] },
  );
  const rowsById = new Map(running.rows.map((row) => [row.id, row]));

  const totalDebit = windowLines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredit = windowLines.reduce((sum, line) => sum + line.credit, 0);
  const closingBalance = running.balance;
  const unreconciledCount = windowLines.filter((line) => !line.reconciled).length;

  return (
    <div className="nx-statement">
      <header className="nx-txn-detail__head">
        <div>
          <div className="nx-txn-detail__crumbs">
            {onBack ? <button className="nx-record-link" type="button" onClick={onBack}>← Account balances</button> : null}
            <span>Bank statement</span>
          </div>
          <h1>{account.name}</h1>
          <p>{account.bank} · {account.branch} · {account.number} · {accountLabel(account.glCode)}</p>
          <div className="nx-txn-detail__badges">
            <span className={`nx-status nx-status-${account.status.toLowerCase()}`}>{account.status}</span>
            <span className="nx-role-badge">{account.currency}</span>
            <span className="nx-role-badge">{account.type}</span>
          </div>
        </div>
        <div className="nx-txn-detail__actions">
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Print statement", account.name)}>Print</button>
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Export statement", account.name)}>Export</button>
          <button
            className="nx-button nx-button-primary"
            type="button"
            onClick={() => {
              onAction("Reconcile", account.name);
              onReconcile?.(account.id);
            }}
          >
            Reconcile
          </button>
        </div>
      </header>

      <section className="nx-statement__filters">
        <div className="nx-form-field">
          <label htmlFor="stmt-account">Bank account</label>
          <select id="stmt-account" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
            {bankAccounts.map((item) => <option key={item.id} value={item.id}>{item.name} — {item.number} ({item.currency})</option>)}
          </select>
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-from">Date from</label>
          <input id="stmt-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-to">Date to</label>
          <input id="stmt-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-search">Transaction search</label>
          <input id="stmt-search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Voucher, reference, details…" />
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-type">Transaction type</label>
          <select id="stmt-type" value={transactionType} onChange={(event) => setTransactionType(event.target.value)}><option value="">All types</option>{types.map((type) => <option key={type}>{type}</option>)}</select>
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-nominal">Nominal account</label>
          <select id="stmt-nominal" value={nominal} onChange={(event) => setNominal(event.target.value)}><option value="">All nominals</option>{nominals.map((item) => <option key={item}>{item}</option>)}</select>
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-min">Minimum amount</label>
          <input id="stmt-min" inputMode="decimal" value={minAmount} onChange={(event) => setMinAmount(event.target.value)} placeholder="0.00" />
        </div>
        <div className="nx-form-field">
          <label htmlFor="stmt-max">Maximum amount</label>
          <input id="stmt-max" inputMode="decimal" value={maxAmount} onChange={(event) => setMaxAmount(event.target.value)} placeholder="No limit" />
        </div>
        <div className="nx-statement__quick">
          {[
            { label: "August", from: "2026-08-01", to: "2026-08-31" },
            { label: "September", from: "2026-09-01", to: "2026-09-30" },
            { label: "Last 90 days", from: "2026-06-09", to: "2026-09-07" },
            { label: "All dates", from: "", to: "" },
          ].map((preset) => (
            <button
              className={from === preset.from && to === preset.to ? "is-active" : undefined}
              key={preset.label}
              onClick={() => { setFrom(preset.from); setTo(preset.to); }}
              type="button"
            >
              {preset.label}
            </button>
          ))}
        </div>
        <label className="nx-statement__toggle">
          <input checked={onlyUnreconciled} onChange={(event) => setOnlyUnreconciled(event.target.checked)} type="checkbox" />
          <span>Unreconciled only{unreconciledCount > 0 ? ` (${unreconciledCount})` : ""}</span>
        </label>
      </section>

      <section className="nx-statement__totals">
        <div><span>Opening balance</span><strong>{formatMoney(openingBalance, account.currency)}</strong><small>{from || "start of records"}</small></div>
        <div><span>Money in</span><strong className="nx-pos">{formatMoney(totalDebit, account.currency)}</strong><small>{windowLines.filter((l) => l.debit > 0).length} entries</small></div>
        <div><span>Money out</span><strong className="nx-neg">{formatMoney(totalCredit, account.currency)}</strong><small>{windowLines.filter((l) => l.credit > 0).length} entries</small></div>
        <div><span>Closing balance</span><strong>{formatMoney(closingBalance, account.currency)}</strong><small>{to || "latest"}</small></div>
        <div><span>Unreconciled</span><strong>{unreconciledCount}</strong><small>in this period</small></div>
      </section>

      <section className="nx-card nx-list-card">
        <div className="nx-table-wrap">
          <table className="nx-data-table nx-statement-table">
            <thead>
              <tr>
                <th>Date</th><th>Voucher</th><th>Type</th><th>Nominal</th><th>Ref. No.</th><th>Details</th>
                <th className="amount">Money in</th><th className="amount">Money out</th><th className="amount">Balance</th><th>R</th>
              </tr>
            </thead>
            <tbody>
              <tr className="nx-statement-table__opening">
                <td>{from || "—"}</td>
                <td colSpan={5}><strong>Opening balance</strong></td>
                <td className="amount">—</td><td className="amount">—</td>
                <td className="amount"><strong>{formatMoney(openingBalance, account.currency)}</strong></td>
                <td />
              </tr>
              {visibleLines.length === 0 ? (
                <tr><td colSpan={10} className="nx-statement-table__empty">No movement on this account between {from || "the earliest record"} and {to || "today"}.</td></tr>
              ) : (
                visibleLines.map((line) => {
                  const row = rowsById.get(line.id);
                  return (
                    <tr
                      className="nx-interactive-row"
                      key={line.id}
                      tabIndex={0}
                      onClick={(event) => { if (!(event.target instanceof HTMLElement && event.target.closest("button, input, select, textarea, a, label"))) onOpenTransaction(line.voucher); }}
                      onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); onOpenTransaction(line.voucher); } }}
                    >
                      <td>{line.date}</td>
                      <td><button className="nx-record-link" type="button" onClick={() => onOpenTransaction(line.voucher)}>{line.voucher}</button></td>
                      <td>{line.type}</td>
                      <td>{line.nominal}</td>
                      <td>{line.reference}</td>
                      <td>{line.details}</td>
                      <td className="amount">{line.debit > 0 ? formatMoney(line.debit, account.currency) : "—"}</td>
                      <td className="amount">{line.credit > 0 ? formatMoney(line.credit, account.currency) : "—"}</td>
                      <td className="amount">{row ? formatMoney(row.balance, account.currency) : "—"}</td>
                      <td>{line.reconciled ? <span className="nx-statement-table__flag" title="Reconciled">✓</span> : <span className="nx-statement-table__flag nx-statement-table__flag--open" title="Unreconciled">•</span>}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <th colSpan={6} scope="row">Closing balance</th>
                <td className="amount">{formatMoney(totalDebit, account.currency)}</td>
                <td className="amount">{formatMoney(totalCredit, account.currency)}</td>
                <td className="amount">{formatMoney(closingBalance, account.currency)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
        <div className="nx-pagination">
          <span>{visibleLines.length} of {windowLines.length} movements shown{onlyUnreconciled ? " · unreconciled filter active" : ""}</span>
        </div>
      </section>
    </div>
  );
}
