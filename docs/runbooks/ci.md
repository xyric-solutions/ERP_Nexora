# Continuous Integration Runbook

## Mandatory gates

The repository-root `.github/workflows/nexora-hr-payroll-ci.yml` workflow runs
from this canonical workspace and blocks merges when formatting, lint,
TypeScript, OpenAPI drift, PostgreSQL migration, unit, contract, security,
integration, performance, legacy characterization, Next.js build, Playwright,
dependency, secret, or filesystem vulnerability checks fail.

Run the same engineering gates locally from this directory:

```powershell
npm.cmd ci
docker compose -f compose.test.yaml up -d --wait
npm.cmd run db:migrate:test
npm.cmd run format:check
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run api:check
npm.cmd run test:unit
npm.cmd run test:contract
npm.cmd run test:security
npm.cmd run test:integration
npm.cmd run test:performance
npm.cmd run test:legacy
npm.cmd run build
npm.cmd run test:e2e
npm.cmd run test:a11y
```

Stop the isolated test dependencies with:

```powershell
docker compose -f compose.test.yaml down
```

The isolated PostgreSQL service creates two disposable databases. Legacy
compatibility fixtures use `nexora_test`; production source-ledger migration
and worker tests use `nexora_source_test`. Keeping the chains isolated prevents
table-name collisions while both compatibility paths remain under test.

The committed Wave 0 Playwright baseline contains 67 desktop screenshots, 7
mobile screenshots, and 4 keyboard-journey screenshots. Playwright traces and
reports from failed CI runs are retained for 14 days.
Production dependency audit failures at high or critical severity block the
pipeline. Development-only advisories are reviewed separately because the
legacy Vinext characterization toolchain remains installed only until the
Next.js conversion evidence is accepted. Container scans build the `api`,
`worker`, and `web` targets from the shared `docker/Dockerfile`.

## Local full stack

Copy `.env.example` to `.env`, replace every placeholder through an approved
local secret mechanism, then run `docker compose up --build --wait`. The stack
binds web and API only to loopback. PostgreSQL, Redis, and MinIO have no host
ports in the production-shaped compose file, and the MinIO bootstrap explicitly
keeps `nexora-private` anonymous access disabled.

The upstream MinIO community registry was unavailable when this foundation was
verified, so Compose pins the Coollabs mirror by immutable digest. Mirror and
scan that image in the approved internal registry before production deployment.
