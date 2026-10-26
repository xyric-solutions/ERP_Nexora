import { createHash, randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { AuthenticatedAccount } from "../../packages/auth/src/index.js";
import type { BankStatementMappingSnapshot } from "../../packages/contracts/src/index.js";
import { createDatabasePool, type DatabasePool } from "../../packages/db/src/index.js";
import { migrateSourceSchema } from "../../packages/db/src/source-migrations.js";
import type {
  CreateBankStatementImportCommand,
  NormalizedBankStatementLine,
} from "../../server/api/src/modules/banking/statements/service.js";
import { SourceBankStatementImportRepository } from "../../server/api/src/modules/banking/statements/source-repository.js";
import type { BankingActorContext } from "../../server/api/src/modules/banking/source-repository.js";
import {
  ensureCompanyCurrencyFixture,
  ensureSourceAuthorizationFixture,
  sourceTestTenantId,
} from "./source-security-fixture.js";

const databaseUrl = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL;
const run = databaseUrl ? describe : describe.skip;
const suffix = randomUUID().replaceAll("-", "").slice(0, 12);
const isolatedDatabase = `statement_import_${randomUUID().replaceAll("-", "")}`;
const companyId = `statement-company-${suffix}`;
const ledgerId = `statement-ledger-${suffix}`;
const bankAccountId = `statement-bank-${suffix}`;

const mapping: BankStatementMappingSnapshot = {
  file_format: "csv",
  delimiter: ",",
  encoding: "utf-8",
  worksheet: null,
  header_row: 1,
  date_format: "dd/MM/yyyy",
  amount_convention: "separate_debit_credit",
  signed_amount_direction: null,
  columns: {
    date: "Date",
    payment: "Payment",
    receipt: "Receipt",
    signed_amount: null,
    reference: "Ref No.",
    details: "Detail",
    transaction_type: "Transaction Type",
    account_text: "Account",
    payment_mode: "Payment Mode",
  },
};

function actor(userId: string, permissions: readonly string[]): BankingActorContext {
  const account: AuthenticatedAccount = {
    tenantId: sourceTestTenantId,
    organizationName: "Nexora R06 Controlled UAT",
    userId,
    email: `${userId}@uat.nexora.invalid`,
    displayName: userId,
    roles: [],
    permissions,
    sessionVersion: 1,
  };
  return { tenantId: sourceTestTenantId, actor: account };
}

const maker = actor("r06.maker", [
  "banking.statement_import.read",
  "banking.statement_import.create",
  "banking.statement_import.update",
  "banking.statement_import.finalize",
  "banking.statement_mapping.read",
  "banking.statement_mapping.manage",
]);

function fingerprint(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function line(
  sourceRowNumber: number,
  reference: string,
  validationState: NormalizedBankStatementLine["validationState"] = "valid",
): NormalizedBankStatementLine {
  return {
    sourceRowNumber,
    rawRow: { Date: "22/10/2026", Receipt: "100.00", "Ref No.": reference },
    transactionDate: validationState === "error" ? null : "2026-10-22",
    direction: validationState === "error" ? null : "money_in",
    amount: validationState === "error" ? null : "100.00000000",
    currency: "USD",
    reference,
    details: "Synthetic integration row",
    transactionType: null,
    accountText: null,
    paymentMode: null,
    rowFingerprint: fingerprint(reference),
    inclusionState: "included",
    exclusionReason: null,
    validationState,
    duplicateDisposition: validationState === "duplicate" ? "unresolved" : "not_applicable",
    issues:
      validationState === "error"
        ? [{ code: "DATE_INVALID", severity: "error", field: "date", message: "The transaction date is invalid." }]
        : [],
  };
}

run("Bank Statement Import governed repository", () => {
  let bootstrap: DatabasePool;
  let pool: DatabasePool;
  let repository: SourceBankStatementImportRepository;

  beforeAll(async () => {
    bootstrap = createDatabasePool(databaseUrl!);
    expect(isolatedDatabase).toMatch(/^statement_import_[a-f0-9]{32}$/);
    await bootstrap.query(`create database ${isolatedDatabase}`);
    const isolatedUrl = new URL(databaseUrl!);
    isolatedUrl.pathname = `/${isolatedDatabase}`;
    pool = createDatabasePool(isolatedUrl.toString());
    await migrateSourceSchema(pool);
    await ensureSourceAuthorizationFixture(pool);

    const base = await pool.query<{ code: string }>(
      "select code from currency where tenant_id=$1 and status='active' and is_base order by code limit 1",
      [sourceTestTenantId],
    );
    if (!base.rows[0]) {
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,true,'active')",
        [sourceTestTenantId],
      );
    } else if (base.rows[0].code !== "USD") {
      await pool.query(
        "insert into currency(tenant_id,code,name,decimal_places,is_base,status) values($1,'USD','US Dollar',2,false,'active') on conflict do nothing",
        [sourceTestTenantId],
      );
    }
    await pool.query(
      `insert into organization_unit(id,tenant_id,parent_id,type,code,name,status)
       values($1,$2,null,'company',$3,'Statement Import Integration Company','active')`,
      [companyId, sourceTestTenantId, `STM-${suffix}`],
    );
    await ensureCompanyCurrencyFixture(pool, companyId, "USD", ["USD"]);
    await pool.query(
      `insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode)
       select $1,'r06-uat-policy-maker',permission,'all' from unnest($2::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, maker.actor.permissions],
    );
    await pool.query(
      `insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value)
       select $1,'r06-uat-policy-maker',permission,'company',$3 from unnest($2::text[]) permission on conflict do nothing`,
      [sourceTestTenantId, maker.actor.permissions, companyId],
    );
    await pool.query(
      `insert into security_user_company_access
        (tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference)
       values($1,$2,'r06.maker',$3,false,'r06.last-admin-a','governed_administration','statement-import-integration')`,
      [sourceTestTenantId, `statement-access-${suffix}`, companyId],
    );
    await pool.query(
      `insert into account
        (id,tenant_id,company_id,code,name,type,is_header,required_dimensions,status,
         manual_posting_allowed,is_system_account,reconciliation_required,created_at)
       values($1,$2,$3,$4,'Statement Bank Control','asset',false,'[]','active',true,false,true,now())`,
      [ledgerId, sourceTestTenantId, companyId, `STML-${suffix}`],
    );
    await pool.query(
      `insert into bank_account
        (id,tenant_id,company_id,account_id,bank_name,currency,status,created_at,reference,account_name,
         account_type,account_number_masked,account_number_ciphertext,account_number_nonce,
         account_number_hash,encryption_key_version,overdraft_limit,row_version,created_by,
         submitted_by,submitted_at,submission_reason,approved_by,approved_at,decision_reason,updated_at)
       values($1,$2,$3,$4,'Synthetic Statement Bank','USD','active',now(),$5,'Statement Account',
              'current','**** 4321',$6,$7,$8,'integration-v1',0,1,'r06.maker',
              'r06.maker',now(),'Controlled integration setup','r06.checker',now(),
              'Controlled integration approval',now())`,
      [
        bankAccountId,
        sourceTestTenantId,
        companyId,
        ledgerId,
        `STMB-${suffix}`,
        Buffer.alloc(24, 31),
        Buffer.alloc(12, 32),
        fingerprint(`statement-bank-${suffix}`),
      ],
    );
    repository = new SourceBankStatementImportRepository(pool);
  }, 60_000);

  afterAll(async () => {
    await pool?.end();
    if (bootstrap) {
      await bootstrap.query(`drop database if exists ${isolatedDatabase}`);
      await bootstrap.end();
    }
  });

  it("persists, reloads, resolves and finalizes a draft without posting accounting", async () => {
    const profile = await repository.createMappingProfile(
      maker,
      { company_id: companyId, bank_account_id: bankAccountId, name: "Synthetic CSV", mapping },
      `profile-${suffix}`,
      `correlation-profile-${suffix}`,
    );
    expect(
      (
        await repository.prepareUpload(maker, {
          company_id: companyId,
          bank_account_id: bankAccountId,
          statement_reference: `STM-${suffix}`,
          date_format: "dd/MM/yyyy",
          mapping_profile_id: profile.id,
        })
      ).mappingProfile?.id,
    ).toBe(profile.id);

    const duplicateFingerprint = fingerprint("duplicate-row");
    const duplicateOne = { ...line(4, "DUPLICATE-1", "duplicate"), rowFingerprint: duplicateFingerprint };
    const duplicateTwo = { ...line(5, "DUPLICATE-2", "duplicate"), rowFingerprint: duplicateFingerprint };
    const importId = `statement-import-${suffix}`;
    const checksum = fingerprint(`statement-file-${suffix}`);
    const command: CreateBankStatementImportCommand = {
      id: importId,
      fields: {
        company_id: companyId,
        bank_account_id: bankAccountId,
        statement_reference: `STM-${suffix}`,
        date_format: "dd/MM/yyyy",
        mapping_profile_id: profile.id,
      },
      originalFilename: "synthetic-statement.csv",
      fileFormat: "csv",
      detectedMediaType: "text/csv",
      mappingProfileId: profile.id,
      mappingSnapshot: mapping,
      object: {
        objectKey: `bank-statements/quarantine/${sourceTestTenantId}/${companyId}/${importId}.csv`,
        sizeBytes: 512,
        checksumSha256: checksum,
        contentType: "text/csv",
        etag: fingerprint(`etag-${suffix}`),
      },
      lines: [line(2, "VALID-1"), line(3, "INVALID-1", "error"), duplicateOne, duplicateTwo],
    };
    const accountingBefore = await pool.query<{ count: string }>(
      "select count(*)::text as count from accounting_event where tenant_id=$1",
      [sourceTestTenantId],
    );
    const journalsBefore = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    const created = await repository.createImport(maker, command, `import-${suffix}`, `correlation-import-${suffix}`);
    expect(created).toMatchObject({ id: importId, state: "draft", version: 1, replayed: false });
    expect((await repository.get(maker, importId)).counts).toMatchObject({ total: 4, error: 1, duplicate: 2 });

    const replay = await repository.createImport(maker, command, `import-${suffix}`, `correlation-import-${suffix}`);
    expect(replay).toMatchObject({ id: importId, replayed: true });
    const duplicateFile = await repository.createImport(
      maker,
      {
        ...command,
        id: `statement-import-copy-${suffix}`,
        object: { ...command.object, objectKey: `${command.object.objectKey}.copy` },
      },
      `import-copy-${suffix}`,
      `correlation-import-copy-${suffix}`,
    );
    expect(duplicateFile).toMatchObject({ id: importId, replayed: true });

    let detail = await repository.get(maker, importId);
    const invalid = detail.lines.find((entry) => entry.validation_state === "error")!;
    const duplicates = detail.lines.filter((entry) => entry.validation_state === "duplicate");
    await repository.updateLine(
      maker,
      importId,
      invalid.id,
      { expected_version: invalid.version, inclusion_state: "excluded", exclusion_reason: "Invalid source date" },
      `exclude-${suffix}`,
      `correlation-exclude-${suffix}`,
    );
    await expect(repository.prepareReparse(maker, importId, 2)).rejects.toMatchObject({
      status: 409,
      code: "STATEMENT_MAPPING_HAS_RESOLUTIONS",
    });
    await repository.updateLine(
      maker,
      importId,
      duplicates[0]!.id,
      { expected_version: duplicates[0]!.version, duplicate_disposition: "accepted_duplicate" },
      `accept-${suffix}`,
      `correlation-accept-${suffix}`,
    );
    await repository.updateLine(
      maker,
      importId,
      duplicates[1]!.id,
      {
        expected_version: duplicates[1]!.version,
        inclusion_state: "excluded",
        exclusion_reason: "Duplicate source row rejected",
        duplicate_disposition: "rejected_duplicate",
      },
      `reject-${suffix}`,
      `correlation-reject-${suffix}`,
    );
    detail = await repository.get(maker, importId);
    expect(detail.counts).toMatchObject({ total: 4, error: 0, duplicate: 1, excluded: 2 });
    const validated = await repository.validate(
      maker,
      importId,
      { expected_version: detail.version },
      `validate-${suffix}`,
      `correlation-validate-${suffix}`,
    );
    const finalized = await repository.finalize(
      maker,
      importId,
      { expected_version: validated.version },
      `finalize-${suffix}`,
      `correlation-finalize-${suffix}`,
    );
    expect(finalized).toMatchObject({ id: importId, state: "finalized", replayed: false });
    expect((await repository.get(maker, importId)).counts.finalized).toBe(2);

    const accountingAfter = await pool.query<{ count: string }>(
      "select count(*)::text as count from accounting_event where tenant_id=$1",
      [sourceTestTenantId],
    );
    expect(accountingAfter.rows[0]!.count).toBe(accountingBefore.rows[0]!.count);
    const journalsAfter = await pool.query<{ count: string }>(
      "select count(*)::text as count from journal_entry where tenant_id=$1 and company_id=$2",
      [sourceTestTenantId, companyId],
    );
    expect(journalsAfter.rows[0]!.count).toBe(journalsBefore.rows[0]!.count);

    const laterId = `statement-later-${suffix}`;
    const later = await repository.createImport(
      maker,
      {
        ...command,
        id: laterId,
        mappingProfileId: null,
        fields: { ...command.fields, statement_reference: `STM-LATER-${suffix}`, mapping_profile_id: null },
        object: {
          ...command.object,
          objectKey: `bank-statements/quarantine/${sourceTestTenantId}/${companyId}/${laterId}.csv`,
          checksumSha256: fingerprint(`statement-later-file-${suffix}`),
        },
        lines: [line(2, "VALID-1")],
      },
      `import-later-${suffix}`,
      `correlation-import-later-${suffix}`,
    );
    expect(later.state).toBe("draft");
    expect((await repository.get(maker, laterId)).lines[0]).toMatchObject({
      validation_state: "duplicate",
      duplicate_disposition: "unresolved",
    });
  }, 30_000);

  it("reparses an open import under optimistic versioning and saves its immutable mapping profile", async () => {
    const importId = `statement-reparse-${suffix}`;
    const command: CreateBankStatementImportCommand = {
      id: importId,
      fields: {
        company_id: companyId,
        bank_account_id: bankAccountId,
        statement_reference: `STM-REPARSE-${suffix}`,
        date_format: "dd/MM/yyyy",
      },
      originalFilename: "native-statement.csv",
      fileFormat: "csv",
      detectedMediaType: "text/csv",
      mappingProfileId: null,
      mappingSnapshot: mapping,
      object: {
        objectKey: `bank-statements/quarantine/${sourceTestTenantId}/${companyId}/${importId}.csv`,
        sizeBytes: 256,
        checksumSha256: fingerprint(`statement-reparse-file-${suffix}`),
        contentType: "text/csv",
        etag: fingerprint(`statement-reparse-etag-${suffix}`),
      },
      lines: [line(2, "REPARSE-BEFORE")],
    };
    await repository.createImport(maker, command, `reparse-create-${suffix}`, `correlation-reparse-create-${suffix}`);
    const authority = await repository.prepareReparse(maker, importId, 1);
    expect(authority).toMatchObject({
      currency: "USD",
      fileFormat: "csv",
      objectKey: command.object.objectKey,
      checksumSha256: command.object.checksumSha256,
    });
    const revisedMapping: BankStatementMappingSnapshot = {
      ...mapping,
      columns: { ...mapping.columns, details: null },
    };
    const revised = await repository.replaceMapping(
      maker,
      importId,
      { expected_version: 1, mapping: revisedMapping, save_profile: { name: `Reparse CSV ${suffix}` } },
      [line(2, "REPARSE-AFTER")],
      `reparse-update-${suffix}`,
      `correlation-reparse-update-${suffix}`,
    );
    expect(revised).toMatchObject({ id: importId, state: "draft", version: 2, replayed: false });
    const detail = await repository.get(maker, importId);
    expect(detail.mapping_profile_id).not.toBeNull();
    expect(detail.mapping_snapshot?.columns.details).toBeNull();
    expect(detail.lines).toHaveLength(1);
    expect(detail.lines[0]?.reference).toBe("REPARSE-AFTER");
    await expect(repository.prepareReparse(maker, importId, 1)).rejects.toMatchObject({
      status: 409,
      code: "STATEMENT_VERSION_CONFLICT",
    });
    const evidence = await pool.query<{ event_type: string; import_version: string }>(
      `select event_type,import_version::text from bank_statement_import_event
        where tenant_id=$1 and company_id=$2 and import_id=$3 order by import_version,event_type`,
      [sourceTestTenantId, companyId, importId],
    );
    expect(evidence.rows).toEqual([
      { event_type: "uploaded", import_version: "1" },
      { event_type: "mapping_updated", import_version: "2" },
    ]);
  });
});
