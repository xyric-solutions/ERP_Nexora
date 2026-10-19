# HR-OT-MON — Compensation-Aware Monetary Overtime

- Date: 2026-10-05
- Status: approved by owner for implementation
- Scope: Phase 1 only
- Active roots: `app/`, `contracts/`, `web/`, focused tests and verification evidence
- Source priority: live schema/code/tests win implementation ties; this approved design governs new HR-OT-MON behavior

## Objective

Extend Nexora's existing PostgreSQL compensation, Overtime and Payroll authorities so approved Overtime quantities can become deterministic monetary Payroll earnings. The implementation must support fixed, contractual and hourly compensation without assuming one compensation frequency, divisor, multiplier, component or rounding rule.

The completed authority chain is:

```text
Company-approved OT configuration
    -> approved effective employee/category OT arrangement
    -> approved OT request and operational quantity rule
    -> effective compensation assignment and salary segment
    -> deterministic monetary calculation
    -> immutable OT evidence and existing Payroll earning line
    -> review/approval/Finance/payslip/reports
```

## Non-goals

- Pakistan statutory or tax rules.
- Bank or payment export.
- Demo dataset expansion.
- General HR workspace redesign.
- A second salary, Attendance, Overtime, Payroll, Finance or approval engine.
- Free-text OT formulas or inferred payroll policy.
- Recalculation or reinterpretation of September 2026 Payroll run 1.

## Existing Authorities Preserved

- `hr_salary_assignment` remains the employee compensation assignment authority.
- `hr_salary_structure`, `hr_salary_structure_item` and `hr_pay_component` remain the component/template and GL-mapping authorities.
- Effective salary segments remain the period-correct Payroll compensation evidence.
- `hr_overtime_request` remains the approved OT quantity authority.
- `hr_overtime_rule` remains the operational threshold, cap and quantity-rule authority.
- `hr_payroll_input` remains the immutable Attendance/Leave/OT input boundary.
- `hr_payroll_result`, result items and salary segments remain the Payroll result authority.
- Existing Payroll lifecycle, Finance posting, payslip release, reports, RBAC, audit, idempotency and maker-checker boundaries remain authoritative.

## Compensation Model

### Assignment classification

`hr_salary_assignment` gains nullable legacy-compatible classification fields:

- `compensation_type`: `fixed`, `contractual`, or `hourly`.
- `payment_basis`: `hourly`, `daily`, `weekly`, `monthly`, `annual`, or `custom`.
- `compensation_model_version`: identifies compensation-aware assignments created after HR-OT-MON.

Existing rows are not backfilled or inferred. New compensation-aware assignments must provide all required classification through the service and database validation. A legacy assignment without these fields remains readable and can reproduce historical Payroll but cannot participate in new monetary OT.

### Assignment component evidence

New immutable assignment-owned component rows bind an approved salary assignment to the exact existing structure components and configured values effective for that assignment. They are evidence within `hr_salary_assignment`, not a second compensation authority.

Each row retains:

- assignment and existing pay-component references;
- source salary structure/item reference;
- component order and existing calculation method;
- configured amount or existing controlled component formula snapshot;
- component currency inherited from the assignment;
- source/evidence hash.

The existing Payroll formula engine remains authoritative for existing controlled salary-component formulas. HR-OT-MON does not add free-text custom OT formulas. Monetary OT basis selection rejects a component that creates an OT dependency cycle or cannot produce deterministic work-date evidence.

### Effective dating

Every compensation revision remains a new `hr_salary_assignment`. Existing non-overlap constraints and approval lifecycle remain in force. New assignment component evidence becomes immutable when the assignment is approved or effective.

## Company OT Monetary Policy

### Stable identity and versions

The company authority is split into a stable identity and immutable effective versions:

- `hr_ot_monetary_policy`
- `hr_ot_monetary_policy_version`

Each policy version is company-scoped, category-specific, effective-dated and maker-checker controlled. Proposed states are `draft`, `submitted`, `approved`, `released`, `retired`, and `rejected`. Only released versions can be selected by HR or used by Payroll. Released versions are immutable; later changes create a new version.

Released versions for the same company, policy scope and category may not overlap. PostgreSQL exclusion constraints enforce the effective-date invariant.

### Controlled company options

Normalized child records define choices available to HR:

- compensation/rate-basis options;
- permitted compensation components and single/multiple selection limits;
- ordinary-hours/divisor options;
- multiplier options;
- rounding options;
- existing earning-component options;
- bounded custom calculation-template steps.

Every option belongs to one policy version and becomes immutable with that released version. HR cannot supply an unregistered value.

### Supported basis methods

Controlled basis options support:

- direct hourly amount;
- daily basis divided by approved ordinary hours/day;
- weekly basis divided by approved ordinary hours/week;
- monthly basis divided by approved ordinary hours/month;
- annual basis divided by approved ordinary hours/year;
- company-approved bounded custom template.

The basis source is explicit: configured assignment-component amount, calculated salary-segment component amount, or approved direct contractual amount. Multiple components are summed only when the chosen policy option permits multiple selection.

