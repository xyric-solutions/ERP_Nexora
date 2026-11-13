"use client";

/**
 * Receipts page (prototype), Sales › Receipts. Meeting of 11 Nov 2026 and the
 * reference screenshots:
 * - Add New ▾: Receipt (RCT), Customer Payment (CPY), Return Receipt (RRC),
 *   Return Payment (RPY). Choosing a customer on a receipt lists their
 *   outstanding invoices automatically for (part) allocation.
 * - Batch ▾: Invoice Receipts, Receipts, Payments, Combined Accounts Offset,
 *   All Combined Accounts Offset.
 * - Opened record: Print, Preview, Return, Reset to Draft, Draft → Posted
 *   stepper, a status ribbon and a possible-duplicate warning.
 * - Filter: choose the columns and rows per page.
 *
 * Mock only: nothing is posted to the ledger or bank. When the Sales API is
 * built, receipts must be posted server-side with audit and idempotency, and
 * hand over to the live Banking receipt flow.
 */

import { useMemo, useState, type ReactNode } from "react";
import { Eye, Pencil, Printer, RotateCcw, Send, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "cn";
import {
  ActivityList,
  Card,
  EmptyState,
  FilterSelect,
  KeyValues,
  LinkButton,
  ListToolbar,
  MetricTiles,
  PageHead,
  salesLayer,
  SearchBox,
  StatusPill,
  tableClass,
  type Metric,
} from "../components/sales-ui";
import { ActionMenu, type ActionMenuOption } from "../components/action-menu";
import { ListPager, ListTable, ListViewMenu, usePagedRows, useListView, type ListColumn } from "../components/list-view-options";
import { contextRows } from "../components/project-location-fields";
import { BatchSheet, MoneyDocSheet, moneySheetClass, type BatchKind, type MoneyFormPreset } from "../components/money-forms";
import { MoneyVoucherViewer } from "../components/money-voucher";
import { DeleteDraftDialog } from "../components/sales-dialogs";
import type { SalesNav } from "../components/sales-nav";
import { MONEY_DOC_TYPES, moneyDocMeta, RECEIPT_METHODS } from "../model/sales-constants";
import { formatDate, moneyWhole } from "../model/sales-format";
import { currencySummary, docMoney, toBase } from "../model/sales-currency";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  appliedTo,
  deleteMoneyDraft,
  displayStatus,
  documentTotal,
  findCustomer,
  findDocument,
  findMoneyDoc,
  invoiceBalance,
  isPosted,
  postMoneyDoc,
  possibleDuplicates,
  receiptSource,
  resetMoneyToDraft,
  returnableOf,
  returnsAgainst,
  unallocatedOf,
  referenceLabel,
} from "../model/sales-workflow";
import type { CustomerReceipt, MoneyDocType, SalesState } from "../model/sales-types";

const SOURCE_LABEL = { Invoice: "From an invoice", Manual: "Entered on Receipts", Batch: "Batch entry" } as const;

/** Ribbon / settlement label for a money document. */
export function settlementOf(state: SalesState, doc: CustomerReceipt): string {
  if (doc.status === "Draft") return "Draft";
  if (doc.type === "Receipt") {
    if (returnableOf(state, doc) <= 0.004) return "Returned";
    const free = unallocatedOf(state, doc);
    const used = doc.alloc.some((item) => appliedTo(state, doc, item.inv) > 0.004);
    return free <= 0.004 ? "Allocated" : used ? "Partly allocated" : "On account";
  }
  if (doc.type === "Customer payment") {
    const left = returnableOf(state, doc);
    return left <= 0.004 ? "Returned" : left < doc.amount - 0.004 ? "Partly returned" : "Outstanding";
  }
  return "Posted";
}

