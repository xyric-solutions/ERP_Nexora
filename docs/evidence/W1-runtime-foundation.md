# Wave 1 Runtime Foundation Evidence

Date: 2026-10-07  
Status: complete; Wave 2 has not started.

## Delivered scope

| Task                                 | Result   | Evidence                                                                                                                                                                          |
| ------------------------------------ | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W1-01 Workspaces and runtime pins    | Complete | npm workspaces resolve without duplicate local packages; Node 24.16/npm 11 are pinned; clean `npm ci` succeeds.                                                                   |
| W1-02 Standard Next.js host          | Complete | Next.js 16 App Router builds and runs the frozen shell; Playwright, axe, and the complete W0 visual baseline pass.                                                                |
| W1-03 Express API foundation         | Complete | Liveness/readiness, request context, safe problem responses, headers, CORS, body limits, timeouts, and graceful drain are implemented and tested.                                 |
| W1-04 Contracts and generated client | Complete | Zod contracts generate OpenAPI 3.1 and the typed web client; drift check passes.                                                                                                  |
| W1-05 Engineering policy             | Complete | Strict project references, formatting, lint, and import-boundary tests pass.                                                                                                      |
| W1-06 PostgreSQL and migrations      | Complete | Drizzle schema and advisory-locked, checksummed transactional migrations pass against PostgreSQL 18 and are repeatable.                                                           |
| W1-07 Durable jobs                   | Complete | BullMQ success, one retry, terminal dead-lettering, and persisted deduplication pass against Redis/PostgreSQL.                                                                    |
| W1-08 Private object storage         | Complete | Real MinIO signed PUT/GET succeeds, unsigned GET returns 403, and a mismatched SHA-256 upload returns 400.                                                                        |
| W1-09 Observability                  | Complete | Sensitive-field redaction tests pass; correlation IDs flow into jobs; OpenTelemetry proves API enqueue, worker processing, and PostgreSQL writes share one trace ID.              |
| W1-10 Container orchestration        | Complete | The production-shaped web/API/worker/PostgreSQL/Redis/MinIO stack starts with `docker compose up --build --wait`; isolated smoke returned web 200 and API/database/Redis ready.   |
| W1-11 Test harnesses                 | Complete | Unit, contract, security, PostgreSQL/Redis/MinIO integration, performance, legacy Node, Playwright, and axe layers each have passing tests.                                       |
| W1-12 CI gates                       | Complete | Repository-root workflow defines build/cache, migrations, tests, production dependency audit, secret scan, image builds/scans, and failure artifacts for the nested project path. |

## Verification record

- `npm ci` — passed from a clean dependency tree.
- `npm ls --workspaces --depth=0` — passed; all eight workspaces resolve locally without cycles.
- `npm test` — passed: Next production build, format, lint, strict TypeScript, 5 unit tests, 1 contract test, 2 security tests, and 163 legacy regression tests.
- `npm run test:integration` — passed: 4 files, 6 tests using real PostgreSQL 18, Redis 8, and MinIO.
- `npm run db:migrate:test` — passed; migrations current after repeat execution.
- `npm run test:e2e` — passed in Chromium against the real Next.js server, including 67 desktop baselines, 7 mobile baselines, and 4 keyboard journeys.
- `npm run test:a11y` — passed: 2 rendered axe/landmark tests; Playwright also reports no WCAG A/AA violations on the representative payroll route.
- `npm run test:performance` — passed: 1 representative foundation threshold.
- `npm run api:check` — passed; generated artifacts have no drift.
- `npm audit --omit=dev --audit-level=high` — passed with 0 production vulnerabilities.
- Actionlint 1.7.12 — passed against the repository-root workflow with no findings.
- Gitleaks 8.29.1 — passed against the project source with no leaks found.
- `docker build` — passed for `apps/api`, `apps/worker`, and `apps/web` from clean source; API/worker runtime layers were pruned to production dependencies.
- Production-shaped Compose smoke — passed; web returned 200, API readiness returned `ok`, and PostgreSQL/Redis checks returned `ok`.
- Test and smoke containers, networks, and disposable smoke volumes were removed after verification.

## Accepted constraints and risks

- The workflow now lives at the actual repository root as `.github/workflows/nexora-hr-payroll-ci.yml`. Its triggers, working directory, Node cache, artifacts, and container builds are scoped to `prototype_ERP/prototype`; GitHub will execute it after these repository changes are committed and pushed.
- The upstream MinIO community container registry was unavailable during verification. Compose and CI therefore pin the public Coollabs mirror of MinIO `RELEASE.2025-10-15T17-29-55Z` by digest. Production should mirror and scan that image in an approved internal registry before deployment.
- The full npm development tree reports 19 advisories (4 moderate, 15 high) in the legacy Vinext/Vite/Cloudflare characterization toolchain. Production dependency audit is clean; forcing the suggested audit changes would introduce breaking legacy-tool downgrades. Remove that toolchain after the approved visual conversion evidence is complete.
- HR/Payroll browser actions remain intentionally mock-backed. Wave 1 establishes production runtime infrastructure only; authentication, authorization, audit workflow, and durable HR business modules begin in later approved waves.
