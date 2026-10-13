"use client";

import { useMemo, useState } from "react";
import type { CompanyMode } from "./mock-data";
import { RoleDashboard } from "./role-dashboard";
import { getRoleDashboard } from "./role-dashboard-data";
import { getModulePageProfile } from "./module-profiles";
import { getDrillEntry, getChain, getFactView } from "./drill/registry.ts";
import { DrillRenderer } from "./drill/drill-renderer.tsx";
import type { ModulePageProfile } from "./module-profile-types";
import { bankAccounts } from "./banking-master-data";
import { BankingTransactionForm } from "./banking-transaction-form";
import { BankAccountDetail, BankingTransactionDetail } from "./banking-transaction-detail";
import { BankingBatchEntry } from "./banking-batch-entry";
import { BankAccountBalances, BankStatement } from "./banking-statement";
import { BankingReconciliation } from "./banking-reconciliation";
import {
  findReconciliation,
  reconciliationRegister,
  type ReconciliationRecord,
} from "./banking-reconciliation-data";
import { BankingReconciliationRegister } from "./banking-reconciliation-register";
import { BankingReconciliationWorksheet } from "./banking-reconciliation-worksheet";
import { HrMasterScreen, HrOrgStructure, hrMasterForPage } from "./hr-master-screens";
import { HrAttendanceScreen, isHrAttendancePage } from "./hr-attendance-screens";
import { HrPayrollScreen, isHrPayrollPage } from "./hr-payroll-screens";
import { HrLifecycleScreen, isHrLifecyclePage } from "./hr-lifecycle-screens";
import { HrReportingWorkspace, isHrReportingPage } from "./hr-reporting-workspace";
import { CommercialWorkspace, isCommercialMaturityPage } from "./commercial-workspace";
import { MasterDataForm, isMatureMasterDataForm } from "./master-data-form";
import { RecordPreviewDrawer } from "./record-preview-drawer";
import { isReportsWorkspacePage, ReportsWorkspace } from "./reports-workspace";
import { isManufacturingMaturityPage, ManufacturingWorkspace } from "./manufacturing-workspace";
import { isNexoraAiWorkspacePage, NexoraAiWorkspace } from "./nexora-ai-workspace";
import { getModuleFormBlueprint, type BlueprintField } from "./module-form-blueprints";
import { EnterpriseTransactionControl } from "./enterprise-transaction-control";
import {
  AdvancedListFilters,
  ListFilterSelect,
  ModuleChartPanel,
  ModuleKpiGrid,
  ModuleSearchableTable,
  ModuleDataTable,
  dateMatchesRange,
  prototypeDateToIso,
  type DateRangePreset,
} from "./module-views";
import type { ModuleRow } from "./module-profile-types";

export type PrototypeViewState = "data" | "loading" | "empty" | "error";

export interface PrototypePageContext {
  moduleId: string;
  moduleLabel: string;
  moduleCode: string;
  moduleDescription: string;
  pageLabel: string;
  pageId: string;
  archetype: string;
  status: string;
  mode: string;
  role: string;
  roleId: string;
  companyMode: CompanyMode;
  /** Optional mock record reference supplied by global Ctrl+K deep links. */
  recordRef?: string;
}

export interface PrototypeRow {
  id: string;
  document: string;
  date: string;
  party: string;
  reference: string;
  amount: string;
  currency: string;
  status: string;
  owner: string;
}

interface PrototypeContentProps {
  context: PrototypePageContext;
  rows: PrototypeRow[];
  viewState: PrototypeViewState;
  onAction: (action: string, subject?: string) => void;
  onOpenPage: (pageId: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}

const chartHeights = [38, 54, 46, 70, 63, 78, 69, 92, 82, 108, 94, 116];
const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function titleCase(value: string) {
  return value
    .replaceAll("-", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function StatusChip({ status }: { status: string }) {
  const tone = status.toLowerCase().replaceAll(" ", "-");
  return <span className={`nx-status nx-status-${tone}`}>{status}</span>;
}

function PageIntro({ context, children }: { context: PrototypePageContext; children?: React.ReactNode }) {
  return (
    <div className="nx-page-intro">
      <div>
        <span className="nx-eyebrow">{context.moduleLabel}</span>
        <div className="nx-title-row">
          <h1>{context.pageLabel}</h1>
          <StatusChip status={context.status === "prototype" ? "Prototype only" : titleCase(context.status)} />
        </div>
        <p>{context.moduleDescription}</p>
      </div>
      {children ? <div className="nx-page-actions">{children}</div> : null}
    </div>
  );
}

function ActionButton({ children, onClick, tone = "secondary" }: { children: React.ReactNode; onClick: () => void; tone?: "primary" | "secondary" | "danger" | "ghost" }) {
  return <button className={`nx-button nx-button-${tone}`} type="button" onClick={onClick}>{children}</button>;
}

function StateSurface({ state, pageLabel, onRetry }: { state: Exclude<PrototypeViewState, "data">; pageLabel: string; onRetry: () => void }) {
  if (state === "loading") {
    return (
      <div className="nx-state-card" role="status" aria-label={`Loading ${pageLabel}`}>
        <div className="nx-loading-orbit" />
        <strong>Loading prototype data</strong>
        <p>Preparing realistic mock records for {pageLabel}.</p>
        <div className="nx-skeleton-lines"><i /><i /><i /></div>
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div className="nx-state-card">
        <span className="nx-state-symbol">0</span>
        <strong>No records match this view</strong>
        <p>Clear the filters or create a new prototype record to continue.</p>
        <ActionButton tone="primary" onClick={onRetry}>Create prototype record</ActionButton>
      </div>
    );
  }
  return (
    <div className="nx-state-card nx-state-error" role="alert">
      <span className="nx-state-symbol">!</span>
      <strong>Prototype state could not be displayed</strong>
      <p>This is a designed error example. No real system or data was affected.</p>
      <ActionButton onClick={onRetry}>Try again</ActionButton>
    </div>
  );
}

function DashboardView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  const metrics = useMemo(() => {
    const mode = context.mode.toLowerCase();
    if (mode.includes("manufacturing")) {
      return [["Production output", "12,840 units", "+8.4%"], ["Work in progress", "$426K", "14 orders"], ["Machine utilisation", "82.6%", "+4.1%"], ["Quality pass rate", "97.8%", "+0.8%"]];
    }
    if (mode.includes("service")) {
      return [["Recognised revenue", "$1.84M", "+12.6%"], ["Billable utilisation", "78.4%", "+3.8%"], ["Project margin", "31.2%", "+2.4%"], ["Revenue backlog", "$2.63M", "18 months"]];
    }
    return [["Net sales", "$2.48M", "+11.2%"], ["Inventory value", "$864K", "+4.6%"], ["Gross margin", "28.7%", "+1.9%"], ["Reorder alerts", "38", "12 urgent"]];
  }, [context.mode]);

  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Refresh", context.pageLabel)}>Refresh</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Create new", context.pageLabel)}>Create new</ActionButton>
      </PageIntro>

      <div className="nx-kpi-grid">
        {metrics.map(([label, value, change], index) => (
          <article className="nx-kpi" key={label}>
            <div><span>{label}</span><b>{context.moduleCode}{index + 1}</b></div>
            <strong>{value}</strong>
            <small className={index === 3 ? "warning" : "positive"}>{change} <em>vs prior period</em></small>
          </article>
        ))}
      </div>

      <div className="nx-content-grid nx-dashboard-layout">
        <article className="nx-card nx-chart-card">
          <div className="nx-card-head">
            <div><span>Performance</span><h2>{context.moduleLabel} trend</h2></div>
            <div className="nx-segmented"><button type="button">6M</button><button className="active" type="button">12M</button><button type="button">YTD</button></div>
          </div>
          <div className="nx-chart-value"><strong>$8.42M</strong><span>+14.8% year to date</span></div>
          <div className="nx-bar-chart" aria-label={`${context.moduleLabel} monthly trend`}>
            {chartHeights.map((height, index) => <i key={months[index]} style={{ height }}><span>{months[index]}</span></i>)}
          </div>
        </article>

        <article className="nx-card nx-attention-card">
          <div className="nx-card-head"><div><span>Action centre</span><h2>Needs attention</h2></div><button type="button" onClick={() => onAction("View all", "Action centre")}>View all</button></div>
          <div className="nx-task-list">
            {rows.slice(0, 4).map((row, index) => (
              <button key={row.id} type="button" onClick={() => onAction("View", row.document)}>
                <b>{context.moduleCode}{index + 1}</b>
                <span><strong>{row.party}</strong><small>{row.document} · {row.amount}</small></span>
                <StatusChip status={index === 0 ? "Urgent" : row.status} />
              </button>
            ))}
          </div>
        </article>

        <article className="nx-card nx-span-two">
          <div className="nx-card-head"><div><span>Portfolio</span><h2>Operational health</h2></div><ActionButton onClick={() => onAction("Open report", context.moduleLabel)}>Open report</ActionButton></div>
          <div className="nx-health-grid">
            {[["Current", "72%"], ["Due soon", "58%"], ["At risk", "19%"]].map(([label, width], index) => (
              <div key={label}><span>{label}</span><strong>{["$312,420", "$248,160", "$64,260"][index]}</strong><i><b style={{ width }} /></i><small>{["Healthy position", "Review this week", "Action required"][index]}</small></div>
            ))}
          </div>
        </article>
      </div>
    </>
  );
}

