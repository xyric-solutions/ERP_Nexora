# Debug Session: Work Page Unavailable

## Status

- State: resolved and verified locally
- Started: 2026-11-03
- Goal: restore the ERP work page on `http://127.0.0.1:3000/` and keep the independent API healthy on port `4000`.

## Symptoms

- Expected: the ERP root loads its complete client bundle and the authenticated work area can use a ready API.
- Actual: the root document returned HTTP 200, but the user saw the work page as unavailable. API liveness returned HTTP 200 while readiness returned HTTP 503.
- Timeline: the symptom appeared after a production web build completed while an older `next start` process was still serving port 3000.
- Reproduction: request the root document, request every referenced `/_next/` asset, and call `/api/v1/health/ready`.

## Safety Constraints

- Keep the web app on port 3000 and the API on port 4000.
- Do not read, print, or modify `.env`.
- Do not restart the API unless its process-scoped launch configuration is safely recoverable.
- Do not alter database data or existing source changes.

## Evidence

- Before repair, `http://127.0.0.1:3000/` returned HTTP 200 with 16,841 bytes.
- Three assets referenced by that HTML returned HTTP 500: one CSS chunk and two JavaScript chunks. Other referenced assets returned HTTP 200.
- The port-3000 listener was the repository's production `next start --hostname 127.0.0.1 --port 3000` process.
- API `/api/v1/health/live` returned HTTP 200; `/api/v1/health/ready` returned HTTP 503.
- PostgreSQL readiness tables and migration floors passed: finance 33, platform 11, security 20, master data 2, with the master-data and HR foundation checks true and no missing banking-readiness tables.
- Redis responded and MinIO's service health and existing `nexora-test` bucket were available.
- A bounded MinIO request trace for one readiness call showed the API issuing `HeadBucket` for `nexora-private`, which returned 404 `NoSuchBucket`.

## Root Causes

1. The live Next.js process was serving an inconsistent `.next` deployment after the build directory changed underneath it. The root HTML loaded, but client CSS/JavaScript chunks failed, so the work page could not hydrate reliably.
2. The API was configured for the `nexora-private` object-storage bucket, but that local MinIO bucket did not exist. This was the sole remaining readiness failure after database, Redis, HR, master-data, and banking checks passed.

## Repairs

- Stopped only the verified stale Next.js process chain and started the current production build in a hidden process on `127.0.0.1:3000`.
- Kept web logs inside the repository at `tmp/work-page-web.stdout.log` and `tmp/work-page-web.stderr.log`.
- Created the missing local MinIO `nexora-private` bucket with an idempotent bucket-create operation.
- Left the API process running on port 4000; no API restart, source-code edit, database mutation, `.env` read, or `.env` change was required.

## Verification

- Web listener: port 3000 is owned by the repository's `next start --hostname 127.0.0.1 --port 3000` process.
- API listener: port 4000 remains owned by `node dist/server.js`.
- Web root: HTTP 200, 16,841 bytes.
- Referenced static assets: 22 unique assets checked, 22 returned HTTP 200, 0 failed.
- API liveness: HTTP 200.
- API readiness: HTTP 200 with all checks `ok`: service, Redis, object storage, master-data foundation, database, HR foundation, and banking foundation.

## Notes

- This was a runtime deployment/infrastructure consistency issue, not a source-code defect. Existing uncommitted feature work was not modified.
- Future production-build workflows should restart `next start` only after the build completes; the live server should never serve from a build directory while it is being replaced.
