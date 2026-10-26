"use client";
import { payrollNavigationContext } from "../components/payroll-navigation";
import { useMemo, useRef, useState } from "react";
import { RefreshCw, ArrowRight, ShieldCheck, FileCheck2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/lib/session/session-provider";
import {
  hrPayrollJournalActionSchema,
  type HrPayrollJournalWorkspace,
  type HrPayrollJournalAction,
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
  prepare: "Prepare accrual proposal",
  accept: "Accept for Finance posting",
  reject: "Reject for a new revision",
  post: "Post to General Ledger",
};
type Review = { action: HrPayrollJournalAction["action"]; snapshot: HrPayrollJournalWorkspace };
export function HrPayrollJournalWorkspace({
  onNavigate,
  initialReference,
}: {
  initialReference?: string | undefined;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const initial = payrollNavigationContext(initialReference);
  const { api, session, csrfToken, loading } = useSession(),
    client = useMemo(() => new HrApiClient(api), [api]),
    permissions = session?.user.permissions ?? [];
  const canRead = ["hr.payroll.report.read", "hr.payroll.result.read", "finance.journal.read"].every((p) =>
    permissions.includes(p),
  );
  const [choice, setChoice] = useState(initial?.company_id ?? ""),
    [month, setMonth] = useState(initial?.month.slice(0, 7) ?? localDate().slice(0, 7)),
    [postingDate, setPostingDate] = useState(""),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState<Review | null>(null),
    [reason, setReason] = useState(""),
    [costCentres, setCostCentres] = useState<Record<string, string>>({}),
    [centreSearch, setCentreSearch] = useState(""),
    [centreLabels, setCentreLabels] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const companies = useAttendanceRead(canRead ? "journal-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? "");
  const query = {
    company_id: company,
    month: month + "-01",
    cost_center_search: centreSearch,
    ...(postingDate ? { posting_date: postingDate } : {}),
  };
  const data = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
    client.payrollJournalWorkspace(query),
  );
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  async function act(event: React.FormEvent) {
    event.preventDefault();
    if (!review || guard.current) return;
    const input = hrPayrollJournalActionSchema.safeParse({
      company_id: review.snapshot.company_id,
      month: review.snapshot.month,
      posting_date: review.snapshot.posting_date,
      action: review.action,
      ...(review.action === "prepare"
        ? {
            cost_center_mappings: review.snapshot.dimension_requirements
              .filter((a) => a.required_dimensions.includes("cost_center"))
              .map((a) => ({ account_id: a.account_id, cost_center_id: costCentres[a.account_id] ?? "" })),
          }
        : {}),
      expected_version: review.snapshot.proposal?.version ?? 0,
      source_hash: review.snapshot.source_hash,
      reason,
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
      const result = await client.actOnPayrollJournal(input.data, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice("Journal " + result.status + " · version " + result.version);
      setReview(null);
      setReason("");
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The journal action could not be completed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  if (loading) return <div className={panel}>Loading Payroll journal…</div>;
  if (!canRead)
    return <div className={panel}>Payroll report, result and Finance journal read permissions are required.</div>;
  const current = data.data,
    shown = review?.snapshot ?? current;
  return (
    <section
      aria-label="Payroll journal workspace"
      className="grid min-w-0 grid-cols-1 gap-5 font-sans [&_p]:mb-0 [&_h2]:mb-0 [&_dd]:font-sans! [&_select]:font-normal! [&_textarea]:font-normal!"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
          Accrue approved Payroll into Finance with a balanced journal, independent acceptance and a separate poster.
          Salary payment and payslip release follow separately.
        </p>
        <Button variant="outline" onClick={() => onNavigate("hr", "payroll-validation")}>
          <ArrowRight className="h-4 w-4" />
          Payroll approval
        </Button>
      </div>
      <div
        className={panel + " grid min-w-0 grid-cols-1 items-end gap-4 md:grid-cols-3 lg:grid-cols-[2fr_1fr_1fr_auto]"}
      >
        <Field title="Company">
          <select
            className={selectClass}
            value={company}
            disabled={busy || !!review}
            onChange={(e) => {
              setChoice(e.target.value);
              setPostingDate("");
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
              if (e.target.value) {
                setMonth(e.target.value);
                setPostingDate("");
              }
            }}
          />
        </Field>
        <Field title="Journal posting date">
          <Input
            type="date"
            value={postingDate || current?.posting_date || ""}
            max={localDate()}
            disabled={busy || !!review || !!(current?.proposal && current.proposal.state !== "rejected")}
            onChange={(e) => setPostingDate(e.target.value)}
          />
        </Field>
        <Button variant="outline" disabled={busy || !!review || data.loading} onClick={() => setRevision((v) => v + 1)}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>
      {(companies.error || data.error || error) && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {companies.error || data.error || error}
        </div>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </p>
      )}
      {data.loading && !review && <div className={panel}>Loading approved Payroll and Finance evidence…</div>}
      {shown && (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              title="Accrual debits"
              value={shown.totals.debit}
              hint={shown.currency_code ?? "No approved currency"}
            />
            <Metric
              title="Accrual credits"
              value={shown.totals.credit}
              hint="Deductions, contributions and net payable"
            />
            <Metric
              title="Employee net payable"
              value={shown.totals.net}
              hint={shown.totals.employee_count + " approved employee results"}
            />
            <Metric
              title="Employer contributions"
              value={shown.totals.employer_contributions}
              hint="Included in expense and statutory payable"
            />
          </div>
          <article className={panel} aria-label="Reviewed Payroll journal">
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <FileCheck2 className="h-5 w-5 text-primary" />
                  Payroll accrual · {shown.month.slice(0, 7)}
                </h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  {shown.proposal
                    ? "Revision " + shown.proposal.revision + " · version " + shown.proposal.version
                    : "Preview · no journal has been created"}
                </p>
              </div>
              <State value={shown.proposal?.state ?? shown.period?.state ?? "not_started"} />
            </header>
            <dl className="mt-5 grid min-w-0 grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Posting date", shown.posting_date],
                ["Payroll currency", shown.currency_code],
                ["Base currency", shown.base_currency],
                ["Reviewed exchange rate", shown.exchange_rate],
                ["Prepared by", shown.proposal?.created_by],
                ["Accepted by", shown.proposal?.accepted_by],
                ["Posted by", shown.proposal?.posted_by],
                ["Finance entry number", shown.proposal?.external_entry_number],
              ].map(([label, value]) => (
                <div className="min-w-0" key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 break-all">{value ?? "—"}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-5 overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[580px] border-collapse text-sm">
                <thead className="bg-muted/60 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 text-left">Account</th>
                    <th className="px-4 py-3 text-left">Role</th>
                    <th className="px-4 py-3 text-left">Cost centre</th>
                    <th className="px-4 py-3 text-right">Debit</th>
                    <th className="px-4 py-3 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.lines.map((line, i) => (
                    <tr key={line.account_id + "-" + i} className="border-t border-border">
                      <td className="px-4 py-3">
                        <strong>{line.account_code}</strong>
                        <p className="mt-1 text-xs text-muted-foreground">{line.account_name}</p>
                      </td>
                      <td className="px-4 py-3 capitalize">{line.account_type}</td>
                      <td className="max-w-60 break-words px-4 py-3">
                        {line.cost_center_label ??
                          line.dimensions?.cost_center ??
                          (shown.dimension_requirements
                            ?.find((a) => a.account_id === line.account_id)
                            ?.required_dimensions.includes("cost_center")
                            ? "Choose during preparation"
                            : "Not required")}
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{line.debit}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{line.credit}</td>
                    </tr>
                  ))}
                  {!shown.lines.length && (
                    <tr>
                      <td className="px-4 py-8 text-center text-muted-foreground" colSpan={5}>
                        Approved results will supply the journal lines.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {shown.blocked.length > 0 && shown.proposal?.state !== "posted" && (
              <div
                className="mt-4 grid gap-2 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-4 text-sm text-[var(--nx-warning)]"
                role="status"
              >
                <strong>Resolve before proceeding</strong>
                {shown.blocked.map((message, i) => (
                  <p className="break-words" key={i}>
                    {message}
                  </p>
                ))}
              </div>
            )}
            {shown.proposal?.external_journal_id && (
              <p className="mt-4 break-all text-xs text-muted-foreground">
                Posted Finance journal: {shown.proposal.external_journal_id} · Accounting event:{" "}
                {shown.proposal.accounting_event_id}
              </p>
            )}
            <details className="mt-5 rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Immutable source evidence</summary>
              <p className="mt-3 break-all font-mono text-xs">
                {shown.proposal?.source_results_hash ?? shown.source_hash}
              </p>
              <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded bg-muted/50 p-3 font-mono text-xs">
                {JSON.stringify(
                  shown.proposal?.source_evidence ?? { state: "preview", run_number: shown.period?.run_number },
                  null,
                  2,
                )}
              </pre>
            </details>
            {!review && (
              <div className="mt-5 flex flex-wrap gap-3">
                {shown.allowed_actions.map((action) => (
                  <Button
                    key={action}
                    variant={action === "reject" ? "outline" : "default"}
                    className={action === "reject" ? "" : "text-primary-foreground!"}
                    disabled={busy}
                    onClick={() => {
                      setReview({ action, snapshot: shown });
                      setReason("");
                      setCostCentres({});
                      setCentreSearch("");
                      setError("");
                    }}
                  >
                    {titles[action]}
                  </Button>
                ))}
              </div>
            )}
            {review && (
              <form
                className="mt-5 grid gap-4 rounded-lg border border-primary/30 bg-muted/20 p-4"
                onSubmit={act}
                aria-label="Confirm Payroll journal action"
              >
                <h3 className="flex items-center gap-2 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  {titles[review.action]}
                </h3>
                <p className="text-sm text-muted-foreground">
                  This action uses the exact version and evidence shown above. Finance acceptance and posting require
                  separate authorized officers. Self-review and self-posting cannot be overridden.
                </p>
                {review.action === "prepare" &&
                  review.snapshot.dimension_requirements.some((a) => a.required_dimensions.includes("cost_center")) && (
                    <fieldset className="grid min-w-0 gap-4 rounded-lg border border-border p-4" disabled={busy}>
                      <legend className="px-1 text-sm font-semibold">Whole-account cost-centre allocation</legend>
                      <p className="text-sm text-muted-foreground">
                        Choose one company cost centre for each required account. This assigns the entire account
                        balance, including both sides if present. It does not split employee costs. An independent
                        Finance officer must review these mappings before posting.
                      </p>
                      <Field title="Find a company cost centre">
                        <Input
                          value={centreSearch}
                          onChange={(e) => setCentreSearch(e.target.value)}
                          maxLength={120}
                          placeholder="Search code or name"
                        />
                      </Field>
                      {data.loading && (
                        <p className="text-sm text-muted-foreground" role="status">
                          Loading company cost centres…
                        </p>
                      )}
                      {data.error && (
                        <p className="text-sm text-destructive" role="alert">
                          {String(data.error)}
                        </p>
                      )}
                      {review.snapshot.dimension_requirements
                        .filter((a) => a.required_dimensions.includes("cost_center"))
                        .map((account) => (
                          <Field title={account.account_code + " cost centre"} key={account.account_id}>
                            <select
                              required
                              className={selectClass + " w-full min-w-0"}
                              value={costCentres[account.account_id] ?? ""}
                              onChange={(e) => {
                                const id = e.target.value;
                                setCostCentres((v) => ({ ...v, [account.account_id]: id }));
                                const chosen = current?.cost_centres.find((c) => c.id === id);
                                if (chosen) setCentreLabels((v) => ({ ...v, [id]: chosen.code + " · " + chosen.name }));
                              }}
                            >
                              <option value="">Select a company cost centre</option>
                              {costCentres[account.account_id] &&
                                !(current?.cost_centres ?? []).some(
                                  (c) => c.id === costCentres[account.account_id],
                                ) && (
                                  <option value={costCentres[account.account_id]}>
                                    {centreLabels[costCentres[account.account_id] ?? ""] ??
                                      costCentres[account.account_id]}
                                  </option>
                                )}
                              {(current?.cost_centres ?? []).map((c) => (
                                <option value={c.id} key={c.id}>
                                  {c.code + " · " + c.name}
                                </option>
                              ))}
                            </select>
                          </Field>
                        ))}
                      {current?.cost_centres_truncated && (
                        <p className="text-sm text-muted-foreground" role="status">
                          Showing 500 matches. Refine the search to find another cost centre.
                        </p>
                      )}
                      {current && !current.cost_centres.length && !data.loading && (
                        <p className="text-sm text-muted-foreground" role="status">
                          No active company cost centres match. Update Cost Centres or change the search before
                          preparing.
                        </p>
                      )}
                    </fieldset>
                  )}
                <Field title="Journal decision reason">
                  <Textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    minLength={5}
                    maxLength={500}
                    required
                    disabled={busy}
                  />
                </Field>
                {review.action === "post" && (
                  <p className="text-sm font-semibold">
                    Confirming creates the General Ledger journal and marks this Payroll period posted.
                  </p>
                )}
                <div className="flex flex-wrap gap-3">
                  <Button type="submit" className="text-primary-foreground!" disabled={busy}>
                    {busy ? "Saving…" : "Confirm journal action"}
                  </Button>
                  <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                    Cancel review
                  </Button>
                </div>
              </form>
            )}
          </article>
          <details className={panel}>
            <summary className="cursor-pointer font-semibold">
              Journal decision history ({shown.history.length})
            </summary>
            <ol className="mt-4 grid gap-3">
              {shown.history.map((event, i) => (
                <li className="min-w-0 border-l-2 border-primary/30 pl-3 text-sm" key={i}>
                  <strong className="capitalize">{event.action}</strong>
                  <p className="mt-1 break-words">{event.reason}</p>
                  <p className="mt-1 break-all text-xs text-muted-foreground">
                    {event.actor_id} · {new Date(event.occurred_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          </details>
        </>
      )}
    </section>
  );
}
