# Chart of Accounts Workspaces Implementation Plan

## Outcome

Deliver three visible Chart of Accounts workspaces—Categories, Sections, and
Nominals—with separate hidden form/detail routes. Reuse the approved
`nexora-standard-coa` catalogue and the existing company adoption records so
the 14 reviewed Categories and 78 reviewed Sections appear together with any
company-created additions.

## Implementation

1. Extend the company hierarchy read contract with exact server-calculated
   Section and Nominal totals for every header.
2. Keep the existing tenant/company authorization, cursor bounds, audit,
   idempotency, immutable identity, and Super Admin mutation rules unchanged.
3. Replace the mixed hierarchy screen with:
   - a collapsed Category directory with expandable Sections and lazy Nominals;
   - a Section directory grouped under bold Category headings;
   - separate Category and Section create/edit forms.
4. Expose exactly Categories, Sections, and Nominals in the Chart of Accounts
   sidebar. Keep legacy overview, central template, form, and detail routes
   resolvable but hidden.
5. Preserve the existing Nominal directory and form behavior.
6. Make all interactive create forms read-only for codes: allocate sequential
   `CAT-###` Category codes, accounting-band four-digit Section codes, and the
   existing Section-based Nominal codes transactionally on the server. Preserve
   existing codes and controlled explicit Section codes used by catalogue/import
   integrations.
7. Add focused API, component, and navigation tests, regenerate API artifacts
   if required, run the UI theme audit, and record the migration checkpoint.

## Data Safety

- Do not seed or rewrite company accounts directly.
- Treat `packages/db/catalogs/approved-chart-20261020.json` as the reviewed
  catalogue source and the existing chart-template adoption workflow as the
  only bulk application path.
- Do not renumber, reparent, reactivate, classify, approve, or post any account.
- Include active and inactive records when calculating the next code; never reuse
  a historical number. Serialize allocation within tenant/company/type scope.
- Additional company Categories and Sections remain visible and editable under
  the existing governed authority.

## Verification

- Focused unit tests for navigation, collapsed totals, expansion, lazy Nominal
  loading, form creation, permissions, and errors.
- Finance hierarchy integration tests for aggregate totals and isolation.
- Contract/OpenAPI generation checks, ESLint, TypeScript, UI theme audit,
  `git diff --check`, and `npm.cmd run build:web`.
