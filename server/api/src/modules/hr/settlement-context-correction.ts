import type { CorrectionPayroll, CorrectionAmount } from "./settlement-correction-calculation.js";
import type { StatutoryExecution } from "./payroll-statutory.js";
import { statutoryFormulaConfigurationSchema } from "./payroll-statutory-rules.js";
import { ExactPayrollAmount as Money, PayrollCalculationError } from "./payroll-calculation.js";
import { attendanceHash } from "./attendance-completion.js";
type Row = Record<string, unknown>;
type Output = StatutoryExecution["outputs"][number];
const fail = (message: string): never => {
  throw new PayrollCalculationError(message);
};
const row = (value: unknown): Row => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return fail("Retained statutory context correction evidence is missing.");
  return value as Row;
};
const inputs = (value: unknown): Record<string, string> => {
  const r = row(value);
  if (Object.values(r).some((v) => typeof v !== "string"))
    return fail("Retained context correction inputs must be exact decimal strings.");
  return r as Record<string, string>;
};

/** Replay each frozen rule/input group, then restore unique rule/line identities. No current rates are consulted. */
export function recalculateDatedSettlementPayroll(
  original: CorrectionPayroll,
  changes: CorrectionAmount[],
  prior: ReadonlyMap<string, CorrectionPayroll>,
  replay: (
    original: CorrectionPayroll,
    changes: CorrectionAmount[],
    prior: ReadonlyMap<string, CorrectionPayroll>,
  ) => CorrectionPayroll,
): CorrectionPayroll {
  const stat = original.statutory,
    expanded: Output[] = [],
    owners: { output: Output; groups: Row[] }[] = [];
  for (const output of stat.outputs) {
    const groups = output.sources.context_groups;
    if (!Array.isArray(groups) || !groups.length || groups.length > 31)
      return fail("A dated statutory correction requires every retained allocation group.");
    const retained: Row[] = [];
    for (const raw of groups) {
      const g = row(raw),
        contexts = g.contexts;
      if (!Array.isArray(contexts) || !contexts.length)
        return fail("Dated statutory correction source periods are missing.");
      const first = row(contexts[0]),
        values = { ...inputs(g.corrected_inputs ?? first.inputs) },
        sources = { ...row(g.corrected_sources ?? first.sources) };
      const allocated = Number(g.allocated_days),
        earned = Number(g.earned_period_days);
      if (
        !Number.isInteger(allocated) ||
        !Number.isInteger(earned) ||
        allocated < 1 ||
        earned > 31 ||
        allocated > earned
      )
        return fail("The retained context correction allocation is invalid.");
      const config = statutoryFormulaConfigurationSchema.parse(output.rule.configuration_json);
      if (config.context_basis) {
        values.CONTEXT_DAYS = String(allocated);
        values.EARNED_PERIOD_DAYS = String(earned);
      } else if (allocated !== earned)
        return fail("A partial context correction requires its original published allocation policy.");
      expanded.push({ ...output, inputs: values, sources, calculation: row(g.calculation) as Output["calculation"] });
      retained.push(g);
    }
    owners.push({ output, groups: retained });
  }
  if (expanded.length > 200) return fail("The dated correction exceeds the retained statutory group limit.");
  const replayStat = { ...stat, outputs: expanded };
  delete replayStat.context_segments;
  const corrected = replay({ ...original, statutory: replayStat }, changes, prior),
    outputs: Output[] = [];
  let position = 0;
  for (const owner of owners) {
    const evaluated = owner.groups.map((g) => {
      const result = corrected.statutory.outputs[position++]!;
      return {
        ...g,
        calculation: result.calculation,
        corrected_inputs: result.inputs,
        corrected_sources: result.sources,
      };
    });
    const current = corrected.statutory.outputs[position - owner.groups.length]!;
    const calculation = {
      ...current.calculation,
      amount: evaluated
        .reduce((n, g) => n.add(Money.parse(g.calculation.amount)), Money.parse("0"))
        .decimal(original.money_scale),
      applicable: evaluated.some((g) => g.calculation.applicable),
    };
    const sources = { context_groups: evaluated },
      input_hash = attendanceHash({ rule: owner.output.rule.id, groups: evaluated });
    outputs.push({
      ...owner.output,
      inputs: { ...current.inputs },
      sources,
      calculation,
      input_hash,
      output_hash: attendanceHash({ calculation, input_hash }),
    });
  }
  const grouped = new Map<string, (typeof corrected.lines)[number]>();
  const baseline = corrected.lines.filter((l) => !l.source.startsWith("statutory:"));
  for (const line of corrected.lines.filter((l) => l.source.startsWith("statutory:"))) {
    const old = grouped.get(line.source);
    if (old) {
      if (
        old.component_id !== line.component_id ||
        old.kind !== line.kind ||
        old.expense_account_id !== line.expense_account_id ||
        old.liability_account_id !== line.liability_account_id
      )
        return fail("Retained context correction accounting mappings disagree.");
      old.amount = Money.parse(old.amount).add(Money.parse(line.amount)).decimal(original.money_scale);
    } else grouped.set(line.source, { ...line });
  }
  return {
    ...corrected,
    lines: [...baseline, ...grouped.values()],
    statutory: {
      ...corrected.statutory,
      context_segments: stat.context_segments!,
      outputs,
      lines: [...grouped.values()],
      input_hash: attendanceHash(outputs.map((o) => o.input_hash)),
    },
  };
}
