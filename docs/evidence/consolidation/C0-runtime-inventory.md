# C0 Runtime Inventory

Captured: 2026-10-09  
Scope: host and production-like local services before consolidation

## Toolchain

| Component | Version / state |
| --- | --- |
| Node.js | 24.16.0 |
| npm | 11.13.0 |
| Git | 2.54.0.windows.1 |
| Docker Desktop | 4.55.0 |
| Docker client / engine | 29.1.3 / 29.1.3 |
| Docker Compose | 2.40.3-desktop.1 |
| Docker context | `desktop-linux` |
| WSL | `docker-desktop` running on WSL2; Ubuntu stopped |
| Host `psql` / `pg_dump` | Not on `PATH`; container-native PostgreSQL 18 tools used |

## Host storage

| Drive | Size | Free at capture |
| --- | ---: | ---: |
| C: | 277.68 GB | 54.19 GB |
| E: | 197.66 GB | 86.42 GB |

Docker reports `/var/lib/docker` as its Linux data root. The active host VHDX
was found at `E:\DockerData\disk\docker_data.vhdx` and was approximately
8.294 GB. `E:\DockerData\main\ext4.vhdx` was approximately 0.094 GB. The
previously expected C-drive Docker VHDX paths and
`E:\DockerData-preservation` were absent at capture time.

This is an inventory finding only. C0 did not relocate, compact, prune, reset,
or delete Docker data.

## Active Docker services

| Service | Image | Health | Binding | Persistent volume |
| --- | --- | --- | --- | --- |
| PostgreSQL | `postgres:18-alpine` | healthy | `127.0.0.1:55434 → 5432` | `nexora-demo-v2_nexora_demo_v2_postgres_data` |
| Redis | `redis:8-alpine` | healthy | `127.0.0.1:56379 → 6379` | `nexora-demo-v2_nexora_demo_v2_redis_data` |

The Compose project is `nexora-demo-v2`, sourced from
`Nexora-ERP\compose.demo-production.yaml` with the ignored local environment
file `Nexora-ERP\.env.demo-production.local`.

Post-backup checks returned:

- PostgreSQL: accepting connections;
- Redis: `PONG`;
- both Docker health checks: healthy.

No API or web listener was found on ports 3000, 3001, 4000, or 8001 during the
inventory. The running reference stack currently exposes only PostgreSQL and
Redis.

## Target Compose topology

The nested TypeScript application defines:

- PostgreSQL;
- Redis;
- MinIO and bucket initialization;
- Express API;
- BullMQ worker;
- Next.js web.

Those target services were not started during C0. Docker had no MinIO container
or MinIO named volume, so there was no current MinIO state to back up. This is a
baseline/runtime gap to verify in C2, not evidence of lost object data.

## Redis state

| Item | Finding |
| --- | --- |
| Version | 8.10.2 |
| Keys | 0 |
| AOF | Enabled; last write status `ok` |
| RDB | Enabled by save schedule; last background-save status `ok` |
| Volume | `nexora-demo-v2_nexora_demo_v2_redis_data` |

A fresh RDB transfer validated successfully with zero keys and a correct
checksum. The complete `/data` directory was also archived to preserve current
AOF/RDB files.

## Redacted configuration inventory

Only variable names were inventoried; values were not printed. The reference
runtime uses configuration for:

- database application, migration, and localization-publisher DSNs;
- Redis DSN and key secret;
- cursor, bank encryption, and blind-index keys;
- password authentication and normalized authorization read mode;
- session idle and absolute lifetime;
- Demo ports, CORS origin, and synthetic-account passwords;
- metrics token and localization import controls.

The target TypeScript environment declares database, Redis, MinIO/S3, session,
throttling, bootstrap, allowed-origin, log-level, API, and web settings. It also
still declares MFA-related variables. Active MFA runtime removal remains a C4
task; no authentication configuration was changed in C0.

## Runtime risks carried forward

1. The active Docker data disk is on E:, which must be treated as persistent
   state during future host maintenance.
2. MinIO is defined by the target but not currently running or backed by an
   existing volume.
3. API/web/worker are not part of the currently running Compose project.
4. Host PostgreSQL tools are absent, so documented backup/restore commands must
   either use container-native tools or install approved host tooling.
