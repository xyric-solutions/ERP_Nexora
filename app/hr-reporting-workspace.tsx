"use client";

import { useMemo, useState } from "react";
import { orgUnits } from "./hr-core-data";
import {
  buildReportAuditEvent,
  buildReportSnapshot,
  canExportReport,
  canViewReport,
  complianceConfigurations,
  defaultReportFilters,
  financePayrollDashboardSnapshot,
  hrDashboardSnapshot,
  hrReportDefinitions,
  phase5ReportIds,
  reportActorForRole,
  reportDefinition,
  reportingPerformancePolicy,
  validateReportScope,
  type ExportFormat,
  type ReportAuditEvent,
  type ReportFilters,
} from "./hr-reporting-data";

interface HrReportingWorkspaceProps {
  context: { pageId: string; pageLabel: string; role: string; mode: string };
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}

const moneyNote = "Finalized Phase 3 payroll snapshot; mock-only prototype data.";

function ReportingNotice() {
  return (
    <section className="nx-hr5-notice" aria-label="Reporting data assurance">
      <strong>Governed prototype reporting</strong>
      <span>Reads approved masters, locked attendance and closed payroll snapshots. No Demo Account, posting service or bank data is changed.</span>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: readonly { label: string; value: string; note: string }[] }) {
  return (
    <section className="nx-hr5-metrics" aria-label="Headline metrics">
      {metrics.map((metric) => (
        <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.note}</small></article>
      ))}
    </section>
  );
}

function BarAnalysis({ title, subtitle, series, onOpen }: { title: string; subtitle: string; series: readonly { label: string; value: number }[]; onOpen: (label: string) => void }) {
  const max = Math.max(...series.map((row) => row.value), 1);
  return (
    <article className="nx-hr5-panel nx-hr5-panel--chart">
      <header><div><span>Analytical view</span><h2>{title}</h2><p>{subtitle}</p></div><button type="button" onClick={() => onOpen(title)}>View report</button></header>
      <div className="nx-hr5-bars" role="img" aria-label={title}>
        {series.map((row) => (
          <button type="button" key={row.label} onClick={() => onOpen(row.label)} aria-label={`${row.label}: ${row.value}`}>
            <span><b>{row.label}</b><em>{row.value.toLocaleString("en-US")}</em></span>
            <i><b style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} /></i>
          </button>
        ))}
      </div>
    </article>
  );
}

function FilterBar({ filters, onChange, onRun }: { filters: ReportFilters; onChange: (next: ReportFilters) => void; onRun: () => void }) {
  const branches = orgUnits.filter((unit) => unit.type === "Branch");
  const departments = orgUnits.filter((unit) => unit.type === "Department" && (filters.branchId === "all" || unit.parentId === filters.branchId));
  return (
    <section className="nx-hr5-filters" aria-label="Report filters">
      <label><span>Company</span><select value={filters.companyId} onChange={(event) => onChange({ ...filters, companyId: event.target.value })}><option value="ORG-CO-001">Nexora Services (Private) Limited</option></select></label>
      <label><span>Branch</span><select value={filters.branchId} onChange={(event) => onChange({ ...filters, branchId: event.target.value, departmentId: "all" })}><option value="all">All authorized branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label><span>Department</span><select value={filters.departmentId} onChange={(event) => onChange({ ...filters, departmentId: event.target.value })}><option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label><span>From</span><input type="date" value={filters.fromDate} onChange={(event) => onChange({ ...filters, fromDate: event.target.value })} /></label>
      <label><span>To</span><input type="date" value={filters.toDate} onChange={(event) => onChange({ ...filters, toDate: event.target.value })} /></label>
      <label><span>Status</span><select value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}><option value="all">All statuses</option><option>Active</option><option>Approved</option><option>Pending</option><option>Exception</option></select></label>
      <button className="nx-button nx-button-primary" type="button" onClick={onRun}>Run</button>
    </section>
  );
}

