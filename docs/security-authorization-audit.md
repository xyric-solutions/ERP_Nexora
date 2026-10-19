# Nexora Identity, Authorization, and Audit Baseline

This document describes the executable S1.2 boundary. Locked intent remains in
`architecture.md`; code and tests are implementation truth.

## Actor and trust map

| Actor | Identity proof | Access rule |
|-------|----------------|-------------|
| Anonymous | none | public routes only |
| Local credential user | tenant ID + username + PBKDF2-verified password | active tenant/account plus assigned active role policy; receives a tenant-bound signed bearer session |
| Tenant member / owner / admin | approved managed OIDC/SAML adapter returns trusted subject and MFA result | active tenant account plus assigned active role policy and all attribute constraints |
| Service account | future signed service-identity adapter | no implicit user fallback; explicit tenant and scopes required |
| Identity provider | validates token issuer, audience, signature, lifetime, and provider session policy | returns only trusted subject/MFA claims; never grants ERP permission |
| Database operator | infrastructure credential | outside application authorization; production must restrict and monitor audit-store access |

`RepositoryIdentityVerifier` consumes claims from `TrustedClaimsProvider`; it
does not parse or trust bearer payloads itself. It maps the trusted subject to
one active `UserAccount` in the supplied tenant and enforces an account-level
MFA requirement. Missing, expired/rejected, cross-tenant, inactive, or
MFA-insufficient claims deny identity mapping.

`POST /api/v1/auth/login` provides the credential flow. `PasswordCredential`
stores a unique salt and PBKDF2-HMAC-SHA256 verifier, never plaintext. A
successful login unions permissions from active assigned `RolePolicy` records
and issues an eight-hour HMAC-signed, tenant-bound bearer session. Protected
routes still pass through the existing identity and authorization gates, which
also re-check that the account remains active. Invalid usernames/passwords use
one generic denial and a dummy hash verification path; tokens and passwords
are excluded from request-completion logs and public error bodies.

The production composition persists accounts, credentials, role policies,
assignments, and audit evidence in PostgreSQL behind forced row-level security.
Password login is disabled by default and requires a separate session-signing
secret when explicitly enabled. PostgreSQL authorization remains active even
when identity is fail-closed.

Managed-provider refresh, key rotation, SSO, and centralized session
revocation remain responsibilities of the future production identity adapter.
The local credential/session implementation does not claim to replace that
production decision.

## Permission and policy semantics

- Permissions are exact lower-case `module.resource.action` values. There is
  no wildcard or direct user permission.
- Users obtain permissions only through active versioned `RolePolicy`
  assignments in their tenant.
- Scope is one of `tenant`, `own`, or `company`. Owner/company policies deny
  when the record boundary does not provide the matching attribute.
- Field rules use `allow` (`null` means unrestricted) and explicit `deny`
  snake_case paths. A requested denied field always denies; an allow-list must
  cover every requested field.
- Static SoD uses mutually conflicting role names and is enforced both when a
  role is assigned and whenever access is evaluated.
- Dynamic SoD uses `distinct_actor_fields`; if a configured record actor such
  as `requested_by` equals the current actor, the transaction denies even when
  its permission matches.
- No matching rule means deny. The application and security-command service
  both install reject-all authorization defaults.

HTTP protected routes declare `x-permission` in
`contracts/openapi-v1.json`. `ApiApplication` verifies tenant-aware identity
then invokes authorization before rate limiting or a handler. Repository
lookups filter by tenant, and the assignment table uses tenant-composite
foreign keys, providing a second isolation boundary.

Initial tenant/root-admin provisioning must seed its first account, policy, and
assignment through an owner-approved migration/provisioning path. Thereafter,
`SecurityAdministrationService` requires the following command permissions;
supplying only a `RequestContext` is insufficient:

| Controlled action | Required permission | Audit action |
|-------------------|---------------------|--------------|
| create user | `security.user_account.create` | `security.user_account.created` |
| create role-policy version | `security.role_policy.create` | `security.role_policy.created` |
| assign role policy | `security.role_assignment.create` | `security.role_assignment.created` |
| create platform resource | `platform.resources.create` | `platform.resource.created` |

