# Administration — Permission Inventory (Phase 0)

Captured 2026-11-12 from the local dev database (`nexora` on the `nexora-postgres-1` container) with:

```sql
select permission_key, module, resource, action, status from security_permission_definition order by 1;
```

Total: 348 keys, all `active`. The list below is also read by
`tests/unit/administration-contracts.test.ts` to prove every action is classified
by `packages/contracts/src/administration/access-levels.ts`. Refresh it when a
migration adds permission keys.

## Keys per server module

| Server module | Keys |
|---|---|
| `banking` | 56 |
| `finance` | 45 |
| `hr` | 129 |
| `inventory` | 5 |
| `master_data` | 4 |
| `platform` | 38 |
| `procurement` | 13 |
| `security` | 56 |
| `workflow` | 2 |

## Distinct actions

`read` (99), `create` (51), `manage` (37), `approve` (27), `submit` (21), `update` (15), `post` (8), `activate` (8), `reverse` (6), `manager_reject` (3), `manager_approve` (3), `hr_reject` (3), `hr_approve` (3), `edit` (3), `cancel` (3), `status` (2), `self_approve` (2), `revoke` (2), `reject` (2), `lock` (2), `decide` (2), `close` (2), `archive` (2), `action` (2), `work_location_change` (1), `transfer` (1), `terminate` (1), `revoke_sessions` (1), `review` (1), `reset_password` (1), `request` (1), `reopen` (1), `release` (1), `rehire` (1), `recalculate` (1), `reassign` (1), `publish` (1), `override` (1), `organization_change` (1), `match` (1), `manager_decide` (1), `manager_change` (1), `hr_decide` (1), `finalize` (1), `end` (1), `emergency_activate` (1), `drilldown` (1), `download` (1), `delete_draft` (1), `delete` (1), `consolidate` (1), `confirm` (1), `configure` (1), `company_access` (1), `classify` (1), `change` (1), `certify` (1), `audit_read` (1), `attendance` (1), `allocate` (1), `adopt` (1), `administer` (1), `admin` (1), `adjust` (1)

## UI module → permission prefix map (Phase 0 step 5)

Source of truth in code: `packages/contracts/src/administration/module-catalogue.ts`.
A unit test fails if a module in `app/shell/config/prototype-data.ts` is missing here.

| UI module id | Label | Permission prefixes | Server permissions today |
|---|---|---|---|
| `banking` | Banking & Treasury | `banking.` | Live (56 keys) |
| `purchases` | Purchases | `procurement.` | Live (13 keys) |
| `inventory` | Inventory | `inventory.` | Live (5 keys) |
| `finance` | Accounting (label renamed per D10) | `finance.`, `master_data.` | Live (45 + 4 keys) |
| `hr` | HR & Payroll | `hr.` + admin-level `workflow.approval.approve/reject` (payroll journal/payment approvals) | Live (129 + 2 keys) |
| `sales` | Sales & Billing | — | **Mock** — no server permissions (client store) |
| `costing`, `tax`, `operations`, `fleet`, `manufacturing`, `quality`, `crm`, `projects`, `resources`, `support`, `assets`, `expenses`, `documents`, `budget`, `reports`, `portals`, `configuration`, `approvals`, `notifications`, `integrations`, `ai`, `audit`, `migration`, `mobile` | — | — | **Mock** — access level controls navigation only |
| `dashboard` | Dashboard | — | Not grantable: visible to every signed-in user |
| `administration` | Administration | `security.`, `platform.`, `administration.` | Not grantable: Super Admin only |

### Rules encoded in the contracts

- Level → action tiers are in `permissionActionTiers` (`access-levels.ts`). Every action
  above is classified; an unclassified future action is never granted (fails closed).
- **Deviation from the plan text:** the plan lists `view → read/list/export`,
  `user → +create/update/submit/cancel`, `admin → +approve/reject`. Real keys use ~65
  actions, so: `manage`, `edit`, `request`, `match`, `finalize`, assignment changes etc.
  are **User**; posting (`post`, `reverse`), period `lock/close/reopen`, payroll
  `release/confirm/recalculate`, lifecycle `terminate/rehire`, `activate/archive/status`
  are **Admin**; `self_approve`, `override`, `administer`, `revoke`, `end`,
  `emergency_activate`, `company_access`, `reset_password`, `revoke_sessions` are
  **Super Admin only**.
- **Deviation:** `platform.*` is Super Admin only, but business screens need a few
  read-only reference keys for pickers. Any user with at least one module ≥ View also
  gets `referenceReadPermissionKeys`: `platform.accounting_period.read`,
  `platform.currency.read`, `platform.currency_rate.read`, `platform.fiscal_calendar.read`,
  `platform.localization.read`, `platform.organization_unit.read`. To be confirmed
  during Phase 3 route-by-route checks.

## All keys

