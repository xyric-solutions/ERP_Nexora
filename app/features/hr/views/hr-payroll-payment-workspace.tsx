"use client";
import { useMemo, useRef, useState } from "react";
import { ArrowRight, RefreshCw, ShieldCheck, Landmark } from "lucide-react";
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
import {
  Field,
  Metric,
  State,
  panel,
  selectClass,
  useAttendanceRead,
  localDate,
} from "../components/hr-workspace-controls";
const titles = {
  prepare: "Prepare salary batch",
  approve: "Approve salary batch",
  reject: "Reject this draft",
  confirm: "Confirm bank settlement",
};
type Review = {
  action: HrPayrollPaymentAction["action"];
  snapshot: HrPayrollPaymentWorkspace;
  payment?: HrPayrollPaymentWorkspace["payments"][number];
};
export function HrPayrollPaymentWorkspace({
  onNavigate,
}: {
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]);
  const canRead = ["hr.payroll.payment.read", "hr.payroll.result.read", "banking.payment.read"].every((p) =>
    session?.user.permissions.includes(p),
  );
  const [choice, setChoice] = useState(""),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [revision, setRevision] = useState(0),
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
  const lines = review?.snapshot.bank_lines.filter((l) => l.payment_reference === review.payment?.id) ?? [];
  return (
    <div className="min-w-0 space-y-5" data-payroll-payment-workspace>
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <Landmark className="size-5 shrink-0" />
              Salary payment control
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Posted Payroll → independent batch approval → posted Banking payment → bank confirmation. Each settlement
              clears the employee’s exact net payable.
            </p>
          </div>
          <Button variant="outline" onClick={() => onNavigate("banking", "bank-payments")}>
            Bank Payments
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto]">
          <Field title="Company">
            <select
              className={selectClass}
              value={company}
              disabled={busy || !!review}
              onChange={(e) => {
                setChoice(e.target.value);
                setNotice("");
              }}
            >
              {companies.data?.items.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.code})
                </option>
              ))}
            </select>
          </Field>
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
          <Button
            className="self-end"
            variant="outline"
            disabled={busy || !!review}
            onClick={() => setRevision((v) => v + 1)}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </div>
      </section>
      {(error || companies.error || data.error) && (
        <div role="alert" className={panel + " border-destructive text-destructive"}>
          {error || companies.error || data.error}
        </div>
      )}
      {notice && (
        <p role="status" className={panel}>
          {notice}
        </p>
      )}
      {data.loading && <p role="status">Loading salary obligations and posted bank evidence…</p>}
      {w && (
        <>
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              hint="Exact Payroll amount"
              title={"Net salary · " + (w.currency_code ?? "—")}
              value={w.totals.net}
            />
            <Metric hint="Exact Payroll amount" title="Bank confirmed" value={w.totals.confirmed} />
            <Metric hint="Exact Payroll amount" title="Outstanding" value={w.totals.outstanding} />
            <Metric hint="Exact Payroll amount" title="Employees to pay" value={String(w.totals.employee_count)} />
          </div>
          <section className={panel + " space-y-4"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold">Batch review</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {w.batch
                    ? "Retained salary obligations and settlement evidence."
                    : "Prepare from the posted accrual; amounts come from immutable Payroll results."}
                </p>
              </div>
              <State value={w.batch?.state ?? "not prepared"} />
            </div>
            <div className="grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-muted-foreground">Payroll state</p>
                <p>
                  {w.period?.state ?? "No run"} · run {w.period?.run_number ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground">Accrual journal</p>
                <p className="break-all">{w.accrual_journal_id ?? "Awaiting Finance posting"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Batch reference</p>
                <p className="break-all">{w.batch?.reference ?? "Not prepared"}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Net payable account ID</p>
                <p className="break-all">{w.net_payable_account_id ?? "Unavailable"}</p>
              </div>
            </div>
            {w.blocked.length > 0 && (
              <div className="rounded-lg border border-[var(--nx-warning)] p-3 text-sm">
                <p className="font-semibold">Resolve before payment</p>
                <ul className="mt-2 list-disc space-y-1 pl-5">
                  {w.blocked.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
                <Button variant="link" className="mt-2 px-0" onClick={() => onNavigate("hr", "payroll-journal")}>
                  Open Payroll Journal
                  <ArrowRight className="size-4" />
                </Button>
              </div>
            )}
            <p className="text-sm text-muted-foreground">
              “Released” means the batch is approved for processing. Confirm only after checking the bank’s successful
              transfer record. This screen does not transmit bank transfers or generate bank files.
            </p>
            {w.totals.zero_net_count > 0 && (
              <p className="text-sm text-muted-foreground">
                {w.totals.zero_net_count} zero-net result(s) require no transfer and are retained in the accrual
                population.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              {w.allowed_actions.map((action) => (
                <Button
                  key={action}
                  disabled={busy || !!review}
                  variant={action === "reject" ? "outline" : "default"}
                  className={action === "reject" ? "" : "text-primary-foreground!"}
                  onClick={() => open(action)}
                >
                  {action === "approve" && <ShieldCheck className="size-4" />}
                  {titles[action]}
                </Button>
              ))}
            </div>
          </section>
          <section className={panel + " min-w-0"}>
            <h3 className="mb-3 text-base font-semibold">Employee salary payments</h3>
            {!w.payments.length ? (
              <p className="text-sm text-muted-foreground">
                Prepare a batch to create the employee payment references.
              </p>
            ) : (
              <div className="max-w-full overflow-x-auto">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <caption className="sr-only">Salary obligations and their confirmed Banking evidence</caption>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      {["Employee", "Net salary", "Payment reference", "State", "Bank evidence", "Action"].map((t) => (
                        <th key={t} scope="col" className="px-3 py-3 font-medium">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {w.payments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0">
                        <td className="px-3 py-4">
                          <p className="font-medium">{p.employee_name}</p>
                          <p className="text-xs text-muted-foreground">{p.employee_number}</p>
                          <p className="mt-1 max-w-44 break-all text-xs text-muted-foreground">
                            Employee ID: {p.employee_id}
                          </p>
                        </td>
                        <td className="px-3 py-4 tabular-nums">
                          {p.amount} {w.currency_code}
                        </td>
                        <td className="max-w-52 break-all px-3 py-4 font-mono text-xs">{p.id}</td>
                        <td className="px-3 py-4">
                          <State value={p.state} />
                        </td>
                        <td className="max-w-52 break-all px-3 py-4 text-xs">
                          {p.bank_reference ? (
                            <>
                              <p>{p.bank_reference}</p>
                              <p>{p.confirmed_on}</p>
                              <p className="mt-1 text-muted-foreground">Journal: {p.journal_id}</p>
                            </>
                          ) : (
                            <span className="text-muted-foreground">Awaiting bank confirmation</span>
                          )}
                        </td>
                        <td className="px-3 py-4">
                          {p.can_confirm ? (
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy || !!review}
                              onClick={() => open("confirm", p)}
                            >
                              Confirm
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">
                              {p.state === "confirmed" ? "Reconciled" : "Pending review"}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          {review && (
            <form onSubmit={act} className={panel + " space-y-4"} aria-label="Salary payment review">
              <h3 className="text-lg font-semibold">{titles[review.action]}</h3>
              <p className="text-sm text-muted-foreground">
                Company and month are frozen for this review. The server rechecks current permissions, the posted
                accrual and the batch version.
              </p>
              {review.action === "confirm" && (
                <>
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="font-semibold">
                      {review.payment?.employee_name} · {review.payment?.amount} {review.snapshot.currency_code}
                    </p>
                    <p className="mt-1 break-all">Bank line external reference: {review.payment?.id}</p>
                    <p className="mt-1 break-all">Bank line document reference: {review.payment?.employee_id}</p>
                    <p className="mt-1 break-all">
                      Debit net payable account: {review.snapshot.net_payable_account_id}
                    </p>
                  </div>
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
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field title="Bank successful-transfer reference">
                      <Input
                        value={bankReference}
                        onChange={(e) => setBankReference(e.target.value)}
                        required
                        minLength={3}
                        maxLength={120}
                        disabled={busy}
                      />
                    </Field>
                    <Field title="Bank confirmation date">
                      <Input
                        type="date"
                        value={date}
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
                  required
                  minLength={5}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="submit"
                  className="text-primary-foreground!"
                  disabled={busy || (review.action === "confirm" && !line)}
                >
                  {busy ? "Saving…" : titles[review.action]}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
              </div>
            </form>
          )}
          <section className={panel}>
            <h3 className="text-base font-semibold">Audit history</h3>
            {!w.history.length ? (
              <p className="mt-2 text-sm text-muted-foreground">No payment actions recorded for this period.</p>
            ) : (
              <ol className="mt-3 divide-y">
                {w.history.map((h, i) => (
                  <li key={h.occurred_at + i} className="py-3 text-sm">
                    <div className="flex flex-wrap justify-between gap-2">
                      <span className="font-medium">
                        {h.action} · {h.actor_id}
                      </span>
                      <time className="text-muted-foreground">{new Date(h.occurred_at).toLocaleString()}</time>
                    </div>
                    <p className="mt-1 break-words text-muted-foreground">{h.reason}</p>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
    </div>
  );
}
