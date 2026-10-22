# Employee Lifecycle delivery

Current checkpoint: Employee Lifecycle has 9/9 API-backed menu screens Live in the agreed non-Banking scope (HR116). Company lists, session recovery, supplemental settlement Payroll, retained tax recalculation, independent Finance posting and atomic leave corrections are implemented and verified. Banking payment/paid-recovery reconciliation remains deferred; see the latest dated entry for provenance requirements and execution bounds.

The connected section uses authoritative employment relationships, company access,
current role grants, independent approvals and immutable audit history. New policy
drafts include Hire, confirmation, resignation and termination; approved policy
definitions are preserved. Requests whose existing policy lacks the requested
transition are blocked and rolled back, including assignment changes. Existing
Hire-only policies can now receive an independently approved, employee-specific
policy upgrade. Approved definitions, original Hire policy references and earlier
employment events remain unchanged. No relationship is upgraded automatically.

The pages follow this sequence:

1. Onboarding retains identity, employment, access, equipment and Payroll readiness
   evidence. All five controls must be complete before independent approval.
   Checklist evidence is an officer-reviewed record; it does not itself provision
   access, equipment or salary assignments.
2. Probation reviews record scored evidence and an approved extension date, or
   create the policy-authorized confirmation event. Future effective confirmation
   waits until its effective date. Termination uses a separate exit case.
3. Transfers, Promotions & Movements reuses the existing five effective-dated maker
   workflows and independent approval queues. Salary revisions retain their own
   Payroll approval. The shared selectors now fit 320px layouts; wide tables scroll.
4. Resignations and Termination Cases retain notice references and last working
   dates. Independent approval authorizes the planned exit without prematurely
   changing current employment.
5. Exit Clearance requires all five asset, access, Finance, knowledge and HR
   handover controls. A still-active linked employee account blocks submission
   and approval. Security must deactivate that account through its own workflow;
   an HR checkbox cannot revoke access or override Security authority.
6. Final Settlements supports reviewed statements, source references, active
   currencies and exact earnings/recoveries. Optional quantity × minor-unit rate
   calculations use integer arithmetic and one half-up rounding step. After
   independent statement approval, authorized officers can create source-linked
   draft Payroll adjustments for unprocessed lines, with documented exclusions.
   Payroll keeps its own independent approval, statutory calculation and Finance
   journal workflow. Actual result/journal references show progress, including
   Finance reversal. Approved company rules now calculate fixed-rate paid-leave
   encashment using available days, a cap, minimum service and effective dates.
   Independent statement approval consumes the exact leave days. Approved statements
   without a Payroll handoff can now enter independent correction review. Approval
   cancels the statement and exactly restores its encashment; rejection preserves
   the original obligation. Pending review pauses Payroll handoff and offboarding. **This page
   remains In-progress:** fixed company amounts and completed-service-year benefit
   rules now support fixed currency amounts or approved monthly salary components
   with explicit policy factors. Paid-leave encashment also supports the approved
   monthly salary basis. Company partial-year formulas are supported through explicit service-day policies.
   Country/regional rule configuration and applicability evidence are connected.
   Corrections after finalized/paid Payroll or completed offboarding remain outstanding. Banking
   payment and reconciliation await the other owner.
7. Offboarding Control Centre applies an approved exit only after its working
   date and approved clearance/statement. Pending Payroll results and assignment
   movements block completion. An authoritative employment event, assignment end,
   employment period/status and employee compatibility status commit atomically.
   Financial liabilities remain preserved; employment closure is not settlement
   payment. Historical Payroll adjustments remain eligible inside the employee's
   actual employment/assignment period, and future dates are excluded.

Permissions reuse hr.employment_history.read, hr.employment_lifecycle.action and
hr.employment_lifecycle.approve with current company/tenant scope checks. Policy
administration keeps its separate permissions. No permission rollout is included.
Impersonated mutations and self-approval are rejected. Every mutation requires a
reason, expected version, CSRF protection and an idempotency key. Current authority
is checked before replay. Lists use database paging and bounded selectors/search.

Learning & Development is deferred until the end of the remaining HR work.
Banking remains owned by the other developer. This change does not modify Banking
source, send money, send messages or automatically change salary/training enrolment.

## Governed upgrades for existing employment - 21 October 2026

Lifecycle Policies includes an existing-employee upgrade panel. Create and submit
a replacement policy, obtain independent policy approval, then request the
employee upgrade and obtain a separate independent upgrade approval. The target
may remain Approved; employee adoption does not replace the company default for
future Hires. The retained state code must match an employed state, and the
target must authorize resignation and termination from that state.

HR87 adds a tenant-isolated decision ledger and effective policy resolver. The
original relationship Hire-policy reference and previous events are immutable.
Confirmation and exit actions resolve the approved replacement only at eligible
effective dates. A stale source-event, policy or affected-case snapshot requires
cancellation and a new request. Future, overlapping or invalid state/date
upgrades are rejected. Current company scope and separate policy/lifecycle
permissions are checked before writes and idempotent replay; employee and maker
self-approval are blocked. No grants or normal business approvals were added.

Final Settlements remains In-progress: entitlement calculation, Finance posting
and payment/reconciliation still require implementation. Banking is deferred to
its owner and Learning & Development remains last in the HR sequence.

## Settlement calculation and Payroll/Finance handoff - 21 October 2026

