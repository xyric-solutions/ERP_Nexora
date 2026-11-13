# Simplified Sales workflow (prototype)

Approved on 10 Nov 2026 from the "Nexora Simple Sales" review artifact (version 2),
then revised by the **Sales Module Quotation and Invoice Review** of 11 Nov 2026
and its reference screenshots (Receipts *Add New* / *Batch* menus and the
opened-document action bar). The Sales screens follow the Purchase module
pattern: a list with one **New** button, a form with one **Save**, and one next
action on every record.

> Status: **mock/prototype**. There is no Sales, Customer or Revenue API in
> `server/api` yet. Records live in a browser-session store
> (`app/features/sales/model/sales-store.ts`) and reset on reload. Nothing posts
> to the ledger, stock or bank.

## Menu

| Module | Items |
|---|---|
| Sales | Quotations, Sales Orders, Delivery, Invoices, Recurring Bills, Receipts, Customers (no group header) |

The Revenue and Customers modules were retired on 12 Nov 2026; Recurring Bills
and Customers moved into Sales. Old `revenue:*` and `customers:*` links open
the moved pages.

## Project and Location (12 Nov 2026)

Every Sales transaction requires a **Project** and a **Location**, chosen from the
company's active Master Data projects and locations: quotations, sales orders,
invoices, recurring templates, receipts, customer payments and their returns,
batch receipts/payments, sale returns and deliveries. Documents
created from another inherit both (and can change them). Records saved before
the rule must be given both before they are posted or used.

## Recurring Bills (12 Nov 2026)

Recurring invoice templates (`RB-` codes) for customers billed **weekly** or
**monthly** (existing Quarterly/Annually schedules keep working).

- **+ New Template ▾** › *Single customer template* or *Batch template ·
  multiple customers*. The template holds what is billed, the customer(s),
  frequency, next invoice date, currency, reference, notes and the same
  Products & services lines as the invoice form (shared `LineItemsEditor`).
- **Create Invoice** (single) opens the existing invoice form prefilled from
  the template, with the customer locked; **Save & Post** issues the invoice
  and moves the template on by one week or month.
- **Create Invoices (n)** (batch) opens a sheet listing each customer for the
  period: **Save & Post all** issues one invoice per customer (each with its own
  payment terms and due date), or **Review in invoice form** opens one customer
  in the invoice form first. The period advances once every customer is invoiced;
  a customer cannot be invoiced twice for one period.
- **Bill everything due in 30 days** posts every outstanding template invoice
  directly. Pause/Resume and the activity history are on the template sheet;
  the menu badge counts templates due today.
- Mock only: nothing is generated automatically. The live flow must generate
  on the server with idempotency per template, customer and period.

**Returns & Control was removed** (review of 11 Nov 2026): Sale Return is an
option under **Add New** on the Invoices page, quotation approval happens on the quotation itself, price
and discount are entered on the form, and sales reports live in the Reports
module. Retired page ids redirect through `retiredPageRedirects` in
`app/shell/config/prototype-data.ts`: `sales-returns` → Invoices,
`sales-approvals` and `pricing` → Quotations, `sales-reports` and the old
receivables report links → Reports › Invoice Details Report.

Removed earlier: Credit Note, Debit Note, Batch Invoice, Proforma Invoice,
separate Add/Detail pages, Revenue Recognition, Subscriptions, Revenue
Contracts, the extra Recurring Billing pages, Customer Directory/Profile/Credit
Limit Review pages and Receivables and Collections. Old `customer-receipts`,
`receipt-allocation` and `add-customer-receipt` links open **Sales → Receipts**.

## Filter on every Sales screen

Every Sales list (Quotations, Sales Orders, Delivery, Invoices,
Receipts, Recurring Bills, Customers) has a **Filter** button beside its
actions (`app/features/sales/components/list-view-options.tsx`). It lists every
field as a tick box (the necessary ones are ticked by default; required ones
cannot be hidden) and has *Reset to default*. Pagination is placed in one
pager bar under every record table: "Showing 11–20 of 42 …" (plus "filtered
from N" when search/filters apply) on the left; **Rows per page** (10, 25, 50,
100; default 10) and First / Previous / page numbers / Next / Last on the
right (page numbers collapse to "Page x of y" on narrow screens). The bar is
always shown; buttons disable on a single page, and changing search or
filters returns to page 1. The choice is remembered per list in this browser
(`localStorage`, wrapped in try/catch); lists render normally without it.

## Discard prompt

Leaving a form with unsaved changes (Close, Discard, Cancel, closing a side
sheet, or reloading the page) asks *"You are about to discard this. Are you
sure?"* (`app/features/sales/components/discard-guard.tsx`). It covers the
quotation/order/invoice form, New Customer, every Receipts form and batch
sheet, and the Sale Return dialog. The customer panel keeps its own prompt.

## Workflow (revised 11 Nov 2026)

