# C3 Production Capability Map

- Date: 2026-10-09
- Final repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Read-only behavior reference: `E:\XS\Xyric Solutions LLP\Nexora-ERP`
- Phase status: mapping complete; C4 implementation not started

## Scope and method

This map compares the promoted TypeScript monorepo with the verified production
boundaries in the reference repository. The Python implementation is a
behavior, contract, test, and data reference only. No Python runtime is proposed
for the final application.

Disposition meanings:

- **Equivalent**: the TypeScript runtime already provides the required behavior.
- **Partial**: a usable boundary exists but required production behavior is absent.
- **Missing**: the production capability has no final-root implementation.
- **Conflicting**: the current TypeScript behavior would change or weaken the
  approved production behavior.
- **Obsolete**: the source capability is intentionally excluded by an approved
  architectural decision.
- **Test-only/unwired**: code exists but the production Express composition does
  not use it.

## System capability disposition

| Source capability                               | Reference evidence                                                                                                           | Final TypeScript boundary                        | Current disposition                                                                                               | Required phase |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- | -------------- |
| Runtime configuration and dependency health     | `app/production/config.py`, `application.py`                                                                                 | `apps/api`, `apps/worker`, `compose.yaml`        | Partial: PostgreSQL/Redis readiness exists; final environment is not yet connected to the preserved source schema | C4             |
| Correlation, safe logging, metrics, telemetry   | production middleware and protected metrics                                                                                  | `packages/observability`, Express middleware     | Partial/conflicting: correlation/logging exists; target metrics route is not protected                            | C4             |
| Tenant/account bootstrap and organization scope | platform repositories and tenant-scoped PostgreSQL data                                                                      | `packages/db`, `packages/domain`, API middleware | Missing; target identity schema is global                                                                         | C4             |
| Email/password authentication                   | `/api/v1/auth/login`; PostgreSQL credentials                                                                                 | `packages/auth`, `/auth/login/password`          | Conflicting: target login is not tenant-aware and returns `mfa_pending`                                           | C4             |
| Opaque server-side sessions                     | Redis session manager, tenant-bound cookies, expiry/revocation                                                               | PostgreSQL `user_session` service                | Partial/conflicting: opaque server state exists, but storage and response semantics differ                        | C4             |
| MFA/OIDC/SAML                                   | compatibility code and historical MFA state                                                                                  | target MFA APIs, contracts, UI, tables           | Obsolete in active runtime by approved decision; historical data must be retained                                 | C4             |
| Normalized permission evaluation                | R00-R07 PostgreSQL repositories and policy evaluator                                                                         | `packages/auth` policy evaluator/repositories    | Test-only/unwired: service code exists but production Express composition does not instantiate it                 | C4             |
| Governed role administration                    | roles, grants, activation/deactivation, delegation ceiling                                                                   | no production Express administration routes      | Missing                                                                                                           | C4             |
| Governed assignments                            | requests, assignment/revocation, lifecycle                                                                                   | no production Express administration routes      | Missing                                                                                                           | C4             |
| Approval, maker-checker, and SoD                | PostgreSQL approval workflow and security tests                                                                              | domain fragments/tests only                      | Test-only/unwired or missing from runtime                                                                         | C4             |
| Last-administrator protection                   | transactional PostgreSQL locking tests                                                                                       | repository test code only                        | Test-only/unwired                                                                                                 | C4             |
| Authorization audit                             | append-only `security_audit_event`                                                                                           | baseline security tables/repositories            | Partial and schema-conflicting                                                                                    | C4             |
| Identity & Access workspace                     | `/admin/identity`, five tabs, production APIs                                                                                | approved prototype UI/root web shell             | UI reference exists; production bindings are missing                                                              | C4             |
| Employee Master and Directory                   | HR service/repository/API and R08 tests                                                                                      | approved prototype screens                       | Missing production TypeScript API/data binding                                                                    | C5             |
| Employee Profile and private fields             | profile satellites, projections, field restrictions                                                                          | approved prototype screens                       | Missing production TypeScript API/data binding                                                                    | C5             |
| Employment lifecycle                            | employment relationships, effective states, history                                                                          | approved prototype screens                       | Missing                                                                                                           | C6             |
| Assignments, transfers, termination, rehire     | HR repositories/APIs and lifecycle tests                                                                                     | approved prototype screens                       | Missing                                                                                                           | C6             |
| HR organization/master data                     | organization units, positions, grades, locations, calendars                                                                  | approved prototype screens                       | Missing                                                                                                           | C7.1           |
| Compensation and salary history                 | salary components/structures/assignments                                                                                     | approved prototype screens                       | Missing                                                                                                           | C7.2           |
| Attendance, shifts, and time inputs             | attendance periods/entries, shifts, assignments                                                                              | approved prototype screens                       | Missing                                                                                                           | C7.3           |
| Leave and accruals                              | leave requests/balances/policies                                                                                             | approved prototype screens                       | Missing                                                                                                           | C7.4           |
| Overtime                                        | overtime requests, approvals, payable inputs                                                                                 | approved prototype screens                       | Missing                                                                                                           | C7.5           |
| Payroll eligibility and preflight               | HR payroll services/contracts/tests                                                                                          | approved prototype screens                       | Missing                                                                                                           | C7.6           |
| Payroll calculation and statutory rules         | payroll engine, Pakistan statutory pack, deterministic tests                                                                 | approved prototype screens                       | Missing                                                                                                           | C7.7           |
| Payroll review/approval/locking                 | approvals, payroll period/result state                                                                                       | approved prototype screens                       | Missing                                                                                                           | C7.8           |
| Payslips and employee access                    | payroll result/payslip contracts                                                                                             | approved prototype screens                       | Missing                                                                                                           | C7.9           |
| Payroll payment/export/corrections              | payment, reversal, controlled rerun tests                                                                                    | approved prototype screens                       | Missing                                                                                                           | C7.10-C7.11    |
| Finance accounting/posting/planning/reporting   | PostgreSQL production repositories, 26 operations                                                                            | prototype UI plus no final APIs                  | Missing                                                                                                           | C8             |
| Procurement and inventory                       | contracts/domain endpoints; production composition deliberately leaves persistence unconfigured and returns safe unavailable | prototype UI plus no final APIs                  | Partial in reference, missing in target; must not be represented as production-complete                           | C8             |
| Remaining ERP screens/modules                   | approved prototype interface                                                                                                 | root Next.js interface                           | UI-only until backed by contracts, APIs, PostgreSQL, authorization, and tests                                     | C8             |
| Background jobs                                 | source services plus transactional/outbox behavior where implemented                                                         | BullMQ sample job                                | Partial: worker topology exists; business jobs are missing                                                        | C4-C8 by slice |
| Object storage                                  | production storage boundary where needed                                                                                     | MinIO/object-store package                       | Partial; not yet linked to business records                                                                       | C5-C8 by slice |