### Controlled custom templates

Custom compensation never stores expression text. A company may release versioned templates composed of validated ordered steps from a bounded set:

- select or sum approved components;
- use an approved direct contractual rate;
- divide by an approved ordinary-hours value;
- convert approved minutes to hours;
- apply an approved category multiplier;
- round at an approved stage.

The validator rejects missing inputs, unsupported order, duplicate conversion, arbitrary operators, recursion and any template that cannot be replayed deterministically.

### Rounding

Company options may select only these controlled modes:

- `half_up`
- `half_even`
- `down`
- `up`

Supported controlled stages are:

- `hourly_rate`
- `per_ot_day`
- `final_employee_period`

The option records minute-to-hour precision, hourly-rate precision, intermediate amount precision and final currency scale. No value is defaulted by the UI or service.

## Employee OT Arrangement

`hr_employee_ot_arrangement` is mandatory for every OT-eligible employee and each OT category. It is effective-dated and references one released company policy version plus the exact approved basis, ordinary-hours, multiplier, rounding and earning-component options selected by HR.

Selected compensation components are stored in child rows and must belong to the chosen policy version's allowed component set. One approved/effective arrangement may exist per tenant, company, employee, category and date. PostgreSQL exclusion constraints reject overlap.

Arrangement states follow a maker-checker lifecycle: `draft`, `submitted`, `approved`, `effective`, `superseded`, `rejected`, and `cancelled`. Creator and approver must be different actors. Used arrangements are immutable.

Contractual compensation uses the same arrangement authority. It cannot bypass company policy. A contractual option is available only when the released company version permits the compensation type, basis, components, divisor, multiplier, rounding and earning component. Missing company configuration blocks arrangement approval.

## Operational Rule and Locked Input Binding

`hr_overtime_rule` remains non-monetary. It is extended for future effective-dated/versioned operational rows without reclassifying existing data. Existing rows remain legacy quantity rules and their `multiplier` field is never treated as monetary authority.

Approval of a new OT request binds the request to the exact effective operational rule. New locked Payroll input evidence uses a new evidence version and records, per OT day:

- approved request;
- operational rule;
- approved employee arrangement;
- company monetary-policy version;
- selected option identifiers;
- evidence hashes.

Legacy input evidence remains quantity-only and cannot generate monetary OT.

## Resolution and Calculation

For each approved OT work date, Payroll resolves exactly once:

1. Approved OT request and minutes.
2. Effective operational quantity rule.
3. Effective approved employee/category arrangement.
4. Released referenced company monetary-policy version.
5. Effective employment context.
6. Effective salary/contract assignment and salary segment containing the work date.
7. Arrangement-selected compensation components and basis source.
8. Approved ordinary-hours, multiplier and rounding options.
9. Existing earning component and valid GL mapping.

Direct hourly options use the approved hourly amount. Converted options divide the approved basis amount by the explicitly configured ordinary-hours value for that basis. Approved minutes are converted to hours using Decimal unit conversion and the configured precision. The category multiplier and configured rounding stage/mode are applied afterward.

All arithmetic uses `Decimal` in Python and `numeric` in PostgreSQL. Float conversion is prohibited.

Per-date amounts are aggregated into one or more existing Payroll earning lines according to earning component and currency. The existing result lifecycle owns review, approval, preparation, posting, release and reporting.

## Immutable Monetary Evidence

`hr_payroll_ot_evidence` is immutable calculation evidence linked to the Payroll result and result earning item. Each per-date record retains:

- tenant, company, employee and OT work date;
- approved minutes and category;
- OT request and operational-rule reference;
- monetary policy/version and employee arrangement;
- compensation type and payment basis;
- salary assignment and salary-segment reference;
- selected component identifiers and exact basis amounts;
- basis source, currency and ordinary-hours configuration;
- conversion method, divisor and calculated hourly rate;
- multiplier and calculated OT hours;
- unrounded and rounded amount;
- rounding mode, stage and precision;
- earning component;
- canonical calculation/evidence JSON and SHA-256 hash.

Evidence rows are FORCE-RLS protected and reject update/delete. Policy, arrangement or compensation changes cannot alter previously calculated evidence. Historical reproduction reads sealed result/evidence rather than today's mutable HR configuration.

## Fail-Closed Blockers

Stable blockers include:

- `OVERTIME_MONETARY_POLICY_MISSING`
- `OVERTIME_MONETARY_POLICY_AMBIGUOUS`
- `OVERTIME_MONETARY_POLICY_INACTIVE`
- `OVERTIME_ARRANGEMENT_MISSING`
- `OVERTIME_ARRANGEMENT_AMBIGUOUS`
- `OVERTIME_OPERATIONAL_RULE_MISSING`
- `OVERTIME_COMPENSATION_MISSING`
- `OVERTIME_COMPENSATION_BASIS_INVALID`
- `OVERTIME_COMPONENT_MISSING`
- `OVERTIME_COMPONENT_AMBIGUOUS`
- `OVERTIME_ORDINARY_HOURS_MISSING`
- `OVERTIME_ORDINARY_HOURS_INVALID`
- `OVERTIME_CURRENCY_MISMATCH`
- `OVERTIME_EARNING_COMPONENT_MISSING`
- `OVERTIME_EARNING_COMPONENT_INVALID`
- `OVERTIME_TEMPLATE_INVALID`
- `OVERTIME_ROUNDING_POLICY_INVALID`

