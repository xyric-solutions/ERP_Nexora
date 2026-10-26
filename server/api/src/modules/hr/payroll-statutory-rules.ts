import {
  statutoryFormulaConfigurationSchema,
  statutoryApplicabilitySchema,
  statutoryOutputSchema,
} from "@nexora/contracts";
export {
  statutoryFormulaConfigurationSchema,
  statutoryApplicabilitySchema,
  statutoryOutputSchema,
} from "@nexora/contracts";
import { z } from "zod";
import { ExactPayrollAmount as Money, evaluatePayrollFormula, PayrollCalculationError } from "./payroll-calculation.js";
const decimal = z.string().regex(/^-?\d{1,30}(\.\d{1,18})?$/);
export const statutoryRuntimeVariables = [
  "CONTEXT_DAYS",
  "EARNED_PERIOD_DAYS",
  "GROSS",
  "TAXABLE_GROSS",
  "DEDUCTIONS_BEFORE_STATUTORY",
  "NET_BEFORE_STATUTORY",
  "PAID_DAYS",
  "UNPAID_DAYS",
  "CALENDAR_DAYS",
  "ESTIMATED_ANNUAL_SALARY",
  "PRIOR_TAXABLE_SALARY",
  "PRIOR_SALARY_TAX_WITHHELD",
  "DOCUMENTED_TAX_CREDIT",
  "OTHER_TAX_WITHHELD",
  "YTD_TAXABLE_SALARY",
  "YTD_SALARY_TAX_WITHHELD",
  "EOBI_APPLICABLE",
  "EOBI_BASE",
  "TAX_YEAR",
] as const;
export type StatutoryRuleSource = {
  id: string;
  rule_type: string;
  configuration_json: unknown;
  applicability_json: unknown;
  output_definition_json: unknown;
};
export function executeStatutoryFormula(rule: StatutoryRuleSource, values: Record<string, string>) {
  if (rule.rule_type !== "safe_formula")
    throw new PayrollCalculationError(
      "The released statutory rule type requires an executor that is not yet supported.",
    );
  const config = statutoryFormulaConfigurationSchema.parse(rule.configuration_json),
    applicability = statutoryApplicabilitySchema.parse(rule.applicability_json),
    output = statutoryOutputSchema.parse(rule.output_definition_json),
    variables: Record<string, Money> = {};
  const referenced = new Set<string>(
    (config.formula + " " + JSON.stringify(rule.applicability_json)).match(/[A-Z][A-Z0-9_]*/g) ?? [],
  );
  if (!config.context_basis)
    for (const key of ["CONTEXT_DAYS", "EARNED_PERIOD_DAYS"]) {
      if (referenced.has(key) && !Object.hasOwn(config.constants, key))
        throw new PayrollCalculationError("Context allocation inputs require an explicit published context policy.");
    }
  for (const [key, value] of Object.entries(values)) {
    if (!(statutoryRuntimeVariables as readonly string[]).includes(key))
      throw new PayrollCalculationError("Unknown statutory runtime variable: " + key);
    variables[key] = Money.parse(value);
  }
  for (const [key, value] of Object.entries(config.constants)) {
    if (
      (statutoryRuntimeVariables as readonly string[]).includes(key) &&
      (config.context_basis || !["CONTEXT_DAYS", "EARNED_PERIOD_DAYS"].includes(key))
    )
      throw new PayrollCalculationError("Published constants cannot replace statutory employee inputs.");
    variables[key] = Money.parse(value);
  }
  const applicable = applicability.all.every((condition) => {
    const value = variables[condition.variable];
    if (!value) throw new PayrollCalculationError("A required statutory applicability input is missing.");
    const comparison = value.compare(Money.parse(condition.value));
    return condition.operator === "eq"
      ? comparison === 0
      : condition.operator === "ne"
        ? comparison !== 0
        : condition.operator === "gt"
          ? comparison > 0
          : condition.operator === "gte"
            ? comparison >= 0
            : condition.operator === "lt"
              ? comparison < 0
              : comparison <= 0;
  });
  let raw = applicable ? evaluatePayrollFormula(config.formula, variables) : new Money(0n);
  if (config.context_basis) {
    if (/\b(?:CONTEXT_DAYS|EARNED_PERIOD_DAYS)\b/.test(config.formula + " " + JSON.stringify(rule.applicability_json)))
      throw new PayrollCalculationError(
        "Context weighting is applied once by the executor; allocation variables cannot appear in the formula or applicability.",
      );
    const context = values.CONTEXT_DAYS,
      period = values.EARNED_PERIOD_DAYS;
    if (
      !context ||
      !period ||
      !/^([1-9]|[12][0-9]|3[01])$/.test(context) ||
      !/^([1-9]|[12][0-9]|3[01])$/.test(period) ||
      Money.parse(context).compare(Money.parse(period)) > 0
    )
      throw new PayrollCalculationError(
        "Context weighting requires 1–31 earned calendar days and bounded covered days.",
      );
    raw = raw.multiply(Money.parse(context)).divide(Money.parse(period));
  }
  if (raw.compare(new Money(0n)) < 0) throw new PayrollCalculationError("A statutory rule produced a negative amount.");
  const amount = raw.decimal(config.money_scale, config.rounding_mode);
  if (output.line_kind === "informational" && Money.parse(amount).compare(new Money(0n)) !== 0)
    throw new PayrollCalculationError("Informational statutory outputs must have zero monetary effect.");
  return {
    applicable,
    amount,
    currency_code: config.currency_code,
    money_scale: config.money_scale,
    rounding_mode: config.rounding_mode,
    ...output,
  };
}
export function verifyStatutoryVectors(
  rule: StatutoryRuleSource,
  vectors: {
    vector_kind: string;
    canonical_inputs_json: unknown;
    expected_outputs_json: unknown;
    rounding_expectations_json: unknown;
  }[],
) {
  if (
    vectors.length > 100 ||
    !["positive", "boundary", "non_applicable"].every((kind) => vectors.some((v) => v.vector_kind === kind))
  )
    throw new PayrollCalculationError("Every released statutory rule requires complete bounded reviewed vectors.");
  const configuration = statutoryFormulaConfigurationSchema.parse(rule.configuration_json);
  if (
    configuration.context_basis &&
    (!vectors.some((v) => {
      const i = v.canonical_inputs_json as Record<string, string>;
      return (
        /^[1-9][0-9]?$/.test(i?.CONTEXT_DAYS ?? "") &&
        /^[1-9][0-9]?$/.test(i?.EARNED_PERIOD_DAYS ?? "") &&
        Number(i.CONTEXT_DAYS) < Number(i.EARNED_PERIOD_DAYS) &&
        (v.expected_outputs_json as { applicable?: boolean })?.applicable === true
      );
    }) ||
      !vectors.some((v) => {
        const i = v.canonical_inputs_json as Record<string, string>;
        return i?.CONTEXT_DAYS && i.CONTEXT_DAYS === i.EARNED_PERIOD_DAYS;
      }))
  )
    throw new PayrollCalculationError(
      "A context allocation policy needs reviewed full and partial earned-period vectors.",
    );
  const inputs = z.record(z.string(), decimal),
    expected = z.strictObject({ applicable: z.boolean(), amount: decimal }),
    rounding = z.strictObject({ money_scale: z.number().int(), rounding_mode: z.string() });
  for (const vector of vectors) {
    const actual = executeStatutoryFormula(rule, inputs.parse(vector.canonical_inputs_json)),
      target = expected.parse(vector.expected_outputs_json),
      precision = rounding.parse(vector.rounding_expectations_json);
    if (
      actual.applicable !== target.applicable ||
      Money.parse(actual.amount).compare(Money.parse(target.amount)) !== 0 ||
      actual.money_scale !== precision.money_scale ||
      actual.rounding_mode !== precision.rounding_mode ||
      (vector.vector_kind === "non_applicable" && actual.applicable) ||
      (vector.vector_kind === "positive" && !actual.applicable)
    )
      throw new PayrollCalculationError(
        "A reviewed statutory test vector does not reproduce under the current engine.",
      );
  }
}