HR88-89 add immutable, tenant/company-scoped settlement-to-adjustment links.
The approved statement and its version/terms remain unchanged. Every line must
map to a same-company active fixed component of the correct direction or have
an explicit exclusion reason. Only exact positive amounts enter Payroll. The
exit month, matching currency/precision policy, authoritative month-start
placement and unfrozen Payroll period are checked on the server. Unconsumed
lines never inherit a Finance posting merely because another employee was posted.

The officer must attest that included lines are new, unprocessed entitlements.
Previously processed salary, paid items, loan-schedule references and asset
recoveries belonging to another process must be excluded. A component used by
an approved/active/settled loan cannot create another recovery through this
handoff. No leave balance, loan principal or asset value is changed here.
This reviewed handoff does not automatically discover or price legal benefits.

Existing draft/submitted/approved/consumed inputs cannot be overwritten or
duplicated. Rejected inputs and earlier exclusions can receive new linked
revisions; previous links and rejected adjustments remain immutable. Calculated
or finalized Payroll prevents new inputs; use its governed correction process.
Read permissions are checked once per workspace to avoid repeated role queries.
Separate Payroll authority and maker/employee exclusion are rechecked before
decisions and replay, with a database approval guard as well. No override is
available for settlement authors. Payroll input creation, provenance, audit and
idempotency commit together. No new grants or normal business approvals were made.

Open Final Settlements, create/edit a draft and optionally calculate each line
from a reviewed quantity and rate. Retain the policy/day/service/rate reference,
submit and obtain independent approval. Open the approved statement, map or
exclude every line and prepare draft Payroll inputs. Follow Payroll adjustments
to submit and independently approve them, then Payroll Runs/Review and Payroll
Journal for statutory execution and Finance acceptance/posting. Navigation keeps
the company and month; each destination rechecks company access. Banking is
explicitly pending and no payment status is inferred from a posted journal.

## Approved-rule leave encashment - 21 October 2026

Final Settlements includes Calculate leave and Company rules tabs. A rule defines
one paid leave type, an ordinary currency rate per day, maximum days, minimum
completed service days, bounded effective dates and an external company-policy
reference. Draft terms are retained after submission; a separate officer approves
or rejects them. Approved dates cannot overlap for one company/leave type. No
legal rate, leave entitlement credit or salary divisor is assumed. The initial
implementation supports fixed company rates for paid leave only.

Open an approved exit's draft statement, select an approved rule and review posted,
reserved, available and capped days with the exact currency amount. Add or refresh
the generated line. This changes only the draft. The line retains policy, ledger,
placement, exit and Payroll evidence; its amount/reference cannot be edited or
detached. A draft may remove or refresh it. Submission and independent approval
recheck the current source; changed evidence requires draft recalculation.

Statement approval posts one exact negative encashment entry per source in the
shared leave ledger, in the same transaction. It does not post Finance or pay the
employee. The existing Payroll handoff continues through separate approvals and
actual Finance posting. Pending and future leave are protected, including against
backdated usage. Service/category/effective-date eligibility and active paid leave
policy are checked; restricted legacy gender policies require verified eligibility.

The shared leave reader now supplies both Time & Leave and settlements. Leave
screens explicitly show days allocated to approved settlement. A narrowly checked
encashment entry can post after attendance closes because it does not alter day
allocations or the sealed attendance input. Ordinary source changes stay locked.
Calculated/finalized Payroll blocks new encashment approval and requires its
governed correction process. Source authors and employees cannot approve the
statement or its derived Payroll inputs. Approved source and ledger history are
immutable; Banking settlement cannot be inferred from Finance posting.

HR90-93 add rules, retained sources and ledger/approval guards. Authority, leave
balances, exact settlement totals and currency presentation use shared helpers.
The shared Tabs primitive now uses the installed Base UI orientation attributes;
Employee History selectors and tabs fit phone layouts. All affected UI uses shared
Tailwind controls, global sans typography and semantic theme tokens. No feature
stylesheet or extra palette was introduced.

Remaining: gratuity/severance/notice and other settlement benefit policies,
salary-derived encashment bases, governed reversal of an approved encashment and
jurisdiction-specific rules. Banking payment/reconciliation waits for its owner's
merge. Learning & Development remains last. Final Settlements stays In-progress.

## Independent pre-Payroll statement correction - 21 October 2026

Current screen status: Lifecycle Policies, Onboarding, Probation Reviews,
Transfers/Promotions & Movements, Resignations, Termination Cases, Exit Clearance
and Offboarding Control Centre are Live (8 of 9 menu pages). Final Settlements is
In-progress. The 8/9 figure is approximately 89% by screen count, not an estimate
of total implementation effort or production readiness.

Open an approved Final Settlements statement and choose Request statement
correction. Record the contractual error and obtain a separate officer's review.
While review is pending, Payroll handoff and offboarding pause. Approve correction
and restore leave cancels the entire statement and adds exact positive ledger
entries matching every consumed encashment source. Original lines, amounts,
source editor, approval evidence and negative ledger entries are preserved.
Create a replacement draft for the same approved exit, calculate/review its
entitlements and obtain independent statement approval before offboarding.
Reject statement correction leaves the original statement approved; a later
request has its own independent reviewer. The latest 25 reviews are shown and all
decisions remain retained in the database/audit history. Amounts on a cancelled
statement are explicitly labelled as original audit values; its Payroll handoff
is disabled and explains the replacement step.

