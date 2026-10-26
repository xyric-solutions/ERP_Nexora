import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const repository = new URL("../../server/api/src/modules/banking/revaluations/source-repository.ts", import.meta.url);

describe("Bank Revaluation source repository safeguards", () => {
  it("bounds the same-company active foreign Bank Account population in one aggregate query", () => {
    const source = readFileSync(repository, "utf8");

    expect(source).toContain("bank.tenant_id=$1 and bank.company_id=$2 and bank.currency=$3");
    expect(source).toContain("company_currency.status='active'");
    expect(source).toContain("bank.status='active'");
    expect(source).toContain("order by bank.id limit 10001");
    expect(source).toContain("group by eligible.bank_account_id");
    expect(source).toContain("REVALUATION_ACCOUNT_POPULATION_TOO_LARGE");
  });

  it("uses serializable draft mutations and rejects changed submit evidence", () => {
    const source = readFileSync(repository, "utf8");

    expect(source).toContain('"begin isolation level serializable"');
    expect(source).toContain("journal.posting_date<=$4::date");
    expect(source).toContain("refreshed.source_fingerprint !== current.source_fingerprint");
    expect(source).toContain("REVALUATION_REFRESH_REQUIRED");
  });
});
