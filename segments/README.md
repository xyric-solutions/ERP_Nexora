<!-- BUILD_READY: Nexora -->
# Nexora Segment Plan

Segment Plan: `segments/`

Segments -> batches (1:1), ordered:

1. S1.1 - Platform API Shell and Binding Standards
2. S1.2 - Identity, Security, and Audit
3. S1.3 - Tenant, Configuration, and Workflow Foundation
4. S1.4 - Frontend Foundation
5. S2.1 - Accounting Event Ledger
6. S2.2 - Finance Core Posting
7. S2.3 - Finance Reporting and Analytics
8. S3.1 - Procurement and Inventory Core
9. S3.2 - Sales, HR, and Projects Core
10. S3.3 - Manufacturing and Vertical Framework
11. S4.1 - Integration, Notification, and Document Platform
12. S4.2 - AI Assistant Governance
13. S4.3 - Platform Operations Handoff

Segment IDs are reused verbatim as Forgeflow batch IDs. The locked Blueprint
documents are canonical for intent. Once implementation exists, live
code/config/tests win ties and any disagreement is logged as drift.

Amendment 2026-08-06: S1.4 added (frontend had no owning segment); S4.1
renamed and extended to own File/Document Management (no segment owned it
before). See `accepted-improvements.md` I-017/I-018. Thirteen segments total.

Productionization amendments 2026-09-25: `HR-01-hr-foundation.md`,
`HR-02-attendance-leave.md`, and `HR-03-payroll.md` are owner-authorized,
module-gated Phase 8 slices beneath S3.2. They do not renumber the locked
13-segment Blueprint.

Blocker-remediation amendment 2026-09-25: `SEC-PG-01-postgresql-security.md`
is the owner-authorized PostgreSQL Security productionization slice. It reuses
S1.2/S1.5 traceability and does not add or renumber a Blueprint capability.
`WF-PG-01-postgresql-workflow.md` follows it as the owner-authorized Workflow
and shared-transaction slice, reusing S1.3/S1.5 and HR-01 traceability without
renumbering the Blueprint.
`FIN-PG-01-postgresql-finance.md` follows as the owner-authorized Finance
PostgreSQL and controlled payroll-posting slice, reusing S2.1-S2.3 and HR-03
traceability without renumbering the Blueprint.
`HR-ID-01-employee-identity.md` follows as the owner-authorized employee
identity and own-payslip authorization slice, reusing S1.2 and HR-01/HR-03
traceability without renumbering the Blueprint.
