# HR & Payroll Node Production Implementation Plan

- Status: proposed for owner verification; no development authorized yet
- Date: 2026-10-06
- Source design: `docs/superpowers/specs/2026-10-06-hr-payroll-node-production-design.md`
- Working directory: `prototype/`
- Stack: Next.js, TypeScript, Node.js, Express.js, PostgreSQL, Redis/BullMQ, private S3-compatible storage
- Product model: single customer, multiple companies/branches, Pakistan payroll, up to 5,000 employees

## 1. Execution contract

This plan converts the current Vinext mock prototype in place. Work proceeds in
dependency order and stops at every wave gate for review. Development begins
only after the owner approves this plan.

For every behavioral task:

1. Add or update a failing automated test that expresses the required rule.
2. Implement the smallest production path needed to pass it.
3. Verify authorization, company scope, audit, error, retry, and reversal paths
   where applicable.
4. Replace the relevant mock-data path only after the production path is
   working.
5. Run focused checks, then the wave gate.
6. Record evidence and obtain business UAT before closing the wave.

Existing mock functions remain characterization references until production
tests cover their behavior. No task may weaken a test, type, security rule, or
database invariant merely to make a gate pass.

## 2. Planned repository layout

```text
prototype/
  apps/
    web/
      app/                    Next.js routes and layouts
      src/features/           screen-specific feature code
      src/components/         shared UI components
      src/lib/api/            generated client and query helpers
    api/
      src/modules/            Express module routes/services
      src/http/               middleware and error handling
      src/server.ts
    worker/
      src/jobs/               BullMQ processors
      src/worker.ts
  packages/
    contracts/src/            schemas, OpenAPI and shared identifiers
    db/src/schema/            Drizzle schema
    db/src/repositories/      PostgreSQL access
    db/migrations/            explicit SQL migrations
    domain/src/               framework-independent rules
    auth/src/                 sessions, MFA and policy evaluation
    observability/src/        logs, metrics and tracing
    testing/src/              factories and integration harnesses
  tests/
    integration/
    contract/
    e2e/
    performance/
    security/
  docs/
    adr/
    parity/
    runbooks/
    evidence/
```

The current `app/` prototype is migrated into `apps/web/` incrementally. It is
not deleted wholesale. Static fixtures move into test factories or are removed
only when each owning production module is complete.

## 3. Planned command surface

Wave 1 establishes these root scripts; later gates use them consistently:

```text
npm run format:check
npm run lint
npm run typecheck
npm run test:unit
npm run test:integration
npm run test:contract
npm run test:e2e
npm run test:a11y
npm run test:security
npm run test:performance
npm run db:migrate:test
npm run api:check
npm run build
npm test
```

Commands listed here are planned deliverables and do not all exist in the
current prototype.

## 4. Module-to-task index

| Module | Primary tasks |
|---|---|
| M01 Platform & Security | W1-03, W1-04, W2-01 through W2-06, W11-09 |
| M02 Workflow & Audit | W2-07 through W2-10, then approval tasks in every domain wave |
| M03 Organisation | W3-01 through W3-04 |
| M04 Employee Core | W3-05 through W3-12 |
| M05 Manpower Planning | W4-01, W4-02 |
| M06 Recruitment | W4-03 through W4-08 |
| M07 Hire, Onboard & Probation | W4-09 through W4-13 |
| M08 Manage & Develop | W6-01 through W6-06 |
| M09 Move & Reward | W6-07 through W6-10 |
| M10 Separation & Settlement | W10-01 through W10-09 |
| M11 Time & Attendance | W5-01 through W5-09 |
| M12 Leave | W5-10 through W5-15 |
| M13 Payroll & Statutory | W7-01 through W7-11 and W8-01 through W8-11 |
| M14 Benefits & Loans | W7-12 through W7-14 |
| M15 Payments & Finance | W9-01 through W9-09 |
| M16 Self-service | W11-01, W11-02 |
| M17 Reporting & Compliance | W11-03 through W11-06 |
| M18 Documents & Notifications | W2-11 through W2-14 |
| M19 Migration & Operations | W0, W1-06 through W1-12, migration tasks in W3-W10, W11-07 through W11-13 |

## 5. Wave 0 — Baseline stabilization and audit freeze

