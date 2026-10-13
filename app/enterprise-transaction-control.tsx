"use client";

import { useMemo, useState } from "react";
import type { CompanyMode } from "./mock-data";

type TransactionStatus = "Draft" | "Submitted" | "Approved" | "Posted" | "Reversed" | "Closed";
type ControlTab = "Readiness" | "Approval" | "Accounting" | "Audit";

interface EnterpriseTransactionControlProps {
  subject: string;
  reference: string;
  roleId: string;
  companyMode: CompanyMode;
  family: string;
  initialStatus?: string;
  onAction: (action: string, subject?: string) => void;
}

const lifecycle: readonly TransactionStatus[] = ["Draft", "Submitted", "Approved", "Posted", "Closed"];

function statusFrom(value?: string): TransactionStatus {
  if (/closed|complete|paid|fulfilled/i.test(value ?? "")) return "Closed";
  if (/reverse|cancel/i.test(value ?? "")) return "Reversed";
  if (/post|confirm|received|sent/i.test(value ?? "")) return "Posted";
  if (/approve|validated/i.test(value ?? "")) return "Approved";
  if (/pending|submit|review|hold/i.test(value ?? "")) return "Submitted";
  return "Draft";
}

function postingLines(companyMode: CompanyMode, family: string) {
  if (family === "finance" || family === "treasury") {
    return [
      ["110101", "Bank / control account", "PKR 42,482.00", "—"],
      ["210201", "Payable / clearing account", "—", "PKR 42,482.00"],
    ] as const;
  }
  if (companyMode === "manufacturing") {
    return [
      ["130201", "Work in progress", "PKR 42,482.00", "—"],
      ["120101", "Raw material consumption", "—", "PKR 42,482.00"],
    ] as const;
  }
  if (companyMode === "trading") {
    return [
      ["120201", "Trading inventory", "PKR 42,482.00", "—"],
      ["210301", "Goods received clearing", "—", "PKR 42,482.00"],
    ] as const;
  }
  return [
    ["110201", "Trade / unbilled receivable", "PKR 42,482.00", "—"],
    ["410101", "Service and project revenue", "—", "PKR 42,482.00"],
  ] as const;
}

