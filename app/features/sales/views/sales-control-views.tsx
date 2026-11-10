"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, clickableRow, EmptyState, LinkButton, MetricTiles, PageHead, rowKeyHandler, StatusPill, tableClass } from "../components/sales-ui";
import { QuotationDecisionButtons, QuotationDecisionDialog, ReturnDialog } from "../components/sales-dialogs";
import type { SalesNav } from "../components/sales-nav";
import { SALES_CATALOG } from "../model/sales-constants";
import { formatDate, money, moneyWhole } from "../model/sales-format";
import { commitSales, useSalesState } from "../model/sales-store";
import {
  addReturn,
  approvalBlocker,
  creditCheck,
  customerLabel,
  decideQuotation,
  latestSubmission,
  decideReturn,
  documentTotal,
  openBalance,
  validateReturn,
} from "../model/sales-workflow";
import type { ApprovalDecision, SalesDocument } from "../model/sales-types";

const prototypeStatus = <StatusPill status="Prototype only" />;

export function ReturnsView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const [open, setOpen] = useState(false);
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Returns & Control"
        title="Sales Returns"
        status={prototypeStatus}
        description="Goods or services returned against an invoice. New returns go to Sales Approvals."
        actions={<Button type="button" onClick={() => setOpen(true)}>+ New Sales Return</Button>}
      />
      <Card>
        {state.returns.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr><th>Return</th><th>Date</th><th>Customer</th><th>Invoice</th><th>Item</th><th className="text-right!">Qty</th><th>Reason</th><th>Status</th></tr>
              </thead>
              <tbody>
                {[...state.returns].reverse().map((item) => (
                  <tr key={item.id}>
                    <td className="font-mono font-semibold">{item.code}</td>
                    <td>{formatDate(item.date)}</td>
                    <td>{customerLabel(state, item.customerId)}</td>
                    <td><LinkButton mono onClick={() => nav.open(item.invoice)}>{item.invoice}</LinkButton></td>
                    <td>{item.item}</td>
                    <td className="text-right tabular-nums">{item.qty}</td>
                    <td>{item.reason}</td>
                    <td><StatusPill status={item.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="No sales returns yet" />
        )}
      </Card>
      {open ? (
        <ReturnDialog
          open={open}
          invoices={state.invoice}
          customerName={(id) => customerLabel(state, id)}
          validate={(input) => validateReturn(state, input)}
          onClose={() => setOpen(false)}
          onSave={(input) => {
            const code = commitSales((sales) => addReturn(sales, input, nav.actor));
            setOpen(false);
            nav.notify(`${code} saved and sent to Sales Approvals.`);
          }}
        />
      ) : null}
    </div>
  );
}

export function PricingView() {
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Returns & Control"
        title="Pricing & Discounts"
        status={prototypeStatus}
        description="Prices and sales tax used when lines are added to quotations, orders and invoices."
      />
      <Card title="Standard price list" aside={<span className="text-xs text-muted-foreground">Sales tax 18% goods · 16% services</span>}>
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead><tr><th>Item</th><th>Description</th><th>Unit</th><th className="text-right!">Price</th><th className="text-right!">Sales tax</th></tr></thead>
            <tbody>
              {SALES_CATALOG.map((item) => (
                <tr key={item.sku}>
                  <td className="font-mono font-semibold">{item.sku}</td>
                  <td>{item.name}</td>
                  <td>{item.uom}</td>
                  <td className="text-right tabular-nums">{money(item.rate)}</td>
                  <td className="text-right tabular-nums">{item.tax}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      <Card title="Discount rules">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead><tr><th>Rule</th><th>Applies to</th><th className="text-right!">Discount</th><th>Status</th></tr></thead>
            <tbody>
              {[
                ["Volume, 5 units or more", "All goods", "3%"],
                ["Distributor price list", "Crescent Holdings", "5%"],
                ["Key account price list", "Atlas Engineering", "4%"],
              ].map(([rule, scope, discount]) => (
                <tr key={rule}><td>{rule}</td><td>{scope}</td><td className="text-right tabular-nums">{discount}</td><td><StatusPill status="Active" /></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

export function ApprovalsView({ nav }: { nav: SalesNav }) {
  const state = useSalesState();
  const returns = state.returns.filter((item) => item.status === "Pending approval");
  const quotations = state.quotation.filter((quotation) => quotation.status === "Pending approval");
  const [deciding, setDeciding] = useState<{ code: string; decision: ApprovalDecision } | null>(null);
  const decidingDoc = deciding ? quotations.find((quotation) => quotation.code === deciding.code) ?? null : null;

  const decideQuote = (role: string, note: string) => {
    if (!deciding) return;
    const { code, decision } = deciding;
    setDeciding(null);
    try {
      const orderCode = commitSales((sales) => decideQuotation(sales, code, decision, nav.actor, role, note));
      nav.notify(
        decision === "Approved"
          ? `${code} approved by ${nav.actor} (${role}). Sales order ${orderCode} confirmed and sent to Pick, Pack & Delivery.`
          : decision === "Rejected"
            ? `${code} rejected.`
            : `Changes requested on ${code}.`,
      );
    } catch (error) {
      nav.notify(error instanceof Error ? error.message : "The decision could not be saved.");
    }
  };

  const decide = (id: string, code: string, approve: boolean) => {
    commitSales((sales) => decideReturn(sales, id, approve, nav.actor));
    nav.notify(`${code} ${approve ? "approved" : "rejected"}.`);
  };
  const decisionButtons = (onReject: () => void, onApprove: () => void) => (
    <div className="flex justify-end gap-1.5 whitespace-nowrap">
      <Button type="button" size="sm" variant="destructive" onClick={(event) => { event.stopPropagation(); onReject(); }}>Reject</Button>
      <Button type="button" size="sm" onClick={(event) => { event.stopPropagation(); onApprove(); }}>Approve</Button>
    </div>
  );

  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Returns & Control"
        title="Sales Approvals"
        status={prototypeStatus}
        description="Management approves each quotation once. Approve & Confirm Order confirms the sales order and sends it to Pick, Pack & Delivery; no other step needs approval. Sales returns are also decided here."
      />
      <Card>
        {quotations.length || returns.length ? (
          <div className="overflow-x-auto">
            <table className={tableClass}>
              <thead>
                <tr><th>Document</th><th>Type</th><th>Customer</th><th>Why it is here</th><th className="text-right!">Amount</th><th>Waiting since</th><th><span className="sr-only">Decision</span></th></tr>
              </thead>
              <tbody>
                {quotations.map((quotation) => {
                  const submitted = latestSubmission(quotation);
                  const open = () => nav.open(quotation.code, true);
                  return (
                    <tr key={quotation.id} className={clickableRow} tabIndex={0} onClick={open} onKeyDown={rowKeyHandler(open)}>
                      <td className="font-mono font-semibold">{quotation.code}</td>
                      <td>Quotation</td>
                      <td>{customerLabel(state, quotation.customerId)}</td>
                      <td>Submitted for approval{submitted?.note ? <small>{submitted.note}</small> : null}</td>
                      <td className="text-right tabular-nums">{money(documentTotal(quotation))}</td>
                      <td>{submitted?.at ?? "—"}<small>{submitted?.by}</small></td>
                      <td><QuotationDecisionButtons onDecide={(decision) => setDeciding({ code: quotation.code, decision })} /></td>
                    </tr>
                  );
                })}
                {returns.map((item) => {
                  const last = item.history[item.history.length - 1];
                  return (
                    <tr key={item.id}>
                      <td className="font-mono font-semibold">{item.code}</td>
                      <td>Sales return</td>
                      <td>{customerLabel(state, item.customerId)}</td>
                      <td>{item.reason}</td>
                      <td className="text-right">{item.qty} × {item.item}</td>
                      <td>{last?.at}<small>{last?.by}</small></td>
                      <td>{decisionButtons(() => decide(item.id, item.code, false), () => decide(item.id, item.code, true))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState title="Nothing waiting for approval" hint="Submitted quotations and sales returns appear here." />
        )}
      </Card>
      <QuotationDecisionDialog
        key={deciding ? `${deciding.code}-${deciding.decision}` : "closed"}
        quotation={decidingDoc}
        decision={deciding?.decision ?? "Approved"}
        customerName={decidingDoc ? customerLabel(state, decidingDoc.customerId) : ""}
        total={decidingDoc ? documentTotal(decidingDoc) : 0}
        reviewer={nav.actor}
        blocker={decidingDoc ? approvalBlocker(state, decidingDoc) : undefined}
        warning={decidingDoc && creditCheck(state, decidingDoc.customerId, documentTotal(decidingDoc)).over ? "Approving takes this customer over the credit limit. You can still approve." : undefined}
        onClose={() => setDeciding(null)}
        onConfirm={decideQuote}
      />
    </div>
  );
}

export function ReportsView() {
  const state = useSalesState();
  const sum = (docs: readonly SalesDocument[]) => docs.reduce((total, doc) => total + documentTotal(doc), 0);
  const quotations = state.quotation;
  const ordered = quotations.filter((doc) => doc.status === "Ordered").length;
  const conversion = quotations.length ? Math.round((ordered / quotations.length) * 100) : 0;
  return (
    <div className="grid min-w-0 grid-cols-1 gap-3.5 text-foreground">
      <PageHead
        eyebrow="Sales · Returns & Control"
        title="Sales Reports"
        status={prototypeStatus}
        description="A summary of quotations to receipts, calculated from the sample documents."
      />
      <MetricTiles
        metrics={[
          { label: "Quotation conversion", value: `${conversion}%`, hint: `${ordered} of ${quotations.length} quotations` },
          { label: "Ready for delivery", value: state.order.filter((doc) => doc.status === "Confirmed").length, hint: "Confirmed orders" },
          { label: "Invoiced", value: moneyWhole(sum(state.invoice)), hint: `${state.invoice.length} invoices` },
          { label: "Collected", value: moneyWhole(state.receipt.reduce((total, receipt) => total + receipt.amount, 0)), hint: "Customer receipts" },
        ]}
      />
      <Card title="By customer">
        <div className="overflow-x-auto">
          <table className={tableClass}>
            <thead>
              <tr><th>Customer</th><th className="text-right!">Open quotations</th><th className="text-right!">Orders not invoiced</th><th className="text-right!">Invoiced</th><th className="text-right!">Open balance</th></tr>
            </thead>
            <tbody>
              {state.customers.map((customer) => (
                <tr key={customer.id}>
                  <td><strong>{customer.display}</strong></td>
                  <td className="text-right tabular-nums">{moneyWhole(sum(quotations.filter((doc) => doc.customerId === customer.id && doc.status !== "Ordered" && doc.status !== "Rejected")))}</td>
                  <td className="text-right tabular-nums">{moneyWhole(sum(state.order.filter((doc) => doc.customerId === customer.id && doc.status !== "Invoiced")))}</td>
                  <td className="text-right tabular-nums">{moneyWhole(sum(state.invoice.filter((doc) => doc.customerId === customer.id)))}</td>
                  <td className="text-right tabular-nums">{moneyWhole(openBalance(state, customer.id))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
