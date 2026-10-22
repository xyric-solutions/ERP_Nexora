import { randomUUID, createHash } from "node:crypto";
import type { DatabasePool } from "../../packages/db/src/index.js";
import { createProductionJournalFixture } from "./hr-payroll-production-journal-fixture.js";
import { journalActor, journalPermissions } from "./hr-payroll-journal-fixture.js";
import { sourceTestTenantId as tenant } from "./source-security-fixture.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import {
  hrPayrollPaymentWorkspaceSchema,
  hrPayrollPaymentActionSchema,
  type HrPayrollPaymentAction,
} from "../../packages/contracts/src/hr/index.js";
export const paymentPermissions = [
  ...journalPermissions,
  "banking.payment.read",
  "banking.payment.create",
  "banking.payment.submit",
  "banking.payment.approve",
  "banking.payment.post",
  "banking.payment.reverse",
  "hr.payroll.payment.confirm",
];
export const paymentActor = (who = "r06.maker", permissions = paymentPermissions) => journalActor(who, permissions);
export async function createPaymentFixture(pool: DatabasePool, posted = true) {
  const f = await createProductionJournalFixture(pool),
    bank = randomUUID(),
    ledger = randomUUID();
  if (posted) {
    await f.journalAction("prepare");
    await f.journalAction("accept", "r06.checker");
    await f.journalAction("post", "r06.target");
  }
  for (const [policy, keys] of [
    [
      "r06-uat-policy-maker",
      [
        "hr.payroll.payment.read",
        "hr.payroll.result.read",
        "hr.payroll.payment.manage",
        "banking.payment.read",
        "banking.payment.create",
        "banking.payment.submit",
      ],
    ],
    [
      "r06-uat-policy-checker",
      [
        "hr.payroll.payment.read",
        "hr.payroll.result.read",
        "hr.payroll.payment.confirm",
        "banking.payment.read",
        "banking.payment.approve",
        "workflow.approval.approve",
        "workflow.approval.reject",
      ],
    ],
    [
      "r06-uat-policy-payment-poster",
      [
        "hr.payroll.payment.read",
        "hr.payroll.result.read",
        "hr.payroll.payment.confirm",
        "banking.payment.read",
        "banking.payment.post",
        "banking.payment.reverse",
      ],
    ],
  ] as const)
    for (const key of keys) {
      await pool.query(
        `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) values($1,$2,$3,'all') on conflict do nothing`,
        [tenant, policy, key],
      );
      await pool.query(
        `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) values($1,$2,$3,'company',$4) on conflict do nothing`,
        [tenant, policy, key, f.companyId],
      );
    }
  await pool.query(
    `insert into account(id,tenant_id,company_id,code,name,type,status,reconciliation_required,created_at) values($1,$2,$3,'SAL_BANK','Salary bank control','asset','active',true,now())`,
    [ledger, tenant, f.companyId],
  );
  await pool.query(
    `insert into bank_account(id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,account_type,branch,account_number_masked,account_number_ciphertext,account_number_nonce,account_number_hash,encryption_key_version,swift_bic,overdraft_limit,row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason) values($1,$2,$3,$4,'Synthetic salary bank','PKR','active',now(),$1,'Synthetic salary funding','current','Test branch','**** 1234',$5,$6,$7,'integration-v1','SYNTPKKA',0,1,'r06.maker','r06.maker',now(),'Synthetic setup','r06.checker',now(),'Synthetic approval')`,
    [
      bank,
      tenant,
      f.companyId,
      ledger,
      Buffer.alloc(24, 7),
      Buffer.alloc(12, 3),
      createHash("sha256").update(bank).digest("hex"),
    ],
  );
  const payments = new SourceBankPaymentRepository(pool);
  const read = async (who = "r06.maker") =>
    hrPayrollPaymentWorkspaceSchema.parse(await f.repo.getPayrollPaymentWorkspace(paymentActor(who), f.query));
  const act = async (
    action: HrPayrollPaymentAction["action"],
    who = "r06.maker",
    extra: Record<string, unknown> = {},
    key = randomUUID(),
  ) => {
    const w = await read(who);
    return f.repo.actOnPayrollPayment(
      paymentActor(who),
      hrPayrollPaymentActionSchema.parse({
        ...f.query,
        action,
        expected_version: w.batch?.version ?? 0,
        source_hash: w.source_hash,
        reason: "Isolated independently verified salary settlement",
        ...extra,
      }),
      key,
      "payment-test",
    );
  };
  const pay = async (overrides: Record<string, unknown> = {}) => {
    const w = await read(),
      x = w.payments.find((p) => p.state === "pending")!;
    const draft = await payments.create(
      paymentActor(),
      {
        company_id: f.companyId,
        bank_account_id: bank,
        posting_date: f.today,
        lines: [
          {
            line_order: 5,
            document_date: f.today,
            external_reference: x.id,
            document_reference: x.employee_id,
            payment_method: "bank_transfer",
            nominal_account_id: w.net_payable_account_id!,
            narration: "Isolated salary settlement",
            amount: x.amount.replace(/0+$/, "").replace(/\.$/, ""),
            dimensions: {},
            ...overrides,
          },
        ],
      },
      randomUUID(),
      "payment-test",
    );
    await payments.submit(paymentActor(), draft.id, { expected_version: 1 }, randomUUID(), "payment-test");
    await payments.decide(
      paymentActor("r06.checker"),
      draft.id,
      { expected_version: 2, action: "approve" },
      randomUUID(),
      "payment-test",
    );
    const posted = await payments.post(
      paymentActor("r06.target"),
      draft.id,
      { expected_version: 3 },
      randomUUID(),
      "payment-test",
    );
    const line = (
      await pool.query(`select id from bank_payment_line where tenant_id=$1 and company_id=$2 and payment_id=$3`, [
        tenant,
        f.companyId,
        posted.id,
      ])
    ).rows[0];
    return { posted, lineId: line.id, paymentId: x.id };
  };
  return { ...f, bank, ledger, payments, paymentRead: read, paymentAction: act, pay };
}
