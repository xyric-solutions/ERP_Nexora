# C3 Security Invariants

- Date: 2026-10-09
- Applies to: C4-C10 and every protected API/UI slice
- Authentication decision: email/password plus opaque server-side session;
  no MFA, OIDC, or SAML

## Authentication and session invariants

| Invariant              | Required behavior                                                                                                       | Verification                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Credential privacy     | Passwords are accepted only over protected transport, never logged, returned, or stored in a session                    | log-redaction and integration tests            |
| Enumeration resistance | Unknown tenant/email and invalid password use the same safe external denial where account disclosure would result       | API/security tests                             |
| Opaque identifier      | Session identifier is cryptographically unpredictable and only a digest/key is stored server-side as appropriate        | unit/statistical boundary and repository tests |
| Fixation prevention    | Successful login creates/rotates the identifier; a caller cannot nominate it                                            | integration/browser tests                      |
| Cookie security        | Production cookie is `Secure`, `HttpOnly`, path-scoped, and uses the approved `SameSite` mode                           | response-header tests                          |
| Server authority       | Cookie contains no roles, permissions, tenant authority, or sensitive profile state                                     | contract/security tests                        |
| Tenant binding         | The server session binds tenant and user; cross-tenant replay is denied                                                 | Redis/PostgreSQL integration tests             |
| Expiry                 | Idle and absolute expiration are enforced server-side                                                                   | clock-controlled tests                         |
| Revocation/logout      | Revoked, expired, disabled, or logged-out sessions fail immediately                                                     | integration/manual tests                       |
| Account revalidation   | Active account/assignment state is revalidated at the required boundary; revoked access does not survive a stale client | PostgreSQL/Redis tests                         |
| CSRF/origin            | Cookie-authenticated mutations require the approved CSRF/origin checks                                                  | security tests                                 |
| No bearer fallback     | Session IDs in authorization headers or request bodies are rejected                                                     | direct API tests                               |
| No MFA dependency      | MFA enrollment/state/claims never gate login or authorization                                                           | contract/runtime scan and browser tests        |

## Authorization invariants

1. Every protected Express route declares an exact permission and enforces it
   server-side before accessing protected data.
2. Roles are dynamic PostgreSQL records; role names are not hard-coded as
   authorization decisions.
3. Deny is the default for missing policy data, repository failure, invalid
   scope, inactive role, revoked/expired assignment, or parity/security error.
4. Tenant scope is derived from the validated session and enforced again by
   repository predicates/RLS.
5. Company/organization scope is checked against current/effective trusted
   assignments, not a client-supplied company ID alone.
6. Field allow-lists are applied to server-side reads and writes. A hidden UI
   field does not authorize its API use.
7. Permission revocation takes effect without requiring a new browser login.
8. Archived/inactive roles and revoked/expired assignments cannot regain
   access through cached state.
9. Normalized PostgreSQL policy is authoritative only after the approved parity
   gate; compatibility failures fail closed.
10. Direct URLs and handcrafted API calls receive the same decision as UI
    actions.

## Governed administration invariants

| Control            | Required behavior                                                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Delegation ceiling | An administrator cannot grant a role/permission/scope beyond authority they are authorized to administer                                 |
| Self-escalation    | A user cannot create, assign, or approve new authority for themselves where policy prohibits it                                          |
| Maker-checker      | Restricted changes are created/submitted by a maker and decided by a distinct authorized checker                                         |
| SoD                | Prohibited maker=checker, requester=approver, creator=approver, and configured conflicting-role combinations are rejected by the backend |
| Last administrator | Removing, disabling, expiring, or revoking the final effective administrator is rejected transactionally                                 |
| Concurrency        | Competing last-admin/approval/grant changes are serialized with PostgreSQL locks and rechecked inside the transaction                    |
| Idempotency        | Repeating the same keyed command returns the prior result or safe equivalent without duplicate/conflicting rows                          |
| Atomicity          | Role, grant, assignment, approval, compatibility projection, and audit changes commit or roll back together                              |
| Immutable evidence | Normal application roles cannot update/delete governed audit or completed command evidence                                               |

## HR and Payroll invariants

1. Employee lists, profiles, lifecycle, compensation, attendance, leave,
   overtime, payroll, payslips, approval, and payment each use exact permissions.
