import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const repository = new URL("../../server/api/src/modules/banking/statements/source-repository.ts", import.meta.url);

describe("Bank Statement import directory dates", () => {
  it("derives each import's date bounds in the company-scoped directory query", () => {
    const source = readFileSync(repository, "utf8");

    expect(source).toContain("min(line.transaction_date) as statement_date_from");
    expect(source).toContain("max(line.transaction_date) as statement_date_to");
    expect(source).toContain("line.company_id=statement.company_id");
    expect(source).toContain("line.import_id=statement.id");
  });
});
