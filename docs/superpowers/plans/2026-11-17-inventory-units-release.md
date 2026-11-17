# Unit of Measure: targeted local release procedure

Status: Prepared for owner review. Not executed against the recovered business database.

## Reviewed scope and current state

Read-only inspection on 17 November 2026 confirmed `nexora_local_recovery` has
Inventory 2, Purchase/Procurement 5 and Fixed Assets 2. `inventory_unit` is absent.
The running web/API still use the previous verified compatible release. Login and
protected runtime configuration remain unchanged. No business database write,
backup, restore or service replacement has been performed for this feature.

The prepared source is `tmp/units-of-measure/release/source`, derived from the
existing compatible source with only the approved unit changes applied. Purchase
contracts/API were ported narrowly to retain their existing accounting calculations.
Automatic migrations must remain disabled. Do not run the root API against this
database and do not call a blanket migration routine.

Candidate web build: `tmp/uom-complete-build` relative to the candidate.
Build ID: `6iP_WnyyTYJrbamyd8mqi`.

Only new business-schema migration:

- `packages/db/source-migrations/inventory/0003_units_of_measure.forward.sql`
- SHA-256: `54280696F46E666791BF9FFCE0B312461B4FE07AA4F4928000F5E4B2EBEDA2D9`
- Apply with the candidate's `migrateSourceModule(pool, "inventory", {throughVersion: 3})`.
- Keep Procurement at 5 and Fixed Assets at 2. Do not apply their pending versions.

## Preflight and backup, after approval

1. Verify candidate build/API artifacts, source provenance and migration hash.
   Recheck the live ledger and ready/login endpoints. Identify current service
   PIDs from their runtime manifests and verify their command lines before stopping.
2. Pause ERP writes for the release. Load the existing DPAPI-protected runtime
   configuration in the process only; never print credentials or change passwords.
3. Create a PostgreSQL custom-format backup of `nexora_local_recovery` through
   container `nexora-local-recovery-postgres`, then copy it byte-for-byte to
   `tmp/units-of-measure/backups/pre-uom.dump`. Use `pg_dump -Fc -f` inside the
   container and `docker cp`; do not pipe a binary dump through PowerShell text
   redirection. Record the archive hash and command results privately.
4. Verify the archive with `pg_restore --list`, restore it into a uniquely named
   disposable `nexora_uom_restore_check_<suffix>` database and check its ledger
   and relevant record counts. Verify the database name before removing this test
   database. Keep the original archive. If any verification fails, stop and retain
   the old application/schema; do not apply the unit migration.

## Targeted migration and switch, after approval

1. Recheck exact database/host and Inventory 2 / Procurement 5 / Assets 2.
2. Run only Inventory through version 3 using the existing source migration runner.
   It reserves the module migration lock and applies the migration transactionally.
   Verify Inventory 3 / Procurement 5 / Assets 2 afterward.
3. Verify standard units and same-company product references. Product/document
   identities, quantities, totals, audit history and credentials must be retained.
4. Start the candidate API with the existing protected configuration and
   `DATABASE_AUTO_MIGRATE=false`; verify ready health before replacing the web.
5. Start the candidate web on localhost:3000 with production mode and the exact
   verified build directory. Update local runtime manifests/helpers to point to
   this candidate only after the health checks pass. Keep previous artifacts.
6. Verify sign-in with unchanged credentials, the new submenu, kg/gram/tonne
   conversion, Product Add New/unit options, existing Purchase requests and transfer
   forms, one global company selector and wrong-company denial. Do not create
   synthetic business records for acceptance. Resume writes after verification.

## Rollback

If migration or service acceptance fails while writes remain paused, stop the
candidate and use the verified pre-release archive plus the preserved compatible
artifacts to restore the release point. Recheck schema, records, login and health
before resuming writes. Never restore an old archive over records created after
writes resume; that would require a separate data-preserving recovery decision.

## Isolated evidence

`tmp/units-of-measure/verify-compatible.ts` initializes a disposable database with
explicit migration ceilings and the existing authorization fixture. It verifies
custom units, reverse conversion, product save, converted transfer and Purchase
request totals with Inventory 3 / Procurement 5 / Assets 2. It first creates a
legacy product/transfer at Inventory 2, then upgrades only Inventory and verifies
the base-unit backfill, original quantities and unchanged historical evidence.
The fixture's migration
entry point is adapted privately because its default calls all current migrations.
No authorization/data assertions are removed. The disposable database is removed
in `finally`; the business database is not involved.

Browser evidence is under `tmp/inventory-products-evidence` and
`tmp/inventory-operations-evidence`. The compatible build completes; its repeated
local build scan emits generated-cache CSS optimizer warnings already present in
the compatible build workflow. Route/theme verification is recorded in the
implementation plan. Root production builds complete without those warnings.
