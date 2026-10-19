# W2-04 Dynamic Authorization Implementation Plan

- Status: implemented and application-verified; infrastructure exceptions are recorded in the evidence
- Date: 2026-10-07
- Working directory: `prototype/`
- Source specification: `../specs/2026-10-07-w2-04-dynamic-authorization-design.md`
- Parent roadmap: `2026-10-06-hr-payroll-node-implementation-plan.md`
- Scope: W2-04 only; stop before W2-05 policy middleware

## 1. Outcome

Deliver a framework-independent, deny-by-default authorization model backed by
PostgreSQL. It will support dynamic roles, exact permissions, explicit
enterprise/company/branch/organization scope, field allow-lists, state-aware
lifecycle permissions, effective-dated assignments, dynamic segregation of
duties, bootstrap administration, and atomic security evidence.

Completion requires positive and negative permission/scope/field/state/SoD
matrices, including cross-company denial. This phase will not add security
administration screens, centralized Express middleware, UI capability
projection, or workflow execution.

## 2. Implementation rules

1. Add failing focused tests before each behavioral slice.
2. Keep policy decisions in `@nexora/auth`; no Express, PostgreSQL, or browser
   types may enter the policy package.
3. Use exact permission keys. Wildcards, role-name checks, and direct-user
   permission grants are prohibited.
4. Derive company/scope and actor relations from trusted server data, never an
   unvalidated client assertion.
5. A permit requires one or more effective assignments that jointly satisfy
   permission, scope, fields, state, and SoD. Missing policy data denies.
6. Administration mutations and `security_policy_event` evidence commit in one
   PostgreSQL transaction.
7. Preserve W2-01 through W2-03 behavior and public contracts.
8. Add no dependency unless the existing platform is technically insufficient.

## 3. Delivery sequence

### W2-04-01 — Policy types and deterministic evaluator

Add:

- `packages/auth/src/policy/types.ts`
- `packages/auth/src/policy/evaluator.ts`
- `packages/auth/src/policy/service.ts`
- `packages/auth/src/policy/index.ts`
- `tests/unit/auth-policy.test.ts`

Update:

- `packages/auth/src/index.ts`

Define immutable types for:

- trusted principal and assurance level;
- role assignment, exact permission, scope grant, field grant, allowed source
  state, and SoD snapshot rows;
- authorization request and structured decision;
- safe denial codes.

Add `PolicyService` as the production decision boundary. It loads one complete
snapshot through a repository port, invokes the pure evaluator, and converts
repository errors or incomplete data into `policy_unavailable` denial. This is
the stable service W2-05 will consume.

Evaluator order:

1. reject inactive users or no effective assignments;
2. enforce the exact permission row's `required_assurance` metadata;
3. exact-match the permission key;
4. retain only assignments whose scope covers the target node;
5. union fields only across those qualifying assignments and require complete
   coverage for field-bearing operations;
6. validate the current state for state-aware permissions;
7. deny configured assignment or transaction SoD conflicts;
8. issue a permit only after every applicable check succeeds.

The evaluator must not combine a permission from an out-of-scope assignment
with a scope grant from another assignment. It must not interpret missing
fields, states, actor relations, or repository failures as unrestricted access.

Tests:

- exact allow and unknown/wildcard denial;
- every standard and lifecycle action;
- complete, partial, empty, and unrelated field allow-lists;
- enterprise, company, branch, descendant, sibling, and cross-company scope;
- future, expired, revoked, and inactive assignments;
- state-aware allow/deny and missing-state denial;
- dynamic role conflict and maker-checker/self-approval denial;
- deterministic results independent of input ordering.

Gate:

```powershell
npm run test:unit -- tests/unit/auth-policy.test.ts
npm run typecheck
```

### W2-04-02 — PostgreSQL authorization schema

Add:

- `packages/db/migrations/0005_authorization_policy.sql`

Update:

- `packages/db/src/schema/security.ts`
- `tests/integration/postgres-migrations.test.ts`
- `tests/integration/authentication.test.ts`
- `tests/integration/sessions.test.ts`
- `tests/integration/mfa.test.ts`

Create normalized tables:

- `security_scope`
- `security_permission`
- `security_permission_state`
- `security_role`
- `security_role_permission`
- `security_field_grant`
- `security_role_assignment`
- `security_assignment_scope`
- `security_sod_policy`
- `security_policy_event`
- `security_policy_command`

Database controls:

- one enterprise root per installation;
- scope code and normalized display-name uniqueness within the company boundary,
  including the enterprise/null-company boundary, plus explicit active/archive
  lifecycle checks;
- valid company → branch → organization hierarchy and same-company parents;
- cycle rejection on scope changes;
- unique exact permission keys and normalized action/resource fields;
- unique dynamic role codes without authorization meaning;
- effective-date checks and concurrency-safe non-overlapping active user/role
  assignments;
