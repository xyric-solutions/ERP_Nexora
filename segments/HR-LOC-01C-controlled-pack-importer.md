# HR-LOC-01C — Controlled Localization Pack Validator/Importer

- Status: `closed with waivers`
- Theme: country-neutral, deterministic, reviewed localization-pack publication
- Session cap: 4 tightly coupled localization/compliance items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01C-verification.txt`
- Build gate this batch? yes — privileged PostgreSQL writes, immutable evidence, and rollback
- Active root: `app/`
- Source links: `plans/2026-09-28-hr-loc-01-localization-framework.md`, `docs/superpowers/specs/2026-09-28-hr-payroll-multi-jurisdiction-production-design.md`, completed `HR-LOC-01A`/`HR-LOC-01B`, live Platform/HR PostgreSQL migrations and tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01C-verification.txt`
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
- Routing rationale: canonical artifact validation, least-privilege publisher access, immutable approval evidence, and transactional PostgreSQL import are tightly coupled and security-sensitive.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for publisher-boundary or evidence-integrity adjudication.
- Routing escalation condition: publisher access to tenant data, mutable approved evidence, non-atomic import, migration-order conflict, country-specific execution, or activation that bypasses Q-010.
- Routing evidence path: `docs/evidence/HR-LOC-01C-verification.txt`
- Routing deviation: X-002 — exact runtime route fields are not exposed; no fallback, worker, or delegation is used
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single agent
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-LOC-01C-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded importer slice; stop before APIs, setup activation, resolver, payroll integration, UI, reference-data release, or real-country rules
- Verify command: focused unit/import tests; `python scripts/verify_postgres_platform.py`; `python scripts/verify_postgres_hr.py`; canonical backend/compile/dependency/Compose/diff gates

## Pre-development gate

- [x] Active sources and tie-breaker identified: latest owner approval, live code/config/tests, approved HR-LOC plan/design, then execution ledgers.
- [x] Archived and older grouped roadmaps are evidence only; the approved HR-LOC-01 sub-slice plan governs scope.
- [x] Scope is bounded to HR-LOC-01C and the offline localization/compliance tooling lane; 01D–01H remain closed.
- [x] Source links resolve to the approved plan and completed Platform/HR localization migrations, models, and tests.
- [x] This is not a Blueprint-backed segment; no `BUILD_READY` marker is required.
- [x] Verification gates selected: strict structure/parser limits, canonical hashes, source/vector/approval evidence, typed deterministic rules, dependency graph, effective overlap, dry-run, atomic import, idempotency, publisher least privilege, tenant-data denial, immutability, migration rollback/reapply, compile, and diff checks.
- [x] Baseline `python scripts/verify_postgres_platform.py` passed 18/18 and `python scripts/verify_postgres_hr.py` passed 9/9 on 2026-09-28.
- [x] 01A/01B are complete at `b7d267f6f62b81507a9063410acbe230778dfc15` and the worktree was clean.
- [x] Loop/runtime/model intake is recorded; no worker, subagent, saved workflow, HTTP API, UI, or payroll-core work is required.
- [x] Q-007 continues to block real statutory packs and Q-010 continues to block active reference-driven company setup. Synthetic test catalogs and packs are test-only; neither blocker prevents this generic importer.
- [x] Architectural seam: the approved dedicated publisher role requires a narrowly registered database principal because the 01B trigger currently allows only the table owner. This implements, rather than changes, the approved least-privilege boundary.
- [x] Gate result: **READY WITH WAIVERS**.

## Acceptance

- A strict directory-bundle parser validates manifest, sources, rules, and test vectors without executing artifact code.
- Canonical source/content/artifact and per-file hashes are reproducible and tamper-evident.
- Only system-scoped, approved lifecycle imports are allowed; activation remains outside this slice.
- Country/jurisdiction references, exact approved dependencies, acyclic ancestry, rule/version alignment, effective ranges, overlap/supersession, provenance, reviewer/approver separation, and required vector classes fail closed.
- Dry-run performs database-aware validation without writes; trusted import is advisory-locked, transactional, idempotent, and produces a release report.
- A dedicated registered publisher principal can write only controlled pack/rule tables and cannot read tenant HR/payroll data.
- Synthetic national/subnational bundles prove behavior only under an explicit test-environment gate; no real jurisdiction data or rule ships.
- Clean migration rollback/reapply succeeds; populated importer-governance state blocks destructive rollback.

## Do not do

- Do not add real country, subdivision, legal-entity, statutory-rate, formula, holiday, benefit, reporting, or registration data.
- Do not add company setup, activation, tenant authoring, HTTP APIs, resolver behavior, payroll execution, or UI.
- Do not change `app/hr/payroll.py`, Finance tax, or unrelated module behavior.
- Do not bypass Q-007 or Q-010, and do not expose the publisher credential to the application runtime.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01C-01 Strict artifact model/parser/canonical validator | `app/hr/localization/manifest.py`, unit tests/fixtures | done |
| HR-LOC-01C-02 Least-privilege publisher boundary and transactional importer | HR migration 7, `app/hr/localization/importer.py` | done |
| HR-LOC-01C-03 Trusted CLI and PostgreSQL import/security/rollback proof | `app/hr/localization/cli.py`, PostgreSQL tests | done |
| HR-LOC-01C-04 Security/product review and closeout | evidence, ledgers, memory, handoff | done |

