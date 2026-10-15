"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { createSecurityRoleRequestSchema, type CreateSecurityRoleRequest } from "@nexora/contracts";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Checkbox } from "../../components/ui/checkbox";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { useSession } from "../../lib/session/session-provider";
import { SelectionCheckbox } from "./administration-controls";

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
      className="border-b border-border bg-muted/50 px-5 py-6"
      onSubmit={(event) => void submit(event)}
      aria-label={initial ? "Edit role draft" : "Create role"}
    >
      <header>
        <h3 className="text-xl font-semibold text-foreground">{initial ? "Edit draft permissions" : "Add role"}</h3>
        <p className="mt-1 text-sm text-muted-foreground">Save a draft, then submit it for independent approval.</p>
      </header>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <Label className="grid gap-2 text-sm text-muted-foreground">
          Role name
          <Input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={128}
            required
            readOnly={!!initial}
            disabled={busy}
          />
        </Label>
        <Label className="grid gap-2 text-sm text-muted-foreground">
          Role code
          <Input className="bg-muted text-muted-foreground" value={initial?.role_code ?? generatedCode} readOnly aria-describedby="role-code-help" />
        </Label>
        <Label className="grid gap-2 text-sm text-muted-foreground">
          Description
          <Input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={512}
            readOnly={!!initial}
            disabled={busy}
          />
        </Label>
      </div>
      <p id="role-code-help" className="mt-3 text-xs text-muted-foreground">
        Role code is generated automatically and remains unchanged.{" "}
        {initial ? "Existing scope, field and SoD restrictions are preserved." : ""}
      </p>
      <fieldset className="mt-5 rounded-lg border border-border bg-card p-4" disabled={busy || loading || !!error}>
        <legend className="px-2 font-semibold text-foreground">
          Select Permissions <span className="ml-2 text-xs font-normal text-muted-foreground">{selected.length} selected</span>
        </legend>
        <Label className="grid gap-2 text-sm text-muted-foreground">
          Search permissions
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search module, resource or action"
          />
        </Label>
        {loading ? <p className="mt-4 text-sm text-muted-foreground">Loading production permission catalogue…</p> : null}
        {error ? <Alert className="mt-4" variant="destructive"><AlertDescription>{error}</AlertDescription></Alert> : null}
        {unavailable.length > 0 && !loading ? (
          <Alert className="mt-4" variant="destructive"><AlertDescription>Unavailable existing permissions: {unavailable.join(", ")}. Review the draft before saving.</AlertDescription></Alert>
        ) : null}
        {groups.map(([module, definitions]) => {
          const count = definitions.filter((item) => selectedSet.has(item.key)).length;
          return (
            <details key={module} className="border-t border-border" open={!!search}>
              <summary className="cursor-pointer px-2 py-3.5 text-sm text-primary focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-ring">
                <strong>{module.replaceAll("_", " ")}</strong>
                <span className="float-right text-xs text-muted-foreground">
                  {count} / {definitions.length} selected
                </span>
              </summary>
              <label className="flex items-start gap-2.5 bg-muted/70 px-4 py-2.5 text-sm text-muted-foreground" aria-label={`Select visible permissions in ${module}`}>
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
              <div className="grid pb-3 md:grid-cols-2">
                {definitions.map((item) => (
                  <label className="flex items-start gap-2.5 px-4 py-2.5 text-sm" key={item.key} aria-label={item.key}>
                    <Checkbox
                      checked={selectedSet.has(item.key)}
                      onCheckedChange={(checked) => toggle([item.key], checked === true)}
                      aria-label={item.key}
                    />
                    <span>
                      <strong>{item.description}</strong>
                      <small className="mt-1 block text-xs text-muted-foreground">
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
      <footer className="mt-5 flex gap-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button
          disabled={busy || loading || !!error || !name.trim() || selected.length === 0 || unavailable.length > 0}
        >
          Save draft
        </Button>
      </footer>
    </form>
  );
}
