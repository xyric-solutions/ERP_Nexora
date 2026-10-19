# HR-LOC-01D Company Localization Setup

HR-LOC-01D adds the controlled company-facing API and setup-draft boundary for
the country-neutral localization schema established in 01A–01C. It does not add
country data, statutory rules, employee/work-location resolution, payroll
execution, or the guided UI.

## Configuration model

The existing `organization_unit` row remains the company identity. The existing
effective-dated `company_legal_profile`, `company_statutory_registration`,
`company_payroll_configuration`, `company_localization_activation`, and
`company_localization_control` tables hold localization configuration. Country,
jurisdiction, legal entity, payroll currency, and payroll frequency are explicit;
country never selects currency automatically.

Registration responses expose only `masked_display_value`. An optional external
`secret_reference` is persistence-only and is not returned or included in audit
state.

Country identification, pack availability, pack approval, tenant activation,
and statutory compliance are separate states. Context responses always report
`statutory_compliance_status: not_assessed`; selecting a country or pack is not
represented as legal compliance.

## APIs and permissions

Read-only catalogs use `platform.localization.read`:

- `GET /api/v1/platform/countries`
- `GET /api/v1/platform/jurisdictions`
- `GET /api/v1/platform/legal_entity_types`
- `GET /api/v1/platform/localization_packs`
- `GET /api/v1/platform/localization_pack_versions`

Company routes require `company_id` and enforce company scope at both HTTP and
service boundaries:

| Routes | Read | Write |
|---|---|---|
| `company_legal_profiles` | `platform.company_legal_profile.read` | `platform.company_legal_profile.manage` |
| `company_statutory_registrations` | `platform.company_registration.read` | `platform.company_registration.manage` |
| `company_payroll_configurations` | `platform.company_payroll_configuration.read` | `platform.company_payroll_configuration.manage` |
| `company_localization_activations` | `platform.localization.read` | `platform.localization.activate` |

`POST /api/v1/platform/company_localization_activation_actions` performs the
explicit `approve` and `activate` transitions. Commands require
`Idempotency-Key`; material writes and immutable audit append share one
transaction.

## Validation and readiness

The service rejects inactive or out-of-date references, country/jurisdiction
mismatches, missing required subnational selection, a subnational selection for
a national-only country, an incompatible legal entity, inactive tenant
currency, invalid frequency/custom schedules, overlapping active ranges,
incompatible pack targets, missing controlled-import evidence, and incomplete
dependency/effective-date coverage.

Activation-list responses include the company context for an effective date:
identification status, explicit currency/frequency, pack availability, pack
lifecycle, activation state, coverage gaps, and the explicit non-compliance
status. Employee/work-location resolution remains 01E scope.

## Q-007 and Q-010 gate

Production activation is deliberately locked. The default
`LocalizationActivationPolicy` rejects transition to `active`; only an explicit
in-process `test` policy can activate synthetic fixtures. There is no environment
variable that turns this test policy into production approval.

Q-010 must approve and load a provenance-hashed reference release, and Q-007
must approve the real statutory pack, sources, owners, and official vectors.
Closing those decisions requires a separately reviewed change.

## Setup drafts and legacy companies

The setup-draft payload now accepts `company_legal_profiles`,
`company_statutory_registrations`, `company_payroll_configurations`, and
`company_localization_activations`. After draft approval, they are written after
company/currency creation in the same transaction. Any reference, audit, or
persistence failure rolls back the company and localization rows, while the
draft remains `approved`.

Migration-marked `legacy_unlocalized` companies retain their explicit status and
existing generic behavior. New companies retain `localization_required` and
cannot be downgraded. No jurisdiction history is guessed.

The guided Organization UI remains HR-LOC-01G scope. Until then, the API and
existing advanced setup-draft surface are the supported configuration paths.
