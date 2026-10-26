"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { ActionFeedbackProvider } from "@/shared/ui/action-feedback";
import { Input } from "@/components/ui/input";
import {
  PROTOTYPE_MODULE_COUNT,
  PROTOTYPE_PAGE_COUNT,
  findPrototypePage,
  prototypeModules,
  prototypePageIndex,
  type PrototypeModule,
} from "./config/prototype-data";
import {
  companies,
  companyModeOptions,
  makeGenericRows,
  notifications,
  roleOptions,
  type CompanyMode,
} from "@prototype/shared/fixtures/mock-data";
import { PrototypeContent, type PrototypeRow, type PrototypeViewState } from "./prototype-content";
import { savedBankingTransactions } from "@prototype/features/banking/views/banking-transaction-detail";
import {
  NexoraIntelligenceLayer,
  type IntelligenceSurface,
} from "@prototype/features/ai/components/nexora-intelligence";

type RouteState = { moduleId: string; pageId: string; recordRef?: string };
type DialogState =
  { type: "confirm"; action: string; subject: string } | { type: "notifications" } | { type: "help" } | null;
type Toast = { id: number; tone: "success" | "warning" | "danger" | "info"; title: string; message: string };

const initialRoute: RouteState = { moduleId: "dashboard", pageId: "ceo-executive-dashboard" };
const confirmationActions = new Set([
  "Approve",
  "Reject",
  "Return for revision",
  "Cancel",
  "Delete",
  "Post",
  "Reverse",
  "Submit",
  "Save and submit",
  "Save settings",
  "Discard changes",
  "Start workflow",
]);
const moduleParties: Record<string, readonly string[]> = {
  sales: ["Atlas Retail Group", "Crescent Finance", "Northstar Foods", "BluePeak Logistics"],
  revenue: ["Crescent Finance", "Orbit Telecom", "Atlas Retail Group", "Northstar Foods"],
  customers: ["Atlas Retail Group", "Crescent Finance", "Northstar Foods", "BluePeak Logistics"],
  purchases: ["Prime Industrial Supplies", "Kinetic Components", "Vertex Packaging", "Harbor Logistics"],
  suppliers: ["Prime Industrial Supplies", "Kinetic Components", "Vertex Packaging", "Harbor Logistics"],
  inventory: ["Servo Drive SD-220", "Control Panel CP-48", "Sensor Kit SK-14", "Packaging Unit PU-8"],
  manufacturing: ["Atlas Line Upgrade", "Control Panel Assembly", "Sensor Kit Batch", "Drive Unit Rework"],
  projects: [
    "Crescent Finance Transformation",
    "Atlas Retail Rollout",
    "Northstar Data Platform",
    "BluePeak Optimisation",
  ],
  resources: ["Sana Iqbal", "Omar Farooq", "Nadia Javed", "Hamza Ali"],
  hr: ["Sana Iqbal", "Omar Farooq", "Nadia Javed", "Hamza Ali"],
  banking: ["Habib Metro — Operating", "Meezan — Payroll", "Standard Chartered — USD", "Petty Cash — Head Office"],
  finance: ["Trade Receivables", "Service Revenue", "Operating Bank", "Cost of Sales"],
  fleet: ["KHI-6296 - Toyota Hilux", "LHR-8421 - Isuzu NPR", "KHI-3802 - Hino 500"],
};

