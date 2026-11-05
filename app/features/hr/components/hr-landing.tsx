"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { LayoutGrid, List, type LucideIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useSession } from "@/lib/session/session-provider";
import { HrApiClient } from "../api/hr-client";
import type { HrLandingSummaryLoaders, HrLandingSummaryState } from "../model/hr-landing-summary";
import { preferredMasterCompany, rememberMasterCompany } from "../model/organisation-master-navigation";
import { HrNavCard, type HrNavCardSummary } from "./hr-nav-card";
import { HrGroupHeading } from "./hr-section-header";

export type HrLandingDisplay = "cards" | "list";
type Company = Awaited<ReturnType<HrApiClient["companies"]>>["items"][number];

const displayStorageKey = "nexora.hr.landing.display";

const displayEvent = "nexora:hr-landing-display";
let fallbackDisplay: HrLandingDisplay = "cards";
const readDisplay = (): HrLandingDisplay => {
  try {
    return window.localStorage.getItem(displayStorageKey) === "list" ? "list" : "cards";
  } catch {
    return fallbackDisplay;
  }
};
const subscribeDisplay = (notify: () => void) => {
  window.addEventListener(displayEvent, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(displayEvent, notify);
    window.removeEventListener("storage", notify);
  };
};

/** Card/list choice shared by every HR & Payroll landing page (cards until the viewer picks list). */
export function useHrLandingDisplay() {
  const display = useSyncExternalStore(subscribeDisplay, readDisplay, () => "cards" as const);
  const choose = (next: HrLandingDisplay) => {
    fallbackDisplay = next;
    try {
      window.localStorage.setItem(displayStorageKey, next);
    } catch {
      /* Storage may be unavailable; the in-memory choice still applies. */
    }
    window.dispatchEvent(new Event(displayEvent));
  };
  return [display, choose] as const;
}

/** Authorized companies for landing summaries; the choice is shared with Organisation & Masters. */
export function useHrLandingCompany(client: HrApiClient, enabled: boolean) {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    client
      .companies()
      .then((result) => {
        if (cancelled) return;
        setCompanies(result.items);
        setCompanyId(preferredMasterCompany(result.items));
        setError("");
      })
      .catch(() => {
        if (!cancelled) setError("Companies could not be loaded. Retry or refresh your session.");
      });
    return () => {
      cancelled = true;
    };
  }, [client, enabled, retry]);
  const choose = (id: string) => {
    setCompanyId(id);
    rememberMasterCompany(id);
  };
  return { companies, companyId, setCompanyId: choose, error, retry: () => setRetry((value) => value + 1) };
}

/** Runs every card's loader for the company; each card settles on its own. */
export function useHrLandingSummaries(
  client: HrApiClient,
  companyId: string,
  loaders: HrLandingSummaryLoaders,
  refreshKey = 0,
): Record<string, HrLandingSummaryState> {
  const [result, setResult] = useState<{ key: string; values: Record<string, HrLandingSummaryState> }>({
    key: "",
    values: {},
  });
  const key = `${companyId}:${refreshKey}`;
  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    const cache = new Map<string, Promise<unknown>>();
    const once = <T,>(cacheKey: string, load: () => Promise<T>) => {
      if (!cache.has(cacheKey)) cache.set(cacheKey, load());
      return cache.get(cacheKey) as Promise<T>;
    };
    for (const [pageId, loader] of Object.entries(loaders)) {
      loader({ client, companyId, once })
        .then((details): HrLandingSummaryState => ({ state: "ready", details }))
        .catch((): HrLandingSummaryState => ({ state: "unavailable" }))
        .then((value) => {
          if (cancelled) return;
          setResult((current) => ({
            key,
            values: { ...(current.key === key ? current.values : {}), [pageId]: value },
          }));
        });
    }
    return () => {
      cancelled = true;
    };
  }, [client, companyId, key, loaders]);
  return result.key === key ? result.values : {};
}

