# Statutory rule publishing

The Payroll screens manage review. The publisher command imports the exact
approved artifact through a separate database principal. Neither approval nor
publication activates a pack for a company; use the Published packs setup section
for that reviewed decision.

## Review a bundle

Open HR & Payroll → Pay Components → Statutory company & employee setup →
Rule publishing. Import the reviewed JSON bundle, record its source and reason,
then submit it. The maker cannot approve or reject their own bundle, including
through an administrator override. A different reviewer requires both
`hr.payroll.period.approve` and `platform.localization.activate`, plus setup read.
Creation/submission requires setup manage and `platform.localization.activate`.
All actions remain tenant/company-scoped and audited.

The exact JSON schema is in `HrStatutoryPackTerms` under the `/api/v1/openapi.json`
components. The self-contained v1 format includes:

- `kind: "pack_release"`, `schema_version: 1`,
  `execution_contract: "safe_formula_v1"`, explicit classification, pack key/name,
  semantic version, country/jurisdiction and effective dates.
- Source references with unique IDs and SHA-256 document fingerprints.
- At most 20 rules with explicit currency, precision, rounding, safe formula,
  applicability and output/component mapping.
- Three to 20 reviewed vectors per rule, including positive, boundary and
  non-applicable cases, each naming an included source and exact expected output.

All vectors must reproduce before saving, submitting, approving and publishing.
Source/rule/scenario IDs must be unique; arbitrary code, unknown inputs, unsupported
contracts, mixed currency/precision, and unbounded constants/input maps are rejected.
The current publishing contract does not accept dependency bundles or other rule
engines. The human reviewers must verify document authenticity, legal applicability
and rates. Hashes and test cases do not perform that legal review automatically.

The review screen shows the canonical JSON and artifact fingerprint. Approval is
shown as awaiting an authorized publisher until a real import acknowledgement
exists. No production rates or packs are installed by this feature.

## Configure the publisher principal

A database administrator registers a dedicated login in
`localization_publisher_principal`, using the existing migration-owner boundary.
Do not register the API login or run it as the migration owner in production.
Give the publisher schema usage and database connect privileges, plus:

| Access | Tables |
| --- | --- |
| SELECT | hr_payroll_localization_request, country, jurisdiction, currency, localization_pack, localization_pack_version, hr_statutory_rule, hr_statutory_rule_version, hr_statutory_rule_test_vector, localization_import_release, hr_statutory_pack_publication |
| INSERT | localization_pack, localization_pack_version, hr_statutory_rule, hr_statutory_rule_version, hr_statutory_rule_test_vector, localization_import_release, hr_statutory_pack_publication, hr_payroll_workspace_event |
| UPDATE | localization_pack_version |

The publisher needs no UPDATE or DELETE permission on review requests. Approved
requests are immutable; company and pack advisory locks serialize publication.
Native catalog guards, tenant row policies and immutable release/publication
triggers remain enabled. Register/grant/revoke the login through the database
administrator's controlled process; the application does not grant itself access.

## Import the approved artifact

Build the API (`npm run typecheck`) and supply `DATABASE_PUBLISHER_URL` securely in
the operator environment. The command deliberately has no fallback to the API's
`DATABASE_URL` and does not load `.env` itself.

```text
npm run payroll:publish -- --tenant TENANT_ID --company COMPANY_ID --request REQUEST_ID --artifact-hash REVIEWED_SHA256
```

Use the approved request ID and the artifact hash shown in its review screen.
The publisher checks the registered database principal (or migration owner),
tenant/company, independent review, fingerprint, references, currency and every
test vector again. It writes the pack, version, rules, vectors, immutable release,
publication acknowledgement and workspace history atomically. A failure rolls
back the import; the approved review request remains available for diagnosis.

Replaying the same published request returns the same acknowledgement. A new
request cannot overwrite an existing semantic version. Use a new version for
changed content; change the key if country/jurisdiction or rule identity changes.

Synthetic artifacts require the explicit `--allow-synthetic` flag. They retain
that classification in the immutable release and remain excluded from production
activation and final Payroll evidence. The flag is not an API execution-mode switch.

Refresh the review screen to see the actual published version and fingerprint.
For production artifacts, create and independently approve a Published packs
activation, then recalculate Payroll. Existing compensation, attendance, component
mapping, approval, Finance and payment checks still apply. Publishing a new version
does not change frozen Payroll runs or silently replace an active version.


## Employee category jurisdiction overrides

In Pay Components, open Statutory company & employee setup → Employee jurisdiction. Publish and activate compatible category rules first; then select the employee's approved operational placement, same-country jurisdiction, category and effective dates, and provide reviewed legal/source evidence. Submit for a different authorized reviewer. A preparer or bound employee cannot approve their own change through administrator override.

The selected jurisdiction and its ancestors apply only to that category. Other categories keep their own legal/work authority. Different same-country legal/work branches require approved authority for every published category, including informational categories. Published additive ancestor rules remain additive; an override does not invent precedence or a tax rate. The existing declaration/parameter/YTD prerequisites still apply in the selected rule's jurisdiction.

Mid-month category changes require the existing reviewed calendar-weighted monthly policy and vectors when rule coverage or used inputs change. Continuous compatible published versions may cover a finite request range. Open-ended requests validate their start; calculation rechecks every actual earned context. Cross-country execution and other allocation bases remain unsupported.

Use Revoke jurisdiction override for a separately reviewed revocation. Its dates are copied from the original fact. The original approval and earlier calculations remain immutable, and the original request displays its current revoked fact state. Resolve pending changes and recalculate before submitting Payroll. Submitted/finalized periods require the owning correction workflow before their setup can change. HR129–130 verify canonical scoped evidence and prevent stale submission/approval without replacing inherited Finance or Banking transitions.
