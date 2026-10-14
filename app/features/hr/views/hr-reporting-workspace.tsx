"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { orgUnits } from "../model/hr-core-data";
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
} from "../model/hr-reporting-data";

interface HrReportingWorkspaceProps {
  context: { pageId: string; pageLabel: string; role: string; mode: string };
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}

const moneyNote = "Finalized Phase 3 payroll snapshot; mock-only prototype data.";
const reportTableClass = "min-w-0 border border-border bg-card shadow-xs [&>header]:flex [&>header]:items-center [&>header]:justify-between [&>header]:gap-4 [&>header]:border-b [&>header]:border-border [&>header]:px-3.5 [&>header]:py-3 [&>header_span]:text-[0.6875rem] [&>header_span]:font-bold [&>header_span]:uppercase [&>header_span]:tracking-[0.08em] [&>header_span]:text-primary [&>header_h2]:mb-0 [&>header_h2]:mt-0.5 [&>header_h2]:text-lg [&>header_h2]:font-semibold [&>header_label]:w-[min(19.375rem,35vw)] [&>div]:overflow-x-auto [&_table]:w-full [&_table]:border-collapse [&_table]:whitespace-nowrap [&_th]:h-9 [&_th]:border-b [&_th]:border-border [&_th]:bg-primary/10 [&_th]:px-2.5 [&_th]:text-left [&_th]:text-[0.6875rem] [&_th]:tracking-[0.02em] [&_th]:text-primary [&_td]:h-11 [&_td]:border-b [&_td]:border-border [&_td]:px-2.5 [&_tbody_tr:hover]:bg-muted [&_td_button]:font-semibold [&_td_button]:text-primary [&_td_span[data-status]]:inline-block [&_td_span[data-status]]:rounded-full [&_td_span[data-status]]:bg-success/10 [&_td_span[data-status]]:px-2 [&_td_span[data-status]]:py-0.5 [&_td_span[data-status]]:text-[0.6875rem] [&_td_span[data-status]]:font-bold [&_td_span[data-status]]:text-success [&>footer]:flex [&>footer]:items-center [&>footer]:justify-between [&>footer]:gap-3 [&>footer]:px-3 [&>footer]:py-2.5 [&>footer]:text-muted-foreground [&>footer_nav]:flex [&>footer_nav]:items-center [&>footer_nav]:gap-1 [&>footer_b]:min-w-7 [&>footer_b]:text-center [&>footer_b]:text-primary max-sm:[&>header]:flex-col max-sm:[&>header]:items-stretch max-sm:[&>header_label]:w-full max-sm:[&>footer]:flex-col max-sm:[&>footer]:items-stretch";

function ReportingNotice() {
  return (
    <section className="flex items-center gap-3 border-l-[3px] border-primary bg-primary/10 px-3.5 py-2.5 text-sm max-sm:flex-col max-sm:items-start" aria-label="Reporting data assurance">
      <strong className="shrink-0 text-primary">Governed prototype reporting</strong>
      <span className="text-muted-foreground">Reads approved masters, locked attendance and closed payroll snapshots. No Demo Account, posting service or bank data is changed.</span>
    </section>
  );
}

function MetricGrid({ metrics }: { metrics: readonly { label: string; value: string; note: string }[] }) {
  return (
    <section className="grid grid-cols-[repeat(auto-fit,minmax(10.3125rem,1fr))] gap-2.5" aria-label="Headline metrics">
      {metrics.map((metric) => (
        <article key={metric.label} className="min-h-27 border border-border border-t-[3px] border-t-secondary bg-card p-3.5 shadow-xs"><span className="block text-xs font-semibold text-muted-foreground">{metric.label}</span><strong className="my-1.5 block font-serif text-xl font-semibold leading-tight text-primary">{metric.value}</strong><small className="text-muted-foreground">{metric.note}</small></article>
      ))}
    </section>
  );
}

