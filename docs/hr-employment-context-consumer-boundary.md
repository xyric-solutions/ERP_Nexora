# Employment Context Consumer Boundary

`EmploymentContextProvider` is the read-only HR-EMP-02E boundary for resolving
an employee's legal-employment and operational-placement facts on one explicit
calendar date. It composes existing authorities; it does not persist a context
projection or replace Employee, employment relationships, lifecycle events,
assignments, organization units, HR master data, HR-LOC or compensation.

## Contract

Callers provide trusted `tenant_id`, `company_id`, `employee_id` and a mandatory
day-granular `as_of`. PostgreSQL resolution occurs in one transaction with the
tenant RLS setting applied locally. The response contains stable authority IDs,
effective bounds, money-free payroll prerequisite evidence, HR-LOC resolution
status, source references and a canonical SHA-256 `context_hash`.

The lifecycle block, not Employee status or the relationship's current stored
projection, is authoritative for lifecycle state at `as_of`. Operational
assignments must be relationship-bound; legacy compatibility assignments are
never promoted. Legal employer comes from the relationship, while organization
placement and work location come from the assignment.

The provider fails closed for missing or multiple relationships/assignments,
inconsistent lifecycle chains, cross-company references, ambiguous salary
authorities and mismatched HR-LOC assignment evidence. HR-LOC unresolved or
cross-country results are returned as blocked readiness with their existing
resolver reason. Missing salary authority is also a readiness blocker.
Payroll eligibility remains `not_assessed`.

Master-data and organization IDs are historical evidence. Their display labels
are current descriptive metadata because those source tables are not
effective-dated; consumers requiring immutable former labels must retain the
resolved response with their own immutable business evidence rather than infer
history.

## Controlled API

`GET /api/v1/hr/employment_contexts` requires
`hr.employment_context.read`, contextual company authorization and the three
query fields `company_id`, `employee_id` and `as_of`. Responses are marked
`private, no-store`. The API exposes no salary amounts, tax, deductions,
contributions, gross/net pay, payslips or payroll accounting.

This is a side-effect-free read, so command idempotency and immutable mutation
audit rows do not apply. It uses the existing API request telemetry without
logging request bodies or authorization headers. Downstream material commands
must retain the returned hash/source evidence in their own existing audit and
idempotency transaction rather than ask this provider to create evidence rows.

## Future consumers

- **Payroll:** resolve at each processing segment/cutoff before applying Payroll
  policy. Retain the context hash and source references with immutable payroll
  evidence. Continue reading compensation amounts from the salary authority and
  statutory calculations from the existing HR-LOC Payroll provider.
- **Attendance:** resolve for the attendance work date. Use normalized placement
  while retaining branch/department compatibility until a separately approved
  migration replaces the current direct reads and database triggers.
- **Leave and Benefits:** resolve at the entitlement/event date, then apply the
  owning module's policy. Employment context supplies facts, not entitlement.
- **HR Reporting:** resolve for each report date or retain previously resolved
  hashes for immutable reports; do not join current Employee/assignment
  projections to reconstruct history.

Existing Payroll, Attendance, Leave and identity consumers are not migrated by
HR-EMP-02E. Their direct reads remain compatibility debt for separately approved
consumer slices; new employment-context reconstruction must use this provider.