function HrDashboard({ finance, onNavigate, onAction }: Pick<HrReportingWorkspaceProps, "onNavigate" | "onAction"> & { finance?: boolean }) {
  const [filters, setFilters] = useState(defaultReportFilters);
  const hr = hrDashboardSnapshot(filters);
  const payroll = financePayrollDashboardSnapshot();
  const metrics = finance ? payroll.metrics : hr.metrics;
  const series = finance ? payroll.payrollByDepartment.map((row) => ({ label: row.department, value: row.gross })) : hr.headcount;
  return (
    <div className="nx-hr5">
      <header className="nx-hr5-hero">
        <div><span className="nx-eyebrow">{finance ? "Finance / payroll control" : "People analytics"}</span><h1>{finance ? "Finance & Payroll Dashboard" : "HR Dashboard"}</h1><p>{finance ? "Final payroll, liability, approval and payment controls tied to the balanced payroll journal." : "Workforce, attendance, leave and payroll signals with governed source drill-down."}</p></div>
        <div><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>Report centre</button><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Refresh analytics", finance ? "Finance / Payroll Dashboard" : "HR Dashboard")}>Refresh</button></div>
      </header>
      <ReportingNotice />
      <FilterBar filters={filters} onChange={setFilters} onRun={() => onAction("Apply dashboard filters", `${filters.fromDate} to ${filters.toDate}`)} />
      <MetricGrid metrics={metrics} />
      <section className="nx-hr5-dashboard-grid">
        <BarAnalysis title={finance ? "Payroll by department" : "Department headcount"} subtitle={finance ? moneyNote : "Effective assignment as of the selected period."} series={series} onOpen={() => onNavigate("reports", finance ? "department-payroll-report" : "department-employees-report")} />
        <article className="nx-hr5-panel nx-hr5-panel--flow">
          <header><div><span>End-to-end control</span><h2>{finance ? "Payroll to bank" : "People to payroll"}</h2><p>Each stage opens its underlying transaction or exception queue.</p></div></header>
          <ol>
            {(finance ? [
              ["Closed payroll", "payroll-runs", "Finalized"], ["Balanced journal", "payroll-journal", payroll.journal?.balanced ? "Balanced" : "Blocked"], ["Finance approval", "payroll-validation", "Pending"], ["Payment batch", "payment-batch", "Pending"],
            ] : [
              ["Employee master", "employees", "Authoritative"], ["Attendance", "monthly-attendance", "Locked"], ["Leave", "leave-approval", "3 pending"], ["Payroll", "payroll-runs", "Finalized"],
            ]).map(([label, pageId, status], index) => <li key={pageId}><button type="button" onClick={() => onNavigate("hr", pageId)}><i>{index + 1}</i><span><b>{label}</b><small>{status}</small></span><em>Open ›</em></button></li>)}
          </ol>
        </article>
      </section>
      <section className="nx-hr5-panel nx-hr5-actions">
        <header><div><span>Management action</span><h2>{finance ? "Approvals and exceptions" : "People priorities"}</h2></div></header>
        <div>
          {(finance ? [
            ["Approve calculated payroll", "One open period awaits the controlled approval chain.", "payroll-validation"],
            ["Review salary payable", "Reconcile net payroll to the liability and payment batch.", "salary-payable-report"],
            ["Inspect tax payable", "Trace withheld tax to configured rule and GL account.", "tax-payable-report"],
          ] : [
            ["Resolve attendance exceptions", "Missing punches and corrections must clear before the next period lock.", "attendance-corrections"],
            ["Review pending leave", "Manager and HR queues are separated by approval stage.", "leave-pending-report"],
            ["Monitor expiring documents", "Restricted documents remain permission protected.", "document-expiry-report"],
          ]).map(([title, detail, pageId]) => <button key={pageId} type="button" onClick={() => onNavigate(pageId.endsWith("-report") ? "reports" : "hr", pageId)}><span><strong>{title}</strong><small>{detail}</small></span><em>Review ›</em></button>)}
        </div>
      </section>
    </div>
  );
}

function ReportCentre({ onNavigate }: Pick<HrReportingWorkspaceProps, "onNavigate">) {
  const [query, setQuery] = useState("");
  const [domain, setDomain] = useState("All");
  const domains = ["All", "HR", "Attendance", "Leave", "Payroll", "Payroll accounting"];
  const visible = hrReportDefinitions.filter((definition) => (domain === "All" || definition.domain === domain) && `${definition.title} ${definition.description}`.toLowerCase().includes(query.toLowerCase()));
  return (
    <div className="nx-hr5">
      <header className="nx-hr5-hero"><div><span className="nx-eyebrow">Phase 5 · governed analytics</span><h1>HR & Payroll Report Centre</h1><p>Forty-five source-linked reports covering people, attendance, leave, payroll and payroll accounting.</p></div><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate("hr", "hr-report-audit-log")}>Audit log</button></header>
      <ReportingNotice />
      <section className="nx-hr5-catalogue-tools"><label><span>Search reports</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee, attendance, tax, variance, payable..." /></label><nav aria-label="Report domains">{domains.map((item) => <button type="button" className={domain === item ? "is-active" : ""} aria-pressed={domain === item} key={item} onClick={() => setDomain(item)}>{item}</button>)}</nav></section>
      <section className="nx-hr5-report-grid" aria-label="HR report catalogue">
        {visible.map((definition) => <article key={definition.id}><header><span>{definition.domain}</span><i>{definition.sensitivity}</i></header><h2>{definition.title}</h2><p>{definition.description}</p><dl><div><dt>Source</dt><dd>{definition.source}</dd></div><div><dt>Execution</dt><dd>{definition.strategy}</dd></div></dl><button type="button" onClick={() => onNavigate("reports", definition.id)}>Open report <span>›</span></button></article>)}
      </section>
    </div>
  );
}

