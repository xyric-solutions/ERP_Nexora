/** Formatting and date helpers for the sales prototype. */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;
const pad2 = (value: number) => String(value).padStart(2, "0");

export function money(value: number): string {
  return `PKR ${(Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function moneyWhole(value: number): string {
  return `PKR ${Math.round(Number(value) || 0).toLocaleString("en-US")}`;
}

export function figure(value: number): string {
  return (Number(value) || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function formatDate(iso: string | undefined): string {
  if (!iso) return "—";
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return `${pad2(day)} ${MONTHS[month - 1]} ${year}`;
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
}

export function addDays(iso: string, days: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function addMonths(iso: string, months: number): string {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1 + months, day)).toISOString().slice(0, 10);
}

/** Activity timestamp, e.g. "10 Nov 2026, 14:05". */
export function stamp(): string {
  const now = new Date();
  return `${pad2(now.getDate())} ${MONTHS[now.getMonth()]} ${now.getFullYear()}, ${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve",
  "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function underThousand(value: number): string {
  const parts: string[] = [];
  let rest = value;
  if (rest >= 100) {
    parts.push(`${ONES[Math.floor(rest / 100)]} Hundred`);
    rest %= 100;
  }
  if (rest >= 20) parts.push(TENS[Math.floor(rest / 10)] + (rest % 10 ? `-${ONES[rest % 10]}` : ""));
  else if (rest > 0) parts.push(ONES[rest]);
  return parts.join(" ");
}

/** Same wording as the commerce document template: "PKR ... only". */
export function amountInWords(value: number): string {
  const whole = Math.floor(Math.abs(value) + 1e-9);
  const paisa = Math.round((Math.abs(value) - whole) * 100);
  let rest = whole;
  const parts: string[] = [];
  for (const [size, name] of [[1e9, "Billion"], [1e6, "Million"], [1e3, "Thousand"]] as const) {
    if (rest >= size) {
      parts.push(`${underThousand(Math.floor(rest / size))} ${name}`);
      rest %= size;
    }
  }
  if (rest > 0) parts.push(underThousand(rest));
  return `PKR ${parts.join(" ") || "Zero"}${paisa ? ` and ${underThousand(paisa)} Paisa` : ""} only`;
}
