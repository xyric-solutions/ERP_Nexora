"use client";
import { WorkspaceHeader } from "@/shared/ui/module-design";
import { manufacturingDesignClass } from "../components/manufacturing-presentation";
import { WorkTable } from "@/shared/ui/work-table";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyMode } from "@prototype/shared/fixtures/mock-data";

interface ManufacturingContext {
  moduleId: string;
  moduleLabel: string;
  moduleCode: string;
  pageId: string;
  pageLabel: string;
  roleId: string;
  companyMode: CompanyMode;
  recordRef?: string;
}
interface ManufacturingWorkspaceProps {
  context: ManufacturingContext;
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}
type MoStatus = "Draft" | "Submitted" | "Approved" | "Released" | "In production" | "Completed" | "Closed";

// Bill of Materials, Production Planning and Manufacturing Orders are live
// (manufacturing-live-workspace.tsx). These two pages remain prototypes.
const maturityPages = new Set(["release-production-order", "production-variance"]);

const componentBaseline = [
  {
    code: "RM-2201",
    name: "Stainless steel casing",
    uom: "EA",
    bomQty: 500,
    issued: 510,
    tolerance: 2,
    unitCost: 4650,
    stock: 782,
  },
  {
    code: "RM-1108",
    name: "Precision impeller",
    uom: "EA",
    bomQty: 500,
    issued: 525,
    tolerance: 2,
    unitCost: 2840,
    stock: 604,
  },
  {
    code: "RM-3310",
    name: "Mechanical seal",
    uom: "EA",
    bomQty: 500,
    issued: 490,
    tolerance: 1.5,
    unitCost: 1975,
    stock: 512,
  },
  {
    code: "RM-4412",
    name: "Bearing set",
    uom: "SET",
    bomQty: 1000,
    issued: 1010,
    tolerance: 2,
    unitCost: 1280,
    stock: 1360,
  },
  {
    code: "RM-5524",
    name: "Fastener kit",
    uom: "SET",
    bomQty: 500,
    issued: 503,
    tolerance: 3,
    unitCost: 460,
    stock: 940,
  },
  {
    code: "PK-1050",
    name: "Export product carton",
    uom: "EA",
    bomQty: 500,
    issued: 520,
    tolerance: 3,
    unitCost: 185,
    stock: 575,
  },
] as const;

const routingOperations = [
  {
    sequence: "010",
    code: "OP-CUT-10",
    name: "Casing preparation",
    workCentre: "WC-MACH-01",
    setup: "45 min",
    cycle: "6.5 min/EA",
    capacity: "92%",
    quality: "First-piece inspection",
    cost: "PKR 138,500",
  },
  {
    sequence: "020",
    code: "OP-ASM-20",
    name: "Pump assembly",
    workCentre: "WC-ASM-02",
    setup: "30 min",
    cycle: "11.0 min/EA",
    capacity: "84%",
    quality: "Torque verification",
    cost: "PKR 214,000",
  },
  {
    sequence: "030",
    code: "OP-TST-30",
    name: "Pressure and leak test",
    workCentre: "WC-QA-04",
    setup: "20 min",
    cycle: "8.0 min/EA",
    capacity: "76%",
    quality: "Mandatory release gate",
    cost: "PKR 96,000",
  },
] as const;

const byProductRows = [
  {
    code: "BP-SS-01",
    name: "Recoverable stainless-steel offcut",
    uom: "KG",
    quantity: "18.00",
    recovery: "PKR 21,600",
    disposition: "Return to scrap store",
  },
  {
    code: "BP-PKG-02",
    name: "Reusable packaging material",
    uom: "EA",
    quantity: "12.00",
    recovery: "PKR 3,000",
    disposition: "Return to supplier pool",
  },
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
    ? "good"
    : /draft|review|submitted|production|near/i.test(value)
      ? "warn"
      : "risk";
  return (
    <span className="nx-mfg-status" data-tone={tone}>
      {value}
    </span>
  );
}
function Header({
  eyebrow,
  description,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <WorkspaceHeader eyebrow={eyebrow} title={title} description={description} actions={children} />
  );
}

