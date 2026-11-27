# Approved treasury policy for new-company templates

The user approved this proposal on 27 November 2026. Automatic company setup
now initializes it in the existing PostgreSQL Transfer/FX policy tables, with
immutable audit evidence and the existing live policy-management permission.
Existing Transfer/FX configuration remains authoritative. Railway rollout is
still blocked by expired authentication; no production policy was changed.

The baseline chart supplies these distinct eligible nominal definitions:

| Transfer/FX role | Nominal | Classification |
| --- | --- | --- |
| FX gain | 400201 — Realized Exchange Gain | Revenue |
| FX loss | 500201 — Realized Exchange Loss | Expense |
| Bank charge | 500301 — Bank Charges | Expense |
| Rounding adjustment | 500302 — Rounding Adjustments | Expense |

Approved automatic mapping: create the company's existing
`bank_transfer_fx_policy` once from these template roles, with rounding tolerance
`0`. A zero tolerance refuses nonzero FX rounding differences rather than
authorizing a write-off. Independent transaction approval and posting authority
remain mandatory. Never replace an existing policy or change posted transfers.

Automatic approval review initially required explicit authorization for the
treasury policy and tolerance. The user's approval resolves that requirement.
Existing policies are never updated by company initialization. Older custom
templates without the optional bank-charge/rounding roles retain Finance's
existing governed manual configuration workflow.
