import type { SearchableSelectProps } from "../../app/shared/ui/searchable-select.js";

// Directory/form unit tests isolate the primitive. Actual popup, keyboard and
// search visibility behavior is covered by searchable-select.test.tsx and E2E.
export function SearchableSelectDouble(p: SearchableSelectProps) {
  return (
    <>
      <select
        aria-label={p.label}
        aria-required={p.required}
        disabled={p.disabled || p.loading}
        value={p.value}
        onChange={(e) => p.onValueChange(e.target.value)}
      >
        <option value="">{p.placeholder}</option>
        {p.options
          .filter((o) => o.value !== "")
          .map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
      </select>
      <input
        aria-label={p.searchLabel ?? `Search ${p.label.toLowerCase()}`}
        value={p.search ?? ""}
        onChange={(e) => p.onSearchChange?.(e.target.value)}
      />
      {p.footer}
    </>
  );
}
