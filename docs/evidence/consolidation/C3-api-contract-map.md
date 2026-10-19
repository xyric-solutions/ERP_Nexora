# C3 API Contract Map

- Date: 2026-10-09
- Reference contract: `Nexora-ERP/contracts/openapi-v1.json`
- Final-root baseline contract: `openapi-v1.json`
- Contract authority during porting: reference behavior plus approved
  architectural decisions; target contracts change slice by slice

## Inventory and compatibility rule

| Contract             | Paths | Operations | Current coverage                                                |
| -------------------- | ----: | ---------: | --------------------------------------------------------------- |
| Reference production |   148 |        210 | Platform, security, HR/Payroll, finance, procurement, inventory |
| Final-root baseline  |    17 |         18 | Health, jobs, password/MFA/session endpoints                    |

The path sets have no exact string match because the reference contract embeds
`/api/v1` in every path while the target contract is mounted under `/api/v1` by
Express. Semantic comparisons below therefore compare the effective HTTP path,
not literal JSON keys.

## Canonical transport decisions

| Concern                     | Reference behavior                                | Final decision                                                                                                 |
| --------------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| API prefix                  | `/api/v1`                                         | Keep `/api/v1`                                                                                                 |
| Authentication              | tenant + email + password                         | Keep; no MFA/OIDC/SAML                                                                                         |
| Session transport           | opaque cookie; bearer session disabled            | Keep cookie-only                                                                                               |
| Session authority           | Redis in reference; PostgreSQL in target baseline | Redis is authoritative for active sessions; PostgreSQL is authoritative for identity, authorization, and audit |
| Tenant selection            | explicit on login, then bound to trusted session  | Keep; never trust arbitrary tenant headers after authentication without matching the session                   |
| Protected API authorization | exact server-side permission                      | Keep                                                                                                           |
| Correlation                 | response/error correlation identifier             | Keep and normalize header/error naming                                                                         |
| Command retries             | idempotent governed commands                      | Keep `Idempotency-Key` behavior for retriable mutations                                                        |
| Errors                      | safe structured error with code and correlation   | Adopt one versioned RFC7807-style target shape while preserving stable source codes/status semantics           |
| Pagination                  | bounded cursor/limit in governed lists            | Keep; no unbounded administrative or employee lists                                                            |

## Authentication mapping

| Effective route                | Reference request/response                                                             | Target baseline                                                              | Required C4 result                                                                                                                                      |
| ------------------------------ | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/v1/auth/login`      | `CreateLogin`: `tenant_id`, `email`, `password`; returns tenant and authenticated user | `/auth/login/password`: `loginIdentifier`, `password`; returns `mfa_pending` | Replace with tenant-aware approved login. Generic invalid-credential denial; rotate/create server session; never return MFA state                       |
| `GET /api/v1/auth/session`     | returns tenant and `AuthenticatedUser` including roles and backend-derived permissions | returns user ID, CSRF token, expiry, and possibly `mfa_pending`              | Return authenticated session state, tenant, safe user projection, backend-derived authorization, CSRF/expiry metadata; never client-derived permissions |
| `POST /api/v1/auth/logout`     | revokes current session; 204                                                           | current session logout exists                                                | Preserve 204 semantics and delete/revoke server state plus cookie                                                                                       |
| `POST /api/v1/auth/logout-all` | no reference route                                                                     | target extension                                                             | Retain only if implemented tenant/account-safely and contract-tested; it is not required for source parity                                              |
| session rotation               | login/session behavior tests prove rotation                                            | explicit target endpoint exists                                              | Rotation is a server concern. Do not expose a route that permits fixation or client-selected identifiers                                                |
| MFA routes                     | not part of approved final architecture                                                | nine active target endpoints plus MFA response states                        | Remove from active C4 runtime/OpenAPI/UI; retain historical database data until separately approved                                                     |

Reference `AuthenticatedUser` requires `id`, `email`, `display_name`, `roles`,
and `permissions`. The permission list must be computed from active normalized
PostgreSQL authorization records after the session and account have been
validated.

## R00-R07 security administration mapping

| Method and route                                   | Required exact permission                  | C4 target behavior                                    |
| -------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------- |
| `GET /api/v1/security/permissions`                 | `security.authorization.permission.read`   | Bounded catalog read                                  |
| `GET /api/v1/security/capabilities`                | `security.authorization.permission.read`   | Return server-derived administrative capabilities     |
| `GET /api/v1/security/roles`                       | `security.authorization.role.read`         | Tenant-scoped role list                               |
| `POST /api/v1/security/roles`                      | `security.authorization.role.create`       | Transactional/idempotent role creation; 201           |
| `POST /api/v1/security/role_actions`               | `security.authorization.role.edit`         | Edit/activate/deactivate/archive governed role action |
| `GET /api/v1/security/assignments`                 | `security.authorization.assignment.read`   | Tenant/company/scope-filtered assignments             |
| `POST /api/v1/security/assignment_requests`        | `security.authorization.assignment.create` | Create maker request; 201                             |
| `POST /api/v1/security/assignment_request_actions` | `security.authorization.assignment.edit`   | Submit/reject/cancel permitted transitions            |
| `GET /api/v1/security/approvals`                   | `security.authorization.role.approve`      | Checker queue only                                    |
| `POST /api/v1/security/approval_actions`           | `security.authorization.role.approve`      | Approve/reject with maker-checker and SoD enforcement |
| `GET /api/v1/security/audit_events`                | `security.authorization.audit.read`        | Immutable evidence projection                         |

Reference status sets distinguish success, authentication failure,
authorization denial, validation, conflict, and dependency unavailability.
C4 must preserve those semantics (`200/201/204`, `401`, `403`, `409`, `422`,
`503`) even if the response body is normalized to the final error envelope.

## R08/R09 HR contract mapping

| Effective route/capability                                | Permission                                          | Target phase | Contract issue                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/v1/hr/employees`                                | `hr.employee.read`                                  | C5           | Reference response schemas are broad objects; C5 must create closed TypeScript schemas from actual repository projections |
| `POST /api/v1/hr/employees`                               | `hr.employee.create`                                | C5           | Preserve idempotency, tenant/company scope, audit, and 201                                                                |
| Employee detail/profile/contact/document reads and writes | catalog-specific exact permissions and field grants | C5           | Private fields must be projected server-side; frontend hiding is insufficient                                             |
| `GET /api/v1/hr/assignments`                              | `hr.employee_assignment.read`                       | C6           | Bounded, effective-dated projection                                                                                       |
| `POST /api/v1/hr/assignments`                             | `hr.employee_assignment.change`                     | C6           | Transactional transition and audit                                                                                        |
| `GET /api/v1/hr/audit_events`                             | `hr.employee_audit.read`                            | C5-C6        | Safe immutable evidence projection                                                                                        |
| transfer/terminate/rehire actions                         | exact action/state permission                       | C6           | Explicit command schemas, version/precondition, idempotency, conflict response                                            |

