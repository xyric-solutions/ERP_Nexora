# Nexora Single Final Web Application Consolidation Implementation Plan

- Status: approved design; implementation not started
- Date: 2026-10-09
- Final repository root: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Reference repository: `E:\XS\Xyric Solutions LLP\Nexora-ERP` (read-only until separate approval)
- Source specification: `../specs/2026-10-09-nexora-single-final-web-consolidation-design.md`
- Product boundary: web application only
- Target stack: Next.js, Node.js, Express, TypeScript, PostgreSQL, Redis, BullMQ, and MinIO

## 1. Outcome

Deliver one independent, production-ready Nexora repository at
`prototype_ERP`. The approved prototype interface remains the final UI/UX, the
existing TypeScript monorepo becomes the sole runtime architecture, verified
production behavior from `Nexora-ERP` is ported into that architecture, and
existing PostgreSQL data is preserved through additive, verified migration.

This plan does not authorize deletion of `Nexora-ERP`, database backups,
Docker volumes, or user-owned files. Those actions require later, explicit
approval after final parity and acceptance.

## 2. Non-negotiable execution rules

1. Preserve first. No move, deletion, repository initialization, or database
   mutation starts until the preservation manifest is complete and verified.
2. Copy before cleanup. Promote the monorepo into the final root without
   deleting the nested source until the promoted baseline passes its gate.
3. Treat `Nexora-ERP` as a read-only behavior and rollback reference. Do not
   edit, reset, clean, stash, commit, or delete it.
4. Preserve all tracked, modified, and untracked user files. Resolve collisions
   explicitly; never overwrite by assumption.
5. Use only ordered, additive PostgreSQL migrations during consolidation.
   Destructive schema changes are outside this plan.
6. Do not copy the Python backend into the final runtime. Port verified behavior
   into the existing Express, domain, contract, and database boundaries.
7. Keep email/password authentication with opaque server-side sessions. Do not
   introduce MFA, OIDC, SAML, desktop, mobile, or extension product runtimes.
8. Preserve authorization invariants: exact permissions, tenant/company scope,
   field restrictions, maker-checker, SoD, last-administrator protection,
   idempotency, transactional audit, and fail-closed decisions.
9. A frontend-hidden control is not authorization. Every protected operation
   must be rejected independently by the API when unauthorized.
10. Each phase has an acceptance gate. Do not start the next phase when the
    current gate has a security, data-integrity, build, or manual-UAT blocker.
11. Do not create a commit unless explicitly instructed.

## 3. Final repository layout

After the root-promotion gate, the final root must contain one monorepo:

| Path | Production responsibility |
| --- | --- |
| `apps/web` | Next.js web application and approved UI |
| `apps/api` | Express production API |
| `apps/worker` | BullMQ background jobs |
| `packages/auth` | Sessions and authorization policy |
| `packages/contracts` | Shared schemas and OpenAPI contracts |
| `packages/db` | PostgreSQL schema, repositories, and migrations |
| `packages/domain` | Framework-independent business rules |
| `packages/observability` | Logging, metrics, tracing, and redaction |
| `packages/testing` | Shared test infrastructure |
| `tests` | Unit through browser acceptance verification |
| `docs` | Plans, evidence, runbooks, and architecture |

The final accepted tree must not retain a second runnable application under
`prototype/` or a Python production backend.

## 4. Phase and approval map

| Phase | Purpose | Persistent change | Approval gate |
| --- | --- | --- | --- |
| C0 | Preservation and inventory | Evidence only | Approve root promotion |
| C1 | Independent root and monorepo promotion | Git/root layout | Approve baseline cleanup |
| C2 | Clean TypeScript baseline | Reproducible cleanup/fixes | Approve behavior port |
| C3 | Production behavior and data mapping | Mapping documents/tests | Approve mapped port scope |
| C4 | Platform, auth, sessions, R00-R07 | Production TS behavior | Accept security foundation |
| C5 | R08 Employee Master/Directory/Profile | HR production slice | Manual Gate 2 |
| C6 | R09 employment lifecycle | HR production slice | R09 acceptance gate |
| C7 | Remaining HR and Payroll | HR/Payroll slices | Per-slice manual gates |
| C8 | Remaining ERP modules | Production modules | Per-module gates |
| C9 | Data cutover and compatibility retirement | Authority switch | Final cutover approval |
| C10 | Final acceptance and cleanup proposal | Safe cleanup only | Separate deletion decision |

## 5. C0 — Preservation and inventory

### Objective

Establish recoverability and an evidence-backed map of both codebases and all
stateful services before changing repository ownership or file layout.

