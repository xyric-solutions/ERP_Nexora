# W2-04 Dynamic Authorization Design

- Status: approved by product owner on 2026-10-07
- Scope: Wave 2, phase W2-04 only
- Runtime: Node.js 24, Express.js, TypeScript, PostgreSQL, Next.js web client
- Depends on: W2-01 identity, W2-02 server sessions, W2-03 MFA
- Defers to: W2-05 policy middleware/capability projection, W2-06 security administration UI, W2-07/W2-08 workflow execution

## Goal

Create the production authorization decision model for dynamic roles, exact
permissions, company/branch/organization scopes, field allow-lists, and
segregation of duties. The phase must prove positive and negative permission
decisions, including cross-company denial, without hardcoding business role
names or moving workflow execution into the authorization layer.

## Approved decisions

1. All roles are database-defined and dynamic. Authorization logic never
   grants access because a role has a particular name or identifier.
2. Bootstrap creates an initial dynamic administrator role with explicit
   security permissions and enterprise-root scope. The
   `bootstrap_administrator` flag is not an authorization bypass.
3. The last effective assignment capable of security administration cannot be
   removed or reduced in a way that locks out administration.
4. A security-owned hierarchy models one enterprise root plus company, branch,
   and organization-unit scopes. Wave 3 organization entities reuse the
   company/branch/organization scope identifiers.
5. Permissions are exact module/resource/action keys. There are no wildcard or
   direct-user permissions.
6. Standard resource actions include `read`, `create`, `edit`, `delete`, and
   `archive`. Lifecycle actions add `submit`, `return`, `approve`, `reject`,
   `cancel`, and module-defined actions such as `activate`, `post`, or `reverse`.
7. Field authorization is allow-list only. A field-bearing request is denied
   when any requested field is absent from the effective allow-list.
8. Segregation of duties is dynamic and covers assignment-time role conflicts
   and transaction-time maker-checker conflicts.
9. Authorization is deny-by-default. Missing, stale, invalid, or incomplete
   policy inputs never produce a permit.

## Architecture

The policy decision service belongs in `packages/auth/src/policy/` and remains
independent of Express, PostgreSQL, and the browser. It accepts a trusted
principal and a complete authorization request, loads one transactionally
consistent immutable policy snapshot through a repository interface, and
returns a structured decision. Repository failure or an incomplete snapshot is
translated to a fail-closed `policy_unavailable` decision.

The PostgreSQL adapter belongs in the API security module. It translates
normalized security rows into that snapshot and performs administration writes
in transactions. API contracts expose security-administration commands and a
policy-evaluation contract for test and future internal composition.

W2-04 does not install centralized route middleware or project UI capabilities.
W2-05 will use the same policy service for the Express policy-enforcement point
and the browser capability projection, avoiding duplicate authorization logic.

## Scope hierarchy

`security_scope` is an authorization registry rather than a second organization
master. Each node has:

- immutable identifier;
- type: `enterprise`, `company`, `branch`, or `organization_unit`;
- unique code and display name within its company boundary;
- optional parent, enterprise-root identifier, and nullable root-company
  identifier;
- active/archive lifecycle state and optimistic version;
- creation and update timestamps.

Each installation has one enterprise root. A company is a direct child of that
root. A branch must be a direct child of its company. An organization unit may
descend from a company, branch, or another organization unit in the same
company. Database and service checks reject additional enterprise roots,
self-parenting, cycles, cross-company parents, and invalid type relationships.

Scope grants are explicit. An assignment may include a node only or that node
and its descendants. Descendant access is never inferred unless the grant's
`include_descendants` flag is true. Evaluation verifies both root company and
the target node path, preventing sibling and cross-company access.

## Roles and permissions

`security_role` stores a dynamic code, display name, description, lifecycle
status, and version. Names and codes are administrative labels only.

`security_permission` is the application-defined capability catalogue. Each
row stores an exact key, module, resource, action, description, field-bearing
indicator, state-context indicator, and sensitivity level.
`security_permission_state` stores the normalized source states from which a
state-aware permission may be exercised. A state-aware decision with a missing
or unmatched state denies. Modules register permissions and their state bounds
through migrations or controlled application setup because application code
must know which operation each key protects. Administrators assign catalogue
permissions to roles but cannot invent a key that no service enforces.

`security_role_permission` grants an exact permission to a role. Users receive
permissions only through effective active role assignments; direct grants are
not supported.

