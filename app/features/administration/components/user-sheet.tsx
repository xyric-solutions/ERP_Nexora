"use client";

import {
  createAdminUserRequestSchema,
  updateAdminUserRequestSchema,
  type AdminUser,
  type AdminUserAction,
  type ModuleAccessMap,
} from "@nexora/contracts";
import { useId, useState, type FormEvent, type ReactNode } from "react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { LabeledField } from "@/shared/ui/labeled-field";

import type { AdministrationClient, CredentialResult } from "../api/administration-client";
import { AdminRuleError, isLastActiveSuperAdmin } from "../model/admin-workflow";
import { AccessMatrix } from "./access-matrix";
import { UserStatusBadge } from "./admin-page";

type CompanyOption = { id: string; code: string; name: string };

const usernameFromEmail = (email: string) =>
  email
    .split("@")[0]!
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, ".")
    .replace(/^[^a-z0-9]+/, "");

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="grid gap-3 border-b border-border pb-5 last:border-b-0">
      <h3 className="m-0 text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </section>
  );
}

function errorMessage(error: unknown): string {
  if (error instanceof AdminRuleError) return error.message;
  if (error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)) {
    const issue = error.issues[0] as { path?: PropertyKey[]; message?: string } | undefined;
    return issue ? `${issue.path?.join(".") || "Form"}: ${issue.message}` : "Check the highlighted fields.";
  }
  return "The change could not be saved. Try again.";
}

/**
 * Create / edit drawer: Details → Companies → Access → (Review on create).
 * The edit drawer also holds account actions (reset password, deactivate, resign).
 */
