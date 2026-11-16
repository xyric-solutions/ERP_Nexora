import { decimal, decimalText, divideRounded, type FixedAsset, type AssetValuation } from "@nexora/contracts";

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
export function assetLifeEnd(asset: FixedAsset): string {
  const month = new Date(
    Date.UTC(
      Number(asset.depreciation_start.slice(0, 4)),
      Number(asset.depreciation_start.slice(5, 7)) - 1 + asset.useful_life_months,
      1,
    ),
  );
  const finalDay = Number(monthEnd(month.toISOString().slice(0, 10)).slice(8, 10));
  month.setUTCDate(Math.min(Number(asset.depreciation_start.slice(8, 10)), finalDay));
  month.setUTCDate(month.getUTCDate() - 1);
  return month.toISOString().slice(0, 10);
}
const dayMilliseconds = 86400000;
const dayCount = (start: string, end: string) =>
  BigInt(Math.round((Date.parse(end + "T00:00:00Z") - Date.parse(start + "T00:00:00Z")) / dayMilliseconds) + 1);
const yearDays = (year: number) => BigInt((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / dayMilliseconds);
// 365 * 366 is a common denominator: exact calendar-year fractions, no floating money.
function actualWeight(start: string, end: string): bigint {
  if (end < start) return 0n;
  let total = 0n,
    cursor = start;
  while (cursor <= end) {
    const year = Number(cursor.slice(0, 4)),
      last = `${year}-12-31`,
      cutoff = last < end ? last : end;
    total += dayCount(cursor, cutoff) * (133590n / yearDays(year));
    cursor = nextDay(cutoff);
  }
  return total;
}
/** Cumulative entitlement from a stable, database-maintained financial-effect basis. */
export function dailyEntitlement(asset: FixedAsset, asOf: string): bigint {
  const dp = asset.decimal_places,
    basis = asset.accrual_basis;
  const start = basis?.start ?? asset.depreciation_start,
    end = assetLifeEnd(asset);
  if (asOf < start) return 0n;
  const opening = minor(basis?.opening_carrying ?? money(minor(asset.cost, dp) - minor(asset.impairment, dp), dp), dp);
  const available = opening - minor(asset.residual_value, dp);
  if (available <= 0n) return 0n;
  if (asOf >= end) return available;
  if (asset.method === "straight_line")
    return divideRounded(available * actualWeight(start, asOf), actualWeight(start, end));
  const precision = 10n ** 18n;
  let carrying = opening * precision,
    cursor = start;
  const rate =
    asset.method === "double_declining"
      ? 24000000n / BigInt(asset.useful_life_months) > 1000000n
        ? 1000000n
        : divideRounded(24000000n, BigInt(asset.useful_life_months))
      : decimal(asset.annual_rate_percent.toFixed(4), 4);
  while (cursor <= asOf) {
    const year = Number(cursor.slice(0, 4)),
      endYear = `${year}-12-31`,
      cutoff = endYear < asOf ? endYear : asOf;
    carrying -= (carrying * rate * dayCount(cursor, cutoff)) / (1000000n * yearDays(year));
    cursor = nextDay(cutoff);
  }
  const depreciation = divideRounded(opening * precision - carrying, precision);
  return depreciation > available ? available : depreciation;
}
export function assetValuation(asset: FixedAsset, asOf: string): AssetValuation {
  const dp = asset.decimal_places,
    posted = minor(asset.accumulated_depreciation, dp),
    end = assetLifeEnd(asset);
  const daily = asset.category.calculation_basis === "actual_actual" || asset.method === "double_declining";
  const eligible = ["active", "fully_depreciated"].includes(asset.status),
    terminal = ["returned", "disposed"].includes(asset.status);
  const projected =
    daily && eligible
      ? dailyEntitlement(asset, asOf) + minor(asset.accrual_basis?.opening_accumulated ?? "0", dp)
      : posted;
  const calculated = projected < posted ? posted : projected;
  const previous = new Date(asOf + "T00:00:00Z");
  previous.setUTCDate(previous.getUTCDate() - 1);
  const charge =
    daily && eligible
      ? dailyEntitlement(asset, asOf) - dailyEntitlement(asset, previous.toISOString().slice(0, 10))
      : 0n;
  const carrying = terminal ? 0n : minor(asset.cost, dp) - minor(asset.impairment, dp) - calculated;
  const remaining = carrying - minor(asset.residual_value, dp);
  return {
    asset_id: asset.id,
    as_of: asOf,
    basis: daily ? "actual_actual" : "legacy_monthly",
    daily_depreciation: money(charge < 0n ? 0n : charge, dp),
    calculated_depreciation: money(calculated, dp),
    posted_depreciation: money(posted, dp),
    unposted_accrual: money(calculated - posted, dp),
    projected_net_book_value: money(carrying < 0n ? 0n : carrying, dp),
    remaining_depreciable_value: money(remaining < 0n ? 0n : remaining, dp),
    age_days: asOf < asset.acquisition_date ? 0 : Number(dayCount(asset.acquisition_date, asOf) - 1n),
    remaining_life_days: asOf >= end ? 0 : Number(dayCount(nextDay(asOf), end)),
    useful_life_end: end,
  };
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
  const daily = asset.category.calculation_basis === "actual_actual" || asset.method === "double_declining";
  if (start > expected) {
    const beforeStart = new Date(start + "T00:00:00Z");
    beforeStart.setUTCDate(beforeStart.getUTCDate() - 1);
    const precedingIsZero =
      daily &&
      dailyEntitlement(asset, beforeStart.toISOString().slice(0, 10)) +
        minor(asset.accrual_basis?.opening_accumulated ?? "0", dp) ===
        accumulated;
    if (!precedingIsZero) return skip("Post the preceding depreciation period first.");
  }
  const available = carrying - residual;
  if (available <= 0n) return skip("The residual floor has been reached.");
  const anniversary = new Date(`${monthStart(asset.depreciation_start)}T00:00:00Z`);
  anniversary.setUTCMonth(anniversary.getUTCMonth() + asset.useful_life_months);
  const lastDay = Number(monthEnd(anniversary.toISOString().slice(0, 10)).slice(8, 10));
  anniversary.setUTCDate(Math.min(Number(asset.depreciation_start.slice(8, 10)), lastDay));
  anniversary.setUTCDate(anniversary.getUTCDate() - 1);
  const lifeEnd = daily
    ? assetLifeEnd(asset)
    : asset.category.convention === "actual_days"
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
  start = [start, expected, asset.depreciation_start, asset.accrual_basis?.start ?? asset.depreciation_start]
    .sort()
    .at(-1)!;
  end = end < lifeEnd ? end : lifeEnd;
  if (start > end) return skip("The useful life has ended.");
  const remaining = Math.max(1, monthsBetween(start, lifeEnd) + 1),
    days = BigInt(Number(monthEnd(start).slice(8, 10))),
    span = BigInt(Number(end.slice(8, 10)) - Number(start.slice(8, 10)) + 1),
    actualDays = asset.category.convention === "actual_days";
  let amount: bigint;
  if (daily) {
    const openingAccumulated = minor(asset.accrual_basis?.opening_accumulated ?? "0", dp);
    amount = dailyEntitlement(asset, end) + openingAccumulated - accumulated;
  } else if (asset.method === "straight_line" && actualDays) {
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
