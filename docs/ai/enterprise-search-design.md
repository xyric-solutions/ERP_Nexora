# Nexora - Enterprise Search Design (extends S4.1, ADR-14)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 8 Enterprise Intelligence Layer request, logged as `accepted-improvements.md` I-022
- Segment: `segments/S4.1-integration-notification-platform.md`

Builds on ADR-14 (OpenSearch, decided Stage 3) and the RAG vector
infrastructure (`docs/ai/ai-platform-design.md`, ADR-19) — this is one
search capability with two query modes, not two separate systems.

## Architecture

| Concern | Design |
|---|---|
| Full-text / global search | OpenSearch index, rebuilt from source tables (already the rule in `architecture.md`'s Integrations table: "never treat index as source of truth"). Covers `Party`, `Item`, `BusinessDocument`, and module-specific records. |
| Semantic search | Query embedding (via the same `ModelProviderPort.embed()` from the AI platform design) compared against pgvector-stored record embeddings (ADR-19) — returns conceptually related results even without exact keyword match, e.g. searching "printer paper" surfaces an item named "A4 sheets." |
| Result ranking | Hybrid: OpenSearch relevance score blended with vector-similarity score; exact keyword matches are never outranked by a looser semantic match — semantic search augments, it doesn't replace, full-text. |
| Saved searches | A `SavedSearch` entity (`id, tenant_id, actor_id, query, filters_json`) — private to the creating actor unless explicitly shared, reusing the same visibility pattern as any other tenant-owned record. |
| Advanced filters | Module, date range, status, dimension (cost center/project) — the same dimension tags already captured at posting time (`docs/finance/finance-core-posting-design.md` FR-COA-3), not a separate tagging pass. |
| Search suggestions | Autocomplete from the OpenSearch index plus recent-searches-per-actor — no AI generation needed for this, it's a lookup, not a suggestion requiring approval. |
| Search permissions | Every result is filtered by the requesting actor's field/record scope (S1.2) **before** ranking, not after — an unauthorized record is never returned even at low rank, closing the "search result existence leaks information" class of bug. |

## API contracts

| Route | Notes |
|---|---|
| `GET /api/v1/search?q=...&module=...&filters=...` | Cursor-paginated, permission-pre-filtered |
| `GET /api/v1/search/suggestions?q=...` | Autocomplete |
| `POST /api/v1/search/saved` , `GET /api/v1/search/saved` | Saved search CRUD |

## Security

Permission pre-filtering (above) is the core control. Index rebuild jobs run
with a service identity scoped to read-only index population, never with
elevated write access to source tables — the indexer cannot itself become a
privilege-escalation path.

## Performance

Index freshness target matches the KPI freshness NFR already locked
(≤5 minutes) — search doesn't need real-time consistency, an eventually-
consistent index is the correct tradeoff for read-heavy, write-light search
traffic.

## Testing strategy

Reuses `verification-matrix.md`'s levels. Cases: permission pre-filtering
(a search for a record outside the actor's scope returns zero results, not
a redacted result), hybrid ranking doesn't outrank exact matches, saved
search visibility (private by default), index-rebuild idempotency.