function ReportDetail({ context, onNavigate, onAction }: HrReportingWorkspaceProps) {
  const definition = reportDefinition(context.pageId)!;
  const actor = reportActorForRole(context.role);
  const [filters, setFilters] = useState(defaultReportFilters);
  const [audit, setAudit] = useState<ReportAuditEvent | null>(null);
  const [page, setPage] = useState(1);
  const issues = validateReportScope(actor, filters);
  const snapshot = useMemo(() => buildReportSnapshot(definition.id, filters), [definition.id, filters]);
  const permitted = canViewReport(actor, definition);
  const exportReport = (format: ExportFormat) => {
    const event = buildReportAuditEvent(actor, definition, filters, `Exported ${format}`);
    setAudit(event);
    onAction(event.outcome === "Allowed" ? `Export ${format}` : "Export denied", definition.title);
  };
  if (!permitted) return <div className="nx-hr5"><header className="nx-hr5-hero"><div><span className="nx-eyebrow">Restricted report</span><h1>{definition.title}</h1><p>Your selected role does not have {definition.permission}. The denied attempt remains auditable.</p></div><button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>Back to permitted reports</button></header><section className="nx-hr5-denied"><strong>Authorization required</strong><span>{definition.sensitivity} · {definition.permission}</span></section></div>;
  if (!snapshot) return null;
  const maxSeries = Math.max(...snapshot.series.map((row) => row.value), 1);
  return (
    <div className="nx-hr5">
      <header className="nx-hr5-hero"><div><button className="nx-hr5-back" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>‹ HR report centre</button><span className="nx-eyebrow">{definition.domain} · {definition.sensitivity}</span><h1>{definition.title}</h1><p>{definition.description}</p></div><div className="nx-hr5-export"><button type="button" disabled={!canExportReport(actor, definition, "PDF")} onClick={() => exportReport("PDF")}>PDF</button><button type="button" disabled={!canExportReport(actor, definition, "Excel")} onClick={() => exportReport("Excel")}>Excel</button><button type="button" disabled={!canExportReport(actor, definition, "CSV")} onClick={() => exportReport("CSV")}>CSV</button></div></header>
      <ReportingNotice />
      <FilterBar filters={filters} onChange={setFilters} onRun={() => { const event = buildReportAuditEvent(actor, definition, filters, "Generated"); setAudit(event); onAction("Run report", definition.title); }} />
      {issues.length ? <section className="nx-hr5-errors" role="alert">{issues.map((issue) => <span key={issue}>{issue}</span>)}</section> : null}
      {audit ? <section className={`nx-hr5-audit-receipt is-${audit.outcome.toLowerCase()}`}><strong>{audit.outcome}: {audit.action}</strong><span>Audit {audit.id} · {audit.actorName} · {audit.occurredAt}</span></section> : null}
      <MetricGrid metrics={snapshot.kpis} />
      <section className="nx-hr5-report-analysis">
        <article className="nx-hr5-panel nx-hr5-panel--chart"><header><div><span>Comparison</span><h2>{definition.title} analysis</h2><p>{snapshot.sourceState}</p></div><small>{snapshot.execution}</small></header><div className="nx-hr5-columns" role="img" aria-label={`${definition.title} chart`}>{snapshot.series.slice(0, 8).map((row) => <button type="button" key={row.label} onClick={() => onAction("Drill down", row.label)}><i style={{ height: `${Math.max(8, (row.value / maxSeries) * 100)}%` }} /><b>{row.value.toLocaleString("en-US")}</b><span>{row.label}</span></button>)}</div></article>
        <aside className="nx-hr5-panel nx-hr5-governance"><header><span>Report contract</span><h2>Source and controls</h2></header><dl><div><dt>Authoritative source</dt><dd>{definition.source}</dd></div><div><dt>Permission</dt><dd>{definition.permission}</dd></div><div><dt>Dimensions</dt><dd>{definition.dimensions.join(" · ")}</dd></div><div><dt>Drill path</dt><dd>Summary → detail → source transaction</dd></div><div><dt>Large report policy</dt><dd>{definition.strategy === "background export" ? `Queue above ${reportingPerformancePolicy.backgroundExportThreshold.toLocaleString()} rows` : `Page ${reportingPerformancePolicy.interactivePageSize} rows`}</dd></div></dl></aside>
      </section>
      <section className="nx-hr5-table">
        <header><div><span>Source detail</span><h2>Traceable report rows</h2></div><label><span className="nx-sr-only">Search results</span><input placeholder="Search within results..." /></label></header>
        <div><table><thead><tr>{snapshot.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{snapshot.rows.map((row) => <tr key={row.id} onClick={() => onNavigate(row.source.moduleId, row.source.pageId, row.source.recordRef)}>{row.cells.map((cell, index) => <td key={`${row.id}-${snapshot.columns[index]}`}>{index === 0 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(row.source.moduleId, row.source.pageId, row.source.recordRef); }}>{cell}</button> : cell}</td>)}</tr>)}</tbody></table></div>
        <footer><span>Showing {snapshot.rows.length} of {snapshot.totalRows} rows · Page size {snapshot.pageSize}</span><nav aria-label="Report pages"><button type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</button><b>{page}</b><button type="button" disabled={snapshot.totalRows <= snapshot.pageSize} onClick={() => setPage((value) => value + 1)}>Next</button></nav></footer>
      </section>
    </div>
  );
}