This workflow is restricted to active employment with an approved, uncompleted
exit, no statement Payroll links (including exclusions/rejected links), and no
calculated or finalized exit-month/later Payroll. It does not void an actual
Payroll/Finance obligation. Corrections after Payroll handoff, frozen Payroll or
completed offboarding remain separate work. A pending review can still be rejected
after Payroll freezes; restoration stays blocked. Attendance may already be
closed: only exact, provenance-guarded encashment restorations are permitted;
ordinary attendance/leave sources remain sealed.

HR94-95 add forced tenant RLS, immutable review terms/decisions, independent
decisions, append-only restoration provenance, duplicate protection and deferred
atomic commit checks. The shared leave reader now reports net allocated settlement
days and includes matching future restorations in historical availability. Current
normalized company permissions are checked before idempotency replay. Employees
cannot request/decide their own correction and the requester cannot decide it.
Lifecycle reason, CSRF, expected version, audit and idempotency controls remain.
No new endpoint or parallel calculation/balance authority was introduced.

Validation: 92 integration tests across eight connected Lifecycle, leave, Payroll
and Finance suites passed, plus 30 unit/HTTP tests. Chrome exercised request,
independent approval and rejection with actual exact leave effects. Both themes
and widths 1440/768/390/320 passed without page errors or root overflow. Typecheck,
focused lint, production web build, API/catalogue parity, theme write/check and
git diff --check passed. Shared Tailwind controls, global sans typography and
semantic colors are preserved; no feature CSS was added. Theme audit remains
73 feature view files, 0 font exceptions and 5 existing color candidates (6.85%);
these are source-file figures, not menu-screen completion percentages.

The Docker development services were found stopped on resume and restored using
their existing containers/volumes. Both local databases are HR95. Normal API4000
and web3000 run the current code; normal verification is read-only. Test/browser
mutations and demo-account provisioning were confined to isolated PostgreSQL55433.
No normal permission grants, employee approvals, Payroll posting or Banking
changes were made by this phase.

Remaining: gratuity/severance/notice and other settlement benefit policies,
salary-derived encashment bases, jurisdiction-specific entitlement rules and
corrections after Payroll handoff/finalization or completed offboarding. Banking
payment/reconciliation waits for its owner; Learning & Development remains last.
Next safe implementation batch is governed company benefit policies, retaining
explicit company configuration and independent approval rather than assuming
legal entitlements or default rates. Final Settlements stays In-progress.

## Governed company settlement benefits - 21 October 2026

Final Settlements now includes Company settlement benefits with Calculate benefit
and Benefit rules tabs. Create a company policy draft for gratuity, severance,
notice or another contractual benefit. Choose earning or deduction, an explicit
currency amount, fixed-amount or completed-service-year basis, capped whole-year
units, minimum service days, eligible exit types, bounded effective dates and a
signed company policy reference. A separate officer must approve or reject it.
Submitted terms are immutable. Only one approved rule per company/category may
cover a date, even when its exit-type scope differs; use non-overlapping policy
periods rather than ambiguous concurrent rules. No statutory/legal rate or
entitlement is supplied by this feature.

Open an approved exit's draft statement, select a rule and review service dates,
calendar days, completed anniversary years, capped units, rate and exact amount.
Fixed amounts use one unit. Partial years are not rounded up or prorated. Add or
refresh the generated category line; repeated calculation retains one current
line while preserving previous source snapshots. Separate categories may contain
earnings and recoveries with exact reconciled net totals. Review manual lines to
avoid counting the same obligation twice. Generated amounts, directions, rates and
source references cannot be edited or detached. Drafts may remove/refresh them.
Rule history retains currency precision even when a currency later becomes inactive.

Submission and independent statement approval recheck approved policy, current
employment, operational placement, exit scope/dates, currency and Payroll evidence.
Changed evidence requires draft refresh. Review is serialized against Payroll;
calculated/finalized Payroll requires its correction process. Source calculators
and the employee cannot approve the statement or derived Payroll inputs. Current
normalized authority is checked before idempotency replay. Statement approval does
not create leave entries, post Finance or pay the employee. The existing governed
Payroll handoff supplies actual input/result/journal progress. Whole-statement
correction before Payroll handoff also supports these benefit lines, preserving
original amounts and approvals without changing leave balances.

HR96 adds forced tenant RLS for company rules and immutable source evidence,
non-overlapping approved periods, independent decisions, exact category/source
guards and derived Payroll approval protection. Contracts, documented versioned
API, generated client, HR adapter and screen are updated together. Rules use the
existing Lifecycle policy permissions; no new normal grants or business approvals
were made. Banking code and payment/reconciliation remain with the other owner.

The new view uses shared controls/Tailwind, semantic colors and global sans
typography. Visual review found primary button foreground and inactive-tab browser
defaults conflicting with themes; these were fixed in the shared Button/Tabs
primitives. Both semantic token colors and existing Employee History tabs were
verified after theme/resize transitions. No feature CSS was introduced or removed.

Verification: 102 distinct focused integration cases passed across nine connected
Lifecycle/leave/Payroll/Finance suites (101 in the full run plus the added mixed
earning/deduction case in the ten-case benefit suite). The generated benefit was
consumed by actual Payroll and posted to a real Finance journal using artificial
production-classified statutory fixtures, which are not legal rates. All 34 focused
unit/HTTP cases passed (136 total). Chrome exercised rule creation, independent
approval/rejection, calculation/protected editor and independent statement approval;
fixed/service forms and all affected layouts passed light/dark at
1440/768/390/320 without page errors or root overflow. Shared Employee History's
three tabs passed the same themes/widths. Typecheck, focused lint, production web
build, API/catalogue parity, theme write/check and git diff --check passed.

