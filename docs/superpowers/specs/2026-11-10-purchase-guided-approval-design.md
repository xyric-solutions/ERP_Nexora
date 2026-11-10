# Purchase product identity and guided approval

## Current approval refinement requested by the user

Choose the approver once on the Purchase Request. RFQ, Order, Receipt and Bill
inherit that assignment from the PR on the server; those forms have no approver
selector. Existing legacy flows without a PR assignment retain their earliest
saved assignment as a compatibility fallback. An explicit downstream reassignment
is rejected; unchanged legacy draft assignments can normalize on saving. Existing
submitted records use the PR assignment when acting, with the resulting assignment
and decision recorded together in the next audited version.

Request-to-Bill approval requires no user-entered reason, including Super Admin
self-approval. The API supplies a standard factual approval audit description and
marks its origin as system-generated on override evidence. Normal approval access,
live self-approval/override authority, assignment, versioning, CSRF and idempotency
remain enforced. Rejection/cancellation ask for a reason only after those actions
are selected. The user's subsequent refinement also removes entered approval
reasons from Payment and Multi-vendor Payment, including Super Admin decisions;
their separate approver/access checks remain enforced. The same server-generated
audit description is retained. This supersedes earlier mandatory approval-reason
UI requirements throughout Purchase.

Receipt confirmation uses Receive Products, including the authorized combined
draft action, and Receive & Close for its explicit exit. These user-requested
labels retain the existing receipt decision callbacks and posting boundary.

Confirmed by the user on 2026-11-10, including separate exported product code and name.

Extend the existing Purchase Request, RFQ, Order, Receipt and Bill stages. Do not introduce a separate quotation entity. Product selection displays code and name together, but stores product identity, code and name separately. Descriptions remain independently editable. Existing custom/service lines remain supported. Downstream documents retain source product snapshots; exports use separate Product Code and Product Name fields.

Add an eligible company-scoped approver selector. Save Draft remains available and never approves. As refined by the user's same-user request, an authorized assigned creator gets an explicit Save, Approve & Continue action that saves, submits, approves and opens the next linked form. Submit for Approval remains separate. Other approvers receive a submitted record in the same workspace. Approve & Continue also handles already submitted records. Receipt-to-Bill continues to use the parent order and existing receipt matching.

The API validates the PR approver against live company authority and inherits that assignment through the subsequent stages. Decisions are limited to the assigned actor, except for the existing audited Super Admin override. The explicit company-scoped procurement.document.self_approve permission is not granted implicitly. Every creator, editor or submitter is a maker; ordinary makers require that live permission to decide their own document. Purchase approval, including payment instructions and Super Admin overrides, needs no entered reason; the server writes a standard audit description when none is supplied. Rejection and cancellation retain reason requirements. Preserve lifecycle/version checks, idempotency, impersonation restrictions and append-only audit evidence.

Use additive migrations, compatible optional fields for historical records, bounded company-scoped catalog/approver directories, existing shared UI primitives and semantic theme tokens. Preserve instruction-only behavior: no stock, GL, AP or bank posting is introduced. Verify contracts, API authorization, snapshot preservation, export columns, navigation and responsive UI.

## Same-screen workflow refinement requested by the user

Keep a consistent Purchase workflow workspace while switching the active linked form. Add a five-stage Request/RFQ/Order/Receive Products/Bill tracker and a separate Draft/Awaiting approval/Approved status strip for the active document. Place lifecycle actions at the top, beside this context. Each stage exposes its persisted records and eligible source-linked creation action. Existing direct form links remain valid. The user's supplied screenshots guide the layout; their Posted/Done states do not add posting behavior.

Add a read-only tenant/company-authorized flow endpoint that follows the selected document to its root Request and returns bounded, paginated linked summaries plus exact aggregate status counts. Multiple RFQs, orders, partial receipts and bills remain distinct. An approved receipt is not labelled as full completion; mixed states are shown explicitly. Errors show unknown/unavailable progress rather than fabricating Not started. Reject, cancel, version, maker-checker, access and audit rules are unchanged.

The guided submission path stays in the workspace when another approver is selected. Authorized self-review remains explicit. Final Approve Bill stays on the approved Bill with the flow visible. Approve & Close and Close remain intentional exit actions. Stage changes with unsaved edits are disabled until saving, and linked forms retain existing source-copy and receipt-to-bill matching behavior. CSV and print code/name separation is preserved.

The latest refinement reduces stage padding and puts Open/Create in one row.
Existing-stage creation uses a labelled plus button with its action title.
When combined approval fails after submission, the submitted record remains
visible and the approval retry reuses its idempotency key. No stock/AP/GL/bank
posting or new authority is introduced.

## RFQ supplier simplification requested by the user

Replace the RFQ invitation checklist with one Supplier selector containing its
own name/code search, bounded API directory and pagination. Remove the separate
source-search row from RFQ: the approved Purchase Request dropdown contains its
own search instead. Preserve source copying and selected supplier when changing
the Purchase Request. The chosen RFQ supplier carries into the Order.

Keep the existing API representation compatible: new UI selections set the
supplier and a single invitation ID. Historical multi-supplier RFQs are not
silently reduced during unrelated edits; show their saved selections until the
user explicitly chooses a replacement supplier. Access, lifecycle and posting
rules remain unchanged. No migration or new dependency is required.
