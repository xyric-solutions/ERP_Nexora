# Bank Statement Import Work Page and Form Design

Date: 2026-10-23
Status: Implemented; verification complete

## Goal

Align the live Bank Statement Import work page and import form with the supplied
ERP references while preserving the completed API, database, security, mapping,
validation, audit, and reconciliation-staging behavior.

## Scope

This change covers two routed surfaces:

1. The default `Import Statement` route displays a database-backed work page.
2. `Add New` opens the upload form, while selecting a persisted import opens its
   review form.

The change does not add statement deletion, PDF parsing, ledger posting, or a
second persistence path.

## Routing and Component Boundaries

- Add a focused statement-import register component rather than extending the
  already large upload/review component.
- The shell routes the base `import-statement` page to the register,
  `import-statement/new` to a new form, and a persisted import identifier to the
  existing review lifecycle.
- All browser data continues through `BankingApiClient` and the versioned
  `/api/v1` Banking API. Browser code never connects directly to PostgreSQL.

## Work Page

The register follows the first reference image:

- Page heading: `Import Statement`.
- Primary `Add New` action.
- Bank Account and Reference filters with a clear action.
- Page-size selection, defaulting to 25 and bounded to the API maximum.
- Table columns: selection indicator, ID, Bank, From Date, To Date, Ref. No.,
  Status, and Action.
- Row action opens the persisted import; selection is presentation-only until a
  governed bulk action exists.
- No delete icon is rendered. Imported statements are audited financial records
  and the backend intentionally exposes no delete endpoint.
- Loading, permission, error, empty, pagination, and result-count states remain
  explicit and accessible.

The register uses the existing company-scoped statement-import directory API.
The summary contract gains nullable `statement_date_from` and
`statement_date_to` fields derived by PostgreSQL from the minimum and maximum
valid transaction dates for each import. The values are never inferred from the
browser or hardcoded.

## Import Form

The form follows the second reference image while retaining production controls:

- A bordered Search/upload panel contains Bank, Date Format, File, template
  export, Upload, and Statement Ref. No.
- Company remains part of every API request. When only one permitted company is
  available it is selected automatically and summarized without adding visual
  noise; when multiple companies are available, an explicit Company selector is
  shown.
- CSV and XLSX remain the supported formats, with existing size, row-count,
  content, parser, and mapping validation.
- Saved bank-native mapping selection and the advanced mapping editor remain
  available without dominating the primary form.
- Parsed rows use the reference columns: Date, Payment, Receipts, Transaction
  Type, Account, Payment Mode, Ref No., Detail, and Status. Existing row-level
  inclusion, duplicate resolution, issues, and audited Apply behavior remain
  available.
- `Cancel` returns to the work page. `Save and Close` is shown only after a
  persisted upload exists. `Post and Close` finalizes validated rows for Bank
  Reconciliation and then starts reconciliation; it never posts a ledger
  journal. The staging warning remains visible.

## Security and Data Integrity

- Retain cookie authentication, CSRF validation, permissions, company isolation,
  impersonation restrictions, idempotency keys, optimistic versions, audit
  events, immutable finalized imports, and the 1,000-row bound.
- Keep register queries bounded and company-scoped.
- Do not add fixture fallbacks, synthetic data, direct database calls, silent
  deletion, or client-only financial state.
- Existing finalized statements and reconciliation links remain compatible.

## Error and Empty States

- API failures use the standard problem response and show the correlation
  reference when available.
- A missing permission renders the existing permission alert.
- Empty directories and empty parsed statements render explicit table messages.
- Busy actions disable conflicting operations and retain their current progress
  labels.

## Verification

Implementation will start with failing tests and cover:

- Base/new/detail routing.
- Register loading, filters, pagination, empty/error/permission states, and row
  navigation.
- Database-derived From/To dates and company isolation in the list repository.
- Screenshot-aligned form structure without weakening the upload lifecycle.
- CSV/XLSX upload, mapping, row update, validation, finalization, and handoff
  regressions.
- Contract generation/synchronization, unit and relevant disposable-database
  integration tests, TypeScript, ESLint, Prettier, `git diff --check`, API build,
  and production web build.

Database-mutating integration tests must use the repository's disposable test
harness or an explicitly approved target. No Railway deployment, production
migration, or commit is part of this work.