function ComplianceWorkspace({ context, onAction }: HrReportingWorkspaceProps) {
  if (context.pageId === "hr-compliance-configuration") return <div className="nx-hr5"><header className="nx-hr5-hero"><div><span className="nx-eyebrow">Effective-dated policy</span><h1>Compliance Configuration</h1><p>Tax, contribution, payroll and eligibility rules are versioned outside core payroll logic.</p></div><button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Add configuration", "Compliance configuration")}>+ New version</button></header><ReportingNotice /><section className="nx-hr5-table"><header><div><span>Approved configuration</span><h2>Jurisdiction and policy rules</h2></div></header><div><table><thead><tr><th>Type</th><th>Configuration</th><th>Jurisdiction</th><th>Effective from</th><th>Eligibility</th><th>Version</th><th>Status</th></tr></thead><tbody>{complianceConfigurations.map((row) => <tr key={row.id}><td>{row.kind}</td><td><button type="button" onClick={() => onAction("View configuration", row.id)}>{row.name}</button></td><td>{row.jurisdiction}</td><td>{row.effectiveFrom}</td><td>{row.employeeEligibility}</td><td>v{row.version}</td><td><span data-status="approved">{row.status}</span></td></tr>)}</tbody></table></div></section></div>;
  const actor = reportActorForRole(context.role);
  const sample = hrReportDefinitions.slice(0, 4).map((definition, index) => buildReportAuditEvent(actor, definition, defaultReportFilters, index % 2 ? "Exported Excel" : "Generated", `2026-09-21T0${8 + index}:15:00+05:00`));
  return <div className="nx-hr5"><header className="nx-hr5-hero"><div><span className="nx-eyebrow">Security & evidence</span><h1>{context.pageId === "hr-report-audit-log" ? "Report Audit Log" : "Secure Export Centre"}</h1><p>Every generated report and export records actor, filters, time, format and authorization outcome.</p></div><button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Review security policy", context.pageLabel)}>Security policy</button></header><ReportingNotice /><section className="nx-hr5-table"><header><div><span>{context.pageId === "hr-report-audit-log" ? "Immutable activity" : "Background processing"}</span><h2>{context.pageId === "hr-report-audit-log" ? "Recent report events" : "Export jobs"}</h2></div></header><div><table><thead><tr><th>Event</th><th>Report</th><th>Actor</th><th>Action</th><th>Company / branch</th><th>Date & time</th><th>Outcome</th></tr></thead><tbody>{sample.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.reportName}</td><td>{row.actorName}</td><td>{row.action}</td><td>{row.companyId} / {row.branchId}</td><td>{row.occurredAt}</td><td><span data-status={row.outcome.toLowerCase()}>{row.outcome}</span></td></tr>)}</tbody></table></div></section></div>;
}

export function HrReportingWorkspace(props: HrReportingWorkspaceProps) {
  if (props.context.pageId === "hr-dashboard") return <HrDashboard onNavigate={props.onNavigate} onAction={props.onAction} />;
  if (props.context.pageId === "finance-payroll-dashboard") return <HrDashboard finance onNavigate={props.onNavigate} onAction={props.onAction} />;
  if (props.context.pageId === "hr-report-centre") return <ReportCentre onNavigate={props.onNavigate} />;
  if (phase5ReportIds.includes(props.context.pageId)) return <ReportDetail {...props} />;
  return <ComplianceWorkspace {...props} />;
}

export function isHrReportingPage(pageId: string) {
  return ["hr-dashboard", "finance-payroll-dashboard", "hr-report-centre", "hr-compliance-configuration", "hr-report-audit-log", "hr-export-centre", ...phase5ReportIds].includes(pageId);
}
