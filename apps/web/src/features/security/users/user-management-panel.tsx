"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import type {
  CreateSecurityAssignmentRequest,
  CreateSecurityUserRequest,
  SecurityUserDetail,
  SecurityUserOptions,
  SecurityUserPage,
} from "@nexora/contracts";

import { useSession } from "../../../lib/session/session-provider";
import { ApiError } from "../../../lib/api/generated";
import UserDetail, { type UserDetailMode } from "./user-detail";
import { ActionSelect, SelectionCheckbox, type RowAction } from "../administration-controls";
import { buildSecurityUserListQuery } from "./user-list-query";
import UserWizard from "./user-wizard";
import { loadUserWizardDraft, userWizardDraftKey, type UserWizardDraft } from "./user-wizard-draft";
import styles from "./user-management.module.css";
import type { IdentitySection } from "../identity-navigation";

const emptyOptions: SecurityUserOptions = { companies: [], employees: [], roles: [] };

function idempotency(): string {
  return `web-user-${crypto.randomUUID()}`;
}

function requestError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === "REQUEST_TIMEOUT") {
      return "The server took too long to respond. Your form draft is preserved and you can retry safely.";
    }
    return error.message;
  }
  return "The request was rejected. Check your permission, scope, current state, and separation-of-duties rules.";
}

