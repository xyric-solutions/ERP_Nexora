# Administration Module — Delivery Plan

Source: Administration Module Review meeting (2026-11-12) plus follow-up decisions
from the product owner. Work through the phases in order. Each phase ends with a
checklist that must pass before starting the next one.

---

## 1. Context

Today the **Administration** menu (`app/shell/config/prototype-data.ts:1169-1201`)
is only a set of generic mock screens. The real user and role management lives in
`app/features/security/` (Identity & Access workspace, API-backed). That workspace
is very detailed: maker-checker requests, access reviews, delegation,
impersonation and session policies.

The goal is one simple Administration module where:

- the **first person to register an organisation becomes its Super Admin**,
- the Super Admin creates employee logins, assigns exactly which modules each
  person can use, and the system emails each person their credentials,
- employees change their password on first login and then see **only** what was
  assigned to them,
- Companies, Locations, Projects and Departments are **one shared set** used by
  Administration, HR and Finance (renamed Accounting),
- the dashboard shows simple user and access counts.

---

## 2. Decisions (locked)

| # | Decision |
|---|---|
| D1 | **Super Admin** has full control. Changes apply immediately, with no second approval. Super Admins can change any user, including themselves and other Super Admins. Every change is audited. |
| D2 | **Module Admin** has limited rights inside the assigned module only. It cannot manage users, roles, permissions or settings, and cannot change its own access. It can approve and maintain approval details (approver name, proof, etc.) for that module. |
| D3 | Only Super Admins can manage access. |
| D4 | Access per module has 3 levels: **View** (read only), **User** (normal work: create/edit/submit), **Admin** (= Module Admin, User + approvals in that module). |
| D5 | **Self-registration creates an organisation.** The registering person becomes Super Admin. Employees **cannot** self-register. They are created by a Super Admin. |
| D6 | New employee: Super Admin enters the email and an initial password (or generates one). The system emails the credentials. First login forces a password change. |
| D7 | Navigation and every API must show/allow **only** assigned modules and features. |
| D8 | The **HR organisation units are the single source** for Company → Location → Project → Department. The Finance Projects/Locations master gets migrated into it and retired. |
| D9 | **No separate date-lock feature.** The existing Finance period close/lock stays as it is. |
| D10 | Rename the module label **Finance → Accounting** (label only, keep id `finance`). |
| D11 | Identity & Access is simplified. Access Review, Delegation & Impersonation, Security/Session Policies, Company-role Assignments, the separate Add User page and the separate User Detail page are removed from the menu. Their backend stays untouched (hidden, not deleted). |

### Safety rules that follow from D1 (built into the plan)

- The system must always keep **at least one active Super Admin** per organisation.
  The server refuses to demote, deactivate or delete the last one.
- A Super Admin removing their own Super Admin role needs an explicit confirmation step.
- Every access change writes an audit entry: who, what, before, after, when.

---

## 3. Target menu

```
Administration
├── Dashboard              user counts, access level per module, pending first logins
├── Tenant Directory       organisation profile (type, name, country, financial period) — editable
├── Organisation
│   ├── Companies          create / edit companies (Super Admin)
│   └── Structure          Locations → Projects → Departments (same records as HR)
└── Users & Access
    ├── Users              list + create user drawer + edit drawer (details, access, password reset, deactivate)
    └── Access Levels      read-only explanation of View / User / Admin per module
Public page:  /register    organisation sign-up (creates org + Super Admin)
Every user:   My account → Change password
```

---

## 4. Existing assets to reuse (do not rebuild)

| Need | Reuse |
|---|---|
| Users, roles, grants, company access, audit | `security_*` tables (`packages/db/source-migrations/security/`), `server/api/src/modules/security/` |
| Login, sessions, forced first-password change | `server/api/src/modules/auth/tenant-router.ts` (`/login`, `/change-initial-password`), `packages/auth/src/password-change.ts` |
| Admin password reset (sets must-change flag) | `reset_password` action in `source-administration-repository.ts:3345` |
| Permission keys `module.resource.action` | `security_permission_definition` (`security/0002`) |
| Org units + parent rules | `organization_unit` table; `/api/v1/hr/organization_units`; `app/features/hr/model/organization-hierarchy.ts` |
| Automatic codes | `app/features/hr/model/hr-master-code.ts` (`nextGeneratedCode`) |
| Fiscal calendar / periods | `server/api/src/modules/master-data/fiscal-calendars/`, `finance-fiscal-periods.tsx` |
| Throttling | `modules/auth/redis-throttle-store.ts` |
| Async jobs | `server/worker` (BullMQ + `job_execution`) |
| UI | `app/components/ui/*`, `app/shared/ui` (`WorkTable`, `WorkForm`, `FilterBar`, `SearchableSelect`), HR sheet pattern `hr-configured-master-sheet-workspace.tsx` + `hr-master-sheet.tsx` |
| Generated client flow | contract → `packages/contracts/src/openapi-c4.ts` → template in `generate-client-c4.ts` → `npm run api:generate` |

