# HR-LOC-01F — Country-Neutral Payroll Provider and Statutory Snapshots

- Status: `closed with waivers`
- Theme: deterministic payroll localization consumption and immutable evidence
- Session cap: 4 tightly coupled Payroll/HR/API/security/migration items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01F-verification.txt`
- Build gate this batch? yes — payroll money, PostgreSQL migration, RBAC/RLS,
  immutable evidence, and historical recalculation
- Active root: `app/`
- Source links: approved HR-LOC master plan and production design; completed
  01A–01E; approved 01F architecture amendment; live HR-03 payroll code/tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01F-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Actual runtime route: unavailable from runtime; X-002 recorded at closeout
- Routing rationale: payroll amounts, historical evidence, migration safety,
  tenant isolation, and authorization are tightly coupled and high risk.
- Routing fallback: stop for owner review if the current high-capability route
  cannot safely complete the migration/security gate; no lower-capability route.
- Routing escalation condition: any required Finance redesign, country branch,
  cross-border execution, activation-policy weakening, or destructive migration.
- Routing evidence path: `docs/evidence/HR-LOC-01F-verification.txt`
- Routing deviation: X-002 only; exact runtime route is not exposed
- Ultra workstream map / shared-write isolation: n/a; single agent
- Root synthesis owner / evidence: active Codex orchestrator /
  `docs/evidence/HR-LOC-01F-verification.txt`
- Worker task packet / output / saved workflow: n/a
- Usage guard: one bounded 01F slice; stop before 01G; no real-country rules
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate (before status `in progress`)

- [x] Active docs, archived docs, and tie-breaker source identified.
- [x] Source links resolve to approved docs, prior segments, and live code/tests.
- [x] Traceability matrix checked; HR-LOC is a productionization amendment.
- [x] Backend/API, contract, auth/security, DB migration, and docs gates selected.
- [x] Deterministic verification and evidence path recorded.
- [x] Runtime/model/delegation intake recorded; no worker or subagent selected.
- [x] Q-007, Q-010, Q-004, cross-border, and production-operation waivers retained.
- [x] Owner separately approved the focused schema/core amendment required by
  the inspected HR-03 constraints.
- [x] Gate result: READY WITH WAIVERS — the open legal/reference/operations
  gates block real packs and production claims, but not synthetic framework work.

## Batch summary

- Ship-ready: country-neutral integration and synthetic proof complete
- Must-fix: none inside 01F
- Redesign / rework candidates: none beyond the approved focused amendment
- Open questions for the user: none

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01F-01 — forward schema and guarded rollback | `app/hr/postgres/migrations/0009_*` | completed |
| HR-LOC-01F-02 — provider/executor and Payroll orchestration | `app/hr/localization/`; `app/hr/payroll*` | completed |
| HR-LOC-01F-03 — protected snapshot API and evidence | `app/api/`; `contracts/`; tests | completed |
| HR-LOC-01F-04 — security/product review and closeout | tests, evidence, ledgers, handoff | completed |

## Acceptance boundary

- Payroll core remains country-neutral and contains no jurisdiction lookup.
- Localized companies fail closed without one approved, effective,
  dependency-valid deterministic rule set.
- Legacy-unlocalized results remain readable and do not fabricate snapshots.
- Every localized calculation seals exact pack/rule/version/input/result
  evidence; reruns create new results and snapshots.
- Reproduce-original uses sealed historical evidence; corrected recalculation is
  explicit, reasoned, separately authorized, and uses rules effective for the
  payroll period.
- Employer contributions are neutral typed outputs with balanced generic journal
  lines; no Finance schema or country formula changes are in scope.
- No real-country catalog, pack, law, AI inference, 01G UI, or cross-border
  execution is added.

## Completion gate

- [x] Every item has implementation and verification evidence.
- [x] Forward/apply, clean rollback/reapply, and populated rollback refusal pass.
- [x] Positive, failure-closed, historical, cross-company/tenant, RBAC/RLS,
  audit, idempotency, and accounting regressions pass.
- [x] OpenAPI snapshot and generated consumers remain consistent.
- [x] Country-neutrality and real-country-rule scans pass.
- [x] Exact verification is recorded in the evidence file.
- [x] Ledgers, progress, memory, master plan, and handoff are updated.
- [x] Commit is pushed under the owner's standing GitHub instruction.
- [x] 01G remains closed pending explicit approval.
