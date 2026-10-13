"use client";

import { useMemo, useState } from "react";
import type { PrototypePageContext } from "./prototype-content";
import { analyseCompanyQuestion } from "./nexora-ai-engine";

const AI_PAGES = new Set([
  "ai-assistant",
  "suggestion-review",
  "extraction-review",
  "explanations",
  "human-handoff",
  "ai-automations",
  "ai-policy",
  "source-confidence",
  "ai-feedback",
  "ai-audit",
]);

export function isNexoraAiWorkspacePage(pageId: string) {
  return AI_PAGES.has(pageId);
}

interface NexoraAiWorkspaceProps {
  context: PrototypePageContext;
  onAction: (action: string, subject?: string) => void;
  onNavigate: (moduleId: string, pageId: string, recordRef?: string) => void;
}

type AiMode = "Ask" | "Analyse" | "Act";
type PermissionLevel = "Read" | "Recommend" | "Prepare" | "Execute";

const roleAgents = [
  ["CEO Intelligence", "Enterprise value, risk and strategic performance", "executive", "Ready"],
  ["CFO Close", "Cash, working capital, close readiness and controls", "finance", "Ready"],
  ["Accounting", "Journals, reconciliations and period exceptions", "finance", "Ready"],
  ["AR Collections", "Receivables risk and collection priorities", "commercial", "Ready"],
  ["AP Payments", "Payment proposals, holds and supplier risk", "finance", "Ready"],
  ["Sales Forecast", "Pipeline, margin, conversion and credit exposure", "commercial", "Ready"],
  ["Procurement", "Sourcing, supplier comparison and price variance", "operations", "Ready"],
  ["Inventory", "Shortage, ageing, reorder and valuation exceptions", "operations", "Ready"],
  ["Manufacturing", "BOM variance, capacity, scrap and output", "operations", "Ready"],
  ["Project Margin", "Utilisation, WIP, leakage and profitability", "services", "Ready"],
  ["People & Payroll", "Attendance, payroll and workforce risk", "people", "Ready"],
  ["Tax Compliance", "GST, withholding, filing and evidence readiness", "governance", "Ready"],
  ["Audit & Controls", "Anomalies, access, evidence and control testing", "governance", "Ready"],
  ["Fleet Cost", "Fuel, maintenance, compliance and cost per kilometre", "operations", "Ready"],
] as const;

const exceptions = [
  ["Duplicate supplier invoice suspected", "AP", "PKR 842,500", "96%", "Critical"],
  ["Customer likely to pay 18 days late", "AR", "PKR 3.4M", "88%", "High"],
  ["BOM material consumption above tolerance", "Production", "+7.4%", "93%", "High"],
  ["Three bank movements remain unmatched", "Bank", "PKR 724K", "91%", "Medium"],
] as const;

const proposals = [
  ["AI-PRP-0261", "Prepare collection plan for Atlas Retail", "AR Collections", "PKR 3.4M", "92%", "Review"],
  ["AI-PRP-0260", "Draft bank reconciliation matches", "Accounting", "3 items", "89%", "Review"],
  ["AI-PRP-0259", "Create material shortage requisition", "Manufacturing", "180 units", "94%", "Prepared"],
  ["AI-PRP-0258", "Place duplicate invoice on payment hold", "AP Payments", "PKR 842K", "96%", "Approved"],
] as const;

const extractionFields = [
  ["Supplier", "Mektron Industrial Supplies", "99%"],
  ["Invoice number", "MIS-INV-90881", "98%"],
  ["Invoice date", "14 Sep 2026", "97%"],
  ["Purchase order", "PO-2026-01842", "95%"],
  ["Net amount", "PKR 1,420,000", "99%"],
  ["Sales tax", "PKR 255,600", "96%"],
  ["Total", "PKR 1,675,600", "99%"],
  ["Payment terms", "30 days", "84%"],
] as const;

const auditRows = [
  ["16 Sep 2026 09:42", "demo.admin", "AP Payments", "Recommendation accepted", "AI-PRP-0258", "Human approved"],
  ["16 Sep 2026 09:18", "finance.manager", "CFO Close", "Scenario executed", "SCN-00642", "Read only"],
  ["16 Sep 2026 08:55", "production.manager", "Manufacturing", "Draft requisition prepared", "PR-DRAFT-188", "Awaiting approval"],
  ["15 Sep 2026 17:31", "audit.user", "Audit & Controls", "Evidence chain exported", "EVP-00187", "Completed"],
] as const;

