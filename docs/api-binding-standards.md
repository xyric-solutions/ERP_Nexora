# Nexora API Binding Standards

This document describes the executable S1.1/S1.2 conventions. `_shared-canon.md` and
the locked `architecture.md` are the authorities; the OpenAPI snapshot is
`contracts/openapi-v1.json`.

## Route and context model

| Method and route | Access | Purpose |
|------------------|--------|---------|
| `GET /api/v1/platform/health` | public | component health and correlation proof |
| `GET /api/v1/platform/openapi` | public | canonical OpenAPI 3.1.1 document |
| `GET /api/v1/platform/resources` | identity, tenant, `platform.resources.read` | cursor/ETag convention |
| `POST /api/v1/platform/resources` | identity, tenant, `platform.resources.create` | idempotent audited command convention |

Public access is explicit in the route registry. The default identity verifier
and default authorizer reject every protected request. The S1.2 managed
identity boundary maps provider-verified subject/MFA claims to one active
account in `X-Tenant-ID`; it never derives actor identity from user-controlled
identity or tenant claims. Each protected route declares an exact permission
in the route registry and OpenAPI `x-permission`, then evaluates role, field,
record, and SoD policy before handler behavior.

Material commands append hashed audit evidence before their side effect becomes
visible. Audit append failure is a safe 500 and produces no resource.

## Errors and validation

Errors have exactly:

```json
{
  "code": "DOMAIN_REASON_ACTION",
  "message": "Safe client-facing text.",
  "details": {},
  "correlation_id": "opaque-request-id"
}
```

Boundary checks cover method/path, auth context, media type, body size, JSON
syntax/type, query cardinality/range, cursor signature, idempotency key, and
resource fields. Unexpected exceptions become a safe 500 and never expose the
exception string.

## Retry, cache, list, and rate conventions

- POST resources requires `Idempotency-Key`. The process-local adapter scopes a
  record by tenant, actor, method, path, and key. Equal normalized payloads
  replay the original result; changed payloads return 409. The
  `Idempotency-Replayed` response header says `true` or `false`.
- List resources returns `{items, next_cursor}`. Cursors are signed, opaque,
  versioned offsets; `limit` defaults to 50 and is bounded at 100.
- List and create responses emit strong SHA-256 ETags over canonical JSON.
  `If-None-Match` on lists returns 304 when equal.
- Successful limited requests emit `X-RateLimit-Limit`,
  `X-RateLimit-Remaining`, and `X-RateLimit-Reset`. A rejected request adds
  `Retry-After` and a canonical 429 body.

In-memory stores are injectable testable scaffolds, not production durability
claims. Multi-instance deployment requires atomic shared adapters.

## Correlation and logs

A valid `X-Correlation-ID` is propagated; otherwise the shell generates a UUID.
Every response has the header, and every public error body includes the same
value. Structured completion records contain component, method/path,
correlation, trusted tenant/actor when available, latency, status, outcome, and
error code. They never contain headers, tokens, idempotency keys, or bodies.

## Verification labels

| Architecture label | Local command |
|--------------------|---------------|
| `test:unit` | `python scripts/verify.py unit` |
| `test:integration` | `python scripts/verify.py integration` |
| `test:contract` | `python scripts/verify.py contract` |
| `test:security` | `python scripts/verify.py security` |
| `test:e2e` | `python scripts/verify.py e2e` |
| `test:migration` | `python scripts/verify.py migration` |

Combined closeout:

`python scripts/verify.py unit integration contract security e2e migration`

No pilot-load performance result is claimed by S1.1. Functional rate-limit
behavior is covered now; the under-500-ms p95 NFR requires the later configured
pilot load profile.
