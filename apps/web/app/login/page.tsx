"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { PasswordChangeRequiredResponse, TenantSelectionRequiredResponse } from "@nexora/contracts";

import { useSession } from "../../src/lib/session/session-provider";
import styles from "./login.module.css";

function PasswordVisibilityIcon({ visible }: { visible: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d="M2.5 12s3.25-5.5 9.5-5.5S21.5 12 21.5 12s-3.25 5.5-9.5 5.5S2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.5" />
      {visible ? null : <path d="m4 4 16 16" />}
    </svg>
  );
}

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
    <main className={styles.shell}>
      <section className={styles.card} aria-labelledby="login-title">
        <div className={styles.brand}>
          <span>N</span>
          <div>
            <strong>Nexora ERP</strong>
            <small>Enterprise operations</small>
          </div>
        </div>
        <header>
          <p>Secure workspace</p>
          <h1 id="login-title">Welcome back</h1>
          <span>Sign in with your organization account.</span>
        </header>
        {passwordChange ? (
          <form onSubmit={submitPasswordChange} aria-labelledby="password-change-title">
            <div className={styles.formHeading}>
              <h2 id="password-change-title">Create your permanent password</h2>
              <p>Your one-time password was accepted. Set a new password before entering Nexora.</p>
            </div>
            <label>
              New password
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
              <small>Use at least 8 characters.</small>
            </label>
            <label>
              Confirm new password
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <button disabled={submitting || newPassword.length < 8 || newPassword !== confirmPassword}>
              {submitting ? "Updating..." : "Set password and continue"}
            </button>
            <button type="button" className={styles.secondary} disabled={submitting} onClick={cancelPasswordChange}>
              Cancel
            </button>
          </form>
        ) : selection ? (
          <section className={styles.selection} aria-labelledby="organization-title">
            <h2 id="organization-title" ref={selectionHeadingRef} tabIndex={-1}>
              Choose your organization
            </h2>
            <p>Your credentials are verified. Select the workspace you want to open.</p>
            <small>This selection expires five minutes after sign-in.</small>
            <div className={styles.choices}>
              {selection.choices.map((choice) => (
                <button key={choice.id} disabled={submitting} onClick={() => void chooseOrganization(choice.id)}>
                  {choice.organization_name}
                </button>
              ))}
            </div>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <button className={styles.secondary} disabled={submitting} onClick={() => void cancelSelection()}>
              Back to sign in
            </button>
          </section>
        ) : (
          <form onSubmit={submit}>
            <label>
              Username or email
              <input
                ref={identifierRef}
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                autoComplete="username"
                required
              />
            </label>
            <label>
              Password
              <span className={styles.passwordField}>
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="current-password"
                  required
                />
                <button
                  type="button"
                  className={styles.passwordToggle}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  title={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((visible) => !visible)}
                >
                  <PasswordVisibilityIcon visible={showPassword} />
                </button>
              </span>
            </label>
            {error ? (
              <p className={styles.error} role="alert">
                {error}
              </p>
            ) : null}
            <button disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button>
          </form>
        )}
        <footer>Protected by server-side sessions and tenant-scoped authorization.</footer>
      </section>
    </main>
  );
}
