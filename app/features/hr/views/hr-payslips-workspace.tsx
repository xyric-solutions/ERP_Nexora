"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { Download, Printer, RefreshCw, FileText, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { useSession } from "@/lib/session/session-provider";
import { hrPayslipReleaseSchema, type HrPayslipWorkspace, type HrPayslipDetail } from "@nexora/contracts";
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
import { payslipHtml } from "../components/payslip-print";
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
    [filter, setFilter] = useState(""),
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
  const query = { company_id: company, month: month + "-01", search: filter, state, limit: 25, offset };
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
    d = detail.data;
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
  return (
    <div className="min-w-0 space-y-5" data-payslips-workspace>
      <p className="rounded-lg border border-border bg-muted p-3 text-sm text-muted-foreground">
        Published payslips retain the original approved run. Posted settlement supplements are separate correction
        statements in{" "}
        <Link className="font-medium underline underline-offset-4" href="/#/hr/final-settlements">
          Final Settlements
        </Link>
        ; they do not rewrite a published payslip or confirm payment.
      </p>
      <section className={panel + " space-y-4"}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-semibold">
              <FileText className="size-5" />
              Payslip publication
            </h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              Review posted salary calculations, release selected employees and open the frozen published payslip.
              Publication does not confirm payment.
            </p>
          </div>
          <Button variant="outline" onClick={() => onNavigate("hr", "payroll-journal")}>
            Payroll Journal
            <ArrowRight className="size-4" />
          </Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field title="Company">
            <select
              className={selectClass}
              disabled={!!review || busy}
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
              disabled={!!review || busy}
              value={month}
              onChange={(e) => {
                if (e.target.value) setMonth(e.target.value);
                reset();
              }}
            />
          </Field>
        </div>
        <form
          className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,180px)_auto_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            setFilter(search);
            reset();
          }}
        >
          <Field title="Search employee">
            <Input
              value={search}
              maxLength={120}
              disabled={!!review || busy}
              placeholder="Name or employee number"
              onChange={(e) => setSearch(e.target.value)}
            />
          </Field>
          <Field title="Publication status">
            <select
              className={selectClass}
              value={state}
              disabled={!!review || busy}
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
          <Button className="self-end" type="submit" variant="outline" disabled={!!review || busy}>
            Search
          </Button>
          <Button
            className="self-end"
            type="button"
            variant="outline"
            disabled={!!review || busy}
            onClick={() => {
              setRevision((v) => v + 1);
              reset();
            }}
          >
            <RefreshCw className="size-4" />
            Refresh
          </Button>
        </form>
      </section>
      {(error || companies.error || data.error || detail.error) && (
        <div role="alert" className={panel + " border-destructive text-destructive"}>
          {error || companies.error || data.error || detail.error}
        </div>
      )}
      {notice && (
        <p role="status" className={panel}>
          {notice}
        </p>
      )}
      {data.loading && <p role="status">Loading posted Payroll results…</p>}
      {w && (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric
              title="Posted results"
              value={w.counts.results}
              hint={"Payroll " + (w.period?.state ?? "not posted")}
            />
            <Metric title="Released" value={w.counts.released} hint="Frozen publication evidence" />
            <Metric title="Pending release" value={w.counts.pending} hint="Independent review required" />
          </div>
          {w.blocked.length > 0 && (
            <section className={panel + " border-[var(--nx-warning)]"}>
              <h3 className="font-semibold">Publication checks</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                {w.blocked.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </section>
          )}
          <section className={panel + " space-y-3"}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-base font-semibold">Employee payslips</h3>
              {w.can_release && (
                <Button
                  className="text-primary-foreground!"
                  disabled={!selection.length || !!review || busy}
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
            {!w.items.length ? (
              <p className="py-4 text-sm text-muted-foreground">
                No posted payslips match this company, month and filter.
              </p>
            ) : (
              <div
                className="max-w-full overflow-x-auto"
                role="region"
                aria-label="Payslip table; scroll horizontally for all columns"
              >
                <table className="w-full min-w-[780px] text-left text-sm">
                  <caption className="sr-only">Posted employee salary results and publication status</caption>
                  <thead className="border-b text-muted-foreground">
                    <tr>
                      <th className="px-3 py-3" scope="col">
                        <Checkbox
                          aria-label="Select eligible payslips on this page"
                          disabled={!!review || !shown.size}
                          checked={shown.size > 0 && selection.length === shown.size}
                          onCheckedChange={(v) => setSelected(v ? Array.from(shown) : [])}
                        />
                      </th>
                      {["Employee", "Gross", "Deductions", "Net pay", "Publication", "Action"].map((t) => (
                        <th key={t} className="px-3 py-3 font-medium" scope="col">
                          {t}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {w.items.map((i) => (
                      <tr key={i.result_id} className="border-b last:border-0">
                        <td className="px-3 py-4">
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
                        <td className="px-3 py-4">
                          <p className="font-medium">{i.employee_name}</p>
                          <p className="text-xs text-muted-foreground">
                            {i.employee_number} · {i.currency_code}
                          </p>
                        </td>
                        <td className="px-3 py-4 tabular-nums">{i.gross}</td>
                        <td className="px-3 py-4 tabular-nums">{i.deductions}</td>
                        <td className="px-3 py-4 font-semibold tabular-nums">{i.net}</td>
                        <td className="px-3 py-4">
                          <State value={i.state} />
                        </td>
                        <td className="px-3 py-4">
                          <Button size="sm" variant="outline" onClick={() => setOpened(i.result_id)}>
                            {i.state === "released" ? "Open" : "Preview"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
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
          </section>
          {review && (
            <form className={panel + " space-y-4"} onSubmit={release} aria-label="Release payslips review">
              <h3 className="text-lg font-semibold">Confirm payslip publication</h3>
              <p className="text-sm">
                Release {selected.length} employee payslip(s) for {review.month.slice(0, 7)}. Names, company labels,
                result lines and accounting references will be frozen.
              </p>
              <ul className="list-disc space-y-1 pl-5 text-sm">
                {review.items
                  .filter((i) => selected.includes(i.result_id))
                  .map((i) => (
                    <li key={i.result_id}>
                      {i.employee_name} ({i.employee_number}) · net {i.net} {i.currency_code}
                    </li>
                  ))}
              </ul>
              <Field title="Publication reason">
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  required
                  minLength={5}
                  maxLength={500}
                  disabled={busy}
                />
              </Field>
              <p className="text-sm text-muted-foreground">
                Published documents are immutable. This action does not send email, transfer money or change Payroll
                payment status.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" disabled={busy} className="text-primary-foreground!">
                  {busy ? "Publishing…" : "Confirm release"}
                </Button>
                <Button type="button" variant="outline" disabled={busy} onClick={() => setReview(null)}>
                  Cancel review
                </Button>
              </div>
            </form>
          )}
        </>
      )}
      {detail.loading && <p role="status">Opening payslip…</p>}
      {d && (
        <section className={panel + " space-y-4"} aria-label="Employee payslip document">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold">{d.document.employee.name}</h3>
              <p className="text-sm text-muted-foreground">
                {d.document.employee.number} · {d.document.period.month.slice(0, 7)} · {d.document.result.currency}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {d.release && (
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
              )}
              <Button variant="outline" onClick={() => setOpened("")}>
                Close document
              </Button>
            </div>
          </div>
          <State value={d.release ? "released" : "preview"} />
          <p className="text-sm text-muted-foreground">
            {d.document.company.name} · Payroll run {d.document.period.run_number}.{" "}
            {d.release?.workflow_managed
              ? "Published labels and amounts are frozen."
              : d.release
                ? "Historical release; labels are current."
                : "Preview only; labels freeze on release."}
          </p>
          <div className="max-w-full overflow-x-auto">
            <table className="w-full min-w-[430px] text-left text-sm">
              <caption className="sr-only">Payslip component breakdown</caption>
              <thead className="border-b text-muted-foreground">
                <tr>
                  <th scope="col" className="p-3">
                    Component
                  </th>
                  <th scope="col" className="p-3">
                    Type
                  </th>
                  <th scope="col" className="p-3 text-right">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody>
                {d.document.lines.map((l) => (
                  <tr key={l.position} className="border-b">
                    <td className="p-3">
                      {l.name} <span className="text-xs text-muted-foreground">({l.code})</span>
                    </td>
                    <td className="p-3">{l.kind.replaceAll("_", " ")}</td>
                    <td className="p-3 text-right tabular-nums">{l.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Metric title="Net pay" value={d.document.result.net} hint={d.document.result.currency} />
            <Metric
              title="Employer contributions"
              value={d.document.result.employer_contributions}
              hint="Outside employee net pay"
            />
          </div>
          <p className="text-sm">
            This payslip records Payroll calculation and publication. It does not confirm a bank transfer or payment.
          </p>
          {d.release && (
            <dl className="grid gap-3 text-xs sm:grid-cols-2">
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
                <dd className="break-all">{d.document.accrual?.entry_number ?? "Historical reference unavailable"}</dd>
              </div>
            </dl>
          )}
        </section>
      )}
      {w && (
        <section className={panel}>
          <h3 className="font-semibold">Publication history</h3>
          {!w.history.length ? (
            <p className="mt-2 text-sm text-muted-foreground">No publication actions for this period.</p>
          ) : (
            <ol className="mt-3 divide-y">
              {w.history.map((h, i) => (
                <li key={h.occurred_at + i} className="py-3 text-sm">
                  <p className="font-medium">
                    {h.action} · {h.actor_id}
                  </p>
                  <p className="mt-1 break-words text-muted-foreground">
                    {h.reason} · {new Date(h.occurred_at).toLocaleString()}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}
    </div>
  );
}
