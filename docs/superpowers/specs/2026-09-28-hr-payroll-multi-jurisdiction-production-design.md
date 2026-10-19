# Nexora HR & Payroll Multi-Jurisdiction Production Design

Status: approved design; awaiting written-spec review

Date: 2026-09-28

Scope: HR & Payroll and the Platform/security capabilities required to operate it safely

First supported country: Pakistan, implemented as localization data rather than payroll-core logic

## 1. Purpose

Nexora will be a multi-country, multi-jurisdiction HR and Payroll platform.
Selecting a country in a company profile establishes the default legal context,
but country alone is not always sufficient. The applicable context can also
depend on the company's subnational jurisdiction, the employee's effective work
location, the legal entity and registration structure, local rules, and an
explicit approved override.

The target relationship is:

```text
Company
  -> Country
  -> Subnational jurisdiction, when applicable
  -> Approved localization-pack dependency graph
  -> Effective statutory rule versions
  -> Country-neutral payroll calculation
```

Pakistan is the first implementation target. Pakistan, Punjab, or any other
jurisdiction must not become a permanent assumption in the payroll core.

## 2. Source hierarchy and constraints

When sources disagree, the project source hierarchy applies:

1. Live `app/`, contracts, configuration, migrations, and tests.
2. Locked `architecture.md`, `prd.md`, and `vision.md` intent.
3. Shared canon, hard gates, and verification matrix.
4. Progress, ledgers, memory, and handoff artifacts.

This design preserves these existing decisions:

- Platform C3 owns companies, currencies, policies, and localization settings.
- HR owns employee assignment and payroll behavior.
- The payroll engine remains jurisdiction-neutral.
- Statutory rules are validated, versioned modules.
- Posted and payroll evidence remains immutable.
- Every non-public operation requires tenant-aware identity and permission.
- Material actions fail when immutable audit evidence cannot be written.
- Migrations require forward and rollback evidence.

## 3. Current implementation assessment

The live implementation already provides most prerequisites:

| Existing capability | Live location | Design treatment |
|---|---|---|
| Company and branch hierarchy | `organization_unit` in Platform | Preserve; attach an effective-dated legal profile to company units. |
| Tenant currency catalog | `currency` | Preserve; payroll configurations reference it. |
| Versioned tenant policies | `tenant_policy` | Preserve for general configuration; do not store executable statutory rules in opaque policy JSON. |
| Company setup workflow | `setup_draft` and Platform setup service | Extend with validated legal-profile and payroll-configuration sections. |
| Effective employee placement | `employee_assignment` | Preserve; derive work location from the assignment effective for the payroll period. |
| Work-location master | `hr_master_record` referenced by `employee_assignment.work_location_id` | Add a structured location profile containing address and jurisdiction. |
| Employee tax profile | `employee_tax_profile` | Preserve; use tax residency only when a validated pack declares it applicable. |
| Payroll policy | `hr_payroll_policy` | Add frequency, validity range, and localization activation reference. |
| Country-neutral calculation | `app/hr/payroll.py` | Preserve; it must consume a resolved typed rule set and contain no country branches. |
| Payroll history | `hr_payroll_result.run_number` and immutable result triggers | Preserve; add immutable statutory-resolution evidence per result. |
| Accounting integration | Payroll journal proposal and Finance posting | Preserve; statutory liabilities remain ordinary balanced posting outputs. |

The current module is review-ready for employee foundation, attendance, leave,
generic payroll, Finance posting, employee identity binding, and own payslips.
It is not production-ready for statutory payroll because approved localization
packs, bank execution, and production identity/KMS/HA/SIEM evidence remain
open.

## 4. Research findings

### 4.1 Stable geographic and currency identifiers

ISO 3166 defines maintained country and principal subdivision identifiers, and
ISO 4217 defines three-letter currency identifiers and minor-unit information.
Nexora should use those standards as canonical external identifiers while
retaining internal immutable IDs so later code-list changes do not rewrite
history.

Sources:

