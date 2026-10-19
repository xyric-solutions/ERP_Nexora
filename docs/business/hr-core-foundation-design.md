# Nexora — Core HR Foundation Design (Phase 1)

Status: proposed, awaiting two decisions (D1, D2 below)
Scope: organization masters, employee master, effective-dated employee history,
HR permissions, approval-engine completion, audit field history.
Out of scope this phase: attendance, leave, payroll, recruitment, finance
postings. Phase 1 exists so those can be added without reshaping anything.

---

## 1. What already exists (reuse, do not rebuild)

The single most important design input is that Nexora already has most of the
platform this phase would otherwise invent. Building parallel copies would be
the expensive mistake.

| Requirement in the brief | Already in the codebase | Verdict |
|---|---|---|
| Company / Branch / Department | `organization_unit` (`app/platform`, 0002) — self-referencing tree, types `company\|branch\|department\|warehouse`, tenant-scoped, `status active\|inactive` | **Reuse** (see D2) |
| Users, roles, permissions | `user_account`, `role_policy` (versioned, with `permissions_json`, `scope_json`, `field_rules_json`, `sod_rules_json`), `user_role_assignment` (`app/security`, 0001) | **Reuse** — HR adds permission strings and role policies, no new tables |
| Field-level protection | `PolicyEvaluator` enforces `allowed_fields` / `denied_fields` against each route's declared `requested_fields` (`app/api/application.py`) | **Reuse** |
| Segregation of duties | `sod_rules_json`: `conflicting_roles` and `distinct_actor_fields` | **Reuse** |
| Approval engine | `workflow_definition` (module, trigger, versioned `steps_json`, status) + `approval_instance` (`source_type`, `source_id`, `current_step_id`, state) (`app/workflow`, 0005) | **Reuse and complete** — engine is already generic; the action log is missing |
| Audit trail | `audit_event` — hash-chained (`sequence`, `previous_event_hash`, `event_hash`, `before_hash`, `after_hash`) (`app/security`, 0001) | **Reuse and extend** — tamper-evident but stores hashes, not values |
| Employee | `party (type='employee')` — the accepted S3.2 design (`docs/business/sales-hr-projects-design.md`) | **Decision D1** |

Two gaps are real and this phase closes them:

1. **`approval_action` does not exist.** `approval_instance` holds one current
   state; there is no per-decision row. The brief requires approver, level,
   timestamp, action, comments, previous status and new status. Without it an
   approval history cannot be shown or audited.
2. **Audit stores hashes, not values.** `before_hash`/`after_hash` prove a
   record changed and that the log was not edited; they cannot answer "what was
   the salary before?". Sensitive-field history needs old/new values, which is
   itself sensitive data and needs its own read permission.

---

## 2. Two decisions that change the schema (D1, D2)

These conflict with locked intent, so they are logged as drift rather than
decided silently. Recommendations given; both are defensible.

### D1 — Employee identity

`segments/S3.2` (locked) and the accepted design say: *"Employee record
(`Party`, type=employee, extended with employment fields)"*. The brief asks for
a dedicated `employees` table with ten organizational links, nine statuses and
eight satellite tables.

**Recommended: dedicated `employee` table with an optional `party_id` link.**

- An employee master with personal, contact, employment, tax, bank, dependent,
  document and history data is not a party attribute set. Bolting ~40 columns
  onto `party` would degrade a table that customers, vendors, procurement and
  finance already depend on.
- The `party` link is kept (nullable, unique) so payroll can pay an employee
  through the existing party/bank rails without a second payment concept. It is
  created on demand when payroll arrives, not for every employee.
- Drift to log: S3.2's schema line is superseded for Phase 1; the intent it
  protects (one payment abstraction) is preserved through `party_id`.

Alternative: keep employees on `party`, add `employee_profile` 1:1. Fewer
tables, but every HR query joins through a party row that carries customer and
vendor semantics, and `party.code` unique-per-tenant fights `employee_number`.

### D2 — Organization masters

The brief lists `companies`, `branches`, `departments` as separate tables.
`organization_unit` already models exactly this tree, and finance dimensions,
operations and the setup wizard reference it.

**Recommended: reuse `organization_unit` for company, branch and department.**
Add only what has no home: `job_grade`, `designation`, `cost_center`,
`work_location`, `employment_type`, `employee_category`.

- Splitting into three tables would fork the org tree: two sources of truth for
  "which department" between HR and Finance, and no way to answer a
  cost-by-department question across both.
- `cost_center` is deliberately **not** an `organization_unit` type: finance
  treats cost centre as a posting dimension (`dimensions_json`), not a place in
  the org chart, and a cost centre may span branches. It gets its own table with
  an optional owning org unit.
