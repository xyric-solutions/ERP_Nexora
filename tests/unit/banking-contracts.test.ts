import { describe, expect, it } from "vitest";

import {
  bankAccountDirectoryQuerySchema,
  createBankAccountRequestSchema,
  decideBankAccountRequestSchema,
  updateBankAccountRequestSchema,
} from "@nexora/contracts";

const validCreate = {
  company_id: "company-1",
  account_name: "Operating PKR",
  account_type: "current",
  bank_name: "First Meridian Bank",
  branch: "Karachi Main",
  account_number: "001234567890",
  iban: "PK36SCBL0000001123456702",
  swift_bic: "SCBLPKKX",
  currency: "PKR",
  ledger_account_id: "account-bank-control",
  overdraft_limit: "0.00",
  opening_balance: "0",
} as const;

describe("Banking contracts", () => {
  it("accepts a zero-opening-balance bank account draft", () => {
    expect(createBankAccountRequestSchema.parse(validCreate)).toEqual(validCreate);
  });

  it("rejects a non-zero opening balance until Finance posting is implemented", () => {
    const result = createBankAccountRequestSchema.safeParse({ ...validCreate, opening_balance: "1.00" });
    expect(result.success).toBe(false);
  });

  it("rejects browser-controlled lifecycle and tenant authority", () => {
    const result = createBankAccountRequestSchema.safeParse({
      ...validCreate,
      tenant_id: "other-tenant",
      state: "active",
      approved_by: "maker",
    });
    expect(result.success).toBe(false);
  });

  it("requires optimistic versions for updates and decisions", () => {
    expect(updateBankAccountRequestSchema.safeParse({ account_name: "Updated", opening_balance: "0" }).success).toBe(
      false,
    );
    expect(
      decideBankAccountRequestSchema.safeParse({ action: "approve", reason: "Reviewed account evidence" }).success,
    ).toBe(false);
  });

  it("bounds directory filters", () => {
    expect(bankAccountDirectoryQuerySchema.parse({ company_id: "company-1" }).limit).toBe(50);
    expect(bankAccountDirectoryQuerySchema.safeParse({ company_id: "company-1", limit: 101 }).success).toBe(false);
    expect(bankAccountDirectoryQuerySchema.safeParse({ company_id: "company-1", currency: "pkr" }).success).toBe(false);
  });
});