function ListView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  const [query, setQuery] = useState(context.recordRef ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [createdBy, setCreatedBy] = useState("");
  const [createdOn, setCreatedOn] = useState("");
  const [dateRange, setDateRange] = useState<DateRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [currency, setCurrency] = useState("");
  const [party, setParty] = useState("");
  const [status, setStatus] = useState("");
  const [documentNumber, setDocumentNumber] = useState("");
  const [reference, setReference] = useState("");
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [savedView, setSavedView] = useState("all");
  const [sortBy, setSortBy] = useState<"date" | "amount" | "document">("date");
  const [descending, setDescending] = useState(true);
  const [selectedRecord, setSelectedRecord] = useState<PrototypeRow | null>(null);
  const creators = [...new Set(rows.map((row) => row.owner))].sort();
  const currencies = [...new Set(rows.map((row) => row.currency).filter(Boolean))].sort();
  const parties = [...new Set(rows.map((row) => row.party).filter(Boolean))].sort();
  const statuses = [...new Set(rows.map((row) => row.status).filter(Boolean))].sort();
  const partyLabel = ["sales", "customers", "crm"].includes(context.moduleId)
    ? "Customer"
    : ["purchases", "suppliers", "procurement"].includes(context.moduleId)
      ? "Supplier"
      : context.moduleId === "hr"
        ? "Employee"
        : "Record";
  const amountValue = (value: string) => {
    const parsed = Number(value.replace(/[^0-9.-]/g, ""));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const filtered = [...rows].filter((row) => {
    const queryMatch = Object.values(row).some((value) => String(value).toLowerCase().includes(query.toLowerCase()));
    const creatorMatch = !createdBy || row.owner === createdBy;
    const createdOnMatch = !createdOn || prototypeDateToIso(row.date) === createdOn;
    const currencyMatch = !currency || row.currency === currency;
    const partyMatch = !party || row.party === party;
    const statusMatch = !status || row.status === status;
    const documentMatch = !documentNumber || row.document.toLowerCase().includes(documentNumber.toLowerCase());
    const referenceMatch = !reference || row.reference.toLowerCase().includes(reference.toLowerCase());
    const minimumMatch = !minAmount || amountValue(row.amount) >= Number(minAmount);
    const maximumMatch = !maxAmount || amountValue(row.amount) <= Number(maxAmount);
    const viewMatch = savedView === "all"
      || (savedView === "open" && !/posted|paid|approved|complete|closed|reconciled/i.test(row.status))
      || (savedView === "attention" && /pending|hold|reject|exception|urgent|review/i.test(row.status))
      || savedView === "highest";
    return queryMatch && creatorMatch && createdOnMatch && currencyMatch && partyMatch && statusMatch && documentMatch && referenceMatch && minimumMatch && maximumMatch && viewMatch && dateMatchesRange(row.date, dateRange, customFrom, customTo);
  }).sort((a, b) => {
    const result = sortBy === "amount"
      ? amountValue(a.amount) - amountValue(b.amount)
      : sortBy === "document"
        ? a.document.localeCompare(b.document)
        : prototypeDateToIso(a.date).localeCompare(prototypeDateToIso(b.date));
    return (savedView === "highest" ? true : descending) ? -result : result;
  });
  const activeFilterCount = Number(Boolean(createdBy)) + Number(Boolean(createdOn)) + Number(dateRange !== "all") + Number(Boolean(currency)) + Number(Boolean(party)) + Number(Boolean(status)) + Number(Boolean(documentNumber)) + Number(Boolean(reference)) + Number(Boolean(minAmount)) + Number(Boolean(maxAmount)) + Number(savedView !== "all");
  const activeChips = [
    currency && { label: `Currency: ${currency}`, clear: () => setCurrency("") },
    party && { label: `${partyLabel}: ${party}`, clear: () => setParty("") },
    status && { label: `Status: ${status}`, clear: () => setStatus("") },
    createdBy && { label: `Created by: ${createdBy}`, clear: () => setCreatedBy("") },
    createdOn && { label: `Created on: ${createdOn}`, clear: () => setCreatedOn("") },
    dateRange !== "all" && { label: `Date: ${dateRange.replaceAll("-", " ")}`, clear: () => setDateRange("all") },
    documentNumber && { label: `Document: ${documentNumber}`, clear: () => setDocumentNumber("") },
    reference && { label: `Reference: ${reference}`, clear: () => setReference("") },
    minAmount && { label: `Min: ${minAmount}`, clear: () => setMinAmount("") },
    maxAmount && { label: `Max: ${maxAmount}`, clear: () => setMaxAmount("") },
  ].filter(Boolean) as { label: string; clear: () => void }[];
  const clearAll = () => {
    setQuery(""); setCreatedBy(""); setCreatedOn(""); setDateRange("all"); setCustomFrom(""); setCustomTo("");
    setCurrency(""); setParty(""); setStatus(""); setDocumentNumber(""); setReference(""); setMinAmount(""); setMaxAmount(""); setSavedView("all");
  };
  const isInteractiveTarget = (target: EventTarget | null) => target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a, label"));
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Import", context.pageLabel)}>Import</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Add new", context.pageLabel)}>Add new</ActionButton>
      </PageIntro>
      <section className="nx-card nx-list-card">
        <div className="nx-filter-bar">
          <label className="nx-search-field"><span>⌕</span><input aria-label={`Search ${context.pageLabel}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Search ${context.pageLabel.toLowerCase()}...`} /></label>
          <ListFilterSelect listLabel={context.pageLabel} label="Currency" value={currency} options={currencies} onChange={setCurrency} />
          <ListFilterSelect listLabel={context.pageLabel} label={partyLabel} value={party} options={parties} onChange={setParty} />
          <ListFilterSelect listLabel={context.pageLabel} label="Status" value={status} options={statuses} onChange={setStatus} />
          <button aria-expanded={advancedOpen} className={activeFilterCount ? "is-active" : undefined} type="button" onClick={() => setAdvancedOpen((value) => !value)}>
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""} ▾
          </button>
          <button className="nx-icon-control" aria-label="Refresh list" type="button" onClick={() => onAction("Refresh", context.pageLabel)}>↻</button>
          <button className="nx-icon-control" aria-label="Choose columns" type="button" onClick={() => onAction("Column selection", context.pageLabel)}>☷</button>
        </div>
        <div className="nx-premium-viewbar">
          <label><span>Saved view</span><select aria-label={`Saved view for ${context.pageLabel}`} value={savedView} onChange={(event) => { const value = event.target.value; setSavedView(value); if (value === "highest") { setSortBy("amount"); setDescending(true); } }}><option value="all">All records</option><option value="open">Open workflow</option><option value="attention">Needs attention</option><option value="highest">Highest value</option></select></label>
          <label><span>Sort by</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}><option value="date">Document date</option><option value="amount">Amount</option><option value="document">Document number</option></select></label>
          <button type="button" onClick={() => setDescending((value) => !value)}>{descending ? "Descending ↓" : "Ascending ↑"}</button>
          <button type="button" onClick={() => onAction("Save view", context.pageLabel)}>Save current view</button>
          <span>{filtered.length} results</span>
        </div>
        <AdvancedListFilters
          open={advancedOpen}
          creators={creators}
          createdBy={createdBy}
          createdOn={createdOn}
          dateRange={dateRange}
          customFrom={customFrom}
          customTo={customTo}
          onCreatedByChange={setCreatedBy}
          onCreatedOnChange={setCreatedOn}
          onDateRangeChange={setDateRange}
          onCustomFromChange={setCustomFrom}
          onCustomToChange={setCustomTo}
          documentNumber={documentNumber}
          reference={reference}
          minAmount={minAmount}
          maxAmount={maxAmount}
          onDocumentNumberChange={setDocumentNumber}
          onReferenceChange={setReference}
          onMinAmountChange={setMinAmount}
          onMaxAmountChange={setMaxAmount}
          onClear={clearAll}
        />
        {activeChips.length ? <div className="nx-filter-chips" aria-label="Active filters">{activeChips.map((chip) => <button key={chip.label} type="button" onClick={chip.clear}>{chip.label}<span>×</span></button>)}<button className="clear-all" type="button" onClick={clearAll}>Clear all</button></div> : null}
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead><tr><th><input aria-label="Select all rows" type="checkbox" /></th><th>Document no.</th><th>Date</th><th>Party / record</th><th>Reference</th><th className="amount">Amount</th><th>Status</th><th>Created by</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {filtered.map((row) => (
                <tr className="nx-interactive-row" key={row.id} tabIndex={0} onClick={(event) => { if (!isInteractiveTarget(event.target)) setSelectedRecord(row); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedRecord(row); } }}>
                  <td><input aria-label={`Select ${row.document}`} type="checkbox" /></td>
                  <td><button className="nx-record-link" type="button" onClick={() => setSelectedRecord(row)}>{row.document}</button></td>
                  <td>{row.date}</td><td><strong>{row.party}</strong></td><td>{row.reference}</td><td className="amount">{row.amount}</td><td><StatusChip status={row.status} /></td><td>{row.owner}</td>
                  <td><button className="nx-row-menu" aria-label={`Actions for ${row.document}`} type="button" onClick={() => onAction("More actions", row.document)}>•••</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nx-pagination"><span>Showing 1–{filtered.length} of 128 records</span><div><button disabled type="button">Previous</button><button className="active" type="button">1</button><button type="button">2</button><button type="button">3</button><button type="button">Next</button></div></div>
      </section>
      <RecordPreviewDrawer record={selectedRecord} recordType={context.pageLabel} partyLabel={partyLabel} onClose={() => setSelectedRecord(null)} onAction={onAction} />
    </>
  );
}