- Drift to log: the brief's table list is satisfied by different physical
  tables; every listed concept exists.

Alternative: dedicated `company`/`branch`/`department` tables, with
`organization_unit` kept in sync. Rejected as two writable copies of one tree.

---

## 3. Entities and relationships

```
tenant
 └─ organization_unit (company → branch → department)        [existing]
      ├─ cost_center            (optional owning unit)        [new]
      ├─ work_location          (optional owning unit)        [new]
      └─ employee.*_id links

job_grade ──┐
designation ─┤
employment_type ─┼──► employee ◄── reporting manager (employee, self-FK)
employee_category ─┘        │
                            ├─ employee_contact          (1:1, separated for field rules)
                            ├─ employee_bank_account     (1:N, one primary)
                            ├─ employee_tax_profile      (1:1)
                            ├─ employee_emergency_contact(1:N)
                            ├─ employee_dependent        (1:N)
                            ├─ employee_document         (1:N, metadata + storage key)
                            ├─ employee_assignment       (1:N, effective-dated — the org facts)
                            └─ employee_status_history   (1:N, effective-dated — the lifecycle)

approval_instance ──► approval_action (1:N)                   [new, cross-cutting]
audit_event      ──► audit_field_change (1:N)                 [new, cross-cutting]
```

`party` is referenced from `employee.party_id` (nullable, unique per tenant).

### Why assignment and status history are separate tables

The brief lists ten history types (department transfer, designation change,
grade change, manager change, salary revision, promotion, status change …).
Nine of them are "the employee's organizational placement changed"; one is "the
employee's lifecycle state changed". They have different keys, different
approval rules and different consumers.

- **`employee_assignment`** is the effective-dated row holding *every*
  organizational fact at once: company, branch, department, designation, grade,
  cost centre, work location, employment type, category, reporting manager,
  plus `change_reason` (`transfer`, `promotion`, `demotion`, `revision`, …).
  A promotion that changes grade *and* designation *and* manager is one row with
  one effective date, not three rows that can disagree.
- **`employee_status_history`** records Draft → … → Terminated transitions with
  the reason and the approval that authorised them.

`employee` itself carries **no** organizational foreign keys. The current
assignment is derived: the row with the greatest `effective_from <= today`.
This is the only way to make "never overwrite historical information" true by
construction rather than by discipline — there is no current-value column to
overwrite. A denormalised `current_assignment_id` pointer may be added later as
a cache, but the history is the authority.

Salary is *not* in Phase 1 (it belongs to payroll), but `change_reason` already
admits `salary_revision` so the payroll phase adds a column, not a table.

---

## 4. Employee identity and status

`employee_number`: `EMP-000001`, zero-padded to six digits, allocated from a
per-tenant counter row inside the creating transaction, unique per tenant. The
format is a tenant setting (prefix, padding) so a tenant that wants `E-2026-001`
is a configuration change, not a migration.

Status model (not a boolean):

```
draft ─submit→ pending_approval ─approve→ active ──► probation ──► confirmed
   ▲                  │                      │           │            │
   └───reject─────────┘                      ├───────────┴────────────┤
                                             ▼                        ▼
                                        suspended ──► resigned / terminated ──► inactive
```

Legal transitions live in one table in code (`EMPLOYEE_STATUS_TRANSITIONS`), are
enforced in the service, and are asserted by tests. `inactive` is terminal
archival; `resigned`/`terminated` keep the record queryable for payroll history.

---

## 5. Approval engine completion

The engine is already reusable: `workflow_definition(module, trigger)` and
`approval_instance(source_type, source_id)` carry no HR knowledge, so leave,
loan, payroll, purchase and expense attach to it unchanged.

Added this phase:

```
approval_action
  id, tenant_id, approval_instance_id, step_id, level (int),
  actor_id, action (submit|approve|reject|cancel|reassign),
  comments, previous_state, new_state, acted_at, sequence
  UNIQUE (tenant_id, approval_instance_id, sequence)
```

`level` is the step's ordinal in the definition, so "approval levels are
configurable" stays a property of `steps_json` (already versioned and
cycle-checked in `WorkflowDefinition`) rather than a new configuration surface.
Steps stay JSON — **D3**: they are immutable per definition version and already
validated in the domain model; normalising them into `approval_steps` would add
a table whose only writer is a version bump.

Employee workflow: `module='hr'`, `trigger='employee.create'` and
`'employee.assignment_change'`. Self-approval is already denied by
`WorkflowSelfApprovalDenied`; HR adds a `distinct_actor_fields` SoD rule so the
employee who is the subject can never approve their own record.

---

## 6. Audit design

Two layers, because they answer different questions:

1. **`audit_event` (existing, unchanged)** — *did this record change, and has the
   log been tampered with?* Hash-chained per tenant.
2. **`audit_field_change` (new)** — *what was the old value?*

```
audit_field_change
  id, tenant_id, audit_event_id, entity_type, entity_id,
  field_name, old_value, new_value, is_sensitive, recorded_at
  FK (tenant_id, audit_event_id) → audit_event ON DELETE RESTRICT
  INDEX (tenant_id, entity_type, entity_id, field_name)
```

Only fields on a declared sensitive list are written with values: salary, bank
account, tax identifiers, department, designation, grade, employee status. Every
other change is covered by the hash pair alone — recording every field's old
value would turn the audit log into a second, unprotected copy of the database.

Reading `audit_field_change` requires `hr.employee.audit.read`, separate from
`hr.employee.read`: the audit of a bank account is as sensitive as the bank
account. Bank account numbers and tax identifiers are stored masked
(last four retained) with the full value never leaving the write path.

Actor/timestamp columns (`created_by`, `submitted_by`, `approved_by`,
`rejected_by`, `cancelled_by` …) live on the records themselves; the audit log
is the cross-entity view, not the only copy.

---

## 7. Permission matrix

Permission strings follow the existing convention (`platform.resources.read`,
`hr.payroll.run`): `hr.<entity>.<action>`.

Actions: `read`, `create`, `update`, `submit`, `approve`, `reject`, `cancel`,
`delete`, `export`, `print`, plus `audit.read` for field history.

| Role | Masters | Employee | Assignment / history | Approve | Bank & tax | Audit | Export |
|---|---|---|---|---|---|---|---|
| Employee | — | own record, read | own, read | — | own, read (masked) | — | — |
| HR Officer | read | create, update, submit | create, submit | — | update | — | print |
| HR Manager | create, update, deactivate | all + cancel | all + cancel | ✔ level 2 | update | ✔ | ✔ |
| Department Manager | read | read (own department) | submit (own department) | ✔ level 1 | — | — | — |
| Finance Officer | read | read (masked) | read | — | read | — | ✔ |
| Finance Manager | read | read (masked) | read | ✔ (payroll-affecting only) | read | ✔ | ✔ |
| System Administrator | create, update, deactivate | — | — | — | — | ✔ | — |
| Management | read | read (masked) | read | — | — | — | ✔ |

Notes that make this real rather than decorative:

- **System Administrator has no employee data access.** Administering the system
  is not a reason to read salaries or bank accounts. Field rules deny those
  fields to that role.
- **"masked"** is enforced by `field_rules_json.denied_fields`, not by the UI.
- **Department Manager scope** is `scope_json` restricted to their own org unit
  subtree; the scope filter is applied server-side before any client filter.
- No role holds both `hr.employee.submit` and `hr.employee.approve` for the same
  record — enforced by `distinct_actor_fields`, not by convention.

---

## 8. Validation rules (server-side, in services)

| Rule | Where |
|---|---|
| Employee number unique per tenant, matches configured format | DB unique constraint + service |
| National ID / CNIC matches the tenant's configured pattern | Tenant policy + service; no country hardcoded |
| Employee cannot be assigned to an inactive department, branch, grade, designation, cost centre, work location or employment type | Service, checked against `status='active'` at the assignment's effective date |
| Exactly one primary employment assignment is in effect on any date | Partial unique index + service overlap check |
| Assignment effective dates cannot overlap or leave gaps | Service; new row closes the previous one (`effective_to = new.effective_from - 1 day`) |
| Effective date cannot precede the employee's joining date | Service |
| Reporting manager must be an active employee, in the same tenant, and must not create a management cycle | Service walks the chain |
| Status transition must be legal for the current status | Service transition table |
| At most one primary bank account per employee | Partial unique index |
| A master in use by an employee assignment cannot be deleted | FK `ON DELETE RESTRICT` + deactivate-instead-of-delete |
| Documents are readable only by a principal with the document's permission and scope | Service, before any storage read |

Soft deletion: masters carry `status` and `deactivated_at`/`deactivated_by`.
There is no hard delete path for a master referenced by any transaction — the
foreign keys are `ON DELETE RESTRICT`, so the database refuses even if a service
is bypassed.

---

## 9. API surface (v1)

