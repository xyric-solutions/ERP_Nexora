# Identity & Access delivery plan

## Purpose

Complete the existing Identity & Access capabilities inside the single canonical
workspace at `http://127.0.0.1:3000/#/identity/access`. Browser code uses the
generated client and `/api/v1/security`; PostgreSQL is authoritative and Redis
is limited to transient session/cache concerns.

Approved design and implementation plan:

- `../superpowers/specs/2026-10-16-identity-access-production-completion-design.md`
- `../superpowers/plans/2026-10-16-identity-access-production-completion.md`

HR is paused at the 62% Employee History handoff recorded in
`hr-backend-delivery-plan.md`. Resume HR only after this security milestone has
an explicit completion handoff.

## Current status

### Production-backed baseline

- [x] Cookie authentication, server sessions, CSRF/origin enforcement and
      tenant-bound authorization.
- [x] Governed user directory, detail, creation/change requests, approval,
      lifecycle, companies, employee links and emergency actions.
- [x] Governed role policies, exact permission catalogue, scopes, field/source
      rules, SoD and delegation ceilings.
- [x] Effective-dated role assignments, maker/checker approval and immutable
      security audit.
- [x] PostgreSQL RLS, idempotency, optimistic concurrency and
      last-administrator protection for the existing workflows.

### Workspace completion

- [x] IA-01 canonical hash route family and connected navigation.
- [x] IA-02 execute/fix complete parity for the five existing user/role pages.
- [x] IA-03 PostgreSQL-backed Access Review.
- [x] IA-04 governed Delegation.
- [x] IA-05 governed Impersonation and single emergency principal.
- [x] IA-06 versioned Security & Session Policies with runtime enforcement.
- [ ] IA-07 complete security regression and controlled browser acceptance.

## IA-01 verification record — 2026-10-16

- `/#/identity/access` is the canonical parent workspace. Internal navigation
  now remains inside the shell instead of writing `/admin/identity?...`.
- The route family preserves Users, role/permission, assignment, approval,
  audit, selected-user/role, create-user and pagination context across browser
  history and refreshable hash URLs.
- The workspace has persistent navigation for Users, Roles & Permissions,
  Company-role Assignments, Access Reviews, Delegation & Impersonation, and
  Security & Session Policies.
- Access Review, Delegation/Impersonation and Policies show an explicit
  unavailable state until their production slices land. They expose no fixture
  records or simulated actions.
- User Directory, Add User, User Detail, roles, permissions, assignments,
  approvals and audit continue to use the existing production API methods.
- `/admin/identity` remains a compatibility redirect and preserves its query
  context when entering the canonical hash workspace.

Observed verification:

- Identity navigation/workspace unit tests: 16 passed across two files.
- Focused Identity navigation, workspace and user-web regression: 29 passed;
  the older `identity-actions-components` file retains five interaction-timing
  failures that require investigation in IA-02.
- The older `user-management-components` file retains four interaction-timing
  failures. They remain visible and must be resolved or characterized before
  the five existing surfaces are accepted.
- `npm.cmd run typecheck`: passed.
- Focused ESLint for the changed Identity files: passed.
- `app/shell/prototype-shell.tsx` retains two unrelated existing label-control
  lint errors at its legacy controls; IA-01 changed only hash recognition and
  Identity workspace activation in that file.
- `npm.cmd run build:web`: passed on Next.js 16.3.8.
- Live canonical web URL returned HTTP 200. API readiness reported database,
  Redis, object storage and HR foundation healthy.
- Browser acceptance is not recorded: the Windows browser helper exited twice
  during initialization before any input or page inspection.

## Connected workspace URLs

All links remain under the canonical parent:

- Users: `/#/identity/access?tab=users`
- Add User: `/#/identity/access?tab=users&mode=create`
- User Detail: `/#/identity/access?tab=users&user={userId}`
- Roles: `/#/identity/access?tab=roles`
- Permissions: `/#/identity/access?tab=roles&section=permissions`
- Company-role Assignments: `/#/identity/access?tab=roles&section=assignments`
- Approvals: `/#/identity/access?tab=roles&section=approvals`
- Audit: `/#/identity/access?tab=roles&section=audit`
- Access Reviews: `/#/identity/access?tab=roles&section=access-reviews`
- Delegation & Impersonation: `/#/identity/access?tab=roles&section=delegation`
- Security & Session Policies: `/#/identity/access?tab=roles&section=policies`

The combined Delegation & Impersonation and Security & Session Policies URLs
are live and use versioned production APIs without fixture fallback.

## IA-02 verification record â€” 2026-10-16

- Every action button inside the existing Identity forms now declares its
  submit intent explicitly. This restores live submission for the user wizard,
  user identity/company/employee/password/archive forms, assignment creation,
  role draft saving, governed bulk role actions and governed bulk user actions.
- Non-submit controls retain `type="button"`; the shared Base UI button remains
  unchanged so unrelated screens do not acquire accidental form submission.
- Role-permission component tests now interact with the rendered Base UI
  checkbox root and provide the browser `PointerEvent` primitive absent from
  jsdom. This verifies the production component rather than its hidden form
  input.
- Existing API and PostgreSQL contracts were unchanged. No schema migration,
  mock fallback or browser-only business record was introduced.

Observed verification:

- Combined Identity workspace and interaction regression: 43 passed across five
  files (including the 19 focused user/role interaction tests).
- Focused PostgreSQL/API integration tests: 16 passed across three files,
  covering governed user administration, authorization administration and the
  security user router.
- Focused security foundation tests: 5 passed.
- API generated-client drift check, full TypeScript project-reference check,
  focused ESLint and `git diff --check`: passed.
- `npm.cmd run build:web`: passed on Next.js 16.3.8.
- The first database run correctly exposed stale state in the disposable test
  database. Only the tmpfs-backed `compose.test.yaml` stack was recreated;
  migrations then applied through security version 9 and all focused database
  suites passed from a clean state. Development and production data were not
  touched.
- Browser acceptance remains pending because the Windows browser helper was
  unavailable during IA-01. It must be completed in IA-07 before production
  acceptance.

## IA-03 verification record â€” 2026-10-16

- Security migration 10 adds tenant-RLS campaign, company scope, reviewer,
  immutable item snapshot and append-retained decision evidence tables.
- Campaigns support draft, submit, independent approve/reject, activation,
  immutable snapshot capture and gated closure with optimistic versions,
  idempotency and hash-chained security audit events.
- Reviewer decisions support retain, revoke and remediate. Non-retain decisions
  create an existing governed assignment-revocation request; no review endpoint
  directly removes authority.
- Strict contracts, OpenAPI, generated client and `/api/v1/security` routes are
  aligned. The connected Access Reviews workspace uses only these live APIs.
- Campaign creation exposes tenant or company scope, an independent reviewer,
  review dates, progress, reviewer queue, entitlement evidence, decisions and
  remediation references. Loading, empty, error and permission-denied states
  are explicit and no fixture fallback exists.

Observed verification:

- Access Review and existing security PostgreSQL regressions: 20 passed across
  four integration files.
- Identity workspace/navigation regressions: 16 passed across two unit files.
- Migration applied successfully through security version 10 on the dedicated
  test PostgreSQL database.
- API drift check, full TypeScript check, focused ESLint, `git diff --check` and
  the Next.js 16.3.8 production build passed.
- Controlled browser acceptance remains deferred to IA-07.

## IA-04 verification record — 2026-10-16

- Security migration 11 adds effective-dated delegation requests and grants,
  append-only lifecycle evidence, forced tenant RLS, relational constraints,
  lifecycle/index controls and exact `security.delegation.*` permissions.
- Delegation supports draft, submit, independent approve/reject, activation and
  revocation with optimistic versions, idempotency and hash-chained security
  audit. Actors cannot self-delegate or activate/revoke another maker's grant.
