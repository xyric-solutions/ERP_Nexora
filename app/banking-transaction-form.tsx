"use client";

/**
 * Banking transaction entry for the isolated Nexora UI/UX prototype.
 *
 * One form drives all banking transaction types: the visible inputs, the
 * required fields and the resulting double entry are all derived from the
 * selected type's definition, and the journal preview updates as the user
 * types so the accounting effect is never hidden behind a Save button.
 *
 * Presentation only: nothing is posted, stored or transmitted.
 */

import { useState } from "react";
import { customers, suppliers } from "./mock-data";
import { AccountSelect } from "./banking-account-select";
import {
  BASE_CURRENCY,
  accountLabel,
  bankAccounts,
  currencyOptions,
  costCentres,
  approvalRoutes,
  exchangeRates,
  findAccount,
  findBankAccount,
  formatMoney,
  type BankCurrency,
} from "./banking-master-data";
import {
  buildJournalPreview,
  findTransactionType,
  nextReference,
  resolveBankSide,
  validateDraft,
  type BankingDraft,
  type BankingTransactionType,
} from "./banking-transaction-types";

const bankNames = ["First Meridian Bank", "Continental Trust", "Northgate Bank", "Indus Commercial", "Summit National"] as const;
const accountKinds = ["Current", "Deposit", "Escrow", "Cash"] as const;

function today() {
  return "2026-09-03";
}

function createDraft(type: BankingTransactionType, sequence: number): BankingDraft {
  const defaultBank = bankAccounts[0];
  return {
    typeId: type.id,
    reference: nextReference(type.prefix, sequence),
    transactionDate: today(),
    valueDate: today(),
    bankAccountId: type.isMasterData ? "" : defaultBank.id,
    counterBankAccountId: "",
    partyId: "",
    currency: BASE_CURRENCY,
    exchangeRate: "1",
    amount: "",
    contraAccount: type.defaultContraAccount,
    directionId: type.directions?.[0]?.id ?? "",
    method: type.methodOptions?.[0] ?? "",
    description: "",
    notes: "",
    costCentre: costCentres[0],
    approvalRoute: approvalRoutes[0],
    attachmentName: "",
    bankChargeAmount: "",
    bankChargeAccount: "70-01-00100",
    chequeNumber: "",
    chequeDate: today(),
    chequeBank: bankNames[0],
    revaluedRate: "",
    accountName: "",
    accountNumber: "",
    bankName: bankNames[0],
    branch: "",
    iban: "",
    swift: "",
    accountKind: accountKinds[0],
    glCode: "",
    overdraftLimit: "0",
  };
}

function Field({
  label,
  htmlFor,
  error,
  helper,
  required,
  wide,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  helper?: string;
  required?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={`nx-form-field${wide ? " nx-form-field--wide" : ""}`}>
      <label htmlFor={htmlFor}>{label}{required ? <em aria-hidden="true"> *</em> : null}</label>
      {children}
      {error ? <p className="nx-field-error" role="alert">{error}</p> : helper ? <p className="nx-field-help">{helper}</p> : null}
    </div>
  );
}

function FormSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="nx-form-section">
      <header>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
        {description ? <p>{description}</p> : null}
      </header>
      <div className="nx-form-grid">{children}</div>
    </section>
  );
}

