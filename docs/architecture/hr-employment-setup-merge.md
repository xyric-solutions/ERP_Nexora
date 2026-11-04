# HR Employment Setup merge (HR134)

- Status: implemented; awaiting owner visual acceptance
- Checkpoint before this change: commit `794b9a6`

## Decision

Employment Type (`employment_type`, Payment route) and Employee Category
(`employee_category`, Pay cycle) are merged into one HR master kind,
**Employment Setup** (`employment_setup`). One record holds:

| Field | Rule |
|---|---|
| Code | Server-allocated, prefix `ES`, e.g. `ES-001` (`hr_record_code_counter`) |
| Name | 1–160 characters |
| Description | 0–1000 characters |
| Status | `active` / `inactive` (Delete archives to inactive) |
| Payment route | `payroll` \| `stipend` \| `accounts_payable` |
| Pay cycle | `monthly` \| `fortnightly` \| `weekly` \| `stipend` |

There is no "Kind". Every downstream reference to an employment type and/or
employee category becomes one Employment Setup reference.

Owner answers to open questions:

1. **Offers**: the offer's Employment Setup defaults to the requisition's
   setup, is editable while the offer is a draft, and locks once submitted.
2. **Leave restrictions**: a category referenced only by leave policies/types
   still gets an Employment Setup (Payment route `payroll`, Pay cycle from the
   category) so restrictions never silently widen.
3. **API**: clean replacement in `/api/v1`; old type/category fields are
   removed from requests and responses (no mobile client exists).
4. Requisitions that carried only a type map to the lowest-code setup derived
   from that type (or a new setup with Pay cycle `monthly`).
5. Payment route `stipend` and Pay cycle `stipend` are not cross-enforced.
6. Converted setups are named `Type / Category`; owners may rename them.

## Data design

- Same table `hr_master_record`, new `master_type = 'employment_setup'`, new
  nullable columns `payment_route`, `pay_cycle`, constraint
  `hr_master_employment_setup_terms` (both required and valid for
  `employment_setup`, `configuration_key` null; both null for every other
  type). `validate_hr_master_configuration` (HR036) already rejects
  configuration on unlisted types.
- `employment_type` / `employee_category` stay in the type check list as
  read-only legacy rows: archived (inactive) by the migration, and a guard
  trigger `guard_hr_retired_employment_masters` rejects inserting them or
  reactivating them.
- `hr_employment_setup_legacy_map (tenant_id, company_id, employment_setup_id,
  employment_type_id NULL, employee_category_id NULL, created_at)` records
  provenance (audit evidence, leave expansion, rollback). RLS enabled+forced.
- New references (NOT NULL after backfill, FK to `hr_master_record`, indexed):
  `employee_assignment.employment_setup_id`,
  `hr_employee_transfer_request.proposed_employment_setup_id`,
  `hr_manpower_requisition.employment_setup_id`,
  `hr_recruitment_offer.employment_setup_id`.
  `hr_leave_type` and `hr_leave_policy_version` gain
  `applicable_employment_setup_ids text[] NOT NULL DEFAULT '{}'` (settlements
  read eligibility from leave policies).
- Old columns become nullable and are no longer written. Dropping them is a
  separate future migration after production verification.
- Trigger functions that type-check old columns are replaced in HR134 to check
  `employment_setup_id` (HR012 `validate_hr_assignment_scope`,
  `protect_employee_assignment_history`; HR028 transfer validation; HR037
  requisition validation; HR042 `guard_hr_offer_mutation`). Every trigger on
  the touched tables must be reviewed, including
  `employee_assignment_legacy_placement_sync`,
  `hr_employee_transfer_context_guard`, `hr_leave_policy_scope` and the
  `hr_a00_*_serialization` triggers.

## Backfill (inside HR134, per tenant, following the HR120 tenant loop)

1. Map rows for every distinct (company, type, category) pair used by
   assignments, transfer proposals and offers.
2. (type, NULL) for requisition types without a pair; (type, NULL) for each
   unused active employment type; (NULL, category) for each category named in
   a leave type/policy list without a map row.
3. Create setups in one writable-CTE statement: code `ES-nnn` per company
   ordered by type code then category code; name `Type / Category` (suffix
   ` (ES-nnn)` on collision); description `Converted from ET-x / EC-y`;
   payment route from the type (default `payroll`); pay cycle from the
   category (default `monthly`); status active; actor = source `created_by`.
4. Set `hr_record_code_counter` for `employment_setup` per company.
5. Fill new reference columns from the map; requisitions by type → lowest
   code setup.
6. Expand every leave type/policy version category list (including closed
   versions) to the setups derived from those categories.
7. Archive the legacy masters.
8. Fail closed: raise if any reference column is still null or any non-empty
   category list produced an empty setup list.

Guard triggers that block the backfill are disabled by name for the
backfill only and re-enabled in the same migration.

## Rollback runbook (manual; the runner is forward-only)

1. Drop `guard_hr_retired_employment_masters` trigger and function.
2. Reactivate legacy masters referenced by `hr_employment_setup_legacy_map`.
3. Re-apply the original function bodies from HR012, HR028, HR037, HR042.
4. Refill old reference columns from the map (blocked for setups created after
   HR134, which have no legacy mapping — resolve those by hand first).
5. Restore NOT NULL on the old columns; drop the new columns, indexes, the
   converted setups, the map table and constraint; restore the type check.
6. Delete the `('hr',134)` row from `nexora_schema_migration`.

Take a database backup before applying HR134 outside local/UAT; it takes
exclusive locks on core HR tables.
