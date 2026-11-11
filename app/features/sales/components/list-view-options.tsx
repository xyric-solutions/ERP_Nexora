"use client";

/**
 * Sales list views (meeting of 11 Nov 2026).
 *
 * - "Filter" menu beside the page actions chooses which fields show as
 *   columns (the necessary ones are ticked by default; required ones cannot
 *   be hidden).
 * - Pagination lives in one place: the pager bar under every record table.
 *   It shows the record range, the rows-per-page choice (10, 25, 50, 100;
 *   default 10) and First / Previous / page numbers / Next / Last.
 *
 * Column and page-size choices are a per-browser convenience kept in
 * localStorage; the lists still render without it.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ListFilter } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "cn";
import { clickableRow, rowKeyHandler, selectClass, tableClass } from "./sales-ui";

export interface ListColumn<T> {
  id: string;
  label: string;
  /** Always shown; cannot be unticked. */
  required?: boolean;
  /** Off until the user ticks it. */
  optional?: boolean;
  align?: "right";
  /** Keeps short values such as dates on one line. Right-aligned (money) columns never wrap. */
  nowrap?: boolean;
  cell: (row: T) => ReactNode;
}

/** Rows-per-page options offered in the pager under every Sales list. */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 10;

interface StoredView {
  hidden: string[];
  shown: string[];
  pageSize: number;
}

const storageKey = (id: string) => `nexora.sales.list.${id}`;

function readView(id: string): StoredView | null {
  try {
    const raw = window.localStorage.getItem(storageKey(id));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredView>;
    return {
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
      shown: Array.isArray(parsed.shown) ? parsed.shown : [],
      pageSize: PAGE_SIZES.includes(parsed.pageSize as (typeof PAGE_SIZES)[number]) ? (parsed.pageSize as number) : DEFAULT_PAGE_SIZE,
    };
  } catch {
    return null;
  }
}

function writeView(id: string, view: StoredView) {
  try {
    window.localStorage.setItem(storageKey(id), JSON.stringify(view));
  } catch {
    /* Storage can be unavailable (private mode); the choice then lasts for this visit only. */
  }
}

export interface ListView<T> {
  id: string;
  columns: readonly ListColumn<T>[];
  visible: ListColumn<T>[];
  isVisible: (column: ListColumn<T>) => boolean;
  toggle: (column: ListColumn<T>, on: boolean) => void;
  reset: () => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  page: number;
  setPage: (page: number) => void;
}

/** Column visibility and paging for one list; `id` keeps each list's choice separate. */
export function useListView<T>(id: string, columns: readonly ListColumn<T>[]): ListView<T> {
  const [hidden, setHidden] = useState<string[]>([]);
  const [shown, setShown] = useState<string[]>([]);
  const [pageSize, setPageSizeState] = useState<number>(DEFAULT_PAGE_SIZE);
  const [page, setPage] = useState(0);
  const [loaded, setLoaded] = useState(false);

  // Restore the saved choice once, on the client only. Reading localStorage
  // during render (or in a lazy useState initializer) would make the first
  // client render disagree with the server markup, so this follows the same
  // hydration-safe pattern as the shell preferences in prototype-shell.tsx.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const stored = readView(id);
    if (stored) {
      setHidden(stored.hidden);
      setShown(stored.shown);
      setPageSizeState(stored.pageSize);
    }
    setLoaded(true);
  }, [id]);
  /* eslint-enable react-hooks/set-state-in-effect */

  useEffect(() => {
    if (loaded) writeView(id, { hidden, shown, pageSize });
  }, [hidden, id, loaded, pageSize, shown]);

  const isVisible = (column: ListColumn<T>) =>
    Boolean(column.required) || (column.optional ? shown.includes(column.id) : !hidden.includes(column.id));

  return {
    id,
    columns,
    visible: columns.filter(isVisible),
    isVisible,
    toggle: (column, on) => {
      if (column.required) return;
      if (column.optional) setShown((current) => (on ? [...new Set([...current, column.id])] : current.filter((item) => item !== column.id)));
      else setHidden((current) => (on ? current.filter((item) => item !== column.id) : [...new Set([...current, column.id])]));
    },
    reset: () => {
      setHidden([]);
      setShown([]);
    },
    pageSize,
    setPageSize: (size) => {
      setPageSizeState(size);
      setPage(0);
    },
    page,
    setPage,
  };
}

