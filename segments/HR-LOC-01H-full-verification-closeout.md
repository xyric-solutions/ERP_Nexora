# HR-LOC-01H — Full Verification and Closeout

- Status: `closed with waivers`
- Theme: adversarial end-to-end verification and truthful HR-LOC-01 closeout
- Session cap: 4 tightly coupled verification/evidence items
- Planned evidence path: `docs/evidence/HR-LOC-01H-verification.txt`
- Build gate this batch? yes — full backend, PostgreSQL, Web, migration,
  security, portability, and country-neutrality verification
- Active roots: tests and Forgeflow closeout documents; application code only
  if verification exposes a genuine defect within the approved 01A–01G scope
- Source links: approved HR-LOC master plan; completed 01A–01G implementation,
  design notes and evidence; live code/contracts/tests; current gate ledgers
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / sol / `gpt-5.6-sol`
- Planned API reasoning effort / mode / surface: high / standard / high
- Planned delegation mode / maximum subagents: single / n/a
- Routing rationale: the final proof crosses Platform, HR, Payroll, Security,
  PostgreSQL, API, UI, migration, dependency, and portability boundaries.
- Routing fallback: leave 01H open and report an exact blocker if any closeout
  criterion fails or a migration would be required.
- Routing escalation condition: material architecture conflict, schema defect,
  real statutory data, activation-policy weakening, cross-border execution, or
  Payroll-core redesign.
- Routing evidence path: `docs/evidence/HR-LOC-01H-verification.txt`
- Worker task packet / output / saved workflow: n/a
- Usage guard: one bounded 01H verification slice; no post-01H work
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Approved master plan, 01A–01G implementation/design/evidence, live HR and
  Payroll foundations, tests, CI/build commands, and gate/waiver records read.
- [x] Source hierarchy reconciled: latest owner instruction, then live code,
  contracts and tests, then locked intent, then execution ledgers.
- [x] Existing deterministic chain and authoritative boundary confirmed.
- [x] Twenty required scenarios mapped for executable proof; targeted coverage
  will be added only if the existing suite leaves a material verification gap.
- [x] Full backend, PostgreSQL, Web, accessibility, contract, migration,
  dependency, Compose, portability and country-neutrality gates selected.
- [x] No material architectural conflict found.
- [x] Q-007, Q-010, Q-004 and the future cross-border model remain external
  gates and are explicitly outside implementation scope.
- [x] No worker/subagent selected; verification and evidence are sequential.
- [x] Gate result: READY WITH WAIVERS — closeout may verify the generic
  framework but cannot claim real statutory compliance or production activation.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01H-01 — 20-scenario traceability and end-to-end proof | tests and evidence matrix | done |
| HR-LOC-01H-02 — security, RLS, migration and neutrality review | PostgreSQL/security/scans | done |
| HR-LOC-01H-03 — complete backend/Web/build regression | canonical and lane-specific gates | done |
| HR-LOC-01H-04 — evidence, ledgers, handoff, commit and synchronization | closeout documents | done |

## Acceptance boundary

- Verify the authoritative company/employment/work-location/resolution/pack/
  rule/payroll/snapshot/API/UI chain without creating duplicate decision logic.
- Use synthetic country-neutral fixtures only.
- Preserve fail-closed activation, missing evidence, cross-country, approval,
  effective-date, RLS, RBAC, audit, idempotency and immutability controls.
- Do not add a migration unless a genuine defect is found; stop for owner review
  before creating or applying one.
- Do not implement real statutory packs, Q-007, Q-010, Q-004, cross-border
  execution, new localization features, or post-01H work.
- Do not claim statutory compliance or full ERP production readiness.

## Completion gate

- [x] All 20 scenarios have current executable evidence and pass.
- [x] End-to-end data authority and country neutrality are verified.
- [x] Security/RLS/RBAC/audit/idempotency and immutable evidence pass.
- [x] Migration apply/replay/rollback and no-schema-drift checks pass.
- [x] Full backend, PostgreSQL, Web, accessibility, type, lint, build, contract,
  dependency, Compose and portability gates pass.
- [x] Evidence uses IMPLEMENTED / VERIFIED / WAIVED / BLOCKED BY EXTERNAL GATE /
  NOT STARTED truthfully and retains all external gates.
- [x] Ledgers, progress, memory, master plan and handoff are reconciled.
- [x] Bounded diff is committed and pushed under the owner's standing instruction.
