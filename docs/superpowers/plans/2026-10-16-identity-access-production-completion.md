# Identity & Access Production Completion Implementation Plan

- Status: approved for implementation
- Date: 2026-10-16
- Design: `../specs/2026-10-16-identity-access-production-completion-design.md`
- Canonical workspace: `http://127.0.0.1:3000/#/identity/access`
- Backend: `/api/v1/security` in `server/api`
- Database: PostgreSQL; Redis is transient session/cache infrastructure

## 1. Objective

Complete the eight existing Identity & Access capabilities inside one connected
workspace. Preserve and expose the existing production user, role, permission,
assignment, approval and audit workflows, then implement Access Review,
Delegation & Impersonation, and Security & Session Policies as independent,
governed vertical slices.

No page is complete until its browser-to-API-to-PostgreSQL path, authorization,
audit behavior, persistence and failure states are verified. No mock fallback or
mock success is permitted.

## 2. Invariants

1. Preserve all existing accounts, credentials, roles, assignments, sessions,
   company access, employee links, requests and audit evidence.
2. Use only additive security migrations; never rewrite migration history or
   hard-delete security records.
3. Keep browser -> generated client -> `server/api` -> repository -> PostgreSQL.
4. Every mutation requires authentication, exact permission, tenant/company
   scope, trusted origin, CSRF, idempotency and current row state.
5. Keep maker/checker, SoD, delegation ceilings and last-administrator checks.
6. PostgreSQL remains authoritative if Redis is stale or unavailable.
7. Emergency impersonation still requires a reason, bounded duration, single
   designated principal and immutable audit evidence.
8. Impersonated sessions cannot modify security, credentials, approvals or
   configured high-risk operations.
9. Preserve approved shell layout and reuse current Tailwind/shadcn primitives.
10. Do not modify or stage unrelated working-tree files.

## 3. Slice IA-01 — Canonical workspace and existing production surfaces

### Objective

Make `/#/identity/access` a refreshable route family and expose the five existing
PostgreSQL-backed user/role surfaces through one connected workspace.

### Files

- Modify: `app/shell/prototype-shell.tsx`
- Modify: `app/page.tsx`
- Modify: `app/admin/identity/page.tsx`
- Modify: `app/features/security/identity-navigation.ts`
- Modify: `app/features/security/identity-workspace.tsx`
- Modify as required: existing security user/role components
- Modify: `tests/unit/identity-navigation.test.ts`
- Modify: `tests/unit/identity-workspace-components.test.ts`
- Modify: `tests/unit/user-management-components.test.ts`
- Create: `docs/architecture/identity-access-delivery-plan.md`

### Work

1. Replace exact hash matching with a parser for the Identity route family.
2. Define stable hash deep links for users, add user, user detail, roles,
   assignments, approvals, permissions and audit context.
3. Remove `useSearchParams`/pathname coupling from the embedded workspace; make
   navigation use the canonical hash without leaving the ERP shell.
4. Keep `/admin/identity` as a compatibility redirect to the canonical hash.
5. Provide persistent internal navigation for Users, Roles & Permissions,
   Company-role Assignments, Access Reviews, Delegation & Impersonation, and
   Security & Session Policies. Missing later slices must display an honest
   unavailable/not-yet-enabled state, never mock data.
6. Expose User Directory, Add User and User Detail as contextual Users modes.
7. Expose live role policies, permission catalogue and company-role assignments.
8. Preserve approval, audit, one-time credential and permission-aware actions.
9. Add loading, empty, error and denied states without fixture fallback.
10. Record the current production/missing status and safe resume point.

### Verification

```powershell
npm.cmd run test:unit -- tests/unit/identity-navigation.test.ts tests/unit/identity-workspace-components.test.ts tests/unit/user-management-components.test.ts
npm.cmd run typecheck
npm.cmd exec eslint -- app/shell/prototype-shell.tsx app/features/security app/admin/identity/page.tsx app/page.tsx
npm.cmd run build:web
```