### Tasks

1. Record absolute paths, repository roots, branches, remotes, HEAD identifiers,
   status summaries, ignored files, nested repositories, and submodules for:
   - `prototype_ERP` and its current parent repository;
   - `prototype_ERP\prototype`;
   - `Nexora-ERP`.
2. Generate manifests for tracked, modified, deleted, ignored, and untracked
   files without printing secret contents.
3. Capture a binary-safe patch of tracked `Nexora-ERP` modifications plus a
   checksummed manifest of its untracked files. Store evidence outside that
   repository in an ignored preservation directory under `prototype_ERP`.
4. Inventory the nested TypeScript monorepo, root-level prototype assets,
   duplicate names, path collisions, generated output, caches, and large files.
5. Record runtime versions and lockfiles: Node, npm, Docker Desktop/Engine,
   PostgreSQL, Redis, MinIO, and migration state.
6. Identify active containers, volumes, networks, ports, and bind mounts.
7. Record environment variable names and configuration sources with values
   redacted. Do not copy secrets into documentation or Git.
8. Identify the real PostgreSQL instance and databases used by both systems.
   Record schema/migration versions and table counts.
9. Create PostgreSQL role/schema/data backups using native tools and verify they
   can be read/listed. Record checksums, sizes, timestamps, and restore commands.
10. Inventory Redis persistence and MinIO buckets/objects. Back up durable state
    where applicable without treating Redis cache entries as business truth.
11. Create a recovery manifest mapping every artifact to its original path,
    backup path, checksum, and restoration procedure.

### Evidence

- `docs/evidence/consolidation/C0-repository-inventory.md`
- `docs/evidence/consolidation/C0-runtime-inventory.md`
- `docs/evidence/consolidation/C0-data-inventory.md`
- ignored preservation artifacts and checksum manifest

### Gate

- Every repository and user-owned change is accounted for.
- Database backups exist and verification commands succeed.
- No source or persistent data has been deleted or modified.
- File collisions and required external approvals are listed explicitly.
- User approves C1 after reviewing the preservation report.

### Rollback

No application rollback is needed because C0 is read-only except for new
evidence and backup files. Remove nothing during this phase.

## 6. C1 — Independent final root and controlled promotion

### Objective

Make `prototype_ERP` the independent Git/project root and promote the nested
TypeScript monorepo into it without losing the approved UI, documentation, or
user work.

### Tasks

1. Recheck the C0 manifest immediately before changes and stop on unexplained
   drift.
2. Prepare a path-by-path promotion map from `prototype\*` to the final root.
   Classify every collision as identical, merge-required, renamed preservation,
   generated, or blocked.
3. Create the independent Git repository at `prototype_ERP` only after explicit
   C1 approval. Do not alter the parent repository except for a separately
   approved ignore entry if required to avoid nested-repository noise.
4. Establish a final-root `.gitignore` that excludes secrets, dependencies,
   build output, coverage, test artifacts, logs, and preservation payloads while
   keeping source, migrations, lockfiles, and documentation trackable.
5. Copy the nested monorepo content into the final root using the promotion map.
   Do not delete or overwrite the nested source during this phase.
6. Merge root documentation and the approved prototype UI assets explicitly.
   Preserve the approved design when resolving duplicate UI files.
7. Update only path-dependent workspace, Docker, script, and documentation
   references required by the root change.
8. Confirm there is one workspace lockfile, one package manager declaration,
   and one intended Docker Compose entry point at the promoted root.
9. Produce before/after file counts and checksums for all copied source files.

### Gate

- `git rev-parse --show-toplevel` resolves to `prototype_ERP`.
- All expected monorepo source files are present at the final root.
- The nested original remains intact and recoverable.
- No unexplained overwritten or missing files exist.
- No secret or preservation artifact is staged or trackable.
- Root workspace discovery succeeds before any cleanup.

### Rollback

Stop using the promoted copy and restore root files from the C0 manifest. The
nested source and reference repository remain available and unchanged.

## 7. C2 — Clean TypeScript baseline

### Objective

Prove the promoted application builds and runs from the final root before any
production behavior is ported or duplicate sources are removed.

### Tasks

1. Restore dependencies exactly from the committed lockfile.
2. Run the repository-provided format check, lint, type check, builds, unit
   tests, contract tests, security tests, PostgreSQL integration tests, API
   drift check, E2E tests, accessibility checks, and dependency audit.
3. Start PostgreSQL, Redis, MinIO, API, worker, and web through the final-root
   supported workflow. Verify health/readiness and expected ports.
