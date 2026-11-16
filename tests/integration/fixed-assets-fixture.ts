import { randomUUID, randomBytes } from "node:crypto";
import {
  assetCategoryInputSchema,
  assetCreateSchema,
  assetEventInputSchema,
  savePurchaseRequestSchema,
  supplierInputSchema,
  type FixedAsset,
  type AssetEventInput,
  type SubledgerRequest,
  type PurchaseDocument,
  type PurchaseKind,
} from "../../packages/contracts/src/index.js";
import type { DatabasePool } from "../../packages/db/src/index.js";
import type { ObjectStorage } from "../../packages/domain/src/storage/object-storage.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";
import { FixedAssetsService } from "../../server/api/src/modules/fixed-assets/service.js";
import { SourceBankPaymentRepository } from "../../server/api/src/modules/banking/payments/source-repository.js";
import { SourceBankReceiptRepository } from "../../server/api/src/modules/banking/receipts/source-repository.js";
import { SourceProcurementRepository } from "../../server/api/src/modules/procurement/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";

export const assetPermissions = [
  "read",
  "create",
  "edit",
  "approve",
  "transfer",
  "return",
  "depreciate",
  "reverse",
  "maintain",
  "impair",
  "dispose",
  "categories",
  "report",
].map((action) => `assets.asset.${action}`);
export async function setupAssetFixture(pool: DatabasePool, storage?: ObjectStorage) {
  const f = await setupSubledgerFixture(pool),
    service = new FixedAssetsService(pool, storage),
    permissions = [
      ...assetPermissions,
      ...["read", "create", "update", "submit", "approve", "post", "reverse"].flatMap((action) => [
        `banking.payment.${action}`,
        `banking.receipt.${action}`,
      ]),
      "banking.bank_account.read",
      ...[
        "document.read",
        "document.create",
        "document.action",
        "document.submit",
        "document.approve",
        "vendor.read",
        "vendor.create",
      ].map((action) => `procurement.${action}`),
    ];
  for (const policy of ["r06-uat-policy-maker", "r06-uat-policy-checker", "r06-uat-policy-payment-poster"]) {
    await pool.query(
      "insert into security_role_permission_grant(tenant_id,role_policy_id,permission_key,field_allow_mode) select $1,$2,p,'all' from unnest($3::text[]) p on conflict do nothing",
      [f.tenant, policy, permissions],
    );
    await pool.query(
      "insert into security_role_scope_grant(tenant_id,role_policy_id,permission_key,scope_kind,scope_value) select $1,$2,p,'company',$4 from unnest($3::text[]) p on conflict do nothing",
      [f.tenant, policy, permissions, f.company],
    );
  }
  const actor = (id = "r06.maker") => {
      const context = subledgerActor(id);
      return { ...context, actor: { ...context.actor, permissions: [...context.actor.permissions, ...permissions] } };
    },
    maker = actor(),
    checker = actor("r06.checker"),
    poster = actor("r06.target");
  const accounts: Record<string, string> = {};
  for (const [role, type] of [
    ["asset", "asset"],
    ["accumulated", "asset"],
    ["expense", "expense"],
    ["gain", "revenue"],
    ["loss", "expense"],
    ["impairment", "expense"],
    ["refund", "asset"],
  ] as const) {
    const id = `${f.company}-${role}-fa`;
    accounts[role] = id;
    await pool.query(
      "insert into account(id,tenant_id,company_id,code,name,type,status,created_at) values($1,$2,$3,$4,$4,$5,'active',clock_timestamp())",
      [id, f.tenant, f.company, `FA-${role}`, type],
    );
  }
  const category = await service.repository.saveCategory(
    maker,
    null,
    assetCategoryInputSchema.parse({
      company_id: f.company,
      expected_version: 0,
      name: "Computer equipment",
      active: true,
      asset_account_id: accounts.asset,
      accumulated_account_id: accounts.accumulated,
      expense_account_id: accounts.expense,
      gain_account_id: accounts.gain,
      loss_account_id: accounts.loss,
      impairment_account_id: accounts.impairment,
      useful_life_months: 48,
      method: "straight_line",
      annual_rate_percent: 25,
      residual_percent: 4,
      convention: "full_month",
      capitalization_threshold: "0",
    }),
    randomUUID(),
  );
  const procurement = new SourceProcurementRepository(
    pool,
    new SupplierProfileCrypto(randomBytes(32).toString("base64"), "asset-test"),
  );
  const vendor = (
    await procurement.saveSupplier(
      maker,
      null,
      supplierInputSchema.parse({ company_id: f.company, name: "Asset source supplier" }),
      randomUUID(),
      randomUUID(),
    )
  ).record;
  const party = await f.repository.createParty(
    maker,
    {
      company_id: f.company,
      kind: "supplier",
      name: vendor.name,
      default_currency: "PKR",
      source_supplier_id: vendor.id,
    },
    randomUUID(),
  );
  const payments = new SourceBankPaymentRepository(pool),
    receipts = new SourceBankReceiptRepository(pool);
  async function bankAcquisition(amount = "250000", date = "2026-09-01") {
    let record = await payments.create(
      maker,
      {
        company_id: f.company,
        approver_user_id: "r06.checker",
        bank_account_id: f.banks.PKR!,
        posting_date: date,
        lines: [
          {
            line_order: 1,
            document_date: date,
            external_reference: `asset-${randomUUID()}`,
            payment_method: "bank_transfer",
            nominal_account_id: accounts.asset!,
            narration: "Asset acquisition through JS Bank",
            amount,
            dimensions: {},
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    record = await payments.submit(maker, record.id, { expected_version: record.version }, randomUUID(), randomUUID());
    record = await payments.decide(
      checker,
      record.id,
      { action: "approve", expected_version: record.version },
      randomUUID(),
      randomUUID(),
    );
    const posted = await payments.post(
      poster,
      record.id,
      { expected_version: record.version },
      randomUUID(),
      randomUUID(),
    );
    const line = (
      await pool.query<{ id: string }>(
        "select id from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
        [f.tenant, posted.journal_id, accounts.asset],
      )
    ).rows[0]!.id;
    return { line, posted };
  }
  async function register(line: string, amount = "250000", serial = randomUUID(), residual = "10000") {
    return (
      await service.repository.create(
        maker,
        assetCreateSchema.parse({
          company_id: f.company,
          category_id: category.id,
          source_line_id: line,
          supplier_id: vendor.id,
          reason: "Register original posted acquisition",
          units: [
            {
              details: { name: "Laptop", serial_number: serial, condition: "new" },
              cost: amount,
              residual_value: residual,
              useful_life_months: 48,
              method: "straight_line",
              annual_rate_percent: 25,
              in_service_date: "2026-09-01",
              depreciation_start: "2026-09-01",
              assignment: {},
            },
          ],
        }),
        randomUUID(),
      )
    ).items[0]!;
  }
  async function activate(asset: FixedAsset) {
    let current = await service.repository.action(
      maker,
      asset.id,
      {
        company_id: f.company,
        expected_version: asset.version,
        action: "submit",
        reason: "Submit asset for independent approval",
      },
      randomUUID(),
    );
    current = await service.repository.action(
      checker,
      asset.id,
      {
        company_id: f.company,
        expected_version: current.version,
        action: "approve",
        reason: "Approve original acquisition evidence",
      },
      randomUUID(),
    );
    return service.repository.action(
      checker,
      asset.id,
      {
        company_id: f.company,
        expected_version: current.version,
        action: "activate",
        reason: "Available for operational use",
      },
      randomUUID(),
    );
  }
  async function postEvent(input: AssetEventInput) {
    let event = await service.lifecycle.create(maker, input, randomUUID());
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      event = await service.lifecycle.action(
        context,
        event.id,
        { company_id: f.company, expected_version: event.version, action, reason: "Governed asset lifecycle test" },
        randomUUID(),
      );
    return event;
  }
  async function postSubledger(input: SubledgerRequest) {
    let event = await f.repository.create(maker, input, randomUUID());
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      event = await f.repository.action(
        context,
        event.id,
        { company_id: f.company, expected_version: event.version, action, reason: "Governed source accounting test" },
        randomUUID(),
      );
    return event;
  }
  async function purchase(amount = "250000", quantity = "1", classified = false, expense = "0") {
    let source: PurchaseDocument | undefined, order: PurchaseDocument | undefined;
    for (const kind of ["request", "rfq", "order", "receipt", "bill"] as PurchaseKind[]) {
      const parent = kind === "bill" ? order : source;
      let document = (
        await procurement.save(
          maker,
          null,
          savePurchaseRequestSchema.parse({
            company_id: f.company,
            kind,
            supplier_id: ["request", "rfq"].includes(kind) ? null : vendor.id,
            source_id: parent?.id ?? null,
            invited_supplier_ids: kind === "rfq" ? [vendor.id] : [],
            approver_id: "r06.checker",
            document_date: "2026-09-01",
            currency: "PKR",
            reference: `ASSET-${kind}-${randomUUID()}`,
            lines: [
              {
                source_line_id: parent?.lines[0]?.id ?? null,
                item_code: "LAPTOP",
                description: "Computer equipment",
                quantity,
                uom: "Each",
                unit_price: amount,
                tax_percent: "0",
                ...(classified ? { asset_category_id: category.id } : {}),
              },
              ...(expense !== "0"
                ? [
                    {
                      source_line_id: parent?.lines[1]?.id ?? null,
                      item_code: "SERVICE",
                      description: "Ordinary service expense",
                      quantity: "1",
                      uom: "Each",
                      unit_price: expense,
                      tax_percent: "0",
                    },
                  ]
                : []),
            ],
          }),
          randomUUID(),
          randomUUID(),
        )
      ).record;
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
              reason: "Approve supplier acquisition document",
            },
            randomUUID(),
            randomUUID(),
          )
        ).record;
      source = document;
      if (kind === "order") order = document;
    }
    if (!source) throw Error("Purchase source missing");
    const posted = await postSubledger({
      company_id: f.company,
      date: "2026-09-01",
      reference: source.code,
      reason: "Recognize approved asset Purchase invoice",
      type: "recognition",
      side: "payable",
      kind: "invoice",
      party_id: party.id,
      currency: "PKR",
      amount: source.total_amount,
      due_date: "2026-09-30",
      monetary: true,
      ...(classified ? {} : { counter_account_id: accounts.asset! }),
      source_document_id: source.id,
    });
    const line = (
      await pool.query<{ id: string }>(
        "select id from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
        [f.tenant, posted.journal_id, accounts.asset],
      )
    ).rows[0]!.id;
    return { source, posted, line };
  }
  async function bankRefund(amount = "250000", date = "2026-11-01") {
    let record = await receipts.create(
      maker,
      {
        company_id: f.company,
        approver_user_id: "r06.checker",
        bank_account_id: f.banks.PKR!,
        posting_date: date,
        lines: [
          {
            line_order: 1,
            document_date: date,
            external_reference: `refund-${randomUUID()}`,
            receipt_method: "bank_transfer",
            payer_name: vendor.name,
            nominal_account_id: accounts.refund!,
            narration: "Actual vendor refund received",
            amount,
            dimensions: {},
          },
        ],
      },
      randomUUID(),
      randomUUID(),
    );
    record = await receipts.submit(maker, record.id, { expected_version: record.version }, randomUUID(), randomUUID());
    record = await receipts.decide(
      checker,
      record.id,
      { action: "approve", expected_version: record.version },
      randomUUID(),
      randomUUID(),
    );
    const posted = await receipts.post(
      poster,
      record.id,
      { expected_version: record.version },
      randomUUID(),
      randomUUID(),
    );
    const line = (
      await pool.query<{ id: string }>(
        "select id from journal_line where tenant_id=$1 and journal_id=$2 and account_id=$3",
        [f.tenant, posted.journal_id, accounts.refund],
      )
    ).rows[0]!.id;
    return { posted, line };
  }
  async function postDepreciation(asset: FixedAsset, month = 9) {
    let run = await service.depreciation.create(
      maker,
      {
        company_id: f.company,
        period_id: `period-${f.company}-${month}`,
        asset_ids: [asset.id],
        reason: "Preview controlled monthly depreciation",
      },
      randomUUID(),
    );
    for (const [context, action] of [
      [maker, "submit"],
      [checker, "approve"],
      [poster, "post"],
    ] as const)
      run = await service.depreciation.action(
        context,
        run.id,
        {
          company_id: f.company,
          expected_version: run.version,
          action,
          reason: "Independent monthly depreciation control",
        },
        randomUUID(),
      );
    return run;
  }
  return {
    ...f,
    service,
    accounts,
    category,
    vendor,
    party,
    actor,
    maker,
    checker,
    poster,
    payments,
    receipts,
    bankAcquisition,
    bankRefund,
    postDepreciation,
    register,
    activate,
    postEvent,
    postSubledger,
    purchase,
    event: (asset: FixedAsset, type: AssetEventInput["type"], rest: Record<string, unknown>) =>
      assetEventInputSchema.parse({
        company_id: f.company,
        asset_id: asset.id,
        expected_version: asset.version,
        type,
        date: "2026-10-31",
        reason: "Controlled asset lifecycle scenario",
        ...rest,
      }),
  };
}