```
Quotation (Draft) → optional Approver → Approved → Confirm Order → Sales Order (Confirmed)
  → Delivery → Create Invoice → Receipts (allocation) → Payment history
```

| Record | Status | Actions |
|---|---|---|
| Quotation | Draft, no approver | **Approve** (the creator approves it), Edit, Delete |
| Quotation | Draft, with approver | **Submit for Approval**, Edit, Delete |
| Quotation | Pending approval | Named approver only: **Approve**, **Request Changes**, **Reject**. Anyone: Reset to Draft |
| Quotation | Changes requested | Edit, then Resubmit (or Approve when the approver is removed); Reset to Draft |
| Quotation | Approved | **Confirm Order** (no approval), Reset to Draft |
| Quotation | Rejected | Reset to Draft, or start a new quotation |
| Quotation | Ordered | None (links to its order) |
| Sales order | Draft (direct order only) | **Confirm Order** (no approval), Edit, Delete |
| Sales order | Confirmed · fulfilment *Not started* | Delivery (side panel) → **Confirm Delivery** |
| Sales order | Confirmed · *Delivered* | Create Invoice (opens the editable invoice form prefilled from the order; saved and linked to order and quotation on Save) |
| Invoice | Unpaid / Partially paid / Overdue / Paid | Read-only, no header actions. **Receive Payment** opens a receipt. Returns via Invoices › Add New › Sale Return |

Every quotation screen offers **Preview**, **Download PDF** and **Print**. There
is no email option; the user downloads the PDF and sends it. The quotation
record carries a "Quotation · price offer" band and the order record a
"Sales Order · customer confirmed" band so the two documents are not confused.

### Approval (optional approver)

The quotation form has an optional, searchable **Approver** field. It lists the
signed-in user and the employee directory (`app/features/sales/model/sales-approvers.ts`:
active employees from the shared HR fixture plus the sample reviewers).

- **No approver:** the creator clicks **Approve** (recorded as *Self-approved*).
- **With approver:** the creator clicks **Submit for Approval**. The quotation
  stays in their drafts and the approver is notified (shell bell). Only the
  named approver sees Approve / Request Changes / Reject. There is **no reason
  field on approval**; a reason is required only to reject or request changes.
  Quotations › *Awaiting my approval* filters the ones waiting for the
  signed-in user, and the Quotations menu item shows the number waiting.
- Approved quotations show **Approved** (not *Ordered*) until **Confirm Order**.
  Confirm Order needs no approval and creates the sales order as *Confirmed*.
- Only **drafts can be deleted**. Approved, pending, rejected or returned
  quotations are reset with **Reset to Draft**, after which they can be edited
  or deleted. Ordered quotations cannot be reset.
- Approval is blocked while the customer's credit status is On hold or
  Blocked; going over the credit limit shows a warning only.

### Sales orders and Delivery