- Creation, approval and every use revalidate active parties, tenant/scope,
  source authority and delegation ceiling. Prohibited security authority and
  transaction-SoD permissions fail closed. Delegated security-management,
  approval, activation, credential and session-revocation powers are never
  accepted by runtime authorization.
- Runtime authorization derives tenant-scoped delegation without copying roles
  or permanent grants. Revocation, expiry, source-authority loss, inactive
  parties or ceiling loss removes authority on the next request.
- Strict contracts, OpenAPI, generated client and `/api/v1/security` routes are
  aligned. The connected workspace displays pending, active/upcoming and
  historical records, creation and permitted transitions with no mock fallback.

Observed verification:

- Delegation API/PostgreSQL suite: 5 passed, covering boundary rejection,
  maker/checker lifecycle, API enforcement, live derived authority, immediate
  revocation and immutable history.
- Wider Identity PostgreSQL/API regression: 25 passed across five integration
  files, including users, roles, assignments and Access Review.
- Identity UI regression: 37 passed across five unit files.
- Migration applied successfully through security version 11 on the dedicated
  test PostgreSQL database.
- API drift check, full TypeScript check, focused ESLint, `git diff --check` and
  the Next.js 16.3.8 production build passed.
- Controlled browser acceptance remains deferred to IA-07.

## IA-05 verification record — 2026-10-16

- Security migration 12 adds tenant-RLS impersonation requests, one current
  emergency principal per tenant, immutable lifecycle evidence, relational
  constraints/indexes and exact `security.impersonation.*` permissions.
- Normal requests use draft, submit, independent approve/reject, activate and
  end states with optimistic versions, idempotency and hash-chained security
  audit. Emergency activation skips approval only when the real actor has
  server authority and is the single PostgreSQL-designated principal.
- PostgreSQL remains authoritative for every active context. Redis stores only
  the short-lived attachment to the real browser session. Each request
  revalidates request state, expiry, real and target accounts/session versions,
  source authority and emergency designation; stale or unavailable authority
  removes the transient context rather than expanding access.
- `/api/v1/auth/session` returns the effective target plus visible real-actor
  evidence. A global, unavoidable banner identifies both parties, expiry and an
  End session control. No reusable impersonation token reaches the browser.
- All Identity & Access operations and every HR mutation are rejected during
  impersonation. Read-only HR requests resolve the effective target while
  retaining real actor and request identifiers in server context.
- The connected workspace provides request, pending/approval, active and
  historical views. The designated emergency administrator receives the
  emergency action without role-name or username inference.

Observed verification:

- PostgreSQL + Redis impersonation suite: 3 passed, covering normal
  maker/checker activation, effective session response, security restriction,
  explicit termination, emergency designation, approval-free activation,
  designation loss and PostgreSQL-authoritative stale-context invalidation.
- Focused session, HR restriction and impersonation UI tests: 6 passed. The
  broader IA-05 UI/session batch passed 24 tests across six files.
- Wider authentication, Identity and HR API run observed 47 passing tests and
  one existing HR assignment-timeline assertion failure: the current response
  contains `reporting_manager_id`. IA-05 changed no assignment projection and
  the failure remains for the paused HR workstream rather than being hidden.
- Security foundation: 5 passed. API drift check, full TypeScript check,
  focused ESLint, `git diff --check` and the Next.js 16.3.8 production build
  passed.
- Migration applied successfully through security version 12 on the dedicated
  test PostgreSQL database. Controlled browser acceptance remains IA-07.

## Current safe resume point

Proceed with IA-07 controlled acceptance and mock retirement. Preserve security
migration 13 and the PostgreSQL-authoritative policy lifecycle/runtime adapter.
Verify every canonical Identity URL in a real browser, exercise maker/checker
and the single tenant-administrator exception with synthetic accounts, search
for remaining fixture/local-only behavior, and record the exact HR resume point.

## IA-06 verification record — 2026-10-16

