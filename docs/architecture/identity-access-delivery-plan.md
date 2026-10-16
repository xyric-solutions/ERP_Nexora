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
- [ ] IA-04 governed Delegation.
- [ ] IA-05 governed Impersonation and single emergency principal.
- [ ] IA-06 versioned Security & Session Policies with runtime enforcement.
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

The last two URLs are navigation-ready but deliberately unavailable until
IA-04 through IA-06 provide their database-backed workflows.

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

## Current safe resume point

Proceed with IA-04, governed Delegation. Preserve security migration 10 and the
Access Review contract/API/client path. Implement effective-dated delegation as
an additive governed workflow with subset validation, independent approval and
runtime invalidation before enabling its workspace controls.
