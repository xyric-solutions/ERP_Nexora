# Business nominal catalog — import review

## 2026-10-21 — Current result: 131 reviewed ordinary nominals activated

This supersedes the zero-activation checkpoint below. The user subsequently
requested activation and transaction availability. Authenticated **Shoaib**
(`user-shoaib-super-admin`, live global Super Admin) performed the changes through
the existing CSRF/Origin/version/idempotency-protected APIs in **R06 UAT** only.

- **131** imported entries without O/M/U exceptions in the existing account-level
  review were explicitly classified `ordinary` and directly activated.
- **96** unique entries with ownership/integration, applicability/reporting or
  specific-label uncertainties remain `draft / inactive / review_required`.
  The 65 O, 29 M and 3 U flags overlap; do not add them as separate account totals.
  These are unresolved candidates, not 96 confirmed invalid accounts.
- Generic reduced-image warnings (T) and documented repeated screenshot
  occurrences (D) were not treated as proven errors: the workbook/catalog was
  already approved, all selected identities matched it, and no code/name was
  altered or duplicate created. Source notes remain intact.
- Four older deliberately inactive general profiles were not reactivated as part
  of the imported-draft operation. All 102 headers were already active. Existing
  Bank settlement/system/reconciliation controls remain excluded from Bank lines.
- **711301 — Subscriptions is active/ordinary and selectable in both screens.**
  APIs report 131 eligible, 96 pending review, 4 inactive and 20 protected leaves.
  Default directories are bounded to 100 matches; use Search nominal accounts
  by code/name to find later entries. Refresh the open transaction page/directory.

Each selected record is now profile version 3 / classification review version 2.
There are 131 genuine direct activation proofs and 262 additional general-nominal
events (243 → 505); platform audits increased 334 → 596. No submitter, independent
checker or approval override was fabricated. All 227 codes/names/types, IDs,
category/section relationships, currencies and posting flags were compared before
and after; all 96 excluded records were unchanged in full. Financial table
fingerprints (Bank accounts, Payments/lines, Receipts/lines and journals) were
identical before/after; still 3 Payments, 0 Receipts and 0 journals.

A transient API disconnect left 61 active and one classified draft. The first
request had also failed its If-Match precondition before any write. The controlled
resume re-read actual versions, skipped the 61 completed activations and finished
the remaining 70 without duplicate events. No service checks or lock protections
were bypassed. Task-created API sessions were logged out.

Backup: ignored `tmp/coa-activation-20261021/before-reviewed-activation.dump`,
custom archive listing verified (2,437 TOC entries), SHA-256
`0da84bd8bce394844750a0ec7194bb8f63077d29a675c74140e53b9995849bb1`.
Live browser verification authenticated normally on web 3000/API 4000 (no forwarding
or fixture responses), selected Subscriptions in Payment and Receipt, and blocked
all financial business writes. Both screens had no Document Reference input.
Screenshots are ignored `tmp/coa-activation-20261021/{payment,receipt}-live-nominal.png`.

### Remaining 96 account-specific exceptions — unchanged

| Code | Name | Exclusion reason |
| --- | --- | --- |
| 110101 | Accruals | Applicability/reporting classification review |
| 120101 | Trade Creditors | Owner/integration review |
| 120102 | Customer Withholding Tax | Owner/integration review |
| 120103 | Post-Dated Cheques Issued | Owner/integration review |
| 120201 | Other Creditors | Owner/integration review |
| 120301 | General Sales Tax | Owner/integration review |
| 120401 | WHT Deductions | Owner/integration review |
| 120501 | Current Tax Liability | Owner/integration review |
| 120601 | Insurance Payable | Owner/integration review |
| 120602 | Loan Payable | Owner/integration review |
| 120603 | Payroll payable | Owner/integration review |
| 120604 | Expenses Payable | Owner/integration review |
| 120701 | Payroll Tax and Social Security | Owner/integration review |
| 120801 | Short Term Loans Payable | Owner/integration review |
| 120802 | Faraz Payable | Owner/integration review; Specific source-label uncertainty |
| 210101 | Property | Owner/integration review |
| 210102 | Accumulated Depreciation Property | Owner/integration review |
| 210201 | Plant and Machinery | Owner/integration review |
| 210202 | Plant and Machinery Additions | Owner/integration review |
| 210203 | Accumulated Depreciation Plant and Machinery | Owner/integration review |
| 210301 | Office Equipments | Owner/integration review |
| 210302 | Office Equipments Additions | Owner/integration review |
| 210303 | Accumulated Depreciation Office Equipments | Owner/integration review |
| 210401 | Furniture and Fixtures | Owner/integration review |
| 210402 | Furniture and Fixtures Additions | Owner/integration review |
| 210403 | Accumulated Depreciation Furniture and Fixture | Owner/integration review |
| 210501 | Vehicles | Owner/integration review |
| 210502 | Vehicles Additions | Owner/integration review |
| 210503 | Accumulated Depreciation Vehicles | Owner/integration review |
| 210601 | Other Tangible Assets | Owner/integration review |
| 210602 | Accumulated Depreciation Other Tangible Assets | Owner/integration review |
| 220101 | Goodwill | Owner/integration review |
| 220201 | Intangible Assets | Owner/integration review |
| 220301 | Investments | Owner/integration review |
| 220401 | Licences | Owner/integration review |
| 220501 | Other intangible assets | Applicability/reporting classification review |
| 220502 | Other Non-current Assets | Applicability/reporting classification review |
| 220601 | Prepayments | Applicability/reporting classification review |
| 220701 | Accrued Income | Applicability/reporting classification review |
| 230101 | Stock | Owner/integration review |
| 230201 | Debtors | Owner/integration review |
| 230202 | Allowance for bad debts | Owner/integration review |
| 230203 | Post-Dated Cheques Received | Owner/integration review |
| 230301 | Other Debtors | Owner/integration review |
| 230602 | Undeposited Funds | Owner/integration review |
| 230701 | Prepaid Expense | Applicability/reporting classification review |
| 230702 | Prepaid Insurance | Applicability/reporting classification review |
| 230703 | Prepaid rent | Applicability/reporting classification review |
| 230801 | Withholding Income Tax (Advance) | Owner/integration review |
| 310101 | Capital | Applicability/reporting classification review |
| 310103 | Ordinary shares | Applicability/reporting classification review |
| 310104 | Paid in capital or surplus | Applicability/reporting classification review |
| 310105 | Partner Capital (A) | Applicability/reporting classification review |
| 310106 | Partner Capital (B) | Applicability/reporting classification review |
| 310107 | Partner Distributions (A) | Applicability/reporting classification review |
| 310108 | Partner Distributions (B) | Applicability/reporting classification review |
| 310109 | Drawings | Applicability/reporting classification review |
| 310110 | Share Capital | Applicability/reporting classification review |
| 410301 | Discount Allowed | Applicability/reporting classification review |
| 410302 | Sale Receipts Discount | Applicability/reporting classification review |
| 410303 | Retail Margin Sale | Applicability/reporting classification review |
| 410304 | Trade Offer Sale | Applicability/reporting classification review |
| 510206 | Opening Stock | Owner/integration review |
| 510207 | Closing Stock | Owner/integration review |
| 510501 | Discount Received | Applicability/reporting classification review |
| 510502 | Purchase Payment Discount | Applicability/reporting classification review |
| 510503 | Retail Margin Purchase | Applicability/reporting classification review |
| 510504 | Trade Offer Purchase | Applicability/reporting classification review |
| 710101 | Wages & Salaries | Owner/integration review |
| 710102 | Directors Salaries | Owner/integration review |
| 710103 | Staff Salaries | Owner/integration review |
| 710104 | Wages - Regular | Owner/integration review |
| 710105 | Wages - Casual | Owner/integration review |
| 710106 | Employer Social Security | Owner/integration review |
| 710107 | Employers Provident Fund | Owner/integration review |
| 710108 | Employers Pensions | Owner/integration review |
| 710701 | Finance costs | Applicability/reporting classification review |
| 710705 | Round Off | Owner/integration review |
| 710706 | Realised Exchange Gains | Owner/integration review |
| 710707 | Realised Exchange Losses | Owner/integration review |
| 710708 | Exchange Revaluation Gains | Owner/integration review |
| 710709 | Exchange Revaluation Losses | Owner/integration review |
| 711207 | Management Charges Payable | Applicability/reporting classification review |
| 711304 | Whop*Travelling Trader Subscription | Specific source-label uncertainty |
| 711312 | Magicfruit Subscription | Specific source-label uncertainty |
| 720102 | Loss (Gain) on disposal of assets | Applicability/reporting classification review |
| 720201 | Depreciation Property | Owner/integration review |
| 720202 | Depreciation Plant and Machinery | Owner/integration review |
| 720203 | Depreciation Office Equipments | Owner/integration review |
| 720204 | Depreciation Furniture and Fixture | Owner/integration review |
| 720205 | Depreciation Vehicles | Owner/integration review |
| 720206 | Depreciation Other Tangible Assets | Owner/integration review |
| 720207 | Depreciation | Owner/integration review |
| 730101 | Loan Interest paid | Applicability/reporting classification review |
| 740101 | Income Tax | Owner/integration review |
| 740102 | Corporation Tax | Owner/integration review |

