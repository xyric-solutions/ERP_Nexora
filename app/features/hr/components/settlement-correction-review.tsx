"use client";
import { calculateHrSettlementMinor } from "@nexora/contracts";
import { useState } from "react";
import type { HrLifecycleCaseAction, HrLifecycleCaseRecord } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field } from "./hr-workspace-controls";
import { formatHrMinor, parseHrCurrency } from "./payroll-money";

export function SettlementCorrectionReview({
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
  const [editing, setEditing] = useState(false),
    [decision, setDecision] = useState<{ id: string; decision: "approve" | "reject" } | null>(null),
    [error, setError] = useState("");
  const workspace = record.financial_corrections;
  if (!workspace || record.terms.kind !== "settlement") return null;
  const lines = record.terms.lines,
    scale = Number(record.evidence.money_scale ?? 2),
    currency = record.terms.currency;
  const currentAmount = (index: number) =>
    workspace.base_lines.find((x) => x.line_index === index)?.amount_minor ?? lines[index]!.amount_minor;
  const money = (value: string) => `${formatHrMinor(value, scale)} ${currency}`;
  return (
    <section
      aria-label="Financial correction reviews"
      className="min-w-0 space-y-4 rounded-lg border border-border bg-muted/30 p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h4 className="font-semibold">Corrections after Payroll or offboarding</h4>
        {workspace.can_request && !editing && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError("");
              setEditing(true);
            }}
          >
            Propose financial correction
          </Button>
        )}
      </div>
      <p className="text-sm text-muted-foreground">
        Propose corrected amounts against the original statement, with supporting authority. An independent officer
        reviews the difference. The original Payroll, tax, Finance, leave and employment records remain intact.
      </p>
      <p className="rounded-md border border-border bg-background p-3 text-sm">
        An approved review can proceed to the supplemental Payroll workflow below. Review approval alone does not post a
        journal, change leave balances or confirm payment. Banking remains deferred.
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {editing && workspace.can_request && (
        <form
          aria-label="Propose settlement financial correction"
          className="space-y-4"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            const data = new FormData(event.currentTarget);
            try {
              const corrections = lines.map((_, index) => ({
                line_index: index,
                corrected_minor: parseHrCurrency(String(data.get(`amount-${index}`)), scale),
                ...(lines[index]!.encashment_source_id
                  ? { corrected_leave_days: String(data.get(`leave-days-${index}`)) }
                  : {}),
              }));
              await onCommand({
                action: "request_financial_correction",
                company_id: company,
                id: record.id,
                expected_version: record.version,
                correction_source_hash: workspace.source_hash,
                corrections,
                authority_reference: String(data.get("authority")),
                reason: String(data.get("reason")),
              });
            } catch (e) {
              setError(e instanceof Error ? e.message : "Review the proposed amounts.");
            }
          }}
        >
          <p className="text-sm font-medium">
            Enter the full corrected amount for every line. Differences are calculated on the server; unchanged lines
            may retain their original amount.
          </p>
          {lines.map((line, index) => (
            <div key={index} className="min-w-0 rounded-md border border-border bg-background p-3">
              <p className="break-words text-sm font-medium">
                {line.description} · {line.direction}
              </p>
              <p className="my-2 text-xs text-muted-foreground">
                Current reviewed amount: {money(currentAmount(index))}
              </p>
              {line.encashment_source_id && (
                <Field title={`Corrected encashed days for line ${index + 1}`}>
                  <Input
                    name={`leave-days-${index}`}
                    inputMode="decimal"
                    required
                    disabled={busy}
                    defaultValue={
                      workspace.base_lines.find((x) => x.line_index === index)?.leave_days ??
                      line.calculation?.quantity ??
                      "0.0000"
                    }
                    onChange={(event) => {
                      try {
                        if (!line.calculation) return;
                        const value = calculateHrSettlementMinor(
                            event.target.value,
                            line.calculation.rate_minor,
                            line.calculation.rate_divisor,
                            line.calculation.rate_multiplier,
                          ),
                          amount = event.currentTarget.form?.elements.namedItem(`amount-${index}`);
                        if (amount instanceof HTMLInputElement) amount.value = formatHrMinor(value, scale);
                        setError("");
                      } catch {
                        setError("Use an exact encashed-day quantity within the approved rule cap.");
                      }
                    }}
                  />
                </Field>
              )}
              <Field title={`Corrected amount for line ${index + 1} (${currency})`}>
                <Input
                  name={`amount-${index}`}
                  inputMode="decimal"
                  defaultValue={formatHrMinor(currentAmount(index), scale)}
                  required
                  disabled={busy}
                />
              </Field>
            </div>
          ))}
          <Field title="Supporting authority or calculation reference">
            <Textarea
              name="authority"
              minLength={10}
              maxLength={1000}
              required
              disabled={busy}
              placeholder="Reference the approved policy, calculation review or supporting document."
            />
          </Field>
          <Field title="Reason for financial correction">
            <Textarea name="reason" minLength={5} maxLength={500} required disabled={busy} />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy}>
              Submit for independent review
            </Button>
            <Button type="button" variant="outline" disabled={busy} onClick={() => setEditing(false)}>
              Cancel proposal
            </Button>
          </div>
        </form>
      )}
      {workspace.records.length === 0 && !editing && (
        <p className="text-sm text-muted-foreground">No financial correction reviews recorded.</p>
      )}
      {workspace.records.map((review) => (
        <article
          key={review.id}
          className="min-w-0 space-y-3 rounded-md border border-border bg-background p-3 text-sm"
        >
          <p className="font-semibold">
            {review.state === "processed"
              ? "Processed through supplemental Payroll/Finance"
              : review.state === "approved"
                ? "Review approved · awaiting Payroll correction"
                : review.state === "submitted"
                  ? "Awaiting independent review"
                  : "Review rejected"}
          </p>
          <p className="break-words">{review.reason}</p>
          <p className="break-words text-muted-foreground">Authority: {review.authority_reference}</p>
          <p className="font-medium">
            Proposed net difference: {money(review.net_delta_minor)}{" "}
            {BigInt(review.net_delta_minor) > 0n
              ? "additional payable"
              : BigInt(review.net_delta_minor) < 0n
                ? "reduction or recovery to review"
                : "no net change"}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {review.lines.map((line) => (
              <dl key={line.line_index} className="min-w-0 rounded-md border border-border p-3 text-xs">
                <dt className="break-words font-medium">
                  {lines[line.line_index]?.description ?? `Line ${line.line_index + 1}`}
                </dt>
                <dd className="mt-1 break-words">
                  Previous reviewed {money(line.original_minor)} · proposed {money(line.corrected_minor)} · difference{" "}
                  {money(line.delta_minor)}
                </dd>
              </dl>
            ))}
          </div>
          {review.lines
            .filter((l) => l.corrected_leave_days !== undefined)
            .map((l) => (
              <p key={l.line_index} className="text-sm">
                Encashed days, line {l.line_index + 1}: {l.original_leave_days} → {l.corrected_leave_days}
              </p>
            ))}
          <p className="break-words text-xs text-muted-foreground">
            Requested by {review.requested_by} · {new Date(review.created_at).toLocaleString()}
          </p>
          {review.decision_reason && (
            <p className="break-words">
              Decision: {review.decision_reason} · {review.decided_by}
              {review.decided_at ? ` · ${new Date(review.decided_at).toLocaleString()}` : ""}
            </p>
          )}
          {review.stale && (
            <p role="status" className="rounded-md border border-border bg-muted p-3">
              Payroll or employment evidence changed. Reject this proposal and submit a fresh review.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {review.can_approve && (
              <Button
                size="sm"
                type="button"
                disabled={busy}
                onClick={() => setDecision({ id: review.id, decision: "approve" })}
              >
                Review approval
              </Button>
            )}
            {review.can_reject && (
              <Button
                size="sm"
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => setDecision({ id: review.id, decision: "reject" })}
              >
                Review rejection
              </Button>
            )}
          </div>
          {decision?.id === review.id && (decision.decision === "approve" ? review.can_approve : review.can_reject) && (
            <form
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const data = new FormData(event.currentTarget);
                await onCommand({
                  action: "decide_financial_correction",
                  company_id: company,
                  id: record.id,
                  expected_version: record.version,
                  correction_id: review.id,
                  decision: decision.decision,
                  reason: String(data.get("decision_reason")),
                });
              }}
            >
              <p className="font-medium">
                {decision.decision === "approve"
                  ? "Approve the reviewed differences for separate Payroll correction. No financial or leave entries will be changed by this review."
                  : "Reject this proposal and retain the original financial obligation."}
              </p>
              <Field title="Financial correction decision reason">
                <Textarea name="decision_reason" minLength={5} maxLength={500} required disabled={busy} />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy}>
                  Confirm {decision.decision === "approve" ? "review approval" : "rejection"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setDecision(null)}>
                  Cancel decision
                </Button>
              </div>
            </form>
          )}
        </article>
      ))}
      {workspace.records.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Latest 25 reviews shown; earlier decisions remain in the audit record. An approved review remains unresolved
          until its supplemental Payroll correction is posted.
        </p>
      )}
    </section>
  );
}
