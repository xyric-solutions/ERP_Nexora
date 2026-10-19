# HR-PARITY-01 - Organisation & Masters Production Parity

- Status: `implementation complete; owner acceptance pending`
- Theme: convert the seven approved Organisation & Masters screens onto existing production authorities
- Session cap: 5 bounded items
- Reviewed date / evidence path: 2026-10-06 / `docs/evidence/HR-PARITY-01-verification.txt`
- Build gate this batch: yes
- Active roots: `app/`, `contracts/`, `tests/`, `web/`
- Source links: owner-approved conversion design; parity matrix; live prototype HR master screens; live Platform organization and HR master implementations
- Handoff status target: READY
- Pre-development doc gate: READY
- Documentation evidence path: `docs/superpowers/specs/2026-10-06-hr-payroll-production-conversion-design.md`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Planned model family: GPT-6.1
- Planned model variant: sol
- Planned model ID: `gpt-6.1-sol`
- Planned API reasoning effort: high
- Planned reasoning mode: standard
- Planned surface setting: high
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: GPT-6.1
- Actual model variant: sol
- Actual model ID: `gpt-6.1-sol`
- Actual API reasoning effort: high
- Actual reasoning mode: standard
- Actual surface setting: high
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: HR master history, employee references, privacy, RLS and cross-company integrity make this a production security/data-integrity slice.
- Routing fallback: remain on the current capable route; stop rather than lower rigor if schema or authorization authority is ambiguous.
- Routing escalation condition: destructive migration, cross-tenant/company exposure, history rewrite, audit gap or unresolved prototype/production conflict.
- Routing evidence path: `docs/evidence/HR-PARITY-01-verification.txt`
- Routing deviation: none
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-PARITY-01-verification.txt`
- Endpoint class: native
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one seven-screen group; no Recruitment, Attendance, Leave, Payroll or unrelated module work
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`; PostgreSQL HR/Platform gates; `npm.cmd test`, accessibility, API drift, TypeScript, lint and build in `web/`

## Pre-development gate

- [x] Active sources and tie-breaker are explicit; prototype wins UX and live code/schema/tests win implementation ties.
- [x] The batch is bounded to one prototype group and four active roots.
- [x] Source links resolve to approved design, parity matrix and live implementations.
- [x] Verification gates cover backend/API, contract, security, migration, PostgreSQL, UI, accessibility and browser review.
- [x] Deterministic verify command and evidence path are recorded.
- [x] Runtime/model intake is complete; no worker or subagent is selected.
- [x] Existing user-owned Demo/company-context changes are preserved and reviewed before overlap.
- [x] Protected September Payroll/Finance evidence is outside scope.
- [x] Gate result: **READY**.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-PARITY-01-01 Freeze exact seven-screen field/action contract | prototype master screens and parity tests | done |
| HR-PARITY-01-02 Close organization/master API and persistence gaps | Platform/HR services, contract, PostgreSQL | done |
| HR-PARITY-01-03 Connect approved screens in production navigation/UI | `web/` HR routes and features | done |
| HR-PARITY-01-04 Prove RBAC/RLS/audit/history and negative paths | backend/PostgreSQL/security/frontend tests | done |
| HR-PARITY-01-05 Browser acceptance and Forgeflow closeout | Demo, evidence, ledgers and handoff | in_progress - automated/live HTTP evidence passed; owner data acceptance pending and browser runtime unavailable |

## Stop conditions

- Stop on any need for a duplicate organization/master authority.
- Stop before a destructive history rewrite or weakened RLS/RBAC/audit rule.
- Stop if exact prototype behavior requires an unresolved product decision.
- Stop before entering the People group; HR-PARITY-02 is a separate batch.

## Completion gate

- [x] All seven screens operate on PostgreSQL data through typed APIs.
- [x] Approved list/search/filter/create/view/edit/status/history/audit behavior is present where applicable.
- [x] Referenced historical masters cannot be destructively removed.
- [x] Cross-tenant/company and permission denial tests pass.
- [ ] Frontend, accessibility, build and browser workflow evidence pass. Automated/UI-component/live HTTP gates pass; interactive owner acceptance remains.
- [x] Parity matrix, progress, findings, evidence and handoff are updated.
