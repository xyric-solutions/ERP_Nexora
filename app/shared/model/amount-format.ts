/**
 * Thousands-separator helpers for money entry fields.
 *
 * A "raw" amount is the canonical, unformatted string a field emits
 * (e.g. "-1234567.5"). The display form groups the integer part in threes
 * ("-1,234,567.5"). Parsing accepts either form.
 */

export interface AmountFormatOptions {
  /** Maximum fraction digits accepted while typing. 0 disables the decimal point. */
  decimals?: number;
  /** Accept a leading minus sign. */
  allowNegative?: boolean;
}

/** Turns any typed or pasted text into a canonical raw amount string. */
export function normalizeAmount(input: string, { decimals = 2, allowNegative = false }: AmountFormatOptions = {}): string {
  const text = String(input ?? "").trim();
  const negative = allowNegative && text.startsWith("-");
  const cleaned = text.replace(/[^0-9.]/g, "");
  const dot = decimals > 0 ? cleaned.indexOf(".") : -1;
  let whole = (dot === -1 ? cleaned : cleaned.slice(0, dot)).replace(/\./g, "");
  const fraction = dot === -1 ? "" : cleaned.slice(dot + 1).replace(/\./g, "").slice(0, decimals);
  whole = whole.replace(/^0+(?=\d)/, "");
  if (dot !== -1 && whole === "") whole = "0";
  const body = dot === -1 ? whole : `${whole}.${fraction}`;
  if (negative) return body ? `-${body}` : "-";
  return body;
}

/** "1234567.5" -> "1,234,567.5". Keeps a trailing "." or "-" so typing is not interrupted. */
export function groupAmount(raw: string): string {
  const sign = raw.startsWith("-") ? "-" : "";
  const body = sign ? raw.slice(1) : raw;
  const dot = body.indexOf(".");
  const whole = dot === -1 ? body : body.slice(0, dot);
  const rest = dot === -1 ? "" : body.slice(dot);
  return sign + whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + rest;
}

/** Number value of a raw or grouped amount; blanks and partial input ("-", ".") read as 0. */
export function parseAmount(value: string | number | null | undefined): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const parsed = Number(String(value ?? "").replace(/,/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Raw string for a value supplied by application state (number or string, possibly grouped). */
export function toRawAmount(value: string | number | null | undefined, options?: AmountFormatOptions): string {
  if (value === null || value === undefined || value === "") return "";
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "";
    // Avoid exponent notation and float noise such as 0.1 + 0.2.
    const digits = Math.max(options?.decimals ?? 2, 0);
    const fixed = value.toFixed(Math.min(digits, 20));
    const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
    return normalizeAmount(trimmed, { ...options, allowNegative: true });
  }
  return normalizeAmount(value, { ...options, allowNegative: true });
}

/** Display text for a stored value, e.g. 1000000 -> "1,000,000". */
export function formatAmountInput(value: string | number | null | undefined, options?: AmountFormatOptions): string {
  return groupAmount(toRawAmount(value, options));
}
