# Nexora Single Final Web Application Consolidation Design

Date: 2026-10-09  
Status: Approved

## Decision

Nexora will have one final production repository and application root:

`E:\XS\Xyric Solutions LLP\prototype_ERP`

The approved prototype interface is the final UI/UX baseline. The final product is a web application built with Next.js, Node.js, Express, TypeScript, PostgreSQL, Redis, and server-side workers. It is not a mobile, desktop, or browser-extension application.

The current `Nexora-ERP` repository remains an immutable rollback and behavior-reference source until the consolidated application passes full parity and acceptance. It may be deleted only after a later, explicit approval.

## Final Architecture

The final repository will use the existing TypeScript monorepo boundaries:

| Path | Responsibility |
| --- | --- |
| `apps/web` | Next.js web application using the approved interface |
| `apps/api` | Node.js and Express production API |
| `apps/worker` | BullMQ background processing |
| `packages/auth` | Authentication, sessions, RBAC, policy evaluation, approvals, and SoD |
| `packages/contracts` | Shared request, response, error, and OpenAPI contracts |
| `packages/db` | PostgreSQL schema, repositories, and ordered migrations |
| `packages/domain` | Framework-independent ERP, HR, and Payroll business rules |
| `packages/observability` | Structured logging, metrics, tracing, and redaction |
| `packages/testing` | Shared deterministic test infrastructure |
| `tests` | Unit, integration, contract, security, performance, E2E, and accessibility verification |
| `docs` | Architecture, operations, plans, evidence, and runbooks |

The nested `prototype` application is a temporary source layout, not the final root. Its contents will be promoted into `prototype_ERP`, verified, and then deduplicated. The final repository will not contain competing production applications.

## Sources of Truth

- UI and interaction design: the approved `prototype_ERP` interface.
- Runtime architecture: the TypeScript monorepo.
- Production behavior: verified services, contracts, security rules, and tests currently implemented in `Nexora-ERP`.
- Persistent business data: the existing PostgreSQL database, preserved through verified backups and additive migration.
- Authorization: normalized PostgreSQL authorization with compatibility safeguards until parity is proven.

Python production behavior will be ported into native TypeScript modules. The Python runtime will not be copied into the accepted final application, and a temporary dual-backend architecture will not be introduced.

## Runtime Topology

The standard local runtime is:

- Web: `http://localhost:3000`
- API: `http://localhost:4000`
- PostgreSQL: authoritative application data
- Redis: sessions, throttling, caching seams, and queues
- MinIO or compatible private object storage: application files
- BullMQ worker: asynchronous server-side jobs
- Docker Compose: local production-like orchestration

Browser automation and development tools are verification utilities only. They are not production dependencies and do not change the web-only product boundary.

## Authentication and Authorization

The final authentication model is email and password with opaque server-side sessions. Session state is stored server-side, cookies are Secure and HttpOnly with appropriate SameSite protection, sessions expire and can be revoked, and authorization is evaluated by the backend on every protected request.

MFA, OIDC, and SAML are not part of the approved architecture. MFA UI, APIs, and configuration requirements will be removed from the active runtime. Historical MFA database structures will not be dropped during the initial migration; destructive schema cleanup requires separate approval after data inspection.

The following controls remain mandatory:

- exact dynamic permissions;
- tenant and company isolation;
- scoped access and private-field restrictions;
- maker-checker and separation of duties;
- last-administrator protection;
- transactional and idempotent administration;
- revoked, inactive, and expired assignment handling;
- privilege-escalation prevention;
- immutable audit evidence;
- fail-closed behavior when authorization data or parity is unavailable.

Frontend visibility is not authorization. Direct API calls must independently enforce every security decision.

## Controlled Consolidation

### 1. Preservation checkpoint

Before moving files or changing repository ownership:

- record both directory inventories and Git states;
- preserve tracked, modified, and untracked files;
- capture the complete `Nexora-ERP` diff and an untracked-file manifest;
- create and verify PostgreSQL schema, role, and data backups;
- record Docker volume, Redis, MinIO, and environment configuration without exposing secrets;
- produce checksums and a recovery manifest.

### 2. Final-root preparation

