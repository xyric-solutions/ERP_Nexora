import { describe, expect, it } from "vitest";

import {
  createJournalRequestSchema,
  createRecurringJournalRequestSchema,
  decideJournalRequestSchema,
  deleteJournalRequestSchema,
  journalOptionsSchema,
  recurringJournalOccurrenceSchema,
} from "../../packages/contracts/src/finance/journals.js";
import { buildOpenApiDocument } from "../../packages/contracts/src/openapi-c4.js";

const balancedLines = [
  { account_id: "expense", description: "Expense", debit: "125.50", credit: "0", dimensions: {} },
  { account_id: "accrual", description: "Accrual", debit: "0", credit: "125.50", dimensions: {} },
];

describe("Finance Journal contracts", () => {
  it("accepts a bounded base-currency Manual Journal draft", () => {
    expect(
      createJournalRequestSchema.parse({
        company_id: "company-1",
        journal_date: "2026-10-29",
        reference_number: "Month-end accrual",
        lines: balancedLines,
      }),
    ).toMatchObject({ company_id: "company-1", lines: balancedLines });
  });

  it("rejects a line that has both debit and credit or neither side", () => {
    expect(() =>
      createJournalRequestSchema.parse({
        company_id: "company-1",
        journal_date: "2026-10-29",
        lines: [
          { ...balancedLines[0], credit: "1" },
          { ...balancedLines[1], credit: "0" },
        ],
      }),
    ).toThrow();
  });

  it("requires final confirmation for posting and a reason for rejection", () => {
    expect(() => decideJournalRequestSchema.parse({ expected_version: 2, action: "post", confirmed: false })).toThrow();
    expect(() =>
      decideJournalRequestSchema.parse({ expected_version: 2, action: "reject", confirmed: false }),
    ).toThrow();
    expect(decideJournalRequestSchema.parse({ expected_version: 2, action: "post", confirmed: true })).toMatchObject({
      action: "post",
      confirmed: true,
    });
  });

  it("requires an auditable permanent-deletion reason", () => {
    expect(() => deleteJournalRequestSchema.parse({ expected_version: 1, reason: "no" })).toThrow();
    expect(deleteJournalRequestSchema.parse({ expected_version: 1, reason: "Entered in error" })).toEqual({
      expected_version: 1,
      reason: "Entered in error",
    });
  });

  it("limits recurring templates to monthly or quarterly draft generation", () => {
    expect(
      createRecurringJournalRequestSchema.parse({
        company_id: "company-1",
        name: "Quarterly accrual",
        schedule: "quarterly",
        start_date: "2026-10-29",
        narration: "Quarterly accrued expense",
        lines: balancedLines,
      }).schedule,
    ).toBe("quarterly");
    expect(() =>
      createRecurringJournalRequestSchema.parse({
        company_id: "company-1",
        name: "Weekly accrual",
        schedule: "weekly",
        start_date: "2026-10-29",
        narration: "Invalid weekly schedule",
        lines: balancedLines,
      }),
    ).toThrow();
  });

  it("publishes exhausted as the terminal recurring retry state", () => {
    expect(
      recurringJournalOccurrenceSchema.parse({
        id: "occurrence-1",
        scheduled_date: "2026-10-29",
        state: "exhausted",
        manual_journal_id: null,
        attempt_count: 100,
        last_error_code: "RECURRING_JOURNAL_BASE_CURRENCY_MISSING",
        updated_at: "2026-10-29T00:00:00.000Z",
      }).state,
    ).toBe("exhausted");
  });

  it("publishes required nominal dimensions to Journal forms", () => {
    const parsed = journalOptionsSchema.parse({
      companies: [{ id: "company-1", code: "C01", name: "Nexora" }],
      selected_company_id: "company-1",
      base_currency: "PKR",
      decimal_places: 2,
      nominals: [{ id: "expense", code: "5000", name: "Expense", required_dimensions: ["cost_center"] }],
    });
    expect(parsed.nominals[0]?.required_dimensions).toEqual(["cost_center"]);
  });

  it("publishes all governed Journal paths in OpenAPI", () => {
    const paths = buildOpenApiDocument().paths;
    expect(paths).toHaveProperty("/finance/journals");
    expect(paths).toHaveProperty("/finance/journals/{journalId}/decision");
    expect(paths).toHaveProperty("/finance/journals/{journalId}/reversal");
    expect(paths).toHaveProperty("/finance/recurring-journals");
    expect(paths).toHaveProperty("/finance/recurring-journals/{templateId}/occurrences");
  });
});
