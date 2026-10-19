"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyMode } from "@prototype/shared/fixtures/mock-data";
import { RoleDashboard } from "@prototype/features/dashboard/views/role-dashboard";
import { getRoleDashboard } from "@prototype/features/dashboard/model/role-dashboard-data";
import { getModulePageProfile } from "./config/module-profiles";
import { getDrillEntry, getChain, getFactView } from "@prototype/features/drill/core/registry.ts";
import { DrillRenderer } from "@prototype/features/drill/core/drill-renderer.tsx";
import type { ModulePageProfile } from "@prototype/shared/types/module-profile-types";
import { bankAccounts } from "@prototype/features/banking/model/banking-master-data";
import { BankingTransactionForm } from "@prototype/features/banking/views/banking-transaction-form";
import { BankingTransactionDetail } from "@prototype/features/banking/views/banking-transaction-detail";
import { BankingPayments } from "@prototype/features/banking/views/banking-payments";
import { BankingReceipts } from "@prototype/features/banking/views/banking-receipts";
import { BankingPaymentEntry } from "@prototype/features/banking/views/banking-payment-entry";
import { BankingReceiptEntry } from "@prototype/features/banking/views/banking-receipt-entry";
import { BankingPaymentDetail } from "@prototype/features/banking/views/banking-payment-detail";
import { isPersistedBankPaymentId } from "@prototype/features/banking/model/bank-payment-routing";
import { isPersistedBankReceiptId } from "@prototype/features/banking/model/bank-receipt-routing";
import { BankStatement } from "@prototype/features/banking/views/banking-statement";
import { BankingAccountBalances } from "@prototype/features/banking/views/banking-account-balances";
import {
  BankAccountApprovals,
  BankAccountDetailWorkspace,
  BankAccountSetup,
} from "@prototype/features/banking/views/banking-account-governance";
import { BankingReconciliation } from "@prototype/features/banking/views/banking-reconciliation";
import {
  findReconciliation,
  reconciliationRegister,
  type ReconciliationRecord,
} from "@prototype/features/banking/model/banking-reconciliation-data";
import { BankingReconciliationRegister } from "@prototype/features/banking/views/banking-reconciliation-register";
import { BankingReconciliationWorksheet } from "@prototype/features/banking/views/banking-reconciliation-worksheet";
import { HrMasterScreen, HrOrgStructure, hrMasterForPage } from "@prototype/features/hr/views/hr-master-screens";
import { HrEmployeeDirectory } from "@prototype/features/hr/views/hr-employee-directory";
import { HrEmployeeDraftForm } from "@prototype/features/hr/views/hr-employee-draft-form";
import { HrEmployeeDraftsWorkspace } from "@prototype/features/hr/views/hr-employee-drafts-workspace";
import { HrEmployeeApprovalsWorkspace } from "@prototype/features/hr/views/hr-employee-approvals-workspace";
import { HrEmployeeContactsWorkspace } from "@prototype/features/hr/views/hr-employee-contacts-workspace";
import { HrEmployeeEmergencyContactsWorkspace } from "@prototype/features/hr/views/hr-employee-emergency-contacts-workspace";
import { HrEmployeeDocumentsWorkspace } from "@prototype/features/hr/views/hr-employee-documents-workspace";
import { HrEmployeeAssignmentsWorkspace } from "@prototype/features/hr/views/hr-employee-assignments-workspace";
import { HrEmployeeHistoryWorkspace } from "@prototype/features/hr/views/hr-employee-history-workspace";
import { HrAttendanceScreen, isHrAttendancePage } from "@prototype/features/hr/views/hr-attendance-screens";
import { HrPayrollScreen, isHrPayrollPage } from "@prototype/features/hr/views/hr-payroll-screens";
import { HrLifecycleScreen, isHrLifecyclePage } from "@prototype/features/hr/views/hr-lifecycle-screens";
import { HrLifecyclePoliciesWorkspace } from "@prototype/features/hr/views/hr-lifecycle-policies-workspace";
import { HrJobsWorkspace } from "@prototype/features/hr/views/hr-jobs-workspace";
import { HrReportingWorkspace, isHrReportingPage } from "@prototype/features/hr/views/hr-reporting-workspace";
import { CommercialWorkspace, isCommercialMaturityPage } from "@prototype/features/commerce/views/commercial-workspace";
import { MasterDataForm, isMatureMasterDataForm } from "@prototype/features/master-data/views/master-data-form";
import { RecordPreviewDrawer } from "@prototype/features/commerce/components/record-preview-drawer";
import { isReportsWorkspacePage, ReportsWorkspace } from "@prototype/features/reports/views/reports-workspace";
import {
  isManufacturingMaturityPage,
  ManufacturingWorkspace,
} from "@prototype/features/manufacturing/views/manufacturing-workspace";
import { isNexoraAiWorkspacePage, NexoraAiWorkspace } from "@prototype/features/ai/views/nexora-ai-workspace";
import { getModuleFormBlueprint, type BlueprintField } from "@prototype/shared/config/module-form-blueprints";
import { EnterpriseTransactionControl } from "@prototype/features/commerce/components/enterprise-transaction-control";
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
} from "@prototype/shared/ui/module-views";
import type { ModuleRow } from "@prototype/shared/types/module-profile-types";

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
  onNavigate: (
    moduleId: string,
    pageId: string,
    recordRef?: string,
    options?: { replace?: boolean; bypassUnsavedGuard?: boolean },
  ) => void;
  onPaymentEntryDirtyChange?: (dirty: boolean) => void;
  onReceiptEntryDirtyChange?: (dirty: boolean) => void;
}

const chartHeights = [38, 54, 46, 70, 63, 78, 69, 92, 82, 108, 94, 116];
const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];