---

## 5. Phases

### Phase 0 — Baseline (½ day)

1. Commit/stash your current Sales work so the Administration work starts clean.
2. Pull the latest HR and Finance code (meeting follow-up F2).
3. Run and record the baseline: `npm run typecheck`, `npm run build:web`,
   `npm run test:unit`, `npm run api:check`.
4. Inventory the permission keys that exist today:
   `select permission_key, module from security_permission_definition order by 1;`
   (run against the dev DB). Save the list in `docs/plans/administration-permission-inventory.md`.
5. Map every UI module id in `prototype-data.ts` to its permission prefix
   (`purchases` → `procurement`, etc.). Modules that are still mock have **no**
   server permissions yet. Mark them as such.

**Done when:** baseline is green (or failures are recorded as pre-existing) and both inventories exist.

---

### Phase 1 — Access model in contracts (1 day)

Create `packages/contracts/src/administration/`:

- `module-catalogue.ts`: one list of grantable modules:
  `{ id (UI module id), label, permissionPrefixes[], live: boolean }`.
  It is the single source for the access matrix, the nav filter and the server presets.
- `access-levels.ts`: `accessLevelSchema = z.enum(["none","view","user","admin"])` and the
  rule that turns a level into permission keys:
  - view → `*.read`, `*.list`, `*.export`
  - user → view + `*.create`, `*.update`, `*.submit`, `*.cancel`
  - admin → user + `*.approve`, `*.reject`, approval-detail keys of that module
  - Never included for anyone except Super Admin: `security.*`, `platform.*`,
    `administration.*`
- `users.ts`: `adminUserSchema`, `createAdminUserRequestSchema` (name, email,
  username, initial password or `generate: true`, employee link optional, company
  access, `access: Record<moduleId, AccessLevel>`, `superAdmin: boolean`),
  `updateAdminUserRequestSchema`, `adminUserActionSchema` (`deactivate`,
  `reactivate`, `reset_password`, `mark_resigned`).
- `tenant-profile.ts`: `tenantProfileSchema` (organisation type, name, country,
  financial year start month, base currency optional) and its update schema.
- `registration.ts`: `registerOrganisationRequestSchema` (tenant profile fields +
  admin full name, email, password).
- `dashboard.ts`: `adminDashboardSummarySchema`.
- Unit tests in `tests/unit/administration-contracts.test.ts` for level → key expansion
  and for the rule that `security.*` keys never leak into a non-Super-Admin preset.

**Done when:** `npm run typecheck` and the new unit tests pass.

---

### Phase 2 — Database migrations (1–2 days)

Follow the source-migration rules: one `NNNN_name.forward.sql` per change, next
contiguous number, and each file inserts its own `nexora_schema_migration` row.

1. `security/0021_super_admin_and_access_levels.forward.sql`
   - System role `super_admin` per tenant (flag `is_system_super_admin`) granted
     every permission, including `security.authorization.administer`.
   - Table `security_user_module_access(tenant_id, user_id, module_id, access_level,
     updated_by, updated_at, row_version)` with RLS. This is the readable record of
     what the Super Admin chose. The effective permissions stay in the existing grant
     tables so login and enforcement do not change.
   - DB guard (trigger/function) that blocks removing the last active Super Admin.
   - Permission keys `administration.user.manage`, `administration.tenant.manage`,
     `administration.organisation.manage` (Super Admin only).
   - Backfill: existing users who hold `security.authorization.administer` become Super Admins.
