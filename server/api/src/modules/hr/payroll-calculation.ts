/** Server-only exact Payroll arithmetic. No floating-point monetary operations or executable administrator code. */
export class PayrollCalculationError extends Error {}
const invalid = (message: string): never => {
  throw new PayrollCalculationError(message);
};
const abs = (n: bigint) => (n < 0n ? -n : n);
function gcd(a: bigint, b: bigint): bigint {
  a = abs(a);
  b = abs(b);
  while (b) {
    const next = a % b;
    a = b;
    b = next;
  }
  return a || 1n;
}
export type PayrollRounding = "half_up" | "half_even" | "down" | "up";
export class ExactPayrollAmount {
  readonly numerator: bigint;
  readonly denominator: bigint;
  constructor(numerator: bigint, denominator = 1n) {
    if (!denominator) invalid("A Payroll divisor cannot be zero.");
    if (abs(numerator).toString(2).length > 4096 || abs(denominator).toString(2).length > 4096)
      invalid("Payroll arithmetic exceeds the supported complexity.");
    const sign = denominator < 0n ? -1n : 1n,
      common = gcd(numerator, denominator);
    this.numerator = (numerator / common) * sign;
    this.denominator = abs(denominator) / common;
  }
  static parse(value: string) {
    if (!/^-?\d{1,30}(\.\d{1,18})?$/.test(value)) invalid("Payroll requires an exact decimal string.");
    const [whole, fraction = ""] = value.replace("-", "").split("."),
      denominator = 10n ** BigInt(fraction.length);
    return new ExactPayrollAmount(
      (BigInt(whole!) * denominator + BigInt(fraction || "0")) * (value.startsWith("-") ? -1n : 1n),
      denominator,
    );
  }
  add(other: ExactPayrollAmount) {
    return new ExactPayrollAmount(
      this.numerator * other.denominator + other.numerator * this.denominator,
      this.denominator * other.denominator,
    );
  }
  subtract(other: ExactPayrollAmount) {
    return this.add(new ExactPayrollAmount(-other.numerator, other.denominator));
  }
  multiply(other: ExactPayrollAmount) {
    return new ExactPayrollAmount(this.numerator * other.numerator, this.denominator * other.denominator);
  }
  divide(other: ExactPayrollAmount) {
    return new ExactPayrollAmount(this.numerator * other.denominator, this.denominator * other.numerator);
  }
  compare(other: ExactPayrollAmount) {
    const difference = this.numerator * other.denominator - other.numerator * this.denominator;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  }
  decimal(scale: number, mode: PayrollRounding = "half_up"): string {
    if (!["half_up", "half_even", "down", "up"].includes(mode) || !Number.isInteger(scale) || scale < 0 || scale > 4)
      invalid("Payroll currency precision must be 0–4 decimal places.");
    const factor = 10n ** BigInt(scale),
      unsigned = abs(this.numerator) * factor;
    let whole = unsigned / this.denominator;
    const remainder = unsigned % this.denominator;
    if (
      (mode === "up" && remainder > 0n) ||
      ((mode === "half_up" || mode === "half_even") &&
        (remainder * 2n > this.denominator ||
          (remainder * 2n === this.denominator && (mode === "half_up" || whole % 2n !== 0n))))
    )
      whole++;
    const digits = whole.toString().padStart(scale + 1, "0"),
      sign = this.numerator < 0n && whole !== 0n ? "-" : "";
    return sign + (scale ? digits.slice(0, -scale) + "." + digits.slice(-scale) : digits);
  }
}
export function evaluatePayrollFormula(
  expression: string,
  variables: Readonly<Record<string, ExactPayrollAmount>>,
): ExactPayrollAmount {
  const tokens = expression.match(/\d+(?:\.\d{1,4})?|[A-Za-z][A-Za-z0-9_]*|[+*/(),-]/g) ?? [];
  if (tokens.join("") !== expression.replace(/\s/g, "") || tokens.length < 1 || tokens.length > 200)
    invalid("The Payroll formula contains unsupported syntax.");
  let cursor = 0,
    depth = 0;
  const peek = () => tokens[cursor];
  const atom = (): ExactPayrollAmount => {
    if (++depth > 24) invalid("The Payroll formula is too deeply nested.");
    const token = tokens[cursor++];
    let value: ExactPayrollAmount;
    if (token === "+" || token === "-") {
      value = atom();
      if (token === "-") value = new ExactPayrollAmount(-value.numerator, value.denominator);
    } else if (token === "(") {
      value = sum();
      if (tokens[cursor++] !== ")") invalid("Close each Payroll formula parenthesis.");
    } else if (token && /^\d/.test(token)) value = ExactPayrollAmount.parse(token);
    else if (token && ["min", "max", "round"].includes(token)) {
      if (tokens[cursor++] !== "(") invalid("Payroll formula functions require parentheses.");
      const values = [sum()];
      while (peek() === ",") {
        cursor++;
        values.push(sum());
        if (values.length > 10) invalid("A Payroll function has too many arguments.");
      }
      if (tokens[cursor++] !== ")") invalid("Close the Payroll function parenthesis.");
      if (token === "round") {
        if (
          values.length !== 2 ||
          values[1]!.denominator !== 1n ||
          values[1]!.numerator < 0n ||
          values[1]!.numerator > 4n
        )
          invalid("round requires a value and an integer precision of 0–4.");
        value = ExactPayrollAmount.parse(values[0]!.decimal(Number(values[1]!.numerator), "half_up"));
      } else {
        if (values.length < 2) invalid("min/max require at least two values.");
        value = values.reduce((a, b) => (token === "min" ? (a.compare(b) <= 0 ? a : b) : a.compare(b) >= 0 ? a : b));
      }
    } else {
      if (!token || !Object.hasOwn(variables, token))
        invalid("An unknown Payroll variable or forward component reference was used.");
      value = variables[token!]!;
    }
    depth--;
    return value;
  };
  const product = (): ExactPayrollAmount => {
    let value = atom();
    while (peek() === "*" || peek() === "/") {
      const op = tokens[cursor++],
        right = atom();
      value = op === "*" ? value.multiply(right) : value.divide(right);
    }
    return value;
  };
  const sum = (): ExactPayrollAmount => {
    let value = product();
    while (peek() === "+" || peek() === "-") {
      const op = tokens[cursor++],
        right = product();
      value = op === "+" ? value.add(right) : value.subtract(right);
    }
    return value;
  };
  const result = sum();
  if (cursor !== tokens.length) invalid("Unexpected Payroll formula token.");
  return result;
}
export type PayrollCalculationComponent = {
  id: string;
  code: string;
  name: string;
  kind: "earning" | "deduction";
  method: "fixed" | "formula";
  amount: string | null;
  formula: string | null;
  prorated: boolean;
  expense_account_id: string | null;
  liability_account_id: string | null;
};
export type PayrollCalculationSalary = {
  id: string;
  effective_from: string;
  effective_to: string | null;
  currency_code: string;
  compensation_type: string;
  payment_basis: string;
  components: PayrollCalculationComponent[];
};
export type PayrollCalculationDay = { on_date: string; paid_days: string; unpaid_days: string };
export type PayrollCalculationLine = {
  component_id: string;
  component_code: string;
  component_name: string;
  kind: "earning" | "deduction" | "employer_contribution";
  amount: string;
  expense_account_id: string | null;
  liability_account_id: string | null;
  source: string;
};
export function calculateMonthlyPayroll(input: {
  days: PayrollCalculationDay[];
  salaries: PayrollCalculationSalary[];
  month: string;
  currency_code: string;
  money_scale: number;
  rounding: PayrollRounding;
}) {
  if (!/^\d{4}-\d{2}-01$/.test(input.month) || !input.days.length)
    invalid("A Payroll month and frozen attendance days are required.");
  const monthEnd = new Date(Date.UTC(Number(input.month.slice(0, 4)), Number(input.month.slice(5, 7)), 0)),
    calendarDays = monthEnd.getUTCDate();
  const groups = new Map<string, { salary: PayrollCalculationSalary; days: PayrollCalculationDay[] }>(),
    seen = new Set<string>();
  for (const day of input.days) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(day.on_date) ||
      day.on_date.slice(0, 7) !== input.month.slice(0, 7) ||
      Number(day.on_date.slice(8)) < 1 ||
      Number(day.on_date.slice(8)) > calendarDays ||
      seen.has(day.on_date)
    )
      invalid("Frozen attendance contains an invalid, duplicate or foreign-period day.");
    seen.add(day.on_date);
    const paid = ExactPayrollAmount.parse(day.paid_days),
      unpaid = ExactPayrollAmount.parse(day.unpaid_days);
    if (
      paid.compare(new ExactPayrollAmount(0n)) < 0 ||
      unpaid.compare(new ExactPayrollAmount(0n)) < 0 ||
      paid.add(unpaid).compare(new ExactPayrollAmount(1n)) !== 0
    )
      invalid("Every attendance day must reconcile exactly to one day.");
    const matches = input.salaries.filter(
      (s) => s.effective_from <= day.on_date && (!s.effective_to || s.effective_to >= day.on_date),
    );
    if (matches.length !== 1) invalid("Each frozen attendance day needs exactly one approved salary assignment.");
    const salary = matches[0]!;
    if (
      salary.currency_code !== input.currency_code ||
      salary.payment_basis !== "monthly" ||
      salary.compensation_type !== "fixed"
    )
      invalid("This monthly calculation requires matching-currency fixed monthly salary authority.");
    const group = groups.get(salary.id) ?? { salary, days: [] };
    group.days.push(day);
    groups.set(salary.id, group);
  }
  const lines: PayrollCalculationLine[] = [],
    segments = [];
  let gross = new ExactPayrollAmount(0n),
    deductions = new ExactPayrollAmount(0n);
  for (const { salary, days } of [...groups.values()].sort((a, b) =>
    a.salary.effective_from.localeCompare(b.salary.effective_from),
  )) {
    let segmentGross = new ExactPayrollAmount(0n),
      segmentDeductions = new ExactPayrollAmount(0n);
    const paid = days.reduce(
        (total, d) => total.add(ExactPayrollAmount.parse(d.paid_days)),
        new ExactPayrollAmount(0n),
      ),
      unpaid = new ExactPayrollAmount(BigInt(days.length)).subtract(paid),
      variables: Record<string, ExactPayrollAmount> = {
        PAID_DAYS: paid,
        UNPAID_DAYS: unpaid,
        CALENDAR_DAYS: new ExactPayrollAmount(BigInt(calendarDays)),
      },
      segmentLines: PayrollCalculationLine[] = [];
    const components = new Set<string>();
    if (!salary.components.length) invalid("The approved salary snapshot is missing its components.");
    for (const component of salary.components) {
      if (components.has(component.id) || Object.hasOwn(variables, component.code))
        invalid("Salary components or variable names are duplicated.");
      components.add(component.id);
      const raw =
        component.method === "fixed"
          ? component.amount !== null && component.formula === null
            ? ExactPayrollAmount.parse(component.amount)
            : invalid("A fixed salary component needs an amount.")
          : component.formula !== null && component.amount === null
            ? evaluatePayrollFormula(component.formula, variables)
            : invalid("A formula salary component needs a formula.");
      if (raw.compare(new ExactPayrollAmount(0n)) < 0) invalid("Salary components cannot produce negative amounts.");
      variables[component.code] = raw;
      const amount = raw
          .multiply(component.prorated ? paid : new ExactPayrollAmount(BigInt(days.length)))
          .divide(new ExactPayrollAmount(BigInt(calendarDays)))
          .decimal(input.money_scale, input.rounding),
        rounded = ExactPayrollAmount.parse(amount);
      if (component.kind === "earning") {
        if (!component.expense_account_id) invalid("An earning component needs an expense account.");
        segmentGross = segmentGross.add(rounded);
      } else {
        if (!component.liability_account_id) invalid("A deduction component needs a liability account.");
        segmentDeductions = segmentDeductions.add(rounded);
      }
      const line = {
        component_id: component.id,
        component_code: component.code,
        component_name: component.name,
        kind: component.kind,
        amount,
        expense_account_id: component.expense_account_id,
        liability_account_id: component.liability_account_id,
        source: "salary:" + salary.id,
      };
      lines.push(line);
      segmentLines.push(line);
    }
    gross = gross.add(segmentGross);
    deductions = deductions.add(segmentDeductions);
    segments.push({
      salary_assignment_id: salary.id,
      effective_from: days.map((d) => d.on_date).sort()[0]!,
      effective_to: days
        .map((d) => d.on_date)
        .sort()
        .at(-1)!,
      paid_days: paid.decimal(4),
      period_calendar_days: String(calendarDays),
      gross: segmentGross.decimal(input.money_scale),
      deductions: segmentDeductions.decimal(input.money_scale),
      net: segmentGross.subtract(segmentDeductions).decimal(input.money_scale),
      components: segmentLines,
    });
  }
  if (gross.compare(deductions) < 0) invalid("Payroll deductions exceed gross earnings.");
  return {
    engine_version: "monthly_fixed_v1",
    rounding_stage: "salary_segment_component",
    currency_code: input.currency_code,
    gross: gross.decimal(input.money_scale),
    deductions: deductions.decimal(input.money_scale),
    net: gross.subtract(deductions).decimal(input.money_scale),
    lines,
    segments,
  };
}
