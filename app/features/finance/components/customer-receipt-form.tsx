"use client";

import { cloneElement, useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { decimal, decimalText, type SubledgerOperation, type SubledgerWorkspace } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkForm } from "@/shared/ui/work-form";
import { workSelectClass } from "@/shared/ui/work-table";

export type ReceiptSaveAction = "print" | "new" | "close";

/** Explicit inline rows keep all three groups aligned at desktop widths. */
function ReceiptField({
  label,
  children,
  wide = false,
}: {
  label: string;
  children: ReactElement<{ id?: string }>;
  wide?: boolean;
}) {
  const id = useId();
  return (
    <div
      className={`grid min-w-0 gap-1.5 sm:items-start sm:gap-x-3 ${wide ? "sm:grid-cols-[9rem_minmax(0,1fr)]" : "sm:grid-cols-[6.5rem_minmax(0,1fr)]"}`}
    >
      <label htmlFor={id} className="pt-2.5 text-sm leading-tight text-foreground">
        {label}
      </label>
      {cloneElement(children, { id })}
    </div>
  );
}

type Props = {
  data: SubledgerWorkspace;
  party: string;
  bank: string;
  date: string;
  reference: string;
  amount: string;
  fee: string;
  notes: string;
  allocations: Record<string, string>;
  busy: boolean;
  canManage: boolean;
  contextFields: ReactNode;
  onParty: (value: string) => void;
  onBank: (value: string) => void;
  onDate: (value: string) => void;
  onReference: (value: string) => void;
  onAmount: (value: string) => void;
  onFee: (value: string) => void;
  onNotes: (value: string) => void;
  onAllocate: (id: string, value: string) => void;
  onSave: (action: ReceiptSaveAction) => Promise<SubledgerOperation | undefined>;
  onOffset: () => void;
  onCancel: () => void;
};

