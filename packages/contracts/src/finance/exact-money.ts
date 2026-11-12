/** Exact, bounded decimal arithmetic shared by API calculations and their clients. */
export function decimal(value: string, scale: number, signed = false): bigint {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error("Invalid decimal scale.");
  const match = /^(?<sign>-?)(?<whole>0|[1-9]\d{0,29})(?:\.(?<fraction>\d+))?$/.exec(value);
  if (!match?.groups || (!signed && match.groups.sign) || (match.groups.fraction?.length ?? 0) > scale)
    throw new Error(`Enter a decimal with at most ${scale} decimal places.`);
  const magnitude =
    BigInt(match.groups.whole!) * 10n ** BigInt(scale) + BigInt((match.groups.fraction ?? "").padEnd(scale, "0"));
  return match.groups.sign ? -magnitude : magnitude;
}

export function decimalText(value: bigint, scale: number): string {
  if (!Number.isInteger(scale) || scale < 0 || scale > 18) throw new Error("Invalid decimal scale.");
  const magnitude = value < 0n ? -value : value;
  const digits = magnitude.toString().padStart(scale + 1, "0");
  return `${value < 0n ? "-" : ""}${scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits}`;
}

/** Half away from zero. Used only at a currency boundary, never through Number. */
export function divideRounded(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new Error("A positive denominator is required.");
  const magnitude = numerator < 0n ? -numerator : numerator;
  const rounded = (magnitude + denominator / 2n) / denominator;
  return numerator < 0n ? -rounded : rounded;
}

export function convertMinor(amount: bigint, sourceScale: number, rate: string, targetScale: number): bigint {
  const parsedRate = decimal(rate, 18);
  if (parsedRate <= 0n) throw new Error("The exchange rate must be greater than zero.");
  return divideRounded(amount * parsedRate * 10n ** BigInt(targetScale), 10n ** BigInt(sourceScale + 18));
}

export function proportionalMinor(carrying: bigint, cleared: bigint, remaining: bigint): bigint {
  if (cleared <= 0n || remaining <= 0n || cleared > remaining)
    throw new Error("Allocation exceeds the outstanding balance.");
  return cleared === remaining ? carrying : divideRounded(carrying * cleared, remaining);
}

export function absolute(value: bigint): bigint {
  return value < 0n ? -value : value;
}
