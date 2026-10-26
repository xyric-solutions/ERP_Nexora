"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChartTemplateNodes, ChartTemplateSummary } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { ApiError } from "@/lib/api/generated";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ChartTemplatesClient } from "../api/chart-templates-client";
import { FinanceChartCompanyPreview } from "./finance-chart-company-preview";

type TemplateNode = ChartTemplateNodes["items"][number];
type Kind = TemplateNode["kind"];
const kinds: Kind[] = ["category", "section", "nominal"];
const labels: Record<Kind, string> = { category: "Categories", section: "Sections", nominal: "Nominals" };
const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function problem(error: unknown) {
  return error instanceof ApiError
    ? `${error.message}${error.correlationId ? ` Reference: ${error.correlationId}` : ""}`
    : "Central master data could not be loaded. Please retry.";
}
interface BrowserProps {
  initialKind?: Kind;
  onCompanyAccounts: () => void;
}
export function FinanceChartTemplates(props: BrowserProps) {
  const { session } = useSession();
  return (
    <CentralTemplateBrowser
      key={`${session?.tenant_id ?? "no-tenant"}:${props.initialKind ?? "category"}`}
      {...props}
    />
  );
}
function CentralTemplateBrowser({ initialKind = "category", onCompanyAccounts }: BrowserProps) {
  const { api, session, loading: sessionLoading } = useSession();
  const client = useMemo(() => new ChartTemplatesClient(api), [api]);
  const canRead = !!session?.user.permissions.includes("finance.chart_template.read");
  const [revisions, setRevisions] = useState<ChartTemplateSummary[]>([]);
  const [revisionId, setRevisionId] = useState("");
  const [revisionCursor, setRevisionCursor] = useState<string | null>(null);
  const [directoryBusy, setDirectoryBusy] = useState(true);
  const [directoryError, setDirectoryError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [headers, setHeaders] = useState<{ categories: TemplateNode[]; sections: TemplateNode[] }>({
    categories: [],
    sections: [],
  });
  const [headerState, setHeaderState] = useState<{ ready: boolean; error: string; revisionId?: string }>({
    ready: false,
    error: "",
  });
  const [filters, setFilters] = useState({ kind: initialKind, category: "", section: "", search: "" });
  const [history, setHistory] = useState(["0"]);
  const [page, setPage] = useState<{ items: TemplateNode[]; next_cursor: string | null }>({
    items: [],
    next_cursor: null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<TemplateNode | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const revision = revisions.find((item) => item.id === revisionId);
  const headersReady = headerState.ready && headerState.revisionId === revisionId;
  const cursor = history[history.length - 1]!;

  useEffect(() => {
    if (!canRead) return;
    let active = true;
    client
      .revisions()
      .then((result) => {
        if (!active) return;
        setRevisions(result.items);
        setRevisionCursor(result.next_cursor);
        setRevisionId((current) =>
          result.items.some((item) => item.id === current)
            ? current
            : ((result.items.find((item) => item.state === "published") ?? result.items[0])?.id ?? ""),
        );
      })
      .catch((error) => {
        if (active) {
          setDirectoryError(problem(error));
          setRevisions([]);
          setRevisionId("");
        }
      })
      .finally(() => {
        if (active) setDirectoryBusy(false);
      });
    return () => {
      active = false;
    };
  }, [canRead, client, refresh]);
  useEffect(() => {
    if (!canRead || !revisionId) return;
    let active = true;
    Promise.all([client.headers(revisionId, "category"), client.headers(revisionId, "section")])
      .then(([categories, sections]) => {
        if (active) {
          setHeaders({ categories, sections });
          setHeaderState({ ready: true, error: "", revisionId });
          setBusy(true);
        }
      })
      .catch((error) => {
        if (active) {
          setHeaderState({ ready: false, error: problem(error) });
          setBusy(false);
        }
      });
    return () => {
      active = false;
    };
  }, [canRead, client, revisionId, refresh]);
  useEffect(() => {
    if (!canRead || !revisionId || !headersReady) return;
    let active = true;
    const timer = setTimeout(() => {
      client
        .nodes(revisionId, {
          kind: filters.kind,
          limit: 50,
          ...(filters.search ? { search: filters.search } : {}),
          ...(filters.category ? { category_key: filters.category } : {}),
          ...(filters.section ? { parent_key: filters.section } : {}),
          ...(cursor !== "0" ? { cursor } : {}),
        })
        .then((result) => {
          if (active) setPage(result);
        })
        .catch((error) => {
          if (active) setError(problem(error));
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }, 250);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [canRead, client, revisionId, headersReady, filters, cursor, refresh]);

  function changeFilters(patch: Partial<typeof filters>) {
    setFilters((current) => ({ ...current, ...patch }));
    setHistory(["0"]);
    setSelected(null);
    setPage({ items: [], next_cursor: null });
    setBusy(true);
    setError("");
  }
  const categories = new Map(headers.categories.map((item) => [item.key, item]));
  const sections = new Map(headers.sections.map((item) => [item.key, item]));
  function hierarchy(node: TemplateNode) {
    const section =
      node.kind === "nominal" ? sections.get(node.parent_key ?? "") : node.kind === "section" ? node : undefined;
    const category = node.kind === "category" ? node : categories.get(section?.parent_key ?? "");
    return { category, section };
  }
  async function moreRevisions() {
    if (!revisionCursor) return;
    setDirectoryBusy(true);
    setDirectoryError("");
    try {
      const result = await client.revisions(revisionCursor);
      setRevisions((current) => [
        ...current,
        ...result.items.filter((item) => !current.some((existing) => existing.id === item.id)),
      ]);
      setRevisionCursor(result.next_cursor);
    } catch (error) {
      setDirectoryError(problem(error));
    } finally {
      setDirectoryBusy(false);
    }
  }
  if (sessionLoading)
    return (
      <Alert role="status">
        <AlertDescription>Loading your workspace…</AlertDescription>
      </Alert>
    );
  if (!canRead)
    return (
      <Alert role="alert">
        <AlertTitle>Permission required</AlertTitle>
        <AlertDescription>You do not have permission to read central master data.</AlertDescription>
      </Alert>
    );
  const loading = directoryBusy || (!!revisionId && !headersReady && !headerState.error) || busy;
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex flex-col gap-2">
            <CardTitle>Central Chart of Accounts</CardTitle>
            <CardDescription>Master Data · Categories, Sections and Nominals</CardDescription>
          </div>
          {revision?.state === "published" && session?.user.permissions.includes("finance.nominal.read") && (
            <Button variant="outline" onClick={() => setPreviewOpen(true)}>
              Preview company setup
            </Button>
          )}
          <Button variant="outline" onClick={onCompanyAccounts}>
            Company accounts
          </Button>
        </div>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <Alert role="note">
          <AlertTitle>Central reference template</AlertTitle>
          <AlertDescription>
            These definitions are shared within your ERP tenant. Each company keeps separate accounts, Bank setup,
            balances and transactions. Browsing this template does not activate company accounts.
          </AlertDescription>
        </Alert>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-0 flex-1 basis-full flex-col gap-2 sm:basis-0">
            <Label htmlFor="chart-revision">Template revision</Label>
            <select
              id="chart-revision"
              className={selectClass}
              value={revisionId}
              disabled={directoryBusy || !revisions.length}
              onChange={(event) => {
                setRevisionId(event.target.value);
                setHeaders({ categories: [], sections: [] });
                setHeaderState({ ready: false, error: "" });
                changeFilters({ category: "", section: "", search: "" });
                setBusy(!!event.target.value);
              }}
            >
              <option value="">Select revision</option>
              {revisions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} · {item.revision} · {item.state}
                </option>
              ))}
            </select>
          </div>
          {revision && <Badge variant="secondary">{revision.state}</Badge>}
          <Button
            variant="outline"
            disabled={directoryBusy}
            onClick={() => {
              setBusy(false);
              setSelected(null);
              setDirectoryBusy(true);
              setDirectoryError("");
              setHeaderState({ ready: false, error: "" });
              setHeaders({ categories: [], sections: [] });
              setHistory(["0"]);
              setPage({ items: [], next_cursor: null });
              setError("");
              setRefresh((value) => value + 1);
            }}
          >
            Refresh central data
          </Button>
          {revisionCursor && (
            <Button variant="outline" disabled={directoryBusy} onClick={() => void moreRevisions()}>
              More revisions
            </Button>
          )}
        </div>
        {(directoryError || headerState.error || error) && (
          <Alert variant="destructive" role="alert">
            <AlertTitle>Unable to load central data</AlertTitle>
            <AlertDescription>{directoryError || headerState.error || error}</AlertDescription>
          </Alert>
        )}
        {!directoryBusy && !directoryError && !revisions.length && (
          <Alert role="status">
            <AlertDescription>
              No central templates are available for this tenant. An authorized administrator must import the approved
              catalog.
            </AlertDescription>
          </Alert>
        )}
        {revision && (
          <>
            <details className="rounded-md border border-border p-3">
              <summary className="cursor-pointer">Source and revision evidence</summary>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
                <dt>Source workbook</dt>
                <dd className="break-all">{revision.source_filename}</dd>
                <dt>Workbook SHA-256</dt>
                <dd className="break-all font-mono">{revision.source_sha256}</dd>
                <dt>Content SHA-256</dt>
                <dd className="break-all font-mono">{revision.content_sha256}</dd>
                <dt>Revision version</dt>
                <dd>{revision.version}</dd>
                <dt>Publication</dt>
                <dd>{revision.published_at ?? "Not published"}</dd>
              </dl>
            </details>
            <Tabs
              className="min-w-0 flex-col"
              value={filters.kind}
              onValueChange={(value) => {
                if (value === "category" || value === "section" || value === "nominal")
                  changeFilters({ kind: value, section: "" });
              }}
            >
              <TabsList aria-label="Central catalog level" className="max-w-full overflow-x-auto">
                {kinds.map((kind) => (
                  <TabsTrigger key={kind} value={kind}>
                    {labels[kind]} ({revision[`${kind}_count`]})
                  </TabsTrigger>
                ))}
              </TabsList>
              {kinds.map((kind) => (
                <TabsContent key={kind} value={kind} className="flex min-w-0 flex-col gap-4">
                  {filters.kind === kind && (
                    <>
                      <div className="grid gap-3 md:grid-cols-3">
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`chart-search-${kind}`}>Search {labels[kind].toLowerCase()}</Label>
                          <Input
                            id={`chart-search-${kind}`}
                            placeholder="Name or code"
                            maxLength={160}
                            value={filters.search}
                            onChange={(event) => changeFilters({ search: event.target.value })}
                          />
                        </div>
                        <div className="flex flex-col gap-2">
                          <Label htmlFor={`chart-category-${kind}`}>Category</Label>
                          <select
                            id={`chart-category-${kind}`}
                            className={selectClass}
                            value={filters.category}
                            disabled={!headersReady}
                            onChange={(event) => changeFilters({ category: event.target.value, section: "" })}
                          >
                            <option value="">All categories</option>
                            {headers.categories.map((item) => (
                              <option key={item.key} value={item.key}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        {kind === "nominal" && (
                          <div className="flex flex-col gap-2">
                            <Label htmlFor="chart-section">Section</Label>
                            <select
                              id="chart-section"
                              className={selectClass}
                              value={filters.section}
                              disabled={!headersReady}
                              onChange={(event) => changeFilters({ section: event.target.value })}
                            >
                              <option value="">All sections</option>
                              {headers.sections
                                .filter((item) => !filters.category || item.parent_key === filters.category)
                                .map((item) => (
                                  <option key={item.key} value={item.key}>
                                    {item.code} · {item.name}
                                  </option>
                                ))}
                            </select>
                          </div>
                        )}
                      </div>
                      <div aria-busy={loading}>
                        {loading ? (
                          <div role="status" aria-label="Loading central definitions" className="flex flex-col gap-2">
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-full" />
                            <Skeleton className="h-9 w-full" />
                          </div>
                        ) : (
                          !error &&
                          !headerState.error && (
                            <div className="overflow-x-auto rounded-md border border-border">
                              <table className="w-full text-left text-sm">
                                <caption className="sr-only">
                                  Central {labels[kind].toLowerCase()} reference definitions
                                </caption>
                                <thead className="bg-muted">
                                  <tr>
                                    {["Code", "Name", "Category", "Section", "Account type", "Action"].map((label) => (
                                      <th key={label} scope="col" className="px-3 py-3">
                                        {label}
                                      </th>
                                    ))}
                                  </tr>
                                </thead>
                                <tbody>
                                  {page.items.map((node) => {
                                    const { category, section } = hierarchy(node);
                                    return (
                                      <tr key={node.key} className="border-t border-border">
                                        <td className="whitespace-nowrap px-3 py-3 font-mono">{node.code ?? "—"}</td>
                                        <th scope="row" className="min-w-48 px-3 py-3 font-medium">
                                          {node.name}
                                        </th>
                                        <td className="px-3 py-3">{category?.name ?? "—"}</td>
                                        <td className="px-3 py-3">{section?.name ?? "—"}</td>
                                        <td className="px-3 py-3 capitalize">{node.type}</td>
                                        <td className="px-3 py-3">
                                          <Button
                                            variant="outline"
                                            size="sm"
                                            aria-label={`View ${node.name}`}
                                            onClick={() => setSelected(node)}
                                          >
                                            Details
                                          </Button>
                                        </td>
                                      </tr>
                                    );
                                  })}
                                  {!page.items.length && (
                                    <tr>
                                      <td colSpan={6} className="px-3 py-8 text-center">
                                        No definitions match these filters.
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                          )
                        )}
                      </div>
                    </>
                  )}
                </TabsContent>
              ))}
            </Tabs>
          </>
        )}
      </CardContent>
      <CardFooter className="flex flex-wrap items-center justify-between gap-3">
        <p role="status" className="text-sm text-muted-foreground">
          {loading ? "Loading definitions…" : `Page ${history.length} · ${page.items.length} definitions shown`}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            disabled={loading || history.length === 1}
            onClick={() => {
              setBusy(true);
              setError("");
              setPage({ items: [], next_cursor: null });
              setHistory((current) => current.slice(0, -1));
            }}
          >
            Previous page
          </Button>
          <Button
            variant="outline"
            disabled={loading || !page.next_cursor}
            onClick={() => {
              const next = page.next_cursor;
              if (next) {
                setBusy(true);
                setError("");
                setPage({ items: [], next_cursor: null });
                setHistory((current) => [...current, next]);
              }
            }}
          >
            Next page
          </Button>
        </div>
      </CardFooter>
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        <DialogContent overlayClassName="z-[1300]" className="z-[1301] max-h-[85vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{selected?.name ?? "Central definition"}</DialogTitle>
            <DialogDescription>Central reference definition · not a company account</DialogDescription>
          </DialogHeader>
          {selected && (
            <>
              <dl className="grid gap-2 text-sm sm:grid-cols-[8rem_minmax(0,1fr)]">
                <dt>Code</dt>
                <dd>{selected.code ?? "No category code supplied"}</dd>
                <dt>Level</dt>
                <dd className="capitalize">{selected.kind}</dd>
                <dt>Account type</dt>
                <dd className="capitalize">{selected.type}</dd>
                <dt>Category</dt>
                <dd>{hierarchy(selected).category?.name ?? "—"}</dd>
                <dt>Section</dt>
                <dd>{hierarchy(selected).section?.name ?? "—"}</dd>
                <dt>Source</dt>
                <dd>
                  {selected.source_rows.length
                    ? selected.source_rows.map((row) => `${row.source}, row ${row.row}`).join("; ")
                    : revision?.source_filename}
                </dd>
              </dl>
              {selected.review_note && (
                <Alert role="note">
                  <AlertTitle>Source review note</AlertTitle>
                  <AlertDescription>{selected.review_note}</AlertDescription>
                </Alert>
              )}
              <DialogFooter>
                {selected.kind === "category" && (
                  <Button
                    onClick={() => changeFilters({ kind: "section", category: selected.key, section: "", search: "" })}
                  >
                    Browse sections
                  </Button>
                )}
                {selected.kind === "section" && (
                  <Button
                    onClick={() =>
                      changeFilters({
                        kind: "nominal",
                        category: selected.parent_key ?? "",
                        section: selected.key,
                        search: "",
                      })
                    }
                  >
                    Browse nominals
                  </Button>
                )}
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Close details
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      {previewOpen && revision && (
        <FinanceChartCompanyPreview key={revision.id} templateId={revision.id} onClose={() => setPreviewOpen(false)} />
      )}
    </Card>
  );
}