Goal: establish a trustworthy baseline before restructuring the runtime.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W0-01 | Generate the authoritative 35-module/146-group/792-page manifest and the 67-screen HR parity register. Classify each HR screen as dedicated, generic fallback, or report. | `scripts/generate-prototype-manifest.mjs`, `docs/parity/prototype-manifest.json`, `docs/parity/hr-screen-parity.csv` | Generated counts match `app/prototype-data.ts`; every HR page appears once with owner module and current renderer. |
| W0-02 | Review the five added groups and 43 added pages that differ from the old asserted baseline. Approve or remove them explicitly. | `docs/parity/catalogue-drift-review.md` | Product-owner decision exists for every drift item; the manifest becomes the frozen UX authority. |
| W0-03 | Reconcile README, inventory, rendered labels, and tests to the approved live catalogue. | `README.md`, `PROTOTYPE-INVENTORY.md`, `tests/rendered-html.test.mjs`, affected rendered-count component | `npm.cmd test` passes all 160 current tests without changing unrelated behavior. |
| W0-04 | Fix the three current lint failures without behavior changes. | `app/hr-reporting-data.ts` | `npm.cmd run lint` passes; focused HR reporting tests remain green. |
| W0-05 | Capture current HR screenshots, keyboard journeys, accessibility results, and representative fixture outputs as conversion evidence. | `tests/e2e/baseline/`, `docs/evidence/W0-prototype-baseline.md` | Evidence covers all 67 HR screens and the critical recruitment, attendance, payroll, and separation journeys. |
| W0-06 | Add the in-place conversion ADR, dependency rules, threat model, sensitive-data inventory, and data-classification policy. | `docs/adr/0001-modular-monolith.md`, `docs/adr/0002-in-place-nextjs-conversion.md`, `docs/security/hr-threat-model.md`, `docs/security/data-classification.md` | Architecture and security review signed; no conflict remains with the approved design. |
| W0-07 | Establish repository hygiene for generated output, local secrets, companion files, coverage, and container volumes. | `.gitignore`, `.editorconfig`, `.gitattributes` | No secrets or generated/local runtime artifacts are staged; line-ending policy is deterministic. |

Wave 0 gate:

```powershell
npm.cmd run lint
npm.cmd test
```

Exit evidence: clean legacy baseline, approved catalogue, HR screen parity
register, screenshots, ADRs, and threat model.

## 6. Wave 1 — Runtime and engineering foundation

Goal: create the production runtime while preserving the approved UI.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W1-01 | Convert the root package to npm workspaces and pin supported Node/npm versions. | `package.json`, `package-lock.json`, `.nvmrc`, `apps/*/package.json`, `packages/*/package.json` | Clean `npm ci` succeeds; workspace dependency graph has no cycles. |
| W1-02 | Create the standard Next.js application and move the existing shell/styles/routes incrementally from Vinext. | `apps/web/next.config.ts`, `apps/web/app/`, `apps/web/src/` | All frozen prototype routes render in Next.js with baseline screenshots and accessibility intact. |
| W1-03 | Create the Express API composition root, request context, graceful shutdown, body limits, CORS/origin policy, security headers, and health endpoints. | `apps/api/src/server.ts`, `apps/api/src/app.ts`, `apps/api/src/http/*` | `/health/live` and `/health/ready` work; unhandled errors return safe problem responses and correlation IDs. |
| W1-04 | Add shared boundary schemas, OpenAPI generation, and a generated web client. | `packages/contracts/src/*`, `apps/api/src/openapi.ts`, `apps/web/src/lib/api/*` | Contract snapshot and generated client drift checks pass in CI. |
| W1-05 | Establish strict TypeScript project references, linting, formatting, and import-boundary rules. | `tsconfig.base.json`, workspace `tsconfig.json` files, `eslint.config.mjs`, formatter config | `format:check`, `lint`, and `typecheck` pass; forbidden cross-module imports fail a test. |
| W1-06 | Add PostgreSQL/Drizzle configuration, connection management, migration runner, advisory migration lock, and test-database lifecycle. | `packages/db/src/*`, `packages/db/migrations/0001_platform.sql`, `drizzle.config.ts` | Empty database migrates deterministically; repeated migration is safe; migration failure leaves a recoverable state. |
| W1-07 | Add Redis/BullMQ job infrastructure, persisted job metadata, retry classification, and dead-letter review. | `apps/worker/src/*`, `packages/contracts/src/jobs/*`, `apps/api/src/modules/jobs/*` | A sample job completes, retries once when classified retryable, and dead-letters a terminal failure without duplication. |
| W1-08 | Add private S3-compatible storage abstraction and local MinIO test harness. | `packages/domain/src/storage/*`, `apps/api/src/modules/files/*`, local container config | Signed upload/download works; bucket is private; checksum mismatch is rejected. |
| W1-09 | Add structured logging, redaction, request/job correlation, metrics, and tracing seams. | `packages/observability/src/*`, API/worker bootstrap | Passwords, tokens, CNIC, bank details, and salary values are absent from logs; one trace spans API, job, and DB. |
| W1-10 | Add local container orchestration for web, API, worker, PostgreSQL, Redis, MinIO, and test dependencies. | `compose.yaml`, `compose.test.yaml`, `.env.example` | One documented command starts a healthy local stack; no real credential is committed. |
| W1-11 | Add unit, PostgreSQL integration, contract, Next.js component, Playwright, axe, and performance test harnesses. | `packages/testing/src/*`, `tests/*`, Playwright/Vitest/Node test configs | One representative passing test exists in each layer and runs in CI. |
| W1-12 | Add CI build, cache, test, migration, dependency, secret, and container-scan gates. | CI workflow files, `docs/runbooks/ci.md` | A failing mandatory check blocks the pipeline; artifacts and reports are retained. |

Wave 1 gate: run all commands in Section 3 except domain-specific performance
thresholds, which become mandatory in later waves.

## 7. Wave 2 — Security, workflow, audit, documents, notifications

