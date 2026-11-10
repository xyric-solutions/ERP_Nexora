"use client";

import {
  money,
  paymentTotals,
  supplierMailingAddress,
  scaled,
  type ProcurementOptions,
  type PurchaseDocument,
  type PurchasePaymentDetails,
  type PurchasePaymentEntry,
  type SavePurchaseRequest,
  type Supplier,
} from "@nexora/contracts";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";
import { SearchableSelect } from "@/shared/ui/searchable-select";
import { purchaseSelectClass } from "../model/purchase-workflow";

export function paymentEntries(
  input: SavePurchaseRequest,
  bills: PurchaseDocument[],
  suppliers: Supplier[],
): PurchasePaymentEntry[] {
  const ids =
    input.kind === "payment"
      ? input.supplier_id
        ? [input.supplier_id]
        : []
      : [
          ...new Set(
            input.allocations.flatMap((allocation) => {
              const supplier = bills.find((bill) => bill.id === allocation.bill_id)?.supplier_id;
              return supplier ? [supplier] : [];
            }),
          ),
        ];
  return ids.map(
    (supplier_id) =>
      input.payment_details?.entries.find((entry) => entry.supplier_id === supplier_id) ?? {
        supplier_id,
        amount: allocatedToSupplier(input, bills, supplier_id),
        mode: "bank_transfer",
        reference: "",
        wht_rate: "0",
        additional_wht: "0.00",
        mailing_address: (() => {
          const supplier = suppliers.find((item) => item.id === supplier_id);
          return supplier ? supplierMailingAddress(supplier) : "";
        })(),
      },
  );
}
function allocatedToSupplier(input: SavePurchaseRequest, bills: PurchaseDocument[], supplier: string) {
  try {
    return money(
      input.allocations.reduce(
        (sum, allocation) =>
          sum +
          (bills.find((bill) => bill.id === allocation.bill_id)?.supplier_id === supplier
            ? scaled(allocation.amount, 2)
            : 0n),
        0n,
      ),
    );
  } catch {
    return "0.00";
  }
}

