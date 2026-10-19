# Governed User Management Manual Gate

## Gate status

- Automated implementation verification: passed on 2026-10-12
- Approved Browser backend: unavailable in the current Codex IDE session
- Manual gate: not executed; must not be marked passed without approved browser evidence

Automated evidence: production build; 61 unit, 41 PostgreSQL/Redis integration,
6 contract, 5 security, 3 performance, 163 legacy regression, and 2 static
accessibility checks passed. Format, lint, typecheck, OpenAPI drift, and
production dependency audit also passed. These checks do not replace the
approved-browser scenarios below.

### Action controls verification — 2026-10-13

Added Action columns, current-page selection/bulk operations, approval-controlled
soft-delete presentation, generated role codes, and production-catalogue permission
checkboxes. Verified 86 unit/component tests, 15 focused PostgreSQL administration/API
tests against an isolated disposable database, 6 contract tests, 5 security checks,
and 163 legacy regressions. Production build/typecheck, lint, format and OpenAPI drift
checks passed. PostgreSQL tests include retained archive evidence, current/deleted
filters, restore, complete catalogue retrieval (including entries after the first 100),
constraint-preserving draft edits, and delegation-ceiling denial. Incomplete catalogue
responses from an older API block saving rather than silently omitting permissions.
No source migration, Demo data change, physical production deletion, or authorization
semantic change was required. Browser acceptance remains NOT RUN.

## Controlled UAT preparation

### Two-tab workspace verification — 2026-10-13

Implemented the approved Users Management / Roles Management consolidation in
`apps/web`, not the static reference application. Assignment/approval/audit views
are nested under both sections; the permission catalogue and editor remain under
Roles. Row actions select user/role context; section-wide queues remain available
without a selection. Legacy query links resolve within the same workspace.

Verification completed:

- `npm.cmd run build`: typecheck and production Next.js build passed.
- `npm.cmd run lint`, `npm.cmd run format:check`, `npm.cmd run api:check`: passed.
- `npm.cmd run test:unit`: 102 tests / 16 files passed (including deep-link and DOM component tests).
- Focused Vitest integration run: 16 tests / 3 files passed against freshly created
  `nexora_identity_workspace_verify_20261013` in the disposable test PostgreSQL
  container. Includes shared contextual records, pre-pagination filtering, related
  audit requests, invalid-context empty results, independent API denial, existing
  maker/checker, SoD, last-admin, archive, rollback and idempotency behavior.
- `npm.cmd run test:contract`: 6 passed; `npm.cmd run test:security`: 5 passed.
- `npm.cmd run test:legacy`: 163 passed, including 2 existing static axe checks.
  Legacy build retains its large-chunk warning; this is not a browser acceptance result.
- API `/api/v1/health/ready` on port 4200: database, Redis and object storage healthy.
  Web `/admin/identity?tab=users&section=approvals` on port 3200: HTTP 200.
- Temporary verification database removed only after confirming its exact name and
  zero active connections. Existing databases, Demo/UAT identities and migrations
  were not modified. No permission grants or authorization-semantic changes.
- Two new row-action tests initially used incorrect accessible labels; corrected
  those selectors and reran all 102 unit tests successfully. Final lint/build passed.

Files changed for this consolidation:

```text
apps/api/src/modules/security/router.ts
apps/api/src/modules/security/source-administration-repository.ts
apps/web/src/features/security/identity-navigation.ts
apps/web/src/features/security/identity-workspace.tsx
apps/web/src/features/security/identity-workspace.module.css
apps/web/src/features/security/governed-table.tsx
apps/web/src/features/security/users/user-management-panel.tsx
packages/contracts/src/openapi-c4.ts
openapi-v1.json
tests/unit/identity-navigation.test.ts
tests/unit/identity-workspace-components.test.ts
tests/unit/identity-actions-components.test.ts
tests/unit/user-management-components.test.ts
tests/integration/c4-security-administration.test.ts
tests/integration/security-user-router.test.ts
docs/superpowers/specs/2026-10-13-identity-workspace-design.md
docs/evidence/consolidation/governed-user-management-manual-gate.md
```

