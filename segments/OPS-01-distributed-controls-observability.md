# OPS-01 - Distributed Controls and Observability

- Status: `closed with waivers` (`READY FOR REVIEW`)
- Theme: multi-replica enforcement and privacy-safe operational telemetry
- Build gate this batch? yes
- Active root: `app/`
- Source authority: live application/configuration/tests; locked architecture/PRD for intent
- Handoff target: READY WITH WAIVERS
- Runtime/delegation: Codex native, single accountable implementation
- Verify: `python scripts/verify.py unit integration contract security e2e migration`

```yaml
loop_primitive: none
runtime_profile: codex-native
orchestrator_role: Codex orchestrates through Forgeflow artifacts
worker_backend: none
provider: Codex
endpoint_class: native
planned_model_family: gpt-5.6
planned_model_variant: sol
planned_model_id: runtime-selected
planned_api_reasoning_effort: high
planned_reasoning_mode: standard
planned_surface_setting: high
planned_delegation_mode: single
planned_max_concurrent_subagents: n/a
actual_model_family: GPT-5 family
actual_model_variant: n/a
actual_model_id: n/a
actual_api_reasoning_effort: n/a
actual_reasoning_mode: n/a
actual_surface_setting: n/a
actual_delegation_mode: single
actual_max_concurrent_subagents: n/a
routing_rationale: Security-sensitive cross-process controls and telemetry need one owner and full regression review.
routing_fallback: Stop for review if Redis atomicity or telemetry privacy cannot be proven locally.
routing_escalation_condition: Repeated concurrency failures or an unresolved privacy/security finding.
routing_evidence_path: docs/evidence/OPS-01-verification.txt
routing_deviation: X-002; exact runtime fields were not exposed
ultra_workstream_map: n/a
shared_write_isolation: n/a
root_synthesis_owner: active orchestrator
root_synthesis_evidence_path: docs/evidence/OPS-01-verification.txt
verify_command: python scripts/verify.py unit integration contract security e2e migration
evidence_path: docs/evidence/OPS-01-verification.txt
usage_guard: bounded to Redis controls, metrics, tracing, tests and operating documentation
worker_task_packet: n/a
worker_output_path: n/a
saved_workflow: n/a
closeout_writes:
  - batch file
  - findings-ledger.md
  - deferred-decisions.md
  - accepted-improvements.md
  - _progress.md
  - plans/next-session-handoff.md
```

## Scope

Replace process-local production idempotency and rate limiting with shared,
atomic Redis adapters. Wire provider-neutral OpenTelemetry tracing and a
protected Prometheus metrics endpoint without recording sensitive or
high-cardinality request data. Development adapters remain available for unit
and local application composition.

Redis coordinates transport retries but cannot share a transaction with
PostgreSQL. Durable PostgreSQL idempotency remains mandatory for commands with
material business effects.

## Items

| Item | Locator | Status |
|---|---|---|
| OPS-01-01 validated fail-closed production settings and lifecycle | `app/production/` | done |
| OPS-01-02 Redis idempotency and rate-limit adapters | `app/shared/` | done |
| OPS-01-03 privacy-safe metrics and tracing | `app/shared/`, `app/production/` | done |
| OPS-01-04 concurrency, outage, privacy and regression evidence | `tests/`, `scripts/`, `docs/evidence/` | done |

## Completion gate

- [x] Two application replicas observe one rate-limit budget.
- [x] Concurrent duplicate requests execute one operation and replay one response.
- [x] Changed-payload idempotency-key reuse is rejected across replicas.
- [x] Redis outage fails closed without exposing infrastructure details.
- [x] Production startup/readiness verify PostgreSQL and Redis.
- [x] Metrics access is separately authenticated and bounded-cardinality.
- [x] Traces exclude sensitive headers, bodies, query strings and ERP identities.
- [x] Canonical backend and PostgreSQL regression gates pass.

## Waivers and boundaries

- Managed Redis provisioning, collector hosting, dashboards, alert routing,
  secret rotation and disaster recovery remain cloud-operations decisions.
- Redis is not a substitute for a database transaction. A process crash after
  a side effect and before transport-response persistence is recovered through
  each material service's durable PostgreSQL idempotency record.
- No provider, cloud account, KMS, retention period or paging destination is
  invented by this batch.

## Closeout

- Closed: 2026-09-25.
- Result: **READY FOR REVIEW**; code-controlled distributed controls and
  telemetry are complete. Provider operations remain waived, not simulated.
- Evidence: `docs/evidence/OPS-01-verification.txt`.
- Focused result: 4 real-Redis integration tests and 7 runtime/telemetry unit
  tests passed.
- Regression result: 638 backend tests, 32 PostgreSQL tests, 163 frontend
  tests, 18 accessibility tests and a 51-route production build passed.
- Dependency audit found no known Python vulnerabilities; the production API
  image built and retains UID/GID `10001:10001`.
- S1.5-F06 and Q-002 are resolved. S1.5-F07 now contains deployment-owned
  dashboards, alert routing, retention and incident-response proof only.
