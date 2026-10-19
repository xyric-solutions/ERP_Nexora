# HR-LOC-01G — Guided Platform and HR Localization UI

- Status: `closed with waivers`
- Theme: permission-safe, explainable localization setup and evidence UI
- Session cap: 4 tightly coupled Web/client/RBAC/accessibility items
- Planned evidence path: `docs/evidence/HR-LOC-01G-verification.txt`
- Build gate this batch? yes — controlled setup, payroll evidence, RBAC, and accessibility
- Active roots: `web/` plus Forgeflow closeout documents
- Source links: approved HR-LOC master plan; completed 01A–01F; live OpenAPI
  contract, Web design system, navigation, HR, Payroll, and setup-draft code
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
- Routing rationale: permission-gated configuration, maker-checker actions,
  payroll evidence, and fail-closed status language cross several UI surfaces.
- Routing fallback: stop for owner review if the stable 01D–01F APIs cannot
  support the approved UI without a material backend redesign.
- Routing escalation condition: schema/migration change, real statutory data,
  activation-policy weakening, cross-border execution, or payroll-core change.
- Routing evidence path: `docs/evidence/HR-LOC-01G-verification.txt`
- Worker task packet / output / saved workflow: n/a
- Usage guard: one bounded 01G slice; stop before 01H; no real-country rules
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`

## Pre-development gate

- [x] Active docs, archived-doc rule, and live-code tie-breaker identified.
- [x] Approved 01G scope and stable 01D–01F dependencies confirmed.
- [x] Existing navigation, company setup, HR, Payroll, API-client, design-system,
  component, testing, and Next 16 conventions inspected.
- [x] Frontend behavior, API-client, RBAC/navigation, accessibility, lint,
  generated-client drift, production build, backend regression, and live
  PostgreSQL gates selected.
- [x] No material conflict found: the guided flow can create the canonical
  setup-draft payload and all HR/read-only evidence views have protected APIs.
- [x] Q-007, Q-010, Q-004, cross-border, and production-operation waivers retained.
- [x] No worker/subagent selected; work is write-coupled and sequential.
- [x] Gate result: READY WITH WAIVERS — external legal/reference gates block
  real packs and compliance claims, but not a country-neutral guided UI.

## Item checklist

| Item | Locator | Status |
|---|---|---|
| HR-LOC-01G-01 — typed localization API client and navigation | `web/src/lib/api/`; shell navigation | done |
| HR-LOC-01G-02 — company wizard/readiness/catalog | `/organization/localization`; Platform feature components | done |
| HR-LOC-01G-03 — HR resolver/override/catalog/snapshot workspace | `/hr/localization`; HR/Payroll integration | done |
| HR-LOC-01G-04 — tests, accessibility, security/product review, closeout | Web tests, evidence, ledgers, handoff | done |

## Acceptance boundary

- Setup uses the existing setup-draft approval/activation workflow.
- Identification, availability, activation, and compliance assessment are
  always distinct; `not_assessed` is never rendered as compliant.
- Resolver explanations are deterministic and use server-returned evidence.
- Cross-country, missing configuration, unavailable/expired/unapproved packs,
  and unresolved contexts remain explicit blocking states.
- Sealed statutory snapshots are read-only for ordinary users.
- Queries/actions are permission-gated in the UI and remain server-authorized.
- No country law, real reference data, AI-law inference, payroll calculation,
  Finance change, migration, or 01H work is added.

## Completion gate

- [x] Every item has implementation and focused test evidence.
- [x] Generated API consumer, lint, functional tests, accessibility, and build pass.
- [x] Canonical backend and live PostgreSQL regressions pass.
- [x] RBAC, tenant/company scope, maker-checker, masked values, and immutable
  snapshot behavior are preserved by review and tests.
- [x] Exact verification is recorded in the evidence file.
- [x] Ledgers, progress, memory, master plan, and handoff are updated.
- [x] Commit is pushed under the owner's standing GitHub instruction.
- [x] 01H remains closed pending explicit approval.
