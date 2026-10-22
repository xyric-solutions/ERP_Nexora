import { describe, it, expect } from "vitest";
import {
  executeStatutoryFormula as execute,
  verifyStatutoryVectors as verify,
  type StatutoryRuleSource,
} from "../../server/api/src/modules/hr/payroll-statutory-rules.js";
const rule = (): StatutoryRuleSource => ({
  id: "synthetic-context-only",
  rule_type: "safe_formula",
  configuration_json: {
    schema_version: 1,
    currency_code: "PKR",
    money_scale: 2,
    rounding_mode: "half_up",
    formula: "GROSS * RATE",
    constants: { RATE: "0.1" },
    context_basis: "calendar_weighted_monthly",
  },
  applicability_json: { schema_version: 1, all: [{ variable: "GROSS", operator: "gt", value: "0" }] },
  output_definition_json: {
    schema_version: 1,
    line_code: "TEST",
    line_name: "Synthetic reviewed context amount",
    line_kind: "deduction",
    component_code: "TEST_TAX",
  },
});
const vectors = () => [
  {
    vector_kind: "positive",
    canonical_inputs_json: { GROSS: "100", CONTEXT_DAYS: "31", EARNED_PERIOD_DAYS: "31" },
    expected_outputs_json: { applicable: true, amount: "10.00" },
    rounding_expectations_json: { money_scale: 2, rounding_mode: "half_up" },
  },
  {
    vector_kind: "boundary",
    canonical_inputs_json: { GROSS: "1", CONTEXT_DAYS: "15", EARNED_PERIOD_DAYS: "31" },
    expected_outputs_json: { applicable: true, amount: "0.05" },
    rounding_expectations_json: { money_scale: 2, rounding_mode: "half_up" },
  },
  {
    vector_kind: "non_applicable",
    canonical_inputs_json: { GROSS: "0", CONTEXT_DAYS: "15", EARNED_PERIOD_DAYS: "31" },
    expected_outputs_json: { applicable: false, amount: "0" },
    rounding_expectations_json: { money_scale: 2, rounding_mode: "half_up" },
  },
];
describe("Explicit published monthly statutory context basis (artificial amounts only)", () => {
  it("weights the unrounded monthly result and rounds only after allocation", () => {
    expect(execute(rule(), { GROSS: "0.05", CONTEXT_DAYS: "1", EARNED_PERIOD_DAYS: "2" }).amount).toBe("0.00");
  });
  it("uses the full monthly result exactly once for full earned coverage", () => {
    expect(execute(rule(), { GROSS: "31000", CONTEXT_DAYS: "31", EARNED_PERIOD_DAYS: "31" }).amount).toBe("3100.00");
  });
  it("uses earned calendar coverage rather than assuming employment throughout the month", () => {
    expect(execute(rule(), { GROSS: "100", CONTEXT_DAYS: "5", EARNED_PERIOD_DAYS: "10" }).amount).toBe("5.00");
  });
  it("keeps large decimal allocation exact", () => {
    expect(execute(rule(), { GROSS: "9007199254740993", CONTEXT_DAYS: "1", EARNED_PERIOD_DAYS: "3" }).amount).toBe(
      "300239975158033.10",
    );
  });
  it.each([
    {},
    { CONTEXT_DAYS: "0", EARNED_PERIOD_DAYS: "31" },
    { CONTEXT_DAYS: "32", EARNED_PERIOD_DAYS: "31" },
    { CONTEXT_DAYS: "2", EARNED_PERIOD_DAYS: "1" },
    { CONTEXT_DAYS: "1.5", EARNED_PERIOD_DAYS: "31" },
  ])("rejects invalid allocation context %j", (inputs) => {
    expect(() => execute(rule(), { GROSS: "100", ...inputs })).toThrow(/Context weighting/);
  });
  it("forbids applying day weighting again inside the formula", () => {
    const r = rule();
    (r.configuration_json as Record<string, unknown>).formula = "GROSS * RATE * CONTEXT_DAYS / EARNED_PERIOD_DAYS";
    expect(() => execute(r, { GROSS: "100", CONTEXT_DAYS: "15", EARNED_PERIOD_DAYS: "31" })).toThrow(/applied once/);
  });
  it("forbids using allocation variables to change monthly applicability", () => {
    const r = rule();
    r.applicability_json = { schema_version: 1, all: [{ variable: "CONTEXT_DAYS", operator: "gt", value: "0" }] };
    expect(() => execute(r, { GROSS: "100", CONTEXT_DAYS: "15", EARNED_PERIOD_DAYS: "31" })).toThrow(/applied once/);
  });
  it("requires reviewed full and partial earned-period vectors", () => {
    expect(() => verify(rule(), vectors())).not.toThrow();
    const v = vectors();
    v[1]!.canonical_inputs_json.CONTEXT_DAYS = "31";
    v[1]!.expected_outputs_json.amount = "0.10";
    expect(() => verify(rule(), v)).toThrow(/full and partial/);
  });
  it("rejects an incorrect reviewed partial amount", () => {
    const v = vectors();
    v[1]!.expected_outputs_json.amount = "0.10";
    expect(() => verify(rule(), v)).toThrow(/does not reproduce/);
  });
  it("does not prorate an existing rule that has no context policy", () => {
    const r = rule();
    delete (r.configuration_json as Record<string, unknown>).context_basis;
    expect(execute(r, { GROSS: "100" }).amount).toBe("10.00");
  });
  it("rejects new context inputs in a rule that has not declared the allocation policy", () => {
    const r = rule(),
      c = r.configuration_json as Record<string, unknown>;
    delete c.context_basis;
    c.formula = "GROSS * CONTEXT_DAYS";
    expect(() => execute(r, { GROSS: "100", CONTEXT_DAYS: "15" })).toThrow(/explicit published context policy/);
  });
  it("preserves legacy published constants that used a newly introduced input name", () => {
    const r = rule(),
      c = r.configuration_json as { context_basis?: string; constants: Record<string, string>; formula: string };
    delete c.context_basis;
    c.constants.CONTEXT_DAYS = "2";
    c.formula = "GROSS / CONTEXT_DAYS";
    expect(execute(r, { GROSS: "100" }).amount).toBe("50.00");
  });
});
