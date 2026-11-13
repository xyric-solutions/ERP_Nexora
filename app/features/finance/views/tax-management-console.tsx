"use client";

import { useCallback, useEffect, useState, useId, useRef } from "react";
import { Plus, ShieldCheck, RefreshCw, Search, Percent } from "lucide-react";
import {
  taxModuleSchema,
  taxTypeSchema,
  type TaxDefinition,
  type TaxDirectory,
  type TaxOptions,
  type TaxDetail,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { LabeledField } from "@/shared/ui/labeled-field";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { WorkTable, workSelectClass } from "@/shared/ui/work-table";
import { TaxDefinitionForm, taxModuleLabels, taxTreatmentLabels } from "../components/tax-definition-form";

export function TaxManagementConsole() {
  const { activeCompany } = useSession();
  return <CompanyTaxConsole key={activeCompany?.id ?? "none"} />;
}
function CompanyTaxConsole() {
  const { api, activeCompany, session, csrfToken } = useSession();
  const searchId = useId();
  const statusRetry = useRef({ fingerprint: "", key: "" });
  const [data, setData] = useState<TaxDirectory | null>(null),
    [options, setOptions] = useState<TaxOptions | null>(null),
    [search, setSearch] = useState(""),
    [module, setModule] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [editing, setEditing] = useState<TaxDefinition | true | null>(null),
    [changing, setChanging] = useState<TaxDefinition | null>(null),
    [reason, setReason] = useState(""),
    [detail, setDetail] = useState<TaxDetail | null>(null);
  const company = activeCompany?.id,
    canRead = session?.user.permissions.includes("finance.tax.read");
  const reload = useCallback(() => setRefresh((value) => value + 1), []);
  useEffect(() => {
    let cancelled = false;
    if (!company || !canRead) return;
    const timer = setTimeout(() => {
      setBusy(true);
      setError("");
      setData(null);
      const params = new URLSearchParams({ company_id: company, search, limit: "50", offset: String(offset) });
      if (module) params.set("module", module);
      if (type) params.set("tax_type", type);
      if (status) params.set("status", status);
      Promise.all([
        api.getTaxes(`?${params}`),
        api.getTaxOptions(`?company_id=${encodeURIComponent(company)}&limit=100`),
      ])
        .then(([directory, lookups]) => {
          if (!cancelled) {
            setData(directory);
            setOptions(lookups);
          }
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "Tax configuration could not be loaded.");
        })
        .finally(() => {
          if (!cancelled) setBusy(false);
        });
    }, 150);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, company, canRead, search, module, type, status, offset, refresh]);
  async function changeStatus() {
    if (!changing || !company) return;
    setBusy(true);
    setError("");
    const fingerprint = JSON.stringify({ id: changing.id, version: changing.version, status: changing.status, reason });
    if (statusRetry.current.fingerprint !== fingerprint)
      statusRetry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      await api.changeTaxStatus(
        changing.id,
        {
          company_id: company,
          expected_version: changing.version,
          status: changing.status === "active" ? "inactive" : "active",
          reason,
        },
        csrfToken(),
        statusRetry.current.key,
      );
      setChanging(null);
      setMessage("Tax status updated. Posted tax evidence is retained.");
      reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Status change failed.");
    } finally {
      setBusy(false);
    }
  }
  async function history(tax: TaxDefinition) {
    if (!company) return;
    setError("");
    try {
      setDetail(await api.getTax(tax.id, `?company_id=${encodeURIComponent(company)}`));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Tax history could not be loaded.");
    }
  }
  if (!company) return <p className="p-6 text-muted-foreground">Select a company to manage its taxes.</p>;
  if (!canRead)
    return (
      <p role="alert" className="p-6 text-muted-foreground">
        Company tax read permission is required.
      </p>
    );
  return (
    <section className="grid min-w-0 gap-5" aria-label="Tax management console">
      <header className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 sm:p-5">
        <div className="flex min-w-0 gap-4">
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-xl border border-[var(--nx-brand-line)] bg-accent text-primary sm:flex">
            <Percent />
          </span>
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
              Accounting / Taxes · {activeCompany?.name}
            </p>
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">Unified Tax Management Console</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
              One controlled register for tax rates, transaction contexts and nominal posting rules.
            </p>
          </div>
        </div>
        <Button
          type="button"
          className="w-full sm:w-auto"
          disabled={!options?.can_manage || busy}
          onClick={() => setEditing(true)}
        >
          <Plus />
          Add New Tax Definition
        </Button>
      </header>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <p className="flex items-center gap-2">
          <ShieldCheck className="size-4 text-primary" />
          <span>{options?.can_manage ? "Administrator mapping controls enabled" : "Read-only tax configuration"}</span>
        </p>
        <p className="text-xs text-muted-foreground">
          Versioned mappings · company isolation · retained posting evidence
        </p>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-muted-foreground">
          {message}
        </p>
      )}
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 xl:grid-cols-[minmax(240px,1fr)_repeat(3,minmax(130px,auto))_auto]">
        <label htmlFor={searchId} className="grid gap-1.5 text-xs font-medium">
          Search taxes
          <div className="relative">
            <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
            <Input
              id={searchId}
              className="pl-9"
              value={search}
              placeholder="Tax name or code"
              onChange={(e) => {
                setSearch(e.target.value);
                setOffset(0);
              }}
            />
          </div>
        </label>
        <LabeledField className="grid gap-1.5 text-xs font-medium" label="ERP module">
          <select
            className={workSelectClass}
            value={module}
            onChange={(e) => {
              setModule(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All modules</option>
            {taxModuleSchema.options.map((key) => (
              <option key={key} value={key}>
                {taxModuleLabels[key]}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField className="grid gap-1.5 text-xs font-medium" label="Tax type">
          <select
            className={workSelectClass}
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All types</option>
            {taxTypeSchema.options.map((key) => (
              <option key={key}>{key}</option>
            ))}
          </select>
        </LabeledField>
        <LabeledField className="grid gap-1.5 text-xs font-medium" label="Status">
          <select
            className={workSelectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </LabeledField>
        <Button type="button" variant="outline" className="self-end" disabled={busy} onClick={reload}>
          <RefreshCw className={busy ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      <div className="min-w-0 rounded-xl border border-border bg-card" aria-busy={busy}>
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <h2 className="font-semibold">Tax definitions</h2>
          <span className="text-xs text-muted-foreground">
            {data ? `${data.total} matching definitions` : "Loading register…"}
          </span>
        </div>
        <div className="min-w-0 overflow-x-auto">
          <WorkTable
            tableId="tax-definitions"
            label="Tax definitions"
            tools={false}
            paging={false}
            className="w-full min-w-[1080px] border-collapse text-left text-sm [&_th]:whitespace-nowrap [&_th]:px-4 [&_th]:py-3 [&_th]:text-xs [&_th]:font-semibold [&_td]:px-4 [&_td]:py-4 [&_td]:align-top [&_tr]:border-b [&_tr]:border-border"
          >
            <thead>
              <tr>
                {[
                  "Tax Name",
                  "Tax Type",
                  "Tax Rate (%)",
                  "Associated Nominal (GL) Account",
                  "Applicable ERP Module",
                  "Status",
                  "Row Actions",
                ].map((label) => (
                  <th key={label}>{label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data?.items.map((tax) => (
                <tr key={tax.id}>
                  <td>
                    <Button
                      type="button"
                      variant="link"
                      className="h-auto whitespace-normal px-0 text-left font-medium text-primary!"
                      onClick={() => void history(tax)}
                    >
                      {tax.name}
                    </Button>
                    <div className="mt-1 font-mono text-xs text-muted-foreground">
                      {tax.code} · revision {tax.revision}
                    </div>
                  </td>
                  <td>{tax.tax_type}</td>
                  <td className="font-mono tabular-nums">{tax.rate}%</td>
                  <td>
                    <span className="font-mono text-xs">{tax.account_code}</span>
                    <div className="mt-1">{tax.account_name}</div>
                  </td>
                  <td>
                    {taxModuleLabels[tax.module]}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {taxTreatmentLabels[tax.treatment]} · {tax.trigger}
                    </div>
                  </td>
                  <td>
                    <Badge variant="outline">
                      <span
                        className={`mr-1.5 size-1.5 rounded-full ${tax.status === "active" ? "bg-[var(--nx-success)]" : "bg-muted-foreground"}`}
                      />
                      {tax.status === "active" ? "Active" : "Inactive"}
                    </Badge>
                  </td>
                  <td>
                    <div className="flex gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={!options?.can_manage || busy}
                        onClick={() => setEditing(tax)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant={tax.status === "active" ? "destructive" : "outline"}
                        size="sm"
                        disabled={!options?.can_manage || busy}
                        onClick={() => {
                          setChanging(tax);
                          setReason("");
                        }}
                      >
                        {tax.status === "active" ? "Deactivate" : "Reactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </WorkTable>
        </div>
        {!busy && data?.total === 0 && (
          <div className="p-10 text-center">
            <h3 className="font-semibold">No tax definitions found</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {search || module || type || status
                ? "Adjust the filters to view more definitions."
                : "Create a definition to establish its rate and nominal posting rule."}
            </p>
          </div>
        )}
        <div className="flex items-center justify-between gap-3 border-t border-border p-3 text-xs text-muted-foreground">
          <span>
            {data?.total ? `${offset + 1}–${Math.min(offset + 50, data.total)} of ${data.total}` : "0 definitions"}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !offset}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Previous
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !data || offset + 50 >= data.total}
              onClick={() => setOffset(offset + 50)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
      {editing && options && (
        <TaxDefinitionForm
          definition={editing === true ? undefined : editing}
          options={options}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setMessage("Tax definition saved with its protected nominal mapping.");
            reload();
          }}
        />
      )}
      <Dialog
        open={!!changing}
        onOpenChange={(open) => {
          if (!open && !busy) setChanging(null);
        }}
      >
        <DialogContent
          className="z-[161] max-h-[calc(100dvh-2rem)] overflow-y-auto font-sans"
          overlayClassName="z-[160]"
        >
          <DialogTitle>
            {changing?.status === "active" ? "Deactivate" : "Reactivate"} {changing?.name}
          </DialogTitle>
          <DialogDescription>
            Historical tax applications remain unchanged. Unposted transactions must pass current tax validation.
          </DialogDescription>
          <LabeledField className="grid gap-2 text-sm" label="Reason">
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={500} />
          </LabeledField>
          <Button type="button" disabled={busy || reason.trim().length < 3} onClick={() => void changeStatus()}>
            Confirm status change
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!detail}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent
          className="z-[161] max-h-[calc(100dvh-2rem)] overflow-y-auto font-sans sm:max-w-2xl"
          overlayClassName="z-[160]"
        >
          <DialogTitle>
            {detail?.code} · {detail?.name}
          </DialogTitle>
          <DialogDescription>
            Retained configuration revisions, newest first. Transaction postings retain the revision actually used.
          </DialogDescription>
          {detail?.history.map((revision) => (
            <div key={revision.revision} className="rounded-lg border border-border p-3 text-sm">
              <p className="font-medium">
                Revision {revision.revision} · effective {revision.effective_date}
              </p>
              <p className="mt-1">
                {revision.rate}% · {taxModuleLabels[revision.module]} · {taxTreatmentLabels[revision.treatment]} ·{" "}
                {revision.account_code} {revision.account_name}
              </p>
              <p className="mt-2 text-muted-foreground">{revision.description || "No description"}</p>
            </div>
          ))}
        </DialogContent>
      </Dialog>
    </section>
  );
}
