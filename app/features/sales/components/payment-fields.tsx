"use client";

/**
 * Money fields shared by every Receipts form (receipt, customer payment,
 * return receipt, return payment) and the batch sheets: amount, date,
 * method, bank/cash account and reference. Validation lives in
 * validateMoney() (sales-workflow.ts); this component only renders inputs.
 */

import { Input } from "@/components/ui/input";
import { AmountInput } from "@/shared/ui/amount-input";
import { Field, selectClass } from "./sales-ui";
import { moneyDocMeta, RECEIPT_ACCOUNTS, RECEIPT_METHODS } from "../model/sales-constants";
import type { FieldErrors, MoneyInput } from "../model/sales-workflow";

/** True for documents where money comes in (receipt, return payment). */
export const isIncoming = (type: MoneyInput["type"]) => type === "Receipt" || type === "Return payment";

export function PaymentFields({
  payment,
  errors,
  onChange,
  showAmount = true,
  amountHint,
}: {
  payment: Pick<MoneyInput, "type" | "amount" | "date" | "method" | "account" | "reference">;
  errors: FieldErrors;
  onChange: (patch: Partial<MoneyInput>) => void;
  showAmount?: boolean;
  amountHint?: string;
}) {
  const incoming = isIncoming(payment.type);
  return (
    <>
      {showAmount ? (
        <Field label={moneyDocMeta(payment.type).amountLabel} required error={errors.amount} hint={amountHint}>
          <AmountInput
            value={payment.amount || ""}
            placeholder="0.00"
            aria-invalid={Boolean(errors.amount)}
            onValueChange={(_, amount) => onChange({ amount })}
          />
        </Field>
      ) : null}
      <Field label="Date" required error={errors.date}>
        <Input type="date" value={payment.date} aria-invalid={Boolean(errors.date)} onChange={(event) => onChange({ date: event.target.value })} />
      </Field>
      <Field label="Payment method" required error={errors.method}>
        <select className={selectClass} value={payment.method} onChange={(event) => onChange({ method: event.target.value })}>
          {RECEIPT_METHODS.map((method) => <option key={method}>{method}</option>)}
        </select>
      </Field>
      {payment.method !== "Cash" ? (
        <Field label={incoming ? "Received into" : "Paid from"}>
          <select className={selectClass} value={payment.account} onChange={(event) => onChange({ account: event.target.value })}>
            {RECEIPT_ACCOUNTS.map((account) => <option key={account}>{account}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Reference / transaction ID" required={payment.method !== "Cash"} error={errors.reference}>
        <Input
          value={payment.reference}
          placeholder={payment.method === "Cheque" ? "Cheque number" : "e.g. IBFT 88231"}
          aria-invalid={Boolean(errors.reference)}
          onChange={(event) => onChange({ reference: event.target.value })}
        />
      </Field>
    </>
  );
}
