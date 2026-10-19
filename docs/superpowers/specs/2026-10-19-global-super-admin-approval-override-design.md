# Global Super-Administrator Approval Override Design

- Status: approved design — pending written-spec review
- Approved direction: 2026-10-19
- Scope: all current and future governed Nexora approval workflows
- Initial privileged role: `super_administrator`
- Initial privileged user: `shoaib` through active role assignment

## Objective

Allow an authenticated Nexora super administrator to approve or reject a
record that the same actor created, requested or submitted. The exception is
global across Banking, Identity & Access, HR, Payroll, Finance and future ERP
modules. It must remain an explicit, auditable override of segregation of
duties rather than silently removing maker/checker controls.

This design supersedes the Bank Account foundation rule that no actor,
including an administrator, may self-approve. Ordinary users and roles retain
that rule unchanged.

## Current evidence

- `shoaib` is provisioned with an active `super_administrator` role policy and
  all active permission definitions through `scripts/provision-shoaib-admin.ts`.
- Authenticated accounts already contain effective `roles` and `permissions`
  loaded from active, effective-dated role assignments.
- Banking, HR and Security repositories each implement their own same-actor
  rejection logic.
- Current Security approvals include role/assignment administration, session
  policies, access reviews, delegation and impersonation requests.
- Current HR approvals include employee drafts, lifecycle policies, Hire,
  Transfer, Promotion, manager, work-location and organization-placement
  changes.
- Bank Account approval currently rejects the creator or submitter.
- Some HR tables also enforce distinct actors with database constraints. A
  server-only exception would therefore be incomplete and inconsistent.
- Mutations during impersonation are already prohibited by the module session
  boundaries.

## Chosen approach

Use one server-derived capability named `platform.approval.override`.

An actor may use it only when all of these are true:

1. the authenticated account has an active `super_administrator` role;
2. the account has the active `platform.approval.override` permission;
3. the request is not running through impersonation;
4. the actor already has the workflow's normal approval/decision permission;
5. the record is in the correct pending state and its expected version matches;
6. a non-empty override reason is supplied; and
7. immutable override evidence is written in the same database transaction as
   the decision.

The capability is not inferred from a username, email, browser flag or request
body. `shoaib` receives it because of the role assignment, not because code
recognizes the literal username.

## Safety boundary

The override removes only the distinct-actor restriction. It does not bypass:

- authentication, CSRF or trusted-origin checks;
- tenant isolation, company access or row-level security;
- the normal approval permission for the affected workflow;
- source-state, lifecycle or optimistic-version validation;
- field validation or protected-field rules;
- balanced-journal and supported-currency requirements;
- open-period, posting, reversal or idempotency controls;
- immutable evidence and audit requirements; or
- the existing prohibition on mutations during impersonation.

An invalid record cannot become valid merely because the actor is a super
administrator.

## Authorization design

Add `platform.approval.override` to the governed permission registry. The
existing super-administrator provisioner remains the authority that grants all
active permissions and tenant scope to the role. Re-running it after the new
permission migration makes the grant explicit and idempotent.

Create one shared server policy with a result shaped conceptually as:

```text
evaluateApprovalActor(actor, makerIds, normalDecisionPermission)
  -> ordinary approval
  -> super-admin override required
  -> forbidden
```

The policy requires both the role and permission for an override. Domain
repositories continue to enforce their own record state and business rules,
but they no longer duplicate role-name or username logic.

The authenticated role/permission projection remains refreshed through the
existing authentication repository. No client-controlled super-admin claim is
added.

## Immutable override evidence

Add a tenant-scoped, FORCE-RLS `approval_override_event` authority owned by the
Security/platform boundary. Each event records:

- an opaque event ID;
- tenant ID;
- resource type and resource ID;
- decision/action;
- authenticated actor ID;
- the effective super-administrator role/policy evidence;
- the workflow's normal decision permission;
- the required human reason;
- correlation ID and idempotency key or command reference where available;
- decision timestamp; and
- a safe metadata snapshot containing no secrets or unrestricted personal
  data.

Rows are insert-only. Update and delete are rejected by a database trigger.
Repeated delivery of the same decision cannot create a second override event.

Where a domain table currently enforces different maker/checker actors with a
constraint, an additive domain migration adds a nullable
`approval_override_event_id` foreign key and changes the invariant to:

```text
different actor OR valid approval_override_event_id
```

This preserves database enforcement for ordinary decisions. Existing
migration files are never edited. Workflows that already depend on immutable
domain events also reference the override event from their decision evidence
or safe audit snapshot.

## Transaction and failure behavior

For a self-decision, the domain repository performs one transaction:

