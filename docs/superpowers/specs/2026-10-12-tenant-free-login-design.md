# Nexora Tenant-Free Username/Email Login Design

- Date: 2026-10-12
- Status: approved design; implementation pending plan approval
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Authentication authority: email/username plus password and opaque server-side sessions

## 1. Objective

Remove the tenant field from the Nexora sign-in form without weakening tenant
isolation. A user signs in with a username or email and password. Nexora either
opens the user's only eligible tenant or, when multiple eligible memberships
exist, requires the user to choose an organization before issuing the normal
tenant-bound session.

This work changes authentication discovery only. It does not change role,
permission, scope, maker-checker, separation-of-duties, last-administrator, or
audit semantics after authentication.

## 2. Selected approach

Use an additive restricted login directory and a short-lived Redis-backed
pre-authentication ticket.

This approach preserves the existing tenant-scoped `security_user_account` and
`security_password_credential` records. It avoids a destructive conversion to
a global credential model and does not impose global email uniqueness.

Rejected alternatives:

1. A global identity and credential redesign would require higher-risk account
   and credential migration.
2. Globally unique email/username would prevent legitimate multi-tenant
   memberships and conflicts with the approved organization-selection flow.

## 3. User flow

1. The sign-in page requests only `Username or email` and `Password`.
2. The server normalizes and hashes the identifier.
3. A restricted lookup resolves candidate active tenant/user memberships.
4. The server verifies the password against every eligible candidate without
   disclosing whether the identifier or a tenant exists.
5. When no candidate verifies, the server returns the existing generic invalid
   credential response.
6. When exactly one membership verifies, the server issues the existing
   tenant-bound Redis session immediately.
7. When multiple memberships verify, the server stores a short-lived,
   single-use pre-authentication record in Redis and returns safe organization
   choices plus an opaque ticket.
8. The user selects an organization in the same login workspace.
9. The server atomically consumes the ticket, confirms that the choice was
   permitted, reloads the tenant account, and issues the normal session.
10. Back or cancel invalidates the pre-authentication ticket and returns to
    credential entry.

## 4. PostgreSQL model

Add a restricted login-directory relation that contains only the information
needed to discover candidate tenant memberships:

- identifier type: username or email;
- keyed HMAC of the normalized identifier, never a plaintext password;
- tenant ID and user ID;
- lifecycle status and timestamps needed for deterministic administration;
- foreign key to the existing tenant-scoped user account;
- uniqueness preventing duplicate identifier mappings for the same tenant and
  account.

The exact table and constraint names will follow existing security migration
conventions. The directory is additive. Existing account, credential, role,
assignment, audit, and historical MFA records are not deleted or rewritten.

Directory records must be created, changed, disabled, and removed in the same
transaction as the corresponding governed account/identifier administration.
The initial backfill must be deterministic and idempotent. Ambiguous or invalid
identifiers must be reported and must not be guessed.

Normal application queries must not receive unrestricted cross-tenant access.
Only the authentication repository receives the narrow lookup capability.
After a candidate tenant is selected, all account and authorization reads use
the existing tenant context and forced row-level security.

## 5. Identifier rules

- Email matching is trimmed and case-insensitive.
- Username matching is trimmed, lower-cased, and validated by the existing
  username constraints.
- The server accepts one `identifier` value and resolves both supported kinds.
- The lookup key is an HMAC using a server-managed secret distinct from the
  login-throttle and session secrets.
- Raw identifiers and directory HMAC keys are not written to logs or audit
  metadata.

If the same identifier exists in several tenants with different passwords,
only memberships whose credential verifies are eligible. If more than one
membership verifies, the user receives the organization-selection step.

## 6. Redis pre-authentication ticket

The pre-authentication ticket is:

- cryptographically random and opaque;
- stored server-side under a dedicated key namespace;
- limited to five minutes;
- single-use and atomically consumed;
- bound to the verified tenant/user choices and request context;
- free of password hashes, permissions, roles, and trusted authorization state
  in the browser;
- invalidated on cancel, successful selection, expiry, or security-sensitive
  account change where practical.

Tenant choices returned to the browser use opaque choice identifiers and safe
organization display names. Raw internal tenant or user IDs are not accepted
from the browser as authorization evidence.

## 7. API contract

### `POST /api/v1/auth/login`

Request:

```json
{
  "identifier": "user@example.com",
  "password": "<redacted>"
}
```

Successful responses are a discriminated union:

1. Existing authenticated session response when one membership is eligible.
2. `tenant_selection_required` containing an opaque pre-authentication ticket,
   expiry timestamp, and safe organization choices when multiple memberships
   are eligible.

Invalid credentials retain the existing generic HTTP 401 response. Throttling
retains HTTP 429 and `Retry-After` behavior.

### `POST /api/v1/auth/select-tenant`

Request contains the opaque pre-authentication ticket and opaque organization
choice. Successful selection returns the existing authenticated session
response and cookie.

Invalid, expired, consumed, tampered, or unauthorized choices fail closed with
a safe authentication error. A failed selection never creates a session.

