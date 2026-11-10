import { describe, expect, it } from "vitest";
import { supplierInputSchema, supplierProfileSchema } from "../../packages/contracts/src/index.js";

const bank = {
  id: "account-one",
  bank_name: "Synthetic Bank",
  account_title: "Synthetic supplier",
  account_number: "12345678",
  is_default: true,
};
describe("Supplier profile contracts", () => {
  it("accepts legacy payloads and defaults empty profiles without inventing banking details", () => {
    expect(supplierInputSchema.parse({ company_id: "company", name: "Supplier" }).profile).toBeUndefined();
    expect(supplierProfileSchema.parse({})).toMatchObject({
      entity_type: "company",
      bank_accounts: [],
      credit_days: 0,
      currency: "",
      delivery_same_as_billing: true,
    });
  });
  it("normalizes IBAN/SWIFT and validates the IBAN checksum", () => {
    const profile = supplierProfileSchema.parse({
      bank_accounts: [{ ...bank, iban: "pk36 scbl 0000 0011 2345 6702", swift: "scblpk kx".replace(" ", "") }],
    });
    expect(profile.bank_accounts[0]).toMatchObject({ iban: "PK36SCBL0000001123456702", swift: "SCBLPKKX" });
    expect(
      supplierProfileSchema.safeParse({ bank_accounts: [{ ...bank, iban: "PK00SCBL0000001123456702" }] }).success,
    ).toBe(false);
  });
  it.each([
    { bank_accounts: [{ ...bank, bank_name: " " }] },
    { bank_accounts: [{ ...bank, account_title: "" }] },
    { bank_accounts: [{ ...bank, account_number: "" }] },
    { bank_accounts: [{ ...bank, swift: "invalid" }] },
    { bank_accounts: [{ ...bank, is_default: false }] },
    { bank_accounts: [bank, { ...bank, id: "two" }] },
    { bank_accounts: [bank, { ...bank, id: "two", is_default: false }] },
    { bank_accounts: [bank, { ...bank, id: "two", iban: "PK36SCBL0000001123456702", is_default: false }] },
    {
      bank_accounts: Array.from({ length: 11 }, (_, index) => ({
        ...bank,
        id: String(index),
        account_number: String(index),
        is_default: index === 0,
      })),
    },
    { credit_days: -1 },
    { credit_days: 366 },
    { credit_days: 1.5 },
    { currency: "US" },
    { website: "javascript:alert(1)" },
    { notes: "a".repeat(4001) },
    { unexpected: true },
  ])("rejects invalid or unbounded profile details: %j", (profile) => {
    expect(supplierProfileSchema.safeParse(profile).success).toBe(false);
  });
});
