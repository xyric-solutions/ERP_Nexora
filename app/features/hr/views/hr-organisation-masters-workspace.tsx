"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { LayoutGrid, List } from "lucide-react";
import { HrBackButton } from "../components/hr-icon-buttons";
import { HrNavCard } from "../components/hr-nav-card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import {
  organisationMasterGroups,
  organisationMasterPages,
  preferredMasterCompany,
  rememberMasterCompany,
  resolveOrganisationMasterPageId,
} from "../model/organisation-master-navigation";

export function HrOrganisationMastersWorkspace({
  pageId,
  onNavigate,
  children,
}: {
  pageId: string;
  onNavigate: (moduleId: string, pageId: string) => void;
  children?: ReactNode;
}) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const [companies, setCompanies] = useState<Awaited<ReturnType<HrApiClient["companies"]>>["items"]>([]);
  const [companyId, setCompanyId] = useState("");
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [display, setDisplay] = useState<"cards" | "list">("cards");
  const [message, setMessage] = useState("");
  const [retry, setRetry] = useState(0);
  const resolvedPageId = resolveOrganisationMasterPageId(pageId);
  const active = organisationMasterPages.find((page) => page.id === resolvedPageId);
  const permissions = session?.user.permissions ?? [];
  const canReadMaster = permissions.includes("hr.master.read");
  const canReadOrganisation = permissions.includes("hr.organization.read");

  useEffect(() => {
    if (active || sessionLoading || !session) return;
    let cancelled = false;
    client
      .companies()
      .then((result) => {
        if (!cancelled) {
          setCompanies(result.items);
          setCompanyId(preferredMasterCompany(result.items));
          setMessage("");
        }
      })
      .catch(() => {
        if (!cancelled) setMessage("Companies could not be loaded. Retry or refresh your session.");
      });
    return () => {
      cancelled = true;
    };
  }, [active, client, retry, session, sessionLoading]);

  useEffect(() => {
    if (active || !companyId) return;
    let cancelled = false;
    const requests = organisationMasterPages.map(async (page) => {
      if (!(page.type === null ? canReadOrganisation : canReadMaster)) return [page.id, null] as const;
      try {
        const response =
          page.type === null
            ? await client.organizationUnits({ companyId, includeInactive: true })
            : page.type === "job_grade"
              ? await client.jobGrades(companyId)
              : await client.masters({ companyId, type: page.type, activeOnly: false });
        return [page.id, response.items.length] as const;
      } catch {
        return [page.id, null] as const;
      }
    });
    Promise.all(requests).then((result) => {
      if (!cancelled) setCounts(Object.fromEntries(result));
    });
    return () => {
      cancelled = true;
    };
  }, [active, canReadMaster, canReadOrganisation, client, companyId, retry]);

  const navigate = (id: string) => onNavigate("hr", id);
  return (
    <section className="min-w-0" aria-label="Organisation & Masters workspace">
      {active ? (
        <>
          <div className="mb-3 flex items-center gap-2">
            <HrBackButton label="Back to all masters" onClick={() => navigate("organisation-masters")} />
            <h1 className="m-0! min-w-0 text-2xl font-bold tracking-tight">{active.label}</h1>
          </div>
          <nav aria-label="Master pages" className="mb-3 flex gap-2 overflow-x-auto border-b border-border pb-2">
            {organisationMasterPages.map((page) => (
              <Button
                key={page.id}
                variant={active.id === page.id ? "default" : "outline"}
                aria-current={active.id === page.id ? "page" : undefined}
                onClick={() => navigate(page.id)}
              >
                {page.label}
              </Button>
            ))}
          </nav>
          {children}
        </>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="m-0! text-2xl font-bold tracking-tight">Organisation & Masters</h1>
            </div>
            <label className="grid w-full gap-1 text-xs text-muted-foreground sm:w-64" htmlFor="masters-hub-company">
              Company
              <select
                id="masters-hub-company"
                className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
                value={companyId}
                onChange={(event) => {
                  setCompanyId(event.target.value);
                  rememberMasterCompany(event.target.value);
                  setCounts({});
                }}
              >
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {message ? (
            <Alert>
              <AlertDescription>
                {message}{" "}
                <Button variant="outline" onClick={() => setRetry((value) => value + 1)}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}
          {sessionLoading ? (
            <Skeleton className="h-60 w-full" />
          ) : !session ? (
            <Alert>
              <AlertDescription>Sign in to access company masters.</AlertDescription>
            </Alert>
          ) : (
            <>
              {!companyId && !message ? (
                <Alert>
                  <AlertDescription>No authorized company is available.</AlertDescription>
                </Alert>
              ) : null}
              <div className="mb-5 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{organisationMasterPages.length} master pages</span>
                <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
                  <Button
                    size="icon-sm"
                    variant={display === "cards" ? "secondary" : "ghost"}
                    aria-label="Card view"
                    aria-pressed={display === "cards"}
                    onClick={() => setDisplay("cards")}
                  >
                    <LayoutGrid />
                  </Button>
                  <Button
                    size="icon-sm"
                    variant={display === "list" ? "secondary" : "ghost"}
                    aria-label="List view"
                    aria-pressed={display === "list"}
                    onClick={() => setDisplay("list")}
                  >
                    <List />
                  </Button>
                </div>
              </div>
              <div className="space-y-6">
                {organisationMasterGroups.map((group, groupIndex) => (
                  <section key={group.id} aria-label={group.label}>
                    <div className="mb-4 flex gap-3">
                      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border bg-card text-xs font-semibold text-primary">
                        {groupIndex + 1}
                      </span>
                      <div>
                        <h2 className="m-0 text-lg font-semibold">{group.label}</h2>
                        <p className="mb-0 mt-1 text-sm text-muted-foreground">{group.description}</p>
                      </div>
                    </div>
                    <div className={display === "cards" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-2"}>
                      {group.items.map((page) => {
                        const permitted = page.type === null ? canReadOrganisation : canReadMaster;
                        return (
                          <HrNavCard
                            key={page.id}
                            icon={page.icon}
                            label={page.label}
                            description={page.description}
                            layout={display === "cards" ? "card" : "row"}
                            disabled={!permitted || !companyId}
                            onClick={() => navigate(page.id)}
                            meta={
                              !permitted
                                ? "Access required"
                                : counts[page.id] === undefined
                                  ? "Loading records…"
                                  : counts[page.id] === null
                                    ? "Count unavailable"
                                    : `${counts[page.id]} records`
                            }
                          />
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </section>
  );
}