- Make `prototype_ERP` an independent Git repository.
- Promote the TypeScript monorepo from `prototype_ERP\prototype` into the final root.
- Copy before deleting so the original nested source remains recoverable through the baseline gate.
- Keep the parent repository isolated from the new nested repository without changing unrelated parent source.
- Preserve secrets only in ignored local configuration; never commit them.

### 3. Baseline verification

Restore dependencies from lockfiles and run formatting, linting, type checking, builds, unit tests, contract tests, security tests, PostgreSQL integration tests, E2E tests, accessibility checks, API drift checks, and dependency audits. Compare the rendered application with the approved prototype before removing the nested source copy.

### 4. Production behavior port

Port behavior in this order:

1. platform configuration, Docker, PostgreSQL, Redis, MinIO, and observability;
2. email/password authentication and server-side sessions;
3. W2-04R-00 through R07 authorization foundations and administration;
4. R08 Employee Master, Directory, and Profile;
5. R09 Employment Lifecycle, Assignments, Transfers, Termination, and Rehire;
6. remaining approved HR and Payroll slices;
7. other production-backed ERP modules;
8. removal of replaced mocks and compatibility paths.

Each slice requires a source-to-target behavior map, API contract parity, PostgreSQL data mapping, security invariants, UI binding, automated verification, and manual web UAT.

### 5. Database migration

- Keep the original PostgreSQL backup immutable.
- Use ordered, additive Drizzle migrations during compatibility and cutover.
- Use deterministic and idempotent data-transfer scripts.
- Preserve source identifiers or record explicit source-to-target mappings.
- Report invalid, ambiguous, skipped, and conflicting records instead of guessing.
- Reconcile tenant, company, account, role, permission, employee, audit, and payroll record counts.
- Compare old and new authorization and business decisions before making new paths authoritative.
- Retain rollback capability through final acceptance.

### 6. Cleanup

Cleanup is gated by recoverability:

- Safe after inventory: reproducible caches and outputs such as `.next`, `dist`, coverage, temporary files, test reports, and package caches.
- Safe after baseline verification: the nested prototype runner, duplicate package configuration, and obsolete mock-only entry points whose replacements have passed parity.
- Safe after functional parity: superseded compatibility code and duplicate contracts.
- Requires explicit approval: old PostgreSQL data, Docker volumes, backups, destructive migrations, or deletion of `Nexora-ERP`.

## Request, Error, and Transaction Behavior

- Use one versioned API error contract with stable codes, safe messages, and correlation IDs.
- Validate input at the transport boundary and enforce business rules in domain services.
- Roll back failed PostgreSQL transactions completely.
- Use idempotency keys for retriable commands.
- Apply bounded retries only to explicitly safe serialization or transient failures.
- Never silently swallow security, migration, or audit failures.
- Record immutable audit evidence in the same transaction as governed state changes.
- Expose separate health and readiness checks for required dependencies.

## Verification and Acceptance

Every production slice must prove:

- request and response contract compatibility;
- real PostgreSQL persistence and transaction behavior;
- tenant and company isolation;
- direct API authorization denial;
- field-level and own-scope restrictions where applicable;
- audit evidence;
- idempotency and concurrency safety;
- frontend/backend permission consistency;
- regression safety for previously accepted slices.

The consolidated application is accepted only when:

- `prototype_ERP` is the sole independent production repository;
- there is no nested or competing production application;
- the approved interface remains visually and behaviorally intact;
- production actions use real APIs and PostgreSQL data;
- authorization and audit controls pass;
- migrated data reconciles with the source;
- automated quality gates pass;
- manual web UAT passes;
- no known critical blocker remains;
- rollback evidence is retained.

Acceptance of the consolidated application does not itself authorize deletion of `Nexora-ERP` or preserved data. That deletion requires a separate explicit approval.

## Explicit Non-Goals

- No mobile application.
- No desktop application.
- No browser extension as a product dependency.
- No Python backend in the final accepted runtime.
- No second authentication architecture.
- No destructive database reset or migration during consolidation.
- No unverified bulk copy of incompatible source trees.
- No deletion of user-owned work or rollback sources.