function DetailView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  const [tab, setTab] = useState("Overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const record = rows[0];
  const blueprint = getModuleFormBlueprint(context.moduleId, context.moduleCode, context.pageLabel);
  const tabs = ["Overview", "Lines", "Accounting", "Attachments", "Approval", "Audit trail"];
  return (
    <>
      <PageIntro context={{ ...context, pageLabel: `${context.pageLabel} · ${record.document}` }}>
        <ActionButton onClick={() => onAction("Print", record.document)}>Print</ActionButton>
        <ActionButton onClick={() => onAction("Edit", record.document)}>Edit</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Submit", record.document)}>Submit</ActionButton>
        <div className="nx-action-menu">
          <ActionButton tone="ghost" onClick={() => setMoreOpen((value) => !value)}>More actions</ActionButton>
          {moreOpen ? <div className="nx-action-menu__popover" role="menu">
            <div className="nx-action-menu__label">Document actions</div>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Post", record.document); }}>Post document</button>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Reverse", record.document); }}>Reverse posting</button>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Cancel", record.document); }}>Cancel document</button>
            <div className="nx-action-menu__separator" />
            <button className="nx-action-menu__item nx-action-menu__item--danger" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Delete", record.document); }}>Delete draft</button>
          </div> : null}
        </div>
      </PageIntro>
      <section className="nx-record-summary nx-card">
        <div><span>Record</span><strong>{record.document}</strong></div><div><span>Party</span><strong>{record.party}</strong></div><div><span>Date</span><strong>{record.date}</strong></div><div><span>Total</span><strong>{record.amount}</strong></div><div><span>Status</span><StatusChip status={record.status} /></div>
      </section>
      <EnterpriseTransactionControl subject={context.pageLabel} reference={record.document} roleId={context.roleId} companyMode={context.companyMode} family={blueprint.family} initialStatus={record.status} onAction={onAction} />
      <div className="nx-tabs" role="tablist" aria-label="Record detail sections">{tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{item}</button>)}</div>
      <div className="nx-content-grid nx-detail-layout">
        <section className="nx-card nx-detail-main">
          <div className="nx-card-head"><div><span>{tab}</span><h2>{tab === "Overview" ? "Record information" : `${tab} details`}</h2></div></div>
          {tab === "Overview" ? (
            <div className="nx-field-grid">
              {[["Reference", record.reference], ["Company", "Nexora Services Ltd."], ["Business unit", "Professional Services"], ["Owner", record.owner], ["Currency", "USD"], ["Payment terms", "Net 30"], ["Description", `${context.pageLabel} prototype record for review`], ["Last updated", "31 Aug 2026, 14:42"]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
            </div>
          ) : tab === "Approval" ? <ApprovalTimeline /> : tab === "Audit trail" ? <AuditTimeline /> : (
            <div className="nx-line-items"><table><thead><tr><th>Line</th><th>Description</th><th>Dimension</th><th className="amount">Quantity</th><th className="amount">Amount</th></tr></thead><tbody>{rows.slice(0, 4).map((row, index) => <tr key={row.id}><td>{index + 1}</td><td>{row.party} — {row.reference}</td><td>{["Operations", "Delivery", "Finance", "Corporate"][index]}</td><td className="amount">{index + 1}.00</td><td className="amount">{row.amount}</td></tr>)}</tbody></table></div>
          )}
        </section>
        <aside className="nx-card nx-activity-panel"><div className="nx-card-head"><div><span>Timeline</span><h2>Recent activity</h2></div></div><AuditTimeline compact /></aside>
      </div>
    </>
  );
}

function BlueprintInput({ field }: { field: BlueprintField }) {
  const className = `nx-field-span-${field.span ?? 4}`;
  return (
    <label className={className}>
      <span>{field.label}{field.required ? " *" : ""}{field.automatic ? <small>Automatic</small> : null}</span>
      {field.type === "select" ? (
        <select defaultValue={field.value} required={field.required}>
          {(field.options ?? [field.value]).map((option) => <option key={option}>{option}</option>)}
        </select>
      ) : field.type === "textarea" ? (
        <textarea defaultValue={field.value} required={field.required} rows={3} />
      ) : (
        <input defaultValue={field.value} required={field.required} type={field.type === "date" ? "date" : "text"} />
      )}
      {field.helper ? <small className="nx-inline-help">{field.helper}</small> : null}
    </label>
  );
}

