# W2-01 Identity, Password, and Bootstrap Evidence

- Date: 2026-10-07 PKT
- Scope: Wave 2, phase W2-01 only
- Status: complete; W2-02 now consumes this credential boundary

## Delivered controls

- Added the `@nexora/auth` workspace as the framework-independent authority for
  password policy, Argon2id hashing/verification, password-history checks,
  constant-time bootstrap-token validation, and login-throttle decisions.
- Added PostgreSQL records for users, current credentials, password history,
  one-time bootstrap completion, and distributed identifier/network throttles.
- Added a serializable one-time administrator bootstrap transaction protected
  by a PostgreSQL advisory transaction lock. Concurrent attempts can create
  only one administrator.
- Added generic password-login failures and persistent throttling after five
  failures in a rolling 15-minute window. Raw identifiers and IP addresses are
  HMAC-derived before throttle state is persisted.
- Added versioned REST/OpenAPI contracts for one-time bootstrap and password
  verification. W2-02 now converts a successful verification into an
  MFA-pending server-side session; password verification alone still does not
  grant fully authenticated access.
- Added optional one-time `AUTH_BOOTSTRAP_TOKEN` and required
  `AUTH_THROTTLE_SECRET` configuration. The bootstrap token can and should be
  removed after successful setup.

## Schema and migration

Migration `0002_security_identity.sql` adds:

- `app_user`
- `password_credential`
- `password_history`
- `authentication_throttle`
- `security_bootstrap_state`

The migration is forward-only and non-destructive. Existing Wave 1 tables are
unchanged. Before production data exists, rollback is removal of these five
tables in reverse dependency order; after use, corrections must be delivered
as a forward migration so credential and bootstrap evidence is not lost.

## Verification

| Check                                     | Result                                                                                               |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | PASS                                                                                                 |
| `npm run lint`                            | PASS                                                                                                 |
| `npm run test:unit`                       | PASS; 8/8 including Argon2id parameters, unique salts, policy, history, and import boundaries        |
| `npm run test:contract`                   | PASS; OpenAPI snapshot includes both authentication endpoints                                        |
| `npm run test:security`                   | PASS; 2/2 foundation controls preserved                                                              |
| `npm run test:integration`                | PASS; 12/12 including migrations, bootstrap concurrency, generic failures, and persistent throttling |
| `npm run api:check`                       | PASS; generated OpenAPI and web client have no drift                                                 |
| `npm audit --omit=dev --audit-level=high` | PASS; zero production vulnerabilities                                                                |
| `npm test`                                | PASS; Next.js build and 163/163 legacy characterization tests preserved                              |
| API container build                       | PASS; Node 24.16 Alpine production image built successfully                                          |
| Container Argon2id runtime check          | PASS; hash and verification succeeded inside the production API image                                |
| Gitleaks 8.29.1                           | PASS; no leaks found                                                                                 |

## Security decisions

- Password hashes use Argon2id with 19 MiB memory, two passes, one lane, a
  32-byte output, and a library-generated unique 16-byte salt.
- Passwords accept Unicode and do not impose composition rules. They require
  12–128 code points, cap UTF-8 input at 512 bytes, reject NUL, and cannot
  contain the login identifier.
- Unknown, disabled, and wrong-password accounts return the same public error.
  A dummy Argon2id hash is evaluated for unknown accounts to reduce timing-based
  account discovery.
- Bootstrap secrets and plaintext passwords are never stored. Bootstrap is
  permanently closed in PostgreSQL after the first successful transaction.

## Subsequent Wave 2 implementation

W2-02 delivered the server-side, rotated, revocable, CSRF-protected session
boundary with idle and absolute expiration. W2-03 now provides MFA verification
and promotion from `mfa_pending` to fully authenticated assurance.

The parent repository currently treats the implementation tree as untracked,
so no commit reference is recorded here. Repository staging/commit remains an
owner-controlled action.
