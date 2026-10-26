# Nexora ERP Requirements Traceability Matrix

**Snapshot:** 22 October 2026  
**Status rule:** A design or prototype is not implementation evidence. Current TypeScript code, active contracts, migrations, tests, and production-connected UI take precedence over historical documents.

## Status legend

- **Implemented and verified:** Current end-to-end evidence exists for the stated boundary.
- **Partially implemented:** A usable subset exists; the full business outcome does not.
- **Documented but not found in implementation:** Requirement exists in design/history but not current API composition.
- **Implemented but not documented:** Current code exists without adequate consolidated product documentation.
- **Planned:** Approved or proposed future capability without current implementation evidence.
- **Unverified:** Evidence exists but was not independently confirmed in the current environment.
- **Blocked:** Depends on an unresolved business, architecture, environment, or release decision.

## Functional requirements

| ID | Requirement and justification | Module | Priority | Source / implementation evidence | Status | Acceptance criteria | Dependency or open question |
|---|---|---|---|---|---|---|---|
| FR-001 | Authenticate a user with tenant-aware credentials without enumerating accounts | Auth | Critical | `server/api/src/modules/auth/tenant-router.ts`; auth unit/integration tests | Implemented and verified | Invalid login is generic and throttled; valid login resolves authorized tenant account | Production IdP decision remains |
| FR-002 | Prompt for organization when one identifier maps to multiple tenants | Auth | High | Tenant-selection service/router and Redis store | Implemented and verified | Short-lived ticket; only listed tenant can be selected; replay/expiry denied | Directory ownership and UAT |
| FR-003 | Force initial password change where policy requires it | Auth | High | Password-change ticket flow and security migration 0009 | Implemented and verified | Old ticket expires; new password meets active policy; session issued after success | Enterprise reset/recovery policy |
| FR-004 | Maintain an opaque, tenant-bound, revocable server session | Auth | Critical | Redis session store, session policy, cookie tests | Implemented and verified | Idle/absolute expiry, rotation, logout, logout-all and version invalidation work | HA Redis and central revocation operations |
| FR-005 | Protect mutations with CSRF, trusted origin and authenticated session | Platform | Critical | Auth/security/HR/Banking/Finance routers; security tests | Implemented and verified for live APIs | Invalid CSRF/origin is rejected before repository mutation | Apply to every future router |
| FR-006 | Enforce exact permission, tenant, company and record scope server-side | Security | Critical | `packages/auth`; security repositories; RLS migrations/tests | Implemented and verified for live APIs | Cross-boundary requests fail without target disclosure | Complete permission matrix per new module |
| FR-007 | Govern user creation/change/archive and company access | Identity | Critical | Security router/repository; user UI; integration tests | Implemented and verified | Maker/checker, version, idempotency, audit and session invalidation | Final browser sign-off |
| FR-008 | Govern role policies and assignments | Identity | Critical | Role, permission, assignment and approval routes | Implemented and verified | Exact grants, effective dates, SoD, last-admin protection, lifecycle evidence | Business role catalogue approval |
| FR-009 | Run access-review campaigns and remediation | Identity | High | Security migration 0010; API/UI/tests | Implemented and verified | Snapshot entitlements; retain/revoke/remediate decisions; closure gated | Review frequency and owner |
| FR-010 | Support bounded, revocable delegation | Identity | High | Security migration 0011; delegation API/UI/tests | Implemented and verified | No self-delegation; ceiling and source authority rechecked; expiry/revocation immediate | Delegation business policy |
| FR-011 | Support governed impersonation with visible real actor | Identity | High | Security migration 0012; session/router/UI/tests | Implemented and verified | One emergency principal; mutations restricted; end action clears context | Production emergency procedure |
| FR-012 | Maintain versioned session policy and enforce it at runtime | Identity | High | Security migration 0013; policy API/UI/tests | Implemented and verified | Bounds validated; independent approval; activation invalidates sessions | Policy values require owner sign-off |
| FR-013 | Record append-retained security audit evidence | Security | Critical | Security repository/migrations and audit endpoints | Implemented and verified | Actor, action, entity, time and lifecycle are queryable; normal updates/deletes denied | Archive/SIEM and retention |
| FR-014 | Maintain employee drafts with governed approval | HR | High | HR router, employee service/repository, HR migrations 0023–0024 | Implemented and verified | Draft validates company/master scope; submission and decision are idempotent and audited | Manual UAT and fallback retirement |
| FR-015 | Create governed hire requests and effective assignments | HR | High | HR migrations 0026–0027; lifecycle API/UI/tests | Implemented and verified | Approved hire creates valid effective relationship/assignment without history overwrite | Distinct maker/checker UAT |
| FR-016 | Govern transfer, promotion, manager, location and organization-placement changes | HR | High | HR migrations 0028–0032; movement APIs/UI/tests | Implemented and verified for current boundary | Scope, hierarchy, dates, version, approval and history enforced | Pay-changing promotion boundary |
| FR-017 | Provide bounded employee status, lifecycle and profile history | HR | High | HR migration 0033; history endpoints/workspace/tests | Implemented and verified | Opaque pagination; restricted non-sensitive projection; append versions | Cross-workflow audit view remains |
| FR-018 | Maintain HR contacts, emergency contacts and document metadata securely | HR | Medium | HR router/repository and connected workspaces | Partially implemented | Permissioned reads/writes; no private-field leakage | Document upload/storage workflow absent |
| FR-019 | Maintain employment-lifecycle policies through approval and activation | HR | High | Lifecycle policy API/UI/migrations/tests | Implemented and verified | Draft, submit, independent approval and activation preserve versions | Business policy catalogue |
| FR-020 | Implement attendance, leave, overtime and period locking | HR | High | HR plans and historical migrations; no current router methods | Documented but not found in current implementation | Governed inputs, corrections, approvals, balances and locks reconcile | HR Phase 4 approval |
| FR-021 | Implement deterministic payroll, statutory snapshots, payslips and payment handoff | HR/Payroll | Critical if launch scope | HR designs/migrations; no current payroll API composition | Documented but not found in current implementation | Golden calculations, approval/lock, corrections, audit and Finance/Banking handoff | Jurisdiction and statutory owner |
| FR-022 | Maintain governed Bank accounts mapped to Finance | Banking | Critical | Banking account router/repository; Finance 0002–0003; UI/tests | Implemented and verified | Same tenant/company; valid currency/CoA; maker-checker; status history | Operator business setup |
| FR-023 | Create/update/submit/approve/post/reverse Bank Payments | Banking | Critical | Banking router, payment repository, posting service, tests/E2E | Implemented and verified | Approval distinct from post; open period; balanced journal; linked reversal; idempotent | External bank release excluded |
| FR-024 | Create/update/submit/approve/post/reverse Bank Receipts | Banking | Critical | Banking router, receipt repository, posting service, tests/E2E | Implemented and verified | Debit Bank/credit nominal; same controls as Payment | Allocation/reconciliation excluded |
| FR-025 | Reassign Bank approvers with evidence | Banking | High | Finance 0022–0023; workflow context API/UI/tests | Implemented and verified | Authorized administrator; version; reason; immutable assignment history | Operating ownership |
| FR-026 | Grant/revoke scoped Bank self-approval | Banking/Security | High | Security 0016; API/UI/tests | Implemented and verified | Company/kind scope; explicit grant; revocation blocks future use; history preserved | Decide whether enabled in production |
| FR-027 | Maintain company-scoped project and location/city references | Master Data | Medium | Master-data migrations/router/UI/tests | Implemented and verified | Search/pagination; create/update/status; version and audit | Master ownership and additional kinds |
| FR-028 | Maintain governed company nominals and chart hierarchy | Finance | Critical | Finance router/repositories; migrations 0009–0012, 0024; UI/tests | Implemented and verified for master-data boundary | Protected/header accounts cannot be used as ordinary offsets; lifecycle audited | Finance classification ownership |
| FR-029 | Maintain tenant chart templates and controlled company adoption | Finance | High | Finance migrations 0013–0018; template router/UI/tests | Implemented and verified foundation | Deterministic preview; explicit mappings; no automatic business approval | Catalog validation and company decisions |
| FR-030 | Maintain fiscal calendars and period transitions | Finance | Critical | Platform 0009, Finance 0025; current API/UI/tests | Implemented and verified for regular 12-month years | No overlap; explicit generation; close/reopen/lock permissions; event history | Nonstandard calendar requirements |
| FR-031 | Post balanced accounting entries from approved source events | Finance | Critical | Finance posting service; Banking integration tests | Partially implemented | Debits equal credits; period/account/currency validations; source linkage | General journal/source-module coverage |
| FR-032 | Provide general journals, GL, trial balance and statements | Finance | Critical | Prototype and historical designs; current general API not composed | Partially implemented | Governed lifecycle and source-to-report reconciliation | Accounting policy and API implementation |
| FR-033 | Implement Bank transfers | Banking | High | Finance 0026, Security 0017 and Platform 0010; versioned contracts/API; live list/entry/detail; disposable-database lifecycle and security tests | Implemented and verified in repository | Atomic same-company source/destination effect; governed FX/charge policy; assigned approval; explicit post; linked reversal | Target migration, role assignment, tenant setup and credentialed UAT |
| FR-034 | Import statements, match and close reconciliations | Banking | High | Mature prototype UI/data only | Planned | Idempotent file import; evidence; bounded matching; zero/approved difference | Bank format and tolerance policy |
| FR-035 | Implement customer/order/invoice/AR flow | Sales/AR | High if launch scope | Blueprint and prototype only | Planned | Customer, fulfilment, billing, posting, allocation and reconciliation complete | Credit/pricing/tax/recognition decisions |
| FR-036 | Implement supplier/procurement/AP flow | Procurement/AP | High if launch scope | Blueprint and prototype only in current TS runtime | Planned | Requisition/PO/receipt/match/bill/payment/reconciliation complete | Supplier KYC/tolerance/withholding decisions |
| FR-037 | Implement inventory movement, traceability and valuation | Inventory | High for trading/manufacturing | Blueprint/prototype only in current TS runtime | Planned | Immutable on-hand, batch/serial, cost layers and GL reconciliation | Valuation/negative-stock/WMS decisions |
| FR-038 | Provide live permission-aware reports and dashboards | Reporting | High | Prototype catalogue/drill engine; selected live registers | Partially implemented | Source reconciliation, freshness, company/currency context and export policy | Live source modules/read models |
| FR-039 | Keep mock actions clearly non-durable | Product UX | Critical | README/inventory labels and prototype state messaging | Partially implemented | No user can mistake simulated success for a durable transaction | Single status manifest |
| FR-040 | Process durable asynchronous business jobs | Worker | Medium | BullMQ/PostgreSQL sample job only | Partially implemented | Business job has status, retry, dead-letter, idempotency, trace and operator recovery | First approved async use case |
| FR-041 | Store and serve private business documents | Documents | High | S3 service and private bucket foundation | Partially implemented | Metadata authorization, scanning, retention and signed access | Document-module design |

