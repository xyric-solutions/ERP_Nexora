"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  hrPayrollPaymentActionSchema,
  type HrPayrollPaymentAction,
  type HrPayrollPaymentWorkspace,
} from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { HrClickableRow } from "../components/hr-clickable-row";
import {
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { payrollNavigationContext } from "../components/payroll-navigation";
import { Field, State, panel, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
const titles = {
  prepare: "Prepare salary batch",
  approve: "Approve salary batch",
  reject: "Reject this draft",
  confirm: "Confirm bank settlement",
};
const columns = ["Batch reference", "Payroll month", "Run", "Employees", "Net salary", "Confirmed", "Outstanding", "Status"];
type Review = {
  action: HrPayrollPaymentAction["action"];
  snapshot: HrPayrollPaymentWorkspace;
  payment?: HrPayrollPaymentWorkspace["payments"][number];
};
export function HrPayrollPaymentWorkspace({
  onNavigate,
  initialReference,
}: {
  initialReference?: string | undefined;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const initial = payrollNavigationContext(initialReference);
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = ["hr.payroll.payment.read", "hr.payroll.result.read", "banking.payment.read"].every((p) =>
    session?.user.permissions.includes(p),
  );
  const formId = useId();
  const [choice] = useState(initial?.company_id ?? ""),
    [month, setMonth] = useState(initial?.month.slice(0, 7) ?? localDate().slice(0, 7)),
    [revision, setRevision] = useState(0),
    [detail, setDetail] = useState(false),
    [review, setReview] = useState<Review | null>(null),
    [reason, setReason] = useState(""),
    [line, setLine] = useState(""),
    [bankReference, setBankReference] = useState(""),
    [date, setDate] = useState(localDate()),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const companies = useAttendanceRead(canRead ? "payment-companies" : null, () => client.companies());
  const company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? "");
  const query = { company_id: company, month: month + "-01" };
  const data = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
    client.payrollPaymentWorkspace(query),
  );
  function open(action: Review["action"], payment?: Review["payment"]) {
    if (!data.data) return;
    setReview({ action, snapshot: data.data, payment });
    setLine("");
    setBankReference("");
    setDate(localDate());
    setReason("");
    setError("");
  }
  function closeDrawer() {
    if (busy) return;
    setReview(null);
    setDetail(false);
    setError("");
  }
  async function act(e: React.FormEvent) {
    e.preventDefault();
    if (!review || guard.current) return;
    const input = hrPayrollPaymentActionSchema.safeParse({
      company_id: review.snapshot.company_id,
      month: review.snapshot.month,
      action: review.action,
      expected_version: review.snapshot.batch?.version ?? 0,
      source_hash: review.snapshot.source_hash,
      reason,
      ...(review.action === "confirm"
        ? {
            payment_id: review.payment?.id,
            bank_payment_line_id: line,
            bank_reference: bankReference,
            confirmed_on: date,
          }
        : {}),
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    setNotice("");
    const fingerprint = JSON.stringify(input.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await client.actOnPayrollPayment(input.data, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice("Salary batch " + result.status + " · version " + result.version);
      setReview(null);
      setDetail(false);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payment action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (loading) return <p role="status">Loading your secure workspace…</p>;
  if (!canRead)
    return <section className={panel}>Payroll payment, result and Banking read permissions are required.</section>;
  const w = data.data;
  const hasRecord = !!w && (!!w.batch || !!w.period || w.allowed_actions.length > 0);
  const lines =
    review?.snapshot.bank_lines.slice(0, 500).filter((l) => l.payment_reference === review.payment?.id) ?? [];
  const currency = w?.currency_code ?? "";
  const money = (value: string) => (currency ? value + " " + currency : value);
  return (
    <div className="min-w-0 space-y-4" data-payroll-payment-workspace>
      {companies.data && !companies.data.items.length && (
        <div className={panel}>No authorized company is available.</div>
      )}
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-full sm:w-48">
          <Field title="Payroll month">
            <Input
              type="month"
              value={month}
              disabled={busy || !!review}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
                setNotice("");
              }}
            />
          </Field>
        </div>
        <Button
          variant="outline"
          className="sm:ml-auto"
          disabled={busy}
          onClick={() => onNavigate("banking", "bank-payments")}
        >
          Bank Payments
          <ArrowRight className="size-4" />
        </Button>
      </div>
      {(companies.error || data.error || (error && !detail)) && (
        <div role="alert" className="rounded-lg border border-destructive bg-card p-3 text-sm text-destructive">
          {companies.error || data.error || error}
        </div>
      )}
      {notice && (
        <p role="status" className="rounded-lg border border-border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <WorkTable tableId="app/features/hr/views/hr-payroll-payment-workspace:1" className="w-full border-collapse text-left text-sm">
          <caption className="sr-only">Salary payment batch for the selected company and payroll month</caption>
          <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              {columns.map((t) => (
                <th key={t} scope="col" className="whitespace-nowrap px-4 py-3">
                  {t}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.loading || companies.loading ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
                  <span role="status">Loading salary obligations and posted bank evidence…</span>
                </td>
              </tr>
            ) : w && hasRecord ? (
              <HrClickableRow onOpen={() => setDetail(true)} disabled={busy}>
                <td className="px-4 py-3 font-mono text-xs font-medium">
                  {w.batch?.reference ?? <span className="font-sans text-muted-foreground">Not prepared</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-3">{month}</td>
                <td className="px-4 py-3 tabular-nums">{w.period?.run_number ?? "—"}</td>
                <td className="px-4 py-3 tabular-nums">{w.totals.employee_count}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{money(w.totals.net)}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{money(w.totals.confirmed)}</td>
                <td className="whitespace-nowrap px-4 py-3 tabular-nums">{money(w.totals.outstanding)}</td>
                <td className="px-4 py-3">
                  <State value={w.batch?.state ?? "not prepared"} />
                </td>
              </HrClickableRow>
            ) : (
              <tr>
                <td colSpan={columns.length} className="px-4 py-6 text-center text-muted-foreground">
                  {w ? "No payroll run or salary batch for this month." : "Select a company to view salary batches."}
                </td>
              </tr>
            )}
          </tbody>
        </WorkTable>
      </div>
      {w && detail && (
        <HrRecordDrawer
          title={review ? titles[review.action] : (w.batch?.reference ?? "Salary batch " + month)}
          description={review ? "Review the salary obligation and its Banking evidence." : "Salary payment batch"}
          open
          busy={busy}
          error={error}
          onClose={closeDrawer}
          footer={
            review ? (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
                <Button type="submit" form={formId} disabled={busy || (review.action === "confirm" && !line)}>
                  {busy ? "Saving…" : titles[review.action]}
                </Button>
              </>
            ) : (
              w.allowed_actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  disabled={busy}
                  variant={action === "reject" ? "outline" : "default"}
                  onClick={() => open(action)}
                >
                  {action === "approve" && <ShieldCheck className="size-4" />}
                  {titles[action]}
                </Button>
              ))
            )
          }
        >
          {review ? (
            <WorkForm id={formId} onSubmit={act} className="space-y-4" aria-label="Salary payment review">
              {review.action === "confirm" && (
                <>
                  <HrDetailGroup title="Salary obligation">
                    <HrDetailTile label="Employee" value={review.payment?.employee_name} />
                    <HrDetailTile label="Net salary" value={review.payment && money(review.payment.amount)} />
                    <HrDetailTile label="Bank line external reference" value={review.payment?.id} mono />
                    <HrDetailTile label="Bank line document reference" value={review.payment?.employee_id} mono />
                    <HrDetailTile
                      label="Debit net payable account"
                      value={review.snapshot.net_payable_account_id}
                      mono
                    />
                  </HrDetailGroup>
                  <Field title="Posted matching Bank Payment line">
                    <select
                      className={selectClass}
                      value={line}
                      onChange={(e) => setLine(e.target.value)}
                      required
                      disabled={busy}
                    >
                      <option value="">Select posted evidence</option>
                      {lines.map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.reference} · {l.amount} {l.currency_code} · {l.posting_date}
                        </option>
                      ))}
                    </select>
                  </Field>
                  {!lines.length && (
                    <p className="text-sm text-muted-foreground">
                      No matching posted bank line is available. Create, independently approve and post it in Bank
                      Payments using the references above, then cancel this review and refresh.
                    </p>
                  )}
                  {review.snapshot.bank_lines_truncated && (
                    <p className="text-sm text-muted-foreground">
                      The candidate list is bounded. Resolve duplicate or excess Bank Payment candidates before
                      confirmation.
                    </p>
                  )}
                  <div className="grid grid-cols-1 gap-4">
                    <Field title="Bank successful-transfer reference">
                      <Input
                        value={bankReference}
                        onChange={(e) => setBankReference(e.target.value)}
                        required
                        maxLength={120}
                        disabled={busy}
                      />
                    </Field>
                    <Field title="Bank confirmation date">
                      <Input
                        type="date"
                        value={date}
                        min={lines.find((item) => item.id === line)?.posting_date ?? review.snapshot.month}
                        max={localDate()}
                        onChange={(e) => setDate(e.target.value)}
                        required
                        disabled={busy}
                      />
                    </Field>
                  </div>
                  <p className="text-sm font-medium">
                    Confirming records that the bank transfer succeeded. A posted accounting entry alone is
                    insufficient. Retained settlements require a governed correction to reverse.
                  </p>
                </>
              )}
              <Field title="Review reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
            </WorkForm>
          ) : (
            <>
              <HrDetailSummary code={w.batch?.reference ?? "Not prepared"} status={w.batch?.state ?? "not prepared"}>
                {"Payroll " + month + " · run " + (w.period?.run_number ?? "—")}
              </HrDetailSummary>
              <HrDetailGroup title="Amounts">
                <HrDetailTile label="Net salary" value={money(w.totals.net)} />
                <HrDetailTile label="Bank confirmed" value={money(w.totals.confirmed)} />
                <HrDetailTile label="Outstanding" value={money(w.totals.outstanding)} />
                <HrDetailTile label="Employees to pay" value={String(w.totals.employee_count)} />
                {w.totals.zero_net_count > 0 && (
                  <HrDetailTile label="Zero-net results" value={String(w.totals.zero_net_count)} />
                )}
              </HrDetailGroup>
              <HrDetailGroup title="Batch">
                <HrDetailTile label="Payroll state" value={w.period?.state ?? "No run"} />
                <HrDetailTile label="Accrual journal" value={w.accrual_journal_id ?? "Awaiting Finance posting"} />
                <HrDetailTile label="Net payable account ID" value={w.net_payable_account_id} mono />
                <HrDetailTile label="Version" value={w.batch ? String(w.batch.version) : undefined} />
                <HrDetailTile label="Created by" value={w.batch?.created_by} />
                <HrDetailTile label="Approved by" value={w.batch?.approved_by} />
              </HrDetailGroup>
              {w.blocked.length > 0 && (
                <HrDetailSection title="Resolve before payment">
                  <ul className="m-0! list-disc space-y-1 pl-5 text-sm">
                    {w.blocked.map((t) => (
                      <li key={t}>{t}</li>
                    ))}
                  </ul>
                </HrDetailSection>
              )}
              {w.payments.length > 0 && (
                <HrDetailSection title="Bank settlement">
                  <ul className="m-0! grid list-none divide-y divide-border p-0!">
                    {w.payments.map((p) => (
                      <li key={p.id} className="grid gap-1 py-2 text-sm">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="min-w-0 font-medium">
                            {p.employee_name}{" "}
                            <span className="text-xs font-normal text-muted-foreground">{p.employee_number}</span>
                          </span>
                          <span className="tabular-nums">{money(p.amount)}</span>
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <State value={p.state} />
                          {p.can_confirm ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => open("confirm", p)}
                            >
                              Confirm
                            </Button>
                          ) : p.bank_payment_id ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="link"
                              className="h-auto px-0"
                              onClick={() => onNavigate("banking", "transaction-detail", p.bank_payment_id!)}
                            >
                              Open Bank Payment
                            </Button>
                          ) : null}
                        </div>
                        {p.bank_reference && (
                          <p className="m-0! text-xs text-muted-foreground wrap-anywhere">
                            {p.bank_reference} · {hrDisplayDate(p.confirmed_on)} · Journal {p.journal_id}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                </HrDetailSection>
              )}
            </>
          )}
        </HrRecordDrawer>
      )}
    </div>
  );
}
