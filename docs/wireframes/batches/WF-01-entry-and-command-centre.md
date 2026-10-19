# WF-01 — Entry and Command Centre

- Status: `SUPERSEDED UNAPPROVED — REPLACED BY FINANCE-FIRST MODULE REVIEW`
- Screens: 5
- Flow: Sign in → choose company context → land on role command centre → act
  on work → find any permitted record or action
- Scope: shared experience used by every Nexora ERP module
- Implementation impact: none

## Batch assumptions

- The current Demo Company credential flow is real development behavior.
- Production identity, MFA, OIDC/SAML provider, session revocation, and
  impersonation policy remain open under `NEX-OQ-015`.
- Company access behavior remains open under `NEX-OQ-017`.
- Role-dashboard KPI packs remain open under `NEX-OQ-018` and freshness rules
  under `NEX-OQ-019`.
- One user may have multiple roles. A selected **working role/view** changes
  prioritisation, not backend authorization; the server remains authoritative.
- Every Demo surface keeps the non-production indicator visible.

## Flow map

```text
[NEX-WF-ENT-001 Sign in]
           |
           v
[NEX-WF-ENT-002 Company and role selection]
           |
           v
[NEX-WF-ENT-003 Role command centre]
       |                         |
       v                         v
[ENT-004 My work]       [ENT-005 Global search]
       |                         |
       +------------+------------+
                    v
          permitted module record/action
```

---

## NEX-WF-ENT-001 — Sign in

### 1. Purpose

- User problem: enter the correct Nexora environment securely without bearer
  tokens, permission checkboxes, or technical setup knowledge.
- Primary users: all internal users; portal users use their portal-specific
  identity entry in later batches.
- Primary action: `Sign in`.
- Current truth: `PARTIAL` — Demo tenant username/password login is live;
  production SSO/MFA is not approved or implemented.

### 2. Information architecture

Priority order: environment identity → credentials → primary action → safe
help → production identity options. After successful authentication, go to
company selection when multiple permitted companies exist; otherwise enter the
only company directly.

### 3. Desktop ASCII wireframe

```text
+--------------------------------------------------------------------------------------------------+
| NEXORA ERP                                                                      [Language v] [?] |
+---------------------------------------------------+----------------------------------------------+
|                                                   | DEMO ENVIRONMENT                             |
|              One system. Clear control.           | Non-production data for testing/training.    |
|                                                   | It may be reset without notice.               |
|     Business operations → Accounting → Insight    |                                              |
|                                                   | Sign in                                      |
|                                                   | Tenant / workspace                           |
|                                                   | [nexora-demo..............................]   |
|                                                   | Username                                     |
|                                                   | [demo.admin..............................]   |
|                                                   | Password                                     |
|                                                   | [••••••••••••••••.................] [Show]   |
|                                                   | [ ] Remember tenant on this device           |
|                                                   |                                              |
|                                                   | [              Sign in                  ]    |
|                                                   |                                              |
|                                                   | ───────── Production access ─────────        |
|                                                   | [Company SSO — Coming Soon]                  |
|                                                   |                                              |
|                                                   | [Forgot password]  [Contact administrator]   |
+---------------------------------------------------+----------------------------------------------+
| Privacy | Security | Status                                            Version {version}        |
+--------------------------------------------------------------------------------------------------+
```

Production deployment replaces the Demo panel with the company/product trust
panel and only shows enabled identity methods. It must never expose demo
credentials on a production sign-in page.

### 4. Mobile ASCII wireframe

```text
+--------------------------------------+
| NEXORA                        [?] [🌐] |
+--------------------------------------+
| DEMO ENVIRONMENT                     |
| Non-production data; may be reset.   |
+--------------------------------------+
| Sign in                              |
|                                      |
| Tenant / workspace                   |
| [nexora-demo.......................] |
| Username                             |
| [demo.admin........................] |
| Password                             |
| [••••••••••••••••............][Show]|
| [ ] Remember tenant                  |
|                                      |
| [             Sign in              ] |
|                                      |
| Company SSO — Coming Soon            |
| [Forgot password]                    |
+--------------------------------------+
| Privacy | Security                   |
+--------------------------------------+
```

