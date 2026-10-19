# C3 Executable Test Matrix for C4-C9

- Date: 2026-10-09
- Purpose: implementation-neutral acceptance matrix for the remaining port
- Rule: commands must use repository scripts introduced or verified in each
  phase; no row is passed until it runs against the stated dependency

## Evidence classes

| Code | Evidence                                                            |
| ---- | ------------------------------------------------------------------- |
| U    | deterministic unit/domain tests                                     |
| C    | contract/OpenAPI/runtime validation tests                           |
| PG   | real PostgreSQL integration/migration/RLS/concurrency tests         |
| R    | real Redis session/idempotency/queue tests                          |
| S    | direct security/adversarial tests                                   |
| W    | Next.js component/integration/build tests                           |
| B    | approved Browser manual/automated evidence against running services |
| G    | regression of every previously accepted slice                       |
| D    | data reconciliation and backup/restore evidence                     |

## C4 — Platform, authentication, sessions, R00-R07

| ID    | Executable acceptance criterion                                                                                                                                      | Evidence      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| C4-01 | Tenant/email/password login accepts a valid existing PBKDF2 credential and upgrades it to valid Argon2id only after success                                          | U, PG, S      |
| C4-02 | Unknown tenant/email and wrong password have safe equivalent external denial and no credential mutation                                                              | U, PG, S      |
| C4-03 | Login rotates/creates an opaque session; cookie flags, CSRF/origin, idle/absolute expiry, refresh persistence, logout, revoke, and disabled-account behavior pass    | U, R, C, S, B |
| C4-04 | Cross-tenant session replay, bearer transport, body/header identity assertions, fixation, and stale/revoked permission use are denied                                | PG, R, S      |
| C4-05 | Exact permission allow/deny, role lifecycle, assignment lifecycle, scope, field grants, inactive/revoked/expired records, and fail-closed repository errors pass     | U, PG, S      |
| C4-06 | Role/grant/assignment changes are atomic, idempotent, and tenant/company safe                                                                                        | PG, S         |
| C4-07 | Delegation ceiling, self-escalation denial, maker-checker, SoD, and approval/rejection pass                                                                          | U, PG, S, B   |
| C4-08 | Concurrent last-administrator removal/deactivation/revocation leaves at least one valid administrator                                                                | PG, S         |
| C4-09 | Audit failure rolls back mutation; audit update/delete is rejected through app and database controls                                                                 | PG, S         |
| C4-10 | Representative old/new authorization decision matrix has zero unresolved mismatch; security mismatches deny                                                          | PG, S, D      |
| C4-11 | `/admin/identity` five tabs work against real APIs with deep-link/refresh and direct API denial                                                                      | W, C, B       |
| C4-12 | MFA/OIDC/SAML routes, UI, configuration requirements, and response states are absent from active runtime; historical rows remain                                     | C, PG, S      |
| C4-13 | Health/readiness distinguish dependency failure; metrics/operational data require authorization; logs redact secrets                                                 | C, PG, R, S   |
| C4-14 | Format, lint, typecheck, all builds, unit, contract, integration, security, performance, E2E, accessibility, OpenAPI drift, and dependency audit meet the phase gate | G             |

Source characterization candidates to port first include
`test_authentication_api.py`, `test_server_sessions.py`,
`test_password_authentication.py`, `test_security_authorization_api.py`,
`test_security_foundation.py`, and
`test_identity_authorization_audit.py`. TypeScript tests must exercise native
production composition, not import Python or test-only repositories.

## C5 — R08 Employee Master, Directory, and Profile

| ID    | Executable acceptance criterion                                                                                                                                | Evidence           |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| C5-01 | Employee create/read/edit/archive uses exact permissions, real PostgreSQL, idempotency, and audit                                                              | U, C, PG, S        |
| C5-02 | Directory search/filter/sort/cursor limits are stable, bounded, indexed, and tenant/company scoped                                                             | C, PG, performance |
| C5-03 | Profile/contact/document/private fields are projected and mutated by server-side field allow-list                                                              | U, PG, S           |
| C5-04 | Tenant A and Company A cannot enumerate or access other tenant/company employees by list, ID, direct URL, or API                                               | PG, S, B           |
| C5-05 | Empty/loading/error/conflict states and approved prototype interactions work in the final web                                                                  | W, B               |
| C5-06 | Source/target counts and sampled employee/profile relationships reconcile                                                                                      | D                  |
| C5-07 | Manual Gate 2 captures genuine approved Browser evidence for login, session, directory, profile, denial, private fields, isolation, audit, refresh, and logout | B                  |
| C5-08 | C4 regression remains green                                                                                                                                    | G                  |

Source characterization candidates are `test_hr_foundation.py`,
`test_hr_employee_profile_satellites.py`, `test_hr_identity.py`,
`test_hr_api.py`, and the R08 evidence set. The old R08 browser result is blocked,
not passed.

