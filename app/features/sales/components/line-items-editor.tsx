"use client";

/**
 * Products & services lines shared by the quotation / sales order / invoice
 * form and the recurring invoice template form, so both edit lines the same way.
 */

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/shared/ui/amount-input";
import { currencyDigits } from "@/shared/constants/countries";
import { cn } from "cn";
import { selectClass, tableClass } from "./sales-ui";
import { BASE_CURRENCY } from "../model/sales-currency";
import { SALES_CATALOG } from "../model/sales-constants";
import { blankLine, lineAmount } from "../model/sales-workflow";
import type { SalesLine } from "../model/sales-types";

export function LineItemsEditor({
  lines,
  onChange,
  currency,
  fxRate,
  error,
  formatAmount,
}: {
  lines: readonly SalesLine[];
  /** Receives the whole updated list; the caller clears its line error. */
  onChange: (update: (lines: SalesLine[]) => SalesLine[]) => void;
  /** Document currency; catalogue prices (PKR) convert at fxRate. */
  currency: string;
  fxRate: number;
  error?: string;
  formatAmount: (value: number) => string;
}) {
  const updateLine = (index: number, patch: Partial<SalesLine>) =>
    onChange((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));

  const chooseItem = (index: number, sku: string) => {
    const item = SALES_CATALOG.find((candidate) => candidate.sku === sku);
    // The price list is in PKR; a foreign-currency document converts it at the entered rate.
    const rate = item && fxRate > 0 ? Number((item.rate / fxRate).toFixed(currencyDigits(currency))) : 0;
    updateLine(index, item ? { sku, desc: item.name, rate, tax: item.tax, uom: item.uom } : { sku: "", uom: "Each" });
  };

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">{currency === BASE_CURRENCY
            ? "Prices come from the Standard price list."
            : `Prices come from the Standard price list (PKR), converted to ${currency} at the exchange rate.`}{" "}
          Sales tax: 18% goods, 16% services.</span>
        <Button type="button" size="sm" variant="outline" onClick={() => onChange((current) => [...current, blankLine()])}>
          + Add line
        </Button>
      </div>
      {error ? <p className="mt-0 mb-2 text-xs font-semibold text-[var(--nx-danger)]">{error}</p> : null}
      <div className="relative overflow-x-auto">
        <table className={cn(tableClass, "min-w-210 [&_td]:px-2 [&_td]:py-1.5 [&_th]:px-2")}>
          <thead>
            <tr>
              <th>#</th>
              <th>Product / service</th>
              <th>Description</th>
              <th className="text-right!">Qty</th>
              <th>Unit</th>
              <th className="text-right!">Rate</th>
              <th className="text-right!">Tax %</th>
              <th className="text-right!">Amount</th>
              <th><span className="sr-only">Remove</span></th>
            </tr>
          </thead>
          <tbody>
            {lines.length ? (
              lines.map((item, index) => (
                <tr key={index}>
                  <td className="text-muted-foreground">{index + 1}</td>
                  <td className="min-w-55">
                    <select className={cn(selectClass, "h-8.5")} value={item.sku} aria-label={`Product, line ${index + 1}`} onChange={(event) => chooseItem(index, event.target.value)}>
                      <option value="">Other charge</option>
                      {SALES_CATALOG.map((option) => <option key={option.sku} value={option.sku}>{option.sku} · {option.name}</option>)}
                    </select>
                  </td>
                  <td className="min-w-45">
                    <Input className="h-8.5" value={item.desc} aria-label={`Description, line ${index + 1}`} onChange={(event) => updateLine(index, { desc: event.target.value })} />
                  </td>
                  <td className="w-22">
                    <Input className="h-8.5 text-right" type="number" min={0} step={1} value={item.qty} aria-label={`Quantity, line ${index + 1}`} onChange={(event) => updateLine(index, { qty: Number(event.target.value) })} />
                  </td>
                  <td className="text-muted-foreground">{item.uom || "Each"}</td>
                  <td className="w-32">
                    <AmountInput className="h-8.5" value={item.rate} aria-label={`Rate, line ${index + 1}`} onValueChange={(_, rate) => updateLine(index, { rate })} />
                  </td>
                  <td className="w-20">
                    <Input className="h-8.5 text-right" type="number" min={0} max={100} step={1} value={item.tax} aria-label={`Tax percent, line ${index + 1}`} onChange={(event) => updateLine(index, { tax: Number(event.target.value) })} />
                  </td>
                  <td className="text-right font-semibold tabular-nums whitespace-nowrap">{formatAmount(lineAmount(item))}</td>
                  <td>
                    <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove line ${index + 1}`} onClick={() => onChange((current) => current.filter((_, i) => i !== index))}>
                      <X />
                    </Button>
                  </td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={9} className="text-muted-foreground">No lines. Use + Add line.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