Latest workflow checkpoint: Super Admin direct master management (2026-10-21), below. Earlier approval instructions are historical and superseded for Chart of Accounts masters, not Bank financial transactions.

## Earlier checkpoint — Direct Super Admin masters: pre-activation audit

The user authorized direct master changes, but also required preservation of
classifications and exclusion of ambiguous/restricted accounts. Finance 24 is
applied locally. Creation of new ordinary and Bank nominals is directly active;
existing eligible masters have direct edit/activate/deactivate operations. These
operations require live global Super Admin authority, existing fine permissions
and company access. There is no separate master submitter/checker requirement.

| Audited group | Existing count | Activated in this delivery | Excluded from automatic activation | Manual review |
| --- | ---: | ---: | ---: | ---: |
| Imported nominal drafts | 227 | 0 | 227 | 227 |
| Draft/inactive company Categories/Sections | 0 | 0 | 0 | 0 |
| Already-active company headers | 102 | 0 | Not applicable | 0 lifecycle exceptions |

Exclusions and manual review are the **same 227 accounts**, not additive totals.
All 227 are `draft / inactive / review_required`, review version 1. None has an
explicit persisted `ordinary` classification, so none meets the activation
precondition without making an additional accounting-ownership decision. No
account was automatically classified. Zero confirmed structural invalidities,
duplicate imported codes or duplicate normalized imported names were found.
Structural validity is not authorization to enable manual posting.

