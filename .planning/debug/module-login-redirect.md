# Debug Session: Module Login Redirect

## Status

- State: resolved and verified locally
- Date opened: 2026-10-27
- Goal: Preserve the authenticated session when navigating to Bank or HR & Payroll.

## Symptoms

- Expected: A valid `shoaib` super-administrator session opens Bank and HR & Payroll.
- Actual: Selecting either module returns the browser to the login page.
- Reported errors: None.
- Timeline: Started after the HR branch merge, post-merge repair, migrations, and local account provisioning.

## Safety constraints

- Do not weaken authentication, authorization, tenant, company, Bank, or HR access controls.
- Do not expose credentials, cookies, session tokens, or secrets in this file or command output.
- Use only the current isolated service database.
- Do not overwrite existing uncommitted work.

## Evidence log

- The worktree already contains uncommitted post-merge repairs in generated client, shell, contract generator, finance repository, docs, and integration tests. These changes are treated as user-owned and will be preserved.
- The web application is intentionally opened at `http://127.0.0.1:3000`, but `apiBaseUrl()` defaulted browser requests to `http://localhost:4000`. These are different sites for cookie purposes.
- Every auth and protected API router receives `secureCookies: config.nodeEnv === "production"`; the current plain-HTTP API was started with `NODE_ENV=production`, so its session response sets a `Secure` cookie that the local HTTP browser cannot retain.
- The session cookie is also `SameSite=Strict`. This is correct for the application security model, but it means an unset API configuration must not silently change the browser host from `127.0.0.1` to `localhost`.
- The installed Next.js 16.3.8 environment-variable guide confirms that `NEXT_PUBLIC_*` values are browser-bundled and that an explicit public value should remain authoritative. The local fallback therefore has to be derived in browser code when no explicit value exists.

## Confirmed root cause

The local web/API pair was started with incompatible session-cookie settings and hostnames: production-only `Secure` cookies on plain HTTP, plus `127.0.0.1` for the web and `localhost` for the API fallback. Login returned an authenticated body, so the UI briefly entered the workspace, but the browser stored no usable cookie. The first protected Bank or HR request then returned 401; the generated client's intended expired-session callback cleared the client session and the home page redirected to `/login`.

This is not an authorization defect in either module, and the repair must not change the production cookie policy.

## Repair

- Preserve an explicit `NEXT_PUBLIC_API_BASE_URL` exactly as configured.
- When it is unset in a browser, derive the API origin from the current page protocol and hostname with local API port 4000, keeping `127.0.0.1` with `127.0.0.1` and `localhost` with `localhost`.
- Keep the server-rendering fallback at `http://localhost:4000`.
- Restart the local plain-HTTP API in development mode; production continues to require `Secure` cookies.
- Add focused unit coverage for explicit configuration, both supported local hosts, protocol preservation, and the SSR fallback.

## Verification

- Focused Vitest (`web-runtime-config` and `session-expiry`): passed, 2 files and 9 tests.
- Focused ESLint for the runtime helper and its new unit test: passed.
- `npm.cmd run typecheck`: passed.
- `npm.cmd run build:web`: passed with Next.js 16.3.8; all 6 static pages generated.
- `git diff --check`: passed.
- API readiness after the development-mode restart: `ok`.
- An unauthenticated headless-browser probe from `http://127.0.0.1:3000` requested session state from `http://127.0.0.1:4000/api/v1/auth/session`, confirming the browser-host fallback no longer changes sites.
- Authenticated Chromium verification passed without recording credentials or session values:
  - the browser retained a host-only `127.0.0.1`, `SameSite=Strict`, non-Secure cookie, appropriate for local plain HTTP;
  - Bank opened `/#/banking/account-balances`, displayed Banking & Treasury, did not redirect to login, and produced no HTTP responses with status 400 or higher;
  - HR & Payroll opened `/#/hr/org-structure`, displayed HR & Payroll, did not redirect to login, and produced no HTTP responses with status 400 or higher.
- Running services after verification: API PID 10496, worker PID 10460, web PID 65104.

## Security outcome

- Production cookie behavior was not changed: production still uses the `__Host-` session cookie with `Secure` and `SameSite=Strict`.
- Authentication, authorization, tenant/company scoping, and Bank/HR permission checks were not bypassed or weakened.
- The local fix changes only default API origin selection when no explicit public API URL is configured; explicit deployment configuration remains authoritative.

## Next action

- None for this issue.
