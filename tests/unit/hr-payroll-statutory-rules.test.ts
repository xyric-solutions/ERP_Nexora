import { describe, it, expect } from "vitest";
import {
  executeStatutoryFormula as execute,
  verifyStatutoryVectors as verify,
  type StatutoryRuleSource,
} from "../../server/api/src/modules/hr/payroll-statutory-rules.js";
function rule(): StatutoryRuleSource {
  return {
    id: "synthetic-rule",
    rule_type: "safe_formula",
    configuration_json: {
      schema_version: 1,
      currency_code: "PKR",
      money_scale: 2,
      rounding_mode: "half_up",
      formula: "GROSS * RATE",
      constants: { RATE: "0.1" },
    },
    applicability_json: { schema_version: 1, all: [{ variable: "GROSS", operator: "gt", value: "0" }] },
    output_definition_json: {
      schema_version: 1,
      line_code: "SYNTHETIC",
      line_name: "Synthetic test deduction",
      line_kind: "deduction",
      component_code: "TEST_TAX",
    },
  };
}
const vectors = () =>
  ["positive", "boundary", "non_applicable"].map((kind, i) => ({
    vector_kind: kind,
    canonical_inputs_json: { GROSS: ["100", "0.05", "0"][i] },
    expected_outputs_json: { applicable: i !== 2, amount: ["10", "0.01", "0"][i] },
    rounding_expectations_json: { money_scale: 2, rounding_mode: "half_up" },
  }));
describe("Published statutory safe formula contract (synthetic values)", () => {
  it("uses exact arithmetic and reviewed half-up rounding", () => {
    expect(execute(rule(), { GROSS: "0.05" }).amount).toBe("0.01");
    expect(execute(rule(), { GROSS: "31000" }).amount).toBe("3100.00");
  });
  it("reproduces every required reviewed vector", () => expect(() => verify(rule(), vectors())).not.toThrow());
  it("returns explicit non-applicability with zero monetary effect", () =>
    expect(execute(rule(), { GROSS: "0" })).toMatchObject({ applicable: false, amount: "0.00" }));
  it("rejects missing applicability inputs", () => expect(() => execute(rule(), {})).toThrow(/missing/));
  it("rejects unknown runtime inputs", () =>
    expect(() => execute(rule(), { GROSS: "100", INVENTED: "1" })).toThrow(/Unknown/));
  it("prevents constants from replacing employee inputs", () => {
    const r = rule();
    (r.configuration_json as { constants: Record<string, string> }).constants.GROSS = "10";
    expect(() => execute(r, { GROSS: "100" })).toThrow(/cannot replace/);
  });
  it("rejects unsupported rule engines", () => {
    const r = rule();
    r.rule_type = "bracket_table";
    expect(() => execute(r, { GROSS: "100" })).toThrow(/not yet supported/);
  });
  it.each(["GROSS + MISSING", "process.exit()", "GROSS / 0"])("rejects unsafe or unresolved formula %s", (formula) => {
    const r = rule();
    (r.configuration_json as Record<string, unknown>).formula = formula;
    expect(() => execute(r, { GROSS: "100" })).toThrow();
  });
  it("rejects negative output", () => {
    const r = rule();
    (r.configuration_json as Record<string, unknown>).formula = "0 - GROSS";
    expect(() => execute(r, { GROSS: "100" })).toThrow(/negative/);
  });
  it("requires zero money for informational lines", () => {
    const r = rule();
    Object.assign(r.output_definition_json as Record<string, unknown>, {
      line_kind: "informational",
      component_code: null,
    });
    expect(() => execute(r, { GROSS: "100" })).toThrow(/zero monetary/);
  });
  it("requires company components for money outputs", () => {
    const r = rule();
    (r.output_definition_json as Record<string, unknown>).component_code = null;
    expect(() => execute(r, { GROSS: "100" })).toThrow();
  });
  it("rejects incomplete vectors", () =>
    expect(() => verify(rule(), vectors().slice(0, 2))).toThrow(/complete bounded/));
  it("rejects non-reproducing amounts and rounding", () => {
    const v = vectors();
    v[0]!.expected_outputs_json.amount = "9";
    expect(() => verify(rule(), v)).toThrow(/does not reproduce/);
    const w = vectors();
    w[0]!.rounding_expectations_json.money_scale = 3;
    expect(() => verify(rule(), w)).toThrow(/does not reproduce/);
  });
  it("requires a genuinely non-applicable scenario", () => {
    const v = vectors();
    v[2]!.canonical_inputs_json.GROSS = "1";
    v[2]!.expected_outputs_json = { applicable: true, amount: "0.1" };
    expect(() => verify(rule(), v)).toThrow(/does not reproduce/);
  });
  it("rejects unknown published configuration fields", () => {
    const r = rule();
    (r.configuration_json as Record<string, unknown>).eval = "script";
    expect(() => execute(r, { GROSS: "100" })).toThrow();
  });
  it("requires the positive scenario to exercise an applicable rule", () => {
    const v = vectors();
    v[0]!.canonical_inputs_json.GROSS = "0";
    v[0]!.expected_outputs_json = { applicable: false, amount: "0" };
    expect(() => verify(rule(), v)).toThrow(/does not reproduce/);
  });
});
