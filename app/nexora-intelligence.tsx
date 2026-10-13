"use client";

import { useEffect, useMemo, useState } from "react";
import { analyseCompanyQuestion, type AiAnalysisResult } from "./nexora-ai-engine";

export type IntelligenceSurface =
  | { kind: "work" }
  | { kind: "assistant" }
  | { kind: "explain"; subject: string }
  | null;

interface IntelligenceProps {
  surface: IntelligenceSurface;
  roleId: string;
  roleLabel: string;
  companyName: string;
  moduleLabel: string;
  pageLabel: string;
  onClose: () => void;
  onNavigate: (moduleId: string, pageId: string) => void;
  onAction: (action: string, subject?: string) => void;
}

interface WorkItem {
  id: string;
  type: "Approval" | "Exception" | "Task" | "Insight";
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  detail: string;
  metric: string;
  due: string;
  moduleId: string;
  pageId: string;
}

const roleWork: Record<string, { brief: string; focus: string; items: WorkItem[] }> = {
  executive: {
    brief: "Margin pressure and working-capital risk need attention before today’s leadership review.",
    focus: "Enterprise value & risk",
    items: [
      { id: "ex-1", type: "Exception", severity: "critical", title: "Service margin below threshold", detail: "One strategic project is 4.3 points below approved margin.", metric: "PKR 12.8M exposure", due: "Due today", moduleId: "projects", pageId: "project-dashboard" },
      { id: "ex-2", type: "Approval", severity: "high", title: "Capital purchase requires decision", detail: "Production line upgrade passed finance and procurement review.", metric: "PKR 8.4M", due: "2 hours left", moduleId: "approvals", pageId: "my-approvals" },
      { id: "ex-3", type: "Insight", severity: "medium", title: "Collections could improve cash position", detail: "Three customers account for most overdue receivables.", metric: "PKR 6.2M", due: "Review this week", moduleId: "customers", pageId: "ar-ageing" },
      { id: "ex-4", type: "Task", severity: "low", title: "Monthly operating review", detail: "Executive scorecard and variance narrative are ready.", metric: "12 measures", due: "Tomorrow", moduleId: "reports", pageId: "analytics-dashboard" },
    ],
  },
  finance: {
    brief: "Bank reconciliation and a blocked supplier bill are the fastest opportunities to improve close readiness.",
    focus: "Cash, close & control",
    items: [
      { id: "fi-1", type: "Exception", severity: "critical", title: "Bank items remain unreconciled", detail: "Four movements need matching before the period can close.", metric: "PKR 724K", due: "Due today", moduleId: "banking", pageId: "bank-reconciliation" },
      { id: "fi-2", type: "Exception", severity: "high", title: "Supplier bill failed 3-way match", detail: "Receipt quantity and invoiced quantity differ.", metric: "PKR 32.6K", due: "3 hours left", moduleId: "purchases", pageId: "match-exceptions" },
      { id: "fi-3", type: "Approval", severity: "medium", title: "Journal batch awaiting approval", detail: "Recurring accrual batch passed validation.", metric: "18 journals", due: "Today", moduleId: "finance", pageId: "journal-register" },
      { id: "fi-4", type: "Task", severity: "low", title: "Review tax validation queue", detail: "FBR and withholding profiles are ready for review.", metric: "7 documents", due: "Tomorrow", moduleId: "tax", pageId: "tax-exceptions" },
    ],
  },
  sales: {
    brief: "A credit hold is blocking the highest-value order while two quotations are close to expiry.",
    focus: "Revenue, margin & conversion",
    items: [
      { id: "sa-1", type: "Exception", severity: "critical", title: "Sales order blocked by credit limit", detail: "Customer exposure exceeds the approved limit.", metric: "PKR 4.7M", due: "Due today", moduleId: "sales", pageId: "sales-orders" },
      { id: "sa-2", type: "Insight", severity: "high", title: "High-value quotations nearing expiry", detail: "Two proposals have no scheduled follow-up.", metric: "PKR 9.1M pipeline", due: "6 hours left", moduleId: "sales", pageId: "quotations" },
      { id: "sa-3", type: "Approval", severity: "medium", title: "Margin exception needs approval", detail: "Discount moves one line below the configured floor.", metric: "17.8% margin", due: "Today", moduleId: "approvals", pageId: "my-approvals" },
      { id: "sa-4", type: "Task", severity: "low", title: "Review overdue customer balances", detail: "Prioritised collection list is ready.", metric: "8 customers", due: "Tomorrow", moduleId: "customers", pageId: "ar-ageing" },
    ],
  },
  purchasing: {
    brief: "Resolve the quality-held receipt first; it is blocking both supplier payment and material availability.",
    focus: "Supply, price & commitment",
    items: [
      { id: "pu-1", type: "Exception", severity: "critical", title: "Quality hold blocks purchase bill", detail: "GRN disposition is missing for a matched invoice.", metric: "PKR 3.2M", due: "Due today", moduleId: "purchases", pageId: "match-exceptions" },
      { id: "pu-2", type: "Approval", severity: "high", title: "Purchase order above authority", detail: "Commercial comparison is complete and budget is available.", metric: "PKR 6.8M", due: "4 hours left", moduleId: "approvals", pageId: "my-approvals" },
      { id: "pu-3", type: "Insight", severity: "medium", title: "Supplier price increased", detail: "Latest quotation is 8.7% above the previous purchase.", metric: "+8.7%", due: "Before award", moduleId: "purchases", pageId: "bid-comparison" },
      { id: "pu-4", type: "Task", severity: "low", title: "Three requisitions ready for sourcing", detail: "Budget and manager approvals are complete.", metric: "3 PRs", due: "Tomorrow", moduleId: "purchases", pageId: "purchase-requisitions" },
    ],
  },
  production: {
    brief: "One material shortage threatens tomorrow’s schedule; an alternate source is available for review.",
    focus: "Output, capacity & variance",
    items: [
      { id: "pr-1", type: "Exception", severity: "critical", title: "Material shortage affects work order", detail: "Servo drive stock is below the released requirement.", metric: "180 units short", due: "Due today", moduleId: "manufacturing", pageId: "material-requirements" },
      { id: "pr-2", type: "Insight", severity: "high", title: "Capacity overload on assembly line", detail: "Planned load exceeds available hours on Thursday.", metric: "112% load", due: "Plan today", moduleId: "manufacturing", pageId: "capacity-planner" },
      { id: "pr-3", type: "Approval", severity: "medium", title: "Rework request awaiting decision", detail: "Quality review and estimated cost are attached.", metric: "PKR 186K", due: "Today", moduleId: "approvals", pageId: "my-approvals" },
      { id: "pr-4", type: "Task", severity: "low", title: "Review production variance", detail: "Material and labour drivers are ready.", metric: "2.8% adverse", due: "Tomorrow", moduleId: "manufacturing", pageId: "production-variance" },
    ],
  },
  people: {
    brief: "Payroll is nearly ready, but attendance and statutory validation exceptions must be cleared first.",
    focus: "People, payroll & compliance",
    items: [
      { id: "hr-1", type: "Exception", severity: "critical", title: "Payroll validation exceptions", detail: "Attendance and deduction data are incomplete.", metric: "13 employees", due: "Due today", moduleId: "hr", pageId: "payroll-validation" },
      { id: "hr-2", type: "Approval", severity: "high", title: "Leave requests need coverage review", detail: "Two requests overlap in the same delivery team.", metric: "5 requests", due: "3 hours left", moduleId: "approvals", pageId: "my-approvals" },
      { id: "hr-3", type: "Insight", severity: "medium", title: "Turnover risk increased", detail: "A critical skill group shows a rising absence pattern.", metric: "3 people", due: "This week", moduleId: "hr", pageId: "hr-dashboard" },
      { id: "hr-4", type: "Task", severity: "low", title: "Complete new-joiner setup", detail: "Bank and statutory information remains incomplete.", metric: "4 profiles", due: "Tomorrow", moduleId: "hr", pageId: "onboarding" },
    ],
  },
};

