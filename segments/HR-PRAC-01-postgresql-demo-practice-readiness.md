# HR-PRAC-01 - PostgreSQL Demo HR/Payroll Practice Readiness

- Status: `closed with waivers`
- Theme: Expose the existing production HR/Payroll authority through a safe,
  deterministic Demo practice chain.
- Session cap: 5 items
- Reviewed date / evidence path: 2026-10-01 / `docs/evidence/HR-PRAC-01-verification.txt`
- Build gate this batch: focused backend/data/security checks only; no broad
  frontend or 704-test rerun unless a changed dependency requires it.
- Active root: `app/`, `tests/`, Demo PostgreSQL
- Source links: `plans/next-session-handoff.md`;
  `segments/HR-03-payroll.md`;
  `segments/HR-EMP-02F-B-D02-A-postgresql-demo-foundation.md`; live
  `app/demo/production_environment.py`, `app/hr/payroll_service.py`, and tests.
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-PRAC-01-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: `gpt-5.6-sol`
- Planned API reasoning effort: medium
- Planned reasoning mode: standard
- Planned surface setting: medium
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: unavailable
- Actual model variant: unavailable
- Actual model ID: unavailable
- Actual API reasoning effort: unavailable
- Actual reasoning mode: standard
- Actual surface setting: unavailable
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: the code change is small and sequential, but Demo RBAC,
  payroll evidence, and maker-checker boundaries require the security-capable
  route and deterministic PostgreSQL proof.
- Routing fallback: stop if the active surface cannot safely preserve the
  existing RBAC, RLS, payroll, or localization boundaries; do not fall back to
  a lower-capability route for security adjudication.
- Routing escalation condition: source conflict, migration requirement,
  statutory-rule requirement, cross-tenant ambiguity, or repeated focused-test
  failure.
- Routing evidence path: `docs/evidence/HR-PRAC-01-verification.txt`
- Routing deviation: exact runtime model/effort provenance was unavailable under
  existing finding X-002; the requested single-agent route and scope guard were
  preserved.
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: Codex
- Root synthesis evidence path: `docs/evidence/HR-PRAC-01-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded single-agent batch; stop before schema migrations,
  real-country/statutory data, bank simulation, D02-B, or deferred D02-A polish.
- Verify command: focused production-Demo unit/security tests, PostgreSQL HR
  tests, seed/verify replay, login/RBAC denial, Employee Directory, Employment
  Context, Payroll lists, calculation, approval and Finance-posting smoke.

## Pre-development gate

- [x] Active docs and source hierarchy identified; live code/config/tests win
  implementation ties, while locked product docs retain intent authority.
- [x] The source links resolve to active files. This owner-directed practice
  slice is not a new Blueprint segment and does not require a BUILD_READY marker.
- [x] Verification gates selected for PostgreSQL state, RBAC allow/deny,
  tenant/company scope, Payroll lifecycle, Finance posting, and fail-closed
  localization.
- [x] Deterministic verify command and evidence path recorded.
- [x] Loop, runtime, Sol/medium/standard route, single-agent mode, fallback,
  escalation, usage guard, and closeout files recorded.
- [x] No worker, saved workflow, subagent, or Ultra prerequisites apply.
- [x] Existing waivers remain bounded: X-002 prevents audit-grade runtime model
  provenance, and D02-A-W01 defers visual review. Neither blocks backend Demo
  practice readiness.
- [x] Q-007/Q-010 remain hard gates: September practice stays country-neutral;
  October Employment Context remains blocked on jurisdiction evidence.
- [x] Gate result: READY WITH WAIVERS.

## Batch summary

- Ship-ready: the isolated PostgreSQL Demo is ready for country-neutral
  HR/Payroll practice, with the September period intentionally left open.
- Must-fix: none remaining in this bounded practice slice.
- Redesign / rework candidates: none; no environment or Payroll redesign.
- Open questions for the user: none; the handoff and live authorities determine
  the smallest safe slice.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-PRAC-01-01 Demo HR/Payroll RBAC | `app/demo/production_environment.py` | done |
| HR-PRAC-01-02 Country-neutral practice seed | `app/demo/production_environment.py` | done |
| HR-PRAC-01-03 Database-authoritative verifier | same | done |
| HR-PRAC-01-04 Focused regressions and live practice flow | `tests/`; candidate runtime | done |
| HR-PRAC-01-05 Evidence and handoff | evidence/progress/memory/handoff | done |

## Boundaries

- Seed only production-authority records with stable Demo identifiers.
- Do not add or activate a localization pack, tax rate, statutory claim, or
  bank instruction.
- Keep maker-checker rules, company authorization, RLS, and Finance posting
  intact; Demo users must switch actors where separation of duties requires it.
- Do not change schema, Payroll domain semantics, public API contracts, web UI,
  D02-B, or deferred D02-A Back/Forward behavior.

## Completion gate

- [x] Demo HR actor has only the existing approved HR/Payroll permissions and
  cross-company/tenant access remains denied.
- [x] PostgreSQL contains the deterministic locked attendance input, active
  policy/component/structure, approved salary and open September practice period.
- [x] Replay is idempotent and verification reads the practice chain from the
  database rather than trusting constants.
- [x] A real login can read HR/Payroll, calculate, review/approve with separate
  actors, prepare/post through Finance, and retain fail-closed statutory behavior.
- [x] Focused test results and residual waivers are recorded in the evidence,
  progress, memory and next handoff.

## Closeout notes

- Production-only Demo RBAC gives `demo.hr` the bounded HR/Payroll catalog;
  `demo.viewer` and cross-company requests remain denied.
- PostgreSQL owns and verifies the complete September practice chain. The
  country-neutral period predates localization enforcement and activates no
  statutory pack or legal claim.
- Finance journal create/post authorization now carries the journal company to
  the existing repository gate. The untouched practice seed is reconciled to
  a posting-safe amount without weakening Finance approval thresholds.
- A rollback-only exercise reached calculated, under-review, approved,
  posting-ready and posted states through the real Finance adapter, then
  returned the candidate to open/run 0 with no results or proposals.
- Waivers retained: X-002 runtime provenance, D02-A-W01 visual review, Q-007
  real statutory rules, and Q-010 production localization evidence.
