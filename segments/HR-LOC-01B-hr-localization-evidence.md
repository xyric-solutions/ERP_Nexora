# HR-LOC-01B — HR Localization Schema and Immutable Evidence

- Status: `closed with waivers`
- Theme: country-neutral HR jurisdiction context and immutable statutory evidence
- Session cap: 4 tightly coupled HR/data items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01B-verification.txt`
- Build gate this batch? yes — production migration, tenant isolation, immutable evidence, and rollback
- Active root: `app/`
- Source links: `plans/2026-09-28-hr-loc-01-localization-framework.md`, `docs/superpowers/specs/2026-09-28-hr-payroll-multi-jurisdiction-production-design.md`, `docs/business/hr-core-foundation-design.md`, `segments/HR-01-hr-foundation.md`, live HR/Platform PostgreSQL migrations and tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01B-verification.txt`
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
- Routing rationale: migration ordering, composite tenant/company integrity, forced RLS, evidence immutability, and preservation-safe rollback are tightly coupled and security-sensitive.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for migration or tenant-isolation adjudication.
- Routing escalation condition: destructive rollback behavior, cross-tenant/company visibility, migration-order contradiction, mutable approved evidence, or a requirement to embed country law.
- Routing evidence path: `docs/evidence/HR-LOC-01B-verification.txt`
- Routing deviation: X-002 — exact runtime route fields are not exposed; no fallback, worker, or delegation was used
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single agent
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-LOC-01B-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded HR/data slice; stop before importer, APIs, resolver, payroll integration, UI, or real jurisdiction rules
- Verify command: `python scripts/verify_postgres_hr.py`; focused HR localization unit/PostgreSQL tests; canonical backend/PostgreSQL/compile/dependency/Compose/diff gates from the approved plan

## Pre-development gate

- [x] Active sources and tie-breaker identified: latest owner approval, live code/config/tests, approved HR-LOC plan/design, then execution ledgers.
- [x] Archived and older grouped roadmaps are evidence only; the approved HR-LOC-01 sub-slice plan governs scope.
- [x] Scope is bounded to HR-LOC-01B and the HR/data lane; 01C–01H remain closed.
- [x] Source links resolve to approved plans, HR-01 architecture, and live Platform/HR migration paths.
- [x] This is not a Blueprint-backed segment; no `BUILD_READY` marker is required.
- [x] Verification gates selected: HR domain models, migration order, forward/idempotent/clean rollback, populated rollback refusal, forced RLS, tenant/company FKs, non-overlap, approved rule immutability, snapshot immutability, compile, and diff checks.
- [x] Baseline `python scripts/verify_postgres_hr.py` passed 6/6 on 2026-09-28.
- [x] Platform migration 3 is complete and pushed at `ee6ef3f77e482b266a0358b30b289a0658180634`.
- [x] Loop/runtime/model intake is recorded; no worker, subagent, saved workflow, external credential, API, or UI work is required.
- [x] Q-003/Q-004/Q-006 block managed production promotion. Q-007 blocks real statutory packs and Q-010 blocks active reference-driven company setup; none blocks this empty generic schema.
- [x] Gate result: **READY WITH WAIVERS**.

## Acceptance

- HR migration version 6 requires Platform migration version 3.
- Work-location profiles and jurisdiction overrides use tenant/company-aware references, effective ranges, validation, and forced RLS.
- Rule identities, rule versions, and test vectors reference Platform localization packs/versions and contain no real-country rule data.
- Approved rule content and vectors cannot be changed or deleted; ordinary application roles cannot mutate the global rule catalog.
- Payroll statutory snapshots and normalized pack/rule references are append-only and tied to one employee payroll result.
- Clean rollback succeeds; populated 01B tables block destructive rollback.
- Existing HR/Payroll behavior and contracts remain unchanged.

## Do not do yet

