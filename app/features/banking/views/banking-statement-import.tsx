"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  BankStatementImportDetail,
  BankStatementImportOptions,
  BankStatementLine,
  BankStatementMappingSnapshot,
  BankingCompanyDirectory,
} from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

export interface BankingStatementImportProps {
  importId?: string;
  onCancel: () => void;
  onOpenImport: (importId: string) => void;
  onStartReconciliation: (input: { importId: string; bankAccountId: string }) => void;
}

type BusyAction = "upload" | "mapping" | "line" | "validate" | "finalize" | "template";

interface RowResolution {
  included: boolean;
  reason: string;
  duplicateDisposition: BankStatementLine["duplicate_disposition"];
}

const emptyMapping: BankStatementMappingSnapshot = {
  file_format: "csv",
  delimiter: ",",
  encoding: "utf-8",
  worksheet: null,
  header_row: 1,
  date_format: "dd/MM/yyyy",
  amount_convention: "separate_debit_credit",
  signed_amount_direction: null,
  columns: {
    date: "Date",
    payment: "Payment",
    receipt: "Receipts",
    signed_amount: null,
    reference: "RefNo.",
    details: "Detail",
    transaction_type: "Transaction Type",
    account_text: "Account",
    payment_mode: "Payment Mode",
    running_balance: null,
  },
};

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The Bank Statement request could not be completed. Check the API connection and try again.";
}

function stateLabel(state: BankStatementImportDetail["state"]) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function fileFormat(file: File | null): "csv" | "xlsx" {
  return file?.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "csv";
}

function amountColumns(mapping: BankStatementMappingSnapshot) {
  return mapping.amount_convention === "signed_amount"
    ? { payment: null, receipt: null, signed_amount: mapping.columns.signed_amount || "Amount" }
    : {
        payment: mapping.columns.payment || "Payment",
        receipt: mapping.columns.receipt || "Receipts",
        signed_amount: null,
      };
}

