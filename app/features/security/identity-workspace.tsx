"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { SecurityPage } from "@nexora/contracts";
import { Alert, AlertDescription, AlertTitle } from "../../components/ui/alert";
import { Button } from "../../components/ui/button";
import { Card, CardContent } from "../../components/ui/card";
import { ShieldCheck, UsersRound } from "lucide-react";

import { useSession } from "../../lib/session/session-provider";
import UserManagementPanel from "./users/user-management-panel";
import RoleForm from "./role-form";
import GovernedTable from "./governed-table";
import { identityHref, identityLocation, type IdentityLocation, type IdentitySection } from "./identity-navigation";

const labels = {
  roles: "Roles",
  assignments: "Assignments",
  approvals: "Approvals",
  permissions: "Permissions",
  audit: "Audit",
  users: "Users",
};

export default function IdentityWorkspace({ embedded = false }: { embedded?: boolean }) {
  const router = useRouter();
  const search = useSearchParams();
  const { api, session, loading, logout, csrfToken } = useSession();
  const location = useMemo(() => identityLocation(search), [search]);
  const { tab: workspace, section, approvalType, userId, rolePolicyId } = location;
  const tab = section === "records" ? workspace : section;
  const sections: IdentitySection[] =
    workspace === "users"
      ? ["records", "assignments", "approvals", "audit"]
      : ["records", "permissions", "assignments", "approvals", "audit"];
  const requestedCursor = Number(search.get("cursor") ?? "0");
  const cursor = String(Number.isSafeInteger(requestedCursor) && requestedCursor >= 0 ? requestedCursor : 0);
  const viewKey = `${workspace}:${tab}:${approvalType}:${userId}:${rolePolicyId}:${cursor}`;
  const [data, setData] = useState<SecurityPage>({ items: [], next_cursor: null });
  const [loadedView, setLoadedView] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [credentialDelivery, setCredentialDelivery] = useState<string | null>(null);
  const permissions = useMemo(() => new Set(session?.user.permissions ?? []), [session]);

  const fetchPage = useCallback(() => {
    if (!session) return Promise.resolve<SecurityPage>({ items: [], next_cursor: null });
    const query = new URLSearchParams({ cursor });
    if (userId) query.set("user_id", userId);
    if (rolePolicyId) query.set("role_policy_id", rolePolicyId);
    const suffix = `?${query}`;
    return tab === "roles"
      ? api.listSecurityRoles(`?cursor=${encodeURIComponent(cursor)}`)
      : tab === "assignments"
        ? api.listSecurityAssignments(suffix)
        : tab === "approvals"
          ? api.listSecurityApprovals(`${suffix}&resource_type=${approvalType}`)
          : tab === "permissions"
            ? api.listSecurityPermissions()
            : tab === "audit"
              ? api.listSecurityAudit(`${suffix}&workspace=${workspace}`)
              : Promise.resolve({ items: [], next_cursor: null });
  }, [api, approvalType, cursor, rolePolicyId, session, tab, userId, workspace]);

  const load = useCallback(async () => {
    setBusy(true);
    setMessage("");
    setCredentialDelivery(null);
    try {
      setData(await fetchPage());
      setLoadedView(viewKey);
    } catch {
      setMessage("This view is unavailable or your account is not authorized.");
      setData({ items: [], next_cursor: null });
      setLoadedView(viewKey);
    } finally {
      setBusy(false);
    }
  }, [fetchPage, viewKey]);

  useEffect(() => {
    if (!loading && !session) router.replace("/login");
  }, [loading, router, session]);
  useEffect(() => {
    let active = true;
    fetchPage()
      .then((page) => {
        if (active) {
          setData(page);
          setLoadedView(viewKey);
          setMessage("");
          setCredentialDelivery(null);
          setShowCreate(false);
        }
      })
      .catch(() => {
        if (active) {
          setMessage("This view is unavailable or your account is not authorized.");
          setData({ items: [], next_cursor: null });
          setLoadedView(viewKey);
        }
      });
    return () => {
      active = false;
    };
  }, [fetchPage, viewKey]);
  function choose(next: IdentityLocation, nextCursor?: string) {
    setCredentialDelivery(null);
    setShowCreate(false);
    setMessage("");
    setData({ items: [], next_cursor: null });
    window.history.pushState(
      null,
      "",
      identityHref(next) + (nextCursor ? `&cursor=${encodeURIComponent(nextCursor)}` : ""),
    );
  }
  async function run<T>(operation: () => Promise<T>, success: string): Promise<T | undefined> {
    setBusy(true);
    setMessage("");
    try {
      const result = await operation();
      await load();
      setMessage(success);
      return result;
    } catch {
      setMessage(
        "The operation was rejected. Review permissions, state, separation-of-duties and version requirements.",
      );
    } finally {
      setBusy(false);
    }
    return undefined;
  }
  if (loading || !session)
    return (
      <main
        className={
          embedded
            ? "grid min-h-65 place-items-center text-sm text-muted-foreground"
            : "grid min-h-screen place-items-center bg-background text-sm text-muted-foreground"
        }
      >
        Verifying secure session…
      </main>
    );

  return (
    <main className={embedded ? "min-w-0" : "grid min-h-screen grid-cols-[220px_minmax(0,1fr)] bg-background text-foreground"}>
      {!embedded ? (
        <aside className="bg-[var(--nx-sidebar)] px-4 py-6 text-[var(--nx-sidebar-muted)]">
          <div className="mb-8 ml-2 grid size-10 place-items-center rounded-lg bg-card text-xl font-extrabold text-primary">N</div>
          <nav className="grid gap-1" aria-label="Administration">
            <Link className="rounded-lg px-3 py-2.5 text-sm hover:bg-[var(--nx-sidebar-hover)]" href="/">
              Overview
            </Link>
            <Link
              className="rounded-lg bg-[var(--nx-sidebar-hover)] px-3 py-2.5 text-sm text-[var(--nx-sidebar-text)]"
              href="/admin/identity"
            >
              Identity &amp; Access
            </Link>
          </nav>
        </aside>
      ) : null}
      <section className="min-w-0">
        <header className={embedded ? "flex items-center justify-between gap-5 border-b border-border pb-4" : "flex items-center justify-between gap-5 border-b border-border bg-card px-8 py-6"}>
          <div>
            <p className="mb-1 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">Administration / Security</p>
            <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">Identity &amp; Access</h1>
          </div>
          {!embedded ? (
            <div className="flex items-center gap-4">
              <span className="grid text-right text-sm font-medium">
              {session.user.email}
                <small className="mt-0.5 text-xs font-normal text-muted-foreground">{session.tenant_id}</small>
              </span>
              <Button variant="outline" onClick={() => void logout().then(() => router.replace("/login"))}>
                Sign out
              </Button>
            </div>
          ) : null}
        </header>
        <div className={embedded ? "grid gap-4 py-5 sm:grid-cols-3" : "grid gap-4 px-8 py-6 sm:grid-cols-3"}>
          <Card className="border border-border shadow-none">
            <CardContent className="grid gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Authorization source</span>
              <strong className="text-base text-foreground">PostgreSQL normalized grants</strong>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none">
            <CardContent className="grid gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Session</span>
              <strong className="inline-flex items-center gap-2 text-base text-foreground"><ShieldCheck className="size-4 text-primary" />Server-side · active</strong>
            </CardContent>
          </Card>
          <Card className="border border-border shadow-none">
            <CardContent className="grid gap-2 pt-1">
              <span className="text-xs text-muted-foreground">Access</span>
              <strong className="inline-flex items-center gap-2 text-base text-foreground"><UsersRound className="size-4 text-primary" />{session.user.roles.length} role{session.user.roles.length === 1 ? "" : "s"}</strong>
            </CardContent>
          </Card>
        </div>
        <nav className={embedded ? "flex border-b border-border" : "flex border-b border-border px-8"} aria-label="Identity and Access sections">
          {(["users", "roles"] as const).map((item) => (
            <Button
              key={item}
              variant="ghost"
              className={`h-11 rounded-none border-x-0 border-t-0 border-b-3 px-4 ${workspace === item ? "border-primary text-primary hover:bg-transparent hover:text-primary" : "border-transparent text-muted-foreground hover:bg-muted"}`}
              aria-current={workspace === item ? "page" : undefined}
              onClick={() =>
                choose({
                  tab: item,
                  section: "records",
                  approvalType: item === "users" ? "user" : "role",
                  userId: null,
                  rolePolicyId: null,
                })
              }
            >
              {item === "users" ? "Users Management" : "Roles Management"}
            </Button>
          ))}
        </nav>
        <section className={embedded ? "mt-6 overflow-hidden rounded-xl border border-border bg-card" : "m-8 overflow-hidden rounded-xl border border-border bg-card"}>
          <nav
            className="flex flex-wrap gap-2 border-b border-border bg-muted/60 p-4"
            aria-label={`${workspace === "users" ? "Users" : "Roles"} Management sections`}
          >
            {sections.map((item) => (
              <Button
                key={item}
                variant={section === item ? "default" : "outline"}
                size="sm"
                aria-current={section === item ? "page" : undefined}
                onClick={() => choose({ ...location, section: item })}
              >
                {item === "records"
                  ? workspace === "users"
                    ? "Users"
                    : "Roles"
                  : item === "assignments"
                    ? workspace === "users"
                      ? "Assigned roles"
                      : "Assigned users"
                    : item === "audit"
                      ? "Audit history"
                      : labels[item]}
              </Button>
            ))}
          </nav>
          <header className="flex flex-wrap items-center justify-between gap-4 border-b border-border px-5 py-5">
            <div>
              <p className="mb-1 text-xs font-semibold tracking-[0.12em] text-muted-foreground uppercase">{labels[tab]}</p>
              <h2 className="text-xl font-semibold text-foreground">
                {tab === "roles"
                  ? "Governed role policies"
                  : tab === "assignments"
                    ? "User role assignments"
                    : tab === "approvals"
                      ? "Maker-checker queue"
                      : tab === "permissions"
                        ? "Exact permission catalogue"
                        : tab === "audit"
                          ? "Immutable authorization evidence"
                          : "Governed user accounts"}
              </h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {tab === "approvals" ? (
                <select
                  aria-label="Approval resource type"
                  value={approvalType}
                  onChange={(event) =>
                    choose({
                      ...location,
                      approvalType:
                        event.target.value === "assignment" ? "assignment" : workspace === "users" ? "user" : "role",
                    })
                  }
                >
                  {workspace === "roles" ? (
                    <option value="role">Role approvals</option>
                  ) : (
                    <option value="user">User approvals</option>
                  )}
                  <option value="assignment">Assignment approvals</option>
                </select>
              ) : null}
              {tab === "roles" && permissions.has("security.authorization.role.create") ? (
                <Button onClick={() => setShowCreate((value) => !value)}>
                  {showCreate ? "Close" : "Create role"}
                </Button>
              ) : null}
              {tab !== "users" ? <Button variant="outline" onClick={() => void load()}>Refresh</Button> : null}
            </div>
          </header>
          {section !== "records" && (userId || rolePolicyId) ? (
            <div className="flex flex-wrap items-center gap-3 border-b border-border px-5 py-3 text-sm">
              <span>
                Showing records for {userId ? "user" : "role"}: <strong>{userId ?? rolePolicyId}</strong>
              </span>
              <Button variant="outline" size="sm" onClick={() => choose({ ...location, userId: null, rolePolicyId: null })}>
                Show all {workspace}
              </Button>
            </div>
          ) : null}
          {showCreate && tab === "roles" ? (
            <RoleForm
              busy={busy}
              onCancel={() => setShowCreate(false)}
              onSave={async (payload, key) => {
                const result = await run(
                  () => api.createSecurityRole(payload, csrfToken(), key),
                  "Role draft created and audited.",
                );
                return !!result;
              }}
            />
          ) : null}
          {credentialDelivery && tab === "approvals" && loadedView === viewKey ? (
            <Alert className="m-5 border-[var(--nx-warning-border)] bg-[var(--nx-warning-soft)] text-[var(--nx-warning)]" aria-labelledby="credential-title">
              <div>
                <AlertTitle id="credential-title">One-time password</AlertTitle>
                <p>Copy it now. Nexora will not show this credential again.</p>
                <code className="mt-2 inline-block rounded bg-card px-2 py-1.5 text-sm text-foreground select-all">{credentialDelivery}</code>
              </div>
              <Button className="justify-self-start" variant="outline" size="sm" onClick={() => setCredentialDelivery(null)}>Close permanently</Button>
            </Alert>
          ) : null}
          {message ? (
            <Alert className="m-5 border-[var(--nx-info-border)] bg-[var(--nx-info-soft)] text-[var(--nx-info)]" role="status">
              <AlertDescription className="text-[var(--nx-info)]">{message}</AlertDescription>
            </Alert>
          ) : null}
          {tab === "users" ? (
            <UserManagementPanel
              permissions={permissions}
              onOpenSection={(nextSection, targetUserId) =>
                choose({
                  ...location,
                  section: nextSection,
                  userId: targetUserId,
                  approvalType:
                    nextSection === "approvals" && !permissions.has("security.user_account.approve")
                      ? "assignment"
                      : "user",
                })
              }
            />
          ) : busy || loadedView !== viewKey ? (
            <p className="p-9 text-center text-sm text-muted-foreground">Loading governed data…</p>
          ) : data.items.length === 0 ? (
            <p className="p-9 text-center text-sm text-muted-foreground">No records are available for this view.</p>
          ) : (
            <GovernedTable
              key={`${tab}:${approvalType}:${userId}:${rolePolicyId}:${cursor}`}
              tab={tab}
              rows={data.items}
              permissions={permissions}
              approvalType={approvalType}
              onChanged={async () => setData(await fetchPage())}
              onCredential={setCredentialDelivery}
              onOpenRoleSection={(nextSection, policyId) =>
                choose({
                  ...location,
                  section: nextSection,
                  rolePolicyId: policyId,
                  approvalType:
                    nextSection === "approvals" && !permissions.has("security.authorization.role.approve")
                      ? "assignment"
                      : "role",
                })
              }
            />
          )}
          {tab !== "users" && tab !== "permissions" && !busy && loadedView === viewKey ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3 text-sm" aria-label="Record pagination">
              <span>Page {Math.floor(Number(cursor) / 50) + 1}</span>
              <Button
                variant="outline"
                size="sm"
                disabled={cursor === "0"}
                onClick={() => choose(location, String(Math.max(0, Number(cursor) - 50)))}
              >
                Previous
              </Button>
              <Button variant="outline" size="sm" disabled={!data.next_cursor} onClick={() => choose(location, data.next_cursor ?? undefined)}>
                Next
              </Button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