function FormView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  const [advanced, setAdvanced] = useState(false);
  const blueprint = getModuleFormBlueprint(context.moduleId, context.moduleCode, context.pageLabel);
  const essentialFields: readonly BlueprintField[] = [
    { label: blueprint.recordLabel + " number", value: blueprint.numberPrefix, span: 4, automatic: true },
    { label: blueprint.dateLabel, value: "2026-09-14", type: "date", span: 4, required: true },
    { label: "External reference", value: rows[0].reference, span: 4, helper: "Supplier, customer or source-system reference" },
    { label: blueprint.partyLabel, value: blueprint.partyOptions[0], type: "select", options: blueprint.partyOptions, span: 8, required: true, helper: "Search by name, code, tax number or reference." },
    { label: "Currency", value: "PKR", type: "select", options: ["PKR", "USD", "AED", "GBP", "EUR"], span: 4, required: true },
    ...blueprint.headerFields,
    { label: "Business purpose", value: blueprint.recordLabel + " prepared for controlled prototype review.", type: "textarea", span: 12, required: true },
  ];

  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Cancel", context.pageLabel)}>Cancel</ActionButton>
        <ActionButton onClick={() => onAction("Save draft", context.pageLabel)}>Save draft</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Save and submit", context.pageLabel)}>Save &amp; submit</ActionButton>
      </PageIntro>
      <section className="nx-form-context-strip" aria-label="Form context">
        <div><span>Record status</span><strong><i className="is-draft" /> Draft</strong><small>Autosaved locally 1 minute ago</small></div>
        <div><span>Company / branch</span><strong>Nexora Demo Company</strong><small>Karachi Head Office · PKR books</small></div>
        <div><span>Prepared by</span><strong>{rows[0].owner}</strong><small>{context.role} · permitted scope</small></div>
        <div><span>Readiness</span><strong>8 of 9 checks</strong><small>One review item remains</small></div>
      </section>
      <EnterpriseTransactionControl subject={blueprint.recordLabel} reference={blueprint.numberPrefix} roleId={context.roleId} companyMode={context.companyMode} family={blueprint.family} onAction={onAction} />
      <form className="nx-form-layout nx-workspace-form nx-workspace-form--standard" onSubmit={(event) => { event.preventDefault(); onAction("Save and submit", context.pageLabel); }}>
        <div className="nx-form-canvas">
          <section className="nx-card nx-form-section" id="form-essentials">
            <div className="nx-section-title"><span>01</span><div><h2>{blueprint.recordLabel} essentials</h2><p>Identity, ownership, commercial context and control values for this {blueprint.family} record.</p></div><em>Required first</em></div>
            <div className="nx-input-grid nx-input-grid--twelve">
              {essentialFields.map((field) => <BlueprintInput field={field} key={field.label} />)}
            </div>
          </section>

          <section className="nx-card nx-form-section" id="form-lines">
            <div className="nx-section-title"><span>02</span><div><h2>{blueprint.lineLabel} lines</h2><p>Inline entry exposes the operational value, unit, discount, tax, dimension and calculated amount together.</p></div><ActionButton onClick={() => onAction("Add line", context.pageLabel)}>+ Add line</ActionButton></div>
            <div className="nx-line-entry-tools"><button type="button" onClick={() => onAction("Import lines", context.pageLabel)}>Import lines</button><button type="button" onClick={() => onAction("Copy lines", context.pageLabel)}>Copy from source</button><button type="button" onClick={() => onAction("Apply defaults", context.pageLabel)}>Apply policy defaults</button><button type="button" onClick={() => onAction("Clear lines", context.pageLabel)}>Clear</button><span>Keyboard ready · Tab moves across cells · Enter adds a line</span></div>
            <div className="nx-table-wrap">
              <table className="nx-data-table nx-edit-table nx-form-entry-table">
                <thead><tr><th>#</th><th>{blueprint.lineLabel}</th><th>Description</th><th>{blueprint.dimensionLabel}</th><th>Qty</th><th>Unit</th><th>Rate</th><th>Disc. %</th><th>Tax</th><th>Amount</th><th /></tr></thead>
                <tbody>
                  {rows.slice(0, 3).map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td><select defaultValue={blueprint.lineOptions[index % blueprint.lineOptions.length]} aria-label={blueprint.lineLabel + " line " + (index + 1)}>{blueprint.lineOptions.map((option) => <option key={option}>{option}</option>)}</select><small className="nx-cell-context">{index ? "Previous rate available" : "Preferred selection"}</small></td>
                      <td><input defaultValue={row.reference} aria-label={"Description line " + (index + 1)} /></td>
                      <td><select defaultValue={blueprint.dimensions[index % blueprint.dimensions.length]} aria-label={blueprint.dimensionLabel + " line " + (index + 1)}>{blueprint.dimensions.map((option) => <option key={option}>{option}</option>)}</select></td>
                      <td><input defaultValue={index + 1} min="0" step="0.01" type="number" aria-label={"Quantity line " + (index + 1)} /></td>
                      <td><select defaultValue="Each" aria-label={"Unit line " + (index + 1)}><option>Each</option><option>Hour</option><option>Day</option><option>Lot</option></select></td>
                      <td><input defaultValue={row.amount.replace(/[^0-9.]/g, "")} inputMode="decimal" aria-label={"Rate line " + (index + 1)} /></td>
                      <td><input defaultValue={index === 1 ? "2.5" : "0"} min="0" max="100" step="0.1" type="number" aria-label={"Discount line " + (index + 1)} /></td>
                      <td><select defaultValue="18% GST" aria-label={"Tax line " + (index + 1)}><option>18% GST</option><option>Exempt</option><option>Zero rated</option></select></td>
                      <td className="amount">{row.amount}</td>
                      <td><button type="button" aria-label={`Delete line ${index + 1}`} onClick={() => onAction("Delete", `Line ${index + 1}`)}>×</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="nx-form-total-band"><div><span>Lines</span><strong>3 valid</strong></div><div><span>Subtotal</span><strong>PKR 38,620.00</strong></div><div><span>Tax &amp; charges</span><strong>PKR 3,862.00</strong></div><div className="total"><span>Controlled total</span><strong>PKR 42,482.00</strong></div></div>
          </section>

          <section className="nx-card nx-form-section" id="form-controls">
            <button className="nx-advanced-toggle" type="button" aria-expanded={advanced} onClick={() => setAdvanced(!advanced)}><span>03</span><strong>Dimensions, supporting evidence and workflow controls</strong><i>{advanced ? "−" : "+"}</i></button>
            {advanced ? (
              <div className="nx-input-grid nx-input-grid--twelve nx-advanced-fields">
                <label className="nx-field-span-4"><span>Branch *</span><select defaultValue="Karachi Head Office" required><option>Karachi Head Office</option><option>Lahore Branch</option></select></label>
                <label className="nx-field-span-4"><span>Department *</span><select defaultValue="Operations" required><option>Operations</option><option>Finance</option><option>Professional Services</option></select></label>
                <label className="nx-field-span-4"><span>Cost centre</span><select defaultValue="CC-220 — Operations"><option>CC-220 — Operations</option><option>CC-100 — Corporate</option></select></label>
                <label className="nx-field-span-4"><span>Project / contract</span><select defaultValue="PRJ-1042 — Atlas rollout"><option>PRJ-1042 — Atlas rollout</option><option>No project</option></select></label>
                <label className="nx-field-span-4"><span>Source document</span><input defaultValue="Linked automatically where applicable" /></label>
                <label className="nx-field-span-4"><span>Approval route</span><select defaultValue="Value-based approval"><option>Value-based approval</option><option>Standard approval</option><option>Management approval</option></select></label>
                <label className="nx-field-span-6"><span>Supporting attachments</span><input type="file" multiple /><small className="nx-inline-help">PDF, image or spreadsheet · prototype selection is not uploaded.</small></label>
                <label className="nx-field-span-6"><span>Internal notes</span><textarea rows={3} placeholder="Visible to authorised reviewers only" /></label>
              </div>
            ) : null}
          </section>
        </div>

        <aside className="nx-form-inspector" aria-label="Record review and assistance">
          <nav className="nx-card nx-form-navigator" aria-label="Form sections"><span>Form navigator</span><button type="button" onClick={() => onAction("Open section", "Essentials")}><b>01</b> Essentials <i>Complete</i></button><button type="button" onClick={() => onAction("Open section", "Lines")}><b>02</b> Lines <i>3 valid</i></button><button type="button" onClick={() => setAdvanced(true)}><b>03</b> Controls <i>Review</i></button></nav>
          <section className="nx-card nx-form-health"><header><span>Record health</span><strong>Ready with one review</strong></header><ul>{blueprint.checks.map(([title, detail], index) => <li className={index < 2 ? "pass" : "warn"} key={title}><b>{index < 2 ? "✓" : "!"}</b><span><strong>{title}</strong><small>{detail}</small></span></li>)}</ul><button className="nx-form-check-button" type="button" onClick={() => onAction("Validate", context.pageLabel)}>Run all checks</button></section>
          <section className="nx-card nx-form-intelligence"><span>Live business context</span><h3>Decision support</h3><dl className="nx-form-context-metrics">{blueprint.contextMetrics.map(([label, value, note]) => <div key={label}><dt>{label}</dt><dd>{value}</dd><small>{note}</small></div>)}</dl><button type="button" onClick={() => onAction("View context", context.pageLabel)}>Open supporting records</button></section>
          <section className="nx-card nx-form-audit-preview"><span>Workflow preview</span><p className="nx-form-workflow-copy">{blueprint.workflow}</p><div><b>01</b><p><strong>Prepared by</strong><small>{rows[0].owner}</small></p></div><div><b>02</b><p><strong>Next decision</strong><small>Assigned automatically on submit</small></p></div><div><b>03</b><p><strong>Audit evidence</strong><small>Version and changes retained visually</small></p></div></section>
        </aside>

        <footer className="nx-form-action-dock"><div><strong>Unsaved {blueprint.recordLabel.toLowerCase()}</strong><span>Prototype only · no live transaction or master record will be created</span></div><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Cancel", context.pageLabel)}>Cancel</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Save draft", context.pageLabel)}>Save draft</button><button className="nx-button nx-button-primary" type="submit">Validate &amp; submit</button></footer>
      </form>
    </>
  );
}

function ApprovalTimeline() {
  const steps = [["Requested", "Ayesha Malik", "31 Aug · 09:20", "complete"], ["Department manager", "Bilal Khan", "31 Aug · 10:05", "complete"], ["Finance review", "Mariam Ali", "Current step", "current"], ["Final approval", "Omar Siddiqui", "Pending", "pending"]];
  return <ol className="nx-approval-timeline">{steps.map(([label, person, time, state], index) => <li className={state} key={label}><i>{state === "complete" ? "✓" : index + 1}</i><div><strong>{label}</strong><span>{person}</span><small>{time}</small></div></li>)}</ol>;
}

function AuditTimeline({ compact = false }: { compact?: boolean }) {
  const items = [["Record submitted", "Ayesha Malik", "Today, 10:18"], ["Amount updated", "Ayesha Malik", "Today, 09:54"], ["Attachment added", "Bilal Khan", "Yesterday, 16:32"], ["Draft created", "Ayesha Malik", "Yesterday, 15:11"]];
  return <ol className={`nx-audit-timeline ${compact ? "compact" : ""}`}>{items.map(([action, actor, time]) => <li key={action}><i /><div><strong>{action}</strong><span>{actor}</span><small>{time}</small></div></li>)}</ol>;
}

function ApprovalView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton tone="danger" onClick={() => onAction("Reject", rows[0].document)}>Reject</ActionButton>
        <ActionButton onClick={() => onAction("Return for revision", rows[0].document)}>Return</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Approve", rows[0].document)}>Approve</ActionButton>
      </PageIntro>
      <div className="nx-content-grid nx-approval-layout">
        <section className="nx-card nx-approval-record"><div className="nx-card-head"><div><span>Approval request</span><h2>{rows[0].document}</h2></div><StatusChip status="Pending approval" /></div><div className="nx-approval-amount"><span>Total requested</span><strong>{rows[0].amount}</strong><small>{rows[0].party} · {rows[0].reference}</small></div><div className="nx-field-grid"><div><span>Requested by</span><strong>{rows[0].owner}</strong></div><div><span>Department</span><strong>Operations</strong></div><div><span>Required by</span><strong>03 Sep 2026</strong></div><div><span>Risk level</span><strong>Standard</strong></div></div><div className="nx-comment-box"><span>Requester comment</span><p>Please review before the supplier commitment date. Supporting documents are attached.</p></div></section>
        <section className="nx-card"><div className="nx-card-head"><div><span>Workflow</span><h2>Approval progress</h2></div></div><ApprovalTimeline /></section>
        <section className="nx-card nx-span-two"><div className="nx-card-head"><div><span>Decision history</span><h2>Comments and evidence</h2></div><ActionButton onClick={() => onAction("Add comment", rows[0].document)}>Add comment</ActionButton></div><AuditTimeline /></section>
      </div>
    </>
  );
}

