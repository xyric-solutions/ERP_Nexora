# Identity & Access sheet migration — 2026-11-02

The canonical `/#/identity/access` workspace retains its existing API contracts
and authority boundaries. This batch changes presentation and fixes user route
state; it adds no backend endpoint, migration or production access grant.

## Completed surfaces

| Surface | Register and sheet behavior |
| --- | --- |
| Users | Full-width directory; creation wizard, user detail/edit/password/company/employee/role controls and bulk confirmations in right sheets |
| Roles | Create and edit permission policies in sheets; constraints and generated role identifiers preserved |
| Assignments and approvals | Existing versioned confirmation forms and immutable record details in sheets |
| Permission catalogue and audit | Existing read-only tables; administration record details in a sheet |
| Access Reviews | Full-width campaign register; campaign creation and selected campaign decisions in sheets |
| Delegation and Impersonation | Existing independent lifecycle controls preserved; creation/request forms in sheets |
| Security and Session Policies | Governed draft creation in a sheet; values validated through the shared contract before submission |
| Bank Self-approval | Full-width grant register; issue/revoke controls in a sheet; revocation requires an explicit reason and confirmation |

`app/features/security/identity-sheet.tsx` uses the shared shadcn Sheet primitive
and semantic theme tokens. It provides a scrollable form area, responsive width,
accessible title/description, keyboard dismissal and busy dismissal guards.
Owning components retain API calls, CSRF/idempotency, permissions, field rules,
separation of duties, override warnings, optimistic versions and error state.
No stylesheet was added or retired.

Removing the user ID from the panel's React key preserves edit mode when the
selected user enters the URL. Clearing the selected user when the URL returns to
the directory makes browser Back close its sheet. Create User waits for live
options before restoring the saved draft, retaining company/role selections.
Errors remain visible inside sheets, with edited fields intact.

## Verification

- Final browser acceptance passed 88 view checks across 11 Identity surfaces in
  light/dark at 1440/820/390/320px. Creation/request/grant sheets remain inside
  the viewport; tables retain local scrolling and no document overflow or page
  errors occurred. Evidence: `tmp/identity-sheet-evidence/results.json` and
  screenshots. Run browser acceptance separately from session-policy integration
  tests, which intentionally alter session enforcement in the test tenant.
- 48 focused UI/unit cases pass across Identity navigation, user drafts,
  role constraints, bulk/partial failures, override reasons, read permissions
  and policy input validation. Portal-aware queries exercise actual sheets.
- 25 security integration cases pass across seven files: user router, C4
  administration, approval overrides, Access Review, session policy, delegation
  and impersonation. Last-administrator acceptance now isolates additional UAT
  administrators inside a rolled-back transaction. Fixture bootstrap restores
  only `r06-fixture-assignment-last-admin`, appending an immutable active version
  when a previous test revoked it. Provisioned administrators are preserved.
- Targeted browser tests at 1440/390/320px verify user edit mode survives routing,
  simulated HTTP 409 leaves input intact, Back closes the sheet, and closing and
  reopening Create User restores its draft. These tests intercept writes and
  create no accounts or privilege changes. Evidence:
  `tmp/identity-workflow-evidence/results.json` and screenshots.
- Full workspace typecheck, production `build:web`, focused ESLint, theme audit
  write/check and `git diff --check` pass. Theme findings remain zero font and
  12 existing feature colour source exceptions; those source counts are not
  a route coverage percentage.

This validates the changed UI and focused security flows in isolated local UAT;
it does not replace deployment acceptance or change any deferred capability in
the Identity delivery plan. Existing roles and user account data are not seeded
or edited by the UI browser acceptance.