## Audit evidence

`AuditEvent` stores tenant, actor, correlation, action, entity type/id, UTC
time, source, optional approval reference, and SHA-256 before/after hashes.
Raw record states, bearer tokens, idempotency keys, request bodies, passwords,
and secrets are not audit fields.

Each tenant has a sequence and chained event hash. The PostgreSQL repository
serializes tenant audit appends with a transaction-scoped advisory lock; both
PostgreSQL triggers reject update and delete statements.
Security-admin repository writes and their audit append share one transaction.
The API scaffold writes audit evidence before making its process-local resource
visible; audit failure returns a safe error and produces no resource side
effect. A future durable resource store must preserve this atomic-write rule in
one transaction/outbox boundary.

Append-only triggers and hash chaining are local controls, not a claim of
operator-proof WORM storage. Production still needs restricted writer/read
credentials, protected centralized archive/SIEM delivery, access monitoring,
retention policy, encryption at rest, backups, and tamper alerts.

## Verification coverage

The combined gate directly checks exact permission allow/deny, tenant
mismatch, field allow/deny, owner/company scope, conflicting roles,
self-approval, managed-claims rejection, MFA, cross-tenant identity,
cross-tenant foreign keys, reject-all HTTP/command defaults, audit-write
failure, audit coverage/replay, chain integrity, trigger immutability, and
forward/clean/preservation-blocked migration paths.

## OWASP Top 10 (2021) control mapping

Added 2026-08-06 (`accepted-improvements.md` I-016) to close a gap identified
during architecture review: no OWASP mapping existed anywhere before this
table. Status reflects what is actually built and evidenced today, not intent.

| OWASP category | Status | Control |
|-----------------|--------|---------|
| A01 Broken access control | Covered | Deny-by-default RBAC+ABAC with tenant/field/record/static-SoD/dynamic-SoD evaluation at both HTTP and non-HTTP command boundaries; S1.2-F01 closed the one privilege-escalation gap found. |
| A02 Cryptographic failures | Partially open | Hash-chained audit evidence exists; encryption-at-rest, key management, and TLS termination depend on Q-004 (open portion) and Q-006 (cloud provider), not yet selected. |
| A03 Injection | Covered | Parameterized Psycopg access; the SEC-PG-01 PostgreSQL test exercises migration, repository, RLS, authentication, authorization, audit and rollback paths. |
| A04 Insecure design | Covered | Reject-all defaults, exact-permission model, and hard-gates.md's 16 binary fail conditions are a design-level control, not a bolt-on check. |
| A05 Security misconfiguration | Partially open | S1.1/S1.2 scaffolds are dependency-free and minimal by design; production hardening (WAF, rate-limit distribution) is explicitly deferred (Q-001/Q-002, now decided in ADR-11/13 but not yet built). |
| A06 Vulnerable and outdated components | Partially open | FastAPI/Psycopg dependencies are pinned to compatible ranges and the production gate audits the resolved graph; ongoing update/SBOM policy remains an operations responsibility. |
| A07 Identification and authentication failures | Partially open | `TrustedClaimsProvider` correctly never trusts unverified bearer payloads and enforces MFA-state denial; the actual production identity provider is Q-003, still open. |
| A08 Software and data integrity failures | Covered | SHA-256 before/after hashing and per-tenant hash chains on `AuditEvent`; migration forward/rollback/preservation tests pass. |
| A09 Security logging and monitoring failures | Partially open | Structured, redacted logging and immutable audit trail exist; centralized SIEM/archive delivery and alerting depend on Q-004/Q-006, not yet selected. Observability stack now named (ADR-17) but not yet wired up. |
| A10 Server-side request forgery | Not yet applicable | No outbound HTTP-fetch-from-user-input surface exists in the current 4-route platform scaffold; re-assess when integration connectors (S4.1) or AI/OCR adapters (S4.2) are built. |

Five of ten categories remain partially open or not-yet-applicable — consistent
with `deferred-decisions.md`'s Q-003/Q-004/Q-006 still being open and no
business-domain or integration code existing yet. This table should be
re-verified at the close of every future segment, not just referenced once.
