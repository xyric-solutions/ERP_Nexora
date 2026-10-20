# Central Chart of Accounts template and company adoption

Status: central-template approach approved in conversation; written specification
awaiting user review. No template migration or company adoption has run.

## Outcome and boundary

Maintain one reusable Category -> Section -> Nominal definition catalog for an
ERP tenant. Each company adopts its own account identities from that catalog.
One PostgreSQL schema serves all companies; company accounts, bank capabilities,
balances, transactions, journals, approvals and fiscal-period settings remain
separate. Tenant isolation remains in force: central does not mean shared with
unrelated customer tenants.

This extends Finance master data, not the accounting engine. Preserve the
existing `account` identity, Finance posting service and Bank nominal lifecycle.
Do not create company records, change company access grants, open financial
periods, assign currencies or approve financial transactions as a side effect
of importing a central template.

## Source and verified starting point

- Approved source: `outputs/coa-visual-transcription-20261020/chart-of-accounts-review.xlsx`.
  It contains 14 Categories, 78 Sections, 234 distinct Nominals, 237 Source Rows
  and 11 Review records. The current file was inspected as an XLSX, not assumed
  equivalent to a sibling CSV.
- The user has instructed that this workbook supplies the catalog. Preserve its
  names/codes and source provenance. Repeated source codes 510104, 711306 and
  711314 represent one template nominal each, with all occurrences retained in
  import evidence. Conflicting same-code payloads must be rejected, not merged.
- Existing `account` records and their parents are tenant/company-scoped.
  `finance_nominal_section_policy` permits one Cash & Bank policy per company;
  its allocator and existing account identities must not be overwritten.
- Ordinary governed nominals require a currency and draft/submit/decision
  evidence. A reusable template definition is not itself a posting account and
  does not need an invented company currency or Bank capability.
- Local source data has only test companies, including default R06-UAT, and
  only USD in Currency Master. No Xyric Solutions LLP company is present.
- Chart of Accounts and Nominals already read the independent Finance API.
  Central template persistence, adoption and management views are not present.
  No production company-registration write hook was identified in the inspected
  API; automatic registration integration must wait for a real onboarding path.

## Chosen architecture and alternatives

Chosen: tenant-owned, versioned templates plus explicit company adoption and
stable source mappings. Central definitions are reusable, but never own money.

Alternatives not selected:

1. One shared posting account per code across companies: risks mixed balances,
   access leaks and incorrect approval/accounting scope.
2. Independent catalogs with no central source: preserves isolation but loses
   the user's reusable master-data structure and repeatable setup.

## Template data and import

Add Finance-owned template storage through a new additive migration after the
current migration ledger. Separate a template revision, its category/section/
nominal nodes and immutable import evidence. These records carry tenant and
revision ownership, not a destination company.

- Store codes as text. Enforce revision-scoped code uniqueness, valid node
  levels and same-revision parent relationships: category -> section -> nominal.
- Preserve supplied section and nominal codes. Categories have no source codes;
  use stable internal identifiers, not made-up business category numbers.
- Map presentation categories to existing account types: Capital & Reserves to
  equity; liabilities to liability; asset categories to asset; Income and Other
  Income to revenue; expense/cost/tax categories to expense. Record this mapping
  explicitly and retain the workbook's display labels.
- Import a normalized, validated workbook manifest using the backend boundary.
  Do not ship a browser-to-database connection or add an Excel parser to the
  browser. Record source hash, revision hash, actor and source row provenance.
- Import is atomic, bounded and idempotent. Same key with a different payload
  is a conflict. A published revision is immutable; revisions do not silently
  rewrite definitions already adopted by companies.
- Do not import balances, journals, guessed bank currencies, tax rates or
  guessed manual-posting/control classifications.

## API, security and Master Data UI

Keep the established direction: web adapter -> `/api/v1/finance` -> session,
authorization and feature service -> repository -> PostgreSQL.

Define template directory/detail, validated import/publish, company-adoption
preview and explicit adoption contracts in `packages/contracts`, with bounded
pagination and standard problems. Generate OpenAPI/client output together with
the implementation. Planned endpoints are not assertions of existing routes.

