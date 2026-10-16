"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import type {
  CreateSecurityAssignmentRequest,
  CreateSecurityUserRequest,
  SecurityUserDetail,
  SecurityUserOptions,
  SecurityUserPage,
} from "@nexora/contracts";
import { Alert, AlertDescription } from "../../../components/ui/alert";
import { Button } from "../../../components/ui/button";
import { Input } from "../../../components/ui/input";
import { Label } from "../../../components/ui/label";

import { useSession } from "../../../lib/session/session-provider";
import { ApiError } from "../../../lib/api/generated";
import UserDetail, { type UserDetailMode } from "./user-detail";
import { ActionSelect, SelectionCheckbox, type RowAction } from "../administration-controls";
import { buildSecurityUserListQuery } from "./user-list-query";
import UserWizard from "./user-wizard";
import { loadUserWizardDraft, userWizardDraftKey, type UserWizardDraft } from "./user-wizard-draft";
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
  requestedUserId = null,
  createMode = false,
  onNavigateUser,
  onCreateModeChange,
}: {
  permissions: ReadonlySet<string>;
  onOpenSection?(section: IdentitySection, userId: string): void;
  requestedUserId?: string | null;
  createMode?: boolean;
  onNavigateUser?(userId: string | null): void;
  onCreateModeChange?(active: boolean): void;
}) {
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
  const [showCreate, setShowCreate] = useState(createMode);
  const [initialDraft, setInitialDraft] = useState<UserWizardDraft | null>(() =>
    createMode && typeof window !== "undefined"
      ? loadUserWizardDraft(
          window.sessionStorage,
          userWizardDraftKey(session?.tenant_id ?? "unknown", session?.user.id ?? "unknown"),
        )
      : null,
  );
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

  async function selectUser(userId: string, mode: UserDetailMode = "summary") {
    setBusy(true);
    setMessage("");
    try {
      setSelected(await api.getSecurityUser(userId));
      setDetailMode(mode);
      setDetailKey((current) => current + 1);
      onNavigateUser?.(userId);
    } catch {
      setMessage("The selected user is unavailable or outside your authorized scope.");
    } finally {
      setBusy(false);
    }
  }

  function openCreate(): void {
    setInitialDraft(loadUserWizardDraft(window.sessionStorage, draftKey));
    setShowCreate(true);
    onCreateModeChange?.(true);
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
      onCreateModeChange?.(false);
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
    return <p className="p-9 text-center text-sm text-muted-foreground">You do not have permission to view governed user accounts.</p>;
  }

  return (
    <div className="min-h-105 text-foreground">
      <div className="flex flex-wrap justify-between gap-4 border-b border-border bg-muted/60 px-5 py-4">
        <form
          className="flex flex-1 flex-wrap gap-2"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            setAppliedQuery(query.trim());
          }}
        >
          <div>
            <Label className="sr-only" htmlFor="user-search">Search users</Label>
            <Input
              id="user-search"
              className="min-w-70"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, username, or email"
            />
          </div>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
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
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
            value={employeeLink}
            onChange={(event) => setEmployeeLink(event.target.value as typeof employeeLink)}
            aria-label="Filter by employee link"
          >
            <option value="">All employee links</option>
            <option value="true">Employee linked</option>
            <option value="false">Not linked</option>
          </select>
          <select
            className="h-8 rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
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
          <Button type="submit" variant="outline" disabled={loading}>Search</Button>
        </form>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => void load(selected?.id)} disabled={loading}>
            Refresh
          </Button>
          {canCreate ? (
            <Button onClick={openCreate}>
              Create user
            </Button>
          ) : null}
        </div>
      </div>

      {message ? (
        <Alert className="mx-5 mt-4 border-[var(--nx-info-border)] bg-[var(--nx-info-soft)] text-[var(--nx-info)]" role="status">
          <AlertDescription className="text-[var(--nx-info)]">{message}</AlertDescription>
        </Alert>
      ) : null}
      {showCreate ? (
        <UserWizard
          options={options}
          busy={busy}
          draftKey={draftKey}
          initialDraft={initialDraft}
          onCancel={() => {
            setShowCreate(false);
            onCreateModeChange?.(false);
          }}
          onSubmit={(request, idempotencySeed) =>
            createAndSubmitUser(request, "User request submitted for independent approval.", idempotencySeed)
          }
        />
      ) : null}

      {checkedUsers.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 bg-[var(--nx-info-soft)] px-5 py-3 text-sm">
          <strong>{checkedUsers.length} selected</strong>
          <ActionSelect
            label="Action for selected users"
            actions={bulkActions}
            disabled={busy || loading || !!pendingAction}
            onAction={(action) => startUserAction(action, checkedUsers)}
          />
          <Button variant="outline" size="sm" disabled={busy || !!pendingAction} onClick={() => setCheckedIds([])}>
            Clear selection
          </Button>
          {bulkActions.length === 0 ? <span>No common permitted action. Identity edits require one user.</span> : null}
        </div>
      ) : null}
      {pendingAction ? (
        <form
          className="mx-5 my-4 rounded-lg border border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] p-4"
          aria-label="Confirm user action"
          onSubmit={(event) => void confirmUserAction(event)}
        >
          <h3 className="text-lg font-semibold">
            {pendingAction.action === "archive" ? "Confirm soft delete" : "Confirm user action"} ·{" "}
            {pendingAction.users.length} user(s)
          </h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {pendingAction.action === "archive" || pendingAction.action === "deactivate"
              ? "Delete and deactivate use the existing governed archive lifecycle. After checker approval, login and company access are revoked. Records and audit history remain; restore requires company access and activation approval."
              : "Each user is processed separately. Governed changes require independent approval; lock and session revocation take effect immediately."}
          </p>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
            {pendingAction.users.map((user) => (
              <li key={user.id}>
                {user.display_name} · {user.email}
              </li>
            ))}
          </ul>
          <Label className="mt-4 grid gap-2 text-sm text-muted-foreground">
            Administrative reason
            <Input
              value={actionReason}
              onChange={(event) => setActionReason(event.target.value)}
              maxLength={512}
              required
              disabled={busy}
            />
          </Label>
          <div className="mt-4 flex gap-2">
            <Button type="button" variant="outline" disabled={busy} onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || !actionReason.trim()}>
              Confirm action
            </Button>
          </div>
        </form>
      ) : null}

      <div className={selected ? "grid min-w-0 lg:grid-cols-[minmax(420px,1fr)_minmax(380px,0.85fr)]" : "grid min-w-0"}>
        <div className="min-w-0" aria-busy={loading}>
          {loading ? <p className="p-9 text-center text-sm text-muted-foreground">Loading governed users...</p> : null}
          {!loading && users.length === 0 ? <p className="p-9 text-center text-sm text-muted-foreground">No users match the current filters.</p> : null}
          {users.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-190 border-collapse text-left text-sm">
                <caption className="sr-only">
                  User accounts. Select a name to open account details and controls.
                </caption>
                <thead>
                  <tr className="bg-muted/60">
                    <th className="px-4 py-3 text-xs font-semibold text-muted-foreground" scope="col">
                      <SelectionCheckbox
                        label="Select all visible users"
                        checked={users.length > 0 && checkedUsers.length === users.length}
                        mixed={checkedUsers.length > 0 && checkedUsers.length < users.length}
                        disabled={busy || loading || !!pendingAction}
                        onChange={(checked) => setCheckedIds(checked ? users.map((user) => user.id) : [])}
                      />
                    </th>
                    {['Name', 'Username', 'Email', 'Status', 'Employee link', 'Roles', 'Action'].map((label) => <th className="px-4 py-3 text-xs font-semibold text-muted-foreground" scope="col" key={label}>{label}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id} className={selected?.id === user.id ? "border-b border-border bg-[var(--nx-selection-background)] shadow-[inset_3px_0_var(--nx-focus-color)]" : "border-b border-border hover:bg-[var(--nx-selection-background)]"}>
                      <td className="px-4 py-3">
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
                      <th className="min-w-47.5 px-4 py-3 font-medium" scope="row">
                        <Button
                          variant="ghost"
                          className="h-auto justify-start gap-2.5 px-0 py-0 text-left text-primary hover:bg-transparent hover:text-primary hover:underline"
                          onClick={() => void selectUser(user.id)}
                          disabled={busy}
                          aria-pressed={selected?.id === user.id}
                          aria-label={`Open user ${user.display_name}`}
                        >
                          <span className="grid size-10 place-items-center rounded-full bg-accent font-bold text-primary" aria-hidden="true">
                            {user.display_name.slice(0, 2).toLocaleUpperCase("en-US")}
                          </span>
                          <span>{user.display_name}</span>
                        </Button>
                        {user.pending_request_count > 0 ? (
                          <span className="ml-12 mt-1.5 inline-block rounded-full bg-[var(--nx-purple-soft)] px-2 py-1 text-xs font-semibold text-[var(--nx-purple)]">{user.pending_request_count} pending</span>
                        ) : null}
                      </th>
                      <td className="px-4 py-3">{user.username}</td>
                      <td className="px-4 py-3">{user.email}</td>
                      <td className="px-4 py-3">
                        <span className={user.status === "active" ? "rounded-full bg-[var(--nx-success-soft)] px-2 py-1 text-xs font-semibold capitalize text-[var(--nx-success-text)]" : user.status === "locked" ? "rounded-full bg-[var(--nx-warning-soft)] px-2 py-1 text-xs font-semibold capitalize text-[var(--nx-warning)]" : "rounded-full bg-muted px-2 py-1 text-xs font-semibold capitalize text-muted-foreground"}>
                          {user.archived_at ? "Deleted (archived)" : user.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={user.employee_linked ? "rounded-full bg-[var(--nx-info-soft)] px-2 py-1 text-xs font-semibold text-[var(--nx-info)]" : "rounded-full bg-muted px-2 py-1 text-xs font-semibold text-[var(--nx-warning)]"}>
                          {user.employee_linked ? "Employee linked" : "Not linked"}
                        </span>
                      </td>
                      <td className="px-4 py-3">{user.role_names.length ? user.role_names.join(", ") : "No active roles"}</td>
                      <td className="px-4 py-3">
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
              onNavigateUser?.(null);
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