export function CustomerReceiptForm(props: Props) {
  const { api } = useSession();
  const { data, party, bank, amount, allocations, busy } = props;
  const [address, setAddress] = useState<{ party: string; value: string } | null>(null);
  useEffect(() => {
    if (!party) return;
    let active = true;
    api.getCustomerMaster(party, data.company_id).then(
      (customer) => {
        if (active) setAddress({ party, value: customer.address });
      },
      () => {
        if (active) setAddress({ party, value: "Mailing address could not be loaded." });
      },
    );
    return () => {
      active = false;
    };
  }, [api, data.company_id, party]);
  const selectedBank = data.banks.find((item) => item.id === bank);
  const items = party
    ? data.items.filter((item) => item.party_id === party && !/^0(?:\.0*)?$/.test(item.outstanding))
    : [];
  const scale =
    data.currencies.find((item) => item.code === selectedBank?.currency)?.decimal_places ?? data.base_decimal_places;
  const totals = new Map<string, { open: bigint; receipt: bigint; scale: number }>();
  let valid = true;
  for (const item of items) {
    const total = totals.get(item.currency) ?? { open: 0n, receipt: 0n, scale: item.decimal_places };
    total.open += decimal(item.outstanding, item.decimal_places, true);
    try {
      total.receipt += decimal(allocations[item.id] || "0", item.decimal_places);
    } catch {
      valid = false;
    }
    totals.set(item.currency, total);
  }
  let unallocated = "\u2014";
  if (selectedBank && valid && [...totals.keys()].every((code) => code === selectedBank.currency)) {
    try {
      unallocated = decimalText(
        decimal(amount || "0", scale) - (totals.get(selectedBank.currency)?.receipt ?? 0n),
        scale,
      );
    } catch {
      /* Editable amount is validated on save. */
    }
  }
  const [printed, setPrinted] = useState<SubledgerOperation | null>(null);
  const printedInput = printed?.input.type === "settlement" ? printed.input : null;
  const saving = useRef(false);
  useEffect(() => {
    if (!printed) return;
    const frame = requestAnimationFrame(() => window.print());
    return () => cancelAnimationFrame(frame);
  }, [printed]);
  async function save(action: ReceiptSaveAction) {
    if (saving.current || busy || !props.canManage) return;
    saving.current = true;
    try {
      const operation = await props.onSave(action);
      if (operation && action === "print") setPrinted(operation);
    } finally {
      saving.current = false;
    }
  }
  const unavailable = "Unavailable for live customer settlements";
  return (
    <>
      <WorkForm
        aria-label="Customer receipt form"
        data-receipt-form
        className="grid min-w-0 gap-5 rounded-md border border-border bg-card px-3 pb-5 pt-0 sm:px-4 [&[data-receipt-form]_thead_th]:bg-primary! [&[data-receipt-form]_thead_th]:text-primary-foreground! [&[data-receipt-form]>h2]:text-2xl! [&[data-receipt-form]>h2]:font-normal! [&[data-receipt-form]_footer_button]:rounded-full! [&[data-receipt-form]_footer_select]:rounded-full!"
        onSubmit={(event) => {
          event.preventDefault();
          const native = event.nativeEvent;
          const submitter = native instanceof SubmitEvent ? native.submitter : null;
          const action = submitter instanceof HTMLButtonElement ? submitter.value : "new";
          void save(action === "print" || action === "close" ? action : "new");
        }}
      >
        <h2 className="m-0 border-b border-border py-3 text-2xl! font-normal!">Add Receipts</h2>
        <fieldset disabled={busy} className="m-0 grid min-w-0 gap-5 border-0 p-0 lg:grid-cols-[1.25fr_1fr_1.15fr]">
          <div className="grid content-start gap-3">
            <ReceiptField label="Customer *">
              <select
                required
                className={workSelectClass}
                value={party}
                onChange={(event) => props.onParty(event.target.value)}
              >
                <option value="">Select customer</option>
                {data.parties
                  .filter((item) => item.kind === "customer")
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.code} / {item.name}
                    </option>
                  ))}
              </select>
            </ReceiptField>
            <ReceiptField label="Mailing Address">
              <Textarea
                readOnly
                className="min-h-24! bg-muted!"
                value={!party ? "" : address?.party === party ? address.value : "Loading mailing address..."}
              />
            </ReceiptField>
          </div>
          <div className="grid content-start gap-3">
            <ReceiptField label="Bank *">
              <select
                aria-label="Bank account"
                required
                className={workSelectClass}
                value={bank}
                onChange={(event) => props.onBank(event.target.value)}
              >
                <option value="">Select bank</option>
                {data.banks.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name} / {item.currency}
                  </option>
                ))}
              </select>
            </ReceiptField>
            <ReceiptField label="Date *">
              <Input required type="date" value={props.date} onChange={(event) => props.onDate(event.target.value)} />
            </ReceiptField>
            <ReceiptField label="Amount *">
              <Input
                required
                inputMode="decimal"
                className="text-right tabular-nums"
                placeholder="0.00"
                value={amount}
                onChange={(event) => props.onAmount(event.target.value)}
              />
            </ReceiptField>
            <ReceiptField label="WHT Rate">
              <select className={workSelectClass} disabled>
                <option>Select WHT Rate</option>
              </select>
            </ReceiptField>
          </div>
          <div className="grid content-start gap-3">
            <ReceiptField label="Mode" wide>
              <select className={workSelectClass} disabled title={unavailable}>
                <option>Select Mode</option>
              </select>
            </ReceiptField>
            <ReceiptField label="Ref. No." wide>
              <Input
                maxLength={160}
                value={props.reference}
                onChange={(event) => props.onReference(event.target.value)}
              />
            </ReceiptField>
            <ReceiptField label="Unallocated Balance" wide>
              <Input
                readOnly
                className="bg-muted! text-right tabular-nums"
                value={!bank && !amount ? "0.00" : unallocated}
                title={
                  unallocated === "\u2014"
                    ? "Calculated on draft review for cross-currency allocations."
                    : "Allocate the full amount before saving."
                }
              />
            </ReceiptField>
            <ReceiptField label="Additional WHT" wide>
              <Input disabled value="0.00" className="text-right" title={unavailable} />
            </ReceiptField>
          </div>
        </fieldset>
        <div className="min-w-0 overflow-x-auto">
          <table
            aria-label="Outstanding Invoices"
            className="w-full min-w-[1000px] border-collapse text-sm [&_th]:border-r [&_th]:border-border [&_td]:border-r [&_td]:border-border"
          >
            <caption className="pb-2 text-left text-base! font-normal!">Outstanding Invoices</caption>
            <thead className="bg-primary text-primary-foreground">
              <tr>
                {[
                  "Date",
                  "Doc No.",
                  "Inv. No.",
                  "Due Date",
                  "Original Amount",
                  "Open Balance",
                  "Discount",
                  "Receipt",
                  "Total",
                ].map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap bg-primary! px-2 py-3 text-left font-semibold text-primary-foreground! last:border-r-0"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {!items.length ? (
                <tr>
                  <td colSpan={9} className="border-b border-border p-4 text-center">
                    {party ? "No outstanding invoices available." : "No data available in table"}
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr key={item.id} className="border-t border-border [&>td]:p-3">
                    <td>{item.date}</td>
                    <td className="font-mono">{item.code}</td>
                    <td>{item.kind === "invoice" ? item.code : "\u2014"}</td>
                    <td>{item.due_date}</td>
                    <td className="text-right tabular-nums">
                      {item.currency} {item.original_amount}
                    </td>
                    <td className="text-right tabular-nums">
                      {item.currency} {item.outstanding}
                    </td>
                    <td className="text-right" title={unavailable}>
                      {"\u2014"}
                    </td>
                    <td>
                      <Input
                        aria-label={`Allocate ${item.code}`}
                        disabled={busy || !props.canManage}
                        inputMode="decimal"
                        className="min-w-28 text-right"
                        value={allocations[item.id] ?? ""}
                        onChange={(event) => props.onAllocate(item.id, event.target.value)}
                      />
                    </td>
                    <td className="text-right tabular-nums">
                      {item.currency} {allocations[item.id] || "0"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            <tfoot className="border-y border-border">
              {!totals.size ? (
                <tr>
                  <th className="bg-card! px-2 py-3 text-left font-normal text-foreground!">Total</th>
                  <td />
                  <td />
                  <td />
                  <td />
                  {[0, 1, 2, 3].map((key) => (
                    <td key={key} className="px-2 py-3 text-right tabular-nums">
                      0.00
                    </td>
                  ))}
                </tr>
              ) : (
                [...totals].map(([code, total]) => (
                  <tr key={code}>
                    <th colSpan={5} className="p-3 text-left">
                      Total {code}
                    </th>
                    <td className="p-3 text-right tabular-nums">{decimalText(total.open, total.scale)}</td>
                    <td className="p-3 text-right">{"\u2014"}</td>
                    <td className="p-3 text-right tabular-nums">
                      {valid ? decimalText(total.receipt, total.scale) : "\u2014"}
                    </td>
                    <td className="p-3 text-right tabular-nums">
                      {valid ? decimalText(total.receipt, total.scale) : "\u2014"}
                    </td>
                  </tr>
                ))
              )}
            </tfoot>
          </table>
        </div>
        <div className="grid gap-1.5 lg:w-1/2">
          <label htmlFor="receipt-notes" className="text-sm">
            Notes *
          </label>
          <Textarea
            id="receipt-notes"
            required
            disabled={busy}
            minLength={3}
            maxLength={500}
            className="min-h-32!"
            value={props.notes}
            onChange={(event) => props.onNotes(event.target.value)}
          />
        </div>
        <details className="text-sm print:hidden">
          <summary className="w-fit cursor-pointer text-muted-foreground">Accounting options</summary>
          <div className="mt-3 grid gap-3 lg:grid-cols-3">
            <ReceiptField label="Currency">
              <Input readOnly value={selectedBank?.currency ?? ""} placeholder="Selected from bank" />
            </ReceiptField>
            <ReceiptField label="Bank fee">
              <Input
                required
                disabled={busy}
                inputMode="decimal"
                value={props.fee}
                onChange={(event) => props.onFee(event.target.value)}
              />
            </ReceiptField>
            {props.contextFields}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Withholding and discount are unavailable for customer settlement drafts.
          </p>
          <Button
            type="button"
            variant="outline"
            className="mt-2"
            disabled={busy || !props.canManage || !party}
            onClick={props.onOffset}
          >
            Save credit offset draft
          </Button>
        </details>
        <p className="text-xs text-muted-foreground">
          Save a draft to review calculated amounts and submit for independent approval. Amounts cleared are entered in
          the original invoice currency. Showing up to 50 open items.
        </p>
        <footer className="mt-1 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5 print:hidden">
          <Button
            type="button"
            variant="outline"
            className="min-w-28 rounded-full!"
            disabled={busy}
            onClick={props.onCancel}
          >
            Cancel
          </Button>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <select aria-label="Receipt print format" className={`${workSelectClass} w-52! min-w-44! rounded-full!`}>
              <option>SR Detailed</option>
            </select>
            {(
              [
                ["print", "Save and Print"],
                ["new", "Save and New"],
                ["close", "Save and Close"],
              ] as const
            ).map(([action, label]) => (
              <Button
                key={action}
                type="submit"
                name="receipt-action"
                value={action}
                className="min-w-32 rounded-full! px-5"
                disabled={busy || !props.canManage || !party || !selectedBank}
              >
                {label}
              </Button>
            ))}
          </div>
        </footer>
      </WorkForm>
      {printed && printedInput ? (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) setPrinted(null);
          }}
        >
          <DialogContent
            data-print-viewer
            overlayClassName="z-[1599]"
            className="z-[1600] max-h-[90vh] overflow-auto sm:max-w-3xl print:fixed! print:inset-0! print:m-0! print:w-full! print:max-w-none! print:max-h-none! print:translate-none! print:transform-none! print:overflow-visible! print:bg-card! print:visible! print:[&_*]:visible!"
            showCloseButton={false}
          >
            <DialogTitle className="sr-only">Receipt draft print preview</DialogTitle>
            <DialogDescription className="sr-only">
              Saved receipt draft. Review and print; independent approval is still required.
            </DialogDescription>
            <article
              data-print-sheet
              className="mx-auto max-w-3xl bg-card p-6 text-foreground print:relative! print:inset-auto! print:mx-0! print:max-w-none!"
            >
              <div className="flex justify-end gap-2 print:hidden">
                <Button type="button" variant="outline" onClick={() => window.print()}>
                  Print
                </Button>
                <Button type="button" variant="outline" onClick={() => setPrinted(null)}>
                  Close preview
                </Button>
              </div>
              <h1 className="text-2xl font-semibold">Receipt {printed.code}</h1>
              <p className="mt-2 font-semibold">Draft - pending review and approval</p>
              <dl className="my-5 grid grid-cols-2 gap-2 text-sm">
                <dt>Date</dt>
                <dd>{printed.date}</dd>
                <dt>Customer</dt>
                <dd>{data.parties.find((item) => item.id === printedInput.party_id)?.name ?? party}</dd>
                <dt>Bank</dt>
                <dd>{selectedBank?.name}</dd>
                <dt>Amount</dt>
                <dd>
                  {printedInput.payment_currency} {printedInput.payment_amount}
                </dd>
                <dt>Reference</dt>
                <dd>{printedInput.reference}</dd>
              </dl>
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-border p-2 text-left">Invoice</th>
                    <th className="border-b border-border p-2 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody>
                  {printedInput.allocations.map((allocation) => {
                    const item = data.items.find((candidate) => candidate.id === allocation.item_id);
                    return (
                      <tr key={allocation.item_id}>
                        <td className="border-b border-border p-2">{item?.code ?? allocation.item_id}</td>
                        <td className="border-b border-border p-2 text-right">
                          {item?.currency} {allocation.amount}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="mt-5 whitespace-pre-wrap text-sm">{printedInput.reason}</p>
            </article>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
