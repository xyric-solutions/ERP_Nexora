"use client";

/**
 * Quotation record (prototype): the full quotation-to-invoice workflow.
 *
 * Shows every stage (Quotation, Management approval, Pick & pack, Delivery,
 * Invoice, Payment) with its status and details, the approval history with who
 * decided and when, and the one next action. Approval is the only approval in
 * the sale: approving confirms the sales order automatically. Approval decisions run against the session store only;
 * there is no Sales API, so nothing here is a posted or audited record yet.
 */

import { useState } from "react";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "cn";
import {
  ActivityList,
  Card,
  EmptyState,
  LinkButton,
  NextActionBar,
  PageHead,
  StatusPill,
  tableClass,
  TotalsSummary,
} from "../components/sales-ui";
import { QuotationDecisionButtons, QuotationDecisionDialog } from "../components/sales-dialogs";
import type { SalesNav } from "../components/sales-nav";
import { money, moneyWhole } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  approvalBlocker,
  approvalSummary,
  approverName,
  confirmQuotation,
  creditCheck,
  decideQuotation,
  documentTotal,
  EDITABLE_QUOTATION_STATUSES,
  findCustomer,
  findDocument,
  lineAmount,
  lineTotals,
  nextActionFor,
  quotationStages,
  submitQuotation,
  type QuotationStage,
} from "../model/sales-workflow";
import type { ApprovalDecision } from "../model/sales-types";
import { DocumentEntry } from "./sales-document-entry";

const STAGE_MARK: Record<QuotationStage["state"], string> = {
  done: "border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]",
  current: "border-primary bg-primary text-primary-foreground shadow-[0_0_0_4px_var(--nx-focus-ring)]",
  waiting: "border-border bg-card text-muted-foreground",
  blocked: "border-dashed border-[var(--nx-danger-border)] bg-card text-[var(--nx-danger)]",
};