## C6 — R09 employment lifecycle

| ID    | Executable acceptance criterion                                                                                           | Evidence        |
| ----- | ------------------------------------------------------------------------------------------------------------------------- | --------------- |
| C6-01 | Allowed employment transitions succeed; illegal/stale transitions return stable conflict errors                           | U, C, PG        |
| C6-02 | Assignment, transfer, termination, and rehire preserve effective dates/history and commit atomically with audit/outbox    | PG, S           |
| C6-03 | Exact state/action permissions, tenant/company scope, private fields, maker-checker, and SoD are enforced directly by API | PG, S, B        |
| C6-04 | Concurrent and retried transitions do not lose updates or create duplicate history                                        | PG, performance |
| C6-05 | Approved web workflows cover validation, loading, empty, error, conflict, refresh, and deep links                         | W, B            |
| C6-06 | C4-C5 regressions remain green and sampled source history reconciles                                                      | G, D            |

Source characterization candidates are `test_hr_employment.py`,
`test_hr_employment_context.py`, `test_hr_employment_lifecycle.py`, and
`test_hr_employment_context_contract.py`.

## C7 — Remaining HR and Payroll

Each numbered slice in the approved C7 order must run this same gate before the
next slice starts:

| ID    | Executable acceptance criterion                                                                                 | Evidence           |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------ |
| C7-01 | Closed contracts and exact permissions cover view/create/edit/archive/submit/approve/pay as applicable          | U, C, S            |
| C7-02 | Real PostgreSQL transactions, constraints, RLS, indexes, idempotency, concurrency, rollback, and audit pass     | PG, S, performance |
| C7-03 | Money uses exact decimals and deterministic rounding; reruns/reversals reconcile                                | U, PG, D           |
| C7-04 | Payroll maker-checker, SoD, period locks, payment evidence, and restricted payslip access pass                  | PG, S, B           |
| C7-05 | Source/target record counts, monetary aggregates, and sampled calculations reconcile with classified exceptions | D                  |
| C7-06 | Approved Browser UAT passes for the slice and all earlier HR/security slices regress green                      | B, G               |

Characterization sources include HR organization, attendance, leave, overtime,
payroll, statutory, preflight, payment, and time-input unit/contract/integration/
PostgreSQL tests already inventoried in the reference repository.

## C8 — Remaining ERP modules

| ID    | Executable acceptance criterion                                                                                   | Evidence             |
| ----- | ----------------------------------------------------------------------------------------------------------------- | -------------------- |
| C8-01 | Each module has a reviewed contract/data/security map before code                                                 | C, D                 |
| C8-02 | UI actions use production APIs and PostgreSQL; no mock/in-memory fallback exists                                  | C, PG, W, S          |
| C8-03 | Tenant/company scope, exact permissions, private fields, approvals/SoD, idempotency, and audit pass as applicable | PG, S                |
| C8-04 | Unconfigured capabilities remain safely unavailable until persistence is accepted                                 | C, S                 |
| C8-05 | Module-specific reconciliation, performance, Browser UAT, and all prior regressions pass                          | D, performance, B, G |

Finance precedes procurement/inventory only after dependencies are mapped.
Reference procurement/inventory endpoints do not prove production persistence.

## C9 — Data cutover and compatibility retirement

| ID    | Executable acceptance criterion                                                                         | Evidence             |
| ----- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| C9-01 | Immutable backup restores successfully to a disposable database                                         | D                    |
| C9-02 | Full additive migration runs twice; second run creates no duplicate/conflicting state                   | PG, D                |
| C9-03 | Counts, keys, relationships, RLS, audit continuity, and financial aggregates reconcile                  | PG, D                |
| C9-04 | Authorization and critical HR/Payroll shadow decisions have zero unresolved security/financial mismatch | PG, S, D             |
| C9-05 | Migration locks, duration, plans, and application performance meet approved budgets                     | PG, performance      |
| C9-06 | Failure injection proves rollback/recovery and documented cutover triggers                              | PG, D                |
| C9-07 | Explicit cutover approval exists before authority changes                                               | approval record      |
| C9-08 | Compatibility tables/code remain during the observation window; no destructive cleanup occurs           | schema inspection, G |

## Manual identities and data

Create synthetic identities only in a controlled non-production UAT tenant and
only in the phase that requires them:

- Authorization Admin / Maker
- Checker / Approver
- Target User
- Restricted User
- two Last-Administrator identities
- HR/Payroll operator, approver, employee-self, and restricted HR identities as
  later slices require

Permissions must be exact and least-privilege. Do not alter Demo records merely
to manufacture a pass.

## Execution record format

For every matrix row, the phase report must record the exact command, exit code,
test/pass/fail/skip counts, duration where available, dependency used
(PostgreSQL/Redis/MinIO or substitute), evidence path, and any classified
exception. A test that did not execute is `NOT RUN`, never `PASS`.
