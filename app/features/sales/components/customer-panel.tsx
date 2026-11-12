"use client";

/**
 * Right-side customer panel: view and edit a customer, change its status
 * and opening balance, then Save. A successful save closes the panel and
 * returns to the Customers list; a failed validation keeps it open.
 *
 * Prototype: saves go to the browser-session sales store (no Customer API yet).
 */

import { useEffect, useRef, useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AmountInput } from "@/shared/ui/amount-input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import { CustomerSectionBody, useCustomerEditor } from "./customer-sections";
import { clickableRow, EntryTabs, Field, rowKeyHandler, salesLayer, StatusPill, tableClass } from "./sales-ui";
import type { SalesNav } from "./sales-nav";
import { CUSTOMER_SECTIONS, onCreditHold } from "../model/customer-model";
import { SALES_KINDS } from "../model/sales-constants";
import { formatDate, moneyWhole } from "../model/sales-format";
import { docMoney } from "../model/sales-currency";
import { useSalesState } from "../model/sales-store";
import { displayStatus, documentTotal, exposure, invoicedBalance } from "../model/sales-workflow";
import type { SalesCustomer } from "../model/sales-types";

const STATUSES = ["Active", "Inactive"] as const;

function RecentDocuments({ customer, nav }: { customer: SalesCustomer; nav: SalesNav }) {
  const state = useSalesState();
  const docs = (["quotation", "order", "invoice"] as const)
    .flatMap((kind) => state[kind].filter((doc) => doc.customerId === customer.id))
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 6);
  return (
    <div className="col-span-full grid gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-muted-foreground">Recent documents</span>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => nav.openNew("quotations", customer.code)}
          disabled={customer.status === "Inactive"}
        >
          + New Quotation
        </Button>
      </div>
      {docs.length ? (
        <div className="relative overflow-x-auto rounded border border-border">
          <table className={tableClass}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Date</th>
                <th className="text-right!">Amount</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((doc) => {
                const open = () => nav.open(doc.code);
                return (
                  <tr
                    key={doc.code}
                    className={clickableRow}
                    tabIndex={0}
                    onClick={open}
                    onKeyDown={rowKeyHandler(open)}
                  >
                    <td>
                      <span className="font-mono font-semibold">{doc.code}</span>{" "}
                      <span className="text-muted-foreground">{SALES_KINDS[doc.kind].label}</span>
                    </td>
                    <td>{formatDate(doc.date)}</td>
                    <td className="text-right tabular-nums">{docMoney(documentTotal(doc), doc)}</td>
                    <td>
                      <StatusPill status={displayStatus(doc)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">No documents yet.</span>
      )}
    </div>
  );
}

const findCustomerByCode = (customers: readonly SalesCustomer[], code: string) =>
  customers.find((item) => item.code === code);

function CustomerPanelBody({
  customer,
  nav,
  onClose,
  closeGuardRef,
}: {
  customer: SalesCustomer;
  nav: SalesNav;
  onClose: () => void;
  closeGuardRef: RefObject<(() => void) | null>;
}) {
  const state = useSalesState();
  const editor = useCustomerEditor(customer, nav, onClose);
  const { draft, errors, update } = editor;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const opening = Number(draft.openingBalance) || 0;
  const outstanding = opening + invoicedBalance(state, customer.id);
  const available = draft.creditLimit
    ? draft.creditLimit - (exposure(state, customer.id) - customer.openingBalance + opening)
    : null;
  const errorCount = Object.keys(errors).length;
  const requestClose = () => (editor.dirty ? setConfirmDiscard(true) : onClose());
  useEffect(() => {
    closeGuardRef.current = requestClose;
    return () => {
      closeGuardRef.current = null;
    };
  });

  return (
    <>
      <SheetHeader className="border-b border-border pr-12">
        <div className="flex flex-wrap items-center gap-2">
          <SheetTitle className="m-0 text-lg font-bold">{customer.display || customer.name}</SheetTitle>
          <span className="font-mono text-[0.8125rem] text-muted-foreground">{customer.code}</span>
          <StatusPill
            status={onCreditHold(customer) ? `Credit ${customer.creditStatus.toLowerCase()}` : customer.status}
          />
        </div>
        <SheetDescription className="m-0">
          {customer.name} · {customer.type}
          {customer.salesperson ? ` · ${customer.salesperson}` : ""}
        </SheetDescription>
      </SheetHeader>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <section
          className="grid grid-cols-1 gap-3 border-b border-border bg-muted p-4 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)]"
          aria-label="Quick update"
        >
          <div className="grid content-start gap-1.5">
            <span id="customer-status-label" className="text-xs font-semibold text-muted-foreground">
              Customer status
            </span>
            <RadioGroup
              aria-labelledby="customer-status-label"
              value={draft.status}
              onValueChange={(value) => update({ status: value as SalesCustomer["status"] })}
              className="flex min-h-10 items-center gap-4"
            >
              {STATUSES.map((status) => (
                <span key={status} className="flex items-center gap-2 text-sm font-medium">
                  <RadioGroupItem id={`customer-status-${status}`} value={status} />
                  <label htmlFor={`customer-status-${status}`} className="cursor-pointer">
                    {status}
                  </label>
                </span>
              ))}
            </RadioGroup>
          </div>
          <Field label="Opening balance (PKR)" error={errors.openingBalance}>
            <AmountInput
              allowNegative
              value={draft.openingBalance}
              aria-invalid={Boolean(errors.openingBalance)}
              onValueChange={(_, openingBalance) => update({ openingBalance })}
            />
          </Field>
          <Field label="Opening balance as of">
            <Input
              type="date"
              value={draft.openingBalanceDate}
              onChange={(event) => update({ openingBalanceDate: event.target.value })}
            />
          </Field>
          <dl className="col-span-full m-0 grid grid-cols-3 gap-2 text-[0.8125rem]">
            {[
              ["Outstanding", moneyWhole(outstanding), ""],
              ["Credit limit", draft.creditLimit ? moneyWhole(draft.creditLimit) : "No limit", ""],
              [
                "Available credit",
                available === null ? "—" : moneyWhole(available),
                available !== null && available < 0 ? "text-[var(--nx-danger)]" : "",
              ],
            ].map(([label, value, tone]) => (
              <div key={label} className="min-w-0 rounded border border-border bg-card px-3 py-2">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className={cn("m-0 truncate font-bold tabular-nums", tone)}>{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <EntryTabs
          label="Customer sections"
          tabs={CUSTOMER_SECTIONS}
          active={editor.section}
          onChange={editor.setSection}
          errors={editor.errorSections}
        />
        <div className="p-4" role="tabpanel">
          <CustomerSectionBody
            section={editor.section}
            customer={draft}
            errors={errors}
            update={update}
            nav={nav}
            variant="panel"
            footer={<RecentDocuments customer={customer} nav={nav} />}
          />
        </div>
      </div>

      <SheetFooter className="flex-row flex-wrap items-center justify-end border-t border-border bg-muted">
        {errorCount ? (
          <span role="alert" className="mr-auto text-xs font-semibold text-[var(--nx-danger)]">
            Fix the highlighted fields, then save again.
          </span>
        ) : editor.dirty ? (
          <span className="mr-auto text-xs text-muted-foreground">Unsaved changes</span>
        ) : null}
        <Button type="button" variant="outline" onClick={requestClose}>
          Cancel
        </Button>
        <Button type="button" onClick={editor.save}>
          Save changes
        </Button>
      </SheetFooter>

      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent overlayClassName={salesLayer.dialogOverlay} className={salesLayer.dialog}>
          <AlertDialogHeader>
            <AlertDialogTitle className="m-0">Discard unsaved changes?</AlertDialogTitle>
            <AlertDialogDescription className="m-0">
              Your changes to {customer.display || customer.name} have not been saved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep editing</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={onClose}>
              Discard changes
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** Right-side customer panel over the Customers list. */
export function CustomerPanel({
  customerCode,
  nav,
  onClose,
}: {
  customerCode: string | null;
  nav: SalesNav;
  onClose: () => void;
}) {
  const state = useSalesState();
  const customer = customerCode ? findCustomerByCode(state.customers, customerCode) : undefined;
  // The body registers its unsaved-changes guard here so Esc, the overlay and the X button use it too.
  const requestClose = useRef<(() => void) | null>(null);
  return (
    <Sheet open={Boolean(customer)} onOpenChange={(open) => !open && (requestClose.current ?? onClose)()}>
      <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn("w-full gap-0 data-[side=right]:w-full data-[side=right]:sm:max-w-2xl", salesLayer.sheet)}>
        {customer ? (
          <CustomerPanelBody
            key={customer.code}
            customer={customer}
            nav={nav}
            onClose={onClose}
            closeGuardRef={requestClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