Missing, overlapping, inactive, incompatible or circular configuration prevents calculation before Payroll state/results change. There is no automatic fallback.

## API and RBAC

Existing compensation endpoints gain typed classification and assignment-component contracts. New noun-based endpoints manage:

- company OT monetary policies;
- immutable policy versions and controlled options;
- policy submit/approve/release actions;
- employee/category OT arrangements;
- arrangement submit/approve actions;
- authorized read-only OT evidence through Payroll results.

Existing Payroll setup read/manage permissions protect policy reads and drafts. A narrow approval permission is added only if the existing catalog cannot express policy maker-checker safely. Existing salary manage/approve permissions protect employee arrangements. Payroll result/report and own-payslip permissions remain unchanged.

Authorization runs before service access and before idempotent replay. Compensation amounts and OT evidence are not exposed without existing amount-sensitive Payroll permissions. Every route is tenant/company scoped and persistence remains FORCE-RLS protected.

## Frontend

The existing Compensation and Payroll workspaces are extended without a new visual system.

Compensation forms provide controlled type and payment-basis selections, assignment components, amounts, currency, effective dates and approval status. Contractual configuration is visibly identified and never assumed monthly or OT-eligible.

Company policy screens expose version, category, effective dates, permitted basis/components, ordinary hours, multipliers, rounding, earning components, status and audit information. Employee arrangement screens show only options released by the selected company policy.

No UI default supplies a multiplier, divisor, ordinary-hours value, component, earning component or rounding choice. Custom templates use structured controls, not a text expression field.

Payroll shows approved minutes, category, policy/version, compensation basis, hourly rate, multiplier, amount, earning component and stable blockers. Payslips and reports display the existing result earning line. Accessibility, keyboard interaction, validation and permission-aware action behavior follow current Nexora patterns.

## PostgreSQL Migration

One forward/rollback migration follows HR migration 17. It adds the compensation classification/evidence, company monetary-policy versions/options, employee arrangements, authority bindings and immutable result evidence.

The migration includes:

- primary and tenant/company-consistent foreign keys;
- unique and effective-date exclusion constraints;
- numeric precision and enum/check constraints;
- lookup indexes for work-date resolution;
- FORCE RLS policies;
- immutability and scope-validation triggers;
- safe legacy-null behavior;
- schema migration metadata.

Rollback succeeds only while new authoritative/evidence rows are unused. It refuses destructive rollback after monetary policies, arrangements or Payroll OT evidence exist. No existing Payroll, salary-segment or OT quantity evidence is rewritten.

## Historical Protection

Before migration, verification records a read-only fingerprint of:

- September 2026 Payroll period state and run number;
- input source hashes;
- result calculation hashes;
- salary-segment hashes;
- existing OT quantity evidence;
- Payroll journal proposal and external reference;
- `JE-2026-09-00001` status and totals.

The post-implementation fingerprint must match exactly. Existing non-monetary multipliers stay non-monetary. New monetary behavior applies only to new evidence explicitly bound to a released policy and approved arrangement. Any unexpected historical difference stops the phase.

## Verification Strategy

Focused tests cover every required compensation type/basis combination, revisions, boundaries, currency and approval. OT tests cover direct and converted rates, multiple components, controlled custom templates, category policies, effective versions, salary/contract revisions, Decimal precision and every rounding mode/stage.

Failure tests cover all stable blockers. Evidence tests prove policy, compensation, multiplier, rounding and salary changes cannot mutate a completed calculation and that sealed replay is deterministic.

Security tests cover RBAC, maker-checker, audit, idempotency, tenant/company isolation, FORCE RLS and compensation privacy. Integration tests prove the same OT earning reconciles through Payroll result, Finance journal, released payslip, register, summary and reconciliation report.

Required gates are:

- focused unit, API and contract tests;
- PostgreSQL HR and Finance tests;
- forward, rollback and replay migration tests;
- canonical backend verification;
- frontend and accessibility tests;
- TypeScript, ESLint, API drift and production build;
- production Demo verification;
- September Payroll and Finance fingerprints.

## Acceptance

HR-OT-MON is complete only when the full approved contract passes: compensation types/bases and contractual options are operational; policies and arrangements are effective-dated, versioned and approved; every OT date resolves deterministic compensation and policy evidence; monetary calculation and rounding are explicit Decimal operations; evidence is immutable and replayable; existing Payroll, Finance, payslip and report authorities reconcile; all fail-closed, migration, security and historical gates pass.

The phase stops after one clean HR-OT-MON commit. Pakistan statutory work, banking, Demo expansion and deferred UX work remain unstarted.
