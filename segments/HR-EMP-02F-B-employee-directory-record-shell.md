# HR-EMP-02F-B - Employee Directory & Record Shell

- Status: `closed with waivers`
- Theme: Company-scoped employee selection and provider-backed record Overview
- Session cap: 5 items
- Reviewed date / evidence path: 2026-10-01 / `docs/evidence/HR-EMP-02F-B-verification.txt`
- Build gate this batch? yes
- Active roots: `app/`, `web/`
- Source links: owner-approved HR-EMP-02F-B request; `docs/superpowers/specs/2026-10-01-hr-emp-02f-b-employee-workspace-design.md`; `segments/HR-EMP-02F-A-read-contract-prerequisites.md`
- Handoff status target: CLOSED WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-EMP-02F-B-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: terra
- Planned model ID: `gpt-5.6-terra`
- Planned API reasoning effort: medium
- Planned reasoning mode: standard
- Planned surface setting: medium
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: not-run
- Actual model variant: not-run
- Actual model ID: not-run
- Actual API reasoning effort: not-run
- Actual reasoning mode: not-run
- Actual surface setting: not-run
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: bounded frontend/integration work with established API and security boundaries; sequential shared-file edits make delegation inappropriate.
- Routing fallback: stop and report if the Demo RBAC upgrade cannot preserve policy history or the UI needs a new backend authority.
- Routing escalation condition: provider semantic conflict, cross-company authorization ambiguity, destructive Demo operation, migration, or organization-projection requirement.
- Routing evidence path: `docs/evidence/HR-EMP-02F-B-verification.txt`
- Routing deviation: not-run
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: Codex
- Root synthesis evidence path: `docs/evidence/HR-EMP-02F-B-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded 02F-B session; stop before 02F-C/D, new organization API, migration, or provider semantic change.
- Verify command: `python scripts/verify.py unit integration contract security e2e migration` plus focused web test/a11y, API drift, typecheck/lint/build, and live Demo review.

## Pre-development gate

- [x] Live code/config/tests win implementation ties; locked architecture/PRD retain intent authority.
- [x] Owner explicitly authorized HR-EMP-02F-B and later approved fixing Demo visibility.
- [x] Existing 02F-A typed client and permission contract verified as the only Overview boundary.
- [x] HR-EMP-02F-A-D01 remains out of scope; no organization picker/projection is required for this read-only shell.
- [x] Demo work is additive and non-destructive; reset, stash, migration, and production RBAC changes are prohibited.
- [x] Verification gates selected: frontend behavior/a11y/build, API drift, backend HR/security/e2e, live Demo login/navigation.
- [x] Runtime/model/delegation intake and deterministic evidence path recorded.
- [x] Waiver X-002 remains: exact runtime model/effort metadata is not exposed by the active surface.
- [x] Gate result: READY WITH WAIVERS.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-EMP-02F-B-01 Production Demo visibility foundation | D02-A production Demo composition | done |
| HR-EMP-02F-B-02 Directory and route state | `web/src/app/(shell)/hr/employees/`, `web/src/features/hr/employee-workspace*` | done |
| HR-EMP-02F-B-03 Provider-backed Overview and tab shell | same | done |
| HR-EMP-02F-B-04 Focused behavior/security/a11y tests | backend and web tests | done |
| HR-EMP-02F-B-05 Regression, runtime review, evidence, closeout | evidence/ledgers/handoff | done_with_waiver |

## Known waiver / dependency

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Platform/HR owner | Editable company-scoped organization picker (`HR-EMP-02F-A-D01`) | Approve a separate projection slice | Company-descendant-only read contract and tests exist |
| Tooling owner | Exact runtime provenance (`X-002`) | Expose audit-grade runtime metadata | Runtime reports model/effort/surface values |

## Completion gate

- [x] Production-composed Demo account sees HR after a fresh password login.
- [x] Directory and record shell meet behavior, security, and accessibility tests.
- [x] Overview uses only `getEmploymentContext` for employment truth.
- [x] No prohibited payroll/sensitive values, migration, new authority, or provider semantic change.
- [x] Full selected regressions and live HTTP/runtime review recorded; visual inspection is waived to D02-D under `D02-A-W01` because the in-app Browser tool failed to initialize.
- [x] Ledgers, progress, handoff, evidence, commit, push, and clean synchronized worktree are the remaining closeout operations.