```text
banking.bank_account.approve
banking.bank_account.create
banking.bank_account.read
banking.bank_account.status
banking.bank_account.submit
banking.bank_account.update
banking.payment.approve
banking.payment.create
banking.payment.post
banking.payment.read
banking.payment.reverse
banking.payment.submit
banking.payment.update
banking.receipt.approve
banking.receipt.create
banking.receipt.post
banking.receipt.read
banking.receipt.reverse
banking.receipt.submit
banking.receipt.update
banking.reconciliation.approve
banking.reconciliation.create
banking.reconciliation.match
banking.reconciliation.read
banking.reconciliation.submit
banking.reconciliation.update
banking.reconciliation_adjustment.approve
banking.reconciliation_adjustment.create
banking.reconciliation_adjustment.post
banking.reconciliation_adjustment.read
banking.reconciliation_adjustment.reverse
banking.reconciliation_adjustment.submit
banking.reconciliation_adjustment.update
banking.revaluation.approve
banking.revaluation.create
banking.revaluation.post
banking.revaluation.read
banking.revaluation.reverse
banking.revaluation.submit
banking.revaluation.update
banking.revaluation_policy.manage
banking.revaluation_policy.read
banking.statement_import.create
banking.statement_import.finalize
banking.statement_import.read
banking.statement_import.update
banking.statement_mapping.manage
banking.statement_mapping.read
banking.transfer.approve
banking.transfer.create
banking.transfer.post
banking.transfer.read
banking.transfer.reassign
banking.transfer.reverse
banking.transfer.submit
banking.transfer.update
finance.account.create
finance.account.read
finance.accounting_event.create
finance.accounting_event.post
finance.accounting_event.read
finance.budget.create
finance.chart_template.admin
finance.chart_template.adopt
finance.chart_template.classify
finance.chart_template.read
finance.company_currency.manage
finance.company_currency.read
finance.company_currency_profile.manage
finance.company_currency_profile.read
finance.company_currency_rate.manage
finance.company_currency_rate.read
finance.consolidation.configure
finance.journal.approve
finance.journal.create
finance.journal.delete_draft
finance.journal.post
finance.journal.read
finance.journal.reject
finance.journal.reverse
finance.journal.self_approve
finance.journal.submit
finance.journal.update
finance.nominal.approve
finance.nominal.create
finance.nominal.read
finance.nominal.status
finance.nominal.submit
finance.nominal.update
finance.period.close
finance.period.reopen
finance.recurring_journal.create
finance.recurring_journal.manage
finance.recurring_journal.read
finance.report.audit_read
finance.report.consolidate
finance.report.drilldown
finance.report.read
finance.report_definition.manage
finance.transfer_fx_policy.manage
finance.transfer_fx_policy.read
hr.attendance.calendar.manage
hr.attendance.calendar.read
hr.attendance.correction.cancel
hr.attendance.correction.create
hr.attendance.correction.hr_approve
hr.attendance.correction.hr_reject
hr.attendance.correction.manager_approve
hr.attendance.correction.manager_reject
hr.attendance.correction.read
hr.attendance.correction.submit
hr.attendance.overtime.cancel
hr.attendance.overtime.create
hr.attendance.overtime.hr_approve
hr.attendance.overtime.hr_reject
hr.attendance.overtime.manager_approve
hr.attendance.overtime.manager_reject
hr.attendance.overtime.read
hr.attendance.overtime.submit
hr.attendance.overtime_rule.manage
hr.attendance.overtime_rule.read
hr.attendance.payroll_input.read
hr.attendance.period.lock
hr.attendance.period.manage
hr.attendance.period.read
hr.attendance.punch.create
hr.attendance.punch.read
hr.attendance.read
hr.attendance.shift.manage
hr.attendance.shift.read
hr.employee.approve
hr.employee.create
hr.employee.read
hr.employee.submit
hr.employee.update
hr.employee_assignment.change
hr.employee_assignment.create
hr.employee_assignment.manager_change
hr.employee_assignment.organization_change
hr.employee_assignment.read
hr.employee_assignment.transfer
hr.employee_assignment.work_location_change
hr.employee_audit.read
hr.employee_contact.manage
hr.employee_contact.read
hr.employee_document.manage
hr.employee_document.read
hr.employee_emergency_contact.manage
hr.employee_emergency_contact.read
hr.employee_identity.manage
hr.employee_identity.read
hr.employee_private.read
hr.employee_private.update
hr.employee_profile_history.read
hr.employee_sensitive_metadata.read
hr.employment_context.read
hr.employment_history.read
hr.employment_lifecycle.action
hr.employment_lifecycle.approve
hr.employment_lifecycle.rehire
hr.employment_lifecycle.terminate
hr.employment_lifecycle_policy.approve
hr.employment_lifecycle_policy.manage
hr.employment_lifecycle_policy.read
hr.employment_relationship.create
hr.employment_relationship.read
hr.jurisdiction_override.approve
hr.jurisdiction_override.manage
hr.jurisdiction_override.read
hr.learning.attendance
hr.learning.certify
hr.learning.hr_decide
hr.learning.manage
hr.learning.manager_decide
hr.learning.read
hr.learning.request
hr.leave.balance.adjust
hr.leave.balance.read
hr.leave.request.cancel
hr.leave.request.create
hr.leave.request.hr_approve
hr.leave.request.hr_reject
hr.leave.request.manager_approve
hr.leave.request.manager_reject
hr.leave.request.read
hr.leave.request.submit
hr.leave.type.manage
hr.leave.type.read
hr.localization_resolution.read
hr.master.create
hr.master.delete
hr.master.read
hr.master.update
hr.organization.read
hr.organization.update
hr.payroll.adjustment.approve
hr.payroll.adjustment.manage
hr.payroll.adjustment.read
hr.payroll.loan.approve
hr.payroll.loan.manage
hr.payroll.loan.read
hr.payroll.payment.confirm
hr.payroll.payment.manage
hr.payroll.payment.read
hr.payroll.payslip.read
hr.payroll.payslip.release
hr.payroll.period.approve
hr.payroll.period.manage
hr.payroll.period.read
hr.payroll.recalculate
hr.payroll.report.read
hr.payroll.result.read
hr.payroll.salary.approve
hr.payroll.salary.manage
hr.payroll.salary.read
hr.payroll.setup.manage
hr.payroll.setup.read
hr.performance.manage
hr.performance.publish
hr.performance.read
hr.performance.review
hr.report_audit.read
hr.report_export.create
hr.report_export.download
hr.report_export.read
hr.report_export_policy.approve
hr.report_export_policy.manage
hr.statutory_rule.read
hr.work_location_jurisdiction.manage
hr.work_location_jurisdiction.read
inventory.bin.create
inventory.bin.read
inventory.item.create
inventory.item.read
inventory.stock.read
master_data.location.manage
master_data.location.read
master_data.project.manage
master_data.project.read
platform.accounting_period.create
platform.accounting_period.read
platform.approval.override
platform.audit_event.read
platform.company_legal_profile.manage
platform.company_legal_profile.read
platform.company_payroll_configuration.manage
platform.company_payroll_configuration.read
platform.company_registration.manage
platform.company_registration.read
platform.currency.create
platform.currency.manage
platform.currency.read
platform.currency_rate.create
platform.currency_rate.manage
platform.currency_rate.read
platform.fiscal_calendar.create
platform.fiscal_calendar.read
platform.localization.activate
platform.localization.read
platform.numbering_sequence.allocate
platform.numbering_sequence.create
platform.numbering_sequence.read
platform.organization_unit.create
platform.organization_unit.read
platform.organization_unit.update
platform.resources.create
platform.resources.read
platform.setup_draft.activate
platform.setup_draft.create
platform.setup_draft.decide
platform.setup_draft.read
platform.tenant.create
platform.tenant.read
platform.tenant_module.create
platform.tenant_module.read
platform.tenant_policy.create
platform.tenant_policy.read
procurement.document.action
procurement.document.approve
procurement.document.create
procurement.document.read
procurement.document.self_approve
procurement.document.submit
procurement.invoice_match.create
procurement.purchase_order.create
procurement.receipt.create
procurement.receipt.post
procurement.requisition.create
procurement.vendor.create
procurement.vendor.read
security.access_review.activate
security.access_review.approve
security.access_review.close
security.access_review.create
security.access_review.decide
security.access_review.read
security.access_review.submit
security.authorization.administer
security.authorization.assignment.approve
security.authorization.assignment.create
security.authorization.assignment.edit
security.authorization.assignment.read
security.authorization.assignment.revoke
security.authorization.assignment.submit
security.authorization.audit.read
security.authorization.permission.read
security.authorization.role.activate
security.authorization.role.approve
security.authorization.role.archive
security.authorization.role.create
security.authorization.role.edit
security.authorization.role.read
security.authorization.role.submit
security.bank_self_approval.manage
security.bank_self_approval.read
security.delegation.activate
security.delegation.approve
security.delegation.create
security.delegation.read
security.delegation.revoke
security.delegation.submit
security.impersonation.activate
security.impersonation.approve
security.impersonation.create
security.impersonation.emergency_activate
security.impersonation.end
security.impersonation.read
security.impersonation.submit
security.role_assignment.create
security.role_policy.create
security.session_policy.activate
security.session_policy.approve
security.session_policy.create
security.session_policy.read
security.session_policy.submit
security.user_account.activate
security.user_account.approve
security.user_account.archive
security.user_account.company_access
security.user_account.create
security.user_account.edit
security.user_account.lock
security.user_account.read
security.user_account.reset_password
security.user_account.revoke_sessions
security.user_account.submit
workflow.approval.approve
workflow.approval.reject
```
