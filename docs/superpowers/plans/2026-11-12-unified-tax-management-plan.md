# Unified tax management implementation plan

Approved design: ../specs/2026-11-12-unified-tax-management-design.md

1. Add strict contracts, exact tax arithmetic, company-scoped relational migrations,
   admin mapping authority, immutable revisions/applications and shared resolver.
2. Wire persistent API routes, generated client and runtime readiness.
3. Integrate resolver and posting evidence into receivable/payable recognition,
   supplier settlement, procurement sources and governed Payroll components.
4. Restructure navigation and add responsive tax console/form with shared tokens.
5. Verify calculation, database security, posting, API, navigation and browser
   flows; run type/build/theme/catalogue checks and update rollout documentation.

Use existing source services and no new dependencies. Preserve earlier uncommitted
multicurrency work. Shared runtime activation requires an identified environment.
