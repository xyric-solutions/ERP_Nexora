# Shoaib Administrator and User Management Reset

- Status: approved design pending written-spec review
- Date: 2026-10-13
- Environment: local development/UAT database
- Tenant: `nexora-r06-uat`

## Outcome

Remove synthetic user-management records from the active UAT tenant, provision a
single administrator named Shoaib, and make user access derive from dynamic roles
and module permissions. Shoaib may create and approve his own user-account
requests through an explicit, narrowly scoped permission. The user detail
experience will expose Access Rights, Preferences, Location Settings, Warehouse
Management, and Recent Activity.

## Approved Decisions

1. Remove the synthetic accounts and pending user requests created for local UAT,
   including the submitted request for Ali.
2. Provision Shoaib with username `shoaib`, email `shoaib@nexora.ai`, and the
   user-supplied runtime credential.
3. Reduce the application password minimum from 12 to 8 Unicode characters while
   retaining the 128-character maximum, byte limit, null-character rejection,
   identifier rejection, password-reuse protection, hashing, throttling, and
   session controls.
4. Create one active, tenant-scoped Super Administrator role containing every
   active permission definition available at provisioning time and assign it to
   Shoaib.
5. Add `security.user_account.self_approve`. It permits the holder to approve
   their own user-account request only. It does not bypass validation, tenant and
   company boundaries, role delegation, separation-of-duties checks between
   assigned roles, optimistic concurrency, idempotency, last-administrator
   protection, or audit recording.
6. Do not extend self-approval to role-policy or role-assignment requests.
7. Keep permissions role-based. Users do not receive direct permission grants.

## Data Cleanup and Provisioning

Cleanup is limited to synthetic identity-and-access records in tenant
`nexora-r06-uat`. It must not delete companies, employees, HR/payroll records,
inventory, warehouses, transactions, or records belonging to another tenant.

Before deletion, the maintenance routine will identify target records by their
known UAT fixture identifiers, synthetic source references, and generated test
email domains. It will print a count by table and refuse to continue if a target
account has an unexpected business-domain reference. The routine will run in one
transaction and roll back on any validation or referential-integrity failure.

The cleanup removes dependent synthetic login identifiers, credentials, company
access, role assignments and versions, user-change requests, administration
commands, and test-only audit evidence in dependency order. Production APIs keep
their soft-delete behavior; hard cleanup is available only through this explicit
local UAT maintenance routine.

Provisioning creates Shoaib only after cleanup succeeds. It creates the account,
Argon2 credential, email and username login identifiers, company access with one
default company, the Super Administrator role and policy, and one active role
assignment. No plaintext password is stored or logged. The command output reports
record identifiers and counts but not the password.

The provisioning operation is idempotent. Re-running it verifies the existing
Shoaib account and policy instead of creating duplicates. A conflicting username,
email, role code, or unexpected policy causes rollback.

## Authorization and Self-Approval

The Super Administrator policy stores the explicit set of active permission keys;
it does not introduce a wildcard or a user-level grant. Permissions added by a
future module are not silently granted. An administrator must review and update
the role policy through the normal role workflow.

The user-request approval path keeps maker-checker separation by default. It may
permit `requested_by`, `submitted_by`, or `target_user_id` to equal the approving
actor only when all of the following are true:

- the request resource is a user account;
- the actor has `security.user_account.self_approve` in their effective active
  role permissions;
- the request is in the submitted state and its version matches;
- all normal authorization, delegation, scope, lifecycle, and conflict checks
  pass.

The approval audit event records that the maker and checker were the same actor
and that the explicit self-approval permission authorized the exception. A safe
error is returned when an ordinary administrator attempts self-approval.

## User Detail Experience

The existing User Management workspace remains canonical. User detail gains these
sections without creating a second identity system:

- **Access Rights:** effective permissions grouped by module and role, read-only,
  with role and scope provenance.
- **Preferences:** supported user-level interface and notification settings. This
  section does not grant permissions.
- **Location Settings:** allowed/default company and operational location context,
  constrained by approved company access.
- **Warehouse Management:** warehouse access derived from active roles, module
  permissions, company scope, and configured warehouse assignments; it cannot
  broaden authority.
- **Recent Activity:** bounded, newest-first security activity for the selected
  user, including creation, approvals, self-approval, role changes, login/security
  actions, preferences, location, and warehouse changes when those events exist.

Empty, loading, unauthorized, and error states are required. Backend checks remain
authoritative even when a UI control is hidden or disabled.

## Password Policy

The eight-character minimum applies consistently to permanent and initial-password
change validation, public contracts, generated OpenAPI/client artifacts, login UI
help text and control state, tests, and documentation. The supplied runtime
credential is accepted by length, but all other existing policy checks remain
active.

The supplied password is consumed only by the controlled provisioning process,
hashed with the existing password implementation, and never written to source,
fixtures, logs, audit data, command projections, or browser storage.

## Error Handling and Safety

- Cleanup and provisioning are transactional and tenant-scoped.
- Unexpected references, missing active companies, unavailable permissions,
  duplicate identities, or partial writes fail closed and roll back.
- Self-approval denial uses a stable authorization error and reveals no sensitive
  identity data.
- Permission evaluation never trusts browser-provided module, company, location,
  or warehouse values.
- Existing users in other tenants and non-security business data are unchanged.

## Verification

Automated verification will cover:

- password acceptance at 8 characters and rejection at 7, plus existing maximum,
  identifier, null, and reuse checks;
- contracts, OpenAPI/client drift, login UI, type checking, linting, and build;
- cleanup dry-run counts, tenant isolation, unexpected-reference refusal,
  rollback, and idempotent provisioning;
- Shoaib login and effective Super Administrator permissions;
- ordinary maker-checker denial and Shoaib's permission-controlled self-approval;
- direct-API denial when `security.user_account.self_approve` is absent;
- audit evidence distinguishing a normal approval from self-approval;
- role/module-derived Access Rights and scoped location/warehouse projections;
- user-detail loading, empty, unauthorized, and recent-activity states;
- relevant PostgreSQL integration, unit, contract, security, and frontend tests.

Manual acceptance will verify that the current user list contains Shoaib and no
synthetic UAT users, Ali is absent, Shoaib can log in with the supplied runtime
credential, create and self-approve a user request, see all existing modules, and
inspect the five requested user-detail sections.

## Risks and Accepted Trade-offs

Allowing one actor to create and approve the same account weakens separation of
duties. The accepted mitigation is a dedicated permission granted only through a
role, backend enforcement, full audit evidence, and no equivalent bypass for role
or assignment approvals. The eight-character minimum also reduces password
strength relative to the previous policy; hashing, throttling, identifier checks,
reuse prevention, and session controls remain mandatory.

## Acceptance Criteria

- The active UAT tenant contains Shoaib and no synthetic user-management accounts
  or pending Ali request.
- Shoaib authenticates as `shoaib` or `shoaib@nexora.ai` with the supplied runtime
  credential.
- The effective Super Administrator role exposes all currently active module
  permissions through normal role evaluation.
- Shoaib can create and approve the same user-account request; users without the
  explicit permission cannot.
- Permissions remain derived from roles and modules, never direct user grants.
- Access Rights, Preferences, Location Settings, Warehouse Management, and Recent
  Activity are available from user detail with correct authorization and states.
- Relevant automated checks and manual acceptance complete without an unresolved
  security, tenant-isolation, or data-integrity failure.
