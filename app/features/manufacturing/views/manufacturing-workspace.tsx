"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyMode } from "@prototype/shared/fixtures/mock-data";

interface ManufacturingContext {
  moduleId: string; moduleLabel: string; moduleCode: string; pageId: string;
  pageLabel: string; roleId: string; companyMode: CompanyMode; recordRef?: string;
}
interface ManufacturingWorkspaceProps {
  context: ManufacturingContext;
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}
type MoStatus = "Draft" | "Submitted" | "Approved" | "Released" | "In production" | "Completed" | "Closed";

const maturityPages = new Set([
  "boms", "bom-editor", "production-orders", "add-production-order",
  "production-order-detail", "release-production-order", "production-variance",
]);

const bomRecords = [
  { id: "BOM-10042-V3", item: "FG-10042", name: "Industrial Pump Assembly", version: "V3", output: "100 EA", components: 8, routing: "RT-PUMP-04", cost: "PKR 1,842,600", status: "Effective" },
  { id: "BOM-10051-V2", item: "FG-10051", name: "Control Panel 24V", version: "V2", output: "50 EA", components: 14, routing: "RT-CP-02", cost: "PKR 964,250", status: "Effective" },
  { id: "BOM-10063-V1", item: "FG-10063", name: "Precision Valve Set", version: "V1", output: "100 EA", components: 6, routing: "RT-VLV-01", cost: "PKR 684,000", status: "In review" },
  { id: "BOM-10071-D1", item: "FG-10071", name: "Motor Housing Kit", version: "Draft 1", output: "25 EA", components: 11, routing: "Not assigned", cost: "PKR 438,900", status: "Draft" },
] as const;

const moRecords = [
  { id: "MO-2026-0184", product: "Industrial Pump Assembly", bom: "BOM-10042-V3", quantity: "500 EA", schedule: "14-18 Sep 2026", readiness: "96%", variance: "3 exceptions", status: "Submitted" },
  { id: "MO-2026-0181", product: "Control Panel 24V", bom: "BOM-10051-V2", quantity: "200 EA", schedule: "12-16 Sep 2026", readiness: "100%", variance: "Within tolerance", status: "Released" },
  { id: "MO-2026-0178", product: "Precision Valve Set", bom: "BOM-10063-V1", quantity: "350 EA", schedule: "10-15 Sep 2026", readiness: "88%", variance: "1 exception", status: "In production" },
  { id: "MO-2026-0172", product: "Industrial Pump Assembly", bom: "BOM-10042-V3", quantity: "300 EA", schedule: "05-11 Sep 2026", readiness: "100%", variance: "+1.2%", status: "Completed" },
] as const;

const componentBaseline = [
  { code: "RM-2201", name: "Stainless steel casing", uom: "EA", bomQty: 500, issued: 510, tolerance: 2, unitCost: 4650, stock: 782 },
  { code: "RM-1108", name: "Precision impeller", uom: "EA", bomQty: 500, issued: 525, tolerance: 2, unitCost: 2840, stock: 604 },
  { code: "RM-3310", name: "Mechanical seal", uom: "EA", bomQty: 500, issued: 490, tolerance: 1.5, unitCost: 1975, stock: 512 },
  { code: "RM-4412", name: "Bearing set", uom: "SET", bomQty: 1000, issued: 1010, tolerance: 2, unitCost: 1280, stock: 1360 },
  { code: "RM-5524", name: "Fastener kit", uom: "SET", bomQty: 500, issued: 503, tolerance: 3, unitCost: 460, stock: 940 },
  { code: "PK-1050", name: "Export product carton", uom: "EA", bomQty: 500, issued: 520, tolerance: 3, unitCost: 185, stock: 575 },
] as const;

const routingOperations = [
  { sequence: "010", code: "OP-CUT-10", name: "Casing preparation", workCentre: "WC-MACH-01", setup: "45 min", cycle: "6.5 min/EA", capacity: "92%", quality: "First-piece inspection", cost: "PKR 138,500" },
  { sequence: "020", code: "OP-ASM-20", name: "Pump assembly", workCentre: "WC-ASM-02", setup: "30 min", cycle: "11.0 min/EA", capacity: "84%", quality: "Torque verification", cost: "PKR 214,000" },
  { sequence: "030", code: "OP-TST-30", name: "Pressure and leak test", workCentre: "WC-QA-04", setup: "20 min", cycle: "8.0 min/EA", capacity: "76%", quality: "Mandatory release gate", cost: "PKR 96,000" },
] as const;

const byProductRows = [
  { code: "BP-SS-01", name: "Recoverable stainless-steel offcut", uom: "KG", quantity: "18.00", recovery: "PKR 21,600", disposition: "Return to scrap store" },
  { code: "BP-PKG-02", name: "Reusable packaging material", uom: "EA", quantity: "12.00", recovery: "PKR 3,000", disposition: "Return to supplier pool" },
] as const;

const revisionRows = [
  { version: "V3", effective: "01 Sep 2026", owner: "Ayesha Khan", change: "Seal specification and tolerance revised", cost: "PKR 1,842,600", status: "Effective" },
  { version: "V2", effective: "18 Apr 2026", owner: "Usman Tariq", change: "Export carton and pressure test added", cost: "PKR 1,781,950", status: "Superseded" },
  { version: "V1", effective: "10 Jan 2026", owner: "Ayesha Khan", change: "Initial controlled release", cost: "PKR 1,744,300", status: "Archived" },
] as const;

const workOrderRows = routingOperations.map((operation, index) => ({
  ...operation,
  planned: index === 0 ? "14 Sep · 08:00" : index === 1 ? "15 Sep · 07:30" : "17 Sep · 10:00",
  output: index === 0 ? "500 / 500 EA" : index === 1 ? "320 / 500 EA" : "0 / 500 EA",
  status: index === 0 ? "Completed" : index === 1 ? "In production" : "Waiting",
}));

