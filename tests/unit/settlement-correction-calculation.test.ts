import { describe, it, expect } from "vitest";
import {
  recalculateSettlementPayroll as recalculate,
  settlementCorrectionJournal,
  type CorrectionPayroll,
} from "../../server/api/src/modules/hr/settlement-correction-calculation.js";
import { executeStatutoryFormula } from "../../server/api/src/modules/hr/payroll-statutory-rules.js";
function payroll(month = "2026-01-01", ytd = false): CorrectionPayroll {
  const rule = {
    id: "synthetic-rule-v1",
    rule_id: "synthetic-rule",
    rule_type: "safe_formula",
    configuration_json: {
      schema_version: 1,
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      formula: ytd
        ? "max(0, (TAXABLE_GROSS + YTD_TAXABLE_SALARY - LIMIT) * RATE - YTD_SALARY_TAX_WITHHELD)"
        : "TAXABLE_GROSS * RATE",
      constants: ytd ? { RATE: "0.1", LIMIT: "1500" } : { RATE: "0.1" },
    },
    applicability_json: { schema_version: 1, all: [{ variable: "TAXABLE_GROSS", operator: "gte", value: "0" }] },
    output_definition_json: {
      schema_version: 1,
      line_code: "FIXTURE_TAX",
      line_name: "Synthetic retained test tax",
      line_kind: "deduction",
      component_code: "TEST_TAX",
    },
  };
  const inputs = ytd
      ? {
          TAXABLE_GROSS: "1000.00",
          YTD_TAXABLE_SALARY: month === "2026-01-01" ? "0" : "1000.00",
          YTD_SALARY_TAX_WITHHELD: "0",
        }
      : { TAXABLE_GROSS: "1000.00" },
    calculation = executeStatutoryFormula(rule, inputs);
  const lines = [
    {
      component_id: "salary",
      component_code: "BASIC",
      component_name: "Monthly salary",
      kind: "earning" as const,
      amount: "900.00",
      expense_account_id: "expense",
      liability_account_id: null,
      source: "salary:fixture",
    },
    {
      component_id: "benefit",
      component_code: "BENEFIT",
      component_name: "Settlement benefit",
      kind: "earning" as const,
      amount: "100.00",
      expense_account_id: "expense",
      liability_account_id: null,
      source: "adjustment:fixture",
    },
    {
      component_id: "tax",
      component_code: "TEST_TAX",
      component_name: "Synthetic retained test tax",
      kind: "deduction" as const,
      amount: calculation.amount,
      expense_account_id: null,
      liability_account_id: "tax-liability",
      source: "statutory:synthetic-rule-v1",
    },
  ];
  const net = String(1000 - Number(calculation.amount));
  return {
    result_id: month,
    month,
    currency_code: "PKR",
    money_scale: 2,
    net_payable_account_id: "net-liability",
    lines,
    gross: "1000.00",
    deductions: calculation.amount,
    net,
    employer_contributions: "0.00",
    statutory: {
      status: "ready",
      blockers: [],
      outputs: [
        {
          rule,
          component: {
            id: "tax",
            code: "TEST_TAX",
            name: "Synthetic retained test tax",
            expense_account_id: null,
            liability_account_id: "tax-liability",
          },
          calculation,
          inputs,
          sources: ytd
            ? {
                prior_results:
                  month === "2026-01-01"
                    ? []
                    : [{ id: "2026-01-01", taxable: "1000.00", withheld: "0.00", currency_code: "PKR" }],
              }
            : {},
          input_hash: "fixture",
          output_hash: "fixture",
        },
      ],
      lines: [lines[2]!],
      gross: "1000.00",
      deductions: calculation.amount,
      net,
      employer_contributions: "0.00",
      taxable_gross: "1000.00",
      profile: { id: "retained-company-profile" },
      locations: [],
      packs: [],
      input_hash: "fixture",
      resolved_set_hash: "retained-rules",
      mode: "production",
    },
  };
}
describe("Retained settlement Payroll correction arithmetic (synthetic rules)", () => {
  it("recalculates the captured tax rule and balances only the account differences", () => {
    const before = payroll(),
      after = recalculate(before, [{ source: "adjustment:fixture", amount: "200.00", taxable: true }], new Map());
    expect(after).toMatchObject({ gross: "1100.00", deductions: "110.00", net: "990.00" });
    expect(settlementCorrectionJournal([before], [after])).toEqual({
      debit: "100.0000",
      credit: "100.0000",
      lines: [
        { account_id: "expense", debit: "100.0000", credit: "0.0000" },
        { account_id: "net-liability", debit: "0.0000", credit: "90.0000" },
        { account_id: "tax-liability", debit: "0.0000", credit: "10.0000" },
      ],
    });
    expect(before.net).toBe("900");
  });
  it("keeps non-taxable differences out of taxable gross", () => {
    const after = recalculate(
      payroll(),
      [{ source: "adjustment:fixture", amount: "200.00", taxable: false }],
      new Map(),
    );
    expect(after).toMatchObject({ gross: "1100.00", deductions: "100.00", net: "1000.00" });
  });
  it("records negative corrections as exact reversals of changed accounts", () => {
    const before = payroll(),
      after = recalculate(before, [{ source: "adjustment:fixture", amount: "50.00", taxable: true }], new Map()),
      journal = settlementCorrectionJournal([before], [after]);
    expect(after.net).toBe("855.00");
    expect(journal.debit).toBe("50.0000");
    expect(journal.lines.find((x) => x.account_id === "expense")).toMatchObject({ credit: "50.0000" });
  });
  it("carries corrected taxable gross and withholding into a later retained YTD formula", () => {
    const first = payroll("2026-01-01", true),
      second = payroll("2026-02-01", true),
      correctedFirst = recalculate(
        first,
        [{ source: "adjustment:fixture", amount: "200.00", taxable: true }],
        new Map(),
      ),
      correctedSecond = recalculate(second, [], new Map([[first.result_id, correctedFirst]]));
    expect(second.deductions).toBe("50.00");
    expect(correctedSecond.deductions).toBe("60.00");
    expect(correctedSecond.statutory.outputs[0]!.sources.prior_results).toMatchObject([
      { id: first.result_id, taxable: "1100.00", withheld: "0.00" },
    ]);
  });
  it("preserves declarations, rule identities and original evidence", () => {
    const before = payroll(),
      captured = JSON.stringify(before),
      after = recalculate(before, [{ source: "adjustment:fixture", amount: "200.00", taxable: true }], new Map());
    expect(after.statutory.resolved_set_hash).toBe(before.statutory.resolved_set_hash);
    expect(after.statutory.outputs[0]!.rule).toEqual(before.statutory.outputs[0]!.rule);
    expect(JSON.stringify(before)).toBe(captured);
  });
  it("rejects a missing, duplicate or non-settlement correction source", () => {
    expect(() => recalculate(payroll(), [{ source: "missing", amount: "10.00", taxable: true }], new Map())).toThrow();
    expect(() =>
      recalculate(payroll(), [{ source: "salary:fixture", amount: "10.00", taxable: true }], new Map()),
    ).toThrow();
    expect(() =>
      recalculate(
        payroll(),
        [
          { source: "adjustment:fixture", amount: "10.00", taxable: true },
          { source: "adjustment:fixture", amount: "20.00", taxable: true },
        ],
        new Map(),
      ),
    ).toThrow();
  });
  it("rejects test-mode statutory evidence and precision loss", () => {
    const test = payroll();
    test.statutory.mode = "test";
    expect(() => recalculate(test, [], new Map())).toThrow(/production/);
    expect(() =>
      recalculate(payroll(), [{ source: "adjustment:fixture", amount: "10.001", taxable: true }], new Map()),
    ).toThrow(/precision/);
  });
  it("rejects a journal assembled from inconsistent employee totals", () => {
    const bad = payroll();
    bad.net = "1.00";
    expect(() => settlementCorrectionJournal([bad], [payroll()])).toThrow(/reconcile/);
  });
});
