"use client";
import { cloneElement, useContext, useEffect, useId, useRef, useState, type ComponentProps } from "react";
import { ChevronLeft, ChevronRight, Columns3, Filter, List, RotateCcw, X } from "lucide-react";
import { cn } from "cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { WorkFormContext, WorkSurfaceContext } from "./work-surface-context";
import {
  rowMatches,
  tableNodes,
  tableText,
  workPageBounds,
  workPageSizes,
  type TableNode,
  type WorkFilter,
  type WorkPageSize,
} from "./work-table-model";

export type WorkRemotePagination = {
  offset: number;
  total?: number;
  limit: number;
  busy?: boolean;
  hasNext?: boolean;
  onOffsetChange: (offset: number) => void;
  onLimitChange: (limit: number) => void;
};
export type WorkContinuation = {
  hasMore: boolean;
  busy?: boolean;
  cursor?: string | null;
  loadMore: () => void | Promise<void>;
};
export const workSelectClass =
  "h-9 min-w-0 rounded-md border border-input bg-card px-2 text-sm text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60";

/** Adapts an existing server offset pager without changing its domain callbacks. */
export function WorkOffsetPagination({
  total,
  offset,
  size,
  previousDisabled,
  nextDisabled,
  busy = false,
  onSizeChange,
  onPrevious,
  onNext,
}: {
  total: number;
  offset: number;
  size: number;
  previousDisabled: boolean;
  nextDisabled: boolean;
  busy?: boolean;
  onSizeChange: (size: WorkPageSize) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <WorkPagination
      size={size}
      start={total ? Math.min(offset + 1, total) : 0}
      end={Math.min(offset + size, total)}
      total={total}
      page={Math.floor(offset / size)}
      previous={!previousDisabled}
      next={!nextDisabled}
      onSizeChange={onSizeChange}
      onPrevious={onPrevious}
      onNext={onNext}
      busy={busy}
    />
  );
}