function ActivityRail({ subject, onAction }: { subject: string; onAction: ManufacturingWorkspaceProps["onAction"] }) {
  return (
    <section className="nx-card nx-mfg-side nx-mfg-activity">
      <header>
        <span>Document activity</span>
        <h3>Messages, evidence and audit</h3>
      </header>
      <div className="nx-mfg-activity__actions">
        <Button variant="outline" type="button" onClick={() => onAction("Send message", subject)}>
          Send message
        </Button>
        <Button variant="outline" type="button" onClick={() => onAction("Log note", subject)}>
          Log note
        </Button>
        <Button variant="outline" type="button" onClick={() => onAction("Add attachment", subject)}>
          Attach
        </Button>
      </div>
      <ol>
        <li className="done">
          <b>AK</b>
          <span>
            <strong>Ayesha Khan</strong>
            <small>Updated component tolerance · Today 10:42</small>
          </span>
        </li>
        <li className="current">
          <b>UR</b>
          <span>
            <strong>Usman Raza</strong>
            <small>Requested cost-impact review · Today 09:18</small>
          </span>
        </li>
        <li>
          <b>SYS</b>
          <span>
            <strong>Nexora control</strong>
            <small>Revision and source references captured</small>
          </span>
        </li>
      </ol>
      <Button
        variant="ghost"
        className="nx-mfg-activity__audit"
        type="button"
        onClick={() => onAction("Open audit trail", subject)}
      >
        View complete audit trail
      </Button>
    </section>
  );
}

