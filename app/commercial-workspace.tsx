"use client";

import { useMemo, useState } from "react";
import { AdvancedListFilters, ListFilterSelect, dateMatchesRange, prototypeDateToIso, type DateRangePreset } from "./module-views";
import { RecordPreviewDrawer } from "./record-preview-drawer";
import { NexoraDocument, documentLinesFrom, type DocumentKind } from "./document-template";
import { RecordProvenance } from "./record-provenance";
import { EnterpriseTransactionControl } from "./enterprise-transaction-control";
import type { CompanyMode } from "./mock-data";

interface CommercialContext {
  moduleId: string; moduleLabel: string; moduleCode: string; moduleDescription: string;
  pageId: string; pageLabel: string; archetype: string; status: string; recordRef?: string;
  roleId: string; companyMode: CompanyMode;
}
interface CommercialRow {
  id: string; document: string; date: string; party: string; reference: string;
  amount: string; currency: string; status: string; owner: string;
}
interface CommercialWorkspaceProps {
  context: CommercialContext;
  rows: CommercialRow[];
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}
type CommercialFamily = "requisition" | "rfq" | "purchase-order" | "receipt" | "purchase-bill" | "purchase-payment" | "sales-quotation" | "sales-order" | "delivery" | "sales-invoice" | "customer-receipt";
interface CommercialDefinition {
  family: CommercialFamily; noun: string; partyLabel: "Supplier" | "Customer";
  listPage: string; createPage: string; detailPage?: string; sourceLabel: string;
  nextLabel: string; nextModule: string; nextPage: string; workflow: readonly string[];
}

const commercialPages = new Set([
  "purchase-requisitions", "add-requisition", "requisition-detail", "requisition-approval", "budget-check",
  "rfqs", "add-rfq", "supplier-quotations", "bid-comparison", "supplier-evaluation", "award-recommendation",
  "purchase-orders", "add-purchase-order", "purchase-order-detail", "purchase-order-approval",
  "gate-inward-pass", "goods-receipts", "add-goods-receipt", "quality-handoff",
  "service-entry", "purchase-bills", "add-purchase-bill", "three-way-match", "match-exceptions", "supplier-returns",
  "payment-proposals", "payment-request", "payment-approval", "payable-bills", "ap-open-items", "supplier-advances",
  "quotations", "add-quotation", "quotation-detail", "sales-orders", "add-sales-order", "sales-order-detail", "pick-pack-delivery",
  "invoices", "add-invoice", "invoice-detail", "credit-note", "debit-note", "batch-invoice", "proforma-invoice", "sales-returns",
  "customer-receipts", "add-customer-receipt", "receipt-allocation",
]);
export function isCommercialMaturityPage(moduleId: string, pageId: string): boolean {
  return ["sales", "purchases", "customers", "suppliers"].includes(moduleId) && commercialPages.has(pageId);
}

