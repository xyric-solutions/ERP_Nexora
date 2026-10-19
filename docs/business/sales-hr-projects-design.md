# Nexora - Sales, HR, and Projects Business Design (S3.2)

- Status: `active` (design), build `not started`
- Last updated: 2026-08-06
- Source: Stage 7 Enterprise Business Modules request, logged as `accepted-improvements.md` I-021
- Segment: `segments/S3.2-sales-hr-projects-core.md`
- UI: `docs/ux-layouts-and-pages.md` (Sales, CRM, HR, Projects pages already speced — not repeated here)

Integration points reused, not repeated per module: RBAC/audit (S1.2),
approvals (S1.3 workflow engine), accounting impact via `AccountingEvent`
(S2.1, consumed by S2.2), notifications/attachments (S4.1, not built yet),
AI suggestions (S4.2's governed-approval model).

S3.2 is explicitly a **skeleton-depth** segment (per the Stage 3 review) —
this design deepens that skeleton but doesn't pretend it's core-depth like
S3.1; each module below states what's representative-flow vs. full-breadth.

## Customer Management (`Party`, type=customer — not a separate module)

Same shared-master pattern as Vendor Management (S3.1): customer status
(`active`/`inactive`), credit limit, and risk flags live on `Party`. Credit-
limit and inactive-customer checks block new sales orders at validation
(already S3.2's locked acceptance criterion).

## Sales & Order Management (lead-to-order)

| Aspect | Design |
|---|---|
| Workflow | Lead -> Opportunity -> Quote -> Sales Order -> Fulfillment -> Invoice. Representative flow only per S3.2's skeleton scope — full CPQ (configure-price-quote) complexity is explicitly deferred. |
| Business rules | Credit-limit check blocks order confirmation, not just quote (already locked). Quote-to-order conversion preserves quoted pricing unless explicitly re-priced with an audit note explaining why. |
| Edge cases | Partial fulfillment (multi-shipment against one order) accumulates against ordered qty, same pattern as procurement's partial receipt. |
| Schema | `BusinessDocument(module=sales, document_type=quote\|order\|invoice)`, lines reference `Item` and `Party` (customer). |
| API | `/api/v1/sales/quotes`, `/orders`, `/invoices` — idempotent commands per the locked convention. |
| Accounting integration | Approved invoice emits `AccountingEvent` (`sales.invoice.issued`) consumed by S2.2 for AR/revenue posting. |
| AI opportunities | Next-best-offer / cross-sell suggestions, churn-risk flagging on customer accounts — both `AiSuggestion`-governed, never auto-applied to a quote. |
| Reports | Pipeline by stage, quote-to-order conversion rate (already the locked NFR target: 90% quote-to-invoice traceability), sales by customer/item/region. |

## CRM (folded into Sales — flagged depth gap, not silently expanded)

Contact/activity tracking on `Party` (customer/lead), a simple activity
timeline (reuses the Timeline component from `docs/component-library.md`,
rendering `AuditEvent`-adjacent activity records). Marketing automation,
multi-channel campaign management, and deep pipeline analytics are **not**
in this design — consistent with CRM never having its own segment; if
deeper CRM becomes a v1 priority, that's a scope decision for `vision.md`,
not something to expand here silently.

## HR & Payroll (skeleton, jurisdiction packs deferred)

| Aspect | Design |
|---|---|
| Scope | Employee record (`Party`, type=employee, extended with employment fields), payroll-input skeleton (hours/attendance import, not a full payroll engine) — per S3.2's own locked language, this is explicitly a skeleton. |
| Business rules | Missing-payroll-data blocks a payroll run (already locked). Payroll input validation happens per pay period, not retroactively across periods. |
| Jurisdiction | Payroll rules (tax withholding, statutory deductions — e.g. Pakistan's EOBI/PF) follow the same jurisdiction-pack pattern as tax (I-009) — not hardcoded to one country, Pakistan is the reference pack when this segment builds. |
| Edge cases | Duplicate claim detection (already locked) — an expense/leave claim already paid cannot be resubmitted; detection is exact-match on claim reference, not fuzzy. |
| Schema | `Party(type=employee)` extended fields: `employment_status`, `department_id` (`OrganizationUnit`), `payroll_bank_account_ref`. |
| API | `/api/v1/hr/employees`, `/payroll-runs`, `/attendance-imports`. |
| Accounting integration | Approved payroll run emits `AccountingEvent` (`hr.payroll.run_approved`) consumed by S2.2 for salary-expense/payable posting. |
| AI opportunities | Attendance-anomaly detection, leave-pattern analysis — governed suggestions only. |
| Reports | Payroll run summary, department headcount/cost, attendance exceptions. |

## Project Management (cost/billing skeleton)

| Aspect | Design |
|---|---|
| Scope | Project/task structure, budget vs. actual cost tracking, time/expense capture mapped to project/task — a representative skeleton, not full resource-leveling/scheduling (e.g. no critical-path/Gantt engine in this design). |
| Business rules | Budget-tolerance exceeded and closed-project-period errors block new cost entries (already locked). |
| Edge cases | Time/expense entries against a closed project period are blocked the same way S2.2 blocks postings to a closed finance period — same pattern, applied at the project layer. |
| Schema | `Project(id, tenant_id, code, name, budget_json, status)`, `ProjectTask`, cost entries reference `BusinessDocument`/time-expense records. |
| API | `/api/v1/projects`, `/projects/{id}/tasks`, `/projects/{id}/cost-entries`. |
| Accounting integration | Approved cost entry emits `AccountingEvent` (`project.cost.approved`) consumed by S2.2 for project-cost posting; project budgets reuse S2.2's `Budget` entity (I-020) filtered by project dimension, not a second budget model. |
| AI opportunities | Budget-overrun forecasting, effort-estimate anomaly detection. |
| Reports | Budget vs. actual per project/task, resource utilization, project cost mapped to approved project/task (already the locked NFR target: 95% traceability). |

## Security model

Reuses S1.2's exact-permission model throughout. Representative permissions:
`sales.order.confirm`, `sales.credit_limit.override` (privileged, SoD-checked
against `sales.order.confirm` per S1.2's static-SoD pattern), `hr.payroll.run`,
`hr.payroll.approve` (must be a different actor than `hr.payroll.run` —
dynamic SoD), `project.cost.approve`.

## Testing strategy

Reuses `verification-matrix.md`'s levels, matching S3.2's locked verify
command (`test:unit && test:integration && test:e2e && test:security &&
test:a11y`). Domain-specific cases: credit-limit boundary, duplicate-claim
detection, closed-project-period rejection, payroll dynamic-SoD (run/approve
actor-distinctness) enforcement.