function metricsFor(state: SalesState): Metric[] {
  const posted = state.receipt.filter(isPosted);
  const sum = (type: MoneyDocType) => posted.filter((doc) => doc.type === type).reduce((total, doc) => total + toBase(doc.amount, doc), 0);
  const onAccount = posted.filter((doc) => doc.type === "Receipt").reduce((total, doc) => total + toBase(unallocatedOf(state, doc), doc), 0);
  const drafts = state.receipt.filter((doc) => doc.status === "Draft").length;
  return [
    { label: "Received", value: moneyWhole(sum("Receipt") - sum("Return receipt")), hint: "Posted receipts less return receipts, in PKR" },
    { label: "Paid to customers", value: moneyWhole(sum("Customer payment") - sum("Return payment")), hint: "Deposits and advances still with customers, in PKR" },
    { label: "On account", value: moneyWhole(onAccount), hint: "Received but not allocated to invoices, in PKR" },
    { label: "Drafts", value: drafts, hint: drafts ? "Not posted · no effect yet" : "Everything is posted" },
  ];
}

function columnsFor(state: SalesState, nav: SalesNav): ListColumn<CustomerReceipt>[] {
  return [
    {
      id: "code",
      label: "Document",
      required: true,
      cell: (doc) => (
        <>
          <span className="font-mono text-[0.8125rem] font-semibold">{doc.code}</span>
          <small>{moneyDocMeta(doc.type).label}</small>
        </>
      ),
    },
    { id: "date", label: "Date", nowrap: true, cell: (doc) => formatDate(doc.date) },
    {
      id: "customer",
      label: "Customer",
      required: true,
      cell: (doc) => (
        <>
          <strong>{findCustomer(state, doc.customerId)?.display ?? "—"}</strong>
          <small>{findCustomer(state, doc.customerId)?.code}</small>
        </>
      ),
    },
    {
      id: "applied",
      label: "Invoices / against",
      cell: (doc) =>
        doc.against ? (
          <LinkButton mono onClick={() => nav.open(doc.against!)}>{doc.against}</LinkButton>
        ) : doc.alloc.length ? (
          <span className="flex flex-wrap gap-x-2">
            {doc.alloc.map((item) => <LinkButton key={item.inv} mono onClick={() => nav.open(item.inv)}>{item.inv}</LinkButton>)}
          </span>
        ) : (
          <span className="text-muted-foreground">{doc.purpose || "On account"}</span>
        ),
    },
    { id: "method", label: "Method", cell: (doc) => <>{doc.method}<small>{doc.account}</small></> },
    { id: "reference", label: "Reference", cell: (doc) => doc.reference || "—" },
    { id: "amount", label: "Amount", align: "right", required: true, cell: (doc) => <span className="font-semibold">{docMoney(doc.amount, doc)}</span> },
    { id: "onAccount", label: "On account", align: "right", optional: true, cell: (doc) => (doc.type === "Receipt" && isPosted(doc) ? docMoney(unallocatedOf(state, doc), doc) : "—") },
    { id: "settlement", label: "Settlement", cell: (doc) => <StatusPill status={settlementOf(state, doc)} /> },
    { id: "status", label: "Status", required: true, cell: (doc) => <StatusPill status={doc.status} /> },
    { id: "source", label: "Source", optional: true, cell: (doc) => SOURCE_LABEL[receiptSource(doc)] },
    { id: "project", label: "Project", optional: true, cell: (doc) => referenceLabel(doc.project) || "—" },
    { id: "location", label: "Location", optional: true, cell: (doc) => referenceLabel(doc.location) || "—" },
    { id: "owner", label: "Recorded by", cell: (doc) => doc.owner || "—" },
  ];
}

/* ------------------------------------------------------------ record panel */

const STEPS = ["Draft", "Posted"] as const;

function DocStepper({ status }: { status: CustomerReceipt["status"] }) {
  return (
    <ol className="m-0 flex list-none items-stretch overflow-hidden rounded border border-border p-0 text-xs font-semibold" aria-label="Document status">
      {STEPS.map((step) => {
        const current = step === status;
        return (
          <li
            key={step}
            aria-current={current ? "step" : undefined}
            className={cn(
              "relative px-3 py-1.5 not-last:border-r not-last:border-border",
              current ? "bg-[var(--nx-brand-soft)] text-[var(--nx-brand)]" : "bg-card text-muted-foreground",
            )}
          >
            {step}
          </li>
        );
      })}
    </ol>
  );
}

