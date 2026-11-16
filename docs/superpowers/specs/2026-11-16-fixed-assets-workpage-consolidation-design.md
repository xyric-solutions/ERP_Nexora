# Fixed Assets workpage consolidation

Date: 16 November 2026. Status: proposed for owner review.

## Requested result

Fixed Assets uses workpages with one context-specific primary action. Creation,
details and approvals remain reachable from records rather than separate sidebar
entries. Refresh remains the browser's native reload action.

| Workpage | Primary action at top right | Behavior |
| --- | --- | --- |
| Asset Classes and Policies | Add New Asset Class and Policy | Opens the existing class/category policy form; removes the second in-body Add category trigger and the unrelated asset-create action. |
| Asset Register | Add New Asset | Opens registration; saved records open their details from the register. Status, submission, independent approval and activation remain actions on the opened asset. |
| Transfer and Assignment | Asset Transfer | Opens a transfer form from a transfer-history workpage. Shows the current assignment and permits a different location, project or both. Existing lifecycle approval and posting rules govern application of the transfer. |

Asset Classes and Policies is first and Asset Register second within the Asset
Register navigation group. Other existing workpages, including maintenance,
verification, reports, depreciation, impairment and disposal, retain their
functions. The dashboard remains accessible separately. The newer company-wide
Asset Policies page remains a distinct settings surface; this change does not
silently merge company defaults with individual class policies.

## Navigation and record actions

- Hide Add Asset, Asset Details, Register Posted Acquisitions and Asset Approval
  and Activation from navigation and global page search. Retain internal routes
  for the Add New Asset button, saved records, source-acquisition links and old
  bookmarks using the existing hidden-page mechanism.
- Show the register's current status and valid actions. No direct editable
  status selector bypasses draft/submission/approval/activation controls. Preserve
  independent approval, permission checks, reasons, versions and API refresh
  after successful mutations.
- Remove the generic asset-create action from classes/policies and transfer
  workpages. Keep form Save/Cancel and record-specific actions where required.
- Transfer and Assignment initially shows history and filters. Asset Transfer
  opens the existing validated form; cancel returns to that history without a
  write. A draft transfer does not immediately change the live assignment.

## Vendor returns and refunds: proposed Purchase entry point

The current procurement contract has request, RFQ, order, receipt, bill, payment
and multi-payment documents; it has no dedicated Purchase Return document.
Existing asset return/refund services already validate source acquisitions,
supplier credit-note evidence, depreciation, closed periods, approval, receipt
allocations and immutable posting history.

Recommended for this request: remove Vendor Returns and Vendor Refunds from the
Assets sidebar and asset operational action buttons. Start asset-related Purchase
Return/refund handling from the original Purchase Bill, reusing those existing
server workflows. Keep return/refund history visible on the asset and preserve
all existing journal links. Provide a Purchase-side asset-return entry point for
direct bank-acquired assets as well, since they have no Purchase Bill. Old return
bookmarks redirect to the corresponding Purchase surface with their record
reference preserved.

This relocates the asset-return workflow; it does not create a new general stock
or non-asset Purchase Return document type. That wider feature needs its own
procurement, stock and supplier-accounting design. The owner should confirm
whether this relocation or the wider Purchase Return feature is intended.

Alternatives considered: merely hiding the return menus would leave no clear
replacement entry point; creating a complete general Purchase Return system in
this navigation change would expand its financial and inventory scope.

## Implementation boundaries and validation

Use the existing shell catalogue, FixedAssetsWorkspace, shared shadcn controls,
category/lifecycle forms and Purchasing workspace. Introduce only a small
feature-owned adapter where Purchase hosts an asset-return operation. Keep the
API, accounting engine and existing permission model authoritative. No credential
change, automatic permission grant, database reset or new financial posting
behavior is part of this consolidation.

Add meaningful navigation tests for hidden routes and preserved record references,
and browser tests for one primary action per workpage, create/edit/cancel flows,
status-based actions, transfer history/form switching and Purchase return entry.
Run relevant lifecycle/return integration regressions if their adapter or API
contracts change. Run typecheck, production build, lint, theme audit, responsive
light/dark and accessibility checks. Regenerate the catalogue when menu metadata
changes.

The current localhost frontend is a separate compatible release. Apply the
equivalent workpage changes there only after verification against the running
API; the integrated extension keeps its previously documented rollout gate.

## Review record

- Context and existing workflow inspected.
- Preferred implementation and two return-handling alternatives specified.
- Navigation versus financial scope, hidden routes and verification reviewed.
- Awaiting owner confirmation of the Purchase Return scope and design.
- After approval: record the implementation plan, implement and verify, then
  push changes to shoaib_nexora and update the compatible local frontend.
