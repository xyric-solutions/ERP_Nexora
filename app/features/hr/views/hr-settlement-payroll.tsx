"use client";
import { formatHrMinor } from "../components/payroll-money";
import { useState } from "react";
import type { HrLifecycleCaseRecord, HrLifecycleCaseWorkspace, HrLifecycleCaseAction } from "@nexora/contracts";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, panel, selectClass, State } from "../components/hr-workspace-controls";
export function SettlementPayrollHandoff({
  record,
  w,
  busy,
  onPrepare,
  onNavigate,
}: {
  record: HrLifecycleCaseRecord;
  w: HrLifecycleCaseWorkspace;
  busy: boolean;
  onPrepare: (input: HrLifecycleCaseAction) => void;
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const terms = record.terms,
    links = record.payroll_links;
  const [month, setMonth] = useState(links[0]?.month.slice(0, 7) ?? ""),
    [reason, setReason] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [mappings, setMappings] = useState(() =>
    terms.kind === "settlement"
      ? terms.lines.map((_, line_index) => {
          const old = links.find((l) => l.line_index === line_index);
          return { line_index, component_id: old?.component_id ?? "", exclusion_reason: old?.exclusion_reason ?? "" };
        })
      : [],
  );
  if (terms.kind !== "settlement") return null;
  const defaultExit = w.exits.find((e) => e.id === terms.exit_case_id)?.terms;
  const monthValue = month
    ? month
    : defaultExit && "last_working_date" in defaultExit
      ? defaultExit.last_working_date.slice(0, 7)
      : "";
  return (
    <section className={panel + " min-w-0 space-y-4"} aria-label="Settlement Payroll handoff" data-settlement-payroll>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">Settlement → Payroll → Finance</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Send reviewed, unprocessed entitlements as draft Payroll adjustments. Payroll approval, statutory
            calculation and the Finance journal remain separate controls. Banking payment is pending integration.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onNavigate(
                "hr",
                "payroll-inputs",
                JSON.stringify({ company_id: w.company_id, month: monthValue + "-01" }),
              )
            }
          >
            Payroll adjustments
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              onNavigate(
                "hr",
                "payroll-journal",
                JSON.stringify({ company_id: w.company_id, month: monthValue + "-01" }),
              )
            }
          >
            Finance journal
          </Button>
        </div>
      </div>
      {links.length > 0 ? (
        <div className="relative max-w-full overflow-x-auto">
          <table className="w-full min-w-[660px] text-left text-sm">
            <caption className="sr-only">Latest settlement Payroll inputs and Finance progress</caption>
            <thead>
              <tr>
                {["Statement line", "Payroll input", "Finance progress", "Source"].map((t) => (
                  <th key={t} scope="col" className="border-b p-3">
                    {t}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {links.map((l) => (
                <tr key={l.line_index} className="border-b">
                  <td className="max-w-64 break-words p-3">
                    {l.line_index + 1}. {terms.lines[l.line_index]?.description}
                    <p className="text-xs text-muted-foreground">
                      Revision {l.revision} · {l.month}
                    </p>
                  </td>
                  <td className="p-3">
                    <State value={l.state} />
                    {l.exclusion_reason && <p className="mt-2 max-w-64 break-words">{l.exclusion_reason}</p>}
                  </td>
                  <td className="p-3">
                    {l.finance_state === "reversed"
                      ? "Finance journal reversed; review Payroll"
                      : l.journal_id
                        ? "Posted through Payroll"
                        : l.state === "excluded"
                          ? "Outside this Payroll handoff"
                          : l.period_state
                            ? "Payroll " + l.period_state
                            : "Awaiting Payroll processing"}
                    <p className="text-xs text-muted-foreground">Payment: Banking integration pending</p>
                  </td>
                  <td className="max-w-64 break-all p-3 text-xs">
                    {l.adjustment_id ?? "Documented exclusion"}
                    {l.result_id && <p className="mt-1">Result {l.result_id}</p>}
                    {l.journal_id && <p className="mt-1">Journal {l.journal_id}</p>}
                    <p className="mt-1">Prepared by {l.created_by}</p>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {record.state === "cancelled"
            ? "This statement is cancelled and cannot create Payroll inputs. Create and independently approve a replacement statement."
            : record.void_requests.some((v) => v.state === "submitted")
              ? "Payroll handoff is paused until the independent statement correction review is resolved."
              : "No Payroll inputs prepared. Statement approval alone does not post a journal or make payment."}
        </p>
      )}
      {record.can_prepare_payroll && (
        <form
          className="min-w-0 space-y-4"
          aria-label="Prepare settlement Payroll inputs"
          onSubmit={(e) => {
            e.preventDefault();
            onPrepare({
              action: "prepare_payroll",
              company_id: w.company_id,
              id: record.id,
              expected_version: record.version,
              month: monthValue + "-01",
              unprocessed_entitlements_only: true,
              mappings: mappings.map((m) => ({ ...m, component_id: m.component_id || null })),
              reason,
            });
          }}
        >
          <h4 className="font-semibold">Prepare or replace rejected Payroll inputs</h4>
          <p className="text-sm text-muted-foreground">
            Use the approved exit month while Payroll is open. Exclude salary already included in a run, paid amounts,
            loan schedule references and asset recoveries requiring their own process. An existing draft, submitted,
            approved or consumed input is retained. Rejected inputs can be replaced with a new audited revision.
          </p>
          <Field title="Settlement Payroll month">
            <Input
              type="month"
              value={monthValue}
              required
              disabled={busy || links.length > 0}
              onChange={(e) => setMonth(e.target.value)}
            />
          </Field>
          {mappings.map((map, index) => {
            const line = terms.lines[index]!,
              old = links.find((l) => l.line_index === index),
              locked = !!old && !["rejected", "excluded"].includes(old.state);
            return (
              <fieldset key={index} className="min-w-0 space-y-3 rounded-lg border border-border p-3">
                <legend className="max-w-full break-words px-1 text-sm font-semibold">
                  Line {index + 1}: {line.description}
                </legend>
                <p className="break-words text-sm text-muted-foreground">
                  {line.direction} · {terms.currency} {formatHrMinor(line.amount_minor, record.evidence.money_scale)}
                </p>
                <Field title={"Payroll component for line " + (index + 1)}>
                  <select
                    className={selectClass}
                    value={map.component_id}
                    disabled={busy || locked}
                    onChange={(e) =>
                      setMappings((v) =>
                        v.map((m, i) =>
                          i === index ? { ...m, component_id: e.target.value, exclusion_reason: "" } : m,
                        ),
                      )
                    }
                  >
                    <option value="">Exclude from Payroll</option>
                    {w.payroll_components
                      .filter((c) => c.kind === line.direction)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code} · {c.name}
                        </option>
                      ))}
                  </select>
                </Field>
                {!map.component_id && (
                  <Field title={"Reason to exclude line " + (index + 1)}>
                    <Textarea
                      value={map.exclusion_reason}
                      required
                      minLength={5}
                      maxLength={500}
                      disabled={busy || locked}
                      onChange={(e) =>
                        setMappings((v) =>
                          v.map((m, i) => (i === index ? { ...m, exclusion_reason: e.target.value } : m)),
                        )
                      }
                    />
                  </Field>
                )}
                {locked && (
                  <p className="text-sm text-muted-foreground">
                    Existing {old.state} input retained; its terms cannot be overwritten.
                  </p>
                )}
              </fieldset>
            );
          })}
          <Field title="Payroll preparation reason">
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              required
              minLength={5}
              maxLength={500}
              disabled={busy}
            />
          </Field>
          <label htmlFor="settlement-unprocessed" className="flex items-start gap-2 text-sm">
            <Checkbox
              id="settlement-unprocessed"
              checked={confirmed}
              disabled={busy}
              onCheckedChange={(v) => setConfirmed(v === true)}
            />
            <span>
              I reviewed the sources. Included lines are new, unprocessed entitlements and do not duplicate Payroll,
              loan or payment records.
            </span>
          </label>
          <Button type="submit" disabled={busy || !confirmed} className="text-primary-foreground!">
            Prepare draft Payroll inputs
          </Button>
        </form>
      )}
    </section>
  );
}
