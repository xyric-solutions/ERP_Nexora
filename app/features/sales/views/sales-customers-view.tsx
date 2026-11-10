"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  clickableRow,
  EmptyState,
  EntryActionBar,
  EntryTabs,
  FilterSelect,
  ListFooter,
  ListToolbar,
  MetricTiles,
  PageHead,
  rowKeyHandler,
  SearchBox,
  StatusPill,
  tableClass,
} from "../components/sales-ui";
import { CustomerPanel } from "../components/customer-panel";
import { CustomerSectionBody, useCustomerEditor } from "../components/customer-sections";
import type { SalesNav } from "../components/sales-nav";
import { CUSTOMER_SECTIONS, customerPhone, onCreditHold } from "../model/customer-model";
import { CUSTOMER_TYPES } from "../model/sales-constants";
import { moneyWhole } from "../model/sales-format";
import { useSalesState } from "../model/sales-store";
import { exposure, newCustomerDraft, openBalance } from "../model/sales-workflow";
import type { SalesCustomer } from "../model/sales-types";

/** Customers list. `selected` opens that customer in the right-side panel. */
export function CustomerList({ nav, selected }: { nav: SalesNav; selected?: string }) {
  const state = useSalesState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.customers.filter(
      (customer) =>
        (!status || customer.status === status) &&
        (!type || customer.type === type) &&
        (!needle ||
          [customer.code, customer.name, customer.display, customer.contactName, customer.email, customerPhone(customer), customer.mobile, customer.billing.city, customer.ntn]
            .join(" ")
            .toLowerCase()
            .includes(needle)),
    );
  }, [query, state.customers, status, type]);

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Customers"
        title="Customers"
        status={<StatusPill status="Prototype only" />}
        description="Every customer in one list. Click a customer to view and edit it, change its status or update its opening balance."
        actions={<Button type="button" onClick={() => nav.openNew("customers")}>+ New Customer</Button>}
      />
      <MetricTiles
        metrics={[
          { label: "Customers", value: state.customers.length, hint: `${state.customers.filter((item) => item.status === "Active").length} active` },
          { label: "Outstanding", value: moneyWhole(state.customers.reduce((sum, item) => sum + openBalance(state, item.id), 0)), hint: "Opening balances + unpaid invoices" },
          {
            label: "Over 80% of credit limit",
            value: state.customers.filter((item) => item.creditLimit && exposure(state, item.id) / item.creditLimit > 0.8).length,
            hint: "Watch before confirming orders",
          },
        ]}
      />
      <Card>
        <ListToolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search name, code, contact, phone, city or NTN" />
          <FilterSelect label="Type" value={type} options={CUSTOMER_TYPES} onChange={setType} />
          <FilterSelect label="Status" value={status} options={["Active", "Inactive"]} onChange={setStatus} />
        </ListToolbar>
        {rows.length ? (
          <>
            <div className="overflow-x-auto">
              <table className={tableClass}>
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Customer</th>
                    <th>Type</th>
                    <th>Contact</th>
                    <th className="text-right!">Opening balance</th>
                    <th className="text-right!">Outstanding</th>
                    <th className="text-right!">Credit limit</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((customer) => {
                    const open = () => nav.open(customer.code, true);
                    const phone = customerPhone(customer);
                    return (
                      <tr
                        key={customer.id}
                        className={clickableRow}
                        tabIndex={0}
                        aria-selected={customer.code === selected}
                        onClick={open}
                        onKeyDown={rowKeyHandler(open)}
                      >
                        <td><span className="font-mono font-semibold">{customer.code}</span></td>
                        <td><strong>{customer.display || customer.name}</strong>{customer.display && customer.display !== customer.name ? <small>{customer.name}</small> : null}</td>
                        <td>{customer.type}</td>
                        <td>
                          {customer.contactName || phone || customer.email ? (
                            <>
                              {customer.contactName || "—"}
                              <small>{[phone, customer.email].filter(Boolean).join(" · ")}</small>
                            </>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="text-right tabular-nums">{moneyWhole(customer.openingBalance)}</td>
                        <td className="text-right font-semibold tabular-nums">{moneyWhole(openBalance(state, customer.id))}</td>
                        <td className="text-right tabular-nums">{customer.creditLimit ? moneyWhole(customer.creditLimit) : "No limit"}</td>
                        <td>
                          <span className="flex flex-wrap gap-1">
                            <StatusPill status={customer.status} />
                            {onCreditHold(customer) ? <StatusPill status={`Credit ${customer.creditStatus.toLowerCase()}`} /> : null}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ListFooter>Showing {rows.length} of {state.customers.length} customers</ListFooter>
          </>
        ) : (
          <EmptyState
            title={state.customers.length ? "No customers match" : "No customers yet"}
            action={
              state.customers.length ? (
                <Button type="button" variant="outline" size="sm" onClick={() => { setQuery(""); setStatus(""); setType(""); }}>Clear filters</Button>
              ) : (
                <Button type="button" size="sm" onClick={() => nav.openNew("customers")}>+ New Customer</Button>
              )
            }
          />
        )}
      </Card>
      <CustomerPanel customerCode={selected ?? null} nav={nav} onClose={nav.back} />
    </div>
  );
}

function NewCustomerEditor({ initial, nav, onSaved }: { initial: SalesCustomer; nav: SalesNav; onSaved: (code: string) => void }) {
  const editor = useCustomerEditor(initial, nav, onSaved);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Customers · Customer"
        title="New Customer"
        description="Only the Overview is required. Contact, address, tax, payment, bank and notes sections are optional and can be completed later."
        actions={<Button type="button" variant="outline" onClick={nav.back}>Close</Button>}
      />
      <EntryActionBar
        saveLabel="Save customer"
        lifecycle={["Saved"]}
        state="Not saved yet"
        error={Object.keys(editor.errors).length ? "Some details need fixing. Sections with a red dot have errors." : undefined}
        onSave={editor.save}
        onDiscard={nav.back}
      />
      <Card>
        <EntryTabs label="Customer sections" tabs={CUSTOMER_SECTIONS} active={editor.section} onChange={editor.setSection} errors={editor.errorSections} />
        <div className="p-4" role="tabpanel">
          <CustomerSectionBody section={editor.section} customer={editor.draft} errors={editor.errors} update={editor.update} nav={nav} />
        </div>
      </Card>
    </div>
  );
}

/** Full-page New Customer form. Saving returns to the Customers list. */
export function CustomerForm({ nav, onSaved }: { nav: SalesNav; onSaved: (code: string) => void }) {
  const state = useSalesState();
  const [initial] = useState(() => newCustomerDraft(state));
  return <NewCustomerEditor initial={initial} nav={nav} onSaved={onSaved} />;
}
