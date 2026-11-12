"use client";
import { inActiveCompany } from "@/lib/session/active-company";
import { WorkForm, WorkFormLayout } from "@/shared/ui/work-form";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeFinanceHierarchyRequest,
  CreateFinanceHierarchyRequest,
  FinanceHierarchyItem,
  FinanceNominalOptions,
  FinanceNominalSummary,
} from "@nexora/contracts";
import { FolderTree, LibraryBig, Pencil, Plus, RefreshCw, Rows3, Search } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api/generated";
import { useSession } from "@/lib/session/session-provider";
import { useActionFeedback } from "@/shared/ui/action-feedback";
import { SuperAdminOverrideWarning } from "@/shared/ui/super-admin-override-warning";
import { FinanceMasterRow, FinanceNominalRow } from "../components/finance-master-row";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50";

type HierarchyKind = "category" | "section";
type HierarchyState = NonNullable<FinanceHierarchyItem["state"]>;
const hierarchyState = (row: FinanceHierarchyItem) => row.state ?? row.status;
const needsReview = (row: FinanceHierarchyItem) =>
  ["draft", "pending_approval", "rejected"].includes(hierarchyState(row));
type DirectoryKind = "categories" | "sections";
type NominalPage = {
  items: FinanceNominalSummary[];
  cursor: string | null;
  loading: boolean;
  error: string;
};
type HierarchyRouteReference = { companyId?: string; headerId?: string };

function message(error: unknown, fallback: string) {
  return error instanceof ApiError ? error.message : fallback;
}

function hierarchyAuthority(session: ReturnType<typeof useSession>["session"]) {
  const permissions = session?.user.permissions ?? [];
  return {
    permissions,
    canRead: permissions.includes("finance.nominal.read"),
    canManage:
      !!session?.user.roles.includes("super_administrator") &&
      permissions.includes("platform.approval.override") &&
      !session.impersonation,
  };
}