function money(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}PKR ${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}
function Status({ value }: { value: string }) {
  const tone = /effective|approved|released|completed|closed|within/i.test(value)
    ? "good" : /draft|review|submitted|production|near/i.test(value) ? "warn" : "risk";
  return <span className="nx-mfg-status" data-tone={tone}>{value}</span>;
}
function Header({ eyebrow, title, description, children }: { eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return <header className="nx-mfg-page-head"><div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div><div>{children}</div></header>;
}

function ActivityRail({ subject, onAction }: { subject: string; onAction: ManufacturingWorkspaceProps["onAction"] }) {
  return <section className="nx-card nx-mfg-side nx-mfg-activity">
    <header><span>Document activity</span><h3>Messages, evidence and audit</h3></header>
    <div className="nx-mfg-activity__actions">
      <Button variant="outline" type="button" onClick={() => onAction("Send message", subject)}>Send message</Button>
      <Button variant="outline" type="button" onClick={() => onAction("Log note", subject)}>Log note</Button>
      <Button variant="outline" type="button" onClick={() => onAction("Add attachment", subject)}>Attach</Button>
    </div>
    <ol>
      <li className="done"><b>AK</b><span><strong>Ayesha Khan</strong><small>Updated component tolerance · Today 10:42</small></span></li>
      <li className="current"><b>UR</b><span><strong>Usman Raza</strong><small>Requested cost-impact review · Today 09:18</small></span></li>
      <li><b>SYS</b><span><strong>Nexora control</strong><small>Revision and source references captured</small></span></li>
    </ol>
    <Button variant="ghost" className="nx-mfg-activity__audit" type="button" onClick={() => onAction("Open audit trail", subject)}>View complete audit trail</Button>
  </section>;
}

function BomTabPanel({ tab, onAction }: { tab: string; onAction: ManufacturingWorkspaceProps["onAction"] }) {
  if (tab === "Operations & routing") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>Seq.</th><th>Operation</th><th>Work centre</th><th>Setup</th><th>Cycle time</th><th>Capacity load</th><th>Quality gate</th><th className="amount">Expected cost</th></tr></thead><tbody>{routingOperations.map((row) => <tr key={row.code}><td>{row.sequence}</td><td><button type="button" onClick={() => onAction("Open operation", row.code)}>{row.code}</button><small>{row.name}</small></td><td>{row.workCentre}</td><td>{row.setup}</td><td>{row.cycle}</td><td><Status value={row.capacity} /></td><td>{row.quality}</td><td className="amount">{row.cost}</td></tr>)}</tbody></table></div>;
  if (tab === "By-products") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>By-product</th><th>UOM</th><th className="amount">Expected quantity</th><th className="amount">Recovery value</th><th>Disposition</th><th>Status</th></tr></thead><tbody>{byProductRows.map((row) => <tr key={row.code}><td><button type="button" onClick={() => onAction("Open item", row.code)}>{row.code}</button><small>{row.name}</small></td><td>{row.uom}</td><td className="amount">{row.quantity}</td><td className="amount">{row.recovery}</td><td>{row.disposition}</td><td><Status value="Controlled" /></td></tr>)}</tbody></table></div>;
  if (tab === "Quality plan") return <div className="nx-mfg-control-grid"><article><span>Incoming control</span><strong>Material certificate required</strong><small>Steel casing, impeller and bearing set</small><Status value="Configured" /></article><article><span>In-process control</span><strong>Torque + dimensional checks</strong><small>Sampling: first piece and every 25 units</small><Status value="3 checkpoints" /></article><article><span>Final release</span><strong>Pressure and leak test</strong><small>100% inspection with recorded result</small><Status value="Mandatory" /></article><article><span>Non-conformance route</span><strong>Quarantine → MRB decision</strong><small>Deviation approval cannot bypass Quality</small><Status value="Governed" /></article></div>;
  if (tab === "Cost roll-up") return <div className="nx-mfg-cost-layout"><div className="nx-mfg-cost-bars"><div><span>Direct material</span><b style={{ width: "78%" }} /><strong>PKR 1,436,200</strong></div><div><span>Direct labour</span><b style={{ width: "17%" }} /><strong>PKR 310,500</strong></div><div><span>Factory overhead</span><b style={{ width: "8%" }} /><strong>PKR 142,900</strong></div><div><span>By-product recovery</span><b style={{ width: "2%" }} /><strong>-PKR 46,000</strong></div></div><dl><div><dt>Rolled batch cost</dt><dd>PKR 1,843,600</dd></div><div><dt>Standard unit cost</dt><dd>PKR 18,436</dd></div><div><dt>Prior version</dt><dd>PKR 17,820</dd></div><div className="risk"><dt>Version movement</dt><dd>+3.46%</dd></div></dl></div>;
  if (tab === "Versions") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>Revision</th><th>Effective date</th><th>Change owner</th><th>Engineering change</th><th className="amount">Rolled cost</th><th>Status</th><th /></tr></thead><tbody>{revisionRows.map((row) => <tr key={row.version}><td><button type="button" onClick={() => onAction("Compare revision", row.version)}>{row.version}</button></td><td>{row.effective}</td><td>{row.owner}</td><td>{row.change}</td><td className="amount">{row.cost}</td><td><Status value={row.status} /></td><td><button type="button" onClick={() => onAction("Open revision", row.version)}>Open</button></td></tr>)}</tbody></table></div>;
  return null;
}

function MoOperationalTab({ tab, reference, onAction }: { tab: string; reference: string; onAction: ManufacturingWorkspaceProps["onAction"] }) {
  if (tab === "Components") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>Component</th><th className="amount">Required</th><th className="amount">Available</th><th className="amount">Reserved</th><th>Issue method</th><th>Source location</th><th>Readiness</th><th /></tr></thead><tbody>{componentBaseline.map((line) => { const short = line.stock < line.bomQty; return <tr key={line.code}><td><button type="button" onClick={() => onAction("Open item", line.code)}>{line.code}</button><small>{line.name}</small></td><td className="amount">{line.bomQty.toLocaleString()} {line.uom}</td><td className="amount">{line.stock.toLocaleString()} {line.uom}</td><td className="amount">{Math.min(line.stock, line.bomQty).toLocaleString()} {line.uom}</td><td>{line.code.startsWith("PK") ? "Backflush" : "Manual issue"}</td><td>{line.code.startsWith("PK") ? "PKG-KHI-01" : "RM-KHI-01"}</td><td><Status value={short ? "Supply exception" : "Ready"} /></td><td><button type="button" onClick={() => onAction("Open reservation", `${reference} / ${line.code}`)}>Open</button></td></tr>; })}</tbody></table></div>;
  if (tab === "Work orders") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>Seq.</th><th>Work order / operation</th><th>Work centre</th><th>Planned start</th><th>Output</th><th>Capacity</th><th>Quality gate</th><th>Status</th></tr></thead><tbody>{workOrderRows.map((row) => <tr key={row.code}><td>{row.sequence}</td><td><button type="button" onClick={() => onAction("Open work order", `${reference} / ${row.code}`)}>{row.code}</button><small>{row.name}</small></td><td>{row.workCentre}</td><td>{row.planned}</td><td>{row.output}</td><td>{row.capacity}</td><td>{row.quality}</td><td><Status value={row.status} /></td></tr>)}</tbody></table></div>;
  if (tab === "By-products") return <div className="nx-mfg-table-scroll"><table><thead><tr><th>By-product</th><th className="amount">Expected</th><th className="amount">Reported</th><th className="amount">Recovery value</th><th>Destination</th><th>Status</th></tr></thead><tbody>{byProductRows.map((row, index) => <tr key={row.code}><td><button type="button" onClick={() => onAction("Open item", row.code)}>{row.code}</button><small>{row.name}</small></td><td className="amount">{row.quantity} {row.uom}</td><td className="amount">{index ? "8.00" : "12.50"} {row.uom}</td><td className="amount">{row.recovery}</td><td>{row.disposition}</td><td><Status value={index ? "Within plan" : "Below recovery"} /></td></tr>)}</tbody></table></div>;
  if (tab === "Quality") return <div className="nx-mfg-control-grid"><article><span>First-piece inspection</span><strong>Passed · QC-2026-7811</strong><small>Dimensions and material certificate verified</small><button type="button" onClick={() => onAction("Open inspection", "QC-2026-7811")}>View result</button></article><article><span>Torque verification</span><strong>12 of 20 samples</strong><small>Next check due at output 350 EA</small><Status value="In progress" /></article><article><span>Pressure test</span><strong>Not started</strong><small>Blocked until assembly work order completes</small><Status value="Waiting" /></article><article><span>Non-conformance</span><strong>1 open deviation</strong><small>NCR-2026-0042 · seal surface finish</small><button type="button" onClick={() => onAction("Open NCR", "NCR-2026-0042")}>Review NCR</button></article></div>;
  if (tab === "Costs & yield") return <div className="nx-mfg-cost-layout"><div className="nx-mfg-cost-bars"><div><span>Material issued</span><b style={{ width: "83%" }} /><strong>PKR 7,294,350</strong></div><div><span>Labour absorbed</span><b style={{ width: "62%" }} /><strong>PKR 982,400</strong></div><div><span>Overhead absorbed</span><b style={{ width: "57%" }} /><strong>PKR 428,800</strong></div><div><span>Variance impact</span><b style={{ width: "9%" }} /><strong>PKR 78,450</strong></div></div><dl><div><dt>Planned output</dt><dd>500 EA</dd></div><div><dt>Good output</dt><dd>318 EA</dd></div><div><dt>Rejected / rework</dt><dd>2 / 4 EA</dd></div><div><dt>Current yield</dt><dd>98.15%</dd></div><div className="risk"><dt>Forecast unit cost</dt><dd>PKR 18,732</dd></div></dl></div>;
  if (tab === "Notes & files") return <div className="nx-mfg-notes-grid"><label><span>Internal production notes</span><Textarea rows={7} defaultValue="Prioritise export-grade casing certificates. Coordinate the final pressure-test slot with Quality before 17 September." /></label><section><strong>Controlled attachments</strong><button type="button" onClick={() => onAction("Open attachment", "Approved drawing DRW-PMP-1042-C")}>DRW-PMP-1042-C · Approved drawing</button><button type="button" onClick={() => onAction("Open attachment", "Work instruction WI-ASM-204")}>WI-ASM-204 · Assembly instruction</button><button type="button" onClick={() => onAction("Add attachment", reference)}>+ Add evidence</button></section></div>;
  return null;
}

function BomCatalogue({ onNavigate, onAction }: ManufacturingWorkspaceProps) {
  const [query, setQuery] = useState("");
  const visible = bomRecords.filter((record) => `${record.id} ${record.item} ${record.name}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="nx-mfg">
    <Header eyebrow="Manufacturing / Product engineering" title="Bill of Materials" description="Govern product structures, revisions, routings, yields, tolerances and cost roll-ups.">
      <Button variant="outline" type="button" onClick={() => onAction("Compare versions", "BOM catalogue")}>Compare versions</Button>
      <Button type="button" onClick={() => onNavigate("manufacturing", "bom-editor")}>+ New BOM</Button>
    </Header>
    <section className="nx-mfg-kpis"><article><span>Effective BOMs</span><strong>184</strong><small>12 revised this month</small></article><article><span>Engineering review</span><strong>7</strong><small>3 awaiting approval</small></article><article><span>Cost movement</span><strong>+2.4%</strong><small>against prior versions</small></article><article><span>Incomplete routing</span><strong>4</strong><small>blocks production release</small></article></section>
    <section className="nx-mfg-toolbar"><label><span>Search BOM</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="BOM, product code or description..." /></label><label><span>Status</span><select><option>All statuses</option><option>Effective</option><option>In review</option><option>Draft</option></select></label><label><span>Product family</span><select><option>All families</option><option>Pumps</option><option>Controls</option><option>Valves</option></select></label><Button variant="outline" type="button" onClick={() => onAction("Export", "BOM catalogue")}>Export</Button></section>
    <section className="nx-card nx-mfg-table-card"><header><div><span>Engineering master</span><h2>Approved structures and revisions</h2></div><small>{visible.length} records shown</small></header><div className="nx-mfg-table-scroll"><table><thead><tr><th>BOM / revision</th><th>Finished product</th><th>Output</th><th>Components</th><th>Routing</th><th className="amount">Rolled cost</th><th>Status</th><th /></tr></thead><tbody>{visible.map((record) => <tr key={record.id} onClick={() => onNavigate("manufacturing", "bom-editor", record.id)}><td><button type="button" onClick={(event) => { event.stopPropagation(); onNavigate("manufacturing", "bom-editor", record.id); }}>{record.id}</button><small>{record.version}</small></td><td><strong>{record.item}</strong><small>{record.name}</small></td><td>{record.output}</td><td>{record.components}</td><td>{record.routing}</td><td className="amount">{record.cost}</td><td><Status value={record.status} /></td><td><b className="nx-mfg-row-open">Open</b></td></tr>)}</tbody></table></div></section>
  </div>;
}

function BomEditor({ context, onNavigate, onAction }: ManufacturingWorkspaceProps) {
  const [stage, setStage] = useState(context.recordRef ? "Effective" : "Draft");
  const [activeTab, setActiveTab] = useState("Components");
  const componentRows = componentBaseline.map((line) => ({
    ...line,
    qtyPer: line.bomQty / 5,
    scrap: line.code === "RM-1108" ? 1.5 : line.code.startsWith("PK") ? 2 : .5,
  }));
  const stageIndex = stage === "Draft" ? 0 : stage === "In review" ? 1 : 3;
  return <div className="nx-mfg">
    <Header eyebrow="Product engineering / BOM" title={context.recordRef ?? "New Bill of Materials"} description="Version-controlled product definition with explicit consumption and variance policy.">
      <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "boms")}>Back to catalogue</Button>
      <Button variant="outline" type="button" onClick={() => onAction("Save draft", "BOM")}>Save draft</Button>
      <Button type="button" onClick={() => { setStage(stage === "Draft" ? "In review" : "Effective"); onAction(stage === "Draft" ? "Submit engineering review" : "Approve BOM", context.recordRef ?? "New BOM"); }}>{stage === "Draft" ? "Submit for review" : "Approve & make effective"}</Button>
    </Header>
    <ol className="nx-mfg-lifecycle" aria-label="BOM lifecycle">{["Draft", "Engineering review", "Approved", "Effective"].map((label, index) => <li className={index <= stageIndex ? "is-done" : ""} key={label}><i>{index + 1}</i><span>{label}</span></li>)}</ol>
    <section className="nx-mfg-policy">
      <div><span>Consumption tolerance</span><strong>Line-specific: 1.5% to 3.0%</strong><small>Variance above a line limit requires exception approval.</small></div>
      <div><span>Scrap allowance</span><strong>Included separately</strong><small>Planned scrap does not consume the variance tolerance.</small></div>
      <div><span>Cost variance trigger</span><strong>3.0% of rolled BOM cost</strong><small>Escalates to Cost Controller.</small></div>
      <div><span>Version control</span><strong>No editing after effective</strong><small>Create a new revision to change structure.</small></div>
    </section>
    <div className="nx-mfg-form-layout"><main>
      <section className="nx-card nx-mfg-form-section">
        <header><span>01</span><div><h2>Product and version</h2><p>Define the controlled output and effectivity.</p></div><Status value={stage} /></header>
        <div className="nx-mfg-fields">
          <label><span>BOM number</span><Input value={context.recordRef ?? "Auto-generated on save"} disabled /></label>
          <label><span>Revision</span><Input defaultValue={context.recordRef ? "V3" : "Draft 1"} /></label>
          <label className="wide"><span>Finished product *</span><Input list="finished-products" defaultValue="FG-10042 | Industrial Pump Assembly" /><datalist id="finished-products"><option value="FG-10042 | Industrial Pump Assembly" /><option value="FG-10051 | Control Panel 24V" /></datalist></label>
          <label><span>Product variant</span><select defaultValue="STD"><option value="STD">Standard export</option><option value="ME">Middle East configuration</option><option value="EU">EU certified</option></select></label>
          <label><span>Base output quantity *</span><Input type="number" defaultValue="100" /></label>
          <label><span>UOM</span><select defaultValue="EA"><option>EA</option><option>SET</option><option>KG</option></select></label>
          <label><span>BOM type</span><select defaultValue="Manufacture"><option>Manufacture</option><option>Kit / phantom</option><option>Subcontract</option><option>Formula / process</option></select></label>
          <label><span>Effective from</span><Input type="date" defaultValue="2026-09-14" /></label>
          <label><span>Routing *</span><select defaultValue="RT-PUMP-04"><option>RT-PUMP-04</option><option>RT-PUMP-03</option></select></label>
          <label><span>Production site *</span><select defaultValue="PLANT-KHI-01"><option>PLANT-KHI-01 · Karachi</option><option>PLANT-LHE-01 · Lahore</option></select></label>
          <label><span>Default warehouse</span><select defaultValue="RM-KHI-01"><option>RM-KHI-01 · Raw materials</option><option>SUB-KHI-01 · Subcontract</option></select></label>
          <label><span>Target yield %</span><Input type="number" min="0" max="100" step="0.1" defaultValue="98.5" /></label>
          <label><span>Engineering change</span><Input defaultValue="ECO-2026-0048" /></label>
        </div>
      </section>
      <nav className="nx-mfg-tabs" aria-label="BOM detail tabs">{["Components", "Operations & routing", "By-products", "Quality plan", "Cost roll-up", "Versions"].map((tab) => <Button variant="outline" className={activeTab === tab ? "is-active" : ""} type="button" key={tab} onClick={() => setActiveTab(tab)}>{tab}</Button>)}</nav>
      <section className="nx-card nx-mfg-lines">
        <header><div><span>{activeTab}</span><h2>{activeTab === "Components" ? "Material structure and permitted variance" : `${activeTab} control view`}</h2></div><Button variant="outline" type="button" onClick={() => onAction("Add line", "BOM")}>+ Add line</Button></header>
        {activeTab === "Components" ? <div className="nx-mfg-table-scroll"><table><thead><tr><th>Component</th><th>Issue method</th><th>UOM</th><th className="amount">Qty / 100</th><th className="amount">Scrap %</th><th className="amount">Allowed variance %</th><th className="amount">Unit cost</th><th className="amount">Expected cost</th><th>Supply control</th><th /></tr></thead><tbody>{componentRows.map((line) => <tr key={line.code}><td><button type="button" onClick={() => onAction("Open item", line.code)}>{line.code}</button><small>{line.name}</small></td><td><select aria-label={`Issue method for ${line.name}`} defaultValue={line.code.startsWith("PK") ? "Backflush" : "Manual issue"}><option>Manual issue</option><option>Backflush</option><option>Operation pull</option></select></td><td>{line.uom}</td><td className="amount"><input type="number" defaultValue={line.qtyPer} /></td><td className="amount"><input type="number" defaultValue={line.scrap} /></td><td className="amount"><input className="nx-mfg-tolerance-input" type="number" defaultValue={line.tolerance} /></td><td className="amount">{money(line.unitCost)}</td><td className="amount">{money(line.qtyPer * line.unitCost)}</td><td><Status value={line.stock > line.bomQty ? "Available" : "Plan supply"} /></td><td><button type="button" aria-label={`Remove ${line.name}`} onClick={() => onAction("Remove line", line.code)}>×</button></td></tr>)}</tbody></table></div> : <BomTabPanel tab={activeTab} onAction={onAction} />}
      </section>
    </main><aside>
      <section className="nx-card nx-mfg-side"><header><span>Engineering controls</span><h3>Approval readiness</h3></header><ul><li className="pass"><b>OK</b><span><strong>Finished product</strong><small>Approved stock master</small></span></li><li className="pass"><b>OK</b><span><strong>Material lines</strong><small>6 active components</small></span></li><li className="pass"><b>OK</b><span><strong>Variance policy</strong><small>Every line has a tolerance</small></span></li><li className="warn"><b>!</b><span><strong>Cost movement</strong><small>+3.4% requires commentary</small></span></li></ul></section>
      <section className="nx-card nx-mfg-side"><header><span>Where used</span><h3>Production impact</h3></header><dl><div><dt>Open MOs</dt><dd>7</dd></div><div><dt>Demand quantity</dt><dd>1,850 EA</dd></div><div><dt>Next planned order</dt><dd>15 Sep</dd></div><div><dt>Supersedes</dt><dd>BOM-10042-V2</dd></div></dl></section>
      <ActivityRail subject={context.recordRef ?? "New BOM"} onAction={onAction} />
    </aside></div>
  </div>;
}

function ManufacturingOrders({ onNavigate, onAction }: ManufacturingWorkspaceProps) {
  const [query, setQuery] = useState("");
  const visible = moRecords.filter((record) => `${record.id} ${record.product} ${record.bom} ${record.status}`.toLowerCase().includes(query.toLowerCase()));
  return <div className="nx-mfg">
    <Header eyebrow="Manufacturing / Production control" title="Manufacturing Orders" description="Plan, approve, release and complete production with BOM and variance control.">
      <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "production-variance")}>Variance register</Button>
      <Button type="button" onClick={() => onNavigate("manufacturing", "add-production-order")}>+ Create MO</Button>
    </Header>
    <section className="nx-mfg-kpis"><article><span>Open orders</span><strong>18</strong><small>7 currently released</small></article><article><span>Awaiting approval</span><strong>4</strong><small>2 contain exceptions</small></article><article><span>Material readiness</span><strong>93.8%</strong><small>weighted by MO priority</small></article><article><span>BOM variance</span><strong>2.6%</strong><small>month-to-date consumption</small></article></section>
    <section className="nx-mfg-toolbar"><label><span>Search orders</span><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="MO, product, BOM or status..." /></label><label><span>Status</span><select><option>All statuses</option><option>Draft</option><option>Submitted</option><option>Approved</option><option>Released</option><option>In production</option></select></label><label><span>Schedule</span><select><option>All dates</option><option>This week</option><option>Next week</option><option>Overdue</option></select></label><Button variant="outline" type="button" onClick={() => onAction("Export", "Manufacturing orders")}>Export</Button></section>
    <section className="nx-card nx-mfg-table-card"><header><div><span>Production pipeline</span><h2>Orders and exception status</h2></div><small>{visible.length} records shown</small></header><div className="nx-mfg-table-scroll"><table><thead><tr><th>MO number</th><th>Finished product</th><th>BOM baseline</th><th>Order quantity</th><th>Schedule</th><th>Material ready</th><th>Variance</th><th>Status</th><th /></tr></thead><tbody>{visible.map((record) => <tr key={record.id} onClick={() => onNavigate("manufacturing", "production-order-detail", record.id)}><td><button type="button" onClick={(event) => { event.stopPropagation(); onNavigate("manufacturing", "production-order-detail", record.id); }}>{record.id}</button></td><td><strong>{record.product}</strong><small>Priority {record.id.endsWith("84") ? "High" : "Normal"}</small></td><td>{record.bom}</td><td>{record.quantity}</td><td>{record.schedule}</td><td><span className="nx-mfg-progress"><i style={{ width: record.readiness }} />{record.readiness}</span></td><td><Status value={record.variance} /></td><td><Status value={record.status} /></td><td><b className="nx-mfg-row-open">Open</b></td></tr>)}</tbody></table></div></section>
  </div>;
}

function ManufacturingOrder({ context, onNavigate, onAction }: ManufacturingWorkspaceProps) {
  const initialStatus: MoStatus = context.pageId === "add-production-order" ? "Draft" : context.pageId === "release-production-order" ? "Submitted" : "Approved";
  const [status, setStatus] = useState<MoStatus>(initialStatus);
  const [issued, setIssued] = useState<Record<string, number>>(() => Object.fromEntries(componentBaseline.map((line) => [line.code, line.issued])));
  const [reason, setReason] = useState("Engineering trial required additional impeller and export packaging consumption.");
  const [activeTab, setActiveTab] = useState("Components");
  const canApprove = /production-manager|chief-executive|administrator/.test(context.roleId);
  const variances = componentBaseline.map((line) => {
    const actual = issued[line.code] ?? line.bomQty;
    const quantity = actual - line.bomQty;
    const percent = line.bomQty ? quantity / line.bomQty * 100 : 0;
    const utilisation = Math.abs(percent) / line.tolerance;
    const state = utilisation > 1 ? "breach" : utilisation >= .8 ? "warning" : "within";
    return { ...line, actual, quantity, percent, costImpact: quantity * line.unitCost, state };
  });
  const breaches = variances.filter((line) => line.state === "breach");
  const warnings = variances.filter((line) => line.state === "warning");
  const netCostImpact = variances.reduce((sum, line) => sum + line.costImpact, 0);
  const lifecycle = ["Draft", "Submitted", "Approved", "Released", "In production", "Completed", "Closed"] as const;
  const currentIndex = lifecycle.indexOf(status);
  const reference = context.recordRef ?? (context.pageId === "add-production-order" ? "Auto-generated on save" : "MO-2026-0184");
  const advance = (next: MoStatus, action: string) => {
    setStatus(next);
    onAction(action, reference);
  };

  return <div className="nx-mfg">
    <Header eyebrow="Manufacturing / Production order" title={reference} description="Controlled execution against the approved BOM, routing, material and variance policy.">
      <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "production-orders")}>Back to orders</Button>
      {status === "Draft" ? <><Button variant="outline" type="button" onClick={() => onAction("Save draft", reference)}>Save draft</Button><Button type="button" onClick={() => advance("Submitted", "Submit for approval")}>Submit for approval</Button></> : null}
      {status === "Submitted" ? <><Button variant="destructive" type="button" onClick={() => advance("Draft", "Return to draft")}>Return</Button><Button type="button" disabled={!canApprove} title={!canApprove ? "Production Manager approval required" : undefined} onClick={() => advance("Approved", breaches.length ? "Approve manufacturing order with variance exception" : "Approve manufacturing order")}>{breaches.length ? "Approve exception & MO" : "Approve MO"}</Button></> : null}
      {status === "Approved" ? <Button type="button" onClick={() => advance("Released", "Release production order")}>Release to production</Button> : null}
      {status === "Released" ? <Button type="button" onClick={() => advance("In production", "Start production")}>Start production</Button> : null}
      {status === "In production" ? <Button type="button" onClick={() => advance("Completed", "Complete production")}>Complete production</Button> : null}
      {status === "Completed" ? <Button type="button" onClick={() => advance("Closed", "Close manufacturing order")}>Close MO</Button> : null}
    </Header>
    <ol className="nx-mfg-lifecycle nx-mfg-lifecycle--mo" aria-label="Manufacturing order lifecycle">{lifecycle.map((label, index) => <li className={index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : ""} key={label}><i>{index < currentIndex ? "✓" : index + 1}</i><span>{label}</span></li>)}</ol>
    <section className={`nx-mfg-variance-banner ${breaches.length ? "has-breach" : warnings.length ? "has-warning" : "is-clear"}`}>
      <div><b>{breaches.length ? "!" : "OK"}</b><span><strong>{breaches.length ? `${breaches.length} BOM variance exception${breaches.length > 1 ? "s" : ""} require approval` : "Consumption is within approved BOM tolerance"}</strong><small>Limits are measured per component. Planned scrap is controlled separately and does not hide excess consumption.</small></span></div>
      <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "production-variance")}>Open variance register</Button>
    </section>
    <section className="nx-mfg-order-context"><div><span>Finished product</span><strong>FG-10042 | Industrial Pump Assembly</strong><small>Approved product master</small></div><div><span>BOM baseline</span><button type="button" onClick={() => onNavigate("manufacturing", "bom-editor", "BOM-10042-V3")}>BOM-10042-V3</button><small>Effective 01 Sep 2026 · locked</small></div><div><span>Order quantity</span><strong>500 EA</strong><small>5 × base BOM output</small></div><div><span>Schedule</span><strong>14-18 Sep 2026</strong><small>Priority: High</small></div><div><span>Material readiness</span><strong>96%</strong><small>One constrained component</small></div><div><span>Forecast yield</span><strong>98.15%</strong><small>Target 98.50%</small></div></section>
    <div className="nx-mfg-order-layout"><main>
      <section className="nx-card nx-mfg-form-section">
        <header><span>01</span><div><h2>Production plan and responsibility</h2><p>The approved BOM is scaled and locked when the order is released.</p></div><Status value={status} /></header>
        <div className="nx-mfg-fields">
          <label className="wide"><span>Product to manufacture *</span><Input defaultValue="FG-10042 | Industrial Pump Assembly" /></label>
          <label><span>Quantity *</span><Input type="number" min="1" defaultValue="500" /></label>
          <label><span>UOM</span><select defaultValue="EA"><option>EA</option><option>SET</option></select></label>
          <label className="wide"><span>Bill of materials *</span><select defaultValue="BOM-10042-V3"><option>BOM-10042-V3 · Effective</option><option>BOM-10042-V2 · Superseded</option></select></label>
          <label><span>Planned start *</span><Input type="datetime-local" defaultValue="2026-09-14T08:00" /></label>
          <label><span>Planned finish *</span><Input type="datetime-local" defaultValue="2026-09-18T17:00" /></label>
          <label><span>Responsible planner *</span><select defaultValue="Ali Raza"><option>Ali Raza</option><option>Sana Ahmed</option></select></label>
          <label><span>Production site *</span><select defaultValue="PLANT-KHI-01"><option>PLANT-KHI-01 · Karachi</option><option>PLANT-LHE-01 · Lahore</option></select></label>
          <label><span>Material warehouse *</span><select defaultValue="RM-KHI-01"><option>RM-KHI-01 · Raw materials</option><option>SUB-KHI-01 · Subcontract</option></select></label>
          <label><span>Finished goods warehouse</span><select defaultValue="FG-KHI-01"><option>FG-KHI-01 · Finished goods</option><option>QC-KHI-01 · Quality hold</option></select></label>
          <label><span>Source demand</span><Input defaultValue="SO-2026-0841 / MPS-W38" /></label>
          <label><span>Project / cost centre</span><Input defaultValue="PRJ-EXP-26 / PROD-01" /></label>
        </div>
      </section>
      <nav className="nx-mfg-tabs" aria-label="Manufacturing order detail tabs">{["Components", "Work orders", "By-products", "Quality", "Costs & yield", "Variance & tolerance", "Notes & files"].map((tab) => <Button variant="outline" className={activeTab === tab ? "is-active" : ""} type="button" key={tab} onClick={() => setActiveTab(tab)}>{tab}{tab === "Variance & tolerance" && breaches.length ? ` (${breaches.length})` : ""}</Button>)}</nav>
      {activeTab === "Variance & tolerance" ? <>
        <section className="nx-card nx-mfg-lines nx-mfg-variance-table">
          <header><div><span>BOM comparison</span><h2>Planned material issue versus approved quantity</h2><p>Red lines exceed the permitted tolerance; amber lines have consumed at least 80% of their limit.</p></div><Button variant="outline" type="button" onClick={() => onAction("Recalculate variance", reference)}>Recalculate</Button></header>
          <div className="nx-mfg-table-scroll"><table><thead><tr><th>Component</th><th className="amount">BOM quantity</th><th className="amount">Permitted variance</th><th className="amount">Planned issue</th><th className="amount">Variance qty</th><th className="amount">Variance %</th><th className="amount">Cost impact</th><th>Control result</th></tr></thead><tbody>{variances.map((line) => <tr className={`is-${line.state}`} key={line.code}><td><button type="button" onClick={() => onAction("Open item", line.code)}>{line.code}</button><small>{line.name} | Stock {line.stock} {line.uom}</small></td><td className="amount">{line.bomQty.toLocaleString()} {line.uom}</td><td className="amount"><strong>±{line.tolerance}%</strong><small>±{(line.bomQty * line.tolerance / 100).toFixed(1)} {line.uom}</small></td><td className="amount"><input aria-label={`Planned issue for ${line.name}`} type="number" value={line.actual} onChange={(event) => setIssued((current) => ({ ...current, [line.code]: Number(event.target.value) }))} /></td><td className="amount">{line.quantity > 0 ? "+" : ""}{line.quantity.toFixed(1)} {line.uom}</td><td className="amount"><strong>{line.percent > 0 ? "+" : ""}{line.percent.toFixed(2)}%</strong></td><td className="amount">{money(line.costImpact)}</td><td><Status value={line.state === "breach" ? "Above limit" : line.state === "warning" ? "Near limit" : "Within tolerance"} /></td></tr>)}</tbody></table></div>
        </section>
        <section className="nx-card nx-mfg-explanation"><header><span>Variance justification and corrective action</span><Status value={breaches.length ? "Required before exception approval" : "Optional"} /></header><label><span>Reason and corrective action {breaches.length ? "*" : ""}</span><Textarea rows={4} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Explain why consumption differs from the approved BOM and what action is required." /></label><div><label><span>Reason code</span><select><option>Engineering trial / process adjustment</option><option>Material quality loss</option><option>Machine setup loss</option><option>Substitution</option><option>Unplanned scrap</option></select></label><label><span>Evidence</span><input type="file" /></label></div></section>
      </> : <section className="nx-card nx-mfg-lines"><header><div><span>{activeTab}</span><h2>{activeTab === "Components" ? "Material availability and reservations" : `${activeTab} execution view`}</h2><p>Every operational record remains connected to this MO, its BOM revision and audit trail.</p></div><Button variant="outline" type="button" onClick={() => onAction(activeTab === "Components" ? "Reserve materials" : "Add record", reference)}>{activeTab === "Components" ? "Reserve materials" : "+ Add record"}</Button></header><MoOperationalTab tab={activeTab} reference={reference} onAction={onAction} /></section>}
    </main><aside>
      <section className="nx-card nx-mfg-side nx-mfg-variance-summary"><header><span>Variance summary</span><h3>Approval impact</h3></header><dl><div><dt>Lines compared</dt><dd>{variances.length}</dd></div><div><dt>Within tolerance</dt><dd>{variances.length - breaches.length - warnings.length}</dd></div><div><dt>Near limit</dt><dd>{warnings.length}</dd></div><div className="risk"><dt>Above limit</dt><dd>{breaches.length}</dd></div><div><dt>Net cost impact</dt><dd>{money(netCostImpact)}</dd></div></dl></section>
      <section className="nx-card nx-mfg-side"><header><span>Approval route</span><h3>{breaches.length ? "Exception path" : "Standard path"}</h3></header><ol><li className="done"><b>1</b><span><strong>Production Planner</strong><small>Created and validated</small></span></li><li className={status === "Submitted" ? "current" : ""}><b>2</b><span><strong>Production Manager</strong><small>Quantity and capacity approval</small></span></li>{breaches.length ? <><li><b>3</b><span><strong>Cost Controller</strong><small>{money(netCostImpact)} impact review</small></span></li><li><b>4</b><span><strong>Plant Head</strong><small>Required above 5% on any line</small></span></li></> : null}</ol></section>
      <section className="nx-card nx-mfg-side"><header><span>Release controls</span><h3>Readiness</h3></header><ul><li className="pass"><b>OK</b><span><strong>BOM effective</strong><small>BOM-10042-V3 locked</small></span></li><li className="pass"><b>OK</b><span><strong>Routing available</strong><small>RT-PUMP-04</small></span></li><li className="warn"><b>!</b><span><strong>Material constraint</strong><small>Mechanical seal coverage 102%</small></span></li><li className={breaches.length ? "risk" : "pass"}><b>{breaches.length ? "!" : "OK"}</b><span><strong>Variance control</strong><small>{breaches.length ? "Exception approval outstanding" : "All lines within policy"}</small></span></li></ul></section>
      <ActivityRail subject={reference} onAction={onAction} />
    </aside></div>
  </div>;
}

function VarianceRegister({ onNavigate, onAction }: ManufacturingWorkspaceProps) {
  return <div className="nx-mfg">
    <Header eyebrow="Manufacturing / Control" title="Production Variance Register" description="Review BOM consumption, yield and cost exceptions through approval and corrective action.">
      <Button variant="outline" type="button" onClick={() => onAction("Export", "Production variance")}>Export</Button>
      <Button type="button" onClick={() => onNavigate("manufacturing", "production-orders")}>View manufacturing orders</Button>
    </Header>
    <section className="nx-mfg-kpis"><article><span>Open exceptions</span><strong>12</strong><small>4 high priority</small></article><article><span>Net cost impact</span><strong>PKR 184K</strong><small>month to date</small></article><article><span>Consumption variance</span><strong>2.6%</strong><small>policy limit 2.0%</small></article><article><span>Yield variance</span><strong>-1.1%</strong><small>within 1.5% limit</small></article></section>
    <section className="nx-card nx-mfg-table-card"><header><div><span>Exception queue</span><h2>Orders requiring variance review</h2></div><small>Highest impact first</small></header><div className="nx-mfg-table-scroll"><table><thead><tr><th>MO number</th><th>Component / variance</th><th className="amount">Allowed</th><th className="amount">Actual</th><th className="amount">Cost impact</th><th>Owner</th><th>Status</th><th /></tr></thead><tbody>
      <tr onClick={() => onNavigate("manufacturing", "release-production-order", "MO-2026-0184")}><td><button type="button">MO-2026-0184</button></td><td><strong>RM-1108 | Precision impeller</strong><small>+25 EA above BOM</small></td><td className="amount">±2.0%</td><td className="amount">+5.0%</td><td className="amount">PKR 71,000</td><td>Ali Raza</td><td><Status value="Approval required" /></td><td><b className="nx-mfg-row-open">Review</b></td></tr>
      <tr onClick={() => onNavigate("manufacturing", "release-production-order", "MO-2026-0184")}><td><button type="button">MO-2026-0184</button></td><td><strong>PK-1050 | Export product carton</strong><small>+20 EA above BOM</small></td><td className="amount">±3.0%</td><td className="amount">+4.0%</td><td className="amount">PKR 3,700</td><td>Ali Raza</td><td><Status value="Approval required" /></td><td><b className="nx-mfg-row-open">Review</b></td></tr>
      <tr onClick={() => onNavigate("manufacturing", "production-order-detail", "MO-2026-0178")}><td><button type="button">MO-2026-0178</button></td><td><strong>RM-4480 | Valve spring</strong><small>-7 EA below BOM</small></td><td className="amount">±1.5%</td><td className="amount">-2.0%</td><td className="amount">-PKR 5,950</td><td>Sana Ahmed</td><td><Status value="Under review" /></td><td><b className="nx-mfg-row-open">Review</b></td></tr>
    </tbody></table></div></section>
  </div>;
}

export function ManufacturingWorkspace(props: ManufacturingWorkspaceProps) {
  if (props.context.pageId === "boms") return <BomCatalogue {...props} />;
  if (props.context.pageId === "bom-editor") return <BomEditor {...props} />;
  if (props.context.pageId === "production-orders") return <ManufacturingOrders {...props} />;
  if (props.context.pageId === "production-variance") return <VarianceRegister {...props} />;
  return <ManufacturingOrder {...props} />;
}

export function isManufacturingMaturityPage(pageId: string) {
  return maturityPages.has(pageId);
}