- [ISO 3166 country codes](https://www.iso.org/iso-3166-country-codes.html),
  current online guidance accessed 2026-09-28. ISO states that Part 2 covers
  principal administrative subdivisions and that the Maintenance Agency updates
  the lists. Limitation: the standard identifies places; it does not decide
  which employment law applies.
- [ISO 3166-2:2020](https://www.iso.org/standard/72483.html), published 2020-08
  and confirmed current in 2025. Limitation: some legal jurisdictions do not
  map one-to-one to principal administrative subdivisions.
- [ISO 4217 currency codes](https://www.iso.org/iso-4217-currency-codes.html),
  current online guidance accessed 2026-09-28. Limitation: currency never
  determines legal jurisdiction.

### 4.2 Legal employer, registration, and legislative context are separate

Enterprise payroll systems distinguish legal employers, payroll statutory
units, reporting units, registrations, and legislative contexts. Nexora should
therefore attach legal and statutory profiles to the existing company entity
instead of overloading the company row or assuming that one tenant has one
jurisdiction.

Sources:

- [Oracle Legislative Data Groups](https://docs.oracle.com/en/cloud/saas/human-resources/faeii/legislative-data-groups.html),
  current online documentation accessed 2026-09-28. It separates legislation,
  currency, payroll data partitioning, and statutory units. Limitation: this is
  vendor prior art, not legal authority or a schema to copy verbatim.
- [Oracle legal employers, statutory units, and tax reporting units](https://docs.oracle.com/en/cloud/saas/human-resources/faucf/how-legal-employers-work-with-payroll-statutory-units-and-tax.html),
  accessed 2026-09-28. It demonstrates that one or multiple legal employers and
  reporting units can coexist. Limitation: product-specific terminology varies
  by country.
- [Oracle US statutory-unit guidance](https://docs.oracle.com/en/cloud/saas/human-resources/fapus/how-payroll-statutory-units-legal-employers-and-tax-reporting.html),
  accessed 2026-09-28. It records separate federal and state employer
  registrations. Limitation: US examples are architectural evidence only.

### 4.3 National and subnational rules can apply simultaneously

Official guidance from multiple countries demonstrates that payroll may combine
national and subnational obligations and that the employee's place or province
of employment can affect the applicable rules. The resolver must therefore use
a layered context rather than a single country switch.

Sources:

- [IRS Publication 15 (2026)](https://www.irs.gov/publications/p15), published
  for 2026, describes US federal employer withholding and contribution duties.
- [California payroll taxes and withholding](https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding),
  current 2026 guidance, describes separate California contributions and
  withholding. Limitation: California does not define a universal precedence
  algorithm for other jurisdictions.
- [Canada Revenue Agency province-of-employment guidance](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/set-up-new-employee/determine-province-employment.html),
  accessed 2026-09-28, requires determination of the employee's province or
  territory of employment. Limitation: Canada-specific tests cannot be reused
  as rules for other countries.

### 4.4 Effective dates and historical versions are mandatory

Authorities publish current and prior-year rules. A payroll system must retain
the exact approved version used for a period and must distinguish reproduction
from a corrected retroactive calculation.

Sources:

- [Pakistan FBR withholding rate cards](https://ipv6.fbr.gov.pk/withholding-taxes-rate-card/174298/174301),
  accessed 2026-09-28, publishes current and previous tax-year cards. Limitation:
  FBR states that the underlying statute prevails over a convenience rate card.
- [California rates and withholding](https://edd.ca.gov/en/Payroll_Taxes/Rates_and_Withholding),
  current 2026 guidance, links both current and historical rates and wage limits.
- [Canada payroll deduction tables](https://www.canada.ca/en/revenue-agency/services/tax/businesses/topics/payroll/t4032-payroll-deductions-tables.html),
  updated 2026-09-09, provides current and previous-year tables.

### 4.5 AI cannot be the statutory execution authority

Generative models can produce confident factual errors. AI may help identify,
extract, compare, or explain candidate rules, but only validated and approved
deterministic artifacts may execute in payroll.

Sources:

- [NIST AI RMF 1.0](https://www.nist.gov/itl/ai-risk-management-framework),
  released 2023-01-26, calls for governed risk management across design, use,
  and evaluation. Limitation: voluntary and under revision.
- [NIST AI RMF Core](https://airc.nist.gov/airmf-resources/airmf/5-sec-core/),
  2023 framework content, emphasizes documented human roles, accountability,
  and verification and validation.
- [NIST Generative AI Profile](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.600-1.pdf),
  published 2024, identifies confabulation as an inherent generative-AI risk.
  Limitation: cross-sector guidance, not payroll law.

## 5. Chosen architecture

### 5.1 Approach decision

Use a bounded localization framework inside the existing modular monolith.

Rejected alternatives:

- **TenantPolicy-only JSON:** fast to start but insufficient for rule-level
  approval, relational integrity, conflict detection, and historical proof.
- **Immediate localization microservice:** adds availability, transaction,
  deployment, and version-coordination risk before multiple country packs
  justify extraction.

The modular boundary must permit later extraction through a stable provider
interface without requiring payroll-core redesign.

### 5.2 Ownership

```text
Platform C3
|- Country and jurisdiction catalog
|- Company legal profiles and statutory registrations
|- Localization-pack registry, versions, dependencies, and activation
`- Company setup orchestration

HR & Payroll
|- Work-location jurisdiction context
|- Employee jurisdiction overrides
|- Typed payroll statutory rule versions and test vectors
|- Jurisdiction resolver and StatutoryRuleProvider
`- Immutable calculation evidence

Country-neutral Payroll Core
`- Executes only ResolvedStatutoryRuleSet
```

Finance `TaxRule` remains a Finance concern. It may reuse geographic identifiers
later, but it must not become the payroll statutory-rule store.

## 6. Data model

All mutable business configuration is tenant/company scoped and protected by
RLS. ISO geography and centrally published pack metadata may be system-scoped,
read-only reference data. Tenant/company activation remains tenant scoped.

### 6.1 Platform records

#### `country`

- `id`
- `iso_alpha2`
- `iso_alpha3`
- `name`
- `status`
- `valid_from`, `valid_to`

#### `jurisdiction`

- `id`
- `country_id`
- `parent_id`
- `level`: `national`, `subnational`, or `local`
- `code`
- `name`
- `status`
- `valid_from`, `valid_to`

Every country has exactly one national jurisdiction. A city is an address field
unless rules apply at that locality; only then does it become a jurisdiction
node.

#### `legal_entity_type`

- `id`, `country_id`
- stable code and display name
- `valid_from`, `valid_to`, and status

Company legal entity type is selected from an effective country-scoped catalog,
not entered as unrestricted text. A localization pack may declare additional
applicability by legal entity type without embedding those types in payroll
code.

#### `company_legal_profile`

- `id`, `tenant_id`, `company_id`
- `legal_entity_type`
- `registered_jurisdiction_id`
- structured registered address including locality
- `effective_from`, `effective_to`
- `state`: `draft`, `approved`, `active`, `superseded`
- approval and audit references

The existing `organization_unit(type='company')` remains the company identity.
Legal facts live in this effective-dated adjunct record.

#### `company_statutory_registration`

- company and issuing jurisdiction
- registration category
- encrypted identifier plus masked display value
- `effective_from`, `effective_to`
- status and evidence reference

Plain registration identifiers must never appear in logs, audit payloads, or
ordinary list responses.

#### `localization_pack`

- stable key, domain, country, target jurisdiction, owner, status

#### `localization_pack_version`

- pack, semantic version, effective range
- lifecycle state
- publication, validation, approval, activation, and supersession metadata
- source manifest, content hash, and artifact hash

#### `localization_pack_dependency`

- dependent pack version
- required parent pack/version constraint
- declared stacking/merge contract

Cycles are prohibited. For example, a Punjab pack depends on a compatible
Pakistan Federal version; it does not copy federal rules.

#### `company_localization_activation`

- tenant, company, jurisdiction, pack/version
- effective range
- activation approval and audit reference

### 6.2 HR records

#### `work_location_profile`

Extends the existing work-location master with structured address and
`jurisdiction_id`.

#### `hr_payroll_policy` additions

- `payroll_frequency`
- `effective_from`, `effective_to`
- localization activation reference

Existing `currency_code` remains the payroll currency and continues to
reference the Platform currency catalog. Payroll frequency uses controlled
machine codes such as weekly, biweekly, semimonthly, monthly, four-weekly, or a
validated custom schedule; the active pack determines which schedules are
legally supported.

#### `employee_jurisdiction_override`

- tenant, company, employee assignment
- rule scope: payroll tax, social security, employment law, leave, reporting,
  or another registered category
- jurisdiction
- legal basis and reason
- `effective_from`, `effective_to`
- requested, reviewed, and approved identities/timestamps
- evidence and audit references

The normal context derives from the effective assignment and work location.
An override is exceptional, scoped, effective-dated, approved, and visible in
the payroll evidence.

#### `statutory_rule_version`

- localization pack version
- stable rule key and category
- effective range and applicability predicates
- rule type: parameter table, bracket table, threshold/cap, formula, calendar,
  eligibility condition, or reporting definition
- typed rule data
- official source references and hashes
- review/approval evidence and content hash

Arbitrary executable code and AI-generated instructions are prohibited.

#### `statutory_rule_test_vector`

- rule/pack version
- named scenario
- canonical inputs and expected outputs
- rounding expectations
- reviewer and approval evidence

#### `payroll_statutory_snapshot`

Stored per employee payroll result/run:

- effective company legal profile
- derived and overridden jurisdiction decisions by rule scope
- localization pack versions and dependency order
- statutory rule version IDs
- calculation-engine version
- canonical input/output hashes
- recalculation mode and prior-result reference when applicable

The snapshot is immutable with the payroll result.

## 7. Company setup and jurisdiction resolution

### 7.1 Company setup

The company profile captures:

1. Country.
2. State, province, territory, or region when applicable.
3. City/locality and registered address.
4. Legal entity type.
5. Payroll currency.
6. Payroll frequency.
7. Employer, tax, and social-security registrations as applicable.

The system then displays the approved eligible pack stack, coverage, effective
dates, missing configuration, and required registrations. The user never enters
or selects individual statutory rates.

Company setup may remain a draft when a pack is unavailable. Statutory payroll
calculation, approval, and posting remain blocked until complete approved
coverage exists.

### 7.2 Resolution algorithm

For each employee payroll result:

1. Resolve the payroll period and effective company payroll policy.
2. Resolve the effective company legal profile.
3. Resolve the employee assignment and structured work location effective for
   the earning/payroll period.
4. Load employee facts that an approved rule explicitly requires, such as tax
   residency or worker category.
5. Apply approved scoped jurisdiction overrides.
6. Build the national-to-subnational-to-local jurisdiction path per rule scope.
7. Resolve active approved pack versions and their dependency graph.
8. Select approved statutory rule versions effective for the payroll period.
9. Validate complete coverage, applicability, dependencies, and conflicts.
10. Produce an immutable `ResolvedStatutoryRuleSet`.
11. Pass only that typed result to the country-neutral payroll engine.
12. Persist the payroll result and statutory snapshot atomically.

There is no network lookup, AI inference, unapproved fallback, or generic
last-write-wins behavior in this path. Each rule category declares its stacking
semantics. An ambiguous conflict fails closed.

### 7.3 Required situations

| Situation | Required behavior |
|---|---|
| Company and employee use the same subnational jurisdiction | Apply compatible national and subnational packs. |
| Employee works in a different subnational jurisdiction | Resolve each rule scope using the effective work location and validated jurisdiction rules. |
| Employee changes jurisdiction | Create new effective assignment/location/override facts; preserve prior payroll context. |
| Employee works across jurisdictions in one period | Allocate earnings/time when the approved rules require it, otherwise require an approved determination; never silently choose. |
| Country has no meaningful subnational layer | Use the national pack only. |
| Locality has applicable rules | Stack an approved local pack after its parent packs. |
| Special zone, industry, treaty, secondment, or exemption applies | Use typed applicability conditions or an approved scoped override. |
| Payroll currency differs from local currency | Do not infer jurisdiction from currency; enforce pack-specific legality and conversion rules. |
| Company changes registered jurisdiction | Create a new effective legal profile and activation; retain old context for history. |
| Tenant owns companies in different countries | Resolve every company independently under the same tenant isolation boundary. |

## 8. Historical calculation

Two explicit modes are supported:

- **Reproduce original:** execute from the exact pack/rule snapshot recorded by
  the original payroll result.
- **Corrected recalculation:** select the latest approved rule versions legally
  effective for the historical period, create a new run, link it to the original,
  record the correction reason, and preserve both results.

Valid time (`effective_from`/`effective_to`) and system knowledge time
(`approved_at`/`superseded_at`) remain distinct so retroactive legal changes can
be represented without rewriting history.

## 9. Pack governance

Lifecycle:

```text
Draft -> Validated -> Compliance review -> Approved
      -> Scheduled/Active -> Superseded -> Retired
```

Activation requires:

- authoritative sources with publication/retrieval dates and hashes;
- effective dates and applicability scope;
- deterministic golden test vectors;
- dependency and conflict validation;
- impact comparison with the current active version;
- independent compliance and technical approvals;
- segregation between author, approver, and activator;
- successful staging and regression verification;
- identical artifact hash promoted to production.

Activated versions are immutable. A law change creates a new version. A
retroactive correction creates a new version with its legal effective date and
later approval/publication time. Rollback can activate only an earlier approved
version that remains legally valid; it never deletes evidence.

AI may identify sources, extract a candidate rule, explain differences, or
prepare a draft test case. AI cannot approve, activate, override, or execute a
statutory rule.

## 10. Security, errors, and audit

### 10.1 Permissions and separation of duties

Required permission families include:

- `platform.localization.read`
- `platform.localization.activate`
- `hr.statutory_rule.author`
- `hr.statutory_rule.review`
- `hr.statutory_rule.approve`
- `hr.jurisdiction_override.manage`
- `hr.payroll.recalculate`

An author cannot approve the same version. An approver cannot self-activate.
Payroll operators cannot create silent overrides. Tenant administrators can
activate eligible approved packs but cannot alter centrally managed statutory
rules.

### 10.2 Fail-closed errors

- `jurisdiction_context_incomplete`
- `localization_pack_not_approved`
- `localization_pack_coverage_missing`
- `localization_dependency_conflict`
- `statutory_rule_not_effective`
- `statutory_rule_conflict`
- `jurisdiction_override_unapproved`
- `historical_rule_snapshot_missing`

Errors identify the missing configuration without exposing registration or
employee secrets. They block payroll approval/posting rather than substitute a
guess.

### 10.3 Immutable evidence

Audit records cover pack/rule creation, validation, review, approval,
activation, supersession, company activation, jurisdiction determination,
overrides, recalculation mode, and the exact versions used for every employee
result. Material changes and their audit events commit or roll back together.

## 11. Delivery roadmap

| Phase | Scope | Exit gate |
|---|---|---|
| 0 | Architecture and compliance ownership | Approved specification, source policy, pack owners, and first provincial target selected before pack implementation. |
| 1 | Global company and jurisdiction foundation | Multiple companies in different jurisdictions configure successfully without payroll-core country logic. |
| 2 | Generic localization framework | Pack versions, dependencies, approvals, conflict checks, and test-vector runner pass generic multi-country fixtures. |
| 3 | Country-neutral payroll integration | Every statutory calculation records its exact resolved context and versions; existing payroll behavior remains green. |
| 4 | First validated country pack | Pakistan Federal plus the selected province passes independently approved statutory vectors with no country branch in payroll core. |
| 5 | Complete HR lifecycle | Contracts, recruitment, onboarding, expenses, performance, training, offboarding, final settlement, statutory documents, and HR reports have governed APIs/UI/tests. |
| 6 | Payroll operations and integrations | Statutory outputs, bank adapter, payment reconciliation, corrections, and year-end processing reconcile end to end. |
| 7 | Production security and reliability | Managed identity/MFA, KMS, backups/restore, HA, SIEM, retention, monitoring, load and disaster-recovery evidence pass. |
| 8 | Parallel run and controlled launch | Representative migration rehearsal and at least two to three shadow payroll cycles reconcile before live salary processing. |

Only HR & Payroll and necessary Platform/security dependencies are in scope.
Other ERP modules are not expanded.

## 12. Verification strategy

### 12.1 Automated verification

- Unit tests for hierarchy, dependency resolution, applicability, effective
  boundaries, overrides, cycles, missing coverage, and conflicts.
- Legally reviewed golden vectors for thresholds, brackets, caps, rounding,
  joiners, leavers, partial periods, zero, and upper-bound cases.
- Historical reproduction and corrected-recalculation tests.
- Positive, negative, cross-tenant, and cross-company integration tests.
- RBAC/SoD, masking, audit atomicity, and unauthorized activation tests.
- PostgreSQL forward migration and safe rollback/refusal evidence.
- API contract snapshots.
- Canonical unit, integration, contract, security, end-to-end, and migration
  suites.
- Frontend API drift, lint, TypeScript, build, and accessibility checks.

### 12.2 Production acceptance

- Representative payroll-volume test.
- Production-like backup and restore exercise.
- Managed identity, MFA, KMS, audit archive, and monitoring proof.
- Two to three shadow payroll cycles.
- Gross-to-net, statutory liability, journal, and payment reconciliation.
- Signed HR, payroll, finance, security, and compliance acceptance.
- Tested rollback and manual payroll-continuity procedure.

## 13. First implementation batch

`HR-LOC-01 - Global Jurisdiction and Company Legal Profile Foundation`

In scope:

1. ISO-based country references.
2. Hierarchical national, subnational, and optional local jurisdictions.
3. Effective-dated company legal profiles.
4. Legal entity type and registered address/locality.
5. Protected statutory-registration metadata.
6. Company payroll currency and frequency setup.
7. Platform setup-draft and API integration.
8. Permissions, audit, RLS, migrations, rollback safety, contracts, and tests.

Acceptance fixtures demonstrate, as configuration rather than hard-coded rules:

```text
Tenant A
|- Company 1 -> Pakistan -> Punjab -> PKR -> Monthly
|- Company 2 -> Canada -> Ontario -> CAD -> Biweekly
`- Company 3 -> national-only test jurisdiction
```

Out of scope for this batch:

- Pakistan statutory rates.
- Payroll-calculation changes.
- Pack activation.
- AI rule generation.
- Bank execution.
- Unrelated ERP modules.

Planned follow-on batches:

- `HR-LOC-02`: pack registry, versions, governance, and test-vector framework.
- `HR-LOC-03`: resolver, dependency stacking, and approved overrides.
- `HR-LOC-04`: payroll provider integration and immutable snapshots.
- `HR-PK-01`: Pakistan Federal plus the selected first provincial pack.

## 14. Decision gates before country-pack implementation

These are explicit production gates with named closure conditions:

- The product/compliance owner selects the first Pakistan province before
  `HR-PK-01` starts.
- A qualified payroll/legal owner approves authoritative sources, interpretations,
  and golden vectors.
- Treasury selects the bank adapter and payment-data policy before automated
  payment execution.
- Operations selects and proves managed identity, KMS, HA/restore, SIEM,
  retention, and monitoring controls before production launch.

Failure to satisfy a gate leaves the corresponding capability unavailable and
must not be represented as production-ready.

## 15. Definition of success

The design is successfully implemented when a tenant can operate multiple
companies across countries and jurisdictions; each employee payroll result uses
the correct effective approved pack stack; historical results are reproducible;
corrections are explicit and immutable; no country-specific rule exists inside
the payroll core; AI cannot activate or execute rules; and the full HR & Payroll
production gates pass without statutory, security, or operational waivers.
