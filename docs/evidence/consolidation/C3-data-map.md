# C3 PostgreSQL and Runtime Data Map

- Date: 2026-10-09
- Source database: `nexora_demo_v2` on the preserved PostgreSQL service
- Snapshot mode: read-only inventory; no rows or schema objects changed
- Required implementation rule: rehearse against a restored clone before any
  additive change is applied to the preserved source database

## Source database baseline

| Measure                   | Observed value |
| ------------------------- | -------------: |
| Public tables             |            139 |
| Applied source migrations |             35 |
| RLS-enabled tables        |            126 |
| RLS policies              |            126 |
| Foreign keys              |            302 |
| Unique constraints        |            129 |
| Check constraints         |          2,435 |

The 13 non-RLS tables are global/reference data: country, HR statutory-rule
reference tables, jurisdiction, legal-entity types, localization pack/publisher
and release tables, `nexora_schema_migration`, and
`security_permission_definition`. Their lack of RLS is intentional only when
the row is globally shared and application writes are appropriately restricted.

## Migration authority

| Repository          | Ledger                                                            | State                                                               | Decision                                                             |
| ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Reference/source    | `nexora_schema_migration(module_name, version, name, applied_at)` | 35 rows: platform 1-6, security 1-5, workflow 1, finance 1, HR 1-22 | Preserve and adopt for module-aware additive migrations              |
| TypeScript baseline | `nexora_migration(name, checksum, applied_at)`                    | 5 migrations in its isolated test database                          | Do not run baseline migrations 0001-0005 against the source database |

The target baseline migrations create a second, global authentication and
authorization model. Applying them to the source database would create two
authorities and weaken tenant isolation. C4 must introduce a source-schema
compatibility repository/migration path rather than replaying the baseline
schema on the preserved database.

## Core record mapping

| Domain                      | Source authority                             |                      Observed rows | Final TypeScript mapping                                                 | Exception/status                                                 |
| --------------------------- | -------------------------------------------- | ---------------------------------: | ------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| Tenant                      | tenant tables and tenant RLS context         |                   2 active tenants | Preserve source IDs; trusted session binds one tenant                    | Target has no equivalent tenant root                             |
| Organization/company        | organization and legal-entity/company tables |              10 organization units | Native TS repositories over source keys and effective relationships      | Do not infer missing relationships                               |
| User account                | `security_user_account`                      |                          15 active | Tenant-scoped account repository                                         | Target `app_user` has globally unique login and is incompatible  |
| Password credential         | `security_password_credential`               | 15; zero users missing credentials | Compatibility verifier; preserve account/credential IDs                  | Source PBKDF2-SHA256; target Argon2id                            |
| External identity           | `identity_subjects`                          |                                 15 | Preserve as historical/optional mapping only                             | No OIDC/SAML runtime is approved                                 |
| MFA metadata                | account `mfa_state` and historical tables    |             6 disabled, 9 enrolled | Retain data, ignore as authentication requirement                        | Enrollment is not current-session assurance; MFA is out of scope |
| Roles                       | `security_tenant_role`                       |                                 39 | Tenant-scoped role repository                                            | Target global `security_role` is incompatible                    |
| Legacy policies             | `security_role_policy`                       |   41 total: 25 active, 16 inactive | Preserve compatibility evidence; do not overwrite                        | Normalized reads remain governed by R07 behavior                 |
| Permission definitions      | `security_permission_definition`             |                                204 | Read-only exact catalog in TS                                            | Module counts below                                              |
| Permission grants           | `security_role_permission_grant`             |                                437 | Normalized role grant repository                                         | Preserve source traceability and lifecycle                       |
| Field grants                | `security_role_field_grant`                  |                                  0 | Implement repository and fail closed when private fields require a grant | Zero rows must not mean unrestricted access                      |
| User-role assignments       | `security_user_role_assignment`              |     24 total: 20 active, 4 revoked | Preserve lifecycle/effective dates and scope                             | Revoked rows remain evidence, not deletions                      |
| Security audit              | `security_audit_event`                       |                                215 | Append-only audit repository                                             | Updates/deletes prohibited through normal flows                  |
| Employee                    | HR employee tables                           |                                  5 | Preserve employee IDs and tenant/company relationship                    | C5                                                               |
| Employee assignment         | effective assignment tables                  |                                  5 | Preserve history and current/effective projections                       | C6                                                               |
| Employee contacts/documents | profile satellite tables                     |            0 contacts, 0 documents | Schema still required; no synthetic source data                          | C5                                                               |
| Attendance periods          | attendance tables                            |                                  2 | Preserve IDs/status and inputs                                           | C7                                                               |
| Leave requests              | leave tables                                 |                                  1 | Preserve workflow/effective state                                        | C7                                                               |
| Payroll periods             | payroll tables                               |                                  2 | Preserve IDs, state, locks                                               | C7                                                               |
| Payroll results             | payroll result tables                        |                                  1 | Preserve exact monetary values and lineage                               | C7                                                               |
| Approvals                   | governed approval tables                     |                                  4 | Preserve maker/checker and decision history                              | C4/C7 by subject                                                 |
| Field-change audit          | `audit_field_change`                         |                                  0 | Keep schema and write only where policy requires                         | Zero rows are not permission to omit it                          |