### 5. Actions and lifecycle

- Primary: sign in using tenant/workspace, username, and password.
- Secondary: show/hide password; remember only the tenant identifier; recover
  password when the configured identity provider supports it; open help.
- Never: accept a pasted bearer token; allow users to assert permissions;
  reveal whether an unknown tenant or user exists.

### 6. Security, audit, and accounting

- Authentication success establishes a tenant-bound session; it grants no
  permission by itself.
- Success/failure, session, time, source context, and safe device metadata are
  audit candidates; passwords and tokens are never logged.
- No accounting effect.

### 7. Required states

| State | Treatment |
|---|---|
| Loading | Sign-in button shows inline progress; fields stay visible |
| Invalid credentials | Generic safe message; preserve tenant and username; clear password |
| Locked/disabled account | Safe support instruction; no sensitive reason leakage |
| Network/server error | Retry plus copyable correlation ID |
| Rate limited | Wait time and retry availability |
| SSO unavailable | Honest `Coming Soon` or disabled provider-specific message |
| Demo | Persistent Demo block before credentials |

### 8. Self-QA

- One primary action; visible labels; 44×44 targets; keyboard order is tenant →
  username → password → remember → sign in; error is announced; no secret/token
  field; mobile maintains the Demo warning; no fake SSO.

---

## NEX-WF-ENT-002 — Company and role selection

### 1. Purpose

- User problem: enter the correct legal/company boundary and understand the
  working role before viewing or changing ERP data.
- Primary users: authenticated users with one or more company assignments.
- Primary action: `Open company`.
- Current truth: `PLANNED` — current demo login uses tenant context and the
  frontend does not provide a governed company selector.

### 2. Information architecture

Show only authorized companies. Prioritize last used and pending-work context,
then company name/legal identity, environment, active role view, fiscal period,
and warnings. A user with one company may bypass this screen unless a compliance
or environment warning requires acknowledgement.

### 3. Desktop ASCII wireframe

```text
+--------------------------------------------------------------------------------------------------+
| NEXORA | Signed in as {user}                                            [Help] [Sign out]         |
+--------------------------------------------------------------------------------------------------+
| Choose where you want to work                                                                    |
| Your access and available actions change by company.                                              |
|                                                                                                  |
| [Search companies............................]   [All environments v]   [Last used v]             |
|                                                                                                  |
| +---------------------------------------------+  +---------------------------------------------+  |
| | DEMO                                        |  | PRODUCTION                                  |  |
| | Nexora Demo Company                         |  | {Legal company name}                        |  |
| | Tenant: nexora-demo                         |  | {Country} • {base currency}                 |  |
| | Fiscal period: {period} <Open>              |  | Fiscal period: {period} <Open>              |  |
| | Working view: [Administrator v]             |  | Working view: [Finance Manager v]          |  |
| | 8 approvals • 3 alerts                      |  | 4 approvals • 1 close task                  |  |
| | [             Open company              ]   |  | [             Open company              ]  |  |
| +---------------------------------------------+  +---------------------------------------------+  |
|                                                                                                  |
| Can't find a company? [View access help]                                                        |
+--------------------------------------------------------------------------------------------------+
| Session expires in {time}                                                     [Sign out all]     |
+--------------------------------------------------------------------------------------------------+
```

### 4. Mobile ASCII wireframe

```text
+--------------------------------------+
| Nexora                 [Help] [Exit] |
+--------------------------------------+
| Choose a company                     |
| [Search............................] |
| [All environments v]                 |
|                                      |
| +----------------------------------+ |
| | DEMO                             | |
| | Nexora Demo Company              | |
| | {period} <Open>                  | |
| | View [Administrator v]           | |
| | 8 approvals • 3 alerts           | |
| | [Open company]                   | |
| +----------------------------------+ |
| +----------------------------------+ |
| | PRODUCTION                       | |
| | {Company name}                   | |
| | View [Finance Manager v]         | |
| | [Open company]                   | |
| +----------------------------------+ |
+--------------------------------------+
```

