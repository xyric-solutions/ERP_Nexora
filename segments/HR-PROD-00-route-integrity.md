# HR-PROD-00 — Authenticated route integrity

- Status: `closed`
- Theme: Install the existing company-context provider once at the authenticated shell boundary and align affected HR/Payroll UI permissions.
- Session cap: 3 items
- Active root: `web/`
- Source links: owner-approved HR & Payroll Slice 0 request (2026-10-05); live `web/src/app/(shell)`, `web/src/lib/session/company-context.tsx`, `web/src/components/shell/nav-config.ts`, and `app/api/application.py`
- Handoff status target: READY
- Pre-development doc gate: READY
- Documentation evidence path: `docs/evidence/HR-PROD-00-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: gpt-5.6-sol
- Planned API reasoning effort: medium
- Planned reasoning mode: standard
- Planned surface setting: medium
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: GPT-5 (runtime-reported family)
- Actual model variant: not exposed by runtime
- Actual model ID: not exposed by runtime
- Actual API reasoning effort: not exposed by runtime
- Actual reasoning mode: not exposed by runtime
- Actual surface setting: not exposed by runtime
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: bounded but security-sensitive shell composition and permission integration; native single-agent implementation avoids shared-write collision.
- Routing fallback: stop for owner review if the native route or deterministic verification is unavailable.
- Routing escalation condition: an unexpected authentication/RBAC contract change or schema requirement.
- Routing evidence path: this segment and `docs/evidence/HR-PROD-00-verification.txt`
- Routing deviation: exact variant/ID/effort/mode/surface remain unavailable under accepted finding X-002; no fallback or delegation occurred.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active orchestrator
- Root synthesis evidence path: this segment
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: bounded to Slice 0; stop before eligibility/preflight, salary, payroll calculation, statutory, seed, or D02-B work.
- Verify command: focused Vitest route/permission checks; `npm run test`; `npm run lint`; `npm run build`; focused backend security tests; `python scripts/verify_postgres_hr.py`.

## Pre-development gate

- [x] Active docs, archived docs, and tie-breaker identified: live code/config/tests win; locked architecture remains intent authority.
- [x] Source links resolve to the owner-approved slice and live implementation paths.
- [x] This is not a new Blueprint segment; no `BUILD_READY` marker is required.
- [x] Frontend/UI, auth/security, backend regression, and PostgreSQL HR gates selected.
- [x] Deterministic commands and evidence path recorded.
- [x] Runtime/model intake is complete; delegation is single and no worker is used.
- [x] Existing localization gates Q-007/Q-010 remain unchanged.
- [x] No destructive, credential, privacy, schema, or production-data action is required.
- [x] Gate result: READY

## Item checklist

| Item | Locator | Status |
|---|---|---|
| S0-01 Shared authenticated company context | `web/src/app/(shell)/layout.tsx` and redundant nested providers | done |
| S0-02 Permission integration | permission catalog, affected action gates, navigation tests | done |
| S0-03 Real route composition verification | actual shell/layout and affected route tests | done |

## Item notes

### S0-01 — Shared authenticated company context

- Installed the existing `FinanceCompanyProvider` once inside `RequireSession` at the shared `(shell)` layout.
- Removed redundant production providers from Finance, Dashboard, and Employee Directory. No second company state or backend authority was created.
- Decision: ship-ready.

### S0-02 — Permission integration

- Added the existing server-enforced Attendance/Leave permission strings to the frontend catalog.
- Payroll salary, adjustment, loan, and period workflow buttons now require the same approval/manage permissions selected by `app/api/application.py`.
- Server RBAC, contextual company authorization, and RLS were not modified.
- Decision: ship-ready.

### S0-03 — Real route composition verification

- Added tests that render the actual authenticated shell with Payroll, Attendance, Leave, Identity, HR Localization, Organization Localization, Employee Directory, and Finance pages.
- Tests prove the shell supplies one shared company context, company switching updates all shell consumers, and a user without HR permissions issues no protected Payroll requests or action controls.
- Current in-app Browser setup remains unavailable with the accepted `Cannot redefine property: process` tooling defect (D02-A-F02). Actual layout/component runtime, production build, HTTP 200, and database/security gates provide the completion evidence; no visual-design claim is made.
- Decision: ship-ready.

## Verification

See `docs/evidence/HR-PROD-00-verification.txt`.

## Scope boundaries

- No backend business-authority, PostgreSQL schema, RLS, localization date, statutory data, visual design, Dashboard, or unrelated-module change.
- No Slice 1 eligibility/preflight work.
- The existing company context remains a client selection/cache only; server-side contextual authorization and RLS remain authoritative.

## Completion gate

- [x] All six affected routes load through the real authenticated shell composition.
- [x] Dashboard, Finance, and Employee Directory retain the same shared company context.
- [x] Navigation and action controls match existing server permission strings.
- [x] Company switching updates every shell consumer; all affected query keys retain explicit company scope.
- [x] Anonymous/unauthorized behavior and server enforcement remain intact.
- [x] Focused and full frontend tests, lint, TypeScript/build, and selected backend/security/PostgreSQL gates pass.
- [x] Verification evidence, progress, ledgers, and handoff are updated.
- [x] Commit is pushed/synchronized as the final closeout action.