## Business rules

| ID | Rule | Priority | Evidence | Status | Acceptance criteria / open question |
|---|---|---|---|---|---|
| BR-001 | UI visibility never grants server permission | Critical | Architecture agreement and live routers | Implemented for live APIs | Direct API attempt is denied without exact authority |
| BR-002 | Every business query/mutation is tenant and permitted-company scoped | Critical | AGENTS.md, session contexts, RLS | Implemented for live APIs | Cross-tenant/company tests pass |
| BR-003 | Maker cannot approve governed work unless an explicit audited exception applies | Critical | Security/HR/Banking rules | Implemented for selected workflows | Ordinary self-decision denied; exceptional reason/evidence required |
| BR-004 | Approval and financial posting are separate actions | Critical | Banking service/router | Implemented | Approved record has no journal until authorized post |
| BR-005 | Closed or missing fiscal periods block posting | Critical | Finance posting/calendar implementation | Implemented | No bypass via UI or alternate endpoint |
| BR-006 | Posted financial history is corrected by linked reversal, not deletion | Critical | Posting service/migrations/tests | Implemented for Banking | Original and reversal remain traceable and economically cancel |
| BR-007 | Replayed mutation returns the original business result without duplicate effect | Critical | Idempotency framework/repositories | Implemented for live commands | Same key/payload is safe; conflicting replay is denied |
| BR-008 | Stale versions are rejected | High | If-Match and expected-version checks | Implemented for selected modules | Concurrent update receives 412/domain conflict |
| BR-009 | Imported chart definitions are not automatically active/postable | Critical | Chart adoption design/implementation | Implemented | Classification and approval are explicit and audited |
| BR-010 | Bank offsets exclude headers, inactive and protected control accounts | Critical | Nominal directory implementation/tests | Implemented | Availability metadata explains empty result without exposing unauthorized names |
| BR-011 | Redis is not the source of truth for ERP business records | Critical | Architecture agreement/current composition | Implemented | Sessions/queues/cache only; PostgreSQL owns business state |
| BR-012 | Prototype role/company filters are not authorization controls | Critical | Inventory/README/source | Implemented as design; labeling risk remains | Server scope always derives from authenticated context |

