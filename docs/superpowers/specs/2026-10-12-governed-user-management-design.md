# Nexora Governed User Management Design

- Status: approved design
- Date: 2026-10-12
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Production workspace: `/admin/identity?tab=users`
- Authentication: email/username, password, PostgreSQL/Redis server-side session
- Database: PostgreSQL with forced tenant RLS

## 1. Outcome

Add production user lifecycle administration to the existing Identity & Access
workspace. Authorized dynamic roles can list, create, edit, activate, lock,
deactivate, archive, reset credentials, revoke sessions, manage company access,
link an employee, and assign or revoke roles. Every capability is protected by
an exact permission and enforced by the backend.

User administration extends the existing governed security administration
model. It does not create a second identity system, a separate top-level route,
or a static `Admin` role. A role is an administrator only through its exact
permissions and delegated scope.

## 2. Approved Decisions

1. Add a sixth **Users** tab inside `/admin/identity`; do not add a separate
   top-level Users route.
2. Support the complete governed lifecycle rather than a read-only directory.
3. Generate a cryptographically strong one-time initial password after account
   approval. Show it once and require the user to change it before receiving a
   normal application session.
4. Allow multiple companies per user and require one default company for all
   newly activated users.
5. Use risk-based maker-checker governance:
   - create, identity edit, activate, unlock, deactivate/archive, company
     access, employee link, initial role, later role, and password-reset changes
     require independent approval;
   - emergency account lock and session revocation apply immediately and are
     permission-controlled, idempotent, and audited.
6. Never hard-delete a user. Archive is governed deactivation with retained
   identity, assignments, approvals, business references, and audit evidence.
7. Reuse the existing effective-dated `employee_user_binding`. One employee may
   have at most one active user binding and one user at most one active employee
   binding for overlapping periods.
8. Keep existing authorization behavior authoritative during additive schema,
   backfill, and shadow-read parity. Company-access enforcement activates only
   after a separately verified zero-security-mismatch gate.

## 3. Scope

### Included

- Tenant-scoped user directory, search, filters, pagination, and detail.
- Account creation and stable local identity.
- Display name, username, email, lifecycle status, optional employee link,
  allowed companies, default company, and initial roles.
- Identity edits without changing the immutable user ID or identity subject.
- Governed activation, unlocking, deactivation/archive, password reset,
  company-access changes, employee-binding changes, and role changes.
- Immediate emergency lock and session revocation.
- Generated one-time credentials and mandatory first-login password change.
- Exact permission checks, delegation limits, maker-checker, SoD,
  last-administrator protection, idempotency, optimistic concurrency, tenant
  isolation, company isolation, and append-only audit evidence.
- PostgreSQL-backed APIs, contracts, OpenAPI, generated web client, UI,
  automated tests, and controlled synthetic UAT.

### Excluded

- Hard deletion.
- Self-registration, public invitation links, outbound email delivery, OIDC,
  SAML, MFA, mobile, desktop, or extension applications.
- Service-account lifecycle and API-key administration.
- HR/Payroll business-logic redesign.
- Changes to the approved prototype source.
- A separate identity microservice or competing navigation architecture.

## 4. Existing Components to Reuse

| Concern | Existing production authority | Treatment |
| --- | --- | --- |
| Accounts | `security_user_account` | Extend additively; preserve IDs and rows |
| Credentials | `security_password_credential` | Extend credential state; retain Argon2 compatibility |
| Employee identity | `employee_user_binding` | Reuse unchanged for effective-dated links |
| Companies | `organization_unit` with `type='company'` | Reference active tenant companies |
| Roles and grants | normalized security role and assignment relations | Reuse; do not create direct user permissions |
| Administration | `security_administration_command` and repository | Extend transaction/idempotency conventions |
| Approvals | role/assignment approval workflow | Extend to `resource_type='user'` |
| Sessions | Redis tenant session service | Reuse for session revocation and refresh denial |
| Audit | append-only, hash-chained security audit | Append user lifecycle evidence atomically |
| Web | `/admin/identity` | Add one tab and in-workspace detail state |

## 5. Data Model

### 5.1 Account extensions

Extend `security_user_account` additively with:

- `display_name`, nullable for legacy compatibility but required by the API for
  new accounts;
- `session_version`, initialized without invalidating existing sessions and
  advanced by security operations that revoke all current sessions;
