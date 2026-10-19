# Approved two-tab Identity & Access workspace

Keep `/admin/identity` as the only workspace. Main navigation contains Users
Management and Roles Management. Users contains accounts, assigned roles, user and
assignment approval queues, and audit history. Roles contains policies, the exact
permission catalogue/checkbox editor, assigned users, role and assignment approval
queues, and audit history. Queues/history work without selecting a record first.

Row actions open contextual assignments, approvals or history. Context is an
optional server-side filter applied before pagination, never an authorization
grant. Both workspaces use the same assignment/request/audit records. Existing
top-level query links map to nested sections. No new routes or persistence model.

Implementation sequence: add compatible PostgreSQL list filters and documented API
parameters; add URL parsing and two-level navigation; link existing row controls;
add navigation/component and PostgreSQL coverage; run existing automated checks.
Keep existing mutation contracts, soft deletion, maker/checker, SoD, least-privilege
delegation, last-administrator protection, immutable audit, and session architecture.
No schema migration, permission grants, data reset, or commit. Genuine browser
acceptance remains separate from automated DOM verification.