4. Compare the rendered web application with the approved prototype at common
   desktop and responsive web widths. Record intentional deviations only.
5. Verify deep links and refresh behavior for current routes, especially
   `/admin/identity` and its five tabs.
6. Classify failures as root-promotion defect, pre-existing TS defect,
   environment limitation, or expected unported production behavior.
7. Fix only root-promotion and baseline defects in this phase, using focused
   tests and no unrelated refactor.
8. After all required baseline checks pass, propose a precise deletion list for
   reproducible caches and outputs. Delete only that approved list.
9. Re-run affected checks after cleanup.

### Gate

- The final-root web, API, and worker build successfully.
- Required services are healthy and the web/API integration is real.
- Automated baseline checks pass or have accepted, documented non-product
  environment exceptions.
- Approved UI/UX remains intact.
- No nested source has yet been deleted.

### Rollback

Recreate dependencies/build outputs from lockfiles and scripts. Revert focused
baseline fixes only through reviewed patches; never reset the worktree.

## 8. C3 — Production behavior, contract, and data map

### Objective

Convert the `Nexora-ERP` reference into a precise porting backlog without
copying incompatible runtime code or guessing business behavior.

### Tasks

1. Inventory Python routes, services, repositories, models, migrations,
   background work, security controls, and the production Next.js bindings.
2. Map each verified source capability to its target TypeScript boundary:
   contract, Express route, service/domain rule, PostgreSQL repository, worker,
   web screen/action, audit event, and tests.
3. Record each capability as implemented-equivalent, partially implemented,
   missing, conflicting, obsolete, or test-only.
4. Build API request/response/error comparisons, including status codes,
   validation, pagination, idempotency, and correlation behavior.
5. Build source-to-target PostgreSQL mapping for tenant, company, account,
   session, role, permission, employee, assignment, audit, payroll, and other
   governed records.
6. Report unmappable, ambiguous, invalid, duplicate, or conflicting records;
   do not silently choose a mapping.
7. Establish representative decision fixtures for old/new authorization and
   HR/Payroll business-rule parity.
8. Identify source tests that prove real behavior and restate them as
   implementation-neutral acceptance criteria.
9. Define the slice order, dependencies, and manual UAT accounts/data without
   writing production or UAT records yet.

### Deliverables

- `docs/evidence/consolidation/C3-capability-map.md`
- `docs/evidence/consolidation/C3-api-contract-map.md`
- `docs/evidence/consolidation/C3-data-map.md`
- `docs/evidence/consolidation/C3-security-invariants.md`
- executable test matrix for C4 through C9

### Gate

- Every production source capability has an explicit disposition.
- All data mappings and exceptions are reviewable.
- No Python runtime dependency is proposed for the target.
- User approves the exact mapped C4 scope.

## 9. C4 — Platform, authentication, sessions, and R00-R07

### Objective

Port and verify the production platform and authorization foundation in native
TypeScript while preserving the approved normalized PostgreSQL model.

### Delivery slices

1. Configuration, dependency health, redacted logging, correlation IDs, and
   readiness checks for PostgreSQL, Redis, MinIO, API, worker, and web.
2. Email/password authentication with modern password hashing and generic
   failure responses.
3. Opaque, unpredictable server-side sessions stored in PostgreSQL/Redis as
   defined by the existing architecture; secure HttpOnly/SameSite cookies,
   rotation after login, idle/absolute expiry, revocation, and logout.
4. CSRF/origin protection for cookie-authenticated state changes.
5. Tenant/company/account resolution from trusted server state.
6. R00-R07 normalized authorization reads, transactional administration,
   compatibility/shadow parity, roles, assignments, approvals, permissions,
   audit, SoD, last-administrator protection, and idempotency.
7. `/admin/identity` with Roles, Assignments, Approvals, Permissions, and Audit
   tabs using production APIs only.
8. Remove active MFA requirements, routes, controls, and configuration only
   where approved; retain historical schema until a separate destructive-data
   decision.

### Required verification

- Invalid credentials, enumeration resistance, cookie flags, fixation
  prevention, expiry, revocation, logout, refresh persistence, CSRF, and direct
  API denial.
- Tenant/company isolation and exact-permission enforcement.
- Privilege-escalation denial and bounded delegation.
- Maker-checker, SoD, last-administrator concurrency, idempotency, rollback,
  inactive/revoked/expired roles, field restrictions, and append-only audit.
- Old/new authorization parity on the approved representative matrix.
- PostgreSQL-backed integration and concurrency tests; Redis session behavior;
  contract, web, E2E, accessibility, security, and regression checks.