Theme audit: 74 feature view source files, zero font exceptions and five existing
color candidates (6.76%); 220 app source files, ten color candidate files/47 lines.
These source-file counts are not screen-completion or ERP-readiness percentages.
Both local databases are HR96; normal API4000/web3000 run current code. Normal
verification is read-only. Mutations and browser records were confined to isolated
PostgreSQL55433. Browser fixtures use distinct names to fit the existing 100-company
picker; that directory remains bounded and unpaged, a separate shared-picker limit.

Lifecycle remains 8/9 menu screens Live; Final Settlements stays In-progress.
Remaining: salary-derived benefit/encashment bases, partial-year/company formula
policies, jurisdiction-specific entitlement rules and corrections after Payroll
handoff/finalization or completed offboarding. Banking payment/reconciliation waits
for its owner's merge. Learning & Development remains last. Next safe batch is
salary-derived settlement calculations with retained approved salary authority,
explicit divisors/bases and independent policy approval; preserve exact money,
source protection and shared theme controls.

## Approved-salary company benefit basis - 21 October 2026

In Final Settlements > Company settlement benefits > Benefit rules, choose
Approved monthly salary components as the rate source. Select active fixed earning
components and enter an explicit integer multiplier and divisor from the signed
company policy. No divisor, statutory percentage or legal benefit amount is
assumed. The existing quantity basis supports a single award or capped completed
calendar service years. Fixed company currency rules remain compatible.

Calculation resolves exactly one independently approved, governed fixed monthly
salary covering the approved exit date, in the rule currency. It uses the salary
assignment's captured component amounts. Formula, hourly, daily, weekly, annual,
custom and non-governed legacy salary conversions are not inferred. Missing or
inactive components, fractional currency amounts beyond supported precision,
submitted salary changes and unsupported/oversized amounts block generation.
The preview shows salary ID/version/effective dates, component amounts, exact
basis and policy factors. A rounded reference rate is labelled as display only;
the final amount is calculated from the exact basis and rounded half up once.
For example, a synthetic 3,100,000-minor-unit basis × 2 units ÷ 3 is 2,066,667
minor units, rather than multiplying a previously rounded unit rate.

Salary setup/read authority is required to calculate, submit/approve, view retained
salary-source statement evidence or prepare its Payroll handoff. Normalized current
company grants are rechecked before replay. Rule configuration/decisions require
Payroll setup read in addition to the existing Lifecycle policy permissions.
Rules show their included component scope; generated lines retain the exact
factor, approved salary reference, component names and immutable source snapshot.
The shared settlement calculator/contract now supports bounded rational factors
with integer arithmetic; existing two-argument fixed/leave calculations preserve
their behavior. Read-only generated editors and statement details show factors.

Source capture and independent statement approval share a database salary-proof
function, with forced tenant scope and Payroll serialization. Draft statements must
refresh after an approved salary revision. Once a salary-based statement is
approved, salary changes affecting its reviewed source cannot be submitted or
approved until that statement is independently corrected. Payroll surfaces this
as a specific correction instruction. The existing pre-handoff statement correction
cancels it without changing leave and retains its original salary evidence. Salary
evidence is checked again before Payroll handoff; no stale source is silently
substituted. Actual input approval, Payroll consumption and Finance posting remain
separate, with calculator/employee exclusion and immutable provenance preserved.

HR97-98 add salary proof and correction guards plus explicit Payroll guidance.
No normal permission grants, salary changes, employee decisions, Payroll postings
or Banking changes were made by rollout. Both databases are HR98, normal API4000
and web3000 serve current code, and normal verification is read-only. Test/browser
mutations are restricted to isolated PostgreSQL55433.

Validation: 109 integration tests across ten connected salary-benefit, company
benefit, correction, encashment, Lifecycle, policy, leave, Payroll and Finance
suites passed. This includes actual generated salary-benefit consumption and
Finance posting using artificial production-classified statutory fixtures; those
fixtures are not legal rates. All 37 focused unit/HTTP tests passed (146 total).
Browser tests covered salary-rule creation, independent approval/rejection,
source calculation/protected editor and independent statement approval. Single
award and service-year forms, salary evidence and affected layouts passed both
themes at 1440/768/390/320 with no page errors or root overflow. Typecheck, focused
lint, production web build, API/catalogue parity, theme write/check and
git diff --check passed. Runtime salary-proof privileges and forced tenant RLS
were verified. Normal authenticated reads returned 200/no-store, anonymous reads
401, with eight connected Lifecycle routes checked without business writes.

All UI additions use shared Tailwind controls, global sans typography and semantic
theme tokens. No feature stylesheet or extra palette was added. Audit remains
74 feature view source files, zero font exceptions and five existing color
candidates (6.76%); 220 app source files, ten color candidate files/47 lines.
These are source-file figures, not completed-screen percentages.

Lifecycle remains 8/9 menu pages Live. Final Settlements remains In-progress for
salary-based leave encashment, partial-year/company formula policies, jurisdiction-
specific entitlement rules and corrections after Payroll handoff/finalization or
completed offboarding. Banking payment/reconciliation waits for its owner and
Learning & Development remains last. Next safe batch is salary-derived paid-leave
encashment using the same salary authority, explicit company divisors/factors,
single-rounding arithmetic and existing immutable leave-consumption/reversal path.

