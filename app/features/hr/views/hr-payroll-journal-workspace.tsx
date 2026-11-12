"use client";
import { WorkTable } from "@/shared/ui/work-table";
import { WorkForm } from "@/shared/ui/work-form";

import { payrollNavigationContext } from "../components/payroll-navigation";
import { useMemo, useRef, useState } from "react";
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
import { Field, State, panel, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { HrMasterStatusFilter } from "../components/hr-master-status-filter";
import {
  HrDetailGroup,
  HrDetailSection,
  HrDetailSummary,
  HrDetailTile,
  hrDisplayDate,
} from "../components/hr-detail-tile";
import { SearchableSelect } from "@/shared/ui/searchable-select";
const titles = {
  prepare: "Prepare accrual proposal",
  accept: "Accept for Finance posting",
  reject: "Reject for a new revision",
  post: "Post to General Ledger",
};
type Review = { action: HrPayrollJournalAction["action"]; snapshot: HrPayrollJournalWorkspace };
type StatusFilter = "all" | "pending" | "approved" | "rejected";
const statusOptions: readonly { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
];
/** Proposal states: prepared -> accepted -> posted, or rejected. No proposal yet is a pending preview. */
/** Accounts that need a whole-account cost centre: lines already tagged with an employee's cost centre do not. */
function accountsNeedingCostCentre(snapshot: HrPayrollJournalWorkspace) {
  return snapshot.dimension_requirements.filter(
    (a) =>
      a.required_dimensions.includes("cost_center") &&
      snapshot.lines.some((l) => l.account_id === a.account_id && !l.dimensions?.cost_center),
  );
}
function statusGroup(snapshot: HrPayrollJournalWorkspace): Exclude<StatusFilter, "all"> {
  const state = snapshot.proposal?.state;
  if (state === "accepted" || state === "posted") return "approved";
  if (state === "rejected") return "rejected";
  return "pending";
}
const th = "whitespace-nowrap px-4 py-3";
const td = "px-4 py-3";
const REVIEW_FORM_ID = "payroll-journal-review";
export function HrPayrollJournalWorkspace({
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
  const [choice] = useState(initial?.company_id ?? ""),
    [month, setMonth] = useState(initial?.month.slice(0, 7) ?? localDate().slice(0, 7)),
    [postingDate, setPostingDate] = useState(""),
    [revision, setRevision] = useState(0),
    [review, setReview] = useState<Review | null>(null),
    [reason, setReason] = useState(""),
    [costCentres, setCostCentres] = useState<Record<string, string>>({}),
    [centreLabels, setCentreLabels] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [status, setStatus] = useState<StatusFilter>("all"),
    [open, setOpen] = useState(false);
  const companies = useAttendanceRead(canRead ? "journal-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? "");
  const query = {
    company_id: company,
    month: month + "-01",
    cost_center_search: "",
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
            cost_center_mappings: accountsNeedingCostCentre(review.snapshot).map((a) => ({ account_id: a.account_id, cost_center_id: costCentres[a.account_id] ?? "" })),
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
  function startReview(action: HrPayrollJournalAction["action"], snapshot: HrPayrollJournalWorkspace) {
    setReview({ action, snapshot });
    setReason("");
    setCostCentres({});
    setError("");
  }
  function closeDrawer() {
    if (busy) return;
    setOpen(false);
    setReview(null);
    setReason("");
  }
  if (loading) return <div className={panel}>Loading Payroll journal…</div>;
  if (!canRead)
    return <div className={panel}>Payroll report, result and Finance journal read permissions are required.</div>;
  const current = data.data,
    shown = review?.snapshot ?? current,
    visible = current && (status === "all" || statusGroup(current) === status) ? current : null,
    pageError = companies.error || data.error || (!open ? error : "");
  return (
    <section
      aria-label="Payroll journal workspace"
      className="grid min-w-0 grid-cols-1 gap-3 font-sans [&_p]:mb-0 [&_dd]:font-sans! [&_select]:font-normal! [&_textarea]:font-normal!"
    >
      {companies.data && !companies.data.items.length && (
        <div className={panel}>No authorized company is available.</div>
      )}
      <div className="grid min-w-0 grid-cols-1 items-end gap-3 sm:grid-cols-2">
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
      </div>
      <HrMasterStatusFilter value={status} onChange={setStatus} options={statusOptions} label="Journal status" />
      {pageError && (
        <div
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {pageError}
        </div>
      )}
      {notice && !open && (
        <p
          role="status"
          className="rounded-lg border border-[var(--nx-success-border)] bg-[var(--nx-success-soft)] p-3 text-sm text-[var(--nx-success-text)]"
        >
          {notice}
        </p>
      )}
      <div className="relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm">
        <WorkTable tableId="app/features/hr/views/hr-payroll-journal-workspace:1" className="w-full border-collapse text-left text-sm" aria-label="Payroll journals">
          <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className={th}>Payroll month</th>
              <th className={th}>Journal</th>
              <th className={th}>Posting date</th>
              <th className={th + " text-right"}>Employees</th>
              <th className={th}>Currency</th>
              <th className={th + " text-right"}>Debit</th>
              <th className={th + " text-right"}>Credit</th>
              <th className={th + " text-right"}>Net payable</th>
              <th className={th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {data.loading && !current ? (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={9}>
                  <span role="status">Loading approved Payroll and Finance evidence…</span>
                </td>
              </tr>
            ) : visible ? (
              <HrClickableRow
                onOpen={() => {
                  setError("");
                  setNotice("");
                  setOpen(true);
                }}
              >
                <td className={td + " whitespace-nowrap font-medium"}>{visible.month.slice(0, 7)}</td>
                <td className={td + " whitespace-nowrap"}>
                  {visible.proposal
                    ? "Revision " + visible.proposal.revision + " · v" + visible.proposal.version
                    : "Preview"}
                </td>
                <td className={td + " whitespace-nowrap"}>{hrDisplayDate(visible.posting_date)}</td>
                <td className={td + " text-right tabular-nums"}>{visible.totals.employee_count}</td>
                <td className={td}>{visible.currency_code ?? "—"}</td>
                <td className={td + " text-right font-mono tabular-nums"}>{visible.totals.debit}</td>
                <td className={td + " text-right font-mono tabular-nums"}>{visible.totals.credit}</td>
                <td className={td + " text-right font-mono tabular-nums"}>{visible.totals.net}</td>
                <td className={td}>
                  <State value={visible.proposal?.state ?? visible.period?.state ?? "not_started"} />
                </td>
              </HrClickableRow>
            ) : (
              <tr>
                <td className="px-4 py-6 text-center text-muted-foreground" colSpan={9}>
                  {current ? "No journal matches this status." : "No Payroll journal for this company and month."}
                </td>
              </tr>
            )}
          </tbody>
        </WorkTable>
      </div>
      {shown && (
        <HrRecordDrawer
          open={open}
          onClose={closeDrawer}
          busy={busy}
          title={"Payroll accrual · " + shown.month.slice(0, 7)}
          description={review ? titles[review.action] : "Payroll accrual journal for the selected company and month."}
          error={open ? error : undefined}
          notice={open ? notice : undefined}
          footer={
            review ? (
              <>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
                <Button type="submit" form={REVIEW_FORM_ID} disabled={busy}>
                  {busy ? "Saving…" : "Confirm journal action"}
                </Button>
              </>
            ) : (
              shown.allowed_actions.map((action) => (
                <Button
                  key={action}
                  type="button"
                  variant={action === "reject" ? "outline" : "default"}
                  disabled={busy || data.loading}
                  onClick={() => startReview(action, shown)}
                >
                  {titles[action]}
                </Button>
              ))
            )
          }
        >
          <HrDetailSummary
            code={shown.proposal ? "Revision " + shown.proposal.revision : "Preview"}
            status={shown.proposal?.state ?? shown.period?.state ?? "not_started"}
          >
            {shown.proposal ? "Version " + shown.proposal.version : "No journal has been created"}
          </HrDetailSummary>
          {review && (
            <WorkForm
              id={REVIEW_FORM_ID}
              className="grid gap-4 rounded-lg border border-primary/30 bg-muted/20 p-4"
              onSubmit={act}
              aria-label="Confirm Payroll journal action"
            >
              <h3 className="font-semibold">{titles[review.action]}</h3>
              {review.action === "prepare" &&
                accountsNeedingCostCentre(review.snapshot).length > 0 && (
                  <fieldset className="grid min-w-0 gap-4 rounded-lg border border-border p-4" disabled={busy}>
                    <legend className="px-1 text-sm font-semibold">Whole-account cost-centre allocation</legend>
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
                    {accountsNeedingCostCentre(review.snapshot)
                      .map((account) => (
                        <div className="grid min-w-0 content-start gap-2 text-sm font-medium" key={account.account_id}>
                          <label htmlFor={"journal-centre-" + account.account_id}>{account.account_code + " cost centre"}</label>
                          <SearchableSelect
                            id={"journal-centre-" + account.account_id}
                            label={account.account_code + " cost centre"}
                            value={costCentres[account.account_id] ?? ""}
                            placeholder="Select a company cost centre"
                            searchPlaceholder="Search by code or name…"
                            required
                            loading={data.loading && !current}
                            options={[
                              ...(costCentres[account.account_id] &&
                              !(current?.cost_centres ?? []).some((c) => c.id === costCentres[account.account_id])
                                ? [
                                    {
                                      value: costCentres[account.account_id]!,
                                      label:
                                        centreLabels[costCentres[account.account_id] ?? ""] ??
                                        costCentres[account.account_id]!,
                                    },
                                  ]
                                : []),
                              ...(current?.cost_centres ?? []).map((c) => ({ value: c.id, label: c.code + " · " + c.name })),
                            ]}
                            onValueChange={(id) => {
                              setCostCentres((v) => ({ ...v, [account.account_id]: id }));
                              const chosen = current?.cost_centres.find((c) => c.id === id);
                              if (chosen) setCentreLabels((v) => ({ ...v, [id]: chosen.code + " · " + chosen.name }));
                            }}
                          />
                        </div>
                      ))}
                    {current && !current.cost_centres.length && !data.loading && (
                      <p className="text-sm text-muted-foreground" role="status">
                        No active company cost centres. Add one in Cost Centres before
                        preparing.
                      </p>
                    )}
                  </fieldset>
                )}
              <Field title="Journal decision reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              {review.action === "post" && (
                <p className="text-sm font-semibold">
                  Confirming creates the General Ledger journal and marks this Payroll period posted.
                </p>
              )}
            </WorkForm>
          )}
          {shown.blocked.length > 0 && shown.proposal?.state !== "posted" && (
            <div
              className="grid gap-2 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-3 text-sm text-[var(--nx-warning)]"
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
          <HrDetailGroup title="Totals">
            <HrDetailTile label="Accrual debits" value={shown.totals.debit} />
            <HrDetailTile label="Accrual credits" value={shown.totals.credit} />
            <HrDetailTile label="Employee net payable" value={shown.totals.net} />
            <HrDetailTile label="Employer contributions" value={shown.totals.employer_contributions} />
            <HrDetailTile label="Employees" value={shown.totals.employee_count} />
          </HrDetailGroup>
          <HrDetailGroup title="Journal">
            <HrDetailTile label="Posting date" value={hrDisplayDate(shown.posting_date)} />
            <HrDetailTile label="Payroll currency" value={shown.currency_code} />
            <HrDetailTile label="Base currency" value={shown.base_currency} />
            <HrDetailTile label="Exchange rate" value={shown.exchange_rate} />
            <HrDetailTile label="Prepared by" value={shown.proposal?.created_by} />
            <HrDetailTile label="Accepted by" value={shown.proposal?.accepted_by} />
            {shown.proposal?.rejected_by && <HrDetailTile label="Rejected by" value={shown.proposal.rejected_by} />}
            <HrDetailTile label="Posted by" value={shown.proposal?.posted_by} />
            <HrDetailTile label="Finance entry number" value={shown.proposal?.external_entry_number} mono />
            {shown.proposal?.external_journal_id && (
              <HrDetailTile label="Finance journal" value={shown.proposal.external_journal_id} mono />
            )}
            {shown.proposal?.accounting_event_id && (
              <HrDetailTile label="Accounting event" value={shown.proposal.accounting_event_id} mono />
            )}
          </HrDetailGroup>
          <HrDetailSection title={"Journal lines (" + shown.lines.length + ")"}>
            <div className="overflow-x-auto rounded-lg border border-border">
              <WorkTable tableId="app/features/hr/views/hr-payroll-journal-workspace:2" className="w-full border-collapse text-left text-sm">
                <thead className="border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className={th}>Account</th>
                    <th className={th}>Role</th>
                    <th className={th}>Cost centre</th>
                    <th className={th + " text-right"}>Debit</th>
                    <th className={th + " text-right"}>Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.lines.map((line, i) => (
                    <tr key={line.account_id + "-" + i} className="border-b border-border/70 last:border-0">
                      <td className={td}>
                        <span className="font-medium">{line.account_code}</span>
                        <span className="block text-xs text-muted-foreground">{line.account_name}</span>
                      </td>
                      <td className={td + " capitalize"}>{line.account_type}</td>
                      <td className={td + " max-w-48 break-words"}>
                        {line.cost_center_label ??
                          line.dimensions?.cost_center ??
                          (shown.dimension_requirements
                            ?.find((a) => a.account_id === line.account_id)
                            ?.required_dimensions.includes("cost_center")
                            ? "Choose during preparation"
                            : "Not required")}
                      </td>
                      <td className={td + " text-right font-mono tabular-nums"}>{line.debit}</td>
                      <td className={td + " text-right font-mono tabular-nums"}>{line.credit}</td>
                    </tr>
                  ))}
                  {!shown.lines.length && (
                    <tr>
                      <td className="px-4 py-6 text-center text-muted-foreground" colSpan={5}>
                        Approved results will supply the journal lines.
                      </td>
                    </tr>
                  )}
                </tbody>
              </WorkTable>
            </div>
          </HrDetailSection>
          <HrDetailSection title={"Decision history (" + shown.history.length + ")"}>
            {shown.history.length ? (
              <ol className="m-0 grid list-none gap-2 p-0">
                {shown.history.map((event, i) => (
                  <li className="min-w-0 border-l-2 border-primary/30 pl-3 text-sm" key={i}>
                    <span className="font-semibold capitalize">{event.action}</span>
                    <span className="block break-words">{event.reason}</span>
                    <span className="block break-all text-xs text-muted-foreground">
                      {event.actor_id} · {hrDisplayDate(event.occurred_at, true)}
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="text-sm text-muted-foreground">No decisions recorded.</p>
            )}
          </HrDetailSection>
          <details className="rounded-lg border border-border p-3 text-sm">
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
        </HrRecordDrawer>
      )}
    </section>
  );
}
