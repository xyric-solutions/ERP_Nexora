# Existing-company sign-in and repeated organisation setup

Status: Proposed; login-only approval requested. No implementation applied.

## Verified behavior

The existing requested credentials authenticate successfully against the current
local release, returning HTTP 200; the session cookie restores successfully.
Fresh Chromium contexts at both localhost:3000 and 127.0.0.1:3000 subsequently
display organisation setup instead of proceeding to the existing company chooser.
This is a separate blocker from the earlier INVALID_CREDENTIALS log entry; its
precise input cannot be established from secure logs.

`app/login/page.tsx` treats absence of the browser-local organisation setup record
as evidence that a Super Admin's organisation is new. Browser storage can be
absent in another browser, private window, or after clearing site data. The company
directory already provides authenticated, server-scoped company access.

## Recommended correction

- Preserve password verification and all session/tenant/permission checks.
- Before showing setup solely because browser storage is missing, resolve the
  existing authenticated company directory. An existing selected company or
  accessible company means the account can proceed through normal company
  selection; do not create a fabricated browser setup record.
- Keep the setup flow for a Super Admin without an existing company and without
  a saved completed setup. Other users retain their existing flow.
- Show a loading state while checking. A failed check must show an explicit retry
  action, not masquerade as wrong credentials or an empty directory. Ignore stale
  responses after logout or tenant/user changes.
- Keep the existing company chooser, selection API and server access validation.
  No company creation, password reset, role grant, fiscal-period or business-data
  mutation is part of this correction.

Alternative: implement persistent organisation-profile completion on the server.
That would be more comprehensive but requires a separate Administration feature
and migration. Repeatedly restoring browser-only flags would leave the underlying
failure in other browsers and is not the proposed correction.

## Verification and local release

Add focused tests for an established account with empty browser storage, a truly
new account, restored/active sessions, failed directory loading and retry, and
stale responses after logout/tenant changes. Preserve genuine authentication
failure tests. Verify browser navigation reaches the company chooser and the
existing workspace using unchanged credentials, without business writes.

Run focused tests, changed-file lint, typecheck, theme write/check, diff check and
a production build. Update the earlier setup test fixture so that a genuinely
new account has no existing company; retain its validation and password-policy
assertions.

The pending Purchase/Bank database release is outside this repair. If approved,
publish only this frontend correction to the currently compatible local release;
do not start the latest API against its older database schema. Preserve old
artifacts for application rollback and verify the unchanged July–June calendar.
