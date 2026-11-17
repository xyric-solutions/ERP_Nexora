# Manual Journal compact actions implementation

Completed on 17 November 2026. Verification: 42 focused tests, two isolated
finance integration tests, 10 Chromium tests, 12 real-data preview and 12 live
cases, both production builds and final static/theme checks. No live posting.

1. Reuse existing create/update/submit/decision APIs in a Finance-owned operation
   helper. Retain returned IDs/versions and idempotency keys across partial failures.
   Test retries, state progression, permissions and confirmation before wiring UI.
2. Configure optional action visibility at the workspace boundary. Replace the
   manual editor footer with Save Draft and Approve & Close; retain final review,
   override reasons, unsaved guards and lifecycle feedback. Move deletion to detail.
3. Remove the dimension column, keeping conditional inputs beneath the account.
   Compact local header, rows, totals and gaps without changing shared styling.
4. Extend existing Journal component/browser regressions for the approved behavior,
   current session fixtures and responsive accessibility. Run focused unit/contract
   and isolated finance integration checks, typecheck, lint, theme audit and builds.
5. Copy only compatible frontend changes into the active release, verify read-only
   real-data navigation without posting business records, update startup/evidence
   documentation, then commit and push to shoaib_nexora.