function PanelSection({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="border-b border-border">
      <div className="flex items-center justify-between gap-2 px-4 pt-3.5">
        <h3 className="m-0 text-xs font-bold uppercase tracking-[0.06em] text-muted-foreground">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function MoneyDocPanel({
  code,
  nav,
  onClose,
  onEdit,
  onReturn,
}: {
  code: string | null;
  nav: SalesNav;
  onClose: () => void;
  onEdit: (doc: CustomerReceipt) => void;
  onReturn: (doc: CustomerReceipt) => void;
}) {
  const state = useSalesState();
  const doc = findMoneyDoc(state, code ?? undefined);
  const customer = doc ? findCustomer(state, doc.customerId) : undefined;
  const [viewer, setViewer] = useState<"preview" | "print" | null>(null);
  const [deleting, setDeleting] = useState(false);

  const act = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };

  if (!doc) {
    return (
      <Sheet open={Boolean(code)} onOpenChange={(open) => !open && onClose()}>
        <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn(moneySheetClass, salesLayer.sheet)}>
          {code ? (
            <EmptyState title={`${code} was not found`} hint="Deleted drafts are removed; sample records reset on reload." action={<Button type="button" variant="outline" size="sm" onClick={onClose}>Close</Button>} />
          ) : null}
        </SheetContent>
      </Sheet>
    );
  }

  const meta = moneyDocMeta(doc.type);
  const settlement = settlementOf(state, doc);
  const duplicates = possibleDuplicates(state, doc);
  const returns = returnsAgainst(state, doc.code, true);
  const canReturn = isPosted(doc) && (doc.type === "Receipt" || doc.type === "Customer payment") && returnableOf(state, doc) > 0.004;
  const returnLabel = doc.type === "Customer payment" ? "Return Payment" : "Return Receipt";
  const incoming = doc.type === "Receipt" || doc.type === "Return payment";

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" overlayClassName={salesLayer.sheetOverlay} className={cn(moneySheetClass, salesLayer.sheet)}>
        <SheetHeader className="border-b border-border pr-12">
          <div className="flex flex-wrap items-center gap-2">
            <SheetTitle className="m-0 font-mono text-lg font-bold">{doc.code}</SheetTitle>
            <StatusPill status={doc.status} />
          </div>
          <SheetDescription className="m-0">{customer?.display ?? "—"} · {meta.label}</SheetDescription>
        </SheetHeader>

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted px-4 py-2.5" role="toolbar" aria-label={`${doc.code} actions`}>
          <div className="flex flex-wrap gap-1.5">
            <Button type="button" size="sm" onClick={() => setViewer("print")}><Printer /> Print</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setViewer("preview")}><Eye /> Preview</Button>
            {canReturn ? <Button type="button" size="sm" variant="outline" onClick={() => onReturn(doc)}><Undo2 /> {returnLabel}</Button> : null}
            {isPosted(doc) ? (
              <Button type="button" size="sm" variant="outline" onClick={() => act(() => { commitSales((sales) => resetMoneyToDraft(sales, doc.code, nav.actor)); return `${doc.code} reset to draft. It no longer counts until it is posted again.`; })}>
                <RotateCcw /> Reset to Draft
              </Button>
            ) : (
              <>
                <Button type="button" size="sm" variant="outline" onClick={() => onEdit(doc)}><Pencil /> Edit</Button>
                <Button type="button" size="sm" variant="outline" onClick={() => act(() => { commitSales((sales) => postMoneyDoc(sales, doc.code, nav.actor)); return `${doc.code} posted.`; })}>
                  <Send /> Post
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => setDeleting(true)}><Trash2 /> Delete</Button>
              </>
            )}
          </div>
          <DocStepper status={doc.status} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {duplicates.length ? (
            <p role="status" className="m-0 border-b border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] px-4 py-2 text-xs text-[var(--nx-warning)]">
              Warning: this document might be a duplicate of{" "}
              {duplicates.map((item, index) => (
                <span key={item.code}>
                  {index ? ", " : ""}
                  <LinkButton mono onClick={() => nav.open(item.code)}>{item.code}</LinkButton> ({docMoney(item.amount, item)}, {formatDate(item.date)})
                </span>
              ))}
              .
            </p>
          ) : null}

          <section className="relative grid grid-cols-2 overflow-hidden border-b border-border bg-muted sm:grid-cols-3">
            {[
              [meta.amountLabel, docMoney(doc.amount, doc)],
              ["Date", formatDate(doc.date)],
              doc.type === "Receipt" ? ["On account", docMoney(isPosted(doc) ? unallocatedOf(state, doc) : 0, doc)] : ["Returnable", docMoney(returnableOf(state, doc), doc)],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 border-r border-border px-4 py-3 last:border-r-0">
                <span className="block text-xs text-muted-foreground">{label}</span>
                <strong className="block text-sm font-bold tabular-nums">{value}</strong>
              </div>
            ))}
            {settlement !== "Draft" ? (
              <span
                aria-label={`Settlement: ${settlement}`}
                className={cn(
                  "pointer-events-none absolute top-3 -right-10 w-36 rotate-45 py-0.5 text-center text-[0.625rem] font-extrabold uppercase tracking-[0.08em] shadow-sm",
                  settlement === "Allocated" || settlement === "Posted" || settlement === "Returned"
                    ? "bg-[var(--nx-success)] text-[var(--nx-action-text)]"
                    : "bg-[var(--nx-warning)] text-[var(--nx-action-text)]",
                )}
              >
                {settlement}
              </span>
            ) : null}
          </section>

          <PanelSection title="Details">
            <KeyValues
              rows={[
                ["Type", meta.label],
                ["Customer", customer ? <LinkButton key="c" onClick={() => nav.open(customer.code)}>{customer.display}</LinkButton> : "—"],
                ...contextRows(doc),
                ["Payment method", doc.method],
                ["Currency", currencySummary(doc)],
                [incoming ? "Received into" : "Paid from", doc.account || "—"],
                ["Reference", doc.reference || "—"],
                ...(doc.purpose ? ([["Paid for", doc.purpose]] as [string, ReactNode][]) : []),
                ...(doc.against ? ([["Returns", <LinkButton key="a" mono onClick={() => nav.open(doc.against!)}>{doc.against}</LinkButton>]] as [string, ReactNode][]) : []),
                ...(doc.note ? ([[doc.against ? "Reason" : "Note", doc.note]] as [string, ReactNode][]) : []),
                ["Recorded by", doc.owner || "—"],
                ["Source", SOURCE_LABEL[receiptSource(doc)]],
                ["Settlement", <StatusPill key="st" status={settlement} />],
              ]}
            />
          </PanelSection>

          {doc.type === "Receipt" || doc.type === "Return receipt" ? (
            <PanelSection
              title={doc.type === "Receipt" ? "Allocated to invoices" : "Reversed from invoices"}
              aside={<span className="text-xs text-muted-foreground">{doc.alloc.length} invoice(s)</span>}
            >
              {doc.alloc.length ? (
                <div className="relative overflow-x-auto px-4 pt-2 pb-4">
                  <table className={tableClass}>
                    <thead><tr><th>Invoice</th><th className="text-right!">{doc.type === "Receipt" ? "Allocated" : "Reversed"}</th>{doc.type === "Receipt" ? <th className="text-right!">Net now</th> : null}<th className="text-right!">Balance now</th><th>Status</th></tr></thead>
                    <tbody>
                      {doc.alloc.map((item) => {
                        const invoice = findDocument(state, "invoice", item.inv);
                        return (
                          <tr key={item.inv}>
                            <td>
                              <LinkButton mono onClick={() => nav.open(item.inv)}>{item.inv}</LinkButton>
                              {invoice ? <small>Total {docMoney(documentTotal(invoice), invoice)}</small> : null}
                            </td>
                            <td className="text-right font-semibold tabular-nums">{docMoney(item.amount, doc)}</td>
                            {doc.type === "Receipt" ? <td className="text-right tabular-nums">{isPosted(doc) ? docMoney(appliedTo(state, doc, item.inv), doc) : "Not posted"}</td> : null}
                            <td className="text-right tabular-nums">{invoice ? docMoney(invoiceBalance(state, invoice), invoice) : "—"}</td>
                            <td>{invoice ? <StatusPill status={displayStatus(invoice)} /> : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="m-0 px-4 py-4 text-[0.8125rem] text-muted-foreground">
                  {doc.type === "Receipt" ? "Not allocated. The money is held on account; use Batch › Combined Accounts Offset to apply it to invoices." : "Taken from the money held on account."}
                </p>
              )}
            </PanelSection>
          ) : null}

          {returns.length ? (
            <PanelSection title="Returns against this document">
              <div className="relative overflow-x-auto px-4 pt-2 pb-4">
                <table className={tableClass}>
                  <thead><tr><th>Return</th><th>Date</th><th>Status</th><th className="text-right!">Amount</th></tr></thead>
                  <tbody>
                    {returns.map((item) => (
                      <tr key={item.code}>
                        <td><LinkButton mono onClick={() => nav.open(item.code)}>{item.code}</LinkButton><small>{item.note}</small></td>
                        <td>{formatDate(item.date)}</td>
                        <td><StatusPill status={item.status} /></td>
                        <td className="text-right font-semibold tabular-nums">{docMoney(item.amount, doc)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </PanelSection>
          ) : null}

          <PanelSection title="Activity">
            <ActivityList entries={doc.history} />
          </PanelSection>
        </div>

        {viewer ? <MoneyVoucherViewer doc={doc} customer={customer} state={state} autoPrint={viewer === "print"} onClose={() => setViewer(null)} /> : null}
        <DeleteDraftDialog
          code={deleting ? doc.code : null}
          onClose={() => setDeleting(false)}
          onConfirm={() => {
            setDeleting(false);
            act(() => {
              commitSales((sales) => deleteMoneyDraft(sales, doc.code));
              onClose();
              return `Draft ${doc.code} deleted.`;
            });
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

/* -------------------------------------------------------------------- list */

const TYPE_BY_PREFIX: Record<string, MoneyDocType> = Object.fromEntries(MONEY_DOC_TYPES.map((meta) => [meta.prefix, meta.type]));
const BATCH_PRESETS: readonly BatchKind[] = ["invoice-receipts", "receipts", "payments", "offset", "offset-all"];

/**
 * Reads a `new:<preset>` route: a document prefix (RCT, CPY, RRC, RPY), a
 * return against a code (RRC:RCT-003), an invoice code for Receive Payment
 * (INV-001) or a batch name (batch:receipts).
 */
function parsePreset(preset: string | undefined): { form?: MoneyFormPreset; batch?: BatchKind } {
  if (!preset) return { form: { type: "Receipt" } };
  if (preset.startsWith("batch:")) {
    const kind = preset.slice(6) as BatchKind;
    return BATCH_PRESETS.includes(kind) ? { batch: kind } : {};
  }
  if (preset.startsWith("INV-")) return { form: { type: "Receipt", invoice: preset } };
  const [prefix, against] = preset.split(":");
  const type = TYPE_BY_PREFIX[prefix];
  return type ? { form: { type, against } } : { form: { type: "Receipt" } };
}

/**
 * Receipts list. `selected` opens a document in the right-side panel;
 * `creating` opens the new-document or batch sheet chosen by `preset`.
 */
export function ReceiptList({
  nav,
  selected,
  creating,
  preset,
  onSaved,
}: {
  nav: SalesNav;
  selected?: string;
  creating?: boolean;
  preset?: string;
  onSaved: (code: string) => void;
}) {
  const state = useSalesState();
  const [query, setQuery] = useState("");
  const [customer, setCustomer] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [editing, setEditing] = useState<MoneyFormPreset | null>(null);
  const columns = useMemo(() => columnsFor(state, nav), [nav, state]);
  const view = useListView("receipts", columns);
  const route = creating ? parsePreset(preset) : {};

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return state.receipt
      .filter((doc) => (!customer || doc.customerId === customer) && (!type || doc.type === type) && (!status || doc.status === status) && (!method || doc.method === method))
      .filter((doc) => {
        if (!needle) return true;
        const payer = findCustomer(state, doc.customerId);
        return [doc.code, payer?.name, payer?.display, doc.reference, doc.method, doc.account, doc.against, doc.purpose, doc.note, ...doc.alloc.map((item) => item.inv)]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code, undefined, { numeric: true }));
  }, [customer, method, query, state, status, type]);
  const paging = usePagedRows(view, rows, [query, customer, type, status, method].join("|"));

  const clear = () => {
    setQuery("");
    setCustomer("");
    setType("");
    setStatus("");
    setMethod("");
  };

  const addNew: ActionMenuOption[] = MONEY_DOC_TYPES.map((meta) => ({ label: `${meta.label} (${meta.prefix})`, run: () => nav.openNew("receipts", meta.prefix) }));
  const batch: ActionMenuOption[] = [
    { label: "Invoice Receipts (RCT)", run: () => nav.openNew("receipts", "batch:invoice-receipts") },
    { label: "Receipts (RCT)", run: () => nav.openNew("receipts", "batch:receipts") },
    { label: "Payments (CPY)", run: () => nav.openNew("receipts", "batch:payments") },
    { label: "Combined Accounts Offset", run: () => nav.openNew("receipts", "batch:offset") },
    { label: "All Combined Accounts Offset", run: () => nav.openNew("receipts", "batch:offset-all") },
  ];

  const finishEdit = (code: string) => {
    setEditing(null);
    nav.open(code);
  };

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Receipts"
        title="Receipts"
        status={<StatusPill status="Prototype only" />}
        description="Payments received from customers, payments made to them and their returns. A receipt lists the customer's outstanding invoices automatically so a full or part payment can be allocated; anything not allocated stays on account. Drafts have no effect until they are posted."
        actions={
          <>
            <ActionMenu label="Add New" options={addNew} tone="primary" />
            <ActionMenu label="Batch" options={batch} tone="secondary" />
            <ListViewMenu view={view} />
            <Button type="button" variant="outline" onClick={() => nav.go("invoices")}>Invoices</Button>
          </>
        }
      />
      <MetricTiles metrics={metricsFor(state)} />
      <Card>
        <ListToolbar>
          <SearchBox value={query} onChange={setQuery} placeholder="Search code, customer, invoice or reference" />
          <FilterSelect label="Customer" value={customer} options={state.customers.map((item) => [item.id, item.display] as const)} onChange={setCustomer} />
          <FilterSelect label="Type" value={type} options={MONEY_DOC_TYPES.map((meta) => [meta.type, meta.label] as const)} onChange={setType} />
          <FilterSelect label="Status" value={status} options={["Draft", "Posted"]} onChange={setStatus} />
          <FilterSelect label="Method" value={method} options={RECEIPT_METHODS} onChange={setMethod} />
        </ListToolbar>
        {rows.length ? (
          <>
            <ListTable view={view} rows={paging.pageRows} rowKey={(doc) => doc.code} onOpen={(doc) => nav.open(doc.code)} selected={selected ?? ""} />
            <ListPager view={view} paging={paging} of={state.receipt.length} noun="documents" />
          </>
        ) : state.receipt.length ? (
          <EmptyState title="Nothing matches these filters" action={<Button type="button" variant="outline" size="sm" onClick={clear}>Clear filters</Button>} />
        ) : (
          <EmptyState title="No receipts yet" hint="Use Add New › Receipt to record a payment from a customer." action={<Button type="button" size="sm" onClick={() => nav.openNew("receipts", "RCT")}>New Receipt</Button>} />
        )}
      </Card>

      <MoneyDocPanel
        code={creating || editing ? null : (selected ?? null)}
        nav={nav}
        onClose={nav.back}
        onEdit={(doc) => setEditing({ type: doc.type, code: doc.code })}
        onReturn={(doc) => nav.openNew("receipts", `${doc.type === "Customer payment" ? "RPY" : "RRC"}:${doc.code}`)}
      />
      <MoneyDocSheet preset={editing ?? route.form ?? null} nav={nav} onClose={editing ? () => setEditing(null) : nav.back} onDone={editing ? finishEdit : onSaved} />
      <BatchSheet kind={route.batch ?? null} nav={nav} onClose={nav.back} />
    </div>
  );
}
