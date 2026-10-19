# Platform Administration API

S1.5-04 exposes governed Platform Core administration through the existing v1
API gateway and checked-in OpenAPI contract. These routes are active only in
the production FastAPI composition; the local/Demo application retains an
explicit `PLATFORM_ADMIN_NOT_CONFIGURED` response.

## Resources and permissions

| Resource path | Read permission | Command permission |
|---|---|---|
| `/api/v1/platform/tenants` | `platform.tenant.read` | `platform.tenant.create` |
| `/api/v1/platform/organization_units` | `platform.organization_unit.read` | `platform.organization_unit.create` |
| `/api/v1/platform/fiscal_calendars` | `platform.fiscal_calendar.read` | `platform.fiscal_calendar.create` |
| `/api/v1/platform/accounting_periods` | `platform.accounting_period.read` | `platform.accounting_period.create` |
| `/api/v1/platform/currencies` | `platform.currency.read` | `platform.currency.create` |
| `/api/v1/platform/currency_rates` | `platform.currency_rate.read` | `platform.currency_rate.create` |
| `/api/v1/platform/tenant_modules` | `platform.tenant_module.read` | `platform.tenant_module.create` |
| `/api/v1/platform/tenant_policies` | `platform.tenant_policy.read` | `platform.tenant_policy.create` |
| `/api/v1/platform/numbering_sequences` | `platform.numbering_sequence.read` | `platform.numbering_sequence.create` |
| `/api/v1/platform/number_allocations` | n/a | `platform.numbering_sequence.allocate` |
| `/api/v1/platform/administration_audit_events` | `platform.audit_event.read` | none |

Every route requires a trusted bearer identity and `X-Tenant-ID`. The server
constructs persistence scope only from the verified request context; command
bodies do not accept `tenant_id`. Exact route permission and field authorization
are evaluated by the injected server-side authorization service before the
handler reaches PostgreSQL. These are tenant-administrator resources; a
company-scoped role does not implicitly gain tenant-wide administration. For
company-referencing commands, tenant-aware foreign keys plus RLS reject IDs
owned by another tenant.

## Read behavior

Lists are deterministically ordered and use the existing signed `cursor` plus
bounded `limit` contract. Filters are explicit in OpenAPI; unknown, duplicated,
or blank filters are rejected. Reads return `ETag` and honor `If-None-Match`.
PostgreSQL applies forced row-level security in addition to the repository's
trusted tenant predicate.

## Command behavior

All POST routes require `Idempotency-Key`. One transaction:

1. takes a transaction advisory lock for tenant, actor, method, path, and key;
2. rejects a stored key whose request fingerprint differs;
3. creates or allocates the tenant-scoped business record;
4. appends a hash-chained immutable audit event; and
5. stores the original response for durable replay.

A failure in any step rolls back every step. Replay returns the original status,
body, and ETag with `Idempotency-Replayed: true`. Number allocation also locks
the sequence row, so concurrent calls cannot receive the same number. A
never-reset sequence rejects `reset_period`; yearly/monthly sequences require a
validated `YYYY` or `YYYY-MM` period and reset to 1 only when that period changes.

Tenant policies are immutable versions. Creating a new active version locks
the tenant, assigns the next version, and inactivates the prior active version
inside the same audited/idempotent transaction. Historical rows are retained.

## Deliberate boundaries

- There are no delete routes for foundational or audit records.
- Existing setup-draft activation is not enabled in production until Platform,
  Workflow, and Security audit writes share one PostgreSQL unit of work
  (S1.5-F03).
- Managed identity and the production security-policy repository remain gated
  by Q-003; the default production composition therefore still denies access.
- Accounting periods are configuration prerequisites only in this slice.
  Finance posting remains uncomposed in production and cannot be bypassed by
  these routes.
