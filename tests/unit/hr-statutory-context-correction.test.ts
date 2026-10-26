import { describe, it, expect } from "vitest";
import {
  recalculateSettlementPayroll,
  type CorrectionPayroll,
} from "../../server/api/src/modules/hr/settlement-correction-calculation.js";
import { executeStatutoryFormula } from "../../server/api/src/modules/hr/payroll-statutory-rules.js";
import { ExactPayrollAmount as Money } from "../../server/api/src/modules/hr/payroll-calculation.js";
import type { StatutoryExecution } from "../../server/api/src/modules/hr/payroll-statutory.js";
function original(ytd = false): CorrectionPayroll {
  const component = {
      id: "tax-component",
      code: "SYN_TAX",
      name: "Artificial context tax",
      kind: "deduction",
      expense_account_id: null,
      liability_account_id: "tax-control",
    },
    rule = {
      id: "tax-version",
      rule_id: "tax-parent",
      rule_type: "safe_formula",
      configuration_json: {
        schema_version: 1,
        currency_code: "PKR",
        money_scale: 2,
        rounding_mode: "half_up",
        context_basis: "calendar_weighted_monthly",
        formula:
          "GROSS * RATE + DOCUMENTED_TAX_CREDIT" +
          (ytd ? " + YTD_TAXABLE_SALARY * 0.01 - YTD_SALARY_TAX_WITHHELD * 0.01" : ""),
        constants: { RATE: "0.1" },
      },
      applicability_json: { schema_version: 1, all: [] },
      output_definition_json: {
        schema_version: 1,
        line_code: "TAX",
        line_name: "Artificial context deduction",
        line_kind: "deduction",
        component_code: "SYN_TAX",
      },
    };
  const groups = [
    { from: "2026-10-01", to: "2026-10-14", days: 14, credit: "0" },
    { from: "2026-10-15", to: "2026-10-31", days: 17, credit: "31" },
  ].map((c) => {
    const values = {
      GROSS: "1100.00",
      TAXABLE_GROSS: "1100.00",
      DEDUCTIONS_BEFORE_STATUTORY: "0.00",
      NET_BEFORE_STATUTORY: "1100.00",
      DOCUMENTED_TAX_CREDIT: c.credit,
      CONTEXT_DAYS: String(c.days),
      EARNED_PERIOD_DAYS: "31",
      ...(ytd ? { YTD_TAXABLE_SALARY: "1000.00", YTD_SALARY_TAX_WITHHELD: "100.00" } : {}),
    };
    const sources = ytd
      ? { prior_results: [{ id: "prior", taxable: "1000.00", withheld: "100.00", currency_code: "PKR" }] }
      : {};
    return {
      allocated_days: c.days,
      earned_period_days: 31,
      context_basis: "calendar_weighted_monthly",
      calculation: executeStatutoryFormula(rule, values),
      contexts: [
        {
          effective_from: c.from,
          effective_to: c.to,
          calendar_days: c.days,
          inputs: { ...values, CONTEXT_DAYS: "31" },
          sources,
        },
      ],
    };
  });
  const amount = groups.reduce((n, g) => n.add(Money.parse(g.calculation.amount)), Money.parse("0")).decimal(2),
    calculation = { ...groups[0]!.calculation, amount };
  const line = {
    component_id: component.id,
    component_code: component.code,
    component_name: component.name,
    kind: "deduction" as const,
    amount,
    expense_account_id: null,
    liability_account_id: component.liability_account_id,
    source: "statutory:" + rule.id,
  };
  const statutory: StatutoryExecution = {
    status: "ready",
    blockers: [],
    outputs: [
      {
        rule,
        component,
        calculation,
        inputs: { ...groups[0]!.contexts[0]!.inputs, CONTEXT_DAYS: "14" },
        sources: { context_groups: groups },
        input_hash: "a".repeat(64),
        output_hash: "b".repeat(64),
      },
    ],
    lines: [line],
    gross: "1100.00",
    deductions: amount,
    net: Money.parse("1100").subtract(Money.parse(amount)).decimal(2),
    employer_contributions: "0.00",
    taxable_gross: "1100.00",
    profile: { id: "retained-profile" },
    locations: [],
    packs: [],
    input_hash: "c".repeat(64),
    resolved_set_hash: "d".repeat(64),
    mode: "production",
    context_segments: groups.map((g) => ({
      effective_from: g.contexts[0]!.effective_from,
      effective_to: g.contexts[0]!.effective_to,
      calendar_days: g.allocated_days,
    })),
  };
  return {
    result_id: "result",
    month: "2026-10-01",
    currency_code: "PKR",
    money_scale: 2,
    net_payable_account_id: "net-control",
    lines: [
      {
        component_id: "salary",
        component_code: "BASIC",
        component_name: "Retained base salary",
        kind: "earning",
        amount: "1000.00",
        expense_account_id: "expense",
        liability_account_id: null,
        source: "salary:one",
      },
      {
        component_id: "settlement",
        component_code: "SETTLEMENT",
        component_name: "Retained settlement input",
        kind: "earning",
        amount: "100.00",
        expense_account_id: "expense",
        liability_account_id: null,
        source: "adjustment:one",
      },
      line,
    ],
    statutory,
    gross: statutory.gross,
    deductions: statutory.deductions,
    net: statutory.net,
    employer_contributions: "0.00",
  };
}
describe("Frozen dated statutory correction replay (artificial amounts, no legal rates)", () => {
  it("reproduces every context rather than silently dropping all but the first group", () => {
    const before = original(),
      after = recalculateSettlementPayroll(before, [], new Map());
    expect(before.deductions).toBe("127.00");
    expect(after.deductions).toBe(before.deductions);
    expect(after.statutory.outputs).toHaveLength(1);
    expect(after.statutory.lines).toHaveLength(1);
  });
  it("replays changed settlement amounts against all original context inputs", () => {
    const before = original(),
      frozen = JSON.stringify(before),
      after = recalculateSettlementPayroll(
        before,
        [{ source: "adjustment:one", amount: "200.00", taxable: true }],
        new Map(),
      );
    expect(after).toMatchObject({ gross: "1200.00", deductions: "137.00", net: "1063.00" });
    expect(after.statutory.outputs[0]!.sources.context_groups).toHaveLength(2);
    expect(JSON.stringify(before)).toBe(frozen);
  });
  it("supports a later correction without reverting earlier context evidence or applying a delta twice", () => {
    const first = recalculateSettlementPayroll(
        original(),
        [{ source: "adjustment:one", amount: "200.00", taxable: true }],
        new Map(),
      ),
      second = recalculateSettlementPayroll(
        first,
        [{ source: "adjustment:one", amount: "300.00", taxable: true }],
        new Map(),
      );
    expect(second).toMatchObject({ gross: "1300.00", deductions: "147.00", net: "1153.00" });
    expect(second.statutory.lines).toHaveLength(1);
  });
  it("updates retained YTD provenance for every context and replays the same carry-forward once", () => {
    const before = original(true),
      prior = original();
    prior.result_id = "prior";
    prior.month = "2026-09-01";
    prior.statutory.taxable_gross = "2000.00";
    prior.statutory.outputs[0]!.calculation.amount = "200.00";
    const replacements = new Map([["prior", prior]]),
      after = recalculateSettlementPayroll(before, [], replacements);
    expect(before.deductions).toBe("136.00");
    expect(after.deductions).toBe("145.00");
    const again = recalculateSettlementPayroll(after, [], replacements);
    expect(again.deductions).toBe("145.00");
  });
  it("blocks incomplete retained context evidence instead of approximating a correction", () => {
    const before = original();
    delete before.statutory.outputs[0]!.sources.context_groups;
    expect(() => recalculateSettlementPayroll(before, [], new Map())).toThrow(/every retained allocation group/);
  });
});