## Route-family inventory

The reference OpenAPI contains 148 paths and 210 operations. Every operation is
assigned through these complete route families:

| Family                 | Paths | Operations | Disposition                                                                                  |
| ---------------------- | ----: | ---------: | -------------------------------------------------------------------------------------------- |
| Authentication         |     3 |          3 | Port with the approved session architecture in C4                                            |
| Security/authorization |    10 |         11 | Port R00-R07 in C4                                                                           |
| Platform               |    28 |         43 | Port only C4 prerequisites first; remaining platform administration follows dependency order |
| HR/Payroll             |    81 |        117 | R08 in C5, R09 in C6, remaining HR/Payroll in C7                                             |
| Finance                |    20 |         26 | C8 after HR/Payroll acceptance                                                               |
| Procurement            |     3 |          5 | C8; preserve reference safe-unavailable behavior until real persistence exists               |
| Inventory              |     3 |          5 | C8; preserve reference safe-unavailable behavior until real persistence exists               |

The final-root OpenAPI currently contains 17 paths and 18 operations, limited
to health, jobs, and authentication/MFA. It contains no production HR,
Payroll, platform-administration, finance, procurement, or inventory API.

## Production composition findings

1. The reference production composition uses PostgreSQL for platform, security,
   HR/Payroll, localization, and finance persistence.
