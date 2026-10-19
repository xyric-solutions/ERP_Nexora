# Nexora - AI Platform Design (extends S4.2)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 8 Enterprise Intelligence Layer request, logged as `accepted-improvements.md` I-022
- Segment: `segments/S4.2-ai-assistant-governance.md`
- Vendor: Anthropic Claude API (Q-005, decided), behind a provider-agnostic adapter (below)

Every AI feature in this document is an instance of S4.2's existing
`AiSuggestion` model (type, source_refs, confidence, status, deciding_user,
audit_link) — this stage adds capability *breadth* and a real provider
architecture, it does not introduce a second AI mechanism alongside it.
Fallback, auditability, and explainability (this stage's own requirement)
are properties of that one model, not per-feature reinventions.

## AI Platform components

| Component | Design |
|---|---|
| AI Copilot / Conversational Chat | The UI-facing form of the AI Assistant panel (`docs/component-library.md`) — every message that results in a suggested action produces an `AiSuggestion`, not a silent side effect. Chat-only Q&A (no action) doesn't require approval; anything that *changes data* does, per S4.2's existing high-impact-approval rule. |
| Natural Language Query Engine | Translates a question into a permission-scoped read query (never a write) against the reporting read models (S2.3's `AnalyticsSnapshot` and the per-module analytics in `docs/ai/business-intelligence-design.md`) — results are filtered by the requesting user's field/record scope (S1.2), exactly like any other report. |
| AI Knowledge Base | Indexed product/process documentation (this doc set itself, plus tenant-configured help content) — feeds RAG (below), not a separate content-management system. |
| Prompt Management | Versioned, tenant-independent system prompts per suggestion type, stored in `app/`, not per-tenant-editable (prevents prompt-injection-via-configuration) — tenant customization happens through data/context, not prompt text. |
| AI Context Service | Assembles the request-scoped context (current record, user's permission scope, relevant retrieved documents) — never includes another tenant's data (hard tenant filter applied before context assembly, same defense-in-depth pattern as S1.2's repository-level tenant filter). |
| Retrieval-Augmented Generation (RAG) | Retrieves top-k relevant chunks (knowledge base + tenant's own records, permission-filtered) before generation — grounds suggestions in real data instead of the model's unguided output. See vector database decision below. |
| Semantic Search | Shares RAG's embedding/vector-similarity infrastructure — see `docs/ai/enterprise-search-design.md`, not duplicated here. |
| AI Audit Logs | Every `AiSuggestion` creation, approval, and rejection is itself an `AuditEvent` (S1.2's existing hash-chained writer) — no second audit mechanism. |
| AI Governance | Policy layer enforcing: high-impact suggestion types always require human approval (already locked), confidence below a tenant-configured threshold is flagged for extra review, and every suggestion always shows its source references — a suggestion with no traceable source is rejected before it's ever shown to a user. |

## AI Vendor architecture: provider-agnostic adapter, Claude as decided default

```
AiSuggestionService -> ModelProviderPort (interface) -> ClaudeProviderAdapter (default, Q-005)
                                                       -> [future: OpenAIProviderAdapter, etc.]
```

The port defines: `generate(prompt, context) -> {content, confidence, token_usage}`
and `embed(text) -> vector`. No suggestion-generation code calls Claude's API
directly — everything goes through the port, so a future provider swap is an
adapter addition, not a rewrite. This is the concrete form of "keep the AI
layer provider-agnostic" without reopening Q-005's actual vendor decision.

## New architecture decision: vector database (RAG/semantic search)

Added to `architecture.md` as ADR-19 (see amendment below): **pgvector on
the already-decided PostgreSQL** (ADR-12), not a separate vector database
service. Reason: avoids introducing a whole new infrastructure component for
a capability that fits inside the already-chosen database; keeps embeddings
transactionally consistent with the records they're generated from (an
`Item` update and its embedding update commit together); revisit only if
embedding volume/query latency at scale later proves pgvector insufficient
— that's an explicit, evidence-driven escalation path, not a default
assumption.

## AI capabilities mapped to `AiSuggestion` types

| Capability | Suggestion type | Source module | Notes |
|---|---|---|---|
| AI Journal Suggestions | `journal_draft` | S2.2 | Drafts a journal entry from an ambiguous source event; never posts directly — the draft still passes S2.2's full posting validation (FR-JE-1/FR-JE-2) on approval. |
| AI Bank Reconciliation | `reconciliation` | S2.2 (Finance Core's existing reconciliation responsibility, `architecture.md` C5 — not a standalone Banking module, per the repeatedly-confirmed decision) | Matches bank statement lines to GL entries; unmatched lines surface for manual review, never force-matched. |
| AI Invoice Recognition (OCR) | `ocr` | S3.1 Procurement | Extracts vendor/line-item/amount from an uploaded `DocumentAttachment` (S4.1, I-018); low-confidence fields are flagged per-field, not just per-document. |
| AI Receipt Processing | `ocr` | S3.2 HR (expense claims) | Same OCR type as invoice recognition — one OCR pipeline, not two. |
| AI Purchase Suggestions | `workflow` | S3.1 Procurement | Reorder-point recommendation, already named in `docs/business/procurement-inventory-design.md`. |
| AI Inventory Optimization | `forecast` | S3.1 Inventory | Safety-stock/reorder-quantity recommendation. |
| AI Demand Forecasting | `forecast` | S2.3 / S3.1 | Feeds both finance revenue forecasting and inventory planning from the same forecast type — one model, two consumers. |
| AI Cash Flow Forecasting | `forecast` | S2.3 | Projects cash position from open AR/AP and recurring journals (S2.2, I-020). |
| AI Budget Forecasting | `forecast` | S2.2/S2.3 | Suggests next-period budget from historical actuals — feeds into S2.2's `Budget` entity (I-020) as a draft, still requires the same approval workflow as a manually-entered budget. |
| AI Fraud Detection / Risk Scoring | `anomaly` | S2.2, S3.1 | Unusual transaction pattern (amount, timing, actor) flags for review — never auto-blocks a transaction, per the "AI never performs high-impact actions" rule. |
| AI Contract Summarization, AI Email Generation | `content_draft` (**new suggestion type, extends S4.2's enum**) | S3.2, S4.1 | Generative-content suggestions; always shown as an editable draft requiring explicit send/save approval, never auto-sent. |
| AI Document Classification | `classification` | S4.1 Document Management (I-018) | Tags an uploaded `DocumentAttachment` by type/module. |
| AI Workflow Recommendations, AI Approval Suggestions | `workflow` | S1.3 | Suggests routing/threshold adjustments based on approval-time patterns — reuses S1.3's workflow engine as the thing being suggested-about, not a second workflow mechanism. |
| AI Customer Insights, AI Vendor Performance Analysis, AI Employee Performance Insights | `report_draft` | S3.2, S3.1 | Pattern-based insight summaries over existing analytics read models (`docs/ai/business-intelligence-design.md`) — no new data collection, just AI-generated narrative over data that's already reported. |

## Security / governance

- Reuses S1.2's exact-permission model for who can *see* an `AiSuggestion` (field/record scope applies to AI output exactly like any other data).
- Prompt injection defense: tenant-supplied content (documents, records) is retrieved as RAG context, never concatenated into the system prompt as instructions — the model is told "the following is data to reason about," not "the following is an instruction."
- Data privacy: AI context assembly never crosses tenant boundaries (hard filter before retrieval, not a post-hoc check).
- OWASP mapping extension: adds an "AI/LLM-specific" row set to `docs/security-authorization-audit.md`'s existing OWASP Top 10 table when this segment builds — prompt injection, training-data leakage (not applicable — no fine-tuning, only RAG over tenant's own already-permission-scoped data), and excessive agency (mitigated by the human-approval gate that already exists).

## Testing strategy

Reuses `verification-matrix.md`'s levels, matching S4.2's locked verify
command. AI-specific cases: confidence-threshold flagging, source-reference
presence (a sourceless suggestion is rejected before display), tenant
isolation in RAG retrieval, provider-port swap test (a mock provider adapter
proves the port abstraction actually works, not just that Claude works),
prompt-injection resistance test (malicious content in a retrieved document
doesn't change the model's behavior toward unrelated data).
