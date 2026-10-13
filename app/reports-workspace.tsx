"use client";

import { useMemo, useState } from "react";
import { prototypeModules } from "./prototype-data";
import { ReportingPeriodControls, reportingAxisLabels, reportingPeriodLabels, type ReportingPeriodKey, type ReportingViewBy } from "./reporting-period-controls";

interface ReportsWorkspaceProps {
  context: {
    pageId: string;
    pageLabel: string;
    role: string;
    mode: string;
  };
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}

const reportModule = prototypeModules.find((module) => module.id === "reports");
const reportGroups = reportModule?.groups.filter((group) => !["reporting", "distribution"].includes(group.id)) ?? [];
const reportEntries = reportGroups.flatMap((group) => group.pages.map((page) => ({ group, page })));

const domainCopy: Readonly<Record<string, { description: string; metrics: readonly [string, string, string, string] }>> = {
  "sales-reports": { description: "Revenue, orders, invoices, returns, margins and customer performance.", metrics: ["$1.84M invoiced", "$1.46M collected", "$378K outstanding", "7.8% margin variance"] },
  "customer-reports": { description: "Statements, ageing, advances, credit exposure and receipt allocation.", metrics: ["$378K outstanding", "$42K overdue", "$86K advances", "38 debtor days"] },
  "purchase-reports": { description: "Requisitions through payment, including price and matching exceptions.", metrics: ["$916K ordered", "$742K received", "$64K unmatched", "4.6 days lead variance"] },
  "supplier-reports": { description: "Statements, liabilities, advances and supplier delivery performance.", metrics: ["$294K payable", "$71K due this week", "$38K advances", "94.2% on-time"] },
  "inventory-reports": { description: "Balances, valuation, movement, ageing, shortages and count variance.", metrics: ["$2.36M stock value", "$184K slow moving", "23 reorder alerts", "98.7% count accuracy"] },
  "finance-reports": { description: "Ledgers, statements, journals, budgets, ratios and accounting controls.", metrics: ["$4.72M assets", "$1.18M liabilities", "$612K net profit", "99.4% posted"] },
  "manufacturing-reports": { description: "Output, WIP, consumption, efficiency, scrap and production variance.", metrics: ["92.4% attainment", "$486K WIP", "3.1% scrap", "87.6% utilisation"] },
  "hr-reports": { description: "Headcount, attendance, payroll, retention and recruitment intelligence.", metrics: ["428 employees", "96.8% attendance", "$742K payroll", "8.4% turnover"] },
};

const categoryCodes: Readonly<Record<string, string>> = {
  "executive-reports": "EX", "banking-reports": "BK", "sales-reports": "SL",
  "revenue-reports": "RV", "customer-reports": "CR", "purchase-reports": "PU",
  "supplier-reports": "SP", "inventory-reports": "IN", "costing-reports": "CO",
  "finance-reports": "FN", "tax-reports": "TX", "operations-reports": "OP",
  "manufacturing-reports": "MF", "quality-reports": "QA", "crm-reports": "CM",
  "project-reports": "PJ", "resource-reports": "RS", "support-reports": "SU",
  "hr-reports": "HR", "asset-reports": "FA", "expense-reports": "EP",
  "document-reports": "DC", "budget-reports": "BD", "consolidation-reports": "CN",
};

function groupDescription(groupId: string, label: string) {
  return domainCopy[groupId]?.description ?? `${label.replace(" Reports", "")} controls, activity, exceptions and performance analysis.`;
}