function WorkflowView({ context, rows, onAction, onOpenPage }: Omit<PrototypeContentProps, "viewState">) {
  const steps = ["Request", "Approval", "RFQ", "Evaluation", "Order", "Receipt", "Quality", "Bill", "Match", "Payment", "Reconciliation", "GL"];
  return (
    <>
      <PageIntro context={context}><ActionButton onClick={() => onAction("Refresh workflow", context.pageLabel)}>Refresh</ActionButton><ActionButton tone="primary" onClick={() => onAction("Start workflow", context.pageLabel)}>Start workflow</ActionButton></PageIntro>
      <section className="nx-card nx-workflow-map"><div className="nx-card-head"><div><span>End-to-end journey</span><h2>{context.pageLabel}</h2></div><StatusChip status="In progress" /></div><div className="nx-workflow-steps">{steps.map((step, index) => <button className={index < 4 ? "complete" : index === 4 ? "current" : "pending"} type="button" key={step} onClick={() => index === 4 ? onAction("Open current step", step) : onOpenPage(context.pageId)}><i>{index < 4 ? "✓" : index + 1}</i><span>{step}</span><small>{index < 4 ? "Completed" : index === 4 ? "Current" : "Pending"}</small></button>)}</div></section>
      <div className="nx-content-grid"><section className="nx-card"><div className="nx-card-head"><div><span>Current step</span><h2>Purchase order review</h2></div><ActionButton tone="primary" onClick={() => onAction("Continue", "Purchase order review")}>Continue</ActionButton></div><div className="nx-field-grid"><div><span>Document</span><strong>{rows[0].document}</strong></div><div><span>Owner</span><strong>{rows[0].owner}</strong></div><div><span>Amount</span><strong>{rows[0].amount}</strong></div><div><span>Status</span><StatusChip status="In review" /></div></div></section><section className="nx-card"><div className="nx-card-head"><div><span>Exceptions</span><h2>Items to resolve</h2></div></div><div className="nx-exception-list"><button type="button" onClick={() => onAction("Resolve", "Budget variance")}><b>!</b><span><strong>Budget variance</strong><small>3.8% above remaining commitment</small></span></button><button type="button" onClick={() => onAction("Resolve", "Supplier certificate")}><b>!</b><span><strong>Supplier certificate</strong><small>Expires in 14 days</small></span></button></div></section></div>
    </>
  );
}

function ReportView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  return (
    <>
      <PageIntro context={context}><ActionButton onClick={() => onAction("Print", context.pageLabel)}>Print</ActionButton><ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton><ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>Run report</ActionButton></PageIntro>
      <section className="nx-card nx-report-filters"><label><span>Date from</span><input type="date" defaultValue="2026-01-01" /></label><label><span>Date to</span><input type="date" defaultValue="2026-08-31" /></label><label><span>Company</span><select><option>Nexora Services Ltd.</option></select></label><label><span>Dimension</span><select><option>All dimensions</option><option>Operations</option><option>Professional Services</option></select></label><label><span>Status</span><select><option>All statuses</option><option>Approved</option><option>Posted</option></select></label><ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>Run report</ActionButton></section>
      <div className="nx-kpi-grid nx-report-kpis"><article className="nx-kpi"><div><span>Total activity</span></div><strong>$8.42M</strong><small className="positive">+14.8% <em>year to date</em></small></article><article className="nx-kpi"><div><span>Average value</span></div><strong>$42,680</strong><small>128 records</small></article><article className="nx-kpi"><div><span>Exceptions</span></div><strong>14</strong><small className="warning">4 require action</small></article><article className="nx-kpi"><div><span>Last refreshed</span></div><strong>14:42</strong><small>31 Aug 2026</small></article></div>
      <div className="nx-content-grid nx-report-layout"><section className="nx-card nx-chart-card"><div className="nx-card-head"><div><span>Trend analysis</span><h2>{context.pageLabel}</h2></div><StatusChip status="Mock report" /></div><div className="nx-bar-chart nx-report-chart">{chartHeights.map((height, index) => <i key={months[index]} style={{ height }}><span>{months[index]}</span></i>)}</div></section><section className="nx-card"><div className="nx-card-head"><div><span>Composition</span><h2>By status</h2></div></div><div className="nx-donut"><i><b>78%</b><span>On target</span></i><ul><li><b className="blue" />Approved <span>52%</span></li><li><b className="cyan" />In progress <span>26%</span></li><li><b className="sky" />Exceptions <span>14%</span></li><li><b className="indigo" />Draft <span>8%</span></li></ul></div></section></div>
      <section className="nx-card nx-report-table"><div className="nx-card-head"><div><span>Report results</span><h2>Detailed records</h2></div></div><div className="nx-table-wrap"><table className="nx-data-table"><thead><tr><th>Date</th><th>Reference</th><th>Party / account</th><th>Description</th><th className="amount">Debit</th><th className="amount">Credit</th><th className="amount">Balance</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id}><td>{row.date}</td><td><button className="nx-record-link" type="button" onClick={() => onAction("Drill down", row.document)}>{row.document}</button></td><td>{row.party}</td><td>{row.reference}</td><td className="amount">{index % 2 ? "—" : row.amount}</td><td className="amount">{index % 2 ? row.amount : "—"}</td><td className="amount">${(428000 + index * 12480).toLocaleString()}</td></tr>)}</tbody></table></div></section>
    </>
  );
}

function SettingsView({ context, onAction }: Omit<PrototypeContentProps, "viewState" | "rows" | "onOpenPage" | "onNavigate">) {
  const sections = ["General", "Company", "Finance", "Sales", "Purchasing", "Inventory", "Projects", "HR", "Notifications", "Documents", "Integrations", "Workflow"];
  const [section, setSection] = useState("General");
  return (
    <><PageIntro context={context}><ActionButton onClick={() => onAction("Discard changes", section)}>Discard</ActionButton><ActionButton tone="primary" onClick={() => onAction("Save settings", section)}>Save changes</ActionButton></PageIntro><div className="nx-settings-layout"><nav className="nx-card nx-settings-nav" aria-label="Settings sections">{sections.map((item) => <button className={section === item ? "active" : ""} key={item} type="button" onClick={() => setSection(item)}>{item}<span>›</span></button>)}</nav><section className="nx-card nx-settings-panel"><div className="nx-card-head"><div><span>{section}</span><h2>{section} settings</h2></div><StatusChip status="Prototype only" /></div><div className="nx-input-grid nx-settings-fields"><label><span>Configuration name</span><input defaultValue={`${section} policy — Default`} /></label><label><span>Effective from</span><input type="date" defaultValue="2026-09-01" /></label><label className="nx-field-wide"><span>Description</span><textarea defaultValue={`Default ${section.toLowerCase()} configuration for the visual Nexora prototype.`} rows={3} /></label><div className="nx-setting-toggle nx-field-wide"><span><strong>Require approval</strong><small>Route material changes through the prototype approval workflow.</small></span><input defaultChecked type="checkbox" /></div><div className="nx-setting-toggle nx-field-wide"><span><strong>Record audit history</strong><small>Show before-and-after evidence in the prototype audit timeline.</small></span><input defaultChecked type="checkbox" /></div><div className="nx-setting-toggle nx-field-wide"><span><strong>Enable notifications</strong><small>Display in-app reminders and exception alerts.</small></span><input defaultChecked type="checkbox" /></div></div></section></div></>
  );
}

function ComingSoonView({ context, onAction }: Omit<PrototypeContentProps, "viewState" | "rows" | "onOpenPage" | "onNavigate">) {
  return <><PageIntro context={context} /><section className="nx-state-card nx-coming-soon"><span className="nx-state-symbol">↗</span><StatusChip status={context.status === "coming-soon" ? "Coming soon" : "Not implemented"} /><strong>{context.pageLabel} is mapped for future review</strong><p>This page is included in the complete product navigation but has no real transaction logic. It remains an explicit visual roadmap state.</p><div><ActionButton onClick={() => onAction("View requirements", context.pageLabel)}>View requirements</ActionButton><ActionButton tone="primary" onClick={() => onAction("Request prototype", context.pageLabel)}>Request prototype</ActionButton></div></section></>;
}

/* ------------------------------------------------------------------ */
/* Matured module screens (module profile supplies the domain content)  */
/* ------------------------------------------------------------------ */