function MoOperationalTab({
  tab,
  reference,
  onAction,
}: {
  tab: string;
  reference: string;
  onAction: ManufacturingWorkspaceProps["onAction"];
}) {
  if (tab === "Components")
    return (
      <div className="nx-mfg-table-scroll">
        <WorkTable tableId="app/features/manufacturing/views/manufacturing-workspace:4">
          <thead>
            <tr>
              <th>Component</th>
              <th className="amount">Required</th>
              <th className="amount">Available</th>
              <th className="amount">Reserved</th>
              <th>Issue method</th>
              <th>Source location</th>
              <th>Readiness</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {componentBaseline.map((line) => {
              const short = line.stock < line.bomQty;
              return (
                <tr key={line.code}>
                  <td>
                    <button type="button" onClick={() => onAction("Open item", line.code)}>
                      {line.code}
                    </button>
                    <small>{line.name}</small>
                  </td>
                  <td className="amount">
                    {line.bomQty.toLocaleString()} {line.uom}
                  </td>
                  <td className="amount">
                    {line.stock.toLocaleString()} {line.uom}
                  </td>
                  <td className="amount">
                    {Math.min(line.stock, line.bomQty).toLocaleString()} {line.uom}
                  </td>
                  <td>{line.code.startsWith("PK") ? "Backflush" : "Manual issue"}</td>
                  <td>{line.code.startsWith("PK") ? "PKG-KHI-01" : "RM-KHI-01"}</td>
                  <td>
                    <Status value={short ? "Supply exception" : "Ready"} />
                  </td>
                  <td>
                    <button type="button" onClick={() => onAction("Open reservation", `${reference} / ${line.code}`)}>
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </WorkTable>
      </div>
    );
  if (tab === "Work orders")
    return (
      <div className="nx-mfg-table-scroll">
        <WorkTable tableId="app/features/manufacturing/views/manufacturing-workspace:5">
          <thead>
            <tr>
              <th>Seq.</th>
              <th>Work order / operation</th>
              <th>Work centre</th>
              <th>Planned start</th>
              <th>Output</th>
              <th>Capacity</th>
              <th>Quality gate</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {workOrderRows.map((row) => (
              <tr key={row.code}>
                <td>{row.sequence}</td>
                <td>
                  <button type="button" onClick={() => onAction("Open work order", `${reference} / ${row.code}`)}>
                    {row.code}
                  </button>
                  <small>{row.name}</small>
                </td>
                <td>{row.workCentre}</td>
                <td>{row.planned}</td>
                <td>{row.output}</td>
                <td>{row.capacity}</td>
                <td>{row.quality}</td>
                <td>
                  <Status value={row.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </WorkTable>
      </div>
    );
  if (tab === "By-products")
    return (
      <div className="nx-mfg-table-scroll">
        <WorkTable tableId="app/features/manufacturing/views/manufacturing-workspace:6">
          <thead>
            <tr>
              <th>By-product</th>
              <th className="amount">Expected</th>
              <th className="amount">Reported</th>
              <th className="amount">Recovery value</th>
              <th>Destination</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {byProductRows.map((row, index) => (
              <tr key={row.code}>
                <td>
                  <button type="button" onClick={() => onAction("Open item", row.code)}>
                    {row.code}
                  </button>
                  <small>{row.name}</small>
                </td>
                <td className="amount">
                  {row.quantity} {row.uom}
                </td>
                <td className="amount">
                  {index ? "8.00" : "12.50"} {row.uom}
                </td>
                <td className="amount">{row.recovery}</td>
                <td>{row.disposition}</td>
                <td>
                  <Status value={index ? "Within plan" : "Below recovery"} />
                </td>
              </tr>
            ))}
          </tbody>
        </WorkTable>
      </div>
    );
  if (tab === "Quality")
    return (
      <div className="nx-mfg-control-grid">
        <article>
          <span>First-piece inspection</span>
          <strong>Passed · QC-2026-7811</strong>
          <small>Dimensions and material certificate verified</small>
          <button type="button" onClick={() => onAction("Open inspection", "QC-2026-7811")}>
            View result
          </button>
        </article>
        <article>
          <span>Torque verification</span>
          <strong>12 of 20 samples</strong>
          <small>Next check due at output 350 EA</small>
          <Status value="In progress" />
        </article>
        <article>
          <span>Pressure test</span>
          <strong>Not started</strong>
          <small>Blocked until assembly work order completes</small>
          <Status value="Waiting" />
        </article>
        <article>
          <span>Non-conformance</span>
          <strong>1 open deviation</strong>
          <small>NCR-2026-0042 · seal surface finish</small>
          <button type="button" onClick={() => onAction("Open NCR", "NCR-2026-0042")}>
            Review NCR
          </button>
        </article>
      </div>
    );
  if (tab === "Costs & yield")
    return (
      <div className="nx-mfg-cost-layout">
        <div className="nx-mfg-cost-bars">
          <div>
            <span>Material issued</span>
            <b style={{ width: "83%" }} />
            <strong>PKR 7,294,350</strong>
          </div>
          <div>
            <span>Labour absorbed</span>
            <b style={{ width: "62%" }} />
            <strong>PKR 982,400</strong>
          </div>
          <div>
            <span>Overhead absorbed</span>
            <b style={{ width: "57%" }} />
            <strong>PKR 428,800</strong>
          </div>
          <div>
            <span>Variance impact</span>
            <b style={{ width: "9%" }} />
            <strong>PKR 78,450</strong>
          </div>
        </div>
        <dl>
          <div>
            <dt>Planned output</dt>
            <dd>500 EA</dd>
          </div>
          <div>
            <dt>Good output</dt>
            <dd>318 EA</dd>
          </div>
          <div>
            <dt>Rejected / rework</dt>
            <dd>2 / 4 EA</dd>
          </div>
          <div>
            <dt>Current yield</dt>
            <dd>98.15%</dd>
          </div>
          <div className="risk">
            <dt>Forecast unit cost</dt>
            <dd>PKR 18,732</dd>
          </div>
        </dl>
      </div>
    );
  if (tab === "Notes & files")
    return (
      <div className="nx-mfg-notes-grid">
        <label htmlFor="manufacturing-control-1">
          <span>Internal production notes</span>
          <Textarea id="manufacturing-control-1"
            rows={7}
            defaultValue="Prioritise export-grade casing certificates. Coordinate the final pressure-test slot with Quality before 17 September."
          />
        </label>
        <section>
          <strong>Controlled attachments</strong>
          <button type="button" onClick={() => onAction("Open attachment", "Approved drawing DRW-PMP-1042-C")}>
            DRW-PMP-1042-C · Approved drawing
          </button>
          <button type="button" onClick={() => onAction("Open attachment", "Work instruction WI-ASM-204")}>
            WI-ASM-204 · Assembly instruction
          </button>
          <button type="button" onClick={() => onAction("Add attachment", reference)}>
            + Add evidence
          </button>
        </section>
      </div>
    );
  return null;
}

function ManufacturingOrder({ context, onNavigate, onAction }: ManufacturingWorkspaceProps) {
  const initialStatus: MoStatus =
    context.pageId === "add-production-order"
      ? "Draft"
      : context.pageId === "release-production-order"
        ? "Submitted"
        : "Approved";
  const [status, setStatus] = useState<MoStatus>(initialStatus);
  const [issued, setIssued] = useState<Record<string, number>>(() =>
    Object.fromEntries(componentBaseline.map((line) => [line.code, line.issued])),
  );
  const [reason, setReason] = useState(
    "Engineering trial required additional impeller and export packaging consumption.",
  );
  const [activeTab, setActiveTab] = useState("Components");
  const canApprove = /production-manager|chief-executive|administrator/.test(context.roleId);
  const variances = componentBaseline.map((line) => {
    const actual = issued[line.code] ?? line.bomQty;
    const quantity = actual - line.bomQty;
    const percent = line.bomQty ? (quantity / line.bomQty) * 100 : 0;
    const utilisation = Math.abs(percent) / line.tolerance;
    const state = utilisation > 1 ? "breach" : utilisation >= 0.8 ? "warning" : "within";
    return { ...line, actual, quantity, percent, costImpact: quantity * line.unitCost, state };
  });
  const breaches = variances.filter((line) => line.state === "breach");
  const warnings = variances.filter((line) => line.state === "warning");
  const netCostImpact = variances.reduce((sum, line) => sum + line.costImpact, 0);
  const lifecycle = ["Draft", "Submitted", "Approved", "Released", "In production", "Completed", "Closed"] as const;
  const currentIndex = lifecycle.indexOf(status);
  const reference =
    context.recordRef ?? (context.pageId === "add-production-order" ? "Auto-generated on save" : "MO-2026-0184");
  const advance = (next: MoStatus, action: string) => {
    setStatus(next);
    onAction(action, reference);
  };

  return (
    <div className={`nx-mfg ${manufacturingDesignClass}`}>
      <Header
        eyebrow="Manufacturing / Production order"
        title={reference}
        description="Controlled execution against the approved BOM, routing, material and variance policy."
      >
        <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "production-orders")}>
          Back to orders
        </Button>
        {status === "Draft" ? (
          <>
            <Button variant="outline" type="button" onClick={() => onAction("Save draft", reference)}>
              Save draft
            </Button>
            <Button type="button" onClick={() => advance("Submitted", "Submit for approval")}>
              Submit for approval
            </Button>
          </>
        ) : null}
        {status === "Submitted" ? (
          <>
            <Button variant="destructive" type="button" onClick={() => advance("Draft", "Return to draft")}>
              Return
            </Button>
            <Button
              type="button"
              disabled={!canApprove}
              title={!canApprove ? "Production Manager approval required" : undefined}
              onClick={() =>
                advance(
                  "Approved",
                  breaches.length
                    ? "Approve manufacturing order with variance exception"
                    : "Approve manufacturing order",
                )
              }
            >
              {breaches.length ? "Approve exception & MO" : "Approve MO"}
            </Button>
          </>
        ) : null}
        {status === "Approved" ? (
          <Button type="button" onClick={() => advance("Released", "Release production order")}>
            Release to production
          </Button>
        ) : null}
        {status === "Released" ? (
          <Button type="button" onClick={() => advance("In production", "Start production")}>
            Start production
          </Button>
        ) : null}
        {status === "In production" ? (
          <Button type="button" onClick={() => advance("Completed", "Complete production")}>
            Complete production
          </Button>
        ) : null}
        {status === "Completed" ? (
          <Button type="button" onClick={() => advance("Closed", "Close manufacturing order")}>
            Close MO
          </Button>
        ) : null}
      </Header>
      <ol className="nx-mfg-lifecycle nx-mfg-lifecycle--mo" aria-label="Manufacturing order lifecycle">
        {lifecycle.map((label, index) => (
          <li className={index < currentIndex ? "is-done" : index === currentIndex ? "is-current" : ""} key={label}>
            <i>{index < currentIndex ? "✓" : index + 1}</i>
            <span>{label}</span>
          </li>
        ))}
      </ol>
      <section
        className={`nx-mfg-variance-banner ${breaches.length ? "has-breach" : warnings.length ? "has-warning" : "is-clear"}`}
      >
        <div>
          <b>{breaches.length ? "!" : "OK"}</b>
          <span>
            <strong>
              {breaches.length
                ? `${breaches.length} BOM variance exception${breaches.length > 1 ? "s" : ""} require approval`
                : "Consumption is within approved BOM tolerance"}
            </strong>
            <small>
              Limits are measured per component. Planned scrap is controlled separately and does not hide excess
              consumption.
            </small>
          </span>
        </div>
        <Button variant="outline" type="button" onClick={() => onNavigate("manufacturing", "production-variance")}>
          Open variance register
        </Button>
      </section>
      <section className="nx-mfg-order-context">
        <div>
          <span>Finished product</span>
          <strong>FG-10042 | Industrial Pump Assembly</strong>
          <small>Approved product master</small>
        </div>
        <div>
          <span>BOM baseline</span>
          <button type="button" onClick={() => onNavigate("manufacturing", "boms")}>
            BOM-10042-V3
          </button>
          <small>Effective 01 Sep 2026 · locked</small>
        </div>
        <div>
          <span>Order quantity</span>
          <strong>500 EA</strong>
          <small>5 × base BOM output</small>
        </div>
        <div>
          <span>Schedule</span>
          <strong>14-18 Sep 2026</strong>
          <small>Priority: High</small>
        </div>
        <div>
          <span>Material readiness</span>
          <strong>96%</strong>
          <small>One constrained component</small>
        </div>
        <div>
          <span>Forecast yield</span>
          <strong>98.15%</strong>
          <small>Target 98.50%</small>
        </div>
      </section>
      <div className="nx-mfg-order-layout">
        <main>
          <section className="nx-card nx-mfg-form-section">
            <header>
              <span>01</span>
              <div>
                <h2>Production plan and responsibility</h2>
                <p>The approved BOM is scaled and locked when the order is released.</p>
              </div>
              <Status value={status} />
            </header>
            <div className="nx-mfg-fields">
              <label className="wide" htmlFor="manufacturing-control-2">
                <span>Product to manufacture *</span>
                <Input id="manufacturing-control-2" defaultValue="FG-10042 | Industrial Pump Assembly" />
              </label>
              <label htmlFor="manufacturing-control-3">
                <span>Quantity *</span>
                <Input id="manufacturing-control-3" type="number" min="1" defaultValue="500" />
              </label>
              <label>
                <span>UOM</span>
                <select defaultValue="EA">
                  <option>EA</option>
                  <option>SET</option>
                </select>
              </label>
              <label className="wide">
                <span>Bill of materials *</span>
                <select defaultValue="BOM-10042-V3">
                  <option>BOM-10042-V3 · Effective</option>
                  <option>BOM-10042-V2 · Superseded</option>
                </select>
              </label>
              <label htmlFor="manufacturing-control-4">
                <span>Planned start *</span>
                <Input id="manufacturing-control-4" type="datetime-local" defaultValue="2026-09-14T08:00" />
              </label>
              <label htmlFor="manufacturing-control-5">
                <span>Planned finish *</span>
                <Input id="manufacturing-control-5" type="datetime-local" defaultValue="2026-09-18T17:00" />
              </label>
              <label>
                <span>Responsible planner *</span>
                <select defaultValue="Ali Raza">
                  <option>Ali Raza</option>
                  <option>Sana Ahmed</option>
                </select>
              </label>
              <label>
                <span>Production site *</span>
                <select defaultValue="PLANT-KHI-01">
                  <option>PLANT-KHI-01 · Karachi</option>
                  <option>PLANT-LHE-01 · Lahore</option>
                </select>
              </label>
              <label>
                <span>Material warehouse *</span>
                <select defaultValue="RM-KHI-01">
                  <option>RM-KHI-01 · Raw materials</option>
                  <option>SUB-KHI-01 · Subcontract</option>
                </select>
              </label>
              <label>
                <span>Finished goods warehouse</span>
                <select defaultValue="FG-KHI-01">
                  <option>FG-KHI-01 · Finished goods</option>
                  <option>QC-KHI-01 · Quality hold</option>
                </select>
              </label>
              <label htmlFor="manufacturing-control-6">
                <span>Source demand</span>
                <Input id="manufacturing-control-6" defaultValue="SO-2026-0841 / MPS-W38" />
              </label>
              <label htmlFor="manufacturing-control-7">
                <span>Project / cost centre</span>
                <Input id="manufacturing-control-7" defaultValue="PRJ-EXP-26 / PROD-01" />
              </label>
            </div>
          </section>
          <nav className="nx-mfg-tabs" aria-label="Manufacturing order detail tabs">
            {[
              "Components",
              "Work orders",
              "By-products",
              "Quality",
              "Costs & yield",
              "Variance & tolerance",
              "Notes & files",
            ].map((tab) => (
              <Button
                variant="outline"
                className={activeTab === tab ? "is-active" : ""}
                type="button"
                key={tab}
                onClick={() => setActiveTab(tab)}
              >
                {tab}
                {tab === "Variance & tolerance" && breaches.length ? ` (${breaches.length})` : ""}
              </Button>
            ))}
          </nav>
          {activeTab === "Variance & tolerance" ? (
            <>
              <section className="nx-card nx-mfg-lines nx-mfg-variance-table">
                <header>
                  <div>
                    <span>BOM comparison</span>
                    <h2>Planned material issue versus approved quantity</h2>
                    <p>
                      Red lines exceed the permitted tolerance; amber lines have consumed at least 80% of their limit.
                    </p>
                  </div>
                  <Button variant="outline" type="button" onClick={() => onAction("Recalculate variance", reference)}>
                    Recalculate
                  </Button>
                </header>
                <div className="nx-mfg-table-scroll">
                  <WorkTable tableId="app/features/manufacturing/views/manufacturing-workspace:10">
                    <thead>
                      <tr>
                        <th>Component</th>
                        <th className="amount">BOM quantity</th>
                        <th className="amount">Permitted variance</th>
                        <th className="amount">Planned issue</th>
                        <th className="amount">Variance qty</th>
                        <th className="amount">Variance %</th>
                        <th className="amount">Cost impact</th>
                        <th>Control result</th>
                      </tr>
                    </thead>
                    <tbody>
                      {variances.map((line) => (
                        <tr className={`is-${line.state}`} key={line.code}>
                          <td>
                            <button type="button" onClick={() => onAction("Open item", line.code)}>
                              {line.code}
                            </button>
                            <small>
                              {line.name} | Stock {line.stock} {line.uom}
                            </small>
                          </td>
                          <td className="amount">
                            {line.bomQty.toLocaleString()} {line.uom}
                          </td>
                          <td className="amount">
                            <strong>±{line.tolerance}%</strong>
                            <small>
                              ±{((line.bomQty * line.tolerance) / 100).toFixed(1)} {line.uom}
                            </small>
                          </td>
                          <td className="amount">
                            <input
                              aria-label={`Planned issue for ${line.name}`}
                              type="number"
                              value={line.actual}
                              onChange={(event) =>
                                setIssued((current) => ({ ...current, [line.code]: Number(event.target.value) }))
                              }
                            />
                          </td>
                          <td className="amount">
                            {line.quantity > 0 ? "+" : ""}
                            {line.quantity.toFixed(1)} {line.uom}
                          </td>
                          <td className="amount">
                            <strong>
                              {line.percent > 0 ? "+" : ""}
                              {line.percent.toFixed(2)}%
                            </strong>
                          </td>
                          <td className="amount">{money(line.costImpact)}</td>
                          <td>
                            <Status
                              value={
                                line.state === "breach"
                                  ? "Above limit"
                                  : line.state === "warning"
                                    ? "Near limit"
                                    : "Within tolerance"
                              }
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </WorkTable>
                </div>
              </section>
              <section className="nx-card nx-mfg-explanation">
                <header>
                  <span>Variance justification and corrective action</span>
                  <Status value={breaches.length ? "Required before exception approval" : "Optional"} />
                </header>
                <label htmlFor="manufacturing-control-8">
                  <span>Reason and corrective action {breaches.length ? "*" : ""}</span>
                  <Textarea id="manufacturing-control-8"
                    rows={4}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Explain why consumption differs from the approved BOM and what action is required."
                  />
                </label>
                <div>
                  <label>
                    <span>Reason code</span>
                    <select>
                      <option>Engineering trial / process adjustment</option>
                      <option>Material quality loss</option>
                      <option>Machine setup loss</option>
                      <option>Substitution</option>
                      <option>Unplanned scrap</option>
                    </select>
                  </label>
                  <label>
                    <span>Evidence</span>
                    <input type="file" />
                  </label>
                </div>
              </section>
            </>
          ) : (
            <section className="nx-card nx-mfg-lines">
              <header>
                <div>
                  <span>{activeTab}</span>
                  <h2>
                    {activeTab === "Components"
                      ? "Material availability and reservations"
                      : `${activeTab} execution view`}
                  </h2>
                  <p>Every operational record remains connected to this MO, its BOM revision and audit trail.</p>
                </div>
                <Button
                  variant="outline"
                  type="button"
                  onClick={() => onAction(activeTab === "Components" ? "Reserve materials" : "Add record", reference)}
                >
                  {activeTab === "Components" ? "Reserve materials" : "+ Add record"}
                </Button>
              </header>
              <MoOperationalTab tab={activeTab} reference={reference} onAction={onAction} />
            </section>
          )}
        </main>
        <aside>
          <section className="nx-card nx-mfg-side nx-mfg-variance-summary">
            <header>
              <span>Variance summary</span>
              <h3>Approval impact</h3>
            </header>
            <dl>
              <div>
                <dt>Lines compared</dt>
                <dd>{variances.length}</dd>
              </div>
              <div>
                <dt>Within tolerance</dt>
                <dd>{variances.length - breaches.length - warnings.length}</dd>
              </div>
              <div>
                <dt>Near limit</dt>
                <dd>{warnings.length}</dd>
              </div>
              <div className="risk">
                <dt>Above limit</dt>
                <dd>{breaches.length}</dd>
              </div>
              <div>
                <dt>Net cost impact</dt>
                <dd>{money(netCostImpact)}</dd>
              </div>
            </dl>
          </section>
          <section className="nx-card nx-mfg-side">
            <header>
              <span>Approval route</span>
              <h3>{breaches.length ? "Exception path" : "Standard path"}</h3>
            </header>
            <ol>
              <li className="done">
                <b>1</b>
                <span>
                  <strong>Production Planner</strong>
                  <small>Created and validated</small>
                </span>
              </li>
              <li className={status === "Submitted" ? "current" : ""}>
                <b>2</b>
                <span>
                  <strong>Production Manager</strong>
                  <small>Quantity and capacity approval</small>
                </span>
              </li>
              {breaches.length ? (
                <>
                  <li>
                    <b>3</b>
                    <span>
                      <strong>Cost Controller</strong>
                      <small>{money(netCostImpact)} impact review</small>
                    </span>
                  </li>
                  <li>
                    <b>4</b>
                    <span>
                      <strong>Plant Head</strong>
                      <small>Required above 5% on any line</small>
                    </span>
                  </li>
                </>
              ) : null}
            </ol>
          </section>
          <section className="nx-card nx-mfg-side">
            <header>
              <span>Release controls</span>
              <h3>Readiness</h3>
            </header>
            <ul>
              <li className="pass">
                <b>OK</b>
                <span>
                  <strong>BOM effective</strong>
                  <small>BOM-10042-V3 locked</small>
                </span>
              </li>
              <li className="pass">
                <b>OK</b>
                <span>
                  <strong>Routing available</strong>
                  <small>RT-PUMP-04</small>
                </span>
              </li>
              <li className="warn">
                <b>!</b>
                <span>
                  <strong>Material constraint</strong>
                  <small>Mechanical seal coverage 102%</small>
                </span>
              </li>
              <li className={breaches.length ? "risk" : "pass"}>
                <b>{breaches.length ? "!" : "OK"}</b>
                <span>
                  <strong>Variance control</strong>
                  <small>{breaches.length ? "Exception approval outstanding" : "All lines within policy"}</small>
                </span>
              </li>
            </ul>
          </section>
          <ActivityRail subject={reference} onAction={onAction} />
        </aside>
      </div>
    </div>
  );
}

function VarianceRegister({ onNavigate, onAction }: ManufacturingWorkspaceProps) {
  return (
    <div className={`nx-mfg ${manufacturingDesignClass}`}>
      <Header
        eyebrow="Manufacturing / Control"
        title="Production Variance Register"
        description="Review BOM consumption, yield and cost exceptions through approval and corrective action."
      >
        <Button variant="outline" type="button" onClick={() => onAction("Export", "Production variance")}>
          Export
        </Button>
        <Button type="button" onClick={() => onNavigate("manufacturing", "production-orders")}>
          View manufacturing orders
        </Button>
      </Header>
      <section className="nx-mfg-kpis">
        <article>
          <span>Open exceptions</span>
          <strong>12</strong>
          <small>4 high priority</small>
        </article>
        <article>
          <span>Net cost impact</span>
          <strong>PKR 184K</strong>
          <small>month to date</small>
        </article>
        <article>
          <span>Consumption variance</span>
          <strong>2.6%</strong>
          <small>policy limit 2.0%</small>
        </article>
        <article>
          <span>Yield variance</span>
          <strong>-1.1%</strong>
          <small>within 1.5% limit</small>
        </article>
      </section>
      <section className="nx-card nx-mfg-table-card">
        <header>
          <div>
            <span>Exception queue</span>
            <h2>Orders requiring variance review</h2>
          </div>
          <small>Highest impact first</small>
        </header>
        <div className="nx-mfg-table-scroll">
          <WorkTable tableId="app/features/manufacturing/views/manufacturing-workspace:11">
            <thead>
              <tr>
                <th>MO number</th>
                <th>Component / variance</th>
                <th className="amount">Allowed</th>
                <th className="amount">Actual</th>
                <th className="amount">Cost impact</th>
                <th>Owner</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              <tr onClick={() => onNavigate("manufacturing", "release-production-order", "MO-2026-0184")}>
                <td>
                  <button type="button">MO-2026-0184</button>
                </td>
                <td>
                  <strong>RM-1108 | Precision impeller</strong>
                  <small>+25 EA above BOM</small>
                </td>
                <td className="amount">±2.0%</td>
                <td className="amount">+5.0%</td>
                <td className="amount">PKR 71,000</td>
                <td>Ali Raza</td>
                <td>
                  <Status value="Approval required" />
                </td>
                <td>
                  <b className="nx-mfg-row-open">Review</b>
                </td>
              </tr>
              <tr onClick={() => onNavigate("manufacturing", "release-production-order", "MO-2026-0184")}>
                <td>
                  <button type="button">MO-2026-0184</button>
                </td>
                <td>
                  <strong>PK-1050 | Export product carton</strong>
                  <small>+20 EA above BOM</small>
                </td>
                <td className="amount">±3.0%</td>
                <td className="amount">+4.0%</td>
                <td className="amount">PKR 3,700</td>
                <td>Ali Raza</td>
                <td>
                  <Status value="Approval required" />
                </td>
                <td>
                  <b className="nx-mfg-row-open">Review</b>
                </td>
              </tr>
              <tr onClick={() => onNavigate("manufacturing", "release-production-order", "MO-2026-0178")}>
                <td>
                  <button type="button">MO-2026-0178</button>
                </td>
                <td>
                  <strong>RM-4480 | Valve spring</strong>
                  <small>-7 EA below BOM</small>
                </td>
                <td className="amount">±1.5%</td>
                <td className="amount">-2.0%</td>
                <td className="amount">-PKR 5,950</td>
                <td>Sana Ahmed</td>
                <td>
                  <Status value="Under review" />
                </td>
                <td>
                  <b className="nx-mfg-row-open">Review</b>
                </td>
              </tr>
            </tbody>
          </WorkTable>
        </div>
      </section>
    </div>
  );
}

export function ManufacturingWorkspace(props: ManufacturingWorkspaceProps) {
  if (props.context.pageId === "production-variance") return <VarianceRegister {...props} />;
  return <ManufacturingOrder {...props} />;
}

export function isManufacturingMaturityPage(pageId: string) {
  return maturityPages.has(pageId);
}