Goal: provide cross-cutting controls before business records are created.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W2-01 | Create users, password credentials, password history, lockout/rate-limit state, and administrator bootstrap flow. | `packages/db/src/schema/security.ts`, security migration, `packages/auth/src/passwords.ts`, `apps/api/src/modules/auth/*` | Argon2id hashing, password rules, generic login failures, throttling, and secure bootstrap tests pass. |
| W2-02 | Implement server-side sessions, secure cookies, rotation, idle/absolute expiry, revocation, and CSRF protection. | `packages/auth/src/sessions.ts`, API middleware, web auth helpers | Session fixation, stolen/revoked session, CSRF, and logout-all tests pass. |
| W2-03 | Implement TOTP enrollment, verification, recovery codes, MFA reset approval, and audit. | security schema/migration, `packages/auth/src/mfa.ts`, auth routes/screens | Secret display is one-time; replayed OTP/recovery codes fail; reset is separately authorized and audited. |
| W2-04 | Model roles, permissions, company/branch/org scopes, field rules, and segregation-of-duty conflicts. | security schema, `packages/auth/src/policy/*`, admin contracts | Permission and scope matrix has positive/negative tests, including cross-company denial. |
| W2-05 | Add centralized Express policy middleware and identical UI capability projection. | `apps/api/src/http/authorize.ts`, `apps/web/src/lib/auth/*` | Hidden/disabled UI actions match capability data, while direct forbidden API calls still return 403 and audit denial. |
| W2-06 | Build security administration screens for users, roles, assignments, scopes, sessions, MFA status, and access review. | `apps/web/src/features/security/*` | Administrator completes create/assign/revoke/review journeys accessibly; ordinary HR cannot administer security. |
| W2-07 | Create versioned workflow definitions, steps, conditions, assignments, escalation, delegation, and activation approval. | `packages/db/src/schema/workflow.ts`, migration, `packages/domain/src/workflow/*` | Invalid/cyclic workflows cannot activate; active versions are immutable. |
| W2-08 | Implement workflow instances and append-only actions for submit, approve, reject, return, cancel, delegate, escalate, and complete. | workflow repositories/services/routes/jobs | In-flight instances retain their original definition version; concurrent approval cannot apply twice. |
| W2-09 | Build reusable inbox, approval timeline, comments, delegation, and configuration screens. | `apps/web/src/features/workflow/*` | Manager/HR/management paths render correct pending steps and history across company scopes. |
| W2-10 | Create append-only audit events and field changes, integrity chaining/checks, sensitive-read events, and audit search/export permissions. | `packages/db/src/schema/audit.ts`, `packages/domain/src/audit/*`, audit routes/screens | Business change and audit commit atomically; tampering/integrity failure is detectable; unauthorized audit access fails. |
| W2-11 | Implement document metadata, classifications, retention status, signed operations, checksum verification, and restricted access. | `packages/db/src/schema/documents.ts`, file services/routes | Private document access is scoped and audited; guessed object keys are useless. |
| W2-12 | Add file-type/size validation, malware-scan job, quarantine, release, and rejection handling. | worker scan job, storage services, document screens | Unscanned or infected files cannot be downloaded by normal users; outcomes are auditable. |
| W2-13 | Implement notification templates, in-app inbox, email adapter, preferences, delivery attempts, and retry rules. | notification schema/module/jobs/web features | Business transaction commits without depending on email success; duplicate retries do not send duplicate notices. |
| W2-14 | Complete cross-cutting UAT and security evidence. | `docs/evidence/W2-*`, security test suites | Login/MFA, scope denial, SoD, workflow, audit, document, and notification journeys are signed. |

## 8. Wave 3 — Organisation and Employee Core

Goal: establish the authoritative organization and employee record.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W3-01 | Model company configuration, timezone, currency, numbering, tax identity, and payroll-registration metadata. | `packages/db/src/schema/organisation.ts`, migrations, organisation module | Company records are permissioned, versioned where material, and cannot be deactivated with open payroll obligations. |
| W3-02 | Implement company → branch → department → section/unit hierarchy with closure/path queries and lifecycle controls. | organisation schema/repositories/services/routes | Cycles are impossible; moves preserve history; company-scoped tree queries meet performance target. |
| W3-03 | Implement designation, grade, cost centre, work location, employment type, and employee category masters with usage protection. | HR master schema/module | Referenced values cannot be deleted; deactivated values remain visible historically but unavailable for new assignments. |
| W3-04 | Implement positions, headcount authorization, vacancy status, and organization-chart queries. | position schema/module/web features | Filled/approved/vacant counts reconcile; one employee cannot occupy conflicting full-time positions. |
| W3-05 | Model employee identity, normalized CNIC, names, birth/gender/contact basics, employee numbering, and lifecycle root. | `packages/db/src/schema/employees.ts`, employee module | Company numbering is concurrency-safe; normalized uniqueness rules and approved exception path pass. |
| W3-06 | Add sensitive contact, address, bank, tax, emergency-contact, dependent, and beneficiary tables with field permissions and masking. | employee satellite schema/services/screens | Role-specific views expose only allowed fields; all changes and sensitive reads are audited. |
| W3-07 | Model legal employment relationship, contract dates, probation, notice, work calendar, and payroll eligibility. | employment schema/module | Concurrent active legal relationships obey policy; contractors excluded from payroll remain payable only through the approved boundary. |
| W3-08 | Implement effective-dated assignment rows with PostgreSQL non-overlap constraints and reporting-manager cycle prevention. | assignment schema/migration/domain/service | Transfers/promotions create new rows atomically; overlap, gap where prohibited, and manager cycles fail. |
| W3-09 | Implement append-only employee status events and legal transition matrix. | status schema/domain/routes | Arbitrary status editing is impossible; transitions require applicable transaction/workflow references. |
| W3-10 | Convert Organisation & Masters, Employee Directory, Add Employee, Employee Record, and Positions screens to real APIs. | `apps/web/src/features/organisation/*`, `apps/web/src/features/employees/*` | The 13 screens use no fixtures or generic fallback; loading/error/empty/denied/read-only states are covered. |
| W3-11 | Build employee document, history, audit, and effective-date timeline tabs. | employee web/API queries | Timeline reconciles assignment, status, document, approval, and audit evidence without leaking salary to unauthorized roles. |
| W3-12 | Deliver employee migration templates, staging validation, first rehearsal, and reconciliation report. | migration module/jobs, `docs/migration/employee-*` | Counts, CNICs, employee numbers, active assignments, statuses, bank/tax profiles, and document checksums reconcile. |