2. `platform/0012_tenant_profile.forward.sql`
   - Add `organisation_type`, `country_code`, `financial_year_start_month` (1–12),
     `registered_at`, `registered_by` to `tenant`.
   - `SECURITY DEFINER` function `platform_register_organisation(...)`, owned by the
     migrator role. It creates the tenant, a company `organization_unit`, the
     first fiscal calendar, the Super Admin user, credentials, the login identifier and
     the role assignment in one transaction. Registration has no tenant yet, so this is
     the only RLS-safe way.
3. `runtime/0002_email_outbox.forward.sql`
   - `email_outbox(id, tenant_id, template, to_address, payload_encrypted, status,
     attempts, last_error, created_at, sent_at)`. Temporary passwords are **never**
     stored in plain text; the payload is encrypted and wiped after sending.
4. Data migration for D8 is **Phase 6**, not here.

**Done when:** `npm run db:migrate:test` applies cleanly on a fresh DB and on a copy
of the current dev DB; `tests/integration/postgres-migrations.test.ts` passes; a new
RLS test in `tests/security/` proves `security_user_module_access` is tenant-isolated.

---

### Phase 3 — API (3–4 days)

New module `server/api/src/modules/administration/` mounted at `/api/v1/admin`,
using the existing router pattern (session load, origin + CSRF + idempotency key +
`If-Match`, problem+json errors). Layering: router → service → repository.

| Endpoint | Who | Notes |
|---|---|---|
| `GET /admin/dashboard` | Super Admin | totals, active/inactive, pending first login, per module counts by level, Super Admin list |
| `GET /admin/tenant` / `PATCH /admin/tenant` | read: any Admin; edit: Super Admin | Changing the financial year start month is **refused** if periods in the current calendar have postings. It applies to the next calendar only. |
| `GET /admin/companies`, `POST`, `PATCH /:id` | Super Admin | creates `organization_unit` type `company`. Lifts the HR "maintained by platform administration" restriction for this path only. |
| `GET /admin/users` (paged, filtered), `GET /admin/users/:id` | Super Admin | includes module access levels |
| `POST /admin/users` | Super Admin | creates user, credentials (`must_change_password = true`), company access, module access → grants. Queues the credential email. Returns the one-time password once, as a fallback. |
| `PATCH /admin/users/:id` | Super Admin | details, company access, module access, Super Admin flag. Last-Super-Admin guard. |
| `POST /admin/users/:id/actions` | Super Admin | `reset_password` (new temp password + email), `deactivate`, `reactivate`, `mark_resigned` (deactivate + end date + reason) |
| `GET /admin/modules` | any Admin | module catalogue + level descriptions |
| `POST /auth/register` | public | throttled per IP + email (Redis throttle store). Calls `platform_register_organisation`. Never reveals whether an email already exists. |
| `POST /auth/change-password` | any signed-in user | current + new password, policy check, bumps `session_version`, audited |

Server rules (must be enforced here, not only in UI):

- All `/admin/*` writes require Super Admin. A Module Admin calling them gets 403.
- Module Admin may call only its module's approve and approval-detail endpoints. That
  works automatically because its grants contain only those keys.
- The direct-apply path writes to `platform_admin_audit_event` /
  `security_audit_event` with before/after.
- Writes go through `security_user_role_assignment_version` so
  `loadAuthenticatedAccount` keeps working. Also update the legacy JSON column so the
  `AUTHORIZATION_PARITY_MISMATCH` check stays green (`auth/source-repository.ts:178`).
- Access changes bump the target user's `session_version` so new rights apply on next request.

Tests:
- `tests/unit/admin-api.test.ts` (supertest with mocked repos): auth, 403s, validation, problem format.
- `tests/integration/administration.test.ts` (real DB):
  - register → login as Super Admin → create user → forced password change →
    session contains only assigned permissions
  - Module Admin cannot call `/admin/*` and cannot change its own access
  - last-Super-Admin guard
  - tenant isolation between two registered organisations
  - audit rows written

**Done when:** unit, integration and `npm run test:security` pass.

---

### Phase 4 — Email delivery (1 day)

- Worker job `send-email` in `server/worker` reads `email_outbox`, sends via SMTP,
  retries with backoff, and marks the row sent/failed.
- Config: `SMTP_HOST/PORT/USER/PASSWORD/FROM` in env (do not commit values).
  Add a **Mailpit** service to `compose.yaml` for local testing.
