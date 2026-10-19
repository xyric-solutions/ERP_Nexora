# Global Super-Administrator Approval Override Implementation Plan

> **Design authority:**
> `docs/superpowers/specs/2026-10-19-global-super-admin-approval-override-design.md`

- Date: 2026-10-19
- Status: implementation in progress
- Scope: global same-actor approval override for governed super administrators
- Initial acceptance actor: `shoaib`
- Database: additive Security 0014, HR 0034 and Finance 0004 migrations

## 1. Goal

Allow an active, authenticated `super_administrator` with
`platform.approval.override` to decide records the same actor created,
requested or submitted. Preserve maker/checker separation for every ordinary
user and preserve all authentication, tenant/company, lifecycle, validation,
posting, period and impersonation controls.

Every override must be explicit, reasoned, idempotent and represented by
immutable evidence committed in the same transaction as the domain decision.
This phase finishes before Bank Payments begins.

## 2. Locked requirements

1. The capability is role/permission based, never username based.
2. Eligibility requires both the `super_administrator` role and
   `platform.approval.override` permission.
3. The actor must also possess the workflow's normal decision permission.
4. Impersonated sessions cannot use or exercise the override.
5. An existing decision reason becomes the mandatory override reason where the
   contract already provides one. Session-policy, access-review, delegation
   and impersonation decisions receive a backward-compatible optional reason
   field that is required server-side only when an override is exercised.
6. Ordinary same-actor decisions remain forbidden.
7. Override evidence is immutable, tenant scoped and transactionally coupled
   to the decision.
8. Existing migration files are not edited.
9. Existing APIs remain compatible; optional review metadata may be added.
10. The browser warns clearly before an override but never grants authority.
11. No Finance integrity or business validation is bypassed.
12. Existing independently approved workflows continue to work unchanged.

## 3. Delivery structure

| Wave | Slices                                                   | Dependency      |
| ---- | -------------------------------------------------------- | --------------- |
| 1    | Characterization, shared policy, Security authority      | Approved design |
| 2    | Identity/Security, HR and Banking repository integration | Wave 1          |
| 3    | Review metadata and browser warnings                     | Wave 2          |
| 4    | Cross-module acceptance and handoff                      | Waves 1–3       |

Work sequentially inside a database authority. Security migration 0014 must be
available before HR 0034 or Finance 0004 creates a foreign key to the override
event authority.

## 4. Implementation slices

### SOA-01 — Characterize all live approval boundaries

**Objective**

Lock existing behavior with failing override tests before changing policy.

**Files**

- Modify focused tests under `tests/unit`, `tests/integration` and
  `tests/security`
- Do not modify production behavior in this slice

**Work**

1. Build a checked inventory of every currently live decision method and its
   normal permission:
   - Bank Account decision;
   - Security role and assignment decisions;
   - governed user-management decisions;
   - session-policy decisions;
   - access-review campaign decisions;
   - delegation decisions;
   - impersonation-request decisions;
   - HR employee-draft and lifecycle-policy decisions;
   - HR Hire, Transfer, Promotion, manager, work-location and organization-
     placement decisions.
2. Add characterization proving ordinary makers are denied by each boundary.
3. Add initially failing cases showing an otherwise authorized super
   administrator is denied only because of the current same-actor check.
4. Record exact domain tables and immutable event/audit writers used by each
   decision.

**Completion conditions**

- Every production self-approval branch is covered by a named test.
- No mock-only screen or inactive schema is represented as a live workflow.

### SOA-02 — Add the shared approval policy

**Objective**

Create one pure, reusable server-side decision policy.

**Files**

- Create: `packages/auth/src/approval-override.ts`
- Modify: `packages/auth/src/index.ts`
- Add: `tests/unit/approval-override.test.ts`

**Work**

1. Define constants for `super_administrator` and
   `platform.approval.override`.