function sortHierarchy(rows: FinanceHierarchyItem[]) {
  const typeOrder: Record<FinanceHierarchyItem["type"], number> = {
    asset: 0,
    liability: 1,
    equity: 2,
    revenue: 3,
    expense: 4,
  };
  return [...rows].sort((left, right) => {
    const leftRank = left.parent_id ? 1 : 0;
    const rightRank = right.parent_id ? 1 : 0;
    return (
      leftRank - rightRank ||
      typeOrder[left.type] - typeOrder[right.type] ||
      (left.parent_id
        ? left.code.localeCompare(right.code, undefined, { numeric: true })
        : left.name.localeCompare(right.name)) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function encodeHierarchyRouteReference(reference: HierarchyRouteReference) {
  return JSON.stringify(reference);
}

function decodeHierarchyRouteReference(value?: string): HierarchyRouteReference {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    const candidate = parsed as Record<string, unknown>;
    return {
      ...(typeof candidate.companyId === "string" ? { companyId: candidate.companyId } : {}),
      ...(typeof candidate.headerId === "string" ? { headerId: candidate.headerId } : {}),
    };
  } catch {
    return {};
  }
}

async function loadHierarchyPages(
  list: (query: string) => Promise<{ items: FinanceHierarchyItem[]; next_cursor: string | null }>,
  companyId: string,
) {
  const rows: FinanceHierarchyItem[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 25; page += 1) {
    const query = new URLSearchParams({ company_id: companyId, limit: "100" });
    if (cursor) query.set("cursor", cursor);
    const result = await list(`?${query.toString()}`);
    for (const item of result.items) if (!rows.some((existing) => existing.id === item.id)) rows.push(item);
    cursor = result.next_cursor;
    if (!cursor) return sortHierarchy(rows);
  }
  throw new Error("The hierarchy exceeds the supported workspace page bound.");
}

type DirectoryProps = {
  onCreate: (companyId?: string) => void;
  onEdit: (companyId: string, headerId: string, kind: HierarchyKind) => void;
  onOpenNominal: (nominalId: string) => void;
  onEditNominal?: (nominalId: string) => void;
  onStandardChart: () => void;
};

export function FinanceCategories(props: DirectoryProps) {
  return <FinanceHierarchyDirectory kind="categories" {...props} />;
}

export function FinanceSections(props: DirectoryProps) {
  return <FinanceHierarchyDirectory kind="sections" {...props} />;
}

function FinanceHierarchyDirectory({
  kind,
  onCreate,
  onEdit,
  onOpenNominal,
  onEditNominal,
  onStandardChart,
}: DirectoryProps & { kind: DirectoryKind }) {
  const { api, session, loading: sessionLoading } = useSession();
  const { permissions, canRead, canManage } = hierarchyAuthority(session);
  const [options, setOptions] = useState<FinanceNominalOptions | null>(null);
  const [company, setCompany] = useState("");
  const [rows, setRows] = useState<FinanceHierarchyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<"" | HierarchyState>("");
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const [nominals, setNominals] = useState<Record<string, NominalPage>>({});
  const [refresh, setRefresh] = useState(0);
  const request = useRef(0);
  const nominalRequest = useRef(0);

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listFinanceNominalOptions("")
      .then((options) => {
        if (!active) return;
        // Only the company chosen at sign-in is in scope; the API rejects any other company.
        const result = { ...options, companies: inActiveCompany({ items: options.companies }).items };
        setOptions(result);
        setCompany((current) =>
          result.companies.some((candidate) => candidate.id === current)
            ? current
            : (result.companies.find((candidate) => candidate.id === result.selected_company_id)?.id ??
              result.companies[0]?.id ??
              ""),
        );
      })
      .catch((cause) => {
        if (active) setError(message(cause, "Company directory unavailable."));
      });
    return () => {
      active = false;
    };
  }, [api, canRead]);

  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const token = ++request.current;
    nominalRequest.current += 1;
    setLoading(true);
    setError("");
    setRows([]);
    setExpandedCategories(new Set());
    setExpandedSections(new Set());
    setNominals({});
    loadHierarchyPages(api.listFinanceHierarchy.bind(api), company)
      .then((result) => {
        if (active && token === request.current) setRows(result);
      })
      .catch((cause) => {
        if (active && token === request.current) setError(message(cause, "Hierarchy directory unavailable."));
      })
      .finally(() => {
        if (active && token === request.current) setLoading(false);
      });
    return () => {
      active = false;
      nominalRequest.current += 1;
    };
  }, [api, canRead, company, refresh]);

  useEffect(() => {
    nominalRequest.current += 1;
    setNominals({});
    setExpandedSections(new Set());
  }, [search]);

  const categories = useMemo(() => rows.filter((row) => !row.parent_id), [rows]);
  const sectionsByCategory = useMemo(() => {
    const grouped = new Map<string, FinanceHierarchyItem[]>();
    for (const row of rows) {
      if (!row.parent_id) continue;
      grouped.set(row.parent_id, [...(grouped.get(row.parent_id) ?? []), row]);
    }
    for (const sections of grouped.values())
      sections.sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true }));
    return grouped;
  }, [rows]);
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleCategories = categories.filter((category) => {
    const sections = sectionsByCategory.get(category.id) ?? [];
    const statusMatch =
      !status || hierarchyState(category) === status || sections.some((section) => hierarchyState(section) === status);
    const searchMatch =
      !normalizedSearch ||
      category.name.toLocaleLowerCase().includes(normalizedSearch) ||
      category.code.toLocaleLowerCase().includes(normalizedSearch) ||
      sections.some(
        (section) =>
          section.name.toLocaleLowerCase().includes(normalizedSearch) ||
          section.code.toLocaleLowerCase().includes(normalizedSearch),
      );
    return statusMatch && searchMatch;
  });

  const loadNominals = useCallback(
    async (sectionId: string, append = false, retry = false) => {
      const current = nominals[sectionId];
      if (current?.loading || (!append && current && !retry)) return;
      const token = nominalRequest.current;
      setNominals((pages) => ({
        ...pages,
        [sectionId]: {
          items: append ? (pages[sectionId]?.items ?? []) : [],
          cursor: pages[sectionId]?.cursor ?? null,
          loading: true,
          error: "",
        },
      }));
      try {
        const query = new URLSearchParams({
          company_id: company,
          section_id: sectionId,
          sort_by: "code",
          sort_direction: "asc",
          limit: "50",
        });
        if (append && current?.cursor) query.set("cursor", current.cursor);
        if (normalizedSearch) query.set("search", search.trim());
        const result = await api.listFinanceNominals(`?${query.toString()}`);
        if (token !== nominalRequest.current) return;
        setNominals((pages) => ({
          ...pages,
          [sectionId]: {
            items: append
              ? [
                  ...(pages[sectionId]?.items ?? []),
                  ...result.items.filter(
                    (item) => !pages[sectionId]?.items.some((existing) => existing.id === item.id),
                  ),
                ]
              : result.items,
            cursor: result.next_cursor,
            loading: false,
            error: "",
          },
        }));
      } catch (cause) {
        if (token !== nominalRequest.current) return;
        setNominals((pages) => ({
          ...pages,
          [sectionId]: {
            items: pages[sectionId]?.items ?? [],
            cursor: pages[sectionId]?.cursor ?? null,
            loading: false,
            error: message(cause, "Nominals could not be loaded."),
          },
        }));
      }
    },
    [api, company, nominals, normalizedSearch, search],
  );

  function toggleCategory(categoryId: string) {
    setExpandedCategories((current) => {
      const next = new Set(current);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      return next;
    });
  }

  function toggleSection(sectionId: string) {
    const opening = !expandedSections.has(sectionId);
    setExpandedSections((current) => {
      const next = new Set(current);
      if (opening) next.add(sectionId);
      else next.delete(sectionId);
      return next;
    });
    if (opening) void loadNominals(sectionId);
  }

  if (sessionLoading) return <p role="status">Loading Chart of Accounts workspace…</p>;
  if (!canRead)
    return (
      <Alert>
        <AlertDescription>Permission required: finance.nominal.read.</AlertDescription>
      </Alert>
    );

  return (
    <div className="flex flex-col gap-5">
      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="mt-0.5 rounded-lg border border-border bg-background p-2 text-primary">
                {kind === "categories" ? <FolderTree className="size-5" /> : <Rows3 className="size-5" />}
              </div>
              <div>
                <CardTitle>{kind === "categories" ? "Categories" : "Sections"}</CardTitle>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onStandardChart}>
                <LibraryBig className="size-4" />
                Standard chart setup
              </Button>
              <Button
                type="button"
                onClick={() => onCreate(company || undefined)}
                disabled={!company || !canManage || !permissions.includes("finance.nominal.create")}
              >
                <Plus className="size-4" />
                Add {kind === "categories" ? "Category" : "Section"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-5 pt-5">
          <div className="grid gap-3 md:grid-cols-[minmax(14rem,1fr)_minmax(16rem,2fr)_minmax(10rem,0.7fr)_auto]">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Company
              <select
                aria-label="Hierarchy company"
                className={selectClass}
                value={company}
                disabled={loading}
                onChange={(event) => {
                  request.current += 1;
                  nominalRequest.current += 1;
                  setRows([]);
                  setExpandedCategories(new Set());
                  setExpandedSections(new Set());
                  setNominals({});
                  setError("");
                  setLoading(!!event.target.value);
                  setCompany(event.target.value);
                }}
              >
                <option value="">Select company</option>
                {options?.companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor={`${kind}-search`}>
              Search
              <span className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id={`${kind}-search`}
                  aria-label={kind === "categories" ? "Search Categories" : "Search Sections"}
                  className="pl-9"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Name or code"
                />
              </span>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              Status
              <select
                aria-label="Hierarchy status"
                className={selectClass}
                value={status}
                onChange={(event) => setStatus(event.target.value as "" | HierarchyState)}
              >
                <option value="">All statuses</option>
                <option value="draft">Draft</option>
                <option value="pending_approval">Pending approval</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="rejected">Rejected</option>
              </select>
            </label>
            <div className="flex items-end">
              <Button
                type="button"
                variant="outline"
                disabled={loading || !company}
                onClick={() => setRefresh((value) => value + 1)}
              >
                <RefreshCw className={`size-4 ${loading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </div>

          {!canManage && (
            <Alert>
              <AlertDescription>
                Read-only. Only a global Super Admin with live company authority can change Chart of Accounts masters.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {loading && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading company hierarchy…
            </p>
          )}
          {!loading && !error && company && !rows.length && (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="font-semibold">No company hierarchy is available.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Use Standard chart setup to review and adopt the approved catalogue, or add a Category manually.
              </p>
            </div>
          )}
          {!loading && !error && rows.length > 0 && visibleCategories.length === 0 && (
            <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No Categories or Sections match the current filters.
            </p>
          )}

          {kind === "categories" ? (
            <div className="flex flex-col gap-1" aria-label="Category hierarchy">
              {visibleCategories.map((category) => {
                const expanded = expandedCategories.has(category.id);
                const sections = sectionsByCategory.get(category.id) ?? [];
                return (
                  <FinanceMasterRow
                    key={category.id}
                    title={category.name}
                    subtitle={<span className="capitalize">{category.type}</span>}
                    expanded={expanded}
                    controls={`category-${category.id}`}
                    onOpen={() => toggleCategory(category.id)}
                    metadata={
                      <>
                        <Badge variant="outline">{category.section_count} Sections</Badge>
                        <Badge variant="outline">{category.nominal_count} Nominals</Badge>
                        <Badge variant="outline">{hierarchyState(category).replaceAll("_", " ")}</Badge>
                      </>
                    }
                    actions={
                      canManage &&
                      (needsReview(category) || permissions.includes("finance.nominal.update")) && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => onEdit(company, category.id, "category")}
                        >
                          <Pencil data-icon="inline-start" />
                          {needsReview(category) ? "Review" : "Edit"}
                        </Button>
                      )
                    }
                  >
                    {expanded && (
                      <div id={`category-${category.id}`} className="border-t border-border">
                        {!sections.length ? (
                          <p className="p-5 text-sm text-muted-foreground">This Category has no Sections.</p>
                        ) : (
                          <div className="flex flex-col gap-1 p-2 sm:pl-5">
                            {sections.map((section) => (
                              <SectionDisclosure
                                key={section.id}
                                section={section}
                                expanded={expandedSections.has(section.id)}
                                nominalPage={nominals[section.id]}
                                canEdit={canManage && permissions.includes("finance.nominal.update")}
                                canReview={canManage}
                                onToggle={() => toggleSection(section.id)}
                                onEdit={() => onEdit(company, section.id, "section")}
                                onMore={() => void loadNominals(section.id, true)}
                                onRetry={() => void loadNominals(section.id, false, true)}
                                onOpenNominal={onOpenNominal}
                                onEditNominal={onEditNominal}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </FinanceMasterRow>
                );
              })}
            </div>
          ) : (
            <SectionsDirectory
              categories={visibleCategories}
              sectionsByCategory={sectionsByCategory}
              status={status}
              search={normalizedSearch}
              company={company}
              canEdit={canManage && permissions.includes("finance.nominal.update")}
              canReview={canManage}
              onEdit={onEdit}
              expandedSections={expandedSections}
              nominals={nominals}
              onToggle={toggleSection}
              onMore={(id) => void loadNominals(id, true)}
              onRetry={(id) => void loadNominals(id, false, true)}
              onOpenNominal={onOpenNominal}
              onEditNominal={onEditNominal}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SectionsDirectory({
  categories,
  sectionsByCategory,
  status,
  search,
  company,
  canEdit,
  canReview,
  onEdit,
  expandedSections,
  nominals,
  onToggle,
  onMore,
  onRetry,
  onOpenNominal,
  onEditNominal,
}: {
  categories: FinanceHierarchyItem[];
  sectionsByCategory: Map<string, FinanceHierarchyItem[]>;
  status: "" | HierarchyState;
  search: string;
  company: string;
  canEdit: boolean;
  canReview: boolean;
  onEdit: DirectoryProps["onEdit"];
  expandedSections: Set<string>;
  nominals: Record<string, NominalPage>;
  onToggle: (id: string) => void;
  onMore: (id: string) => void;
  onRetry: (id: string) => void;
  onOpenNominal: (id: string) => void;
  onEditNominal?: (id: string) => void;
}) {
  const groups = categories
    .map((category) => ({
      category,
      sections: (sectionsByCategory.get(category.id) ?? []).filter(
        (section) =>
          (!status || hierarchyState(section) === status) &&
          (!search ||
            category.name.toLocaleLowerCase().includes(search) ||
            category.code.toLocaleLowerCase().includes(search) ||
            section.name.toLocaleLowerCase().includes(search) ||
            section.code.toLocaleLowerCase().includes(search)),
      ),
    }))
    .filter((group) => group.sections.length > 0);
  return (
    <div className="flex flex-col gap-5" aria-label="Section directory">
      {!groups.length && <p className="text-sm text-muted-foreground">No Sections match the current filters.</p>}
      {groups.map(({ category, sections }) => (
        <section key={category.id} className="flex flex-col gap-1" aria-label={category.name}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-bold text-foreground">{category.name}</h2>
            <Badge variant="outline">
              {sections.length} of {category.section_count} Sections
            </Badge>
          </div>
          {sections.map((section) => (
            <SectionDisclosure
              key={section.id}
              section={section}
              expanded={expandedSections.has(section.id)}
              nominalPage={nominals[section.id]}
              canEdit={canEdit}
              canReview={canReview}
              onToggle={() => onToggle(section.id)}
              onEdit={() => onEdit(company, section.id, "section")}
              onMore={() => onMore(section.id)}
              onRetry={() => onRetry(section.id)}
              onOpenNominal={onOpenNominal}
              onEditNominal={onEditNominal}
            />
          ))}
        </section>
      ))}
    </div>
  );
}

function SectionDisclosure({
  section,
  expanded,
  nominalPage,
  canEdit,
  canReview,
  onToggle,
  onEdit,
  onMore,
  onRetry,
  onOpenNominal,
  onEditNominal,
}: {
  section: FinanceHierarchyItem;
  expanded: boolean;
  nominalPage?: NominalPage;
  canEdit: boolean;
  canReview: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onMore: () => void;
  onRetry: () => void;
  onOpenNominal: (nominalId: string) => void;
  onEditNominal?: (nominalId: string) => void;
}) {
  return (
    <FinanceMasterRow
      title={section.name}
      subtitle={
        <>
          <span className="font-mono">{section.code}</span> · <span className="capitalize">{section.type}</span>
        </>
      }
      expanded={expanded}
      controls={`section-${section.id}`}
      onOpen={onToggle}
      metadata={
        <>
          <Badge variant="outline">{section.nominal_count} Nominals</Badge>
          <Badge variant="outline">{hierarchyState(section).replaceAll("_", " ")}</Badge>
          <Badge variant="outline">v{section.version}</Badge>
        </>
      }
      actions={
        (needsReview(section) ? canReview : canEdit) && (
          <Button type="button" size="sm" variant="outline" onClick={onEdit}>
            <Pencil data-icon="inline-start" />
            {needsReview(section) ? "Review" : "Edit"}
          </Button>
        )
      }
    >
      {expanded && (
        <div id={`section-${section.id}`} className="flex flex-col gap-1 border-t border-border p-2 sm:pl-5">
          {nominalPage?.loading && !nominalPage.items.length && (
            <p role="status" className="text-sm text-muted-foreground">
              Loading Nominals…
            </p>
          )}
          {nominalPage?.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                <span>{nominalPage.error}</span>
                <Button type="button" size="sm" variant="outline" onClick={onRetry}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {nominalPage && !nominalPage.loading && !nominalPage.error && !nominalPage.items.length && (
            <p className="text-sm text-muted-foreground">No Nominals are available in this Section.</p>
          )}
          {nominalPage?.items.map((nominal) => (
            <FinanceNominalRow
              key={nominal.id}
              nominal={nominal}
              onOpen={onOpenNominal}
              onEdit={
                canEdit && !["pending_approval", "closed", "rejected"].includes(nominal.state ?? nominal.account_status)
                  ? onEditNominal
                  : undefined
              }
            />
          ))}
          {nominalPage?.cursor && (
            <Button
              type="button"
              className="self-start"
              variant="outline"
              size="sm"
              disabled={nominalPage.loading}
              onClick={onMore}
            >
              {nominalPage.loading ? "Loading…" : "Load more Nominals"}
            </Button>
          )}
        </div>
      )}
    </FinanceMasterRow>
  );
}

export function FinanceHierarchyForm({
  kind,
  recordRef,
  onSaved,
  onCancel,
  onDirtyChange,
}: {
  kind: HierarchyKind;
  recordRef?: string;
  onSaved: () => void;
  onCancel: () => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const reference = useMemo(() => decodeHierarchyRouteReference(recordRef), [recordRef]);
  const { api, session, csrfToken, loading: sessionLoading } = useSession();
  const notify = useActionFeedback();
  const { permissions, canRead, canManage } = hierarchyAuthority(session);
  const [options, setOptions] = useState<FinanceNominalOptions | null>(null);
  const [company, setCompany] = useState(reference.companyId ?? "");
  const [rows, setRows] = useState<FinanceHierarchyItem[]>([]);
  const [selected, setSelected] = useState<FinanceHierarchyItem | null>(null);
  const [name, setName] = useState("");
  const [type, setType] = useState<FinanceHierarchyItem["type"]>("asset");
  const [parent, setParent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const retry = useRef<{ fingerprint: string; key: string } | null>(null);
  const submissionRetry = useRef<{ fingerprint: string; key: string } | null>(null);
  const lock = useRef(false);

  function markDirty() {
    setDirty(true);
    onDirtyChange?.(true);
  }

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    api
      .listFinanceNominalOptions("")
      .then((options) => {
        if (!active) return;
        // Only the company chosen at sign-in is in scope; the API rejects any other company.
        const result = { ...options, companies: inActiveCompany({ items: options.companies }).items };
        setOptions(result);
        setCompany((current) =>
          result.companies.some((candidate) => candidate.id === current)
            ? current
            : (result.companies.find((candidate) => candidate.id === result.selected_company_id)?.id ??
              result.companies[0]?.id ??
              ""),
        );
        if (!result.companies.length) setLoading(false);
      })
      .catch((cause) => {
        if (active) {
          setError(message(cause, "Company directory unavailable."));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [api, canRead]);

  useEffect(() => {
    if (!canRead || !company) return;
    let active = true;
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError("");
      loadHierarchyPages(api.listFinanceHierarchy.bind(api), company)
        .then((result) => {
          if (!active) return;
          setRows(result);
          if (!reference.headerId) {
            setSelected(null);
            setName("");
            setParent("");
            setType("asset");
            return;
          }
          const item = result.find((candidate) => candidate.id === reference.headerId);
          if (!item || (kind === "category" ? !!item.parent_id : !item.parent_id)) {
            setError(`The requested ${kind} was not found in this company.`);
            return;
          }
          setSelected(item);
          setName(item.name);
          setParent(item.parent_id ?? "");
          setType(item.type);
        })
        .catch((cause) => {
          if (active) setError(message(cause, "Hierarchy master data unavailable."));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 0);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [api, canRead, company, kind, reference.headerId]);

  async function save(action?: ChangeFinanceHierarchyRequest["action"]) {
    const permission = selected
      ? action
        ? action === "submit"
          ? "finance.nominal.submit"
          : action === "approve" || action === "reject"
            ? "finance.nominal.approve"
            : "finance.nominal.status"
        : "finance.nominal.update"
      : "finance.nominal.create";
    if (!canManage || !permissions.includes(permission) || !company || lock.current) return;
    if (action && dirty) {
      setError("Save your changes before submitting or deciding this record.");
      return;
    }
    if (reference.headerId && !selected) return;
    const category = rows.find((row) => row.id === parent && !row.parent_id);
    if (kind === "section" && !selected && !category) {
      setError("Choose an active Category.");
      return;
    }
    if (
      action === "approve" &&
      selected &&
      hierarchyState(selected) === "draft" &&
      !permissions.includes("finance.nominal.submit")
    )
      return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      let current = selected;
      if (action === "approve" && current && hierarchyState(current) === "draft") {
        const payload = { expected_version: current.version, action: "submit" as const };
        const fingerprint = JSON.stringify({ company, id: current.id, payload });
        if (submissionRetry.current?.fingerprint !== fingerprint)
          submissionRetry.current = { fingerprint, key: `coa-submit-${crypto.randomUUID()}` };
        current = await api.changeFinanceHierarchy(
          current.id,
          company,
          payload,
          csrfToken(),
          submissionRetry.current.key,
        );
        setSelected(current);
      }
      const input: CreateFinanceHierarchyRequest | ChangeFinanceHierarchyRequest = current
        ? {
            expected_version: current.version,
            ...(action
              ? { action, ...(action === "reject" ? { reason: rejectionReason.trim() } : {}) }
              : { name: name.trim() }),
          }
        : {
            company_id: company,
            name: name.trim(),
            type: kind === "section" ? category!.type : type,
            ...(kind === "section" ? { parent_id: parent } : {}),
          };
      const fingerprint = JSON.stringify({ company, id: current?.id, input });
      if (retry.current?.fingerprint !== fingerprint)
        retry.current = { fingerprint, key: `coa-header-${crypto.randomUUID()}` };
      if ("company_id" in input) await api.createFinanceHierarchy(input, csrfToken(), retry.current.key);
      else await api.changeFinanceHierarchy(current!.id, company, input, csrfToken(), retry.current.key);
      notify(
        `${kind === "category" ? "Category" : "Section"} ${
          action === "approve"
            ? "approved"
            : action === "reject"
              ? "rejected"
              : action === "submit"
                ? "submitted for approval"
                : action === "deactivate"
                  ? "deactivated"
                  : action === "activate"
                    ? "activated"
                    : selected
                      ? "updated"
                      : "saved as draft"
        } successfully. No financial posting was performed.`,
      );
      setDirty(false);
      onDirtyChange?.(false);
      onSaved();
    } catch (cause) {
      setError(message(cause, "Master change failed. Retry the same request or refresh after a conflict."));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  if (sessionLoading || loading) return <WorkFormLayout><p role="status">Loading {kind} master data…</p></WorkFormLayout>;
  if (!canRead)
    return (
      <WorkFormLayout><Alert>
        <AlertDescription>Permission required: finance.nominal.read.</AlertDescription>
      </Alert></WorkFormLayout>
    );
  if (!canManage)
    return (
      <WorkFormLayout><Alert>
        <AlertDescription>
          Only a global Super Admin with live company authority can manage Chart of Accounts masters.
        </AlertDescription>
      </Alert></WorkFormLayout>
    );

  const categories = rows.filter((row) => !row.parent_id && row.status === "active");
  const state = selected ? hierarchyState(selected) : "draft";
  const editable =
    !["pending_approval", "rejected"].includes(state) &&
    permissions.includes(selected ? "finance.nominal.update" : "finance.nominal.create");
  return (
    <WorkFormLayout><Card>
      <CardHeader className="border-b border-border bg-muted/30">
        <CardTitle>
          {selected ? (needsReview(selected) ? "" : "Edit") : "New"} {kind === "category" ? "Category" : "Section"}
        </CardTitle>
        <CardDescription>Company Chart of Accounts · Audited master-data change · No financial posting</CardDescription>
      </CardHeader>
      <CardContent className="pt-6">
        {selected && (
          <Badge variant="outline" className="mb-4">
            {state.replaceAll("_", " ")}
          </Badge>
        )}
        {error && (
          <Alert variant="destructive" role="alert" className="mb-5">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {reference.headerId && !selected ? (
          <Button type="button" variant="outline" onClick={onCancel}>
            Close
          </Button>
        ) : (
          <WorkForm
            className="grid gap-5 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (editable) void save();
            }}
          >
            <div className="flex flex-col gap-2">
              <Label htmlFor="hierarchy-company">Company</Label>
              <select
                id="hierarchy-company"
                className={selectClass}
                value={company}
                disabled={busy || !!selected}
                onChange={(event) => {
                  setCompany(event.target.value);
                  markDirty();
                }}
                required
              >
                <option value="">Select company</option>
                {options?.companies.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.code} · {item.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="hierarchy-code">{kind === "category" ? "Category code" : "Section code"}</Label>
              <Input
                id="hierarchy-code"
                value={
                  selected?.code ??
                  (kind === "category" ? "CAT-### · Generated when you save" : "Generated from Category when you save")
                }
                readOnly
              />
            </div>
            <div className="flex flex-col gap-2 md:col-span-2">
              <Label htmlFor="hierarchy-name">{kind === "category" ? "Category" : "Section"} name</Label>
              <Input
                id="hierarchy-name"
                value={name}
                maxLength={160}
                required
                disabled={busy || !editable}
                onChange={(event) => {
                  setName(event.target.value);
                  markDirty();
                }}
              />
            </div>
            {kind === "category" ? (
              <div className="flex flex-col gap-2">
                <Label htmlFor="hierarchy-type">Accounting type</Label>
                <select
                  id="hierarchy-type"
                  className={selectClass}
                  value={type}
                  disabled={busy || !!selected}
                  onChange={(event) => {
                    setType(event.target.value as FinanceHierarchyItem["type"]);
                    markDirty();
                  }}
                >
                  <option value="asset">Asset</option>
                  <option value="liability">Liability</option>
                  <option value="equity">Capital (Equity)</option>
                  <option value="revenue">Revenue</option>
                  <option value="expense">Expense</option>
                </select>
              </div>
            ) : (
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="hierarchy-parent">Category</Label>
                <select
                  id="hierarchy-parent"
                  className={selectClass}
                  value={parent}
                  required
                  disabled={busy || !!selected}
                  onChange={(event) => {
                    setParent(event.target.value);
                    markDirty();
                  }}
                >
                  <option value="">Select active Category</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name} · {category.type}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="rounded-lg border border-border bg-muted/30 p-4 text-sm text-muted-foreground md:col-span-2">
              Codes are allocated automatically when you save. Codes, parent Category, and accounting type are immutable
              after creation. Existing dependent masters cannot be deactivated. Saving changes master data only; it
              never posts a financial transaction.
              {state === "draft" && " New Categories and Sections remain inactive until submitted and approved."}
            </div>
            {state === "pending_approval" && selected?.self_decision_requires_override && (
              <div className="md:col-span-2">
                <SuperAdminOverrideWarning reasonRequired={false} />
              </div>
            )}
            {state === "pending_approval" && permissions.includes("finance.nominal.approve") && (
              <div className="flex flex-col gap-2 md:col-span-2">
                <Label htmlFor="hierarchy-rejection-reason">Rejection reason (only when rejecting)</Label>
                <Textarea
                  id="hierarchy-rejection-reason"
                  value={rejectionReason}
                  disabled={busy}
                  minLength={3}
                  maxLength={500}
                  onChange={(event) => setRejectionReason(event.target.value)}
                />
              </div>
            )}
            <div className="flex flex-wrap gap-3 md:col-span-2">
              {editable && (
                <Button
                  type="submit"
                  disabled={
                    busy ||
                    !name.trim() ||
                    !permissions.includes(selected ? "finance.nominal.update" : "finance.nominal.create")
                  }
                >
                  {busy ? "Saving…" : state === "draft" ? "Save Draft" : `Save ${kind}`}
                </Button>
              )}
              {selected &&
                state === "draft" &&
                permissions.includes("finance.nominal.submit") &&
                !permissions.includes("finance.nominal.approve") && (
                  <Button type="button" variant="outline" disabled={busy || dirty} onClick={() => void save("submit")}>
                    Submit for approval
                  </Button>
                )}
              {selected &&
                ["draft", "pending_approval"].includes(state) &&
                permissions.includes("finance.nominal.approve") && (
                  <>
                    <Button
                      type="button"
                      disabled={busy || dirty || (state === "draft" && !permissions.includes("finance.nominal.submit"))}
                      onClick={() => void save("approve")}
                    >
                      {busy ? "Saving…" : "Approve & Close"}
                    </Button>
                    {state === "pending_approval" && (
                      <Button
                        type="button"
                        variant="destructive"
                        disabled={busy || rejectionReason.trim().length < 3}
                        onClick={() => void save("reject")}
                      >
                        Reject & Close
                      </Button>
                    )}
                  </>
                )}
              {selected && ["active", "inactive"].includes(state) && permissions.includes("finance.nominal.status") && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void save(selected.status === "active" ? "deactivate" : "activate")}
                >
                  {selected.status === "active" ? `Deactivate ${kind}` : `Activate ${kind}`}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                disabled={busy}
                onClick={() => {
                  if (dirty && !window.confirm(`Discard unsaved ${kind} changes?`)) return;
                  setDirty(false);
                  onDirtyChange?.(false);
                  onCancel();
                }}
              >
                Close
              </Button>
            </div>
          </WorkForm>
        )}
      </CardContent>
    </Card></WorkFormLayout>
  );
}
