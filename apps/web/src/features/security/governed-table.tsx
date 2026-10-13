"use client";

import { useMemo, useState, type FormEvent } from "react";
import type { CreateSecurityAssignmentRequest } from "@nexora/contracts";
import { ApiError } from "../../lib/api/generated";
import { useSession } from "../../lib/session/session-provider";
import { ActionSelect, RecordDetails, SelectionCheckbox, type RowAction } from "./administration-controls";
import RoleForm, { roleDraftFromRow } from "./role-form";
import type { IdentitySection } from "./identity-navigation";
import styles from "./identity-workspace.module.css";

type Tab = "roles" | "assignments" | "approvals" | "permissions" | "audit";
type Row = Record<string, unknown>;
const columns: Record<Tab, string[]> = {
  roles: ["role_code", "display_name", "lifecycle_state", "permissions", "row_version"],
  assignments: ["user_id", "role_code", "lifecycle_state", "valid_from", "valid_until"],
  approvals: ["resource_type", "requested_action", "request_state", "requested_by", "row_version"],
  permissions: ["permission_key", "module", "resource", "action", "sensitivity"],
  audit: ["sequence", "action", "entity_type", "entity_id", "actor_id", "occurred_at"],
};
function rowId(tab: Tab, row: Row): string {
  return String(
    row[
      tab === "roles"
        ? "policy_id"
        : tab === "assignments"
          ? "assignment_id"
          : tab === "approvals"
            ? "request_id"
            : tab === "permissions"
              ? "permission_key"
              : "id"
    ],
  );
}
function display(value: unknown): string {
  return value == null ? "—" : typeof value === "object" ? JSON.stringify(value) : String(value);
}