function definitionFor(pageId: string): CommercialDefinition {
  if (/requisition|budget-check/.test(pageId)) return { family: "requisition", noun: "Purchase Requisition", partyLabel: "Supplier", listPage: "purchase-requisitions", createPage: "add-requisition", detailPage: "requisition-detail", sourceLabel: "Demand / request", nextLabel: "Create RFQ", nextModule: "purchases", nextPage: "add-rfq", workflow: ["Draft", "Budget check", "Approval", "Sourcing"] };
  if (/rfq|supplier-quotation|bid-comparison|supplier-evaluation|award-recommendation/.test(pageId)) return { family: "rfq", noun: "RFQ / Supplier Quotation", partyLabel: "Supplier", listPage: "rfqs", createPage: "add-rfq", sourceLabel: "Approved requisition", nextLabel: "Create Purchase Order", nextModule: "purchases", nextPage: "add-purchase-order", workflow: ["RFQ prepared", "Suppliers invited", "Quotes received", "Evaluation", "Award"] };
  if (/purchase-order/.test(pageId)) return { family: "purchase-order", noun: "Purchase Order", partyLabel: "Supplier", listPage: "purchase-orders", createPage: "add-purchase-order", detailPage: "purchase-order-detail", sourceLabel: "RFQ / award", nextLabel: "Receive Goods", nextModule: "purchases", nextPage: "add-goods-receipt", workflow: ["Draft", "Commercial review", "Approval", "Issued", "Receiving"] };
  if (/goods-receipt|gate-inward|quality-handoff/.test(pageId)) return { family: "receipt", noun: "Goods Receipt", partyLabel: "Supplier", listPage: "goods-receipts", createPage: "add-goods-receipt", sourceLabel: "Purchase order", nextLabel: "Create Purchase Bill", nextModule: "purchases", nextPage: "add-purchase-bill", workflow: ["Gate entry", "Receipt", "Inspection", "Stock update", "Bill matching"] };
  if (/purchase-bill|three-way-match|match-exception|service-entry|supplier-return/.test(pageId)) return { family: "purchase-bill", noun: "Purchase Bill", partyLabel: "Supplier", listPage: "purchase-bills", createPage: "add-purchase-bill", sourceLabel: "PO / GRN", nextLabel: "Prepare Payment", nextModule: "suppliers", nextPage: "payment-request", workflow: ["Bill captured", "Duplicate check", "2 / 3-way match", "Approval", "Payable"] };
  if (/payment-proposal|payment-request|payment-approval|payable-bill|ap-open-item|supplier-advance/.test(pageId)) return { family: "purchase-payment", noun: "Purchase Payment", partyLabel: "Supplier", listPage: "payment-proposals", createPage: "payment-request", sourceLabel: "Approved bills", nextLabel: "Open Bank Payment", nextModule: "banking", nextPage: "add-bank-payment", workflow: ["Proposal", "Treasury review", "Approval", "Bank payment", "Allocation"] };
  if (/quotation/.test(pageId)) return { family: "sales-quotation", noun: "Sales Quotation", partyLabel: "Customer", listPage: "quotations", createPage: "add-quotation", detailPage: "quotation-detail", sourceLabel: "Opportunity / enquiry", nextLabel: "Convert to Sales Order", nextModule: "sales", nextPage: "add-sales-order", workflow: ["Draft", "Margin review", "Approval", "Sent", "Accepted"] };
  if (/sales-order/.test(pageId)) return { family: "sales-order", noun: "Sales Order", partyLabel: "Customer", listPage: "sales-orders", createPage: "add-sales-order", detailPage: "sales-order-detail", sourceLabel: "Accepted quotation", nextLabel: "Open Dispatch", nextModule: "sales", nextPage: "pick-pack-delivery", workflow: ["Confirmed", "Credit check", "Reserved", "Pick & pack", "Delivery"] };
  if (/pick-pack-delivery/.test(pageId)) return { family: "delivery", noun: "Delivery / Dispatch", partyLabel: "Customer", listPage: "sales-orders", createPage: "pick-pack-delivery", sourceLabel: "Released sales order", nextLabel: "Create Invoice", nextModule: "sales", nextPage: "add-invoice", workflow: ["Released", "Picked", "Packed", "Dispatched", "Delivered"] };
  if (/invoice|credit-note|debit-note|sales-return/.test(pageId)) return { family: "sales-invoice", noun: "Sales Invoice", partyLabel: "Customer", listPage: "invoices", createPage: "add-invoice", detailPage: "invoice-detail", sourceLabel: "Order / delivery", nextLabel: "Record Receipt", nextModule: "customers", nextPage: "add-customer-receipt", workflow: ["Draft", "Tax validation", "Approval", "Posted", "Collection"] };
  return { family: "customer-receipt", noun: "Customer Receipt", partyLabel: "Customer", listPage: "customer-receipts", createPage: "add-customer-receipt", sourceLabel: "Open invoices", nextLabel: "Allocate Receipt", nextModule: "customers", nextPage: "receipt-allocation", workflow: ["Receipt captured", "Bank confirmed", "Allocation", "Posted", "Reconciled"] };
}
function amountValue(value: string): number { const parsed = Number(value.replace(/[^0-9.-]/g, "")); return Number.isFinite(parsed) ? parsed : 0; }
function money(value: number, currency: string): string { return new Intl.NumberFormat("en-US", { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(value); }
function CommercialStatus({ status }: { status: string }) { return <span className={`nx-status nx-status-${status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{status}</span>; }

function PageHead({ definition, context, children }: { definition: CommercialDefinition; context: CommercialContext; children: React.ReactNode }) {
  return <header className="nx-commerce-head"><div><span className="nx-eyebrow">{context.moduleLabel} · {definition.noun}</span><div className="nx-commerce-title"><h1>{context.pageLabel}</h1><CommercialStatus status={context.status === "prototype" ? "Prototype only" : context.status} /></div><p>{context.moduleDescription}</p></div><div className="nx-commerce-head__actions">{children}</div></header>;
}
function WorkflowStrip({ definition, active = 1 }: { definition: CommercialDefinition; active?: number }) {
  return <ol className="nx-commerce-workflow" aria-label={`${definition.noun} workflow`}>{definition.workflow.map((step, index) => <li className={index < active ? "complete" : index === active ? "current" : ""} key={step}><i>{index < active ? "✓" : index + 1}</i><span><strong>{step}</strong><small>{index < active ? "Complete" : index === active ? "Current stage" : "Pending"}</small></span></li>)}</ol>;
}

function CommercialListView({ context, rows, definition, onAction, onNavigate }: CommercialWorkspaceProps & { definition: CommercialDefinition }) {
  const [query, setQuery] = useState(""); const [status, setStatus] = useState(""); const [currency, setCurrency] = useState(""); const [party, setParty] = useState("");
  const [sort, setSort] = useState<"date" | "amount" | "status">("date"); const [descending, setDescending] = useState(true); const [selected, setSelected] = useState<string[]>([]);
  const [advancedOpen, setAdvancedOpen] = useState(false); const [createdBy, setCreatedBy] = useState(""); const [createdOn, setCreatedOn] = useState("");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all"); const [customFrom, setCustomFrom] = useState(""); const [customTo, setCustomTo] = useState("");
  const [documentNumber, setDocumentNumber] = useState(""); const [reference, setReference] = useState(""); const [minAmount, setMinAmount] = useState(""); const [maxAmount, setMaxAmount] = useState("");
  const [savedView, setSavedView] = useState("all"); const [selectedRecord, setSelectedRecord] = useState<CommercialRow | null>(null);
  const parties = [...new Set(rows.map((row) => row.party))].sort(); const currencies = [...new Set(rows.map((row) => row.currency))].sort();
  const statuses = [...new Set(rows.map((row) => row.status))].sort(); const creators = [...new Set(rows.map((row) => row.owner))].sort();
  const filtered = [...rows].filter((row) => {
    const needle = query.trim().toLowerCase();
    const viewMatch = savedView === "all" || (savedView === "open" && !/posted|approved|complete|paid|closed/i.test(row.status)) || (savedView === "approval" && /pending|review|approval/i.test(row.status)) || (savedView === "exceptions" && /hold|reject|exception/i.test(row.status));
    return (!needle || Object.values(row).some((value) => String(value).toLowerCase().includes(needle))) && (!status || row.status === status) && (!currency || row.currency === currency) && (!party || row.party === party) && (!createdBy || row.owner === createdBy) && (!createdOn || prototypeDateToIso(row.date) === createdOn) && (!documentNumber || row.document.toLowerCase().includes(documentNumber.toLowerCase())) && (!reference || row.reference.toLowerCase().includes(reference.toLowerCase())) && (!minAmount || amountValue(row.amount) >= Number(minAmount)) && (!maxAmount || amountValue(row.amount) <= Number(maxAmount)) && viewMatch && dateMatchesRange(row.date, dateRange, customFrom, customTo);
  }).sort((a, b) => { const result = sort === "amount" ? amountValue(a.amount) - amountValue(b.amount) : sort === "status" ? a.status.localeCompare(b.status) : prototypeDateToIso(a.date).localeCompare(prototypeDateToIso(b.date)); return descending ? -result : result; });
  const total = rows.reduce((sum, row) => sum + amountValue(row.amount), 0); const activeFilters = [status, currency, party, createdBy, createdOn, dateRange === "all" ? "" : dateRange, documentNumber, reference, minAmount, maxAmount, savedView === "all" ? "" : savedView].filter(Boolean).length;
  const openRow = (row: CommercialRow) => definition.detailPage ? onNavigate(context.moduleId, definition.detailPage, row.document) : setSelectedRecord(row);
  const isInteractiveTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a, label"));
  return <div className="nx-commerce-page">
    <PageHead definition={definition} context={context}><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Export", context.pageLabel)}>Export</button><button className="nx-button nx-button-primary" type="button" onClick={() => onNavigate(context.moduleId, definition.createPage)}>+ New {definition.noun}</button></PageHead>
    <section className="nx-commerce-kpis"><article><span>Total documents</span><strong>{rows.length}</strong><small>Current result set</small></article><article><span>Open workflow</span><strong>{rows.filter((row) => !/posted|approved|complete|paid/i.test(row.status)).length}</strong><small>Requires follow-up</small></article><article><span>Total value</span><strong>{money(total, rows[0]?.currency ?? "USD")}</strong><small>Current source records</small></article><article><span>Exceptions</span><strong>{rows.filter((row) => /hold|reject|exception/i.test(row.status)).length}</strong><small>Control review queue</small></article></section>
    <section className="nx-card nx-commerce-list">
      <div className="nx-commerce-list__toolbar"><label className="nx-commerce-search"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${definition.noun.toLowerCase()}, party, reference…`} /></label><ListFilterSelect listLabel={context.pageLabel} label={definition.partyLabel} value={party} options={parties} onChange={setParty} /><ListFilterSelect listLabel={context.pageLabel} label="Currency" value={currency} options={currencies} onChange={setCurrency} /><ListFilterSelect listLabel={context.pageLabel} label="Status" value={status} options={statuses} onChange={setStatus} /><button className={activeFilters ? "is-active" : ""} aria-expanded={advancedOpen} type="button" onClick={() => setAdvancedOpen(!advancedOpen)}>More filters{activeFilters ? ` (${activeFilters})` : ""} ▾</button></div>
      <div className="nx-commerce-viewbar"><label><span>Saved view</span><select value={savedView} onChange={(event) => setSavedView(event.target.value)}><option value="open">My open documents</option><option value="approval">Pending approval</option><option value="exceptions">Exceptions</option><option value="all">All documents</option></select></label><label><span>Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as typeof sort)}><option value="date">Document date</option><option value="amount">Amount</option><option value="status">Status</option></select></label><button type="button" onClick={() => setDescending(!descending)}>{descending ? "Descending ↓" : "Ascending ↑"}</button><button type="button" onClick={() => onAction("Save view", context.pageLabel)}>Save current view</button><span>{filtered.length} results</span></div>
      <AdvancedListFilters open={advancedOpen} creators={creators} createdBy={createdBy} createdOn={createdOn} dateRange={dateRange} customFrom={customFrom} customTo={customTo} documentNumber={documentNumber} reference={reference} minAmount={minAmount} maxAmount={maxAmount} onCreatedByChange={setCreatedBy} onCreatedOnChange={setCreatedOn} onDateRangeChange={setDateRange} onCustomFromChange={setCustomFrom} onCustomToChange={setCustomTo} onDocumentNumberChange={setDocumentNumber} onReferenceChange={setReference} onMinAmountChange={setMinAmount} onMaxAmountChange={setMaxAmount} onClear={() => { setCreatedBy(""); setCreatedOn(""); setDateRange("all"); setCustomFrom(""); setCustomTo(""); setStatus(""); setCurrency(""); setParty(""); setDocumentNumber(""); setReference(""); setMinAmount(""); setMaxAmount(""); setSavedView("all"); }} />
      {selected.length ? <div className="nx-commerce-bulk"><strong>{selected.length} selected</strong><button type="button" onClick={() => onAction("Submit", `${selected.length} documents`)}>Submit</button><button type="button" onClick={() => onAction("Assign", `${selected.length} documents`)}>Assign</button><button type="button" onClick={() => onAction("Export", `${selected.length} documents`)}>Export</button><button type="button" onClick={() => setSelected([])}>Clear</button></div> : null}
      <div className="nx-table-wrap"><table className="nx-data-table nx-commerce-table"><thead><tr><th><input aria-label="Select all visible records" checked={filtered.length > 0 && selected.length === filtered.length} type="checkbox" onChange={() => setSelected(selected.length === filtered.length ? [] : filtered.map((row) => row.id))} /></th><th>Document</th><th>Date</th><th>{definition.partyLabel}</th><th>Source / reference</th><th>Workflow stage</th><th className="amount">Amount</th><th>Status</th><th>Owner</th><th /></tr></thead><tbody>{filtered.map((row, index) => <tr className="nx-interactive-row" key={row.id} tabIndex={0} onClick={(event) => { if (!isInteractiveTarget(event.target)) openRow(row); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); openRow(row); } }}><td><input aria-label={`Select ${row.document}`} checked={selected.includes(row.id)} type="checkbox" onChange={() => setSelected((current) => current.includes(row.id) ? current.filter((id) => id !== row.id) : [...current, row.id])} /></td><td><button className="nx-record-link" type="button" onClick={() => openRow(row)}>{row.document}</button><small>Rev {index % 3}</small></td><td>{row.date}</td><td><strong>{row.party}</strong><small>{definition.partyLabel} master linked</small></td><td>{row.reference}</td><td><span className="nx-commerce-stage">{definition.workflow[index % definition.workflow.length]}</span></td><td className="amount"><strong>{row.amount}</strong></td><td><CommercialStatus status={row.status} /></td><td>{row.owner}</td><td><button className="nx-row-menu" aria-label={`Actions for ${row.document}`} type="button" onClick={() => onAction("More actions", row.document)}>•••</button></td></tr>)}</tbody></table></div>
      {!filtered.length ? <div className="nx-commerce-empty"><b>⌕</b><strong>No documents match this view</strong><p>Adjust the filters or clear the saved view criteria.</p><button type="button" onClick={() => { setQuery(""); setStatus(""); setCurrency(""); setParty(""); }}>Clear filters</button></div> : null}
      <footer className="nx-commerce-pagination"><span>Showing {filtered.length} of {rows.length} current prototype records</span><div><button disabled type="button">Previous</button><button className="active" type="button">1</button><button type="button">Next</button></div></footer>
    </section>
    <RecordPreviewDrawer record={selectedRecord} recordType={definition.noun} partyLabel={definition.partyLabel} onClose={() => setSelectedRecord(null)} onAction={onAction} />
  </div>;
}