## Salary-based paid-leave encashment - 21 October 2026

Completed this batch: Final Settlements > Leave encashment > Company rules now
supports Approved monthly salary components as its rate source. Select the fixed
earning components and explicitly enter the multiplier and divisor from the signed
company policy. Fixed currency daily rules remain supported. No statutory divisor,
rate or eligibility is assumed. Independently approve the company rule before use.

Calculate leave shows the posted balance, protected pending/future days, capped
eligible days, approved salary ID/version/effective dates, captured component
amounts and exact formula. The reference daily rate is rounded for display only.
The final total uses exact minor-unit integer arithmetic and rounds half up once.
For example, the synthetic company policy basis 3,100,000 minor units / 30 x
10.2500 days yields 1,059,167 minor units. Multiplying a previously rounded daily
rate would produce an incorrect amount. Four-decimal days are retained exactly.

The same shared salary authority used by company benefits resolves exactly one
governed, independently approved fixed monthly salary covering the exit date.
Captured components must be active fixed earnings in the rule currency. Missing
components, unsupported rates/currency precision, formula conversions, submitted
salary changes and unsupported totals block generation. Salary read plus setup
read is checked for preview, retained statement evidence, statement decisions,
Payroll handoff and idempotent replay. Policy rule configuration and decisions
also require current company Payroll setup read. Permission grants are unchanged.

Immutable source lines retain salary/component evidence and explicit factors.
Drafts must refresh after salary changes. Independent statement approval consumes
the exact days atomically; source calculators and the employee cannot approve
derived obligations. Approved salary-based settlements require independent
correction before a salary revision covering the source can submit or approve.
Pre-handoff correction cancels the statement and restores the exact encashed days
through the existing positive reversal ledger, preserving original evidence.
Payroll handoff checks salary freshness again; actual adjustment approval,
consumption and Finance posting retain separate approvals and immutable links.
No payment or Banking completion is implied.

HR99 adds salary-aware rule/source/statement approval and salary-change guards,
reusing the database salary proof function. Both local databases are HR99. Normal
API4000 and web3000 serve the connected implementation. Normal verification made
no business writes; rule/statement/Payroll/Finance test mutations used isolated
PostgreSQL55433. Banking files were not changed by this batch.

Validation: 116 integration tests across eleven connected suites plus 39 focused
unit/HTTP checks passed (155 total). Checks cover exact fractional-day rounding,
current salary permissions and replay, stale source refresh, protected lines and
database evidence, independent approval, exact correction restoration, salary
change blocking and actual Payroll consumption through Finance posting. Synthetic
production-classified Payroll fixtures do not establish legal rates. Chrome
exercised rule creation, independent approval/rejection, salary calculation,
protected statement editor and statement approval. Affected forms and evidence
passed light/dark at 1440/768/390/320 with no page errors or root overflow; captured
desktop/mobile views were inspected. Typecheck, focused lint, production web build,
API/catalogue parity, theme write/check and git diff --check passed. Normal
authenticated reads returned 200/no-store, guests 401, and eight connected
Lifecycle routes passed without normal business writes. Runtime salary-proof
execution privileges and forced tenant RLS on encashment tables were verified.

Salary factors, component selection and evidence now use shared HR components
across company benefits and leave encashment. All affected UI uses Tailwind,
semantic global theme colors and the global sans font; no feature CSS was added.
Audit: 74 feature view source files, zero font exceptions, five existing color
candidates (6.76%); 221 app source files and ten color candidate files/47 lines.
These source-file figures do not measure completed menu screens. The existing
bounded company picker remains a separate limitation for very large company lists.

Lifecycle remains 8/9 menu pages Live. Final Settlements remains In-progress for
partial-year/company formula policies, jurisdiction-specific entitlement rules and
correction after Payroll handoff/finalization or completed offboarding. The next
batch is explicit company benefit formula/partial-year policy support, with the
company's approved calculation basis. Banking awaits its owner; Learning &
Development remains last. Salary-based leave encashment is complete for the
supported approved fixed monthly salary basis described above.

## Service-day company formulas and rejected-input correction - 21 October 2026

Company benefits now support a single award, capped completed calendar years or
capped actual service days. Service-day policy requires an explicit elapsed
(exit minus employment start) or inclusive (both endpoints) convention. The
approved company multiplier/divisor converts a fixed company reference amount or
captured approved monthly salary basis into the final entitlement. A company can
therefore express a partial-year policy using its explicitly approved year-day
divisor, without rounding years or daily amounts before the final calculation.
Fixed reference factors are also available for awards/years. Mixed salary and
fixed rate factors, ambiguous day counting and out-of-range caps are rejected.
Day caps are bounded to 36,500; award/year caps retain their existing bounds.
No statutory divisor, eligibility or legal entitlement is inferred.

Preview shows actual service dates/days, quantity convention, capped units and
salary/component evidence where applicable. Immutable lines retain exact factors
and sources. Rule creation/independent decisions, normalized current company
authority, version/idempotency checks, salary privacy and stale-source detection
remain enforced. Existing fixed and completed-year snapshots remain compatible.
HR100 extends rule/source guards and unit bounds additively.

