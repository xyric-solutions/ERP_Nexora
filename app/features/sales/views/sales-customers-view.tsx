"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  EntryActionBar,
  EntryTabs,
  FilterSelect,
  ListToolbar,
  MetricTiles,
  PageHead,
  SearchBox,
  StatusPill,
} from "../components/sales-ui";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import { useDiscardGuard } from "../components/discard-guard";
import { CustomerPanel } from "../components/customer-panel";
import { CustomerSectionBody, useCustomerEditor } from "../components/customer-sections";
import type { SalesNav } from "../components/sales-nav";
import { CUSTOMER_SECTIONS, customerPhone, onCreditHold, termsLabel } from "../model/customer-model";
import { CUSTOMER_TYPES } from "../model/sales-constants";
import { moneyWhole } from "../model/sales-format";
import { useSalesState } from "../model/sales-store";
import { exposure, newCustomerDraft, onAccountCredit, openBalance } from "../model/sales-workflow";
import type { SalesCustomer, SalesState } from "../model/sales-types";

function customerColumns(state: SalesState): ListColumn<SalesCustomer>[] {
  return [
    { id: "code", label: "Code", required: true, cell: (customer) => <span className="font-mono font-semibold">{customer.code}</span> },
    {
      id: "name",
      label: "Customer",
      required: true,
      cell: (customer) => (
        <>
          <strong>{customer.display || customer.name}</strong>
          {customer.display && customer.display !== customer.name ? <small>{customer.name}</small> : null}
        </>
      ),
    },
    { id: "type", label: "Type", cell: (customer) => customer.type },
    {
      id: "contact",
      label: "Contact",
      cell: (customer) => {
        const phone = customerPhone(customer);
        return customer.contactName || phone || customer.email ? (
          <>
            {customer.contactName || "—"}
            <small>{[phone, customer.email].filter(Boolean).join(" · ")}</small>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        );
      },
    },
    { id: "city", label: "City", optional: true, cell: (customer) => customer.billing.city || "—" },
    { id: "salesperson", label: "Salesperson", optional: true, cell: (customer) => customer.salesperson || "—" },
    { id: "terms", label: "Payment terms", optional: true, cell: (customer) => termsLabel(customer) },
    { id: "ntn", label: "NTN", optional: true, cell: (customer) => customer.ntn || "—" },
    { id: "opening", label: "Opening balance", align: "right", cell: (customer) => moneyWhole(customer.openingBalance) },
    { id: "onAccount", label: "On account", align: "right", optional: true, cell: (customer) => moneyWhole(onAccountCredit(state, customer.id)) },
    { id: "outstanding", label: "Outstanding", align: "right", cell: (customer) => <span className="font-semibold">{moneyWhole(openBalance(state, customer.id))}</span> },
    { id: "limit", label: "Credit limit", align: "right", cell: (customer) => (customer.creditLimit ? moneyWhole(customer.creditLimit) : "No limit") },
    {
      id: "status",
      label: "Status",
      required: true,
      cell: (customer) => (
        <span className="flex flex-wrap gap-1">
          <StatusPill status={customer.status} />
          {onCreditHold(customer) ? <StatusPill status={`Credit ${customer.creditStatus.toLowerCase()}`} /> : null}
        </span>
      ),
    },
  ];
}

/** Customers list. `selected` opens that customer in the right-side panel. */
export function CustomerList({ nav, selected }: { nav: SalesNav; selected?: string }) {
  const state = useSalesState();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const columns = useMemo(() => customerColumns(state), [state]);
  const view = useListView("customers", columns);
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
  const paging = usePagedRows(view, rows, [query, status, type].join("|"));

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Customers"
        title="Customers"
        status={<StatusPill status="Prototype only" />}
        description="Every customer in one list. Click a customer to view and edit it, change its status or update its opening balance."
        actions={
          <>
            <ListViewMenu view={view} />
            <Button type="button" onClick={() => nav.openNew("customers")}>+ New Customer</Button>
          </>
        }
      />
      <MetricTiles
        metrics={[
          { label: "Customers", value: state.customers.length, hint: `${state.customers.filter((item) => item.status === "Active").length} active` },
          { label: "Outstanding", value: moneyWhole(state.customers.reduce((sum, item) => sum + openBalance(state, item.id), 0)), hint: "Opening balances + unpaid invoices − money on account" },
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
            <ListTable view={view} rows={paging.pageRows} rowKey={(customer) => customer.code} onOpen={(customer) => nav.open(customer.code, true)} selected={selected ?? ""} />
            <ListPager view={view} paging={paging} of={state.customers.length} noun="customers" />
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
  const { guard, dialog } = useDiscardGuard(editor.dirty);
  const close = () => guard(nav.back);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Customers · Customer"
        title="New Customer"
        description="Only the Overview is required. Contact, address, tax, payment, bank and notes sections are optional and can be completed later."
        actions={<Button type="button" variant="outline" onClick={close}>Close</Button>}
      />
      <EntryActionBar
        saveLabel="Save customer"
        lifecycle={["Saved"]}
        state="Not saved yet"
        error={Object.keys(editor.errors).length ? "Some details need fixing. Sections with a red dot have errors." : undefined}
        onSave={editor.save}
        onDiscard={close}
      />
      <Card>
        <EntryTabs label="Customer sections" tabs={CUSTOMER_SECTIONS} active={editor.section} onChange={editor.setSection} errors={editor.errorSections} />
        <div className="p-4" role="tabpanel">
          <CustomerSectionBody section={editor.section} customer={editor.draft} errors={editor.errors} update={editor.update} nav={nav} />
        </div>
      </Card>
      {dialog}
    </div>
  );
}

/** Full-page New Customer form. Saving returns to the Customers list. */
export function CustomerForm({ nav, onSaved }: { nav: SalesNav; onSaved: (code: string) => void }) {
  const state = useSalesState();
  const [initial] = useState(() => newCustomerDraft(state));
  return <NewCustomerEditor initial={initial} nav={nav} onSaved={onSaved} />;
}