Items are delivered directly, so there is no separate pick & pack step
(removed 12 Nov 2026; the page keeps its `pick-pack-delivery` route id so
existing links still work). A sales order only shows **Draft** or
**Confirmed**. Delivery and invoicing are fulfilment progress (*Not started →
Delivered → Invoiced*), shown as a separate pill/column and filter, not as
order statuses. Confirmed orders appear in Delivery; the side panel records
the delivery with **Confirm Delivery** and then offers **Create Invoice**. The
invoice is created once the order is delivered: Create Invoice (from the
panel, the Delivered tab or the order record) opens the full invoice form at
`new:<order code>` prefilled from the order — invoice date, due date, payment
terms, reference, lines (product, description, quantity, rate, tax %),
salesperson, notes and totals — with the order, delivery and quotation shown
as its source. Every field except the customer (fixed to the order's customer)
can be edited. Nothing is stored until **Save invoice**; Close returns to the
order without invoicing it. On save the invoice links back to the order and
quotation; the server-side equivalent must re-check that the order is still
delivered and uninvoiced.

### Invoices and Sale Return

Invoices are **read-only** once issued; there is no edit, reset-to-draft or
other action in the invoice header. The invoice panel shows totals (total, received, returned,
balance or credit due), details, lines with returned quantities, the payment
history (posted receipts and return receipts, linked) and its sale returns.
Payments are **not** entered on the invoice any more: **Receive Payment** opens
a new receipt in Receipts with the customer chosen and this invoice allocated.

The Invoices page has **Add New ▾** with **Invoice (INV)** and **Sale Return (SR)**
(meeting: "when clicking add new, there should be a sale return option").
Sale Return opens a dialog: choose the invoice (only invoices with something
left to return are listed), then it lists the invoice lines with quantity invoiced, already returned and *Return now*, a date and a
reason. Saving records an `SR-` return; its value incl. sales tax is credited
to the invoice (balance and status update). Returns are limited to the
quantity not yet returned. Returning more than is still due leaves a *Credit
due to customer*, refunded with a Return Receipt. Stock is not moved.

### Receipts

**Sales → Receipts** follows the reference screenshots:

- **Add New ▾** (hover or click): **Receipt (RCT)**, **Customer Payment (CPY)**,
  **Return Receipt (RRC)**, **Return Payment (RPY)**.
- **Batch ▾**: **Invoice Receipts (RCT)**, **Receipts (RCT)**, **Payments (CPY)**,
  **Combined Accounts Offset**, **All Combined Accounts Offset**.
- **Filter**, search and filters by customer, type, status and method.

| Document | Purpose | Effect when posted |
|---|---|---|
| Receipt `RCT-` | Money received from a customer | Choosing the customer lists **all their outstanding invoices automatically**. Tick an invoice (it takes what is left of the amount, up to its balance), type amounts, or *Allocate oldest first*. Part payments are fine (e.g. PKR 10,000 against 17,770). Anything not allocated stays **on account**. |
| Customer Payment `CPY-` | Money paid to a customer: security deposit, advance, tender fee | Recorded with its purpose; outstanding until returned. |
| Return Receipt `RRC-` | Refund or bounced cheque against a posted receipt | Takes the amount first from the receipt's on-account part, then reverses allocations newest first; those invoice balances reopen. |
| Return Payment `RPY-` | Customer returns a customer payment (e.g. deposit refunded) | Reduces what is outstanding on the CPY. |

Every document is saved **as Draft** (no effect) or **Save & Post**. Opening a
document shows, as in the reference: **Print**, **Preview** (printable
voucher), **Return Receipt / Return Payment**, **Reset to Draft** (posted; blocked
while posted returns exist), **Edit / Post / Delete** (drafts only), a
**Draft → Posted** stepper, a settlement ribbon (*Allocated*, *Partly
allocated*, *On account*, *Outstanding*, *Returned*) and a yellow **possible
duplicate** warning (same customer, type and amount with the same reference or
date). Batch sheets post one receipt per customer (Invoice Receipts), several
receipts allocated oldest first (Receipts), several customer payments
(Payments), or apply money on account to the same customer's outstanding
invoices (Combined / All Combined Accounts Offset). Customer outstanding
balances subtract money held on account.

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
balance counts in the outstanding balance and in credit exposure. Status,
opening balance, credit limit and credit status changes are written to the
customer's activity history. Attachments stay in the browser session only.

Prototype limits: the actor comes from the signed-in session, and the approver
check compares names in the browser; there is no server-side approval
permission, ledger, stock or bank posting. Rules live in
`app/features/sales/model/sales-workflow.ts` and are covered by
`tests/unit/sales-workflow.test.ts`.

## Record codes

QTN-, SO-, DLV-, INV-, SR- (sale return), CUS-, and on Receipts RCT- (kept),
CPY-, RRC-, RPY-, each with three-digit numbering calculated per prefix from
existing codes. Final codes must be reserved transactionally on the server when
the API is built.

## Open decisions

- **Access & Control page** (follow-ups F2/F3): per-module User, Manager and
  Admin rights, like the Marketing Portal. Not built yet. Until it exists, any
  user may leave the approver empty and approve their own quotation; the live
  API must enforce who may self-approve (risk raised in the review).
- Receipt allocation UI was designed from the meeting description; the live
  reference demo was blocked by a locked account, so it should be confirmed
  against the reference system.
- Over-limit quotations are approved with a warning; there is no second, credit-limit approval.
- One delivery per order; part deliveries can be added later.
- Sale returns credit the invoice but do not move stock or post a credit note.
- How recurring bills are settled is still being researched (templates create normal invoices; payment is recorded in Receipts).

## Next steps (backend)

Customer API end to end first, using the `SalesCustomer` shape in
`sales-types.ts` as the starting contract (opening balance must post to
receivables through the ledger, and attachments must go through the files
service), (migration → repository → service → `/api/v1`
→ contract → generated client → screen), then quotations and sales orders,
then invoices, sale returns and receipts. Invoice posting, delivery stock
movement, sale returns and receipts are high-risk postings: they need
server-side lifecycle states (draft/posted), approval and permission checks,
audit history and idempotency before going live. Customer receipts and
payments should hand over to the existing live Banking receipt and payment flows.

### Currencies

Every quotation, sales order, invoice and Receipts document has a
**Currency** (any active ISO 4217 code, searchable; defaults to the customer's
preferred currency) and, when it is not PKR, a required **Exchange rate · PKR
per 1 unit**. Amounts, PDFs, vouchers and amount-in-words use the document
currency and its ISO decimals. Customer credit limits, opening balances,
exposure, outstanding and on-account figures stay in PKR, converting each
document at its own rate. Receipts list and allocate only invoices in the
receipt's currency; returns keep the currency of what they return; Create
Invoice keeps the order's currency. Prototype only: rates are entered by hand
and no FX gain/loss is posted.
