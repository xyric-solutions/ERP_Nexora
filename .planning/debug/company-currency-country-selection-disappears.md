# Company currency country selection disappears

## Status

Root cause confirmed. Investigation only; no production or test files changed because the design approval gate is active.

## Symptoms

- Surface: Finance > Company Currencies > Add New Currency.
- Expected: after choosing a searched country, the trigger keeps the selected country label visible and its mapped currencies remain available.
- Actual: the option is visible and selectable, then the country/currency selection becomes non-visible.
- Reported error: none.

## Root cause

The dialog uses the same `countries` array for two different responsibilities:

1. the current remote-search result page; and
2. the authoritative data needed to render the selected country and its currency mappings.

`SearchableSelect` resolves its displayed selection only from the current `options` array (`app/shared/ui/searchable-select.tsx:49`). Its popup input is controlled by `countrySearch`. Base UI clears an input rendered inside the popup after a single-item selection using an `input-clear` change event (installed `AriaCombobox.js:724-752`), and `SearchableSelect` intentionally forwards that clear (`searchable-select.tsx:68`).

That clear changes `countrySearch` to an empty string. The Finance view then requests the unfiltered first 50 directory mappings and replaces the entire `countries` array (`company-currencies-workspace.tsx:150-151`). If the selected country is not in that first page:

- `countryOptions` no longer contains its `countryCode`, so `SearchableSelect` computes `selected = null` and shows the placeholder;
- `mappedCurrencies` becomes empty because it is also derived from the replaced `countries` page (`company-currencies-workspace.tsx:169-171`).

This is a client state-lifetime bug, not a Base UI defect and not a country-catalog/API mapping defect.

## Evidence

- The country request is capped at 50 rows and search results replace state rather than being merged or cached: `company-currencies-workspace.tsx:150-151`.
- The server orders the active catalog by country name and applies the requested limit in `server/api/src/modules/finance/currencies/source-repository.ts:409-416`.
- A read-only query against the current UAT database places Pakistan at directory position **165**, so it is absent from the unfiltered first 50 rows after the search is cleared.
- The shared selector displays a label only when `options.find(item => item.value === value)` succeeds: `searchable-select.tsx:49`.
- The existing Finance view test uses a mock that returns both United States and Pakistan for every country request, regardless of query, and asserts immediately after the click. It therefore cannot reproduce the subsequent result-page replacement.
- The existing shared selector test uses static options, so clearing its search cannot evict the selected option.
- Baseline verification: `npx.cmd vitest run --config vitest.unit.config.ts tests/unit/finance-currencies-view.test.tsx tests/unit/searchable-select.test.tsx` passed (2 files, 11 tests), confirming the issue is a missing async-result-replacement case rather than an existing failure.

## Minimal fix approaches

### 1. Cache the selected country's mappings in the Finance view (recommended)

When `chooseCountry` runs, retain all mappings for that country in dedicated selection state. Build `countryOptions` from the current result page plus the retained selection, and derive `mappedCurrencies` from the retained mappings while that country is selected. Clear the cache in `resetForm`.

- Benefits: preserves normal unfiltered browsing and remote search, survives result replacement and request races, and keeps the change local to the only consumer needing country-to-currency mapping data.
- Cost: adds a small, explicit piece of selection state and deduplication logic.

### 2. Query the selected country explicitly whenever search is empty

After selection, call the existing country directory endpoint with `country_code=<selected>` instead of loading the unfiltered first page. Search text continues to take precedence while the user types.

- Benefits: very small change and the server remains the source of truth.
- Cost: reopening the blank selector initially shows only the selected country instead of the normal first page; it also adds a request on selection and needs careful stale-request handling.

### 3. Merge the selected rows into each subsequent result page

When a directory response arrives, preserve rows matching the current selected country and merge/deduplicate them with `result.items`.

- Benefits: smallest state-shape change and preserves browsing.
- Cost: selection retention is hidden inside request-result merging, requires careful dependency/race handling, and is less explicit than approach 1.

Changing `SearchableSelect` alone is not sufficient: it could retain the visible label, but the Finance view would still lose the selected country's currency mappings when `countries` is replaced.

## Required regression coverage

Add a Finance view test whose country mock behaves like the server:

1. an initial unfiltered page does not contain Pakistan;
2. `search=Pakistan` returns the Pakistan/PKR mapping;
3. after selecting it, the Base UI `input-clear` causes another unfiltered response without Pakistan;
4. after that response settles, the trigger still displays `Pakistan (PK)`, the currency select remains `PKR`, and Save submits `country_code: "PK"` / `currency_code: "PKR"`.

