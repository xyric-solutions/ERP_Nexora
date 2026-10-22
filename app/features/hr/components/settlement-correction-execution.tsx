"use client";
import { useId, useState } from "react";
import type { HrLifecycleCaseAction, HrLifecycleCaseRecord } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, localDate } from "./hr-workspace-controls";
export function SettlementCorrectionExecution({
  record,
  company,
  busy,
  onCommand,
}: {
  record: HrLifecycleCaseRecord;
  company: string;
  busy: boolean;
  onCommand: (input: HrLifecycleCaseAction) => Promise<void>;
}) {
  const taxReviewId = useId();
  const [reviewed, setReviewed] = useState(false),
    [taxable, setTaxable] = useState<number[]>(
      record.terms.kind === "settlement"
        ? record.terms.lines.flatMap((x, i) => (x.direction === "earning" ? [i] : []))
        : [],
    ),
    [decision, setDecision] = useState<{
      id: string;
      action: "approve_payroll_correction" | "reject_payroll_correction" | "post_payroll_correction";
    } | null>(null);
  const w = record.financial_corrections;
  if (!w || record.terms.kind !== "settlement") return null;
  const approved = w.records.find((x) => x.state === "approved"),
    active = approved && w.executions.some((x) => x.correction_id === approved.id && x.state !== "rejected");
  return (
    <section
      aria-label="Supplemental settlement Payroll"
      className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4"
    >
      <h4 className="font-semibold">Supplemental Payroll and Finance</h4>
      <p className="text-sm text-muted-foreground">
        Retained earned-month tax rules recalculate the corrected inputs and any later finalized employee months. The
        supplement posts only the account differences. Original results, journals and payslips remain available for
        audit.
      </p>
      <p className="rounded-md border border-border bg-muted p-3 text-sm">
        Complete the original settlement inputs and post its Payroll accrual first. Posting a supplement updates Payroll
        tax carry-forwards and Finance; it does not confirm payment or change a Banking batch. Payment reconciliation
        remains with Banking.
      </p>
      {approved && !active && w.can_calculate && (
        <form
          aria-label="Calculate settlement Payroll supplement"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const data = new FormData(event.currentTarget);
            await onCommand({
              action: "calculate_payroll_correction",
              company_id: company,
              id: record.id,
              expected_version: record.version,
              correction_id: approved.id,
              correction_source_hash: w.source_hash,
              posting_date: String(data.get("posting_date")),
              taxable_lines: taxable,
              tax_treatment_reviewed: true,
              reason: String(data.get("reason")),
            });
          }}
        >
          <Field title="Correction posting date">
            <Input type="date" name="posting_date" defaultValue={localDate()} required disabled={busy} />
          </Field>
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <legend className="px-1 text-sm font-medium">Reviewed taxable treatment of earning differences</legend>
            {record.terms.lines.map((line, index) =>
              line.direction === "earning" ? (
                <label key={index} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={taxable.includes(index)}
                    disabled={busy}
                    onCheckedChange={(checked) =>
                      setTaxable((current) =>
                        checked === true
                          ? [...current.filter((x) => x !== index), index]
                          : current.filter((x) => x !== index),
                      )
                    }
                  />
                  <span className="break-words">
                    Treat the difference for {line.description} as taxable under the earned-month policy
                  </span>
                </label>
              ) : null,
            )}
            <label htmlFor={taxReviewId} className="flex items-start gap-2 text-sm">
              <Checkbox
                id={taxReviewId}
                checked={reviewed}
                disabled={busy}
                onCheckedChange={(value) => setReviewed(value === true)}
              />
              <span>
                I reviewed the earned-month tax treatment against the supporting authority. Retained tax rates and
                declarations will be used.
              </span>
            </label>
          </fieldset>
          <Field title="Supplement calculation reason">
            <Textarea name="reason" minLength={5} maxLength={500} required disabled={busy} />
          </Field>
          <Button type="submit" disabled={busy || !reviewed}>
            Calculate Payroll supplement
          </Button>
        </form>
      )}
      {approved && !active && !w.can_calculate && (
        <p className="text-sm text-muted-foreground">
          An authorized Payroll officer with company-scoped result, report and Finance read access must prepare this
          supplement.
        </p>
      )}
      {w.executions.map((x) => (
        <article key={x.id} className="min-w-0 space-y-3 rounded-md border border-border bg-background p-3 text-sm">
          <h5 className="font-semibold">
            {x.state === "posted"
              ? "Supplement posted to Payroll and Finance"
              : x.state === "approved"
                ? "Approved supplement · awaiting Finance posting"
                : x.state === "rejected"
                  ? "Rejected supplemental calculation"
                  : "Calculated supplement · independent review required"}
          </h5>
          <p className="break-words">{x.reason}</p>
          <p>
            Net difference after tax:{" "}
            <strong className="tabular-nums">
              {x.net_delta} {record.terms.kind === "settlement" ? record.terms.currency : ""}
            </strong>
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {x.months.map((month) => (
              <div key={month.result_id} className="min-w-0 space-y-1 rounded-md border border-border p-3 text-xs">
                <p className="font-medium">Earned month {month.month.slice(0, 7)}</p>
                <p className="break-words">
                  Gross: {month.before_gross} → {month.after_gross}
                </p>
                <p className="break-words">
                  Deductions: {month.before_deductions} → {month.after_deductions}
                </p>
                <p className="break-words">
                  Net: {month.before_net} → {month.after_net}
                </p>
              </div>
            ))}
          </div>
          {x.leave_changes.map((line) => (
            <p key={line.source_id} className="break-words">
              Reviewed encashed days: {line.original_days} → {line.corrected_days} · balance change {line.delta_days}{" "}
              days
            </p>
          ))}
          <p>Posting date: {x.posting_date}</p>
          <p className="break-words text-xs text-muted-foreground">
            Prepared by {x.created_by}
            {x.approved_by ? ` · reviewed by ${x.approved_by}` : ""}
            {x.posted_by ? ` · posted by ${x.posted_by}` : ""}
          </p>
          {x.decision_reason && <p className="break-words">Decision: {x.decision_reason}</p>}
          {x.entry_number && <p className="break-words font-medium">Finance entry: {x.entry_number}</p>}
          <details className="min-w-0">
            <summary className="cursor-pointer font-medium">
              Reviewed account differences ({x.journal_lines.length})
            </summary>
            <div className="mt-2 grid gap-2">
              {x.journal_lines.map((line) => (
                <div key={line.account_id} className="min-w-0 rounded-md border border-border p-2 text-xs">
                  <p className="break-all">{line.account_id}</p>
                  <p className="break-words tabular-nums">
                    Debit {line.debit} · Credit {line.credit}
                  </p>
                </div>
              ))}
            </div>
          </details>
          <div className="flex flex-wrap gap-2">
            {x.allowed_actions.map((action) => (
              <Button
                key={action}
                type="button"
                size="sm"
                variant={action === "reject_payroll_correction" ? "outline" : "default"}
                disabled={busy}
                onClick={() => setDecision({ id: x.id, action: action as NonNullable<typeof decision>["action"] })}
              >
                {action === "approve_payroll_correction"
                  ? "Review supplemental approval"
                  : action === "reject_payroll_correction"
                    ? "Reject supplemental calculation"
                    : "Post supplemental Finance entry"}
              </Button>
            ))}
          </div>
          {decision?.id === x.id && x.allowed_actions.includes(decision.action) && (
            <form
              aria-label="Supplemental Payroll decision"
              className="space-y-3 rounded-md border border-border p-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                await onCommand({
                  action: decision.action,
                  company_id: company,
                  id: record.id,
                  expected_version: record.version,
                  execution_id: x.id,
                  execution_version: x.version,
                  execution_source_hash: x.source_hash,
                  reason: String(data.get("reason")),
                });
              }}
            >
              <p>
                {decision.action === "post_payroll_correction"
                  ? "Post the independently approved differences to actual Finance. This action does not confirm payment."
                  : decision.action === "approve_payroll_correction"
                    ? "Approve the retained tax-rule recalculation, taxable treatment and exact account differences."
                    : "Reject this unposted calculation. Its evidence stays in the audit record."}
              </p>
              <Field title="Supplemental Payroll decision reason">
                <Textarea name="reason" minLength={5} maxLength={500} required disabled={busy} />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Confirm supplemental action
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                  Cancel supplemental review
                </Button>
              </div>
            </form>
          )}
        </article>
      ))}
    </section>
  );
}
