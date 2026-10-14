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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { customers, suppliers } from "@prototype/shared/fixtures/mock-data";
import { AccountSelect } from "../components/banking-account-select";
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
} from "../model/banking-master-data";
import {
  buildJournalPreview,
  findTransactionType,
  nextReference,
  resolveBankSide,
  validateDraft,
  type BankingDraft,
  type BankingTransactionType,
} from "../model/banking-transaction-types";

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
    <div className={`grid min-w-0 content-start gap-1.5 ${wide ? "col-span-full" : ""}`}>
      <label className="text-xs font-semibold" htmlFor={htmlFor}>{label}{required ? <em className="not-italic text-destructive" aria-hidden="true"> *</em> : null}</label>
      {children}
      {error ? <p className="m-0 text-xs font-semibold leading-snug text-destructive" role="alert">{error}</p> : helper ? <p className="m-0 text-xs leading-snug text-muted-foreground">{helper}</p> : null}
    </div>
  );
}

function FormSection({ eyebrow, title, description, children }: { eyebrow: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-xs">
      <header className="min-h-17.5 border-b border-primary/30 bg-primary/10 px-4.5 pb-3 pt-3.5 shadow-[inset_4px_0_0_var(--color-primary)] max-sm:px-3.5 max-sm:pb-2.5 max-sm:pt-3">
        <span className="block text-xs font-bold uppercase tracking-wider text-primary">{eyebrow}</span>
        <h2 className="mb-0 mt-1 text-base font-bold tracking-tight">{title}</h2>
        {description ? <p className="mb-0 mt-1 max-w-prose text-xs leading-relaxed text-muted-foreground">{description}</p> : null}
      </header>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(13.75rem,1fr))] items-start gap-x-4 gap-y-3.5 p-4.5 max-sm:grid-cols-1 max-sm:p-3.5 [&_select]:min-h-10 [&_select]:w-full [&_select]:rounded-md [&_select]:border [&_select]:border-border [&_select]:bg-card [&_select]:px-3 [&_select]:text-sm [&_textarea]:min-h-18 [&_textarea]:w-full">{children}</div>
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
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_minmax(20rem,23.75rem)] items-start gap-4 max-xl:grid-cols-1">
      <div className="grid min-w-0 gap-3.5">
        {savedState ? (
          <div className={`grid gap-1 rounded-md border p-3 ${savedState === "submitted" ? "border-[var(--nx-success)] bg-[var(--nx-success-soft)]" : "border-primary/30 bg-primary/10"}`} role="status">
            <strong>{savedState === "draft" ? "Draft saved" : "Submitted for approval"}</strong>
            <span>
              {draft.reference} is {savedState === "draft" ? "held as a draft and has not been posted" : "queued on the approval route and has not been posted"}.
              This prototype records no real transaction.
            </span>
            {onOpenTransaction ? (
              <Button variant="outline" type="button" onClick={() => onOpenTransaction(draft.reference)}>
                Open transaction
              </Button>
            ) : null}
          </div>
        ) : null}

        {showErrors && errorCount > 0 ? (
          <div className="grid gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-destructive" role="alert">
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
            <Input id="txn-type" value={type.label} readOnly className="bg-muted font-semibold text-muted-foreground" />
          </Field>
          <Field label="Reference" htmlFor="txn-reference" required error={errorFor("reference")} helper={type.documentHint}>
            <Input id="txn-reference" value={draft.reference} onChange={(event) => set("reference", event.target.value)} />
          </Field>
          <Field label="Transaction date" htmlFor="txn-date" required error={errorFor("transactionDate")}>
            <Input id="txn-date" type="date" value={draft.transactionDate} onChange={(event) => set("transactionDate", event.target.value)} />
          </Field>
          {!type.isMasterData ? (
            <Field label="Value date" htmlFor="txn-value-date" helper="Date the funds actually clear the account.">
              <Input id="txn-value-date" type="date" value={draft.valueDate} onChange={(event) => set("valueDate", event.target.value)} />
            </Field>
          ) : null}
          {type.directions ? (
            <Field label="Direction" htmlFor="txn-direction" wide helper={type.directions.find((option) => option.id === draft.directionId)?.helper}>
              <div className="flex flex-wrap gap-2" id="txn-direction">
                {type.directions.map((option) => (
                  <Button
                    variant="outline"
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
                  </Button>
                ))}
              </div>
            </Field>
          ) : null}
        </FormSection>

        {type.isMasterData ? (
          <FormSection eyebrow="Account" title="Bank account record" description="Details used on payments, statements and reconciliation.">
            <Field label="Account name" htmlFor="ba-name" required error={errorFor("accountName")}>
              <Input id="ba-name" value={draft.accountName} onChange={(event) => set("accountName", event.target.value)} placeholder="e.g. Operating USD" />
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
              <Input id="ba-branch" value={draft.branch} onChange={(event) => set("branch", event.target.value)} placeholder="e.g. Downtown" />
            </Field>
            <Field label="Account number" htmlFor="ba-number" required error={errorFor("accountNumber")}>
              <Input id="ba-number" value={draft.accountNumber} onChange={(event) => set("accountNumber", event.target.value)} placeholder="e.g. 00012244471" />
            </Field>
            <Field label="Currency" htmlFor="ba-currency">
              <select id="ba-currency" value={draft.currency} onChange={(event) => set("currency", event.target.value as BankCurrency)}>
                {currencyOptions.map((currency) => <option key={currency}>{currency}</option>)}
              </select>
            </Field>
            <Field label="IBAN" htmlFor="ba-iban">
              <Input id="ba-iban" value={draft.iban} onChange={(event) => set("iban", event.target.value)} />
            </Field>
            <Field label="SWIFT / BIC" htmlFor="ba-swift">
              <Input id="ba-swift" value={draft.swift} onChange={(event) => set("swift", event.target.value)} />
            </Field>
            <Field label="Overdraft limit" htmlFor="ba-od">
              <Input id="ba-od" value={draft.overdraftLimit} onChange={(event) => set("overdraftLimit", event.target.value)} inputMode="decimal" />
            </Field>
            <div className="col-span-full grid min-w-0 content-start gap-1.5">
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
                  <Input id="txn-cheque-no" value={draft.chequeNumber} onChange={(event) => set("chequeNumber", event.target.value)} placeholder="e.g. 104883" />
                </Field>
                <Field label="Cheque date" htmlFor="txn-cheque-date" required error={errorFor("chequeDate")} helper="A future date marks the cheque as post dated.">
                  <Input id="txn-cheque-date" type="date" value={draft.chequeDate} onChange={(event) => set("chequeDate", event.target.value)} />
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
            <Input id="txn-amount" value={draft.amount} onChange={(event) => set("amount", event.target.value)} inputMode="decimal" placeholder="0.00" />
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
              <Input id="txn-rate" value={draft.exchangeRate} onChange={(event) => set("exchangeRate", event.target.value)} inputMode="decimal" />
            </Field>
          ) : null}
          {type.needsRevaluation ? (
            <Field label="Closing rate" htmlFor="txn-reval-rate" required error={errorFor("revaluedRate")} helper="Rate used to restate the balance at period end.">
              <Input id="txn-reval-rate" value={draft.revaluedRate} onChange={(event) => set("revaluedRate", event.target.value)} inputMode="decimal" placeholder="e.g. 1.0925" />
            </Field>
          ) : null}
          {type.allowsBankCharge ? (
            <>
              <Field label="Bank charge (optional)" htmlFor="txn-charge" helper="Adds a separate expense line to the same entry.">
                <Input id="txn-charge" value={draft.bankChargeAmount} onChange={(event) => set("bankChargeAmount", event.target.value)} inputMode="decimal" placeholder="0.00" />
              </Field>
              <div className="grid min-w-0 content-start gap-1.5">
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
            <div className="col-span-full grid min-w-0 content-start gap-1.5">
              <p className="m-0 text-xs leading-snug text-muted-foreground">
                Both sides of a transfer post to bank control accounts:
                {" "}<strong>{counterBankAccount ? accountLabel(counterBankAccount.glCode) : "destination account"}</strong> is debited and
                {" "}<strong>{bankAccount ? accountLabel(bankAccount.glCode) : "source account"}</strong> is credited.
              </p>
            </div>
          ) : (
            <div className="col-span-full grid min-w-0 content-start gap-1.5">
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
            <Input id="txn-description" value={draft.description} onChange={(event) => set("description", event.target.value)} placeholder={`e.g. ${type.label} for August`} />
          </Field>
          <Field label="Supporting document" htmlFor="txn-attachment" wide helper="Prototype only — no file is uploaded or stored.">
            <div className="flex items-center gap-2 max-sm:flex-col max-sm:items-stretch">
              <Input id="txn-attachment" value={draft.attachmentName} onChange={(event) => set("attachmentName", event.target.value)} placeholder="e.g. remittance-advice.pdf" />
              <Button variant="outline" type="button" onClick={() => onAction("Attach document", draft.reference)}>Browse…</Button>
            </div>
          </Field>
          <Field label="Internal notes" htmlFor="txn-notes" wide>
            <Textarea id="txn-notes" rows={3} value={draft.notes} onChange={(event) => set("notes", event.target.value)} placeholder="Visible to finance reviewers only." />
          </Field>
        </FormSection>
      </div>

      <aside className="min-w-0 xl:sticky xl:top-3">
        <section className="min-w-0 overflow-hidden rounded-md border border-border bg-card shadow-xs">
          <header className="border-b border-primary/30 bg-primary/10 px-4 py-3 shadow-[inset_4px_0_0_var(--color-primary)] [&>span]:block [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wider [&>span]:text-primary [&_h2]:mb-0 [&_h2]:mt-1 [&_h2]:text-sm [&_h2]:font-bold [&_p]:mb-0 [&_p]:mt-1 [&_p]:text-xs [&_p]:leading-relaxed [&_p]:text-muted-foreground">
            <span>Accounting effect</span>
            <h2>Double entry preview</h2>
            <p>Updates as you type. A transaction cannot be submitted while the entry is unbalanced.</p>
          </header>

          <div className="grid gap-2 border-b border-border px-4 py-3 [&>div]:flex [&>div]:items-baseline [&>div]:justify-between [&>div]:gap-2 [&_span]:text-xs [&_span]:text-muted-foreground [&_strong]:text-right [&_strong]:text-xs [&_strong]:font-bold">
            <div><span>Type</span><strong>{type.label}</strong></div>
            <div><span>Reference</span><strong>{draft.reference || "—"}</strong></div>
            {!type.isMasterData ? (
              <div><span>Bank side</span><strong>{bankSide === "debit" ? "Debit (money in)" : "Credit (money out)"}</strong></div>
            ) : null}
          </div>

          <table className="w-full border-collapse text-xs [&_th]:border-b [&_th]:border-border [&_th]:bg-primary [&_th]:px-2.5 [&_th]:py-2 [&_th]:text-left [&_th]:text-xs [&_th]:text-primary-foreground [&_td]:border-b [&_td]:border-border [&_td]:px-2.5 [&_td]:py-2 [&_.amount]:text-right [&_tfoot_th]:bg-muted [&_tfoot_td]:bg-muted">
            <thead>
              <tr><th>Account</th><th className="amount">Debit</th><th className="amount">Credit</th></tr>
            </thead>
            <tbody>
              {preview.lines.filter((line) => line.accountCode).length === 0 ? (
                <tr><td colSpan={3} className="px-2.5 py-4 text-center text-muted-foreground">Select accounts and enter an amount to preview the entry.</td></tr>
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

          <p className={`m-0 px-4 py-2 text-xs font-semibold ${preview.balanced ? "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]" : "bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]"}`} role="status">
            {preview.balanced
              ? "Balanced — debits equal credits."
              : preview.totalDebit === 0
                ? "Enter an amount to complete the entry."
                : `Out of balance by ${formatMoney(Math.abs(preview.totalDebit - preview.totalCredit), draft.currency)}.`}
          </p>

          {isForeign ? (
            <p className="m-0 border-t border-border px-4 py-2 text-xs text-muted-foreground">
              {draft.currency} converted at {draft.exchangeRate || "—"} → <strong>{formatMoney(preview.baseCurrencyAmount)}</strong> {BASE_CURRENCY}
            </p>
          ) : null}

          <div className="grid gap-2 border-t border-border px-4 py-3">
            <Button type="button" onClick={handleSubmit}>Submit</Button>
            <Button variant="outline" type="button" onClick={handleDraft}>Save draft</Button>
            <Button variant="ghost" type="button" onClick={() => { setDraft(createDraft(type, 419)); setSubmitted(false); setSavedState(null); onAction("Cancelled", type.label); }}>Cancel</Button>
          </div>

          {showErrors && errorCount > 0 ? (
            <ul className="m-0 pb-3 pl-8 pr-4 text-xs leading-relaxed text-destructive" aria-label="Validation issues">
              {Object.entries(errors).map(([key, message]) => <li key={key}>{message}</li>)}
            </ul>
          ) : (
            <p className="m-0 px-4 pb-3 text-xs leading-relaxed text-muted-foreground">Submitting routes the transaction for approval. Nothing is posted in this prototype.</p>
          )}
        </section>
      </aside>
    </div>
  );
}
