# HR-LOC-01D — Company Setup, APIs, RBAC, and Audit

- Status: `closed with waivers`
- Theme: tenant-safe, country-neutral company localization configuration
- Session cap: 4 tightly coupled Platform/API/security items
- Reviewed date / evidence path: `docs/evidence/HR-LOC-01D-verification.txt`
- Build gate this batch? yes — tenant configuration, activation, RBAC, audit, and migration hardening
- Active root: `app/`
- Source links: `plans/2026-09-28-hr-loc-01-localization-framework.md`, `docs/superpowers/specs/2026-09-28-hr-payroll-multi-jurisdiction-production-design.md`, completed `HR-LOC-01A`/`01B`/`01C`, live Platform setup/API/security code and tests
- Handoff status target: READY WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: `docs/evidence/HR-LOC-01D-verification.txt`
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
- Routing rationale: company-scoped authorization, forced RLS, transactional audit, effective dates, setup activation, and compliance-state separation are tightly coupled and security-sensitive.
- Routing fallback: remain on the current capable Codex route; stop rather than lower capability for authorization, activation, or audit-integrity decisions.
- Routing escalation condition: an approved architecture conflict, cross-tenant/company access, non-atomic setup, compliance overclaim, production activation bypass, or a required payroll/resolver/UI change.
- Routing evidence path: `docs/evidence/HR-LOC-01D-verification.txt`
- Routing deviation: X-002 — exact runtime route fields are not exposed; no fallback, worker, or delegation is used
- Ultra workstream map: n/a
- Shared-write isolation: n/a; single agent
- Root synthesis owner: active Codex orchestrator
- Root synthesis evidence path: `docs/evidence/HR-LOC-01D-verification.txt`
- Worker task packet: n/a
- Worker output path: n/a
- Saved workflow: n/a
- Usage guard: one bounded 01D slice; stop before employee/work-location resolution, payroll integration, UI, real reference releases, or real statutory packs
- Verify command: focused unit/integration/contract/security/PostgreSQL tests; canonical backend; frontend drift/lint/test/a11y/build; compile/dependency/Compose/diff/portability gates

## Pre-development gate

- [x] Active sources and tie-breaker identified: latest owner approval, live code/config/tests, approved HR-LOC plan/design, then execution ledgers.
- [x] Archived or older grouped roadmaps remain evidence only; the approved 01A–01H slice plan governs.
- [x] Scope is bounded to Platform company setup, catalogs, API contracts, exact RBAC, atomic audit, and legacy-safe behavior. 01E and later remain closed.
- [x] Existing company identity remains `organization_unit(type='company')`; existing 01A tables are reused rather than duplicated.
- [x] Existing company profile schema has no country/currency/legal-entity fields on `organization_unit`; those concerns already live in the approved effective-dated 01A tables.
- [x] Existing setup drafts, Platform audit chain, idempotency, RequestContext, authorization evaluator, production composition, RLS, and OpenAPI conventions were reviewed.
- [x] This is not a Blueprint-backed segment; no `BUILD_READY` marker is required.
- [x] Verification gates selected: model validation, effective/reference checks, catalog availability, company scope, tenant RLS, permissions, secret masking, compliance-state separation, setup atomicity, audit failure rollback, idempotency, migration rollback/reapply, contract drift, and canonical regressions.
- [x] Baseline worktree is clean at `2ac76449887dd4fa150392c50532ff2d2198cbb8`; Platform PostgreSQL passed 18/18 and HR PostgreSQL passed 17/17.
- [x] Q-007 blocks real statutory packs; Q-010 blocks real reference release and production localization activation. Test-only synthetic references/packs can prove the generic mechanism.
- [x] Q-004 blocks plaintext statutory registration storage; API responses and audit expose masked values only, with an optional external secret reference accepted but never returned.
- [x] No architectural conflict was found. UI implementation belongs to 01G, resolver/work-location behavior to 01E, and payroll integration to 01F.
- [x] Gate result: **READY WITH WAIVERS**.

## Acceptance

