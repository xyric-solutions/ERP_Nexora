"use client";

import { organisationTypeSchema, updateTenantProfileRequestSchema, type OrganisationType } from "@nexora/contracts";
import { Pencil } from "lucide-react";
import { useState, type FormEvent } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { LabeledField } from "@/shared/ui/labeled-field";
import { workSelectClass } from "@/shared/ui/work-table";

import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel } from "../components/admin-page";
import { countryName, countryOptions, monthLabels, organisationTypeLabels } from "../model/admin-labels";
import { AdminRuleError } from "../model/admin-workflow";

export function TenantDirectoryView() {
  const { client, state, superAdmin } = useAdministration();
  const [editing, setEditing] = useState(false);
  if (!client || !state) return null;
  const tenant = state.tenant;

  const rows: [string, string][] = [
    ["Organisation name", tenant.name],
    ["Organisation type", organisationTypeLabels[tenant.organisation_type]],
    ["Country", `${countryName(tenant.country_code)} (${tenant.country_code})`],
    ["Financial year starts", monthLabels[tenant.financial_year_start_month - 1] ?? "—"],
    ["Base currency", tenant.base_currency ?? "Not set"],
    ["Companies", String(state.companies.length)],
  ];

  return (
    <AdminPage
      title="Tenant Directory"
      description="Your organisation's profile. A change to the financial year start applies to the next fiscal calendar only."
      prototype
      actions={
        superAdmin ? (
          <Button type="button" onClick={() => setEditing(true)}>
            <Pencil aria-hidden="true" />
            Edit profile
          </Button>
        ) : null
      }
    >
      <AdminPanel title="Organisation profile">
        <dl className="-mr-px -mb-px m-0 grid sm:grid-cols-2 xl:grid-cols-3">
          {rows.map(([label, value]) => (
            <div key={label} className="grid gap-1 border-b border-border px-4 py-3 sm:border-r">
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="m-0 text-sm font-semibold break-words text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </AdminPanel>
      <Sheet open={editing} onOpenChange={setEditing}>
        <SheetContent
          side="right"
          overlayClassName="z-[1300]!"
          className="z-[1301]! w-full! gap-0 overflow-hidden border-border p-0 sm:max-w-[34rem]!"
        >
          <SheetHeader className="gap-0 border-b border-border px-5 py-3 pr-14 sm:px-6">
            <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Tenant Directory</span>
            <SheetTitle className="m-0! text-lg font-semibold">Edit organisation profile</SheetTitle>
            <SheetDescription className="sr-only">
              Edit organisation type, name, country and financial year.
            </SheetDescription>
          </SheetHeader>
          {editing ? <TenantForm onDone={() => setEditing(false)} /> : null}
        </SheetContent>
      </Sheet>
    </AdminPage>
  );
}

function TenantForm({ onDone }: { onDone: () => void }) {
  const { client, state } = useAdministration();
  const feedback = useActionFeedback();
  const tenant = state!.tenant;
  const [name, setName] = useState(tenant.name);
  const [type, setType] = useState<OrganisationType>(tenant.organisation_type);
  const [country, setCountry] = useState(tenant.country_code);
  const [month, setMonth] = useState(tenant.financial_year_start_month);
  const [currency, setCurrency] = useState(tenant.base_currency ?? "");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    const parsed = updateTenantProfileRequestSchema.safeParse({
      name,
      organisation_type: type,
      country_code: country.trim().toUpperCase(),
      financial_year_start_month: month,
      base_currency: currency.trim() ? currency.trim().toUpperCase() : null,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      setError(`${issue?.path.join(".") ?? "Form"}: ${issue?.message ?? "invalid value"}`);
      return;
    }
    try {
      await client!.updateTenant(parsed.data, tenant.row_version);
      feedback("Organisation profile updated.");
      onDone();
    } catch (caught) {
      setError(caught instanceof AdminRuleError ? caught.message : "The profile could not be saved. Try again.");
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)} noValidate>
      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto px-5 py-4 sm:px-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        <LabeledField label="Organisation name">
          <Input value={name} onChange={(event) => setName(event.target.value)} />
        </LabeledField>
        <LabeledField label="Organisation type">
          <select
            className={workSelectClass}
            value={type}
            onChange={(event) => setType(event.target.value as OrganisationType)}
          >
            {organisationTypeSchema.options.map((option) => (
              <option key={option} value={option}>
                {organisationTypeLabels[option]}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Country">
          <select className={workSelectClass} value={country} onChange={(event) => setCountry(event.target.value)}>
            {countryOptions.some((option) => option.code === country) ? null : (
              <option value={country}>{country}</option>
            )}
            {countryOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Financial year starts" hint="Refused while the current fiscal calendar has postings.">
          <select className={workSelectClass} value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {monthLabels.map((label, index) => (
              <option key={label} value={index + 1}>
                {label}
              </option>
            ))}
          </select>
        </LabeledField>
        <LabeledField label="Base currency" hint="Optional ISO code, e.g. PKR.">
          <Input value={currency} maxLength={3} onChange={(event) => setCurrency(event.target.value)} />
        </LabeledField>
      </div>
      <div className="flex justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit">Save profile</Button>
      </div>
    </form>
  );
}