## Non functional requirements

| ID | Requirement | Priority | Evidence | Current status | Acceptance criteria / dependency |
|---|---|---|---|---|---|
| NFR-001 | Version public endpoints under `/api/v1` | Critical | Current API composition | Implemented | No duplicate Next route for existing behavior |
| NFR-002 | Validate all requests with bounded schemas and safe problem responses | Critical | Zod/contracts/error middleware | Implemented for live APIs | Invalid input produces safe 4xx without stack/secret |
| NFR-003 | Use pagination/bounds for list endpoints | High | Current queries generally limit 100 and use cursors | Partially implemented | Every new list has deterministic order, max limit and continuation |
| NFR-004 | Protect sensitive logs and telemetry | Critical | Redaction tests and observability package | Implemented foundation | No body, cookie, credential, DSN or sensitive field in logs/spans |
| NFR-005 | Expose health/readiness and protected metrics | High | `server/api/src/app.ts` | Implemented | Dependency loss returns 503; metrics requires bearer auth |
| NFR-006 | Support graceful API/worker shutdown | High | API server and worker runtime | Implemented | Stop accepting work; close server/queue/Redis/database safely |
| NFR-007 | Maintain generated API-client consistency | High | `api:generate`, `api:check`, contract tests | Implemented | Drift check passes in CI |
| NFR-008 | Maintain clean format/lint/type/build gates | High | CI workflow; latest lint handoff | Blocked | Repository-wide lint and all other gates pass on clean clone |
| NFR-009 | Meet approved performance budgets | High | Narrow performance tests; historical targets | Partially verified | Owner-approved SLOs measured at representative load |
| NFR-010 | Scale API/session/queue safely | High | Redis and bounded architecture | Unverified | Multi-instance and failover tests pass |
| NFR-011 | Prove backup/restore and disaster recovery | Critical | Runbook only | Blocked | Measured restore/failover meets approved RPO/RTO |
| NFR-012 | Provide accessible responsive UI | High | Shared primitives, responsive baselines, a11y tests | Partially verified | Approved WCAG/browser matrix plus manual testing |
| NFR-013 | Preserve maintainable feature boundaries | High | Current repository structure and import tests | Implemented foundation | No client-to-database path; no duplicate API boundary |
| NFR-014 | Apply dependency, secret and container scanning | High | CI workflow | Configured, current run unverified | Clean scan on review commit |
| NFR-015 | Define privacy, retention and compliance | Critical | Partial security docs only | Blocked | Approved classification, retention, deletion/pseudonymization and export rules |

## Traceability summary

The matrix contains 41 functional requirements, 12 business rules, and 15 non-functional requirements. The strongest traceability exists for Identity, selected HR lifecycle, Banking accounts/payments/receipts, Finance master data and fiscal periods. The weakest traceability is in broad prototype-only modules, live reporting, production operations, privacy/retention, and disaster recovery.