export function UserSheet({
  open,
  onOpenChange,
  user,
  users,
  companies,
  actorId,
  client,
  onCredential,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null creates a new user. */
  user: AdminUser | null;
  users: readonly AdminUser[];
  companies: readonly CompanyOption[];
  actorId: string;
  client: AdministrationClient;
  onCredential: (result: CredentialResult, title: string) => void;
  onSaved: (message: string) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        overlayClassName="z-[1300]!"
        className="z-[1301]! w-full! gap-0 overflow-hidden border-border p-0 sm:max-w-[40rem]!"
      >
        <SheetHeader className="gap-0 border-b border-border px-5 py-3 pr-14 sm:px-6">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Users &amp; Access</span>
          <SheetTitle className="m-0! truncate text-lg font-semibold leading-snug">
            {user ? user.display_name : "Create user"}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {user ? "Edit user details, company access and module access." : "Create a login and assign access."}
          </SheetDescription>
        </SheetHeader>
        {open ? (
          <UserForm
            key={user?.id ?? "new"}
            user={user}
            users={users}
            companies={companies}
            actorId={actorId}
            client={client}
            onCredential={onCredential}
            onSaved={(message) => {
              onSaved(message);
              onOpenChange(false);
            }}
            onCancel={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function UserForm({
  user,
  users,
  companies,
  actorId,
  client,
  onCredential,
  onSaved,
  onCancel,
}: {
  user: AdminUser | null;
  users: readonly AdminUser[];
  companies: readonly CompanyOption[];
  actorId: string;
  client: AdministrationClient;
  onCredential: (result: CredentialResult, title: string) => void;
  onSaved: (message: string) => void;
  onCancel: () => void;
}) {
  const creating = user === null;
  const formId = useId();
  const [displayName, setDisplayName] = useState(user?.display_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [username, setUsername] = useState(user?.username ?? "");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [credentialMode, setCredentialMode] = useState<"generate" | "enter">("generate");
  const [password, setPassword] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>(
    user?.companies.map((company) => company.company_id) ?? (companies[0] ? [companies[0].id] : []),
  );
  const [defaultCompanyId, setDefaultCompanyId] = useState(
    user?.companies.find((company) => company.is_default)?.company_id ?? companies[0]?.id ?? "",
  );
  const [superAdmin, setSuperAdmin] = useState(user?.super_admin ?? false);
  const [access, setAccess] = useState<ModuleAccessMap>(
    Object.fromEntries(Object.entries(user?.access ?? {}).filter(([, level]) => level !== "custom")) as ModuleAccessMap,
  );
  const [confirmSelfDemotion, setConfirmSelfDemotion] = useState(false);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const isSelf = user?.id === actorId;
  const lastSuperAdmin = user ? isLastActiveSuperAdmin(users, user.id) : false;
  const demotingSelf = !creating && isSelf && user.super_admin && !superAdmin;
  const companyOptions = companies.length
    ? companies
    : (user?.companies.map((company) => ({ id: company.company_id, code: "", name: company.company_name })) ?? []);
  const selectedCompanies = companyIds.map((companyId) => ({
    company_id: companyId,
    is_default: companyId === (companyIds.includes(defaultCompanyId) ? defaultCompanyId : companyIds[0]),
  }));

  function toggleCompany(companyId: string, checked: boolean) {
    setCompanyIds((current) =>
      checked ? [...new Set([...current, companyId])] : current.filter((value) => value !== companyId),
    );
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSaving(true);
    try {
      if (creating) {
        const request = createAdminUserRequestSchema.parse({
          display_name: displayName,
          email,
          username,
          employee_id: null,
          credential: credentialMode === "generate" ? { generate: true } : { generate: false, password },
          companies: selectedCompanies,
          super_admin: superAdmin,
          access,
        });
        const result = await client.createUser(request);
        onCredential(result, "User created");
        onSaved(`${result.user.display_name} was created.`);
      } else {
        const request = updateAdminUserRequestSchema.parse({
          display_name: displayName,
          email,
          companies: selectedCompanies,
          super_admin: superAdmin,
          access,
          ...(demotingSelf ? { confirm_self_demotion: confirmSelfDemotion ? true : undefined } : {}),
        });
        const updated = await client.updateUser(user.id, request, user.row_version);
        onSaved(`${updated.display_name} was updated.`);
      }
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={(event) => void submit(event)} noValidate>
      <div className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto px-5 py-4 sm:px-6">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <Section title="Details">
          {user ? (
            <p className="m-0 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-xs">{user.id}</span>
              <UserStatusBadge status={user.status} />
              {user.must_change_password ? <span>Pending first sign-in</span> : null}
            </p>
          ) : null}
          <LabeledField label="Full name">
            <Input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
          </LabeledField>
          <LabeledField label="Email">
            <Input
              type="email"
              autoComplete="off"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (creating && !usernameTouched) setUsername(usernameFromEmail(event.target.value));
              }}
              required
            />
          </LabeledField>
          <LabeledField
            label="Username"
            hint={creating ? "Lowercase letters, numbers, dots, dashes or underscores." : "Usernames cannot change."}
          >
            <Input
              value={username}
              readOnly={!creating}
              onChange={(event) => {
                setUsernameTouched(true);
                setUsername(event.target.value);
              }}
              required
            />
          </LabeledField>
          {creating ? (
            <div className="grid gap-2">
              <span className="text-sm font-medium text-foreground">Initial password</span>
              <RadioGroup
                aria-label="Initial password"
                value={credentialMode}
                onValueChange={(value) => setCredentialMode(value as "generate" | "enter")}
              >
                <span className="flex items-center gap-2 text-sm">
                  <RadioGroupItem id={`${formId}-generate`} value="generate" />
                  <label htmlFor={`${formId}-generate`}>Generate a temporary password</label>
                </span>
                <span className="flex items-center gap-2 text-sm">
                  <RadioGroupItem id={`${formId}-enter`} value="enter" />
                  <label htmlFor={`${formId}-enter`}>Enter a temporary password</label>
                </span>
              </RadioGroup>
              {credentialMode === "enter" ? (
                <LabeledField
                  label="Temporary password"
                  hint="At least 8 characters. The user must change it at first sign-in."
                >
                  <Input
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                  />
                </LabeledField>
              ) : null}
            </div>
          ) : null}
        </Section>

        <Section title="Companies">
          {companyOptions.length === 0 ? (
            <p className="m-0 text-sm text-muted-foreground">No companies are available yet.</p>
          ) : (
            <div className="grid gap-2" role="group" aria-label="Company access">
              {companyOptions.map((company) => {
                const checked = companyIds.includes(company.id);
                return (
                  <div
                    key={company.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--nx-radius-md)] border border-border px-3 py-2"
                  >
                    <label className="flex items-center gap-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(value) => toggleCompany(company.id, value === true)}
                      />
                      {company.name}
                      {company.code ? (
                        <span className="font-mono text-xs text-muted-foreground">{company.code}</span>
                      ) : null}
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <input
                        type="radio"
                        name="default-company"
                        className="accent-[var(--primary)]"
                        disabled={!checked}
                        checked={
                          checked && selectedCompanies.find((item) => item.is_default)?.company_id === company.id
                        }
                        onChange={() => setDefaultCompanyId(company.id)}
                      />
                      Default
                    </label>
                  </div>
                );
              })}
            </div>
          )}
        </Section>

        <Section title="Access">
          <AccessMatrix
            access={access}
            superAdmin={superAdmin}
            onAccessChange={setAccess}
            onSuperAdminChange={setSuperAdmin}
            superAdminLocked={lastSuperAdmin}
          />
          {user && Object.values(user.access).includes("custom") ? (
            <p className="m-0 text-xs text-muted-foreground">
              Some modules had custom permissions from before. Saving replaces them with the levels shown.
            </p>
          ) : null}
          {demotingSelf ? (
            <div className="flex items-start gap-2 rounded-[var(--nx-radius-md)] border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-3 text-sm">
              <Checkbox
                id={`${formId}-self-demotion`}
                checked={confirmSelfDemotion}
                onCheckedChange={(value) => setConfirmSelfDemotion(value === true)}
              />
              <label htmlFor={`${formId}-self-demotion`}>
                I understand I am removing my own Super Admin access and will lose access to Administration.
              </label>
            </div>
          ) : null}
        </Section>

        {creating ? (
          <Section title="Review">
            <dl className="m-0 grid grid-cols-[8rem_minmax(0,1fr)] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">User</dt>
              <dd className="m-0 break-words">
                {displayName || "—"} · {email || "—"}
              </dd>
              <dt className="text-muted-foreground">Companies</dt>
              <dd className="m-0">{companyIds.length}</dd>
              <dt className="text-muted-foreground">Access</dt>
              <dd className="m-0">
                {superAdmin
                  ? "Super Admin (full access)"
                  : Object.keys(access).length
                    ? `${Object.keys(access).length} module(s)`
                    : "No modules yet"}
              </dd>
            </dl>
          </Section>
        ) : (
          <AccountActions
            user={user}
            lastSuperAdmin={lastSuperAdmin}
            client={client}
            onCredential={onCredential}
            onSaved={onSaved}
          />
        )}
      </div>
      <div className="flex flex-wrap justify-end gap-2 border-t border-border px-5 py-3 sm:px-6">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={saving || (demotingSelf && !confirmSelfDemotion)}>
          {saving ? "Saving…" : creating ? "Create user" : "Save changes"}
        </Button>
      </div>
    </form>
  );
}

function AccountActions({
  user,
  lastSuperAdmin,
  client,
  onCredential,
  onSaved,
}: {
  user: AdminUser;
  lastSuperAdmin: boolean;
  client: AdministrationClient;
  onCredential: (result: CredentialResult, title: string) => void;
  onSaved: (message: string) => void;
}) {
  const [pending, setPending] = useState<"deactivate" | "mark_resigned" | null>(null);
  const [reason, setReason] = useState("");
  const [endDate, setEndDate] = useState(new Date().toISOString().slice(0, 10));
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: AdminUserAction, success: string) {
    setError("");
    setBusy(true);
    try {
      const result = await client.userAction(user.id, action);
      if (result.oneTimePassword) onCredential(result, "Password reset");
      onSaved(success);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(false);
    }
  }

  const active = user.status === "active";
  return (
    <Section title="Account actions">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          disabled={busy || !active}
          onClick={() => void run({ action: "reset_password", credential: { generate: true } }, "Password reset.")}
        >
          Reset password
        </Button>
        {active ? (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy || lastSuperAdmin}
              aria-pressed={pending === "deactivate"}
              onClick={() => setPending(pending === "deactivate" ? null : "deactivate")}
            >
              Deactivate
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || lastSuperAdmin}
              aria-pressed={pending === "mark_resigned"}
              onClick={() => setPending(pending === "mark_resigned" ? null : "mark_resigned")}
            >
              Mark resigned
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            disabled={busy}
            onClick={() => void run({ action: "reactivate" }, `${user.display_name} was reactivated.`)}
          >
            Reactivate
          </Button>
        )}
      </div>
      {lastSuperAdmin && active ? (
        <p className="m-0 text-xs text-muted-foreground">
          This is the last active Super Admin, so it cannot be deactivated or marked resigned.
        </p>
      ) : null}
      {pending ? (
        <div className="grid gap-3 rounded-[var(--nx-radius-md)] border border-border p-3">
          {pending === "mark_resigned" ? (
            <LabeledField label="End date">
              <Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
            </LabeledField>
          ) : null}
          <LabeledField label="Reason">
            <Textarea value={reason} onChange={(event) => setReason(event.target.value)} rows={2} />
          </LabeledField>
          <div className="flex justify-end">
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !reason.trim()}
              onClick={() =>
                void run(
                  pending === "deactivate"
                    ? { action: "deactivate", reason }
                    : { action: "mark_resigned", end_date: endDate, reason },
                  pending === "deactivate"
                    ? `${user.display_name} was deactivated.`
                    : `${user.display_name} was marked resigned.`,
                )
              }
            >
              {pending === "deactivate" ? "Confirm deactivation" : "Confirm resignation"}
            </Button>
          </div>
        </div>
      ) : null}
    </Section>
  );
}
