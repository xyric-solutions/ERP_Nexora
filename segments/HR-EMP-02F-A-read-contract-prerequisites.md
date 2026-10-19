# HR-EMP-02F-A - Employee Workspace Read-Contract Prerequisites

- Status: `closed_with_waivers`
- Theme: typed employment-context contract and frontend read prerequisites
- Session cap: OpenAPI contract, generated frontend client, permission catalog, organization-picker decision, tests, closeout, commit and synchronization only
- Evidence path: `docs/evidence/HR-EMP-02F-A-verification.txt`
- Build gate this batch? yes
- Active roots: `contracts/`, `web/`, focused tests and Forgeflow records
- Source links: owner-approved HR-EMP-02F-A scope; live HR-EMP-02E provider/API; HR-02 architecture discovery; Platform organization read contract
- Handoff status target: CLOSED WITH WAIVERS
- Pre-development doc gate: READY WITH WAIVERS
- Documentation evidence path: this segment and `docs/evidence/HR-EMP-02F-A-verification.txt`
- Loop primitive: `none`
- Runtime profile: `codex-native`
- Orchestrator role: Codex
- Worker backend: none
- Provider / endpoint class: Codex / native
- Planned model family / variant / ID: gpt-5.6 / terra / `gpt-5.6-terra`
- Planned API reasoning effort / mode / surface: medium / standard / medium
- Planned delegation mode / maximum subagents: single / n/a
- Actual route: GPT-5 family Codex; exact variant/effort/surface metadata is not exposed under X-002
- Actual delegation: single orchestrator; no subagents
- Routing rationale: 02F-A is a known-scope contract/client change with existing domain semantics and deterministic contract, frontend and security gates.
- Routing fallback: stop and report if the named schema cannot exactly represent provider output or if authorization behavior would need redesign.
- Routing escalation condition: any provider semantic change, new persistence, new organization authority or security-boundary ambiguity.
- Routing evidence path: `docs/evidence/HR-EMP-02F-A-verification.txt`
- Routing deviation: exact runtime metadata unavailable; no scope or delegation deviation
- Ultra workstream map: n/a
- Shared-write isolation: n/a
- Root synthesis owner: Codex
- Root synthesis evidence path: `docs/evidence/HR-EMP-02F-A-verification.txt`
- Worker task packet / output / saved workflow: n/a
- Usage guard: one bounded session; stop before any new organization endpoint, UI slice, provider semantic change or migration
- Verify command: `python scripts/verify.py unit integration contract security e2e migration`; frontend drift, test, lint and build gates

## Pre-development gate - READY WITH WAIVERS

- [x] Live code/config/tests are the implementation source of truth; locked architecture remains the intent source.
- [x] Owner-approved 02F-A scope and live 02E provider/API resolve to active sources.
- [x] Contract, frontend client, auth/security and regression gates are selected.
- [x] No persistence or migration is justified.
- [x] The existing Platform organization-unit endpoint is tenant-wide, accepts only `id`/`type` filters and requires `platform.organization_unit.read`; it cannot safely serve an ordinary HR company-scoped picker without broader exposure.
- [x] No organization endpoint will be added in 02F-A. The minimum future projection is documented for separate 02F-B approval.
- [x] Single-orchestrator route and evidence path are recorded.
- [x] X-002 remains the only routing-provenance waiver.

## Item checklist

| Item | Locator | Status | Evidence / decision |
|---|---|---|---|
| HR-EMP-02F-A-01 - named employment-context schema | `contracts/openapi-v1.json`; contract tests | done | Named nested schemas exactly model the live provider response and exclude pay/tax/accounting values. |
| HR-EMP-02F-A-02 - typed frontend client | `web/src/lib/api/hr.ts`; generated schema; tests | done | Required identifiers and strict calendar-valid date; canonical API errors preserved. |
| HR-EMP-02F-A-03 - frontend permission catalog | `web/src/lib/session/permissions.ts`; tests | done | Existing backend permission added; no new authorization mechanism. |
| HR-EMP-02F-A-04 - organization-picker decision | this segment; closeout evidence | done | Existing endpoint is unsuitable; stop before a new endpoint and defer the minimal projection to separately approved 02F-B. |
| HR-EMP-02F-A-05 - verification and closeout | evidence/ledgers/handoff | done | Focused and full gates pass; commit and normal push are the final owner-authorized actions. |

## Organization-picker conclusion

The existing `GET /api/v1/platform/organization_units` is read-only and returns
the required hierarchy fields (`id`, `parent_id`, `type`, `code`, `name`,
`status`), but it is tenant-wide, filters only by `id` or `type`, and requires
the Platform-administrator permission `platform.organization_unit.read`. It
does not enforce a selected legal-employer/company subtree and would expose
unrelated companies and organization units to an HR actor.

02F-B therefore needs a separately approved, read-only company-scoped
projection over the existing `organization_unit` authority. Its minimum
contract is `company_id` plus optional type/status/search, returning only the
selected company and descendants with stable hierarchy fields. It must use an
HR read permission, contextual company authorization and existing tenant RLS.
It must not add tables, duplicate organization records or permit mutation.
Per the owner gate, 02F-A stops before implementing this endpoint.

## Acceptance boundary

- The provider and its fail-closed domain rules remain unchanged.
- The existing route receives a named, stable, money-free response schema.
- The frontend receives generated types, a strict typed client and the existing permission identifier.
- No Employee workspace UI, organization API, migration or consumer migration is introduced.
- Payroll, Attendance, Leave, HR-LOC, compensation and Workflow behavior remain unchanged.

## Completion gate

- [x] Named schema matches provider output and the route no longer uses a generic object.
- [x] Frontend client validates required identifiers and strict `YYYY-MM-DD` before requesting.
- [x] Frontend permission catalog includes `hr.employment_context.read`.
- [x] Positive, negative, cross-company, boundary and deterministic tests pass.
- [x] API generation/drift, TypeScript, ESLint and build pass.
- [x] Full relevant backend regression passes.
- [x] Diff contains only 02F-A files and no migration.
- [x] Evidence, ledgers, progress, memory and handoff are reconciled.
- [x] Commit and `main`/`origin/main` synchronization are verified at final push gate.
- [x] HR-EMP-02F-B/C/D remain not started.

## Waivers and external gates

- X-002: exact runtime model/effort/surface metadata is unavailable.
- The company-scoped organization picker projection is required for 02F-B but is not authorized for implementation in 02F-A.
- Existing HR-EMP-02E authority limitations and external Q-004/Q-007/Q-010/cross-border gates remain unchanged.
