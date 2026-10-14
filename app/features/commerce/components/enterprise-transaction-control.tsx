"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CompanyMode } from "@prototype/shared/fixtures/mock-data";

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
    <section className="min-w-0 overflow-hidden rounded border border-border bg-card" aria-label="Enterprise transaction lifecycle">
      <header className="flex min-h-19 items-start justify-between gap-4.5 border-b border-primary/30 bg-primary/10 px-4 py-3.5 shadow-[inset_4px_0_0_var(--color-primary)] max-sm:flex-col">
        <div><span>Transaction control centre</span><h2>{subject}</h2><p>{reference} · Version 1 · {companyMode} operating model</p></div>
        <div className="grid min-w-32 justify-items-end gap-1 max-sm:justify-items-start"><small className="text-[0.6875rem] text-muted-foreground">Current status</small><strong className={`rounded-full border px-2 py-1 text-[0.6875rem] ${status === "Posted" || status === "Closed" ? "border-success bg-success/10 text-success" : status === "Reversed" ? "border-destructive bg-destructive/10 text-destructive" : "border-primary/40 bg-card text-primary"}`}>{status}</strong></div>
      </header>

      <ol className="m-0 grid list-none grid-cols-5 gap-2 border-b border-border bg-card px-4 py-3 max-sm:grid-cols-1" aria-label="Create, approve, post and close lifecycle">
        {lifecycle.map((stage, index) => {
          const state = status === "Reversed" && stage === "Posted" ? "reversed" : index < stageIndex ? "complete" : index === stageIndex ? "current" : "pending";
          return <li className={state} key={stage}><i>{state === "complete" ? "✓" : index + 1}</i><span><strong>{stage}</strong><small>{state === "complete" ? "Completed" : state === "current" ? "Current step" : "Pending"}</small></span></li>;
        })}
      </ol>

      <div className="flex items-center justify-between gap-3 border-b border-border bg-muted px-3.5 py-2.5 max-md:flex-col max-md:items-start">
        <div className="flex flex-wrap gap-1.5">
          {status === "Draft" ? <><Button variant="outline" type="button" onClick={runValidation}>Run validation</Button><Button className="primary" type="button" onClick={submit}>Submit for approval</Button></> : null}
          {status === "Submitted" ? <>
            <Button className="primary" disabled={!canApprove} title={canApprove ? "Approve this workflow step" : "Your role cannot approve this step"} type="button" onClick={() => { setTab("Approval"); record("Approved", "Approved", "Approval policy satisfied"); }}>Approve</Button>
            <Button variant="outline" type="button" onClick={() => { setTab("Approval"); record("Changes requested", "Draft", decisionNote || "Returned to originator"); }}>Request changes</Button>
            <Button variant="destructive" className="danger" disabled={!canApprove || !decisionNote.trim()} title="A decision note is required" type="button" onClick={() => record("Rejected", "Draft", decisionNote)}>Reject</Button>
            <Button variant="outline" type="button" disabled={!canApprove} onClick={() => record("Delegated", undefined, "Reassigned with full audit history")}>Delegate</Button>
          </> : null}
          {status === "Approved" ? <Button className="primary" disabled={!canPost} title={canPost ? "Create the controlled journal" : "Finance posting permission is required"} type="button" onClick={() => { setTab("Accounting"); record("Posted", "Posted", "Journal JE-2026-009184 created"); }}>Post transaction</Button> : null}
          {status === "Posted" ? <><Button variant="destructive" className="danger" disabled={!canPost} type="button" onClick={() => { setTab("Accounting"); record("Reversed", "Reversed", "Reversal RV-2026-001184 linked"); }}>Reverse</Button><Button className="primary" type="button" onClick={() => record("Closed", "Closed", "Workflow and settlement complete")}>Close</Button></> : null}
          {status === "Reversed" ? <Button className="primary" type="button" onClick={() => record("Closed", "Closed", "Reversal reviewed and closed")}>Close reversed record</Button> : null}
        </div>
        <p className="m-0 grid justify-items-end text-[0.6875rem] text-muted-foreground max-md:justify-items-start"><b className="text-primary">{canApprove ? "Approval enabled" : "Approval restricted"}</b><span>{canPost ? "Posting enabled for this role" : "Posting remains segregated to Finance"}</span></p>
      </div>

      <nav className="flex min-h-10.5 items-end gap-0.5 overflow-x-auto border-b border-border bg-primary/10 px-3" aria-label="Transaction control views">
        {(["Readiness", "Approval", "Accounting", "Audit"] as const).map((item) => <Button variant="ghost" aria-selected={tab === item} className={tab === item ? "min-h-10.5 rounded-none border-b-2 border-primary bg-card text-primary hover:bg-card hover:text-primary" : "min-h-10.5 rounded-none border-b-2 border-transparent text-muted-foreground"} key={item} role="tab" type="button" onClick={() => setTab(item)}>{item}{item === "Readiness" ? <b className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[0.6875rem] text-primary">{validated ? "7/7" : "6/7"}</b> : null}</Button>)}
      </nav>

      <div className="min-h-55 bg-card">
        {tab === "Readiness" ? <div className="grid grid-cols-2 gap-2 p-3 max-md:grid-cols-1">
          <article className="pass"><i>✓</i><div><strong>Mandatory fields and defaults</strong><p>Company, branch, currency, owner and document sequence are resolved.</p></div><span>Passed</span></article>
          <article className="pass"><i>✓</i><div><strong>Period, account and dimension policy</strong><p>Open-period and valid-combination checks are ready before posting.</p></div><span>Passed</span></article>
          <article className={validated ? "pass" : "warn"}><i>{validated ? "✓" : "!"}</i><div><strong>Duplicate and threshold control</strong><p>{validated ? "No blocking duplicate or approval-threshold conflict detected." : "Run validation to evaluate duplicate, value and tolerance rules."}</p></div><span>{validated ? "Passed" : "Pending"}</span></article>
          <article className="advisory"><i>i</i><div><strong>Supporting evidence expires in 14 days</strong><p>Non-blocking advisory retained for the approver and audit trail.</p></div><span>Advisory</span></article>
        </div> : null}

        {tab === "Approval" ? <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(17.5rem,.65fr)] gap-3 p-3 max-md:grid-cols-1">
          <div className="overflow-hidden rounded border border-border"><span className="block bg-primary/10 px-3 py-2 text-[0.6875rem] font-bold uppercase text-primary">Policy route · FIN-COM-04</span>{[["01", "Originator", "demo.admin", "Complete"], ["02", "Business owner", "Department Manager", status === "Submitted" ? "Current" : "Ready"], ["03", "Finance control", "Finance Manager", "Planned"], ["04", "Posting", "Authorised Accountant", "Segregated"]].map(([step, label, person, state]) => <article className="grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-2 border-t border-border px-3 py-2" key={step}><b className="text-[0.6875rem] text-primary">{step}</b><div><strong className="block text-[0.6875rem]">{label}</strong><small className="block text-[0.6875rem] text-muted-foreground">{person}</small></div><span className="text-[0.6875rem] font-bold text-muted-foreground">{state}</span></article>)}</div>
          <label className="grid content-start gap-1.5 rounded border border-border p-3 text-[0.6875rem] font-bold text-muted-foreground"><span>Decision note / return reason *</span><Textarea value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} placeholder="Required for rejection or requested changes; retained in the audit trail." rows={5} /></label>
        </div> : null}

        {tab === "Accounting" ? <div className="p-3">
          <div className="mb-2.5 flex items-center gap-2 overflow-x-auto [&_button]:min-w-max [&_button]:border [&_button]:border-border [&_button]:bg-primary/10 [&_button]:px-2.5 [&_button]:py-1.5 [&_button]:text-[0.6875rem] [&_button]:font-bold [&_button]:text-primary [&_i]:not-italic [&_i]:text-muted-foreground"><button type="button" onClick={() => onAction("Open source document", reference)}>Source document</button><i>→</i><button type="button" onClick={() => onAction("Open subledger", subject)}>Subledger</button><i>→</i><button type="button" onClick={() => onAction("Open journal", "JE-2026-009184")}>JE-2026-009184</button><i>→</i><button type="button" onClick={() => onAction("Open general ledger", reference)}>General ledger</button></div>
          <div className="nx-table-wrap"><table><thead><tr><th>Account</th><th>Posting description</th><th>Company / dimension</th><th className="amount">Debit</th><th className="amount">Credit</th></tr></thead><tbody>{lines.map(([account, label, debit, credit]) => <tr key={account}><td><button type="button" onClick={() => onAction("Drill to account", account)}>{account}</button></td><td>{label}</td><td>Demo Company · Head Office</td><td className="amount">{debit}</td><td className="amount">{credit}</td></tr>)}</tbody><tfoot><tr><th colSpan={3}>Balanced control total</th><th className="amount">PKR 42,482.00</th><th className="amount">PKR 42,482.00</th></tr></tfoot></table></div>
          <p>Preview uses the {companyMode} posting profile. Reversals mirror the original accounts and dimensions and remain linked to the source transaction.</p>
        </div> : null}

        {tab === "Audit" ? <div className="p-3">
          <header><div><span>Immutable visual history</span><h3>Versions, decisions and system events</h3></div><button type="button" onClick={() => onAction("Export audit evidence", reference)}>Export evidence</button></header>
          {audit.map(([action, actor, time, evidence], index) => <article key={action + time + index}><i>{audit.length - index}</i><div><strong>{action}</strong><p>{evidence}</p><small>{actor} · {time}</small></div><button type="button" onClick={() => onAction("View audit event", action)}>View</button></article>)}
        </div> : null}
      </div>
    </section>
  );
}