- Do not add bundle validation/import (01C), setup/APIs/RBAC actions (01D), resolution/override services (01E), payroll orchestration (01F), UI (01G), or full-story closeout (01H).
- Do not add Pakistan, Punjab, another jurisdiction, statutory rates, formulas, holidays, benefits, or registration data.
- Do not change `app/hr/payroll.py`, Finance tax behavior, or unrelated modules.
- Do not expose tenant HTTP mutation of system statutory rules.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01B-01 HR localization domain models | `app/hr/localization/`, unit tests | done |
| HR-LOC-01B-02 Production HR migration version 6 | `app/hr/postgres/migrations/0006_payroll_localization.*.sql`, registry | done |
| HR-LOC-01B-03 PostgreSQL RLS/immutability/rollback proof | HR PostgreSQL tests and verifier | done |
| HR-LOC-01B-04 Security/product review and closeout | evidence, ledgers, progress, memory, handoff | done |

## Blockers and waivers

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Security/platform owner | Q-003 managed identity | Select and verify provider controls | Managed identity lifecycle gates pass |
| Security/data/operations owner | Q-004/Q-006 KMS, protected archive, HA/recovery | Select deployment controls and prove them | Deployment/security/recovery evidence passes |
| Payroll/legal owner | Q-007/HR03-F03 real statutory localization | Approve the first jurisdiction, sources, ownership, and vectors | A separate country-pack slice is approved |
| Platform/localization owner | Q-010 active reference release | Approve a provenance-hashed reference bundle | Reference import and setup gates pass |

These waivers do not affect an empty generic HR schema. Runtime behavior remains unchanged and fails closed at deferred boundaries.

## Item notes

### HR-LOC-01B-01 — HR localization domain models

- Added frozen, I/O-free values for work-location jurisdiction profiles,
  employee overrides, typed statutory rules/versions/vectors, and ordered
  payroll snapshot evidence.
- Validation is country-neutral and rejects invalid effective ranges, missing
  approval/SoD evidence, unsupported deterministic rule types/stacking,
  malformed hashes, and unordered snapshot references.
- Evidence: 3/3 focused unit tests; 270/270 canonical unit category.
- Decision: ship-ready for the bounded schema/value scope.

### HR-LOC-01B-02 — Production HR migration version 6

- Added eight HR localization/evidence tables after Platform v3 and HR v5.
- Tenant configuration/evidence tables use composite references and forced RLS;
  global rule tables are publisher-managed and tied to Platform pack versions.
- Effective ranges, approval evidence, rule/pack compatibility, exact
  supersession, and snapshot sealing are database-enforced.
- Decision: ship-ready with later importer/service boundaries explicitly closed.

### HR-LOC-01B-03 — PostgreSQL security and preservation proof

- Live PostgreSQL tests prove ordering, atomic failure, idempotency, clean
  rollback/reapply, populated rollback refusal, RLS, scope, non-overlap,
  publisher denial, approved-rule immutability, and sealed snapshot immutability.
- Evidence: 9/9 HR and 18/18 Platform PostgreSQL tests.
- Decision: no critical or major schema/security finding remains in 01B.

### HR-LOC-01B-04 — Verification and closeout

- Canonical backend: 651/651. Frontend regression: 163 behavior, 18 a11y,
  API drift/lint/build pass. Compile, dependency, Compose, diff, portability,
  and country-neutrality scans pass.
- Security review confirms no API/RBAC/log/provider expansion. The trusted
  importer role and snapshot payload builder stay owned by 01C/01F.
- Decision: close with external/Q-007/Q-010/X-002 waivers; await explicit 01C approval.

## Completion gate

- [x] All four items have focused evidence and notes.
- [x] Migration ordering, idempotency, tenant/company isolation, immutability, and rollback guards pass on disposable PostgreSQL.
- [x] No API, UI, resolver, importer, payroll-core branch, or country-specific data was added.
- [x] Security/RBAC/privacy and product verification reviews are recorded.
- [x] Canonical regression gates and hygiene checks pass.
- [x] Evidence, findings, progress, memory, and handoff reflect verified truth.
- [x] Commit/push delivery is included in the owner closeout report.
- [x] Exactly one next step is named: owner review/approval for HR-LOC-01C.

## Closeout

- Result: **closed with waivers** on 2026-09-28.
- Evidence: `docs/evidence/HR-LOC-01B-verification.txt`.
- Route: single-agent Codex; exact model/effort/surface unavailable under X-002;
  no fallback, worker, subagent, or saved workflow used.
- Next step: owner review and explicit approval to open HR-LOC-01C.