function BarAnalysis({ title, subtitle, series, onOpen }: { title: string; subtitle: string; series: readonly { label: string; value: number }[]; onOpen: (label: string) => void }) {
  const max = Math.max(...series.map((row) => row.value), 1);
  return (
    <article className="border border-border bg-card shadow-xs">
      <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5"><div><span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">Analytical view</span><h2 className="my-0.5 text-lg font-semibold">{title}</h2><p className="m-0 text-sm text-muted-foreground">{subtitle}</p></div><Button variant="ghost" size="sm" type="button" onClick={() => onOpen(title)}>View report</Button></header>
      <div className="grid gap-2.5 p-4" role="img" aria-label={title}>
        {series.map((row) => (
          <button className="grid gap-1.5 p-0 text-left text-foreground" type="button" key={row.label} onClick={() => onOpen(row.label)} aria-label={`${row.label}: ${row.value}`}>
            <span className="flex justify-between gap-3 text-sm"><b className="overflow-hidden text-ellipsis whitespace-nowrap">{row.label}</b><em className="not-italic text-muted-foreground">{row.value.toLocaleString("en-US")}</em></span>
            <i className="h-2 overflow-hidden rounded-sm bg-muted not-italic"><b className="block h-full bg-primary" style={{ width: `${Math.max(4, (row.value / max) * 100)}%` }} /></i>
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
    <section className="grid grid-cols-[1.25fr_1.1fr_1.1fr_.85fr_.85fr_.8fr_auto] items-end gap-2.5 border border-border bg-card p-3.5 shadow-xs max-xl:grid-cols-3 max-sm:grid-cols-1" aria-label="Report filters">
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">Company</span><select className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm text-foreground" value={filters.companyId} onChange={(event) => onChange({ ...filters, companyId: event.target.value })}><option value="ORG-CO-001">Nexora Services (Private) Limited</option></select></label>
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">Branch</span><select className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm text-foreground" value={filters.branchId} onChange={(event) => onChange({ ...filters, branchId: event.target.value, departmentId: "all" })}><option value="all">All authorized branches</option>{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">Department</span><select className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm text-foreground" value={filters.departmentId} onChange={(event) => onChange({ ...filters, departmentId: event.target.value })}><option value="all">All departments</option>{departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}</select></label>
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">From</span><Input type="date" value={filters.fromDate} onChange={(event) => onChange({ ...filters, fromDate: event.target.value })} /></label>
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">To</span><Input type="date" value={filters.toDate} onChange={(event) => onChange({ ...filters, toDate: event.target.value })} /></label>
      <label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">Status</span><select className="h-9 w-full rounded border border-input bg-background px-2.5 text-sm text-foreground" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value })}><option value="all">All statuses</option><option>Active</option><option>Approved</option><option>Pending</option><option>Exception</option></select></label>
      <Button type="button" onClick={onRun}>Run</Button>
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
    <div className="grid gap-4 text-foreground max-sm:gap-3">
      <header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><span className="nx-eyebrow">{finance ? "Finance / payroll control" : "People analytics"}</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">{finance ? "Finance & Payroll Dashboard" : "HR Dashboard"}</h1><p className="m-0 text-muted-foreground">{finance ? "Final payroll, liability, approval and payment controls tied to the balanced payroll journal." : "Workforce, attendance, leave and payroll signals with governed source drill-down."}</p></div>
        <div className="flex shrink-0 gap-2"><Button variant="outline" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>Report centre</Button><Button type="button" onClick={() => onAction("Refresh analytics", finance ? "Finance / Payroll Dashboard" : "HR Dashboard")}>Refresh</Button></div>
      </header>
      <ReportingNotice />
      <FilterBar filters={filters} onChange={setFilters} onRun={() => onAction("Apply dashboard filters", `${filters.fromDate} to ${filters.toDate}`)} />
      <MetricGrid metrics={metrics} />
      <section className="grid grid-cols-[minmax(0,1.65fr)_minmax(18.75rem,.85fr)] gap-3.5 max-md:grid-cols-1">
        <BarAnalysis title={finance ? "Payroll by department" : "Department headcount"} subtitle={finance ? moneyNote : "Effective assignment as of the selected period."} series={series} onOpen={() => onNavigate("reports", finance ? "department-payroll-report" : "department-employees-report")} />
        <article className="border border-border bg-card shadow-xs">
          <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5"><div><span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">End-to-end control</span><h2 className="my-0.5 text-lg font-semibold">{finance ? "Payroll to bank" : "People to payroll"}</h2><p className="m-0 text-sm text-muted-foreground">Each stage opens its underlying transaction or exception queue.</p></div></header>
          <ol className="m-0 grid list-none px-4 pb-3.5 pt-2 [&_li:not(:last-child)]:border-b [&_li:not(:last-child)]:border-border [&_button]:grid [&_button]:w-full [&_button]:grid-cols-[1.75rem_1fr_auto] [&_button]:items-center [&_button]:gap-2.5 [&_button]:py-2.5 [&_button]:text-left [&_button]:text-foreground [&_button_i]:grid [&_button_i]:size-6 [&_button_i]:place-items-center [&_button_i]:rounded-full [&_button_i]:bg-primary/10 [&_button_i]:text-sm [&_button_i]:font-bold [&_button_i]:not-italic [&_button_i]:text-primary [&_button_span]:grid [&_button_small]:text-success [&_button_em]:not-italic [&_button_em]:text-primary">
            {(finance ? [
              ["Closed payroll", "payroll-runs", "Finalized"], ["Balanced journal", "payroll-journal", payroll.journal?.balanced ? "Balanced" : "Blocked"], ["Finance approval", "payroll-validation", "Pending"], ["Payment batch", "payment-batch", "Pending"],
            ] : [
              ["Employee master", "employees", "Authoritative"], ["Attendance", "monthly-attendance", "Locked"], ["Leave", "leave-approval", "3 pending"], ["Payroll", "payroll-runs", "Finalized"],
            ]).map(([label, pageId, status], index) => <li key={pageId}><button type="button" onClick={() => onNavigate("hr", pageId)}><i>{index + 1}</i><span><b>{label}</b><small>{status}</small></span><em>Open ›</em></button></li>)}
          </ol>
        </article>
      </section>
      <section className="border border-border bg-card shadow-xs">
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5"><div><span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">Management action</span><h2 className="my-0.5 text-lg font-semibold">{finance ? "Approvals and exceptions" : "People priorities"}</h2></div></header>
        <div className="grid grid-cols-3 max-md:grid-cols-1 [&_button]:flex [&_button]:min-h-23 [&_button]:items-center [&_button]:justify-between [&_button]:gap-4 [&_button]:border-r [&_button]:border-border [&_button]:px-4 [&_button]:py-3.5 [&_button]:text-left [&_button]:text-foreground [&_button:hover]:bg-muted [&_button:last-child]:border-r-0 [&_button_span]:grid [&_button_span]:gap-1 [&_button_small]:text-muted-foreground [&_button_em]:shrink-0 [&_button_em]:not-italic [&_button_em]:text-primary max-md:[&_button]:border-b max-md:[&_button]:border-r-0 max-md:[&_button:last-child]:border-b-0">
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
    <div className="grid gap-4 text-foreground max-sm:gap-3">
      <header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><span className="nx-eyebrow">Phase 5 · governed analytics</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">HR & Payroll Report Centre</h1><p className="m-0 text-muted-foreground">Forty-five source-linked reports covering people, attendance, leave, payroll and payroll accounting.</p></div><Button variant="outline" type="button" onClick={() => onNavigate("hr", "hr-report-audit-log")}>Audit log</Button></header>
      <ReportingNotice />
      <section className="grid grid-cols-[minmax(18.75rem,1fr)_2fr] items-end gap-4 border border-border bg-card p-3.5 max-md:grid-cols-1"><label className="grid min-w-0 gap-1.5"><span className="text-xs font-semibold text-muted-foreground">Search reports</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Employee, attendance, tax, variance, payable..." /></label><nav className="flex flex-wrap gap-1.5" aria-label="Report domains">{domains.map((item) => <Button variant="outline" size="sm" type="button" className={domain === item ? "border-secondary bg-secondary text-secondary-foreground hover:bg-secondary/90 hover:text-secondary-foreground" : "text-muted-foreground"} aria-pressed={domain === item} key={item} onClick={() => setDomain(item)}>{item}</Button>)}</nav></section>
      <section className="grid grid-cols-3 gap-3 max-xl:grid-cols-2 max-sm:grid-cols-1 [&>article]:flex [&>article]:min-h-64 [&>article]:flex-col [&>article]:border [&>article]:border-border [&>article]:border-t-[3px] [&>article]:border-t-secondary [&>article]:bg-card [&>article]:p-4 [&>article>header]:flex [&>article>header]:justify-between [&>article>header]:gap-2 [&>article>header>span]:font-bold [&>article>header>span]:text-primary [&>article>header>i]:text-xs [&>article>header>i]:not-italic [&>article>header>i]:text-muted-foreground [&>article>h2]:mb-1 [&>article>h2]:mt-2.5 [&>article>h2]:text-lg [&>article>h2]:font-semibold [&>article>p]:mb-3 [&>article>p]:mt-0 [&>article>p]:text-muted-foreground [&>article>dl]:my-auto [&>article>dl]:grid [&>article>dl]:gap-1.5 [&>article>dl]:text-sm [&>article>dl_div]:grid [&>article>dl_div]:grid-cols-[4.5rem_1fr] [&>article>dl_div]:gap-2 [&>article>dt]:text-muted-foreground [&>article>dd]:m-0 [&>article>button]:flex [&>article>button]:min-h-9 [&>article>button]:items-center [&>article>button]:justify-between [&>article>button]:border [&>article>button]:border-secondary [&>article>button]:bg-primary [&>article>button]:px-2.5 [&>article>button]:text-left [&>article>button]:text-primary-foreground" aria-label="HR report catalogue">
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
  if (!permitted) return <div className="grid gap-4 text-foreground max-sm:gap-3"><header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><span className="nx-eyebrow">Restricted report</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">{definition.title}</h1><p className="m-0 text-muted-foreground">Your selected role does not have {definition.permission}. The denied attempt remains auditable.</p></div><Button variant="outline" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>Back to permitted reports</Button></header><section className="grid min-h-42 content-center justify-items-center border border-border border-t-[3px] border-t-destructive bg-card p-4 text-destructive"><strong>Authorization required</strong><span>{definition.sensitivity} · {definition.permission}</span></section></div>;
  if (!snapshot) return null;
  const maxSeries = Math.max(...snapshot.series.map((row) => row.value), 1);
  return (
    <div className="grid gap-4 text-foreground max-sm:gap-3">
      <header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><Button variant="ghost" size="sm" className="mb-1.5 block px-0 text-primary hover:bg-transparent hover:text-primary" type="button" onClick={() => onNavigate("hr", "hr-report-centre")}>‹ HR report centre</Button><span className="nx-eyebrow">{definition.domain} · {definition.sensitivity}</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">{definition.title}</h1><p className="m-0 text-muted-foreground">{definition.description}</p></div><div className="flex gap-1.5 max-sm:grid max-sm:grid-cols-3"><Button variant="outline" size="sm" type="button" disabled={!canExportReport(actor, definition, "PDF")} onClick={() => exportReport("PDF")}>PDF</Button><Button variant="outline" size="sm" type="button" disabled={!canExportReport(actor, definition, "Excel")} onClick={() => exportReport("Excel")}>Excel</Button><Button variant="outline" size="sm" type="button" disabled={!canExportReport(actor, definition, "CSV")} onClick={() => exportReport("CSV")}>CSV</Button></div></header>
      <ReportingNotice />
      <FilterBar filters={filters} onChange={setFilters} onRun={() => { const event = buildReportAuditEvent(actor, definition, filters, "Generated"); setAudit(event); onAction("Run report", definition.title); }} />
      {issues.length ? <section className="grid gap-1 border-l-[3px] border-destructive bg-destructive/10 px-3.5 py-3 text-destructive" role="alert">{issues.map((issue) => <span key={issue}>{issue}</span>)}</section> : null}
      {audit ? <section className={`grid gap-1 border-l-[3px] px-3.5 py-3 ${audit.outcome === "Allowed" ? "border-success bg-success/10 text-success" : "border-destructive bg-destructive/10 text-destructive"}`}><strong>{audit.outcome}: {audit.action}</strong><span>Audit {audit.id} · {audit.actorName} · {audit.occurredAt}</span></section> : null}
      <MetricGrid metrics={snapshot.kpis} />
      <section className="grid grid-cols-[minmax(0,1.65fr)_minmax(18.75rem,.85fr)] gap-3.5 max-md:grid-cols-1">
        <article className="border border-border bg-card shadow-xs"><header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5"><div><span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">Comparison</span><h2 className="my-0.5 text-lg font-semibold">{definition.title} analysis</h2><p className="m-0 text-sm text-muted-foreground">{snapshot.sourceState}</p></div><small className="text-muted-foreground">{snapshot.execution}</small></header><div className="flex h-67.5 items-end gap-2.5 overflow-x-auto px-[1.125rem] pb-3.5 pt-6" role="img" aria-label={`${definition.title} chart`}>{snapshot.series.slice(0, 8).map((row) => <button className="flex h-full min-w-14 flex-[1_0_3.5rem] flex-col items-center justify-end gap-1 p-0 text-foreground" type="button" key={row.label} onClick={() => onAction("Drill down", row.label)}><i className="w-[min(2.625rem,70%)] border border-secondary bg-primary not-italic" style={{ height: `${Math.max(8, (row.value / maxSeries) * 100)}%` }} /><b className="text-sm">{row.value.toLocaleString("en-US")}</b><span className="max-w-24 text-center text-[0.6875rem] text-muted-foreground">{row.label}</span></button>)}</div></article>
        <aside className="border border-border bg-card shadow-xs"><header className="border-b border-border px-4 py-3.5"><span className="text-[0.6875rem] font-bold uppercase tracking-[0.08em] text-primary">Report contract</span><h2 className="my-0.5 text-lg font-semibold">Source and controls</h2></header><dl className="m-0 grid px-4 pb-3.5 pt-1.5"><div className="border-b border-border py-2"><dt className="text-sm text-muted-foreground">Authoritative source</dt><dd className="mt-0.5 font-semibold">{definition.source}</dd></div><div className="border-b border-border py-2"><dt className="text-sm text-muted-foreground">Permission</dt><dd className="mt-0.5 font-semibold">{definition.permission}</dd></div><div className="border-b border-border py-2"><dt className="text-sm text-muted-foreground">Dimensions</dt><dd className="mt-0.5 font-semibold">{definition.dimensions.join(" · ")}</dd></div><div className="border-b border-border py-2"><dt className="text-sm text-muted-foreground">Drill path</dt><dd className="mt-0.5 font-semibold">Summary → detail → source transaction</dd></div><div className="py-2"><dt className="text-sm text-muted-foreground">Large report policy</dt><dd className="mt-0.5 font-semibold">{definition.strategy === "background export" ? `Queue above ${reportingPerformancePolicy.backgroundExportThreshold.toLocaleString()} rows` : `Page ${reportingPerformancePolicy.interactivePageSize} rows`}</dd></div></dl></aside>
      </section>
      <section className={reportTableClass}>
        <header><div><span>Source detail</span><h2>Traceable report rows</h2></div><label><span className="nx-sr-only">Search results</span><Input placeholder="Search within results..." /></label></header>
        <div><table><thead><tr>{snapshot.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{snapshot.rows.map((row) => <tr key={row.id} onClick={() => onNavigate(row.source.moduleId, row.source.pageId, row.source.recordRef)}>{row.cells.map((cell, index) => <td key={`${row.id}-${snapshot.columns[index]}`}>{index === 0 ? <button type="button" onClick={(event) => { event.stopPropagation(); onNavigate(row.source.moduleId, row.source.pageId, row.source.recordRef); }}>{cell}</button> : cell}</td>)}</tr>)}</tbody></table></div>
        <footer><span>Showing {snapshot.rows.length} of {snapshot.totalRows} rows · Page size {snapshot.pageSize}</span><nav aria-label="Report pages"><Button variant="outline" size="sm" type="button" disabled={page === 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Previous</Button><b>{page}</b><Button variant="outline" size="sm" type="button" disabled={snapshot.totalRows <= snapshot.pageSize} onClick={() => setPage((value) => value + 1)}>Next</Button></nav></footer>
      </section>
    </div>
  );
}

function ComplianceWorkspace({ context, onAction }: HrReportingWorkspaceProps) {
  if (context.pageId === "hr-compliance-configuration") return <div className="grid gap-4 text-foreground max-sm:gap-3"><header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><span className="nx-eyebrow">Effective-dated policy</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">Compliance Configuration</h1><p className="m-0 text-muted-foreground">Tax, contribution, payroll and eligibility rules are versioned outside core payroll logic.</p></div><Button type="button" onClick={() => onAction("Add configuration", "Compliance configuration")}>+ New version</Button></header><ReportingNotice /><section className={reportTableClass}><header><div><span>Approved configuration</span><h2>Jurisdiction and policy rules</h2></div></header><div><table><thead><tr><th>Type</th><th>Configuration</th><th>Jurisdiction</th><th>Effective from</th><th>Eligibility</th><th>Version</th><th>Status</th></tr></thead><tbody>{complianceConfigurations.map((row) => <tr key={row.id}><td>{row.kind}</td><td><button type="button" onClick={() => onAction("View configuration", row.id)}>{row.name}</button></td><td>{row.jurisdiction}</td><td>{row.effectiveFrom}</td><td>{row.employeeEligibility}</td><td>v{row.version}</td><td><span data-status="approved">{row.status}</span></td></tr>)}</tbody></table></div></section></div>;
  const actor = reportActorForRole(context.role);
  const sample = hrReportDefinitions.slice(0, 4).map((definition, index) => buildReportAuditEvent(actor, definition, defaultReportFilters, index % 2 ? "Exported Excel" : "Generated", `2026-09-21T0${8 + index}:15:00+05:00`));
  return <div className="grid gap-4 text-foreground max-sm:gap-3"><header className="flex items-end justify-between gap-6 border-b border-border pb-3.5 max-md:flex-col max-md:items-stretch"><div className="max-w-220"><span className="nx-eyebrow">Security & evidence</span><h1 className="my-1 font-serif text-3xl font-semibold leading-tight text-foreground">{context.pageId === "hr-report-audit-log" ? "Report Audit Log" : "Secure Export Centre"}</h1><p className="m-0 text-muted-foreground">Every generated report and export records actor, filters, time, format and authorization outcome.</p></div><Button variant="outline" type="button" onClick={() => onAction("Review security policy", context.pageLabel)}>Security policy</Button></header><ReportingNotice /><section className={reportTableClass}><header><div><span>{context.pageId === "hr-report-audit-log" ? "Immutable activity" : "Background processing"}</span><h2>{context.pageId === "hr-report-audit-log" ? "Recent report events" : "Export jobs"}</h2></div></header><div><table><thead><tr><th>Event</th><th>Report</th><th>Actor</th><th>Action</th><th>Company / branch</th><th>Date & time</th><th>Outcome</th></tr></thead><tbody>{sample.map((row) => <tr key={row.id}><td>{row.id}</td><td>{row.reportName}</td><td>{row.actorName}</td><td>{row.action}</td><td>{row.companyId} / {row.branchId}</td><td>{row.occurredAt}</td><td><span data-status={row.outcome.toLowerCase()}>{row.outcome}</span></td></tr>)}</tbody></table></div></section></div>;
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