## 9. Wave 4 — Manpower, Recruitment, Hire, Onboard, Probation

Goal: complete approved vacancy through confirmed employee.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W4-01 | Model manpower requisitions, requested positions, replacement links, qualification/experience, salary range, reason, and attachments. | recruitment schema/module | Required fields and headcount/budget references validate; changes after submission require return or amendment. |
| W4-02 | Configure department, HR, budget/management approval and create approved vacancies atomically. | workflow templates, requisition service/tests | Vacancy quantity cannot exceed approved requisition balance. |
| W4-03 | Implement job openings, publishing state, source channels, agencies, referrals, and closing controls. | recruitment module/web | Only approved vacancy capacity can be opened; close/cancel preserves applicant history. |
| W4-04 | Model candidates separately from applications, with duplicate detection, consent/retention, documents, and source attribution. | candidate schema/services | One person may have multiple applications without duplicate personal records; restricted candidate data is scoped. |
| W4-05 | Implement screening, shortlist, rejection/withdrawal reasons, and cumulative recruitment pipeline. | application domain/API/web | Status transitions are legal and funnel counts never increase downstream. |
| W4-06 | Implement interview panels, scheduling, independent evaluations, tests/assessments, recommendations, and conflicts of interest. | interview schema/module | Required panel evidence exists before selection; evaluators cannot see prohibited peer scoring until submission. |
| W4-07 | Implement selection decision and offer approval with salary-band and vacancy controls. | offer schema/services/workflow | Offer cannot exceed approved limits without configured exception approval. |
| W4-08 | Generate versioned offer/contract documents and record candidate acceptance, rejection, expiry, or withdrawal. | document templates/jobs/routes/web | Generated document checksum/version is retained; acceptance does not rewrite the issued offer. |
| W4-09 | Convert an accepted offer into employee, employment, initial assignment, salary proposal, and onboarding instance in one idempotent transaction. | hire application service/integration tests | Retry creates no duplicate employee; candidate/recruitment history remains linked. |
| W4-10 | Implement onboarding templates and company/role-specific checklist instances for HR, department, IT, assets, access, attendance, and orientation. | onboarding schema/module | Dependencies, owners, due dates, evidence, waiver approvals, and completion metrics work. |
| W4-11 | Implement probation schedule, reminders, employee/manager evidence, HR review, and confirm/extend/end decisions. | probation schema/module/jobs | Extension has new end/review dates and approval; confirmation creates status event; failed probation routes to separation. |
| W4-12 | Convert all seven recruitment and two lifecycle screens to production APIs and add employee/manager views. | recruitment/onboarding web features | No fixture/generic path remains; accessibility and role E2E pass. |
| W4-13 | Rehearse candidate/employee opening migration and sign requisition-to-confirmation UAT. | migration mappings, `docs/evidence/W4-*` | Full journey and reconciliation are signed. |

## 10. Wave 5 — Time, Attendance, Overtime, and Leave

