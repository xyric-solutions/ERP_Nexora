"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

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
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (!state) return null;
  const entries = state.audit.filter((entry) =>
    [
      entry.actorName,
      entry.targetName,
      actionLabels[entry.action] ?? entry.action,
      describeChange(entry.before, entry.after),
    ]
      .join(" ")
      .toLowerCase()
      .includes(search.trim().toLowerCase()),
  );
  const selected = state.audit.find((entry) => entry.id === selectedId);
  return (
    <AdminPage title="Activity Log" description="Who changed which user or setting, and when." prototype>
      <AdminPanel title={`${state.audit.length} ${state.audit.length === 1 ? "change" : "changes"}`}>
        <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3">
          <Input
            type="search"
            className="h-9 sm:max-w-md"
            aria-label="Search activity"
            placeholder="Search actor, action or record…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <span className="ml-auto text-xs text-muted-foreground">{entries.length} changes</span>
        </div>
        {entries.length === 0 ? (
          <p className="m-0 px-4 py-10 text-center text-sm text-muted-foreground">
            {search
              ? "No changes match this search."
              : "No changes recorded in this session yet. Creating or editing a user adds an entry here."}
          </p>
        ) : (
          <>
            {/* Phones and tablets: one entry per change. */}
            <ul className="m-0 list-none p-0 lg:hidden" aria-label="Activity log">
              {entries.map((entry) => (
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
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="w-fit"
                    onClick={() => setSelectedId(entry.id)}
                  >
                    View change
                  </Button>
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
                  {entries.map((entry) => (
                    <tr key={entry.id}>
                      <td className="text-xs whitespace-nowrap text-muted-foreground tabular-nums">
                        {new Date(entry.at).toLocaleString()}
                      </td>
                      <td className="whitespace-nowrap">{entry.actorName}</td>
                      <td className="font-medium whitespace-nowrap">{actionLabels[entry.action] ?? entry.action}</td>
                      <td>
                        <button
                          type="button"
                          className="border-0 bg-transparent p-0 text-left text-[13px] font-medium hover:underline"
                          onClick={() => setSelectedId(entry.id)}
                        >
                          {entry.targetName}
                        </button>
                      </td>
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
      <Dialog open={Boolean(selected)} onOpenChange={(open) => !open && setSelectedId(null)}>
        <DialogContent overlayClassName="z-[1400]" className="z-[1401] max-h-[85dvh] overflow-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Activity details</DialogTitle>
            <DialogDescription>
              {selected ? `${selected.actorName} · ${new Date(selected.at).toLocaleString()}` : ""}
            </DialogDescription>
          </DialogHeader>
          {selected ? (
            <>
              <p className="m-0 text-sm font-medium">
                {actionLabels[selected.action] ?? selected.action} · {selected.targetName}
              </p>
              <div className="overflow-x-auto rounded-[10px] border border-border">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr>
                      <th>Field</th>
                      <th>Before</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.keys(selected.after ?? {})
                      .filter(
                        (key) =>
                          !/password|credential|secret|token/i.test(key) &&
                          JSON.stringify(selected.before?.[key]) !== JSON.stringify(selected.after?.[key]),
                      )
                      .map((key) => (
                        <tr key={key}>
                          <td>{key.replaceAll("_", " ")}</td>
                          <td className="max-w-56 break-words">{JSON.stringify(selected.before?.[key]) ?? "—"}</td>
                          <td className="max-w-56 break-words">{JSON.stringify(selected.after?.[key]) ?? "—"}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </AdminPage>
  );
}
