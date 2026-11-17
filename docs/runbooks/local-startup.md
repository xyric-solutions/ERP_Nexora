# Local startup (Windows)

## Purchase adjustments and Integrated Fixed Assets — pending local rollout approval

The integrated extension is implemented and verified on disposable test data.
The running recovered service still uses the prior deployed version. The new API
requires procurement migration **0006** and fixed-assets migrations **0003–0007**
before restart. Do not restart the latest API against the older recovered schema.
Automatic approval review requires the owner's explicit authorization to copy
the business database into ignored `tmp/backups` and a disposable local database
for restore verification. No such backup, migration or service replacement has
been performed for these extensions yet.

Automatic approval review also rejected updating the protected local rollout
helpers for the Purchase release without explicit authorization for that
deployment/migration path. The implementation is verified on disposable data;
the business database and currently running release remain unchanged.

After explicit authorization, update the existing workstation-local helpers to
target `tmp/purchase-totals-final-build`, migrate only procurement through 6 and
fixed-assets through 7, and verify unchanged credentials, permissions, original
Purchase/Asset values and journal populations. Then use the existing steps:

```powershell
powershell -NoProfile -File tmp/fixed-assets/backup-before-rollout.ps1
powershell -NoProfile -File tmp/fixed-assets/local-runtime.ps1 -Action Migrate
powershell -NoProfile -File tmp/fixed-assets/local-runtime.ps1 -Action Start -Restart
powershell -NoProfile -File tmp/fixed-assets/local-runtime.ps1 -Action Verify
```

The backup is restored briefly into a uniquely named disposable database and
removed there after validation; the ignored archive remains on this workstation.
Migration verifies that original credentials, permissions, asset snapshots and
journal populations are unchanged. Protected configuration is reused without
writing `.env`. The latest release build is `tmp/purchase-totals-final-build`.
The dedicated `nexora-asset-drafts` worker prepares drafts and cleans expired
unbound uploads; it has no financial approval/post handlers. Company automation
starts disabled. Verify API readiness, sign-in, worker readiness and asset options
after restart. Preserve the earlier recovery helpers/configuration for reference;
never reset the recovered database to deploy this extension.

## Recovered workstation environment (16 November 2026)

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
