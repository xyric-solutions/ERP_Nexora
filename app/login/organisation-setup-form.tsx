"use client";

import { changePasswordRequestSchema, organisationTypeSchema, type SessionResponse } from "@nexora/contracts";
import { ShieldCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { countryOptions, monthLabels } from "../features/administration/model/admin-labels";
import {
  accountingMethodLabels,
  accountingMethodSchema,
  businessTypeLabels,
  countryCurrency,
  currencyOptions,
  fiscalYearEndMonth,
  fiscalYearStartMonth,
  industryOptions,
  organisationSetupSchema,
  saveOrganisationSetup,
  setupFieldMessages,
  suggestWorkspaceSlug,
  workspaceDomainSuffix,
  type OrganisationSetupField,
} from "../features/administration/model/organisation-setup";
import { useSession } from "../lib/session/session-provider";
import { NexoraMark } from "../shared/ui/nexora-mark";
import { application } from "../shared/constants/application";
import { FieldLabel, LoginError } from "./auth-layout";

const inputClass =
  "h-10 rounded-lg border-border bg-[var(--nx-surface-soft)] px-3 text-sm! placeholder:text-[var(--nx-text-subtle)] focus-visible:border-primary focus-visible:ring-[3px] focus-visible:ring-primary/15 aria-invalid:border-destructive";
// `!` beats the shell's unlayered `.nx-prototype :where(select)` background so selects match the inputs.
const selectClass = `${inputClass} w-full border bg-[var(--nx-surface-soft)]! pr-8`;
/** Greys out a select that still shows its "Select …" placeholder. */
const placeholderClass = (value: string) => (value ? "" : " text-[var(--nx-text-subtle)]! [&>option]:text-foreground");
const sectionGridClass = "grid min-w-0 grid-cols-1 gap-x-5 gap-y-4 sm:grid-cols-2 lg:grid-cols-12";
const sectionTitleClass = "mt-0 mb-4 text-base font-semibold text-[var(--nx-text-strong)]";

type Errors = Partial<Record<OrganisationSetupField | "password" | "current_password", string>>;

/**
 * First-login organisation setup: a Super Admin of an organisation that has not
 * been set up fills this in before choosing a company and entering the ERP.
 *
 * `currentPassword` is the password typed on this page moments ago (kept in memory
 * only). When it is unknown, for example after a reload, the form asks for it so
 * the new password can be applied.
 */
export function OrganisationSetupForm({
  session,
  currentPassword,
  onCompleted,
  onBack,
}: {
  session: SessionResponse;
  currentPassword: string | null;
  onCompleted: () => void;
  onBack: () => void;
}) {
  const { api, csrfToken, refresh } = useSession();
  const [fullName, setFullName] = useState(session.user.display_name);
  const [email, setEmail] = useState(session.user.email);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [knownPassword, setKnownPassword] = useState("");
  const [companyName, setCompanyName] = useState(session.active_company?.name ?? "");
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [slug, setSlug] = useState(() => suggestWorkspaceSlug(session.active_company?.name ?? ""));
  const [slugEdited, setSlugEdited] = useState(false);
  const [country, setCountry] = useState("");
  const [taxNumber, setTaxNumber] = useState("");
  const [startMonth, setStartMonth] = useState(7);
  const [currency, setCurrency] = useState("");
  const [currencyEdited, setCurrencyEdited] = useState(false);
  const [accountingMethod, setAccountingMethod] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const needsCurrentPassword = currentPassword === null;

  function changeCompanyName(value: string) {
    setCompanyName(value);
    if (!slugEdited) setSlug(suggestWorkspaceSlug(value));
  }

  function changeCountry(value: string) {
    setCountry(value);
    if (!currencyEdited && countryCurrency[value]) setCurrency(countryCurrency[value]);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    const parsed = organisationSetupSchema.safeParse({
      admin_full_name: fullName,
      admin_email: email,
      admin_phone: phone,
      company_name: companyName,
      business_type: businessType,
      industry,
      workspace_slug: slug,
      country_code: country,
      tax_registration_number: taxNumber,
      financial_year_start_month: startMonth,
      base_currency: currency,
      accounting_method: accountingMethod,
    });
    const next: Errors = {};
    if (!parsed.success)
      for (const issue of parsed.error.issues) {
        const field = issue.path[0] as OrganisationSetupField;
        next[field] ??= setupFieldMessages[field];
      }
    if (password.length < 8) next.password = "Use a password of at least 8 characters.";
    if (needsCurrentPassword && !knownPassword) next.current_password = "Enter the password you signed in with.";
    setErrors(next);
    if (!parsed.success || Object.keys(next).length) {
      setFormError("Some details need attention. Check the highlighted fields.");
      const first = Object.keys(next)[0];
      if (first) document.getElementById(`setup-${first}`)?.focus();
      return;
    }

    setSubmitting(true);
    setFormError("");
    try {
      const current = currentPassword ?? knownPassword;
      if (password !== current) {
        const request = changePasswordRequestSchema.parse({ current_password: current, new_password: password });
        try {
          await api.changePassword(request, csrfToken());
        } catch {
          setErrors(
            needsCurrentPassword
              ? { current_password: "Check your current password.", password: "Check the new password." }
              : { password: "This password was not accepted. Try a longer or less common password." },
          );
          setFormError("Your password could not be updated. Nothing was saved.");
          return;
        }
        await refresh();
      }
      const saved = saveOrganisationSetup({
        ...parsed.data,
        tenant_id: session.tenant_id,
        completed_by: session.user.id,
        completed_at: new Date().toISOString(),
      });
      if (!saved) {
        setFormError("This browser blocked saving the setup. Allow site data for Nexora, then submit again.");
        return;
      }
      setPassword("");
      setKnownPassword("");
      onCompleted();
    } finally {
      setSubmitting(false);
    }
  }

  const invalid = (field: keyof Errors) => (errors[field] ? true : undefined);
  const describedBy = (field: keyof Errors) => (errors[field] ? `setup-${field}-error` : undefined);

  return (
    <div className="min-h-svh bg-[var(--nx-canvas)] text-foreground">
      <header className="flex items-center gap-3 border-b border-border px-4 py-4 sm:px-8">
        <NexoraMark className="size-8 shrink-0 text-primary" />
        <div>
          <b className="block text-base font-bold">{application.name}</b>
          <span className="text-[13px] text-muted-foreground">Organisation setup</span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1120px] px-4 py-8 sm:px-8">
        <h1
          id="setup-title"
          className="mb-1.5 text-[26px] leading-tight font-bold tracking-[-.02em] text-[var(--nx-text-strong)]"
        >
          Set up your organisation
        </h1>
        <p className="mb-6 max-w-[70ch] text-sm text-muted-foreground">
          Welcome, Super Admin. Complete these details once to finish signing in. You can change them later under
          Administration.
        </p>

        <form
          onSubmit={submit}
          noValidate
          aria-labelledby="setup-title"
          className="grid gap-6 rounded-xl border border-border bg-card p-5 shadow-sm sm:p-7"
        >
          {formError ? <LoginError message={formError} /> : null}

          <section aria-labelledby="setup-section-1" className="min-w-0">
            <h2 id="setup-section-1" className={sectionTitleClass}>
              Personal &amp; Admin Information
            </h2>
            <div className={sectionGridClass}>
              <Field id="admin_full_name" label="Full Name" error={errors.admin_full_name} span="lg:col-span-3">
                <Input
                  id="setup-admin_full_name"
                  className={inputClass}
                  value={fullName}
                  onChange={(event) => setFullName(event.target.value)}
                  autoComplete="name"
                  aria-invalid={invalid("admin_full_name")}
                  aria-describedby={describedBy("admin_full_name")}
                  required
                />
              </Field>
              <Field id="admin_email" label="Work Email" error={errors.admin_email} span="lg:col-span-3">
                <Input
                  id="setup-admin_email"
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  aria-invalid={invalid("admin_email")}
                  aria-describedby={describedBy("admin_email")}
                  required
                />
              </Field>
              <Field id="admin_phone" label="Contact / Phone Number" error={errors.admin_phone} span="lg:col-span-3">
                <Input
                  id="setup-admin_phone"
                  type="tel"
                  inputMode="tel"
                  className={inputClass}
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  autoComplete="tel"
                  placeholder="+92 300 1234567"
                  aria-invalid={invalid("admin_phone")}
                  aria-describedby={describedBy("admin_phone")}
                  required
                />
              </Field>
              <Field id="password" label="Password" error={errors.password} span="lg:col-span-3">
                <Input
                  id="setup-password"
                  type="password"
                  className={inputClass}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={8}
                  placeholder="At least 8 characters"
                  aria-invalid={invalid("password")}
                  aria-describedby={describedBy("password")}
                  required
                />
              </Field>
              {needsCurrentPassword ? (
                <Field
                  id="current_password"
                  label="Current password"
                  error={errors.current_password}
                  hint="Needed once to apply your new password."
                  span="lg:col-span-3"
                >
                  <Input
                    id="setup-current_password"
                    type="password"
                    className={inputClass}
                    value={knownPassword}
                    onChange={(event) => setKnownPassword(event.target.value)}
                    autoComplete="current-password"
                    aria-invalid={invalid("current_password")}
                    aria-describedby={describedBy("current_password")}
                    required
                  />
                </Field>
              ) : null}
            </div>
          </section>

          <hr className="m-0 border-border" />

          <section aria-labelledby="setup-section-2" className="min-w-0">
            <h2 id="setup-section-2" className={sectionTitleClass}>
              Business Information
            </h2>
            <div className={sectionGridClass}>
              <Field id="company_name" label="Business / Company Name" error={errors.company_name} span="lg:col-span-4">
                <Input
                  id="setup-company_name"
                  className={inputClass}
                  value={companyName}
                  onChange={(event) => changeCompanyName(event.target.value)}
                  autoComplete="organization"
                  aria-invalid={invalid("company_name")}
                  aria-describedby={describedBy("company_name")}
                  required
                />
              </Field>
              <Field id="business_type" label="Business Type" error={errors.business_type} span="lg:col-span-4">
                <select
                  id="setup-business_type"
                  className={`${selectClass}${placeholderClass(businessType)}`}
                  value={businessType}
                  onChange={(event) => setBusinessType(event.target.value)}
                  aria-invalid={invalid("business_type")}
                  aria-describedby={describedBy("business_type")}
                  required
                >
                  <option value="" disabled>
                    Select a business type
                  </option>
                  {organisationTypeSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {businessTypeLabels[option]}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="industry" label="Business Category / Industry" error={errors.industry} span="lg:col-span-4">
                <select
                  id="setup-industry"
                  className={`${selectClass}${placeholderClass(industry)}`}
                  value={industry}
                  onChange={(event) => setIndustry(event.target.value)}
                  aria-invalid={invalid("industry")}
                  aria-describedby={describedBy("industry")}
                  required
                >
                  <option value="" disabled>
                    Select a category
                  </option>
                  {industryOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="workspace_slug"
                label="Subdomain / Workspace URL"
                error={errors.workspace_slug}
                span="sm:col-span-2 lg:col-span-5"
              >
                <div className="flex min-w-0">
                  <Input
                    id="setup-workspace_slug"
                    className={`${inputClass} min-w-0 flex-1 rounded-r-none`}
                    value={slug}
                    onChange={(event) => {
                      setSlugEdited(true);
                      setSlug(event.target.value.toLowerCase().replace(/\s+/g, "-"));
                    }}
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="your-company"
                    aria-invalid={invalid("workspace_slug")}
                    aria-describedby={describedBy("workspace_slug") ?? "setup-workspace-suffix"}
                    required
                  />
                  <span
                    id="setup-workspace-suffix"
                    className="inline-flex h-10 shrink-0 items-center rounded-r-lg border border-l-0 border-border bg-muted px-3 text-sm text-muted-foreground"
                  >
                    {workspaceDomainSuffix}
                  </span>
                </div>
              </Field>
              <Field id="country_code" label="Country / Region" error={errors.country_code} span="lg:col-span-3">
                <select
                  id="setup-country_code"
                  className={`${selectClass}${placeholderClass(country)}`}
                  value={country}
                  onChange={(event) => changeCountry(event.target.value)}
                  aria-invalid={invalid("country_code")}
                  aria-describedby={describedBy("country_code")}
                  required
                >
                  <option value="" disabled>
                    Select a country
                  </option>
                  {countryOptions.map((option) => (
                    <option key={option.code} value={option.code}>
                      {option.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="tax_registration_number"
                label="Tax / NTN Registration Number"
                error={errors.tax_registration_number}
                span="lg:col-span-4"
              >
                <Input
                  id="setup-tax_registration_number"
                  className={inputClass}
                  value={taxNumber}
                  onChange={(event) => setTaxNumber(event.target.value)}
                  placeholder="Optional"
                  aria-invalid={invalid("tax_registration_number")}
                  aria-describedby={describedBy("tax_registration_number")}
                />
              </Field>
            </div>
          </section>

          <hr className="m-0 border-border" />

          <section aria-labelledby="setup-section-3" className="min-w-0">
            <h2 id="setup-section-3" className={sectionTitleClass}>
              Financial &amp; Accounting Setup
            </h2>
            <div className={sectionGridClass}>
              <div className="grid min-w-0 sm:col-span-2 lg:col-span-5">
                <span id="setup-fiscal-label" className="mb-2 text-sm font-medium">
                  Financial Period / Fiscal Year Start &amp; End
                </span>
                <div className="flex min-w-0 items-center gap-2" role="group" aria-labelledby="setup-fiscal-label">
                  <select
                    id="setup-financial_year_start_month"
                    aria-label="Financial year starts"
                    className={`${selectClass} min-w-0 flex-1`}
                    value={startMonth}
                    onChange={(event) => setStartMonth(Number(event.target.value))}
                  >
                    {monthLabels.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <span aria-hidden="true" className="text-muted-foreground">
                    –
                  </span>
                  <select
                    aria-label="Financial year ends"
                    className={`${selectClass} min-w-0 flex-1`}
                    value={fiscalYearEndMonth(startMonth)}
                    onChange={(event) => setStartMonth(fiscalYearStartMonth(Number(event.target.value)))}
                  >
                    {monthLabels.map((label, index) => (
                      <option key={label} value={index + 1}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Field id="base_currency" label="Base Currency" error={errors.base_currency} span="lg:col-span-3">
                <select
                  id="setup-base_currency"
                  className={`${selectClass}${placeholderClass(currency)}`}
                  value={currency}
                  onChange={(event) => {
                    setCurrencyEdited(true);
                    setCurrency(event.target.value);
                  }}
                  aria-invalid={invalid("base_currency")}
                  aria-describedby={describedBy("base_currency")}
                  required
                >
                  <option value="" disabled>
                    Select a currency
                  </option>
                  {currencyOptions.map((code) => (
                    <option key={code} value={code}>
                      {code}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                id="accounting_method"
                label="Accounting Method"
                error={errors.accounting_method}
                span="lg:col-span-4"
              >
                <select
                  id="setup-accounting_method"
                  className={`${selectClass}${placeholderClass(accountingMethod)}`}
                  value={accountingMethod}
                  onChange={(event) => setAccountingMethod(event.target.value)}
                  aria-invalid={invalid("accounting_method")}
                  aria-describedby={describedBy("accounting_method")}
                  required
                >
                  <option value="" disabled>
                    Select a method
                  </option>
                  {accountingMethodSchema.options.map((option) => (
                    <option key={option} value={option}>
                      {accountingMethodLabels[option]}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          </section>

          <hr className="m-0 border-border" />

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="m-0 flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-px size-4 shrink-0 text-[var(--nx-success)]" aria-hidden="true" />
              Prototype: organisation details are saved in this browser until the server stores them.
            </p>
            <div className="flex flex-col-reverse gap-3 sm:flex-row">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-full px-5"
                disabled={submitting}
                onClick={onBack}
              >
                Back to sign in
              </Button>
              <Button type="submit" className="h-10 rounded-full px-6 font-semibold" disabled={submitting}>
                {submitting ? "Saving…" : "Complete setup and continue"}
              </Button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  span,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  hint?: string;
  span: string;
  children: ReactNode;
}) {
  return (
    <div className={`grid min-w-0 content-start ${span}`}>
      <FieldLabel htmlFor={`setup-${id}`}>{label}</FieldLabel>
      {children}
      {error ? (
        <p id={`setup-${id}-error`} className="mt-1.5 mb-0 text-xs text-destructive">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 mb-0 text-xs text-muted-foreground">{hint}</p>
      ) : null}
    </div>
  );
}
