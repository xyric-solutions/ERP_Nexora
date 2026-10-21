# Bank workflow context: shared masters and assigned approval

Status: architecture direction approved by the user on 2026-10-21. This written
specification requires user review before implementation. It does not claim that
the models, permissions, endpoints or migrations proposed below already exist.

## Objective

Finish the existing Bank Payment/Receipt workflows with real company-scoped
Project/Location selections and an explicitly selected eligible approver.
Preserve the approved grid, real nominal directory, Finance posting service,
company isolation and existing global super-administrator exception. Do not
create another company, accounting engine, prototype or browser-only master.

## Verified starting point

- Independent `/api/v1` backend in `server/api`; contracts and generated client
  in `packages/contracts`; PostgreSQL migrations in `packages/db/source-migrations`.
- Payment/Receipt contracts persist company, Bank, dates and line dimensions.
  Their current contracts do not include selected approver or typed project/city
  references. Bounded line-dimension JSON is not a validated master directory.
- Payment/Receipt repositories check live role assignments, permission/scope
  grants, active company access, expected versions and idempotency. Decisions
  currently use `evaluateApprovalActor`; self-decisions require the existing
  global super-administrator role and `platform.approval.override` evidence.
- `approval-override-writer.ts` is explicitly global-super-administrator-only.
  Do not reuse it to label an ordinary delegated user as a super-administrator.
- The inspected shared organization types are company, business unit, division,
  branch, department and warehouse, not project/city. HR has governed work
  locations with statutory/payroll ownership; those are not general Bank cities.
- Bank decisions and Finance posting already have separate lifecycle actions.
  Approve & Close must not post. Approval needs no operator-entered reason;
  rejection and existing reversal reasons remain required.
- R06 UAT is the existing agreed test company. Imported ordinary CoA drafts
  still require explicit posting review/approval; Bank currencies are not guessed.

## Chosen approach and alternatives

Chosen: shared company-owned Project/Location reference masters, consumed by
Banking through the API, with assigned approval enforced by Banking and live
Identity & Access authority. HR keeps ownership of its statutory locations.

Rejected: reusing HR work-location identities directly would mix accounting
dimensions with statutory employment semantics. Rejected: Bank-only text lists
or local-storage dropdowns would duplicate master data and permit invalid links.

## Slice WC-01 — shared Project/Location reference foundation

Add a narrowly scoped shared-master module under `server/api/src/modules` and
matching contracts, not an extension of the HR employee/location services.
Projects here are accounting references, not project delivery/budget management.
Locations here are company reporting references (including cities), not a new
global geographic or payroll-jurisdiction catalog. The UI label is Location / City.

Proposed entities are separate project and location records with tenant, company,
stable ID, code, name, active/inactive status, row version and creation/update
actors/timestamps. Project and location codes are case-insensitively unique
within their own tenant/company/type. The same code may exist in another company.
Names may repeat; name equality alone never authorizes merging or deletion.
Codes are explicitly maintained, not inferred from city names or Excel nominals.

Add immutable change events linked to the existing platform audit. Composite
foreign keys preserve tenant/company ownership; tenant RLS, company-authorized
queries, bounded search/pagination and active/status indexes are mandatory.
Records may be deactivated but not hard-deleted or reassigned between companies.
Referenced historical identities remain readable after deactivation.

Proposed public boundary: `/api/v1/master_data/projects` and
`/api/v1/master_data/locations`, with authorized list/detail/create/update/status
operations. Mutations use existing session, Origin/CSRF, expected-version,
idempotency and standard problem-response conventions. These are new endpoints,
not claims about current repository routes.

Register explicit read/manage permissions in the existing Identity permission
catalog and policy UI. Manage permission does not imply Bank approval or posting.
Do not grant all users new access or seed real business masters automatically.
Expose management through the existing Master Data/Finance navigation, with clear
company scope, loading/empty/denied/error/success states. Bank option projections
require Bank read and company access and expose only IDs, codes and names; Bank
makers do not need full master-administration permissions to choose options.

## Slice WC-02 — typed Bank context and accounting propagation

Extend both existing create/update/detail contracts compatibly with nullable
header `project_id` and `location_id`; header selection applies to the transaction.
They are optional unless an existing nominal's accounting-dimension policy makes
the corresponding context required. Do not require fake projects for ordinary
transactions. Legacy records receive nulls; no inferred historical backfill.

Store composite company-scoped foreign keys on the Bank headers. Validate active
and permitted selections on create, update, submit and posting. A deactivated
selection remains visible historically, but cannot authorize a new submission
or posting; the error identifies which master requires review. Editing context
is draft-only, including any existing authorized rejected-to-draft workflow.
Submitted/approved records cannot silently change project, location or approver.

For each nominal line, server-derived project/location IDs become canonical
`project` / `location` accounting dimensions and flow into the existing Finance
posting command and persisted journal dimensions. The UI uses master dropdowns
instead of arbitrary text for those keys. Reject conflicting client dimension
values rather than silently overwriting them. Other required dimensions remain
unchanged. Legacy project/location strings are displayed as legacy values and
require explicit valid selection before resubmission; never match by label.

