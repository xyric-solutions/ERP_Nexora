# Canonical customer and supplier references

Approved continuation after Accounting Integrity Guards. This batch consolidates
master references only; it does not add stock, procurement or sales posting flows.

Reuse the existing `party` master and attach a company scope to business identities.
Keep legacy employee/unclassified rows untouched. Preserve every supplier ID,
financial party ID, code, immutable financial snapshot and posted document. An
additive immutable binding joins each financial identity to one canonical master.
Only explicit existing supplier IDs establish legacy cross-module links; names
never cause a historical merge.

Compared with a new duplicate master registry or rewriting financial rows, this
retains existing master ownership and immutable accounting evidence. A shared
database projection supplies current names/status to directories and reports.
Foreign keys and company/role checks protect both sides of the binding. New exact
normalized name/tax-ID collisions within a company and role are rejected for
review, including concurrent requests. Existing ambiguous identities remain
visible to a read-only preflight; they are not automatically merged or deleted.

Finance-created suppliers receive an inactive Purchasing profile for the same
master ID. Existing vendor authority must review/activate that profile before
operational use. Finance permissions do not gain supplier-edit or purchase rights.
Existing Purchasing suppliers retain their status and explicit financial linkage.
New financial activity checks canonical status/risk; reversals retain their
historical compensation path. Supplier renames flow to financial projections
without updating immutable financial snapshots or journal evidence.

Contracts add optional canonical identity/status metadata compatibly. Existing
forms retain their design and use the API response/projection. Supplier linking
uses a bounded authorized master directory instead of requiring a copied ID.
No client connects directly to infrastructure. No new dependency is necessary.

Sequence: additive migration after Procurement 7 (Finance and Procurement tables
then exist on a fresh install), shared projections and server validation, contract
and generated client, existing form adapters, database/API/UI regressions and
authenticated browser acceptance. Run only on disposable databases in this batch.
Business-data preflight and release activation remain separately reviewable.

Verify identity isolation, explicit source links, duplicate races, inactive
supplier operational protection, rename propagation, immutable binding/history,
idempotent replay, revoked authority, real posting/reversal reconciliation,
migration reruns and compatibility of existing workflows.