function TrustStrip({ role }: { role: string }) {
  return (
    <div className="nx-aiw-trust" role="note">
      <span><b>Role scope</b>{role}</span>
      <span><b>Company scope</b>Nexora Demo Company</span>
      <span><b>Mode</b>Mock intelligence</span>
      <span><b>Control</b>Human approval required</span>
    </div>
  );
}

function AiPageHeader({ context, eyebrow, title, description, children }: { context: PrototypePageContext; eyebrow: string; title: string; description: string; children?: React.ReactNode }) {
  return (
    <>
      <header className="nx-aiw-header">
        <div><span>{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>
        <div className="nx-aiw-header__actions">{children}<span className="nx-aiw-live"><i /> Intelligence online</span></div>
      </header>
      <TrustStrip role={context.role} />
    </>
  );
}

function Confidence({ value }: { value: number }) {
  return <span className="nx-aiw-confidence"><i><b style={{ width: `${value}%` }} /></i><strong>{value}%</strong></span>;
}

function CommandCentre({ context, onAction, onNavigate }: NexoraAiWorkspaceProps) {
  const [mode, setMode] = useState<AiMode>("Ask");
  const analysisContext = useMemo(() => ({ roleLabel: context.role, moduleLabel: context.moduleLabel, pageLabel: context.pageLabel }), [context.role, context.moduleLabel, context.pageLabel]);
  const [query, setQuery] = useState("Give me purchase price variance analysis for this month");
  const [report, setReport] = useState(() => analyseCompanyQuestion("Give me purchase price variance analysis for this month", analysisContext));
  const [history, setHistory] = useState<string[]>(["Give me purchase price variance analysis for this month"]);
  const ask = (value: string) => {
    const question = value.trim();
    if (!question) return;
    setQuery(question);
    setReport(analyseCompanyQuestion(question, analysisContext));
    setHistory((current) => [question, ...current.filter((item) => item !== question)].slice(0, 4));
  };
  const maxChartValue = Math.max(1, ...report.chartRows.flatMap((row) => [row.actual, row.benchmark]));
  return (
    <div className="nx-aiw">
      <AiPageHeader context={context} eyebrow="Nexora Intelligence OS" title="Ask. Explain. Simulate. Act - with control." description="A persistent, role-aware intelligence layer spanning every Nexora workflow and source record.">
        <button type="button" onClick={() => onNavigate("ai", "ai-policy")}>Governance centre</button>
      </AiPageHeader>
      <section className="nx-aiw-command">
        <div className="nx-aiw-command__intro"><span>Free-form company data copilot</span><h2>Ask any question about your company.</h2><p>Nexora interprets the question, selects the relevant company dataset, performs the calculations and builds a fresh report.</p></div>
        <nav aria-label="AI operating mode">{(["Ask", "Analyse", "Act"] as AiMode[]).map((item) => <button className={mode === item ? "active" : ""} type="button" key={item} onClick={() => setMode(item)}><b>{item === "Ask" ? "01" : item === "Analyse" ? "02" : "03"}</b><span>{item}</span><small>{item === "Ask" ? "Find and explain" : item === "Analyse" ? "Diagnose and simulate" : "Prepare controlled work"}</small></button>)}</nav>
        <div className="nx-aiw-composer"><textarea rows={3} value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); ask(query); } }} aria-label="Ask Nexora AI any company-data question" placeholder="Example: Compare supplier prices, analyse overdue customers, explain BOM variance, forecast cash..." /><div><span><b>Context:</b> {context.role} / {context.mode} / September 2026 / mock company data</span><button type="button" onClick={() => ask(query)}>{mode} with Nexora <i>Enter</i></button></div></div>
        <div className="nx-aiw-suggestions">{["Analyse purchase price variance", "Which customers are most overdue?", "Show cash and bank position", "Explain BOM consumption variance", "Analyse stock ageing", "Review project profitability", "Check fleet fuel efficiency", "Show tax exceptions"].map((item) => <button type="button" key={item} onClick={() => ask(item)}>{item}</button>)}</div>
      </section>

      <div className="nx-aiw-command-grid">
        <section className="nx-aiw-answer">
          <header><div><i>N</i><span><strong>{report.title}</strong><small>{report.id} / {report.period} / generated from your question</small></span></div><Confidence value={report.confidence} /></header>
          <div className="nx-aiw-answer__summary"><span>Question interpreted as {report.intent.replaceAll("-", " ")}</span><h3>{report.subtitle}</h3><p>{report.executiveSummary}</p></div>
          <section className="nx-aiw-report-metrics">{report.metrics.map((metric) => <article className={`tone-${metric.tone}`} key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section>
          <section className="nx-aiw-dynamic-chart"><header><span>{report.chartTitle}</span><small><i className="actual" /> Actual <i className="benchmark" /> Benchmark</small></header>{report.chartRows.map((row) => <div key={row.label}><span title={row.label}>{row.label}</span><section><i className="benchmark" style={{ width: `${Math.max(2, (row.benchmark / maxChartValue) * 100)}%` }} /><i className="actual" style={{ width: `${Math.max(2, (row.actual / maxChartValue) * 100)}%` }} /></section><strong>{row.display}</strong></div>)}</section>
          <section className="nx-aiw-answer-table"><header><span>Detailed analysis</span><button type="button" onClick={() => onAction("Export AI report", report.id)}>Export report</button></header><div><table><thead><tr>{report.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{report.rows.map((row, index) => <tr key={`${report.id}-${index}`}>{row.map((cell, cellIndex) => <td key={`${cell}-${cellIndex}`}>{cellIndex === 0 ? <strong>{cell}</strong> : cell}</td>)}</tr>)}</tbody></table></div></section>
          <div className="nx-aiw-evidence"><span>Evidence and source records</span>{report.sources.map((source) => <button type="button" key={source.label} onClick={() => onNavigate(source.moduleId, source.pageId)}>{source.label} <b>{source.reference}</b></button>)}</div>
          <footer><button type="button" onClick={() => onNavigate("ai", "source-confidence")}>Inspect sources</button><button type="button" onClick={() => onNavigate("ai", "explanations")}>Simulate scenario</button><button className="primary" type="button" onClick={() => onAction("Prepare action plan", report.id)}>Prepare action plan</button></footer>
        </section>
        <aside className="nx-aiw-next">
          <span>Key findings</span><h3>What Nexora found</h3>
          <ol>{report.findings.map((finding, index) => <li key={finding.title}><b>{index + 1}</b><div><strong>{finding.title}</strong><small>{finding.detail}</small></div><em>{finding.value}</em></li>)}</ol>
          <section className="nx-aiw-followups"><span>Continue the conversation</span>{report.actions.slice(0, 4).map((action) => <button type="button" key={action} onClick={() => setQuery(`${action} for ${report.title.toLowerCase()}`)}>{action}</button>)}</section>
          <section className="nx-aiw-query-history"><span>Recent questions</span>{history.map((item) => <button type="button" key={item} onClick={() => ask(item)}>{item}</button>)}</section>
          <div className="nx-aiw-guardrail"><b>Protected actions</b><p>Posting, payment release, reversal and period close are never completed autonomously.</p></div>
        </aside>
      </div>

      <section className="nx-aiw-kpis"><article><span>Active role agents</span><strong>14</strong><small>Across all 35 modules</small></article><article><span>Open exceptions</span><strong>27</strong><small>4 require attention today</small></article><article><span>Evidence coverage</span><strong>98.7%</strong><small>Source-linked insights</small></article><article><span>Human decisions</span><strong>100%</strong><small>For controlled actions</small></article></section>
      <div className="nx-aiw-lower">
        <section className="nx-aiw-panel"><header><div><span>Continuous intelligence</span><h2>Exceptions detected before impact</h2></div><button type="button" onClick={() => onNavigate("ai", "suggestion-review")}>Review all</button></header><div className="nx-aiw-exception-list">{exceptions.map((item) => <button type="button" key={item[0]} onClick={() => onAction("Explain risk", item[0])}><i className={`tone-${item[4].toLowerCase()}`} /><span><strong>{item[0]}</strong><small>{item[1]} / {item[2]}</small></span><Confidence value={Number(item[3].replace("%", ""))} /></button>)}</div></section>
        <section className="nx-aiw-panel"><header><div><span>Specialist network</span><h2>Role agents working together</h2></div><button type="button" onClick={() => onNavigate("ai", "ai-automations")}>Agent catalogue</button></header><div className="nx-aiw-agent-mini">{roleAgents.slice(0, 6).map((agent) => <article key={agent[0]}><i>{agent[0].split(" ").map((part) => part[0]).slice(0, 2).join("")}</i><div><strong>{agent[0]}</strong><small>{agent[1]}</small></div><span>{agent[3]}</span></article>)}</div></section>
      </div>
    </div>
  );
}

function SuggestionReview({ context, onAction, onNavigate }: NexoraAiWorkspaceProps) {
  const [selected, setSelected] = useState(0);
  const proposal = proposals[selected];
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Governed actions" title="AI suggestion review" description="Review recommendations, evidence, impact and permissions before any human decision." />
    <section className="nx-aiw-kpis"><article><span>Awaiting review</span><strong>8</strong><small>3 high impact</small></article><article><span>Prepared drafts</span><strong>5</strong><small>No posting impact</small></article><article><span>Acceptance rate</span><strong>84%</strong><small>Last 30 days</small></article><article><span>Average confidence</span><strong>91%</strong><small>Source weighted</small></article></section>
    <div className="nx-aiw-review-layout"><section className="nx-aiw-table-card"><header><h2>Recommendation queue</h2><div><button type="button">Impact</button><button type="button">Agent</button><button type="button">Confidence</button></div></header><table><thead><tr><th>Proposal</th><th>Agent</th><th>Impact</th><th>Confidence</th><th>Status</th></tr></thead><tbody>{proposals.map((row, index) => <tr className={selected === index ? "selected" : ""} key={row[0]} onClick={() => setSelected(index)}><td><strong>{row[0]}</strong><small>{row[1]}</small></td><td>{row[2]}</td><td>{row[3]}</td><td><Confidence value={Number(row[4].replace("%", ""))} /></td><td><span className="nx-aiw-status">{row[5]}</span></td></tr>)}</tbody></table></section>
    <aside className="nx-aiw-review"><span>Selected recommendation</span><h2>{proposal[1]}</h2><p>Nexora detected a material risk, evaluated permitted options and prepared the lowest-risk next step.</p><dl><div><dt>Proposal</dt><dd>{proposal[0]}</dd></div><div><dt>Business impact</dt><dd>{proposal[3]}</dd></div><div><dt>Confidence</dt><dd>{proposal[4]}</dd></div><div><dt>Permission</dt><dd>Prepare only</dd></div></dl><section><b>Why this is recommended</b><ul><li>Policy and role scope validated</li><li>Source documents are current</li><li>No conflicting workflow detected</li></ul></section><button type="button" onClick={() => onNavigate("ai", "source-confidence")}>Inspect evidence chain</button><div><button type="button" onClick={() => onAction("Reject AI recommendation", proposal[0])}>Reject</button><button type="button" onClick={() => onAction("Edit AI recommendation", proposal[0])}>Edit</button><button className="primary" type="button" onClick={() => onAction("Accept AI recommendation", proposal[0])}>Accept & prepare</button></div></aside></div>
  </div>;
}

function ExtractionReview({ context, onAction }: NexoraAiWorkspaceProps) {
  const [field, setField] = useState(7);
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Document intelligence" title="Extract, validate and prepare" description="Convert business documents into reviewable ERP drafts with field-level confidence and control checks."><button type="button" onClick={() => onAction("Upload document", "Document extraction")}>Upload document</button></AiPageHeader>
    <div className="nx-aiw-document"><section className="nx-aiw-document__preview"><header><span>Supplier invoice</span><b>MIS-INV-90881.pdf</b><small>2 pages / scanned 16 Sep 2026</small></header><div className="nx-aiw-paper"><div className="logo">MEKTRON</div><h3>TAX INVOICE</h3><p>Invoice: MIS-INV-90881</p><p>Purchase order: PO-2026-01842</p><hr /><div className="lines"><span>Servo drive assemblies</span><b>PKR 1,420,000</b><span>Sales tax</span><b>PKR 255,600</b><span>Total</span><b>PKR 1,675,600</b></div><mark className={`mark mark-${field}`}>Selected field</mark></div><footer><button type="button">-</button><span>Page 1 of 2 / 110%</span><button type="button">+</button></footer></section>
    <section className="nx-aiw-document__fields"><header><div><span>Extracted fields</span><h2>Review before creating a draft</h2></div><Confidence value={96} /></header><div>{extractionFields.map((item, index) => <button className={field === index ? "selected" : ""} type="button" key={item[0]} onClick={() => setField(index)}><span>{item[0]}</span><strong>{item[1]}</strong><em>{item[2]}</em></button>)}</div><section className="nx-aiw-validation"><h3>Validation and matching</h3><p className="pass"><b>Pass</b> Supplier tax profile matched</p><p className="pass"><b>Pass</b> Purchase order found</p><p className="warn"><b>Review</b> Payment terms confidence below 90%</p><p className="warn"><b>Review</b> Quantity differs from goods receipt by 2 units</p></section><footer><button type="button" onClick={() => onAction("Reject extraction", "MIS-INV-90881")}>Reject</button><button type="button" onClick={() => onAction("Save extraction", "MIS-INV-90881")}>Save review</button><button className="primary" type="button" onClick={() => onAction("Prepare purchase bill draft", "MIS-INV-90881")}>Prepare draft bill</button></footer></section></div>
  </div>;
}

function ScenarioLab({ context, onAction, onNavigate }: NexoraAiWorkspaceProps) {
  const [material, setMaterial] = useState(8);
  const [delay, setDelay] = useState(18);
  const [utilisation, setUtilisation] = useState(74);
  const impact = useMemo(() => (material * 0.19 + delay * 0.07 + Math.max(0, 82 - utilisation) * 0.11).toFixed(1), [material, delay, utilisation]);
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Prediction and simulation" title="Scenario intelligence lab" description="Test business assumptions safely without changing a transaction, forecast or ledger."><button type="button" onClick={() => onAction("Save scenario", "Margin resilience scenario")}>Save scenario</button></AiPageHeader>
    <div className="nx-aiw-scenario"><section className="nx-aiw-scenario__inputs"><header><span>Scenario SCN-00642</span><h2>Margin resilience</h2><small>Baseline: approved September forecast</small></header><label><span>Material cost increase <b>{material}%</b></span><input type="range" min="0" max="20" value={material} onChange={(e) => setMaterial(Number(e.target.value))} /></label><label><span>Largest customer payment delay <b>{delay} days</b></span><input type="range" min="0" max="60" value={delay} onChange={(e) => setDelay(Number(e.target.value))} /></label><label><span>Service utilisation <b>{utilisation}%</b></span><input type="range" min="55" max="95" value={utilisation} onChange={(e) => setUtilisation(Number(e.target.value))} /></label><div className="nx-aiw-scenario__safe"><b>Safe simulation</b><p>No data, transaction, budget or forecast is written back.</p></div><button className="primary" type="button" onClick={() => onAction("Run simulation", "SCN-00642")}>Run simulation</button></section>
    <section className="nx-aiw-scenario__result"><header><div><span>Projected impact</span><h2>Operating margin pressure</h2></div><strong>-{impact} pts</strong></header><div className="nx-aiw-forecast-chart"><div className="axis"><span>24%</span><span>18%</span><span>12%</span><span>6%</span></div><div className="plot">{[68,71,75,78,76,73,69,66,62,58,55,51].map((h,i) => <i key={i} style={{ height: `${h}%` }}><b /></i>)}</div><footer>{["Oct","Nov","Dec","Jan","Feb","Mar"].map(x => <span key={x}>{x}</span>)}</footer></div><div className="nx-aiw-scenario__cards"><article><span>Cash minimum</span><strong>PKR 18.4M</strong><small>PKR 5.6M below baseline</small></article><article><span>Gross margin</span><strong>{(31.8 - Number(impact)).toFixed(1)}%</strong><small>Scenario projection</small></article><article><span>Confidence range</span><strong>87-93%</strong><small>Based on 24 months</small></article></div><div className="nx-aiw-mitigations"><span>Recommended mitigations</span><button type="button" onClick={() => onNavigate("purchases", "bid-comparison")}>Renegotiate top material variance <b>+0.8 pts</b></button><button type="button" onClick={() => onNavigate("customers", "collections-workbench")}>Accelerate three collections <b>+PKR 3.1M cash</b></button><button type="button" onClick={() => onAction("Prepare mitigation plan", "SCN-00642")}>Prepare governed action plan <b>Draft only</b></button></div></section></div>
  </div>;
}

function HumanHandoff({ context, onAction }: NexoraAiWorkspaceProps) {
  const lifecycle = ["Ask", "Explain", "Simulate", "Prepare", "Approve", "Execute", "Verify"];
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Human control" title="Approval and execution handoff" description="Separate AI recommendations from human authority, execution and independent verification." />
    <section className="nx-aiw-lifecycle">{lifecycle.map((item,index) => <article className={index < 4 ? "complete" : index === 4 ? "current" : "locked"} key={item}><i>{index < 4 ? "OK" : index + 1}</i><strong>{item}</strong><small>{index < 4 ? "Completed" : index === 4 ? "Your decision" : "Controlled"}</small></article>)}</section>
    <div className="nx-aiw-handoff"><section><header><span>Approval package</span><h2>Place suspected duplicate invoice on payment hold</h2><small>AI-PRP-0258 / AP Payments Agent</small></header><div className="nx-aiw-handoff__impact"><article><span>Protected value</span><strong>PKR 842,500</strong></article><article><span>Confidence</span><strong>96%</strong></article><article><span>Control</span><strong>Maker-checker</strong></article></div><h3>Decision evidence</h3><ul><li><b>Source match</b><span>Invoice number, supplier, amount and date match an existing bill.</span></li><li><b>Policy outcome</b><span>Duplicate score exceeds the 90% mandatory-hold threshold.</span></li><li><b>Impact preview</b><span>Payment run excludes one line; no accounting entry changes.</span></li><li><b>Rollback</b><span>Authorised AP manager can remove the hold with a reason.</span></li></ul><footer><button type="button" onClick={() => onAction("Return AI proposal", "AI-PRP-0258")}>Return for review</button><button type="button" onClick={() => onAction("Reject AI proposal", "AI-PRP-0258")}>Reject</button><button className="primary" type="button" onClick={() => onAction("Approve AI proposal", "AI-PRP-0258")}>Approve controlled action</button></footer></section><aside><span>Segregation of duties</span><h3>Authority check passed</h3><dl><div><dt>AI agent</dt><dd>Prepared recommendation</dd></div><div><dt>Document owner</dt><dd>finance.user</dd></div><div><dt>Approver</dt><dd>{context.role}</dd></div><div><dt>Executor</dt><dd>AP payment service</dd></div><div><dt>Verifier</dt><dd>Independent control rule</dd></div></dl><p><b>AI cannot approve its own work.</b> All decisions, comments and resulting actions are retained in the audit trail.</p></aside></div>
  </div>;
}

function AutomationCatalogue({ context, onAction }: NexoraAiWorkspaceProps) {
  const [filter, setFilter] = useState("All");
  const visible = roleAgents.filter((agent) => filter === "All" || agent[2] === filter);
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Agentic ERP" title="Specialist agent catalogue" description="Role-scoped agents monitor, explain and prepare work across Finance, Operations, Commercial and Governance." />
    <nav className="nx-aiw-filter">{["All","finance","commercial","operations","people","governance","executive"].map(item => <button type="button" className={filter === item ? "active" : ""} key={item} onClick={() => setFilter(item)}>{item}</button>)}</nav>
    <section className="nx-aiw-agent-grid">{visible.map((agent,index) => <article key={agent[0]}><header><i>{String(index+1).padStart(2,"0")}</i><span className="nx-aiw-live"><b /> {agent[3]}</span></header><h2>{agent[0]}</h2><p>{agent[1]}</p><dl><div><dt>Permission</dt><dd>{index % 3 === 0 ? "Recommend" : "Prepare"}</dd></div><div><dt>Last run</dt><dd>{index+2} min ago</dd></div><div><dt>Success</dt><dd>{96-index%4}%</dd></div></dl><footer><button type="button" onClick={() => onAction("Open agent activity", agent[0])}>Activity</button><button className="primary" type="button" onClick={() => onAction("Configure agent", agent[0])}>Configure</button></footer></article>)}</section>
  </div>;
}

function PolicyCentre({ context, onAction }: NexoraAiWorkspaceProps) {
  const levels: { name: PermissionLevel; detail: string; state: string }[] = [
    { name: "Read", detail: "Search, retrieve and explain permitted ERP information.", state: "Enabled" },
    { name: "Recommend", detail: "Create evidence-backed suggestions and risk alerts.", state: "Enabled" },
    { name: "Prepare", detail: "Build a draft transaction or action package for review.", state: "Controlled" },
    { name: "Execute", detail: "Invoke approved business actions within explicit authority.", state: "Restricted" },
  ];
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="AI control centre" title="Models, policy and execution boundaries" description="Define what Nexora AI may read, recommend, prepare and execute for each role and process."><button type="button" onClick={() => onAction("Save AI policy", "Enterprise default")}>Save policy draft</button></AiPageHeader>
    <section className="nx-aiw-policy-levels">{levels.map((level,index) => <article key={level.name}><i>{index+1}</i><span><strong>{level.name}</strong><small>{level.detail}</small></span><b className={`state-${level.state.toLowerCase()}`}>{level.state}</b></article>)}</section>
    <div className="nx-aiw-policy-grid"><section className="nx-aiw-panel"><header><div><span>Mandatory guardrails</span><h2>Protected ERP actions</h2></div></header><div className="nx-aiw-restrictions">{[["Post journals","Human approval + posting authority"],["Release payments","Dual approval + bank control"],["Reverse transactions","Reason + period control"],["Change bank details","Independent verification"],["Modify credit limits","Commercial approval matrix"],["Close financial periods","CFO authority + readiness checks"]].map(item => <div key={item[0]}><span><strong>{item[0]}</strong><small>{item[1]}</small></span><b>Never autonomous</b></div>)}</div></section>
    <section className="nx-aiw-panel"><header><div><span>Policy configuration</span><h2>Enterprise default</h2></div><span className="nx-aiw-status">Version 3.2</span></header><div className="nx-aiw-settings">{[["Require source citations",true],["Display confidence and assumptions",true],["Require confirmation before draft creation",true],["Permit direct execution",false],["Retain prompt and response audit",true],["Allow cross-company retrieval",false]].map(([label,checked]) => <div key={String(label)}><span><strong>{label}</strong><small>{checked ? "Enforced for all enabled agents" : "Disabled by enterprise policy"}</small></span><input aria-label={String(label)} type="checkbox" defaultChecked={Boolean(checked)} /></div>)}</div></section></div>
    <section className="nx-aiw-model-health"><article><span>Model gateway</span><strong>Healthy</strong><small>Latency 1.2 seconds</small></article><article><span>Grounding index</span><strong>98.7%</strong><small>Source coverage</small></article><article><span>PII protection</span><strong>Active</strong><small>7 rules enforced</small></article><article><span>Prompt defence</span><strong>Active</strong><small>0 blocked today</small></article><article><span>Audit retention</span><strong>7 years</strong><small>Policy controlled</small></article></section>
  </div>;
}

function SourceConfidence({ context, onNavigate }: NexoraAiWorkspaceProps) {
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Explainable intelligence" title="Source, confidence and lineage" description="Understand exactly which records support an answer, how current they are and why confidence was assigned." />
    <div className="nx-aiw-source-layout"><section className="nx-aiw-source-graph"><header><span>Evidence chain</span><h2>Gross margin explanation</h2><Confidence value={94} /></header><div className="nx-aiw-source-flow"><article className="answer"><i>N</i><strong>AI conclusion</strong><small>Margin -2.8 pts vs plan</small></article><b /><div>{[["Financial report","P&L by business unit","Verified"],["Production orders","MO-00418 + 6 records","Current"],["Sales documents","2 discounted orders","Current"],["Purchase history","12 price points","Verified"]].map((x,i)=><button type="button" key={x[0]} onClick={() => onNavigate(i === 1 ? "manufacturing" : i === 2 ? "sales" : "reports", i === 1 ? "production-variance" : i === 2 ? "sales-orders" : "drilldown-explorer")}><i>{i+1}</i><span><strong>{x[0]}</strong><small>{x[1]}</small></span><em>{x[2]}</em></button>)}</div></div></section>
    <aside className="nx-aiw-confidence-card"><span>Confidence composition</span><h2>Why 94%?</h2>{[["Source completeness",98],["Record freshness",96],["Cross-source agreement",93],["Historical fit",89],["Policy compliance",100]].map(item => <div key={item[0]}><p><span>{item[0]}</span><b>{item[1]}%</b></p><i><b style={{width:`${item[1]}%`}} /></i></div>)}<section><b>Assumptions</b><p>Posted records through 31 Aug 2026; PKR presentation currency; approved September budget baseline.</p></section><section><b>Limitations</b><p>Prototype values are illustrative. No live ledger or production transaction is queried.</p></section></aside></div>
    <section className="nx-aiw-lineage-table"><header><h2>Source register</h2><button type="button">Export evidence</button></header><table><thead><tr><th>Source</th><th>Owner</th><th>As of</th><th>Records</th><th>Reconciled</th><th>Access</th></tr></thead><tbody>{[["Management P&L","Finance","31 Aug, 10:30","1 report","Yes","Role scoped"],["Production variance","Manufacturing","31 Aug, 09:55","7 orders","Yes","Role scoped"],["Sales discount analysis","Sales","31 Aug, 10:12","2 orders","Yes","Summary only"],["Purchase price history","Procurement","30 Aug, 18:40","12 prices","Yes","Role scoped"]].map(row=><tr key={row[0]}>{row.map((cell,i)=><td key={cell}>{i===0?<strong>{cell}</strong>:cell}</td>)}</tr>)}</tbody></table></section>
  </div>;
}

function EvaluationFeedback({ context, onAction }: NexoraAiWorkspaceProps) {
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Responsible AI operations" title="Evaluation and human feedback" description="Measure accuracy, usefulness, control compliance and business outcomes for every specialist agent." />
    <section className="nx-aiw-kpis"><article><span>Answer quality</span><strong>94.6%</strong><small>+1.8% this month</small></article><article><span>Human acceptance</span><strong>84.2%</strong><small>1,248 decisions</small></article><article><span>Grounded answers</span><strong>98.7%</strong><small>Sources attached</small></article><article><span>Unsafe actions</span><strong>0</strong><small>Mandatory controls passed</small></article></section>
    <div className="nx-aiw-eval-grid"><section className="nx-aiw-panel"><header><div><span>Evaluation suite</span><h2>Production-quality test coverage</h2></div><button type="button" onClick={() => onAction("Run AI evaluation", "Enterprise suite")}>Run suite</button></header>{[["Finance factual accuracy",98,"842 / 860 passed"],["Source citation validity",99,"1,202 / 1,214 passed"],["Permission boundary",100,"420 / 420 passed"],["Calculation consistency",97,"388 / 400 passed"],["Adversarial prompt defence",100,"180 / 180 passed"]].map(item=><div className="nx-aiw-eval-row" key={item[0]}><span><strong>{item[0]}</strong><small>{item[2]}</small></span><Confidence value={Number(item[1])} /></div>)}</section>
    <section className="nx-aiw-panel"><header><div><span>Recent feedback</span><h2>Human judgement loop</h2></div></header>{[["Useful","Cash explanation correctly linked bank items","CFO Close"],["Corrected","Supplier lead-time assumption updated","Procurement"],["Useful","BOM variance root cause confirmed","Manufacturing"],["Rejected","Suggested collection tone was too strong","AR Collections"]].map(item=><article className="nx-aiw-feedback" key={item[1]}><i className={item[0].toLowerCase()}>{item[0]==="Useful"?"+":item[0]==="Rejected"?"-":"~"}</i><span><strong>{item[1]}</strong><small>{item[2]} / reviewed by authorised user</small></span><b>{item[0]}</b></article>)}</section></div>
  </div>;
}

function AiAudit({ context }: NexoraAiWorkspaceProps) {
  return <div className="nx-aiw"><AiPageHeader context={context} eyebrow="Immutable-looking prototype evidence" title="AI activity, decisions and usage" description="Trace every prompt, source, recommendation, human decision and resulting controlled action." />
    <section className="nx-aiw-kpis"><article><span>Interactions today</span><strong>1,284</strong><small>Across 14 agents</small></article><article><span>Prepared actions</span><strong>42</strong><small>31 approved / 11 pending</small></article><article><span>Policy blocks</span><strong>7</strong><small>All prevented safely</small></article><article><span>Average latency</span><strong>1.2s</strong><small>Within service target</small></article></section>
    <section className="nx-aiw-audit"><header><div><label><span>Search activity</span><input placeholder="User, agent, record or action" /></label><label><span>Agent</span><select><option>All agents</option><option>CFO Close</option><option>AP Payments</option><option>Manufacturing</option></select></label><label><span>Decision</span><select><option>All decisions</option><option>Accepted</option><option>Rejected</option><option>Policy blocked</option></select></label></div><button type="button">Export audit</button></header><table><thead><tr><th>Date and time</th><th>User</th><th>Agent</th><th>Event</th><th>Reference</th><th>Outcome</th></tr></thead><tbody>{auditRows.map(row=><tr key={row[4]}>{row.map((cell,i)=><td key={cell}>{i===3?<strong>{cell}</strong>:i===5?<span className="nx-aiw-status">{cell}</span>:cell}</td>)}</tr>)}</tbody></table><footer><span>Showing 4 of 1,284 activity records</span><div><button type="button">Previous</button><button type="button">1</button><button type="button">2</button><button type="button">Next</button></div></footer></section>
  </div>;
}

export function NexoraAiWorkspace(props: NexoraAiWorkspaceProps) {
  switch (props.context.pageId) {
    case "ai-assistant": return <CommandCentre {...props} />;
    case "suggestion-review": return <SuggestionReview {...props} />;
    case "extraction-review": return <ExtractionReview {...props} />;
    case "explanations": return <ScenarioLab {...props} />;
    case "human-handoff": return <HumanHandoff {...props} />;
    case "ai-automations": return <AutomationCatalogue {...props} />;
    case "ai-policy": return <PolicyCentre {...props} />;
    case "source-confidence": return <SourceConfidence {...props} />;
    case "ai-feedback": return <EvaluationFeedback {...props} />;
    case "ai-audit": return <AiAudit {...props} />;
    default: return <CommandCentre {...props} />;
  }
}