- archive metadata (`archived_by`, `archived_at`, and archive reason) while
  retaining the existing `inactive` database status;
- existing `row_version` for optimistic concurrency.

The primary user ID, tenant ID, and `identity_subject` are immutable. Email is
editable only through an approved request and remains unique within the tenant.

### 5.2 Credential state

Extend `security_password_credential` with:

- `must_change_password`;
- `password_version`;
- `password_changed_at`;
- `credential_status` limited to active or reset-required states.

Only an Argon2 password verifier is persisted for new and reset credentials.
The migration makes the legacy PBKDF2 verifier columns nullable only when a
valid Argon2 verifier and timestamp are present, and adds a check requiring one
complete verifier representation. Existing PBKDF2 and dual-verifier rows are
not rewritten. The Argon2 verifier is authoritative whenever it is present.
The one-time plaintext is returned once in the successful approval response and
is excluded from the database, command projection, logs, audit evidence,
telemetry, URLs, cookies, and browser storage.

### 5.3 Governed user changes

Create `security_user_change_request` with tenant-composite foreign keys and
forced RLS. It records:

- request ID, target user ID when one exists, and requested action;
- proposed identity, companies, default company, employee link, initial roles,
  lifecycle transition, or password-reset intent;
- draft/submitted/approved/rejected state;
- maker, submitter, checker, timestamps, decision reason, and row version;
- source request and command references.

Submitted requests are immutable except for the checker decision. Decided
requests cannot be updated or deleted. Database constraints enforce evidence
completeness and maker/checker separation.

### 5.4 Company access

Create `security_user_company_access` as an append-retained grant relation with:

- stable access ID, tenant, user, and company;
- default-company flag;
- granted by/at and revoked by/at;
- source request and audit references.

Only active `organization_unit` rows with `type='company'` are eligible. A
partial unique index permits at most one active default per user. An activated
new user must have at least one active company and exactly one default.
Revocation ends a grant rather than deleting it.

### 5.5 Employee binding

Reuse `employee_user_binding`. Creating, ending, or replacing the current link
occurs in the same approved user-change transaction. Its existing exclusion
constraints, immutable history trigger, RLS, and tenant-composite foreign keys
remain authoritative.

## 6. Authorization Model

Extend the existing `security.user_account.*` permission family:

- `security.user_account.read`
- `security.user_account.create`
- `security.user_account.edit`
- `security.user_account.submit`
- `security.user_account.approve`
- `security.user_account.activate`
- `security.user_account.archive`
- `security.user_account.lock`
- `security.user_account.reset_password`
- `security.user_account.revoke_sessions`
- `security.user_account.company_access`

Role assignment and revocation continue to use the existing exact assignment
permissions and governed assignment workflow. Initial roles included in an
account-creation proposal are applied atomically on approval through the same
delegation, SoD, and effective-assignment invariants. Later role changes use the
normal assignment request path from the user detail view.

User company access is a maximum boundary. Effective access is:

`active user company access ∩ active role scope ∩ request resource company`

No user-company grant expands a role, and no tenant/company header or browser
value is trusted as authority.

An actor may grant only roles and companies within their delegated
administrative scope. Self-grant, higher-authority assignment, cross-tenant
references, conflicting roles, and field/scope escalation fail closed.

## 7. Lifecycle Workflows

### 7.1 Create and activate

1. Maker enters display name, username, email, optional employee, allowed
   companies, default company, and initial roles.
2. Backend validates uniqueness, tenant/company references, employee-binding
   availability, role delegation, SoD, and last-administrator invariants.
3. Maker saves and submits the request.
4. Independent checker approves or rejects it.
5. Approval transaction creates the account, company grants, optional employee
   binding, initial role assignments, Argon2 credential, command result, and
   audit evidence together.
6. A generated one-time password is returned once to the checker. It is not
   stored in the idempotency result; replay reports that the secret is no
   longer available. If delivery is lost, an approved reset request must issue
   a replacement.

### 7.2 First login

Successful verification of a reset-required credential does not issue a normal
ERP session. The login response returns `password_change_required` with a
short-lived, opaque, single-use Redis ticket. The login page displays a new
password form and submits only the opaque ticket and new password.

`POST /api/v1/auth/change-initial-password` atomically consumes the ticket,
revalidates account and credential state, applies the current password policy,
updates the Argon2 verifier/version, clears reset-required state, records safe
authentication evidence, and then issues the normal tenant-bound session.
Expired, replayed, mismatched, revoked, locked, inactive, or concurrently used
tickets fail closed.

