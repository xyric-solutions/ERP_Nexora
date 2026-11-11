# Shared work-page controls and forms

The requested scope covers Banking, Purchasing and the other module work pages,
including create/edit forms (the user's clarification selected option 2).

## Lists

- Reuse the existing table contents, actions, selection state and authorized API
  adapters through `WorkTable`. Add text and field filters, a column checklist,
  reset, and a bottom pager with 10, 25, 50 and 100 rows. Default to 25.
- Retain existing company, date, status and server search controls. Clearly label
  additional client filters as applying to loaded rows on server-backed lists.
- Keep one pager per list. Existing offset and cursor directories retain their
  server navigation; append-based directories fetch only the requested page.
  Show a `+` when a cursor indicates more records instead of inventing a total.
- Keep group headings beside matching records, preserve mounted row state, and
  print matching loaded rows across screen page boundaries.
- Persist column visibility and local page size by module/page, table and column
  signature. Storage failures must not block normal use.

## Forms

Use shared form surfaces and responsive labeled fields. Supplier/payment fields
retain the previously approved continuous layout. Native submit handlers,
validation, disabled states, draft state, save callbacks and approval actions stay
with their feature. Shared HR and Identity drawers use the same form context.

Editable transaction lines, print documents and hidden chart accessibility tables
remain complete native tables; list pagination must not hide required inputs or
truncate a document. The assistant chat composer is outside create/edit scope.

## API and verification

No server contract, authorization or posting workflow changes are needed. HR APIs
that allow 50 rows compose a 100-row UI page from two bounded, validated reads.
A failure rejects the whole page; changed source hashes require a refresh.

Validate shared controls and existing feature behavior with unit tests, a
production build, type checking, lint comparison, theme auditing and read-only
browser fixtures at desktop/mobile widths in both themes. Record coverage and
remaining exceptions in `docs/architecture/remaining-ui-migration.md`.
