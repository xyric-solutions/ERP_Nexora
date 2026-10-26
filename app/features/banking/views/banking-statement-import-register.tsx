"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BankStatementImportDirectory,
  BankStatementImportOptions,
  BankStatementImportSummary,
  BankingCompanyDirectory,
} from "@nexora/contracts";
import { Eye, Plus, Search, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { BankingApiClient } from "../api/banking-client";

export interface BankingStatementImportRegisterProps {
  onAddNew: () => void;
  onOpen: (importId: string) => void;
}

function errorMessage(error: unknown) {
  if (error instanceof ApiError) {
    return `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`;
  }
  return "The statement-import work page could not be loaded. Check the API connection and try again.";
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const [year, month, day] = value.split("-");
  return year && month && day ? `${day}/${month}/${year}` : value;
}

function stateLabel(state: BankStatementImportSummary["state"]) {
  switch (state) {
    case "uploaded":
      return "Uploaded";
    case "draft":
      return "Draft";
    case "validated":
      return "Validated";
    case "finalized":
      return "Finalized";
    case "rejected":
      return "Rejected";
  }
}

export function BankingStatementImportRegister({ onAddNew, onOpen }: BankingStatementImportRegisterProps) {
  const { api, session } = useSession();
  const client = useMemo(() => new BankingApiClient(api), [api]);
  const permissions = session?.user.permissions ?? [];
  const canRead = permissions.includes("banking.statement_import.read");
  const canCreate = permissions.includes("banking.statement_import.create") && !session?.impersonation;

  const [companies, setCompanies] = useState<BankingCompanyDirectory["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [options, setOptions] = useState<BankStatementImportOptions | null>(null);
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");
  const [records, setRecords] = useState<BankStatementImportSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);
  const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function queryDirectory(input: {
    selectedCompanyId: string;
    selectedBankAccountId?: string;
    selectedReference?: string;
    limit?: number;
    cursor?: string;
  }) {
    return client.statementImports({
      company_id: input.selectedCompanyId,
      bank_account_id: input.selectedBankAccountId || undefined,
      search: input.selectedReference?.trim() || undefined,
      limit: input.limit ?? pageSize,
      cursor: input.cursor,
    });
  }

  function applyDirectory(result: BankStatementImportDirectory, nextPageIndex: number) {
    setRecords(result.items);
    setNextCursor(result.next_cursor);
    setPageIndex(nextPageIndex);
    setSelected(new Set());
  }

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (!canRead) return;
        const directory = await client.companies();
        if (!active) return;
        setCompanies(directory.items);
        const initialCompanyId = directory.items[0]?.id ?? "";
        setCompanyId(initialCompanyId);
        if (!initialCompanyId) return;
        const [loadedOptions, imports] = await Promise.all([
          client.statementImportOptions({ company_id: initialCompanyId }),
          client.statementImports({ company_id: initialCompanyId, limit: 25 }),
        ]);
        if (!active) return;
        setOptions(loadedOptions);
        applyDirectory(imports, 0);
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
  }, [canRead, client]);

  async function runQuery(
    input: {
      nextCompanyId?: string;
      nextBankAccountId?: string;
      nextReference?: string;
      nextPageSize?: number;
      cursor?: string;
      targetPage?: number;
    } = {},
  ) {
    const selectedCompanyId = input.nextCompanyId ?? companyId;
    if (!selectedCompanyId) return;
    setLoading(true);
    setError("");
    try {
      const result = await queryDirectory({
        selectedCompanyId,
        selectedBankAccountId: input.nextBankAccountId ?? bankAccountId,
        selectedReference: input.nextReference ?? reference,
        limit: input.nextPageSize ?? pageSize,
        cursor: input.cursor,
      });
      applyDirectory(result, input.targetPage ?? 0);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function changeCompany(nextCompanyId: string) {
    setCompanyId(nextCompanyId);
    setBankAccountId("");
    setReference("");
    setPageCursors([undefined]);
    setLoading(true);
    setError("");
    try {
      const [loadedOptions, imports] = await Promise.all([
        client.statementImportOptions({ company_id: nextCompanyId }),
        queryDirectory({ selectedCompanyId: nextCompanyId, selectedBankAccountId: "", selectedReference: "" }),
      ]);
      setOptions(loadedOptions);
      applyDirectory(imports, 0);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }

  async function clearFilters() {
    setBankAccountId("");
    setReference("");
    setPageCursors([undefined]);
    await runQuery({ nextBankAccountId: "", nextReference: "" });
  }

  async function search() {
    setPageCursors([undefined]);
    await runQuery();
  }

  async function changePageSize(nextPageSize: number) {
    setPageSize(nextPageSize);
    setPageCursors([undefined]);
    await runQuery({ nextPageSize });
  }

  async function nextPage() {
    if (!nextCursor) return;
    const targetPage = pageIndex + 1;
    setPageCursors((current) => [...current.slice(0, targetPage), nextCursor]);
    await runQuery({ cursor: nextCursor, targetPage });
  }

  async function previousPage() {
    if (pageIndex === 0) return;
    const targetPage = pageIndex - 1;
    await runQuery({ cursor: pageCursors[targetPage], targetPage });
  }

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(records.map((record) => record.id)) : new Set());
  }

  function toggleRecord(recordId: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(recordId);
      else next.delete(recordId);
      return next;
    });
  }

  if (!canRead) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>banking.statement_import.read is required.</AlertDescription>
      </Alert>
    );
  }

  const firstRow = records.length ? pageIndex * pageSize + 1 : 0;
  const lastRow = records.length ? firstRow + records.length - 1 : 0;

  return (
    <section aria-labelledby="statement-import-register-heading" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 id="statement-import-register-heading" className="text-2xl font-semibold tracking-tight">
            Import Statement
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Review imported Bank Statements or start a new upload.</p>
        </div>
        <Button type="button" disabled={!canCreate} className="min-w-36 rounded-full" onClick={onAddNew}>
          <Plus aria-hidden="true" className="size-4" />
          Add New
        </Button>
      </header>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Statement imports could not be loaded</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="rounded-lg border border-border bg-card p-3 sm:p-4" aria-label="Statement import filters">
        <form
          className="flex flex-col gap-3 lg:flex-row lg:items-end"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          {companies.length > 1 ? (
            <label className="min-w-56 flex-1 space-y-1 text-sm">
              <span>Company</span>
              <select
                aria-label="Company"
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                value={companyId}
                onChange={(event) => void changeCompany(event.target.value)}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.code} · {company.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="min-w-56 flex-1 space-y-1 text-sm">
            <span>Bank</span>
            <select
              aria-label="Bank"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={bankAccountId}
              onChange={(event) => setBankAccountId(event.target.value)}
            >
              <option value="">All Banks</option>
              {options?.bank_accounts.map((account) => (
                <option key={account.id} value={account.id}>
                  {account.account_name} · {account.currency}
                </option>
              ))}
            </select>
          </label>
          <label htmlFor="statement-import-reference-filter" className="min-w-56 flex-1 space-y-1 text-sm">
            <span>Ref No.</span>
            <Input
              id="statement-import-reference-filter"
              aria-label="Reference number"
              placeholder="Ref No."
              maxLength={160}
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          </label>
          <div className="flex gap-2">
            <Button type="submit" variant="outline" disabled={loading}>
              <Search aria-hidden="true" className="size-4" />
              Search
            </Button>
            <Button type="button" variant="outline" disabled={loading} onClick={() => void clearFilters()}>
              <X aria-hidden="true" className="size-4" />
              Clear
            </Button>
          </div>
          <label className="ml-auto flex items-center gap-2 whitespace-nowrap text-sm">
            <span>Show</span>
            <select
              aria-label="Entries per page"
              className="h-9 rounded-md border border-input bg-background px-2"
              value={pageSize}
              onChange={(event) => void changePageSize(Number(event.target.value))}
            >
              {[10, 25, 50, 100].map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </select>
            <span>entries</span>
          </label>
        </form>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] border-collapse text-sm">
            <thead className="bg-primary text-primary-foreground">
              <tr>
                <th className="w-12 px-3 py-3 text-center">
                  <Checkbox
                    aria-label="Select all statement imports"
                    checked={records.length > 0 && selected.size === records.length}
                    onCheckedChange={(checked) => toggleAll(checked === true)}
                  />
                </th>
                <th className="px-3 py-3 text-left font-medium">ID</th>
                <th className="px-3 py-3 text-left font-medium">Bank</th>
                <th className="px-3 py-3 text-left font-medium">From Date</th>
                <th className="px-3 py-3 text-left font-medium">To Date</th>
                <th className="px-3 py-3 text-left font-medium">Ref. No.</th>
                <th className="px-3 py-3 text-left font-medium">Status</th>
                <th className="px-3 py-3 text-center font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    Loading statement imports…
                  </td>
                </tr>
              ) : null}
              {!loading && records.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">
                    No statement imports match the current filters.
                  </td>
                </tr>
              ) : null}
              {records.map((record) => (
                <tr key={record.id} className="border-t border-border hover:bg-muted/40">
                  <td className="px-3 py-3 text-center">
                    <Checkbox
                      aria-label={`Select statement ${record.statement_reference}`}
                      checked={selected.has(record.id)}
                      onCheckedChange={(checked) => toggleRecord(record.id, checked === true)}
                    />
                  </td>
                  <td className="px-3 py-3 font-medium text-primary">{record.id}</td>
                  <td className="px-3 py-3">{record.bank_account_name}</td>
                  <td className="px-3 py-3 tabular-nums">{formatDate(record.statement_date_from)}</td>
                  <td className="px-3 py-3 tabular-nums">{formatDate(record.statement_date_to)}</td>
                  <td className="px-3 py-3">{record.statement_reference}</td>
                  <td className="px-3 py-3">
                    <Badge variant={record.state === "rejected" ? "destructive" : "outline"}>
                      {stateLabel(record.state)}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 text-center">
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      aria-label={`Open statement ${record.statement_reference}`}
                      onClick={() => onOpen(record.id)}
                    >
                      <Eye aria-hidden="true" className="size-4" />
                      View
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-muted-foreground">
          <span>
            Showing {firstRow} to {lastRow} {nextCursor ? "entries" : `of ${lastRow} entries`}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || pageIndex === 0}
              onClick={() => void previousPage()}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={loading || !nextCursor}
              onClick={() => void nextPage()}
            >
              Next
            </Button>
          </div>
        </footer>
      </section>
    </section>
  );
}
