"use client";

import { useAdministration } from "../api/use-administration";
import { AdminPage, AdminPanel, AdminTable } from "../components/admin-page";

const actionLabels: Record<string, string> = {
  "user.create": "Created user",
  "user.update": "Changed user",
  "user.reset_password": "Reset password",
  "user.deactivate": "Deactivated",
  "user.reactivate": "Reactivated",
  "user.mark_resigned": "Marked resigned",
  "tenant.update": "Changed organisation profile",
};

function describeChange(before: Record<string, unknown> | null, after: Record<string, unknown> | null): string {
  if (!after) return "";
  if (!before) return "New record";
  return Object.keys(after)
    .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map((key) => key.replaceAll("_", " "))
    .join(", ");
}

/** Read-only list of access and account changes (plan assumption 7). */
export function AdminActivityLogView() {
  const { state } = useAdministration();
  if (!state) return null;
  return (
    <AdminPage title="Activity Log" description="Who changed which user or setting, and when." prototype>
      <AdminPanel title={`${state.audit.length} ${state.audit.length === 1 ? "change" : "changes"}`}>
        {state.audit.length === 0 ? (
          <p className="m-0 px-4 py-10 text-center text-sm text-muted-foreground">
            No changes recorded in this session yet. Creating or editing a user adds an entry here.
          </p>
        ) : (
          <>
            {/* Phones and tablets: one entry per change. */}
            <ul className="m-0 list-none p-0 lg:hidden" aria-label="Activity log">
              {state.audit.map((entry) => (
                <li key={entry.id} className="grid gap-1 border-b border-border px-4 py-3 last:border-b-0">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <strong className="text-sm font-semibold text-foreground">
                      {actionLabels[entry.action] ?? entry.action} · {entry.targetName}
                    </strong>
                    <time className="text-xs text-muted-foreground tabular-nums" dateTime={entry.at}>
                      {new Date(entry.at).toLocaleString()}
                    </time>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    By {entry.actorName}
                    {describeChange(entry.before, entry.after) ? ` · ${describeChange(entry.before, entry.after)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {/* Desktop: table. */}
            <div className="hidden lg:block">
              <AdminTable tableId="administration-activity" label="Activity log">
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">By</th>
                    <th scope="col">Action</th>
                    <th scope="col">Target</th>
                    <th scope="col">Changed</th>
                  </tr>
                </thead>
                <tbody>
                  {state.audit.map((entry) => (
                    <tr key={entry.id}>
                      <td className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {new Date(entry.at).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap">{entry.actorName}</td>
                      <td className="font-medium whitespace-nowrap">{actionLabels[entry.action] ?? entry.action}</td>
                      <td>{entry.targetName}</td>
                      <td className="text-sm text-muted-foreground">
                        {describeChange(entry.before, entry.after) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </AdminTable>
            </div>
          </>
        )}
      </AdminPanel>
    </AdminPage>
  );
}