export function BankingTransactionForm({
  typeId,
  onAction,
  onOpenTransaction,
}: {
  typeId: string;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction?: (reference: string) => void;
}) {
  const type = findTransactionType(typeId) ?? findTransactionType("bank-payment")!;
  const [draft, setDraft] = useState<BankingDraft>(() => createDraft(type, 419));
  const [submitted, setSubmitted] = useState(false);
  const [savedState, setSavedState] = useState<"draft" | "submitted" | null>(null);

  const set = <K extends keyof BankingDraft>(key: K, value: BankingDraft[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setSavedState(null);
  };

  const bankAccount = findBankAccount(draft.bankAccountId);
  const counterBankAccount = findBankAccount(draft.counterBankAccountId);
  const bankGlCode = type.isMasterData ? draft.glCode : bankAccount?.glCode ?? "";
  const counterGlCode = counterBankAccount?.glCode ?? "";

  // Derived on every render; the React Compiler handles memoization.
  const preview = buildJournalPreview(type, draft, bankGlCode, counterGlCode);
  const errors = validateDraft(type, draft, preview, BASE_CURRENCY);
  const errorCount = Object.keys(errors).length;
  const showErrors = submitted;
  const errorFor = (key: string) => (showErrors ? errors[key] : undefined);

  const bankSide = resolveBankSide(type, draft);
  const isForeign = draft.currency !== BASE_CURRENCY;
  const parties = type.partyKind === "customer" ? customers : type.partyKind === "supplier" ? suppliers : [];

  const handleSubmit = () => {
    setSubmitted(true);
    if (Object.keys(errors).length > 0) {
      onAction("Validation failed", `${Object.keys(errors).length} field(s) need attention`);
      return;
    }
    setSavedState("submitted");
    onAction("Submitted for approval", draft.reference);
  };

  const handleDraft = () => {
    if (!draft.reference.trim()) {
      setSubmitted(true);
      return;
    }
    setSavedState("draft");
    onAction("Saved as draft", draft.reference);
  };

  return (
    <div className="nx-txn-layout nx-workspace-form nx-workspace-form--banking">
      <div className="nx-txn-main">
        {savedState ? (
          <div className={`nx-txn-banner nx-txn-banner--${savedState}`} role="status">
            <strong>{savedState === "draft" ? "Draft saved" : "Submitted for approval"}</strong>
            <span>
              {draft.reference} is {savedState === "draft" ? "held as a draft and has not been posted" : "queued on the approval route and has not been posted"}.
              This prototype records no real transaction.
            </span>
            {onOpenTransaction ? (
              <button className="nx-button nx-button-secondary" type="button" onClick={() => onOpenTransaction(draft.reference)}>
                Open transaction
              </button>
            ) : null}
          </div>
        ) : null}

        {showErrors && errorCount > 0 ? (
          <div className="nx-txn-banner nx-txn-banner--error" role="alert">
            <strong>{errorCount} {errorCount === 1 ? "field needs" : "fields need"} attention</strong>
            <span>Resolve the highlighted fields before this transaction can be submitted.</span>
          </div>
        ) : null}

        <FormSection
          eyebrow="Transaction"
          title="Transaction details"
          description={type.description}
        >
          <Field label="Transaction type" htmlFor="txn-type">
            <input id="txn-type" value={type.label} readOnly className="nx-readonly-input" />
          </Field>
          <Field label="Reference" htmlFor="txn-reference" required error={errorFor("reference")} helper={type.documentHint}>
            <input id="txn-reference" value={draft.reference} onChange={(event) => set("reference", event.target.value)} />
          </Field>
          <Field label="Transaction date" htmlFor="txn-date" required error={errorFor("transactionDate")}>
            <input id="txn-date" type="date" value={draft.transactionDate} onChange={(event) => set("transactionDate", event.target.value)} />
          </Field>
          {!type.isMasterData ? (
            <Field label="Value date" htmlFor="txn-value-date" helper="Date the funds actually clear the account.">
              <input id="txn-value-date" type="date" value={draft.valueDate} onChange={(event) => set("valueDate", event.target.value)} />
            </Field>
          ) : null}
          {type.directions ? (
            <Field label="Direction" htmlFor="txn-direction" wide helper={type.directions.find((option) => option.id === draft.directionId)?.helper}>
              <div className="nx-choice-row" id="txn-direction">
                {type.directions.map((option) => (
                  <button
                    aria-pressed={draft.directionId === option.id}
                    className={draft.directionId === option.id ? "is-active" : undefined}
                    key={option.id}
                    onClick={() => {
                      setDraft((current) => ({ ...current, directionId: option.id, contraAccount: option.contraAccount }));
                      setSavedState(null);
                    }}
                    type="button"
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>
          ) : null}
        </FormSection>

        {type.isMasterData ? (
          <FormSection eyebrow="Account" title="Bank account record" description="Details used on payments, statements and reconciliation.">
            <Field label="Account name" htmlFor="ba-name" required error={errorFor("accountName")}>
              <input id="ba-name" value={draft.accountName} onChange={(event) => set("accountName", event.target.value)} placeholder="e.g. Operating USD" />
            </Field>
            <Field label="Account type" htmlFor="ba-kind">
              <select id="ba-kind" value={draft.accountKind} onChange={(event) => set("accountKind", event.target.value)}>
                {accountKinds.map((kind) => <option key={kind}>{kind}</option>)}
              </select>
            </Field>
            <Field label="Bank" htmlFor="ba-bank" required error={errorFor("bankName")}>
              <select id="ba-bank" value={draft.bankName} onChange={(event) => set("bankName", event.target.value)}>
                {bankNames.map((bank) => <option key={bank}>{bank}</option>)}
              </select>
            </Field>
            <Field label="Branch" htmlFor="ba-branch">
              <input id="ba-branch" value={draft.branch} onChange={(event) => set("branch", event.target.value)} placeholder="e.g. Downtown" />
            </Field>
            <Field label="Account number" htmlFor="ba-number" required error={errorFor("accountNumber")}>
              <input id="ba-number" value={draft.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} placeholder="e.g. 00012244471" />
            </Field>
            <Field label="Currency" htmlFor="ba-currency">
              <select id="ba-currency" value={draft.currency} onChange={(event) => set("currency", event.target.value as BankCurrency)}>
                {currencyOptions.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </Field>
            <Field label="IBAN" htmlFor="ba-iban">
              <input id="ba-iban" value={draft.iban} onChange={(event) => set("iban", event.target.value)} />
            </Field>
            <Field label="SWIFT / BIC" htmlFor="ba-swift">
              <input id="ba-swift" value={draft.swift} onChange={(event) => set("swift", event.target.value)} />
            </Field>
            <Field label="Overdraft limit" htmlFor="ba-od">
              <input id="ba-od" value={draft.overdraftLimit} onChange={(event) => set("overdraftLimit", event.target.value)} inputMode="decimal" />
            </Field>
            <div className="nx-form-field nx-form-field--wide">
              <AccountSelect
                id="ba-gl"
                label="Nominal control account"
                value={draft.glCode}
                onChange={(code) => set("glCode", code)}
                error={errorFor("glCode")}
                helper="Every movement on this bank account posts to this Chart of Accounts control account."
                filter={(account) => account.isBankControl === true}
                required
              />
            </div>
          </FormSection>
        ) : (
          <FormSection
            eyebrow="Banking"
            title={type.needsCounterBank ? "Accounts and routing" : "Bank account and party"}
            description={type.needsCounterBank ? "Funds move between two of your own accounts." : undefined}
          >
            <Field
              label={type.needsCounterBank ? "Transfer from account" : "Bank account"}
              htmlFor="txn-bank"
              required
              error={errorFor("bankAccountId")}
              helper={bankAccount ? `${accountLabel(bankAccount.glCode)} · available ${formatMoney(bankAccount.availableBalance, bankAccount.currency)}` : undefined}
            >
              <select
                id="txn-bank"
                value={draft.bankAccountId}
                onChange={(event) => {
                  const account = findBankAccount(event.target.value);
                  setDraft((current) => ({
                    ...current,
                    bankAccountId: event.target.value,
                    currency: account?.currency ?? current.currency,
                    exchangeRate: String(exchangeRates[account?.currency ?? BASE_CURRENCY]),
                  }));
                  setSavedState(null);
                }}
              >
                <option value="">Select an account…</option>
                {bankAccounts.filter((account) => account.status !== "Closed").map((account) => (
                  <option key={account.id} value={account.id}>{account.name} — {account.number} ({account.currency})</option>
                ))}
              </select>
            </Field>

            {type.needsCounterBank ? (
              <Field label={type.counterBankLabel ?? "Destination account"} htmlFor="txn-counter-bank" required error={errorFor("counterBankAccountId")} helper={counterBankAccount ? accountLabel(counterBankAccount.glCode) : undefined}>
                <select id="txn-counter-bank" value={draft.counterBankAccountId} onChange={(event) => set("counterBankAccountId", event.target.value)}>
                  <option value="">Select an account…</option>
                  {bankAccounts.filter((account) => account.status !== "Closed" && account.id !== draft.bankAccountId).map((account) => (
                    <option key={account.id} value={account.id}>{account.name} — {account.number} ({account.currency})</option>
                  ))}
                </select>
              </Field>
            ) : null}

            {type.partyKind !== "none" ? (
              <Field label={type.partyLabel} htmlFor="txn-party" required error={errorFor("partyId")}>
                {parties.length > 0 ? (
                  <select id="txn-party" value={draft.partyId} onChange={(event) => set("partyId", event.target.value)}>
                    <option value="">Select {type.partyKind}…</option>
                    {parties.map((party) => <option key={party.id} value={party.name}>{party.name}</option>)}
                  </select>
                ) : (
                  <select id="txn-party" value={draft.partyId} onChange={(event) => set("partyId", event.target.value)}>
                    <option value="">Select bank…</option>
                    {bankNames.map((bank) => <option key={bank} value={bank}>{bank}</option>)}
                  </select>
                )}
              </Field>
            ) : null}

            {type.methodOptions ? (
              <Field label={type.methodLabel ?? "Method"} htmlFor="txn-method">
                <select id="txn-method" value={draft.method} onChange={(event) => set("method", event.target.value)}>
                  {type.methodOptions.map((method) => <option key={method}>{method}</option>)}
                </select>
              </Field>
            ) : null}

            {type.needsChequeDetails ? (
              <>
                <Field label="Cheque number" htmlFor="txn-cheque-no" required error={errorFor("chequeNumber")}>
                  <input id="txn-cheque-no" value={draft.chequeNumber} onChange={(event) => set("chequeNumber", event.target.value)} placeholder="e.g. 104883" />
                </Field>
                <Field label="Cheque date" htmlFor="txn-cheque-date" required error={errorFor("chequeDate")} helper="A future date marks the cheque as post dated.">
                  <input id="txn-cheque-date" type="date" value={draft.chequeDate} onChange={(event) => set("chequeDate", event.target.value)} />
                </Field>
                <Field label="Drawee bank" htmlFor="txn-cheque-bank">
                  <select id="txn-cheque-bank" value={draft.chequeBank} onChange={(event) => set("chequeBank", event.target.value)}>
                    {bankNames.map((bank) => <option key={bank}>{bank}</option>)}
                  </select>
                </Field>
              </>
            ) : null}
          </FormSection>
        )}

        <FormSection
          eyebrow="Amounts"
          title={type.isMasterData ? "Opening position" : "Amount and currency"}
          description={isForeign ? "A foreign-currency transaction is converted to the base currency at the rate entered here." : undefined}
        >
          <Field label={type.amountLabel} htmlFor="txn-amount" required={!type.isMasterData} error={errorFor("amount")}>
            <input id="txn-amount" value={draft.amount} onChange={(event) => set("amount", event.target.value)} inputMode="decimal" placeholder="0.00" />
          </Field>
          {!type.isMasterData ? (
            <Field label="Currency" htmlFor="txn-currency">
              <select
                id="txn-currency"
                value={draft.currency}
                onChange={(event) => {
                  const currency = event.target.value as BankCurrency;
                  setDraft((current) => ({ ...current, currency, exchangeRate: String(exchangeRates[currency]) }));
                  setSavedState(null);
                }}
              >
                {currencyOptions.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </Field>
          ) : null}
          {isForeign ? (
            <Field label={`Exchange rate to ${BASE_CURRENCY}`} htmlFor="txn-rate" required error={errorFor("exchangeRate")} helper={`Base value ${formatMoney(preview.baseCurrencyAmount)}`}>
              <input id="txn-rate" value={draft.exchangeRate} onChange={(event) => set("exchangeRate", event.target.value)} inputMode="decimal" />
            </Field>
          ) : null}
          {type.needsRevaluation ? (
            <Field label="Closing rate" htmlFor="txn-reval-rate" required error={errorFor("revaluedRate")} helper="Rate used to restate the balance at period end.">
              <input id="txn-reval-rate" value={draft.revaluedRate} onChange={(event) => set("revaluedRate", event.target.value)} inputMode="decimal" placeholder="e.g. 1.0925" />
            </Field>
          ) : null}
          {type.allowsBankCharge ? (
            <>
              <Field label="Bank charge (optional)" htmlFor="txn-charge" helper="Adds a separate expense line to the same entry.">
                <input id="txn-charge" value={draft.bankChargeAmount} onChange={(event) => set("bankChargeAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
              </Field>
              <div className="nx-form-field">
                <AccountSelect
                  id="txn-charge-account"
                  label="Bank charge account"
                  value={draft.bankChargeAccount}
                  onChange={(code) => set("bankChargeAccount", code)}
                  error={errorFor("bankChargeAccount")}
                  suggested={["70-01-00100", "70-01-00200"]}
                />
              </div>
            </>
          ) : null}
        </FormSection>

        <FormSection
          eyebrow="Accounting"
          title="Nominal posting"
          description="Selected from the existing Chart of Accounts. The resulting debit and credit are shown in the accounting effect panel."
        >
          {type.needsCounterBank ? (
            <div className="nx-form-field nx-form-field--wide">
              <p className="nx-field-help">
                Both sides of a transfer post to bank control accounts:
                {" "}<strong>{counterBankAccount ? accountLabel(counterBankAccount.glCode) : "destination account"}</strong> is debited and
                {" "}<strong>{bankAccount ? accountLabel(bankAccount.glCode) : "source account"}</strong> is credited.
              </p>
            </div>
          ) : (
            <div className="nx-form-field nx-form-field--wide">
              <AccountSelect
                id="txn-contra"
                label={type.contraLabel}
                value={draft.contraAccount}
                onChange={(code) => set("contraAccount", code)}
                error={errorFor("contraAccount")}
                helper={type.contraHelper}
                suggested={type.suggestedContraAccounts}
                required
              />
            </div>
          )}
          {!type.isMasterData ? (
            <>
              <Field label="Cost centre" htmlFor="txn-cost-centre">
                <select id="txn-cost-centre" value={draft.costCentre} onChange={(event) => set("costCentre", event.target.value)}>
                  {costCentres.map((centre) => <option key={centre}>{centre}</option>)}
                </select>
              </Field>
              <Field label="Approval route" htmlFor="txn-approval">
                <select id="txn-approval" value={draft.approvalRoute} onChange={(event) => set("approvalRoute", event.target.value)}>
                  {approvalRoutes.map((route) => <option key={route}>{route}</option>)}
                </select>
              </Field>
            </>
          ) : null}
        </FormSection>

        <FormSection eyebrow="Supporting" title="Description, documents and notes">
          <Field label="Description" htmlFor="txn-description" wide helper="Appears on the journal line and the bank statement match.">
            <input id="txn-description" value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder={`e.g. ${type.label} for August`} />
          </Field>
          <Field label="Supporting document" htmlFor="txn-attachment" wide helper="Prototype only — no file is uploaded or stored.">
            <div className="nx-attachment-row">
              <input id="txn-attachment" value={draft.attachmentName} onChange={(event) => set("attachmentName", event.target.value)} placeholder="e.g. remittance-advice.pdf" />
              <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Attach document", draft.reference)}>Browse…</button>
            </div>
          </Field>
          <Field label="Internal notes" htmlFor="txn-notes" wide>
            <textarea id="txn-notes" rows={3} value={draft.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Visible to finance reviewers only." />
          </Field>
        </FormSection>
      </div>

      <aside className="nx-txn-side">
        <section className="nx-txn-effect">
          <header>
            <span>Accounting effect</span>
            <h2>Double entry preview</h2>
            <p>Updates as you type. A transaction cannot be submitted while the entry is unbalanced.</p>
          </header>

          <div className="nx-txn-effect__meta">
            <div><span>Type</span><strong>{type.label}</strong></div>
            <div><span>Reference</span><strong>{draft.reference || "—"}</strong></div>
            {!type.isMasterData ? (
              <div><span>Bank side</span><strong>{bankSide === "debit" ? "Debit (money in)" : "Credit (money out)"}</strong></div>
            ) : null}
          </div>

          <table className="nx-txn-journal">
            <thead>
              <tr><th>Account</th><th className="amount">Debit</th><th className="amount">Credit</th></tr>
            </thead>
            <tbody>
              {preview.lines.filter((line) => line.accountCode).length === 0 ? (
                <tr><td colSpan={3} className="nx-txn-journal__empty">Select accounts and enter an amount to preview the entry.</td></tr>
              ) : (
                preview.lines.map((line) => {
                  const account = findAccount(line.accountCode);
                  return (
                    <tr key={line.id}>
                      <td>
                        <strong>{line.accountCode || "—"}</strong>
                        <small>{account?.name ?? "Account not selected"}</small>
                      </td>
                      <td className="amount">{line.debit > 0 ? formatMoney(line.debit, draft.currency) : "—"}</td>
                      <td className="amount">{line.credit > 0 ? formatMoney(line.credit, draft.currency) : "—"}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Totals</th>
                <td className="amount">{formatMoney(preview.totalDebit, draft.currency)}</td>
                <td className="amount">{formatMoney(preview.totalCredit, draft.currency)}</td>
              </tr>
            </tfoot>
          </table>

          <p className={`nx-txn-balance nx-txn-balance--${preview.balanced ? "ok" : "off"}`} role="status">
            {preview.balanced
              ? "Balanced — debits equal credits."
              : preview.totalDebit === 0
                ? "Enter an amount to complete the entry."
                : `Out of balance by ${formatMoney(Math.abs(preview.totalDebit - preview.totalCredit), draft.currency)}.`}
          </p>

          {isForeign ? (
            <p className="nx-txn-fx">
              {draft.currency} converted at {draft.exchangeRate || "—"} → <strong>{formatMoney(preview.baseCurrencyAmount)}</strong> {BASE_CURRENCY}
            </p>
          ) : null}

          <div className="nx-txn-actions">
            <button className="nx-button nx-button-primary" type="button" onClick={handleSubmit}>Submit</button>
            <button className="nx-button nx-button-secondary" type="button" onClick={handleDraft}>Save draft</button>
            <button className="nx-button nx-button-ghost" type="button" onClick={() => { setDraft(createDraft(type, 419)); setSubmitted(false); setSavedState(null); onAction("Cancelled", type.label); }}>Cancel</button>
          </div>

          {showErrors && errorCount > 0 ? (
            <ul className="nx-txn-issues" aria-label="Validation issues">
              {Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}
            </ul>
          ) : (
            <p className="nx-txn-hint">Submitting routes the transaction for approval. Nothing is posted in this prototype.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