The seeded security catalogue uses explicit keys for scope, role, permission,
role-permission, field-grant, assignment, SoD, and policy-event administration.
Security administration permissions require MFA through permission metadata;
the evaluator does not infer assurance from a string prefix. A principal counts
toward the last-administrator invariant only when it has the exact
`security.access.administer` capability and the complete effective granular
permission bundle required to inspect, grant, and assign administrative access.

## Field allow-lists

`security_field_grant` associates a role-permission grant with a normalized
field path. For operations marked field-bearing, every requested input or
output field must be covered by at least one effective grant. Union is allowed
across the user's effective roles, but scope and SoD checks still apply.

An empty field set is valid only for actions without field content, such as a
pure archive command. The caller must provide the fields it intends to read or
change. The policy service never treats a missing field list as unrestricted.
Nested paths use normalized dot notation and are compared exactly; wildcard
paths are not supported in this phase.

## Role assignments and effective time

`security_role_assignment` associates a user with a dynamic role and contains
`valid_from`, optional `valid_until`, status, version, assigner, and timestamps.
Active periods for the same user and role cannot overlap.

`security_assignment_scope` associates each assignment with one or more scope
nodes and the explicit descendant rule. An assignment without an effective
scope grants no business-record access. Security-catalog administration uses an
explicit enterprise-root scope rather than an implicit global bypass.

Inactive users, inactive roles, revoked assignments, future assignments, and
expired assignments contribute no permissions or fields.

## Segregation of duties

`security_sod_policy` is dynamic, versioned configuration with two policy
kinds:

1. `assignment_conflict`: identifies two role IDs that cannot be effective for
   the same user over an overlapping time period and scope.
2. `transaction_conflict`: identifies a protected permission, a prior actor
   relation such as `created_by` or `submitted_by`, and whether matching that
   actor must deny the requested action.

Policies are validated against existing roles, permissions, and supported
actor-relation keys. A role cannot conflict with itself, equivalent pairs are
unique regardless of ordering, and incomplete conflict definitions are
rejected.

Assignment conflicts are enforced when assignments are created or changed and
again during evaluation, protecting against stale or externally imported data.
Transaction conflicts are evaluated using server-derived actor identifiers;
the client cannot assert that it is different from the maker.

## Draft and approval action matrix

The authorization model evaluates exact lifecycle actions and current record
state. Domain/workflow services remain responsible for performing a legal
transition.

| Action | Typical source state | Typical result | Authorization control |
| --- | --- | --- | --- |
| `create` | none | Draft | Exact permission, scope, create-field allow-list |
| `edit` | Draft or Returned | unchanged | Exact permission, scope, edit-field allow-list |
| `submit` | Draft or Returned | Submitted | Exact permission; records submitting actor |
| `return` | Submitted | Returned | Exact permission and configured actor separation |
| `approve` | Submitted | Approved | Exact permission; maker-checker denial |
| `reject` | Submitted | Rejected | Exact permission; configured maker-checker denial |
| `cancel` | Draft or Submitted | Cancelled | Independent exact permission |
| `archive` | Completed or inactive | Archived | Independent, reversible permission |
| `delete` | Unreferenced Draft only | removed | Independent permission plus domain eligibility |

This table defines authorization inputs, not a universal state machine. W2-07
defines versioned workflow transitions, and W2-08 executes them. A module may
support only the actions relevant to its records and may impose stricter state
or retention rules. Authorization never makes an otherwise illegal transition
legal.

## Policy request and decision

An authorization request contains:

- user and session assurance from the trusted server-side session;
- exact permission key;
- target scope ID and root company ID;
- requested field paths;
- optional current record state and requested lifecycle action;
- server-derived actor relations for transaction SoD;
- evaluation timestamp.

The service evaluates in this order:

1. require an active user and effective assignments;
2. require MFA assurance for security-administration permissions;
3. match the exact permission;
4. validate company and hierarchy scope;
5. validate every requested field against the effective allow-list;
6. validate required record state against the permission's allowed source
   states;
7. evaluate assignment and transaction SoD policies;
8. return a permit only when every applicable check succeeds.

The decision contains `allowed`, a safe reason code, permission key, evaluated
scope, and allowed fields. Expected denial codes are
`authentication_required`, `mfa_required`, `assignment_inactive`,
`permission_denied`, `scope_denied`, `field_denied`, `state_denied`,
`sod_conflict`, and `policy_unavailable`.

External responses do not reveal whether an out-of-scope target exists. Policy
details suitable for administrators remain separate from end-user denial
messages.

## Administration contracts

W2-04 provides typed contracts for:

- creating, editing, archiving, and reading scope nodes;
- creating, editing, archiving, and reading dynamic roles;
- listing the application permission catalogue;
- granting and revoking role permissions and field paths;
- creating, changing, revoking, and listing role assignments and scopes;
- creating, editing, archiving, and listing SoD policies;
- evaluating an authorization request for internal verification.

Security-administration commands require an MFA-authenticated session and the
corresponding exact security permission. Mutations use optimistic versions and
idempotency where the command could be retried. There is no hard-delete command
for roles, permissions, scopes, assignments, or SoD policy history.

The full security administration user interface remains W2-06.

## Bootstrap and lockout protection

The existing bootstrap administrator is migrated to an initial dynamic role,
explicit security-administration permissions, and enterprise-root scope with
descendant access. New installations create the same records atomically with
bootstrap completion. No policy branch checks the bootstrap flag to authorize
a request.

Any role, grant, scope, assignment, or lifecycle mutation that would remove the
last effective enterprise-scoped principal holding the administrator sentinel
and complete recovery-permission bundle is rejected. The invariant is
permission-based, not role-name-based, so roles remain dynamic and renameable
without preserving an administrator who cannot actually restore access.

## Security evidence

`security_policy_event` records role, permission, field, assignment, scope, SoD,
and bootstrap-policy changes. Administration state and its event commit or roll
back together. Events contain identifiers and safe before/after summaries, not
session tokens, MFA material, or unrestricted field values.

`security_policy_command` stores the command identifier, actor, operation,
request fingerprint, original safe result, and creation time. Repeating the same
identifier and fingerprint returns the original result; reusing an identifier
with different input is rejected. Retention is an operations policy and never
weakens event preservation.

This phase-local evidence does not replace W2-10. The later general audit system
will consume or supersede this boundary while preserving existing evidence.

## Error and failure behavior

- Missing or unusable policy data denies access.
- Unknown permission keys deny access.
- Cross-company and out-of-scope identifiers return a safe denial rather than
  target existence information.
- Conflicting assignments and last-administrator removal return deterministic
  conflict errors.
- Stale administrative versions return a conflict and do not overwrite newer
  policy.
- Database or security-event failure rolls back the complete administration
  mutation.
- Policy snapshots are loaded in one repeatable-read transaction. Administration
  commands reauthorize inside their write transaction after taking the shared
  policy mutation lock, so concurrent revocation cannot race a granted command.
- Policy-changing transactions are serialized through a database advisory lock;
  triggers use the same lock for hierarchy, overlap, and last-administrator
  checks so alternate writers cannot bypass concurrency invariants.
- Logs and public errors omit field values, policy internals, and sensitive
  identity data.

## Verification

Unit coverage must include:

- positive and negative decisions for `read`, `create`, `edit`, `submit`,
  `return`, `approve`, `reject`, `cancel`, `delete`, and `archive`;
- exact permission matching and denial of wildcard-like inputs;
- complete and incomplete field allow-lists;
- company, branch, organization-unit, descendant, sibling, and cross-company
  scope decisions;
- active, future, expired, revoked, and inactive assignment cases;
- dynamic role conflicts, maker-checker denial, and self-approval denial;
- unavailable or incomplete policy fail-closed behavior.

PostgreSQL integration coverage must include:

- hierarchy, uniqueness, lifecycle, temporal, and conflict constraints;
- bootstrap backfill and permission-based last-administrator protection;
- cross-company scope denial and valid descendant access;
- transaction rollback when security-event persistence fails;
- positive and negative permission/scope/field/SoD matrices.

Contract coverage must include every administration resource and structured
decision shape. Regression verification must run type-check, formatting, lint,
unit, integration, contract, security, build, Playwright/axe, dependency audit,
secret scan, and generated-client drift checks.

## Phase boundary

W2-04 is complete when the schema, migrations, policy service, PostgreSQL
adapter, administration contracts, bootstrap policy data, and positive/negative
matrix tests pass.

It does not include centralized Express enforcement, frontend capability
projection, security administration screens, workflow definition/execution, or
the general integrity-chained audit service. Those remain W2-05 through W2-10.

## Standards alignment

The design follows OWASP authorization guidance to deny by default, validate
permissions on every request, and authorize the specific object and action. It
implements both configured and transaction-time separation of duties described
by NIST and keeps enforcement server-side.

- OWASP Authorization Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html>
- OWASP Authorization Patterns Cheat Sheet:
  <https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Patterns_Cheat_Sheet.html>
- NIST separation-of-duty definition:
  <https://csrc.nist.gov/glossary/term/separation_of_duty>