- explicit scope grants with `include_descendants`;
- unique role-permission and field grants;
- unordered role-pair uniqueness and complete SoD policy shapes;
- database-enforced append-only policy events with safe JSON metadata;
- indexes for user snapshot loading, scope ancestry, active assignments,
  permission lookup, and SoD lookup.
- durable policy command identifiers, request fingerprints, and replay results.

Use one documented transaction-scoped PostgreSQL advisory-lock key for every
policy mutation. Hierarchy, assignment-overlap, SoD, and last-administrator
triggers acquire the same lock before checking invariants. This deliberately
serializes low-volume policy administration and prevents empty-key-range races
without adding a privileged extension dependency.

Seed this explicit application-defined security catalogue:

Pipe-separated action suffixes below expand to separate exact permission rows;
they are documentation shorthand, not wildcard permissions.

- `security.access.administer`
- `security.scope.read|create|edit|archive`
- `security.role.read|create|edit|archive`
- `security.permission.read`
- `security.role_permission.read|edit`
- `security.field_grant.read|edit`
- `security.role_assignment.read|create|edit|archive`
- `security.sod_policy.read|create|edit|archive`
- `security.policy_event.read`

Every seeded permission declares required assurance, field-bearing behavior,
state-context behavior, sensitivity, allowed source states where applicable,
and bootstrap field paths. All security mutation permissions require MFA.
`security.access.administer` is the sentinel for the last-administrator
invariant, but it counts only when the same effective enterprise-scoped
principal also has this complete recovery bundle:
`security.scope.read`, `security.role.read|create|edit`,
`security.permission.read`, `security.role_permission.read|edit`,
`security.field_grant.read|edit`, and
`security.role_assignment.read|create|edit|archive`. Granular permissions still
authorize each operation. Permission IDs may be stable migration identifiers,
but policy code must resolve by exact key and never authorize by a seeded
identifier. Hard delete is intentionally absent for governed security records;
other modules may register exact `delete` permissions when their domain permits
deletion.

The initial administrator's field grants are explicit by resource:

- scope: `code`, `displayName`, `type`, `parentScopeId`, `status`, `version`;
- role: `code`, `displayName`, `description`, `status`, `version`;
- permission: `key`, `module`, `resource`, `action`, `description`,
  `requiredAssurance`, `fieldBearing`, `stateContextRequired`, `sensitivity`;
- role permission: `roleId`, `permissionKey`;
- field grant: `roleId`, `permissionKey`, `fieldPath`;
- assignment: `userId`, `roleId`, `validFrom`, `validUntil`, `status`, `scopes`,
  `version`;
- SoD: `kind`, `firstRoleId`, `secondRoleId`, `protectedPermissionKey`,
  `actorRelation`, `status`, `version`;
- policy event: safe identifiers, event type, time, and redacted metadata.

Create has no source state. Edit requires an active target; archive requires an
active target; reads may include active or archived policy records when their
exact field checks pass. An archived scope never grants or covers operational
access. Historical scope reads are authorized against an effective active
ancestor, normally company or enterprise scope. These are authorization bounds,
while domain and future workflow rules may be stricter.

Migration behavior:

- forward-only and transactional;
- safe on an empty database and an existing W2-03 database;
- preserve users, credentials, sessions, MFA, and security evidence;
- backfill an existing bootstrap administrator through dynamic policy records;
- repeated migration remains checksum-verified and idempotent.

Update every existing integration cleanup that truncates `app_user` so the new
restrictive authorization foreign keys are cleared first. Do not add `CASCADE`
as a shortcut because it would hide ownership and evidence dependencies.

Gate:

```powershell
npm run test:integration -- tests/integration/postgres-migrations.test.ts
npm run typecheck
```

### W2-04-03 — PostgreSQL policy snapshot repository

Add:

- `apps/api/src/modules/auth/policy-repository.ts`
- `tests/integration/authorization-policy.test.ts`

Implement parameterized queries that load one immutable policy snapshot for a
user and evaluation timestamp:

- active user and effective assignments;
- active dynamic roles and exact permissions;
- permission state bounds and field allow-lists;
- assignment scopes and authorized descendant paths;
- applicable assignment and transaction SoD policies.

Load all rows in one read-only `REPEATABLE READ` transaction so assignments,
grants, fields, scopes, states, and SoD rules come from one database snapshot.
Use recursive CTEs for bounded scope ancestry/descendancy. Every scope query
must retain the enterprise and company boundary. Return no partial snapshot
when required policy rows are inconsistent; `PolicyService` converts that
failure to a policy-unavailable denial.