Manual acceptance: login, open the canonical base URL, navigate every completed
section, refresh each deep link, verify real data and confirm failed API calls do
not produce fixtures or success.

## 4. Slice IA-02 — Existing security workflow hardening and parity

### Objective

Close verified gaps in the five existing production surfaces before introducing
new authority models.

### Work

1. Execute current contract, router, PostgreSQL and security suites.
2. Verify user create/edit/submit/approve/reject, activation/archive, lock,
   password reset, session revocation, company access and employee link.
3. Verify role create/edit/submit/approve/activate/archive and exact permission
   selection.
4. Verify assignment create/revoke, approval, expiry and company/tenant scope.
5. Verify search, filters, bounded pagination, stale versions, idempotent replay,
   direct-API denial and audit evidence.
6. Fix only demonstrated defects; preserve existing public contracts where safe.
7. Remove remaining generic prototype bindings only after parity passes.

### Verification

Run focused unit/contract suites plus:

```powershell
npm.cmd run test:integration -- tests/integration/c4-security-administration.test.ts tests/integration/governed-user-administration.test.ts tests/integration/security-user-router.test.ts
npm.cmd run test:security -- tests/security/foundation-security.test.ts
npm.cmd run api:check
npm.cmd run build:web
```

## 5. Slice IA-03 — Access Review

### Database

Create the next additive security migration with:

- `security_access_review_campaign`;
- immutable `security_access_review_item` snapshots;
- append-retained `security_access_review_decision` evidence;
- tenant RLS, company scope, composite foreign keys, lifecycle checks, unique
  decision constraints and reviewer/campaign indexes;
- exact `security.access_review.*` permission definitions.

### Contracts and API

Add strict contracts and versioned routes for:

- campaign list/detail;
- deterministic preview and creation;
- submit/approve/reject/activate;
- item list/detail;
- retain/revoke/remediate decision;
- remediation status and campaign closure.

Snapshots are created transactionally when a campaign becomes active.
Revoke/remediate decisions create existing governed change requests and retain
their references. No review endpoint directly deletes authority.

### UI

Implement the connected Access Reviews section with campaign register, scope,
progress, reviewer queue, entitlement snapshot, decision dialog, remediation
status and immutable history.

### Tests

Cover migration integrity, tenant/company isolation, snapshot determinism,
maker/checker, reviewer assignment, decision immutability, remediation rollback,
closure gates, idempotency, concurrency, audit and browser persistence.

## 6. Slice IA-04 — Governed Delegation

### Database and domain

Add effective-dated delegation requests/grants with forced tenant RLS,
company/scope constraints, append-only history, maker/checker evidence and exact
`security.delegation.*` permissions.

The requested authority must be a strict subset of the delegator's current
effective authority at creation, approval and use. Reject self-delegation,
cross-tenant references, prohibited permission families, SoD conflicts,
expired/locked/inactive parties and source-authority loss.

### API and UI

Add list/detail/create/submit/decision/revoke endpoints and the connected
Delegation section with active, upcoming, pending and historical views.

### Runtime

Extend authorization evaluation through a focused delegated-authority boundary.
Do not copy roles or create permanent direct grants. Session authority must fail
closed when the grant or source authority becomes invalid.

### Tests

Verify subset calculations, company scope, effective dates, independent
approval, revocation, session invalidation, SoD, concurrency, direct-API denial,
audit evidence and existing authorization parity.

## 7. Slice IA-05 — Governed Impersonation

### Database and permissions

Add impersonation requests/sessions/evidence and a single current emergency
principal designation per tenant. Add exact `security.impersonation.*`
permissions including `security.impersonation.emergency_activate`.

Bootstrap an emergency principal only when the migration can prove exactly one
active account satisfies the protected tenant-administrator invariant. Otherwise
leave the exception inactive until a governed designation is approved.

### Session architecture

1. Create server-side, short-lived impersonation context bound to the real
   session, tenant, target, scope, reason and expiry.
