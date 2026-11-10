# Simplified Sales workflow (prototype)

Approved on 10 Nov 2026 from the "Nexora Simple Sales" review artifact (version 2),
after the Sales Quotations and Customer Form Review meeting and follow-up feedback.
The Sales screens follow the Purchase module pattern: a list with one **New**
button, a form with one **Save**, and one next action on every record.

> Status: **mock/prototype**. There is no Sales, Customer or Revenue API in
> `server/api` yet. Records live in a browser-session store
> (`app/features/sales/model/sales-store.ts`) and reset on reload. Nothing posts
> to the ledger, stock or bank.

## Menu

| Module | Items |
|---|---|
| Sales | Quotations, Sales Orders, Pick, Pack & Delivery, Invoices (no group header), then **Returns & Control**: Sales Returns, Pricing & Discounts, Sales Approvals, Sales Reports |
| Revenue | Recurring Bills |
| Customers | Customers |

Menu groups can set `inline: true` (see `PrototypeMenuGroup` in
`app/shell/config/prototype-data.ts`) to list their pages directly under the
module without a header. Retired page ids redirect through
`retiredPageRedirects`, so dashboard and AI deep links still land on the page
that replaced them (for example `customers/credit-limit-review` → Customers,
`customers/ar-ageing` → Sales Reports, `sales/add-quotation` → New Quotation).

Removed for now: Credit Note, Debit Note, Batch Invoice, Proforma Invoice,
separate Add/Detail pages, Revenue Recognition, Subscriptions, Revenue
Contracts, the extra Recurring Billing pages, Customer Directory/Profile/Credit
Limit Review pages, Receivables and Collections, and (from 10 Nov 2026) the
separate Customer Receipts page: receipts are recorded from the invoice panel,
and old `customer-receipts` links redirect to Invoices.

## Workflow (single approval, revised 10 Nov 2026)

```
New Quotation → Management Approval → Pick & Pack → Delivery → Create Invoice → Record Payment → Payment History
```

Approval happens **once**, on the quotation. Approving it confirms the sales
order automatically; confirming an order, picking, packing and delivering never
ask for approval again.

| Record | Status | Only action shown |
|---|---|---|
| Quotation | Open | Submit for Approval |
| Quotation | Pending approval | Management: **Approve & Confirm Order**, **Request Changes** or **Reject** (on the record or in Sales Approvals) |
| Quotation | Changes requested | Edit, then Resubmit for Approval |
| Quotation | Rejected | None (closed; start a new quotation) |
| Quotation | Ordered | None (links to its order) |
| Sales order | Saved (direct order only) | Confirm Order (no approval) |
| Sales order | Confirmed | Pick & Pack (side panel) |
| Sales order | Packed | Save Delivery (same panel) |
| Sales order | Delivered | Create Invoice (saved immediately, linked to the order and quotation) |
| Invoice | Unpaid / Partially paid / Overdue | Record payment in the invoice panel → Save Receipt |

### Management approval

The reviewer picks the capacity they decide in (CEO, Sales Manager, Finance
Manager, Director — `APPROVER_ROLES`) and a note, required for Reject and
Request Changes. Each submission and decision is kept in
`SalesDocument.approval` (name, role, date/time, note), so "Approved by Imran
Sheikh (CEO) · 21 Oct 2026" shows on the Quotations list, the quotation
workflow, the order, the Pick, Pack & Delivery list and the invoice panel.

Every decision notifies the quotation's creator (the person who first saved
it). Notifications live in `SalesState.notifications` and appear in the shell
bell; clicking one opens the quotation.

Approval is blocked while the customer's credit status is On hold or Blocked. Going over the
credit limit shows a warning in the decision dialog but does not route the
order anywhere else. The old over-limit order approval (*Awaiting approval*)
has been removed.

### Pick, Pack & Delivery

Approved orders appear in Pick, Pack & Delivery straight away. Clicking an
order opens a right-side panel: tick each item as picked, enter packages and
who packed it (**Save Pick & Pack**), then the delivery date, warehouse,
receiver and notes (**Save Delivery**; this also saves pick & pack if not done
yet). The panel then offers **Create Invoice**.

### Invoices and payments

Clicking an invoice (from the list, a link or a workflow stage) opens the
invoice panel over the Invoices list: details, linked quotation/order/delivery,
total, received, balance, payment status, last payment method/date/reference,
lines, a payment form and the payment history. The form's *Change invoice
status to* choice (Paid in full / Partially paid) sets the amount; Save Receipt
creates an individual RCT- receipt in the background, updates the received
amount and balance, and moves the status to Partially paid or Paid. A
reference is required for every method except cash. **View PDF** opens the A4
invoice with Download and Print. There is no separate close step. A
successful Save Receipt closes the panel and returns to the list; a failed
validation keeps it open. Saving a new invoice (Save invoice, or Create Invoice
from an order) returns to the Invoices list with no panel open.

### Customers

Only Overview is mandatory (legal name, customer type, salesperson). Contact,
Addresses, Tax, Payment terms & credit, Bank accounts and Notes are optional:
empty sections never block a save, but entered values are validated (email,
phone per calling code, postal code per country, NTN/CNIC/passport format,
IBAN length and mod-97 check digits, SWIFT/BIC). Country and calling-code data
and the validators live in `app/shared/constants/countries.ts` and
`app/shared/model/international-validation.ts`; customer rules live in
`app/features/sales/model/customer-model.ts`.

Clicking a customer opens a right-side panel over the list with a quick-update
strip (Active/Inactive status, opening balance and date) and every section
editable. Save changes closes the panel on success; Cancel with unsaved changes
asks for confirmation. Saving a new customer returns to the list. The opening
balance counts in the outstanding balance and in credit exposure, so it affects
available credit and approval warnings. Status, opening balance, credit limit
and credit status changes are written to the customer's activity history.
Attachments stay in the browser session only (not uploaded).

Prototype limits: the reviewer name comes from the signed-in session and the
role is self-selected; there is no server-side approval permission, ledger,
stock or bank posting. Rules live in `app/features/sales/model/sales-workflow.ts`.

## Record codes

QTN-, SO-, DLV-, INV-, RCT-, SR-, CUS- with three-digit numbering, calculated
from existing codes. Final codes must be reserved transactionally on the server
when the API is built.

## Open decisions recorded at approval

- Over-limit quotations are approved with a warning; there is no second, credit-limit approval.
- One delivery per order; part deliveries can be added later.
- Issued invoices are not editable; corrections will come through Credit Notes.
- How recurring bills are settled is still being researched.

## Next steps (backend)

Customer API end to end first, using the `SalesCustomer` shape in
`sales-types.ts` as the starting contract (opening balance must post to
receivables through the ledger, and attachments must go through the files
service), (migration → repository → service → `/api/v1`
→ contract → generated client → screen), then quotations and sales orders,
then invoices and receipts. Invoice posting, delivery stock movement and
receipts are high-risk postings: they need server-side lifecycle states,
approval checks, audit history and idempotency before going live. Customer
receipts should hand over to the existing live Banking receipt flow.
