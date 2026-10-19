# W2-03 Multi-Factor Authentication Evidence

- Date: 2026-10-07 PKT
- Scope: Wave 2, phase W2-03 only
- Status: complete; W2-04 has not started

## Delivered controls

- Added RFC 6238 TOTP enrollment and verification using 160-bit random secrets,
  SHA-1, six digits, 30-second periods, and a one-step clock-skew window.
- Encrypts TOTP secrets with AES-256-GCM and user-bound additional authenticated
  data. Encryption and recovery-code HMAC keys are independently derived from a
  required 32-byte deployment master key with HKDF-SHA-256.
- Displays the enrollment secret only in the enrollment response. Status and
  later authentication responses never return it.
- Issues ten 80-bit recovery codes once, stores only keyed HMAC-SHA-256 values,
  and atomically consumes or invalidates each code.
- Rejects reuse by persisting and atomically advancing the last accepted TOTP
  time step. Five failed MFA attempts create a 15-minute account-level block
  with a `Retry-After` response.
- Rotates the server-side session after successful enrollment, TOTP, or recovery
  verification and raises assurance from `mfa_pending` to `mfa`. The old bearer
  token is immediately unusable.
- Adds reviewed reset requests. Only an MFA-authenticated active bootstrap
  administrator can inspect or decide the queue, and an actor cannot decide
  their own request. Approval invalidates recovery codes and revokes every
  active session belonging to the subject.
- Records enrollment, verification, recovery, reset request, and reset decision
  events without logging secret material. Security logging redacts TOTP secrets
  and recovery-code fields.

The design follows [RFC 6238](https://www.rfc-editor.org/rfc/rfc6238.html) for
TOTP interoperability and applies the replay-resistance and rate-limiting
requirements described by
[NIST SP 800-63B](https://pages.nist.gov/800-63-4/sp800-63b/authenticators/).
Recovery and reset behavior follows the separation and notification guidance in
the [OWASP MFA Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

## Schema and API

Migration `0004_mfa.sql` adds `mfa_credential`, `mfa_recovery_code`,
`mfa_reset_request`, and `mfa_security_event`, with lifecycle checks, single-use
constraints, pending-request uniqueness, and lookup indexes.

The versioned API exposes status, enrollment, confirmation, TOTP verification,
recovery verification, reset request, reset queue, approve, and reject routes
under `/api/v1/auth/mfa`. All mutations require the synchronizer CSRF token;
reset administration additionally requires MFA assurance and server-side role
authorization. OpenAPI and the generated TypeScript browser client cover every
route.

## Web experience

The Next.js `/auth/mfa` checkpoint supports enrollment, one-time secret display,
TOTP verification, recovery-code verification, printable/copyable one-time
recovery codes, reviewed reset requests, and the authorized reset queue. The
browser helper retains the CSRF token only in memory and replaces it after MFA
session rotation. Desktop and mobile WCAG 2 A/AA scans report no violations.

## Verification

| Check                                     | Result                                                                                                         |
| ----------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`                       | PASS                                                                                                           |
| `npm run format:check`                    | PASS                                                                                                           |
| `npm run lint`                            | PASS                                                                                                           |
| `npm run test:unit`                       | PASS; 20/20, including key validation, RFC vector, encrypted secret, replay, recovery, throttle, and token rotation |
| `npm run test:contract`                   | PASS; 1/1 and the committed OpenAPI snapshot includes all MFA routes                                           |
| `npm run test:security`                   | PASS; 3/3, including MFA secret and recovery-code log redaction                                                |
| `npm run test:integration`                | PASS; 22/22 against PostgreSQL, including one-time material, replay, throttling, reset dual control, and audit |
| `npm run test:performance`                | PASS; 1/1 foundation performance check                                                                         |
| `npm run test:e2e`                        | PASS; 8/8, including desktop/mobile MFA accessibility and all 67 HR visual baselines                           |
| `npm run api:check`                       | PASS; generated OpenAPI and TypeScript client have no drift                                                    |
| `npm audit --omit=dev --audit-level=high` | PASS; zero production vulnerabilities                                                                          |
| `npm test`                                | PASS; production Next.js build, static gates, focused suites, and 163/163 legacy characterization tests        |
| Gitleaks 8.29.1                           | PASS; no leaks found                                                                                            |

The first integration run had one incorrect test expectation: six failed MFA
events were correctly written, while the assertion expected five. The expected
count was corrected and the complete integration suite then passed. The later
test-fixture-only change from hardcoded test keys to runtime-generated keys was
covered by type-check, lint, unit, contract, security, and Gitleaks checks; a
repeat PostgreSQL run was unavailable after Docker Desktop's WSL backend stopped.

## Operational boundary

`AUTH_MFA_MASTER_KEY` is mandatory and must be supplied by the deployment secret
manager as exactly 64 hexadecimal characters. Key versioning is represented in
the schema, but rotation between key versions is future operational work.

The bootstrap administrator cannot approve their own reset. If that account
loses both its authenticator and all recovery codes, this phase intentionally
provides no authentication bypass; a separately designed and audited break-glass
procedure is required before production operations.

The deployable API image rebuild was attempted after all application checks, but
Docker Desktop terminated its WSL backend with an EOF and did not restart within
the validation window. This is an environment-level recheck to repeat; the same
phase had already passed its PostgreSQL integration suite before the daemon
failure.
