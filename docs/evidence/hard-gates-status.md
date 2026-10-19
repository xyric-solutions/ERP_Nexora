# Nexora - Hard Gates Status (S1.1 / S1.2)

- Last updated: 2026-08-06
- Purpose: `hard-gates.md` defines 16 binary fail-conditions but records no per-gate pass/fail outcome anywhere. This file closes that traceability gap by mapping each gate to the specific evidence that proves it for every closed batch. Append a new pair of columns per batch as later segments close; never delete or reorder rows.
- Source evidence: `docs/evidence/S1.1-verification.txt`, `docs/evidence/S1.2-verification.txt`, `_progress.md`.

| Gate | S1.1 status | S1.1 evidence | S1.2 status | S1.2 evidence |
|------|-------------|----------------|-------------|----------------|
| Source hierarchy | PASS | No undocumented source conflict; `CLAUDE.md`/`AGENTS.md` hierarchy applied without deviation. | PASS | Same; no drift recorded for S1.2. |
| Route shape | PASS | Contract test suite (5 tests) + `python -m json.tool contracts/openapi-v1.json` pass; all routes follow `/api/v1/platform/*`. | PASS | Same contract suite re-run, still passes; no new routes added outside the pattern. |
| Error safety | PASS | QA-01: canonical `{code, message, details, correlation_id}` errors tested for 404/409/413/415/422/429/500; no diagnostic leakage. | PASS | Security suite (13 tests) confirms error paths for identity/authorization denials stay canonical. |
| Auth coverage | PASS | SEC-01: anonymous, invalid, tenant-less requests denied by default on all non-public routes. | PASS | "100% of protected routes carry and enforce an exact permission" — SEC-01 target met, security suite green. |
| Authorization | PASS (baseline only — no real permission model yet in S1.1) | Reject-all default confirmed; no field/record/SoD logic exists to bypass at this stage. | PASS | Role/tenant/field/record/static-SoD/dynamic-SoD tests pass; S1.2-F01 (admin command authz gap) found by SEC-01 and resolved before closeout. |
| Tenant isolation | PASS | Resources, idempotency records, and rate-limit buckets confirmed tenant-scoped. | PASS | Cross-tenant identity mapping denies; cross-tenant role assignment fails at the FK boundary (second isolation layer). |
| Audit coverage | N/A (no audit writer exists in S1.1) | Not applicable — audit model ships in S1.2. | PASS | 100% of the four controlled S1.2 actions (security user/policy/assignment create, platform resource create) append audit evidence. |
| Audit preservation | N/A | Not applicable in S1.1. | PASS | Audit UPDATE/DELETE SQL statements fail (DB trigger); populated-migration rollback blocked and preserves rows. |
| Idempotency | PASS | Idempotent POST tested; changed-payload replay returns 409 per `docs/api-binding-standards.md`. | PASS | Idempotent API replay confirmed to append zero duplicate resource/audit side effects. |
| Correlation | PASS | `X-Correlation-ID` propagation tested on requests/responses/logs. | PASS | Correlation id present on all S1.2 audit events. |
| Contract | PASS | `python -m json.tool contracts/openapi-v1.json` + 5 contract tests pass; live OpenAPI matches file. | PASS | Same check re-run against the S1.2 build; still matches, no undeclared drift. |
| Behavior proof | PASS | 36 targeted tests cover all changed S1.1 behavior; no untested change. | PASS | 66 targeted tests cover all changed S1.2 behavior; the two open gaps (W-001, W-002) are explicitly owned, not silently skipped. |
| Migration safety | PASS | 1 migration test: forward path only (no schema existed to roll back yet). | PASS | 4 migration tests: forward, repeat-apply, clean rollback, and populated-rollback-blocked all pass. |
| Evidence honesty | PASS | Pilot-load performance and Node portability explicitly marked NOT RUN rather than claimed. | PASS | Same discipline maintained; W-001/W-002 recorded as waivers, not hidden. |
| Credential boundary | PASS | SEC-01: completion records contain no bearer token, idempotency key, or request body. | PASS | Security suite confirms no secret/token appears in logs or audit rows. |
| Routing truth | PASS (with waiver) | Exact model/reasoning provenance unavailable from the runtime; recorded as waiver W-002 rather than fabricated. | PASS (with waiver) | Same W-002 waiver carried forward; system reports GPT-5 family, single delegation, nothing further claimed. |

## Roll-up

- S1.1: 14 of 16 gates directly evidenced PASS; 2 gates (Audit coverage, Audit preservation) are not-applicable at this batch because no audit writer exists yet — first evidenced in S1.2.
- S1.2: 16 of 16 gates evidenced PASS. One gate (Authorization) required an in-batch fix (S1.2-F01) before it closed clean; two gates (Routing truth, Evidence honesty) pass only because the waivers were disclosed rather than concealed — a concealed waiver would itself be a gate failure under "Evidence honesty" and "Routing truth."
- No gate has failed on any closed batch to date. This file supersedes the previous practice of inferring gate status only from aggregate test-pass narrative in `_progress.md`.
