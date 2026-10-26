import { randomBytes, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createDatabasePool, migrateSourceSchema, type DatabasePool } from "../../packages/db/src/index.js";
import {
  ensureSourceAuthorizationFixture,
  sourceTestCompanyId,
  sourceTestTenantId,
} from "../integration/source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const isolatedDatabase = `reconciliation_security_${randomUUID().replaceAll("-", "")}`;

const permissions = [
  "banking.statement_import.read",
  "banking.statement_import.create",
  "banking.statement_import.update",
  "banking.statement_import.finalize",
  "banking.statement_mapping.read",
  "banking.statement_mapping.manage",
  "banking.reconciliation.read",
  "banking.reconciliation.create",
  "banking.reconciliation.update",
  "banking.reconciliation.match",
  "banking.reconciliation.submit",
  "banking.reconciliation.approve",
  "banking.reconciliation_adjustment.read",
  "banking.reconciliation_adjustment.create",
  "banking.reconciliation_adjustment.update",
  "banking.reconciliation_adjustment.submit",
  "banking.reconciliation_adjustment.approve",
  "banking.reconciliation_adjustment.post",
  "banking.reconciliation_adjustment.reverse",
] as const;

const governedRelations = [
  "bank_statement_mapping_profile",
  "bank_statement_mapping_profile_event",
  "bank_statement_import",
  "bank_statement_line",
  "bank_statement_import_event",
  "bank_reconciliation",
  "bank_reconciliation_ledger_line",
  "bank_reconciliation_match",
  "bank_reconciliation_adjustment",
  "bank_reconciliation_adjustment_event",
  "bank_reconciliation_event",
] as const;