function lensFor(roleId: string) {
  if (/chief-executive/.test(roleId)) return roleWork.executive;
  if (/sales/.test(roleId)) return roleWork.sales;
  if (/purchase|procurement/.test(roleId)) return roleWork.purchasing;
  if (/production|warehouse|inventory/.test(roleId)) return roleWork.production;
  if (/hr|people/.test(roleId)) return roleWork.people;
  return roleWork.finance;
}

function WorkSurface({ roleId, roleLabel, companyName, onNavigate, onAction }: Pick<IntelligenceProps, "roleId" | "roleLabel" | "companyName" | "onNavigate" | "onAction">) {
  const lens = lensFor(roleId);
  const [tab, setTab] = useState<"All" | WorkItem["type"]>("All");
  const [severity, setSeverity] = useState("all");
  const visible = lens.items.filter((item) => (tab === "All" || item.type === tab) && (severity === "all" || item.severity === severity));

  return (
    <div className="nx-intelligence-work">
      <section className="nx-intelligence-work__hero">
        <div><span className="nx-ai-kicker">Nexora My Work · {roleLabel}</span><h2>Your business day, already prioritised.</h2><p>{lens.brief}</p><div className="nx-ai-trust"><span>Role-scoped</span><span>Explainable</span><span>Human approved</span></div></div>
        <div className="nx-work-score"><span>Readiness score</span><strong>82</strong><small>6 points available today</small><i><b style={{ width: "82%" }} /></i></div>
      </section>
      <section className="nx-work-metrics">
        <article><span>Priority actions</span><strong>{lens.items.length}</strong><small>Ordered by business impact</small></article>
        <article><span>At-risk value</span><strong>PKR 12.4M</strong><small>Illustrative exposure</small></article>
        <article><span>Approvals</span><strong>{lens.items.filter((item) => item.type === "Approval").length}</strong><small>Within your authority</small></article>
        <article><span>Role focus</span><strong>{lens.focus}</strong><small>{companyName}</small></article>
      </section>
      <div className="nx-work-layout">
        <div className="nx-work-queue">
          <header><div><span>Decision queue</span><h3>What needs you now</h3></div><select aria-label="Filter work by severity" value={severity} onChange={(event) => setSeverity(event.target.value)}><option value="all">All severity</option><option value="critical">Critical</option><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></header>
          <nav aria-label="Work queue categories">{(["All", "Approval", "Exception", "Task", "Insight"] as const).map((item) => <button className={tab === item ? "active" : ""} key={item} type="button" onClick={() => setTab(item)}>{item}</button>)}</nav>
          <div className="nx-work-items">
            {visible.map((item) => <article key={item.id}><i className={`nx-work-severity nx-work-severity--${item.severity}`} /><div><span>{item.type} · {item.due}</span><strong>{item.title}</strong><p>{item.detail}</p><small>{item.metric}</small></div><div><button type="button" onClick={() => onAction("Explain number", `${item.title}|${item.metric}|Priority ${item.severity}|Role work queue`)}>Explain</button><button className="primary" type="button" onClick={() => onNavigate(item.moduleId, item.pageId)}>Review →</button></div></article>)}
          </div>
        </div>
        <aside className="nx-work-aside">
          <section><span>Daily brief</span><h3>Recommended sequence</h3><ol><li><b>1</b><p><strong>Clear the critical blocker</strong><small>It affects the largest downstream value.</small></p></li><li><b>2</b><p><strong>Complete approval decisions</strong><small>Two workflows can move today.</small></p></li><li><b>3</b><p><strong>Review predictive insight</strong><small>Prevent tomorrow’s exception.</small></p></li></ol></section>
          <section><span>Intelligent quick entry</span><h3>Start without navigation</h3><button type="button" onClick={() => onAction("Create new", "Role-relevant transaction")}>＋ Create transaction <kbd>N</kbd></button><button type="button" onClick={() => onAction("Add journal", "Quick entry")}>＋ Journal quick entry <kbd>J</kbd></button><button type="button" onClick={() => onAction("Save view", "My Work")}>◇ Save this work view</button></section>
        </aside>
      </div>
    </div>
  );
}