export function PurchasePaymentDetailsForm({
  input,
  value,
  bills,
  suppliers,
  options,
  disabled,
  onChange,
}: {
  input: SavePurchaseRequest;
  value: PurchasePaymentDetails;
  bills: PurchaseDocument[];
  suppliers: Supplier[];
  options: ProcurementOptions;
  disabled: boolean;
  onChange: (value: PurchasePaymentDetails) => void;
}) {
  function entryChange(index: number, patch: Partial<PurchasePaymentEntry>) {
    onChange({ ...value, entries: value.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
  }
  return (
    <fieldset disabled={disabled} className="m-0 grid min-w-0 gap-3 rounded-lg border border-border bg-card p-3">
      <legend className="px-1 text-sm font-semibold">Bank and payment details</legend>
      <div className="grid min-w-0 gap-1.5 sm:max-w-lg">
        <span className="text-sm font-medium">Bank *</span>
        <SearchableSelect
          label="Bank *"
          required
          disabled={disabled}
          value={value.bank_account_id}
          placeholder="Select company bank account"
          options={[
            ...(options.bank_accounts ?? [])
              .filter((bank) => bank.currency === input.currency)
              .map((bank) => ({
                value: bank.id,
                label: `${bank.account_name}${bank.account_number_masked ? ` · ${bank.account_number_masked}` : ""} · ${bank.currency}`,
              })),
            ...(value.bank_account_id &&
            !(options.bank_accounts ?? []).some(
              (bank) => bank.id === value.bank_account_id && bank.currency === input.currency,
            )
              ? [
                  {
                    value: value.bank_account_id,
                    label: `${value.bank_account_name ?? "Saved bank account"} · unavailable`,
                    disabled: true,
                  },
                ]
              : []),
          ]}
          onValueChange={(bank_account_id) => onChange({ ...value, bank_account_id })}
        />
        {!options.bank_accounts?.some((bank) => bank.currency === input.currency) ? (
          <p className="m-0 text-xs text-muted-foreground">
            No eligible company bank account is available in this currency.
          </p>
        ) : null}
      </div>
      {value.entries.length ? (
        value.entries.map((entry, index) => {
          const supplier = suppliers.find((item) => item.id === entry.supplier_id);
          const name =
            entry.supplier_name ??
            supplier?.name ??
            bills.find((bill) => bill.supplier_id === entry.supplier_id)?.supplier_name ??
            "Supplier";
          let summary: ReturnType<typeof paymentTotals> | null = null,
            error = "";
          try {
            summary = paymentTotals(entry, allocatedToSupplier(input, bills, entry.supplier_id));
          } catch (caught) {
            error = caught instanceof Error ? caught.message : "Enter valid payment amounts.";
          }
          return (
            <section
              key={entry.supplier_id}
              aria-label={`Payment details for ${name}`}
              className="grid min-w-0 gap-3 border-t border-border pt-3"
            >
              {input.kind === "multi_payment" ? (
                <h2 className="m-0 text-sm font-semibold">
                  {supplier?.code ? `${supplier.code} · ` : ""}
                  {name}
                </h2>
              ) : null}
              <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <LabeledField label="Mailing address" className="sm:col-span-2">
                  <Textarea
                    readOnly
                    rows={2}
                    value={entry.mailing_address ?? supplier?.address ?? ""}
                    className="min-h-20"
                  />
                </LabeledField>
                <LabeledField label="Mode *">
                  <select
                    aria-label={`Payment mode ${index + 1}`}
                    className={purchaseSelectClass}
                    value={entry.mode}
                    onChange={(event) => {
                      const mode = event.target.value;
                      if (
                        mode === "bank_transfer" ||
                        mode === "cheque" ||
                        mode === "cash" ||
                        mode === "online" ||
                        mode === "standing_order" ||
                        mode === "card"
                      )
                        entryChange(index, { mode });
                    }}
                  >
                    {[
                      ["bank_transfer", "Bank transfer"],
                      ["cheque", "Cheque"],
                      ["cash", "Cash"],
                      ["online", "Online"],
                      ["standing_order", "Standing order"],
                      ["card", "Card"],
                    ].map(([mode, label]) => (
                      <option key={mode} value={mode}>
                        {label}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField label="Ref. No.">
                  <Input
                    aria-label={`Payment reference ${index + 1}`}
                    maxLength={128}
                    value={entry.reference}
                    onChange={(event) => entryChange(index, { reference: event.target.value })}
                  />
                </LabeledField>
                <LabeledField label="Gross amount *">
                  <Input
                    aria-label={`Gross payment amount ${index + 1}`}
                    inputMode="decimal"
                    required
                    value={entry.amount}
                    onChange={(event) => entryChange(index, { amount: event.target.value })}
                  />
                </LabeledField>
                <LabeledField label="WHT rate (%)">
                  <Input
                    aria-label={`WHT rate ${index + 1}`}
                    inputMode="decimal"
                    value={entry.wht_rate}
                    onChange={(event) => entryChange(index, { wht_rate: event.target.value })}
                  />
                </LabeledField>
                <LabeledField label="Additional WHT">
                  <Input
                    aria-label={`Additional WHT ${index + 1}`}
                    inputMode="decimal"
                    value={entry.additional_wht}
                    onChange={(event) => entryChange(index, { additional_wht: event.target.value })}
                  />
                </LabeledField>
                <LabeledField label="Unallocated balance">
                  <Input readOnly aria-label={`Unallocated balance ${index + 1}`} value={summary?.unallocated ?? "—"} />
                </LabeledField>
              </div>
              <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm tabular-nums" aria-live="polite">
                <span>WHT: {summary?.wht ?? "—"}</span>
                <span>
                  Net bank amount: {summary?.net ?? "—"} {input.currency}
                </span>
                {error ? (
                  <span role="alert" className="text-destructive">
                    {error}
                  </span>
                ) : null}
              </div>
            </section>
          );
        })
      ) : (
        <p className="m-0 text-sm text-muted-foreground">Select a supplier and bills to enter payment amounts.</p>
      )}
      <p className="m-0 text-xs text-muted-foreground">
        Enter the applicable WHT percentage of the gross amount. WHT rounds to two decimals; additional WHT is deducted
        separately.
      </p>
    </fieldset>
  );
}