- Catalog APIs expose only effective active references and immutable pack availability/lifecycle evidence.
- Company legal profiles, registrations, payroll configuration, and localization activations are tenant/company scoped, effective-dated, validated, and audited atomically.
- Country, jurisdiction, legal entity, currency, and frequency remain explicit; currency or locale never chooses jurisdiction.
- Country identification, pack availability, pack approval/activation, and statutory compliance are distinct response states; compliance is never claimed by this slice.
- Production localization activation remains fail-closed until Q-007 and Q-010 are closed; synthetic activation is test-only.
- Setup drafts accept the four approved localization sections and activate them in the same transaction as company creation.
- Existing `legacy_unlocalized` companies remain operable and visibly non-compliant; new companies remain `localization_required`.
- Exact read/manage/activate permissions and company scope are enforced at API and service/repository boundaries.
- Registration plaintext is not accepted as a field, returned, logged, or written to audit.

## Do not do

- Do not add real country, subdivision, legal-entity, statutory-rate, formula, holiday, benefit, reporting, or registration data.
- Do not implement employee/work-location resolution, override APIs, payroll provider/snapshots, or any UI.
- Do not change `app/hr/payroll.py`, Finance tax, or unrelated functionality.
- Do not bypass Q-007 or Q-010, infer a jurisdiction, or call this setup statutory compliance.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01D-01 Company localization repository/service and activation policy | `app/platform/localization_service.py`, PostgreSQL repository/migration | complete — existing 01A/01C schema reused; production active transition hard-blocked |
| HR-LOC-01D-02 Catalog and company configuration APIs/contracts | `app/api/application.py`, `contracts/openapi-v1.json` | complete — 14 protected operations with exact tenant/company authorization |
| HR-LOC-01D-03 Setup-draft localization sections and atomic activation | `app/platform/setup.py`, setup services/repositories | complete — four strict sections participate in the existing outer transaction |
| HR-LOC-01D-04 Security/product verification and closeout | tests, evidence, ledgers, memory, handoff | complete — canonical, live PostgreSQL, frontend, build, and hygiene gates pass |

## Blockers and waivers

| Owner | Blocked work | Next action | Closure condition |
|---|---|---|---|
| Payroll/legal owner | Q-007 real statutory localization and compliance | Approve the first jurisdiction, authoritative sources, ownership, and vectors | Official vectors, rounding, retroactivity, and reconciliation pass |
| Platform/localization owner | Q-010 real reference release and production activation | Approve a complete provenance-hashed reference bundle | Reference release and fail-closed activation gates pass |
| Security/data owner | Q-004 full registration identifier storage | Approve KMS/vault boundary | Encrypted storage, access, rotation, logging, and recovery controls pass |
| Security/platform/operations owners | Q-003/Q-006 managed identity/cloud/HA proof | Select and verify providers and controls | Deployment/security/recovery gates pass |

These waivers permit the generic, test-proven setup surface only. They do not authorize real data, production activation, or a compliance claim.

## Completion gate

- [x] All four items have focused evidence and notes.
- [x] Direct and setup-draft paths are atomic, audited, tenant/company safe, and idempotent.
- [x] Q-007/Q-010 production activation gates and legacy behavior are proved.
- [x] OpenAPI and generated client drift checks pass; no UI is added.
- [x] Migration clean rollback/reapply and populated rollback refusal pass.
- [x] Canonical regression and hygiene gates pass.
- [x] Evidence, findings, progress, memory, and handoff reflect verified truth.
- [x] Commit and push are included in the owner closeout report.
- [x] Exactly one next step remains owner review/approval; 01E stays closed.

## Closeout

- Result: **CLOSED WITH WAIVERS**. The country-neutral company setup surface is
  implemented without real reference/statutory data and without modifying the
  payroll core, Finance, employee resolution, or UI.
- Database: no new migration; the approved 01A schema and 01C release evidence
  were sufficient. Existing rollback/reapply and populated-preservation gates
  pass.
- Verification: 663 canonical backend, 21 Platform PostgreSQL, 17 HR
  PostgreSQL, 163 frontend behavior, 18 accessibility, 51-route build, API
  drift, lint, compile, dependency, Compose, diff, and portability gates pass.
- Security: exact RBAC plus company scope and forced RLS; material changes and
  actions are atomically audited; secret references are omitted from outputs.
- Honest boundary: identification, pack availability, pack lifecycle, and
  statutory compliance remain distinct. Compliance is always `not_assessed` in
  01D, and production activation has no configuration bypass.
- Evidence: `docs/evidence/HR-LOC-01D-verification.txt`.
- Next step: owner review and explicit approval to open HR-LOC-01E. No 01E work
  is authorized by this closeout.