export default function UserManagementPanel({
  permissions,
  onOpenSection,
}: {
  permissions: ReadonlySet<string>;
  onOpenSection?(section: IdentitySection, userId: string): void;
}) {
  const searchParams = useSearchParams();
  const { api, csrfToken, session } = useSession();
  const [users, setUsers] = useState<SecurityUserPage["items"]>([]);
  const [options, setOptions] = useState<SecurityUserOptions>(emptyOptions);
  const [selected, setSelected] = useState<SecurityUserDetail | null>(null);
  const [query, setQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  const [status, setStatus] = useState<"" | "active" | "inactive" | "locked">("");
  const [employeeLink, setEmployeeLink] = useState<"" | "true" | "false">("");
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [initialDraft, setInitialDraft] = useState<UserWizardDraft | null>(null);
  const [message, setMessage] = useState("");
  const [archived, setArchived] = useState<"" | "true" | "false">("false");
  const [checkedIds, setCheckedIds] = useState<string[]>([]);
  const [detailMode, setDetailMode] = useState<UserDetailMode>("summary");
  const [detailKey, setDetailKey] = useState(0);
  const [pendingAction, setPendingAction] = useState<{
    action: string;
    users: SecurityUserPage["items"];
    key: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState("");
  const requestedUserId = searchParams.get("user");

  const canRead = permissions.has("security.user_account.read");
  const canCreate = permissions.has("security.user_account.create");
  const draftKey = userWizardDraftKey(session?.tenant_id ?? "unknown", session?.user.id ?? "unknown");

  const listQuery = useMemo(() => {
    return buildSecurityUserListQuery({ search: appliedQuery, status, employeeLink, archived });
  }, [appliedQuery, employeeLink, status, archived]);

  const load = useCallback(
    async (detailId: string | null = null) => {
      if (!canRead) {
        setLoading(false);
        return false;
      }
      setLoading(true);
      setMessage("");
      try {
        const [page, loadedOptions] = await Promise.all([
          api.listSecurityUsers(listQuery),
          api.listSecurityUserOptions(),
        ]);
        setUsers(page.items);
        setOptions(loadedOptions);
        if (detailId) setSelected(await api.getSecurityUser(detailId));
        return true;
      } catch {
        setMessage("User accounts are unavailable or your account is not authorized for this scope.");
        setUsers([]);
        setSelected(null);
        return false;
      } finally {
        setLoading(false);
      }
    },
    [api, canRead, listQuery],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => void load(requestedUserId), 0);
    return () => window.clearTimeout(timer);
  }, [load, requestedUserId]);

  function setDeepLink(userId: string | null) {
    const params = new URLSearchParams(window.location.search);
    params.set("tab", "users");
    if (userId) params.set("user", userId);
    else params.delete("user");
    window.history.replaceState(null, "", `/admin/identity?${params.toString()}`);
  }

  async function selectUser(userId: string, mode: UserDetailMode = "summary") {
    setBusy(true);
    setMessage("");
    try {
      setSelected(await api.getSecurityUser(userId));
      setDetailMode(mode);
      setDetailKey((current) => current + 1);
      setDeepLink(userId);
    } catch {
      setMessage("The selected user is unavailable or outside your authorized scope.");
    } finally {
      setBusy(false);
    }
  }

  function openCreate(): void {
    setInitialDraft(loadUserWizardDraft(window.sessionStorage, draftKey));
    setShowCreate(true);
  }

  async function createAndSubmitUser(
    request: CreateSecurityUserRequest,
    success: string,
    idempotencySeed?: string,
  ): Promise<boolean> {
    setBusy(true);
    setMessage("");
    try {
      const created = await api.createSecurityUserRequest(
        request,
        csrfToken(),
        idempotencySeed ? `web-user-create:${idempotencySeed}` : idempotency(),
      );
      await api.actOnSecurityUserRequest(
        { action: "submit", request_id: created.entity_id, expected_version: 1 },
        csrfToken(),
        idempotencySeed ? `web-user-submit:${idempotencySeed}` : idempotency(),
      );
      setShowCreate(false);
      await load(selected?.id);
      setMessage(success);
      return true;
    } catch (error) {
      setMessage(requestError(error));
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function createAndSubmitAssignment(
    requestedAction: "create" | "revoke",
    proposal: CreateSecurityAssignmentRequest["proposal"],
  ) {
    setBusy(true);
    setMessage("");
    try {
      const created = await api.createSecurityAssignmentRequest(
        { requested_action: requestedAction, proposal },
        csrfToken(),
        idempotency(),
      );
      await api.actOnSecurityAssignmentRequest(
        { action: "submit", request_id: created.entity_id, expected_version: 1 },
        csrfToken(),
        idempotency(),
      );
      setMessage("Role assignment request submitted for independent approval.");
      await load(selected?.id);
    } catch (error) {
      setMessage(requestError(error));
    } finally {
      setBusy(false);
    }
  }

  async function emergency(action: "lock" | "revoke_sessions", reason: string) {
    if (!selected) return;
    setBusy(true);
    setMessage("");
    try {
      await api.actOnSecurityUserEmergency(
        { action, target_user_id: selected.id, expected_user_version: selected.row_version, reason },
        csrfToken(),
        idempotency(),
      );
      setMessage(action === "lock" ? "User locked and active sessions revoked." : "All user sessions revoked.");
      await load(selected.id);
    } catch (error) {
      setMessage(requestError(error));
    } finally {
      setBusy(false);
    }
  }

  function userActions(user: SecurityUserPage["items"][number]): RowAction[] {
    const actions: RowAction[] = [{ value: "view", label: "View details" }];
    if (onOpenSection) {
      if (permissions.has("security.authorization.assignment.read"))
        actions.push({ value: "assignments", label: "Assigned roles" });
      if (
        permissions.has("security.user_account.approve") ||
        permissions.has("security.authorization.assignment.approve")
      )
        actions.push({ value: "approvals", label: "Approvals" });
      if (permissions.has("security.authorization.audit.read"))
        actions.push({ value: "audit", label: "Audit history" });
    }
    const canSubmit = permissions.has("security.user_account.submit");
    if (canSubmit && permissions.has("security.user_account.edit")) actions.push({ value: "edit", label: "Edit" });
    if (canSubmit && !user.archived_at && permissions.has("security.user_account.reset_password"))
      actions.push({ value: "reset_password", label: "Reset password" });
    if (canSubmit && user.status !== "inactive" && permissions.has("security.user_account.archive")) {
      actions.push(
        { value: "deactivate", label: "Deactivate / archive" },
        { value: "archive", label: "Delete (soft)" },
      );
    }
    if (canSubmit && user.status !== "active" && permissions.has("security.user_account.activate"))
      actions.push({
        value: user.status === "locked" ? "unlock" : "activate",
        label: user.status === "locked" ? "Unlock" : "Activate / restore",
      });
    if (user.status === "active" && permissions.has("security.user_account.lock"))
      actions.push({ value: "lock", label: "Lock" });
    if (permissions.has("security.user_account.revoke_sessions"))
      actions.push({ value: "revoke_sessions", label: "Revoke sessions" });
    return actions;
  }
  const checkedUsers = users.filter((user) => checkedIds.includes(user.id));
  const bulkActions = checkedUsers.length
    ? userActions(checkedUsers[0]!).filter(
        (action) =>
          !["view", "assignments", "approvals", "audit"].includes(action.value) &&
          (action.value !== "edit" || checkedUsers.length === 1) &&
          checkedUsers.every((user) => userActions(user).some((candidate) => candidate.value === action.value)),
      )
    : [];

  function startUserAction(action: string, targets: SecurityUserPage["items"]) {
    if (action === "assignments" || action === "approvals" || action === "audit") {
      onOpenSection?.(action, targets[0]!.id);
      return;
    }
    if (action === "view" || action === "edit" || (action === "reset_password" && targets.length === 1)) {
      void selectUser(
        targets[0]!.id,
        action === "edit" ? "edit" : action === "reset_password" ? "password" : "summary",
      );
      return;
    }
    setActionReason("");
    setPendingAction({ action, users: targets, key: idempotency() });
  }

  async function confirmUserAction(event: FormEvent) {
    event.preventDefault();
    if (!pendingAction || busy || !actionReason.trim()) return;
    setBusy(true);
    const action = pendingAction.action === "deactivate" ? "archive" : pendingAction.action;
    let completed = 0;
    let failure = "";
    for (const user of pendingAction.users) {
      const key = `${pendingAction.key}:${user.id}`;
      try {
        if (action === "lock" || action === "revoke_sessions") {
          await api.actOnSecurityUserEmergency(
            { action, target_user_id: user.id, expected_user_version: user.row_version, reason: actionReason.trim() },
            csrfToken(),
            key,
          );
        } else if (
          action === "archive" ||
          action === "reset_password" ||
          action === "activate" ||
          action === "unlock"
        ) {
          const request: CreateSecurityUserRequest =
            action === "archive" || action === "reset_password"
              ? {
                  requested_action: action,
                  target_user_id: user.id,
                  expected_user_version: user.row_version,
                  proposal: { reason: actionReason.trim() },
                }
              : {
                  requested_action: action,
                  target_user_id: user.id,
                  expected_user_version: user.row_version,
                  proposal: {},
                };
          const created = await api.createSecurityUserRequest(request, csrfToken(), `${key}:create`);
          await api.actOnSecurityUserRequest(
            { action: "submit", request_id: created.entity_id, expected_version: 1 },
            csrfToken(),
            `${key}:submit`,
          );
        } else throw new Error("Unsupported action");
        completed++;
        setCheckedIds((current) => current.filter((id) => id !== user.id));
      } catch (error) {
        failure = `${user.display_name}: ${requestError(error)}`;
        break;
      }
    }
    const refreshWarning =
      completed && !(await load(selected?.id)) ? " Refresh failed; reload to verify the applied state." : "";
    setMessage(
      `${completed} of ${pendingAction.users.length} ${action === "lock" || action === "revoke_sessions" ? "operations completed" : "requests submitted for independent approval"}.${failure ? ` Stopped: ${failure}` : ""}${refreshWarning}`,
    );
    setPendingAction(failure ? { ...pendingAction, users: pendingAction.users.slice(completed) } : null);
    setBusy(false);
  }

  if (!canRead) {
    return <p className={styles.state}>You do not have permission to view governed user accounts.</p>;
  }

  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <label>
            <span className={styles.srOnly}>Search users</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, username, or email"
            />
          </label>
          <select
            value={status}
            onChange={(event) => setStatus(event.target.value as typeof status)}
            aria-label="Filter by account status"
          >
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="locked">Locked</option>
            <option value="inactive">Inactive</option>
          </select>
          <select
            value={employeeLink}
            onChange={(event) => setEmployeeLink(event.target.value as typeof employeeLink)}
            aria-label="Filter by employee link"
          >
            <option value="">All employee links</option>
            <option value="true">Employee linked</option>
            <option value="false">Not linked</option>
          </select>
          <select
            value={archived}
            aria-label="Filter deleted users"
            disabled={busy || !!pendingAction}
            onChange={(event) => {
              setArchived(event.target.value as typeof archived);
              setCheckedIds([]);
            }}
          >
            <option value="false">Current users</option>
            <option value="true">Deleted / archived users</option>
            <option value="">All including deleted</option>
          </select>
          <button disabled={loading}>Search</button>
        </form>
        <div>
          <button onClick={() => void load(selected?.id)} disabled={loading}>
            Refresh
          </button>
          {canCreate ? (
            <button className={styles.primary} onClick={openCreate}>
              Create user
            </button>
          ) : null}
        </div>
      </div>

      {message ? (
        <p className={styles.notice} role="status">
          {message}
        </p>
      ) : null}
      {showCreate ? (
        <UserWizard
          options={options}
          busy={busy}
          draftKey={draftKey}
          initialDraft={initialDraft}
          onCancel={() => setShowCreate(false)}
          onSubmit={(request, idempotencySeed) =>
            createAndSubmitUser(request, "User request submitted for independent approval.", idempotencySeed)
          }
        />
      ) : null}

      {checkedUsers.length > 0 ? (
        <div className={styles.bulkBar}>
          <strong>{checkedUsers.length} selected</strong>
          <ActionSelect
            label="Action for selected users"
            actions={bulkActions}
            disabled={busy || loading || !!pendingAction}
            onAction={(action) => startUserAction(action, checkedUsers)}
          />
          <button disabled={busy || !!pendingAction} onClick={() => setCheckedIds([])}>
            Clear selection
          </button>
          {bulkActions.length === 0 ? <span>No common permitted action. Identity edits require one user.</span> : null}
        </div>
      ) : null}
      {pendingAction ? (
        <form
          className={styles.confirmation}
          aria-label="Confirm user action"
          onSubmit={(event) => void confirmUserAction(event)}
        >
          <h3>
            {pendingAction.action === "archive" ? "Confirm soft delete" : "Confirm user action"} ·{" "}
            {pendingAction.users.length} user(s)
          </h3>
          <p>
            {pendingAction.action === "archive" || pendingAction.action === "deactivate"
              ? "Delete and deactivate use the existing governed archive lifecycle. After checker approval, login and company access are revoked. Records and audit history remain; restore requires company access and activation approval."
              : "Each user is processed separately. Governed changes require independent approval; lock and session revocation take effect immediately."}
          </p>
          <ul>
            {pendingAction.users.map((user) => (
              <li key={user.id}>
                {user.display_name} · {user.email}
              </li>
            ))}
          </ul>
          <label>
            Administrative reason
            <input
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </label>
          <div>
            <button type="button" disabled={busy} onClick={() => setPendingAction(null)}>
              Cancel
            </button>
            <button className={styles.primary} disabled={busy || !actionReason.trim()}>
              Confirm action
            </button>
          </div>
        </form>
      ) : null}

      <div className={styles.content}>
        <div className={styles.list} aria-busy={loading}>
          {loading ? <p className={styles.state}>Loading governed users...</p> : null}
          {!loading && users.length === 0 ? <p className={styles.state}>No users match the current filters.</p> : null}
          {users.length > 0 ? (
            <div className={styles.tableScroll}>
              <table className={styles.userTable}>
                <caption className={styles.srOnly}>
                  User accounts. Select a name to open account details and controls.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">
                      <SelectionCheckbox
                        label="Select all visible users"
                        checked={users.length > 0 && checkedUsers.length === users.length}
                        mixed={checkedUsers.length > 0 && checkedUsers.length < users.length}
                        disabled={busy || loading || !!pendingAction}
                        onChange={(checked) => setCheckedIds(checked ? users.map((user) => user.id) : [])}
                      />
                    </th>
                    <th scope="col">Name</th>
                    <th scope="col">Username</th>
                    <th scope="col">Email</th>
                    <th scope="col">Status</th>
                    <th scope="col">Employee link</th>
                    <th scope="col">Roles</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={selected?.id === user.id ? styles.userSelected : styles.userRow}>
                      <td>
                        <SelectionCheckbox
                          label={`Select user ${user.display_name}`}
                          checked={checkedIds.includes(user.id)}
                          disabled={busy || loading || !!pendingAction}
                          onChange={(checked) =>
                            setCheckedIds((current) =>
                              checked ? [...current, user.id] : current.filter((id) => id !== user.id),
                            )
                          }
                        />
                      </td>
                      <th scope="row">
                        <button
                          className={styles.userNameButton}
                          onClick={() => void selectUser(user.id)}
                          disabled={busy}
                          aria-pressed={selected?.id === user.id}
                          aria-label={`Open user ${user.display_name}`}
                        >
                          <span className={styles.avatar} aria-hidden="true">
                            {user.display_name.slice(0, 2).toLocaleUpperCase("en-US")}
                          </span>
                          <span>{user.display_name}</span>
                        </button>
                        {user.pending_request_count > 0 ? (
                          <span className={styles.pending}>{user.pending_request_count} pending</span>
                        ) : null}
                      </th>
                      <td>{user.username}</td>
                      <td>{user.email}</td>
                      <td>
                        <span className={`${styles.status} ${styles[user.status]}`}>
                          {user.archived_at ? "Deleted (archived)" : user.status}
                        </span>
                      </td>
                      <td>
                        <span className={user.employee_linked ? styles.linked : styles.notLinked}>
                          {user.employee_linked ? "Employee linked" : "Not linked"}
                        </span>
                      </td>
                      <td>{user.role_names.length ? user.role_names.join(", ") : "No active roles"}</td>
                      <td>
                        <ActionSelect
                          label={`Action for user ${user.display_name}`}
                          actions={userActions(user)}
                          disabled={busy || loading || !!pendingAction}
                          onAction={(action) => startUserAction(action, [user])}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </div>
        {selected ? (
          <UserDetail
            key={`${selected.id}:${selected.row_version}:${detailKey}`}
            initialMode={detailMode}
            user={selected}
            options={options}
            permissions={permissions}
            busy={busy}
            onClose={() => {
              setSelected(null);
              setDeepLink(null);
            }}
            onGovernedAction={async (request) => {
              await createAndSubmitUser(request, "User change submitted for independent approval.");
            }}
            onEmergency={emergency}
            onAssignRole={(proposal) => createAndSubmitAssignment("create", proposal)}
            onRevokeRole={(proposal) => createAndSubmitAssignment("revoke", proposal)}
          />
        ) : null}
      </div>
    </div>
  );
}
