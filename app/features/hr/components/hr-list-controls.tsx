"use client";

import { useState } from "react";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Rows per page for HR & Payroll lists. */
export const HR_PAGE_SIZE = 15;

/** Case-insensitive match of a typed search against a row's visible text. Empty search matches all. */
export function matchesSearch(search: string, values: readonly unknown[]): boolean {
  const term = search.trim().toLowerCase();
  if (!term) return true;
  return values.some(
    (value) => (typeof value === "string" || typeof value === "number") && String(value).toLowerCase().includes(term),
  );
}

/**
 * Client-side page of `rows`. The page returns to the first one whenever `resetKey`
 * changes (search text, filter, company) and is clamped when the list shrinks.
 */
export function useHrPage<T>(rows: readonly T[], resetKey: string) {
  const [state, setState] = useState({ key: resetKey, page: 0 });
  const pageCount = Math.max(1, Math.ceil(rows.length / HR_PAGE_SIZE));
  const page = state.key === resetKey ? Math.min(state.page, pageCount - 1) : 0;
  return {
    page,
    pageCount,
    total: rows.length,
    pageRows: rows.slice(page * HR_PAGE_SIZE, (page + 1) * HR_PAGE_SIZE),
    setPage: (next: number) => setState({ key: resetKey, page: Math.max(0, Math.min(next, pageCount - 1)) }),
  };
}

/** "16–30 of 42" with Previous / Next. Hidden while everything fits on one page. */
export function HrPagination({
  page,
  pageCount,
  total,
  onPageChange,
  label = "Pages",
}: {
  page: number;
  pageCount: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (total <= HR_PAGE_SIZE) return null;
  const first = page * HR_PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * HR_PAGE_SIZE);
  return (
    <nav aria-label={label} className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
      <span aria-live="polite">
        {first}–{last} of {total}
      </span>
      <div className="flex items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => onPageChange(page - 1)}>
          <ChevronLeftIcon aria-hidden="true" />
          Previous
        </Button>
        <span className="tabular-nums text-foreground">
          Page {page + 1} of {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={page >= pageCount - 1}
          onClick={() => onPageChange(page + 1)}
        >
          Next
          <ChevronRightIcon aria-hidden="true" />
        </Button>
      </div>
    </nav>
  );
}

/** Labelled search box used in HR list toolbars; filters as you type. */
export function HrSearchField({
  id,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <label className="grid min-w-0 content-start gap-1.5 text-sm font-medium" htmlFor={id}>
      Search
      <Input
        id={id}
        type="search"
        value={value}
        maxLength={100}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
