import { existsSync, readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const platformMigration = new URL(
  "../../packages/db/source-migrations/platform/0011_company_currency_profiles.forward.sql",
  import.meta.url,
);
const securityMigration = new URL(
  "../../packages/db/source-migrations/security/0019_bank_revaluation_permissions.forward.sql",
  import.meta.url,
);
const financeMigration = new URL(
  "../../packages/db/source-migrations/finance/0030_bank_fx_revaluation.forward.sql",
  import.meta.url,
);

describe("Company currency and Bank Revaluation migrations", () => {
  it("adds immutable country mappings and company-scoped currency authority in Platform 11", () => {
    expect(existsSync(platformMigration), "Platform 0011 must exist").toBe(true);
    const source = readFileSync(platformMigration, "utf8");

    expect(source).toContain("CREATE TABLE country_currency_catalog");
    expect(source).toContain("CREATE TABLE company_currency_profile");
    expect(source).toContain("CREATE TABLE company_currency");
    expect(source.match(/'dotnet-region-2026-10-26'/gu)?.length).toBeGreaterThanOrEqual(240);
    expect(source).toContain("ADD COLUMN company_id text");
    expect(source).toContain("currency_rate_company_one_current_revision");
    expect(source).toContain("Company base currency is locked after the first posted journal");
    expect(source).toContain("FORCE ROW LEVEL SECURITY");
    expect(source).toContain("VALUES('platform',11,'company_currency_profiles')");
    expect(source).not.toMatch(/DROP TABLE|TRUNCATE/u);
  });

  it("adds exact company-currency and revaluation permissions in Security 19", () => {
    expect(existsSync(securityMigration), "Security 0019 must exist").toBe(true);
    const source = readFileSync(securityMigration, "utf8");

    for (const permission of [
      "finance.company_currency_profile.read",
      "finance.company_currency_profile.manage",
      "finance.company_currency.read",
      "finance.company_currency.manage",
      "finance.company_currency_rate.read",
      "finance.company_currency_rate.manage",
      "banking.revaluation_policy.read",
      "banking.revaluation_policy.manage",
      "banking.revaluation.read",
      "banking.revaluation.create",
      "banking.revaluation.update",
      "banking.revaluation.submit",
      "banking.revaluation.approve",
      "banking.revaluation.post",
      "banking.revaluation.reverse",
    ]) {
      expect(source).toContain(permission);
    }
    expect(source).toContain("VALUES('security',19,'bank_revaluation_permissions')");
  });

  it("adds guarded revaluation, immutable evidence and durable reversal authority in Finance 30", () => {
    expect(existsSync(financeMigration), "Finance 0030 must exist").toBe(true);
    const source = readFileSync(financeMigration, "utf8");

    expect(source).toContain("CREATE TABLE bank_revaluation_policy");
    expect(source).toContain("CREATE TABLE bank_revaluation");
    expect(source).toContain("CREATE TABLE bank_revaluation_line");
    expect(source).toContain("CREATE TABLE bank_revaluation_event");
    expect(source).toContain("CREATE TABLE bank_revaluation_reversal_schedule");
    expect(source).toContain("CREATE FUNCTION guard_bank_account_company_currency()");
    expect(source).toContain("Bank account currency is immutable after financial activity");
    expect(source).toContain("Bank Revaluation makers cannot decide their own submission");
    expect(source).toContain("base_decimal_places smallint NOT NULL CHECK (base_decimal_places BETWEEN 0 AND 8)");
    expect(source).toContain("round(foreign_balance*closing_rate,base_decimal_places)");
    expect(source).toContain("base precision must match the locked header evidence");
    expect(source).toContain("bank_revaluation_one_source_journal");
    expect(source).toContain("bank_revaluation_reversal_one_journal");
    expect(source).toContain("bank_revaluation_event_one_version_type");
    expect(source).toContain("WHERE event_type<>'reversal_failed'");
    expect(source).toContain("FORCE ROW LEVEL SECURITY");
    expect(source).toContain("VALUES('finance',30,'bank_fx_revaluation')");
    expect(source).not.toMatch(/DROP TABLE|TRUNCATE/u);
  });
});
