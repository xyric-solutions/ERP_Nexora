# Local startup (Windows)

## Purchase / Bank integration — verified source, activation pending (18 November 2026)

The approved bridge and reports are implemented. The running business services
on ports 3000/4000 still use the compatible Unit of Measure release below. A
renewed release-scope question is pending: push source only, or also activate the
local database/API/web release. Do not interpret silence as activation approval.
No existing Purchase instructions were financially posted or supplier parties
created; credentials, company roles, July 2026–June 2027 and twelve Open periods
are unchanged.

The final additive schema chain was verified against a restored local backup:
Finance 39 → 40, Procurement 5 → 6 → 7, Fixed Assets 2 → 3–7; Inventory stays 3.
All 325 pre-existing table fingerprints were preserved. Do not start the latest
API against the older business schema. Automatic migrations remain disabled.
No live migration or service replacement has occurred for these extensions.

Local-only evidence and protected helpers are under
`tmp/purchase-bank-integration/`; backups stay under ignored `tmp/backups/`.
`backup-verification.json` records the archive checksum, exact migration hashes,
restore check and data preservation. The preview was checked on ports 3300/4100
against that restored database, preserving real browser Origin checks. It was
stopped after verification. Preview acceptance
does not alter the live API origin policy. Preview records are not production
posting evidence. Do not use a test-database initializer on the business database.

Before activation, confirm the selected scope, revalidate candidate source/build
and migration hashes, stop only the identified old services, apply the exact
verified chain and start the pinned candidate with protected configuration.
Check health, sign-in, roles, fiscal periods, original Purchase/Bank values and
read-only reports. Keep additive migrations if reverting the application; never
overwrite business evidence with the rehearsal database.

Purchase approval remains commercial approval. An authorized Finance user must
link each real supplier, configure AP/tax/discount/advance mappings as applicable,
prepare Bill recognition, obtain independent approval and post it before payment
settlement. Preparing a Purchase payment creates one linked accounting draft;
its final governed post creates one journal and Bank credit atomically. Missing
company-scoped Finance permissions remain explicit setup blockers. Startup and
verification never grant roles or post historical instructions.

The earlier Purchase discount/freight and integrated Fixed Assets extensions are
included in the candidate and its required migration chain. Their old rollout
commands are superseded by this verified chain; they have not been activated on
the business database. See the [implementation and checks](../superpowers/plans/2026-11-18-purchase-bank-reporting-integration.md).

## Unit of Measure release (17 November 2026)

The owner-approved Unit of Measure release is active on localhost. Its verified
backup restored successfully before applying only Inventory migration 3.
Procurement remains at 5 and Fixed Assets at 2; the separate extension above
remains pending. Existing credentials, records and permissions are preserved.

With the recovered Docker dependencies running, start the current release with:

```powershell
powershell -NoProfile -File tmp/units-of-measure/start-live-runtime.ps1
```

This guarded private helper uses `tmp/units-of-measure/release/source`, production
web build `tmp/journal-compact-final-build` (ID `2c4YRsVHQ5beFK1oeIEs_`), and its
compiled API. The compact Products/UOM/Warehouse/Stock Transfer and all Bank
menus follow-ups change only the frontend; the Unit of Measure API/schema remain.
The approved compact Manual Journal editor is also active: Save Draft and
Approve & Close reuse the existing governed APIs; required dimensions remain
conditional beneath the account selector, and optional actions have Finance-owned
visibility configuration. No journals are posted by startup or verification.
Approve & Close now displays and focuses missing requirements instead of silently
remaining disabled. Fiscal-year proposals follow the stored company calendar or
saved first-year setup month. The current July 2026–June 2027 year is unchanged.
The owner explicitly requested opening every month of that year: all twelve are
now Open, with eleven audited reopenings and October retained as already Open.
Opening the periods did not post existing Journals or change Bank balances.
The 17 November Journal/Bank reliability repair is also active in the compatible
API and frontend. Journal/recurring and Bank last-movement dates retain calendar
days. The Journal API exposes read-only period eligibility; forms distinguish
Awaiting approval and actual period blockers from posted Bank effects. Approval
refreshes the check and posting still validates inside its transaction. The
reliability repair did not post Journals or change Bank balances. No migration,
permission grant, financial posting or worker startup was performed. Both builds,
focused tests and 12 preview plus 12 live read-only cases passed. Private runtime
and rollback evidence is under `tmp/journal-bank-reliability/`. The
Journal compaction follow-up is live throughout the register, manual/recurring
forms, details, final review and reversal. Dimensions columns are removed from
read-only line tables; required input validation and stored data remain intact.
The compatible build has 15 generated-cache CSS optimization warnings. Private
evidence is under `tmp/journal-compact/`. The launcher probes an exclusive loopback
socket because Windows can return stale Listen rows with OwningProcess=0.

