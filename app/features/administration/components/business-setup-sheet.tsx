"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  businessSetupInputSchema,
  organisationTypeSchema,
  type BusinessSetup,
  type BusinessSetupInput,
  type BusinessNatureDirectory,
  type CountryCurrencyDirectory,
} from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";
import { monthLabels, organisationTypeLabels } from "../model/admin-labels";

export function BusinessSetupSheet({
  company,
  onClose,
  onCompleted,
}: {
  company: { id: string; name: string } | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const { api, csrfToken } = useSession();
  const [input, setInput] = useState<BusinessSetupInput>({
    ...(company ? { company_id: company.id } : {}),
    company_name: company?.name ?? "",
    business_nature_key: "",
    organisation_type: "private_limited",
    country_code: "PK",
    base_currency: "PKR",
    financial_year_start_month: 7,
    accounting_method: "accrual",
  });
  const [natures, setNatures] = useState<BusinessNatureDirectory["items"]>([]);
  const [countries, setCountries] = useState<CountryCurrencyDirectory["items"]>([]);
  const [saved, setSaved] = useState<BusinessSetup | null>(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const command = useRef<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const [natureList, status] = await Promise.all([
          api.listBusinessNatures(),
          company ? api.getBusinessSetup(company.id) : Promise.resolve({ setup: null }),
        ]);
        const mappings: CountryCurrencyDirectory["items"] = [];
        let cursor: string | null = null;
        do {
          const query = new URLSearchParams({ limit: "100", ...(cursor ? { cursor } : {}) });
          const page = await api.listCountryCurrencies(`?${query}`);
          mappings.push(...page.items.filter((item) => item.status === "active"));
          cursor = page.next_cursor;
        } while (cursor && mappings.length < 1000);
        if (active) {
          setNatures(natureList.items);
          setCountries(mappings);
          setSaved(status.setup);
          setLoading(false);
        }
      } catch {
        if (active) {
          setError("Company accounting setup could not be loaded. Close this form and try again.");
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, [api, company]);
  function change<K extends keyof BusinessSetupInput>(field: K, value: BusinessSetupInput[K]) {
    setInput((current) => ({ ...current, [field]: value }));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || loading) return;
    const parsed = businessSetupInputSchema.safeParse(input);
    if (!parsed.success) {
      setError("Complete the company name, business nature, country and currency.");
      return;
    }
    const payload = JSON.stringify(parsed.data);
    if (command.current?.payload !== payload) command.current = { payload, key: crypto.randomUUID() };
    setBusy(true);
    setError("");
    try {
      const result = await api.initializeBusiness(parsed.data, csrfToken(), command.current.key);
      setSaved(result.setup);
      onCompleted();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Company accounting setup could not be saved.");
    } finally {
      setBusy(false);
    }
  }
  const countryChoices = Array.from(new Map(countries.map((item) => [item.country_code, item])).values());
  const currencies = countries.filter((item) => item.country_code === input.country_code);
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <SheetContent className="flex w-full flex-col sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{company ? "Company accounting setup" : "Create company"}</SheetTitle>
          <SheetDescription>
            Business nature determines the default chart and Accounts Payable and Receivable mappings.
          </SheetDescription>
        </SheetHeader>
        {error && (
          <Alert variant="destructive" className="mx-5 w-auto">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {loading ? (
          <p role="status" className="px-5 text-sm text-muted-foreground">
            Loading company configuration…
          </p>
        ) : saved ? (
          <div className="grid gap-4 overflow-y-auto px-5 py-4 text-sm">
            <p role="status" className="m-0 font-medium">
              Accounting defaults are saved for {saved.company_name}.
            </p>
            <dl className="m-0 grid gap-3">
              {[
                [
                  "Business nature",
                  natures.find((n) => n.key === saved.business_nature_key)?.name ?? saved.business_nature_key,
                ],
                ["Base currency", saved.base_currency],
                ["Financial year starts", monthLabels[saved.financial_year_start_month - 1]],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted-foreground">{label}</dt>
                  <dd className="m-0 font-medium">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="m-0 text-muted-foreground">
              Sections and Categories are available in the Chart of Accounts. Add additional nominals there. Create bank
              accounts through Banking using the adopted bank definitions.
            </p>
            <Button type="button" onClick={onClose}>
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
            <fieldset
              disabled={busy || natures.length === 0}
              className="m-0 grid min-h-0 gap-4 overflow-y-auto border-0 px-5 py-4"
            >
              <LabeledField label="Company name">
                <Input
                  value={input.company_name}
                  readOnly={!!company}
                  required
                  maxLength={200}
                  onChange={(e) => change("company_name", e.target.value)}
                />
              </LabeledField>
              <LabeledField label="Business nature">
                <select
                  className={workSelectClass}
                  required
                  value={input.business_nature_key}
                  onChange={(e) => change("business_nature_key", e.target.value)}
                >
                  <option value="">Select business nature</option>
                  {natures.map((n) => (
                    <option key={n.key} value={n.key}>
                      {n.name}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Legal organisation type">
                <select
                  className={workSelectClass}
                  value={input.organisation_type}
                  onChange={(e) => change("organisation_type", organisationTypeSchema.parse(e.target.value))}
                >
                  {organisationTypeSchema.options.map((type) => (
                    <option key={type} value={type}>
                      {organisationTypeLabels[type]}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Country">
                <select
                  className={workSelectClass}
                  required
                  value={input.country_code}
                  onChange={(e) => {
                    const country = e.target.value,
                      currency =
                        countries.find((c) => c.country_code === country && c.is_primary)?.currency_code ??
                        countries.find((c) => c.country_code === country)?.currency_code ??
                        "";
                    setInput((current) => ({ ...current, country_code: country, base_currency: currency }));
                  }}
                >
                  {countryChoices.map((c) => (
                    <option key={c.country_code} value={c.country_code}>
                      {c.country_name}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Base currency">
                <select
                  className={workSelectClass}
                  required
                  value={input.base_currency}
                  onChange={(e) => change("base_currency", e.target.value)}
                >
                  {currencies.map((c) => (
                    <option key={c.currency_code} value={c.currency_code}>
                      {c.currency_code} · {c.currency_name}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Financial year starts">
                <select
                  className={workSelectClass}
                  value={input.financial_year_start_month}
                  onChange={(e) => change("financial_year_start_month", Number(e.target.value))}
                >
                  {monthLabels.map((label, index) => (
                    <option key={label} value={index + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </LabeledField>
              <LabeledField label="Accounting method">
                <select
                  className={workSelectClass}
                  value={input.accounting_method}
                  onChange={(e) => change("accounting_method", e.target.value === "cash" ? "cash" : "accrual")}
                >
                  <option value="accrual">Accrual basis</option>
                  <option value="cash">Cash basis</option>
                </select>
              </LabeledField>
            </fieldset>
            <div className="mt-auto flex justify-end gap-2 border-t border-border px-5 py-4">
              <Button type="button" variant="outline" disabled={busy} onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || natures.length === 0}>
                {busy ? "Saving…" : company ? "Initialize accounting" : "Create company"}
              </Button>
            </div>
          </form>
        )}
      </SheetContent>
    </Sheet>
  );
}
