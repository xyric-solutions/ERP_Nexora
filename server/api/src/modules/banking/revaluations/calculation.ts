const amountScale = 8;
const rateScale = 18;
const amountIntegerDigits = 30;
const rateIntegerDigits = 20;

export type BankRevaluationDirection = "gain" | "loss" | "none";

export interface BankRevaluationCalculationInput {
  foreignBalance: string;
  carryingBaseBalance: string;
  closingRate: string;
  baseDecimalPlaces: number;
}

export interface BankRevaluationCalculation {
  revaluedBaseBalance: string;
  adjustment: string;
  direction: BankRevaluationDirection;
}

export interface BankRevaluationPortfolioInput {
  lines: ReadonlyArray<Pick<BankRevaluationCalculationInput, "foreignBalance" | "carryingBaseBalance">>;
  closingRate: string;
  baseDecimalPlaces: number;
}

export interface BankRevaluationPortfolioCalculation {
  lines: ReadonlyArray<BankRevaluationCalculation>;
  totals: {
    foreignBalance: string;
    carryingBaseBalance: string;
    revaluedBaseBalance: string;
    totalGain: string;
    totalLoss: string;
    netGainLoss: string;
  };
}

function power10(value: number): bigint {
  return 10n ** BigInt(value);
}

function parseDecimal(
  value: string,
  options: { scale: number; integerDigits: number; signed: boolean; positive?: boolean },
): bigint {
  const expression = options.signed ? /^(-?)(0|[1-9]\d*)(?:\.(\d+))?$/ : /^(0|[1-9]\d*)(?:\.(\d+))?$/;
  const match = expression.exec(value);
  if (!match) throw new Error("Bank Revaluation decimal value is invalid.");
  const signText = options.signed ? match[1]! : "";
  const integer = options.signed ? match[2]! : match[1]!;
  const fraction = (options.signed ? match[3] : match[2]) ?? "";
  if (integer.length > options.integerDigits || fraction.length > options.scale)
    throw new Error("Bank Revaluation decimal value exceeds the supported precision.");
  const magnitude = BigInt(integer) * power10(options.scale) + BigInt(fraction.padEnd(options.scale, "0"));
  if (options.positive && magnitude === 0n) throw new Error("Bank Revaluation closing rate must be greater than zero.");
  return signText === "-" ? -magnitude : magnitude;
}

function roundScaled(value: bigint, fromScale: number, toScale: number): bigint {
  if (toScale > fromScale) return value * power10(toScale - fromScale);
  if (toScale === fromScale) return value;
  const divisor = power10(fromScale - toScale);
  const magnitude = value < 0n ? -value : value;
  const rounded = (magnitude + divisor / 2n) / divisor;
  return value < 0n ? -rounded : rounded;
}

function formatScaled(value: bigint, scale: number): string {
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  const digits = magnitude.toString().padStart(scale + 1, "0");
  const rendered = scale === 0 ? digits : `${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
  return negative && magnitude !== 0n ? `-${rendered}` : rendered;
}

function requireBaseDecimalPlaces(value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > amountScale)
    throw new Error("Bank Revaluation base decimal places must be an integer from zero through eight.");
}

function direction(value: bigint): BankRevaluationDirection {
  return value > 0n ? "gain" : value < 0n ? "loss" : "none";
}

export function calculateBankRevaluation(input: BankRevaluationCalculationInput): BankRevaluationCalculation {
  requireBaseDecimalPlaces(input.baseDecimalPlaces);
  const foreignBalance = parseDecimal(input.foreignBalance, {
    scale: amountScale,
    integerDigits: amountIntegerDigits,
    signed: true,
  });
  const carryingBaseBalanceAtAmountScale = parseDecimal(input.carryingBaseBalance, {
    scale: amountScale,
    integerDigits: amountIntegerDigits,
    signed: true,
  });
  const closingRate = parseDecimal(input.closingRate, {
    scale: rateScale,
    integerDigits: rateIntegerDigits,
    signed: false,
    positive: true,
  });
  const revaluedMinorUnits = roundScaled(
    foreignBalance * closingRate,
    amountScale + rateScale,
    input.baseDecimalPlaces,
  );
  const carryingMinorUnits = roundScaled(carryingBaseBalanceAtAmountScale, amountScale, input.baseDecimalPlaces);
  const adjustmentMinorUnits = revaluedMinorUnits - carryingMinorUnits;
  return {
    revaluedBaseBalance: formatScaled(revaluedMinorUnits, input.baseDecimalPlaces),
    adjustment: formatScaled(adjustmentMinorUnits, input.baseDecimalPlaces),
    direction: direction(adjustmentMinorUnits),
  };
}

export function calculateBankRevaluationPortfolio(
  input: BankRevaluationPortfolioInput,
): BankRevaluationPortfolioCalculation {
  requireBaseDecimalPlaces(input.baseDecimalPlaces);
  const calculated = input.lines.map((line) =>
    calculateBankRevaluation({ ...line, closingRate: input.closingRate, baseDecimalPlaces: input.baseDecimalPlaces }),
  );
  const foreignTotal = input.lines.reduce(
    (total, line) =>
      total +
      parseDecimal(line.foreignBalance, { scale: amountScale, integerDigits: amountIntegerDigits, signed: true }),
    0n,
  );
  const carryingTotal = input.lines.reduce(
    (total, line) =>
      total +
      roundScaled(
        parseDecimal(line.carryingBaseBalance, {
          scale: amountScale,
          integerDigits: amountIntegerDigits,
          signed: true,
        }),
        amountScale,
        input.baseDecimalPlaces,
      ),
    0n,
  );
  const revaluedTotal = calculated.reduce(
    (total, line) =>
      total +
      parseDecimal(line.revaluedBaseBalance, {
        scale: input.baseDecimalPlaces,
        integerDigits: amountIntegerDigits,
        signed: true,
      }),
    0n,
  );
  const adjustmentValues = calculated.map((line) =>
    parseDecimal(line.adjustment, {
      scale: input.baseDecimalPlaces,
      integerDigits: amountIntegerDigits,
      signed: true,
    }),
  );
  const totalGain = adjustmentValues.reduce((total, value) => total + (value > 0n ? value : 0n), 0n);
  const totalLoss = adjustmentValues.reduce((total, value) => total + (value < 0n ? -value : 0n), 0n);
  return {
    lines: calculated,
    totals: {
      foreignBalance: formatScaled(foreignTotal, amountScale),
      carryingBaseBalance: formatScaled(carryingTotal, input.baseDecimalPlaces),
      revaluedBaseBalance: formatScaled(revaluedTotal, input.baseDecimalPlaces),
      totalGain: formatScaled(totalGain, input.baseDecimalPlaces),
      totalLoss: formatScaled(totalLoss, input.baseDecimalPlaces),
      netGainLoss: formatScaled(totalGain - totalLoss, input.baseDecimalPlaces),
    },
  };
}
