"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

export interface RecordPreview {
  id: string;
  document: string;
  date: string;
  party: string;
  reference: string;
  amount: string;
  currency?: string;
  status: string;
  owner: string;
}

interface RecordPreviewDrawerProps {
  record: RecordPreview | null;
  recordType: string;
  partyLabel?: string;
  onClose: () => void;
  onAction: (action: string, subject?: string) => void;
}

const tabs = ["Overview", "Process", "Impact", "Financial", "Related", "Activity"] as const;

function isClosedStatus(status: string) {
  return /posted|paid|approved|complete|closed|reconciled/i.test(status);
}

function workflowFor(recordType: string) {
  if (/purchase|supplier|requisition|rfq|goods receipt/i.test(recordType)) return ["Requisition", "RFQ", "Purchase order", "Receipt & quality", "Purchase bill", "Payment"];
  if (/sales|customer|quotation|invoice|delivery/i.test(recordType)) return ["Quotation", "Sales order", "Dispatch", "Invoice", "Receipt", "Reconciliation"];
  if (/bank|payment|receipt|transfer/i.test(recordType)) return ["Initiated", "Validation", "Approval", "Posting", "Reconciliation", "Closed"];
  return ["Draft", "Validation", "Approval", "Posting", "Related documents", "Closed"];
}

