import { randomBytes, randomUUID, createHash } from "node:crypto";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import {
  decimal,
  connectedReportIds,
  connectedReportQuerySchema,
  savePurchaseRequestSchema,
  supplierInputSchema,
  taxInputSchema,
  type PurchaseDocument,
  type PurchaseKind,
  type SubledgerOperation,
  type PurchaseAccountingPrepare,
} from "../../packages/contracts/src/index.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import { ConnectedReports } from "../../server/api/src/modules/finance/subledger/connected-reports.js";
import { SourceTaxRepository } from "../../server/api/src/modules/finance/taxes/source-repository.js";
import { ensureSourceSuperAdministratorFixture } from "./source-security-fixture.js";
import { FinancePostingService } from "../../server/api/src/modules/finance/posting/service.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import { SourceBankStatementImportRepository } from "../../server/api/src/modules/banking/statements/source-repository.js";
import { SourceBankReconciliationRepository } from "../../server/api/src/modules/banking/reconciliations/source-repository.js";
import { SourceFiscalCalendarRepository } from "../../server/api/src/modules/master-data/fiscal-calendars/source-repository.js";

const permissions = [
  "banking.statement_import.read",
  "banking.statement_import.create",
  "banking.statement_import.update",
  "banking.statement_import.finalize",
  "banking.statement_mapping.read",
  "banking.reconciliation.create",
  "banking.reconciliation.update",
  "banking.reconciliation.match",
  "procurement.document.read",
  "procurement.document.create",
  "procurement.document.submit",
  "procurement.document.approve",
  "procurement.document.action",
  "procurement.vendor.read",
  "procurement.vendor.create",
  "banking.bank_account.read",
  "banking.payment.read",
  "banking.reconciliation.read",
  "finance.tax.read",
  "finance.tax.manage",
  "finance.tax_mapping.admin",
];
const actor = (id = "r06.maker") => {
  const context = subledgerActor(id);
  return { ...context, actor: { ...context.actor, permissions: [...context.actor.permissions, ...permissions] } };
};
const run = process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ? describe : describe.skip;
run("Purchase-owned AP / Bank integration", () => {
  let f: Awaited<ReturnType<typeof setupSubledgerFixture>>,
    procurement: SourceProcurementRepository,
    close: () => Promise<void>;
  let tax: string;
  const maker = actor(),
    checker = actor("r06.checker"),
    poster = actor("r06.target");
  beforeAll(async () => {
    const db = await createDisposableSourceDatabase(process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL!);
    close = db.close;
    f = await setupSubledgerFixture(db.pool, undefined, "USD");
    await ensureSourceSuperAdministratorFixture(db.pool);
    for (const policy of [
      "r06-uat-policy-maker",
      "r06-uat-policy-checker",
      "r06-uat-policy-payment-poster",
      "r06-uat-policy-approval-override",
    ]) {
      await db.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions],
      );
      await db.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, permissions, f.company],
      );
    }
    await db.pool.query(
      "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,'r06.override-admin',$3,false,'r06.last-admin-a','governed_administration','disposable-purchase-bank')",
      [f.tenant, randomUUID(), f.company],
    );
    procurement = new SourceProcurementRepository(
      db.pool,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test-v1"),
    );
    await db.pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,is_header,status,created_at) values($1,$2,$3,'WHT','Synthetic withholding','liability',false,'active',now())",
      [`${f.company}-tax`, f.tenant, f.company],
    );
    const admin = actor("r06.override-admin");
    admin.actor.roles = ["super_administrator"];
    tax = (
      await new SourceTaxRepository(db.pool).save(
        admin,
        taxInputSchema.parse({
          company_id: f.company,
          name: "Synthetic ten percent",
          tax_type: "WHT",
          rate: "10",
          module: "purchases",
          treatment: "withholding",
          trigger: "settlement",
          account_id: `${f.company}-tax`,
          effective_date: "2026-09-01",
          reason: "Disposable withholding fixture",
        }),
        randomUUID(),
      )
    ).id;
  }, 60000);
  afterAll(async () => {
    await close?.();
  });
  async function approve(document: PurchaseDocument) {
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
    ] as const)
      document = (
        await procurement.action(
          context,
          document.id,
          {
            company_id: f.company,
            expected_version: document.version,
            action,
            reason: "Disposable independent Purchase approval",
          },
          randomUUID(),
          randomUUID(),
        )
      ).record;
    return document;
  }
  async function supplierBill(amount = "10", currency = "USD", recognize = true) {
    const vendor = (
      await procurement.saveSupplier(
        maker,
        null,
        supplierInputSchema.parse({ company_id: f.company, name: `Synthetic supplier ${randomUUID()}` }),
        randomUUID(),
        randomUUID(),
      )
    ).record;
    await f.repository.createParty(
      maker,
      {
        company_id: f.company,
        kind: "supplier",
        name: vendor.name,
        default_currency: currency,
        source_supplier_id: vendor.id,
      },
      randomUUID(),
    );
    let source: PurchaseDocument | undefined, order: PurchaseDocument | undefined;
    for (const kind of ["request", "rfq", "order", "receipt", "bill"] as PurchaseKind[]) {
      source = await approve(
        (
          await procurement.save(
            maker,
            null,
            savePurchaseRequestSchema.parse({
              company_id: f.company,
              kind,
              supplier_id: ["request", "rfq"].includes(kind) ? null : vendor.id,
              source_id: (kind === "bill" ? order : source)?.id ?? null,
              invited_supplier_ids: kind === "rfq" ? [vendor.id] : [],
              approver_id: checker.actor.userId,
              document_date: "2026-11-18",
              reference: `SYN-${randomUUID()}`,
              currency,
              lines: [
                {
                  source_line_id: (kind === "bill" ? order : source)?.lines[0]?.id ?? null,
                  item_code: "SYN-001",
                  description: "Synthetic service",
                  quantity: "1",
                  uom: "Each",
                  unit_price: amount,
                  tax_percent: "0",
                },
              ],
            }),
            randomUUID(),
            randomUUID(),
          )
        ).record,
      );
      if (kind === "order") order = source;
    }
    if (!source) throw new Error("Bill fixture missing");
    if (recognize)
      await post(
        await f.repository.preparePurchase(
          maker,
          source.id,
          { company_id: f.company, expected_version: source.version },
          randomUUID(),
        ),
      );
    return { bill: source, vendor };
  }
  async function payment(
    bills: Awaited<ReturnType<typeof supplierBill>>[],
    options: { allocated?: string; gross?: string; discount?: string; wht?: string; currency?: string } = {},
  ) {
    const currency = options.currency ?? "USD";
    return approve(
      (
        await procurement.save(
          maker,
          null,
          savePurchaseRequestSchema.parse({
            company_id: f.company,
            kind: bills.length > 1 ? "multi_payment" : "payment",
            supplier_id: bills.length > 1 ? null : bills[0]!.vendor.id,
            document_date: "2026-11-18",
            currency,
            allocations: bills.map(({ bill }) => ({
              bill_id: bill.id,
              amount: options.allocated ?? bill.total_amount,
              discount: options.discount ?? "0",
            })),
            payment_details: {
              bank_account_id: f.banks[currency]!,
              entries: bills.map(({ bill, vendor }) => ({
                supplier_id: vendor.id,
                amount: options.gross ?? options.allocated ?? bill.total_amount,
                mode: "bank_transfer",
                reference: "SYNTHETIC",
                wht_rate: options.wht ?? "0",
                additional_wht: "0",
              })),
            },
          }),
          randomUUID(),
          randomUUID(),
        )
      ).record,
    );
  }
  async function prepare(source: PurchaseDocument, options: Partial<PurchaseAccountingPrepare> = {}) {
    return f.repository.preparePurchase(
      maker,
      source.id,
      { company_id: f.company, expected_version: source.version, ...options },
      randomUUID(),
    );
  }
  async function post(operation: SubledgerOperation) {
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      operation = await f.repository.action(
        context,
        operation.id,
        {
          company_id: f.company,
          expected_version: operation.version,
          action,
          reason: "Disposable financial independent review",
        },
        randomUUID(),
      );
    return operation;
  }
  async function report(id: (typeof connectedReportIds)[number], extra = {}) {
    return new ConnectedReports(f.repository).run(
      maker,
      connectedReportQuerySchema.parse({ company_id: f.company, report: id, as_of: "2026-11-18", ...extra }),
    );
  }
  it.each(["0", "10"])("posts one USD credit and AP relief with %s percent governed withholding", async (wht) => {
    const bill = await supplierBill();
    const bankClosing = async () => {
      const balances = await report("bank-balance-report");
      const bank = balances.rows.find((row) => row.source_id === f.banks.USD);
      expect(bank).toBeDefined();
      return decimal(bank!.values.closing, 8, true);
    };
    const before = await bankClosing();
    const source = await payment([bill], { wht });
    const draft = await prepare(source, wht === "10" ? { tax_definition_id: tax } : {});
    expect(await bankClosing()).toBe(before);
    expect((await prepare(source)).id).toBe(draft.id);
    const posted = await post(draft);
    const bankLines = (
      await f.pool.query(
        "select debit::text,credit::text from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
        [f.tenant, posted.journal_id, `${f.company}-bank-USD`],
      )
    ).rows;
    expect(bankLines).toHaveLength(1);
    expect(bankLines[0].credit).toBe(wht === "10" ? "9.00000000" : "10.00000000");
    expect(await bankClosing()).toBe(before - decimal(bankLines[0].credit, 8));
    const read = await procurement.get(maker, f.company, bill.bill.id);
    expect(decimal(read.outstanding_amount!, 8)).toBe(0n);
    expect(read.reserved_amount).toBe("0.00");
    const movement = await report("purchase-bank-movements", { supplier_id: bill.vendor.id });
    expect(movement.rows[0]?.journal_id).toBe(posted.journal_id);
    expect(
      (
        await f.pool.query("select count(*)::int as total from bank_payment where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].total,
    ).toBe(0);
  });
  it("posts discounts, explicit advances, fees and multiple suppliers in one atomic journal, then reverses", async () => {
    const bills = await Promise.all([supplierBill("12"), supplierBill("12")]);
    const source = await payment(bills, { allocated: "10", gross: "11", discount: "2" });
    await expect(prepare(source)).rejects.toMatchObject({ code: "PURCHASE_ACCOUNTING_BLOCKED" });
    const posted = await post(
      await prepare(source, {
        discount_account_id: f.policy.revenue_account_id,
        advance_account_id: f.policy.receivable_account_id,
        advance_monetary: true,
        bank_fee: "1",
      }),
    );
    expect(posted.preview?.additional_items).toHaveLength(2);
    const cash = posted.preview!.lines.filter((line) => line.accountId === `${f.company}-bank-USD`);
    expect(cash).toHaveLength(1);
    expect(cash[0]?.credit).toBe("23.00");
    const reversal = await post(
      await f.repository.create(
        maker,
        {
          company_id: f.company,
          type: "reversal",
          operation_id: posted.id,
          date: "2026-11-18",
          reference: "SYN-REV",
          reason: "Reverse disposable group",
        },
        randomUUID(),
      ),
    );
    expect(reversal.state).toBe("posted");
    for (const { bill } of bills) {
      const read = await procurement.get(maker, f.company, bill.id);
      expect(decimal(read.outstanding_amount!, 8)).toBe(decimal("12", 8));
      expect(read.reserved_amount).toBe("12.00");
    }
  });
  it("blocks unrecognized Bills and rolls back the complete group", async () => {
    const bills = [await supplierBill(), await supplierBill("10", "USD", false)];
    const source = await payment(bills);
    await expect(prepare(source)).rejects.toThrow("Recognize and post");
    expect(
      (
        await f.pool.query(
          "select count(*)::int as total from procurement_accounting_link where tenant_id=$1 and company_id=$2 and document_id=$3",
          [f.tenant, f.company, source.id],
        )
      ).rows[0].total,
    ).toBe(0);
    for (const { bill } of bills)
      expect((await procurement.get(maker, f.company, bill.id)).reserved_amount).toBe("10.00");
  });
  it("requires live company Finance authority, independent approval and current source versions", async () => {
    const source = await payment([await supplierBill()]);
    await expect(
      f.repository.preparePurchase(
        {
          ...maker,
          actor: {
            ...maker.actor,
            permissions: permissions.filter((permission) => !permission.startsWith("finance.")),
          },
        },
        source.id,
        { company_id: f.company, expected_version: source.version },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(prepare(source, { expected_version: 1 })).rejects.toMatchObject({ code: "STALE_VERSION" });
    let operation = await prepare(source);
    operation = await f.repository.action(
      maker,
      operation.id,
      {
        company_id: f.company,
        expected_version: operation.version,
        action: "submit",
        reason: "Check independent approval",
      },
      randomUUID(),
    );
    await expect(
      f.repository.action(
        maker,
        operation.id,
        {
          company_id: f.company,
          expected_version: operation.version,
          action: "approve",
          reason: "Self approval must fail",
        },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "MAKER_CHECKER_REQUIRED" });
  });
  it("serves every connected report from persistent data with full-filter totals and pagination", async () => {
    await supplierBill("20", "PKR");
    for (const id of connectedReportIds) {
      const result = await report(id, { limit: 1 });
      expect(result.report).toBe(id);
      expect(result.rows.length).toBeLessThanOrEqual(1);
      expect(result.total_rows).toBeGreaterThanOrEqual(result.rows.length);
      expect(result.notes.length).toBeGreaterThan(0);
    }
    const result = await report("purchase-bill-detail-report", { limit: 1 });
    expect(result.totals.map((total) => total.currency)).toEqual(["PKR", "USD"]);
    expect(result.total_rows).toBeGreaterThan(1);
    const next = await report("purchase-bill-detail-report", { limit: 1, offset: 1 });
    expect(next.totals).toEqual(result.totals);
    expect(next.rows[0]?.id).not.toBe(result.rows[0]?.id);
    const balances = await report("bank-balance-report");
    expect(balances.rows.some((row) => row.currency === "USD" && row.values.closing !== "0")).toBe(true);
  });
  it("serializes concurrent preparation and rolls back a failure after journal creation", async () => {
    const sources = [await supplierBill(), await supplierBill()];
    const source = await payment(sources);
    const drafts = await Promise.all([prepare(source), prepare(source)]);
    expect(drafts[0]!.id).toBe(drafts[1]!.id);
    let operation = drafts[0]!;
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
    ] as const)
      operation = await f.repository.action(
        context,
        operation.id,
        { company_id: f.company, expected_version: operation.version, action, reason: "Atomic group rollback review" },
        randomUUID(),
      );
    class FailAfterJournal extends FinancePostingService {
      override async postMultiCurrency(...args: Parameters<FinancePostingService["postMultiCurrency"]>) {
        await super.postMultiCurrency(...args);
        throw new Error("Injected disposable failure after journal insertion");
      }
    }
    const count = async () =>
      (
        await f.pool.query("select count(*)::int as total from journal_entry where tenant_id=$1 and company_id=$2", [
          f.tenant,
          f.company,
        ])
      ).rows[0].total;
    const before = await count();
    const key = randomUUID();
    const input = {
      company_id: f.company,
      expected_version: operation.version,
      action: "post" as const,
      reason: "Verify atomic group rollback",
    };
    await expect(
      new SourceSubledgerRepository(f.pool, new FailAfterJournal()).action(poster, operation.id, input, key),
    ).rejects.toThrow("Injected disposable failure");
    expect(await count()).toBe(before);
    for (const { bill } of sources)
      expect(decimal((await procurement.get(maker, f.company, bill.id)).outstanding_amount!, 8)).toBe(decimal("10", 8));
    const posted = await f.repository.action(poster, operation.id, input, key);
    expect(posted.state).toBe("posted");
    expect(await count()).toBe(before + 1);
    expect((await f.repository.action(poster, operation.id, input, key)).journal_id).toBe(posted.journal_id);
    expect(await count()).toBe(before + 1);
  });
  it("retains dated openings and makes reversal effects visible without mixing currencies", async () => {
    const balances = await report("bank-balance-report", { from: "2026-11-19", as_of: "2026-11-19" });
    const bank = balances.rows.find((row) => row.source_id === f.banks.USD)!;
    expect(bank.values.opening).toBe(bank.values.closing);
    expect(Number(bank.values.debit)).toBe(0);
    expect(Number(bank.values.credit)).toBe(0);
    const activity = await report("bank-account-activity-report");
    expect(activity.rows.some((row) => row.values.source_type === "reversal")).toBe(true);
    expect(activity.totals.find((total) => total.currency === "USD")?.values.closing).toBe(bank.values.closing);
    const denied = { ...maker, actor: { ...maker.actor, permissions: [] } };
    await expect(
      new ConnectedReports(f.repository).run(
        denied,
        connectedReportQuerySchema.parse({ company_id: f.company, report: "bank-balance-report", as_of: "2026-11-18" }),
      ),
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      new ConnectedReports(f.repository).run(
        maker,
        connectedReportQuerySchema.parse({
          company_id: "other-company",
          report: "purchase-bill-detail-report",
          as_of: "2026-11-18",
        }),
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("shows finalized statement evidence separately and links the posted Purchase reference to reconciliation", async () => {
    const source = await payment([await supplierBill()]);
    const posted = await post(await prepare(source));
    const statements = new SourceBankStatementImportRepository(f.pool),
      reconciliations = new SourceBankReconciliationRepository(f.pool);
    const id = `import-${randomUUID()}`,
      sha = (text: string) => createHash("sha256").update(text).digest("hex");
    const created = await statements.createImport(
      maker,
      {
        id,
        fields: {
          company_id: f.company,
          bank_account_id: f.banks.USD!,
          statement_reference: source.code,
          date_format: "yyyy-MM-dd",
        },
        originalFilename: "synthetic-purchase-bank.csv",
        fileFormat: "csv",
        detectedMediaType: "text/csv",
        mappingProfileId: null,
        mappingSnapshot: {
          file_format: "csv",
          delimiter: ",",
          encoding: "utf-8",
          worksheet: null,
          header_row: 1,
          date_format: "yyyy-MM-dd",
          amount_convention: "separate_debit_credit",
          signed_amount_direction: null,
          columns: {
            date: "Date",
            payment: "Payment",
            receipt: "Receipt",
            signed_amount: null,
            reference: "Reference",
            details: "Details",
            transaction_type: null,
            account_text: null,
            payment_mode: null,
          },
        },
        object: {
          objectKey: `bank-statements/quarantine/${f.tenant}/${f.company}/${id}.csv`,
          sizeBytes: 128,
          checksumSha256: sha(id),
          contentType: "text/csv",
          etag: sha(id + "etag"),
        },
        lines: [
          {
            sourceRowNumber: 2,
            rawRow: { Date: "2026-11-18", Payment: "10.00", Reference: source.code },
            transactionDate: "2026-11-18",
            direction: "money_out",
            amount: "10.00000000",
            currency: "USD",
            reference: source.code,
            details: "Synthetic supplier payment evidence",
            transactionType: null,
            accountText: null,
            paymentMode: null,
            rowFingerprint: sha(id + "row"),
            inclusionState: "included",
            exclusionReason: null,
            validationState: "valid",
            duplicateDisposition: "not_applicable",
            issues: [],
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    const validated = await statements.validate(
      maker,
      id,
      { expected_version: created.version },
      randomUUID(),
      randomUUID(),
    );
    await statements.finalize(maker, id, { expected_version: validated.version }, randomUUID(), randomUUID());
    expect((await report("bank-unmatched-report")).rows.some((row) => row.source_id === id)).toBe(true);
    const reconciliation = await reconciliations.create(
      maker,
      {
        company_id: f.company,
        bank_account_id: f.banks.USD!,
        method: "statement_import",
        import_id: id,
        reconciliation_date: "2026-11-18",
        statement_date: "2026-11-18",
        period_start: "2026-11-18",
        period_end: "2026-11-18",
        statement_reference: source.code,
        opening_statement_balance: "0.00000000",
        closing_statement_balance: "-10.00000000",
      },
      randomUUID(),
      randomUUID(),
    );
    const detail = await reconciliations.get(maker, reconciliation.id);
    expect(
      detail.ledger_candidates.some((line) => line.journal_id === posted.journal_id && line.reference === source.code),
    ).toBe(true);
    expect((await report("bank-reconciliation-report")).rows.some((row) => row.source_id === reconciliation.id)).toBe(
      true,
    );
    expect((await report("bank-unmatched-report")).rows.some((row) => row.source_id === id)).toBe(false);
  });
  it("uses the configured July-to-June financial year without guessing January", async () => {
    const company = `fy-${randomUUID()}`;
    const fiscalPermissions = [
      "platform.approval.override",
      "platform.fiscal_calendar.read",
      "platform.fiscal_calendar.create",
      "platform.accounting_period.read",
      "banking.bank_account.read",
    ];
    await f.pool.query(
      "insert into organization_unit(tenant_id,id,type,code,name,status) values($1,$2,'company',$2,'Synthetic July financial year','active')",
      [f.tenant, company],
    );
    for (const [user, policy] of [
      ["r06.maker", "r06-uat-policy-maker"],
      ["r06.override-admin", "r06-uat-policy-approval-override"],
    ]) {
      await f.pool.query(
        "insert into security_user_company_access(tenant_id,access_id,user_id,company_id,is_default,granted_by,source_kind,source_reference) values($1,$2,$3,$4,false,'r06.last-admin-a','governed_administration','disposable-fiscal-report')",
        [f.tenant, randomUUID(), user, company],
      );
      await f.pool.query(
        "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, fiscalPermissions],
      );
      await f.pool.query(
        "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
        [f.tenant, policy, fiscalPermissions, company],
      );
    }
    const admin = actor("r06.override-admin");
    admin.actor.roles = ["super_administrator"];
    admin.actor.permissions = [...admin.actor.permissions, ...fiscalPermissions];
    await new SourceFiscalCalendarRepository(f.pool).create(
      admin,
      { company_id: company, period_start: "2026-07-01" },
      randomUUID(),
      randomUUID(),
    );
    const june = await report("bank-balance-report", { company_id: company, as_of: "2027-06-30" });
    expect(june.from).toBe("2026-07-01");
    const july = await report("bank-balance-report", { company_id: company, as_of: "2026-07-01" });
    expect(july.from).toBe("2026-07-01");
    expect(july.totals.every((total) => Number(total.values.closing) === 0)).toBe(true);
    await expect(report("bank-balance-report", { company_id: company, as_of: "2027-07-01" })).rejects.toMatchObject({
      code: "REPORT_FISCAL_YEAR_MISSING",
    });
  });
  it.each(["PKR"])("preserves %s Bank currency precision and Finance conversion", async (currency) => {
    const source = await payment([await supplierBill("10", currency)], { currency });
    const posted = await post(await prepare(source));
    const credit = posted.preview!.lines.filter((line) => line.accountId === `${f.company}-bank-${currency}`);
    expect(credit).toHaveLength(1);
    expect(credit[0]!.currency).toBe(currency);
    expect(credit[0]!.credit).toBe("10.00");
  });
  it.each(["JPY", "KWD"])("preserves the existing Purchase form currency restriction for %s", async (currency) => {
    await expect(supplierBill("10", currency)).rejects.toThrow("two decimal places");
  });
  it("allows maker-only mapping revisions before review with version checks and fresh approval", async () => {
    const source = await payment([await supplierBill()]);
    let operation = await prepare(source);
    const input = {
      company_id: f.company,
      expected_version: source.version,
      expected_operation_version: operation.version,
      bank_fee: "1",
    };
    await expect(f.repository.preparePurchase(checker, source.id, input, randomUUID())).rejects.toMatchObject({
      code: "MAKER_REQUIRED",
    });
    const revised = await f.repository.preparePurchase(maker, source.id, input, randomUUID());
    expect(revised.id).toBe(operation.id);
    expect(revised.version).toBe(operation.version + 1);
    expect(revised.state).toBe("draft");
    expect(revised.approver_id).toBeNull();
    await expect(f.repository.preparePurchase(maker, source.id, input, randomUUID())).rejects.toMatchObject({
      code: "STALE_VERSION",
    });
    operation = await f.repository.action(
      maker,
      revised.id,
      {
        company_id: f.company,
        expected_version: revised.version,
        action: "submit",
        reason: "Review revised accounting mappings",
      },
      randomUUID(),
    );
    await expect(
      f.repository.preparePurchase(
        maker,
        source.id,
        { ...input, expected_operation_version: operation.version },
        randomUUID(),
      ),
    ).rejects.toMatchObject({ code: "PURCHASE_ACCOUNTING_REVIEW_LOCKED" });
    operation = await f.repository.action(
      checker,
      operation.id,
      {
        company_id: f.company,
        expected_version: operation.version,
        action: "approve",
        reason: "Independent review of revised mapping",
      },
      randomUUID(),
    );
    const posted = await f.repository.action(
      poster,
      operation.id,
      {
        company_id: f.company,
        expected_version: operation.version,
        action: "post",
        reason: "Post revised reviewed source",
      },
      randomUUID(),
    );
    expect(posted.preview!.lines.find((line) => line.accountId === `${f.company}-bank-USD`)?.credit).toBe("11.00");
    expect(
      (
        await f.pool.query(
          "select count(*)::int as total from procurement_accounting_link where tenant_id=$1 and company_id=$2 and document_id=$3",
          [f.tenant, f.company, source.id],
        )
      ).rows[0].total,
    ).toBe(1);
  });
});
