"use client";

/**
 * Currency and exchange-rate fields shared by the quotation / sales order /
 * invoice form and the Receipts forms. Any active ISO 4217 currency can be
 * chosen; a currency other than PKR needs the rate (PKR per 1 unit), which
 * converts the document for customer balances and credit limits.
 *
 * Prototype: the rate is entered by hand. The live flow should default it
 * from the Finance currency rates API for the document date.
 */

import { useMemo } from "react";
import { AmountInput } from "@/shared/ui/amount-input";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { CURRENCIES, currencyLabel } from "@/shared/constants/countries";
import { Field, ReadField } from "./sales-ui";
import { BASE_CURRENCY } from "../model/sales-currency";
import { figure } from "../model/sales-format";
import type { FieldErrors } from "../model/sales-workflow";

export interface CurrencyValue {
  currency: string;
  fxRate: number;
}

const OPTIONS = CURRENCIES.map(([code, name]) => ({ value: code, label: `${code} · ${name}` }));

export function CurrencyFields({
  value,
  errors,
  onChange,
  disabled = false,
  hint,
  /** Amount in the document currency, shown converted to PKR under the rate. */
  amount,
}: {
  value: CurrencyValue;
  errors: FieldErrors;
  onChange: (patch: CurrencyValue) => void;
  disabled?: boolean;
  hint?: string;
  amount?: number;
}) {
  // Keep PKR, the base currency, at the top of the list.
  const options = useMemo(() => [...OPTIONS.filter((item) => item.value === BASE_CURRENCY), ...OPTIONS.filter((item) => item.value !== BASE_CURRENCY)], []);
  const foreign = value.currency !== BASE_CURRENCY;
  const choose = (currency: string) => {
    if (!currency || currency === value.currency) return;
    onChange({ currency, fxRate: currency === BASE_CURRENCY ? 1 : 0 });
  };
  return (
    <>
      {disabled ? (
        <ReadField label="Currency">{currencyLabel(value.currency)}</ReadField>
      ) : (
        <Field label="Currency" required error={errors.currency} hint={hint}>
          <SearchableSelect
            label="Currency"
            value={value.currency}
            options={options}
            onValueChange={choose}
            invalid={Boolean(errors.currency)}
            placeholder="Choose currency"
            searchLabel="Search currencies"
            searchPlaceholder="Search by code or name, e.g. USD or Dirham…"
          />
        </Field>
      )}
      {foreign ? (
        <Field
          label={`Exchange rate · PKR per 1 ${value.currency}`}
          required
          error={errors.fxRate}
          hint={amount && value.fxRate > 0 ? `≈ PKR ${figure(amount * value.fxRate)} in the base currency.` : "Converts this document to PKR for balances and credit limits."}
        >
          <AmountInput
            decimals={6}
            value={value.fxRate || ""}
            placeholder="e.g. 280.50"
            aria-invalid={Boolean(errors.fxRate)}
            onValueChange={(_, fxRate) => onChange({ currency: value.currency, fxRate })}
          />
        </Field>
      ) : null}
    </>
  );
}