### 5. Actions and lifecycle

- Primary per card: open company.
- Secondary: change working view; search/filter; access help; sign out.
- Switching company from inside Nexora uses the same confirmation logic and
  refuses to discard unsaved drafts silently.

### 6. Security, audit, and accounting

- Cards are server-derived from active company-role assignments.
- Working view can reduce/prioritize the UI; it cannot expand backend rights.
- Company selection and switching are audit events when policy requires them.
- Unauthorized companies never appear; direct-link behavior awaits
  `NEX-OQ-017`.
- No accounting effect, but the chosen company fixes legal entity, base
  currency, fiscal calendar, and later posting context.

### 7. Required states

| State | Treatment |
|---|---|
| One company | Bypass or show a compact confirmation if environment warning is required |
| No companies | Explain access is not assigned; contact/request-access action |
| Suspended company | Visible only if allowed, disabled with safe reason |
| Company service unavailable | Disable that card, keep other authorized companies usable |
| Expiring session | Warning with extend/sign-out actions |
| Unsaved work during switch | Name the draft and offer stay/discard/save where supported |

### 8. Self-QA

- Company/legal boundary is visually stronger than the working role; Demo and
  Production cannot be confused; role selection never implies extra permission;
  keyboard focus traverses search, filters, and cards predictably.

---

## NEX-WF-ENT-003 — Role command centre

### 1. Purpose

- User problem: see the most important role-specific facts, risks, approvals,
  and actions immediately after entering a company.
- Primary users: CEO, CFO, department managers, and operational users with
  tailored packs.
- Primary action: the highest-priority role action, normally `Review approvals`
  or a context-specific create/action button.
- Current truth: `PARTIAL` — Finance KPI/report data exists; complete role packs
  and operational sources do not.

### 2. Information architecture

Top priority: company/environment/freshness. Next: urgent work and exceptions.
Then role KPIs with formula/source/drill-down. Finally: operational trends,
recent activity, and shortcuts. No widget appears without a source and
permission.

### 3. Desktop ASCII wireframe

```text
+--------------------------------------------------------------------------------------------------+
| DEMO — Nexora Demo Company — Non-production data                                                 |
+--------------------------------------------------------------------------------------------------+
| NEXORA | Company: Nexora Demo Company v | [Search] | [My work 8] [Alerts 3] [AI] [User v]       |
+----------------------+---------------------------------------------------------------------------+
| OVERVIEW             | Good morning, {name}                         Data as of 10:32 [Refresh]     |
| [Command centre]     | Working view: [Finance Manager v]                        [Review approvals]|
| [My work]            +---------------------------------------------------------------------------+
| [Banking]            | +----------------+ +----------------+ +----------------+ +----------------+|
| [Sales]              | | Cash position  | | Receivables    | | Payables       | | Budget used    ||
| [Purchases]          | | PKR {value}    | | PKR {value}    | | PKR {value}    | | {percent}      ||
| [Inventory]          | | as of 10:30    | | <Planned>      | | <Planned>      | | as of 10:30    ||
| [Finance]            | | [Drill down]   | | [Coming Soon]  | | [Coming Soon]  | | [Drill down]   ||
| [Projects]           | +----------------+ +----------------+ +----------------+ +----------------+|
| [People]             |                                                                           |
| [Operations]         | +-------------------------------------+ +---------------------------------+|
| [Reports]            | | MY PRIORITIES                       | | EXCEPTIONS / ALERTS             ||
| [More modules]       | | 3 approvals due today       [Open] | | 2 journals require review [Open]||
|                      | | 1 close task blocked        [Open] | | 1 integration failed <Planned> ||
| [Admin / Settings]   | | 4 saved drafts              [Open] | | 3 stale KPIs             [Open]||
|                      | +-------------------------------------+ +---------------------------------+|
|                      |                                                                           |
|                      | +-------------------------------------+ +---------------------------------+|
|                      | | CASH TREND (table/chart toggle)    | | RECENT BUSINESS ACTIVITY        ||
|                      | | [Chart] [Table]                     | | {actor} posted {journal}        ||
|                      | | {permitted live data only}         | | {actor} approved {document}     ||
|                      | +-------------------------------------+ +---------------------------------+|
+----------------------+---------------------------------------------------------------------------+
```