export default function GovernedTable({
  tab,
  rows,
  permissions,
  approvalType,
  onChanged,
  onCredential,
  onOpenRoleSection,
}: {
  tab: Tab;
  rows: Row[];
  permissions: ReadonlySet<string>;
  approvalType: "role" | "assignment" | "user";
  onChanged(): Promise<void>;
  onCredential(password: string): void;
  onOpenRoleSection?(section: IdentitySection, policyId: string): void;
}) {
  const { api, csrfToken, session } = useSession();
  const [selected, setSelected] = useState<string[]>([]);
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [editing, setEditing] = useState<Row | null>(null);
  const [pending, setPending] = useState<{ action: string; rows: Row[]; key: string } | null>(null);
  const [reason, setReason] = useState("");
  const [validFrom, setValidFrom] = useState("");
  const [validUntil, setValidUntil] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          includeDeleted ||
          (tab === "roles"
            ? row.lifecycle_state !== "archived"
            : tab === "assignments"
              ? row.lifecycle_state !== "revoked"
              : true),
      ),
    [includeDeleted, rows, tab],
  );
  const chosen = visible.filter((row) => selected.includes(rowId(tab, row)));

  function actions(row: Row): RowAction[] {
    const result: RowAction[] = [{ value: "view", label: "View details" }];
    if (tab === "roles") {
      if (onOpenRoleSection) {
        if (permissions.has("security.authorization.assignment.read"))
          result.push({ value: "assignments", label: "Assigned users" });
        if (
          permissions.has("security.authorization.role.approve") ||
          permissions.has("security.authorization.assignment.approve")
        )
          result.push({ value: "approvals", label: "Approvals" });
        if (permissions.has("security.authorization.audit.read"))
          result.push({ value: "audit", label: "Audit history" });
      }
      if (row.lifecycle_state === "draft") {
        if (permissions.has("security.authorization.role.edit"))
          result.push({ value: "edit", label: "Edit draft permissions" });
        if (permissions.has("security.authorization.role.submit"))
          result.push({ value: "submit", label: "Submit for approval" });
      }
      if (row.lifecycle_state === "approved" && permissions.has("security.authorization.role.activate"))
        result.push({ value: "request_activate", label: "Activate" });
      if (row.lifecycle_state === "active" && permissions.has("security.authorization.role.archive"))
        result.push({ value: "request_archive", label: "Delete (soft)" });
    } else if (tab === "assignments" && row.lifecycle_state === "active") {
      if (
        permissions.has("security.authorization.assignment.edit") &&
        permissions.has("security.authorization.assignment.submit")
      )
        result.push({ value: "edit", label: "Edit validity" });
      if (
        permissions.has("security.authorization.assignment.revoke") &&
        permissions.has("security.authorization.assignment.submit")
      )
        result.push({ value: "revoke", label: "Delete (revoke assignment)" });
    } else if (
      tab === "approvals" &&
      ["pending", "submitted"].includes(String(row.request_state)) &&
      row.requested_by !== session?.user.id
    ) {
      if (
        permissions.has(
          approvalType === "user" ? "security.user_account.approve" : `security.authorization.${approvalType}.approve`,
        )
      ) {
        result.push({ value: "approved", label: "Approve" }, { value: "rejected", label: "Reject" });
      }
    }
    return result;
  }
  const bulkActions = chosen.length
    ? actions(chosen[0]!).filter(
        (action) =>
          !["view", "assignments", "approvals", "audit"].includes(action.value) &&
          (action.value !== "edit" || chosen.length === 1) &&
          !(tab === "approvals" && approvalType === "user" && action.value === "approved" && chosen.length > 1) &&
          chosen.every((row) => actions(row).some((candidate) => candidate.value === action.value)),
      )
    : [];

  function start(action: string, targets: Row[]) {
    setMessage("");
    if (action === "assignments" || action === "approvals" || action === "audit") {
      onOpenRoleSection?.(action, String(targets[0]!.policy_id));
      return;
    }
    if (action === "view") {
      setDetail(targets[0]!);
      return;
    }
    if (action === "edit" && tab === "roles") {
      try {
        roleDraftFromRow(targets[0]!);
        setEditing(targets[0]!);
      } catch {
        setMessage("This draft cannot be edited safely: required policy constraints are missing or invalid.");
      }
      return;
    }
    setReason("");
    if (tab === "assignments" && action === "edit") {
      setValidFrom(new Date(String(targets[0]!.valid_from)).toISOString());
      setValidUntil(targets[0]!.valid_until ? new Date(String(targets[0]!.valid_until)).toISOString() : "");
    }
    setPending({ action, rows: targets, key: `web-batch-${crypto.randomUUID()}` });
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (!pending || busy || ((pending.action === "revoke" || pending.action === "rejected") && !reason.trim())) return;
    setBusy(true);
    let completed = 0;
    let failure = "";
    for (const row of pending.rows) {
      const key = `${pending.key}:${rowId(tab, row)}`;
      try {
        if (tab === "roles" && ["submit", "request_activate", "request_archive"].includes(pending.action)) {
          const action = pending.action;
          if (action !== "submit" && action !== "request_activate" && action !== "request_archive")
            throw new Error("Unsupported action");
          await api.actOnSecurityRole(
            { action, policy_id: String(row.policy_id), expected_version: Number(row.row_version) },
            csrfToken(),
            key,
          );
        } else if (tab === "assignments" && (pending.action === "edit" || pending.action === "revoke")) {
          const proposal: CreateSecurityAssignmentRequest["proposal"] = {
            target_user_id: String(row.user_id),
            role_policy_id: String(row.role_policy_id),
            assignment_id: String(row.assignment_id),
            valid_from:
              pending.action === "edit"
                ? new Date(validFrom).toISOString()
                : new Date(String(row.valid_from)).toISOString(),
            valid_until:
              pending.action === "edit"
                ? validUntil
                  ? new Date(validUntil).toISOString()
                  : null
                : row.valid_until
                  ? new Date(String(row.valid_until)).toISOString()
                  : null,
            revocation_reason: pending.action === "revoke" ? reason.trim() : null,
          };
          const created = await api.createSecurityAssignmentRequest(
            { requested_action: pending.action, proposal },
            csrfToken(),
            `${key}:create`,
          );
          await api.actOnSecurityAssignmentRequest(
            { action: "submit", request_id: created.entity_id, expected_version: 1 },
            csrfToken(),
            `${key}:submit`,
          );
        } else if (tab === "approvals" && (pending.action === "approved" || pending.action === "rejected")) {
          const result = await api.decideSecurityApproval(
            {
              resource_type: approvalType,
              request_id: String(row.request_id),
              decision: pending.action,
              reason: reason.trim() || null,
              expected_version: Number(row.row_version),
            },
            csrfToken(),
            key,
          );
          if ("credential_delivery_available" in result && result.credential_delivery_available)
            onCredential(result.credential_delivery.one_time_password);
        } else throw new Error("Unsupported action");
        completed++;
        setSelected((current) => current.filter((id) => id !== rowId(tab, row)));
      } catch (error) {
        failure = `${display(row.display_name ?? row.role_code ?? row.request_id)}: ${error instanceof ApiError ? error.message : "Operation rejected. Review permissions, scope, versions and state."}`;
        break;
      }
    }
    let refreshWarning = "";
    if (completed) {
      try {
        await onChanged();
      } catch {
        refreshWarning = " Refresh failed; reload to verify the applied state.";
      }
    }
    setMessage(
      `${completed} of ${pending.rows.length} ${tab === "approvals" ? "decisions recorded" : "operations submitted for independent approval"}.${failure ? ` Stopped: ${failure}` : ""}${refreshWarning}`,
    );
    // Keep unprocessed requests and their keys for safe retries after transient failure.
    if (failure) setPending({ ...pending, rows: pending.rows.slice(completed) });
    else setPending(null);
    setBusy(false);
  }

  return (
    <>
      {message ? (
        <p className={styles.notice} role="status">
          {message}
        </p>
      ) : null}
      {tab === "roles" || tab === "assignments" ? (
        <label className={styles.historyToggle}>
          <input
            type="checkbox"
            checked={includeDeleted}
            disabled={busy || !!pending}
            onChange={(event) => {
              setIncludeDeleted(event.target.checked);
              setSelected([]);
            }}
          />{" "}
          Show deleted / historical records
        </label>
      ) : null}
      {editing ? (
        <RoleForm
          initial={roleDraftFromRow(editing)}
          busy={busy}
          onCancel={() => setEditing(null)}
          onSave={async (draft, key) => {
            setBusy(true);
            try {
              await api.actOnSecurityRole(
                {
                  action: "edit",
                  policy_id: String(editing.policy_id),
                  role_id: String(editing.role_id),
                  expected_version: Number(editing.row_version),
                  draft,
                },
                csrfToken(),
                key,
              );
              await onChanged();
              setMessage("Draft permissions updated and audited. Existing policy restrictions preserved.");
              return true;
            } catch (error) {
              setMessage(
                error instanceof ApiError
                  ? error.message
                  : "Draft update rejected. Review constraints and current version.",
              );
              return false;
            } finally {
              setBusy(false);
            }
          }}
        />
      ) : null}
      {detail ? <RecordDetails row={detail} onClose={() => setDetail(null)} /> : null}
      {chosen.length ? (
        <div className={styles.bulkBar}>
          <strong>{chosen.length} selected</strong>
          <ActionSelect
            label="Action for selected records"
            actions={bulkActions}
            disabled={busy || !!pending}
            onAction={(action) => start(action, chosen)}
          />
          <button disabled={busy || !!pending} onClick={() => setSelected([])}>
            Clear selection
          </button>
          {bulkActions.length === 0 ? (
            <span>No common permitted action. Edit and user credential approval require a single record.</span>
          ) : null}
        </div>
      ) : null}
      {pending ? (
        <form
          className={styles.confirmation}
          onSubmit={(event) => void confirm(event)}
          aria-label="Confirm administration action"
        >
          <h3>
            {pending.action === "request_archive" || pending.action === "revoke"
              ? "Confirm soft delete"
              : "Confirm action"}{" "}
            · {pending.rows.length} record(s)
          </h3>
          <p>
            {pending.action === "request_archive" || pending.action === "revoke"
              ? "No records are physically erased. Approval archives the role or revokes the assignment, preserving audit history."
              : "Each record is processed separately with existing authorization and maker-checker controls."}
          </p>
          <ul>
            {pending.rows.map((row) => (
              <li key={rowId(tab, row)}>{display(row.display_name ?? row.role_code ?? row.request_id)}</li>
            ))}
          </ul>
          {pending.action === "revoke" || pending.action === "rejected" ? (
            <label>
              Reason
              <input
                required
                maxLength={512}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                disabled={busy}
              />
            </label>
          ) : null}
          {pending.action === "edit" && tab === "assignments" ? (
            <>
              <label>
                Valid from (ISO timestamp)
                <input
                  required
                  value={validFrom}
                  onChange={(event) => setValidFrom(event.target.value)}
                  disabled={busy}
                />
              </label>
              <label>
                Valid until (ISO timestamp, optional)
                <input value={validUntil} onChange={(event) => setValidUntil(event.target.value)} disabled={busy} />
              </label>
            </>
          ) : null}
          <div>
            <button type="button" disabled={busy} onClick={() => setPending(null)}>
              Cancel
            </button>
            <button
              className={styles.primary}
              disabled={busy || ((pending.action === "revoke" || pending.action === "rejected") && !reason.trim())}
            >
              Confirm{tab === "approvals" ? " decision" : " and submit"}
            </button>
          </div>
        </form>
      ) : null}
      <div className={styles.tableWrap}>
        <table>
          <thead>
            <tr>
              <th scope="col">
                <SelectionCheckbox
                  label="Select all visible records"
                  checked={visible.length > 0 && chosen.length === visible.length}
                  mixed={chosen.length > 0 && chosen.length < visible.length}
                  disabled={busy || !!pending}
                  onChange={(checked) => setSelected(checked ? visible.map((row) => rowId(tab, row)) : [])}
                />
              </th>
              {columns[tab].map((column) => (
                <th scope="col" key={column}>
                  {column.replaceAll("_", " ")}
                </th>
              ))}
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={rowId(tab, row)}>
                <td>
                  <SelectionCheckbox
                    label={`Select ${display(row.display_name ?? row.role_code ?? row.permission_key ?? row.request_id ?? row.id)}`}
                    checked={selected.includes(rowId(tab, row))}
                    disabled={busy || !!pending}
                    onChange={(checked) =>
                      setSelected((current) =>
                        checked ? [...current, rowId(tab, row)] : current.filter((id) => id !== rowId(tab, row)),
                      )
                    }
                  />
                </td>
                {columns[tab].map((column) => (
                  <td key={column}>{display(row[column])}</td>
                ))}
                <td>
                  <ActionSelect
                    label={`Action for ${display(row.display_name ?? row.role_code ?? row.permission_key ?? row.request_id ?? row.id)}`}
                    actions={actions(row)}
                    disabled={busy || !!pending}
                    onAction={(action) => start(action, [row])}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {visible.length === 0 ? (
          <p className={styles.state}>No current records. Enable historical records to view retained entries.</p>
        ) : null}
      </div>
    </>
  );
}