The compatible API also includes the 17 November Purchase currency-fetch repair:
Procurement transactions set both authenticated tenant and user context so the
existing company-currency security policy returns the permitted options. The
repair requires no schema migration, credential change or frontend replacement.
Automatic migrations remain disabled. `-Restart` validates artifacts and known process identities
before restarting. The previous Products compatible startup entry points now
forward to this release. See the [executed release evidence](../superpowers/plans/2026-11-17-inventory-units-release.md).

## Recovered workstation environment (16 November 2026)

The 17 November Products/global-company correction is live in the compatible
API and frontend. Inventory supplies transaction-local user context for currency
RLS; Add New works, cards are compact, and the top row owns operating-company
selection. The earlier single product/service selector correction remains. That
Products correction preserved the existing schema and login credentials. The full totals/
asset extension above retains its separate rollout gate. Private provenance,
runtime and browser reports: `tmp/products-global-company/`.

With the recovered Docker dependencies running, start this verified compatible
release from the repository root using its private helper. It reuses protected
configuration and explicitly disables automatic migrations. It does not start
workers or alter credentials, permissions, financial settings or schema. Do not
start the latest root API against the older recovered database.

```powershell
powershell -NoProfile -File tmp/products-global-company/start-compatible-runtime.ps1
```

The compatible starter above now forwards to the current Unit of Measure release
described above. Older recovery helpers below remain historical recovery tools
and select an earlier frontend/root API; do not use them for routine startup.

The current workstation was recovered from
`tmp/backups/before-tax-activation-20261112T105321Z.dump`, created on 12 November
2026. Its previous `nexora_postmerge_service` database used the test stack's
temporary filesystem and was absent after Docker stopped. The original archive
is retained unchanged; records created after that backup are not recovered.

The recovered environment uses the existing root web app on
`http://localhost:3000/login` and API on `http://127.0.0.1:4000`. PostgreSQL runs on
`127.0.0.1:55435`, with database `nexora_local_recovery` in Docker volume
`nexora-local-recovery-postgres-data`. Private object storage runs on port 59002
with volume `nexora-local-recovery-minio-data`. Sessions use the local Redis
instance on port 56380, database 6. The API uses the restricted `nexora_app` role.

With Docker Desktop running, start these recovered services using the
workstation-local helper:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File tmp/login-recovery/start-runtime.ps1
```

The ignored `tmp/login-recovery` directory contains the helpers, recovery and
verification reports, and Windows DPAPI-encrypted runtime credentials. Keep it
private and preserve it for restarts; its encrypted credentials are bound to the
current Windows account. It is not a portable deployment configuration. No
`.env` file was created or changed. The helpers preserve account passwords and
permissions, record the login-index recovery in the security audit, and do not
start financial posting workers. The SQL archive does not contain uploaded file
bytes. No encrypted banking, supplier, employee-bank or payroll-export records
were present in the recovered database.

The general Compose/logon setup below remains available but requires its own
configured `.env`; it is separate from this recovered workstation runtime.

## General Compose/logon setup

The local Nexora stack starts automatically at Windows logon.

| Piece | Where | Port |
| --- | --- | --- |
| Web (Next.js dev) | started by `scripts/start-local.ps1` | `127.0.0.1:3005` |
| API | `compose.yaml` service `api` | `127.0.0.1:4000` |
| PostgreSQL / Redis / MinIO | `compose.yaml` | `55435` / `56380` / `59000` |

## How it works

`scripts/install-local-autostart.ps1` registers the per-user scheduled task
**Nexora Local Stack** (trigger: at logon, 20 s delay, no time limit). The task
runs `scripts/start-local.ps1`, which:

1. waits for Docker Desktop (launching it if needed);
2. incrementally rebuilds `packages/*/dist`, so the web app never imports stale
   `@nexora/contracts` exports after a pull;
3. runs `docker compose up -d --wait api` (pending migrations run first), adding
   `--build` only when `server/`, `packages/`, `docker/`, `compose.yaml` or the
   lockfile changed since the last successful build;
4. starts `next dev` on port 3005 and restarts it if it exits.

Port 3005 is used because 3000/3001 are taken by other local projects; the
`.env` `API_ALLOWED_ORIGINS` value must include `http://127.0.0.1:3005` and
`http://localhost:3005`.

## Operating it

```powershell
# Install or update the logon task (run once per machine / after moving the repo)
powershell -ExecutionPolicy Bypass -File scripts/install-local-autostart.ps1

# Start now without logging off
Start-ScheduledTask -TaskName 'Nexora Local Stack'

# Logs
Get-Content tmp/logs/startup.log          # current startup run
Get-ChildItem tmp/logs/web-*.log          # Next.js output per run

# Remove the autostart
Unregister-ScheduledTask -TaskName 'Nexora Local Stack' -Confirm:$false
```

The first start after pulling backend changes rebuilds the images and takes
several minutes; later starts take well under a minute.

## Not started automatically

The `worker` service is excluded. Its bank-revaluation reversal job posts
financial entries and requires an approved `BANK_REVALUATION_REVERSAL_ACTOR_ID`,
which `compose.yaml` does not yet pass to the worker container. Configure that
deliberately before starting the worker.
