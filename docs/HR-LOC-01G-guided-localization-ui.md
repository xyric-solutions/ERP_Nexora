# HR-LOC-01G — Guided Platform and HR Localization UI

## Scope and boundary

HR-LOC-01G exposes the approved country-neutral localization framework through
two permission-aware Nexora workspaces. It does not add reference-country data,
statutory rules, payroll calculations, database changes, or production
activation shortcuts. All mutations continue to be authorized, validated,
audited, and isolated by the existing 01D–01F backend services.

## Navigation and screens

- **Administration → Localization setup** (`/organization/localization`) is the
  controlled company setup and readiness workspace.
- **HR & Payroll → Localization** (`/hr/localization`) is the work-location,
  employee-resolution, override, rule-evidence, and statutory-snapshot workspace.
- Payroll periods link directly to the HR localization workspace with the period
  selected for read-only snapshot review.

## Company localization setup

The company workspace requires an explicit company and effective date. It keeps
four states separate:

1. jurisdiction identified;
2. localization pack available;
3. localization pack approved and active; and
4. statutory compliance assessed.

The guided form uses live country, jurisdiction, legal-entity, pack, currency,
and frequency data. It stages legal profile, payroll configuration, optional
masked registration, and optional pack activation sections in the existing
setup-draft workflow. It never labels a company compliant merely because a
country, jurisdiction, or pack was selected. Coverage gaps and the Q-007/Q-010
activation boundary remain visible.

## Employee localization and preview

The HR workspace provides:

- effective work-location jurisdiction mappings;
- effective employee/assignment overrides with maker-checker actions;
- a non-mutating deterministic resolution preview;
- the explainable chain `Legal employer → Assignment → Work location → Jurisdiction`;
- applicable pack and rule-version evidence; and
- explicit blockers for missing, ambiguous, unapproved, expired, dependency-
  invalid, and cross-country contexts.

Jurisdiction is never inferred from currency, locale, address text, time zone,
IP/device location, or AI. The server remains authoritative for resolution,
same-country validation, cross-border failure, approval, and audit.

## Statutory snapshot visibility

Authorized users can view the payroll period, employee, jurisdiction, pack and
rule versions, employee/employer amounts, seal status, and original/corrected
relationship and source evidence. The workspace exposes no snapshot mutation.
Historical evidence remains governed by the immutable 01F backend.

## Permissions and security

Navigation, queries, and actions are gated by the existing granular Platform
and HR permissions. Company setup additionally requires setup-draft creation and
the relevant legal-profile, registration, payroll-configuration, and activation
permissions. Override approval is distinct from override management, and the UI
prevents same-maker approval when current-user evidence is available. Backend
RBAC, tenant/company scope, PostgreSQL RLS, audit, idempotency, and maker-checker
controls remain authoritative; the browser does not replace them.

Sensitive statutory registration input is limited to a masked display value.
No plaintext registration identifier or secret is collected by this UI.

## API use

The typed client consumes existing protected endpoints for countries,
jurisdictions, legal-entity types, localization packs/versions, company legal
profiles, registrations, payroll configurations, activations, setup drafts,
work-location profiles, jurisdiction overrides/actions, resolution previews,
statutory rules/versions, and payroll statutory snapshots. Employee,
assignment, master-data, company, payroll-period, and payroll-result endpoints
are reused rather than duplicated.

## UX, accessibility, and responsive behavior

Both workspaces provide loading, empty, error, validation, and blocking states;
effective dates are shown wherever they affect interpretation. Existing Nexora
cards, alerts, tables, badges, dialogs, sheets, forms, and responsive grids are
reused. Searchable catalog controls retain visible labels and native keyboard
selection. Sensitive mutations require explicit submit/confirmation flows, and
audit/history links are provided where the existing product surface supports
them.

## Deferred work

- Real reference catalogs and production activation remain blocked by Q-010.
- Real statutory packs and compliance claims remain blocked by Q-007.
- Full sensitive registration storage remains blocked by Q-004.
- Cross-border employment/payroll remains fail-closed until its separately
  approved model exists.
- HR-LOC-01H remains unopened pending explicit owner approval.
