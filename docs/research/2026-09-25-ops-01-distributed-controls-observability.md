# OPS-01 Research - Distributed Controls and Observability

Date: 2026-09-25

## Decision summary

- Use one async redis-py client and connection pool for the application
  lifetime; close it during application shutdown.
- Use server-side Lua scripts for atomic fixed-window counters and
  idempotency state transitions. This works across application replicas and
  avoids client-side read/modify/write races.
- Derive Redis keys with HMAC-SHA256 so raw tenant, user and idempotency values
  do not appear in operational key metadata.
- Fail production startup, readiness and protected controls closed when Redis
  is unavailable. Do not silently fall back to per-process state.
- Keep durable business idempotency in PostgreSQL. Redis coordinates HTTP
  retries but cannot atomically commit an ERP transaction and its response.
- Instrument the ASGI boundary manually with bounded route labels. Never put
  tenant, actor, correlation, document or idempotency identifiers into metric
  labels or span attributes.
- Expose Prometheus metrics through a dedicated bearer secret. Support an
  optional OTLP/HTTP collector endpoint without selecting a cloud provider.

## Primary sources

- Redis documents sharing a single async client/pool and explicitly closing
  it: https://redis.io/docs/latest/develop/clients/redis-py/async/
- Redis documents server-side Lua execution as atomic:
  https://redis.io/docs/latest/develop/programmability/eval-intro/
- Redis transaction behavior and isolation:
  https://redis.io/docs/latest/develop/using-commands/transactions/
- OpenTelemetry Python manual instrumentation:
  https://opentelemetry.io/docs/languages/python/instrumentation/
- OpenTelemetry sensitive-data controls:
  https://opentelemetry.io/docs/security/handling-sensitive-data/
- OpenTelemetry HTTP semantic conventions and explicit header-capture risks:
  https://opentelemetry.io/docs/specs/semconv/http/http-spans/
- OpenTelemetry URL conventions warn that query strings can contain sensitive
  information: https://opentelemetry.io/docs/specs/semconv/url/
- Prometheus recommends low-cardinality labels and warns against unbounded
  identifiers: https://prometheus.io/docs/practices/instrumentation/ and
  https://prometheus.io/docs/practices/naming/

## Limits

The source review does not choose a managed service, collector, dashboard,
alert policy, retention period or recovery objective. Those depend on the
deployment environment and remain governed external decisions.