No HR contract is considered implemented merely because the approved screen is
present. The Express route, service, PostgreSQL repository, backend permission,
audit, and contract test must all exist.

## Error contract

The reference error schema is:

```text
{ code, message, details, correlation_id }
```

The final-root baseline uses an RFC7807-like shape:

```text
{ type, title, status, detail, instance, correlationId, code }
```

C4 will retain the target RFC7807-style envelope and map reference stable error
codes into `code`. Messages/details must remain safe, validation errors must not
leak secrets, and every response must carry the same correlation identifier in
the response header and body. Consumers must not branch on free-form text.

## Request-boundary rules

1. Closed request schemas reject unknown fields on security-sensitive commands.
2. Cookies establish the session; request bodies and arbitrary headers cannot
   assert identity, roles, permissions, tenant membership, or assurance.
3. A tenant header on a protected route is only a routing assertion and must
   match the validated session and PostgreSQL tenant membership.
4. Mutation APIs validate `Origin`/CSRF and use an idempotency key where retry
   could duplicate state.
5. List APIs use a bounded limit and stable cursor. Filtering must not bypass
   tenant/company/scope predicates.
6. Authorization and audit failures roll back the governed mutation.
7. Missing repositories or dependencies return a safe unavailable response;
   they never fall back to mock/in-memory state in production.

## Contract exceptions requiring implementation decisions

| ID      | Exception                                                       | Resolution                                                                                           |
| ------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| API-001 | Target login identifier is global; source login is tenant-aware | Adopt `tenant_id` + normalized email in C4                                                           |
| API-002 | Target login/session expose MFA states                          | Remove active MFA states/routes in C4                                                                |
| API-003 | Source embeds `/api/v1`; target OpenAPI relies on mount prefix  | Generate one canonical served document whose URLs match the runtime                                  |
| API-004 | Source HR schemas use generic objects in several places         | Derive closed schemas from implementation and characterization tests before C5 code                  |
| API-005 | Target metrics endpoint is unprotected                          | Protect it in C4 with the approved operational credential/control                                    |
| API-006 | OpenAPI alone does not visibly declare every idempotency header | Treat handler/security tests as authoritative and explicitly document headers in the target contract |

## Acceptance rule

An endpoint is accepted only when the generated OpenAPI, runtime validation,
Express behavior, PostgreSQL/Redis path, authorization, audit, and contract
tests agree. Contract drift passing against a mock or unused route is not
sufficient.