```
GET    /api/v1/hr/employees                     hr.employee.read
POST   /api/v1/hr/employees                     hr.employee.create
GET    /api/v1/hr/employees/{id}                hr.employee.read
PATCH  /api/v1/hr/employees/{id}                hr.employee.update
POST   /api/v1/hr/employees/{id}/submit         hr.employee.submit
POST   /api/v1/hr/employees/{id}/status         hr.employee.update
GET    /api/v1/hr/employees/{id}/assignments    hr.employee.read
POST   /api/v1/hr/employees/{id}/assignments    hr.employee_assignment.create
GET    /api/v1/hr/employees/{id}/history        hr.employee.read
GET    /api/v1/hr/employees/{id}/audit          hr.employee.audit.read
GET    /api/v1/hr/employees/{id}/documents      hr.employee_document.read
POST   /api/v1/hr/employees/{id}/documents      hr.employee_document.create
GET    /api/v1/hr/{master}                      hr.<master>.read
POST   /api/v1/hr/{master}                      hr.<master>.create
PATCH  /api/v1/hr/{master}/{id}                 hr.<master>.update
POST   /api/v1/approvals/{id}/actions           <module>.<entity>.approve|reject
GET    /api/v1/approvals/{id}/actions           <module>.<entity>.read
```

Every route declares `requested_fields` so the field-rule evaluator can deny
sensitive fields per role — that is how "no sensitive information exposed
through unauthorized APIs" is enforced, at the gateway, not in handlers.
Contracts regenerate into `contracts/openapi-v1.json`; the contract test suite
fails if a route ships undeclared.

---

## 10. Layering (no business logic in controllers)

Mirrors `app/finance`:

```
app/hr/
  models.py       frozen dataclasses; invariants in __post_init__ (no I/O)
  migrations.py   versioned applier with drift detection + rollback guard
  migrations/     0015_hr_core.forward.sql / .rollback.sql
  repository.py   PostgreSQL persistence only; no rules
  service.py      use cases: create, submit, approve, assign, change status
  numbering.py    employee number allocation
```

Handlers in `app/api/application.py` parse, authorise, delegate, serialise.
Authorisation is evaluated before a service is reached; audit is written inside
the service transaction so a change and its audit row commit together or not at
all.

---

## 11. UI structure (`web/`)

Master screens (one shared shell): List · Search · Filter · Add · Edit · View ·
Status toggle · History · Audit trail.

Employee profile tabs: Overview · Personal · Contact · Employment ·
Organization · Bank · Tax · Documents · Dependents · History · Audit.

The History tab renders `employee_assignment` and `employee_status_history` as
one timeline with effective dates and the approval that authorised each change.
Tabs the role cannot see are absent, not disabled — a disabled Bank tab still
tells the viewer a bank account exists.

---

## 12. Test plan

| Level | What it proves |
|---|---|
| Migration | forward/rollback, version uniqueness (`test_migration_registry.py`), drift detection, every FK resolves, rollback refuses while rows exist |
| Unit | status transition table, assignment overlap arithmetic, manager-cycle detection, employee number format and allocation, masking |
| Integration | create → submit → approve → active writes exactly one approval instance, the action rows, the audit event and its field changes |
| Security | department manager cannot read outside their subtree; system administrator is denied salary and bank fields; submitter cannot approve; audit read needs its own permission |
| Contract | every HR route present in `contracts/openapi-v1.json` with declared fields |
| E2E | employee lifecycle through the API with a seeded tenant |

---

## 13. Implementation sequence

Each slice ends green on
`python scripts/verify.py unit integration contract security e2e migration`.

| Slice | Content | Migration |
|---|---|---|
| 1 | Cross-cutting completion: `approval_action`, `audit_field_change` | 0014 |
| 2 | HR masters: grade, designation, cost centre, work location, employment type, employee category + repository/service/tests | 0015 |
| 3 | Employee master + satellites (contact, bank, tax, emergency, dependent, document) + numbering | 0015 |
| 4 | Effective-dated assignment and status history + validation rules | 0015 |
| 5 | Services: create/submit/approve/status/assign, audit writes, SoD | — |
| 6 | API routes, contract regeneration, permission matrix seeding | — |
| 7 | `web/` master screens and employee profile tabs | — |

Slices 2–4 share migration 0015: the employee tables and their masters are one
schema unit, and splitting them would ship a database with dangling references.

---

## 14. Assumptions

1. One tenant may hold several companies; `organization_unit` already supports
   this and `employee` is scoped to tenant, with company via its assignment.
2. Multi-company employment (one person employed by two companies at once) is
   out of scope; the single-primary-assignment rule assumes it.
3. Salary is deliberately absent from Phase 1 — `change_reason` reserves the
   value so payroll adds a column, not a redesign.
4. Document storage is metadata + storage key; no blob store exists yet. The
   access check is implemented now so the storage backend inherits it.
5. National ID format is per-tenant configuration. Nothing is hardcoded to one
   country, following the jurisdiction-pack pattern (I-009).
6. Dates are ISO-8601 strings, money is TEXT with `Decimal` arithmetic —
   matching `journal_line`. No floats anywhere near money.