Statement correction can now proceed after a Payroll handoff only when every
generated input is independently rejected and Payroll remains open. Draft inputs
must first be submitted and rejected in Payroll by a separate reviewer. Zero-value
exclusions may remain; nonzero exclusions representing externally processed
amounts continue to block restoration. Source links, rejected inputs, original
statement and calculation history are never deleted. Existing separate correction
approval cancels the statement and restores its exact encashed days atomically.
Active/consumed inputs, calculated/finalized Payroll and completed offboarding
remain protected. HR101-102 add rejected-input support and nonzero-exclusion
protection; the same checks run in the API and database.

Validation: 122 distinct integration checks across thirteen connected suites and
39 focused unit/HTTP checks passed (161 total). The broad run had one legacy
eligibility wording mismatch; restoring the old completed-year message resolved
it and all ten company-benefit checks passed on rerun. The other twelve suites
passed the broad run. Checks include salary and fixed-reference partial years,
elapsed/inclusive counting, caps, exact single rounding, rule/source forgery,
Payroll rejection before statement correction, preserved immutable links, exact
leave restoration and refusal of nonzero external references through API and DB.
Chrome exercised fixed-reference and salary partial-year forms plus source
calculation in light/dark at 1440/768/390/320. Captures were visually inspected;
no page errors or root overflow occurred. Required production build, typecheck,
focused lint, generated client/API and catalogue parity, theme write/check and
git diff --check passed. Normal verification is read-only and includes salary
source controls, authenticated no-store responses, anonymous rejection and eight
connected Lifecycle routes. Both local databases are HR102; API4000/web3000 are
running. All financial test mutations used isolated PostgreSQL55433.

Affected controls continue using Tailwind and shared semantic themes/global sans
font. The shared rate-factor fields now support explicit policy or salary labels;
the new factor toggle has a unique associated accessible label. No feature CSS or
palette was added. Audit remains 74 view source files with zero font exceptions,
five existing color candidates (6.76%); 221 app source files, ten color candidate
files/47 lines. These figures are source audits, not completed-screen percentages.
Banking's pre-existing changes were preserved; no Banking work was included.

Remaining scope: Final Settlements remains In-progress, with Lifecycle still
8/9 menu pages Live. A governed post-finalization/paid-Payroll adjustment and
post-offboarding correction workflow is not implemented by this batch. These
require compensating financial records and statutory reassessment, rather than
editing finalized results or restoring leave against an active obligation.
Country/jurisdiction and approved company statutory/partial-year policies were
requested from the user; actual statutory rates/eligibility must not be invented.
The configurable service-day formula capability is complete, but no company
policy has been installed automatically. Banking remains deferred to its owner,
and Learning & Development remains last.

## Administrator-configured country settlement policies - 21 October 2026

Delivered country-specific policy configuration for both Company settlement
benefits and Leave encashment. Admins with current company Lifecycle Policy
manage permission can create country or regional rules using the existing fixed
amount, approved monthly salary component, award, service-year or service-day
calculation controls applicable to that calculator. Creation remains a draft;
the author submits it and a separate authorized policy officer approves/rejects.
No new normal permission grants or statutory rates were installed.

To configure: open Final Settlements, then Company settlement benefits > Benefit
rules or Leave encashment > Company rules. Create a rule and complete Country
applicability: choose a country from the shared catalogue, an explicit Legal
employer or Employee work location basis, whole-country/regional coverage and
the reviewed authority/document reference. Complete the signed company policy
reference, rates/factors, service limits and dates before independent approval.
Country references come from the central Platform catalogue; approved effective
employer/location profiles use the existing Payroll localization workflow. New
country reference releases remain centrally governed. Rule creation is generic
for registered countries; no country-specific rates are embedded in HR code.

An effective approved legal-employer or employee work-location profile determines
applicability at the approved exit date. Citizenship/nationality is not used as a
jurisdiction substitute. References and ancestry must be active and cover the
rule/date range. Work-location rules require the real operational assignment;
missing/ambiguous profiles, inactive/cyclic ancestry, required missing regions
or unresolved approved employee jurisdiction overrides block calculation.

Policy priority is regional ancestry, then whole country, then company default.
A default cannot bypass a matching, more specific approved rule. The preview
shows the applicable policy and provides Use applicable rule when another rule
is selected. Same-scope approved periods cannot overlap. Country policies for one
company benefit category or leave type must use one consistent profile basis
over overlapping dates; cross-border assumptions are not silently resolved.
Independent country/regional scopes can coexist in the same effective period.

Country context, selected/eligible policy set, approved profile and jurisdiction
ancestry are retained in the immutable calculation source. Preview, independent
statement approval and Payroll handoff use one shared tenant-scoped resolver and
database proof. Changed evidence requires refresh/correction. Statement review
and retained history expose the original captured date, country, hierarchy,
policy, authority reference and profile ID without reading live replacements.
Salary evidence still requires current salary read authority. Retained evidence
uses the existing source-authority read with compact projections, avoiding extra
per-case queries or transferring unrelated policy/salary snapshots.

Once generated inputs are active or consumed in Payroll, a policy cannot be
backdated over that statement's generated benefit/leave obligations. Use a
future effective period, or independently reject unprocessed inputs and correct
the statement first. Nonzero external processing references also preserve this
boundary. Actual finalized/paid obligations require governed compensating
financial corrections. Future policy approval preserves posted Payroll/Finance
history. Rule approval and handoff share company serialization so a concurrent
handoff cannot evade this check.

