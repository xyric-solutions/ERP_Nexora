# HR-LOC-01E — Generalized Jurisdiction Activation Amendment

- Status: approved 2026-09-28
- Scope: prerequisite Platform amendment for HR-LOC-01E
- Non-goal: country-specific law or cross-border employment support

## Current restriction and conflict

Platform migration 0003 and the 01D repository require the company registered
jurisdiction, activation target, and localization-pack target to be identical.
That prevents an employee's explicit work jurisdiction from selecting a
different state, province, territory, or local pack within the legal employer's
country.

Using a global pack without a company activation would bypass the controlled
activation boundary and is prohibited.

## Generalized model

```text
Legal Employer
-> Effective Company Legal Profile
-> Effective Employment Assignment
-> Effective Work Location
-> Approved Scope-Specific Override, when present
-> Applicable Jurisdiction Path
-> Explicit Company Localization Activation
-> Approved Effective Localization-Pack Dependency Stack
```

The existing `organization_unit(type='company')` remains the legal-employer
identity. `employee_assignment.company_id` binds the employee to that employer.
The registered jurisdiction is employer evidence; the employee jurisdiction is
resolved from controlled work-location/override data, never from currency,
locale, IP, free-text address, time zone, device location, or AI.

## Same-country behavior

An activation target may differ from the registered jurisdiction when all of
the following hold:

- activation target equals the pack target;
- target jurisdiction and pack belong to the effective legal-employer country;
- the pack/version is approved, effective, dependency-valid, and backed by a
  controlled importer release;
- the activation is explicit, effective-dated, authorized, and audited.

National, subnational, and optional local dependencies remain ordered through
exact approved version references.

## Cross-country boundary

When the legal-employer country differs from the work or override jurisdiction
country, resolution fails with `cross_border_employment_model_required`. It
does not select a pack or guess applicable law.

A future approved cross-border model must explicitly define the legal
employment/payroll arrangement, employer and host jurisdictions, applicable
scopes, legal basis, registrations, effective dates, approvals, activations,
and audit evidence. HR-LOC-01E does not implement that model.

## Migration and compatibility

- Add production Platform migration 0004 and local/demo Platform migration
  0017; never edit applied migration 0003.
- Replace activation validation with same-country compatibility while
  preserving target/pack identity, lifecycle, effective-date, dependency,
  provenance, Q-007, Q-010, RLS, RBAC, audit, and production hardlocks.
- Rollback refuses while any activation relies on a target different from its
  legal profile's registered jurisdiction, then restores the prior validator.
- Existing activations and companies require no rewrite or backfill.
- `legacy_unlocalized` and `localization_required` behavior is unchanged.
- Existing HR supports one effective assignment at a time and sequential
  historical assignments. Concurrent-employment concepts are not introduced.

## API and verification impact

Existing 01D contracts remain compatible. HR-LOC-01E adds only the approved
work-location, override, action, statutory-rule read, and resolution-preview
surfaces. Resolution separately reports identified jurisdiction, pack
availability, approved/active state, and `statutory_compliance_status` without
calculating payroll.

Verification covers matching and different same-country jurisdictions,
national-only context, transfers and mid-period segmentation, scoped overrides,
missing/expired/conflicting coverage, cross-country denial, SoD, tenant/company
isolation, atomic audit, migration rollback/reapply, and existing activation
compatibility.
