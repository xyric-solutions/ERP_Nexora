import { recalculateDatedSettlementPayroll } from "./settlement-context-correction.js";
import { attendanceHash } from "./attendance-completion.js";
import {
  ExactPayrollAmount as Money,
  PayrollCalculationError,
  type PayrollCalculationLine,
} from "./payroll-calculation.js";
import { executeStatutoryFormula, type StatutoryRuleSource } from "./payroll-statutory-rules.js";
import type { StatutoryExecution } from "./payroll-statutory.js";

export type CorrectionPayroll = {
  result_id: string;
  month: string;
  currency_code: string;
  money_scale: number;
  net_payable_account_id: string;
  lines: PayrollCalculationLine[];
  statutory: StatutoryExecution;
  gross: string;
  deductions: string;
  net: string;
  employer_contributions: string;
};
export type CorrectionAmount = { source: string; amount: string; taxable: boolean };
const fail = (message: string): never => {
  throw new PayrollCalculationError(message);
};
const sum = (lines: PayrollCalculationLine[], kind: string) =>
  lines.filter((x) => x.kind === kind).reduce((s, x) => s.add(Money.parse(x.amount)), new Money(0n));
/** Re-run the retained, sealed earned-month formulas, never current or invented country rates. */
export function recalculateSettlementPayroll(
  original: CorrectionPayroll,
  changes: CorrectionAmount[],
  prior: ReadonlyMap<string, CorrectionPayroll>,
): CorrectionPayroll {
  const stat = original.statutory,
    scale = original.money_scale;
  if (stat.status !== "ready" || stat.mode !== "production" || !stat.outputs.length || !stat.profile)
    fail("A sealed production statutory result is required for correction.");
  if (stat.context_segments?.length)
    return recalculateDatedSettlementPayroll(original, changes, prior, recalculateSettlementPayroll);
  if (new Set(changes.map((x) => x.source)).size !== changes.length)
    fail("A Payroll source cannot be corrected twice.");
  const baseline = original.lines.filter((x) => !x.source.startsWith("statutory:")),
    changed = new Set<string>();
  let taxable = Money.parse(stat.taxable_gross);
  const lines = baseline.map((line) => {
    const change = changes.find((x) => x.source === line.source);
    if (!change) return { ...line };
    if (!["earning", "deduction"].includes(line.kind) || !line.source.startsWith("adjustment:"))
      fail("Only retained settlement input amounts may be corrected.");
    const value = Money.parse(change.amount);
    if (value.compare(new Money(0n)) < 0 || value.decimal(scale) !== change.amount)
      fail("A corrected amount must use the original currency precision.");
    if (line.kind === "earning" && change.taxable) taxable = taxable.add(value.subtract(Money.parse(line.amount)));
    changed.add(line.source);
    return { ...line, amount: change.amount };
  });
  if (changed.size !== changes.length) fail("A corrected statement line is not linked to the retained Payroll result.");
  if (taxable.compare(new Money(0n)) < 0) fail("Reviewed taxable differences exceed the retained taxable gross.");
  const gross = sum(lines, "earning"),
    deductions = sum(lines, "deduction"),
    net = gross.subtract(deductions);
  const runtime = {
    GROSS: gross.decimal(scale),
    TAXABLE_GROSS: taxable.decimal(scale),
    DEDUCTIONS_BEFORE_STATUTORY: deductions.decimal(scale),
    NET_BEFORE_STATUTORY: net.decimal(scale),
  };
  const outputs = stat.outputs.map((old) => {
    const inputs = { ...old.inputs };
    for (const [name, value] of Object.entries(runtime)) if (Object.hasOwn(inputs, name)) inputs[name] = value;
    const sources = { ...old.sources };
    if (Object.hasOwn(inputs, "YTD_TAXABLE_SALARY") || Object.hasOwn(inputs, "YTD_SALARY_TAX_WITHHELD")) {
      const captured = old.sources.prior_results;
      if (!Array.isArray(captured)) fail("Retained YTD provenance is missing.");
      let ytdTaxable = Money.parse(inputs.YTD_TAXABLE_SALARY ?? "0"),
        ytdWithheld = Money.parse(inputs.YTD_SALARY_TAX_WITHHELD ?? "0");
      sources.prior_results = (
        captured as Array<{ id: string; taxable: string; withheld: string; currency_code: string }>
      ).map((entry: { id: string; taxable: string; withheld: string; currency_code: string }) => {
        const replacement = prior.get(entry.id);
        if (!replacement) return { ...entry };
        if (replacement.currency_code !== original.currency_code || replacement.month >= original.month)
          fail("YTD correction provenance does not match the earned month and currency.");
        const withheld = replacement.statutory.outputs
          .filter((x) => x.rule.rule_id === old.rule.rule_id && x.calculation.line_kind === "deduction")
          .reduce((s, x) => s.add(Money.parse(x.calculation.amount)), new Money(0n))
          .decimal(scale);
        ytdTaxable = ytdTaxable.add(
          Money.parse(replacement.statutory.taxable_gross).subtract(Money.parse(entry.taxable)),
        );
        ytdWithheld = ytdWithheld.add(Money.parse(withheld).subtract(Money.parse(entry.withheld)));
        return { ...entry, taxable: replacement.statutory.taxable_gross, withheld };
      });
      if (Object.hasOwn(inputs, "YTD_TAXABLE_SALARY")) inputs.YTD_TAXABLE_SALARY = ytdTaxable.decimal(scale);
      if (Object.hasOwn(inputs, "YTD_SALARY_TAX_WITHHELD")) inputs.YTD_SALARY_TAX_WITHHELD = ytdWithheld.decimal(scale);
    }
    const calculation = executeStatutoryFormula(old.rule as StatutoryRuleSource, inputs),
      input_hash = attendanceHash({ inputs, sources }),
      output_hash = attendanceHash(calculation);
    if (calculation.line_kind !== "informational" && calculation.applicable) {
      const retained = stat.lines.find((x) => x.source === "statutory:" + old.rule.id),
        component = old.component;
      if (!component || typeof component.id !== "string") fail("The retained statutory output component is missing.");
      // An inapplicable original rule may become applicable after correction; its captured mapping is still required.
      const line: PayrollCalculationLine = retained
        ? { ...retained, amount: calculation.amount }
        : {
            component_id: String(component!.id),
            component_code: String(component!.code),
            component_name: String(component!.name),
            kind: calculation.line_kind as PayrollCalculationLine["kind"],
            amount: calculation.amount,
            expense_account_id: component!.expense_account_id as string | null,
            liability_account_id: component!.liability_account_id as string | null,
            source: "statutory:" + old.rule.id,
          };
      lines.push(line);
    }
    return { ...old, inputs, sources, calculation, input_hash, output_hash };
  });
  const newGross = sum(lines, "earning"),
    newDeductions = sum(lines, "deduction"),
    employer = sum(lines, "employer_contribution");
  const updated: StatutoryExecution = {
    ...stat,
    outputs,
    lines: lines.filter((x) => x.source.startsWith("statutory:")),
    gross: newGross.decimal(scale),
    deductions: newDeductions.decimal(scale),
    net: newGross.subtract(newDeductions).decimal(scale),
    employer_contributions: employer.decimal(scale),
    taxable_gross: taxable.decimal(scale),
    input_hash: attendanceHash(outputs.map((x) => x.input_hash)),
  };
  return {
    ...original,
    lines,
    statutory: updated,
    gross: updated.gross,
    deductions: updated.deductions,
    net: updated.net,
    employer_contributions: updated.employer_contributions,
  };
}
/** Signed differences reverse only the changed accounts; the original journal stays immutable. */
export function settlementCorrectionJournal(before: CorrectionPayroll[], after: CorrectionPayroll[]) {
  const grouped = new Map<string, Money>();
  const add = (account: string | null, value: Money) => {
    if (value.compare(new Money(0n)) === 0) return;
    if (!account) fail("Every correction amount needs its retained posting account.");
    grouped.set(account!, (grouped.get(account!) ?? new Money(0n)).add(value));
  };
  for (const [rows, sign] of [
    [before, -1n],
    [after, 1n],
  ] as const)
    for (const row of rows) {
      const multiplier = new Money(sign);
      if (
        sum(row.lines, "earning").compare(Money.parse(row.gross)) ||
        sum(row.lines, "deduction").compare(Money.parse(row.deductions)) ||
        sum(row.lines, "employer_contribution").compare(Money.parse(row.employer_contributions)) ||
        Money.parse(row.gross).subtract(Money.parse(row.deductions)).compare(Money.parse(row.net))
      )
        fail("The retained Payroll totals do not reconcile to their lines.");
      for (const line of row.lines) {
        const amount = Money.parse(line.amount).multiply(multiplier);
        if (line.kind === "earning" || line.kind === "employer_contribution") add(line.expense_account_id, amount);
        if (line.kind === "deduction" || line.kind === "employer_contribution")
          add(line.liability_account_id, new Money(-amount.numerator, amount.denominator));
      }
      const net = Money.parse(row.net).multiply(multiplier);
      add(row.net_payable_account_id, new Money(-net.numerator, net.denominator));
    }
  const lines = [...grouped]
    .filter(([, v]) => v.compare(new Money(0n)) !== 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([account_id, value]) => ({
      account_id,
      debit: value.compare(new Money(0n)) > 0 ? value.decimal(4) : "0.0000",
      credit: value.compare(new Money(0n)) < 0 ? new Money(-value.numerator, value.denominator).decimal(4) : "0.0000",
    }));
  const debit = lines.reduce((s, x) => s.add(Money.parse(x.debit)), new Money(0n)),
    credit = lines.reduce((s, x) => s.add(Money.parse(x.credit)), new Money(0n));
  if (debit.compare(credit)) fail("Correction journal differences do not balance exactly.");
  return { lines, debit: debit.decimal(4), credit: credit.decimal(4) };
}
