"use client";

/**
 * Searchable nominal-account selector for the isolated Nexora UI/UX prototype.
 *
 * Filters the Chart of Accounts by code, name or section and shows the normal
 * balance side so the posting effect is obvious at the point of selection.
 */

import { useId, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  accountNormalSide,
  findAccount,
  postableAccounts,
  type NominalAccount,
} from "../model/banking-master-data";

interface AccountSelectProps {
  id: string;
  label: string;
  value: string;
  onChange: (code: string) => void;
  helper?: string;
  error?: string;
  suggested?: readonly string[];
  /** Restrict the list, e.g. to bank control accounts. */
  filter?: (account: NominalAccount) => boolean;
  required?: boolean;
  disabled?: boolean;
}

export function AccountSelect({
  id,
  label,
  value,
  onChange,
  helper,
  error,
  suggested = [],
  filter,
  required,
  disabled,
}: AccountSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const listId = useId();
  const containerRef = useRef<HTMLDivElement | null>(null);

  const pool = useMemo(() => (filter ? postableAccounts.filter(filter) : postableAccounts), [filter]);
  const selected = findAccount(value);

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? pool.filter((account) =>
          account.code.toLowerCase().includes(needle)
          || account.name.toLowerCase().includes(needle)
          || account.section.toLowerCase().includes(needle),
        )
      : pool;
    if (needle || suggested.length === 0) return matches.slice(0, 40);
    // Surface the type's suggested accounts first when nothing is typed.
    const suggestedSet = new Set(suggested);
    const preferred = matches.filter((account) => suggestedSet.has(account.code));
    const rest = matches.filter((account) => !suggestedSet.has(account.code));
    return [...preferred, ...rest].slice(0, 40);
  }, [pool, query, suggested]);

  const commit = (code: string) => {
    onChange(code);
    setQuery("");
    setOpen(false);
  };

  return (
    <div
      className="relative grid min-w-0 gap-1.5"
      ref={containerRef}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label className="text-xs font-semibold" htmlFor={id}>
        {label}{required ? <em aria-hidden="true"> *</em> : null}
      </label>
      <Button
        variant="outline"
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`h-10 w-full justify-between px-3 text-left text-sm ${error ? "border-destructive" : ""}`}
        disabled={disabled}
        id={id}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2 overflow-hidden">
            <b className="text-xs font-bold tabular-nums">{selected.code}</b>
            <span className="min-w-0 truncate text-xs">{selected.name}</span>
            <i className={`shrink-0 rounded-sm px-1.5 py-0.5 text-xs font-bold not-italic ${accountNormalSide(selected) === "debit" ? "bg-primary/10 text-primary" : "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]"}`} data-side={accountNormalSide(selected)}>{accountNormalSide(selected) === "debit" ? "Dr" : "Cr"}</i>
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Search the Chart of Accounts…</span>
        )}
        <span aria-hidden="true" className="text-xs text-muted-foreground">⌄</span>
      </Button>

      {open ? (
        <div className="absolute inset-x-0 top-[calc(100%+0.25rem)] z-40 rounded-md border border-border bg-card p-2 shadow-md">
          <Input
            aria-label={`Search accounts for ${label}`}
            className="h-9 w-full text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by code, name or section"
            ref={(node) => { node?.focus(); }}
            value={query}
          />
          <ul className="mt-2 grid max-h-65 list-none gap-0.5 overflow-y-auto p-0" id={listId} role="listbox" aria-label={label}>
            {results.length === 0 ? (
              <li className="px-2 py-3 text-sm text-muted-foreground">No account matches “{query}”.</li>
            ) : (
              results.map((account) => (
                <li key={account.code}>
                  <button
                    aria-selected={account.code === value}
                    className={`grid w-full grid-cols-[5.375rem_minmax(0,1fr)_auto] items-center gap-2 rounded-md border-0 bg-transparent px-2 py-2 text-left hover:bg-muted max-sm:grid-cols-[4.625rem_minmax(0,1fr)_auto] ${account.code === value ? "bg-muted" : ""}`}
                    onClick={() => commit(account.code)}
                    role="option"
                    type="button"
                  >
                    <b className="text-xs font-bold tabular-nums">{account.code}</b>
                    <span>
                      <strong className="block text-xs font-semibold">{account.name}</strong>
                      <small className="block text-xs text-muted-foreground">{account.section}</small>
                    </span>
                    <i className={`rounded-sm px-1.5 py-0.5 text-xs font-bold not-italic ${accountNormalSide(account) === "debit" ? "bg-primary/10 text-primary" : "bg-[var(--nx-success-soft)] text-[var(--nx-success-text)]"}`} data-side={accountNormalSide(account)}>{accountNormalSide(account) === "debit" ? "Dr" : "Cr"}</i>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {error ? <p className="m-0 text-xs font-semibold leading-snug text-destructive" role="alert">{error}</p> : helper ? <p className="m-0 text-xs leading-snug text-muted-foreground">{helper}</p> : null}
    </div>
  );
}
