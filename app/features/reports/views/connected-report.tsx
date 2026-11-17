"use client";
import { useCallback, useEffect, useState, useId } from "react";
import { connectedReportIds, type ConnectedReport, type ConnectedReportQuery } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WorkTable } from "@/shared/ui/work-table";
import { ApiError } from "@/lib/api/generated";
import { connectedReportCsv, formatReportAmount as formatted } from "../model/connected-report-export";

export const isConnectedReport = (page: string): page is ConnectedReportQuery["report"] =>
  connectedReportIds.some((id) => id === page);
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export function ConnectedReportView({
  report,
  title,
  onNavigate,
  compact = false,
}: {
  report: ConnectedReportQuery["report"];
  title: string;
  onNavigate: (module: string, page: string, id?: string) => void;
  compact?: boolean;
}) {
  const { api, activeCompany } = useSession();
  const fieldId = useId();
  const [asOf, setAsOf] = useState(localToday),
    [from, setFrom] = useState(""),
    [currency, setCurrency] = useState("");
  const [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(compact ? 10 : 50);
  const [loaded, setLoaded] = useState<{ scope: string; value: ConnectedReport } | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [exporting, setExporting] = useState(false);
  const company = activeCompany?.id;
  const query = useCallback(
    (start = offset, size = limit) =>
      `?${new URLSearchParams({ company_id: company ?? "", report, as_of: asOf, ...(from ? { from } : {}), ...(currency ? { currency } : {}), limit: String(size), offset: String(start) })}`,
    [company, report, asOf, from, currency, offset, limit],
  );
  const data = loaded?.scope === query() ? loaded.value : null;
  useEffect(() => {
    let active = true,
      request = 0;
    if (!company) return;
    const load = () => {
      const current = ++request;
      void api
        .getConnectedReport(query())
        .then((value) => {
          if (active && current === request) {
            setLoaded({ scope: query(), value });
            setError("");
          }
        })
        .catch((caught) => {
          if (active && current === request) {
            setLoaded(null);
            setError(
              caught instanceof ApiError
                ? caught.message
                : "Report could not be loaded. Check the connection and retry by changing a filter.",
            );
          }
        })
        .finally(() => {
          if (active && current === request) setBusy(false);
        });
    };
    const onReturn = () => {
      if (document.visibilityState === "visible") load();
    };
    load();
    window.addEventListener("focus", onReturn);
    document.addEventListener("visibilitychange", onReturn);
    return () => {
      active = false;
      window.removeEventListener("focus", onReturn);
      document.removeEventListener("visibilitychange", onReturn);
    };
  }, [api, company, query]);

  function change(work: () => void) {
    setBusy(true);
    setOffset(0);
    work();
  }
  async function exportCsv() {
    if (!data || exporting) return;
    setExporting(true);
    setError("");
    try {
      if (data.total_rows > 100000) throw new Error("Narrow the report to 100,000 rows or fewer before exporting.");
      const rows: ConnectedReport["rows"] = [];
      let snapshot: ConnectedReport = data;
      for (let start = 0; start < Math.max(1, data.total_rows); start += 100) {
        const page = await api.getConnectedReport(query(start, 100));
        if (page.total_rows !== data.total_rows || JSON.stringify(page.totals) !== JSON.stringify(data.totals))
          throw new Error("Report evidence changed during export. Reopen the report and export again.");
        rows.push(...page.rows);
        snapshot = page;
      }
      const url = URL.createObjectURL(
        new Blob([connectedReportCsv(snapshot, rows, title)], { type: "text/csv;charset=utf-8" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report}-${asOf}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <section className="space-y-3" aria-label={title} aria-busy={busy}>
      <header className="flex flex-wrap items-center justify-between gap-2">
        {compact ? (
          <h2 className="text-base font-semibold">{title}</h2>
        ) : (
          <h1 className="text-xl font-semibold">{title}</h1>
        )}
        <div className="flex gap-2 print:hidden">
          <Button type="button" size="sm" variant="outline" disabled={!data || exporting || busy} onClick={exportCsv}>
            {exporting ? "Exporting…" : "Export CSV"}
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={!data || busy} onClick={() => window.print()}>
            Print
          </Button>
        </div>
      </header>
      <div className="flex flex-wrap items-end gap-2 print:hidden">
        <label htmlFor={`${fieldId}-from`} className="grid gap-1 text-xs">
          From
          <Input
            type="date"
            id={`${fieldId}-from`}
            className="h-8 w-40"
            value={from}
            max={asOf}
            onChange={(e) => change(() => setFrom(e.target.value))}
          />
        </label>
        <label htmlFor={`${fieldId}-asof`} className="grid gap-1 text-xs">
          As of
          <Input
            type="date"
            id={`${fieldId}-asof`}
            required
            className="h-8 w-40"
            value={asOf}
            min={from}
            onChange={(e) => {
              if (e.target.value) change(() => setAsOf(e.target.value));
            }}
          />
        </label>
        <label htmlFor={`${fieldId}-currency`} className="grid gap-1 text-xs">
          Currency
          <Input
            className="h-8 w-28"
            id={`${fieldId}-currency`}
            value={currency}
            maxLength={3}
            placeholder="All"
            onChange={(e) => change(() => setCurrency(e.target.value.toUpperCase()))}
          />
        </label>
        {data ? (
          <span className="pb-1 text-xs text-muted-foreground">
            {data.total_rows} records · {data.from} to {data.as_of}
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {!company ? (
        <p className="text-sm">Select a company in the ERP header.</p>
      ) : !data && !error ? (
        <p role="status" className="text-sm text-muted-foreground">
          Loading report…
        </p>
      ) : null}
      {data ? (
        <>
          <div className="flex flex-wrap gap-x-5 gap-y-2 rounded-lg border border-border bg-card p-3 text-xs">
            {data.totals.map((total) => (
              <div key={total.currency}>
                <strong>{total.currency}</strong>
                <dl className="mb-0 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                  {Object.entries(total.values).map(([key, value]) => (
                    <div key={key} className="flex gap-1">
                      <dt>{data.columns.find((column) => column.key === key)?.label ?? key}:</dt>
                      <dd className="m-0 font-mono tabular-nums">{formatted(value, total.decimal_places)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
            {!data.totals.length ? <p className="m-0">No records match these filters.</p> : null}
          </div>
          <WorkTable
            tableId={`connected:${report}`}
            label={title}
            className="w-full text-left text-xs"
            keyboardScroll
            pagination={{
              offset,
              total: data.total_rows,
              limit,
              busy,
              onOffsetChange: (value) => {
                setBusy(true);
                setOffset(value);
              },
              onLimitChange: (value) => change(() => setLimit(value)),
            }}
          >
            <caption className="sr-only">
              {title}, {data.from} through {data.as_of}
            </caption>
            <thead>
              <tr className="border-b border-border bg-muted">
                <th scope="col" className="p-2">
                  Date / reference
                </th>
                <th scope="col" className="p-2">
                  Name / currency
                </th>
                {data.columns.map((column) => (
                  <th key={column.key} scope="col" className="p-2">
                    {column.label}
                  </th>
                ))}
                <th scope="col" className="p-2">
                  Journal
                </th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id} className="border-b border-border">
                  <td className="p-2">
                    <span className="block whitespace-nowrap text-muted-foreground">{row.date}</span>
                    <Button
                      type="button"
                      variant="link"
                      size="sm"
                      className="h-auto px-0 text-xs"
                      onClick={() => onNavigate(row.source_module, row.source_page, row.source_id || undefined)}
                    >
                      {row.code}
                    </Button>
                  </td>
                  <td className="p-2">
                    {row.name}
                    <span className="block text-muted-foreground">{row.currency}</span>
                  </td>
                  {data.columns.map((column) => (
                    <td
                      key={column.key}
                      className={`p-2 ${column.kind === "text" ? "" : "whitespace-nowrap font-mono tabular-nums"}`}
                    >
                      {column.kind === "amount"
                        ? formatted(
                            row.values[column.key] ?? "0",
                            column.key === "carrying"
                              ? Number(row.values.base_decimal_places ?? 2)
                              : (data.totals.find((total) => total.currency === row.currency)?.decimal_places ?? 2),
                          )
                        : (row.values[column.key] ?? "")}
                    </td>
                  ))}
                  <td className="p-2">
                    {row.journal_id ? (
                      <Button
                        type="button"
                        variant="link"
                        size="sm"
                        className="h-auto px-0 text-xs"
                        onClick={() => onNavigate("accounting", "journals", row.journal_id ?? undefined)}
                      >
                        {row.journal_id}
                      </Button>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
          <div className="space-y-1 text-xs text-muted-foreground">
            {data.notes.map((note) => (
              <p key={note} className="m-0">
                {note}
              </p>
            ))}
          </div>
          <p className="hidden text-xs print:block">
            Printed page contains the displayed {data.rows.length} rows of {data.total_rows}. CSV includes all filtered
            rows and totals.
          </p>
        </>
      ) : null}
    </section>
  );
}