### 4. Mobile ASCII wireframe

```text
+--------------------------------------+
| DEMO — Non-production                |
+--------------------------------------+
| [≡] Nexora      [Search] [Alerts 3]  |
| Nexora Demo Company v                |
+--------------------------------------+
| Good morning, {name}                 |
| View [Finance Manager v]             |
| Data as of 10:32        [Refresh]     |
| [Review approvals]                   |
|                                      |
| +----------------------------------+ |
| | Cash position                   | |
| | PKR {value} • as of 10:30       | |
| | [Drill down]                    | |
| +----------------------------------+ |
| +----------------------------------+ |
| | Receivables                     | |
| | Coming Soon                     | |
| +----------------------------------+ |
| Priorities                           |
| [3 approvals due today          >]  |
| [1 close task blocked           >]  |
| Exceptions                           |
| [2 journals require review      >]  |
+--------------------------------------+
| [Home] [My work] [Create] [More]     |
+--------------------------------------+
```

### 5. Actions and lifecycle

- Primary action is derived from the role pack and current urgency.
- KPI click opens the defined report/filter context; alert click opens the
  affected record or exception queue.
- Role view can be changed only among assigned views and never changes company.
- Users can eventually personalize layout, but source/formula and mandatory
  control widgets cannot be removed by preference.

### 6. Security, audit, and accounting

- Each KPI declares permission, source, formula, refresh, and drill-down.
- Values are never hardcoded; planned KPIs show `Coming Soon`, not demo numbers.
- Dashboard reads do not post accounting. Actions launched from it use their
  owning module's authorization, approval, posting, and audit controls.

### 7. Required states

| State | Treatment |
|---|---|
| Loading | Skeleton cards preserve layout and title |
| No data | Explain source/date range; offer permitted setup or filter action |
| No permission | Omit sensitive KPI; do not show zero as if it were a value |
| Stale | Badge on affected card plus last refresh and refresh action |
| Partial outage | Isolate failed card with correlation ID; keep other cards usable |
| Planned module | `Coming Soon`; no enabled drill-down/action |
| Demo | Persistent banner and only real seeded values from supported modules |

### 8. Self-QA

- Five-second read identifies company, role, urgent work, and freshest key KPI;
  no random widget wall; every live number has a path to source; charts have
  table alternatives; mobile order follows role priority rather than desktop
  left-to-right order.

---

## NEX-WF-ENT-004 — My work and approvals

### 1. Purpose

- User problem: process assigned approvals, tasks, exceptions, and expiring
  work across modules from one accountable queue.
- Primary users: approvers, managers, accountants, operational users.
- Primary action: decide or open the selected item.
- Current truth: `PLANNED` as a unified queue; the workflow engine has partial
  backend capability.

### 2. Information architecture

Queue first, then selected evidence and decision. Filters distinguish Approvals,
Tasks, Exceptions, Delegated, and Completed. Sort by due/risk, never only by
creation time. Module, company, amount, requester, current step, and SLA are
visible before selection.

### 3. Desktop ASCII wireframe

