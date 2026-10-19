# C4 Tenant-Free Login Verification Record

- Date: 2026-10-12
- Canonical repository: `E:\XS\Xyric Solutions LLP\prototype_ERP`
- Scope: username/email login without tenant input and governed organization selection
- Automated implementation status: PASS
- Manual Gate 1 status: BLOCKED — environment prerequisites are not configured
- C5/R08 status: NOT STARTED

## Implemented behavior

- The public login contract accepts only `identifier` and `password`.
- A restricted HMAC login directory discovers tenant/user candidates without
  granting the application role direct cross-tenant table access.
- Existing tenant-scoped credentials, normalized authorization, parity checks,
  sessions, CSRF, expiry, revocation, and logout remain authoritative.
- One verified membership creates the existing tenant-bound Redis session.
- Multiple verified memberships create a five-minute, opaque, single-use Redis
  selection ticket and expose only opaque choice IDs and safe organization
  names.
- Invalid, replayed, context-mismatched, and concurrent ticket use fails closed.
- Trusted authentication outcomes are appended to an immutable tenant-scoped
  PostgreSQL event table. Pre-verification inputs are not persisted.
- The `/login` page contains only Username or email and Password and renders
  organization choices in the same workspace when required.

## Automated evidence

| Check                                           | Result                                                  |
| ----------------------------------------------- | ------------------------------------------------------- |
| Format check                                    | PASS                                                    |
| ESLint                                          | PASS                                                    |
| TypeScript project references                   | PASS                                                    |
| OpenAPI/generated client drift                  | PASS                                                    |
| Next.js production build                        | PASS; `/`, `/login`, and `/admin/identity` generated    |
| Unit                                            | PASS — 9 files, 54 tests                                |
| Contract                                        | PASS — 2 files, 6 tests                                 |
| PostgreSQL/Redis integration                    | PASS — 9 files, 28 tests                                |
| Focused fresh migration/backfill/auth/selection | PASS — 4 files, 14 tests                                |
| Security                                        | PASS — 1 file, 5 tests                                  |
| Performance                                     | PASS — 1 file, 2 tests                                  |
| Accessibility                                   | PASS — 2 tests                                          |
| Legacy regression                               | PASS — 163 tests                                        |
| Production dependency audit                     | PASS — 0 vulnerabilities                                |
| UAT provisioner first test-only run             | PASS — 7 credentials and 14 directory mappings inserted |
| UAT provisioner second test-only run            | PASS — 0 inserted/updated, 14 unchanged                 |

The first concurrent legacy/accessibility attempt caused an `EBUSY` collision
on their shared generated `dist` output. Accessibility completed successfully;
legacy was rerun alone and all 163 tests passed. No product code was changed to
address that orchestration-only collision.

## Manual Gate blocker

The currently running isolated C4 review stack reports:

- security migration version: 6;
- `security_user_account`: 0 rows;
- `security_password_credential`: 0 rows;
- `security_login_identifier`: not present.

The host currently has no configured `AUTH_LOGIN_DIRECTORY_SECRET` and no
`NEXORA_UAT_PASSWORD`. Nexora intentionally provides no default for either.
The directory secret must be independently generated and managed; the UAT
password must be supplied through an approved local secret source. Neither may
be pasted into evidence or committed.

The approved Browser skill is not registered in this session. No Browser skill
instruction file is discoverable in the installed skill roots, and the
available browser-control kernel exits during startup with:

`windows sandbox failed: helper_unknown_error: setup refresh had errors`

No standalone Playwright/manual substitute was used and no browser evidence is
claimed.

## Exact prerequisites to continue

1. Configure distinct local secret values for `AUTH_LOGIN_DIRECTORY_SECRET`
   and `NEXORA_UAT_PASSWORD` outside Git. The directory secret must contain at
   least 32 bytes and differ from the existing throttle and session secrets.
2. Restart or open a supported ChatGPT Desktop/Codex session in which the
   approved Browser backend is registered and its JavaScript kernel starts.
3. Rebuild the C4 API/web images with the matching contract, run migration 7,
   run the login-directory backfill twice, and provision the isolated UAT
   identities using `npm run uat:provision-c4-auth`.
4. Confirm readiness and then execute the Manual Gate 1 journeys in the
   implementation plan with genuine browser evidence.

Until all four prerequisites succeed, C4 is `IMPLEMENTED/AUTOMATED PASS` but
not manually accepted. C5/R08 must not start.
