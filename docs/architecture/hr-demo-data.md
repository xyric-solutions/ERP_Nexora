# Fictional HR UAT data

Dataset: `hr-fictional-people-v1`, in `nexora-r06-uat-company` only. Names and
business descriptions are fictional, emails use reserved `example.test` domains,
and contact numbers are explicitly marked as demonstrations. No national identity
documents, real bank details or legal tax rates are fabricated.

| Person | Role | Retained workflow state |
| --- | --- | --- |
| Ayesha Khan | HR Manager | Independently approved profile and hire |
| Hamza Ahmed | Software Engineer | Independently approved hire; assigned office shift |
| Fatima Noor | Finance Executive | Independently approved profile and hire |
| Bilal Hassan | Client Support Specialist | Independently approved profile and hire |
| Zainab Iqbal | Sales Executive | Profile awaiting independent approval |
| Usman Ali | Operations Coordinator | Profile awaiting independent approval |
| Maryam Saeed | Software Engineer | Draft profile |
| Haris Malik | Client Support Specialist | Draft profile |

The 88 API operations also create:

- Karachi Clifton and Lahore Gulberg branches, four departments, six designations,
  three PKR grade bands, a job and configured location/employment/category masters.
- Personal and emergency contacts for the four active employees, with normal
  employee/company authorization and automatic record codes.
- Four candidates, an approved Software Engineer requisition and open vacancy,
  two applications in screening, and a Customer Support requisition in draft.
- Annual/sick/unpaid leave types and their policy versions; an office shift and
  a location-matched employee allocation.
- Three training programmes, one independently published programme and one
  workshop draft; an active annual Performance cycle and two employee goals.
- A lifecycle policy created, independently approved and activated only when the
  company has no existing currently active policy. Existing policy authority is
  otherwise preserved.

All business records are created through the generated API client. Approvals use
separate cookie sessions for the maker and `demo.hr.reviewer` (Nadia Qureshi,
fictional). `scripts/provision-hr-demo-reviewer.ts` is restricted to the isolated
local test database and bootstraps only the controlled reviewer identity/access;
it never creates HR business records. Existing credentials are preserved on rerun.

`scripts/seed-hr-demo.ts` is local/UAT-only and uses stable idempotency keys plus
`tmp/hr-demo-data/manifest.json` to resume without duplicating records. A second
run completed with the same 88 operations and no new records. The manifest stores
record receipts and payload hashes, never passwords, cookies or CSRF tokens.
Do not delete the manifest or change a previously completed operation's payload
to create another copy; introduce a new dataset version for another scenario.

Set `NEXORA_UAT_CONFIRM=nexora-r06-uat`, `NEXORA_UAT_PASSWORD` for the local maker,
and `NEXORA_UAT_REVIEWER_PASSWORD` for the controlled reviewer before running
`npx tsx scripts/seed-hr-demo.ts`. The one-time reviewer bootstrap also needs the
existing login-directory secret, loaded by the normal local runtime, and an
explicit local test database connection. Passwords are intentionally omitted
from source and documentation.

This authoring dataset performs no financial posting. Separate Banking acceptance
fixtures in `tmp/hr-banking-evidence/results.json` exercise actual isolated
bookkeeping with artificial statutory data and independent actors. They do not
send money, publish legal rates, or alter normal-company business records.
