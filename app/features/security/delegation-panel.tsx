"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Alert, AlertDescription } from "../../components/ui/alert";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { ApiError } from "../../lib/api/generated";
import { useSession } from "../../lib/session/session-provider";

type Row = Record<string, unknown>;

function localDateTime(days: number): string {
  const date = new Date(Date.now() + days * 86_400_000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "The delegation operation was rejected.";
}

function isDelegablePermission(permission: string): boolean {
  return (
    !permission.startsWith("security.delegation.") &&
    !permission.startsWith("security.impersonation.") &&
    !permission.startsWith("security.session_policy.") &&
    !/\.(approve|activate|administer|reset_password|revoke_sessions)$/.test(permission)
  );
}

export default function DelegationPanel({ permissions }: { permissions: ReadonlySet<string> }) {
  const { api, csrfToken, session } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [users, setUsers] = useState<Row[]>([]);
  const [companies, setCompanies] = useState<Array<{ id: string; name: string }>>([]);
  const [permissionOptions, setPermissionOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [delegateeId, setDelegateeId] = useState("");
  const [permissionKey, setPermissionKey] = useState("");
  const [scopeKind, setScopeKind] = useState<"tenant" | "company">("tenant");
  const [companyId, setCompanyId] = useState("");
  const [validFrom, setValidFrom] = useState(() => localDateTime(0));
  const [validUntil, setValidUntil] = useState(() => localDateTime(7));
  const [reason, setReason] = useState("");

  const actorId = session?.user.id ?? "";
  const isFullAdmin = permissions.has("security.authorization.administer");

  const load = useCallback(async () => {
    if (!permissions.has("security.delegation.read")) return;
    setLoading(true);
    setMessage("");
    try {
      const [delegations, userPage, options, catalogue] = await Promise.all([
        api.listSecurityDelegations("?limit=100"),
        api.listSecurityUsers("?status=active&archived=false&limit=100"),
        api.listSecurityUserOptions(),
        api.listSecurityPermissions(),
      ]);
      setRows(delegations.items);
      setUsers(userPage.items.filter((user) => user.id !== actorId));
      setCompanies(options.companies.map((company) => ({ id: company.id, name: company.name })));
      const safe = catalogue.items
        .map((item) => String(item.permission_key))
        .filter((permission) => isDelegablePermission(permission))
        .filter((permission) => isFullAdmin || permissions.has(permission));
      setPermissionOptions(safe);
      setDelegateeId((current) => current || String(userPage.items.find((user) => user.id !== actorId)?.id ?? ""));
      setPermissionKey((current) => current || safe[0] || "");
      setCompanyId((current) => current || options.companies[0]?.id || "");
    } catch (error) {
      setRows([]);
      setMessage(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [actorId, api, isFullAdmin, permissions]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!session || !delegateeId || !permissionKey || !reason.trim() || busy) return;
    if (scopeKind === "company" && !companyId) {
      setMessage("Select a company for company-scoped delegation.");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      await api.createSecurityDelegation(
        {
          delegatee_id: delegateeId,
          permission_key: permissionKey,
          scope_kind: scopeKind,
          scope_value: scopeKind === "tenant" ? session.tenant_id : companyId,
          valid_from: new Date(validFrom).toISOString(),
          valid_until: new Date(validUntil).toISOString(),
          reason: reason.trim(),
        },
        csrfToken(),
        `web-delegation-create-${crypto.randomUUID()}`,
      );
      setShowCreate(false);
      setReason("");
      await load();
      setMessage("Delegation draft created. Submit it for independent approval.");
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  async function transition(row: Row, action: "submit" | "approve" | "reject" | "activate" | "revoke") {
    setBusy(true);
    setMessage("");
    try {
      const delegationId = String(row.delegation_id);
      const expectedVersion = Number(row.row_version);
      const payload =
        action === "reject" || action === "revoke"
          ? {
              action,
              delegation_id: delegationId,
              expected_version: expectedVersion,
              reason: action === "reject" ? "Delegation request rejected" : "Delegation ended",
            }
          : { action, delegation_id: delegationId, expected_version: expectedVersion };
      await api.actOnSecurityDelegation(payload, csrfToken(), `web-delegation-${action}-${crypto.randomUUID()}`);
      await load();
      setMessage(`Delegation ${action} recorded and audited.`);
    } catch (error) {
      setMessage(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }

  const grouped = useMemo(
    () => ({
      pending: rows.filter((row) => ["draft", "submitted", "approved"].includes(String(row.effective_state))),
      effective: rows.filter((row) => ["active", "upcoming"].includes(String(row.effective_state))),
      historical: rows.filter((row) => ["rejected", "revoked", "expired"].includes(String(row.effective_state))),
    }),
    [rows],
  );

  if (!permissions.has("security.delegation.read")) {
    return <p className="p-9 text-center text-sm text-muted-foreground">You do not have permission to view delegations.</p>;
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <p className="text-sm text-muted-foreground">
          Delegated authority is time-bound, independently approved, and revalidated on every use.
        </p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" disabled={loading || busy} onClick={() => void load()}>
            Refresh
          </Button>
          {permissions.has("security.delegation.create") ? (
            <Button type="button" disabled={busy} onClick={() => setShowCreate((value) => !value)}>
              {showCreate ? "Close" : "Create delegation"}
            </Button>
          ) : null}
        </div>
      </div>
      {message ? (
        <Alert className="m-5" role="status"><AlertDescription>{message}</AlertDescription></Alert>
      ) : null}
      {showCreate ? (
        <form className="grid gap-4 border-b border-border bg-muted/40 p-5 md:grid-cols-2" onSubmit={create}>
          <Label className="grid gap-2 text-sm">
            Delegate to
            <select value={delegateeId} onChange={(event) => setDelegateeId(event.target.value)} required>
              <option value="">Select an active user</option>
              {users.map((user) => <option key={String(user.id)} value={String(user.id)}>{String(user.display_name)} · {String(user.email)}</option>)}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm">
            Permission
            <select value={permissionKey} onChange={(event) => setPermissionKey(event.target.value)} required>
              <option value="">Select bounded authority</option>
              {permissionOptions.map((permission) => <option key={permission} value={permission}>{permission}</option>)}
            </select>
          </Label>
          <Label className="grid gap-2 text-sm">
            Scope
            <select value={scopeKind} onChange={(event) => setScopeKind(event.target.value as "tenant" | "company")}>
              <option value="tenant">Entire tenant</option>
              <option value="company">One company</option>
            </select>
          </Label>
          {scopeKind === "company" ? (
            <Label className="grid gap-2 text-sm">
              Company
              <select value={companyId} onChange={(event) => setCompanyId(event.target.value)} required>
                {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </select>
            </Label>
          ) : null}
          <Label className="grid gap-2 text-sm">Valid from<Input type="datetime-local" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} required /></Label>
          <Label className="grid gap-2 text-sm">Valid until<Input type="datetime-local" value={validUntil} onChange={(event) => setValidUntil(event.target.value)} required /></Label>
          <Label className="grid gap-2 text-sm md:col-span-2">Business reason<Input value={reason} onChange={(event) => setReason(event.target.value)} required maxLength={512} /></Label>
          <div className="md:col-span-2"><Button type="submit" disabled={busy || permissionOptions.length === 0}>Create draft</Button></div>
        </form>
      ) : null}
      {loading ? <p className="p-9 text-center text-sm text-muted-foreground">Loading governed delegations…</p> : rows.length === 0 ? <p className="p-9 text-center text-sm text-muted-foreground">No delegation records are available.</p> : (
        <div className="grid gap-6 p-5">
          {Object.entries(grouped).map(([group, items]) => items.length ? (
            <section key={group} aria-labelledby={`delegation-${group}`}>
              <h3 id={`delegation-${group}`} className="mb-3 text-sm font-semibold capitalize">{group}</h3>
              <div className="grid gap-3">
                {items.map((row) => {
                  const state = String(row.effective_state);
                  const owns = row.delegator_id === actorId || isFullAdmin;
                  return (
                    <article key={String(row.delegation_id)} className="rounded-lg border border-border bg-card p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div><p className="font-medium">{String(row.permission_key)}</p><p className="mt-1 text-sm text-muted-foreground">{String(row.delegator_id)} → {String(row.delegatee_id)} · {String(row.scope_kind)}:{String(row.scope_value)}</p></div>
                        <Badge variant="outline">{state}</Badge>
                      </div>
                      <p className="mt-3 text-sm">{String(row.reason)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{new Date(String(row.valid_from)).toLocaleString()} — {new Date(String(row.valid_until)).toLocaleString()}</p>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {state === "draft" && owns && permissions.has("security.delegation.submit") ? <Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "submit")}>Submit</Button> : null}
                        {state === "submitted" && !owns && permissions.has("security.delegation.approve") ? <><Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "approve")}>Approve</Button><Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void transition(row, "reject")}>Reject</Button></> : null}
                        {state === "approved" && owns && permissions.has("security.delegation.activate") ? <Button type="button" size="sm" disabled={busy} onClick={() => void transition(row, "activate")}>Activate</Button> : null}
                        {(state === "active" || state === "upcoming") && owns && permissions.has("security.delegation.revoke") ? <Button type="button" size="sm" variant="destructive" disabled={busy} onClick={() => void transition(row, "revoke")}>Revoke</Button> : null}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ) : null)}
        </div>
      )}
      <Alert className="m-5 border-dashed"><AlertDescription>Impersonation remains disabled until its separately governed IA-05 session-control slice is verified.</AlertDescription></Alert>
    </div>
  );
}