2. Accept an authenticated account, the normal decision permission and the
   set of maker/requester/submitter actor IDs.
3. Return a discriminated result:
   - `ordinary` when the actor is distinct;
   - `override` only when role, override permission and normal permission are
     all present; or
   - `forbidden` with a stable reason.
4. Keep impersonation rejection at the established session mutation boundary;
   include an explicit defensive input/result test so future consumers cannot
   treat impersonation as eligible.
5. Do not perform database writes or accept browser claims in the pure policy.

The policy applies only to the approval/decision actor-separation rule. It
does not relax self-grant request creation, self-impersonation, delegation to
self, access-review item reviewer separation, or HR self-reporting rules.

**Tests**

- Distinct authorized approver succeeds without override.
- Ordinary maker is forbidden.
- Role without permission is forbidden.
- Permission without role is forbidden.
- Role and permission without normal workflow permission are forbidden.
- Full governed super administrator receives `override`.
- Disabled/missing authenticated account cannot reach the policy.

### SOA-03 — Add the governed override-evidence authority

**Objective**

Create the immutable evidence and permission authority used by all modules.

**Files**

- Create: `packages/db/source-migrations/security/0014_global_approval_override.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Add or modify focused database-security tests

**Schema**

Create `approval_override_event` with:

- `tenant_id`, opaque `event_id` and occurrence timestamp;
- `resource_type`, `resource_id` and `decision_action`;
- `actor_user_id` and effective `role_code`;
- evidence for the active role-policy assignment;
- `normal_permission_key`;
- non-empty `reason`;
- `correlation_id`;
- `idempotency_key` or command reference; and
- bounded safe `metadata jsonb`.

Add:

- composite tenant primary/foreign keys;
- a unique idempotency identity scoped to tenant/resource/action;
- indexes for resource history and actor/time review;
- FORCE RLS tenant isolation;
- an insert-only trigger rejecting update/delete; and
- permission definition `platform.approval.override`.

Add nullable `approval_override_event_id` references to currently live Security
approval authorities, including:

- `security_role_approval_request`;
- `security_assignment_approval_request`;
- `security_user_change_request` where its decision records the approver;
- `security_session_policy`;
- `security_access_review_campaign`;
- `security_delegation`; and
- `security_impersonation_request`.

Where an existing constraint enforces different actors, replace it additively
with `different actor OR valid override reference`. Do not weaken lifecycle or
approval-evidence constraints.

Session-policy approval and activation are independent governed decisions and
must retain separate override-event references. Replace the current
`security.authorization.administer` self-decision shortcut with the governed
role-and-permission policy; do not preserve it as an unaudited bypass.

**Tests**

- Clean migration chain reaches Security version 14.
- Permission registry count and exact key are verified.
- Existing rows backfill with null override references.
- Cross-tenant foreign keys and RLS reject leakage.
- Event update/delete are rejected.
- Ordinary same-actor rows without evidence remain invalid.
- A correctly linked same-actor row is valid.

### SOA-04 — Add HR and Finance override references

**Objective**

Preserve database-level maker/checker guarantees while permitting evidenced
super-admin exceptions in live HR and Banking workflows.

**Files**

- Create: `packages/db/source-migrations/hr/0034_global_approval_override.forward.sql`
- Create: `packages/db/source-migrations/finance/0004_global_approval_override.forward.sql`
- Modify: `tests/integration/postgres-migrations.test.ts`
- Modify/add HR and Banking database-security tests

**HR work**

Add tenant-scoped nullable override-event references to the current live
decision authorities:

- employee draft/approval authority;
- `hr_employment_lifecycle_policy`;
- `hr_employment_lifecycle_request` for Hire;
- `hr_employee_transfer_request`;
- `hr_employee_promotion_request`;
- `hr_employee_manager_change_request`;
- `hr_employee_work_location_change_request`; and
- `hr_employee_organization_placement_change_request`.

Change only constraints that directly prohibit same-actor approval. Leave
Payroll/statutory tables without live decision services unchanged until their
own production slice, as required by the design.

Lifecycle-policy approval and activation are independent governed decisions
and must retain separate override-event references. Additive replacements for
existing immutability triggers must allow only the new evidence reference,
without widening the set of mutable business fields.

**Finance work**

Add the tenant-scoped override-event reference to `bank_account`. Preserve all
Bank Account lifecycle, encryption, ledger-mapping and evidence constraints.

**Tests**

- Clean migration chain reaches HR 34 and Finance 4.
- Existing approval records remain unchanged.
- An override reference from another tenant/resource is rejected.
- Ordinary approvals still require distinct actors.

### SOA-05 — Add the transactional override-event writer

**Objective**

Provide one repository helper that writes or replays immutable evidence inside
an existing domain transaction.

**Files**

- Create a focused shared server module under `server/api/src/modules/security`
  following existing repository ownership
- Add focused unit and integration tests

**Work**

1. Accept an existing PostgreSQL transaction/client; never open or commit an
   independent transaction.
2. Re-evaluate the shared policy from the authenticated actor.
3. Resolve the active super-administrator role-policy assignment from the
   database at decision time and store its immutable identifiers.
4. Validate the reason, resource identity, normal permission, correlation ID
   and idempotency key.
5. Insert once or replay the matching event.
6. Reject conflicting reuse of an idempotency key.
7. Return the event ID for the domain row/event reference.
8. Never log the full reason, private HR values or sensitive banking data.

**Completion conditions**

- The helper cannot be invoked successfully with a browser-supplied role.
- Rollback of the caller transaction removes the new event.
- Idempotent replay returns the same event ID.

### SOA-06 — Reconcile the super-administrator role

**Objective**

Ensure `shoaib` receives the new governed capability through the role authority.

**Files**

- Modify: `scripts/provision-shoaib-admin.ts`
- Modify/add provisioning integration tests
- Update `.env.example` only if the existing provisioning variables are not
  already documented

**Work**

1. Continue deriving the super-admin permission set from all active permission
   definitions.
2. Assert the new override permission exists before committing provisioning.
3. Reconcile normalized grants, source state and tenant scope idempotently.
4. Preserve existing company grants; do not mutate append-retained access rows.
5. Rotate sessions only if the established authorization-version convention
   requires it for permission refresh.

**Acceptance**

- Two provisioning runs produce one active role assignment and one permission
  grant.
- A new session for `shoaib` returns both the role and permission.

### SOA-07 — Integrate Identity & Security decisions

**Objective**

Apply the shared policy and evidence to every current Security decision path.

**Files**

- Modify: `server/api/src/modules/security/source-administration-repository.ts`
- Modify any separate governed user repository actually owning user decisions
- Modify focused Security integration and router tests

**Work**

1. Replace local same-actor role checks with the shared policy.
2. Require the normal decision permission exactly as today.
3. For a super-admin self-decision, write the override event in the same
   transaction and persist its ID with the decision record.
4. Preserve last-administrator protections, protected system roles, role
   versioning, assignment validity, delegation boundaries and impersonation
   mutation denial.
5. Attach the safe override marker to existing audit events.
6. Cover role, assignment, user, session-policy, access-review, delegation and
   impersonation decisions.
7. Include `submitted_by` in delegation and impersonation maker evidence and
   require separate evidence for session-policy approval versus activation.

**Tests**

- Ordinary self-approval remains 403.
- `shoaib`-equivalent context can self-decide each workflow.
- Removing either role or override permission restores 403.
- Independent checker behavior remains unchanged.
- Protected-role and last-admin invariants still reject invalid operations.

### SOA-08 — Integrate HR decisions

**Objective**

Apply the shared policy consistently to current HR approval workflows.

**Files**

- Modify: `server/api/src/modules/hr/source-repository.ts`
- Modify HR services only where policy orchestration already belongs there
- Modify focused HR integration/router tests

**Work**

1. Replace every current `HR_SELF_APPROVAL_FORBIDDEN` branch with the shared
   policy result.
2. Keep company scope, employee scope, lifecycle state, effective-date,
   assignment and policy validation unchanged.
3. Persist override evidence/reference atomically for employee drafts,
   lifecycle policies, Hire, Transfer, Promotion, manager, work-location and
   organization-placement changes.
4. Treat lifecycle-policy approval and activation as separate decisions with
   separate evidence references.
5. Include the safe override marker in HR lifecycle/audit evidence.
6. Do not extend this phase into inactive Payroll/statutory decision APIs.

**Tests**

- Existing ordinary same-actor rejection tests continue to pass.
- Add a governed super-admin self-decision for each live HR request class.
- Failed HR business validation produces neither state change nor override
  event.
- Independent reviewer flows remain green.

### SOA-09 — Integrate Bank Account decisions

**Objective**

Allow the governed super administrator to decide their own Bank Account while
preserving all Banking safeguards.

**Files**

- Modify: `server/api/src/modules/banking/source-repository.ts`
- Modify focused Banking integration, router and security tests

**Work**

1. Replace the unconditional `MAKER_CHECKER_REQUIRED` branch with the shared
   policy.
2. Require `banking.bank_account.approve` plus override eligibility.
3. Write/reference the override event in the same transaction as the account
   decision, Banking lifecycle event and platform audit event.
4. Preserve status/version, tenant/company, ledger eligibility, encryption,
   duplicate-identifier and idempotency rules.

**Tests**

- Ordinary maker self-approval remains forbidden.
- Governed super-admin self-approval activates exactly once.
- Override reason and safe evidence are persisted.
- Failed ledger/company/version validation rolls back all writes.
- Existing distinct maker/checker acceptance remains green.

### SOA-10 — Add backward-compatible review metadata

**Objective**

Let live clients explain an override without exposing actor or role-policy
internals unnecessarily.

**Files**

- Modify applicable schemas under `packages/contracts/src/security`,
  `packages/contracts/src/hr` and `packages/contracts/src/banking`
- Modify: `packages/contracts/src/openapi-c4.ts`
- Modify: `packages/contracts/src/generate-client-c4.ts` only if generation
  requires a new method/type mapping
- Regenerate: `openapi-v1.json`, `app/lib/api/generated.ts`
- Modify focused contract/client tests

**Work**

Add safe optional review fields where ownership is not already available:

- `self_decision_requires_override: boolean`; and
- `super_admin_override_allowed: boolean` only when the server can derive it
  for the current authenticated actor.

Do not expose role-policy IDs, unrestricted audit metadata or a client-writable
override flag. Existing decision requests keep their current reason and
expected-version fields.

Add `reason?: string` to the session-policy, access-review campaign,
delegation and impersonation decision schemas. This remains optional for an
independent checker and is validated as nonblank by the server only for a
same-actor override.

### SOA-11 — Add shared warning and update live review surfaces

**Objective**

Make every live same-actor super-admin decision explicit and accessible.

**Files**

- Create a reusable warning/confirmation component under `app/shared/ui`
- Modify live Security review panels under `app/features/security`
- Modify live HR approval panels under `app/features/hr`
- Modify: `app/features/banking/views/banking-account-governance.tsx`
- Add focused frontend/E2E assertions

**Behavior**

1. Ordinary makers continue to see the independent-approver message and no
   decision action.
2. Eligible super administrators see the action plus a clearly titled
   **Super-admin override** warning.
3. Confirmation explains that maker/checker separation is being overridden.
4. The reason remains mandatory and is sent through the existing request.
5. Loading, error, version-conflict and idempotent retry behavior remain intact.
6. Keyboard, focus, label and destructive-action semantics remain accessible.

Do not alter mock-only approval screens or imply that an inactive workflow is
connected.

### SOA-12 — Cross-module runtime acceptance and handoff

**Objective**

Prove the global exception through the real web/API/PostgreSQL path and record
the safe resume point.

**Files**

- Add focused Playwright coverage under `tests/e2e`
- Update Identity, HR and Banking delivery/handoff documents
- Update the design and this plan with observed verification evidence

**Acceptance flow**

1. Apply Security 14, HR 34 and Finance 4 to the isolated database.
2. Reconcile `shoaib` and start a new authenticated session.
3. Create, submit and self-approve a Bank Account as `shoaib`.
4. Verify the warning, persisted active state, immutable override event,
   Banking event and platform audit event.
5. Execute representative same-actor Identity and HR decisions through the
   browser as `shoaib` and verify their evidence.
6. Sign in as an ordinary maker and prove self-approval remains unavailable
   and rejected by the API.
7. Prove impersonated sessions cannot mutate or self-approve.
8. Refresh/new-session verification proves persistence and authorization
   recalculation.

**Completion conditions**

- No accepted self-decision lacks an override event.
- No rejected/failed decision leaves an orphan event.
- No prototype fixture is used by an accepted live workflow.
- Bank Payments remains unchanged and prototype-only.

## 5. Verification commands

Run focused checks after each slice, followed by the complete gate:

```powershell
npm.cmd run api:generate
npm.cmd run api:check
npm.cmd run typecheck
npm.cmd run test:contract -- --run tests/contract/openapi.test.ts
npm.cmd run test:unit -- --run tests/unit/approval-override.test.ts tests/unit/banking-api-router.test.ts tests/unit/hr-api-router.test.ts tests/unit/hr-session-context.test.ts tests/unit/security-policy-cache.test.ts
npm.cmd run test:integration -- --run tests/integration/postgres-migrations.test.ts tests/integration/banking-account-foundation.test.ts tests/integration/c4-security-administration.test.ts tests/integration/governed-user-administration.test.ts tests/integration/security-session-policy.test.ts tests/integration/security-access-review.test.ts tests/integration/security-delegation.test.ts tests/integration/security-impersonation.test.ts tests/integration/hr-foundation-api.test.ts tests/integration/hr-governed-hire.test.ts tests/integration/hr-governed-transfer.test.ts tests/integration/hr-governed-promotion.test.ts tests/integration/hr-governed-manager-change.test.ts tests/integration/hr-governed-work-location-change.test.ts
npm.cmd run test:security
$changedCode = git diff --name-only --diff-filter=ACMR HEAD -- '*.ts' '*.tsx'
if ($changedCode) { npm.cmd exec -- eslint $changedCode }
npm.cmd run build:web
npm.cmd run test:e2e -- --grep "super-admin approval override"
git diff --check
```

Use only the isolated local test database for destructive or synthetic
acceptance data. Do not expose database, session, encryption or login-directory
secrets in logs or documentation.

## 6. Review and rollback discipline

- Commit migrations before dependent repository behavior.
- Do not edit Security 0001–0013, HR 0001–0033 or Finance 0001–0003.
- Preserve ordinary-maker characterization tests throughout implementation.
- If a domain cannot persist the override reference atomically, leave its
  self-approval blocked and report the gap; do not accept unaudited overrides.
- A rollback disables or revokes `platform.approval.override` from the role
  first. Additive evidence columns and immutable history remain retained.
- Do not delete or rewrite recorded override evidence.

## 7. Completion gate

This phase is complete only when `shoaib` receives the governed capability
through a fresh authenticated session, can self-decide every currently live
approval workflow, and each decision has atomic immutable override evidence.
Ordinary users must remain unable to self-approve, impersonation must remain
read-only for mutations, all domain invariants must remain enforced, focused
automated suites and production build must pass, and Banking/Identity/HR
browser acceptance must be observed.
