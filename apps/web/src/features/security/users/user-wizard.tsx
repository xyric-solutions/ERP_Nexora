"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import type { CreateSecurityUserRequest, SecurityUserOptions } from "@nexora/contracts";
import { createSecurityUserRequestSchema } from "@nexora/contracts";

import {
  clearUserWizardDraft,
  saveUserWizardDraft,
  userWizardSubmissionKey,
  type UserWizardDraft,
} from "./user-wizard-draft";
import styles from "./user-management.module.css";

const steps = ["Identity", "Account type", "Companies", "Roles", "Review"] as const;

export default function UserWizard({
  options,
  busy,
  draftKey,
  initialDraft,
  onCancel,
  onSubmit,
}: {
  options: SecurityUserOptions;
  busy: boolean;
  draftKey: string;
  initialDraft: UserWizardDraft | null;
  onCancel(): void;
  onSubmit(
    request: Extract<CreateSecurityUserRequest, { requested_action: "create" }>,
    idempotencySeed: string,
  ): Promise<boolean>;
}) {
  const accountTypeId = useId();
  const availableCompanyIds = useMemo(() => new Set(options.companies.map((company) => company.id)), [options]);
  const availableEmployeeIds = useMemo(() => new Set(options.employees.map((employee) => employee.id)), [options]);
  const availableRoleIds = useMemo(() => new Set(options.roles.map((role) => role.policy_id)), [options]);
  const initialCompanies = initialDraft?.companyIds.filter((id) => availableCompanyIds.has(id)) ?? [];
  const [draftId] = useState(() => initialDraft?.draftId ?? crypto.randomUUID());
  const [step, setStep] = useState(initialDraft?.step ?? 0);
  const [displayName, setDisplayName] = useState(initialDraft?.displayName ?? "");
  const [username, setUsername] = useState(initialDraft?.username ?? "");
  const [email, setEmail] = useState(initialDraft?.email ?? "");
  const [accountType, setAccountType] = useState<"user" | "employee">(
    initialDraft?.accountType ?? (initialDraft?.employeeId ? "employee" : "user"),
  );
  const [employeeId, setEmployeeId] = useState(
    initialDraft && availableEmployeeIds.has(initialDraft.employeeId) ? initialDraft.employeeId : "",
  );
  const [companyIds, setCompanyIds] = useState<string[]>(initialCompanies);
  const [defaultCompanyId, setDefaultCompanyId] = useState(
    initialDraft && initialCompanies.includes(initialDraft.defaultCompanyId)
      ? initialDraft.defaultCompanyId
      : (initialCompanies[0] ?? ""),
  );
  const [roleIds, setRoleIds] = useState<string[]>(
    initialDraft?.roleIds.filter((id) => availableRoleIds.has(id)) ?? [],
  );
  const [draftRestored] = useState(Boolean(initialDraft));

  const draft = useMemo<UserWizardDraft>(
    () => ({
      version: 1,
      draftId,
      step,
      displayName,
      username,
      email,
      employeeId,
      accountType,
      companyIds,
      defaultCompanyId,
      roleIds,
    }),
    [accountType, companyIds, defaultCompanyId, displayName, draftId, email, employeeId, roleIds, step, username],
  );

  useEffect(() => {
    saveUserWizardDraft(window.sessionStorage, draftKey, draft);
  }, [draft, draftKey]);

  const request = useMemo(
    () => ({
      requested_action: "create" as const,
      proposal: {
        display_name: displayName.trim(),
        username: username.trim().toLocaleLowerCase("en-US"),
        email: email.trim(),
        employee_id: accountType === "employee" ? employeeId || null : null,
        companies: companyIds.map((companyId) => ({
          company_id: companyId,
          is_default: companyId === defaultCompanyId,
        })),
        initial_role_policy_ids: roleIds,
      },
    }),
    [accountType, companyIds, defaultCompanyId, displayName, email, employeeId, roleIds, username],
  );
  const employeeLinkValid = accountType === "user" || availableEmployeeIds.has(employeeId);
  const canSubmit = employeeLinkValid && createSecurityUserRequestSchema.safeParse(request).success;
  const canContinue = useMemo(() => {
    if (step === 0) return Boolean(displayName.trim() && username.trim() && email.trim());
    if (step === 1) return employeeLinkValid;
    if (step === 2) return companyIds.length > 0 && companyIds.includes(defaultCompanyId);
    if (step === steps.length - 1) return canSubmit;
    return true;
  }, [canSubmit, companyIds, defaultCompanyId, displayName, email, employeeLinkValid, step, username]);

  function toggleCompany(companyId: string, checked: boolean) {
    const next = checked ? [...companyIds, companyId] : companyIds.filter((id) => id !== companyId);
    setCompanyIds(next);
    if (!next.includes(defaultCompanyId)) setDefaultCompanyId(next[0] ?? "");
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step < steps.length - 1) {
      if (canContinue) setStep((value) => value + 1);
      return;
    }
    if (busy || !canSubmit) return;
    const saved = await onSubmit(request, userWizardSubmissionKey(draftId, request));
    if (saved) clearUserWizardDraft(window.sessionStorage, draftKey);
  }

  function close(): void {
    saveUserWizardDraft(window.sessionStorage, draftKey, draft);
    onCancel();
  }

  return (
    <form className={styles.wizard} onSubmit={submit} aria-labelledby="new-user-title">
      <header>
        <div>
          <span>Governed account request</span>
          <h3 id="new-user-title">Create user</h3>
        </div>
        <div className={styles.wizardHeaderActions}>
          {draftRestored ? <span className={styles.draftState}>Draft restored</span> : null}
          <button type="button" onClick={close} disabled={busy}>
            Close and keep draft
          </button>
        </div>
      </header>
      <ol className={styles.steps} aria-label="User creation steps">
        {steps.map((label, index) => (
          <li key={label} aria-current={step === index ? "step" : undefined}>
            <b>{index + 1}</b>
            {label}
          </li>
        ))}
      </ol>

      <div className={styles.stepBody}>
        {step === 0 ? (
          <div className={styles.formGrid}>
            <label>
              Display name
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} required />
            </label>
            <label>
              Username
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value.toLocaleLowerCase("en-US"))}
                pattern="[a-z0-9][a-z0-9._-]{2,127}"
                autoComplete="off"
                required
              />
            </label>
            <label className={styles.spanTwo}>
              Email
              <input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required />
            </label>
          </div>
        ) : step === 1 ? (
          <div className={styles.accountTypeSection}>
            <fieldset className={styles.choiceGrid} disabled={busy}>
              <legend>Is this account for an employee?</legend>
              <label
                htmlFor={`${accountTypeId}-user`}
                aria-label="User only"
                className={accountType === "user" ? styles.choiceSelected : styles.choice}
              >
                <input
                  id={`${accountTypeId}-user`}
                  type="radio"
                  name="account-type"
                  value="user"
                  checked={accountType === "user"}
                  onChange={() => {
                    setAccountType("user");
                    setEmployeeId("");
                  }}
                />
                <span>
                  <strong>User only</strong>
                  <small>An account without an Employee Master link.</small>
                </span>
              </label>
              <label
                htmlFor={`${accountTypeId}-employee`}
                aria-label="Employee"
                className={accountType === "employee" ? styles.choiceSelected : styles.choice}
              >
                <input
                  id={`${accountTypeId}-employee`}
                  type="radio"
                  name="account-type"
                  value="employee"
                  checked={accountType === "employee"}
                  onChange={() => setAccountType("employee")}
                />
                <span>
                  <strong>Employee</strong>
                  <small>Link the account to an existing employee.</small>
                </span>
              </label>
            </fieldset>
            {accountType === "employee" ? (
              <label className={styles.stackField}>
                Employee Master record
                <select
                  value={employeeId}
                  onChange={(event) => setEmployeeId(event.target.value)}
                  required
                  disabled={busy}
                >
                  <option value="">Select an employee</option>
                  {options.employees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.employee_number} · {employee.display_name}
                    </option>
                  ))}
                </select>
                <small>
                  {options.employees.length
                    ? "Only employees available within your company access and without an active user link are listed."
                    : "No eligible employees are available. Check the employee's company assignment and existing user link."}
                </small>
              </label>
            ) : (
              <p className={styles.formHelp}>This account will be created without an employee link.</p>
            )}
          </div>
        ) : step === 2 ? (
          <fieldset className={styles.choiceGrid}>
            <legend>Allowed companies and default workspace</legend>
            {options.companies.map((company) => {
              const selected = companyIds.includes(company.id);
              return (
                <div key={company.id} className={selected ? styles.choiceSelected : styles.choice}>
                  <label htmlFor={`company-${company.id}`} aria-label={`Allow ${company.name}`}>
                    <input
                      id={`company-${company.id}`}
                      type="checkbox"
                      checked={selected}
                      onChange={(event) => toggleCompany(company.id, event.target.checked)}
                    />
                    <span>
                      <strong>{company.name}</strong>
                      <small>{company.code}</small>
                    </span>
                  </label>
                  <label className={styles.defaultChoice} htmlFor={`default-company-${company.id}`}>
                    <input
                      id={`default-company-${company.id}`}
                      type="radio"
                      name="default-company"
                      checked={defaultCompanyId === company.id}
                      disabled={!selected}
                      onChange={() => setDefaultCompanyId(company.id)}
                    />
                    Default
                  </label>
                </div>
              );
            })}
          </fieldset>
        ) : step === 3 ? (
          <fieldset className={styles.choiceGrid}>
            <legend>Initial roles</legend>
            <p>Role authority is checked again by the backend during approval.</p>
            {options.roles.map((role) => (
              <label
                key={role.policy_id}
                className={styles.choice}
                htmlFor={`role-${role.policy_id}`}
                aria-label={`Assign ${role.display_name}`}
              >
                <input
                  id={`role-${role.policy_id}`}
                  type="checkbox"
                  checked={roleIds.includes(role.policy_id)}
                  onChange={(event) =>
                    setRoleIds((current) =>
                      event.target.checked
                        ? [...current, role.policy_id]
                        : current.filter((id) => id !== role.policy_id),
                    )
                  }
                />
                <span>
                  <strong>{role.display_name}</strong>
                  <small>{role.role_code}</small>
                </span>
              </label>
            ))}
          </fieldset>
        ) : (
          <div className={styles.review}>
            <article>
              <span>Identity</span>
              <strong>{displayName}</strong>
              <small>
                {username} · {email}
              </small>
            </article>
            <article>
              <span>Account type</span>
              <strong>{accountType === "employee" ? "Employee" : "User only"}</strong>
              <small>
                {accountType === "employee"
                  ? (options.employees.find((employee) => employee.id === employeeId)?.display_name ??
                    "Select an Employee Master record")
                  : "No employee link"}
              </small>
            </article>
            <article>
              <span>Company boundary</span>
              <strong>{companyIds.length} allowed</strong>
              <small>One default selected</small>
            </article>
            <article>
              <span>Initial authority</span>
              <strong>
                {roleIds.length} role{roleIds.length === 1 ? "" : "s"}
              </strong>
            </article>
            <p>
              Save and submit creates a governed draft for an independent checker. If you close now, your unfinished
              form remains as a draft in this browser session. The account and one-time password do not exist until
              approval.
            </p>
            {!canSubmit ? (
              <p role="alert">Review your identity, employee selection, and default company before submitting.</p>
            ) : null}
          </div>
        )}
      </div>

      <footer>
        <button type="button" onClick={() => setStep((value) => Math.max(0, value - 1))} disabled={step === 0 || busy}>
          Back
        </button>
        <button className={styles.primary} disabled={!canContinue || busy}>
          {busy ? "Saving…" : step === steps.length - 1 ? "Save and submit" : "Continue"}
        </button>
      </footer>
    </form>
  );
}
