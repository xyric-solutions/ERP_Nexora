/**
 * Document currency for the sales prototype.
 *
 * Quotations, orders, invoices and receipt documents carry their own ISO 4217
 * currency and an exchange rate to the base currency (PKR). Amounts on a
 * document stay in its currency; customer-level figures (credit limit,
 * opening balance, exposure, open balance, money on account) are in PKR and
 * convert each document at its own rate. Records saved before currencies
 * existed have neither field and count as PKR.
 */

import { BASE_CURRENCY, money } from "./sales-format";

export { BASE_CURRENCY };

interface HasCurrency {
  currency?: string;
  fxRate?: number;
}

export const docCurrency = (doc: HasCurrency | undefined): string => doc?.currency || BASE_CURRENCY;

export const isForeign = (doc: HasCurrency | undefined) => docCurrency(doc) !== BASE_CURRENCY;

/** PKR per 1 unit of the document currency; 1 for PKR, 0 when a foreign rate is missing. */
export function docRate(doc: HasCurrency | undefined): number {
  if (!isForeign(doc)) return 1;
  const rate = Number(doc?.fxRate);
  return rate > 0 ? rate : 0;
}

/** Converts an amount in the document currency to PKR at the document rate. */
export function toBase(amount: number, doc: HasCurrency | undefined): number {
  return Math.round((Number(amount) || 0) * docRate(doc) * 100) / 100;
}

/** Formats an amount in the document's currency. */
export const docMoney = (amount: number, doc: HasCurrency | undefined) => money(amount, docCurrency(doc));

/** "PKR", or "USD · 1 USD = PKR 280.5" for a foreign-currency document. */
export function currencySummary(doc: HasCurrency | undefined): string {
  const currency = docCurrency(doc);
  return isForeign(doc) ? `${currency} · 1 ${currency} = PKR ${docRate(doc).toLocaleString("en-US", { maximumFractionDigits: 6 })}` : currency;
}

/** Currency and rate for a new document: the customer's preferred currency, rate to be entered when foreign. */
export function currencyDefaults(currency: string | undefined): Required<HasCurrency> {
  const code = currency || BASE_CURRENCY;
  return { currency: code, fxRate: code === BASE_CURRENCY ? 1 : 0 };
}

/** Normalized currency fields for saving: rate 1 for PKR, otherwise rounded to 6 places. */
export function normalizeCurrency(doc: HasCurrency): Required<HasCurrency> {
  const currency = docCurrency(doc);
  return { currency, fxRate: currency === BASE_CURRENCY ? 1 : Math.round((Number(doc.fxRate) || 0) * 1e6) / 1e6 };
}

/** Error text when a foreign-currency document has no usable exchange rate. */
export function fxRateError(doc: HasCurrency): string | undefined {
  return isForeign(doc) && !(Number(doc.fxRate) > 0) ? `Enter the exchange rate: PKR per 1 ${docCurrency(doc)}.` : undefined;
}
