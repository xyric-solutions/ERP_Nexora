"use client";
import { WorkFormLayout } from "@/shared/ui/work-form";

import type { ReactNode } from "react";
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
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PurchaseFormField as LabeledField } from "./purchase-form-field";
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
  value: savedValue,
  bills,
  suppliers,
  options,
  disabled,
  onChange,
  approver,
  supplier,
  onTermsChange,
  onEnableDetails,
  onGrossChange,
  onBankChange,
}: {
  input: SavePurchaseRequest;
  value: PurchasePaymentDetails | null;
  bills: PurchaseDocument[];
  suppliers: Supplier[];
  options: ProcurementOptions;
  disabled: boolean;
  onChange: (value: PurchasePaymentDetails) => void;
  approver: ReactNode;
  supplier: ReactNode;
  onTermsChange: (patch: Partial<SavePurchaseRequest>) => void;
  onEnableDetails: () => void;
  onGrossChange: (supplier: string) => void;
  onBankChange: (bankAccountId: string) => void;
}) {
  const value: PurchasePaymentDetails = savedValue ?? { bank_account_id: "", entries: [] };
  const addresses = savedValue?.entries ?? paymentEntries(input, bills, suppliers);
  const eligibleBanks = (options.bank_accounts ?? []).filter((bank) =>
    options.currencies.some((currency) => currency.code === bank.currency),
  );
  function entryChange(index: number, patch: Partial<PurchasePaymentEntry>) {
    onChange({ ...value, entries: value.entries.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)) });
  }
  return (
    <WorkFormLayout><section aria-label="Payment details" className="min-w-0 overflow-hidden rounded-xl border border-border bg-card">
      <h2 className="m-0 px-4 pt-4 text-base font-semibold">Payment details</h2>
      <div className="grid min-w-0 gap-4 p-4 lg:grid-cols-5 lg:gap-6">
        <fieldset
          aria-label="Supplier and approval"
          disabled={disabled}
          className="m-0 grid min-w-0 content-start gap-3 border-0 p-0 sm:grid-cols-2 lg:col-span-2"
        >
          {approver}
          {supplier}
          <div className="grid min-w-0 gap-4 sm:col-span-2">
            {addresses.map((entry) => {
              const vendor = suppliers.find((item) => item.id === entry.supplier_id);
              const name =
                entry.supplier_name ??
                vendor?.name ??
                bills.find((bill) => bill.supplier_id === entry.supplier_id)?.supplier_name ??
                "Supplier";
              return (
                <div key={entry.supplier_id} className="grid min-w-0 gap-2">
                  {input.kind === "multi_payment" ? (
                    <h3 className="m-0 text-sm font-semibold">
                      {entry.supplier_code ?? vendor?.code} · {name}
                    </h3>
                  ) : null}
                  <LabeledField label="Mailing address">
                    <Textarea
                      readOnly
                      rows={3}
                      value={entry.mailing_address ?? (vendor ? supplierMailingAddress(vendor) : "")}
                      className="min-h-24! resize-y"
                    />
                  </LabeledField>
                </div>
              );
            })}
            {!addresses.length ? (
              <p className="m-0 text-sm text-muted-foreground">
                {input.kind === "multi_payment"
                  ? "Select bills below to add suppliers to this payment."
                  : "Select a supplier to show its mailing address and bills."}
              </p>
            ) : null}
          </div>
        </fieldset>
        <fieldset
          aria-label="Dates and bank details"
          disabled={disabled}
          className="m-0 grid min-w-0 content-start gap-3 border-0 p-0 lg:col-span-3"
        >
          <div className="grid min-w-0 gap-3">
            <LabeledField label="Document date *">
              <Input
                required
                type="date"
                value={input.document_date}
                onChange={(event) => onTermsChange({ document_date: event.target.value })}
              />
            </LabeledField>
            {savedValue ? (
              <div className="grid min-w-0 gap-1.5 sm:grid-cols-[7rem_minmax(0,1fr)] sm:items-center sm:gap-x-3">
                <span className="text-sm font-medium">Bank *</span>
                <SearchableSelect
                  label="Bank *"
                  required
                  disabled={disabled}
                  value={value.bank_account_id}
                  placeholder="Select company bank account"
                  options={[
                    ...eligibleBanks.map((bank) => ({
                      value: bank.id,
                      label: `${bank.account_name}${bank.account_number_masked ? ` · ${bank.account_number_masked}` : ""} · ${bank.currency}`,
                    })),
                    ...(value.bank_account_id && !eligibleBanks.some((bank) => bank.id === value.bank_account_id)
                      ? [
                          {
                            value: value.bank_account_id,
                            label: `${value.bank_account_name ?? "Saved bank account"} · unavailable`,
                            disabled: true,
                          },
                        ]
                      : []),
                  ]}
                  onValueChange={onBankChange}
                />
                {!eligibleBanks.length ? (
                  <p className="m-0 text-xs text-muted-foreground">No eligible company bank account is available.</p>
                ) : null}
              </div>
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
                  className="grid min-w-0 gap-3"
                >
                  {input.kind === "multi_payment" ? (
                    <h3 className="m-0 text-sm font-semibold">
                      {supplier?.code ? `${supplier.code} · ` : ""}
                      {name}
                    </h3>
                  ) : null}
                  <div className="grid min-w-0 items-start gap-3 sm:grid-cols-2">
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
                        onChange={(event) => {
                          onGrossChange(entry.supplier_id);
                          entryChange(index, { amount: event.target.value });
                        }}
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
                      <Input
                        readOnly
                        aria-label={`Unallocated balance ${index + 1}`}
                        value={summary?.unallocated ?? "—"}
                      />
                    </LabeledField>
                  </div>
                  <div
                    className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-lg bg-accent px-4 py-3 text-sm tabular-nums"
                    aria-live="polite"
                  >
                    <span>WHT: {summary?.wht ?? "—"}</span>
                    <span className="font-semibold">
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
            <div className="grid gap-2">
              <p className="m-0 text-sm text-muted-foreground">
                {savedValue
                  ? "Select a supplier and bills to enter payment amounts."
                  : "Bank and withholding details were not recorded on this instruction."}
              </p>
              {!savedValue && !disabled ? (
                <Button type="button" variant="outline" onClick={onEnableDetails}>
                  Add bank and WHT details
                </Button>
              ) : null}
            </div>
          )}
          {savedValue ? (
            <p className="m-0 text-xs text-muted-foreground">
              Enter the applicable WHT percentage of the gross amount. WHT rounds to two decimals; additional WHT is
              deducted separately.
            </p>
          ) : null}
        </fieldset>
      </div>
    </section></WorkFormLayout>
  );
}