Do not cache decisions in this phase. Immediate revocation correctness is more
important than speculative optimization. Add query-plan indexes and a bounded
performance assertion for the representative matrix instead.

Integration tests:

- valid company, branch, and descendant access;
- scope code and normalized display-name collisions at enterprise and company
  boundaries;
- sibling and cross-company denial using valid target UUIDs;
- archived scopes excluded from operational coverage, historical archived-scope
  reads authorized through an active ancestor, and invalid parent/archive
  transitions;
- inactive role/user/assignment exclusion;
- effective-date boundaries;
- field and state rows attached only to their exact permission grant;
- concurrent assignment overlap denial;
- repository failure produces no permit.

Gate:

```powershell
npm run test:integration -- tests/integration/authorization-policy.test.ts
npm run test:unit -- tests/unit/auth-policy.test.ts
```

### W2-04-04 — Bootstrap policy and lockout protection

Update:

- `apps/api/src/modules/auth/repository.ts`
- `tests/integration/authentication.test.ts`
- `tests/integration/authorization-policy.test.ts`

Extend the existing bootstrap transaction so a new installation atomically
creates:

- the bootstrap user and credential evidence;
- one enterprise scope root;
- one ordinary dynamic initial-administrator role;
- explicit security permissions and field grants;
- an effective enterprise-root assignment with descendant access;
- corresponding policy evidence.

The existing `bootstrap_administrator` flag remains identity/recovery metadata
and never authorizes a policy request. Migration backfill and new-installation
bootstrap must produce equivalent effective policy.

Protect the last administrator by enterprise scope plus the exact
`security.access.administer` sentinel and complete recovery-permission bundle,
not role name. Any mutation to role lifecycle, role permissions, assignments,
assignment scopes, or relevant user status that would leave no effective
principal able to administer role assignments must roll back. Enforce the
invariant within the same locked transaction and with a deferred database
trigger using the shared policy lock so alternate write paths cannot bypass it.

Tests:

- bootstrap gets authorization only through dynamic records;
- renaming the initial role does not alter access;
- bootstrap flag alone grants nothing;
- assurance is enforced from exact permission metadata rather than key prefixes;
- a second eligible administrator permits revocation of the first;
- removing the final eligible administrator is rejected atomically;
- simultaneous attempts to remove two remaining eligible administrators leave
  at least one effective administrator;
- migration backfill and fresh bootstrap have equivalent policy decisions.

Gate:

```powershell
npm run test:integration -- tests/integration/authentication.test.ts tests/integration/authorization-policy.test.ts
npm run test:security
```

### W2-04-05 — Security administration service and atomic evidence

Add:

- `packages/auth/src/policy/administration.ts`
- `apps/api/src/modules/auth/policy-administration-repository.ts`
- `tests/unit/auth-policy-administration.test.ts`

Update:

- `packages/auth/src/policy/index.ts`

Create a framework-independent administration service with repository ports for:

- scope create/edit/archive/read;
- dynamic role create/edit/archive/read;
- permission catalogue reads;
- role-permission and field-grant changes;
- assignment create/change/revoke/read and scope changes;
- SoD create/edit/archive/read.

Each command accepts a trusted actor context with session assurance, exact
permission request, expected version, required command identifier, and
normalized command data. The repository derives a canonical request fingerprint.
The same identifier and fingerprint returns the stored result; a mismatched
fingerprint returns a conflict. Security administration requires MFA assurance.

Repository commands must:

- acquire the shared policy mutation advisory lock;
- reload the actor's policy and reauthorize inside the write transaction before
  changing state, closing the check/use race with concurrent revocation;
- lock affected rows in deterministic order;
- enforce optimistic version matching;
- prevent assignment and transactional SoD configuration conflicts;
- protect the last eligible administrator;
- append one `security_policy_event` with safe identifiers and before/after
  summaries;
- commit or roll back state and evidence together.

Concurrent integration tests must cover incompatible assignments inserted into
an empty range, competing scope-parent changes, and simultaneous removals of
the final eligible administrators.

No Express routes are mounted in W2-04. W2-05 will compose these services behind
centralized policy middleware. This prevents publishing administration paths
before their uniform enforcement point exists.

Tests:

- allowed and forbidden administration commands;
- password-only session denial for security administration;
- stale version and duplicate command behavior;
- conflicting role assignment denial;
- invalid/self-conflicting SoD definition denial;
- rollback when event insertion fails;
- safe errors without policy or field-value leakage.

Gate:

```powershell
npm run test:unit -- tests/unit/auth-policy-administration.test.ts
npm run test:integration -- tests/integration/authorization-policy.test.ts
```

### W2-04-06 — Shared administration and decision contracts

Add:

- `packages/contracts/src/security/index.ts`
- `tests/contract/security-policy-contracts.test.ts`