run("Bank Statement and Reconciliation database security baseline", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^reconciliation_security_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);
  }, 90_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("defines every approved permission independently without granting it", async () => {
    const result = await pool.query<{ permission_key: string }>(
      `select permission_key
         from security_permission_definition
        where permission_key = any($1::text[])
        order by permission_key`,
      [permissions],
    );

    expect(result.rows.map((row) => row.permission_key)).toEqual([...permissions].sort());

    const grants = await pool.query<{ permission_key: string }>(
      `select distinct permission_key
         from security_role_permission_grant
        where permission_key = any($1::text[])
        order by permission_key`,
      [permissions],
    );
    expect(grants.rows).toEqual([]);
  });

  it("forces row-level security on every statement and reconciliation relation", async () => {
    const result = await pool.query<{
      relation_name: string;
      relrowsecurity: boolean | null;
      relforcerowsecurity: boolean | null;
    }>(
      `select expected.relation_name, relation.relrowsecurity, relation.relforcerowsecurity
         from unnest($1::text[]) expected(relation_name)
         left join pg_class relation on relation.oid=to_regclass('public.' || expected.relation_name)
        order by expected.relation_name`,
      [governedRelations],
    );

    expect(
      result.rows
        .filter((row) => row.relrowsecurity !== true || row.relforcerowsecurity !== true)
        .map((row) => row.relation_name),
    ).toEqual([]);
  });

  it("installs immutable evidence, lifecycle and journal-reversal guards", async () => {
    const result = await pool.query<{ table_name: string; trigger_name: string }>(
      `select tgrelid::regclass::text as table_name, tgname as trigger_name
         from pg_trigger
        where tgrelid=any(array[
          'bank_statement_mapping_profile_event'::regclass,
          'bank_statement_import'::regclass,
          'bank_statement_line'::regclass,
          'bank_statement_import_event'::regclass,
          'bank_reconciliation'::regclass,
          'bank_reconciliation_ledger_line'::regclass,
          'bank_reconciliation_match'::regclass,
          'bank_reconciliation_adjustment'::regclass,
          'bank_reconciliation_adjustment_event'::regclass,
          'bank_reconciliation_event'::regclass,
          'journal_entry'::regclass
        ]) and not tgisinternal
        order by table_name,trigger_name`,
    );
    expect(result.rows).toEqual(
      expect.arrayContaining([
        {
          table_name: "bank_statement_mapping_profile_event",
          trigger_name: "bank_statement_mapping_profile_event_immutable",
        },
        { table_name: "bank_statement_import", trigger_name: "bank_statement_import_guard" },
        { table_name: "bank_statement_line", trigger_name: "bank_statement_line_guard" },
        {
          table_name: "bank_statement_import_event",
          trigger_name: "bank_statement_import_event_company_actor_guard",
        },
        { table_name: "bank_statement_import_event", trigger_name: "bank_statement_import_event_immutable" },
        { table_name: "bank_reconciliation", trigger_name: "bank_reconciliation_guard" },
        { table_name: "bank_reconciliation_ledger_line", trigger_name: "bank_reconciliation_ledger_line_guard" },
        { table_name: "bank_reconciliation_match", trigger_name: "bank_reconciliation_match_guard" },
        { table_name: "bank_reconciliation_adjustment", trigger_name: "bank_reconciliation_adjustment_guard" },
        {
          table_name: "bank_reconciliation_adjustment_event",
          trigger_name: "bank_reconciliation_adjustment_event_immutable",
        },
        { table_name: "bank_reconciliation_event", trigger_name: "bank_reconciliation_event_immutable" },
        { table_name: "journal_entry", trigger_name: "journal_entry_approved_reconciliation_guard" },
      ]),
    );
  });

  it("installs company-scoped composite foreign keys for reconciliation evidence", async () => {
    const result = await pool.query<{ table_name: string; definition: string }>(
      `select conrelid::regclass::text as table_name,pg_get_constraintdef(oid) as definition
         from pg_constraint
        where conrelid=any(array[
          'bank_statement_import'::regclass,
          'bank_statement_line'::regclass,
          'bank_reconciliation'::regclass,
          'bank_reconciliation_match'::regclass,
          'bank_reconciliation_adjustment'::regclass
        ]) and contype='f'`,
    );
    for (const table of [
      "bank_statement_import",
      "bank_statement_line",
      "bank_reconciliation",
      "bank_reconciliation_match",
      "bank_reconciliation_adjustment",
    ]) {
      expect(
        result.rows.some(
          (row) => row.table_name === table && row.definition.includes("FOREIGN KEY (tenant_id, company_id"),
        ),
      ).toBe(true);
    }
  });

  it("enforces company isolation, immutable approval evidence, permanent reuse and reversal guards in SQL", async () => {
    const client = await pool.connect();
    const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
    const roleName = `br02_rls_${suffix}`;
    const ledgerId = `br02-ledger-${suffix}`;
    const offsetId = `br02-offset-${suffix}`;
    const bankAccountId = `br02-bank-${suffix}`;
    const importId = `br02-import-${suffix}`;
    const lineId = `br02-line-${suffix}`;
    const calendarId = `br02-calendar-${suffix}`;
    const periodId = `br02-period-${suffix}`;
    const journalId = `br02-journal-${suffix}`;
    const reversalId = `br02-reversal-${suffix}`;
    const bankJournalLineId = `br02-bank-line-${suffix}`;
    const reconciliationId = `br02-reconciliation-${suffix}`;
    const matchId = `br02-match-${suffix}`;

    try {
      await client.query("begin");
      await client.query("select set_config('nexora.tenant_id',$1,true)", [sourceTestTenantId]);
      await client.query("select set_config('nexora.user_id','r06.maker',true)");
      await client.query(
        `insert into security_user_account
          (id,tenant_id,identity_subject,email,status,mfa_state,created_at,updated_at)
         values ($1,$2,$3,$4,'active','disabled',now(),now())`,
        [
          `br02.no-company.${suffix}`,
          sourceTestTenantId,
          `br02:no-company:${suffix}`,
          `br02.no-company.${suffix}@example.invalid`,
        ],
      );
      await client.query(
        `insert into account
          (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
           manual_posting_allowed,is_system_account,reconciliation_required,created_at)
         values
          ($1,$3,$4,$5,'BR-02 Bank Ledger','asset',false,'[]','active',true,false,true,now()),
          ($2,$3,$4,$6,'BR-02 Clearing','asset',false,'[]','active',true,false,false,now())`,
        [ledgerId, offsetId, sourceTestTenantId, sourceTestCompanyId, `BR02-BANK-${suffix}`, `BR02-OFF-${suffix}`],
      );
      await client.query(
        `insert into bank_account
          (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,
           account_name,account_type,account_number_masked,account_number_ciphertext,
           account_number_nonce,account_number_hash,encryption_key_version,overdraft_limit,
           row_version,created_by,submitted_by,submitted_at,submission_reason,approved_by,
           approved_at,decision_reason,updated_at)
         values ($1,$2,$3,$4,'BR-02 Test Bank','USD','active',now(),$5,
                 'BR-02 Operating Account','current','.... 0202',$6,$7,$8,'security-test-v1',0,
                 1,'r06.maker','r06.maker',now(),'Controlled security setup','r06.checker',now(),
                 'Controlled security approval',now())`,
        [
          bankAccountId,
          sourceTestTenantId,
          sourceTestCompanyId,
          ledgerId,
          `BR02-${suffix}`,
          Buffer.alloc(24, 21),
          Buffer.alloc(12, 22),
          randomBytes(32).toString("hex"),
        ],
      );
      await client.query(
        `insert into bank_statement_import
          (tenant_id,company_id,id,bank_account_id,statement_reference,original_filename,file_format,
           detected_media_type,object_storage_key,byte_size,checksum_sha256,date_format,created_by)
         values ($1,$2,$3,$4,$5,'statement.csv','csv','text/csv',$6,128,$7,'yyyy-MM-dd','r06.maker')`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          importId,
          bankAccountId,
          `STATEMENT-${suffix}`,
          `bank-statements/${sourceTestTenantId}/${suffix}.csv`,
          "a".repeat(64),
        ],
      );

      await client.query("savepoint wrong_company");
      await expect(
        client.query(
          `insert into bank_statement_import
            (tenant_id,company_id,id,bank_account_id,statement_reference,original_filename,file_format,
             detected_media_type,object_storage_key,byte_size,checksum_sha256,date_format,created_by)
           values ($1,'nexora-r06-uat-company-two',$2,$3,$4,'wrong-company.csv','csv','text/csv',$5,
                   128,$6,'yyyy-MM-dd','r06.maker')`,
          [
            sourceTestTenantId,
            `br02-wrong-company-${suffix}`,
            bankAccountId,
            `WRONG-${suffix}`,
            `bank-statements/${sourceTestTenantId}/wrong-${suffix}.csv`,
            "b".repeat(64),
          ],
        ),
      ).rejects.toMatchObject({ code: "23503" });
      await client.query("rollback to savepoint wrong_company");

      await client.query(
        `insert into bank_statement_line
          (tenant_id,company_id,id,import_id,source_row_number,raw_row,transaction_date,direction,
           amount,currency,reference,row_fingerprint,validation_state)
         values ($1,$2,$3,$4,1,$5,'2187-10-20','money_in',100,'USD',$6,$7,'valid')`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          lineId,
          importId,
          JSON.stringify({ date: "2187-10-20", amount: "100.00", reference: `REF-${suffix}` }),
          `REF-${suffix}`,
          "c".repeat(64),
        ],
      );
      await client.query(
        `update bank_statement_import
            set state='draft',mapping_snapshot='{}',total_row_count=1,valid_row_count=1,
                row_version=2,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, importId],
      );
      await client.query(
        `update bank_statement_import
            set state='validated',row_version=3,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, importId],
      );
      await client.query(
        `update bank_statement_import
            set state='finalized',finalized_row_count=1,finalized_by='r06.maker',
                finalized_at=clock_timestamp(),row_version=4,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, importId],
      );

      await client.query("savepoint actor_without_company");
      await expect(
        client.query(
          `insert into bank_statement_import_event
            (tenant_id,company_id,event_id,import_id,import_version,event_type,actor_id,state_snapshot)
           values ($1,$2,$3,$4,4,'finalized',$5,'{"state":"finalized"}')`,
          [
            sourceTestTenantId,
            sourceTestCompanyId,
            `br02-forged-actor-${suffix}`,
            importId,
            `br02.no-company.${suffix}`,
          ],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint actor_without_company");

      await client.query("savepoint immutable_import");
      await expect(
        client.query(
          `update bank_statement_import
              set statement_reference='FORGED',row_version=5,updated_at=clock_timestamp()
            where tenant_id=$1 and id=$2`,
          [sourceTestTenantId, importId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint immutable_import");

      await client.query(
        `insert into fiscal_calendar
          (tenant_id,company_id,id,year,period_start,period_end,status)
         values ($1,$2,$3,2187,'2187-01-01','2187-12-31','active')`,
        [sourceTestTenantId, sourceTestCompanyId, calendarId],
      );
      await client.query(
        `insert into financial_period
          (id,tenant_id,company_id,fiscal_calendar_id,period_number,period_start,period_end,status,created_at)
         values ($1,$2,$3,$4,10,'2187-10-01','2187-10-31','open',now())`,
        [periodId, sourceTestTenantId, sourceTestCompanyId, calendarId],
      );
      await client.query(
        `insert into journal_entry
          (id,tenant_id,company_id,created_by,posting_date,period_id,source_type,source_id,status,
           entry_number,created_at,posted_at)
         values ($1,$2,$3,'r06.maker','2187-10-20',$4,'br02_security',$1,'posted',$5,now(),now())`,
        [journalId, sourceTestTenantId, sourceTestCompanyId, periodId, `BR02-J-${suffix}`],
      );
      await client.query(
        `insert into journal_line
          (id,journal_id,tenant_id,line_number,account_id,debit,credit,currency,base_debit,base_credit)
         values
          ($1,$3,$4,1,$5,100,0,'USD',100,0),
          ($2,$3,$4,2,$6,0,100,'USD',0,100)`,
        [bankJournalLineId, `br02-offset-line-${suffix}`, journalId, sourceTestTenantId, ledgerId, offsetId],
      );
      await client.query(
        `insert into bank_reconciliation
          (tenant_id,company_id,id,bank_account_id,method,import_id,statement_date,period_start,period_end,
           statement_reference,currency,opening_statement_balance,statement_money_in,
           reconstructed_statement_balance,closing_statement_balance,ledger_balance_at_cutoff,
           adjusted_ledger_balance,difference,ledger_population_hash,ledger_calculated_at,prepared_by)
         values ($1,$2,$3,$4,'statement_import',$5,'2187-10-22','2187-10-01','2187-10-22',
                 $6,'USD',0,100,100,100,100,100,0,$7,now(),'r06.maker')`,
        [
          sourceTestTenantId,
          sourceTestCompanyId,
          reconciliationId,
          bankAccountId,
          importId,
          `STATEMENT-${suffix}`,
          "d".repeat(64),
        ],
      );
      await client.query(
        `insert into bank_reconciliation_ledger_line
          (tenant_id,company_id,reconciliation_id,journal_line_id,journal_id,posting_date,
           direction,amount,currency,reference)
         values ($1,$2,$3,$4,$5,'2187-10-20','money_in',100,'USD',$6)`,
        [sourceTestTenantId, sourceTestCompanyId, reconciliationId, bankJournalLineId, journalId, `REF-${suffix}`],
      );
      await client.query(
        `insert into bank_reconciliation_match
          (tenant_id,company_id,id,reconciliation_id,statement_line_id,journal_line_id,
           match_type,state,confidence_score,reason_codes,created_by)
         values ($1,$2,$3,$4,$5,$6,'exact','proposed',1,'["exact_reference"]','r06.maker')`,
        [sourceTestTenantId, sourceTestCompanyId, matchId, reconciliationId, lineId, bankJournalLineId],
      );
      await client.query(
        `update bank_reconciliation_match
            set state='confirmed',decided_by='r06.maker',decided_at=clock_timestamp(),
                row_version=2,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, matchId],
      );
      await client.query(
        `update bank_reconciliation
            set state='in_progress',matched_count=1,row_version=2,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, reconciliationId],
      );
      await client.query(
        `update bank_reconciliation
            set state='submitted',submitted_by='r06.maker',submitted_at=clock_timestamp(),
                row_version=3,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, reconciliationId],
      );
      await client.query(
        `update bank_reconciliation
            set state='approved',approved_by='r06.checker',approved_at=clock_timestamp(),
                decision_reason='Independent BR-02 approval',row_version=4,updated_at=clock_timestamp()
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, reconciliationId],
      );
      await client.query(
        `update bank_statement_line
            set reconciled_reconciliation_id=$3,reconciled_at=clock_timestamp(),row_version=2
          where tenant_id=$1 and id=$2`,
        [sourceTestTenantId, lineId, reconciliationId],
      );
      await client.query(
        `update bank_reconciliation_ledger_line set reconciled_at=clock_timestamp()
          where tenant_id=$1 and reconciliation_id=$2 and journal_line_id=$3`,
        [sourceTestTenantId, reconciliationId, bankJournalLineId],
      );
      await client.query(
        `insert into bank_reconciliation_event
          (tenant_id,company_id,event_id,reconciliation_id,reconciliation_version,event_type,
           actor_id,reason,state_snapshot)
         values ($1,$2,$3,$4,4,'approved','r06.checker','Independent BR-02 approval','{"state":"approved"}')`,
        [sourceTestTenantId, sourceTestCompanyId, `br02-event-${suffix}`, reconciliationId],
      );

      await client.query("savepoint immutable_event");
      await expect(
        client.query(
          "update bank_reconciliation_event set reason='Forged evidence' where tenant_id=$1 and event_id=$2",
          [sourceTestTenantId, `br02-event-${suffix}`],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint immutable_event");

      await client.query(
        `insert into journal_entry
          (id,tenant_id,company_id,created_by,posting_date,source_type,source_id,status,created_at,
           reverses_journal_id)
         values ($1,$2,$3,'r06.maker','2187-10-22','br02_reversal',$1,'draft',now(),$4)`,
        [reversalId, sourceTestTenantId, sourceTestCompanyId, journalId],
      );
      await client.query("savepoint protected_reversal");
      await expect(
        client.query(
          `update journal_entry set status='reversed',reversed_by_journal_id=$3
            where tenant_id=$1 and id=$2`,
          [sourceTestTenantId, journalId, reversalId],
        ),
      ).rejects.toMatchObject({ code: "23514" });
      await client.query("rollback to savepoint protected_reversal");

      await client.query("savepoint reused_import");
      await expect(
        client.query(
          `insert into bank_reconciliation
            (tenant_id,company_id,id,bank_account_id,method,import_id,statement_date,period_start,period_end,
             statement_reference,currency,opening_statement_balance,closing_statement_balance,
             ledger_population_hash,ledger_calculated_at,prepared_by)
           values ($1,$2,$3,$4,'statement_import',$5,'2187-11-22','2187-11-01','2187-11-22',
                   $6,'USD',0,0,$7,now(),'r06.maker')`,
          [
            sourceTestTenantId,
            sourceTestCompanyId,
            `br02-reuse-${suffix}`,
            bankAccountId,
            importId,
            `REUSE-${suffix}`,
            "e".repeat(64),
          ],
        ),
      ).rejects.toMatchObject({ code: "23505" });
      await client.query("rollback to savepoint reused_import");

      await client.query(`create role ${roleName} nologin nobypassrls`);
      await client.query(`grant select on bank_statement_import to ${roleName}`);
      await client.query(`set local role ${roleName}`);
      const visible = await client.query<{ count: number }>(
        "select count(*)::integer as count from bank_statement_import where id=$1",
        [importId],
      );
      expect(visible.rows[0]?.count).toBe(1);
      await client.query("select set_config('nexora.user_id','r06.target',true)");
      const stillVisible = await client.query<{ count: number }>(
        "select count(*)::integer as count from bank_statement_import where id=$1",
        [importId],
      );
      expect(stillVisible.rows[0]?.count).toBe(1);
      await client.query("select set_config('nexora.user_id','missing-company-user',true)");
      const hidden = await client.query<{ count: number }>(
        "select count(*)::integer as count from bank_statement_import where id=$1",
        [importId],
      );
      expect(hidden.rows[0]?.count).toBe(0);
      await client.query("reset role");
    } finally {
      await client.query("reset role").catch(() => undefined);
      await client.query("rollback");
      client.release();
    }
  }, 60_000);
});