- Manual Gate 1 against synthetic least-privilege identities.

### Gate

- No MFA, OIDC, or SAML runtime dependency remains.
- Email/password and server-side session flows pass automated and manual tests.
- All five Identity & Access tabs work against real production APIs.
- The normalized policy path is authoritative only where the approved parity
  gate permits it; compatibility safeguards remain until separately retired.
- No known critical R00-R07 blocker remains.

## 10. C5 — R08 Employee Master, Directory, and Profile

### Objective

Port and accept the Employee Master, Directory, and Profile slice in the final
application, using the approved UI and real PostgreSQL-backed authorization.

### Tasks

1. Implement mapped contracts, Express handlers, domain services, repositories,
   migrations, audit events, and web data bindings.
2. Preserve employee identifiers and source relationships or record explicit
   deterministic mappings.
3. Enforce view/create/edit/archive permissions at the API.
4. Enforce tenant/company/scope isolation and private-field allow-lists in
   server-side projections and mutations.
5. Keep list/search/filter/sort/pagination bounded and indexed.
6. Replace slice-specific mock/demo persistence only after parity passes.
7. Create controlled synthetic non-production UAT records using least privilege.

### Manual Gate 2

- Login, session persistence, expiry/revocation, and logout.
- Employee Directory list/search/filter and empty/error/loading states.
- Authorized profile access and mutations.
- Unauthorized direct URL and API denial.
- Private-field redaction for restricted identities.
- Tenant and company isolation.
- Audit evidence for governed reads and mutations as specified.
- Browser refresh and deep links.

### Gate

- Genuine approved-browser evidence exists.
- PostgreSQL, backend, frontend, security, contract, and regression suites pass.
- Source/target data counts and sampled records reconcile.
- No known R08 blocker remains.

If the approved browser host is unavailable, record the exact environmental
prerequisite and keep R08 blocked. Do not substitute fabricated evidence.

## 11. C6 — R09 employment lifecycle

### Objective

Port Employment Lifecycle, Assignments, Transfers, Termination, and Rehire
without weakening R08 or authorization behavior.

### Tasks

1. Implement explicit lifecycle states and allowed transitions in domain code.
2. Add version/precondition checks to prevent lost updates.
3. Perform assignments, transfers, termination, rehire, audit, and outbox work
   in correct PostgreSQL transaction boundaries.
4. Enforce exact action/state permissions, scope, private fields,
   maker-checker/SoD where specified, and direct API denial.
5. Preserve effective dates, organization/company relationships, employment
   history, and employee linkage during data migration.
6. Implement approved prototype workflows with accessible loading, validation,
   conflict, empty, and error states.
7. Test concurrent transitions, retry/idempotency, rollback, cross-tenant
   access, and stale version handling.

### Gate

- Automated lifecycle, security, PostgreSQL, contract, frontend, and regression
  tests pass.
- Manual R09 gate passes on the real final application.
- R08 remains green and no known R09 blocker remains.
- Stop and report before C7.

## 12. C7 — Remaining HR and Payroll

### Objective

Complete HR and Payroll in small, accepted production slices.

### Proposed slice order

1. HR organization and master data.
2. Compensation and salary history.
3. Attendance, shifts, and timesheets.
4. Leave balances, requests, approvals, and accruals.
5. Overtime requests, approval, and payable inputs.
6. Payroll eligibility and preflight.
7. Payroll calculation and deterministic rounding.
8. Payroll review, maker-checker approval, and locked periods.
9. Payslips and restricted employee access.
10. Payroll payment/export and immutable evidence.
11. Corrections, reversals, and controlled reruns.

### Per-slice requirements

- Approved source-to-target capability and data map.
- Exact contracts and stable safe errors.
- PostgreSQL transactions, constraints, indexes, and idempotency.
- Tenant/company/employee scope and field restrictions.
- Server-side approval, SoD, and audit where applicable.
- No floating-point currency calculations.
- Unit, PostgreSQL integration, contract, security, concurrency, frontend,
  regression, and approved-browser manual verification.
- Record-count, aggregate, and sampled-result reconciliation.

### Gate

Each slice is independently accepted before the next begins. Payroll authority
does not switch until calculation, approval, payment, reconciliation, and
rollback evidence all pass.

## 13. C8 — Remaining ERP modules

### Objective

Port other verified production modules only after HR and Payroll acceptance.

### Tasks

1. Prioritize modules from the C3 capability/dependency map.
2. Use the same contract, data, security, UI, audit, test, and UAT gate as C7.
3. Reuse shared domain and platform capabilities; do not create parallel
   authentication, authorization, database, navigation, or error systems.
