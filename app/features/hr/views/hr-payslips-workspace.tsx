"use client";
import { useRef, useState } from "react";
import { Download, Printer, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session/session-provider";
import { hrPayslipReleaseSchema, type HrPayslipWorkspace, type HrPayslipDetail } from "@nexora/contracts";
import { HrApiClient } from "../api/hr-client";
import { Field, State, panel, selectClass, useAttendanceRead, localDate } from "../components/hr-workspace-controls";
import { HrClickableRow } from "../components/hr-clickable-row";
import { HrRecordDrawer } from "../components/hr-record-drawer";
import { payslipHtml } from "../components/payslip-print";

const tableWrap = "relative overflow-x-auto rounded-lg border border-border bg-card shadow-sm";
const tableClass = "w-full border-collapse text-left text-sm";
const theadClass =
  "border-b border-border bg-muted/60 text-xs font-semibold uppercase tracking-wide text-muted-foreground";
const th = "whitespace-nowrap px-3 py-2";
const td = "px-3 py-1.5";
const releaseFormId = "payslip-release-form";

export function HrPayslipsWorkspace({
  onNavigate,
}: {
  onNavigate: (module: string, page: string, reference?: string) => void;
}) {
  const { api, session, csrfToken, loading } = useSession(),
    client = new HrApiClient(api),
    canRead = ["hr.payroll.payslip.read", "hr.payroll.result.read"].every((p) => session?.user.permissions.includes(p));
  const [choice, setChoice] = useState(""),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [search, setSearch] = useState(""),
    [state, setState] = useState<"all" | "pending" | "released">("all"),
    [offset, setOffset] = useState(0),
    [revision, setRevision] = useState(0),
    [selected, setSelected] = useState<string[]>([]),
    [review, setReview] = useState<HrPayslipWorkspace | null>(null),
    [reason, setReason] = useState(""),
    [opened, setOpened] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const guard = useRef(false),
    retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const companies = useAttendanceRead(canRead ? "payslip-companies" : null, () => client.companies()),
    company = companies.data?.items.some((c) => c.id === choice) ? choice : (companies.data?.items[0]?.id ?? "");
  const query = { company_id: company, month: month + "-01", search, state, limit: 25, offset };
  const data = useAttendanceRead(canRead && company ? JSON.stringify([query, revision]) : null, () =>
    client.payslipWorkspace(query),
  );
  const detail = useAttendanceRead(
    canRead && company && opened ? JSON.stringify([company, opened, revision]) : null,
    () => client.payslipDetail(company, opened),
  );
  const w = data.data,
    shown = new Set(w?.items.filter((i) => i.can_release).map((i) => i.result_id) ?? []),
    selection = selected.filter((id) => shown.has(id)),
    d = detail.data,
    locked = !!review || busy;
  function reset() {
    setSelected([]);
    setOpened("");
    setOffset(0);
    setError("");
    setNotice("");
  }
  async function release(e: React.FormEvent) {
    e.preventDefault();
    if (!review || guard.current) return;
    const input = hrPayslipReleaseSchema.safeParse({
      company_id: review.company_id,
      month: review.month,
      result_ids: selected,
      source_hash: review.source_hash,
      reason,
    });
    if (!input.success) {
      setError(input.error.issues.map((i) => i.message).join(" "));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify(input.data);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await client.releasePayslips(input.data, csrfToken(), retry.current.key);
      retry.current = null;
      setNotice(`${input.data.result_ids.length} payslip(s) released. Published content is frozen.`);
      setSelected([]);
      setReview(null);
      setRevision((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Payslip release failed.");
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  function output(detail: HrPayslipDetail, print = false) {
    try {
      const html = payslipHtml(detail, getComputedStyle(document.body).fontFamily);
      if (print) {
        const frame = document.createElement("iframe");
        frame.title = "Print released payslip";
        frame.style.display = "none";
        frame.srcdoc = html;
        frame.onload = () => {
          frame.contentWindow?.addEventListener("afterprint", () => frame.remove(), { once: true });
          frame.contentWindow?.focus();
          frame.contentWindow?.print();
        };
        document.body.append(frame);
      } else {
        const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" })),
          link = document.createElement("a");
        link.href = url;
        link.download =
          `payslip-${detail.document.employee.number}-${detail.document.period.month.slice(0, 7)}.html`.replace(
            /[^A-Za-z0-9._-]/g,
            "-",
          );
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The payslip could not be exported.");
    }
  }
  if (loading) return <p role="status">Loading your secure workspace…</p>;
  if (!canRead)
    return (
      <section className={panel}>Company-scoped Payslip and Payroll result read permissions are required.</section>
    );
  const pageError = error || companies.error || data.error || detail.error;
  return (
    <div className="grid min-w-0 gap-4" data-payslips-workspace>
      <section className={panel} aria-label="Payslip filters">
        <div className="grid min-w-0 items-end gap-4 md:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1.5fr_1fr]">
          <Field title="Company">
            <select
              className={selectClass}
              disabled={locked}
              value={company}
              onChange={(e) => {
                setChoice(e.target.value);
                reset();
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
              className="box-border! min-w-0! max-w-full!"
              disabled={locked}
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
                reset();
              }}
            />
          </Field>
          <Field title="Search records">
            <Input
              value={search}
              maxLength={120}
              disabled={locked}
              placeholder="Name or employee number"
              onChange={(e) => {
                setSearch(e.target.value);
                reset();
              }}
            />
          </Field>
          <Field title="Publication status">
            <select
              className={selectClass}
              value={state}
              disabled={locked}
              onChange={(e) => {
                setState(e.target.value as typeof state);
                reset();
              }}
            >
              <option value="all">All results</option>
              <option value="pending">Pending release</option>
              <option value="released">Released</option>
            </select>
          </Field>
        </div>
      </section>
      {pageError && !review && !opened && (
        <div role="alert" className={panel + " border-destructive text-destructive"}>
          {pageError}
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
      {data.loading && !w && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading posted Payroll results…
        </p>
      )}
      {w && (
        <>
          {w.blocked.length > 0 && (
            <div
              role="note"
              className="rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-3 text-sm"
            >
              <p className="font-semibold">Publication checks</p>
              <ul className="mt-1 list-disc space-y-1 pl-5">
                {w.blocked.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => onNavigate("hr", "payroll-journal")}>
              Payroll Journal
              <ArrowRight className="size-4" />
            </Button>
            {w.can_release && (
              <Button
                size="sm"
                className="text-primary-foreground!"
                disabled={!selection.length || locked}
                onClick={() => {
                  setSelected(selection);
                  setReview(w);
                  setReason("");
                  setError("");
                }}
              >
                Release selected ({selection.length})
              </Button>
            )}
          </div>
          <div className={tableWrap} role="region" aria-label="Employee payslips">
            <table className={tableClass + " min-w-[760px]"}>
              <caption className="sr-only">Posted employee salary results and publication status</caption>
              <thead className={theadClass}>
                <tr>
                  <th className={th + " w-10"} scope="col">
                    <Checkbox
                      aria-label="Select eligible payslips on this page"
                      disabled={!!review || !shown.size}
                      checked={shown.size > 0 && selection.length === shown.size}
                      onCheckedChange={(v) => setSelected(v ? Array.from(shown) : [])}
                    />
                  </th>
                  <th className={th} scope="col">
                    Employee
                  </th>
                  <th className={th} scope="col">
                    Employee No.
                  </th>
                  <th className={th + " text-right"} scope="col">
                    Gross
                  </th>
                  <th className={th + " text-right"} scope="col">
                    Deductions
                  </th>
                  <th className={th + " text-right"} scope="col">
                    Net pay
                  </th>
                  <th className={th} scope="col">
                    Publication
                  </th>
                </tr>
              </thead>
              <tbody>
                {!w.items.length ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                      No posted payslips match this company, month and filter.
                    </td>
                  </tr>
                ) : (
                  w.items.map((i) => (
                    <HrClickableRow key={i.result_id} disabled={!!review} onOpen={() => setOpened(i.result_id)}>
                      <td className={td} onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={"Select " + i.employee_number}
                          disabled={!i.can_release || !!review}
                          checked={selection.includes(i.result_id)}
                          onCheckedChange={(v) =>
                            setSelected((ids) =>
                              v ? [...new Set([...ids, i.result_id])] : ids.filter((id) => id !== i.result_id),
                            )
                          }
                        />
                      </td>
                      <td className={td + " font-medium"}>{i.employee_name}</td>
                      <td className={td + " whitespace-nowrap text-muted-foreground"}>{i.employee_number}</td>
                      <td className={td + " text-right tabular-nums"}>{i.gross}</td>
                      <td className={td + " text-right tabular-nums"}>{i.deductions}</td>
                      <td className={td + " whitespace-nowrap text-right font-semibold tabular-nums"}>
                        {i.net} <span className="text-xs font-normal text-muted-foreground">{i.currency_code}</span>
                      </td>
                      <td className={td}>
                        <State value={i.state} />
                      </td>
                    </HrClickableRow>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
            <p className="text-muted-foreground">
              {w.total ? offset + 1 : 0}–{Math.min(offset + 25, w.total)} of {w.total}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={offset === 0 || !!review}
                onClick={() => {
                  setOffset((v) => Math.max(0, v - 25));
                  setSelected([]);
                }}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={offset + 25 >= w.total || !!review}
                onClick={() => {
                  setOffset((v) => v + 25);
                  setSelected([]);
                }}
              >
                Next
              </Button>
            </div>
          </div>
          <div className={tableWrap} role="region" aria-label="Publication history">
            <table className={tableClass}>
              <caption className="sr-only">Publication history for this period</caption>
              <thead className={theadClass}>
                <tr>
                  <th className={th} scope="col">
                    Action
                  </th>
                  <th className={th} scope="col">
                    Actor
                  </th>
                  <th className={th} scope="col">
                    Reason
                  </th>
                  <th className={th} scope="col">
                    Occurred
                  </th>
                </tr>
              </thead>
              <tbody>
                {!w.history.length ? (
                  <tr>
                    <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                      No publication actions for this period.
                    </td>
                  </tr>
                ) : (
                  w.history.map((h, i) => (
                    <tr key={h.occurred_at + i} className="border-b border-border/70 last:border-0">
                      <td className={td + " font-medium"}>{h.action}</td>
                      <td className={td + " break-all"}>{h.actor_id}</td>
                      <td className={td + " break-words"}>{h.reason}</td>
                      <td className={td + " whitespace-nowrap"}>{new Date(h.occurred_at).toLocaleString()}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
      <HrRecordDrawer
        open={!!review}
        onClose={() => setReview(null)}
        busy={busy}
        title="Confirm payslip publication"
        description="Release the selected employee payslips; names, labels, result lines and accounting references are frozen."
        error={review ? error : undefined}
        footer={
          <Button type="submit" form={releaseFormId} disabled={busy} className="text-primary-foreground!">
            {busy ? "Publishing…" : "Confirm release"}
          </Button>
        }
      >
        {review && (
          <form id={releaseFormId} className="grid gap-4" onSubmit={release} aria-label="Release payslips review">
            <p className="text-sm">
              Release {selected.length} employee payslip(s) for {review.month.slice(0, 7)}.
            </p>
            <div className={tableWrap}>
              <table className={tableClass}>
                <caption className="sr-only">Payslips selected for release</caption>
                <thead className={theadClass}>
                  <tr>
                    <th className={th} scope="col">
                      Employee
                    </th>
                    <th className={th + " text-right"} scope="col">
                      Net pay
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {review.items
                    .filter((i) => selected.includes(i.result_id))
                    .map((i) => (
                      <tr key={i.result_id} className="border-b border-border/70 last:border-0">
                        <td className={td}>
                          {i.employee_name} <span className="text-muted-foreground">({i.employee_number})</span>
                        </td>
                        <td className={td + " whitespace-nowrap text-right tabular-nums"}>
                          {i.net} {i.currency_code}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Field title="Publication reason">
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={500}
                disabled={busy}
              />
            </Field>
          </form>
        )}
      </HrRecordDrawer>
      <HrRecordDrawer
        open={!!opened}
        onClose={() => setOpened("")}
        title={d ? d.document.employee.name : "Payslip"}
        description="Payslip records Payroll calculation and publication; it does not confirm a bank transfer or payment."
        error={opened ? error || detail.error : undefined}
        footer={
          d?.release ? (
            <>
              <Button variant="outline" onClick={() => output(d)}>
                <Download className="size-4" />
                Download payslip
              </Button>
              <Button variant="outline" onClick={() => output(d, true)}>
                <Printer className="size-4" />
                Print
              </Button>
            </>
          ) : undefined
        }
      >
        {detail.loading && !d && (
          <p role="status" className="text-sm text-muted-foreground">
            Opening payslip…
          </p>
        )}
        {d && (
          <section className="grid gap-4" aria-label="Employee payslip document">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm text-muted-foreground">
                {d.document.employee.number} · {d.document.period.month.slice(0, 7)} · {d.document.result.currency}
              </p>
              <State value={d.release ? "released" : "preview"} />
            </div>
            <p className="text-sm text-muted-foreground">
              {d.document.company.name} · Payroll run {d.document.period.run_number} ·{" "}
              {d.release?.workflow_managed
                ? "Published labels and amounts are frozen."
                : d.release
                  ? "Historical release; labels are current."
                  : "Preview only; labels freeze on release."}
            </p>
            <div className={tableWrap}>
              <table className={tableClass}>
                <caption className="sr-only">Payslip component breakdown</caption>
                <thead className={theadClass}>
                  <tr>
                    <th scope="col" className={th}>
                      Component
                    </th>
                    <th scope="col" className={th}>
                      Type
                    </th>
                    <th scope="col" className={th + " text-right"}>
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {d.document.lines.map((l) => (
                    <tr key={l.position} className="border-b border-border/70 last:border-0">
                      <td className={td}>
                        {l.name} <span className="text-xs text-muted-foreground">({l.code})</span>
                      </td>
                      <td className={td + " capitalize"}>{l.kind.replaceAll("_", " ")}</td>
                      <td className={td + " text-right tabular-nums"}>{l.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <dl className="grid gap-x-4 gap-y-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Net pay</dt>
                <dd className="font-semibold tabular-nums">
                  {d.document.result.net} {d.document.result.currency}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Employer contributions</dt>
                <dd className="tabular-nums">{d.document.result.employer_contributions}</dd>
              </div>
              {d.release && (
                <>
                  <div>
                    <dt className="text-muted-foreground">Release</dt>
                    <dd className="break-all">{d.release.id}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Published by / at</dt>
                    <dd className="break-all">
                      {d.release.released_by} · {new Date(d.release.released_at).toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Publication hash</dt>
                    <dd className="break-all">{d.release.publication_hash ?? "Legacy release"}</dd>
                  </div>
                  <div>
                    <dt className="text-muted-foreground">Accrual journal</dt>
                    <dd className="break-all">
                      {d.document.accrual?.entry_number ?? "Historical reference unavailable"}
                    </dd>
                  </div>
                </>
              )}
            </dl>
          </section>
        )}
      </HrRecordDrawer>
    </div>
  );
}