Goal: produce locked, auditable payroll time inputs.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W5-01 | Model work calendars, holidays, shifts, breaks, grace, cross-midnight rules, rotations, and effective-dated assignments. | time schema/domain/module | Specific/effective assignment precedence and cross-midnight tests match prototype invariants. |
| W5-02 | Create immutable raw punch schema, canonical direction/timezone rules, source adapters, and deduplication keys. | attendance schema/contracts/services | Replayed files/device events do not duplicate punches; source evidence is retained. |
| W5-03 | Implement manual/file import with quarantine, mapping, validation, row exceptions, control totals, and downloadable results. | import jobs/API/web | 100,000-row target is measured; partial valid rows follow approved all-or-nothing/batch policy. |
| W5-04 | Implement the vendor-neutral device adapter contract and certify the first provided sample adapter. | adapter package and contract tests | Adapter passes recorded fixtures for identity mapping, timezone, ordering, duplicate, and outage recovery. |
| W5-05 | Port attendance processing into the domain package: holiday/off-day/leave precedence, missing punch, late, early, half day, absence, official duty, and overtime candidates. | `packages/domain/src/attendance/*` | Golden and property tests cover every day exactly once and reproduce approved prototype behavior. |
| W5-06 | Persist processing runs and daily attendance results with input/rule fingerprints and reproducible explanations. | attendance repositories/jobs/routes | Same inputs produce same result; changed rules create a new version rather than mutate finalized history. |
| W5-07 | Implement exception workbench and approved correction transactions. | correction schema/module/web | Raw punches never change; before/after daily result and approver evidence are visible. |
| W5-08 | Implement overtime requests/approvals, minimums, caps, rates/hours output, and compensation-mode controls. | overtime schema/domain/module | Unapproved/capped overtime cannot reach payroll; money remains owned by Payroll. |
| W5-09 | Implement attendance-period processing, review, lock/reopen workflow, summaries, and immutable payroll-input snapshot. | period module/jobs/web | Payroll rejects unlocked periods; reopen is privileged, reasoned, approved, and audited. |
| W5-10 | Model leave types, policy versions, eligibility, units, accrual, carry-forward, expiry, negative balance, attachments, and approval rules. | leave schema/domain/module | Policy activation is versioned; historical accrual does not recalculate from current policy. |
| W5-11 | Implement leave ledger for opening, accrual, adjustment, reservation, usage, reversal, expiry, encashment, and settlement. | leave ledger services/repositories | Ledger reconciles to displayed balance; concurrent approvals cannot overspend balance. |
| W5-12 | Implement leave request validation, overlap/calendar rules, manager/HR approval, cancellation, return, and delegation. | leave application services/routes/workflow | Approved leave updates attendance through an event/idempotent consumer; rejection changes neither balance nor attendance. |
| W5-13 | Implement leave opening-balance import and reconciliation. | migration jobs/templates | Employee/type/company totals and ledger openings reconcile to signed source totals. |
| W5-14 | Convert all attendance, overtime, leave, approval, balance, and payroll-input screens to production APIs. | `apps/web/src/features/attendance/*`, `apps/web/src/features/leave/*` | All 14 catalogue pages use real data and cover responsive/accessibility states. |
| W5-15 | Execute volume, concurrency, device/file recovery, period lock, and business UAT. | performance/security/E2E suites, `docs/evidence/W5-*` | Locked attendance and approved leave reconcile into payroll inputs for all test employees. |

## 11. Wave 6 — Performance, Learning, Movements, and Compensation Change

Goal: govern employee development and effective-dated changes.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W6-01 | Implement performance-cycle setup, populations, templates, rating scales, service eligibility, and schedule. | performance schema/domain/module | Cycle activation freezes configuration; ineligible employees are explained. |
| W6-02 | Implement goal/KPI definition, weights, approval, amendments, evidence, and progress. | goals module/web | Approved goal weights satisfy policy; post-approval amendments retain prior versions. |
| W6-03 | Implement self/manager assessment, computed score, calibration independence, HR review, appeal, completion, and audit. | review module/workflow/web | Stored ratings reconcile to assessments; calibration never overwrites source evaluations. |
| W6-04 | Implement improvement/development plans and controlled outcome recommendations. | outcome module | Bonus, promotion, and salary outcomes create proposals only; they never move money or assignment directly. |
| W6-05 | Implement training programs, requests, approvals, sessions, capacity, participants, attendance, completion, certificates, expiry, and evaluations. | learning schema/domain/module/web | Completion requires attendance/assessment evidence; mandatory-training gaps are queryable. |
| W6-06 | Convert eight Performance/Learning screens and sign UAT. | performance/learning web features, evidence | Prototype calculations and workflows have production equivalents with no fixtures. |
| W6-07 | Implement unified employee-movement proposal supporting transfer, promotion, demotion, manager/location/type/category changes, and multi-field effective changes. | movement schema/domain/module | One approved transaction produces one coherent new assignment; history is continuous and non-overlapping. |
| W6-08 | Implement promotion-specific responsibility, position, grade/designation, and linked salary-revision controls. | movement/compensation services | Promotion may complete without salary change or link exactly one approved compensation change. |
| W6-09 | Implement salary-revision proposal with previous/new structure or overrides, reason, effective date, band exceptions, and approval. | compensation schema/module | Pending revisions do not affect payroll; approval produces a new non-overlapping salary assignment. |
| W6-10 | Convert movement screen, rehearse history/compensation migration, and sign movement UAT. | movement web, migration/evidence | Before/after assignment and salary timelines reconcile and are permission-correct. |

## 12. Wave 7 — Payroll configuration, Pakistan statutory rules, Benefits and Loans