HR103-106 add scoped exclusion keys, active reference validation, bounded
hierarchy/rule resolution, immutable source/approval/handoff proof and Payroll
obligation protection. Existing fixed rules and sources retain their original
terms and fingerprints when no country policy applies. Forced tenant RLS remains
on all benefit/encashment rule and source tables. New proof functions execute as
the caller, and runtime execution/table privileges were verified without grants.
Both local databases are HR106; API4000 and web3000 serve the implementation.
Normal verification is read-only; all rule/statement/Payroll/Finance acceptance
mutations used isolated PostgreSQL55433. Banking was not modified by this work.

Verification: 141 distinct integration checks across sixteen connected country,
localization, settlement, salary, leave, Payroll and Finance suites plus 39 focused
unit/HTTP checks passed (180 total). The initial broad run passed 140 checks;
focused reruns cover the additional backdating case, retained proof projection,
salary privacy and subsequent obligation guard. A test-only future-date alias was
corrected and its actual Payroll/Finance case passed on rerun. Coverage includes
separate country scopes, regional priority, country mismatch, missing evidence,
invalid/conflicting references, source forgery, stale review/handoff, exact leave
consumption/restoration, real Finance posting, rejected-input recovery and future
policy approval without changing posted obligations. Synthetic acceptance rates
and regions do not establish legal entitlements.

Chrome exercised benefit and encashment country-rule creation, independent policy
approval, calculations and captured statement evidence in light/dark at
1440/768/390/320. Created scope terms were read back from the API. Country lookup
preserves entered rates/components/dates and active tabs; resetting country scope
clears its jurisdiction controls. Captures were visually inspected with no page
errors or root overflow. Production build, typecheck, focused lint, generated
client/API and catalogue parity, theme write/check and git diff --check passed.
Normal authenticated endpoints return 200/no-store, anonymous requests 401; both
country forms and eight connected Lifecycle routes passed without business writes.

UI additions use shared Tailwind controls and global semantic colors/sans font.
No feature CSS or palette was added. Theme audit: 74 feature view files, zero font
exceptions, five existing color candidates (6.76%); 222 app source files and ten
color candidate files/47 lines. These are source-file figures, not completed-menu
percentages. Country choices are bounded to 250 and per-country jurisdiction
options to 500, ordered national/subnational before local. The resolver bounds
policy cohorts to 500 and ancestry to 32 entries.

Country-specific configuration support is complete for these supported formulas
and applicability bases. Actual authority references, rates and eligibility must
be entered and independently approved for the company. Final Settlements remains
In-progress solely for the previously identified finalized/paid Payroll and
post-offboarding correction workflows; this batch does not implement them.
Lifecycle remains 8/9 menu pages Live. Banking remains deferred to its owner;
Learning & Development remains last.


### 2026-10-21 — Financial correction review after Payroll or offboarding

Completed the **review stage** of compensating final-settlement corrections. In
Final Settlements, open an approved statement whose exit Payroll has been
calculated/finalized, whose inputs were consumed, or whose employment has actually
ended. Authorized officers can propose full corrected amounts for every retained
line and attach a supporting authority/reference. The server derives each signed
difference and the net difference using exact integer minor units. Deductions
reduce the net difference; a negative difference is presented for recovery review.
Unchanged lines are retained, and a wholly unchanged proposal is rejected.

A different authorized officer approves or rejects the review. Approval is
explicitly **awaiting separate Payroll correction**: it does not recalculate tax,
post Finance, create a Payroll adjustment, pay money, restore leave, reactivate
employment or rewrite the original approved statement. This is a review of
proposed differences and supporting evidence, not an alternate benefit-policy
calculator or permission to bypass the retained approved source formulas.

HR107–108 add a forced tenant-RLS review ledger and source-context reader. The
snapshot retains the original statement/evidence and actual employment, Payroll
input/result/run and Finance journal states. Evidence changes prevent approval;
the reviewer can reject and request a fresh proposal. SQL guards independently
verify the original line amounts and exact differences, prevent source/request
tampering and affected-employee decisions, and preserve decisions. Company locks
and a partial unique index permit one unresolved review per original statement;
an approved review remains unresolved financially and cannot be stacked. Existing
statement handoff and exit-state mutations cannot bypass an unresolved correction.

The existing versioned Lifecycle API gains request_financial_correction and
decide_financial_correction actions, plus financial_corrections in statement
responses. Current normalized company and Payroll setup/input/result read grants,
Lifecycle action/approval and salary-source privacy are checked before idempotent
replay. Browser mutations retain CSRF/origin enforcement. Approval/rejection and
their complete original/proposed evidence are recorded in the review ledger and
the standard audit boundary; rejected requests remain visible.

Verification: 44 distinct database integration checks across seven suites and 39
focused unit/API checks passed (83 total). These include actual authoritative
offboarding, a consumed salary-derived settlement through actual Payroll and
Finance posting, stale decisions after posting, revoked-grant replay, duplicate
requests, direct SQL source/difference tampering, immutable history and unchanged
original obligations. Five new review checks passed after the isolated fixture
was corrected to use a unique subject account. Acceptance data is synthetic and
does not establish any statutory rate. Banking/paid-payment execution was not
tested or changed.

Chrome completed proposal, independent approval and rejection, with light/dark
checks at 1440/768/390/320, no page errors or root/section horizontal overflow,
and the global sans font. Proposal, decision and saved-state captures were
visually inspected. The screen uses existing Tailwind/shadcn controls and semantic
tokens, with no feature CSS or font override. Production web build, typecheck,
focused lint, API generation/parity, catalogue parity, theme audit and diff check
passed. Theme audit: 74 feature view files, zero direct font exceptions, five
existing colour candidates (6.76%); 223 app source files, ten colour-candidate
files/47 lines. These are source-file figures, not completed-screen percentages.

