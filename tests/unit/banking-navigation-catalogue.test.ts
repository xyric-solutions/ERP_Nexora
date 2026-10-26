import { describe, expect, it } from "vitest";

import { prototypeModules } from "../../app/shell/config/prototype-data.js";

describe("Banking navigation catalogue", () => {
  it("does not expose the retired 1Bill screen while preserving the live Bank workflows", () => {
    const banking = prototypeModules.find((module) => module.id === "banking");
    const bankGroup = banking?.groups.find((group) => group.id === "bank");
    const pages = bankGroup?.pages ?? [];

    expect(pages.map((page) => page.id)).not.toContain("one-bill");
    expect(pages.map((page) => page.label)).not.toContain("1Bill");
    expect(pages.map((page) => page.id)).toEqual(
      expect.arrayContaining([
        "account-balances",
        "bank-payments",
        "bank-receipts",
        "transfers",
        "bank-reconciliation",
        "import-statement",
        "revaluation",
      ]),
    );
  });
});