Update:

- `packages/contracts/src/index.ts`
- `packages/contracts/src/openapi.ts`
- `tests/contract/openapi.test.ts`
- `openapi-v1.json`

Define strict Zod contracts for scope, role, permission, field grant,
assignment, SoD policy, administration commands, and authorization decisions.
Use discriminated unions for SoD policy kinds and safe denial reason enums.
Reject unknown fields, invalid exact permission keys, wildcard paths, malformed
field paths, invalid effective ranges, and incomplete policy shapes.

Publish reusable schemas as OpenAPI components, but do not advertise HTTP paths
that W2-04 does not mount. W2-05 will add protected routes and generated-client
methods at the same time, keeping implementation and public API truthful.

Gate:

```powershell
npm run api:generate
npm run test:contract
npm run api:check
npm run typecheck
```

### W2-04-07 — Complete authorization and security matrix

Update:

- `tests/integration/authorization-policy.test.ts`
- `tests/security/foundation-security.test.ts`
- `tests/performance/foundation-performance.test.ts`

Complete table-driven matrices for:

- dynamic roles across read/create/edit/delete/archive;
- draft/edit/submit/return/approve/reject/cancel decisions;
- allowed and forbidden current states;
- complete and incomplete create/edit/decision field sets;
- enterprise/company/branch/org/descendant/sibling/cross-company targets;
- conflicting roles and maker-checker actor relations;
- inactive, future, expired, and revoked assignments;
- exact IDOR-style requests using valid IDs outside the actor's scope;
- policy-store failure and incomplete snapshot fail-closed behavior;
- sensitive-value absence from logs, errors, and policy events.

Add a representative snapshot/evaluation performance budget that is documented
as a regression signal rather than a production capacity claim. Do not weaken
correctness through authorization-result caching.

Gate:

```powershell
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:security
npm run test:performance
```

### W2-04-08 — Evidence and phase gate

Add:

- `docs/evidence/W2-04-dynamic-authorization.md`

Update the prior evidence only where it references W2-04 as pending. Record:

- migration and schema inventory;
- permission/action matrix;
- scope matrix with explicit cross-company results;
- field allow-list results;
- assignment and transaction SoD results;
- bootstrap and last-administrator results;
- exact verification commands and counts;
- migration forward-fix and operational limitations;
- W2-05 handoff boundary.

Run the complete gate:

```powershell
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:security
npm run test:performance
npm run api:check
npm run build
npm audit --omit=dev --audit-level=high
npm test
```

Run Gitleaks using the existing pinned configuration and rebuild the API image
when Docker Desktop is healthy. Record infrastructure failures separately from
application failures; do not claim a container pass unless it runs.

## 4. Dependency order

| Wave | Tasks | Dependency |
| --- | --- | --- |
| A | W2-04-01, W2-04-02 | Approved specification |
| B | W2-04-03, W2-04-04 | Policy types and schema |
| C | W2-04-05, W2-04-06 | Evaluator, repository, and bootstrap policy |
| D | W2-04-07 | All behavioral slices |
| E | W2-04-08 | Full implementation |

Within a wave, edits must avoid overlapping files or proceed sequentially.
Database migration, Drizzle schema, and migration tests are one reviewable unit.
Bootstrap changes are reviewed separately because they alter the security root.

## 5. Migration and rollback safety

`0005_authorization_policy.sql` is additive and forward-only. It does not remove
or rewrite credential, session, or MFA data. Backfill reads only the completed
bootstrap identity and inserts equivalent dynamic policy rows.

Before production data exists, rollback may remove the new authorization tables
in reverse dependency order. After policy administration begins, corrections
must use a new forward migration so assignments and security evidence are not
discarded. The evidence document must distinguish these two situations.

## 6. Security review checklist

- No role-name or bootstrap-flag authorization branch.
- No direct-user permission grant or wildcard permission.
- No permission/scope composition across unrelated assignments.
- No missing-field or missing-state permit.
- No client-controlled company, actor relation, or assurance trust.
- No cross-company existence disclosure.
- No self-approval when the dynamic SoD policy forbids it.
- No removal of the last effective security administrator.
- No administration state without matching transaction evidence.
- No secret, MFA material, field value, or unrestricted policy snapshot in logs.

## 7. Completion gate

W2-04 is complete only when:

1. All eight tasks are implemented and reviewed.
2. Permission, scope, field, state, and SoD matrices pass in unit and PostgreSQL
   integration tests.
3. Cross-company access using valid target identifiers is denied.
4. Bootstrap access is derived exclusively from dynamic policy records.
5. Last-administrator and atomic-evidence controls pass adversarial tests.
6. Generated contracts have no drift and all repository regression gates pass.
7. Evidence records exact results and W2-05 remains unstarted.
