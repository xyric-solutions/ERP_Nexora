"use client";

import { administrationModuleCatalogue, adminUserStatusSchema, type AdminUser } from "@nexora/contracts";
import { Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { workSelectClass } from "@/shared/ui/work-table";

import type { CredentialResult } from "../api/administration-client";
import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel, AdminTable, EmptyRow, UserStatusBadge } from "../components/admin-page";
import { CredentialResultDialog, type CredentialNotice } from "../components/credential-result-dialog";
import { UserSheet } from "../components/user-sheet";

const levelLabels: Record<string, string> = { view: "View", user: "User", admin: "Admin", custom: "Custom" };

function accessEntries(user: AdminUser) {
  return administrationModuleCatalogue
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      level: (user.access as Record<string, string | undefined>)[entry.id],
    }))
    .filter((entry) => entry.level && entry.level !== "none");
}

/** Access as compact chips: "HR & Payroll · Admin". Super Admins get one chip. */
function AccessChips({ user }: { user: AdminUser }) {
  if (user.super_admin)
    return (
      <span className="inline-flex w-fit items-center gap-1 rounded-full border border-[var(--nx-brand-line)] bg-primary/10 px-2 py-0.5 text-xs font-medium text-foreground">
        <ShieldCheck className="size-3.5 text-primary" aria-hidden="true" />
        Super Admin · all modules
      </span>
    );
  const entries = accessEntries(user);
  if (!entries.length) return <span className="text-xs text-muted-foreground">No modules assigned</span>;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0" aria-label="Module access">
      {entries.map((entry) => (
        <li
          key={entry.id}
          className="inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs whitespace-nowrap text-foreground"
        >
          {entry.label}
          <span className="ml-1 font-semibold">· {levelLabels[entry.level!] ?? entry.level}</span>
        </li>
      ))}
    </ul>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label className="grid min-w-0 gap-1 text-xs font-medium text-muted-foreground">
      {label}
      <select className={`${workSelectClass} w-full`} value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
    </label>
  );
}

