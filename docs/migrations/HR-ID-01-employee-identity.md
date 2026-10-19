# HR-ID-01 Employee Identity Migration

HR migration 5 adds `employee_user_binding` after Platform, Security and the
earlier HR migrations. Apply it through the existing HR migration command:

```powershell
$env:NEXORA_DATABASE_DSN = '<operator-supplied PostgreSQL DSN>'
nexora-hr-migrate status
nexora-hr-migrate apply
nexora-hr-migrate status
```

The migration requires Security migration 1 because every binding and actor is
backed by a tenant-scoped `security_user_account`. It uses forced RLS, composite
tenant foreign keys, indexed effective dates and PostgreSQL exclusion
constraints to prevent overlapping account or employee ownership.

Rollback is preservation-safe and refuses while any binding exists:

```powershell
nexora-hr-migrate rollback
```

Do not manually drop binding history. End an active binding through the audited
API, and retain the record as identity evidence.

Required permissions are `hr.employee_identity.read`,
`hr.employee_identity.manage`, and own-scoped `hr.payroll.payslip.read`.
Self-service never accepts an employee identifier.
