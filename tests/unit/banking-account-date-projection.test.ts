import { describe, expect, it, vi } from "vitest";

import type { AuthenticatedAccount } from "@nexora/auth";
import type { Pool } from "pg";

import { BankingIdentifierCrypto } from "../../server/api/src/modules/banking/crypto.js";
import {
  SourceBankingRepository,
  type BankingActorContext,
} from "../../server/api/src/modules/banking/source-repository.js";

const actor: AuthenticatedAccount = {
  tenantId: "tenant-a",
  organizationName: "Tenant A",
  userId: "user-a",
  email: "user-a@example.test",
  displayName: "User A",
  roles: [],
  permissions: ["banking.bank_account.read"],
  sessionVersion: 1,
};
const context: BankingActorContext = { tenantId: "tenant-a", actor };

describe("Bank Account date-only projections", () => {
  it("preserves 2026-10-19 when PostgreSQL returns a local-midnight Date in Asia/Karachi", async () => {
    const query = vi.fn(async (statement: unknown) => {
      const sql = String(statement);
      if (sql.includes("select bank.id,bank.reference")) {
        return {
          rowCount: 1,
          rows: [
            {
              id: "bank-a",
              reference: "BA-2026-000001",
              account_name: "Operating Account",
              account_type: "current",
              bank_name: "Synthetic Bank",
              branch: "Main",
              account_number_masked: "•••• 1234",
              currency: "USD",
              ledger_account_id: "ledger-a",
              ledger_account_code: "10-01-00200",
              ledger_account_name: "Bank — Operating",
              ledger_balance: "125.00000000",
              available_balance: null,
              unreconciled_count: null,
              last_movement_on: new Date(2026, 9, 19),
              state: "active",
              version: "1",
            },
          ],
        };
      }
      return { rowCount: 1, rows: [{ exists: 1 }] };
    });
    const repository = new SourceBankingRepository(
      {
        connect: vi.fn().mockResolvedValue({ query, release: vi.fn() }),
      } as unknown as Pool,
      new BankingIdentifierCrypto(Buffer.alloc(32, 17).toString("base64"), "unit-v1"),
    );

    const result = await repository.listAccounts(context, {
      company_id: "company-a",
      sort_by: "account_name",
      sort_direction: "asc",
      limit: 50,
    });

    expect(result.items[0]?.last_movement_on).toBe("2026-10-19");
  });
});
