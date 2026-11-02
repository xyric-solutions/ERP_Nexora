# HR automatic record codes

New HR browser forms request code allocation from the API with the reserved
value `AUTO`. The API authorizes the operation and checks idempotency before
allocating the final code inside the same database transaction as the record,
audit event and mutation receipt. The browser displays a read-only field;
Organisation master previews are provisional until the server saves the record.
Existing edit forms retain their saved codes.

| Record | Prefix | Allocation scope |
| --- | --- | --- |
| Employee, including accepted-offer handoff | EMP | Tenant/company group, matching employee-number uniqueness |
| Business unit / division / branch / department / warehouse | BU / DIV / BR / DEPT / WH | Tenant, matching organization-code uniqueness |
| Designation / grade / job | DSG / GRD / JOB | Company and master type |
| Cost centre / location / employment type / employee category | CC / LOC / ET / EC | Company and master type |
| Shift / leave type | SHF / LT | Company |
| Pay component / salary structure / loan | PAY / SAL / LN | Company |
| Lifecycle policy / training programme / monetary overtime policy | LCP / TRN / OTP | Company |

Codes use `PREFIX-001` with at least three decimal digits. Migration HR 131 adds
the tenant-isolated `hr_record_code_counter` table. The allocator reads all
existing codes, including inactive records, and keeps a durable high-water mark.
Advisory transaction locks serialize allocations for each tenant/scope/type.
Rollback also rolls back the reservation; a committed reservation is never reused.
Explicit codes from existing API clients/imports remain supported for compatibility.
The allocator advances past matching imported numbers on its next allocation.

Payroll components previously allowed identifier-style codes only. HR 131 also
allows generated `PAY-001` codes. Formula validation and execution accept bracketed
references such as `[PAY-001] * 0.1`; existing expressions such as `BASIC-5` retain
their subtraction meaning. Existing component codes and formulas are not rewritten.

Recruitment requisitions, openings, candidates, applications and offers already
receive server-generated references. Performance records, lifecycle cases, leave
applications, attendance actions, statutory setup, settlement rules and report
exports already receive server-generated identifiers or workflow references; no
manual record-code field is introduced for those records. External evidence,
bank confirmations, ISO currency/country codes, statutory scheme keys and source
references remain user-selected or entered because they identify outside facts.

The current page-by-page integration inventory is generated in
[HR API coverage](../parity/hr-api-coverage.md). It distinguishes connected views,
read-only views, navigation hubs and any mock/unlinked routes.

Apply HR migration 131 to each deployed database before deploying this API/UI
batch. It has been applied and tested in the isolated local UAT/test database;
other databases are not changed by this work. No historical records are renumbered.
