# Local startup (Windows)

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