export function RecordPreviewDrawer({
  record,
  recordType,
  partyLabel = "Party / record",
  onClose,
  onAction,
}: RecordPreviewDrawerProps) {
  const [tab, setTab] = useState<(typeof tabs)[number]>("Overview");

  useEffect(() => {
    if (!record) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [record, onClose]);

  if (!record) return null;
  const closed = isClosedStatus(record.status);
  const workflow = workflowFor(recordType);
  const currentStage = closed ? 4 : /draft|new/i.test(record.status) ? 1 : 2;

  return (
    <div className="nx-record-drawer-layer" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <aside className="nx-record-drawer" role="dialog" aria-modal="true" aria-labelledby="nx-record-drawer-title">
        <header className="nx-record-drawer__head">
          <div>
            <span className="nx-eyebrow">{recordType} · quick view</span>
            <h2 id="nx-record-drawer-title">{record.document}</h2>
            <p>{record.party} · {record.reference}</p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Close record preview" className="nx-record-drawer__close" type="button" onClick={onClose}>×</Button>
        </header>

        <div className="nx-record-drawer__status">
          <span className={`nx-status nx-status-${record.status.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`}>{record.status}</span>
          <span>Last activity {record.date}</span>
          <span>Owner · {record.owner}</span>
        </div>

        <div className="nx-record-drawer__tabs" aria-label="Transaction preview sections" role="tablist">
          {tabs.map((item) => (
            <Button variant="outline" aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} role="tab" type="button" onClick={() => setTab(item)}>
              {item}
            </Button>
          ))}
        </div>

        <div className="nx-record-drawer__body">
          {tab === "Overview" ? (
            <>
              <section className="nx-record-drawer__hero">
                <div><span>Document value</span><strong>{record.amount}</strong><small>{record.currency || "Transaction currency"}</small></div>
                <div><span>Workflow position</span><strong>{record.status}</strong><small>{closed ? "No pending workflow action" : "Review before the next action"}</small></div>
              </section>
              <button className="nx-record-drawer__explain" type="button" onClick={() => onAction("Explain number", `${recordType} document value|${record.amount}|${record.status}|Source transaction ${record.document}`)}>✦ Explain this value and trace its source</button>
              <section className="nx-record-drawer__fields">
                {[
                  ["Document number", record.document],
                  ["Document date", record.date],
                  [partyLabel, record.party],
                  ["Source / reference", record.reference],
                  ["Created by", record.owner],
                  ["Record ID", record.id],
                ].map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
              </section>
              <div className="nx-record-drawer__notice"><b>i</b><p>This quick view uses prototype records only. Select <strong>Open full record</strong> for the complete document workspace where available.</p></div>
            </>
          ) : tab === "Process" ? (
            <section className="nx-control-graph">
              <header><span>Transaction Control Graph</span><h3>Connected document journey</h3><p>See what is complete, what is blocking progress and what happens next.</p></header>
              <ol>{workflow.map((step, index) => <li className={index < currentStage ? "complete" : index === currentStage ? "current" : ""} key={step}><i>{index < currentStage ? "✓" : index + 1}</i><div><strong>{step}</strong><small>{index < currentStage ? "Completed with evidence" : index === currentStage ? `Current · ${record.status}` : "Waiting for prior stage"}</small></div>{index === currentStage ? <span>Now</span> : null}</li>)}</ol>
              <div className="nx-control-graph__next"><b>Next best action</b><p>{closed ? "Review reconciliation and close the evidence pack." : `Resolve the current ${record.status.toLowerCase()} stage before moving to ${workflow[Math.min(currentStage + 1, workflow.length - 1)]}.`}</p><button type="button" onClick={() => onAction("Continue workflow", record.document)}>Continue safely →</button></div>
            </section>
          ) : tab === "Impact" ? (
            <section className="nx-impact-preview">
              <header><span>Impact Preview Before Posting</span><h3>Understand the consequence first</h3><p>Illustrative prototype preview—no ledger, stock, tax or bank record will be changed.</p></header>
              <div className="nx-impact-preview__grid">
                <article><i>GL</i><div><span>General ledger</span><strong>Balanced entry expected</strong><small>Debit and credit preview · {record.amount}</small></div></article>
                <article><i>BK</i><div><span>Bank / cash</span><strong>{/bank|payment|receipt/i.test(recordType) ? "Cash position affected" : "No direct movement yet"}</strong><small>Settlement depends on workflow stage</small></div></article>
                <article><i>TX</i><div><span>Tax & compliance</span><strong>Policy validation required</strong><small>GST · withholding · FBR profile</small></div></article>
                <article><i>ST</i><div><span>Stock / fulfilment</span><strong>{/receipt|order|inventory|delivery/i.test(recordType) ? "Quantity impact detected" : "No direct stock movement"}</strong><small>Reservation and valuation controls</small></div></article>
                <article><i>BG</i><div><span>Budget & commitment</span><strong>Within approval workflow</strong><small>Authority and available-budget check</small></div></article>
                <article><i>MG</i><div><span>Margin / profitability</span><strong>Explainable after posting</strong><small>Customer, project and product contribution</small></div></article>
              </div>
              <div className="nx-impact-preview__regional"><div><span>Pakistan compliance lens</span><strong>FBR-ready control design</strong></div><ul><li><b>✓</b> Tax profile present</li><li><b>!</b> Validate e-invoice scenario</li><li><b>✓</b> Withholding eligibility checked</li></ul></div>
            </section>
          ) : tab === "Financial" ? (
            <section className="nx-record-drawer__panel">
              <div><span>Gross document value</span><strong>{record.amount}</strong></div>
              <div><span>Currency</span><strong>{record.currency || "From source record"}</strong></div>
              <div><span>Posting state</span><strong>{closed ? "Completed workflow" : "Pending workflow"}</strong></div>
              <p>Ledger, tax, allocation and settlement details appear when the selected source document provides them.</p>
              <button className="nx-record-drawer__explain" type="button" onClick={() => onAction("Explain number", `${recordType} financial value|${record.amount}|${record.status}|Document ${record.document}`)}>Explain this number</button>
            </section>
          ) : tab === "Related" ? (
            <section className="nx-record-drawer__related">
              <button type="button" onClick={() => onAction("View source", record.reference)}><i>SR</i><span><strong>Source reference</strong><small>{record.reference}</small></span><b>↗</b></button>
              <button type="button" onClick={() => onAction("View party", record.party)}><i>PR</i><span><strong>{partyLabel} master</strong><small>{record.party}</small></span><b>↗</b></button>
              <button type="button" onClick={() => onAction("View audit trail", record.document)}><i>AT</i><span><strong>Audit trail</strong><small>Ownership and workflow history</small></span><b>↗</b></button>
            </section>
          ) : (
            <section className="nx-record-drawer__timeline">
              <article><i>✓</i><div><strong>Created with governed numbering</strong><span>{record.owner} · creator</span><small>{record.date} · {record.document}</small></div></article>
              <article><i>✓</i><div><strong>Validation controls completed</strong><span>System policy engine</span><small>Required fields, duplicate risk and permission scope checked.</small></div></article>
              <article><i>●</i><div><strong>Current status · {record.status}</strong><span>Workflow owner · {record.owner}</span><small>Open the full record for field-level before/after history.</small></div></article>
              <div className="nx-audit-trust"><span><b>SoD</b> Segregation of duties passed</span><span><b>EV</b> Evidence links retained</span><span><b>RBAC</b> Role-scoped visibility</span></div>
            </section>
          )}
        </div>

        <footer className="nx-record-drawer__actions">
          <Button variant="outline" type="button" onClick={() => onAction("Print", record.document)}>Print</Button>
          <Button variant="outline" type="button" onClick={() => onAction("Edit", record.document)}>Edit</Button>
          <Button variant="outline" type="button" onClick={() => setTab("Impact")}>Impact preview</Button>
          <Button className="primary" type="button" onClick={() => onAction("View", record.document)}>Open full record</Button>
        </footer>
      </aside>
    </div>
  );
}