Introduce explicit tenant-scoped template administration/read capabilities and
company-scoped adoption authority through the established permission catalog.
Ordinary company nominal create permission alone must not permit changing every
company's central setup. Use cookie sessions, CSRF/origin controls, idempotency,
expected revisions, tenant RLS and immutable audit evidence. No HR permission or
super-admin override policy is weakened by this work.

Expose the template under the existing Master Data/Finance navigation, alongside
the company Chart of Accounts. Clearly label Central Template versus Company
Accounts; do not present template rows as live bank/payment accounts. Provide
category/section grouping, search, pagination and loading/empty/error/denied/
success states using existing UI primitives. Company adoption shows its company
and preview explicitly before confirmation.

## Company adoption and financial safeguards

Adoption requires an explicitly selected accessible company. It must never
choose a UAT company merely because it is the current login default.

1. Preview new records, exact existing matches, code/name/type/parent conflicts,
   missing currency/setup and control-classification decisions. Reject ambiguous
   matches; names alone are not identity.
2. Save a stable company-account-to-template-node/revision mapping. Replays
   return prior results without duplicates. Use transaction/advisory locking to
   prevent concurrent code allocation/adoption races.
3. Create ordinary company nominal drafts through the governed Finance model
   with explicit company currency. Approval continues through existing server
   authority and immutable events. Catalog adoption does not grant approval.
4. Cash and Bank definitions do not automatically establish real Bank accounts.
   Each company chooses its own Bank nominal and currency through the existing
   Bank workflow. Preserve the seven supplied Cash and Bank definitions as
   available reference definitions; do not copy one company's bank facilities
   into every company or enable them as ordinary payment offsets.
5. Controls such as Debtors, Trade Creditors, inventory and tax liabilities
   require explicit posting ownership before activation. Preserve protected
   manual-posting/system/reconciliation predicates in Bank selectors.
6. Existing accounts, parents, codes, journal references and immutable history
   are not deleted or silently reparented. In particular, report the current UAT
   Cash & Bank policy conflict instead of replacing it with section 2309.

Later template revisions require a new preview/adoption decision. No automatic
cascade rename, reclassification, deactivation or journal alteration is allowed.

## Delivery slices and acceptance

CT-01: central template persistence and the workbook catalog.
Add migration/constraints/RLS, normalization/validation, authorized idempotent
import/read APIs and tests. Acceptance: exactly 14/78/234 definitions persist,
survive restart, replay without duplicates and cannot leak across tenants. No
company account or financial record changes. This slice needs no new company
or guessed currency and can precede company selection.

CT-02: central Master Data navigation and template browsing.
Use generated API types and database records only. Acceptance: all categories,
sections and nominals are navigable/searchable with provenance and permission/
failure states, clearly distinct from company account balances.

CT-03: company adoption preview, mapping and governed draft creation.
Implement explicit destination/company currency and classification choices,
conflict handling, transactional mapping and repeatable adoption. Acceptance:
two isolated test companies can use the same source code with different account
IDs, and cannot read/write each other's records. Existing Bank policy conflicts
block adoption without partial writes. No implicit approval/posting occurs.

CT-04: activation and Bank acceptance.
Complete classification decisions, existing Finance/Bank approval workflows and
company-specific Bank setup. Verify eligible ordinary nominals appear in live
Payment/Receipt selectors; headers, drafts and protected accounts do not.
Exercise save/reload and authorized approval on synthetic data. Journal posting
requires separately configured fiscal periods and existing posting controls.

For each slice run focused unit/API/integration/security tests on an explicitly
isolated database, generated-contract checks, typecheck, relevant lint and web
build. Verify migrations and source readiness before any authorized local apply.
Do not claim the complete Bank/Finance/ERP production-ready from template setup.

## Required handoff

Update the existing catalog review and remaining UI migration document with
completed slices, exact observed checks and next safe resume point. The current
Payment layout and approver/project/location requests are separate unfinished
work; this template design does not claim to complete them.