export function EnterpriseTransactionControl({
  subject,
  reference,
  roleId,
  companyMode,
  family,
  initialStatus,
  onAction,
}: EnterpriseTransactionControlProps) {
  const [status, setStatus] = useState<TransactionStatus>(() => statusFrom(initialStatus));
  const [tab, setTab] = useState<ControlTab>("Readiness");
  const [validated, setValidated] = useState(false);
  const [decisionNote, setDecisionNote] = useState("");
  const [audit, setAudit] = useState([
    ["Draft created", "demo.admin", "Today · 09:14", "Version 1"],
    ["Defaults applied", "Nexora policy engine", "Today · 09:14", companyMode + " company profile"],
  ]);
  const lines = useMemo(() => postingLines(companyMode, family), [companyMode, family]);
  const canApprove = /chief|manager|administrator/.test(roleId) && !/auditor|viewer/.test(roleId);
  const canPost = /finance|accountant|administrator|chief-financial/.test(roleId) && !/auditor|viewer/.test(roleId);

  const record = (action: string, next?: TransactionStatus, evidence = "Prototype workflow event") => {
    if (next) setStatus(next);
    setAudit((items) => [[action, roleId, "Just now", evidence], ...items]);
    onAction(action, reference || subject);
  };

  const runValidation = () => {
    setValidated(true);
    setTab("Readiness");
    record("Validation completed", undefined, "7 controls passed · 1 advisory");
  };

  const submit = () => {
    if (!validated) {
      setTab("Readiness");
      onAction("Submission blocked", "Run validation before submitting");
      return;
    }
    setTab("Approval");
    record("Submitted for approval", "Submitted", "Route FIN-COM-04 assigned");
  };

  const stageIndex = status === "Reversed" ? 3 : lifecycle.indexOf(status);

  return (
    <section className="nx-governance nx-card" aria-label="Enterprise transaction lifecycle">
      <header className="nx-governance__header">
        <div><span>Transaction control centre</span><h2>{subject}</h2><p>{reference} · Version 1 · {companyMode} operating model</p></div>
        <div><small>Current status</small><strong className={"nx-governance__status nx-governance__status--" + status.toLowerCase()}>{status}</strong></div>
      </header>

      <ol className="nx-governance__lifecycle" aria-label="Create, approve, post and close lifecycle">
        {lifecycle.map((stage, index) => {
          const state = status === "Reversed" && stage === "Posted" ? "reversed" : index < stageIndex ? "complete" : index === stageIndex ? "current" : "pending";
          return <li className={state} key={stage}><i>{state === "complete" ? "✓" : index + 1}</i><span><strong>{stage}</strong><small>{state === "complete" ? "Completed" : state === "current" ? "Current step" : "Pending"}</small></span></li>;
        })}
      </ol>

      <div className="nx-governance__commandbar">
        <div>
          {status === "Draft" ? <><button type="button" onClick={runValidation}>Run validation</button><button className="primary" type="button" onClick={submit}>Submit for approval</button></> : null}
          {status === "Submitted" ? <>
            <button className="primary" disabled={!canApprove} title={canApprove ? "Approve this workflow step" : "Your role cannot approve this step"} type="button" onClick={() => { setTab("Approval"); record("Approved", "Approved", "Approval policy satisfied"); }}>Approve</button>
            <button type="button" onClick={() => { setTab("Approval"); record("Changes requested", "Draft", decisionNote || "Returned to originator"); }}>Request changes</button>
            <button className="danger" disabled={!canApprove || !decisionNote.trim()} title="A decision note is required" type="button" onClick={() => record("Rejected", "Draft", decisionNote)}>Reject</button>
            <button type="button" disabled={!canApprove} onClick={() => record("Delegated", undefined, "Reassigned with full audit history")}>Delegate</button>
          </> : null}
          {status === "Approved" ? <button className="primary" disabled={!canPost} title={canPost ? "Create the controlled journal" : "Finance posting permission is required"} type="button" onClick={() => { setTab("Accounting"); record("Posted", "Posted", "Journal JE-2026-009184 created"); }}>Post transaction</button> : null}
          {status === "Posted" ? <><button className="danger" disabled={!canPost} type="button" onClick={() => { setTab("Accounting"); record("Reversed", "Reversed", "Reversal RV-2026-001184 linked"); }}>Reverse</button><button className="primary" type="button" onClick={() => record("Closed", "Closed", "Workflow and settlement complete")}>Close</button></> : null}
          {status === "Reversed" ? <button className="primary" type="button" onClick={() => record("Closed", "Closed", "Reversal reviewed and closed")}>Close reversed record</button> : null}
        </div>
        <p><b>{canApprove ? "Approval enabled" : "Approval restricted"}</b><span>{canPost ? "Posting enabled for this role" : "Posting remains segregated to Finance"}</span></p>
      </div>

      <nav className="nx-governance__tabs" aria-label="Transaction control views">
        {(["Readiness", "Approval", "Accounting", "Audit"] as const).map((item) => <button aria-selected={tab === item} className={tab === item ? "active" : ""} key={item} role="tab" type="button" onClick={() => setTab(item)}>{item}{item === "Readiness" ? <b>{validated ? "7/7" : "6/7"}</b> : null}</button>)}
      </nav>

      <div className="nx-governance__body">
        {tab === "Readiness" ? <div className="nx-governance__checks">
          <article className="pass"><i>✓</i><div><strong>Mandatory fields and defaults</strong><p>Company, branch, currency, owner and document sequence are resolved.</p></div><span>Passed</span></article>
          <article className="pass"><i>✓</i><div><strong>Period, account and dimension policy</strong><p>Open-period and valid-combination checks are ready before posting.</p></div><span>Passed</span></article>
          <article className={validated ? "pass" : "warn"}><i>{validated ? "✓" : "!"}</i><div><strong>Duplicate and threshold control</strong><p>{validated ? "No blocking duplicate or approval-threshold conflict detected." : "Run validation to evaluate duplicate, value and tolerance rules."}</p></div><span>{validated ? "Passed" : "Pending"}</span></article>
          <article className="advisory"><i>i</i><div><strong>Supporting evidence expires in 14 days</strong><p>Non-blocking advisory retained for the approver and audit trail.</p></div><span>Advisory</span></article>
        </div> : null}

        {tab === "Approval" ? <div className="nx-governance__approval">
          <div className="nx-governance__route"><span>Policy route · FIN-COM-04</span>{[["01", "Originator", "demo.admin", "Complete"], ["02", "Business owner", "Department Manager", status === "Submitted" ? "Current" : "Ready"], ["03", "Finance control", "Finance Manager", "Planned"], ["04", "Posting", "Authorised Accountant", "Segregated"]].map(([step, label, person, state]) => <article key={step}><b>{step}</b><div><strong>{label}</strong><small>{person}</small></div><span>{state}</span></article>)}</div>
          <label><span>Decision note / return reason *</span><textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Required for rejection or requested changes; retained in the audit trail." rows={5} /></label>
        </div> : null}

        {tab === "Accounting" ? <div className="nx-governance__accounting">
          <div className="nx-governance__lineage"><button type="button" onClick={() => onAction("Open source document", reference)}>Source document</button><i>→</i><button type="button" onClick={() => onAction("Open subledger", subject)}>Subledger</button><i>→</i><button type="button" onClick={() => onAction("Open journal", "JE-2026-009184")}>JE-2026-009184</button><i>→</i><button type="button" onClick={() => onAction("Open general ledger", reference)}>General ledger</button></div>
          <div className="nx-table-wrap"><table><thead><tr><th>Account</th><th>Posting description</th><th>Company / dimension</th><th className="amount">Debit</th><th className="amount">Credit</th></tr></thead><tbody>{lines.map(([account, label, debit, credit]) => <tr key={account}><td><button type="button" onClick={() => onAction("Drill to account", account)}>{account}</button></td><td>{label}</td><td>Demo Company · Head Office</td><td className="amount">{debit}</td><td className="amount">{credit}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Balanced control total</th><th className="amount">PKR 42,482.00</th><th className="amount">PKR 42,482.00</th></tr></tfoot></table></div>
          <p>Preview uses the {companyMode} posting profile. Reversals mirror the original accounts and dimensions and remain linked to the source transaction.</p>
        </div> : null}

        {tab === "Audit" ? <div className="nx-governance__audit">
          <header><div><span>Immutable visual history</span><h3>Versions, decisions and system events</h3></div><button type="button" onClick={() => onAction("Export audit evidence", reference)}>Export evidence</button></header>
          {audit.map(([action, actor, time, evidence], index) => <article key={action + time + index}><i>{audit.length - index}</i><div><strong>{action}</strong><p>{evidence}</p><small>{actor} · {time}</small></div><button type="button" onClick={() => onAction("View audit event", action)}>View</button></article>)}
        </div> : null}
      </div>
    </section>
  );
}
