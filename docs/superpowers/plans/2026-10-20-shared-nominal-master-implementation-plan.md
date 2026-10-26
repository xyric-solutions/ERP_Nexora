# Shared nominal master implementation

Approved design: ../specs/2026-10-20-shared-nominal-master-design.md.

- [x] NM-01 Add ordinary-nominal governance, code policy, immutable evidence,
  tenant/company constraints and isolated upgrade tests without changing Bank
  identities or historic migrations.
- [x] NM-02 Extend existing Finance contracts/repository for ordinary nominal
  lifecycle with Finance-only permissions, audit and idempotency.
- [x] NM-03 Route Chart of Accounts to the live shared directory; extend the
  shared form while retaining Bank-only entry points and notifications.
- [x] NM-04 Add bounded Bank nominal search beyond the initial 100 records,
  preserving company scope and selected values.
- [x] NM-05 Execute isolated DB/API tests and browser acceptance, typecheck,
  API generation checks, focused lint and production build.
- [x] NM-06 Document setup/import prerequisites and duplicate findings.

Never delete same-name Bank records merely because their labels match. The
five inspected records have distinct identifiers and immutable history.
Do not import prototype balances or activate catalog templates automatically.

## Verified handoff — 2026-10-20

- Additive Finance migrations 11 and 12 provide ordinary governance and
  dependency guards. Applied first to the isolated test DB, then to local
  nexora_source_test after backups in ignored tmp/bank-readiness-20261020.
  Existing Bank migrations/IDs were not rewritten. API readiness requires 12.
- Chart of Accounts overview and Nominals share the real Finance directory.
  Ordinary forms require Finance permissions only; Bank entry points remain
  Cash & Bank-only and require Finance plus Banking permissions.
- Ordinary create/edit/submit/approve/reject/deactivate use immutable events,
  scoped authorization, expected versions, duplicate protection and idempotency.
  Self-approval uses the central Finance-bound super-admin override evidence.
- Both Bank forms have bounded server-side nominal search, retain selected
  identities and exclude non-postable/system/reconciliation control accounts.
- Observed: 107 focused unit/component tests, 36 isolated PostgreSQL integration
  tests, 19 database-security tests, typecheck, API consistency, focused lint,
  whitespace and production web build passed. Chromium verified ordinary
  creation/approval/reload, both Bank selectors and Payment draft persistence.
  No journal was posted; no posting period was opened.
- Interrupted browser runs left three synthetic ordinary accounts active; all
  three were deactivated via the authorized API. Their audit history and
  synthetic draft references were retained. The final browser run deactivated
  its own synthetic nominal. No accounts were deleted.
- Local UAT sections/code ranges for all five types and an explicit 2026
  reference calendar were provisioned using the existing guarded UAT script.
  These are synthetic test setup, not an adopted business catalog.

## Next authorized boundary

Review docs/architecture/nominal-catalog-import-review.md. The 23 prototype
names/codes are proposals only, with no balances included. Confirm the target
company, real account names, hierarchy/code ranges, currency and subledger
control classifications before import/activation. Bank/control nominals must
not be made ordinary payment offsets merely to fill a dropdown.

Five legacy Bank Operating Test records have distinct identifiers and 20
immutable Bank events; they are not confirmed duplicates and were preserved.
Do not conflate completion of this shared master slice with completion of the
entire Bank, Finance, HR or posting acceptance program.