- Security migration 13 adds bounded, tenant-RLS session policy versions,
  exactly one active policy, immutable lifecycle events and exact
  `security.session_policy.*` permissions.
- Draft, submit, independent approve/reject and activate transitions use the
  existing idempotent administration command, optimistic version and
  hash-chained audit infrastructure. Ordinary authors cannot approve or
  activate their own policy. The tenant-wide administrator retains the
  explicitly approved single-principal exception.
- Active PostgreSQL values are loaded through a bounded 30-second cache whose
  entry is invalidated on activation. Environment timeouts remain hard upper
  bounds and safe fallback. Policy-source failure does not relax platform
  session controls.
- Password length/composition, login failure window/blocking, idle and absolute
  session timeouts, concurrent sessions, delegation duration and impersonation
  duration are enforced in the existing runtime services. Activation advances
  all active account session versions so old sessions fail closed and new
  controls apply after authentication.
- The live Policies workspace provides the current policy/history, bounded
  draft editor, lifecycle actions, permission/loading/empty/error states and
  activation warnings. It uses generated `/api/v1/security/session_policies`
  and `/api/v1/security/session_policy_actions` clients only.

Observed verification:

- Focused authentication/session/cache unit tests: 11 passed across four files.
- Contract suites: 8 passed, including hard policy bounds and OpenAPI snapshot.
- PostgreSQL migration and policy lifecycle suites: 10 passed, covering the
  complete security v13 chain, independent approval, one-active enforcement,
  immutable history, runtime projection and the administrator exception.
- Security foundation: 5 passed. API drift, full TypeScript project references,
  focused ESLint, `git diff --check` and the Next.js 16.3.8 production build
  passed.
- The complete unit command has one unrelated missing-module suite
  (`tests/unit/theme-provider.test.ts` imports absent `app/theme-config.js`).
  The complete integration run retains the known HR assignment projection
  assertion plus a repeat-run HR lifecycle fixture collision. Neither path was
  changed by IA-06; both remain visible for the resumed HR workstream.

## IA-07 acceptance record — 2026-10-16

- Source inspection found no fixture, mock-record, simulated-success or
  browser-only business persistence inside the Identity feature. The user
  wizard uses `sessionStorage` only for an unsaved recoverable draft; submitted
  records continue through the generated API into PostgreSQL. Prototype-shell
  fixture imports belong to other explicitly prototype-only ERP pages and were
  not removed during Identity acceptance.
- Identity navigation, workspace, actions, users, delegation, impersonation,
  policies and session-context UI regressions passed 54/54. The focused final
  Identity panel batch passed 49/49, including explicit Policies loading,
  empty/editor and permission-denied states.
- Focused Identity PostgreSQL/API regression passed 29/30. The remaining
  governed-user assertion is repeat-run fixture contamination: an earlier
  retained synthetic isolated user remains in the shared test database. It is
  not a current authorization-code failure and must be made run-isolated when
  the shared HR/security fixture maintenance resumes.
- Web liveness returned HTTP 200. API readiness reported service, PostgreSQL,
  Redis, object storage and HR foundation healthy. An unauthenticated policy
  request returned 401 as required.
- Controlled browser acceptance could not be completed: the Windows browser
  helper failed initialization twice, and both the previously supplied Shoaib
  credential and repository-documented legacy demo credential returned
  `INVALID_CREDENTIALS` from the current Node API. No credential, cookie, CSRF
  token or account data was logged.
- Identity implementation is complete through migration 13. Production/manual
  acceptance remains pending only for a valid current Node-API UAT account and
  a functioning browser helper; do not label the module production-ready until
  that controlled pass is recorded.

## HR resume point

Return to `docs/architecture/hr-backend-delivery-plan.md`. The next planned HR
slice remains the cross-workflow audit-evidence view after the completed
employee history read models. Preserve the Identity/API session contract,
tenant/company authorization and impersonation mutation restrictions while
resuming HR work.