```text
+--------------------------------------------------------------------------------------------------+
| DEMO — Nexora Demo Company — Non-production data                                                 |
+--------------------------------------------------------------------------------------------------+
| My work  [Approvals 8] [Tasks 4] [Exceptions 3] [Delegated 1] [Completed]       [Preferences]   |
| [Search....................] [Module v] [Risk v] [Due v] [Assigned to v] [Clear]                  |
+--------------------------------------------+-----------------------------------------------------+
| WORK QUEUE                                 | SELECTED ITEM                                       |
| <High> Purchase order PO-00042             | Purchase order PO-00042 <Awaiting approval>         |
| PKR 1,250,000 • due today • Finance step   | Supplier {name} • Department {name}                |
| Requester {person}                    [>]  | Amount PKR 1,250,000                               |
|--------------------------------------------|                                                     |
| <Medium> Journal JE-00128                  | Controls                                            |
| 6 lines • due tomorrow • Manager step [>]  | Budget <Passed>  Match <N/A>  SoD <Passed>          |
|--------------------------------------------|                                                     |
| <Low> Inventory count exception            | [View document] [Attachments 3] [Accounting preview]|
| Warehouse {name} • overdue            [>]  |                                                     |
|                                            | Approval route                                      |
|                                            | Maker ✓ → Procurement ✓ → Finance (you) → Signatory |
|                                            |                                                     |
|                                            | Comment                                              |
|                                            | [Required for reject/return.......................]  |
|                                            | [Return] [Reject]                     [Approve]       |
+--------------------------------------------+-----------------------------------------------------+
| 1 selected • 8 remaining                              [Previous] [Next]                           |
+--------------------------------------------------------------------------------------------------+
```

### 4. Mobile ASCII wireframe

Queue and decision are separate pages to protect legibility.

```text
+--------------------------------------+
| [<] My work              [Filters 2] |
| [Approvals 8] [Tasks 4]              |
| [Search............................] |
+--------------------------------------+
| <High> Due today                     |
| Purchase order PO-00042              |
| PKR 1,250,000 • Finance step      >  |
|--------------------------------------|
| <Medium> Due tomorrow                |
| Journal JE-00128 • 6 lines        >  |
|--------------------------------------|
| <Low> Overdue                        |
| Inventory count exception         >  |
+--------------------------------------+
| [Home] [My work] [Create] [More]     |
+--------------------------------------+

DETAIL / DECISION
+--------------------------------------+
| [<] PO-00042       <Awaiting approval>|
| Supplier {name} • PKR 1,250,000      |
| [Document] [Controls] [History]      |
| Budget <Passed> • SoD <Passed>       |
| Route: Procurement → Finance → Sign. |
| [Comment...........................] |
+--------------------------------------+
| [Return] [Reject]          [Approve] |
+--------------------------------------+
```

### 5. Actions and lifecycle

- Approve, reject, and return are separate controls; reject/return require a
  reason. Completed decisions cannot be edited.
- Bulk approval is absent by default and may only be introduced for explicitly
  low-risk homogeneous items with policy support.
- Delegated work records both delegator and acting user.
- Opening a source document preserves the work-queue return context.

### 6. Security, audit, and accounting

- Queue contents are assigned and permission-filtered by the server.
- The maker cannot approve their own controlled document when SoD prohibits it.
- Every decision records actor, company, step, comment, timestamp, delegation,
  correlation ID, and document version.
- Approval itself does not necessarily post; the owning transaction defines
  whether approval, confirmation, or a later action emits the Accounting Event.

### 7. Required states

| State | Treatment |
|---|---|
| Empty | `You are caught up`; show next due schedule, not a fake task |
| Reassigned while open | Block decision, explain new assignee, refresh item |
| Amended document | Show changed fields and require re-approval when policy says so |
| SoD conflict | Disable approve; explain permitted escalation/request path |
| Expired delegation | Remove acting authority and refresh queue |
| Decision conflict | Preserve comment, show latest version, require re-review |
| Server error | Preserve decision draft; show correlation ID and retry |

### 8. Self-QA

- Evidence precedes decision; risk and due date are not color-only; keyboard
  navigation works between queue and panel; mobile makes the controlled action
  sticky but does not obscure evidence; no ambiguous generic `Submit` button.

---

## NEX-WF-ENT-005 — Global search and command palette

### 1. Purpose

- User problem: find a permitted record, report, module, or action without
  memorising a 35-module navigation tree.
- Primary users: all authenticated internal users.
- Primary action: open the selected result/action.
- Current truth: `PLANNED` — the component pattern exists in design documents,
  but a governed global index/command service does not.

### 2. Information architecture

Search is company-scoped by default. Results group exact record matches,
navigation, reports, permitted actions, and help. Each result shows module,
identifier, status, company where cross-company search is permitted, and a
short match explanation. Commands are separate from records and require the
same confirmation/authorization as their destination screen.