function AssistantSurface({ roleLabel, moduleLabel, pageLabel, onNavigate, onAction }: Pick<IntelligenceProps, "roleLabel" | "moduleLabel" | "pageLabel" | "onNavigate" | "onAction">) {
  const prompts = ["Analyse purchase price variance", "Which customers are most overdue?", "Show cash and bank position", "Explain production variance"];
  const [mode, setMode] = useState<"Ask" | "Analyse" | "Act">("Ask");
  const [query, setQuery] = useState("");
  const [conversation, setConversation] = useState<{ query: string; report: AiAnalysisResult } | null>(null);
  const ask = (value: string) => {
    const prompt = value.trim();
    if (!prompt) return;
    setConversation({ query: prompt, report: analyseCompanyQuestion(prompt, { roleLabel, moduleLabel, pageLabel }) });
    setQuery("");
  };
  return (
    <div className="nx-assistant">
      <section className="nx-assistant__context"><div><span>Current context</span><strong>{moduleLabel} · {pageLabel}</strong><small>{roleLabel} permission lens</small></div><div className="nx-ai-trust"><span>Sources shown</span><span>No autonomous posting</span><span>Audit ready</span></div></section>
      <nav className="nx-assistant__modes" aria-label="Nexora AI mode">{(["Ask", "Analyse", "Act"] as const).map((item) => <button className={mode === item ? "active" : ""} type="button" key={item} onClick={() => setMode(item)}><strong>{item}</strong><small>{item === "Ask" ? "Find and explain" : item === "Analyse" ? "Diagnose and simulate" : "Prepare governed work"}</small></button>)}</nav>
      <div className="nx-assistant__conversation">
        <article className="nx-assistant__message nx-assistant__message--ai"><i>N</i><div><strong>Nexora Intelligence</strong><p>I understand the page, your role and the connected business workflow. Use Ask, Analyse or Act to move from evidence to a controlled human decision.</p></div></article>
        {conversation ? <><article className="nx-assistant__message nx-assistant__message--user"><i>You</i><div><strong>{roleLabel}</strong><p>{conversation.query}</p></div></article><article className="nx-assistant__message nx-assistant__message--ai"><i>N</i><div><header className="nx-assistant__answer-head"><span><strong>{conversation.report.title}</strong><small>{conversation.report.period} · {conversation.report.id}</small></span><em>{conversation.report.confidence}% confidence</em></header><p>{conversation.report.executiveSummary}</p><section className="nx-assistant__mini-metrics">{conversation.report.metrics.slice(0, 3).map((metric) => <article key={metric.label}><span>{metric.label}</span><strong>{metric.value}</strong><small>{metric.detail}</small></article>)}</section><section className="nx-assistant__reasoning"><span>Key findings</span><ol>{conversation.report.findings.slice(0, 3).map((finding) => <li key={finding.title}><b>{finding.title}:</b> {finding.value}</li>)}</ol></section><section className="nx-assistant__evidence"><span>Evidence used</span>{conversation.report.sources.map((source) => <button type="button" key={source.label} onClick={() => onNavigate(source.moduleId, source.pageId)}>{source.label} · {source.reference}</button>)}<button type="button" onClick={() => onNavigate("ai", "source-confidence")}>Open complete source and confidence chain</button></section><section className="nx-assistant__actions"><span>Governed actions</span><div><button type="button" onClick={() => onNavigate("ai", "ai-assistant")}>Open full report</button><button type="button" onClick={() => onAction("Export AI report", conversation.report.id)}>Export</button><button className="primary" type="button" onClick={() => onAction("Prepare AI action", conversation.report.id)}>Prepare action</button></div><small>Read / Recommend / Prepare. Execution remains permission controlled.</small></section></div></article></> : null}
      </div>
      <section className="nx-assistant__prompts"><span>Try a guided command</span><div>{prompts.map((prompt) => <button key={prompt} type="button" onClick={() => ask(prompt)}>{prompt}</button>)}</div></section>
      <form className="nx-assistant__composer" onSubmit={(event) => { event.preventDefault(); ask(query); }}><textarea aria-label="Ask Nexora Intelligence" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`${mode} about a number, exception, document or next action…`} rows={3} /><div><span>Mock response · source-linked · human controlled</span><button type="submit">{mode} with Nexora ↗</button></div></form>
    </div>
  );
}

