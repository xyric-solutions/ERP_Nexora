# Company Currency Country Selection Persistence

## Problem

In **Finance > Company Currencies**, the country selector loads a bounded, remotely filtered directory. Selecting a country clears the popup search. The resulting unfiltered request replaces the current result set with its first 50 rows. If the selected country is outside that page, the selector can no longer resolve its label and the form can no longer derive that country's currency mappings. The chosen country therefore appears to disappear and the Currency field may lose its choices.

## Scope

Fix the create-company-currency dialog so a selected country and all of its returned currency mappings remain available while later directory searches or first-page reloads complete.

This change will not alter:

- company base-currency or exchange-rate rules;
- server APIs, contracts, or database data;
- the shared selector's public behavior;
- permissions, validation, or submission payloads.

## Design

The Company Currencies view will keep the selected country's complete mapping rows in state separate from the transient `countries` search result page.

When a country is selected, the view will:

1. Collect every mapping for that country from the current search result.
2. Store those mappings as the selected-country snapshot.
3. Set the selected country code and preferred currency as it does today.

The country options supplied to `SearchableSelect` will include the selected country even when it is absent from the latest result page. The Currency field will use the selected-country snapshot when it matches the active selection and otherwise use the current result page. Opening a new form or choosing a different country will replace or clear the snapshot deliberately.

Keeping this behavior in the Company Currencies view is intentional. Caching only a label in the shared `SearchableSelect` would repair the visible trigger but would not preserve the country-to-currency mappings required by the adjacent Currency field.

## Async Behavior

Search results remain replaceable and bounded. A late unfiltered response may replace the visible directory page, but it cannot erase the selected-country snapshot. Selecting a new country updates the snapshot atomically with the country and preferred currency values.

## Error Handling

Existing directory-loading errors remain unchanged. The snapshot is sourced only from a successful directory response; no country or currency data is invented locally.

## Testing

Add regression coverage for this sequence:

1. A filtered response contains a country and its currency mapping.
2. The user selects that country.
3. A later unfiltered page does not contain the selected country.
4. The selected country label remains visible.
5. Its mapped currency remains available and selected.

Run the focused tests, TypeScript validation for the affected code, ESLint on changed source/tests, `git diff --check`, and the web build when feasible.

## Success Criteria

- The selected country remains visible after the search resets and results reload.
- The mapped currency remains available.
- Choosing another country replaces the preserved selection cleanly.
- Existing remote search, permissions, validation, and finance rules remain unchanged.
