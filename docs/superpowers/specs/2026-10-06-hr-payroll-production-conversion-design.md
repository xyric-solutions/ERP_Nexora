# HR & Payroll Prototype-to-Production Conversion Design

- Status: approved by product owner on 2026-10-06
- UX authority: live `prototype/app/` HR & Payroll screens
- Implementation authority: live `app/`, `contracts/`, `web/`, PostgreSQL migrations and tests
- Active roots: `app/`, `contracts/`, `tests/`, `web/`

## Goal

Convert all 67 approved HR & Payroll prototype screens into production workflows
without redesigning them or creating a second HR implementation. A screen is
complete only when its existing controls operate through typed APIs, backend
business logic, PostgreSQL, tenant/company isolation, authorization, audit and
approval controls as applicable.

## Source tie-breaker

The prototype wins UI, navigation, terminology, fields, actions and workflow
intent. Live production code, schema, contract and tests win implementation
ties. A conflict affecting correctness or safety is recorded as a finding and
resolved without silently changing the approved experience.

The isolated `prototype/` application remains the executable UX reference. It
is not connected directly to production services. Approved components and
interaction contracts are progressively carried into `web/` and backed by the
existing production authorities.

## Existing authorities to preserve

- Platform tenant, company and arbitrary organization-unit hierarchy.
- HR master, Employee, profile satellite, legal employment relationship,
  lifecycle, assignment and Employment Context authorities.
- Explicit work-location and approved-override jurisdiction resolution.
- Attendance, shift, holiday, correction, overtime, Leave and locked payroll
  input authorities.
- Effective-dated compensation, deterministic Payroll, statutory snapshots,
  Finance posting, released payslips and governed payment export.
- Shared Workflow, RBAC, audit, idempotency and PostgreSQL RLS controls.

No parallel employee, organization, leave, payroll, accounting, workflow or
audit engine is permitted.

## UI conversion pattern

Each prototype screen is treated as a stable presentation contract:

1. Preserve its name, route intent, columns, filters, actions, detail views,
   statuses, empty/loading/error states and visible explanations.
2. Replace imported fixture arrays and frontend calculation functions with
   generated-client queries and idempotent commands.
3. Execute validation, transitions, balances and monetary calculations only on
   the backend.
4. Render backend-authoritative results and correlation-safe errors.
5. Hide unavailable actions for usability, while retaining backend denial as
   the security boundary.

## Production request path

`UI -> generated API client -> application service -> PostgreSQL transaction ->
RLS/RBAC -> audit/approval -> committed response -> query refresh`

Material writes use idempotency keys and commit their audit evidence in the
same transaction. Effective-dated evidence is superseded or ended; historical
records are never silently rewritten.

## Conversion order

1. Organisation & Masters.
2. People and Employee Management.
3. Attendance & Shifts.
4. Time & Leave.
5. Payroll screen parity and manual acceptance.
6. Recruitment.
7. Employee Lifecycle specializations.
8. Performance and Learning.
9. Benefits, self-service, reporting, compliance and export.

This order establishes data prerequisites before dependent workflows. Each
group is vertically completed and verified before the next group starts.

## First batch: HR-PARITY-01

Convert the seven Organisation & Masters screens:

- Organisation Structure
- Designations
- Job Grades
- Cost Centres
- Work Locations
- Employment Types
- Employee Categories

The organization screen reuses Platform `organization_unit`. The six master
screens reuse `hr_master_record`; the existing additional `job` master remains
available to assignment workflows but is not promoted into an invented
prototype screen.

Required behavior includes list, search, filter, create, view, edit where the
existing authority safely supports it, activate/deactivate, usage protection,
history and audit. Unsupported destructive deletion remains unavailable when
history references a record.

## Verification

Every batch selects relevant gates from `verification-matrix.md`, including:

- focused domain and API tests;
- PostgreSQL migration/RLS/integrity tests when persistence changes;
- contract snapshot and generated-client drift;
- allowed, denied, cross-company and cross-tenant security tests;
- frontend interaction, accessibility, TypeScript, lint and build;
- browser-level manual workflow evidence against the PostgreSQL Demo.

## Non-goals

- No redesign or new prototype.
- No direct database access from the browser.
- No country/statutory invention or jurisdiction inference.
- No historical Payroll recalculation.
- No duplicate Finance posting engine.
- No unrelated module implementation in an HR batch.