function readHashRoute(): RouteState {
  if (typeof window === "undefined") return initialRoute;
  const [moduleId, pageId, ...recordParts] = window.location.hash.replace(/^#\/?/, "").split("/");
  const resolved = findPrototypePage(moduleId || initialRoute.moduleId, pageId || initialRoute.pageId);
  const recordRef = recordParts.length ? decodeURIComponent(recordParts.join("/")) : undefined;
  return { moduleId: resolved.module.id, pageId: resolved.page.id, recordRef };
}

function hashForRoute(route: RouteState): string {
  const recordPath = route.recordRef ? `/${encodeURIComponent(route.recordRef)}` : "";
  return `#/${route.moduleId}/${route.pageId}${recordPath}`;
}

function isIdentityWorkspaceHash(): boolean {
  if (typeof window === "undefined") return false;
  const route = window.location.hash.replace(/^#\/?/, "");
  return route === "identity/access" || route.startsWith("identity/access?");
}

function rowsFor(moduleId: string, moduleLabel: string, pageLabel: string): PrototypeRow[] {
  const parties = moduleParties[moduleId] ?? [
    "Nexora Services",
    "Corporate Operations",
    "Regional Office",
    "Shared Services",
  ];
  return makeGenericRows({ moduleId, moduleLabel: pageLabel, count: 8 }).map((row, index) => ({
    id: row.id,
    document: row.reference,
    date: row.date,
    party: parties[index % parties.length],
    reference: index % 2 === 0 ? row.name : `${moduleLabel} review ${String(index + 1).padStart(2, "0")}`,
    amount: row.displayAmount
      ? `${row.currency} ${row.displayAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
      : "—",
    currency: row.currency,
    status: row.status,
    owner: row.owner,
  }));
}

type GlobalSearchResult =
  | {
      kind: "page";
      key: string;
      moduleId: string;
      pageId: string;
      moduleCode: string;
      label: string;
      context: string;
      meta: string;
      searchable: string;
    }
  | {
      kind: "record";
      key: string;
      moduleId: string;
      pageId: string;
      recordRef: string;
      moduleCode: string;
      label: string;
      context: string;
      meta: string;
      searchable: string;
    };

const genericRecordSearchIndex: readonly GlobalSearchResult[] = prototypePageIndex
  .filter((page) => /list|register|queue|detail/i.test(page.archetype))
  .flatMap((page) =>
    rowsFor(page.moduleId, page.moduleLabel, page.label)
      .slice(0, 4)
      .map((row) => ({
        kind: "record" as const,
        key: `record:${page.moduleId}:${page.id}:${row.document}`,
        moduleId: page.moduleId,
        pageId: page.id,
        recordRef: row.document,
        moduleCode: page.moduleCode,
        label: row.document,
        context: `${row.party} · ${row.reference}`,
        meta: `${page.moduleLabel} / ${page.label}`,
        searchable: [
          row.document,
          row.party,
          row.reference,
          row.amount,
          row.status,
          row.owner,
          page.label,
          page.moduleLabel,
        ]
          .join(" ")
          .toLowerCase(),
      })),
  );

const bankingRecordSearchIndex: readonly GlobalSearchResult[] = savedBankingTransactions.map((transaction) => ({
  kind: "record" as const,
  key: `record:banking:${transaction.reference}`,
  moduleId: "banking",
  pageId: "transaction-detail",
  recordRef: transaction.reference,
  moduleCode: "BNK",
  label: transaction.reference,
  context: `${transaction.party} · ${transaction.description}`,
  meta: `Banking · ${transaction.status} · ${transaction.currency} ${transaction.amount.toLocaleString("en-US")}`,
  searchable: [
    transaction.reference,
    transaction.party,
    transaction.description,
    transaction.notes,
    transaction.status,
    transaction.method,
    transaction.currency,
    transaction.amount,
  ]
    .join(" ")
    .toLowerCase(),
}));

function pageCount(module: PrototypeModule) {
  return module.groups.reduce((total, group) => total + group.pages.length, 0);
}

/**
 * Reviewer preferences persist per browser so a long review session survives a
 * reload. Storage is read in an effect, never during render, so the
 * server-rendered markup stays deterministic. Every access is guarded: private
 * windows and blocked site data must not break the prototype.
 */
// Version the key whenever a review-wide navigation default changes. This
// prevents an older saved role/company scope from silently hiding modules for
// returning reviewers after the prototype has moved to an all-module review.
const PREF_KEY = "nexora-prototype-preferences-v2";

type Preferences = {
  density: "comfortable" | "compact";
  roleId: string;
  companyMode: CompanyMode;
  roleScoped: boolean;
  modeScoped: boolean;
  sidebarCollapsed: boolean;
};

function readPreferences(): Partial<Preferences> | null {
  try {
    const raw = window.localStorage.getItem(PREF_KEY);
    return raw ? (JSON.parse(raw) as Partial<Preferences>) : null;
  } catch {
    return null;
  }
}

function writePreferences(prefs: Preferences): void {
  try {
    window.localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    /* storage unavailable - preferences simply do not persist */
  }
}

export function PrototypeShell({
  headerControls,
  identityContent,
}: {
  headerControls?: ReactNode;
  identityContent?: ReactNode;
}) {
  const [route, setRoute] = useState<RouteState>(initialRoute);
  const [expandedModule, setExpandedModule] = useState<string | null>(initialRoute.moduleId);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set(["dashboard:command-centres"]));
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarQuery, setSidebarQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [roleId, setRoleId] = useState("chief-executive");
  const [companyMode, setCompanyMode] = useState<CompanyMode>("service");
  const [roleScoped, setRoleScoped] = useState(false);
  const [modeScoped, setModeScoped] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [viewState, setViewState] = useState<PrototypeViewState>("data");
  const [dialog, setDialog] = useState<DialogState>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [drawerModuleId, setDrawerModuleId] = useState<string | null>(null);
  const [intelligenceSurface, setIntelligenceSurface] = useState<IntelligenceSurface>(null);
  const [activeWorkspace, setActiveWorkspace] = useState<"prototype" | "identity">("prototype");
  const [paymentEntryDirty, setPaymentEntryDirty] = useState(false);
  const routeRef = useRef(route);
  const paymentEntryDirtyRef = useRef(paymentEntryDirty);

  const current = useMemo(() => findPrototypePage(route.moduleId, route.pageId), [route]);
  const isCentralChartPage =
    current.module.id === "finance" && ["central-chart-template", "section-management"].includes(current.page.id);
  const isFiscalPeriodPage = current.module.id === "finance" && ["fiscal-periods", "period-close"].includes(current.page.id);
  const isReferenceMasterPage =
    current.module.id === "finance" && ["reporting-projects", "reporting-locations"].includes(current.page.id);
  const isLiveFinanceChartPage =
    isFiscalPeriodPage ||
    isReferenceMasterPage ||
    isCentralChartPage ||
    (current.module.id === "finance" &&
      ["chart-of-accounts", "nominals", "nominal-detail", "add-nominal"].includes(current.page.id));
  const isLiveBankMasterDataPage =
    current.module.id === "banking" &&
    ["bank-accounts", "add-bank-account", "bank-account-detail", "bank-account-approvals"].includes(current.page.id);
  const isLiveMasterDataPage = isLiveFinanceChartPage || isLiveBankMasterDataPage;
  const currentRole = roleOptions.find((role) => role.id === roleId) ?? roleOptions[0];
  const currentCompany = companies.find((company) => company.mode === companyMode) ?? companies[0];
  const currentMode = companyModeOptions.find((mode) => mode.id === companyMode) ?? companyModeOptions[0];
  const rows = useMemo(() => rowsFor(current.module.id, current.module.label, current.page.label), [current]);

  const visibleModules = useMemo(() => {
    const query = sidebarQuery.trim().toLowerCase();
    const allowedByRole = currentRole.visibleModuleIds;
    return prototypeModules.filter((module) => {
      const allowedModuleIds: readonly string[] = allowedByRole === "all" ? [] : allowedByRole;
      const supportedModes: readonly CompanyMode[] = module.modes;
      const roleMatch = !roleScoped || allowedByRole === "all" || allowedModuleIds.includes(module.id);
      const modeMatch = !modeScoped || supportedModes.includes(companyMode);
      const searchMatch =
        !query ||
        [
          module.label,
          module.shortLabel,
          module.code,
          ...module.groups.map((group) => group.label),
          ...module.groups.flatMap((group) => group.pages.map((page) => page.label)),
        ].some((value) => value.toLowerCase().includes(query));
      return roleMatch && modeMatch && searchMatch;
    });
  }, [companyMode, currentRole.visibleModuleIds, modeScoped, roleScoped, sidebarQuery]);

  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const pageResults: GlobalSearchResult[] = prototypePageIndex.map((page) => ({
      kind: "page",
      key: `page:${page.moduleId}:${page.id}`,
      moduleId: page.moduleId,
      pageId: page.id,
      moduleCode: page.moduleCode,
      label: page.label,
      context: `${page.moduleLabel} / ${page.groupLabel}`,
      meta: page.status === "prototype" ? page.archetype : "Coming soon",
      searchable: [page.label, page.groupLabel, page.moduleLabel, page.moduleCode, page.archetype]
        .join(" ")
        .toLowerCase(),
    }));
    if (!query) return pageResults.slice(0, 12);
    const terms = query.split(/\s+/).filter(Boolean);
    const matches = (item: GlobalSearchResult) => terms.every((term) => item.searchable.includes(term));
    const exactRecords = [...bankingRecordSearchIndex, ...genericRecordSearchIndex].filter(matches);
    const pages = pageResults.filter(matches);
    return [...exactRecords.slice(0, 12), ...pages.slice(0, Math.max(0, 18 - exactRecords.length))].slice(0, 18);
  }, [searchQuery]);

  const confirmPaymentEntryDiscard = useCallback((bypass = false) => {
    if (bypass || !paymentEntryDirtyRef.current || typeof window === "undefined") return true;
    if (!window.confirm("You have unsaved Bank changes. Leave this page and discard them?")) return false;
    paymentEntryDirtyRef.current = false;
    setPaymentEntryDirty(false);
    return true;
  }, []);

  const navigate = useCallback(
    (
      moduleId: string,
      pageId: string,
      recordRef?: string,
      options?: { replace?: boolean; bypassUnsavedGuard?: boolean },
    ) => {
      if (!confirmPaymentEntryDiscard(options?.bypassUnsavedGuard)) return;
      const resolved = findPrototypePage(moduleId, pageId);
      const next = { moduleId: resolved.module.id, pageId: resolved.page.id, recordRef };
      routeRef.current = next;
      paymentEntryDirtyRef.current = false;
      setPaymentEntryDirty(false);
      setActiveWorkspace("prototype");
      setRoute(next);
      setExpandedModule(next.moduleId);
      setExpandedGroups((previous) => new Set(previous).add(`${next.moduleId}:${resolved.group.id}`));
      setMobileOpen(false);
      setDrawerModuleId(null);
      setSearchOpen(false);
      setIntelligenceSurface(null);
      if (typeof window !== "undefined") {
        const url = hashForRoute(next);
        if (options?.replace) window.history.replaceState(null, "", url);
        else window.history.pushState(null, "", url);
      }
    },
    [confirmPaymentEntryDiscard],
  );

  const openIdentityWorkspace = useCallback(() => {
    if (!confirmPaymentEntryDiscard()) return;
    paymentEntryDirtyRef.current = false;
    setPaymentEntryDirty(false);
    setActiveWorkspace("identity");
    setMobileOpen(false);
    setDrawerModuleId(null);
    setSearchOpen(false);
    setIntelligenceSurface(null);
    if (typeof window !== "undefined") {
      window.history.pushState(null, "", "#/identity/access");
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [confirmPaymentEntryDiscard]);

  const pushToast = useCallback((tone: Toast["tone"], title: string, message: string) => {
    const id = Date.now() + Math.floor(Math.random() * 1000);
    setToasts((previous) => [...previous.slice(-2), { id, tone, title, message }]);
    window.setTimeout(() => setToasts((previous) => previous.filter((toast) => toast.id !== id)), 4200);
  }, []);

  useEffect(() => {
    const syncRoute = () => {
      if (isIdentityWorkspaceHash()) {
        if (!confirmPaymentEntryDiscard()) {
          window.history.pushState(null, "", hashForRoute(routeRef.current));
          return;
        }
        paymentEntryDirtyRef.current = false;
        setPaymentEntryDirty(false);
        setActiveWorkspace("identity");
        return;
      }
      const next = readHashRoute();
      const currentRoute = routeRef.current;
      const routeUnchanged =
        next.moduleId === currentRoute.moduleId &&
        next.pageId === currentRoute.pageId &&
        next.recordRef === currentRoute.recordRef;
      if (routeUnchanged) {
        setActiveWorkspace("prototype");
        return;
      }
      if (!confirmPaymentEntryDiscard()) {
        window.history.pushState(null, "", hashForRoute(currentRoute));
        return;
      }
      routeRef.current = next;
      paymentEntryDirtyRef.current = false;
      setPaymentEntryDirty(false);
      setActiveWorkspace("prototype");
      setRoute(next);
    };
    syncRoute();
    window.addEventListener("hashchange", syncRoute);
    window.addEventListener("popstate", syncRoute);
    return () => {
      window.removeEventListener("hashchange", syncRoute);
      window.removeEventListener("popstate", syncRoute);
    };
  }, [confirmPaymentEntryDiscard]);

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    paymentEntryDirtyRef.current = paymentEntryDirty;
  }, [paymentEntryDirty]);

  // Restore saved reviewer preferences once, on the client only.
  //
  // `set-state-in-effect` is disabled deliberately for this one effect. The
  // rule guards against cascading renders, but restoring persisted UI
  // preferences genuinely belongs here: reading localStorage during render
  // (or in a lazy useState initializer) would make the client's first render
  // disagree with the server-rendered markup and break hydration. This runs
  // once on mount, is not in any render path, and is the documented React
  // pattern for hydration-safe restoration of external preferences.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = readPreferences();
    if (!saved) return;
    if (saved.density === "comfortable" || saved.density === "compact") setDensity(saved.density);
    if (saved.roleId && roleOptions.some((role) => role.id === saved.roleId)) setRoleId(saved.roleId);
    if (saved.companyMode && companyModeOptions.some((mode) => mode.id === saved.companyMode))
      setCompanyMode(saved.companyMode);
    if (typeof saved.roleScoped === "boolean") setRoleScoped(saved.roleScoped);
    if (typeof saved.modeScoped === "boolean") setModeScoped(saved.modeScoped);
    if (typeof saved.sidebarCollapsed === "boolean") setSidebarCollapsed(saved.sidebarCollapsed);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    writePreferences({ density, roleId, companyMode, roleScoped, modeScoped, sidebarCollapsed });
  }, [density, roleId, companyMode, roleScoped, modeScoped, sidebarCollapsed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = Boolean(
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable),
      );
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        window.setTimeout(() => document.querySelector<HTMLInputElement>(".nx-command-search input")?.focus(), 0);
      }
      // Power-user keys, inert while a field has focus so typing is never stolen.
      if (!typing && !event.ctrlKey && !event.metaKey && !event.altKey) {
        if (event.key === "/") {
          event.preventDefault();
          setSearchOpen(true);
          window.setTimeout(() => document.querySelector<HTMLInputElement>(".nx-command-search input")?.focus(), 0);
        }
        if (event.key === "?") {
          event.preventDefault();
          setDialog({ type: "help" });
        }
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setDialog(null);
        setDrawerModuleId(null);
        setMobileOpen(false);
        setIntelligenceSurface(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleAction = useCallback(
    (action: string, subject = current.page.label) => {
      const normalized = action.toLowerCase();
      const modulePages = current.module.groups.flatMap((group) => group.pages);
      if (normalized === "explain number") {
        setIntelligenceSurface({ kind: "explain", subject });
        return;
      }
      if (normalized === "print") {
        window.print();
        return;
      }
      if (normalized === "export") {
        const header = "Document,Date,Party,Reference,Amount,Status,Owner\n";
        const csv = rows
          .map((row) =>
            [row.document, row.date, row.party, row.reference, row.amount, row.status, row.owner]
              .map((value) => `"${String(value).replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n");
        const url = URL.createObjectURL(new Blob([header + csv], { type: "text/csv;charset=utf-8" }));
        const link = document.createElement("a");
        link.href = url;
        link.download = `nexora-prototype-${current.module.id}-${current.page.id}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        pushToast("success", "Mock export prepared", `${subject} was exported from local prototype data.`);
        return;
      }
      if (normalized === "refresh" || normalized === "refresh workflow") {
        setViewState("loading");
        window.setTimeout(() => {
          setViewState("data");
          pushToast("success", "Prototype refreshed", "Local mock records were re-rendered; no server was contacted.");
        }, 650);
        return;
      }
      const desiredArchetype =
        normalized.includes("add") || normalized.includes("create") || normalized === "edit"
          ? "form"
          : normalized.includes("view") || normalized.includes("drill")
            ? "detail"
            : normalized.includes("report")
              ? "report"
              : null;
      if (desiredArchetype) {
        const target = modulePages.find((page) => page.archetype === desiredArchetype);
        if (target && target.id !== current.page.id) {
          navigate(current.module.id, target.id);
          pushToast("info", `${action} opened`, `${target.label} is shown with safe mock data.`);
          return;
        }
      }
      if (confirmationActions.has(action)) {
        setDialog({ type: "confirm", action, subject });
        return;
      }
      pushToast(
        normalized.includes("error") ? "danger" : "info",
        `${action} — prototype`,
        `${subject}: visual interaction completed locally. No business transaction was created.`,
      );
    },
    [current, navigate, pushToast, rows],
  );

  const confirmAction = () => {
    if (!dialog || dialog.type !== "confirm") return;
    const tone: Toast["tone"] = dialog.action === "Reject" || dialog.action === "Delete" ? "warning" : "success";
    pushToast(tone, `${dialog.action} simulated`, `${dialog.subject} was updated only in the current mock interface.`);
    setDialog(null);
  };

  const toggleGroup = (moduleId: string, groupId: string) => {
    const key = `${moduleId}:${groupId}`;
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const changeCompanyMode = (nextMode: CompanyMode) => {
    setCompanyMode(nextMode);
    if (modeScoped && !current.module.modes.some((mode) => mode === nextMode)) {
      const target = prototypeModules.find((candidate) => candidate.modes.some((mode) => mode === nextMode));
      if (target) navigate(target.id, target.groups[0].pages[0].id);
    }
  };

  const changeRole = (nextRoleId: string) => {
    setRoleId(nextRoleId);
    const nextRole = roleOptions.find((role) => role.id === nextRoleId);
    if (nextRole) navigate("dashboard", nextRole.dashboardPageId);
  };

  const toggleModeScope = () => {
    const next = !modeScoped;
    setModeScoped(next);
    if (next && !current.module.modes.some((mode) => mode === companyMode)) {
      const target = prototypeModules.find((candidate) => candidate.modes.some((mode) => mode === companyMode));
      if (target) navigate(target.id, target.groups[0].pages[0].id);
    }
  };

  const toggleRoleScope = () => {
    const next = !roleScoped;
    setRoleScoped(next);
    if (next && currentRole.visibleModuleIds !== "all") {
      const visibleIds: readonly string[] = currentRole.visibleModuleIds;
      if (!visibleIds.includes(current.module.id)) {
        const target = prototypeModules.find((candidate) => visibleIds.includes(candidate.id));
        if (target) navigate(target.id, target.groups[0].pages[0].id);
      }
    }
  };

  const openModule = (module: PrototypeModule) => {
    if (module.id === "reports") {
      setExpandedModule(null);
      setDrawerModuleId(null);
      navigate("reports", "report-catalogue");
      return;
    }
    if (sidebarCollapsed && window.innerWidth >= 768) {
      setDrawerModuleId(module.id);
      setExpandedModule(module.id);
      return;
    }
    if (expandedModule === module.id) {
      setExpandedModule(null);
      return;
    }
    setExpandedModule(module.id);
    if (module.id !== route.moduleId) navigate(module.id, module.groups[0].pages[0].id);
  };

  const drawerModule = drawerModuleId ? prototypeModules.find((module) => module.id === drawerModuleId) : null;

  return (
    <div className="nx-prototype" data-density={density} data-role-theme={roleId}>
      <div
        className="nx-shell"
        data-sidebar={sidebarCollapsed ? "collapsed" : "expanded"}
        data-mobile-nav={mobileOpen ? "open" : "closed"}
      >
        <button
          className="nx-mobile-overlay"
          data-open={mobileOpen ? "true" : "false"}
          aria-label="Close navigation"
          type="button"
          onClick={() => setMobileOpen(false)}
        />
        <aside
          className="nx-sidebar"
          data-mobile-open={mobileOpen ? "true" : "false"}
          aria-label="Nexora prototype navigation"
        >
          <div className="nx-sidebar__header">
            <button
              className="nx-sidebar__brand"
              type="button"
              onClick={() => navigate("dashboard", currentRole.dashboardPageId)}
              aria-label="Open dashboard"
            >
              <span className="nx-sidebar__logo">N</span>
              <span className="nx-sidebar__identity">
                <strong>Nexora ERP</strong>
                <small>UI/UX prototype</small>
              </span>
            </button>
            <button
              className="nx-sidebar__collapse"
              type="button"
              aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {sidebarCollapsed ? "›" : "‹"}
            </button>
            <button
              className="nx-sidebar__close"
              type="button"
              aria-label="Close sidebar"
              onClick={() => setMobileOpen(false)}
            >
              ×
            </button>
          </div>
          {/* Whose desk this is. The accent comes from the designation theme,
              so the strip and the whole interface shift together. */}
          <div className="nx-designation" aria-label="Active designation">
            <span className="nx-designation__swatch" aria-hidden="true" />
            <span className="nx-designation__copy">
              <strong>{currentRole.label}</strong>
              <small>Designation view &middot; theme follows the desk</small>
            </span>
          </div>
          <label className="nx-sidebar__search" htmlFor="erp-module-search">
            <span aria-hidden="true">⌕</span>
            <Input
              id="erp-module-search"
              value={sidebarQuery}
              onChange={(event) => setSidebarQuery(event.target.value)}
              aria-label="Search prototype modules"
              placeholder={`Search ${PROTOTYPE_MODULE_COUNT} modules`}
            />
            <kbd>Ctrl K</kbd>
          </label>
          <div className="nx-sidebar__scroll">
            <nav className="nx-sidebar__nav" aria-label="All Nexora ERP modules">
              {["Command centre", "Finance & trade", "Operations & people", "Platform & governance"].map((category) => {
                const modules = visibleModules.filter((module) => module.category === category);
                if (!modules.length) return null;
                return (
                  <section className="nx-sidebar__section" key={category}>
                    <h2 className="nx-sidebar__section-label">{category}</h2>
                    <ul className="nx-module-list">
                      {modules.map((module) => {
                        const active = module.id === current.module.id;
                        const hasInlineMenu = module.id !== "reports";
                        const expanded = hasInlineMenu && expandedModule === module.id && !sidebarCollapsed;
                        return (
                          <li className="nx-module-item" key={module.id}>
                            <button
                              className={`nx-module-button${active ? " nx-module-button--active" : ""}`}
                              aria-expanded={hasInlineMenu ? expanded : undefined}
                              aria-current={active ? "page" : undefined}
                              title={module.label}
                              type="button"
                              onClick={() => openModule(module)}
                            >
                              <span className="nx-module-button__icon">{module.code}</span>
                              <span className="nx-module-button__label">{module.shortLabel}</span>
                              <span className="nx-module-button__meta">
                                <span className="nx-module-button__count">{pageCount(module)}</span>
                                <i className="nx-module-button__chevron" />
                              </span>
                            </button>
                            {expanded ? (
                              <ul className="nx-submenu">
                                {module.groups.map((group) => {
                                  const groupKey = `${module.id}:${group.id}`;
                                  const groupOpen = expandedGroups.has(groupKey) || group.id === current.group.id;
                                  return (
                                    <li key={group.id}>
                                      <button
                                        className="nx-submenu-button"
                                        type="button"
                                        aria-expanded={groupOpen}
                                        onClick={() => toggleGroup(module.id, group.id)}
                                      >
                                        <span>{group.label}</span>
                                        <i className="nx-submenu-button__chevron" />
                                      </button>
                                      {groupOpen ? (
                                        <ul className="nx-submenu__list">
                                          {group.pages.map((page) => (
                                            <li key={page.id}>
                                              <button
                                                className={`nx-submenu-link${page.id === current.page.id ? " nx-submenu-link--active" : ""}`}
                                                aria-current={page.id === current.page.id ? "page" : undefined}
                                                type="button"
                                                onClick={() => navigate(module.id, page.id)}
                                              >
                                                <span>{page.label}</span>
                                                {page.status !== "prototype" ? <small>Soon</small> : null}
                                              </button>
                                            </li>
                                          ))}
                                        </ul>
                                      ) : null}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
              <section className="nx-sidebar__section nx-sidebar__section--identity">
                <ul className="nx-module-list">
                  <li className="nx-module-item">
                    <button
                      className="nx-module-button"
                      type="button"
                      aria-current={activeWorkspace === "identity" ? "page" : undefined}
                      onClick={openIdentityWorkspace}
                    >
                      <span className="nx-module-button__icon">IA</span>
                      <span className="nx-module-button__label">Identity &amp; Access</span>
                      <span className="nx-module-button__meta" aria-hidden="true">
                        <i className="nx-module-button__chevron" />
                      </span>
                    </button>
                  </li>
                </ul>
              </section>
            </nav>
          </div>
          <div className="nx-sidebar__footer">
            <div className="nx-sidebar__environment">
              <span className="nx-sidebar__environment-dot" />
              <span>
                <strong>Isolated prototype</strong>
                <small>
                  {PROTOTYPE_MODULE_COUNT} modules · {PROTOTYPE_PAGE_COUNT} mock screens
                </small>
              </span>
            </div>
          </div>
        </aside>
        <button
          className="nx-sidebar-reopen"
          type="button"
          aria-label="Expand sidebar menu"
          title="Expand menu"
          onClick={() => setSidebarCollapsed(false)}
        >
          <span aria-hidden="true">›</span>
        </button>

        <main className="nx-main">
          <header className="nx-topbar">
            <button
              className="nx-mobile-menu-button"
              type="button"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              ☰
            </button>
            <span className="nx-topbar__brand">Nexora ERP</span>
            <button
              className="nx-global-search"
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Search transactions and pages"
            >
              <span>⌕</span>
              <span className="nx-shell-search-copy">Search transactions and pages</span>
              <kbd>Ctrl K</kbd>
            </button>
            <div className="nx-topbar__actions">
              <button
                className="nx-intelligence-trigger"
                type="button"
                onClick={() => setIntelligenceSurface({ kind: "work" })}
              >
                <i>✓</i>
                <span>My Work</span>
                <b>4</b>
              </button>
              <button
                className="nx-intelligence-trigger nx-intelligence-trigger--ai"
                type="button"
                onClick={() => setIntelligenceSurface({ kind: "assistant" })}
              >
                <i>N</i>
                <span>Nexora AI</span>
              </button>
              <button
                className="nx-icon-button"
                type="button"
                aria-label="Prototype help"
                onClick={() => setDialog({ type: "help" })}
              >
                ?
              </button>
              <button
                className="nx-icon-button"
                type="button"
                aria-label="Open notifications"
                onClick={() => setDialog({ type: "notifications" })}
              >
                !<span className="nx-icon-button__badge">3</span>
              </button>
              {headerControls}
            </div>
          </header>
          <section
            className="nx-prototype-toolbar"
            aria-label={isLiveMasterDataPage ? "Account master data controls" : "Prototype controls"}
          >
            <strong className="nx-prototype-toolbar__label">
              {isReferenceMasterPage
                ? "Live Master Data API"
                : isCentralChartPage
                  ? "Central Master Data"
                  : isLiveFinanceChartPage
                    ? "Live Finance API"
                    : isLiveBankMasterDataPage
                      ? "Live Bank API"
                      : "Mock-only review"}
            </strong>
            <div className="nx-prototype-toolbar__controls">
              {!isLiveMasterDataPage && (
                <>
                  <select
                    className="nx-context-control"
                    value={companyMode}
                    onChange={(event) => changeCompanyMode(event.target.value as CompanyMode)}
                    aria-label="Company navigation variant"
                  >
                    {companyModeOptions.map((mode) => (
                      <option key={mode.id} value={mode.id}>
                        Company: {mode.shortLabel}
                      </option>
                    ))}
                  </select>
                  <select
                    className="nx-context-control"
                    value={roleId}
                    onChange={(event) => changeRole(event.target.value)}
                    aria-label="Role visibility prototype"
                  >
                    {roleOptions.map((role) => (
                      <option key={role.id} value={role.id}>
                        Role: {role.shortLabel}
                      </option>
                    ))}
                  </select>
                  <button
                    className="nx-context-control"
                    type="button"
                    aria-pressed={modeScoped}
                    onClick={toggleModeScope}
                  >
                    Company menus: {modeScoped ? "Scoped" : "All"}
                  </button>
                  <button
                    className="nx-context-control"
                    type="button"
                    aria-pressed={roleScoped}
                    onClick={toggleRoleScope}
                  >
                    Role menus: {roleScoped ? "Scoped" : "All"}
                  </button>
                </>
              )}
              <button
                className="nx-context-control"
                type="button"
                aria-pressed={density === "compact"}
                onClick={() => setDensity((value) => (value === "comfortable" ? "compact" : "comfortable"))}
              >
                Density: {density === "comfortable" ? "Comfortable" : "Compact"}
              </button>
              <select
                className="nx-context-control"
                value={viewState}
                onChange={(event) => setViewState(event.target.value as PrototypeViewState)}
                aria-label="Preview page state"
                disabled={isLiveMasterDataPage}
              >
                <option value="data">State: Data</option>
                <option value="loading">State: Loading</option>
                <option value="empty">State: Empty</option>
                <option value="error">State: Error</option>
              </select>
            </div>
            <span className="nx-prototype-toolbar__note">
              {isFiscalPeriodPage
                ? "Company fiscal calendar API · PostgreSQL · audited date controls"
                : isCentralChartPage
                ? "Central reference API · PostgreSQL · no company posting"
                : isLiveMasterDataPage
                  ? "Company account API · PostgreSQL · approval required before use"
                  : "No APIs · no posting · no Demo Account data"}
            </span>
          </section>

          <div className="nx-content">
            {activeWorkspace === "identity" && identityContent ? (
              identityContent
            ) : (
              <>
                <ol className="nx-breadcrumbs" aria-label="Breadcrumb">
                  <li>
                    <button type="button" onClick={() => navigate("dashboard", currentRole.dashboardPageId)}>
                      Workspace
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => navigate(current.module.id, current.module.groups[0].pages[0].id)}
                    >
                      {current.module.shortLabel}
                    </button>
                  </li>
                  <li>{current.group.label}</li>
                  <li aria-current="page">{current.page.label}</li>
                </ol>
                <div className="nx-context-summary" role="note">
                  <span>
                    <b>{isLiveMasterDataPage ? "ERP" : currentCompany.shortName}</b>
                    {isCentralChartPage
                      ? "Central master data · no company selected"
                      : isLiveMasterDataPage
                        ? "Company scope shown in account or form"
                        : currentCompany.name}
                  </span>
                  <span>
                    <b>{isLiveMasterDataPage ? "AUTH" : currentRole.shortLabel}</b>
                    {isLiveMasterDataPage ? "Permissions enforced by API" : currentRole.label}
                  </span>
                  <span>
                    <b>{isLiveMasterDataPage ? "DB" : currentMode.shortLabel}</b>
                    {isLiveMasterDataPage ? "Persisted PostgreSQL records" : currentMode.description}
                  </span>
                </div>
                <ActionFeedbackProvider
                  onSuccess={(message) =>
                    pushToast(
                      "success",
                      isLiveFinanceChartPage ? "Finance updated successfully" : "Bank updated successfully",
                      message,
                    )
                  }
                >
                  <PrototypeContent
                    context={{
                      moduleId: current.module.id,
                      moduleLabel: current.module.label,
                      moduleCode: current.module.code,
                      moduleDescription: current.module.description,
                      pageLabel: current.page.label,
                      pageId: current.page.id,
                      archetype: current.page.archetype,
                      status: current.page.status,
                      mode: currentMode.label,
                      role: currentRole.label,
                      roleId: currentRole.id,
                      companyMode,
                      recordRef: route.recordRef,
                    }}
                    rows={rows}
                    viewState={viewState}
                    onAction={handleAction}
                    onOpenPage={(pageId) => navigate(current.module.id, pageId)}
                    onNavigate={(moduleId, pageId, recordRef, options) =>
                      navigate(moduleId, pageId, recordRef, options)
                    }
                    onPaymentEntryDirtyChange={setPaymentEntryDirty}
                    onReceiptEntryDirtyChange={setPaymentEntryDirty}
                  />
                </ActionFeedbackProvider>
              </>
            )}
          </div>
        </main>
      </div>

      {drawerModule ? (
        <aside className="nx-submenu-drawer" aria-label={`${drawerModule.label} pages`}>
          <div className="nx-submenu-drawer__header">
            <div>
              <h2>{drawerModule.label}</h2>
              <p>{pageCount(drawerModule)} prototype screens</p>
            </div>
            <button
              className="nx-icon-button"
              type="button"
              aria-label="Close module pages"
              onClick={() => setDrawerModuleId(null)}
            >
              ×
            </button>
          </div>
          <div className="nx-submenu-drawer__body">
            {drawerModule.groups.map((group) => (
              <section className="nx-submenu-drawer__group" key={group.id}>
                <h3 className="nx-submenu-drawer__group-title">{group.label}</h3>
                {group.pages.map((page) => (
                  <button
                    className="nx-submenu-drawer__link"
                    aria-current={page.id === current.page.id ? "page" : undefined}
                    type="button"
                    key={page.id}
                    onClick={() => navigate(drawerModule.id, page.id)}
                  >
                    <span>{page.label}</span>
                    <small>{page.archetype}</small>
                  </button>
                ))}
              </section>
            ))}
          </div>
        </aside>
      ) : null}

      <NexoraIntelligenceLayer
        surface={intelligenceSurface}
        roleId={currentRole.id}
        roleLabel={currentRole.label}
        companyName={currentCompany.name}
        moduleLabel={current.module.label}
        pageLabel={current.page.label}
        onClose={() => setIntelligenceSurface(null)}
        onNavigate={navigate}
        onAction={handleAction}
      />

      {searchOpen ? (
        <div
          className="nx-modal-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setSearchOpen(false);
          }}
        >
          <section
            className="nx-modal nx-modal--wide"
            role="dialog"
            aria-modal="true"
            aria-label="Global prototype search"
          >
            <div className="nx-modal__header">
              <div>
                <h2>Search pages and transactions</h2>
                <p>Type any reference, party, amount, status, page or module</p>
              </div>
              <button
                className="nx-icon-button"
                type="button"
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
              >
                ×
              </button>
            </div>
            <div className="nx-modal__body">
              <label className="nx-command-search" htmlFor="erp-command-search">
                <span>⌕</span>
                <Input
                  id="erp-command-search"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="Try ‘PAY-2026-0418’, ‘Atlas’, ‘approved’, ‘invoice’ or ‘nominals’"
                />
              </label>
              <div className="nx-command-results">
                {searchResults.map((result) => (
                  <button
                    type="button"
                    key={result.key}
                    onClick={() =>
                      navigate(result.moduleId, result.pageId, result.kind === "record" ? result.recordRef : undefined)
                    }
                  >
                    <b>{result.kind === "record" ? "TX" : result.moduleCode}</b>
                    <span>
                      <strong>{result.label}</strong>
                      <small>
                        {result.context}
                        <br />
                        {result.meta}
                      </small>
                    </span>
                    <em>{result.kind === "record" ? "Transaction" : "Page"}</em>
                  </button>
                ))}
              </div>
              {searchQuery.trim() && searchResults.length === 0 ? (
                <div className="nx-command-empty">
                  <strong>No matching page or transaction</strong>
                  <span>Try a shorter reference, party name, status or module name.</span>
                </div>
              ) : null}
            </div>
            <div className="nx-modal__footer">
              <span className="nx-modal-note">
                Ctrl/Cmd + K to open · type any word · select a result to drill down
              </span>
              <Button variant="outline" type="button" onClick={() => setSearchOpen(false)}>
                Close
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {dialog?.type === "confirm" ? (
        <div className="nx-modal-layer">
          <section
            className="nx-modal nx-modal--confirm"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-title"
          >
            <div className="nx-modal__body nx-confirmation">
              <span className="nx-confirmation__symbol">{dialog.action.slice(0, 2).toUpperCase()}</span>
              <h2 id="confirm-title">Simulate “{dialog.action}”?</h2>
              <p>
                This changes only the temporary visual state for {dialog.subject}. It will not call an API, post
                accounting, or modify Demo data.
              </p>
            </div>
            <div className="nx-modal__footer">
              <Button variant="outline" type="button" onClick={() => setDialog(null)}>
                Cancel
              </Button>
              <Button
                variant={dialog.action === "Reject" || dialog.action === "Delete" ? "destructive" : "default"}
                type="button"
                onClick={confirmAction}
              >
                Confirm mock action
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {dialog?.type === "notifications" ? (
        <div
          className="nx-modal-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDialog(null);
          }}
        >
          <section className="nx-modal" role="dialog" aria-modal="true" aria-label="Prototype notifications">
            <div className="nx-modal__header">
              <div>
                <h2>Notification centre</h2>
                <p>Realistic local reminders and exceptions</p>
              </div>
              <button
                className="nx-icon-button"
                type="button"
                aria-label="Close notifications"
                onClick={() => setDialog(null)}
              >
                ×
              </button>
            </div>
            <div className="nx-modal__body">
              <div className="nx-notification-list">
                {notifications.map((notification) => (
                  <button
                    type="button"
                    key={notification.id}
                    onClick={() => {
                      setDialog(null);
                      pushToast("info", notification.title, notification.message);
                    }}
                  >
                    <i className={`nx-notification-dot nx-notification-dot--${notification.tone}`} />
                    <span>
                      <strong>{notification.title}</strong>
                      <small>{notification.message}</small>
                      <em>
                        {notification.type} · {notification.read ? "Read" : "New"}
                      </em>
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="nx-modal__footer">
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setDialog(null);
                  navigate("notifications", "notification-centre");
                }}
              >
                Open notification centre
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      {dialog?.type === "help" ? (
        <div
          className="nx-modal-layer"
          role="presentation"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setDialog(null);
          }}
        >
          <section className="nx-modal" role="dialog" aria-modal="true" aria-label="Prototype guide">
            <div className="nx-modal__header">
              <div>
                <h2>How to review this prototype</h2>
                <p>A safe visual product tour — not an ERP transaction system</p>
              </div>
              <button className="nx-icon-button" type="button" aria-label="Close help" onClick={() => setDialog(null)}>
                ×
              </button>
            </div>
            <div className="nx-modal__body">
              <ol className="nx-help-list">
                <li>
                  <b>1</b>
                  <span>
                    <strong>Explore every module</strong>
                    <small>Open sidebar groups and pages, or use Ctrl/Cmd + K.</small>
                  </span>
                </li>
                <li>
                  <b>2</b>
                  <span>
                    <strong>Compare navigation variants</strong>
                    <small>Choose a company and role, then turn scoped menus on or off.</small>
                  </span>
                </li>
                <li>
                  <b>3</b>
                  <span>
                    <strong>Review interaction states</strong>
                    <small>
                      Try forms, lists, approvals, exports, confirmation dialogs, loading, empty and error states.
                    </small>
                  </span>
                </li>
                <li>
                  <b>4</b>
                  <span>
                    <strong>Treat all data as invented</strong>
                    <small>No screen is connected to production, the Demo Account, APIs or databases.</small>
                  </span>
                </li>
              </ol>
              <div className="nx-help-keys">
                <span className="nx-help-keys__label">Keyboard</span>
                <dl>
                  <div>
                    <dt>
                      <kbd>Ctrl</kbd>
                      <kbd>K</kbd>
                    </dt>
                    <dd>Open global search</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>/</kbd>
                    </dt>
                    <dd>Jump to search</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>?</kbd>
                    </dt>
                    <dd>Open this guide</dd>
                  </div>
                  <div>
                    <dt>
                      <kbd>Esc</kbd>
                    </dt>
                    <dd>Close search, dialog or drawer</dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="nx-modal__footer">
              <Button type="button" onClick={() => setDialog(null)}>
                Start reviewing
              </Button>
            </div>
          </section>
        </div>
      ) : null}

      <div className="nx-toast-stack" role="region" aria-label="Action notifications" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`nx-toast nx-toast--${toast.tone}`} key={toast.id}>
            <span className="nx-toast__symbol">
              {toast.tone === "success" ? "OK" : toast.tone === "warning" ? "!" : "i"}
            </span>
            <span>
              <strong>{toast.title}</strong>
              <p>{toast.message}</p>
            </span>
            <button
              className="nx-toast__close"
              type="button"
              aria-label="Dismiss message"
              onClick={() => setToasts((previous) => previous.filter((item) => item.id !== toast.id))}
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