## Blockers and waivers

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Payroll/legal owner | Q-007 real statutory localization | Approve the first jurisdiction, authoritative sources, ownership, and vectors in a separate slice | Official vectors, rounding, retroactivity, and reconciliation pass |
| Platform/localization owner | Q-010 active reference release and company setup | Approve a complete provenance-hashed country/subnational/legal-entity bundle | Reference import and setup fail-closed gates pass |
| Security/platform owner | Q-003 managed service identity | Select and verify provider controls | Managed identity lifecycle gates pass |
| Security/data/operations owner | Q-004/Q-006 KMS, archive, HA/recovery | Select deployment controls and prove them | Deployment/security/recovery gates pass |

These waivers do not authorize real data or activation and do not block a test-gated generic importer.

## Item notes

### HR-LOC-01C-01 — Strict artifact model/parser/canonical validator

- Added bounded UTF-8 JSON parsing with exact schemas, duplicate-key/float/
  non-finite/control-character/symlink/unexpected-file rejection.
- Added canonical per-rule, per-vector, source-manifest, content, file, and
  artifact SHA-256 validation.
- Added deterministic validation for all approved rule types, declarative
  applicability, allow-listed stacking, source provenance, SoD approval, and
  required positive/boundary/non-applicable vectors. Safe formulas accept only
  bounded arithmetic AST nodes and declared variables.
- Added synthetic national/subnational directory fixtures. No real country or
  legal rule is present.
- Evidence: 5 focused unit tests plus CLI fixture validation.
- Decision: ship-ready for the bounded artifact-validation scope.

### HR-LOC-01C-02 — Publisher boundary and transactional importer

- Added HR migration 7 with owner-managed publisher registration and immutable,
  completeness-checked release evidence.
- Registration rejects privileged/inherited roles and any unrelated table
  grant. Each operation rechecks scope; publishers cannot read tenant tables or
  write reference catalogs even after an injected direct grant.
- Dry-run performs database-aware reference, ancestry, dependency, lifecycle,
  effective-date, overlap/supersession, and collision checks without writes.
- Import repeats validation under a serializable advisory-locked transaction,
  writes only approved evidence, and is idempotent by artifact hash.
- Evidence: 17/17 HR PostgreSQL tests and resolved HR-LOC-01C-F01.
- Decision: ship-ready for the trusted offline publisher boundary.

### HR-LOC-01C-03 — CLI, migration, and rollback proof

- Added `nexora-localization-pack` validate/dry-run/import/register/revoke
  commands with separate migration-owner and publisher DSNs.
- Added test-only synthetic environment enforcement and default-closed
  production artifact gate.
- Proved clean rollback/reapply, registered-configuration rollback refusal,
  immutable populated-release rollback refusal, and atomic injected failure.
- Editable package/console entry point and operator documentation pass.
- Decision: ship-ready with Q-007/Q-010 still controlling real data/activation.

### HR-LOC-01C-04 — Security/product verification and closeout

- Auth/RBAC/privacy review mapped migration owner, publisher, tenant
  application, and evidence boundaries; no API/session/provider or tenant data
  path was added.
- Product verification passed 656 backend, 18 Platform PostgreSQL, 17 HR
  PostgreSQL, 163 frontend, 18 accessibility, and the 51-route production
  build, plus packaging, compile, dependency, Compose, diff, portability, and
  scope scans.
- Evidence: `docs/evidence/HR-LOC-01C-verification.txt`.
- Decision: close with external Q-003/Q-004/Q-006/Q-007/Q-010 and X-002
  waivers; stop before 01D.

## Completion gate

- [x] All four items have focused evidence and notes.
- [x] Parser, hashing, validation, dry-run, import, idempotency, and atomic-failure tests pass.
- [x] Dedicated publisher writes controlled catalogs only and cannot read tenant tables.
- [x] Migration ordering, clean rollback/reapply, populated rollback refusal, and immutable approved content pass on disposable PostgreSQL.
- [x] No API, UI, resolver, payroll-core branch, setup activation, tenant pack, or real-country data was added.
- [x] Security/RBAC/privacy and product verification reviews are recorded.
- [x] Canonical regression gates and hygiene checks pass.
- [x] Evidence, findings, progress, memory, and handoff reflect verified truth.
- [x] Commit and push are included in the owner closeout report.
- [x] Exactly one next step is owner review/approval; 01D remains closed.

## Closeout

- Result: **closed with waivers** on 2026-09-28.
- Evidence: `docs/evidence/HR-LOC-01C-verification.txt`.
- Route: single-agent Codex; exact model/effort/surface unavailable under X-002;
  no fallback, worker, subagent, or saved workflow used.
- Next step: owner review and explicit approval to open HR-LOC-01D. Do not
  begin 01D implicitly, and do not treat approval of 01D as closure of Q-010.
