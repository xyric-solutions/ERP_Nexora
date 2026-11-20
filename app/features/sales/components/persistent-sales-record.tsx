"use client";
import { useRef, useState } from "react";
import { decimal, type SalesDetail, type SalesKind, type SalesAction } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkTable } from "@/shared/ui/work-table";
import {
  Card,
  PageHead,
  StatusPill,
  ReadField,
  Field,
  NextActionBar,
  TotalsSummary,
  ActivityList,
  LinkButton,
  selectClass,
  tableClass,
} from "./sales-ui";
import {
  salesLabels,
  salesPages,
  salesMoney,
  salesStateLabel,
  salesError,
  salesToday,
} from "../model/persistent-sales";
import { printPersistentSales } from "../model/persistent-sales-print";

export type SalesNavigate = (module: string, page: string, ref?: string, options?: { replace?: boolean }) => void;
export function PersistentSalesRecord({
  initial,
  onNavigate,
  onEdit,
  onDerive,
  onBack,
}: {
  initial: SalesDetail;
  onNavigate: SalesNavigate;
  onEdit: () => void;
  onBack: () => void;
  onDerive: (
    kind: SalesKind,
    source: SalesDetail,
    options: { date: string; customer?: string; period?: string },
  ) => void;
}) {
  const { api, session, csrfToken, activeCompany } = useSession(),
    [detail, setDetail] = useState(initial),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [target, setTarget] = useState<SalesKind | null>(null),
    [date, setDate] = useState(salesToday),
    [customer, setCustomer] = useState(""),
    [period, setPeriod] = useState("");
  const lock = useRef(false),
    retry = useRef<{ body: string; key: string } | null>(null),
    record = detail.record;
  const permissions = new Set(session?.user.permissions),
    maker = record.maker_id === session?.user.id && permissions.has("sales.document.create"),
    reviewer = record.approver_id === session?.user.id && permissions.has("sales.document.approve");
  const money = (value: string) => salesMoney(value, record.currency, record.decimal_places);
  async function perform(action: string, work: (key: string) => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    const body = JSON.stringify({ id: record.id, version: record.version, action, reason, date });
    if (retry.current?.body !== body) retry.current = { body, key: crypto.randomUUID() };
    try {
      await work(retry.current.key);
      window.dispatchEvent(new Event("nexora:sales-changed"));
    } catch (error) {
      setError(salesError(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  function act(action: SalesAction["action"]) {
    void perform(action, async (key) => {
      setDetail(
        await api.actOnSalesDocument(
          record.id,
          { company_id: record.company_id, expected_version: record.version, action, reason },
          csrfToken(),
          key,
        ),
      );
    });
  }
  function accounting() {
    void perform("accounting", async (key) => {
      await api.prepareSalesAccounting(
        record.id,
        { company_id: record.company_id, expected_version: record.version, reason },
        csrfToken(),
        key,
      );
      onNavigate("sales", "invoices", `accounting:${record.id}`);
    });
  }
  function stock() {
    void perform("stock", async (key) => {
      const result = await api.prepareSalesStock(
        record.id,
        { company_id: record.company_id, expected_version: record.version, reason, date },
        csrfToken(),
        key,
      );
      onNavigate("inventory", "stock-movements", result.id);
    });
  }
  const ready = !busy && reason.trim().length >= 3;
  const commercial = record.state === "approved",
    posted = record.posting_state === "posted",
    invoice = record.kind === "invoice",
    physical = record.kind === "delivery" || record.kind === "return";
  const next =
    record.state === "submitted"
      ? "Awaiting the named reviewer"
      : !commercial
        ? "Review the commercial record"
        : physical
          ? posted
            ? "Stock and cost of sales posted"
            : "Review physical accounting"
          : record.kind === "invoice" || record.kind === "credit"
            ? posted
              ? invoice && record.outstanding !== null && decimal(record.outstanding, 8, true) === 0n
                ? "Customer balance settled"
                : "Review the customer balance"
              : "Review receivable accounting"
            : record.kind === "recurring"
              ? "Prepare the next billing period"
              : "Continue the Sales workflow";
  return (
    <div className="grid min-w-0 gap-4">
      <PageHead
        eyebrow={`Sales · ${salesLabels[record.kind].single}`}
        title={record.code}
        status={<StatusPill status={salesStateLabel(record.state)} />}
        description={
          record.customer_name ??
          (record.kind === "recurring" ? `${record.recurring_customers.length} billing customer(s)` : undefined)
        }
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void perform("refresh", async () => {
                  setDetail(await api.getSalesDocument(record.id, record.company_id));
                  setTarget(null);
                })
              }
            >
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => printPersistentSales(record, activeCompany?.name ?? record.company_id)}
            >
              Print / Save PDF
            </Button>
            <Button type="button" variant="outline" onClick={onBack}>
              Back
            </Button>
          </>
        }
      />
      <NextActionBar
        tone={
          record.state === "cancelled" ? "stopped" : posted ? "done" : record.state === "submitted" ? "wait" : "action"
        }
        eyebrow="Next step"
        title={next}
        text={
          physical
            ? posted
              ? "The physical movement is posted. Review its stock, valuation and journal evidence below."
              : "Post the reviewed physical movement through Stock to update quantity, inventory value and cost of sales."
            : invoice || record.kind === "credit"
              ? posted
                ? "Accounting is posted. The outstanding balance reflects posted receipts, credits and reversals."
                : "Post the reviewed accounting operation through AR, then record receipts against its actual outstanding balance."
              : "Review the source details and continue with the related document."
        }
      >
        {maker && ["draft", "rejected"].includes(record.state) ? (
          <Button type="button" variant="outline" disabled={busy} onClick={onEdit}>
            Edit
          </Button>
        ) : null}
        {maker && ["draft", "rejected"].includes(record.state) && record.approver_id ? (
          <Button type="button" disabled={!ready} onClick={() => act("submit")}>
            Submit for approval
          </Button>
        ) : null}
        {maker && record.state === "draft" && !record.approver_id ? (
          <Button type="button" disabled={!ready} onClick={() => act("approve")}>
            {record.kind === "order" ? "Confirm order" : physical ? "Confirm delivery / return" : "Approve"}
          </Button>
        ) : null}
        {reviewer && record.state === "submitted" ? (
          <>
            <Button type="button" disabled={!ready} onClick={() => act("approve")}>
              Approve
            </Button>
            <Button type="button" variant="outline" disabled={!ready} onClick={() => act("reject")}>
              Reject
            </Button>
          </>
        ) : null}
        {commercial && record.kind === "quotation" && permissions.has("sales.document.create") ? (
          <Button type="button" disabled={busy} onClick={() => setTarget("order")}>
            Confirm order
          </Button>
        ) : null}
        {commercial && record.kind === "order" && permissions.has("sales.document.create") ? (
          <>
            <Button type="button" disabled={busy} onClick={() => setTarget("delivery")}>
              Confirm delivery
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setTarget("invoice")}>
              Create invoice
            </Button>
          </>
        ) : null}
        {commercial && invoice && permissions.has("sales.document.create") ? (
          <Button type="button" variant="outline" disabled={busy} onClick={() => setTarget("delivery")}>
            Prepare delivery
          </Button>
        ) : null}
        {commercial && physical && permissions.has("inventory.stock.manage") && !record.stock_operation_id ? (
          <Button type="button" disabled={!ready} onClick={stock}>
            Prepare stock accounting
          </Button>
        ) : null}
        {record.stock_operation_id && permissions.has("inventory.stock.read") ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate("inventory", "stock-movements", record.stock_operation_id!)}
          >
            View stock accounting
          </Button>
        ) : null}
        {commercial &&
        (invoice || record.kind === "credit") &&
        !record.financial_operation_id &&
        permissions.has("finance.subledger.manage") ? (
          <Button type="button" disabled={!ready} onClick={accounting}>
            Prepare accounting
          </Button>
        ) : null}
        {record.financial_operation_id && permissions.has("finance.subledger.read") ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => onNavigate("sales", "invoices", `accounting:${record.id}`)}
          >
            View accounting
          </Button>
        ) : null}
        {posted &&
        invoice &&
        record.subledger_item_id &&
        record.outstanding &&
        decimal(record.outstanding, 8, true) > 0n &&
        permissions.has("finance.subledger.manage") ? (
          <Button type="button" onClick={() => onNavigate("sales", "receipts", `receive:${record.id}`)}>
            Receive payment
          </Button>
        ) : null}
        {posted && invoice && permissions.has("sales.document.create") ? (
          <Button type="button" variant="outline" onClick={() => setTarget("credit")}>
            Credit note
          </Button>
        ) : null}
        {posted && record.kind === "delivery" && permissions.has("sales.document.create") ? (
          <Button type="button" variant="outline" onClick={() => setTarget("return")}>
            Sale return
          </Button>
        ) : null}
        {commercial && record.kind === "recurring" && permissions.has("sales.document.create") ? (
          <Button type="button" onClick={() => setTarget("invoice")}>
            Create invoice
          </Button>
        ) : null}
      </NextActionBar>
      {error ? (
        <p role="alert" className="m-0 rounded-lg border border-destructive p-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {target ? (
        <Card title={`Prepare ${salesLabels[target].single.toLowerCase()}`}>
          <div className="grid gap-3 p-4 sm:grid-cols-2">
            <Field label="New document date">
              <Input
                aria-label="New document date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
            {record.kind === "recurring" ? (
              <>
                <Field label="Billing customer">
                  <select
                    aria-label="Billing customer"
                    className={selectClass}
                    value={customer}
                    onChange={(event) => setCustomer(event.target.value)}
                  >
                    <option value="">Choose customer</option>
                    {record.recurring_customers.map((party) => (
                      <option key={party.id} value={party.id}>
                        {party.code} · {party.name}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Billing period start"
                  hint={
                    record.recurrence?.frequency === "weekly"
                      ? "Use a weekly date anchored to the template start date."
                      : "Use the first day of the approved billing month."
                  }
                >
                  <Input
                    aria-label="Billing period start"
                    type="date"
                    value={period}
                    onChange={(event) => setPeriod(event.target.value)}
                  />
                </Field>
              </>
            ) : null}
            <div className="flex gap-2 sm:col-span-2">
              <Button
                type="button"
                disabled={!date || (record.kind === "recurring" && (!customer || !period))}
                onClick={() =>
                  onDerive(target, detail, { date, customer: customer || undefined, period: period || undefined })
                }
              >
                Continue
              </Button>
              <Button type="button" variant="outline" onClick={() => setTarget(null)}>
                Cancel
              </Button>
            </div>
          </div>
        </Card>
      ) : null}
      <Card title="Document details">
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          <ReadField label="Customer">
            {record.customer_name ?? record.recurring_customers.map((customer) => customer.name).join(", ")}
          </ReadField>
          <ReadField label="Document date">{record.document_date}</ReadField>
          <ReadField label="Due date">{record.due_date}</ReadField>
          <ReadField label="Project">{record.project_name}</ReadField>
          <ReadField label="Location">{record.location_name}</ReadField>
          <ReadField label="Warehouse">{record.warehouse_name}</ReadField>
          <ReadField label="Currency / rate">
            {record.currency} · {record.exchange_rate} {record.base_currency}
          </ReadField>
          <ReadField label="Source">
            {record.source_id ? (
              <LinkButton
                onClick={() => onNavigate("sales", salesPages[record.source_kind ?? record.kind], record.source_id!)}
              >
                {record.source_code ?? record.source_id}
              </LinkButton>
            ) : (
              "Direct document"
            )}
          </ReadField>
          <ReadField label="Accounting status">
            <StatusPill status={salesStateLabel(record.posting_state)} />
          </ReadField>
          <ReadField label="Created by">{record.maker_name}</ReadField>
          <ReadField label="Approver">{record.approver_name ?? "Creator confirmation"}</ReadField>
          <ReadField label="Outstanding">
            {record.outstanding === null ? "Not posted" : money(record.outstanding)}
          </ReadField>
        </div>
      </Card>
      <Card title="Product / Service">
        <WorkTable tableId="persistent-sales-record-lines" className={tableClass} tools={false} keyboardScroll>
          <thead>
            <tr>
              <th>Item</th>
              <th>Description</th>
              <th>Quantity</th>
              <th>Unit price</th>
              <th>Net</th>
              <th>Tax</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {record.lines.map((line) => (
              <tr key={line.id}>
                <td>
                  {line.product_code ?? "Other charge"}
                  <small>{line.product_name}</small>
                </td>
                <td>{line.description}</td>
                <td>
                  {line.quantity} {line.unit}
                </td>
                <td>{money(line.unit_price)}</td>
                <td>{money(line.net_amount)}</td>
                <td>
                  {money(line.tax_amount)}
                  <small>{line.tax_snapshot?.name ?? record.no_tax_reason}</small>
                </td>
                <td>{money(line.total_amount)}</td>
              </tr>
            ))}
          </tbody>
        </WorkTable>
        <div className="grid gap-4 p-4 sm:grid-cols-2">
          <p className="m-0 text-sm whitespace-pre-wrap text-muted-foreground">{record.notes}</p>
          <TotalsSummary
            rows={[
              ["Net amount", money(record.net_amount)],
              ["Tax", money(record.tax_amount)],
            ]}
            total={["Total", money(record.total_amount)]}
          />
        </div>
      </Card>
      {record.readiness.length ? (
        <Card title="Configuration required">
          <ul className="m-0 grid gap-2 p-4 text-sm">
            {record.readiness.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      ) : null}
      <Card title="Related documents">
        <div className="flex flex-wrap gap-3 p-4">
          {detail.linked.length ? (
            detail.linked.map((link) => (
              <LinkButton key={link.id} onClick={() => onNavigate("sales", salesPages[link.kind], link.id)}>
                {link.code} · {salesStateLabel(link.state)}
              </LinkButton>
            ))
          ) : (
            <span className="text-sm text-muted-foreground">No related documents yet.</span>
          )}
        </div>
      </Card>
      <Card title="Activity">
        <ActivityList
          entries={[...detail.events].reverse().map((event) => ({
            step: `${event.action} · version ${event.version}`,
            at: event.occurred_at,
            by: event.actor_name,
            note: event.reason,
          }))}
        />
      </Card>
      <Card title="Review and controls">
        <div className="grid gap-3 p-4 sm:grid-cols-2">
          <Field
            label="Action reason"
            hint="Record the reason before approval, cancellation or accounting preparation."
          >
            <Textarea
              aria-label="Action reason"
              value={reason}
              minLength={3}
              maxLength={500}
              onChange={(event) => setReason(event.target.value)}
            />
          </Field>
          {physical ? (
            <Field label="Stock posting date">
              <Input
                aria-label="Stock posting date"
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </Field>
          ) : null}
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {(maker && ["submitted", "rejected"].includes(record.state)) ||
            (maker && commercial && ["quotation", "recurring"].includes(record.kind)) ? (
              <Button type="button" variant="outline" disabled={!ready} onClick={() => act("revise")}>
                Reset to draft
              </Button>
            ) : null}
            {maker && commercial && record.kind === "recurring" ? (
              <Button
                type="button"
                variant="outline"
                disabled={!ready}
                onClick={() => act(record.recurrence?.enabled ? "pause" : "resume")}
              >
                {record.recurrence?.enabled ? "Pause" : "Resume"} template
              </Button>
            ) : null}
            {maker && record.state !== "cancelled" ? (
              <Button type="button" variant="outline" disabled={!ready} onClick={() => act("cancel")}>
                Cancel document
              </Button>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
  );
}
