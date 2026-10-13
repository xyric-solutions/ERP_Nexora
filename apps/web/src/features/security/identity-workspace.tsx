"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { SecurityPage } from "@nexora/contracts";

import { useSession } from "../../lib/session/session-provider";
import UserManagementPanel from "./users/user-management-panel";
import RoleForm from "./role-form";
import GovernedTable from "./governed-table";
import { identityHref, identityLocation, type IdentityLocation, type IdentitySection } from "./identity-navigation";
import styles from "./identity-workspace.module.css";

const labels = {
  roles: "Roles",
  assignments: "Assignments",
  approvals: "Approvals",
  permissions: "Permissions",
  audit: "Audit",
  users: "Users",
};

export default function IdentityWorkspace() {
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
  if (loading || !session) return <main className={styles.loading}>Verifying secure session…</main>;

  return (
    <main className={styles.shell}>
      <aside className={styles.rail}>
        <div className={styles.logo}>N</div>
        <nav aria-label="Administration">
          <Link href="/">Overview</Link>
          <Link className={styles.active} href="/admin/identity">
            Identity &amp; Access
          </Link>
        </nav>
      </aside>
      <section className={styles.workspace}>
        <header className={styles.topbar}>
          <div>
            <p>Administration / Security</p>
            <h1>Identity &amp; Access</h1>
          </div>
          <div className={styles.user}>
            <span>
              {session.user.email}
              <small>{session.tenant_id}</small>
            </span>
            <button onClick={() => void logout().then(() => router.replace("/login"))}>Sign out</button>
          </div>
        </header>
        <div className={styles.summary}>
          <article>
            <span>Authorization source</span>
            <strong>PostgreSQL normalized grants</strong>
          </article>
          <article>
            <span>Session</span>
            <strong>Server-side · active</strong>
          </article>
          <article>
            <span>Access</span>
            <strong>
              {session.user.roles.length} role{session.user.roles.length === 1 ? "" : "s"}
            </strong>
          </article>
        </div>
        <nav className={styles.tabs} aria-label="Identity and Access sections">
          {(["users", "roles"] as const).map((item) => (
            <button
              key={item}
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
            </button>
          ))}
        </nav>
        <section className={styles.panel}>
          <nav
            className={styles.subsections}
            aria-label={`${workspace === "users" ? "Users" : "Roles"} Management sections`}
          >
            {sections.map((item) => (
              <button
                key={item}
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
              </button>
            ))}
          </nav>
          <header>
            <div>
              <p>{labels[tab]}</p>
              <h2>
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
            <div className={styles.actions}>
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
                <button className={styles.primary} onClick={() => setShowCreate((value) => !value)}>
                  {showCreate ? "Close" : "Create role"}
                </button>
              ) : null}
              {tab !== "users" ? <button onClick={() => void load()}>Refresh</button> : null}
            </div>
          </header>
          {section !== "records" && (userId || rolePolicyId) ? (
            <div className={styles.contextBar}>
              <span>
                Showing records for {userId ? "user" : "role"}: <strong>{userId ?? rolePolicyId}</strong>
              </span>
              <button onClick={() => choose({ ...location, userId: null, rolePolicyId: null })}>
                Show all {workspace}
              </button>
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
            <section className={styles.credential} role="alert" aria-labelledby="credential-title">
              <div>
                <strong id="credential-title">One-time password</strong>
                <p>Copy it now. Nexora will not show this credential again.</p>
                <code>{credentialDelivery}</code>
              </div>
              <button onClick={() => setCredentialDelivery(null)}>Close permanently</button>
            </section>
          ) : null}
          {message ? (
            <p className={styles.notice} role="status">
              {message}
            </p>
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
            <p className={styles.state}>Loading governed data…</p>
          ) : data.items.length === 0 ? (
            <p className={styles.state}>No records are available for this view.</p>
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
            <div className={styles.contextBar} aria-label="Record pagination">
              <span>Page {Math.floor(Number(cursor) / 50) + 1}</span>
              <button
                disabled={cursor === "0"}
                onClick={() => choose(location, String(Math.max(0, Number(cursor) - 50)))}
              >
                Previous
              </button>
              <button disabled={!data.next_cursor} onClick={() => choose(location, data.next_cursor ?? undefined)}>
                Next
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}
