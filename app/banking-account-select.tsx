"use client";

/**
 * Searchable nominal-account selector for the isolated Nexora UI/UX prototype.
 *
 * Filters the Chart of Accounts by code, name or section and shows the normal
 * balance side so the posting effect is obvious at the point of selection.
 */

import { useId, useMemo, useRef, useState } from "react";
import {
  accountNormalSide,
  findAccount,
  postableAccounts,
  type NominalAccount,
} from "./banking-master-data";

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
      className="nx-account-select"
      ref={containerRef}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node)) setOpen(false);
      }}
    >
      <label className="nx-account-select__label" htmlFor={id}>
        {label}{required ? <em aria-hidden="true"> *</em> : null}
      </label>
      <button
        aria-controls={listId}
        aria-expanded={open}
        aria-haspopup="listbox"
        className={`nx-account-select__trigger${error ? " nx-account-select__trigger--error" : ""}`}
        disabled={disabled}
        id={id}
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        {selected ? (
          <span className="nx-account-select__value">
            <b>{selected.code}</b>
            <span>{selected.name}</span>
            <i data-side={accountNormalSide(selected)}>{accountNormalSide(selected) === "debit" ? "Dr" : "Cr"}</i>
          </span>
        ) : (
          <span className="nx-account-select__placeholder">Search the Chart of Accounts…</span>
        )}
        <span aria-hidden="true" className="nx-account-select__caret">⌄</span>
      </button>

      {open ? (
        <div className="nx-account-select__panel">
          <input
            aria-label={`Search accounts for ${label}`}
            className="nx-account-select__search"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search by code, name or section"
            ref={(node) => { node?.focus(); }}
            value={query}
          />
          <ul className="nx-account-select__list" id={listId} role="listbox" aria-label={label}>
            {results.length === 0 ? (
              <li className="nx-account-select__empty">No account matches “{query}”.</li>
            ) : (
              results.map((account) => (
                <li key={account.code}>
                  <button
                    aria-selected={account.code === value}
                    className={account.code === value ? "is-selected" : undefined}
                    onClick={() => commit(account.code)}
                    role="option"
                    type="button"
                  >
                    <b>{account.code}</b>
                    <span>
                      <strong>{account.name}</strong>
                      <small>{account.section}</small>
                    </span>
                    <i data-side={accountNormalSide(account)}>{accountNormalSide(account) === "debit" ? "Dr" : "Cr"}</i>
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>
      ) : null}

      {error ? <p className="nx-field-error" role="alert">{error}</p> : helper ? <p className="nx-field-help">{helper}</p> : null}
    </div>
  );
}
