"use client";

import { organisationTypeSchema, registerOrganisationRequestSchema, type OrganisationType } from "@nexora/contracts";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { countryOptions, monthLabels, organisationTypeLabels } from "../features/administration/model/admin-labels";
import {
  AuthLayout,
  BrandPitch,
  FieldLabel,
  LoginError,
  Title,
  fieldClass,
  primaryButtonClass,
} from "../login/auth-layout";

// `!` beats the shell's unlayered `.nx-prototype :where(select)` background so selects match the inputs.
const selectClass = `${fieldClass} w-full border bg-[var(--nx-surface-soft)]! pr-9`;
const legendClass = "mb-3 p-0 text-xs font-semibold tracking-[.14em] text-primary uppercase";

/**
 * Public organisation sign-up (Administration plan D5): the person who registers
 * becomes the organisation's Super Admin. Employees cannot self-register.
 *
 * PROTOTYPE: `POST /api/v1/auth/register` needs the deferred Phase 2 registration
 * function, so the form validates the details but does not create an organisation yet.
 */
export default function RegisterPage() {
  const [organisationType, setOrganisationType] = useState<OrganisationType>("private_limited");
  const [organisationName, setOrganisationName] = useState("");
  const [country, setCountry] = useState("PK");
  const [month, setMonth] = useState(7);
  const [adminName, setAdminName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [validated, setValidated] = useState(false);

  function submit(event: FormEvent) {
    event.preventDefault();
    setValidated(false);
    const parsed = registerOrganisationRequestSchema.safeParse({
      organisation_type: organisationType,
      organisation_name: organisationName,
      country_code: country,
      financial_year_start_month: month,
      admin_full_name: adminName,
      admin_email: adminEmail,
      admin_password: password,
      admin_password_confirmation: confirmation,
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = String(issue?.path[0] ?? "");
      setError(
        field === "admin_password_confirmation"
          ? "The passwords do not match."
          : field === "admin_password"
            ? "Use a password of at least 8 characters."
            : field === "admin_email"
              ? "Enter a valid email address."
              : "Fill in every field to continue.",
      );
      return;
    }
    setError("");
    setPassword("");
    setConfirmation("");
    setValidated(true);
  }

  return (
    <AuthLayout
      wide
      brand={
        <BrandPitch
          title="Set up your organisation in a few minutes."
          text="You become the Super Admin. Then create logins for your team and choose exactly which modules each person can use."
        />
      }
    >
      <form onSubmit={submit} noValidate className="grid" aria-labelledby="register-title">
        <Title id="register-title">Create your organisation</Title>
        <p className="mb-6 text-sm text-muted-foreground">
          Employees don&rsquo;t sign up here — your Super Admin creates their logins.
        </p>
        {error ? <LoginError message={error} /> : null}
        {validated ? (
          <p
            role="status"
            className="mb-4 rounded-lg border border-border bg-[var(--nx-surface-soft)] px-3 py-2 text-sm text-foreground"
          >
            Your details are complete. Organisation sign-up is not open yet in this environment, so nothing was created.
            Ask your Nexora contact to set up the organisation.
          </p>
        ) : null}

        <fieldset className="m-0 grid min-w-0 gap-4 border-0 p-0">
          <legend className={legendClass}>Organisation</legend>
          <div className="grid">
            <FieldLabel htmlFor="organisation-type">Organisation type</FieldLabel>
            <select
              id="organisation-type"
              className={selectClass}
              value={organisationType}
              onChange={(event) => setOrganisationType(event.target.value as OrganisationType)}
            >
              {organisationTypeSchema.options.map((option) => (
                <option key={option} value={option}>
                  {organisationTypeLabels[option]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid">
            <FieldLabel htmlFor="organisation-name">Organisation name</FieldLabel>
            <Input
              id="organisation-name"
              className={fieldClass}
              value={organisationName}
              onChange={(event) => setOrganisationName(event.target.value)}
              autoComplete="organization"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid">
              <FieldLabel htmlFor="country">Country</FieldLabel>
              <select
                id="country"
                className={selectClass}
                value={country}
                onChange={(event) => setCountry(event.target.value)}
              >
                {countryOptions.map((option) => (
                  <option key={option.code} value={option.code}>
                    {option.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid">
              <FieldLabel htmlFor="financial-year">Financial year starts</FieldLabel>
              <select
                id="financial-year"
                className={selectClass}
                value={month}
                onChange={(event) => setMonth(Number(event.target.value))}
              >
                {monthLabels.map((label, index) => (
                  <option key={label} value={index + 1}>
                    {label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>

        <fieldset className="m-0 mt-6 mb-6 grid min-w-0 gap-4 border-0 border-t border-border p-0 pt-5">
          <legend className={`${legendClass} float-left w-full`}>Super Admin</legend>
          <div className="grid">
            <FieldLabel htmlFor="admin-name">Full name</FieldLabel>
            <Input
              id="admin-name"
              className={fieldClass}
              value={adminName}
              onChange={(event) => setAdminName(event.target.value)}
              autoComplete="name"
              required
            />
          </div>
          <div className="grid">
            <FieldLabel htmlFor="admin-email">Work email</FieldLabel>
            <Input
              id="admin-email"
              type="email"
              className={fieldClass}
              value={adminEmail}
              onChange={(event) => setAdminEmail(event.target.value)}
              autoComplete="email"
              placeholder="you@company.com"
              required
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="grid">
              <FieldLabel htmlFor="admin-password">Password</FieldLabel>
              <Input
                id="admin-password"
                type="password"
                className={fieldClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                placeholder="At least 8 characters"
                required
              />
            </div>
            <div className="grid">
              <FieldLabel htmlFor="admin-password-confirmation">Confirm password</FieldLabel>
              <Input
                id="admin-password-confirmation"
                type="password"
                className={fieldClass}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
          </div>
        </fieldset>

        <Button type="submit" className={primaryButtonClass}>
          Create organisation
        </Button>
        <p className="mt-5 mb-0 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
            Sign in
          </Link>
        </p>
      </form>
    </AuthLayout>
  );
}
