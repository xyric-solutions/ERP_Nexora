# Bank Payment and Receipt entry workspace

Status: design approved in conversation; implementation authorized by the user.

## Scope and decision

Adapt the existing API-connected entry forms to the supplied reference rather
than building replacement forms or changing financial contracts. Keep a Bank
selector above a dense grid: Date, Ref. No., Mode, Nominal Account, Details,
Amount and Remove. Include Total, Add More, Cancel and split lifecycle actions.
Keep company and posting date visible. Move optional document references into
expandable row details and the journal preview into an expandable section.
Receipt payer identity remains required and visible in the Details cell.
Required account dimensions stay visible with their nominal selector.

Rejected alternatives: a pixel-for-pixel copy would discard required fields;
a separate replacement form would duplicate validation and persistence logic.
Use existing semantic theme tokens and shared controls, with horizontal grid
scrolling on narrow displays and accessible labels retained.

## Lifecycle and safety

Save Draft and Submit for Approval retain their existing API behavior. For the
currently supported super-admin self-approval path, show Approve & Close only
with approval permission, submission permission and an eligible session. The
API remains authoritative: save, submit, fetch persisted eligibility, approve
with expected version and an idempotency key, then return to the list. Warn
that self-approval is audited. Never invoke posting from this flow.

Partial failures retain the saved/submitted identity and allow retry without
creating another transaction. Show truthful phase-specific feedback and do
not navigate away before approval is confirmed. Recover a lost approval
response by reading the persisted approved state. Ordinary users still submit
to the independent approval workflow. Existing rejection/reversal controls,
CSRF, company isolation and accounting services remain unchanged.

## Deferred work

WHT deduction belongs to Supplier Payments. Future WHT Remittance settles
existing withheld liabilities; do not add a nonfunctional WHT menu now.
Selectable approvers, delegated self-approval, and Project/City master-data
selectors are later features. Do not invent tax rates, new permissions or
dimension masters in this presentation batch.

## Implementation and verification checklist

- [x] Update both existing forms and shared Bank-only action controls.
- [x] Preserve payloads, validation, required dimensions and receipt payer.
- [x] Cover layout, rows/totals, approval eligibility, partial failure, retry,
      exact idempotency keys, notification accuracy and no implicit posting.
- [x] Run focused unit/component tests, typecheck, Bank-owned lint, whitespace
      checks and production web build; distinguish browser verification.
- [x] Update architecture handoff with results and remaining work.

No new database migration, API endpoint, dependency or stylesheet is required.

## Acceptance evidence and limits

56 focused Bank unit/component tests and four isolated PostgreSQL lifecycle
tests passed. Two read-only Chromium workflows used live directories, checked
desktop/narrow forms, row totals and the split menu, and prohibited transaction
writes. Typecheck, focused lint, whitespace and production web build passed.
Two old detail tests still expected approval reasons; corrected them to the
previously approved reason-free approval rule without removing rejection checks.

The browser's default company returned no eligible offset nominal accounts.
It cannot submit a valid transaction until an active permitted non-bank nominal
is configured. Browser acceptance did not approve/post live financial records.
Full browser-to-PostgreSQL approval acceptance with eligible financial setup
remains pending; component and isolated database evidence are separate.
The existing global shell review banner/other prototype screens were not
redesigned in this feature-only batch.
