import { decimal, decimalText, divideRounded, type FixedAsset } from "@nexora/contracts";

export function minor(value: string, places: number): bigint {
  const full = decimal(value, 8, true),
    divisor = 10n ** BigInt(8 - places);
  if (full % divisor !== 0n) throw new RangeError("The amount exceeds company currency precision.");
  return full / divisor;
}
export const money = decimalText;
export function monthStart(date: string) {
  return `${date.slice(0, 7)}-01`;
}
export function monthEnd(date: string) {
  const d = new Date(`${monthStart(date)}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return d.toISOString().slice(0, 10);
}
export function nextDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
function monthsBetween(start: string, end: string) {
  return (
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 + Number(end.slice(5, 7)) - Number(start.slice(5, 7))
  );
}
export function depreciationForPeriod(asset: FixedAsset, start: string, end: string) {
  const dp = asset.decimal_places,
    cost = minor(asset.cost, dp),
    accumulated = minor(asset.accumulated_depreciation, dp),
    impairment = minor(asset.impairment, dp),
    residual = minor(asset.residual_value, dp),
    carrying = cost - accumulated - impairment;
  const skip = (reason: string) => ({
    start,
    end,
    asset_id: asset.id,
    asset_version: asset.version,
    code: asset.code,
    amount: money(0n, dp),
    opening_carrying: money(carrying, dp),
    closing_carrying: money(carrying, dp),
    previous_end: asset.last_depreciation_end,
    skip_reason: reason,
  });
  if (asset.status !== "active") return skip(`Asset is ${asset.status.replaceAll("_", " ")}.`);
  if (end < asset.depreciation_start) return skip("Depreciation has not commenced.");
  if (asset.last_financial_date > end)
    return skip("A later financial lifecycle effect exists; earlier depreciation cannot be inserted retroactively.");
  if (asset.last_depreciation_end && end <= asset.last_depreciation_end)
    return skip("Period has already been depreciated.");
  const expected = asset.last_depreciation_end
    ? nextDay(asset.last_depreciation_end)
    : monthStart(asset.depreciation_start);
  if (start > expected) return skip("Post the preceding depreciation period first.");
  const available = carrying - residual;
  if (available <= 0n) return skip("The residual floor has been reached.");
  const anniversary = new Date(`${monthStart(asset.depreciation_start)}T00:00:00Z`);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + asset.useful_life_months);
  const lastDay = Number(monthEnd(anniversary.toISOString().slice(0, 10)).slice(8, 10));
  anniversary.setUTCDate(Math.min(Number(asset.depreciation_start.slice(8, 10)), lastDay));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  const lifeEnd =
    asset.category.convention === "actual_days"
      ? anniversary.toISOString().slice(0, 10)
      : monthEnd(
          new Date(
            Date.UTC(
              Number(asset.depreciation_start.slice(0, 4)),
              Number(asset.depreciation_start.slice(5, 7)) - 1 + asset.useful_life_months - 1,
              1,
            ),
          )
            .toISOString()
            .slice(0, 10),
        );
  start = [start, expected, asset.depreciation_start].sort().at(-1)!;
  end = end < lifeEnd ? end : lifeEnd;
  if (start > end) return skip("The useful life has ended.");
  const remaining = Math.max(1, monthsBetween(start, lifeEnd) + 1),
    days = BigInt(Number(monthEnd(start).slice(8, 10))),
    span = BigInt(Number(end.slice(8, 10)) - Number(start.slice(8, 10)) + 1),
    actualDays = asset.category.convention === "actual_days";
  let amount: bigint;
  if (asset.method === "straight_line" && actualDays) {
    // Remaining calendar-month fractions preserve the original anniversary while
    // applying improvements and impairments prospectively to the remaining life.
    const finalDays = BigInt(Number(monthEnd(lifeEnd).slice(8, 10))),
      remainingWeight =
        remaining === 1
          ? BigInt(Number(lifeEnd.slice(8, 10)) - Number(start.slice(8, 10)) + 1) * finalDays
          : (days - BigInt(Number(start.slice(8, 10))) + 1n) * finalDays +
            BigInt(remaining - 2) * days * finalDays +
            BigInt(Number(lifeEnd.slice(8, 10))) * days;
    amount = divideRounded(available * span * finalDays, remainingWeight);
  } else if (asset.method === "straight_line") {
    amount = divideRounded(available, BigInt(remaining));
  } else {
    amount = divideRounded(
      carrying * decimal(asset.annual_rate_percent.toFixed(4), 4) * (actualDays ? span : 1n),
      12n * 100n * 10000n * (actualDays ? days : 1n),
    );
  }
  if (end === lifeEnd) amount = available;
  if (amount > available) amount = available;
  if (amount <= 0n) return skip("Depreciation rounds to zero at the company currency precision.");
  return {
    start,
    end,
    asset_id: asset.id,
    asset_version: asset.version,
    code: asset.code,
    amount: money(amount, dp),
    opening_carrying: money(carrying, dp),
    closing_carrying: money(carrying - amount, dp),
    previous_end: asset.last_depreciation_end,
    skip_reason: null,
  };
}