## Permission catalog

| Module      | Definitions |
| ----------- | ----------: |
| Finance     |          19 |
| HR          |         112 |
| Inventory   |           5 |
| Platform    |          35 |
| Procurement |          12 |
| Security    |          19 |
| Workflow    |           2 |
| **Total**   |     **204** |

Names and meanings are data-contract authority. C4 must use the catalog
exactly; it must not manufacture broader wildcard permissions or static role
names.

## Password migration strategy

1. Normalize the submitted email and select the account by trusted tenant plus
   email using a timing-safe authentication path.
2. Verify existing PBKDF2-SHA256 hashes using their stored parameters.
3. After a successful login only, replace the hash with the approved Argon2id
   representation in a transaction, retaining the same account relationship.
4. A failed verification never changes the credential.
5. Never log, export, document, or place the password/hash in a session.
6. Tests must cover concurrent successful logins and ensure a valid rehash is
   not lost or corrupted.

## Session data decision

Redis is the authoritative active-session store because that is the verified
reference behavior and the approved design assigns Redis to sessions. Session
records contain only trusted server state: opaque-session digest/key, tenant,
user/account ID, timestamps, expiry, revocation/version information, and CSRF
binding as needed. Authorization snapshots are not accepted from cookies.

The target PostgreSQL `user_session` table is a baseline artifact, not a second
production session authority. C4 must retire its runtime use without dropping
the table during the additive migration period. PostgreSQL remains the source
of truth for identity/account status, role/assignment state, and audit.

## Source-to-target implementation rule

The final application will not bulk-copy source rows into the incompatible
global target tables. Native TypeScript repositories will first read/write the
preserved tenant-scoped source schema. Any later physical remodel must be a
separate, deterministic, idempotent, traceable migration with source IDs,
exceptions, counts, and cutover approval in C9.

## Exceptions and conflicts

| ID       | Classification                | Finding                                                                | Required handling                                                                                |
| -------- | ----------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| DATA-001 | Schema conflict               | Global target users/roles cannot represent two isolated tenants safely | Do not make target baseline tables authoritative                                                 |
| DATA-002 | Ledger conflict               | Target and source use different migration ledgers                      | Add a module-aware TS runner compatible with the preserved source ledger                         |
| DATA-003 | Hash algorithm difference     | Existing credentials are PBKDF2; target expects Argon2id               | Compatibility verify and opportunistic rehash                                                    |
| DATA-004 | Session authority conflict    | Reference uses Redis; target baseline uses PostgreSQL                  | Use one active authority: Redis; retain old table until retirement approval                      |
| DATA-005 | Historical MFA data           | Nine accounts are marked enrolled                                      | Preserve rows but remove active MFA semantics                                                    |
| DATA-006 | Empty field-grant catalog     | No current field-grant rows                                            | Fail closed for private fields; create grants only through governed administration/data approval |
| DATA-007 | Reference module completeness | Procurement/inventory persistence is not composed                      | Preserve safe-unavailable response; never fall back to demo/in-memory data                       |
| DATA-008 | R08 evidence gap              | Browser Manual Gate 2 never passed                                     | Re-run in C5; do not mark source evidence as accepted target behavior                            |

No invalid or ambiguous source records were automatically remapped in C3.
Record-level exception discovery will run against a restored clone during each
implementation phase and will stop rather than guess.

## Additive migration safety rules

1. Verify the immutable C0 backup and restore it to a disposable database.
2. Confirm exact migration ledger and row counts before applying new SQL.
3. Acquire a migration advisory lock and apply ordered migrations once.
4. Run the same migration command again; the second run must be a no-op.
5. Reconcile counts, foreign keys, RLS/policies, sample decisions, and audit.
6. Prove rollback/recovery on the clone. Do not write destructive down
   migrations for populated production tables.
7. Measure locks and query plans on realistic volume before live approval.
8. Never delete old tables/columns/data during C4-C9 compatibility phases.

## C4 database gate

C4 cannot be accepted until the TypeScript runtime exercises the restored
source schema through real PostgreSQL and Redis, tenant isolation tests pass,
existing account/role/assignment/audit counts remain unchanged except for
explicit test fixtures, and no target-baseline migration has been applied to
the source database.