function MaturedDashboardView({
  context,
  profile,
  onAction,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["dashboard"]>;
  onAction: (action: string, subject?: string) => void;
}) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Refresh", context.pageLabel)}>Refresh</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Open report", context.pageLabel)}>Open report</ActionButton>
      </PageIntro>
      <ModuleKpiGrid kpis={profile.kpis} onSelect={(kpi) => onAction("Drill into", kpi.label)} />
      <section className="nx-role-grid">
        {profile.charts.map((chart, index) => (
          <ModuleChartPanel chart={chart} index={index} key={`${chart.kind}-${chart.title}`} />
        ))}
        {profile.attention?.length ? (
          <article className="nx-role-panel nx-role-panel--wide">
            <div className="nx-role-panel__head">
              <div><span>Action centre</span><h2>{profile.attentionTitle ?? "Needs attention"}</h2><p>Open the source workspace to investigate each item.</p></div>
            </div>
            <div className="nx-role-alerts">
              {profile.attention.map((item) => (
                <button className="nx-role-alert" key={item.id} type="button" onClick={() => onAction("Resolve", item.title)}>
                  <span>
                    <i className={`nx-role-severity nx-role-severity--${item.tone === "danger" ? "critical" : item.tone === "warning" ? "high" : "low"}`}>{item.status}</i>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span><small>Action</small><b>Review</b></span>
                </button>
              ))}
            </div>
          </article>
        ) : null}
      </section>
    </>
  );
}

function MaturedListView({
  context,
  profile,
  onAction,
  onNavigate,
  onOpenRow,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["list"]>;
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string) => void;
  onOpenRow?: (row: ModuleRow) => void;
}) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Import", context.pageLabel)}>Import</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton
          tone="primary"
          onClick={() => {
            if (profile.createPageId) {
              onNavigate(context.moduleId, profile.createPageId);
              return;
            }
            onAction("Add new", context.pageLabel);
          }}
        >
          {profile.createLabel ?? "Add new"}
        </ActionButton>
      </PageIntro>
      <ModuleSearchableTable
        columns={profile.columns}
        rows={profile.rows}
        linkKey={profile.linkKey}
        openOnlyFromLink={profile.openOnlyFromLink}
        filters={profile.filters}
        label={context.pageLabel}
        summary={profile.summary}
        totalRecords={profile.totalRecords}
        onOpen={(row) => {
          if (onOpenRow) {
            onOpenRow(row);
            return;
          }
          const label = row.cells[profile.linkKey ?? profile.columns[0].key] ?? row.id;
          if (profile.openPageId) {
            onAction("Open", label);
            onNavigate(context.moduleId, profile.openPageId);
            return;
          }
          onAction("View", label);
        }}
        onAction={onAction}
      />
    </>
  );
}

function MaturedDetailView({
  context,
  profile,
  onAction,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["detail"]>;
  onAction: (action: string, subject?: string) => void;
}) {
  const [tab, setTab] = useState("Overview");
  const [moreOpen, setMoreOpen] = useState(false);
  const primaryValue = profile.fields[0]?.[1] ?? context.pageLabel;
  const status = profile.lines[0]?.status ?? "Active";
  const blueprint = getModuleFormBlueprint(context.moduleId, context.moduleCode, context.pageLabel);
  const tabs = ["Overview", "Activity & cost", "Accounting links", "Attachments & audit"];
  return (
    <>
      <PageIntro context={{ ...context, pageLabel: context.pageLabel + " · " + primaryValue }}>
        <ActionButton onClick={() => onAction("Print", primaryValue)}>Print</ActionButton>
        <ActionButton onClick={() => onAction("Edit", primaryValue)}>Edit</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Submit", primaryValue)}>Submit</ActionButton>
        <div className="nx-action-menu">
          <ActionButton tone="ghost" onClick={() => setMoreOpen((value) => !value)}>More actions</ActionButton>
          {moreOpen ? <div className="nx-action-menu__popover" role="menu">
            <div className="nx-action-menu__label">Lifecycle actions</div>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Approve", primaryValue); }}>Approve record</button>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Post", primaryValue); }}>Post cost allocation</button>
            <button className="nx-action-menu__item" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Reverse", primaryValue); }}>Reverse accounting event</button>
            <div className="nx-action-menu__separator" />
            <button className="nx-action-menu__item nx-action-menu__item--danger" role="menuitem" type="button" onClick={() => { setMoreOpen(false); onAction("Cancel", primaryValue); }}>Cancel draft</button>
          </div> : null}
        </div>
      </PageIntro>
      <section className="nx-record-summary nx-card">
        <div><span>Record</span><strong>{primaryValue}</strong></div>
        <div><span>Module</span><strong>{context.moduleLabel}</strong></div>
        <div><span>Owner</span><strong>Fleet Operations</strong></div>
        <div><span>Last updated</span><strong>15 Sep 2026, 14:42</strong></div>
        <div><span>Status</span><StatusChip status={status} /></div>
      </section>
      <EnterpriseTransactionControl subject={context.pageLabel} reference={primaryValue} roleId={context.roleId} companyMode={context.companyMode} family={blueprint.family} initialStatus={status} onAction={onAction} />
      <div className="nx-tabs" role="tablist" aria-label="Record detail sections">
        {tabs.map((item) => <button role="tab" aria-selected={tab === item} className={tab === item ? "active" : ""} type="button" key={item} onClick={() => setTab(item)}>{item}</button>)}
      </div>
      {tab === "Overview" ? (
        <div className="nx-content-grid nx-detail-layout">
          <section className="nx-card nx-detail-main">
            <div className="nx-card-head"><div><span>360-degree record</span><h2>Operational, compliance and financial context</h2></div><StatusChip status={status} /></div>
            <div className="nx-field-grid">{profile.fields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          </section>
          <aside className="nx-card nx-activity-panel">
            <div className="nx-card-head"><div><span>Connected controls</span><h2>Traceability</h2></div></div>
            <div className="nx-exception-list">
              <button type="button" onClick={() => onAction("View", "Source documents")}><b>1</b><span><strong>Source documents</strong><small>Assignments, trips, fuel, work orders and claims</small></span></button>
              <button type="button" onClick={() => onAction("View", "Accounting impact")}><b>2</b><span><strong>Accounting impact</strong><small>Expense account, cost centre and asset linkage</small></span></button>
              <button type="button" onClick={() => onAction("View", "Audit evidence")}><b>3</b><span><strong>Audit evidence</strong><small>Approvals, attachments and immutable activity</small></span></button>
            </div>
          </aside>
        </div>
      ) : (
        <section className="nx-card nx-report-table">
          <div className="nx-card-head"><div><span>{tab}</span><h2>{tab === "Activity & cost" ? "Connected source activity" : "Record evidence and traceability"}</h2></div><ActionButton onClick={() => onAction("Export", primaryValue)}>Export</ActionButton></div>
          <ModuleDataTable columns={profile.lineColumns} rows={profile.lines} onOpen={(row) => onAction("Drill down", row.id)} />
        </section>
      )}
    </>
  );
}

function MaturedReportView({
  context,
  profile,
  onAction,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["report"]>;
  onAction: (action: string, subject?: string) => void;
}) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Print", context.pageLabel)}>Print</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>Run report</ActionButton>
      </PageIntro>
      <section className="nx-card nx-report-filters">
        <label><span>Date from</span><input type="date" defaultValue="2026-01-01" /></label>
        <label><span>Date to</span><input type="date" defaultValue="2026-08-31" /></label>
        <label><span>Company</span><select><option>Nexora Services Ltd.</option></select></label>
        <label><span>Account</span><select><option>All accounts</option><option>Operating USD — 4471</option><option>Collections EUR — 8814</option></select></label>
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>Run report</ActionButton>
      </section>
      <ModuleKpiGrid kpis={profile.kpis} onSelect={(kpi) => onAction("Drill into", kpi.label)} />
      <section className="nx-role-grid">
        {profile.charts.map((chart, index) => (
          <ModuleChartPanel chart={chart} index={index} key={`${chart.kind}-${chart.title}`} />
        ))}
      </section>
      <section className="nx-card nx-report-table">
        <div className="nx-card-head"><div><span>Report results</span><h2>Detailed records</h2></div></div>
        <ModuleDataTable
          columns={profile.columns}
          rows={profile.rows}
          onOpen={(row) => onAction("Drill down", row.cells[profile.columns[0].key] ?? row.id)}
        />
      </section>
    </>
  );
}