The Bank control line is aggregated and is not independently classified by a
different project/location. Preserve reporting context on the original accounting
event. A compensating reversal must retain original dimensions and remain
possible when masters are later inactive; never rewrite the original journal.
All header, line, event and audit writes are atomic. Posting still uses the
existing Finance service's balanced journal, period lock and duplicate controls.

## Slice WC-03 — assigned checker and bounded self-approval

Add nullable `approver_user_id` to both existing draft headers and responses.
New submissions require an explicit eligible selection. Legacy submitted records
with null keep the existing independently authorized checker queue; do not strand
or assign them by migration. Legacy drafts must select a checker on submission.

Provide bounded company-authorized approver directories for each transaction
kind. An eligible user must be active, unarchived, have current company access
and a live active policy/assignment granting that kind's approve permission in
company or tenant scope. Return minimal user ID/display name and self-approval
eligibility, never credentials or private HR profile information.

Validate selection on save/submission and revalidate at decision time. Selection
does not grant approval authority. The assigned checker alone may decide; the
existing authorized global super-administrator can intervene with explicit
audited assignment-override evidence. A different ordinary checker cannot act
merely because their role has approve permission. If a checker loses authority,
block the decision and let a globally authorized administrator perform a separate
versioned, audited reassignment; changing assignment never approves a transaction.

For ordinary makers, self-approval additionally requires an explicit company-
and transaction-kind-scoped grant issued/revoked by an active global super-admin.
The grant cannot be inferred from a role label, the selected user, a UI checkbox,
or general approve permission. It supplements, never replaces, live company
access and normal approval permission. Grant administration is visible under
Identity & Access, not a hidden URL. No delegation is granted by migration.

Persist grant versions/revocations and immutable decision evidence recording the
grant version, company, transaction, maker/submission actors and approving actor.
Reject impersonated self-decisions. Recheck grant revocation before committing;
serialize the grant's active version with the decision. Extend only the Bank
approval policy path and its database guards; do not weaken HR, Finance nominal,
posting or global override rules. Global `approval_override_event` retains its
current meaning; delegated decisions have separately typed evidence.

If the deciding user was creator or submitter, the self-approval rule applies.
A grant for the creator cannot excuse a different submitter's self-decision.
Approval reason remains server-generated audit evidence, with no free-text
approval prompt. Rejection requires an entered reason. Posting remains a separate
permission and operation even after authorized self-approval.

## UI integration and company context

Keep the existing Bank Payment/Receipt routes and grid; add shared API-backed
Approver, Project and Location / City controls with accessible labels. Preserve
free-text Details, visible posting/value dates, totals, Add More, dirty guards,
retry-safe partial-save handling, success notices and no mock fallback.

Do not replace a real company scope with the prototype shell's company label.
For users with one accessible company, resolve it from the authenticated directory
and show a read-only context caption, not another editable transaction field.
For multi-company users, initially preserve the authorized selector until an
authenticated workspace active-company selector is delivered. That selector is
a separate dependency, not permission to mix all companies in a Bank dropdown.
Existing transaction company is immutable; company change clears context/options.

Keep selected inactive/revoked historical labels visible in detail screens with
an appropriate warning; do not silently choose the first new dropdown option.
Cancel and server failures never report success. Unknown outcome retries reuse
idempotency keys and fetch persisted state before another lifecycle mutation.

## Delivery, migration and verification

Implement in order WC-01, WC-02, WC-03, then WC-04 acceptance. Each slice must
remain buildable and must not expose later nonfunctional actions. Use the next
verified versions of existing module migration ledgers; proposed entities above
are not final SQL names. Keep migrations additive; never alter applied migration
files, disable guards, reset a database or backfill business decisions blindly.

WC-04 must verify contracts/generated client/OpenAPI, unit/component validation,
fresh and additive migration paths, tenant RLS and company isolation, archived
users, revoked/stale grants, unauthorized assignment, duplicate submissions,
stale versions, inactive masters, conflicting dimensions, required-dimension
enforcement and atomic rollback. Preserve existing independent-checker and global
super-admin regressions. Test concurrent delegation revocation/decision and
assignment/decision so stale authority cannot win silently.

Use isolated synthetic PostgreSQL fixtures for mutating financial tests; never
the shared running ERP DB. Prove original/reversal balanced ledger entries,
matching persisted context, idempotent replay, period locks and unchanged HR
approval behavior. Observe browser save/reload/new-session selection persistence,
checker queue/routing, successful notifications, denied/error/empty states and
desktop/narrow layout. Run typecheck, scoped lint, api:check, build:web and
git diff --check. Update the implementation plan and architecture handoff with
actual executed results, not anticipated passes.

No source company/account activation, currency selection, period opening, real
project/location creation or delegated grant is authorized by this schema/design
review alone. Existing R06 UAT remains the single manual business-test company.

## Written-spec review checkpoint

Review focus: shared reporting masters stay separate from HR statutory masters;
project/location are transaction-header context; new submissions select a checker;
delegated self-approval is company/kind bounded and audited; multi-company scope
remains explicit until an authenticated workspace context replaces it.
After review approval, write the dependency-aware implementation plan and begin
WC-01. This document alone does not mark any implementation slice complete.
