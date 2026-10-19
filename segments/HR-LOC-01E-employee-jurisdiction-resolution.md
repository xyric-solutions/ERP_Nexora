# HR-LOC-01E — Employee/Work-Location Resolution and Overrides

- Status: `closed with waivers`
- Theme: deterministic, effective-dated employee jurisdiction resolution
- Session cap: 4 tightly coupled HR/API/security/migration items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01E-verification.txt`
- Build gate this batch? yes — jurisdiction authority, override approval, RLS,
  audit, migration amendment, and fail-closed resolution
- Active root: `app/`
- Source links: approved HR-LOC master plan and production design,
  `docs/HR-LOC-01E-generalized-jurisdiction-amendment.md`, completed 01A–01D,
  live HR-01 assignment/work-location code and tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01E-verification.txt`
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
- Routing rationale: the Platform amendment, effective segmentation, hierarchy/
  dependency resolution, company-scoped authorization, SoD, and audit are
  tightly coupled and security-sensitive.
- Routing fallback: remain on the current capable route; stop rather than lower
  capability for jurisdiction authority, migration, or access-control decisions.
- Routing escalation condition: a second approved-architecture conflict,
  cross-country execution, inferred jurisdiction, tenant/company leak,
  activation bypass, non-atomic audit, or required payroll/UI change.
- Routing evidence path: `docs/evidence/HR-LOC-01E-verification.txt`
- Routing deviation: X-002 — exact runtime route fields are not exposed; no
  fallback, worker, or delegation is used
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single agent
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-LOC-01E-verification.txt`
- Worker task packet/output/saved workflow: n/a
- Usage guard: one bounded 01E slice; stop before payroll-provider/snapshot
  integration, UI, real reference releases, real statutory packs, or cross-
  border employment implementation
- Verify command: focused unit/integration/contract/security/PostgreSQL/
  migration tests; canonical backend; frontend drift/lint/test/a11y/build;
  compile/dependency/Compose/diff/portability gates

## Pre-development gate

- [x] Latest owner instruction, live code/config/tests, approved amendment and
  HR-LOC plan/design, then execution ledgers define the source hierarchy.
- [x] Existing employee identity, assignment, company and work-location master
  concepts are reused; no duplicate employee/location/legal-employer model.
- [x] HR migration 6 already owns work-location profiles, overrides, statutory
  rules and forced RLS; only the approved Platform activation validator requires
  a new forward migration.
- [x] Existing HR supports one effective assignment at a time with sequential
  history; 01E preserves that boundary and segments historical transfers.
- [x] The 01D registered-jurisdiction equality conflict was reported, separately
  approved, and recorded in the generalized amendment.
- [x] Q-007/Q-010 block real data, rules, compliance and production activation;
  Q-004 remains the sensitive-registration boundary. Synthetic test packs only.
- [x] Verification gates cover same/different same-country jurisdiction,
  national-only, transfer segmentation, scoped overrides, cross-country denial,
  coverage/dependency/conflict failures, RBAC/SoD, audit, RLS and rollback.
- [x] This is not a Blueprint-backed segment; no `BUILD_READY` marker is needed.
- [x] Baseline is clean at `2e16d6f9ef66765550dca00838c1d07faacaae40`;
  Platform PostgreSQL passed 21/21 and HR PostgreSQL passed 17/17.
- [x] Gate result: **READY WITH WAIVERS**.

## Acceptance

- Work-location profiles and scoped overrides reuse existing HR masters,
  employees and assignments and preserve effective history.
- Override requester cannot self-approve; rejected/revoked/unapproved evidence
  never affects resolution.
- Resolver segments a requested period at every relevant effective boundary,
  produces national-to-leaf jurisdiction and dependency order, and reports safe
  evidence and coverage gaps without calculating payroll.
- Same-country work jurisdiction may differ from registered jurisdiction only
  through an explicit compatible activation.
- Cross-country work or override jurisdiction fails closed with the future-model
  extension error; no inference or global-pack bypass exists.
- Identified context, pack availability, approved/active state, and compliance
  status remain distinct. Compliance is never claimed by 01E.
- Exact RBAC, company scope, forced RLS, idempotency and atomic immutable audit
  hold at HTTP, service and persistence boundaries.

## Do not do

- Do not implement 01F payroll-provider/snapshot integration, 01G UI or 01H.
- Do not add real country/jurisdiction references or statutory rules.
- Do not implement cross-border employment or infer jurisdiction from indirect
  signals.
- Do not change payroll core, Finance, unrelated HR or Platform behavior.
- Do not weaken Q-007, Q-010, Q-004, importer evidence or activation policy.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01E-01 Generalized same-country activation migration | Platform production/local migration registries and SQL | done |
| HR-LOC-01E-02 Work-location/override repository, service, RBAC and audit | `app/hr/localization/`, HR PostgreSQL service | done |
| HR-LOC-01E-03 Deterministic resolver and protected APIs/contracts | resolver, API/OpenAPI, production composition | done |
| HR-LOC-01E-04 Security/product verification and closeout | tests, evidence, ledgers, memory, handoff | done |

## Blockers and waivers

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Payroll/legal owner | Q-007 real statutory localization/compliance | Approve the first jurisdiction, sources, ownership and vectors | Official vectors, rounding, retroactivity and reconciliation pass |
| Platform/localization owner | Q-010 real reference release/production activation | Approve a provenance-hashed reference bundle | Complete catalog coverage and fail-closed activation pass |
| Security/data owner | Q-004 full sensitive identifiers | Approve KMS/vault boundary | Encryption, access, rotation and recovery pass |
| Product/legal/platform owners | Cross-border employment | Approve explicit legal-employment/payroll model | Governed arrangement, scope, registration, activation and audit tests pass |

These waivers permit only the generic, synthetic-test-proven 01E mechanism.

## Completion gate

- [x] All four items have focused evidence and notes.
- [x] New migrations are forward/idempotent, safely reversible, and preserve
  existing activations.
- [x] Resolver and override paths are deterministic, atomic, audited,
  tenant/company safe and idempotent.
- [x] Same-country difference works and cross-country cases fail closed.
- [x] OpenAPI/generated client drift checks pass; no UI or payroll integration.
- [x] Canonical regression and hygiene gates pass.
- [x] Evidence, ledgers, progress, memory and handoff reflect verified truth.
- [x] Commit/push are included in the owner closeout report.
- [x] Exactly one next step remains owner review/approval; 01F stays closed.