export function HrLandingToolbar({
  companies,
  companyId,
  onCompanyChange,
  display,
  onDisplayChange,
  idPrefix,
}: {
  companies: readonly Company[];
  companyId: string;
  onCompanyChange: (companyId: string) => void;
  display: HrLandingDisplay;
  onDisplayChange: (display: HrLandingDisplay) => void;
  idPrefix: string;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <label className="grid w-full gap-1 text-xs text-muted-foreground sm:w-64" htmlFor={`${idPrefix}-company`}>
        Company
        <select
          id={`${idPrefix}-company`}
          className="h-10 w-full min-w-0 rounded-lg border border-input bg-card px-3 text-sm text-foreground"
          value={companyId}
          onChange={(event) => onCompanyChange(event.target.value)}
        >
          {companies.map((company) => (
            <option key={company.id} value={company.id}>
              {company.name}
            </option>
          ))}
        </select>
      </label>
      <div className="flex gap-1 rounded-lg border border-border bg-card p-1">
        <Button
          type="button"
          size="icon-sm"
          variant={display === "cards" ? "secondary" : "ghost"}
          aria-label="Card view"
          aria-pressed={display === "cards"}
          onClick={() => onDisplayChange("cards")}
        >
          <LayoutGrid />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant={display === "list" ? "secondary" : "ghost"}
          aria-label="List view"
          aria-pressed={display === "list"}
          onClick={() => onDisplayChange("list")}
        >
          <List />
        </Button>
      </div>
    </div>
  );
}

export type HrLandingGroup = {
  id: string;
  label: string;
  description: string;
  pages: readonly { id: string; label: string; icon: LucideIcon; disabled?: boolean; restriction?: string }[];
};

/** Numbered sections of cards (with live details) or compact icon-and-name rows. */
export function HrLandingSections({
  groups,
  display,
  summaries,
  fallback,
  onOpen,
}: {
  groups: readonly HrLandingGroup[];
  display: HrLandingDisplay;
  summaries: Record<string, HrLandingSummaryState>;
  /** Shown on cards that have no loaded details, e.g. when no company is available. */
  fallback?: HrNavCardSummary;
  onOpen: (pageId: string) => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((group, groupIndex) => (
        <section key={group.id} aria-label={group.label}>
          <HrGroupHeading number={groupIndex + 1} label={group.label} />
          <div className={display === "cards" ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : "grid gap-1.5"}>
            {group.pages.map((page) => (
              <HrNavCard
                key={page.id}
                icon={page.icon}
                label={page.label}
                layout={display === "cards" ? "card" : "row"}
                disabled={page.disabled}
                summary={
                  page.restriction
                    ? { state: "restricted", message: page.restriction }
                    : (summaries[page.id] ?? fallback)
                }
                onClick={() => onOpen(page.id)}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function HrLandingNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert className="mb-4">
      <AlertDescription>
        {message}{" "}
        {onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Retry
          </Button>
        ) : null}
      </AlertDescription>
    </Alert>
  );
}

/** Complete HR & Payroll landing: title, company and view toolbar, numbered live sections. */
export function HrLandingPage({
  title,
  idPrefix,
  groups,
  loaders,
  onOpen,
}: {
  title: string;
  idPrefix: string;
  groups: readonly HrLandingGroup[];
  loaders: HrLandingSummaryLoaders;
  onOpen: (pageId: string) => void;
}) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new HrApiClient(api), [api]);
  const company = useHrLandingCompany(client, !sessionLoading && !!session);
  const [display, setDisplay] = useHrLandingDisplay();
  const summaries = useHrLandingSummaries(client, company.companyId, loaders);
  const noCompany = !company.companyId && !company.error && company.companies.length === 0;
  return (
    <div className="min-w-0">
      <h1 className="mb-4! mt-0! text-2xl font-bold tracking-tight">{title}</h1>
      {company.error ? <HrLandingNotice message={company.error} onRetry={company.retry} /> : null}
      {sessionLoading ? (
        <Skeleton className="h-60 w-full" />
      ) : !session ? (
        <HrLandingNotice message="Sign in to view this area." />
      ) : (
        <>
          <HrLandingToolbar
            idPrefix={idPrefix}
            companies={company.companies}
            companyId={company.companyId}
            onCompanyChange={company.setCompanyId}
            display={display}
            onDisplayChange={setDisplay}
          />
          {noCompany ? <HrLandingNotice message="No authorized company is available." /> : null}
          <HrLandingSections
            groups={groups}
            display={display}
            summaries={summaries}
            fallback={company.companyId ? undefined : { state: "restricted", message: "Select a company" }}
            onOpen={onOpen}
          />
        </>
      )}
    </div>
  );
}
