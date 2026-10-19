# W2-02 Server Session Evidence

- Date: 2026-10-07 PKT
- Scope: Wave 2, phase W2-02 only
- Status: complete; W2-03 now consumes and elevates this session boundary

## Delivered controls

- Added framework-independent session issuance, lookup, sliding idle expiry,
  fixed absolute expiry, rotation, current-session revocation, account-wide
  revocation, and synchronizer-token CSRF validation in `@nexora/auth`.
- Added PostgreSQL `user_session` state. Only HMAC-derived session tokens,
  source addresses, and user-agent values are stored; the opaque bearer token
  remains only in the browser's `HttpOnly` cookie.
- Added atomic rotation: the old session is revoked and its replacement is
  inserted in one transaction. Concurrent or replayed rotations cannot leave
  both tokens active.
- Added strict production cookies using the `__Host-` prefix, `Secure`,
  `HttpOnly`, `SameSite=Strict`, `Path=/`, no `Domain`, and bounded expiry.
- Added session restore, rotate, logout, and logout-all REST/OpenAPI contracts
  and generated web client methods. The browser helper keeps the CSRF token in
  memory and restores it from the session endpoint rather than local storage.
- Successful password login issues a fresh `mfa_pending` session. W2-03 now
  verifies MFA, rotates that session, and raises it to authenticated assurance.
- Added explicit trusted-proxy-hop configuration so client network context is
  accepted from forwarded headers only when deployment configuration opts in.

## Schema and migration

Migration `0003_server_sessions.sql` adds `user_session` with database checks
for status, assurance level, timestamps, revocation consistency, token format,
and the idle/absolute expiry relationship. Unique token hashes and active-user,
expiry, and rotation-chain indexes support lookup and lifecycle operations.

The migration is forward-only and non-destructive. Existing credential rows
are unchanged. Before production use, rollback is removal of `user_session`;
after sessions exist, corrections should use a forward migration to preserve
security evidence.

## Security decisions

- Session identifiers use 32 random bytes and are persisted only as
  purpose-separated HMAC-SHA-256 values.
- CSRF synchronizer tokens are derived from a server secret and the internal
  session identifier. They are returned in JSON, never placed in a readable
  cookie, and compared in constant time for state-changing session operations.
- Idle timeout defaults to 30 minutes and slides only after a valid server-side
  lookup. Absolute timeout defaults to eight hours and never slides, including
  during rotation.
- Login always replaces a presented session token, preventing session fixation.
  Logout and logout-all invalidate state in PostgreSQL, so copied cookies stop
  working immediately.
- Production cookie behavior is environment-controlled; local test cookies omit
  `Secure` only so loopback HTTP integration tests can exercise the same flow.

## Verification

| Check                                     | Result                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | PASS                                                                                                        |
| `npm run lint`                            | PASS                                                                                                        |
| `npm run test:unit`                       | PASS; 14/14 including session policy, expiry, rotation, fixation, CSRF state, and web helper behavior       |
| `npm run test:contract`                   | PASS; committed OpenAPI snapshot includes all session lifecycle endpoints                                  |
| `npm run test:security`                   | PASS; 3/3 including production cookie hardening                                                             |
| `npm run test:integration`                | PASS; 18/18 including PostgreSQL migration, fixation, expiry, CSRF, revoked-token replay, and logout-all    |
| `npm run test:performance`                | PASS; 1/1 foundation performance check                                                                      |
| `npm run api:check`                       | PASS; generated OpenAPI and web client have no drift                                                        |
| `npm audit --omit=dev --audit-level=high` | PASS; zero production vulnerabilities                                                                       |
| `npm test`                                | PASS; Next.js build, static checks, focused suites, and 163/163 legacy characterization tests               |
| API container build and readiness         | PASS; Node 24.16 Alpine image built and returned dependency-aware HTTP 200 with PostgreSQL and Redis healthy |
| Gitleaks 8.29.1                           | PASS; no leaks found                                                                                         |

The adversarial coverage includes session fixation, opaque persistence,
secure cookie flags, idle and absolute expiry, missing/wrong CSRF tokens,
atomic rotation, replay of revoked cookies, logout, and logout-all across
multiple browser agents.

## Subsequent Wave 2 implementation

W2-03 delivered TOTP enrollment and verification, one-time recovery codes,
separately authorized reset approval/audit, and safe rotation from
`mfa_pending` to MFA-authenticated sessions.