2. Tenant/company/own-employee scope is enforced in SQL/repository projections.
3. Private identity, contact, document, bank, salary, statutory, and payroll
   fields are omitted or rejected unless the applicable field grant exists.
4. Create/edit/archive/submit/approve/pay are separate actions; view access does
   not imply mutation authority.
5. Maker-checker and SoD are applied to payroll/financially material actions
   where the approved workflow requires them.
6. Money uses exact decimal arithmetic and deterministic rounding; never
   floating point.
7. Effective-dated records and lifecycle transitions preserve history and use
   version/precondition checks to prevent lost updates.
8. Audit is written in the same transaction as governed state changes.
9. No production action falls back to prototype arrays, demo fixtures,
   localStorage, or in-memory repositories.

## Tenant and database invariants

- All tenant-owned tables carry tenant identity and use matching composite
  foreign keys where cross-table ownership matters.
- RLS is enabled and forced for tenant tables used through application roles.
- Connection-pool checkout/transaction code sets trusted tenant context and
  clears it before reuse.
- Queries include tenant/company predicates even when RLS provides defense in
  depth.
- A Tenant A identifier supplied while authenticated to Tenant B is denied or
  not found without revealing Tenant A data.
- Global reference tables are read-only or govern writes explicitly; their
  global status must not be copied to tenant-owned business records.
- Additive migrations preserve IDs, relationships, history, audit, and old
  columns during the compatibility window.

## Audit invariants

Every governed event records enough trusted evidence to reconstruct the action:

- tenant and company/scope context;
- actor and validated session/correlation context;
- target user, role, employee, or business record;
- exact action and permission decision;
- previous/new state or safe structured diff;
- maker/checker/approval state when applicable;
- timestamp and idempotency/correlation identifier;
- denial/mismatch classification without secrets.

Audit failure prevents the material mutation. Passwords, session identifiers,
credential hashes, recovery material, and unrestricted private fields are never
written to logs or audit evidence.

## Operational invariants

- Health is liveness; readiness fails when required PostgreSQL/Redis/runtime
  dependencies are unavailable.
- Metrics and operational details are not anonymously accessible in production.
- Logs are structured, correlation-aware, and redact cookies, passwords,
  authorization headers, database credentials, and personal/payroll secrets.
- Rate limiting is server-side and tenant/account/IP-aware as appropriate.
- Unconfigured production repositories return a safe unavailable response; no
  mock fallback is allowed.
- MinIO/object storage uses private objects and server-authorized access when a
  slice introduces documents.

## Representative authorization fixtures

The C4 parity suite must include at least:

| Fixture                                           | Expected result                                              |
| ------------------------------------------------- | ------------------------------------------------------------ |
| Active exact grant, matching tenant/company/scope | Allow                                                        |
| No grant or wrong action (`read` versus `edit`)   | Deny                                                         |
| Revoked/expired assignment                        | Deny immediately                                             |
| Inactive/archived role                            | Deny                                                         |
| Tenant A session with Tenant B subject ID         | Deny without disclosure                                      |
| Company A administrator targeting Company B       | Deny                                                         |
| Private-field read/write without field grant      | Redact/reject                                                |
| Maker approving own restricted request            | Deny                                                         |
| Checker with permission approving another maker   | Allow if all scope/SoD rules pass                            |
| Administrator granting higher authority           | Deny                                                         |
| Concurrent removal of final administrators        | At least one operation denied; a valid administrator remains |
| Repeated keyed command                            | One material result and one consistent audit lineage         |
| Audit persistence failure                         | Entire governed mutation rolls back                          |
| Policy/repository/parity failure                  | Deny and record safe diagnostic evidence                     |

## Current final-root gaps

- Production Express does not wire the normalized policy repositories/services.
- Target identity/role tables are global and conflict with the source
  tenant-scoped model.
- Target login/session contracts still contain active MFA states/routes.
- Target production sessions use PostgreSQL rather than the approved/reference
  Redis authority.
- Metrics are not currently protected.
- HR/Payroll screens are not yet proof of API or PostgreSQL authorization.

These are C4+ implementation gaps, not accepted exceptions. C3 changes no
security behavior.