function ExplainSurface({ subject, roleLabel, onNavigate }: { subject: string; roleLabel: string; onNavigate: IntelligenceProps["onNavigate"] }) {
  const [label = "Business measure", value = "Current value", delta = "Current movement", comparison = "Selected period"] = subject.split("|");
  return (
    <div className="nx-explain">
      <section className="nx-explain__hero"><span className="nx-ai-kicker">Explain this number</span><h2>{label}</h2><strong>{value}</strong><p><b>{delta}</b> · {comparison}</p><div className="nx-ai-trust"><span>As of 31 Aug 2026</span><span>{roleLabel} scope</span><span>Mock evidence</span></div></section>
      <section className="nx-explain__summary"><i>N</i><div><span>Plain-language explanation</span><p>The illustrated movement is primarily driven by the highest-value operating variance, followed by timing differences. Each driver below can be traced to its source workspace before a decision is made.</p></div></section>
      <section className="nx-explain__drivers"><header><span>Driver bridge</span><h3>What changed the result</h3></header>{[["Operating performance", 74, "Primary driver"], ["Timing and cut-off", 46, "Review at close"], ["Price / rate variance", 31, "Within tolerance"], ["Currency effect", 18, "Monitor"]].map(([name, width, note]) => <article key={name}><div><strong>{name}</strong><span>{note}</span></div><i><b style={{ width: `${width}%` }} /></i><em>{width}%</em></article>)}</section>
      <section className="nx-explain__lineage"><header><span>Evidence chain</span><h3>From result to source</h3></header><ol><li><b>1</b><div><strong>Displayed KPI</strong><small>{label} · current role dashboard</small></div><span>Visible</span></li><li><b>2</b><div><strong>Management report</strong><small>Filtered by company, period and role scope</small></div><button type="button" onClick={() => onNavigate("reports", "drilldown-explorer")}>Open</button></li><li><b>3</b><div><strong>Source transactions</strong><small>Posting, document and master-data evidence</small></div><button type="button" onClick={() => onNavigate("audit", "transaction-history")}>Trace</button></li></ol></section>
      <section className="nx-explain__controls"><article><span>Reconciled</span><strong>Source coverage complete</strong><small>Prototype control result</small></article><article><span>Freshness</span><strong>31 Aug · 10:30 PKT</strong><small>Visible data timestamp</small></article><article><span>Access</span><strong>{roleLabel}</strong><small>Permission-filtered explanation</small></article></section>
    </div>
  );
}