- Templates: "Your Nexora account" (login URL, email, temporary password, "you
  must change it on first login") and "Password reset".
- If SMTP is not configured, the API still returns the one-time password to the
  Super Admin screen, and the UI says "email not sent, share securely".

**Done when:** creating a user locally shows the email in Mailpit; a failed send is
retried and visible as failed.

---

### Phase 5 — Generated client + frontend (4–5 days)

1. Add paths to `openapi-c4.ts` and the methods to the client template in
   `generate-client-c4.ts`. Run `npm run api:generate`; `npm run api:check` must pass.
2. New feature folder `app/features/administration/`:
   - `api/administration-client.ts`: adapter over `NexoraApiClient`.
   - `views/admin-dashboard.tsx`: stat tiles (`ModuleKpiGrid`) + table of users by
     module/level. No charts and no integration/job metrics.
   - `views/tenant-directory.tsx`: profile card + edit sheet.
   - `views/admin-companies.tsx`: HR sheet pattern; codes via `nextGeneratedCode("CO", …)`.
   - Organisation → Structure: **embed the existing**
     `hr-organization-structure-sheet-workspace.tsx` (same records, same codes LCN/PRJ/DEPT).
     Don't copy it.
   - `views/admin-users.tsx`: `WorkTable` + `FilterBar` (status, level, module).
   - `components/user-sheet.tsx`: create/edit drawer with sections Details →
     Companies → **Access matrix** → Review.
   - `components/access-matrix.tsx`: one row per module from the catalogue, a
     None/View/User/Admin radio per row, a "Super Admin (full access)" switch on top
     that disables the matrix, and mock modules flagged "prototype — UI only".
   - `components/credential-result-dialog.tsx`: shows a one-time password once, with a copy button.
3. Public page `app/register/page.tsx` (reuse `AuthLayout` from `app/login/page.tsx`):
   organisation type, name, country, financial year start month, admin name, email,
   password + confirm. On success it goes to login.
4. "Change password" in the user menu → dialog calling `/auth/change-password`.
5. **Navigation filtering** in `app/shell/prototype-shell.tsx`: show a module/page
   only if the session has a permission matching its catalogue prefix (Super Admin
   sees all). Direct URL to a hidden page shows "You don't have access". The server
   still enforces it; the UI only hides.
6. `prototype-data.ts` changes:
   - Administration groups become the target menu in §3. Mark the pages `live` and
     route them in `prototype-content.tsx`.
   - Remove from the menu: add-user, user-detail, company-role-assignments,
     access-review, delegation, security-policies, entitlements group. Add redirects
     in `retiredPageRedirects`.
   - Remove the separate "Identity & Access" sidebar button
     (`prototype-shell.tsx:925-945`). Keep `app/admin/identity` redirecting to
     `#/administration/users`.
   - `finance` label → "Accounting" (label/shortLabel + hard-coded eyebrow in
     `finance-currencies.tsx:194`). Keep the id.
   - Update `docs/parity/prototype-manifest.json` to match.
7. Tailwind + shadcn only. Run `node scripts/audit-ui-theme.mjs --write` and `--check`.

**Done when:** build passes; e2e `tests/e2e/administration.spec.ts` covers register →
create user → logout → login as user → forced change → sees only assigned modules →
blocked URL shows no-access; checked in light/dark at desktop/tablet/mobile.

---

### Phase 6 — One organisation structure (HR = source) (2 days)

1. Discovery first: find every reference to `erp_project` / `erp_location`
   (FKs, journal `dimensions` values, procurement, banking). Record the list.
2. Migration `master_data/0003_merge_projects_locations_into_org_units`:
   - For each `erp_location` / `erp_project`, match an existing org unit
     (division/branch, same company + code/name) or create one.
   - Store the mapping in `master_data_org_unit_map(old_id, org_unit_id)` for audit
     and rollback.
   - Rewrite references found in step 1 to point at org-unit ids.
   - Mark old rows `migrated` (do not delete).
3. Point Finance "Reporting Projects/Locations" pages at the shared structure view
   (read/write the same org units), then retire `reference-master-workspace.tsx`
   after verification.
4. Payroll/finance dimension `cost_center` is unchanged (HR master already).

**Done when:** a project created in Administration appears in HR and Accounting
pickers, and the reverse; integration test proves the old ids resolve via the map.

---

### Phase 7 — Clean-up, docs, handoff (1 day)

- `rg` check that removed menu entries have no dangling routes. The security panels
  stay in code (backend untouched), unreachable from the menu.
- Update `docs/architecture/remaining-ui-migration.md`, `docs/architecture/identity-access-delivery-plan.md`
  and `docs/platform-administration-api.md` with the new endpoints.
- Full verification: `git diff --check`, `npm run typecheck`, `npm run build:web`,
  `npm run test:unit`, `npm run test:integration`, `npm run test:security`,
  `npm run test:contract`, `npm run test:e2e`, `npm run api:check`, UI theme audit.
- Handoff note listing what changed, what was preserved, what was verified, and what remains.

---

## 6. Order of work and rough effort

| Phase | Effort | Depends on |
|---|---|---|
| 0 Baseline | ½ d | — |
| 1 Contracts | 1 d | 0 |
| 2 Migrations | 1–2 d | 1 |
| 3 API | 3–4 d | 2 |
| 4 Email | 1 d | 2 (parallel with 3) |
| 5 Frontend | 4–5 d | 3 |
| 6 Org merge | 2 d | 0 (can run after 3) |
| 7 Clean-up | 1 d | all |

Roughly **14–17 working days** for one developer.

---

## 7. Assumptions to confirm (non-blocking; defaults used if no answer)

1. **Registration = first login.** Default: the `/register` page creates the
   organisation and its Super Admin in one step.
2. **Email verification at sign-up.** Default: none in this version.
3. **Module Admin "approval information".** Default: Module Admin approves/rejects
   in its own module and maintains approver details (name, proof/attachment).
4. **Resignation.** Default: "Mark resigned" deactivates the login with an end date.
   If HR records an exit, the login is **not** auto-deactivated yet (later
   enhancement).
5. **Bank self-approval panel.** Default: hidden with the other removed panels;
   Super Admin covers it.
6. **Existing users on migration.** Default: holders of
   `security.authorization.administer` become Super Admins; everyone else keeps
   their current permissions and their access levels are shown as "Custom" until a
   Super Admin edits them.
7. **Admin Audit page.** Default: keep a simple "Activity log" under Users & Access
   (read-only list of access changes).

## 8. Progress log

### 2026-11-12 — Phase 0 and Phase 1 complete

**Phase 0**
- Steps 1–2 (commit/stash Sales work, pull HR/Finance) left to the developer: the
  Sales changes are still uncommitted in the working tree.
- Baseline (before Administration changes): `typecheck` pass, `api:check` pass,
  `build:web` pass, `test:unit` 1350/1353 — 3 **pre-existing** failures in
  `tests/unit/finance-currencies-view.test.tsx` (2) and
  `tests/unit/prototype-shell-navigation.test.tsx` (1). Logs: `tmp/admin-baseline/`.
- Permission inventory and UI-module → prefix map:
  `docs/plans/administration-permission-inventory.md` (348 keys, 9 server modules).

**Phase 1**
- `packages/contracts/src/administration/` (`access-levels`, `module-catalogue`,
  `users`, `tenant-profile`, `registration`, `dashboard`), exported from the
  contracts root.
- `tests/unit/administration-contracts.test.ts` (22 tests): every real action is
  classified, unknown actions fail closed, levels are cumulative, no
  `security.*`/`administration.*`/self-approval key leaks into any module preset,
  catalogue matches `prototype-data.ts`, preset ↔ derived level round-trip.
- Verified: `npm run typecheck`, `npm run api:check`, eslint + prettier on new files.

**Decisions taken while implementing (please confirm)**
- Real keys use ~65 actions, not just read/create/approve. The tier table in
  `access-levels.ts` classifies all of them (e.g. `manage` = User; `post`, `reverse`,
  period `close/lock/reopen`, payroll `release/confirm` = Admin; `self_approve`,
  `override` = Super Admin only).
- Business users get a small allow-list of `platform.*.read` reference keys (org units,
  currencies, fiscal calendars/periods, localisation) for pickers, despite the
  "`platform.*` is Super Admin only" rule.
- HR Module Admin also receives `workflow.approval.approve/reject` (payroll journal and
  payment approvals use them).
- A role named `super_administrator` already exists in HR/finance migrations. Phase 2
  should reuse it as the Super Admin role instead of adding a parallel `super_admin`.

**Resume point:** Phase 2 — `security/0021_super_admin_and_access_levels.forward.sql`.

### 2026-11-12 — Database work paused; frontend built on a prototype adapter

The product owner asked to leave the database untouched for now. **Phase 2
(migrations) and the Phase 6 data merge are deferred.** Everything else proceeds
without schema changes:

**Phase 5 (frontend) — done, on a deliberate mock fallback**
- Menu (`prototype-data.ts`): Administration → Dashboard, Tenant Directory,
  Organisation (Companies, Structure), Users & Access (Users, Access Levels,
  Activity Log). Retired pages redirect (`retiredPageRedirects`). `finance` label →
  "Accounting" (id kept). Identity & Access sidebar button removed;
  `/admin/identity` → `#/administration/users`; the hidden `#/identity/access`
  route still works (backend untouched, D11).
- Navigation filtering (`app/shell/config/module-access.ts`, shell `permissions`
  prop): Super Admin sees all; live modules need a matching permission; Administration
  is Super Admin only; a direct URL to a hidden module shows "You don't have access".
  **Mock modules stay visible to everyone** until per-user module access is stored
  (needs `security_user_module_access`).
- `app/features/administration/`: `api/administration-client.ts` is the adapter.
  Users, module access, tenant profile and the activity log live in an in-memory
  store (`model/admin-store.ts`) — every such screen shows a "Prototype data" notice.
  Rules mirror the server ones in `model/admin-workflow.ts` (last Super Admin guard,
  self-demotion confirmation, version conflict, financial-year lock, audit before/after).
  Companies are read live from `/api/v1/hr/companies`; Structure embeds the live HR
  organisation-structure workspace.
- `/register` page validates the sign-up form but does not create an organisation
  (needs `platform_register_organisation`). Login links to it.
- Account menu → Change password, calling the new `POST /api/v1/auth/change-password`.
- Tests: `tests/unit/administration-workflow.test.ts` (16), `tests/e2e/administration.spec.ts`.
  Updated `bank-payment-shell-navigation.test.tsx` (button retired) and
  `bank-compact-forms.spec.ts` (mock user now holds a Banking permission).

**Phase 3 (API) — service/router layer, mostly not mounted**
- `POST /api/v1/auth/change-password` is **live** on existing tables: verifies the
  current password, applies tenant policy, rehashes, bumps `session_version` (other
  sessions end), re-issues the current session, appends a hash-chained
  `security_audit_event` (`security.user.password.changed`), Redis-throttled.
  Refused during impersonation and for `reset_required` accounts. In OpenAPI/client.
- `server/api/src/modules/administration/`: router → service → `AdministrationRepository`
  interface (no implementation). Only `GET /api/v1/admin/modules` is mounted (catalogue,
  no DB). The full router mounts only when a repository is supplied. Super Admin is
  decided by `isSuperAdmin` in contracts (`security.authorization.administer` until the
  role flag exists).

**Phase 4 (email) — code ready, not wired to a table**
- `server/worker/src/email/` templates + dependency-free SMTP sender; `jobs/send-email.ts`
  processor over an `EmailOutboxStore` interface (backoff, 5 attempts). Mailpit added
  to `compose.yaml` (SMTP 51025, UI 58025); `SMTP_*` names in `.env.example`. The
  worker does not read `SMTP_*` yet.

**Verification (2026-11-12):** `npm run typecheck`, `npm run api:check`,
`npm run catalogue:check`, theme audit `--check`, `git diff --check`, `npm run build:web`
all pass. `npm run test:unit`: 1418 passed, 3 failed — the same pre-existing failures.
`npm run test:security`: 5 passed, 58 skipped (need DB). `tests/e2e/administration.spec.ts`
4/4 passed against the dev server on 3005 with installed Chrome
(`tmp/playwright-chrome.config.ts`; the bundled Playwright browser is not installed).
Not verified: integration tests (need the test DB), manual light/dark and
tablet/mobile visual review.

**UI review pass (2026-11-12):** all Administration screens checked at desktop/tablet/
mobile in light and dark and fixed; details in `docs/architecture/remaining-ui-migration.md`.

**Still blocked on the database:** real user creation/editing, stored module access
and nav filtering for mock modules, tenant profile persistence, registration,
email outbox, Super Admin role flag, Phase 6 org-unit merge.

## 9. Out of scope

Date lock (D9), access reviews, delegation, impersonation, session policies,
editions/entitlements, forgot-password self-service email, mobile tokens.
