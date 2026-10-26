import { describe, expect, it } from "vitest";

type CalculateBankRevaluation = (input: {
  foreignBalance: string;
  carryingBaseBalance: string;
  closingRate: string;
  baseDecimalPlaces: number;
}) => {
  revaluedBaseBalance: string;
  adjustment: string;
  direction: "gain" | "loss" | "none";
};

type CalculateBankRevaluationPortfolio = (input: {
  lines: ReadonlyArray<{
    foreignBalance: string;
    carryingBaseBalance: string;
  }>;
  closingRate: string;
  baseDecimalPlaces: number;
}) => {
  lines: ReadonlyArray<ReturnType<CalculateBankRevaluation>>;
  totals: {
    foreignBalance: string;
    carryingBaseBalance: string;
    revaluedBaseBalance: string;
    totalGain: string;
    totalLoss: string;
    netGainLoss: string;
  };
};

async function calculation(): Promise<CalculateBankRevaluation> {
  const modulePath = "../../server/api/src/modules/banking/revaluations/calculation.js";
  const calculationModule = (await import(modulePath)) as {
    calculateBankRevaluation?: CalculateBankRevaluation;
  };
  if (!calculationModule.calculateBankRevaluation) throw new Error("calculateBankRevaluation must be exported");
  return calculationModule.calculateBankRevaluation;
}

async function portfolioCalculation(): Promise<CalculateBankRevaluationPortfolio> {
  const modulePath = "../../server/api/src/modules/banking/revaluations/calculation.js";
  const calculationModule = (await import(modulePath)) as {
    calculateBankRevaluationPortfolio?: CalculateBankRevaluationPortfolio;
  };
  if (!calculationModule.calculateBankRevaluationPortfolio)
    throw new Error("calculateBankRevaluationPortfolio must be exported");
  return calculationModule.calculateBankRevaluationPortfolio;
}

describe("Bank Revaluation calculation", () => {
  it("calculates gains and losses in the company base currency without binary-float drift", async () => {
    const calculate = await calculation();

    expect(
      calculate({
        foreignBalance: "1000.00",
        carryingBaseBalance: "275000.00",
        closingRate: "277.000000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "277000.00", adjustment: "2000.00", direction: "gain" });

    expect(
      calculate({
        foreignBalance: "1000.00",
        carryingBaseBalance: "275000.00",
        closingRate: "273.000000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "273000.00", adjustment: "-2000.00", direction: "loss" });
  });

  it("derives the sign-correct result for an overdraft and recognizes zero adjustment", async () => {
    const calculate = await calculation();

    expect(
      calculate({
        foreignBalance: "-1000.00",
        carryingBaseBalance: "-275000.00",
        closingRate: "277.000000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "-277000.00", adjustment: "-2000.00", direction: "loss" });

    expect(
      calculate({
        foreignBalance: "1000.00",
        carryingBaseBalance: "275000.00",
        closingRate: "275.000000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "275000.00", adjustment: "0.00", direction: "none" });
  });

  it("rounds once at the configured base-currency boundary, including negative half values", async () => {
    const calculate = await calculation();

    expect(
      calculate({
        foreignBalance: "1.00",
        carryingBaseBalance: "0.00",
        closingRate: "1.005000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "1.01", adjustment: "1.01", direction: "gain" });
    expect(
      calculate({
        foreignBalance: "-1.00",
        carryingBaseBalance: "0.00",
        closingRate: "1.005000000000000000",
        baseDecimalPlaces: 2,
      }),
    ).toEqual({ revaluedBaseBalance: "-1.01", adjustment: "-1.01", direction: "loss" });
  });

  it("aggregates multiple accounts after line-level currency rounding", async () => {
    const calculate = await portfolioCalculation();

    expect(
      calculate({
        closingRate: "2.345000000000000000",
        baseDecimalPlaces: 2,
        lines: [
          { foreignBalance: "10.00", carryingBaseBalance: "20.00" },
          { foreignBalance: "-2.00", carryingBaseBalance: "-4.00" },
          { foreignBalance: "0.00", carryingBaseBalance: "0.00" },
        ],
      }),
    ).toEqual({
      lines: [
        { revaluedBaseBalance: "23.45", adjustment: "3.45", direction: "gain" },
        { revaluedBaseBalance: "-4.69", adjustment: "-0.69", direction: "loss" },
        { revaluedBaseBalance: "0.00", adjustment: "0.00", direction: "none" },
      ],
      totals: {
        foreignBalance: "8.00000000",
        carryingBaseBalance: "16.00",
        revaluedBaseBalance: "18.76",
        totalGain: "3.45",
        totalLoss: "0.69",
        netGainLoss: "2.76",
      },
    });
  });

  it("rejects malformed, over-precision, non-positive-rate and unsupported-scale inputs", async () => {
    const calculate = await calculation();

    expect(() =>
      calculate({
        foreignBalance: "1.000000001",
        carryingBaseBalance: "0",
        closingRate: "1",
        baseDecimalPlaces: 2,
      }),
    ).toThrow(/precision/i);
    expect(() =>
      calculate({ foreignBalance: "1", carryingBaseBalance: "0", closingRate: "0", baseDecimalPlaces: 2 }),
    ).toThrow(/greater than zero/i);
    expect(() =>
      calculate({ foreignBalance: "1", carryingBaseBalance: "0", closingRate: "1", baseDecimalPlaces: 9 }),
    ).toThrow(/decimal places/i);
  });
});