export function WorkPagination({
  size,
  start,
  end,
  total,
  knownCount,
  hasMore = false,
  page,
  previous,
  next,
  onSizeChange,
  onPrevious,
  onNext,
  busy = false,
}: {
  size: number;
  start: number;
  end: number;
  total?: number;
  knownCount?: number;
  hasMore?: boolean;
  page: number;
  previous: boolean;
  next: boolean;
  busy?: boolean;
  onSizeChange: (size: WorkPageSize) => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  return (
    <nav
      aria-label="Table pagination"
      className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-t border-border px-3 py-3 text-sm print:hidden"
    >
      <label className="flex items-center gap-2">
        <span>Show</span>
        <select
          aria-label="Rows per page"
          className={workSelectClass}
          value={size}
          disabled={busy}
          onChange={(event) => {
            const selected = workPageSizes.find((value) => value === Number(event.target.value));
            if (selected) onSizeChange(selected);
          }}
        >
          {workPageSizes.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
        <span>per page</span>
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <span aria-live="polite" className="tabular-nums">
          {start}–{end} / {total ?? knownCount ?? end}
          {hasMore && total === undefined ? "+" : ""}
        </span>
        <span className="text-muted-foreground">Page {page + 1}</span>
        <div className="flex gap-1">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Previous page"
            title="Previous page"
            disabled={busy || !previous}
            onClick={onPrevious}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            aria-label="Next page"
            title="Next page"
            disabled={busy || !next}
            onClick={onNext}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}

/** Keeps original row elements, callbacks and selection state; only presentation is controlled here. */
export function WorkTable({
  children,
  className,
  tableId,
  label = "Records",
  tools = true,
  pagination,
  continuation,
  paging = true,
  ...props
}: ComponentProps<"table"> & {
  tableId: string;
  label?: string;
  tools?: boolean;
  pagination?: WorkRemotePagination;
  continuation?: WorkContinuation;
  paging?: boolean;
}) {
  const inForm = useContext(WorkFormContext),
    surface = useContext(WorkSurfaceContext),
    filterId = useId();
  const parts = tableNodes(children),
    head = parts.find((part) => part.type === "thead"),
    body = parts.find((part) => part.type === "tbody");
  const headRows = tableNodes(head?.props.children),
    headers = tableNodes(headRows.at(-1)?.props.children);
  const columns = headers.map((cell, index) => ({
    index,
    label: tableText(cell.props.children).trim() || `Selection ${index + 1}`,
    locked:
      !tableText(cell.props.children).trim() ||
      /^(actions?|select(?:ion)?|menu)$/i.test(tableText(cell.props.children).trim()),
  }));
  const bodyRows = tableNodes(body?.props.children);
  const records = bodyRows.filter(
    (row) => row.type === "tr" && !tableNodes(row.props.children).some((cell) => cell.props.colSpan !== undefined),
  );
  const supported =
    tools &&
    !inForm &&
    !!head &&
    !!body &&
    headers.length > 0 &&
    headRows.length === 1 &&
    !headers.some((cell) => (cell.props.colSpan ?? 1) > 1 || cell.props.rowSpan) &&
    bodyRows.every((row) => row.type === "tr");
  const signature = columns.map((column) => column.label).join("|");
  const preferenceKey = `nexora:work-table:${surface}:${tableId}:${signature}`;
  const [size, setSize] = useState<WorkPageSize>(25),
    [page, setPage] = useState(0),
    [hidden, setHidden] = useState<number[]>([]);
  const [search, setSearch] = useState(""),
    [filters, setFilters] = useState<WorkFilter[]>([]),
    [filterOpen, setFilterOpen] = useState(false);
  const [filterColumn, setFilterColumn] = useState(0),
    [operator, setOperator] = useState<WorkFilter["operator"]>("contains"),
    [filterValue, setFilterValue] = useState("");
  const [loadedPreferences, setLoadedPreferences] = useState("");
  const requestedCount = useRef<number | null>(null),
    [targetRows, setTargetRows] = useState(0);
  const requestedCursor = useRef<string | null>(null);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => {
      if (!active) return;
      let nextSize: WorkPageSize = 25,
        nextHidden: number[] = [];
      try {
        const value: unknown = JSON.parse(localStorage.getItem(preferenceKey) ?? "null");
        if (value && typeof value === "object" && "size" in value) {
          const saved = workPageSizes.find((size) => size === value.size);
          if (saved) nextSize = saved;
        }
        if (value && typeof value === "object" && "hidden" in value && Array.isArray(value.hidden))
          nextHidden = value.hidden.filter(
            (index): index is number =>
              typeof index === "number" && index >= 0 && index < headers.length && !columns[index]?.locked,
          );
      } catch {
        /* Restricted browser storage must not prevent work. */
      }
      setSize(nextSize);
      setHidden(nextHidden.length < columns.length ? nextHidden : []);
      setPage(0);
      setSearch("");
      setFilters([]);
      setTargetRows(0);
      setFilterColumn(columns.find((column) => !column.locked)?.index ?? 0);
      requestedCount.current = null;
      setLoadedPreferences(preferenceKey);
    });
    return () => {
      active = false;
    };
    // Column definitions are represented by preferenceKey; avoid resetting on every row render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferenceKey]);
  useEffect(() => {
    if (loadedPreferences !== preferenceKey) return;
    try {
      localStorage.setItem(preferenceKey, JSON.stringify({ size, hidden }));
    } catch {
      /* Optional preference storage. */
    }
  }, [hidden, size, preferenceKey, loadedPreferences]);
  const filtered = records.filter((row) =>
    rowMatches(
      tableNodes(row.props.children).map((cell) => tableText(cell.props.children)),
      search,
      filters,
    ),
  );
  const bounds = workPageBounds(filtered.length, page, size),
    currentPage = pagination ? Math.floor(pagination.offset / pagination.limit) : bounds.index;
  const pageSize = pagination?.limit ?? size;
  const visibleRows = pagination || !paging ? filtered : filtered.slice(bounds.index * size, (bounds.index + 1) * size);
  const loading = !!(pagination?.busy || continuation?.busy);
  // Cursor-backed directories append through their existing authorized adapter, at most one request per batch.
  useEffect(() => {
    if (
      !supported ||
      loadedPreferences !== preferenceKey ||
      !continuation?.hasMore ||
      continuation.busy ||
      targetRows <= records.length ||
      requestedCount.current === records.length ||
      (continuation.cursor && requestedCursor.current === continuation.cursor)
    )
      return;
    requestedCount.current = records.length;
    requestedCursor.current = continuation.cursor ?? null;
    Promise.resolve(continuation.loadMore()).catch(() => {
      setTargetRows(0);
    });
  }, [supported, continuation, targetRows, records.length, loadedPreferences, preferenceKey]);
  function resize(next: WorkPageSize) {
    requestedCount.current = null;
    requestedCursor.current = null;
    setPage(0);
    setSize(next);
    setTargetRows(next);
    if (pagination) {
      pagination.onOffsetChange(0);
      pagination.onLimitChange(next);
    }
  }
  function next() {
    if (pagination) {
      pagination.onOffsetChange(pagination.offset + pagination.limit);
      return;
    }
    const nextPage = bounds.index + 1;
    setPage(nextPage);
    requestedCount.current = null;
    requestedCursor.current = null;
    if (continuation?.hasMore) {
      // A loaded-row filter never triggers an unbounded search of the remote directory.
      if ((search || filters.length) && !hasLocalNext) {
        setPage(bounds.index);
        setTargetRows(records.length + 1);
      } else setTargetRows((nextPage + 1) * size);
    }
  }
  const firstRecord = records[0]?.key;
  const previousFirstRecord = useRef(firstRecord);
  useEffect(() => {
    if (previousFirstRecord.current !== firstRecord) {
      setPage(0);
      setTargetRows(0);
      requestedCount.current = null;
      requestedCursor.current = null;
      previousFirstRecord.current = firstRecord;
    }
  }, [firstRecord, size]);
  function columnsFor(row: TableNode, rowIndex: number): TableNode {
    let offset = 0;
    return cloneElement(row, {
      key: row.key ?? rowIndex,
      children: tableNodes(row.props.children).map((cell, cellIndex) => {
        const span = cell.props.colSpan ?? 1,
          kept = Array.from({ length: span }, (_, index) => offset + index).filter((index) => !hidden.includes(index));
        offset += span;
        return cloneElement(cell, {
          key: cell.key ?? cellIndex,
          hidden: kept.length === 0,
          style: { ...cell.props.style, ...(kept.length === 0 ? { display: "none" } : {}) },
          ...(span > 1 ? { colSpan: Math.max(1, kept.length) } : {}),
        });
      }),
    });
  }
  function bodyFor(row: TableNode, rowIndex: number): TableNode {
    const isRecord = records.includes(row);
    const isGroup = tableNodes(row.props.children).some((cell) => cell.type === "th" && cell.props.colSpan);
    let matching = isRecord ? filtered.includes(row) : true;
    let visible = isRecord ? visibleRows.includes(row) : true;
    if (isGroup) {
      const following: TableNode[] = [];
      for (const item of bodyRows.slice(rowIndex + 1)) {
        if (tableNodes(item.props.children).some((cell) => cell.type === "th" && cell.props.colSpan)) break;
        following.push(item);
      }
      matching = following.some((item) => filtered.includes(item));
      visible = following.some((item) => visibleRows.includes(item));
    }
    return cloneElement(columnsFor(row, rowIndex), {
      hidden: row.props.hidden || !visible,
      className: cn(row.props.className, !visible && matching && "print:table-row!"),
      style: { ...row.props.style, ...(!matching ? { display: "none" } : {}) },
    });
  }
  if (!supported)
    return (
      <table {...props} className={className}>
        {children}
      </table>
    );
  const hasLocalNext = (bounds.index + 1) * size < filtered.length;
  const total = pagination ? pagination.total : continuation?.hasMore ? undefined : filtered.length;
  const start = pagination ? (filtered.length ? pagination.offset + 1 : 0) : bounds.start;
  const end = pagination ? pagination.offset + filtered.length : bounds.end;
  return (
    <div data-work-table={tableId} className="min-w-0 w-full text-foreground">
      <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border bg-card p-3 print:hidden">
        <span className="mr-1 inline-flex items-center gap-1.5 text-sm font-medium">
          <List className="size-4" aria-hidden="true" />
          List
        </span>
        <Input
          aria-label={`Filter ${label.toLowerCase()}`}
          value={search}
          maxLength={160}
          placeholder={continuation || pagination || !paging ? "Filter loaded rows…" : "Search rows…"}
          className="h-9 min-w-32 flex-1 sm:max-w-80"
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
        />
        <Button
          type="button"
          variant={filterOpen ? "secondary" : "outline"}
          size="sm"
          aria-expanded={filterOpen}
          aria-controls={filterId}
          onClick={() => setFilterOpen((value) => !value)}
        >
          <Filter className="size-4" />
          Filters{filters.length ? ` (${filters.length})` : ""}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" variant="outline" size="sm" />}
            aria-label={`Choose ${label.toLowerCase()} columns`}
          >
            <Columns3 className="size-4" />
            Columns
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-h-96 w-64">
            {columns.map((column) => (
              <DropdownMenuCheckboxItem
                key={`${column.index}:${column.label}`}
                checked={!hidden.includes(column.index)}
                disabled={column.locked || (!hidden.includes(column.index) && hidden.length >= columns.length - 1)}
                closeOnClick={false}
                onCheckedChange={(checked) =>
                  setHidden((current) =>
                    checked ? current.filter((index) => index !== column.index) : [...current, column.index],
                  )
                }
              >
                {column.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        {search || filters.length || hidden.length ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            aria-label="Reset table controls"
            onClick={() => {
              setSearch("");
              setFilters([]);
              setHidden([]);
              setPage(0);
            }}
          >
            <RotateCcw className="size-4" />
            Reset
          </Button>
        ) : null}
      </div>
      {filterOpen ? (
        <div id={filterId} className="grid min-w-0 gap-3 border-b border-border bg-muted/30 p-3 print:hidden">
          <div className="flex min-w-0 flex-wrap items-end gap-2">
            <label className="grid min-w-0 gap-1 text-xs font-medium">
              Field
              <select
                aria-label="Filter field"
                className={workSelectClass}
                value={filterColumn}
                onChange={(event) => setFilterColumn(Number(event.target.value))}
              >
                {columns
                  .filter((column) => !column.locked)
                  .map((column) => (
                    <option key={column.index} value={column.index}>
                      {column.label}
                    </option>
                  ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-medium">
              Condition
              <select
                aria-label="Filter condition"
                className={workSelectClass}
                value={operator}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === "contains" || value === "equals" || value === "excludes" || value === "empty")
                    setOperator(value);
                }}
              >
                <option value="contains">Contains</option>
                <option value="equals">Equals</option>
                <option value="excludes">Does not contain</option>
                <option value="empty">Is empty</option>
              </select>
            </label>
            {operator !== "empty" ? (
              <label htmlFor={`${filterId}-value`} className="grid min-w-0 flex-1 gap-1 text-xs font-medium">
                Value
                <Input
                  id={`${filterId}-value`}
                  aria-label="Filter value"
                  value={filterValue}
                  maxLength={160}
                  className="h-9"
                  onChange={(event) => setFilterValue(event.target.value)}
                />
              </label>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={operator !== "empty" && !filterValue.trim()}
              onClick={() => {
                setFilters((current) => [...current, { column: filterColumn, operator, value: filterValue.trim() }]);
                setFilterValue("");
                setPage(0);
              }}
            >
              Apply filter
            </Button>
          </div>
          {filters.length ? (
            <div className="flex flex-wrap gap-2">
              {filters.map((filter, index) => (
                <Button
                  type="button"
                  key={index}
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setFilters((current) => current.filter((_, i) => i !== index));
                    setPage(0);
                  }}
                >
                  {columns[filter.column]?.label} {filter.operator}: {filter.value}
                  <X className="size-3" aria-label="Remove filter" />
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="min-w-0 overflow-x-auto">
        <table {...props} className={cn(className)}>
          {parts.map((part, partIndex) => {
            if (part.type === "thead")
              return cloneElement(part, {
                key: part.key ?? partIndex,
                children: tableNodes(part.props.children).map(columnsFor),
              });
            if (part.type === "tbody")
              return cloneElement(part, {
                key: part.key ?? partIndex,
                children: (
                  <>
                    {bodyRows.map(bodyFor)}
                    {!filtered.length && records.length ? (
                      <tr>
                        <td
                          colSpan={Math.max(1, columns.length - hidden.length)}
                          className="px-4 py-8 text-center text-muted-foreground"
                        >
                          No rows match these filters.
                        </td>
                      </tr>
                    ) : null}
                  </>
                ),
              });
            if (part.type === "tfoot")
              return cloneElement(part, {
                key: part.key ?? partIndex,
                children: tableNodes(part.props.children).map(columnsFor),
              });
            return cloneElement(part, { key: part.key ?? partIndex });
          })}
        </table>
      </div>
      {paging ? (
        <WorkPagination
          size={pageSize}
          start={start}
          end={end}
          total={total}
          knownCount={pagination ? end : filtered.length}
          hasMore={!!(pagination?.hasNext || continuation?.hasMore)}
          page={currentPage}
          busy={loading}
          previous={pagination ? pagination.offset > 0 : bounds.index > 0}
          next={
            pagination
              ? (pagination.hasNext ??
                (pagination.total !== undefined ? pagination.offset + pagination.limit < pagination.total : false))
              : hasLocalNext || !!continuation?.hasMore
          }
          onSizeChange={resize}
          onPrevious={() =>
            pagination
              ? pagination.onOffsetChange(Math.max(0, pagination.offset - pagination.limit))
              : setPage((value) => Math.max(0, value - 1))
          }
          onNext={next}
        />
      ) : null}
    </div>
  );
}