2. Redis is used for server sessions, idempotency, rate limiting, and runtime
   coordination.
3. Procurement/inventory endpoints are present, but their production repository
   is intentionally not composed; the safe behavior is a closed/unavailable
   response, not ephemeral persistence.
4. The TypeScript policy evaluator and PostgreSQL policy repositories are not
   wired into `apps/api/src/app.ts` or `apps/api/src/server.ts`.
5. The final-root web is the approved visual baseline, but many ERP workflows
   remain mock/UI-only and cannot be accepted until a real API and database path
   exists.

## Source acceptance evidence to preserve

- R02 reported 1,836 legacy/normalized authorization comparisons with zero
  mismatches. C4 must recreate representative fixtures and independently verify
  parity; the historical count is evidence, not a substitute for a new run.
- R04 tests cover governed administration, delegation ceilings, maker-checker,
  SoD, transactional last-administrator protection, idempotency, rollback, and
  immutable audit.
- R06 Manual Gate 1 passed in the reference application for email/password,
  Redis sessions, and the five-tab Identity & Access workspace.
- R07 activated normalized reads with compatibility protection in the reference
  application.
- R08 automated checks passed in the reference application, but Manual Gate 2
  did not pass because the approved browser backend was unavailable. C5 must
  repeat the gate in the final application and must not inherit a pass.

## Exact proposed C4 scope

C4 should be limited to the following security foundation:

1. Connect the TypeScript runtime to a disposable restore/clone of the preserved
   PostgreSQL schema and to Redis; never test new migrations first against the
   only source database.
2. Add tenant-aware email/password authentication against
   `security_user_account` and `security_password_credential`.
3. Preserve existing PBKDF2-SHA256 credential verification and rehash to
   Argon2id only after a successful login; do not force or invent passwords.
4. Use Redis as the authoritative active-session store, with opaque tenant-bound
   identifiers, rotation, idle/absolute expiry, revocation, secure HttpOnly
   cookies, and CSRF/origin protection. PostgreSQL remains authoritative for
   identity, authorization, and audit data.
5. Remove active MFA routes, responses, UI, and runtime gates without dropping
   historical MFA tables or data.
6. Port and wire R00-R07 repositories, exact permission evaluation,
   administration APIs, idempotency, approvals, SoD, delegation limits,
   last-administrator locking, and append-only audit against the preserved
   schema.
7. Bind `/admin/identity` and its Roles, Assignments, Approvals, Permissions,
   and Audit tabs to the production APIs without adding top-level routes.
8. Port only the tenant/company/organization and localization prerequisites
   required to evaluate C4 scope. HR business workflows remain C5+.
9. Protect operational endpoints, including metrics, and retain fail-closed
   dependency behavior.
10. Run the C4 section of `C3-executable-test-matrix.md` and Manual Gate 1
    before proposing C5.

## C3 gate

- The production capability families have an explicit target phase and
  disposition.
- No Python runtime or dual-backend production architecture is proposed.
- No reference source, database, migration, or runtime code was modified in C3.
- C4 has not started and requires explicit approval of the scope above.

## Verification snapshot

- Reference OpenAPI: 148 paths / 210 operations.
- Final-root baseline OpenAPI: 17 paths / 18 operations.
- PostgreSQL: 139 public tables, 35 migration rows, 204 permission definitions,
  15 users, 39 roles, 41 role policies, 24 assignments, 215 security audit
  events, 5 employees, 5 employee assignments, 2 payroll periods, and 1 payroll
  result.
- Redis: `PING` returned `PONG`.
- Reference Git safety: HEAD remains
  `91db05fb68d624f289d9bff8c22eaddf94b44abc`; expanded status remains 86
  modified and 86 untracked entries, exactly matching the C0 path manifest.