interface DraftLine { id: string; item: string; description: string; quantity: number; rate: number; discount: number; tax: number; }

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained as a rollback reference during the visual prototype review.
function LegacyCommercialEntryView({ context, rows, definition, onAction, onNavigate }: CommercialWorkspaceProps & { definition: CommercialDefinition }) {
  const [party, setParty] = useState(rows[0]?.party ?? ""); const [currency, setCurrency] = useState(rows[0]?.currency ?? "USD"); const [source, setSource] = useState(rows[0]?.document ?? "");
  const [lines, setLines] = useState<DraftLine[]>(() => rows.slice(0, 3).map((row, index) => { const quantity = index + 1; return { id: row.id, item: row.reference, description: `${definition.noun} line from ${row.document}`, quantity, rate: Math.round(amountValue(row.amount) / quantity * 100) / 100, discount: index === 1 ? 2.5 : 0, tax: 18 }; }));
  const [activeLine, setActiveLine] = useState(lines[0]?.id ?? ""); const [showAccounting, setShowAccounting] = useState(false); const [validated, setValidated] = useState(false);
  const parties = [...new Set(rows.map((row) => row.party))]; const sources = [...new Set(rows.map((row) => row.document))];
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.rate * (1 - line.discount / 100), 0);
  const tax = lines.reduce((sum, line) => sum + line.quantity * line.rate * (1 - line.discount / 100) * line.tax / 100, 0); const total = subtotal + tax;
  const updateLine = (id: string, field: keyof DraftLine, value: string | number) => setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  return <div className="nx-commerce-page">
    <PageHead definition={definition} context={context}><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate(context.moduleId, definition.listPage)}>Cancel</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Save draft", definition.noun)}>Save draft</button><button className="nx-button nx-button-secondary" type="button" onClick={() => { setValidated(true); onAction("Validate", definition.noun); }}>Validate</button><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Save and submit", definition.noun)}>Save & submit</button></PageHead>
    <WorkflowStrip definition={definition} />
    <div className="nx-commerce-entry nx-workspace-form nx-workspace-form--commerce"><div>
      <section className="nx-card nx-commerce-section">
        <div className="nx-commerce-section__head"><div><span>01 · Document setup</span><h2>Commercial context</h2><p>Choose the party and source first; defaults and controls follow that context.</p></div><span className="nx-commerce-autosave">● Draft saved just now</span></div>
        <div className="nx-commerce-fields">
          <label><span>Document number</span><input value="Auto-generated on save" disabled /></label><label><span>Document date *</span><input type="date" defaultValue="2026-09-09" /></label>
          <label><span>{definition.partyLabel} *</span><input list="commerce-parties" value={party} onChange={(event) => setParty(event.target.value)} placeholder={`Search ${definition.partyLabel.toLowerCase()} by name or code`} /><datalist id="commerce-parties">{parties.map((item) => <option key={item} value={item} />)}</datalist></label>
          <label><span>{definition.sourceLabel}</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Create without source</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
          <label><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}>{[...new Set(rows.map((row) => row.currency))].map((item) => <option key={item}>{item}</option>)}</select></label><label><span>Required / due date</span><input type="date" defaultValue="2026-09-30" /></label>
          <label className="wide"><span>Business purpose *</span><textarea rows={2} placeholder="Explain the commercial need, delivery expectation, or customer commitment." /></label>
        </div>
        <div className="nx-commerce-party-context"><div><span>{definition.partyLabel}</span><strong>{party || `Select a ${definition.partyLabel.toLowerCase()}`}</strong><small>Master, tax and payment terms linked</small></div><div><span>Open source documents</span><strong>{rows.length}</strong><small>From the current workspace records</small></div><div><span>{definition.partyLabel === "Customer" ? "Credit control" : "Supplier control"}</span><strong>Check on submit</strong><small>Live balance requires connected data</small></div><div><span>Price intelligence</span><strong>Context ready</strong><small>Previous prices load after item selection</small></div></div>
      </section>
      <section className="nx-card nx-commerce-section nx-commerce-lines">
        <div className="nx-commerce-section__head"><div><span>02 · Line entry</span><h2>Products, services and values</h2><p>Keyboard-friendly inline entry with immediate commercial calculation.</p></div><div><button type="button" onClick={() => onAction("Import lines", definition.noun)}>Import</button><button className="primary" type="button" onClick={() => { const id = `line-${Date.now()}`; setLines((current) => [...current, { id, item: "", description: "", quantity: 1, rate: 0, discount: 0, tax: 0 }]); setActiveLine(id); }}>+ Add line</button></div></div>
        <div className="nx-commerce-line-tools"><button type="button" onClick={() => onAction("Copy source lines", source)}>Copy source lines</button><button type="button" onClick={() => onAction("Apply tax defaults", definition.noun)}>Apply tax defaults</button><button type="button" onClick={() => onAction("Distribute charges", definition.noun)}>Distribute charges</button><span>Tip: press Tab to move across fields</span></div>
        <div className="nx-table-wrap"><table className="nx-commerce-edit-table"><thead><tr><th>#</th><th>Product / service *</th><th>Description</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Disc. %</th><th>Tax %</th><th>Net</th><th /></tr></thead><tbody>{lines.map((line, index) => {
          const net = line.quantity * line.rate * (1 - line.discount / 100) * (1 + line.tax / 100);
          return <tr className={activeLine === line.id ? "active" : ""} key={line.id} onFocus={() => setActiveLine(line.id)}>
            <td>{index + 1}</td><td><input aria-label={`Product line ${index + 1}`} value={line.item} onChange={(event) => updateLine(line.id, "item", event.target.value)} placeholder="Search SKU or description" /><small>Stock: select item · Pending: source controlled</small></td><td><input value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} /></td>
            <td><input min="0" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", Number(event.target.value))} /></td><td><select defaultValue="Each"><option>Each</option><option>Hour</option><option>Kg</option><option>Box</option></select></td>
            <td><input min="0" step="0.01" type="number" value={line.rate} onChange={(event) => updateLine(line.id, "rate", Number(event.target.value))} /><small>Previous price: load from source</small></td><td><input min="0" max="100" step="0.1" type="number" value={line.discount} onChange={(event) => updateLine(line.id, "discount", Number(event.target.value))} /></td><td><input min="0" max="100" step="0.1" type="number" value={line.tax} onChange={(event) => updateLine(line.id, "tax", Number(event.target.value))} /></td>
            <td className="amount"><strong>{money(net, currency)}</strong><small>{definition.partyLabel === "Customer" ? "Margin check on submit" : "Budget check on submit"}</small></td><td><button aria-label={`Delete line ${index + 1}`} type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>×</button></td>
          </tr>;
        })}</tbody></table></div>
        <div className="nx-commerce-calculation"><label><span>Document discount</span><div><input defaultValue="0" type="number" /><select><option>%</option><option>{currency}</option></select></div></label><label><span>Freight / charges</span><input defaultValue="0.00" type="number" /></label><div><span>Subtotal</span><strong>{money(subtotal, currency)}</strong><span>Tax</span><strong>{money(tax, currency)}</strong><b>Document total</b><b>{money(total, currency)}</b></div></div>
      </section>
      <section className="nx-card nx-commerce-section"><div className="nx-commerce-section__head"><div><span>03 · Terms & fulfilment</span><h2>Delivery, payment and ownership</h2></div></div><div className="nx-commerce-fields"><label><span>Payment terms</span><select><option>As per party master</option><option>Due on receipt</option><option>Net 30</option><option>Net 60</option></select></label><label><span>{definition.partyLabel === "Customer" ? "Ship from" : "Deliver to"}</span><select><option>Head Office / Main Warehouse</option><option>Project site</option></select></label><label><span>Department</span><select><option>Operations</option><option>Sales</option><option>Production</option><option>Corporate</option></select></label><label><span>Project / cost centre</span><input placeholder="Search project or cost centre" /></label><label className="wide"><span>Terms, notes and internal instructions</span><textarea rows={3} placeholder="Add delivery terms, quality requirements, customer notes or internal instructions." /></label><label className="wide nx-commerce-upload"><span>Attachments & evidence</span><input type="file" multiple /><small>Drag quotations, specifications, receipts or approvals here.</small></label></div></section>
    </div><aside className="nx-commerce-aside">
      <section className="nx-card nx-commerce-health"><div><span>Document health</span><CommercialStatus status={validated ? "Validated" : "Review needed"} /></div><ul><li className="pass"><b>✓</b><span><strong>Party selected</strong><small>Master context is available</small></span></li><li className={lines.length ? "pass" : "warn"}><b>{lines.length ? "✓" : "!"}</b><span><strong>Line items</strong><small>{lines.length} line(s) entered</small></span></li><li className="warn"><b>!</b><span><strong>{definition.partyLabel === "Customer" ? "Credit & margin" : "Budget & commitment"}</strong><small>Runs when the document is validated</small></span></li><li><b>○</b><span><strong>Approval route</strong><small>Determined from amount and dimensions</small></span></li></ul></section>
      <section className="nx-card nx-commerce-related"><div><span>Source continuity</span><h3>Related documents</h3></div><button type="button" onClick={() => onAction("View source", source)}><i>01</i><span><strong>{definition.sourceLabel}</strong><small>{source || "No source selected"}</small></span><b>›</b></button><button type="button" onClick={() => onAction("View workflow", definition.noun)}><i>02</i><span><strong>Workflow map</strong><small>{definition.workflow.join(" → ")}</small></span><b>›</b></button></section>
      <section className="nx-card nx-commerce-summary"><span>Amount payable / receivable</span><strong>{money(total, currency)}</strong><small>{lines.length} line(s) · tax {money(tax, currency)}</small><button type="button" onClick={() => setShowAccounting(!showAccounting)}>Accounting preview {showAccounting ? "−" : "+"}</button>{showAccounting ? <div><p><span>{definition.partyLabel === "Customer" ? "Trade receivables" : "Expense / inventory"}</span><strong>{money(total, currency)}</strong></p><p><span>{definition.partyLabel === "Customer" ? "Revenue & tax" : "Trade payables"}</span><strong>{money(total, currency)}</strong></p><small>Indicative preview; posting rules run after approval.</small></div> : null}</section>
    </aside></div>
  </div>;
}

