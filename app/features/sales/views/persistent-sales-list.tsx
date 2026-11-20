"use client";
import { useEffect, useMemo, useState } from "react";
import type { SalesDirectory, SalesDocument, SalesKind, SalesOverview } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import {
  Card,
  EmptyState,
  FilterSelect,
  ListToolbar,
  MetricTiles,
  PageHead,
  SearchBox,
  StatusPill,
} from "../components/sales-ui";
import { ListPager, ListTable, ListViewMenu, useListView, type ListColumn } from "../components/list-view-options";
import {
  salesLabels,
  salesPages,
  salesQuery,
  salesError,
  salesStateLabel,
  salesMoney,
} from "../model/persistent-sales";
import type { SalesNavigate } from "../components/persistent-sales-record";

export function PersistentSalesList({
  company,
  kind,
  onNavigate,
  selected,
  onKindChange,
}: {
  company: string;
  kind: SalesKind;
  onNavigate: SalesNavigate;
  selected?: string;
  onKindChange?: (kind: SalesKind) => void;
}) {
  const { api, session } = useSession(),
    [search, setSearch] = useState(""),
    [state, setState] = useState(""),
    [refresh, setRefresh] = useState(0);
  const columns = useMemo<ListColumn<SalesDocument>[]>(
    () => [
      {
        id: "code",
        label: salesLabels[kind].single,
        required: true,
        cell: (record) => (
          <>
            <strong>{record.code}</strong>
            <small>{record.document_date}</small>
          </>
        ),
      },
      {
        id: "customer",
        label: kind === "recurring" ? "Billing customers" : "Customer",
        required: true,
        cell: (record) => (
          <>
            {record.customer_name ?? record.recurring_customers.map((customer) => customer.name).join(", ")}
            <small>{record.customer_code}</small>
          </>
        ),
      },
      {
        id: "due_date",
        label: kind === "quotation" ? "Valid until" : "Due date",
        optional: !["quotation", "invoice"].includes(kind),
        cell: (record) => (kind === "quotation" ? record.valid_until : record.due_date) ?? "—",
      },
      {
        id: "total",
        label: "Amount",
        align: "right",
        required: true,
        cell: (record) => salesMoney(record.total_amount, record.currency, record.decimal_places),
      },
      {
        id: "outstanding",
        label: "Outstanding",
        align: "right",
        optional: kind !== "invoice",
        cell: (record) =>
          record.outstanding === null
            ? "Not posted"
            : salesMoney(record.outstanding, record.currency, record.decimal_places),
      },
      {
        id: "state",
        label: "Status",
        required: true,
        cell: (record) => <StatusPill status={salesStateLabel(record.state)} />,
      },
      {
        id: "posting",
        label: "Accounting",
        cell: (record) => <StatusPill status={salesStateLabel(record.posting_state)} />,
      },
      { id: "source", label: "Source", optional: true, cell: (record) => record.source_code ?? "Direct document" },
      { id: "project", label: "Project", optional: true, cell: (record) => record.project_name },
      { id: "location", label: "Location", optional: true, cell: (record) => record.location_name },
      { id: "warehouse", label: "Warehouse", optional: true, cell: (record) => record.warehouse_name ?? "—" },
      { id: "owner", label: "Created by", optional: true, cell: (record) => record.maker_name },
      {
        id: "next",
        label: "Next step",
        optional: kind === "invoice",
        cell: (record) => (
          <Button
            type="button"
            variant="link"
            size="sm"
            onClick={() => onNavigate("sales", salesPages[record.kind], record.id)}
          >
            Review {record.code}
          </Button>
        ),
      },
    ],
    [kind, onNavigate],
  );
  const view = useListView(`persistent.${kind}`, columns);
  const scope = salesQuery({
    company_id: company,
    kind,
    search,
    state: state || undefined,
    limit: view.pageSize,
    offset: view.page * view.pageSize,
  });
  const [loaded, setLoaded] = useState<{
    scope: string;
    data: SalesDirectory | null;
    overview: SalesOverview | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        Promise.all([api.getSalesDocuments(scope), api.getSalesOverview(company)])
          .then(([data, overview]) => {
            if (active) setLoaded({ scope, data, overview, error: "" });
          })
          .catch((error) => {
            if (active) setLoaded({ scope, data: null, overview: null, error: salesError(error) });
          }),
      150,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, company, scope, refresh]);
  const current = loaded?.scope === scope ? loaded : null,
    data = current?.data;
  const count = (status: string) =>
    current?.overview?.counts.find((row) => row.kind === kind && row.state === status)?.count ?? 0;
  const total = current?.overview?.counts.filter((row) => row.kind === kind).reduce((sum, row) => sum + row.count, 0);
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / view.pageSize)),
    canCreate = session?.user.permissions.includes("sales.document.create");
  const openNew = () => onNavigate("sales", salesPages[kind], `new?kind=${kind}`);
  return (
    <div className="grid min-w-0 gap-4">
      <PageHead
        eyebrow="Sales"
        title={salesLabels[kind].plural}
        description="Company records and their actual commercial and accounting status."
        actions={
          <>
            <ListViewMenu view={view} />
            {kind === "invoice" ? (
              <Button type="button" variant="outline" onClick={() => onNavigate("sales", "invoices", "accounting")}>
                Accounting history
              </Button>
            ) : null}
            {canCreate && ["quotation", "order", "invoice", "recurring"].includes(kind) ? (
              <Button type="button" onClick={openNew}>
                Add New
              </Button>
            ) : null}
            {canCreate && kind === "delivery" ? (
              <Button type="button" onClick={() => onNavigate("sales", "sales-orders")}>
                Prepare from sales order
              </Button>
            ) : null}
          </>
        }
      />
      <MetricTiles
        metrics={[
          { label: "Total records", value: current?.overview ? total : "—", hint: "Current company" },
          {
            label: "Pending approval",
            value: current?.overview ? count("submitted") : "—",
            hint: "Waiting for named review",
          },
          {
            label: "Approved",
            value: current?.overview ? count("approved") : "—",
            hint: "Commercial records; accounting shown separately",
          },
        ]}
      />
      {onKindChange && ["invoice", "credit", "delivery", "return"].includes(kind) ? (
        <div className="flex gap-2" aria-label="Sales document type">
          {(kind === "invoice" || kind === "credit"
            ? (["invoice", "credit"] as const)
            : (["delivery", "return"] as const)
          ).map((value) => (
            <Button
              key={value}
              type="button"
              variant={kind === value ? "default" : "outline"}
              onClick={() => onKindChange(value)}
            >
              {salesLabels[value].plural}
            </Button>
          ))}
        </div>
      ) : null}
      <Card>
        <ListToolbar>
          <SearchBox
            value={search}
            onChange={(value) => {
              setSearch(value);
              view.setPage(0);
            }}
            placeholder="Search code, customer or reference"
          />
          <FilterSelect
            label="Status"
            value={state}
            options={["draft", "submitted", "approved", "rejected", "cancelled"].map(
              (state) => [state, salesStateLabel(state)] as const,
            )}
            onChange={(value) => {
              setState(value);
              view.setPage(0);
            }}
          />
          <Button type="button" variant="outline" onClick={() => setRefresh((value) => value + 1)}>
            Refresh
          </Button>
        </ListToolbar>
        {current?.error ? (
          <div role="alert" className="p-4 text-sm text-destructive">
            {current.error}
          </div>
        ) : !current ? (
          <p role="status" className="m-0 p-4 text-sm text-muted-foreground">
            Loading Sales records…
          </p>
        ) : !data?.items.length ? (
          <EmptyState
            title={`No ${salesLabels[kind].plural.toLowerCase()} found`}
            hint="Create a new record or change the filters."
          />
        ) : (
          <ListTable
            view={view}
            rows={data.items}
            rowKey={(record) => record.id}
            selected={selected}
            onOpen={(record) => onNavigate("sales", salesPages[record.kind], record.id)}
          />
        )}
        <ListPager
          view={view}
          noun={salesLabels[kind].plural.toLowerCase()}
          paging={{
            pageRows: data?.items ?? [],
            page: view.page,
            pages,
            total: data?.total ?? 0,
            from: data?.total ? view.page * view.pageSize + 1 : 0,
            to: Math.min((view.page + 1) * view.pageSize, data?.total ?? 0),
          }}
        />
      </Card>
    </div>
  );
}
