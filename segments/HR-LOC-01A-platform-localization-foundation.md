# HR-LOC-01A — Platform Localization Schema and Reference Model

- Status: `closed with waivers`
- Theme: country-neutral, multi-jurisdiction Platform data foundation
- Session cap: 4 tightly coupled Platform/data items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01A-verification.txt`
- Build gate this batch? yes — production migration, tenant isolation, immutable evidence, and rollback
- Active root: `app/`
- Source links: `plans/2026-09-28-hr-loc-01-localization-framework.md`, `docs/superpowers/specs/2026-09-28-hr-payroll-multi-jurisdiction-production-design.md`, live Platform PostgreSQL migrations/tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01A-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider: Codex
- Endpoint class: native
- Planned model family: gpt-5.6
- Planned model variant: sol
- Planned model ID: `gpt-5.6-sol`
- Planned API reasoning effort: high
- Planned reasoning mode: standard
- Planned surface setting: high
- Planned delegation mode: single
- Planned max concurrent subagents: n/a
- Actual model family: unavailable from runtime
- Actual model variant: unavailable from runtime
- Actual model ID: unavailable from runtime
- Actual API reasoning effort: unavailable from runtime
- Actual reasoning mode: unavailable from runtime
- Actual surface setting: unavailable from runtime
- Actual delegation mode: single
- Actual max concurrent subagents: n/a
- Routing rationale: migration ordering, hierarchy/dependency constraints, forced RLS, immutable pack evidence, and preservation-safe rollback are tightly coupled and security-sensitive.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for migration or tenant-isolation adjudication.
- Routing escalation condition: destructive rollback behavior, cross-tenant visibility, migration-order contradiction, or a requirement to embed country law.
- Routing evidence path: `docs/evidence/HR-LOC-01A-verification.txt`
- Routing deviation: X-002 — exact runtime route fields are not exposed; no worker or fallback is used.
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single agent
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-LOC-01A-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded Platform/data slice; stop before HR schema, APIs, UI, payroll integration, or real jurisdiction rules
- Verify command: `python scripts/verify_postgres_platform.py`; `python -m unittest tests.unit.test_platform_localization tests.migration.test_platform_localization_migration -v`; `python scripts/verify.py unit migration`; `python -m compileall -q app scripts tests`; `git diff --check`

## Pre-development gate

- [x] Active sources and tie-breaker identified: latest owner approval, live code/config/tests, approved HR-LOC plan/design, then ledgers.
- [x] Archived and dated assessments are evidence only; live implementation wins implementation ties.
- [x] Scope is bounded to HR-LOC-01A and the Platform/data lane.
- [x] Source links resolve to approved plans and live Platform paths.
- [x] This is not a Blueprint-backed segment; no `BUILD_READY` marker is required.
- [x] Verification gates selected: Platform unit, production PostgreSQL, local migration registry/provisioning, RLS, hierarchy/dependency integrity, immutability, clean/populated rollback, compile, and diff checks.
- [x] Baseline `python scripts/verify_postgres_platform.py` passed 12/12 on 2026-09-28.
- [x] Loop/runtime/model intake is recorded; no worker, subagent, saved workflow, or external credential is required.
- [x] Q-003/Q-004/Q-006 block managed production promotion, not the generic schema. Q-007/HR03-F03 block real statutory packs, not this country-neutral framework.
- [x] Existing handoff drift naming FIN-BANK-01 is superseded by the owner's approved HR-only roadmap and corrected before implementation.
- [x] Gate result: **READY WITH WAIVERS**.

## Acceptance

- Country, jurisdiction, legal-entity, pack/version/dependency, company legal profile, registration, payroll configuration, activation, and localization-control structures match the approved plan.
- The production Platform migration is version 3; the shared local/demo migration uses the next globally unique version.
- Existing companies receive only `legacy_unlocalized`; newly created companies receive `localization_required` atomically.
- Global reference/artifact tables are readable but not writable by ordinary application roles.
- Tenant tables have forced RLS and tenant/company-aware references.
- Approved/active pack content is immutable; hierarchy and dependency cycles are rejected.
- Effective ranges and active company profiles/configurations/activations cannot overlap.
- Clean rollback succeeds; rollback refuses protected or populated localization data.
- No real country, province/state, tax, contribution, leave, holiday, overtime, or other statutory rule data is added.

## Do not do yet

- Do not add HR work-location/rule/snapshot tables (HR-LOC-01B).
- Do not add pack import tooling (01C), APIs/RBAC/audit actions (01D), resolution (01E), payroll integration (01F), or UI (01G).
- Do not refactor Finance tax packs or add Pakistan/Punjab logic.
- Do not claim statutory compliance or production readiness.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01A-01 Domain/reference model | `app/platform/localization.py`, unit tests | done |
| HR-LOC-01A-02 Production Platform migration v3 | `app/platform/postgres/migrations/0003_localization_foundation.*.sql`, registry, PostgreSQL tests | done |
| HR-LOC-01A-03 Local/demo Platform migration v16 | `app/platform/migrations/0016_localization_foundation.*.sql`, registry, migration tests | done |
| HR-LOC-01A-04 Verification and closeout | evidence, ledgers, progress, handoff | done |

## Blockers and waivers

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Security/platform owner | Q-003 managed identity | Select and verify provider controls | Managed identity lifecycle gates pass |
| Security/data/operations owner | Q-004/Q-006 KMS, protected archive, HA/recovery | Select deployment controls and prove them | Deployment/security/recovery evidence passes |
| Payroll/legal owner | Q-007/HR03-F03 real statutory localization | Approve the first jurisdiction, sources, ownership, and vectors | A separate country-pack slice is approved |

These waivers do not affect the deterministic generic schema, so development may begin. The runtime continues to fail closed at the deferred boundaries.

## Item notes

### HR-LOC-01A-01 — Domain/reference model

- Added immutable Python values for countries, hierarchical jurisdictions,
  legal-entity types, localization packs/versions/dependencies, company legal
  profiles, masked registrations, explicit payroll configuration, activation,
  and legacy/required controls.
- Validation is country-neutral and fails closed on invalid codes, dates,
  version hashes, lifecycle evidence, plaintext-looking registration values,
  or implicit custom schedules.
- Evidence: 6 focused unit tests; canonical unit category 267/267.
- Decision: ship-ready for the bounded schema/model scope.

### HR-LOC-01A-02 — Production Platform migration v3

- Added 11 localization tables with hierarchy/dependency constraints, effective
  ranges, non-overlap exclusions, forced RLS on tenant data, publisher-managed
  global catalogs, immutable approved pack content, compatible activations,
  and preservation-safe rollback.
- Existing companies receive only `legacy_unlocalized`; the migration briefly
  relaxes owner-side `FORCE RLS` inside its transaction solely for this
  deterministic backfill and restores it before commit. New companies receive
  `localization_required` from an atomic organization-unit trigger.
- Security review closed lifecycle-downgrade/edit and control-row-deletion
  bypasses before closeout.
- Evidence: 18/18 disposable Platform PostgreSQL tests.
- Decision: ship-ready with external production-operation waivers.

### HR-LOC-01A-03 — Local/demo Platform migration v16

- Added the corresponding globally unique migration, local registry functions,
  package data, and Demo provisioning order. It preserves the existing local
  composition while enforcing the same hierarchy, dependency, activation,
  lifecycle, overlap, and rollback semantics relevant to localization.
- No country or statutory rule row is seeded. Q-010 owns the controlled,
  provenance-hashed country/subnational/legal-entity reference release before
  company configuration APIs can activate.
- Evidence: 106/106 migration tests and the Demo-inclusive e2e category pass.
- Decision: ship-ready with Q-010 explicitly deferred.

### HR-LOC-01A-04 — Verification and closeout

- Canonical backend: 648/648 across unit, integration, contract, security, e2e,
  and migration.
- Live PostgreSQL: Platform 18/18; HR 6/6.
- Compile, dependency consistency, Compose validation, diff hygiene, and
  Forgeflow portability pass after closeout updates.
- Browser/frontend checks were not selected because this slice changes no API
  contract, route, generated client, or user interface.
- Decision: close with Q-003/Q-004/Q-006/Q-007/Q-010 and X-002 waivers; do not
  open HR-LOC-01B without owner approval.

## Completion gate

- [x] All four items are complete with focused evidence.
- [x] Production and local/demo migration ordering is deterministic and collision-free.
- [x] Positive, negative, cross-tenant, immutability, concurrency, and rollback tests pass.
- [x] No country-specific statutory data or payroll branch exists.
- [x] Findings, decisions, improvements, progress, memory, and handoff reflect verified truth.
- [x] Actual verification results and routing provenance are recorded.
- [x] Exactly one next step is named: owner review/approval for HR-LOC-01B.

## Closeout

- Result: **closed with waivers** on 2026-09-28.
- Evidence: `docs/evidence/HR-LOC-01A-verification.txt`.
- Route: single-agent Codex; exact model/effort/surface unavailable under X-002;
  no fallback, worker, subagent, or saved workflow used.
- Residual risk: Q-010 must close before an active company-country selection
  workflow is exposed; real statutory packs remain blocked by Q-007/HR03-F03.
- Next step: owner review and explicit approval to open HR-LOC-01B.