function CommercialEntryView({ context, rows, definition, onAction, onNavigate }: CommercialWorkspaceProps & { definition: CommercialDefinition }) {
  const [party, setParty] = useState(rows[0]?.party ?? "");
  const [currency, setCurrency] = useState(rows[0]?.currency ?? "USD");
  const [source, setSource] = useState(rows[0]?.document ?? "");
  const [validated, setValidated] = useState(false);
  const [activeLine, setActiveLine] = useState("");
  const [lineTab, setLineTab] = useState<"lines" | "expenses" | "accounting" | "other">("lines");
  const [chatterTab, setChatterTab] = useState<"activity" | "notes" | "files">("activity");
  const [lines, setLines] = useState<DraftLine[]>(() => rows.slice(0, 3).map((row, index) => {
    const quantity = index + 1;
    return { id: row.id, item: row.reference, description: `${definition.noun} line from ${row.document}`, quantity, rate: Math.round(amountValue(row.amount) / quantity * 100) / 100, discount: index === 1 ? 2.5 : 0, tax: 18 };
  }));
  const parties = [...new Set(rows.map((row) => row.party))];
  const sources = [...new Set(rows.map((row) => row.document))];
  const currencies = [...new Set(rows.map((row) => row.currency))];
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.rate * (1 - line.discount / 100), 0);
  const tax = lines.reduce((sum, line) => sum + line.quantity * line.rate * (1 - line.discount / 100) * line.tax / 100, 0);
  const total = subtotal + tax;
  const updateLine = (id: string, field: keyof DraftLine, value: string | number) => setLines((current) => current.map((line) => line.id === id ? { ...line, [field]: value } : line));
  const isPurchaseBill = definition.family === "purchase-bill";
  const tabItems = [["lines", "Products & services", lines.length], ["expenses", "Expense allocation", 1], ["accounting", "Journal preview", 2], ["other", "Other information", 0]] as const;

  return <div className="nx-commerce-page">
    <PageHead definition={definition} context={context}><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate(context.moduleId, definition.listPage)}>Close</button></PageHead>
    <section className="nx-document-commandbar" aria-label="Document actions">
      <div className="nx-document-commandbar__actions">
        <button className="primary" type="button" onClick={() => { setValidated(true); onAction("Validate", definition.noun); }}>{validated ? "Validated" : "Validate"}</button>
        <button type="button" onClick={() => onAction("Save draft", definition.noun)}>Save draft</button>
        <button type="button" onClick={() => onAction("Discard changes", definition.noun)}>Discard</button>
        <button type="button" onClick={() => onAction("More actions", definition.noun)}>More actions</button>
      </div>
      <ol className="nx-document-stateflow" aria-label="Document lifecycle">{definition.workflow.map((step, index) => <li className={index === (validated ? 2 : 0) ? "current" : index < (validated ? 2 : 0) ? "complete" : ""} key={`${step}-${index}`}><i>{index < (validated ? 2 : 0) ? "OK" : index + 1}</i><span>{step}</span></li>)}</ol>
      <span className="nx-document-save-state"><i /> All changes saved</span>
    </section>

    <div className="nx-commerce-entry nx-workspace-form nx-workspace-form--commerce nx-document-workbench">
      <main className="nx-document-sheet">
        <header className="nx-document-sheet__identity">
          <div><span>{definition.noun}</span><h2>New {definition.noun}</h2><p>Document number is generated when the draft is saved.</p></div>
          <div><CommercialStatus status={validated ? "Validated" : "Draft"} /><strong>{money(total, currency)}</strong></div>
        </header>

        <section className="nx-document-header-grid">
          <div className="nx-document-field-column">
            <label className="nx-document-party-field"><span>{definition.partyLabel} *</span><input list="commerce-parties" value={party} onChange={(event) => setParty(event.target.value)} placeholder={`Search ${definition.partyLabel.toLowerCase()} by name, code or tax ID`} /><datalist id="commerce-parties">{parties.map((item) => <option key={item} value={item} />)}</datalist><small>{party ? "Master profile, tax treatment and payment terms connected." : "Required before validation."}</small></label>
            <label><span>{definition.sourceLabel}</span><select value={source} onChange={(event) => setSource(event.target.value)}><option value="">Create without source</option>{sources.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>{isPurchaseBill ? "Supplier bill reference" : "External reference"}</span><input placeholder={isPurchaseBill ? "Enter supplier invoice number" : "Enter customer or supplier reference"} /></label>
            <label><span>Billing / delivery address</span><textarea rows={2} defaultValue={party ? "Master address will be used for this document." : ""} placeholder="Select a party to load its address" /></label>
          </div>
          <div className="nx-document-field-column nx-document-field-column--compact">
            <label><span>Document date *</span><input type="date" defaultValue="2026-09-14" /></label>
            <label><span>Required / due date *</span><input type="date" defaultValue="2026-09-30" /></label>
            <label><span>Payment terms</span><select><option>As per party master</option><option>Due on receipt</option><option>Net 30</option><option>Net 60</option></select></label>
            <label><span>Currency</span><select value={currency} onChange={(event) => setCurrency(event.target.value)}>{currencies.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label><span>{isPurchaseBill ? "Purchase journal" : "Operation type"}</span><select><option>{isPurchaseBill ? "Vendor Bills" : "Standard commercial flow"}</option><option>Project / service transaction</option></select></label>
            <label><span>Branch / location</span><select><option>Head Office</option><option>Main Warehouse</option><option>Project Site</option></select></label>
          </div>
        </section>

        <section className="nx-document-context-strip">
          <div><span>{definition.partyLabel} status</span><strong>{party ? "Active and verified" : "Selection required"}</strong><small>Master and tax profile</small></div>
          <div><span>Open source documents</span><strong>{rows.length}</strong><small>Available for matching</small></div>
          <div><span>{definition.partyLabel === "Customer" ? "Credit & margin" : "Budget & variance"}</span><strong>Runs on validate</strong><small>Policy-based control</small></div>
          <div><span>Document owner</span><strong>demo.admin</strong><small>Finance Operations</small></div>
        </section>

        <nav className="nx-document-tabs" aria-label="Document entry sections">{tabItems.map(([id, label, count]) => <button className={lineTab === id ? "active" : ""} type="button" key={id} onClick={() => setLineTab(id)}>{label}{count ? <small>{count}</small> : null}</button>)}</nav>
        <section className="nx-document-tabpanel">
          {lineTab === "lines" ? <>
            <div className="nx-commerce-line-tools"><button type="button" onClick={() => onAction("Copy source lines", source)}>Copy source lines</button><button type="button" onClick={() => onAction("Import lines", definition.noun)}>Import</button><button type="button" onClick={() => onAction("Apply tax defaults", definition.noun)}>Tax defaults</button><button type="button" onClick={() => onAction("Distribute charges", definition.noun)}>Allocate charges</button><button className="primary" type="button" onClick={() => { const id = `line-${Date.now()}`; setLines((current) => [...current, { id, item: "", description: "", quantity: 1, rate: 0, discount: 0, tax: 0 }]); setActiveLine(id); }}>+ Add line</button><span>Tab moves across cells</span></div>
            <div className="nx-table-wrap"><table className="nx-commerce-edit-table nx-document-line-grid"><thead><tr><th>#</th><th>Product / service *</th><th>Description</th><th>Account / project</th><th>Qty</th><th>UOM</th><th>Rate</th><th>Disc. %</th><th>Tax %</th><th>Net</th><th /></tr></thead><tbody>{lines.map((line, index) => {
              const net = line.quantity * line.rate * (1 - line.discount / 100) * (1 + line.tax / 100);
              return <tr className={activeLine === line.id ? "active" : ""} key={line.id} onFocus={() => setActiveLine(line.id)}>
                <td>{index + 1}</td><td><input aria-label={`Product line ${index + 1}`} value={line.item} onChange={(event) => updateLine(line.id, "item", event.target.value)} placeholder="Search SKU, service or description" /><small>Stock and pending quantity load after selection</small></td><td><input value={line.description} onChange={(event) => updateLine(line.id, "description", event.target.value)} /></td><td><input placeholder="Nominal / cost centre" /></td>
                <td><input min="0" type="number" value={line.quantity} onChange={(event) => updateLine(line.id, "quantity", Number(event.target.value))} /></td><td><select defaultValue="Each"><option>Each</option><option>Hour</option><option>Kg</option><option>Box</option></select></td>
                <td><input min="0" step="0.01" type="number" value={line.rate} onChange={(event) => updateLine(line.id, "rate", Number(event.target.value))} /><small>Previous price loads from source</small></td><td><input min="0" max="100" step="0.1" type="number" value={line.discount} onChange={(event) => updateLine(line.id, "discount", Number(event.target.value))} /></td><td><input min="0" max="100" step="0.1" type="number" value={line.tax} onChange={(event) => updateLine(line.id, "tax", Number(event.target.value))} /></td>
                <td className="amount"><strong>{money(net, currency)}</strong><small>{definition.partyLabel === "Customer" ? "Margin control" : "Budget control"}</small></td><td><button aria-label={`Delete line ${index + 1}`} type="button" onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))}>x</button></td>
              </tr>;
            })}</tbody></table></div>
          </> : lineTab === "expenses" ? <>
            <div className="nx-commerce-line-tools"><button className="primary" type="button" onClick={() => onAction("Add expense line", definition.noun)}>+ Add expense</button><button type="button" onClick={() => onAction("Allocate by amount", definition.noun)}>Allocate by amount</button><button type="button" onClick={() => onAction("Allocate by quantity", definition.noun)}>Allocate by quantity</button><span>Freight, duties and non-stock charges</span></div>
            <div className="nx-table-wrap"><table className="nx-expense-grid"><thead><tr><th>Expense nominal</th><th>Description</th><th>Project / cost centre</th><th>Amount</th><th>Discount</th><th>Tax code</th><th>Allocation</th></tr></thead><tbody><tr><td><input placeholder="Search expense account" /></td><td><input placeholder="Freight, duty or service charge" /></td><td><input placeholder="Project / department" /></td><td><input defaultValue="0.00" type="number" /></td><td><input defaultValue="0.00" type="number" /></td><td><select><option>Standard tax</option><option>Zero rated</option><option>Exempt</option></select></td><td><select><option>Document level</option><option>Selected lines</option></select></td></tr></tbody></table></div>
          </> : lineTab === "accounting" ? <div className="nx-document-accounting">
            <header><div><span>Indicative journal</span><h3>Balanced accounting preview</h3></div><button type="button" onClick={() => onAction("Refresh accounting preview", definition.noun)}>Refresh rules</button></header>
            <table><thead><tr><th>Account</th><th>Label</th><th>Dimension</th><th className="amount">Debit</th><th className="amount">Credit</th></tr></thead><tbody><tr><td>{definition.partyLabel === "Customer" ? "110201" : "510201"}</td><td>{definition.partyLabel === "Customer" ? "Trade receivables" : "Expense / inventory"}</td><td>Head Office / Operations</td><td className="amount">{money(total, currency)}</td><td className="amount">-</td></tr><tr><td>{definition.partyLabel === "Customer" ? "410101" : "210201"}</td><td>{definition.partyLabel === "Customer" ? "Revenue and output tax" : "Trade payables"}</td><td>Party control account</td><td className="amount">-</td><td className="amount">{money(total, currency)}</td></tr></tbody><tfoot><tr><th colSpan={3}>Balanced total</th><th className="amount">{money(total, currency)}</th><th className="amount">{money(total, currency)}</th></tr></tfoot></table>
            <p>Preview only. Final accounts, taxes and dimensions are resolved by configured posting rules after approval.</p>
          </div> : <div className="nx-commerce-fields nx-document-other-fields"><label><span>{definition.partyLabel === "Customer" ? "Ship from" : "Deliver to"}</span><select><option>Head Office / Main Warehouse</option><option>Project site</option></select></label><label><span>Department</span><select><option>Operations</option><option>Sales</option><option>Production</option><option>Corporate</option></select></label><label><span>Project / cost centre</span><input placeholder="Search project or cost centre" /></label><label><span>Responsible person</span><input defaultValue="demo.admin" /></label><label className="wide"><span>Terms, notes and internal instructions</span><textarea rows={4} placeholder="Add delivery terms, quality requirements, customer notes or internal instructions." /></label><label className="wide nx-commerce-upload"><span>Attachments & evidence</span><input type="file" multiple /><small>Attach quotations, specifications, receipts or approvals.</small></label></div>}
        </section>

        <footer className="nx-document-footer">
          <label><span>Internal memo / terms</span><textarea rows={3} placeholder="Add information that should travel with this document." /></label>
          <div className="nx-commerce-calculation"><label><span>Document discount</span><div><input defaultValue="0" type="number" /><select><option>%</option><option>{currency}</option></select></div></label><label><span>Freight / charges</span><input defaultValue="0.00" type="number" /></label><div><span>Untaxed amount</span><strong>{money(subtotal, currency)}</strong><span>Tax</span><strong>{money(tax, currency)}</strong><b>Total</b><b>{money(total, currency)}</b></div></div>
        </footer>
      </main>

      <aside className="nx-commerce-aside nx-document-rail">
        <section className="nx-card nx-document-chatter">
          <div className="nx-document-chatter__actions"><button type="button" onClick={() => onAction("Send message", definition.noun)}>Send message</button><button type="button" onClick={() => onAction("Log note", definition.noun)}>Log note</button><button type="button" onClick={() => onAction("Schedule activity", definition.noun)}>Schedule</button></div>
          <nav aria-label="Collaboration panel"><button className={chatterTab === "activity" ? "active" : ""} type="button" onClick={() => setChatterTab("activity")}>Activity</button><button className={chatterTab === "notes" ? "active" : ""} type="button" onClick={() => setChatterTab("notes")}>Notes</button><button className={chatterTab === "files" ? "active" : ""} type="button" onClick={() => setChatterTab("files")}>Files</button></nav>
          {chatterTab === "activity" ? <div className="nx-chatter-feed"><article><i>DA</i><div><strong>demo.admin</strong><small>Just now</small><p>Created a new {definition.noun.toLowerCase()} draft.</p></div></article><article><i>WF</i><div><strong>Workflow assistant</strong><small>Control pending</small><p>Select the party and validate the document to calculate its approval route.</p></div></article></div> : chatterTab === "notes" ? <div className="nx-chatter-compose"><textarea rows={5} placeholder="Write an internal note for reviewers..." /><button type="button" onClick={() => onAction("Add internal note", definition.noun)}>Add note</button></div> : <div className="nx-chatter-files"><strong>No files attached</strong><p>Add source evidence without leaving the document.</p><button type="button" onClick={() => onAction("Upload file", definition.noun)}>Upload file</button></div>}
        </section>
        <section className="nx-card nx-commerce-health"><div><span>Document health</span><CommercialStatus status={validated ? "Validated" : "Review needed"} /></div><ul><li className={party ? "pass" : "warn"}><b>{party ? "OK" : "!"}</b><span><strong>Party and master data</strong><small>{party ? "Required context is available" : "Select a party to continue"}</small></span></li><li className={lines.length ? "pass" : "warn"}><b>{lines.length ? "OK" : "!"}</b><span><strong>Line items</strong><small>{lines.length} line(s) entered</small></span></li><li className="warn"><b>!</b><span><strong>{definition.partyLabel === "Customer" ? "Credit and margin" : "Budget and commitment"}</strong><small>Runs when the document is validated</small></span></li></ul></section>
        <section className="nx-card nx-commerce-related"><div><span>Document continuity</span><h3>Related records</h3></div><button type="button" onClick={() => onAction("View source", source)}><i>01</i><span><strong>{definition.sourceLabel}</strong><small>{source || "No source selected"}</small></span><b>&gt;</b></button><button type="button" onClick={() => onAction("View workflow", definition.noun)}><i>02</i><span><strong>Approval route</strong><small>{definition.workflow.join(" -> ")}</small></span><b>&gt;</b></button></section>
        <section className="nx-card nx-commerce-summary"><span>Payable / receivable</span><strong>{money(total, currency)}</strong><small>{lines.length} line(s) - tax {money(tax, currency)}</small><button type="button" onClick={() => setLineTab("accounting")}>Open journal preview</button></section>
      </aside>
    </div>
    <EnterpriseTransactionControl
      subject={definition.noun}
      reference={source || `${context.moduleCode}-AUTO`}
      roleId={context.roleId}
      companyMode={context.companyMode}
      family={definition.partyLabel === "Customer" ? "commercial" : "procurement"}
      onAction={onAction}
    />
    <div className="nx-document-bottom-actions"><span><i /> Draft is stored in this prototype session</span><div><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate(context.moduleId, definition.listPage)}>Cancel</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Save draft", definition.noun)}>Save draft</button><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Save and submit", definition.noun)}>Save & submit</button></div></div>
  </div>;
}

