# Product creation, compact cards and one company control

Status: Proposed for owner review. No application implementation changes yet.

## Requested outcome

Make Inventory > Products > Add New open a usable product form, reduce the size
of product cards, and show the current operating company once in the persistent
ERP top row instead of repeating the context selector on workpages. Preserve the
existing login credentials, product workflow, server permissions and accounting.

## Findings

- The live authenticated account has `inventory.item.create` in both accessible
  companies. Both have a configured USD base-currency profile. Inventory options
  returns HTTP 200 with an empty currency list, so Add New is disabled silently.
- Inventory transactions set `nexora.tenant_id` but omit `nexora.user_id`.
  `company_currency_scope_access` requires both tenant context and the user's
  non-revoked company access. The Finance currency repository supplies both.
  Restricted runtime database access therefore hides currencies from Inventory;
  tests using a privileged database connection can miss this failure. Product
  save validates the same currency authority and needs the context correction too.
- Product cards use a three-column desktop grid, `p-4`, `space-y-4` and larger
  titles. A small catalogue consequently leaves substantial space within cards.
- SessionProvider already owns the active company and authenticated company
  directory/switch APIs. Its keyed workspace remount isolates company changes.
  The shell reports unsaved forms to an existing navigation guard. The current
  account menu shows the company only when opened; the top row has no persistent
  company control. Several workpages repeat a single-company selector.

## Approaches

1. **Recommended: repair the underlying Inventory context and consolidate the
   real session company control.** Compact the existing cards and remove redundant
   operating-company selectors. This fixes creation and makes company context
   consistent while keeping authorization and currency validation intact.
2. **UI-only enabling and hiding.** Enabling Add New without correcting its
   currency authority would still fail on save. Hiding company fields with CSS
   would retain duplicate state and inaccessible controls. Do not use this option.

## Proposed implementation

### Product creation

- Set the authenticated user ID transaction-locally beside the existing tenant
  ID in Inventory. Keep server permission checks, company authority, impersonation
  restrictions, currency status/precision validation and parameterized queries.
  Do not grant broad database access or change row-level security policies.
- Reuse ProductForm, real Inventory options and existing create/update APIs.
  Preserve automatic product codes, validation, idempotency and audit history.
- Once options load, Add New opens the existing form. Distinguish loading/error
  states from a genuinely missing active company currency. For missing setup,
  provide a clear explanation and the existing currency-setup recovery path to
  authorized users. Never invent a currency or activate financial settings silently.
- Verify creation, reload and edit with a restricted non-owner database role,
  including denied access, revoked company access and pooled-connection isolation.

### Product cards

- Modify the current grid and card markup only. Use compact padding, smaller
  headings and tighter internal spacing, with roughly 240–280px cards on desktop
  rather than expanding a small catalogue into wide cards. Allow responsive
  wrapping and content-driven height; keep a full-width card on narrow screens.
- Preserve name, code/reference, type, price/unit, stock state, category/status,
  keyboard focus, click-to-open, list view, search, filters and pagination.
- Use existing Tailwind/shadcn primitives and semantic colour/font tokens.

### Global company context

- Show one labelled company control in the persistent top row, using the real
  active company. Keep its name visible with sensible truncation on narrow
  screens and expose the full name accessibly. Adapt nearby optional top-row
  controls as necessary to avoid mobile overflow.
- Load only the authenticated company directory. Switch through the existing
  session API with loading/error feedback. Route switching through the existing
  unsaved-form guard before changing the session. Cancel preserves the form and
  active company; failure preserves the current company and allows retry.
- On successful switching, clear record-specific navigation and remount the
  company workspace so stale data, selections and in-flight results cannot leak
  into another company. Preserve authorization on every API request.
- Remove redundant operating-company selectors from Products, warehouse/transfer,
  Purchase and Accounting hierarchy workpages/forms, and audit the remaining
  active feature views for the same pattern. Bind their operating scope to the
  session company and retain their unavailable/unauthorized states.
- Company values that are actual business data remain: company administration,
  company-role assignments, intercompany transaction parties, organization trees,
  historical employer fields and document/print identity. They do not switch the
  operating workspace and must not be removed as duplicate context controls.

## Verification and delivery

- Add focused UI tests for working Add New, option loading/failure/missing setup,
  compact card content, one top-row selector and company switching with unsaved
  forms. Add restricted-role product currency/read/write regression coverage.
- Run relevant unit/integration/security tests, typecheck, touched-file lint and
  formatting, production builds, theme audit write/check and `git diff --check`.
- Verify real product create/save/reload on disposable test data. Inspect the
  Products list/form and representative Inventory, Purchase, Accounting and HR
  pages in both themes at desktop/tablet/mobile widths. Check keyboard operation,
  company isolation, accessibility and overflow; retain private evidence in tmp/.
- The live environment currently uses an older compatible API/frontend. Deliver
  the narrowly scoped fix against that compatible source and verify provenance
  before service replacement. Do not deploy the latest incompatible API or apply
  the separately gated procurement/asset migrations. If compatibility cannot be
  established, report the specific blocker instead of bypassing the rollout gate.
- Update existing migration/startup documentation and push reviewed changes to
  `shoaib_nexora`. Preserve credentials, existing products and financial records.

## Scope boundaries

No new workflow, dependency, database schema, demo data, automatic currency
activation, financial posting, password reset or permission expansion. Existing
product records are not renumbered. The earlier full Purchase/Assets rollout
continues to require its separate database backup/migration authorization.
