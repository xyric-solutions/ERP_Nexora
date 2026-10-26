import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import { writeApprovalOverrideEvent } from "../../server/api/src/modules/security/approval-override-writer.js";
import {
  ensureSourceAuthorizationFixture,
  ensureSourceSuperAdministratorFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "../integration/source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;

run("Bank Payment database security controls", () => {
  let pool: DatabasePool;

  beforeAll(async () => {
    pool = createDatabasePool(databaseUrl!);
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
    await ensureSourceSuperAdministratorFixture(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
  });

  it("forces tenant RLS on every payment-owned relation", async () => {
    const relations = await pool.query<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      `select relname,relrowsecurity,relforcerowsecurity
         from pg_class
        where oid=any(array[
          'bank_payment_sequence'::regclass,
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ])
        order by relname`,
    );
    expect(relations.rows).toEqual([
      { relname: "bank_payment", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_event", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_line", relrowsecurity: true, relforcerowsecurity: true },
      { relname: "bank_payment_sequence", relrowsecurity: true, relforcerowsecurity: true },
    ]);
  });

  it("installs lifecycle, line, posting-link, currency, override and append-only guards", async () => {
    const controls = await pool.query<{ table_name: string; trigger_name: string }>(
      `select tgrelid::regclass::text as table_name,tgname as trigger_name
         from pg_trigger
        where tgrelid=any(array[
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ]) and not tgisinternal
        order by table_name,trigger_name`,
    );
    expect(controls.rows).toEqual(
      expect.arrayContaining([
        { table_name: "bank_payment", trigger_name: "bank_payment_approval_override_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_currency_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_posting_link_guard" },
        { table_name: "bank_payment", trigger_name: "bank_payment_transition_guard" },
        { table_name: "bank_payment_event", trigger_name: "bank_payment_event_authority_guard" },
        { table_name: "bank_payment_event", trigger_name: "bank_payment_event_immutable" },
        { table_name: "bank_payment_line", trigger_name: "bank_payment_line_guard" },
      ]),
    );
  });

  it("binds payment, line, period and journal identities to one company", async () => {
    const foreignKeys = await pool.query<{ table_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
         from pg_constraint
        where contype='f'
          and conrelid=any(array[
            'bank_account'::regclass,
            'bank_payment'::regclass,
            'bank_payment_line'::regclass
          ])
        order by table_name,definition`,
    );
    const definitions = foreignKeys.rows.map((row) => `${row.table_name}: ${row.definition}`);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_account: FOREIGN KEY (tenant_id, company_id, account_id) REFERENCES account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment: FOREIGN KEY (tenant_id, company_id, bank_account_id) REFERENCES bank_account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment_line: FOREIGN KEY (tenant_id, company_id, payment_id) REFERENCES bank_payment(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.some((value) =>
        value.includes(
          "bank_payment_line: FOREIGN KEY (tenant_id, company_id, nominal_account_id) REFERENCES account(tenant_id, company_id, id)",
        ),
      ),
    ).toBe(true);
    expect(
      definitions.filter((value) => value.includes("REFERENCES financial_period(tenant_id, company_id, id)")),
    ).toHaveLength(2);
    expect(
      definitions.filter((value) => value.includes("REFERENCES journal_entry(tenant_id, company_id, id)")),
    ).toHaveLength(2);
  });

  it("enforces exact lifecycle evidence, bounded methods and append-only event transitions", async () => {
    const constraints = await pool.query<{ table_name: string; constraint_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,conname as constraint_name,
              pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid=any(array[
          'bank_payment'::regclass,
          'bank_payment_line'::regclass,
          'bank_payment_event'::regclass
        ]) and contype='c'
        order by table_name,constraint_name`,
    );
    const byName = new Map(constraints.rows.map((row) => [row.constraint_name, row.definition]));
    expect(byName.get("bank_payment_lifecycle_evidence_check")).toContain("reversed");
    expect(byName.get("bank_payment_decision_separation_check")).toContain("approval_override_event_id");
    expect(byName.get("bank_payment_event_transition_check")).toContain("posted");
    const methodConstraint = constraints.rows.find(
      (row) => row.table_name === "bank_payment_line" && row.definition.includes("payment_method"),
    )?.definition;
    for (const method of ["bank_transfer", "cheque", "cash", "online", "standing_order", "card"]) {
      expect(methodConstraint).toContain(`'${method}'::text`);
    }
  });

  it("accepts PATCH idempotency without widening the method authority", async () => {
    const constraint = await pool.query<{ definition: string }>(
      `select pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid='platform_admin_idempotency'::regclass
          and conname='platform_admin_idempotency_method_check'`,
    );
    expect(constraint.rows).toHaveLength(1);
    expect(constraint.rows[0]?.definition).toContain("'POST'::text");
    expect(constraint.rows[0]?.definition).toContain("'PATCH'::text");
    expect(constraint.rows[0]?.definition).not.toContain("'PUT'::text");
  });

  it("accepts exact post override evidence and rejects mismatched or non-post lifecycle evidence", async () => {
    const client = await pool.connect();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const paymentId = `payment-override-${suffix}`;
    const ledgerId = `payment-ledger-${suffix}`;
    const bankAccountId = `payment-bank-${suffix}`;
    const actorId = "r06.override-admin";
    const correlationId = `payment-post-${suffix}`;
    const account = {
      tenantId: sourceTestTenantId,
      organizationName: "Nexora R06 Controlled UAT",
      userId: actorId,
      email: "override-admin@uat.nexora.invalid",
      displayName: "Override Administrator",
      roles: ["super_administrator"],
      permissions: ["platform.approval.override", "banking.payment.approve", "banking.payment.post"],
      sessionVersion: 1,
    };

    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query("select pg_advisory_xact_lock(hashtextextended($1,0))", [
        `nexora:platform:audit:${sourceTestTenantId}`,
      ]);

      const base = await client.query<{ code: string }>(
        `select code from currency
          where tenant_id=$1 and status='active' and is_base
          order by code limit 1`,
        [sourceTestTenantId],
      );
      let baseCurrency = base.rows[0]?.code;
      if (!baseCurrency) {
        baseCurrency = [...suffix.slice(0, 3)]
          .map((value) => String.fromCharCode(65 + (Number.parseInt(value, 16) % 26)))
          .join("");
        await client.query(
          `insert into currency (tenant_id,code,name,decimal_places,is_base,status)
           values ($1,$2,'Bank Payment Override Test Currency',2,true,'active')`,
          [sourceTestTenantId, baseCurrency],
        );
      }

      await client.query(
        `insert into account
          (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
           manual_posting_allowed,is_system_account,reconciliation_required,created_at)
         values ($1,$2,$3,$4,'Bank Payment Override Ledger','asset',false,'[]'::jsonb,
                 'active',true,false,true,now())`,
        [ledgerId, sourceTestTenantId, sourceTestCompanyId, `BPO-${suffix}`],
      );
      await client.query(
        `insert into bank_account
          (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,
           account_name,account_type,account_number_masked,account_number_ciphertext,
           account_number_nonce,account_number_hash,encryption_key_version,overdraft_limit,
           row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,
           approved_at,decision_reason,updated_at)
         values ($1,$2,$3,$4,'Override Test Bank',$5,'active',now(),$6,
                 'Override Test Operating Account','current','.... 9100',$7,$8,$9,'security-test-v1',0,
                 1,'r06.maker','r06.maker',now(),'Controlled security setup','r06.checker',now(),
                 'Controlled security approval',now())`,
        [
          bankAccountId,
          sourceTestTenantId,
          sourceTestCompanyId,
          ledgerId,
          baseCurrency,
          `BA-${suffix}`,
          Buffer.alloc(24, 11),
          Buffer.alloc(12, 12),
          randomBytes(32).toString("hex"),
        ],
      );
      await client.query(
        `insert into bank_payment
          (id,tenant_id,company_id,reference,bank_account_id,posting_date,transaction_currency,
           base_currency,exchange_rate_value,total_amount,state,row_version,created_by,created_at,
           updated_at,approver_user_id)
         values ($1,$2,$3,$4,$5,current_date,$6,$6,1,10,'draft',1,$7,now(),now(),'r06.checker')`,
        [paymentId, sourceTestTenantId, sourceTestCompanyId, `BP-${suffix}`, bankAccountId, baseCurrency, actorId],
      );
      // Build the security fixture through valid financial lifecycle transitions;
      // never bypass the production guard by inserting an approved transaction.
      await client.query(
        `insert into account(id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,manual_posting_allowed,is_system_account,reconciliation_required,created_at)
        values($1,$2,$3,$4,'Synthetic security expense','expense',false,'[]','active',true,false,false,now())`,
        [`${paymentId}-expense`, sourceTestTenantId, sourceTestCompanyId, `EXP-${suffix}`],
      );
      await client.query(
        `insert into bank_payment_line(id,tenant_id,company_id,payment_id,line_number,document_date,external_reference,payment_method,nominal_account_id,narration,amount,dimensions)
        values($1,$2,$3,$4,1,current_date,$5,'bank_transfer',$6,'Synthetic governed security fixture',10,'{}')`,
        [
          `${paymentId}-line`,
          sourceTestTenantId,
          sourceTestCompanyId,
          paymentId,
          `REF-${suffix}`,
          `${paymentId}-expense`,
        ],
      );
      await client.query(
        `update bank_payment set state='submitted',row_version=2,updated_at=clock_timestamp(),submitted_by=$3,submitted_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, paymentId, actorId],
      );
      await client.query(
        `update bank_payment set state='approved',row_version=3,updated_at=clock_timestamp(),approved_by='r06.checker',approved_at=clock_timestamp() where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, paymentId],
      );

      const writeOverride = (normalDecisionPermission: string, overrideCorrelationId: string, key: string) =>
        writeApprovalOverrideEvent(client, {
          tenantId: sourceTestTenantId,
          account,
          makerActorIds: [actorId],
          normalDecisionPermission,
          resourceType: "banking.payment",
          resourceId: paymentId,
          decisionAction: "post",
          reason: "Controlled posting-segregation security test",
          correlationId: overrideCorrelationId,
          idempotencyKey: key,
        });
      const insertAudit = async (auditId: string, auditCorrelationId: string, approvalReference: string) => {
        const sequence = await client.query<{ value: string }>(
          "select (coalesce(max(sequence),0)+1)::text as value from platform_admin_audit_event where tenant_id=$1",
          [sourceTestTenantId],
        );
        await client.query(
          `insert into platform_admin_audit_event
            (id,tenant_id,sequence,actor_id,correlation_id,action,entity_type,entity_id,before_hash,
             after_hash,source_reference,approval_reference,occurred_at,previous_event_hash,event_hash)
           values ($1,$2,$3,$4,$5,'banking.payment.post','bank_payment',$6,$7,$8,
                   'banking.payment',$9,now(),$10,$11)`,
          [
            auditId,
            sourceTestTenantId,
            Number(sequence.rows[0]!.value),
            actorId,
            auditCorrelationId,
            paymentId,
            randomBytes(32).toString("hex"),
            randomBytes(32).toString("hex"),
            approvalReference,
            randomBytes(32).toString("hex"),
            randomBytes(32).toString("hex"),
          ],
        );
      };
      const insertEvent = (eventId: string, auditId: string, eventCorrelationId: string, overrideId: string) =>
        client.query(
          `insert into bank_payment_event
            (tenant_id,company_id,event_id,payment_id,event_type,from_state,to_state,actor_id,
             correlation_id,idempotency_key,platform_audit_event_id,approval_override_event_id)
           values ($1,$2,$3,$4,'posted','approved','posted',$5,$6,$7,$8,$9)`,
          [
            sourceTestTenantId,
            sourceTestCompanyId,
            eventId,
            paymentId,
            actorId,
            eventCorrelationId,
            `event-${eventId}`,
            auditId,
            overrideId,
          ],
        );

      const validOverride = await writeOverride("banking.payment.post", correlationId, `valid-${suffix}`);
      const validAuditId = `audit-post-${suffix}`;
      await insertAudit(validAuditId, correlationId, validOverride.eventId);
      await expect(
        insertEvent(`event-post-${suffix}`, validAuditId, correlationId, validOverride.eventId),
      ).resolves.toBeDefined();

      await client.query("savepoint invalid_post_permission");
      const wrongPermissionCorrelation = `payment-post-permission-${suffix}`;
      const wrongPermission = await writeOverride(
        "banking.payment.approve",
        wrongPermissionCorrelation,
        `wrong-permission-${suffix}`,
      );
      const wrongPermissionAuditId = `audit-post-permission-${suffix}`;
      await insertAudit(wrongPermissionAuditId, wrongPermissionCorrelation, wrongPermission.eventId);
      await expect(
        insertEvent(
          `event-post-permission-${suffix}`,
          wrongPermissionAuditId,
          wrongPermissionCorrelation,
          wrongPermission.eventId,
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint invalid_post_permission");

      await client.query("savepoint invalid_post_correlation");
      const overrideCorrelation = `payment-post-override-${suffix}`;
      const eventCorrelation = `payment-post-event-${suffix}`;
      const wrongCorrelation = await writeOverride(
        "banking.payment.post",
        overrideCorrelation,
        `wrong-correlation-${suffix}`,
      );
      const wrongCorrelationAuditId = `audit-post-correlation-${suffix}`;
      await insertAudit(wrongCorrelationAuditId, eventCorrelation, wrongCorrelation.eventId);
      await expect(
        insertEvent(
          `event-post-correlation-${suffix}`,
          wrongCorrelationAuditId,
          eventCorrelation,
          wrongCorrelation.eventId,
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint invalid_post_correlation");

      await client.query("savepoint invalid_reversal_override");
      const reversalAuditId = `audit-reversal-${suffix}`;
      await insertAudit(reversalAuditId, correlationId, validOverride.eventId);
      await expect(
        client.query(
          `insert into bank_payment_event
            (tenant_id,company_id,event_id,payment_id,event_type,from_state,to_state,actor_id,
             correlation_id,idempotency_key,platform_audit_event_id,approval_override_event_id)
           values ($1,$2,$3,$4,'reversed','posted','reversed',$5,$6,$7,$8,$9)`,
          [
            sourceTestTenantId,
            sourceTestCompanyId,
            `event-reversal-${suffix}`,
            paymentId,
            actorId,
            correlationId,
            `reversal-${suffix}`,
            reversalAuditId,
            validOverride.eventId,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint invalid_reversal_override");
    } finally {
      await client.query("rollback");
      client.release();
    }
  }, 60_000);
});