function groupMetrics(groupId: string) {
  return domainCopy[groupId]?.metrics ?? ["1,284 records", "96.4% on target", "18 exceptions", "31 Aug refreshed"] as const;
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- retained as a rollback reference during prototype review.
function LegacyCatalogue({ context, onNavigate, onAction }: ReportsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [favouritesOnly, setFavouritesOnly] = useState(false);
  const [favourites, setFavourites] = useState<Set<string>>(new Set(["sales-reports", "finance-reports", "inventory-reports"]));
  const visibleGroups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return reportGroups.filter((group) => {
      const searchText = [group.label, ...group.pages.map((page) => page.label)].join(" ").toLowerCase();
      return (!needle || searchText.includes(needle)) && (!favouritesOnly || favourites.has(group.id));
    });
  }, [favourites, favouritesOnly, query]);

  const toggleFavourite = (groupId: string) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      return next;
    });
  };

  return (
    <div className="nx-report-centre">
      <header className="nx-report-centre__hero">
        <div>
          <span className="nx-eyebrow">Reports &amp; Analytics</span>
          <h1>{context.pageId === "analytics-dashboard" ? "Enterprise reporting centre" : "Report catalogue"}</h1>
          <p>One governed library for operational, financial and management reporting across every Nexora module.</p>
        </div>
        <div className="nx-report-centre__hero-actions">
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate("reports", "report-schedules")}>Schedules</button>
          <button className="nx-button nx-button-primary" type="button" onClick={() => onNavigate("reports", "report-runner")}>Build report</button>
        </div>
      </header>

      <section className="nx-report-centre__assurance" aria-label="Prototype notice">
        <span>MOCK REVIEW</span>
        <p>Figures are presentation fixtures. Every report demonstrates filtering and source drill-down without reading Demo Account data.</p>
      </section>

      <section className="nx-report-centre__summary" aria-label="Report library summary">
        <article><span>Module collections</span><strong>{reportGroups.length}</strong><small>all Nexora areas</small></article>
        <article><span>Detailed reports</span><strong>{reportGroups.reduce((total, group) => total + group.pages.length, 0)}</strong><small>purpose-built views</small></article>
        <article><span>Scheduled outputs</span><strong>12</strong><small>mock subscriptions</small></article>
        <article><span>Data quality</span><strong>98.6%</strong><small>fixture freshness</small></article>
      </section>

      <section className="nx-report-centre__toolbar" aria-label="Report catalogue filters">
        <label className="nx-report-centre__search">
          <span>Search reports</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice, customer statement, ageing, variance..." />
        </label>
        <label><span>Company</span><select><option>All companies</option><option>Nexora Services</option><option>Nexora Manufacturing</option></select></label>
        <label><span>Access</span><select><option>My permitted reports</option><option>Shared with me</option><option>Created by me</option></select></label>
        <button className={`nx-report-centre__favourite-toggle${favouritesOnly ? " is-active" : ""}`} type="button" aria-pressed={favouritesOnly} onClick={() => setFavouritesOnly((value) => !value)}>★ Favourites</button>
      </section>

      <div className="nx-report-centre__section-head">
        <div><span>Module library</span><h2>{favouritesOnly ? "Favourite report groups" : "Reports by module"}</h2></div>
        <small>{visibleGroups.length} collections shown</small>
      </div>

      {visibleGroups.length ? (
        <section className="nx-report-library" aria-label="Reports by module">
          {visibleGroups.map((group) => (
            <article className="nx-report-library__card" key={group.id}>
              <div className="nx-report-library__card-head">
                <span className="nx-report-library__monogram">{group.label.split(" ")[0].slice(0, 2).toUpperCase()}</span>
                <button type="button" aria-label={`${favourites.has(group.id) ? "Remove" : "Add"} ${group.label} favourite`} aria-pressed={favourites.has(group.id)} onClick={() => toggleFavourite(group.id)}>{favourites.has(group.id) ? "★" : "☆"}</button>
              </div>
              <h3>{group.label}</h3>
              <p>{groupDescription(group.id, group.label)}</p>
              <ul>{group.pages.slice(0, 4).map((page) => <li key={page.id}><button type="button" onClick={() => onNavigate("reports", page.id)}>{page.label}<span>›</span></button></li>)}</ul>
              <footer>
                <button type="button" onClick={() => onNavigate("reports", group.pages[0].id)}>Open collection</button>
                <span>{group.pages.length} reports</span>
              </footer>
            </article>
          ))}
        </section>
      ) : (
        <section className="nx-report-centre__empty"><strong>No reports match this view</strong><p>Clear the search or show all report collections.</p><button className="nx-button nx-button-secondary" type="button" onClick={() => { setQuery(""); setFavouritesOnly(false); }}>Reset filters</button></section>
      )}

      <section className="nx-report-centre__recent">
        <div className="nx-report-centre__section-head"><div><span>Recent activity</span><h2>Continue reporting work</h2></div><button type="button" onClick={() => onAction("View activity", "Report activity")}>View activity</button></div>
        <div className="nx-report-centre__recent-grid">
          {["Invoice Details Report", "Customer Statement", "Inventory Valuation", "Budget vs Actual"].map((label, index) => <button type="button" key={label} onClick={() => onAction("Open report", label)}><span>{label}</span><small>{index === 0 ? "Run 18 minutes ago" : `Run ${index + 1} days ago`}</small><b>Open ›</b></button>)}
        </div>
      </section>
    </div>
  );
}

