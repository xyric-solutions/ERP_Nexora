"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  isSuperAdmin,
  type PasswordChangeRequiredResponse,
  type SessionCompany,
  type TenantSelectionRequiredResponse,
} from "@nexora/contracts";
import { ArrowLeft, Building2, Check, ChevronRight, Eye, EyeOff, Loader2 } from "lucide-react";

import { useSession } from "../lib/session/session-provider";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Skeleton } from "../components/ui/skeleton";
import { readOrganisationSetup } from "../features/administration/model/organisation-setup";
import { AuthLayout, BrandPitch, FieldLabel, LoginError, Title, fieldClass, primaryButtonClass } from "./auth-layout";
import { OrganisationSetupForm } from "./organisation-setup-form";

export default function LoginPage() {
  const router = useRouter();
  const {
    activeCompany,
    cancelTenantSelection,
    changeInitialPassword,
    listCompanies,
    loading,
    login,
    logout,
    selectCompany,
    selectTenant,
    session,
  } = useSession();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [selection, setSelection] = useState<TenantSelectionRequiredResponse | null>(null);
  const [passwordChange, setPasswordChange] = useState<PasswordChangeRequiredResponse | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const identifierRef = useRef<HTMLInputElement>(null);
  const selectionHeadingRef = useRef<HTMLHeadingElement>(null);
  /** The password typed on this page, kept in memory only so first-login setup can apply a new one. */
  const [signInPassword, setSignInPassword] = useState<string | null>(null);
  const [setupCompletedFor, setSetupCompletedFor] = useState<string | null>(null);

  // A Super Admin whose organisation has not been set up completes setup before entering the ERP.
  const needsSetup =
    !loading &&
    !!session &&
    !session.impersonation &&
    isSuperAdmin(session.user.permissions) &&
    setupCompletedFor !== session.tenant_id &&
    !readOrganisationSetup(session.tenant_id);

  // Signed in with a company already chosen: go straight to the ERP.
  useEffect(() => {
    if (!loading && session && activeCompany && !needsSetup) router.replace("/");
  }, [activeCompany, loading, needsSetup, router, session]);

  useEffect(() => {
    if (selection) selectionHeadingRef.current?.focus();
  }, [selection]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!identifier.trim() || !password) {
      setError("Enter your username and password to continue.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      const result = await login({ identifier, password });
      setSignInPassword(result.status === "password_change_required" ? null : password);
      setPassword("");
      if (result.status === "tenant_selection_required") setSelection(result);
      else if (result.status === "password_change_required") setPasswordChange(result);
      // Authenticated: the company list appears next (the session has no company yet).
    } catch {
      setPassword("");
      setError("Sign-in failed. Check your username or email and password, then try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function chooseOrganization(choiceId: string) {
    if (!selection) return;
    setSubmitting(true);
    setError("");
    try {
      const result = await selectTenant({ ticket: selection.ticket, choice_id: choiceId });
      setSelection(null);
      if (result.status === "password_change_required") setPasswordChange(result);
    } catch {
      setSelection(null);
      setError("Organization selection expired or was invalid. Please sign in again.");
      queueMicrotask(() => identifierRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelSelection() {
    if (!selection) return;
    const ticket = selection.ticket;
    setSelection(null);
    setPassword("");
    setError("");
    try {
      await cancelTenantSelection({ ticket });
    } finally {
      identifierRef.current?.focus();
    }
  }

  async function submitPasswordChange(event: FormEvent) {
    event.preventDefault();
    if (!passwordChange) return;
    if (newPassword !== confirmPassword) {
      setError("The new passwords do not match.");
      return;
    }
    setSubmitting(true);
    setError("");
    try {
      await changeInitialPassword({ ticket: passwordChange.ticket, new_password: newPassword });
      setSignInPassword(newPassword);
      setNewPassword("");
      setConfirmPassword("");
      setPasswordChange(null);
    } catch {
      setNewPassword("");
      setConfirmPassword("");
      setError("The password-change request expired or was rejected. Please sign in again.");
      setPasswordChange(null);
      queueMicrotask(() => identifierRef.current?.focus());
    } finally {
      setSubmitting(false);
    }
  }

  function cancelPasswordChange() {
    setPasswordChange(null);
    setNewPassword("");
    setConfirmPassword("");
    setError("");
    queueMicrotask(() => identifierRef.current?.focus());
  }

  /** Back arrow on the company list: sign out completely and return to username and password. */
  async function backToSignIn() {
    setError("");
    setSignInPassword(null);
    try {
      await logout();
    } finally {
      queueMicrotask(() => identifierRef.current?.focus());
    }
  }

  if (needsSetup && session && !passwordChange && !selection)
    return (
      <OrganisationSetupForm
        session={session}
        currentPassword={signInPassword}
        onBack={() => void backToSignIn()}
        onCompleted={() => {
          setSignInPassword(null);
          setSetupCompletedFor(session.tenant_id);
        }}
      />
    );

  const choosingCompany = !loading && !!session && !activeCompany && !passwordChange && !selection;

  if (loading || (session && activeCompany))
    return (
      <AuthLayout brand={<SignInBrand />}>
        <div className="grid gap-4" aria-live="polite" aria-label="Opening your workspace">
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      </AuthLayout>
    );

  if (choosingCompany)
    return (
      <AuthLayout brand={<CompanyBrand />} wide>
        <CompanyChooser
          email={session.user.email}
          listCompanies={listCompanies}
          onBack={() => void backToSignIn()}
          onChoose={async (company) => {
            await selectCompany(company.id);
            router.replace("/");
          }}
        />
      </AuthLayout>
    );

  return (
    <AuthLayout brand={<SignInBrand />}>
      {passwordChange ? (
        <form onSubmit={submitPasswordChange} className="grid" aria-labelledby="password-change-title">
          <Title id="password-change-title">Create your password</Title>
          <p className="mb-6 text-sm text-muted-foreground">
            Your one-time password was accepted. Set a new password before entering Nexora.
          </p>
          {error ? <LoginError message={error} /> : null}
          <div className="mb-4 grid">
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <Input
              id="new-password"
              type="password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="At least 8 characters"
              className={fieldClass}
            />
          </div>
          <div className="mb-5 grid">
            <FieldLabel htmlFor="confirm-password">Confirm new password</FieldLabel>
            <Input
              id="confirm-password"
              type="password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
              placeholder="Repeat your new password"
              className={fieldClass}
            />
          </div>
          <div className="grid gap-3">
            <Button
              type="submit"
              className={primaryButtonClass}
              disabled={submitting || newPassword.length < 8 || newPassword !== confirmPassword}
            >
              {submitting ? "Updating…" : "Set password and continue"}
            </Button>
            <Button
              type="button"
              variant="outline"
              className={primaryButtonClass}
              disabled={submitting}
              onClick={cancelPasswordChange}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : selection ? (
        <section className="grid" aria-labelledby="organization-title">
          <Title id="organization-title" headingRef={selectionHeadingRef}>
            Choose your organization
          </Title>
          <p className="mb-6 text-sm text-muted-foreground">
            Your credentials are verified. This choice expires five minutes after sign-in.
          </p>
          {error ? <LoginError message={error} /> : null}
          <ul className="m-0 mb-5 grid list-none grid-cols-[minmax(0,1fr)] gap-2.5 p-0">
            {selection.choices.map((choice) => (
              <li key={choice.id}>
                <ChoiceCard
                  name={choice.organization_name}
                  disabled={submitting}
                  onClick={() => void chooseOrganization(choice.id)}
                />
              </li>
            ))}
          </ul>
          <Button
            type="button"
            variant="outline"
            className={primaryButtonClass}
            disabled={submitting}
            onClick={() => void cancelSelection()}
          >
            Back to sign in
          </Button>
        </section>
      ) : (
        <form onSubmit={submit} noValidate className="grid">
          <Title id="login-title">Welcome back</Title>
          <p className="mb-6 text-sm text-muted-foreground">Sign in with your organization account.</p>
          {error ? <LoginError message={error} /> : null}
          <div className="mb-4 grid">
            <FieldLabel htmlFor="identifier">Username or email</FieldLabel>
            <Input
              id="identifier"
              ref={identifierRef}
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              autoComplete="username"
              placeholder="you@company.com"
              required
              className={fieldClass}
            />
          </div>
          <div className="mb-5 grid">
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="Enter your password"
                required
                className={`${fieldClass} pr-11`}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute top-1 right-1 size-9 rounded-md text-foreground hover:bg-foreground/5"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                title={showPassword ? "Hide password" : "Show password"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? <EyeOff className="size-[18px]" /> : <Eye className="size-[18px]" />}
              </Button>
            </div>
          </div>
          <Button type="submit" className={primaryButtonClass} disabled={submitting}>
            {submitting ? "Signing in…" : "Sign in"}
          </Button>
          <p className="mt-5 mb-0 text-center text-sm text-muted-foreground">
            New organisation?{" "}
            <Link href="/register" className="font-medium text-primary underline-offset-4 hover:underline">
              Create an account
            </Link>
          </p>
        </form>
      )}
    </AuthLayout>
  );
}

const modules = [
  ["HR & Payroll", "People, attendance and pay"],
  ["Banking", "Payments and reconciliation"],
  ["Accounting", "Ledgers and reporting"],
] as const;

function SignInBrand() {
  return (
    <>
      <BrandPitch
        title="Every team, order and approval in one workspace."
        text="Sign in to pick up where your team left off. Your dashboards, queues and reports are waiting."
      />
      <ul
        className="m-0 grid max-w-[520px] list-none grid-cols-3 gap-px overflow-hidden rounded-xl border border-border bg-border p-0"
        aria-label="Nexora modules"
      >
        {modules.map(([name, detail], index) => (
          <li key={name} className="bg-card px-4 py-3">
            <strong className="block text-sm font-semibold">{name}</strong>
            <small className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <i
                aria-hidden="true"
                className={`size-1.5 shrink-0 rounded-full ${index ? "bg-[var(--nx-success)]" : "bg-primary"}`}
              />
              {detail}
            </small>
          </li>
        ))}
      </ul>
    </>
  );
}

function CompanyBrand() {
  const steps = [
    ["Signed in", "done"],
    ["Choose a company", "now"],
    ["Open your workspace", "next"],
  ] as const;
  return (
    <>
      <BrandPitch
        title="One account, every company you work in."
        text="Pick a company to open its workspace. Your data and permissions stay separate for each one."
      />
      <ol className="m-0 flex max-w-[420px] list-none flex-col p-0" aria-label="Sign-in progress">
        {steps.map(([label, state], index) => (
          <li
            key={label}
            aria-current={state === "now" ? "step" : undefined}
            className={`relative flex items-center gap-3 py-2 text-sm ${
              state === "next" ? "text-muted-foreground" : "text-foreground"
            } ${state === "now" ? "font-semibold" : ""} ${
              index ? "before:absolute before:-top-2 before:left-[11px] before:h-4 before:w-0.5 before:bg-border" : ""
            }`}
          >
            <span
              className={`relative grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-semibold ${
                state === "done"
                  ? "border-[var(--nx-success)] bg-[var(--nx-success)] text-[var(--nx-text-inverse)]"
                  : state === "now"
                    ? "border-primary bg-[var(--nx-canvas)] text-primary"
                    : "border-border bg-[var(--nx-canvas)]"
              }`}
            >
              {state === "done" ? <Check className="size-3" strokeWidth={3.2} aria-hidden="true" /> : index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
    </>
  );
}

/** The companies this sign-in can open; choosing one enters the ERP for that company. */
function CompanyChooser({
  email,
  listCompanies,
  onBack,
  onChoose,
}: {
  email: string;
  listCompanies: () => Promise<{ items: SessionCompany[] }>;
  onBack: () => void;
  onChoose: (company: SessionCompany) => Promise<void>;
}) {
  const [companies, setCompanies] = useState<SessionCompany[] | null>(null);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState<SessionCompany | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    listCompanies()
      .then((result) => {
        if (active) setCompanies(result.items);
      })
      .catch(() => {
        if (active) setError("Your companies could not be loaded. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [attempt, listCompanies]);

  async function open(company: SessionCompany) {
    setOpening(company);
    setError("");
    try {
      await onChoose(company);
    } catch {
      setError(`${company.name} could not be opened. Check your access or try again.`);
      setOpening(null);
    }
  }

  return (
    <section className="grid min-w-0 grid-cols-[minmax(0,1fr)]" aria-labelledby="company-title">
      <Title id="company-title" className="mb-3">
        Choose a company
      </Title>
      <div className="mb-5 flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="-ml-2 size-8 shrink-0 rounded-full text-foreground hover:bg-foreground/5"
          aria-label="Back to sign in"
          title="Back to sign in"
          disabled={!!opening}
          onClick={onBack}
        >
          <ArrowLeft className="size-[18px]" />
        </Button>
        <span className="min-w-0 truncate">
          Signed in as <b className="font-semibold text-foreground">{email}</b>
        </span>
      </div>
      {error ? (
        <div className="grid gap-3">
          <LoginError message={error} />
          {!companies ? (
            <Button
              type="button"
              variant="outline"
              className="h-11 rounded-full"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </Button>
          ) : null}
        </div>
      ) : null}
      {!companies && !error ? (
        <div className="grid gap-2.5" aria-live="polite" aria-label="Loading companies">
          <Skeleton className="h-[66px] w-full rounded-xl" />
          <Skeleton className="h-[66px] w-full rounded-xl" />
        </div>
      ) : companies && !companies.length ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
          No company is linked to your account yet. Ask your administrator to create a company and give you access.
        </p>
      ) : companies ? (
        <ul
          className="m-0 grid max-h-[56svh] list-none grid-cols-[minmax(0,1fr)] gap-2.5 overflow-y-auto p-0"
          aria-label="Companies"
        >
          {companies.map((company) => (
            <li key={company.id}>
              <ChoiceCard
                name={company.name}
                code={company.code}
                busy={opening?.id === company.id}
                dimmed={!!opening && opening.id !== company.id}
                disabled={!!opening}
                onClick={() => void open(company)}
              />
            </li>
          ))}
        </ul>
      ) : null}
      <p className="mt-3 min-h-5 text-sm text-muted-foreground" role="status" aria-live="polite">
        {opening ? `Opening ${opening.name}…` : ""}
      </p>
    </section>
  );
}

/** A large selectable card for a company (or organization) choice. */
function ChoiceCard({
  name,
  code,
  busy = false,
  dimmed = false,
  disabled = false,
  onClick,
}: {
  name: string;
  code?: string;
  busy?: boolean;
  dimmed?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-busy={busy || undefined}
      aria-label={`Open ${name}`}
      disabled={disabled}
      onClick={onClick}
      className={`group flex w-full cursor-pointer appearance-none items-center gap-3.5 rounded-xl border bg-card px-4 py-3 text-left text-foreground transition-[border-color,background-color,transform,opacity] outline-none hover:border-primary hover:bg-[var(--nx-surface-hover)] focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-primary active:translate-y-px disabled:cursor-default ${
        busy ? "border-primary" : "border-border"
      } ${dimmed ? "opacity-45" : ""}`}
    >
      <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-primary">
        <Building2 className="size-5" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <strong className="line-clamp-2 block text-[15px] font-semibold break-words">{name}</strong>
        {code ? <code className="mt-0.5 block font-mono text-xs text-muted-foreground">{code}</code> : null}
      </span>
      <span
        aria-hidden="true"
        className={`grid size-5 shrink-0 place-items-center transition-[transform,color] ${
          busy ? "text-primary" : "text-muted-foreground group-hover:translate-x-[3px] group-hover:text-primary"
        }`}
      >
        {busy ? (
          <Loader2 className="size-[18px] animate-spin motion-reduce:animate-none" />
        ) : (
          <ChevronRight className="size-[18px]" />
        )}
      </span>
    </button>
  );
}