Goal: create reviewed, versioned payroll inputs and rules before calculating a run.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W7-01 | Model pay components, classifications, taxable/contributory flags, GL mapping, rounding, display order, and lifecycle. | payroll schema/module | Referenced components cannot be deleted; financial mappings validate before activation. |
| W7-02 | Port the restricted formula parser to the domain package with grammar limits, allowed functions, dependency graph, and cycle prevention. | `packages/domain/src/payroll/formula/*` | Existing injection/undefined-variable/division/precedence tests pass; no dynamic code execution exists. |
| W7-03 | Implement salary structures, versioned items, employee salary assignments, overrides, currency, pay cycle, and effective dating. | compensation/payroll schema/services/web | Salary periods do not overlap; approved revisions only affect dates on/after effective date. |
| W7-04 | Model payroll calendars, cutoffs, working-day method, proration, unpaid-day method, rounding, negative-net policy, and company policy versioning. | payroll policy module | One configured method applies each deduction/proration exactly once. |
| W7-05 | Implement statutory rule-pack schema, source references, authority, jurisdiction/province, version, effective range, maker-checker activation, and test vectors. | statutory schema/module/web | No rule pack activates without source and signed legal/payroll approval. |
| W7-06 | Implement FBR salary-tax annualization, average-rate withholding, prior deductions, adjustments, taxable benefits, exemptions/credits supported by approved evidence, and tax-year reconciliation. | Pakistan tax domain package | Reviewed golden cases cover July-June joins/exits, revisions, bonus, arrears, benefits, and prior tax. |
| W7-07 | Implement EOBI eligibility, wage base/cap, employer/employee shares, registration data, contribution schedule, and reporting snapshot. | EOBI rule package | Values come only from active rule versions; official-source test vectors reconcile. |
| W7-08 | Implement provincial social-security framework and first approved province rule packs used by the customer's companies/locations. | provincial rule packages | Company/location applicability, wage limits, employer/employee treatment, and reports reconcile. |
| W7-09 | Implement recurring and one-time payroll inputs: bonus, arrears, allowance, deduction, recovery, reimbursement, and manual tax adjustment. | payroll input schema/module | Approval/evidence/period rules block unauthorized or duplicate inputs. |
| W7-10 | Implement statutory and payroll configuration screens, activation timeline, diff, approval, and audit. | payroll configuration web features | Payroll administrators can explain exactly which version applies to a date/employee. |
| W7-11 | Create and independently review the payroll golden dataset and expected results. | `tests/fixtures/payroll/pakistan/*`, `docs/evidence/W7-golden-review.md` | HR/payroll/legal reviewers sign expected outputs before engine acceptance. |
| W7-12 | Model benefits plans, eligibility, enrollment, employer/employee amounts, taxable/contributory treatment, and lifecycle events. | benefits schema/module | Payroll receives only approved effective enrollments and explicit component mappings. |
| W7-13 | Model loans/advances, approval, disbursement reference, schedules, moratorium, early settlement, write-off, and payroll recovery. | loans schema/domain/module | Schedule totals equal principal plus approved charges; no deduction occurs before approval/disbursement. |
| W7-14 | Convert payroll setup, salary structures/revisions, benefits, loans, and statutory screens; migrate opening assignments/loans. | payroll/benefits/loans web and migration | Generic fallback paths are removed; balances and assignments reconcile. |

## 13. Wave 8 — Payroll calculation, review, approval, close, and payslips

Goal: calculate deterministic, auditable and immutable payroll.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W8-01 | Model payroll period and forward-only state machine: Open, Processing, Calculated, Under Review, Approved, Posted/Acknowledged, Paid, Closed. | payroll run schema/domain | Forbidden backward transitions fail; controlled reset before approval records reason and invalidates superseded calculation. |
| W8-02 | Build approved-input resolver for employment/assignment, salary, locked attendance, leave, overtime, benefits, loans, statutory versions, and adjustments. | payroll input service | Resolver returns a dated immutable input snapshot and rejects missing/unapproved/ambiguous inputs. |
| W8-03 | Implement payroll job orchestration, partitioning, progress, cancellation before commit, retry, and per-employee isolation. | worker payroll jobs/API/web | Retry with the same key produces one run; worker crash resumes safely; concurrent run for same company/period is blocked. |
| W8-04 | Implement gross-to-net calculation and persisted result/item/warning/explanation model using integer money. | payroll domain/repositories | Golden data and arithmetic/property tests pass; no JavaScript floating-point money calculation exists. |
| W8-05 | Implement exception workbench for missing inputs, negative net, threshold variance, invalid bank/tax data, and statutory warnings. | payroll review module/web | Approval is blocked by configured critical exceptions; waivers require permission, reason, evidence, and audit. |
| W8-06 | Implement employee/department/company totals, previous-period variance, explanation, and reviewer sign-off. | payroll query services/web | Aggregates reconcile exactly to result rows and journal inputs. |
| W8-07 | Implement approval freeze, input/result hashes, immutable snapshots, cancellation/reversal policy, and close. | payroll approval service/workflow | Changes after approval cannot alter the snapshot; reversal is a new controlled transaction. |
| W8-08 | Generate private, versioned payslips with release/withhold rules and employee access audit. | payslip template/job/document module | Payslip totals equal frozen result; unreleased/restricted payslips cannot be accessed. |
| W8-09 | Convert Payroll Inputs, Runs, Review/Approval, and Payslip screens to production APIs. | `apps/web/src/features/payroll/*` | No fixture/generic path remains; long jobs show progress/error/retry safely. |
| W8-10 | Execute 5,000-employee performance, concurrency, deterministic-rerun, worker recovery, and closed-run immutability tests. | performance/integration suites | Payroll meets the approved 15-minute target on the documented reference environment. |
| W8-11 | Complete payroll calculation UAT before enabling payments. | `docs/evidence/W8-*` | HR/payroll owners sign totals, exceptions, audit, snapshot, and payslip behavior. |

