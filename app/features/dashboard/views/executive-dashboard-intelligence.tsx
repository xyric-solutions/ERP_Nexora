"use client";

import { ChartPanel, ComboChart, StackedBarChart } from "@prototype/shared/ui/analytics-charts";

interface ExecutiveDashboardIntelligenceProps {
  roleId: string;
  onDrill: (subject: string, targetModuleId?: string) => void;
}

const money = (value: number) => new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
}).format(value);

const financialHeadline = [
  { label: "Total income", value: "$8.56M", detail: "Revenue plus other income", tone: "positive", moduleId: "reports" },
  { label: "Major income", value: "$3.28M", detail: "Manufacturing · 38.3%", tone: "info", moduleId: "sales" },
  { label: "Total expenses", value: "$7.34M", detail: "Direct and indirect cost", tone: "warning", moduleId: "finance" },
  { label: "Major expense", value: "$4.98M", detail: "Direct cost of sales · 67.8%", tone: "danger", moduleId: "costing" },
] as const;

const rankings = [
  {
    title: "Top customers",
    moduleId: "customers",
    items: [["Atlas Engineering", "$1.42M", 100], ["Crescent Holdings", "$1.08M", 76], ["Pak Industrial", "$864K", 61]],
  },
  {
    title: "Top suppliers",
    moduleId: "suppliers",
    items: [["Global Components", "$1.16M", 100], ["Pak Steel Works", "$842K", 73], ["Prime Logistics", "$624K", 54]],
  },
  {
    title: "High-price products",
    moduleId: "inventory",
    items: [["Industrial Servo", "$18,400", 100], ["PLC Control Unit", "$12,850", 70], ["Hydraulic Assembly", "$9,760", 53]],
  },
  {
    title: "Slow-moving products",
    moduleId: "inventory",
    items: [["Legacy Sensor Kit", "184 days", 100], ["Panel Enclosure V1", "146 days", 79], ["Relay Pack R8", "121 days", 66]],
  },
] as const;

const workforceAndFleet = [
  { label: "Ayesha Khan · Sales", value: "118%", detail: "Target attainment", width: 100, moduleId: "hr" },
  { label: "Bilal Ahmed · Projects", value: "94%", detail: "Billable utilisation", width: 80, moduleId: "projects" },
  { label: "VH-042 · Delivery truck", value: "1,284 L", detail: "Highest fuel consumption", width: 92, moduleId: "fleet" },
  { label: "VH-018 · Forklift", value: "$8,420", detail: "Highest repair and maintenance cost", width: 72, moduleId: "fleet" },
] as const;