export function NexoraIntelligenceLayer(props: IntelligenceProps) {
  const { surface, onClose } = props;
  const title = useMemo(() => surface?.kind === "work" ? "Nexora My Work" : surface?.kind === "assistant" ? "Nexora Intelligence" : "Explain This Number", [surface]);
  useEffect(() => {
    if (!surface) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [surface, onClose]);
  if (!surface) return null;
  return (
    <div className="nx-intelligence-layer" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className={`nx-intelligence-panel nx-intelligence-panel--${surface.kind}`} role="dialog" aria-modal="true" aria-label={title}>
        <header className="nx-intelligence-panel__head"><div><span className="nx-intelligence-mark">N</span><span><strong>{title}</strong><small>Explain · Predict · Guide · Control</small></span></div><button aria-label={`Close ${title}`} type="button" onClick={onClose}>×</button></header>
        <div className="nx-intelligence-panel__body">
          {surface.kind === "work" ? <WorkSurface {...props} /> : surface.kind === "assistant" ? <AssistantSurface {...props} /> : <ExplainSurface subject={surface.subject} roleLabel={props.roleLabel} onNavigate={props.onNavigate} />}
        </div>
        <footer className="nx-intelligence-panel__footer"><span>Prototype intelligence · recommendations require human review</span><button type="button" onClick={() => props.onNavigate("ai", "ai-assistant")}>Open AI command centre</button></footer>
      </section>
    </div>
  );
}
