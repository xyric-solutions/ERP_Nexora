# Identity & Access Production Completion Design

- Status: approved design
- Date: 2026-10-16
- Canonical workspace: `http://127.0.0.1:3000/#/identity/access`
- Backend boundary: `server/api` under `/api/v1/security`
- Persistent authority: PostgreSQL
- Session infrastructure: Redis with PostgreSQL-authoritative account and policy state

## 1. Outcome

Convert every existing Identity & Access surface into one connected, production
workspace with no fixture fallback or simulated mutation. Reuse the established
governed user, role, permission, assignment, approval and audit implementation,
then add the missing Access Review, Delegation & Impersonation, and Security &
Session Policy capabilities as separately governed vertical slices.

The completed workspace must prove real browser-to-API-to-PostgreSQL behavior,
tenant isolation, exact server permissions, maker-checker separation,
idempotency, concurrency controls, immutable audit evidence and refresh
persistence. A rendered page or successful HTTP response is not sufficient.

## 2. Scope

The following existing Identity & Access menu capabilities are included:

1. User Directory
2. Add User
3. User Detail & Access
4. Role & Permission Designer
5. Company-role Assignments
6. Access Review
7. Delegation & Impersonation
8. Security & Session Policies

Tenant/company administration, entitlements, module visibility, workflow design
and unrelated Administration pages are excluded. HR resumes from its documented
Employee History handoff after this Identity & Access milestone.

## 3. Current Baseline

The repository already contains PostgreSQL-backed security administration for:

- tenant-scoped users, user detail, companies, employee links and lifecycle;
- user creation/change requests and independent approval;
- emergency locking and session revocation;
- role policies, exact permissions, scopes, field rules, source-state rules,
  separation-of-duties constraints and delegation limits;
- effective-dated user-role assignments and assignment approval;
- immutable security audit events;
- cookie sessions, CSRF/origin checks, idempotency and last-administrator
  protection.

Those features are available through the production `/api/v1/security` routes
and an embedded Identity workspace. The shell's Administration catalogue still
contains generic prototype entries, and the current Identity hash integration
supports only an exact `#/identity/access` match. Access Review, operational
delegation/impersonation and database-governed session policies do not yet have
complete production workflows.

## 4. Architecture

The existing boundaries remain authoritative:

```text
Identity workspace
  -> generated API client
  -> /api/v1/security
  -> session authentication and exact authorization
  -> feature service/repository
  -> PostgreSQL transaction and immutable audit
  -> Redis session/cache effect where applicable
```

Browser code must not access PostgreSQL or Redis directly. PostgreSQL records
approved state; Redis holds only active sessions, short-lived impersonation
context, throttling state, bounded policy cache and revocation data. A Redis
failure must not expand authority or revive PostgreSQL-invalid state.

Contracts, OpenAPI, generated clients, API routes and repositories change
together. New migrations are additive and retain existing security history.

## 5. Connected Workspace and Navigation

`/#/identity/access` remains the single parent workspace. It contains persistent
internal navigation for:

- Users
- Roles & Permissions
- Company-role Assignments
- Access Reviews
- Delegation & Impersonation
- Security & Session Policies

Add User and User Detail & Access are contextual modes inside Users. Role detail,
assignment context, approval queues and audit history remain connected views,
not independent applications. Existing Administration menu entries may deep-link
to the appropriate workspace state, but all render the same implementation.

The hash router must recognize the complete Identity route family. The base URL
opens Users; deeper hash state supports refreshable and shareable section,
record and action context. `/admin/identity` remains a compatibility entry and
redirects into the canonical hash workspace. There is no duplicate frontend or
API path.

Every surface includes loading, empty, error, unauthorized, stale-version and
dependency-failure states; bounded filters/pagination; accessible labels and
keyboard behavior; responsive layouts; required reasons and confirmations for
sensitive actions; and explicit pending-versus-active status. No API failure may
be converted into mock data or a success notification.

## 6. Existing User, Role and Assignment Completion

The first implementation slice exposes existing production components inside
the canonical workspace:

| Surface                    | Production authority                                                     |
| -------------------------- | ------------------------------------------------------------------------ |
| User Directory             | governed user list, filters and opaque pagination                        |
| Add User                   | user change request, submit and independent approval                     |
| User Detail & Access       | account, companies, employee link, roles, requests and emergency actions |
| Role & Permission Designer | governed role policies and exact permission catalogue                    |
| Company-role Assignments   | effective-dated assignment request and approval workflow                 |

Shared components are extracted only where needed to remove routing coupling.
Existing mutation contracts, maker-checker rules, last-administrator protection,
soft deletion, credential delivery and audit behavior remain unchanged unless a
verified defect requires a focused correction.

## 7. Access Review

### 7.1 Data model

Add tenant-RLS-protected records for:

- `security_access_review_campaign`: scope, owner, review window, lifecycle,
  approval and audit references;
- `security_access_review_item`: immutable snapshot of account, active roles,
  company access, employee link and elevated permissions;
- `security_access_review_decision`: reviewer, retain/revoke/remediate decision,
  reason, version and timestamps.

Campaign snapshots are deterministic and immutable. Review decisions append
evidence rather than rewriting the snapshot.

### 7.2 Workflow

Authorized makers create tenant-wide campaigns optionally narrowed to selected
companies. An independent approver activates the campaign. Assigned reviewers
decide every item. Revoke/remediate decisions create existing governed
assignment or user-change requests; they never delete access directly. A
campaign closes only when every item has a decision or documented exception and
all required remediation references are present.

## 8. Delegation

Delegation grants are tenant-scoped, company-scoped where applicable,
effective-dated and append-retained. A grant must be a strict subset of the
delegator's current permissions and administrative scope at creation,
approval and every use.

Cross-tenant delegation, self-delegation, privilege expansion, expired source
authority, prohibited permissions and conflicting SoD combinations fail closed.
Normal activation requires independent approval. Revocation and expiry preserve
history and invalidate affected sessions when cached authority may have changed.

Delegation does not copy roles or create direct permanent permissions. Runtime
authorization derives the bounded delegated capability while revalidating both
parties and the source authority.

## 9. Impersonation

An impersonation request records actor, target, purpose, duration, scope,
lifecycle, approval and audit references. Normal requests require an independent
approver. Activation produces a short-lived server-side impersonation context;
the browser receives no reusable authority token.

Every request and action records the real actor and effective target. The UI
shows an unavoidable banner with target identity, real actor, expiry and an End
Session control. Logout, explicit termination, expiry, actor/target lock or
archive, session-version change, or source-authority loss terminates the context.

Impersonated sessions cannot modify Identity & Access, credentials, security
policies, approval decisions, delegation/impersonation, or other configured
high-risk controls. This restriction is enforced by the server, not only hidden
in the UI.

### 9.1 Emergency approval exception

Approval-free activation requires both:

1. `security.impersonation.emergency_activate`; and
2. designation as the tenant's single emergency impersonation principal.

The designation is stored in PostgreSQL and cannot be inferred from username,
email or role name. There may be at most one current principal per tenant.
Reason, bounded duration, target restrictions and full audit remain mandatory.

If migration finds exactly one active user satisfying the existing protected
tenant-administrator invariant, it may establish a traceable bootstrap
designation. Ambiguous or empty tenants receive no exception until a governed
designation is approved. Designation changes are versioned, audited and cannot
produce overlapping principals.

## 10. Security & Session Policies

Policies are tenant-scoped and versioned with lifecycle:

`draft -> submitted -> approved/rejected -> active -> superseded`

Only one policy may be active for a tenant/effective instant. Supported controls
include:

- password length and composition constraints;
- session idle and absolute timeouts;
- concurrent-session limit;
- login throttling and lockout thresholds;
- delegation maximum duration;
- impersonation maximum duration.

Existing environment configuration remains the safe baseline. An active policy
may configure supported values within platform hard limits but cannot weaken
non-configurable security invariants. Authentication and session services load
the active policy through a bounded cache. Activation invalidates that cache and
revokes or re-evaluates sessions when the changed control requires it.

Policy authoring, submission, approval and activation use separate exact
permissions and independent approval. Activated versions are immutable.

## 11. Authorization

Add explicit permission families:

- `security.access_review.*`
- `security.delegation.*`
- `security.impersonation.*`
- `security.session_policy.*`

Each family separates read, create/manage, submit, approve, activate/execute and
revoke/close actions where applicable. Existing dynamic role policy and
delegation-limit enforcement remains authoritative. No static `Admin` or
`Superadmin` name receives special treatment.

All mutations require authenticated session context, exact permission,
tenant/company scope, CSRF, trusted origin, idempotency, validation, optimistic
concurrency and immutable audit. Multi-record effects use one PostgreSQL
transaction. Safe public errors do not expose cross-tenant existence, secrets,
session material or database details.

## 12. Audit and Sensitive Data

Audit evidence records tenant, real actor, effective actor, target, action,
reason, request/approval reference, correlation ID, timestamps, outcome and
before/after hashes. Access-review snapshots and decision/remediation references
remain inspectable after access changes.

Audit, logs and telemetry must never contain passwords, credential verifiers,
session or CSRF tokens, impersonation secrets, idempotency keys, private HR
fields or unredacted request bodies. Audit rows remain append-only and
hash-chained under the existing security model.

## 13. Failure and Consistency Behavior

- Failed approval or activation creates no partial authority.
- Replayed idempotency keys return the existing safe result or a conflict.
- Stale row versions fail without overwriting a newer decision.
- Redis failure cannot approve, extend or restore a delegation/impersonation.
- Policy cache failure falls back to a verified PostgreSQL read or safer hard
  limits, never weaker defaults.
- Remediation failure leaves the review item visibly pending remediation.
- Emergency impersonation failure records a safe rejected audit outcome without
  opening a session.

## 14. Delivery Slices

1. Repair hash navigation and integrate existing user/role/assignment workflows
   under `/#/identity/access`.
2. Complete and verify the five existing user/role surfaces; retire their generic
   prototype rendering only after parity and persistence checks.
3. Implement Access Review contracts, migration, repository, API, client, UI and
   tests.
4. Implement Delegation contracts, migration, repository, API, enforcement,
   client, UI and tests.
5. Implement Impersonation approval, emergency exception, session context,
   restrictions, banner, termination and tests.
6. Implement Security & Session Policy authoring, approval, activation, runtime
   enforcement and tests.
7. Run complete security regression, migration verification, production build
   and controlled browser acceptance.
8. Update the Identity & Access delivery document with completed work, working
   URLs, remaining risk and the exact HR resume point.

Each slice follows contract -> additive migration -> repository/service ->
versioned API -> API tests -> generated client -> screen -> browser acceptance.

## 15. Verification and Acceptance

Automated verification covers:

- clean and upgrade migration paths, RLS, foreign keys, constraints and indexes;
- authentication, CSRF, origin, exact permissions and tenant/company isolation;
- maker-checker and emergency-exception boundaries;
- delegation subset, SoD, expiry and source-authority loss;
- impersonation restrictions, actor/effective identity, termination and
  concurrent revocation;
- policy lifecycle, hard bounds, cache invalidation and live enforcement;
- access-review snapshot integrity, decisions, remediation and closure;
- idempotency, optimistic concurrency, rollback and audit hash-chain integrity;
- contracts, OpenAPI/client drift, unit/integration/security regressions,
  typecheck, focused lint/format and production build.

Controlled browser acceptance uses synthetic maker, checker, emergency principal,
target and restricted accounts. It verifies every workspace section, direct-API
denial, refresh persistence, multi-session revocation, visible impersonation
state, expired authority, remediation, policy enforcement and logout.

No surface is complete until its real UI -> API -> PostgreSQL flow and relevant
authorization/audit effects are observed. No mock data, mock success or browser-
only persistence remains in these eight capabilities.

## 16. Rollback and Operational Safety

Migrations are additive and preserve existing users, roles, assignments,
sessions, audit and business references. Failed migrations roll back. Application
rollback must leave new tables dormant rather than drop evidence. Runtime policy
enforcement activates only after schema, regression and compatibility gates pass.

Do not reset shared data, rewrite historical migrations, hard-delete security
records, expose credentials, weaken current authorization, or return to HR work
until this milestone has an explicit handoff.