2. Resolve both real and effective identities on every request.
3. Revalidate actor, target, source permission, session versions and expiry.
4. Block security administration, credentials, approvals, delegation,
   impersonation and configured high-risk permissions during impersonation.
5. Terminate on logout, explicit end, expiry, lock/archive, session-version or
   authority change.

### UI

Add request, approval, active/history and emergency activation views. Display an
unavoidable global banner with real actor, target, expiry and End Session.

### Tests

Cover normal approval, maker/checker denial, emergency two-factor authority
(permission plus designation), single-principal constraint, restriction matrix,
real/effective audit identities, termination, concurrent revocation, Redis
failure and cross-tenant denial.

## 8. Slice IA-06 — Security & Session Policies

### Database

Add versioned tenant policy drafts and immutable activated versions. Enforce one
active effective policy, safe numerical bounds, lifecycle evidence, tenant RLS
and exact `security.session_policy.*` permissions.

### Runtime

Integrate approved policies into password validation, login throttling, lockout,
idle/absolute timeout, concurrent sessions, delegation duration and
impersonation duration. Environment settings remain safe fallback/hard limits.
Use a bounded cache with PostgreSQL-authoritative revalidation and activation
invalidation.

### UI

Build current policy summary, draft editor, comparison, submit/approval/
activation, version history and enforcement-impact warnings.

### Tests

Verify lifecycle, maker/checker, bounds, effective dates, one-active constraint,
cache invalidation, fail-safe behavior, session revocation/re-evaluation,
password/throttle/session enforcement, tenant isolation and audit.

## 9. Slice IA-07 — Complete acceptance and mock retirement

1. Run clean/upgrade migration verification through the final security version.
2. Run API generation/drift, typecheck, focused lint/format and production build.
3. Run unit, contract, integration, security, performance and legacy regressions.
4. Use synthetic maker, checker, emergency principal, target and restricted
   users for controlled browser acceptance.
5. Verify every internal route from `/#/identity/access`, refresh persistence,
   direct-API denial and all loading/error/permission states.
6. Search the completed Identity feature for fixture imports, simulated delays,
   local persistence and mock success; remove only after live parity.
7. Record commands, test counts, migration version, browser evidence, known
   limitations and operational rollback notes.
8. Update `docs/architecture/identity-access-delivery-plan.md` with exact status,
   working URLs and the HR resume point.

## 10. Required Automated Gate

Use repository scripts where present:

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run build:web
npm.cmd run test:unit
npm.cmd run test:contract
npm.cmd run test:integration
npm.cmd run test:security
git diff --check
```

Run focused ESLint/Prettier on changed files. Repository-wide failures must be
reported separately from regressions and may not be hidden.

## 11. Manual Acceptance Matrix

The milestone is complete only after observing:

1. user directory, add, detail and all governed user actions;
2. role design, exact permissions and lifecycle;
3. company-role assignment grant/revoke lifecycle;
4. approval queues and immutable audit history;
5. access-review campaign, decisions, remediation and closure;
6. delegation approval, use, expiry and revocation;
7. normal and emergency impersonation, restrictions and termination;
8. security policy authoring, approval, activation and live enforcement;
9. tenant/company isolation, restricted-user denial and direct-API denial;
10. refresh/restart persistence and no fixture fallback.

## 12. Stop Conditions

Stop and report if any slice can:

- expand authority beyond the actor/delegator;
- bypass maker/checker outside the documented emergency exception;
- create more than one emergency principal;
- authorize an expired/revoked/locked actor or target;
- permit restricted mutation during impersonation;
- weaken platform hard security limits;
- partially apply a multi-record security change;
- expose credentials, session material or private HR data;
- mutate unrelated tenant data or break existing authorization parity.

## 13. Handoff

After each slice, update the delivery document with completed behavior,
verification, remaining gates and the next safe slice. After IA-07, provide all
working Identity URLs and return to the HR plan at its documented 62% Employee
History handoff.