/** Which printable document a commercial family produces. */
function documentKindFor(family: string): DocumentKind {
  if (family === "purchase-order" || family === "requisition" || family === "rfq") return "purchase-order";
  if (family === "purchase-payment" || family === "sales-receipt") return "journal-voucher";
  if (family === "purchase-bill") return "invoice";
  return "invoice";
}

function CommercialDetailView({ context, rows, definition, onAction, onNavigate }: CommercialWorkspaceProps & { definition: CommercialDefinition }) {
  const record = rows.find((row) => row.document === context.recordRef) ?? rows[0]; const [tab, setTab] = useState("Overview");
  const tabs = ["Overview", "Lines", "Document", "Fulfilment & matching", "Accounting", "Approvals", "Attachments", "Audit trail"];
  return <div className="nx-commerce-page">
    <PageHead definition={definition} context={{ ...context, pageLabel: `${definition.noun} · ${record.document}` }}><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate(context.moduleId, definition.listPage)}>Back to list</button><button className="nx-button nx-button-secondary" type="button" onClick={() => { setTab("Document"); onAction("Open document", record.document); }}>Print / document</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Edit", record.document)}>Edit</button><button className="nx-button nx-button-primary" type="button" onClick={() => onNavigate(definition.nextModule, definition.nextPage)}>{definition.nextLabel}</button></PageHead>
    <WorkflowStrip definition={definition} active={3} />
    <section className="nx-commerce-record-strip"><div><span>{definition.partyLabel}</span><strong>{record.party}</strong><small>Master profile linked</small></div><div><span>Document date</span><strong>{record.date}</strong><small>{record.reference}</small></div><div><span>Total</span><strong>{record.amount}</strong><small>{record.currency}</small></div><div><span>Status</span><CommercialStatus status={record.status} /><small>Owned by {record.owner}</small></div><div><span>Control result</span><strong>No blocking errors</strong><small>Review warnings below</small></div></section>
    <RecordProvenance document={record.document} owner={record.owner} date={record.date} reference={record.reference} status={record.status} onAction={onAction} />
    <nav className="nx-commerce-tabs" aria-label="Document sections">{tabs.map((item) => <button className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{item}{item === "Attachments" ? " · 2" : ""}</button>)}</nav>
    <div className="nx-commerce-detail">{tab === "Document" ? <div className="nx-commerce-detail__document"><NexoraDocument kind={documentKindFor(definition.family)} record={{ document: record.document, party: record.party, date: record.date, reference: record.reference, currency: record.currency, owner: record.owner }} lines={documentLinesFrom(rows)} onAction={onAction} /></div> : <div className="nx-card nx-commerce-detail__main">
      <div className="nx-commerce-section__head"><div><span>{tab}</span><h2>{tab === "Overview" ? "Document intelligence" : `${tab} details`}</h2></div><button type="button" onClick={() => onAction("Export", `${record.document} · ${tab}`)}>Export</button></div>
      {tab === "Overview" ? <><div className="nx-commerce-insights"><article><span>Source coverage</span><strong>Connected</strong><small>{definition.sourceLabel}: {record.reference}</small></article><article><span>{definition.partyLabel === "Customer" ? "Credit exposure" : "Commitment impact"}</span><strong>Review ready</strong><small>Requires connected balance service</small></article><article><span>{definition.partyLabel === "Customer" ? "Margin control" : "Price variance"}</span><strong>Within workflow</strong><small>Line-level review available</small></article></div><div className="nx-commerce-field-summary">{[["External reference", record.reference], ["Currency", record.currency], ["Owner", record.owner], ["Department", "Operations"], ["Terms", "Party master default"], ["Last updated", "Current prototype session"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div><div className="nx-commerce-callout"><b>!</b><div><strong>Control reminder</strong><p>Live credit, stock, tax, budget and duplicate checks appear here when their source services are connected.</p></div><button type="button" onClick={() => onAction("Run controls", record.document)}>Run controls</button></div></> : tab === "Lines" || tab === "Fulfilment & matching" ? <div className="nx-table-wrap"><table className="nx-data-table"><thead><tr><th>Line</th><th>Product / service</th><th>Source</th><th>Ordered</th><th>Processed</th><th>Pending</th><th className="amount">Amount</th><th>Match</th></tr></thead><tbody>{rows.slice(0, 4).map((row, index) => <tr key={row.id}><td>{index + 1}</td><td><strong>{row.reference}</strong><small>Item context available on selection</small></td><td>{row.document}</td><td>{index + 1}.00</td><td>{index}.00</td><td>{index ? "1.00" : "—"}</td><td className="amount">{row.amount}</td><td><CommercialStatus status={index === 2 ? "Review" : "Matched"} /></td></tr>)}</tbody></table></div> : <div className="nx-commerce-timeline">{rows.slice(0, 5).map((row, index) => <article key={row.id}><i>{index ? "✓" : "●"}</i><div><strong>{tab === "Approvals" ? definition.workflow[Math.min(index, definition.workflow.length - 1)] : `${tab} event ${index + 1}`}</strong><span>{row.owner}</span><small>{row.date} · {row.reference}</small></div><button type="button" onClick={() => onAction("View", row.document)}>View</button></article>)}</div>}
    </div>}<aside>
      <section className="nx-card nx-commerce-related"><div><span>Document chain</span><h3>Source to settlement</h3></div>{definition.workflow.map((step, index) => <button key={step} type="button" onClick={() => onAction("Drill down", step)}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{step}</strong><small>{index < 3 ? rows[index % rows.length].document : "Pending next action"}</small></span><b>›</b></button>)}</section>
      <section className="nx-card nx-commerce-summary"><span>Document value</span><strong>{record.amount}</strong><small>Tax and allocation shown in Lines</small><button type="button" onClick={() => onAction("View ledger impact", record.document)}>View accounting impact →</button></section>
      <section className="nx-card nx-commerce-next"><span>Recommended next action</span><strong>{definition.nextLabel}</strong><p>Continue without re-entering source lines or commercial terms.</p><button type="button" onClick={() => onNavigate(definition.nextModule, definition.nextPage)}>Continue workflow →</button></section>
    </aside></div>
  </div>;
}

function CommercialDecisionView({ context, rows, definition, onAction, onNavigate }: CommercialWorkspaceProps & { definition: CommercialDefinition }) {
  const record = rows[0]; const isApproval = /approval|evaluation|recommendation|exception/i.test(context.pageId);
  return <div className="nx-commerce-page">
    <PageHead definition={definition} context={context}><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate(context.moduleId, definition.listPage)}>Back</button>{isApproval ? <><button className="nx-button nx-button-danger" type="button" onClick={() => onAction("Reject", record.document)}>Reject</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Return for revision", record.document)}>Return</button><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Approve", record.document)}>Approve</button></> : <button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Complete", context.pageLabel)}>Complete stage</button>}</PageHead>
    <WorkflowStrip definition={definition} active={2} />
    <div className="nx-commerce-decision"><div>
      <section className="nx-card nx-commerce-decision__hero"><div><span>{isApproval ? "Decision request" : "Execution workbench"}</span><h2>{record.document}</h2><p>{record.party} · {record.reference}</p></div><div><strong>{record.amount}</strong><CommercialStatus status={isApproval ? "Pending approval" : "In progress"} /></div></section>
      <section className="nx-card nx-commerce-controls"><div className="nx-commerce-section__head"><div><span>Automated controls</span><h2>Evidence before decision</h2></div><button type="button" onClick={() => onAction("Refresh controls", record.document)}>Refresh</button></div><div>{[["Source document", "Passed", `${definition.sourceLabel} is linked`], [definition.partyLabel === "Customer" ? "Credit limit" : "Budget availability", "Review", "Connected-data result appears here"], ["Price & quantity tolerance", "Passed", "No blocking variance in current view"], ["Tax & master data", "Passed", "Required fields are complete"], ["Segregation of duties", "Passed", "Requester cannot final-approve"]].map(([label, status, copy]) => <article key={label}><i className={status === "Passed" ? "pass" : "warn"}>{status === "Passed" ? "✓" : "!"}</i><span><strong>{label}</strong><small>{copy}</small></span><CommercialStatus status={status} /></article>)}</div></section>
      <section className="nx-card nx-commerce-comment"><span>Decision comment</span><textarea rows={4} placeholder="Add a clear reason, condition, or instruction for the audit trail." /><div><label><input type="checkbox" /> Notify requester and next approver</label><button type="button" onClick={() => onAction("Add comment", record.document)}>Add comment</button></div></section>
    </div><aside><section className="nx-card nx-commerce-related"><div><span>Related evidence</span><h3>Document chain</h3></div>{rows.slice(0, 4).map((row, index) => <button key={row.id} type="button" onClick={() => onAction("View", row.document)}><i>{String(index + 1).padStart(2, "0")}</i><span><strong>{row.document}</strong><small>{row.reference}</small></span><b>›</b></button>)}</section><section className="nx-card nx-commerce-timeline-card"><span>Approval history</span>{rows.slice(0, 4).map((row, index) => <div key={row.id}><i className={index ? "complete" : "current"}>{index ? "✓" : "●"}</i><span><strong>{index ? "Reviewed" : "Current reviewer"}</strong><small>{row.owner} · {row.date}</small></span></div>)}</section></aside></div>
  </div>;
}

export function CommercialWorkspace(props: CommercialWorkspaceProps) {
  const definition = useMemo(() => definitionFor(props.context.pageId), [props.context.pageId]); const type = props.context.archetype.toLowerCase();
  if (type.includes("form") || type.includes("create") || type.includes("edit")) return <CommercialEntryView {...props} definition={definition} />;
  if (type.includes("detail") || type.includes("profile")) return <CommercialDetailView {...props} definition={definition} />;
  if (type.includes("approval") || type.includes("workflow") || type.includes("report")) return <CommercialDecisionView {...props} definition={definition} />;
  return <CommercialListView {...props} definition={definition} />;
}
