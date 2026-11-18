import type { ConnectedReport } from "@nexora/contracts";

/** Quote every field and neutralize spreadsheet formulas, including whitespace. */
export const reportCsvCell = (value: string) =>
  `"${(/^\s*[-=+@]/.test(value) ? "'" : "") + value.replaceAll('"', '""')}"`;

/** String arithmetic only: preserve significant decimals instead of truncating. */
export function formatReportAmount(value: string, scale: number) {
  const [whole, rawFraction = ""] = value.split(".");
  const fraction = rawFraction.replace(/0+$/, "").padEnd(scale, "0");
  return `${whole!.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}${fraction ? `.${fraction}` : ""}`;
}

export function connectedReportCsv(report: ConnectedReport, rows: ConnectedReport["rows"], title: string) {
  const lines = [
    [title, `From ${report.from ?? ""}`, `As of ${report.as_of}`],
    ["Date", "Reference", "Name", "Currency", ...report.columns.map((column) => column.label), "Journal"],
    ...rows.map((row) => [
      row.date,
      row.code,
      row.name,
      row.currency,
      ...report.columns.map((column) => row.values[column.key] ?? ""),
      row.journal_id ?? "",
    ]),
    [],
    ["Full-filter totals"],
    ...report.totals.map((total) => [
      total.currency,
      ...Object.entries(total.values).map(([key, value]) => `${key}: ${value}`),
    ]),
    ...report.notes.map((note) => [note]),
  ];
  return "\uFEFF" + lines.map((line) => line.map(reportCsvCell).join(",")).join("\r\n");
}

export function downloadReportCsv(contents: string, filename: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
