"use client";
import { useEffect, useMemo, useState } from "react";
import type { SalesDirectory, SalesDocument, SalesKind } from "@nexora/contracts";
import { useSession } from "@/lib/session/session-provider";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, FilterSelect, ListToolbar, PageHead, SearchBox, StatusPill } from "../components/sales-ui";
import type { ListColumn } from "../components/list-view-options";
import { WorkTable } from "@/shared/ui/work-table";
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
    [offset, setOffset] = useState(0),
    [limit, setLimit] = useState(25),
    [refresh, setRefresh] = useState(0);
  const columns = useMemo<ListColumn<SalesDocument>[]>(
    () => [
      {
        id: "code",
        label: "Code",
        required: true,
        cell: (record) => (
          <Button
            type="button"
            variant="link"
            className="h-auto p-0"
            onClick={() => onNavigate("sales", salesPages[record.kind], record.id)}
          >
            {record.code}
          </Button>
        ),
      },
      { id: "date", label: "Date", cell: (record) => record.document_date },
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
        label: "Actions",
        optional: kind === "invoice",
        cell: (record) => (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onNavigate("sales", salesPages[record.kind], record.id)}
          >
            Open
          </Button>
        ),
      },
    ],
    [kind, onNavigate],
  );
  const visibleColumns = columns.filter((column) => !column.optional);
  const scope = salesQuery({
    company_id: company,
    kind,
    search,
    state: state || undefined,
    limit,
    offset,
  });
  const [loaded, setLoaded] = useState<{
    scope: string;
    data: SalesDirectory | null;
    error: string;
  } | null>(null);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(
      () =>
        api
          .getSalesDocuments(scope)
          .then((data) => {
            if (active) setLoaded({ scope, data, error: "" });
          })
          .catch((error) => {
            if (active) setLoaded({ scope, data: null, error: salesError(error) });
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
  const canCreate = session?.user.permissions.includes("sales.document.create") && !session.impersonation;
  const openNew = () => onNavigate("sales", salesPages[kind], `new?kind=${kind}`);
  return (
    <div className="grid min-w-0 gap-4">
      <PageHead
        eyebrow="Sales"
        title={salesLabels[kind].plural}
        description="Company records and their actual commercial and accounting status."
        actions={
          <>
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
              onClick={() => {
                setOffset(0);
                onKindChange(value);
              }}
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
              setOffset(0);
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
              setOffset(0);
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
          <WorkTable
            tableId={`sales-register-${kind}`}
            label={salesLabels[kind].plural}
            className="w-full min-w-[760px] border-collapse text-sm"
            pagination={{
              offset,
              total: data.total,
              limit,
              onOffsetChange: setOffset,
              onLimitChange: (size) => {
                setLimit(size);
                setOffset(0);
              },
            }}
          >
            <thead className="bg-muted text-left">
              <tr>
                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    className={column.align === "right" ? "px-3 py-2 text-right font-medium" : "px-3 py-2 font-medium"}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.items.map((record) => (
                <tr
                  key={record.id}
                  aria-selected={record.id === selected || undefined}
                  className="border-t border-border"
                >
                  {visibleColumns.map((column) => (
                    <td
                      key={column.id}
                      className={column.align === "right" ? "px-3 py-2 text-right tabular-nums" : "px-3 py-2"}
                    >
                      {column.cell(record)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </WorkTable>
        )}
      </Card>
    </div>
  );
}
