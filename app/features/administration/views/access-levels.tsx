"use client";

import { accessLevelDescriptions, administrationModuleCatalogue } from "@nexora/contracts";
import { Eye, PencilLine, ShieldCheck, UserCog } from "lucide-react";

import { AdminPage, AdminPanel } from "../components/admin-page";

const levelIcons = { view: Eye, user: PencilLine, admin: UserCog } as const;

/** Read-only explanation of View / User / Admin per module (plan §3). */
export function AccessLevelsView() {
  const live = administrationModuleCatalogue.filter((entry) => entry.live);
  const prototype = administrationModuleCatalogue.filter((entry) => !entry.live);

  return (
    <AdminPage
      title="Access Levels"
      description="Each user gets one level per module. Super Admins have full access and are the only people who can change access."
    >
      <div className="grid gap-3 md:grid-cols-3">
        {accessLevelDescriptions.map((level) => {
          const Icon = levelIcons[level.level];
          return (
            <article
              key={level.level}
              className="grid content-start gap-2 rounded-[var(--nx-radius-lg)] border border-border bg-card p-4"
            >
              <h2 className="m-0 flex items-center gap-2 text-base font-semibold text-foreground">
                <Icon className="size-4 text-primary" aria-hidden="true" />
                {level.label}
              </h2>
              <p className="m-0 text-sm text-muted-foreground">{level.description}</p>
            </article>
          );
        })}
      </div>

      <article className="flex items-start gap-3 rounded-[var(--nx-radius-lg)] border border-[var(--nx-brand-line)] bg-primary/5 p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden="true" />
        <div className="grid gap-1">
          <h2 className="m-0 text-base font-semibold text-foreground">Super Admin</h2>
          <p className="m-0 text-sm text-muted-foreground">
            Full control of every module, users, access and organisation settings. Changes apply immediately without a
            second approval and every change is audited. The organisation always keeps at least one active Super Admin.
          </p>
        </div>
      </article>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <AdminPanel title={`Server enforced (${live.length})`}>
          <p className="m-0 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
            The level controls both the menu and what the server allows.
          </p>
          <ModuleList labels={live.map((entry) => entry.label)} />
        </AdminPanel>
        <AdminPanel title={`Prototype modules (${prototype.length})`}>
          <p className="m-0 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
            Still mock screens. The level is recorded and will control the menu once access is stored on the server.
          </p>
          <ModuleList labels={prototype.map((entry) => entry.label)} columns />
        </AdminPanel>
      </div>
    </AdminPage>
  );
}

function ModuleList({ labels, columns = false }: { labels: string[]; columns?: boolean }) {
  return (
    <ul className={`m-0 grid list-none gap-x-4 p-0 px-4 py-2 ${columns ? "sm:grid-cols-2" : ""}`}>
      {labels.map((label) => (
        <li key={label} className="border-b border-border py-2 text-sm text-foreground last:border-b-0">
          {label}
        </li>
      ))}
    </ul>
  );
}