export function AdminUsersView({ recordRef }: { recordRef?: string }) {
  const { client, state, session, superAdmin } = useAdministration();
  const feedback = useActionFeedback();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [moduleId, setModuleId] = useState("");
  const [level, setLevel] = useState("");
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [sheetOpen, setSheetOpen] = useState(recordRef === "new" && superAdmin);
  const [notice, setNotice] = useState<CredentialNotice | null>(null);

  useEffect(() => {
    void client?.companies().catch(() => undefined);
  }, [client]);

  const users = useMemo(() => {
    const query = search.trim().toLowerCase();
    const levelOf = (user: AdminUser, id: string) =>
      user.super_admin ? "admin" : ((user.access as Record<string, string | undefined>)[id] ?? "none");
    const levelMatches = (user: AdminUser) => {
      if (!level) return true;
      if (level === "super_admin") return user.super_admin;
      if (moduleId) return levelOf(user, moduleId) === level;
      return !user.super_admin && Object.values(user.access).some((value) => value === level);
    };
    return (state?.users ?? []).filter(
      (user) =>
        (!query ||
          [user.display_name, user.email, user.username, user.id].some((value) =>
            value.toLowerCase().includes(query),
          )) &&
        (!status || user.status === status) &&
        (!moduleId || levelOf(user, moduleId) !== "none") &&
        levelMatches(user),
    );
  }, [level, moduleId, search, state?.users, status]);

  if (!client || !state || !session) return null;

  const filtered = Boolean(search || status || moduleId || level);
  const total = state.users.length;

  function clearFilters() {
    setSearch("");
    setStatus("");
    setModuleId("");
    setLevel("");
  }

  function openUser(user: AdminUser | null) {
    setEditing(user);
    setSheetOpen(true);
  }

  function showCredential(result: CredentialResult, title: string) {
    if (!result.oneTimePassword) return;
    setNotice({
      title,
      userName: result.user.display_name,
      email: result.user.email,
      password: result.oneTimePassword,
      emailStatus: result.emailStatus,
    });
  }

  const editButton = (user: AdminUser) => (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={!superAdmin}
      aria-label={`Edit ${user.display_name}`}
      onClick={() => openUser(user)}
    >
      <Pencil aria-hidden="true" />
      Edit
    </Button>
  );

  return (
    <AdminPage
      title="Users"
      description="Create logins, choose which modules each person can use, and manage their accounts. Only Super Admins can change access."
      prototype
      actions={
        superAdmin ? (
          <Button type="button" onClick={() => openUser(null)}>
            <Plus aria-hidden="true" />
            Create user
          </Button>
        ) : null
      }
    >
      <AdminPanel>
        <div className="grid gap-3 border-b border-border bg-muted/30 p-3 sm:p-4 lg:grid-cols-[minmax(14rem,1fr)_repeat(3,minmax(9rem,11rem))_auto] lg:items-end">
          <div className="grid min-w-0 gap-1">
            <label htmlFor="administration-user-search" className="text-xs font-medium text-muted-foreground">
              Search
            </label>
            <span className="relative">
              <Search
                className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <Input
                id="administration-user-search"
                type="search"
                className="h-9 bg-card pl-8"
                placeholder="Name, email or username"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:contents">
            <FilterSelect label="Status" value={status} onChange={setStatus}>
              <option value="">All statuses</option>
              {adminUserStatusSchema.options.map((option) => (
                <option key={option} value={option}>
                  {option[0]!.toUpperCase() + option.slice(1)}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Module" value={moduleId} onChange={setModuleId}>
              <option value="">All modules</option>
              {administrationModuleCatalogue.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.label}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect label="Level" value={level} onChange={setLevel}>
              <option value="">All levels</option>
              <option value="super_admin">Super Admin</option>
              <option value="view">View</option>
              <option value="user">User</option>
              <option value="admin">Admin</option>
              <option value="custom">Custom</option>
            </FilterSelect>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-9 justify-self-start"
            disabled={!filtered}
            onClick={clearFilters}
          >
            <X aria-hidden="true" />
            Clear
          </Button>
        </div>

        <p className="m-0 px-4 py-2 text-xs text-muted-foreground" aria-live="polite">
          {filtered ? `${users.length} of ${total} users` : `${total} users`}
        </p>

        {/* Phones and tablets: one card per user. */}
        <ul className="m-0 grid list-none gap-0 border-t border-border p-0 lg:hidden" aria-label="Users">
          {users.length === 0 ? (
            <li className="px-4 py-10 text-center text-sm text-muted-foreground">No users match these filters.</li>
          ) : (
            users.map((user) => (
              <li key={user.id} className="grid gap-2.5 border-b border-border px-4 py-3 last:border-b-0">
                <div className="flex items-start justify-between gap-3">
                  <span className="grid min-w-0">
                    <strong className="truncate text-sm font-semibold text-foreground">{user.display_name}</strong>
                    <small className="truncate text-xs text-muted-foreground">{user.email}</small>
                  </span>
                  {editButton(user)}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <UserStatusBadge status={user.status} />
                  {user.must_change_password && user.status === "active" ? (
                    <span className="text-xs text-muted-foreground">First sign-in pending</span>
                  ) : null}
                </div>
                <AccessChips user={user} />
                <small className="text-xs text-muted-foreground">
                  {user.companies.map((company) => company.company_name).join(", ")}
                </small>
              </li>
            ))
          )}
        </ul>

        {/* Desktop: table. */}
        <div className="hidden border-t border-border lg:block">
          <AdminTable tableId="administration-users" label="Users" minWidth="44rem">
            <thead>
              <tr>
                <th scope="col">User</th>
                <th scope="col">Status</th>
                <th scope="col">Access</th>
                <th scope="col">Companies</th>
                <th scope="col" className="text-right!">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <EmptyRow colSpan={5}>No users match these filters.</EmptyRow>
              ) : (
                users.map((user) => (
                  <tr key={user.id}>
                    <td className="max-w-[16rem]">
                      <span className="grid min-w-0">
                        <strong className="truncate font-semibold text-foreground">{user.display_name}</strong>
                        <small className="truncate text-xs text-muted-foreground">{user.email}</small>
                        <small className="font-mono text-[11px] text-muted-foreground">{user.id}</small>
                      </span>
                    </td>
                    <td>
                      <span className="grid justify-items-start gap-1">
                        <UserStatusBadge status={user.status} />
                        {user.must_change_password && user.status === "active" ? (
                          <small className="text-xs whitespace-nowrap text-muted-foreground">
                            First sign-in pending
                          </small>
                        ) : null}
                      </span>
                    </td>
                    <td className="min-w-[14rem]">
                      <AccessChips user={user} />
                    </td>
                    <td className="text-sm">{user.companies.map((company) => company.company_name).join(", ")}</td>
                    <td className="text-right">{editButton(user)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </AdminTable>
        </div>
      </AdminPanel>

      <UserSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        user={editing ? (state.users.find((user) => user.id === editing.id) ?? null) : null}
        users={state.users}
        companies={state.companies}
        actorId={session.user.id}
        client={client}
        onCredential={showCredential}
        onSaved={(message) => feedback(message)}
      />
      <CredentialResultDialog notice={notice} onClose={() => setNotice(null)} />
    </AdminPage>
  );
}