## 14. Wave 9 — Payment, Bank Handoff, and Finance Accounting Events

Goal: pay approved payroll and hand balanced accounting evidence to Finance.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W9-01 | Define bank-adapter contract for header/detail/trailer, account mapping, date/amount/reference, control totals, encoding, filename, and validation. | `packages/contracts/src/banking/*`, adapter test kit | Contract supports deterministic generation and parse/confirmation fixtures. |
| W9-02 | Implement and certify the first owner-provided bank format. | `packages/domain/src/banking/adapters/primary-bank.ts`, fixtures/evidence | Generated file matches bank specification byte-for-byte and passes bank/user acceptance. |
| W9-03 | Implement payment batch creation from approved payroll with maker-checker and employee bank-data validation. | payment schema/module/workflow | Batch total equals included net pay; excluded employees remain exceptions, not silently dropped. |
| W9-04 | Implement encrypted/restricted export, checksum, expiry, download audit, cancellation, and regeneration rules. | payment export job/document module | Only release approver can download; regeneration creates a new version and invalidates prior release according to policy. |
| W9-05 | Implement confirmation import, payment references, rejection/return handling, partial settlement, and reconciliation. | payment confirmation module/web | Paid state requires references/control reconciliation or an approved exception. |
| W9-06 | Model payroll accounting mappings by component, company, cost centre, department, and other approved dimensions. | accounting mapping schema/module | Every active component resolves exactly one valid debit/credit treatment before payroll approval. |
| W9-07 | Generate balanced accounting events from frozen payroll and final-settlement results. | accounting event domain/outbox | Debits equal credits in integer money; event totals reconcile to payroll; unmapped dimensions block emission. |
| W9-08 | Implement Finance outbox delivery, acknowledgement, rejection, retry, idempotency, and posted-journal reference. | integration worker/API/web | Duplicate delivery creates one Finance event; Payroll cannot edit or reverse a posted Finance journal directly. |
| W9-09 | Convert Payment Batch and Payroll Journal screens and complete bank/Finance UAT. | payroll payment/accounting web, `docs/evidence/W9-*` | Approved payroll → bank file → confirmation → accounting acknowledgement reconciles end to end. |

## 15. Wave 10 — Separation, Clearance, Final Settlement, and Closure

Goal: close employment without losing obligations or history.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W10-01 | Model resignation, termination, retirement, and contract-completion cases with reasons, initiated/effective dates, documents, and confidentiality. | separation schema/module | Each case follows its legal transition and permission path; arbitrary employee status edits remain impossible. |
| W10-02 | Implement notice-period calculation, waiver/recovery, garden leave where configured, last-working-day changes, and approvals. | separation domain/workflow | Date and recovery changes retain versions and update downstream tasks idempotently. |
| W10-03 | Implement manager/HR/management reviews and termination-specific restricted evidence. | separation workflow/web | Sensitive termination evidence is hidden from unauthorized roles and exports. |
| W10-04 | Implement configurable clearance templates and department, IT, assets/store, Finance, and HR clearance items with evidence and remarks. | clearance schema/module/web | Required clearance blocks settlement approval; waived items require authorized reason. |
| W10-05 | Resolve final attendance, unpaid leave, overtime, salary, bonus, leave settlement, loan/advance recovery, benefits, tax, notice, and authorized adjustments. | settlement input service | Inputs are dated, approved, source-linked, and snapshotted. |
| W10-06 | Implement final-settlement calculation, review, approval, payslip/statement, payment batch integration, and accounting event. | settlement domain/jobs/web | Settlement arithmetic and journal balance; payment cannot exceed approved frozen result. |
| W10-07 | Implement exit interview, asset/access termination tasks, retention/hold rules, final status event, and employee closure. | offboarding module/jobs | Employee becomes inactive/closed only after configured mandatory controls; history remains searchable. |
| W10-08 | Convert all eight lifecycle separation screens and rehearse historical leaver migration. | separation web/migration | No fixtures remain; leaver status, balances, clearances, settlements, documents, and references reconcile. |
| W10-09 | Sign resignation and termination UAT scenarios. | `docs/evidence/W10-*` | Both journeys pass authorization, audit, reversal, failure, payment, Finance, and closure tests. |

## 16. Wave 11 — Self-service, Reporting, Migration, Hardening, and Go-live

Goal: complete user experience and prove production readiness.

