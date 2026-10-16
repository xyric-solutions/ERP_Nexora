"use client";

import { useState, type FormEvent } from "react";
import type {
  CreateSecurityAssignmentRequest,
  CreateSecurityUserRequest,
  SecurityUserDetail,
  SecurityUserOptions,
} from "@nexora/contracts";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

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
    <aside className="border-l border-border bg-muted/50" aria-labelledby="user-detail-title">
      <header className="grid grid-cols-[48px_minmax(0,1fr)_auto] items-center gap-3 border-b border-border p-5">
        <div className="grid size-12 place-items-center rounded-full bg-accent font-bold text-primary" aria-hidden="true">
          {user.display_name.slice(0, 2).toLocaleUpperCase("en-US")}
        </div>
        <div>
          <span className="text-xs text-muted-foreground">User account</span>
          <h3 id="user-detail-title" className="mt-1 text-lg font-semibold">{user.display_name}</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {user.username} · {user.email}
          </p>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close user detail">
          ×
        </Button>
      </header>

      <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-3 text-xs text-muted-foreground">
        <span className={user.status === "active" ? "rounded-full bg-[var(--nx-success-soft)] px-2 py-1 font-semibold capitalize text-[var(--nx-success-text)]" : user.status === "locked" ? "rounded-full bg-[var(--nx-warning-soft)] px-2 py-1 font-semibold capitalize text-[var(--nx-warning)]" : "rounded-full bg-muted px-2 py-1 font-semibold capitalize text-muted-foreground"}>
          {user.archived_at ? "Deleted (archived)" : user.status}
        </span>
        <span>{user.default_company?.name ?? "No default company"}</span>
        <span>{user.employee ? `Employee ${user.employee.employee_number}` : "No employee link"}</span>
        {user.must_change_password ? <strong className="text-[var(--nx-warning)]">Password change required</strong> : null}
      </div>

      <section className="grid gap-4 border-b border-border p-5" aria-labelledby="account-details-title">
        <h4 id="account-details-title" className="font-semibold">User details</h4>
        <dl className="grid gap-3 sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted-foreground">Name</dt>
            <dd className="mt-1 text-sm">{user.display_name}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Username</dt>
            <dd className="mt-1 text-sm">{user.username}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Email</dt>
            <dd className="mt-1 text-sm">{user.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Status</dt>
            <dd className="mt-1 text-sm capitalize">{user.status}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Account type</dt>
            <dd className="mt-1 text-sm">{user.employee ? "Employee" : "User only"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Employee Master</dt>
            <dd className="mt-1 text-sm">{user.employee ? `${user.employee.employee_number} — ${user.employee.display_name}` : "Not linked"}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Default company</dt>
            <dd className="mt-1 text-sm">{user.default_company?.name ?? "No default company"}</dd>
          </div>
        </dl>
      </section>

      {mode === "edit" ? (
        <form className="grid gap-4 border-b border-border p-5" onSubmit={submitEdit}>
          <h4 className="font-semibold">Edit name, username and email</h4>
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Display name
            <Input
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              maxLength={200}
              required
              disabled={busy}
            />
          </Label>
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Username
            <Input
              value={username}
              onChange={(event) => setUsername(event.target.value.toLocaleLowerCase("en-US"))}
              pattern="[a-z0-9][a-z0-9._-]{2,127}"
              maxLength={128}
              required
              disabled={busy}
              autoComplete="off"
            />
          </Label>
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Email
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              maxLength={320}
              required
              disabled={busy}
            />
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("summary")}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Submit change
            </Button>
          </div>
        </form>
      ) : mode === "password" ? (
        <form className="grid gap-4 border-b border-border p-5" onSubmit={submitPasswordReset}>
          <h4 className="font-semibold">Reset password</h4>
          <p className="text-sm text-muted-foreground">
            Submit a reset for an independent approver. After approval, a new one-time password is shown to the approver
            once. The user sets their own password at the next sign-in, and existing sessions are revoked.
          </p>
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Reason for password reset
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("summary")} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !reason.trim()}>
              Submit password reset
            </Button>
          </div>
        </form>
      ) : mode === "archive" ? (
        <form
          className="grid gap-4 border-b border-border p-5"
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
          <h4 className="font-semibold">Delete user (soft)</h4>
          <p className="text-sm text-muted-foreground">
            Independent approval archives this account and revokes login/company access. Records and audit history are
            retained. Restore requires company access and activation approval.
          </p>
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Reason for soft delete
            <Input
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setMode("summary")}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={busy || !reason.trim()}>
              Submit soft delete
            </Button>
          </div>
        </form>
      ) : mode === "companies" ? (
        <form className="grid gap-4 border-b border-border p-5" onSubmit={submitCompanies}>
          <h4 className="font-semibold">Company boundary</h4>
          {options.companies.map((company) => {
            const selected = companyIds.includes(company.id);
            return (
              <div key={company.id} className="flex justify-between gap-3">
                <label className="flex items-center gap-2 text-sm">
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
                <label className="flex items-center gap-2 text-sm">
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
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("summary")}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !companyIds.length || !defaultCompanyId}>
              Submit change
            </Button>
          </div>
        </form>
      ) : mode === "employee" ? (
        <form className="grid gap-4 border-b border-border p-5" onSubmit={submitEmployee}>
          <h4 className="font-semibold">Employee link</h4>
          <select className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
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
          <Label className="grid gap-2 text-sm text-muted-foreground">
            Reason
            <Input value={reason} onChange={(event) => setReason(event.target.value)} required />
          </Label>
          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={() => setMode("summary")}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy}>
              Submit change
            </Button>
          </div>
        </form>
      ) : (
        <>
          <section className="grid gap-4 border-b border-border p-5">
            <div>
              <h4 className="font-semibold">Account controls</h4>
              <p className="mt-1 text-sm text-muted-foreground">Governed changes require an independent checker.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {permissions.has("security.user_account.edit") ? (
                <Button variant="outline" onClick={() => setMode("edit")} disabled={busy}>
                  Edit name / username / email
                </Button>
              ) : null}
              {permissions.has("security.user_account.company_access") ? (
                <Button variant="outline" onClick={() => setMode("companies")}>Companies</Button>
              ) : null}
              {permissions.has("security.user_account.edit") ? (
                <Button variant="outline" onClick={() => setMode("employee")}>Employee link</Button>
              ) : null}
              {permissions.has("security.user_account.reset_password") ? (
                <Button variant="outline" onClick={() => setMode("password")} disabled={busy}>
                  Reset password
                </Button>
              ) : null}
              {user.status !== "active" && permissions.has("security.user_account.activate") ? (
                <Button
                  variant="outline"
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
                </Button>
              ) : null}
              {user.status !== "inactive" && permissions.has("security.user_account.archive") ? (
                <Button
                  variant="destructive"
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
                </Button>
              ) : null}
              {user.status !== "inactive" &&
              permissions.has("security.user_account.archive") &&
              permissions.has("security.user_account.submit") ? (
                <Button
                  variant="destructive"
                  disabled={busy}
                  onClick={() => {
                    setReason("");
                    setMode("archive");
                  }}
                >
                  Delete (soft)
                </Button>
              ) : null}
              {user.status === "active" && permissions.has("security.user_account.lock") ? (
                <Button variant="destructive" onClick={() => void onEmergency("lock", reason)}>
                  Lock now
                </Button>
              ) : null}
              {permissions.has("security.user_account.revoke_sessions") ? (
                <Button variant="outline" onClick={() => void onEmergency("revoke_sessions", reason)}>Revoke sessions</Button>
              ) : null}
            </div>
            <Label className="grid gap-2 text-sm text-muted-foreground">
              Administrative reason
              <Input value={reason} onChange={(event) => setReason(event.target.value)} />
            </Label>
          </section>

          <section className="grid gap-4 border-b border-border p-5">
            <div>
              <h4 className="font-semibold">Role assignments</h4>
              <p className="mt-1 text-sm text-muted-foreground">Later role changes use the governed assignment workflow.</p>
            </div>
            <ul className="m-0 list-none p-0">
              {user.roles.map((role) => (
                <li className="flex items-center justify-between gap-3 border-t border-border py-3" key={role.assignment_id}>
                  <span className="grid">
                    <strong>{role.display_name}</strong>
                    <small className="text-xs text-muted-foreground">{role.role_code}</small>
                  </span>
                  {permissions.has("security.authorization.assignment.revoke") ? (
                    <Button
                      variant="outline"
                      size="sm"
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
                    </Button>
                  ) : null}
                </li>
              ))}
              {user.roles.length === 0 ? <li>No active roles.</li> : null}
            </ul>
            {permissions.has("security.authorization.assignment.create") ? (
              <form
                className="flex gap-2"
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
                <select className="h-8 min-w-0 flex-1 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50" value={rolePolicyId} onChange={(event) => setRolePolicyId(event.target.value)} required>
                  <option value="">Select a role</option>
                  {options.roles
                    .filter((role) => !user.roles.some((current) => current.role_policy_id === role.policy_id))
                    .map((role) => (
                      <option key={role.policy_id} value={role.policy_id}>
                        {role.display_name}
                      </option>
                    ))}
                </select>
                <Button type="submit" disabled={busy}>Create assignment request</Button>
              </form>
            ) : null}
          </section>
        </>
      )}
    </aside>
  );
}
