import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const migration = new URL(
  "../../packages/db/source-migrations/finance/0029_bank_reconciliation_manual_workflow.forward.sql",
  import.meta.url,
);

describe("Finance 0029 manual Bank Reconciliation migration", () => {
  it("adds dated reconciliation and imported ending-balance evidence without replacing existing relations", () => {
    const source = readFileSync(migration, "utf8");
    expect(source).toContain("ADD COLUMN reconciliation_date date");
    expect(source).toContain("ADD COLUMN running_balance numeric(38,8)");
    expect(source).toContain("ADD COLUMN statement_ending_date date");
    expect(source).toContain("ADD COLUMN statement_ending_balance numeric(38,8)");
    expect(source).not.toMatch(/DROP TABLE|TRUNCATE/u);
  });

  it("creates company-scoped manual selections and immutable audit evidence", () => {
    const source = readFileSync(migration, "utf8");
    expect(source).toContain("CREATE TABLE bank_reconciliation_manual_selection");
    expect(source).toContain("CREATE TABLE bank_reconciliation_manual_selection_event");
    expect(source).toContain("FOREIGN KEY (tenant_id,company_id,reconciliation_id,journal_line_id)");
    expect(source).toContain("CREATE TRIGGER bank_reconciliation_manual_selection_event_immutable");
    expect(source).toContain("CREATE POLICY bank_reconciliation_company_isolation");
    expect(source).toContain("FORCE ROW LEVEL SECURITY");
  });

  it("defines the company actor guard required by manual-selection triggers", () => {
    const source = readFileSync(migration, "utf8");
    const definition = source.indexOf(
      "CREATE OR REPLACE FUNCTION guard_bank_reconciliation_company_actors() RETURNS trigger",
    );
    const firstUse = source.indexOf("EXECUTE FUNCTION guard_bank_reconciliation_company_actors('changed_by')");

    expect(definition).toBeGreaterThanOrEqual(0);
    expect(firstUse).toBeGreaterThan(definition);
  });

  it("guards selection lifecycle and registers Finance version 29", () => {
    const source = readFileSync(migration, "utf8");
    expect(source).toContain("reconciliation.method<>'manual_tick'");
    expect(source).toContain("reconciliation.state NOT IN ('draft','in_progress')");
    expect(source).toContain("VALUES('finance',29,'bank_reconciliation_manual_workflow')");
  });
});
