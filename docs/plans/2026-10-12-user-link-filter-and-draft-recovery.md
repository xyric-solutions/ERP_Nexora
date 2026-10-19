# User link filtering and draft recovery

## Scope

- Expose the existing PostgreSQL-backed `employee_linked` user-list filter as **All**, **Employee linked**, and **Not linked**.
- Show link status on each user row.
- Preserve incomplete create-user input as a browser-session draft scoped to the authenticated tenant and user.
- Keep governed drafts authoritative: only a complete, validated request is written to PostgreSQL and submitted for checker approval.
- Stop indefinite saving by applying a bounded API timeout and displaying safe RFC 9457 problem details returned by Nexora.

## Safety decisions

- Browser drafts use `sessionStorage`, contain no password, and are isolated by tenant and actor ID. They disappear when the browser tab/session closes.
- A successful create-and-submit clears the browser draft. A failed request retains it for correction and retry.
- Closing the wizard does not create a partial account, assignment, credential, or approval request.
- Existing permissions, tenant/company boundaries, maker-checker, SoD, and audit behavior remain unchanged.

## Verification

- Unit coverage for API error/timeout behavior and draft serialization.
- Existing user administration contract and PostgreSQL-backed integration tests.
- Typecheck, lint, API drift check, and production build.
