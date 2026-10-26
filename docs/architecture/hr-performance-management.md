# Connected Performance Management

Open HR & Payroll > Performance Management. The four connected pages preserve
the selected company/cycle while navigating between them.

1. Create a draft cycle with ordered start, end and review due dates. Review its
   five-point model, then activate. Active dates/terms are frozen; audit history
   retains every change and decision. Cancel unused drafts instead of deleting.
2. Create employee goals with measurements, targets, due dates inside the cycle
   and weights totalling 100%. Employees must have approved or supported legacy
   employment in the selected company during the cycle. A different authorized
   officer approves each goal. Reopen an approved goal before submission if it
   needs revision; its old versions remain in the audit trail.
3. Open Reviews. Select an employee with 100% approved goals and record a rating
   (1–5), achievement evidence, summary, strengths and development needs. Save
   the draft; scores are computed on the server, never supplied by the browser.
   A goal revision requires resaving the review against the current approved
   source. Submit after the cycle ends. A separate officer publishes the review;
   the assessed employee, authors/editors and submitting actor cannot self-publish.
4. Open Outcomes and select the published review. Record one combined development,
   recognition or promotion-recommendation plan, a company employee responsible
   for follow-up and a due date. Submit for independent approval. Complete only
   after entering follow-up evidence in the decision reason. Recommendations do
   not directly update Payroll, promotions or training enrolments.
5. Close the cycle after all employee reviews are published and their follow-ups
   are complete. Published reviews, closed records and audit events cannot be
   rewritten or deleted. Search and paging operate within the selected company.

The weighted score is sum(weight in basis points × integer rating) / 10000.
Bands are Exceptional at >=4.5; Exceeds expectations at >=3.5; Meets expectations
at >=2.5; Developing at >=1.5; otherwise Needs improvement. Employer/company
grading policies requiring other scales need a reviewed model extension first.

Permissions: hr.performance.read; manage for cycle/goal/outcome preparation and
follow-up; review for goal approval and review preparation/submission; publish
for final review publication and outcome approval/return. Decisions remain
independent even for administrators. Company/tenant scope is checked on every
request and before returning an idempotent replay. Ordinary HR roles need explicit
permission assignment. This completion adds no role grants and does not broaden
the earlier narrowly approved local administrator setup.

Employee appraisals and named peer contributions are now connected in Reviews.
HR invites the assessed employee or a different company employee with one active
linked account. Contributors use My contributions; users without HR-wide read
permission receive an ownership-filtered Performance inbox. They cannot access
other employees' feedback or the staff-wide workspace. Every approved goal needs
a rating and evidence. Submission is immutable, freezes the agreed goals and is
included by ID/version in the manager's sealed assessment. Open invitations must
be completed or withdrawn before manager submission or cycle closure. A manager
must resave their draft if newly submitted evidence changes its source snapshot.

Publication remains an independent calibration of the manager's assessment;
return to draft to correct ratings, rather than overwriting published history.
The assessed employee can acknowledge the complete published assessment with a
comment, including disagreement. Acknowledgement records receipt, not agreement
or a rating change. Cycles with a submitted self appraisal require acknowledgement
before closure. Named peer evidence does not automatically alter the manager's
weighted score. Anonymous surveys, configurable rating models and automatic
Learning enrolment are outside this supported fixed five-point workflow.
No bank integration, salary posting, employee movement or external messaging occurs.

Local demo access is enabled only for shoaib's existing administrator policy and
nexora-r06-uat-company. Other company scopes and HR role grants must be assigned
through normal Security administration. A broad all-tenant rollout was rejected;
no such rollout was installed or executed. The four local permission grants and
normal real-login checks are recorded in the task's local provisioning receipts.
