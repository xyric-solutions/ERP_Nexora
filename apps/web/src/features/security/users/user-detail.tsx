"use client";

import { useState, type FormEvent } from "react";
import type {
  CreateSecurityAssignmentRequest,
  CreateSecurityUserRequest,
  SecurityUserDetail,
  SecurityUserOptions,
} from "@nexora/contracts";

import styles from "./user-management.module.css";

export type UserDetailMode = "summary" | "edit" | "password" | "companies" | "employee" | "archive";

export default function UserDetail({
  user,
  options,
  permissions,
  busy,
  onClose,
  onGovernedAction,
  onEmergency,
  onAssignRole,
  onRevokeRole,
  initialMode = "summary",
}: {
  user: SecurityUserDetail;
  options: SecurityUserOptions;
  permissions: ReadonlySet<string>;
  busy: boolean;
  onClose(): void;
  onGovernedAction(request: Exclude<CreateSecurityUserRequest, { requested_action: "create" }>): Promise<void>;
  onEmergency(action: "lock" | "revoke_sessions", reason: string): Promise<void>;
  onAssignRole(proposal: CreateSecurityAssignmentRequest["proposal"]): Promise<void>;
  onRevokeRole(proposal: CreateSecurityAssignmentRequest["proposal"]): Promise<void>;
  initialMode?: UserDetailMode;
}) {
  const [mode, setMode] = useState<UserDetailMode>(initialMode);
  const [displayName, setDisplayName] = useState(user.display_name);
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email);
  const [companyIds, setCompanyIds] = useState(user.companies.map((company) => company.id));
  const [defaultCompanyId, setDefaultCompanyId] = useState(user.default_company?.id ?? "");
  const [employeeId, setEmployeeId] = useState(user.employee?.id ?? "");
  const [rolePolicyId, setRolePolicyId] = useState("");
  const [reason, setReason] = useState("Approved administrative change");

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    await onGovernedAction({
      requested_action: "edit",
      target_user_id: user.id,
      expected_user_version: user.row_version,
      proposal: {
        display_name: displayName.trim(),
        username: username.trim().toLocaleLowerCase("en-US"),
        email: email.trim(),
      },
    });
  }

  async function submitCompanies(event: FormEvent) {
    event.preventDefault();
    await onGovernedAction({
      requested_action: "company_access",
      target_user_id: user.id,
      expected_user_version: user.row_version,
      proposal: {
        companies: companyIds.map((companyId) => ({
          company_id: companyId,
          is_default: companyId === defaultCompanyId,
        })),
      },
    });
  }

  async function submitEmployee(event: FormEvent) {
    event.preventDefault();
    await onGovernedAction({
      requested_action: "employee_link",
      target_user_id: user.id,
      expected_user_version: user.row_version,
      proposal: { employee_id: employeeId || null, reason },
    });
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    await onGovernedAction({
      requested_action: "reset_password",
      target_user_id: user.id,
      expected_user_version: user.row_version,
      proposal: { reason: reason.trim() },
    });
  }

  return (
    <aside className={styles.detail} aria-labelledby="user-detail-title">
      <header>
        <div className={styles.avatar} aria-hidden="true">
          {user.display_name.slice(0, 2).toLocaleUpperCase("en-US")}
        </div>
        <div>
          <span>User account</span>
          <h3 id="user-detail-title">{user.display_name}</h3>
          <p>
            {user.username} · {user.email}
          </p>
        </div>
        <button onClick={onClose} aria-label="Close user detail">
          ×
        </button>
      </header>

      <div className={styles.detailMeta}>
        <span className={`${styles.status} ${styles[user.status]}`}>
          {user.archived_at ? "Deleted (archived)" : user.status}
        </span>
        <span>{user.default_company?.name ?? "No default company"}</span>
        <span>{user.employee ? `Employee ${user.employee.employee_number}` : "No employee link"}</span>
        {user.must_change_password ? <strong>Password change required</strong> : null}
      </div>

      <section className={styles.detailSection} aria-labelledby="account-details-title">
        <h4 id="account-details-title">User details</h4>
        <dl className={styles.accountDetails}>
          <div>
            <dt>Name</dt>
            <dd>{user.display_name}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>{user.username}</dd>
          </div>
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className={styles.capitalize}>{user.status}</dd>
          </div>
          <div>
            <dt>Account type</dt>
            <dd>{user.employee ? "Employee" : "User only"}</dd>
          </div>
          <div>
            <dt>Employee Master</dt>
            <dd>{user.employee ? `${user.employee.employee_number} — ${user.employee.display_name}` : "Not linked"}</dd>
          </div>
          <div>
            <dt>Default company</dt>
            <dd>{user.default_company?.name ?? "No default company"}</dd>
          </div>
        </dl>
      </section>

      {mode === "edit" ? (
        <form className={styles.detailForm} onSubmit={submitEdit}>
          <h4>Edit name, username and email</h4>
          <label>
            Display name
            <input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </label>
          <label>
            Username
            <input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLocaleLowerCase("en-US"))}
              pattern="[a-z0-9][a-z0-9._-]{2,127}"
              maxLength={128}
              required
              disabled={busy}
              autoComplete="off"
            />
          </label>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              required
              disabled={busy}
            />
          </label>
          <div>
            <button type="button" onClick={() => setMode("summary")}>
              Cancel
            </button>
            <button className={styles.primary} disabled={busy}>
              Submit change
            </button>
          </div>
        </form>
      ) : mode === "password" ? (
        <form className={styles.detailForm} onSubmit={submitPasswordReset}>
          <h4>Reset password</h4>
          <p className={styles.formHelp}>
            Submit a reset for an independent approver. After approval, a new one-time password is shown to the approver
            once. The user sets their own password at the next sign-in, and existing sessions are revoked.
          </p>
          <label>
            Reason for password reset
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </label>
          <div>
            <button type="button" onClick={() => setMode("summary")} disabled={busy}>
              Cancel
            </button>
            <button className={styles.primary} disabled={busy || !reason.trim()}>
              Submit password reset
            </button>
          </div>
        </form>
      ) : mode === "archive" ? (
        <form
          className={styles.detailForm}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !reason.trim()) return;
            void onGovernedAction({
              requested_action: "archive",
              target_user_id: user.id,
              expected_user_version: user.row_version,
              proposal: { reason: reason.trim() },
            });
          }}
        >
          <h4>Delete user (soft)</h4>
          <p className={styles.formHelp}>
            Independent approval archives this account and revokes login/company access. Records and audit history are
            retained. Restore requires company access and activation approval.
          </p>
          <label>
            Reason for soft delete
            <input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </label>
          <div>
            <button type="button" disabled={busy} onClick={() => setMode("summary")}>
              Cancel
            </button>
            <button className={styles.dangerSoft} disabled={busy || !reason.trim()}>
              Submit soft delete
            </button>
          </div>
        </form>
      ) : mode === "companies" ? (
        <form className={styles.detailForm} onSubmit={submitCompanies}>
          <h4>Company boundary</h4>
          {options.companies.map((company) => {
            const selected = companyIds.includes(company.id);
            return (
              <div key={company.id} className={styles.companyLine}>
                <label>
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={(event) => {
                      const next = event.target.checked
                        ? [...companyIds, company.id]
                        : companyIds.filter((id) => id !== company.id);
                      setCompanyIds(next);
                      if (!next.includes(defaultCompanyId)) setDefaultCompanyId(next[0] ?? "");
                    }}
                  />
                  {company.name}
                </label>
                <label>
                  <input
                    type="radio"
                    name="detail-default"
                    disabled={!selected}
                    checked={defaultCompanyId === company.id}
                    onChange={() => setDefaultCompanyId(company.id)}
                  />
                  Default
                </label>
              </div>
            );
          })}
          <div>
            <button type="button" onClick={() => setMode("summary")}>
              Cancel
            </button>
            <button className={styles.primary} disabled={busy || !companyIds.length || !defaultCompanyId}>
              Submit change
            </button>
          </div>
        </form>
      ) : mode === "employee" ? (
        <form className={styles.detailForm} onSubmit={submitEmployee}>
          <h4>Employee link</h4>
          <select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value="">No employee link</option>
            {user.employee ? (
              <option value={user.employee.id}>
                {user.employee.employee_number} · {user.employee.display_name}
              </option>
            ) : null}
            {options.employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.employee_number} · {employee.display_name}
              </option>
            ))}
          </select>
          <label>
            Reason
            <input value={reason} onChange={(event) => setReason(event.target.value)} required />
          </label>
          <div>
            <button type="button" onClick={() => setMode("summary")}>
              Cancel
            </button>
            <button className={styles.primary} disabled={busy}>
              Submit change
            </button>
          </div>
        </form>
      ) : (
        <>
          <section className={styles.detailSection}>
            <div>
              <h4>Account controls</h4>
              <p>Governed changes require an independent checker.</p>
            </div>
            <div className={styles.actionGrid}>
              {permissions.has("security.user_account.edit") ? (
                <button onClick={() => setMode("edit")} disabled={busy}>
                  Edit name / username / email
                </button>
              ) : null}
              {permissions.has("security.user_account.company_access") ? (
                <button onClick={() => setMode("companies")}>Companies</button>
              ) : null}
              {permissions.has("security.user_account.edit") ? (
                <button onClick={() => setMode("employee")}>Employee link</button>
              ) : null}
              {permissions.has("security.user_account.reset_password") ? (
                <button onClick={() => setMode("password")} disabled={busy}>
                  Reset password
                </button>
              ) : null}
              {user.status !== "active" && permissions.has("security.user_account.activate") ? (
                <button
                  onClick={() =>
                    void onGovernedAction({
                      requested_action: user.status === "locked" ? "unlock" : "activate",
                      target_user_id: user.id,
                      expected_user_version: user.row_version,
                      proposal: {},
                    })
                  }
                >
                  {user.status === "locked" ? "Request unlock" : "Request activation"}
                </button>
              ) : null}
              {user.status !== "inactive" && permissions.has("security.user_account.archive") ? (
                <button
                  className={styles.dangerSoft}
                  onClick={() =>
                    void onGovernedAction({
                      requested_action: "archive",
                      target_user_id: user.id,
                      expected_user_version: user.row_version,
                      proposal: { reason },
                    })
                  }
                >
                  Deactivate / archive
                </button>
              ) : null}
              {user.status !== "inactive" &&
              permissions.has("security.user_account.archive") &&
              permissions.has("security.user_account.submit") ? (
                <button
                  className={styles.dangerSoft}
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setMode("archive");
                  }}
                >
                  Delete (soft)
                </button>
              ) : null}
              {user.status === "active" && permissions.has("security.user_account.lock") ? (
                <button className={styles.dangerSoft} onClick={() => void onEmergency("lock", reason)}>
                  Lock now
                </button>
              ) : null}
              {permissions.has("security.user_account.revoke_sessions") ? (
                <button onClick={() => void onEmergency("revoke_sessions", reason)}>Revoke sessions</button>
              ) : null}
            </div>
            <label className={styles.reasonField}>
              Administrative reason
              <input value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
          </section>

          <section className={styles.detailSection}>
            <div>
              <h4>Role assignments</h4>
              <p>Later role changes use the governed assignment workflow.</p>
            </div>
            <ul className={styles.roleList}>
              {user.roles.map((role) => (
                <li key={role.assignment_id}>
                  <span>
                    <strong>{role.display_name}</strong>
                    <small>{role.role_code}</small>
                  </span>
                  {permissions.has("security.authorization.assignment.revoke") ? (
                    <button
                      onClick={() =>
                        void onRevokeRole({
                          target_user_id: user.id,
                          role_policy_id: role.role_policy_id,
                          assignment_id: role.assignment_id,
                          valid_from: role.valid_from,
                          valid_until: role.valid_until,
                          revocation_reason: reason,
                        })
                      }
                    >
                      Revoke
                    </button>
                  ) : null}
                </li>
              ))}
              {user.roles.length === 0 ? <li>No active roles.</li> : null}
            </ul>
            {permissions.has("security.authorization.assignment.create") ? (
              <form
                className={styles.roleAdd}
                onSubmit={(event) => {
                  event.preventDefault();
                  if (!rolePolicyId) return;
                  void onAssignRole({
                    target_user_id: user.id,
                    role_policy_id: rolePolicyId,
                    assignment_id: null,
                    valid_from: new Date().toISOString(),
                    valid_until: null,
                    revocation_reason: null,
                  });
                }}
              >
                <select value={rolePolicyId} onChange={(event) => setRolePolicyId(event.target.value)} required>
                  <option value="">Select a role</option>
                  {options.roles
                    .filter((role) => !user.roles.some((current) => current.role_policy_id === role.policy_id))
                    .map((role) => (
                      <option key={role.policy_id} value={role.policy_id}>
                        {role.display_name}
                      </option>
                    ))}
                </select>
                <button disabled={busy}>Create assignment request</button>
              </form>
            ) : null}
          </section>
        </>
      )}
    </aside>
  );
}