function Catalogue({ context, onNavigate, onAction }: ReportsWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [selectedGroupId, setSelectedGroupId] = useState("favourites");
  const [favourites, setFavourites] = useState<Set<string>>(new Set([
    "sales-invoice-detail-report", "customer-statement-report", "inventory-valuation-report", "trial-balance-report",
  ]));
  const selectedGroup = reportGroups.find((group) => group.id === selectedGroupId);
  const visibleReports = (() => {
    const needle = query.trim().toLowerCase();
    if (needle) return reportEntries.filter(({ group, page }) => `${group.label} ${page.label}`.toLowerCase().includes(needle));
    if (selectedGroupId === "favourites") return reportEntries.filter(({ page }) => favourites.has(page.id));
    return reportEntries.filter(({ group }) => group.id === selectedGroupId);
  })();

  const toggleFavourite = (pageId: string) => {
    setFavourites((current) => {
      const next = new Set(current);
      if (next.has(pageId)) next.delete(pageId); else next.add(pageId);
      return next;
    });
  };

  const activeTitle = query.trim()
    ? `Search results for "${query.trim()}"`
    : selectedGroupId === "favourites" ? "Favourite reports" : selectedGroup?.label ?? "Reports";
  const activeDescription = query.trim()
    ? "Matching reports from every permitted Nexora module."
    : selectedGroupId === "favourites"
      ? "Your frequently used reports, ready to open from one place."
      : groupDescription(selectedGroup?.id ?? "", selectedGroup?.label ?? "Reporting");

  return (
    <div className="nx-report-centre">
      <header className="nx-report-centre__hero">
        <div>
          <span className="nx-eyebrow">Reports &amp; Analytics</span>
          <h1>{context.pageId === "analytics-dashboard" ? "Enterprise reporting centre" : "Report catalogue"}</h1>
          <p>Choose a module category or search the complete library, then open the required report in one click.</p>
        </div>
        <div className="nx-report-centre__hero-actions">
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onNavigate("reports", "report-schedules")}>Schedules</button>
          <button className="nx-button nx-button-primary" type="button" onClick={() => onNavigate("reports", "report-runner")}>Build report</button>
        </div>
      </header>

      <section className="nx-report-centre__assurance" aria-label="Prototype notice">
        <span>MOCK REVIEW</span>
        <p>Figures are presentation fixtures. Reports demonstrate filters and source drill-down without reading Demo Account data.</p>
      </section>

      <section className="nx-report-centre__toolbar nx-report-centre__toolbar--browser" aria-label="Report catalogue filters">
        <label className="nx-report-centre__search">
          <span>Search any report</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Invoice, statement, ageing, tax, variance..." />
        </label>
        <label><span>Company</span><select><option>All companies</option><option>Nexora Services</option><option>Nexora Manufacturing</option></select></label>
        <label><span>Access</span><select><option>My permitted reports</option><option>Shared with me</option><option>Created by me</option></select></label>
        <button className={`nx-report-centre__favourite-toggle${selectedGroupId === "favourites" && !query ? " is-active" : ""}`} type="button" onClick={() => { setQuery(""); setSelectedGroupId("favourites"); }}>{"\u2605"} Favourites</button>
      </section>

      <section className="nx-report-browser" aria-label="Report library">
        <aside className="nx-report-browser__categories">
          <header><span>Report categories</span><small>{reportGroups.length} module collections</small></header>
          <nav aria-label="Report categories">
            <button className={selectedGroupId === "favourites" && !query ? "is-active" : ""} type="button" onClick={() => { setQuery(""); setSelectedGroupId("favourites"); }}>
              <i aria-hidden="true">{"\u2605"}</i><span>Favourites</span><b>{favourites.size}</b>
            </button>
            {reportGroups.map((group) => (
              <button className={selectedGroupId === group.id && !query ? "is-active" : ""} type="button" key={group.id} onClick={() => { setQuery(""); setSelectedGroupId(group.id); }}>
                <i aria-hidden="true">{categoryCodes[group.id] ?? group.label.slice(0, 2).toUpperCase()}</i>
                <span>{group.label.replace(" Reports", "")}</span>
                <b>{group.pages.length}</b><em aria-hidden="true">{"\u203a"}</em>
              </button>
            ))}
          </nav>
        </aside>

        <main className="nx-report-browser__results">
          <header>
            <div><span>{query ? "Library search" : "Selected collection"}</span><h2>{activeTitle}</h2><p>{activeDescription}</p></div>
            <small>{visibleReports.length} report{visibleReports.length === 1 ? "" : "s"}</small>
          </header>
          {visibleReports.length ? (
            <div className="nx-report-browser__list">
              {visibleReports.map(({ group, page }) => (
                <article key={page.id}>
                  <button className="nx-report-browser__open" type="button" onClick={() => onNavigate("reports", page.id)}>
                    <i aria-hidden="true">{categoryCodes[group.id] ?? "RP"}</i>
                    <span><strong>{page.label}</strong><small>{group.label} | Interactive filters and source drill-down</small></span>
                    <em>Open report {"\u203a"}</em>
                  </button>
                  <button className="nx-report-browser__star" type="button" aria-label={`${favourites.has(page.id) ? "Remove" : "Add"} ${page.label} favourite`} aria-pressed={favourites.has(page.id)} onClick={() => toggleFavourite(page.id)}>{favourites.has(page.id) ? "\u2605" : "\u2606"}</button>
                </article>
              ))}
            </div>
          ) : (
            <section className="nx-report-centre__empty"><strong>No reports match this search</strong><p>Try a report name, transaction type, customer, tax or accounting keyword.</p><button className="nx-button nx-button-secondary" type="button" onClick={() => setQuery("")}>Clear search</button></section>
          )}
        </main>
      </section>

      <section className="nx-report-centre__recent">
        <div className="nx-report-centre__section-head"><div><span>Recent activity</span><h2>Continue reporting work</h2></div><button type="button" onClick={() => onAction("View activity", "Report activity")}>View activity</button></div>
        <div className="nx-report-centre__recent-grid">
          {["Invoice Details Report", "Customer Statement", "Inventory Valuation", "Budget vs Actual"].map((label, index) => <button type="button" key={label} onClick={() => onAction("Open report", label)}><span>{label}</span><small>{index === 0 ? "Run 18 minutes ago" : `Run ${index + 1} days ago`}</small><b>Open {"\u203a"}</b></button>)}
        </div>
      </section>
    </div>
  );
}