export function BankingStatementImport({
  importId,
  onCancel,
  onOpenImport,
  onStartReconciliation,
}: BankingStatementImportProps) {
  const { api, session, csrfToken } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("banking.statement_import.read");
  const canCreate = permissions.includes("banking.statement_import.create") && !session?.impersonation;
  const canUpdate = permissions.includes("banking.statement_import.update") && !session?.impersonation;
  const canFinalize = permissions.includes("banking.statement_import.finalize") && !session?.impersonation;

  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [options, setOptions] = useState<BankStatementImportOptions | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [dateFormat, setDateFormat] = useState<BankStatementMappingSnapshot["date_format"]>("dd/MM/yyyy");
  const [statementReference, setStatementReference] = useState("");
  const [mappingProfileId, setMappingProfileId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [detail, setDetail] = useState<BankStatementImportDetail | null>(null);
  const [mapping, setMapping] = useState<BankStatementMappingSnapshot>(emptyMapping);
  const [mappingOpen, setMappingOpen] = useState(false);
  const [profileName, setProfileName] = useState("");
  const [rowResolutions, setRowResolutions] = useState<Record<string, RowResolution>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<BusyAction | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const idempotencyKeys = useRef(new Map<string, string>());

  function operationKey(action: string, fingerprint: string) {
    const lookup = `${action}:${fingerprint}`;
    const existing = idempotencyKeys.current.get(lookup);
    if (existing) return existing;
    const value = `web-bank-statement-${action}-${crypto.randomUUID()}`;
    idempotencyKeys.current.set(lookup, value);
    return value;
  }

  function applyDetail(next: BankStatementImportDetail) {
    setDetail(next);
    setCompanyId(next.company_id);
    setBankAccountId(next.bank_account_id);
    setStatementReference(next.statement_reference);
    if (next.mapping_snapshot) {
      setMapping(next.mapping_snapshot);
      setDateFormat(next.mapping_snapshot.date_format);
    }
    setMappingProfileId(next.mapping_profile_id ?? "");
    setRowResolutions(
      Object.fromEntries(
        next.lines.map((line) => [
          line.id,
          {
            included: line.inclusion_state === "included",
            reason: line.exclusion_reason ?? "",
            duplicateDisposition: line.duplicate_disposition,
          },
        ]),
      ),
    );
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!canRead) return;
        const directory = await client.companies();
        if (!active) return;
        setCompanies(directory.items);
        if (importId) {
          const imported = await client.statementImport(importId);
          if (!active) return;
          applyDetail(imported);
          const loadedOptions = await client.statementImportOptions({ company_id: imported.company_id });
          if (active) setOptions(loadedOptions);
          return;
        }
        const initialCompanyId = directory.items[0]?.id ?? "";
        setCompanyId(initialCompanyId);
        if (initialCompanyId) {
          const loadedOptions = await client.statementImportOptions({ company_id: initialCompanyId });
          if (active) {
            setOptions(loadedOptions);
            setBankAccountId(loadedOptions.bank_accounts[0]?.id ?? "");
            setDateFormat(loadedOptions.date_formats[0] ?? "dd/MM/yyyy");
          }
        }
      } catch (caught) {
        if (active) setError(errorMessage(caught));
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [canRead, client, importId]);

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setBankAccountId("");
    setMappingProfileId("");
    setError("");
    try {
      const loadedOptions = await client.statementImportOptions({ company_id: nextCompanyId });
      setOptions(loadedOptions);
      setBankAccountId(loadedOptions.bank_accounts[0]?.id ?? "");
      setDateFormat(loadedOptions.date_formats[0] ?? "dd/MM/yyyy");
    } catch (caught) {
      setError(errorMessage(caught));
    }
  }

  async function reload(importToLoad = detail?.id) {
    if (!importToLoad) return;
    const imported = await client.statementImport(importToLoad);
    applyDetail(imported);
  }

  async function upload() {
    if (!companyId || !bankAccountId || !statementReference.trim() || !file) {
      setError("Select a bank, enter the Statement Reference, and choose a CSV or Excel file.");
      return;
    }
    if (options && file.size > options.max_file_bytes) {
      setError(`The selected file exceeds the ${Math.floor(options.max_file_bytes / 1_048_576)} MiB limit.`);
      return;
    }
    const extension = file.name.toLowerCase();
    if (!extension.endsWith(".csv") && !extension.endsWith(".xlsx")) {
      setError("Only CSV and Excel (.xlsx) Bank Statement files are supported.");
      return;
    }
    setBusy("upload");
    setError("");
    setNotice("");
    try {
      const fingerprint = [
        companyId,
        bankAccountId,
        statementReference,
        dateFormat,
        mappingProfileId,
        file.name,
        file.size,
      ].join(":");
      const result = await client.uploadStatementImport(
        {
          company_id: companyId,
          bank_account_id: bankAccountId,
          statement_reference: statementReference.trim(),
          date_format: dateFormat,
          mapping_profile_id: mappingProfileId || null,
        },
        file,
        csrfToken(),
        operationKey("upload", fingerprint),
      );
      await reload(result.id);
      setNotice("Statement uploaded securely. Review the parsed rows before validation.");
      onOpenImport(result.id);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function downloadTemplate(format: "csv" | "xlsx") {
    setBusy("template");
    setError("");
    try {
      const blob = await client.downloadStatementTemplate(format);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bank-statement-template.${format}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveMapping() {
    if (!detail) return;
    setBusy("mapping");
    setError("");
    setNotice("");
    try {
      const normalized: BankStatementMappingSnapshot = {
        ...mapping,
        columns: { ...mapping.columns, ...amountColumns(mapping) },
      };
      const result = await client.updateStatementImportMapping(
        detail.id,
        {
          expected_version: detail.version,
          mapping: normalized,
          save_profile: profileName.trim() ? { name: profileName.trim() } : null,
        },
        csrfToken(),
        operationKey("mapping", `${detail.id}:${detail.version}:${JSON.stringify(normalized)}:${profileName}`),
      );
      await reload(result.id);
      setMappingOpen(false);
      setProfileName("");
      setNotice("Column mapping saved and the statement was parsed again.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function saveLine(line: BankStatementLine) {
    if (!detail) return;
    const resolution = rowResolutions[line.id];
    if (!resolution) return;
    if (!resolution.included && !resolution.reason.trim()) {
      setError(`Row ${line.source_row_number} needs an exclusion reason.`);
      return;
    }
    setBusy("line");
    setError("");
    setNotice("");
    try {
      const result = await client.updateStatementLine(
        detail.id,
        line.id,
        {
          expected_version: line.version,
          inclusion_state: resolution.included ? "included" : "excluded",
          exclusion_reason: resolution.included ? null : resolution.reason.trim(),
          duplicate_disposition: resolution.duplicateDisposition,
        },
        csrfToken(),
        operationKey("line", `${detail.id}:${line.id}:${line.version}:${JSON.stringify(resolution)}`),
      );
      await reload(result.id);
      setNotice(`Row ${line.source_row_number} updated.`);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function validateImport() {
    if (!detail) return;
    setBusy("validate");
    setError("");
    setNotice("");
    try {
      const validated = await client.validateStatementImport(
        detail.id,
        { expected_version: detail.version },
        csrfToken(),
        operationKey("validate", `${detail.id}:${detail.version}`),
      );
      await reload(validated.id);
      setNotice("Validation completed. Resolve any errors or duplicates before finalization.");
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  async function finalizeImport() {
    if (!detail) return;
    setBusy("finalize");
    setError("");
    setNotice("");
    try {
      await client.finalizeStatementImport(
        detail.id,
        { expected_version: detail.version },
        csrfToken(),
        operationKey("finalize", `${detail.id}:${detail.version}`),
      );
      onStartReconciliation({ importId: detail.id, bankAccountId: detail.bank_account_id });
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  if (!canRead) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>banking.statement_import.read is required.</AlertDescription>
      </Alert>
    );
  }

  const immutable = detail?.state === "finalized" || detail?.state === "rejected";
  const selectedBank = options?.bank_accounts.find((account) => account.id === bankAccountId);
  const profiles = options?.mapping_profiles.filter((profile) => profile.bank_account_id === bankAccountId) ?? [];

  return (
    <section aria-labelledby="bank-statement-import-heading" className="space-y-4">
      <div className="border-b border-border pb-3">
        <h1 id="bank-statement-import-heading" className="text-2xl font-semibold tracking-tight">
          Import Statement
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV or Excel statement, verify its mapping, then send validated rows to Bank Reconciliation.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Bank Statement could not be completed</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertTitle>Bank Statement updated</AlertTitle>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}
      {session?.impersonation ? (
        <Alert>
          <AlertTitle>Read-only impersonation</AlertTitle>
          <AlertDescription>
            End impersonation before uploading, changing, validating, or finalizing a statement.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold">⌄ Search</h2>
        </div>
        <div className="grid gap-4 p-4 md:grid-cols-2 lg:grid-cols-12">
          {companies.length > 1 ? (
            <label className="order-1 space-y-1 text-sm lg:col-span-4">
              <span>
                Company{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </span>
              <select
                aria-label="Company"
                className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
                disabled={loading || Boolean(detail)}
                value={companyId}
                onChange={(event) => void changeCompany(event.target.value)}
              >
                <option value="">Select company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} · {company.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="order-1 space-y-1 text-sm lg:col-span-4">
            <span>
              Bank{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </span>
            <select
              aria-label="Bank"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              disabled={loading || Boolean(detail)}
              value={bankAccountId}
              onChange={(event) => {
                setBankAccountId(event.target.value);
                setMappingProfileId("");
              }}
            >
              <option value="">Select Bank</option>
              {options?.bank_accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} · {account.currency} · {account.account_number_masked ?? account.reference}
                </option>
              ))}
            </select>
          </label>
          <label className="order-1 space-y-1 text-sm lg:col-span-4">
            <span>
              Date Format{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </span>
            <select
              aria-label="Date format"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              disabled={Boolean(detail)}
              value={dateFormat}
              onChange={(event) => setDateFormat(event.target.value as BankStatementMappingSnapshot["date_format"])}
            >
              {options?.date_formats.map((format) => (
                <option key={format} value={format}>
                  {format}
                </option>
              ))}
            </select>
          </label>
          <div className="order-3 space-y-1 border-t border-border pt-4 text-sm md:col-span-2 lg:col-span-12">
            <div className="max-w-md">
              <span>
                Statement Ref. No.{" "}
                <span aria-hidden="true" className="text-destructive">
                  *
                </span>
              </span>
              <Input
                aria-label="Statement reference"
                disabled={Boolean(detail)}
                maxLength={128}
                value={statementReference}
                onChange={(event) => setStatementReference(event.target.value)}
              />
            </div>
          </div>
          <div className="order-2 space-y-1 text-sm lg:col-span-4">
            <span>
              File{" "}
              <span aria-hidden="true" className="text-destructive">
                *
              </span>
            </span>
            <Input
              id="bank-statement-file"
              aria-label="Statement file"
              accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={Boolean(detail) || !canCreate}
              type="file"
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            <span className="block text-xs text-muted-foreground">
              CSV or Excel (.xlsx), up to {options ? Math.floor(options.max_file_bytes / 1_048_576) : 25} MiB and 1,000
              rows.
            </span>
          </div>
          <label className="order-2 space-y-1 text-sm lg:col-span-3">
            <span>Saved bank mapping</span>
            <select
              aria-label="Saved bank mapping"
              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm disabled:opacity-50"
              disabled={Boolean(detail)}
              value={mappingProfileId}
              onChange={(event) => setMappingProfileId(event.target.value)}
            >
              <option value="">Standard columns</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <div className="order-2 flex flex-wrap items-end gap-2 lg:col-span-5">
            <Button
              type="button"
              variant="link"
              disabled={busy !== null}
              onClick={() => void downloadTemplate(fileFormat(file))}
            >
              Export Sample File
            </Button>
            <Button
              type="button"
              className="rounded-full px-7"
              disabled={!canCreate || Boolean(detail) || busy !== null}
              onClick={() => void upload()}
            >
              {busy === "upload" ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </div>
      </div>

      {!detail ? (
        <div className="overflow-x-auto rounded-lg border border-border bg-card">
          <table className="w-full min-w-[1080px] border-collapse text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="px-3 py-3 text-left font-medium">Date</th>
                <th className="px-3 py-3 text-right font-medium">Payment</th>
                <th className="px-3 py-3 text-right font-medium">Receipts</th>
                <th className="px-3 py-3 text-left font-medium">Transaction Type</th>
                <th className="px-3 py-3 text-left font-medium">Account</th>
                <th className="px-3 py-3 text-left font-medium">Payment Mode</th>
                <th className="px-3 py-3 text-left font-medium">RefNo.</th>
                <th className="px-3 py-3 text-left font-medium">Detail</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td colSpan={9} className="px-4 py-10 text-center text-muted-foreground">
                  No parsed statement rows are available.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      ) : null}

      {detail ? (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge>{stateLabel(detail.state)}</Badge>
              <span className="font-medium">{detail.original_filename}</span>
              <span className="text-muted-foreground">{selectedBank?.account_name ?? detail.bank_account_name}</span>
              <span className="text-muted-foreground">Version {detail.version}</span>
            </div>
            <Button
              type="button"
              variant="outline"
              disabled={!canUpdate || immutable || busy !== null}
              onClick={() => setMappingOpen((open) => !open)}
            >
              {mappingOpen ? "Close mapping" : "Edit mapping"}
            </Button>
          </div>

          {mappingOpen ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <div className="mb-4">
                <h2 className="text-sm font-semibold">Column mapping</h2>
                <p className="text-xs text-muted-foreground">
                  Map this bank’s native headings. Saving reparses all rows; no ledger entry is created.
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="space-y-1 text-sm">
                  <span>File format</span>
                  <select
                    aria-label="Mapping file format"
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                    value={mapping.file_format}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        file_format: event.target.value as "csv" | "xlsx",
                        delimiter: event.target.value === "csv" ? (mapping.delimiter ?? ",") : null,
                        worksheet: event.target.value === "xlsx" ? (mapping.worksheet ?? "Sheet1") : null,
                      })
                    }
                  >
                    <option value="csv">CSV</option>
                    <option value="xlsx">Excel</option>
                  </select>
                </label>
                <div className="space-y-1 text-sm">
                  <label htmlFor="mapping-header-row">Header row</label>
                  <Input
                    id="mapping-header-row"
                    aria-label="Header row"
                    min={1}
                    max={100}
                    type="number"
                    value={mapping.header_row}
                    onChange={(event) => setMapping({ ...mapping, header_row: Number(event.target.value) || 1 })}
                  />
                </div>
                {mapping.file_format === "csv" ? (
                  <div className="space-y-1 text-sm">
                    <label htmlFor="mapping-delimiter">Delimiter</label>
                    <Input
                      id="mapping-delimiter"
                      aria-label="Delimiter"
                      maxLength={4}
                      value={mapping.delimiter ?? ""}
                      onChange={(event) => setMapping({ ...mapping, delimiter: event.target.value })}
                    />
                  </div>
                ) : (
                  <div className="space-y-1 text-sm">
                    <label htmlFor="mapping-worksheet">Worksheet</label>
                    <Input
                      id="mapping-worksheet"
                      aria-label="Worksheet"
                      maxLength={128}
                      value={mapping.worksheet ?? ""}
                      onChange={(event) => setMapping({ ...mapping, worksheet: event.target.value })}
                    />
                  </div>
                )}
                <label className="space-y-1 text-sm">
                  <span>Amount convention</span>
                  <select
                    aria-label="Amount convention"
                    className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                    value={mapping.amount_convention}
                    onChange={(event) =>
                      setMapping({
                        ...mapping,
                        amount_convention: event.target.value as BankStatementMappingSnapshot["amount_convention"],
                        signed_amount_direction:
                          event.target.value === "signed_amount"
                            ? (mapping.signed_amount_direction ?? "positive_money_in")
                            : null,
                      })
                    }
                  >
                    <option value="separate_debit_credit">Payment and receipt columns</option>
                    <option value="signed_amount">Signed amount</option>
                  </select>
                </label>
                <MappingInput
                  label="Date column"
                  value={mapping.columns.date}
                  onChange={(value) => setMapping({ ...mapping, columns: { ...mapping.columns, date: value } })}
                />
                {mapping.amount_convention === "separate_debit_credit" ? (
                  <>
                    <MappingInput
                      label="Payment column"
                      value={mapping.columns.payment ?? ""}
                      onChange={(value) => setMapping({ ...mapping, columns: { ...mapping.columns, payment: value } })}
                    />
                    <MappingInput
                      label="Receipt column"
                      value={mapping.columns.receipt ?? ""}
                      onChange={(value) => setMapping({ ...mapping, columns: { ...mapping.columns, receipt: value } })}
                    />
                  </>
                ) : (
                  <>
                    <MappingInput
                      label="Amount column"
                      value={mapping.columns.signed_amount ?? ""}
                      onChange={(value) =>
                        setMapping({ ...mapping, columns: { ...mapping.columns, signed_amount: value } })
                      }
                    />
                    <label className="space-y-1 text-sm">
                      <span>Positive amount means</span>
                      <select
                        aria-label="Signed amount direction"
                        className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                        value={mapping.signed_amount_direction ?? "positive_money_in"}
                        onChange={(event) =>
                          setMapping({
                            ...mapping,
                            signed_amount_direction: event.target.value as "positive_money_in" | "positive_money_out",
                          })
                        }
                      >
                        <option value="positive_money_in">Receipt / money in</option>
                        <option value="positive_money_out">Payment / money out</option>
                      </select>
                    </label>
                  </>
                )}
                <MappingInput
                  label="Reference column"
                  value={mapping.columns.reference ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, reference: value || null } })
                  }
                />
                <MappingInput
                  label="Detail column"
                  value={mapping.columns.details ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, details: value || null } })
                  }
                />
                <MappingInput
                  label="Transaction type column"
                  value={mapping.columns.transaction_type ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, transaction_type: value || null } })
                  }
                />
                <MappingInput
                  label="Account column"
                  value={mapping.columns.account_text ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, account_text: value || null } })
                  }
                />
                <MappingInput
                  label="Payment mode column"
                  value={mapping.columns.payment_mode ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, payment_mode: value || null } })
                  }
                />
                <MappingInput
                  label="Running balance column (optional)"
                  value={mapping.columns.running_balance ?? ""}
                  onChange={(value) =>
                    setMapping({ ...mapping, columns: { ...mapping.columns, running_balance: value || null } })
                  }
                />
                <div className="space-y-1 text-sm">
                  <label htmlFor="mapping-profile-name">Save as profile (optional)</label>
                  <Input
                    id="mapping-profile-name"
                    aria-label="Mapping profile name"
                    maxLength={160}
                    placeholder="e.g. Bank A current account"
                    value={profileName}
                    onChange={(event) => setProfileName(event.target.value)}
                  />
                </div>
              </div>
              <div className="mt-4 flex justify-end">
                <Button type="button" disabled={!canUpdate || busy !== null} onClick={() => void saveMapping()}>
                  {busy === "mapping" ? "Saving…" : "Save mapping"}
                </Button>
              </div>
            </div>
          ) : null}

          <div
            className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7"
            aria-label="Statement validation counts"
          >
            {(["total", "valid", "warning", "duplicate", "error", "excluded", "finalized"] as const).map((count) => (
              <div
                key={count}
                aria-label={`${count}: ${detail.counts[count]}`}
                className="rounded-lg border border-border bg-card px-3 py-2"
              >
                <div className="text-lg font-semibold tabular-nums">{detail.counts[count]}</div>
                <div className="text-xs capitalize text-muted-foreground">{count}</div>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto rounded-lg border border-border bg-card">
            <table className="w-full min-w-[1180px] border-collapse text-sm">
              <thead className="bg-primary text-primary-foreground">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Include</th>
                  <th className="px-3 py-2 text-left font-medium">Date</th>
                  <th className="px-3 py-2 text-right font-medium">Payment</th>
                  <th className="px-3 py-2 text-right font-medium">Receipts</th>
                  <th className="px-3 py-2 text-left font-medium">Transaction Type</th>
                  <th className="px-3 py-2 text-left font-medium">Account</th>
                  <th className="px-3 py-2 text-left font-medium">Payment Mode</th>
                  <th className="px-3 py-2 text-left font-medium">RefNo.</th>
                  <th className="px-3 py-2 text-left font-medium">Detail</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-left font-medium">Resolution</th>
                </tr>
              </thead>
              <tbody>
                {detail.lines.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="px-4 py-8 text-center text-muted-foreground">
                      No parsed statement rows are available.
                    </td>
                  </tr>
                ) : (
                  detail.lines.map((line) => {
                    const resolution = rowResolutions[line.id] ?? {
                      included: line.inclusion_state === "included",
                      reason: line.exclusion_reason ?? "",
                      duplicateDisposition: line.duplicate_disposition,
                    };
                    return (
                      <tr key={line.id} className="border-t border-border align-top">
                        <td className="px-3 py-2">
                          <Checkbox
                            aria-label={`Include row ${line.source_row_number}`}
                            checked={resolution.included}
                            disabled={!canUpdate || immutable || busy !== null}
                            onCheckedChange={(checked) =>
                              setRowResolutions((current) => ({
                                ...current,
                                [line.id]: { ...resolution, included: checked === true },
                              }))
                            }
                          />
                        </td>
                        <td className="px-3 py-2 whitespace-nowrap">{line.transaction_date ?? "—"}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.direction === "money_out" ? line.amount : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {line.direction === "money_in" ? line.amount : "—"}
                        </td>
                        <td className="px-3 py-2">{line.transaction_type ?? "—"}</td>
                        <td className="px-3 py-2">{line.account_text ?? "—"}</td>
                        <td className="px-3 py-2">{line.payment_mode ?? "—"}</td>
                        <td className="px-3 py-2">{line.reference ?? "—"}</td>
                        <td className="max-w-64 px-3 py-2">{line.details ?? "—"}</td>
                        <td className="px-3 py-2">
                          <Badge variant={line.validation_state === "error" ? "destructive" : "outline"}>
                            {line.validation_state}
                          </Badge>
                          {line.issues.map((issue) => (
                            <p
                              key={`${issue.code}:${issue.field}`}
                              className="mt-1 max-w-64 text-xs text-muted-foreground"
                            >
                              {issue.message}
                            </p>
                          ))}
                        </td>
                        <td className="min-w-56 space-y-2 px-3 py-2">
                          {!resolution.included ? (
                            <Input
                              aria-label={`Exclusion reason row ${line.source_row_number}`}
                              maxLength={500}
                              placeholder="Exclusion reason"
                              value={resolution.reason}
                              onChange={(event) =>
                                setRowResolutions((current) => ({
                                  ...current,
                                  [line.id]: { ...resolution, reason: event.target.value },
                                }))
                              }
                            />
                          ) : null}
                          {line.validation_state === "duplicate" ? (
                            <select
                              aria-label={`Duplicate resolution row ${line.source_row_number}`}
                              className="h-8 w-full rounded-lg border border-input bg-background px-2 text-sm"
                              value={resolution.duplicateDisposition}
                              onChange={(event) =>
                                setRowResolutions((current) => ({
                                  ...current,
                                  [line.id]: {
                                    ...resolution,
                                    duplicateDisposition: event.target
                                      .value as BankStatementLine["duplicate_disposition"],
                                  },
                                }))
                              }
                            >
                              <option value="unresolved">Unresolved</option>
                              <option value="accepted_duplicate">Accept duplicate</option>
                              <option value="rejected_duplicate">Reject duplicate</option>
                            </select>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={!canUpdate || immutable || busy !== null}
                            onClick={() => void saveLine(line)}
                          >
                            Apply
                          </Button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <Alert>
            <AlertTitle>Reconciliation staging only</AlertTitle>
            <AlertDescription>
              Finalizing makes included rows available for reconciliation. It does not post to the ledger.
            </AlertDescription>
          </Alert>
        </>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <div className="flex flex-wrap gap-2">
          {detail && !immutable ? (
            <Button
              type="button"
              variant="outline"
              disabled={!canUpdate || busy !== null}
              onClick={() => void validateImport()}
            >
              {busy === "validate" ? "Validating…" : "Validate Statement"}
            </Button>
          ) : null}
          {detail ? (
            <Button type="button" variant="outline" disabled={busy !== null} onClick={onCancel}>
              Save and Close
            </Button>
          ) : null}
          {detail ? (
            <Button
              type="button"
              disabled={!canFinalize || detail.state !== "validated" || busy !== null}
              onClick={() => void finalizeImport()}
            >
              {busy === "finalize" ? "Finalizing…" : "Post and Close"}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function MappingInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = `mapping-${label.toLowerCase().replaceAll(" ", "-")}`;
  return (
    <div className="space-y-1 text-sm">
      <label htmlFor={id}>{label}</label>
      <Input
        id={id}
        aria-label={label}
        maxLength={128}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}