export function ExecutiveDashboardIntelligence({ roleId, onDrill }: ExecutiveDashboardIntelligenceProps) {
  if (roleId !== "chief-executive" && roleId !== "chief-financial-officer") return null;
  const isCfo = roleId === "chief-financial-officer";

  return (
    <>
      <article className="nx-role-panel nx-role-panel--wide">
        <div className="nx-role-panel__head">
          <div><span>{isCfo ? "Financial intelligence" : "Enterprise intelligence"}</span><h2>Income, expense and cost command view</h2><p>Consolidated mock analysis with direct drill-down to the responsible ledger, project, location, department, product and operational source.</p></div>
          <span className="nx-role-badge">Executive access</span>
        </div>
        <div className="grid gap-2.5 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {financialHeadline.map((item) => (
            <button className={`relative flex min-h-29 min-w-0 flex-col items-start gap-1.5 rounded border border-border border-t-3 bg-muted p-3.5 text-left transition-colors hover:border-primary/30 hover:bg-accent focus-visible:z-2 focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2 ${item.tone === "positive" ? "border-t-[var(--nx-success-text)]" : item.tone === "warning" ? "border-t-[var(--nx-warning)]" : item.tone === "danger" ? "border-t-destructive" : item.tone === "info" ? "border-t-[var(--nx-info)]" : "border-t-primary"}`} key={item.label} onClick={() => onDrill(item.label, item.moduleId)} type="button">
              <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{item.label}</span><strong className="text-2xl font-bold tracking-tight text-foreground">{item.value}</strong><small className="text-xs leading-snug text-muted-foreground">{item.detail}</small><i className="absolute top-3 right-3 text-sm not-italic text-primary" aria-hidden="true">Open</i>
            </button>
          ))}
        </div>
      </article>

      <ChartPanel chartId="direct-indirect-cost" eyebrow="Cost structure" title="Direct and indirect expense trend" subtitle="All expenses classified by controllability and accounting treatment." badge="Monthly · USD" wide onDrill={() => onDrill("Direct and indirect expense", "finance")}>
        <StackedBarChart
          labels={["Mar", "Apr", "May", "Jun", "Jul", "Aug"]}
          series={[
            { label: "Direct material", tone: "blue", values: [388000, 412000, 405000, 438000, 451000, 472000] },
            { label: "Direct labour", tone: "cyan", values: [142000, 148000, 152000, 158000, 162000, 168000] },
            { label: "Indirect production", tone: "teal", values: [86000, 92000, 89000, 97000, 101000, 108000] },
            { label: "Administrative", tone: "violet", values: [118000, 121000, 124000, 126000, 131000, 136000] },
          ]}
          formatValue={money}
          accessibleSummary="Monthly expenses split into direct material, direct labour, indirect production and administrative cost; August is the highest-cost month."
        />
      </ChartPanel>

      <ChartPanel chartId="project-income-cost" eyebrow="Projects" title="Project-wise income and cost" subtitle="Recognised income against total project cost for the largest active projects." badge="Project margin" onDrill={() => onDrill("Project-wise income and cost", "projects")}>
        <ComboChart labels={["Crescent", "Atlas", "Orion", "Nova", "Delta"]} barSeries={{ label: "Cost", values: [820000, 690000, 515000, 448000, 386000], tone: "cyan" }} lineSeries={{ label: "Income", values: [1120000, 910000, 748000, 612000, 544000], tone: "blue" }} formatValue={money} accessibleSummary="Income exceeds cost across the five largest projects, with Crescent producing the highest absolute contribution." />
      </ChartPanel>

      <ChartPanel chartId="location-income-cost" eyebrow="Locations" title="Location-wise income and cost" subtitle="Branch and operating-site performance, including shared cost allocations." badge="Location P&L" onDrill={() => onDrill("Location-wise income and cost", "reports")}>
        <ComboChart labels={["Karachi", "Lahore", "Islamabad", "Faisalabad", "Multan"]} barSeries={{ label: "Cost", values: [1860000, 1420000, 1040000, 720000, 540000], tone: "teal" }} lineSeries={{ label: "Income", values: [2480000, 1940000, 1480000, 930000, 710000], tone: "indigo" }} formatValue={money} accessibleSummary="All five locations remain contribution-positive; Karachi has the highest income and cost base while Faisalabad has the narrowest margin." />
      </ChartPanel>

      <ChartPanel chartId="department-income-cost" eyebrow="Departments" title="Department-wise income and cost" subtitle="Responsibility-centre comparison for revenue owners and support functions." badge="Department view" onDrill={() => onDrill("Department-wise income and cost", "costing")}>
        <ComboChart labels={["Sales", "Production", "Projects", "Service", "Corporate"]} barSeries={{ label: "Cost", values: [640000, 2840000, 1180000, 520000, 780000], tone: "violet" }} lineSeries={{ label: "Attributed income", values: [1770000, 3280000, 2270000, 1100000, 138000], tone: "blue" }} formatValue={money} accessibleSummary="Production creates the largest income and cost base; corporate is shown as a support centre with other income attribution rather than operating revenue." />
      </ChartPanel>

      <ChartPanel chartId="product-unit-cost" eyebrow="Product costing" title="Per-product cost composition" subtitle="Direct material, labour and allocated overhead per finished unit." badge="Standard cost" onDrill={() => onDrill("Per-product cost", "costing")}>
        <StackedBarChart labels={["Servo", "PLC", "Hydraulic", "Panel", "Sensor"]} series={[{ label: "Material", tone: "blue", values: [11200, 7600, 5840, 3180, 1640] }, { label: "Labour", tone: "cyan", values: [2780, 1940, 1480, 820, 460] }, { label: "Overhead", tone: "teal", values: [1640, 1180, 920, 540, 310] }]} formatValue={money} accessibleSummary="Industrial Servo has the highest standard unit cost, driven primarily by direct material." />
      </ChartPanel>

      <ChartPanel chartId="price-variance-products" eyebrow="Purchase price variance" title="Product price variance" subtitle="Actual purchase price compared with approved standard price by product." badge="Unfavourable highlighted" onDrill={() => onDrill("Product price variance", "purchases")}>
        <ComboChart labels={["Copper", "Steel", "Servo", "Bearing", "Resin"]} barSeries={{ label: "Standard price", values: [820, 420, 17600, 1180, 640], tone: "cyan" }} lineSeries={{ label: "Actual price", values: [894, 438, 18400, 1142, 698], tone: "plum" }} formatValue={(value) => `$${Math.round(value).toLocaleString()}`} accessibleSummary="Copper, steel, servo and resin are above standard price; bearings are favourable. Servo creates the highest absolute unit variance." />
      </ChartPanel>

      <article className="nx-role-panel nx-role-panel--wide">
        <div className="nx-role-panel__head"><div><span>Commercial and inventory leaders</span><h2>Top contributors and product exceptions</h2><p>Ranked by year-to-date value, unit price or days without movement.</p></div><span className="nx-role-badge">Click any row</span></div>
        <div className="grid gap-3 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {rankings.map((group) => (
            <section className="min-w-0 rounded border border-border bg-muted p-3" key={group.title}><h3 className="mb-2.5 text-xs font-bold text-foreground">{group.title}</h3>{group.items.map(([label, value, width]) => (
              <button className="grid w-full min-w-0 gap-1.5 border-0 border-b border-border bg-transparent py-2 text-left last:border-b-0 focus-visible:z-2 focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2" key={label} onClick={() => onDrill(`${group.title}: ${label}`, group.moduleId)} type="button"><span className="flex min-w-0 items-center justify-between gap-2"><strong className="truncate text-xs text-foreground transition-colors hover:text-primary">{label}</strong><b className="shrink-0 text-xs text-muted-foreground">{value}</b></span><i className="h-1.25 w-full overflow-hidden rounded bg-border"><span className="block h-full rounded bg-[var(--nx-accent)]" style={{ width: `${width}%` }} /></i></button>
            ))}</section>
          ))}
        </div>
      </article>

      <article className="nx-role-panel nx-role-panel--wide">
        <div className="nx-role-panel__head"><div><span>People and fleet</span><h2>Employee performance and fleet cost exceptions</h2><p>Operational signals shown to the CEO; the CFO sees their financial impact and source costs.</p></div><span className="nx-role-badge">Role governed</span></div>
        <div className="grid gap-2.5 p-3.5 sm:grid-cols-2 xl:grid-cols-4">
          {workforceAndFleet.map((item) => (
            <button className="grid min-h-27 min-w-0 grid-cols-[minmax(0,1fr)_auto] content-between gap-3 rounded border border-border bg-muted p-3 text-left transition-colors hover:border-primary/30 hover:bg-accent focus-visible:z-2 focus-visible:outline-3 focus-visible:outline-primary focus-visible:outline-offset-2" key={item.label} onClick={() => onDrill(item.label, item.moduleId)} type="button"><span className="min-w-0"><em className="mb-1.5 block text-xs not-italic text-muted-foreground">{item.detail}</em><strong className="block overflow-wrap-anywhere text-xs leading-snug text-foreground">{item.label}</strong></span><b className="text-sm text-primary">{item.value}</b><i className="col-span-full h-1.25 w-full overflow-hidden rounded bg-border"><span className="block h-full rounded bg-[var(--nx-accent)]" style={{ width: `${item.width}%` }} /></i></button>
          ))}
        </div>
      </article>
    </>
  );
}
