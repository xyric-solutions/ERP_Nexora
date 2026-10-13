"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSecurityRoleRequestSchema, type CreateSecurityRoleRequest } from "@nexora/contracts";
import { useSession } from "../../lib/session/session-provider";
import { SelectionCheckbox } from "./administration-controls";
import styles from "./identity-workspace.module.css";

interface PermissionDefinition {
  key: string;
  module: string;
  resource: string;
  description: string;
}

export function roleDraftFromRow(row: Record<string, unknown>): CreateSecurityRoleRequest {
  if (
    row.allowed_source_states === undefined ||
    row.delegations === undefined ||
    row.scope === undefined ||
    row.field_rules === undefined ||
    row.sod_rules === undefined
  ) {
    throw new Error("Incomplete role restrictions");
  }
  return createSecurityRoleRequestSchema.parse({
    role_code: row.role_code,
    display_name: row.display_name,
    description: row.description,
    permissions: row.permissions,
    scope: row.scope,
    field_rules: row.field_rules,
    sod_rules: row.sod_rules,
    allowed_source_states: row.allowed_source_states,
    delegations: row.delegations,
  });
}

export default function RoleForm({
  initial,
  busy,
  onSave,
  onCancel,
}: {
  initial?: CreateSecurityRoleRequest;
  busy: boolean;
  onSave(payload: CreateSecurityRoleRequest, key: string): Promise<boolean>;
  onCancel(): void;
}) {
  const { api } = useSession();
  const [generatedCode] = useState(() => `role_${crypto.randomUUID().replaceAll("-", "")}`);
  const [name, setName] = useState(initial?.display_name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.permissions ?? []);
  const [catalogue, setCatalogue] = useState<PermissionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [attempt, setAttempt] = useState<{ payload: string; key: string } | null>(null);
  useEffect(() => {
    let active = true;
    api
      .listSecurityPermissions()
      .then((page) => {
        if (!active) return;
        if (page.next_cursor !== null) throw new Error("Incomplete permission catalogue");
        const definitions = page.items.map((row) => {
          if (
            typeof row.permission_key !== "string" ||
            typeof row.module !== "string" ||
            typeof row.resource !== "string"
          ) {
            throw new Error("Invalid permission catalogue");
          }
          return {
            key: row.permission_key,
            module: row.module,
            resource: row.resource,
            description: typeof row.description === "string" ? row.description : row.permission_key,
          };
        });
        setCatalogue(definitions);
      })
      .catch(() => {
        if (active) setError("Permission catalogue unavailable. Saving is blocked; check catalogue-read permission.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [api]);
  const selectedSet = useMemo(() => new Set(selected), [selected]);
  const groups = useMemo(() => {
    const result = new Map<string, PermissionDefinition[]>();
    for (const permission of catalogue) {
      if (!`${permission.key} ${permission.description}`.toLowerCase().includes(search.toLowerCase().trim())) continue;
      const key = permission.module;
      result.set(key, [...(result.get(key) ?? []), permission]);
    }
    return [...result.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [catalogue, search]);
  function toggle(keys: string[], checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, ...keys])].sort() : current.filter((key) => !keys.includes(key)),
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || loading || error || selected.length === 0) return;
    // Preserve every existing restriction. Removing a constrained permission is rejected
    // by the backend rather than silently deleting its state/delegation rules.
    const payload: CreateSecurityRoleRequest = {
      ...(initial ?? {
        scope: { mode: "tenant", company_ids: [] },
        field_rules: { allow: null, deny: [] },
        sod_rules: { conflicting_roles: [], distinct_actor_fields: [] },
        allowed_source_states: {},
        delegations: [],
      }),
      role_code: initial?.role_code ?? generatedCode,
      display_name: name.trim(),
      description,
      permissions: selected,
    };
    if (!createSecurityRoleRequestSchema.safeParse(payload).success) return;
    const fingerprint = JSON.stringify(payload);
    const key = attempt?.payload === fingerprint ? attempt.key : `web-role-${crypto.randomUUID()}`;
    setAttempt({ payload: fingerprint, key });
    if (await onSave(payload, key)) onCancel();
  }
  const unavailable = selected.filter((key) => !catalogue.some((item) => item.key === key));
  return (
    <form
      className={styles.roleForm}
      onSubmit={(event) => void submit(event)}
      aria-label={initial ? "Edit role draft" : "Create role"}
    >
      <header>
        <h3>{initial ? "Edit draft permissions" : "Add role"}</h3>
        <p>Save a draft, then submit it for independent approval.</p>
      </header>
      <div className={styles.roleFields}>
        <label>
          Role name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={128}
            required
            readOnly={!!initial}
            disabled={busy}
          />
        </label>
        <label>
          Role code
          <input value={initial?.role_code ?? generatedCode} readOnly aria-describedby="role-code-help" />
        </label>
        <label>
          Description
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={512}
            readOnly={!!initial}
            disabled={busy}
          />
        </label>
      </div>
      <p id="role-code-help" className={styles.formHelp}>
        Role code is generated automatically and remains unchanged.{" "}
        {initial ? "Existing scope, field and SoD restrictions are preserved." : ""}
      </p>
      <fieldset className={styles.permissionPicker} disabled={busy || loading || !!error}>
        <legend>
          Select Permissions <span>{selected.length} selected</span>
        </legend>
        <label className={styles.permissionSearch}>
          Search permissions
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search module, resource or action"
          />
        </label>
        {loading ? <p>Loading production permission catalogue…</p> : null}
        {error ? <p role="alert">{error}</p> : null}
        {unavailable.length > 0 && !loading ? (
          <p role="alert">
            Unavailable existing permissions: {unavailable.join(", ")}. Review the draft before saving.
          </p>
        ) : null}
        {groups.map(([module, definitions]) => {
          const count = definitions.filter((item) => selectedSet.has(item.key)).length;
          return (
            <details key={module} className={styles.permissionGroup} open={!!search}>
              <summary>
                <strong>{module.replaceAll("_", " ")}</strong>
                <span>
                  {count} / {definitions.length} selected
                </span>
              </summary>
              <label className={styles.groupSelection} aria-label={`Select visible permissions in ${module}`}>
                <SelectionCheckbox
                  label={`Select visible permissions in ${module}`}
                  checked={count === definitions.length}
                  mixed={count > 0 && count < definitions.length}
                  disabled={busy}
                  onChange={(checked) =>
                    toggle(
                      definitions.map((item) => item.key),
                      checked,
                    )
                  }
                />
                Select all {search ? "matching " : ""}permissions in {module}
              </label>
              <div className={styles.permissionItems}>
                {definitions.map((item) => (
                  <label key={item.key} aria-label={item.key}>
                    <input
                      type="checkbox"
                      checked={selectedSet.has(item.key)}
                      onChange={(event) => toggle([item.key], event.target.checked)}
                      aria-label={item.key}
                    />
                    <span>
                      <strong>{item.description}</strong>
                      <small>
                        {item.resource} · {item.key}
                      </small>
                    </span>
                  </label>
                ))}
              </div>
            </details>
          );
        })}
        {!loading && !error && groups.length === 0 ? <p>No permissions match your search.</p> : null}
      </fieldset>
      <footer>
        <button type="button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
        <button
          className={styles.primary}
          disabled={busy || loading || !!error || !name.trim() || selected.length === 0 || unavailable.length > 0}
        >
          Save draft
        </button>
      </footer>
    </form>
  );
}