Both local databases are HR108. The normal API is restarted on port 4000, with
the web on 3000. Normal Final Settlements/Offboarding authenticated reads return
200/no-store and anonymous reads 401; current response contracts and the page
were checked without business writes. Runtime table/function privileges and
forced tenant RLS were verified without changing grants.

**Next required phase:** execute an approved correction through a supplemental
Payroll/statutory calculation and independently governed Finance adjustment,
including negative recovery handling, payment reconciliation after Banking is
merged, and any separately authorized leave correction. No Payroll reopening or
financial reversal is implied by a review approval. Final Settlements therefore
remains In-progress; Lifecycle is still **8/9 menu pages Live**. Banking remains
with its existing owner; Learning & Development remains last.


### 2026-10-21 — Lifecycle completion and company/session recovery (HR116)

Employee Lifecycle now has **9/9 API-backed menu screens marked Live** within the
agreed non-Banking scope. Final Settlements is no longer a prototype or a
review-only correction screen. Banking payment reconciliation, actual collection
of paid recoveries and external obligations without governed Payroll provenance
remain separate dependencies; no payment is invented or confirmed by this work.

The blank company list was reproduced: a valid fresh login returned both
authorized companies, while an expired cookie left cached workspace state visible.
The shared generated API client now notifies the session boundary on protected
401 responses. The workspace returns to sign-in; stale requests cannot clear a
newer successful login, and identity changes remount feature caches. Login errors,
403 permissions and infrastructure failures retain their own behavior. Policy,
case and movement selectors provide readable loading/empty/error states and retry.
All nine normal Lifecycle routes loaded their company lists after rollout.

HR109–116 deliver an immutable supplemental Payroll execution ledger linked to
independently reviewed settlement corrections. Officers review taxable treatment
and a Finance posting date, calculate with the original sealed production tax
rules/declarations, independently approve, and post only balanced account
differences through the actual Finance service. Later finalized employee months
are recalculated from their retained YTD provenance. Posted overlays feed future
ordinary Payroll YTD reads and invalidate later calculated/unreviewed runs that
need recalculation. Payroll runs show original and supplemented totals separately;
the Finance/Payroll dashboard includes posted supplements. Original results,
consumed inputs, salary/loan evidence, journals and published payslips are retained.

Repeated corrections use the last processed amounts as their baseline. Approved
reviews become processed only with their actual posted execution. Version/hash
checks, company locks, current normalized permission checks before replay,
independent reviewers/posters, source-author/calculator exclusions, beneficiary
exclusions and audit history apply throughout. The original approver is correctly
distinguished from a draft editor. Finance-only reversal is blocked because it
would leave Payroll tax carry-forwards unchanged; use a compensating correction.

Encashment corrections retain four-decimal days, exact source rates/factors,
half-up rounding and the approved cap. They check actual available/reserved leave.
Independent Finance posting and signed leave correction entries commit atomically;
rejection or failure changes neither money nor leave. Successor corrections may
restore or consume the reviewed difference without rewriting original consumption.
Country-proof comparison accepts only administrative placement closure backed by
the actual employment exit event; changed placement/jurisdiction evidence remains
blocked. Ended employment is never reactivated by financial correction.

Verification: **134 distinct integration checks across 16 suites plus 125
unit/API checks across 11 suites passed (259 checks)**. The five supplement
integration scenarios were rerun after the author/approver distinction was fixed.
Coverage includes repeated monetary and leave corrections, real offboarding,
retained country applicability, source tampering, revoked-permission replay,
stale rates, protected history, closed Finance rollback, YTD arithmetic and
connected summary totals. Acceptance rates/data are synthetic, not legal rules.
Chrome completed calculation, independent approval, actual Finance posting,
day-based proposal and actual Finance/leave posting. Light/dark checks at
1440/768/390/320 showed no page errors or root/section horizontal overflow and
used the global font. Captures were visually inspected.

Production build, typecheck, focused lint, API generation/parity, catalogue
generation/parity, theme audit and diff checks passed. Shared alerts and the
session banner use semantic theme tokens; affected Finance legacy presentation
was moved to Tailwind/shared controls. No feature CSS was added. Theme audit:
74 feature view files, zero direct font exceptions, five existing colour
candidates (6.76%); 224 app source files, nine colour-candidate files/46 lines.
These figures measure source files, not completed menu percentages.

Both local databases are HR116. Normal rollout changed only HR migrations;
runtime privileges and forced tenant RLS were verified without ad-hoc grants.
The normal web/API remain on 3000/4000. Eleven normal authenticated reads returned
200/no-store and anonymous reads 401, without business writes. All nine company
selectors, expired-session recovery and transient-failure retry passed normally.
The temporary test API is stopped. Banking implementation was untouched;
Learning & Development remains last as previously requested.

Operational limits are explicit: original changed obligations must have real
consumed Payroll provenance, and affected original accruals must be posted before
their supplement. Excluded/unproven external amounts cannot become fabricated
Payroll inputs. Paid/closed negative recoveries wait for Banking provenance and
receivable classification. Current Finance periods/rates/accounts must permit
posting; source changes require rejection/recalculation. Synchronous execution is
bounded to 120 affected finalized employee months and 600 earlier history rows.