function titleCase(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
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

function ActionButton({
  children,
  onClick,
  tone = "secondary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  tone?: "primary" | "secondary" | "danger" | "ghost";
}) {
  const variants = { primary: "default", secondary: "outline", danger: "destructive", ghost: "ghost" } as const;
  return (
    <Button variant={variants[tone]} type="button" onClick={onClick}>
      {children}
    </Button>
  );
}

function StateSurface({
  state,
  pageLabel,
  onRetry,
}: {
  state: Exclude<PrototypeViewState, "data">;
  pageLabel: string;
  onRetry: () => void;
}) {
  if (state === "loading") {
    return (
      <div className="nx-state-card" role="status" aria-label={`Loading ${pageLabel}`}>
        <div className="nx-loading-orbit" />
        <strong>Loading prototype data</strong>
        <p>Preparing realistic mock records for {pageLabel}.</p>
        <div className="nx-skeleton-lines">
          <i />
          <i />
          <i />
        </div>
      </div>
    );
  }
  if (state === "empty") {
    return (
      <div className="nx-state-card">
        <span className="nx-state-symbol">0</span>
        <strong>No records match this view</strong>
        <p>Clear the filters or create a new prototype record to continue.</p>
        <ActionButton tone="primary" onClick={onRetry}>
          Create prototype record
        </ActionButton>
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
      return [
        ["Production output", "12,840 units", "+8.4%"],
        ["Work in progress", "$426K", "14 orders"],
        ["Machine utilisation", "82.6%", "+4.1%"],
        ["Quality pass rate", "97.8%", "+0.8%"],
      ];
    }
    if (mode.includes("service")) {
      return [
        ["Recognised revenue", "$1.84M", "+12.6%"],
        ["Billable utilisation", "78.4%", "+3.8%"],
        ["Project margin", "31.2%", "+2.4%"],
        ["Revenue backlog", "$2.63M", "18 months"],
      ];
    }
    return [
      ["Net sales", "$2.48M", "+11.2%"],
      ["Inventory value", "$864K", "+4.6%"],
      ["Gross margin", "28.7%", "+1.9%"],
      ["Reorder alerts", "38", "12 urgent"],
    ];
  }, [context.mode]);

  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Refresh", context.pageLabel)}>Refresh</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Create new", context.pageLabel)}>
          Create new
        </ActionButton>
      </PageIntro>

      <div className="nx-kpi-grid">
        {metrics.map(([label, value, change], index) => (
          <article className="nx-kpi" key={label}>
            <div>
              <span>{label}</span>
              <b>
                {context.moduleCode}
                {index + 1}
              </b>
            </div>
            <strong>{value}</strong>
            <small className={index === 3 ? "warning" : "positive"}>
              {change} <em>vs prior period</em>
            </small>
          </article>
        ))}
      </div>

      <div className="nx-content-grid nx-dashboard-layout">
        <article className="nx-card nx-chart-card">
          <div className="nx-card-head">
            <div>
              <span>Performance</span>
              <h2>{context.moduleLabel} trend</h2>
            </div>
            <div className="nx-segmented">
              <button type="button">6M</button>
              <button className="active" type="button">
                12M
              </button>
              <button type="button">YTD</button>
            </div>
          </div>
          <div className="nx-chart-value">
            <strong>$8.42M</strong>
            <span>+14.8% year to date</span>
          </div>
          <div className="nx-bar-chart" aria-label={`${context.moduleLabel} monthly trend`}>
            {chartHeights.map((height, index) => (
              <i key={months[index]} style={{ height }}>
                <span>{months[index]}</span>
              </i>
            ))}
          </div>
        </article>

        <article className="nx-card nx-attention-card">
          <div className="nx-card-head">
            <div>
              <span>Action centre</span>
              <h2>Needs attention</h2>
            </div>
            <button type="button" onClick={() => onAction("View all", "Action centre")}>
              View all
            </button>
          </div>
          <div className="nx-task-list">
            {rows.slice(0, 4).map((row, index) => (
              <button key={row.id} type="button" onClick={() => onAction("View", row.document)}>
                <b>
                  {context.moduleCode}
                  {index + 1}
                </b>
                <span>
                  <strong>{row.party}</strong>
                  <small>
                    {row.document} · {row.amount}
                  </small>
                </span>
                <StatusChip status={index === 0 ? "Urgent" : row.status} />
              </button>
            ))}
          </div>
        </article>

        <article className="nx-card nx-span-two">
          <div className="nx-card-head">
            <div>
              <span>Portfolio</span>
              <h2>Operational health</h2>
            </div>
            <ActionButton onClick={() => onAction("Open report", context.moduleLabel)}>Open report</ActionButton>
          </div>
          <div className="nx-health-grid">
            {[
              ["Current", "72%"],
              ["Due soon", "58%"],
              ["At risk", "19%"],
            ].map(([label, width], index) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{["$312,420", "$248,160", "$64,260"][index]}</strong>
                <i>
                  <b style={{ width }} />
                </i>
                <small>{["Healthy position", "Review this week", "Action required"][index]}</small>
              </div>
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
  const filtered = [...rows]
    .filter((row) => {
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
      const viewMatch =
        savedView === "all" ||
        (savedView === "open" && !/posted|paid|approved|complete|closed|reconciled/i.test(row.status)) ||
        (savedView === "attention" && /pending|hold|reject|exception|urgent|review/i.test(row.status)) ||
        savedView === "highest";
      return (
        queryMatch &&
        creatorMatch &&
        createdOnMatch &&
        currencyMatch &&
        partyMatch &&
        statusMatch &&
        documentMatch &&
        referenceMatch &&
        minimumMatch &&
        maximumMatch &&
        viewMatch &&
        dateMatchesRange(row.date, dateRange, customFrom, customTo)
      );
    })
    .sort((a, b) => {
      const result =
        sortBy === "amount"
          ? amountValue(a.amount) - amountValue(b.amount)
          : sortBy === "document"
            ? a.document.localeCompare(b.document)
            : prototypeDateToIso(a.date).localeCompare(prototypeDateToIso(b.date));
      return (savedView === "highest" ? true : descending) ? -result : result;
    });
  const activeFilterCount =
    Number(Boolean(createdBy)) +
    Number(Boolean(createdOn)) +
    Number(dateRange !== "all") +
    Number(Boolean(currency)) +
    Number(Boolean(party)) +
    Number(Boolean(status)) +
    Number(Boolean(documentNumber)) +
    Number(Boolean(reference)) +
    Number(Boolean(minAmount)) +
    Number(Boolean(maxAmount)) +
    Number(savedView !== "all");
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
    setQuery("");
    setCreatedBy("");
    setCreatedOn("");
    setDateRange("all");
    setCustomFrom("");
    setCustomTo("");
    setCurrency("");
    setParty("");
    setStatus("");
    setDocumentNumber("");
    setReference("");
    setMinAmount("");
    setMaxAmount("");
    setSavedView("all");
  };
  const isInteractiveTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && Boolean(target.closest("button, input, select, textarea, a, label"));
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Import", context.pageLabel)}>Import</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Add new", context.pageLabel)}>
          Add new
        </ActionButton>
      </PageIntro>
      <section className="nx-card nx-list-card">
        <div className="nx-filter-bar">
          <label className="nx-search-field">
            <span>⌕</span>
            <Input
              aria-label={`Search ${context.pageLabel}`}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={`Search ${context.pageLabel.toLowerCase()}...`}
            />
          </label>
          <ListFilterSelect
            listLabel={context.pageLabel}
            label="Currency"
            value={currency}
            options={currencies}
            onChange={setCurrency}
          />
          <ListFilterSelect
            listLabel={context.pageLabel}
            label={partyLabel}
            value={party}
            options={parties}
            onChange={setParty}
          />
          <ListFilterSelect
            listLabel={context.pageLabel}
            label="Status"
            value={status}
            options={statuses}
            onChange={setStatus}
          />
          <button
            aria-expanded={advancedOpen}
            className={activeFilterCount ? "is-active" : undefined}
            type="button"
            onClick={() => setAdvancedOpen((value) => !value)}
          >
            Filters{activeFilterCount ? ` (${activeFilterCount})` : ""} ▾
          </button>
          <button
            className="nx-icon-control"
            aria-label="Refresh list"
            type="button"
            onClick={() => onAction("Refresh", context.pageLabel)}
          >
            ↻
          </button>
          <button
            className="nx-icon-control"
            aria-label="Choose columns"
            type="button"
            onClick={() => onAction("Column selection", context.pageLabel)}
          >
            ☷
          </button>
        </div>
        <div className="nx-premium-viewbar">
          <label>
            <span>Saved view</span>
            <select
              aria-label={`Saved view for ${context.pageLabel}`}
              value={savedView}
              onChange={(event) => {
                const value = event.target.value;
                setSavedView(value);
                if (value === "highest") {
                  setSortBy("amount");
                  setDescending(true);
                }
              }}
            >
              <option value="all">All records</option>
              <option value="open">Open workflow</option>
              <option value="attention">Needs attention</option>
              <option value="highest">Highest value</option>
            </select>
          </label>
          <label>
            <span>Sort by</span>
            <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)}>
              <option value="date">Document date</option>
              <option value="amount">Amount</option>
              <option value="document">Document number</option>
            </select>
          </label>
          <button type="button" onClick={() => setDescending((value) => !value)}>
            {descending ? "Descending ↓" : "Ascending ↑"}
          </button>
          <button type="button" onClick={() => onAction("Save view", context.pageLabel)}>
            Save current view
          </button>
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
        {activeChips.length ? (
          <div className="nx-filter-chips" aria-label="Active filters">
            {activeChips.map((chip) => (
              <button key={chip.label} type="button" onClick={chip.clear}>
                {chip.label}
                <span>×</span>
              </button>
            ))}
            <button className="clear-all" type="button" onClick={clearAll}>
              Clear all
            </button>
          </div>
        ) : null}
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead>
              <tr>
                <th>
                  <Checkbox aria-label="Select all rows" />
                </th>
                <th>Document no.</th>
                <th>Date</th>
                <th>Party / record</th>
                <th>Reference</th>
                <th className="amount">Amount</th>
                <th>Status</th>
                <th>Created by</th>
                <th>
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr
                  className="nx-interactive-row"
                  key={row.id}
                  tabIndex={0}
                  onClick={(event) => {
                    if (!isInteractiveTarget(event.target)) setSelectedRecord(row);
                  }}
                  onKeyDown={(event) => {
                    if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      setSelectedRecord(row);
                    }
                  }}
                >
                  <td>
                    <Checkbox aria-label={`Select ${row.document}`} />
                  </td>
                  <td>
                    <button className="nx-record-link" type="button" onClick={() => setSelectedRecord(row)}>
                      {row.document}
                    </button>
                  </td>
                  <td>{row.date}</td>
                  <td>
                    <strong>{row.party}</strong>
                  </td>
                  <td>{row.reference}</td>
                  <td className="amount">{row.amount}</td>
                  <td>
                    <StatusChip status={row.status} />
                  </td>
                  <td>{row.owner}</td>
                  <td>
                    <button
                      className="nx-row-menu"
                      aria-label={`Actions for ${row.document}`}
                      type="button"
                      onClick={() => onAction("More actions", row.document)}
                    >
                      •••
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="nx-pagination">
          <span>Showing 1–{filtered.length} of 128 records</span>
          <div>
            <button disabled type="button">
              Previous
            </button>
            <button className="active" type="button">
              1
            </button>
            <button type="button">2</button>
            <button type="button">3</button>
            <button type="button">Next</button>
          </div>
        </div>
      </section>
      <RecordPreviewDrawer
        record={selectedRecord}
        recordType={context.pageLabel}
        partyLabel={partyLabel}
        onClose={() => setSelectedRecord(null)}
        onAction={onAction}
      />
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
        <ActionButton tone="primary" onClick={() => onAction("Submit", record.document)}>
          Submit
        </ActionButton>
        <div className="nx-action-menu">
          <ActionButton tone="ghost" onClick={() => setMoreOpen((value) => !value)}>
            More actions
          </ActionButton>
          {moreOpen ? (
            <div className="nx-action-menu__popover" role="menu">
              <div className="nx-action-menu__label">Document actions</div>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Post", record.document);
                }}
              >
                Post document
              </button>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Reverse", record.document);
                }}
              >
                Reverse posting
              </button>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Cancel", record.document);
                }}
              >
                Cancel document
              </button>
              <div className="nx-action-menu__separator" />
              <button
                className="nx-action-menu__item nx-action-menu__item--danger"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Delete", record.document);
                }}
              >
                Delete draft
              </button>
            </div>
          ) : null}
        </div>
      </PageIntro>
      <section className="nx-record-summary nx-card">
        <div>
          <span>Record</span>
          <strong>{record.document}</strong>
        </div>
        <div>
          <span>Party</span>
          <strong>{record.party}</strong>
        </div>
        <div>
          <span>Date</span>
          <strong>{record.date}</strong>
        </div>
        <div>
          <span>Total</span>
          <strong>{record.amount}</strong>
        </div>
        <div>
          <span>Status</span>
          <StatusChip status={record.status} />
        </div>
      </section>
      <EnterpriseTransactionControl
        subject={context.pageLabel}
        reference={record.document}
        roleId={context.roleId}
        companyMode={context.companyMode}
        family={blueprint.family}
        initialStatus={record.status}
        onAction={onAction}
      />
      <div className="nx-tabs" role="tablist" aria-label="Record detail sections">
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            type="button"
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="nx-content-grid nx-detail-layout">
        <section className="nx-card nx-detail-main">
          <div className="nx-card-head">
            <div>
              <span>{tab}</span>
              <h2>{tab === "Overview" ? "Record information" : `${tab} details`}</h2>
            </div>
          </div>
          {tab === "Overview" ? (
            <div className="nx-field-grid">
              {[
                ["Reference", record.reference],
                ["Company", "Nexora Services Ltd."],
                ["Business unit", "Professional Services"],
                ["Owner", record.owner],
                ["Currency", "USD"],
                ["Payment terms", "Net 30"],
                ["Description", `${context.pageLabel} prototype record for review`],
                ["Last updated", "31 Aug 2026, 14:42"],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          ) : tab === "Approval" ? (
            <ApprovalTimeline />
          ) : tab === "Audit trail" ? (
            <AuditTimeline />
          ) : (
            <div className="nx-line-items">
              <table>
                <thead>
                  <tr>
                    <th>Line</th>
                    <th>Description</th>
                    <th>Dimension</th>
                    <th className="amount">Quantity</th>
                    <th className="amount">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 4).map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td>
                        {row.party} — {row.reference}
                      </td>
                      <td>{["Operations", "Delivery", "Finance", "Corporate"][index]}</td>
                      <td className="amount">{index + 1}.00</td>
                      <td className="amount">{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
        <aside className="nx-card nx-activity-panel">
          <div className="nx-card-head">
            <div>
              <span>Timeline</span>
              <h2>Recent activity</h2>
            </div>
          </div>
          <AuditTimeline compact />
        </aside>
      </div>
    </>
  );
}

function BlueprintInput({ field }: { field: BlueprintField }) {
  const spanClasses: Record<number, string> = {
    3: "col-span-3 max-md:col-span-6 max-sm:col-span-1",
    4: "col-span-4 max-md:col-span-6 max-sm:col-span-1",
    6: "col-span-6 max-sm:col-span-1",
    8: "col-span-8 max-md:col-span-6 max-sm:col-span-1",
    12: "col-span-full",
  };
  const className = `grid gap-1.5 ${spanClasses[field.span ?? 4] ?? spanClasses[4]} [&>span]:flex [&>span]:min-h-4 [&>span]:items-center [&>span]:justify-between [&>span]:gap-2 [&>span]:text-xs [&>span>small]:rounded-full [&>span>small]:bg-muted [&>span>small]:px-1.5 [&>span>small]:py-0.5 [&>span>small]:text-xs [&>span>small]:font-bold [&>select]:h-10.5 [&>select]:text-xs [&>textarea]:min-h-23 [&>textarea]:text-xs`;
  return (
    <label className={className}>
      <span>
        {field.label}
        {field.required ? " *" : ""}
        {field.automatic ? <small>Automatic</small> : null}
      </span>
      {field.type === "select" ? (
        <select defaultValue={field.value} required={field.required}>
          {(field.options ?? [field.value]).map((option) => (
            <option key={option}>{option}</option>
          ))}
        </select>
      ) : field.type === "textarea" ? (
        <Textarea defaultValue={field.value} required={field.required} rows={3} />
      ) : (
        <Input defaultValue={field.value} required={field.required} type={field.type === "date" ? "date" : "text"} />
      )}
      {field.helper ? (
        <small className="mt-1 block text-xs leading-snug text-muted-foreground">{field.helper}</small>
      ) : null}
    </label>
  );
}

const formContextStripClass =
  "grid min-w-0 grid-cols-4 overflow-hidden rounded-md border border-border bg-card shadow-xs max-md:grid-cols-2 max-sm:grid-cols-1 [&>div]:min-w-0 [&>div]:border-r [&>div]:border-border [&>div]:px-4 [&>div]:py-3 [&>div:nth-child(2)]:max-md:border-r-0 [&>div:nth-child(-n+2)]:max-md:border-b [&>div:last-child]:border-r-0 [&>div]:max-sm:border-r-0 [&>div]:max-sm:border-b [&>div:last-child]:max-sm:border-b-0 [&_span]:block [&_span]:text-xs [&_span]:font-bold [&_span]:uppercase [&_span]:tracking-wide [&_span]:text-muted-foreground [&_strong]:mt-1 [&_strong]:block [&_strong]:truncate [&_strong]:text-xs [&_strong]:font-bold [&_small]:mt-0.5 [&_small]:block [&_small]:truncate [&_small]:text-xs [&_small]:text-muted-foreground [&_strong_i]:mr-1.5 [&_strong_i]:inline-block [&_strong_i]:size-1.75 [&_strong_i]:rounded-full [&_strong_i]:bg-[var(--nx-warning)] [&_strong_i]:align-middle [&_strong_i]:shadow-[0_0_0_3px_var(--nx-warning-soft)]";
const formNavigatorClass =
  "nx-card !grid !gap-1 !rounded-md !border-border !bg-card !p-2 shadow-xs [&>span]:px-2 [&>span]:pb-2 [&>span]:pt-1 [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wide [&>span]:text-muted-foreground [&>button]:grid [&>button]:min-h-10 [&>button]:grid-cols-[1.75rem_minmax(0,1fr)_auto] [&>button]:items-center [&>button]:gap-2 [&>button]:rounded-md [&>button]:border [&>button]:border-transparent [&>button]:bg-transparent [&>button]:p-2 [&>button]:text-left [&>button]:text-sm [&>button]:font-semibold [&>button:hover]:border-primary/30 [&>button:hover]:bg-primary/10 [&>button_b]:grid [&>button_b]:size-7 [&>button_b]:place-items-center [&>button_b]:rounded-sm [&>button_b]:border [&>button_b]:border-border [&>button_b]:bg-card [&>button_b]:text-xs [&>button_b]:text-primary [&>button_i]:text-xs [&>button_i]:not-italic [&>button_i]:text-muted-foreground";
const formHealthClass =
  "nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-0 shadow-xs [&>header]:border-b [&>header]:border-border [&>header]:bg-primary/10 [&>header]:p-3.5 [&_header_span]:block [&_header_span]:text-xs [&_header_span]:font-bold [&_header_span]:uppercase [&_header_span]:tracking-wider [&_header_span]:text-primary [&_header_strong]:mt-1 [&_header_strong]:block [&_header_strong]:text-xs [&>ul]:m-0 [&>ul]:list-none [&>ul]:px-3 [&>ul]:pb-2.5 [&>ul]:pt-1 [&>ul>li]:flex [&>ul>li]:gap-2 [&>ul>li]:border-b [&>ul>li]:border-border [&>ul>li]:py-2 [&>ul>li:last-child]:border-b-0 [&_li>b]:grid [&_li>b]:size-5.5 [&_li>b]:shrink-0 [&_li>b]:place-items-center [&_li>b]:rounded-full [&_li>b]:bg-muted [&_li>b]:text-xs [&_li>b]:text-muted-foreground [&_li.pass>b]:bg-[var(--nx-success-soft)] [&_li.pass>b]:text-[var(--nx-success-text)] [&_li.warn>b]:bg-[var(--nx-warning-soft)] [&_li.warn>b]:text-[var(--nx-warning)] [&_li_span]:min-w-0 [&_li_strong]:block [&_li_strong]:text-xs [&_li_small]:mt-0.5 [&_li_small]:block [&_li_small]:text-xs [&_li_small]:leading-snug [&_li_small]:text-muted-foreground";
const formIntelligenceClass =
  "nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-3.5 shadow-xs [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wider [&>span]:text-primary [&>h3]:mb-0 [&>h3]:mt-1 [&>h3]:text-sm [&>p]:mb-0 [&>p]:mt-1.5 [&>p]:text-xs [&>p]:leading-relaxed [&>p]:text-muted-foreground [&>button]:mt-3 [&>button]:w-full [&>button]:rounded-md [&>button]:border [&>button]:border-primary/30 [&>button]:bg-primary/10 [&>button]:px-2 [&>button]:py-2 [&>button]:text-xs [&>button]:font-bold [&>button]:text-primary";
const formAuditPreviewClass =
  "nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-3.5 shadow-xs [&>span]:text-xs [&>span]:font-bold [&>span]:uppercase [&>span]:tracking-wider [&>span]:text-primary [&>div]:flex [&>div]:gap-2 [&>div]:border-t [&>div]:border-border [&>div]:py-2 [&>div:first-of-type]:mt-2 [&>div>b]:grid [&>div>b]:size-6 [&>div>b]:place-items-center [&>div>b]:rounded-sm [&>div>b]:bg-primary/10 [&>div>b]:text-xs [&>div>b]:text-primary [&_p]:m-0 [&_p_strong]:block [&_p_strong]:text-xs [&_p_small]:mt-0.5 [&_p_small]:block [&_p_small]:text-xs [&_p_small]:text-muted-foreground";
const formMetricsClass =
  "my-3 grid overflow-hidden rounded-md border border-border [&>div]:grid [&>div]:grid-cols-[minmax(0,1fr)_auto] [&>div]:gap-x-2 [&>div]:gap-y-1 [&>div]:border-b [&>div]:border-border [&>div]:px-2.5 [&>div]:py-2 [&>div:last-child]:border-b-0 [&_dt]:text-xs [&_dt]:text-muted-foreground [&_dd]:m-0 [&_dd]:text-right [&_dd]:text-xs [&_dd]:font-bold [&_small]:col-span-full [&_small]:text-xs [&_small]:text-muted-foreground";
const formWorkflowCopyClass =
  "my-2 rounded-r-sm border-l-3 border-primary bg-primary/10 px-2.5 py-2 text-xs leading-relaxed";

function FormView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  const [advanced, setAdvanced] = useState(false);
  const blueprint = getModuleFormBlueprint(context.moduleId, context.moduleCode, context.pageLabel);
  const essentialFields: readonly BlueprintField[] = [
    { label: blueprint.recordLabel + " number", value: blueprint.numberPrefix, span: 4, automatic: true },
    { label: blueprint.dateLabel, value: "2026-09-14", type: "date", span: 4, required: true },
    {
      label: "External reference",
      value: rows[0].reference,
      span: 4,
      helper: "Supplier, customer or source-system reference",
    },
    {
      label: blueprint.partyLabel,
      value: blueprint.partyOptions[0],
      type: "select",
      options: blueprint.partyOptions,
      span: 8,
      required: true,
      helper: "Search by name, code, tax number or reference.",
    },
    {
      label: "Currency",
      value: "PKR",
      type: "select",
      options: ["PKR", "USD", "AED", "GBP", "EUR"],
      span: 4,
      required: true,
    },
    ...blueprint.headerFields,
    {
      label: "Business purpose",
      value: blueprint.recordLabel + " prepared for controlled prototype review.",
      type: "textarea",
      span: 12,
      required: true,
    },
  ];

  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Cancel", context.pageLabel)}>Cancel</ActionButton>
        <ActionButton onClick={() => onAction("Save draft", context.pageLabel)}>Save draft</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Save and submit", context.pageLabel)}>
          Save &amp; submit
        </ActionButton>
      </PageIntro>
      <section className={formContextStripClass} aria-label="Form context">
        <div>
          <span>Record status</span>
          <strong>
            <i /> Draft
          </strong>
          <small>Autosaved locally 1 minute ago</small>
        </div>
        <div>
          <span>Company / branch</span>
          <strong>Nexora Demo Company</strong>
          <small>Karachi Head Office · PKR books</small>
        </div>
        <div>
          <span>Prepared by</span>
          <strong>{rows[0].owner}</strong>
          <small>{context.role} · permitted scope</small>
        </div>
        <div>
          <span>Readiness</span>
          <strong>8 of 9 checks</strong>
          <small>One review item remains</small>
        </div>
      </section>
      <EnterpriseTransactionControl
        subject={blueprint.recordLabel}
        reference={blueprint.numberPrefix}
        roleId={context.roleId}
        companyMode={context.companyMode}
        family={blueprint.family}
        onAction={onAction}
      />
      <form
        className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(16.875rem,19.375rem)] items-start gap-3.5 max-xl:grid-cols-1"
        onSubmit={(event) => {
          event.preventDefault();
          onAction("Save and submit", context.pageLabel);
        }}
      >
        <div className="grid min-w-0 gap-3.5">
          <section
            className="nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-0 shadow-xs"
            id="form-essentials"
          >
            <div className="nx-section-title">
              <span>01</span>
              <div>
                <h2>{blueprint.recordLabel} essentials</h2>
                <p>Identity, ownership, commercial context and control values for this {blueprint.family} record.</p>
              </div>
              <em>Required first</em>
            </div>
            <div className="grid grid-cols-12 gap-x-4 gap-y-3.5 p-4 max-sm:grid-cols-1">
              {essentialFields.map((field) => (
                <BlueprintInput field={field} key={field.label} />
              ))}
            </div>
          </section>

          <section
            className="nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-0 shadow-xs"
            id="form-lines"
          >
            <div className="nx-section-title">
              <span>02</span>
              <div>
                <h2>{blueprint.lineLabel} lines</h2>
                <p>
                  Inline entry exposes the operational value, unit, discount, tax, dimension and calculated amount
                  together.
                </p>
              </div>
              <ActionButton onClick={() => onAction("Add line", context.pageLabel)}>+ Add line</ActionButton>
            </div>
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted px-3.5 py-2 [&>button]:h-7 [&>button]:rounded-sm [&>button]:border [&>button]:border-border [&>button]:bg-card [&>button]:px-2.5 [&>button]:text-xs [&>button]:font-bold [&>button]:text-foreground [&>button:hover]:border-primary/30 [&>button:hover]:bg-primary/10 [&>button:hover]:text-primary [&>span]:ml-auto [&>span]:text-xs [&>span]:text-muted-foreground max-sm:[&>span]:ml-0 max-sm:[&>span]:w-full">
              <button type="button" onClick={() => onAction("Import lines", context.pageLabel)}>
                Import lines
              </button>
              <button type="button" onClick={() => onAction("Copy lines", context.pageLabel)}>
                Copy from source
              </button>
              <button type="button" onClick={() => onAction("Apply defaults", context.pageLabel)}>
                Apply policy defaults
              </button>
              <button type="button" onClick={() => onAction("Clear lines", context.pageLabel)}>
                Clear
              </button>
              <span>Keyboard ready · Tab moves across cells · Enter adds a line</span>
            </div>
            <div className="nx-table-wrap">
              <table className="nx-data-table nx-edit-table min-w-310 [&_th]:border-primary/70 [&_th]:bg-primary [&_th]:text-primary-foreground [&_td]:align-top [&_td:nth-child(2)]:min-w-52.5 [&_td:nth-child(3)]:min-w-47.5 [&_td:nth-child(4)]:min-w-37.5 [&_input]:min-h-9 [&_select]:min-h-9">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{blueprint.lineLabel}</th>
                    <th>Description</th>
                    <th>{blueprint.dimensionLabel}</th>
                    <th>Qty</th>
                    <th>Unit</th>
                    <th>Rate</th>
                    <th>Disc. %</th>
                    <th>Tax</th>
                    <th>Amount</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 3).map((row, index) => (
                    <tr key={row.id}>
                      <td>{index + 1}</td>
                      <td>
                        <select
                          defaultValue={blueprint.lineOptions[index % blueprint.lineOptions.length]}
                          aria-label={blueprint.lineLabel + " line " + (index + 1)}
                        >
                          {blueprint.lineOptions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                        <small className="mt-1 block whitespace-nowrap text-xs text-muted-foreground">
                          {index ? "Previous rate available" : "Preferred selection"}
                        </small>
                      </td>
                      <td>
                        <Input defaultValue={row.reference} aria-label={"Description line " + (index + 1)} />
                      </td>
                      <td>
                        <select
                          defaultValue={blueprint.dimensions[index % blueprint.dimensions.length]}
                          aria-label={blueprint.dimensionLabel + " line " + (index + 1)}
                        >
                          {blueprint.dimensions.map((option) => (
                            <option key={option}>{option}</option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <Input
                          defaultValue={index + 1}
                          min="0"
                          step="0.01"
                          type="number"
                          aria-label={"Quantity line " + (index + 1)}
                        />
                      </td>
                      <td>
                        <select defaultValue="Each" aria-label={"Unit line " + (index + 1)}>
                          <option>Each</option>
                          <option>Hour</option>
                          <option>Day</option>
                          <option>Lot</option>
                        </select>
                      </td>
                      <td>
                        <Input
                          defaultValue={row.amount.replace(/[^0-9.]/g, "")}
                          inputMode="decimal"
                          aria-label={"Rate line " + (index + 1)}
                        />
                      </td>
                      <td>
                        <Input
                          defaultValue={index === 1 ? "2.5" : "0"}
                          min="0"
                          max="100"
                          step="0.1"
                          type="number"
                          aria-label={"Discount line " + (index + 1)}
                        />
                      </td>
                      <td>
                        <select defaultValue="18% GST" aria-label={"Tax line " + (index + 1)}>
                          <option>18% GST</option>
                          <option>Exempt</option>
                          <option>Zero rated</option>
                        </select>
                      </td>
                      <td className="amount">{row.amount}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={`Delete line ${index + 1}`}
                          onClick={() => onAction("Delete", `Line ${index + 1}`)}
                        >
                          ×
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="grid grid-cols-4 border-t border-border bg-muted max-md:grid-cols-2 max-sm:grid-cols-1 [&>div]:border-l [&>div]:border-border [&>div]:px-3.5 [&>div]:py-3 [&>div]:text-right [&>div:first-child]:border-l-0 [&_span]:block [&_span]:text-xs [&_span]:font-bold [&_span]:text-muted-foreground [&_strong]:mt-1 [&_strong]:block [&_strong]:text-xs [&_strong]:font-bold [&_strong]:tabular-nums max-md:[&>div:nth-child(3)]:border-t max-sm:[&>div]:border-l-0 max-sm:[&>div]:border-t max-sm:[&>div:first-child]:border-t-0">
              <div>
                <span>Lines</span>
                <strong>3 valid</strong>
              </div>
              <div>
                <span>Subtotal</span>
                <strong>PKR 38,620.00</strong>
              </div>
              <div>
                <span>Tax &amp; charges</span>
                <strong>PKR 3,862.00</strong>
              </div>
              <div className="bg-primary text-primary-foreground [&_span]:text-primary-foreground/75 [&_strong]:text-sm [&_strong]:text-primary-foreground">
                <span>Controlled total</span>
                <strong>PKR 42,482.00</strong>
              </div>
            </div>
          </section>

          <section
            className="nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-0 shadow-xs"
            id="form-controls"
          >
            <button
              className="nx-advanced-toggle"
              type="button"
              aria-expanded={advanced}
              onClick={() => setAdvanced(!advanced)}
            >
              <span>03</span>
              <strong>Dimensions, supporting evidence and workflow controls</strong>
              <i>{advanced ? "−" : "+"}</i>
            </button>
            {advanced ? (
              <div className="grid grid-cols-12 gap-x-4 gap-y-3.5 p-4 max-sm:grid-cols-1 [&>label]:grid [&>label]:gap-1.5 [&>label>span]:text-xs [&>label>span]:font-semibold [&>label>select]:h-10.5 [&>label>select]:text-xs [&>label>textarea]:min-h-23 [&>label>textarea]:text-xs">
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Branch *</span>
                  <select defaultValue="Karachi Head Office" required>
                    <option>Karachi Head Office</option>
                    <option>Lahore Branch</option>
                  </select>
                </label>
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Department *</span>
                  <select defaultValue="Operations" required>
                    <option>Operations</option>
                    <option>Finance</option>
                    <option>Professional Services</option>
                  </select>
                </label>
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Cost centre</span>
                  <select defaultValue="CC-220 — Operations">
                    <option>CC-220 — Operations</option>
                    <option>CC-100 — Corporate</option>
                  </select>
                </label>
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Project / contract</span>
                  <select defaultValue="PRJ-1042 — Atlas rollout">
                    <option>PRJ-1042 — Atlas rollout</option>
                    <option>No project</option>
                  </select>
                </label>
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Source document</span>
                  <Input defaultValue="Linked automatically where applicable" />
                </label>
                <label className="col-span-4 max-md:col-span-6 max-sm:col-span-1">
                  <span>Approval route</span>
                  <select defaultValue="Value-based approval">
                    <option>Value-based approval</option>
                    <option>Standard approval</option>
                    <option>Management approval</option>
                  </select>
                </label>
                <label className="col-span-6 max-sm:col-span-1">
                  <span>Supporting attachments</span>
                  <Input type="file" multiple />
                  <small className="mt-1 block text-xs leading-snug text-muted-foreground">
                    PDF, image or spreadsheet · prototype selection is not uploaded.
                  </small>
                </label>
                <label className="col-span-6 max-sm:col-span-1">
                  <span>Internal notes</span>
                  <Textarea rows={3} placeholder="Visible to authorised reviewers only" />
                </label>
              </div>
            ) : null}
          </section>
        </div>

        <aside
          className="grid min-w-0 content-start gap-2.5 xl:sticky xl:top-[calc(var(--nx-header-height)+0.75rem)] max-xl:grid-cols-3 max-md:grid-cols-1"
          aria-label="Record review and assistance"
        >
          <nav className={formNavigatorClass} aria-label="Form sections">
            <span>Form navigator</span>
            <button type="button" onClick={() => onAction("Open section", "Essentials")}>
              <b>01</b> Essentials <i>Complete</i>
            </button>
            <button type="button" onClick={() => onAction("Open section", "Lines")}>
              <b>02</b> Lines <i>3 valid</i>
            </button>
            <button type="button" onClick={() => setAdvanced(true)}>
              <b>03</b> Controls <i>Review</i>
            </button>
          </nav>
          <section className={formHealthClass}>
            <header>
              <span>Record health</span>
              <strong>Ready with one review</strong>
            </header>
            <ul>
              {blueprint.checks.map(([title, detail], index) => (
                <li className={index < 2 ? "pass" : "warn"} key={title}>
                  <b>{index < 2 ? "✓" : "!"}</b>
                  <span>
                    <strong>{title}</strong>
                    <small>{detail}</small>
                  </span>
                </li>
              ))}
            </ul>
            <button
              className="mx-3 mb-3 w-[calc(100%-1.5rem)] rounded-md border border-primary/30 bg-primary/10 px-2 py-2 text-xs font-bold text-primary"
              type="button"
              onClick={() => onAction("Validate", context.pageLabel)}
            >
              Run all checks
            </button>
          </section>
          <section className={formIntelligenceClass}>
            <span>Live business context</span>
            <h3>Decision support</h3>
            <dl className={formMetricsClass}>
              {blueprint.contextMetrics.map(([label, value, note]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                  <small>{note}</small>
                </div>
              ))}
            </dl>
            <button type="button" onClick={() => onAction("View context", context.pageLabel)}>
              Open supporting records
            </button>
          </section>
          <section className={formAuditPreviewClass}>
            <span>Workflow preview</span>
            <p className={formWorkflowCopyClass}>{blueprint.workflow}</p>
            <div>
              <b>01</b>
              <p>
                <strong>Prepared by</strong>
                <small>{rows[0].owner}</small>
              </p>
            </div>
            <div>
              <b>02</b>
              <p>
                <strong>Next decision</strong>
                <small>Assigned automatically on submit</small>
              </p>
            </div>
            <div>
              <b>03</b>
              <p>
                <strong>Audit evidence</strong>
                <small>Version and changes retained visually</small>
              </p>
            </div>
          </section>
        </aside>

        <footer className="sticky bottom-2.5 z-30 col-span-full flex items-center gap-2 rounded-md border border-primary/30 bg-card/95 px-3 py-2.5 shadow-md backdrop-blur max-sm:flex-wrap max-sm:items-stretch [&>div]:mr-auto [&>div]:min-w-0 [&>div>strong]:block [&>div>strong]:text-xs [&>div>span]:mt-0.5 [&>div>span]:block [&>div>span]:text-xs [&>div>span]:text-muted-foreground max-sm:[&>div]:w-full max-sm:[&>div]:mr-0 max-sm:[&>button]:flex-1">
          <div>
            <strong>Unsaved {blueprint.recordLabel.toLowerCase()}</strong>
            <span>Prototype only · no live transaction or master record will be created</span>
          </div>
          <Button variant="outline" type="button" onClick={() => onAction("Cancel", context.pageLabel)}>
            Cancel
          </Button>
          <Button variant="outline" type="button" onClick={() => onAction("Save draft", context.pageLabel)}>
            Save draft
          </Button>
          <Button type="submit">Validate &amp; submit</Button>
        </footer>
      </form>
    </>
  );
}

function ApprovalTimeline() {
  const steps = [
    ["Requested", "Ayesha Malik", "31 Aug · 09:20", "complete"],
    ["Department manager", "Bilal Khan", "31 Aug · 10:05", "complete"],
    ["Finance review", "Mariam Ali", "Current step", "current"],
    ["Final approval", "Omar Siddiqui", "Pending", "pending"],
  ];
  return (
    <ol className="nx-approval-timeline">
      {steps.map(([label, person, time, state], index) => (
        <li className={state} key={label}>
          <i>{state === "complete" ? "✓" : index + 1}</i>
          <div>
            <strong>{label}</strong>
            <span>{person}</span>
            <small>{time}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function AuditTimeline({ compact = false }: { compact?: boolean }) {
  const items = [
    ["Record submitted", "Ayesha Malik", "Today, 10:18"],
    ["Amount updated", "Ayesha Malik", "Today, 09:54"],
    ["Attachment added", "Bilal Khan", "Yesterday, 16:32"],
    ["Draft created", "Ayesha Malik", "Yesterday, 15:11"],
  ];
  return (
    <ol className={`nx-audit-timeline ${compact ? "compact" : ""}`}>
      {items.map(([action, actor, time]) => (
        <li key={action}>
          <i />
          <div>
            <strong>{action}</strong>
            <span>{actor}</span>
            <small>{time}</small>
          </div>
        </li>
      ))}
    </ol>
  );
}

function ApprovalView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton tone="danger" onClick={() => onAction("Reject", rows[0].document)}>
          Reject
        </ActionButton>
        <ActionButton onClick={() => onAction("Return for revision", rows[0].document)}>Return</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Approve", rows[0].document)}>
          Approve
        </ActionButton>
      </PageIntro>
      <div className="nx-content-grid nx-approval-layout">
        <section className="nx-card nx-approval-record">
          <div className="nx-card-head">
            <div>
              <span>Approval request</span>
              <h2>{rows[0].document}</h2>
            </div>
            <StatusChip status="Pending approval" />
          </div>
          <div className="nx-approval-amount">
            <span>Total requested</span>
            <strong>{rows[0].amount}</strong>
            <small>
              {rows[0].party} · {rows[0].reference}
            </small>
          </div>
          <div className="nx-field-grid">
            <div>
              <span>Requested by</span>
              <strong>{rows[0].owner}</strong>
            </div>
            <div>
              <span>Department</span>
              <strong>Operations</strong>
            </div>
            <div>
              <span>Required by</span>
              <strong>03 Sep 2026</strong>
            </div>
            <div>
              <span>Risk level</span>
              <strong>Standard</strong>
            </div>
          </div>
          <div className="nx-comment-box">
            <span>Requester comment</span>
            <p>Please review before the supplier commitment date. Supporting documents are attached.</p>
          </div>
        </section>
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Workflow</span>
              <h2>Approval progress</h2>
            </div>
          </div>
          <ApprovalTimeline />
        </section>
        <section className="nx-card nx-span-two">
          <div className="nx-card-head">
            <div>
              <span>Decision history</span>
              <h2>Comments and evidence</h2>
            </div>
            <ActionButton onClick={() => onAction("Add comment", rows[0].document)}>Add comment</ActionButton>
          </div>
          <AuditTimeline />
        </section>
      </div>
    </>
  );
}

function WorkflowView({ context, rows, onAction, onOpenPage }: Omit<PrototypeContentProps, "viewState">) {
  const steps = [
    "Request",
    "Approval",
    "RFQ",
    "Evaluation",
    "Order",
    "Receipt",
    "Quality",
    "Bill",
    "Match",
    "Payment",
    "Reconciliation",
    "GL",
  ];
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Refresh workflow", context.pageLabel)}>Refresh</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Start workflow", context.pageLabel)}>
          Start workflow
        </ActionButton>
      </PageIntro>
      <section className="nx-card nx-workflow-map">
        <div className="nx-card-head">
          <div>
            <span>End-to-end journey</span>
            <h2>{context.pageLabel}</h2>
          </div>
          <StatusChip status="In progress" />
        </div>
        <div className="nx-workflow-steps">
          {steps.map((step, index) => (
            <button
              className={index < 4 ? "complete" : index === 4 ? "current" : "pending"}
              type="button"
              key={step}
              onClick={() => (index === 4 ? onAction("Open current step", step) : onOpenPage(context.pageId))}
            >
              <i>{index < 4 ? "✓" : index + 1}</i>
              <span>{step}</span>
              <small>{index < 4 ? "Completed" : index === 4 ? "Current" : "Pending"}</small>
            </button>
          ))}
        </div>
      </section>
      <div className="nx-content-grid">
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Current step</span>
              <h2>Purchase order review</h2>
            </div>
            <ActionButton tone="primary" onClick={() => onAction("Continue", "Purchase order review")}>
              Continue
            </ActionButton>
          </div>
          <div className="nx-field-grid">
            <div>
              <span>Document</span>
              <strong>{rows[0].document}</strong>
            </div>
            <div>
              <span>Owner</span>
              <strong>{rows[0].owner}</strong>
            </div>
            <div>
              <span>Amount</span>
              <strong>{rows[0].amount}</strong>
            </div>
            <div>
              <span>Status</span>
              <StatusChip status="In review" />
            </div>
          </div>
        </section>
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Exceptions</span>
              <h2>Items to resolve</h2>
            </div>
          </div>
          <div className="nx-exception-list">
            <button type="button" onClick={() => onAction("Resolve", "Budget variance")}>
              <b>!</b>
              <span>
                <strong>Budget variance</strong>
                <small>3.8% above remaining commitment</small>
              </span>
            </button>
            <button type="button" onClick={() => onAction("Resolve", "Supplier certificate")}>
              <b>!</b>
              <span>
                <strong>Supplier certificate</strong>
                <small>Expires in 14 days</small>
              </span>
            </button>
          </div>
        </section>
      </div>
    </>
  );
}

function ReportView({ context, rows, onAction }: Omit<PrototypeContentProps, "viewState" | "onOpenPage">) {
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Print", context.pageLabel)}>Print</ActionButton>
        <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>
          Run report
        </ActionButton>
      </PageIntro>
      <section className="nx-card nx-report-filters">
        <label>
          <span>Date from</span>
          <Input type="date" defaultValue="2026-01-01" />
        </label>
        <label>
          <span>Date to</span>
          <Input type="date" defaultValue="2026-08-31" />
        </label>
        <label>
          <span>Company</span>
          <select>
            <option>Nexora Services Ltd.</option>
          </select>
        </label>
        <label>
          <span>Dimension</span>
          <select>
            <option>All dimensions</option>
            <option>Operations</option>
            <option>Professional Services</option>
          </select>
        </label>
        <label>
          <span>Status</span>
          <select>
            <option>All statuses</option>
            <option>Approved</option>
            <option>Posted</option>
          </select>
        </label>
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>
          Run report
        </ActionButton>
      </section>
      <div className="nx-kpi-grid nx-report-kpis">
        <article className="nx-kpi">
          <div>
            <span>Total activity</span>
          </div>
          <strong>$8.42M</strong>
          <small className="positive">
            +14.8% <em>year to date</em>
          </small>
        </article>
        <article className="nx-kpi">
          <div>
            <span>Average value</span>
          </div>
          <strong>$42,680</strong>
          <small>128 records</small>
        </article>
        <article className="nx-kpi">
          <div>
            <span>Exceptions</span>
          </div>
          <strong>14</strong>
          <small className="warning">4 require action</small>
        </article>
        <article className="nx-kpi">
          <div>
            <span>Last refreshed</span>
          </div>
          <strong>14:42</strong>
          <small>31 Aug 2026</small>
        </article>
      </div>
      <div className="nx-content-grid nx-report-layout">
        <section className="nx-card nx-chart-card">
          <div className="nx-card-head">
            <div>
              <span>Trend analysis</span>
              <h2>{context.pageLabel}</h2>
            </div>
            <StatusChip status="Mock report" />
          </div>
          <div className="nx-bar-chart nx-report-chart">
            {chartHeights.map((height, index) => (
              <i key={months[index]} style={{ height }}>
                <span>{months[index]}</span>
              </i>
            ))}
          </div>
        </section>
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Composition</span>
              <h2>By status</h2>
            </div>
          </div>
          <div className="nx-donut">
            <i>
              <b>78%</b>
              <span>On target</span>
            </i>
            <ul>
              <li>
                <b className="blue" />
                Approved <span>52%</span>
              </li>
              <li>
                <b className="cyan" />
                In progress <span>26%</span>
              </li>
              <li>
                <b className="sky" />
                Exceptions <span>14%</span>
              </li>
              <li>
                <b className="indigo" />
                Draft <span>8%</span>
              </li>
            </ul>
          </div>
        </section>
      </div>
      <section className="nx-card nx-report-table">
        <div className="nx-card-head">
          <div>
            <span>Report results</span>
            <h2>Detailed records</h2>
          </div>
        </div>
        <div className="nx-table-wrap">
          <table className="nx-data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Reference</th>
                <th>Party / account</th>
                <th>Description</th>
                <th className="amount">Debit</th>
                <th className="amount">Credit</th>
                <th className="amount">Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={row.id}>
                  <td>{row.date}</td>
                  <td>
                    <button
                      className="nx-record-link"
                      type="button"
                      onClick={() => onAction("Drill down", row.document)}
                    >
                      {row.document}
                    </button>
                  </td>
                  <td>{row.party}</td>
                  <td>{row.reference}</td>
                  <td className="amount">{index % 2 ? "—" : row.amount}</td>
                  <td className="amount">{index % 2 ? row.amount : "—"}</td>
                  <td className="amount">${(428000 + index * 12480).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function SettingsView({
  context,
  onAction,
}: Omit<PrototypeContentProps, "viewState" | "rows" | "onOpenPage" | "onNavigate">) {
  const sections = [
    "General",
    "Company",
    "Finance",
    "Sales",
    "Purchasing",
    "Inventory",
    "Projects",
    "HR",
    "Notifications",
    "Documents",
    "Integrations",
    "Workflow",
  ];
  const [section, setSection] = useState("General");
  return (
    <>
      <PageIntro context={context}>
        <ActionButton onClick={() => onAction("Discard changes", section)}>Discard</ActionButton>
        <ActionButton tone="primary" onClick={() => onAction("Save settings", section)}>
          Save changes
        </ActionButton>
      </PageIntro>
      <div className="nx-settings-layout">
        <nav className="nx-card nx-settings-nav" aria-label="Settings sections">
          {sections.map((item) => (
            <button
              className={section === item ? "active" : ""}
              key={item}
              type="button"
              onClick={() => setSection(item)}
            >
              {item}
              <span>›</span>
            </button>
          ))}
        </nav>
        <section className="nx-card nx-settings-panel">
          <div className="nx-card-head">
            <div>
              <span>{section}</span>
              <h2>{section} settings</h2>
            </div>
            <StatusChip status="Prototype only" />
          </div>
          <div className="nx-input-grid nx-settings-fields">
            <label>
              <span>Configuration name</span>
              <Input defaultValue={`${section} policy — Default`} />
            </label>
            <label>
              <span>Effective from</span>
              <Input type="date" defaultValue="2026-09-01" />
            </label>
            <label className="nx-field-wide">
              <span>Description</span>
              <Textarea
                defaultValue={`Default ${section.toLowerCase()} configuration for the visual Nexora prototype.`}
                rows={3}
              />
            </label>
            <div className="nx-setting-toggle nx-field-wide">
              <span>
                <strong>Require approval</strong>
                <small>Route material changes through the prototype approval workflow.</small>
              </span>
              <Checkbox defaultChecked />
            </div>
            <div className="nx-setting-toggle nx-field-wide">
              <span>
                <strong>Record audit history</strong>
                <small>Show before-and-after evidence in the prototype audit timeline.</small>
              </span>
              <Checkbox defaultChecked />
            </div>
            <div className="nx-setting-toggle nx-field-wide">
              <span>
                <strong>Enable notifications</strong>
                <small>Display in-app reminders and exception alerts.</small>
              </span>
              <Checkbox defaultChecked />
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

function ComingSoonView({
  context,
  onAction,
}: Omit<PrototypeContentProps, "viewState" | "rows" | "onOpenPage" | "onNavigate">) {
  return (
    <>
      <PageIntro context={context} />
      <section className="nx-state-card nx-coming-soon">
        <span className="nx-state-symbol">↗</span>
        <StatusChip status={context.status === "coming-soon" ? "Coming soon" : "Not implemented"} />
        <strong>{context.pageLabel} is mapped for future review</strong>
        <p>
          This page is included in the complete product navigation but has no real transaction logic. It remains an
          explicit visual roadmap state.
        </p>
        <div>
          <ActionButton onClick={() => onAction("View requirements", context.pageLabel)}>
            View requirements
          </ActionButton>
          <ActionButton tone="primary" onClick={() => onAction("Request prototype", context.pageLabel)}>
            Request prototype
          </ActionButton>
        </div>
      </section>
    </>
  );
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
        <ActionButton tone="primary" onClick={() => onAction("Open report", context.pageLabel)}>
          Open report
        </ActionButton>
      </PageIntro>
      <ModuleKpiGrid kpis={profile.kpis} onSelect={(kpi) => onAction("Drill into", kpi.label)} />
      <section className="nx-role-grid">
        {profile.charts.map((chart, index) => (
          <ModuleChartPanel chart={chart} index={index} key={`${chart.kind}-${chart.title}`} />
        ))}
        {profile.attention?.length ? (
          <article className="nx-role-panel nx-role-panel--wide">
            <div className="nx-role-panel__head">
              <div>
                <span>Action centre</span>
                <h2>{profile.attentionTitle ?? "Needs attention"}</h2>
                <p>Open the source workspace to investigate each item.</p>
              </div>
            </div>
            <div className="nx-role-alerts">
              {profile.attention.map((item) => (
                <button
                  className="nx-role-alert"
                  key={item.id}
                  type="button"
                  onClick={() => onAction("Resolve", item.title)}
                >
                  <span>
                    <i
                      className={`nx-role-severity nx-role-severity--${item.tone === "danger" ? "critical" : item.tone === "warning" ? "high" : "low"}`}
                    >
                      {item.status}
                    </i>
                    <strong>{item.title}</strong>
                    <small>{item.detail}</small>
                  </span>
                  <span>
                    <small>Action</small>
                    <b>Review</b>
                  </span>
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
        <ActionButton tone="primary" onClick={() => onAction("Submit", primaryValue)}>
          Submit
        </ActionButton>
        <div className="nx-action-menu">
          <ActionButton tone="ghost" onClick={() => setMoreOpen((value) => !value)}>
            More actions
          </ActionButton>
          {moreOpen ? (
            <div className="nx-action-menu__popover" role="menu">
              <div className="nx-action-menu__label">Lifecycle actions</div>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Approve", primaryValue);
                }}
              >
                Approve record
              </button>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Post", primaryValue);
                }}
              >
                Post cost allocation
              </button>
              <button
                className="nx-action-menu__item"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Reverse", primaryValue);
                }}
              >
                Reverse accounting event
              </button>
              <div className="nx-action-menu__separator" />
              <button
                className="nx-action-menu__item nx-action-menu__item--danger"
                role="menuitem"
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  onAction("Cancel", primaryValue);
                }}
              >
                Cancel draft
              </button>
            </div>
          ) : null}
        </div>
      </PageIntro>
      <section className="nx-record-summary nx-card">
        <div>
          <span>Record</span>
          <strong>{primaryValue}</strong>
        </div>
        <div>
          <span>Module</span>
          <strong>{context.moduleLabel}</strong>
        </div>
        <div>
          <span>Owner</span>
          <strong>Fleet Operations</strong>
        </div>
        <div>
          <span>Last updated</span>
          <strong>15 Sep 2026, 14:42</strong>
        </div>
        <div>
          <span>Status</span>
          <StatusChip status={status} />
        </div>
      </section>
      <EnterpriseTransactionControl
        subject={context.pageLabel}
        reference={primaryValue}
        roleId={context.roleId}
        companyMode={context.companyMode}
        family={blueprint.family}
        initialStatus={status}
        onAction={onAction}
      />
      <div className="nx-tabs" role="tablist" aria-label="Record detail sections">
        {tabs.map((item) => (
          <button
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "active" : ""}
            type="button"
            key={item}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>
      {tab === "Overview" ? (
        <div className="nx-content-grid nx-detail-layout">
          <section className="nx-card nx-detail-main">
            <div className="nx-card-head">
              <div>
                <span>360-degree record</span>
                <h2>Operational, compliance and financial context</h2>
              </div>
              <StatusChip status={status} />
            </div>
            <div className="nx-field-grid">
              {profile.fields.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </section>
          <aside className="nx-card nx-activity-panel">
            <div className="nx-card-head">
              <div>
                <span>Connected controls</span>
                <h2>Traceability</h2>
              </div>
            </div>
            <div className="nx-exception-list">
              <button type="button" onClick={() => onAction("View", "Source documents")}>
                <b>1</b>
                <span>
                  <strong>Source documents</strong>
                  <small>Assignments, trips, fuel, work orders and claims</small>
                </span>
              </button>
              <button type="button" onClick={() => onAction("View", "Accounting impact")}>
                <b>2</b>
                <span>
                  <strong>Accounting impact</strong>
                  <small>Expense account, cost centre and asset linkage</small>
                </span>
              </button>
              <button type="button" onClick={() => onAction("View", "Audit evidence")}>
                <b>3</b>
                <span>
                  <strong>Audit evidence</strong>
                  <small>Approvals, attachments and immutable activity</small>
                </span>
              </button>
            </div>
          </aside>
        </div>
      ) : (
        <section className="nx-card nx-report-table">
          <div className="nx-card-head">
            <div>
              <span>{tab}</span>
              <h2>{tab === "Activity & cost" ? "Connected source activity" : "Record evidence and traceability"}</h2>
            </div>
            <ActionButton onClick={() => onAction("Export", primaryValue)}>Export</ActionButton>
          </div>
          <ModuleDataTable
            columns={profile.lineColumns}
            rows={profile.lines}
            onOpen={(row) => onAction("Drill down", row.id)}
          />
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
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>
          Run report
        </ActionButton>
      </PageIntro>
      <section className="nx-card nx-report-filters">
        <label>
          <span>Date from</span>
          <Input type="date" defaultValue="2026-01-01" />
        </label>
        <label>
          <span>Date to</span>
          <Input type="date" defaultValue="2026-08-31" />
        </label>
        <label>
          <span>Company</span>
          <select>
            <option>Nexora Services Ltd.</option>
          </select>
        </label>
        <label>
          <span>Account</span>
          <select>
            <option>All accounts</option>
            <option>Operating USD — 4471</option>
            <option>Collections EUR — 8814</option>
          </select>
        </label>
        <ActionButton tone="primary" onClick={() => onAction("Run report", context.pageLabel)}>
          Run report
        </ActionButton>
      </section>
      <ModuleKpiGrid kpis={profile.kpis} onSelect={(kpi) => onAction("Drill into", kpi.label)} />
      <section className="nx-role-grid">
        {profile.charts.map((chart, index) => (
          <ModuleChartPanel chart={chart} index={index} key={`${chart.kind}-${chart.title}`} />
        ))}
      </section>
      <section className="nx-card nx-report-table">
        <div className="nx-card-head">
          <div>
            <span>Report results</span>
            <h2>Detailed records</h2>
          </div>
        </div>
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
        <ActionButton tone="primary" onClick={() => onAction("Continue", profile.currentTitle)}>
          Continue
        </ActionButton>
      </PageIntro>
      <section className="nx-card nx-workflow-map">
        <div className="nx-card-head">
          <div>
            <span>End-to-end journey</span>
            <h2>{context.pageLabel}</h2>
          </div>
          <StatusChip status="In progress" />
        </div>
        <div className="nx-workflow-steps">
          {profile.steps.map((step, index) => (
            <button
              className={step.state}
              key={step.label}
              type="button"
              onClick={() => onAction("Open step", step.label)}
            >
              <i>{step.state === "complete" ? "✓" : index + 1}</i>
              <span>{step.label}</span>
              <small>
                {step.state === "complete" ? "Completed" : step.state === "current" ? "Current" : "Pending"}
              </small>
            </button>
          ))}
        </div>
      </section>
      <div className="nx-content-grid">
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Current step</span>
              <h2>{profile.currentTitle}</h2>
            </div>
            <ActionButton tone="primary" onClick={() => onAction("Continue", profile.currentTitle)}>
              Continue
            </ActionButton>
          </div>
          <div className="nx-field-grid">
            {profile.currentFields.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>
        </section>
        <section className="nx-card">
          <div className="nx-card-head">
            <div>
              <span>Exceptions</span>
              <h2>Items to resolve</h2>
            </div>
          </div>
          <div className="nx-exception-list">
            {profile.exceptions.map((exception) => (
              <button key={exception.id} type="button" onClick={() => onAction("Resolve", exception.title)}>
                <b>!</b>
                <span>
                  <strong>{exception.title}</strong>
                  <small>{exception.detail}</small>
                </span>
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
        <ActionButton tone="primary" onClick={() => onAction("Save and submit", context.pageLabel)}>
          Save &amp; submit
        </ActionButton>
      </PageIntro>
      <section className={formContextStripClass} aria-label="Form context">
        <div>
          <span>Form status</span>
          <strong>
            <i /> Draft
          </strong>
          <small>Changes are not posted</small>
        </div>
        <div>
          <span>Sections</span>
          <strong>{profile.sections.length}</strong>
          <small>Complete from top to bottom</small>
        </div>
        <div>
          <span>Validation</span>
          <strong>Ready</strong>
          <small>Runs before submission</small>
        </div>
        <div>
          <span>Approval</span>
          <strong>Policy based</strong>
          <small>Determined by role and value</small>
        </div>
      </section>
      <EnterpriseTransactionControl
        subject={context.pageLabel}
        reference={blueprint.numberPrefix}
        roleId={context.roleId}
        companyMode={context.companyMode}
        family={blueprint.family}
        onAction={onAction}
      />
      <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(16.875rem,19.375rem)] items-start gap-3.5 max-xl:grid-cols-1">
        <div className="grid min-w-0 gap-3.5">
          {profile.sections.map((section, sectionIndex) => (
            <section
              className="nx-card !overflow-hidden !rounded-md !border-border !bg-card !p-0 shadow-xs"
              key={section.title}
            >
              <div className="nx-section-title">
                <span>{String(sectionIndex + 1).padStart(2, "0")}</span>
                <div>
                  <h2>{section.title}</h2>
                  <p>Complete the relevant information; required controls are checked automatically.</p>
                </div>
                <em>{section.fields.length} fields</em>
              </div>
              <div className="grid grid-cols-12 gap-x-4 gap-y-3.5 p-4 max-sm:grid-cols-1">
                {section.fields.map((field, fieldIndex) => (
                  <label
                    className={`grid gap-1.5 [&>span]:text-xs [&>span]:font-semibold [&>select]:h-10.5 [&>select]:text-xs [&>textarea]:min-h-23 [&>textarea]:text-xs ${field.wide ? "col-span-full" : fieldIndex % 3 === 0 ? "col-span-6 max-sm:col-span-1" : "col-span-3 max-md:col-span-6 max-sm:col-span-1"}`}
                    key={field.label}
                  >
                    <span>{field.label}</span>
                    {field.type === "textarea" ? (
                      <Textarea defaultValue={field.value} rows={3} />
                    ) : field.type === "select" ? (
                      <select defaultValue={field.value}>
                        {(field.options ?? [field.value]).map((option) => (
                          <option key={option}>{option}</option>
                        ))}
                      </select>
                    ) : (
                      <Input defaultValue={field.value} type={field.type === "date" ? "date" : "text"} />
                    )}
                  </label>
                ))}
              </div>
            </section>
          ))}
        </div>
        <aside className="grid min-w-0 content-start gap-2.5 xl:sticky xl:top-[calc(var(--nx-header-height)+0.75rem)] max-xl:grid-cols-2 max-md:grid-cols-1">
          <section className={formHealthClass}>
            <header>
              <span>Form health</span>
              <strong>Guided completion</strong>
            </header>
            <ul>
              <li className="pass">
                <b>✓</b>
                <span>
                  <strong>Smart defaults</strong>
                  <small>Company and role context applied</small>
                </span>
              </li>
              <li className="pass">
                <b>✓</b>
                <span>
                  <strong>Consistent structure</strong>
                  <small>Shared Nexora field standards</small>
                </span>
              </li>
              <li className="warn">
                <b>!</b>
                <span>
                  <strong>Review required</strong>
                  <small>Validate before submitting</small>
                </span>
              </li>
            </ul>
          </section>
          <section className={formIntelligenceClass}>
            <span>Contextual assistance</span>
            <h3>What happens next?</h3>
            <p>
              The prototype shows role-aware validation, approval routing and downstream impact without creating real
              data.
            </p>
            <button type="button" onClick={() => onAction("Validate", context.pageLabel)}>
              Validate record
            </button>
          </section>
        </aside>
        <footer className="sticky bottom-2.5 z-30 col-span-full flex items-center gap-2 rounded-md border border-primary/30 bg-card/95 px-3 py-2.5 shadow-md backdrop-blur max-sm:flex-wrap max-sm:items-stretch [&>div]:mr-auto [&>div]:min-w-0 [&>div>strong]:block [&>div>strong]:text-xs [&>div>span]:mt-0.5 [&>div>span]:block [&>div>span]:text-xs [&>div>span]:text-muted-foreground max-sm:[&>div]:w-full max-sm:[&>div]:mr-0 max-sm:[&>button]:flex-1">
          <div>
            <strong>{context.pageLabel}</strong>
            <span>Prototype draft · all changes remain mock-only</span>
          </div>
          <Button variant="outline" type="button" onClick={() => onAction("Cancel", context.pageLabel)}>
            Cancel
          </Button>
          <Button variant="outline" type="button" onClick={() => onAction("Save draft", context.pageLabel)}>
            Save draft
          </Button>
          <Button type="button" onClick={() => onAction("Save and submit", context.pageLabel)}>
            Save & submit
          </Button>
        </footer>
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
  revaluation: "bank-revaluation",
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
  const routed: ReconciliationView =
    (context.recordRef?.startsWith("new") ?? false)
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
        <ActionButton tone="primary" onClick={() => setView({ kind: "new" })}>
          + Add New
        </ActionButton>
      </PageIntro>
      {view.kind === "new" ? (
        <BankingReconciliationWorksheet
          initialAccountId={context.recordRef?.split("/")[1]}
          records={records}
          onAction={onAction}
          onCreate={(record, submitted) => {
            setCreated((current) => [record, ...current]);
            setView({ kind: "register" });
            onAction(
              submitted ? "Reconciliation submitted" : "Reconciliation saved",
              `${record.id} · ${record.periodLabel}`,
            );
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
  const [selectedBankAccountId, setSelectedBankAccountId] = useState("");
  const isLiveBankingTransactionPage =
    context.moduleId === "banking" &&
    (context.pageId === "bank-payments" ||
      context.pageId === "bank-receipts" ||
      context.pageId === "add-bank-payment" ||
      context.pageId === "add-bank-receipt" ||
      (context.pageId === "transaction-detail" &&
        (isPersistedBankPaymentId(context.recordRef) || isPersistedBankReceiptId(context.recordRef))));
  if (!isLiveBankingTransactionPage && viewState !== "data")
    return (
      <>
        <PageIntro context={context} />
        <StateSurface
          state={viewState}
          pageLabel={context.pageLabel}
          onRetry={() => onAction("Retry", context.pageLabel)}
        />
      </>
    );
  if (["coming-soon", "not-implemented"].includes(context.status))
    return <ComingSoonView context={context} onAction={onAction} />;

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
    return (
      <CommercialWorkspace context={context} rows={props.rows} onAction={onAction} onNavigate={props.onNavigate} />
    );
  }

  // Core HR foundation: the organisation tree and the six HR masters. Every
  // master renders through one screen, so they cannot drift apart.
  if (context.moduleId === "hr") {
    if (context.pageId === "employee-approvals") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeApprovalsWorkspace onAction={onAction} />
        </>
      );
    }
    if (context.pageId === "employee-contacts") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeContactsWorkspace onAction={onAction} />
        </>
      );
    }
    if (context.pageId === "employee-emergency-contacts") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeEmergencyContactsWorkspace onAction={onAction} />
        </>
      );
    }
    if (context.pageId === "employee-documents") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeDocumentsWorkspace />
        </>
      );
    }
    if (context.pageId === "employee-assignments") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeAssignmentsWorkspace />
        </>
      );
    }
    if (context.pageId === "employee-status-history") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeHistoryWorkspace />
        </>
      );
    }
    if (context.pageId === "employee-drafts") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeDraftsWorkspace
            onAction={onAction}
            fallback={
              <ListView context={context} rows={props.rows} onAction={onAction} onNavigate={props.onNavigate} />
            }
          />
        </>
      );
    }
    if (context.pageId === "add-employee") {
      return (
        <>
          <PageIntro context={context} />
          <HrEmployeeDraftForm
            onAction={onAction}
            fallback={
              <FormView context={context} rows={props.rows} onAction={onAction} onNavigate={props.onNavigate} />
            }
          />
        </>
      );
    }
    if (context.pageId === "employees") {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction("Add employee", context.pageLabel)}>
              + Add Employee
            </ActionButton>
          </PageIntro>
          <HrEmployeeDirectory
            onAction={onAction}
            fallback={
              <ListView context={context} rows={props.rows} onAction={onAction} onNavigate={props.onNavigate} />
            }
          />
        </>
      );
    }
    if (context.pageId === "org-structure") {
      return (
        <>
          <PageIntro context={context}>
            <ActionButton onClick={() => onAction("Export", context.pageLabel)}>Export</ActionButton>
            <ActionButton tone="primary" onClick={() => onAction("Add company", context.pageLabel)}>
              + Add New
            </ActionButton>
          </PageIntro>
          <HrOrgStructure onAction={onAction} />
        </>
      );
    }
    if (context.pageId === "lifecycle-policies") {
      return (
        <>
          <PageIntro context={context} />
          <HrLifecyclePoliciesWorkspace />
        </>
      );
    }
    if (context.pageId === "jobs")
      return (
        <>
          <PageIntro context={context} />
          <HrJobsWorkspace />
        </>
      );
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
            <ActionButton tone="primary" onClick={() => onAction("Add", context.pageLabel)}>
              + Add New
            </ActionButton>
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
            <ActionButton tone="primary" onClick={() => onAction("Add", context.pageLabel)}>
              + Add New
            </ActionButton>
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
            <ActionButton
              tone="primary"
              onClick={() => onAction(`Add ${master.singular.toLowerCase()}`, context.pageLabel)}
            >
              + Add New
            </ActionButton>
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
    if (context.pageId === "bank-payments") {
      return (
        <BankingPayments
          onCreatePayment={() => props.onNavigate("banking", "add-bank-payment")}
          onOpenPayment={(paymentId) => props.onNavigate("banking", "transaction-detail", paymentId)}
        />
      );
    }

    if (context.pageId === "bank-receipts") {
      return (
        <BankingReceipts
          onCreateReceipt={() => props.onNavigate("banking", "add-bank-receipt")}
          onOpenReceipt={(receiptId) => props.onNavigate("banking", "transaction-detail", receiptId)}
        />
      );
    }

    if (context.pageId === "add-bank-payment") {
      return (
        <BankingPaymentEntry
          paymentId={context.recordRef}
          onBack={() => props.onNavigate("banking", "bank-payments", undefined, { bypassUnsavedGuard: true })}
          onDirtyChange={props.onPaymentEntryDirtyChange}
          onNavigate={(pageId, paymentId, options) =>
            props.onNavigate("banking", pageId, paymentId, {
              ...options,
              bypassUnsavedGuard: true,
            })
          }
        />
      );
    }

    if (context.pageId === "add-bank-receipt") {
      return (
        <BankingReceiptEntry
          receiptId={context.recordRef}
          onBack={() => props.onNavigate("banking", "bank-receipts", undefined, { bypassUnsavedGuard: true })}
          onDirtyChange={props.onReceiptEntryDirtyChange}
          onNavigate={(pageId, receiptId, options) =>
            props.onNavigate("banking", pageId, receiptId, {
              ...options,
              bypassUnsavedGuard: true,
            })
          }
        />
      );
    }

    if (context.pageId === "account-balances" || context.pageId === "bank-accounts") {
      return (
        <>
          <PageIntro context={{ ...context, status: "backend connected" }}>
            <Button variant="outline" type="button" disabled title="A governed export API is not available yet">
              Export unavailable
            </Button>
            <ActionButton tone="primary" onClick={() => props.onNavigate("banking", "add-bank-account")}>
              + Add New
            </ActionButton>
          </PageIntro>
          <BankingAccountBalances
            onOpenAccount={(accountId) => {
              setSelectedBankAccountId(accountId);
              props.onNavigate("banking", "bank-account-detail");
            }}
          />
        </>
      );
    }

    if (context.pageId === "add-bank-account") {
      return (
        <>
          <PageIntro context={{ ...context, status: "backend connected" }} />
          <BankAccountSetup onCreated={(accountId) => setSelectedBankAccountId(accountId)} />
        </>
      );
    }

    if (context.pageId === "bank-account-approvals") {
      return (
        <>
          <PageIntro context={{ ...context, status: "backend connected" }} />
          <BankAccountApprovals />
        </>
      );
    }

    if (context.pageId === "bank-account-detail") {
      return (
        <>
          <PageIntro context={{ ...context, status: "backend connected" }} />
          <BankAccountDetailWorkspace
            accountId={selectedBankAccountId}
            onBack={() => props.onNavigate("banking", "account-balances")}
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
      if (isPersistedBankPaymentId(context.recordRef)) {
        return (
          <BankingPaymentDetail
            key={context.recordRef}
            paymentId={context.recordRef}
            onBack={() => props.onNavigate("banking", "bank-payments")}
            onEdit={(paymentId) => props.onNavigate("banking", "add-bank-payment", paymentId)}
          />
        );
      }
      return (
        <BankingTransactionDetail
          reference={selectedBankingRecord ? undefined : (context.recordRef ?? selectedBankingReference)}
          sourcePageId={selectedBankingRecord?.pageId}
          sourceRow={selectedBankingRecord?.row}
          onAction={onAction}
          onBack={() => props.onNavigate("banking", selectedBankingRecord?.pageId ?? "bank-payments")}
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
  if (moduleProfile?.dashboard)
    return <MaturedDashboardView context={context} profile={moduleProfile.dashboard} onAction={onAction} />;
  if (moduleProfile?.detail)
    return <MaturedDetailView context={context} profile={moduleProfile.detail} onAction={onAction} />;
  if (moduleProfile?.report)
    return <MaturedReportView context={context} profile={moduleProfile.report} onAction={onAction} />;
  if (moduleProfile?.workflow)
    return <MaturedWorkflowView context={context} profile={moduleProfile.workflow} onAction={onAction} />;
  if (moduleProfile?.form)
    return <MaturedFormView context={context} profile={moduleProfile.form} onAction={onAction} />;
  if (moduleProfile?.list)
    return (
      <MaturedListView
        context={context}
        profile={moduleProfile.list}
        onAction={onAction}
        onNavigate={props.onNavigate}
      />
    );

  const roleDashboard = getRoleDashboard(context.pageId);
  if (roleDashboard) {
    return (
      <RoleDashboard context={context} dashboard={roleDashboard} onAction={onAction} onNavigate={props.onNavigate} />
    );
  }
  const type = context.archetype.toLowerCase();
  if (type.includes("dashboard")) return <DashboardView {...props} />;
  if (type.includes("form") || type.includes("create") || type.includes("edit")) return <FormView {...props} />;
  if (type.includes("detail") || type.includes("profile")) return <DetailView {...props} />;
  if (type.includes("approval")) return <ApprovalView {...props} />;
  if (type.includes("workflow") || type.includes("journey")) return <WorkflowView {...props} />;
  if (type.includes("report") || type.includes("analytics")) return <ReportView {...props} />;
  if (type.includes("setting") || type.includes("configuration"))
    return <SettingsView context={context} onAction={onAction} />;
  return <ListView key={`${context.moduleId}:${context.pageId}:${context.recordRef ?? ""}`} {...props} />;
}