4. Remove module-specific mocks only when their production replacements pass.

### Gate

All in-scope source capabilities have an accepted target disposition, and each
ported module passes its production and manual acceptance criteria.

## 14. C9 — Data cutover and compatibility retirement

### Objective

Make the final TypeScript application and normalized data paths authoritative
only after measured parity and reversible cutover approval.

### Tasks

1. Rehearse restore and migration on a disposable database restored from the
   immutable backup.
2. Run deterministic, idempotent migrations and transfer scripts twice; the
   second run must create no duplicate or conflicting state.
3. Reconcile counts, keys, relationships, aggregates, audit continuity, and
   representative business decisions.
4. Classify every skipped/conflicting record and obtain a disposition.
5. Run shadow comparisons for authorization and critical HR/Payroll decisions.
   Security-sensitive mismatches fail closed.
6. Measure migration duration, locks, query plans, and operational impact.
7. Document maintenance window, pre-cutover checks, backup checkpoint, cutover
   command sequence, health checks, smoke tests, and rollback triggers.
8. Switch authority only with explicit cutover approval.
9. Retain old tables/columns and compatibility code for the approved observation
   period; destructive retirement is not part of this phase.

### Gate

- Zero unresolved security or financial mismatch.
- Referential, tenant, company, and audit integrity pass.
- Production-like performance is acceptable.
- Restore and rollback rehearsals pass.
- Explicit data-cutover approval is recorded.

## 15. C10 — Final acceptance and cleanup proposal

### Objective

Prove that `prototype_ERP` is the one final web application and prepare a safe,
separately approved cleanup proposal.

### Verification

1. Fresh checkout/restore using documented prerequisites.
2. Final-root install, lint, type check, builds, all automated test classes,
   OpenAPI drift, dependency audit, and migration verification.
3. Production-like Docker startup and health/readiness verification.
4. Full manual web regression of approved UI and production workflows.
5. Security regression for session, CSRF, direct API denial, tenant/company
   isolation, exact permissions, fields, approvals, SoD, last admin, audit, and
   idempotency.
6. Database and object reconciliation plus backup/restore evidence.
7. Confirm no runtime path depends on Python, the nested prototype runner,
   mobile, desktop, extension, mock persistence, or the reference repository.
8. Confirm documentation describes one root, one runtime, and one operational
   workflow.

### Cleanup classes

- Class A: reproducible caches/build/test output — eligible after verified
  manifest and successful recreation.
- Class B: nested duplicate source and mock-only entry points — eligible only
  after source checksum/parity and final-root acceptance.
- Class C: compatibility code/old schema — requires observation evidence and a
  dedicated retirement plan.
- Class D: backups, Docker volumes, source database, or `Nexora-ERP` — never
  delete under this plan; requires separate explicit approval.

### Final acceptance gate

- `prototype_ERP` is the independent and sole accepted production repository.
- Approved UI and all accepted workflows operate from the final root.
- Production data, security, authorization, and audit evidence reconcile.
- Automated and manual gates pass with no known critical blocker.
- A cleanup proposal lists exact paths, sizes, reasons, recoverability, and
  approval requirements before any deletion.

## 16. Verification command policy

Exact commands will be derived from the promoted root's existing scripts during
C2 rather than invented in advance. At minimum, use repository-provided scripts
for:

- formatting/checking;
- linting;
- TypeScript type checking;
- web, API, and worker builds;
- unit, integration, contract, security, performance, E2E, and accessibility
  suites;
- migration application/drift verification;
- OpenAPI drift;
- dependency audit;
- Docker health and application readiness.

Every completion report must include the exact command, exit code, passed/failed
counts where available, duration when relevant, and whether the check exercised
real PostgreSQL/Redis/MinIO or a substitute. A check that did not run is reported
as not run, never as passed.

## 17. Change and evidence discipline

For every phase:

1. Record the pre-change Git status and relevant runtime state.
2. Keep a path-level list of files added, changed, copied, or proposed for
   deletion.
3. Add focused tests before or with behavior changes.
4. Review the diff for unrelated churn, generated files, secrets, and unsafe
   permission changes.
5. Store evidence under `docs/evidence/consolidation/<phase>/`, excluding
   secrets and large binary backups.
6. Report blockers and failed checks precisely.
7. Stop at the phase acceptance gate and wait for approval.

## 18. First executable step

After approval of this plan, execute **C0 only**. C0 is limited to read-only
inspection plus creation of inventories and verified backups. It does not
authorize Git initialization, file promotion, source cleanup, schema migration,
application behavior changes, or deletion.