Generated client regeneration completed; existing list/mutation method signatures
remain compatible. Git still reports the existing repository contents as untracked.
No reset, cleanup, stash or commit was performed. `git diff --check` exited zero but
cannot review untracked changes, so it is not used as proof of a clean worktree.

Approved-browser acceptance: **NOT RUN**. HTTP and jsdom evidence do not replace
genuine browser evidence. No subsequent ERP phase was started.

Provision only against the isolated UAT tenant `nexora-r06-uat`:

```powershell
$env:NEXORA_ENVIRONMENT = "uat"
$env:NEXORA_UAT_CONFIRM = "nexora-r06-uat"
$env:DATABASE_URL = "<UAT PostgreSQL URL>"
$env:AUTH_LOGIN_DIRECTORY_SECRET = "<managed secret>"
$env:NEXORA_UAT_PASSWORD = "<managed synthetic password, at least 12 characters>"
npm.cmd run uat:provision-user-management
```

The command is transactional and idempotent. It prints counts only and never
prints the configured password, password verifiers, login-directory secret, or
personal data. If an identity already has a different managed password, the
command fails without changing credentials; use the existing UAT password or a
fresh isolated UAT database.

## Synthetic identities

| Identity           | Purpose                                 |
| ------------------ | --------------------------------------- |
| `r06.maker`        | Authorization administrator / maker     |
| `r06.checker`      | Independent checker / approver          |
| `r06.target`       | Governed target account                 |
| `r06.restricted`   | Direct-API and UI denial verification   |
| `r06.last-admin-a` | Last-administrator concurrency scenario |
| `r06.last-admin-b` | Protected final active administrator    |

## Required scenarios

Record timestamped screenshots and request/audit references for every result.

1. Maker login, session refresh persistence, and logout.
2. Users deep link at `/admin/identity?tab=users`.
3. Create and submit user with one default among multiple allowed companies.
4. Maker self-approval denial.
5. Checker rejection with reason and approved resubmission.
6. One-time password shown once and absent after close, refresh, replay, and logout.
7. First login returns password-change-required, issues no normal session, and accepts a permanent password once.
8. Users list shows separate Name, Username, Email, Status, Employee link, and Roles columns; selecting a name opens full user details. Edit name/username/email and verify stale-row-version rejection.
9. Create **User only** with no employee binding. Create **Employee** by choosing an eligible Employee Master record; verify the choice is required, survives closing/reopening the form draft, and creates a binding only after checker approval. Verify duplicate active employee-link denial.
10. Initial role and later governed role grant/revoke; higher-authority delegation and SoD denial.
11. Immediate lock and session denial, governed unlock, selected-user password-reset form with reason, one-time password delivery after checker approval, and archive/login denial.
12. Restricted identity UI and direct-API denial.
13. Tenant/company boundary denial.
14. Concurrent last-administrator protection.
15. Idempotent retries and immutable correlated audit evidence.
16. Only Users Management and Roles Management appear in the main workspace navigation. Users includes assigned roles, user/assignment approvals and audit history; Roles includes permissions, assigned users, role/assignment approvals and audit history. Verify section-wide queues without selecting a record, row-specific filters, clearing context, pagination and legacy query deep links. No separate top-level routes are introduced.
17. Every Identity & Access list has an Action column. Read-only identities cannot select mutation actions; Audit/Permissions expose details only, never deletion.
18. Roles generate a read-only code automatically. Select multiple exact permissions using module-group and individual checkboxes; search limits group selection to matching entries. Catalogue failures block saving. Draft edits preserve scope, field/SoD restrictions, source states and delegations.
19. Select multiple eligible Users/Roles/Assignments, confirm soft delete (reason required for users and assignment revocation), submit for independent approval, and verify audit evidence. No physical deletion occurs. User deactivation and Delete intentionally share the existing archive lifecycle. Deleted users are available via the historical filter; archived roles/revoked assignments via Show deleted / historical records.
20. Verify partial bulk failure reporting and retry idempotency. Completed rows are not resubmitted. User credential-delivering approval remains single-record; bulk identity editing is not offered.

## Evidence record

| Scenario                           | Result  | Audit/request reference | Evidence path |
| ---------------------------------- | ------- | ----------------------- | ------------- |
| Pending approved-browser execution | NOT RUN | -                       | -             |