function ReportDetail({ context, onNavigate, onAction }: ReportsWorkspaceProps) {
  const [period, setPeriod] = useState<ReportingPeriodKey>("year-to-date");
  const [viewBy, setViewBy] = useState<ReportingViewBy>("month");
  const [balanceForward, setBalanceForward] = useState(true);
  const [compare, setCompare] = useState("Prior year");
  const [filtersOpen, setFiltersOpen] = useState(true);
  const group = reportGroups.find((candidate) => candidate.pages.some((page) => page.id === context.pageId));
  const metrics = groupMetrics(group?.id ?? "");
  const periodLabel = reportingPeriodLabels[period];
  const rows = [
    ["31 Aug 2026", "INV-2026-1842", "Apex Retail Group", "Enterprise licence and support", "$86,400", "$18,400", "Approved"],
    ["29 Aug 2026", "INV-2026-1834", "Northstar Foods", "Implementation milestone 3", "$64,850", "$64,850", "Outstanding"],
    ["26 Aug 2026", "INV-2026-1819", "Vertex Manufacturing", "Automation components", "$48,920", "$12,920", "Part paid"],
    ["22 Aug 2026", "INV-2026-1808", "Crescent Logistics", "Managed services — August", "$37,600", "$37,600", "Outstanding"],
    ["18 Aug 2026", "INV-2026-1786", "Harbour Healthcare", "Platform subscription", "$29,450", "$0", "Paid"],
    ["12 Aug 2026", "INV-2026-1752", "Meridian Textiles", "Equipment commissioning", "$24,780", "$8,780", "Part paid"],
  ] as const;
  const chartLabels = reportingAxisLabels(period, viewBy);
  const chartHeights = [62,70,58,76,81,73,88,92,84,96,90,100].slice(0, chartLabels.length);

  return (
    <div className="nx-report-workspace">
      <header className="nx-report-workspace__header">
        <div>
          <button className="nx-report-workspace__back" type="button" onClick={() => onNavigate("reports", "report-catalogue")}>‹ Report catalogue</button>
          <span className="nx-eyebrow">{group?.label ?? "Governed report"}</span>
          <h1>{context.pageLabel}</h1>
          <p>{groupDescription(group?.id ?? "", group?.label ?? "Reporting")} Data shown is a safe, deterministic prototype fixture.</p>
        </div>
        <div className="nx-report-workspace__actions">
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Save view", context.pageLabel)}>Save view</button>
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Schedule", context.pageLabel)}>Schedule</button>
          <button className="nx-button nx-button-secondary" type="button" onClick={() => onAction("Print", context.pageLabel)}>Print</button>
          <button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Export", context.pageLabel)}>Export</button>
        </div>
      </header>

      <ReportingPeriodControls value={period} onChange={setPeriod} viewBy={viewBy} onViewByChange={setViewBy} balanceForward={balanceForward} onBalanceForwardChange={setBalanceForward} contextLabel={context.pageLabel} onApply={() => onAction("Run report", `${context.pageLabel} · ${periodLabel} · ${viewBy}${balanceForward ? " · balance brought forward" : ""}`)} />

      <section className="nx-report-workspace__controlbar">
        <label><span>Compare with</span><select value={compare} onChange={(event) => setCompare(event.target.value)}><option>Prior year</option><option>Prior period</option><option>Budget</option><option>No comparison</option></select></label>
        <button className="nx-button nx-button-secondary" type="button" aria-expanded={filtersOpen} onClick={() => setFiltersOpen((value) => !value)}>Filters {filtersOpen ? "▴" : "▾"}</button>
        <button className="nx-button nx-button-primary" type="button" onClick={() => onAction("Run report", context.pageLabel)}>Run report</button>
      </section>

      {filtersOpen ? <section className="nx-report-workspace__filters" aria-label="Advanced report filters">
        <label><span>Company</span><select><option>All permitted companies</option><option>Nexora Services</option></select></label>
        <label><span>Branch</span><select><option>All branches</option><option>Islamabad</option><option>Lahore</option></select></label>
        <label><span>Currency</span><select><option>Reporting currency</option><option>USD</option><option>PKR</option><option>GBP</option></select></label>
        <label><span>Status</span><select><option>All statuses</option><option>Approved</option><option>Outstanding</option><option>Paid</option></select></label>
        <label><span>Department</span><select><option>All departments</option><option>Sales</option><option>Operations</option><option>Finance</option></select></label>
        <label><span>Created by</span><select><option>All authorised users</option><option>Amna Malik</option><option>Omar Siddiqui</option></select></label>
      </section> : null}

      <section className="nx-report-workspace__kpis" aria-label="Report headline values">
        {metrics.map((metric, index) => {
          const [value, ...labelWords] = metric.split(" ");
          return <article key={metric}><span>{["Report value", "Settled / on target", "Open exposure", "Control indicator"][index]}</span><strong>{value}</strong><small>{labelWords.join(" ") || periodLabel}</small></article>;
        })}
      </section>

      <section className="nx-report-workspace__analysis">
        <article className="nx-report-workspace__chart">
          <header><div><span>Trend &amp; comparison</span><h2>{periodLabel} by {viewBy} against {compare}</h2></div><button type="button" onClick={() => onAction("View chart data", context.pageLabel)}>View data</button></header>
          <div className="nx-report-workspace__plot" aria-label={`${periodLabel} ${viewBy} comparison chart`}>
            {chartHeights.map((height, index) => <i key={chartLabels[index]} style={{ height: `${height}%` }}><b style={{ height: `${Math.max(30, height - 14)}%` }} /><span>{chartLabels[index]}</span></i>)}
          </div>
          <footer><span><i className="current" />Current period</span><span><i />{compare}</span><b>{balanceForward ? "Opening balance included" : "Period movement only"}</b></footer>
        </article>
        <aside className="nx-report-workspace__insights">
          <header><span>Management reading</span><h2>What needs attention</h2></header>
          <button type="button" onClick={() => onAction("Drill down", "Outstanding items")}><b>18</b><span>Outstanding items exceed the selected control threshold.</span><em>Review ›</em></button>
          <button type="button" onClick={() => onAction("Drill down", "Largest variance")}><b>7.8%</b><span>Largest variance is concentrated in one business segment.</span><em>Explain ›</em></button>
          <button type="button" onClick={() => onAction("Drill down", "Positive movement")}><b>+12.4%</b><span>Current period movement is ahead of the comparison baseline.</span><em>Explore ›</em></button>
        </aside>
      </section>

      <section className="nx-report-workspace__table">
        <header><div><span>Report detail</span><h2>Source-level records</h2></div><div><input aria-label="Search report results" placeholder="Search results..." /><button type="button" onClick={() => onAction("Columns", context.pageLabel)}>Columns</button></div></header>
        <div className="nx-report-workspace__table-scroll"><table><thead><tr><th>Date</th><th>Document</th><th>Customer / account</th><th>Description</th><th className="amount">Gross value</th><th className="amount">Outstanding</th><th>Status</th></tr></thead><tbody>{rows.map((row) => <tr key={row[1]} onClick={() => onAction("Drill down", row[1])}><td>{row[0]}</td><td><button type="button" onClick={(event) => { event.stopPropagation(); onAction("View source transaction", row[1]); }}>{row[1]}</button></td><td>{row[2]}</td><td>{row[3]}</td><td className="amount">{row[4]}</td><td className="amount">{row[5]}</td><td><span data-status={row[6].toLowerCase().replace(" ", "-")}>{row[6]}</span></td></tr>)}</tbody></table></div>
        <footer><span>Showing 1–6 of 128 records</span><div><button type="button" disabled>Previous</button><b>1</b><button type="button" onClick={() => onAction("Next page", context.pageLabel)}>Next</button></div></footer>
      </section>
    </div>
  );
}

export function ReportsWorkspace(props: ReportsWorkspaceProps) {
  if (["analytics-dashboard", "report-catalogue"].includes(props.context.pageId)) return <Catalogue {...props} />;
  return <ReportDetail {...props} />;
}

export function isReportsWorkspacePage(pageId: string) {
  if (["report-runner", "drilldown-explorer", "saved-views", "report-schedules", "dashboard-composer", "metric-definitions", "reporting-admin"].includes(pageId)) return false;
  return Boolean(reportModule?.groups.some((group) => group.pages.some((page) => page.id === pageId)));
}