| ID | Task | Target files/artifacts | Acceptance and verification |
|---|---|---|---|
| W11-01 | Build Employee Self-service for profile-change requests, documents, leave, attendance, approvals/status, goals/training, loans, payslips, and separation requests. | `apps/web/src/features/ess/*`, scoped APIs | Employee can access only self-authorized data; sensitive edits route through transactions/approval. |
| W11-02 | Build Manager Self-service for reporting-line employees, pending approvals, attendance/leave exceptions, goals/reviews, training, probation, movements, and onboarding tasks. | `apps/web/src/features/mss/*` | Manager scope follows effective reporting hierarchy and cannot cross company/branch policy. |
| W11-03 | Implement HR and Finance/Payroll dashboards from database queries with as-of dates, company scopes, and drill-to-source. | reporting query module/web | Metrics reconcile to authoritative transactions and disclose freshness/source state. |
| W11-04 | Implement the 45 approved reports with shared filters, pagination, sensitivity, permissions, and source drill. | report registry/query services/web | Every report has owner, source query, sensitivity, permission, test totals, and empty/error behavior. |
| W11-05 | Implement background PDF/Excel/CSV exports, row/size limits, encryption where required, expiry, watermark, and audit receipt. | export jobs/storage/web | Export respects the same row/field scopes as interactive view and cannot bypass masked fields. |
| W11-06 | Complete compliance configuration, report audit log, secure export centre, retention/legal hold, and evidence packs. | compliance/reporting web/API | Compliance reviewer can trace active rules, payroll results, reports, exports, and approvals to sources. |
| W11-07 | Execute full migration rehearsals for organization, employees, history, documents, balances, compensation, loans, attendance openings, and leavers. | migration jobs/mappings/reports | At least two full dry runs are deterministic; all signed control totals and exceptions reconcile. |
| W11-08 | Run at least two production-like parallel payroll periods against the incumbent/source results. | payroll comparison tooling/evidence | Employee-level gross, tax, deductions, contributions, net, payment, and journals reconcile or have signed explanations. |
| W11-09 | Execute penetration/security review, dependency/container scans, company-scope tests, privacy review, and access recertification. | security suites/evidence | No unresolved critical/high finding or known cross-company path remains. |
| W11-10 | Execute accessibility/manual assistive-technology review and responsive browser matrix. | accessibility evidence | Critical HR, manager, employee, payroll, and admin journeys meet WCAG 2.1 AA acceptance. |
| W11-11 | Execute full performance/soak tests for 5,000 employees, 100,000 attendance rows, report exports, concurrent approvals, and payroll workers. | performance suites/results | Approved latency/runtime targets pass on a documented reference environment without data inconsistency. |
| W11-12 | Implement production deployment, secrets, monitoring, alerting, backup/PITR, restore, DR, rollback, and support runbooks. | deployment config, `docs/runbooks/*` | RPO/RTO drill, restore, queue recovery, outbox replay, migration rollback decision, and alert routing are demonstrated. |
| W11-13 | Execute source freeze, final delta migration, reconciliation, feature enablement, cutover, hypercare, and formal acceptance. | cutover checklist/evidence | Business, security, operations, Payroll, Finance, and product owners sign go-live; rollback criteria remain available through the stabilization window. |

## 17. Cross-wave schema and migration rules

1. Each migration is forward-safe, transactional where PostgreSQL permits, and
   tested from an empty database and the prior released version.
2. Destructive changes use expand/migrate/contract across separate releases.
3. New non-null columns on populated tables use staged backfill and validation.
4. Large indexes are created with production-safe locking strategy.
5. Effective-dated exclusions, uniqueness, foreign keys, checks, and money
   invariants live in PostgreSQL as well as application validation.
6. Migration/import jobs never disable audit or write domain tables with
   unrestricted ad-hoc SQL.
7. Every data migration has source fingerprint, execution ID, row outcomes,
   control totals, reconciliation, and rollback/compensation instructions.

## 18. Cross-wave security test matrix

Every API and screen must test the applicable combinations:

- unauthenticated, expired session, MFA pending, and revoked session;
- allowed role, wrong role, denied field, and segregation-of-duty conflict;
- same company, wrong company, allowed branch, wrong branch, self, direct
  report, indirect/non-report employee;
- draft, submitted, approved, rejected, returned, cancelled, closed, and
  reversed records;
- direct-object-reference attempts using valid IDs outside scope;
- list, detail, search, export, document download, report, and audit access;
- concurrent update, stale version, duplicate idempotency key, and retry after
  timeout;
- sensitive-value redaction in logs, errors, metrics, traces, and job payloads.

## 19. Wave evidence pack

Each wave closes with one versioned evidence file under `docs/evidence/` that
contains:

- included task IDs and commit references;
- schema migrations and rollback/forward-fix notes;
- API and screen parity mapping;
- exact verification commands and results;
- security/permission matrix results;
- accessibility and performance results where applicable;
- migration counts, control totals, and exceptions;
- screenshots or recordings of required UAT journeys;
- known limitations and accepted risks;
- named business and technical signatories.

## 20. Development start gate

Development may begin with Wave 0 only after the owner approves this plan.
Later waves remain gated by their stated dependencies and evidence. Approval of
this plan does not authorize production deployment, real employee data import,
bank-file release, Finance posting, or statutory rule activation; those require
their own wave-specific approvals.