### 3. Desktop ASCII wireframe

```text
                         +------------------------------------------------------------------+
                         | Search Nexora or run a command                           [Esc]   |
                         | [PO-00042, customer name, report, or action....................] |
                         | Scope: [Nexora Demo Company v] [All modules v]                  |
                         +------------------------------------------------------------------+
                         | RECENT                                                           |
                         | > Purchase order PO-00042 • Procurement • Awaiting approval     |
                         | > Trial Balance • Finance report • As of current period          |
                         |                                                                  |
                         | RECORDS                                                          |
                         | > PO-00042 — {supplier}      <Awaiting approval>   Procurement    |
                         | > AP-00042 — {supplier}      <Coming Soon>         Accounts Pay.  |
                         |                                                                  |
                         | ACTIONS                                                          |
                         | > Create manual journal                         Finance           |
                         | > Import bank statement                        Coming Soon        |
                         |                                                                  |
                         | REPORTS                                                          |
                         | > Purchase Order Report • filter: PO-00042       Coming Soon      |
                         +------------------------------------------------------------------+
                         | ↑↓ Move  Enter Open  Tab Scope  Esc Close       [Search help]     |
                         +------------------------------------------------------------------+
```

The overlay sits above the normal shell; it never erases or navigates away from
an unsaved form until the user chooses a result and confirms the transition.

### 4. Mobile ASCII wireframe

```text
+--------------------------------------+
| [<] Search Nexora                    |
| [PO-00042.........................]  |
| Company [Nexora Demo Company v]      |
| Module  [All modules v]              |
+--------------------------------------+
| RECORDS                              |
| PO-00042 • {supplier}                |
| Procurement • Awaiting approval   >  |
|--------------------------------------|
| ACTIONS                              |
| Create manual journal             >  |
| Import bank statement               |
| Coming Soon                          |
|--------------------------------------|
| REPORTS                              |
| Trial Balance • Finance           >  |
+--------------------------------------+
```

### 5. Actions and lifecycle

- Open record, module, report, or permitted command.
- Change company scope only when cross-company access is assigned; switching
  company follows the unsaved-work guard.
- Recent items are permission-rechecked before display and again before open.
- Search does not expose data through snippets that the destination would hide.

### 6. Security, audit, and accounting

- The search index is tenant/company/record-scope filtered and rebuildable from
  source records; it is not a new source of truth.
- Sensitive search terms and result content follow logging/redaction policy.
- Opening a command never bypasses its module authorization, approval,
  idempotency, or audit controls.
- Search itself has no accounting effect.

### 7. Required states

| State | Treatment |
|---|---|
| No query | Recent and suggested permitted destinations |
| No results | Spell/filter help; no implication that a forbidden record exists |
| Index stale | Last indexed time and link to direct module search when available |
| Search unavailable | Keep navigation usable; correlation ID and retry |
| Planned command | Label `Coming Soon`; disabled and excluded from keyboard activation |
| Unsaved current form | Confirm before leaving; preserve/cancel navigation safely |

### 8. Self-QA

- Full keyboard support; grouped result semantics are announced; result type and
  status are textual; planned actions are honest; no cross-tenant/company data
  leak; mobile uses a full screen, not a cramped popover.

---

## Batch-level review decision

Owner to record one decision:

- [ ] `APPROVED`
- [ ] `APPROVED WITH CHANGES` — list changes below
- [ ] `REJECTED` — return to information architecture
- [x] `PENDING REVIEW`

Requested review points:

1. Is company context selected after sign-in, or must it be part of sign-in?
2. Should users choose a working role/view, or should Nexora combine all assigned
   roles into one dashboard automatically?
3. Is the left navigation grouping and density appropriate for a professional
   ERP?
4. Does the command centre put the correct hierarchy first: urgent work,
   exceptions, then KPIs?
5. Is one unified My Work queue preferred over separate module approval inboxes?

No higher-fidelity prototype or frontend rework should begin from this batch
until the owner records an approval decision.