Existing `/session`, `/session/rotate`, `/logout`, and `/logout-all` contracts
remain unchanged. The session response continues to include the authoritative
tenant context for server and UI use after authentication.

## 8. Frontend behavior

The login form removes the tenant input and contains:

- username/email input with `autocomplete="username"`;
- password input with `autocomplete="current-password"`;
- accessible submission, loading, validation, and generic error states.

When tenant selection is required, the same login workspace replaces the
credential form with an accessible organization-choice view. It includes safe
organization labels, expiry handling, selection progress, error recovery, and
a back/cancel action. The design must reuse the approved Nexora login visual
language and must not create a separate top-level authentication application.

## 9. Security invariants

1. Tenant information is never returned before successful password
   verification.
2. Unknown identifier, wrong password, inactive account, and ineligible
   membership have externally equivalent credential-denial behavior.
3. Login throttling uses identifier and network keys without requiring a
   tenant.
4. Candidate hashes are verified consistently to reduce timing disclosure.
5. Locked, inactive, revoked, or expired memberships are not offered.
6. Directly supplied tenant IDs, user IDs, roles, permissions, or account state
   are never trusted.
7. The selection endpoint atomically consumes the ticket and reloads account
   state before session issuance.
8. Session fixation prevention, rotation, secure cookies, CSRF, origin checks,
   idle/absolute expiry, revocation, and logout remain unchanged.
9. Tenant/company authorization remains server-side and fail-closed after
   session issuance.
10. Passwords, raw session tokens, pre-authentication tickets, and identifier
    HMAC material are never logged or stored in audit evidence.

## 10. Audit and observability

Record security-relevant outcomes without creating an enumeration channel:

- successful credential verification and direct session issuance;
- successful credential verification requiring organization selection;
- successful organization selection;
- expired, replayed, or invalid selection attempts;
- throttling and account-state denials at the existing safe aggregation level.

Audit evidence records the resolved actor and tenant only after those values
are trusted. Pre-verification failures use correlation information and safe
reason categories without raw identifiers or credentials.

## 11. Migration and compatibility

- Add the directory schema and indexes through the ordered production source
  migration chain.
- Backfill email and username mappings from real PostgreSQL records.
- Produce an exception report for conflicts and invalid identifiers.
- Make backfill and migration repeatable and idempotent.
- Keep the existing tenant-aware repository behavior available internally
  during deployment compatibility; remove the public tenant input only when
  directory coverage and tests pass.
- Do not delete old columns, credentials, sessions, historical MFA schema, or
  authorization data.
- Do not mutate Demo or source data during initial implementation tests; use a
  disposable restored database.

## 12. Error handling

- Invalid credentials: generic HTTP 401.
- Throttled login: HTTP 429 with `Retry-After`.
- Invalid/expired/consumed selection ticket: safe HTTP 401.
- Valid ticket with an invalid choice: safe HTTP 401 and ticket invalidation
  where appropriate.
- Dependency failure: fail closed with the existing safe 503 problem response.
- Migration ambiguity: stop the backfill for that record and report it; never
  select a tenant by guesswork.

## 13. Verification plan

Automated verification must cover:

1. Username and email normalization and login.
2. Unknown identifier and wrong-password response equivalence.
3. Single-tenant direct session issuance.
4. Multiple-tenant organization selection.
5. Different passwords for the same identifier across tenants.
6. Locked/inactive membership exclusion.
7. Invalid, expired, replayed, tampered, and concurrent ticket consumption.
8. Cross-tenant and unoffered-choice denial.
9. Identifier/network throttling and safe recovery.
10. Session fixation prevention, cookie flags, CSRF, rotation, expiry,
    revocation, refresh persistence, and logout.
11. Login-directory migration constraints, repeat application, idempotent
    backfill, rollback safety, indexes, and query plans.
12. Existing RBAC, private fields, maker-checker, SoD, last-administrator,
    idempotency, tenant/company isolation, and audit regressions.
13. Contract/OpenAPI drift, generated client, frontend state, accessibility,
    production build, PostgreSQL/Redis integration, security, performance, and
    legacy regression suites.

Manual acceptance must demonstrate username and email login, direct
single-tenant entry, multi-tenant organization selection, cancellation,
expired-ticket recovery, session persistence, logout, denied operations, and
all five Identity & Access tabs using synthetic least-privilege identities.

## 14. Scope boundary

This design does not implement tenant switching after login, self-registration,
password reset, account recovery, invitations, MFA, OIDC, SAML, R08/C5, or
R09/C6. Those remain separate approved work. C5/R08 begins only after this C4
authentication change passes automated verification and Manual Gate 1.

## 15. Acceptance criteria

1. The sign-in form requests only username/email and password.
2. A tenant is never typed or trusted from the login request.
3. One verified membership creates a tenant-bound session directly.
4. Multiple verified memberships require safe organization selection.
5. No tenant information is disclosed before credential verification.
6. Existing session and authorization invariants remain green.
7. PostgreSQL migrations and backfill are additive, deterministic, and
   idempotent.
8. Automated suites and Manual Gate 1 pass with no known critical blocker.