/** Filter icon menu: tick the fields to show. Rows per page is chosen in the pager. */
export function ListViewMenu<T>({ view, label = "Filter" }: { view: ListView<T>; label?: string }) {
  const visibleCount = view.visible.length;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button type="button" variant="outline" aria-label={`${label}: choose the columns shown`} />}
      >
        <ListFilter aria-hidden="true" />
        {label}
        <span className="rounded-full bg-muted px-1.5 text-[0.6875rem] font-semibold text-muted-foreground tabular-nums">
          {visibleCount}/{view.columns.length}
        </span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={6} className="max-h-[70vh] w-64 overflow-y-auto p-1.5">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Fields shown</DropdownMenuLabel>
          {view.columns.map((column) => (
            <DropdownMenuCheckboxItem
              key={column.id}
              checked={view.isVisible(column)}
              disabled={column.required}
              closeOnClick={false}
              onCheckedChange={(checked) => view.toggle(column, Boolean(checked))}
            >
              {column.label}
              {column.required ? <span className="ml-auto text-[0.6875rem] text-muted-foreground">Always</span> : null}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={view.reset}>Reset to default</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export interface Paging<T> {
  pageRows: T[];
  /** Zero-based current page, clamped to the last page. */
  page: number;
  pages: number;
  /** Rows after search and filters, across all pages. */
  total: number;
  /** One-based range of the rows on this page; 0 when empty. */
  from: number;
  to: number;
}

/**
 * The current page of rows. Returns to the first page when `resetKey`
 * (the search text and filters) changes, and clamps the page when the list
 * shrinks, so a search never lands on an empty page.
 */
export function usePagedRows<T>(view: ListView<T>, rows: readonly T[], resetKey = ""): Paging<T> {
  const [lastKey, setLastKey] = useState(resetKey);
  const changed = lastKey !== resetKey;
  if (changed) {
    setLastKey(resetKey);
    if (view.page !== 0) view.setPage(0);
  }
  const pages = Math.max(1, Math.ceil(rows.length / view.pageSize));
  const page = changed ? 0 : Math.min(view.page, pages - 1);
  return useMemo(() => {
    const start = page * view.pageSize;
    const pageRows = rows.slice(start, start + view.pageSize);
    return { pageRows, page, pages, total: rows.length, from: pageRows.length ? start + 1 : 0, to: start + pageRows.length };
  }, [page, pages, rows, view.pageSize]);
}

/** Table that renders only the visible columns of a list view. */
export function ListTable<T>({
  view,
  rows,
  rowKey,
  onOpen,
  selected,
  className,
}: {
  view: ListView<T>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  onOpen?: (row: T) => void;
  /** Row key shown as selected (e.g. the record open in a side panel). */
  selected?: string;
  className?: string;
}) {
  return (
    <div className="relative overflow-x-auto">
      <table className={cn(tableClass, className)}>
        <thead>
          <tr>
            {view.visible.map((column) => (
              <th key={column.id} className={column.align === "right" ? "text-right!" : undefined}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const key = rowKey(row);
            const open = onOpen ? () => onOpen(row) : undefined;
            return (
              <tr
                key={key}
                className={open ? clickableRow : undefined}
                tabIndex={open ? 0 : undefined}
                aria-selected={selected !== undefined ? key === selected : undefined}
                // Buttons and links inside a row run their own action instead of opening the row.
                onClick={open ? (event) => !(event.target as HTMLElement).closest("button, a, input, select") && open() : undefined}
                onKeyDown={open ? rowKeyHandler(open) : undefined}
              >
                {view.visible.map((column) => (
                  <td key={column.id} className={cn(column.align === "right" && "text-right tabular-nums whitespace-nowrap", column.nowrap && "whitespace-nowrap")}>{column.cell(row)}</td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Page numbers to show: the first and last, the current page and its neighbours, with gaps. */
export function pageWindow(page: number, pages: number): (number | "gap")[] {
  const sorted = [...new Set([0, pages - 1, page - 1, page, page + 1])].filter((item) => item >= 0 && item < pages).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((item, index) => {
    const previous = sorted[index - 1];
    if (previous !== undefined && item - previous === 2) out.push(previous + 1);
    else if (previous !== undefined && item - previous > 2) out.push("gap");
    out.push(item);
  });
  return out;
}

/**
 * Pager bar under a record table: "Showing 11–20 of 42 invoices" on the
 * left; rows per page and the page buttons on the right. It is always shown
 * so the controls stay in the same place; buttons disable on a single page.
 */
export function ListPager<T>({
  view,
  paging,
  of,
  noun,
}: {
  view: ListView<T>;
  paging: Paging<T>;
  /** Records before search and filters; shows "filtered from N" when larger. */
  of?: number;
  noun: string;
}) {
  const { page, pages, total, from, to } = paging;
  const sizeId = `${view.id}-page-size`;
  const go = (target: number) => view.setPage(Math.max(0, Math.min(pages - 1, target)));
  const first = page === 0;
  const last = page >= pages - 1;
  return (
    <nav
      aria-label={`${noun} pages`}
      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-b-lg border-t border-border bg-muted px-3 py-2 text-xs text-muted-foreground"
    >
      <span aria-live="polite" className="tabular-nums">
        {total ? (
          <>
            Showing <strong className="font-semibold text-foreground">{from}–{to}</strong> of{" "}
            <strong className="font-semibold text-foreground">{total}</strong> {noun}
          </>
        ) : (
          <>No {noun}</>
        )}
        {of !== undefined && of > total ? ` · filtered from ${of}` : ""}
      </span>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label htmlFor={sizeId} className="flex items-center gap-2 whitespace-nowrap">
          Rows per page
          <select
            id={sizeId}
            className={cn(selectClass, "h-7 w-auto px-1.5 text-xs")}
            value={view.pageSize}
            onChange={(event) => view.setPageSize(Number(event.target.value))}
          >
            {PAGE_SIZES.map((size) => (
              <option key={size} value={size}>{size}</option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon-sm" variant="outline" aria-label="First page" disabled={first} onClick={() => go(0)}>
            <ChevronsLeft />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label="Previous page" disabled={first} onClick={() => go(page - 1)}>
            <ChevronLeft />
          </Button>
          <span className="px-1.5 tabular-nums sm:hidden">Page {page + 1} of {pages}</span>
          <ol className="m-0 hidden list-none items-center gap-1 p-0 sm:flex">
            {pageWindow(page, pages).map((item, index) =>
              item === "gap" ? (
                <li key={`gap-${index}`} aria-hidden="true" className="px-1">…</li>
              ) : (
                <li key={item}>
                  <Button
                    type="button"
                    size="icon-sm"
                    variant={item === page ? "default" : "ghost"}
                    className="w-auto min-w-7 px-1.5 tabular-nums"
                    aria-label={`Page ${item + 1}`}
                    aria-current={item === page ? "page" : undefined}
                    onClick={() => go(item)}
                  >
                    {item + 1}
                  </Button>
                </li>
              ),
            )}
          </ol>
          <Button type="button" size="icon-sm" variant="outline" aria-label="Next page" disabled={last} onClick={() => go(page + 1)}>
            <ChevronRight />
          </Button>
          <Button type="button" size="icon-sm" variant="outline" aria-label="Last page" disabled={last} onClick={() => go(pages - 1)}>
            <ChevronsRight />
          </Button>
        </div>
      </div>
    </nav>
  );
}