function MaturedWorkflowView({
  context,
  profile,
  onAction,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["workflow"]>;
  onAction: (action: string, subject?: string) => void;
}) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Refresh workflow", context.pageLabel)}>Refresh</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Continue", profile.currentTitle)}>Continue</ActionButton>
      </PageIntro>
      <section className="nx-card nx-workflow-map">
        <div className="nx-card-head"><div><span>End-to-end journey</span><h2>{context.pageLabel}</h2></div><StatusChip status="In progress" /></div>
        <div className="nx-workflow-steps">
          {profile.steps.map((step, index) => (
            <button className={step.state} key={step.label} type="button" onClick={() => onAction("Open step", step.label)}>
              <i>{step.state === "complete" ? "✓" : index + 1}</i>
              <span>{step.label}</span>
              <small>{step.state === "complete" ? "Completed" : step.state === "current" ? "Current" : "Pending"}</small>
            </button>
          ))}
        </div>
      </section>
      <div className="nx-content-grid">
        <section className="nx-card">
          <div className="nx-card-head">
            <div><span>Current step</span><h2>{profile.currentTitle}</h2></div>
            <ActionButton tone="primary" onClick={() => onAction("Continue", profile.currentTitle)}>Continue</ActionButton>
          </div>
          <div className="nx-field-grid">
            {profile.currentFields.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
          </div>
        </section>
        <section className="nx-card">
          <div className="nx-card-head"><div><span>Exceptions</span><h2>Items to resolve</h2></div></div>
          <div className="nx-exception-list">
            {profile.exceptions.map((exception) => (
              <button key={exception.id} type="button" onClick={() => onAction("Resolve", exception.title)}>
                <b>!</b>
                <span><strong>{exception.title}</strong><small>{exception.detail}</small></span>
              </button>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function MaturedFormView({
  context,
  profile,
  onAction,
}: {
  context: PrototypePageContext;
  profile: NonNullable<ModulePageProfile["form"]>;
  onAction: (action: string, subject?: string) => void;
}) {
  const blueprint = getModuleFormBlueprint(context.moduleId, context.moduleCode, context.pageLabel);
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Cancel", context.pageLabel)}>Cancel</ActionButton>
        <ActionButton onClick={() => onAction("Save draft", context.pageLabel)}>Save draft</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Save and submit", context.pageLabel)}>Save &amp; submit</ActionButton>
      </PageIntro>
      <section className="nx-form-context-strip" aria-label="Form context">
        <div><span>Form status</span><strong><i className="is-draft" /> Draft</strong><small>Changes are not posted</small></div>
        <div><span>Sections</span><strong>{profile.sections.length}</strong><small>Complete from top to bottom</small></div>
        <div><span>Validation</span><strong>Ready</strong><small>Runs before submission</small></div>
        <div><span>Approval</span><strong>Policy based</strong><small>Determined by role and value</small></div>
      </section>
      <EnterpriseTransactionControl subject={context.pageLabel} reference={blueprint.numberPrefix} roleId={context.roleId} companyMode={context.companyMode} family={blueprint.family} onAction={onAction} />
      <div className="nx-workspace-form nx-workspace-form--profile">
        <div className="nx-form-canvas">
          {profile.sections.map((section, sectionIndex) => (
            <section className="nx-card nx-form-section" key={section.title}>
              <div className="nx-section-title"><span>{String(sectionIndex + 1).padStart(2, "0")}</span><div><h2>{section.title}</h2><p>Complete the relevant information; required controls are checked automatically.</p></div><em>{section.fields.length} fields</em></div>
              <div className="nx-input-grid nx-input-grid--twelve">
                {section.fields.map((field, fieldIndex) => (
                  <label className={field.wide ? "nx-field-span-12" : fieldIndex % 3 === 0 ? "nx-field-span-6" : "nx-field-span-3"} key={field.label}>
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <textarea defaultValue={field.value} rows={3} />
                    ) : field.type === "select" ? (
                      <select defaultValue={field.value}>
                        {(field.options ?? [field.value]).map((option) => <option key={option}>{option}</option>)}
                      </select>
                    ) : (
                      <input defaultValue={field.value} type={field.type === "date" ? "date" : "text"} />
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="nx-form-inspector">
          <section className="nx-card nx-form-health"><header><span>Form health</span><strong>Guided completion</strong></header><ul><li className="pass"><b>✓</b><span><strong>Smart defaults</strong><small>Company and role context applied</small></span></li><li className="pass"><b>✓</b><span><strong>Consistent structure</strong><small>Shared Nexora field standards</small></span></li><li className="warn"><b>!</b><span><strong>Review required</strong><small>Validate before submitting</small></span></li></ul></section>
          <section className="nx-card nx-form-intelligence"><span>Contextual assistance</span><h3>What happens next?</h3><p>The prototype shows role-aware validation, approval routing and downstream impact without creating real data.</p><button type="button" onClick={() => onAction("Validate", context.pageLabel)}>Validate record</button></section>
        </aside>
        <footer className="nx-form-action-dock"><div><strong>{context.pageLabel}</strong><span>Prototype draft · all changes remain mock-only</span></div><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Cancel", context.pageLabel)}>Cancel</button><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Save draft", context.pageLabel)}>Save draft</button><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Save and submit", context.pageLabel)}>Save & submit</button></footer>
      </div>
    </>
  );
}

/** Banking entry screens are driven by the shared transaction-type engine. */
const bankingEntryPages: Readonly<Record<string, string>> = {
  "add-bank-account": "bank-account-setup",
  "add-bank-payment": "bank-payment",
  "add-bank-receipt": "bank-receipt",
  "add-transfer": "bank-transfer",
  "add-deposit": "bank-deposit",
  "add-bank-charge": "bank-charges",
  "add-bank-interest": "bank-interest",
  "issue-cheque": "cheque-issued",
  "receive-cheque": "cheque-received",
  "revaluation": "bank-revaluation",
};

/**
 * `Bank > Reconciliation`. The menu opens the register of reconciliation
 * records; a record is opened from the list, or started with "+ Add New".
 *
 * The view state lives here rather than in PrototypeContent so that leaving
 * the page unmounts it: returning to Reconciliation always lands on the
 * register, never on whatever record was open last time.
 */
function BankingReconciliationPage({
  context,
  onAction,
  onOpenTransaction,
  onImportStatement,
}: {
  context: PrototypePageContext;
  onAction: (action: string, subject?: string) => void;
  onOpenTransaction: (reference: string) => void;
  onImportStatement: () => void;
}) {
  type ReconciliationView = { kind: "register" } | { kind: "new" } | { kind: "open"; recordId: string };
  /** The route can address the create panel or one record directly, the same
      way a transaction reference addresses a transaction. */
  const routed: ReconciliationView = context.recordRef?.startsWith("new") ?? false
    ? { kind: "new" }
    : context.recordRef && findReconciliation(context.recordRef, reconciliationRegister)
      ? { kind: "open", recordId: context.recordRef }
      : { kind: "register" };
  const [view, setView] = useState<ReconciliationView>(routed);
  const [created, setCreated] = useState<readonly ReconciliationRecord[]>([]);
  const records = [...created, ...reconciliationRegister];

  if (view.kind === "open") {
    const record = findReconciliation(view.recordId, records);
    if (record) {
      return (
        <BankingReconciliation
          key={record.id}
          mode="reconciliation"
          record={record}
          onAction={onAction}
          onOpenTransaction={onOpenTransaction}
          onImportStatement={onImportStatement}
          onBack={() => setView({ kind: "register" })}
        />
      );
    }
  }

  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton onClick={onImportStatement}>Import statement</ActionButton>
        <ActionButton tone="primary" onClick={() => setView({ kind: "new" })}>+ Add New</ActionButton>
      </PageIntro>
      {view.kind === "new" ? (
        <BankingReconciliationWorksheet
          initialAccountId={context.recordRef?.split("/")[1]}
          records={records}
          onAction={onAction}
          onCreate={(record, submitted) => {
            setCreated((current) => [record, ...current]);
            setView({ kind: "register" });
            onAction(submitted ? "Reconciliation submitted" : "Reconciliation saved", `${record.id} · ${record.periodLabel}`);
          }}
          onCancel={() => setView({ kind: "register" })}
          onImportStatement={onImportStatement}
        />
      ) : (
        <BankingReconciliationRegister
          records={records}
          onAction={onAction}
          onOpen={(recordId) => setView({ kind: "open", recordId })}
        />
      )}
    </>
  );
}

export function PrototypeContent(props: PrototypeContentProps) {
  const { context, viewState, onAction } = props;
  const [selectedBankingRecord, setSelectedBankingRecord] = useState<{
    pageId: string;
    row: ModuleRow;
  } | null>(null);
  const [selectedBankingReference, setSelectedBankingReference] = useState("PAY-2026-0418");
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("BA-4471");
  if (viewState !== "data") return <><PageIntro context={context} /><StateSurface state={viewState} pageLabel={context.pageLabel} onRetry={() => onAction("Retry", context.pageLabel)} /></>;
  if (["coming-soon", "not-implemented"].includes(context.status)) return <ComingSoonView context={context} onAction={onAction} />;

  if (context.moduleId === "ai" && isNexoraAiWorkspacePage(context.pageId)) {
    return <NexoraAiWorkspace context={context} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  if (["hr", "reports"].includes(context.moduleId) && isHrReportingPage(context.pageId)) {
    return <HrReportingWorkspace context={context} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  if (context.moduleId === "reports" && isReportsWorkspacePage(context.pageId)) {
    return <ReportsWorkspace context={context} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  if (isMatureMasterDataForm(context.pageId)) {
    return <MasterDataForm context={context} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  if (isCommercialMaturityPage(context.moduleId, context.pageId)) {
    return <CommercialWorkspace context={context} rows={props.rows} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  // Core HR foundation: the organisation tree and the six HR masters. Every
  // master renders through one screen, so they cannot drift apart.
  if (context.moduleId === "hr") {
    if (context.pageId === "org-structure") {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction("Add company", context.pageLabel)}>+ Add New</ActionButton>
          </PageIntro>
          <HrOrgStructure onAction={onAction} />
        </>
      );
    }
    if (isHrLifecyclePage(context.pageId)) {
      return (
        <>
          <PageIntro context={context} />
          <HrLifecycleScreen
            key={context.pageId}
            pageId={context.pageId}
            onAction={onAction}
            onNavigate={props.onNavigate}
          />
        </>
      );
    }
    if (isHrPayrollPage(context.pageId)) {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction("Add", context.pageLabel)}>+ Add New</ActionButton>
          </PageIntro>
          <HrPayrollScreen key={context.pageId} pageId={context.pageId} onAction={onAction} />
        </>
      );
    }
    if (isHrAttendancePage(context.pageId)) {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction("Add", context.pageLabel)}>+ Add New</ActionButton>
          </PageIntro>
          <HrAttendanceScreen key={context.pageId} pageId={context.pageId} onAction={onAction} />
        </>
      );
    }
    const master = hrMasterForPage(context.pageId);
    if (master) {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction(`Add ${master.singular.toLowerCase()}`, context.pageLabel)}>+ Add New</ActionButton>
          </PageIntro>
          <HrMasterScreen key={master.id} master={master} onAction={onAction} />
        </>
      );
    }
  }

  if (context.moduleId === "manufacturing" && isManufacturingMaturityPage(context.pageId)) {
    return <ManufacturingWorkspace context={context} onAction={onAction} onNavigate={props.onNavigate} />;
  }

  if (context.moduleId === "banking") {
    // Payments and receipts use the multi-line batch grid; the remaining
    // types stay on the single-transaction form.
    if (context.pageId === "add-bank-payment" || context.pageId === "add-bank-receipt") {
      // Deliberately no PageIntro: this screen mirrors the dense entry
      // format, which carries its own compact title.
      return (
        <BankingBatchEntry
          key={context.pageId}
          kind={context.pageId === "add-bank-payment" ? "payment" : "receipt"}
          onAction={onAction}
          onBack={() => props.onNavigate("banking", context.pageId === "add-bank-payment" ? "bank-payments" : "bank-receipts")}
          onOpenTransaction={(reference) => {
            setSelectedBankingRecord(null);
            setSelectedBankingReference(reference);
            props.onNavigate("banking", "transaction-detail");
          }}
        />
      );
    }

    if (context.pageId === "account-balances") {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => props.onNavigate("banking", "add-bank-account")}>+ Add New</ActionButton>
          </PageIntro>
          <BankAccountBalances
            onAction={onAction}
            onOpenAccount={(accountId) => {
              setSelectedBankAccountId(accountId);
              props.onNavigate("banking", "bank-statement");
            }}
          />
        </>
      );
    }

    if (context.pageId === "bank-statement") {
      return (
        <BankStatement
          accountId={selectedBankAccountId}
          onAction={onAction}
          onReconcile={(accountId) => {
            setSelectedBankAccountId(accountId);
            props.onNavigate("banking", "bank-reconciliation");
          }}
          onOpenTransaction={(reference) => {
            setSelectedBankingRecord(null);
            setSelectedBankingReference(reference);
            props.onNavigate("banking", "transaction-detail");
            onAction("Open transaction", reference);
          }}
          onBack={() => props.onNavigate("banking", "account-balances")}
        />
      );
    }

    if (context.pageId === "bank-reconciliation" || context.pageId === "statement-matching") {
      const openTransaction = (reference: string) => {
        setSelectedBankingRecord(null);
        setSelectedBankingReference(reference);
        props.onNavigate("banking", "transaction-detail");
        onAction("Open transaction", reference);
      };
      const importStatement = () => props.onNavigate("banking", "import-statement");

      if (context.pageId === "statement-matching") {
        return (
          <BankingReconciliation
            mode="matching"
            onAction={onAction}
            onOpenTransaction={openTransaction}
            onImportStatement={importStatement}
          />
        );
      }

      return (
        <BankingReconciliationPage
          context={context}
          onAction={onAction}
          onOpenTransaction={openTransaction}
          onImportStatement={importStatement}
        />
      );
    }

    const entryTypeId = bankingEntryPages[context.pageId];
    if (entryTypeId) {
      return (
        <>
          <PageIntro context={context} />
          {/* Keyed by type so switching entry screens starts a fresh draft
              rather than carrying the previous type's defaults across. */}
          <BankingTransactionForm
            key={entryTypeId}
            typeId={entryTypeId}
            onAction={onAction}
            onOpenTransaction={(reference) => {
              setSelectedBankingRecord(null);
              setSelectedBankingReference(reference);
              props.onNavigate("banking", "transaction-detail");
            }}
          />
          <EnterpriseTransactionControl
            subject={context.pageLabel}
            reference={`${context.moduleCode}-AUTO`}
            roleId={context.roleId}
            companyMode={context.companyMode}
            family="treasury"
            onAction={onAction}
          />
        </>
      );
    }
    if (context.pageId === "transaction-detail") {
      return (
        <BankingTransactionDetail
          reference={selectedBankingRecord ? undefined : context.recordRef ?? selectedBankingReference}
          sourcePageId={selectedBankingRecord?.pageId}
          sourceRow={selectedBankingRecord?.row}
          onAction={onAction}
          onBack={() => props.onNavigate("banking", selectedBankingRecord?.pageId ?? "bank-payments")}
        />
      );
    }
    if (context.pageId === "bank-account-detail") {
      return (
        <BankAccountDetail
          accountId={selectedBankAccountId}
          onAction={onAction}
          onOpenStatement={(accountId) => {
            setSelectedBankAccountId(accountId);
            props.onNavigate("banking", "bank-statement");
          }}
          onNewTransaction={() => props.onNavigate("banking", "add-bank-payment")}
          onOpenTransaction={(reference) => {
            setSelectedBankingRecord(null);
            setSelectedBankingReference(reference);
            props.onNavigate("banking", "transaction-detail");
          }}
        />
      );
    }
  }

  // A page registered in the drill registry opens the single drill renderer.
  // No module name reaches this file: the registry answers, or it does not.
  const drillEntry = getDrillEntry(context.moduleId, context.pageId);
  if (drillEntry) {
    const view = getFactView(drillEntry.viewId);
    const chain = getChain(drillEntry.viewId, drillEntry.chainId);
    if (view && chain) {
      return (
        <DrillRenderer
          chain={chain}
          rows={view.rows}
          currency={view.currency}
          minorUnits={view.minorUnits}
          moduleId={context.moduleId}
          pageId={context.pageId}
          title={drillEntry.title}
          headlineNote={drillEntry.headlineNote ?? null}
        />
      );
    }
  }

  const moduleProfile = getModulePageProfile(context.moduleId, context.pageId);
  if (context.moduleId === "banking" && moduleProfile?.list) {
    return (
      <MaturedListView
        context={context}
        profile={moduleProfile.list}
        onAction={onAction}
        onNavigate={props.onNavigate}
        onOpenRow={(row) => {
          if (context.pageId === "bank-accounts") {
            const accountIndex = moduleProfile.list!.rows.findIndex((candidate) => candidate.id === row.id);
            const accountId = bankAccounts[accountIndex]?.id ?? "BA-4471";
            setSelectedBankAccountId(accountId);
            props.onNavigate("banking", "bank-account-detail");
            return;
          }
          setSelectedBankingRecord({ pageId: context.pageId, row });
          props.onNavigate("banking", "transaction-detail");
        }}
      />
    );
  }
  if (moduleProfile?.dashboard) return <MaturedDashboardView context={context} profile={moduleProfile.dashboard} onAction={onAction} />;
  if (moduleProfile?.detail) return <MaturedDetailView context={context} profile={moduleProfile.detail} onAction={onAction} />;
  if (moduleProfile?.report) return <MaturedReportView context={context} profile={moduleProfile.report} onAction={onAction} />;
  if (moduleProfile?.workflow) return <MaturedWorkflowView context={context} profile={moduleProfile.workflow} onAction={onAction} />;
  if (moduleProfile?.form) return <MaturedFormView context={context} profile={moduleProfile.form} onAction={onAction} />;
  if (moduleProfile?.list) return <MaturedListView context={context} profile={moduleProfile.list} onAction={onAction} onNavigate={props.onNavigate} />;

  const roleDashboard = getRoleDashboard(context.pageId);
  if (roleDashboard) {
    return <RoleDashboard context={context} dashboard={roleDashboard} onAction={onAction} onNavigate={props.onNavigate} />;
  }
  const type = context.archetype.toLowerCase();
  if (type.includes("dashboard")) return <DashboardView {...props} />;
  if (type.includes("form") || type.includes("create") || type.includes("edit")) return <FormView {...props} />;
  if (type.includes("detail") || type.includes("profile")) return <DetailView {...props} />;
  if (type.includes("approval")) return <ApprovalView {...props} />;
  if (type.includes("workflow") || type.includes("journey")) return <WorkflowView {...props} />;
  if (type.includes("report") || type.includes("analytics")) return <ReportView {...props} />;
  if (type.includes("setting") || type.includes("configuration")) return <SettingsView context={context} onAction={onAction} />;
  return <ListView key={`${context.moduleId}:${context.pageId}:${context.recordRef ?? ""}`} {...props} />;
}
