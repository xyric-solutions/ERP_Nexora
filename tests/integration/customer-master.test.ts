import { randomBytes, randomUUID } from "node:crypto";
import { expect, test } from "vitest";
import { customerMasterInputSchema, customerMasterQuerySchema } from "../../packages/contracts/src/index.js";
import { SourceSubledgerRepository } from "../../server/api/src/modules/finance/subledger/source-repository.js";
import { SupplierProfileCrypto } from "../../server/api/src/modules/procurement/supplier-profile-crypto.js";
import { createDisposableSourceDatabase } from "../security/disposable-source-database.js";
import { setupSubledgerFixture, subledgerActor } from "./subledger-fixture.js";

test("customer profiles keep the commercial identity, enforce company and version, and encrypt banking data", async () => {
  const db = await createDisposableSourceDatabase(
    process.env.TEST_SOURCE_BOOTSTRAP_DATABASE_URL ?? "postgresql://nexora@127.0.0.1:55433/nexora_source_test",
  );
  try {
    const { company } = await setupSubledgerFixture(db.pool);
    const repository = new SourceSubledgerRepository(
      db.pool,
      undefined,
      new SupplierProfileCrypto(randomBytes(32).toString("base64"), "test"),
    );
    const actor = subledgerActor();
    const input = customerMasterInputSchema.parse({
      company_id: company,
      name: "Profile test customer",
      tax_id: "TAX-123",
      email: "contact@example.invalid",
      phone: "",
      address: "Billing address",
      status: "active",
      default_currency: "USD",
      profile: {
        contact_name: "Main contact",
        bank_accounts: [
          {
            id: "bank",
            bank_name: "Test bank",
            account_title: "Customer",
            account_number: "123123665544",
            is_default: true,
          },
        ],
      },
    });
    const key = randomUUID();
    const created = await repository.createCustomerMaster(actor, input, key);
    expect(created).toMatchObject({ version: 1, code: /^CUS-\d{3,}$/ });
    expect(await repository.createCustomerMaster(actor, input, key)).toEqual(created);
    const directory = await repository.customerMasters(
      actor,
      customerMasterQuerySchema.parse({ company_id: company, search: "tax-123" }),
    );
    expect(directory.items).toMatchObject([{ id: created.id, email: input.email }]);
    expect(JSON.stringify(directory)).not.toContain("123123665544");
    const stored = await db.pool.query("select profile::text from sales_customer_profile where company_id=$1", [
      company,
    ]);
    expect(stored.rows[0]?.profile).toContain("ciphertext");
    expect(stored.rows[0]?.profile).not.toContain("123123665544");
    expect(await repository.customerMaster(actor, company, created.id)).toMatchObject({ profile: input.profile });
    await expect(repository.customerMaster(actor, "unassigned-company", created.id)).rejects.toMatchObject({
      status: 403,
    });
    const { default_currency, ...fields } = input;
    const update = { ...fields, expected_version: 1, name: "Updated test customer" };
    expect(await repository.updateCustomerMaster(actor, created.id, update, randomUUID())).toMatchObject({
      ...created,
      version: 2,
    });
    await expect(repository.updateCustomerMaster(actor, created.id, update, randomUUID())).rejects.toMatchObject({
      status: 412,
    });
    expect(await repository.customerMaster(actor, company, created.id)).toMatchObject({
      name: update.name,
      default_currency,
      version: 2,
    });
  } finally {
    await db.close();
  }
}, 60_000);
