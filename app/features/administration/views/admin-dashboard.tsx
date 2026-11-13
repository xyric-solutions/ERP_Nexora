"use client";

import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";

import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel, AdminTable, EmptyRow, StatTile, UserStatusBadge } from "../components/admin-page";
import { dashboardSummary } from "../model/admin-workflow";

/** User counts and access levels per module. No charts and no job/integration metrics (plan Phase 5). */
export function AdminDashboardView({ onOpenUsers }: { onOpenUsers: () => void }) {
  const { state } = useAdministration();
  const summary = useMemo(() => (state ? dashboardSummary(state, new Date().toISOString()) : null), [state]);
  if (!summary) return null;

  const { users } = summary;
  const activeSuperAdmins = summary.super_admins.filter((user) => user.status === "active").length;
  const assigned = summary.modules.filter((entry) => entry.view + entry.user + entry.admin + entry.custom > 0);

  return (
    <AdminPage title="Dashboard" description="Who can sign in and what they can use." prototype>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Users" value={users.total} detail={`${users.active} active`} onClick={onOpenUsers} />
        <StatTile
          label="Pending first sign-in"
          value={users.pending_first_login}
          detail="Must change their password"
          tone="warning"
          onClick={onOpenUsers}
        />
        <StatTile
          label="Inactive or resigned"
          value={users.inactive + users.resigned}
          detail={users.locked ? `${users.locked} locked` : "None locked"}
          tone="muted"
          onClick={onOpenUsers}
        />
        <StatTile
          label="Super Admins"
          value={activeSuperAdmins}
          detail="Active, with full access"
          tone="success"
          onClick={onOpenUsers}
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(18rem,1fr)]">
        <AdminPanel title="Users by module and level">
          <AdminTable tableId="administration-dashboard-modules" label="Users by module and level">
            <thead>
              <tr>
                <th scope="col">Module</th>
                <th scope="col" className="w-14 px-2! text-right! sm:w-20 sm:px-4!">
                  View
                </th>
                <th scope="col" className="w-14 px-2! text-right! sm:w-20 sm:px-4!">
                  User
                </th>
                <th scope="col" className="w-14 px-2! text-right! sm:w-20 sm:px-4!">
                  Admin
                </th>
                <th scope="col" className="w-14 px-2! text-right! sm:w-20 sm:px-4!">
                  Custom
                </th>
              </tr>
            </thead>
            <tbody>
              {assigned.length === 0 ? (
                <EmptyRow colSpan={5}>
                  No module access assigned yet. Super Admins already have access to everything.
                </EmptyRow>
              ) : (
                assigned.map((entry) => (
                  <tr key={entry.module_id}>
                    <td className="pr-2! sm:pr-4!">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        {entry.label}
                        {!entry.live ? (
                          <Badge variant="outline" className="font-normal text-muted-foreground">
                            Prototype
                          </Badge>
                        ) : null}
                      </span>
                    </td>
                    {[entry.view, entry.user, entry.admin, entry.custom].map((count, index) => (
                      <td
                        key={index}
                        className={`px-2! text-right tabular-nums sm:px-4! ${count ? "" : "text-muted-foreground"}`}
                      >
                        {count}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </AdminTable>
          <p className="m-0 border-t border-border px-4 py-2.5 text-xs text-muted-foreground">
            Counts active users only. Super Admins are not included because they have every module.
          </p>
        </AdminPanel>

        <AdminPanel title="Super Admins">
          <ul className="m-0 list-none p-0">
            {summary.super_admins.map((user) => (
              <li
                key={user.id}
                className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="grid min-w-0">
                  <strong className="truncate text-sm font-semibold text-foreground">{user.display_name}</strong>
                  <small className="truncate text-xs text-muted-foreground">{user.email}</small>
                </span>
                <UserStatusBadge status={user.status} />
              </li>
            ))}
          </ul>
        </AdminPanel>
      </div>
    </AdminPage>
  );
}
