"use client";
import { LabeledField } from "@/shared/ui/labeled-field";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { taxContextRules, taxInputSchema, type TaxDefinition, type TaxInput, type TaxOptions } from "@nexora/contracts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { workSelectClass } from "@/shared/ui/work-table";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";

export const taxModuleLabels = {
  purchases: "Purchases",
  sales: "Sales",
  payroll: "Payroll",
  fixed_assets: "Fixed Assets",
} as const;
export const taxTreatmentLabels = {
  withholding: "Withheld tax liability",
  output: "Added output tax liability",
  recoverable: "Recoverable input tax asset",
  payroll_deduction: "Payroll tax deduction",
} as const;
const today = () => new Date().toLocaleDateString("en-CA");

export function TaxDefinitionForm({
  definition,
  options,
  onClose,
  onSaved,
}: {
  definition?: TaxDefinition;
  options: TaxOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { api, activeCompany, csrfToken } = useSession();
  const [form, setForm] = useState<TaxInput>({
    company_id: activeCompany!.id,
    name: definition?.name ?? "",
    tax_type: definition?.tax_type ?? "WHT",
    rate: definition?.rate ?? "5.50",
    description: definition?.description ?? "",
    module: definition?.module ?? "purchases",
    treatment: definition?.treatment ?? "withholding",
    trigger: definition?.trigger ?? "settlement",
    account_id: definition?.account_id ?? "",
    effective_date: definition?.effective_date ?? today(),
    status: definition?.status ?? "active",
    reason: "",
    payroll_component_id: definition?.payroll_component_id ?? undefined,
    payroll_basis_component_id: definition?.payroll_basis_component_id ?? undefined,
  });
  const [search, setSearch] = useState(""),
    [accountOffset, setAccountOffset] = useState(0),
    [accountOptions, setAccountOptions] = useState(options),
    [busy, setBusy] = useState(false),
    [searchBusy, setSearchBusy] = useState(false),
    [error, setError] = useState("");
  const [selectedNominal, setSelectedNominal] = useState({
    id: definition?.account_id ?? "",
    label: definition ? `${definition.account_code} / ${definition.account_name}` : "",
  });
  const retry = useRef({ fingerprint: "", key: "" });
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      setSearchBusy(true);
      api
        .getTaxOptions(
          `?${new URLSearchParams({ company_id: form.company_id, search, limit: "100", offset: String(accountOffset) })}`,
        )
        .then((value) => {
          if (!cancelled) setAccountOptions(value);
        })
        .catch((caught) => {
          if (!cancelled) setError(caught instanceof Error ? caught.message : "Nominal search failed.");
        })
        .finally(() => {
          if (!cancelled) setSearchBusy(false);
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [api, form.company_id, search, accountOffset]);
  const rule = taxContextRules.find(
    (item) => item.module === form.module && item.treatment === form.treatment && item.trigger === form.trigger,
  )!;
  const accounts = accountOptions.accounts.filter((item) => item.type === rule.account_type);
  function context(module: TaxInput["module"]) {
    const next = taxContextRules.find((item) => item.module === module)!;
    setForm({
      ...form,
      module,
      treatment: next.treatment,
      trigger: next.trigger,
      account_id: "",
      payroll_component_id: undefined,
      payroll_basis_component_id: undefined,
    });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    const parsed = taxInputSchema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.issues.map((issue) => `${issue.path.join(" ")}: ${issue.message}`).join(" "));
      return;
    }
    const fingerprint = JSON.stringify(parsed.data);
    if (retry.current.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      if (definition)
        await api.updateTax(
          definition.id,
          { ...parsed.data, expected_version: definition.version },
          csrfToken(),
          retry.current.key,
        );
      else await api.createTax(parsed.data, csrfToken(), retry.current.key);
      onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError || caught instanceof Error ? caught.message : "Tax definition could not be saved.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        className="z-[161] flex max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] flex-col gap-0 overflow-hidden p-0 font-sans sm:max-w-3xl"
        overlayClassName="z-[160]"
        initialFocus={nameInput}
        showCloseButton={!busy}
      >
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 sm:px-6 sm:pr-12">
          <DialogTitle>{definition ? "Edit Tax Definition" : "Add New Tax Definition"}</DialogTitle>
          <DialogDescription>
            Define a rate and its protected company nominal mapping. Saving configuration does not post a transaction.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="flex min-h-0 flex-col overflow-hidden">
          <div className="grid min-h-0 gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:px-6" data-tax-form-body>
            <fieldset disabled={busy} className="m-0 min-w-0 border-0 p-0">
              <legend className="mb-3 text-sm font-semibold">Basic details</legend>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <LabeledField className="grid gap-1.5 text-sm" label="Tax code">
                  <Input readOnly tabIndex={-1} value={definition?.code ?? "Assigned on save"} />
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Tax Name">
                  <Input
                    ref={nameInput}
                    required
                    maxLength={200}
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                  />
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Tax Type">
                  <select
                    className={`${workSelectClass} w-full`}
                    value={form.tax_type}
                    onChange={(e) =>
                      setForm({ ...form, tax_type: taxInputSchema.shape.tax_type.parse(e.target.value) })
                    }
                  >
                    {options.types.map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Tax Rate (%)">
                  <Input
                    required
                    inputMode="decimal"
                    pattern="[0-9]+([.][0-9]{1,2})?"
                    value={form.rate}
                    onChange={(e) => setForm({ ...form, rate: e.target.value })}
                  />
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Effective date">
                  <Input
                    required
                    type="date"
                    value={form.effective_date}
                    onChange={(e) => setForm({ ...form, effective_date: e.target.value })}
                  />
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Status">
                  <select
                    className={`${workSelectClass} w-full`}
                    value={form.status}
                    onChange={(e) => setForm({ ...form, status: e.target.value === "active" ? "active" : "inactive" })}
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm sm:col-span-2" label="Description">
                  <Textarea
                    rows={2}
                    maxLength={2000}
                    value={form.description}
                    onChange={(e) => setForm({ ...form, description: e.target.value })}
                  />
                </LabeledField>
              </div>
            </fieldset>
            <fieldset
              disabled={busy}
              className="m-0 min-w-0 rounded-xl border border-solid border-border bg-muted/40 p-4"
            >
              <legend className="px-1 text-sm font-semibold">Internal system logic & nominal mapping</legend>
              <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                <LabeledField className="grid gap-1.5 text-sm" label="Applicable ERP Module">
                  <select
                    className={`${workSelectClass} w-full`}
                    value={form.module}
                    onChange={(e) => context(taxInputSchema.shape.module.parse(e.target.value))}
                  >
                    {Object.entries(taxModuleLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Tax treatment">
                  <select
                    className={`${workSelectClass} w-full`}
                    value={`${form.treatment}:${form.trigger}`}
                    onChange={(e) => {
                      const next = taxContextRules.find(
                        (item) => item.module === form.module && `${item.treatment}:${item.trigger}` === e.target.value,
                      )!;
                      setForm({ ...form, treatment: next.treatment, trigger: next.trigger, account_id: "" });
                    }}
                  >
                    {taxContextRules
                      .filter((item) => item.module === form.module)
                      .map((item) => (
                        <option key={`${item.treatment}:${item.trigger}`} value={`${item.treatment}:${item.trigger}`}>
                          {taxTreatmentLabels[item.treatment]} · {item.trigger}
                        </option>
                      ))}
                  </select>
                </LabeledField>
                {form.module === "payroll" && (
                  <>
                    <LabeledField className="grid gap-1.5 text-sm" label="Payroll deduction component">
                      <select
                        required
                        className={`${workSelectClass} w-full`}
                        value={form.payroll_component_id ?? ""}
                        onChange={(e) => setForm({ ...form, payroll_component_id: e.target.value })}
                      >
                        <option value="">Select deduction</option>
                        {options.payroll_components
                          .filter((c) => c.kind === "deduction")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} / {c.name}
                            </option>
                          ))}
                      </select>
                    </LabeledField>
                    <LabeledField className="grid gap-1.5 text-sm" label="Payroll earning basis">
                      <select
                        required
                        className={`${workSelectClass} w-full`}
                        value={form.payroll_basis_component_id ?? ""}
                        onChange={(e) => setForm({ ...form, payroll_basis_component_id: e.target.value })}
                      >
                        <option value="">Select earlier earning component</option>
                        {options.payroll_components
                          .filter((c) => c.kind === "earning")
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.code} / {c.name}
                            </option>
                          ))}
                      </select>
                    </LabeledField>
                  </>
                )}
                <LabeledField className="grid gap-1.5 text-sm" label="Search nominal code or name">
                  <Input
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setAccountOffset(0);
                    }}
                    placeholder="Search company chart of accounts"
                  />
                </LabeledField>
                <LabeledField className="grid gap-1.5 text-sm" label="Associated Nominal (GL) Account">
                  <select
                    required
                    className={`${workSelectClass} w-full`}
                    value={form.account_id}
                    onChange={(e) => {
                      const account = accountOptions.accounts.find((account) => account.id === e.target.value);
                      setSelectedNominal({
                        id: e.target.value,
                        label: account ? `${account.code} / ${account.name}` : "",
                      });
                      setForm({ ...form, account_id: e.target.value });
                    }}
                  >
                    <option value="">Select a posting {rule.account_type}</option>
                    {form.account_id &&
                      selectedNominal.id === form.account_id &&
                      !accounts.some((account) => account.id === form.account_id) && (
                        <option value={form.account_id}>{selectedNominal.label}</option>
                      )}
                    {accounts.map((account) => (
                      <option key={account.id} value={account.id}>
                        {account.code} · {account.name}
                        {account.currency ? ` (${account.currency})` : ""}
                      </option>
                    ))}
                  </select>
                </LabeledField>
                <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground sm:col-span-2">
                  <span>
                    {searchBusy
                      ? "Searching…"
                      : `${accountOptions.total_accounts} eligible company accounts; showing ${accountOffset + 1}–${Math.min(accountOffset + 100, accountOptions.total_accounts)}`}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={!accountOffset || searchBusy}
                    onClick={() => setAccountOffset(Math.max(0, accountOffset - 100))}
                  >
                    Previous accounts
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={accountOffset + 100 >= accountOptions.total_accounts || searchBusy}
                    onClick={() => setAccountOffset(accountOffset + 100)}
                  >
                    Next accounts
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground sm:col-span-2">
                  {form.treatment === "recoverable"
                    ? "Debit recoverable tax; credit the source payable."
                    : form.treatment === "output"
                      ? "Credit output tax liability; increase the customer receivable."
                      : form.treatment === "payroll_deduction"
                        ? "Credit payroll tax liability; reduce employee net pay."
                        : "Credit withholding liability; reduce the supplier payment or invoice payable at the selected trigger."}{" "}
                  Rate and nominal are resolved by the server.
                </p>
                {form.module === "fixed_assets" && (
                  <p className="text-sm text-muted-foreground sm:col-span-2">
                    This configures the asset tax context. Automatic asset posting requires an integrated Fixed Assets
                    source workflow.
                  </p>
                )}
              </div>
            </fieldset>
            <LabeledField className="grid gap-1.5 text-sm" label="Reason for change">
              <Textarea
                rows={2}
                required
                minLength={3}
                maxLength={500}
                disabled={busy}
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
              />
            </LabeledField>
            {error && (
              <p
                role="alert"
                className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
          <div className="flex shrink-0 flex-wrap justify-end gap-2 border-t border-border bg-muted/40 px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !accountOptions.can_manage}>
              {busy ? "Saving…" : definition ? "Save revision" : "Create Tax Definition"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
