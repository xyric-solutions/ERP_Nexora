# Nexora - Integration & Automation Framework Design (extends S4.1)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 8 Enterprise Intelligence Layer request, logged as `accepted-improvements.md` I-022
- Segment: `segments/S4.1-integration-notification-platform.md`

Extends S4.1's already-locked connector scope (Email, SMS, WhatsApp, Teams,
Slack, storage, search, bank import, payment, BI, external import) with the
providers Stage 8 named that weren't already listed, and maps Automation
onto S1.3's existing workflow engine rather than building a second one —
this stage's own rule ("never duplicate functionality already available in
Platform Core") applies directly here.

## Integration framework — new providers added to S4.1's scope

| Provider / protocol | Category | Notes |
|---|---|---|
| GraphQL | API surface | Already ADR-1 (REST commands + GraphQL reads) — not a new integration decision, just confirming it applies to external consumers too. |
| OAuth2 | Auth for external API clients | Already `ApiClient` entity's scope model (`architecture.md`) — S4.1 uses it, doesn't reinvent it. |
| SAML, LDAP / Active Directory | Enterprise identity | Extends ADR-2's identity approach (hybrid managed OIDC/SAML) — LDAP/AD is a net-new addition for on-premise enterprise directories, relevant to the SaaS-first-with-private-cloud-readiness profile (ADR-8). |
| Government Tax APIs | Compliance | Consumed by the jurisdiction-pack pattern (I-009) — a tax API is a *data source* for a jurisdiction pack's rules, not a separate integration mechanism. |
| Power BI, Microsoft 365, Google Workspace, Slack, Teams | Productivity/BI | Power BI already named in S4.1's original scope; M365/Google Workspace/Slack/Teams extend the same outbound-connector pattern (signed, scoped, retry-with-dead-letter). |
| Zapier, Make.com | No-code automation | Exposed via the same `ApiClient`/webhook contracts every other integration uses — Nexora doesn't build Zapier-specific code, it exposes a standard, well-documented webhook/API surface that these platforms already know how to consume. |

Every provider above — new or previously listed — uses the **same** contract
already locked for S4.1: scoped `ApiClient`/`WebhookSubscription`, signed
payloads, secret references (not inline secrets), idempotent delivery,
dead-letter queues on failure. This document does not introduce a
per-provider bespoke mechanism.

## Automation framework

| Requested capability | Maps to |
|---|---|
| Workflow Automation | S1.3's `WorkflowDefinition`/`ApprovalInstance` engine — not a new automation engine. |
| Rule Engine | S1.3's workflow engine's condition/threshold evaluation, exposed as a standalone reusable rule-evaluation service other modules can call (e.g. S3.1's reorder-point rule, S2.2's tax-rule selection) — same engine, more callers. |
| Scheduled Jobs | Background workers (`arq`/Redis, named in the Stage 3 DevOps design) run on a cron-like schedule — used by Recurring Journals (S2.2, I-020), heavy async reports (S2.3), and index-rebuild jobs (Enterprise Search). |
| Event-based Automation | RabbitMQ (ADR-15) — an `AccountingEvent` or other domain event triggers a downstream action (e.g. a posted sales invoice triggers a notification) through the same dead-letter-backed delivery S4.1 already specifies. |
| AI-assisted Automation | Any `AiSuggestion` whose type is auto-approvable under a tenant's configured low-risk threshold **still requires the human-approval gate for high-impact types** (already locked, non-negotiable) — "AI-assisted" means faster human review (pre-filled, pre-validated), not removed review. |
| Business Process Automation | The composition of the above four — a BPA "flow" is just a `WorkflowDefinition` with rule-engine conditions and event triggers, not a fifth new mechanism. |

## Security

Every automation and integration point reuses S1.2's authorization model —
scheduled jobs and event-triggered automations run under a service identity
(the same future signed service-identity adapter referenced throughout
S1.2/S2.1/S3.x's design docs), never as an implicit elevated-privilege
background process.

## Testing strategy

Reuses `verification-matrix.md`'s levels, matching S4.1's locked verify
command. Cases: webhook signature verification, dead-letter delivery on
repeated failure, rule-engine evaluation correctness against seeded
conditions, scheduled-job idempotency (a job that fires twice for the same
period produces the same result, not duplicate side effects — same
discipline as S2.1's event idempotency).