The existing full 227-row account-code/name inventory and ownership/mapping
candidates remain in [the detailed investigation below](#2026-10-21--read-only-review-of-the-227-imported-nominals).
Particular label exceptions remain **120802 — Faraz Payable**, **711304 —
Whop*Travelling Trader Subscription**, and **711312 — Magicfruit Subscription**.
There are 189 generic reduced-image transcription warnings plus these three
specific warnings; 35 have no transcription warning. All still require posting
classification review. Inventory, debtors/creditors, payroll, tax and fixed-asset
owner candidates must not become unrestricted offsets merely because their
structure is valid. Seven Cash/Bank catalog references are separate from the
227; actual Bank identity/currency setup must remain explicit.

Super Admin procedure: open `/#/finance/chart-of-accounts`, select the existing
company, search the code, open its detail, resolve source/ownership questions,
choose and save the truthful posting classification, then **Activate now →
Confirm activate** for a valid ordinary account. No separate approver is needed.
Module-controlled accounts remain unavailable to ordinary Bank lines. Reopen or
refresh Bank Payment/Receipt nominal selectors after activation; they use the
same persisted account ID and display code/name. Do not relabel a controlled
account as ordinary merely to populate a selector.

Company Categories/Sections are managed in the existing
`/#/finance/section-management` navigation. Codes, parents and accounting types
remain immutable; dependent headers cannot be deactivated. Central published
catalog revisions retain their existing immutable provenance. Legacy detailed
Bank-account APIs remain compatibility-controlled; this delivery changes the
canonical CoA nominal master path, not payment/receipt approval or posting.

After applying Finance 24, a source re-read matched every imported code, name,
type, category/section, currency, state, classification, review version and source
note/row to the pre-change audit. Counts remain 353 accounts, 17 Bank accounts,
3 payments, 0 receipts, 0 journals, 243 general-nominal events and 334 platform
audit events. There are **zero source direct-master-change events**, correctly:
no source business account was changed, so no audit event was fabricated.
All 102 headers are active (14 adopted categories + 78 adopted sections +
10 legacy headers); the central template is published, with no draft headers.

Source backup before migration: ignored
`tmp/coa-super-admin-20261021/source-before-finance24.dump`; custom-format archive
listing verified (2,419 TOC entries), SHA-256
`29fe67e764c42200fea25d90c09efc750077d74072aae0b6ca78f78d0122d09a`.
See the Bank workflow handoff for exact verification and remaining blockers.

## Current status — central catalog and company adoption persisted

Latest checkpoint: Finance migrations 15–17 and company adoption are applied to
the existing Nexora R06 UAT company. Its 326 source mappings cover all 14 categories,
78 sections and 234 nominal definitions. Exactly 227 ordinary nominal drafts are
persisted with source codes; seven Bank definitions remain explicit references,
not guessed Bank facilities/currencies. Company setup and nominal posting-review
screens use real APIs/PostgreSQL, with lifecycle/audit/security tests.

All 227 ordinary source accounts are inactive/review_required until a Super Admin
explicitly classifies and directly activates eligible accounts. Module-controlled records are
blocked from ordinary manual submission/activation. These are required business
decisions, not a missing database connection. No actual business record was
classified/approved automatically and no financial transaction was posted.
The delivery plan's final CT-03/04 checkpoint records execution, tests and resume
instructions. The earlier entries below describe their historical checkpoints.

Finance 18 also completes the explicit Bank-definition setup path: the existing
Bank creation form can select an adopted Excel definition, preserve its reserved
code/name and require an actual currency choice. Binding is audited/atomic and
duplicate-safe. No source Bank definition was auto-created or assigned a currency.
Canonical CoA Bank creation is now directly active for Super Admin; legacy detailed
Bank facilities retain their compatibility workflow. Custom numbering starts at 230908.

The user approved the workbook and central-template design. Finance migration
13 and the tenant-owned central catalog are now applied locally. PostgreSQL
and fresh authenticated API reads return 14 categories, 78 sections and 234
nominals with 237 source occurrences. Import/publication replay is verified.
This is central reference metadata, NOT company-account adoption or permission
to post. Existing company accounts and financial records are unchanged.

See `docs/superpowers/plans/2026-10-20-central-chart-template-implementation-plan.md`
for exact evidence and commands. CT-02 Master Data navigation/browsing is now
implemented and browser-verified. The user selected existing Nexora R06 UAT for
testing, with no new business company. CT-03 read-only preview is also browser
verified: 227 proposed ordinary drafts, seven Bank references, one conflict
between template section 2309 and protected existing Bank section UAT-BN-CB.
The user subsequently approved an Excel-aligned hierarchy migration instead of
retaining the old section code. Finance 14 and the guarded local operation are
now applied: existing section ID is preserved, code 2309/name Cash and Bank,
future codes start at 230908 with workbook 230901–230907 reserved. Existing Bank
leaves are not renamed into unrelated workbook identities. No financial history
or account IDs changed; no new company/accounts were created. Fresh preview has
zero conflicts and two existing header matches. Company write adoption of 227
ordinary drafts, posting classification and activation remain CT-03/04.
Earlier review/checkpoint notes below describe the pre-import state and source
limitations; they do not mean the central catalog is still unpersisted.

## Supplied business reference (2026-10-20)

Visual transcription deliverables are now in
`outputs/coa-visual-transcription-20261020/`: one five-sheet review workbook
and five CSVs (Categories, Sections, Nominals, Source Rows and Review Issues).
The transcription preserves 237 source row occurrences and contains 234
distinct nominal codes. In addition to the two subscription overlaps noted
below, Daily Wages Labour (510104) repeats in screenshots 1 and 2. Identical
source occurrences are retained in Source Rows and collapsed only in the
review Nominals export, not in the database. All rows require review before
import; four particularly uncertain labels are called out in Review Issues.
No missing entries were invented to force 237 unique accounts. Export row
counts, code uniqueness and saved workbook text identifiers were checked;
all five worksheet previews were visually reviewed. No database write occurred.

The user's four Chart of Accounts/Section Listing screenshots supersede the
prototype proposal below. They describe 14 categories and 78 sections. The
nominal listing displays 237 entries, but that is not yet a verified count of
unique import rows: Google Play (711314) and Figma Subscription (711306)
appear in both the second and third supplied images. Collapse identical input
rows only after comparing their codes, hierarchy and attributes; do not delete
persisted accounts because names repeat.

No business catalog records have been imported from these screenshots. The
first two images were reduced to 532 and 626 pixels wide, respectively. Obtain
CSV/Excel exports or original full-resolution files before certifying every
nominal code/name. Do not transcribe uncertain financial values by guessing.

### Category mapping

These are business presentation categories, mapped to the existing five
account types. They do not introduce a separate accounting engine. Spelling
below is normalized to the supplied Section Listing; source codes remain
unchanged. Category codes are not established by the screenshots and must not
be inferred as new authoritative codes without import review.

| Category | Existing account type | Sections |
| --- | --- | ---: |
| Capital & Reserves | equity | 3 |
| Non-Current Liabilities | liability | 6 |
| Current Liabilities | liability | 8 |
| Tangible Assets | asset | 6 |
| Non-Current Assets | asset | 8 |
| Current Assets | asset | 9 |
| Income | revenue | 3 |
| Cost of Sales | expense | 5 |
| Direct Expenses | expense | 4 |
| Expenses | expense | 21 |
| Other Expense | expense | 2 |
| Finance Cost | expense | 1 |
| Other Income | revenue | 1 |
| Taxation | expense | 1 |

### Section transcription — validate against the import source

| Category | Code | Section |
| --- | --- | --- |
| Capital & Reserves | 3101 | Capital |
| Capital & Reserves | 3102 | General Reserves |
| Capital & Reserves | 3103 | Accumulated Reserves |
| Non-Current Liabilities | 1101 | Accruals |
| Non-Current Liabilities | 1102 | Deferred Income |
| Non-Current Liabilities | 1103 | Long term Loans Payable |
| Non-Current Liabilities | 1104 | Other Non-Current Liabilities |
| Non-Current Liabilities | 1105 | Provision for Liabilities |
| Non-Current Liabilities | 1106 | Shareholder Loan Payable |
| Current Liabilities | 1201 | Trade Creditors |
| Current Liabilities | 1202 | Other Creditors |
| Current Liabilities | 1203 | Sales Tax Account |
| Current Liabilities | 1204 | Withholding Income Tax (Deductions) |
| Current Liabilities | 1205 | Provision of Taxation |
| Current Liabilities | 1206 | Accruals and Payables |
| Current Liabilities | 1207 | Payroll Tax and Social Security |
| Current Liabilities | 1208 | Short-term Loans Payable |
| Tangible Assets | 2101 | Land and Buildings |
| Tangible Assets | 2102 | Plant and Machinery |
| Tangible Assets | 2103 | Office Equipments |
| Tangible Assets | 2104 | Furniture and Fixtures |
| Tangible Assets | 2105 | Vehicles |
| Tangible Assets | 2106 | Other Tangible Assets |
| Non-Current Assets | 2201 | Goodwill |
| Non-Current Assets | 2202 | Intangible Assets |
| Non-Current Assets | 2203 | Investments |
| Non-Current Assets | 2204 | Licences |
| Non-Current Assets | 2205 | Other Non-Current Assets |
| Non-Current Assets | 2206 | Prepayments |
| Non-Current Assets | 2207 | Accrued Income |
| Non-Current Assets | 2208 | Security Deposits |
| Current Assets | 2301 | Stock |
| Current Assets | 2302 | Debtors |
| Current Assets | 2303 | Other Debtors |
| Current Assets | 2304 | Investments - Other |
| Current Assets | 2305 | Advances and receivables |
| Current Assets | 2306 | Other current assets |
| Current Assets | 2307 | Prepaid expenses and deposit |
| Current Assets | 2308 | Withholding Income Tax (Advance) |
| Current Assets | 2309 | Cash and Bank |
| Income | 4101 | Product Sale |
| Income | 4102 | Fees Income |
| Income | 4103 | Discount Allowed |
| Cost of Sales | 5101 | Cost of Labour |
| Cost of Sales | 5102 | Supplies and Materials |
| Cost of Sales | 5103 | Equipment Rental |
| Cost of Sales | 5104 | Other Cost of Sales |
| Cost of Sales | 5105 | Discount Received |
| Direct Expenses | 6101 | Import Duty |
| Direct Expenses | 6102 | Shipping, Freight and Delivery |
| Direct Expenses | 6103 | Sales Commissions |
| Direct Expenses | 6104 | Other Direct Costs |
| Expenses | 7101 | Wages & Salaries |
| Expenses | 7102 | Staff Costs |
| Expenses | 7103 | Premises Expenses |
| Expenses | 7104 | Light & Heat |
| Expenses | 7105 | Motor Expenses |
| Expenses | 7106 | Travel Expenses |
| Expenses | 7107 | Bank Fees and Charges |
| Expenses | 7108 | Interest Paid |
| Expenses | 7109 | Printing, Postage and Stationery |
| Expenses | 7110 | Advertising and PR |
| Expenses | 7111 | Telephone and Internet |
| Expenses | 7112 | Legal and Professional Fees |
| Expenses | 7113 | Subscriptions |
| Expenses | 7114 | Entertainment |
| Expenses | 7115 | Equipment Hire |
| Expenses | 7116 | Insurance |
| Expenses | 7117 | Bad Debt |
| Expenses | 7118 | Repair and Maintenance |
| Expenses | 7119 | Office Machine Maintenance |
| Expenses | 7120 | Donations |
| Expenses | 7121 | Miscellaneous Expense |
| Other Expense | 7201 | Other Expense |
| Other Expense | 7202 | Depreciation |
| Finance Cost | 7301 | Finance Cost |
| Other Income | 4201 | Other Income |
| Taxation | 7401 | Taxation |

### Safe implementation boundary

1. Verify the complete source manifest, destination tenant/company, active
   Currency Master choices and control/manual-posting classification.
2. Dry-run against existing codes and IDs. Report exact matches separately
   from conflicting codes, hierarchy differences and duplicate input rows.
   Never merge by name or rewrite account identities/history automatically.
3. Resolve Cash and Bank section mapping explicitly: the current governed
   model allows one Cash & Bank policy per company. Do not insert a competing
   policy for 2309 or reparent existing managed Bank accounts silently.
4. Persist the reviewed hierarchy through the existing API/service/repository
   boundary with scoped authorization, audit, idempotency and transaction
   safety. Use only additive migrations if schema changes prove necessary.
5. Expose the same persisted identities in Chart of Accounts, Nominals,
   Section Management and eligible Bank Payment/Receipt selectors. Headers,
   inactive accounts, Bank settlement accounts and protected controls are not
   ordinary payment offsets. Bank currencies must not be guessed from names.
6. Verify isolated import/replay/conflict/rollback tests, authorization, API
   consistency, frontend selection and refresh persistence before activation.

The requested Payment form follow-up is still pending: plain Details text,
visible Posting/Value Dates, authenticated company scope without a Company
field, and persisted approver/project/location choices. Do not substitute
prototype company selection or mock directories for those dependencies.

## Superseded prototype proposal — do not import

This is a proposal extracted from the existing approved prototype, not an
import or an assertion that these are the company's real accounts. The live
Chart of Accounts now displays PostgreSQL records, not these fixture rows.
No prototype balance, opening journal, Bank identity or tax rate is imported.

Before activation, confirm the intended company, Category/Section mappings,
code allocation ranges, currency and manual-posting/control classification.
Existing persisted identities must be matched before adding records. Account
names alone must never drive destructive deduplication.

| Prototype code | Nominal name | Type | Prototype section | Review requirement |
| --- | --- | --- | --- | --- |
| 1100 | Cash in hand | Asset | Current assets | Cash & Bank workflow; match existing accounts first |
| 1110 | Meridian Commercial - current | Asset | Current assets | Sample Bank identity; exclude from automatic import |
| 1200 | Trade receivables - local | Asset | Current assets | Review receivables control/subledger restrictions |
| 1210 | Trade receivables - export | Asset | Current assets | Review receivables control/subledger restrictions |
| 1300 | Raw material inventory | Asset | Inventory | Review inventory control/posting ownership |
| 1310 | Finished goods inventory | Asset | Inventory | Review inventory control/posting ownership |
| 1400 | Advance income tax | Asset | Current assets | Confirm tax classification and section |
| 1500 | Plant and machinery | Asset | Non-current assets | Review fixed-asset control/posting ownership |
| 1510 | Accumulated depreciation - plant | Asset | Non-current assets | Confirm contra-asset classification and posting rules |
| 2100 | Trade payables | Liability | Current liabilities | Review payables control/subledger restrictions |
| 2150 | Accrued expenses | Liability | Current liabilities | Confirm section and posting eligibility |
| 2200 | Output tax payable | Liability | Current liabilities | Confirm tax control and settlement ownership |
| 2300 | Long-term loan - Meridian | Liability | Non-current liabilities | Confirm real company obligation and name |
| 3100 | Issued share capital | Equity | Equity | Confirm company capital account and posting authority |
| 3200 | Retained earnings | Equity | Equity | Review year-end/system control restrictions |
| 4100 | Revenue - manufactured goods | Revenue | Trading | Confirm revenue section and dimensions |
| 4200 | Revenue - services | Revenue | Trading | Confirm revenue section and dimensions |
| 5100 | Cost of materials consumed | Expense | Cost of sales | Review inventory/production posting ownership |
| 5200 | Manufacturing overhead | Expense | Cost of sales | Confirm section and dimensions |
| 6100 | Salaries and wages | Expense | Operating expenses | Preserve payroll posting integration; confirm dimensions |
| 6200 | Utilities and fuel | Expense | Operating expenses | Confirm section and dimensions |
| 6300 | Depreciation charge | Expense | Operating expenses | Review fixed-asset posting ownership |
| 6400 | Finance cost - interest | Expense | Finance cost | Confirm section and posting eligibility |

## Duplicate audit

The inspected local company has five legacy Bank nominal accounts sharing the
label Bank Operating Test, but all five have distinct Bank identifier hashes
and a combined 20 immutable Bank events. They were NOT removed. No duplicate
account codes were found; the company-scoped account code constraint prevents
them. New governed ordinary nominal creation and editing reject normalized
same-section duplicate names transactionally. Preserve all historical IDs.

## Local test setup versus business setup

The guarded UAT provisioner can create explicitly named Synthetic UAT sections
for all five account types using NEXORA_GENERAL_NOMINAL_UAT_SETUP=true. These
are test code policies, not an adoption of the proposed catalog. It creates no
nominals, balances or journals. NEXORA_GENERAL_NOMINAL_UAT_CALENDAR_YEAR=2026
adds a controlled reference-numbering calendar only; no financial posting
period is opened. The script refuses non-local/non-test databases and requires
NEXORA_ENVIRONMENT=uat and NEXORA_UAT_CONFIRM=nexora-r06-uat.

Production/business catalog import remains pending explicit review. Do not
silently turn subledger controls into general Bank offset accounts.

## 2026-10-21 — Read-only review of the 227 imported nominals

### Scope and conclusion

Inspected the existing **Nexora R06 UAT Company**, tenant `nexora-r06-uat`,
company `nexora-r06-uat-company`, in `nexora_source_test`. Source reads used
explicit PostgreSQL READ ONLY transactions. **No financial account, approval,
permission, configuration or audit record was modified, activated or deleted.**

The 227 are **drafts awaiting posting-ownership review**, not 227 submitted
requests stuck in an approver's queue. Every account has account status
`inactive`, nominal state `draft`, classification `review_required`, review
version 1 and one creation event. There are **zero classification events** and
no submitted/decided actors for these accounts. Company adoption intentionally
creates this state; the import did not supply posting-ownership decisions.

No confirmed structural invalidity or exact persisted duplicate was found in
these 227. That is **not** a certification that every account is appropriate for
the business or safe as a Bank offset. All remain ineligible until appropriately
reviewed and approved; module-controlled accounts must not be forced through the
ordinary nominal approval path.

### Read-only evidence and completeness

| Check | Observed result |
| --- | --- |
| Adopted catalog | Standard Chart of Accounts, `2026-10-20-v1`, `chart-of-accounts-review.xlsx` |
| Adoption timestamp | 2026-10-20 12:41:40 UTC |
| Definition totals | 14 categories, 78 sections, 234 distinct nominal definitions |
| Company nominal drafts in scope | **227**, all USD and unchanged |
| Source manifest comparison | All 227 code/name/section tuples match the repository's approved JSON and persisted template |
| Exact duplicate codes / normalized names among these drafts | **0 / 0** |
| Blank/oversized mandatory names, malformed six-digit codes, code/section mismatch | **0** detected |
| Missing/inactive currency, broken/inactive parent/category, type mismatch | **0** detected |
| Missing governed profile / active section numbering policy | **0** detected |
| Unexpected header/system/reconciliation/nonmanual flags in these 227 | **0** detected |
| Nominal creation events | Exactly one per imported nominal; no subsequent review/submit/approval events |
| Adoption event bound to matching platform audit event/actor | **1**, present |
| Existing Payment / Receipt line references to these imported accounts | **0 / 0** |
| Existing journal line usage of these imported accounts | **0** |
| Blank optional descriptions / empty required-dimension lists | **227 / 227**; neither is a mandatory-field failure under current contracts |
| Source accounts / Bank accounts / Payments / Receipts / journals | **353 / 17 / 3 / 0 / 0**, unchanged |
| Source general-nominal events / platform audit events | **243 / 334**, unchanged during this investigation |

Descriptions and mandatory Project/Location/department dimensions were not
provided by this catalog. Finance must decide whether the business requires them.
The current ordinary nominal edit contract exposes name, currency and description,
not a new per-account required-dimension editor. Do not invent required dimensions
or treat blank optional descriptions as evidence that the import failed.
All USD currencies came from the explicit company adoption; active Currency Master
existence is verified, but business suitability of USD for every nominal is not
established by that check.

### Confirmed source-quality and duplication findings

**Three explicit label uncertainties remain in the approved source metadata:**

| Code | Persisted name | Recorded concern / next action |
| --- | --- | --- |
| 120802 | Faraz Payable | Confirm personal name and spelling against the original source and business obligation. |
| 711304 | Whop*Travelling Trader Subscription | Confirm merchant label, punctuation and spacing. |
| 711312 | Magicfruit Subscription | Vendor label was unclear in the reduced screenshot; obtain the original/export. |

A further **189** drafts retain the generic note “Transcribed from reduced image;
verify code and exact label.” **35** have no source-review note. Thus **192/227**
have a recorded source-quality warning, but a warning is not a proven wrong
account. Lack of a warning is not independent business validation either.

**Repeated screenshot occurrences were already represented once per code:**

| Code | Persisted name | Evidence |
| --- | --- | --- |
| 510104 | Daily Wages Labour | Screenshot 1 row 99 and Screenshot 2 row 1; one company nominal. |
| 711306 | Figma Subscription | Screenshot 2 row 95 and Screenshot 3 row 8; one company nominal. |
| 711314 | Google Play | Screenshot 2 row 94 and Screenshot 3 row 7; one company nominal. |

These three repeated occurrences explain **237 source occurrences versus 234
distinct definitions**. Seven definitions in Cash and Bank (230901–230907) remain
explicit Bank reference definitions, not missing ordinary imports; 234 minus seven
equals the 227 drafts. Do not create replacement accounts to reach 237 unique codes.

Outside these 227, five pre-existing Bank nominals share the name **Bank Operating
Test**, with codes `BANK-3b81fd13`, `BANK-5a33edd6`, `BANK-5d34c334`,
`BANK-7237f6f2`, `BANK-7a785ddc`. These are distinct existing identities, not
duplicate imported codes. Name-only similarity is insufficient grounds to merge
or delete them. No deduplication was performed. Matching section/leaf names such
as Travel Expenses are also not automatically duplicates: headers are not postable.

### Business ownership / reporting concerns — review, not automatic classification

The following are **inferences from names and hierarchy**, not confirmed invalid
records or persisted posting classifications. Confirm owners, integration,
reporting, currency and sign conventions before choosing ordinary versus
module-controlled. The inventory below marks these review candidates without
changing any database flags.

| Area | Account codes and names requiring focused review | Why it matters |
| --- | --- | --- |
| Receivables/payables and payment instruments | 120101 Trade Creditors; 120103 Post-Dated Cheques Issued; 120201 Other Creditors; 230201 Debtors; 230202 Allowance for bad debts; 230203 Post-Dated Cheques Received; 230301 Other Debtors; 230602 Undeposited Funds | May be subledger, instrument or clearing controls. Do not bypass supplier/customer/instrument workflows. |
| Tax | 120102 Customer Withholding Tax; 120301 General Sales Tax; 120401 WHT Deductions; 120501 Current Tax Liability; 230801 Withholding Income Tax (Advance); 740101 Income Tax; 740102 Corporation Tax | Confirm tax ownership, settlement and reporting; account names alone do not authorize ordinary offsets. |
| Payroll | 120603 Payroll payable; 120701 Payroll Tax and Social Security; 710101–710108 Wages & Salaries through Employers Pensions (all exact names below) | Preserve HR/payroll liability and expense posting ownership; do not duplicate payroll postings through Bank lines. |
| Stock/cost | 230101 Stock; 510206 Opening Stock; 510207 Closing Stock | Confirm inventory/cost-of-sales ownership rather than activating controls as free-form offsets. |
| Fixed assets / depreciation | 210101–210602 tangible-asset cost/addition/accumulated-depreciation accounts; 220101 Goodwill; 220201 Intangible Assets; 220301 Investments; 220401 Licences; 720201–720207 depreciation accounts | Confirm asset register, depreciation and investment posting ownership. Not all asset accounts are automatically control accounts. |
| FX and rounding | 710705 Round Off; 710706 Realised Exchange Gains; 710707 Realised Exchange Losses; 710708 Exchange Revaluation Gains; 710709 Exchange Revaluation Losses | Could be centrally generated Finance postings. Gains are currently under expense type; confirm whether intentional contra-expense/reporting design. |
| Current/non-current placement | 110101 Accruals; 220601 Prepayments; 220701 Accrued Income versus 230701 Prepaid Expense, 230702 Prepaid Insurance, 230703 Prepaid rent | Validate maturity/business reporting. Same general purpose across categories is a review issue, not proof of duplication. |
| Possible category/sign overlap | 220501 Other intangible assets versus 220201 Intangible Assets and 220502 Other Non-current Assets; 710701 Finance costs versus 730101 Loan Interest paid; 711207 Management Charges Payable under Expenses | Confirm classification and whether overlapping accounts are intentionally separate. No reparenting or retyping was done. |
| Contra-accounts / mixed gain-loss | 410301 Discount Allowed; 410302 Sale Receipts Discount; 410303 Retail Margin Sale; 410304 Trade Offer Sale; 510501 Discount Received; 510502 Purchase Payment Discount; 510503 Retail Margin Purchase; 510504 Trade Offer Purchase; 720102 Loss (Gain) on disposal of assets | Revenue/expense placement may intentionally support contra balances. Do not “correct” account type from the label alone. |
| Capital structure | 310101 Capital; 310103 Ordinary shares; 310104 Paid in capital or surplus; 310105/310106 Partner Capital (A)/(B); 310107/310108 Partner Distributions (A)/(B); 310109 Drawings; 310110 Share Capital | Generic catalog includes alternative legal/business structures. Finance must choose what the actual company uses; not every definition needs activation. |

Vendor subscriptions, generic Subscriptions/Software Subscriptions and similar
expense detail accounts can coexist legitimately. Decide granularity and actual
business use; they are not exact duplicate names/codes.

**Correction boundary:** adopted code/name identity is checked against the approved
template during classification by `guard_chart_company_node()`. Source spelling,
code or hierarchy corrections therefore need a deliberate catalog/identity
maintenance decision; do not blindly rename imported identities or rewrite applied
migrations to get past that guard. Optional description/currency maintenance is
different from a source identity correction. Resolve the three uncertain labels
before using them; leave uncertain or unused definitions unapproved.

### Existing approval workflow — how an authorized Finance user proceeds

1. Open `http://127.0.0.1:3000/#/finance/chart-of-accounts`, select **R06-UAT**
   explicitly, search by code/name and open the nominal detail.
2. Reviewer needs company access, live `finance.nominal.read`,
   `finance.chart_template.classify` and `finance.nominal.update` grants with
   appropriate tenant/company scope; active role/user/assignment checks apply.
   Review source label, owner, company currency and integration. Choose
   **Ordinary nominal** only for a genuine manual-posting account, check the
   confirmation and **Save posting review**. This appends classification/audit
   evidence and increments versions; it does **not** activate the account.
3. If it is a protected/subledger/system-owned account, choose **Module-controlled**
   when the responsible owner has confirmed that decision. Ordinary submission
   remains blocked. Its owning module/Finance integration is a separate prerequisite;
   do not reclassify it as ordinary merely to populate a Bank dropdown.
4. For a reviewed ordinary draft, a user with live company-scoped
   `finance.nominal.submit` selects **Submit for approval** → **Confirm submit**.
   The server moves it to `pending_approval`; it is still inactive and absent
   from both Bank selectors.
5. An independent authorized checker with company access,
   `finance.nominal.read` and `finance.nominal.approve` opens the nominal and
   selects **Approve** → **Approve & Close**. The checker must differ from maker/
   submitter unless using the established live global super-admin override.
   The Bank-only delegated self-approval grant does **not** grant Finance nominal
   approval rights. Ordinary approval needs no typed rejection reason; rejection
   requires a reason. Existing override and immutable audit controls remain.
6. Approval atomically sets the nominal and account active and appends the event/
   platform audit. It creates **no journal** and does not grant Bank permissions.
   Bank Payment/Receipt must use the same tenant/company and appropriate Bank
   read/create/update/submit permissions. Use **Refresh nominal accounts** or
   reload; search code/name if outside the first bounded 100 results.

The POST classification endpoint is
`/api/v1/finance/chart_templates/company_nominals/{nominalId}/classification`;
normal submit/decision endpoints are
`/api/v1/finance/nominals/{nominalId}/submit` and `/decision`.
Use the generated client/UI, CSRF, trusted Origin, idempotency key and current
quoted If-Match/expected_version. Never issue ad hoc SQL approvals.
The global override is an audited exception, not a substitute for normal review.
There is no need to approve all 227; review and activate only genuinely required
ordinary accounts in small, checked batches.

### Complete account-level inventory

All rows below are **USD / draft / inactive / review_required**. All pass the
structural checks listed above and remain unavailable in both Bank selectors.
Markers are review notes, **not** an implemented validity decision or account
classification:

- **R**: ordinary source/ownership/currency/applicability review still required
  (applies to every row, including rows with other markers).
- **T**: generic reduced-image transcription warning (189 accounts).
- **U**: specific unresolved source label (three accounts).
- **D**: repeated screenshot occurrence, already one persisted nominal (three accounts).
- **O**: integration/owner review candidate (65 accounts, inferred; not automatically module-controlled).
- **M**: business applicability, category/maturity/contra-sign review candidate
  (29 accounts, inferred; may overlap O).

### Non-Current Liabilities — 6 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 110101 | Accruals | 1101 · Accruals | T, M |
| 110201 | Deferred Income | 1102 · Deferred Income | T |
| 110301 | Long term Loans payable | 1103 · Long term Loans Payable | T |
| 110401 | Other non-current liabilities | 1104 · Other Non-Current Liabilities | T |
| 110501 | Provision for liabilities | 1105 · Provision for Liabilities | T |
| 110601 | Shareholder Loan Payable | 1106 · Shareholder Loan Payable | T |

### Current Liabilities — 14 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 120101 | Trade Creditors | 1201 · Trade Creditors | T, O |
| 120102 | Customer Withholding Tax | 1201 · Trade Creditors | T, O |
| 120103 | Post-Dated Cheques Issued | 1201 · Trade Creditors | T, O |
| 120201 | Other Creditors | 1202 · Other Creditors | T, O |
| 120301 | General Sales Tax | 1203 · Sales Tax Account | T, O |
| 120401 | WHT Deductions | 1204 · Withholding Income Tax (Deductions) | T, O |
| 120501 | Current Tax Liability | 1205 · Provision of Taxation | T, O |
| 120601 | Insurance Payable | 1206 · Accruals and Payables | T, O |
| 120602 | Loan Payable | 1206 · Accruals and Payables | T, O |
| 120603 | Payroll payable | 1206 · Accruals and Payables | T, O |
| 120604 | Expenses Payable | 1206 · Accruals and Payables | T, O |
| 120701 | Payroll Tax and Social Security | 1207 · Payroll Tax and Social Security | T, O |
| 120801 | Short Term Loans Payable | 1208 · Short-term Loans Payable | T, O |
| 120802 | Faraz Payable | 1208 · Short-term Loans Payable | U, O |

### Tangible Assets — 16 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 210101 | Property | 2101 · Land and Buildings | T, O |
| 210102 | Accumulated Depreciation Property | 2101 · Land and Buildings | T, O |
| 210201 | Plant and Machinery | 2102 · Plant and Machinery | T, O |
| 210202 | Plant and Machinery Additions | 2102 · Plant and Machinery | T, O |
| 210203 | Accumulated Depreciation Plant and Machinery | 2102 · Plant and Machinery | T, O |
| 210301 | Office Equipments | 2103 · Office Equipments | T, O |
| 210302 | Office Equipments Additions | 2103 · Office Equipments | T, O |
| 210303 | Accumulated Depreciation Office Equipments | 2103 · Office Equipments | T, O |
| 210401 | Furniture and Fixtures | 2104 · Furniture and Fixtures | T, O |
| 210402 | Furniture and Fixtures Additions | 2104 · Furniture and Fixtures | T, O |
| 210403 | Accumulated Depreciation Furniture and Fixture | 2104 · Furniture and Fixtures | T, O |
| 210501 | Vehicles | 2105 · Vehicles | T, O |
| 210502 | Vehicles Additions | 2105 · Vehicles | T, O |
| 210503 | Accumulated Depreciation Vehicles | 2105 · Vehicles | T, O |
| 210601 | Other Tangible Assets | 2106 · Other Tangible Assets | T, O |
| 210602 | Accumulated Depreciation Other Tangible Assets | 2106 · Other Tangible Assets | T, O |

### Non-Current Assets — 11 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 220101 | Goodwill | 2201 · Goodwill | T, O |
| 220201 | Intangible Assets | 2202 · Intangible Assets | T, O |
| 220301 | Investments | 2203 · Investments | T, O |
| 220401 | Licences | 2204 · Licences | T, O |
| 220501 | Other intangible assets | 2205 · Other Non-Current Assets | T, M |
| 220502 | Other Non-current Assets | 2205 · Other Non-Current Assets | T, M |
| 220601 | Prepayments | 2206 · Prepayments | T, M |
| 220701 | Accrued Income | 2207 · Accrued Income | T, M |
| 220801 | Security Deposits | 2208 · Security Deposits | T |
| 220802 | Rent Deposits | 2208 · Security Deposits | T |
| 220803 | Other Deposits | 2208 · Security Deposits | T |

### Current Assets — 17 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 230101 | Stock | 2301 · Stock | T, O |
| 230201 | Debtors | 2302 · Debtors | T, O |
| 230202 | Allowance for bad debts | 2302 · Debtors | T, O |
| 230203 | Post-Dated Cheques Received | 2302 · Debtors | T, O |
| 230301 | Other Debtors | 2303 · Other Debtors | T, O |
| 230401 | Investments - Other | 2304 · Investments - Other | T |
| 230501 | Loans To Directors | 2305 · Advances and receivables | T |
| 230502 | Loans to Employees | 2305 · Advances and receivables | T |
| 230503 | Loans to Others | 2305 · Advances and receivables | T |
| 230504 | Loans to Shareholders | 2305 · Advances and receivables | T |
| 230601 | Other current assets | 2306 · Other current assets | T |
| 230602 | Undeposited Funds | 2306 · Other current assets | T, O |
| 230603 | Research and Development Costs | 2306 · Other current assets | T |
| 230701 | Prepaid Expense | 2307 · Prepaid expenses and deposit | T, M |
| 230702 | Prepaid Insurance | 2307 · Prepaid expenses and deposit | T, M |
| 230703 | Prepaid rent | 2307 · Prepaid expenses and deposit | T, M |
| 230801 | Withholding Income Tax (Advance) | 2308 · Withholding Income Tax (Advance) | T, O |

### Capital & Reserves — 11 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 310101 | Capital | 3101 · Capital | T, M |
| 310103 | Ordinary shares | 3101 · Capital | T, M |
| 310104 | Paid in capital or surplus | 3101 · Capital | T, M |
| 310105 | Partner Capital (A) | 3101 · Capital | T, M |
| 310106 | Partner Capital (B) | 3101 · Capital | T, M |
| 310107 | Partner Distributions (A) | 3101 · Capital | T, M |
| 310108 | Partner Distributions (B) | 3101 · Capital | T, M |
| 310109 | Drawings | 3101 · Capital | T, M |
| 310110 | Share Capital | 3101 · Capital | T, M |
| 310201 | General Reserves | 3102 · General Reserves | T |
| 310301 | Accumulated Reserves | 3103 · Accumulated Reserves | T |

### Income — 14 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 410101 | IT & Software Services Income | 4101 · Product Sale | T |
| 410102 | Sales Type A | 4101 · Product Sale | T |
| 410103 | Sale Type B | 4101 · Product Sale | T |
| 410104 | Sale Type C | 4101 · Product Sale | T |
| 410105 | Sale Type D | 4101 · Product Sale | T |
| 410201 | Fees Income | 4102 · Fees Income | T |
| 410202 | Fees Income - A | 4102 · Fees Income | T |
| 410203 | Fees Income - B | 4102 · Fees Income | T |
| 410204 | Fees Income - C | 4102 · Fees Income | T |
| 410205 | Fees Income - D | 4102 · Fees Income | T |
| 410301 | Discount Allowed | 4103 · Discount Allowed | T, M |
| 410302 | Sale Receipts Discount | 4103 · Discount Allowed | T, M |
| 410303 | Retail Margin Sale | 4103 · Discount Allowed | T, M |
| 410304 | Trade Offer Sale | 4103 · Discount Allowed | T, M |

### Other Income — 5 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 420101 | Dividend income | 4201 · Other Income | R |
| 420102 | Interest earned | 4201 · Other Income | R |
| 420103 | Investment Income | 4201 · Other Income | R |
| 420104 | Other Income | 4201 · Other Income | R |
| 420105 | Rent received | 4201 · Other Income | R |

### Cost of Sales — 17 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 510101 | Cost of Labour | 5101 · Cost of Labour | T |
| 510103 | Productive Labour | 5101 · Cost of Labour | T |
| 510104 | Daily Wages Labour | 5101 · Cost of Labour | T, D |
| 510105 | Sub Contractors | 5101 · Cost of Labour | T |
| 510201 | Supplies and materials | 5102 · Supplies and Materials | T |
| 510202 | Cost of IT & Software Services | 5102 · Supplies and Materials | T |
| 510203 | Materials imported | 5102 · Supplies and Materials | T |
| 510204 | Purchases | 5102 · Supplies and Materials | T |
| 510205 | Miscellaneous Purchases | 5102 · Supplies and Materials | T |
| 510206 | Opening Stock | 5102 · Supplies and Materials | T, O |
| 510207 | Closing Stock | 5102 · Supplies and Materials | T, O |
| 510301 | Equipment rental | 5103 · Equipment Rental | T |
| 510401 | Other Cost of Sales | 5104 · Other Cost of Sales | T |
| 510501 | Discount Received | 5105 · Discount Received | T, M |
| 510502 | Purchase Payment Discount | 5105 · Discount Received | T, M |
| 510503 | Retail Margin Purchase | 5105 · Discount Received | T, M |
| 510504 | Trade Offer Purchase | 5105 · Discount Received | T, M |

### Direct Expenses — 9 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 610101 | Import Duty | 6101 · Import Duty | T |
| 610201 | Shipping, Freight and Delivery | 6102 · Shipping, Freight and Delivery | T |
| 610202 | Shipping | 6102 · Shipping, Freight and Delivery | T |
| 610203 | Freight | 6102 · Shipping, Freight and Delivery | T |
| 610204 | Delivery | 6102 · Shipping, Freight and Delivery | T |
| 610205 | Packaging | 6102 · Shipping, Freight and Delivery | T |
| 610206 | Postage | 6102 · Shipping, Freight and Delivery | T |
| 610301 | Sales Commissions | 6103 · Sales Commissions | T |
| 610401 | Other Direct Costs | 6104 · Other Direct Costs | T |

### Expenses — 95 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 710101 | Wages & Salaries | 7101 · Wages & Salaries | T, O |
| 710102 | Directors Salaries | 7101 · Wages & Salaries | T, O |
| 710103 | Staff Salaries | 7101 · Wages & Salaries | T, O |
| 710104 | Wages - Regular | 7101 · Wages & Salaries | T, O |
| 710105 | Wages - Casual | 7101 · Wages & Salaries | T, O |
| 710106 | Employer Social Security | 7101 · Wages & Salaries | T, O |
| 710107 | Employers Provident Fund | 7101 · Wages & Salaries | T, O |
| 710108 | Employers Pensions | 7101 · Wages & Salaries | T, O |
| 710201 | Staff Costs | 7102 · Staff Costs | T |
| 710202 | Uniforms | 7102 · Staff Costs | T |
| 710203 | Training Costs | 7102 · Staff Costs | T |
| 710204 | Recruitment Expenses | 7102 · Staff Costs | T |
| 710301 | Premises Expenses | 7103 · Premises Expenses | T |
| 710302 | Rent | 7103 · Premises Expenses | T |
| 710303 | Water Rates | 7103 · Premises Expenses | T |
| 710304 | General Rates | 7103 · Premises Expenses | T |
| 710305 | Premises Insurance | 7103 · Premises Expenses | T |
| 710306 | Cleaning | 7103 · Premises Expenses | T |
| 710307 | Municipal Corporation charges | 7103 · Premises Expenses | T |
| 710308 | Other Heating Costs | 7103 · Premises Expenses | T |
| 710401 | Light & Heat | 7104 · Light & Heat | T |
| 710402 | Electricity | 7104 · Light & Heat | T |
| 710403 | Gas | 7104 · Light & Heat | T |
| 710404 | Oil - Heating | 7104 · Light & Heat | T |
| 710501 | Motor Expenses | 7105 · Motor Expenses | T |
| 710502 | Vehicle Fuel | 7105 · Motor Expenses | T |
| 710503 | Vehicle Repair and Servicing | 7105 · Motor Expenses | T |
| 710504 | Vehicle Licences | 7105 · Motor Expenses | T |
| 710505 | Vehicle Insurance | 7105 · Motor Expenses | T |
| 710506 | Miscellaneous Motor Expenses | 7105 · Motor Expenses | T |
| 710507 | Parking Tickets | 7105 · Motor Expenses | T |
| 710601 | Travel Expenses | 7106 · Travel Expenses | T |
| 710602 | Mileage Claims | 7106 · Travel Expenses | T |
| 710603 | Petrol Allowance | 7106 · Travel Expenses | T |
| 710604 | Travelling | 7106 · Travel Expenses | T |
| 710605 | Car Hire | 7106 · Travel Expenses | T |
| 710606 | Train / Air Fare | 7106 · Travel Expenses | T |
| 710607 | Hotels | 7106 · Travel Expenses | T |
| 710608 | Subsistence | 7106 · Travel Expenses | T |
| 710701 | Finance costs | 7107 · Bank Fees and Charges | T, M |
| 710702 | Bank Charges | 7107 · Bank Fees and Charges | T |
| 710703 | Bank Fees | 7107 · Bank Fees and Charges | T |
| 710704 | Currency Charges | 7107 · Bank Fees and Charges | T |
| 710705 | Round Off | 7107 · Bank Fees and Charges | T, O |
| 710706 | Realised Exchange Gains | 7107 · Bank Fees and Charges | T, O |
| 710707 | Realised Exchange Losses | 7107 · Bank Fees and Charges | T, O |
| 710708 | Exchange Revaluation Gains | 7107 · Bank Fees and Charges | T, O |
| 710709 | Exchange Revaluation Losses | 7107 · Bank Fees and Charges | T, O |
| 710801 | Hire Purchase Interest | 7108 · Interest Paid | T |
| 710802 | Overdraft Interest | 7108 · Interest Paid | T |
| 710901 | Printing, postage and stationery | 7109 · Printing, Postage and Stationery | T |
| 710902 | Printing | 7109 · Printing, Postage and Stationery | T |
| 710903 | Postage and Carriage | 7109 · Printing, Postage and Stationery | T |
| 710904 | Stationery | 7109 · Printing, Postage and Stationery | T |
| 711001 | Advertising and PR | 7110 · Advertising and PR | T |
| 711002 | Advertising | 7110 · Advertising and PR | T |
| 711003 | Sales Promotions | 7110 · Advertising and PR | T |
| 711004 | Gifts and Samples | 7110 · Advertising and PR | T |
| 711005 | P.R. Literature and Brochures | 7110 · Advertising and PR | T |
| 711006 | Books etc. | 7110 · Advertising and PR | T |
| 711101 | Telephone and Fax | 7111 · Telephone and Internet | T |
| 711102 | Internet charges | 7111 · Telephone and Internet | T |
| 711103 | Mobile Phone Charges | 7111 · Telephone and Internet | T |
| 711201 | Legal and Professional Fees | 7112 · Legal and Professional Fees | T |
| 711202 | Legal Fees | 7112 · Legal and Professional Fees | T |
| 711203 | Audit Fees | 7112 · Legal and Professional Fees | T |
| 711204 | Accountancy Fees | 7112 · Legal and Professional Fees | T |
| 711205 | Consultancy Fees | 7112 · Legal and Professional Fees | T |
| 711206 | Professional Fees | 7112 · Legal and Professional Fees | T |
| 711207 | Management Charges Payable | 7112 · Legal and Professional Fees | T, M |
| 711301 | Subscriptions | 7113 · Subscriptions | R |
| 711302 | Software Subscriptions | 7113 · Subscriptions | R |
| 711303 | Anthropic Claude Subscription | 7113 · Subscriptions | T |
| 711304 | Whop*Travelling Trader Subscription | 7113 · Subscriptions | U |
| 711305 | Massive.Com Data API Subscription | 7113 · Subscriptions | T |
| 711306 | Figma Subscription | 7113 · Subscriptions | T, D |
| 711307 | Cursor AI Powered Data API Subscription | 7113 · Subscriptions | R |
| 711308 | HIGGSFIELD Subscription | 7113 · Subscriptions | R |
| 711309 | GODADDY Subscription | 7113 · Subscriptions | R |
| 711312 | Magicfruit Subscription | 7113 · Subscriptions | U |
| 711313 | Heygen Technology Inc. Subscription | 7113 · Subscriptions | T |
| 711314 | Google Play | 7113 · Subscriptions | T, D |
| 711315 | Proton VPN | 7113 · Subscriptions | R |
| 711401 | Entertainment | 7114 · Entertainment | R |
| 711402 | Canteen Expenses | 7114 · Entertainment | R |
| 711403 | Staff Meals | 7114 · Entertainment | R |
| 711404 | Staff Party | 7114 · Entertainment | R |
| 711405 | Refreshments | 7114 · Entertainment | R |
| 711501 | Equipment Hire | 7115 · Equipment Hire | R |
| 711601 | Insurance | 7116 · Insurance | R |
| 711701 | Bad Debt | 7117 · Bad Debt | R |
| 711801 | Repair and Maintenance | 7118 · Repair and Maintenance | R |
| 711901 | Office Machine Maintenance | 7119 · Office Machine Maintenance | R |
| 712001 | Donations | 7120 · Donations | R |
| 712101 | Miscellaneous Expense | 7121 · Miscellaneous Expense | R |

### Other Expense — 9 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 720101 | Other Expense | 7201 · Other Expense | R |
| 720102 | Loss (Gain) on disposal of assets | 7201 · Other Expense | M |
| 720201 | Depreciation Property | 7202 · Depreciation | O |
| 720202 | Depreciation Plant and Machinery | 7202 · Depreciation | O |
| 720203 | Depreciation Office Equipments | 7202 · Depreciation | O |
| 720204 | Depreciation Furniture and Fixture | 7202 · Depreciation | O |
| 720205 | Depreciation Vehicles | 7202 · Depreciation | O |
| 720206 | Depreciation Other Tangible Assets | 7202 · Depreciation | O |
| 720207 | Depreciation | 7202 · Depreciation | O |

### Finance Cost — 1 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 730101 | Loan Interest paid | 7301 · Finance Cost | M |

### Taxation — 2 accounts

| Code | Persisted nominal name | Section | Review markers |
| --- | --- | --- | --- |
| 740101 | Income Tax | 7401 · Taxation | O |
| 740102 | Corporation Tax | 7401 · Taxation | O |

### Verification and no-write guarantee

- Source SQL was read-only. Structural checks, exact code/name comparison and
  duplicate scans were observed against PostgreSQL; business applicability remains
  a manual Finance decision. No source workflow was executed as a “test.”
- This turn reran **47 focused unit**, **37 integration**, **41 security** tests,
  all passed. Integration used `nexora_chart_template_ct01_20261020`, not source.
- Fresh isolated browser test **passed** again:
  `tests/e2e/bank-nominal-directory.spec.ts` used the same approved catalog in
  `nexora_bank_context_e2e_isolated_20261021_review_a`, API 4012. It demonstrated
  the blank/pending state, real Finance posting review/submission/independent
  approval of test-only **711301 · Subscriptions**, appearance of that same account
  in both Bank selectors, draft save/reload/transaction-detail display, exact
  persisted line IDs/amounts, four immutable nominal events and no journal.
  This is verification evidence, **not source authorization to activate 711301**.
- No product functionality change was necessary: the existing classification,
  approval and Bank projection behaved as intended. Only this audit document and
  the implementation handoff were updated. Earlier typecheck/build results are
  historical checkpoints, not new executions implied by this documentation update.
- Final source lifecycle/event/count comparison is recorded in the implementation
  handoff; inherited repository-wide lint issues remain outside this read-only audit.