Permanent passwords contain 12–128 characters and must differ from the issued
one-time password. Passwords are never logged or audited.

### 7.3 Edit, company, employee, and role changes

Identity, company, employee, status, password reset, and initial-role changes
follow draft → submit → approve/reject. Later role changes reuse the existing
assignment request workflow and appear in both the Users detail and Assignments
tab.

Approvals re-read the current row version and all referenced entities inside
the transaction. Stale proposals receive a conflict and do not partially
apply.

### 7.4 Emergency actions

An actor with the exact permission may immediately:

- lock an active account; or
- revoke all of its Redis sessions.

Both operations require CSRF, origin validation, idempotency, tenant scope,
current account state, a reason, and atomic audit evidence. Locking also revokes
sessions. Unlocking requires maker-checker approval. Revocation advances the
account's PostgreSQL `session_version`; every protected request compares that
authoritative version with the version captured by its Redis session. A stale
session therefore fails closed even if asynchronous Redis cleanup is delayed.

### 7.5 Archive

Archive sets the account inactive, ends current company access and employee
binding as approved, revokes effective sessions, and prevents new login. It
retains credentials, historical grants, assignments, requests, business
references, and audit evidence. Existing foreign keys remain `ON DELETE
RESTRICT`; no normal API exposes user deletion.

## 8. Last-Administrator and Concurrency Protection

Every operation that can reduce administrative coverage acquires a
tenant-scoped PostgreSQL advisory transaction lock and locks affected account
and assignment rows. The transaction computes active, non-expired,
non-conflicting users that retain the required tenant administration
capabilities after the proposed state.

Lock, archive, deactivate, company removal, role revocation, and concurrent
combinations are rejected if they would leave the tenant without a valid
administrator. The protection is backend and database-transactional; frontend
warnings are informational only.

## 9. API and Contract Surface

Add tenant-scoped production contracts and routes under `/api/v1/security`:

- list users with bounded search, status/company/role/employee filters, cursor,
  and limit;
- load one user detail with safe account, company, employee, role, session, and
  pending-request projections;
- create a user-change request;
- update or submit a draft user-change request;
- approve or reject `resource_type='user'` through the existing approvals
  endpoint;
- execute idempotent emergency user actions (`lock` or `revoke_sessions`);
- list eligible companies, employees, and roles using existing read authority.

Mutation routes retain server-side session validation, trusted-origin checks,
CSRF, exact permissions, idempotency keys, row versions, safe problem details,
and no-store responses. Session validation includes the PostgreSQL-backed
session-version check. OpenAPI and the generated web client change together.

## 10. User Interface

Add **Users** to `/admin/identity` and support deep links such as:

`/admin/identity?tab=users&user=<opaque-user-id>`

The list provides:

- search by display name, username, email, or employee;
- status, company, role, and employee-link filters;
- counts for active, locked, inactive, and pending approval;
- identity, default company, role summary, employee link, status, and recent
  activity columns;
- permission-aware add, edit, activate, deactivate, lock, reset, revoke, role,
  and audit actions.

Create/edit uses five focused steps:

1. Identity
2. Employee link
3. Allowed and default companies
4. Initial roles
5. Review and submit

The one-time password appears only in a transient post-approval panel with an
explicit copy-once warning. It is held only in component memory and disappears
on close, refresh, navigation, or logout.

The UI includes accessible labels, keyboard operation, focus management,
loading, empty, unauthorized, validation, stale-version, rejected-request,
dependency-failure, and retry states. Hiding or disabling controls improves
usability but never replaces backend enforcement.

## 11. Audit Evidence

Every user administration outcome records:

- tenant, actor, target user, operation, correlation ID, request/command ID,
  approval reference, timestamp, previous-state hash, new-state hash, outcome,
  and relevant authorization context;
- separate role/company/employee-binding evidence where those projections
  change.

Audit events never contain a plaintext password, credential verifier, session
token, CSRF token, one-time ticket, idempotency key, full request body, or
private HR field. Existing append-only triggers and hash chaining remain in
force.

## 12. Compatibility Backfill and Activation

Schema creation is additive. Existing account, credential, assignment,
employee, session, authorization, and audit rows are preserved.

Backfill computes proposed company coverage from current effective authority:

- tenant-scoped active roles map to all active tenant companies;
- company-scoped roles map only to their referenced active companies;
- own-scoped roles map to the currently effective employee assignment company
  when an unambiguous active employee binding exists;
- multiple active roles produce the union, never a broader inferred scope.

If one company is available, it becomes the default. If an unambiguous current
employee company is in the allowed union, it becomes the default. Otherwise
the account is flagged for administrator review and company-access enforcement
does not activate for that account.

The backfill is deterministic, idempotent, tenant-safe, transactional, and
traceable. It reports unmapped, invalid, and ambiguous records without guessing.
Existing authorization remains authoritative while shadow reads compare old
and new company decisions. Any security-sensitive mismatch fails closed for
the new path and blocks activation; it does not silently change legacy access.

## 13. Error Handling

Public/API errors expose stable safe codes for unauthorized, forbidden,
validation failure, duplicate identity, stale version, SoD conflict,
delegation exceeded, last administrator, invalid company, employee already
bound, invalid lifecycle transition, unavailable dependency, and idempotency
conflict. They do not expose credential, candidate, cross-tenant, or internal
database details.

All multi-record changes use one transaction. Account, companies, employee
binding, initial roles, credential, administration command, and audit evidence
either commit together or roll back together. Session invalidation is committed
through the PostgreSQL session-version change in that transaction. Redis key
cleanup is idempotent follow-up work and cannot restore a version-stale session.

## 14. Verification Plan

### Database and integration

- migration ordering, clean database, preservation, RLS, constraints, foreign
  keys, indexes, query plans, rollback, and repeated migration/backfill;
- account create/edit/activate/lock/unlock/archive and invalid transitions;
- company default uniqueness, cross-tenant/company denial, and historical
  revocation;
- employee-binding overlap/tenant constraints;
- initial and later role assignment delegation/SoD enforcement;
- stale version, retry, duplicate idempotency key, transaction rollback, and
  concurrent administration;
- last-administrator protection under concurrent lock/archive/role/company
  removal;
- credential reset, prior-password denial, mandatory first change, ticket
  replay/expiry/context denial, and session revocation;
- session-version mismatch denial when Redis cleanup is unavailable or delayed;
- audit completeness, hash chain, update/delete denial, and secret exclusion;
- old-versus-new company-scope shadow parity.

### API and frontend

- contracts, OpenAPI, generated-client drift, authentication, CSRF, origin,
  exact permission and direct-API denial;
- Users list, filters, pagination, detail, wizard, approval, emergency actions,
  transient password panel, deep links, refresh, and logout;
- loading, empty, unauthorized, conflict, dependency, and retry states;
- accessibility, responsive layout, keyboard workflow, lint, types, build, and
  existing Identity & Access regression.

### Manual acceptance

Use synthetic maker, checker, target, restricted, and two administrator
identities. Verify create, reject, approve, first password change, login,
identity edit, multiple companies/default, employee link, role grant/revoke,
lock, session denial, unlock, password reset, deactivate/archive, unauthorized
direct calls, tenant/company isolation, SoD, last-administrator protection,
idempotent retry, audit evidence, refresh persistence, and logout.

## 15. Rollback and Safety

- A failed migration or backfill rolls back without changing existing security
  authority.
- Additive tables and columns may remain if application deployment rolls back;
  do not drop them as an emergency response.
- Do not activate company-access enforcement until coverage, parity, security,
  performance, regression, and manual acceptance gates pass.
- Do not delete, reset, clean, or overwrite existing repository or database
  data to recover from a failed deployment.
- Do not start unrelated HR/Payroll, R08/R09, W2-05, navigation, dependency, or
  prototype work as part of this feature.

## 16. Acceptance Criteria

- Users is functional inside `/admin/identity` with no competing route.
- Dynamic roles with exact permissions govern every user action.
- New accounts support multiple companies, one default, optional employee
  binding, and initial roles.
- Maker-checker, SoD, delegation limits, last-administrator protection,
  idempotency, concurrency, and audit evidence pass against PostgreSQL.
- Generated one-time passwords are never persisted or exposed after their
  single response and must be changed before normal session issuance.
- Admins can reset passwords, manage roles, activate, edit, lock, deactivate,
  archive, and revoke sessions only within their exact permitted scope.
- Existing accounts and authorization behavior remain unchanged until the
  explicit company-access activation gate passes.
- Automated verification and controlled manual acceptance pass with no known
  user-management security blocker.