function StageCard({ stage, index, onOpen }: { stage: QuotationStage; index: number; onOpen?: () => void }) {
  return (
    <li
      aria-current={stage.state === "current" ? "step" : undefined}
      className={cn(
        "flex min-w-0 flex-col gap-2.5 rounded-lg border bg-card p-3.5",
        stage.state === "current" ? "border-primary ring-2 ring-ring/20" : "border-border",
      )}
    >
      <div className="flex items-center gap-2.5">
        <i className={cn("grid size-7.5 shrink-0 place-items-center rounded-full border text-xs font-bold not-italic", STAGE_MARK[stage.state])}>
          {stage.state === "done" ? <Check className="size-3.5" aria-hidden="true" /> : stage.state === "blocked" ? <Minus className="size-3.5" aria-hidden="true" /> : index + 1}
        </i>
        <div className="min-w-0">
          <strong className="block text-sm font-bold text-foreground">{stage.label}</strong>
          {stage.code ? (
            onOpen ? (
              <LinkButton mono onClick={onOpen}>{stage.code}</LinkButton>
            ) : (
              <span className="font-mono text-xs font-semibold text-muted-foreground">{stage.code}</span>
            )
          ) : null}
        </div>
      </div>
      <div><StatusPill status={stage.status} /></div>
      {stage.details.length ? (
        <dl className="m-0 grid gap-1.5 text-xs">
          {stage.details.map(([label, value]) => (
            <div key={label} className="grid min-w-0 gap-0.5">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="m-0 font-semibold break-words text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="m-0 text-xs text-muted-foreground">{stage.state === "blocked" ? "Stopped: the quotation was rejected." : "Starts after the previous stage."}</p>
      )}
    </li>
  );
}

export function QuotationRecord({ code, nav }: { code: string; nav: SalesNav }) {
  const state = useSalesState();
  const doc = findDocument(state, "quotation", code);
  const [editing, setEditing] = useState(false);
  const [deciding, setDeciding] = useState<ApprovalDecision | null>(null);

  if (!doc) {
    return (
      <EmptyState
        title={`${code} was not found`}
        hint="Sample records reset when the page reloads."
        action={<Button type="button" variant="outline" size="sm" onClick={nav.back}>Back to list</Button>}
      />
    );
  }

  if (editing) {
    return <DocumentEntry kind="quotation" existing={doc} nav={nav} onSaved={() => setEditing(false)} onCancel={() => setEditing(false)} />;
  }

  const customer = findCustomer(state, doc.customerId);
  const next = nextActionFor(state, doc);
  const totals = lineTotals(doc.lines);
  const stages = quotationStages(state, doc);
  const canEdit = EDITABLE_QUOTATION_STATUSES.includes(doc.status);
  const approvalEntries = (doc.approval ?? []).map((entry) => ({
    step: entry.action === "Submitted" ? "Submitted for approval" : entry.action,
    at: entry.at,
    by: entry.action === "Submitted" ? entry.by : approverName(entry),
    note: entry.note,
  }));

  const run = (change: () => string) => {
    try {
      nav.notify(change());
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "That action could not be completed.");
    }
  };


  const runAction = () => {
    if (next.type !== "action") return;
    if (next.action === "submitApproval") {
      run(() => {
        commitSales((sales) => submitQuotation(sales, doc.code, nav.actor));
        return `${doc.code} submitted for approval.`;
      });
    } else if (next.action === "confirmOrder") {
      run(() => {
        const orderCode = commitSales((sales) => confirmQuotation(sales, doc.code, nav.actor));
        return `Sales order ${orderCode} confirmed. It is now in Pick, Pack & Delivery.`;
      });
    }
  };

  const decide = (role: string, note: string) => {
    if (!deciding) return;
    const decision = deciding;
    setDeciding(null);
    run(() => {
      const orderCode = commitSales((sales) => decideQuotation(sales, doc.code, decision, nav.actor, role, note));
      return decision === "Approved"
        ? `${doc.code} approved by ${nav.actor} (${role}). Sales order ${orderCode} confirmed and sent to Pick, Pack & Delivery.`
        : decision === "Rejected"
          ? `${doc.code} rejected.`
          : `Changes requested on ${doc.code}.`;
    });
  };

  const openStage = (stage: QuotationStage) => {
    if (!stage.code || stage.key === "quotation") return undefined;
    const target = stage.key === "delivery" ? doc.links.order : stage.code;
    return target ? () => nav.open(target) : undefined;
  };

  const credit = creditCheck(state, doc.customerId, documentTotal(doc));
  const approvalWarning = credit.over
    ? `Approving takes ${customer?.display ?? "the customer"} over the credit limit by ${moneyWhole(credit.overBy)}. You can still approve.`
    : undefined;

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Quotation"
        title={`Quotation · ${doc.code}`}
        status={<StatusPill status={doc.status} />}
        description={`${customer?.display ?? "—"} · ${approvalSummary(doc)}`}
        actions={
          <>
            <Button type="button" variant="outline" onClick={nav.back}>Back to list</Button>
            {canEdit ? <Button type="button" variant="outline" onClick={() => setEditing(true)}>Edit</Button> : null}
          </>
        }
      />

      {next.type === "action" ? (
        <NextActionBar tone="action" eyebrow="Next action" title={next.label} text={next.text}>
          <Button type="button" className="h-10 px-4.5" onClick={runAction}>{next.label}</Button>
        </NextActionBar>
      ) : next.type === "wait" ? (
        <NextActionBar tone="wait" eyebrow="Management approval" title="Waiting for approval" text={next.text}>
          {next.approval ? <QuotationDecisionButtons size="default" onDecide={setDeciding} /> : null}
        </NextActionBar>
      ) : next.type === "stopped" ? (
        <NextActionBar tone="stopped" eyebrow="Rejected" title="This quotation is closed" text={next.text}>
          {customer ? <Button type="button" variant="outline" onClick={() => nav.openNew("quotations", customer.code)}>New Quotation for {customer.display}</Button> : null}
        </NextActionBar>
      ) : (
        <NextActionBar tone="done" eyebrow="Converted" title="Order confirmed" text={next.text}>
          {next.link ? <Button type="button" variant="outline" onClick={() => nav.open(next.link!.code)}>{next.link.label}</Button> : null}
        </NextActionBar>
      )}

      <Card title="Workflow" aside={<span className="text-xs text-muted-foreground">Quotation → Approval → Pick & pack → Delivery → Invoice → Payment</span>}>
        <ol className="m-0 grid list-none grid-cols-1 gap-3 p-3.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6" aria-label="Quotation workflow">
          {stages.map((stage, index) => (
            <StageCard key={stage.key} stage={stage} index={index} onOpen={openStage(stage)} />
          ))}
        </ol>
      </Card>

      <div className="grid min-w-0 grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Card title="Products and services" aside={doc.reference ? <span className="text-xs text-muted-foreground">Reference {doc.reference}</span> : undefined}>
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product / service</th>
                  <th className="text-right!">Qty</th>
                  <th>Unit</th>
                  <th className="text-right!">Rate</th>
                  <th className="text-right!">Tax</th>
                  <th className="text-right!">Amount</th>
                </tr>
              </thead>
              <tbody>
                {doc.lines.map((item, index) => (
                  <tr key={`${item.sku}-${index}`}>
                    <td className="text-muted-foreground">{index + 1}</td>
                    <td><strong>{item.desc}</strong><small>{item.sku || "Other charge"}</small></td>
                    <td className="text-right tabular-nums">{item.qty}</td>
                    <td>{item.uom || "Each"}</td>
                    <td className="text-right tabular-nums">{money(item.rate)}</td>
                    <td className="text-right tabular-nums">{item.tax}%</td>
                    <td className="text-right font-semibold tabular-nums">{money(lineAmount(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="grid grid-cols-1 gap-4 rounded-b-lg border-t border-border bg-muted p-4 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)]">
            {doc.notes ? (
              <div><span className="text-xs font-semibold text-muted-foreground">Notes</span><p className="mt-1 mb-0 text-[0.8125rem]">{doc.notes}</p></div>
            ) : (
              <span className="text-xs text-muted-foreground">No notes on this quotation.</span>
            )}
            <TotalsSummary rows={[["Untaxed amount", money(totals.sub)], ["Sales tax", money(totals.tax)]]} total={["Total", money(totals.total)]} />
          </footer>
        </Card>

        <Card title="Approval history" aside={doc.status === "Pending approval" ? <StatusPill status="Pending approval" /> : undefined}>
          {approvalEntries.length ? (
            <ActivityList entries={approvalEntries} />
          ) : (
            <p className="m-0 p-4 text-[0.8125rem] text-muted-foreground">Not submitted for approval yet.</p>
          )}
        </Card>
      </div>

      <QuotationDecisionDialog
        key={deciding ?? "closed"}
        quotation={deciding ? doc : null}
        decision={deciding ?? "Approved"}
        customerName={customer?.display ?? ""}
        total={totals.total}
        reviewer={nav.actor}
        blocker={approvalBlocker(state, doc)}
        warning={approvalWarning}
        onClose={() => setDeciding(null)}
        onConfirm={decide}
      />
    </div>
  );
}
