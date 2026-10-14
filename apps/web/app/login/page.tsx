"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PasswordChangeRequiredResponse, TenantSelectionRequiredResponse } from "@nexora/contracts";
import { AlertCircle, Building2, Eye, EyeOff, ShieldCheck } from "lucide-react";

import { useSession } from "../../src/lib/session/session-provider";
import { Alert, AlertDescription } from "../../src/components/ui/alert";
import { Button } from "../../src/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader } from "../../src/components/ui/card";
import { Input } from "../../src/components/ui/input";
import { Label } from "../../src/components/ui/label";

export default function LoginPage() {
  const router = useRouter();
  const { cancelTenantSelection, changeInitialPassword, login, selectTenant } = useSession();
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

  useEffect(() => {
    if (selection) selectionHeadingRef.current?.focus();
  }, [selection]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError("");
    try {
      const result = await login({ identifier, password });
      setPassword("");
      if (result.status === "tenant_selection_required") setSelection(result);
      else if (result.status === "password_change_required") setPasswordChange(result);
      else router.replace("/");
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
      else router.replace("/");
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
      setNewPassword("");
      setConfirmPassword("");
      setPasswordChange(null);
      router.replace("/");
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
  return (
    <main className="grid min-h-svh place-items-center bg-[radial-gradient(circle_at_top_left,var(--nx-login-glow),transparent_40%),var(--nx-canvas)] p-6 sm:p-8">
      <Card className="w-full max-w-[430px] border-border bg-card py-0 shadow-[0_24px_70px_var(--nx-shadow-color-md)]" aria-labelledby="login-title">
        <CardHeader className="gap-0 px-8 pt-8 sm:px-9 sm:pt-9">
          <div className="mb-9 flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-[11px] bg-primary text-lg font-extrabold text-primary-foreground" aria-hidden="true">N</span>
          <div>
            <strong className="text-sm font-bold text-foreground">Nexora ERP</strong>
            <small className="mt-0.5 block text-xs text-muted-foreground">Enterprise operations</small>
          </div>
        </div>
        <header>
          <p className="mb-2 text-xs font-bold tracking-[0.12em] text-[var(--nx-info)] uppercase">Secure workspace</p>
          <h1 id="login-title" className="mb-2 font-[family-name:var(--nx-font-serif)] text-4xl font-bold tracking-[-0.035em] text-[var(--nx-text-strong)]">Welcome back</h1>
          <p className="text-sm text-muted-foreground">Sign in with your organization account.</p>
        </header>
        </CardHeader>
        <CardContent className="px-8 pb-0 sm:px-9">
        {passwordChange ? (
          <form onSubmit={submitPasswordChange} className="mt-7 grid gap-4" aria-labelledby="password-change-title">
            <div className="grid gap-2">
              <h2 id="password-change-title" className="text-xl font-semibold text-foreground">Create your permanent password</h2>
              <p className="text-sm text-muted-foreground">Your one-time password was accepted. Set a new password before entering Nexora.</p>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="new-password">New password</Label>
              <Input id="new-password"
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="h-11 bg-[var(--nx-surface-soft)]"
              />
              <small className="text-xs text-muted-foreground">Use at least 8 characters.</small>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm-password">Confirm new password</Label>
              <Input id="confirm-password"
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="h-11 bg-[var(--nx-surface-soft)]"
              />
            </div>
            {error ? (
              <LoginError message={error} />
            ) : null}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={submitting || newPassword.length < 8 || newPassword !== confirmPassword}>
              {submitting ? "Updating..." : "Set password and continue"}
            </Button>
            <Button type="button" variant="outline" size="lg" className="h-11 w-full" disabled={submitting} onClick={cancelPasswordChange}>
              Cancel
            </Button>
          </form>
        ) : selection ? (
          <section className="mt-7 grid gap-4" aria-labelledby="organization-title">
            <h2 id="organization-title" ref={selectionHeadingRef} tabIndex={-1} className="text-xl font-semibold text-foreground">
              Choose your organization
            </h2>
            <p className="text-sm text-muted-foreground">Your credentials are verified. Select the workspace you want to open.</p>
            <small className="text-xs text-muted-foreground">This selection expires five minutes after sign-in.</small>
            <div className="grid gap-2.5">
              {selection.choices.map((choice) => (
                <Button key={choice.id} type="button" variant="outline" size="lg" className="h-11 justify-start" disabled={submitting} onClick={() => void chooseOrganization(choice.id)}>
                  <Building2 data-icon="inline-start" />{choice.organization_name}
                </Button>
              ))}
            </div>
            {error ? (
              <LoginError message={error} />
            ) : null}
            <Button type="button" variant="outline" size="lg" className="h-11 w-full" disabled={submitting} onClick={() => void cancelSelection()}>
              Back to sign in
            </Button>
          </section>
        ) : (
          <form onSubmit={submit} className="mt-7 grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="identifier">Username or email</Label>
              <Input id="identifier"
                ref={identifierRef}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required
                className="h-11 bg-[var(--nx-surface-soft)]"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                  className="h-11 bg-[var(--nx-surface-soft)] pr-11"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-1 -translate-y-1/2"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  {showPassword ? <EyeOff /> : <Eye />}
                </Button>
              </div>
            </div>
            {error ? (
              <LoginError message={error} />
            ) : null}
            <Button type="submit" size="lg" className="h-11 w-full" disabled={submitting}>{submitting ? "Signing in..." : "Sign in"}</Button>
          </form>
        )}
        </CardContent>
        <CardFooter className="mx-8 mt-7 flex gap-2 px-0 py-5 text-xs text-muted-foreground sm:mx-9">
          <ShieldCheck className="size-4 shrink-0 text-[var(--nx-success)]" aria-hidden="true" />
          <span>Protected by server-side sessions and tenant-scoped authorization.</span>
        </CardFooter>
      </Card>
    </main>
  );
}

function LoginError({ message }: { message: string }) {
  return (
    <Alert variant="destructive" className="border-[var(--nx-danger-border)] bg-[var(--nx-danger-soft)]">
      <AlertCircle aria-hidden="true" />
      <AlertDescription>{message}</AlertDescription>
    </Alert>
  );
}
