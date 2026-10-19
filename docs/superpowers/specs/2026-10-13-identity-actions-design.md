# Identity & Access actions and role permission selection

Approved design: action columns across the existing `/admin/identity` workspace,
row selection, supported bulk actions, automatic role codes, grouped exact-permission
checkboxes, and soft deletion only. Preserve existing PostgreSQL authorization,
maker/checker, SoD, company boundaries, last-administrator protection, and audit.

## Implementation

1. Reuse existing role, assignment, approval, and user mutation contracts. Delete
   means the existing approved archive/revocation lifecycle, not physical deletion.
   User deactivation and soft deletion share the existing archive operation; the UI
   must say this clearly. Archived users/roles and revoked assignments remain
   available in historical views. No new delete permission or bypass is introduced.
2. Add optional archived-user filtering and archive timestamp projection without
   changing the default API listing behavior. Use existing database columns only.
3. Generate a stable role code when opening a new form. Load real permission
   definitions from the production API, group by module/resource, support search,
   individual and group selection. Backend delegation validation stays authoritative.
4. Allow only backend-supported role lifecycle operations. Draft editing preserves
   scope, field rules, SoD, source-state restrictions, and delegations; editing an
   active policy in place is not added. Permission catalogue/audit actions are view
   only. Audit must never have delete/edit controls.
5. Bulk operations are sequential, individually transactional, approval-controlled
   requests, not a new all-or-nothing API. Require confirmation/reason where relevant,
   preserve idempotency keys on retry, stop and report partial completion on failure.
   Identity edit is single-record. User approval credential delivery remains single
   record so one-time passwords cannot be lost through a bulk approval.

## Verification and safety

Run component/unit, typecheck/build, lint/format, contracts/security, relevant real
PostgreSQL administration tests, and legacy regressions. Test permission selection,
restricted actions, soft-delete confirmation, retries/partial failures, constraint
preservation, tenant isolation, maker/checker, last-admin and archive evidence.
Do not substitute automated DOM tests for genuine browser acceptance. Preserve the
untracked working tree and make no commit, destructive migration, or unrelated edit.
