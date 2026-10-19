# HR-LOC-01F — Payroll Integration and Statutory Snapshots

Status: implemented; closed with external localization waivers on 2026-09-28.

## Boundary

The ordinary Payroll calculator remains jurisdiction-neutral. It understands
neutral earning, deduction, and employer-contribution lines, but it does not
load jurisdictions, select localization packs, or branch on country. The
localization boundary is implemented by:

- `StatutoryRuleProvider.resolve(context)`, which consumes the deterministic
  01E resolver and returns exact approved pack/rule versions and evidence;
- `StatutoryRuleExecutor.evaluate(rule_set, payroll_facts)`, which executes only
  validator-approved, allow-listed deterministic rule shapes; and
- Payroll-service orchestration, which turns normalized statutory outputs into
  ordinary Payroll lines and atomically seals their evidence with the result.

No AI, network call, free-text inference, currency inference, or country
condition participates in calculation.

## Calculation flow

1. Payroll locks and verifies the attendance source and loads the approved
   effective salary and neutral pay structure.
2. `company_localization_control` determines whether localization is required
   for the payroll period. Legacy or pre-requirement periods retain their
   existing generic behavior and receive no invented statutory snapshot.
3. For required companies, the provider resolves the employee's effective
   legal employer, assignment, work location, approved override, exact company
   activation, dependency stack, and statutory rule versions.
4. More than one effective segment fails closed as
   `jurisdiction_context_ambiguous` until an approved allocation model exists.
5. The executor returns normalized applicable/non-applicable employee and
   employer amounts. Payroll maps executable lines only to explicit active pay
   components; a missing component fails closed.
6. The payroll result and a building snapshot are written in one transaction.
   Exact ordered packs, rules, lines, input/result hashes, and resolution
   evidence are inserted before the snapshot is sealed.

## Historical behavior

- `original` creates the first result and sealed statutory snapshot.
- `reproduce_original` creates a new run by copying the prior immutable result
  and snapshot evidence. It does not resolve today's active rule version.
- `corrected` requires `hr.payroll.recalculate` at the HTTP boundary and a
  correction reason. It resolves the approved rule versions effective for the
  original payroll period, creates a new result/snapshot, and links both the
  prior result and source snapshot.
- Existing results are never mutated or backfilled with invented rule evidence.

A published replacement pack therefore cannot silently change an earlier
payroll. Exact replay remains on the old sealed version; only an explicit
corrected recalculation can consume the replacement version.

## Failure-closed conditions

Calculation stops when required localization has missing or ambiguous
jurisdiction evidence, a cross-border context without the future governed
model, no exact active pack, an unapproved/expired/dependency-invalid pack, no
effective rule coverage, missing/unsupported executable metadata, a missing pay
component, or unavailable historical snapshot evidence. There is no fallback
to the registered office, locale, currency, address, or another pack.

## Persistence, security, and audit

HR migration 0009 adds deterministic rule-output metadata, neutral employer
contribution amounts, recalculation links/reasons, and normalized statutory
snapshot lines. Snapshot rows and children use forced tenant RLS and become
immutable when sealed. The rollback is clean before use and refuses to discard
populated execution evidence.

The snapshot read API is:

`GET /api/v1/hr/payroll_statutory_snapshots?company_id=...&period_id=...`

It requires trusted tenant identity, exact company scope, and
`hr.payroll.result.read`, and returns `Cache-Control: no-store`. Payroll command
audits include the recalculation action; corrected runs expose only a hash of
the correction reason in the command response/audit projection while the
immutable snapshot retains the governed evidence.

## Finance boundary

No Finance schema or posting service changed. Payroll's existing journal
proposal adds generic employer-contribution expense debits and liability
credits, then uses the existing controlled Finance adapter. The Payroll service
does not post jurisdiction-specific accounts directly.

## Deferred work

- Q-007 still blocks every real-country statutory pack and compliance claim.
- Q-010 still blocks real reference releases and production activation.
- Q-004 still governs sensitive registration identifiers.
- Cross-border employment remains a separate fail-closed extension point.
- HR-LOC-01G owns the guided UI and remains closed until separately approved.