1. locks and reloads the target record;
2. revalidates tenant/company scope, permission, state and version;
3. evaluates the shared approval policy;
4. inserts or replays the immutable override event;
5. applies the decision with the override-event reference;
6. appends the normal domain lifecycle event and platform audit event; and
7. commits all evidence and state together.

If any evidence write or domain update fails, the entire transaction rolls
back. A conflicting idempotency replay returns the standard conflict response.

## API and browser behavior

Existing decision endpoints remain backward compatible. When the caller is
both the maker and an eligible super administrator:

- the existing decision reason is treated as the required override reason;
- the review surface displays a prominent **Super-admin override** warning;
- the confirmation states that the actor is overriding maker/checker
  separation;
- the decision response remains the existing domain result; and
- audit/history projections may expose a safe `super_admin_override: true`
  marker where the caller is authorized to view audit evidence.

Ordinary users continue to see self-approval blocked. The UI is explanatory;
the API and database remain authoritative.

## Current workflow rollout

The first implementation phase applies the shared policy and evidence to every
currently live decision path:

- Bank Account approval/rejection;
- Identity role and role-assignment decisions;
- governed user-administration approvals;
- Security session-policy decisions;
- Security access-review decisions;
- Security delegation decisions;
- Security impersonation-request decisions;
- HR employee-draft decisions;
- HR lifecycle-policy decisions;
- HR Hire, Transfer and Promotion decisions; and
- HR manager, work-location and organization-placement decisions.

Payroll, Finance and other schema authorities with distinct-actor constraints
but no live decision API receive compatible additive database support only
when their live workflow is implemented. Their future services must use the
same shared policy and override-event authority; they may not create a second
override mechanism.

## Super-administrator account behavior

After provisioning, `shoaib` has every active permission and active-company
access available to the tenant-wide role. The global approval override does
not depend on `shoaib` remaining the only super administrator: any future user
assigned the same governed role and capability receives the same behavior.

Removing or expiring the role assignment, disabling the account, revoking the
override permission or entering impersonation immediately removes override
eligibility. Existing audit evidence remains immutable.

## Testing and acceptance

### Unit and contract tests

- shared policy allows a distinct authorized approver;
- shared policy rejects an ordinary self-approver;
- shared policy allows self-approval only with both role and permission;
- impersonated sessions cannot use the capability;
- missing/blank override reasons are rejected;
- session/OpenAPI compatibility remains stable; and
- the super-administrator provisioner includes the new permission.

### Database and integration tests

- additive migrations preserve all existing approval records;
- RLS prevents cross-tenant override evidence access;
- override evidence is immutable;
- ordinary same-actor decisions still fail;
- super-admin same-actor decisions and evidence commit atomically;
- failure after evidence insertion rolls back both evidence and decision;
- idempotent replay produces one decision and one override event;
- removing the role or permission restores self-approval denial; and
- all existing distinct-maker/checker scenarios continue to pass.

### Browser acceptance

Using the real `shoaib` session:

1. create and submit a Bank Account;
2. review it from Bank Account Approvals as the same user;
3. observe the override warning;
4. approve it with a reason;
5. refresh and verify persisted active state;
6. confirm the immutable override and normal domain audit records; and
7. repeat representative same-actor acceptance for Identity and HR.

A normal maker account must remain unable to approve its own records.

## Delivery sequence

1. Add the governed permission and immutable override-event authority.
2. Add the shared approval-policy utility and focused tests.
3. Make the super-administrator provisioner grant/reconcile the capability.
4. Integrate Security/Identity decision paths and tests.
5. Integrate HR decision paths and tests.
6. Integrate Banking decision paths and tests.
7. Add override warnings to the corresponding live review surfaces.
8. Run migration, unit, contract, integration, security, production-build and
   real browser acceptance gates.
9. Update Identity, HR and Banking delivery handoffs with the verified status.

Bank Payments work resumes only after this cross-cutting authorization phase is
complete and accepted.

## Out of scope

- hardcoded behavior for a username or email;
- disabling maker/checker separation for ordinary users;
- allowing mutation through impersonation;
- bypassing tenant/company boundaries or business validation;
- bypassing Finance posting, period or balanced-journal controls;
- automatically granting the role to additional users; and
- implementing Bank Payments in the same change set.

## Completion criteria

The phase is complete only when `shoaib`, through an active governed
super-administrator assignment, can self-decide every currently live approval
workflow; every such decision has atomic immutable override evidence; ordinary
users remain subject to maker/checker separation; security and database
isolation tests pass; and real Banking, Identity and HR browser acceptance is
recorded.
